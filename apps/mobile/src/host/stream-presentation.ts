import type { ConversationDraft, ConversationSnapshot } from './conversation';

export function createDraftPresentation(
  source: {
    getSnapshot(): Pick<ConversationSnapshot, 'drafts' | 'status'>;
    subscribe(listener: () => void): () => void;
  },
  draftId: string,
) {
  const listeners = new Set<() => void>();
  const read = () => source.getSnapshot().drafts.find((draft) => draft.draftId === draftId);
  let latest = read();
  let visible: ConversationDraft | undefined =
    latest === undefined ? undefined : { ...latest, body: '' };
  let pendingSince: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  const publish = (next: ConversationDraft | undefined) => {
    if (visible?.body === next?.body && visible?.botSlug === next?.botSlug) return;
    visible = next;
    for (const listener of listeners) listener();
  };
  const release = () => {
    timer = undefined;
    if (latest === undefined) return;
    const body = latest.body;
    const shown = visible?.body.length ?? 0;
    const boundary = body.lastIndexOf('\n\n') + 2;
    const until =
      shown === 0 || Date.now() - (pendingSince ?? 0) >= 160
        ? body.length
        : boundary > shown
          ? boundary
          : shown;
    if (until > shown) {
      publish({ ...latest, body: body.slice(0, until) });
      pendingSince = until === body.length ? undefined : Date.now();
    }
    if (until < body.length) timer = setTimeout(release, 80);
  };
  const update = () => {
    latest = read();
    if (
      latest === undefined ||
      source.getSnapshot().status !== 'live' ||
      !latest.body.startsWith(visible?.body ?? '')
    ) {
      clearTimeout(timer);
      timer = undefined;
      pendingSince = undefined;
      publish(latest);
      return;
    }
    if (latest.body === visible?.body) return;
    pendingSince ??= Date.now();
    timer ??= setTimeout(release, 80);
  };
  return {
    getSnapshot: () => visible,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        unsubscribe = source.subscribe(update);
        update();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribe?.();
          unsubscribe = undefined;
          clearTimeout(timer);
          timer = undefined;
        }
      };
    },
  };
}
