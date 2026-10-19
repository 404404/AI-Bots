import {
  DataTexture,
  DoubleSide,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type ColorRepresentation,
  type MeshToonMaterialParameters,
  type Texture,
} from 'three';

export function createRoomMaterials() {
  const gradient = new DataTexture(new Uint8Array([96, 178, 255]), 3, 1, RedFormat);
  gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const toon = (color: ColorRepresentation, extra: MeshToonMaterialParameters = {}) => {
    return Object.assign(new MeshToonMaterial({ color, gradientMap: gradient, ...extra }), {
      flatShading: true,
    });
  };
  const textures: Texture[] = [gradient];
  return {
    textures,
    toon,
    wood: toon(0x9a7658),
    dark: toon(0x2c3a40),
    fabric: toon(0x34444c),
    red: toon(0xb0463f),
    cream: toon(0xeee0c6),
    brass: toon(0xc79d5f),
    plaster: toon(0xc9a78c),
    linen: toon(0xeadbc0, { side: DoubleSide }),
  };
}
