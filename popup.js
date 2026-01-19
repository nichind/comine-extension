const STORAGE_KEYS = {
  LOCAL_HOST: 'localHost',
  LOCAL_PORT: 'localPort',
  OPEN_APP: 'openAppOnDownload',
  VIEW_MODE: 'viewMode',
  PRESET: 'preset',
  VIDEO_QUALITY: 'videoQuality',
  DOWNLOAD_MODE: 'downloadMode',
  AUDIO_QUALITY: 'audioQuality',
  OPT_REMUX: 'optRemux',
  OPT_MP4: 'optMp4',
  OPT_THUMBNAIL: 'optThumbnail',
  OPT_METADATA: 'optMetadata',
  OPT_COOKIES: 'optCookies',
  INJECT_BUTTONS: 'injectButtons',
  LAST_UPDATE_CHECK: 'lastUpdateCheck',
  DISMISSED_VERSION: 'dismissedVersion',
};

const DEFAULTS = {
  LOCAL_HOST: '127.0.0.1',
  LOCAL_PORT: 9549,
  OPEN_APP: false,
  VIEW_MODE: 'list',
  PRESET: 'best',
  VIDEO_QUALITY: 'max',
  DOWNLOAD_MODE: 'auto',
  AUDIO_QUALITY: 'best',
  OPT_REMUX: false,
  OPT_MP4: false,
  OPT_THUMBNAIL: true,
  OPT_METADATA: false,
  OPT_COOKIES: false,
  INJECT_BUTTONS: true,
};

const VIDEO_QUALITY_OPTIONS = [
  { value: 'max', label: 'Max' },
  { value: '4k', label: '4K' },
  { value: '1440p', label: '1440p' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
];

const DOWNLOAD_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'audio', label: 'Audio' },
  { value: 'mute', label: 'No Audio' },
];

const AUDIO_QUALITY_OPTIONS = [
  { value: 'best', label: 'Best' },
  { value: '320', label: '320k' },
  { value: '256', label: '256k' },
  { value: '192', label: '192k' },
  { value: '128', label: '128k' },
];

let config = {
  localHost: DEFAULTS.LOCAL_HOST,
  localPort: DEFAULTS.LOCAL_PORT,
  openApp: DEFAULTS.OPEN_APP,
  viewMode: DEFAULTS.VIEW_MODE,
  preset: DEFAULTS.PRESET,
  videoQuality: DEFAULTS.VIDEO_QUALITY,
  downloadMode: DEFAULTS.DOWNLOAD_MODE,
  audioQuality: DEFAULTS.AUDIO_QUALITY,
  optRemux: DEFAULTS.OPT_REMUX,
  optMp4: DEFAULTS.OPT_MP4,
  optThumbnail: DEFAULTS.OPT_THUMBNAIL,
  optMetadata: DEFAULTS.OPT_METADATA,
  optCookies: DEFAULTS.OPT_COOKIES,
  injectButtons: DEFAULTS.INJECT_BUTTONS,
};

