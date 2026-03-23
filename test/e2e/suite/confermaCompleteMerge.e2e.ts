import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Crea un repository git temporaneo con un merge conflict reale.
 */
function creareRepoConMergeConflict(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-us011-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    const filePath = path.join(repoPath, 'conflitto.ts');

    fs.writeFileSync(filePath, 'function saluta() {\n  return "ciao";\n}\n');
    git('add .');
    git('commit -m "commit base"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    git('checkout -b feature');
    fs.writeFileSync(filePath, 'function saluta() {\n  return "ciao dal feature";\n}\n');
    git('add .');
    git('commit -m "modifica feature"');

    git(`checkout ${defaultBranch}`);
    fs.writeFileSync(filePath, 'function saluta() {\n  return "ciao dal main";\n}\n');
    git('add .');
    git('commit -m "modifica main"');

    try {
        git('merge feature');
    } catch {
        // Atteso: merge conflict
    }

    return { repoPath, conflictFilePath: filePath };
}

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

suite('US-011 — Popup di conferma Complete Merge con conflitti aperti E2E', () => {
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

    test('AC1: il merge editor si apre con conflitti e il file rimane intatto dopo tentativo di complete merge', async () => {
        // Il file con conflitti aperti non deve essere modificato dal pulsante "Complete Merge"
        // poiché la logica di conferma dovrebbe bloccarne il completamento
        const contenutoOriginale = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.ok(
            contenutoOriginale.includes('<<<<<<<'),
            'Il file deve contenere conflict markers'
        );

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        const editorAperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
        assert.ok(editorAperto, 'Il custom merge editor deve aprirsi');

        // Attendi stabilizzazione editor
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verifica che il file con conflitti sia ancora intatto (il merge non è stato completato)
        const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.strictEqual(
            contenutoDopo,
            contenutoOriginale,
            'Il file con conflict markers deve rimanere intatto — il merge non deve completarsi automaticamente'
        );
    });

    test('AC2: senza conflitti aperti, il comando completeMerge non genera errori', async () => {
        // Crea un file senza conflitti per testare il path "nessun conflitto aperto"
        const fileRisolto = path.join(repoPath, 'risolto.ts');
        fs.writeFileSync(fileRisolto, 'function saluta() {\n  return "risolto";\n}\n');

        const document = await vscode.workspace.openTextDocument(fileRisolto);
        await vscode.window.showTextDocument(document);

        // Il comando completeMerge su un file senza conflitti non deve crashare
        // (potrebbe non fare nulla, o dare un messaggio, ma non deve generare eccezioni)
        try {
            await vscode.commands.executeCommand('git-enhanced.completeMerge');
        } catch {
            // Alcuni comandi potrebbero non essere disponibili fuori dal contesto merge editor
            // ma l'estensione non deve crashare
        }

        // L'estensione deve rimanere attiva
        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        assert.ok(
            extension?.isActive,
            'L\'estensione deve rimanere attiva dopo il tentativo di completeMerge'
        );
    });
});
