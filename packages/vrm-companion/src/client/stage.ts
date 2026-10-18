import {
  AmbientLight,
  Box3,
  Clock,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  Quaternion,
  Euler,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { BotPresentationSnapshot } from '@botharness/ui/panels';

export interface Stage {
  update(snapshot: BotPresentationSnapshot): void;
  dispose(): void;
}
export function mountStage(
  host: HTMLElement,
  model: string,
  status: (value: string) => void,
): Stage {
  for (const key of Object.keys(host.dataset))
    if (key !== 'vrmStage' && key.startsWith('vrm')) delete host.dataset[key];
  const started = performance.now();
  let disposed = false;
  let vrm: VRM | undefined;
  let frame = 0;
  let visible = true;
  let latest: BotPresentationSnapshot | undefined;
  let width = 0,
    height = 0,
    last = 0;
  let frames = 0,
    elapsed = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.05, 100);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  renderer.domElement.setAttribute('aria-label', 'VRM character');
  host.append(renderer.domElement);
  scene.add(new AmbientLight(0xffffff, 1.2));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(1, 2, 3);
  scene.add(key);
  const clock = new Clock();
  const base = new Map<string, Quaternion>();
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
    if (vrm) {
      const moving =
        !reduced.matches && latest?.sync === 'live' && latest.available && !latest.paused;
      const phase = time / 1000;
      const activity = latest?.activity ?? 'idle';
      const sway = moving ? Math.sin(phase * 1.5) * 0.015 : 0;
      const thinking = activity === 'thinking';
      const working = activity === 'working';
      const blocked = activity === 'blocked';
      const waiting = activity === 'waiting';
      const talking = moving && latest?.speaking;
      pose('spine', sway, 0, 0, 0.2);
      pose(
        'head',
        thinking ? -0.12 : blocked ? 0.12 : sway,
        thinking ? 0.15 : waiting ? -0.2 : 0,
        talking ? Math.sin(phase * 5) * 0.025 : 0,
        0.15,
      );
      pose('leftUpperArm', working && moving ? Math.sin(phase * 2) * 0.08 : 0, 0, -1.15, 0.2);
      pose('rightUpperArm', working && moving ? -Math.sin(phase * 2) * 0.08 : 0, 0, 1.15, 0.2);
      pose('leftLowerArm', thinking ? -0.6 : -0.1, 0, 0, 0.2);
      pose('rightLowerArm', talking ? -0.35 : -0.1, 0, 0, 0.2);
      const expressions = vrm.expressionManager;
      if (expressions?.getExpression('aa'))
        expressions.setValue('aa', moving ? (latest?.mouth ?? 0) : 0);
      const blink = moving && phase % 4 < 0.16 ? Math.sin(((phase % 4) / 0.16) * Math.PI) : 0;
      if (expressions?.getExpression('blink')) expressions.setValue('blink', blink);
      vrm.update(delta);
    }
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
    status('3D rendering interrupted. Retry to reload the character.');
    reconcile();
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  status('Loading character…');
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
      VRMUtils.rotateVRM0(loaded);
      scene.add(loaded.scene);
      const box = new Box3().setFromObject(loaded.scene);
      const center = box.getCenter(new Vector3()),
        size = box.getSize(new Vector3());
      camera.position.set(center.x, center.y + size.y * 0.12, center.z + size.y * 2.0);
      camera.lookAt(center.x, center.y + size.y * 0.08, center.z);
      status('');
      host.dataset.vrmLoaded = 'true';
      host.dataset.vrmLoadMs = String(Math.round(performance.now() - started));
      reconcile();
    })
    .catch(() => {
      if (!disposed)
        status('Character could not load. Bot activity and messages remain available.');
    });
  return {
    update(snapshot) {
      latest = snapshot;
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
      if (vrm) {
        scene.remove(vrm.scene);
        release(vrm);
        vrm = undefined;
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
