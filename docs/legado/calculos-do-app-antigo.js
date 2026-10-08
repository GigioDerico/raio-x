/**
 * Cálculos do app antigo — REFERÊNCIA, não código de produção.
 *
 * Copiados sem alteração de raio-x-fatura.html (o artifact), para a fatia 3
 * portá-los para SQL e TypeScript. Eles já estão corretos: foram usados por
 * meses contra faturas de verdade. O trabalho é mudá-los de casa, não
 * reinventá-los.
 *
 * Este arquivo NÃO é importado por nada. Dependem de estado global do app
 * antigo (`faturas`, `regras`, `apelidos`, `prefsPlano`, `renda`, `mesFiltro`,
 * `cartaoFiltro`), que na versão nova vira consulta ao banco.
 *
 * Ao portar, o equivalente de cada coisa:
 *   faturas[].lancamentos  -> tabela txn
 *   gastos(f)              -> where tipo <> 'pagamento'
 *   fixas / recorrentes()  -> a partir de learned_label + histórico
 *   prefsPlano             -> plan.prefs (jsonb)
 *   renda                  -> user_setting.renda_declarada, ou conta corrente
 *                             a partir da fatia 6
 */


// ==========================================================================
// Constantes e ajudantes de texto/data
// origem: raio-x-fatura.html, linhas 812–870
// ==========================================================================

/* ---------- constantes ---------- */
const CATS = ["Mercado & Padaria","Restaurantes & Delivery","Transporte","Assinaturas & Apps","Casa & Contas",
  "Construção / Obras","Saúde & Farmácia","Compras & Vestuário","Lazer & Viagem","Educação",
  "Serviços & Profissional","Encargos do cartão","Outros"];
const RENOMES = {"Mercado":"Mercado & Padaria"};   // categorias renomeadas ao longo do tempo
const normCat = c => { const n = RENOMES[c] || c; return CATS.includes(n) ? n : "Outros"; };
const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const brl = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const brl0 = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const money = n => brl.format(n || 0);
const money0 = n => brl0.format(n || 0);
const pct = n => (n>0?"+":"") + (n*100).toFixed(0) + "%";
const mesLabel = m => m ? MES[+m.slice(5,7)-1] + "/" + m.slice(2,4) : "—";
/* o banco entrega documentos congelados: sempre trabalhar sobre cópia */
const clone = o => { try { return structuredClone(o); } catch(e){ return JSON.parse(JSON.stringify(o)); } };

function parseValor(s){                // aceita "1.234,56", "1234,56" e "1234.56"
  let t = String(s).trim().replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return isFinite(n) ? n : NaN;
}
const valorInput = v => (+v || 0).toFixed(2).replace(".", ",");
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el = id => document.getElementById(id);

