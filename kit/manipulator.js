import * as THREE from 'three';

const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _plane = new THREE.Plane();
const _hitPt = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _axisVec = new THREE.Vector3();
const _orthoVec = new THREE.Vector3();
const _planeNorm = new THREE.Vector3();

function toVec3(v, fallback = [0, 1, 0]) {
  if (v && v.isVector3) return v.clone();
  if (Array.isArray(v)) return new THREE.Vector3(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  if (v && typeof v === 'object') return new THREE.Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0);
  return new THREE.Vector3(...fallback);
}

function setRayFromClient(stage, clientX, clientY) {
  const rect = stage.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  _raycaster.setFromCamera(_ndc, stage.camera);
  return true;
}

function isObjectVisibleInHierarchy(obj) {
  let cur = obj;
  while (cur) {
    if (cur.visible === false) return false;
    cur = cur.parent;
  }
  return true;
}

function getClockBeatKey(state) {
  if (!state || typeof state !== 'object') return null;
  const stagePart = state.stageId ?? state.stageIndex ?? '';
  const stepPart = state.stepId ?? state.beatIndex ?? state.stepIndex ?? '';
  return `${stagePart}:${stepPart}`;
}

function isBeatAllowed(state, allowedBeats) {
  if (!allowedBeats) return true;
  const list = allowedBeats instanceof Set ? allowedBeats : new Set(allowedBeats);
  if (list.size === 0) return true;
  if (!state) return false;
  return (
    list.has(state.beatIndex) ||
    list.has(state.stepIndex) ||
    list.has(state.stageIndex) ||
    (state.stepId !== undefined && list.has(state.stepId)) ||
    (state.stageId !== undefined && list.has(state.stageId))
  );
}

/**
 * Direct 3D manipulation toolkit for Simulify stages.
 * Intercepts pointer events in capture phase BEFORE IsometricStage orbit controls so
 * dragging a 3D handle/slider/lever manipulates the mechanism instead of spinning the camera,
 * and enforces cursor priority in bubble phase AFTER `stage-3d.js` hover updates.
 */
export class StageManipulator {
  constructor(
    stage,
    {
      onHover = null,
      onClick = null,
      clock = null,
      autoExitOnBeatChange = true,
      allowedBeats = null,
      disableOnBeatChange = false,
      onBeatExit = null,
    } = {}
  ) {
    this.stage = stage;
    this.canvas = stage.canvas;
    this._onHover = onHover;
    this._onClick = onClick;
    this._onBeatExit = typeof onBeatExit === 'function' ? onBeatExit : null;
    this._entries = new Map();
    this._roots = [];
    this._enabled = true;
    this._hoveredId = null;
    this._activeDrag = null;
    this._desiredCursor = null;
    this._clockUnsub = null;
    this._disposed = false;

    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onBubbleCursorSync = () => this._syncCursorAfterStage();

    this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas.addEventListener('pointermove', this._onPointerMove, { capture: true });
    this.canvas.addEventListener('pointerup', this._onPointerUp, { capture: true });
    this.canvas.addEventListener('pointercancel', this._onPointerUp, { capture: true });

    // Bubble-phase cursor enforcement runs strictly after stage-3d.js _setHover()
    this.canvas.addEventListener('pointermove', this._onBubbleCursorSync);
    this.canvas.addEventListener('pointerup', this._onBubbleCursorSync);
    this.canvas.addEventListener('pointercancel', this._onBubbleCursorSync);

    if (clock) {
      this.bindClock(clock, {
        autoExitOnBeatChange,
        allowedBeats,
        disableOnBeatChange,
        onBeatExit: this._onBeatExit,
      });
    }
  }

