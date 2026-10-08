# Fatia 3 — painel, categorias, parcelas, ajustes e plano de 3 meses

30 de setembro de 2026 · spec aprovada em sessão de brainstorming.

Complementa `docs/plano-tecnico.md` e `docs/guia-de-construcao.md`. Onde eles
divergem do legado (`docs/legado/`), **vale o legado**: a lógica é portada, não
reescrita, porque mudar a regra e o lugar ao mesmo tempo torna impossível saber
qual dos dois quebrou.

## 1. Roteiro das fatias 3 a 7

A ordem do plano técnico fica mantida. Cada fatia de 4 a 7 recebe spec própria
quando chegar a vez.

| Fatia | Entrega | Depende de | Entra junto |
| --- | --- | --- | --- |
| 3 · Painel | Casca (lateral + barra inferior), filtro na URL, Painel, Categorias, Parcelas, Ajustes mínimo, Plano de 3 meses | Correções da fatia 2 (seção 3) | Interruptor "separar obra" |
| 4 · Pluggy manual | Widget, `connection`/`account`, "atualizar agora", dedupe PDF × API, auditoria de segurança | 3 | Comparação dia contra dia e projeção do mês corrente (passa a existir fatura aberta) |
| 5 · Sync automático | Webhook (assinatura + antirreplay), cron, estados na tela Conexões, consentimento só com `expiresAt` | 4 | — |
| 6 · Conta corrente | Saldo, entrada real, "quanto posso gastar até o dia 30"; saem renda digitada e `foraCartao` | 5 | Reavaliar lançamento manual |
| 7 · Acabamento | Resumo do mês, Diagnóstico e Conversa por IA, teto de gasto de IA, exportar/apagar tudo, alertas, vazios, auditoria antes de publicar | 6 | Quanto o diagnóstico opina (pergunta 3 do guia) |

### Decisões do brainstorming

| Tema | Decidido |
| --- | --- |
| Ordem das fatias | Mantida (conta corrente na 6) |
| Mês de um lançamento de cartão | Mês da fatura (`statement.mes_ref`); data da compra só sem fatura |
| Construção / Obras | Interruptor "separar obra" no filtro global |
| Plano estourado | Fica como está e mostra o desvio; "Refazer plano" recalcula |
| Lançamento manual | Fora da fatia 3; `foraCartao` cobre no plano |
| Onboarding | Só estado vazio bem escrito |
| Nome do cartão | Sem sugestão; "Banco ••4471" até haver apelido (`nomeCartao` do legado) |
| Navegação | Lateral agrupada pelas três perguntas (desktop) + barra inferior (celular) |
| Filtro global | Na URL; cookie lembra o último recorte |
| Onde roda a conta | SQL busca; funções do legado portadas para TS calculam |
| Plano | Calculado sem IA por padrão (`ajustarPlano(null)`); "Refinar com IA" opcional, mesmas travas |
| Guia × legado | Vale o legado: `ESSENCIAIS` com 5 categorias, questionário de 7 perguntas, dia contra dia só na 4 |
| Resumo do mês por IA | Sai da 3, vai para a 7 |

## 2. Regras que valem para toda a fatia

- Regras não negociáveis do `CLAUDE.md` (sessão, posse no `where`, sem
  `NEXT_PUBLIC_`, IA só por `ia.ts`, exclusão lógica, categoria manual intocável).
- Nenhuma chamada de IA dispara por navegação.
- Toda tela nasce com: primeiro uso, vazio por filtro, carregando (esqueleto),
  erro que diz o que falhou.
- Cada subfatia fecha com `npm run typecheck && npm test && npm run build` e um
  commit.

## 3. Correções de dados da fatia 2

Bloqueiam o painel: sem elas os números saem errados.

**Problemas encontrados**

1. O total de parcelas (N de "3/10") é descartado em `importarDoPdf`;
   `installment_plan` nunca é preenchida.
