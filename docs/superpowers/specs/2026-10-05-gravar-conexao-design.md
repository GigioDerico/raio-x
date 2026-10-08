# Tarefa 4.1b — Gravar a conexão e primeira carga

Data: 2026-10-05 · Plano técnico: rotas `/api/connect/*`, "Mapeamento do Pluggy", deduplicação · Base: 4.0 (`mapear.ts`, `planejar.ts`, `sync-repo.ts`) e 4.1 passo 1 (connect token + widget)
Branch: `tarefa-4.1-conectar-banco`

## 1. Decisões do brainstorming

- A 4.1 segue em duas etapas: **4.1b** (este documento) grava a conexão e as
  contas e traz os lançamentos ao conectar; **4.1c** é a tela de Conexões com
  "atualizar agora".
- **Todas as contas são gravadas**, mas só cartão de crédito entra nos números;
  conta corrente e poupança esperam a fatia 6 (sem lançamentos).
- **Primeira carga: 3 meses** (pergunta 6 do guia).
- **Categoria dos novos: regras aprendidas e, no que sobrar, IA em lote.**

## 2. Confirmar posse — `POST /api/connect/callback`

Corpo `{ itemId: string }`, dentro de `comUsuario`.

1. `itemId` precisa ser string de 1 a 100 caracteres → senão `ErroDeUso` 400.
2. `pluggy().item(itemId)` — novo método do cliente: `GET /items/{id}` →
   `{ id, status, clientUserId, connector: { id, name, primaryColor, imageUrl },
   error?: { message } }`. 404 do Pluggy → `ErroDeUso('item_nao_encontrado', …,
   404)`.
3. **Posse:** `item.clientUserId !== userId` → o mesmo 404 (não revela que o
   item existe). O connect token da 4.1 já põe o usuário da sessão como
   `clientUserId`.
4. Estado do item (`item.status` do Pluggy):
   - `UPDATING` → `{ estado: 'atualizando' }` sem gravar; a tela pergunta de
     novo a cada 3 s, até 2 min ("O banco ainda está mandando os dados…");
   - `LOGIN_ERROR` ou `WAITING_USER_INPUT` → `ErroDeUso('erro_login', 'O banco
     recusou o acesso. Conecte de novo e confira a senha.')`;
   - `UPDATED` → segue, conexão `ativa`;
   - `OUTDATED` (a última leitura falhou, mas há dado) → segue, conexão gravada
     com `status = 'erro'` e `ultimo_erro` = `item.error.message`, e a resposta
     leva o aviso "O banco não respondeu na última leitura; os dados podem estar
     atrasados.";
   - qualquer outro → `ErroDeUso('erro_pluggy', 'O Pluggy não conseguiu ler o
     banco. Tente de novo em instantes.', 502)`.
5. `pluggy().contasDoItem(itemId)` e grava (§3) → resposta
   `{ estado: 'ok', conexaoId, cartoes: [{ id, nome }] }`.

## 3. Gravar — `src/lib/pluggy/conexao-repo.ts` (`server-only`)

`gravarConexao(userId, item, contas)`, numa transação (`db.batch`, ou as
consultas de leitura antes e as escritas no batch):

- **Instituição** — `escolherInstituicao(existentes, connector)`, puro, em
  `mapear.ts`: casa por `pluggy_connector_id`; senão por nome normalizado
  (`normalizarNomeBanco`: minúsculas, sem acento, sem "S.A.", "banco", espaços
  — "Nu Pagamentos"/"Nubank" não casam, e tudo bem: vira outra instituição);
  senão cria `{ slug: 'pluggy-<connectorId>', nome, pluggyConnectorId, cor,
  logoUrl }`. Ao casar por nome, grava `pluggy_connector_id`, `cor` e
  `logo_url` se estiverem vazios.
- **Conexão** — insert em `connection` com `on conflict (pluggy_item_id) do
  update set status, ultimo_erro = null` **where `connection.user_id =
  userId`** (um item de outro usuário não é tocado; a posse já foi conferida
  no §2).
- **Contas** — para cada `contaDoPluggy(c)`:
  - `casarConta(existentes, mapeada)` (4.0): `usar` → update da conta
    (`pluggy_account_id`, `connection_id`, `limite`, `nome_origem` só se vazio;
    `apelido` intacto); `criar` → insert com `user_id`, `institution_id` da
    conexão, `kind`, `last4`, `nome_origem`, `limite`, `connection_id`,
    `pluggy_account_id`;
  - conta não-cartão: grava também `saldo` e `saldo_em` (`balance`);
  - nunca grava `owner` nem `taxNumber` (regra 5) — `contaDoPluggy` já não os
    devolve;
  - `existentes` = contas do usuário (posse no `where`).
- Devolve `{ conexaoId, cartoes }` (cartões com o rótulo do filtro).

