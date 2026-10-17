export type ClientLayoutEdit =
  | { type: 'gap'; gap: number }
  | { type: 'rail-order'; order: string[] }
  | { type: 'rail-location'; before: string }
  | { type: 'control'; panel: string; visible: boolean; channelId?: string }
  | { type: 'visibility'; panel: string; open: boolean; channelId?: string }
  | {
      type: 'move';
      panel: string;
      target: string;
      direction: 'left' | 'right' | 'above' | 'below';
      channelId?: string;
    }
  | { type: 'size'; panel: string; width: number; height: number }
  | { type: 'child-resize'; channelId: string; path: string; ratio: number }
  | { type: 'child-axis'; channelId: string; path: string; axis: 'horizontal' | 'vertical' };

export function validateLayoutEdit(value: unknown): ClientLayoutEdit {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid-layout-edit');
  const v = value as Record<string, unknown>;
  const id = (key: string) =>
    typeof v[key] === 'string' && (v[key] as string).length > 0 && (v[key] as string).length <= 200;
  const fraction = (key: string, min: number, max: number) =>
    typeof v[key] === 'number' &&
    Number.isFinite(v[key]) &&
    (v[key] as number) >= min &&
    (v[key] as number) <= max;
  let fields: string[];
  switch (v.type) {
    case 'gap':
      fields = ['type', 'gap'];
      if (!Number.isInteger(v.gap) || !fraction('gap', 0, 16))
        throw new Error('invalid-layout-edit');
      break;
    case 'rail-order':
      fields = ['type', 'order'];
      if (
        !Array.isArray(v.order) ||
        v.order.length > 100 ||
        v.order.some((x) => typeof x !== 'string' || x.length > 200) ||
        new Set(v.order).size !== v.order.length
      )
        throw new Error('invalid-layout-edit');
      break;
    case 'rail-location':
      fields = ['type', 'before'];
      if (!id('before')) throw new Error('invalid-layout-edit');
      break;
    case 'control':
    case 'visibility':
      fields = [
        'type',
        'panel',
        v.type === 'control' ? 'visible' : 'open',
        ...(v.channelId === undefined ? [] : ['channelId']),
      ];
      if (
        !id('panel') ||
        typeof v[v.type === 'control' ? 'visible' : 'open'] !== 'boolean' ||
        (v.channelId !== undefined && !id('channelId'))
      )
        throw new Error('invalid-layout-edit');
      break;
    case 'move':
      fields = [
        'type',
        'panel',
        'target',
        'direction',
        ...(v.channelId === undefined ? [] : ['channelId']),
      ];
      if (
        !id('panel') ||
        !id('target') ||
        v.panel === v.target ||
        !['left', 'right', 'above', 'below'].includes(String(v.direction)) ||
        (v.channelId !== undefined && !id('channelId'))
      )
        throw new Error('invalid-layout-edit');
      break;
    case 'size':
      fields = ['type', 'panel', 'width', 'height'];
      if (!id('panel') || !fraction('width', 0.05, 1) || !fraction('height', 0.05, 1))
        throw new Error('invalid-layout-edit');
      break;
    case 'child-resize':
    case 'child-axis':
      fields = ['type', 'channelId', 'path', v.type === 'child-resize' ? 'ratio' : 'axis'];
      if (
        !id('channelId') ||
        typeof v.path !== 'string' ||
        !/^[01]{0,7}$/u.test(v.path) ||
        (v.type === 'child-resize'
          ? !fraction('ratio', 0.2, 0.8)
          : !['horizontal', 'vertical'].includes(String(v.axis)))
      )
        throw new Error('invalid-layout-edit');
      break;
    default:
      throw new Error('invalid-layout-edit');
  }
  if (Object.keys(v).length !== fields.length || fields.some((key) => !Object.hasOwn(v, key)))
    throw new Error('invalid-layout-edit');
  return structuredClone(value) as ClientLayoutEdit;
}
