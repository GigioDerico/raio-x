'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

export default function ErroParcelas({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="as parcelas" reset={reset} />;
}
