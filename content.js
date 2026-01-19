(function () {
  'use strict';

  let comineIconSvg = null;
  let menuCleanup = null;
  let isConfigLoaded = false;
  let config = { injectButtons: true };

  const ICON_OPEN = `<path d="M15.578 3.382L17.578 4.432C19.729 5.561 20.805 6.125 21.403 7.14C22 8.154 22 9.417 22 11.942V12.059C22 14.583 22 15.846 21.403 16.86C20.805 17.875 19.729 18.44 17.578 19.569L15.578 20.618C13.822 21.539 12.944 22 12 22C11.056 22 10.178 21.54 8.422 20.618L6.422 19.568C4.271 18.439 3.195 17.875 2.597 16.86C2 15.846 2 14.583 2 12.06V11.943C2 9.418 2 8.155 2.597 7.141C3.195 6.126 4.271 5.561 6.422 4.433L8.422 3.383C10.178 2.461 11.056 2 12 2C12.944 2 13.822 2.46 15.578 3.382Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path opacity="0.5" d="M21 7.5L12 12M12 12L3 7.5M12 12V21.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
  const ICON_DOWNLOAD = `<path opacity="0.5" d="M17 9.002C19.175 9.014 20.353 9.111 21.121 9.879C22 10.758 22 12.172 22 15V16C22 18.829 22 20.243 21.121 21.122C20.243 22 18.828 22 16 22H8C5.172 22 3.757 22 2.879 21.122C2 20.242 2 18.829 2 16V15C2 12.172 2 10.758 2.879 9.879C3.647 9.111 4.825 9.014 7 9.002" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 2V15M12 15L9 11.5M12 15L15 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;

  // --- Utils ---

  function getYouTubeThumbnail(url) {
    try {
      if (!url) return null;
      const u = new URL(url);
      let id = u.searchParams.get('v');
      if (!id && u.hostname === 'youtu.be') id = u.pathname.slice(1);
      if (!id && u.pathname.includes('/shorts/')) id = u.pathname.split('/shorts/')[1]?.split('/')[0];
      if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    } catch {}
    return null;
  }

  function showNotification(msg, type) {
    document.querySelectorAll('.comine-notification').forEach(e => e.remove());
    const el = document.createElement('div');
    el.className = `comine-notification comine-notification-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    // Force reflow
    el.getBoundingClientRect();
    requestAnimationFrame(() => {
      el.classList.add('visible');
      setTimeout(() => {
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 300);
      }, 3000);
    });
  }

  // --- UI Components ---

  function closeMenu() {
    if (menuCleanup) {
        menuCleanup();
        menuCleanup = null;
    }
    document.querySelector('.comine-yt-menu')?.remove();
  }

  function openMenu(anchor, url, title) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'comine-yt-menu';
    menu.innerHTML = `
      <button class="comine-yt-menu-item" data-action="open">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">${ICON_OPEN}</svg>
        <div class="label-group">
            <span class="label">Open in Comine</span>
            <span class="sublabel">Paste link to app</span>
        </div>
      </button>
      <button class="comine-yt-menu-item" data-action="quick">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">${ICON_DOWNLOAD}</svg>
        <div class="label-group">
            <span class="label">Quick Download</span>
            <span class="sublabel">Download immediately</span>
        </div>
      </button>
    `;
    document.body.appendChild(menu);
    
    // Positioning logic
    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    
    let top = rect.bottom + 8;
    let left = rect.left;

    // Flip if bottom overflow
    if (top + menuRect.height > window.innerHeight - 10) {
        top = rect.top - 8 - menuRect.height;
    }
    // Shift if right overflow
    if (left + menuRect.width > window.innerWidth - 10) {
        left = window.innerWidth - 10 - menuRect.width;
    }

    menu.style.top = `${Math.max(10, top + window.scrollY)}px`;
    menu.style.left = `${Math.max(10, left + window.scrollX)}px`;

    const cleanup = () => { 
        document.removeEventListener('click', onClick, true); 
        document.removeEventListener('keydown', onKey, true); 
        document.removeEventListener('scroll', closeMenu, true);
        window.removeEventListener('resize', closeMenu);
    };

    const onClick = e => { 
        if (!menu.contains(e.target) && !anchor.contains(e.target)) { 
            closeMenu(); 
        } 
    };
    
    const onKey = e => { if (e.key === 'Escape') closeMenu(); };

    menuCleanup = cleanup;
    
    // Defer listeners to avoid immediate trigger
    setTimeout(() => { 
        document.addEventListener('click', onClick, true); 
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('scroll', closeMenu, true);
        window.addEventListener('resize', closeMenu);
    }, 50);

    menu.onclick = e => {
      const btn = e.target.closest('.comine-yt-menu-item');
      if (!btn) return;
      closeMenu();
      
      const payload = {
        type: 'DOWNLOAD',
        url,
        title: title || document.title || 'Unknown Media',
        thumbnail: getYouTubeThumbnail(url),
        openApp: btn.dataset.action === 'open'
      };

      chrome.runtime.sendMessage(payload)
        .then(r => showNotification(r?.success ? 'Sent to Comine!' : (r?.error || 'Failed'), r?.success ? 'success' : 'error'))
        .catch(() => showNotification('Could not connect to Comine extension', 'error'));
    };
  }

  // --- Start Global Menu Handler ---
  let activeMenuContext = null;

  function findContext(element) {
      // 1. Look for closest item renderer
      const entry = element.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer');
      if (!entry) return null;

      // 2. Extract URL and Title
      // Standard YT/YTM thumbnail/links
      let link = entry.querySelector('a#thumbnail');
      if (!link) link = entry.querySelector('a.yt-simple-endpoint[href*="watch"]'); // fallback
      if (!link) link = entry.querySelector('a[href*="/video/"]'); // YTM fallback
      
      let titleEl = entry.querySelector('#video-title');
      if (!titleEl) titleEl = entry.querySelector('.title, h3.title, .yt-simple-endpoint[title]');
      if (!titleEl && link) titleEl = link.querySelector('#video-title'); // Sometimes inside link

      if (link && (titleEl || link.title)) {
           return {
               url: link.href,
               title: (titleEl ? (titleEl.title || titleEl.textContent) : link.title).trim()
           };
      }
      return null;
  }

  // Monitor interaction to capture context
  const captureHandler = (e) => {
      const trigger = e.target.closest('ytd-menu-renderer, ytmusic-menu-renderer, button.yt-icon-button, yt-icon-button');
      if (trigger) {
          const context = findContext(trigger);
          if (context) {
              activeMenuContext = context;
              // Start polling for popup to appear
              pollForPopup();
          } else {
              activeMenuContext = null;
          }
      }
  };

  document.addEventListener('mousedown', captureHandler, true);
  document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') captureHandler(e);
  }, true);

  // Poll for popup (simpler than Observer for recycled nodes)
  function pollForPopup() {
      let attempts = 0;
      const interval = setInterval(() => {
          attempts++;
          if (attempts > 40) { // 2 seconds
              clearInterval(interval);
              return;
          }

          const popups = document.querySelectorAll('ytd-menu-popup-renderer, ytmusic-menu-popup-renderer, tp-yt-paper-listbox');
          let injected = false;
          for (const popup of popups) {
              if (popup.offsetWidth > 0 && popup.offsetHeight > 0) { // Visible
                  injectGlobalMenuItem(popup);
                  injected = true;
              }
          }
          // Note: don't clear interval immediately as DOM might repaint/clear listbox
      }, 50);
  }
  
  function injectGlobalMenuItem(popup) {
      if (!config.injectButtons) return;
      
      // Target listbox
      let listbox = popup;
      if (popup.tagName.toLowerCase() !== 'tp-yt-paper-listbox') {
          listbox = popup.querySelector('tp-yt-paper-listbox') || popup;
      }

      // Check if already injected
      if (listbox.querySelector('.comine-menu-group')) return;

      // Determine if it's YTM or YT based on parent or class
      const isYTM = location.hostname === 'music.youtube.com';

      const createItem = (label, action) => {
          const item = document.createElement('div');
          item.className = 'comine-menu-item' + (isYTM ? ' ytm' : '');
          item.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" class="style-scope ytd-menu-service-item-renderer">
                ${action === 'open' ? ICON_OPEN : ICON_DOWNLOAD}
            </svg>
            <span class="style-scope ytd-menu-service-item-renderer">${label}</span>
          `;
          item.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              // Simulate close
              document.body.click(); 
              
              const ctx = activeMenuContext; // Use current captured context
              if (!ctx) return;

              const payload = {
                type: 'DOWNLOAD',
                url: ctx.url,
                title: ctx.title,
                thumbnail: getYouTubeThumbnail(ctx.url),
                openApp: action === 'open'
              };
              chrome.runtime.sendMessage(payload)
                .then(r => showNotification(r?.success ? 'Sent to Comine!' : (r?.error || 'Failed'), r?.success ? 'success' : 'error'))
                .catch(() => showNotification('Could not connect', 'error'));
          };
          return item;
      };

      const div = document.createElement('div');
      div.className = 'comine-menu-group style-scope ytd-menu-popup-renderer';
      
      const divider = document.createElement('div');
      divider.className = 'comine-menu-divider';
      
      div.appendChild(divider);
      div.appendChild(createItem('Open in Comine', 'open'));
      div.appendChild(createItem('Quick Download', 'quick'));

      listbox.appendChild(div);
  }

  // Legacy observer removed in favor of polling-on-interaction for stability


  function createButton(id, className, title, getInfo) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.className = className;
    btn.title = title;
    btn.innerHTML = `<span class="comine-btn-icon">${comineIconSvg || ''}</span>`;
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      const info = getInfo();
      if (info && info.url) openMenu(btn, info.url, info.title);
    };
    return btn;
  }

  // --- Injection Strategies ---

  const Injectors = {
    YouTubeWatch: {
        check: () => location.pathname === '/watch',
        inject: () => {
            if (document.getElementById('comine-yt-watch')) return;
            
            // Primary Target: New UI (Rounded) & Old UI
            // We look for the "actions" strip where Like/Share/Download buttons live
            const targets = [
                '#top-level-buttons-computed', // Standard
                'ytd-watch-metadata #actions #children', // New Metadata layout
                '#menu-container #top-level-buttons-computed', // Older
                '#actions-inner #top-level-buttons-computed'
            ];

            let container = null;
            for (const sel of targets) {
                const el = document.querySelector(sel);
                if (el && el.offsetParent !== null) { // Check visibility
                    container = el;
                    break;
                }
            }

            if (!container) return;

            // Find an anchor to insert before/after
            // We prefer inserting before the "Keep/Clip" or "Save" buttons, or at the end
            const btn = createButton('comine-yt-watch', 'comine-yt-btn', 'Comine', () => ({
                url: location.href,
                title: document.querySelector('h1.ytd-watch-metadata, #title h1')?.textContent?.trim()
            }));

            // Smart label logic based on container width or existing buttons
            const hasLabels = Array.from(container.children).some(c => c.textContent.trim().length > 0 && c.tagName !== 'BUTTON'); // Heuristic
            // YouTube is inconsistent. We'll default to Icon+Label if space permits or if we're in the main row
            
            const isWide = window.innerWidth > 1000;
            if (isWide) {
                btn.classList.add('with-label');
                btn.innerHTML += '<span class="comine-btn-label">Comine</span>';
            }

            // Insert logic: try to put it after "Like" or "Share"
            const likeBtn = container.querySelector('segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer');
            const shareBtn = container.querySelector('ytd-share-button-renderer, button[aria-label="Share"]');
            
            if (likeBtn) {
                // If like button exists, check for the dislike part or insert after the whole segmented button
                // YouTube segmented button contains both like and dislike.
                // We want it AFTER the segmented button (right of dislike) or if user asked specifically "next to LIKE button"
                // But typically action bars flow left-to-right. 
                // The user request: "on the left next to the LIKE button" 
                // Wait, "hugging the dislike button" implies it's currently on the right of dislike? 
                // If they want it "left next to LIKE", that means BEFORE the Like button?
                // Or maybe they mean "Next to the Like button, on its left"?
                // Let's assume they want it PREPENDED to the list of buttons, or inserted before the Like button.
                
                // Let's try inserting BEFORE the like button (segmented controller)
                likeBtn.insertAdjacentElement('beforebegin', btn);
            } else if (shareBtn) {
                shareBtn.insertAdjacentElement('beforebegin', btn);
            } else {
                container.prepend(btn);
            }
        }
    },
    YouTubeChannel: {
        check: () => location.pathname.startsWith('/@') || location.pathname.startsWith('/channel/') || location.pathname.startsWith('/c/') || location.pathname.startsWith('/user/'),
        inject: () => {
            if (document.getElementById('comine-yt-channel')) return;

            // Target the header actions area
            const targets = [
                'yt-flexible-actions-view-model', // New dynamic header
                '#buttons.ytd-c4-tabbed-header-renderer',
                '#inner-header-container #subscribe-button' 
            ];

            for (const sel of targets) {
                const el = document.querySelector(sel);
                if (el) {
                    const btn = createButton('comine-yt-channel', 'comine-yt-btn with-label', 'Comine', () => ({
                        url: location.href,
                        title: document.querySelector('#channel-name #text, #inner-header-container #text')?.textContent?.trim()
                    }));
                    btn.innerHTML += '<span class="comine-btn-label">Comine</span>';
                    
                    // Specific logic for flexible actions
                    if (el.tagName.toLowerCase() === 'yt-flexible-actions-view-model') {
                         el.appendChild(btn); // Often flex
                    } else {
                        el.insertAdjacentElement('afterend', btn);
                    }
                    return;
                }
            }
        }
    },
    YouTubeShorts: {
        check: () => location.pathname.includes('/shorts/'),
        inject: () => {
             // Shorts overlay actions
             // There can be multiple shorts in the DOM, we need to find the active one or inject in all
             const actionsLists = document.querySelectorAll('ytd-reel-video-renderer[is-active] #actions');
             actionsLists.forEach(actionList => {
                 if (actionList.querySelector('.comine-yt-shorts')) return;
                 
                 const btn = createButton(null, 'comine-yt-shorts', 'Download Short', () => ({
                     url: location.href,
                     title: document.title
                 }));
                 // Shorts buttons are vertical icons usually
                 btn.className = 'style-scope ytd-reel-player-overlay-renderer comine-yt-icon-btn';
                 // Insert before the "More" button or at end
                 actionList.appendChild(btn);
             });
        }
    },
    YouTubeMusic: {
        check: () => location.hostname === 'music.youtube.com',
        inject: () => {
             // 1. Player Bar (Existing)
             if (!document.getElementById('comine-ytm-player')) {
                 const bar = document.querySelector('ytmusic-player-bar');
                 if (bar) {
                    const menuR = bar.querySelector('ytmusic-menu-renderer');
                    if (menuR) {
                        const btn = createButton('comine-ytm-player', 'comine-ytm-btn', 'Comine', () => ({
                            url: location.href,
                            title: bar.querySelector('.title')?.textContent?.trim()
                        }));
                        menuR.insertAdjacentElement('beforebegin', btn);
                    }
                 }
             }

             // 2. Album/Playlist Headers
             if (document.getElementById('comine-ytm-header')) return;
             
             // YTM has multiple header types depending on view (album, playlist, artist, immersive)
             const targets = [
                 'ytmusic-responsive-header-renderer ytmusic-menu-renderer',
                 'ytmusic-detail-header-renderer ytmusic-menu-renderer', 
                 'ytmusic-immersive-header-renderer ytmusic-menu-renderer'
             ];

             for (const sel of targets) {
                 const menuR = document.querySelector(sel);
                 // Ensure it's the main header, not a sub-item
                 if (menuR) {
                     const btn = createButton('comine-ytm-header', 'comine-ytm-btn header', 'Comine', () => ({
                         url: location.href,
                         title: document.querySelector('ytmusic-responsive-header-renderer h2, ytmusic-detail-header-renderer h2, ytmusic-immersive-header-renderer h2')?.textContent?.trim() || document.title
                     }));
                     
                     // Insert before the menu (three dots) or other actions
                     menuR.insertAdjacentElement('beforebegin', btn);
                     return; 
                 }
             }
        }
    },
    Twitter: {
        check: () => location.hostname.includes('twitter.com') || location.hostname.includes('x.com'),
        inject: () => {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            
            articles.forEach(article => {
                // Check if it has media
                const hasVideo = article.querySelector('video') || article.querySelector('[data-testid="videoPlayer"]');
                if (!hasVideo) return; // Only interested in video tweets

                if (article.querySelector('.comine-twitter-btn')) return;

                const actionBar = article.querySelector('[role="group"]');
                if (!actionBar) return;

                const tweetLink = article.querySelector('a[href*="/status/"]');
                const tweetUrl = tweetLink ? tweetLink.href : location.href;
                
                const wrapper = document.createElement('div');
                // Mimic Twitter action item styles
                wrapper.className = 'css-175oi2r r-18u37iz r-1h0z5md r-13awgt0 comine-twitter-wrapper';
                
                const btn = document.createElement('button');
                btn.className = 'comine-twitter-btn css-175oi2r r-1777fci r-bt1l66 r-bztko3 r-lrvibr r-1loqt21 r-1ny4l3l';
                btn.type = 'button';
                btn.title = 'Download with Comine';
                btn.onmouseenter = () => btn.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
                btn.onmouseleave = () => btn.style.backgroundColor = 'transparent';
                
                btn.innerHTML = `
                    <div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7b1 r-3s2u2q" style="color: rgb(113, 118, 123);">
                        <div class="css-175oi2r r-xoduu5">
                            <span class="comine-btn-icon" style="width: 1.25em; height: 1.25em;">${comineIconSvg || '▼'}</span>
                        </div>
                    </div>`;
                
                btn.onclick = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const text = article.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
                    openMenu(btn, tweetUrl, text || 'Twitter Video');
                };

                wrapper.appendChild(btn);

                // Insert before share button (usually the last one) or append
                const shareBtn = actionBar.querySelector('[aria-label="Share post"]') || actionBar.lastElementChild;
                if (shareBtn && shareBtn.parentNode === actionBar) {
                   actionBar.insertBefore(wrapper, shareBtn);
                } else {
                   actionBar.appendChild(wrapper);
                }
            });
        }
    }
  };

  function runInjection() {
      if (!isConfigLoaded || !config.injectButtons) return;
      if (!comineIconSvg) return;

      const host = location.hostname;
      
      if (host.includes('youtube.com')) {
          Injectors.YouTubeWatch.check() && Injectors.YouTubeWatch.inject();
          Injectors.YouTubeChannel.check() && Injectors.YouTubeChannel.inject();
          Injectors.YouTubeShorts.check() && Injectors.YouTubeShorts.inject();
          Injectors.YouTubeMusic.check() && Injectors.YouTubeMusic.inject();
      }
      if (host.includes('twitter.com') || host.includes('x.com')) {
          Injectors.Twitter.inject();
      }
  }

  // --- Initialization ---

  // Throttled Observer
  let timeoutId = null;
  const observer = new MutationObserver(() => {
     if (timeoutId) return;
     timeoutId = setTimeout(() => {
         runInjection();
         timeoutId = null;
     }, 500); // 500ms throttle
  });

  function start() {
    chrome.storage.local.get('injectButtons', (res) => {
        config.injectButtons = res.injectButtons !== false; // Default true
        isConfigLoaded = true;

        if (!config.injectButtons) return;

        // Load Icon
        fetch(chrome.runtime.getURL('icon.svg'))
        .then(r => r.ok ? r.text() : null)
        .then(svg => { 
            comineIconSvg = svg; 
            runInjection();
        })
        .catch(err => {
            console.warn('Comine icon load failed', err);
            // Fallback text if needed, effectively already handled by || ''
            runInjection();
        });

        // Start Observing
        if (document.body) {
             observer.observe(document.body, { childList: true, subtree: true });
        }
        
        // Also listen for URL changes (SPA navigation)
        // Helper to run injection on history changes
        const pushState = history.pushState;
        history.pushState = function() {
            pushState.apply(history, arguments);
            setTimeout(runInjection, 100);
        };
        
        window.addEventListener('popstate', () => setTimeout(runInjection, 100));
        window.addEventListener('yt-navigate-finish', () => setTimeout(runInjection, 100)); // YouTube specific event
        
        // Setup initial run
        runInjection();
    });
  }

  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
  } else {
      start();
  }

})();
