import bcrypt from 'bcryptjs';
import * as userRepository from '../repositories/user.repository';
import type {
  AuthSessionData,
  LoginUserInput,
  RegisterUserInput,
  RegisteredUser,
} from '../types/auth';
import { signAuthToken, toRoleCodes } from '../utils/jwt';

async function registerUser({ email, phone, password }: RegisterUserInput): Promise<RegisteredUser> {
  if (!email && !phone) {
    throw new Error('Either an email or phone number must be provided.');
  }
  if (!password) {
    throw new Error('Password is required.');
  }

  const existingUser = await userRepository.findByEmailOrPhone(email, phone);
  if (existingUser) {
    throw new Error('An account with this email or phone number already exists.');
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  const merchant_id = await userRepository.getInternalMerchantId();

  return userRepository.createUserWithRole(
    {
      email: email ?? null,
      phone: phone ?? null,
      password_hash,
      merchant_id,
    },
    'CUSTOMER',
  );
}

async function loginUser({ email, phone, password }: LoginUserInput): Promise<AuthSessionData> {
  if ((!email && !phone) || !password) {
    throw new Error('Invalid authentication credentials.');
  }

  const user = await userRepository.findByEmailOrPhone(email, phone);
  if (!user || user.status === 'BLOCKED' || !user.password_hash) {
    throw new Error('Invalid authentication credentials.');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Invalid authentication credentials.');
  }

  const roles = toRoleCodes(await userRepository.getUserRoles(user.id));

  const sessionUser = {
    id: user.id,
    email: user.email,
    phone: user.phone,
    roles,
  };

  const token = signAuthToken(sessionUser);

  return { token, user: sessionUser };
}

export { registerUser, loginUser };
