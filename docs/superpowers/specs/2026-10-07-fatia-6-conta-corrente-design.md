# Fatia 6 — conta corrente

Data: 2026-10-07 · Estado: aprovado no brainstorming, aguardando revisão da spec

## Objetivo

Trazer as transações da conta corrente do Pluggy do mesmo jeito que as do cartão,
para que o raio-x passe a mostrar o dinheiro todo e não só o que passou pelo
cartão. Os débitos da conta viram gasto categorizado. Os créditos que você marca
como renda substituem a renda digitada. O "gasto fora do cartão" estimado deixa
de existir, porque passa a ser medido.

**Fora do escopo:** saldo e extrato. O `mapear.ts` já lê o saldo, mas nenhuma tela
o mostra nesta fatia. "Quanto posso gastar até o fim do mês" também fica para
depois.

## Decisões do brainstorming

| Pergunta | Decidido |
| --- | --- |
| O que as transações da conta alimentam | Gastos (débitos) e renda real (créditos marcados) |
| Pagamento de fatura, transferência própria, aplicação e resgate | Regra automática; você corrige, e a correção manual nunca é sobrescrita |
| O que é renda | Só o que você marca como renda |
| Marcar renda aprende? | Sim, pela origem (`desc_norm`), como a categoria aprendida |
| Renda declarada e gasto fora do cartão | Saem de Ajustes; painel e plano usam a renda marcada |
| Onde corrigir | Gastos em Lançamentos; créditos na tela nova Entradas |
| Pix e TED para pessoa física | Não vão à IA; chegam como "Outros" e você categoriza |
| Modelagem | Coluna `papel` no `txn` (não tabela separada, nem reaproveitar `tipo`) |

`tipo` continua sendo a composição (fixo, parcela, encargo, escolha, pagamento).
`papel` é outra pergunta: se o lançamento conta como gasto, como renda ou não
conta. Misturar as duas faria os cálculos portados errarem sem avisar.

## 1. Dados e sync

### Migração `0013_papel.sql`

- `txn.papel` (`text not null default 'gasto'`, `check in ('gasto','entrada','renda','fora')`)
- `txn.papel_fonte` (`text not null default 'auto'`, `check in ('auto','manual')`)
- `learned_label.papel` (`text null`, mesmo `check` sem `'gasto'`)

Tudo o que já existe vira `gasto`/`auto`, então nada muda no cartão. As colunas
`user_setting.renda_declarada` e `user_setting.gasto_fora_cartao` só são apagadas
na 6.3, numa migração própria, depois que nenhum código as ler.

### Sync

O fluxo do cartão passa a valer para as contas `conta_corrente` da conexão:
mesma janela, mesmo dedupe e mesma exclusão lógica.

- **Sinal:** segue a convenção do cartão. `DEBIT` é positivo e `CREDIT` é negativo.
- **Mês:** conta não tem fatura, então `statement_id` fica nulo e o mês sai da `data`.
- **Upsert:** não toca `papel` quando `papel_fonte = 'manual'` e continua com
  `where txn.excluido_em is null`. É a mesma regra da `category_fonte`.

### Papel automático

É uma função pura em `src/lib/pluggy/mapear.ts`, testável sem banco:

1. Pagamento de fatura (`operationType`, categoria do Pluggy ou descrição) → `fora`.
2. Transferência entre contas do próprio titular → `fora`. O teste é: o documento
   do pagador igual ao do recebedor no `paymentData`. A comparação acontece em
   memória, e nenhum dos dois documentos é gravado (regra 5).
3. Aplicação e resgate (categoria do Pluggy de investimento) → `fora`.
4. Senão, débito → `gasto` e crédito → `entrada`.
5. Depois disso, se `learned_label.papel = 'renda'` para a mesma `desc_norm`,
   `entrada` vira `renda`.

### IA

Pix e TED para pessoa física não saem da infraestrutura (regra 4). Contam como
pessoa física: CPF no `paymentData`, ou descrição de Pix, TED ou transferência
sem documento nenhum (o caso conservador). A decisão é do mapeamento
(`paraIA: false`), porque o `paymentData` não é gravado e só existe na hora do
sync. O sync tira esses ids da lista que vai a `categorizarPendentes`, então eles
nunca chegam a `src/lib/ia.ts`. Chegam com a categoria "Outros" e usam a
categoria aprendida quando existe. Pix para CNPJ, boleto e débito seguem o fluxo
normal. Crédito e o que não conta também não vão à IA, porque não precisam de
categoria.

