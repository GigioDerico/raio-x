# Tarefa 4.4 — Correções dos achados médios da auditoria

Data: 2026-10-07 · Achados: `docs/security-audit/achados-2026-10-06.md` (A-07,
A-09, A-10; A-11 junto, por ser a mesma rota) · Branch
`tarefa-4.4-correcoes-auditoria`

## 1. Decisões do brainstorming

- **Teto de IA:** passado o teto mensal, só a chamada automática para (a
  categorização do sync). O que o dono dispara por botão segue — é o que o
  plano técnico já previa ("passado o limite, as chamadas automáticas param").
- **Nome do titular no PDF:** sai pela linha com rótulo (Titular, Nome, Cliente,
  Portador). Nome solto, sem rótulo, pode passar — aceito para não arriscar a
  leitura do cabeçalho.
- **Login:** além da espera por IP, um teto global **suave**: passou de 30
  falhas na última hora somando todos os IPs, passa uma tentativa por minuto.
  Nunca tranca o dono de vez.

## 2. A-09 — o texto do PDF passa por `ia.ts`

`src/lib/ia.ts` (puro) ganha:

- `textoDaFaturaParaIA(trecho: string): string` — filtra linha a linha:
  - **tira a linha inteira** quando ela tem: CEP (`\d{5}-\d{3}`); começo de
    endereço (`Rua`, `R.`, `Av.`, `Avenida`, `Alameda`, `Travessa`, `Rodovia`,
    `Estrada`, `Praça`, seguido de espaço); linha digitável ou código de barras
    (20 dígitos ou mais contando só os dígitos de um bloco de dígitos, pontos e
    espaços); as palavras `limite`, `saldo` ou `disponível`/`disponivel`
    (sem diferenciar maiúscula); e-mail; o rótulo `titular`, `nome`, `cliente`
    ou `portador` seguido de `:` ou de espaço e texto.
  - **troca dentro da linha:** CPF (`\d{3}\.?\d{3}\.?\d{3}-?\d{2}`) por
    `[CPF]`; número de cartão de 13 a 19 posições (dígitos, `X`, `*` ou `•`,
    em grupos separados por espaço ou hífen, terminando em 4 dígitos) por
    `•••• 1234` com os 4 finais.
  - Linha de lançamento comum (data, descrição, valor) sai igual.
  - **Linha com cara de lançamento** (`dd/mm` e um valor `0,00`) que também
    casa uma regra acima não é tirada inteira: o `pdf-cliente` monta a linha
    pela coordenada Y, e um PDF de duas colunas junta "Limite total R$ …" com
    um lançamento na mesma linha. Nela só o pedaço sai: o CEP vira `[CEP]`, o
    bloco de código vira `[código]`, o e-mail vira `[e-mail]`, e
    `limite`/`saldo`/`disponível` até o primeiro valor, assim como o rótulo de
    nome com `:` e as palavras que o seguem, viram `[omitido]`.
  - O rótulo de nome só conta no começo da linha (`Titular`, `Nome`, `Nome do
    titular`, `Cliente`, `Portador`) ou seguido de `:` — "RESTAURANTE BOM NOME"
    não é rótulo.
  - Limite conhecido: num layout em tabela, a linha só com os valores (abaixo
    da linha dos rótulos) passa; sem rótulo, são números soltos.
- `promptDeExtracaoParaIA(trecho, comCabecalho, idx, n, anoDica)` — chama
  `promptExtracao` (que fica em `extracao.ts`, sem mudar o texto) com o trecho
  já filtrado. A rota `/api/import/trecho` passa a usar só esta.

A-11 na mesma rota (e em `/api/import/comitar`): `corpoJson` passa para dentro
do `comUsuario`, como nas outras rotas — JSON inválido vira 400, e quem não tem
sessão não tem o corpo lido.

## 3. A-10 — teto aplicado e limite de chamadas

### Trava no transporte

`pedirJson` e `pedirTextoEmStream` (`src/lib/openrouter.ts`) passam a exigir
`reserva: ReservaIA` nas opções — um tipo marcado que só
`reservarChamadaIA(userId, origem)` fabrica. Chamada nova sem trava não
compila. A reserva é um passo à parte (e não feita dentro do `pedir…`) porque
as rotas de stream precisam do 429 **antes** de abrir o stream, ainda dentro do
`comUsuario`. `reservarChamadaIA`:

0. Sem `OPENROUTER_API_KEY`: `automatica` → `null`; `botao` → `SemChaveIA`
   (os chamadores já tratam) — não se grava chamada que não vai acontecer.

1. **Limite por tempo**, por usuário: até 60 chamadas nos últimos 10 minutos e
   400 nas últimas 24 horas. Passou → `botao`: `ErroDeUso` 429 com os
   segundos até liberar; `automatica`: `null`, com log.
2. **Teto**, só para `automatica`: `resumoGasto(gastoDoMes, teto).acima`
   (teto = `lerConfig().tetoIaUsd ?? env.AI_BUDGET_USD_MONTH`; teto 0 = sem
   teto, como já é em Ajustes) → `null`.
3. Grava a chamada em `ia_chamada` (antes de chamar o modelo: a `ai_uso` só
   registra depois e perderia a que falhou). O modelo de reserva conta como a
   mesma chamada.

A contagem e a gravação não são atômicas: duas chamadas ao mesmo tempo podem
passar uma ou duas do limite. Aceito — o limite protege a ordem de grandeza do
gasto, não um número exato.

`reservarChamadaIA` vive em `src/lib/ia-uso-repo.ts` (já tem `gastoDoMes`); a
regra da contagem (`limiteDeIA(janela, agora)` → `null | segundos`), o texto
do 429 e o tipo `ReservaIA` são puros, em `src/lib/ia-limite.ts`, para serem
testados sozinhos. A hora vem do banco (`now()`), não do servidor.

