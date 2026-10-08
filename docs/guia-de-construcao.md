# Raio-X — guia de construção

30 de setembro de 2026 · Giorgio Derico

Este guia descreve o app pelo lado de quem usa: quais telas existem, o que cada
uma responde, como se navega entre elas e em que fatia cada uma nasce. O plano
técnico cobre o banco, as rotas e a segurança; aqui está o que aparece na tela e
por quê.

## Como usar este guia

Cada tela aqui segue a mesma ficha: **o que ela responde**, **o que mostra**, **o
que dá para fazer nela**, **de onde vem cada número** e **o que ela não faz**. A
última linha é a mais útil das cinco — é ela que impede a tela de crescer sozinha
até virar um painel de controle de avião.

O que **não** está aqui, porque já está no plano técnico: esquema do banco, rotas
da API, mapeamento do Pluggy, regra de deduplicação, segurança e a auditoria. Os
dois documentos se referem pelas mesmas sete fatias, então dá para ler em
paralelo.

Para o brainstorm, as três últimas seções são o ponto de partida: os padrões já
decididos (que não valem rediscutir), o escopo negativo (que é onde a maioria das
ideias novas vai bater) e as perguntas em aberto.

## O que o app responde

Uma pergunta só: **para onde foi o meu dinheiro este mês, e quanto disso eu ainda
podia escolher?**

A segunda metade é o que separa o Raio-X de um extrato bonito. Somar gastos
qualquer app faz. O que muda comportamento é ver que, dos R$ 6 mil do mês, R$ 4,2
mil já estavam decididos antes do dia 1 — aluguel, parcelas, assinaturas — e que a
briga real é pelos R$ 1,8 mil restantes.

Toda tela tem de ajudar em uma destas três, e as três são perguntas de tempos
diferentes:

| Pergunta | Tempo | Telas que respondem |
| --- | --- | --- |
| O que aconteceu? | Passado | Painel do mês, Lançamentos, Parcelas |
| Por que aconteceu? | Presente | Diagnóstico, Categorias, Conversa |
| O que faço agora? | Futuro | Plano de 3 meses, Projeção do mês corrente |

Se uma tela nova não serve a nenhuma das três, ela não entra — esse é o filtro
para as ideias do brainstorm.

Uma consequência prática: **o app não é um app de orçamento**. Ele não pede que
você defina limites antes de gastar nem manda notificação de "você estourou". Ele
mostra o que já aconteceu com honestidade e ajuda a decidir os próximos três
meses. Quem quer envelope e limite rígido tem dezenas de apps; este resolve outro
problema.

## Mapa de navegação

```
   ┌──────────┐        ┌───────────────────────────┐
   │ Acesso   │ ─────▶ │ Painel do mês             │
   │ senha    │        │ mês e cartão filtram tudo │
   └──────────┘        └─────────────┬─────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌ O que aconteceu? ─┐      ┌ Por que aconteceu? ┐      ┌ O que faço agora? ─┐
│                   │      │                    │      │                    │
│  Lançamentos      │      │  Diagnóstico       │      │  Plano de 3 meses  │
│  lista, busca,    │      │  o mês escrito     │      │  questionário e    │
│  edição; abre     │      │  pela IA; abre     │      │  metas; acompanha  │
│  Detalhe e        │      │  a Conversa        │      │  o mês             │
│  Importar         │      │                    │      │                    │
│                   │      │  Categorias        │      │  Conexões e        │
│  Parcelas         │      │  gasto por         │      │  Ajustes           │
│  o que já está    │      │  categoria; abre   │      │  bancos, modelo    │
│  comprometido;    │      │  a lista filtrada  │      │  de IA; exportar,  │
│  meses à frente   │      │                    │      │  apagar tudo       │
└───────────────────┘      └────────────────────┘      └────────────────────┘
```

O painel é o centro e não tem volta obrigatória: de qualquer tela dá para chegar
em qualquer outra sem passar por ele. Os três grupos não são telas — são o
agrupamento do menu, e existem para que a navegação repita a mesma divisão das
três perguntas.

