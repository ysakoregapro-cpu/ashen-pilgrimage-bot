import type { EquipStatRow } from './enhanceSystem';

import { computeSrcBaseStats } from './enhanceSystem';
import {
  MAX_SRC_WEAPON_LEVEL,
  SRC_UR_TARGET_DIFF_HARD_MAX,
  SRC_UR_TARGET_DIFF_MIN,
  SRC_UR_TARGET_DIFF_MAX,
  UR_MAX_AWAKENING_PRIMARY_BONUS,
  UR_MAX_UPGRADE_LEVEL,
} from '../db/seedData/weaponTierBalanceMaster';



export { computeSrcBaseStats, STANDARD_UPGRADE_PCT_PER_LEVEL, UNI_UPGRADE_PCT_EARLY, UNI_UPGRADE_PCT_LATE } from './enhanceSystem';

export { calcSrcLevelPctBonus, calcUniUpgradePctBonus, calcUpgradePctBonus } from './enhanceSystem';



export type WeaponPowerRow = {

  weaponType: string;

  label: string;

  srMax: number;

  ssrMax: number;

  uni0: number;

  uni4: number;

  uniMax: number;

  ur0: number;

  urMid: number;

  urMax: number;

  src0: number;

  srcMid: number;

  srcMax: number;

  verdict: string;

};



export const STAFF_DETAIL_IDS = [

  { id: 'wpn_moon_staff_sr', label: '月読の杖', note: 'SR+7' },

  { id: 'wpn_unique_silence', label: '静寂の聖印', note: 'SR+7' },

  { id: 'wpn_unique_mist_lantern', label: '霧灯の星杖', note: 'Uni' },

  { id: 'wpn_old_king_staff', label: '旧王の魔杖', note: 'UR' },

  { id: 'wpn_src_mist_lantern', label: 'Src: 霧灯星杖', note: 'Src' },

] as const;



export const WEAPON_TYPE_SAMPLES: Array<{

  type: string;

  label: string;

  srMax: string;

  ssrMax: string;

  uni: string;

  ur: string;

  src: string;

}> = [

  { type: 'sword', label: '剣', srMax: 'wpn_black_exec_blade', ssrMax: 'wpn_ash_knight_sword', uni: 'wpn_unique_twilight', ur: 'wpn_valhalla_blade', src: 'wpn_src_twilight' },

  { type: 'dagger', label: '短剣', srMax: 'wpn_black_exec_blade', ssrMax: 'wpn_ash_wing_twin', uni: 'wpn_unique_mirror', ur: 'wpn_ash_wing_twin', src: 'wpn_src_mirror' },

  { type: 'bow', label: '弓', srMax: 'wpn_mist_bow_sr', ssrMax: 'wpn_hollow_bell_bow', uni: 'wpn_unique_echo', ur: 'wpn_sky_bow_fress', src: 'wpn_src_echo' },

  { type: 'hammer', label: '槌', srMax: 'wpn_red_ash_axe_sr', ssrMax: 'wpn_black_iron_blade', uni: 'wpn_unique_old_hammer', ur: 'wpn_black_exec_sword', src: 'wpn_src_silver' },

  { type: 'spear', label: '槍', srMax: 'wpn_starfall_spear', ssrMax: 'wpn_dragon_pierce', uni: 'wpn_unique_star_scar', ur: 'wpn_core_spear_grau', src: 'wpn_src_star_scar' },

  { type: 'staff', label: '杖', srMax: 'wpn_moon_staff_sr', ssrMax: 'wpn_moon_spell_staff', uni: 'wpn_unique_mist_lantern', ur: 'wpn_old_king_staff', src: 'wpn_src_mist_lantern' },

  { type: 'rod', label: '短杖', srMax: 'wpn_silence_seal_sr', ssrMax: 'wpn_prayer_robe_weapon', uni: 'wpn_unique_lamp', ur: 'wpn_starfall_judge', src: 'wpn_src_lamp' },

  { type: 'fist', label: '拳', srMax: 'wpn_dragon_fist_sr', ssrMax: 'wpn_dragon_pierce', uni: 'wpn_unique_black_fox', ur: 'wpn_valhalla_blade', src: 'wpn_src_black_fox' },

  { type: 'cannon', label: '砲', srMax: 'wpn_red_ash_axe_sr', ssrMax: 'wpn_deep_cannon', uni: 'wpn_unique_deep', ur: 'wpn_deep_cannon_regin', src: 'wpn_src_deep' },

  { type: 'shield', label: '盾', srMax: 'wpn_ash_knight_shield', ssrMax: 'wpn_iron_snow_greatshield', uni: 'wpn_unique_old_shield', ur: 'wpn_zero_shield', src: 'wpn_src_old_shield' },

];



const SHIELD_IMPLIED_DEF: Record<string, number> = { N: 6, R: 8, SR: 10, SSR: 14, UR: 20, Uni: 15, Src: 18 };



