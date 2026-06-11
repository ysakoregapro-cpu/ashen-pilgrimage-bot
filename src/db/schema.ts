import type Database from 'better-sqlite3';

export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      private_channel_id TEXT,
      name TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      total_exp INTEGER DEFAULT 0,
      gold INTEGER DEFAULT 0,
      main_job TEXT DEFAULT '未選択',
      sub_job TEXT,
      current_town_id TEXT DEFAULT 'start_starfield',
      last_safe_town_id TEXT DEFAULT 'start_starfield',
      hp INTEGER DEFAULT 100,
      max_hp INTEGER DEFAULT 100,
      mp INTEGER DEFAULT 30,
      max_mp INTEGER DEFAULT 30,
      attack INTEGER DEFAULT 10,
      magic INTEGER DEFAULT 10,
      defense INTEGER DEFAULT 8,
      spirit INTEGER DEFAULT 8,
      speed INTEGER DEFAULT 10,
      crit_rate REAL DEFAULT 0.05,
      crit_damage REAL DEFAULT 1.5,
      accuracy REAL DEFAULT 0.95,
      evasion REAL DEFAULT 0.05,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS towns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      required_level INTEGER DEFAULT 1,
      is_unlocked_default INTEGER DEFAULT 0,
      facilities_json TEXT,
      unlock_condition_text TEXT
    );

    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      town_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      services_json TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tier TEXT NOT NULL,
      description TEXT NOT NULL,
      hp_mod REAL DEFAULT 0,
      mp_mod REAL DEFAULT 0,
      attack_mod REAL DEFAULT 0,
      magic_mod REAL DEFAULT 0,
      defense_mod REAL DEFAULT 0,
      spirit_mod REAL DEFAULT 0,
      speed_mod REAL DEFAULT 0,
      unlock_condition TEXT
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      job_id TEXT NOT NULL,
      description TEXT NOT NULL,
      mp_cost INTEGER DEFAULT 0,
      power REAL DEFAULT 1,
      skill_type TEXT NOT NULL,
      element TEXT,
      break_power REAL DEFAULT 0,
      effect_json TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      rarity TEXT NOT NULL,
      description TEXT NOT NULL,
      source_text TEXT,
      usage_text TEXT,
      sell_price INTEGER DEFAULT 0,
      tradeable INTEGER DEFAULT 1,
      icon TEXT,
      image_url TEXT,
      appearance_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment (
      item_id TEXT PRIMARY KEY,
      slot TEXT NOT NULL,
      series_id TEXT,
      weapon_type TEXT,
      attack_bonus INTEGER DEFAULT 0,
      magic_bonus INTEGER DEFAULT 0,
      defense_bonus INTEGER DEFAULT 0,
      spirit_bonus INTEGER DEFAULT 0,
      speed_bonus INTEGER DEFAULT 0,
      hp_bonus INTEGER DEFAULT 0,
      mp_bonus INTEGER DEFAULT 0,
      crit_rate_bonus REAL DEFAULT 0,
      crit_damage_bonus REAL DEFAULT 0,
      accuracy_bonus REAL DEFAULT 0,
      evasion_bonus REAL DEFAULT 0,
      special_effect_json TEXT,
      skill_id TEXT,
      max_upgrade_level INTEGER DEFAULT 5,
      is_unique INTEGER DEFAULT 0,
      src_weapon_id TEXT
    );

    CREATE TABLE IF NOT EXISTS player_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      upgrade_level INTEGER DEFAULT 0,
      durability_state TEXT DEFAULT '良好',
      src_level INTEGER DEFAULT 0,
      awakening_level INTEGER DEFAULT 0,
      is_equipped INTEGER DEFAULT 0,
      is_pending_reward INTEGER DEFAULT 0,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_equipment (
      user_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      inventory_id INTEGER,
      PRIMARY KEY (user_id, slot)
    );

    CREATE TABLE IF NOT EXISTS equipment_sets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      tier TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment_set_bonuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id TEXT NOT NULL,
      piece_count INTEGER NOT NULL,
      effect_description TEXT NOT NULL,
      effect_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment_upgrade_paths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      target_level INTEGER NOT NULL,
      gold_cost INTEGER NOT NULL,
      material_requirements_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS src_weapons (
      id TEXT PRIMARY KEY,
      base_item_id TEXT NOT NULL,
      src_item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      jobs_json TEXT NOT NULL,
      innate_skill_id TEXT NOT NULL,
      plus10_effect TEXT NOT NULL,
      manifest_requirements_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS src_weapon_upgrades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      src_weapon_id TEXT NOT NULL,
      target_src_level INTEGER NOT NULL,
      gold_cost INTEGER NOT NULL,
      material_requirements_json TEXT NOT NULL,
      effect_description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monsters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      area_tag TEXT NOT NULL,
      level INTEGER NOT NULL,
      hp INTEGER NOT NULL,
      mp INTEGER DEFAULT 0,
      attack INTEGER NOT NULL,
      magic INTEGER NOT NULL,
      defense INTEGER NOT NULL,
      spirit INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      break_max REAL DEFAULT 100,
      element TEXT,
      drop_pool_json TEXT,
      exp_reward INTEGER DEFAULT 10,
      gold_reward INTEGER DEFAULT 5,
      ai_pattern_json TEXT
    );

    CREATE TABLE IF NOT EXISTS exploration_areas (
      id TEXT PRIMARY KEY,
      town_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      recommended_min_level INTEGER NOT NULL,
      recommended_max_level INTEGER NOT NULL,
      monster_pool_json TEXT NOT NULL,
      reward_pool_json TEXT NOT NULL,
      event_pool_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battle_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      area_id TEXT,
      monster_id TEXT NOT NULL,
      player_hp INTEGER NOT NULL,
      player_mp INTEGER NOT NULL,
      enemy_hp INTEGER NOT NULL,
      enemy_break REAL DEFAULT 0,
      turn_count INTEGER DEFAULT 0,
      status_json TEXT DEFAULT '{}',
      is_boss INTEGER DEFAULT 0,
      is_raid INTEGER DEFAULT 0,
      party_json TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battle_temp_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      upgrade_level INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_claims (
      user_id TEXT NOT NULL,
      claim_date TEXT NOT NULL,
      streak_day INTEGER NOT NULL,
      reward_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, claim_date)
    );

    CREATE TABLE IF NOT EXISTS weekly_progress (
      user_id TEXT NOT NULL,
      week_key TEXT NOT NULL,
      explore_count INTEGER DEFAULT 0,
      boss_kills INTEGER DEFAULT 0,
      raid_joins INTEGER DEFAULT 0,
      rescue_success INTEGER DEFAULT 0,
      trade_count INTEGER DEFAULT 0,
      upgrade_count INTEGER DEFAULT 0,
      town_quest_count INTEGER DEFAULT 0,
      reward_claimed INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, week_key)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      initiator_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      initiator_items_json TEXT DEFAULT '[]',
      partner_items_json TEXT DEFAULT '[]',
      initiator_confirmed INTEGER DEFAULT 0,
      partner_confirmed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rescue_requests (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      request_type TEXT NOT NULL,
      battle_id TEXT,
      area_id TEXT,
      message_id TEXT,
      channel_id TEXT,
      participants_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'open',
      is_preemptive INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raid_sessions (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      raid_area_id TEXT NOT NULL,
      message_id TEXT,
      channel_id TEXT,
      participants_json TEXT DEFAULT '[]',
      ready_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'recruiting',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS durability_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      inventory_id INTEGER NOT NULL,
      old_state TEXT NOT NULL,
      new_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_town_unlocks (
      user_id TEXT NOT NULL,
      town_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (user_id, town_id)
    );

    CREATE TABLE IF NOT EXISTS player_stats_tracking (
      user_id TEXT PRIMARY KEY,
      login_streak INTEGER DEFAULT 0,
      last_login_date TEXT
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      town_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      npc_id TEXT,
      description TEXT NOT NULL,
      action_type TEXT NOT NULL,
      unlock_condition_text TEXT
    );

    CREATE TABLE IF NOT EXISTS npc_dialogues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      npc_id TEXT NOT NULL,
      dialogue_type TEXT NOT NULL,
      text TEXT NOT NULL,
      variant INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS player_town_visits (
      user_id TEXT NOT NULL,
      town_id TEXT NOT NULL,
      visit_count INTEGER DEFAULT 0,
      first_visit_at TEXT,
      last_visit_at TEXT,
      PRIMARY KEY (user_id, town_id)
    );
  `);
}
