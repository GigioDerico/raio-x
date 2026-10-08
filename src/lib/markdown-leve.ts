/**
 * Porta de `mdLeve` (docs/legado/app-antigo.html:2829-2844), mas devolvendo
 * blocos em vez de HTML: o texto da IA é entrada não confiável e só vira
 * elemento React, que escapa tudo (plano técnico, segurança item 6).
 */
export type Parte = { texto: string; forte?: true; dinheiro?: true };
export type Bloco =
  | { tipo: 'titulo'; partes: Parte[] }
  | { tipo: 'paragrafo'; partes: Parte[] }
  | { tipo: 'lista'; itens: Parte[][] };

const DINHEIRO = /(R\$\s?[\d.,]+)/g;

function partesDe(s: string): Parte[] {
  const out: Parte[] = [];
  for (const pedaco of s.split(/(\*\*[^*]+\*\*)/g)) {
    if (!pedaco) continue;
    const forte = /^\*\*[^*]+\*\*$/.test(pedaco);
    const texto = forte ? pedaco.slice(2, -2) : pedaco;
    for (const q of texto.split(DINHEIRO)) {
      if (!q) continue;
      const p: Parte = { texto: q };
      if (forte) p.forte = true;
      if (/^R\$\s?[\d.,]+$/.test(q)) p.dinheiro = true;
      out.push(p);
    }
  }
  return out;
}

export function markdownLeve(t: string): Bloco[] {
  const blocos: Bloco[] = [];
  let lista: Parte[][] = [];
  const fechar = () => {
    if (lista.length) blocos.push({ tipo: 'lista', itens: lista });
    lista = [];
  };
  for (const bruta of t.split('\n')) {
    const l = bruta.trim();
    if (/^#{2,4}\s/.test(l)) {
      fechar();
      blocos.push({ tipo: 'titulo', partes: partesDe(l.replace(/^#+\s*/, '')) });
    } else if (/^([-*•]|\d+\.)\s/.test(l)) {
      lista.push(partesDe(l.replace(/^([-*•]|\d+\.)\s*/, '')));
    } else if (!l) {
      fechar();
    } else {
      fechar();
      blocos.push({ tipo: 'paragrafo', partes: partesDe(l) });
    }
  }
  fechar();
  return blocos;
}
