import { getDb } from '../db/database';
import { requirePlayer, spendGold } from './playerSystem';
import { nowIso } from '../types';

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

export function formatRestPreview(userId: string, townId: string, label: '宿屋' | '救護所'): string {
  const player = requirePlayer(userId);
  const cost = calcRestCost(userId, townId);
  const canAfford = player.gold >= cost;
  const lines = [
    `**${label}**`,
    '',
    `利用料: **${cost}G**`,
    '回復: HP/MP 全回復',
    `所持金: **${player.gold}G**`,
  ];
  if (canAfford) lines.push(`利用後: **${player.gold - cost}G**`);
  else lines.push(`不足: **${cost - player.gold}G**`);
  return lines.join('\n');
}

export function restAtInn(userId: string, townId: string, freeHeal = false): {
  paid: boolean;
  relief: boolean;
  cost: number;
  message: string;
} {
  const player = requirePlayer(userId);
  const cost = calcRestCost(userId, townId);

  if (freeHeal) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    return { paid: false, relief: false, cost: 0, message: '深く息を吐くと、体の芯まで温かさが戻ってきた。\nHPとMPが全回復した。' };
  }

  if (player.gold >= cost && spendGold(userId, cost)) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    return {
      paid: true,
      relief: false,
      cost,
      message: [
        `利用料: **${cost}G**`,
        '回復: HP/MP 全回復',
        `所持金: **${player.gold - cost}G**`,
        '',
        '深く眠り、傷と疲れを癒した。',
      ].join('\n'),
    };
  }

  const reliefHp = Math.floor(player.max_hp * 0.4);
  const reliefMp = Math.floor(player.max_mp * 0.2);
  getDb().prepare('UPDATE players SET hp=?, mp=?, updated_at=? WHERE user_id=?').run(reliefHp, reliefMp, nowIso(), userId);
  return {
    paid: false,
    relief: true,
    cost,
    message: [
      `利用料: **${cost}G**`,
      `所持金: **${player.gold}G**`,
      `不足: **${cost - player.gold}G**`,
      '',
      '十分なゴールドがありません。',
      '宿泊はできませんが、最低限の手当てを受けます。',
      '',
      `HPが40%（${reliefHp}）まで回復しました。`,
    ].join('\n'),
  };
}

export function shrineHeal(userId: string, townId: string): { message: string; cost: number; paid: boolean } {
  const cost = calcRestCost(userId, townId);
  const player = requirePlayer(userId);
  if (player.gold >= cost && spendGold(userId, cost)) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    return {
      paid: true,
      cost,
      message: [
        `利用料: **${cost}G**`,
        '回復: HP/MP 全回復',
        `所持金: **${player.gold - cost}G**`,
        '',
        '救護の手当てを受け、HP/MPが全回復した。',
      ].join('\n'),
    };
  }
  const reliefHp = Math.floor(player.max_hp * 0.4);
  const reliefMp = Math.floor(player.max_mp * 0.2);
  getDb().prepare('UPDATE players SET hp=?, mp=?, updated_at=? WHERE user_id=?').run(reliefHp, reliefMp, nowIso(), userId);
  return {
    paid: false,
    cost,
    message: [
      `利用料: **${cost}G**`,
      `所持金: **${player.gold}G**`,
      `不足: **${cost - player.gold}G**`,
      '',
      '寄付が足りないが、最低限の手当てだけは受けられた。',
      `HP ${reliefHp} / MP ${reliefMp} まで回復。`,
    ].join('\n'),
  };
}

/** @deprecated use formatRestPreview */
export function formatInnPreview(userId: string, townId: string): string {
  return formatRestPreview(userId, townId, '宿屋');
}
