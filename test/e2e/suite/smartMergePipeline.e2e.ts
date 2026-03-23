import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Crea un repo git con un merge conflict diff3-style (con base).
 * Produce un conflitto che diff3 potrebbe analizzare.
 */
function creareRepoConConflittoDiff3(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-us012-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    // Abilita diff3 per avere la base nei conflict markers
    git('config merge.conflictstyle diff3');

    const filePath = path.join(repoPath, 'modulo.ts');

    // Base: file con import e funzione
    const baseContent = [
        'import { existingModule } from "./existing";',
        '',
        'function calcola() {',
        '  return 42;',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, baseContent);
    git('add .');
    git('commit -m "base"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Feature: aggiunge import e funzione nuova
    git('checkout -b feature');
    const featureContent = [
        'import { existingModule } from "./existing";',
        'import { featureUtil } from "./feature-util";',
        '',
        'function calcola() {',
        '  return 42;',
        '}',
        '',
        'function nuovaFeature() {',
        '  return featureUtil();',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, featureContent);
    git('add .');
    git('commit -m "feature: aggiunge nuovaFeature"');

    // Main: aggiunge import e funzione diversa
    git(`checkout ${defaultBranch}`);
    const mainContent = [
        'import { existingModule } from "./existing";',
        'import { mainHelper } from "./main-helper";',
        '',
        'function calcola() {',
        '  return 42;',
        '}',
        '',
        'function helpFromMain() {',
        '  return mainHelper();',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, mainContent);
    git('add .');
    git('commit -m "main: aggiunge helpFromMain"');

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

suite('US-012/013/014 — Smart Merge Pipeline E2E (Diff3 + AST + Bacchetta magica)', () => {
    let repoPath: string;
    let conflictFilePath: string;

    suiteSetup(async () => {
        const repo = creareRepoConConflittoDiff3();
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

    test('AC1 US-012: il file TypeScript con conflitti diff3 viene aperto nel merge editor', async () => {
        const contenuto = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.ok(
            contenuto.includes('<<<<<<<'),
            'Il file deve contenere conflict markers generati dal merge'
        );

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        const editorAperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
        assert.ok(editorAperto, 'Il custom merge editor deve aprirsi per il file .ts con conflitti');
    });

    test('AC1 US-012: il conflitto diff3 contiene la sezione BASE (|||||||) per l\'analisi a 3 vie', async () => {
        const contenuto = fs.readFileSync(conflictFilePath, 'utf-8');
        // Con merge.conflictstyle=diff3, il file contiene la sezione |||||||
        assert.ok(
            contenuto.includes('|||||||'),
            'Il file deve contenere il marker ||||||| (base) per supportare l\'analisi diff3 a 3 vie'
        );
    });

    test('AC2 US-014: nessuna risoluzione automatica viene applicata prima del click sulla bacchetta magica', async () => {
        const contenutoPrima = fs.readFileSync(conflictFilePath, 'utf-8');

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        await waitForCondition(() => isCustomEditorOpen(), 5000);

        // Attendi che l'editor si stabilizzi e i layer di analisi completino
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Il file su disco NON deve essere stato modificato — le risoluzioni automatiche
        // devono restare pendenti fino al click sulla bacchetta magica
        const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.strictEqual(
            contenutoDopo,
            contenutoPrima,
            'Il file non deve essere modificato dall\'analisi automatica — le risoluzioni restano pendenti'
        );
    });

    test('AC3 US-012: l\'analisi diff3 si completa senza errori e l\'estensione resta attiva', async () => {
        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(conflictFilePath),
            'git-enhanced.mergeEditor'
        );

        await waitForCondition(() => isCustomEditorOpen(), 5000);

        // L'analisi Diff3 e AST avviene internamente all'apertura dell'editor
        // Verifichiamo che dopo 2 secondi l'estensione sia ancora attiva e funzionante
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        assert.ok(
            extension?.isActive,
            'L\'estensione deve rimanere attiva dopo l\'analisi diff3 + AST del file con conflitti'
        );
    });
});