  /**
   * Register a draggable 3D handle (2D plane drag OR 1D axis slider drag).
   * @param {string} id
   * @param {THREE.Object3D} object3D
   * @param {{
   *   planeNormal?: [number,number,number]|THREE.Vector3,
   *   planePoint?: [number,number,number]|THREE.Vector3,
   *   axis?: [number,number,number]|THREE.Vector3,
   *   origin?: [number,number,number]|THREE.Vector3,
   *   min?: number,
   *   max?: number,
   *   cursor?: string,
   *   dragCursor?: string,
   *   meta?: Record<string, any>,
   *   onHover?: (hovered: boolean, info: any) => void,
   *   onDragStart?: (info: any) => void,
   *   onDrag?: (info: any) => void,
   *   onDragEnd?: (info: any) => void,
   *   onClick?: (info: any) => void,
   * }} [config]
   */
  addHandle(id, object3D, config = {}) {
    object3D.userData._manipId = id;
    object3D.traverse((ch) => {
      ch.userData._manipId = id;
    });
    const entry = {
      id,
      kind: 'handle',
      object3D,
      planeNormal: config.planeNormal ? toVec3(config.planeNormal).normalize() : null,
      planePoint: config.planePoint ? toVec3(config.planePoint) : null,
      axis: config.axis ? toVec3(config.axis).normalize() : null,
      origin: config.origin ? toVec3(config.origin) : null,
      min: config.min ?? -Infinity,
      max: config.max ?? Infinity,
      cursor: config.cursor ?? 'grab',
      dragCursor: config.dragCursor ?? 'grabbing',
      meta: config.meta ?? {},
      onHover: config.onHover ?? null,
      onDragStart: config.onDragStart ?? null,
      onDrag: config.onDrag ?? null,
      onDragEnd: config.onDragEnd ?? null,
      onClick: config.onClick ?? null,
    };
    this._entries.set(id, entry);
    this._rebuildRoots();
    return entry;
  }

  /**
   * Register a clickable (non-draggable) interactive 3D target.
   */
  addClickable(id, object3D, config = {}) {
    object3D.userData._manipId = id;
    object3D.traverse((ch) => {
      ch.userData._manipId = id;
    });
    const entry = {
      id,
      kind: 'clickable',
      object3D,
      cursor: config.cursor ?? 'pointer',
      dragCursor: config.cursor ?? 'pointer',
      meta: config.meta ?? {},
      onHover: config.onHover ?? null,
      onClick: config.onClick ?? null,
    };
    this._entries.set(id, entry);
    this._rebuildRoots();
    return entry;
  }

