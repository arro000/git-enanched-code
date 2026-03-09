import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Creates a temporary git repository with a real merge conflict.
 * Returns the repo path and the path to the conflicted file.
 */
function creareRepoConMergeConflict(): { repoPath: string; conflictFilePath: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-enhanced-e2e-us003-'));

    const git = (cmd: string) =>
        execSync(`git ${cmd}`, { cwd: repoPath, stdio: 'pipe' }).toString();

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    const filePath = path.join(repoPath, 'merge-target.ts');

    // Base commit
    fs.writeFileSync(filePath, 'function greet() {\n  return "hello";\n}\n');
    git('add .');
    git('commit -m "base commit"');

    const defaultBranch = git('rev-parse --abbrev-ref HEAD').trim();

    // Feature branch with conflicting change
    git('checkout -b feature');
    fs.writeFileSync(filePath, 'function greet() {\n  return "hello from feature";\n}\n');
    git('add .');
    git('commit -m "feature change"');

    // Back to default branch with conflicting change
    git(`checkout ${defaultBranch}`);
    fs.writeFileSync(filePath, 'function greet() {\n  return "hello from main";\n}\n');
    git('add .');
    git('commit -m "main change"');

    // Merge — will fail with conflict
    try {
        git('merge feature');
    } catch {
        // Expected: merge conflict
    }

    return { repoPath, conflictFilePath: filePath };
}

/**
 * Returns the git status porcelain output for a file.
 */
function getGitStatusForFile(repoPath: string, filePath: string): string {
    const relativePath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    try {
        const output = execSync(`git status --porcelain "${relativePath}"`, {
            cwd: repoPath,
            stdio: 'pipe',
        }).toString().trim();
        return output;
    } catch {
        return '';
    }
}

function cleanupTempRepo(repoPath: string): void {
    try {
        fs.rmSync(repoPath, { recursive: true, force: true });
    } catch {
        // Best effort cleanup
    }
}

suite('US-003 — Merge Completion E2E', () => {
    let repoPath: string;
    let conflictFilePath: string;

    suiteSetup(async () => {
        const repo = creareRepoConMergeConflict();
        repoPath = repo.repoPath;
        conflictFilePath = repo.conflictFilePath;

        // Ensure the extension is activated
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

    test('AC1: completaMerge su file risolto (senza conflict markers) salva e esegue git add', async () => {
        // Resolve the conflict manually by removing markers and writing clean content
        const contenutoRisolto = 'function greet() {\n  return "hello merged";\n}\n';
        fs.writeFileSync(conflictFilePath, contenutoRisolto);

        // Verify the file is in "unmerged" state (UU) before completion
        const statusPrima = getGitStatusForFile(repoPath, conflictFilePath);
        assert.ok(
            statusPrima.includes('U') || statusPrima.includes('M') || statusPrima.includes('A'),
            `Il file dovrebbe essere in stato unmerged o modificato prima del completamento. Status: "${statusPrima}"`
        );

        // Open the file in VS Code and add the workspace folder temporarily
        const folderUri = vscode.Uri.file(repoPath);
        const previousWorkspaceFolders = vscode.workspace.workspaceFolders?.length ?? 0;

        // We need the file to be inside a workspace folder for MergeCompletionService to work
        vscode.workspace.updateWorkspaceFolders(previousWorkspaceFolders, 0, { uri: folderUri });

        // Wait for workspace to update
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Open and show the resolved file
        const document = await vscode.workspace.openTextDocument(conflictFilePath);
        await vscode.window.showTextDocument(document);

        // Execute the completeMerge command
        await vscode.commands.executeCommand('git-enhanced.completeMerge');

        // Small delay for git add to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify: file should now be staged (git status shows "M " or "A " with first column filled)
        const statusDopo = getGitStatusForFile(repoPath, conflictFilePath);
        assert.ok(
            statusDopo.startsWith('M') || statusDopo.startsWith('A') || statusDopo === '',
            `Dopo completaMerge, il file dovrebbe essere staged (git add eseguito). Status: "${statusDopo}"`
        );

        // Verify: file content is preserved on disk
        const contenutoSuDisco = fs.readFileSync(conflictFilePath, 'utf-8');
        assert.strictEqual(
            contenutoSuDisco,
            contenutoRisolto,
            'Il contenuto del file risolto deve essere preservato su disco dopo il completamento'
        );

        // Cleanup workspace folder
        vscode.workspace.updateWorkspaceFolders(previousWorkspaceFolders, 1);
    });

    test('AC3: completaMerge su file con conflict markers fallisce senza perdita di contenuto', async () => {
        // Re-create the conflict scenario
        const repoConflitto = creareRepoConMergeConflict();
        const fileConConflitti = repoConflitto.conflictFilePath;

        try {
            // Read the file with conflict markers
            const contenutoConConflitti = fs.readFileSync(fileConConflitti, 'utf-8');
            assert.ok(
                contenutoConConflitti.includes('<<<<<<<') && contenutoConConflitti.includes('>>>>>>>'),
                'Il file deve contenere conflict markers per questo test'
            );

            // Add workspace folder
            const folderUri = vscode.Uri.file(repoConflitto.repoPath);
            const previousWorkspaceFolders = vscode.workspace.workspaceFolders?.length ?? 0;
            vscode.workspace.updateWorkspaceFolders(previousWorkspaceFolders, 0, { uri: folderUri });
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Open the conflicted file
            const document = await vscode.workspace.openTextDocument(fileConConflitti);
            await vscode.window.showTextDocument(document);

            // Execute completeMerge — should fail because conflict markers are present
            await vscode.commands.executeCommand('git-enhanced.completeMerge');
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Verify: file content should be UNCHANGED (no loss of resolved content)
            const contenutoDopo = fs.readFileSync(fileConConflitti, 'utf-8');
            assert.strictEqual(
                contenutoDopo,
                contenutoConConflitti,
                'Il file con conflict markers non deve essere modificato quando completaMerge fallisce. ' +
                'Il contenuto risolto non deve andare perso.'
            );

            // Cleanup workspace folder
            vscode.workspace.updateWorkspaceFolders(previousWorkspaceFolders, 1);
        } finally {
            cleanupTempRepo(repoConflitto.repoPath);
        }
    });
});
