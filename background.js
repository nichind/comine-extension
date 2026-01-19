const STORAGE_KEYS = { LOCAL_HOST: 'localHost', LOCAL_PORT: 'localPort', OPT_COOKIES: 'optCookies' };
const DEFAULTS = { LOCAL_HOST: '127.0.0.1', LOCAL_PORT: 9549 };

let config = { localHost: DEFAULTS.LOCAL_HOST, localPort: DEFAULTS.LOCAL_PORT, optCookies: false };

async function loadConfig() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  config.localHost = stored[STORAGE_KEYS.LOCAL_HOST] || DEFAULTS.LOCAL_HOST;
  config.localPort = parseInt(stored[STORAGE_KEYS.LOCAL_PORT]) || DEFAULTS.LOCAL_PORT;
  config.optCookies = stored[STORAGE_KEYS.OPT_COOKIES] ?? false;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key === STORAGE_KEYS.LOCAL_HOST) config.localHost = newValue || DEFAULTS.LOCAL_HOST;
    else if (key === STORAGE_KEYS.LOCAL_PORT) config.localPort = parseInt(newValue) || DEFAULTS.LOCAL_PORT;
    else if (key === STORAGE_KEYS.OPT_COOKIES) config.optCookies = newValue ?? false;
  }
});

async function localRequest(path, options = {}) {
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

const LocalAPI = {
  async ping() { try { await localRequest('/ping'); return true; } catch { return false; } },
  async download(url, title, thumbnail, openApp, options, cookies = null) {
    return localRequest('/download', { method: 'POST', body: JSON.stringify({ url, title, thumbnail, mode: openApp ? 'open' : 'quick', options, cookies }) });
  },
  async cancel(url) { return localRequest('/cancel', { method: 'POST', body: JSON.stringify({ url }) }); },
  async status() { return localRequest('/status'); },
  async history() { return localRequest('/history'); },
  async sendCookies(domain, cookies, sourceUrl = null) {
    return localRequest('/cookies', { method: 'POST', body: JSON.stringify({ domain, sourceUrl, cookies }) });
  },
};

async function getCookiesForDomains(domains) {
  const allCookies = [];
  for (const domain of domains) {
    const cookies = await chrome.cookies.getAll({ domain });
    allCookies.push(...cookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, expirationDate: c.expirationDate || null,
    })));
  }
  return allCookies.length > 0 ? allCookies : null;
}

async function getCookiesForUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;

  const cookies = await chrome.cookies.getAll({ url });
  const formatted = cookies.map(c => ({
    name: c.name, value: c.value, domain: c.domain, path: c.path,
    secure: c.secure, httpOnly: c.httpOnly, expirationDate: c.expirationDate || null,
  }));
  return { domain: parsed.hostname, cookies: formatted };
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'PING': respond({ success: true, alive: await LocalAPI.ping() }); break;
        
        case 'DOWNLOAD': {
          let cookies = msg.cookies || null;
          if (!cookies && config.optCookies) {
            try {
              const result = await getCookiesForUrl(msg.url);
              cookies = result?.cookies || null;
            } catch {
              cookies = null;
            }
          }
          await LocalAPI.download(msg.url, msg.title, msg.thumbnail, msg.openApp, msg.options, cookies);
          respond({ success: true });
          break;
        }
        
        case 'CANCEL': await LocalAPI.cancel(msg.url); respond({ success: true }); break;
        case 'GET_CONFIG': respond({ success: true, config: { localHost: config.localHost, localPort: config.localPort } }); break;
        
        case 'GET_STATUS': {
          const alive = await LocalAPI.ping();
          let queue = [];
          if (alive) try { queue = (await LocalAPI.status())?.queue || []; } catch {}
          respond({ success: true, connected: alive, queue });
          break;
        }
        
        case 'GET_HISTORY': {
          const history = await LocalAPI.history();
          respond({ success: true, history: Array.isArray(history) ? history : [] });
          break;
        }
        
        case 'SEND_COOKIES': {
          const cookies = await chrome.cookies.getAll({ domain: msg.domain });
          const formatted = cookies.map(c => ({
            name: c.name, value: c.value, domain: c.domain, path: c.path,
            secure: c.secure, httpOnly: c.httpOnly, expirationDate: c.expirationDate || null,
          }));
          await LocalAPI.sendCookies(msg.domain, formatted, null);
          respond({ success: true, domain: msg.domain, count: formatted.length });
          break;
        }

        case 'SEND_COOKIES_FOR_URL': {
          const result = await getCookiesForUrl(msg.url);
          if (!result) {
            respond({ success: false, error: 'Invalid URL or unsupported scheme' });
            break;
          }
          await LocalAPI.sendCookies(result.domain, result.cookies, msg.url);
          respond({ success: true, domain: result.domain, count: result.cookies.length });
          break;
        }
        
        case 'RECONNECT': await loadConfig(); respond({ success: true }); break;
        default: respond({ success: false, error: 'Unknown message type' });
      }
    } catch (e) {
      console.error('[Comine]', e);
      respond({ success: false, error: e.message });
    }
  })();
  return true;
});

loadConfig();
