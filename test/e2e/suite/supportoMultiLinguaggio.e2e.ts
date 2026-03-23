import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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

/**
 * Crea un file temporaneo con conflict markers nel linguaggio specificato.
 */
function creaFileConflittoPerLinguaggio(
    cartella: string,
    nomeFile: string,
    contenutoHead: string,
    contenutoMerging: string
): string {
    const filePath = path.join(cartella, nomeFile);
    const contenuto = [
        '<<<<<<< HEAD',
        contenutoHead,
        '=======',
        contenutoMerging,
        '>>>>>>> feature/branch',
    ].join('\n') + '\n';
    fs.writeFileSync(filePath, contenuto);
    return filePath;
}

suite('US-015/016 — Supporto Multi-Linguaggio e Tooltip Bacchetta E2E', () => {
    let tempDir: string;

    suiteSetup(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-us016-'));

        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Best effort
        }
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('AC1 US-016: il merge editor si apre correttamente per file TypeScript (.ts)', async () => {
        const filePath = creaFileConflittoPerLinguaggio(
            tempDir, 'conflitto.ts',
            'const x = 1;',
            'const x = 2;'
        );

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(filePath),
            'git-enhanced.mergeEditor'
        );

        const aperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
        assert.ok(aperto, 'Il merge editor deve aprirsi per file .ts');
    });

    test('AC1 US-016: il merge editor si apre correttamente per file JavaScript (.js)', async () => {
        const filePath = creaFileConflittoPerLinguaggio(
            tempDir, 'conflitto.js',
            'const x = 1;',
            'const x = 2;'
        );

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(filePath),
            'git-enhanced.mergeEditor'
        );

        const aperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
        assert.ok(aperto, 'Il merge editor deve aprirsi per file .js');
    });

    test('AC1 US-016: il merge editor si apre correttamente per file Java (.java)', async () => {
        const filePath = creaFileConflittoPerLinguaggio(
            tempDir, 'Conflitto.java',
            'public class Conflitto { int x = 1; }',
            'public class Conflitto { int x = 2; }'
        );

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(filePath),
            'git-enhanced.mergeEditor'
        );

        const aperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
        assert.ok(aperto, 'Il merge editor deve aprirsi per file .java');
    });

    test('AC3 US-016: per file in linguaggio non supportato, l\'editor si apre senza errori', async () => {
        const filePath = creaFileConflittoPerLinguaggio(
            tempDir, 'conflitto.py',
            'x = 1',
            'x = 2'
        );

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(filePath),
            'git-enhanced.mergeEditor'
        );

        const aperto = await waitForCondition(() => isCustomEditorOpen(), 5000);
        assert.ok(
            aperto,
            'Il merge editor deve aprirsi anche per linguaggi non supportati da Tree-sitter — ' +
            'l\'analisi AST viene saltata silenziosamente e diff3 rimane l\'unico layer attivo'
        );

        // L'estensione deve rimanere attiva
        const extension = vscode.extensions.getExtension('signori-agenti.git-enhanced');
        assert.ok(extension?.isActive, 'L\'estensione non deve crashare per linguaggi non supportati');
    });
});
