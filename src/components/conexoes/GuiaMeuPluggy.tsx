import ConectarBanco from '@/components/ajustes/ConectarBanco';
import { CONECTOR_MEU_PLUGGY, URL_MEU_PLUGGY } from '@/lib/pluggy/meu-pluggy';

type Props = { titulo: string; temMeuPluggy: boolean };

/**
 * O caminho que funciona hoje para pessoa física: conectar os bancos no Meu
 * Pluggy e trazê-los para cá pelo conector MeuPluggy. O "Conectar banco" comum
 * fica como alternativa, sem destaque.
 */
export default function GuiaMeuPluggy({ titulo, temMeuPluggy }: Props) {
  return (
    <section className="cartao ajustes-bloco guia-meu-pluggy" aria-labelledby="guia-meu-pluggy-titulo">
      <h2 id="guia-meu-pluggy-titulo">{titulo}</h2>
      <ol className="guia-passos">
        <li>
          <strong>Conecte seus bancos no Meu Pluggy.</strong>
          <span className="suave">
            Entre com seu e-mail, toque em “Conectar conta” e escolha o banco. A autorização é feita no app do próprio banco, pelo Open Finance — só leitura.
          </span>
          <a className="botao secundario" href={URL_MEU_PLUGGY} target="_blank" rel="noopener noreferrer">
            Abrir o Meu Pluggy <span aria-hidden="true">↗</span>
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </li>
        <li>
          <strong>Volte aqui e traga as contas.</strong>
          <span className="suave">Entre com a mesma conta do Meu Pluggy na janela que abrir. Os cartões e contas chegam em seguida.</span>
          <ConectarBanco conectorId={CONECTOR_MEU_PLUGGY} rotulo="Conectar pelo Meu Pluggy" />
        </li>
        <li>
          <strong>Banco novo depois?</strong>
          <span className="suave">
            {temMeuPluggy
              ? 'Conecte no Meu Pluggy e toque em “Atualizar agora” na conexão MeuPluggy acima. Se ele não aparecer, conecte pelo Meu Pluggy de novo — os cartões já trazidos não duplicam.'
              : 'Conecte no Meu Pluggy e depois atualize a conexão aqui.'}
          </span>
        </li>
      </ol>
      <p className="suave guia-rodape">
        A autorização pode ser revogada a qualquer momento no app do banco ou no Meu Pluggy. O Raio-X nunca vê sua senha e não paga nem transfere nada.
      </p>
      <details className="guia-outro">
        <summary>Conectar um banco direto, sem o Meu Pluggy</summary>
        <p className="suave">Abre a lista completa de instituições do Pluggy, sem passar pelo Meu Pluggy.</p>
        <ConectarBanco rotulo="Conectar banco direto" secundario />
      </details>
    </section>
  );
}
