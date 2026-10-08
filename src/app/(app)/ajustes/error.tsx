'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

export default function ErroAjustes({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="os ajustes" reset={reset} />;
}
