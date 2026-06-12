import fs from 'fs';
import path from 'path';

const REPORTS_DIR = path.join(process.cwd(), 'reports');

export function ensureReportsDir(): string {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  return REPORTS_DIR;
}

export function writeReport(filename: string, content: string): string {
  const dir = ensureReportsDir();
  const full = path.join(dir, filename);
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

export function writeCsv(filename: string, headers: string[], rows: string[][]): string {
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map((c) => escape(String(c ?? ''))).join(','));
  return writeReport(filename, lines.join('\n'));
}

export function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => '---').join(' | ');
  const head = headers.join(' | ');
  const body = rows.map((r) => r.join(' | ')).join('\n');
  return `| ${head} |\n| ${sep} |\n${body.split('\n').map((l) => `| ${l} |`).join('\n')}`;
}
