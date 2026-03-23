const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

/**
 * Plugin esbuild che copia i file WASM di Tree-sitter nella cartella di output.
 * Necessario perché esbuild non gestisce i file .wasm nel bundle.
 */
const copiaWasmTreeSitterPlugin = {
    name: 'copia-wasm-tree-sitter',
    setup(build) {
        build.onEnd(() => {
            const cartellaOutput = path.dirname(build.initialOptions.outfile);

            // Copia web-tree-sitter.wasm (runtime core)
            const cartellaWebTreeSitter = path.dirname(require.resolve('web-tree-sitter'));
            fs.copyFileSync(
                path.join(cartellaWebTreeSitter, 'web-tree-sitter.wasm'),
                path.join(cartellaOutput, 'web-tree-sitter.wasm')
            );

            // Copia le grammar WASM dei linguaggi supportati
            const grammarDaCopiare = [
                { pacchetto: 'tree-sitter-typescript', file: 'tree-sitter-typescript.wasm' },
                { pacchetto: 'tree-sitter-javascript', file: 'tree-sitter-javascript.wasm' },
                { pacchetto: 'tree-sitter-c-sharp', file: 'tree-sitter-c_sharp.wasm' },
                { pacchetto: 'tree-sitter-java', file: 'tree-sitter-java.wasm' },
                { pacchetto: 'tree-sitter-rust', file: 'tree-sitter-rust.wasm' },
            ];

            for (const { pacchetto, file } of grammarDaCopiare) {
                try {
                    // require.resolve può puntare a sottocartelle (es. bindings/node);
                    // risaliamo fino a trovare il file .wasm nella root del pacchetto
                    let cartella = path.dirname(require.resolve(pacchetto));
                    while (cartella !== path.dirname(cartella)) {
                        if (fs.existsSync(path.join(cartella, file))) break;
                        cartella = path.dirname(cartella);
                    }
                    fs.copyFileSync(
                        path.join(cartella, file),
                        path.join(cartellaOutput, file)
                    );
                } catch {
                    // Il pacchetto potrebbe non essere installato; ignora silenziosamente
                }
            }

            console.log('WASM files copied to output directory.');
        });
    },
};

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: './out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    minify: false,
    plugins: [copiaWasmTreeSitterPlugin],
};

async function main() {
    if (isWatch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await esbuild.build(buildOptions);
        console.log('Build complete.');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
