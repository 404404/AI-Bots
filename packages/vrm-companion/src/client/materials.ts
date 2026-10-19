import {
  CanvasTexture,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

export function createRoomMaterials() {
  const grain = document.createElement('canvas');
  grain.width = grain.height = 512;
  const context = grain.getContext('2d')!;
  const pixels = context.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const wave = y + Math.sin(x / 90) * 5 + Math.sin(x / 31 + y / 80) * 1.8;
      const fine = Math.sin(wave * 2.6) * 2 + Math.sin(wave * 0.47) * 4;
      const broad = Math.sin(wave * 0.08) * 7;
      const noise = Math.sin(x * 127.1 + y * 311.7) * 1.8;
      const joint = y % 128 < 2 ? -22 : 0;
      const value = fine + broad + noise + joint;
      const offset = (y * 512 + x) * 4;
      pixels.data.set([154 + value, 109 + value * 0.8, 74 + value * 0.6, 255], offset);
    }
  }
  context.putImageData(pixels, 0, 0);
  const woodMap = new CanvasTexture(grain);
  woodMap.colorSpace = SRGBColorSpace;
  woodMap.wrapS = woodMap.wrapT = RepeatWrapping;
  woodMap.anisotropy = 4;
  const woodBump = new CanvasTexture(grain);
  woodBump.wrapS = woodBump.wrapT = RepeatWrapping;
  const cloth = document.createElement('canvas');
  cloth.width = cloth.height = 128;
  const clothContext = cloth.getContext('2d')!;
  clothContext.fillStyle = '#888';
  clothContext.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      clothContext.fillStyle = (x + y) % 4 === 0 ? '#aaa' : '#666';
      clothContext.fillRect(x, y, 1, 2);
    }
  }
  const weave = new CanvasTexture(cloth);
  weave.wrapS = weave.wrapT = RepeatWrapping;
  weave.repeat.set(8, 8);
  return {
    textures: [woodMap, woodBump, weave],
    wood: new MeshPhysicalMaterial({
      map: woodMap,
      bumpMap: woodBump,
      bumpScale: 0.003,
      roughness: 0.54,
      clearcoat: 0.22,
      clearcoatRoughness: 0.38,
    }),
    dark: new MeshStandardMaterial({ color: 0x27373a, roughness: 0.7 }),
    fabric: new MeshStandardMaterial({
      color: 0x303e42,
      bumpMap: weave,
      bumpScale: 0.002,
      roughness: 0.95,
    }),
    red: new MeshPhysicalMaterial({
      color: 0x923e42,
      bumpMap: weave,
      bumpScale: 0.001,
      roughness: 0.68,
      sheen: 0.25,
      sheenColor: 0xb55e58,
    }),
    cream: new MeshPhysicalMaterial({
      color: 0xe5d5b8,
      roughness: 0.34,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
    }),
    brass: new MeshStandardMaterial({ color: 0xb69362, roughness: 0.3, metalness: 0.75 }),
    plaster: new MeshStandardMaterial({ color: 0xa58c78, roughness: 1 }),
  };
}
