'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

export default function ErroPlano({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="o plano" reset={reset} />;
}
