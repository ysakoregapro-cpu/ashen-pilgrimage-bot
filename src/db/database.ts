import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createTables } from './schema';
import { seedDatabase } from './seed';
import { runMigrations } from './migrations';
import { ensureMonstersIsBossColumn } from './monsterSchema';
import { ensurePhase2Seed } from './seedData/phase2Seed';
import { ensurePhase2Jobs } from './seedData/ensurePhase2Jobs';
import { ensurePhase2EquipmentRoutes } from './seedData/ensurePhase2EquipmentRoutes';
import { ensureMasterDataSeed } from './seedData/masterDataSeed';
import { ensureMaterialsSeed } from './seedData/materials';
import { ensureTownsSeed } from './seedData/towns';

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
    ensureMonstersIsBossColumn(db);
    runMigrations(db);
    seedDatabase(db);
    ensureMaterialsSeed(db);
    ensureTownsSeed(db);
    ensurePhase2Seed(db);
    ensurePhase2Jobs(db);
    ensurePhase2EquipmentRoutes(db);
    ensureMasterDataSeed(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
