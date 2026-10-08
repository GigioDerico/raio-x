'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { NOMES } from '@/lib/categorias';
import { parseValor } from '@/lib/descricao';
import { rotuloMes } from '@/lib/filtro';
import { chaveDoNome, LIMITE_NOME, nomeNaTela, textoMudouJunto, textoRenomeado, validarNovoNome } from '@/lib/nome-na-tela';
import AvisoDeFalha from '@/components/casca/AvisoDeFalha';
import VazioPorFiltro from '@/components/casca/VazioPorFiltro';
import Duplicados, { type Suspeito } from '@/components/Duplicados';
import { buscar, ErroLocal, falhaDe, textoDoErro, type Falha } from '@/lib/falha';
import { textoDoPapel } from '@/lib/papel';
import type { LinkVazio } from '@/lib/vazio';

export type Linha = {
  id: string;
  data: string;
  mes: string;
  valor: string;
  descOrigem: string;
  descNorm: string;
  descLimpa: string | null;
  apelido: string | null;
  categoria: string | null;
  categoryFonte: string;
  tipo: string;
  parcelaN: number | null;
  totalParcelas: number | null;
  fonte: string;
  contaApelido: string | null;
  contaLast4: string | null;
  contaBanco: string;
  papel: string;
  contaKind: string;
};

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (n: number) => fmt.format(n || 0);
const nomeCartao = (l: Linha) => l.contaApelido || `${l.contaBanco}${l.contaLast4 ? ` ••${l.contaLast4}` : ''}`;
// como valorInput() do app antigo: sempre com vírgula, nunca notação de máquina
const valorInput = (v: number) => (v || 0).toFixed(2).replace('.', ',');

/**
 * Uma tag só, a mais específica primeiro — sem "PARCELA" duplicado, sem
 * "FIXO". Pagamento é gravado com valor negativo (como estorno), então o
 * `tipo` tem de vencer o sinal, senão todo pagamento sai marcado "ESTORNO".
 */
function tagDoLanc(l: Linha): string | null {
  if (l.parcelaN && l.totalParcelas) return `${l.parcelaN}/${l.totalParcelas}`;
  if (l.tipo === 'encargo') return 'ENCARGO';
  if (l.tipo === 'pagamento') return 'PAGAMENTO';
  if (Number(l.valor) < 0) return 'ESTORNO';
  return null;
}

type Ordenacao = 'valor' | 'data' | 'nome';

type Props = {
  mes: string | null; // null = todos os meses
  contas: string[];
  categoriaInicial: string | null;
  recarga: number;
  rotuloRecorte: string;
  semDados: boolean;
  vazio: { frase: string; links: LinkVazio[] };
};

