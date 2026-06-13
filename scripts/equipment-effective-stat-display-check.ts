/** equipment-effective-stat-display-check — npx tsx scripts/equipment-effective-stat-display-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { getEquipmentEffectiveStats, formatEffectiveStatLines, getEffectiveStatSuffix } from '../src/systems/equipmentEffectiveStats';
import { calcUpgradeStatBonuses } from '../src/systems/enhanceSystem';
import { primaryStatAt, loadWeaponEquipRow } from '../src/systems/weaponPowerComparison';
import { UR_MAX_AWAKENING_PRIMARY_BONUS } from '../src/db/seedData/weaponTierBalanceMaster';
import { MAX_AWAKENING_LEVEL } from '../src/db/seedData/awakeningMaster';

const result = emptyResult();

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

  const cases: Array<{ label: string; itemId: string; upg: number; src: number; aw: number; expectPrimary: number; suffix: string }> = [
    { label: 'UR弓+15覚醒IV', itemId: 'wpn_sky_bow_fress', upg: 15, src: 0, aw: MAX_AWAKENING_LEVEL, expectPrimary: 90, suffix: '（強化・覚醒込み）' },
    { label: 'Src弓+15', itemId: 'wpn_src_echo', upg: 0, src: 15, aw: 0, expectPrimary: 121, suffix: '（Src強化込み）' },
  ];

  const rows: string[][] = [];
  for (const c of cases) {
    const master = loadWeaponEquipRow(db, c.itemId);
    if (!master) {
      result.fails.push(`${c.label}: マスタ未找到 ${c.itemId}`);
      rows.push([c.label, 'FAIL', 'master missing']);
      continue;
    }
    const input = {
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
    const eff = getEquipmentEffectiveStats(input);
    const lines = formatEffectiveStatLines(input, eff);
    const primaryVal = primaryStatAt({ ...master, item_id: c.itemId }, c.upg, c.src, calcUpgradeStatBonuses)
      + (c.aw > 0 ? UR_MAX_AWAKENING_PRIMARY_BONUS : 0);
    const displayPrimary = eff.attack;
    const suffix = getEffectiveStatSuffix(input);
    const ok = displayPrimary === c.expectPrimary && primaryVal === c.expectPrimary;
    if (!ok) result.fails.push(`${c.label}: 実効${displayPrimary} / 期待${c.expectPrimary} / primaryStatAt${primaryVal}`);
    if (suffix !== c.suffix) result.fails.push(`${c.label}: suffix "${suffix}" != "${c.suffix}"`);
    if (lines[0]?.includes(String(master.attack_bonus)) && lines[0]?.includes('（') === false && c.upg > 0) {
      result.fails.push(`${c.label}: 基礎値表示の疑い ${lines[0]}`);
    }
    rows.push([c.label, ok ? 'OK' : 'FAIL', lines[0] ?? '—', String(displayPrimary), suffix]);
  }

  writeMdCsvPair(
    'equipment-effective-stat-display-check',
    ['case', 'status', 'display_line', 'effective_attack', 'suffix'],
    rows,
    ['## 装備詳細【性能】実効値チェック', '', 'UR弓/Src弓の参照値と formatEffectiveStatLines の一致を確認。'],
  );
  exitCheckResult('equipment-effective-stat-display-check', result);
}

main();
