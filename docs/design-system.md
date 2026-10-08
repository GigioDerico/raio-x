# Raio-X — design system

Fonte da verdade: `src/app/globals.css`. Este documento explica o porquê; se os
dois divergirem, o CSS manda e este arquivo é corrigido.

## Princípios

Decisão de 30/09/2026: o dono comparou o painel da fatia 3.1 com as capturas
do app antigo (`docs/legado/telas/`) e decidiu **portar o visual original**,
pela mesma regra da lógica — porta, não reinventa. Isso revisou os dois
princípios de cor abaixo, que tinham sido escritos sem olhar o original.

- **Verde é o acento de ação** — botão, link, item ativo, "seu" (categoria
  corrigida à mão). É a cor que convida a clicar.
- **Vermelho (`--crit`) marca o que pede atenção**, não só erro: juros pagos
  e categoria "acima da média" no ranking, além de erro e excluir. O legado
  já usava assim — é julgamento visível, não alarme piscando: o texto do
  selo ("juros pagos", "acima da média") carrega o significado, a cor só
  reforça.
- **`--warn` para o que está subindo** (categoria "subindo", cobrança "nova
  neste mês"); **`--good`** para o que caiu abaixo da média.
- **Azul (`--series`) é a cor das barras do ranking** — categoria não é
  acento de ação, então não compete com o verde.
- **Hero escuro para o número do mês.** O total do painel vive num cartão à
  parte (`--hero`), separado do resto pela própria cor de fundo, não só por
  tamanho de fonte.
- **Borda fina no lugar de sombra pesada.** A sombra existe, mas quase não se vê.
- **Números com largura fixa** (`font-variant-numeric: tabular-nums`) em todo
  valor, senão uma coluna de dinheiro fica tremida.
- **Densidade por tela:** lista de lançamentos é densa (trabalho); painel é
  arejado (leitura).
- **Dinheiro:** centavos onde se confere (lista, ranking), arredondado onde se
  compreende (hero e indicadores do painel: `R$ 6.240`).
- **Tema segue o sistema** (`prefers-color-scheme`). Sem botão de troca.
- **Celular primeiro:** tudo funciona em 390px.

## Tokens

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--plane` | `#f4f5f2` | `#0b100e` | fundo da página (quente, não branco puro) |
| `--surface` | `#ffffff` | `#131a17` | cartões, listas, barras |
| `--surface-2` | `#f0f1ee` | `#1b2521` | hover, `code`, trilho de barra |
| `--ink` | `#121614` | `#e9f1ec` | texto principal |
| `--ink-2` | `#3c4642` | `#b6c7bf` | rótulos |
| `--muted` | `#6b7772` | `#8ca096` | texto secundário, metadados |
| `--hair` | `#e7e9e4` | `#1e2a25` | bordas de cartão e divisórias |
| `--line` | `#d5dad6` | `#2a3833` | bordas de campo, pílula de estado neutra |
| `--accent` | `#0e6b57` | `#5fe3b3` | ação, item ativo, "seu" |
| `--accent-2` | `#0a4e40` | `#8bedcb` | hover do acento |
| `--accent-soft` | `#e3f1ec` | `#16302a` | fundo de item ativo/selecionado |
| `--btn-ink` | `#fcfcfb` | `#0d0d0d` | texto sobre botão de acento |
| `--hero` | `#10201c` | `#131a17` | fundo do cartão do total do mês |
| `--hero-ink` | `#eaf1ed` | `#e9f1ec` | texto principal sobre o hero |
| `--hero-muted` | `#8fa79e` | `#8ca096` | texto secundário sobre o hero |
| `--hero-soft` | `rgba(255,255,255,.08)` | `rgba(255,255,255,.07)` | chip e cartão de cartão dentro do hero |
| `--hero-mint` | `#9fd9c4` | `#5fe3b3` | "já contratado" na barra e na variação do hero |
| `--series` | `#2a78d6` | `#3987e5` | barra de categoria no ranking |
| `--series-soft` | `#86b6ef` | `#184f95` | reservado (gráfico de meses) |
| `--series-ghost` | `#cde2fb` | `#12304f` | reservado (gráfico de meses) |
| `--good` | `#0ca30c` | `#0ca30c` | selo "abaixo da média" (pílula) |
| `--good-text` | `#006300` | `#0ca30c` | selo "abaixo da média" (texto) |
| `--warn` | `#fab219` | `#fab219` | selo "subindo" / "novo neste mês" |
| `--serious` | `#ec835a` | `#ec835a` | reservado |
| `--crit` | `#d03b3b` | `#d03b3b` | juros pagos, "acima da média", erro, excluir |
| `--s-fixo` | `#2a78d6` | `#3987e5` | reservado (barra de composição por tipo) |
| `--s-parcela` | `#eb6834` | `#d95926` | reservado |
| `--s-escolha` | `#1baf7a` | `#199e70` | reservado |
| `--shadow` | — | — | sombra quase imperceptível |
| `--r` | `20px` | — | raio de cartão |

## Tipografia

Familjen Grotesk (400, 500, 600, 400 itálico), servida pelo pacote
`@fontsource` — sem requisição a terceiro. `h1` 1.6rem, `h2` 1.05rem,
`.eyebrow` 11px em versalete com `letter-spacing: .09em`; no painel, o valor
do mês (`.hero-val`) é 54px/700 — a maior peça de texto do app.

## Componentes

| Classe | O que é |
| --- | --- |
| `.cartao` | superfície com borda `--hair`, raio `--r`, sombra `--shadow` |
| `.eyebrow` | rótulo pequeno em versalete |
| `.suave` | texto em `--muted` |
| `button` | pílula de acento; `button.link` é ação de texto; `.perigo` em `--crit` |
| `select.seu` | categoria corrigida por você (borda verde) |
| `.aviso`, `.barra` | faixa com ação (desfazer, lote) |
| `.lancs` | lista densa de lançamentos |
| `.tl-nome-botao`, `.estab-resumo`, `.estab-campo` | nome do lançamento como botão (filtra pelo estabelecimento; acento só no hover), resumo do estabelecimento num `.aviso` e o campo de renomear numa `.barra` (3.9) |
| `.alternador` | dois `button` com `aria-pressed`: o ativo em acento, o outro em `--ink-2` com hover `--surface-2`; 44px no celular (Lançamentos: Gastos · Não conta, 6.1) |
| `button.link.tl-papel` | "não conta" / "contar" na linha de conta corrente: na meta à direita no celular (44px), embaixo da origem no desktop (6.1) |
| `.erro` | mensagem de erro |
| `.casca`, `.menu-lateral`, `.menu-inferior`, `.filtro-global`, `.esmaecido` | casca do app (fatia 3.0) |
| `.faixa-conexao` | faixa no topo de todas as telas quando uma conexão precisa do dono (senha, autorização vencida ou vencendo): texto em `--ink` sobre fundo levemente tingido de `--crit`, borda `--crit` à esquerda, "Resolver" leva a Conexões (5.0) |
| `.vazio` | estado vazio: diz o que falta e oferece o caminho |
| `.hero` | cartão escuro do total do mês — valor, variação, % da renda, cartões, barra "já contratado × escolha" |
| `.hero-projecao` | com fatura aberta no mês, "deve fechar perto de R$ X" abaixo do total (14px, `--hero-muted`); a variação do hero passa a dizer "vs o mesmo ponto do ciclo anterior · Nº dia do ciclo" |
| `.stat` | indicador (juros e encargos, fixo todo mês, parcelas a vencer); `.stat.ruim` deixa o valor em `--crit` |
| `.chip` | selo de severidade — `.crit`/`.warn`/`.good`; o texto é o que importa, a cor reforça |
| `.rank-row` | linha do ranking "Onde está apertando": nome, selo, barra azul, valor, pílula de estado |
| `.tela-categorias .rank-row` | reusa o ranking para as 13 categorias; permite nomes completos, barra com largura zero e créditos em `--good-text`; obra separada tem selo neutro |

**Resumo do mês** (painel): o cartão `.resumo-mes` fica abaixo do hero e da
nota `.painel-obra` (que continua colada ao hero), com o recorte no `.eyebrow`. O texto da IA só aparece depois de pedido — abrir o
painel nunca chama o modelo. Três estados: `atual` (o texto e um "↻" discreto,
`button.link`, para gerar de novo), `desatualizado` (o texto antigo, a nota "Os
dados mudaram desde este resumo." em `--muted` e o botão "Refazer") e `nenhum`
(só o botão "Resumir o mês"). O "↻" tem alvo de toque de 44×44px, com margem
negativa para não crescer o cabeçalho. Ao terminar, o texto devolvido aparece na
hora e os botões ficam desabilitados até o painel recarregar; o cartão leva
`aria-busy` enquanto isso e o texto fica numa região `aria-live="polite"`. O
erro aparece em `.resumo-erro`, com `aria-live`, em `--crit` (clareado no
escuro, como o `.chip.crit`); vazia, ela fica no DOM, só sem margem.

**Diagnóstico** (`/diagnostico`): cartão `.diagnostico` com título do recorte,
"↻" (44×44) quando atual, nota "os números mudaram" quando desatualizado e um
botão só ("Gerar diagnóstico" / "Refazer"; "Parar" durante o stream). O texto
da IA passa por `markdownLeve` e vira `<h2>`, `<ul>` e `<p>` em `.texto-ia`;
valores em R$ ficam em `.dinheiro` (tabular, sem quebra). Status e erro numa
região `role="status"` sempre no DOM; o texto em stream não é `aria-live`.

**Conversa** (`/diagnostico`, abaixo do diagnóstico): cartão `.conversa` com
"Limpar conversa" (diálogo de confirmação `.dialogo-apagar`), lista `.conv-falas`
de `.bolha.pessoa` (direita, texto puro, `pre-wrap`) e `.bolha.ia` (esquerda,
`TextoIA`), divisória `.conv-divisoria` quando os números mudaram, sugestões
`.conv-sugestao` (44px) só com a conversa vazia, `textarea` com contador e um
botão só ("Enviar" / "Parar"). Status e erro em `role="status"` sempre no DOM.

**Parcelas e Previsto**: a faixa `.proj` abre a tela com o total da próxima
fatura (e o real, quando já chegou). Abaixo, `.prev-grid` traz duas colunas
`.prev-card` lado a lado — "pelo seu padrão" e "o que caberia na renda" —, cada
uma com sua `.prev-bar`: segmentos coloridos pelos tokens `--s-parcela`,
`--s-fixo`, `--s-escolha`, e o trecho vazio em `.resto` (tracejado). As duas
barras usam a mesma escala, para que o tamanho do ajuste entre padrão e teto
seja visual. Quando há renda informada, `.veredito` fecha a segunda coluna com
borda `ok`/`alerta`/`ruim`. Abaixo, a lista `.lista-parcelas` traz cada compra
parcelada em `.li` e fecha com `.sum-row`; as fichas por mês (`.ficha-mes`) são
`<details>` nativo — abrem por clique, toque ou teclado, sem JS.

**Ajustes**: cada campo é um `.campo-ajuste` — rótulo, o `input[type=text]`
global e um `.campo-msg` em `aria-live` com os estados `salvando`/`salvo`/`erro` (atributo, não classe: `.erro` global é a mensagem de erro de formulário);
com erro, o input ganha `aria-invalid` e borda `--crit`. Os campos salvam no blur
ou no Enter, sem botão. Ficam em `.ajustes-campos`, uma grade de 3 colunas no
desktop e 1 em ≤620px; cada cartão (`.ajustes-cartao`) é separado do anterior por
uma linha `--hair`. O bloco de IA mostra o gasto do mês numa barra `.ia-barra`
(`--accent`; vira `--crit` acima do teto, com o texto clareado no escuro) — o teto
só avisa, nada é bloqueado. Em "Seus dados", o CSV é um link de download com a
cara de botão (`a.botao`); "Apagar tudo…" é um `button.link.perigo-texto` que
abre um `<dialog>` (`.dialogo-apagar`) pedindo a frase digitada, com o botão
`button.perigo` (fundo `--crit`, texto branco fixo: ~4,8:1 nos dois temas)
desabilitado até o texto ser exatamente `APAGAR TUDO`. `.perigo` sem `.link` é o
botão cheio; `button.link.perigo` continua sendo o "×" de excluir da lista.

**Conexões** (`/conexoes`): um `.cartao.conexao` por banco, com logo (ou bolinha
na cor do banco com a inicial), nome, linha de estado (`estadoDaConexao`: texto
e ação do guia; erro de login, consentimento e falha em `--crit`; instabilidade
do banco em cinza — é deles), os cartões da conexão e as ações: "Atualizar
agora" ou "Reconectar"/"Renovar", e "Desconectar" discreto com diálogo de
confirmação (revogar não tem volta). Progresso e resumo por cartão em
`.conectar-resumo`, dentro de `role="status"`. "Conectar banco" abre o widget
do Pluggy e, depois, mostra o progresso cartão a cartão ("Trazendo Nubank
••1234 — 1 de 2…"), com o resumo em `.conectar-resumo` (cartão que falhou em
`.falhou`). Em Ajustes, "Bancos conectados" só aponta para `/conexoes`.

**Plano**: a tabela `.tabela-plano` tem a primeira coluna fixa (`position:
sticky`) e rola na horizontal dentro do cartão (`.tabela-plano-rolagem`). Meta
sem corte fica em `--muted`; o "real" de cada mês aparece em `--good-text` quando
bateu a meta e em `--crit` quando passou (clareado no escuro, como o `.chip.crit`).
O questionário é um `<dialog>` nativo (`.dialogo-plano`): Esc fecha sem salvar e o
foco entra no diálogo; cada pergunta é um `fieldset`/`legend`, e as categorias
são `.chip-sel`.

**Navegação pendente**: o item do menu clicado ganha `.menu-carregando` (ponto
pulsando; sem animação com `prefers-reduced-motion`) e o `main` esmaece a 0,55
por `.casca:has([data-navegando])`, o mesmo valor de `.esmaecido` do filtro.
Não há `loading.tsx` no grupo `(app)`.

**VazioPorFiltro**: `.cartao.vazio` com a frase de `fraseDoVazio` ("Nada em jul/26
no cartão Itaú") e até dois `.botao` — "Ver todos os cartões" e "Voltar ao mês
mais recente" — em `.vazio-acoes`.

**ErroDaTela / AvisoDeFalha**: erro de página diz o que não carregou e separa
"sem conexão" de "o servidor não respondeu", com "Tentar de novo". Erro em linha
(`.erro`, `role="alert"`) vem de `mensagemDeFalha`; sessão expirada traz o link
"Entrar".

**Possíveis duplicados** (Lançamentos): faixa `.aviso` "N possíveis duplicados —
fora dos totais até você decidir" com "Revisar"; a revisão lista cada compra do
banco com os candidatos do PDF (mesmo valor, até 3 dias), "É este" (fica a do
banco, a do PDF sai, com desfazer por 10 s) e "São diferentes".

**Entradas** (`/entradas`, 6.1): triagem dos créditos da conta corrente, não
extrato — sem saldo, ordem por valor. Três `.cartao.ent-bloco`: **Renda** (total
do mês em `.ent-total`), **A marcar** ("É renda" / "Não conta") e **Não conta**
("Voltar"). Cada linha `.ent-lin`: data, nome, conta, valor e as ações
`button.link` com 44px de alvo; no celular a conta e as ações descem para a
segunda linha. O aviso depois de marcar (`.aviso`, `role="status"`) diz quantos
da mesma origem mudaram junto. Sem conta conectada, `.cartao.vazio` leva a
Conexões; mês sem crédito usa o vazio por filtro, avisando que Entradas só olha
a conta corrente quando o filtro escolheu contas.

## Marca

A lente (`src/components/Lente.tsx`) em `--accent`, e "Raio-*X*" com o X em
itálico verde.

## Acessibilidade

Contraste mínimo AA; foco visível em tudo que recebe teclado (anel `--accent`);
rótulo (`aria-label`) em todo campo, inclusive nos menus de categoria da lista.