  remove(id) {
    const existing = this._entries.get(id);
    if (!existing) return;
    delete existing.object3D.userData._manipId;
    existing.object3D.traverse((ch) => {
      delete ch.userData._manipId;
    });
    this._entries.delete(id);
    this._rebuildRoots();
    if (this._hoveredId === id) this._hoveredId = null;
    if (this._activeDrag?.entry?.id === id) this._activeDrag = null;
  }

  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
    if (!this._enabled) {
      this._cancelActiveState();
    }
  }

  /**
   * Bind a `SpacetimeClock` or `TimelineDirector` so crossing a beat/stage boundary
   * cleanly cancels active drags/hovers and optionally disables edit mode.
   */
  bindClock(
    clock,
    {
      autoExitOnBeatChange = true,
      allowedBeats = null,
      disableOnBeatChange = false,
      autoRestore = false,
      onBeatExit = null,
    } = {}
  ) {
    if (this._clockUnsub) {
      this._clockUnsub();
      this._clockUnsub = null;
    }
    if (!clock || typeof clock.subscribe !== 'function') return () => {};

    let lastBeatKey = null;
    const unsub = clock.subscribe((state) => {
      if (this._disposed) return;
      const nextKey = getClockBeatKey(state);
      const beatChanged = lastBeatKey !== null && nextKey !== lastBeatKey;
      const allowed = isBeatAllowed(state, allowedBeats);
      lastBeatKey = nextKey;

      if ((beatChanged && autoExitOnBeatChange) || !allowed) {
        this._cancelActiveState();
        if (disableOnBeatChange || !allowed) {
          this.setEnabled(false);
        }
        onBeatExit?.(state);
        if (onBeatExit !== this._onBeatExit) this._onBeatExit?.(state);
      } else if (allowed && autoRestore && !this._enabled) {
        this.setEnabled(true);
      }
    });
    this._clockUnsub = unsub;
    return unsub;
  }

  _cancelActiveState() {
    if (this._activeDrag) {
      const ptrId = this._activeDrag.pointerId;
      this._activeDrag = null;
      try {
        this.canvas.releasePointerCapture?.(ptrId);
      } catch {
        // Ignore
      }
    }
    if (this._hoveredId) {
      const prev = this._entries.get(this._hoveredId);
      this._hoveredId = null;
      if (prev) prev.onHover?.(false, { id: prev.id, entry: prev, event: null });
      this._onHover?.(null, null, null);
    }
    this._desiredCursor = null;
  }

  _syncCursorAfterStage() {
    if (!this._enabled || this._disposed || this.stage._drag) return;
    if (this._desiredCursor && this.canvas.style) {
      this.canvas.style.cursor = this._desiredCursor;
    }
  }

  isDragging() {
    return Boolean(this._activeDrag);
  }

  _rebuildRoots() {
    this._roots = Array.from(this._entries.values(), (e) => e.object3D);
  }

  _raycast(clientX, clientY) {
    if (!this._enabled || !this._roots.length) return null;
    if (!setRayFromClient(this.stage, clientX, clientY)) return null;
    const hits = _raycaster.intersectObjects(this._roots, true);
    for (const hit of hits) {
      if (!isObjectVisibleInHierarchy(hit.object)) continue;
      let cur = hit.object;
      let id = null;
      while (cur && !id) {
        if (cur.userData && cur.userData._manipId) id = cur.userData._manipId;
        cur = cur.parent;
      }
      if (id && this._entries.has(id)) {
        return { entry: this._entries.get(id), hit };
      }
    }
    return null;
  }

  _buildDragPlane(entry, startPoint) {
    if (entry.axis) {
      this.stage.camera.getWorldDirection(_camDir);
      _axisVec.copy(entry.axis);
      _orthoVec.crossVectors(_camDir, _axisVec);
      if (_orthoVec.lengthSq() < 1e-6) {
        _orthoVec.set(0, 1, 0).cross(_axisVec);
        if (_orthoVec.lengthSq() < 1e-6) _orthoVec.set(1, 0, 0).cross(_axisVec);
      }
      _planeNorm.crossVectors(_axisVec, _orthoVec).normalize();
      return new THREE.Plane().setFromNormalAndCoplanarPoint(_planeNorm, entry.origin || startPoint);
    }
    const normal = entry.planeNormal || new THREE.Vector3(0, 1, 0);
    const point = entry.planePoint || startPoint;
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  }

  _handlePointerDown(e) {
    if (!this._enabled || this._disposed || e.button !== 0) return;
    const found = this._raycast(e.clientX, e.clientY);
    if (!found) return;

    const { entry, hit } = found;
    if (entry.kind === 'handle') {
      e.stopImmediatePropagation();
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic events
      }
      const startPoint = hit.point.clone();
      const dragPlane = this._buildDragPlane(entry, startPoint);
      const axisOrigin = entry.origin ? entry.origin.clone() : startPoint.clone();
      const startAxisVal = entry.axis ? _delta.subVectors(startPoint, axisOrigin).dot(entry.axis) : 0;

      this._activeDrag = {
        pointerId: e.pointerId,
        entry,
        hit,
        dragPlane,
        startPoint,
        lastPoint: startPoint.clone(),
        axisOrigin,
        startAxisVal,
        startX: e.clientX,
        startY: e.clientY,
        moved: 0,
        started: false,
      };
      this._desiredCursor = entry.dragCursor;
      this.canvas.style.cursor = entry.dragCursor;
    } else if (entry.kind === 'clickable') {
      // Allow orbit if dragged, trigger click on release if stationary
      this._activeDrag = {
        pointerId: e.pointerId,
        entry,
        hit,
        startX: e.clientX,
        startY: e.clientY,
        moved: 0,
        started: false,
      };
    }
  }

  _handlePointerMove(e) {
    if (!this._enabled || this._disposed) return;

    if (this._activeDrag && e.pointerId === this._activeDrag.pointerId) {
      const drag = this._activeDrag;
      drag.moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (drag.entry.kind !== 'handle') return;

      e.stopImmediatePropagation();
      if (!setRayFromClient(this.stage, e.clientX, e.clientY)) return;
      if (!_raycaster.ray.intersectPlane(drag.dragPlane, _hitPt)) return;

      const worldPoint = _hitPt.clone();
      const worldDelta = new THREE.Vector3().subVectors(worldPoint, drag.startPoint);
      const stepDelta = new THREE.Vector3().subVectors(worldPoint, drag.lastPoint);
      drag.lastPoint.copy(worldPoint);

      let value = null;
      if (drag.entry.axis) {
        const raw = _delta.subVectors(worldPoint, drag.axisOrigin).dot(drag.entry.axis);
        value = Math.max(drag.entry.min, Math.min(drag.entry.max, raw));
      }

      const payload = {
        id: drag.entry.id,
        entry: drag.entry,
        worldPoint,
        worldDelta,
        stepDelta,
        value,
        axisDelta: value !== null ? value - drag.startAxisVal : null,
        event: e,
      };

      if (!drag.started && drag.moved >= 3) {
        drag.started = true;
        drag.entry.onDragStart?.(payload);
      }
      if (drag.started) {
        drag.entry.onDrag?.(payload);
      }
      return;
    }

    // Hover feedback when idle
    if (this.stage._drag) return;
    const found = this._raycast(e.clientX, e.clientY);
    const nextId = found ? found.entry.id : null;
    this._desiredCursor = found ? found.entry.cursor : null;
    if (nextId !== this._hoveredId) {
      const prev = this._hoveredId ? this._entries.get(this._hoveredId) : null;
      if (prev) prev.onHover?.(false, { id: prev.id, entry: prev, event: e });
      this._hoveredId = nextId;
      if (found) {
        found.entry.onHover?.(true, { id: found.entry.id, entry: found.entry, hit: found.hit, event: e });
        this.canvas.style.cursor = found.entry.cursor;
      }
      this._onHover?.(found ? found.entry : null, found ? found.hit : null, e);
    } else if (found) {
      this.canvas.style.cursor = found.entry.cursor;
    }
  }

  _handlePointerUp(e) {
    if (!this._activeDrag || e.pointerId !== this._activeDrag.pointerId) return;
    const drag = this._activeDrag;
    this._activeDrag = null;

    if (drag.entry.kind === 'handle') {
      e.stopImmediatePropagation();
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      this._desiredCursor = drag.entry.cursor;
      this.canvas.style.cursor = drag.entry.cursor;
      if (drag.started) {
        drag.entry.onDragEnd?.({
          id: drag.entry.id,
          entry: drag.entry,
          worldPoint: drag.lastPoint.clone(),
          event: e,
        });
      } else if (drag.moved < 6) {
        drag.entry.onClick?.({ id: drag.entry.id, entry: drag.entry, hit: drag.hit, event: e });
        this._onClick?.(drag.entry, drag.hit, e);
      }
    } else if (drag.moved < 6 && e.button === 0) {
      drag.entry.onClick?.({ id: drag.entry.id, entry: drag.entry, hit: drag.hit, event: e });
      this._onClick?.(drag.entry, drag.hit, e);
    }
  }

  dispose() {
    this._disposed = true;
    if (this._clockUnsub) {
      this._clockUnsub();
      this._clockUnsub = null;
    }
    this.canvas.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this._onPointerMove, { capture: true });
    this.canvas.removeEventListener('pointerup', this._onPointerUp, { capture: true });
    this.canvas.removeEventListener('pointercancel', this._onPointerUp, { capture: true });
    this.canvas.removeEventListener('pointermove', this._onBubbleCursorSync);
    this.canvas.removeEventListener('pointerup', this._onBubbleCursorSync);
    this.canvas.removeEventListener('pointercancel', this._onBubbleCursorSync);
    this._entries.clear();
    this._roots = [];
    this._activeDrag = null;
    this._desiredCursor = null;
  }
}