function addMonths(m, k){
  const y = +m.slice(0,4), mo = +m.slice(5,7) - 1 + k;
  const d = new Date(Date.UTC(y, mo, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0");
}
/* palavras que não identificam ninguém — ignoradas ao comparar nomes */
const GENERICOS = new Set(["TRANSFERENCIA","TRANSFERENCIAS","TRANSF","PARA","PIX","TED","DOC","ENVIADO","RECEBIDO",
  "PAGAMENTO","PAGTO","COMPRA","CARTAO","DEBITO","CREDITO","LTDA","EIRELI","MEI","BRASIL","COM","APP","SERVICOS",
  "SERVICO","LOJA","REF","PARC","MENSALIDADE"]);
function tokensDesc(s){
  return String(s||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Z ]/g," ").split(/\s+/).filter(t => t.length > 2 && !GENERICOS.has(t));
}
/* mesmo estabelecimento com escrita diferente? ex.: "TRANSFERENCIA PARA ADRIANA MARTINS" e "PIX ADRIANA MARTINS" */
function parecido(a, b){
  const A = new Set(tokensDesc(a)), B = new Set(tokensDesc(b));
  if (!A.size || !B.size) return false;
  if (A.size === 1 || B.size === 1) return [...A].join(" ") === [...B].join(" ");
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  return inter >= 1 && inter / Math.min(A.size, B.size) >= 0.6 && inter / Math.max(A.size, B.size) >= 0.5;
}
/* o nome que aparece na tela: apelido do lançamento > apelido de um lançamento parecido > nome da fatura */
function nomeExibido(l){
  if (l.apelido) return l.apelido;
  const k = normDesc(l.desc);
  if (apelidos[k]) return apelidos[k];
  for (const key in apelidos) if (parecido(key, l.desc)) return apelidos[key];
  return l.desc;
}
function normDesc(s){
  return String(s||"").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
    .replace(/\d+\/\d+/g," ").replace(/[^A-Z ]/g," ").replace(/\s+/g," ").trim().split(" ").slice(0,3).join(" ");
}

// ==========================================================================
// Seleção de faturas e totais
// origem: raio-x-fatura.html, linhas 937–996
// ==========================================================================

const fats = () => cartaoFiltro.size ? faturas.filter(f => cartaoFiltro.has(chaveCartao(f))) : faturas;
const nomeCartao = f => (nomesCartao[chaveCartao(f)] || f.banco || "Cartão") + (f.cartao ? " ••" + f.cartao : "");

function cartoesInfo(){
  const m = new Map();
  for (const f of faturas){
    const k = chaveCartao(f);
    if (!m.has(k)) m.set(k, {k, banco:f.banco, cartao:f.cartao, faturas:[], ultimo:null});
    const c = m.get(k);
    c.faturas.push(f);
    if (!c.ultimo || f.mesRef > c.ultimo.mesRef){ c.ultimo = f; c.banco = f.banco; if (f.cartao) c.cartao = f.cartao; }
  }
  return [...m.values()].map(c => {
    const meses = c.faturas.map(f => f.mesRef).sort();
    return {...c, meses, nome: nomesCartao[c.k] || c.banco || "Cartão",
      apelido: nomesCartao[c.k] || "",
      venc: c.ultimo?.vencimento || "",
      total: totalFatura(c.ultimo),
      exemplo: !!c.ultimo?.exemplo};
  }).sort((a,b) => b.total - a.total);
}

/* ---------- cálculos ---------- */
const gastos = f => f.lancamentos.filter(l => l.tipo !== "pagamento");
function totalFatura(f){ return gastos(f).reduce((s,l)=>s+(+l.val||0),0); }

function porMes(){
  const m = new Map();
  for (const f of fats()) m.set(f.mesRef, (m.get(f.mesRef)||0) + totalFatura(f));
  return [...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1);
}
const mesesDisponiveis = () => porMes().map(x => x[0]);
/* o mês em foco no painel — null significa "todos os meses" */
function mesAtual(){
  const ms = mesesDisponiveis();
  if (mesFiltro === "TODOS") return null;
  if (mesFiltro && ms.includes(mesFiltro)) return mesFiltro;
  return ms.length ? ms[ms.length-1] : null;
}
function mesAnterior(m){
  const ms = mesesDisponiveis(), i = ms.indexOf(m);
  return i > 0 ? ms[i-1] : null;
}
function lancsDoMes(m){
  const out = [];
  for (const f of fats()) if (!m || f.mesRef === m) for (const l of gastos(f)) out.push({...l, banco:f.banco, cartao:f.cartao});
  return out;
}
function porCategoria(m){
  const map = new Map(CATS.map(c=>[c,0]));
  for (const l of lancsDoMes(m)){ const c = normCat(l.cat); map.set(c, (map.get(c)||0) + (+l.val||0)); }
  return map;
}
/* categorias de todos os meses de uma vez (evita recalcular a cada consulta) */
function categoriasPorMes(){
  const out = new Map();
  for (const m of mesesDisponiveis()) out.set(m, porCategoria(m));
  return out;
}
/* base de comparação: média dos até 3 meses anteriores */

// ==========================================================================
// Compromisso × escolha, e a classificação de cada lançamento
// origem: raio-x-fatura.html, linhas 997–1020
// ==========================================================================

function baseCategoria(cat, m, mapa){
  const ms = mesesDisponiveis(), i = ms.indexOf(m);
  const ant = i > 0 ? ms.slice(Math.max(0, i-3), i) : [];
  if (!ant.length) return null;
  const vals = ant.map(x => (mapa.get(x) || porCategoria(x)).get(cat) || 0);
  return {media: vals.reduce((a,b)=>a+b,0)/vals.length, n: ant.length, ultimo: ant[ant.length-1]};
}

/* cada lançamento é compromisso (fixo, parcela, encargo) ou escolha do mês */
function classeLanc(l, fixas){
  if (l.tipo === "encargo" || normCat(l.cat) === "Encargos do cartão") return "encargo";
  if (l.parc) return "parcela";
  if (fixas.has(normDesc(nomeExibido(l)))) return "fixo";
  return "escolha";
}
function composicaoMes(m, fixas){
  const set = fixas || new Set(recorrentesFixas().map(r => normDesc(r.desc)));
  const b = {fixo:0, parcela:0, encargo:0, escolha:0};
  for (const l of lancsDoMes(m)) b[classeLanc(l, set)] += (+l.val || 0);
  const tot = b.fixo + b.parcela + b.encargo + b.escolha;
  return {...b, tot, comprometido: b.fixo + b.parcela + b.encargo};
}

/* o mês seguinte já começa com o que foi contratado antes dele */

// ==========================================================================
// Projeção do mês corrente
// origem: raio-x-fatura.html, linhas 1021–1037
// ==========================================================================

function projecao(){
  const ms = mesesDisponiveis();
  const m = mesAtual() || (ms.length ? ms[ms.length-1] : null);
  if (!m) return null;
  const prox = addMonths(m, 1);
  const pi = parcelasInfo();
  const parcelas = pi.porMes.find(x => x[0] === prox)?.[1].tot || 0;
  const fixasArr = recorrentesFixas();
  const fixas = new Set(fixasArr.map(r => normDesc(r.desc)));
  const fixos = fixasArr.reduce((s,r) => s + r.medio, 0);
  const base = ms.filter(x => x <= m).slice(-3);
  const vals = base.map(x => composicaoMes(x, fixas).escolha);
  const variavel = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
  const real = ms.includes(prox) ? (porMes().find(x => x[0] === prox)?.[1] || 0) : null;
  return {prox, parcelas, fixos, variavel, total: parcelas + fixos + variavel, real, meses: base.length};
}

// ==========================================================================
// Severidade de uma variação (usada no destaque de anomalia)
// origem: raio-x-fatura.html, linhas 1038–1045
// ==========================================================================

function severidade(cur, prev, share, cat){
  if (cat === "Encargos do cartão" && cur > 0) return {k:"crit", g:"▲", t:"juros pagos"};
  if (prev <= 0 && cur > 0) return {k:"warn", g:"＋", t:"novo neste mês"};
  if (prev > 0 && cur/prev - 1 > 0.40 && share > 0.08) return {k:"crit", g:"▲", t:"acima da média"};
  if (prev > 0 && cur/prev - 1 > 0.15) return {k:"warn", g:"▲", t:"subindo"};
  if (prev > 0 && cur < prev*0.9) return {k:"good", g:"▼", t:"abaixo da média"};
  return {k:"", g:"●", t:"na média"};
}

// ==========================================================================
// Recorrentes: o que se repete mês a mês
// origem: raio-x-fatura.html, linhas 1046–1081
// ==========================================================================

function recorrentes(){
  const alvo = mesAtual(), todos = mesesDisponiveis();
  const ms = (alvo ? todos.filter(m => m <= alvo) : todos).slice(-3);
  const g = new Map();
  for (const f of fats()) if (ms.includes(f.mesRef))
    for (const l of gastos(f)) {
      if (l.parc || l.tipo === "estorno" || (+l.val||0) <= 0) continue;
      const nome = nomeExibido(l);
      const k = normDesc(nome); if (!k) continue;
      if (!g.has(k)) g.set(k, {desc:nome, cat:normCat(l.cat), meses:new Map()});
      const r = g.get(k);
      r.meses.set(f.mesRef, (r.meses.get(f.mesRef)||0) + (+l.val||0));   // soma do MÊS, não da compra
      if (nome.length < r.desc.length) r.desc = nome;
    }
  const out = [];
  for (const r of g.values()){
    if (r.meses.size < 2) continue;
    const vals = [...r.meses.values()];
    const medio = vals.reduce((a,b)=>a+b,0) / vals.length;              // média POR MÊS
    const variacao = medio ? Math.max(...vals.map(v => Math.abs(v - medio))) / medio : 0;
    out.push({desc:r.desc, cat:r.cat, meses:r.meses.size, medio, fixa:variacao <= 0.08, vals});
  }
  return out.sort((a,b) => b.medio - a.medio);
}
const recorrentesFixas = () => recorrentes().filter(r => r.fixa);

/* um cartão pode vir escrito de formas diferentes de um mês para o outro:
   os 4 dígitos mandam; sem eles, o nome do banco normalizado */
function chaveCartao(f){
  const dig = String(f.cartao||"").replace(/\D/g,"").slice(-4);
  if (dig.length === 4) return "n" + dig;
  return "b" + String(f.banco||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]/g,"");
}

