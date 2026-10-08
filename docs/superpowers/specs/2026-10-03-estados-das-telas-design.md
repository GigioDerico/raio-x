# Tarefa 7.4 — Estados das telas

Data: 2026-10-03 · Guia: [`docs/guia-de-construcao.md`](../../guia-de-construcao.md) ("Estados que toda tela precisa ter") · Branch `tarefa-7.4-estados`, tirada da 7.3

## 1. Ponto de partida

Levantamento tela × estado (2026-10-03) e teste no navegador: no Painel, trocar o
mês mostrou o esqueleto genérico de `src/app/(app)/loading.tsx` em 17 ms,
cobrindo a tela; o esmaecimento da casca acontecia por baixo e nunca era visto.
O Next 15 monta uma fronteira nova a cada mudança de URL (os searchParams entram
na chave do segmento), então qualquer `loading.tsx` — genérico ou com o formato
da tela — pisca ao trocar o filtro.

Outras lacunas: Lançamentos troca a tabela por "Carregando…" a cada busca,
edição ou exclusão; os `error.tsx` culpam sempre o banco; erros de `fetch` saem
crus ("Failed to fetch"); o "desfazer" da exclusão não confere a resposta; o
vazio por filtro não nomeia o recorte em todas as telas nem oferece voltar; a
importação descarta o aviso de trechos ignorados.

## 2. Decisões do brainstorming

- Entram: não apagar a tela; erro por tela; vazios e importação.
- Ficam fora: desfazer no plano e na conversa (Limpar conversa segue com
  confirmação).
- **Sem esqueleto em navegação dentro do app.** A tela atual esmaece até a nova
  chegar — no filtro e na troca de aba. O guia passa a dizer isso, com o porquê.

## 3. Não apagar a tela

- Sai `src/app/(app)/loading.tsx`. A classe `.esqueleto` fica (sem uso, sai se
  o CSS não a usar em outro lugar).
- **Troca de aba:** cada link do `Menu` ganha um filho `SinalNavegando` que lê
  `useLinkStatus()` (Next 15.5) e, pendente, renderiza
  `<span data-navegando className="menu-carregando" aria-hidden>` (um ponto
  pulsando ao lado do rótulo, ou no lugar do ícone no celular). CSS:
  `.casca:has([data-navegando]) main { opacity: .55; transition: opacity .15s }`,
  o mesmo valor de `.esmaecido`. O `main` recebe `aria-busy` só pela transição
  do filtro (CSS não muda atributo); a navegação por aba anuncia pelo título da
  página nova.
- **Filtro:** nada muda na casca (`useTransition` + `.esmaecido` já existem); sem
  o `loading.tsx`, passa a valer.
- **Lançamentos (`Lancamentos.tsx`):** separar "primeira carga" de "recarga".
  `carregando` só troca a tabela por "Carregando…" quando ainda não houve
  nenhuma resposta; nas recargas as linhas ficam, a tabela recebe a classe
  `esmaecido` e `aria-busy`. Uma resposta que chega fora de ordem (busca
  digitada rápido) não pode sobrescrever a mais nova: contador de requisição,
  como no `CampoAjuste`.

## 4. Erros

### `mensagemDeFalha` — puro, `src/lib/falha.ts`

```ts
export type Falha = { tipo: 'rede' | 'sessao' | 'uso' | 'servidor'; texto: string };
export function mensagemDeFalha(entrada: { status?: number; detalhe?: unknown; erro?: unknown; online?: boolean }): Falha
```

| Entrada | tipo | texto |
| --- | --- | --- |
| `online === false` ou `erro` é `TypeError` (falha de `fetch`) | rede | "Sem conexão com o servidor. Confira a internet e tente de novo." |
| `status` 401 | sessao | "Sua sessão expirou. Entre de novo." |
| `status` 400/404/409/415 com `detalhe` string não vazia | uso | o `detalhe` (cortado em 200) |
| qualquer outro | servidor | "O servidor não respondeu. Tente de novo em instantes." |

Usada em `Lancamentos.tsx` (carregar, salvar, excluir, restaurar, lote) e
`Importar.tsx`. Sessão → o texto vem com link "Entrar" para `/login`.
`restaurar()` passa a conferir `r.ok` e, falhando, mostra a mensagem (o aviso
de desfazer não some calado).

### `ErroDaTela` — `src/components/casca/ErroDaTela.tsx` (cliente)

