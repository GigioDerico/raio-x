/**
 * Ícones da barra inferior do celular. Desenhados à mão no mesmo traço da
 * Lente, em vez de uma biblioteca: são cinco, e a CSP não carrega nada de fora.
 */

type P = { tamanho?: number };

function Svg({ tamanho = 22, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Painel: barras de um gráfico. */
export function IconePainel(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 20V11M10 20V5M16 20v-7M22 20H2" />
    </Svg>
  );
}

/** Lançamentos: lista. */
export function IconeLancamentos(p: P) {
  return (
    <Svg {...p}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </Svg>
  );
}

/** Parcelas: calendário com meses à frente. */
export function IconeParcelas(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
    </Svg>
  );
}

/** Plano: alvo. */
export function IconePlano(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" />
    </Svg>
  );
}

/** Mais: três pontos. */
export function IconeMais(p: P) {
  return (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Svg>
  );
}
