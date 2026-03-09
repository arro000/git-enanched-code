import React from 'react';
import { ConflictChunk } from '../../../core/git/ConflictParser';

// ---------------------------------------------------------------------------
// Monaco Editor widget — loaded from CDN at runtime via AMD loader
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoApi = any;

interface MonacoEditorWidgetProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
}

function MonacoEditorWidget({ value, language, onChange }: MonacoEditorWidgetProps): JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = React.useRef<any>(null);
  const onChangeRef = React.useRef(onChange);
  const latestValueRef = React.useRef(value);
  const latestLanguageRef = React.useRef(language);

  // Keep refs up to date on every render without re-running the effect
  onChangeRef.current = onChange;
  latestValueRef.current = value;
  latestLanguageRef.current = language;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const createEditor = (monacoApi: MonacoApi) => {
      if (editorRef.current) return; // guard against double-init
      const isDark =
        document.body.classList.contains('vscode-dark') ||
        document.body.classList.contains('vscode-high-contrast');
      const editor = monacoApi.editor.create(container, {
        value: latestValueRef.current,
        language: latestLanguageRef.current,
        theme: isDark ? 'vs-dark' : 'vs',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        fontSize: 12,
        wordWrap: 'on',
        scrollbar: { alwaysConsumeMouseWheel: false },
      });
      editor.onDidChangeModelContent(() => {
        onChangeRef.current(editor.getValue());
      });
      editorRef.current = editor;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    if (win.monaco) {
      createEditor(win.monaco as MonacoApi);
    } else if (win.require) {
      win.require.config({
        paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs' },
      });
      win.require(['vs/editor/editor.main'], createEditor);
    }

    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty: create editor once on mount, dispose on unmount

  // Sync value to Monaco when it changes externally (e.g. chunk applied via >> or <<)
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  // Approximate height: ~20px per line + padding, min 80px
  const lineCount = Math.max(3, value.split('\n').length);
  const height = lineCount * 20 + 16;

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}

interface ThreeColumnLayoutProps {
  chunks: ConflictChunk[];
  resolvedChunks: Map<number, string[]>;
  originalContent: string;
  currentConflictIndex: number;
  onResolveChunk: (startLine: number, resolvedLines: string[]) => void;
  onUnresolveChunk: (startLine: number) => void;
  onCompleteMerge: () => void;
  unresolvedCount: number;
  fileName: string;
  language: string;
}

