import { edgeFade } from '../design/tokens';

export function edgeFadeStops(
  height: number,
  cover: number,
): readonly { offset: number; opacity: number }[] {
  if (cover <= 0 || height <= cover) return edgeFade.stops;
  return Array.from({ length: edgeFade.samples + 1 }, (_, index) => {
    const offset = index / edgeFade.samples;
    return { offset, opacity: (1 - offset) ** edgeFade.curve };
  });
}
