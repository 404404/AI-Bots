import {
  AmbientLight,
  HemisphereLight,
  PMREMGenerator,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  Box3,
  Clock,
  DirectionalLight,
  PerspectiveCamera,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
  Quaternion,
  Euler,
  Group,
  Object3D,
  Color,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  SphereGeometry,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { BotPresentationSnapshot } from '@botharness/ui/panels';
import { RoomMotion, type MotionCommand } from './motion.js';
import { FACE_EXPRESSIONS, FaceBlend, dominantFace, faceTarget, type FaceWeights } from './face.js';
import { IdleScheduler, type IdleAction } from './idle.js';
import { createRoom, type Mood } from './room.js';
import { enableLilToon } from '@mochiya/three-liltoon';
import { createCharacterShading, type CharacterShading } from './shading.js';

export type CameraView = 'desk' | 'room' | 'portrait';
export interface SceneState {
  phase: string;
  wandering: boolean;
  ready: boolean;
}
export interface SceneChoices {
  camera: CameraView;
  mood: Mood;
  shading: CharacterShading;
}
export interface StageCallbacks {
  loading(value: string): void;
  error(value: string): void;
  changed(state: SceneState): void;
}
export interface Stage {
  update(snapshot: BotPresentationSnapshot): void;
  command(command: MotionCommand): void;
  camera(view: CameraView): void;
  mood(value: Mood): void;
  shading(value: CharacterShading): void;
  dispose(): void;
}
const GRIP = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const SIDEWAYS = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
export function mountStage(
  host: HTMLElement,
  model: string,
  { loading, error, changed }: StageCallbacks,
  initial: SceneChoices = { camera: 'desk', mood: 'auto', shading: 'mtoon' },
): Stage {
  for (const key of Object.keys(host.dataset))
    if (key !== 'vrmStage' && key.startsWith('vrm')) delete host.dataset[key];
  const started = performance.now();
  let disposed = false;
  let vrm: VRM | undefined;
  let face: FaceBlend | undefined;
  let frame = 0;
  let visible = true;
  let latest: BotPresentationSnapshot | undefined;
  const motion = new RoomMotion();
  const idle = new IdleScheduler();
  let room: ReturnType<typeof createRoom> | undefined;
  let shading: ReturnType<typeof createCharacterShading> | undefined;
  let hipDrop = 0;
  let floorOffset = 0;
  let modelScale = 1;
  let phase = 0;
  let gait = 0;
  let cameraView: CameraView = initial.camera;
  let previousState = '';
  let width = 0,
    height = 0,
    last = 0;
  let frames = 0,
    elapsed = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new Scene();
  scene.background = new Color(0x423a42);
  const actor = new Group();
  scene.add(actor);
  const gaze = new Object3D();
  scene.add(gaze);
  const camera = new PerspectiveCamera(38, 1, 0.05, 100);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  const releaseLilToon = enableLilToon(renderer);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  const environment = new RoomEnvironment();
  const generator = new PMREMGenerator(renderer);
  const environmentMap = generator.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.3;
  environment.dispose();
  generator.dispose();
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  renderer.domElement.setAttribute('aria-label', 'VRM character');
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.8;
  controls.maxDistance = 7;
  controls.minAzimuthAngle = -Math.PI * 0.45;
  controls.maxAzimuthAngle = Math.PI * 0.45;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.48;
  const ambient = new AmbientLight(0xffe7cf, 0.55);
  scene.add(ambient);
  const fill = new HemisphereLight(0xd5e3ed, 0xb48261, 0.7);
  scene.add(fill);
  const key = new DirectionalLight(0xffd8b8, 0.9);
  key.position.set(-1, 2, 3);
  scene.add(key);
  const clock = new Clock();
  const base = new Map<string, Quaternion>();
  const fitCamera = (view: CameraView) => {
    cameraView = view;
    const portrait = view === 'portrait';
    const target = portrait
      ? new Vector3(motion.x, 1.16 - motion.seated * 0.1, motion.z)
      : new Vector3(camera.aspect < 0.8 ? 0.15 : 0.05, 1.2, -0.1);
    const offset =
      view === 'room'
        ? new Vector3(-2.5, 1.5, 4.4)
        : portrait
          ? new Vector3(-0.45, 0.12, 1.55)
          : new Vector3(0.35, 0.3, 2.7);
    const aspectScale = Math.max(1, Math.min(1.25, 0.75 / camera.aspect));
    offset.multiplyScalar(aspectScale);
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    controls.update();
    host.dataset.vrmCamera = view;
  };
  const notify = () => {
    const next = `${motion.phase}:${motion.wandering}:${!!vrm}`;
    if (next !== previousState) {
      previousState = next;
      changed({ phase: motion.phase, wandering: motion.wandering, ready: !!vrm });
    }
    host.dataset.vrmMotion = motion.phase;
    host.dataset.vrmSeated = motion.seated.toFixed(3);
    host.dataset.vrmPosition = `${motion.x.toFixed(3)},${motion.z.toFixed(3)}`;
  };
  const release = (value: VRM) => {
    value.scene.traverse((object) => {
      const mesh = object as import('three').Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials)
        if (material)
          for (const entry of Object.values(material)) {
            const image = (entry as { isTexture?: boolean; source?: { data?: unknown } } | null)
              ?.isTexture
              ? (entry as import('three').Texture).source.data
              : undefined;
            if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
          }
    });
    VRMUtils.deepDispose(value.scene);
  };
  const canDraw = () =>
    !disposed &&
    visible &&
    !document.hidden &&
    width > 0 &&
    height > 0 &&
    !renderer.getContext().isContextLost();
  const pose = (bone: VRMHumanBoneName, x: number, y: number, z: number, factor: number) => {
    const node = vrm?.humanoid.getNormalizedBoneNode(bone);
    if (!node) return;
    const initial = base.get(bone) ?? node.quaternion.clone();
    base.set(bone, initial);
    node.quaternion.slerp(
      initial.clone().multiply(new Quaternion().setFromEuler(new Euler(x, y, z))),
      reduced.matches ? 1 : factor,
    );
  };
  const draw = (time: number) => {
    frame = 0;
    if (!canDraw()) return;
    frame = requestAnimationFrame(draw);
    if (time - last < 1000 / (reduced.matches ? 10 : 30)) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    last = time;
    const daylight = room?.update(reduced.matches ? 0 : delta);
    if (daylight) {
      ambient.intensity = 0.14 + daylight.daylight * 0.46 + daylight.twilight * 0.2;
      fill.intensity = 0.18 + daylight.daylight * 0.67 + daylight.twilight * 0.35;
      key.intensity = 0.28 + daylight.daylight * 0.82 + daylight.twilight * 0.25;
      key.color
        .setHex(0x9fb2ff)
        .lerp(new Color(0xffd8b8), Math.min(1, daylight.daylight + daylight.twilight));
      scene.environmentIntensity = 0.06 + daylight.daylight * 0.39 + daylight.twilight * 0.2;
      host.dataset.vrmHour = daylight.hour.toFixed(3);
      host.dataset.vrmAssets = room?.assets;
    }
    if (vrm) {
      const moving =
        !reduced.matches && latest?.sync === 'live' && latest.available && !latest.paused;
      phase += delta;
      const activity = latest?.activity ?? 'idle';
      const live = latest?.sync === 'live' && latest.available && !latest.paused;
      motion.step(delta, {
        enabled: !!live,
        idle: activity === 'idle' && !latest?.speaking,
        reduced: reduced.matches,
      });
      gait += delta * 7 * motion.stride;
      actor.position.set(motion.x, floorOffset - hipDrop * motion.seated, motion.z);
      actor.rotation.y = motion.yaw;
      notify();
      const sway = moving ? Math.sin(phase * 1.5) * 0.015 : 0;
      const thinking = activity === 'thinking';
      const working = activity === 'working';
      const blocked = activity === 'blocked';
      const waiting = activity === 'waiting';
      const talking = moving && latest?.speaking;
      const blend = 1 - Math.exp(-delta * 10);
      const sit = motion.seated;
      const walk = Math.sin(gait) * 0.28 * motion.stride;
      const resting =
        !!live &&
        activity === 'idle' &&
        !latest?.speaking &&
        motion.phase === 'seated' &&
        sit >= 1 &&
        !reduced.matches;
      const idleFrame = idle.step(delta, resting);
      const doing = (action: IdleAction) => (idleFrame.action === action ? idleFrame.weight : 0);
      const outside = doing('window');
      const stretch = doing('stretch');
      const chin = doing('chin');
      const sip = doing('sip');
      const glance = doing('glance');
      const drinkPath = (progress: number) => {
        const span = (from: number, to: number) =>
          Math.max(0, Math.min(1, (progress - from) / (to - from)));
        return {
          reach: span(0, 0.22) - span(0.86, 1),
          lift: span(0.24, 0.42) - span(0.68, 0.84),
          tilt: span(0.4, 0.48) - span(0.6, 0.68),
        };
      };
      const drink = sip ? drinkPath(idleFrame.progress) : { reach: 0, lift: 0, tilt: 0 };
      host.dataset.vrmIdle = idleFrame.action ?? 'none';
      pose(
        'spine',
        sway + (working ? 0.04 : 0) - stretch * 0.14 + sip * drink.reach * 0.12 * (1 - drink.lift),
        -outside * 0.3 - sip * drink.reach * 0.2 * (1 - drink.lift),
        0,
        blend,
      );
      pose('rightShoulder', 0, sip * drink.reach * 0.15 * (1 - drink.lift), 0, blend);
      const looking = talking || waiting || blocked || glance > 0.5;
      const desk = room?.tableY ?? 0.75;
      const desiredGaze = looking
        ? camera.position.clone()
        : thinking && live
          ? new Vector3(motion.x - 0.9, desk + 1.6, motion.z + 1.2)
          : sip > 0 && room
            ? room.mug.getWorldPosition(new Vector3())
            : new Vector3(-0.36, desk + 0.48, 0.78);
      if (outside > 0) desiredGaze.lerp(new Vector3(-2.4, desk + 1.1, -0.9), outside);
      gaze.position.lerp(desiredGaze, reduced.matches ? 1 : blend);
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      const headPosition =
        head?.getWorldPosition(new Vector3()) ?? new Vector3(motion.x, 1.2, motion.z);
      const direction = gaze.position.clone().sub(headPosition);
      const yaw = Math.atan2(
        Math.sin(Math.atan2(direction.x, direction.z) - motion.yaw),
        Math.cos(Math.atan2(direction.x, direction.z) - motion.yaw),
      );
      pose(
        'head',
        (thinking ? -0.1 : blocked ? 0.1 : working && !talking ? 0.08 : sway) -
          stretch * 0.25 +
          chin * 0.06 -
          sip * drink.lift * 0.22,
        Math.max(-0.35, Math.min(0.35, yaw * 0.4)) + (waiting ? -0.1 : 0) - outside * 0.25,
        (talking ? Math.sin(phase * 5) * 0.025 : 0) - chin * 0.14,
        blend,
      );
      const typing = working && moving ? Math.sin(phase * 8) * 0.025 : 0;
      const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
      pose(
        'leftUpperArm',
        mix(-sit * 1.05 + walk + typing, -0.2, stretch),
        0,
        mix(-1.4, 1.15, stretch),
        blend,
      );
      pose(
        'rightUpperArm',
        mix(-sit * 1.05 - walk - typing, -0.2, stretch),
        0,
        mix(1.4, -1.15, stretch),
        blend,
      );
      pose(
        'leftLowerArm',
        mix(-0.12 - sit * 0.28 - (thinking ? 0.15 : 0), -0.35, stretch),
        0,
        0,
        blend,
      );
      pose(
        'rightLowerArm',
        mix(-0.12 - sit * 0.28 - (talking ? Math.sin(phase * 2) * 0.06 : 0), -0.35, stretch),
        0,
        0,
        blend,
      );
      pose('leftUpperLeg', (-sit * Math.PI) / 2 + walk, 0, 0, blend);
      pose('rightUpperLeg', (-sit * Math.PI) / 2 - walk, 0, 0, blend);
      pose('leftLowerLeg', (sit * Math.PI) / 2 + Math.max(0, -walk) * 1.4, 0, 0, blend);
      pose('rightLowerLeg', (sit * Math.PI) / 2 + Math.max(0, walk) * 1.4, 0, 0, blend);
      pose('leftFoot', -Math.max(0, -walk) * 0.4, 0, 0, blend);
      pose('rightFoot', -Math.max(0, walk) * 0.4, 0, 0, blend);
      const reach = sit * (1 - stretch);
      let rightGoal: Vector3 | undefined;
      let rightWeight = 0;
      let rightGrip: Quaternion | undefined;
      if (room) {
        room.mug.position.copy(room.mugHome);
        room.mug.quaternion.identity();
      }
      if (room && head && (chin > 0 || sip > 0)) {
        actor.updateMatrixWorld(true);
        const facing = new Vector3(Math.sin(motion.yaw), 0, Math.cos(motion.yaw));
        const mouth = head
          .getWorldPosition(new Vector3())
          .addScaledVector(facing, 0.11 * modelScale)
          .add(new Vector3(0, 0.02 * modelScale, 0));
        if (chin > 0) {
          rightGoal = mouth.clone().add(new Vector3(0.02, -0.07 * modelScale, 0));
          rightWeight = chin;
        } else {
          const lifted = sip * drink.lift;
          const held = new Quaternion()
            .setFromAxisAngle(new Vector3(1, 0, 0), -0.6 * drink.tilt)
            .multiply(SIDEWAYS);
          const atMouth = mouth.clone().sub(room.mugRim.clone().applyQuaternion(held));
          room.mug.position.lerp(atMouth, lifted);
          room.mug.quaternion.slerp(held, lifted);
          rightGoal = room.mugWrist
            .clone()
            .applyQuaternion(room.mug.quaternion)
            .add(room.mug.position);
          rightGrip = room.mug.quaternion.clone().multiply(GRIP);
          rightWeight = sip * drink.reach;
        }
      }
      if (reach > 0 && room) {
        for (const side of ['left', 'right'] as const) {
          const upper = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
          const lower = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
          const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`);
          if (!upper || !lower || !hand) continue;
          actor.updateMatrixWorld(true);
          const a = upper.getWorldPosition(new Vector3());
          const b = lower.getWorldPosition(new Vector3());
          const c = hand.getWorldPosition(new Vector3());
          const keys = new Vector3(side === 'left' ? 0.72 : 0.42, room.tableY + 0.1 + typing, 0.16);
          const free = side === 'right' && rightGoal ? rightWeight : 0;
          if (free > 0 && rightGoal) keys.lerp(rightGoal, free);
          const goal = c.clone().lerp(keys, reach);
          const lengthA = a.distanceTo(b),
            lengthB = b.distanceTo(c);
          const direction = goal.clone().sub(a).normalize();
          const distance = Math.max(0.001, Math.min(a.distanceTo(goal), lengthA + lengthB - 0.001));
          const along =
            (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
          const pole = new Vector3(side === 'left' ? 0.5 : -0.5, -1, 0);
          pole.addScaledVector(direction, -pole.dot(direction)).normalize();
          const elbow = a
            .clone()
            .addScaledVector(direction, along)
            .addScaledVector(pole, Math.sqrt(Math.max(0, lengthA * lengthA - along * along)));
          const aim = (bone: Object3D, from: Vector3, to: Vector3) => {
            const rotation = new Quaternion()
              .setFromUnitVectors(from.normalize(), to.normalize())
              .multiply(bone.getWorldQuaternion(new Quaternion()));
            bone.quaternion.copy(
              bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(rotation),
            );
            bone.updateWorldMatrix(false, true);
          };
          aim(upper, b.clone().sub(a), elbow.clone().sub(a));
          const elbowNow = lower.getWorldPosition(new Vector3());
          aim(lower, hand.getWorldPosition(new Vector3()).sub(elbowNow), goal.sub(elbowNow));
          const wrist = new Quaternion().setFromEuler(
            new Euler(0, side === 'left' ? -Math.PI / 2 : Math.PI / 2, 0),
          );
          const held = side === 'right' && rightGrip;
          if (held) wrist.slerp(rightGrip!, free);
          hand.quaternion.slerp(
            hand.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(wrist),
            held ? reach : reach * (1 - free * 0.8),
          );
        }
      }
      const grasp = rightGrip ? rightWeight : 0;
      for (const side of ['left', 'right'] as const) {
        const curl = side === 'right' ? 0.15 + grasp * 0.95 : 0.15;
        const sign = side === 'right' ? 1 : -1;
        for (const finger of ['Index', 'Middle', 'Ring', 'Little'] as const) {
          pose(`${side}${finger}Proximal`, 0, 0, sign * curl, blend);
          pose(`${side}${finger}Intermediate`, 0, 0, sign * curl * 1.1, blend);
          pose(`${side}${finger}Distal`, 0, 0, sign * curl * 0.7, blend);
        }
        const thumb = side === 'right' ? grasp : 0;
        pose(`${side}ThumbProximal`, 0, sign * -0.35 * thumb, sign * 0.2 * thumb, blend);
        pose(`${side}ThumbDistal`, 0, sign * -0.3 * thumb, 0, blend);
      }
      const expressions = vrm.expressionManager;
      if (expressions?.getExpression('aa'))
        expressions.setValue('aa', moving ? (latest?.mouth ?? 0) : 0);
      const blink = moving && phase % 4 < 0.16 ? Math.sin(((phase % 4) / 0.16) * Math.PI) : 0;
      if (expressions?.getExpression('blink')) expressions.setValue('blink', blink);
      if (expressions && face) {
        const target = faceTarget(latest, phase, reduced.matches);
        const accent: Partial<FaceWeights> = {
          relaxed: Math.max(stretch * 0.75, sip * drink.lift * 0.5, chin * 0.3),
          happy: Math.max(glance * 0.45, chin * 0.15),
        };
        for (const [name, value] of Object.entries(accent) as [keyof FaceWeights, number][])
          target[name] = Math.max(target[name], value);
        const weights = face.step(target, delta, reduced.matches);
        for (const name of FACE_EXPRESSIONS)
          if (face.available.has(name)) expressions.setValue(name, weights[name]);
        host.dataset.vrmFace = dominantFace(weights);
      }
      vrm.update(delta);
      host.dataset.vrmMouth = String(expressions?.getValue('aa') ?? 0);
    }
    controls.update();
    shading?.update();
    renderer.render(scene, camera);
    frames++;
    elapsed += delta;
    host.dataset.vrmFrames = String(frames);
    host.dataset.vrmGeometries = String(renderer.info.memory.geometries);
    host.dataset.vrmTextures = String(renderer.info.memory.textures);
    host.dataset.vrmCalls = String(renderer.info.render.calls);
    host.dataset.vrmSeconds = elapsed.toFixed(2);
  };
  const reconcile = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    clock.getDelta();
    last = 0;
    if (canDraw()) frame = requestAnimationFrame(draw);
  };
  const resize = new ResizeObserver(() => {
    const box = host.getBoundingClientRect();
    width = box.width;
    height = box.height;
    if (width > 0 && height > 0) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCamera(cameraView);
    }
    reconcile();
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    reconcile();
  });
  intersection.observe(host);
  document.addEventListener('visibilitychange', reconcile);
  reduced.addEventListener('change', reconcile);
  const lost = (event: Event) => {
    event.preventDefault();
    loading('');
    error('3D rendering interrupted. Retry to reload the character.');
    reconcile();
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loading('Loading character…');
  void loader
    .loadAsync(model)
    .then((gltf) => {
      const loaded = gltf.userData.vrm as VRM | undefined;
      if (!loaded) {
        VRMUtils.deepDispose(gltf.scene);
        throw new Error('invalid_vrm');
      }
      if (disposed) {
        release(loaded);
        return;
      }
      vrm = loaded;
      face = new FaceBlend(
        new Set(FACE_EXPRESSIONS.filter((name) => loaded.expressionManager?.getExpression(name))),
      );
      host.dataset.vrmFaces = [...face.available].join(' ');
      shading = createCharacterShading(loaded.scene);
      host.dataset.vrmShading = 'mtoon';
      if (initial.shading !== 'mtoon') {
        shading.select(initial.shading);
        host.dataset.vrmShading = initial.shading;
      }
      VRMUtils.rotateVRM0(loaded);
      actor.add(loaded.scene);
      loaded.scene.traverse((object) => {
        if (object instanceof Mesh) object.castShadow = object.receiveShadow = true;
      });
      const box = new Box3().setFromObject(loaded.scene);
      const size = box.getSize(new Vector3());
      modelScale = 1.65 / Math.max(size.y, 0.1);
      actor.scale.setScalar(modelScale);
      floorOffset = -box.min.y * modelScale;
      actor.updateMatrixWorld(true);
      const hips = loaded.humanoid.getNormalizedBoneNode('hips')?.getWorldPosition(new Vector3());
      const knee = loaded.humanoid
        .getNormalizedBoneNode('leftLowerLeg')
        ?.getWorldPosition(new Vector3());
      const ankle = loaded.humanoid
        .getNormalizedBoneNode('leftFoot')
        ?.getWorldPosition(new Vector3());
      const seatHeight = Math.max(
        0.32,
        Math.min(0.58, (knee?.y ?? 0.45) - (ankle?.y ?? 0.05) + 0.04),
      );
      hipDrop = (hips?.y ?? 0.9) + floorOffset - seatHeight - 0.07;
      room = createRoom(seatHeight);
      room.setMood(initial.mood);
      host.dataset.vrmMood = initial.mood;
      scene.remove(key);
      scene.add(room.root);
      scene.add(key);
      actor.position.set(motion.x, floorOffset - hipDrop, motion.z);
      const rawHead = loaded.humanoid.getRawBoneNode('head');
      if (rawHead) {
        const headphones = new Group();
        const shell = new MeshStandardMaterial({ color: 0x8d3e4c, roughness: 0.7 });
        const cushion = new MeshStandardMaterial({ color: 0x27333e, roughness: 1 });
        const band = new Mesh(new TorusGeometry(0.122, 0.018, 8, 32, Math.PI), shell);
        band.position.y = 0.075;
        headphones.add(band);
        for (const side of [-1, 1]) {
          const cup = new Mesh(new SphereGeometry(0.052, 16, 12), shell);
          cup.scale.set(0.55, 1, 0.85);
          cup.position.set(side * 0.122, 0.065, 0);
          headphones.add(cup);
          const pad = new Mesh(new SphereGeometry(0.05, 16, 12), cushion);
          pad.scale.set(0.4, 1, 0.8);
          pad.position.set(side * 0.105, 0.065, 0);
          headphones.add(pad);
        }
        actor.updateMatrixWorld(true);
        headphones.position.copy(rawHead.getWorldPosition(new Vector3()));
        headphones.quaternion.copy(actor.getWorldQuaternion(new Quaternion()));
        headphones.scale.setScalar(modelScale);
        scene.add(headphones);
        rawHead.attach(headphones);
      }
      if (loaded.lookAt) loaded.lookAt.target = gaze;
      gaze.position.copy(camera.position);
      fitCamera(initial.camera);
      notify();
      loading('');
      host.dataset.vrmLoaded = 'true';
      host.dataset.vrmLoadMs = String(Math.round(performance.now() - started));
      reconcile();
    })
    .catch(() => {
      if (disposed) return;
      loading('');
      error('Character could not load. Bot activity and messages remain available.');
    });
  return {
    update(snapshot) {
      latest = snapshot;
    },
    command(command) {
      if (!vrm || !latest?.available || latest.paused || latest.sync !== 'live') return;
      motion.command(command);
      notify();
    },
    camera(view) {
      if (!disposed) fitCamera(view);
    },
    mood(value) {
      room?.setMood(value);
      host.dataset.vrmMood = value;
    },
    shading(value) {
      shading?.select(value);
      host.dataset.vrmShading = value;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      reduced.removeEventListener('change', reconcile);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      controls.dispose();
      key.shadow.dispose();
      room?.dispose();
      shading?.dispose();
      releaseLilToon();
      environmentMap.dispose();
      if (vrm) {
        actor.remove(vrm.scene);
        release(vrm);
        vrm = undefined;
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
