'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ASSINA, COMIDAS, OBJETIVOS, RITMOS, type Prefs } from '@/lib/calculos/plano';

type Props = { prefs: Prefs; categorias: string[]; query: string; rotulo: string; secundario?: boolean };

const ROTULOS_RITMO = Object.fromEntries(Object.entries(RITMOS).map(([k, v]) => [k, v.rotulo]));

export default function QuestionarioPlano({ prefs, categorias, query, rotulo, secundario }: Props) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [intocaveis, setIntocaveis] = useState<string[]>(prefs.intocaveis);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const intoc = fd.getAll('intocaveis').map(String);
    const novas: Prefs = {
      objetivo: String(fd.get('objetivo') || 'guardar'),
      ritmo: String(fd.get('ritmo') || 'equilibrado'),
      intocaveis: intoc,
      cortar: fd.getAll('cortar').map(String).filter((c) => !intoc.includes(c)),
      comida: String(fd.get('comida') || 'misto'),
      assinaturas: String(fd.get('assinaturas') || 'nao_uso'),
      evento: String(fd.get('evento') || '').slice(0, 120),
    };
    setEnviando(true);
    setErro('');
    try {
      const r = await fetch(`/api/plan?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefs: novas }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(r.status === 400 || r.status === 404 ? d?.detalhe || 'resposta inválida' : 'não consegui montar o plano, tente de novo');
        return;
      }
      dialogo.current?.close();
      router.refresh();
    } catch {
      setErro('não consegui montar o plano, tente de novo');
    } finally {
      setEnviando(false);
    }
  }

  const grupo = (nome: keyof Prefs, opcoes: Record<string, string>, atual: string) =>
    Object.entries(opcoes).map(([k, v]) => (
      <label className="opc" key={k}>
        <input type="radio" name={nome} value={k} defaultChecked={k === atual} />
        <span>{v}</span>
      </label>
    ));

  return (
    <>
      <button type="button" className={secundario ? 'link' : undefined} onClick={() => {
          setErro('');
          dialogo.current?.showModal();
        }}>
        {rotulo}
      </button>
      <dialog ref={dialogo} className="dialogo-plano" aria-labelledby="quest-titulo">
        <form onSubmit={enviar}>
          <h2 id="quest-titulo">Como é a sua rotina?</h2>
          <p className="suave">Quanto mais preciso aqui, menos o plano vira promessa vazia. Leva meio minuto.</p>
          <fieldset className="perg">
            <legend>O que você quer com este plano</legend>
            {grupo('objetivo', OBJETIVOS, prefs.objetivo)}
          </fieldset>
          <fieldset className="perg">
            <legend>Ritmo do corte</legend>
            {grupo('ritmo', ROTULOS_RITMO, prefs.ritmo)}
          </fieldset>
          <fieldset className="perg">
            <legend>Não mexer nestas categorias</legend>
            <div className="chips-sel">
              {categorias.map((c) => (
                <label className="chip-sel" key={c}>
                  <input
                    type="checkbox"
                    name="intocaveis"
                    value={c}
                    defaultChecked={prefs.intocaveis.includes(c)}
                    onChange={(e) => setIntocaveis((xs) => (e.target.checked ? [...xs, c] : xs.filter((x) => x !== c)))}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="perg">
            <legend>Pode cortar fundo nestas</legend>
            <div className="chips-sel">
              {categorias.map((c) => (
                <label className="chip-sel" key={c}>
                  {/* intocável não pode ser cortada: travada aqui; desabilitada, não vai no envio */}
                  <input type="checkbox" name="cortar" value={c} defaultChecked={prefs.cortar.includes(c)} disabled={intocaveis.includes(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="perg">
            <legend>Comida no dia a dia</legend>
            {grupo('comida', COMIDAS, prefs.comida)}
          </fieldset>
          <fieldset className="perg">
            <legend>Assinaturas</legend>
            {grupo('assinaturas', ASSINA, prefs.assinaturas)}
          </fieldset>
          <label className="perg">
            <span className="perg-t">Algo grande nos próximos 3 meses?</span>
            <input type="text" name="evento" defaultValue={prefs.evento} maxLength={120} placeholder="viagem, mudança, matrícula, IPVA… (opcional)" />
          </label>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <div className="dialogo-acoes">
            <button type="button" className="link" onClick={() => dialogo.current?.close()}>Cancelar</button>
            <button type="submit" disabled={enviando}>{enviando ? 'Montando o plano…' : rotulo}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
