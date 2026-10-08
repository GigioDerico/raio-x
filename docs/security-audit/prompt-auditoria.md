# Prompt de auditoria de segurança — cinco categorias

Prompt reutilizável para revisar este código atrás de falhas de segurança.

**Quando rodar:** no fim da fatia 4 (já com dado real passando pelo código) e novamente antes de o repositório virar público. Depois disso, a cada fatia.

**Mapeamento para esta stack** (Next.js App Router + Neon + Drizzle + Pluggy + OpenRouter):

| Categoria | Como se manifesta aqui | Onde olhar |
| --- | --- | --- |
| 1 · Banco sem tranca | Não há Supabase nem RLS: o isolamento é filtro manual por `user_id` da sessão | `src/lib/sessao-servidor.ts`, todas as consultas, `/api/overview`, `/api/export/csv` |
| 2 · Permissão no navegador | Sem papéis (um usuário). Vira "rotas que se defendem sozinhas" | `/api/cron/*` e `/api/webhook/*`, que não usam cookie |
| 3 · IDOR | Toda rota `[id]`. `select` seguido de `if` é o formato errado | `/api/txn/[id]`, `/api/accounts/[id]`, `/api/connections/[id]` |
| 4 · Chaves expostas | Repositório público: inclui o histórico do git, não só o estado atual | `.env.example`, `vercel.json`, workflows, bundle do front, `git log -p` |
| 5 · Inputs sem tratamento | O markdown que a IA devolve vira HTML no diagnóstico, no chat e no resumo | Componentes que renderizam resposta de modelo; qualquer `dangerouslySetInnerHTML` |

---

Revisa este código atrás de cinco falhas de segurança. Antes de começar, detecte a stack do projeto (linguagem, framework, ORM/query builder, mecanismo de auth, frontend, arquivos de deploy como Docker/CI/Helm/Terraform) e adapte cada categoria ao equivalente dessa stack:

1. **BANCO SEM TRANCA (isolamento de inquilino/dono)** — em Supabase é RLS ausente; em APIs próprias são queries de listagem/busca/agregação/relatório/exportação que não filtram pelo usuário autenticado ou pela organização/workspace/tenant ao qual ele pertence. Identifique primeiro QUAL é o mecanismo de isolamento do projeto (RLS, middleware de tenant, filtro manual por user_id, etc.) e aponte onde ele está ausente ou furado.

2. **PERMISSÃO DEFINIDA NO NAVEGADOR** — operações privilegiadas (admin, configurações, gestão de usuários, ações de escrita) em que o frontend esconde a UI por papel (isAdmin, canEdit, role...) mas o servidor NÃO faz a verificação equivalente. Cruze cada gate de papel do frontend com o endpoint correspondente e confirme se o backend valida o privilégio em toda rota sensível.

3. **IDOR** — rotas que buscam, alteram ou deletam um objeto por ID (path, query ou body) sem verificar se o objeto pertence ao usuário/tenant do chamador. Percorra sistematicamente TODOS os handlers de rota do backend, não amostras.

4. **CHAVES EXPOSTAS (hardcode)** — API keys, tokens, senhas, segredos de assinatura (JWT, webhooks), chaves privadas e credenciais padrão embutidos no código-fonte, configs, docker-compose, charts, CI, scripts e documentação. Atenção especial a defaults públicos que viram segredo real se não forem sobrescritos (ex: `${VAR:-valor-default}`) e à ausência de validação de startup que rejeite esses defaults. Verifique também o histórico git por segredos commitados e o bundle do frontend por chaves embutidas.

5. **INPUTS SEM TRATAMENTO (XSS)** — no frontend: innerHTML/dangerouslySetInnerHTML/equivalentes do framework (v-html, [innerHTML], dangerouslySet...), renderização de markdown/HTML sem sanitização, URLs controladas por usuário em href/src (javascript:), eval/new Function. No backend: input do usuário entrando em HTML de e-mails, templates ou respostas sem escape. Verifique se existe lib de sanitização no projeto e se ela é aplicada nos pontos encontrados.