/**
 * Direct 3D grid painting / clicking brush (e.g. paint/erase cliff hazards, relocate
 * Start/Goal, or click any tile to inspect/fork directly on the 3D board).
 *
 * When `active` is true (or `holdModifier` such as Alt is held), pointerdown captures
 * the pointer in capture phase so dragging across tiles paints cleanly instead of orbiting.
 * When `active` is false, stationary clicks still trigger `onClickCell` while drags orbit.
 */
export class GridBrush {
  constructor(
    stage,
    {
      targets = [],
      getCell = null,
      active = false,
      mode = 'toggle',
      holdModifier = 'altKey',
      paintCursor = 'crosshair',
      clock = null,
      autoExitOnBeatChange = true,
      autoExitOnSeek = false,
      allowedBeats = null,
      onActiveChange = null,
      onHoverCell = null,
      onClickCell = null,
      onPaintCell = null,
      onStrokeStart = null,
      onStrokeEnd = null,
    } = {}
  ) {
    this.stage = stage;
    this.canvas = stage.canvas;
    this._targets = Array.isArray(targets) ? [...targets] : [];
    this._getCell = typeof getCell === 'function' ? getCell : (hit) => this._defaultGetCell(hit);
    this.active = Boolean(active);
    this.mode = mode;
    this.holdModifier = holdModifier;
    this.paintCursor = paintCursor;
    this._onActiveChange = typeof onActiveChange === 'function' ? onActiveChange : null;
    this._onHoverCell = onHoverCell;
    this._onClickCell = onClickCell;
    this._onPaintCell = onPaintCell;
    this._onStrokeStart = onStrokeStart;
    this._onStrokeEnd = onStrokeEnd;

    this._hoveredKey = null;
    this._stroke = null;
    this._clickCandidate = null;
    this._modifierEngaged = false;
    this._clockUnsub = null;
    this._clockSeekUnsub = null;
    this._disposed = false;

    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onBubbleCursorSync = (e) => this._syncCursorAfterStage(e);
    this._onKeyChange = (e) => this._handleModifierKey(e);

    this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas.addEventListener('pointermove', this._onPointerMove, { capture: true });
    this.canvas.addEventListener('pointerup', this._onPointerUp, { capture: true });
    this.canvas.addEventListener('pointercancel', this._onPointerUp, { capture: true });

    // Bubble-phase cursor enforcement runs strictly AFTER stage-3d.js _setHover()
    this.canvas.addEventListener('pointermove', this._onBubbleCursorSync);
    this.canvas.addEventListener('pointerup', this._onBubbleCursorSync);
    this.canvas.addEventListener('pointercancel', this._onBubbleCursorSync);
    this.canvas.addEventListener('pointerenter', this._onBubbleCursorSync);

    if (typeof window !== 'undefined' && this.holdModifier) {
      window.addEventListener('keydown', this._onKeyChange);
      window.addEventListener('keyup', this._onKeyChange);
    }

    if (this.active) {
      this._applyCanvasCursor(true);
    }

    if (clock) {
      this.bindClock(clock, {
        autoExitOnBeatChange,
        autoExitOnSeek,
        allowedBeats,
      });
    }
  }

