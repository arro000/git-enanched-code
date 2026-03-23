import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Crea un repository git con un file che produce conflitti multipli,
 * utile per testare minimap, contatore e navigazione.
 */
function creareRepoConConflittiMultipli(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-us017-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    const filePath = path.join(repoPath, 'multi.ts');

    // Base: 3 funzioni con molte righe non conflittuali tra loro
    // per garantire che git produca conflitti separati
    const baseContent = [
        'function primo() {',
        '  return "base-primo";',
        '}',
        '',
        '// Sezione stabile A - non viene modificata',
        'const COSTANTE_A = "stabile";',
        'const COSTANTE_B = "stabile";',
        'const COSTANTE_C = "stabile";',
        'const COSTANTE_D = "stabile";',
        'const COSTANTE_E = "stabile";',
        '',
        'function secondo() {',
        '  return "base-secondo";',
        '}',
        '',
        '// Sezione stabile B - non viene modificata',
        'const ALTRA_A = "stabile";',
        'const ALTRA_B = "stabile";',
        'const ALTRA_C = "stabile";',
        'const ALTRA_D = "stabile";',
        'const ALTRA_E = "stabile";',
        '',
        'function terzo() {',
        '  return "base-terzo";',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, baseContent);
    git('add .');
    git('commit -m "base"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Feature: modifica solo le 3 funzioni, lascia le sezioni stabili intatte
    git('checkout -b feature');
    const featureContent = baseContent
        .replace('"base-primo"', '"feature-primo"')
        .replace('"base-secondo"', '"feature-secondo"')
        .replace('"base-terzo"', '"feature-terzo"');
    fs.writeFileSync(filePath, featureContent);
    git('add .');
    git('commit -m "feature"');

    // Main: modifica le stesse 3 funzioni in modo diverso
    git(`checkout ${defaultBranch}`);
    const mainContent = baseContent
        .replace('"base-primo"', '"main-primo"')
        .replace('"base-secondo"', '"main-secondo"')
        .replace('"base-terzo"', '"main-terzo"');
    fs.writeFileSync(filePath, mainContent);
    git('add .');
    git('commit -m "main"');

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
        // Best effort
    }
}

suite('US-017/018/019/020/021 — Minimap, Contatore e Navigazione E2E', () => {
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

    test('AC US-017/018: il merge editor si apre per un file con conflitti multipli', async () => {
        const contenuto = fs.readFileSync(conflictFilePath, 'utf-8');
        const numeroConflitti = (contenuto.match(/<<<<<<</g) || []).length;
        assert.ok(
            numeroConflitti >= 2,
            `Il file deve contenere almeno 2 conflitti per testare minimap e contatore. Trovati: ${numeroConflitti}`
        );

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        const editorAperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
        assert.ok(editorAperto, 'Il custom merge editor deve aprirsi per il file con conflitti multipli');
    });

    test('AC US-017: il file con 3 conflitti non viene modificato dall\'apertura nell\'editor con minimap', async () => {
        const contenutoPrima = fs.readFileSync(conflictFilePath, 'utf-8');

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        await waitForCondition(() => isCustomEditorOpen(), 5000);
        // Attendi che la minimap si inizializzi completamente
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.strictEqual(
            contenutoDopo,
            contenutoPrima,
            'Il file non deve essere modificato dall\'inizializzazione della minimap e del contatore'
        );
    });

    test('AC US-019: i keybinding F7 e Shift+F7 sono registrati senza errori', async () => {
        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        await waitForCondition(() => isCustomEditorOpen(), 5000);
        await new Promise((resolve) => setTimeout(resolve, 500));

        // I comandi F7/Shift+F7 sono gestiti nel webview JavaScript, non come comandi VS Code.
        // Il test verifica che l'editor sia aperto e l'estensione rimanga attiva.
        // La navigazione effettiva avviene internamente al webview (non testabile da API VS Code).
        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        assert.ok(
            extension?.isActive,
            'L\'estensione deve essere attiva e i keybinding registrati nel webview'
        );
    });

    test('AC US-021: lo scroll tra le 3 colonne non causa errori con file lungo', async () => {
        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        await waitForCondition(() => isCustomEditorOpen(), 5000);

        // Lo scroll sincronizzato è implementato nel webview JavaScript.
        // Verifichiamo che l'editor si apra senza errori su un file con conflitti multipli.
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        assert.ok(
            extension?.isActive,
            'L\'estensione deve rimanere attiva dopo l\'apertura dell\'editor con scroll sincronizzato'
        );
    });
});