/* Parcelas em aberto: lidas APENAS da fatura mais recente de cada cartão,
   senão a mesma compra parcelada seria contada uma vez por mês carregado. */

// ==========================================================================
// Parcelas: o que já está comprometido à frente
// origem: raio-x-fatura.html, linhas 1082–1113
// ==========================================================================

function parcelasInfo(){
  const alvo = mesAtual();
  const ult = new Map();
  for (const f of fats()){
    if (alvo && f.mesRef > alvo) continue;
    const k = chaveCartao(f);
    if (!ult.has(k) || f.mesRef > ult.get(k).mesRef) ult.set(k, f);
  }
  const compras = [], porMes = new Map(), vistos = new Set();
  for (const f of ult.values()) for (const l of gastos(f)){
    if (!l.parc) continue;
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(l.parc).trim()); if (!m) continue;
    const n = +m[1], N = +m[2]; if (!(N > n)) continue;
    const val = +l.val || 0; if (val <= 0) continue;
    const nome = nomeExibido(l);
    const assinatura = f.id + "|" + normDesc(nome) + "|" + l.parc + "|" + val.toFixed(2);
    if (vistos.has(assinatura)) continue;                  // linha repetida na leitura
    vistos.add(assinatura);
    const restantes = N - n;
    compras.push({desc:nome, val, n, N, restantes, total:val*restantes, cartao:nomeCartao(f), base:f.mesRef});
    for (let k = 1; k <= restantes; k++){
      const mes = addMonths(f.mesRef, k);
      if (!porMes.has(mes)) porMes.set(mes, {tot:0, itens:[]});
      const e = porMes.get(mes); e.tot += val; e.itens.push(nome + " " + (n+k) + "/" + N);
    }
  }
  compras.sort((a,b) => b.total - a.total);
  return {compras, porMes:[...porMes.entries()].sort((a,b)=>a[0]<b[0]?-1:1),
          total: compras.reduce((s,c)=>s+c.total, 0), cartoes: ult.size};
}
const parcelasFuturas = () => parcelasInfo().porMes;

