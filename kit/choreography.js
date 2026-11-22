/**
 * Simulify v2 Declarative Progressive-Reveal & Choreography Engine (`ActorChoreographer`).
 *
 * Pure function of time `t`: every 3D Object3D, HtmlSurface, HUD panel, and camera
 * beat is computed deterministically from `t` with zero drift on forward/backward
 * scrubbing, enforcing sparse `t = 0` openings and causally timed introductions.
 */

import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic } from './spacetime.js';

function readVec3(obj, fallback = [0, 0, 0]) {
  if (Array.isArray(obj) && obj.length >= 3) {
    return [Number(obj[0]) || 0, Number(obj[1]) || 0, Number(obj[2]) || 0];
  }
  if (obj && typeof obj === 'object' && 'x' in obj && 'y' in obj && 'z' in obj) {
    return [Number(obj.x) || 0, Number(obj.y) || 0, Number(obj.z) || 0];
  }
  return [...fallback];
}

function readScale3(val, fallback = [1, 1, 1]) {
  if (typeof val === 'number' && Number.isFinite(val)) return [val, val, val];
  return readVec3(val, fallback);
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function lerpAngle(a, b, u) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * u;
}

function detectKind(target, explicitKind) {
  if (explicitKind) return explicitKind;
  if (!target) return '3d';
  if (target.mesh || (target.element && typeof target.setOpacity === 'function')) return 'surface';
  if (typeof target.setAttribute === 'function' && 'style' in target) return 'hud';
  return '3d';
}

function collect3dMaterials(root) {
  const mats = [];
  if (!root || typeof root.traverse !== 'function') {
    if (root?.material) {
      const list = Array.isArray(root.material) ? root.material : [root.material];
      for (const m of list) if (m) mats.push(m);
    }
    return mats;
  }
  const seen = new Set();
  root.traverse((child) => {
    if (!child.material) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of list) {
      if (m && !seen.has(m)) {
        seen.add(m);
        mats.push(m);
      }
    }
  });
  return mats;
}

function styleTransform(style, u, restPos, restScale, opts = {}) {
  // u = 0 -> fully off-stage/entered-from, u = 1 -> fully at rest
  const pos = [...restPos];
  const scale = [...restScale];
  const inv = 1 - u;

  switch (style) {
    case 'drop': {
      const dropY = opts.offset ?? opts.distance ?? 1.4;
      pos[1] = restPos[1] + dropY * inv;
      const sc = lerp(opts.fromScale ?? 0.92, 1, u);
      scale[0] *= sc;
      scale[1] *= sc;
      scale[2] *= sc;
      break;
    }
    case 'rise': {
      const riseY = opts.offset ?? opts.distance ?? 0.95;
      pos[1] = restPos[1] - riseY * inv;
      break;
    }
    case 'slide': {
      const delta = readVec3(opts.from ?? opts.enterFrom, [-1.5, 0, 0]);
      pos[0] = restPos[0] + delta[0] * inv;
      pos[1] = restPos[1] + delta[1] * inv;
      pos[2] = restPos[2] + delta[2] * inv;
      break;
    }
    case 'grow':
    case 'shrink': {
      const fromS = opts.fromScale ?? 0.001;
      const sc = Math.max(0.0001, lerp(fromS, 1, u));
      scale[0] *= sc;
      scale[1] *= sc;
      scale[2] *= sc;
      break;
    }
    case 'fade':
    default:
      break;
  }

  return { pos, scale };
}

/**
 * Pure-function-of-`t` choreography engine for progressive temporal storytelling.
 */
export class ActorChoreographer {
  constructor({ initialCamera = null } = {}) {
    this.actors = new Map();
    this._focusEvents = [];
    this._cameraBeats = [];
    this._calloutEvents = new Map();
    this._initialCamera = initialCamera ? this.#normalizePose(initialCamera) : null;
    this._matOriginals = new WeakMap();
    this._lastT = 0;
  }