let isConnected = false;
let downloads = [];
let activeFilter = 'all';
let currentPage = 'download';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function loadConfig() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  config.localHost = stored[STORAGE_KEYS.LOCAL_HOST] || DEFAULTS.LOCAL_HOST;
  config.localPort = parseInt(stored[STORAGE_KEYS.LOCAL_PORT]) || DEFAULTS.LOCAL_PORT;
  config.openApp = stored[STORAGE_KEYS.OPEN_APP] ?? DEFAULTS.OPEN_APP;
  config.viewMode = stored[STORAGE_KEYS.VIEW_MODE] || DEFAULTS.VIEW_MODE;
  config.preset = stored[STORAGE_KEYS.PRESET] || DEFAULTS.PRESET;
  config.videoQuality = stored[STORAGE_KEYS.VIDEO_QUALITY] || DEFAULTS.VIDEO_QUALITY;
  config.downloadMode = stored[STORAGE_KEYS.DOWNLOAD_MODE] || DEFAULTS.DOWNLOAD_MODE;
  config.audioQuality = stored[STORAGE_KEYS.AUDIO_QUALITY] || DEFAULTS.AUDIO_QUALITY;
  config.optRemux = stored[STORAGE_KEYS.OPT_REMUX] ?? DEFAULTS.OPT_REMUX;
  config.optMp4 = stored[STORAGE_KEYS.OPT_MP4] ?? DEFAULTS.OPT_MP4;
  config.optThumbnail = stored[STORAGE_KEYS.OPT_THUMBNAIL] ?? DEFAULTS.OPT_THUMBNAIL;
  config.optMetadata = stored[STORAGE_KEYS.OPT_METADATA] ?? DEFAULTS.OPT_METADATA;
  config.optCookies = stored[STORAGE_KEYS.OPT_COOKIES] ?? DEFAULTS.OPT_COOKIES;
  config.injectButtons = stored[STORAGE_KEYS.INJECT_BUTTONS] ?? DEFAULTS.INJECT_BUTTONS;
}

async function saveConfig() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOCAL_HOST]: config.localHost,
    [STORAGE_KEYS.LOCAL_PORT]: config.localPort,
    [STORAGE_KEYS.OPEN_APP]: config.openApp,
    [STORAGE_KEYS.VIEW_MODE]: config.viewMode,
    [STORAGE_KEYS.PRESET]: config.preset,
    [STORAGE_KEYS.VIDEO_QUALITY]: config.videoQuality,
    [STORAGE_KEYS.DOWNLOAD_MODE]: config.downloadMode,
    [STORAGE_KEYS.AUDIO_QUALITY]: config.audioQuality,
    [STORAGE_KEYS.OPT_REMUX]: config.optRemux,
    [STORAGE_KEYS.OPT_MP4]: config.optMp4,
    [STORAGE_KEYS.OPT_THUMBNAIL]: config.optThumbnail,
    [STORAGE_KEYS.OPT_METADATA]: config.optMetadata,
    [STORAGE_KEYS.OPT_COOKIES]: config.optCookies,
    [STORAGE_KEYS.INJECT_BUTTONS]: config.injectButtons,
  });
}

async function sendCookiesToApp() {
  const sendBtn = $('#send-cookies-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.classList.add('loading'); }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = tab?.url || '';
    if (!tabUrl || !/^https?:/i.test(tabUrl)) {
      throw new Error('Open a website tab to send its cookies');
    }

    // Try to request broad host permission once (best UX for "send cookies from current site").
    // If denied, we still attempt the request; background will report a permission error.
    try {
      const hasAllUrls = await chrome.permissions.contains({ origins: ['<all_urls>'] });
      if (!hasAllUrls) {
        await chrome.permissions.request({ origins: ['<all_urls>'] });
      }
    } catch {
      // Ignore; we'll rely on background error handling.
    }

    const response = await chrome.runtime.sendMessage({ type: 'SEND_COOKIES_FOR_URL', url: tabUrl });
    if (!response?.success) throw new Error(response?.error || 'Failed to send cookies');

    const domain = response.domain || new URL(tabUrl).hostname;
    showToast(`${response.count || 0} cookies sent (${domain})`, 'success');
  } catch (err) {
    const message = err.message || 'Failed to send cookies';
    showToast(message.includes('fetch') || message.includes('connect') ? 'Comine app is not running' : message, 'error');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.classList.remove('loading'); }
  }
}

function getYouTubeThumbnailFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) return null;
    let videoId = urlObj.searchParams.get('v');
    if (!videoId && hostname === 'youtu.be') videoId = urlObj.pathname.slice(1);
    if (!videoId && urlObj.pathname.includes('/shorts/')) videoId = urlObj.pathname.split('/shorts/')[1]?.split('/')[0];
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
  } catch { return null; }
}

