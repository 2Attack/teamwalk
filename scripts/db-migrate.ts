/**
 * Прогон DDL из `drizzle/*.sql` по порядку.
 * Запуск: `npm run db:migrate` (нужен DATABASE_URL в окружении или .env.local).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { neon, neonConfig } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL не задан. Скопируйте .env.example в .env.local');
  process.exit(1);
}

// Тот же локальный прокси, что и в lib/db/index.ts.
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
 * Разбивает файл на отдельные операторы: HTTP-эндпоинт Neon принимает ровно одну
 * команду за запрос. Наивный `split(';')` порвал бы `do $$ … $$;` и строковые
 * литералы, поэтому учитываем долларовые кавычки, апострофы и комментарии.
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
  process.stdout.write(`→ ${file} (${statements.length} операторов)\n`);
  // Транзакция не нужна: каждый DDL идемпотентен, повторный запуск безопасен.
  for (const statement of statements) {
    await sql.query(statement);
  }
}

console.log('Миграции применены');