Na tela, os três grupos viram a **barra lateral** no desktop (Painel no topo e os
grupos nomeados abaixo) e uma **barra inferior** no celular com Painel,
Lançamentos, Parcelas, Plano e Mais (Categorias, Ajustes, Sair).

Quatro telas não aparecem no mapa porque não são destinos, e sim passagens:
**Importar fatura**, **Detalhe do lançamento**, **Conectar banco** e
**Questionário do plano**. Todas abrem por cima da tela atual e devolvem você a
ela, com o resultado já aplicado. Nenhuma delas tem URL própria nem entra no
histórico do navegador.

Duas regras de navegação que valem para o app inteiro:

- **O filtro de mês e cartão é global.** Escolheu setembro e o cartão do Itaú no
  painel, tudo o que você abrir depois já está nesse recorte, inclusive o
  diagnóstico. Perder o filtro ao trocar de tela é o tipo de coisa que faz a
  pessoa desconfiar do número.
  O filtro vive na URL (`?mes=2026-09&cartoes=…&obra=1`), então voltar e favoritar
  funcionam; um cookie lembra o último recorte. O mês de um lançamento de cartão é
  o **mês da fatura**, não o da compra. O interruptor **separar obra** tira
  "Construção / Obras" dos totais, médias, anomalias e plano, e mostra a obra numa
  linha à parte.
- **Toda tela funciona com o app vazio.** Sem nenhuma fatura importada, cada uma
  explica o que falta e oferece o caminho — nunca uma tabela de zeros.

## As sete fatias em tela

Cada fatia termina com algo que dá para abrir e usar. É o critério: se ao fim de
uma fatia não existe tela nova funcionando, a fatia foi mal cortada.

| Fatia | O que aparece na tela | Estado |
| --- | --- | --- |
| 1 · Esqueleto | Acesso, e um painel vazio que prova que o banco responde | Pronta |
| 2 · Faturas em PDF | Importar fatura, Lançamentos com edição, exclusão e lote | Pronta |
| 3 · Painel | Casca, filtro global, Painel do mês, Categorias, Parcelas, Ajustes mínimo, Plano de 3 meses | Em andamento |
| 4 · Pluggy manual | Conexões, Conectar banco, botão de atualizar; comparação dia contra dia e projeção do mês corrente | A fazer |
| 5 · Sync automático | Estados de conexão na tela, aviso de consentimento | A fazer |
| 6 · Conta corrente | Saldo e entrada no painel; some o campo de renda digitada | A fazer |
| 7 · Acabamento | Resumo do mês, Diagnóstico, Conversa, teto de IA, exportar/apagar tudo, alertas, vazios | A fazer |

Duas observações sobre esse corte:

- **A fatia 3 é a que mais entrega tela por esforço.** As contas já existem e
  estão corretas no app antigo; o trabalho é mudá-las de casa, não reinventá-las.
  É também a fatia em que o app volta a ser útil no dia a dia.
- **O diagnóstico da IA ficou para a 7, de propósito.** É a parte mais vistosa e a
  mais fácil de fazer cedo demais: sem histórico de vários meses e sem conta
  corrente, o texto sai genérico. Ele depende de tudo que vem antes para ter o que
  dizer.

## Acesso

**Responde:** sou eu mesmo.

**Mostra:** a marca, um campo de senha e um botão. Abaixo do cartão, uma linha
discreta lembrando que a instalação é sua e os dados ficam no seu banco.

**Dá para fazer:** entrar. Mais nada — não há cadastro, "esqueci minha senha" nem
login social.

**De onde vem:** `POST /api/auth/login` confere contra o hash em
`APP_PASSWORD_HASH` e devolve um cookie assinado de 7 dias.

**Não faz:** não diz o que errou. Senha incorreta e usuário inexistente dão a
mesma mensagem, porque contar a diferença ajuda só quem está tentando adivinhar.

Três estados além do normal:

| Situação | O que a tela diz |
| --- | --- |
| Senha errada | "Senha incorreta." O campo limpa e mantém o foco |
| Muitas tentativas | "Muitas tentativas. Tente de novo em 32s", com a contagem do servidor |
| Banco fora do ar | "O banco não respondeu. Tente de novo em instantes" — e não "senha incorreta", que mandaria você procurar o problema no lugar errado |

