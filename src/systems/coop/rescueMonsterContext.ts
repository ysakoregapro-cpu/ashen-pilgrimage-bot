import { getDb } from '../../db/database';
import { getActiveBattle } from '../battleSystem';
import { scaleMonsterForBattle, getMonsterThreatTier } from '../combatMath';
import type { CoopContext } from './coopTypes';

export type RescueMonsterSnapshot = {
  monster_id: string;
  monster_name: string;
  enemy_hp?: number;
  enemy_max_hp?: number;
  source_battle_session_id?: string;
};

export function snapshotFromBattleSession(battleSessionId: string): RescueMonsterSnapshot | null {
  const row = getDb().prepare(`
    SELECT monster_id, enemy_hp, enemy_state_json, area_id, is_boss
    FROM battle_sessions WHERE id = ?
  `).get(battleSessionId) as {
    monster_id: string;
    enemy_hp: number;
    enemy_state_json: string | null;
    area_id: string | null;
    is_boss: number;
  } | undefined;

  if (!row?.monster_id) return null;

  const mon = getDb().prepare(`
    SELECT id, name, hp, attack, magic, defense, spirit, speed, level, area_tag
    FROM monsters WHERE id = ?
  `).get(row.monster_id) as {
    id: string; name: string; hp: number; attack: number; magic: number;
    defense: number; spirit: number; speed: number; level: number; area_tag: string;
  } | undefined;
  if (!mon) return null;

  let enemyMaxHp = row.enemy_hp;
  if (row.enemy_state_json) {
    try {
      const es = JSON.parse(row.enemy_state_json) as { enemies?: Array<{ max_hp?: number; hp?: number }> };
      const sumMax = es.enemies?.reduce((s, e) => s + (e.max_hp ?? e.hp ?? 0), 0);
      if (sumMax && sumMax > 0) enemyMaxHp = sumMax;
    } catch { /* ignore */ }
  }
  if (!enemyMaxHp || enemyMaxHp <= 0) {
    const scaled = scaleMonsterForBattle(
      { ...mon, id: mon.id, area_tag: mon.area_tag ?? 'starfield' },
      { forceBoss: row.is_boss === 1, isStoryBoss: row.is_boss === 1 },
    );
    enemyMaxHp = scaled.hp;
  }

  return {
    monster_id: mon.id,
    monster_name: mon.name,
    enemy_hp: row.enemy_hp,
    enemy_max_hp: enemyMaxHp,
    source_battle_session_id: battleSessionId,
  };
}

/** 救難用: 直近の solo 戦闘（進行中・敗北・逃走） */
function getLatestBattleForRescue(userId: string): {
  id: string;
  monster_id: string;
  enemy_hp: number;
} | null {
  const row = getDb().prepare(`
    SELECT id, monster_id, enemy_hp FROM battle_sessions
    WHERE user_id = ? AND status IN ('active', 'defeat', 'fled') AND monster_id IS NOT NULL AND monster_id != ''
    ORDER BY updated_at DESC LIMIT 1
  `).get(userId) as { id: string; monster_id: string; enemy_hp: number } | undefined;
  return row ?? null;
}

