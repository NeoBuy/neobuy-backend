import type { RequestHandler } from 'express';
import type { RoleCode } from '../types/auth';
import { verifyAuthToken } from '../utils/jwt';

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

export { authenticate, requireRoles };
