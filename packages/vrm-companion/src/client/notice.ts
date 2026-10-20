import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';

export const NOTICE_DURATION = 3.2;
export const NOTICE_GLANCE = 1.1;

const ramp = (t: number, from: number, to: number) => {
  const x = Math.max(0, Math.min(1, (t - from) / (to - from)));
  return x * x * (3 - 2 * x);
};

export interface NoticeFrame {
  phone: number;
  buzz: number;
  alert: number;
  pop: number;
  envelope: number;
  flight: number;
  glance: number;
}

export const noticeFrame = (t: number, reduced = false): NoticeFrame => {
  if (t < 0 || t >= NOTICE_DURATION)
    return { phone: 0, buzz: 0, alert: 0, pop: 0, envelope: 0, flight: 0, glance: 0 };
  const phone = ramp(t, 0, 0.12) * (1 - ramp(t, 2.2, NOTICE_DURATION));
  const alert = ramp(t, 0.7, 0.85) * (1 - ramp(t, 2.1, 2.6));
  const glance = ramp(t, 0.05, 0.3) * (1 - ramp(t, NOTICE_GLANCE - 0.25, NOTICE_GLANCE));
  if (reduced)
    return {
      phone,
      buzz: 0,
      alert,
      pop: 1,
      envelope: 0,
      flight: 0,
      glance: t < NOTICE_GLANCE ? 1 : 0,
    };
  const pop = t < 0.7 ? 0 : 1 + Math.sin(Math.min(1, (t - 0.7) / 0.35) * Math.PI) * 0.35;
  const buzz = t < 0.7 ? Math.sin(t * 90) * (1 - t / 0.7) : 0;
  const flight = ramp(t, 0.05, 0.78);
  const envelope = ramp(t, 0.05, 0.15) * (1 - ramp(t, 0.68, 0.8));
  return { phone, buzz, alert, pop, envelope, flight, glance };
};

const icon = (draw: (brush: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const brush = canvas.getContext('2d');
  if (brush) draw(brush);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export function createNotice(phoneSpot: Vector3, screenSpot: Vector3) {
  const root = new Group();
  const alertTexture = icon((brush) => {
    brush.fillStyle = '#fff6e0';
    brush.strokeStyle = '#2f3b3f';
    brush.lineWidth = 7;
    brush.beginPath();
    brush.arc(64, 60, 44, 0, Math.PI * 2);
    brush.fill();
    brush.stroke();
    brush.beginPath();
    brush.moveTo(52, 98);
    brush.lineTo(64, 122);
    brush.lineTo(74, 99);
    brush.fill();
    brush.fillStyle = '#e0573f';
    brush.font = 'bold 70px sans-serif';
    brush.textAlign = 'center';
    brush.textBaseline = 'middle';
    brush.fillText('!', 64, 64);
  });
  const envelopeTexture = icon((brush) => {
    brush.fillStyle = '#fbf3e2';
    brush.strokeStyle = '#3f5d7d';
    brush.lineWidth = 6;
    brush.beginPath();
    brush.roundRect(14, 30, 100, 68, 8);
    brush.fill();
    brush.stroke();
    brush.beginPath();
    brush.moveTo(16, 34);
    brush.lineTo(64, 70);
    brush.lineTo(112, 34);
    brush.stroke();
    brush.fillStyle = '#e0573f';
    brush.beginPath();
    brush.arc(64, 70, 8, 0, Math.PI * 2);
    brush.fill();
  });
  const alert = new Sprite(
    new SpriteMaterial({ map: alertTexture, transparent: true, depthTest: false, opacity: 0 }),
  );
  alert.renderOrder = 10;
  const envelope = new Sprite(
    new SpriteMaterial({ map: envelopeTexture, transparent: true, depthTest: false, opacity: 0 }),
  );
  envelope.renderOrder = 10;
  const glowMaterial = new MeshBasicMaterial({
    color: 0xbfe6ff,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const glow = new Mesh(new PlaneGeometry(0.22, 0.28), glowMaterial);
  glow.rotation.set(-Math.PI / 2, 0, 0.35);
  glow.position.copy(phoneSpot).add(new Vector3(0, 0.012, 0));
  root.add(alert, envelope, glow);
  alert.visible = envelope.visible = glow.visible = false;
  let age = Infinity;
  const lift = new Vector3();
  return {
    root,
    textures: [alertTexture, envelopeTexture],
    get active() {
      return age < NOTICE_DURATION;
    },
    trigger() {
      age = age < 1.2 ? Math.min(age, 0.3) : 0;
    },
    update(delta: number, reduced: boolean, head: Vector3): NoticeFrame {
      age += delta;
      const frame = noticeFrame(age, reduced);
      glow.visible = frame.phone > 0;
      glowMaterial.opacity = frame.phone * (0.55 + Math.max(0, frame.buzz) * 0.25);
      alert.visible = frame.alert > 0;
      alert.material.opacity = frame.alert;
      alert.position.copy(head).add(lift.set(0.04, 0.26 + frame.alert * 0.03, 0));
      alert.scale.setScalar(0.13 * frame.pop);
      envelope.visible = frame.envelope > 0;
      envelope.material.opacity = frame.envelope;
      const t = frame.flight;
      const landing = head.clone().add(lift.set(0.04, 0.26, 0));
      const arc = screenSpot.clone().lerp(landing, 0.3).lerp(landing, t);
      arc.y += Math.sin(t * Math.PI) * 0.18;
      envelope.position.copy(arc);
      envelope.scale.setScalar(0.16 - t * 0.08);
      envelope.material.rotation = Math.sin(t * Math.PI * 2) * 0.2;
      return frame;
    },
    dispose() {
      alertTexture.dispose();
      envelopeTexture.dispose();
      alert.material.dispose();
      envelope.material.dispose();
      glowMaterial.dispose();
      glow.geometry.dispose();
    },
  };
}
