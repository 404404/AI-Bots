import type { BotCreationDraft, BotCreationDraftCache } from './persona-bot-create.js';

export type HomeCreationSource = 'empty' | 'git' | 'zip';
export interface HomeCreationRequest {
  source: HomeCreationSource;
  sectionId?: string;
  sectionName?: string;
}

export class HomeCreation {
  private snapshot: HomeCreationRequest | undefined;
  private listeners = new Set<() => void>();
  private drafts = new Map<string, BotCreationDraft>();
  private files = new Map<string, File>();
  private busy = new Set<string>();
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = (): HomeCreationRequest | undefined => this.snapshot;
  key(request: HomeCreationRequest): string {
    return JSON.stringify([request.source, request.sectionId ?? null]);
  }
  open(request: HomeCreationRequest): boolean {
    if (this.busy.size > 0) return false;
    this.snapshot = request;
    this.emit();
    return true;
  }
  chooseSource(source: HomeCreationSource): boolean {
    return this.open({ ...this.snapshot, source });
  }
  back(): void {
    if (this.busy.size > 0) return;
    this.snapshot = undefined;
    this.emit();
  }
  complete(request: HomeCreationRequest): void {
    const key = this.key(request);
    this.drafts.delete(key);
    this.files.delete(key);
    this.busy.delete(key);
    if (this.snapshot && this.key(this.snapshot) === key) this.snapshot = undefined;
    this.emit();
  }
  isBusy(): boolean {
    return this.busy.size > 0;
  }
  setBusy(request: HomeCreationRequest, busy: boolean): void {
    const key = this.key(request);
    if (busy) this.busy.add(key);
    else this.busy.delete(key);
    if (this.snapshot) this.snapshot = { ...this.snapshot };
    this.emit();
  }
  draft(request: HomeCreationRequest): BotCreationDraftCache {
    const key = this.key(request);
    return {
      read: () => this.drafts.get(key),
      write: (draft) => {
        this.drafts.set(key, draft);
      },
    };
  }
  file(request: HomeCreationRequest): File | undefined {
    return this.files.get(this.key(request));
  }
  setFile(request: HomeCreationRequest, file: File | undefined): void {
    const key = this.key(request);
    if (file) this.files.set(key, file);
    else this.files.delete(key);
  }
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
