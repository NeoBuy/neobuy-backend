import 'dotenv/config';

import type { Express } from 'express';
import { createApp } from './create-app';

const port = Number(process.env.PORT || 4000);

async function startServer(): Promise<Express> {
  const app = await createApp({ enableGraphql: true });

  app.listen(port, () => {
    console.log(`NeoBuy API listening on port ${port}`);
    console.log(`GraphQL endpoint: http://localhost:${port}/graphql`);
  });

  return app;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { createApp, startServer };
