import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    // __dirname at runtime is out/test/e2e/ — go up 3 levels to reach the project root
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Use fresh temp folders to avoid VS Code restoring stale sessions
    const workspaceFolderTemporaneo = fs.mkdtempSync(
        path.join(os.tmpdir(), 'git-enhanced-e2e-workspace-')
    );
    const userDataDirTemporaneo = fs.mkdtempSync(
        path.join(os.tmpdir(), 'git-enhanced-e2e-userdata-')
    );

    try {
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                workspaceFolderTemporaneo,
                '--disable-extensions',
                '--disable-gpu',
                `--user-data-dir=${userDataDirTemporaneo}`,
            ],
        });
    } catch (err) {
        console.error('Failed to run E2E tests:', err);
        process.exit(1);
    } finally {
        fs.rmSync(workspaceFolderTemporaneo, { recursive: true, force: true });
        fs.rmSync(userDataDirTemporaneo, { recursive: true, force: true });
    }
}

main();