  _defaultGetCell(hit) {
    let cur = hit.object;
    while (cur) {
      if (cur.userData?.cell) {
        const c = cur.userData.cell;
        const key = c.key ?? `${c.row},${c.col}`;
        return { ...c, key, object: cur };
      }
      if (cur.userData?.pickId && /^cell-(\d+)-(\d+)$/.test(cur.userData.pickId)) {
        const [, r, c] = cur.userData.pickId.match(/^cell-(\d+)-(\d+)$/);
        return { key: `${r},${c}`, row: Number(r), col: Number(c), pickId: cur.userData.pickId, object: cur };
      }
      cur = cur.parent;
    }
    return null;
  }

  setTargets(meshes) {
    this._targets = Array.isArray(meshes) ? [...meshes] : [];
  }

  setActive(active, meta = { reason: 'manual' }) {
    const next = Boolean(active);
    const changed = next !== this.active;
    this.active = next;
    if (!this.active && this._stroke) {
      const ptrId = this._stroke.pointerId;
      this._stroke = null;
      try {
        this.canvas.releasePointerCapture?.(ptrId);
      } catch {
        // Ignore
      }
    }
    this._applyCanvasCursor(this.active);
    if (changed) {
      this._onActiveChange?.(this.active, meta);
    }
  }

  /**
   * Bind a `SpacetimeClock` or `TimelineDirector` so switching beats/acts automatically
   * exits paint mode and clears stale hover states (preventing trapped edit states when
   * earlier beats hide the paint toggle button).
   */
  bindClock(
    clock,
    {
      autoExitOnBeatChange = true,
      autoExitOnSeek = false,
      allowedBeats = null,
      onAutoExit = null,
    } = {}
  ) {
    if (this._clockUnsub) {
      this._clockUnsub();
      this._clockUnsub = null;
    }
    if (this._clockSeekUnsub) {
      this._clockSeekUnsub();
      this._clockSeekUnsub = null;
    }
    if (!clock || typeof clock.subscribe !== 'function') return () => {};

    let lastBeatKey = null;

    const exitIfNeeded = (reason, state) => {
      if (this._hoveredKey !== null) {
        this._hoveredKey = null;
        this._onHoverCell?.(null, null, null);
      }
      if (this.active || this._stroke) {
        this.setActive(false, { reason, state });
        onAutoExit?.(state, reason);
      }
    };

    const unsub = clock.subscribe((state) => {
      if (this._disposed) return;
      const nextKey = getClockBeatKey(state);
      const beatChanged = lastBeatKey !== null && nextKey !== lastBeatKey;
      const allowed = isBeatAllowed(state, allowedBeats);
      lastBeatKey = nextKey;

      if (!allowed) {
        exitIfNeeded('beat-disallowed', state);
      } else if (beatChanged && autoExitOnBeatChange) {
        exitIfNeeded('beat-change', state);
      }
    });
    this._clockUnsub = unsub;

    if (autoExitOnSeek && typeof clock.onSeek === 'function') {
      this._clockSeekUnsub = clock.onSeek((state) => {
        if (!this._disposed) exitIfNeeded('seek', state);
      });
    }

    return () => {
      unsub();
      if (this._clockUnsub === unsub) this._clockUnsub = null;
      if (this._clockSeekUnsub) {
        this._clockSeekUnsub();
        this._clockSeekUnsub = null;
      }
    };
  }

