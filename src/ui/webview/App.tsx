import { useEffect, useReducer, useCallback } from 'react';
import { ConflictChunk } from '../../core/git/ConflictParser';
import { ThreeColumnLayout } from './ThreeColumnLayout/ThreeColumnLayout';
import { ConflictMinimap } from './ConflictMinimap/ConflictMinimap';

export interface AppState {
  chunks: ConflictChunk[];
  /** Map from startLine to resolved lines */
  resolvedChunks: Map<number, string[]>;
  originalContent: string;
  fileName: string;
  currentConflictIndex: number;
  isReady: boolean;
}

type AppAction =
  | { type: 'INIT'; chunks: ConflictChunk[]; originalContent: string; fileName: string }
  | { type: 'RESOLVE_CHUNK'; startLine: number; resolvedLines: string[] }
  | { type: 'UNRESOLVE_CHUNK'; startLine: number }
  | { type: 'JUMP_CONFLICT'; direction: 'next' | 'prev' }
  | { type: 'JUMP_TO_INDEX'; index: number }
  | { type: 'UPDATE_CONFLICT_COUNT'; count: number };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        chunks: action.chunks,
        originalContent: action.originalContent,
        fileName: action.fileName,
        isReady: true,
      };
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
      />
      <ConflictMinimap
        chunks={state.chunks}
        resolvedChunks={state.resolvedChunks}
        totalLines={state.originalContent.split('\n').length}
        currentConflictIndex={state.currentConflictIndex}
        onJumpToChunk={(index) => dispatch({ type: 'JUMP_TO_INDEX', index })}
      />
    </div>
  );
}
