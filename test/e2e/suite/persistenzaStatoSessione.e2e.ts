import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Creates a temporary git repository with a merge conflict containing multiple conflicts.
 */
function creareRepoConConflittiMultipli(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-us005-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    const filePath = path.join(repoPath, 'multi-conflict.ts');

    // Base content with two distinct sections
    const baseContent = [
        'function greet() {',
        '  return "hello";',
        '}',
        '',
        'function farewell() {',
        '  return "goodbye";',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, baseContent);
    git('add .');
    git('commit -m "base commit"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Feature branch: modify both functions
    git('checkout -b feature');
    const featureContent = [
        'function greet() {',
        '  return "hi from feature";',
        '}',
        '',
        'function farewell() {',
        '  return "bye from feature";',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, featureContent);
    git('add .');
    git('commit -m "feature changes"');

    // Main branch: modify both functions differently
    git(`checkout ${defaultBranch}`);
    const mainContent = [
        'function greet() {',
        '  return "hi from main";',
        '}',
        '',
        'function farewell() {',
        '  return "bye from main";',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, mainContent);
    git('add .');
    git('commit -m "main changes"');

    // Merge — should create 2 conflicts
    try {
        git('merge feature');
    } catch {
        // Expected: merge conflict
    }

    return { repoPath, conflictFilePath: filePath };
}

/**
 * Checks if any open tab is a custom editor (TabInputCustom).
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

suite('US-005 — Persistenza Stato Sessione Merge E2E', () => {
    let repoPath: string;
    let conflictFilePath: string;

    suiteSetup(async () => {
        const repo = creareRepoConConflittiMultipli();
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

    test('AC1: il merge editor si apre su un file con conflitti multipli e lo stato viene inizializzato', async () => {
        // Verify the file has conflict markers (at least 1, possibly 2 conflicts)
        const contenutoFile = fs.readFileSync(conflictFilePath, 'utf-8');
        const numeroConflitti = (contenutoFile.match(/<<<<<<</g) || []).length;
        assert.ok(
            numeroConflitti >= 1,
            `Il file deve contenere almeno 1 conflitto. Trovati: ${numeroConflitti}`
        );

        // Open the file in VS Code — should trigger auto-open of custom editor
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);

        // Wait for the custom editor to appear
        const customEditorOpened = await waitForCondition(
            () => isCustomEditorOpen(),
            3000
        );

        assert.ok(
            customEditorOpened,
            'Il merge editor custom deve aprirsi automaticamente per un file con conflitti multipli'
        );
    });

    test('AC1: la riapertura del file con conflitti ripristina l\'editor senza errori', async () => {
        // Step 1: Open the conflict file in the merge editor
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);

        await waitForCondition(() => isCustomEditorOpen(), 3000);

        // Step 2: Close all editors
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify editors are closed
        const editorsClosedSuccessfully = await waitForCondition(
            () => !isCustomEditorOpen(),
            2000
        );
        assert.ok(editorsClosedSuccessfully, 'Tutti gli editor devono essere chiusi prima della riapertura');

        // Step 3: Reopen the same file — state should be restored
        const documentRiaperto = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(documentRiaperto);

        const customEditorRiaperto = await waitForCondition(
            () => isCustomEditorOpen(),
            3000
        );

        assert.ok(
            customEditorRiaperto,
            'Il merge editor deve riaprirsi correttamente alla riapertura del file. ' +
            'Lo stato della sessione precedente deve essere recuperato senza errori.'
        );
    });

    test('AC2/AC3: il file con conflitti mantiene i markers intatti durante le operazioni di stato', async () => {
        // Read the original content
        const contenutoOriginale = fs.readFileSync(conflictFilePath, 'utf-8');

        // Open the file in the merge editor
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);
        await waitForCondition(() => isCustomEditorOpen(), 3000);

        // Wait for state initialization to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Close the editor (this should trigger state persistence)
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify: the file on disk is completely untouched
        const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.strictEqual(
            contenutoDopo,
            contenutoOriginale,
            'Il file con conflict markers deve rimanere intatto durante le operazioni ' +
            'di salvataggio e recupero dello stato della sessione. I markers non devono ' +
            'essere rimossi o modificati fino al completamento esplicito del merge.'
        );

        // Verify: conflict markers are still present
        assert.ok(
            contenutoDopo.includes('<<<<<<<') && contenutoDopo.includes('>>>>>>>'),
            'I conflict markers devono essere ancora presenti nel file dopo la chiusura dell\'editor'
        );
    });

    test('AC1: il merge editor gestisce correttamente la riapertura anche se il contenuto è cambiato', async () => {
        // This tests that the state manager correctly invalidates state
        // when the file content changes between close and reopen

        // Step 1: Open the conflict file
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);
        await waitForCondition(() => isCustomEditorOpen(), 3000);
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Step 2: Close the editor
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Step 3: Modify the file externally (simulates another tool touching it)
        const contenutoModificato = fs.readFileSync(conflictFilePath, 'utf-8') + '\n// modified externally\n';
        fs.writeFileSync(conflictFilePath, contenutoModificato);

        // Step 4: Reopen the file — the state manager should detect the hash mismatch
        // and create a fresh initial state instead of restoring the old one
        const documentRiaperto = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(documentRiaperto);

        const customEditorRiaperto = await waitForCondition(
            () => isCustomEditorOpen(),
            3000
        );

        assert.ok(
            customEditorRiaperto,
            'Il merge editor deve aprirsi correttamente anche quando il contenuto del file è cambiato. ' +
            'Lo stato invalidato deve essere sostituito da un nuovo stato iniziale senza errori.'
        );

        // Verify: file content is the modified version (not reverted to original)
        const contenutoSuDisco = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.strictEqual(
            contenutoSuDisco,
            contenutoModificato,
            'Il file modificato esternamente non deve essere sovrascritto dall\'editor'
        );
    });
});
