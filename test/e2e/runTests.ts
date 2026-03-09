import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    // __dirname at runtime is out/test/e2e/ — go up 3 levels to reach the project root
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    try {
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions',  // disable other extensions to avoid interference
                '--disable-gpu',         // avoid GPU issues in CI
            ],
        });
    } catch (err) {
        console.error('Failed to run E2E tests:', err);
        process.exit(1);
    }
}

main();
