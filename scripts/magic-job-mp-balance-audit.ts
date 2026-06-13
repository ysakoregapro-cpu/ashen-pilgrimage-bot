/** magic-job-mp-balance-audit.ts — npx tsx scripts/magic-job-mp-balance-audit.ts */
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import {
  pickMainSkillForJob,
  pickBurstSkillForJob,
  skillDesignMeta,
  expectedMaxMpForJob,
  MP_RESTORE_ITEMS,
  type MpCostTier,
} from '../src/systems/mpCostDesign';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

function fourTurnRange(tier: MpCostTier): { min: number; max: number } {
  switch (tier) {
    case 'low': return { min: 18, max: 30 };
    case 'main': return { min: 30, max: 45 };
    case 'high': return { min: 45, max: 65 };
    default: return { min: 18, max: 45 };
  }
}

const MAGIC_JOBS = ['魔術師', '祈祷師'] as const;
const BANDS = [
  { label: 'Lv30', level: 30 },
  { label: 'Lv50', level: 50 },
  { label: 'Lv70', level: 70 },
  { label: 'Lv80', level: 80 },
];

const HEADERS = [
  'job_id', 'job_name', 'level_band', 'main_magic_skill', 'burst_magic_skill',
  'main_skill_damage_ratio', 'main_skill_mp', 'burst_skill_damage_ratio', 'burst_skill_mp',
  'casts_without_item', 'casts_with_mana_vial', 'casts_with_mana_flask', 'casts_with_valhalla_mana',
  'is_too_light', 'is_too_heavy', 'balance_note',
];

function isLowMpHighPower(mp: number, ratio: number): boolean {
  if (ratio >= 2.0 && mp <= 8) return true;
  if (ratio >= 1.65 && mp <= 6) return true;
  return false;
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('magic-job-mp-balance-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('magic-job-mp-balance-audit', result);
    return;
  }

  ensurePhase2Seed(init.db);
  const rows: string[][] = [];

  for (const job of MAGIC_JOBS) {
    for (const band of BANDS) {
      const maxMp = expectedMaxMpForJob(job, band.level);
      const main = pickMainSkillForJob(job, band.level);
      const burst = pickBurstSkillForJob(job, band.level);
      const mainMeta = main ? skillDesignMeta(main) : null;
      const burstMeta = burst ? skillDesignMeta(burst) : null;
      const mainMp = mainMeta?.mpAfter ?? 0;
      const burstMp = burstMeta?.mpAfter ?? 0;

      const castsNoItem = mainMp > 0 ? Math.floor(maxMp / mainMp) : 0;
      const castsVial = mainMp > 0 ? Math.floor((maxMp + MP_RESTORE_ITEMS.vial) / mainMp) : 0;
      const castsFlask = mainMp > 0 ? Math.floor((maxMp + MP_RESTORE_ITEMS.flask) / mainMp) : 0;
      const castsVal = mainMp > 0 ? Math.floor((maxMp + MP_RESTORE_ITEMS.valhalla) / mainMp) : 0;

      const fourPct = mainMp > 0 ? ((mainMp * 4) / maxMp) * 100 : 0;
      const range = mainMeta ? fourTurnRange(mainMeta.tier) : { min: 30, max: 45 };
      let tooLight = 'NO';
      let tooHeavy = 'NO';
      let note = 'ok';

      if (mainMp > 0 && fourPct < range.min - 0.05 && job !== '祈祷師') {
        tooLight = 'YES';
        note = `4T ${fourPct.toFixed(0)}% < ${range.min}%`;
        result.fails.push(`${job} ${band.label}: 4T ${fourPct.toFixed(0)}%`);
      } else if (mainMp > 0 && fourPct < range.min) {
        result.warns.push(`${job} ${band.label}: 4T ${fourPct.toFixed(0)}% (offense low)`);
      } else if (mainMp > 0 && fourPct < range.min + 2) {
        result.warns.push(`${job} ${band.label}: 4T ${fourPct.toFixed(0)}% borderline`);
      }

      if (mainMp > 0 && mainMeta && isLowMpHighPower(mainMp, mainMeta.normalAttackRatio)) {
        tooLight = 'YES';
        result.fails.push(`${job} ${band.label}: ${main?.id} MP${mainMp} too cheap`);
      }

      if (castsVial >= 7 && band.level >= 40) {
        result.warns.push(`${job} ${band.label}: vial+${castsVial - castsNoItem} casts`);
      }

      if (mainMp > maxMp * 0.12) {
        tooHeavy = 'WARN';
      }

      rows.push([
        `job_${job}`, job, band.label,
        main?.id ?? '', burst?.id ?? '',
        mainMeta?.normalAttackRatio.toFixed(2) ?? '',
        String(mainMp),
        burstMeta?.normalAttackRatio.toFixed(2) ?? '',
        String(burstMp),
        String(castsNoItem), String(castsVial), String(castsFlask), String(castsVal),
        tooLight, tooHeavy, note,
      ]);
    }
  }

  writeMdCsvPair(
    'magic-job-mp-balance-audit',
    HEADERS,
    rows,
    [
      '## Summary',
      '',
      '- 15%一律軽減: 撤回済み',
      `- fails: ${result.fails.length}`,
      `- warns: ${result.warns.length}`,
    ],
  );

  exitCheckResult('magic-job-mp-balance-audit', result);
}

main();