## Regras da auditoria

- Reporte apenas achados verificados no código real. Nada de especulação. Para cada achado: caminho do arquivo, número(s) exato(s) da linha, trecho do código, por que é explorável e severidade (crítica/alta/média/baixa/informativa).
- Liste arquivo por arquivo, linha por linha.
- Registre também o que foi verificado e está CORRETO (ex: "router X valida posse em todos os handlers") — isso vira a seção de pontos fortes e prova a cobertura da auditoria.
- Quando a categoria não se aplicar à stack (ex: projeto sem frontend), diga isso explicitamente em vez de forçar achados.
- Note condições de explorabilidade (feature flags, config insegura necessária, etc.).

## Relatório em PDF

Depois da auditoria, gere um relatório em PDF, visualmente amigável, em pt-BR, salvo em `docs/security-audit/relatorio-auditoria-seguranca.pdf`, contendo:

a) **Capa**: título "Relatório de Auditoria de Segurança — \<nome do projeto\>", data, escopo auditado e nota metodológica (como cada categoria foi mapeada para a stack detectada).

b) **Resumo executivo**: total de achados por severidade, gráfico de rosca por severidade e gráfico de barras por categoria. Paleta: crítica `#B91C1C`, alta `#EA580C`, média `#D97706`, baixa `#2563EB`, ponto forte `#059669`.

c) **Pontos fortes** (o que está protegido, com evidência) e **pontos fracos** (os riscos centrais).

d) **Tabela de achados detalhados por categoria**: Severidade | Arquivo:linha | Descrição, com chip de severidade colorido.

e) **Recomendações priorizadas** (P1, P2, P3...).

f) Ao final do PDF, uma seção **"ISSUES PARA O GITHUB"**: para cada achado acionável, o texto COMPLETO de uma issue em Markdown, pronto para copiar e colar, dentro de um bloco delimitado (ex: entre `--- ISSUE n ---` e `--- FIM ISSUE n ---`). Cada issue deve conter:
   - Título no formato "[Segurança] \<descrição curta da falha\>"
   - Labels sugeridas: security + severidade
   - Descrição do problema e por que é explorável
   - Evidência: arquivo:linha com trecho de código
   - Impacto
   - Sugestão de correção
   - Critérios de aceite (checklist verificável)

   Agrupe achados triviais relacionados numa issue única quando fizer sentido (ex: vários defaults de segredo no mesmo tema), para não gerar spam de issues.

## Geração do PDF — regras técnicas

- Não instale nada globalmente. Use ambiente isolado (venv Python com reportlab+matplotlib, ou ferramenta equivalente da stack local; se houver navegador headless/wkhtmltopdf/pandoc disponível, HTML→PDF também vale).
- Deixe o script gerador em `docs/security-audit/` para regerar o relatório depois.
- Verifique o PDF gerado: número de páginas, renderização dos gráficos e legibilidade das tabelas (rasterize as páginas se possível). Corrija defeitos visuais antes de entregar.
- Páginas A4, margens ~2cm, cabeçalho/rodapé com nome do relatório e número de página.

## Entregáveis

O relatório em PDF, a lista de achados no chat (arquivo por arquivo, linha por linha) e o caminho de todos os arquivos gerados.

---

## Categorias extras deste projeto

Não fazem parte do prompt padrão, mas devem ser verificadas junto:

- **Força bruta no login.** Senha única em app exposto na internet pede limite de tentativa por IP e espera crescente. Implementado em `src/lib/auth.ts` + tabela `login_attempt`.
- **Replay de webhook.** `/api/webhook/pluggy` aceita POST sem sessão. Além da assinatura, guardar o id do evento e ignorar repetido.
- **Minimização do que vai para a IA.** Confirmar que todo prompt atravessa `paraIA()` em `src/lib/ia.ts` e que nenhum id, saldo, limite, CPF ou nome de titular escapa nela.
- **CPF e titular não gravados.** `account` não tem coluna para `taxNumber` nem `owner`; conferir que nenhuma migração futura os reintroduziu.
