'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

export default function ErroDiagnostico({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="o diagnóstico" reset={reset} />;
}
