import handler from 'vinext/server/app-router-entry';
import { handleWorldRequest, pollWorldJobs } from './worlds';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Record<string, unknown> | undefined, ctx: ExecutionContext) {
    const worldResponse = await handleWorldRequest(request, env ?? {});
    if (worldResponse) return worldResponse;
    return handler.fetch(request, env ?? {}, ctx);
  },
  async scheduled(_event: unknown, env: Record<string, unknown> | undefined, ctx: ExecutionContext) {
    ctx.waitUntil(pollWorldJobs(env ?? {}));
  }
};
