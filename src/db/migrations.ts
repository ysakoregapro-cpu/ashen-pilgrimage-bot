import type Database from 'better-sqlite3';
import { seedBattleSkills, ensurePlayerSkillTables } from './seedData/battleSkills';
import { seedStoryTables } from '../systems/storySystem';
import { ensurePhase2Seed } from './seedData/phase2Seed';

function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch {
    /* already exists */
  }
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_skills (
      user_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      learned_at TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'job',
      PRIMARY KEY (user_id, skill_id)
    );
    CREATE TABLE IF NOT EXISTS player_skill_loadout (
      user_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      PRIMARY KEY (user_id, slot)
    );
    CREATE TABLE IF NOT EXISTS player_job_levels (
      user_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      job_level INTEGER NOT NULL DEFAULT 1,
      job_exp INTEGER NOT NULL DEFAULT 0,
      is_main INTEGER NOT NULL DEFAULT 0,
      is_sub INTEGER NOT NULL DEFAULT 0,
      unlocked_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, job_name)
    );
    CREATE TABLE IF NOT EXISTS job_skill_unlocks (
      job_name TEXT NOT NULL,
      job_level INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      unlock_text TEXT,
      PRIMARY KEY (job_name, job_level, skill_id)
    );
    CREATE TABLE IF NOT EXISTS market_listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      inventory_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      price INTEGER NOT NULL,
      base_value_snapshot INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      sold_at TEXT
    );
    CREATE TABLE IF NOT EXISTS raid_battle_sessions (
      id TEXT PRIMARY KEY,
      raid_session_id TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      enemy_hp INTEGER NOT NULL,
      enemy_max_hp INTEGER NOT NULL,
      enemy_break REAL DEFAULT 0,
      participant_states_json TEXT NOT NULL,
      turn_count INTEGER DEFAULT 0,
      status_json TEXT DEFAULT '{}',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rescue_battle_sessions (
      id TEXT PRIMARY KEY,
      rescue_request_id TEXT NOT NULL,
      battle_session_id TEXT,
      monster_id TEXT NOT NULL,
      enemy_hp INTEGER NOT NULL,
      enemy_max_hp INTEGER NOT NULL,
      participant_states_json TEXT NOT NULL,
      turn_count INTEGER DEFAULT 0,
      status_json TEXT DEFAULT '{}',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  addColumn(db, 'skills', 'scaling_stat', "TEXT DEFAULT 'attack'");
  addColumn(db, 'skills', 'secondary_scaling_stat', 'TEXT');
  addColumn(db, 'skills', 'hit_bonus', 'REAL DEFAULT 0');
  addColumn(db, 'skills', 'crit_bonus', 'REAL DEFAULT 0');
  addColumn(db, 'skills', 'priority', 'INTEGER DEFAULT 0');
  addColumn(db, 'skills', 'target_type', "TEXT DEFAULT 'single'");
  addColumn(db, 'skills', 'effect_type', 'TEXT');
  addColumn(db, 'skills', 'status_effect', 'TEXT');
  addColumn(db, 'skills', 'cooldown', 'INTEGER DEFAULT 0');
  addColumn(db, 'skills', 'usable_in_battle', 'INTEGER DEFAULT 1');
  addColumn(db, 'skills', 'is_passive', 'INTEGER DEFAULT 0');
  addColumn(db, 'skills', 'hits', 'INTEGER DEFAULT 1');

  addColumn(db, 'battle_sessions', 'can_flee', 'INTEGER DEFAULT 1');
  addColumn(db, 'battle_sessions', 'is_event_battle', 'INTEGER DEFAULT 0');

  addColumn(db, 'equipment', 'passive_skill_id', 'TEXT');
  addColumn(db, 'equipment', 'src_skill_id', 'TEXT');
  addColumn(db, 'equipment', 'required_level', 'INTEGER DEFAULT 1');
  addColumn(db, 'equipment', 'required_job', 'TEXT');

  addColumn(db, 'items', 'battle_usable', 'INTEGER DEFAULT 0');
  addColumn(db, 'items', 'battle_effect_json', 'TEXT');
  addColumn(db, 'items', 'base_value', 'INTEGER');
  addColumn(db, 'items', 'shop_buy_price', 'INTEGER');
  addColumn(db, 'items', 'shop_sell_price', 'INTEGER');

  addColumn(db, 'player_inventory', 'is_listed', 'INTEGER DEFAULT 0');
  addColumn(db, 'monsters', 'is_boss', 'INTEGER DEFAULT 0');
  addColumn(db, 'monsters', 'spirit', 'INTEGER DEFAULT 0');

  ensurePlayerSkillTables(db);
  seedBattleSkills(db);
  seedStoryTables(db);
  ensurePhase2Seed(db);
}
