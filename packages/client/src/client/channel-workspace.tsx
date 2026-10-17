import { useRef, useState, type ReactNode } from 'react';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelWorkspaceState, DockDirection } from './channel-dock-layout.js';

const DRAG_TYPE = 'application/x-bh-channel-session';

export function ChannelWorkspace({
  channelId,
  state,
  setState,
  content,
  header,
  sessions,
  label,
}: {
  channelId: string | undefined;
  state: ChannelWorkspaceState;
  setState(next: ChannelWorkspaceState): void;
  content: ReactNode;
  header: ReactNode;
  sessions: ReactNode;
  label: string;
}) {
  const [drop, setDrop] = useState<DockDirection>();
  const dragChannel = useRef<string | undefined>(undefined);
  const host = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const mount = useMountedResource<HTMLDivElement>((node) => {
    host.current = node;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      setCompact(width > 0 && width < 520);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const vertical = compact || state.direction === 'above' || state.direction === 'below';
  const leading = state.direction === 'left' || state.direction === 'above';
  const active = state.open && channelId !== undefined;
  const directionAt = (x: number, y: number): DockDirection => {
    const box = host.current!.getBoundingClientRect();
    const dx = (x - box.left) / box.width;
    const dy = (y - box.top) / box.height;
    if (compact) return dy < 0.5 ? 'above' : 'below';
    return Math.min(dx, 1 - dx) < Math.min(dy, 1 - dy)
      ? dx < 0.5
        ? 'left'
        : 'right'
      : dy < 0.5
        ? 'above'
        : 'below';
  };
  return (
    <div
      ref={mount}
      className="bh-channel-workspace"
      data-channel-workspace={channelId}
      data-direction={state.direction}
      data-split-axis={vertical ? 'vertical' : 'horizontal'}
      style={{ flexDirection: vertical ? 'column' : 'row' }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE) || dragChannel.current !== channelId)
          return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setDrop(directionAt(event.clientX, event.clientY));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(undefined);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        if (
          channelId &&
          event.dataTransfer.getData(DRAG_TYPE) === channelId &&
          dragChannel.current === channelId
        )
          setState({ ...state, direction: directionAt(event.clientX, event.clientY) });
        setDrop(undefined);
        dragChannel.current = undefined;
      }}
    >
      <div className="bh-channel-message-host" style={{ order: leading ? 2 : 0 }}>
        {content}
      </div>
      <div
        className="bh-channel-session-divider"
        hidden={!active}
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(state.ratio * 100)}
        style={{ order: 1 }}
        onKeyDown={(event) => {
          const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const delta = (event.key === keys[1] ? 0.02 : -0.02) * (leading ? 1 : -1);
          setState({ ...state, ratio: Math.min(0.8, Math.max(0.2, state.ratio + delta)) });
        }}
        onPointerDown={(event) => {
          if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !host.current) return;
          const box = host.current.getBoundingClientRect();
          const fraction = vertical
            ? (event.clientY - box.top) / box.height
            : (event.clientX - box.left) / box.width;
          setState({
            ...state,
            ratio: Math.min(0.8, Math.max(0.2, leading ? fraction : 1 - fraction)),
          });
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
      <section
        className="bh-channel-session-host"
        hidden={!active}
        aria-label={label}
        data-channel-subpanel="sessions"
        style={{ order: leading ? 0 : 2, flex: `0 0 ${state.ratio * 100}%` }}
      >
        <div
          className="bh-channel-session-header"
          draggable={active}
          onDragStart={(event) => {
            if (!channelId || (event.target as Element).closest('button')) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            dragChannel.current = channelId;
            event.dataTransfer.setData(DRAG_TYPE, channelId);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            setDrop(undefined);
            dragChannel.current = undefined;
          }}
        >
          {header}
        </div>
        {active && sessions}
      </section>
      {drop && <div className="bh-channel-drop-preview" data-drop-side={drop} aria-hidden="true" />}
    </div>
  );
}
