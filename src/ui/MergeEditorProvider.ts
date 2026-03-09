import * as vscode from 'vscode';
import * as path from 'path';
import { MergeOrchestrator } from '../core/git/MergeOrchestrator';
import { ConfigManager } from '../config/ConfigManager';

export class MergeEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'gitEnhanced.mergeEditor';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly mergeOrchestrator: MergeOrchestrator,
    private readonly _configManager: ConfigManager,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const filePath = document.uri.fsPath;

    try {
      const session = await this.mergeOrchestrator.openSession(filePath);

      if (!session) {
        // No conflicts found - fall back to native editor
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
        webviewPanel.dispose();
        return;
      }

      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
      };

      webviewPanel.webview.html = this.getWebviewContent(
        webviewPanel.webview,
        document,
        session
      );

      // Handle messages from webview
      webviewPanel.webview.onDidReceiveMessage(
        async (message) => {
          await this.handleWebviewMessage(message, document, webviewPanel);
        },
        undefined,
        this.context.subscriptions
      );

      // Set context for keybindings
      await vscode.commands.executeCommand(
        'setContext',
        'gitEnhanced.mergeEditorActive',
        true
      );

      webviewPanel.onDidDispose(async () => {
        await vscode.commands.executeCommand(
          'setContext',
          'gitEnhanced.mergeEditorActive',
          false
        );
      });
    } catch (error) {
      // RNF-04: fallback to native editor on any failure — log to output channel, no modal
      const msg = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `[Error] Failed to open merge editor for ${filePath}: ${msg}`
      );
      try {
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      } catch { /* ignore secondary failure — VS Code will show its own error */ }
      webviewPanel.dispose();
    }
  }

  private async handleWebviewMessage(
    message: WebviewMessage,
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const filePath = document.uri.fsPath;

    switch (message.type) {
      case 'unresolveChunk': {
        this.mergeOrchestrator.unresolveChunk(
          filePath,
          message.startLine ?? 0
        );
        const count = this.mergeOrchestrator.getUnresolvedCount(filePath);
        webviewPanel.webview.postMessage({ type: 'updateConflictCount', count });
        break;
      }

      case 'resolveChunk': {
        this.mergeOrchestrator.resolveChunk(
          filePath,
          message.startLine ?? 0,
          message.resolvedLines ?? []
        );
        const unresolvedCount = this.mergeOrchestrator.getUnresolvedCount(filePath);
        webviewPanel.webview.postMessage({
          type: 'updateConflictCount',
          count: unresolvedCount,
        });
        break;
      }

      case 'completeMerge': {
        const unresolvedCount = this.mergeOrchestrator.getUnresolvedCount(filePath);
        if (unresolvedCount > 0 && !message.forceComplete) {
          webviewPanel.webview.postMessage({
            type: 'confirmCompleteMerge',
            unresolvedCount,
          });
          return;
        }
        const result = await this.mergeOrchestrator.completeMerge(filePath, true);
        if (result.success) {
          webviewPanel.dispose();
          vscode.window.showInformationMessage('Git Enhanced: Merge completed and file staged.');
        } else {
          const detail = result.error ? ` ${result.error}` : '';
          vscode.window.showErrorMessage(
            `Git Enhanced: Failed to complete merge.${detail}`
          );
        }
        break;
      }

      case 'navigateConflict': {
        webviewPanel.webview.postMessage({
          type: 'jumpToConflict',
          direction: message.direction,
        });
        break;
      }

      case 'ready': {
        const session = this.mergeOrchestrator.getSession(filePath);
        if (session) {
          webviewPanel.webview.postMessage({
            type: 'init',
            chunks: session.chunks,
            originalContent: session.originalContent,
            fileName: path.basename(filePath),
          });
        }
        break;
      }
    }
  }

  private getWebviewContent(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    session: { chunks: unknown[]; originalContent: string }
  ): string {
    const webviewScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );

    // CSP nonce for security
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
    style-src 'unsafe-inline' https://cdn.jsdelivr.net;
    font-src https://cdn.jsdelivr.net;
    worker-src blob:;
  ">
  <title>Git Enhanced Merge Editor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; overflow: hidden; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
  </style>
  <script nonce="${nonce}">
    window.MonacoEnvironment = {
      getWorkerUrl: function(_moduleId, _label) {
        var blob = new Blob(['self.onmessage=function(){};'], {type: 'text/javascript'});
        return URL.createObjectURL(blob);
      }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js"></script>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__GIT_ENHANCED__ = {
      vscodeApi: acquireVsCodeApi(),
      initialChunkCount: ${session.chunks.length},
      language: ${JSON.stringify(document.languageId)}
    };
  </script>
  <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

interface WebviewMessage {
  type: string;
  startLine?: number;
  resolvedLines?: string[];
  forceComplete?: boolean;
  direction?: 'next' | 'prev';
}
