import type Database from 'better-sqlite3';
import { nowIso } from '../types';
import { seedTownsAndNpcs } from './seedData/towns';
import { seedJobsAndSkills } from './seedData/jobs';
import { seedMaterials } from './seedData/materials';
import { seedEquipmentAndSets } from './seedData/equipment';
import { seedMonsters } from './seedData/monsters';
import { seedExplorationAreas } from './seedData/areas';
import { seedSrcWeapons } from './seedData/srcWeapons';
import { seedFacilities, ensureFacilitiesSeed } from './seedData/facilities';
import { seedDialogues, ensureDialoguesSeed } from './seedData/dialogues';
import { seedStoryTables } from '../systems/storySystem';
import { ensurePhase2Seed } from './seedData/phase2Seed';

export function seedDatabase(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) as c FROM towns').get() as { c: number };
  if (row.c > 0) {
    ensureFacilitiesSeed(db);
    ensureDialoguesSeed(db);
    seedStoryTables(db);
    ensurePhase2Seed(db);
    return;
  }

  const ts = nowIso();
  seedTownsAndNpcs(db);
  seedJobsAndSkills(db);
  seedMaterials(db, ts);
  seedEquipmentAndSets(db, ts);
  seedMonsters(db);
  seedExplorationAreas(db);
  seedSrcWeapons(db);
  seedFacilities(db);
  seedDialogues(db);
  seedStoryTables(db);
}
