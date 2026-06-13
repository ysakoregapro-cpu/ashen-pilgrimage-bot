import { getDb } from '../db/database';
import { requirePlayer, spendGold, getUnlockedTowns } from './playerSystem';
import { clearPlayerStatusEffects, hasPlayerStatusEffects } from './playerStatusSystem';
import { nowIso } from '../types';

export type RestOutcome = {
  ok: boolean;
  reason?: 'already_full' | 'insufficient_gold';
  paid: boolean;
  cost: number;
  message: string;
};

/** 解放済み町のうち最高 required_level（宿代ティア決定用） */
export function getHighestUnlockedTownTier(userId: string): number {
  const player = requirePlayer(userId);
  const townIds = new Set(getUnlockedTowns(userId));
  townIds.add(player.current_town_id);
  townIds.add('start_starfield');

  let maxTier = 1;
  for (const townId of townIds) {
    const row = getDb().prepare('SELECT required_level FROM towns WHERE id = ?').get(townId) as { required_level: number } | undefined;
    if (row) maxTier = Math.max(maxTier, row.required_level);
  }
  return maxTier;
}

export function calcInnCost(userId: string, _townId: string): number {
  const player = requirePlayer(userId);
  const townTier = getHighestUnlockedTownTier(userId);
  const lv = player.level;

  if (townTier >= 55) {
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

export function calcShrineCost(userId: string, townId: string): number {
  return Math.floor(calcInnCost(userId, townId) * 0.5);
}

/** @deprecated use calcInnCost or calcShrineCost */
export function calcRestCost(userId: string, townId: string): number {
  return calcInnCost(userId, townId);
}

export function isFullyRested(userId: string): boolean {
  const player = requirePlayer(userId);
  if (player.hp < player.max_hp || player.mp < player.max_mp) return false;
  if (hasPlayerStatusEffects(userId)) return false;
  return true;
}

export function formatRestPreview(userId: string, townId: string, label: '宿屋' | '救護所'): string {
  const player = requirePlayer(userId);
  const isShrine = label === '救護所';
  const cost = isShrine ? calcShrineCost(userId, townId) : calcInnCost(userId, townId);
  if (isFullyRested(userId)) {
    return ['**' + label + '**', '', '今は休まなくても大丈夫そうです。'].join('\n');
  }
  const canAfford = player.gold >= cost;
  const recoveryLine = isShrine
    ? '回復: MP全回復 / 状態異常解除 / HP最大25%まで'
    : '回復: HP/MP全回復 / 状態異常解除';
  const costNote = isShrine ? '（宿屋の半額）' : '';
  const lines = [
    `**${label}**`,
    '',
    `利用料: **${cost}G**${costNote}`,
    recoveryLine,
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
  const cost = calcInnCost(userId, townId);

  if (isFullyRested(userId)) {
    return { ok: false, reason: 'already_full', paid: false, cost: 0, message: '今は休まなくても大丈夫そうです。' };
  }

  if (freeHeal) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    clearPlayerStatusEffects(userId);
    return {
      ok: true, paid: false, cost: 0,
      message: '深く息を吐くと、体の芯まで温かさが戻ってきた。\nHPとMPが全回復し、状態異常が治った。',
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
  clearPlayerStatusEffects(userId);
  const after = requirePlayer(userId);
  return {
    ok: true,
    paid: true,
    cost,
    message: [
      `利用料: **${cost}G**`,
      '回復: HP/MP全回復 / 状態異常解除',
      `所持金: **${after.gold}G**`,
      '',
      '深く眠り、傷と疲れを癒した。',
    ].join('\n'),
  };
}

export function shrineHeal(userId: string, townId: string): RestOutcome {
  const player = requirePlayer(userId);
  const cost = calcShrineCost(userId, townId);

  if (isFullyRested(userId)) {
    return { ok: false, reason: 'already_full', paid: false, cost: 0, message: '今は休まなくても大丈夫そうです。' };
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

  const hpFloor = Math.ceil(player.max_hp * 0.25);
  const newHp = Math.min(player.max_hp, Math.max(player.hp, hpFloor));
  getDb().prepare('UPDATE players SET hp=?, mp=max_mp, updated_at=? WHERE user_id=?').run(newHp, nowIso(), userId);
  clearPlayerStatusEffects(userId);
  const after = requirePlayer(userId);
  return {
    ok: true,
    paid: true,
    cost,
    message: [
      `利用料: **${cost}G**`,
      '回復: MP全回復 / 状態異常解除 / HP最大25%まで',
      `所持金: **${after.gold}G**`,
      '',
      '救護の手当てを受け、傷が少し癒えた。',
    ].join('\n'),
  };
}

/** @deprecated use formatRestPreview */
export function formatInnPreview(userId: string, townId: string): string {
  return formatRestPreview(userId, townId, '宿屋');
}
