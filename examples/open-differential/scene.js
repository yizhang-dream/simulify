import * as THREE from 'three';
import { ActorChoreographer } from '../../kit/choreography.js';
import { createBevelledProfile, createLathedSolid, createTaperedConduit } from '../../kit/geo-sculpt.js';
import { StageManipulator } from '../../kit/manipulator.js';
import { IsometricStage } from '../../kit/stage-3d.js';
import {
  DIMENSIONS as D, DRIVETRAIN_COLORS, createAxleWheelAssembly, createBevelGear,
  createCarrierCage, createDiffHousing, createInputAssembly,
} from '../../primitives/gears-drivetrain.js';

const axleY = D.wheelDiameter / 2 + 0.027;
const handleX = -2.13;
const handleZ = 1.94;
const handleTravel = 1.39;
const radians = Math.PI / 180;
const angles = (azimuth, elevation) => ({ azimuth: azimuth * radians, elevation: elevation * radians });
const camera = { ...angles(19, 29), zoom: 1, target: [0.10, 1.44, 0.24] };

function tagInk(obj, meta) {
  obj.userData = { ...(obj.userData || {}), ...meta };
  return obj;
}

function makeIce(x) {
  const group = new THREE.Group();
  const patchId = x < 0 ? 'ice-patch-left' : 'ice-patch-right';
  group.position.set(x, 0.012, 0);
  const slab = createBevelledProfile([
    [-0.56, -1.21], [0.27, -1.35], [0.58, -0.98], [0.56, 0.87],
    [0.27, 1.27], [-0.40, 1.19], [-0.62, 0.85], [-0.68, -0.67],
  ], {
    orient: 'xz', depth: 0.018, bevelSize: 0.018, bevelThickness: 0.007,
    preset: 'enamel',
    materialOverrides: {
      color: 0x9ce2f0, roughness: 0.16, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.08, specularIntensity: 0.95,
    },
    name: 'ice-contact-patch',
  });
  tagInk(slab, { ink: 0.45, inkThin: true, inkNormals: 'none', inkGroupId: patchId });
  const gleam = {
    preset: 'enamel',
    materialOverrides: { color: 0xebfaff, roughness: 0.18, metalness: 0.0, clearcoat: 0.92 },
  };
  group.add(slab);
  for (const points of [
    [[-0.54, 0.022, -0.82], [-0.20, 0.022, -0.47], [0.07, 0.022, -0.20], [0.55, 0.022, -0.10]],
    [[-0.59, 0.022, 0.58], [-0.15, 0.022, 0.48], [0.20, 0.022, 0.80], [0.30, 0.022, 1.10]],
    [[-0.48, 0.022, -0.11], [-0.20, 0.022, -0.47], [0.10, 0.022, -0.75], [0.51, 0.022, -0.91]],
  ]) {
    const crack = createTaperedConduit(points, 0.010, { ...gleam, name: 'ice-fissure', castShadow: false });
    tagInk(crack, { ink: 0.45, inkThin: true, inkNormals: 'none', inkGroupId: patchId });
    group.add(crack);
  }
  return group;
}

