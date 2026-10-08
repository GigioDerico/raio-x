'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Lente from '@/components/Lente';

export default function Login() {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    let res: Response;
    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ senha }),
      });
    } catch {
      setErro('Não consegui falar com o servidor.');
      setEnviando(false);
      return;
    }

    if (res.ok) {
      router.replace('/');
      router.refresh();
      return;
    }

    const corpo = await res.json().catch(() => ({}));
    setErro(
      corpo?.erro === 'muitas_tentativas'
        ? `Muitas tentativas. Tente de novo em ${corpo.tenteEm}s.`
        : corpo?.erro === 'banco_indisponivel'
          ? 'O banco não respondeu. Tente de novo em instantes.'
          : 'Senha incorreta.',
    );
    setSenha('');
    setEnviando(false);
  }

  return (
    <div className="login-tela">
      <div className="login">
        <div className="marca">
          <Lente />
          <h1>
            Raio-<em>X</em>
          </h1>
        </div>

        <form onSubmit={entrar} className="cartao">
          <span className="eyebrow">Acesso</span>

          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            aria-describedby={erro ? 'erro-login' : undefined}
          />

          <button type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          {erro && (
            <p className="erro" id="erro-login" role="alert">
              {erro}
            </p>
          )}
        </form>

        <p className="login-nota">
          Uma instalação, uma pessoa. Seus dados ficam no seu banco, com as suas chaves.
        </p>
      </div>
    </div>
  );
}
