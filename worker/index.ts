import handler from 'vinext/server/app-router-entry';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Record<string, unknown> | undefined, ctx: ExecutionContext) {
    return handler.fetch(request, env ?? {}, ctx);
  }
};
