/**
 * Facility UI customId sanity — run: npx tsx scripts/facility-flow-check.ts
 */
import { restConfirmButtons, facilityActionButtons, postRestButtons } from '../src/utils/townUi';
import { nextActionButtons } from '../src/utils/nextActionButtons';
import { getFacilityActions } from '../src/systems/facilitySystem';

const SAMPLE_FACS = [
  { id: 'f_twilight_inn', type: 'inn' },
  { id: 'f_twilight_shrine', type: 'shrine' },
];

function collectIds(rows: ReturnType<typeof restConfirmButtons>): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    for (const c of row.toJSON().components) {
      if ('custom_id' in c && c.custom_id) ids.push(c.custom_id);
    }
  }
  return ids;
}

let ok = true;

for (const fac of SAMPLE_FACS) {
  const actions = getFacilityActions({ id: fac.id, type: fac.type } as never);
  const viewIds = collectIds(facilityActionButtons(fac.id, actions));
  const previewIds = collectIds(restConfirmButtons(fac.id, fac.type === 'shrine' ? 'shrine' : 'inn'));
  const dupPreview = previewIds.filter((id, i) => previewIds.indexOf(id) !== i);
  if (dupPreview.length) {
    console.error(`❌ ${fac.id} preview duplicate custom_id: ${dupPreview.join(', ')}`);
    ok = false;
  } else {
    console.log(`✅ ${fac.id} preview: unique ids (${previewIds.join(', ')})`);
  }

  const merged = [...previewIds, ...collectIds(nextActionButtons('facility', { facilityId: fac.id }))];
  const dupMerged = merged.filter((id, i) => merged.indexOf(id) !== i);
  if (!dupMerged.length) {
    console.log(`   (old bug) merged with nextActionButtons would duplicate: ${[...new Set(dupMerged)].join(', ') || 'none'}`);
  }

  const postIds = collectIds(postRestButtons(fac.id));
  console.log(`✅ ${fac.id} post-rest buttons: ${postIds.join(', ')}`);
  console.log(`✅ ${fac.id} facility view buttons: ${viewIds.length} actions`);
}

if (!ok) process.exit(1);
console.log('\nFacility flow customId check passed.');
