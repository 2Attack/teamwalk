/**
 * Runs DDL from `drizzle/*.sql` in order.
 * Run: `npm run db:migrate` (needs DATABASE_URL in the environment or .env.local).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { neon, neonConfig } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Same order as Next.js in dev: the local DB from `.env.development.local`
// overrides production in `.env.local`. dotenv never overwrites variables
// already set, so the first DATABASE_URL found wins.
config({ path: '.env.development.local', quiet: true });
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local');
  process.exit(1);
}

// Same local proxy as in lib/db/index.ts.
if (url.includes('localtest.me')) {
  neonConfig.fetchEndpoint = (host: string) =>
    host.endsWith('localtest.me') ? `http://${host}:4444/sql` : `https://${host}/sql`;
}

const sql = neon(url);
const dir = join(process.cwd(), 'drizzle');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/**
 * Splits a file into individual statements: Neon's HTTP endpoint accepts exactly
 * one command per request. A naive `split(';')` would break `do $$ … $$;` and
 * string literals, so dollar quotes, apostrophes, and comments are tracked.
 */
function splitStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: 'single' | 'line' | 'block' | null = null;
  let dollarTag: string | null = null;

  for (let i = 0; i < sqlText.length; i += 1) {
    const rest = sqlText.slice(i);
    const ch = sqlText[i];

    if (dollarTag) {
      current += ch;
      if (rest.startsWith(dollarTag)) {
        current += dollarTag.slice(1);
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote === 'single') {
      current += ch;
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === 'line') {
      current += ch;
      if (ch === '\n') quote = null;
      continue;
    }
    if (quote === 'block') {
      current += ch;
      if (rest.startsWith('*/')) {
        current += '/';
        i += 1;
        quote = null;
      }
      continue;
    }

    const dollarMatch = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      current += dollarTag;
      i += dollarTag.length - 1;
      continue;
    }
    if (ch === "'") quote = 'single';
    else if (rest.startsWith('--')) quote = 'line';
    else if (rest.startsWith('/*')) quote = 'block';
    else if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  const statements = splitStatements(text);
  process.stdout.write(`→ ${file} (${statements.length} statements)\n`);
  // No transaction needed: each DDL is idempotent, reruns are safe.
  for (const statement of statements) {
    await sql.query(statement);
  }
}

console.log('Migrations applied');
