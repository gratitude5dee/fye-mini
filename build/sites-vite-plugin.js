import { access, cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

/** Packages Sites metadata beside the Worker bundle after Vite compiles it. */
export function sites() {
  let root = process.cwd();

  return {
    name: 'sites',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, 'dist', '.openai');
      const hostingConfig = resolve(root, '.openai', 'hosting.json');

      // The restored foundation keeps these source assets for its other demo
      // modes, but the Living Grimoire neither imports nor needs them. Remove
      // only their generated copies so the Sites artifact stays first-person,
      // procedural, and roughly 8 MB lighter without touching user files.
      await Promise.all([
        rm(resolve(root, 'dist', 'client', 'models', 'Standing Idle.fbx'), { force: true }),
        rm(resolve(root, 'dist', 'client', 'hdri', 'spruit_sunrise.hdr'), { force: true })
      ]);

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });
      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, 'hosting.json'));
      }
    }
  };
}
