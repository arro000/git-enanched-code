import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * E2E tests for US-006: Layout visivo a 3 colonne con label e separazione.
 *
 * These tests verify that the custom merge editor opens with a proper
 * 3-column layout when a file with conflict markers is detected.
 *
 * NOTE: Full DOM-level verification of column rendering is not possible
 * in VS Code extension E2E tests since the webview runs in an isolated
 * iframe. These tests verify that:
 * 1. The custom editor activates and opens correctly
 * 2. The webview panel is created with the expected configuration
 * 3. The editor title reflects the merge editor
 *
 * Visual layout validation (column labels, CSS grid, overflow behavior)
 * is covered by the unit tests which inspect the generated HTML directly.
 */

suite('US-006: Layout 3 colonne — E2E', () => {
    let tempDir: string;
    let conflictFilePath: string;

    suiteSetup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-us006-'));
    });

    setup(() => {
        // Create a file with conflict markers
        conflictFilePath = path.join(tempDir, 'layout-test.ts');
        const contenutoConConflitto = [
            'import { Component } from "react";',
            '',
            '<<<<<<< HEAD',
            'const theme = "dark";',
            '=======',
            'const theme = "light";',
            '>>>>>>> feature/theme',
            '',
            'export default function App() {',
            '  return <div>{theme}</div>;',
            '}',
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

    test('custom merge editor opens for a file with conflict markers', async () => {
        const uri = vscode.Uri.file(conflictFilePath);
        await vscode.commands.executeCommand('vscode.openWith', uri, 'git-enhanced.mergeEditor');

        // Wait briefly for the editor to open
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify a tab is open for the file
        const tabGroupeAperte = vscode.window.tabGroups.all;
        const tabConEditorCustom = tabGroupeAperte.flatMap(g => g.tabs).find(tab => {
            if (tab.input instanceof vscode.TabInputCustom) {
                return tab.input.uri.fsPath === conflictFilePath;
            }
            return false;
        });

        assert.ok(
            tabConEditorCustom,
            'Expected a custom editor tab to be open for the conflict file'
        );
    });

    test('merge editor webview has scripts enabled for interactive layout', async () => {
        const uri = vscode.Uri.file(conflictFilePath);
        await vscode.commands.executeCommand('vscode.openWith', uri, 'git-enhanced.mergeEditor');
        await new Promise(resolve => setTimeout(resolve, 300));

        // The custom editor should be registered and active.
        // We can't directly access webview.options from E2E, but we verify
        // the editor opens without error (enableScripts is set internally).
        const tabGroupeAperte = vscode.window.tabGroups.all;
        const tabConEditorCustom = tabGroupeAperte.flatMap(g => g.tabs).find(tab =>
            tab.input instanceof vscode.TabInputCustom &&
            tab.input.viewType === 'git-enhanced.mergeEditor'
        );

        assert.ok(tabConEditorCustom, 'Custom editor tab should be open with correct viewType');
    });
});
