/** Marca do app: a lente que atravessa a fatura. */
export default function Lente({ tamanho = 30 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.4 15.4 21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7.6 11.8l1.9-2.6 1.9 2.1 2-3.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
