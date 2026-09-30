'use client';

import { useRef, useState } from 'react';
import { MAX_PEDACOS, pedacos, type LancLimpo } from '@/lib/extracao';
import { PdfComSenha, extrairTexto } from '@/lib/pdf-cliente';

type Resultado = {
  novos: number;
  duplicados: number;
  mesRef: string;
  banco: string;
  cartao: string;
  totalInformado: number | null;
  totalLido: number;
};

async function postar<T>(url: string, corpo: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dados = await r.json();
  if (!r.ok) throw new Error(dados?.detalhe || dados?.erro || `falha ${r.status}`);
  return dados as T;
}

export default function Importar({ aoImportar }: { aoImportar: () => void }) {
  const [passo, setPasso] = useState('');
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function processar(arquivo: File) {
    setErro('');
    setResultado(null);

    try {
      setPasso('Lendo o arquivo…');
      let texto: string;
      try {
        texto = await extrairTexto(arquivo);
      } catch (e) {
        if (e instanceof PdfComSenha) {
          const senha = window.prompt('Este PDF pede senha. Qual é?') ?? '';
          if (!senha) throw new Error('importação cancelada');
          texto = await extrairTexto(arquivo, senha);
        } else {
          throw e;
        }
      }

      const trechos = pedacos(texto).slice(0, MAX_PEDACOS);
      if (trechos.length === 0) throw new Error('não achei texto nenhum neste PDF');

      const lancamentos: LancLimpo[] = [];
      let cabecalho: Record<string, unknown> | null = null;

      for (let i = 0; i < trechos.length; i++) {
        setPasso(`Lendo com a IA — trecho ${i + 1} de ${trechos.length}…`);
        const r = await postar<{
          lancamentos: LancLimpo[];
          cabecalho: Record<string, unknown> | null;
        }>('/api/import/trecho', { trecho: trechos[i], idx: i + 1, n: trechos.length });

        if (r.cabecalho) cabecalho = r.cabecalho;
        lancamentos.push(...r.lancamentos);
      }

      setPasso('Gravando…');
      const r = await postar<Resultado>('/api/import/comitar', { cabecalho, lancamentos });
      setResultado(r);
      aoImportar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falhou');
    } finally {
      setPasso('');
      if (entrada.current) entrada.current.value = '';
    }
  }

  const ocupado = passo !== '';
  const divergencia =
    resultado?.totalInformado != null &&
    Math.abs(resultado.totalInformado - resultado.totalLido) > 0.05;

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>Importar fatura em PDF</h2>
      <p className="suave" style={{ marginTop: 0 }}>
        O arquivo não sai do seu navegador — só o texto vai para o servidor.
      </p>

      <input
        ref={entrada}
        type="file"
        accept="application/pdf"
        disabled={ocupado}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void processar(f);
        }}
      />

      {ocupado && (
        <p className="suave" role="status">
          {passo}
        </p>
      )}
      {erro && <p className="erro">{erro}</p>}

      {resultado && (
        <div style={{ marginTop: '0.75rem' }}>
          <p>
            <strong>
              {resultado.banco} {resultado.cartao && `••${resultado.cartao}`} — {resultado.mesRef}
            </strong>
            <br />
            {resultado.novos} lançamentos novos
            {resultado.duplicados > 0 && `, ${resultado.duplicados} já estavam aqui`}.
          </p>
          {divergencia && (
            <p className="erro">
              A fatura diz {moeda(resultado.totalInformado!)} e a leitura somou{' '}
              {moeda(resultado.totalLido)}. Vale conferir se faltou alguma linha.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (n: number) => fmt.format(n || 0);