// ==========================================================================
// Base variável por categoria (entrada do plano)
// origem: raio-x-fatura.html, linhas 1548–1564
// ==========================================================================

function variavelPorCategoria(){
  const ms0 = mesesDisponiveis(), alvo = mesAtual();
  const ms = (alvo ? ms0.filter(m => m <= alvo) : ms0).slice(-3);
  if (!ms.length) return {cats:[], meses:0};
  const fixas = new Set(recorrentesFixas().map(r => normDesc(r.desc)));
  const acc = new Map();
  for (const m of ms) for (const l of lancsDoMes(m)){
    if (classeLanc(l, fixas) !== "escolha") continue;
    const c = normCat(l.cat);
    acc.set(c, (acc.get(c)||0) + (+l.val||0));
  }
  return {meses: ms.length,
    cats: [...acc.entries()].map(([cat,v]) => ({cat, media: v/ms.length})).filter(x => x.media > 0)
      .sort((a,b) => b.media - a.media)};
}

/* metas mensais: o teto com poupança é o alvo, a renda é o limite intransponível */

// ==========================================================================
// Metas do plano de 3 meses
// origem: raio-x-fatura.html, linhas 1565–1596
// ==========================================================================

function metasDoPlano(){
  const pj = projecao(); if (!pj) return null;
  const pl = planoSaudavel(pj);
  if (!pl || pl.teto === null) return null;
  const pi = parcelasInfo();
  const vc = variavelPorCategoria();
  const variavelHoje = vc.cats.reduce((s,c) => s + c.media, 0) || pj.variavel;
  const ramp = (RITMOS[prefsPlano.ritmo] || RITMOS.equilibrado).ramp;
  const rendaLiquida = Math.max(0, renda - foraCartao);          // o que pode ir para o cartão sem poupar nada
  const meses = [0,1,2].map(i => {
    const m = addMonths(pj.prox, i);
    const compromissos = (pi.porMes.find(x => x[0] === m)?.[1].tot || 0) + pj.fixos;
    const disp = pl.teto - compromissos;                          // sobra guardando a meta
    const dispMax = rendaLiquida - compromissos;                  // sobra sem guardar nada
    const precisaCortar = Math.max(0, variavelHoje - disp);
    const rampa = Math.max(0, variavelHoje - precisaCortar * ramp[i]);
    const alvo = Math.max(0, Math.min(rampa, Math.max(0, dispMax), i === 2 ? Math.max(disp, 0) : Infinity));
    return {mes:m, compromissos, disp, dispMax, alvo,
      poupanca: rendaLiquida - compromissos - alvo,
      estoura: dispMax < 0};
  });
  return {meses, variavelHoje, teto: pl.teto, metaPoupancaValor: renda * metaPoupanca/100,
    cats: vc.cats, mesesBase: vc.meses,
    precisa: meses.some(m => m.alvo < variavelHoje - 1),
    impossivel: meses.some(m => m.estoura)};
}

