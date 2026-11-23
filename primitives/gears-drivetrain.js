import * as THREE from 'three';
import {
  createBevelledProfile, createGearWheel, createLathedSolid,
  createSculptMaterial, createTaperedConduit, filletProfile,
} from '../kit/geo-sculpt.js';

// Display units: one unit represents 0.24 m. Axles run along X, the input along +Z.
// Pitch cones meet at the origin. The housing clears the moving envelope on all three axes.
export const DIMENSIONS = Object.freeze({
  metresPerUnit: 0.24,
  crownRadius: 1.12,
  pinionRadius: 0.32,
  crownTeeth: 42,
  pinionTeeth: 12,
  carrierRadius: 0.79,
  carrierHalfWidth: 0.63,
  sideRadius: 0.38,
  spiderRadius: 0.266,
  sideTeeth: 20,
  spiderTeeth: 14,
  axleRadius: 0.105,
  axleLength: 2.46,
  wheelCenter: 2.70,
  wheelDiameter: 3.04,
  wheelWidth: 0.62,
  housingRadius: 1.43,
  housingHalfWidth: 1.02,
  cutBisector: Math.PI / 4,
  inputEnd: 2.49,
});

export const DRIVETRAIN_COLORS = Object.freeze({
  left: 0x0072b2, right: 0xd55e00, torque: 0x009e73,
});

const D = DIMENSIONS;
const QUARTER_TURN = Math.PI / 2;
// Primer satin metal and matte casting/rubber finishes.
const steel = { preset: 'satinSteel', materialOverrides: { color: 0xb6bfc8 } };
const alloy = { preset: 'satinSteel', materialOverrides: { color: 0xd0d5da, metalness: 0.81, roughness: 0.32 } };
const iron = { preset: 'obsidian', materialOverrides: { color: 0x525d6e, metalness: 0.0, roughness: 0.82, reflective: false } };
const rubber = { preset: 'rubber', materialOverrides: { color: 0x252a33, metalness: 0.0, roughness: 0.90, reflective: false } };

function marked(color) {
  return {
    preset: 'enamel',
    materialOverrides: { color, metalness: 0.0, roughness: 0.46, clearcoat: 0.88, clearcoatRoughness: 0.12 },
  };
}

function tagInk(obj, meta) {
  obj.userData = { ...(obj.userData || {}), ...meta };
  return obj;
}

function turned(profile, finish, name, options) {
  return createLathedSolid(profile, { segments: 64, name, ...finish, ...options });
}

function journal(radius, start, end, finish, name) {
  const round = Math.min(radius * 0.42, (end - start) * 0.15);
  return turned([
    [0, start], [radius, start], [radius, end], [0, end],
  ], finish, name, { profileFillet: round, profileFilletSegments: 8 });
}

function annulus(inner, outer, low, high) {
  return [[inner, low], [outer, low], [outer, high], [inner, high], [inner, low]];
}

/**
 * A bevel gear rotating about local +Y. The larger end faces +Y.
 * Set rimBore to use a bolt-on crown wheel with an open centre.
 */
export function createBevelGear({
  pitchRadius, teeth, boreRadius = 0.05, thickness = 0.12, coneSlope = 0.5, rimBore = 0,
  name = 'bevel-gear', preset = 'satinSteel', materialOverrides,
  inkGroupId = name,
}) {
  const toothDepth = pitchRadius * 2.8 / teeth;
  const gear = createGearWheel({
    pitchRadius, teeth, boreRadius, thickness, toothDepth, preset,
    materialOverrides: materialOverrides ?? (preset === steel.preset ? steel.materialOverrides : undefined),
    bevel: thickness * 0.15, bevelSize: Math.min(thickness * 0.11, toothDepth * 0.14),
    bevelSegments: 4, curveSegments: 24, toothFillet: toothDepth * 0.16,
    spokes: 0, hub: !rimBore, orient: 'xz', name,
  });
  const mesh = gear.gearMesh ?? gear;
  const positions = mesh.geometry.attributes.position;
  const rootRadius = pitchRadius - toothDepth * 0.54;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const r = Math.hypot(x, z);
    if (r === 0) continue;
    const web = rimBore && r < rootRadius
      ? rimBore + (r - boreRadius) * (rootRadius - rimBore) / (rootRadius - boreRadius)
      : r;
    const taper = y * coneSlope * Math.min(1, Math.max(0, (web - boreRadius) / (rootRadius - boreRadius)));
    const scale = (web + taper) / r;
    positions.setXYZ(i, x * scale, y, z * scale);
  }
  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
  tagInk(gear, { inkNormals: 'none', inkGroupId });
  return gear;
}