### Chamadores

| Onde | origem | Limite estourado | Acima do teto |
| --- | --- | --- | --- |
| `categorizar-repo.ts` (sync), por lote | automatica | o lote fica sem categoria IA, como num lote com erro; log | idem, sem log |
| `/api/import/trecho` | botao | 429 | segue |
| `/api/plan` (refinar), `/api/resumo` | botao | 429 | segue |
| `/api/diagnostico`, `/api/conversa` | botao | 429, reservado no preparo, antes de abrir o stream | segue |

`stream-rota.ts` recebe a reserva e a repassa.

A categorização que parou por teto deixa o lançamento como o sync já deixa sem
chave: categoria aprendida, ou sem categoria para o dono corrigir.

`ErroDeUso` aceita 429 com `Retry-After`. Em `src/lib/falha.ts`, 429 entra em
`DE_USO`, e a mensagem diz "muitas chamadas de IA em pouco tempo; tente de novo
em N minutos".

### Ajustes

O aviso `Passou do teto deste mês. Nada foi bloqueado.` vira `Passou do teto
deste mês. A categorização automática parou; o que você pede por botão
continua.`

## 4. A-07 — login

### IP

`ipDaRequisicao(headers, ambiente)` vira função pura em `src/lib/ip.ts`:

- Na Vercel (`VERCEL=1`): `x-real-ip`, que a borda escreve.
- Fora dela, com `IP_HEADER` definido (variável nova, opcional, em `env.ts` e
  `.env.example`): o valor mais à direita desse cabeçalho — o que o proxy de
  confiança acrescentou.
- Sem nenhum dos dois: `'sem-ip'`. Todo pedido cai no mesmo balde: a espera
  por IP vira espera única, e quem forja cabeçalho não ganha nada.

### Sem corrida

`reservarTentativa(chave)` em `src/lib/auth.ts`, num único comando SQL (o `on
conflict do update` trava a linha, então pedidos paralelos se enfileiram):

- se a chave está em espera (`bloqueado_ate > now()`), não mexe e devolve os
  segundos que faltam;
- senão, soma uma tentativa e grava a espera da nova contagem (mesma escada de
  hoje: 3 livres, depois 2^(n−3) s, teto de 15 min) e devolve 0.

A rota reserva **antes** do scrypt. Senha certa → `limparFalhas(ip)` como hoje;
errada → só registra a falha global (a tentativa já foi contada).

A espera precisa ser calculada dentro do mesmo comando — calcular em TS e
gravar num segundo comando reabre a corrida. O SQL usa
`least(power(2, n - LIVRES), TETO_S)` quando `n > LIVRES`, com `LIVRES` e
`TETO_S` interpolados das constantes; `esperaSegundos` continua pura, testada,
e documenta a mesma escada. As três saem de `auth.ts` (que é `server-only` e o
teste não importa) para `src/lib/tentativas.ts`, puro.

A rota lê o corpo **antes** de reservar: pedido sem senha (400) não gasta
tentativa.

### Teto global suave

- Tabela `login_falha (em timestamptz not null default now())`, índice em `em`.
- Senha errada → `insert into login_falha`; no mesmo comando, apaga as de mais
  de um dia.
- Antes de reservar por IP, se `count(login_falha na última hora) ≥ 30`:
  `reservarVaga('*', 60)` — um comando que, se a linha `'*'` de
  `login_attempt` não está em espera, grava `bloqueado_ate = now() + 60 s` e
  deixa passar; se está, devolve os segundos que faltam. Com o teto ativo,
  passa uma tentativa por minuto, para todos.
- O 429 do global é o mesmo do IP (`muitas_tentativas`, `tenteEm`).

## 5. Migração `drizzle/0011_limites.sql`

```sql
create table if not exists ia_chamada (
  id bigint generated always as identity primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  origem text not null,
  em timestamptz not null default now()
);
create index if not exists ia_chamada_user_em on ia_chamada (user_id, em);

create table if not exists login_falha (
  id bigint generated always as identity primary key,
  em timestamptz not null default now()
);
create index if not exists login_falha_em on login_falha (em);
```

`schema.ts` ganha `iaChamada` e `loginFalha`. Aplicar no Neon só com
autorização do dono.

## 6. Testes (`scripts/testes.ts`)

- `textoDaFaturaParaIA`: cabeçalho inventado com nome rotulado, CPF, endereço
  com CEP, limite, saldo, disponível, e-mail, linha digitável e cartão
  `5502 XXXX XXXX 1234` → nada disso sai, cartão vira `•••• 1234`; cinco linhas
  de lançamento (com parcela, estorno, valor com milhar) saem iguais.
- `limiteDeIA`: abaixo dos dois limites → null; 60 em 10 min → segundos até a
  mais antiga da janela sair; 400 em 24 h → idem.
- `ipDaRequisicao`: Vercel com `x-real-ip`; `IP_HEADER=x-forwarded-for` com
  `a, b, c` → `c`; sem nada → `sem-ip`; `x-forwarded-for` forjado sem
  `IP_HEADER` e fora da Vercel → `sem-ip`.
- `esperaSegundos`: 0 até 3; 2, 4, 8 s depois; teto de 900 s.

## 7. Conferência

- Importar um PDF real: lançamentos e cabeçalho lidos como antes.
- Ajustes: texto novo do aviso (com teto baixo de propósito, se o dono quiser).
- Login: senha errada 4 vezes seguidas → espera; senha certa depois → entra.

## 8. Fora

- Restringir quais modelos o dono pode escolher em Ajustes: o teto já segura o
  custo.
- Achados baixos e informativos restantes (A-01, A-04, A-06, A-08; A-02, A-03,
  A-05): antes de tornar o repositório público.