A espera cresce por IP a partir da quarta tentativa e vai até 15 minutos. Como a
senha é a única barreira do app, ela merece esse cuidado.

## Painel do mês

**Responde:** as três perguntas de uma vez, em resumo. É a tela que abre e a única
que alguém olha com pressa.

A ordem dos blocos é a ordem em que a dúvida aparece na cabeça de quem abre. De
cima para baixo:

Decisão de 30/09/2026: o dono comparou esta tela com as capturas do app antigo
(`docs/legado/telas/`) e decidiu portar o visual original — hero escuro,
indicadores, ranking com selo de severidade —, não só a lógica. A tabela
abaixo reflete isso.

| Bloco | O que diz | De onde vem |
| --- | --- | --- |
| Filtro | Mês e cartões visíveis. Fica no topo e vale para o app inteiro | Estado da sessão |
| Hero | O total do mês (cartão escuro), a variação contra o mês anterior, % da renda declarada, o total por cartão e a barra "já contratado × escolha" | `porMes`, `cartoesInfo`, `composicaoMes` |
| Indicadores | Juros e encargos do mês, fixo todo mês, parcelas a vencer | `encargosDoMes`, `recorrentesFixas`, `parcelasInfo` |
| Onde está apertando | As categorias em barras, maior primeiro, cada uma com um selo de severidade (acima da média, subindo, na média, abaixo da média, juros pagos) contra a média dos até 3 meses anteriores | `porCategoria`, `baseCategoria`, `severidade` |
| Resumo | Três ou quatro frases escritas pela IA — **fatia 7** | `ai_output`, em cache |

"Próxima fatura" (parcelas + fixos + variável médio de 3 meses, `projecao` do
legado) não é bloco do painel — é a tela **Parcelas**, fatia 3.3.

**A comparação dia contra dia chega na fatia 4.** Até lá toda fatura vem de PDF e
está fechada, então o painel compara mês fechado com mês fechado, como o app
antigo. Quando o Pluggy trouxer a fatura aberta, dia 24 de setembro passa a
comparar com dia 24 de agosto, nunca com o agosto fechado.

**Não faz:** não dá conselho. O painel mostra; quem opina é o diagnóstico, e só
quando pedido.

O selo de cada linha do ranking merece uma nota: é conta, não texto de modelo.
"Restaurantes acima da média, +143% · média de 3 meses" sai de SQL e custa
zero. A IA só entra se você abrir o diagnóstico. É o que permite o painel
abrir rápido e de graça quantas vezes você quiser.

## Lançamentos

**Responde:** o que exatamente eu comprei, e está certo?

Decisão de 30/09/2026 (resolve a divergência apontada em
`docs/legado/telas/README.md`): no desktop (≥48rem) é uma **tabela**, como no
app antigo — melhor para varrer uma coluna com os olhos. No celular (<48rem),
**um cartão por lançamento** — a tabela não cabe em 390px. A mesma marcação
serve os dois; só o CSS (`grid-template-areas`) muda com a largura da tela.

```
Desktop (≥48rem):
[ ]  03/09  Assaí Atacadista 2/6       [Mercado & Padaria ▾]  Itaú - Azul   R$ 612,40   ×

Celular (<48rem):
[ ] 03/09  Assaí Atacadista                                              2/6
    Itaú - Azul · fatura de set/26
    [Mercado & Padaria ▾]                                    R$ 612,40    ×
```

**O nome que aparece é o seu, se você deu um.** A ordem é: apelido deste
lançamento, depois apelido de um lançamento parecido, depois o que o banco
escreveu. É o que faz "PAG\*ADRIANAMARTINS8821" virar "Adriana — faxina" para
sempre.

**Dá para fazer**, tudo sem sair da lista:

| Ação | Como | O que mais acontece |
| --- | --- | --- |
| Trocar categoria | Menu na própria linha | Vira regra para os parecidos, nos próximos meses |
| Renomear | Clique no nome | Idem, e o nome antigo nunca mais aparece |
| Corrigir valor | Campo editável; salva ao sair do campo ou Enter | Só nesta linha; não vira regra |
| Ordenar | Maior valor · Mais recente · Estabelecimento | Local à tela, sobre a lista já carregada |
| Excluir | O × | Some da lista com um "desfazer" de 10 segundos |
| Selecionar vários | Caixas + barra que sobe | Uma categoria para todos numa transação só |