const RITMOS = {
  firme:       {ramp:[1, 1, 1],          rotulo:"De uma vez — já no primeiro mês"},
  equilibrado: {ramp:[0.4, 0.75, 1],     rotulo:"Em três passos (recomendado)"},
  suave:       {ramp:[0.25, 0.55, 1],    rotulo:"Devagar — aperta mais no fim"}
};

// ==========================================================================
// Piso por categoria e queda máxima por ritmo
// origem: raio-x-fatura.html, linhas 1708–1718
// ==========================================================================

function pisoCat(c){
  if (prefsPlano.intocaveis.includes(c.cat)) return c.atual;          // não mexe, ponto
  if (prefsPlano.cortar.includes(c.cat)) return 0.25 * c.atual;       // pode cortar fundo — mas não até quase zero
  return (ESSENCIAIS.has(c.cat) ? 0.85 : 0.45) * c.atual;
}
/* quanto uma categoria pode cair de um mês para o outro */
const QUEDA_MAX = {firme:0.5, equilibrado:0.33, suave:0.2};
const quedaMax = () => QUEDA_MAX[prefsPlano.ritmo] ?? 0.33;

/* fecha o mês no alvo sem passar dos limites de cada categoria.
   Devolve o que faltou cortar (0 quando fechou). */

// ==========================================================================
// fecharMes: ajusta as metas de um mês até caberem no teto
// origem: raio-x-fatura.html, linhas 1719–1740
// ==========================================================================

