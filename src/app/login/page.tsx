'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senha }),
    });

    if (res.ok) {
      router.replace('/');
      router.refresh();
      return;
    }

    const corpo = await res.json().catch(() => ({}));
    setErro(
      corpo?.erro === 'muitas_tentativas'
        ? `Muitas tentativas. Tente de novo em ${corpo.tenteEm}s.`
        : 'Senha incorreta.',
    );
    setSenha('');
    setEnviando(false);
  }

  return (
    <div className="login">
      <h1>Raio-X</h1>
      <p className="suave">Entre para ver seus números.</p>

      <form onSubmit={entrar} className="cartao">
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </form>
    </div>
  );
}
