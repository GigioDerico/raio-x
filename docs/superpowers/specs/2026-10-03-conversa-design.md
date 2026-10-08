# Tarefa 7.3 — Conversa sobre o recorte

Data: 2026-10-03 · Guia: [`docs/guia-de-construcao.md`](../../guia-de-construcao.md) ("Diagnóstico e conversa") · Plano técnico: `/api/ai/chat`, "IA: automático × sob demanda"
Legado: `docs/legado/app-antigo.html` — `SUGESTOES`, `instrucaoChat`, `perguntar` (:2846-2909)
Base: 7.2 (`dadosDiagnostico`, `pedirTextoEmStream`, NDJSON, `TextoIA`).

## 1. Decisões do brainstorming

- **A conversa fica guardada no banco** (o legado e o plano técnico deixavam só
  na sessão; o dono preferiu guardar).
- **Uma conversa por recorte** (mês × cartões × obra, a mesma `chaveRecorte`).
  Quando os números mudam depois de uma resposta, a tela marca a divisória.
- **O diagnóstico atual do recorte vai junto** ao pedido, para a conversa
  "continuar de onde o diagnóstico parou".
- Contexto = números do recorte + 6 últimas falas (guia).
- Só por envio do dono (regra 9).

## 2. Banco — `drizzle/0007_conversa.sql`

```sql
-- Uma linha por fala da conversa sobre um recorte. dados_hash é o hash dos
-- números que a IA tinha na hora: a tela compara com o atual para avisar que
-- respostas antigas falam de números que mudaram.
create table if not exists conversa_turno (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references app_user(id) on delete cascade,
  escopo     text not null,
  papel      text not null check (papel in ('pessoa', 'ia')),
  texto      text not null,
  dados_hash text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists conversa_turno_escopo on conversa_turno (user_id, escopo, criado_em, id);
```

`src/db/schema.ts` ganha `conversaTurno`. Migração aplicada no Neon só com
autorização do dono.

`apagarTudo` (`dados-repo.ts`) apaga `conversa_turno` do usuário; o texto do
diálogo de "Apagar tudo" passa a citar "as conversas com a IA".

## 3. Pedido — `src/lib/ia.ts`

```ts
export type Fala = { papel: 'pessoa' | 'ia'; texto: string };
export type Mensagem = { role: 'user' | 'assistant'; content: string };
export function mensagensConversa(dados: string, diagnostico: string | null, historico: Fala[], pergunta: string): Mensagem[]
```

- Primeira mensagem (`user`): instrução do legado (`instrucaoChat`,
  :2850-2857) — resposta curta (até 120 palavras), números reais, sem inventar,
  dizer o que falta, até 4 itens com "-" — seguida de
  `DADOS DO RECORTE QUE A PESSOA ESTÁ VENDO:` e `dados` (o bloco de
  `dadosDiagnostico`). Com diagnóstico: mais
  `DIAGNÓSTICO QUE VOCÊ JÁ ESCREVEU SOBRE ESTE RECORTE:` e o texto.
- Depois, as **6 últimas** falas de `historico` (`pessoa` → `user`, `ia` →
  `assistant`).
- Por fim a `pergunta` (`user`).
- Alternância: logo após a primeira mensagem entra uma resposta
  `assistant` fixa, "Entendi os números. Pode perguntar."; se o histórico
  cortado começar por uma fala `ia`, ela é descartada (fica começando por
  `pessoa`). Assim os papéis sempre alternam.
- O texto da pessoa vai como ela escreveu (é dela, não do banco).

`validarPergunta(v: unknown)`: string aparada, 1–500 caracteres → texto; senão
`null`.

## 4. Stream

`pedirTextoEmStream(entrada: string | Mensagem[], opcoes)` — string vira
`[{ role: 'user', content }]`. Nada mais muda.

`registrarUso` aceita `kind = 'conversa'`.

## 5. Repositório — `src/lib/conversa-repo.ts` (`server-only`)

- `falasDoRecorte(userId, escopo, limite = 50)`: as últimas `limite` falas, em
  ordem cronológica (`criado_em, id`), com `dadosHash`.
- `gravarPar(userId, escopo, dadosHash, pergunta, resposta)`: as duas falas num
  `db.batch` (transação), a pessoa antes.
- `limparConversa(userId, escopo)`: `delete where user_id and escopo`.

