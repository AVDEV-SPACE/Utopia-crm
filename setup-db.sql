-- setup-db.sql
-- Run this in Neon SQL Editor to create the required auth tables

-- Auth table
CREATE TABLE IF NOT EXISTS crm_users (
  id SERIAL PRIMARY KEY,
  clerk_id VARCHAR(255) UNIQUE NOT NULL,
  fullname VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(50) DEFAULT 'owner'
);

-- Email authorization tables
CREATE TABLE IF NOT EXISTS allowed_owners (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS allowed_assistants (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);

-- Optional: Insert initial owner
-- INSERT INTO allowed_owners (email) VALUES ('your-email@example.com') ON CONFLICT DO NOTHING;