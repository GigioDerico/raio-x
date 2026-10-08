import type { Falha } from '@/lib/falha';

/** Erro em linha. Sessão expirada ganha o caminho para entrar de novo. */
export default function AvisoDeFalha({ falha }: { falha: Falha }) {
  return (
    <p className="erro" role="alert">
      {falha.texto}
      {falha.tipo === 'sessao' && (
        <>
          {' '}
          <a href="/login">Entrar</a>
        </>
      )}
    </p>
  );
}