**Filtros:** mês e cartão vêm do filtro global; busca e categoria são locais desta
tela.

**De onde vem:** `GET /api/txn`. Edição e exclusão são `PATCH` e `DELETE` por id,
e o lote é `PATCH /api/txn/bulk`.

**Não faz:** não deixa criar lançamento à mão (ainda — ver perguntas abertas), e
não apaga de verdade: a exclusão é lógica, senão o sync da madrugada traria a
linha de volta.

Duas escolhas de interface que valem defender:

- **A categoria é editável na própria linha**, sem abrir nada. É a correção mais
  frequente do app; cada clique a mais multiplica por cem lançamentos.
- **Categoria que você corrigiu fica marcada** com a borda verde. Sem isso não dá
  para saber o que é palpite da IA e o que é decisão sua — e a diferença importa,
  porque a IA nunca sobrescreve o que você decidiu.

## Importar fatura

**Responde:** como eu ponho um mês antigo aqui dentro?

Abre por cima da lista. São cinco passos, e o usuário vê cada um:

1. **Escolher o arquivo.** Só PDF.
2. **Ler o arquivo.** Acontece no seu navegador; o PDF não sobe.
3. **Ler com a IA — trecho 3 de 8.** O contador é importante: a espera é de
   dezenas de segundos e sem ele parece travado.
4. **Gravar.**
5. **Resultado:** "Itaú ••4471 — setembro: 47 lançamentos novos, 3 já estavam
   aqui."

O que pode dar errado, e o que a tela faz:

| Problema | O que aparece |
| --- | --- |
| PDF com senha | Pede a senha e tenta de novo. A senha não sai do navegador |
| PDF sem texto (digitalizado) | "Não achei texto neste PDF" — é imagem, precisa de OCR, que o app não faz |
| Chave da IA ausente | "Configure OPENROUTER_API_KEY para importar PDF" |
| Um trecho ilegível | Segue sem ele e avisa no fim quantos trechos foram ignorados |
| Total não bate | "A fatura diz R$ 4.212,80 e a leitura somou R$ 4.050,10" |

Essa última linha é a mais valiosa da tela. **A extração por IA erra em silêncio**
— uma linha perdida vira um mês mais barato do que foi, e ninguém percebe.
Comparar a soma lida com o total impresso na fatura é a única verificação barata
que existe, e ela tem de estar visível, não escondida num log.

**Não faz:** não aceita CSV, OFX nem foto. Se o mês já vem por Open Finance, a
tela pergunta antes de importar em vez de duplicar em silêncio.

## Categorias e aprendizado

**Responde:** para onde foi o dinheiro, por tipo de gasto — e por que o app parou
de me perguntar a mesma coisa.

São treze categorias fixas, divididas em três grupos. **A divisão em grupos é que
faz o painel funcionar**, porque é dela que sai a conta de compromisso × escolha:

| Grupo | Categorias | Papel |
| --- | --- | --- |
| Essencial | Mercado & Padaria, Casa & Contas, Transporte, Saúde & Farmácia, Educação, Assinaturas & Apps | Compromisso |
| Flexível | Restaurantes & Delivery, Compras & Vestuário, Lazer & Viagem, Construção / Obras, Serviços & Profissional, Outros | Escolha |
| Encargo | Encargos do cartão | Compromisso, e o que dói |

A tela lista as categorias do mês em barras, da maior para a menor, com a variação
contra a média dos três meses anteriores. Clicar numa abre a lista de lançamentos
já filtrada — que é o movimento natural de quem viu um número estranho.

**O aprendizado é invisível e é o coração do app.** Quando você corrige uma
categoria, o app guarda a descrição normalizada daquele estabelecimento com a
categoria que você escolheu. Na próxima importação, a regra responde antes da IA
ser chamada. Consequências que valem dizer em voz alta:

- O custo de IA **cai** mês a mês em vez de subir, porque a fatia que precisa de
  modelo encolhe.
