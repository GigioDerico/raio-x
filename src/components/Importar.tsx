'use client';

import { useRef, useState } from 'react';
import { MAX_PEDACOS, pedacos, type LancLimpo } from '@/lib/extracao';
import { PdfComSenha, extrairTexto } from '@/lib/pdf-cliente';
import AvisoDeFalha from '@/components/casca/AvisoDeFalha';
import { avisoIgnorados, buscar, ErroLocal, falhaDe, textoDoErro, type Falha } from '@/lib/falha';

type Resultado = {
  novos: number;
  atualizados: number;
  duplicados: number;
  mesRef: string;
  banco: string;
  cartao: string;
  totalInformado: number | null;
  totalLido: number;
};

async function postar<T>(url: string, corpo: unknown): Promise<T> {
  const r = await buscar(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw await falhaDe(r);
  return (await r.json()) as T;
}

export default function Importar({ aoImportar }: { aoImportar: () => void }) {
  const [passo, setPasso] = useState('');
  const [erro, setErro] = useState<Falha | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ignorados, setIgnorados] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  async function processar(arquivo: File) {
    setErro(null);
    setResultado(null);
    setIgnorados(0);

    try {
      setPasso('Lendo o arquivo…');
      let texto: string;
      try {
        texto = await extrairTexto(arquivo);
      } catch (e) {
        if (!(e instanceof PdfComSenha)) throw e;
        const senha = window.prompt('Este PDF pede senha. Qual é?') ?? '';
        if (!senha) throw new ErroLocal('Importação cancelada.');
        try {
          texto = await extrairTexto(arquivo, senha);
        } catch (e2) {
          // o pdf.js responde a senha errada com o mesmo erro de "pede senha"
          throw e2 instanceof PdfComSenha ? new ErroLocal('A senha não confere.') : e2;
        }
      }

      const trechos = pedacos(texto).slice(0, MAX_PEDACOS);
      if (trechos.length === 0) throw new ErroLocal('Não achei texto nenhum neste PDF.');

      const lancamentos: LancLimpo[] = [];
      let cabecalho: Record<string, unknown> | null = null;
      let nIgn = 0;
      let conferido = false;

      for (let i = 0; i < trechos.length; i++) {
        setPasso(`Lendo com a IA — trecho ${i + 1} de ${trechos.length}…`);
        const r = await postar<{
          lancamentos: LancLimpo[];
          cabecalho: Record<string, unknown> | null;
          ignorado?: boolean;
        }>('/api/import/trecho', { trecho: trechos[i], idx: i + 1, n: trechos.length });
        if (r.ignorado) nIgn++;

        if (r.cabecalho) cabecalho = r.cabecalho;
        if (r.cabecalho && !conferido) {
          conferido = true;
          let c: { coberto: boolean; mensagem?: string } | null = null;
          try {
            c = await postar<{ coberto: boolean; mensagem?: string }>('/api/import/conferir', { cabecalho: r.cabecalho });
          } catch {
            // a conferência só economiza IA: o `comitar` confere de novo antes de
            // gravar, então uma falha aqui não justifica perder a importação
          }
          // mês que já vem pelo Open Finance: para antes de gastar IA com o resto
          if (c?.coberto) throw new ErroLocal(c.mensagem ?? 'Este mês já vem pelo Open Finance.');
        }
        lancamentos.push(...r.lancamentos);
      }

      setPasso('Gravando…');
      const r = await postar<Resultado>('/api/import/comitar', { cabecalho, lancamentos });
      setIgnorados(nIgn);
      setResultado(r);
      aoImportar();
    } catch (e) {
      setErro(textoDoErro(e, navigator.onLine));
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
      {erro && <AvisoDeFalha falha={erro} />}

      {resultado && (
        <div style={{ marginTop: '0.75rem' }}>
          <p>
            <strong>
              {resultado.banco} {resultado.cartao && `••${resultado.cartao}`} — {resultado.mesRef}
            </strong>
            <br />
            {resultado.novos} lançamentos novos
            {resultado.atualizados > 0 && `, ${resultado.atualizados} corrigidos`}
            {resultado.duplicados > 0 && `, ${resultado.duplicados} já estavam aqui`}.
          </p>
          {avisoIgnorados(ignorados) && <p className="erro">{avisoIgnorados(ignorados)} Vale conferir se faltou alguma linha.</p>}
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
