(function () {
  'use strict';

  let comineIconSvg = null;
  let menuCleanup = null;

  const ICON_OPEN = `<path d="M15.578 3.382L17.578 4.432C19.729 5.561 20.805 6.125 21.403 7.14C22 8.154 22 9.417 22 11.942V12.059C22 14.583 22 15.846 21.403 16.86C20.805 17.875 19.729 18.44 17.578 19.569L15.578 20.618C13.822 21.539 12.944 22 12 22C11.056 22 10.178 21.54 8.422 20.618L6.422 19.568C4.271 18.439 3.195 17.875 2.597 16.86C2 15.846 2 14.583 2 12.06V11.943C2 9.418 2 8.155 2.597 7.141C3.195 6.126 4.271 5.561 6.422 4.433L8.422 3.383C10.178 2.461 11.056 2 12 2C12.944 2 13.822 2.46 15.578 3.382Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path opacity="0.5" d="M21 7.5L12 12M12 12L3 7.5M12 12V21.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
  const ICON_DOWNLOAD = `<path opacity="0.5" d="M17 9.002C19.175 9.014 20.353 9.111 21.121 9.879C22 10.758 22 12.172 22 15V16C22 18.829 22 20.243 21.121 21.122C20.243 22 18.828 22 16 22H8C5.172 22 3.757 22 2.879 21.122C2 20.242 2 18.829 2 16V15C2 12.172 2 10.758 2.879 9.879C3.647 9.111 4.825 9.014 7 9.002" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 2V15M12 15L9 11.5M12 15L15 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;

  function getYouTubeThumbnail(url) {
    try {
      const u = new URL(url);
      let id = u.searchParams.get('v');
      if (!id && u.hostname === 'youtu.be') id = u.pathname.slice(1);
      if (!id && u.pathname.includes('/shorts/')) id = u.pathname.split('/shorts/')[1]?.split('/')[0];
      if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    } catch {}
    return null;
  }

  function showNotification(msg, type) {
    document.querySelector('.comine-notification')?.remove();
    const el = document.createElement('div');
    el.className = `comine-notification comine-notification-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.classList.add('comine-notification-hide'); setTimeout(() => el.remove(), 300); }, 3000);
  }

  function closeMenu() {
    menuCleanup?.();
    menuCleanup = null;
    document.querySelector('.comine-yt-menu')?.remove();
  }

  function openMenu(anchor, url, title) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'comine-yt-menu';
    menu.innerHTML = `
      <button class="comine-yt-menu-item" data-action="open"><svg width="24" height="24" viewBox="0 0 24 24" fill="none">${ICON_OPEN}</svg><span class="label">Open in Comine</span></button>
      <button class="comine-yt-menu-item" data-action="quick"><svg width="24" height="24" viewBox="0 0 24 24" fill="none">${ICON_DOWNLOAD}</svg><span class="label">Quick download</span></button>
    `;
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 8, left = rect.left;
    const mr = menu.getBoundingClientRect();
    if (top + mr.height > innerHeight - 8) top = rect.top - 8 - mr.height;
    if (left + mr.width > innerWidth - 8) left = innerWidth - 8 - mr.width;
    menu.style.top = Math.max(8, top) + 'px';
    menu.style.left = Math.max(8, left) + 'px';

    const cleanup = () => { document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); };
    const onClick = e => { if (!menu.contains(e.target) && e.target !== anchor) { cleanup(); closeMenu(); } };
    const onKey = e => { if (e.key === 'Escape') { cleanup(); closeMenu(); } };
    menuCleanup = cleanup;
    setTimeout(() => { document.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey, true); }, 0);

    menu.onclick = e => {
      const btn = e.target.closest('.comine-yt-menu-item');
      if (!btn) return;
      cleanup(); closeMenu();
      chrome.runtime.sendMessage({ type: 'DOWNLOAD', url, title: title || 'Unknown', thumbnail: getYouTubeThumbnail(url), openApp: btn.dataset.action === 'open' })
        .then(r => showNotification(r?.success ? 'Sent to Comine!' : (r?.error || 'Failed'), r?.success ? 'success' : 'error'))
        .catch(() => showNotification('Could not connect', 'error'));
    };
  }

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
      const { url, title: t } = getInfo();
      if (url) openMenu(btn, url, t);
    };
    return btn;
  }

  // YouTube watch page
  function injectYTWatch() {
    if (document.getElementById('comine-yt-watch')) return false;
    const bar = document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed') ||
                document.querySelector('#top-level-buttons-computed') ||
                document.querySelector('ytd-watch-metadata #actions-inner');
    if (!bar) return false;
    const btn = createButton('comine-yt-watch', 'comine-yt-btn', 'Comine', () => ({
      url: location.href,
      title: document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-watch-metadata, #title h1')?.textContent?.trim()
    }));
    const iconOnly = innerWidth < 900;
    btn.className = 'comine-yt-btn' + (iconOnly ? '' : ' with-label');
    if (!iconOnly) btn.innerHTML += '<span class="comine-btn-label">Comine</span>';
    const like = bar.querySelector('segmented-like-dislike-button-view-model') ||
                 bar.querySelector('ytd-segmented-like-dislike-button-renderer');
    if (like) like.insertAdjacentElement('beforebegin', btn);
    else bar.prepend(btn);
    return true;
  }

  // YouTube channel page
  function injectYTChannel() {
    if (document.getElementById('comine-yt-channel')) return false;
    const subscribe = document.querySelector('yt-flexible-actions-view-model yt-subscribe-button-view-model') ||
                      document.querySelector('ytd-subscribe-button-renderer') ||
                      document.querySelector('#subscribe-button');
    if (!subscribe) return false;
    const btn = createButton('comine-yt-channel', 'comine-yt-btn with-label', 'Comine', () => ({
      url: location.href,
      title: document.querySelector('yt-dynamic-text-view-model h1 span, #channel-name yt-formatted-string, #text.ytd-channel-name')?.textContent?.trim()
    }));
    btn.innerHTML += '<span class="comine-btn-label">Comine</span>';
    subscribe.insertAdjacentElement('afterend', btn);
    return true;
  }

  // YouTube playlist page
  function injectYTPlaylist() {
    if (document.getElementById('comine-yt-playlist')) return false;
    const playAll = document.querySelector('ytd-playlist-header-renderer ytd-button-renderer, ytd-playlist-header-renderer #play-button');
    if (!playAll) return false;
    const btn = createButton('comine-yt-playlist', 'comine-yt-btn with-label', 'Comine', () => ({
      url: location.href,
      title: document.querySelector('ytd-playlist-header-renderer #title, ytd-playlist-header-renderer yt-formatted-string.title')?.textContent?.trim()
    }));
    btn.innerHTML += '<span class="comine-btn-label">Comine</span>';
    playAll.insertAdjacentElement('afterend', btn);
    return true;
  }

  // YTM player bar
  function injectYTMPlayer() {
    if (document.getElementById('comine-ytm-player')) return false;
    const bar = document.querySelector('ytmusic-player-bar');
    if (!bar) return false;
    const menuR = bar.querySelector('ytmusic-menu-renderer');
    if (!menuR) return false;
    const btn = createButton('comine-ytm-player', 'comine-ytm-btn', 'Comine', () => ({
      url: location.href,
      title: bar.querySelector('.title')?.textContent?.trim()
    }));
    menuR.insertAdjacentElement('beforebegin', btn);
    return true;
  }

  // YTM album/playlist header
  function injectYTMHeader() {
    if (document.getElementById('comine-ytm-header')) return false;
    const menuR = document.querySelector('ytmusic-responsive-header-renderer ytmusic-menu-renderer') ||
                  document.querySelector('ytmusic-detail-header-renderer ytmusic-menu-renderer') ||
                  document.querySelector('ytmusic-immersive-header-renderer ytmusic-menu-renderer');
    if (!menuR) return false;
    const btn = createButton('comine-ytm-header', 'comine-ytm-btn header', 'Comine', () => ({
      url: location.href,
      title: document.querySelector('ytmusic-responsive-header-renderer h1 yt-formatted-string, ytmusic-detail-header-renderer h2, ytmusic-immersive-header-renderer h2')?.textContent?.trim()
    }));
    menuR.insertAdjacentElement('beforebegin', btn);
    return true;
  }

  // Twitter/X video tweets
  function injectTwitterVideos() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach(article => {
      const video = article.querySelector('video, [data-testid="videoPlayer"]');
      if (!video) return;
      if (article.querySelector('.comine-twitter-btn')) return;
      const actionBar = article.querySelector('[role="group"]');
      if (!actionBar) return;
      const tweetLink = article.querySelector('a[href*="/status/"]');
      const tweetUrl = tweetLink?.href || location.href;
      const tweetText = article.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
      const wrapper = document.createElement('div');
      wrapper.className = 'css-175oi2r r-18u37iz r-1h0z5md r-13awgt0';
      const btn = document.createElement('button');
      btn.className = 'comine-twitter-btn css-175oi2r r-1777fci r-bt1l66 r-bztko3 r-lrvibr r-1loqt21 r-1ny4l3l';
      btn.type = 'button';
      btn.title = 'Download with Comine';
      btn.innerHTML = `<div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7b1 r-3s2u2q" style="color: rgb(113, 118, 123);"><div class="css-175oi2r r-xoduu5"><span class="comine-btn-icon">${comineIconSvg || ''}</span></div></div>`;
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(btn, tweetUrl, tweetText || 'Twitter Video');
      };
      wrapper.appendChild(btn);
      const shareBtn = actionBar.querySelector('[aria-label="Share post"], [aria-label*="Share"]')?.closest('.css-175oi2r[style]');
      if (shareBtn) shareBtn.insertAdjacentElement('beforebegin', wrapper);
      else actionBar.appendChild(wrapper);
    });
  }

  function inject() {
    const host = location.hostname;
    if (host === 'www.youtube.com') {
      if (location.pathname === '/watch') injectYTWatch();
      const isChannel = location.pathname.startsWith('/@') || 
                        location.pathname.startsWith('/channel') || 
                        location.pathname.startsWith('/c/') ||
                        location.pathname.startsWith('/user/');
      if (isChannel) injectYTChannel();
      if (location.pathname === '/playlist') injectYTPlaylist();
    }
    if (host === 'music.youtube.com') {
      injectYTMPlayer();
      injectYTMHeader();
    }
    if (host === 'twitter.com' || host === 'x.com') {
      injectTwitterVideos();
    }
  }

  function init() {
    chrome.storage.local.get('injectButtons', (result) => {
      if (result.injectButtons === false) return;
      
      fetch(chrome.runtime.getURL('icon.svg'))
        .then(r => r.ok ? r.text() : null)
        .then(svg => { comineIconSvg = svg; inject(); })
        .catch(() => inject());

      new MutationObserver(() => inject()).observe(document.body, { childList: true, subtree: true });

      let lastUrl = location.href;
      const poll = () => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
        }
        inject();
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