type StatFn = (eq: EquipStatRow, upg: number, src: number, dur: number, rarity: string) => {

  attack: number; magic: number; defense: number; spirit: number;

};



type DbRow = {

  item_id: string;

  rarity: string;

  weapon_type: string | null;

  attack_bonus: number;

  magic_bonus: number;

  defense_bonus: number;

  spirit_bonus: number;

  speed_bonus: number;

  hp_bonus: number;

  slot: string;

  max_upgrade_level: number;

};



export function calcShieldEffectiveScore(

  row: DbRow,

  upgradeLevel: number,

  srcLevel: number,

  getStat: StatFn,

): number {

  const eq: EquipStatRow = {

    attack_bonus: row.attack_bonus,

    magic_bonus: row.magic_bonus,

    defense_bonus: row.defense_bonus,

    spirit_bonus: row.spirit_bonus,

    speed_bonus: row.speed_bonus,

    hp_bonus: row.hp_bonus,

    weapon_type: row.weapon_type,

    slot: row.slot,

  };

  const stats = getStat(eq, upgradeLevel, srcLevel, 1, row.rarity);

  const impliedDef = SHIELD_IMPLIED_DEF[row.rarity] ?? 8;

  const pct = row.attack_bonus > 0 ? stats.attack / row.attack_bonus : 1;

  const blockPower = Math.floor(impliedDef * pct);

  return stats.attack + Math.floor(blockPower * 2.5) + Math.floor(stats.spirit * 0.5);

}



export function judgeWeaponPower(row: Omit<WeaponPowerRow, 'verdict'>): string {
  const issues: string[] = [];
  const isShield = row.weaponType === 'shield';
  const uni4Low = isShield ? 0.80 : 0.95;
  const uni4High = isShield ? 1.25 : 1.05;
  const src0Max = isShield ? 1.0 : 0.95;
  const srcMidMin = isShield ? 0.85 : 1.0;
  const urMaxEff = row.urMax + UR_MAX_AWAKENING_PRIMARY_BONUS;

  if (row.uni4 < row.ur0 * uni4Low || row.uni4 > row.ur0 * uni4High) issues.push('Uni+4≒UR+0外');
  if (row.uniMax <= row.ur0) issues.push('Uni最大≯UR+0');
  if (row.uniMax >= urMaxEff) issues.push('Uni最大≮UR最大');
  if (row.src0 > row.ur0 * src0Max) issues.push('Src+0>UR+0×95%');
  if (row.srcMid < row.urMid * srcMidMin || row.srcMid >= urMaxEff) issues.push('Src中間≈UR中間〜UR最大手前外');
  if (row.srcMax <= urMaxEff) issues.push('Src最大≯UR+15覚醒IV');
  else {
    const diff = row.srcMax - urMaxEff;
    if (diff < SRC_UR_TARGET_DIFF_MIN) issues.push(`Src差不足(${diff}<${SRC_UR_TARGET_DIFF_MIN})`);
    if (diff > SRC_UR_TARGET_DIFF_HARD_MAX) issues.push(`Src差過大(${diff})`);
  }
  if (row.srcMax <= row.uniMax) issues.push('Src最大≯Uni最大');
  if (row.srMax >= row.uniMax) issues.push('SR最大≮Uni最大');
  return issues.length ? issues.join(', ') : 'OK';
}



export function loadWeaponEquipRow(

  db: import('better-sqlite3').Database,

  itemId: string,

): DbRow | undefined {

  return db.prepare(`

    SELECT i.id AS item_id, i.rarity, e.weapon_type, e.attack_bonus, e.magic_bonus,

      e.defense_bonus, e.spirit_bonus, e.speed_bonus, e.hp_bonus, e.slot, e.max_upgrade_level

    FROM items i JOIN equipment e ON i.id = e.item_id

    WHERE i.id = ? AND e.slot = 'weapon'

  `).get(itemId) as DbRow | undefined;

}



export function primaryStatAt(

  row: DbRow,

  upgradeLevel: number,

  srcLevel: number,

  getStat: StatFn,

): number {

  if (row.weapon_type === 'shield') {

    return calcShieldEffectiveScore(row, upgradeLevel, srcLevel, getStat);

  }

  const eq: EquipStatRow = {

    attack_bonus: row.attack_bonus,

    magic_bonus: row.magic_bonus,

    defense_bonus: row.defense_bonus,

    spirit_bonus: row.spirit_bonus,

    speed_bonus: row.speed_bonus,

    hp_bonus: row.hp_bonus,

    weapon_type: row.weapon_type,

    slot: row.slot,

  };

  const stats = getStat(eq, upgradeLevel, srcLevel, 1, row.rarity);

  const wtype = row.weapon_type ?? '';

  if (['staff', 'rod', 'spell_staff', 'seal', 'tuner', 'bind', 'robe'].includes(wtype)

    || (row.magic_bonus > row.attack_bonus && row.slot === 'weapon')) {

    return stats.magic;

  }

  if (row.attack_bonus >= row.magic_bonus) return stats.attack;

  return stats.magic;

}