export async function mountDrivetrain(canvas, onCut) {
  const stage = await IsometricStage.create(canvas, {
    ...camera, theme: document.documentElement.dataset.theme || 'paper-ink', gridStyle: 'cartesian',
    baseSpan: matchMedia('(max-width: 900px)').matches ? 5.55 : 5.45,
    backend: new URLSearchParams(location.search).get('backend') || 'auto',
  });
  const rig = new THREE.Group();
  rig.position.y = axleY;
  const housing = createDiffHousing();
  const input = createInputAssembly();
  const left = createAxleWheelAssembly('left');
  const right = createAxleWheelAssembly('right');
  const carrier = createCarrierCage();
  const crown = createBevelGear({
    pitchRadius: D.crownRadius, teeth: D.crownTeeth, boreRadius: 0.53,
    rimBore: 0.865, thickness: 0.082, coneSlope: D.crownRadius / D.pinionRadius,
    name: 'crown-wheel', inkGroupId: 'crown-wheel',
  });
  crown.rotation.z = Math.PI / 2;
  crown.position.x = -D.pinionRadius;
  carrier.add(crown);
  const spiders = [-1, 1].map((sign) => {
    const pivot = new THREE.Group();
    pivot.rotation.z = sign === 1 ? 0 : Math.PI;
    const gear = createBevelGear({
      pitchRadius: D.spiderRadius, teeth: D.spiderTeeth, boreRadius: 0.086,
      thickness: 0.092, coneSlope: D.spiderRadius / D.sideRadius,
      preset: 'satinBrass',
      name: 'spider-pinion', inkGroupId: sign > 0 ? 'spider-pinion-top' : 'spider-pinion-bot',
    });
    gear.position.y = D.sideRadius;
    const index = createLathedSolid([[0, 0], [0.034, 0], [0.034, 0.009], [0, 0.009]], {
      preset: 'enamel',
      materialOverrides: { color: 0x262b38, metalness: 0.0, roughness: 0.46, clearcoat: 0.8 },
      name: 'spider-spin-index',
    });
    tagInk(index, { inkThin: true, ink: 0.65, inkGroupId: `spider-index-${sign > 0 ? 'top' : 'bot'}` });
    index.position.set(0.156, 0.051, 0);
    gear.add(index);
    pivot.add(gear);
    carrier.add(pivot);
    return gear;
  });
  rig.add(housing, carrier, input.group, left.group, right.group);
  stage.scene.add(rig);

  const iceLeft = makeIce(-D.wheelCenter);
  const iceRight = makeIce(D.wheelCenter);
  const track = new THREE.Group();
  track.position.set(handleX, 0.16, handleZ);
  track.add(tagInk(createTaperedConduit([[0, 0, 0], [handleTravel, 0, 0]], 0.027, {
    preset: 'satinSteel', materialOverrides: { color: 0x939ca5 },
    capEnds: true, name: 'cutaway-track',
  }), { inkThin: true, inkGroupId: 'cutaway-track' }));
  const knob = tagInk(createLathedSolid([
    [0, -0.068], [0.10, -0.068], [0.14, -0.025], [0.14, 0.057], [0.10, 0.104], [0, 0.104],
  ], {
    profileFillet: 0.028, profileFilletSegments: 8,
    preset: 'enamel',
    materialOverrides: {
      color: DRIVETRAIN_COLORS.torque, metalness: 0.0, roughness: 0.46,
      clearcoat: 0.88, clearcoatRoughness: 0.12,
    },
    name: 'cutaway-handle',
  }), { inkGroupId: 'cutaway-handle' });
  track.add(knob);
  stage.scene.add(iceLeft, iceRight, track);

  // Grounding studio contact shadows beneath tires & central differential casting
  stage.addContactBlobShadow({ position: [-D.wheelCenter, 0, 0], radiusX: 0.58, radiusZ: 1.15, opacity: 0.28 });
  stage.addContactBlobShadow({ position: [D.wheelCenter, 0, 0], radiusX: 0.58, radiusZ: 1.15, opacity: 0.28 });
  stage.addContactBlobShadow({ position: [0, 0, 0.16], radiusX: 1.55, radiusZ: 1.38, opacity: 0.18 });

  // Apply selective StudioLightformer IBL & tight light-view-space shadow frustum
  stage.applyEnvironment(stage.scene);
  stage.fitShadowFrustum(rig, 1.12);

  const manipulator = new StageManipulator(stage);
  manipulator.addHandle('cutaway', knob, {
    planeNormal: [0, 1, 0], planePoint: [handleX, 0.20, handleZ],
    axis: [1, 0, 0], origin: [handleX, 0.20, handleZ], min: 0, max: handleTravel,
    onDrag: ({ value }) => onCut(value / handleTravel),
  });

  const choreographer = new ActorChoreographer({ initialCamera: camera });
  choreographer.register('housing', housing).register('input', input.group)
    .register('left-axle', left.group).register('right-axle', right.group);
  for (const [id, object, at] of [
    ['carrier', carrier, 4], ['input-pinion', input.pinion, 4],
    ['left-side-gear', left.sideGear, 4], ['right-side-gear', right.sideGear, 4],
    ['cut-handle', track, 4], ['ice-right', iceRight, 12.3],
  ]) choreographer.register(id, object).enter(id, at, 0);
  choreographer.cameraBeat(4, 1.6, { ...angles(14, 32), zoom: 1.04 });
  choreographer.cameraBeat(8, 1.25, { ...angles(-14, 34), zoom: 1.05 });
  choreographer.cameraBeat(12, 1.25, { ...angles(19, 29), zoom: 1.00 });

  function update(s, t, useStory) {
    choreographer.evaluate(t, { stage });
    housing.setCutaway(s.cutaway);
    input.group.rotation.y = s.inputAngle;
    carrier.rotation.x = s.carrierAngle;
    left.group.rotation.x = s.leftAngle;
    right.group.rotation.x = s.rightAngle;
    for (const gear of spiders) gear.rotation.y = -s.spiderAngle;
    if (!useStory) {
      for (const part of [carrier, input.pinion, left.sideGear, right.sideGear]) part.visible = s.cutaway > 0;
    }
    track.visible = !useStory || t >= 4;
    knob.position.x = s.cutaway * handleTravel;
    iceLeft.visible = s.muLeft < 0.29;
    iceRight.visible = s.muRight < 0.29;
    stage.requestRender();
  }

  return { stage, choreographer, update };
}
