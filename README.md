# ⚡ Raio-X

> **Painel pessoal de inteligência financeira que junta Open Finance brasileiro e faturas em PDF em um só lugar.**  
> Responde a uma pergunta essencial com honestidade: **para onde foi o seu dinheiro este mês, e quanto disso você ainda podia escolher?**

100% privado, auto-hospedável, sem mensalidades de plataforma e feito para rodar na sua própria infraestrutura: seus bancos, suas chaves, seus dados.

---

## ✨ Destaques do Projeto

- 🏦 **Open Finance Brasileiro (Pluggy):** Conecte contas correntes e cartões de crédito dos principais bancos (Itaú, Nubank, Santander, Sicredi, Mercado Pago e outros). Suporta conexão direta ou via portal gratuito [Meu Pluggy](https://meu.pluggy.ai).
- 📄 **Leitura de Faturas em PDF:** Importe PDFs históricos ou de bancos não conectados. A extração é feita localmente no navegador via `pdf.js` — **seu arquivo PDF nunca é enviado para servidores externos**.
- 🧠 **IA com Custo Zero via Assinatura Local:** Conecte diretamente aos CLIs locais do **Claude Code** (Claude Pro/Max) ou **Codex CLI** (ChatGPT Plus) autenticados na sua máquina com R$ 0,00 de cobrança extra por tokens, visualizando cota e consumo da sessão em tempo real.
- ☁️ **IA Multi-Provedor Cloud:** Se preferir chaves de API, conecte facilmente com **Anthropic Claude**, **OpenAI GPT** ou **OpenRouter** diretamente pela interface ou pelo assistente CLI `npm run setup:ia`.
- 📊 **Painel com Foco em Escolhas:** Separa despesas fixas/compromissadas de escolhas discricionárias. Você vê exatamente quanto sobrou para decidir antes do dia 1.
- 🎯 **Plano de 3 Meses & Parcelas Futuras:** Projeção clara de fluxo de caixa, parcelamentos que vencem nos próximos meses e metas sem regras rígidas de orçamento.
- 🛡️ **Privacidade & Segurança por Design:** 
  - CPF, agência e dados de titulares são descartados na ingestão.
  - Sanitização automática anti-vazamento de dados pessoais antes de qualquer prompt de IA.
  - Autenticação com senha única em hash `scrypt` com proteção progressiva contra força bruta.
  - Zero variáveis públicas expostas (`NEXT_PUBLIC_`).

---

## 🧭 Mapa de Funcionalidades

| Área | O que você encontra |
| --- | --- |
| **Painel do Mês** | Total consolidado, comparativo com meses anteriores, ranking de categorias e projeção até o fechamento. |
| **Lançamentos** | Lista unificada de transações (cartões e contas correntes), edição de nomes aprendida, exclusão lógica e marcação "Não conta" para transferências próprias. |
| **Parcelas** | Visão de compromissos futuros: parcelamentos ativos mês a mês e o previsto já contratado. |
| **Plano (3 Meses)** | Diagnóstico do seu ritmo de gastos, sugestão de metas por IA e acompanhamento trimestral. |
| **Conexões** | Painel dos bancos conectados via Open Finance, com status de saúde do conector e botão de atualização sob demanda. |
| **Ajustes** | Configuração de renda, modelo de IA ativo, seleção de método (Assinatura Local ou API Cloud), exportação em CSV e destruição segura de dados. |

---

## 🛠️ Tecnologias Utilizadas

- **Framework:** Next.js 15 (App Router, Server Components & Server Actions)
- **Linguagem:** TypeScript 5 (com validação estrita e Zod)
- **Estilização:** CSS Vanilla com Design System próprio (modo claro/escuro automático)
- **Banco de Dados:** PostgreSQL 16 (hospedado no [Neon Serverless](https://neon.tech))
- **ORM:** Drizzle ORM com migrações declarativas
- **Open Finance:** Pluggy API / Meu Pluggy Widget
- **Inteligência Artificial:** Claude Code CLI, Codex CLI, Anthropic SDK, OpenAI API, OpenRouter
- **Parsing de Documentos:** `pdfjs-dist` rodando no cliente

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- **Node.js** >= 22.9
- Conta gratuita no [Neon](https://neon.tech) para o banco PostgreSQL
- *(Opcional)* Credenciais da [Pluggy](https://pluggy.ai) para Open Finance
- *(Opcional)* Claude Code CLI (`npm i -g @anthropic-ai/claude-code`) ou Codex CLI instalado no terminal

### 1. Clonar e Instalar
```bash
git clone https://github.com/GigioDerico/raio-x.git
cd raio-x
npm install
```

### 2. Configurar o Ambiente
Copie o arquivo de exemplo:
```bash
cp .env.example .env.local
```

Gere a senha de acesso e a chave de sessão do app:
```bash
npm run hash-senha
```
*Copie os valores gerados de `APP_PASSWORD_HASH` e `SESSION_SECRET` para o seu `.env.local`.*

Configure as strings de conexão do banco de dados no `.env.local`:
```env
DATABASE_URL="postgresql://usuario:senha@host/banco?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://usuario:senha@host-pooler/banco?sslmode=require"
```

### 3. Configurar a IA
Você pode escolher a forma mais conveniente:

- **Via Assinatura Local (Sem custo):** Basta ter o `claude` ou `codex` logado no terminal do seu computador (`claude login` ou `codex login`). O app detectará automaticamente na tela de **Ajustes**!
- **Via Assistente de Terminal:** Execute:
  ```bash
  npm run setup:ia
  ```
- **Pela Interface Web:** Em `/ajustes`, selecione a aba desejada (Claude Code, Codex, Anthropic, OpenAI ou OpenRouter) e conecte com 1 clique.

### 4. Executar Migrações e Iniciar
```bash
npm run db:migrate
npm run dev
```
Acesse [http://localhost:3000](http://localhost:3000) e faça login com a senha que você definiu.

---

## ☁️ Onde e Como Hospedar (Deploy)

Você tem duas opções principais para colocar o Raio-X no ar:

### Opção 1: Vercel (Recomendado para praticidade)
Ideal se você quer **zero manutenção**, deploy contínuo via GitHub e crons automáticos sem pagar nada.

1. Suba seu repositório no GitHub.
2. Importe o projeto no painel da [Vercel](https://vercel.com).
3. Preencha as variáveis de ambiente do `.env.local` nas configurações do projeto na Vercel (`Settings` → `Environment Variables`).
4. Clique em **Deploy**.
5. O arquivo `vercel.json` já inclui a configuração de sincronização automática diária (`/api/cron/sync`).

> **Nota sobre IA na Vercel:** Como a Vercel roda em ambiente serverless na nuvem, ela não tem acesso ao terminal do seu Mac local. Para chamadas de IA na Vercel, configure uma chave de API (OpenRouter, Anthropic ou OpenAI). Se você quiser usar a assinatura local do Mac a custo zero, execute o app localmente com `npm run dev`.

### Opção 2: VPS Própria (Docker ou Node.js / PM2)
Ideal se você prefere manter o controle total da infraestrutura em um servidor Linux (Ubuntu/Debian com Nginx e SSL):

1. Clone o repositório na VPS e instale as dependências com `npm install`.
2. Configure o `.env.local` e rode `npm run db:migrate`.
3. Gere o build de produção:
   ```bash
   npm run build
   ```
4. Inicie com um gerenciador de processos como o **PM2**:
   ```bash
   pm2 start npm --name "raio-x" -- run start
   ```
5. Aponte um reverse proxy (Nginx ou Caddy) com HTTPS para a porta `3000`.

---

## 🧭 Como Funciona o Fluxo Após Subir o App (Pós-Deploy)

Depois que o app estiver rodando (na Vercel ou na sua VPS), o fluxo de ativação é direto e leva menos de 5 minutos:

```mermaid
flowchart LR
    S1["🟢 Passo 1<br><b>Acesso /login</b><br>Entrar com sua senha mestra"] 
    --> S2["🏦 Passo 2<br><b>Open Finance & PDF</b><br>Conectar Nubank, Itaú, etc."] 
    --> S3["🎯 Passo 3<br><b>Definir Renda</b><br>Ativar margem de escolha"] 
    --> S4["✨ Passo 4<br><b>Painel Ativo</b><br>Sync diário automático"]
```

1. **Acesso Restrito:** Vá direto na rota `/login` (ela é privada e não há botões públicos de login na landing page). Entre com a senha configurada no seu `APP_PASSWORD_HASH`.
2. **Conectar Contas:** Na aba **Conexões**, conecte seus bancos pelo Meu Pluggy (Open Finance gratuito). Se tiver cartões não suportados ou faturas passadas, arraste o `.pdf` na aba **Lançamentos** (leitura 100% local e privada).
3. **Definir Renda Mensal:** Na aba **Ajustes**, informe sua renda mensal líquida. Isso ativa o cálculo de `% da renda comprometida` e separa os gastos **Decididos** (fixos + parcelas) da sua **Margem de Escolha**.
4. **Ajuste Fino:** Ao renomear estabelecimentos na lista de lançamentos, o app aprende e aplica para todos os lançamentos futuros automaticamente.
5. **Rotina Zero Manutenção:** O cron da Vercel (`/api/cron/sync`) roda todo dia às 09:00 e sincroniza novas compras automaticamente.

Consulte o guia completo em [docs/fluxo-configuracao.md](docs/fluxo-configuracao.md).

---

## 🇧🇷 Guia de Configuração do Meu Pluggy (Open Finance Gratuito)

O [Meu Pluggy](https://www.pluggy.ai/meu-pluggy) permite conectar até 5 bancos (Nubank, Itaú, Santander, Inter, BB, etc.) com **API gratuita e sem prazo de expiração** para uso pessoal.

### O Pulo do Gato: Entendendo os 2 Sites

| Ambiente | O que fazer nele |
| :--- | :--- |
| **`meu.pluggy.ai`** | **Onde os bancos se conectam:** Você cria a conta de usuário e autoriza seus bancos via Open Finance no app do banco. |
| **`dashboard.pluggy.ai`** | **Onde a API é gerada:** Você cria uma aplicação, copia as chaves `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` e faz a ponte. |

### Fluxo de Conexão em 6 Passos:

```mermaid
sequenceDiagram
    autonumber
    actor Voce as Você
    participant MP as meu.pluggy.ai
    participant Banco as Seu Banco (Open Finance)
    participant Dash as dashboard.pluggy.ai
    participant RaioX as Seu Raio-X

    Voce->>MP: 1. Cria conta gratuita no meu.pluggy.ai
    Voce->>MP: 2. Clica em "Conectar Minha Conta" e autoriza no app do banco
    Banco->>MP: Contas conectadas com sucesso (100% somente leitura)
    Voce->>Dash: 3. Cria conta no dashboard.pluggy.ai
    Voce->>Dash: 4. Cria uma Aplicação (ex: "Raio-X")
    Voce->>Dash: 5. Copia PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET
    Voce->>Dash: 6. Na Aplicação: Conectar Conta -> Escolhe "MeuPluggy" (e faz login)
    Voce->>RaioX: Salva as chaves no .env.local ou na Vercel
    RaioX->>Dash: Sincronização diária automática ativa!
```

> ⚠️ **Atenção no Passo 6 (Onde muitos erram):** Dentro do Dashboard, ao conectar a conta na sua aplicação, **NÃO escolha o seu banco e NÃO escolha Sandbox**. Escolha o conector chamado **"MeuPluggy"** e faça login com a conta do `meu.pluggy.ai`. É esse conector que faz a ponte para liberar os dados para o Raio-X!

Consulte o passo a passo com prints e detalhes em [docs/guia-meu-pluggy.md](docs/guia-meu-pluggy.md).

---

## 📱 Acesso no Celular (Como App PWA)

O Raio-X foi planejado para uso em telas mobile de 390px, com menu inferior rápido e responsividade nativa. Você pode utilizá-lo como um aplicativo no seu smartphone:

- **No iPhone (iOS / Safari):** Abra o endereço do seu app, toque no ícone de **Compartilhar** e selecione **"Adicionar à Tela de Início"**.
- **No Android (Chrome):** Toque no menu de opções (três pontos) e selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.

O app abrirá em tela cheia, sem barra de endereços, com o mesmo visual e fluidez de um app nativo.

---

## 🔒 Compromisso de Segurança e Privacidade

- **Minimização de Dados:** O app não armazena saldos de conta corrente após o cálculo, nem números de agência ou CPF.
- **Sanitização de IA:** Lançamentos passam por uma camada de limpeza que ofusca identificadores de transações sensíveis antes de qualquer processamento por LLMs.
- **Isolamento de Processos CLI:** Quando executado via terminal local, o Claude Code roda com o parâmetro `--tools ""` (modo somente consulta, sem permissão para executar comandos shell ou editar arquivos no seu computador).
- **Sem Rastreamento de Terceiros:** Não há Google Analytics, Mixpanel ou scripts de telemetria externa instalados.

---

## 🧪 Testes e Validação de Código

Para validar a integridade da aplicação:

```bash
# Validação de tipos do TypeScript
npm run typecheck

# Suíte de testes unitários (regras de negócio, segurança e cálculo)
npm test
```

---

## 📄 Licença

Distribuído sob a licença **AGPL-3.0-or-later**. Consulte o arquivo [LICENSE](LICENSE) para mais informações.
