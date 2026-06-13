/**
 * set-bonus-balance-audit.ts — Phase2.5 set bonus inventory + SSR/UR evaluation
 */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { writeCsv } from './audit/reportWriter';

const OUT_DIR = path.join(process.cwd(), 'reports');

function estimateValue(effect: Record<string, number>): number {
  let v = 0;
  for (const [k, val] of Object.entries(effect)) {
    if (k.endsWith('_pct') || k === 'all_stat_pct') v += val * 100;
    else if (k === 'crit_rate' || k === 'crit_damage') v += val * 100;
    else v += val * 5;
  }
  return Math.round(v * 10) / 10;
}

function evaluateSet(tier: string, total: number, pieceCount: number): { evaluation: string; recommendation: string } {
  const isHigh = tier === 'SSR' || tier === 'UR';
  if (!isHigh) {
    if (total < 5) return { evaluation: 'ok', recommendation: 'keep' };
    if (total > 25) return { evaluation: 'too_strong', recommendation: 'monitor' };
    return { evaluation: 'ok', recommendation: 'keep' };
  }
  if (pieceCount >= 5 && total < 12) return { evaluation: 'too_weak', recommendation: 'buffed_phase25' };
  if (pieceCount >= 5 && total >= 12 && total <= 25) return { evaluation: 'ok', recommendation: 'aligned_phase25' };
  if (total > 30) return { evaluation: 'too_strong', recommendation: 'monitor' };
  if (pieceCount < 3 && total < 3) return { evaluation: 'too_weak', recommendation: 'minor_buff' };
  return { evaluation: 'ok', recommendation: 'keep' };
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sets = db.prepare('SELECT id, name, tier FROM equipment_sets ORDER BY id').all() as Array<{ id: string; name: string; tier: string }>;
  const rows: string[][] = [];
  const mdLines = ['# Set Bonus Balance Audit (Phase2.5)', '', '| set | tier | 5pc value | eval |', '|---|---|---:|---|'];

  for (const s of sets) {
    const bonuses = db.prepare(`
      SELECT piece_count, effect_description, effect_json FROM equipment_set_bonuses
      WHERE set_id = ? ORDER BY piece_count
    `).all(s.id) as Array<{ piece_count: number; effect_description: string; effect_json: string }>;
    const pieceCount = (db.prepare('SELECT COUNT(*) c FROM equipment WHERE series_id = ?').get(s.id) as { c: number }).c;
    const bMap = Object.fromEntries(bonuses.map((b) => [b.piece_count, b]));
    let total = 0;
    for (const b of bonuses) total += estimateValue(JSON.parse(b.effect_json) as Record<string, number>);
    const isHigh = ['SSR', 'UR'].includes(s.tier);
    const { evaluation, recommendation } = evaluateSet(s.tier, total, pieceCount);
    rows.push([
      s.id, s.name, s.tier, String(pieceCount),
      bMap[2]?.effect_description ?? '', bMap[3]?.effect_description ?? '',
      bMap[4]?.effect_description ?? '', bMap[5]?.effect_description ?? '',
      String(total), isHigh ? 'YES' : 'NO', evaluation, recommendation,
    ]);
    if (isHigh) mdLines.push(`| ${s.name} | ${s.tier} | ${total} | ${evaluation} |`);
  }

  writeCsv('set-bonus-balance-audit.csv', [
    'set_id', 'set_name', 'rarity_tier', 'piece_count', 'bonus_2', 'bonus_3', 'bonus_4', 'bonus_5',
    'total_value_estimate', 'is_ssr_or_higher', 'evaluation', 'recommendation',
  ], rows);

  mdLines.push('', '## SSR/UR adjustments (Phase2.5)', '',
    '- **深層炉/黒灯/星落ち/鉄雪 (SSR)**: 2pc main stat +4%, 3pc dual stat, 5pc set-defining all-stat + role stat',
    '- **ヴァルハラ/旧王 (UR)**: 2pc stronger opener, 5pc full-set identity (~17–20% estimated total)',
    '', 'Rationale: random affix mix can exceed single pieces, but full SSR/UR set should beat average mixed gear.',
  );
  fs.writeFileSync(path.join(OUT_DIR, 'set-bonus-balance-audit.md'), mdLines.join('\n'));
  console.log(`Wrote reports/set-bonus-balance-audit.csv (${rows.length} sets)`);
  console.log('Wrote reports/set-bonus-balance-audit.md');
}

main();
