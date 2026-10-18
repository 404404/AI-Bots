import {
  BackSide,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';

export type SkyTime = 'auto' | 'sunset' | 'night';
export function createOutdoors() {
  const root = new Group();
  const sky = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { zenith: { value: new Color() }, horizon: { value: new Color() } },
    vertexShader: `varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon;
      void main(){
        float t=smoothstep(-0.05,0.25,normalize(direction).y);
        gl_FragColor=vec4(mix(horizon,zenith,t),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(60, 32, 24), sky);
  root.add(dome);
  const sunMaterial = new MeshBasicMaterial({ color: 0xfff0b0 });
  const sun = new Mesh(new SphereGeometry(1.2, 24, 16), sunMaterial);
  root.add(sun);
  const moon = new Mesh(
    new SphereGeometry(0.8, 20, 16),
    new MeshBasicMaterial({ color: 0xdbe7ff }),
  );
  root.add(moon);
  const cloudMaterial = new MeshStandardMaterial({
    color: 0xffd699,
    emissive: 0xffd699,
    emissiveIntensity: 0.65,
    roughness: 1,
    flatShading: false,
  });
  const cloudGeometry = new SphereGeometry(1, 16, 10);
  const clouds: { group: Group; x: number; speed: number }[] = [];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 7; i++) {
      const group = new Group();
      const x = (i - 3) * 6 + layer * 1.7;
      group.position.set(x, -0.8 + layer * 0.3, -9 - layer * 7);
      const puffs = new InstancedMesh(cloudGeometry, cloudMaterial, 7);
      group.add(puffs);
      for (let puff = 0; puff < 7; puff++) {
        const matrix = new Matrix4().makeScale(1.1, 0.25 + ((puff * 7 + i) % 5) * 0.05, 0.9);
        matrix.setPosition(
          (puff - 3) * 0.65,
          Math.sin(puff * 1.8 + i) * 0.08,
          Math.cos(puff * 2) * 0.4,
        );
        puffs.setMatrixAt(puff, matrix);
      }
      root.add(group);
      clouds.push({ group, x, speed: 0.018 + layer * 0.008 });
    }
  }
  const balloons: { group: Group; y: number; phase: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const group = new Group();
    group.position.set(-6 + i * 5, 6 + i * 1.8, -18 - i * 3);
    const envelope = new Mesh(
      new SphereGeometry(0.65, 20, 16),
      new MeshStandardMaterial({ color: [0xbd6e71, 0xcdb48b, 0x7c9da2][i]!, roughness: 1 }),
    );
    envelope.scale.y = 1.3;
    group.add(envelope);
    const basket = new Mesh(
      new CylinderGeometry(0.17, 0.14, 0.22, 8),
      new MeshStandardMaterial({ color: 0x936543 }),
    );
    basket.position.y = -1.1;
    group.add(basket);
    const ropeMaterial = new MeshStandardMaterial({ color: 0xd2b58b });
    for (const side of [-1, 1]) {
      const rope = new Mesh(new CylinderGeometry(0.012, 0.012, 0.5, 5), ropeMaterial);
      rope.position.set(side * 0.15, -0.85, 0);
      group.add(rope);
    }
    root.add(group);
    balloons.push({ group, y: group.position.y, phase: i * 2 });
  }
  const planet = new Mesh(
    new SphereGeometry(5, 32, 24),
    new MeshBasicMaterial({ color: 0xd79d8f, transparent: true, opacity: 0.2 }),
  );
  planet.position.set(8, 16, -40);
  root.add(planet);
  const ring = new Mesh(
    new TorusGeometry(7.2, 0.08, 6, 64),
    new MeshBasicMaterial({ color: 0xf1b89d, transparent: true, opacity: 0.3 }),
  );
  ring.position.copy(planet.position);
  ring.rotation.set(0.8, 0.2, -0.3);
  root.add(ring);
  const starGeometry = new BufferGeometry();
  const stars = [];
  for (let i = 0; i < 160; i++) {
    stars.push(Math.sin(i * 127.1) * 35, 2 + (Math.sin(i * 311.7) + 1) * 14, -30 - (i % 9));
  }
  starGeometry.setAttribute('position', new Float32BufferAttribute(stars, 3));
  const starMaterial = new PointsMaterial({ color: 0xe6ecff, size: 0.055, transparent: true });
  root.add(new Points(starGeometry, starMaterial));
  let seconds = 0;
  const update = (dt: number, mode: SkyTime) => {
    seconds += dt;
    const now = new Date();
    const hour =
      mode === 'sunset'
        ? 18
        : mode === 'night'
          ? 23
          : now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const twilight = Math.max(0, 1 - Math.abs(hour - 18) / 1.8, 1 - Math.abs(hour - 6) / 1.8);
    sky.uniforms
      .zenith!.value.set(0x111c38)
      .lerp(new Color(0x6d9fc3), daylight)
      .lerp(new Color(0xbb695f), twilight);
    sky.uniforms
      .horizon!.value.set(0x58678e)
      .lerp(new Color(0xdbe5d3), daylight)
      .lerp(new Color(0xffad68), twilight);
    const angle = ((hour - 6) / 12) * Math.PI;
    sun.position.set(12 * Math.cos(angle), 6 + 14 * Math.sin(angle), -24);
    sun.visible = hour >= 5 && hour <= 19.5;
    moon.position.set(-8, 13, -28);
    moon.visible = daylight < 0.12;
    cloudMaterial.color
      .set(0x60749a)
      .lerp(new Color(0xfff0d6), daylight)
      .lerp(new Color(0xffcb76), twilight);
    cloudMaterial.emissive.copy(cloudMaterial.color);
    starMaterial.opacity = Math.max(0, 1 - daylight * 8 - twilight);
    for (const cloud of clouds)
      cloud.group.position.x = ((cloud.x + seconds * cloud.speed + 24) % 48) - 24;
    for (const balloon of balloons) {
      balloon.group.position.y = balloon.y + Math.sin(seconds * 0.12 + balloon.phase) * 0.25;
      balloon.group.rotation.z = Math.sin(seconds * 0.09 + balloon.phase) * 0.035;
    }
    return { daylight, twilight, hour, sunDirection: sun.position.clone().normalize() };
  };
  update(0, 'auto');
  return { root, update };
}
