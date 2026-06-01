import type { Request, RequestHandler } from 'express';
import type { AccessTokenPayload, RoleCode } from '../types/auth';
import { verifyAuthToken } from '../utils/jwt';

/** Express request after `authenticate` — `user` is guaranteed. */
export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

const authenticate: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    req.user = verifyAuthToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/** Alias for hybrid-API docs that reference `authenticateUser`. */
const authenticateUser = authenticate;

function requireRoles(...roles: RoleCode[]): RequestHandler {
  return (req, res, next) => {
    const userRoles = req.user?.roles ?? [];
    const allowed = roles.some((role) => userRoles.includes(role));
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

export { authenticate, authenticateUser, requireRoles };
