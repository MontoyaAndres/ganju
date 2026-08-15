import esbuild from 'esbuild';
import glob from 'fast-glob';

const main = async () => {
  const entryPoints = await glob('./src/**/*.{ts,js}');
  await esbuild
    .build({
      entryPoints,
      outdir: 'dist',
      platform: 'neutral',
      target: 'esnext',
      format: 'esm',
      sourcemap: true,
      tsconfig: 'tsconfig.json',
      outbase: 'src',
      bundle: false,
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
};

main();