async function apiRequest(path, options = {}) {
  const url = `http://${config.localHost}:${config.localPort}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...options.headers } });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) { clearTimeout(timeout); throw e; }
}

async function checkConnection() {
  try {
    await apiRequest('/ping');
    setConnectionStatus(true);
    return true;
  } catch {
    setConnectionStatus(false);
    return false;
  }
}

async function sendDownload(url, title = '', thumbnail = null) {
  const mode = config.openApp ? 'open' : 'quick';
  const options = {
    videoQuality: config.videoQuality,
    downloadMode: config.downloadMode,
    audioQuality: config.audioQuality,
    remux: config.optRemux,
    convertToMp4: config.optMp4,
    embedThumbnail: config.optThumbnail,
    clearMetadata: config.optMetadata,
  };
  
  let cookies = null;
  if (config.optCookies) {
    try {
      const domains = ['youtube.com', 'youtu.be', 'google.com'];
      const allCookies = [];
      for (const domain of domains) {
        const domainCookies = await chrome.cookies.getAll({ domain });
        allCookies.push(...domainCookies.map(c => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          secure: c.secure, httpOnly: c.httpOnly, expirationDate: c.expirationDate || null,
        })));
      }
      if (allCookies.length > 0) cookies = allCookies;
    } catch {}
  }
  
  return apiRequest('/download', { method: 'POST', body: JSON.stringify({ url, title: title || 'Download', thumbnail, mode, options, cookies }) });
}

async function fetchDownloads(skipRender = false) {
  try {
    const data = await apiRequest('/status');
    if (data?.queue && Array.isArray(data.queue)) { downloads = data.queue; if (!skipRender) renderDownloads(); }
    else if (Array.isArray(data)) { downloads = data; if (!skipRender) renderDownloads(); }
  } catch {}
}

async function fetchHistory() {
  try {
    const data = await apiRequest('/history');
    if (Array.isArray(data)) {
      const activeUrls = new Set(downloads.map((d) => d.url));
      const historyItems = data.filter((h) => !activeUrls.has(h.url)).map((h) => ({ ...h, status: 'completed' }));
      downloads = [...downloads, ...historyItems.slice(0, 20)];
      renderDownloads();
    }
  } catch {}
}

async function fetchAll() {
  await fetchDownloads(true);
  await fetchHistory();
}

function setConnectionStatus(connected) {
  isConnected = connected;
  const statusEl = $('.titlebar-status');
  const statusText = $('.status-text');
  statusEl.classList.remove('connected', 'connecting');
  if (connected) { statusEl.classList.add('connected'); statusText.textContent = 'Connected'; }
  else { statusText.textContent = 'Disconnected'; }
}

function showToast(message, type = 'info') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = 'toast';
  if (type !== 'info') toast.classList.add(type);
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function switchPage(pageName) {
  currentPage = pageName;
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === pageName));
  $$('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${pageName}`));
  if (pageName === 'history' && isConnected) fetchAll();
}

function updatePresetUI() {
  $$('.chip[data-preset]').forEach((chip) => chip.classList.toggle('selected', chip.dataset.preset === config.preset));
}

function updateSettingButtons() {
  const videoOpt = VIDEO_QUALITY_OPTIONS.find((o) => o.value === config.videoQuality);
  const modeOpt = DOWNLOAD_MODE_OPTIONS.find((o) => o.value === config.downloadMode);
  const audioOpt = AUDIO_QUALITY_OPTIONS.find((o) => o.value === config.audioQuality);
  const videoBtn = $('#video-quality-btn .setting-value');
  const modeBtn = $('#download-mode-btn .setting-value');
  const audioBtn = $('#audio-quality-btn .setting-value');
  if (videoBtn) videoBtn.textContent = videoOpt?.label || config.videoQuality;
  if (modeBtn) modeBtn.textContent = modeOpt?.label || config.downloadMode;
  if (audioBtn) audioBtn.textContent = audioOpt?.label || config.audioQuality;
}

