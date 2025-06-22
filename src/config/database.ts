import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create postgres connection
const queryClient = postgres(process.env.DATABASE_URL);

// Create drizzle instance
export const db = drizzle(queryClient, { schema });

// Test database connection
export async function testConnection() {
  try {
    await queryClient`SELECT 1`;
    logger.info('Database connection established');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}