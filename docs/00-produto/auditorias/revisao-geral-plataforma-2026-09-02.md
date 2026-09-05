# Revisão geral da plataforma Minerador Key

**Data:** 2026-09-02 · **Branch:** `main` @ `6706259` · **Escopo:** árvore completa do repositório, 66 migrations, 87 rotas HTTP, 357 arquivos em `lib/`, 87 em `modules/`, 288 documentos em `docs/`, 322 arquivos de teste. Leitura somente; nenhum arquivo do projeto foi alterado, nenhuma operação remota, paga ou destrutiva foi executada.

## 0. Sumário executivo

1. **O produto está bem definido e a fundação está estável.** Monólito modular Next.js 16 + Supabase para o pipeline editorial de SEO `Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações`, com tenancy `Plataforma → Agência → Marca` e tenant editorial `brandId = marcas.id`. Auth Supabase SSR, autorização canônica (migration 0021), integrações governadas e lifecycle global estão aplicados e congelados desde o Master Refresh de 2026-08-17.
2. **A maturidade é muito desigual entre módulos.** Minerador é o único homologado ponta a ponta com provedores reais. Marca (BrandDNA, Skills) e Arquiteto (ArticleDNA, Silos, InternalLinkGraph) têm fundação remota pronta, mas o Arquiteto está no meio de uma rearquitetura "Silo-first" cuja UI ainda não consome o caminho novo. Radar tem a infraestrutura completa, mas o fluxo de especialistas via Telegram nunca foi exercitado de verdade. Planejador, Redator e Publicações estão parados desde julho, sem validação manual, sem IA no Planejador e sem CMS em Publicações.
3. **O risco mais grave hoje é de repositório, não de produto.** O último commit é de 2026-08-17. Há 452 arquivos não rastreados e 237 modificados, incluindo 20 migrations (0044 em diante e todas as timestampadas), o InternalLinkGraph inteiro, Telegram, Google Cloud, Brand Skills, qualificação semântica e a consolidação Silo-first. Duas semanas de trabalho existem apenas neste disco.
4. **Banco: modelo sólido, cadeia frágil.** Cerca de 58 tabelas canônicas, RLS em todas as versionadas (exceto `perfis` e `briefings_artigos`, pré-existentes), escrita concentrada em RPCs transacionais. Porém a cadeia de migrations não é reproduzível do zero (base não versionada, precondições amarradas a UUIDs e contagens do projeto remoto, propostas 0002/0003/0004 colidindo com as canônicas), a ordem lexical difere da ordem real de aplicação, 0046 e 0047 são mutuamente exclusivas, há CHECK contraditório em `agency_memberships.role`, e o ledger `schema_migrations` não está reconciliado. A verificação do catálogo remoto não foi possível nesta sessão (o conector Supabase disponível pertence a outra organização).
5. **APIs: 87 rotas, quatro guards de autorização paralelos.** Três rotas gravam em `minerador_keywords` exigindo apenas acesso à marca, sem verificar `minerador:create/edit`. Seis rotas funcionais estão órfãs, quatro legadas continuam em uso fora do namespace canônico, sete diretórios de rota estão vazios, e cerca de 60 citações na documentação apontam para rotas inexistentes. Endpoints públicos de cadastro e solicitação de agência não têm rate-limit.
6. **Código: dois componentes monolíticos concentram quase toda a dívida.** `arquiteto-workspace.tsx` (6.954 linhas) e `minerador-workspace.tsx` (4.241) reúnem todos os `any`, todos os erros de lint e 265 dos 714 itens de dívida visual tolerados. A persistência canônica é sólida no Arquiteto (versões imutáveis, readback validado), mas o browser ainda é fonte de verdade no Site/Sitemap da Marca, no recovery do Arquiteto e no fallback do pipeline editorial, contra a ADR-007.
7. **Integrações operam todas no escopo Plataforma.** DeepSeek, DataForSEO, Google Ads, Resend, Telegram e Google Cloud estão ligados; a governança de grants, bindings e quotas está implementada mas dormente (política `HOMOLOGATION_ALLOW_ALL`), e a UI de integrações da agência grava dados que o runtime ignora. Serper está morto. NextAuth foi removido, mas deixou cinco resíduos.
8. **Qualidade: verde por pouco.** Typecheck com 5 erros (2 reais), lint com 128 problemas em 2 arquivos, 17 de 942 testes falhando (todos asserções estáticas sobre texto-fonte, nenhuma falha de lógica), e 261 de 322 arquivos de teste (81%) nunca rodam por nenhum script.
9. **Documentação extensa e disciplinada, mas com contradições abertas.** Os `estado-atual.md` viraram diários append-only sem índice. Há contradições não resolvidas sobre o gate semântico do Arquiteto, o status remoto da fundação Telegram e Google Cloud, a homologação do DeepSeek, a execução das migrations 2C e o NextAuth. Os documentos de topo usam nomes de tabelas anteriores à 0036 e ainda citam NextAuth e Google Sheets.
10. **Próximos passos recomendados (seção 10):** commit de checkpoint imediato; reconciliação do ledger de migrations e decisão sobre 0046/0047 e 0002/0003/0004; fechamento dos guards fracos; ligação dos testes órfãos aos scripts; e só então retomar a frente funcional do Arquiteto e da Marca conforme a ordem oficial.

## 1. Escopo e método

| Fonte | O que foi lido | Como |
|---|---|---|
| Árvore do repositório | 2.067 arquivos rastreados + 452 não rastreados, excluindo `node_modules`, `.next` e `.next-codex-verify` | listagem completa e contagem por diretório |
| Banco | 66 migrations, 9 rollbacks, 130 scripts SQL, `supabase/baseline`, `docs/compartilhado/banco-canonico-pos-reset.md` e `supabase.md` | leitura integral das migrations em ordem |
| APIs | 83 `app/api/**/route.ts` + 4 `app/auth/**/route.ts`, helpers de autorização, `proxy.ts` | leitura integral de cada handler e grep de chamadores |
| Arquitetura | `app/`, `modules/`, `components/`, `lib/`, `lib/server/`, `scripts/`, skill visual, `next.config.ts`, `tsconfig.json`, `.env.example` | leitura dirigida e grep |
| Documentação | `README.md`, `AGENTS.md`, `docs/README.md`, `task.md`, `00-produto/**` (21 ADRs), `spec/estado-atual/backlog` dos 9 módulos, propostas de 2026-08-2x e 2026-09-02, `docs/compartilhado/**` | leitura integral e cruzamento com o checkout |
| Qualidade | `tsc --noEmit`, `pnpm run lint`, 7 suítes `test:*`, `check:visual-system`, `git status`, `pnpm ls` | execução local, sem `next build`, sem `test:real-db` |

**O que não foi verificado:** o catálogo remoto do Supabase (tabelas, policies, grants, ledger de migrations) e o comportamento da interface em navegador. O conector Supabase desta sessão lista apenas os projetos `betinna` e `somatec`, não o projeto vinculado `hjjlntdpdgvpnazdztqw`. Não há Docker local para subir o stack. Na classificação dos próprios docs, tudo aqui é "Verificado no código" ou "Confirmado por teste", nunca "REMOTE VERIFIED" ou "MANUAL UI VALIDATION".

## 2. O produto e a fase atual

- **O que é:** produto interno multi-marca que transforma contexto de marca e keywords em uma cadeia editorial rastreável. Cada módulo recebe o trabalho consolidado da etapa anterior, acrescenta só a inteligência da sua fronteira e entrega contexto suficiente para a próxima.
- **Artefatos canônicos:** `BrandDNA → KeywordDNA → ArticleDNA → SiloDNA/SiloPage → InternalLinkGraph → RadarApprovedPackage → ContentPlan → ContentDocument → PublicationRecord`, todos versionados e imutáveis em `editorial_artifact_versions` (ADR-001).
- **Hierarquia e papéis:** Plataforma (admin global por `perfis.role='admin'`, governa integrações e agências) → Agência (owner e membros, uma agência operacional por usuário, acesso herdado às marcas vinculadas com restrições explícitas) → Marca (owner, memberships com permissões `módulo:ação`, especialistas externos sem login). Admin global não vira owner nem ganha acesso editorial automático.
- **Princípios:** IA propõe e humano aprova (ADR-002); publicados protegem URL, slug, canonical e marca (ADR-008, ADR-016); localStorage e IndexedDB nunca são fonte única (ADR-007); sucesso só após readback remoto; roteamento tenant por `brandRef = slug--uuid` (ADR-021); DeepSeek é o único provedor de IA e DataForSEO o único de SERP.
- **Fase vigente:** `FUNCTIONAL_AREA_DEVELOPMENT`, ordem oficial Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações, com banco, Auth, Agency/Brand e integrações congelados. Convenção de trabalho: SDD aprovada antes de qualquer mudança estrutural; preflight read-only, migration idempotente, post-verifier e rollback para qualquer SQL; o usuário executa SQL, Git, deploy e chamadas pagas.
- **Stack:** Next.js 16.3 (App Router, `proxy.ts` como middleware), React 19.2, TypeScript 6.0, Tailwind 4 CSS-first, Zod 4, Supabase SSR, Tiptap 3, React Flow (`@xyflow/react`), Google APIs, Google Cloud Speech/Storage, pnpm 10, Node 24.
## 3. Banco de dados (Supabase / Postgres 17)

### 3.1 O que foi possível verificar

- **Projeto vinculado:** `hjjlntdpdgvpnazdztqw` ("adalbamusic-dotcom's Project"), Postgres 17.6, registrado em `supabase/.temp/`.
- **Verificação remota não realizada nesta revisão.** A conexão Supabase MCP disponível nesta sessão enxerga apenas os projetos `betinna` e `somatec` (outra organização). Não há Docker local, logo `supabase status` e `db reset` não rodam. Toda a análise abaixo é **derivada das 66 migrations, scripts e documentação**, não do catálogo remoto. Na classificação dos docs, isso é "Verificado no código", não "REMOTE VERIFIED".
- **Cadeia de migrations:** `0001`–`0047` (sem `0031`, abandonada por decisão) + 19 timestampadas (`20260817…` a `20260902…`). Nenhuma `VIEW`, nenhuma `CREATE EXTENSION` (Vault e `sha256` são exigidos por gate, não instalados).
- **Base não versionada:** `public.marcas`, `public.perfis`, `keywords_kgr`, `listas_kgr` e `briefings_artigos` foram criadas pelo dashboard antes da `0001`. Nenhuma migration as cria.
- **20 migrations ainda não commitadas** (`0044` em diante e todas as timestampadas). O Git só conhece a cadeia até `0043`. Ver seção 9.

