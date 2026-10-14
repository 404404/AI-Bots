import { contrast, type DesignTheme } from './resolve-theme';
import { distance, over, SEPARATION, tint, type LayerName } from './layers';

export const BUTTON_TONES = ['primary', 'secondary', 'danger'] as const;
export type ButtonTone = (typeof BUTTON_TONES)[number];

export type ButtonColors = {
  fill: string;
  pressed: string;
  label: string;
  edge: string;
};

const LABEL_CONTRAST = 4.5;

const NEXT: Record<LayerName, LayerName> = {
  canvas: 'raised',
  raised: 'well',
  well: 'raised',
  field: 'raised',
  sheet: 'canvas',
};

function readable(paint: string, against: string, toward: string): string {
  let amount = 0;
  let next = paint;
  while (contrast(next, against) < LABEL_CONTRAST && amount < 1) {
    amount += 0.02;
    next = tint(paint, toward, amount);
  }
  return next;
}

function primaryFill(theme: DesignTheme): string {
  const darker = contrast(theme.color.onAccent, '#ffffff') < 2 ? '#000000' : '#ffffff';
  return readable(theme.color.accent, theme.color.onAccent, darker);
}

export function buttonColors(theme: DesignTheme, tone: ButtonTone, on: LayerName): ButtonColors {
  const behind = theme.layer[on];
  if (tone === 'primary') {
    const fill = primaryFill(theme);
    return {
      fill,
      pressed: tint(fill, behind.fill, 0.25),
      label: theme.color.onAccent,
      edge: fill,
    };
  }
  if (tone === 'secondary') {
    const primary = primaryFill(theme);
    const next = theme.layer[NEXT[on]];
    const fill =
      distance(behind.selected, primary) >= SEPARATION ||
      distance(next.fill, behind.fill) < SEPARATION
        ? behind.selected
        : next.fill;
    return {
      fill,
      pressed: over(theme.color.hover, fill, 2),
      label: theme.color.fg,
      edge: behind.edge,
    };
  }
  return {
    fill: behind.danger,
    pressed: over(theme.color.dangerSoft, behind.danger, 2),
    label: readable(theme.color.danger, behind.danger, theme.color.fg),
    edge: theme.color.dangerEdge,
  };
}