export function ThreeColumnLayout({
  chunks,
  resolvedChunks,
  originalContent: _originalContent,
  currentConflictIndex,
  onResolveChunk,
  onUnresolveChunk,
  onCompleteMerge,
  unresolvedCount,
  fileName,
  language,
}: ThreeColumnLayoutProps): JSX.Element {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.fileName}>{fileName}</span>
        <span style={styles.conflictBadge}>
          {unresolvedCount > 0
            ? `${unresolvedCount} conflict${unresolvedCount > 1 ? 's' : ''} remaining`
            : 'All conflicts resolved'}
        </span>
        <button style={styles.completeMergeBtn} onClick={onCompleteMerge}>
          Complete Merge
        </button>
      </div>

      {/* Column labels */}
      <div style={styles.columnHeaders}>
        <div style={styles.colHeader}>HEAD (Your code)</div>
        <div style={{ ...styles.colHeader, ...styles.centerHeader }}>RESULT</div>
        <div style={styles.colHeader}>MERGING (Incoming)</div>
      </div>

      {/* Content columns */}
      <div style={styles.columnsContainer}>
        <div style={styles.column}>
          {chunks.map((chunk) => (
            <ConflictBlock
              key={chunk.startLine}
              chunk={chunk}
              side="left"
              resolved={resolvedChunks.has(chunk.startLine)}
              isCurrent={chunks.indexOf(chunk) === currentConflictIndex}
              onApply={() => {
                const existing = resolvedChunks.get(chunk.startLine) ?? [];
                onResolveChunk(chunk.startLine, [...existing, ...chunk.headLines]);
              }}
              onUnresolveChunk={onUnresolveChunk}
            />
          ))}
        </div>

        <div style={{ ...styles.column, ...styles.centerColumn }}>
          {chunks.map((chunk) => (
            <CenterBlock
              key={chunk.startLine}
              chunk={chunk}
              resolvedLines={resolvedChunks.get(chunk.startLine)}
              isCurrent={chunks.indexOf(chunk) === currentConflictIndex}
              onUpdate={(lines) => onResolveChunk(chunk.startLine, lines)}
              language={language}
            />
          ))}
        </div>

        <div style={styles.column}>
          {chunks.map((chunk) => (
            <ConflictBlock
              key={chunk.startLine}
              chunk={chunk}
              side="right"
              resolved={resolvedChunks.has(chunk.startLine)}
              isCurrent={chunks.indexOf(chunk) === currentConflictIndex}
              onApply={() => {
                const existing = resolvedChunks.get(chunk.startLine) ?? [];
                onResolveChunk(chunk.startLine, [...existing, ...chunk.mergingLines]);
              }}
              onUnresolveChunk={onUnresolveChunk}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type SideAction = 'none' | 'applied' | 'discarded';

interface ConflictBlockProps {
  chunk: ConflictChunk;
  side: 'left' | 'right';
  resolved: boolean;
  isCurrent: boolean;
  onApply: () => void;
  onUnresolveChunk: (startLine: number) => void;
}

function ConflictBlock({
  chunk,
  side,
  resolved,
  isCurrent,
  onApply,
  onUnresolveChunk,
}: ConflictBlockProps): JSX.Element {
  const [sideAction, setSideAction] = React.useState<SideAction>('none');
  const lines = side === 'left' ? chunk.headLines : chunk.mergingLines;
  const applyLabel = side === 'left' ? '>>' : '<<';

  const handleApply = () => {
    setSideAction('applied');
    onApply();
  };

  const handleDiscard = () => {
    if (sideAction === 'applied') {
      // Undo the apply: remove this chunk from resolvedChunks so conflict reopens
      setSideAction('none');
      onUnresolveChunk(chunk.startLine);
    } else {
      // Mark this side as discarded (conflict stays open, nothing written to center)
      setSideAction('discarded');
    }
  };

  return (
    <div
      style={{
        ...styles.conflictBlock,
        ...(isCurrent ? styles.currentConflict : {}),
        ...(resolved ? styles.resolvedBlock : {}),
      }}
    >
      <div style={styles.blockActions}>
        <button
          style={{
            ...styles.actionBtn,
            ...(sideAction === 'applied' ? styles.actionBtnApplied : {}),
          }}
          onClick={handleApply}
          title={`Apply ${side} chunk`}
          aria-label={`Apply ${side === 'left' ? 'HEAD' : 'MERGING'} chunk`}
        >
          {applyLabel}
        </button>
        <button
          style={{
            ...styles.discardBtn,
            ...(sideAction === 'discarded' ? styles.discardBtnActive : {}),
          }}
          onClick={handleDiscard}
          title={sideAction === 'applied' ? 'Undo apply' : 'Discard chunk'}
          aria-label={sideAction === 'applied' ? 'Undo apply' : 'Discard chunk'}
        >
          x
        </button>
      </div>
      <pre style={styles.codeBlock}>
        {lines.map((line, i) => (
          <div key={i} style={styles.codeLine}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

interface CenterBlockProps {
  chunk: ConflictChunk;
  resolvedLines: string[] | undefined;
  isCurrent: boolean;
  onUpdate: (lines: string[]) => void;
  language: string;
}

function CenterBlock({ chunk, resolvedLines, isCurrent, onUpdate, language }: CenterBlockProps): JSX.Element {
  const content = resolvedLines !== undefined ? resolvedLines.join('\n') : '';

  return (
    <div
      style={{
        ...styles.conflictBlock,
        ...styles.centerBlock,
        ...(isCurrent ? styles.currentConflict : {}),
        ...(resolvedLines !== undefined ? styles.resolvedBlock : {}),
      }}
      aria-label={`Merge result for conflict at line ${chunk.startLine + 1}`}
    >
      {resolvedLines === undefined && (
        <div style={styles.centerPlaceholder}>
          {`Conflict lines ${chunk.startLine + 1}–${chunk.endLine + 1} — use › or ‹ to apply, or edit below`}
        </div>
      )}
      <MonacoEditorWidget
        value={content}
        language={language}
        onChange={(val) => onUpdate(val.split('\n'))}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 16px',
    background: 'var(--vscode-titleBar-activeBackground)',
    borderBottom: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
  },
  fileName: {
    fontWeight: 600,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  conflictBadge: {
    fontSize: '0.85em',
    color: 'var(--vscode-descriptionForeground)',
    whiteSpace: 'nowrap',
  },
  completeMergeBtn: {
    padding: '4px 14px',
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.9em',
    whiteSpace: 'nowrap',
  },
  columnHeaders: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    flexShrink: 0,
  },
  colHeader: {
    padding: '4px 12px',
    fontSize: '0.8em',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--vscode-descriptionForeground)',
    background: 'var(--vscode-editorGroupHeader-tabsBackground)',
    borderBottom: '1px solid var(--vscode-panel-border)',
  },
  centerHeader: {
    background: 'var(--vscode-editor-selectionHighlightBackground)',
  },
  columnsContainer: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    overflow: 'auto',
    gap: '0 1px',
    background: 'var(--vscode-panel-border)',
  },
  column: {
    overflow: 'auto',
    background: 'var(--vscode-editor-background)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 8,
  },
  centerColumn: {
    background: 'var(--vscode-editor-background)',
  },
  conflictBlock: {
    border: '1px solid var(--vscode-editorWarning-foreground)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  currentConflict: {
    border: '1px solid var(--vscode-focusBorder)',
    boxShadow: '0 0 0 2px var(--vscode-focusBorder)',
  },
  resolvedBlock: {
    border: '1px solid var(--vscode-editorGutter-addedBackground)',
    opacity: 0.7,
  },
  centerBlock: {
    border: '1px solid var(--vscode-input-border)',
    overflow: 'hidden',
  },
  centerPlaceholder: {
    padding: '4px 8px',
    fontSize: '0.8em',
    color: 'var(--vscode-descriptionForeground)',
    fontStyle: 'italic',
    borderBottom: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
  },
  blockActions: {
    display: 'flex',
    gap: 4,
    padding: '4px 6px',
    background: 'var(--vscode-editorWidget-background)',
    borderBottom: '1px solid var(--vscode-panel-border)',
  },
  actionBtn: {
    padding: '2px 8px',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: '0.85em',
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
  },
  discardBtn: {
    padding: '2px 8px',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: '0.85em',
    background: 'var(--vscode-errorForeground)',
    color: '#fff',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
  },
  actionBtnApplied: {
    background: 'var(--vscode-testing-iconPassed, #4caf50)',
    color: '#fff',
  },
  discardBtnActive: {
    background: 'var(--vscode-disabledForeground, #6c757d)',
    color: 'var(--vscode-button-foreground)',
  },
  codeBlock: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: '0.85em',
    padding: '6px 8px',
    margin: 0,
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  codeLine: {
    lineHeight: 1.5,
  },
};
