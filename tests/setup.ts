import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'jest_test_jwt_secret';
}

if (!process.env.DB_NAME) {
  throw new Error('DB_NAME is required in .env to run integration tests.');
}
