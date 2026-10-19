import { Box3, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMUtils } from '@pixiv/three-vrm';

export function createDecor(tableY: number) {
  const root = new Group();
  let disposed = false;
  let loaded = 0;
  let failed = 0;
  const release = (model: Group) => {
    const images = new Set<ImageBitmap>();
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) {
          if (
            value instanceof Texture &&
            typeof ImageBitmap !== 'undefined' &&
            value.image instanceof ImageBitmap
          )
            images.add(value.image);
        }
      }
    });
    VRMUtils.deepDispose(model);
    for (const image of images) image.close();
  };
  const placements = [
    { name: 'book_set', scale: 0.62, x: -0.65, y: tableY + 0.05, z: 0.24, yaw: Math.PI },
    { name: 'shelf_B_small_decorated', scale: 0.65, x: 1.69, y: 0, z: -0.72, yaw: 0 },
  ];
  for (const placement of placements) {
    const source = __ROOM_ASSETS__[placement.name];
    if (!source) {
      failed++;
      continue;
    }
    void new GLTFLoader()
      .loadAsync(source)
      .then(({ scene: model }) => {
        if (disposed) {
          release(model);
          return;
        }
        model.scale.setScalar(placement.scale);
        model.rotation.y = placement.yaw;
        const bounds = new Box3().setFromObject(model);
        model.position.set(placement.x, placement.y - bounds.min.y, placement.z);
        model.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          object.castShadow = object.receiveShadow = true;
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            if (material instanceof MeshStandardMaterial) material.roughness = 0.82;
          }
        });
        root.add(model);
        loaded++;
      })
      .catch(() => {
        if (!disposed) failed++;
      });
  }
  return {
    root,
    state: () => `${loaded}/${placements.length}${failed ? ` failed:${failed}` : ''}`,
    dispose() {
      disposed = true;
      for (const child of root.children) release(child as Group);
      root.clear();
    },
  };
}