/** Local X spin axis. The cross pin is along local Y and the two cage webs run behind it. */
export function createCarrierCage() {
  const cage = new THREE.Group();
  cage.name = 'carrier-cage';
  tagInk(cage, { inkGroupId: 'carrier-cage' });
  for (const side of [-1, 1]) {
    const x = side * D.carrierHalfWidth;
    const flange = turned(annulus(0.145, D.carrierRadius, x - 0.048, x + 0.048), alloy, 'carrier-flange', { profileFillet: 0.016 });
    flange.rotation.z = -QUARTER_TURN;
    tagInk(flange, { inkGroupId: 'carrier-cage', ink: 0.88 });
    cage.add(flange);
    for (let i = 0; i < 6; i += 1) {
      const angle = i * Math.PI / 3;
      const bolt = turned(annulus(0.013, 0.073, x - 0.076, x + 0.076), steel, 'flange-bolt', { segments: 6 });
      bolt.rotation.z = -QUARTER_TURN;
      bolt.position.set(0, 0.655 * Math.cos(angle), 0.655 * Math.sin(angle));
      tagInk(bolt, { inkGroupId: `carrier-bolt-${side}-${i}`, inkThin: true, ink: 0.72 });
      cage.add(bolt);
    }
    const web = createTaperedConduit([
      [-0.61, 0, side * 0.69], [-0.35, 0, side * 0.77],
      [0.35, 0, side * 0.77], [0.61, 0, side * 0.69],
    ], (u) => 0.066 + 0.033 * Math.sin(Math.PI * u), {
      name: 'arched-carrier-web', ...alloy, radialSegments: 14, tubularSegments: 26,
    });
    tagInk(web, { inkGroupId: 'carrier-cage', ink: 0.84 });
    cage.add(web);
  }
  cage.add(tagInk(journal(0.084, -0.73, 0.73, steel, 'spider-cross-pin'), {
    inkGroupId: 'spider-cross-pin', inkThin: true,
  }));
  // The crown attaches to this sleeve, outside the side-gear motion envelope.
  const mount = turned(annulus(0.77, 0.89, -0.60, -0.38), alloy, 'crown-mount', { profileFillet: 0.018 });
  mount.rotation.z = -QUARTER_TURN;
  tagInk(mount, { inkGroupId: 'carrier-cage', ink: 0.86 });
  cage.add(mount);
  return cage;
}

// Clip the same rounded wall profile on either side of the narrow input window.
function clipHousingProfile(profile, y, side) {
  const clipped = [];
  for (let i = 0; i < profile.length; i += 1) {
    const point = profile[i];
    const next = profile[(i + 1) % profile.length];
    const inside = side * (point.y - y) >= 0;
    if (inside) clipped.push(point);
    if (inside !== (side * (next.y - y) >= 0)) {
      const edge = point.clone().lerp(next, (y - point.y) / (next.y - point.y));
      edge.y = y;
      if (!edge.equals(point) && !edge.equals(next)) clipped.push(edge);
    }
  }
  return [...clipped, clipped[0]];
}