  /**
   * Register a 3D Object3D, DOM HUD element, or HtmlSurface actor.
   * @param {string} id
   * @param {any} target
   * @param {{
   *   kind?: '3d'|'hud'|'surface',
   *   restPos?: number[]|{x:number,y:number,z:number},
   *   restScale?: number|number[]|{x:number,y:number,z:number},
   *   enterFrom?: number[],
   *   initiallyVisible?: boolean,
   *   countInSparsity?: boolean,
   *   onApply?: (state: any, target: any, t: number) => void,
   * }} [opts]
   */
  register(id, target, opts = {}) {
    const kind = detectKind(target, opts.kind);
    const obj3d = kind === 'surface' ? target?.mesh || null : kind === '3d' ? target : null;
    const domEl = kind === 'surface' ? target?.element || null : kind === 'hud' ? target : null;

    const restPos = opts.restPos
      ? readVec3(opts.restPos)
      : obj3d?.position
        ? readVec3(obj3d.position)
        : [0, 0, 0];
    const restScale = opts.restScale !== undefined
      ? readScale3(opts.restScale)
      : obj3d?.scale
        ? readScale3(obj3d.scale)
        : [1, 1, 1];

    const actor = {
      id: String(id),
      kind,
      target,
      obj3d,
      domEl,
      restPos,
      restScale,
      enterFrom: opts.enterFrom ? readVec3(opts.enterFrom) : null,
      explicitInitial: opts.initiallyVisible !== undefined,
      initiallyVisible: opts.initiallyVisible !== undefined ? Boolean(opts.initiallyVisible) : true,
      countInSparsity: opts.countInSparsity !== undefined ? Boolean(opts.countInSparsity) : true,
      onApply: typeof opts.onApply === 'function' ? opts.onApply : null,
      events: [], // [{ type: 'enter'|'exit', t0, dur, style, ease, opts }]
      _sorted: true,
    };

    if (domEl && domEl.classList) {
      domEl.classList.add('hud-reveal');
    }

    this.actors.set(actor.id, actor);
    return this;
  }

  unregister(id) {
    this.actors.delete(String(id));
    return this;
  }

  /**
   * Schedule an actor entrance at time `t0` over `dur` seconds.
   * Actors with an `enter` at `t0 > 0` automatically start hidden at `t < t0`
   * unless `initiallyVisible: true` was explicitly passed to `register()`.
   */
  enter(id, t0, dur = 0.65, style = 'drop', opts = {}) {
    const actor = this.actors.get(String(id));
    if (!actor) {
      throw new Error(`ActorChoreographer.enter: unknown actor "${id}". Register it first.`);
    }
    const start = Math.max(0, Number(t0) || 0);
    const length = Math.max(0, Number(dur) || 0);
    if (!actor.explicitInitial && start > 0 && actor.events.length === 0) {
      actor.initiallyVisible = false;
    }
    const defaultEase = style === 'grow' ? easeOutBack : easeOutCubic;
    actor.events.push({
      type: 'enter',
      t0: start,
      dur: length,
      style,
      ease: typeof opts.ease === 'function' ? opts.ease : defaultEase,
      opts: actor.enterFrom && !opts.from ? { ...opts, from: actor.enterFrom } : opts,
    });
    actor._sorted = false;
    return this;
  }

  /**
   * Schedule an actor exit at time `t0` over `dur` seconds.
   */
  exit(id, t0, dur = 0.45, style = 'fade', opts = {}) {
    const actor = this.actors.get(String(id));
    if (!actor) {
      throw new Error(`ActorChoreographer.exit: unknown actor "${id}". Register it first.`);
    }
    const start = Math.max(0, Number(t0) || 0);
    const length = Math.max(0, Number(dur) || 0);
    actor.events.push({
      type: 'exit',
      t0: start,
      dur: length,
      style,
      ease: typeof opts.ease === 'function' ? opts.ease : easeInOutCubic,
      opts,
    });
    actor._sorted = false;
    return this;
  }

