export type RoleCode = 'CUSTOMER' | 'ADMIN' | 'SELLER';

/** Decoded JWT payload attached to `req.user` after authentication. */
export interface AccessTokenPayload {
  id: number;
  email: string | null;
  roles: RoleCode[];
  iat?: number;
  exp?: number;
}

export interface RegisterUserInput {
  email?: string;
  phone?: string;
  password: string;
}

export interface LoginUserInput {
  email?: string;
  phone?: string;
  password: string;
}

export interface RegisteredUser {
  id: number;
  email: string | null;
  phone: string | null;
}

export interface AuthSessionUser {
  id: number;
  email: string | null;
  phone: string | null;
  roles: RoleCode[];
}

export interface AuthSessionData {
  token: string;
  user: AuthSessionUser;
}
