'use client';

import { useState } from 'react';
import { buscar, falhaDe, textoDoErro } from '@/lib/falha';

type Resultado = { ok: boolean; provedor: string; modelo: string; latenciaMs: number };

export default function TestarIa() {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function testar() {
    setTestando(true);
    setResultado(null);
    setErro(null);
    try {
      const r = await buscar('/api/ia/testar', { method: 'POST' });
      if (!r.ok) throw await falhaDe(r);
      const d = (await r.json()) as Resultado;
      setResultado(d);
    } catch (e) {
      setErro(textoDoErro(e, navigator.onLine).texto);
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="ia-teste">
      <button type="button" className="secundario" onClick={() => void testar()} disabled={testando}>
        {testando ? 'Testando conexão…' : 'Testar conexão com IA'}
      </button>
      {resultado && (
        <p className="ia-teste-ok" role="status">
          ✓ Conexão funcionando! Modelo <strong>{resultado.modelo}</strong> respondeu em {(resultado.latenciaMs / 1000).toFixed(2)}s.
        </p>
      )}
      {erro && (
        <p className="ia-teste-erro erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
