import type { ConversationWorkspace } from '../cloud/conversations';

export type ConversationEnvironment = {
  key: string;
  title: string;
  kind: 'all' | 'computer' | 'cloud';
};
export const computerEnvironmentKey = (hostId: string) => JSON.stringify(['computer', hostId]);
export const cloudEnvironmentKey = (scope: string, organizationId: string) =>
  JSON.stringify([scope, organizationId]);

export function conversationEnvironments(
  computer: { hostId: string; name: string } | undefined,
  sourceScopes: readonly string[],
  workspaces: readonly ConversationWorkspace[],
  allTitle: string,
): ConversationEnvironment[] {
  const result: ConversationEnvironment[] = [{ key: 'all', title: allTitle, kind: 'all' }];
  if (computer)
    result.push({
      key: computerEnvironmentKey(computer.hostId),
      title: computer.name,
      kind: 'computer',
    });
  const seen = new Set<string>();
  for (const scope of sourceScopes) {
    for (const workspace of workspaces) {
      if (workspace.scope !== scope) continue;
      const key = cloudEnvironmentKey(scope, workspace.organizationId);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, title: workspace.organizationName, kind: 'cloud' });
    }
  }
  return result;
}

export function includesComputerActivity(scope: string, hostId: string | undefined): boolean {
  return hostId !== undefined && (scope === 'all' || scope === computerEnvironmentKey(hostId));
}
