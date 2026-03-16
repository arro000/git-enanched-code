import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Crea un repository git temporaneo con un merge conflict reale.
 * Ritorna il path del repo e del file con i conflict markers.
 */
function creareRepoConMergeConflict(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-merge-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    const filePath = path.join(repoPath, 'conflitto.ts');

    // Commit base su main
    fs.writeFileSync(filePath, 'function saluta() {\n  return "ciao";\n}\n');
    git('add .');
    git('commit -m "commit base"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Branch feature con modifica
    git('checkout -b feature');
    fs.writeFileSync(filePath, 'function saluta() {\n  return "ciao dal feature";\n}\n');
    git('add .');
    git('commit -m "modifica feature"');

    // Torna su main, modifica conflittuale
    git(`checkout ${defaultBranch}`);
    fs.writeFileSync(filePath, 'function saluta() {\n  return "ciao dal main";\n}\n');
    git('add .');
    git('commit -m "modifica main"');

    // git merge feature — fallisce con conflitto
    try {
        git('merge feature');
    } catch {
        // Atteso: merge conflict
    }

    return { repoPath, conflictFilePath: filePath };
}

/**
 * Polling asincrono: attende che una condizione diventi true.
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
 * Verifica se un tab custom editor è aperto (TabInputCustom).
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

suite('Merge con conflitto — flusso completo E2E', () => {
    let repoPath: string;
    let conflictFilePath: string;

    suiteSetup(async () => {
        const repo = creareRepoConMergeConflict();
        repoPath = repo.repoPath;
        conflictFilePath = repo.conflictFilePath;

        // Assicura che l'estensione sia attiva
        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try {
            fs.rmSync(repoPath, { recursive: true, force: true });
        } catch {
            // Cleanup best-effort
        }
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('rileva i marker di conflitto nel file generato dal merge', () => {
        const contenuto = fs.readFileSync(conflictFilePath, 'utf-8');

        assert.ok(
            contenuto.includes('<<<<<<<'),
            'Il file deve contenere il marker <<<<<<< generato dal merge'
        );
        assert.ok(
            contenuto.includes('======='),
            'Il file deve contenere il marker ======= generato dal merge'
        );
        assert.ok(
            contenuto.includes('>>>>>>>'),
            'Il file deve contenere il marker >>>>>>> generato dal merge'
        );
    });

    test('apre il custom merge editor per il file con conflitti', async () => {
        const document = await vscode.workspace.openTextDocument(conflictFilePath);

        // Apre con il custom editor specifico dell'estensione
        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        const customEditorAperto = await waitForCondition(
            () => isCustomEditorOpen(),
            5000
        );

        assert.ok(
            customEditorAperto,
            'Il custom merge editor (TabInputCustom) dovrebbe aprirsi per un file con conflitti reali'
        );
    });

    test('il file conflittuale non viene alterato all\'apertura nell\'editor', async () => {
        const contenutoPrima = fs.readFileSync(conflictFilePath, 'utf-8');

        // Apre il file nel custom merge editor
        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        await waitForCondition(
            () => isCustomEditorOpen(),
            5000
        );

        // Piccola attesa per dare tempo all'editor di stabilizzarsi
        await new Promise((resolve) => setTimeout(resolve, 500));

        const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');

        assert.strictEqual(
            contenutoDopo,
            contenutoPrima,
            'Il contenuto del file non deve cambiare dopo l\'apertura nel merge editor'
        );
    });
});