2. Pagamento de fatura é gravado com `tipo = 'escolha'` e valor negativo; o enum
   não tem `pagamento`. `sum(valor)` do mês desconta o pagamento. O legado exclui
   `pagamento` de tudo (`gastos(f)`).
3. `/api/txn` filtra por `txn.data`; o legado agrupa por mês da fatura.
4. `onConflictDoNothing` impede que reimportar corrija dados.

**Correções**

- **Migração `drizzle/0003_pagamento_parcelas.sql`:**
  `alter type txn_kind add value 'pagamento'` e índice único em
  `installment_plan (account_id, desc_norm, total_parcelas, valor_parcela, primeira_ref)`.
- **Significado de `txn.tipo`:** guarda só a **origem** — `parcela`, `encargo`,
  `pagamento` ou `escolha`. A **classe** (fixo/parcela/encargo/escolha) é
  calculada em tempo de execução por `classeLanc`, porque "fixo" depende de
  `recorrentes`. O valor `fixo` do enum fica sem uso nesta fatia. Estorno segue
  `escolha` com valor negativo (o legado o soma nos gastos; `recorrentes` ignora
  valor ≤ 0).
- **Importação:**
  - `pagamento` → `tipo = 'pagamento'`.
  - Parcela "n/N" cria ou reaproveita `installment_plan` com `total_parcelas = N`,
    `valor_parcela`, `primeira_ref = mes_ref − (n − 1) meses`; `installment_id`
    vai para o `txn`.
  - Conflito de `dedupe_key` passa a `onConflictDoUpdate`, atualizando `tipo`,
    `parcela_n`, `installment_id`, `statement_id`, com
    `where txn.excluido_em is null`. **Não toca** em `apelido`, `category_id`,
    `category_fonte`.
  - `atualizados` passa a ser contado.
- **Mês único:** expressão `coalesce(statement.mes_ref, date_trunc('month', txn.data))`
  numa função do repositório, usada por `/api/txn`, pelo adaptador do painel e por
  qualquer consulta por mês.
- **Depois do deploy:** o dono reimporta os PDFs já carregados (custa uma chamada
  de extração por trecho). O aviso "total não bate", que já existe, confere o
  resultado.

## 4. Módulo de cálculos

### Formato

A porta mantém o formato de dados do legado (`faturas[]` com `lancamentos[]`)
para ser quase linha a linha. O estado global do legado vira um `Contexto`
explícito, passado como parâmetro.

```
page.tsx (server) ─ lê filtro da URL ─▶ painel-repo.carregarContexto(userId, filtro)
                                          │ 1 consulta: txn ⋈ statement ⋈ account ⋈ category
                                          │ + learned_label (apelidos) + user_setting + plan ativo
                                          ▼
                                     Contexto { faturas, apelidos, mesFiltro, renda,
                                                metaPoupanca, foraCartao, prefsPlano, nomesCartao }
                                          ▼
                              src/lib/calculos/*  (puras; sem banco; sem `server-only`)
```

- O mapeamento linhas do banco → `faturas[]` é uma função pura separada da
  consulta (`montarFaturas`), com teste próprio.
- Campos do lançamento no formato do legado: `desc` (= `desc_origem`),
  `apelido`, `val` (número), `cat` (nome da categoria), `parc` ("n/N" montado de
  `parcela_n` + `installment_plan.total_parcelas`, ou `null`), `tipo`
  (`'compra' | 'encargo' | 'estorno' | 'pagamento'`, derivado de `txn.tipo` e do
  sinal do valor).
- A fatura carrega `id`, `mesRef` (`YYYY-MM`), `banco`, `cartao` (last4) e
  `lancamentos`.

### Arquivos em `src/lib/calculos/`

