import Link from 'next/link';
import type { ConfigRenda } from '@/lib/calculos/plano';
import type { Previsto } from '@/lib/calculos/previsto';
import { rotuloMes } from '@/lib/filtro';
import { moeda0 } from '@/lib/formato';

type Props = { p: Previsto; cfg: ConfigRenda; hrefAjustes: string };

export default function ColunasPrevisto({ p, cfg, hrefAjustes }: Props): React.JSX.Element {
  const r = p.renda;
  const meses = `variável, média de ${p.meses} ${p.meses === 1 ? 'mês' : 'meses'}`;
  return (
    <div className="prev-grid">
      <section className="cartao prev-card">
        <h3>Pelo seu padrão</h3>
        <span className="sub">o que {rotuloMes(p.prox)} deve custar se nada mudar</span>
        <span className="prev-val">{moeda0(p.total)}</span>
        <div className="prev-bar" aria-hidden="true">
          <span style={{ width: `${p.padrao.parcelas}%`, background: 'var(--s-parcela)' }} />
          <span style={{ width: `${p.padrao.fixos}%`, background: 'var(--s-fixo)' }} />
          <span style={{ width: `${p.padrao.variavel}%`, background: 'var(--s-escolha)' }} />
          <span className="resto" style={{ width: `${p.padrao.vazio}%` }} />
        </div>
        <div className="prev-linhas">
          <div><span className="dot" style={{ background: 'var(--s-parcela)' }} />parcelas já compradas<b>{moeda0(p.parcelas)}</b></div>
          <div><span className="dot" style={{ background: 'var(--s-fixo)' }} />fixos que se repetem<b>{moeda0(p.fixos)}</b></div>
          <div><span className="dot" style={{ background: 'var(--s-escolha)' }} />{meses}<b>{moeda0(p.variavel)}</b></div>
        </div>
        {p.pctRenda !== null && (
          <p className="comp-nota">
            Equivale a <b>{(p.pctRenda * 100).toFixed(0)}%</b> da renda prevista.
          </p>
        )}
      </section>

      <section className="cartao prev-card">
        <h3>O que caberia na renda</h3>
        {r === null ? (
          <>
            <span className="sub">informe a renda prevista para calcular o teto</span>
            <p className="prev-vazio">
              Com a renda e a meta de poupança preenchidas, eu mostro quanto pode ir para gastos, quanto sobra para as
              escolhas do mês e quanto seria preciso cortar.
            </p>
            <Link href={hrefAjustes} className="botao">Informar renda em Ajustes</Link>
          </>
        ) : (
          <>
            <span className="sub">
              guardando {cfg.metaPoupanca}% de {moeda0(cfg.renda)}
            </span>
            <span className="prev-val">{moeda0(r.teto)}</span>
            <div className="prev-bar" aria-hidden="true">
              <span style={{ width: `${r.larguras.contratado}%`, background: 'var(--s-parcela)' }} />
              <span style={{ width: `${r.larguras.paraEscolhas}%`, background: 'var(--s-escolha)' }} />
              <span className="resto" style={{ width: `${r.larguras.vazio}%` }} />
            </div>
            <div className="prev-linhas">
              <div><span className="dot" style={{ background: 'var(--s-parcela)' }} />já contratado (parcelas + fixos)<b>{moeda0(r.compromissos)}</b></div>
              <div><span className="dot" style={{ background: 'var(--s-escolha)' }} />sobra para as escolhas do mês<b>{moeda0(r.paraEscolhas)}</b></div>
              {r.porSemana !== null && <div><span className="dot" />por semana<b>{moeda0(r.porSemana)}</b></div>}
              {r.porDia !== null && <div><span className="dot" />por dia<b>{moeda0(r.porDia)}</b></div>}
              <div><span className="dot" />guardado no mês<b>{moeda0(r.poupanca)}</b></div>
            </div>
            <div className={`veredito ${r.estado}`}>
              {r.veredito === 'compromissos-acima' ? (
                <>
                  Seus compromissos já passam do teto em <b>{moeda0(-r.disponivel)}</b>. Cortar o variável não resolve — aqui
                  o caminho é reduzir fixos ou não assumir novas parcelas.
                </>
              ) : r.veredito === 'cabe' ? (
                <>
                  O padrão cabe: sobram <b>{moeda0(r.sobra)}</b> de folga em cima do teto, mantendo os {cfg.metaPoupanca}%
                  guardados.
                </>
              ) : (
                <>
                  Para caber, o variável precisa cair de <b>{moeda0(p.variavel)}</b> para <b>{moeda0(r.paraEscolhas)}</b> — um
                  corte de <b>{moeda0(r.corte)}</b> ({(r.pctCorte * 100).toFixed(0)}%).
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
