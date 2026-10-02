import 'dotenv/config';

// I test di integrazione svuotano il database: devono girare solo su un DB dedicato.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required to run tests (see .env.example)');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-0123';
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_RATE_LIMIT = '1000';