export default function Lancamentos({ mes, contas, categoriaInicial, recarga, rotuloRecorte, semDados, vazio }: Props) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState(categoriaInicial ?? '');
  // "Maior valor" é a ordem do app antigo
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<Falha | null>(null);
  // a tabela só dá lugar a "Carregando…" antes da primeira resposta; depois,
  // recarregar (busca, edição, exclusão, filtro) esmaece as linhas no lugar
  const [carregouUmaVez, setCarregouUmaVez] = useState(false);
  // de que recorte vieram as linhas: se a recarga de outro recorte falha, os
  // números na tela não são os do recorte que o filtro mostra
  const [chaveDasLinhas, setChaveDasLinhas] = useState('');
  const [cargaFalhou, setCargaFalhou] = useState(false);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [catLote, setCatLote] = useState('');
  const [desfazer, setDesfazer] = useState<{ id: string; nome: string } | null>(null);
  // quantos mudaram junto pelo mesmo nome: a troca vai a outros meses, fora da
  // tela, e sem o aviso ela passaria despercebida
  const [junto, setJunto] = useState<string | null>(null);
  const [suspeitos, setSuspeitos] = useState<Suspeito[]>([]);
  // o estabelecimento clicado: a lista mostra só ele, com o total de todos os meses
  const [estab, setEstab] = useState<string | null>(null);
  const [totalTodos, setTotalTodos] = useState<number | null>(null);
  // a aba "Não conta" mostra os débitos fora dos totais; N vem com cada carga
  const [aba, setAba] = useState<'gasto' | 'fora'>('gasto');
  const [naoConta, setNaoConta] = useState(0);
  const [renomeando, setRenomeando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [nomes, setNomes] = useState<string[]>([]);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const idNomes = useId();

  const chaveContas = contas.join(',');
  const chaveAtual = `${mes ?? ''}|${chaveContas}|${categoria}|${busca.trim()}|${estab ?? ''}|${aba}`;
  // busca a cada tecla e o refresh depois de importar disparam cargas sobrepostas;
  // só a resposta do último pedido em voo mexe em estado
  const seq = useRef(0);
  const falhou = (e: unknown) => setErro(textoDoErro(e, navigator.onLine));

  const carregar = useCallback(
    async (manterSelecao = false) => {
      const n = ++seq.current;
      const chave = `${mes ?? ''}|${chaveContas}|${categoria}|${busca.trim()}|${estab ?? ''}|${aba}`;
      setCarregando(true);
      setErro(null);
      setCargaFalhou(false);
      try {
        const q = new URLSearchParams();
        if (mes) q.set('mes', mes);
        if (chaveContas) q.set('cartoes', chaveContas);
        if (categoria) q.set('categoria', categoria);
        if (busca.trim()) q.set('busca', busca.trim());
        if (estab) q.set('nome', estab);
        if (aba === 'fora') q.set('papel', 'fora');
        const r = await buscar(`/api/txn?${q}`);
        if (!r.ok) {
          const f = await falhaDe(r);
          if (n !== seq.current) return;
          throw f;
        }
        const d = await r.json();
        if (n !== seq.current) return;
        const novasLinhas = d.linhas as Linha[];
        setLinhas(novasLinhas);
        setTotalTodos(typeof d.totalTodosMeses === 'number' ? d.totalTodosMeses : null);
        setNaoConta(typeof d.naoConta === 'number' ? d.naoConta : 0);
        setChaveDasLinhas(chave);
        setCarregouUmaVez(true);
        // ao manter, só os ids que continuam na lista — senão trocar a
        // categoria sob um filtro deixa selecionada uma linha que sumiu da
        // tela, e o próximo "aplicar em lote" atinge quem não se vê mais
        if (manterSelecao) {
          const ids = new Set(novasLinhas.map((l) => l.id));
          setSelecao((s) => new Set([...s].filter((id) => ids.has(id))));
        } else {
          setSelecao(new Set());
        }
        // só mês e cartões: a faixa conta o recorte, não a busca nem a categoria.
        // Se falhar, a lista fica e a faixa só não aparece
        const qs = new URLSearchParams();
        if (mes) qs.set('mes', mes);
        if (chaveContas) qs.set('cartoes', chaveContas);
        try {
          const rs = await buscar(`/api/txn/suspeitos?${qs}`);
          const ds = rs.ok ? ((await rs.json()) as { suspeitos: Suspeito[] }) : null;
          if (n === seq.current) setSuspeitos(ds?.suspeitos ?? []);
        } catch {
          if (n === seq.current) setSuspeitos([]);
        }
      } catch (e) {
        if (n !== seq.current) return;
        falhou(e);
        setCargaFalhou(true);
        // a faixa contaria suspeitos de um recorte que a lista não mostra
        setSuspeitos([]);
      } finally {
        if (n === seq.current) setCarregando(false);
      }
    },
    [mes, chaveContas, categoria, busca, estab, aba],
  );

  useEffect(() => {
    void carregar();
  }, [carregar, recarga]);

  // "desfazer de 10 segundos", como o guia promete
  useEffect(() => {
    if (!desfazer) return;
    const t = setTimeout(() => setDesfazer(null), 10000);
    return () => clearTimeout(t);
  }, [desfazer]);

  // a ordenação é local, sobre a lista já carregada
  const linhasOrdenadas = useMemo(() => {
    if (ordenacao === 'data') return linhas;
    const arr = [...linhas];
    if (ordenacao === 'valor') arr.sort((a, b) => Math.abs(Number(b.valor)) - Math.abs(Number(a.valor)));
    else arr.sort((a, b) => nomeNaTela(a).localeCompare(nomeNaTela(b), 'pt-BR'));
    return arr;
  }, [linhas, ordenacao]);

  const linhasVelhas = cargaFalhou && chaveDasLinhas !== chaveAtual;
  const total = useMemo(() => linhas.reduce((s, l) => s + Number(l.valor), 0), [linhas]);

  /** Devolve se salvou — o campo de valor usa isso para saber se restaura. */
  async function mudar(id: string, corpo: Record<string, unknown>): Promise<boolean> {
    // o nome é o de antes de recarregar: é por ele que os outros foram achados
    const linha = linhas.find((l) => l.id === id);
    let outros = 0;
    try {
      const r = await buscar(`/api/txn/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) throw await falhaDe(r);
      outros = Number(((await r.json()) as { outros?: unknown }).outros) || 0;
    } catch (e) {
      falhou(e);
      return false;
    }
    setJunto(
      typeof corpo.categoria === 'string' && outros > 0 && linha
        ? textoMudouJunto(outros, nomeNaTela(linha), corpo.categoria || '—')
        : null,
    );
    // corrigir um lançamento não pode perder a seleção dos outros
    await carregar(true);
    return true;
  }

  async function excluir(l: Linha) {
    try {
      const r = await buscar(`/api/txn/${l.id}`, { method: 'DELETE' });
      if (!r.ok) throw await falhaDe(r);
    } catch (e) {
      falhou(e);
      return;
    }
    setDesfazer({ id: l.id, nome: nomeNaTela(l) });
    await carregar();
  }

  async function restaurar() {
    if (!desfazer) return;
    // o aviso só some se deu certo — falhando, fica para tentar de novo
    try {
      const r = await buscar(`/api/txn/${desfazer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restaurar: true }),
      });
      if (!r.ok) throw await falhaDe(r);
    } catch (e) {
      falhou(e);
      // objeto novo reinicia os 10 s: tentar de novo não pode depender do tempo que sobrou
      setDesfazer({ ...desfazer });
      return;
    }
    setDesfazer(null);
    await carregar();
  }

  async function aplicarLote() {
    if (!catLote || selecao.size === 0) return;
    const cat = catLote;
    let outros = 0;
    try {
      const r = await buscar('/api/txn/bulk', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [...selecao], categoria: cat }),
      });
      if (!r.ok) throw await falhaDe(r);
      outros = Number(((await r.json()) as { outros?: unknown }).outros) || 0;
    } catch (e) {
      falhou(e);
      return;
    }
    setJunto(textoMudouJunto(outros, null, cat));
    setCatLote('');
    await carregar();
  }

  /** "Não conta" e "contar como gasto", na linha e no lote: uma rota só. */
  async function marcarPapel(ids: string[], papel: 'gasto' | 'fora') {
    let outros = 0;
    let aprendeu = true;
    try {
      const r = await buscar('/api/txn/papel', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, papel }),
      });
      if (!r.ok) throw await falhaDe(r);
      const d = (await r.json()) as { outros?: unknown; aprendeu?: unknown };
      outros = Number(d.outros) || 0;
      aprendeu = d.aprendeu !== false;
    } catch (e) {
      falhou(e);
      return;
    }
    setJunto(textoDoPapel(papel, outros, aprendeu));
    await carregar();
  }

  // a seleção pode misturar cartão e conta; o papel só existe na conta corrente
  const selecaoDeConta = linhas.filter((l) => selecao.has(l.id) && l.contaKind === 'conta_corrente').map((l) => l.id);

  function trocarAba(nova: 'gasto' | 'fora') {
    if (nova === aba) return;
    // o estabelecimento (total de todos os meses, Renomear) e a categoria do
    // filtro são de gasto: levados para a outra aba, a lista sairia vazia ou o
    // total diria outra coisa. A busca é só texto e vale nas duas
    setCategoria('');
    setEstab(null);
    setRenomeando(false);
    setAba(nova);
  }

  function filtrarNome(nome: string) {
    // a busca de texto filtraria de novo dentro do estabelecimento, e a categoria
    // tiraria do total do recorte o que o total de todos os meses conta
    setBusca('');
    setCategoria('');
    setEstab(nome);
    setRenomeando(false);
  }

  function tirarEstab() {
    setEstab(null);
    setRenomeando(false);
  }

  async function abrirRenomear() {
    if (!estab) return;
    setNovoNome(estab);
    setRenomeando(true);
    // carregado ao abrir, não com a lista: só quem renomeia precisa dos nomes.
    // Falhando, o campo continua servindo sem sugestões
    try {
      const r = await buscar('/api/txn/nomes');
      if (r.ok) setNomes(((await r.json()) as { nomes: string[] }).nomes);
    } catch {
      /* sem sugestões */
    }
  }

  async function salvarNome() {
    if (!estab || salvandoNome) return;
    const de = estab;
    const v = validarNovoNome(de, novoNome);
    if (!v.ok) {
      falhou(new ErroLocal(v.mensagem));
      return;
    }
    setSalvandoNome(true);
    let resposta: { renomeados: number; categoria: string | null };
    try {
      const r = await buscar('/api/txn/renomear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ de, para: v.nome }),
      });
      if (!r.ok) throw await falhaDe(r);
      resposta = (await r.json()) as typeof resposta;
    } catch (e) {
      falhou(e);
      return;
    } finally {
      setSalvandoNome(false);
    }
    setErro(null);
    setRenomeando(false);
    // a troca vai a todos os meses, fora da tela: o aviso diz o que aconteceu
    setJunto(textoRenomeado(resposta.renomeados, de, v.nome, resposta.categoria));
    // o estab novo recarrega a lista pelo efeito; os nomes mudaram para o datalist
    setEstab(v.nome);
    setNomes([]);
  }

  function alternar(id: string) {
    setSelecao((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const todosSelecionados = linhasOrdenadas.length > 0 && linhasOrdenadas.every((l) => selecao.has(l.id));
  function alternarTodos() {
    setSelecao(todosSelecionados ? new Set() : new Set(linhasOrdenadas.map((l) => l.id)));
  }

  return (
    <section>
      <div className="filtros">
        <input
          type="text"
          placeholder="Buscar estabelecimento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar"
        />
        {aba === 'gasto' && (
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {NOMES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as Ordenacao)} aria-label="Ordenar">
          <option value="valor">Maior valor</option>
          <option value="data">Mais recente</option>
          <option value="nome">Estabelecimento</option>
        </select>
      </div>

      <div className="alternador" role="group" aria-label="O que mostrar">
        <button type="button" aria-pressed={aba === 'gasto'} onClick={() => trocarAba('gasto')}>
          Gastos
        </button>
        <button type="button" aria-pressed={aba === 'fora'} onClick={() => trocarAba('fora')}>
          Não conta ({naoConta})
        </button>
      </div>

      {erro && <AvisoDeFalha falha={erro} />}
      {cargaFalhou && !carregando && (
        <button type="button" className="link" onClick={() => void carregar()}>
          Tentar de novo
        </button>
      )}

      <Duplicados suspeitos={suspeitos} aoMudar={() => void carregar(true)} />

      {desfazer && (
        <div className="aviso">
          <span>&ldquo;{desfazer.nome}&rdquo; foi excluído.</span>
          <button type="button" className="link" onClick={() => void restaurar()}>
            Desfazer
          </button>
        </div>
      )}

      {junto && (
        <div className="aviso" role="status">
          <span>{junto}</span>
          <button type="button" className="link" onClick={() => setJunto(null)}>
            OK
          </button>
        </div>
      )}

      {estab && carregouUmaVez && !linhasVelhas && (
        <div className="aviso estab">
          <span className="estab-resumo">
            <strong>{estab}</strong> · {linhas.length} {linhas.length === 1 ? 'lançamento' : 'lançamentos'}
            {mes ? ` · ${moeda(total)} em ${rotuloRecorte}` : ''}
            {totalTodos !== null && ` · ${moeda(totalTodos)} em todos os meses`}
          </span>
          {!renomeando && (
            <button type="button" className="link" onClick={() => void abrirRenomear()}>
              Renomear
            </button>
          )}
          <button type="button" className="link" onClick={tirarEstab} aria-label={`Mostrar todos, não só ${estab}`}>
            ×
          </button>
        </div>
      )}

      {estab && renomeando && (
        <form
          className="barra"
          onSubmit={(e) => {
            e.preventDefault();
            void salvarNome();
          }}
        >
          <input
            type="text"
            className="estab-campo"
            list={idNomes}
            value={novoNome}
            maxLength={LIMITE_NOME}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRenomeando(false);
            }}
            autoFocus
            aria-label={`Novo nome para ${estab}`}
          />
          <datalist id={idNomes}>
            {nomes
              .filter((n) => chaveDoNome(n) !== chaveDoNome(estab))
              .map((n) => (
                <option key={n} value={n} />
              ))}
          </datalist>
          <button type="submit" disabled={salvandoNome}>
            Salvar
          </button>
          <button type="button" className="link" onClick={() => setRenomeando(false)}>
            Cancelar
          </button>
        </form>
      )}

      {selecao.size > 0 && (
        <div className="barra">
          <span>
            {selecao.size} selecionado{selecao.size > 1 ? 's' : ''}
          </span>
          <select value={catLote} onChange={(e) => setCatLote(e.target.value)} aria-label="Categoria do lote">
            <option value="">Mudar categoria para…</option>
            {NOMES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="button" disabled={!catLote} onClick={() => void aplicarLote()}>
            Aplicar
          </button>
          {selecaoDeConta.length > 0 && (
            <button type="button" onClick={() => void marcarPapel(selecaoDeConta, aba === 'gasto' ? 'fora' : 'gasto')}>
              {aba === 'gasto' ? 'Não conta' : 'Contar como gasto'}
              {/* com cartão no meio, o número diz que só os da conta mudam */}
              {selecaoDeConta.length < selecao.size ? ` (${selecaoDeConta.length} da conta corrente)` : ''}
            </button>
          )}
          <button type="button" className="link" onClick={() => setSelecao(new Set())}>
            Limpar
          </button>
        </div>
      )}

      {carregando && !carregouUmaVez ? (
        <p className="suave">Carregando…</p>
      ) : !carregouUmaVez || (linhasVelhas && linhas.length === 0) ? null /* a carga falhou: o erro acima basta, "vazio" seria mentira */ : linhas.length === 0 ? (
        semDados ? (
          <p className="suave">Nada aqui ainda. Importe uma fatura em PDF acima para começar.</p>
        ) : estab ? (
          <p className="suave">
            Nada de “{estab}” {busca.trim() && `com “${busca.trim()}” `}{categoria && `na categoria ${categoria} `}em {rotuloRecorte}.{' '}
            <button type="button" className="link" onClick={() => { setBusca(''); setCategoria(''); tirarEstab(); }}>
              Limpar
            </button>
          </p>
        ) : busca.trim() || categoria ? (
          <p className="suave">
            Nada {busca.trim() && `com “${busca.trim()}” `}{categoria && `na categoria ${categoria} `}em {rotuloRecorte}.{' '}
            <button type="button" className="link" onClick={() => { setBusca(''); setCategoria(''); }}>
              Limpar busca e categoria
            </button>
          </p>
        ) : aba === 'fora' ? (
          <p className="suave">Nada fora dos totais em {rotuloRecorte}.</p>
        ) : (
          <VazioPorFiltro frase={vazio.frase} links={vazio.links} nivel="h2" />
        )
      ) : (
        <>
          {!linhasVelhas && !estab && (
            <p className="suave">
              {linhas.length} lançamentos · {moeda(total)}
            </p>
          )}
          {/* a mesma marcação serve a tabela (≥48rem) e o cartão por lançamento
              (<48rem) — mobile-first: o CSS muda a disposição a partir de
              48rem (ver docs/guia-de-construcao.md, seção Lançamentos) */}
          <div className={carregando || linhasVelhas ? 'tl esmaecido' : 'tl'} aria-busy={carregando}>
            <div className="tl-cab">
              <input
                type="checkbox"
                className="tl-sel"
                checked={todosSelecionados}
                onChange={alternarTodos}
                aria-label="Selecionar todos os visíveis"
              />
              {/* rótulos decorativos — cada campo já tem o próprio aria-label */}
              <span className="tl-data" aria-hidden="true">Data</span>
              <span className="tl-nome" aria-hidden="true">Estabelecimento</span>
              <span className="tl-cat" aria-hidden="true">Categoria</span>
              <span className="tl-cartao" aria-hidden="true">Origem</span>
              <span className="tl-val" aria-hidden="true">Valor</span>
            </div>
            <ul className="tl-corpo">
              {linhasOrdenadas.map((l) => (
                <LinhaTabela
                  key={l.id}
                  l={l}
                  selecionado={selecao.has(l.id)}
                  onAlternar={() => alternar(l.id)}
                  onMudar={(corpo) => mudar(l.id, corpo)}
                  onExcluir={() => void excluir(l)}
                  // o estabelecimento (total, Renomear) é de gasto: na aba "Não conta" o nome é só texto
                  onFiltrarNome={aba === 'gasto' ? () => filtrarNome(nomeNaTela(l)) : undefined}
                  onPapel={l.contaKind === 'conta_corrente' ? () => void marcarPapel([l.id], aba === 'gasto' ? 'fora' : 'gasto') : undefined}
                  aba={aba}
                />
              ))}
            </ul>
          </div>
          <label className="tl-todos-rodape">
            <input type="checkbox" checked={todosSelecionados} onChange={alternarTodos} />
            selecionar todos os visíveis
          </label>
        </>
      )}
    </section>
  );
}

function LinhaTabela({
  l,
  selecionado,
  onAlternar,
  onMudar,
  onExcluir,
  onFiltrarNome,
  onPapel,
  aba,
}: {
  l: Linha;
  selecionado: boolean;
  onAlternar: () => void;
  onMudar: (corpo: Record<string, unknown>) => Promise<boolean>;
  onExcluir: () => void;
  onFiltrarNome?: () => void;
  onPapel?: () => void;
  aba: 'gasto' | 'fora';
}) {
  // o valor edita local até sair do campo — cada tecla não pode disparar um
  // PATCH, e a correção de valor nunca vira regra (diferente da categoria)
  const [valorEdit, setValorEdit] = useState(() => valorInput(Number(l.valor)));
  useEffect(() => setValorEdit(valorInput(Number(l.valor))), [l.valor]);
  // Esc cancela sem salvar: o blur que o Esc dispara não pode rodar salvarValor
  const canceladoRef = useRef(false);

  async function salvarValor() {
    const bruto = valorEdit.trim();
    if (!bruto) {
      setValorEdit(valorInput(Number(l.valor)));
      return;
    }
    const n = parseValor(bruto);
    if (!Number.isFinite(n)) {
      setValorEdit(valorInput(Number(l.valor)));
      return;
    }
    // compara em centavos: nada de PATCH à toa por causa de arredondamento
    if (Math.round(n * 100) === Math.round(Number(l.valor) * 100)) {
      setValorEdit(valorInput(Number(l.valor)));
      return;
    }
    const ok = await onMudar({ valor: n });
    if (!ok) setValorEdit(valorInput(Number(l.valor)));
  }

  const nome = nomeNaTela(l);
  const tag = tagDoLanc(l);
  const negativo = Number(l.valor) < 0;
  // o mesmo botão em dois lugares: na meta (celular) e na coluna Origem
  // (desktop); o CSS mostra um de cada vez, então o leitor de tela acha um só
  const botaoPapel = onPapel && (
    <button
      type="button"
      className="link tl-papel"
      onClick={onPapel}
      aria-label={aba === 'gasto' ? `${nome} não conta` : `Contar ${nome} como gasto`}
    >
      {aba === 'gasto' ? 'não conta' : 'contar'}
    </button>
  );

  return (
    <li className={`tl-lin${selecionado ? ' marcado' : ''}`}>
      <input
        type="checkbox"
        className="tl-sel"
        checked={selecionado}
        onChange={onAlternar}
        aria-label={`Selecionar ${nome}`}
      />
      <span className="tl-data">
        {l.data.slice(8, 10)}/{l.data.slice(5, 7)}
      </span>
      <span className="tl-nome">
        {onFiltrarNome ? (
          <button type="button" className="tl-nome-botao" onClick={onFiltrarNome} aria-label={`Mostrar só ${nome}`} title={nome}>
            {nome}
          </button>
        ) : (
          <span title={nome}>{nome}</span>
        )}
        {tag && <span className="tag">{tag}</span>}
      </span>
      <span className="tl-meta">
        <span className="tl-meta-texto">
          {nomeCartao(l)} · {l.contaKind === 'conta_corrente' ? rotuloMes(l.mes) : `fatura de ${rotuloMes(l.mes)}`}
        </span>
        {botaoPapel}
      </span>
      <span className="tl-cartao">
        {nomeCartao(l)}
        {botaoPapel}
      </span>
      <select
        className={`tl-cat${l.categoryFonte === 'manual' ? ' seu' : ''}`}
        value={l.categoria ?? ''}
        onChange={(e) => void onMudar({ categoria: e.target.value })}
        aria-label={`Categoria de ${nome}`}
      >
        <option value="">—</option>
        {NOMES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="decimal"
        className={`tl-val${negativo ? ' neg' : ''}`}
        value={valorEdit}
        onChange={(e) => setValorEdit(e.target.value)}
        onBlur={() => {
          if (canceladoRef.current) {
            canceladoRef.current = false;
            return;
          }
          void salvarValor();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            canceladoRef.current = true;
            setValorEdit(valorInput(Number(l.valor)));
            e.currentTarget.blur();
          }
        }}
        aria-label={`Valor de ${nome}`}
      />
      <button type="button" className="link perigo tl-del" onClick={onExcluir} aria-label={`Excluir ${nome}`}>
        ×
      </button>
    </li>
  );
}
