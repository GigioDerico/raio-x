# Tarefa 4.2c — Dia contra dia e projeção do mês corrente

Data: 2026-10-06 · Guia: Painel ("A comparação dia contra dia chega na fatia 4") · Plano técnico: "A fatura aberta muda de valor todo dia" · Base: 4.2a (fatura `aberta`, `statement.fechamento`) · Branch `tarefa-4.2c-dia-contra-dia`

## 1. Decisões do brainstorming

- **Pelo ciclo da fatura aberta**, não pelo mês civil: o painel agrupa pelo mês
  em que se paga (as compras de 6/out estão na fatura de nov), então "dia 6
  contra dia 6" nunca ligaria. Compara-se "N dias de ciclo contra os mesmos N
  dias do ciclo anterior".
- **Liga só quando o mês mostrado tem fatura aberta** (`statement.status =
  'aberta'`, criada pela 4.2a). Mês só de faturas fechadas (PDF, ou Pluggy já
  fechado) continua mês inteiro contra mês inteiro, como hoje.
- **Mesma linha do Hero, texto novo.**
- **Projeção de fechamento** no Hero, junto do parcial.
- Conta nova (o app antigo nunca teve fatura aberta): não há o que portar.

## 2. Dados no contexto

`Lanc` ganha `data?: string` ('YYYY-MM-DD', a data do lançamento como gravada) e
`Fatura` ganha `aberta?: boolean` e `fechamento?: string` — todos opcionais, a
paridade com o legado não muda. `painel-repo.ts` seleciona `txn.data`,
`statement.status` e `statement.fechamento`; `adaptador.ts` repassa (`aberta =
status === 'aberta'`).

## 3. Ciclo — `src/lib/calculos/ciclo.ts` (puro)

Por cartão (`chaveCartao`), no mês `m` mostrado. As faturas do mesmo cartão no
mesmo mês viram uma (lançamentos somados, `aberta` se alguma for, `fechamento` e
`vencimento` o primeiro não nulo): o Pluggy pode entregar duas no mês (4.2a), e
sem juntar a segunda passaria por "ciclo anterior" da primeira.

- `inicioDoCiclo(anterior)`: dia seguinte ao fechamento da fatura
  anterior do mesmo cartão (`anterior.fechamento`, ou `anterior.vencimento − 7`
  sem fechamento); sem fatura anterior → `null` (sem comparação para o cartão).
- `ateDia(fatura, limite)`: soma de `gastos(fatura)` com `data ≤ limite`
  (lançamento sem `data` conta — é o que o legado faria); parcela de compra
  antiga tem `data` velha e conta sempre, nos dois ciclos, o que é justo.
- `compararCiclo(ctx, m, hoje)`: para cada cartão com fatura **aberta** em `m`:
  - `dias` = `hoje − inicio` (≥ 0);
  - `atual` = `ateDia(aberta, hoje)`;
  - ciclo anterior: a fatura do mês anterior do mesmo cartão e o início dela
    (fechamento da fatura de dois meses antes); `anteriorMesmoPonto` =
    `ateDia(anterior, inicioAnterior + dias)`;
  - **meses vizinhos**: o cartão só entra se tem fatura em `m − 1` e em `m − 2`;
    um buraco esticaria o "ciclo" por dois meses;
  - **teto de dias**: se `dias` passa da duração do ciclo anterior
    (`inicio − inicioAnterior`), o cartão fica fora — fatura "aberta" velha ou
    esquecida não vira "91º dia do ciclo";
  - devolve `{ atual, anterior, dias | null, cartoes }` somando os cartões
    (`dias` só quando todos os cartões comparados têm o mesmo; senão `null`;
    `cartoes` = as `chaveCartao` comparadas). Nenhum cartão comparável → `null`.
- `projetarFechamento(ctx, m, hoje)`: por cartão aberto, `atual + resto`, com
  `resto` = média, nos até 3 ciclos anteriores do cartão, de `total do ciclo −
  ateDia(ciclo, inicio + dias)` (o que costuma entrar do ponto N até o
  fechamento: fixos, parcelas e o variável que falta). Os ciclos anteriores
  param no primeiro buraco de mês. Cartão fora da comparação fica fora da
  função; o painel soma à projeção o `totalFatura` das faturas de `m` dos
  cartões que não estão em `cartoes` — não `cur − atual`, que contaria duas
  vezes o lançamento com data depois de hoje já na fatura aberta (o resto médio
  cobre). Devolve a soma, ou `null` sem cartão comparável.

`hoje` é parâmetro (dia de calendário em São Paulo); a página passa o dia real.

## 4. Painel

- `resumoDoPainel(ctx, …, hoje)`: quando `compararCiclo` devolve algo, o hero
  mantém `cur` = total do mês, usa `prev = anteriorMesmoPonto` e `delta =
  atual / prev − 1`, e ganha `ciclo: { dias, atual, comparados, total }`
  (`comparados` = cartões comparados, `total` = cartões do mês) e `projecao:
  number | null`; senão, como hoje (`ciclo: null`, `projecao: null`).
- `Hero.tsx`: com `ciclo`, o chip vira "▲ 21% vs mesmo ponto do ciclo anterior
  +R$ 30"; abaixo do total, "dia 11 do ciclo · deve fechar perto de R$ 3.100"
  (sem `dias`, só a projeção). Comparando parte dos cartões, o chip tem `title`
  "compara N de M cartões". O ▲/▼ é `aria-hidden` e o leitor de tela ouve "alta
  de"/"queda de" (`.sr-only`). Com `ciclo` e sem `delta` (anterior zerado), o
  chip diz "primeiro gasto neste ponto do ciclo".
- A página (`src/app/(app)/page.tsx`) passa `hoje` (São Paulo).

## 5. Testes (`scripts/testes.ts`)

- `inicioDoCiclo`: pelo fechamento; sem fechamento (vencimento − 7); sem
  anterior → null.
- `ateDia`: corta pela data; sem data conta.
- `compararCiclo`: um cartão aberto (atual, mesmo ponto do anterior, dias);
  dois cartões com dias diferentes (`dias` null); mês sem fatura aberta → null;
  buraco de mês (sem a fatura de `m − 1` ou de `m − 2`) → cartão fora; duas
  faturas do cartão no mesmo mês → somadas, comparação certa; `hoje` 60 dias
  depois do início (ciclo anterior de 30) → fora.
- `projetarFechamento`: com 1 e 3 ciclos anteriores; sem anterior; ciclos
  anteriores param no buraco.
- Painel: total do mês inteiro com cartão fora da comparação (somado à
  projeção pelo total da fatura); lançamento futuro na fatura aberta não conta
  duas vezes na projeção.
- Paridade intacta (campos opcionais).

## 6. Conferência

No painel de nov/26 (fatura aberta do Itaú): "vs o mesmo ponto do ciclo
anterior" e "deve fechar perto de"; em out/26 (fechado), mês inteiro como hoje;
390px e desktop.
