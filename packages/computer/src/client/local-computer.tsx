import { useCallback, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Note } from '../../../client/src/client/ds/note.js';
import { color, radius, space, text } from '../../../client/src/client/ds/tokens.stylex.js';
import { SidebarCardList, SidebarCardRow } from '../../../client/src/client/sidebar-card.js';
import type { ComputerTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  detail: {
    display: 'grid',
    gap: space.x3,
    justifyItems: 'start',
  },
  progress: {
    display: 'grid',
    gap: space.x1,
    width: '100%',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  bar: {
    width: '100%',
    height: '6px',
    accentColor: color.accent,
  },
  command: {
    margin: 0,
    width: '100%',
    boxSizing: 'border-box',
    paddingBlock: space.x2,
    paddingInline: space.x2,
    borderRadius: radius.control,
    backgroundColor: color.hover,
    color: color.fg,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  actions: {
    display: 'flex',
    gap: space.x2,
    flexWrap: 'wrap',
  },
});

interface LocalMissing {
  packages?: string[];
  command?: string;
  install?: 'root' | 'sudo' | 'none';
}

interface LocalStatus {
  target?: string;
  probe?: { available?: boolean; detail?: string };
  status?: {
    state?: string;
    phase?: string;
    detail?: string;
    progress?: { percent?: number; downloadedBytes?: number; totalBytes?: number };
    missing?: LocalMissing;
  };
  install?: { state?: string; packages?: string[]; percent?: number; text?: string };
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProgressLine({
  percent,
  label,
}: {
  readonly percent: number;
  readonly label: string;
}): ReactElement {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div role="status" {...stylex.props(styles.progress)}>
      <progress {...stylex.props(styles.bar)} max={100} value={value} />
      <span>{label}</span>
    </div>
  );
}

export function LocalComputerStatus({ t }: { t: ComputerTranslate }): ReactElement {
  const [payload, setPayload] = useState<LocalStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/computer/status', {
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw new Error(`Computer status: HTTP ${String(response.status)}`);
    const next = (await response.json()) as LocalStatus;
    if (!signal?.aborted) {
      setPayload(next);
      setError(undefined);
    }
  }, []);
  const resource = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    let pending = false;
    const poll = async (): Promise<void> => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
      } catch (error) {
        if (!controller.signal.aborted) setError(String(error));
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  const installing = payload?.install?.state === 'installing';
  const preparing = busy || installing || payload?.status?.phase === 'starting';
  const missing = payload?.status?.missing;
  const failure =
    error ??
    (payload?.install?.state === 'failed' ? payload.install.text : undefined) ??
    (missing === undefined ? payload?.status?.detail : undefined) ??
    payload?.probe?.detail;
  const post = (path: string, body: Record<string, unknown>): void => {
    setBusy(true);
    setError(undefined);
    void fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        await refresh();
      })
      .catch((error: unknown) => setError(String(error)))
      .finally(() => setBusy(false));
  };
  const check = (): void => post('/api/computer/start', { authorize: true, target: 'local' });
  const install = (): void => post('/api/computer/install-packages', { authorize: true });
  const [copied, setCopied] = useState(false);
  const copy = (command: string): void => {
    void navigator.clipboard?.writeText(command).then(() => setCopied(true));
  };
  const granted = payload?.status?.state === 'running';
  const download = payload?.status?.progress;
  const progress = installing ? (
    <ProgressLine
      percent={payload?.install?.percent ?? 0}
      label={t('local.installing', {
        packages: (payload?.install?.packages ?? []).join(', '),
        percent: String(payload?.install?.percent ?? 0),
      })}
    />
  ) : payload?.status?.phase === 'starting' && (download?.totalBytes ?? 0) > 0 ? (
    <ProgressLine
      percent={download?.percent ?? 0}
      label={t('local.downloading', {
        percent: String(download?.percent ?? 0),
        downloaded: formatMiB(download?.downloadedBytes ?? 0),
        total: formatMiB(download?.totalBytes ?? 0),
      })}
    />
  ) : null;
  const missingCard =
    missing === undefined || installing || (missing.packages ?? []).length === 0 ? null : (
      <>
        <Note tone="warning">
          {t('local.missing', { packages: (missing.packages ?? []).join(', ') })}
        </Note>
        {missing.install === 'none' ? (
          <>
            <Note>{t('local.missing.manual')}</Note>
            <pre {...stylex.props(styles.command)}>{missing.command}</pre>
          </>
        ) : null}
      </>
    );
  return (
    <div ref={resource}>
      <SidebarCardList className="bh-computer-cards">
        <SidebarCardRow
          icon="monitor"
          title={t('local.title')}
          chips={
            granted ? (
              <Tag tone="success">{t('local.chip.granted')}</Tag>
            ) : preparing ? (
              <Tag tone="info">{t('local.chip.checking')}</Tag>
            ) : missing !== undefined ? (
              <Tag tone="warning">{t('local.chip.missing')}</Tag>
            ) : failure === undefined ? (
              <Tag tone="neutral">{t('local.chip.unchecked')}</Tag>
            ) : (
              <Tag tone="danger">{t('local.chip.failed')}</Tag>
            )
          }
          meta={t(granted ? 'local.granted' : 'local.description')}
          detail={
            <div {...stylex.props(styles.detail)}>
              {failure === undefined ? null : <Note tone="danger">{failure}</Note>}
              {progress}
              {missingCard}
              <div {...stylex.props(styles.actions)}>
                {missing !== undefined && missing.install !== 'none' && !installing ? (
                  <Button size="sm" variant="primary" disabled={busy} onClick={install}>
                    {t('local.install')}
                  </Button>
                ) : null}
                {missing?.install === 'none' && missing.command !== undefined ? (
                  <Button size="sm" variant="outline" onClick={() => copy(missing.command ?? '')}>
                    {t(copied ? 'local.copied' : 'local.copy')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={preparing || payload?.probe?.available === false}
                  onClick={check}
                >
                  {t(preparing ? 'local.checking' : 'local.check')}
                </Button>
              </div>
            </div>
          }
        />
      </SidebarCardList>
    </div>
  );
}
