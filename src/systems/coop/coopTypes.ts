export type CoopMode = 'rescue' | 'raid' | 'valhalla_coop';

export type CoopRecruitStatus =
  | 'recruiting'
  | 'full'
  | 'started'
  | 'expired'
  | 'cancelled'
  | 'completed';

export type CoopMemberRole = 'leader' | 'helper';

export type CoopMemberStatus =
  | 'joined'
  | 'ready'
  | 'alive'
  | 'action_pending'
  | 'action_submitted'
  | 'defeated'
  | 'watching'
  | 'left'
  | 'reward_granted';

export type CoopBattleStatus =
  | 'pending'
  | 'active'
  | 'resolving'
  | 'victory'
  | 'defeat'
  | 'expired';

export type CoopActionType = 'attack' | 'skill' | 'defend' | 'item';

export type CoopContext = {
  area_id?: string;
  monster_id?: string;
  monster_name?: string;
  battle_session_id?: string;
  source_enemy_hp?: number;
  source_enemy_max_hp?: number;
  monster_resolution?: 'explicit' | 'battle_session' | 'recent_battle' | 'fallback_legacy';
  rescue_type?: string;
  legacy_rescue_id?: string;
  legacy_raid_id?: string;
  area_label?: string;
};

export const COOP_MIN_PLAYERS = 2;
export const COOP_MAX_PLAYERS = 4;
export const COOP_RECRUIT_TTL_MS = 30 * 60 * 1000;
export const COOP_TURN_DEADLINE_MS = 90 * 1000;
export const COOP_RESOLVE_LOCK_STALE_MS = 2 * 60 * 1000;

export const RESCUE_HP_MULT: Record<number, number> = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.4 };
export const RESCUE_ATK_MULT: Record<number, number> = { 1: 1.0, 2: 1.10, 3: 1.18, 4: 1.25 };
export const RAID_HP_MULT: Record<number, number> = { 2: 1.8, 3: 2.6, 4: 3.4 };
export const VALHALLA_COOP_HP_MULT: Record<number, number> = { 1: 1.0, 2: 1.8, 3: 2.5, 4: 3.1 };
export const VALHALLA_COOP_BREAK_BONUS: Record<number, number> = { 2: 0.2, 3: 0.35, 4: 0.5 };

export const RAID_BOSS_ID = 'mon_deep_core_boss';

export type CoopParticipantState = {
  user_id: string;
  role: CoopMemberRole;
  hp: number;
  mp: number;
  max_hp: number;
  max_mp: number;
  attack: number;
  magic: number;
  defense: number;
  spirit: number;
  speed: number;
  poisonTurns: number;
  playerSilence: number;
  defending: boolean;
  tauntActive: boolean;
  coverTarget: string | null;
  defeated: boolean;
  atkBuff: number;
  magBuff: number;
  defBuff: number;
  actionsTaken?: number;
};

export type CoopEnemyState = {
  monster_id: string;
  name: string;
  hp: number;
  max_hp: number;
  break: number;
  break_max: number;
  attack: number;
  magic: number;
  defense: number;
  spirit: number;
  element: string | null;
  exp_reward: number;
  gold_reward: number;
};

export type CoopBattleMeta = {
  log: string[];
  breakRemainingHits: number;
  playerBreakDamageMult: number;
  enemyNextAtkReducePct: number;
  enemyNextAtkReduceActive: boolean;
  enemyBroken: boolean;
  raidTelegraph: boolean;
  raidHeavyPending: boolean;
  leader_id: string;
  recommended_level?: number;
  rescue_damage_mult?: number;
  reward_summary?: string;
};

export type CoopActionTarget = {
  kind: 'self' | 'enemy' | 'ally' | 'all_enemies' | 'all_allies';
  user_id?: string;
  monster_id?: string;
};