function updateCheckboxes() {
  $('#opt-remux').checked = config.optRemux;
  $('#opt-mp4').checked = config.optMp4;
  $('#opt-thumbnail').checked = config.optThumbnail;
  $('#opt-metadata').checked = config.optMetadata;
  $('#opt-cookies').checked = config.optCookies;
}

function updateSettingsPage() {
  $('#local-host').value = config.localHost;
  $('#local-port').value = config.localPort;
  $('#open-app-toggle').checked = config.openApp;
  $('#inject-buttons-toggle').checked = config.injectButtons;
}

function applyPreset(preset) {
  config.preset = preset;
  switch (preset) {
    case 'best':
      config.videoQuality = 'max'; config.downloadMode = 'auto'; config.audioQuality = 'best';
      config.optRemux = false; config.optMp4 = false; config.optThumbnail = true; config.optMetadata = false;
      break;
    case 'music':
      config.videoQuality = 'max'; config.downloadMode = 'audio'; config.audioQuality = 'best';
      config.optRemux = false; config.optMp4 = false; config.optThumbnail = true; config.optMetadata = false;
      break;
    case 'small':
      config.videoQuality = '480p'; config.downloadMode = 'auto'; config.audioQuality = '192';
      config.optRemux = false; config.optMp4 = true; config.optThumbnail = false; config.optMetadata = false;
      break;
  }
  updatePresetUI(); updateSettingButtons(); updateCheckboxes(); saveConfig();
}

function renderDownloads() {
  const listEl = $('#downloads-list');
  const gridEl = $('#downloads-grid');
  const emptyEl = $('#empty-state');

  let filtered = downloads.filter((d) => d.status !== 'failed');
  switch (activeFilter) {
    case 'active': filtered = downloads.filter((d) => ['downloading', 'pending', 'processing', 'queued', 'fetching-info'].includes(d.status)); break;
    case 'completed': filtered = downloads.filter((d) => d.status === 'completed'); break;
  }

  const activeCount = downloads.filter((d) => ['downloading', 'pending', 'processing', 'queued', 'fetching-info'].includes(d.status)).length;
  const badge = $('.nav-badge');
  if (activeCount > 0) { badge.textContent = activeCount; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden'); listEl.classList.add('hidden'); gridEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  if (config.viewMode === 'list') {
    listEl.classList.remove('hidden'); gridEl.classList.add('hidden');
    listEl.innerHTML = filtered.map(renderListItem).join('');
  } else {
    listEl.classList.add('hidden'); gridEl.classList.remove('hidden');
    gridEl.innerHTML = filtered.map(renderGridItem).join('');
  }
}

