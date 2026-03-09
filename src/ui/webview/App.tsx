import { useEffect, useReducer, useCallback, useRef } from 'react';
import { ConflictChunk } from '../../core/git/ConflictParser';
import { ThreeColumnLayout } from './ThreeColumnLayout/ThreeColumnLayout';
import { ConflictMinimap } from './ConflictMinimap/ConflictMinimap';

export interface AstResolutionEntry {
  resolvedLines: string[];
  confidence: number;
}

export interface AppState {
  chunks: ConflictChunk[];
  /** Map from startLine to resolved lines */
  resolvedChunks: Map<number, string[]>;
  /** AST resolution candidates (not yet applied). Applied on wand click (US-12). */
  astResolutions: Map<number, AstResolutionEntry>;
  originalContent: string;
  fileName: string;
  currentConflictIndex: number;
  isReady: boolean;
}

type AppAction =
  | {
      type: 'INIT';
      chunks: ConflictChunk[];
      originalContent: string;
      fileName: string;
      /** Pre-resolved chunks from diff3 auto-resolution (startLine string → resolvedLines) */
      resolvedChunks?: Record<string, string[]>;
      /** AST resolution candidates, applied on wand click (startLine string → entry) */
      astResolutions?: Record<string, AstResolutionEntry>;
    }
  | { type: 'RESOLVE_CHUNK'; startLine: number; resolvedLines: string[] }
  | { type: 'UNRESOLVE_CHUNK'; startLine: number }
  | { type: 'APPLY_WAND_RESOLUTIONS' }
  | { type: 'JUMP_CONFLICT'; direction: 'next' | 'prev' }
  | { type: 'JUMP_TO_INDEX'; index: number }
  | { type: 'UPDATE_CONFLICT_COUNT'; count: number };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INIT': {
      const preResolved: Map<number, string[]> = action.resolvedChunks
        ? new Map(
            Object.entries(action.resolvedChunks).map(([k, v]) => [Number(k), v])
          )
        : new Map();
      const astRes: Map<number, AstResolutionEntry> = action.astResolutions
        ? new Map(
            Object.entries(action.astResolutions).map(([k, v]) => [Number(k), v])
          )
        : new Map();
      return {
        ...state,
        chunks: action.chunks,
        resolvedChunks: preResolved,
        astResolutions: astRes,
        originalContent: action.originalContent,
        fileName: action.fileName,
        isReady: true,
      };
    }
    case 'RESOLVE_CHUNK': {
      const next = new Map(state.resolvedChunks);
      next.set(action.startLine, action.resolvedLines);
      return { ...state, resolvedChunks: next };
    }
    case 'UNRESOLVE_CHUNK': {
      const next = new Map(state.resolvedChunks);
      next.delete(action.startLine);
      return { ...state, resolvedChunks: next };
    }
    case 'APPLY_WAND_RESOLUTIONS': {
      const next = new Map(state.resolvedChunks);
      for (const [startLine, entry] of state.astResolutions) {
        if (!next.has(startLine)) {
          next.set(startLine, entry.resolvedLines);
        }
      }
      return { ...state, resolvedChunks: next, astResolutions: new Map() };
    }
    case 'JUMP_CONFLICT': {
      const unresolvedIndices = state.chunks
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !state.resolvedChunks.has(c.startLine))
        .map(({ i }) => i);

      if (unresolvedIndices.length === 0) return state;

      const currentPos = unresolvedIndices.indexOf(state.currentConflictIndex);
      let nextPos: number;

      if (action.direction === 'next') {
        nextPos = currentPos < unresolvedIndices.length - 1 ? currentPos + 1 : 0;
      } else {
        nextPos = currentPos > 0 ? currentPos - 1 : unresolvedIndices.length - 1;
      }

      return { ...state, currentConflictIndex: unresolvedIndices[nextPos] };
    }
    case 'JUMP_TO_INDEX':
      if (action.index >= 0 && action.index < state.chunks.length) {
        return { ...state, currentConflictIndex: action.index };
      }
      return state;
    default:
      return state;
  }
}

