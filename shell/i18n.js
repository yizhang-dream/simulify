/**
 * Offline-ready internationalization helper supporting multi-language dictionaries,
 * async locale loaders, placeholder interpolation `{name}`, RTL direction switching,
 * and declarative DOM translation (`[data-i18n]`).
 */
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

export function createI18n({ defaultLang = 'zh', dicts = {}, loadDict = null } = {}) {
  let currentLang = defaultLang;
  const loadedDicts = { ...dicts };
  const subs = new Set();

  const resolveKey = (dict, key) => {
    if (!dict || typeof dict !== 'object') return undefined;
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
  };

  function t(key, vars = null, fallback = null) {
    const active = loadedDicts[currentLang];
    const base = loadedDicts[defaultLang];
    let raw = resolveKey(active, key);
    if (raw === undefined) raw = resolveKey(base, key);
    if (raw === undefined) raw = fallback !== null ? fallback : key;
    if (!vars || typeof raw !== 'string') return String(raw);
    return raw.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, k) =>
      Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`
    );
  }

  function applyDirection(lang) {
    const docEl = globalThis.document?.documentElement;
    if (!docEl) return;
    docEl.lang = lang;
    const baseCode = String(lang || '').split('-')[0].toLowerCase();
    docEl.dir = RTL_LANGS.has(baseCode) ? 'rtl' : 'ltr';
  }

  function applyToDom(root = globalThis.document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    for (const el of root.querySelectorAll('[data-i18n]')) {
      const k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k, null, el.textContent);
    }
    for (const el of root.querySelectorAll('[data-i18n-aria]')) {
      const k = el.getAttribute('data-i18n-aria');
      if (k) el.setAttribute('aria-label', t(k));
    }
  }

  async function setLang(lang) {
    const next = String(lang || defaultLang);
    if (!loadedDicts[next] && typeof loadDict === 'function') {
      const fetched = await loadDict(next);
      if (fetched && typeof fetched === 'object') {
        loadedDicts[next] = fetched;
      }
    }
    currentLang = next;
    applyDirection(next);
    applyToDom();
    for (const fn of subs) {
      fn(currentLang);
    }
    return currentLang;
  }

  function registerDict(lang, dict) {
    loadedDicts[lang] = { ...(loadedDicts[lang] || {}), ...(dict || {}) };
  }

  function getLang() {
    return currentLang;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subs.add(fn);
    return () => subs.delete(fn);
  }

  applyDirection(currentLang);

  return {
    t,
    setLang,
    registerDict,
    applyToDom,
    getLang,
    subscribe,
  };
}
