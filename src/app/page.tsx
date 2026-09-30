import Painel from '@/components/Painel';
import { exigirUsuario } from '@/lib/sessao-servidor';

export const dynamic = 'force-dynamic';

export default async function Pagina() {
  await exigirUsuario();

  return (
    <main>
      <header className="topo">
        <div>
          <h1>Raio-X</h1>
          <p className="suave" style={{ margin: 0 }}>
            Fatia 2: faturas em PDF sobre o banco.
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="link">
            Sair
          </button>
        </form>
      </header>

      <Painel />
    </main>
  );
}