  /**
   * Progressive disclosure for a contextual HUD panel/card/chart (hidden for `t < t0`).
   * Accepts an already-registered id OR a direct DOM element (if `id` is an element,
   * uses its `id` attribute; or registers `el` via `opts.el`).
   */
  hudReveal(id, t0, dur = 0.4, opts = {}) {
    const key = String(id);
    if (!this.actors.has(key)) {
      const el = opts.el || (typeof document !== 'undefined' ? document.getElementById(key) : null);
      if (!el) {
        throw new Error(`ActorChoreographer.hudReveal: element/actor "${key}" not found.`);
      }
      this.register(key, el, {
        kind: 'hud',
        initiallyVisible: false,
        countInSparsity: opts.countInSparsity ?? true,
      });
    } else {
      const actor = this.actors.get(key);
      if (!actor.explicitInitial && (Number(t0) || 0) > 0) {
        actor.initiallyVisible = false;
      }
    }
    return this.enter(key, t0, dur, opts.style ?? 'slide', {
      from: opts.from ?? [0, 12, 0],
      ...opts,
    });
  }

  /**
   * Highlight `activeIds` and smoothly dim all other actors to `dimOpacity` starting at `t0`.
   * Pass `null` or `'all'` as `activeIds` to restore full brightness to every actor.
   */
  focus(activeIds, t0, dur = 0.45, { dimOpacity = 0.2, holdUntil = Infinity, releaseDur = 0.4, ease = easeInOutCubic } = {}) {
    const isAll = activeIds === null || activeIds === 'all' || (Array.isArray(activeIds) && activeIds.length === 0);
    const set = isAll ? null : new Set((Array.isArray(activeIds) ? activeIds : [activeIds]).map(String));
    const start = Math.max(0, Number(t0) || 0);
    const length = Math.max(0, Number(dur) || 0);

    this._focusEvents.push({
      activeSet: set,
      t0: start,
      dur: length,
      dimOpacity: Math.max(0.02, Math.min(1, Number(dimOpacity) ?? 0.2)),
      ease: typeof ease === 'function' ? ease : easeInOutCubic,
    });

    if (Number.isFinite(holdUntil) && holdUntil > start + length) {
      this._focusEvents.push({
        activeSet: null,
        t0: holdUntil,
        dur: Math.max(0, Number(releaseDur) || 0),
        dimOpacity: 1,
        ease: typeof ease === 'function' ? ease : easeInOutCubic,
      });
    }

    this._focusEvents.sort((a, b) => a.t0 - b.t0);
    return this;
  }

  /**
   * Register a pure-function camera keyframe beat transitioning to `pose` over `[t0, t0 + dur]`.
   * @param {number} t0
   * @param {number} dur
   * @param {{ azimuth?: number, elevation?: number, distance?: number, target?: number[], zoom?: number, fov?: number }} pose
   * @param {(u: number) => number} [ease]
   */
  cameraBeat(t0, dur = 0.85, pose = {}, ease = easeInOutCubic) {
    const start = Math.max(0, Number(t0) || 0);
    const length = Math.max(0, Number(dur) || 0);
    this._cameraBeats.push({
      t0: start,
      dur: length,
      pose: this.#normalizePose(pose),
      ease: typeof ease === 'function' ? ease : easeInOutCubic,
    });
    this._cameraBeats.sort((a, b) => a.t0 - b.t0);
    return this;
  }

  /**
   * Schedule reveal/hide for a CalloutLayer item id (pure function of `t`).
   */
  calloutReveal(calloutId, t0, dur = 0.3, { exitAt = Infinity, exitDur = 0.25 } = {}) {
    this._calloutEvents.set(String(calloutId), {
      t0: Math.max(0, Number(t0) || 0),
      dur: Math.max(0, Number(dur) || 0),
      exitAt: Number.isFinite(exitAt) ? exitAt : Infinity,
      exitDur: Math.max(0, Number(exitDur) || 0),
    });
    return this;
  }

