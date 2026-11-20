/**
 * Projects 3D world events into crisp temporary floating badges
 * animated via the Web Animations API (WAAPI).
 */
export class FloatingPopups {
  constructor(stage, containerEl) {
    this.stage = stage;
    this.container = containerEl;
  }

  spawn(worldPos, text, tone = 'teal') {
    if (!this.container || !this.stage) return;
    const pt = this.stage.projectToScreen(worldPos);
    if (!pt.visible) return;

    const { width, height } = this.stage.size;
    const x = Math.max(64, Math.min(width - 64, pt.x));
    const y = Math.max(58, Math.min(height - 70, pt.y));

    const el = document.createElement('div');
    el.className = 'float-popup';
    el.dataset.tone = tone;
    el.textContent = text;
    this.container.append(el);

    const reduced = this.stage.reducedMotion;
    const keyframes = reduced
      ? [
          { opacity: 0, transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)` },
          { opacity: 1, offset: 0.15, transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)` },
          { opacity: 0, transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)` },
        ]
      : [
          { opacity: 0, transform: `translate3d(${x}px, ${y + 4}px, 0) translate(-50%, -100%) scale(0.9)` },
          { opacity: 1, offset: 0.16, transform: `translate3d(${x}px, ${y - 12}px, 0) translate(-50%, -100%) scale(1.03)` },
          { opacity: 0, transform: `translate3d(${x}px, ${y - 38}px, 0) translate(-50%, -100%) scale(0.98)` },
        ];

    const anim = el.animate(keyframes, {
      duration: reduced ? 550 : 920,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    });

    const cleanup = () => el.remove();
    anim.onfinish = cleanup;
    anim.oncancel = cleanup;
  }

  clear() {
    this.container?.replaceChildren();
  }
}
