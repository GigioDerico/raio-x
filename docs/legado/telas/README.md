# Telas do app antigo

Capturas do artifact (`../app-antigo.html`) rodando com os dados de exemplo que
ele mesmo gera. São **referência de design para a fatia 3**, não alvo a copiar
pixel a pixel: a paleta e a tipografia do app novo são as mesmas, mas alguns
padrões mudaram de propósito (ver `docs/design-system.md`).

Nenhuma delas contém dado real — os números são do `exemplo()`.

| Arquivo | Tela | Por que olhar |
| --- | --- | --- |
| `visao.png` | Visão do mês | O cartão escuro do topo, os três KPIs e "Onde está apertando" com as barras por categoria |
| `ritmo.png` | Ritmo mensal | Comparação entre meses |
| `previsto.png` | Previsto | Projeção do próximo mês e a entrada do plano de 3 meses |
| `recorrentes.png` | Recorrentes | O que se repete todo mês |
| `parcelas.png` | Parcelas | O que já está comprometido à frente |
| `lancamentos.png` | Lançamentos | A tabela, os filtros e a edição em linha |
| `diagnostico.png` | Diagnóstico | Onde o texto da IA aparece |
| `cartoes.png` | Cartões | Apelido e dados de cada cartão |
| `visao-escuro.png` | Visão do mês | Tema escuro |
| `lancamentos-escuro.png` | Lançamentos | Tema escuro |
| `visao-celular.png` | Visão do mês | 390px |
| `lancamentos-celular.png` | Lançamentos | 390px |

## Uma divergência, resolvida em 30/09/2026

A tela de **Lançamentos** do app antigo é uma **tabela** com colunas (data,
estabelecimento, categoria, cartão, valor). O guia de construção chegou a
descrever uma **lista de duas linhas**, com os metadados em cinza embaixo do
nome — pensada para caber no celular, onde cinco colunas não cabem.

As duas funcionam; eram escolhas diferentes. A decisão: **tabela no desktop
(≥48rem), cartão por lançamento no celular (<48rem)** — o melhor dos dois
mundos, com a mesma marcação servindo as duas larguras (só o CSS muda). Ver
`docs/guia-de-construcao.md` (seção Lançamentos) e
`src/components/Lancamentos.tsx`.

## Como refazer estas capturas

Precisa de Chromium e Playwright:

```js
// abre o artifact local, troca de aba pelo localStorage e fotografa a página inteira
await p.addInitScript((a) => localStorage.setItem('rxf-aba', a), aba);
await p.goto('file:///caminho/app-antigo.html', { waitUntil: 'networkidle' });
await p.addStyleTag({ content: '#tip,#toast{display:none !important}' });
await p.screenshot({ path: `${aba}.png`, fullPage: true });
```

As abas são `visao`, `ritmo`, `previsto`, `recorrentes`, `parcelas`,
`lancamentos`, `diagnostico` e `cartoes`. O `#tip` e o `#toast` ficam escondidos
porque aparecem vazios na captura.
