import { neon } from "@neondatabase/serverless";

const connectionString = process.env.NEON_PRIMARY_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("NEON_PRIMARY_URL or DATABASE_URL is not set");
}

export const sql = neon(connectionString);
