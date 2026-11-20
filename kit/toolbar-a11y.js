/**
 * Implements roving-tabindex keyboard fallback for [role="toolbar"] containers
 * ONLY when native HTML `focusgroup` is unsupported by the browser.
 */
export function initToolbars(root = document) {
  if ('focusGroup' in HTMLElement.prototype) return;

  for (const bar of root.querySelectorAll('[role="toolbar"]')) {
    if (bar.dataset.toolbarBound === 'true') continue;
    bar.dataset.toolbarBound = 'true';

    const getItems = () =>
      Array.from(bar.querySelectorAll('button, [role="button"], a[href]')).filter(
        (el) => !el.hidden && !el.disabled
      );

    const items = getItems();
    if (!items.length) continue;

    items.forEach((b, i) => {
      b.tabIndex = i === 0 ? 0 : -1;
    });

    bar.addEventListener('focusin', (e) => {
      const current = getItems();
      if (current.includes(e.target)) {
        current.forEach((b) => {
          b.tabIndex = b === e.target ? 0 : -1;
        });
      }
    });

    bar.addEventListener('keydown', (e) => {
      const current = getItems();
      const idx = current.indexOf(document.activeElement);
      if (idx === -1) return;

      const vertical = bar.getAttribute('aria-orientation') === 'vertical';
      const rtl = getComputedStyle(bar).direction === 'rtl';
      const steps = vertical
        ? { ArrowDown: 1, ArrowUp: -1 }
        : { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };

      let nextIdx = null;
      if (e.key in steps) {
        nextIdx = (idx + steps[e.key] + current.length) % current.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = current.length - 1;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        current.forEach((b, i) => {
          b.tabIndex = i === nextIdx ? 0 : -1;
        });
        current[nextIdx].focus();
      }
    });
  }
}
