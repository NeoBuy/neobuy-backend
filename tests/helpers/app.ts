import type { Express } from 'express';
import { createApp } from '../../src/create-app';

let cachedApp: Express | undefined;

export async function getTestApp(): Promise<Express> {
  if (!cachedApp) {
    cachedApp = await createApp({ enableGraphql: false });
  }
  return cachedApp;
}
