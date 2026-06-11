import type Database from 'better-sqlite3';

export function monstersHasIsBossColumn(db: Database.Database): boolean {
  const cols = db.prepare('PRAGMA table_info(monsters)').all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'is_boss');
}

/** Additive migration: monsters.is_boss for legacy DBs. Safe to call repeatedly. */
export function ensureMonstersIsBossColumn(db: Database.Database): void {
  if (monstersHasIsBossColumn(db)) return;
  try {
    db.exec('ALTER TABLE monsters ADD COLUMN is_boss INTEGER DEFAULT 0');
  } catch {
    /* column added concurrently or table missing */
  }
}