### 3.2 Inventário por domínio (estado canônico esperado, ~58 tabelas)

| Domínio | Tabelas canônicas | Migrations-chave | Observações |
|---|---|---|---|
| Identidade / autorização | `perfis` (pré-existente), `brand_roles`, `brand_memberships`, `brand_member_permissions`, `canonical_capabilities`, `agency_membership_capabilities`, `brand_agency_capability_restrictions` | 0005, 0006, 0015, 0016, 0017, 0021 | `perfis.role='admin'` é o admin global. `user_key`, `perfis.marca_id` e `canonical_role` foram removidos (0017). Admin global **não** tem leitura implícita de marca desde 0016. |
| Agência | `agencies`, `agency_memberships`, `agency_brands`, `agency_applications`, `agency_invitations`, `agency_onboardings`, `agency_invitation_token_generations`, `agency_access_periods` | 0014, 0015, 0018, 0020, 0021, 0023, 0037, 0039 | Uma agência ativa por usuário e uma agência ativa por marca, codificado em índice + trigger deferred + RPC. |
| Marca | `marcas` (pré-existente, `owner_user_id`, `site_url`), `brand_site_sitemaps`, `brand_site_sync_runs`, `brand_site_catalog_entries`, `brand_experts` | 0005, 20260902120000, 20260902130000, 20260825150000 | Persistência canônica de site/sitemap criada em **2026-09-02** (não commitada, não aplicada). |
| Minerador | `minerador_keywords` (ex-`keywords_kgr`), `minerador_keyword_lists` (ex-`listas_kgr`), `minerador_keyword_metric_measurements`, `minerador_discovery_runs`, `minerador_discovery_candidates`, `minerador_discovery_import_batches`, `minerador_discovery_keyword_origins`, `minerador_discovery_candidate_current_metrics`, `minerador_discovery_candidate_metric_history` | 0007–0013, 0036 (rename), 0040, 0041, 0046, 0047 | Lifecycle de exclusão (`deleted_at`, `purge_after`, `deleted_by`) com `REVOKE DELETE` para todos os papéis; só RPCs apagam. |
| Pipeline editorial (compartilhado) | `editorial_artifact_versions` (9 tipos: brand_dna, brand_skill, keyword_semantic_qualification, keyword_contextual_presentation, article_dna, silo_dna, silo_page, content_plan, article_architecture_ai_review), `editorial_workflow_items` (reutilizada para Territory e SiloWorkingCopy via `subject_type`), `editorial_version_status_events`, `editorial_decision_events`, `editorial_saved_views` | 0027, 0028, batch-3, 20260828*, 20260829* | Versões imutáveis (append-only), `lock_version`, `content_hash`. |
| Arquiteto — grafo | `internal_link_graphs`, `internal_link_graph_nodes`, `internal_link_graph_edges`, `internal_link_graph_proposals`, `internal_link_graph_working_copies` | 20260826225145, 20260827032222, 20260827044408 | FKs compostas com `marca_id`, advisory locks, RPCs `SECURITY INVOKER`. |
| Radar / SERP | `editorial_serp_snapshots`, `editorial_serp_reviews` | 0027 | Append-only. |
| Redator | `content_documents`, `content_document_versions`, `content_document_user_states` | 0028 | Lock otimista. |
| Publicações | `publication_records` | 0029 | URL, slug e canonical protegidos. |
| Integrações | `integration_providers`, `integration_capabilities`, `integration_connections`, `integration_grants`, `integration_bindings`, `integration_quota_policies`, `integration_usage_events` | 0024, 0025, 0034, 0042, 20260824*, 20260825* | Segredos no Vault via RPC. Ledger append-only. |
| Telegram / especialistas | `telegram_expert_bindings`, `telegram_onboarding_tokens`, `telegram_brief_selection_tokens`, `telegram_inbound_updates`, `expert_briefs`, `expert_contributions`, `external_processing_jobs` | 20260825150000 | Fila durável para o Local Worker. |
| Comunicação | `platform_communication_config`, `communication_templates`, `communication_messages`, `communication_delivery_events` | 0019, 0020, 0022 | Outbox com lease (`FOR UPDATE SKIP LOCKED`). |
| Legado ativo | `briefings_artigos` | pré-existente | Lida por 3 rotas, escrita por 1 rota órfã. Sem RLS versionada. |

**Removidas ao longo da história:** `tenant_0005_migration_guard` (0035), `tenant_0016_agency_role_rollback` e `brand_exceptional_operation_*` (0032), `minerador_google_ads_connections` e `google_ads_binding_*` (batch-4), schema `migration_backup` (batch-6), RPC `import_minerador_discovery_candidates` (0038).

**Propostas nunca aplicadas que continuam na pasta:** `0002` (18 tabelas), `0003`, `0004` (8 tabelas). Elas criam objetos com o **mesmo nome** das versões canônicas (`editorial_artifact_versions`, `editorial_serp_snapshots`, `brand_site_sitemaps`) em formas diferentes.

### 3.3 Funções, RPCs e triggers

- **Helpers de autorização (SECURITY DEFINER):** três gerações coexistem. `is_global_admin`, `can_access_brand`, `can_manage_brand`, `can_access_list` e `tenant_actor_has_permission` (0005/0006) hoje são wrappers da geração `canonical_*` (0015) e `canonical_actor_*` (0021, ator explícito). `editorial_has_permission` (0002/0016) ainda existe.
- **RPCs de escrita:** agência (6, executáveis por `authenticated` com `canonical_assert_rpc_actor`), onboarding (9), comunicação (8), integrações (2 para Vault), Minerador discovery (2), lifecycle de keyword (0046: 7; 0047: 7 novas mais wrappers), Arquiteto (6, todas `SECURITY INVOKER` com advisory locks), site (2), Telegram (1).
- **Triggers:** proteção de publicado (marcas, keywords, listas, briefings), guards de tenant, append-only em todas as tabelas de versão, evento e grafo, `lock_version` e `updated_at`, validação de referências do grafo, transições de sync de site.
- **Padrão de `search_path`:** `pg_catalog, public, pg_temp` desde 0006. Exceções: `claim_external_processing_job` (sem `pg_catalog`) e funções da 0002.

### 3.4 RLS e ACL

- Três gerações de ACL coexistem: (A) 0005–0013, `authenticated` com INSERT/UPDATE sob RLS; (B) tabelas privadas com RLS e zero policies, só `service_role` (agência, comunicação, tokens Telegram); (C) 0021 em diante, `authenticated` só SELECT sob RLS, escrita por `service_role` ou RPC.
- `0026` revogou default privileges de `PUBLIC`, `anon`, `authenticated` e `service_role` para objetos criados por `postgres`. Migrations posteriores fazem GRANT explícito.
- Hardening pontual: 0022 (comunicação), 0025 (integrações), batch-2 (`briefings_artigos`, `search_path`, revogação de EXECUTE em trigger functions, exigência de exatamente 54 funções SECDEF).
- **Sem RLS declarada em migrations:** `perfis` e `briefings_artigos` (batch-2 assume RLS habilitada manualmente).
- **Storage:** único bucket versionado é `profile-avatars` (0045), **público**, com path previsível `<uid>/avatar.webp`. Mídia do Telegram pressupõe bucket não versionado (`GCS_BUCKET_NAME` no env aponta para Google Cloud Storage).

### 3.5 Cobertura de rollback

| Situação | Migrations |
|---|---|
| Rollback em `supabase/rollback/` | 0005, 0006, 0046, 0047, grafo (4), brand_skills |
| Rollback em `supabase/scripts/` | 0016, 0017, 0020, 0021, 0022, 0032, 0033, 0034, 0036, 0037, 0038, 0039, 0041–0044, batch-2, batch-3 |
| Rollback só comentado inline | 0001, 20260829120000, 20260902120000/130000/140000/150000 |
| Rollback documental | batch-6 (dados destruídos) |
| **Sem rollback** | 0002, 0003, 0004, 0007–0015, 0018, 0019, 0023–0030, 0035, 0040, 0045, batch-4 (destrutivo), 20260824185700, 20260825090000, 20260825150000, 20260828234500, 20260828235500 |
| **Rollback quebrado** | 0005 (guard dropado em 0035), 0006 e 0016 (referenciam `keywords_kgr`/`listas_kgr` ou tabela dropada) |

### 3.6 Riscos do banco (R1–R15)

1. **R1 — Cadeia não reproduzível.** `supabase db reset` falha: base não versionada, e 0005/0006/0036/batch-2/4/6 exigem contagens exatas, UUIDs e fingerprints do projeto remoto. As migrations estão "amarradas" ao ambiente, não são portáveis para staging ou branch.
2. **R2 — Propostas 0002/0003/0004 colidem com canônicas.** `db push` não é seguro enquanto existirem (reconhecido em `docs/03-minerador/backlog.md`). Ledger `schema_migrations` não reconciliado.
3. **R3 — Ordem lexical diferente da ordem real.** 0044–0047 foram criadas depois dos batches 2–6, mas ordenam antes. 0046/0047 dependem de `editorial_decision_events` (batch-3) e quebram o gate "= 54 SECDEF" do batch-2.
4. **R4 — 0046 e 0047 são mutuamente exclusivas.** 0047 faz `ADD COLUMN` sem `IF NOT EXISTS`. Docs dizem 0047 aplicada; destino de 0046 não documentado.
5. **R5 — CHECKs contraditórios em `agency_memberships.role`.** 0014 (`agency_admin/operator/viewer`) e 0016 (`agency_admin/agency_member`) coexistem; a RPC 0021 aceita `operator/viewer`. Efeito prático: só `agency_admin` é viável. Membro não-admin de agência não pode ser criado hoje.
6. **R6 — Purga 0047 sem filtro de `subject_type`** em `editorial_workflow_items`; mitigado por prefixo `territory:` e `silo-working-copy:`. `lifecycle_keyword_deletion_impact` usa `payload::text LIKE`.
7. **R7 — Três gerações de helpers de autorização** e `protect_published_keyword` reescrita 3 vezes com semânticas diferentes de "publicado".
8. **R8 — Patches textuais de função** (0012 e 0036 reescrevem corpos via `replace()`), não auditáveis por diff.
9. **R9 — Referências documentais quebradas:** `supabase/baseline/README.md` aponta para `docs/SUPABASE_BASELINE.md` inexistente; a matriz de `banco-canonico-pos-reset.md` atribui tabelas a migrations que não as criam.
10. **R10 — Rollbacks obsoletos** (0005, 0006, 0016) e migrations destrutivas sem rollback (batch-4, 20260825150000).
11. **R11 — `search_path` fora do padrão** em `claim_external_processing_job` e funções 0002; `editorial_current_user_key` usa e-mail como identidade.
12. **R12 — `perfis` e `briefings_artigos` fora do contrato versionado.**
13. **R13 — Precondições rígidas** (contagens exatas, UUIDs hard-coded) bloqueiam qualquer drift e impedem branches de banco.
14. **R14 — Modelo de agência restritivo por design**, codificado em três camadas.
15. **R15 — `expert_briefs.article_dna_version_id` e `article_id` são `text` sem FK**; `telegram_inbound_updates` é a única exceção ao padrão de FK composta com `brand_id`.
## 4. Arquitetura do código

