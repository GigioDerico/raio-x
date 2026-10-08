# Tarefa 3.9 — Estabelecimento: filtrar, somar e juntar

Data: 2026-10-07 · Branch `tarefa-3.9-estabelecimento` · Base: 3.8 (mesmo nome =
`chaveDoNome(nomeNaTela(l))`, espelho SQL `chaveDoNomeSql` em `txn-repo.ts`)

## 1. Decisões do brainstorming

- **Filtrar:** clicar no nome de um lançamento mostra só aquele
  estabelecimento (mesmo nome da 3.8), com total no recorte do filtro global e
  total de todos os meses. Um × tira.
- **Renomear junta:** renomear "A Ferreira" para "Alane Ferreira" renomeia
  todos os "A Ferreira" (todos os meses) e eles **herdam a categoria** dos que
  já eram "Alane Ferreira". Nome novo que ainda não existe: categoria fica.
- Sem desfazer e sem pedir confirmação (aprovado assim pelo dono): depois de
  juntar, todos têm o mesmo nome e o antigo se perde. O aviso depois da ação
  diz o que aconteceu.

## 2. Filtro por estabelecimento

- `GET /api/txn?nome=<nome na tela>`: `listarTxn` ganha `nome` →
  `chaveDoNomeSql = chaveDoNome(nome)`. Com `nome`, a resposta traz também
  `totalTodosMeses` = soma de `valor` de todos os meses, nos cartões do filtro,
  com as mesmas exclusões da lista (excluído, pagamento, suspeito de
  duplicado), calculada em SQL (`totalDoNome`), não somando linhas (a lista tem
  limite).
- Tela (`Lancamentos.tsx`): o nome vira botão; clicar → estado `estab`, limpa a
  busca de texto. Com `estab`, acima da lista:
  **{estab}** · N lançamentos · {total} {rótulo do recorte} · {totalTodosMeses}
  em todos os meses · [Renomear] [×]. Lista vazia com `estab`: "Nada de
  “{estab}” em {recorte}" + limpar.

## 3. Renomear e juntar

- `POST /api/txn/renomear` `{ de, para }` (`de` = nome na tela atual).
- Validação pura `validarNovoNome(de, para)`: `para` com trim, não vazio, até
  60 caracteres; `chaveDoNome(para) !== chaveDoNome(de)` → senão `ErroDeUso`
  400 (`nome_vazio`, `nome_longo`, `nome_igual`).
- `renomearEstabelecimento(userId, de, para)` em `txn-repo.ts`:
  1. contagem das categorias do grupo de destino (chave = `para`, fora os de
     `de`; só não excluídos, não pagamento, com categoria): `category_id`,
     `count`, `max(data)`;
  2. `categoriaHerdada(contagens)` (pura): a mais comum; empate → a de
     `max(data)` mais recente; vazio → `null`;
  3. **um update só**: `apelido = para` e, se herdada, `category_id = herdada,
     category_fonte = 'manual'`, onde `user_id` da sessão, não excluído, não
     pagamento, chave = `de`; `returning id, desc_norm`;
  4. `aprender(userId, descNorm, herdada, para)` para cada `desc_norm`
     distinto: as próximas importações já entram com o nome novo (e a
     categoria herdada).
  - Nenhum renomeado → 404 `nao_encontrado`.
  - Resposta `{ ok: true, renomeados, categoria: nome | null }`.
- Tela: [Renomear] abre um campo com `datalist` dos nomes existentes
  (`GET /api/txn/nomes`: nomes na tela distintos do usuário, não excluídos,
  não pagamento, ordem alfabética, até 3000), Salvar/Cancelar (Enter/Esc).
  Depois de salvar: `estab = para`, recarrega, aviso
  `textoRenomeado(n, de, para, categoria)`:
  "12 lançamentos de “A Ferreira” agora são “Alane Ferreira” (Padaria)." —
  sem categoria herdada, sem o parêntese; 1 → singular.

## 4. Puro e testes

`src/lib/nome-na-tela.ts` ganha `validarNovoNome`, `categoriaHerdada` e
`textoRenomeado`. Testes em `scripts/testes.ts`:
- `validarNovoNome`: vazio; só espaço; 61 caracteres; igual com outra caixa e
  espaços → erro; válido → nome com trim.
- `categoriaHerdada`: vazio → null; a mais comum; empate → a mais recente.
- `textoRenomeado`: com e sem categoria; singular.

## 5. Conferência

Clicar num nome recorrente: só ele, os dois totais batem com o que se espera.
Renomear uma variação ("A Ferreira") para o nome principal: os dois grupos
viram um, com a categoria do principal, e o filtro mostra o total somado.
