# Fatia 4 — acompanhamento

Plano técnico: [`docs/plano-tecnico.md`](../plano-tecnico.md) (Pluggy → modelo, Deduplicação, Sincronização)
Estado: fatia 4 concluída (4.0 a 4.4). Achados baixos e informativos da auditoria ficam para antes de tornar o repositório público.

| # | Entrega | Estado | Documento |
| --- | --- | --- | --- |
| 4.0 | Cliente do Pluggy, mapeadores, casamento de conta, deduplicação (sem conta no Pluggy) | concluída | [4.0-base-pluggy.md](4.0-base-pluggy.md) |
| 4.1 | Conectar banco, `institution` do conector, gravar conexão e 1ª carga | concluída (connect token, widget, gravar conexão e 1ª carga) | [4.1-conectar-banco.md](4.1-conectar-banco.md) |
| 4.1c | Tela de Conexões: atualizar agora, reconectar, renovar, desconectar | concluída | [4.1c-conexoes.md](4.1c-conexoes.md) |
| 4.2a | Dados do Pluggy limpos: nome, fatura aberta, duas faturas no mês | concluída | [4.2a-dados-pluggy.md](4.2a-dados-pluggy.md) |
| 4.2b | PDF × Pluggy: aviso de mês coberto, tela de possíveis duplicados | concluída | [4.2b-pdf-pluggy.md](4.2b-pdf-pluggy.md) |
| 4.2c | Dia contra dia e projeção do mês corrente | concluída | [4.2c-dia-contra-dia.md](4.2c-dia-contra-dia.md) |
| 4.3 | Auditoria de segurança do fim da fatia | concluída | [4.3-auditoria.md](4.3-auditoria.md) |

| 4.4 | Correções dos achados médios da auditoria (A-07, A-09, A-10) | concluída | [4.4-correcoes-auditoria.md](4.4-correcoes-auditoria.md) |

## Onde paramos (2026-10-03)

- 4.0 na branch `fatia-4.0-base-pluggy`: spec em
  `docs/superpowers/specs/2026-10-03-fatia-4.0-design.md`, plano em
  `docs/superpowers/plans/2026-10-03-fatia-4.0-base-pluggy.md`.
- 4.0 concluída e na `main`; migração 0005 aplicada.
- **Pausada em 2026-10-03 pelo dono** até as credenciais entrarem no
  `.env.local`. Ao retomar: 4.1 (conectar banco, Conexões, "atualizar agora"). Precisa
  de `PLUGGY_CLIENT_ID`/`SECRET` no `.env.local`; antes de desenhar, testar
  `POST /auth` e ver no sandbox os pontos em aberto listados em
  `4.0-base-pluggy.md` (fatura aberta, sinal, pendente com id novo).
- Dono criou conta no Pluggy, mas `PLUGGY_CLIENT_ID`/`SECRET` ainda vazios no
  `.env.local`. Ficam na área de aplicações do painel do Pluggy; a `apiKey` não
  vem do painel, o servidor gera com `POST /auth`.

## Histórico

- 2026-10-03 — 4.0 integrada à `main`; 0005 aplicada com autorização do dono.

- 2026-10-03 — 4.0 implementada; duas revisões levaram a reescrever o
  planejador (valor e data mandam, parcela por número + fatura, escolha mútua).

- 2026-10-03 — Brainstorming da fatia 4: três subfatias; 4.0 sem depender de
  credenciais; conta do Pluggy casa com a do PDF por `last4`; ambíguo entra
  marcado e fora dos totais.

## Pendências fora da fatia

- Antes de tornar o repositório público: achados baixos e informativos da 4.3
  (A-01, A-04, A-06, A-08; A-02, A-03, A-05, A-11).
