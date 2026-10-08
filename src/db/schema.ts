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
  uniqueIndex,
  uuid,
  type AnyPgColumn,
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
  'erro',
]);

export const statementStatus = pgEnum('statement_status', ['aberta', 'fechada', 'paga']);
export const txnKind = pgEnum('txn_kind', ['fixo', 'parcela', 'encargo', 'escolha', 'pagamento']);
export const txnSource = pgEnum('txn_source', ['pluggy', 'pdf', 'manual']);
export type Papel = 'gasto' | 'entrada' | 'renda' | 'fora';

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
  tetoIaUsd: numeric('teto_ia_usd', { precision: 8, scale: 2 }),
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
  // trava e fila do sync automático (0012): ver reservarSync em pluggy/sync-auto.ts
  ultimaTentativaEm: timestamp('ultima_tentativa_em', { withTimezone: true }),
  proximoSyncEm: timestamp('proximo_sync_em', { withTimezone: true }),
  ultimoErro: text('ultimo_erro'),
  saudeConector: text('saude_conector'),
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

export const installmentPlan = pgTable(
  'installment_plan',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    descNorm: text('desc_norm').notNull(),
    totalParcelas: smallint('total_parcelas').notNull(),
    valorParcela: numeric('valor_parcela', { precision: 14, scale: 2 }).notNull(),
    primeiraRef: date('primeira_ref').notNull(),
    ativo: boolean('ativo').notNull().default(true),
  },
  (t) => [
    uniqueIndex('installment_plan_chave').on(
      t.accountId,
      t.descNorm,
      t.totalParcelas,
      t.valorParcela,
      t.primeiraRef,
    ),
  ],
);

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
    descLimpa: text('desc_limpa'),
    apelido: text('apelido'),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => category.id),
    categoryFonte: text('category_fonte').notNull().default('ia'),
    tipo: txnKind('tipo').notNull().default('escolha'),
    papel: text('papel').$type<Papel>().notNull().default('gasto'),
    papelFonte: text('papel_fonte').$type<'auto' | 'manual'>().notNull().default('auto'),
    // o paymentData não é gravado: depois do sync, só isto diz que a descrição não pode ir à IA (0014)
    pessoaFisica: boolean('pessoa_fisica').notNull().default(false),
    installmentId: uuid('installment_id').references(() => installmentPlan.id, {
      onDelete: 'set null',
    }),
    parcelaN: smallint('parcela_n'),
    fonte: txnSource('fonte').notNull(),
    pluggyTxnId: text('pluggy_txn_id').unique(),
    dedupeKey: text('dedupe_key').notNull(),
    pendente: boolean('pendente').notNull().default(false),
    suspeitoDuplicado: boolean('suspeito_duplicado').notNull().default(false),
    excluidoEm: timestamp('excluido_em', { withTimezone: true }),
    // a referência à própria tabela precisa do tipo explícito, senão o TS não fecha a inferência
    duplicadoDe: uuid('duplicado_de').references((): AnyPgColumn => txn.id, { onDelete: 'set null' }),
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
    papel: text('papel').$type<Exclude<Papel, 'gasto'>>(),
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
  resultado: jsonb('resultado'),
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

export const aiUso = pgTable(
  'ai_uso',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    modelo: text('modelo').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    custoUsd: numeric('custo_usd', { precision: 10, scale: 6 }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_uso_mes').on(t.userId, t.criadoEm)],
);

export const iaChamada = pgTable(
  'ia_chamada',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    origem: text('origem').notNull(),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ia_chamada_user_em').on(t.userId, t.em)],
);

export const loginFalha = pgTable(
  'login_falha',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('login_falha_em').on(t.em)],
);

// drizzle/0012: eventIds do webhook do Pluggy já vistos (trava de repetição)
export const webhookEvento = pgTable('webhook_evento', {
  eventId: text('event_id').primaryKey(),
  recebidoEm: timestamp('recebido_em', { withTimezone: true }).notNull().defaultNow(),
});

export const conversaTurno = pgTable(
  'conversa_turno',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    escopo: text('escopo').notNull(),
    // 'pessoa' | 'ia' — o check do banco garante
    papel: text('papel').notNull(),
    texto: text('texto').notNull(),
    dadosHash: text('dados_hash').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversa_turno_escopo').on(t.userId, t.escopo, t.criadoEm, t.id)],
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
