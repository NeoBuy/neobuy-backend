import type { Request } from 'express';
import { verifyAuthToken } from '../utils/jwt';

export interface GraphQLContext {
  user?: { id: number };
}

export async function createContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAuthToken(token);
      return { user: { id: decoded.id } };
    } catch {
      // Keep context unauthenticated for invalid tokens.
    }
  }
  return {};
}
