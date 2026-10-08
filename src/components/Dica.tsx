'use client';

import { useId, useState } from 'react';

/**
 * Botão "i" que abre uma explicação curta. É um botão, não um `title`: no
 * celular não existe passar o mouse, e o `title` nunca aparece. Abre por toque
 * ou teclado, fecha ao sair do foco ou com Esc.
 */
export default function Dica({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();

  return (
    <span className="dica" onBlur={() => setAberta(false)}>
      <button
        type="button"
        className="dica-botao"
        aria-label={rotulo}
        aria-expanded={aberta}
        aria-controls={id}
        onClick={() => setAberta((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAberta(false);
        }}
      >
        i
      </button>
      {/* role=status: o leitor de tela lê o texto quando ele aparece */}
      <span id={id} role="status" className="dica-texto" hidden={!aberta}>
        {children}
      </span>
    </span>
  );
}
