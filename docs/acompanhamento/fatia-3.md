# Fatia 3 — acompanhamento

Spec: [`docs/superpowers/specs/2026-09-30-fatia-3-design.md`](../superpowers/specs/2026-09-30-fatia-3-design.md)
Estado: fatia 3 concluída — 3.0 a 3.5 na `main`. Próxima é a fatia 4 (Pluggy).

Planos (um por subfatia, escrito quando ela começa):
- 3.0 — [`docs/superpowers/plans/2026-09-30-fatia-3.0-arrumacao-e-dados.md`](../superpowers/plans/2026-09-30-fatia-3.0-arrumacao-e-dados.md)
- 3.1 — [`docs/superpowers/plans/2026-09-30-fatia-3.1-painel.md`](../superpowers/plans/2026-09-30-fatia-3.1-painel.md)
- 3.1b — [`docs/superpowers/plans/2026-09-30-fatia-3.1b-visual-original.md`](../superpowers/plans/2026-09-30-fatia-3.1b-visual-original.md) (visual do app antigo, decidido depois de comparar com as capturas)
- 3.2 — [`docs/superpowers/plans/2026-09-30-fatia-3.2-categorias.md`](../superpowers/plans/2026-09-30-fatia-3.2-categorias.md)
- 3.3 — [`docs/superpowers/plans/2026-10-02-fatia-3.3-parcelas.md`](../superpowers/plans/2026-10-02-fatia-3.3-parcelas.md)
- 3.4 — [`docs/superpowers/plans/2026-10-02-fatia-3.4-ajustes.md`](../superpowers/plans/2026-10-02-fatia-3.4-ajustes.md)
- 3.5 — [`docs/superpowers/plans/2026-10-02-fatia-3.5-plano.md`](../superpowers/plans/2026-10-02-fatia-3.5-plano.md)

| # | Entrega | Estado | Documento |
| --- | --- | --- | --- |
| 3.0 | Docs, correções de dados, migração `0003`, casca + filtro | concluída | [3.0-arrumacao-e-dados.md](3.0-arrumacao-e-dados.md) |
| 3.1 | `base`, `meses`, `composicao` + paridade + painel com o visual do app antigo (hero, indicadores, ranking); inclui `cartoesInfo`, `encargosDoMes`, `baseCategoria`, `severidade`, `parcelasInfo` (antes previstos para 3.2/3.3) | concluída | [3.1-painel.md](3.1-painel.md) |
| 3.2 | Tela Categorias | concluída | [3.2-categorias.md](3.2-categorias.md) |
| 3.3 | `projecao` + tela Parcelas (+ Previsto) | concluída | [3.3-parcelas.md](3.3-parcelas.md) |
| 3.4 | Ajustes + `/api/accounts/[id]` | concluída | [3.4-ajustes.md](3.4-ajustes.md) |
| 3.5 | `plano` + migração `0004` + questionário + Plano + refinar com IA | concluída | [3.5-plano.md](3.5-plano.md) |
| 3.6 | Correção avulsa: erros de uso nas rotas de lançamento | concluída | [3.6-rota-txn.md](3.6-rota-txn.md) |
| 3.7 | Ajustes: IA (modelo, teto, gasto) e Seus dados (CSV, apagar tudo) | concluída | [3.7-ajustes-ia-dados.md](3.7-ajustes-ia-dados.md) |
| 3.8 | Categoria pelo nome: trocar uma muda todos com o mesmo nome | concluída | [3.8-categoria-pelo-nome.md](3.8-categoria-pelo-nome.md) |
| 3.9 | Estabelecimento: filtrar, somar e juntar | concluída | [3.9-estabelecimento.md](3.9-estabelecimento.md) |

## Onde paramos (2026-10-02)

- 3.3, 3.4 e 3.5 aprovadas pelo dono e integradas à `main`. Fatia 3 concluída.
- Correção avulsa 3.6 (erros de uso nas rotas de lançamento) concluída —
  [3.6-rota-txn.md](3.6-rota-txn.md).
- **Próximo passo:** fatia 4 (Pluggy), começando pelo brainstorming. No fim
  dela, rodar o roteiro de `docs/security-audit/prompt-auditoria.md`.
- Para conferir comparação real, vale o dono importar a fatura de ago/26: com um mês só, os
  selos dizem "sem comparação" e "Fixo todo mês" fica em zero.

