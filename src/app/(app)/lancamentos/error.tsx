'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

export default function ErroLancamentos({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="os lançamentos" reset={reset} />;
}
