/** job-skill-rotation-mp-audit.ts — npx tsx scripts/job-skill-rotation-mp-audit.ts */
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { BASIC_MAIN_JOBS } from '../src/db/seedData/jobMultiplierMaster';
import {
  expectedMaxMpForJob,
  pickMainSkillForJob,
  skillDesignMeta,
  MP_RESTORE_ITEMS,
  MAGIC_JOBS,
  type MpCostTier,
} from '../src/systems/mpCostDesign';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const MAGIC_JOBS = new Set(['魔術師', '祈祷師']);

function fourTurnRange(tier: MpCostTier): { min: number; max: number } {
  switch (tier) {
    case 'low': return { min: 18, max: 30 };
    case 'main': return { min: 30, max: 45 };
    case 'high': return { min: 45, max: 65 };
    case 'ultimate': return { min: 65, max: 100 };
    default: return { min: 15, max: 45 };
  }
}

const BANDS = [
  { label: 'Lv30', level: 30 },
  { label: 'Lv50', level: 50 },
  { label: 'Lv70', level: 70 },
  { label: 'Lv80', level: 80 },
];

const HEADERS = [
  'job_id', 'job_name', 'level_band', 'expected_max_mp', 'main_skill_id', 'main_skill_mp',
  'four_turn_mp_spend', 'four_turn_mp_percent', 'eight_turn_mp_spend', 'eight_turn_mp_percent',
  'mana_vial_casts_restored', 'mana_flask_casts_restored', 'valhalla_mana_casts_restored',
  'sustain_note', 'balance_note',
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('job-skill-rotation-mp-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('job-skill-rotation-mp-audit', result);
    return;
  }

  ensurePhase2Seed(init.db);
  const rows: string[][] = [];

  for (const job of BASIC_MAIN_JOBS) {
    for (const band of BANDS) {
      const maxMp = expectedMaxMpForJob(job, band.level);
      const main = pickMainSkillForJob(job, band.level);
      if (!main) {
        rows.push([`job_${job}`, job, band.label, String(maxMp), '', '0', '0', '0', '0', '0', '0', '0', '0', 'no main', 'SKIP']);
        continue;
      }
      const meta = skillDesignMeta(main);
      const mp = meta.mpAfter;
      const fourSpend = mp * 4;
      const eightSpend = mp * 8;
      const fourPct = (fourSpend / maxMp) * 100;
      const eightPct = (eightSpend / maxMp) * 100;
      const range = fourTurnRange(meta.tier);

      let decision = 'OK';
      let note = meta.tier;

      if (fourPct < range.min - 0.5) {
        if (job === '祈祷師') {
          result.warns.push(`${job} ${band.label}: 4T ${fourPct.toFixed(0)}% (support/offense)`);
        } else {
          decision = 'FAIL';
          note = `4T ${fourPct.toFixed(0)}% < ${range.min}%`;
          result.fails.push(`${job} ${band.label}: 4T ${fourPct.toFixed(0)}%`);
        }
      } else if (fourPct > range.max + 5) {
        result.warns.push(`${job} ${band.label}: 4T ${fourPct.toFixed(0)}% heavy for ${meta.tier}`);
      }

      const vialCasts = Math.floor(MP_RESTORE_ITEMS.vial / mp);
      const flaskCasts = Math.floor(MP_RESTORE_ITEMS.flask / mp);
      const valhallaCasts = Math.floor(MP_RESTORE_ITEMS.valhalla / mp);

      if (band.level >= 50 && vialCasts >= 6) {
        decision = decision === 'OK' ? 'WARN' : decision;
        note += ' vial多';
        result.warns.push(`${job} ${band.label}: vial restores ${vialCasts} casts`);
      }
      if (band.level >= 70 && flaskCasts >= 5) {
        result.warns.push(`${job} ${band.label}: flask restores ${flaskCasts} casts`);
      }

      rows.push([
        `job_${job}`, job, band.label, String(maxMp), main.id, String(mp),
        String(fourSpend), fourPct.toFixed(1), String(eightSpend), eightPct.toFixed(1),
        String(vialCasts), String(flaskCasts), String(valhallaCasts),
        eightPct >= 60 ? 'boss_sustain_ok' : 'boss_may_need_items',
        decision === 'OK' ? note || 'ok' : note || decision,
      ]);
    }
  }

  writeMdCsvPair(
    'job-skill-rotation-mp-audit',
    HEADERS,
    rows,
    ['## Summary', '', `- fails: ${result.fails.length}`, `- warns: ${result.warns.length}`],
  );

  exitCheckResult('job-skill-rotation-mp-audit', result);
}

main();