## Histórico

- 2026-10-03 — 3.7 conferida pelo dono e aprovada; integrada à `main`.

- 2026-10-03 — Fatia 4 pausada até as credenciais do Pluggy; dono escolheu a
  3.7 (Ajustes: IA e Seus dados). Spec escrita.

- 2026-10-02 — Correção avulsa 3.6: rotas de lançamento devolvem 400/404 a
  erro do usuário; aprovada e integrada.

- 2026-10-02 — 3.5 conferida pelo dono e aprovada; branch integrada à `main`.
  Fatia 3 concluída.

- 2026-10-02 — 3.5 implementada por subagentes e revisada; falta aplicar a
  migração 0004 e a conferência do dono.

- 2026-10-02 — Brainstorming da 3.5 concluído e spec escrita: fatia única;
  plano sobre todos os cartões; montar sem IA, refinar no botão; prompt leva as
  fixas com descrição normalizada.

- 2026-10-02 — 3.4 conferida pelo dono e aprovada; branch integrada à `main`.

- 2026-10-02 — 3.4 implementada por subagentes e revisada; aguardando
  conferência do dono.

- 2026-10-02 — Brainstorming da 3.4 concluído e spec escrita: salva ao sair do
  campo; só cartões de crédito; blocos Renda e meta, Cartões e Sessão.

- 2026-10-02 — 3.3 conferida pelo dono e aprovada; checks repetidos e branch
  integrada à `main` (`998bc13`).

- 2026-10-02 — 3.3 implementada por subagentes (4 tasks) e revisada
  amplamente, sem críticos nem importantes. Aguardando conferência do dono.
- 2026-10-02 — Brainstorming da 3.3 concluído e spec escrita: `planoSaudavel`
  entra agora; Previsto em cima das parcelas na mesma tela; visual do legado sem
  corte.

- 2026-10-02 — 3.2 conferida pelo dono no navegador autenticado e aprovada;
  checks repetidos e branch integrada à `main`.

- 2026-09-30 — Branch da 3.2 executada; checks integrados e revisões de código
  aprovados no commit `3935b25`. Conferência autenticada ainda pendente.
- 2026-09-30 — Retomada após erro transitório de login: conexão e consulta de
  leitura ao Neon responderam e o dono conseguiu entrar. Servidor local ativo
  nesta sessão; conferência autenticada continua pendente porque o navegador do
  agente não compartilha a sessão do dono.

- 2026-09-30 — O dono autorizou a execução ao pedir branch e implementação da
  3.2. As duas tasks foram entregues e a revisão de código passou após
  correções de posse e fallback de fatura. Conferência autenticada ainda pendente.

- 2026-09-30 — Plano da 3.2 revisado: esclarecidos obra separada e destino em
  Lançamentos, reforçados cenários de teste e reduzida execução a duas tasks
  de implementação mais checklist de encerramento pelo coordenador.

- 2026-09-30 — Plano da 3.2 escrito e autorrevisado com `superpowers:writing-plans`;
  acompanhamento criado.

- 2026-09-30 — 3.1 concluída: contas do legado portadas com paridade, painel e Lançamentos com o visual do app antigo.

- 2026-09-30 — 3.0 concluída na branch `fatia-3.0` (docs, correções de importação, mês da fatura, casca e filtro global); conferida com fatura real.

- 2026-09-30 — Brainstorming concluído; spec escrita e aprovada seção a seção.
  Decisões registradas na seção 1 da spec.

- 2026-09-30 — Depois de comparar o painel da 3.1 com as capturas do app
  antigo (`docs/legado/telas/`), o dono decidiu portar o visual original
  também, não só a lógica — hero escuro, indicadores, ranking com selo de
  severidade. Plano à parte (3.1b), mesma branch. Isso trouxe `cartoesInfo`,
  `encargosDoMes`, `baseCategoria`, `severidade` e `parcelasInfo` (que
  estavam previstos para as subfatias 3.2/3.3) para dentro da 3.1, com
  paridade. A 3.2 fica só com a tela Categorias; a 3.3 só com Parcelas e a
  projeção (`projecao`).

## Pendências fora da fatia

- Depois da 3.0 publicada: reimportar os PDFs já carregados (corrige parcela e
  pagamento).
