import 'dotenv/config';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express from 'express';
import { resolvers } from './graphql/resolvers';
import { typeDefs } from './graphql/schema';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import apiRoutes from './routes';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

async function startServer(): Promise<void> {
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(port, () => {
    console.log(`NeoBuy API listening on port ${port}`);
    console.log(`GraphQL endpoint: http://localhost:${port}/graphql`);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
export { startServer };