### 4.1 Camadas

| Camada | Volume | Papel | Observações |
|---|---|---|---|
| `app/` | 126 arquivos, ~8.500 linhas, 83 `route.ts` | Route groups `(brand)`, `(agency)`, `(admin)`, `(personal)` e globais. Páginas de 1–3 linhas que fazem o gate e delegam a `modules/`. | `app/(brand)/[brandRef]/layout.tsx` exporta utilitários importados pelas páginas (layout virou biblioteca). 8 diretórios vazios. |
| `modules/` | 87 arquivos, ~21.200 linhas | UI por área: admin, arquiteto, conta, marca, minerador, planejador, publicacoes, radar, redator. Cada um com `index.ts` barrel. | `arquiteto-workspace.tsx` (6.954 linhas) e `minerador-workspace.tsx` (4.241) são componentes monolíticos. Módulos fazem `fetch("/api/…")` direto; não há client SDK. |
| `components/` | 38 arquivos, ~5.400 linhas | Shell (`product-shell`, `global-topbar`, `global-notice-center`, `workspace-frame`), `auth/`, `editorial/` (Operational Grid, DNA panels, Tiptap writer), `lifecycle/`. | `editorial-pipeline-context.tsx` (779 linhas) mantém estado Radar → Publicações com fallback local. |
| `lib/<domínio>` | 357 arquivos, ~59.000 linhas | Contratos Zod, engines determinísticos, projeções, adapters. Padrão `x-core.ts` puro + `x.ts` com `server-only`. | Entrelaçamento cruzado: `lib/server/dataforseo-serp-normalizer.ts` importa de `lib/radar` e `lib/minerador`; `lib/arquiteto` reexporta de `lib/server`. |
| `lib/server/` | 63 arquivos, ~14.400 linhas | Autorização, repositórios, provedores, comunicação, Telegram, Google Cloud, worker. | 56 usam `import "server-only"`; 18 não, incluindo `authz.ts` e `integrations-runtime.ts` que criam clientes service role. |
| `types/` | 1 arquivo | `next-auth.d.ts` | Pacote `next-auth` não está instalado; compila só por `skipLibCheck`. |

Direção de dependência: `app → modules → components/lib` e `app/api → lib/server → lib/<domínio>`. O produto é um monólito modular multi-marca com tenancy `Plataforma → Agência → Marca` e tenant editorial `brandId = marcas.id`.

### 4.2 Autenticação e sessão

- **100% Supabase Auth SSR** (`@supabase/ssr`): cookies renovados pelo `proxy.ts` (middleware do Next 16) em toda rota fora de `/api`; `requireSupabaseUser()` usa `getUser`, nunca claims do cookie.
- **Fluxos:** login manual (`signInWithPassword`), cadastro manual (SDK no browser), cadastro convidado (`auth.admin.createUser` + login), confirmação por `verifyOtp` com `token_hash`, callback PKCE, signout server e client, reenvio de confirmação.
- **Session slots:** `/auth/new-slot` gera subdomínio `s-<id>.<host>` para sessão isolada; usado por "Entrar em outra conta" e por links transacionais de convite. Requer `APP_BASE_URL`; `SESSION_SLOT_ROOT_DOMAIN` não está em `.env.example`.
- **Google OAuth:** preparado (`lib/auth/google-oauth.ts`, botão), mas a tela de login não importa o botão e a flag `GOOGLE_LOGIN_ENABLED` não tem consumidor. Efetivamente desligado.
- **Resíduos NextAuth:** `types/next-auth.d.ts`, `lib/server/supabase-auth-tokens.ts` (188 linhas sem importadores), `/api/auth/google-client-id`, diretório `app/api/auth/[...nextauth]` vazio, `README.md` e `.env.example` ainda citam NextAuth.

### 4.3 Autorização e multi-tenant

**Modelo de papéis:**
- Plataforma: `perfis.role` (`admin` | `cliente`). Admin global não recebe acesso editorial a marcas nem a agências.
- Agência: `agencies.owner_user_id`, `agency_memberships.role`, `agency_membership_capabilities`, `agency_brands`, `brand_agency_capability_restrictions`. Capabilities: brand_data, brand_collaborators, brand_dna, minerador, arquiteto, radar, planejador, redator, publicacoes, activity, notifications.
- Marca: `marcas.owner_user_id`, `brand_memberships` + `brand_roles.slug` (brand_admin, editor, reviewer, specialist, reader), `brand_member_permissions` (module, action, granted) com ações view, comment, create, edit, review, approve, export, publish, manage.
- Resolução: owner → membership ativa → owner ou membro de agência vinculada → negado.
- `brandRef = slug--uuid` e `agencyRef` estritos: renomear a marca invalida URLs antigas (404 `BRAND_REF_MISMATCH`).

**Quatro implementações paralelas:**

| Stack | Arquivos | Consumidores | Risco |
|---|---|---|---|
| Canônica | `lib/tenant/canonical-authorization.ts` (pura) + `lib/server/canonical-authorization.ts` | layouts, `/api/contexts`, `/api/marcas`, agência, conta, 18 rotas | Referência a consolidar. |
| Legada `authz.ts` | `lib/server/authz.ts` + `editorial-authorization.ts` | **59 arquivos, 35 rotas** | Cai para anon key sem service key; lê `brand_memberships.role === "owner"` enquanto a canônica lê `brand_roles(slug)`; consulta `briefings_artigos`. |
| `tenant-context.ts` | `lib/server/tenant-context.ts` | 7 rotas do Minerador | Reimplementa a cadeia com tolerância a "coluna inexistente". |
| RPC do pipeline | `lib/server/pipeline-runtime.ts` | 15 rotas do Arquiteto + radar-topics | Decisão no banco (0021). |

Código sem consumidor: `lib/server/agency-context.ts` (trata admin global como admin da agência, contradiz a canônica) e `lib/server/operational-permissions.ts`. Listas de capabilities repetidas em 4 lugares, ações em 3, enums de módulo em 4.

**Caminhos legados vivos:** `proxy.ts` redireciona `/minerador` para `/selecionar-marca?continuar=…`, mas a página ignora `continuar` (destino perdido); `select-brand-client.tsx` não é mais renderizado; `components/brand-context.tsx` e `/api/marcas` devolvem `role: admin | cliente` por compatibilidade; `components/app-menu.tsx` é "compatibilidade temporária".

### 4.4 Persistência

- **Três fábricas de cliente:** `editorial-db.ts` (singleton service role, `OptimisticLockError`), `canonical-authorization.ts` (`createCanonicalServiceClient`, service role obrigatória) e `authz.ts` (service role **ou anon**).
- **Duas gerações de repositórios:** geração 1 (`editorial-repositories.ts`, classes sem contexto, usadas por `/api/editorial/*`; três classes vazias: `MembershipRepository`, `PermissionRepository`, `DelegatedAccessRepository`) e geração 2 (`pipeline-runtime.ts` + `pipeline-repositories.ts`, ligadas a `PipelineContext`, resultados tipados, dedupe por `content_hash`, usadas pelo Arquiteto).
- **Artefatos versionados:** `VersionEnvelope` (versionId, entityId, versionNumber, previousVersionId, contentHash, origin, changeReason, createdBy, payload) em `editorial_artifact_versions`. Arquiteto tem readback validado campo a campo após cada RPC (silo pair, working copy, link graph).
- **Browser como fonte de verdade (contra ADR-007):**

| Chave | Arquivo | Situação |
|---|---|---|
| `minerador-pro:site-workspace:{user}:{brand}` | `lib/marca/site-store.ts` | **Fonte única** do Site/Sitemap da Marca, sempre `local_fallback`. Migration canônica de 2026-09-02 existe, não aplicada. |
| `minerador-pro:workflow-recovery:{user}:{brand}` | `components/editorial-pipeline-context.tsx` | Vira verdade offline quando `/api/editorial/workspace` falha. |
| `minerador-pro:architect-review:*`, `architect-article-dna`, `architect-silo-dna`, `architect-serp-formation` | `lib/editorial/architect-recovery.ts`, `arquiteto-workspace.tsx` | Revisão em andamento vive só em IndexedDB até virar DNA canônico. |
| `last-view`, `global-navigation`, `shell-expanded`, scroll de grid | vários | Preferências de UI, revalidadas no servidor. Aceitável. |

### 4.5 Integrações e provedores

- **Governança** (`lib/server/integrations-runtime.ts`, 1.224 linhas): providers, capabilities, connections (platform, agency, brand), grants, bindings, quotas, ledger de uso. **Política vigente `HOMOLOGATION_ALLOW_ALL`:** toda operação resolve para a única Connection global READY do provider, entitlement sempre disponível, quota ilimitada. O caminho grant → binding → connection → quota está implementado mas dormente. A UI de governança da agência grava bindings e quotas que o runtime ignora.
- **Segredos:** Vault via RPCs `integration_secret_resolve` e `integration_secret_store_upsert`, payload validado por provider. Google Ads é híbrido (developer token, client id/secret e customers em ENV; refresh token no Secret Store). Resend usa `platform_communication_config`. Hoje **tudo é escopo Plataforma**; não há segredo de agência nem de marca em uso.

| Provider | Estado | Uso |
|---|---|---|
| DeepSeek | Completo, única IA (`generateStructuredAI`, `generatePlainTextAI`) | Arquiteto, Minerador, Radar, Redator, worker |
| DataForSEO | Completo (allintitle, keyword overview, SERP regular e advanced) | Minerador, Arquiteto, Radar |
| Google Ads | Completo para conta Research da Plataforma (REST v25) | Discovery e métricas; binding por marca é stub que lança |
| Google Cloud Speech e Storage | Completo, carregado por `import()` dinâmico | Worker (transcrição, mídia temporária) |
| YouTube Data | Operação e health existem | Sem consumidor de produto (parcial) |
| Telegram | Completo (webhook com secret timing-safe, dedupe, onboarding, briefs, contribuições) | Radar / especialistas |
| Resend | Completo para convites de agência (outbox com lease, templates) | Onboarding; convites de marca não usam |
| Serper | **Morto**, zero importadores fora de testes | — |

