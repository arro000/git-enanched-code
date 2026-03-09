import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Creates a temporary git repository with a real merge conflict.
 * Returns the path to the file containing conflict markers.
 */
function createRepoWithMergeConflict(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    // Initialize repo with a base file
    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    const filePath = path.join(repoPath, 'conflict.ts');

    // Base commit
    fs.writeFileSync(filePath, 'function greet() {\n  return "hello";\n}\n');
    git('add .');
    git('commit -m "base commit"');

    // Detect the default branch name (main or master) before creating feature branch
    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Create feature branch and modify
    git('checkout -b feature');
    fs.writeFileSync(filePath, 'function greet() {\n  return "hello from feature";\n}\n');
    git('add .');
    git('commit -m "feature change"');

    // Go back to the initial branch and make a conflicting change
    git(`checkout ${defaultBranch}`);
    fs.writeFileSync(filePath, 'function greet() {\n  return "hello from main";\n}\n');
    git('add .');
    git('commit -m "main change"');

    // Merge — this will fail with a conflict
    try {
        git('merge feature');
    } catch {
        // Expected: merge conflict
    }

    return { repoPath, conflictFilePath: filePath };
}

/**
 * Waits for a condition to become true, polling at the given interval.
 */
async function waitForCondition(
    conditionFn: () => boolean,
    timeoutMs: number,
    pollIntervalMs: number = 50
): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        if (conditionFn()) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return conditionFn();
}

/**
 * Checks if any open tab is a custom editor for the Git Enhanced merge editor.
 * A CustomTextEditorProvider produces TabInputCustom tabs, not TabInputWebview.
 */
function isCustomEditorOpen(): boolean {
    for (const tabGroup of vscode.window.tabGroups.all) {
        for (const tab of tabGroup.tabs) {
            if (tab.input instanceof vscode.TabInputCustom) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Cleans up a temporary directory recursively.
 */
function cleanupTempRepo(repoPath: string): void {
    try {
        fs.rmSync(repoPath, { recursive: true, force: true });
    } catch {
        // Best effort cleanup
    }
}

suite('US-001 — Merge Editor Auto-Open E2E', () => {
    let repoPath: string;
    let conflictFilePath: string;

    suiteSetup(async () => {
        const repo = createRepoWithMergeConflict();
        repoPath = repo.repoPath;
        conflictFilePath = repo.conflictFilePath;

        // Ensure our extension is activated before running tests.
        // The activation event is onStartupFinished, but it may not have fired yet.
        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    suiteTeardown(async () => {
        // Close all editors before cleanup
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        cleanupTempRepo(repoPath);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('AC1: il merge editor custom si apre entro 500ms quando si apre un file con conflict markers', async () => {
        // Verify the file actually has conflict markers
        const fileContent = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.ok(
            fileContent.includes('<<<<<<<') && fileContent.includes('>>>>>>>'),
            'Il file di test deve contenere conflict markers reali generati da git merge'
        );

        // Open the document in VS Code
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        const startTime = Date.now();
        await vscode.window.showTextDocument(document);

        // Wait for the custom editor to appear (the extension should auto-open it)
        const customEditorOpened = await waitForCondition(
            () => isCustomEditorOpen(),
            2000 // generous timeout — we measure actual elapsed time separately
        );

        const elapsedMs = Date.now() - startTime;

        assert.ok(
            customEditorOpened,
            'Il merge editor custom (WebviewPanel) non si è aperto automaticamente. ' +
            'Il tab attivo non è un custom editor.'
        );

        assert.ok(
            elapsedMs < 500,
            `Il merge editor custom si è aperto in ${elapsedMs}ms, ` +
            `superando il limite di 500ms previsto dal criterio di accettazione AC1.`
        );
    });

    test('AC2: in modalità manual, il merge editor custom NON si apre automaticamente', async () => {
        // Switch to manual mode
        const config = vscode.workspace.getConfiguration('gitEnhanced');
        await config.update('activationMode', 'manual', vscode.ConfigurationTarget.Global);

        // Small delay to let the config change propagate
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Open the conflict file
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);

        // Wait briefly — the custom editor should NOT appear
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const isPlainTextEditor =
            activeTab?.input instanceof vscode.TabInputText;

        assert.ok(
            isPlainTextEditor,
            'In modalità manual, il file dovrebbe aprirsi nell\'editor di testo standard, ' +
            'non nel merge editor custom.'
        );

        // Restore auto mode
        await config.update('activationMode', 'auto', vscode.ConfigurationTarget.Global);
    });

    test('AC2: in modalità manual, il merge editor è invocabile da Command Palette', async () => {
        // Switch to manual mode
        const config = vscode.workspace.getConfiguration('gitEnhanced');
        await config.update('activationMode', 'manual', vscode.ConfigurationTarget.Global);
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Open conflict file as plain text first
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Now invoke the command manually (simulates Command Palette usage)
        await vscode.commands.executeCommand('git-enhanced.openMergeEditor');

        // The custom editor should open
        const customEditorOpened = await waitForCondition(
            () => isCustomEditorOpen(),
            2000
        );

        assert.ok(
            customEditorOpened,
            'Il comando git-enhanced.openMergeEditor dalla Command Palette ' +
            'dovrebbe aprire il merge editor custom anche in modalità manual.'
        );

        // Restore auto mode
        await config.update('activationMode', 'auto', vscode.ConfigurationTarget.Global);
    });

    test('AC3: l\'intercettazione funziona su qualsiasi file con conflict markers (non solo .ts)', async () => {
        // Create a separate file with a different extension to verify the interception
        // is based on conflict markers, not file type. We use a NEW file to ensure
        // onDidOpenTextDocument fires (VS Code caches already-opened documents).
        const secondConflictFile = path.join(repoPath, 'another-conflict.py');
        fs.writeFileSync(secondConflictFile, [
            '<<<<<<< HEAD',
            'x = 1',
            '=======',
            'x = 2',
            '>>>>>>> feature',
        ].join('\n'));

        const document = await vscode.workspace.openTextDocument(secondConflictFile);
        await vscode.window.showTextDocument(document);

        const customEditorOpened = await waitForCondition(
            () => isCustomEditorOpen(),
            2000
        );

        assert.ok(
            customEditorOpened,
            'Il merge editor custom dovrebbe aprirsi automaticamente per qualsiasi file ' +
            'contenente i conflict markers (<<<<<<<, =======, >>>>>>>), indipendentemente dall\'estensione.'
        );
    });
});