**Só cartões no app:** `opcoesDoFiltro` (`txn-repo.ts`) passa a filtrar
`account.kind = 'cartao_credito'` (Ajustes já filtra).

## 4. Primeira carga — `POST /api/accounts/[id]/sync`

Dentro de `comUsuario`; `ehUuid(id)` senão 404; `maxDuration = 60`.

1. Conta do usuário, `kind = 'cartao_credito'`, com `pluggy_account_id` →
   senão 404.
2. `janelaInicial(hoje)` (puro, `src/lib/pluggy/janela.ts`): `de` = dia 1 de
   dois meses antes do mês de `hoje` (fuso de São Paulo), `ate` = `hoje`.
3. `faturas(pluggyAccountId)` e `transacoes(pluggyAccountId, de, ate)`.
4. `sincronizarConta(userId, accountId, faturas, transacoes, connectionId)` com
   **`pg_advisory_xact_lock`** por conta como primeira instrução da transação
   (chave = hash da conta) — cron e botão não colidem.
5. **Categorizar** os lançamentos dessa conta com `category_id` nulo e
   `category_fonte <> 'manual'` (regra 7), não excluídos:
   - regras aprendidas por `desc_norm` (a mesma leitura que a importação usa)
     → `category_fonte = 'aprendida'`;
   - o resto, em lotes de até 60, `promptCategorizar(itens)` em `ia.ts` →
     `pedirJson` com o modelo dos Ajustes → `lerCategorias(resposta, ids)`
     (puro) → só as 13 categorias de `NOMES` valem, o resto fica nulo →
     `category_fonte = 'ia'`; `registrarUso(userId, 'categorizar', …)` por lote;
   - sem chave de IA: pula a IA sem erro; os que sobraram ficam sem categoria
     e a resposta conta quantos (`semCategoria`), para a tela avisar.
6. `connection.ultimo_sync_em = now()`, `status = 'ativa'`.
7. Resposta: `ResultadoSync` + `{ categorizados, semCategoria }`.

### `promptCategorizar(itens)` — `src/lib/ia.ts`

Itens `{ i, data, valor, desc }` (índice local, não id — regra 4; `desc` =
`desc_norm`). Texto: as 13 categorias de `NOMES` e as regras de categoria do
prompt de extração (`src/lib/extracao.ts`), pedindo
`{"categorias": [{"i": 0, "categoria": "…"}]}`.

## 5. Tela

`ConectarBanco.tsx` (Ajustes):
- `onSuccess` → `POST /api/connect/callback`; `atualizando` → pergunta de novo a
  cada 3 s (até 2 min) com o aviso;
- `ok` → para cada cartão, em sequência, `POST /api/accounts/[id]/sync`, com
  status "Trazendo {nome} — {n} de {total}…";
- fim → resumo por cartão ("Nubank ••1234: 42 novos, 3 já estavam, 1 suspeito
  de duplicado; 40 categorizados") e `router.refresh()`;
- falhas por `AvisoDeFalha`; uma falha num cartão não impede os outros.

Seção "Bancos conectados" em Ajustes lista as conexões do usuário: logo/nome
da instituição, estado (`ativa`, `atualizando`, `erro_login`, `erro`) e último
sync (`listarConexoes(userId)` em `conexao-repo.ts`).

## 6. Segurança

- Posse do item conferida no Pluggy (`clientUserId`) antes de gravar; 404 igual
  para "não existe" e "não é seu".
- `user_id` da sessão; toda escrita com `user_id` no `where`/valores.
- Titular e CPF não gravados (regra 5); IA só recebe data, valor e
  `desc_norm` (regra 4); categoria manual intacta (regra 7); IA só em dado novo
  (regra 9).
- Nenhuma credencial do Pluggy sai do servidor.

## 7. Testes (`scripts/testes.ts`)

- Cliente: `item(id)` faz `GET /items/{id}` com `X-API-KEY`.
- `escolherInstituicao`: por connector id; por nome normalizado; cria com slug
  `pluggy-<id>`.
- `janelaInicial`: 2026-10-05 → `2026-08-01`..`2026-10-05`; virada de ano
  (2026-01-10 → `2025-11-01`).
- `promptCategorizar`: lista as 13 categorias, pede JSON, sem id/last4 (só
  índice).
- `lerCategorias`: índice válido + categoria de `NOMES` → ok; categoria fora →
  nulo; índice fora → ignorado; não-objeto → vazio.

## 8. Conferência (sandbox)

Conectar o Pluggy Bank; ver a carga cartão a cartão; lançamentos no Painel e em
Lançamentos, categorizados; filtro de cartões sem conta corrente; reconectar o
mesmo banco sem duplicar contas nem lançamentos; anotar o que o sandbox mostra
das pendências da 4.0 (fatura aberta, sinal do valor, pendente → postado).
