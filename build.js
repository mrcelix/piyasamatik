const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  sourcemap: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  logLevel: 'info',
};

const targets = [
  { entry: 'src/main/main.ts', outfile: 'dist/main/main.js' },
  { entry: 'src/main/preload.ts', outfile: 'dist/main/preload.js' },
  {
    entry: 'src/renderer/renderer.ts',
    outfile: 'dist/renderer/renderer.js',
    platform: 'browser',
    target: 'chrome120',
  },
  {
    entry: 'src/renderer/mini.ts',
    outfile: 'dist/renderer/mini.js',
    platform: 'browser',
    target: 'chrome120',
  },
  {
    entry: 'src/renderer/settings.ts',
    outfile: 'dist/renderer/settings.js',
    platform: 'browser',
    target: 'chrome120',
  },
  {
    entry: 'src/renderer/chart.ts',
    outfile: 'dist/renderer/chart.js',
    platform: 'browser',
    target: 'chrome120',
  },
  {
    entry: 'src/renderer/ticker.ts',
    outfile: 'dist/renderer/ticker.js',
    platform: 'browser',
    target: 'chrome120',
  },
];

async function run() {
  for (const t of targets) {
    const options = {
      ...common,
      ...t,
      platform: t.platform || common.platform,
    };
    delete options.entry;
    options.entryPoints = [t.entry];

    if (watch) {
      const ctx = await esbuild.context(options);
      await ctx.watch();
      console.log(`watching ${t.entry}`);
    } else {
      await esbuild.build(options);
    }
  }

  // copy static renderer assets
  const fs = require('fs');
  fs.mkdirSync('dist/renderer', { recursive: true });
  for (const file of ['index.html', 'mini.html', 'settings.html', 'chart.html', 'ticker.html', 'styles.css']) {
    fs.copyFileSync(`src/renderer/${file}`, `dist/renderer/${file}`);
  }
  console.log('copied renderer static assets');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
