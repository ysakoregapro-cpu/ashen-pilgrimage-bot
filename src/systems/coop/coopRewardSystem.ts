import { getDb } from '../../db/database';
import { nowIso } from '../../types';
import { addExp, addGold, requirePlayer } from '../playerSystem';
import { addItem } from '../inventorySystem';
import { incrementWeeklyProgress } from '../weeklySystem';
import { triggerBossDefeated } from '../storySystem';
import { generateRaidAccessoryMetadata } from '../../db/seedData/phase2Seed';
import { roll, randomInt } from '../../utils/random';
import { RAID_BOSS_ID, type CoopEnemyState, type CoopMode, type CoopParticipantState } from './coopTypes';
import { getCoopBattle } from './coopBattleSystem';

const RESCUE_HELPER_DAILY_CAP = 5;
const RESCUE_SAME_LEADER_DAILY_CAP = 2;

export type CoopRewardPayload = {
  exp: number;
  gold: number;
  items: Array<{ itemId: string; qty: number; label?: string }>;
  survived: boolean;
  role: string;
};

function hasGrantedReward(battleId: string, userId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM coop_rewards WHERE battle_id = ? AND user_id = ?').get(battleId, userId);
  return !!row;
}

function rescueHelperRewardAllowed(helperId: string, leaderId: string): boolean {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const daily = getDb().prepare(`
    SELECT COUNT(*) AS c FROM coop_rewards cr
    JOIN coop_battle_sessions cb ON cb.id = cr.battle_id
    WHERE cr.user_id = ? AND cb.mode = 'rescue' AND cr.granted_at >= ?
  `).get(helperId, dayAgo) as { c: number };
  if (daily.c >= RESCUE_HELPER_DAILY_CAP) return false;

  const sameLeader = getDb().prepare(`
    SELECT COUNT(*) AS c FROM coop_rewards cr
    JOIN coop_battle_sessions cb ON cb.id = cr.battle_id
    JOIN coop_recruits r ON r.id = cb.recruit_id
    WHERE cr.user_id = ? AND cb.mode = 'rescue' AND r.leader_id = ? AND cr.granted_at >= ?
  `).get(helperId, leaderId, dayAgo) as { c: number };
  return sameLeader.c < RESCUE_SAME_LEADER_DAILY_CAP;
}

function computeRewards(
  mode: CoopMode,
  participant: CoopParticipantState,
  enemy: CoopEnemyState,
  leaderId: string,
  playerCount: number,
): CoopRewardPayload {
  const survived = !participant.defeated && participant.hp > 0;
  const survMult = survived ? 1.1 : 1;
  const isLeader = participant.user_id === leaderId;

  if (mode === 'rescue') {
    if (isLeader) {
      return {
        exp: Math.floor(enemy.exp_reward * 0.35 * survMult),
        gold: Math.floor(enemy.gold_reward * 0.3 * survMult),
        items: [],
        survived,
        role: 'leader',
      };
    }
    const allowed = rescueHelperRewardAllowed(participant.user_id, leaderId);
    if (!allowed) {
      return { exp: Math.floor(enemy.exp_reward * 0.1), gold: 0, items: [], survived, role: 'helper_capped' };
    }
    const items: CoopRewardPayload['items'] = [];
    if (roll(0.15)) items.push({ itemId: 'mat_iron_scrap', qty: randomInt(1, 2), label: '鉄くず' });
    return {
      exp: Math.floor(enemy.exp_reward * 0.25 * survMult),
      gold: Math.floor(enemy.gold_reward * 0.2 * survMult),
      items,
      survived,
      role: 'helper',
    };
  }

  const countBonus = playerCount >= 4 ? 2 : playerCount >= 3 ? 1 : 0;
  const baseExp = Math.floor(enemy.exp_reward * 1.5 * survMult);
  const baseGold = Math.floor(enemy.gold_reward * 2 * (1 + countBonus * 0.1) * survMult);
  const items: CoopRewardPayload['items'] = [];
  if (roll(0.08)) items.push({ itemId: 'wpn_valhalla_blade', qty: 1, label: 'UR武器' });
  else if (roll(0.1)) items.push({ itemId: 'acc_raid_random', qty: 1, label: 'レイドアクセ' });
  else items.push({ itemId: 'raid_deep_core', qty: randomInt(1, 2 + countBonus), label: '深層素材' });

  return { exp: baseExp, gold: baseGold, items, survived, role: isLeader ? 'leader' : 'helper' };
}