- **Health checks** (`platform-integrations-health.ts`): Google Ads `listAccessibleCustomers`, DataForSEO **chamada allintitle real e paga**, DeepSeek `/models`, Google Cloud, YouTube, Telegram `getMe`.

### 4.6 Local worker

- `scripts/local-worker.mts` (`pnpm local-worker:once`), gates `LOCAL_WORKER_RUN=1` e `LOCAL_WORKER_ACTOR_USER_ID`. **Um job por invocação, sem loop, sem daemon, sem cron.**
- Runner com `claim_external_processing_job` (lease 300 s), heartbeat, backoff `min(attempts×60s, 15min)`, `FAILED_FINAL` em `max_attempts`.
- Três jobs encadeados: `telegram_media_preservation` (download → GCS) → `speech_transcription` (Google Speech) → `document_extraction` (DeepSeek organiza transcrição, `humanDecisionRequired: true`).

### 4.7 Sistema visual

- Skill `.agents/skills/app-visual-system/` + `docs/compartilhado/sistema-visual.md`: proibição de roxo, paleta única em `app/globals.css` (Tailwind 4 CSS-first, `@theme inline`), piso tipográfico, GlobalTopbar congelada (40 px), InfoHint, InlineLabelCluster, Operational Grid.
- Guard `scripts/check-visual-system.mjs` passa: 250 arquivos, 0 roxo, **714 itens de dívida tolerados no baseline** em 34 arquivos (168 em `minerador-workspace.tsx`, 97 em `arquiteto-workspace.tsx`, 58 em `radar-analysis-page.tsx`).
- `docs/compartilhado/operational-grid.md` ainda diz "Planejado" para algo já implementado em `components/editorial/operational-data-grid.tsx`.

### 4.8 Dívidas e cheiros de código

| Item | Detalhe |
|---|---|
| Arquivos gigantes | `arquiteto-workspace.tsx` 6.954 linhas (23 useState, 27 useEffect, 24 `any`, 4 eslint-disable); `minerador-workspace.tsx` 4.241 (40 useState, 12 fetch); `lib/arquiteto/contracts.ts` 1.684; `platform-integrations-admin.ts` 1.640; `dna-panels.tsx` 1.366; `integrations-runtime.ts` 1.224 |
| Marcadores | 0 TODO/FIXME, 0 ts-ignore, 2 `@deprecated`, 34 `any` (todos nos dois workspaces), 17 eslint-disable |
| Stubs que sempre lançam | `ai-provider-config.ts:resolveAIProvider`, `google-ads-canonical.ts` (binding por marca), classes vazias em `editorial-repositories.ts` |
| Mojibake em mensagens de usuário | `lib/server/canonical-authorization.ts` (4 ocorrências), `app/api/generate-briefing/route.ts`, `app/api/analyze/route.ts` |
| Código morto | `lib/server/marcas-access.d.mts` (declara módulo `.mjs` inexistente), `types/next-auth.d.ts`, `supabase-auth-tokens.ts`, `auth-feature-flags.ts`, `agency-context.ts`, `operational-permissions.ts`, `serper-provider*.ts`, `select-brand-client.tsx`, `google-oauth-button.tsx` não importado, 8 dirs vazios |
| Duplicações | Cadeia owner→member→agency 3 vezes + RPC; heurísticas de SERP copiadas entre `dataforseo-serp-normalizer.ts` e `serper-provider-core.ts`; `brand-ai-context.ts` em `marca` e `planejador`; `strategic-context.ts` em 3 módulos; shims cross-domínio de 1–2 linhas |
| Config | `.gitignore` tem `!.env.example` seguido de `.env.example` (linha posterior vence, arquivo fica ignorado apesar de versionado); `.next-codex-verify/` (saída de build) versionado no Git e deletado localmente |
| Nomenclatura | Mistura pt/en em tabelas (`marcas.nome`, `marca_id` vs `brand_id`) e rotas (`/api/marcas`, `/api/marca/site`, `/api/tenants`, `/api/contexts`) |
## 5. Superfície de APIs (87 rotas)

Todas as 83 rotas em `app/api/**/route.ts` e as 4 em `app/auth/**/route.ts` foram lidas. Não há middleware em `/api` (`proxy.ts` exclui o prefixo), então cada handler é o único guard de si mesmo. Todos os handlers autenticados chamam o guard antes de tocar dados.

Legenda de guards:

| Sigla | Guard | Onde |
|---|---|---|
| **S** | `requireCanonicalSessionProfile()` | `lib/server/authz.ts` |
| **A** | S + `assertCanAccessMarca()` — owner, membership ativa ou agência vinculada; **não** verifica módulo:ação | `lib/server/authz.ts` |
| **E(mod,ação)** | S + `assertEditorialPermission()` | `lib/server/editorial-authorization.ts` |
| **T(mod,ação)** | S + `requireTenantPermission()` | `lib/server/tenant-context.ts` |
| **P(mod,ação)** | `resolvePipelineContext()` → RPCs `canonical_actor_can_access_brand` e `canonical_actor_can_use_brand_action` | `lib/server/pipeline-runtime.ts` |
| **ADM** | `requireCanonicalPlatformAdmin()` | `lib/server/canonical-authorization.ts` |
| **BM** | `requireCanonicalBrandManageOrPlatformAdmin()` | idem |
| **ACT** | `requireCanonicalActorUserId()` (só identidade) | idem |
| **AG** | ator + `resolveStrictAgencyRef` + acesso operacional à agência | `lib/server/agency-workspace.ts` |
| **SITE** | A + exige `marcas.site_url` | `app/api/marca/site/_helpers.ts` |
| **—** | nenhum guard (público) | |

### 5.1 Inventário por área

**Auth**

| Rota | Métodos | Guard | Função | Notas |
|---|---|---|---|---|
| `/auth/callback` | GET | — | Troca `code` PKCE por sessão | Não consulta `GOOGLE_LOGIN_ENABLED` |
| `/auth/confirm` | GET | — | `verifyOtp` por `token_hash` (signup, magiclink, recovery, invite) | |
| `/auth/new-slot` | GET | — | Cria slot de sessão isolada (`s-<id>.<host>`) | |
| `/auth/signout` | POST | sessão | `signOut` e redirect para `/login` | |
| `/api/auth/google-client-id` | GET | — | Expõe `GOOGLE_CLIENT_ID` | **Órfã**, resíduo NextAuth |
| `/api/auth/invited-signup` | POST | token de convite | `auth.admin.createUser` + login | Sem rate-limit |
| `/api/auth/signup` | POST | — | Cadastro via REST GoTrue | **Órfã** (cadastro usa SDK no browser); sem rate-limit |

**Admin (todas ADM)**

| Rota | Métodos | Função | Notas |
|---|---|---|---|
| `/api/admin/agencies` | GET, POST, PATCH | Lista agências; PATCH membership, status, vínculo de marca | POST → 405; ações legadas de acesso → 410 |
| `/api/admin/agencies/users` | GET | Busca usuários Auth | Duplicata de `/api/admin/owners` |
| `/api/admin/agency-applications` | GET, PATCH | Aprova, rejeita, reenvia (Resend) | Erro desconhecido vira 403 |
| `/api/admin/agency-invitations` | GET, POST, PATCH | Convite direto, rotação, revogação | Erro desconhecido vira 403 |
| `/api/admin/communication` | GET, POST | Config Resend, teste, dispatch | Todo erro vira 400 |
| `/api/admin/integrations` | GET, POST | Catálogo de integrações, 13 ações (providers, connections, grants, Google Ads, DeepSeek, Telegram webhook, health) | |
| `/api/admin/owners` | GET | Busca usuários Auth | Duplicata |
| `/api/admin/users` | GET, PATCH | Lista usuários e altera papel global | |

**Agências e onboarding**

| Rota | Métodos | Guard | Função | Notas |
|---|---|---|---|---|
| `/api/agencies/[agencyRef]` | PATCH | AG | Renomeia agência | |
| `/api/agencies/[agencyRef]/brands` | POST | AG | Cria marca vinculada | |
| `/api/agencies/[agencyRef]/members` | GET, POST, PATCH | AG | Membros e capabilities | |
| `/api/agencies/[agencyRef]/integrations` | GET, POST | AG | Distribuir DataForSEO a marcas, quotas | Capability hard-coded `dataforseo.allintitle`; runtime ignora bindings (política `HOMOLOGATION_ALLOW_ALL`) |
| `/api/agency-applications` | POST | — | Solicitação pública de agência | **Service role sem sessão, sem rate-limit** |
| `/api/onboarding/agency` | GET, POST | token / `requireSupabaseUser` | Conclui onboarding e cria agência | Único handler que usa `requireSupabaseUser` direto |
| `/api/onboarding/agency/continue` | GET | token | Redireciona para cadastro ou login | |
| `/api/tenants` | GET | ACT | Lista marcas acessíveis | **Órfã**, substituída por `/api/contexts` |

**Marca**

| Rota | Métodos | Guard | Função | Notas |
|---|---|---|---|---|
| `/api/marca/brand-dna` | GET, POST | E(marca, view/edit/approve) | Versões de BrandDNA | |
| `/api/marca/skills` | GET, POST | E(marca, …) | Brand Skills versionadas | |
| `/api/marca/site/import/keywords` (+ `/preview`) | POST | SITE | Importa keywords do site para lista do Minerador | **Escreve em `minerador_keywords` sem `minerador:create`** |
| `/api/marca/site/lists` | GET | SITE | Listas da marca | |
| `/api/marca/site/page/verify` | POST | SITE | Verifica canonical/indexabilidade | Host restrito (mitigação SSRF) |
| `/api/marca/site/sitemap/sync` | POST | SITE | Crawla sitemap | **Não persiste nada** (run com id aleatório) |
| `/api/marca/site/sitemap/test` | POST | SITE | Testa sitemap | |
| `/api/marcas` | GET, POST, PUT, DELETE | GET ACT; PUT BM; DELETE ADM | Catálogo, atualização, exclusão | POST → 405 com código antigo comentado; PUT devolve erro cru do Postgres |
| `/api/marcas/[brandId]/experts` | GET, POST | BM | Especialistas e bindings Telegram | |

**Minerador (todas T, exceto onde indicado)**

