export interface BehaviorPermission {
  id: string;
  botSlug: string;
  name: string;
  behavior: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface BehaviorChoices {
  behaviorAllow?: string[];
  behaviorDeny?: string[];
}
export interface BehaviorSource extends BehaviorChoices {
  id: string;
  name: string;
  revision: number;
}
export interface EffectiveBehaviorPermission extends BehaviorPermission {
  effect: 'allow' | 'deny';
  conflict: boolean;
  sources: { id: string; name: string; revision: number; effect: 'allow' | 'deny' }[];
}
export function resolveBehaviorPermissions(
  items: BehaviorPermission[],
  groups: BehaviorSource[],
): EffectiveBehaviorPermission[] {
  return items.flatMap((item) => {
    const sources = groups.flatMap((group) =>
      (['allow', 'deny'] as const)
        .filter((effect) =>
          (effect === 'allow' ? group.behaviorAllow : group.behaviorDeny)?.includes(item.id),
        )
        .map((effect) => ({ id: group.id, name: group.name, revision: group.revision, effect })),
    );
    if (!sources.length) return [];
    const denied = sources.some((source) => source.effect === 'deny');
    return [
      {
        ...item,
        effect: denied ? ('deny' as const) : ('allow' as const),
        conflict: denied && sources.some((source) => source.effect === 'allow'),
        sources,
      },
    ];
  });
}