function applyReward(userId: string, reward: CoopRewardPayload, mode: CoopMode, monsterId: string): void {
  if (reward.exp > 0) addExp(userId, reward.exp);
  if (reward.gold > 0) addGold(userId, reward.gold);
  for (const item of reward.items) {
    if (item.itemId === 'acc_raid_random') {
      addItem(userId, item.itemId, item.qty, { metadata: generateRaidAccessoryMetadata(), rollSource: 'raid_reward', valhallaOrRaid: true });
    } else {
      addItem(userId, item.itemId, item.qty);
    }
  }
  incrementWeeklyProgress(userId, mode === 'raid' ? 'raid_joins' : 'rescue_success');
  if (mode === 'raid') {
    incrementWeeklyProgress(userId, 'boss_kills');
    if (monsterId === RAID_BOSS_ID && roll(0.05)) triggerBossDefeated(userId, RAID_BOSS_ID);
  }
}

export function grantCoopBattleRewards(
  battleId: string,
  participants: CoopParticipantState[],
  enemy: CoopEnemyState,
  leaderId: string,
  mode: CoopMode,
): string {
  const battle = getCoopBattle(battleId);
  const playerCount = participants.length;
  const lines: string[] = ['**報酬**'];

  for (const p of participants) {
    if (hasGrantedReward(battleId, p.user_id)) {
      lines.push(`<@${p.user_id}> — 付与済み`);
      continue;
    }

    const reward = computeRewards(mode, p, enemy, leaderId, playerCount);
    const db = getDb();
    const inserted = db.transaction(() => {
      const r = db.prepare(`
        INSERT OR IGNORE INTO coop_rewards (battle_id, user_id, reward_json, granted_at)
        VALUES (?, ?, ?, ?)
      `).run(battleId, p.user_id, JSON.stringify(reward), nowIso());
      if (r.changes === 0) return false;
      applyReward(p.user_id, reward, mode, enemy.monster_id);
      db.prepare("UPDATE coop_members SET status = 'reward_granted' WHERE recruit_id = ? AND user_id = ?")
        .run(battle?.recruit_id, p.user_id);
      return true;
    })();

    if (!inserted) {
      lines.push(`<@${p.user_id}> — 付与済み`);
      continue;
    }

    const surv = reward.survived ? '生存+10%' : '戦闘不能';
    const itemText = reward.items.map((i) => i.label ?? i.itemId).join(', ');
    lines.push(`<@${p.user_id}> (${surv}) EXP+${reward.exp} / ${reward.gold}G${itemText ? ` / ${itemText}` : ''}`);
    if (reward.role === 'helper_capped') lines.push('  ※本日の救難報酬上限');
  }

  return lines.join('\n');
}

/** 救難成功時: 募集主HP50%復帰、MP維持、状態異常維持 */
export function applyRescueLeaderRecovery(leaderId: string, participants: CoopParticipantState[]): void {
  const leader = participants.find((p) => p.user_id === leaderId);
  const p = requirePlayer(leaderId);
  const battleHp = leader ? Math.max(1, Math.floor(leader.max_hp * 0.5)) : Math.max(1, Math.floor(p.max_hp * 0.5));
  const battleMp = leader?.mp ?? p.mp;
  getDb().prepare('UPDATE players SET hp = ?, mp = ?, updated_at = ? WHERE user_id = ?')
    .run(battleHp, battleMp, nowIso(), leaderId);

  const battle = getDb().prepare(`
    SELECT context_json FROM coop_recruits r
    JOIN coop_battle_sessions cb ON cb.recruit_id = r.id
    WHERE r.leader_id = ? AND r.mode = 'rescue' ORDER BY cb.created_at DESC LIMIT 1
  `).get(leaderId) as { context_json: string } | undefined;
  if (battle) {
    try {
      const ctx = JSON.parse(battle.context_json) as { battle_session_id?: string };
      if (ctx.battle_session_id) {
        getDb().prepare("UPDATE battle_sessions SET status = 'fled', updated_at = ? WHERE id = ? AND status = 'active'")
          .run(nowIso(), ctx.battle_session_id);
      }
    } catch { /* ignore */ }
  }
}

export function getCoopReward(battleId: string, userId: string): CoopRewardPayload | undefined {
  const row = getDb().prepare('SELECT reward_json FROM coop_rewards WHERE battle_id = ? AND user_id = ?')
    .get(battleId, userId) as { reward_json: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.reward_json) as CoopRewardPayload;
}
