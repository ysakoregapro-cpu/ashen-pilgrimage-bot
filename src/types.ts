export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR' | 'Src';
export type EquipmentSlot =
  | 'weapon'
  | 'head'
  | 'body'
  | 'arms'
  | 'legs'
  | 'feet'
  | 'accessory1'
  | 'accessory2'
  | 'sub'
  | 'appearance_head'
  | 'appearance_body'
  | 'appearance_arms'
  | 'appearance_legs'
  | 'appearance_feet'
  | 'appearance_weapon';

export type DurabilityState = '良好' | '摩耗' | '損傷' | '破損';

export type ItemCategory =
  | 'equipment'
  | 'consumable'
  | 'material'
  | 'common_material'
  | 'area_material'
  | 'dismantle_material'
  | 'upgrade_stone'
  | 'set_fragment'
  | 'boss_material'
  | 'raid_material'
  | 'src_core'
  | 'src_upgrade_material'
  | 'repair_material'
  | 'key_item';

export type BattleStatus = 'active' | 'victory' | 'defeat' | 'fled' | 'rescued';

export type TradeStatus = 'pending' | 'confirmed_a' | 'confirmed_b' | 'completed' | 'cancelled';

export interface Player {
  user_id: string;
  guild_id: string;
  private_channel_id: string | null;
  name: string;
  level: number;
  exp: number;
  total_exp: number;
  gold: number;
  main_job: string;
  sub_job: string | null;
  current_town_id: string;
  last_safe_town_id: string;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  attack: number;
  magic: number;
  defense: number;
  spirit: number;
  speed: number;
  crit_rate: number;
  crit_damage: number;
  accuracy: number;
  evasion: number;
  created_at: string;
  updated_at: string;
}

export interface PlayerInventoryRow {
  id: number;
  user_id: string;
  item_id: string;
  quantity: number;
  upgrade_level: number;
  durability_state: DurabilityState;
  src_level: number;
  awakening_level: number;
  is_equipped: number;
  is_pending_reward: number;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  description: string;
  source_text: string | null;
  usage_text: string | null;
  sell_price: number;
  tradeable: number;
  icon: string | null;
  image_url: string | null;
  appearance_id: string | null;
  created_at: string;
}

export interface Equipment {
  item_id: string;
  slot: EquipmentSlot;
  series_id: string | null;
  weapon_type: string | null;
  attack_bonus: number;
  magic_bonus: number;
  defense_bonus: number;
  spirit_bonus: number;
  speed_bonus: number;
  hp_bonus: number;
  mp_bonus: number;
  crit_rate_bonus: number;
  crit_damage_bonus: number;
  accuracy_bonus: number;
  evasion_bonus: number;
  special_effect_json: string | null;
  skill_id: string | null;
  max_upgrade_level: number;
  is_unique: number;
  src_weapon_id: string | null;
}

export interface Job {
  id: string;
  name: string;
  tier: 'basic' | 'advanced' | 'hidden';
  description: string;
  hp_mod: number;
  mp_mod: number;
  attack_mod: number;
  magic_mod: number;
  defense_mod: number;
  spirit_mod: number;
  speed_mod: number;
  unlock_condition: string | null;
}

export interface Skill {
  id: string;
  name: string;
  job_id: string;
  description: string;
  mp_cost: number;
  power: number;
  skill_type: 'physical' | 'magical' | 'heal' | 'buff' | 'debuff' | 'special';
  element: string | null;
  break_power: number;
  effect_json: string | null;
}

export interface Monster {
  id: string;
  name: string;
  area_tag: string;
  level: number;
  hp: number;
  mp: number;
  attack: number;
  magic: number;
  defense: number;
  spirit: number;
  speed: number;
  break_max: number;
  element: string | null;
  drop_pool_json: string;
  exp_reward: number;
  gold_reward: number;
  ai_pattern_json: string;
}

export interface ExplorationArea {
  id: string;
  town_id: string;
  name: string;
  description: string;
  recommended_min_level: number;
  recommended_max_level: number;
  monster_pool_json: string;
  reward_pool_json: string;
  event_pool_json: string;
}

export interface BattleSession {
  id: string;
  user_id: string;
  area_id: string | null;
  monster_id: string;
  player_hp: number;
  player_mp: number;
  enemy_hp: number;
  enemy_break: number;
  turn_count: number;
  status_json: string;
  is_boss: number;
  is_raid: number;
  party_json: string | null;
  status: BattleStatus;
  created_at: string;
  updated_at: string;
}

export interface StatModifiers {
  hp_pct: number;
  mp_pct: number;
  attack_pct: number;
  magic_pct: number;
  defense_pct: number;
  spirit_pct: number;
  speed_pct: number;
  crit_rate: number;
  crit_damage: number;
  accuracy: number;
  evasion: number;
  heal_bonus_pct: number;
  explore_drop_pct: number;
  flee_bonus_pct: number;
}

export const ARMOR_SLOTS: EquipmentSlot[] = ['head', 'body', 'arms', 'legs', 'feet'];

export const SLOT_LABELS: Record<string, string> = {
  weapon: '武器',
  head: '頭',
  body: '胴',
  arms: '腕',
  legs: '脚',
  feet: '靴',
  accessory1: 'アクセ1',
  accessory2: 'アクセ2',
  sub: '補助',
};

export const RARITY_EMOJI: Record<Rarity, string> = {
  N: '⚪',
  R: '🔵',
  SR: '🟣',
  SSR: '🟡',
  UR: '🔴',
  Src: '✨',
};

export const DURABILITY_ORDER: DurabilityState[] = ['良好', '摩耗', '損傷', '破損'];

export const DURABILITY_PENALTY: Record<DurabilityState, number> = {
  良好: 1.0,
  摩耗: 0.95,
  損傷: 0.85,
  破損: 0.7,
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function weekKey(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  return monday.toISOString().slice(0, 10);
}
