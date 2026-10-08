# Tarefa 4.2b — PDF × Pluggy

Data: 2026-10-06 · Plano técnico: "Deduplicação" (aviso de mês coberto, tela de possíveis duplicados) · Base: 4.0 (planejador, `suspeito_duplicado`), 4.2a · Branch `tarefa-4.2b-pdf-pluggy`

## 1. Decisões do brainstorming

- **PDF de um mês que já vem pelo Open Finance: avisa e para.** Não importa nada
  (o PDF não tem passe aproximado; a descrição limpa pela IA na leitura do PDF
  quase nunca bate com a do Pluggy, e tudo duplicaria).
- **Possíveis duplicados: faixa em Lançamentos** com a revisão ali mesmo.

## 2. Mês coberto

### Regra — `mesCoberto` (`src/lib/txn-repo.ts`, server-only)

`mesCoberto(userId, last4, mesRef): Promise<boolean>` — verdadeiro quando existe
conta do usuário, `kind = 'cartao_credito'`, `last4` igual, com
`pluggy_account_id` não nulo **e**, nessa conta, há:
- uma `statement` com `pluggy_bill_id` não nulo e `mes_ref = mesRef-01`, **ou**
- um `txn` `fonte = 'pluggy'`, não excluído, cujo `mesDaTxn = mesRef` (cobre a
  fatura aberta criada pela 4.2a, sem `pluggy_bill_id`).

Sem `last4` no cabeçalho (`cartao` vazio): falso (não dá para saber; segue como hoje).

### Parar cedo — `POST /api/import/conferir`

Corpo `{ cabecalho }`, dentro de `comUsuario`. `limparCabecalho(cabecalho)`; sem
`vencimento` ou sem `cartao` → `{ coberto: false }`; senão `mesRef =
vencimento.slice(0, 7)` e `{ coberto: await mesCoberto(...), mes: mesRef,
cartao }`.

`Importar.tsx`: assim que um trecho devolver `cabecalho` (normalmente o 1º),
chama `/api/import/conferir` uma vez. Coberto → interrompe o laço (não lê os
outros trechos, não chama `comitar`) e mostra, com `ErroLocal`:

> "{Mês por extenso} do cartão ••{last4} já vem pelo Open Finance. Para
> conferir, use Lançamentos — importar o PDF duplicaria as compras."

(`mesPorExtenso("2026-09")` → "Setembro de 2026", puro, `src/lib/filtro.ts` ou
`formato.ts`.)

### Segunda trava — `comitar`

Depois de `mesDeReferencia` e antes de `contaDoPdf`:
`if (cab.cartao && await mesCoberto(userId, cab.cartao, mesRef)) throw new
ErroDeUso('mes_coberto', <a mesma frase>, 409)`. `409` passa a ser mostrado como
mensagem de uso no cliente (`DE_USO` já inclui 409).

## 3. Possíveis duplicados

### Candidatos — `candidatosDoSuspeito` (puro, `src/lib/duplicados.ts`)

```ts
type LinhaDup = { id: string; accountId: string; data: string; valor: number; fonte: 'pdf' | 'pluggy' | 'manual'; excluido: boolean };
export function candidatosDoSuspeito(suspeito: LinhaDup, outras: readonly LinhaDup[]): LinhaDup[]
```

Mesma conta, `fonte = 'pdf'`, não excluído, sem `duplicado_de`, `|valor|` igual (centavos) **e mesmo sinal** (estorno não é oferecido como a mesma compra — decisão da revisão),
`|data − suspeito.data| ≤ 3 dias`, id diferente; ordenados pela distância de
datas (mais perto primeiro).

### Listagem — `GET /api/txn/suspeitos?{filtro}`

Dentro de `comUsuario`. Suspeitos do usuário (`suspeito_duplicado = true`, não
excluídos) no recorte (mês e cartões do filtro, pelo `mesDaTxn`), e, para cada
um, os candidatos (uma consulta só para todas as linhas PDF das contas e da
janela de datas envolvidas; o casamento é feito por `candidatosDoSuspeito`).
Resposta: `{ suspeitos: [{ id, data, valor, nome, cartao, candidatos: [{ id,
data, valor, nome }] }] }`, `nome` = apelido → `desc_limpa` → `desc_origem`.

### Decisão — `POST /api/txn/[id]/duplicado`

Corpo validado por `validarDecisao(v)` (puro, `duplicados.ts`):
`{ decisao: 'mesmo', candidatoId }` | `{ decisao: 'diferente' }` |
`{ decisao: 'desfazer', candidatoId }`; `candidatoId` com `ehUuid`.

Repositório `decidirDuplicado(userId, id, decisao)` (`txn-repo.ts`), numa
transação (`db.batch`), toda escrita com `user_id` no `where`:
- **mesmo**: confere que `candidatoId` é candidato do suspeito (mesma regra,
  relida no banco — nunca confiar no cliente); no suspeito: `suspeito_duplicado
  = false`, e `apelido = coalesce(suspeito.apelido, candidato.apelido)`;
  categoria: se a do candidato é `manual`, copia `category_id` e `category_fonte
  = 'manual'`; no candidato: `excluido_em = now()`.
- **diferente**: `suspeito_duplicado = false` no suspeito.
- **desfazer** (do "mesmo"): candidato `excluido_em = null`; suspeito
  `suspeito_duplicado = true` (apelido/categoria copiados ficam — são do mesmo
  dono e inofensivos).
- Suspeito inexistente, de outro usuário, ou candidato inválido → 404.

### Tela — `Lancamentos.tsx`

- Carrega `/api/txn/suspeitos?{filtro}` junto com a lista; com `n > 0`, faixa
  `.aviso` no topo: "{n} possíveis duplicados — fora dos totais até você
  decidir." + botão "Revisar".
- "Revisar" abre um painel `.duplicados` (na própria página, abaixo da faixa):
  para cada suspeito, a linha do Pluggy e, abaixo, cada candidato do PDF com
  "É este"; e "São diferentes" para o suspeito.
- "É este" → mostra "desfazer" por 10 s (o mesmo padrão da exclusão), recarrega
  lista e suspeitos. Sem candidato (o PDF foi excluído depois): só "São
  diferentes".
- Falhas por `AvisoDeFalha`.

## 4. Segurança

- `user_id` da sessão; posse no `where`; o candidato é revalidado no servidor.
- Exclusão lógica (regra 6); categoria manual preservada (regra 7).
- Nada vai à IA nesta tarefa.

## 5. Testes (`scripts/testes.ts`)

- `candidatosDoSuspeito`: dentro de ±3 dias; 4 dias fora; sinal oposto fora;
  ligado (`duplicado_de`) fora; outra conta fora; fonte pluggy fora; excluído fora;
  ordem pela distância.
- `validarDecisao`: as três formas; `candidatoId` inválido; decisão
  desconhecida; não-objeto.
- `mesPorExtenso`.

## 6. Conferência

Importar o PDF de setembro de um cartão Itaú conectado: para no 1º trecho com a
mensagem, sem lançar nada (gasto de IA = 1 trecho). PDF do Sicredi segue
importando. Duplicados: hoje não há; a revisão fica testada pelos testes e pela
revisão de código — se aparecer um caso real, conferir no navegador.
