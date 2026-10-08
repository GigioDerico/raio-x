# Fatia 7 — acompanhamento

Guia: [`docs/guia-de-construcao.md`](../guia-de-construcao.md) (fatia 7 · Acabamento: resumo do mês, diagnóstico, conversa, teto de IA, exportar/apagar, alertas, vazios)
Estado: 7.1 a 7.4 concluídas. Faltam alertas (dependem do sync) e as pranchas de Open Finance (Pluggy).

| # | Entrega | Estado | Documento |
| --- | --- | --- | --- |
| 7.1 | Resumo do mês por IA, só por botão | concluída | [7.1-resumo-do-mes.md](7.1-resumo-do-mes.md) |
| 7.2 | Diagnóstico por IA, em stream, só por botão | concluída | [7.2-diagnostico.md](7.2-diagnostico.md) |
| 7.3 | Conversa sobre o recorte, guardada por recorte | concluída | [7.3-conversa.md](7.3-conversa.md) |
| 7.4 | Estados das telas: primeiro uso, vazio por filtro, carregando, erro | concluída | [7.4-estados-das-telas.md](7.4-estados-das-telas.md) |

## Onde paramos (2026-10-04)

- 7.3 e 7.4 aprovadas e integradas na main.
- Pendências de custo da IA (fallback, Parar) em `7.1`/`7.2`; desfazer no plano e na conversa e o ponto escondido em "Mais" em `7.4`.

## Histórico

- 2026-10-03 — Brainstorming da 7.1: só por botão (regra 9), recorte da tela,
  cartão sem last4 no prompt, assinatura = hash do prompt.
- 2026-10-03 — 7.1 integrada. Brainstorming da 7.2: diagnóstico separado da conversa, opina como o legado, em stream.
- 2026-10-03 — 7.2 aprovada e integrada.
- 2026-10-03 — Brainstorming da 7.3: conversa guardada, uma por recorte, com o diagnóstico atual no pedido.
- 2026-10-03 — Dono vai testar a 7.3 depois; segue a 7.4 (estados das telas).
- 2026-10-04 — 7.3 e 7.4 aprovadas e integradas.
