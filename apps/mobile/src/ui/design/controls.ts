import { distance, SEPARATION, tint, type LayerName } from './layers';
import { contrast, type DesignTheme } from './resolve-theme';

export const BUTTON_TONES = ['primary', 'secondary', 'danger'] as const;
export type ButtonTone = (typeof BUTTON_TONES)[number];

export type ButtonColors = {
  fill: string;
  pressed: string;
  label: string;
  edge: string;
};

const RAISED_ON: Record<LayerName, LayerName> = {
  canvas: 'raised',
  raised: 'well',
  well: 'raised',
  field: 'raised',
  sheet: 'canvas',
};

const DANGER = { light: 0.1, dark: 0.2 } as const;
const LABEL_CONTRAST = 4.5;

function readable(paint: string, against: string, toward: string): string {
  let amount = 0;
  let next = paint;
  while (contrast(next, against) < LABEL_CONTRAST && amount < 1) {
    amount += 0.02;
    next = tint(paint, toward, amount);
  }
  return next;
}

export function buttonColors(theme: DesignTheme, tone: ButtonTone, on: LayerName): ButtonColors {
  const behind = theme.layer[on];
  if (tone === 'primary') {
    const darker = contrast(theme.color.onAccent, '#ffffff') < 2 ? '#000000' : '#ffffff';
    const fill = readable(theme.color.accent, theme.color.onAccent, darker);
    return {
      fill,
      pressed: tint(fill, behind.fill, 0.25),
      label: theme.color.onAccent,
      edge: fill,
    };
  }
  if (tone === 'secondary') {
    const face = theme.layer[RAISED_ON[on]];
    if (distance(face.fill, behind.fill) >= SEPARATION)
      return { fill: face.fill, pressed: face.pressed, label: theme.color.fg, edge: face.edge };
    return {
      fill: behind.selected,
      pressed: behind.pressed,
      label: theme.color.fg,
      edge: behind.edge,
    };
  }
  let amount = DANGER[theme.scheme];
  let fill = tint(behind.fill, theme.color.danger, amount);
  while (distance(fill, behind.fill) < SEPARATION * 2 && amount < 0.5) {
    amount += 0.05;
    fill = tint(behind.fill, theme.color.danger, amount);
  }
  return {
    fill,
    pressed: tint(behind.fill, theme.color.danger, amount * 1.8),
    label: readable(theme.color.danger, fill, theme.color.fg),
    edge: theme.color.dangerEdge,
  };
}
