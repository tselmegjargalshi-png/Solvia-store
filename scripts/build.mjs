/**
 * Production build for the client.
 *
 * Uses esbuild directly (the bundler Vite uses under the hood). Vite itself could
 * not be installed in the build environment because the package registry was
 * unreachable; see README → "Toolchain note".
 *
 *   node scripts/build.mjs          → minified, hashed, code-split bundle in dist/
 *   node scripts/build.mjs --watch  → unminified rebuilds on change (used by `npm run dev`)
 */
import * as esbuild from 'esbuild';
import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, 'assets'), { recursive: true });

/** Write dist/index.html pointing at the hashed entry files. The server injects per-page SEO tags at <!--head-->. */
function writeHtml(metafile) {
  const outputs = Object.entries(metafile.outputs);
  const entry = outputs.find(([file, o]) => o.entryPoint === 'client/main.tsx' && file.endsWith('.js'))?.[0];
  if (!entry) throw new Error('Entry bundle not found in esbuild metafile');
  const entryOut = metafile.outputs[entry];
  const css = entryOut?.cssBundle;
  const rel = (p) => '/' + path.relative(dist, path.join(root, p)).split(path.sep).join('/');
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#061225">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preload" href="/fonts/inter-regular.woff" as="font" type="font/woff" crossorigin>
    <link rel="preload" href="/fonts/lora-variable.woff" as="font" type="font/woff" crossorigin>
    ${css ? `<link rel="stylesheet" href="${rel(css)}">` : ''}
    <!--head-->
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <div id="root"></div>
    <noscript><p style="padding:24px;font-family:system-ui">This store needs JavaScript enabled to browse products and check out.</p></noscript>
    <script type="module" src="${rel(entry)}"></script>
  </body>
</html>
`;
  writeFileSync(path.join(dist, 'index.html'), html);
}

const options = {
  absWorkingDir: root,
  entryPoints: ['client/main.tsx'],
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'],
  outdir: 'dist/assets',
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  assetNames: '[name]-[hash]',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  metafile: true,
  legalComments: 'none',
  // Fonts and images are served from /public at stable URLs.
  external: ['/fonts/*', '/images/*'],
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [
      {
        name: 'html',
        setup(build) {
          build.onEnd((r) => {
            if (r.metafile) writeHtml(r.metafile);
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log('[build] watching client/ for changes');
} else {
  const result = await esbuild.build(options);
  writeHtml(result.metafile);
  // Report real bundle sizes (raw and gzip) so performance claims are measured, not guessed.
  const files = readdirSync(path.join(dist, 'assets')).map((f) => {
    const p = path.join(dist, 'assets', f);
    const buf = readFileSync(p);
    return { f, raw: statSync(p).size, gz: gzipSync(buf).length };
  });
  files.sort((a, b) => b.raw - a.raw);
  const kb = (n) => (n / 1024).toFixed(1) + ' kB';
  console.log('\nBundle sizes (raw / gzip):');
  for (const x of files.slice(0, 12)) console.log(`  ${x.f.padEnd(34)} ${kb(x.raw).padStart(10)} ${kb(x.gz).padStart(10)}`);
  const entryJs = files.find((x) => x.f.startsWith('main-') && x.f.endsWith('.js'));
  const entryCss = files.find((x) => x.f.startsWith('main-') && x.f.endsWith('.css'));
  console.log(`\n  ${files.length} files. Initial entry: JS ${entryJs ? kb(entryJs.gz) : '?'} gzip, CSS ${entryCss ? kb(entryCss.gz) : '?'} gzip.`);
}
