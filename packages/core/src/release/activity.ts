interface ReleaseActivitySource {
  agents: readonly {
    id: string;
    status: string;
    inbox: { nextTurn: readonly unknown[]; nextStep: readonly unknown[] };
  }[];
  jobs: { list(owner?: string): readonly { status: string }[] } | undefined;
}

export function hostReleaseActivity(source: ReleaseActivitySource): 'idle' | 'busy' | 'unknown' {
  for (const agent of source.agents) {
    if (
      agent.status === 'running' ||
      agent.inbox.nextTurn.length > 0 ||
      agent.inbox.nextStep.length > 0
    ) {
      return 'busy';
    }
    if (agent.status !== 'idle') return 'unknown';
  }
  const registry = source.jobs;
  if (registry === undefined) return 'unknown';
  const jobs = [...registry.list(), ...source.agents.flatMap((agent) => registry.list(agent.id))];
  if (jobs.some((job) => job.status === 'running' || job.status === 'stopping')) return 'busy';
  return jobs.every((job) => ['completed', 'killed', 'failed'].includes(job.status))
    ? 'idle'
    : 'unknown';
}