const initialState: AppState = {
  chunks: [],
  resolvedChunks: new Map(),
  astResolutions: new Map(),
  originalContent: '',
  fileName: '',
  currentConflictIndex: 0,
  isReady: false,
};

interface AppProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vscodeApi: any;
  language: string;
}

export function App({ vscodeApi, language }: AppProps): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  const columnsContainerRef = useRef<HTMLDivElement>(null);

  // Signal ready to extension host
  useEffect(() => {
    vscodeApi.postMessage({ type: 'ready' });
  }, [vscodeApi]);

  // Handle messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          dispatch({
            type: 'INIT',
            chunks: message.chunks,
            originalContent: message.originalContent,
            fileName: message.fileName,
            resolvedChunks: message.resolvedChunks,
            astResolutions: message.astResolutions,
          });
          break;
        case 'jumpToConflict':
          dispatch({ type: 'JUMP_CONFLICT', direction: message.direction });
          break;
        case 'confirmCompleteMerge':
          if (
            window.confirm(
              `There are still ${message.unresolvedCount} unresolved conflict(s). Proceed anyway?`
            )
          ) {
            vscodeApi.postMessage({ type: 'completeMerge', forceComplete: true });
          }
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [vscodeApi]);

  const handleResolveChunk = useCallback(
    (startLine: number, resolvedLines: string[]) => {
      dispatch({ type: 'RESOLVE_CHUNK', startLine, resolvedLines });
      vscodeApi.postMessage({ type: 'resolveChunk', startLine, resolvedLines });
    },
    [vscodeApi]
  );

  const handleUnresolveChunk = useCallback(
    (startLine: number) => {
      dispatch({ type: 'UNRESOLVE_CHUNK', startLine });
      vscodeApi.postMessage({ type: 'unresolveChunk', startLine });
    },
    [vscodeApi]
  );

  const handleCompleteMerge = useCallback(() => {
    vscodeApi.postMessage({ type: 'completeMerge', forceComplete: false });
  }, [vscodeApi]);

  const handleApplyWand = useCallback(() => {
    dispatch({ type: 'APPLY_WAND_RESOLUTIONS' });
    vscodeApi.postMessage({ type: 'applyWandResolutions' });
  }, [vscodeApi]);

  if (!state.isReady) {
    return (
      <div style={{ padding: 24, color: 'var(--vscode-descriptionForeground)' }}>
        Loading merge editor...
      </div>
    );
  }

  const unresolvedCount = state.chunks.filter(
    (c) => !state.resolvedChunks.has(c.startLine)
  ).length;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <ThreeColumnLayout
        chunks={state.chunks}
        resolvedChunks={state.resolvedChunks}
        originalContent={state.originalContent}
        currentConflictIndex={state.currentConflictIndex}
        onResolveChunk={handleResolveChunk}
        onUnresolveChunk={handleUnresolveChunk}
        onCompleteMerge={handleCompleteMerge}
        unresolvedCount={unresolvedCount}
        fileName={state.fileName}
        language={language}
        astResolutionCount={state.astResolutions.size}
        astAverageConfidence={
          state.astResolutions.size > 0
            ? [...state.astResolutions.values()].reduce((s, e) => s + e.confidence, 0) /
              state.astResolutions.size
            : 0
        }
        onApplyWand={handleApplyWand}
        columnsContainerRef={columnsContainerRef}
      />
      <ConflictMinimap
        chunks={state.chunks}
        resolvedChunks={state.resolvedChunks}
        totalLines={state.originalContent.split('\n').length}
        currentConflictIndex={state.currentConflictIndex}
        onJumpToChunk={(index) => dispatch({ type: 'JUMP_TO_INDEX', index })}
        scrollContainer={columnsContainerRef}
      />
    </div>
  );
}
