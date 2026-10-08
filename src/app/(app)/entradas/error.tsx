'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

export default function ErroEntradas({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="as entradas" reset={reset} />;
}
