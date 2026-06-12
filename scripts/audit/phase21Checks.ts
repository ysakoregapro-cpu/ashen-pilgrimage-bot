import { getDb } from '../../src/db/database';
import { ensureMaterialsSeed } from '../../src/db/seedData/materials';
import { ensurePhase2Seed } from '../../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../../src/db/seedData/masterDataSeed';
import {
  collectAuditFailures,
  runEquipmentAcquisitionAudit,
} from '../../src/systems/equipmentAcquisitionAudit';
import { EXCLUDED_EQUIPMENT } from '../../src/db/seedData/equipmentClassification';
import { AREAS } from '../../src/db/seedData/areas';
import { formatAcquisitionSourceHint } from '../../src/systems/itemDetailSystem';

const TEST_USER = 'phase21-audit-user';

export function initPhase21AuditDb() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
  return db;
}

export function runPhase21AcquisitionFailures(): string[] {
  initPhase21AuditDb();
  const { rows, seriesSummary } = runEquipmentAcquisitionAudit(getDb());
  return collectAuditFailures(rows, seriesSummary);
}

export function runPhase21WeaponFailures(): string[] {
  initPhase21AuditDb();
  const { rows } = runEquipmentAcquisitionAudit(getDb());
  const issues: string[] = [];
  for (const w of rows.filter((r) => r.slot === 'weapon')) {
    if (w.should_be_obtainable === 'YES' && w.current_obtainable === 'NO') {
      issues.push(`${w.item_id} (${w.name})`);
    }
    if (w.classification === 'unknown') issues.push(`unknown: ${w.item_id}`);
    if (w.rarity === 'Src') {
      const routes = w.implemented_route.split('+');
      if (!routes.includes('src_forge')) issues.push(`Src経路なし: ${w.item_id}`);
      if (routes.includes('area_pool')) issues.push(`Srcが探索プール: ${w.item_id}`);
    }
    if (w.rarity === 'Uni' && !w.implemented_route.includes('kai_forge')) {
      issues.push(`Uni/Kai経路なし: ${w.item_id}`);
    }
  }
  return issues;
}

export function runPhase21ArmorFailures(): string[] {
  initPhase21AuditDb();
  const { rows, seriesSummary } = runEquipmentAcquisitionAudit(getDb());
  const issues: string[] = [];
  for (const a of rows.filter((r) => ['head', 'body', 'arms', 'legs', 'feet'].includes(r.slot))) {
    if (a.should_be_obtainable === 'YES' && a.current_obtainable === 'NO') {
      issues.push(`${a.item_id} (${a.name})`);
    }
    if (a.classification === 'unknown') issues.push(`unknown: ${a.item_id}`);
  }
  for (const s of seriesSummary) {
    if (s.missing_ids.length > 0) {
      issues.push(`セット ${s.set_id}: 欠け ${s.missing_ids.join(', ')}`);
    }
  }
  return issues;
}

export function runPhase21DetailHintFailures(): string[] {
  initPhase21AuditDb();
  const { rows } = runEquipmentAcquisitionAudit(getDb());
  const issues: string[] = [];
  const playableSample = rows.filter((r) => r.should_be_obtainable === 'YES' && r.current_obtainable === 'YES').slice(0, 12);
  for (const r of playableSample) {
    const hint = formatAcquisitionSourceHint(r.item_id, TEST_USER);
    if (!hint || hint === '—') issues.push(`入手先空: ${r.item_id}`);
    if (hint.includes('現在通常入手不可')) issues.push(`playableなのに不可表示: ${r.item_id}`);
  }
  for (const id of Object.keys(EXCLUDED_EQUIPMENT)) {
    const hint = formatAcquisitionSourceHint(id, TEST_USER);
    if (!hint.includes('現在通常入手不可')) {
      issues.push(`legacy装備の入手先表示: ${id} → ${hint}`);
    }
  }
  const withJson = getDb().prepare(`
    SELECT id, acquisition_json FROM items WHERE category = 'equipment' AND acquisition_json IS NOT NULL LIMIT 5
  `).all() as Array<{ id: string; acquisition_json: string }>;
  for (const row of withJson) {
    try {
      JSON.parse(row.acquisition_json);
    } catch {
      issues.push(`acquisition_json parse error: ${row.id}`);
    }
  }
  return issues;
}

export function runPhase21RouteFailures(): string[] {
  initPhase21AuditDb();
  const db = getDb();
  const { rows, seriesSummary } = runEquipmentAcquisitionAudit(db);
  const issues = collectAuditFailures(rows, seriesSummary);

  for (const [id, ex] of Object.entries(EXCLUDED_EQUIPMENT)) {
    if (!ex.reason.trim()) issues.push(`legacy理由空: ${id}`);
  }

  const srcWeapons = db.prepare('SELECT src_item_id FROM src_weapons').all() as Array<{ src_item_id: string }>;
  for (const s of srcWeapons) {
    if (AREAS.some((a) => a.rewards.includes(s.src_item_id))) {
      issues.push(`Src武器が探索プールに混入: ${s.src_item_id}`);
    }
  }
  for (const id of Object.keys(EXCLUDED_EQUIPMENT)) {
    if (AREAS.some((a) => a.rewards.includes(id))) {
      issues.push(`legacy装備が探索プールに残存: ${id}`);
    }
  }

  const arms = rows.filter((r) => r.slot === 'arms' && r.should_be_obtainable === 'YES');
  const legs = rows.filter((r) => r.slot === 'legs' && r.should_be_obtainable === 'YES');
  const feet = rows.filter((r) => r.slot === 'feet' && r.should_be_obtainable === 'YES');
  const armsOk = arms.filter((r) => r.current_obtainable === 'YES').length;
  const legsOk = legs.filter((r) => r.current_obtainable === 'YES').length;
  const feetOk = feet.filter((r) => r.current_obtainable === 'YES').length;
  if (armsOk < arms.length) issues.push(`arms配置不足: ${armsOk}/${arms.length}`);
  if (legsOk < legs.length) issues.push(`legs配置不足: ${legsOk}/${legs.length}`);
  if (feetOk < feet.length) issues.push(`feet配置不足: ${feetOk}/${feet.length}`);

  return issues;
}

export function logPhase21Stats(): void {
  const { stats } = runEquipmentAcquisitionAudit(getDb());
  console.log(`Phase2.1: weapons ${stats.obtainable_weapons}/${stats.playable_target_weapons}, armor ${stats.obtainable_armor}/${stats.playable_target_armor}, series ${stats.full_series_obtainable}/${stats.total_series}, unknown ${stats.unknown_total}`);
}
