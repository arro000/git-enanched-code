import * as vscode from 'vscode';
import { MergeEditorProvider } from './ui/MergeEditorProvider';
import { RegisterCommands } from './ui/commands/RegisterCommands';
import { ConfigManager } from './config/ConfigManager';
import { GitService } from './core/git/GitService';
import { MergeOrchestrator } from './core/git/MergeOrchestrator';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Git Enhanced');
  context.subscriptions.push(outputChannel);

  const configManager = new ConfigManager(context);
  const gitService = new GitService();
  const mergeOrchestrator = new MergeOrchestrator(gitService);
  const mergeEditorProvider = new MergeEditorProvider(
    context,
    mergeOrchestrator,
    configManager,
    outputChannel
  );

  // Register custom editor provider
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MergeEditorProvider.viewType,
      mergeEditorProvider,
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Register all commands
  const commands = new RegisterCommands(context, mergeOrchestrator, configManager);
  commands.register();

  // Initialize git service with the first workspace folder
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    gitService.initialize(workspaceFolders[0].uri.fsPath).catch((err) => {
      console.error('[Git Enhanced] Failed to initialize GitService:', err);
    });
  }

  // Intercept merge conflict files when in automatic mode
  if (configManager.getOpenMode() === 'automatic') {
    registerMergeConflictInterceptor(context, mergeOrchestrator, outputChannel);
  }

  // Show onboarding wizard on first launch
  if (configManager.shouldShowOnboarding()) {
    vscode.commands.executeCommand('gitEnhanced.openOnboarding');
  }
}

function registerMergeConflictInterceptor(
  context: vscode.ExtensionContext,
  mergeOrchestrator: MergeOrchestrator,
  outputChannel: vscode.OutputChannel
): void {
  // Watch for files being opened that have conflict markers
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (mergeOrchestrator.hasConflictMarkers(document.getText())) {
        try {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            document.uri,
            MergeEditorProvider.viewType
          );
        } catch (error) {
          // Fallback to native editor - do not block user workflow (RNF-04)
          outputChannel.appendLine(
            `[Error] Failed to redirect to merge editor: ${error}`
          );
        }
      }
    })
  );
}

export function deactivate(): void {
  // Cleanup is handled via context.subscriptions
}
