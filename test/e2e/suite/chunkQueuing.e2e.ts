import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * E2E tests for US-010: Accodamento chunk quando entrambe le colonne vengono applicate.
 *
 * These tests verify that the custom merge editor correctly handles the case
 * where both HEAD and MERGING chunks are applied to the same conflict,
 * queuing them in sequence without separators.
 *
 * NOTE: DOM interaction within the webview (button clicks, Monaco edits)
 * is not possible from VS Code E2E tests since the webview runs in an
 * isolated iframe. Visual behavior is tested via unit tests on the
 * generated HTML.
 */

suite('US-010: Chunk Queuing — E2E', () => {
    let tempDir: string;
    let conflictFilePath: string;

    suiteSetup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-us010-'));
    });

    setup(() => {
        conflictFilePath = path.join(tempDir, 'chunk-queuing-test.ts');
        const contenutoConConflitto = [
            'const base = "shared";',
            '',
            '<<<<<<< HEAD',
            'const local = "from-head";',
            'const extraLocal = "also-head";',
            '=======',
            'const remote = "from-merging";',
            'const extraRemote = "also-merging";',
            '>>>>>>> feature/remote',
            '',
            'const footer = "end";',
        ].join('\n');
        fs.writeFileSync(conflictFilePath, contenutoConConflitto);
    });

    suiteTeardown(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    test('custom merge editor opens for file suitable for chunk queuing', async () => {
        const uri = vscode.Uri.file(conflictFilePath);
        await vscode.commands.executeCommand('vscode.openWith', uri, 'git-enhanced.mergeEditor');
        await new Promise(resolve => setTimeout(resolve, 300));

        const tabConEditorCustom = vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .find(tab =>
                tab.input instanceof vscode.TabInputCustom &&
                tab.input.viewType === 'git-enhanced.mergeEditor'
            );

        assert.ok(
            tabConEditorCustom,
            'Custom editor should open for file with conflicts suitable for chunk queuing'
        );
    });
});
