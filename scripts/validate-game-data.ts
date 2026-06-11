import { validateGameData, validateGameDataStatic, printValidationReport } from '../src/systems/gameDataValidationSystem';

let issues;
try {
  issues = validateGameData();
} catch {
  issues = validateGameDataStatic();
  issues.push({ severity: 'warn', category: 'system', message: 'DB検証をスキップ（better-sqlite3 rebuild が必要な場合あり）' });
}
printValidationReport(issues);
process.exit(issues.some((i) => i.severity === 'error') ? 1 : 0);
