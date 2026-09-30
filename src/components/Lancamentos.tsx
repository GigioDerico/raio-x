'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NOMES } from '@/lib/categorias';

export type Linha = {
  id: string;
  data: string;
  valor: string;
  descOrigem: string;
  descNorm: string;
  apelido: string | null;
  categoria: string | null;
  categoryFonte: string;
  tipo: string;
  parcelaN: number | null;
  totalParcelas: number | null;
  fonte: string;
  contaApelido: string | null;
  contaLast4: string | null;
};

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (n: number) => fmt.format(n || 0);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const nomeNaTela = (l: Linha) => l.apelido || l.descOrigem;

export default function Lancamentos({ recarga }: { recarga: number }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [mes, setMes] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [catLote, setCatLote] = useState('');
  const [desfazer, setDesfazer] = useState<{ id: string; nome: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const q = new URLSearchParams();
      if (mes) q.set('mes', mes);
      if (busca.trim()) q.set('busca', busca.trim());
      const r = await fetch(`/api/txn?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detalhe || d?.erro || 'falha ao carregar');
      setLinhas(d.linhas as Linha[]);
      setSelecao(new Set());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falhou');
    } finally {
      setCarregando(false);
    }
  }, [mes, busca]);

  useEffect(() => {
    void carregar();
  }, [carregar, recarga]);

  const meses = useMemo(() => {
    const s = new Set(linhas.map((l) => l.data.slice(0, 7)));
    return [...s].sort().reverse();
  }, [linhas]);

  const total = useMemo(() => linhas.reduce((s, l) => s + Number(l.valor), 0), [linhas]);

  async function mudar(id: string, corpo: Record<string, unknown>) {
    const r = await fetch(`/api/txn/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d?.detalhe || d?.erro || 'não consegui salvar');
      return;
    }
    await carregar();
  }

  async function excluir(l: Linha) {
    const r = await fetch(`/api/txn/${l.id}`, { method: 'DELETE' });
    if (!r.ok) {
      setErro('não consegui excluir');
      return;
    }
    setDesfazer({ id: l.id, nome: nomeNaTela(l) });
    await carregar();
  }

  async function restaurar() {
    if (!desfazer) return;
    await fetch(`/api/txn/${desfazer.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurar: true }),
    });
    setDesfazer(null);
    await carregar();
  }

  async function aplicarLote() {
    if (!catLote || selecao.size === 0) return;
    const r = await fetch('/api/txn/bulk', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [...selecao], categoria: catLote }),
    });
    if (!r.ok) {
      setErro('não consegui aplicar em lote');
      return;
    }
    setCatLote('');
    await carregar();
  }

  function alternar(id: string) {
    setSelecao((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <section>
      <h2>Lançamentos</h2>

      <div className="filtros">
        <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
          <option value="">Todos os meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {rotuloMes(m)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Buscar estabelecimento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar"
        />
      </div>

      {erro && <p className="erro">{erro}</p>}

      {desfazer && (
        <div className="aviso">
          <span>&ldquo;{desfazer.nome}&rdquo; foi excluído.</span>
          <button type="button" className="link" onClick={() => void restaurar()}>
            Desfazer
          </button>
        </div>
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
          <button type="button" className="link" onClick={() => setSelecao(new Set())}>
            Limpar
          </button>
        </div>
      )}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="suave">
          Nada aqui ainda. Importe uma fatura em PDF acima — ou, a partir da fatia 4, conecte um banco.
        </p>
      ) : (
        <>
          <p className="suave">
            {linhas.length} lançamentos · {moeda(total)}
          </p>
          <ul className="lancs">
            {linhas.map((l) => (
              <li key={l.id} className={selecao.has(l.id) ? 'marcado' : undefined}>
                <input
                  type="checkbox"
                  checked={selecao.has(l.id)}
                  onChange={() => alternar(l.id)}
                  aria-label={`Selecionar ${nomeNaTela(l)}`}
                />
                <div className="quem">
                  <strong>{nomeNaTela(l)}</strong>
                  <small className="suave">
                    {l.data.slice(8, 10)}/{l.data.slice(5, 7)}
                    {l.parcelaN && l.totalParcelas ? ` · ${l.parcelaN}/${l.totalParcelas}` : ''}
                    {l.contaApelido || l.contaLast4 ? ` · ${l.contaApelido ?? `••${l.contaLast4}`}` : ''}
                    {l.fonte === 'pdf' ? ' · PDF' : ''}
                  </small>
                </div>
                <select
                  value={l.categoria ?? ''}
                  onChange={(e) => void mudar(l.id, { categoria: e.target.value })}
                  aria-label={`Categoria de ${nomeNaTela(l)}`}
                  className={l.categoryFonte === 'manual' ? 'seu' : undefined}
                >
                  <option value="">—</option>
                  {NOMES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className="valor">{moeda(Number(l.valor))}</span>
                <button
                  type="button"
                  className="link perigo"
                  onClick={() => void excluir(l)}
                  aria-label={`Excluir ${nomeNaTela(l)}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
