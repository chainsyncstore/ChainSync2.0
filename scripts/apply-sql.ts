import { readFileSync } from 'fs';
import path from 'path';
import { Client } from 'pg';

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextTwo = sql.slice(i, i + 2);

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        current += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (nextTwo === '*/') {
        inBlockComment = false;
        current += '*/';
        i++;
        continue;
      }
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
      current += char;
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        if (sql[i + 1] === "'") {
          current += "'";
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (nextTwo === '--') {
      inLineComment = true;
      continue;
    }

    if (nextTwo === '/*') {
      inBlockComment = true;
      continue;
    }

    if (char === '$') {
      const match = sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed + ';');
      }
      current = '';
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail.length > 0) {
    statements.push(tail);
  }

  return statements;
}

async function main() {
  const [fileArg, connectionArg] = process.argv.slice(2);
  const connectionString = connectionArg || process.env.DATABASE_URL;

  if (!fileArg) {
    throw new Error('Usage: tsx scripts/apply-sql.ts <path-to-sql-file> [database-url]');
  }

  if (!connectionString) {
    throw new Error('Provide DATABASE_URL via env or CLI argument');
  }

  const absolutePath = path.resolve(fileArg);
  const sql = readFileSync(absolutePath, 'utf8');
  const statements = splitSqlStatements(sql).filter((stmt) => stmt.trim().length);

  if (statements.length === 0) {
    console.log(`No executable statements found in ${absolutePath}`);
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log(`Executing ${statements.length} statements from ${absolutePath}`);
    for (const [index, statement] of statements.entries()) {
      console.log(`Running statement ${index + 1}/${statements.length}`);
      await client.query(statement);
    }
    console.log('✅ SQL execution completed successfully');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('SQL execution failed:', err);
  process.exit(1);
});
