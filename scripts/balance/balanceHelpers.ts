import fs from 'fs';
import path from 'path';
import { getDb } from '../../src/db/database';
import { ensureMaterialsSeed } from '../../src/db/seedData/materials';
import { ensurePhase2Seed } from '../../src/db/seedData/phase2Seed';
import { writeCsv, writeReport, mdTable } from '../audit/reportWriter';

export type CheckResult = {
  fails: string[];
  warns: string[];
};

export function emptyResult(): CheckResult {
  return { fails: [], warns: [] };
}

export function initAuditDb(): { db: ReturnType<typeof getDb>; ok: true } | { ok: false; error: string } {
  try {
    const db = getDb();
    ensureMaterialsSeed(db);
    ensurePhase2Seed(db);
    return { db, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function writeMdCsvPair(
  baseName: string,
  headers: string[],
  rows: string[][],
  mdSections: string[],
): void {
  writeCsv(`${baseName}.csv`, headers, rows);
  const md = [
    `# ${baseName}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    ...mdSections,
    '',
    mdTable(headers, rows),
  ].join('\n');
  writeReport(`${baseName}.md`, md);
}

export function exitCheckResult(name: string, result: CheckResult): void {
  console.log(`## ${name}\n`);
  if (result.fails.length) {
    console.error('FAIL');
    for (const f of result.fails) console.error(`- ${f}`);
    if (result.warns.length) {
      console.error('\nWARN');
      for (const w of result.warns) console.error(`- ${w}`);
    }
    process.exit(1);
  }
  console.log('OK');
  if (result.warns.length) {
    console.log('\nWARN');
    for (const w of result.warns) console.log(`- ${w}`);
  }
  console.log(`\n→ reports/${name}.md`);
}

export function dbBlockedWarn(result: CheckResult, scriptName: string): void {
  result.warns.push(`${scriptName}: better-sqlite3/DB接続不可 — VPS側で要実行`);
}

export function ensureReportsDir(): string {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