- O app fica com a sua cara: "Amazon" pode ser Compras para você e Construção para
  quem está reformando.
- Correção sua nunca é desfeita — nem pela IA, nem pelo categorizador do Pluggy na
  fatia 4.

**Não faz:** não deixa criar categoria nova. Treze é pouco de propósito — vinte e
cinco categorias tornam qualquer comparação entre meses inútil, porque a mesma
compra passa a cair em lugares diferentes conforme o humor do dia.

## Parcelas e compromissos

**Responde:** quanto dos próximos meses já está gasto?

Esta tela existe porque a parcela mente sobre o tempo. Uma compra de R$ 3.600 em
12 vezes aparece como R$ 300 no mês, parecendo pequena, quando na verdade já
comprometeu quase quatro mil reais de futuro. O app precisa mostrar as duas
leituras.

A tela tem duas partes:

**O que ainda vai cair.** Uma linha por mês à frente com o total já comprometido e
quais compras o compõem. É a resposta para "posso assumir mais uma parcela?".

**As compras parceladas ativas.** Lista ordenada pelo que ainda falta pagar, não
pelo valor da parcela — R$ 300 × 10 restantes pesa mais que R$ 800 × 1.

| Coluna | Exemplo |
| --- | --- |
| Compra | Geladeira Brastemp |
| Parcela | 3/12 · R$ 300,00 |
| Falta | 9 parcelas · R$ 2.700,00 |
| Cartão | Itaú - Azul |

**De onde vem:** na fatia 3, das parcelas lidas do PDF. Na fatia 4 muda de fonte e
melhora muito: o `creditCardMetadata` do Pluggy traz número da parcela, total e
data da compra sem precisar adivinhar do texto.

**Um cuidado que já custou bug:** só a fatura **mais recente** de cada cartão
entra nesta conta. Somar todas as faturas contaria a mesma parcela uma vez por mês
em que ela aparece, e o total de compromissos sairia várias vezes maior que a
realidade.

**Não faz:** não sugere antecipar nem quitar. Isso depende de juros e de dinheiro
em conta, que o app só conhece a partir da fatia 6.

## Plano de 3 meses

**Responde:** o que eu faço a partir de amanhã?

Três meses, e não doze, porque um plano anual ninguém cumpre e um plano de um mês
não muda nada. Três meses cabem na cabeça e já mostram resultado.

**O questionário** vem antes do plano e é curto — sete perguntas, todas de
múltipla escolha:

| Pergunta | Para que serve |
| --- | --- |
| Objetivo | Guardar, sair dos juros, parar de parcelar ou só parar de crescer |
| Ritmo | De uma vez, em três passos ou devagar — define o quanto cada categoria pode cair |
| Intocáveis | Categorias que o plano não mexe |
| Cortar fundo | Onde você aceita cortar mais |
| Comida | Cozinha, pede ou misto |
| Assinaturas | Cancelar o que não usa, qualquer uma, ou não mexer |
| Evento no período | Viagem, mudança, festa — o que quebraria o plano se ignorado |

**O plano** é uma meta por categoria por mês, com três travas que a IA não pode
furar:

- **Teto duro:** a soma das metas nunca passa da renda.
- **Piso por categoria:** mercado, saúde, transporte, casa e educação caem no
  máximo 15%; o resto, até 55%; onde você autorizou cortar fundo, até 75%. Um
  plano que manda gastar R$ 200 de mercado é fantasia e destrói a confiança no
  resto.
- **Queda máxima por mês:** 20% no ritmo suave, 33% no equilibrado, 50% no firme.
  Cortar 70% de uma categoria de uma vez não é plano, é chute.

Durante o mês, cada categoria mostra gasto contra meta numa barra. Quando estoura,
o app diz quanto e onde — e não manda notificação nem faz cara feia.

**Não faz:** não bloqueia nada, não "aprova" gasto e não julga. O plano é um
acordo com você mesmo, e o app é o lugar onde ele fica escrito.

**Sem IA por padrão.** As metas saem de conta, com as três travas. O botão
"Refinar com IA" pede ao modelo uma ação concreta por categoria e passa o
resultado pelas mesmas travas. Estourou um mês? O plano fica como está e mostra o
desvio; "Refazer plano" recalcula a partir de hoje.

