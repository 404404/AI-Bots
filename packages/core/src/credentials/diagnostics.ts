export type PrivateInputLog = (
  phase: string,
  details?: {
    requestId?: string;
    botSlug?: string;
    sessionId?: string;
    durationMs?: number;
    program?: string;
  },
) => void;
