import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7: la connessione per le migrazioni e il seed stanno qui, non più nello schema.
// DATABASE_URL può mancare (es. `prisma generate` nel build Docker): serve solo a migrate e seed.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url: process.env.DATABASE_URL },
});
