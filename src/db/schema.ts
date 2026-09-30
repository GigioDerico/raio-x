/**
 * Espelho em TypeScript do esquema em drizzle/0000_init.sql.
 *
 * As migrações são SQL escrito à mão (drizzle/*.sql) — este arquivo existe
 * para tipar as consultas, não para gerar DDL. Mudou lá, muda aqui.
 */
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const accountKind = pgEnum('account_kind', [
  'cartao_credito',
  'conta_corrente',
  'conta_pagamento',
  'poupanca',
]);

export const connectionStatus = pgEnum('connection_status', [
  'ativa',
  'atualizando',
  'erro_login',
  'consentimento_expirado',
  'desconectada',
]);

export const statementStatus = pgEnum('statement_status', ['aberta', 'fechada', 'paga']);
export const txnKind = pgEnum('txn_kind', ['fixo', 'parcela', 'encargo', 'escolha']);
export const txnSource = pgEnum('txn_source', ['pluggy', 'pdf', 'manual']);

export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  nome: text('nome'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const userSetting = pgTable('user_setting', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  metaPoupanca: numeric('meta_poupanca', { precision: 5, scale: 2 }).notNull().default('20'),
  rendaDeclarada: numeric('renda_declarada', { precision: 14, scale: 2 }),
  gastoForaCartao: numeric('gasto_fora_cartao', { precision: 14, scale: 2 }).notNull().default('0'),
  modeloIa: text('modelo_ia').notNull().default('anthropic/claude-sonnet-4.5'),
  tz: text('tz').notNull().default('America/Sao_Paulo'),
});

export const institution = pgTable('institution', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  nome: text('nome').notNull(),
  pluggyConnectorId: integer('pluggy_connector_id'),
  cor: text('cor'),
  logoUrl: text('logo_url'),
});

export const connection = pgTable('connection', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  institutionId: bigint('institution_id', { mode: 'number' })
    .notNull()
    .references(() => institution.id),
  pluggyItemId: text('pluggy_item_id').notNull().unique(),
  status: connectionStatus('status').notNull().default('ativa'),
  consentExpiraEm: timestamp('consent_expira_em', { withTimezone: true }),
  ultimoSyncEm: timestamp('ultimo_sync_em', { withTimezone: true }),
  proximoSyncEm: timestamp('proximo_sync_em', { withTimezone: true }),
  ultimoErro: text('ultimo_erro'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => connection.id, { onDelete: 'set null' }),
  institutionId: bigint('institution_id', { mode: 'number' })
    .notNull()
    .references(() => institution.id),
  kind: accountKind('kind').notNull(),
  pluggyAccountId: text('pluggy_account_id').unique(),
  last4: text('last4'),
  apelido: text('apelido'),
  nomeOrigem: text('nome_origem'),
  limite: numeric('limite', { precision: 14, scale: 2 }),
  saldo: numeric('saldo', { precision: 14, scale: 2 }),
  saldoEm: timestamp('saldo_em', { withTimezone: true }),
  diaFechamento: smallint('dia_fechamento'),
  diaVencimento: smallint('dia_vencimento'),
  ativo: boolean('ativo').notNull().default(true),
});

export const statement = pgTable(
  'statement',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    mesRef: date('mes_ref').notNull(),
    fechamento: date('fechamento'),
    vencimento: date('vencimento'),
    totalInformado: numeric('total_informado', { precision: 14, scale: 2 }),
    status: statementStatus('status').notNull().default('aberta'),
    pluggyBillId: text('pluggy_bill_id').unique(),
  },
  (t) => [unique('statement_conta_mes').on(t.accountId, t.mesRef)],
);

export const category = pgTable('category', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  nome: text('nome').notNull().unique(),
  grupo: text('grupo').notNull(),
  ordem: smallint('ordem').notNull().default(100),
  builtin: boolean('builtin').notNull().default(true),
});

export const installmentPlan = pgTable('installment_plan', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  accountId: uuid('account_id')
    .notNull()
    .references(() => account.id, { onDelete: 'cascade' }),
  descNorm: text('desc_norm').notNull(),
  totalParcelas: smallint('total_parcelas').notNull(),
  valorParcela: numeric('valor_parcela', { precision: 14, scale: 2 }).notNull(),
  primeiraRef: date('primeira_ref').notNull(),
  ativo: boolean('ativo').notNull().default(true),
});

export const txn = pgTable(
  'txn',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    statementId: uuid('statement_id').references(() => statement.id, { onDelete: 'set null' }),
    data: date('data').notNull(),
    valor: numeric('valor', { precision: 14, scale: 2 }).notNull(),
    descOrigem: text('desc_origem').notNull(),
    descNorm: text('desc_norm').notNull(),
    apelido: text('apelido'),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => category.id),
    categoryFonte: text('category_fonte').notNull().default('ia'),
    tipo: txnKind('tipo').notNull().default('escolha'),
    installmentId: uuid('installment_id').references(() => installmentPlan.id, {
      onDelete: 'set null',
    }),
    parcelaN: smallint('parcela_n'),
    fonte: txnSource('fonte').notNull(),
    pluggyTxnId: text('pluggy_txn_id').unique(),
    dedupeKey: text('dedupe_key').notNull(),
    pendente: boolean('pendente').notNull().default(false),
    excluidoEm: timestamp('excluido_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('txn_user_dedupe').on(t.userId, t.dedupeKey),
    index('txn_mes').on(t.userId, t.data),
    index('txn_conta').on(t.accountId, t.data),
    index('txn_norm').on(t.userId, t.descNorm),
  ],
);

export const learnedLabel = pgTable(
  'learned_label',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    descNorm: text('desc_norm').notNull(),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => category.id),
    apelido: text('apelido'),
    hits: integer('hits').notNull().default(1),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.descNorm] })],
);

export const plan = pgTable('plan', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  ritmo: text('ritmo').notNull(),
  objetivo: text('objetivo'),
  rendaBase: numeric('renda_base', { precision: 14, scale: 2 }).notNull(),
  metaPoupanca: numeric('meta_poupanca', { precision: 5, scale: 2 }).notNull(),
  prefs: jsonb('prefs').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const planTarget = pgTable(
  'plan_target',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    mesRef: date('mes_ref').notNull(),
    categoryId: bigint('category_id', { mode: 'number' })
      .notNull()
      .references(() => category.id),
    alvo: numeric('alvo', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.mesRef, t.categoryId] })],
);

export const aiOutput = pgTable(
  'ai_output',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    escopo: text('escopo').notNull(),
    modelo: text('modelo').notNull(),
    inputHash: text('input_hash').notNull(),
    conteudo: jsonb('conteudo').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    custoUsd: numeric('custo_usd', { precision: 10, scale: 6 }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('ai_output_chave').on(t.userId, t.kind, t.escopo, t.inputHash)],
);

export const syncRun = pgTable('sync_run', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  connectionId: uuid('connection_id').references(() => connection.id, { onDelete: 'cascade' }),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).notNull().defaultNow(),
  terminadoEm: timestamp('terminado_em', { withTimezone: true }),
  resultado: text('resultado'),
  novos: integer('novos').notNull().default(0),
  atualizados: integer('atualizados').notNull().default(0),
  duplicados: integer('duplicados').notNull().default(0),
  detalhe: jsonb('detalhe'),
});

export type Txn = typeof txn.$inferSelect;
export type NovoTxn = typeof txn.$inferInsert;
export type Account = typeof account.$inferSelect;
export type Connection = typeof connection.$inferSelect;