## 6. Rotas — `src/app/api/conversa/route.ts`

`runtime = 'nodejs'`, `maxDuration = 60`.

**POST `?{filtro}`**, corpo `{ pergunta }`, dentro de `comUsuario` até abrir o
stream:

1. `validarPergunta` → nula: `ErroDeUso('pergunta_invalida', 'Escreva uma
   pergunta de até 500 caracteres')`.
2. Contexto; sem lançamentos → `sem_lancamentos` (400).
3. Sem chave → `sem_chave` (400).
4. `dados = dadosDiagnostico(...)` (mesmo cálculo da 7.2, com plano ativo);
   `dadosHash = hashDoPrompt(dados)`; `escopo = chaveRecorte(filtro, m)`.
5. Diagnóstico: `saidaGuardada(userId, 'diagnostico', escopo,
   hashDoPrompt(promptDiagnostico(dados)))` — só entra se `atual`.
6. Histórico: `falasDoRecorte(userId, escopo, 6)`.
7. Stream NDJSON igual ao do diagnóstico (`{t}`, `{fim}`, `{erro}`), com o
   `AbortController` local, `cancel()` e `AbortSignal.any`.
8. No fim: `registrarUso(userId, 'conversa', …)`; resposta aparada e cortada em
   2000; vazia → erro; senão `gravarPar`. Abortado ou erro → nada gravado.

**DELETE `?{filtro}`**: `limparConversa(userId, chaveRecorte(filtro, m))` →
`{ ok: true }`. O mês `m` é resolvido pelo contexto, como no POST.

## 7. Tela — `/diagnostico`

- Menu: o item passa a "Diagnóstico e conversa".
- A página lê também `falasDoRecorte(userId, escopo)` e calcula `dadosHash`
  (só conta, regra 9) e passa ao cliente `Conversa.tsx`, abaixo do
  `Diagnostico`, com chave `filtro|dadosHash|n.º de falas`.
- `divisoriaEm(falas, dadosHash)` (puro, `src/lib/conversa.ts`): `i` = índice
  da **última** fala `ia` com `dadosHash` diferente do atual; devolve `i + 1`
  (a linha "Os números mudaram depois daqui." entra antes da fala `i + 1`, ou
  no fim se `i` for a última); `null` se nenhuma fala `ia` difere.
- Cliente:
  - balões: pessoa em texto puro, IA por `TextoIA`;
  - menos de 2 falas: as 5 `SUGESTOES` do legado como botões;
  - formulário: `textarea` (Enter envia, Shift+Enter quebra linha), contador
    até 500, "Enviar"; durante a resposta, "Parar" (aborta o fetch) e o balão
    da IA crescendo;
  - erro/abort: a pergunta volta para o campo; status em `role="status"`
    sempre no DOM; balão parcial marcado "interrompido, não guardado";
  - sucesso: `router.refresh()` (a página traz o par gravado);
  - "Limpar conversa" (só com falas): `<dialog>` de confirmação →
    `DELETE` → `router.refresh()`.
- Recorte vazio: a página já mostra o vazio; a conversa não aparece.

## 8. Segurança

- `user_id` da sessão; leitura, gravação e exclusão com `user_id` no `where`.
- Pedido só por `ia.ts`: o bloco de dados é o da 7.2 (sem last4, id, CPF de
  descrição crua, saldo, limite).
- Texto da IA nunca vira HTML cru; texto da pessoa é texto puro.
- Pergunta limitada a 500 caracteres; resposta gravada a 2000.

## 9. Testes (`scripts/testes.ts`)

- `mensagensConversa`: primeira mensagem com instrução e dados; diagnóstico
  só quando passado; histórico cortado nas 6 últimas; papéis mapeados;
  alternância garantida; pergunta por último; sem `1111`/`2222`/`••`.
- `validarPergunta`: aparada; vazia, só espaço, 501 caracteres, não-string →
  `null`; 500 → ok.
- `divisoriaEm`: todas iguais → `null`; sem falas → `null`; só a primeira
  `ia` diferente → índice depois dela; a última `ia` diferente → `falas.length`.

## 10. Conferência

Migração aplicada; perguntar e ver a resposta chegar; recarregar e ver a
conversa; sugestão; Parar; editar uma categoria e ver a divisória; trocar o
recorte e ver outra conversa; limpar; gasto em Ajustes; 390px e desktop; claro
e escuro.
