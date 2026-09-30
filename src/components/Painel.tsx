'use client';

import { useState } from 'react';
import Importar from './Importar';
import Lancamentos from './Lancamentos';

export default function Painel() {
  // muda depois de cada importação para a lista recarregar sozinha
  const [recarga, setRecarga] = useState(0);

  return (
    <>
      <Importar aoImportar={() => setRecarga((n) => n + 1)} />
      <Lancamentos recarga={recarga} />
    </>
  );
}