## Diagnóstico e conversa

**Responde:** por que este mês foi assim?

O diagnóstico é texto corrido, de umas quinze linhas, sobre o recorte que estiver
no filtro. Ele **só roda quando você pede** — abrir a aba não gasta nada.

O que ele recebe: totais por categoria, a comparação com os três meses anteriores,
o que está comprometido e as anomalias que o SQL já achou. **Não recebe** a lista
de lançamentos crua, nem id, saldo, limite ou número de cartão — tudo passa por
uma função de minimização antes de virar prompt.

O texto guardado fica com a assinatura dos números que o geraram. Se você depois
corrigir uma categoria ou importar outra fatura, a assinatura muda e a tela marca
o diagnóstico como **desatualizado**, com um botão de refazer. Um texto velho
apresentado como atual é pior que texto nenhum.

**A conversa** continua de onde o diagnóstico parou. Perguntas do tipo "por que
restaurantes subiu tanto?" ou "dá para cortar 500 sem mexer no mercado?". Cada
turno leva os números do recorte mais os seis últimos turnos — não o histórico
inteiro, que encareceria sem melhorar a resposta.

**Não faz:** não dá conselho de investimento, não recomenda produto financeiro e
não fala em tom de coach. O registro é o de um contador que te conhece: direto,
sem moralismo sobre o que você gastou.

Um detalhe de implementação que vira detalhe de interface: **o markdown que o
modelo devolve é entrada não confiável**. Passa por sanitização antes de virar
HTML, como qualquer texto de fora.

## Conexões

**Responde:** meus bancos estão chegando aqui?

Uma lista de cartões e contas conectados, cada um com instituição, apelido,
últimos quatro dígitos, quando sincronizou pela última vez e o estado.

**Conectar** abre o widget do Pluggy por cima da tela. Você escolhe o banco numa
lista que vem viva da API — nunca de uma lista escrita no código, que envelheceria
em semanas —, autentica no ambiente do próprio banco e volta. O app nunca vê sua
senha bancária.

Os estados e o que cada um pede:

| Estado | O que a tela mostra | Ação |
| --- | --- | --- |
| Ativa | "Atualizado há 2 horas" | Nenhuma |
| Atualizando | Indicador discreto na linha | Nenhuma |
| Erro de login | "O banco pediu sua senha de novo" | Reconectar |
| Consentimento vencido | "A autorização expirou" | Renovar |
| Instabilidade no banco | "O Santander está fora do ar" | Nenhuma — é deles, não seu |

A última linha é a que separa uma tela honesta de uma frustrante: o campo de saúde
do conector vem no mesmo retorno da API, e usá-lo evita que você fique procurando
defeito no seu app quando o problema é do banco.

**Sobre o consentimento:** o Pluggy pede autorização sem prazo na maioria dos
conectores, então esse estado é exceção, não regra. A tela só mostra prazo quando
existe prazo de verdade — inventar contagem regressiva onde não há é ansiedade de
graça.

**Desconectar** revoga no Pluggy e para de sincronizar, mas **mantém os
lançamentos já importados**. Eles são seus; a conexão era só o caminho.

**Não faz:** não inicia pagamento, não transfere, não mexe em nada. É leitura, e
só.

## Ajustes

**Responde:** como isso se comporta, e como eu saio daqui levando meus dados?

Uma tela curta, em quatro blocos:

**Cartões.** Apelido, dia de fechamento e dia de vencimento de cada um. O apelido
é o que aparece em toda a interface — "Itaú - Azul" diz mais que "••4471", e o
nome que o banco escreve muda entre faturas sem avisar.

**Inteligência artificial.** Qual modelo do OpenRouter usar, o teto de gasto
mensal em dólar, e o quanto já foi gasto neste mês. Esse último número não é
enfeite: sem ele você descobre o custo na fatura do OpenRouter, o que é tarde.
Passado o teto, as chamadas automáticas param e as de botão continuam, com aviso.

**Seus dados.** Exportar tudo em CSV, e apagar tudo. O apagar revoga as conexões
no Pluggy e limpa o banco — pede confirmação digitada, porque é irreversível.