Fora da categorização, o mesmo Pix é gasto e entra no painel, e o painel vira
prompt (resumo, diagnóstico, conversa, plano). Por isso o mapeamento é gravado:
`txn.pessoa_fisica` (migração `0014_pessoa_fisica.sql`) é a única coisa que,
depois do sync, diz que a descrição traz o nome de alguém. A coluna chega ao
`Contexto` dos cálculos como `privado`, e todo construtor de prompt que recebe
contexto passa por `contextoParaIA` (`src/lib/ia.ts`): o lançamento privado vai
como `Pix pessoa A`, `Pix pessoa B`… (uma letra por pessoa, AA depois de Z), com
valor, data e categoria, sem a descrição, sem o nome limpo e sem apelido — nem o
que o dono deu, porque o apelido de uma pessoa costuma ser o nome dela. A pessoa
é a chave com que os cálculos agrupam (`normDesc` do nome na tela), então fixas,
composição e projeção que a IA lê são as mesmas da tela; letra e não número
porque `normDesc` tira dígitos. As letras seguem a ordem das chaves, para a
página e a rota darem o mesmo prompt (o cache é pelo hash dele). Os apelidos
aprendidos com a chave daquela descrição também saem. A tela continua mostrando
o nome ao dono. `categorizarPendentes` ainda filtra `pessoa_fisica = false`,
como segunda trava.

Lançamento privado não ensina regra (`podeAprender`): a chave de
`learned_label` são três palavras genéricas no extrato ("PIX ENVIADO CP"), e o
apelido dado a uma pessoa seria pintado num Pix para empresa, que vai à IA.
Categoria levada pelo nome (`mesmaCategoriaPeloNome`) só alcança a mesma classe.
No sync, `pessoa_fisica` só sobe no atualizar/promover, nunca desce; sem
documento, a categoria de transferência do Pluggy também conta.

Vale também para o cartão (decisão do dono): o sync do cartão e a importação do
PDF gravam `pessoa_fisica` pela mesma regra sem documento
(`pareceTransferenciaParaPessoa`, `src/lib/descricao.ts`), e a migração
`0015_pessoa_fisica_cartao.sql` marca o que já estava gravado em qualquer conta.
No cartão o Pix para pessoa fica em "Outros" e não vai à categorização.
Limitação conhecida: a extração do PDF (`/api/import/trecho`) manda o texto da
fatura à IA por natureza, com os nomes que ela tiver; isso já existia e não muda
aqui — a coluna protege os prompts do painel depois da importação.

## 2. Telas

### Lançamentos

- Os gastos da conta (`papel = 'gasto'`) entram na mesma lista do cartão.
- A coluna CARTÃO passa a se chamar ORIGEM e mostra o apelido ou "Banco conta ••1234".
- O filtro global de cartões passa a incluir as contas correntes e se chama
  "Cartões e contas".
- O topo ganha um alternador **Gastos · Não conta (N)**. Em "Não conta" ficam os
  débitos com `papel = 'fora'`, e cada linha tem o botão "contar como gasto".
- A ação **"Não conta"** entra na linha e na multi-seleção, só para lançamentos
  de conta. Os do cartão continuam com o "excluir" de hoje.
- **"Não conta" aprende pela origem**, como a renda: grava `learned_label.papel =
  'fora'` pela `desc_norm` e os próximos lançamentos da mesma origem chegam como
  `fora`. É o caminho para boleto e débito automático de fatura de cartão
  ("Pagamento de boleto <emissor>", "Débito automático Fatura <cartão>"), que o
  texto sozinho não separa de um boleto qualquer (conferência da 6.0). Linha
  privada (`pessoa_fisica`) não ensina regra (ver `podeAprender`).

### Entradas (`/entradas`, nova)

No menu, fica em "O que aconteceu", depois de Lançamentos. No celular vai para
"Mais".

Mostra os créditos da conta no mês do filtro global, em três blocos:

- **Renda:** o total do mês fica no topo.
- **A marcar** (`entrada`): cada linha tem os botões **"É renda"** e **"Não conta"**.
- **Não conta** (`fora`): cada linha pode voltar.

Linha: data, descrição limpa, conta e valor. A ordem é por valor. Nenhum saldo.

**"É renda" aprende.** Grava `learned_label.papel = 'renda'` pela `desc_norm` e
aplica na hora às entradas `auto` da mesma origem. As próximas já chegam marcadas
pelo sync. Desmarcar apaga o aprendizado e devolve essas linhas `auto` para
`entrada`. Toda marcação feita por você grava `papel_fonte = 'manual'`.