| Arquivo | Funções portadas |
| --- | --- |
| `base.ts` | `CATS`, `normCat`, `normDesc`, `tokensDesc`, `parecido`, `nomeExibido`, `addMonths`, `chaveCartao`, `nomeCartao`, `gastos`, `totalFatura` |
| `meses.ts` | `porMes`, `mesesDisponiveis`, `mesAtual`, `mesAnterior`, `lancsDoMes`, `porCategoria`, `categoriasPorMes`, `cartoesInfo`, `encargosDoMes` |
| `composicao.ts` | `recorrentes`, `recorrentesFixas`, `classeLanc`, `composicaoMes` |
| `anomalias.ts` | `baseCategoria`, `severidade` (fatia 3.1b) |
| `parcelas.ts` | `parcelasInfo` (fatia 3.1b); `projecao` fica para a 3.3 |
| `plano.ts` | `planoSaudavel`, `variavelPorCategoria`, `metasDoPlano`, `RITMOS`, `ESSENCIAIS`, `pisoCat`, `QUEDA_MAX`, `quedaMax`, `fecharMes`, `ajustarPlano`, `realDoMes` |

### Cuidados

- **Duas normalizações convivem.** `normDesc`/`parecido` do legado entram em
  `base.ts` exatamente como são (dependência de `recorrentes` e das fixas).
  `normalizarDescricao`/`parecido` de `src/lib/descricao.ts` seguem para dedupe e
  aprendizado. Comentário explica o porquê; unificar fica fora desta fatia.
- **Filtro de cartão e "separar obra" ficam no adaptador.** Ele entrega só as
  faturas dos cartões escolhidos (equivalente a `fats()`). Com "separar obra"
  ligado, remove os lançamentos de "Construção / Obras" e devolve o total da obra
  à parte. As funções portadas não mudam.
- **`promptPlano` vai para `src/lib/ia.ts`**, não para `calculos/` (regra 4):
  números agregados, nomes de categoria e até 10 cobranças fixas com descrição
  normalizada e valor médio (decidido no brainstorming da 3.5, em 02/10/2026,
  para a IA sugerir o que cancelar). Nunca id, cartão, last4, saldo ou limite.
- **Volume:** o adaptador carrega todas as faturas do recorte de cartões, sem
  janela de meses — dezenas de faturas, poucos milhares de linhas.
- **`/api/overview`:** GET fino sobre adaptador + funções, devolve JSON. As páginas
  não dependem dela.
- **`encargosDoMes` não está em `calculos-do-app-antigo.js`** — só existe dentro
  do artifact (`docs/legado/app-antigo.html`), ao lado das funções de render. O
  harness de paridade (`scripts/paridade.ts`) extrai o texto da função por regex
  direto do HTML (não a digita de novo), e lança erro se não achar — para a
  paridade nunca rodar contra uma cópia que ninguém mantém sincronizada.

### Teste de paridade

Em `scripts/testes.ts`: carrega `docs/legado/calculos-do-app-antigo.js` num
`vm.createContext` com os globais simulados (`faturas`, `apelidos`,
`prefsPlano`, `renda`, `mesFiltro`, `cartaoFiltro`, `nomesCartao`,
`foraCartao`, `metaPoupanca`) e os ajudantes ausentes do arquivo
(`ESSENCIAIS`, `planoSaudavel`) copiados de `docs/legado/app-antigo.html`.
Roda legado e porta sobre as mesmas fixtures — 4 meses, 2 cartões, parcelas,
fixos, encargo, pagamento, estorno — e exige `deepStrictEqual` em cada função da
tabela acima. `Map` e `Set` são convertidos para arrays antes de comparar.

## 5. Telas e navegação

### Casca

- Rotas `/`, `/lancamentos`, `/parcelas`, `/categorias`, `/plano`, `/ajustes`,
  sob um `layout.tsx` autenticado (`exigirUsuario()`).
- **Desktop:** barra lateral com Painel no topo e três grupos nomeados — "O que
  aconteceu" (Lançamentos, Parcelas), "Por que aconteceu" (Categorias), "O que
  faço agora" (Plano de 3 meses, Ajustes).
- **Celular (390px):** barra inferior com Painel, Lançamentos, Parcelas, Plano e
  Mais (Categorias, Ajustes, Sair).
