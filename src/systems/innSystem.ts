import { getDb } from '../db/database';
import { requirePlayer, spendGold } from './playerSystem';
import { nowIso } from '../types';

export type RestOutcome = {
  ok: boolean;
  reason?: 'already_full' | 'insufficient_gold';
  paid: boolean;
  cost: number;
  message: string;
};

export function calcInnCost(userId: string, townId: string): number {
  const player = requirePlayer(userId);
  const town = getDb().prepare('SELECT required_level FROM towns WHERE id = ?').get(townId) as { required_level: number } | undefined;
  const townTier = town?.required_level ?? 1;
  const lv = player.level;

  if (townId === 'valhalla_fortress' || townTier >= 55) {
    return Math.min(1500, 800 + Math.floor(lv * 8));
  }
  if (townTier >= 40 || lv >= 45) {
    return Math.min(700, 300 + Math.floor(lv * 6));
  }
  if (townTier >= 20 || lv >= 25) {
    return Math.min(250, 100 + Math.floor(lv * 4));
  }
  return Math.min(80, 30 + Math.floor(lv * 3));
}

/** 宿屋・救護所共通の回復料金 */
export function calcRestCost(userId: string, townId: string): number {
  return calcInnCost(userId, townId);
}

export function isFullyRested(userId: string): boolean {
  const player = requirePlayer(userId);
  return player.hp >= player.max_hp && player.mp >= player.max_mp;
}

export function formatRestPreview(userId: string, townId: string, label: '宿屋' | '救護所'): string {
  const player = requirePlayer(userId);
  const cost = calcRestCost(userId, townId);
  if (isFullyRested(userId)) {
    return ['**' + label + '**', '', '今は休まなくても大丈夫そうです。'].join('\n');
  }
  const canAfford = player.gold >= cost;
  const lines = [
    `**${label}**`,
    '',
    `利用料: **${cost}G**`,
    '回復: HP/MP 全回復',
    `所持金: **${player.gold}G**`,
  ];
  if (canAfford) lines.push(`利用後: **${player.gold - cost}G**`);
  else {
    lines.push(`不足: **${cost - player.gold}G**`);
    lines.push('', '手持ちのGが足りないようです。', 'もう少し探索してから戻ってきてください。');
  }
  return lines.join('\n');
}

export function restAtInn(userId: string, townId: string, freeHeal = false): RestOutcome {
  const player = requirePlayer(userId);
  const cost = calcRestCost(userId, townId);

  if (isFullyRested(userId)) {
    return { ok: false, reason: 'already_full', paid: false, cost: 0, message: '今は休まなくても大丈夫そうです。' };
  }

  if (freeHeal) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    return {
      ok: true, paid: false, cost: 0,
      message: '深く息を吐くと、体の芯まで温かさが戻ってきた。\nHPとMPが全回復した。',
    };
  }

  if (player.gold < cost) {
    return {
      ok: false,
      reason: 'insufficient_gold',
      paid: false,
      cost,
      message: [
        `利用料: **${cost}G**`,
        `所持金: **${player.gold}G**`,
        '',
        '手持ちのGが足りないようです。',
        'もう少し探索してから戻ってきてください。',
      ].join('\n'),
    };
  }

  if (!spendGold(userId, cost)) {
    return {
      ok: false,
      reason: 'insufficient_gold',
      paid: false,
      cost,
      message: '手持ちのGが足りないようです。\nもう少し探索してから戻ってきてください。',
    };
  }

  getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
  const after = requirePlayer(userId);
  return {
    ok: true,
    paid: true,
    cost,
    message: [
      `利用料: **${cost}G**`,
      '回復: HP/MP 全回復',
      `所持金: **${after.gold}G**`,
      '',
      '深く眠り、傷と疲れを癒した。',
    ].join('\n'),
  };
}

export function shrineHeal(userId: string, townId: string): RestOutcome {
  const result = restAtInn(userId, townId);
  if (!result.ok) return result;
  return {
    ...result,
    message: result.message.replace('深く眠り、傷と疲れを癒した。', '救護の手当てを受け、HP/MPが全回復した。'),
  };
}

/** @deprecated use formatRestPreview */
export function formatInnPreview(userId: string, townId: string): string {
  return formatRestPreview(userId, townId, '宿屋');
}