/** 救難募集 context に battle / monster 情報を補完 */
export function enrichRescueContext(ctx: CoopContext, leaderId?: string): CoopContext {
  const out: CoopContext = { ...ctx };

  if (leaderId) {
    if (!out.battle_session_id) {
      const active = getActiveBattle(leaderId) as { id: string; monster_id?: string; enemy_hp?: number } | undefined;
      if (active?.id) {
        out.battle_session_id = active.id;
        if (!out.monster_id && active.monster_id) out.monster_id = active.monster_id;
        if (out.source_enemy_hp == null && active.enemy_hp != null) out.source_enemy_hp = active.enemy_hp;
      } else if (!out.monster_id && ctx.rescue_type !== 'preemptive') {
        const latest = getLatestBattleForRescue(leaderId);
        if (latest) {
          out.battle_session_id = latest.id;
          out.monster_id = latest.monster_id;
          if (out.source_enemy_hp == null) out.source_enemy_hp = latest.enemy_hp;
          out.monster_resolution = out.monster_resolution ?? 'recent_battle';
        }
      }
    }
  }

  if (out.battle_session_id) {
    const snap = snapshotFromBattleSession(out.battle_session_id);
    if (snap) {
      out.monster_id = snap.monster_id;
      out.monster_name = snap.monster_name;
      out.source_enemy_hp = snap.enemy_hp;
      out.source_enemy_max_hp = snap.enemy_max_hp;
      out.monster_resolution = out.monster_resolution ?? 'battle_session';
    }
  }

  if (out.monster_id && !out.monster_name) {
    const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(out.monster_id) as { name: string } | undefined;
    if (mon) out.monster_name = mon.name;
  }

  if (out.monster_id && !out.monster_resolution) {
    out.monster_resolution = 'explicit';
  }

  return out;
}

export function resolveRescueMonsterId(ctx: CoopContext): {
  monsterId: string;
  monsterName: string;
  usesFallback: boolean;
  resolution: string;
} {
  if (ctx.monster_id) {
    return {
      monsterId: ctx.monster_id,
      monsterName: ctx.monster_name ?? ctx.monster_id,
      usesFallback: false,
      resolution: ctx.monster_resolution ?? 'explicit',
    };
  }
  if (ctx.battle_session_id) {
    const snap = snapshotFromBattleSession(ctx.battle_session_id);
    if (snap) {
      return {
        monsterId: snap.monster_id,
        monsterName: snap.monster_name,
        usesFallback: false,
        resolution: 'battle_session',
      };
    }
  }

  console.warn('[rescue] monster_id unresolved — fallback', JSON.stringify({
    battle_session_id: ctx.battle_session_id,
    rescue_type: ctx.rescue_type,
  }));

  const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get('mon_bandit') as { name: string } | undefined;
  return {
    monsterId: 'mon_bandit',
    monsterName: mon?.name ?? '野盗見習い',
    usesFallback: true,
    resolution: 'fallback_legacy',
  };
}

export function scaledRescueEnemyHp(
  baseHp: number,
  participantCount: number,
  ctx: CoopContext,
): { maxHp: number; currentHp: number } {
  const multTable = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.4 } as const;
  const mult = multTable[Math.min(4, Math.max(1, participantCount)) as keyof typeof multTable] ?? 2.4;
  let base = baseHp;
  if (ctx.source_enemy_max_hp && ctx.source_enemy_max_hp > 0) {
    base = ctx.source_enemy_max_hp;
  }
  const maxHp = Math.max(1, Math.floor(base * mult));
  let current = maxHp;
  if (ctx.source_enemy_hp != null && ctx.source_enemy_max_hp && ctx.source_enemy_max_hp > 0) {
    const ratio = Math.max(0, Math.min(1, ctx.source_enemy_hp / ctx.source_enemy_max_hp));
    current = Math.max(1, Math.floor(maxHp * ratio));
  }
  return { maxHp, currentHp: current };
}

export function getMonsterBaseHpForRescue(monsterId: string, isBoss = false): number {
  const mon = getDb().prepare(`
    SELECT id, hp, level, area_tag, attack, magic, defense, spirit, speed
    FROM monsters WHERE id = ?
  `).get(monsterId) as {
    id: string; hp: number; level: number; area_tag: string;
    attack: number; magic: number; defense: number; spirit: number; speed: number;
  } | undefined;
  if (!mon) return 60;
  const tier = getMonsterThreatTier(mon.id, { forceBoss: isBoss });
  const scaled = scaleMonsterForBattle(
    { ...mon, id: mon.id, area_tag: mon.area_tag ?? 'starfield' },
    { forceBoss: isBoss, isStoryBoss: isBoss },
  );
  void tier;
  return scaled.hp;
}
