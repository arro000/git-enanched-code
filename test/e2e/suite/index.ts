import * as path from 'path';
import Mocha from 'mocha';
import * as fs from 'fs';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 30_000,
    });

    const testsRoot = path.resolve(__dirname);
    const testFiles = findTestFiles(testsRoot);

    for (const file of testFiles) {
        mocha.addFile(file);
    }

    return new Promise<void>((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}

function findTestFiles(directory: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            results.push(...findTestFiles(fullPath));
        } else if (entry.name.endsWith('.e2e.js')) {
            results.push(fullPath);
        }
    }
    return results;
}
