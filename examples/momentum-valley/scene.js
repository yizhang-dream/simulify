import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ActorChoreographer } from 'simulify/choreography.js';
import { createPhysicalFieldMaterial, createVectorField, sampleColormap } from 'simulify/field-viz.js';
import { createHeightfieldSurface } from 'simulify/geo-sculpt.js';
import { StageManipulator } from 'simulify/manipulator.js';
import { clamp, lerp } from 'simulify/model-core.js';
import { IsometricStage } from 'simulify/stage-3d.js';
import { gradient, loss, START_BOUNDS } from './model.js';

const X_MAX = 3.2;
const Y_MAX = 1.35;
const Y_SCALE = 1.72;
const FLOOR = 0.26;
const HEIGHT_SCALE = 0.095;
const MOMENTUM = 0xffa652;
const SGD = 0x62d4ff;
const GHOST = 0xd8a8ff;
const camera = { azimuth: -0.44, elevation: 0.68, zoom: 1, target: [0, 0.90, 0] };

const height = (x, y, kappa) => FLOOR + HEIGHT_SCALE * loss(x, y, kappa);
const within = ({ x, y }) => Math.abs(x) <= X_MAX && Math.abs(y) <= Y_MAX;
const projectToSurface = ({ x, y }) => ({
  x: clamp(x, -X_MAX, X_MAX), y: clamp(y, -Y_MAX, Y_MAX),
});
const worldPoint = (x, y, kappa, lift) => new THREE.Vector3(x, height(x, y, kappa) + lift, y * Y_SCALE);

function makeLine(color, opacity) {
  return new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: false,
  }));
}