/** A real open sector through the casting. The gold faces are the cut wall thickness. */
export function createDiffHousing() {
  const housing = new THREE.Group();
  housing.name = 'differential-housing';
  housing.rotation.z = -QUARTER_TURN;
  const R = D.housingRadius;
  const W = D.housingHalfWidth;
  const profile = filletProfile([
    [0.15, -W], [0.275, -W], [0.34, -0.89], [0.93, -0.77],
    [1.28, -0.63], [R, -0.34], [R, 0.33], [1.29, 0.52],
    [0.92, 0.79], [0.34, 0.89], [0.275, W], [0.15, W],
    [0.15, 0.95], [0.27, 0.81], [0.88, 0.70], [1.22, 0.47],
    [1.34, 0.28], [1.34, -0.32], [1.21, -0.58], [0.90, -0.68],
    [0.27, -0.81], [0.15, -0.95], [0.15, -W],
  ], 0.095, 8);
  const capMat = createSculptMaterial('satinBrass');
  const caps = [0, 1].map((idx) => {
    const cap = createBevelledProfile(profile.slice(0, -1), {
      depth: 0.060, bevelThickness: 0.010, bevelSize: 0.012, bevelSegments: 4,
      material: capMat, name: 'housing-cut-face',
    });
    tagInk(cap, { inkGroupId: `diff-housing-cap-${idx}`, inkNormals: 'none', ink: 0.84 });
    housing.add(cap);
    return cap;
  });
  const shellMat = createSculptMaterial(iron.preset, iron.materialOverrides);
  // The pinion passes through a window in the front of the casting. A turned
  // bearing collar covers its rectangular casting relief on the exterior.
  const collar = turned(annulus(0.112, 0.235, 1.429, 1.57), iron, 'input-bearing', { material: shellMat });
  collar.rotation.x = QUARTER_TURN;
  tagInk(collar, { inkGroupId: 'diff-housing', ink: 0.90 });
  housing.add(collar);
  const wall = profile.slice(0, -1);
  const left = clipHousingProfile(wall, -0.125, -1);
  const right = clipHousingProfile(wall, 0.125, 1);
  const sections = [
    { start: -D.cutBisector, end: -0.085, profile },
    { start: -0.085, end: 0.085, profile: left },
    { start: -0.085, end: 0.085, profile: right },
    { start: 0.085, end: 2 * Math.PI - D.cutBisector, profile },
  ].map((section) => {
    const mesh = turned(section.profile, iron, 'cast-shell', { material: shellMat });
    tagInk(mesh, { inkGroupId: 'diff-housing', inkNormals: 'none', ink: 0.92 });
    housing.add(mesh);
    return { ...section, mesh };
  });
  let lastStep = -1;
  housing.setCutaway = (amount, showCaps = true) => {
    const step = Math.round(64 * THREE.MathUtils.clamp(amount, 0, 1));
    if (step !== lastStep) {
      const halfGap = step / 64 * QUARTER_TURN;
      const start = -D.cutBisector + halfGap;
      const end = -D.cutBisector + 2 * Math.PI - halfGap;
      for (const section of sections) {
        const from = Math.max(start, section.start);
        const to = Math.min(end, section.end);
        section.mesh.visible = to > from;
        if (to <= from) continue;
        section.mesh.geometry.dispose();
        section.mesh.geometry = new THREE.LatheGeometry(
          section.profile, Math.max(8, Math.ceil((to - from) * 24)), from, to - from,
        );
      }
      collar.visible = start < -0.085;
      caps[0].rotation.y = start - QUARTER_TURN;
      caps[1].rotation.y = end - QUARTER_TURN;
      lastStep = step;
    }
    for (const cap of caps) cap.visible = showCaps && step > 0;
  };
  housing.setCutaway(0);
  return housing;
}

