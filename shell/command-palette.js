/**
 * Accessible Ctrl+K / Cmd+K command palette for jumping across lessons,
 * multi-act stages, and key concepts inside multi-world sites or desktop apps.
 */
export class CommandPalette {
  /**
   * @param {{
   *   items?: Array<{ id: string, title: string, subtitle?: string, keywords?: string[] }>,
   *   onSelect?: (item: any) => void,
   *   placeholder?: string,
   *   emptyText?: string,
   *   shortcut?: boolean
   * }} [opts]
   */
  constructor({
    items = [],
    onSelect = null,
    placeholder = '搜索课程、分幕或核心概念…',
    emptyText = '无匹配项',
    shortcut = true,
  } = {}) {
    this.items = Array.isArray(items) ? items : [];
    this.onSelect = typeof onSelect === 'function' ? onSelect : null;
    this.emptyText = emptyText;
    this.activeIdx = 0;
    this.filtered = [...this.items];

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'cmd-palette';
    this.dialog.setAttribute('aria-label', placeholder);

    const head = document.createElement('div');
    head.className = 'palette-head';

    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.className = 'palette-input';
    this.input.placeholder = placeholder;
    this.input.setAttribute('aria-label', placeholder);
    head.append(this.input);

    this.list = document.createElement('ul');
    this.list.className = 'palette-list';
    this.list.setAttribute('role', 'listbox');

    this.dialog.append(head, this.list);
    document.body.append(this.dialog);

    this._onInput = () => this.#filter(this.input.value);
    this._onKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.filtered.length) {
          this.activeIdx = (this.activeIdx + 1) % this.filtered.length;
          this.#renderList();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.filtered.length) {
          this.activeIdx = (this.activeIdx - 1 + this.filtered.length) % this.filtered.length;
          this.#renderList();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = this.filtered[this.activeIdx];
        if (picked) {
          this.close();
          this.onSelect?.(picked);
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    };
    this._onBackdropClick = (e) => {
      if (e.target === this.dialog) this.close();
    };
    this._onGlobalKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.dialog.open) this.close();
        else this.open();
      }
    };

    this.input.addEventListener('input', this._onInput);
    this.input.addEventListener('keydown', this._onKeyDown);
    this.dialog.addEventListener('click', this._onBackdropClick);
    if (shortcut) {
      globalThis.addEventListener?.('keydown', this._onGlobalKey);
    }

    this.#filter('');
  }

  setItems(items) {
    this.items = Array.isArray(items) ? items : [];
    this.#filter(this.input.value);
  }

  setPlaceholder(text) {
    this.input.placeholder = text;
    this.input.setAttribute('aria-label', text);
    this.dialog.setAttribute('aria-label', text);
  }

  open() {
    if (!this.dialog.open) {
      if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
      else this.dialog.setAttribute('open', '');
    }
    this.input.value = '';
    this.#filter('');
    this.input.focus();
  }

  close() {
    if (typeof this.dialog.close === 'function' && this.dialog.open) {
      this.dialog.close();
    } else {
      this.dialog.removeAttribute('open');
    }
  }

  destroy() {
    this.input.removeEventListener('input', this._onInput);
    this.input.removeEventListener('keydown', this._onKeyDown);
    this.dialog.removeEventListener('click', this._onBackdropClick);
    globalThis.removeEventListener?.('keydown', this._onGlobalKey);
    this.dialog.remove();
  }

  #filter(query) {
    const q = String(query || '').trim().toLowerCase();
    this.filtered = q
      ? this.items.filter((item) => {
          const hay = [item.title, item.subtitle, ...(item.keywords || [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : [...this.items];
    this.activeIdx = 0;
    this.#renderList();
  }

  #renderList() {
    const frag = document.createDocumentFragment();
    if (this.filtered.length === 0) {
      const li = document.createElement('li');
      li.className = 'palette-sub';
      li.style.padding = '10px';
      li.textContent = this.emptyText;
      frag.append(li);
      this.list.replaceChildren(frag);
      return;
    }

    this.filtered.forEach((item, idx) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-item';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(idx === this.activeIdx));

      const title = document.createElement('span');
      title.textContent = item.title;
      const sub = document.createElement('span');
      sub.className = 'palette-sub';
      sub.textContent = item.subtitle ?? '';
      btn.append(title, sub);

      btn.addEventListener('click', () => {
        this.close();
        this.onSelect?.(item);
      });
      li.append(btn);
      frag.append(li);
    });
    this.list.replaceChildren(frag);
  }
}
