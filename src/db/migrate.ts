import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '../config/database';
import { logger } from '../utils/logger';

async function runMigrations() {
  try {
    logger.info('Running database migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.info('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();