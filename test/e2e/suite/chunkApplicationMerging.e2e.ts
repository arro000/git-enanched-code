import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * E2E tests for US-009: Applicazione chunk da colonna destra con << e x.
 *
 * These tests verify that the custom merge editor renders action buttons
 * (<< and x) for MERGING conflict chunks and that the editor opens correctly
 * for files with conflict markers.
 *
 * NOTE: DOM interaction within the webview (button clicks, Monaco edits)
 * is not possible from VS Code E2E tests since the webview runs in an
 * isolated iframe. Visual behavior is tested via unit tests on the
 * generated HTML.
 */

suite('US-009: Chunk MERGING Application — E2E', () => {
    let tempDir: string;
    let conflictFilePath: string;

    suiteSetup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-us009-'));
    });

    setup(() => {
        conflictFilePath = path.join(tempDir, 'chunk-merging-test.ts');
        const contenutoConConflitto = [
            'const base = "shared";',
            '',
            '<<<<<<< HEAD',
            'const local = "from-head";',
            '=======',
            'const remote = "from-merging";',
            '>>>>>>> feature/remote',
            '',
            '<<<<<<< HEAD',
            'function greet() { return "hello"; }',
            '=======',
            'function greet() { return "world"; }',
            '>>>>>>> feature/remote',
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

    test('custom merge editor opens for file with MERGING chunks', async () => {
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
            'Custom editor should open for file with MERGING conflict chunks'
        );
    });
});
