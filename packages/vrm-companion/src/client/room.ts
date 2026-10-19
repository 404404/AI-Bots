import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from 'three';
import { createOutdoors, type SkyTime } from './outdoors.js';
import { CHAIR } from './motion.js';
import { createRoomMaterials } from './materials.js';
import { createChair } from './chair.js';
import { createDecor } from './decor.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Mood = SkyTime;
export function createRoom(seatHeight: number) {
  const root = new Group();
  const materials = createRoomMaterials();
  const textures: CanvasTexture[] = [...materials.textures];
  const { wood, dark, cream, brass } = materials;
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: MeshStandardMaterial = wood,
  ) => {
    const mesh = new Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.035, w / 5, h / 5, d / 5)),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const cylinder = (
    x: number,
    y: number,
    z: number,
    top: number,
    bottom: number,
    h: number,
    material = dark,
  ) => {
    const mesh = new Mesh(new CylinderGeometry(top, bottom, h, 24), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const tableY = seatHeight + 0.3;
  box(0, -0.06, 0, 4.4, 0.12, 3.6, wood);
  box(0, 2.88, -1.25, 4.4, 0.2, 0.12, dark);
  box(-2.15, 1.45, -0.25, 0.12, 2.9, 2.1, materials.plaster);
  box(2.15, 1.45, 0.25, 0.12, 2.9, 3.1, materials.plaster);
  for (const x of [-2.08, 2.08]) box(x, 1.45, -1.25, 0.2, 2.9, 0.12, dark);
  box(0, 2.94, 0.25, 4.4, 0.12, 3.1, cream);
  box(2.07, 0.08, 0.25, 0.05, 0.16, 3, dark);
  box(0, 0.3, -1.14, 4.2, 0.6, 0.14, wood);
  const outdoors = createOutdoors();
  root.add(outdoors.root);
  for (const x of [-1.98, -0.72, 0.6, 1.98]) box(x, 1.72, -1.08, 0.07, 2.16, 0.12, dark);
  for (const y of [0.65, 2.78]) box(0, y, -1.05, 4.04, 0.08, 0.19, dark);
  box(0, 0.6, -0.98, 4.15, 0.09, 0.38, wood);
  box(-0.2, tableY, 0.52, 3.2, 0.09, 0.8);
  for (const x of [-1.55, 1.15])
    for (const z of [0.21, 0.83]) box(x, tableY / 2, z, 0.07, tableY, 0.07, dark);
  root.add(createChair(seatHeight, materials));
  cylinder(CHAIR.x, seatHeight / 2, CHAIR.z, 0.035, 0.045, seatHeight, dark);
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    const leg = box(
      CHAIR.x + Math.sin(angle) * 0.12,
      0.07,
      CHAIR.z + Math.cos(angle) * 0.12,
      0.035,
      0.035,
      0.3,
      dark,
    );
    leg.rotation.y = angle;
    const wheel = new Mesh(new SphereGeometry(0.04, 12, 8), dark);
    wheel.position.set(CHAIR.x + Math.sin(angle) * 0.26, 0.05, CHAIR.z + Math.cos(angle) * 0.26);
    root.add(wheel);
  }
  const monitorStart = root.children.length;
  box(-0.65, tableY + 0.06, 0.78, 0.42, 0.035, 0.27, dark);
  box(-0.65, tableY + 0.23, 0.83, 0.05, 0.4, 0.05, dark);
  box(-0.65, tableY + 0.48, 0.82, 0.82, 0.49, 0.055, cream);
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 320;
  const screen2d = screenCanvas.getContext('2d')!;
  screen2d.fillStyle = '#263b48';
  screen2d.fillRect(0, 0, 512, 320);
  screen2d.fillStyle = '#9fb4b3';
  screen2d.fillRect(24, 25, 150, 10);
  for (let i = 0; i < 13; i++) {
    screen2d.fillStyle = i % 3 === 0 ? '#d8b38b' : '#688b93';
    screen2d.fillRect(24 + (i % 3) * 12, 56 + i * 16, 140 + ((i * 47) % 280), 5);
  }
  const screenTexture = new CanvasTexture(screenCanvas);
  screenTexture.colorSpace = SRGBColorSpace;
  textures.push(screenTexture);
  const screen = new Mesh(
    new PlaneGeometry(0.75, 0.42),
    new MeshBasicMaterial({ map: screenTexture }),
  );
  screen.rotation.y = Math.PI;
  screen.position.set(-0.65, tableY + 0.48, 0.786);
  root.add(screen);
  const monitor = new Group();
  monitor.position.set(-0.65, tableY, 0.82);
  root.add(monitor);
  root.updateMatrixWorld(true);
  for (const part of root.children.slice(monitorStart, -1)) monitor.attach(part);
  monitor.rotation.y = -1.05;
  monitor.position.z = 0.3;
  box(0.48, tableY + 0.06, 0.23, 0.57, 0.025, 0.2, dark);
  box(0.52, tableY + 0.049, 0.29, 0.94, 0.006, 0.42, materials.fabric);
  const mouse = new Mesh(new SphereGeometry(0.045, 20, 14), cream);
  mouse.scale.set(0.75, 0.45, 1.3);
  mouse.position.set(0.9, tableY + 0.071, 0.25);
  mouse.castShadow = true;
  root.add(mouse);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 12; col++)
      box(0.23 + col * 0.045, tableY + 0.08, 0.16 + row * 0.04, 0.035, 0.012, 0.028, cream);
  const decor = createDecor(tableY);
  root.add(decor.root);
  box(-0.85, tableY + 0.055, 0.4, 0.22, 0.007, 0.16, cream).rotation.y = 0.2;
  const cup = new Mesh(new CylinderGeometry(0.085, 0.075, 0.18, 32, 1, true), cream);
  cup.position.set(-0.12, tableY + 0.14, 0.3);
  cup.castShadow = true;
  root.add(cup);
  const coffee = new MeshStandardMaterial({ color: 0x21120c, roughness: 0.22 });
  cylinder(-0.12, tableY + 0.215, 0.3, 0.078, 0.078, 0.005, coffee);
  const rim = new Mesh(new TorusGeometry(0.082, 0.006, 8, 32), cream);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(-0.12, tableY + 0.23, 0.3);
  root.add(rim);
  const steam: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const material = new MeshBasicMaterial({
      color: 0xffecdb,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    });
    const wisp = new Mesh(new TorusGeometry(0.035, 0.007, 5, 16, Math.PI * 1.4), material);
    root.add(wisp);
    steam.push(wisp);
  }
  const handle = new Mesh(new TorusGeometry(0.055, 0.015, 8, 20), cream);
  handle.position.set(-0.02, tableY + 0.15, 0.3);
  root.add(handle);
  box(1.58, 0.8, -0.85, 0.44, 0.28, 0.2, cream);
  for (const x of [1.46, 1.7]) {
    const speaker = new Mesh(new CylinderGeometry(0.09, 0.09, 0.012, 24), dark);
    speaker.rotation.x = Math.PI / 2;
    speaker.position.set(x, 0.8, -0.74);
    root.add(speaker);
  }
  cylinder(-1.65, 0.8, -0.88, 0.13, 0.09, 0.28, cream);
  const leafMaterial = new MeshStandardMaterial({ color: 0x56866c, roughness: 1 });
  const leaves: Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const leaf = new Mesh(new SphereGeometry(0.14, 12, 8), leafMaterial);
    leaf.scale.set(0.5, 1.4, 0.45);
    leaf.rotation.z = (i - 3) * 0.28;
    leaf.position.set(
      -1.65 + Math.sin(i * 2) * 0.13,
      1 + (i % 3) * 0.09,
      -0.88 + Math.cos(i * 2) * 0.1,
    );
    root.add(leaf);
    leaves.push(leaf);
  }
  cylinder(-0.25, tableY + 0.06, 0.5, 0.14, 0.14, 0.035, dark);
  const stem = cylinder(-0.25, tableY + 0.32, 0.5, 0.018, 0.018, 0.5, brass);
  stem.rotation.z = -0.18;
  const shade = cylinder(-0.12, tableY + 0.58, 0.5, 0.08, 0.2, 0.22, dark);
  shade.rotation.z = -0.3;
  const bulb = new Mesh(
    new SphereGeometry(0.035, 12, 8),
    new MeshStandardMaterial({ color: 0xffd492, emissive: 0xffb45e, emissiveIntensity: 2 }),
  );
  bulb.position.set(-0.1, tableY + 0.47, 0.48);
  root.add(bulb);
  const lamp = new PointLight(0xffc27a, 1.7, 3, 2);
  lamp.position.set(-0.1, tableY + 0.45, 0.46);
  root.add(lamp);
  const sun = new DirectionalLight(0xffb57d, 2.1);
  sun.position.set(-2, 3, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 12 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.015;
  root.add(sun);
  let mood: Mood = 'auto';
  let elapsed = 0;
  const update = (seconds: number) => {
    elapsed += seconds;
    for (let i = 0; i < steam.length; i++) {
      const age = (elapsed * 0.16 + i / steam.length) % 1;
      const wisp = steam[i]!;
      wisp.position.set(
        -0.12 + Math.sin(elapsed * 0.7 + i) * 0.025,
        tableY + 0.25 + age * 0.3,
        0.3,
      );
      wisp.scale.setScalar(0.4 + age);
      wisp.rotation.y = elapsed * 0.2 + i;
      (wisp.material as MeshBasicMaterial).opacity = Math.sin(age * Math.PI) * 0.06;
    }
    for (let i = 0; i < leaves.length; i++)
      leaves[i]!.rotation.z = (i - 3) * 0.28 + Math.sin(elapsed * 0.6 + i) * 0.025;
    const time = outdoors.update(seconds, mood);
    sun.color
      .setHex(0x91a7e8)
      .lerp(new Color(0xffe2b6), time.daylight)
      .lerp(new Color(0xffac69), time.twilight);
    sun.intensity = 0.35 + time.daylight * 1.7 + time.twilight * 1.2;
    lamp.intensity = 0.42 - time.daylight * 0.2;
    sun.position.copy(time.sunDirection).multiplyScalar(5);
    return time;
  };
  const setMood = (value: Mood) => {
    mood = value;
    update(0);
  };
  update(0);
  return {
    root,
    tableY,
    setMood,
    update,
    get assets() {
      return decor.state();
    },
    dispose() {
      decor.dispose();
      const geometries = new Set<import('three').BufferGeometry>();
      const materials = new Set<import('three').Material>();
      root.traverse((object) => {
        if (object instanceof DirectionalLight) object.shadow.dispose();
        if (object instanceof Mesh || object instanceof Points) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
          if (object instanceof InstancedMesh) object.dispose();
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      root.clear();
    },
  };
}