| Rota | Métodos | Guard | Função | Provedor |
|---|---|---|---|---|
| `…/dataforseo/allintitle` | POST | T(minerador, edit) + quota | Allintitle, Keyword Overview, SERP advanced; persiste medição e qualificação semântica | DataForSEO |
| `…/discovery/import` | POST | T(minerador, create) | Importa candidatas aprovadas (idempotente) | — |
| `…/discovery/sources` | GET, POST | T(view/edit) | Run de descoberta manual/CSV | 503 se migration 0040 ausente |
| `…/google-ads/conexao` | GET, POST | T(view) / — | GET expõe `customerId` mascarado; POST sempre 409 | Stub |
| `…/google-ads/descobrir-keywords` | GET, POST | T(view/edit) | Keyword Planner ideas | Google Ads v25 |
| `…/google-ads/metricas-keywords` | POST | T(edit) | Métricas históricas | Google Ads |
| `…/ia/brief-apresentacao` | POST | T(edit) | Apresentação contextual com BrandDNA e Skills | DeepSeek |
| `…/keywords/delete`, `/delete/preview`, `/purge`, `/restore` | POST | T(manage) | Lifecycle de exclusão via RPCs `lifecycle_*` | — |
| `…/keywords/recoverable` | GET | T(view) | Lista recuperáveis | — |

**Arquiteto (todas P, exceto onde indicado)**

| Rota | Métodos | Guard | Função | Notas |
|---|---|---|---|---|
| `/api/arquiteto/article-dna` | POST | P(create) | Gera ArticleDNA via DeepSeek | |
| `/api/arquiteto/artifacts` | GET, POST | P(view/create/edit) | Lista e anexa artefatos | |
| `/api/arquiteto/handoff` | POST | P(create) | Handoff Minerador → Arquiteto | Dirs vazios `preview` e `rebaseline` ao lado |
| `/api/arquiteto/internal-link-graph` (+ `/proposals`, `/working-copy`) | GET, POST, PATCH | P | InternalLinkGraph, propostas de IA, working copy | RPCs transacionais |
| `/api/arquiteto/publication/verify` | POST | SITE + E(arquiteto, edit) | Verifica URL publicada | Não grava |
| `/api/arquiteto/serp` | POST | E **e** P | SERP para formação de artigos | Dupla autorização; persistência delegada ao cliente |
| `/api/arquiteto/silo-consolidation` | POST | P(create/edit) | Consolidação Silo-first atômica | |
| `/api/arquiteto/silo-dna`, `/silo-page` | POST | P(create) | Gera SiloDNA e SiloPage via DeepSeek | |
| `/api/arquiteto/silo-pair` | POST | P | Persiste par SiloDNA/SiloPage **só em draft** | Comentário diz "sem chamador", mas `lib/arquiteto/canonical-persistence.ts` chama |
| `/api/arquiteto/silo-review` | POST | P(**view**) | Proposta de IA sobre working copy de silos | Consome DeepSeek com permissão `view` |
| `/api/arquiteto/silos` | POST | P(create) | Cria silo manual | |
| `/api/arquiteto/workspace` | GET, PATCH | P(view/edit) | Workspace canônico, territórios, working copies | |

**Editorial / Radar / Redator / Publicações**

| Rota | Métodos | Guard | Função | Notas |
|---|---|---|---|---|
| `/api/editorial/documents` | PATCH, POST | E(redator, edit/view) | Salva documento com Guardian | |
| `/api/editorial/expert-briefs` (+ `/send`) | GET, POST, PATCH | A + E(radar) | Pautas para especialistas; envio via Telegram | |
| `/api/editorial/invitations` | POST | A + E(marca, manage) | Convite de colaborador de marca | **Responde `emailSent:false`, "sem provedor"**, embora Resend exista |
| `/api/editorial/radar-analysis` (+ `/extract`) | GET, POST | E(radar) | Análise do Radar; extração de concorrentes | |
| `/api/editorial/radar-topics` | POST | P(radar, edit) | 3–5 pautas via DeepSeek | Persistência local |
| `/api/editorial/serp` | GET, POST | E(radar) | SERP do Radar com DataForSEO | Ainda resolve ids `pub-b-*` em `briefings_artigos` |
| `/api/editorial/views` | GET, POST, DELETE | E(mod, **view**) | Saved views | Mutação exige só `view` |
| `/api/editorial/workflow` | POST | E por ação | Comandos Radar → Planejador → Redator → Publicações | Única "rota" do Planejador |
| `/api/editorial/workspace` | GET | E(marca, **view**) | Workspace editorial completo | Só `marca:view` lê tudo, inclusive convites |
| `/api/redator/guardian`, `/improve`, `/section` | POST | E(redator) | Guardian, melhoria e escrita de seção (DeepSeek) | |
| `/api/publicacoes` | POST | E(publicacoes) | Ações de publicação com lock otimista | |

**Contextos, webhooks e legadas**

| Rota | Métodos | Guard | Função | Notas |
|---|---|---|---|---|
| `/api/contexts` (+ `/restore`) | GET, POST | ACT | Índice de contextos e restauração segura | 409 se não-admin tem mais de uma agência |
| `/api/communication/delivery` | POST | HMAC | Eventos de entrega | Formato próprio, **incompatível com webhook nativo do Resend** |
| `/api/integrations/telegram/webhook` | POST | secret header | Onboarding, seleção de brief, contribuições | Dedupe por `update_id` |
| `/api/analyze` | POST | A | Análise comportamental via DeepSeek, grava `analise_semantica` | **Em uso** pelo Minerador; guard fraco; mojibake em mensagens |
| `/api/process-intent-niche` | POST | A | Intenção/nicho e revisão semântica (stream NDJSON) | **Em uso**; modo `legacy` ativo |
| `/api/inteligencia` | GET | A | Snapshot editorial | **Em uso**; lê `briefings_artigos` |
| `/api/revalidate-structure` | POST | A | Revisão IA de distribuição de keywords (Arquiteto) | **Em uso**; fora de `/api/arquiteto`, sem P |
| `/api/clusterize` | POST | A | Clusteriza via DeepSeek | **Órfã** |
| `/api/generate-briefing` | POST | A | Gera briefing e grava em `briefings_artigos` | **Órfã**; única escrita na tabela legada |
| `/api/mine` | POST | — | Sempre 410 (Google Sheets legado) | Stub |
| `/api/volume` | POST | — | Sempre 410 | Stub; `tests/run-all.js` espera 401 |

### 5.2 Padrões de autorização e inconsistências

- **Quatro guards paralelos** decidem "módulo:ação por marca" sem reutilização entre si: `assertEditorialPermission`, `requireTenantPermission`, `resolvePipelineContext` (RPC) e o mais fraco `assertCanAccessMarca`. E e T duplicam a mesma semântica em TypeScript; P move a decisão para o banco.
- **Escritas no Minerador com guard fraco:** `/api/marca/site/import/keywords`, `/api/analyze` e `/api/process-intent-niche` gravam em `minerador_keywords` (e gastam DeepSeek) exigindo só acesso à marca. Um membro `reader` passa.
- **Consumo de IA com permissão `view`:** `/api/arquiteto/silo-review`.
- **Mutação com `view`:** `/api/editorial/views` POST e DELETE.
- **Dupla autorização** em `/api/arquiteto/serp` (E e P na mesma request).
- **Endpoints públicos sem rate-limit ou captcha:** `/api/agency-applications` (service role), `/api/auth/signup`, `/api/auth/invited-signup`.
- **Mapeamento de erro inconsistente:** a mesma exceção desconhecida vira 403, 401, 400 ou 500 conforme a rota; `silo-review`, `radar-topics` e PUT `/api/marcas` devolvem `error.message` cru.
- **Clientes service-role duplicados** em 4 rotas admin; `lib/server/authz.ts` cai para a **anon key** se `SUPABASE_SERVICE_ROLE_KEY` faltar.
- **Feature flag sem consumidor:** `GOOGLE_LOGIN_ENABLED` não é lida por nenhum handler.

### 5.3 Rotas órfãs, stubs e lacunas

- **Órfãs funcionais (candidatas a remoção):** `/api/clusterize`, `/api/generate-briefing`, `/api/tenants`, `/api/auth/signup`, `/api/auth/google-client-id`, `/api/admin/owners` (duplicata).
- **Legadas ainda em uso, fora do namespace canônico:** `/api/analyze`, `/api/process-intent-niche`, `/api/inteligencia`, `/api/revalidate-structure`.
- **Stubs:** `/api/mine` (410), `/api/volume` (410), `POST /api/marcas` (405), `POST /api/admin/agencies` (405), `POST google-ads/conexao` (409), `silo-pair` não-draft (409). Nenhuma rota devolve 501.
- **Sete diretórios vazios** em `app/api`: `auth/[...nextauth]`, `extensao/marcas/[brandId]/{keywords/import, keywords/resultados-allintitle, listas, volume}`, `arquiteto/handoff/{preview, rebaseline}`.
- **Documentado mas inexistente:** `/api/extensao/*` (cerca de 40 citações), `/api/arquiteto/handoff/preview` e `/rebaseline`, `/api/auth/[...nextauth]` (11 citações), `/api/arquiteto/revalidate-structure`, nomes antigos de rotas Google Ads. `/api/mine` (29 citações) e `/api/volume` (23) ainda descritos como funcionais.
- **Lacunas funcionais:** convites de colaborador de marca nunca enviam e-mail; sync de sitemap não persiste; `arquiteto/serp` e `radar-topics` deixam persistência a cargo do cliente; não há adaptador do webhook nativo do Resend; Planejador não tem rota própria.
- **Provedores por rota:** DeepSeek em 14 rotas, DataForSEO em 4, Google Ads em 3, Resend em 5, Telegram em 3, Google Cloud e YouTube só via health-check. Rotas de IA que **não gravam** `integration_usage_events`: `clusterize`, `generate-briefing`, `analyze`, `revalidate-structure`, `redator/*`, `arquiteto/{article-dna, silo-dna, silo-page, silo-review}`, `radar-topics`.
## 6. Estado funcional por módulo

Cruzamento entre `estado-atual.md` de cada módulo, o código presente no checkout e os testes executados. "Homologado" significa smoke real registrado pelo usuário nos docs.

