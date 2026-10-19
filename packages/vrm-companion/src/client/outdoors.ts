import {
  BackSide,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
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
  const glow = (core: number, halo: number) =>
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { tint: { value: new Color() }, opacity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 tint; uniform float opacity;
        void main(){
          float d=length(vUv*2.0-1.0);
          float disk=1.0-smoothstep(${core.toFixed(3)}-0.02,${core.toFixed(3)},d);
          float haze=pow(max(0.0,1.0-d),${halo.toFixed(1)})*0.55;
          gl_FragColor=vec4(tint*(1.0+disk*0.4),clamp(disk+haze,0.0,1.0)*opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  const sunMaterial = glow(0.16, 2.2);
  const sun = new Mesh(new PlaneGeometry(9, 9), sunMaterial);
  root.add(sun);
  const moonMaterial = glow(0.2, 3);
  moonMaterial.uniforms.tint!.value.set(0xdbe7ff);
  const moon = new Mesh(new PlaneGeometry(5, 5), moonMaterial);
  root.add(moon);
  const cloudMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      light: { value: new Color() },
      shade: { value: new Color() },
      rim: { value: new Color() },
    },
    vertexShader: `attribute float seed; varying vec2 vUv; varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = seed;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 light; uniform vec3 shade; uniform vec3 rim;
      varying vec2 vUv; varying float vSeed;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float body = 0.0;
        for (int i = 0; i < 5; i++) {
          float k = float(i);
          vec2 center = vec2(-0.48 + 0.24 * k, -0.18 + 0.16 * sin(vSeed * 7.0 + k * 1.9));
          float r = 0.24 + 0.12 * fract(sin(vSeed * 13.0 + k) * 91.7) + (k == 2.0 ? 0.08 : 0.0);
          body = max(body, 1.0 - length((p - center) / vec2(r * 1.15, r)));
        }
        body *= smoothstep(-0.62, -0.38, p.y);
        float n = fbm(p * 2.6 + vSeed * 17.0);
        vec2 edge = smoothstep(vec2(1.0), vec2(0.78), abs(p));
        float density = (body + (n - 0.5) * 0.5) * edge.x * edge.y;
        float alpha = smoothstep(0.02, 0.32, density);
        if (alpha < 0.01) discard;
        float lit = smoothstep(-0.45, 0.55, p.y + (n - 0.5) * 0.35);
        vec3 color = mix(shade, light, lit);
        color = mix(color, rim, smoothstep(0.25, 0.02, density) * 0.5);
        gl_FragColor = vec4(color, alpha * 0.96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds: {
    mesh: InstancedMesh;
    index: number;
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    speed: number;
  }[] = [];
  const layers: InstancedMesh[] = [];
  const perLayer = 7;
  for (let layer = 2; layer >= 0; layer--) {
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), cloudMaterial, perLayer);
    const seeds = new Float32Array(perLayer);
    for (let i = 0; i < perLayer; i++) {
      seeds[i] = layer * 3.17 + i * 1.31;
      clouds.push({
        mesh,
        index: i,
        x: (i - 3) * 7 + layer * 2.3,
        y: -0.6 + layer * 0.9 + Math.sin(i * 2.3 + layer) * 0.7,
        z: -10 - layer * 8,
        w: 5.2 + (i % 3) * 1.4 + layer * 1.6,
        h: 2.6 + (i % 2) * 0.6 + layer * 0.7,
        speed: 0.03 + (2 - layer) * 0.02,
      });
    }
    mesh.geometry.setAttribute('seed', new InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    mesh.renderOrder = -layer;
    root.add(mesh);
    layers.push(mesh);
  }
  const placement = new Matrix4();
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
      .lerp(new Color(0xc8473a), twilight);
    sky.uniforms
      .horizon!.value.set(0x58678e)
      .lerp(new Color(0xdbe5d3), daylight)
      .lerp(new Color(0xff8d4e), twilight);
    const angle = ((hour - 6) / 12) * Math.PI;
    sun.position.set(12 * Math.cos(angle), 6 + 14 * Math.sin(angle), -24);
    sun.visible = hour >= 5 && hour <= 19.5;
    moon.position.set(-8, 13, -28);
    moon.visible = daylight < 0.12;
    sunMaterial.uniforms
      .tint!.value.set(0xfff4d6)
      .lerp(new Color(0xffc27d), Math.min(1, twilight * 1.3));
    sunMaterial.uniforms.opacity!.value = Math.min(
      1,
      Math.max(0, (hour - 5) * 2, (19.5 - hour) * 2),
    );
    cloudMaterial.uniforms
      .light!.value.set(0x5d6f99)
      .lerp(new Color(0xffffff), daylight)
      .lerp(new Color(0xffd77a), twilight);
    cloudMaterial.uniforms
      .shade!.value.set(0x252f4d)
      .lerp(new Color(0xb8c6da), daylight)
      .lerp(new Color(0xd8704e), twilight);
    cloudMaterial.uniforms
      .rim!.value.set(0x8f9fc8)
      .lerp(new Color(0xffffff), daylight)
      .lerp(new Color(0xffe2b0), twilight);
    starMaterial.opacity = Math.max(0, 1 - daylight * 8 - twilight);
    for (const cloud of clouds) {
      const x = ((((cloud.x + seconds * cloud.speed + 26) % 52) + 52) % 52) - 26;
      placement.makeScale(cloud.w, cloud.h, 1).setPosition(x, cloud.y, cloud.z);
      cloud.mesh.setMatrixAt(cloud.index, placement);
    }
    for (const layer of layers) layer.instanceMatrix.needsUpdate = true;
    sun.lookAt(0, 1, 0);
    moon.lookAt(0, 1, 0);
    for (const balloon of balloons) {
      balloon.group.position.y = balloon.y + Math.sin(seconds * 0.12 + balloon.phase) * 0.25;
      balloon.group.rotation.z = Math.sin(seconds * 0.09 + balloon.phase) * 0.035;
    }
    return { daylight, twilight, hour, sunDirection: sun.position.clone().normalize() };
  };
  update(0, 'auto');
  return {
    root,
    update,
    cloudX: (index: number) => {
      const cloud = clouds[index]!;
      cloud.mesh.getMatrixAt(cloud.index, placement);
      return placement.elements[12]!;
    },
  };
}
