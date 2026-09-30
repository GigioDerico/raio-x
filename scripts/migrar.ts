/**
 * Migração: roda os .sql de drizzle/ em ordem, uma vez cada.
 *
 * Usa a conexão NÃO-pooled do Neon, porque DDL em transação não convive bem
 * com o pooler. Cada arquivo roda dentro de uma transação: ou aplica inteiro
 * ou não aplica nada.
 *
 *   npm run db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL_UNPOOLED (ou DATABASE_URL) no ambiente.');
  process.exit(1);
}

const sql = neon(url);

async function main() {
  await sql`
    create table if not exists _migracao (
      arquivo    text primary key,
      aplicada_em timestamptz not null default now()
    )
  `;

  const aplicadas = new Set(
    (await sql`select arquivo from _migracao`).map((r) => r.arquivo as string),
  );

  const arquivos = (await readdir(pasta))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let novas = 0;
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;

    const corpo = await readFile(join(pasta, arquivo), 'utf8');
    process.stdout.write(`aplicando ${arquivo} ... `);
    try {
      // `transaction` agrupa os comandos; o Neon HTTP aceita múltiplos statements
      // por chamada quando enviados assim.
      await sql.transaction([sql.query(corpo)]);
      await sql`insert into _migracao (arquivo) values (${arquivo})`;
      console.log('ok');
      novas++;
    } catch (erro) {
      console.log('FALHOU');
      console.error(erro);
      process.exit(1);
    }
  }

  console.log(
    novas === 0
      ? 'Nada a fazer: o banco já está na última migração.'
      : `${novas} migração(ões) aplicada(s).`,
  );
}

main();
