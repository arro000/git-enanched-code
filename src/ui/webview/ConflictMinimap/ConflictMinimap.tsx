import React from 'react';
import { ConflictChunk } from '../../../core/git/ConflictParser';

interface ConflictMinimapProps {
  chunks: ConflictChunk[];
  resolvedChunks: Map<number, string[]>;
  totalLines: number;
  currentConflictIndex: number;
  onJumpToChunk: (index: number) => void;
}

export function ConflictMinimap({
  chunks,
  resolvedChunks,
  totalLines,
  currentConflictIndex,
  onJumpToChunk,
}: ConflictMinimapProps): JSX.Element {
  const unresolvedCount = chunks.filter((c) => !resolvedChunks.has(c.startLine)).length;

  return (
    <div style={styles.container} aria-label="Conflict minimap">
      {/* Conflict counter */}
      <div style={styles.counter} aria-live="polite" aria-label={`${unresolvedCount} unresolved conflicts`}>
        <span style={styles.countNumber}>{unresolvedCount}</span>
        <span style={styles.countLabel}>left</span>
      </div>

      {/* Minimap track */}
      <div style={styles.track} role="navigation" aria-label="Jump to conflict">
        {chunks.map((chunk, index) => {
          const isResolved = resolvedChunks.has(chunk.startLine);
          const isCurrent = index === currentConflictIndex;
          const top = totalLines > 0 ? (chunk.startLine / totalLines) * 100 : 0;
          const height = Math.max(
            2,
            totalLines > 0 ? ((chunk.endLine - chunk.startLine + 1) / totalLines) * 100 : 2
          );

          return (
            <button
              key={chunk.startLine}
              style={{
                ...styles.marker,
                top: `${top}%`,
                height: `${height}%`,
                minHeight: 4,
                background: isResolved
                  ? 'var(--vscode-gitDecoration-addedResourceForeground, #4caf50)'
                  : 'var(--vscode-editorError-foreground, #f44336)',
                outline: isCurrent ? '2px solid var(--vscode-focusBorder)' : 'none',
              }}
              onClick={() => onJumpToChunk(index)}
              title={`Conflict at line ${chunk.startLine + 1}${isResolved ? ' (resolved)' : ' (unresolved)'}`}
              aria-label={`Jump to conflict ${index + 1} at line ${chunk.startLine + 1}`}
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
  },
};
