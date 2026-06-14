/** equipment-forge-route-display-audit.ts */
import fs from 'fs';
import path from 'path';
import {
  formatEquipmentRouteLines,
  getEquipmentRouteDetails,
  getEquipmentRouteSectionFlags,
} from '../src/systems/equipmentRouteDetailSystem';
import { getForgeRouteDisplay } from '../src/systems/equipmentForgeRouteSystem';
import {
  getArmorRouteBook,
  getWeaponRouteBook,
} from '../src/systems/equipmentRouteBook';
import { ensureDropBalanceSeed } from '../src/db/seedData/dropBalanceSeed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { ensurePhase2EquipmentRoutes } from '../src/db/seedData/ensurePhase2EquipmentRoutes';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'equipment_id', 'equipment_name', 'rarity', 'kind', 'has_forge_route', 'route_type',
  'base_equipment_id', 'base_equipment_name', 'required_materials', 'material_route_summary',
  'shows_material_sources', 'self_reference_bug', 'direct_enemy_drop', 'direct_boss_rematch',
  'shows_none_sections', 'title_duplicate', 'match_ok', 'balance_note',
];

function readSrc(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

function auditEquipment(
  id: string,
  name: string,
  rarity: string,
  kind: 'weapon' | 'armor',
  legacy: boolean,
  result: ReturnType<typeof emptyResult>,
): string[] {
  const routes = getEquipmentRouteDetails(id);
  const lines = formatEquipmentRouteLines(id);
  const text = lines.join('\n');
  const flags = getEquipmentRouteSectionFlags(id);
  const forge = getForgeRouteDisplay(id);

  const titleDuplicate = kind === 'weapon'
    ? readSrc('src/commands/weapon.ts').includes("baseEmbed('灰星巡礼録 | 武器図鑑'")
    : readSrc('src/commands/armor.ts').includes("baseEmbed('灰星巡礼録 | 防具図鑑'");

  const needsForgeDetail = (rarity === 'Uni' || rarity === 'Src') && !legacy;
  const showsMaterialSources = flags.hasMaterialSources;
  const selfRef = forge?.selfReferenceBug ?? false;
  const directEnemy = routes.some((r) => r.kind === 'enemy_drop') ? 'YES' : 'NO';
  const directBoss = routes.some((r) => r.kind === 'boss_rematch' || r.kind === 'valhalla_boss') ? 'YES' : 'NO';
  const matSummary = forge?.materialSources.map((m) => m.summary).join(' | ') ?? '';

  let matchOk = true;
  if (selfRef) {
    matchOk = false;
    result.fails.push(`${id}: Src self_reference_bug`);
  }
  if (needsForgeDetail && !showsMaterialSources) {
    matchOk = false;
    result.fails.push(`${id}: shows_material_sources=false`);
  }
  if (needsForgeDetail && !text.includes('【強化/変質】')) {
    matchOk = false;
    result.fails.push(`${id}: missing forge section`);
  }
  if (text.includes('基礎: Src:')) {
    matchOk = false;
    result.fails.push(`${id}: legacy self-reference text`);
  }

  return [
    id,
    name,
    rarity,
    kind,
    forge?.hasForgeRoute ? 'YES' : 'NO',
    forge?.routeType ?? 'none',
    forge?.baseEquipmentId ?? '',
    forge?.baseEquipmentName ?? '',
    forge?.requiredMaterials.map((m) => `${m.name}×${m.qty}`).join(' / ') ?? '',
    matSummary.slice(0, 120),
    showsMaterialSources ? 'YES' : 'NO',
    selfRef ? 'YES' : 'NO',
    directEnemy,
    directBoss,
    flags.hasNoneSections ? 'YES' : 'NO',
    titleDuplicate ? 'YES' : 'NO',
    matchOk ? 'OK' : 'FAIL',
    legacy ? 'legacy' : forge?.routeType ?? 'none',
  ];
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('equipment-forge-route-display-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('equipment-forge-route-display-audit', result);
    return;
  }
  ensurePhase2EquipmentRoutes(init.db);
  ensureDropBalanceSeed(init.db);
  ensureMasterDataSeed(init.db);

  const rows: string[][] = [];
  const weapons = getWeaponRouteBook();
  const armors = getArmorRouteBook();

  for (const w of weapons.filter((x) => x.rarity === 'Uni' || x.rarity === 'Src' || x.legacy)) {
    rows.push(auditEquipment(w.item_id, w.name, w.rarity, 'weapon', w.legacy, result));
  }

  const titleDupWeapon = readSrc('src/commands/weapon.ts').includes("baseEmbed('灰星巡礼録 | 武器図鑑'");
  const titleDupArmor = readSrc('src/commands/armor.ts').includes("baseEmbed('灰星巡礼録 | 防具図鑑'");
  if (titleDupWeapon) result.fails.push('weapon.ts: title duplicate pattern remains');
  if (titleDupArmor) result.fails.push('armor.ts: title duplicate pattern remains');

  rows.push([
    '_title_check_weapon', '—', '—', 'meta', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—',
    titleDupWeapon ? 'YES' : 'NO',
    titleDupWeapon ? 'FAIL' : 'OK',
    'weapon command embed title',
  ]);
  rows.push([
    '_title_check_armor', '—', '—', 'meta', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—',
    titleDupArmor ? 'YES' : 'NO',
    titleDupArmor ? 'FAIL' : 'OK',
    'armor command embed title',
  ]);

  writeMdCsvPair('equipment-forge-route-display-audit', HEADERS, rows, [
    '## Summary',
    '',
    `- Uni/Src/legacy weapons checked: ${weapons.filter((w) => w.rarity === 'Uni' || w.rarity === 'Src' || w.legacy).length}`,
    `- armor catalog size: ${armors.length} (forge audit focuses on weapons)`,
    `- fails: ${result.fails.length}`,
  ]);
  exitCheckResult('equipment-forge-route-display-audit', result);
}

main();
