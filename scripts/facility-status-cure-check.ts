/** facility-status-cure-check — npx tsx scripts/facility-status-cure-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import {
  calcInnCost, calcShrineCost, restAtInn, shrineHeal, isFullyRested, formatRestPreview,
} from '../src/systems/innSystem';
import { setPlayerStatusEffect, hasPlayerStatusEffects, clearPlayerStatusEffects } from '../src/systems/playerStatusSystem';
import { createPlayer, getPlayer, requirePlayer } from '../src/systems/playerSystem';

const TEST_USER = 'facility-status-cure-user';
const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');

  const townId = 'twilight_port';
  db.prepare('UPDATE players SET hp = 50, mp = 20, max_hp = 100, max_mp = 50, gold = 9999, current_town_id = ? WHERE user_id = ?')
    .run(townId, TEST_USER);
  clearPlayerStatusEffects(TEST_USER);
  setPlayerStatusEffect(TEST_USER, 'poison', 3);

  if (isFullyRested(TEST_USER)) issues.push('毒ありなのに isFullyRested=true');

  const innCost = calcInnCost(TEST_USER, townId);
  const shrineCost = calcShrineCost(TEST_USER, townId);
  if (shrineCost !== Math.floor(innCost * 0.5)) issues.push('救護所料金が宿屋半額でない');

  const innPreview = formatRestPreview(TEST_USER, townId, '宿屋');
  if (!innPreview.includes('状態異常')) issues.push('宿屋previewに状態異常解除なし');
  const shrinePreview = formatRestPreview(TEST_USER, townId, '救護所');
  if (!shrinePreview.includes('25%')) issues.push('救護所previewにHP25%なし');

  const innResult = restAtInn(TEST_USER, townId);
  if (!innResult.ok) issues.push(`宿屋利用失敗: ${innResult.message}`);
  const afterInn = requirePlayer(TEST_USER);
  if (afterInn.hp !== afterInn.max_hp || afterInn.mp !== afterInn.max_mp) issues.push('宿屋でHP/MP全回復していない');
  if (hasPlayerStatusEffects(TEST_USER)) issues.push('宿屋後も状態異常残存');

  // Shrine test
  db.prepare('UPDATE players SET hp = 10, mp = 5, gold = 9999 WHERE user_id = ?').run(TEST_USER);
  setPlayerStatusEffect(TEST_USER, 'poison', 2);
  const shrineResult = shrineHeal(TEST_USER, townId);
  if (!shrineResult.ok) issues.push(`救護所利用失敗: ${shrineResult.message}`);
  const afterShrine = requirePlayer(TEST_USER);
  if (afterShrine.mp !== afterShrine.max_mp) issues.push('救護所でMP全回復していない');
  if (hasPlayerStatusEffects(TEST_USER)) issues.push('救護所後も状態異常残存');
  const hpFloor = Math.ceil(afterShrine.max_hp * 0.25);
  if (afterShrine.hp < hpFloor) issues.push(`救護所HP ${afterShrine.hp} < 25% (${hpFloor})`);
  if (afterShrine.hp >= afterShrine.max_hp) issues.push('救護所がHP全回復している（仕様違反）');

  if (issues.length) {
    console.error('❌ facility-status-cure-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ facility-status-cure-check passed');
}

main();
