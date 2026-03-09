import * as vscode from 'vscode';
import { MergeOrchestrator } from '../../core/git/MergeOrchestrator';
import { ConfigManager } from '../../config/ConfigManager';
import { MergeEditorProvider } from '../MergeEditorProvider';

export class RegisterCommands {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly _mergeOrchestrator: MergeOrchestrator,
    private readonly configManager: ConfigManager
  ) {}

  register(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('gitEnhanced.openMergeEditor', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showErrorMessage('Git Enhanced: No active editor.');
          return;
        }
        vscode.commands.executeCommand(
          'vscode.openWith',
          activeEditor.document.uri,
          MergeEditorProvider.viewType
        );
      }),

      vscode.commands.registerCommand('gitEnhanced.openOnboarding', () => {
        const panel = vscode.window.createWebviewPanel(
          'gitEnhanced.onboarding',
          'Git Enhanced - Welcome',
          vscode.ViewColumn.One,
          { enableScripts: true }
        );
        panel.webview.html = this.getOnboardingHtml(panel.webview);
        panel.webview.onDidReceiveMessage(async (message) => {
          if (message.type === 'setOpenMode') {
            await this.configManager.setOpenMode(message.mode);
          }
          if (message.type === 'complete' || message.type === 'skip') {
            await this.configManager.markOnboardingCompleted();
            panel.dispose();
          }
        });
      }),

      vscode.commands.registerCommand('gitEnhanced.completeMerge', () => {
        // Handled via webview message
        vscode.commands.executeCommand('gitEnhanced.webview.completeMerge');
      }),

      vscode.commands.registerCommand('gitEnhanced.nextConflict', () => {
        vscode.commands.executeCommand('gitEnhanced.webview.nextConflict');
      }),

      vscode.commands.registerCommand('gitEnhanced.prevConflict', () => {
        vscode.commands.executeCommand('gitEnhanced.webview.prevConflict');
      })
    );
  }

  private getOnboardingHtml(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git Enhanced - Welcome</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 40px;
      max-width: 600px;
      margin: 0 auto;
    }
    h1 { font-size: 1.8em; margin-bottom: 0.5em; }
    h2 { font-size: 1.3em; margin: 1.5em 0 0.5em; }
    p { line-height: 1.6; margin-bottom: 1em; }
    .step { display: none; }
    .step.active { display: block; }
    .layout-preview {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin: 16px 0;
      font-size: 0.85em;
    }
    .col {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 8px;
      border-radius: 4px;
      text-align: center;
    }
    .col.center { background: var(--vscode-editor-selectionBackground); }
    .shortcut-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .key { font-family: monospace; background: var(--vscode-button-secondaryBackground); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; }
    .btn { padding: 8px 20px; margin: 4px; cursor: pointer; border: none; border-radius: 4px; font-size: 0.95em; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .actions { margin-top: 24px; display: flex; justify-content: space-between; align-items: center; }
    .mode-options { display: flex; gap: 12px; margin: 16px 0; }
    .mode-card { flex: 1; padding: 12px; border: 2px solid var(--vscode-panel-border); border-radius: 6px; cursor: pointer; }
    .mode-card.selected { border-color: var(--vscode-focusBorder); }
    .step-indicator { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  </style>
</head>
<body>
  <div id="step-1" class="step active">
    <span class="step-indicator">1 / 3</span>
    <h1>Welcome to Git Enhanced</h1>
    <p>A professional 3-column merge editor that brings IntelliJ-quality conflict resolution to VS Code.</p>
    <div class="layout-preview">
      <div class="col">HEAD<br><small>Your code</small></div>
      <div class="col center">RESULT<br><small>Editable</small></div>
      <div class="col">MERGING<br><small>Incoming</small></div>
    </div>
    <p>Use <strong>&gt;&gt;</strong> and <strong>&lt;&lt;</strong> to apply chunks from either side, or edit the center column directly.</p>
    <div class="actions">
      <button class="btn btn-secondary" onclick="skip()">Skip</button>
      <button class="btn btn-primary" onclick="goTo(2)">Next &rarr;</button>
    </div>
  </div>

  <div id="step-2" class="step">
    <span class="step-indicator">2 / 3</span>
    <h2>How should the editor open?</h2>
    <div class="mode-options">
      <div class="mode-card selected" id="mode-auto" onclick="selectMode('automatic')">
        <strong>Automatic</strong><br>
        <small>Opens automatically when merge conflicts are detected</small>
      </div>
      <div class="mode-card" id="mode-manual" onclick="selectMode('manual')">
        <strong>Manual</strong><br>
        <small>Only opens via Command Palette</small>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" onclick="skip()">Skip</button>
      <button class="btn btn-primary" onclick="goTo(3)">Next &rarr;</button>
    </div>
  </div>

  <div id="step-3" class="step">
    <span class="step-indicator">3 / 3</span>
    <h2>Keyboard Shortcuts</h2>
    <div class="shortcut-row"><span>Next conflict</span><span class="key">F7</span></div>
    <div class="shortcut-row"><span>Previous conflict</span><span class="key">Shift+F7</span></div>
    <div class="shortcut-row"><span>Apply left chunk</span><span class="key">&gt;&gt;</span></div>
    <div class="shortcut-row"><span>Apply right chunk</span><span class="key">&lt;&lt;</span></div>
    <div class="shortcut-row"><span>Discard chunk</span><span class="key">x</span></div>
    <p style="margin-top: 16px; color: var(--vscode-descriptionForeground); font-size: 0.85em;">
      Reopen this guide anytime: <em>Git Enhanced: Open Onboarding</em>
    </p>
    <div class="actions">
      <span></span>
      <button class="btn btn-primary" onclick="complete()">Get Started</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let selectedMode = 'automatic';

    function goTo(step) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('step-' + step).classList.add('active');
    }

    function selectMode(mode) {
      selectedMode = mode;
      document.getElementById('mode-auto').classList.toggle('selected', mode === 'automatic');
      document.getElementById('mode-manual').classList.toggle('selected', mode === 'manual');
      vscode.postMessage({ type: 'setOpenMode', mode });
    }

    function complete() {
      vscode.postMessage({ type: 'complete' });
    }

    function skip() {
      vscode.postMessage({ type: 'skip' });
    }
  </script>
</body>
</html>`;
  }
}
