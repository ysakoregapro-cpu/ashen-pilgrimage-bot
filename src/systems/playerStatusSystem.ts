import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { nowIso } from '../types';
import type { BattleStatusState } from './statusEffectSystem';

export type PlayerStatusEffect = {
  effect_key: string;
  stacks: number;
  updated_at: string;
};

const EFFECT_LABELS: Record<string, string> = {
  poison: '毒',
  burn: '火傷',
};

export function getPlayerStatusEffects(userId: string): PlayerStatusEffect[] {
  return getDb().prepare(`
    SELECT effect_key, stacks, updated_at FROM player_status_effects WHERE user_id = ?
  `).all(userId) as PlayerStatusEffect[];
}

export function hasPlayerStatusEffects(userId: string): boolean {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS c FROM player_status_effects WHERE user_id = ? AND stacks > 0
  `).get(userId) as { c: number };
  return row.c > 0;
}

export function setPlayerStatusEffect(userId: string, effectKey: string, stacks: number): void {
  if (stacks <= 0) {
    getDb().prepare('DELETE FROM player_status_effects WHERE user_id = ? AND effect_key = ?').run(userId, effectKey);
    return;
  }
  getDb().prepare(`
    INSERT INTO player_status_effects (user_id, effect_key, stacks, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, effect_key) DO UPDATE SET stacks = excluded.stacks, updated_at = excluded.updated_at
  `).run(userId, effectKey, stacks, nowIso());
}

export function clearPlayerStatusEffects(userId: string): void {
  getDb().prepare('DELETE FROM player_status_effects WHERE user_id = ?').run(userId);
}

export function formatPlayerStatusLine(userId: string): string | null {
  const effects = getPlayerStatusEffects(userId).filter((e) => e.stacks > 0);
  if (!effects.length) return null;
  const parts = effects.map((e) => {
    const label = EFFECT_LABELS[e.effect_key] ?? e.effect_key;
    return e.stacks > 1 ? `${label}×${e.stacks}` : label;
  });
  return `状態異常: ${parts.join(' / ')}`;
}

/** Exploration tick — poison deals 3% max HP damage */
export function applyExplorationStatusTick(userId: string): { damage: number; message: string | null } {
  const player = requirePlayer(userId);
  const poison = getPlayerStatusEffects(userId).find((e) => e.effect_key === 'poison' && e.stacks > 0);
  if (!poison) return { damage: 0, message: null };

  const dmg = Math.max(1, Math.floor(player.max_hp * 0.03));
  const newHp = Math.max(1, player.hp - dmg);
  getDb().prepare('UPDATE players SET hp = ?, updated_at = ? WHERE user_id = ?').run(newHp, nowIso(), userId);
  return { damage: dmg, message: `毒が体を蝕む… **${dmg}** ダメージ。` };
}

export function loadBattleStatusFromPlayer(userId: string): Partial<BattleStatusState> {
  const effects = getPlayerStatusEffects(userId);
  const poison = effects.find((e) => e.effect_key === 'poison');
  if (poison && poison.stacks > 0) {
    return { poisonTurns: poison.stacks };
  }
  return {};
}

export function persistPlayerPoisonFromBattle(userId: string, poisonTurns: number): void {
  setPlayerStatusEffect(userId, 'poison', poisonTurns);
}

export function syncBattleResourcesToPlayer(userId: string, hp: number, mp: number): void {
  const player = requirePlayer(userId);
  const clampedHp = Math.min(Math.max(0, hp), player.max_hp);
  const clampedMp = Math.min(Math.max(0, mp), player.max_mp);
  getDb().prepare('UPDATE players SET hp = ?, mp = ?, updated_at = ? WHERE user_id = ?')
    .run(clampedHp, clampedMp, nowIso(), userId);
}

export function syncBattleStatusToPlayer(userId: string, state: BattleStatusState): void {
  persistPlayerPoisonFromBattle(userId, state.poisonTurns);
}
