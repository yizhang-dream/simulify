import * as THREE from 'three';
import { IsometricStage } from '../../kit/stage-3d.js';
import {
  ArrivalRail,
  BarField,
  DECK_TOP,
  ProjectionRig,
  TargetDome,
  makeDeck,
} from './prob-primitives.js';

const DEG = Math.PI / 180;

/** Per-act stage cameras. Decks sit at x = -3.5 / 0 / 3.5. */
export const ACT_CAMERAS = {
  1: { target: [-1.6, 0.5, 0.1], azimuth: 30 * DEG, elevation: 36 * DEG, zoom: 0.92 },
  2: { target: [0.1, 0.35, 0.1], azimuth: 28 * DEG, elevation: 38 * DEG, zoom: 1.0 },
  3: { target: [0.1, 0.35, 0.1], azimuth: 30 * DEG, elevation: 37 * DEG, zoom: 0.98 },
  4: { target: [0.5, 0.35, 0.1], azimuth: 27 * DEG, elevation: 38 * DEG, zoom: 0.96 },
  5: { target: [2.0, 0.45, 0.1], azimuth: 29 * DEG, elevation: 36 * DEG, zoom: 0.88 },
};

/** Callout anchor slots per act (resolved from the rigs each frame). */
export const ACT_SLOTS = {
  1: ['xTip', 'mFoot', 'resid'],
  2: ['barPeak', 'barMid', 'railPin'],
  3: ['barPeak', 'barMid', 'barPeak'],
  4: ['railPin', 'railCursor', 'barPeak'],
  5: ['domeTop', 'ringEdge', 'barPeak'],
};

const DECK_OF_ACT = { 1: 0, 2: 1, 3: 1, 4: 1, 5: 2 };

/**
 * Concept A stage adapter: three stone decks (L² prism, bar/rail instrument, target dome)
 * driven only from `snap.stageData` of the single engine solve().
 */
export class ProbStage {
  constructor(canvas, { thumb = false, onHover = null, onSelect = null } = {}) {
    this.thumb = thumb;
    this.stage = new IsometricStage(canvas, {
      target: thumb ? [0.2, 0.4, 0] : ACT_CAMERAS[1].target,
      baseSpan: 9.4,
      azimuth: 29 * DEG,
      elevation: 37 * DEG,
      zoom: thumb ? 0.84 : ACT_CAMERAS[1].zoom,
      shadowBounds: 12,
      gridSize: 30,
      onHover,
      onSelect,
    });

    this.decks = [
      makeDeck({ x: -3.5, label: 'L²', sub: 'span(1, Z)' }),
      makeDeck({ x: 0, label: 'p / f', sub: 'bars · rail' }),
      makeDeck({ x: 3.5, label: 'N(0,σ²)', sub: 'target' }),
    ];
    this.decks.forEach((d) => this.stage.scene.add(d));
    this.decks.forEach((d, i) => {
      this.stage.registerPickable(`deck-${i + 1}`, d, { kind: 'deck', deck: i });
    });

    this.projection = new ProjectionRig(this.decks[0]);
    this.bars = new BarField(this.decks[1]);
    this.rail = new ArrivalRail(this.decks[1]);
    this.dome = new TargetDome(this.decks[2]);
    this.anchors = {};
    this.activeDeck = 0;
    this.actNum = 1;
    this._lift = [0, 0, 0];

    this.stage.onFrame((now, dt) => {
      const k = 1 - Math.exp(-dt * 9);
      this.decks.forEach((deck, i) => {
        const goal = i === this.activeDeck ? 0.1 : 0;
        this._lift[i] += (goal - this._lift[i]) * k;
        deck.position.y = this._lift[i];
      });
    });
  }

  get size() {
    return this.stage.size;
  }

  /** Re-render all stage objects from one solve() snapshot. */
  syncFromState(snap) {
    const sd = snap?.stageData || {};
    const ent = sd.entities || {};
    this.actNum = snap?.actNum || 1;
    this.activeDeck = DECK_OF_ACT[this.actNum] ?? 0;

    const proj = ent.projection || sd.projection || { normX: 2, normM: 0.866 };
    this.projection.update(proj);

    const barList = Array.isArray(ent.bars) ? ent.bars : [];
    this.bars.update(barList);

    const showRail = this.actNum === 2 || this.actNum === 4;
    this.rail.update(showRail ? ent.rail || null : null);

    const showDome = this.actNum === 5 || Boolean(ent.dome);
    this.dome.update(showDome ? ent.dome || null : null);

    Object.assign(
      this.anchors,
      this.projection.points,
      this.bars.points,
      this.rail.points,
      this.dome.points
    );
  }

  getAnchor(slot) {
    return this.anchors[slot] || new THREE.Vector3(0, DECK_TOP + 0.5, 0);
  }

  /** Build CalloutLayer item defs for the current act. Labels come from snap.stageData.callouts when present. */
  calloutItems(snap, fallbackLabels = []) {
    const act = snap?.actNum || this.actNum;
    const slots = ACT_SLOTS[act] || [];
    const fromEngine = Array.isArray(snap?.stageData?.callouts) ? snap.stageData.callouts : [];
    const dxs = [-44, 46, 40];
    return slots
      .map((slot, i) => {
        const src = fromEngine[i] || fallbackLabels[i];
        if (!src || !src.label) return null;
        return {
          id: `callout-${act}-${i}`,
          label: src.label,
          sublabel: src.sublabel || '',
          tone: src.tone || (i === 0 ? 'teal' : i === 1 ? 'amber' : undefined),
          dx: dxs[i],
          dy: -36 - i * 6,
          getWorldPos: () => this.getAnchor(slot),
        };
      })
      .filter(Boolean);
  }

  worldOfDeck(i) {
    return new THREE.Vector3(this.decks[i].position.x, DECK_TOP + 0.4, 0);
  }

  flyToAct(actNum, ms = 420) {
    const cam = ACT_CAMERAS[actNum];
    if (cam && !this.thumb) this.stage.flyTo(cam, ms);
  }

  toggleTopView() {
    return this.stage.toggleTopView();
  }

  resetView() {
    this.stage.resetView();
    this.flyToAct(this.actNum, 360);
  }

  focusTarget(id) {
    return this.stage.focusPart(id, 1.4);
  }

  destroy() {
    this.stage.dispose();
  }
}