**Sessão.** Sair. E uma linha explicando que trocar o `SESSION_SECRET` derruba
toda sessão aberta, que é o "sair de todos os lugares" de quem auto-hospeda.

A seção de dados não é obrigação legal aqui — é uma instalação pessoal, não um
serviço. Ela existe por coerência: um app que promete que o dado é seu precisa
deixar você levar e destruir esse dado sem pedir por favor a ninguém.

**Não faz:** não tem tema claro/escuro manual (segue o sistema), nem escolha de
moeda ou idioma. Um usuário, um país, uma moeda.

## Estados que toda tela precisa ter

A maior parte do trabalho de interface deste app não é o estado normal — é os
outros quatro. Quem está construindo tende a desenhar a tela cheia e descobrir os
vazios em produção.

| Estado | Regra | Errado |
| --- | --- | --- |
| **Primeiro uso** | Diz o que falta e oferece o caminho: "Importe uma fatura para começar" com o botão ali | Tabela de zeros, gráfico vazio |
| **Vazio por filtro** | Diz qual filtro esvaziou: "Nada em julho neste cartão" com um jeito de limpar o filtro | "Nenhum resultado" |
| **Carregando** | Dentro do app, a tela atual esmaece até a nova chegar — no filtro e na troca de aba — e o item do menu mostra que está carregando. Esqueleto não: o Next o mostraria a cada troca de filtro, apagando a tela | Spinner no meio da página; esqueleto piscando a cada clique |
| **Carregando longo** | Acima de três segundos, diz o que está fazendo: "trecho 3 de 8" | Barra que finge progresso |
| **Erro** | Diz o que falhou e o que fazer. Erro de rede não é igual a erro de senha | "Algo deu errado" |

Duas regras que atravessam todos eles:

- **Nunca apagar a tela para recarregar.** Trocar o filtro mantém os números
  antigos visíveis, esmaecidos, até os novos chegarem. Piscar branco a cada clique
  faz um app rápido parecer lento.
- **Toda ação destrutiva tem desfazer, e quem tem desfazer não tem confirmação.**
  Excluir lançamento mostra "desfazer" por dez segundos, sem perguntar antes.
  Confirmação fica só para o que não volta — apagar tudo, desconectar banco.

## Padrões de interface já decididos

Estes não precisam voltar ao brainstorm — já estão no código e funcionando. O
detalhamento completo, com tokens e componentes, está em
[`docs/design-system.md`](design-system.md).

**Cor** (regra de 30/09/2026 — o dono comparou o painel com a captura do app
antigo e decidiu portar o visual original, não só a lógica). Verde é o
acento de ação: botão, link, item ativo, "seu". Fundo levemente quente em vez
de branco puro. Cor só tem significado quando é rara: se tudo é colorido,
nada chama atenção — mas no app antigo isso nunca quis dizer "vermelho só
para erro". Vermelho (`--crit`) marca juros pagos e categoria "acima da
média" no ranking, além de erro e excluir; `--warn` marca o que está subindo
ou é novo no mês; `--good` marca o que caiu abaixo da média; e as barras do
ranking de categorias são azuis (`--series`), não verdes — categoria não é
ação. O total do mês vive num cartão escuro (`--hero`) à parte, separado do
resto por cor, não só por tamanho.

**Tipografia.** Familjen Grotesk, servida pelo próprio app. Números sempre com
largura fixa (`tabular-nums`), senão uma coluna de valores fica tremida e
ilegível.

**Forma.** Cantos de 20px nos cartões, botões em pílula, sombra quase
imperceptível. Borda fina no lugar de sombra pesada.

**Densidade.** A lista de lançamentos é densa de propósito — são dezenas de linhas
por mês e rolar demais cansa. O painel é arejado, porque é leitura, não trabalho.

**Dinheiro.** Sempre em reais com centavos na lista, e arredondado nos totais
grandes do painel (R$ 6.240 em vez de R$ 6.239,87). Precisão onde se confere,
legibilidade onde se compreende.

**Tema.** Claro e escuro seguem o sistema. Não há botão de troca.