| Módulo | Implementado e evidenciado | Em andamento (última data) | Situação real |
|---|---|---|---|
| **Admin / Plataforma** | `/admin` com abas usuários, agências, marcas, integrações e comunicação; onboarding de agências (trial público e convite confiável, 0037/0039 homologados); comunicação Resend com e-mails reais; catálogo de integrações com Connections `READY` para DataForSEO, DeepSeek, Google Cloud, YouTube, Telegram e Google Ads com rotação de refresh token. | Consolidação das integrações e Telegram (2026-08-25). | Fundação pronta. Faltam webhook Telegram público, smokes de operação Speech/Storage/YouTube, ACL 0022/0023, enforcement de agência expirada, billing e notificações. |
| **Conta** | `/conta` pessoal, login, cadastro, recuperação e sessões isoladas por slot; edição de nome com readback; editor de avatar preparado. | Identidade funcional (2026-08-18). | Migration 0045 do bucket de avatar ainda por aplicar. Senha, sessões e preferências persistidas sem contrato. Escopo mínimo de Conta "a definir com produto" desde julho. |
| **Marca** | Contexto `/{brandRef}` server-side; BrandDNA versionado; Brand Skills com primeira skill real persistida e consumida pelo Minerador; especialistas externos; Site/Sitemap com preview, verificação e importação seletiva para o Minerador. | **Site/Sitemap canônico (2026-09-02):** SDD aprovada, domínio puro pronto, migrations `20260902120000` e `130000` criadas, adendo A1 com materialização remota PASS. | Catálogo de site ainda vive só em IndexedDB (`lib/marca/site-store.ts`). Faltam Fases A2 a 6 (exclusividade de run, repositórios, persistência do sync, UI remota, `readBrandSiteSnapshot`, smoke cross-browser). Isso bloqueia a Base Territorial do Arquiteto. |
| **Minerador** | Discovery Google Ads (ideas e métricas históricas), allintitle DataForSEO, CSV e manual, processador lógico, Nicho/Intenção, KGR, Perfil da keyword, lifecycle de exclusão 0046/0047, Qualificação Semântica por SERP `advanced` persistida, Apresentação Contextual DeepSeek com Voz da Marca persistida, aprovação humana sem gates editoriais (2026-08-29). | Adendo de aprovação sem gates e persistência da apresentação (2026-08-28/29). SDD R6 de artefatos independentes (2026-08-24) ainda não implementada. | **Único módulo homologado ponta a ponta.** Pendentes: validação manual da aprovação sem gates, smoke ponta a ponta com `presentationRef` até o Arquiteto, reconciliação do ledger de migrations, thresholds v2 provisórios, remoção do código legado da extensão. A tela (`minerador-workspace.tsx`) continua monolítica e ainda usa rotas legadas `/api/analyze` e `/api/process-intent-niche`. |
| **Arquiteto** | Planilha única nos modos Artigos, Silos e Links; ArticleDNA, SiloDNA, SiloPage no runtime canônico; InternalLinkGraph com fundação remota aplicada, readback e isolamento cross-brand PASS; SERP de formação com veredito; revisão IA persistida (`article_architecture_ai_review`); regra final de KGR do artigo; aba Links Internos com React Flow (28 testes). | **Rearquitetura Silo-first (13 seções em 2026-09-02):** território sobre `editorial_workflow_items`, SiloWorkingCopy remota, RPCs `persist_silo_working_copy_atomic` e `persist_silo_from_working_copy_atomic` (`20260902140000/150000`), cenários arquiteturais completos (Fase 1 de 6). | Forte cobertura de testes (735 no `test:arquiteto`) mas **quase nada validado manualmente ou remotamente**. Bloqueadores declarados: `SILO_PAGE_APPROVAL_SERVER_GATE = MISSING`, UI não consome working copy remota nem rota de consolidação, smokes de território e RPCs 2C aguardam o usuário, Base Territorial bloqueada pela fonte de Site da Marca. Migrations 2C com status contraditório nos docs. |
| **Radar** | Rotas `/radar` e `/radar/{articleId}`; Workbench R2 a R7 (SERP, Amazon, conteúdo, especialista, relatório, fila sequencial); SERP DataForSEO real com smoke E2E; curadoria homologada; handoff v2 para o Planejador PASS; ExpertBrief, Telegram, ExpertContribution, Local Worker (Speech, Storage, DeepSeek) implementados. | Fase "Especialista → ExpertBrief → ExpertContribution → Evidence" (2026-08-26). | Infraestrutura completa, mas o fluxo de especialistas está inteiro `IMPLEMENTED_NOT_SMOKED`: sem especialista ativo na marca de teste, sem webhook Telegram, sem inbound E2E, sem STT e GCS reais. ExternalEvidence e nova coleta SERP aguardam gates próprios. |
| **Planejador** | ContentPlan v2 determinístico, cockpit em 5 etapas, hidratação, estratégia KGR/volume, identidade publicada protegida, leitura do handoff v2 do Radar, builder de Brand Context. Tudo confirmado por testes locais. | Brand Skills + IA (2026-08-28). | Não tem rota HTTP própria (só comandos em `/api/editorial/workflow`). Runtime é determinístico e **não faz nenhuma chamada de IA**. Sem validação manual autenticada de um ContentPlan real. |
| **Redator** | Tiptap, autosave com `lock_version`, recovery local, Guardião determinístico, escrita por seção e melhoria de trecho via DeepSeek, aprovação bloqueada por findings. Verificado no código e testes. | Nenhuma entrada desde 2026-07-23. | Sem validação manual ponta a ponta. Relatório do Guardião não persistido. Comentários server-side não implementados (tabela `content_document_comments` só existe na proposta 0002, nunca aplicada). |
| **Publicações** | Importação idempotente de aprovados, biblioteca, fila, exportação Markdown/JSON/CSV, registro manual de URL, histórico, reedição preservando `published`. Verificado no código e testes. | Nenhuma entrada desde 2026-07-23. | Sem validação manual. Sem integração com CMS ou WordPress (capabilities futuras na SDD de integrações). Docs ainda condicionam persistência à "migration 0002", superada por 0029. |
| **Integrações / compartilhado** | Supabase Auth SSR canônico; autorização 0015/0017/0021; lifecycle global 0047 com confirmação tipada; runtime e repositórios do pipeline; governança de integrações 0024/0025; sistema visual com guard; InfoHint e ajuda contextual. | SDDs de Telegram, Google Cloud Media, DataForSEO SERP compatibility (08-24/25), handoff Radar → Planejador (08-26). | Governança de grants/bindings/quotas dormente (`HOMOLOGATION_ALLOW_ALL`). MCP e agentes são backlog futuro explícito. `/api/mine` e Google Sheets em `410` aguardando decisão. Rotas `/{brandRef}/integracoes` e `/agencias/{agencyRef}/integracoes` planejadas, não implementadas. |

## 7. Processos ainda não implementados

Consolidado e deduplicado a partir dos `backlog.md`, `estado-atual.md`, SDDs e `task.md`. Prioridade sugerida: **P0** bloqueia o resto; **P1** próxima frente conforme a ordem oficial; **P2** depois; **F** explicitamente futuro ou dependente de SDD.

### Transversal e infraestrutura

- **P0 — Commit de checkpoint.** 452 arquivos não rastreados, 237 modificados, 20 migrations fora do Git, `.git/index.lock` obsoleto citado nos docs do Arquiteto. Remover `.next-codex-verify/` do Git (1.005 arquivos de build rastreados).
- **P0 — Reconciliação do ledger de migrations** (`MIGRATION_LEDGER_RECONCILIATION = DEFERRED`, `db push` inseguro). Decidir o destino de 0046 (aplicada, revertida ou nunca aplicada), retirar ou arquivar 0002/0003/0004, documentar a ordem real de aplicação de 0044–0047 versus batches 2–6.
- **P0 — Confirmar no catálogo remoto** o estado das migrations com status contraditório nos docs: `20260824185700` (DataForSEO SERP compatibility, `PENDING_MANUAL_APPLY`), `20260825090000` e `20260825150000` (Google Cloud e Telegram, "pendente" no Admin, "REMOTE VERIFIED" no Radar), `20260829120000` (revisão IA), `20260902140000` e `20260902150000` (Silo-first 2C, "não executada" no backlog e "materialização PASS" no estado), `0045` (avatar).
- **P1 — Smoke real do lifecycle global** nas seis áreas e handlers de exclusão dos módulos além do Minerador.
- **P1 — ACL hardening 0022 e lifecycle 1:N de convites 0023**: adendo, snapshot, apply, pós-verificação. Revisão `CANONICAL_MUTATING_RPC_EXECUTE_ACL_REVIEW` e `ALTER DEFAULT PRIVILEGES` global.
- **P1 — Corrigir CHECK contraditório em `agency_memberships.role`** (0014 vs 0016 vs RPC 0021): hoje só `agency_admin` é criável.
- **P2 — Enforcement de agência expirada, billing e planos pagos, central de notificações, webhook `DELIVERED` do Resend homologado (formato atual é próprio e incompatível com o webhook nativo).**
- **P2 — Decisões pendentes em `task.md`:** estratégia final de criptografia, retenção de usage events, limites e custos, permissões delegáveis, Google Sheets e `/api/mine`, suporte global auditado.
- **F — Rotas `/admin/integracoes`, `/agencias/{agencyRef}/integracoes`, `/{brandRef}/integracoes`; IA própria por agência ou marca; Google Ads próprio por agência; WordPress; MCP e agentes (exige SDD de Agent Runtime, Delegation e Tool Gateway).**

### Marca (P1, primeira da ordem oficial)

- Site/Sitemap canônico Fases A2 a 6: exclusividade de execução `running` por marca, repositórios de sitemap/run/catálogo, persistência em `POST /api/marca/site/sitemap/sync` (hoje não grava nada), UI remota, `readBrandSiteSnapshot`, smoke cross-browser. Desbloqueia a Base Territorial do Arquiteto.
- Brand Skills: validações F5, aprovação, ativação e consumidor; gabaritos além de `brand_voice`; decidir se `SkillDefinition` vira registro global.
- Prompts e Materiais sem persistência ("Criar Skill a partir de Material" está como `em breve`).
- **F —** UI de restrições Marca → Agência; lifecycle de marca (standby, arquivamento, exclusão segura, `BRAND_LIFECYCLE_NEEDS_SDD`); membros e permissões por API exclusiva de marca; `activeBrandDnaVersionId`.
- Convite de colaborador de marca (`/api/editorial/invitations`) nunca envia e-mail apesar do Resend existir.

### Minerador (P1)

- Validação manual da aprovação sem gates e cross-browser da Apresentação Contextual persistida; F5 do lote de 8.
- Smoke ponta a ponta Minerador → Arquiteto com `presentationRef`.
- SDD R6 (envelope comum de artefato, tentativa e freshness) ainda não implementada.
- Reprocessar keywords cuja Qualificação só existia em sessão; histórico de versões no Perfil; recalibrar thresholds v2 (`PROVISIONAL_HEURISTIC`).
- Migrar `/api/analyze` e `/api/process-intent-niche` para `/api/minerador/marcas/[brandId]/…` com `requireTenantPermission`; remover RPC e código legado da extensão; decompor `minerador-workspace.tsx`.
- **P2 —** exportar candidatas, municípios no targeting, histórico navegável de pesquisas, smoke do Usage Google Ads Discovery, CSV sem silo.