export function buildWeaponPowerComparison(

  db: import('better-sqlite3').Database,

  getStat: StatFn,

): WeaponPowerRow[] {

  const out: WeaponPowerRow[] = [];

  for (const sample of WEAPON_TYPE_SAMPLES) {

    const sr = loadWeaponEquipRow(db, sample.srMax);

    const ssr = loadWeaponEquipRow(db, sample.ssrMax);

    const uni = loadWeaponEquipRow(db, sample.uni);

    const ur = loadWeaponEquipRow(db, sample.ur);

    const src = loadWeaponEquipRow(db, sample.src);

    if (!sr || !ssr || !uni || !ur || !src) continue;



    const base = {

      weaponType: sample.type,

      label: sample.label,

      srMax: primaryStatAt(sr, 7, 0, getStat),

      ssrMax: primaryStatAt(ssr, 10, 0, getStat),

      uni0: primaryStatAt(uni, 0, 0, getStat),

      uni4: primaryStatAt(uni, 4, 0, getStat),

      uniMax: primaryStatAt(uni, 7, 0, getStat),

      ur0: primaryStatAt(ur, 0, 0, getStat),

      urMid: primaryStatAt(ur, 7, 0, getStat),

      urMax: primaryStatAt(ur, UR_MAX_UPGRADE_LEVEL, 0, getStat),

      src0: primaryStatAt(src, 0, 0, getStat),

      srcMid: primaryStatAt(src, 0, 5, getStat),

      srcMax: primaryStatAt(src, 0, MAX_SRC_WEAPON_LEVEL, getStat),

    };

    out.push({ ...base, verdict: judgeWeaponPower(base) });

  }

  return out;

}



export function formatWeaponPowerTable(rows: WeaponPowerRow[]): string {

  const header = '| 武器種 | SR最大 | SSR最大 | Uni+0 | Uni+4 | Uni最大 | UR+0 | UR中間 | UR最大 | Src+0 | Src中間 | Src最大 | 判定 |';

  const sep = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';

  const lines = rows.map((r) =>

    `| ${r.label} | ${r.srMax} | ${r.ssrMax} | ${r.uni0} | ${r.uni4} | ${r.uniMax} | ${r.ur0} | ${r.urMid} | ${r.urMax} | ${r.src0} | ${r.srcMid} | ${r.srcMax} | ${r.verdict} |`,

  );

  return [header, sep, ...lines].join('\n');

}



export function formatStaffDetailTable(

  db: import('better-sqlite3').Database,

  getStat: StatFn,

): string {

  const lines = ['| 武器 | +0 | +4/+5 | +7/+10/+15 | 備考 |', '| --- | --- | --- | --- | --- |'];

  for (const s of STAFF_DETAIL_IDS) {

    const row = loadWeaponEquipRow(db, s.id);

    if (!row) continue;

    const plus0 = primaryStatAt(row, 0, 0, getStat);

    let mid: number;

    let enhanced: number;

    if (row.rarity === 'Src') {

      mid = primaryStatAt(row, 0, 5, getStat);

      enhanced = primaryStatAt(row, 0, MAX_SRC_WEAPON_LEVEL, getStat);

    } else if (row.rarity === 'Uni') {

      mid = primaryStatAt(row, 4, 0, getStat);

      enhanced = primaryStatAt(row, 7, 0, getStat);

    } else if (row.rarity === 'UR') {

      mid = primaryStatAt(row, 0, 0, getStat);

      enhanced = primaryStatAt(row, 15, 0, getStat);

    } else {

      mid = primaryStatAt(row, 7, 0, getStat);

      enhanced = mid;

    }

    lines.push(`| ${s.label} | ${plus0} | ${mid} | ${enhanced} | ${s.note} |`);

  }

  return lines.join('\n');

}



export function collectPowerBalanceIssues(rows: WeaponPowerRow[]): string[] {

  return rows.filter((r) => r.verdict !== 'OK').map((r) => `${r.label}: ${r.verdict}`);

}

export function judgeSrcVsUrDiff(srcMax: number, urMax: number): { ok: boolean; diff: number; note: string } {
  const urEff = urMax + UR_MAX_AWAKENING_PRIMARY_BONUS;
  const diff = srcMax - urEff;
  if (srcMax <= urEff) return { ok: false, diff, note: `Src<=UR+覚醒 (${srcMax}<=${urEff})` };
  if (diff < SRC_UR_TARGET_DIFF_MIN) return { ok: false, diff, note: `差不足(${diff})` };
  if (diff > SRC_UR_TARGET_DIFF_HARD_MAX) return { ok: false, diff, note: `差過大(${diff})` };
  if (diff > SRC_UR_TARGET_DIFF_MAX) return { ok: true, diff, note: `OK(やや上振れ${diff})` };
  return { ok: true, diff, note: 'OK' };
}