**Estados vazios:**
- sem conta conectada → link para Conexões;
- mês sem créditos → aviso para trocar o mês;
- nenhuma renda marcada ainda → dica de que marcar uma vez basta.

### Ajustes (6.2)

- Saem os campos "renda declarada" e "gasto fora do cartão". A meta de poupança fica.
- As contas correntes aparecem na lista de contas, com apelido editável como os cartões.

### API

- `PATCH /api/txn/papel` com `{ ids, papel }` (1 a 500 ids) serve à linha e ao
  lote, nas duas telas; a posse e o tipo de conta ficam no `where` (regra 2).
- Só lançamento de conta corrente muda de papel. Débito admite `gasto` ou
  `fora`; crédito admite `entrada`, `renda` ou `fora`. O que não cabe é pulado;
  se nada coube → `ErroDeUso`.

## 3. Painel e plano

### Gastos da conta nos cálculos

O `montarFaturas` já agrupa lançamento sem fatura por conta e mês. Cada conta
corrente vira uma "fatura" por mês, e `porMes`, `porCategoria`, `recorrentes` e
`composicaoMes` passam a enxergá-la sem mudança na lógica portada.

- A consulta do painel filtra `papel = 'gasto'`.
- O Hero ganha o chip da conta ao lado dos cartões.
- A conta não tem fechamento, então a projeção a soma pelo caminho que já existe
  para o que ficou fora da comparação.
- Débito automático recorrente (aluguel, luz, escola) passa a aparecer como fixo
  pelo `recorrentes`.

### Renda real

Uma função pura nova, `rendaDoUsuario(rendaPorMes, mesFiltro, hoje)`, devolve:

- **renda do mês:** a soma de `papel = 'renda'` no mês do filtro, ou nulo;
- **renda base:** a média dos 3 últimos meses fechados que têm renda marcada, ou
  nula se não houver nenhum.

**No painel**, o `% da renda` usa a renda do mês. Sem renda no mês, usa a renda
base. Sem nenhuma das duas, o chip some, como já acontece hoje com renda zero.

**No plano e no Previsto**, `ctx.renda` = renda base e `foraCartao` = 0, porque
esse gasto agora está nos totais. As contas de `metasDoPlano` e `fecharMes` não
mudam, só o que entra nelas. O plano criado guarda a `renda_base` usada.

**Sem renda base**, o erro `sem_renda` diz "Marque sua renda em Entradas", com link.

**Textos:** "o que o cartão pode consumir" vira "o que pode ir para gastos".

## Subfatias

| # | Entrega | Útil sozinha porque |
| --- | --- | --- |
| 6.0 | Migração 0013, sync da conta, papel automático, filtro de pessoa física na IA, painel filtrando `papel = 'gasto'` | Os gastos da conta já aparecem no painel e em Lançamentos |
| 6.1 | Alternador em Lançamentos, ação "não conta", tela Entradas, aprendizado de renda | Dá para corrigir o automático e marcar a renda |
| 6.2 | `rendaDoUsuario`, painel, plano, Previsto e Ajustes sem os dois campos | A renda digitada some |
| 6.3 | Migração 0017 apagando `renda_declarada` e `gasto_fora_cartao` | Limpeza, quando nada mais lê essas colunas |

## Testes (`scripts/testes.ts`)

- Papel automático: débito, crédito, pagamento de fatura, transferência própria,
  aplicação e resgate.
- Detecção de pessoa física: CPF, CNPJ e descrição sem documento.
- Papel manual não é sobrescrito pelo mapeamento.
- Aprendizado de renda: marcar aplica à mesma origem; desmarcar devolve.
- `rendaDoUsuario`: mês com renda, mês sem renda com base, nenhum dado, e mês
  corrente fora da média.
- Paridade: os totais do cartão não mudam com o filtro `papel = 'gasto'`.
- Validação do `PATCH`: papel inválido para débito e para crédito, e papel em
  lançamento de cartão.

## Riscos

- **Pix entre contas próprias sem `paymentData`.** Fica como `gasto` ou `entrada`
  até você corrigir. A correção é manual e permanente.
- **Pagamento de fatura contado duas vezes.** Se a regra falhar, a fatura aparece
  no cartão e na conta. A paridade de totais e a conferência com dado real na 6.0
  são onde isso aparece.
- **Mudança no Hero.** O total do mês sobe, porque passa a incluir a conta. É o
  efeito desejado, mas vale avisar na tela da primeira vez.