### Arquiteto (P1)

- Gate server-side de aprovação da SiloPage (`SILO_PAGE_APPROVAL_SERVER_GATE = MISSING`), bloqueador da Fase 2C.
- Ligar a UI à working copy remota de Silo e à rota `/api/arquiteto/silo-consolidation` (hoje o fluxo só existe no servidor).
- Smokes do usuário: persistência remota de território, Article territorial, RPCs 2C.1 e 2C.4.2, cross-brand com segunda marca de teste.
- Fase 2 Silo-first (Base Territorial) bloqueada pela fonte canônica de Site da Marca; Fases 3 a 13 da SDD Silo-first e Fases 2 a 6 dos cenários arquiteturais.
- Smoke A a F da revisão IA; smoke completo Article KGR; ciclo Importação → Lógica → SERP → IA → Revisão → Aprovar → Pronto para Silos.
- IA de Links Internos (`InternalLinkGraphProposal` → comparação → revisão humana → aplicação parcial); homologação em Chrome de criar, salvar, editar e aprovar Graph.
- Pedido estrutural de persistência versionada da recomendação SERP de slug (`STRUCTURAL_REVIEW_REQUIRED`).
- Migrar `/api/revalidate-structure` para `/api/arquiteto/…` com `resolvePipelineContext`; resolver a contradição do `silo-pair` (comentário diz "sem chamador", `canonical-persistence.ts` chama); remover dirs vazios `handoff/preview` e `rebaseline`.
- Homologações manuais em Chrome de todos os lotes de 08-25 a 09-02 (planilha, mapa, painel expandido, GlobalTopbar em 360/768/1024/1440, light mode).
- Decompor `arquiteto-workspace.tsx` (6.954 linhas, 100 problemas de lint).

### Radar (P1 após Arquiteto)

- Nova coleta DataForSEO autorizada com snapshot, readback e histórico; só depois `RADAR_SERP_OPERATIONAL = PASS` e ExternalEvidence.
- Gates reais G1 a G11 do fluxo de especialistas: especialista ativo, binding Telegram, webhook público, inbound texto e depois áudio, Local Worker, GCS, STT, organização DeepSeek, ExpertEvidence, relatório, handoff. `DEEPSEEK_REAL_SMOKE = AWAITING_AUTHORIZATION`.
- **F —** worker genérico de lote SERP com jobs remotos; ProductEvidence/Amazon (exige Proposta de Evolução Modular); provider de fontes externas; rate limit e observabilidade de consultas pagas.
- Validação visual em claro/escuro e breakpoints; exclusão de duas identidades Auth temporárias.

### Planejador (P2)

- Validar manualmente um ContentPlan real em sessão autenticada (salvar sucessora, F5, aprovar, transferir ao Redator).
- Conectar a primeira chamada de IA real ao builder de Brand Context (runtime hoje é 100% determinístico).
- Persistência e readback remoto confirmados; hidratar destinos de links e fontes; adaptador funcional de `internalLinkGraphRef`.
- Criar rota própria do Planejador (hoje só `/api/editorial/workflow`).

### Redator (P2)

- Validar a jornada completa com fixture; relatório do Guardião persistido junto à versão; comentários server-side (a tabela não existe no banco canônico).
- Provedor de IA real na escrita e melhoria (hoje fixtures nos testes; rotas usam DeepSeek).

### Publicações (P2)

- Validar jornada completa; confirmar `lock_version` e payload aditivo no remoto; atualizar docs que citam a "migration 0002".
- **F —** integração CMS/WordPress (`wordpress_publish/update/media` como capabilities de escopo marca), publicação real e validação de URL externa.

### Conta e Admin (P2)

- Aplicar 0045 (bucket de avatar) com preflight e smoke de upload; revisar o bucket público com path previsível.
- Smokes manuais do shell (expansão, mobile 360 a 1440, dark mode); homologar `/conta` sem tenant e os quatro estados do workspace de agência.
- Senha, recuperação, sessões e preferências persistidas; gestão real de membros e convites de agência; superfícies `/dados`, `/atividade`, `/notificacoes`.
- Webhook Telegram público e inbound E2E; smokes de operação Speech/Storage/YouTube; rotação e health real do Google Ads.

## 8. Inconsistências documentais

### 8.1 Contradições abertas entre documentos

| Tema | Onde | Versão A | Versão B |
|---|---|---|---|
| Gate de importação Minerador → Arquiteto | `docs/04-arquiteto/estado-atual.md`, 2026-08-29 (duas seções do mesmo dia) | Exige KeywordDNA consolidada (`semanticState === "conclusive"`, 409 `KEYWORD_DNA_NOT_READY`) | "Gate simplificado: aprovado é suficiente", `SEMANTIC_GATE = REMOVIDO` |
| Fundação Telegram e Google Cloud | `01-admin/estado-atual.md`, `02-marca/estado-atual.md` vs `05-radar/estado-atual.md`, `06-planejador/estado-atual.md` | "não aplicadas remotamente, pendente" | `RADAR_TELEGRAM_FOUNDATION = READY`, "REMOTE VERIFIED" com smoke cross-brand |
| DeepSeek homologado | `task.md`, `runbook-homologacao-deepseek-fase-3` vs `01-admin` e `03-minerador/estado-atual.md` | `DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN`, Connection OpenRouter READY | Connection DeepSeek READY, smokes reais PASS na Care Glow |
| Migrations 2C do Arquiteto | `04-arquiteto/backlog.md` vs `estado-atual.md` | "USUÁRIO executa a migration. Não executada" (`20260902150000`) | "2C.4.2 materialização remota: PASS" |
| Aprovação SERP após F5 no Radar | `05-radar/estado-atual.md` e `backlog.md`, 2026-08-27 | `SERP_APPROVAL_RELOAD = FAIL_REMOTE_CONFIRMATION`, `RADAR_SERP_OPERATIONAL = BLOCKED` | Correção validada manualmente, item marcado como feito |
| NextAuth | `compartilhado/autenticacao-e-permissoes.md`, `09-conta/estado-atual.md`, ADR-019, `arquitetura.md` | "ainda possui consumidores ativos", "implementação bloqueada" | `package.json` sem `next-auth`, diretório de rota vazio, Fase 2C concluída |
| InternalLinkGraph no gate do Radar | `pipeline-editorial-papeis-handoffs.md`, `fluxo-oficial.md` vs `04-arquiteto/backlog.md` | "quando aplicável" | "Exigir Silo aprovado e InternalLinkGraph aprovado" |
| R5 semântico | `03-minerador/backlog.md` vs `spec.md` §59 e `estado-atual.md` | `R5_SEMANTIC_QUALITY_SMOKE = PENDING` | "R5 legado, não restaurar" |
| Schema editorial | `02-marca`, `06-planejador`, `07-redator`, `08-publicacoes` vs `01-admin` | Persistência condicionada à "migration 0002 não aplicada" | 0027/0028/0029 aplicadas com post-verifier PASS |

### 8.2 Documentos desatualizados

- Todos os `estado-atual.md` mantêm "Última auditoria: 2026-07-20" abaixo de dezenas de seções posteriores; os do Arquiteto (3.533 linhas), Minerador (2.545) e Radar (948) são diários sem índice, com seções superadas convivendo com as vigentes.
- `00-produto/visao-geral.md` e `arquitetura.md` descrevem o Minerador como "Supabase legado no cliente", citam NextAuth e Google Sheets como integrações e usam `keywords_kgr` e `listas_kgr` (37 e 29 arquivos ativos ainda citam os nomes pré-0036).
- `00-produto/backlog.md` e `task-functional-area-development.md` ainda pedem "escolher a primeira área funcional", apesar de Marca, Minerador, Arquiteto e Radar terem avançado mais de 30 seções datadas.
- `06-planejador` mantém dependência da "Fase 2A" e do "incidente 3B-R1", ambos superados; `01-admin/backlog.md` mantém smokes de 08-07 já cobertos; `04-arquiteto/backlog.md` "Bloqueado: novas operações de IA" contradiz a IA por Article ativa; `05-radar/backlog.md` ainda pede "não aplicar 0003".
- `02-marca/backlog.md` diz que `autenticacao-e-permissoes.md` e `persistencia-local.md` estão ausentes; ambos existem.
- `docs/compartilhado/operational-grid.md` diz "Planejado" para o grid já implementado.
- `docs/DOCUMENTATION_MIGRATION_REPORT.md` fala em 8 ADRs; há 21.

### 8.3 Referências a arquivos e rotas inexistentes

- `docs/00-produto/contratos/status.md`, `workflow.md`, `versionamento.md` (só existem `README.md` e `autorizacao.md`).
- `components/planejador/content-plan-editor.tsx`, `components/publicacoes/publications-workspace.tsx`, `components/product/operational-pages.tsx`.
- `docs/SUPABASE_BASELINE.md` (apontado por `supabase/baseline/README.md`).
- Scripts `test:minerador`, `test:radar`, `test:planejador`, `test:publicacoes`, `test:conta`, `test:admin`, `typecheck` (não existem em `package.json`).
- Rotas `/api/extensao/*` (cerca de 40 citações), `/api/arquiteto/handoff/preview` e `/rebaseline`, `/api/auth/[...nextauth]` (11), `/api/arquiteto/revalidate-structure`, `/api/minerador/.../google-ads/metrics` e `/discovery`. `/api/mine` (29 citações) e `/api/volume` (23) descritos como funcionais, mas são stubs 410.
- Migration `0031` não existe (salto 0030 → 0032) e nenhum doc de topo explica.

### 8.4 Defeitos de forma

- Mojibake (UTF-8 lido como Latin-1) em `ADR-015`, `01-admin/backlog.md` e 13 propostas; também em mensagens de usuário no código (`lib/server/canonical-authorization.ts`, `app/api/generate-briefing/route.ts`, `app/api/analyze/route.ts`).
- `invariantes.md` começa no item 13 e tem dois itens 13; `04-arquiteto/spec.md` começa em "## 31." antes do título e duplica §26 e §27; `03-minerador/spec.md` duplica "## 17." e desordena §45 a §51.
## 9. Qualidade, testes e higiene do repositório

Medido em 2026-09-02 com Node 24.14.1 e pnpm 10.33.0. Nenhum comando pago, remoto ou destrutivo foi executado. Logs em scratchpad (`tsc.log`, `lint.log`, `test-*.log`).

### 9.1 Typecheck, lint e guard visual

