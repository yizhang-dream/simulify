/**
 * Lightweight UI mounts connecting MasteryStore and i18n into Web sites or desktop app shells.
 */

export function mountMasteryBar(containerEl, store, { labelFn = (p) => `${p.done}/${p.total} 已探索` } = {}) {
  if (!containerEl || !store) throw new Error('mountMasteryBar requires containerEl and MasteryStore.');

  const root = document.createElement('div');
  root.className = 'mastery-bar';

  const track = document.createElement('div');
  track.className = 'mastery-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');

  const fill = document.createElement('div');
  fill.className = 'mastery-fill';
  track.append(fill);

  const label = document.createElement('span');
  root.append(track, label);
  containerEl.append(root);

  const unsub = store.subscribe((p) => {
    track.setAttribute('aria-valuenow', String(p.pct));
    fill.style.width = `${p.pct}%`;
    label.textContent = labelFn(p);
  });

  return {
    root,
    refresh() {
      const p = store.getProgress();
      track.setAttribute('aria-valuenow', String(p.pct));
      fill.style.width = `${p.pct}%`;
      label.textContent = labelFn(p);
    },
    unmount() {
      unsub();
      root.remove();
    },
  };
}

export function mountLangSwitch(containerEl, i18n, langs = [{ code: 'zh', label: '中文' }, { code: 'en', label: 'EN' }]) {
  if (!containerEl || !i18n) throw new Error('mountLangSwitch requires containerEl and i18n.');

  const wrap = document.createElement('div');
  wrap.className = 'lang-switch';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Language switcher');

  const buttons = langs.map(({ code, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-btn';
    btn.textContent = label;
    btn.setAttribute('aria-pressed', String(i18n.getLang() === code));
    btn.addEventListener('click', () => i18n.setLang(code));
    wrap.append(btn);
    return { code, btn };
  });

  containerEl.append(wrap);

  const unsub = i18n.subscribe((active) => {
    for (const { code, btn } of buttons) {
      btn.setAttribute('aria-pressed', String(code === active));
    }
  });

  return {
    root: wrap,
    unmount() {
      unsub();
      wrap.remove();
    },
  };
}
