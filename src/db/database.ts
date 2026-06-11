import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createTables } from './schema';
import { seedDatabase } from './seed';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'database.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables(db);
    seedDatabase(db);
    runMigrations(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
