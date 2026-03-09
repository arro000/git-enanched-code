// @ts-check
const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production';

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/ui/webview/index.tsx'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': isProd ? '"production"' : '"development"',
  },
};

async function build() {
  if (isWatch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