| Verificação | Resultado | Detalhe |
|---|---|---|
| `tsc --noEmit` | **5 erros em 3 arquivos** | 2 reais: `components/editorial/dna-panels.tsx:1146` (`unknown` → `string \| null`) e `lib/minerador/keyword-qualification.ts:157` (`semantic` pode ser null). 3 em `tests/agency-adalba-platform-internal.test.mts` (flag `/s` de regex exige `target ≥ es2018`; `tsconfig` está em ES2017). |
| `pnpm run lint` | **128 problemas (74 erros, 54 avisos)** | 100 em `modules/arquiteto/arquiteto-workspace.tsx`, 22 em `modules/minerador/minerador-workspace.tsx`. Regras: `no-explicit-any` 38, `no-unused-vars` 38, `react-hooks/*` novas 36 (`set-state-in-effect`, `preserve-manual-memoization`, `refs`, `purity`, `immutability`), `exhaustive-deps` 14. |
| `check:visual-system` | **PASS** | 250 arquivos, 0 roxo, 714 itens de dívida dentro do baseline. |
| Dependências | OK | `pnpm ls` limpo, lockfile em sincronia com os 38 specifiers. Next 16.3.0, TypeScript 6.0.3, React 19.2.7, Tailwind 4.3.0. |

### 9.2 Suítes de teste

| Suíte | Testes | Pass | Fail |
|---|---|---|---|
| `test:authz` | 25 | 23 | 2 |
| `test:arquiteto` (46 arquivos) | 735 | 734 | 1 |
| `test:editorial` | 20 | 16 | 4 |
| `test:redator` | 3 | 3 | 0 |
| `test:operational` | 50 | 41 | 9 |
| `test:marca` | 81 | 81 | 0 |
| `test:visual-system` | 28 | 27 | 1 |
| **Total** | **942** | **925** | **17** |

**Todas as 17 falhas são asserções de "contrato estático"**: regex sobre o texto-fonte de `arquiteto-workspace.tsx`, `minerador-workspace.tsx` e páginas de `app/` que deixaram de bater após refatorações (ex.: esperam `await getCurrentSupabaseToken()`, `<span className="hidden sm:inline">Processar lógica</span>`, `modules/conta`, `requireCanonicalSessionProfile`, `Zona de segurança`, `refetchOnWindowFocus`, `importApprovedKeywordsToArchitect`). Nenhuma é falha de lógica em runtime, mas mostram que os testes estáticos estão acoplados ao texto e não foram atualizados junto do código.

### 9.3 Testes órfãos

| Métrica | Valor |
|---|---|
| Arquivos `*.test.mts` em `tests/` | 322 |
| Referenciados por algum script `test:*` | 61 |
| **Órfãos (nunca rodam por script)** | **261 (81%)** |
| Untracked no Git em `tests/` | 167 |

Famílias órfãs: ~103 `minerador-*`, 36 `radar-*`, 16 `agency-*`, 16 `arquiteto-*`, 9 `google-ads-*`, 7 `marca-*`, 6 `master-refresh-*`, 5 `planejador-*`, 5 `canonical-*`, 4 `platform-*`, 3 `telegram-*`, 3 `deepseek-*`, além de `auth-*`, `conta-*`, `session-*`, `tenant-*`. O agregador `pnpm test` omite `test:marca`, `test:visual-system` e `test:integrations-runtime`. `tests/run-all.js` (real-db) espera 401 de `/api/volume`, que hoje devolve 410. ESLint ignora `tests/**`.

### 9.4 Estado do Git

| Métrica | Valor |
|---|---|
| Branch / HEAD | `main` @ `6706259` |
| **Último commit** | **2026-08-17** ("ainda poderia recriar Connection/grants/bindings Google Ads") |
| Commits no histórico | 5 (primeiro em 2026-07-10) |
| Remote | `github.com/adalbamusic-dotcom/minerador-key` |
| Modificados (M) | 237 |
| Deletados (D) | 83 (45 em `supabase/scripts`, 2 em `supabase/rollback`, 12 patches/txt na raiz, `.agents/skills/scripts/check-visual-system.mjs` movido) |
| **Untracked (??)** | **452** — `tests/` 167, `lib/` 136, `supabase/` 56, `docs/` 45, `modules/` 25, `app/` 12, `components/` 6 |
| `.next-codex-verify/` | 1.005 arquivos de build **rastreados** no Git e deletados localmente |
| `git diff --shortstat` | 1.325 arquivos, +29.849 / −64.844 (inclui as 1.005 deleções do build) |
| Em stage | nada |

**Consequência:** cerca de duas semanas de trabalho (17/08 a 02/09) estão só no disco local. Isso inclui 20 migrations (`0044`–`0047` e todas as timestampadas), todo o InternalLinkGraph, Telegram, Google Cloud, brand skills, qualificação semântica, persistência canônica de site e consolidação Silo-first. `.env.local` está corretamente ignorado; `.env.example` está sendo ignorado por engano (regra `.env.example` após `!.env.example`).
## 10. Recomendações priorizadas

Nada abaixo foi executado. A ordem respeita as regras do repositório: o usuário executa Git, SQL e operações remotas; mudanças estruturais exigem SDD.

### P0 — Esta semana, antes de qualquer feature

1. **Commit de checkpoint.** Remover `.next-codex-verify/` do índice, corrigir a regra `.env.example` no `.gitignore` (a linha `.env.example` anula o `!.env.example` anterior), apagar `.git/index.lock` se ainda existir, e commitar o estado atual em um ou mais commits temáticos (migrations, Arquiteto, Marca, Minerador, docs). Sem isso, qualquer falha de disco apaga o trabalho de 17/08 a 02/09.
2. **Reconciliar a cadeia de migrations com o remoto.** Rodar um preflight read-only no catálogo (o usuário executa) listando tabelas, funções e `schema_migrations`; comparar com a pasta; registrar a ordem real de aplicação; decidir 0046 versus 0047; mover 0002, 0003 e 0004 para uma pasta de histórico fora de `supabase/migrations/`. Só depois disso `db push` e branches de banco voltam a ser possíveis.
3. **Resolver as cinco contradições de status remoto** listadas na seção 8.1 (Telegram/Google Cloud, DeepSeek, migrations 2C, SERP do Radar, gate semântico do Arquiteto) com uma única fonte: uma tabela de "migrations aplicadas e data" em `docs/compartilhado/banco-canonico-pos-reset.md`.

### P1 — Antes de retomar a frente funcional

4. **Fechar os guards fracos.** Mover `/api/analyze`, `/api/process-intent-niche` e `/api/marca/site/import/keywords` para exigir `minerador:edit` ou `minerador:create`; `silo-review` para `arquiteto:edit`; `editorial/views` POST e DELETE para `edit`. Remover o fallback para anon key em `lib/server/authz.ts`. Adicionar rate-limit em `/api/agency-applications`, `/api/auth/signup` e `/api/auth/invited-signup`. Isso é mudança aditiva de guard, cabe sem SDD.
5. **Remover as órfãs e os diretórios vazios.** `/api/clusterize`, `/api/generate-briefing`, `/api/tenants`, `/api/auth/signup`, `/api/auth/google-client-id`, `/api/admin/owners`, `lib/server/marcas-access.d.mts`, `types/next-auth.d.ts`, `supabase-auth-tokens.ts`, `agency-context.ts`, `operational-permissions.ts`, Serper, `select-brand-client.tsx` e os 8 diretórios vazios. Atualizar `README.md` e `.env.example` (NextAuth, Google Sheets, `SESSION_SLOT_ROOT_DOMAIN`).
6. **Ligar os testes órfãos.** Criar scripts `test:minerador`, `test:radar`, `test:planejador`, `test:conta`, `test:admin`, `test:integrations` cobrindo os 261 arquivos que hoje não rodam, incluir `test:marca` e `test:visual-system` no agregador, e corrigir ou remover as 17 asserções estáticas que quebraram. Elevar `tsconfig.target` para ES2018 ou remover a flag `/s` do teste. Corrigir os 2 erros reais de TypeScript.
7. **Consolidar a autorização em uma implementação.** Escolher `lib/tenant/canonical-authorization.ts` + RPCs 0021 como única fonte e migrar `assertEditorialPermission`, `requireTenantPermission` e `assertCanAccessMarca` para adaptadores finos sobre ela. Exige SDD porque toca contrato compartilhado, mas reduz de quatro para uma a superfície de decisão de acesso.
8. **Corrigir o CHECK de `agency_memberships.role`** (migration sucessora que remove o CHECK inline da 0014 ou alinha a RPC 0021). Exige SDD e apply manual.

### P2 — Frente funcional, na ordem oficial

9. **Marca:** concluir Site/Sitemap canônico (Fases A2 a 6) e tirar `lib/marca/site-store.ts` do papel de fonte de verdade. Isso desbloqueia a Base Territorial do Arquiteto.
10. **Arquiteto:** definir o gate server-side de aprovação da SiloPage, ligar a UI à working copy remota e à consolidação, executar os smokes de território e RPCs 2C, e só então avançar as Fases 3+ da SDD Silo-first. Planejar a decomposição de `arquiteto-workspace.tsx` em painéis por modo (Artigos, Silos, Links) como tarefa própria.
11. **Minerador:** validação manual da aprovação sem gates, smoke ponta a ponta até o Arquiteto, migração das rotas legadas para o namespace canônico, decomposição de `minerador-workspace.tsx`.
12. **Radar:** webhook Telegram público e primeiro inbound real com um especialista de teste; depois ExternalEvidence.
13. **Planejador, Redator, Publicações:** uma sessão de validação manual autenticada de cada jornada antes de qualquer feature nova; primeira chamada de IA no Planejador; decisão de produto sobre CMS.

### P3 — Higiene contínua

14. **Docs de topo:** atualizar `visao-geral.md`, `arquitetura.md`, `00-produto/backlog.md` e `task-functional-area-development.md` para o estado de setembro; substituir `keywords_kgr`/`listas_kgr` nos 37 e 29 arquivos ativos; adicionar índice aos `estado-atual.md` grandes ou arquivar seções superadas em `_arquivo/`.
15. **Governança de integrações:** decidir se a política `HOMOLOGATION_ALLOW_ALL` continua; se sim, esconder ou marcar como "sem efeito" a UI de bindings e quotas da agência; se não, ativar o caminho grant → binding → quota já implementado.
16. **Bucket de avatar:** revisar a exposição pública com path previsível antes de aplicar 0045, ou aceitar explicitamente.
17. **Corrigir o mojibake** nas mensagens de usuário do código e nos 15 documentos afetados.
