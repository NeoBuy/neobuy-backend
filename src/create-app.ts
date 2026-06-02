import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express, { type Express } from 'express';
import { createContext } from './graphql/context';
import { resolvers } from './graphql/resolvers';
import { typeDefs } from './graphql/schema';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import apiRoutes from './routes';

export interface CreateAppOptions {
  enableGraphql?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const { enableGraphql = true } = options;

  const app = express();

  app.use(cors());
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        if (buf && buf.length > 0) {
          (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use('/api', apiRoutes);

  if (enableGraphql) {
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
    });
    await apolloServer.start();
    app.use(
      '/graphql',
      expressMiddleware(apolloServer, {
        context: createContext,
      }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