function setGeometry(mesh, geometry) {
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

function updateTrail(mesh, path, kappa, { radius, lift, dash = 1 }) {
  const tubes = [];
  for (let i = 1; i < path.length; i += 1) {
    const a = projectToSurface(path[i - 1]);
    const b = projectToSurface(path[i]);
    const span = within(path[i]) ? dash : 1;
    const points = [];
    for (let j = 0; j <= 6; j += 1) {
      const u = span * j / 6;
      points.push(worldPoint(lerp(a.x, b.x, u), lerp(a.y, b.y, u), kappa, lift));
    }
    if (points[0].distanceToSquared(points[6]) > 1e-10) {
      const curve = new THREE.CatmullRomCurve3(points);
      tubes.push(new THREE.TubeGeometry(curve, 10, radius, 14));
    }
  }
  setGeometry(mesh, tubes.length ? mergeGeometries(tubes) : new THREE.BufferGeometry());
  mesh.visible = tubes.length > 0;
  for (const tube of tubes) tube.dispose();
}

export async function mountValley(canvas, onStart) {
  const narrow = matchMedia('(max-width: 900px)').matches;
  const stage = await IsometricStage.create(canvas, {
    ...camera, theme: document.documentElement.dataset.theme || 'dark-studio', gridStyle: 'cartesian',
    baseSpan: narrow ? 7.2 : 6.7,
    backend: new URLSearchParams(location.search).get('backend') || 'auto',
  });

  // Shaded physical heightfield: zero emissive washout, clearcoat curvature highlights,
  // and razor-sharp analytical fwidth() iso-loss contours + coordinate grid
  const surfaceMaterial = createPhysicalFieldMaterial({
    color: 0xdce6f2,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.46,
    metalness: 0.0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.26,
    specularIntensity: 0.58,
    analyticalGrid: true,
    gridDivisions: 14,
    gridLineWidth: 1.05,
    gridColor: 0x0b1526,
    gridOpacity: 0.28,
    analyticalContours: true,
    contourFreq: 4.5,
    contourLineWidth: 1.2,
    contourColor: 0xaef6ee,
    contourOpacity: 0.36,
  });

  const surface = createHeightfieldSurface({
    width: 2 * X_MAX, depth: 2 * Y_MAX * Y_SCALE, segsX: 84, segsZ: 76,
    skirt: false, vertexColors: true, name: 'quadratic-loss-surface',
    material: surfaceMaterial,
    castShadow: true,
    receiveShadow: true,
  });
  const rim = makeLine(0x7cc8de, 0.65);
  const arrows = createVectorField(24, { name: 'floor-negative-gradient', scale: 0.35 });
  const samplePoints = [-1, 1].flatMap((side) => [
    ...[-2.8, -2, -1.2, -0.4, 0.4, 1.2, 2, 2.8].map((x) => [x, side * 1.67]),
    ...[-0.95, -0.32, 0.32, 0.95].map((y) => [side * 3.55, y]),
  ]);

  const makeWireMesh = (color, { metalness = 0.84, roughness = 0.24, opacity = 1, clearcoat = 0.3 } = {}) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      metalness,
      roughness,
      clearcoat,
      clearcoatRoughness: 0.16,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    });
    mat.userData = { reflective: true, simulifyEnvIntensity: opacity < 1 ? 0.9 : 1.15 };
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.castShadow = opacity === 1;
    mesh.receiveShadow = opacity === 1;
    return mesh;
  };

  const momentumTrack = makeWireMesh(MOMENTUM, { metalness: 0.86, roughness: 0.22, clearcoat: 0.35 });
  const sgdTrack = makeWireMesh(SGD, { metalness: 0.80, roughness: 0.26, clearcoat: 0.28 });
  const ghostTrack = makeWireMesh(GHOST, { metalness: 0.0, roughness: 0.18, opacity: 0.72, clearcoat: 0.85 });
  ghostTrack.name = 'ghost-trajectory';
  ghostTrack.visible = false;

  const makeBall = (color, radius) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.18,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      specularIntensity: 0.95,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    mat.userData = { reflective: true, simulifyEnvIntensity: 1.2 };
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const momentumBall = makeBall(MOMENTUM, 0.115);
  const sgdBall = makeBall(SGD, 0.095);

  const handle = new THREE.Group();
  handle.name = 'start-handle';
  const ringMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f7ff,
    metalness: 0.88,
    roughness: 0.18,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  });
  ringMat.userData = { reflective: true, simulifyEnvIntensity: 1.2 };
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 16, 44), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = true;
  ring.receiveShadow = true;
  const hitTarget = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }));
  handle.add(ring, hitTarget);

  stage.scene.add(surface, rim, arrows, momentumTrack, sgdTrack, ghostTrack, momentumBall, sgdBall, handle);
  stage.addContactBlobShadow({ position: [0, 0, 0], radiusX: 3.4, radiusZ: 2.5, opacity: 0.34 });
  stage.applyEnvironment(stage.scene);

  const choreographer = new ActorChoreographer({ initialCamera: camera });
  choreographer.register('bowl', surface).register('momentum', momentumBall).register('sgd', sgdBall);
  choreographer.cameraBeat(2, 4, { ...camera, azimuth: -0.26, elevation: 0.80 });

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const manipulator = new StageManipulator(stage);
  manipulator.addHandle('start', handle, {
    onDrag({ event }) {
      const box = canvas.getBoundingClientRect();
      pointer.set(2 * (event.clientX - box.left) / box.width - 1, 1 - 2 * (event.clientY - box.top) / box.height);
      ray.setFromCamera(pointer, stage.camera);
      const hit = ray.intersectObject(surface)[0];
      if (hit) onStart({
        startX: clamp(hit.point.x, ...START_BOUNDS.x),
        startY: clamp(hit.point.z / Y_SCALE, ...START_BOUNDS.y),
      });
    },
  });

  let lastKappa;
  let lastParams;
  let lastGhost;
  function update(snapshot, params, t, ghost) {
    const { kappa, beta, startX, startY } = params;
    const surfaceChanged = kappa !== lastKappa;
    if (surfaceChanged) {
      const color = new THREE.Color();
      surface.updateHeights((_u, _v, x, z) => height(x, z / Y_SCALE, kappa),
        (u, v, h) => sampleColormap('viridis', Math.min(0.92, 0.14 + 0.74 * Math.sqrt((h - FLOOR) / HEIGHT_SCALE / 26)), color));
      surface.geometry.computeBoundingBox();
      surface.geometry.computeBoundingSphere();
      const border = [];
      const corners = [[-X_MAX, -Y_MAX], [X_MAX, -Y_MAX], [X_MAX, Y_MAX], [-X_MAX, Y_MAX]];
      corners.forEach(([x, y], i) => {
        const [endX, endY] = corners[(i + 1) % corners.length];
        for (let j = 0; j < 48; j += 1) {
          for (const u of [j / 48, (j + 1) / 48]) border.push(worldPoint(lerp(x, endX, u), lerp(y, endY, u), kappa, 0.012));
        }
      });
      setGeometry(rim, new THREE.BufferGeometry().setFromPoints(border));
      arrows.updateVectors(samplePoints.map(([x, y]) => {
        const g = gradient(x, y, kappa);
        return { origin: [x, 0.035, y * Y_SCALE], vec: [-g.x, 0, -g.y * Y_SCALE], color: 0x3d7198 };
      }), { maxMagnitude: kappa * 1.67 });
      stage.fitShadowFrustum(stage.scene, 1.12);
      lastKappa = kappa;
    }
    if (params !== lastParams) {
      updateTrail(momentumTrack, snapshot.momentumPath, kappa, { radius: 0.024, lift: 0.045 });
      const firstExit = snapshot.sgdPath.findIndex((point) => !within(point));
      // Keep the initial wall crossings visible without piling up later projected steps.
      const sgdTrail = firstExit < 0 ? snapshot.sgdPath : snapshot.sgdPath.slice(0, firstExit + 5);
      updateTrail(sgdTrack, sgdTrail, kappa, { radius: 0.019, lift: 0.034, dash: 0.68 });
      momentumTrack.visible = momentumTrack.visible && beta > 0;
      handle.position.copy(worldPoint(startX, startY, kappa, 0.25));
      lastParams = params;
    }
    if (ghost !== lastGhost || surfaceChanged) {
      if (ghost) {
        // Trace the captured coordinates on the live surface. The chart keeps the original loss.
        updateTrail(ghostTrack, ghost.frames.map(({ state }) => state), kappa,
          { radius: 0.018, lift: 0.078, dash: 0.55 });
      } else {
        ghostTrack.visible = false;
      }
      lastGhost = ghost;
    }
    choreographer.evaluate(t, { stage });
    const marker = projectToSurface(snapshot.momentum);
    momentumBall.visible = beta > 0;
    momentumBall.position.copy(worldPoint(marker.x, marker.y, kappa, 0.145));
    sgdBall.visible = within(snapshot.sgd);
    if (sgdBall.visible) sgdBall.position.copy(worldPoint(snapshot.sgd.x, snapshot.sgd.y, kappa, 0.115));
    stage.requestRender();
    return momentumBall.visible && !within(snapshot.momentum);
  }
  return { stage, choreographer, update };
}
