import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type Material,
  type Texture,
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
  const textures: Texture[] = [...materials.textures];
  const { wood, dark, cream, brass } = materials;
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: Material = wood,
  ) => {
    const mesh = new Mesh(
      new RoundedBoxGeometry(w, h, d, 1, Math.min(0.02, w / 5, h / 5, d / 5)),
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
    const mesh = new Mesh(new CylinderGeometry(top, bottom, h, 12), material);
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
  const outdoors = createOutdoors();
  root.add(outdoors.root);
  const { plaster } = materials;
  const opening = { left: -1.3, right: 1.1, bottom: 0.95, top: 2.45 };
  const middle = (opening.bottom + opening.top) / 2;
  const span = opening.top - opening.bottom;
  box(0, opening.bottom / 2, -1.2, 4.2, opening.bottom, 0.12, plaster);
  box(0, (opening.top + 2.9) / 2, -1.2, 4.2, 2.9 - opening.top, 0.12, plaster);
  box((opening.left - 2.1) / 2, middle, -1.2, opening.left + 2.1, span, 0.12, plaster);
  box((opening.right + 2.1) / 2, middle, -1.2, 2.1 - opening.right, span, 0.12, plaster);
  const centre = (opening.left + opening.right) / 2;
  const width = opening.right - opening.left;
  for (const x of [opening.left, opening.right])
    box(x, middle, -1.17, 0.08, span + 0.08, 0.2, dark);
  box(centre, opening.top, -1.17, width + 0.08, 0.08, 0.2, dark);
  box(centre, middle, -1.2, 0.045, span, 0.06, dark);
  box(centre, opening.bottom + span * 0.68, -1.2, width, 0.035, 0.05, dark);
  box(centre, opening.bottom, -1.08, width + 0.3, 0.05, 0.3, wood);
  box(0, 0.6, -0.98, 4.15, 0.09, 0.38, wood);
  const rod = cylinder(centre, opening.top + 0.16, -1.04, 0.012, 0.012, width + 0.9, brass);
  rod.rotation.z = Math.PI / 2;
  const curtainGeometry = new PlaneGeometry(0.5, opening.top - 0.45, 14, 1);
  const folds = curtainGeometry.getAttribute('position');
  for (let i = 0; i < folds.count; i++)
    folds.setZ(i, Math.sin(folds.getX(i) * 44) * 0.03 + Math.sin(folds.getX(i) * 11) * 0.015);
  curtainGeometry.computeVertexNormals();
  const curtains: Mesh[] = [];
  for (const x of [opening.left - 0.12, opening.right + 0.12]) {
    const curtain = new Mesh(curtainGeometry, materials.linen);
    curtain.position.set(x, opening.top + 0.14 - (opening.top - 0.45) / 2, -1.06);
    curtain.castShadow = curtain.receiveShadow = true;
    root.add(curtain);
    curtains.push(curtain);
  }
  const surface = tableY + 0.045;
  box(-0.2, surface - 0.02, 0.52, 3.2, 0.04, 0.72);
  box(-0.2, surface - 0.07, 0.86, 3.0, 0.06, 0.02);
  for (const x of [-1.55, 1.15])
    for (const z of [0.22, 0.82]) box(x, (surface - 0.04) / 2, z, 0.05, surface - 0.04, 0.05, dark);
  root.add(createChair(seatHeight, materials));
  cylinder(CHAIR.x, seatHeight / 2, CHAIR.z, 0.03, 0.04, seatHeight, dark);
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
    const wheel = new Mesh(new SphereGeometry(0.03, 6, 4), dark);
    wheel.position.set(CHAIR.x + Math.sin(angle) * 0.26, 0.03, CHAIR.z + Math.cos(angle) * 0.26);
    root.add(wheel);
  }
  const monitorStart = root.children.length;
  box(-0.65, surface + 0.008, 0.8, 0.24, 0.016, 0.18, dark);
  box(-0.65, surface + 0.16, 0.85, 0.04, 0.3, 0.025, dark);
  box(-0.65, surface + 0.36, 0.83, 0.62, 0.37, 0.03, cream);
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 288;
  const screen2d = screenCanvas.getContext('2d')!;
  screen2d.fillStyle = '#263b48';
  screen2d.fillRect(0, 0, 512, 288);
  screen2d.fillStyle = '#9fb4b3';
  screen2d.fillRect(24, 25, 150, 10);
  for (let i = 0; i < 12; i++) {
    screen2d.fillStyle = i % 3 === 0 ? '#d8b38b' : '#688b93';
    screen2d.fillRect(24 + (i % 3) * 12, 56 + i * 16, 140 + ((i * 47) % 280), 5);
  }
  const screenTexture = new CanvasTexture(screenCanvas);
  screenTexture.colorSpace = SRGBColorSpace;
  textures.push(screenTexture);
  const screen = new Mesh(
    new PlaneGeometry(0.6, 0.34),
    new MeshBasicMaterial({ map: screenTexture }),
  );
  screen.rotation.y = Math.PI;
  screen.position.set(-0.65, surface + 0.36, 0.814);
  root.add(screen);
  const monitor = new Group();
  monitor.position.set(-0.65, tableY, 0.82);
  root.add(monitor);
  root.updateMatrixWorld(true);
  for (const part of root.children.slice(monitorStart, -1)) monitor.attach(part);
  monitor.rotation.y = -1.05;
  monitor.position.z = 0.36;
  box(0.6, surface + 0.002, 0.25, 0.8, 0.004, 0.32, materials.fabric);
  box(0.57, surface + 0.013, 0.21, 0.35, 0.018, 0.125, dark).rotation.x = -0.05;
  const keys = new InstancedMesh(new BoxGeometry(0.016, 0.008, 0.016), cream, 16 * 5);
  const place = new Object3D();
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 16; col++) {
      place.position.set(
        0.57 + (col - 7.5) * 0.0195,
        surface + 0.026 + row * 0.001,
        0.17 + row * 0.019,
      );
      place.updateMatrix();
      keys.setMatrixAt(row * 16 + col, place.matrix);
    }
  keys.castShadow = keys.receiveShadow = true;
  root.add(keys);
  const mouse = new Mesh(new SphereGeometry(0.045, 8, 6), cream);
  mouse.scale.set(0.72, 0.42, 1.25);
  mouse.position.set(0.86, surface + 0.016, 0.24);
  mouse.castShadow = true;
  root.add(mouse);
  const decor = createDecor(tableY, materials.toon);
  root.add(decor.root);
  box(-0.9, surface + 0.002, 0.42, 0.21, 0.003, 0.297, cream).rotation.y = 0.2;
  box(-0.68, surface + 0.004, 0.55, 0.076, 0.002, 0.076, materials.toon(0xf1d27a)).rotation.y =
    -0.3;
  const mug = new Group();
  const mugHome = new Vector3(0.18, tableY, 0.3);
  mug.position.copy(mugHome);
  root.add(mug);
  const cup = new Mesh(new CylinderGeometry(0.041, 0.038, 0.095, 12, 1, true), cream);
  cup.position.set(0, 0.0925, 0);
  cup.castShadow = true;
  mug.add(cup);
  mug.add(cylinder(0, 0.047, 0, 0.038, 0.038, 0.004, cream));
  const coffee = materials.toon(0x2a160d);
  mug.add(cylinder(0, 0.125, 0, 0.038, 0.038, 0.003, coffee));
  const rim = new Mesh(new TorusGeometry(0.0405, 0.003, 4, 12), cream);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 0.14, 0);
  mug.add(rim);
  const steam: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const material = new MeshBasicMaterial({
      color: 0xffecdb,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    });
    const wisp = new Mesh(new TorusGeometry(0.018, 0.004, 4, 10, Math.PI * 1.4), material);
    root.add(wisp);
    steam.push(wisp);
  }
  const mugWrist = new Vector3(0.075, 0.085, -0.054);
  const mugRim = new Vector3(0.041, 0.14, 0);
  const handle = new Mesh(new TorusGeometry(0.024, 0.006, 5, 10), cream);
  handle.position.set(0, 0.093, -0.054);
  handle.rotation.y = Math.PI / 2;
  mug.add(handle);
  const sill = 0.645;
  box(1.5, sill + 0.1, -0.9, 0.38, 0.2, 0.11, cream);
  for (const x of [1.39, 1.61]) {
    const speaker = new Mesh(new CylinderGeometry(0.06, 0.06, 0.01, 10), dark);
    speaker.rotation.x = Math.PI / 2;
    speaker.position.set(x, sill + 0.09, -0.843);
    root.add(speaker);
  }
  box(1.5, sill + 0.17, -0.85, 0.08, 0.025, 0.01, dark);
  box(1.5, sill + 0.235, -0.9, 0.3, 0.014, 0.014, dark);
  for (const x of [1.36, 1.64]) box(x, sill + 0.215, -0.9, 0.014, 0.05, 0.014, dark);
  const plush = materials.toon(0x30343f);
  const belly = materials.toon(0xf2ead8);
  const penguin = new Mesh(new SphereGeometry(0.13, 8, 6), plush);
  penguin.scale.set(1, 1.25, 0.9);
  penguin.position.set(-0.05, sill + 0.15, -0.95);
  root.add(penguin);
  const front = new Mesh(new SphereGeometry(0.1, 8, 6), belly);
  front.scale.set(0.95, 1.2, 0.6);
  front.position.set(-0.05, sill + 0.13, -0.88);
  root.add(front);
  const beak = new Mesh(new CylinderGeometry(0, 0.025, 0.05, 5), materials.toon(0xe0a040));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(-0.05, sill + 0.25, -0.83);
  root.add(beak);
  cylinder(-1.62, sill + 0.08, -0.9, 0.1, 0.075, 0.16, cream);
  const leafMaterial = materials.toon(0x5e9a6c);
  const leaves: Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const leaf = new Mesh(new SphereGeometry(0.1, 5, 4), leafMaterial);
    leaf.scale.set(0.5, 1.4, 0.45);
    leaf.rotation.z = (i - 3) * 0.28;
    leaf.position.set(
      -1.62 + Math.sin(i * 2) * 0.09,
      sill + 0.26 + (i % 3) * 0.06,
      -0.9 + Math.cos(i * 2) * 0.07,
    );
    root.add(leaf);
    leaves.push(leaf);
  }
  const lampRoot = new Group();
  lampRoot.position.set(-0.2, surface, 0.74);
  lampRoot.rotation.y = -1;
  root.add(lampRoot);
  const lampRod = (from: Vector3, to: Vector3, radius: number) => {
    const length = from.distanceTo(to);
    const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 6), dark);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
    mesh.castShadow = true;
    lampRoot.add(mesh);
  };
  const lampBase = new Mesh(new CylinderGeometry(0.06, 0.07, 0.02, 10), dark);
  lampBase.position.y = 0.01;
  lampRoot.add(lampBase);
  const elbow = new Vector3(0, 0.3, 0.08);
  const head = new Vector3(0, 0.4, -0.16);
  lampRod(new Vector3(0, 0.02, 0), elbow, 0.007);
  lampRod(elbow, head, 0.006);
  const shadeGeometry = new CylinderGeometry(0.022, 0.065, 0.1, 10, 1, true);
  const shade = new Mesh(shadeGeometry, dark);
  shade.position.copy(head).add(new Vector3(0, -0.03, -0.03));
  shade.rotation.x = -0.5;
  shade.castShadow = true;
  lampRoot.add(shade);
  shade.add(new Mesh(shadeGeometry, new MeshBasicMaterial({ color: 0xffd9a0, side: BackSide })));
  const bulb = new Mesh(
    new SphereGeometry(0.022, 6, 4),
    new MeshBasicMaterial({ color: 0xffe2a8 }),
  );
  bulb.position.copy(head).add(new Vector3(0, -0.06, -0.05));
  lampRoot.add(bulb);
  const lamp = new SpotLight(0xffc27a, 3, 2.2, 0.62, 0.55, 2);
  lampRoot.add(lamp);
  lamp.position.copy(bulb.position);
  lampRoot.updateMatrixWorld(true);
  lamp.target.position.set(0.5, surface, 0.2);
  root.add(lamp.target);
  const glow = new PointLight(0xffb36a, 0.4, 1.6, 2);
  glow.position.copy(bulb.position);
  lampRoot.add(glow);
  const sky = new HemisphereLight(0x8fa3d8, 0x4a3438, 0.4);
  root.add(sky);
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
        mug.position.x + Math.sin(elapsed * 0.7 + i) * 0.012,
        mug.position.y + 0.16 + age * 0.18,
        mug.position.z,
      );
      wisp.scale.setScalar(0.4 + age);
      wisp.rotation.y = elapsed * 0.2 + i;
      const resting = Math.max(0, 1 - mug.position.distanceTo(mugHome) * 8);
      (wisp.material as MeshBasicMaterial).opacity = Math.sin(age * Math.PI) * 0.06 * resting;
    }
    for (let i = 0; i < curtains.length; i++)
      curtains[i]!.rotation.x = Math.sin(elapsed * 0.35 + i * 1.7) * 0.012;
    for (let i = 0; i < leaves.length; i++)
      leaves[i]!.rotation.z = (i - 3) * 0.28 + Math.sin(elapsed * 0.6 + i) * 0.025;
    const time = outdoors.update(seconds, mood);
    sun.color
      .setHex(0x91a7e8)
      .lerp(new Color(0xffe2b6), time.daylight)
      .lerp(new Color(0xffac69), time.twilight);
    sun.intensity = 0.35 + time.daylight * 1.7 + time.twilight * 1.2;
    lamp.intensity = 0.8 + (1 - time.daylight) * 3.6 + time.twilight * 1.2;
    glow.intensity = lamp.intensity * 0.15;
    sky.color
      .setHex(0x4a5a9a)
      .lerp(new Color(0xcfdcef), time.daylight)
      .lerp(new Color(0xff9a6a), time.twilight);
    sky.intensity = 0.35 + time.daylight * 0.35 + time.twilight * 0.25;
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
    mug,
    mugHome,
    mugWrist,
    mugRim,
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