- Todos os links do menu carregam os parâmetros do filtro.

### Filtro global

- Parâmetros `?mes=YYYY-MM|TODOS&cartoes=<ids>&obra=1`. A URL é a fonte da
  verdade; o cookie `rx_filtro` guarda o último recorte e é usado quando a URL vem
  sem parâmetros. Sem nenhum dos dois: mês mais recente, todos os cartões, obra
  junto (comportamento de `mesAtual` do legado).
- Componente cliente troca a URL com `router.replace` dentro de `useTransition`;
  o conteúdo antigo fica visível e esmaecido até o novo chegar.
- `cartoes` só aceita ids de contas do próprio usuário (filtrado no `where`).

### Painel (`/`)

Revisado em 30/09/2026 — o dono comparou com as capturas do app antigo
(`docs/legado/telas/`) e decidiu portar o visual original, não só a lógica.
Ordem dos blocos:

1. **Hero** — cartão escuro com o total do mês, a variação contra o mês
   anterior disponível (`porMes`, `mesAnterior`), % da renda declarada
   (`user_setting.renda_declarada`), o total por cartão (`cartoesInfo`, até 4)
   e a barra "já contratado × escolha" (`composicaoMes`). Totais arredondados
   (`money0`).
2. **Linha da obra** — só com "separar obra" ligado e valor > 0.
3. **Indicadores** — três cartões: juros e encargos do mês (`encargosDoMes`),
   fixo todo mês (`recorrentesFixas`), parcelas a vencer (`parcelasInfo`).
4. **Onde está apertando** — ranking de categorias em barras, maior primeiro,
   cada linha com um selo de severidade (`severidade` contra `baseCategoria`)
   e a pílula de estado; link para Lançamentos filtrado pela categoria.

"O que chamou atenção" (até 3 linhas `crit`/`warn` à parte) saiu: o selo em
cada linha do ranking já cobre o mesmo papel, sem duplicar a conta. "Próxima
fatura" (`projecao`: parcelas + fixos + variável médio de 3 meses) não é
bloco do painel — vai para a tela **Parcelas**, fatia 3.3.

Primeiro uso: "Importe uma fatura para começar" com o botão de importar.

### Lançamentos (`/lancamentos`)

A lista atual dentro da casca. Mês e cartões vêm do filtro global; busca e
categoria (`?cat=`) são locais. "Importar fatura" vira botão desta tela (e do
vazio do painel), abrindo por cima.

### Categorias (`/categorias`)

As 13 categorias em barras, com variação contra a média de 3 meses e selo de
severidade. Clique abre `/lancamentos?cat=…` mantendo o filtro.

### Parcelas (`/parcelas`)

`parcelasInfo`: "O que ainda vai cair" (uma linha por mês à frente, total e
itens) e "Compras ativas" ordenadas pelo que falta pagar (compra, parcela n/N e
valor, falta, cartão). Rodapé: "lido da fatura mais recente de cada cartão".

### Ajustes (`/ajustes`)

- Renda, meta de poupança (%), gasto fora do cartão → `user_setting`.
- Por cartão: apelido, dia de fechamento, dia de vencimento →
  `PATCH /api/accounts/[id]` com `where id = $1 and user_id = $2`.
- Validação: renda ≥ 0; meta 0–80; dias 1–31; apelido ≤ 40 caracteres.

### Plano de 3 meses (`/plano`)

- Sem renda: vazio do legado ("Informe a renda…") com link para Ajustes.
- "Montar plano" abre o questionário de 7 perguntas por cima (objetivo, ritmo,
  intocáveis, cortar fundo, comida, assinaturas, evento).
- Ao salvar: `ajustarPlano(null, metasDoPlano(ctx))` → grava `plan`,
  `plan_target` e `plan.resultado`.
- Tela: tabela categoria × 3 meses com meta, real (`realDoMes`) e desvio; avisos
  "não coube"; nota e fixos quando vierem da IA.
