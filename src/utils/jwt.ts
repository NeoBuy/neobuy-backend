import jwt from 'jsonwebtoken';
import type { AccessTokenPayload, AuthSessionUser, RoleCode } from '../types/auth';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

function signAuthToken(user: AuthSessionUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, roles: user.roles },
    getJwtSecret(),
    { expiresIn: '7d' },
  );
}

function verifyAuthToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
  return payload;
}

function toRoleCodes(codes: string[]): RoleCode[] {
  return codes.filter((c): c is RoleCode => c === 'CUSTOMER' || c === 'ADMIN' || c === 'SELLER');
}

export { signAuthToken, verifyAuthToken, toRoleCodes };
