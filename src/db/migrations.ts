import type Database from 'better-sqlite3';
import { seedBattleSkills, ensurePlayerSkillTables } from './seedData/battleSkills';
import { seedStoryTables } from '../systems/storySystem';
import { ensureMonstersIsBossColumn } from './monsterSchema';

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
    CREATE TABLE IF NOT EXISTS player_status_effects (
      user_id TEXT NOT NULL,
      effect_key TEXT NOT NULL,
      stacks INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, effect_key)
    );
    CREATE TABLE IF NOT EXISTS coop_recruits (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recruiting',
      min_players INTEGER NOT NULL DEFAULT 2,
      max_players INTEGER NOT NULL DEFAULT 4,
      context_json TEXT NOT NULL DEFAULT '{}',
      channel_id TEXT,
      message_id TEXT,
      expires_at TEXT NOT NULL,
      started_battle_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coop_members (
      recruit_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'helper',
      status TEXT NOT NULL DEFAULT 'joined',
      joined_at TEXT NOT NULL,
      left_at TEXT,
      PRIMARY KEY (recruit_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS coop_battle_sessions (
      id TEXT PRIMARY KEY,
      recruit_id TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      enemy_json TEXT NOT NULL,
      participant_states_json TEXT NOT NULL,
      turn_count INTEGER DEFAULT 0,
      status_json TEXT DEFAULT '{}',
      resolving_lock TEXT,
      turn_deadline_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coop_battle_actions (
      battle_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      turn_count INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      skill_id TEXT,
      item_id TEXT,
      target_json TEXT,
      submitted_at TEXT NOT NULL,
      PRIMARY KEY (battle_id, user_id, turn_count)
    );
    CREATE TABLE IF NOT EXISTS coop_rewards (
      battle_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reward_json TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      PRIMARY KEY (battle_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_coop_recruits_status ON coop_recruits(status);
    CREATE INDEX IF NOT EXISTS idx_coop_battle_status ON coop_battle_sessions(status);
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
  addColumn(db, 'battle_sessions', 'enemy_state_json', 'TEXT');
  addColumn(db, 'battle_sessions', 'trial_type', 'TEXT');
  addColumn(db, 'battle_sessions', 'trial_job', 'TEXT');
  addColumn(db, 'battle_sessions', 'trial_payload_json', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS player_sub_job_unlocks (
      user_id TEXT NOT NULL,
      sub_job TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      unlock_source TEXT,
      PRIMARY KEY (user_id, sub_job)
    );
    CREATE TABLE IF NOT EXISTS player_advanced_job_unlocks (
      user_id TEXT NOT NULL,
      advanced_job TEXT NOT NULL,
      base_job TEXT NOT NULL,
      unlocked_at TEXT,
      trial_cleared_at TEXT,
      unlock_source TEXT,
      PRIMARY KEY (user_id, advanced_job)
    );
  `);

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
  addColumn(db, 'coop_battle_sessions', 'channel_id', 'TEXT');
  addColumn(db, 'coop_battle_sessions', 'message_id', 'TEXT');
  ensureMonstersIsBossColumn(db);
  addColumn(db, 'monsters', 'spirit', 'INTEGER DEFAULT 0');

  ensurePlayerSkillTables(db);
  seedBattleSkills(db);
  seedStoryTables(db);

  addColumn(db, 'player_inventory', 'affix_json', 'TEXT');
  addColumn(db, 'player_inventory', 'stat_roll_json', 'TEXT');

  ensurePhase25SetBonusRebalance(db);
}

function ensurePhase25SetBonusRebalance(db: import('better-sqlite3').Database): void {
  const updates: Array<{ setId: string; count: number; desc: string; effect: Record<string, number> }> = [
    { setId: 'set_deep_furnace', count: 2, desc: '攻撃 +4%', effect: { attack_pct: 0.04 } },
    { setId: 'set_deep_furnace', count: 3, desc: '攻撃 +2% / 防御 +2%', effect: { attack_pct: 0.02, defense_pct: 0.02 } },
    { setId: 'set_deep_furnace', count: 5, desc: '全ステ +5% / 会心ダメ +5%', effect: { all_stat_pct: 0.05, crit_damage: 0.05 } },
    { setId: 'set_black_lamp', count: 2, desc: '攻撃 +4%', effect: { attack_pct: 0.04 } },
    { setId: 'set_black_lamp', count: 3, desc: '会心 +3% / 会心ダメ +3%', effect: { crit_rate: 0.03, crit_damage: 0.03 } },
    { setId: 'set_black_lamp', count: 5, desc: '攻撃 +5% / 会心 +5%', effect: { attack_pct: 0.05, crit_rate: 0.05 } },
    { setId: 'set_starfall', count: 2, desc: '魔力 +4%', effect: { magic_pct: 0.04 } },
    { setId: 'set_starfall', count: 3, desc: '魔力 +2% / 精神 +2%', effect: { magic_pct: 0.02, spirit_pct: 0.02 } },
    { setId: 'set_starfall', count: 5, desc: '全ステ +4% / 魔力 +4%', effect: { all_stat_pct: 0.04, magic_pct: 0.04 } },
    { setId: 'set_iron_snow', count: 2, desc: '防御 +4%', effect: { defense_pct: 0.04 } },
    { setId: 'set_iron_snow', count: 3, desc: '防御 +3% / HP +3%', effect: { defense_pct: 0.03, hp_pct: 0.03 } },
    { setId: 'set_iron_snow', count: 5, desc: '全ステ +3% / 防御 +5%', effect: { all_stat_pct: 0.03, defense_pct: 0.05 } },
    { setId: 'set_valhalla', count: 2, desc: '全ステ +4%', effect: { all_stat_pct: 0.04 } },
    { setId: 'set_valhalla', count: 3, desc: '攻撃 +3% / 防御 +3%', effect: { attack_pct: 0.03, defense_pct: 0.03 } },
    { setId: 'set_valhalla', count: 5, desc: '全ステ +5% / 会心ダメ +8%', effect: { all_stat_pct: 0.05, crit_damage: 0.08 } },
    { setId: 'set_old_king', count: 2, desc: '攻撃 +5%', effect: { attack_pct: 0.05 } },
    { setId: 'set_old_king', count: 3, desc: '精神 +4% / 防御 +3%', effect: { spirit_pct: 0.04, defense_pct: 0.03 } },
    { setId: 'set_old_king', count: 5, desc: '攻撃 +6% / 全ステ +3%', effect: { attack_pct: 0.06, all_stat_pct: 0.03 } },
  ];
  const stmt = db.prepare(`
    UPDATE equipment_set_bonuses SET effect_description = ?, effect_json = ?
    WHERE set_id = ? AND piece_count = ?
  `);
  for (const u of updates) stmt.run(u.desc, JSON.stringify(u.effect), u.setId, u.count);
}