- "Refazer plano" reabre o questionário. Estouro não reajusta nada sozinho.

## 6. Plano persistido e IA

- **Migração `drizzle/0004_plano_resultado.sql`:** `plan.resultado jsonb` com a
  saída inteira de `ajustarPlano` (`cats` com `acao`, `fixos`, `nota`, `meses`,
  `avisos`, `teto`, `variavelHoje`, `metaPoupancaValor`). `plan_target` segue como
  forma consultável das metas. `prefs` guarda as respostas.
- Plano novo desativa o anterior na mesma transação; só um `ativo` por usuário.
- **Refinar com IA:** `POST /api/plan` com `{ refinar: true }` →
  `ia.ts.promptPlano(...)` → `openrouter` → JSON → `ajustarPlano(bruto, mt)` →
  grava plano e `ai_output` (`kind = 'plano'`, tokens, custo).
  - Sem `OPENROUTER_API_KEY`: `ErroDeUso` "Configure OPENROUTER_API_KEY".
  - JSON inválido: mantém o plano calculado e avisa "A IA não respondeu direito; o
    plano calculado segue valendo".
- **Validação do questionário:** `objetivo`, `ritmo`, `comida`, `assinaturas` só
  nos valores do legado; `intocaveis` e `cortar` só nomes de `CATS`; `cortar`
  sem o que está em `intocaveis`; `evento` ≤ 120 caracteres.

## 7. Erros e segurança

- Erro causado pelo usuário → `ErroDeUso` (400/404); o resto → 503 com detalhe só
  no log.
- `user_id` sempre de `exigirUsuario()`; posse sempre no `where`, inclusive nos
  joins do adaptador.
- Nada chega ao cliente além do que a tela mostra.

## 8. Testes

- Paridade legado × porta (seção 4).
- `montarFaturas` (linhas → formato do legado).
- Leitura de parcela → `installment_plan` (n, N, `primeira_ref`).
- Expressão de mês com e sem fatura.
- Validação do questionário e dos Ajustes.

## 9. Subfatias

| # | Entrega |
| --- | --- |
| 3.0 | Docs (abaixo), correções de dados (seção 3), migração `0003`, casca + filtro, Lançamentos e Importar dentro da casca |
| 3.1 | `base`, `meses`, `composicao`, `anomalias` (`baseCategoria`, `severidade`), `parcelas` (`parcelasInfo`), `cartoesInfo`/`encargosDoMes` (em `meses.ts`) + teste de paridade + adaptador + `/api/overview` + painel com o visual do app antigo (hero, indicadores, ranking com selo) — ver `docs/superpowers/plans/2026-09-30-fatia-3.1b-visual-original.md` |
| 3.2 | Tela Categorias |
| 3.3 | `projecao` + tela Parcelas (+ Previsto) |
| 3.4 | Ajustes + `/api/accounts/[id]` |
| 3.5 | `plano` + migração `0004` + questionário + tela Plano + refinar com IA |

### Docs na 3.0

- `docs/legado/CLAUDE.md` vira o `CLAUDE.md` da raiz, com o parágrafo de
  referência corrigido (o esquema, as rotas e a dedupe estão no plano técnico, não
  no guia) e a convenção de acompanhamento (`docs/acompanhamento/`).
- `docs/Raio-X — plano técnico.md` volta a `docs/plano-tecnico.md`.
- Criar `docs/design-system.md` a partir de `src/app/globals.css` e da tela de
  login.
- Atualizar o guia: `ESSENCIAIS` com 5, questionário com 7, "Próxima fatura",
  dia contra dia na 4, resumo por IA na 7, navegação lateral, "separar obra".
- Apagar `scripts/testar-senha.ts` e `docs/CLAUDE.md` (substituído).

## Fora desta fatia

Resumo do mês, diagnóstico e conversa por IA; teto de gasto de IA; exportar e
apagar tudo; lançamento manual; dia contra dia; unificar as duas normalizações de
descrição.
