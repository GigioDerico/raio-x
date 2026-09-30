# Raio-X

Painel pessoal de finanças que junta **Open Finance** e **faturas em PDF** no mesmo lugar, e responde a uma pergunta só: para onde foi o seu dinheiro este mês, e quanto disso você ainda podia escolher.

Feito para rodar na sua própria conta — um banco seu, suas chaves, seus dados. Não existe versão hospedada, e isso é de propósito.

> **Estado:** fatia 2 de 7 — importa faturas em PDF, categoriza, aprende suas correções e deixa editar, excluir e mudar em lote. Ainda não conecta banco (fatia 4) nem tem painel de análise (fatia 3). O plano completo está em [docs/plano-tecnico.md](docs/plano-tecnico.md).

## O que ele faz (quando pronto)

- Conecta seus bancos por Open Finance e traz lançamentos de cartão e conta corrente, com parcelas e faturas que vêm da própria instituição.
- Importa faturas em PDF para o histórico anterior à conexão — a API só entrega 12 meses.
- Aprende suas categorias: o que você corrige uma vez não é perguntado de novo.
- Separa compromisso de escolha, e mostra quanto do mês já estava decidido antes de começar.
- Escreve resumo e diagnóstico com a IA que **você** escolhe, pagando o que usar.

## Instituições suportadas

<!-- conectores:inicio -->

A lista é gerada a partir da própria API do Pluggy por `npm run conectores` e ainda não foi gerada neste repositório.

Enquanto isso: o app conecta qualquer instituição do Open Finance brasileiro que o Pluggy alcance — o que inclui Santander, Sicredi, Itaú, Nubank e Mercado Pago. A lista que vale é a que aparece na tela de conexão, porque vem da API na hora.

<!-- conectores:fim -->

## Rodando na sua conta

Você vai precisar de uma conta no [Neon](https://neon.tech) (banco), uma na [Vercel](https://vercel.com) (hospedagem), uma no [Pluggy](https://pluggy.ai) (Open Finance) e uma no [OpenRouter](https://openrouter.ai) (IA). Todas têm plano gratuito suficiente para uma pessoa, exceto a IA, que é paga por uso.

```bash
git clone https://github.com/<voce>/raio-x.git
cd raio-x
npm install

cp .env.example .env.local
npm run hash-senha        # gera APP_PASSWORD_HASH e SESSION_SECRET
# preencha DATABASE_URL e DATABASE_URL_UNPOOLED com as strings do Neon

npm run db:migrate        # cria o esquema
npm run dev               # http://localhost:3000
```

O app se recusa a subir com variável faltando ou com valor de exemplo — é proposital.

Durante o desenvolvimento:

```bash
npm test          # senha e cookie de sessão, sem precisar de banco
npm run typecheck
npm run build     # SKIP_ENV_VALIDATION=1 se não tiver .env.local
```

Uma observação que economiza meia hora: o `APP_PASSWORD_HASH` usa `:` como separador, e não `$`, porque o Next expande `$VAR` dentro dos arquivos `.env` — com `$` o hash chegaria mutilado e o login falharia sem dizer por quê.

## Segurança

Os dados aqui são sensíveis: cada compra sua, com data, valor e estabelecimento. Algumas decisões que valem ser ditas em voz alta:

- **CPF e nome do titular não são gravados.** O Pluggy entrega os dois; o app descarta. Um cartão é identificado por últimos quatro dígitos e pelo apelido que você dá.
- **Nenhuma chave vai para o navegador.** Não existe variável `NEXT_PUBLIC_`. Toda chamada ao Pluggy e à IA sai do servidor.
- **O PDF nunca sobe.** A extração roda no seu navegador; só o texto vai para a API.
- **O que vai para a IA passa por uma função só** (`src/lib/ia.ts`), que corta id, saldo, limite e número de conta. Ative a política de não-treinamento na sua conta do OpenRouter.
- **Nada de senha padrão.** Login é senha única, com espera crescente por IP.
- O CI roda varredura de segredos no histórico inteiro a cada push, e o roteiro de auditoria está em [docs/security-audit/](docs/security-audit/prompt-auditoria.md).

Achou um problema de segurança? Abra uma issue sem detalhe explorável e eu respondo para combinar o resto.

## Estrutura

```
drizzle/       migrações em SQL, aplicadas por scripts/migrar.ts
src/db/        esquema espelhado em TypeScript (tipos das consultas)
src/lib/       sessão, senha, deduplicação, extração de fatura, minimização para a IA
src/app/       rotas e telas (App Router)
src/components/ telas de importação e de lançamentos (cliente)
scripts/       hash de senha, testes e geração da lista de conectores
docs/          plano técnico e auditoria de segurança
```

## Licença

[AGPL-3.0-or-later](LICENSE). Use, modifique e hospede à vontade — se você hospedar uma versão modificada para outras pessoas, o código modificado também precisa ficar aberto.
