# Estado atual — Redator

## Fundamentos do Radar visíveis nos três ambientes — 2026-09-19

- **Implementado:** `radarFoundationsOf` (`lib/redator/radar-foundations.ts`)
  projeta `importedContext.dossier` para leitura humana; o painel
  `WriterRadarFoundationsPanel` aparece no artigo (lado direito) e, no roteiro
  e no carrossel, ocupa o painel direito enquanto nenhuma cena/slide está
  selecionado. Recomendação editorial, razões, pesquisa YouTube (consultas,
  vídeos, long-form × shorts), blueprint multimodal, SERP/evidências,
  limitações, `writerMayNot` e `mustAnswer/mustCover` quando existirem.
- **Fronteiras:** `editorialOutput` é recomendação, não gate; o dossiê não é
  duplicado no entregável; sem provider, IA ou migration.
- **Pendente:** homologação manual do USER (abrir o roteiro de "skin care
  noturno" e conferir o painel). Semear cenas a partir do blueprint fica fora
  deste corte. Relatório:
  `auditorias/relatorio-redator-dossier-surface-2026-09-19.md`.

## OAuth 2.1 para o MCP do Redator — fase 1 implementada localmente, 2026-09-19

- **SDD:** `propostas/sdd-oauth-mcp-redator-2026-09-19.md`, aprovada para
  implementação com D1 = grant multi-Marca. D2 a D5 seguem as recomendações da
  SDD (qualquer usuário com `redator:view` consente; bearer `mk_mcp_` só
  atrás de `MCP_ALLOW_REMOTE_BEARER`; hook de `aud` e painel da Agência ficam
  para a fase 4).
- **Verificado no código:** metadata RFC 9728 em
  `/.well-known/oauth-protected-resource[/api/mcp/redator]` (rewrite do
  `next.config.ts` para `app/api/oauth/protected-resource`); 401 do MCP com
  `WWW-Authenticate: Bearer resource_metadata=...` quando `MCP_OAUTH_ENABLED`;
  verificação de JWT do Supabase (`lib/server/mcp-oauth.ts`, `getClaims` +
  `iss` + `client_id`); principal único para bearer e OAuth
  (`lib/server/writer-mcp-principal.ts`); grants por (usuário, cliente, Marca)
  em `lib/server/writer-mcp-grants.ts`; página `/oauth/consent` com escolha
  de Marcas e escopos gravada antes de `approveAuthorization`; autoatendimento
  em `/conta` (seção Conexões de IA, `/api/oauth/grants`). As ferramentas
  passam a resolver a Marca pelo documento ou por `brandId`;
  `get_writer_connection_profile` lista as Marcas e devolve `consentUrl`
  quando não há grant.
- **Confirmado por teste:** `test:redator:mcp` 42/42 (token ES256 assinado no
  teste com JWKS injetado, sem rede; metadata; boundary HTTP com e sem OAuth;
  protocolo multi-Marca; preflight), `test:redator` 266/266, `test:mcp:runtime`
  5/5; TypeScript sem erros; ESLint limpo nos arquivos tocados.
- **Validado no dev server local (sem OAuth ligado):** `.well-known` responde
  JSON `oauth_disabled` 404 pelo rewrite, `/oauth/consent` 404, POST
  `initialize` sem token 401 com realm legado, `health` já expõe o issuer
  derivado de `NEXT_PUBLIC_SUPABASE_URL`.
- **Migration M7 aplicada remotamente em 2026-09-19** (`db query --linked -f` + `migration repair --status applied`; preflight 7/7 PASS, post-verifier 12/12 PASS, 0 grants, 6 eventos e 3 delegações preservados):
  `20260919120000_m7_writer_mcp_oauth_grants.sql` (tabela `writer_mcp_grants`,
  coluna `writer_mcp_call_events.grant_id`, CHECK de principal único), com
  preflight e post-verifier em `supabase/scripts/2026-09-19-m7-*` e rollback
  condicionado a tabela vazia em `supabase/rollback/`.
- **Fase 2 concluída em 2026-09-19 (REMOTE VERIFIED por GET público):** após redeploy na Vercel com `MCP_OAUTH_ENABLED=true` e `MCP_ALLOW_REMOTE_BEARER=false`, `/.well-known/oauth-protected-resource/api/mcp/redator` responde 200 com `authorization_servers` = issuer do Supabase, o 401 do MCP traz `resource_metadata`, e o `health` mostra `authMode: oauth_supabase`, `oauthEnabled: true`, `remoteBearerAllowed: false`. Preflight: os três checks do recurso passam; restam só os sete do servidor de autorização.
- **Fase 4 implementada localmente em 2026-09-19 (Verificado no código / Confirmado por teste):** painel "MCP do Redator" da Agência reescrito em `modules/conta/agency-mcp-panel.tsx`: estado medido `OAuth pronto / Pendente (motivo) / Desativado` a partir da discovery do Supabase (`readMcpOAuthReadiness`, cache 60 s), checklist da plataforma (HTTPS, metadata, servidor de autorização) com InfoHint, passo a passo para ChatGPT, Claude e outro cliente MCP com InfoHint nos termos, aplicativos registrados com `Conectado / Aguardando login / Aguardando OAuth / Removido`, tabela "Acessos autorizados" (grants) com revogar e reativar pela Agência, auditoria com origem OAuth ou bearer, e o bearer relegado a "Diagnóstico interno", oculto sem `MCP_ALLOW_REMOTE_BEARER` (a API responde `409 MCP_BEARER_DISABLED`). O consentimento passa a pré-marcar as permissões sugeridas pela Agência e liga o grant ao aplicativo registrado (`provider_connection_id`), tirando-o de `pending`. Testes: `test:redator:mcp` 46/46, `test:redator` 282/282. **Interface não validada manualmente**: a página exige sessão e a homologação em navegador é do usuário.
- **Ainda não verificado:** OAuth Server do Supabase (fase 0; discovery continua `feature_disabled`),
  login e consentimento pelo ChatGPT com
  readback de grant e eventos (fase 3), painel da Agência (fase 4).
  `MCP_OAUTH_DISCOVERY = BLOCKED` (preflight 2026-09-19), `CHATGPT_CONNECTION`,
  `AUTHENTICATED_READ_WRITE` e `MCP_GRANT_REVOCATION` = `PENDING`.
- **Pré-existente, fora deste corte:** `check:visual-system` falha em
  `modules/arquiteto/territorial-workspace-rows.tsx:181` (comentário com a
  palavra proibida); `test:authz` mantém as 2 falhas estáticas do
  `arquiteto-workspace.tsx` registradas na revisão de 2026-09-02.

## Biblioteca editorial unificada com Publicações — 2026-09-18

- **Defeito encontrado na auditoria:** `publications-workspace.tsx` montava as
  linhas de `operationalPublications` + briefings legados e **nunca lia
  `content_documents`**. Com 1 documento e 0 registros de publicação, a
  biblioteca ficava vazia enquanto o Redator mostrava o artigo — a lista de
  rascunhos do Redator virava uma biblioteca paralela implícita.
- **Correção — projeção, não cópia.** `lib/publicacoes/editorial-library.ts` é
  puro e devolve **uma linha por documento**, enriquecida pelo
  `PublicationRecord` quando ele existir. O `id` da linha é o `documentId`:
  duplicar é estruturalmente impossível. Nenhuma tabela nova, nenhuma cópia.
  Estados: `RASCUNHO` · `PRONTO` (`status='aprovado'`) · `PUBLICADO` (registro
  em `published`, que vence o estado do documento).
- **Publicações:** a aba Biblioteca projeta o documento e cada linha abre
  `/{brandRef}/redator?documentId=…` — a rota já aceitava o parâmetro. Fila,
  Publicados e Atualizações seguem lendo registros, intocadas.
- **Redator:** a barra global ficou com `actions: null` — estado, palavras, tela
  cheia e o atalho de Publicações saíram. Entrou a **toolbar do documento**
  abaixo das abas, com `[Status] · palavras · Salvo no servidor às HH:mm:ss ·
  [Tela cheia] [Salvar rascunho] [Finalizar artigo]`. O rodapé perdeu os dois
  controles concorrentes de aprovação e manteve `Enviar a Publicações`.
- **`Salvar rascunho`** reusa o autosave (flush imediato), não abre segundo
  caminho de gravação, e **não cria versão** — `createVersion` fica desligado em
  rascunho. O horário só aparece quando o servidor confirma.
- **`Finalizar artigo`** reusa `requestStatus("aprovado")` com o gate do
  Guardião: muda o estado do mesmo documento, não publica e não copia.
- **`documentUpdatedAt`** passou a ser guardado no contexto — o `updatedAt`
  remoto já vinha na leitura e era descartado.
- **Confirmado por teste:** `tests/redator-publicacoes-biblioteca.test.mts`
  14/14. `tsc` limpo; `test:redator` **60/60**; `test:radar` 2236/2236;
  `test:editorial` 60/64 e `operational-flow` 41/51 — **as mesmas falhas
  pré-existentes**, zero regressões. Duas asserções de UI em
  `operational-flow` foram atualizadas porque descreviam a barra antiga.
- **Pendente:** homologação manual — F5, segunda aba e segundo navegador.
  **É do usuário.**
- **Relatório:** `docs/00-produto/auditorias/biblioteca-editorial-unificada-2026-09-18.md`.

## M2 aplicada e verificada — 2026-09-18

- **`M2_DDL_APPLIED = YES`**, aplicada por
  `npx supabase db query --linked -f supabase/migrations/20260918190100_m2_writer_version_lifecycle.sql`
  e registrada por `migration repair`. **`db push` não pode ser usado neste
  projeto** — ver o achado de histórico abaixo.
- **Readback do schema efetivo:** as 7 colunas de lifecycle existem e são
  nuláveis; `writer_deliverables.current_version_id` com FK `RESTRICT`; os dois
  `previous_version_id` viraram `SET NULL`; os CHECKs exigem
  `purge_after = superseded_at + '48:00:00'`; a trigger retention-aware está
  **só** nas duas tabelas do Redator. `editorial_artifact_versions` e mais cinco
  tabelas de módulos anteriores seguem na função append-only **original e
  incondicional**. RLS e grants sem regressão. **Zero linha** ficou marcada como
  substituída pela aplicação.
- **Prova funcional com fixture isolada (nada persistiu):** artigo, roteiro e
  carrossel testados separadamente — segunda versão vira corrente, a primeira
  recebe `superseded_by`, `superseded_at` e `purge_after = superseded_at + 48h`;
  salvar conteúdo idêntico **não** cria versão nem move a janela; repetir a
  marcação é idempotente. Recusados: marcar a corrente
  (`retention_self_supersede`), sucessor que não é a corrente, e outra marca.
- **Autoridade da versão corrente de roteiro/carrossel passou a ser
  `writer_deliverables.current_version_id`**, e não mais `max(version_number)`.
  `writerRetentionAvailable()` detecta a coluna em até 60s, sem redeploy.
- **`REGRESSION_FROM_M2 = NO`:** `tsc` limpo, `test:redator` 46/46,
  `test:redator:mcp` 2/2, `test:editorial` 60/64 (as mesmas 4 pré-existentes),
  `test:radar` 2236/2236, `planejador-fora-do-pipeline` 16/16,
  `operational-flow` 41/51 (as mesmas 10), `radar-to-writer-handoff-1` 26/26.
- **Achado de infraestrutura:** o histórico remoto de migrations estava quase
  vazio — só 4 linhas, da fundação do Redator/MCP, gravadas pelo Studio sob
  timestamps próprios. **~76 migrations do projeto seguem aplicadas e não
  registradas.** M1 e M2 foram registradas por `migration repair`; as demais
  **não** — repará-las é decisão de infraestrutura maior e mascararia drift real.
- **`PURGE_IMPLEMENTED = NO` · `M3_APPLIED = NO`.** Nenhuma rota chama a purga e
  `pg_cron` não existe: nada é apagado, e esse é o estado seguro.
- **Pendente:** homologação manual. **É do usuário.**
- **Relatório:** `docs/00-produto/auditorias/m2-pos-aplicacao-2026-09-18.md`.

## M1 aplicada e verificada — 2026-09-18

- **`M1_DDL_APPLIED = YES`.** `20260918190000_m1_workflow_stage_sem_planner.sql`
  foi aplicada pelo usuário no SQL Editor.
- **Persistência remota, lida por mim:** o CHECK efetivo é
  `stage = ANY (ARRAY['minerador','architect','radar','writer','publications'])`
  — sem `'planner'`. As 28 linhas seguem intactas (25 `architect`, 3 `radar`),
  zero em `stage='planner'`, zero em `state='sent_planner'`, zero incompatíveis
  com o novo CHECK. Os 6 outros CHECKs, as 4 FKs, PK, UNIQUE, trigger, RLS e
  grants continuam idênticos ao lido antes da aplicação.
- **Confirmado por prova comportamental reversível:** `INSERT` sintético com
  `stage='planner'` recebeu `check_violation`; o mesmo `INSERT` com
  `stage='radar'` passou o CHECK e parou na FK. O controle prova que quem
  recusou foi a constraint. Nada persistiu — 28 linhas, zero fixtures.
- **`REGRESSION_FROM_M1 = NO`:** `tsc` limpo, `test:redator` 28/28,
  `test:editorial` 60/64 (as mesmas 4 falhas pré-existentes), `test:radar`
  2236/2236, `planejador-fora-do-pipeline` 16/16,
  `radar-to-writer-handoff-1` 26/26 com o loader. Todas idênticas ao baseline.
- **`M1_VERIFIED = YES` · `M2_APPLIED = NO` · `M3_APPLIED = NO`.**
- **Achado não bloqueante:** comentário órfão em
  `components/editorial-pipeline-context.tsx` (~258-278) descreve
  `preparePlannerItems`, já removido, e aponta para
  `POST /api/editorial/radar-planner-handoff`, rota apagada. É comentário, não
  comportamento; registrado para o próximo corte que tocar o arquivo.
- **Relatório:** `docs/00-produto/auditorias/m1-pos-aplicacao-2026-09-18.md`.

## Corte 2 — remoção funcional do Planejador — 2026-09-18

- **Verificado no código:** `import_planner`, `prepare_plan`, `approve_plan` e
  `start_writing` não existem mais no contrato de comando nem na rota ativa. A
  permissão `planejador:*` deixou de ser exigida em qualquer rota. As telas do
  Planejador ficaram somente leitura. O núcleo do pipeline não importa mais nada
  de `lib/planejador`.
- **Verificado no código:** o Redator ganhou **"Importar do Radar"**, que lista
  elegíveis e chama `postRadarWriterHandoffBatch` — a mesma autoridade
  `sendRadarToWriter` do botão do Radar. Não há segundo handoff.
- **Verificado no código:** `sendWriterToPublications` cria o registro a partir
  de ContentDocument v2 + origem Radar, com a ordem `validar marca → validar
  documento → validar origem → validar pendências e gates → persistir → reler →
  sucesso`. `documentId` é obrigatório no contrato, mesmo com a coluna nulável
  no banco. O cliente recusa resposta sem `readbackConfirmed`.
- **Confirmado por teste:** `tsc` limpo; `test:redator` 28/28;
  `test:editorial` 60/64 (as 4 falhas são pré-existentes, medidas antes e
  depois); `tests/operational-flow.test.mts` 41/51 com as **mesmas 10 falhas do
  baseline medido em HEAD** — zero regressões;
  `tests/planejador-fora-do-pipeline.test.mts` **16/16**; `test:radar`
  **2236/2236**; ESLint sem erros nos arquivos tocados.
- **Defeito encontrado e corrigido na mesma rodada:** `createWriterPublication`
  repassava `document.radarOrigin` inteiro a um objeto `.strict()` de dois
  campos. Virou projeção explícita.
- **Retenção 48h: não implementada.** Só as invariantes seguem registradas.
- **Bloqueado:** M1, M2 e M3 dependem dos blocos [2], [2b], [3], [3b] e [5] do
  preflight de catálogo.
- **Pendente:** homologação manual. **É do usuário.**
- **Relatório:** `docs/00-produto/auditorias/corte-2-remocao-funcional-planejador-2026-09-18.md`.

## Corte de remoção lógica do Planejador — 2026-09-18

- **Aplicado no working tree, sem commit:** documentação canônica passou a
  descrever `Marca → Minerador → Arquiteto → Radar → Redator → Publicações`;
  `MODULE_STAGE` declara `PLANEJADOR_STAGE = NONE`, `REDACTOR_STAGE = 6`,
  `PUBLICACOES_STAGE = 7`, `CONTA_STAGE = 8`, com a posição 5 declarada e não
  atribuída; o Planejador saiu do menu e do estado de pipeline sem que a rota
  fosse apagada (`historical: true`). **Verificado no código.**
- **Confirmado por teste:** `tests/planejador-fora-do-pipeline.test.mts` 8/8 com
  7 `todo` nomeando o que falta; `tests/radar-to-writer-handoff-1.test.mts`
  26/26 com o loader de integrações; TypeScript sem erros. `test:editorial`
  mede **44/48 antes e depois** — as 4 falhas são pré-existentes e não foram
  introduzidas por este corte.
- **Confirmado no banco remoto (somente leitura):** não há dado de ContentPlan
  ou PlannerItem a migrar. `artifact_type='content_plan'` = 0 de 531;
  `stage='planner'` = 0 de 28; `sent_planner` = 0; `content_plans` e
  `planner_items` não existem. Nenhuma compatibilidade fictícia foi criada.
- **Preparado e NÃO aplicado:** remoção de `import_planner`, `prepare_plan`,
  `approve_plan` e `start_writing`; migração de `publication-identity.ts` para
  `lib/publicacoes/`; serviço `sendWriterToPublications` com readback
  obrigatório; `documentId` obrigatório no contrato novo de Publicações;
  botão "Importar do Radar" chamando `sendRadarToWriter`. Diffs em
  `docs/00-produto/propostas/corte-remocao-planejador-diff-proposto-2026-09-18.md`.
- **Invariante atualizada:** a entrega Radar → Redator passa a admitir **dois
  gatilhos da mesma autoridade** — ação no Radar e botão no Redator. O gatilho
  do Redator lista elegíveis e chama o mesmo serviço; não é segunda autoridade.
- **Retenção:** nenhum purge foi implementado. As invariantes
  `PURGE_BY_AGE_ONLY = NO`, `ONLY_AFTER_CONFIRMED_REPLACEMENT = YES`,
  `RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H` e
  `DNA_AND_RADAR_RETENTION = OUT_OF_SCOPE` estão registradas em
  `invariantes.md` §65-69 e na SDD.
- **Bloqueio ativo:** `publication_records` continua nascendo só por
  `start_writing`, que exige ContentPlan. Enquanto o serviço novo não existir,
  **o Redator ainda não entrega a Publicações**. `PENDENTE`.
- **Nenhuma migration foi escrita ou executada.** `MIGRATION_NECESSARIA` segue
  dependendo dos blocos [2], [2b], [3], [3b] e [5] do preflight.

## Revisão de produto do MCP — 2026-09-18

- **Decisão de destino:** a conexão MCP pertence à Agência, em Integrações. A aba `Conectar IA` do Redator e a emissão de bearer local são fundação de desenvolvimento, não a interface final de produto.
- **Divergência confirmada nas telas:** Roteiro e Carrossel estão apresentados como formulários de briefing (`Canal`, `Objetivo`, `Público`, `Duração`, `Abertura`, `Legenda`, `Chamada final`). O produto desejado é um documento de produção com texto, storyboard/slides, imagens, prompts, revisão e pacote para Publicações.
- **Regra nova:** não exigir nem exibir `channel` na produção. Campos auxiliares não podem bloquear a escrita. Os dados históricos permanecem legíveis durante a transição.
- **Pendente de implementação:** painel MCP na Agência; remoção da aba de conexão no Redator; redesenho dos ambientes; vínculo fino de imagens aos blocos; exportação DOCX/PDF; pacote para Publicações; OAuth remoto.
- **Documento de destino:** `docs/07-redator/propostas/sdd-redesign-redator-mcp-agencia-2026-09-18.md`.
- **Prompt de auditoria:** `docs/07-redator/prompts/auditoria-redator-mcp-2026-09-18.md`.

## Implementação multiformato e MCP local — 2026-09-18

- **Verificado no código:** áreas Artigo, Roteiro e storyboard, Carrossel e Conectar IA no Redator. Roteiros e carrosséis preservam cenas/slides, direção visual, prompts e vínculo ao hash do ContentDocument. Prompts visuais e arquivos anexados têm estados diferentes.
- **Banco remoto verificado:** as migrations `20260918050959`, `20260918051757`, `20260918053018` e `20260918061000` foram aplicadas no projeto `hjjlntdpdgvpnazdztqw`. `writer_save_deliverable` e `writer_save_article_draft` existem, o bucket `writer-media` é privado, e o documento preexistente continua presente (1).
- **Verificado no código:** MCP Streamable HTTP em `/api/mcp/redator`, com credencial delegada por ator/agência/marca, hash do token, expiração/revogação, escopos, autorização atual, auditoria e limite de chamadas. As ferramentas leem documentos e briefing, analisam com Guardião, salvam rascunhos com lock/readback e registram/anexam mídia. Não há ferramentas de aprovação/publicação/exclusão.
- **Confirmado por teste automatizado:** contratos de formato e restrições de ferramentas; TypeScript e lint direcionado passaram. A resposta 401 sem bearer foi observada no localhost. A interface carregou as quatro abas no navegador local, sem criar credencial ou alterar conteúdo editorial.
- **Confirmado por teste de protocolo local:** uma delegação sintética executou `initialize` e `tools/list` por Streamable HTTP; o servidor recusou escrita sem lock e ferramenta inexistente de publicação. Isto não prova autorização real nem leitura/gravação de documento por um cliente externo.
- **Bloqueio remoto medido:** a URL oficial de descoberta OAuth do projeto Supabase respondeu HTTP 404 `feature_disabled` em 2026-09-18. O bearer local não implementa o OAuth + PKCE exigido para o ChatGPT remoto. A ativação do OAuth Server e o consentimento por agência/marca são gates separados; nenhum deploy foi feito.
- **Validado no localhost com Supabase real:** uma delegação temporária `writer.read` executou `initialize`, `tools/list` (10 ferramentas), `get_writer_connection_profile`, `list_writer_documents` (1 documento) e `get_writer_brief` (dossiê presente). A delegação foi revogada; a mesma credencial passou a receber HTTP 401 `delegation_invalid`. O registro revogado e sua trilha de auditoria permaneceram no banco; nenhum artigo foi alterado.
- **Confirmado por teste transacional remoto:** uma cópia temporária do documento foi criada em `BEGIN`, salva via `writer_save_article_draft`, repetida com o mesmo hash e desafiada com lock antigo e conteúdo diferente. O bloco terminou com `ROLLBACK`: zero documentos/versões de fixture permaneceram e a marca ainda tem o documento original. O estado corrente e a versão imutável são atômicos. A função é executável por `service_role`, mas não por `authenticated` ou `anon`. A ferramenta MCP de escrita autenticada ainda requer teste ponta a ponta.
- **Ainda não verificado:** escrita MCP autenticada, criação de entregável e upload por UI seguidos de F5/segunda sessão; conexão ChatGPT/Claude.
- **Limite funcional:** a plataforma registra prompts e recebe imagens geradas pelo chat como arquivo; não chama modelo de imagem e não garante que o cliente MCP consiga retornar automaticamente a imagem criada na conversa. A aprovação editorial e publicação continuam atos explícitos.
- **Arquivos centrais:** `lib/redator/multiformat-contracts.ts`, `lib/server/writer-deliverables.ts`, `lib/server/writer-mcp-delegation.ts`, `app/api/mcp/redator/route.ts`, `modules/redator/writer-derived-environment.tsx`, `modules/redator/writer-mcp-connections.tsx` e as quatro migrations acima. O acréscimo compartilhado em `lib/server/authz.ts` resolve o perfil de um ator já validado; os consumidores existentes da sessão permanecem inalterados.

- **Última auditoria:** 2026-07-20.

## Integração MCP na Agência — implementação local 2026-09-19

- **Implementado no código:** `/agencias/{agencyRef}/integracoes` passou a ser
  a superfície de gestão do MCP do Redator. A Agência pode registrar ChatGPT,
  Claude, Gemini ou outro cliente MCP, visualizar o endpoint único
  `/api/mcp/redator`, selecionar escopos e emitir delegações por Marca.
- **Autoridade preservada:** o servidor MCP continua único e o token continua
  sendo uma delegação `writer_mcp_delegations` vinculada a agência, marca,
  ator, escopos, validade e hash. Administradores da Agência também podem
  revogar delegações criadas por outros administradores da mesma Agência.
- **Segurança:** o token completo aparece uma única vez; `integration_connections`
  recebe somente metadados sanitizados do cliente e permanece `pending` até a
  conexão externa ser configurada. Nenhum segredo bruto foi adicionado ao
  banco, React, localStorage ou payload editorial.
- **Migration local preparada:**
  `supabase/migrations/20260919035046_agency_mcp_provider_catalog.sql` adiciona
  os providers `chatgpt`, `claude`, `gemini` e `custom_mcp`. **Não aplicada
  remotamente nesta rodada.**
- **Validado:** TypeScript, lint direcionado, build, `test:redator` 204/204 e
  `test:redator:mcp` 2/2. A conexão ChatGPT/Claude/Gemini por OAuth remoto ainda
  não está homologada; o projeto Supabase continua sem discovery OAuth ativo.
- **Pendente manual:** aplicar a migration no projeto escolhido, registrar um
  cliente na página da Agência, emitir um bearer para uma Marca e conectar um
  cliente externo por HTTPS. A homologação da escrita no Redator continua
  separada e não foi simulada por esta alteração.
- **Funcionando:** Tiptap integrado, abertura direta por query, edição humana, blocos estruturados, proveniência por `blockId`, autosave com lock otimista e recovery local por marca/documento. **Verificado no código.**
- **Funcionando:** contratos/prompts do Redator, escrita assistida por seção, melhoria de trecho e análise determinística do Guardião possuem rotas server-side e aplicação explícita na cópia de trabalho. **Confirmado por TypeScript, lint e testes direcionados.**
- **Funcionando:** aprovação no cliente e no endpoint server-side rejeita documento com achados `blocked`; IA continua proposta e nunca aprovação. **Verificado no código.**
- **Parcial:** salvamento, criação de snapshots, reload e sincronização do registro de Publicações existem nos repositórios, mas não houve validação manual ponta a ponta com persistência remota.
- **Parcial:** escrita e melhoria reais dependem de provedor configurado; os testes usam fixtures e não chamam IA externa.
- **Simulado:** há criação mock de plano/documento no provider, distinguida por origem.
- **Local:** recovery de workflow e recovery de documento usam navegador; `localStorage` é fallback e não fonte única.
- **Persistido:** tabelas/repositórios de documento, versões, estado e comentários previstos na migration `0002`; remoto não verificado.
- **Bloqueado:** confirmação manual de persistência remota, conflito em navegador, aprovação e importação idempotente para Publicações.
- **Regressões/bugs:** nenhum confirmado nos testes direcionados desta tarefa. A validação manual continua pendente.
- **Arquivos centrais:** `components/editorial/professional-writer.tsx`, `lib/redator/contracts.ts`, `lib/redator/prompts.ts`, `lib/redator/guardian.ts`, `lib/server/editorial-repositories.ts`, `app/api/editorial/documents/route.ts`.
- **Testes:** `tests/redator-domain.test.mts`, `tests/editorial-pipeline.test.mts`, `tests/operational-flow.test.mts`, `tests/arquiteto-domain.test.mts`; TypeScript e lint direcionados passaram.
- **Última validação manual:** **Relatado pelo usuário:** primeiro documento abriu diretamente; Guardião, rotas de IA e transferência ainda não foram conferidos no navegador.
- **Diferença spec/implementação:** a estação editorial e seus gates locais/server-side estão implementados; persistência remota, provedor real e destino externo ainda não são evidência de conclusão.

### Atualização da governança MCP — 2026-09-19

- **Confirmado pelo responsável no Supabase remoto:** o catálogo contém
  `chatgpt`, `claude`, `gemini` e `custom_mcp` com status `active`. A migration
  `20260919035046_agency_mcp_provider_catalog.sql` foi aplicada fora desta
  sessão; ela não armazena credenciais.
- **Concluído no código:** a Agência é a única autoridade para emitir e
  revogar delegações MCP. A rota legada do Redator conserva somente `GET` de
  compatibilidade; `POST` e `DELETE` respondem `410
  MCP_DELEGATION_AGENCY_ONLY`.
- **Concluído no código:** a página de Integrações da Agência permite revogar
  uma conexão MCP e ler os 40 eventos operacionais mais recentes sem expor
  tokens ou conteúdo editorial.
- **Ainda pendente:** conexão externa real por OAuth/HTTPS, escrita MCP
  autenticada ponta a ponta em fixture isolada e homologação manual pelo
  usuário. `pending` não significa cliente conectado.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/redator; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/redator`; autosave e recovery local não foram alterados.

# Entrada direta Radar → Redator — 2026-09-17

- **Funcionando:** o documento editorial nasce do pacote canônico do Radar **sem
  `ContentPlan` e sem item no Planejador**. `ContentDocument` passou a ser união
  discriminada por `schemaVersion`: v1 mantém `contentPlanRef` obrigatório, v2
  carrega `radarOrigin` + `importedContext` e o `.strict()` **recusa** a chave
  `contentPlanRef` — ausência declarada em vez de id fictício. **Verificado por
  testes e TypeScript.**
- **Funcionando:** a transferência tem **autoridade única e ela é do Radar** — a
  ação chama-se "Enviar ao Redator" e existe em R3, R4 e na página de análise. O
  Redator recebe; não há segunda porta de importação nele. O botão do Planejador
  permanece como caminho histórico. **Verificado no código.**
- **Funcionando:** o estado `sent_writer` existe ao lado de `sent_planner` na
  máquina de estados (`lib/editorial/operational-flow.ts`), com transição
  `approved → sent_writer` e volta para `approved`. O envio ao Redator **não** é
  registrado como "enviado ao Planejador". **Verificado no código.**
- **Funcionando:** `Publicações` aceita origem Radar — `plannerItemId` e
  `contentPlanVersionId` são nuláveis e `radarOrigin` foi acrescentado. No lugar
  da obrigatoriedade perdida entrou uma invariante: **todo registro precisa
  declarar alguma origem**, plano editorial ou pacote do Radar. **Verificado por
  teste.**
- **Funcionando:** o dossiê canônico viaja **inteiro** dentro de
  `importedContext.dossier` (`RadarWriterDossier`), e não como resumo ou apenas
  markdown. O campo é aditivo (`.default(null)`), então documento v2 gravado
  antes deste gate continua legível. **Verificado por teste.**
- **Funcionando:** pendência viaja **como pendência**. Bloqueante impede aprovar
  e transferir como aprovado, **não** impede escrever e salvar; não existe campo
  nem botão local que a marque resolvida. **Verificado por teste.**
- **Parcial:** o serviço e a rota `radar-writer-handoff` implementam readback na
  origem e no destino (`radar_handoff_readback_failed`,
  `radar_handoff_destination_readback_failed`). O comportamento está coberto por
  teste, mas **o readback remoto real não foi homologado manualmente**.
- **Bloqueado:** homologação manual ponta a ponta — envio, recarga, segunda
  sessão/navegador, conferência de artigo, versão do ArticleDNA e hash,
  idempotência e lote misto. **É do usuário**, sem chamada paga de SERP ou IA.
- **Nenhuma migration foi necessária.** A verificação do schema efetivo mostrou
  `content_plan_version_id` e `article_dna_version_id` já nuláveis em
  `content_documents` e `publication_records`, e `planner_item_id` inexistente
  como coluna — a `0028` prevaleceu sobre a `0002`. O bloqueio era inteiramente
  de contrato Zod.
- **Arquivos centrais acrescentados:** `lib/redator/radar-import.ts`,
  `lib/redator/writer-handoff.ts`, `lib/server/radar-writer-send.ts`,
  `app/api/editorial/radar-writer-handoff/route.ts`,
  `lib/radar/writer-handoff-client.ts`.
- **Testes:** `tests/redator-entrada-radar.test.mts` (23/23) e
  `tests/radar-to-writer-handoff-1.test.mts` (25/25). As três falhas anteriores
  do primeiro eram do **fixture**, não do contrato: faltavam `bundleId` e
  `keywordContext.resolution`, exigidos desde que o dossiê passou a viajar
  dentro do documento; o teste de chaves ainda descrevia `importedContext` sem
  `dossier`. Corrigidos.
- **SDD:** `docs/07-redator/propostas/sdd-entrada-direta-radar-redator-2026-09-17.md`.
- **Diferença spec/implementação:** contrato, domínio, serviço e rota estão de
  pé e verdes. Interface de lote, painel de pendências e adaptador de
  `Publicações` no repositório ainda não foram entregues, e a validação manual
  segue pendente — nenhum dos dois é evidência de conclusão.

# Incidente resolvido — o documento existia e a tela dizia que não havia nada — 2026-09-18

- **Sintoma:** o Redator abria vazio e oferecia apenas "Importar do Planejador
  (histórico)", cujo modal dizia "Conclua a aprovação na etapa anterior
  primeiro" — uma instrução para uma etapa que o fluxo atual não atravessa.
- **O envio nunca falhou.** Verificado no banco, somente leitura:
  `editorial_workflow_items` tinha 1 artigo em `sent_writer`, e
  `content_documents` guardava o documento correspondente — v2, sem
  `content_plan_version_id`, com `importedContext.dossier` preenchido, gravado
  em 2026-09-18 03:51 UTC. O payload foi validado contra
  `ContentDocumentSchema`: **válido**.
- **Causa identificada:** formato de data. O PostgREST devolve `timestamptz`
  como `2026-09-18T03:51:49.236599+00:00`; `z.string().datetime()` só aceita
  `Z`. `PersistedDocumentSchema.updatedAt` lia `row.updated_at` **cru**, sem a
  normalização `isoDate()` que o `WorkflowRepository` sempre usou — e é por isso
  que o Radar continuava carregando enquanto o Redator não.
- **Por que só apareceu agora:** enquanto `content_documents` esteve vazia,
  `documents: []` passava em qualquer schema. O **primeiro documento real**
  derrubou a validação da mesa inteira em `PersistedEditorialWorkspaceSchema`.
  Verificado diretamente contra o PostgREST desta instalação.
- **Correção:** `isoDate()` aplicada aos **9** campos de data lidos de coluna em
  `lib/server/editorial-repositories.ts` (documento, estado de leitura,
  publicações, views salvas e convites). Como rede de segurança, os contratos
  desses campos passaram a aceitar deslocamento
  (`datetime({ offset: true })`) — a normalização continua sendo no leitor.
- **Teste:** `tests/editorial-timestamp-postgrest.test.mts` (7/7), registrado em
  `test:editorial`. Reproduzia o defeito antes da correção (5 falhas) e usa o
  valor **real** do PostgREST, porque um fixture escrito com "Z" na mão esconde
  exatamente este defeito.
- **Entrada da tela:** decisão do planejador — o caminho do Planejador saiu da
  barra principal e virou acesso secundário junto dos rascunhos; o estado vazio
  do diálogo parou de mandar aprovar plano e passou a nomear "Enviar ao
  Redator", no Radar. **Nenhuma segunda autoridade de importação foi criada no
  Redator** — a transferência continua partindo só do Radar.
- **Pendente:** homologação manual. **É do usuário.** Abrir o Redator, conferir
  que o documento aparece, recarregar, abrir em segunda sessão e repetir o envio
  para provar idempotência.

## Teste local do Redator e preparação MCP — 2026-09-18

- **Validado no navegador local:** documento v2 originado no Radar apareceu no
  Redator com artigo e versão de ArticleDNA identificáveis. Uma edição
  temporária foi salva no servidor, recuperada após F5, removida, salva e a
  remoção recuperada após novo F5. O Guardião server-side retornou findings.
  O estado operacional passou de `planejado` para `escrevendo` no teste; não
  houve aprovação, publicação nem geração de conteúdo final.
- **Bug corrigido:** a barra global podia consultar `canUndo`/`canRedo` com o
  editor Tiptap ainda nulo na inicialização e derrubar a página. Os controles
  agora consultam a referência atual e checam se o editor não foi destruído.
- **Limite da evidência:** não houve segunda sessão, teste de lote ou nova
  transferência a partir do Radar nesta rodada. Após F5, a tela mostra vazio
  antes de concluir a hidratação; isto não foi tratado como marca vazia.
- **Registro anterior ao corte MCP:** `importedContext.dossier` já estava no
  documento v2, mas a UI ainda exibia apenas origem e IDs naquele momento.
  O estado mais recente da implementação está no início deste documento.
- **Testes desta rodada:** `test:redator` 23/23, TypeScript sem erros,
  ESLint no arquivo do Redator sem erros (1 aviso preexistente de dependência
  do `useMemo`).
