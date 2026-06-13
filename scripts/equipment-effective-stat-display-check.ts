/** equipment-effective-stat-display-check — npx tsx scripts/equipment-effective-stat-display-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import {
  getEquipmentEffectiveStats,
  formatEffectiveStatLines,
  getEffectiveStatSuffix,
  resolveEquipmentEnhanceLevels,
} from '../src/systems/equipmentEffectiveStats';
import { calcUpgradeStatBonuses } from '../src/systems/enhanceSystem';
import { primaryStatAt, loadWeaponEquipRow } from '../src/systems/weaponPowerComparison';
import { UR_MAX_AWAKENING_PRIMARY_BONUS } from '../src/db/seedData/weaponTierBalanceMaster';
import { MAX_AWAKENING_LEVEL } from '../src/db/seedData/awakeningMaster';

const result = emptyResult();

type CaseDef = {
  label: string;
  itemId: string;
  upg: number;
  src: number;
  aw: number;
  expectPrimary: number;
  suffix: string;
};

function buildInput(master: NonNullable<ReturnType<typeof loadWeaponEquipRow>>, c: CaseDef) {
  return {
    rarity: master.rarity,
    upgrade_level: c.upg,
    src_level: c.src,
    awakening_level: c.aw,
    durability_state: '良好',
    attack_bonus: master.attack_bonus,
    magic_bonus: master.magic_bonus,
    defense_bonus: master.defense_bonus,
    spirit_bonus: master.spirit_bonus,
    speed_bonus: master.speed_bonus,
    hp_bonus: master.hp_bonus,
    mp_bonus: 0,
    accuracy_bonus: 0,
    crit_rate_bonus: 0,
    weapon_type: master.weapon_type,
    slot: master.slot,
  };
}

function near(n: number, expected: number, tol = 1): boolean {
  return Math.abs(n - expected) <= tol;
}

function main() {
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(`DB接続不可: ${init.error}`);
    writeMdCsvPair(
      'equipment-effective-stat-display-check',
      ['check', 'status', 'detail'],
      [['db', 'SKIP', init.error]],
      ['## DB', '', 'Application Control 等によりローカルDB不可。VPS側で要実行。'],
    );
    exitCheckResult('equipment-effective-stat-display-check', result);
    return;
  }
  const { db } = init;

  const cases: CaseDef[] = [
    { label: 'UR弓+15覚醒IV', itemId: 'wpn_sky_bow_fress', upg: 15, src: 0, aw: MAX_AWAKENING_LEVEL, expectPrimary: 90, suffix: '（強化・覚醒込み）' },
    { label: 'Src弓+15(src_level)', itemId: 'wpn_src_echo', upg: 0, src: 15, aw: 0, expectPrimary: 121, suffix: '（Src強化込み）' },
    { label: 'Src弓+15(legacy upgrade_level)', itemId: 'wpn_src_echo', upg: 15, src: 0, aw: 0, expectPrimary: 121, suffix: '（Src強化込み）' },
  ];

  const rows: string[][] = [];
  let urBowAtk = 0;
  let srcBowAtk = 0;

  for (const c of cases) {
    const master = loadWeaponEquipRow(db, c.itemId);
    if (!master) {
      result.fails.push(`${c.label}: マスタ未找到 ${c.itemId}`);
      rows.push([c.label, 'FAIL', 'master missing', '', '']);
      continue;
    }
    const input = buildInput(master, c);
    const eff = getEquipmentEffectiveStats(input);
    const lines = formatEffectiveStatLines(input, eff);
    const resolved = resolveEquipmentEnhanceLevels(input);
    const primaryVal = primaryStatAt(
      { ...master, item_id: c.itemId },
      resolved.upgrade_level,
      resolved.src_level,
      calcUpgradeStatBonuses,
    ) + (c.aw > 0 ? UR_MAX_AWAKENING_PRIMARY_BONUS : 0);
    const displayPrimary = eff.attack;
    const suffix = getEffectiveStatSuffix(input);
    const ok = near(displayPrimary, c.expectPrimary) && near(primaryVal, c.expectPrimary);
    if (!ok) {
      result.fails.push(`${c.label}: 実効${displayPrimary} / 期待${c.expectPrimary} / primaryStatAt${primaryVal}`);
    }
    if (suffix !== c.suffix) result.fails.push(`${c.label}: suffix "${suffix}" != "${c.suffix}"`);
    if (c.label.startsWith('UR弓')) urBowAtk = displayPrimary;
    if (c.label.startsWith('Src弓+15(src')) srcBowAtk = displayPrimary;
    rows.push([
      c.label,
      ok ? 'OK' : 'FAIL',
      lines[0] ?? '—',
      String(displayPrimary),
      suffix,
      `resolved src=${resolved.src_level} upg=${resolved.upgrade_level}`,
    ]);
  }

  if (srcBowAtk > 0 && urBowAtk > 0 && srcBowAtk <= urBowAtk) {
    result.fails.push(`Src弓(${srcBowAtk}) <= UR弓(${urBowAtk}) — 表示順序異常`);
    rows.push(['Src>UR比較', 'FAIL', String(srcBowAtk), String(urBowAtk), '', '']);
  } else if (srcBowAtk > 0 && urBowAtk > 0) {
    rows.push(['Src>UR比較', 'OK', String(srcBowAtk), String(urBowAtk), `+${srcBowAtk - urBowAtk}`, '']);
  }

  writeMdCsvPair(
    'equipment-effective-stat-display-check',
    ['case', 'status', 'display_line', 'effective_attack', 'suffix', 'notes'],
    rows,
    [
      '## 装備詳細【性能】実効値チェック',
      '',
      'UR弓/Src弓（src_level・legacy upgrade_level）と weapon-tier 参照値の一致。',
    ],
  );
  exitCheckResult('equipment-effective-stat-display-check', result);
}

main();
