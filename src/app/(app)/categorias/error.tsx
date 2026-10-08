'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

export default function ErroCategorias({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="as categorias" reset={reset} />;
}
