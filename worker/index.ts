import handler from 'vinext/server/app-router-entry';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare global {
  // Sites passes runtime secrets as Worker bindings. Vinext route handlers do
  // not receive those bindings directly, so expose this deployment-scoped map
  // to server code only; no client module imports this value.
  // eslint-disable-next-line no-var
  var __LIVING_GRIMOIRE_ENV: Record<string, unknown> | undefined;
}

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    globalThis.__LIVING_GRIMOIRE_ENV = env;
    return handler.fetch(request, env, ctx);
  }
};
