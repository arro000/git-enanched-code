import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

declare global {
  interface Window {
    __GIT_ENHANCED__: {
      vscodeApi: ReturnType<typeof acquireVsCodeApi>;
      initialChunkCount: number;
      language: string;
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function acquireVsCodeApi(): any;

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App vscodeApi={window.__GIT_ENHANCED__.vscodeApi} language={window.__GIT_ENHANCED__.language} />
  </React.StrictMode>
);
