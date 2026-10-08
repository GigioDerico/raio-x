# Tarefa 4.1c — Conexões

Data: 2026-10-05 · Guia: [`docs/guia-de-construcao.md`](../../guia-de-construcao.md) ("Conexões") · Plano técnico: `/api/connections*`, mapeamento Item/Consent
Base: 4.1 (connect token, widget, `gravarConexao`, sync por cartão, categorização)
Branch: `tarefa-4.1c-conexoes`

## 1. Decisões do brainstorming

- **Tela própria `/conexoes`**, no menu em "O que faço agora". Ajustes fica com um
  link para ela; o "Conectar banco" muda para lá.
- **"Atualizar agora" traz desde o último sync**: do dia 1 do mês do último sync,
  menos 1 mês, até hoje.
- **Conexão que fica sem contas é desconectada sozinha** (revogada no Pluggy e
  marcada `desconectada`) quando os cartões são religados a um item novo.
- Limpeza da descrição do Pluggy e `financeCharges` ficam para a 4.2.

## 2. Banco — `drizzle/0008_saude_conector.sql`

```sql
-- Saúde do conector do Pluggy ('ONLINE' | 'UNSTABLE' | 'OFFLINE'), gravada sempre
-- que o app fala com o Pluggy: separa "o banco está fora" de "sua conexão quebrou"
-- sem a tela precisar chamar a API a cada visita.
alter table connection add column if not exists saude_conector text;
```

`schema.ts`: `saudeConector: text('saude_conector')`. Aplicada no Neon só com
autorização do dono.

Também passa a ser gravado `consent_expira_em` (`item.consentExpiresAt`, nulo =
não expira) e o `ultimo_erro` (`item.error.message`), em `gravarConexao` e no
atualizar.

## 3. Estado na tela — `estadoDaConexao` (puro, `src/lib/pluggy/estado.ts`)

```ts
type EntradaEstado = { banco: string; status: EstadoConexao; saude: string | null; consentExpiraEm: Date | null; ultimoSyncEm: Date | null; agora: Date };
type EstadoTela = { chave: 'ativa' | 'atualizando' | 'erro_login' | 'consentimento' | 'instavel' | 'erro'; texto: string; acao: 'atualizar' | 'reconectar' | 'renovar' | null };
```

Ordem de decisão:
1. `saude` `UNSTABLE`/`OFFLINE` → `instavel`, "O {banco} está instável agora — é
   deles, não seu.", sem ação (`{banco}` = `entrada.banco`).
2. `status = 'consentimento_expirado'` ou (`consentExpiraEm` não nulo e ≤ agora)
   → `consentimento`, "A autorização expirou.", ação `renovar`.
3. `erro_login` → "O banco pediu sua senha de novo.", ação `reconectar`.
4. `atualizando` → "Atualizando…", sem ação.
5. `erro` → "A última atualização falhou.", ação `atualizar`.
6. `ativa` → "Atualizado {há quanto}" (`haQuanto(ultimoSyncEm, agora)`: "agora há
   pouco" < 1 min, "há N minutos", "há N horas", "há N dias"; sem sync → "Ainda
   sem lançamentos"), ação `atualizar`.

Consentimento com prazo futuro aparece só como nota "Autorização vale até
dd/mm/aaaa" quando faltar ≤ 15 dias (o guia: não inventar contagem onde não há
prazo).

## 4. Tela — `src/app/(app)/conexoes/page.tsx`

- Server component; lê `listarConexoes(userId)` (sem `desconectada`) com, por
  conexão: banco, `logo_url`, `cor`, status, saúde, consentimento, último sync,
  e os cartões ligados (`nomeDaConta` + `••last4`). Não chama o Pluggy.
- Primeiro uso: "Nenhum banco conectado" + `ConectarBanco`.
- Cada conexão: cartão `.conexao` com logo (img `logo_url`, ou bolinha com a
  `cor` e a inicial), nome, lista de cartões, linha de estado e botão da ação
  (`AcaoConexao.tsx`, cliente). Menu de "Desconectar" discreto.
- `ConectarBanco` no topo/fim da lista.
- Ajustes: a seção "Bancos conectados" vira um parágrafo com link "Ver conexões".
- Menu: item "Conexões" no grupo "O que faço agora", antes de Plano.

## 5. Atualizar agora — `POST /api/connections/[id]/sync`

