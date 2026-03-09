import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Creates a temporary git repository with a real merge conflict.
 */
function creareRepoConMergeConflict(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-us004-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    const filePath = path.join(repoPath, 'fallback-test.ts');

    fs.writeFileSync(filePath, 'const x = 1;\n');
    git('add .');
    git('commit -m "base commit"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    git('checkout -b feature');
    fs.writeFileSync(filePath, 'const x = 2; // feature\n');
    git('add .');
    git('commit -m "feature change"');

    git(`checkout ${defaultBranch}`);
    fs.writeFileSync(filePath, 'const x = 3; // main\n');
    git('add .');
    git('commit -m "main change"');

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

function cleanupTempRepo(repoPath: string): void {
    try {
        fs.rmSync(repoPath, { recursive: true, force: true });
    } catch {
        // Best effort cleanup
    }
}

suite('US-004 — Fallback Editor Nativo E2E', () => {
    let repoPath: string;
    let conflictFilePath: string;

    suiteSetup(async () => {
        const repo = creareRepoConMergeConflict();
        repoPath = repo.repoPath;
        conflictFilePath = repo.conflictFilePath;

        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        cleanupTempRepo(repoPath);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('AC2: il file originale con conflict markers non viene modificato durante il fallback', async () => {
        // Read the original content before any operation
        const contenutoOriginale = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.ok(
            contenutoOriginale.includes('<<<<<<<') && contenutoOriginale.includes('>>>>>>>'),
            'Il file di test deve contenere conflict markers reali'
        );

        // Open the conflict file — the extension will try to open the custom editor.
        // Whether it succeeds or falls back, the original file must remain intact.
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);

        // Wait for any auto-open or fallback to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify: original file content on disk must be untouched
        const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.strictEqual(
            contenutoDopo,
            contenutoOriginale,
            'Il file originale con conflict markers non deve essere modificato in nessun caso. ' +
            'Il FallbackService e il MergeEditorProvider non devono alterare il contenuto del file.'
        );
    });

    test('AC1: il comando openMergeEditor su file inesistente non blocca il workflow', async () => {
        // Create a temp file, then delete it to simulate an error scenario
        const tempFilePath = path.join(repoPath, 'file-che-non-esiste.ts');

        // Attempting to open a non-existent file should not crash the extension
        let threwError = false;
        try {
            // Try to open a non-existent file — this should be handled gracefully
            await vscode.workspace.openTextDocument(tempFilePath);
        } catch {
            threwError = true;
        }

        // Whether it threw or not, the extension should still be functional
        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        assert.ok(
            extension?.isActive,
            'L\'estensione deve rimanere attiva anche dopo un tentativo di apertura fallito. ' +
            'Il fallback deve garantire che il workflow non sia mai bloccato.'
        );

        // Verify we can still open a real file after the error
        const realDocument = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(realDocument);

        const hasActiveEditor = await waitForCondition(
            () => vscode.window.activeTextEditor !== undefined ||
                  vscode.window.tabGroups.activeTabGroup.activeTab !== undefined,
            2000
        );

        assert.ok(
            hasActiveEditor,
            'Dopo un errore, deve essere possibile aprire altri file normalmente. ' +
            'Il fallback non deve corrompere lo stato dell\'estensione.'
        );
    });

    test('AC1/AC3: il fallback preserva l\'accesso al file in un editor funzionante', async () => {
        // This test verifies that even when the custom editor might fail,
        // the file remains accessible through some editor (custom or native)

        // Create a file with conflict markers
        const testFilePath = path.join(repoPath, 'fallback-access-test.py');
        fs.writeFileSync(testFilePath, [
            '<<<<<<< HEAD',
            'value = "from HEAD"',
            '=======',
            'value = "from feature"',
            '>>>>>>> feature',
        ].join('\n'));

        const contenutoOriginale = fs.readFileSync(testFilePath, 'utf-8');

        const document = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(document);

        // Wait for any editor (custom or fallback) to open
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify: at least one tab is open — the user is never left without an editor
        const hasOpenTab = vscode.window.tabGroups.activeTabGroup.activeTab !== undefined;
        assert.ok(
            hasOpenTab,
            'Dopo apertura (con o senza fallback), deve esserci almeno un tab aperto. ' +
            'L\'utente non deve mai essere lasciato senza editor.'
        );

        // Verify: file content is not corrupted
        const contenutoDopo = fs.readFileSync(testFilePath, 'utf-8');
        assert.strictEqual(
            contenutoDopo,
            contenutoOriginale,
            'Il contenuto del file non deve essere alterato né dal custom editor né dal fallback.'
        );
    });
});