function renderListItem(item) {
  const statusClass = getStatusClass(item.status);
  const statusLabel = getStatusLabel(item.status);
  const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));
  const displayTitle = getDisplayTitle(item);
  const displayAuthor = item.author || '';
  const hasFile = item.filePath && item.status === 'completed';
  const escapedPath = hasFile ? escapeHtml(item.filePath) : '';
  const isActive = ['downloading', 'processing', 'queued', 'pending', 'fetching-info'].includes(item.status);
  const escapedUrl = escapeHtml(item.url || '');

  return `
    <div class="download-item ${isActive ? 'is-active' : ''}" style="--progress: ${progress};" data-filepath="${escapedPath}" data-url="${escapedUrl}">
      <div class="download-thumb">
        ${item.thumbnail
          ? `<img src="${item.thumbnail}" alt="" referrerpolicy="no-referrer">`
          : `<div class="download-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none"><path d="M2.384 13.793C1.937 10.629 1.714 9.048 2.662 8.023C3.61 7 5.298 7 8.672 7H15.328C18.702 7 20.39 7 21.338 8.024C22.286 9.048 22.062 10.629 21.616 13.793L21.194 16.793C20.844 19.273 20.669 20.514 19.772 21.257C18.875 22 17.552 22 14.905 22H9.095C6.449 22 5.125 22 4.228 21.257C3.331 20.514 3.156 19.274 2.806 16.793L2.384 13.793Z" stroke="currentColor" stroke-width="1.5"/></svg></div>`}
      </div>
      <div class="download-info">
        <div class="download-title">${escapeHtml(displayTitle)}</div>
        <div class="download-meta">${displayAuthor ? `<span>${escapeHtml(displayAuthor)}</span>` : ''}${item.speed ? `<span>• ${item.speed}</span>` : ''}</div>
      </div>
      <div class="download-actions">
        ${hasFile ? `
          <button class="action-btn play-btn" data-action="play" title="Play"><svg viewBox="0 0 24 24" fill="none"><path d="M19.4933 9.98543C19.9483 10.2281 20.3289 10.5903 20.5944 11.0332C20.8598 11.4762 21 11.9832 21 12.5C21 13.0168 20.8598 13.5238 20.5944 13.9668C20.3289 14.4097 19.9483 14.772 19.4933 15.0146L7.35519 21.633C5.40071 22.6999 3 21.3129 3 19.1194V5.88156C3 3.68712 5.40071 2.30111 7.35519 3.36603L19.4933 9.98543Z" stroke="currentColor" stroke-width="1.5"/></svg></button>
          <button class="action-btn folder-btn" data-action="reveal" title="Show in folder"><svg viewBox="0 0 24 24" fill="none"><path opacity="0.5" d="M18 10H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 6.95C2 6.067 2 5.626 2.07 5.258C2.21922 4.46784 2.60314 3.741 3.17165 3.17231C3.74017 2.60361 4.46689 2.21947 5.257 2.07C5.626 2 6.068 2 6.95 2C7.336 2 7.53 2 7.716 2.017C8.51705 2.09223 9.27679 2.40728 9.896 2.921C10.04 3.04 10.176 3.176 10.45 3.45L11 4C11.816 4.816 12.224 5.224 12.712 5.495C12.9802 5.64449 13.2648 5.7626 13.56 5.847C14.098 6 14.675 6 15.828 6H16.202C18.834 6 20.151 6 21.006 6.77C21.0853 6.84 21.16 6.91467 21.23 6.994C22 7.849 22 9.166 22 11.798V14C22 17.771 22 19.657 20.828 20.828C19.656 21.999 17.771 22 14 22H10C6.229 22 4.343 22 3.172 20.828C2.001 19.656 2 17.771 2 14V6.95Z" stroke="currentColor" stroke-width="1.5"/></svg></button>
        ` : ''}
        ${isActive ? `
          <button class="action-btn cancel-btn" data-action="cancel" title="Cancel"><svg viewBox="0 0 24 24" fill="none"><path d="M17 7L7 17M7 7L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
          <span class="status-badge ${statusClass}">${progress}%</span>
        ` : !hasFile ? `<span class="status-badge ${statusClass}">${statusLabel}</span>` : ''}
      </div>
    </div>`;
}

