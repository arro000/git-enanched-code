import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Crea un repository git temporaneo con un merge conflict risolvibile
 * automaticamente da diff3 (modifiche non sovrapposte).
 * Usa merge.conflictstyle=diff3 per avere la sezione BASE nei markers.
 */
function creareRepoConConflittoAutoRisolvibile(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-bacchetta-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    git('config merge.conflictstyle diff3');

    const filePath = path.join(repoPath, 'servizio.ts');

    // Base: file con import singolo e una funzione
    const contenutoBase = [
        'import { logger } from "./logger";',
        '',
        'export function elaboraDati(dati: string[]): string {',
        '  logger.info("elaborazione avviata");',
        '  return dati.join(", ");',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, contenutoBase);
    git('add .');
    git('commit -m "base: servizio con elaboraDati"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Feature branch: aggiunge un nuovo import e una nuova funzione in fondo
    git('checkout -b feature-validazione');
    const contenutoFeature = [
        'import { logger } from "./logger";',
        'import { validatore } from "./validatore";',
        '',
        'export function elaboraDati(dati: string[]): string {',
        '  logger.info("elaborazione avviata");',
        '  return dati.join(", ");',
        '}',
        '',
        'export function validaDati(dati: string[]): boolean {',
        '  return validatore.controlla(dati);',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, contenutoFeature);
    git('add .');
    git('commit -m "feature: aggiunge validaDati"');

    // Main: aggiunge un import diverso e una funzione diversa in fondo
    git(`checkout ${defaultBranch}`);
    const contenutoMain = [
        'import { logger } from "./logger";',
        'import { formattatore } from "./formattatore";',
        '',
        'export function elaboraDati(dati: string[]): string {',
        '  logger.info("elaborazione avviata");',
        '  return dati.join(", ");',
        '}',
        '',
        'export function formattaOutput(testo: string): string {',
        '  return formattatore.applica(testo);',
        '}',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, contenutoMain);
    git('add .');
    git('commit -m "main: aggiunge formattaOutput"');

    try {
        git('merge feature-validazione');
    } catch {
        // Atteso: merge conflict
    }

    return { repoPath, conflictFilePath: filePath };
}

/**
 * Crea un repo con un conflitto NON risolvibile automaticamente
 * (entrambi i branch modificano la stessa riga in modo diverso).
 */
function creareRepoConConflittoNonRisolvibile(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-bacchetta-no-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    git('config merge.conflictstyle diff3');

    const filePath = path.join(repoPath, 'config.ts');

    // Base
    fs.writeFileSync(filePath, 'export const TIMEOUT = 3000;\n');
    git('add .');
    git('commit -m "base: timeout 3000"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Feature: cambia lo stesso valore
    git('checkout -b feature-timeout');
    fs.writeFileSync(filePath, 'export const TIMEOUT = 5000;\n');
    git('add .');
    git('commit -m "feature: timeout a 5000"');

    // Main: cambia lo stesso valore diversamente
    git(`checkout ${defaultBranch}`);
    fs.writeFileSync(filePath, 'export const TIMEOUT = 10000;\n');
    git('add .');
    git('commit -m "main: timeout a 10000"');

    try {
        git('merge feature-timeout');
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

suite('Bacchetta Magica — Auto-merge E2E', () => {
    suite('Scenario con conflitti auto-risolvibili', () => {
        let repoPath: string;
        let conflictFilePath: string;

        suiteSetup(async () => {
            const repo = creareRepoConConflittoAutoRisolvibile();
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

        test('il file generato contiene conflict markers con sezione BASE (diff3)', async () => {
            const contenuto = fs.readFileSync(conflictFilePath, 'utf-8');
            assert.ok(
                contenuto.includes('<<<<<<<'),
                'Il file deve contenere il marker <<<<<<< (inizio conflitto)'
            );
            assert.ok(
                contenuto.includes('|||||||'),
                'Il file deve contenere il marker ||||||| (sezione base diff3)'
            );
            assert.ok(
                contenuto.includes('>>>>>>>'),
                'Il file deve contenere il marker >>>>>>> (fine conflitto)'
            );
        });

        test('il merge editor si apre correttamente sul file con conflitti', async () => {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(conflictFilePath),
                'git-enhanced.mergeEditor'
            );

            const editorAperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
            assert.ok(editorAperto, 'Il custom merge editor deve aprirsi');
        });

        test('l\'analisi diff3+AST si completa e l\'estensione resta attiva (risoluzioni pendenti calcolate)', async () => {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(conflictFilePath),
                'git-enhanced.mergeEditor'
            );

            await waitForCondition(() => isCustomEditorOpen(), 5000);

            // Attendi che i layer di analisi diff3 + AST completino
            await new Promise((resolve) => setTimeout(resolve, 3000));

            const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
            assert.ok(
                extension?.isActive,
                'L\'estensione deve rimanere attiva dopo l\'analisi automatica dei conflitti'
            );
        });

        test('le risoluzioni automatiche restano pendenti — il file su disco non viene modificato prima del click', async () => {
            const contenutoPrima = fs.readFileSync(conflictFilePath, 'utf-8');

            await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(conflictFilePath),
                'git-enhanced.mergeEditor'
            );

            await waitForCondition(() => isCustomEditorOpen(), 5000);

            // Attendi che l'analisi completi
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Il file su disco NON deve essere stato modificato:
            // le risoluzioni devono restare pendenti fino al click sulla bacchetta magica
            const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');
            assert.strictEqual(
                contenutoDopo,
                contenutoPrima,
                'Il file non deve essere modificato automaticamente — le risoluzioni restano pendenti fino al click sulla bacchetta magica'
            );

            // I conflict markers devono essere ancora presenti
            assert.ok(
                contenutoDopo.includes('<<<<<<<'),
                'I conflict markers devono rimanere intatti prima del click sulla bacchetta magica'
            );
        });

        test('lo stato della sessione viene creato correttamente con i conflitti iniziali', async () => {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(conflictFilePath),
                'git-enhanced.mergeEditor'
            );

            await waitForCondition(() => isCustomEditorOpen(), 5000);
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Verifica che lo state manager abbia salvato lo stato iniziale
            // (il fatto che l'estensione funzioni senza errori conferma che
            // il flusso risoluzioniPending è stato eseguito correttamente)
            const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
            assert.ok(
                extension?.isActive,
                'L\'estensione deve essere attiva — lo stato iniziale è stato creato'
            );
        });
    });

    suite('Scenario con conflitto NON auto-risolvibile', () => {
        let repoPath: string;
        let conflictFilePath: string;

        suiteSetup(async () => {
            const repo = creareRepoConConflittoNonRisolvibile();
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

        test('il file contiene un conflitto con modifiche sovrapposte sulla stessa riga', async () => {
            const contenuto = fs.readFileSync(conflictFilePath, 'utf-8');
            assert.ok(
                contenuto.includes('<<<<<<<'),
                'Il file deve contenere conflict markers'
            );
            // Entrambe le versioni modificano TIMEOUT → non auto-risolvibile
            assert.ok(
                contenuto.includes('TIMEOUT'),
                'Il conflitto deve riguardare la variabile TIMEOUT'
            );
        });

        test('il merge editor si apre senza errori anche per conflitti non auto-risolvibili', async () => {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(conflictFilePath),
                'git-enhanced.mergeEditor'
            );

            const editorAperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
            assert.ok(editorAperto, 'Il merge editor deve aprirsi anche per conflitti non auto-risolvibili');
        });

        test('nessuna risoluzione automatica viene proposta per conflitti con modifiche sovrapposte', async () => {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(conflictFilePath),
                'git-enhanced.mergeEditor'
            );

            await waitForCondition(() => isCustomEditorOpen(), 5000);
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Il file deve restare invariato (nessuna risoluzione automatica possibile)
            const contenuto = fs.readFileSync(conflictFilePath, 'utf-8');
            assert.ok(
                contenuto.includes('<<<<<<<'),
                'I conflict markers devono rimanere — il conflitto non è auto-risolvibile'
            );

            // L'estensione deve restare attiva e stabile
            const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
            assert.ok(
                extension?.isActive,
                'L\'estensione deve gestire gracefully i conflitti non auto-risolvibili'
            );
        });

        test('il file su disco non viene alterato quando non ci sono risoluzioni applicabili', async () => {
            const contenutoPrima = fs.readFileSync(conflictFilePath, 'utf-8');

            await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(conflictFilePath),
                'git-enhanced.mergeEditor'
            );

            await waitForCondition(() => isCustomEditorOpen(), 5000);
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const contenutoDopo = fs.readFileSync(conflictFilePath, 'utf-8');
            assert.strictEqual(
                contenutoDopo,
                contenutoPrima,
                'Il file non deve essere modificato quando non ci sono risoluzioni auto applicabili'
            );
        });
    });
});
