# Fatia 6 — acompanhamento

Spec: [`docs/superpowers/specs/2026-10-07-fatia-6-conta-corrente-design.md`](../superpowers/specs/2026-10-07-fatia-6-conta-corrente-design.md)
Estado: fatia 6 concluída e na main (6.0 a 6.3). Auditoria de segurança concluída com todos os achados (A-1 a A-7) corrigidos.

| # | Entrega | Estado | Documento |
| --- | --- | --- | --- |
| 6.0 | Dados: migração 0013, sync da conta, papel automático, pessoa física fora da IA | concluída | [6.0-dados-conta-corrente.md](6.0-dados-conta-corrente.md) |
| 6.1 | Lançamentos (alternador, "não conta") | concluída | [6.1-nao-conta-e-entradas.md](6.1-nao-conta-e-entradas.md) |
| 6.2 | Renda digitada no painel, plano e Previsto; Ajustes sem "gasto fora do cartão" | concluída | [6.2-renda-digitada-e-ajustes.md](6.2-renda-digitada-e-ajustes.md) |
| 6.3 | Migração 0017: apagar `gasto_fora_cartao`; auditoria de segurança | concluída | [6.3-limpeza-e-auditoria.md](6.3-limpeza-e-auditoria.md) |

## Histórico

- 2026-10-07 — Fatia aberta. Brainstorming concluído: transações da conta como as
  do cartão, sem saldo nem extrato; renda só o que o dono marca, aprendida pela
  origem; Pix para pessoa física não vai à IA.
- 2026-10-08 — 6.1 concluída. Renda passa a ser digitada: Entradas removida; 6.2 e 6.3 ajustadas.
