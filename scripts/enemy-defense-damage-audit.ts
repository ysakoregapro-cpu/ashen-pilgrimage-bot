/** enemy-defense-damage-audit — npx tsx scripts/enemy-defense-damage-audit.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { calcPhysicalDamage, scaleMonsterForBattle } from '../src/systems/combatMath';
import { MONSTER_SEED_DATA } from '../src/db/seedData/monsters';

const result = emptyResult();

const SAMPLES = [
  { band: 'early', atk: 28, mag: 12, ids: ['mon_bandit', 'mon_star_slime'] },
  { band: 'mid', atk: 55, mag: 48, ids: ['mon_drift_undead', 'mon_ore_eater'] },
  { band: 'late', atk: 95, mag: 88, ids: ['mon_arc_residue', 'mon_cave_in_bug'] },
  { band: 'valhalla', atk: 165, mag: 140, ids: ['mon_old_army', 'mon_throne_guard'] },
];

function avgDmg(atk: number, def: number, mult: number, n = 200): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += calcPhysicalDamage(atk, def, mult, 0);
  return Math.round(sum / n);
}

function main() {
  const rows: string[][] = [];
  initAuditDb();

  for (const sample of SAMPLES) {
    for (const id of sample.ids) {
      const seed = MONSTER_SEED_DATA.find((m) => m.id === id);
      if (!seed) {
        rows.push([id, '?', String(sample.atk), String(sample.mag), '-', '-', '-', '-', 'missing seed', 'WARN']);
        result.warns.push(`missing monster ${id}`);
        continue;
      }
      const scaled = scaleMonsterForBattle({
        id: seed.id, area_tag: seed.tag, level: seed.lv, hp: seed.hp, attack: seed.atk,
        magic: seed.mag, defense: seed.def, spirit: seed.mag, speed: seed.spd,
        is_boss: seed.boss ? 1 : 0,
      });
      const phys = avgDmg(sample.atk, scaled.defense, 1);
      const mag = avgDmg(sample.mag, scaled.defense, 1.2);
      const ttkPhys = Math.ceil(scaled.hp / Math.max(1, phys));
      const ttkMag = Math.ceil(scaled.hp / Math.max(1, mag));
      let note = 'OK';
      const bandOk: Record<string, [number, number]> = {
        early: [2, 4], mid: [3, 5], late: [4, 6], valhalla: [5, 8],
      };
      const [lo, hi] = bandOk[sample.band] ?? [2, 8];
      if (ttkPhys < lo || ttkPhys > hi + 2) {
        note = 'WARN';
        result.warns.push(`${id} physical TTK ${ttkPhys} (band ${sample.band} ${lo}-${hi})`);
      }
      if (scaled.defense > seed.lv * 4 && sample.band === 'early') {
        note = 'WARN';
        result.warns.push(`${id} early defense high: ${scaled.defense}`);
      }
      rows.push([
        id, String(scaled.defense), String(sample.atk), String(sample.mag),
        String(phys), String(mag), String(ttkPhys), String(ttkMag), note,
        `${sample.band} scaledHP=${scaled.hp}`,
      ]);
    }
  }

  writeMdCsvPair(
    'enemy-defense-damage-audit',
    ['enemy_id', 'enemy_defense', 'sample_player_attack', 'sample_player_magic', 'physical_damage', 'magic_damage', 'turns_to_kill_physical', 'turns_to_kill_magic', 'balance_note', 'detail'],
    rows,
    ['## 敵防御', '', '物理/魔法ダメージとTTK目安。'],
  );
  exitCheckResult('enemy-defense-damage-audit', result);
}

main();
