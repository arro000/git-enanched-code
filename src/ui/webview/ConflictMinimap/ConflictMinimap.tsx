import React from 'react';
import { ConflictChunk } from '../../../core/git/ConflictParser';

interface ConflictMinimapProps {
  chunks: ConflictChunk[];
  resolvedChunks: Map<number, string[]>;
  totalLines: number;
  currentConflictIndex: number;
  onJumpToChunk: (index: number) => void;
  /** Ref to the columns scroll container, used for cursor tracking and programmatic scroll. */
  scrollContainer?: React.RefObject<HTMLDivElement>;
}

export function ConflictMinimap({
  chunks,
  resolvedChunks,
  totalLines,
  currentConflictIndex,
  onJumpToChunk,
  scrollContainer,
}: ConflictMinimapProps): JSX.Element {
  const unresolvedCount = chunks.filter((c) => !resolvedChunks.has(c.startLine)).length;

  // Track scroll position of the columns container for the cursor indicator
  const [cursorTop, setCursorTop] = React.useState(0);
  const [cursorHeight, setCursorHeight] = React.useState(100);

  React.useEffect(() => {
    const el = scrollContainer?.current;
    if (!el) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight > 0) {
        setCursorTop((scrollTop / scrollHeight) * 100);
        setCursorHeight((clientHeight / scrollHeight) * 100);
      }
    };

    update();
    el.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollContainer]);

  // Click on the track background (not on a conflict marker) scrolls proportionally
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // ignore clicks bubbled from markers
    const container = scrollContainer?.current;
    if (!container) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    container.scrollTop = ratio * (container.scrollHeight - container.clientHeight);
  };

  return (
    <div style={styles.container} aria-label="Conflict minimap">
      {/* Conflict counter */}
      <div
        style={styles.counter}
        aria-live="polite"
        aria-label={unresolvedCount === 0 ? 'All conflicts resolved' : `${unresolvedCount} unresolved conflicts`}
      >
        <span
          style={{
            ...styles.countNumber,
            color:
              unresolvedCount === 0
                ? 'var(--vscode-gitDecoration-addedResourceForeground, #4caf50)'
                : 'var(--vscode-editorWarning-foreground, #e9b130)',
          }}
        >
          {unresolvedCount === 0 ? '✓' : unresolvedCount}
        </span>
        <span style={styles.countLabel}>{unresolvedCount === 0 ? 'done' : 'left'}</span>
      </div>

      {/* Minimap track */}
      <div
        style={styles.track}
        role="navigation"
        aria-label="Jump to conflict"
        onClick={handleTrackClick}
      >
        {/* Scroll position cursor — shows which portion of the document is currently visible */}
        <div
          style={{
            ...styles.scrollCursor,
            top: `${cursorTop}%`,
            height: `${Math.max(cursorHeight, 5)}%`,
          }}
          aria-hidden="true"
        />

        {chunks.map((chunk, index) => {
          const isResolved = resolvedChunks.has(chunk.startLine);
          const isCurrent = index === currentConflictIndex;
          const top = totalLines > 0 ? (chunk.startLine / totalLines) * 100 : 0;
          const height = Math.max(
            2,
            totalLines > 0 ? ((chunk.endLine - chunk.startLine + 1) / totalLines) * 100 : 2
          );

          const resolvedLines = resolvedChunks.get(chunk.startLine);
          const isRemoved =
            isResolved && resolvedLines !== undefined && resolvedLines.every((l) => l.trim() === '');
          const markerColor = !isResolved
            ? 'var(--vscode-editorError-foreground, #f44336)'
            : isRemoved
              ? 'var(--vscode-disabledForeground, #6c757d)'
              : 'var(--vscode-gitDecoration-addedResourceForeground, #4caf50)';
          const statusLabel = !isResolved ? 'unresolved' : isRemoved ? 'removed' : 'resolved';

          return (
            <button
              key={chunk.startLine}
              style={{
                ...styles.marker,
                top: `${top}%`,
                height: `${height}%`,
                minHeight: 4,
                background: markerColor,
                outline: isCurrent ? '2px solid var(--vscode-focusBorder)' : 'none',
              }}
              onClick={() => onJumpToChunk(index)}
              title={`Conflict at line ${chunk.startLine + 1} (${statusLabel})`}
              aria-label={`Jump to conflict ${index + 1} at line ${chunk.startLine + 1} — ${statusLabel}`}
            />
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 48,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--vscode-editorGutter-background, var(--vscode-editor-background))',
    borderLeft: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
    padding: '8px 0',
  },
  counter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 12,
    lineHeight: 1.2,
  },
  countNumber: {
    fontSize: '1.4em',
    fontWeight: 700,
    color: 'var(--vscode-editorWarning-foreground, #e9b130)',
  },
  countLabel: {
    fontSize: '0.7em',
    color: 'var(--vscode-descriptionForeground)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  track: {
    flex: 1,
    width: 28,
    position: 'relative',
    background: 'var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.2))',
    borderRadius: 3,
    cursor: 'pointer',
  },
  scrollCursor: {
    position: 'absolute',
    left: 0,
    right: 0,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 2,
    pointerEvents: 'none',
    zIndex: 0,
  },
  marker: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    border: 'none',
    borderRadius: 2,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    opacity: 0.85,
    zIndex: 1,
  },
};
