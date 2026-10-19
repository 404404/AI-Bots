export const IDLE_ACTIONS = ['window', 'stretch', 'chin', 'sip', 'glance'] as const;
export type IdleAction = (typeof IDLE_ACTIONS)[number];

export const IDLE_DURATION: Record<IdleAction, number> = {
  window: 4.5,
  stretch: 3.4,
  chin: 6,
  sip: 4.2,
  glance: 2.4,
};

export interface IdleFrame {
  action: IdleAction | undefined;
  weight: number;
  progress: number;
}

const EASE = 1;
const RETREAT = 2.5;

export class IdleScheduler {
  action: IdleAction | undefined;
  progress = 0;
  weight = 0;
  #elapsed = 0;
  #wait: number;
  #last: IdleAction | undefined;
  #retreating = false;

  constructor(
    readonly random: () => number = Math.random,
    readonly minWait = 6,
    readonly maxWait = 14,
  ) {
    this.#wait = this.#nextWait();
  }

  step(delta: number, eligible: boolean): IdleFrame {
    if (this.action) {
      if (!eligible) this.#retreating = true;
      if (this.#retreating) {
        this.weight = Math.max(0, this.weight - delta * RETREAT);
        if (this.weight === 0) this.#finish();
      } else {
        this.#elapsed += delta;
        const duration = IDLE_DURATION[this.action];
        this.progress = Math.min(1, this.#elapsed / duration);
        const ease = Math.min(this.#elapsed, duration - this.#elapsed) / EASE;
        this.weight = Math.max(0, Math.min(1, ease));
        if (this.#elapsed >= duration) this.#finish();
      }
    } else if (!eligible) {
      this.#wait = this.#nextWait();
    } else {
      this.#wait -= delta;
      if (this.#wait <= 0) this.#start();
    }
    const weight = this.weight * this.weight * (3 - 2 * this.weight);
    return { action: this.action, weight, progress: this.progress };
  }

  #start() {
    const choices = IDLE_ACTIONS.filter((action) => action !== this.#last);
    this.action = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
    this.#last = this.action;
    this.#elapsed = 0;
    this.progress = 0;
    this.weight = 0;
    this.#retreating = false;
  }

  #finish() {
    this.action = undefined;
    this.weight = 0;
    this.progress = 0;
    this.#retreating = false;
    this.#wait = this.#nextWait();
  }

  #nextWait() {
    return this.minWait + this.random() * (this.maxWait - this.minWait);
  }
}