function fecharMes(cats, i, alvo, cap){
  const base = c => i === 0 ? c.atual : c.alvos[i-1];
  const teto = c => base(c);
  const piso = c => prefsPlano.intocaveis.includes(c.cat)
    ? c.atual
    : Math.max(pisoCat(c), base(c) * (1 - cap));
  cats.forEach(c => { c.alvos[i] = Math.min(teto(c), Math.max(piso(c), c.alvos[i])); });
  const soma = () => cats.reduce((s,c) => s + c.alvos[i], 0);
  let dif = alvo - soma();
  for (let passo = 0; passo < 10 && Math.abs(dif) > 1; passo++){
    const pesos = cats.map(c => dif > 0 ? Math.max(0, teto(c) - c.alvos[i]) : Math.max(0, c.alvos[i] - piso(c)));
    const tot = pesos.reduce((a,b) => a+b, 0);
    if (tot <= 0) break;
    cats.forEach((c,k) => {
      c.alvos[i] = Math.min(teto(c), Math.max(piso(c), c.alvos[i] + dif * pesos[k] / tot));
    });
    dif = alvo - soma();
  }
  cats.forEach(c => { c.alvos[i] = Math.round(c.alvos[i]); });
  return dif;
}

// ==========================================================================
// ajustarPlano: aplica travas sobre o que a IA devolveu
// origem: raio-x-fatura.html, linhas 1741–1774
// ==========================================================================

function ajustarPlano(bruto, mt){
  const atual = new Map(mt.cats.map(c => [c.cat, c.media]));
  const cats = (bruto?.categorias || []).filter(c => CATS.includes(c.cat) && atual.has(c.cat)).map(c => ({
    cat: c.cat, atual: atual.get(c.cat) || 0,
    acao: String(c.acao || "").slice(0, 110),
    alvos: [0,1,2].map(i => Math.max(0, +(Array.isArray(c.alvos) ? c.alvos[i] : 0) || 0))
  }));
  for (const [cat, media] of atual) if (!cats.some(c => c.cat === cat) && media > 0)
    cats.push({cat, atual:media, acao:"", alvos:[media, media, media]});
  if (!cats.length) return null;

  /* o que a pessoa mandou não mexer, não se mexe — a IA não tem voto aqui */
  cats.forEach(c => {
    if (prefsPlano.intocaveis.includes(c.cat)){ c.alvos = [c.atual, c.atual, c.atual]; c.travada = true; }
  });

  const avisos = [];
  [0,1,2].forEach(i => {
    let resto = fecharMes(cats, i, mt.meses[i].alvo, quedaMax());
    if (resto < -1) resto = fecharMes(cats, i, mt.meses[i].alvo, 1);   // não coube devagar: vai até o piso
    if (resto < -1) avisos.push({mes: mt.meses[i].mes, falta: -resto});
  });

  cats.sort((a,b) => (b.atual - b.alvos[2]) - (a.atual - a.alvos[2]));
  return {cats, fixos: (bruto?.fixos || []).slice(0,3).map(f => ({
      desc: String(f.desc||"").slice(0,40), acao: String(f.acao||"").slice(0,110), economia: +f.economia || 0})),
    nota: String(bruto?.nota || "").slice(0, 240),
    meses: mt.meses.map(m => ({mes:m.mes, alvo:Math.round(m.alvo), poupanca:Math.round(m.poupanca), disp:Math.round(m.disp)})),
    avisos, metaPoupancaValor: Math.round(mt.metaPoupancaValor || 0),
    variavelHoje: Math.round(mt.variavelHoje), teto: Math.round(mt.teto),
    prefs: {...prefsPlano}, criadoEm: new Date().toISOString()};
}

/* quanto foi gasto de verdade num mês do plano, por categoria */

// ==========================================================================
// realDoMes: o gasto efetivo de uma categoria num mês
// origem: raio-x-fatura.html, linhas 1775–1782
// ==========================================================================

function realDoMes(m, cat){
  if (!mesesDisponiveis().includes(m)) return null;
  const fixas = new Set(recorrentesFixas().map(r => normDesc(r.desc)));
  let t = 0;
  for (const l of lancsDoMes(m)) if (classeLanc(l, fixas) === "escolha" && normCat(l.cat) === cat) t += (+l.val||0);
  return t;
}