  setMode(mode) {
    this.mode = mode;
  }

  _applyCanvasCursor(engaged) {
    if (this.canvas.dataset) {
      this.canvas.dataset.brushActive = this.active ? 'true' : 'false';
    }
    if (!this.canvas.style) return;
    if (engaged) {
      this.canvas.style.cursor = this.paintCursor;
    } else if (!this.stage._drag) {
      this.canvas.style.cursor = 'grab';
    }
  }

  _syncCursorAfterStage(e) {
    if (this._disposed || this.stage._drag) return;
    const mod = Boolean(this.holdModifier && e && e[this.holdModifier]);
    if (this.active || this._stroke || (mod && this._hoveredKey !== null)) {
      if (this.canvas.style) {
        this.canvas.style.cursor = this.paintCursor;
      }
    }
  }

  _handleModifierKey(e) {
    if (this._disposed || !this.holdModifier) return;
    const mod = Boolean(e && e[this.holdModifier]);
    if (mod === this._modifierEngaged) return;
    this._modifierEngaged = mod;
    if (!this.active && !this._stroke && this._hoveredKey !== null && !this.stage._drag) {
      if (this.canvas.style) {
        this.canvas.style.cursor = mod ? this.paintCursor : 'pointer';
      }
    }
  }

  _pickCell(clientX, clientY) {
    if (!this._targets.length) return null;
    if (!setRayFromClient(this.stage, clientX, clientY)) return null;
    const hits = _raycaster.intersectObjects(this._targets, true);
    for (const hit of hits) {
      if (!isObjectVisibleInHierarchy(hit.object)) continue;
      const cell = this._getCell(hit);
      if (cell) return { cell, hit };
    }
    return null;
  }

  _isBrushEngaged(e) {
    return this.active || Boolean(this.holdModifier && e[this.holdModifier]);
  }