**Celular.** Tudo funciona em 390px de largura. Este é um app que se abre no sofá
depois da fatura chegar, não na mesa de trabalho.

**Acessibilidade.** Contraste mínimo AA, foco visível em tudo que recebe teclado, e
rótulo em todo campo — inclusive nos menus de categoria dentro da lista, que sem
isso viram "combo box" para um leitor de tela.

## O que fica de fora

Esta seção é a mais útil do documento numa sessão de brainstorm: quase toda ideia
nova bate em uma destas linhas, e o valor está em saber **por que** cada uma foi
descartada, não só que foi.

| Fora | Por quê |
| --- | --- |
| Multiusuário, contas compartilhadas | Muda tudo: autenticação, isolamento, LGPD de terceiros. Uma instalação por pessoa é o que torna o resto simples |
| App nativo | A web resolve, e manter duas lojas para um usuário não se paga |
| Orçamento com envelope e bloqueio | Outro produto. Este mostra o passado com honestidade e planeja três meses |
| Notificação push de gasto | Exige estar sempre sincronizado e vira ansiedade. O app espera você abrir |
| Investimentos, patrimônio, aposentadoria | O Pluggy até traz, mas é outra pergunta. Aqui é só para onde vai o dinheiro do mês |
| Iniciar pagamento ou Pix | É leitura. Escrever move dinheiro, e isso muda a natureza do risco |
| OCR de fatura digitalizada | Caro e impreciso. Todo banco brasileiro entrega PDF com texto |
| Categoria criada por você | Treze categorias tornam meses comparáveis; vinte e cinco não |
| Metas por estabelecimento | "Gastar menos no iFood" vira jogo de gato e rato com o próprio app |
| Compartilhar relatório por link | Publicar seus gastos na internet, mesmo com URL secreta, é risco sem retorno |

Duas estão **fora por enquanto**, e podem entrar: lançamento em dinheiro digitado
à mão e importação de OFX. As duas são baratas; só não são urgentes.

## Perguntas para o brainstorm

> Respondidas em 30/09/2026 (spec da fatia 3): 1 — ordem mantida; 2 — fora da
> fatia 3, `gasto fora do cartão` cobre; 4 — fica como está e mostra o desvio;
> 5 — interruptor "separar obra"; 6 — decidir na fatia 4; 7 — só estado vazio;
> 8 — sem sugestão. A 3 fica para a spec da fatia 7.

Oito em aberto, da que mais muda o produto para a que menos muda.

1. **Conta corrente muda o app de assunto?** Da fatia 6 em diante dá para saber
   quanto entrou e quanto sobrou. Isso abre "quanto posso gastar até o dia 30",
   que é uma pergunta melhor que todas as outras — e transforma um app de faturas
   num app de dinheiro. Vale reordenar as fatias para chegar lá antes?
2. **Lançamento em dinheiro.** Sem ele, o que você paga em espécie some do raio-x
   e todo total fica um pouco errado. Vale a fricção de digitar?
3. **Quanto o diagnóstico deve opinar?** Há uma linha entre "restaurantes subiu
   143%" e "você devia cozinhar mais". Onde ela fica?
4. **O plano de 3 meses é revisto ou refeito?** Se você estoura o primeiro mês, o
   app reajusta os dois seguintes sozinho, pergunta, ou deixa como está para você
   ver o desvio?
5. **Onde o Construtor aparece?** Você está numa obra, e "Construção / Obras" é
   temporária mas enorme. Vale um recorte que separa gasto de obra do gasto de
   vida, para o mês normal não parecer pior do que é?
6. **Meses anteriores à conexão.** O Pluggy traz 12 meses; o PDF traz o resto. Até
   onde vale ir para trás na primeira carga?
7. **Onboarding.** Hoje a primeira tela depois do login é um painel vazio. Vale um
   passo a passo de três telas na primeira vez, ou basta o estado vazio bem
   escrito?
8. **Nome dos cartões.** O apelido é digitado por você. Vale sugerir a partir do
   que o banco manda, ou isso só gera nome ruim que ninguém corrige?

As duas primeiras mudam o escopo. As demais são de acabamento, e podem esperar o
app estar rodando com dado real.
