'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatarCampo, type TipoCampo } from '@/lib/ajustes';

type Props = {
  url: string;
  campo: string;
  rotulo: string;
  tipo: TipoCampo;
  valor: string;
  placeholder?: string;
  max?: number;
  /** recarrega os dados do servidor depois de salvar (o apelido aparece no filtro e no hero) */
  atualizarTela?: boolean;
};

type Estado = { k: 'ocioso' | 'salvando' | 'salvo' | 'erro'; msg?: string };

export default function CampoAjuste({ url, campo, rotulo, tipo, valor, placeholder, max, atualizarTela }: Props) {
  const id = useId();
  const router = useRouter();
  const [texto, setTexto] = useState(valor);
  const gravado = useRef(valor);
  // o texto do campo agora, fora do ciclo de render: a resposta de um PATCH
  // chega depois, e o usuário pode já ter voltado a digitar
  const atual = useRef(valor);
  // com o Neon frio, dois salvamentos seguidos podem voltar fora de ordem;
  // só a resposta do último pode mexer na tela
  const ultimo = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [estado, setEstado] = useState<Estado>({ k: 'ocioso' });

  function mostrar(e: Estado) {
    clearTimeout(timer.current);
    setEstado(e);
    if (e.k === 'salvo') timer.current = setTimeout(() => setEstado({ k: 'ocioso' }), 2000);
  }

  async function salvar() {
    const enviado = texto;
    if (enviado === gravado.current) {
      // voltou ao valor que já está gravado: o erro de antes não vale mais
      if (estado.k === 'erro') mostrar({ k: 'ocioso' });
      return;
    }
    const meu = ++ultimo.current;
    mostrar({ k: 'salvando' });
    try {
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [campo]: enviado }),
      });
      const d = await r.json().catch(() => ({}));
      if (meu !== ultimo.current) return;
      if (!r.ok) {
        // 400/404 trazem mensagem escrita para o usuário; o resto é falha nossa
        const msg =
          r.status === 400 || r.status === 404
            ? d?.detalhe || 'valor inválido'
            : r.status === 401
              ? 'sua sessão expirou, entre de novo'
              : 'não consegui salvar, tente de novo';
        mostrar({ k: 'erro', msg });
        return;
      }
      const novo = formatarCampo(tipo, (d.config ?? d.conta)?.[campo]);
      gravado.current = novo;
      if (atual.current === enviado) {
        atual.current = novo;
        setTexto(novo);
      }
      mostrar({ k: 'salvo' });
      if (atualizarTela) router.refresh();
    } catch {
      if (meu === ultimo.current) mostrar({ k: 'erro', msg: 'não consegui salvar, tente de novo' });
    }
  }

  return (
    <div className="campo-ajuste">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="text"
        inputMode={tipo === 'texto' ? 'text' : tipo === 'dia' ? 'numeric' : 'decimal'}
        value={texto}
        placeholder={placeholder}
        maxLength={max ?? (tipo === 'texto' ? 40 : 20)}
        onChange={(e) => {
          atual.current = e.target.value;
          setTexto(e.target.value);
        }}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-invalid={estado.k === 'erro'}
        aria-describedby={`${id}-msg`}
      />
      <span id={`${id}-msg`} className="campo-msg" data-estado={estado.k} aria-live="polite">
        {estado.k === 'salvando' ? 'salvando…' : estado.k === 'salvo' ? 'salvo' : estado.k === 'erro' ? estado.msg : ''}
      </span>
    </div>
  );
}
