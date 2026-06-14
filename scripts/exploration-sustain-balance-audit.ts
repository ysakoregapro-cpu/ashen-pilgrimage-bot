/** exploration-sustain-balance-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { scaleMonsterForBattle, calcEnemyDamageToPlayer, getMonsterThreatTier } from '../src/systems/combatMath';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'area_id', 'area_name', 'level_band', 'enemy_sample', 'expected_damage_per_battle',
  'hp_loss_percent_per_battle', 'expected_battles_before_rest', 'four_battle_survivable', 'balance_note',
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('exploration-sustain-balance-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('exploration-sustain-balance-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  const db = init.db;
  const areas = db.prepare(`
    SELECT id, name, recommended_min_level, recommended_max_level, monster_pool_json
    FROM exploration_areas ORDER BY recommended_min_level LIMIT 12
  `).all() as Array<{ id: string; name: string; recommended_min_level: number; recommended_max_level: number; monster_pool_json: string }>;

  const rows: string[][] = [];
  for (const area of areas) {
    const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string }>;
    const sampleId = pool[0]?.monster_id ?? 'mon_bandit';
    const mon = db.prepare('SELECT * FROM monsters WHERE id = ?').get(sampleId) as {
      id: string; hp: number; attack: number; magic: number; defense: number; spirit: number; speed: number; level: number; area_tag: string;
    };
    const scaled = scaleMonsterForBattle({ ...mon, id: mon.id, area_tag: mon.area_tag ?? 'starfield' });
    const playerLv = Math.max(area.recommended_min_level, 8);
    const playerMaxHp = 80 + playerLv * 12;
    const playerDef = 8 + Math.floor(playerLv * 0.8);
    const dmg = calcEnemyDamageToPlayer({
      attack: scaled.attack,
      playerDefense: playerDef,
      playerMaxHp,
      threatTier: getMonsterThreatTier(mon.id),
      takenMult: 1,
      playerLevel: playerLv,
      monsterLevel: mon.level ?? playerLv,
    });
    const pct = (dmg / playerMaxHp) * 100;
    const fourSurvive = pct * 4 <= 70;
    const band = area.recommended_min_level <= 12 ? 'early' : area.recommended_min_level <= 35 ? 'mid' : 'late';

    if (band !== 'late' && pct > 28) result.warns.push(`${area.id}: ${pct.toFixed(0)}%/battle high`);
    if (band === 'early' && pct > 22) result.fails.push(`${area.id}: early ${pct.toFixed(0)}% per battle`);

    rows.push([
      area.id, area.name, band, sampleId, String(dmg), pct.toFixed(1),
      String(Math.floor(70 / Math.max(pct, 1))), fourSurvive ? 'OK' : 'WARN', `playerLv~${playerLv}`,
    ]);
  }

  writeMdCsvPair('exploration-sustain-balance-audit', HEADERS, rows, ['## Summary', '', `- fails: ${result.fails.length}`]);
  exitCheckResult('exploration-sustain-balance-audit', result);
}

main();