  _handlePointerDown(e) {
    if (this._disposed || e.button !== 0) return;
    const found = this._pickCell(e.clientX, e.clientY);
    if (!found) return;

    if (this._isBrushEngaged(e)) {
      e.stopImmediatePropagation();
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      const strokeValue = this._onStrokeStart?.(found.cell, { mode: this.mode, event: e });
      const visited = new Set([found.cell.key]);
      const cells = [found.cell];
      this._stroke = {
        pointerId: e.pointerId,
        strokeValue,
        visited,
        cells,
      };
      this.canvas.style.cursor = this.paintCursor;
      this._onPaintCell?.(found.cell, {
        strokeValue,
        mode: this.mode,
        firstInStroke: true,
        event: e,
      });
      return;
    }

    // Orbit mode: track click without blocking stage orbit
    this._clickCandidate = {
      pointerId: e.pointerId,
      cell: found.cell,
      hit: found.hit,
      startX: e.clientX,
      startY: e.clientY,
      moved: 0,
    };
  }

  _handlePointerMove(e) {
    if (this._disposed) return;

    if (this._stroke && e.pointerId === this._stroke.pointerId) {
      e.stopImmediatePropagation();
      const found = this._pickCell(e.clientX, e.clientY);
      if (found && !this._stroke.visited.has(found.cell.key)) {
        this._stroke.visited.add(found.cell.key);
        this._stroke.cells.push(found.cell);
        this._onPaintCell?.(found.cell, {
          strokeValue: this._stroke.strokeValue,
          mode: this.mode,
          firstInStroke: false,
          event: e,
        });
      }
      return;
    }

    if (this._clickCandidate && e.pointerId === this._clickCandidate.pointerId) {
      this._clickCandidate.moved = Math.hypot(
        e.clientX - this._clickCandidate.startX,
        e.clientY - this._clickCandidate.startY
      );
      return;
    }

    if (this.stage._drag) return;
    const found = this._pickCell(e.clientX, e.clientY);
    const nextKey = found ? found.cell.key : null;
    if (nextKey !== this._hoveredKey) {
      this._hoveredKey = nextKey;
      this._onHoverCell?.(found ? found.cell : null, found ? found.hit : null, e);
    }
    if (this.active || (found && this._isBrushEngaged(e))) {
      this.canvas.style.cursor = this.paintCursor;
    }
  }

  _handlePointerUp(e) {
    if (this._stroke && e.pointerId === this._stroke.pointerId) {
      e.stopImmediatePropagation();
      const finished = this._stroke;
      this._stroke = null;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      this._onStrokeEnd?.({
        cells: finished.cells,
        strokeValue: finished.strokeValue,
        mode: this.mode,
        event: e,
      });
      this.canvas.style.cursor = this.active ? this.paintCursor : 'grab';
      return;
    }

    if (this._clickCandidate && e.pointerId === this._clickCandidate.pointerId) {
      const cand = this._clickCandidate;
      this._clickCandidate = null;
      if (cand.moved < 6 && e.button === 0) {
        this._onClickCell?.(cand.cell, cand.hit, e);
      }
    }
  }

  dispose() {
    this._disposed = true;
    if (this._clockUnsub) {
      this._clockUnsub();
      this._clockUnsub = null;
    }
    if (this._clockSeekUnsub) {
      this._clockSeekUnsub();
      this._clockSeekUnsub = null;
    }
    this.canvas.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this._onPointerMove, { capture: true });
    this.canvas.removeEventListener('pointerup', this._onPointerUp, { capture: true });
    this.canvas.removeEventListener('pointercancel', this._onPointerUp, { capture: true });
    this.canvas.removeEventListener('pointermove', this._onBubbleCursorSync);
    this.canvas.removeEventListener('pointerup', this._onBubbleCursorSync);
    this.canvas.removeEventListener('pointercancel', this._onBubbleCursorSync);
    this.canvas.removeEventListener('pointerenter', this._onBubbleCursorSync);
    if (typeof window !== 'undefined' && this.holdModifier) {
      window.removeEventListener('keydown', this._onKeyChange);
      window.removeEventListener('keyup', this._onKeyChange);
    }
    this._targets = [];
    this._stroke = null;
    this._clickCandidate = null;
  }
}
