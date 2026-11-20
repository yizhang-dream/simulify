/**
 * Collapsible formal mathematical substitution & truth/transition table panel.
 * Synchronizes equations, live-substituted variables, active lookup rows,
 * and single-step causal traces directly from a single solve() ground truth.
 */
export class LiveMathsPanel {
  /**
   * @param {HTMLElement} containerEl
   * @param {{ title?: string, subtitle?: string, collapsed?: boolean }} [options]
   */
  constructor(containerEl, { title = '活公式与推导', subtitle = '', collapsed = false } = {}) {
    if (!containerEl) {
      throw new Error('LiveMathsPanel requires a valid container element.');
    }
    this.container = containerEl;
    this.detailsEl = document.createElement('details');
    this.detailsEl.className = 'live-maths-panel';
    this.detailsEl.open = !collapsed;

    this.summaryEl = document.createElement('summary');
    this.summaryEl.className = 'live-maths-summary';

    const titleWrap = document.createElement('span');
    titleWrap.className = 'live-maths-heading';

    this.titleEl = document.createElement('strong');
    this.titleEl.className = 'live-maths-title';
    this.titleEl.textContent = title;

    this.subtitleEl = document.createElement('span');
    this.subtitleEl.className = 'live-maths-subtitle';
    this.subtitleEl.textContent = subtitle;
    this.subtitleEl.hidden = !subtitle;

    titleWrap.append(this.titleEl, this.subtitleEl);

    this.badgeEl = document.createElement('span');
    this.badgeEl.className = 'live-maths-badge';
    this.badgeEl.hidden = true;

    this.summaryEl.append(titleWrap, this.badgeEl);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'live-maths-body';

    this.detailsEl.append(this.summaryEl, this.bodyEl);
    this.container.append(this.detailsEl);
  }

  /**
   * Toggle panel visibility.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.detailsEl.hidden = !visible;
  }

  /**
   * Expand or collapse the details drawer.
   * @param {boolean} open
   */
  setOpen(open) {
    this.detailsEl.open = Boolean(open);
  }

  /**
   * Atomically re-render equations, active comparison table, and single-step breakdown.
   * @param {{
   *   badge?: string,
   *   subtitle?: string,
   *   equations?: Array<{ label?: string, tokens: Array<{ text: string, tone?: 'teal'|'amber'|'danger'|'navy'|'muted', emph?: boolean, sub?: string }> }>,
   *   table?: { caption?: string, headers: Array<string|number>, rows: Array<Array<string|number>>, activeRow?: number, note?: string },
   *   breakdown?: Array<{ tag: string, text: string, tone?: 'teal'|'amber'|'danger'|'navy' }>
   * }} [payload]
   */
  update({ badge, subtitle, equations = [], table = null, breakdown = [] } = {}) {
    if (subtitle !== undefined) {
      this.subtitleEl.textContent = subtitle;
      this.subtitleEl.hidden = !subtitle;
    }
    if (badge !== undefined) {
      this.badgeEl.textContent = badge;
      this.badgeEl.hidden = !badge;
    }

    const fragment = document.createDocumentFragment();

    if (equations.length > 0) {
      const eqList = document.createElement('div');
      eqList.className = 'eq-list';
      for (const eq of equations) {
        eqList.append(this.#buildEquationBlock(eq));
      }
      fragment.append(eqList);
    }

    if (table && Array.isArray(table.headers) && Array.isArray(table.rows)) {
      fragment.append(this.#buildTableBlock(table));
    }

    if (breakdown.length > 0) {
      const list = document.createElement('ul');
      list.className = 'breakdown-list';
      for (const item of breakdown) {
        list.append(this.#buildBreakdownItem(item));
      }
      fragment.append(list);
    }

    this.bodyEl.replaceChildren(fragment);
  }

  /** Remove panel DOM nodes. */
  destroy() {
    this.detailsEl.remove();
  }

  #buildEquationBlock(eq) {
    const block = document.createElement('div');
    block.className = 'eq-block';

    if (eq.label) {
      const label = document.createElement('div');
      label.className = 'eq-label';
      label.textContent = eq.label;
      block.append(label);
    }

    const line = document.createElement('div');
    line.className = 'eq-line';
    for (const token of eq.tokens || []) {
      const span = document.createElement('span');
      span.className = 'eq-term';
      if (token.tone) span.dataset.tone = token.tone;
      if (token.emph) span.classList.add('is-emph');
      span.append(document.createTextNode(String(token.text ?? '')));
      if (token.sub) {
        const sub = document.createElement('sub');
        sub.textContent = String(token.sub);
        span.append(sub);
      }
      line.append(span);
    }
    block.append(line);
    return block;
  }

  #buildTableBlock(table) {
    const wrap = document.createElement('div');
    wrap.className = 'live-table-wrap';

    const tableEl = document.createElement('table');
    tableEl.className = 'live-table';

    if (table.caption) {
      const cap = document.createElement('caption');
      cap.className = 'live-table-caption';
      cap.textContent = table.caption;
      tableEl.append(cap);
    }

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const h of table.headers) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = String(h);
      headRow.append(th);
    }
    thead.append(headRow);
    tableEl.append(thead);

    const tbody = document.createElement('tbody');
    table.rows.forEach((cells, rowIdx) => {
      const tr = document.createElement('tr');
      if (rowIdx === table.activeRow) {
        tr.classList.add('is-active');
        tr.setAttribute('aria-current', 'true');
      }
      for (const cell of cells) {
        const td = document.createElement('td');
        td.textContent = String(cell);
        tr.append(td);
      }
      tbody.append(tr);
    });
    tableEl.append(tbody);
    wrap.append(tableEl);

    if (table.note) {
      const note = document.createElement('div');
      note.className = 'live-table-note';
      note.textContent = table.note;
      wrap.append(note);
    }

    return wrap;
  }

  #buildBreakdownItem(item) {
    const li = document.createElement('li');
    li.className = 'breakdown-item';
    if (item.tone) li.dataset.tone = item.tone;

    const tag = document.createElement('span');
    tag.className = 'breakdown-tag';
    if (item.tone) tag.dataset.tone = item.tone;
    tag.textContent = String(item.tag ?? '');

    const text = document.createElement('span');
    text.className = 'breakdown-text';
    text.textContent = String(item.text ?? '');

    li.append(tag, text);
    return li;
  }
}
