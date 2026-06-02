import type { Express } from 'express';
import { createApp } from '../../src/create-app';

let cachedRestOnlyApp: Express | undefined;
let cachedGraphqlApp: Express | undefined;

export async function getTestApp(options?: { enableGraphql?: boolean }): Promise<Express> {
  const enableGraphql = options?.enableGraphql ?? false;

  if (enableGraphql) {
    if (!cachedGraphqlApp) {
      cachedGraphqlApp = await createApp({ enableGraphql: true });
    }
    return cachedGraphqlApp;
  }

  if (!cachedRestOnlyApp) {
    cachedRestOnlyApp = await createApp({ enableGraphql: false });
  }
  return cachedRestOnlyApp;
}