/** Each assembly spins as a unit about global X. The side gear is returned for progressive reveal. */
export function createAxleWheelAssembly(side) {
  if (side !== 'left' && side !== 'right') throw new RangeError('Choose left or right');
  const sign = side === 'left' ? -1 : 1;
  const group = new THREE.Group();
  group.name = `${side}-axle-wheel`;
  const shaft = new THREE.Group();
  shaft.rotation.z = -sign * QUARTER_TURN;
  group.add(shaft);
  const wheelX = D.wheelCenter;
  const inner = wheelX - D.axleLength;
  const treadRadius = D.wheelDiameter / 2;
  const width = D.wheelWidth / 2;
  const color = marked(DRIVETRAIN_COLORS[side]);
  shaft.add(tagInk(journal(D.axleRadius, inner, wheelX + 0.26, steel, 'half-shaft'), {
    inkGroupId: `${side}-half-shaft`, inkThin: true,
  }));
  shaft.add(tagInk(turned(annulus(0.104, 0.148, 1.14, 1.42), color, 'axle-id-band'), {
    inkGroupId: `${side}-id-band`, inkThin: true,
  }));
  const sideGear = createBevelGear({
    pitchRadius: D.sideRadius, teeth: D.sideTeeth, boreRadius: D.axleRadius + 0.002,
    thickness: 0.107, coneSlope: D.sideRadius / D.spiderRadius, name: `${side}-side-gear`,
  });
  sideGear.position.y = D.spiderRadius;
  shaft.add(sideGear);
  shaft.add(tagInk(turned(annulus(0.11, 0.59, wheelX - 0.44, wheelX - 0.35), alloy, 'brake-disc', { profileFillet: 0.016 }), {
    inkGroupId: `${side}-brake-disc`, ink: 0.84,
  }));
  shaft.add(tagInk(turned(annulus(0.11, 0.79, wheelX - 0.27, wheelX + 0.27), alloy, 'wheel-rim', { profileFillet: 0.033 }), {
    inkGroupId: `${side}-wheel-rim`, ink: 0.90,
  }));
  const tyreProfile = [
    [0.76, wheelX - 0.29], [treadRadius - 0.16, wheelX - width], [treadRadius - 0.055, wheelX - 0.25],
    [treadRadius - 0.032, wheelX - 0.16], [treadRadius - 0.032, wheelX + 0.16],
    [treadRadius - 0.055, wheelX + 0.25], [treadRadius - 0.16, wheelX + width], [0.76, wheelX + 0.29],
    [0.76, wheelX - 0.29],
  ];
  const shoulder = { profileFillet: 0.085, profileFilletSegments: 8 };
  const tread = new THREE.Group();
  const treadMaterial = createSculptMaterial(rubber.preset, rubber.materialOverrides);
  const markerMaterial = createSculptMaterial(color.preset, color.materialOverrides);
  // Suppress internal normal chatter on curved tire sidewalls & treads (silhouette + part ID seams only)
  shaft.add(tagInk(turned(tyreProfile, rubber, 'tyre-carcass', { ...shoulder, material: treadMaterial }), {
    inkGroupId: `${side}-tyre`, inkNormals: 'none', ink: 0.86,
  }));
  for (let i = 0; i < 28; i += 1) {
    const angle = i * Math.PI / 14;
    tread.add(tagInk(turned(annulus(treadRadius - 0.035, treadRadius, wheelX - 0.17, wheelX + 0.17),
      rubber, 'tread-block', { profileFillet: 0.012, phiStart: angle, phiLength: 0.143, segments: 8, material: treadMaterial }), {
      inkGroupId: `${side}-tyre`, inkNormals: 'none', inkThin: true, ink: 0.68,
    }));
  }
  for (const angle of [0, 0.16]) {
    const markerProfile = tyreProfile.map(([r, x]) => [
      r + (Math.abs(x - wheelX) < 0.2 ? 0.037 : 0.007), x,
    ]);
    tread.add(tagInk(turned(markerProfile, color, 'rotation-index', {
      ...shoulder, phiStart: angle, phiLength: 0.085, segments: 8, material: markerMaterial,
    }), {
      inkGroupId: `${side}-rot-index`, inkNormals: 'none', inkThin: true, ink: 0.58,
    }));
  }
  shaft.add(tread);
  return { group, sideGear };
}

/** Drive pinion and propshaft rotate about global Z. */
export function createInputAssembly() {
  const group = new THREE.Group();
  group.name = 'input-shaft';
  group.rotation.x = QUARTER_TURN;
  const pinion = createBevelGear({
    pitchRadius: D.pinionRadius, teeth: D.pinionTeeth, boreRadius: 0.109,
    thickness: 0.13, coneSlope: D.pinionRadius / D.crownRadius, name: 'input-pinion',
  });
  pinion.position.y = D.crownRadius;
  group.add(
    pinion,
    tagInk(journal(0.108, D.crownRadius - 0.047, D.inputEnd, steel, 'propshaft'), {
      inkGroupId: 'input-propshaft', inkThin: true,
    }),
    tagInk(turned(annulus(0.106, 0.169, 1.51, 1.78), marked(DRIVETRAIN_COLORS.torque), 'input-id-band'), {
      inkGroupId: 'input-id-band', inkThin: true,
    }),
  );
  return { group, pinion };
}