function renderGridItem(item) {
  const statusClass = getStatusClass(item.status);
  const statusLabel = getStatusLabel(item.status);
  const displayTitle = getDisplayTitle(item);
  const hasFile = item.filePath && item.status === 'completed';
  const escapedPath = hasFile ? escapeHtml(item.filePath) : '';
  const escapedUrl = escapeHtml(item.url || '');
  const isActive = ['downloading', 'processing', 'queued', 'pending', 'fetching-info'].includes(item.status);
  const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));

  return `
    <div class="download-card ${isActive ? 'is-active' : ''}" style="--progress: ${progress};" data-filepath="${escapedPath}" data-url="${escapedUrl}">
      <div class="download-card-thumb">
        ${item.thumbnail ? `<img src="${item.thumbnail}" alt="" referrerpolicy="no-referrer">` : ''}
        ${hasFile ? `
          <div class="download-card-actions">
            <button class="action-btn play-btn" data-action="play" title="Play"><svg viewBox="0 0 24 24" fill="none"><path d="M19.4933 9.98543C19.9483 10.2281 20.3289 10.5903 20.5944 11.0332C20.8598 11.4762 21 11.9832 21 12.5C21 13.0168 20.8598 13.5238 20.5944 13.9668C20.3289 14.4097 19.9483 14.772 19.4933 15.0146L7.35519 21.633C5.40071 22.6999 3 21.3129 3 19.1194V5.88156C3 3.68712 5.40071 2.30111 7.35519 3.36603L19.4933 9.98543Z" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <button class="action-btn folder-btn" data-action="reveal" title="Show in folder"><svg viewBox="0 0 24 24" fill="none"><path opacity="0.5" d="M18 10H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 6.95C2 6.067 2 5.626 2.07 5.258C2.21922 4.46784 2.60314 3.741 3.17165 3.17231C3.74017 2.60361 4.46689 2.21947 5.257 2.07C5.626 2 6.068 2 6.95 2C7.336 2 7.53 2 7.716 2.017C8.51705 2.09223 9.27679 2.40728 9.896 2.921C10.04 3.04 10.176 3.176 10.45 3.45L11 4C11.816 4.816 12.224 5.224 12.712 5.495C12.9802 5.64449 13.2648 5.7626 13.56 5.847C14.098 6 14.675 6 15.828 6H16.202C18.834 6 20.151 6 21.006 6.77C21.0853 6.84 21.16 6.91467 21.23 6.994C22 7.849 22 9.166 22 11.798V14C22 17.771 22 19.657 20.828 20.828C19.656 21.999 17.771 22 14 22H10C6.229 22 4.343 22 3.172 20.828C2.001 19.656 2 17.771 2 14V6.95Z" stroke="currentColor" stroke-width="1.5"/></svg></button>
          </div>
        ` : isActive ? `
          <div class="download-card-actions">
            <button class="action-btn cancel-btn" data-action="cancel" title="Cancel"><svg viewBox="0 0 24 24" fill="none"><path d="M17 7L7 17M7 7L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
          </div>
        ` : ''}
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="download-card-info"><div class="download-card-title">${escapeHtml(displayTitle)}</div></div>
    </div>`;
}

function getDisplayTitle(item) {
  const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}:?$/i;
  const hasValidTitle = item.title && !item.title.startsWith('http://') && !item.title.startsWith('https://') && !uuidPattern.test(item.title.replace(/[:-]/g, ''));
  if (hasValidTitle) return item.title;
  
  const url = item.url || (item.title?.startsWith('http') ? item.title : null);
  if (url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPath = pathParts[pathParts.length - 1];
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        const videoId = urlObj.searchParams.get('v') || lastPath;
        return videoId ? `Video ${videoId}` : urlObj.hostname;
      }
      if (lastPath && lastPath.length > 3 && !lastPath.includes('.')) return lastPath.replace(/[-_]/g, ' ');
      return urlObj.hostname.replace('www.', '');
    } catch { return 'Download'; }
  }
  return 'Download';
}

