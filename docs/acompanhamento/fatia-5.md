# Fatia 5 — acompanhamento

Plano técnico: [`docs/plano-tecnico.md`](../plano-tecnico.md) (Sincronização e consentimento; rotas `/api/cron/sync` e `/api/webhook/pluggy`)
Estado: concluída no código (5.0). Cron e webhook só rodam sozinhos depois do deploy; cadastrar o webhook com `npm run webhook` no fim do deploy.

| # | Entrega | Estado | Documento |
| --- | --- | --- | --- |
| 5.0 | Sync automático: cron diário, webhook do Pluggy, aviso de consentimento | concluída | [5.0-sync-automatico.md](5.0-sync-automatico.md) |

## Histórico

- 2026-10-07 — Fatia aberta. Já existe da 4.1c: estados de conexão (inclusive
  consentimento expirado) e "atualizar agora"; `vercel.json` já agenda
  `/api/cron/sync`; o middleware já libera `/api/cron/` e `/api/webhook/`.

## Onde paramos (2026-10-07)

- 5.0 na `main` (`d519ab8`); 0012 aplicada; `CRON_SECRET` e `PLUGGY_WEBHOOK_SECRET`
  gerados no `.env.local`.
- **Sem deploy por decisão do dono:** o app roda só no Mac. Cron e webhook não
  rodam sozinhos; os dados entram pelo "Atualizar agora".
- **O repositório no GitHub é público e a `main` local está 323 commits à frente
  de `origin/main` — não dar push sem decisão do dono.** Nove arquivos trazem
  finais reais de cartão e valores de fatura (`docs/acompanhamento/3.0`, `3.1`,
  `4.1`, `4.2c`, specs/planos de 3.1 e 4.2a, `scripts/testes.ts`,
  `src/app/globals.css`); nenhum segredo nos commits novos.
- MeuPluggy: cada banco é uma conexão (Itaú e Santander ativas desde 12:12 de
  2026-10-07). Santander Elite ••5555 e ••6666 vieram sem fatura nem lançamento.
- **Próximo:** fatia 6 — conta corrente (Itaú ••7777; Santander ••8888 e ••9999
  já registradas, sem dados).
