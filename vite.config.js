import vinext from 'vinext';
import { defineConfig } from 'vite';
import { sites } from './build/sites-vite-plugin.js';

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    server: isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: {
          main: './worker/index.ts',
          compatibility_flags: ['nodejs_compat'],
          d1_databases: [{
            binding: 'WORLD_CATALOG',
            database_name: 'fye-world-catalog-dev',
            database_id: 'dbdfdb6b-3193-4f3a-bf07-a8ef2f4476e7',
            migrations_dir: './migrations'
          }],
          triggers: { crons: ['* * * * *'] }
        }
      })
    ]
  };
});