function getStatusClass(status) {
  switch (status) {
    case 'downloading': case 'processing': return 'downloading';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    default: return 'pending';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'downloading': return 'Downloading';
    case 'processing': return 'Processing';
    case 'completed': return 'Done';
    case 'failed': return 'Failed';
    case 'pending': return 'Queued';
    default: return status;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showModal(title, options, currentValue, onSelect) {
  const overlay = $('#modal-overlay');
  $('.modal-title').textContent = title;
  const content = $('#modal-content');
  content.innerHTML = options.map((opt) => `<button class="modal-option ${opt.value === currentValue ? 'selected' : ''}" data-value="${opt.value}">${opt.label}</button>`).join('');
  content.querySelectorAll('.modal-option').forEach((btn) => { btn.onclick = () => { onSelect(btn.dataset.value); closeModal(); }; });
  overlay.classList.remove('hidden');
}

function closeModal() { $('#modal-overlay').classList.add('hidden'); }

function setupEventListeners() {
  $$('.nav-item').forEach((item) => { item.onclick = () => switchPage(item.dataset.page); });

  $('#download-btn').onclick = async () => {
    const input = $('#url-input');
    const url = input.value.trim();
    if (!url) { showToast('Please enter a URL', 'error'); return; }
    if (!isConnected) { showToast('Not connected to Comine', 'error'); return; }

    let title = '', thumbnail = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url === url && tab.title) title = tab.title.replace(/\s*[-|]\s*(YouTube|Vimeo|Twitch|Twitter|TikTok|Instagram)$/i, '').trim();
      thumbnail = getYouTubeThumbnailFromUrl(url);
    } catch {}

    try {
      await sendDownload(url, title, thumbnail);
      showToast('Download started!', 'success');
      input.value = '';
    } catch { showToast('Failed to start download', 'error'); }
  };

  $('#url-input').onkeydown = (e) => { if (e.key === 'Enter') $('#download-btn').click(); };
  $$('.chip[data-preset]').forEach((chip) => { chip.onclick = () => applyPreset(chip.dataset.preset); });

  $('#video-quality-btn').onclick = () => showModal('Video Quality', VIDEO_QUALITY_OPTIONS, config.videoQuality, (value) => {
    config.videoQuality = value; config.preset = 'custom'; updateSettingButtons(); updatePresetUI(); saveConfig();
  });

  $('#download-mode-btn').onclick = () => showModal('Download Mode', DOWNLOAD_MODE_OPTIONS, config.downloadMode, (value) => {
    config.downloadMode = value; config.preset = 'custom'; updateSettingButtons(); updatePresetUI(); saveConfig();
  });

  $('#audio-quality-btn').onclick = () => showModal('Audio Quality', AUDIO_QUALITY_OPTIONS, config.audioQuality, (value) => {
    config.audioQuality = value; config.preset = 'custom'; updateSettingButtons(); updatePresetUI(); saveConfig();
  });

  $('#opt-remux').onchange = (e) => { config.optRemux = e.target.checked; config.preset = 'custom'; updatePresetUI(); saveConfig(); };
  $('#opt-mp4').onchange = (e) => { config.optMp4 = e.target.checked; config.preset = 'custom'; updatePresetUI(); saveConfig(); };
  $('#opt-thumbnail').onchange = (e) => { config.optThumbnail = e.target.checked; config.preset = 'custom'; updatePresetUI(); saveConfig(); };
  $('#opt-metadata').onchange = (e) => { config.optMetadata = e.target.checked; config.preset = 'custom'; updatePresetUI(); saveConfig(); };
  $('#opt-cookies').onchange = (e) => { config.optCookies = e.target.checked; saveConfig(); };
  $('#send-cookies-btn').onclick = (e) => { e.preventDefault(); e.stopPropagation(); sendCookiesToApp(); };

  $$('.filter-chip').forEach((chip) => {
    chip.onclick = () => {
      activeFilter = chip.dataset.filter;
      $$('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      renderDownloads();
    };
  });

  document.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('.action-btn');
    if (!actionBtn) return;
    const downloadItem = actionBtn.closest('.download-item') || actionBtn.closest('.download-card');
    if (!downloadItem) return;
    const action = actionBtn.dataset.action;
    
    try {
      if (action === 'cancel') {
        await chrome.runtime.sendMessage({ type: 'CANCEL', url: downloadItem.dataset.url });
        showToast('Download cancelled', 'success');
        await fetchAll();
      } else if (action === 'play') {
        await apiRequest('/open', { method: 'POST', body: JSON.stringify({ filePath: downloadItem.dataset.filepath }) });
      } else if (action === 'reveal') {
        await apiRequest('/reveal', { method: 'POST', body: JSON.stringify({ filePath: downloadItem.dataset.filepath }) });
      }
    } catch { showToast('Failed to perform action', 'error'); }
  });

  $('#view-toggle').onclick = () => { config.viewMode = config.viewMode === 'list' ? 'grid' : 'list'; saveConfig(); renderDownloads(); };
  
  $('#refresh-btn').onclick = async () => {
    if (isConnected) { await fetchAll(); showToast('Refreshed', 'success'); }
    else { if (await checkConnection()) await fetchAll(); }
  };

  $('#local-host').onchange = (e) => { config.localHost = e.target.value.trim() || DEFAULTS.LOCAL_HOST; saveConfig(); checkConnection(); };
  $('#local-port').onchange = (e) => { config.localPort = parseInt(e.target.value) || DEFAULTS.LOCAL_PORT; saveConfig(); checkConnection(); };
  $('#open-app-toggle').onchange = (e) => { config.openApp = e.target.checked; saveConfig(); };
  $('#inject-buttons-toggle').onchange = (e) => { config.injectButtons = e.target.checked; saveConfig(); };

  $('#test-connection').onclick = async () => {
    const btn = $('#test-connection');
    btn.disabled = true; btn.textContent = 'Testing...';
    const connected = await checkConnection();
    btn.disabled = false; btn.textContent = 'Test Connection';
    showToast(connected ? 'Connected to Comine!' : 'Could not connect to Comine', connected ? 'success' : 'error');
  };

  $('#modal-close').onclick = closeModal;
  $('#modal-overlay').onclick = (e) => { if (e.target === $('#modal-overlay')) closeModal(); };
}

