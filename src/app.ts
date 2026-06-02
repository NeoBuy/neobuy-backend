import 'dotenv/config';

import cron from 'node-cron';
import type { Express } from 'express';
import { createApp } from './create-app';
import cronService from './services/cron.service';

const port = Number(process.env.PORT || 4000);

async function startServer(): Promise<Express> {
  const app = await createApp({ enableGraphql: true });

  app.listen(port, () => {
    console.log(`NeoBuy API listening on port ${port}`);
    console.log(`GraphQL endpoint: http://localhost:${port}/graphql`);

    const isCronEnabled = process.env.CRON_ENABLED === 'true';
    const isCronLoggingEnabled = process.env.CRON_LOGGING_ENABLED === 'true';

    if (isCronEnabled) {
      if (isCronLoggingEnabled) {
        console.log(
          'Background System Core: Anti-Stock-Hoarding Cron engine initialized successfully.',
        );
      }

      /**
       * Stock hoarding protection loop:
       * every 5 seconds, expire abandoned PENDING_PAYMENT orders older than 30 minutes.
       */
      cron.schedule('*/5 * * * * *', async () => {
        if (isCronLoggingEnabled) {
          console.log(
            'Background Cron: Scanning database for stale or abandoned checkout blocks...',
          );
        }

        try {
          const result = await cronService.expireAbandonedOrders(30);
          if (result.expiredCount > 0 && isCronLoggingEnabled) {
            console.log(
              `Background Cron Success: Cleaned up and restocked ${result.expiredCount} hoarded checkout baskets.`,
            );
          }
        } catch (error) {
          console.error(
            'Background Cron Error: Stock reclamation thread encountered an unhandled exception:',
            error,
          );
        }
      });
    } else {
      console.log(
        'Background System Core: Anti-Stock-Hoarding Cron engine explicitly disabled by environment variables.',
      );
    }
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
