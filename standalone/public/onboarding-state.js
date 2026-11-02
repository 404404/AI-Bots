export class OnboardingRequestCoordinator {
  #epochs = new Map();
  #retrying = new Set();

  begin(botId) {
    const epoch = (this.#epochs.get(botId) ?? 0) + 1;
    this.#epochs.set(botId, epoch);
    return epoch;
  }

  beginPoll(botId) {
    return this.#retrying.has(botId) ? null : this.begin(botId);
  }

  beginRetry(botId) {
    if (this.#retrying.has(botId)) return null;
    this.#retrying.add(botId);
    return this.begin(botId);
  }

  finishRetry(botId) {
    this.#retrying.delete(botId);
  }

  isCurrent(botId, epoch) {
    return this.#epochs.get(botId) === epoch;
  }
}

export function shouldSelectCreatedBot(startEpoch, currentEpoch) {
  return startEpoch === currentEpoch;
}

export async function selectCreatedBotIfUnchanged(startEpoch, currentEpoch, select) {
  if (!shouldSelectCreatedBot(startEpoch, currentEpoch())) return false;
  await select();
  return true;
}