  /** Query pure callout opacity (0..1) at time `t` for CalloutLayer integration. */
  getCalloutOpacity(calloutId, t = this._lastT) {
    const ev = this._calloutEvents.get(String(calloutId));
    if (!ev) return 1;
    const time = Math.max(0, Number(t) || 0);
    if (time < ev.t0) return 0;
    let alpha = ev.dur > 0 ? easeOutCubic((time - ev.t0) / ev.dur) : 1;
    if (time >= ev.exitAt) {
      const out = ev.exitDur > 0 ? 1 - easeOutCubic((time - ev.exitAt) / ev.exitDur) : 0;
      alpha = Math.min(alpha, out);
    }
    return clamp01(alpha);
  }

  /** Pure-function camera pose interpolation at time `t` (no side effects). */
  getCameraPoseAt(t = this._lastT) {
    if (this._cameraBeats.length === 0) {
      return this._initialCamera ? this.#clonePose(this._initialCamera) : null;
    }
    const time = Math.max(0, Number(t) || 0);
    let current = this._initialCamera
      ? this.#clonePose(this._initialCamera)
      : this.#clonePose(this._cameraBeats[0].pose);

    for (const beat of this._cameraBeats) {
      if (time < beat.t0) {
        break;
      }
      if (beat.dur <= 0 || time >= beat.t0 + beat.dur) {
        current = this.#mergePose(current, beat.pose);
      } else {
        const u = beat.ease((time - beat.t0) / beat.dur);
        current = this.#lerpPose(current, beat.pose, u);
        break;
      }
    }
    return current;
  }

  /**
   * Pure, side-effect-free count of visible active actors at time `t`.
   * Used by `verify_stage.py` `initial-sparsity` oracle (`getActiveActorCount(0) < getActiveActorCount(T)`).
   */
  getActiveActorCount(t = this._lastT) {
    const time = Math.max(0, Number(t) || 0);
    let count = 0;
    for (const actor of this.actors.values()) {
      if (!actor.countInSparsity) continue;
      const st = this.#computeActorState(actor, time);
      if (st.visible) count += 1;
    }
    return count;
  }

  /** Return a concise cast & reveal manifest for inspection or ledger verification. */
  getCastLedger() {
    const ledger = [];
    for (const actor of this.actors.values()) {
      this.#ensureSorted(actor);
      const firstEnter = actor.events.find((e) => e.type === 'enter');
      const firstExit = actor.events.find((e) => e.type === 'exit');
      ledger.push({
        id: actor.id,
        kind: actor.kind,
        initiallyVisible: actor.initiallyVisible,
        enterAt: firstEnter ? firstEnter.t0 : (actor.initiallyVisible ? 0 : null),
        enterStyle: firstEnter ? firstEnter.style : null,
        exitAt: firstExit ? firstExit.t0 : null,
      });
    }
    return ledger;
  }

  /**
   * Deterministically evaluate and apply all actor lifecycles, focus dimming,
   * HUD progressive reveals, and camera pose at time `t`.
   */
  evaluate(t, { apply = true, stage = null } = {}) {
    const time = Math.max(0, Number(t) || 0);
    this._lastT = time;

    const focusInfo = this.#computeFocusAt(time);
    const cameraPose = this.getCameraPoseAt(time);
    const visibleActors = [];
    const actorStates = {};
    let visibleCount = 0;
    let visible3dCount = 0;
    let visibleHudCount = 0;

    for (const actor of this.actors.values()) {
      const base = this.#computeActorState(actor, time);
      const focusOpacity = this.#focusMultiplierFor(actor.id, focusInfo);
      const finalOpacity = clamp01(base.opacity * focusOpacity);
      const visible = base.visible && finalOpacity > 0.005;
      const state = {
        id: actor.id,
        kind: actor.kind,
        visible,
        opacity: finalOpacity,
        lifecycleOpacity: base.opacity,
        focusOpacity,
        progress: base.progress,
        pos: base.pos,
        scale: base.scale,
      };
      actorStates[actor.id] = state;

      if (visible) {
        visibleActors.push(actor.id);
        if (actor.countInSparsity) visibleCount += 1;
        if (actor.kind === 'hud') visibleHudCount += 1;
        else visible3dCount += 1;
      }

      if (apply) {
        this.#applyActorState(actor, state, time);
      }
    }

    if (apply && stage && cameraPose && typeof stage.setCameraImmediate === 'function') {
      stage.setCameraImmediate(cameraPose);
    }

    return {
      t: time,
      visibleActors,
      visibleCount,
      visible3dCount,
      visibleHudCount,
      cameraPose,
      activeFocus: focusInfo.activeIds,
      actorStates,
    };
  }

