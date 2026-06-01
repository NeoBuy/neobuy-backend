import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express, { type Express } from 'express';
import { resolvers } from './graphql/resolvers';
import { typeDefs } from './graphql/schema';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import apiRoutes from './routes';

export interface CreateAppOptions {
  enableGraphql?: boolean;
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const { enableGraphql = true } = options;

  const app = express();

  app.use(cors());
  app.use(express.json());
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
        context: async () => ({}),
      }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