const UPDATE_REPO = 'nichind/comine-extension';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

async function checkForUpdates() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.LAST_UPDATE_CHECK, STORAGE_KEYS.DISMISSED_VERSION]);
    const lastCheck = stored[STORAGE_KEYS.LAST_UPDATE_CHECK] || 0;
    const now = Date.now();
    
    if (now - lastCheck < UPDATE_CHECK_INTERVAL) return;
    
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return;
    
    const release = await res.json();
    const latestVersion = release.tag_name.replace(/^v/, '');
    const currentVersion = chrome.runtime.getManifest().version;
    const dismissedVersion = stored[STORAGE_KEYS.DISMISSED_VERSION];
    
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_UPDATE_CHECK]: now });
    
    if (latestVersion === dismissedVersion) return;
    if (compareVersions(latestVersion, currentVersion) > 0) {
      showUpdateBanner(latestVersion, release.html_url);
    }
  } catch {}
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function showUpdateBanner(version, url) {
  const existing = $('#update-banner');
  if (existing) existing.remove();
  
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span>Update available: v${version}</span>
    <div class="update-actions">
      <a href="${url}" target="_blank" class="update-link">Download</a>
      <button class="update-dismiss" title="Dismiss">×</button>
    </div>
  `;
  
  banner.querySelector('.update-dismiss').onclick = async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_VERSION]: version });
    banner.remove();
  };
  
  document.body.insertBefore(banner, document.body.firstChild);
}

async function init() {
  await loadConfig();
  updatePresetUI();
  updateSettingButtons();
  updateCheckboxes();
  updateSettingsPage();
  setupEventListeners();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('about:') && !tab.url.startsWith('edge://') && !tab.url.startsWith('moz-extension://')) {
      $('#url-input').value = tab.url;
    }
  } catch {}

  const connected = await checkConnection();
  if (connected) await fetchAll();
  
  checkForUpdates();

  setInterval(async () => {
    await checkConnection();
    if (isConnected && currentPage === 'history') await fetchAll();
  }, 5000);
}

document.addEventListener('DOMContentLoaded', init);