  #ensureSorted(actor) {
    if (!actor._sorted) {
      actor.events.sort((a, b) => a.t0 - b.t0);
      actor._sorted = true;
    }
  }

  #computeActorState(actor, t) {
    this.#ensureSorted(actor);
    let visible = actor.initiallyVisible;
    let opacity = visible ? 1 : 0;
    let progress = visible ? 1 : 0;
    let pos = [...actor.restPos];
    let scale = [...actor.restScale];

    for (const ev of actor.events) {
      if (t < ev.t0) break;
      const raw = ev.dur > 0 ? clamp01((t - ev.t0) / ev.dur) : 1;
      const eased = ev.ease(raw);

      if (ev.type === 'enter') {
        const tf = styleTransform(ev.style, eased, actor.restPos, actor.restScale, ev.opts);
        pos = tf.pos;
        scale = tf.scale;
        opacity = clamp01(raw >= 1 ? 1 : easeOutCubic(raw));
        progress = raw;
        visible = opacity > 0.005 || raw > 0;
      } else {
        // Exit reverses the transition smoothly (1 -> 0)
        const invRaw = 1 - raw;
        const invEased = 1 - eased;
        const tf = styleTransform(ev.style, invEased, actor.restPos, actor.restScale, ev.opts);
        pos = tf.pos;
        scale = tf.scale;
        opacity = clamp01(invRaw);
        progress = invRaw;
        visible = raw < 1 && opacity > 0.005;
      }
    }

    return { visible, opacity, progress, pos, scale };
  }

  #computeFocusAt(t) {
    if (this._focusEvents.length === 0) {
      return { activeIds: null, prevSet: null, prevDim: 1, nextSet: null, nextDim: 1, blend: 1 };
    }
    let prevSet = null;
    let prevDim = 1;
    let nextSet = null;
    let nextDim = 1;
    let blend = 1;

    for (const ev of this._focusEvents) {
      if (t < ev.t0) break;
      const raw = ev.dur > 0 ? clamp01((t - ev.t0) / ev.dur) : 1;
      if (raw >= 1) {
        prevSet = ev.activeSet;
        prevDim = ev.activeSet ? ev.dimOpacity : 1;
        nextSet = prevSet;
        nextDim = prevDim;
        blend = 1;
      } else {
        nextSet = ev.activeSet;
        nextDim = ev.activeSet ? ev.dimOpacity : 1;
        blend = ev.ease(raw);
        break;
      }
    }

    return {
      activeIds: nextSet ? Array.from(nextSet) : null,
      prevSet,
      prevDim,
      nextSet,
      nextDim,
      blend,
    };
  }

  #focusMultiplierFor(actorId, focusInfo) {
    const startMult = focusInfo.prevSet === null || focusInfo.prevSet.has(actorId) ? 1 : focusInfo.prevDim;
    const endMult = focusInfo.nextSet === null || focusInfo.nextSet.has(actorId) ? 1 : focusInfo.nextDim;
    return lerp(startMult, endMult, focusInfo.blend);
  }

  #applyActorState(actor, state, t) {
    if (actor.obj3d) {
      actor.obj3d.visible = state.visible;
      if (actor.obj3d.position?.set) {
        actor.obj3d.position.set(state.pos[0], state.pos[1], state.pos[2]);
      }
      if (actor.obj3d.scale?.set) {
        actor.obj3d.scale.set(state.scale[0], state.scale[1], state.scale[2]);
      }
      this.#apply3dOpacity(actor.obj3d, state.opacity);
    }

    if (actor.domEl) {
      const el = actor.domEl;
      if (el.dataset) {
        el.dataset.hudHidden = state.visible ? 'false' : 'true';
        el.dataset.choreoVisible = state.visible ? 'true' : 'false';
      }
      if ('hidden' in el && actor.kind === 'hud') {
        el.hidden = !state.visible;
      }
      if (el.style) {
        el.style.opacity = state.opacity.toFixed(3);
        el.style.pointerEvents = state.visible && state.opacity > 0.25 ? '' : 'none';
        if (actor.kind === 'hud') {
          const dx = state.pos[0] - actor.restPos[0];
          const dy = state.pos[1] - actor.restPos[1];
          if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
            el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
          } else {
            el.style.transform = '';
          }
        }
      }
    }

    if (actor.kind === 'surface' && actor.target) {
      if (typeof actor.target.setVisible === 'function') actor.target.setVisible(state.visible);
      if (typeof actor.target.setOpacity === 'function') actor.target.setOpacity(state.opacity);
    }

    if (actor.onApply) {
      actor.onApply(state, actor.target, t);
    }
  }

  #apply3dOpacity(obj3d, opacity) {
    const mats = collect3dMaterials(obj3d);
    for (const mat of mats) {
      if (!this._matOriginals.has(mat)) {
        this._matOriginals.set(mat, {
          opacity: mat.opacity ?? 1,
          transparent: Boolean(mat.transparent),
          depthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true,
        });
      }
      const orig = this._matOriginals.get(mat);
      const targetOpacity = orig.opacity * opacity;
      if (opacity < 0.999) {
        mat.transparent = true;
        mat.opacity = targetOpacity;
        if (targetOpacity < 0.85 && 'depthWrite' in mat) {
          mat.depthWrite = false;
        }
      } else {
        mat.transparent = orig.transparent;
        mat.opacity = orig.opacity;
        if ('depthWrite' in mat) {
          mat.depthWrite = orig.depthWrite;
        }
      }
    }
  }

  #normalizePose(pose) {
    const out = {};
    if (pose.azimuth !== undefined) out.azimuth = Number(pose.azimuth);
    if (pose.elevation !== undefined) out.elevation = Number(pose.elevation);
    if (pose.distance !== undefined) out.distance = Number(pose.distance);
    if (pose.zoom !== undefined) out.zoom = Number(pose.zoom);
    if (pose.fov !== undefined) out.fov = Number(pose.fov);
    if (pose.target !== undefined) out.target = readVec3(pose.target);
    return out;
  }

  #clonePose(pose) {
    const out = { ...pose };
    if (pose.target) out.target = [...pose.target];
    return out;
  }

  #mergePose(base, next) {
    const out = this.#clonePose(base);
    if (next.azimuth !== undefined) out.azimuth = next.azimuth;
    if (next.elevation !== undefined) out.elevation = next.elevation;
    if (next.distance !== undefined) out.distance = next.distance;
    if (next.zoom !== undefined) out.zoom = next.zoom;
    if (next.fov !== undefined) out.fov = next.fov;
    if (next.target !== undefined) out.target = [...next.target];
    return out;
  }

  #lerpPose(a, b, u) {
    const out = this.#clonePose(a);
    if (b.azimuth !== undefined) {
      out.azimuth = a.azimuth !== undefined ? lerpAngle(a.azimuth, b.azimuth, u) : b.azimuth;
    }
    if (b.elevation !== undefined) {
      out.elevation = a.elevation !== undefined ? lerp(a.elevation, b.elevation, u) : b.elevation;
    }
    if (b.distance !== undefined) {
      out.distance = a.distance !== undefined ? lerp(a.distance, b.distance, u) : b.distance;
    }
    if (b.zoom !== undefined) {
      out.zoom = a.zoom !== undefined ? lerp(a.zoom, b.zoom, u) : b.zoom;
    }
    if (b.fov !== undefined) {
      out.fov = a.fov !== undefined ? lerp(a.fov, b.fov, u) : b.fov;
    }
    if (b.target !== undefined) {
      const fromT = a.target || b.target;
      out.target = [
        lerp(fromT[0], b.target[0], u),
        lerp(fromT[1], b.target[1], u),
        lerp(fromT[2], b.target[2], u),
      ];
    }
    return out;
  }
}
