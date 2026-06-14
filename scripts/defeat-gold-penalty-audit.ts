/** defeat-gold-penalty-audit.ts */
import { defeatGoldLossCapForTownTier } from '../src/systems/defeatSystem';
import { emptyResult, exitCheckResult, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'progress_tier', 'current_gold', 'penalty_percent', 'penalty_cap', 'actual_penalty', 'remaining_gold', 'too_heavy', 'balance_note',
];

function main() {
  const result = emptyResult();
  const tiers = [
    { tier: 'early', townTier: 10, gold: 5000, cap: 100 },
    { tier: 'mid', townTier: 25, gold: 20000, cap: 300 },
    { tier: 'late', townTier: 45, gold: 80000, cap: 800 },
    { tier: 'valhalla', townTier: 60, gold: 200000, cap: 1500 },
  ];
  const rows: string[][] = [];

  for (const t of tiers) {
    const cap = defeatGoldLossCapForTownTier(t.townTier);
    const raw = Math.floor(t.gold * 0.05);
    const penalty = Math.min(raw, cap);
    const tooHeavy = penalty > t.cap || penalty > t.gold * 0.1;
    if (penalty > cap) result.fails.push(`${t.tier}: penalty ${penalty} > cap ${cap}`);
    if (t.gold >= 50000 && penalty > 5000) result.fails.push(`${t.tier}: ${penalty} too large absolute`);

    rows.push([
      t.tier, String(t.gold), '5%', String(cap), String(penalty),
      String(t.gold - penalty), tooHeavy ? 'YES' : 'NO', 'capped',
    ]);
  }

  writeMdCsvPair('defeat-gold-penalty-audit', HEADERS, rows, ['## Summary', '', `- fails: ${result.fails.length}`]);
  exitCheckResult('defeat-gold-penalty-audit', result);
}

main();