Corpo opcional `{ etapa?: 'iniciar' | 'conferir' }`.
- `iniciar` (padrão): `pluggy().atualizarItem(itemId)` (`PATCH /items/{id}` sem
  corpo de credenciais) → grava status/saúde/erro → `{ estado }` do item.
- `conferir`: `pluggy().item(itemId)` → grava → `{ estado, cartoes }`; quando
  `UPDATED`, devolve os cartões da conexão.
- A tela: `iniciar`, depois `conferir` a cada 3 s até `ok` (até 2 min), depois
  `POST /api/accounts/[id]/sync` por cartão com `?janela=atualizar`.
- `janelaAtualizar(ultimoSyncEm, agora)` (puro, `janela.ts`): `de` = dia 1 do mês
  de `ultimoSyncEm` menos 1 mês; sem sync → `janelaInicial`. `ate` = hoje (SP).
- A rota de sync de cartão aceita `?janela=atualizar` e usa o `ultimo_sync_em` da
  conexão; sem o parâmetro, segue a janela inicial (4.1b).
- Estados do item: `LOGIN_ERROR`/`WAITING_USER_INPUT`/`WAITING_USER_ACTION` →
  conexão `erro_login` e a tela mostra "Reconectar"; `OUTDATED` → `erro`.
- Posse: `connection.user_id = userId` no `where`; 404 igual para "não existe" e
  "não é seu".

## 6. Reconectar / renovar

- `POST /api/connect/token` aceita corpo `{ conexaoId }`: lê o `pluggy_item_id`
  dessa conexão do usuário (posse no `where`) e pede o token com `itemId` — o
  widget abre em modo de atualização daquele item.
- `ConectarBanco` ganha a prop `conexaoId?` e o rótulo ("Reconectar"/"Renovar");
  no sucesso segue o mesmo fluxo (callback → sync dos cartões).

## 7. Desconectar — `DELETE /api/connections/[id]`

- Diálogo de confirmação ("Desconectar {banco}? Os lançamentos já trazidos ficam;
  o app para de buscar novos.") — revogar no Pluggy não tem volta; exceção à
  regra "desfazer sem confirmação", como "Apagar tudo".
- `pluggy().apagarItem(itemId)` (`DELETE /items/{id}`; 404 do Pluggy = já não
  existe, segue) → conexão `status = 'desconectada'` → contas da conexão
  `connection_id = null` (mantêm `pluggy_account_id`, para um "Conectar banco"
  futuro religar). Lançamentos intactos.
- Posse no `where`; 404 igual.

## 8. Órfãs

`limparOrfas(userId, conexaoAtual)` em `conexao-repo.ts`, chamada em
`gravarConexao` (4.1b) depois do batch e no `conferir` do atualizar quando o item
fica `UPDATED` (assim as 2 sobras de hoje somem na primeira atualização): conexões do usuário, ≠ a atual, não
`desconectada`, sem nenhuma conta → para cada uma, `apagarItem` no Pluggy (erro
de rede só vai ao log; a marcação local acontece mesmo assim) e `status =
'desconectada'`. `conexoesOrfas(conexoes, contas, atual)` puro em
`src/lib/pluggy/estado.ts`.

## 9. Segurança

- Toda rota `[id]` com `user_id` no `where` (regra 2), sem `select` + `if`.
- Nada do Pluggy no navegador além do connect token.
- `itemId` nunca vem do cliente nestas rotas: sai do banco pela `conexaoId`.

## 10. Testes (`scripts/testes.ts`)

- `estadoDaConexao`: cada ramo e a ordem (instável vence tudo; consentimento
  vencido por data); `haQuanto` nas faixas.
- `janelaAtualizar`: último sync em 2026-10-05 → `2026-09-01`; virada de ano;
  sem sync → janela inicial.
- `conexoesOrfas`: só as sem conta, nunca a atual nem as já desconectadas.
- Cliente: `atualizarItem` faz `PATCH /items/{id}`; `apagarItem` faz `DELETE` e
  trata 404 como ok.

## 11. Conferência

Migração 0008 aplicada; `/conexoes` com o MeuPluggy e os 4 cartões; as 2 órfãs
somem depois de "Atualizar agora" ou de conectar; "Atualizar agora" traz sem
duplicar; desconectar e ver os lançamentos continuarem; conectar de novo religa;
390px e desktop; claro e escuro.