`{ oQue: string; reset: () => void }` → título "Não consegui carregar {oQue}",
frase por tipo (`navigator.onLine === false` → rede; senão servidor: "O
servidor não respondeu — pode ter sido o banco ou a rede. Tente de novo."),
botão "Tentar de novo" (`router.refresh()` + `reset()`, como hoje) e, no tipo
rede, nada mais. Substitui o corpo dos `error.tsx` de `(app)`, ajustes,
categorias, parcelas e plano; diagnóstico e lançamentos ganham `error.tsx`
próprio ("o diagnóstico", "os lançamentos"). `src/app/error.tsx` (falha do
layout) usa o mesmo componente com "o app".

## 5. Vazio por filtro

### `fraseDoVazio` — puro, `src/lib/vazio.ts`

```ts
export function fraseDoVazio(o: { mes: string | null; nomesCartoes: string[] }): string
```

- `mes` = mês resolvido (`'YYYY-MM'`) ou `null` (todos os meses).
- Começo: `mes` → "Nada em jul/26"; `null` → "Nada".
- Cartões: nenhum → nada a acrescentar (com `mes` nulo e sem cartões:
  "Nada por aqui"); 1 → " no cartão Itaú"; 2–3 → " nos cartões Itaú e Nubank" /
  " nos cartões Itaú, Nubank e Inter"; 4+ → " em 4 cartões".

### `queryDoVazio` — puro, `src/lib/vazio.ts`

```ts
export function queryDoVazio(f: Filtro, mudanca: 'todos-cartoes' | 'mes-recente'): string
```

Devolve a query do link mantendo o resto do filtro. Como o middleware reaplica
o filtro do cookie quando a URL não traz nenhuma chave (`completarComCookie`),
uma query vazia vira `mes=` (chave presente, valor vazio → `lerFiltro` lê como
"mais recente") — senão o link voltaria ao filtro antigo.

### Cookie do filtro acompanha a URL

Hoje só o `FiltroGlobal` grava o cookie, no `onChange`; um link que muda o
filtro (os do vazio, os de categoria) deixa o cookie velho e a próxima página
sem chaves volta ao filtro antigo. O `FiltroGlobal` passa a gravar o cookie a
partir da URL sempre que os searchParams mudam (um `useEffect` sobre a query
lida), e o `onChange` deixa de gravá-lo.

### `VazioPorFiltro` — `src/components/casca/VazioPorFiltro.tsx` (servidor)

`{ frase: string; filtro: Filtro; caminho: string; dica?: string }` →
`<section className="cartao vazio">` com `<h1>{frase}</h1>`, a dica (opcional)
e até dois links que mantêm o resto do filtro:
- "Ver todos os cartões" quando `filtro.cartoes.length > 0`;
- "Voltar ao mês mais recente" quando `filtro.mes` é um mês fixo (não
  `'TODOS'`);
- os dois com `href={`${caminho}?${queryDoVazio(filtro, …)}`}`.

Usado em Painel (no lugar do vazio atual), Parcelas, Categorias, Diagnóstico e
na página de Lançamentos quando o recorte global está vazio (hoje é um
parágrafo dentro da tabela: passa a ser o componente, só para o vazio do
filtro global; o vazio de busca/categoria fica como está). Os nomes dos
cartões vêm de `opcoesDoFiltro` (os mesmos rótulos do filtro), não do last4.

## 6. Importação

`Importar.tsx` soma os trechos com `ignorado: true` e, no fim, mostra junto do
resultado: "1 trecho não pôde ser lido e ficou de fora" / "N trechos não
puderam ser lidos e ficaram de fora" (`avisoIgnorados(n)`, puro, em
`src/lib/falha.ts`; `n = 0` → `null`).

## 7. Guia

`docs/guia-de-construcao.md`, tabela de estados, linha **Carregando**: "Dentro do
app, a tela atual esmaece até a nova chegar (filtro e troca de aba); o item do
menu mostra que está carregando. Esqueleto não: o Next o mostraria a cada troca
de filtro, apagando a tela." `docs/design-system.md` registra `.menu-carregando`,
`ErroDaTela` e `VazioPorFiltro`.

## 8. Testes (`scripts/testes.ts`)

- `mensagemDeFalha`: `TypeError` → rede; `online: false` → rede; 401 → sessao;
  400 com detalhe → uso com o detalhe; 400 sem detalhe → servidor; 500 →
  servidor; detalhe de 300 caracteres cortado em 200.
- `fraseDoVazio`: mês sem cartões; mês com 1, 2, 3 e 4 cartões; sem mês com
  cartões.
- `avisoIgnorados`: 0 → `null`; 1 singular; 2 plural.
- `queryDoVazio`: tira cartões mantendo mês e obra; tira o mês mantendo
  cartões; resultado que ficaria vazio vira `mes=`; `lerFiltro` da saída dá o
  filtro esperado.

## 9. Conferência

Trocar mês e cartão no Painel, Categorias e Lançamentos: a tela antiga esmaece,
sem esqueleto. Trocar de aba: o item do menu indica e a tela esmaece. Buscar e
editar em Lançamentos sem a tabela sumir. Filtrar um cartão sem dados: frase com
o nome e os dois botões; clicar, abrir outra aba e ver que o filtro não voltou. Desligar a rede (DevTools offline) e recarregar dados
em Lançamentos: "Sem conexão…". 390px e desktop; claro e escuro.
