# Estado atual — Minerador

## Google Ads Historical Metrics — 0043 encerrada remotamente — 2026-08-17

- **METRICS_PROVIDER = PASS:** evidência remota anterior confirmou a resposta do provider `google_ads v25`; esta etapa não repetiu a chamada.
- **ROOT_CAUSE = RESOLVED:** `public.minerador_keyword_metric_measurements.currency_code` agora é `text` nullable; a CHECK validada de três letras continua protegendo valores presentes.
- **0043_POST_VERIFIER = PASS:** o verificador bound confirmou zero delta de dados e preservação de colunas não alvo, constraints, FKs, índices, triggers, RLS, policies, ACL e owner.
- **READBACK REMOTO = PASS:** `attnotnull = false`, tipo `text`, default ausente, CHECK validada e tabela ainda com zero linhas.
- **VALIDAÇÃO LOCAL:** 4 testes direcionados e lint direcionado passaram; `git diff --check` não encontrou erro. O teste SQL reversível ficou `SKIPPED_LOCAL_POSTGRES` porque não havia PostgreSQL respondendo nas portas locais 54322/5432.
- **0043_CLOSED = YES:** não executar rollback, nova migration desta frente nem provider; próximo passo é o Master Refresh Manifest.

## Usage da Discovery Google Ads — implementação local; smoke remoto pendente — 2026-08-16

- **Causa confirmada no código:** a rota `app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts` concluía chamada Google Ads, persistência e readback sem invocar o ledger canônico `integration_usage_events`.
- **Implementado localmente:** `lib/minerador/google-ads-discovery-usage.ts` reutiliza `resolveIntegrationResourceForActor` e `recordIntegrationUsageForResource`, com `operation = module_operation`, `module = minerador`, `units = 1`, capability `google_ads_keyword_discovery` e metadata sanitizada de correlação.
- **Estados:** `succeeded` só é registrado após persistência/readback; chamada iniciada com falha registra `failed`; rejeição antes do provider não registra consumo. Retry usa chave idempotente `google_ads:<operationRequestId>:keyword_discovery`.
- **Preservado:** Google Ads continua usando exclusivamente `PLATFORM_ENV` para credenciais/provider; `brandId`, `agencyId` e `actorUserId` são mantidos no Usage; migrations 0041, persistência Discovery, DataForSEO e OpenRouter não foram alterados.
- **Confirmado por testes locais:** 31 testes relacionados passaram; nenhum provider real ou operação remota foi executado. O smoke único para confirmar `USAGE_RECORDED = YES` permanece pendente.

## Importação manual/CSV sem silo — corrigida localmente; validação manual pendente — 2026-08-13

- **Verificado no código:** `keywords_kgr.lista_id` permanece opcional e as importações manual e CSV podem persistir `lista_id = null` com `brand_id` obrigatório.
- **Verificado no código:** o parser CSV não cria listas/silos automaticamente e não descarta keywords sem coluna Silo ou com coluna vazia. Referência explícita inválida é reportada apenas para a linha afetada.
- **Verificado no código:** o modal manual começa em `Sem silo`; sem silos disponíveis, mantém a importação habilitada e informa que as keywords entrarão sem silo.
- **Preservado:** listas existentes, isolamento por marca, status, métricas, KeywordDNA, idempotência e fluxos posteriores. Não houve migration.
- **Ainda não verificado:** persistência autenticada em marca sem silos, CSV misto e recarga da tabela no navegador.

## Historical Import Guard do handoff Minerador → Arquiteto (2026-08-12)

- **Implementado localmente:** o handoff operacional cria somente `keyword/architect/received`; guard `historical_import_protected` retorna `HISTORICAL_IMPORT_PROTECTED`, sem promover ou sobrescrever o registro existente.
- **Implementado localmente:** `architectImportedKeywordIds` continua apenas como bloqueio transitório anti-duplicação até a recuperação canônica remota; não cria workflow, workspace ou ArticleDNA.
- **Regra documentada:** keyword encerra sua unidade operacional no Arquiteto. ArticleDNA é a entidade que segue para Radar, Planejador, Redator e Publicações; keyword permanece como proveniência.
- **SDD aprovada para implementação local:** `docs/compartilhado/sdd-autorizacao-excepcional-recovery-historico-minerador-arquiteto.md` formaliza `historical_import_recovery:execute` como grant excepcional, temporal e por Brand; a fundação ainda exige migration futura, auditoria e gate remoto antes do escritor.
- **Implementado localmente:** `0030_brand_exceptional_operation_grants.sql` prepara grants temporais por Brand, eventos append-only por guard e helper sem bypass; os scripts de preflight/pós-verificação permanecem somente locais e não foram executados remotamente.
- **Pendente de gate remoto:** aplicar apenas após preflight aprovado e decisão humana; ação administrativa, escritor histórico e recuperação remota auditada continuam fora desta fase. Nenhuma operação remota ocorreu.

## Handoff legado Minerador → Arquiteto — prévia local (2026-08-12)

- **Verificado no código:** `keywords_kgr` permanece a origem; `editorial_workflow_items` é a única prova remota de handoff para o Arquiteto.
- **Implementado localmente:** marcadores `architectImportedKeywordIds` de recuperação local são tratados como `LEGACY_RECOVERY_CANDIDATE`, nunca como confirmação de import.
- **Implementado localmente:** a prévia autenticada e somente leitura compara cada marcador por `keyword.id` com a keyword da Brand, workflow `keyword/architect` e `ArticleDNA.keywordReferences`; não usa texto, nome ou slug.
- **Ainda não validado manualmente:** nenhuma reconciliação foi executada e nenhum dado remoto foi alterado nesta tarefa.

## Runtime server-side de governança de integrações — implementação local — 2026-08-11

- **Verificado no código:** `lib/server/integrations-runtime.ts` é a camada canônica server-side sobre 0024/0025. Ela separa autorização, capability/entitlement, binding, connection, quota e usage; nenhum consumidor precisa consultar as tabelas diretamente.
- **Verificado no código:** o contexto exige `actorUserId`, `agencyId`/`brandId` explícitos, `capabilityKey`, operação real de capability do schema (`ai_generation`, `keyword_discovery`, `keyword_metrics`, `allintitle` ou `transactional_email`) e ambiente. Não há resolução por owner, slug, nome, primeira Agency, primeira Brand, primeiro binding ou primeira connection.
- **Verificado no código:** autorização reutiliza `requireAgencyOperationalAccess` e `requireBrandEditorialAccess` com `CanonicalAuthorizationRepository`. Admin global não é convertido automaticamente em owner/member operacional.
- **Verificado no código:** um grant Agency→Brand e seu binding só são utilizáveis enquanto o vínculo `agency_brands` ativo é confirmado pelo repositório canônico. Grant/binding persistido e vínculo operacional utilizável permanecem conceitos distintos.
- **Verificado no código:** connection só é obtida pelo binding explícito, com owner, ambiente, provider ativo, lifecycle `ready` e `secret_ref` presente. O retorno expõe apenas `secretConfigured`; nunca retorna `secret_ref` ou segredo.
- **Verificado no código:** Platform→Brand direto só é aceito quando grant e binding explícitos existem. A ausência de entitlement de Agency não cria fallback para Platform.
- **Verificado no código:** quota seleciona a policy ativa mais específica (Brand, Agency, Platform), trata `limit_units = NULL` como `UNLIMITED`, soma somente usage `succeeded` no escopo e período da policy e retorna `INTEGRATION_QUOTA_POLICY_MISSING` quando não há policy; não há default silencioso.
- **Verificado no código:** usage é registrado somente server-side, com actor, scopes, provider, connection, capability, operação de ledger, unidades, custo, status, correlação sanitizada, metadata filtrada e idempotência por `(connection_id, idempotency_key)`. Nenhum UPDATE/DELETE é emitido pelo runtime.
- **Confirmado por testes locais:** `tests/integrations-runtime.test.mts` cobre Platform→Agency, Agency→Brand ativo, vínculo inativo, binding explícito, ausência de first-match, quota disponível/esgotada/ilimitada/ausente, usage tenantizado, idempotência, isolamento Agency/Brand, Platform→Brand explícito, ausência de segredo no retorno e ausência de provider real.
- **Estado remoto relatado pelo usuário:** 0024 e 0025 aplicadas e verificadas; as sete tabelas estavam vazias no início desta camada. Isso não foi reconsultado pelo agente.
- **Consumidores não adaptados:** Google Ads, DataForSEO e IA continuam nos contratos atuais; não houve UI, provider real, Vault, Serper, Communication ou migração de consumidor nesta fase.
- **Dívida preservada:** `DEFAULT_ACL_GLOBAL_POLICY_REQUIRED` continua pendente antes de qualquer futura migration que crie novas tabelas. Nenhuma migration nova foi criada.

## Governança de integrações — schema mínimo local 0024 — 2026-08-11

- **Verificado no código:** não havia tabelas `integration_*` nem ledger canônico de quota/usage. O próximo número livre local era `0024`.
- **Preparado localmente:** `supabase/migrations/0024_integrations_resource_governance.sql` cria, de forma aditiva, providers, capabilities, connections, grants, bindings, políticas de quota e usage events append-only. A revisão pré-aplicação removeu a dependência obrigatória capability→provider e adicionou validações de escopo Agency→Brand nos grants/bindings.
- **Contrato preservado:** authorization, entitlement/grant, connection/credential, binding, quota e usage continuam separados. `secret_ref` é somente referência server-side; não há segredo bruto, token, seed ou backfill.
- **Segurança preparada:** owner Platform/Agency/Brand possui escopo explícito e FKs tipadas; `anon` não recebe acesso, `authenticated` só lê sob RLS e mutações ficam no `service_role` server-side. O ledger possui idempotência e trigger append-only.
- **Compatibilidade:** Google Ads continua usando `minerador_google_ads_connections`; DataForSEO continua global por ambiente; IA continua exigindo `AI_PROVIDER` explícito. Nenhum consumidor, UI, provider ou fallback foi adaptado nesta fase.
- **Verificadores locais:** `supabase/scripts/integrations-0024-pre-apply-snapshot-read-only.sql`, `supabase/scripts/integrations-0024-preflight-read-only.sql` e `supabase/scripts/integrations-0024-post-verification-read-only.sql` retornam um único result set; versões fixas: snapshot `2026-08-11-integrations-0024-pre-apply-snapshot-v1`, preflight `2026-08-11-integrations-0024-preflight-v2` e pós-verificador `2026-08-11-integrations-0024-post-v1`.
- **Diagnóstico ACL local:** `supabase/scripts/integrations-0024-acl-diagnostic-read-only.sql` foi preparado com versão fixa `2026-08-11-integrations-0024-acl-diagnostic-v1`, uma linha por tabela e distinção entre as seis tabelas de catálogo e o ledger `integration_usage_events`. O texto do pós-verificador foi corrigido para contar somente as seis tabelas no check `acl:service_role_catalog_write`.
- **Confirmado por testes locais:** `tests/integrations-0024-schema.test.mts` cobre separação de conceitos, Platform/Agency/Brand, binding explícito, ausência de colunas de segredo bruto, RLS/ACL, append-only e read-only dos verificadores.
- **Ainda não verificado:** ACL remota detalhada de `integration_usage_events`, default ACL efetiva, aplicação remota da 0024, RLS remoto, catálogo remoto, configuração de secret manager/Vault, backfill de metadados e migração de consumidores. Nenhuma operação remota foi executada.

## Security hardening de ACL — migration sucessora 0025 — 2026-08-11

- **Relatado pelo usuário no catálogo remoto:** as sete tabelas 0024 tinham privilégios efetivos amplos para `service_role`, sem membership herdada observada; ACL explícita e default ACL ampla foram reportadas. O estado remoto não foi consultado novamente pelo agente.
- **Preparado localmente:** `supabase/migrations/0025_integrations_usage_acl_hardening.sql` revoga a ACL direta de `service_role` nas sete tabelas e concede somente `SELECT/INSERT/UPDATE` nas seis tabelas de catálogo e `SELECT/INSERT` no ledger. Reafirma `authenticated` como SELECT sob RLS e anon/PUBLIC sem acesso.
- **Preflight e pós-verificação:** `supabase/scripts/integrations-0025-acl-hardening-preflight-read-only.sql` exige a ACL ampla prévia, RLS, policies e owners; `supabase/scripts/integrations-0025-acl-hardening-post-verification-read-only.sql` prova a ACL final, privilégios finos, preservação estrutural e `DATA_DELTA = 0`.
- **Dívida registrada:** `DEFAULT_ACL_GLOBAL_POLICY_REQUIRED`. A 0025 não executa `ALTER DEFAULT PRIVILEGES`; uma política global futura exige revisão separada.
- **Ainda pendente:** execução remota do preflight, aplicação manual da 0025, pós-verificação e confirmação de `DATA_DELTA = 0`. Nenhuma operação remota foi executada.

## IA — fallback silencioso removido localmente — 2026-08-10

- **Verificado no código:** `AI_PROVIDER` agora resolve explicitamente `deepseek` ou `openrouter`; a ausência, invalidez ou credencial ausente falha antes da chamada.
- **Verificado no código:** `lib/server/structured-ai.ts` e as rotas legadas de análise usam a mesma resolução explícita. Não há seleção DeepSeek → OpenRouter, OpenRouter → DeepSeek ou troca automática de modelo.
- **Verificado no código:** falhas HTTP do provider são classificadas por código sanitizado (`AI_PROVIDER_AUTHENTICATION`, `AI_PROVIDER_RATE_LIMIT`, `AI_PROVIDER_UNAVAILABLE`, `AI_PROVIDER_ERROR` e `AI_PROVIDER_INVALID_RESPONSE`); corpo de erro não é retornado nem registrado.
- **Confirmado por testes locais:** DeepSeek e OpenRouter explícitos usam seus próprios endpoints/modelos; falha do DeepSeek não dispara OpenRouter; provider inválido/ausente e credencial ausente falham; secrets não aparecem em erros; nenhum teste chama provider real.
- **Pendente:** configurar `AI_PROVIDER` em cada ambiente de runtime e executar validação manual controlada quando autorizada. Não foram alterados schema, UI, DataForSEO, Google Ads, Serper, Communication ou providers remotos.

## Fase 1.5 — Administração global de agências — implementada localmente; validação manual pendente — 2026-08-05

- **Verificado no código:** o Admin global possui a aba canônica `/admin?tab=agencias`, com lista, estado vazio, cadastro, seleção de administrador por nome/e-mail, vínculos opcionais de marcas e tela de detalhes para ativar/desativar agência, memberships e vínculos.
- **Verificado no código:** as rotas `/api/admin/agencies` e `/api/admin/agencies/users` exigem sessão e Admin global no servidor. Usuários são resolvidos por `auth.users` somente no servidor; o navegador recebe apenas resumo sanitizado de nome/e-mail/ID técnico já selecionado.
- **Verificado no código:** `lib/server/agency-admin.ts` cria o membership inicial explícito em `agency_memberships`, vincula marcas por `brand_id` real, bloqueia segunda agência ativa, não cria `brand_memberships` e não infere agência por owner, slug, nome ou `auth.uid()`.
- **Preservado:** `brand_id` continua tenant canônico; Google Ads por marca, DataForSEO global provisória, Serper do Radar, rotas `brandRef`, Minerador, Marca, Arquiteto e Radar não foram migrados nem modificados funcionalmente.
- **Ainda não verificado:** criação e persistência remotas reais, RLS remoto, conflito visual, usuário sem acesso, isolamento Adalba/Lindisse, recarga do Admin e dark mode/breakpoints. A validação manual seguirá a sequência aprovada.

## Arquitetura de provedores por plataforma e agência — aprovada; Fase 1 local em andamento — 2026-08-05

- **Verificado no código:** `brand_id = public.marcas.id` continua sendo o tenant dos dados. `owner_user_id`, `auth.uid()`, admin global e `brandRef` não são agência nem podem resolver credenciais por fallback.
- **Verificado no código:** Google Ads possui OAuth/Developer Token/versionamento globais no servidor e uma conexão operacional por marca em `minerador_google_ads_connections`; Descoberta e métricas ainda dependem dessa linha por `brand_id`.
- **Verificado no código:** DataForSEO lê uma credencial única do ambiente e hoje atende o allintitle de Descoberta/Processador; não existem entidade de agência, vínculo agência-marca, conexão DataForSEO por agência ou auditoria de uso por agência.
- **Verificado no código:** Serper permanece o provider produtivo do Radar e seus contratos atuais ainda registram `provider: serper`.
- **Decisão aprovada, não implementada:** Google Ads será conexão técnica global da plataforma; DataForSEO será conexão operacional por agência, herdada por marcas explicitamente vinculadas. Resultados, medições, keywords e históricos continuam sempre em `brand_id`; compartilhar credencial não compartilha dados.
- **Decisão aprovada, não implementada:** DataForSEO substituirá Serper como provider SERP único para Minerador, Arquiteto e Radar somente após adaptador, contratos, RLS, paridade de fixtures e smoke autenticado. Serper não foi removido nesta tarefa.
- A SDD canônica está em `docs/03-minerador/propostas/arquitetura-provedores-plataforma-agencia.md`. Não houve código, schema, migration, banco, credencial ou chamada paga nesta decisão documental.

## Fase 1 — fundação de agências — implementação local; migration pendente — 2026-08-05

- **Verificado no código:** foram adicionados somente `agencies`, `agency_memberships` e `agency_brands` na migration local `0014_agency_foundation.sql`, com FKs restritivas, RLS, roles `agency_admin`/`operator`/`viewer` e unicidade parcial para impedir duas agências ativas na mesma marca.
- **Verificado no código:** `resolveAgencyForBrand`, `requireAgencyMembership`, `requireAgencyAccessToBrand` e `isGlobalAdmin` existem em `lib/server/agency-context.ts`. O contrato compõe autorização de marca e membership ativa da agência; owner de marca não é convertido em membership de agência e admin global retorna contexto explícito sem linha de membership.
- **Preservado:** nenhuma rota existente consome esses contratos ainda. Google Ads por marca, DataForSEO global e Serper no Radar continuam usando exatamente seus resolvedores atuais.
- **Confirmado por teste local:** fixtures cobrem isolamento entre agências, membership inativa, ambiguidade de vínculo, papel do admin global e ausência de fallback por owner/slug/e-mail.
- **Ainda não verificado:** aplicação da migration, RLS remoto, criação de agência, vínculos marca→agência, memberships reais e regressão autenticada de rotas existentes. Não foi executado SQL, migration, backfill ou chamada paga.

## Estado vigente após a substituição do executor allintitle — 2026-08-05

Esta seção substitui qualquer registro histórico abaixo que descreva a Extensão como executor produtivo.

- A pasta `minerador-extensao/`, seus scripts, assets e adaptadores Chrome foram removidos do checkout.
- Não existem consumidores produtivos de bridge, `chrome.runtime`, `chrome.storage`, notificações Chrome, `extension_page_reload_required` ou listeners exclusivos da Extensão.
- As rotas `/api/extensao/...` exclusivas da Extensão foram removidas. O núcleo de domínio e persistência de allintitle e métricas atuais foi preservado para um futuro executor interno.
- As ações allintitle das abas Descobrir e Processar usam a rota server-side DataForSEO e só são executadas por ação explícita; sem `DATAFORSEO_LOGIN` e `DATAFORSEO_PASSWORD`, a interface informa configuração ausente sem chamada paga.
- Resultados allintitle já persistidos, KGR, histórico de medições, campos existentes de keywords, métricas atuais de candidatas e migrations (incluindo 0013) permanecem preservados. Nenhum dado foi apagado.
- Google Ads, DataForSEO, Descoberta, Processador, seleção, pintura e o importador compartilhado continuam produtivos; Serper permanece exclusivo do Radar.
- A substituição confirmada de métricas, a preservação em falha e o recálculo de KGR continuam regras do domínio. O histórico não é exibido como valor operacional atual.
- O allintitle continua sendo requisito do Processador e agora possui executor server-side DataForSEO, sem bridge, background, injeção ou instruções `chrome://extensions`.

### DataForSEO — implementação local sem smoke pago

- **Verificado no código:** `POST /v3/serp/google/organic/live/regular` recebe `allintitle:"<keyword>"`, `location_code`, `language_code`, `device=desktop`, `depth=10` e `tag=operationRequestId`.
- **Verificado no código:** somente `se_results_count` é aceito como total. `items_count`, `items.length` e `organic.length` não são usados; zero só é aceito quando explícito.
- **Verificado no código:** keywords oficiais e candidatas usam a mesma rota, com substituição somente após persistência confirmada, histórico preservado e KGR recalculado quando aplicável. Candidatas importadas atualizam a keyword oficial vinculada.
- **Corrigido localmente:** uma nova ação explícita sempre reconsulta a DataForSEO, inclusive quando já existe resultado. O retorno diferencia primeira medição e atualização; o valor anterior, inclusive quando igual ao novo, permanece no histórico técnico.
- **Confirmado em smoke direto do provider:** `allintitle:marketing digital`, Brasil/português/desktop, retornou `se_results_count = 134` com task `20000` e autenticação válida. Essa confirmação não prova ainda a persistência autenticada pela interface.
- **Política de localidade:** o primeiro MVP aceita Brasil (`2076`) e português; UFs Google Ads não são convertidas ou somadas silenciosamente como localidades DataForSEO. A resolução de estados permanece pendente de catálogo DataForSEO validado.
- **Ainda não verificado:** persistência remota da migration 0013 e validação visual autenticada nas quatro larguras, incluindo remedição de resultado já existente.

As seções anteriores permanecem como histórico de implementação e homologação; não representam consumidores atuais da aplicação.

## Fase 7 — fechamento da Descoberta Keywords — 2026-08-04

### Estado final aprovado

**Descobrir Keywords — MVP funcionalmente concluído.**

**Extensão — removida do produto; DataForSEO é o executor server-side de allintitle.**

Validação manual concluída para a rota tenantizada, pesquisa Google Ads nacional, targeting com uma UF, duas UFs e sete UFs, incluindo São Paulo, Minas Gerais e São Paulo + Minas Gerais. Também foram validados filtro de volume, persistência da execução, restauração após reload e preservação da última pesquisa válida quando uma nova pesquisa falha.

Foi validada a importação explícita de uma candidata nova: a keyword foi persistida remotamente, apareceu no Processador, entrou como `bruto` e sem lista automática. O núcleo compartilhado de importação entre Extensão e Descoberta também foi confirmado no fluxo validado.

Essas confirmações substituem os registros históricos de homologação pendente abaixo; eles permanecem somente como histórico do caminho de implementação, não como estado atual.

### Fonte canônica da Descoberta

- Google Ads Keyword Ideas é a fonte canônica da Descoberta.
- Google Ads fornece volume, histórico, CPC e concorrência Ads; concorrência Ads não é KD.
- KGR e allintitle continuam no Processador.
- A extração antiga de sugestões da Extensão é legado e não é fonte concorrente.

### Papel remanescente da Extensão

A Extensão não é mais necessária para descobrir, importar ou medir allintitle. Bridge, background, CAPTCHA, pausa, retomada e notificações Chrome permanecem somente no histórico; não são consumidores produtivos atuais.

### Pendências reais não bloqueantes

Permanecem como regressões manuais: candidata já existente; repetição sem duplicação; retry idempotente; isolamento da importação entre Adalba e Lindisse; e conferência visual completa em dark mode e nos breakpoints. Essas pendências não bloqueiam o encerramento do MVP.

### Legado preservado

Sem remoção nesta tarefa: `public.import_minerador_discovery_candidates` e `minerador_discovery_normalize_keyword`, ambos sem consumidor produtivo; migrations 0011 e 0012 como histórico da RPC antiga; e `executeMining`/`extractSuggestionsLegacy` como candidatos a remoção futura.

## Fase 8 — auditoria interrompeu a implementação estrutural — 2026-08-04

### Lacuna confirmada

A tabela `minerador_discovery_candidates` persiste volume, histórico mensal, CPC, concorrência Ads, targeting, provider/version e `measured_at`, mas não possui allintitle atual, estado da medição, executor, erro sanitizado ou histórico de atualizações. O protocolo produtivo da Extensão também recebe `keywordId` oficial de `keywords_kgr`; uma candidata ainda não importada não possui esse identificador.

Por isso, a Descoberta não pode medir uma candidata não importada sem criar uma persistência paralela ou importar silenciosamente a keyword. Ambas as alternativas contrariariam o contrato da Fase 8. A implementação estrutural foi interrompida antes de alterar rota, bridge, executor ou schema.

### Executor reutilizável

O executor existente permanece identificado e reutilizável: `minerador-extensao/background.js`, `minerador-panel-bridge.js`, `allintitle-google-reader.js`, o protocolo `minerador.allintitle.measure.v2`, a rota `resultados-allintitle` e o tratamento de CAPTCHA, pausa, retomada, cancelamento, timeout e notificações. Não foi criado outro leitor ou parser.

### Regra obrigatória de substituição

Após persistência confirmada, a medição nova substitui o valor operacional atual de allintitle, volume, histórico mensal, CPC, concorrência Ads, targeting, provider, versão e `measured_at`. O KGR é recalculado com os valores atuais. O valor anterior permanece somente em histórico técnico/auditoria.

Em falha, ausência, quota, CAPTCHA ou resposta não confirmada, todos os valores atuais, `measured_at` e KGR permanecem intactos; não há substituição por `null`, zero ou média entre medições.

### SDD mínima pendente

Antes do código, é necessária uma mudança estrutural aprovada para: persistir medições allintitle de candidatas não importadas com histórico e RLS; permitir no protocolo um sujeito `DiscoveryCandidate` sem `keywordId` oficial; transferir a medição para a keyword oficial na importação; e fazer Descoberta e Processador lerem a mesma medição atual quando houver `imported_keyword_id`. Nenhuma migration foi criada ou executada nesta auditoria.

## Descobrir Keywords — targeting geografico corrigido — 2026-08-03

- **Causa confirmada no codigo:** o catalogo local usava IDs antigos/incorretos para as UFs brasileiras. O Brasil nacional continuava usando `geoTargetConstants/2076`, mas estados como SP e MG eram enviados como `2043` e `2024`, rejeitados pela Google Ads.
- **Corrigido localmente:** o catalogo foi atualizado para a lista oficial fixada em 2026-07-16; por exemplo, SP usa `geoTargetConstants/20106` e MG usa `geoTargetConstants/20094`. O navegador continua enviando apenas codigos de UF.
- **Preservado:** Brasil nao e misturado com UFs; o limite permanece em 10; resource names sao resolvidos somente no servidor; falha de nova pesquisa preserva a ultima tabela valida e nao cria importacao.
- **Diagnostico:** erros provider-side preservam request ID, codigo e campo sanitizados, targeting resolvido, quantidade de localidades e customer mascarado. O smoke manual confirmou Brasil, SP, MG, SP+MG e sete UFs.

## Descobrir Keywords — Fase 4 de persistência tenantizada — 2026-08-03

- **Aprovado para implementação local:** `DiscoveryRun` e `DiscoveryCandidate` serão persistidos nas tabelas `minerador_discovery_runs` e `minerador_discovery_candidates`, sempre por `brand_id`, com todas as candidatas normalizadas e motivos de filtro.
- **Implementado localmente nesta fase:** contrato de persistência, idempotência por `brand_id + operation_request_id`, leitura da última execução e restauração após reload, sem envio ao Processador.
- **Migration criada para a fase:** `supabase/migrations/0009_minerador_discovery_persistence.sql`. A execução autenticada, persistência e restauração após reload foram confirmadas manualmente; detalhes de aplicação remota permanecem registrados no histórico operacional.
- **Preservado:** seleção/organização locais, Processador, Extensão, `keywords_kgr`, allintitle, KGR e conteúdo publicado. Nenhuma candidata filtrada entra no Processador automaticamente.

## Descobrir Keywords — prioridade espacial da coluna Keyword — 2026-08-03

- **Verificado no código:** a tabela da Descoberta usa configuração de colunas própria, com seleção fixa, `Keyword` em 380px e auxiliares compactas; a largura mínima total é 1430px e o scroll horizontal permanece restrito ao `KeywordTableShell`.
- **Preservado:** o grid e as larguras do Processador, seleção/pintura, ordenação, hover, altura das linhas, dados, filtros e tooltip `title` da keyword.
- **Pendente manual:** conferir em 768px, 1024px e 1440px, em dark mode, com keywords extensas e valores auxiliares longos.

## MineradorSectionTabs — densidade compartilhada e wrapper sem rolagem vertical — 2026-08-03

- **Verificado no código:** Descobrir e Processar usam o mesmo `MineradorSectionTabs`, com `h-8` no contêiner e `h-7` nos links, ordem fixa e estado ativo derivado da rota.
- **Corrigido localmente:** o wrapper da barra do Processador mantém o scroll horizontal e explicita `overflow-y-hidden`, removendo a scrollbar vertical própria das abas sem afetar tabela, popovers ou rolagens legítimas.
- **Pendente manual:** alternar entre as duas rotas em 360px, 768px, 1024px e 1440px, conferindo posição, altura, foco e ausência de scrollbar ao lado das abas.

## MineradorSectionTabs — densidade compartilhada e wrapper sem rolagem vertical — 2026-08-03

- **Verificado no código:** Descobrir e Processar usam o mesmo `MineradorSectionTabs`, com `h-8` no contêiner e `h-7` nos links, ordem fixa e estado ativo derivado da rota.
- **Corrigido localmente:** o wrapper da barra do Processador mantém somente o scroll horizontal e usa `overflow-y-hidden`, removendo a scrollbar vertical própria das abas sem afetar tabela, popovers ou rolagem legítima.
- **Pendente manual:** alternar entre as duas rotas em 360px, 768px, 1024px e 1440px, conferindo posição, altura, foco e ausência de scrollbar ao lado das abas.

## Descobrir Keywords — incluir adultas na Linha 2 — 2026-08-03

- **Verificado no código:** `includeAdultKeywords` permanece parte do `DiscoverySearchDraft`, mas o checkbox agora aparece somente na Linha 2, depois de Incluir/Excluir e antes de Limpar filtros.
- **Preservado:** Estados/UF encerra a Linha 1; alterar o checkbox não chama Google Ads nem substitui o snapshot executado; Limpar filtros restaura `false` sem limpar tabela, organização ou seleção.

## Descobrir Keywords — execução local com pesquisa real em memória — 2026-08-03

## Descobrir Keywords — separação de pesquisa e targeting — 2026-08-03

- **Verificado no código:** os controles superiores formam um rascunho da próxima pesquisa; a tabela usa somente o snapshot em memória da última execução válida. Mudanças no rascunho mostram `Configuração alterada` e não recalculam a tabela.
- **Verificado no código:** filtros de volume, CPC, relação, inclusão e exclusão são aplicados no ciclo do botão `Descobrir Keywords`; busca, Organizar e ordenação continuam locais sobre as candidatas aprovadas.
- **Verificado no código:** a rota recebe códigos internos de UF, resolve resources canônicos do Brasil server-side e rejeita mais de dez UFs ou códigos fora do catálogo antes da API. Brasil nacional não é combinado com UFs.
- **Verificado no código:** Targeting é apresentado com nomes humanos; várias UFs são exibidas como conjunto agregado e não como métricas individuais. `Histórico` usa `Disponível`, `Parcial` ou `Indisponível`; concorrência Ads é traduzida para Baixa, Média ou Alta.
- **Pendente manual:** pesquisa nacional, uma UF, seis UFs, alteração de rascunho após execução, falha preservando a tabela anterior e diagnóstico visual no Chrome.

- Criada a rota privada `/{brandRef}/minerador/descobrir`, protegida pela mesma resolução canônica de tenant e permissão `minerador` usada pelo Processador.
- Implementadas a navegação interna entre Descobrir e Processar, duas linhas compactas de pesquisa/filtros em memória, estado vazio e cabeçalho estrutural da tabela futura. A primeira concentra semente, modo, intenção, funil, idioma, país e UF; a segunda contém filtros e a ação Descobrir. O Processador permanece na rota canônica `/{brandRef}/minerador`.
- O segmented de modo e a linha separada foram removidos; o modo passou a select imediatamente após a semente, idioma antecede país e o botão Descobrir fecha popover aberto antes de validar a semente. Nenhuma integração ou persistência foi adicionada.
- A navegação interna agora é o componente único `MineradorSectionTabs`: na Descoberta ocupa o slot de ações do `ModuleHeader`; no Processador ocupa o grupo direito da barra operacional. A aba ativa é derivada de `usePathname`, sem estado local.
- Resultados e KD estão explicitamente desabilitados como capacidades futuras de evidência Serper. A descoberta executada chama a rota Google Ads apenas pelo botão `Descobrir Keywords`; os controles superiores editam o rascunho da próxima pesquisa e não alteram a tabela executada até nova execução. Não há persistência, extensão ou importação nesta fase.
- Fase 2 implementada localmente: `KeywordTableShell`, `KeywordTableHeader`, `KeywordSelectionHeader`, `KeywordSelectionCell`, `KeywordTableEmptyState` e `KeywordTableBulkBarShell` passaram a ser usados incrementalmente pelo Processador. Estado, helpers puros de clique/Ctrl-Cmd/Shift/pintura, filtros, ordenação e handlers continuam nos consumidores.
- A Descoberta usa o mesmo shell, cabeçalho e empty state com suas colunas contratuais, ainda sem candidatas, barra de lote, chamada, persistência ou importação. Allintitle, KGR, métricas, qualificação, silos, status, decisão humana, Extensão e Arquiteto seguem exclusivos do Processador.
- Correção responsiva local: o conteúdo e o cabeçalho agora restringem a largura ao viewport; a Linha 1 só usa a grade de sete colunas quando suas larguras mínimas cabem, e Estados/UF usa `AnchoredPopover` compartilhado, com fechamento externo/Escape e altura limitada à viewport. A tabela é a única área que recebe scroll horizontal.
- Pendente: validação manual autenticada em 360px, 768px, 1024px e 1440px.

## Exclusão de keywords não publicadas com histórico Google Ads — correção local — 2026-08-03

- Causa confirmada no código: a FK de medições Google Ads usava `ON DELETE RESTRICT`; por isso uma keyword medida não podia ser excluída pela ação permanente já autorizada na interface.
- Corrigido localmente: o diálogo encerra em sucesso ou falha e apresenta motivo sanitizado para dependência de histórico (`23503`) ou permissão (`42501`), sem o erro opaco `{}`.
- Migration manual pendente: `0008_minerador_keyword_measurement_delete_cascade.sql` substitui exclusivamente essa FK por `ON DELETE CASCADE`, permitindo que a exclusão permanente de uma keyword não publicada remova atomicamente apenas suas medições vinculadas.
- Preservado: keywords publicadas, listas, tenantização, conexão Google Ads e histórico de keywords que não forem excluídas.

## Migração local de Volume para Google Ads — 2026-08-03

- **Verificado no código:** a página envia IDs à rota Google Ads tenantizada; o servidor resolve conexão por `brandId`, persiste uma medição versionada e só então atualiza a projeção de volume. RapidAPI não é chamado pelos endpoints de volume ativos; os endpoints antigos respondem explicitamente que o fluxo mudou.
- **Confirmado por teste:** normalização Google Ads, lote interno de até 10.000, correspondência somente de keywords retornadas, preservação de itens sem retorno e projeção com proveniência.
- **Ainda não verificado manualmente:** migration 0007 aplicada, conexão Ads cadastrada, persistência real após recarga, paridade Adalba/Lindisse e lote real particionado. Nenhuma chamada Ads real foi feita nesta implementação.

## Configuração tenantizada da conexão Google Ads — 2026-08-03

- **Verificado no código:** `minerador_google_ads_connections` possui rota exclusiva de leitura/cadastro para owner/admin. O cadastro valida `Customer` server-side antes de gravar status `validated`, moeda e timezone; a rota de métricas continua sem aceitar customerId.
- **Pendente manual:** cadastrar a conta real exclusivamente para a Adalba e confirmar que a rota passa de `account_resolution` para a consulta de métricas. Nenhuma chamada real foi executada nesta implementação.

## Correção de resposta vazia de métricas Google Ads — 2026-08-03

- **Relatado pelo usuário:** a conexão da marca foi validada e uma consulta real chegou ao Google Ads, mas uma resposta HTTP bem-sucedida sem a propriedade `results` era classificada incorretamente como incompatível.
- **Corrigido no código:** `GenerateKeywordHistoricalMetrics` agora aceita `results` ausente como lista vazia; somente `results` presente com formato não-array continua sendo resposta inválida. A operação retorna ausência/resultado parcial sem alterar métricas anteriores.
- **Correção complementar:** resultado com `text` mas sem `keywordMetrics` também representa métrica ausente. Seus campos normalizados permanecem `null` e não produzem volume artificial, preservando o `requestId` quando a API o envia.
- **Confirmado por teste local:** fixture de resposta vazia, fundação Google Ads, TypeScript, lint direcionado, build e `git diff --check` passaram com fetches simulados.
- **Pendente manual:** repetir uma medição real de uma keyword para confirmar o resultado devolvido pelo Google; nenhuma nova chamada Google Ads foi feita pelo agente.

> **Estado documental vigente — 2026-07-27:** os blocos que descrevem 0005/0006 como “não aplicadas” são registros pré-aplicação. O resultado remoto posterior informa 0006 aplicada e `READY`; não reexecutar nem reverter 0005/0006. Persistem como pendências somente validação manual autenticada, RLS real e demais verificações explicitamente indicadas.

## Fotografia operacional datada — 2026-07-27

O relatório local da janela de tenantização registra 147 keywords, sendo 126 sem lista e 21 com lista, e 0 sem `brand_id`. Esta é uma fotografia operacional datada, não um invariante nem uma consulta remota executada nesta passada; divergência futura deve ser registrada antes de qualquer reconciliação.

## Implementação Site/Sitemap — 2026-07-21

- **Implementado localmente:** a ação explícita `Conferir com o site` carrega o workspace Site/Sitemap da marca ativa, monta prévia somente leitura e exige confirmação antes da importação.
- **Proveniência:** novas keywords recebem ID real, lista de destino, status `bruto`, métricas/intenção nulas e evidência versionada em `analise_semantica.site_origin`/`site_origins`.
- **Existentes:** preservam ID, status, métricas, intenção e DNA; a evidência é atualizada de modo aditivo e retorna `evidence_updated` ou `no_change`.
- **Dimensões separadas:** o Minerador exibe situação técnica da URL, publicação observada, relação keyword↔URL e situação arquitetural. Não forma artigo nem altera Arquiteto.
- **Proteções:** workspace inválido gera erro explícito; candidatos de outra marca, ignorados ou sem catálogo válido não entram na prévia; não há sincronização durante hidratação.
- **Testes locais:** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/marca-site.test.mts` passou 14/14. Não foram feitos `npm test`, escrita remota, migration, chamada de IA/SERP ou limpeza de armazenamento.
- **Limitações:** Supabase/RLS, browser autenticado, reload remoto e correções estruturais M-01–M-05 permanecem não verificados; a hidratação existente não foi reconstruída nesta integração.

## Regra compartilhada — 2026-07-21

A importação Site → `keywords_kgr` continua seletiva e idempotente, com IDs reais, status `bruto` e `analise_semantica.site_origin` contendo URL, catálogo, campos observados e coerência de slug. A qualificação real de KGR/volume/intenção e a validação de schema remoto continuam não verificadas nesta etapa.
- **Última auditoria:** 2026-07-20, leitura de código, testes locais e build; relatório em `docs/03-minerador/propostas/auditoria-de-saude-do-minerador.md`.
- **Funcionando no código:** importação CSV/manual, planilha, filtros, KGR, status, seleção, exportação, histórico, visões, extensão e KeywordDNA lógico.
- **Confirmado por teste:** `test:arquiteto` 48/48, `test:operational` 49/49, `test:editorial` 20/20, `test:authz` 4/4, sintaxe da extensão, `git diff --check` e `npm run build`.
- **Parcial:** integração KeywordDNA → Arquiteto; a leitura é remota/legada, mas a decisão de importação é mantida em índice local por marca.
- **Risco confirmado no código:** keywords sem lista podem entrar em qualquer marca; o carregamento executa deduplicação, atualização de nicho e persistência de DNA; alguns lotes não confirmam erro por item.
- **Risco de workflow:** importação manual aceita `publicado` diretamente e a ação em massa não exige silo/aprovação anterior.
- **Local:** seleção, histórico em memória, visões em `localStorage`, índice `architectImportedKeywordIds` e recovery do pipeline por marca.
- **Persistido no código:** `listas_kgr`, `keywords_kgr`, `briefings_artigos` e marcas são acessados; schema remoto, RLS e triggers instalados ainda não foram verificados.
- **Externo/simulado:** volume, análise semântica, nicho/intenção, briefing, Google Autocomplete e Google Sheets dependem de APIs externas; não foram chamados nesta auditoria.
- **Última validação manual:** ainda não verificada.
- **Bloqueado:** snapshot/SQL remoto, browser autenticado, extensão carregada e correções estruturais aguardam execução/autorização do usuário.
- **Arquivos centrais:** `app/(brand)/[brandRef]/minerador/page.tsx`, `minerador-extensao/background.js`, `minerador-extensao/popup.js`.
- **Diferença spec/implementação:** módulo funcional e monolítico como aprovado, mas com divergências de escopo por marca, mutações no carregamento e transferência não persistida; não reconstruir nesta fase.
## Correcao do gesto de selecao e da previa allintitle - implementacao local - 2026-07-29

- Correcao complementar: o background agora envia cada evento allintitle tambem no envelope `allintitle_relay_event` aceito pelo relay da pagina; resultados deixam de depender somente do envio direto por aba.
- Removido visualmente do popup o par redundante de acoes Selecionar visiveis/Limpar visiveis; a selecao continua diretamente nas candidates.
- Causa confirmada no codigo: a pintura da tabela fazia uma atualizacao React por movimento do ponteiro; a pintura do popup alterava as candidates em memoria, mas nao persistia nem redesenhava ao termino.
- Implementado localmente: a tabela acumula linhas visitadas e atualiza uma unica vez ao soltar/cancelar; o popup preserva o clique nativo de checkbox e persiste/redesenha ao finalizar pintura. Clique, Ctrl/Cmd, Shift, teclado, filtros e acoes em lote permanecem separados.
- Implementado localmente: resultados allintitle aceitam `operationRequestId` e `operationBatchId` raiz, mas continuam validados pela marca e pelas keywords da operacao ativa.
- Confirmado por teste local: 48 testes direcionados e sintaxe dos scripts da extensao passaram. Pendente manual: gesto real e retorno 323 na previa/tabela no Chrome apos reload da extensao. Nenhuma operacao remota foi executada.

## Fase B - aplicabilidade KGR e consolidacao Site/Sitemap - 2026-07-22

- Implementado localmente: decisao humana `applicable`/`not_applicable`/`pending`, rotulo `SIM`/`NAO`/`PENDENTE`, origem, ator, data, versao, justificativa e historico em `analise_semantica`.
- Implementado localmente: medicao separada (`with_score`, `without_data`, `invalid`), filtros, ordenacao previsivel e exportacao com aplicabilidade separada da pontuacao numerica.
- Implementado localmente: `NÃO` nao e usado como score e volume/resultados/score nao sao apagados por uma decisao de inaplicabilidade.
- Removido do Minerador: botao, modal e handlers exclusivos de `Gerar Briefing (Silo)`; endpoint e consumidores proprietarios existentes foram preservados.
- Implementado localmente: conferencia Site/Sitemap no rodape operacional e consolidacao aditiva de URL, resolved URL, canonical, publicacao e silo existente escolhido (`siloId`/`siloName`). Nenhum silo novo, slug ou identidade publicada e inferido.
- Testes locais: fixtures KGR, Marca/Site e contrato Site/KGR passaram; `npx tsc --noEmit` passou. Browser autenticado, Supabase/RLS e persistencia remota permanecem nao verificados.
- Nao executados: migration, escrita remota, chamadas de IA/SERP/API paga, limpeza de storage, commit, push ou deploy.
## Fase B.1 - correcoes de fluxo e interface - 2026-07-22

- Causa confirmada da perda de contexto: `fetchData()` era chamado apos a qualificacao, reativava loading, substituia a colecao, redefinia `targetListId`, limpava `selectedIds` e ocultava a posicao de trabalho. A hidratacao inicial tambem nao tinha deduplicacao de requests em voo.
- Corrigido localmente: qualificacao, importacoes e mutations atualizam somente linhas afetadas; selecao, busca, filtros, ordenacao e linha expandida sao preservados quando aplicavel. O carregamento inicial e deduplicado por marca/sessao/token.
- Corrigido localmente: `Conferir com o site` foi colocado na barra inferior e filtra candidatas pelo conjunto selecionado; a previa e confirmacao permanecem explicitas.
- Corrigido localmente: KGR e Intencao sao somente informativos na tabela. Decisoes KGR sao em massa e a aprovacao bloqueia itens sem medicao valida.
- Implementado localmente: painel recolhivel `Organizar`, contador, limpeza de filtros e taxonomia de intencao retrocompativel.
 - Limitacao: mutacoes de hidratacao historicas (deduplicacao, nicho e DNA logico) permanecem existentes e nao foram reconstruidas nesta correcao pontual; nao houve browser autenticado ou escrita remota.

## Fase B.2 - qualificacao de volume e preservacao de metadados - 2026-07-22
- Causa confirmada: `handleBatchQualify` tratava erro ou ausencia de item na resposta como `volume = null` e persistia `volume_search`, `kgr_score` e `volume_source`, permitindo apagar metricas validas.
- Corrigido localmente: falha HTTP, resposta invalida ou ausencia de medicao interrompe a qualificacao antes de qualquer update destrutivo; medicao valida altera somente volume, fonte real e KGR quando recalculavel.
- Corrigido localmente: `/api/volume` normaliza respostas, retorna somente mediacoes vinculadas e bloqueia explicitamente o endpoint `website-analyze-and-seo-audit-pro`/`aiseo.php`, que nao possui contrato de volume.
- Nao executado: chamada externa RapidAPI/Keywords Everywhere, browser autenticado, escrita remota fora do fluxo da aplicacao, migration, commit, push ou deploy.

## Fase B.3 - Google Keyword Insight - 2026-07-22
- Configurado localmente: `RAPIDAPI_HOST=google-keyword-insight1.p.rapidapi.com` e `RAPIDAPI_URL=https://google-keyword-insight1.p.rapidapi.com/keysuggest`.
- Chamada manual unica: `GET /keysuggest?keyword=seo%20para%20clinicas&location=BR&lang=pt`, URL registrada sem chave, HTTP `200 OK`.
- Resposta observada: array com objetos; keyword exata em `text`, volume em `volume`, e campos adicionais `competition_level`, `competition_index`, `low_bid`, `high_bid` e `trend`.
- Headers observados: `x-ratelimit-requests-limit=20` e `x-ratelimit-requests-remaining=18`; nenhum custo monetario foi informado pela resposta.
- Fixture anonimizada: `tests/google-keyword-insight-response.fixture.ts`. O payload nao informa campo de localizacao; portanto o resultado e tratado como volume solicitado para BR, sem afirmar comprovacao adicional no corpo.
- Nao executado: lote de producao, escrita remota, migration, commit, push ou deploy.

## Fase B.4 - Trending Insight sem volume - 2026-07-22
- Fixture literal recebido: array com `success`, `meta.keyword`, `meta.country`, `generatedAt`, `data.top` e `data.rising`; cada item possui `query` e `value`.
- Decisao implementada apenas no normalizador: `value` e tratado como indice de tendencia, nao como volume. A keyword solicitada sem campo de volume retorna erro estruturado e preserva todas as metricas existentes.
- `not_found` ocorre quando `meta.keyword` diverge da keyword solicitada; schema parcial ou invalido retorna erro. Nenhuma chamada externa, rota, front-end ou persistencia foi alterada nesta fase.

## Fase B.5 - Keyword Magic Tool - 2026-07-22
- Fixture representativa derivada da resposta 200 recebida: objeto `keyword_ideas[]`, keyword em `keyword` e volume em `search volume`.
- Implementado localmente somente no normalizador: correspondencia exata retorna volume; keyword ausente retorna `not_found`; volume invalido retorna `error`, sem gerar patch destrutivo.
- Metadados observados (`Keyword Difficulty %`, label, CPC e `Trend`) permanecem fora da persistencia atual e nao alteram `results_allintitle`.
- Limitacao: o payload nao informou metodo, query string nem corpo exigidos por `/searchby-country-url`; nenhuma chamada externa nem alteracao da rota foi realizada.

## Fase B.6 - SEO Keyword Research - 2026-07-22
- Configurado localmente: host `seo-keyword-research8.p.rapidapi.com`, endpoint `GET /keyword-research`, com `keyword` e `country=br`.
- Chamada manual unica: `GET /keyword-research?keyword=seo%20para%20clinicas&country=br`, HTTP `200 OK`; `result[0].keyword` correspondeu exatamente e `avg_monthly_searches` foi `10`.
- Headers observados: `x-ratelimit-requests-limit=25` e `x-ratelimit-requests-remaining=23`. Nenhum custo monetario foi informado pela resposta.
- Implementado localmente: normalizador fixture-based por correspondencia exata em `result[].keyword`/`avg_monthly_searches`; rota devolve `success`, `not_found` ou `error` por keyword e preserva resultados/KGR em falha.
- Nao executado: lote de producao, browser autenticado, escrita remota, migration, commit, push ou deploy.

## Fase B.3 complementar - hidratação, resultados existentes e barra - 2026-07-22
- Corrigido localmente: a tabela nao mantem mais copia derivada em estado; a visao e calculada por `useMemo` diretamente de `keywords`, filtros, listas e ordenacao. O filtro inicial de status e `Todos`.
- Corrigido localmente: abrir/fechar `Organizar` nao altera a colecao exibida, nem completa metadados ou dispara chamada remota.
- Mantido: `results_allintitle` ja persistido e preservado; volume valido recalcula KGR somente quando o resultado existe. Nenhuma rota/provedor de resultados foi criado.
- Corrigido localmente: uma unica barra inferior integra contador, mover para silo, conferencia Site/Sitemap, qualificacao, decisao KGR, publicacao, processamento e exclusao.

## Fase B.4 — restauração da última organização - 2026-07-22

- Implementado localmente: a preferência `minerador-pro:last-view:<usuário>:<marca>:minerador` é lida fora do painel `Organizar`, apenas após usuário, marca e coleção local estarem resolvidos.
- Compatibilidade: o leitor é proprietário do Minerador, reutiliza a chave e os valores existentes, adapta status legados e rejeita valores inválidos sem remover itens de `localStorage`.
- Interface: o botão exibe os critérios ativos pelo nome, como `Publicados`; abrir ou fechar o painel não aplica nem recalcula a organização.
- Não alterado: volume, `results_allintitle`, cálculo KGR, persistência do domínio, Supabase, migrations e componentes compartilhados.
- Complemento: a restauração usa chave hidratada explícita, ocorre uma vez por identidade e apresenta estado breve antes da pintura; a persistência compara o conteúdo antes de gravar. O resumo mostra até três filtros em ordem estável e expõe todos no tooltip quando truncado.

## Métricas independentes da aplicabilidade KGR - 2026-07-22

- Corrigido localmente: medição não depende mais de `kgr_score` ou da aplicabilidade. Estados: Sem medição, Parcial, Completa e Inválida.
- Interface: detalhe separado em Métricas, Estratégia KGR e Decisão humana; `Não aplicável` não oculta volume/resultados e mostra pontuação não utilizada.
- Mantido: decisão humana não altera `volume_search`, `results_allintitle` ou `kgr_score`; Arquiteto não foi alterado.

## Política da keyword principal publicada - 2026-07-22

- Implementado localmente: `locked`, `reviewable` e `free` em metadado aditivo; publicado legado é travado por padrão.
- Interface: badge de política e bloco Identidade publicada, com ação humana confirmada para alternar travada/revisável sem tocar URL, slug, canonical ou keyword.
- Contrato: o normalizador aditivo do Arquiteto recebe política e contexto, mas não foi alterada a formação de artigos nem há substituição automática.

## Coleta `allintitle` pela extensão — 2026-07-22

- Implementado localmente: ponte conectada explicitamente pelo popup na aba do Minerador, disponibilidade detectável, lote limitado (padrão 5, máximo 10), uma aba Google reutilizável e uma consulta por vez.
- Implementado localmente: parser fixture-based para contagem internacional/portuguesa, zero explícito, ausência, CAPTCHA, consentimento e bloqueio; CAPTCHA/bloqueio pausa o lote e oferece retomar ou cancelar.
- Implementado localmente: prévia antes de persistir, exclusão individual de resultados, patch localizado de `results_allintitle` com proveniência em `analise_semantica` e recálculo de KGR somente quando permitido.
- Permissões novas: `scripting`, `https://www.google.com/*` e `https://www.google.com.br/*`, justificadas somente para injetar o leitor na aba de medição. Não há permissão global para o painel.
- Pendente: usuário recarregar a extensão e executar o roteiro manual autenticado; não foram feitas buscas reais ao Google, escrita remota, migration, limpeza de storage, commit, push ou deploy.

### Correção do fluxo individual — 2026-07-23

- Implementado localmente: uma keyword não monta a prévia de lote. A extensão precisa estar disponível antes da solicitação; ausência mostra instrução compacta e não abre Google nem altera métricas.
- Implementado localmente: `success` e `zero_results` de uma keyword validam marca, ID, texto e seleção antes de atualizar somente a linha confirmada. CAPTCHA mantém controles compactos de retomar/cancelar; bloqueio, ausência e erro preservam dados.
- Mantido: duas ou mais keywords usam a prévia com confirmação humana, sem reload, sem `fetchData()` e sem alteração do provedor de volume.

### Correção localizada — handshake da extensão com a aba do Minerador — 2026-07-23

- Implementado localmente: o popup, service worker, bridge e `/minerador` agora concluem conexão somente após `ping` e ACK da página com `requestId`, origem, módulo e versão do protocolo conferidos.
- Sessão: a confirmação é registrada apenas em `chrome.storage.session`, vinculada a `tabId`, origem, `minerador`, versão `1` e data; sessão antiga não é aceita sem novo ping e o fechamento da aba remove o registro.
- Segurança: somente `http://localhost:3000/minerador`, `http://127.0.0.1:3000/minerador` e origem de produção configurada explicitamente podem conectar. Falha de ping/ACK bloqueia a abertura do lote e qualquer navegação ao Google.
- Interface: popup informa desconectado, verificando, conectado, incompatível ou conexão perdida sem falso sucesso. A página permanece sem barra fixa adicional.
- Não validado nesta execução: extensão carregada no Chrome e handshake manual autenticado; não houve consulta Google, escrita remota, migration, limpeza de storage, commit, push ou deploy.

### Correção diagnóstica — allintitle e volume zero — 2026-07-23

- Causa localizada no código: após o handshake, o controlador reduzia falhas de navegação, injeção e reader a `measurement_error`; a espera de navegação não comprovava que o `complete` pertencia à consulta solicitada.
- Corrigido localmente: etapas diagnósticas versionadas, URL de busca confirmada, timeout explícito, reader no frame principal e falhas específicas como `unexpected_navigation`, `reader_injection_failed` e `reader_no_response`.
- Interface: falhas de allintitle/extensão/volume permanecem até fechamento ou nova ação, mostram etapa/código e permitem copiar o diagnóstico ou repetir a seleção, sem stack trace.
- Volume: `0` só é aceito quando `result[].keyword` corresponde exatamente e `avg_monthly_searches` é um número JSON explícito igual a zero. Campo ausente, nulo, texto ou sugestão não cria patch.
- Limitação: a coleta real no Google continua pendente de validação manual; nenhuma consulta externa foi executada.

### Correção localizada — destino do popup da extensão — 2026-07-23

- Causa confirmada: o botão do popup usava `PANEL_URL` literalmente. Uma configuração legada com `/admin/marcas` abria a rota incompatível antes da tentativa de conexão; o login da extensão não cria nem redireciona abas.
- Corrigido localmente: `PANEL_URL` é usado somente como origem e o botão **Abrir Minerador** sempre deriva `/minerador`. A conexão continua sem abrir, navegar ou alterar a aba ativa.
- Validação: `/minerador`, `/minerador/`, query e hash locais são aceitos; `/admin/marcas`, `/marca` e origens externas permanecem rejeitados. A mensagem informa a rota incompatível e orienta abrir o Minerador.
# Roteamento tenant — 2026-07-23

### Compatibilização com `keywords_kgr.brand_id` obrigatório — 2026-07-24

- Implementado localmente: o workspace do Minerador carrega listas por `marca_id` e keywords por `brand_id`, sem fallback para carregar todos os tenants quando não há marca ativa.
- Implementado localmente: imports CSV/manual, import Site/Sitemap e criação de lista enviam o tenant explícito; atualizações e exclusões restringem `brand_id`; movimentação valida a lista de destino.
- Implementado localmente: `/api/analyze` e `/api/process-intent-niche` recebem a marca ativa, autorizam o tenant e atualizam a keyword com filtro de `brand_id`; `assertKeywordBelongsToMarca` usa `brand_id` também para keywords sem lista.
- Implementado localmente: preview e persistência Site/Sitemap filtram lista e keyword pelo tenant autorizado.
- Rollout: o código assume schema pós-0005 e não deve ser executado antes da migration. A ordem obrigatória é maintenance/read-only, snapshot/dry-run, migration, smoke test autenticado, deploy dos consumidores e desbloqueio.
- Fora do escopo: Arquiteto, Radar, Planejador e `app/api/inteligencia`/`app/api/editorial/serp` foram auditados e permanecem para rodada proprietária separada.
- Não validado: migration remota, RLS remoto, browser autenticado, smoke test remoto, commit, push, deploy e chamadas pagas de IA.
# Consolidacao fisica dos modulos - 2026-07-23
- Tenantizacao 0005 - endurecimento final local - 2026-07-24: `CAUSA NAO COMPROVADA`; o escritor legado sem filtro de tenant e compativel com o incidente, mas nao existe prova local de clique ou de execucao.
- Implementado localmente na infraestrutura compartilhada: lock com timeout de 10 segundos antes de qualquer snapshot ou escrita, sem desabilitar triggers.
- Implementado localmente: guard transacional somente com `keywords_kgr.id` e `lista_id`, seguido de comparacao exata por `FULL JOIN`/`IS DISTINCT FROM` antes do `COMMIT`.
- Garantia: o backfill altera apenas `brand_id`; `lista_id` permanece nullable e os totais atuais esperados sao 147 keywords, 126 sem lista e 21 com lista.
- Dry-run e snapshot manual continuam somente leitura; backups preservados sao reportados sem restauracao.
- Rollback continua assistido e nao altera `lista_id` nem restaura linhas completas de keywords.
- Migration nao aplicada, SQL remoto nao executado, browser autenticado nao validado e aplicativo deve permanecer encerrado durante a janela controlada.

## Reconciliacao tenant 0006 - 2026-07-24

- Preparada localmente a migration `0006_reconcile_tenant_security.sql` para corrigir apenas seguranca pos-0005.
- Nenhum backfill sera repetido; keywords, `lista_id`, `brand_id`, owner, listas e memberships permanecem protegidos.
- O Minerador depende do schema pos-0005 e deve permanecer encerrado durante a janela de 0006.
- Validacao remota das funcoes, grants, policies e constraints ainda pendente; 0006 nao aplicada.

## FK canônica de lista — 2026-07-24

- Autorizada a consolidação de `fk_keywords_kgr_lista_0005` com `ON DELETE RESTRICT`.
- `keywords_kgr_lista_id_fkey` é tratada como legado `ON DELETE CASCADE`; a 0006 valida os atributos semânticos do catálogo antes de removê-la e exibe as definições textuais somente para diagnóstico.
- A precondição da 0006 aceita `search_path` normalizado como `public,pg_temp` ou `pg_catalog,public,pg_temp`; somente a pós-condição exige `pg_catalog,public,pg_temp`. O dry-run sinaliza reconciliação sem bloquear, enquanto a validation permanece bloqueada até a aplicação.
- `lista_id` permanece nullable e nenhuma keyword, lista, `brand_id`, owner ou membership é alterada.
- Auditoria local não encontrou exclusão direta de `listas_kgr` no Minerador ou no Arquiteto; o Arquiteto apenas desagrupa o silo na organização local.
- Migration, rollback e validação remotos continuam pendentes; aplicação exige revisão humana do dry-run.
- Implementacao proprietaria consolidada em modules/minerador; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

## Resultado remoto da migration 0006 — 2026-07-24

- A 0006 foi aplicada remotamente; a transação principal foi consolidada e a validation pós-migration retornou `READY`.
- O erro `42P01` ocorreu somente no diagnóstico pós-`COMMIT`, porque `pg_temp.tenant_0006_snapshot` já havia sido removido por `ON COMMIT DROP`.
- Não há perda de dados reportada. Não reexecutar a migration e não executar rollback.
- O epílogo local foi corrigido para terminar imediatamente em `COMMIT;`, preservando as validações críticas antes do commit.

## Diagnóstico de acesso autenticado às listas — 2026-07-24

- Causa comprovada: o cliente browser do Minerador era criado apenas com a URL e a anon key; o `session.accessToken` do NextAuth não era enviado ao PostgREST.
- Correção: o Minerador passou a usar `lib/supabase/browser-authenticated-client.ts`, que envia o bearer da sessão sem service role; consultas continuam protegidas por sessão e `brand_id`.
- Nenhuma regra de RLS, grant, migration, keyword, `lista_id`, `brand_id`, owner ou membership foi alterada. A validação manual autenticada do Minerador ainda está pendente.
- Verificação local: 95 testes focados, TypeScript, build e `git diff --check` passaram; ESLint do factory/teste passou. O lint integral do workspace mantém erros legados de `any`/hooks, fora desta correção.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

- Causa adicional corrigida: o bearer fixo expirava porque o callback JWT não guardava/renovava o `refresh_token` do Supabase; `session.accessToken` também podia carregar indevidamente um token Google.
- `session.accessToken` agora representa somente JWT Supabase. O token Google fica separado e é usado apenas no endpoint server-side de Google Sheets.
- O cliente browser consulta `getSession()` no momento da requisição, valida `sub`, `aud`, `role` e `exp`, aplica margem de 60 segundos e não devolve token vencido.
- Refresh Supabase ocorre no callback JWT server-side, com compartilhamento de uma única promessa por refresh token; falha gera `SUPABASE_TOKEN_REFRESH_FAILED`, sem fallback anon.
- SELECT tenantizado pode repetir uma vez após erro JWT expirado; escritas não são repetidas automaticamente. Smoke test autenticado ainda está pendente.

### Diagnóstico final da sessão NextAuth → Supabase — 2026-07-24

- Corrigida a classificação que mostrava “sessão expirou” para qualquer erro de autenticação. O Minerador agora diferencia `NEXTAUTH_SESSION_MISSING`, `GOOGLE_ID_TOKEN_MISSING`, `SUPABASE_GOOGLE_EXCHANGE_FAILED`, `SUPABASE_ACCESS_TOKEN_MISSING`, `SUPABASE_REFRESH_TOKEN_MISSING`, `SUPABASE_TOKEN_INVALID_CLAIMS`, `SUPABASE_TOKEN_EXPIRED` e `SUPABASE_TOKEN_REFRESH_FAILED`.
- O resultado do token é estruturado (`ok`, `token`, `reason`, `expiresAt`) e o log contém apenas diagnóstico seguro; nenhum JWT, cookie, refresh token, Authorization ou segredo é registrado.
- `SUPABASE_SESSION_READY` limpa erros antigos. A configuração remota do provider Google permanece requisito externo, não alterado nem testado por login real.
- O fluxo de login não redireciona ao Minerador quando `session.supabaseAuth.status` não é `ready`; falhas Google/Supabase interrompem o callback e exigem novo login.

- Adicionado wrapper canônico `/{brandRef}/minerador`; a implementação funcional permanece em `modules/minerador` e o contrato de cache por marca foi preservado.

## Marcas autenticadas e handshake v2 da extensão — 2026-07-24

- Implementado localmente: `/api/extensao/marcas` valida Bearer Supabase server-side, resolve a identidade pelo `sub` validado e retorna somente marcas com acesso ao Minerador.
- Implementado localmente: `/api/extensao/marcas/{brandId}/listas` revalida o token, a capacidade e o tenant, retornando apenas `listas_kgr` da marca autorizada.
- Implementado localmente: popup com Marca sempre visível, seleção automática para uma marca, dropdown para várias, estados persistentes de erro/zero marcas/retry e lista dependente da marca.
- Implementado localmente: rota contextual `/{brandRef}/minerador`; o popup trata `brandRef` como referência opaca e não o converte em `brandId`.
- Implementado localmente: handshake v2 com `actorUserId`, `activeBrandId`, `activeBrandRef`, acesso confirmado e sessão transitória por aba/marca. Divergência bloqueia mineração e allintitle.
- Implementado localmente: rate limit em memória de 60 requisições por usuário/minuto e logs estruturados sem tokens; proteção distribuída permanece pendente.
- Testes locais: TypeScript, sintaxe dos scripts da extensão, handshake/rota/contrato e tenant-routing. Login real, Chrome manual, Supabase autenticado, RLS, consulta Google, escrita remota e deploy permanecem não verificados.
## Diagnóstico do endpoint de marcas da extensão — 2026-07-24

- Correção local: o popup agora constrói a URL da API exclusivamente a partir da origem configurada em `PANEL_URL` e exige o prefixo `/api/extensao/`; não usa origem relativa da extensão, aba ativa ou rota legada.
- Correção local: respostas não-OK são lidas antes do erro e preservam `status`, `code`, `message` e `requestId`; a resposta server-side mantém `ok`, `code`, `message`, `error` e `requestId` sem expor token.
- Correção local: o popup mostra estados distintos para rede, token ausente/inválido, token expirado, identidade sem vínculo, acesso negado e falha interna, com retry e diagnóstico copiável sem JWT.
- Correção local: login da extensão conserva `access_token`, `refresh_token`, `expires_at` e `user_id`; token expirado tenta refresh Supabase uma única vez e, se falhar, exige novo login.
- Causa do teste manual ainda não comprovada: não houve Chrome autenticado disponível nesta execução; o popup anterior escondia a primeira resposta HTTP e o código retornado, impedindo distinguir rede, token e autorização.
- Pendente: executar o roteiro manual autenticado e registrar status HTTP, código, requestId e marca retornada; não declarar a lista real homologada antes dessa evidência.

## Preflight operacional da extensão — 2026-07-25

- Corrigida a divergência entre popup, `chrome.storage.session`, bridge e workspace: a sessão continua indexada por `tabId` e agora é comparada com ator, `brandId`, `brandRef`, origem, pathname canônico, módulo e protocolo antes do allintitle.
- O ACK v2 da rota contextual exige `requestId`, `actorUserId`, marca autorizada, `pathname` sem query/hash e `timestamp`; ACK incompleto ou divergente não grava sessão.
- O preflight retorna `connected`, `code`, `message` e `session`. Códigos preservados: `connected`, `session_missing`, `tab_mismatch`, `brand_mismatch`, `actor_mismatch`, `route_mismatch`, `protocol_mismatch`, `ack_timeout`, `bridge_unavailable` e `access_not_confirmed`.
- A marca carregada no popup não é apresentada como conexão; a conexão só é exibida depois de ACK v2 e a validação operacional da aba atual.
- O Minerador exibe a causa específica e oferece reconexão/tentativa, diagnóstico copiável e fechamento; falha de preflight não abre consulta Google nem altera métricas existentes.
- Validação local: 18 testes focados, sintaxe da extensão e TypeScript passaram. Chrome autenticado, service worker suspenso, múltiplas abas/marcas e consulta Google permanecem pendentes por não haver uma aba local autenticada disponível; nenhuma chamada externa foi executada.

## Correção do retorno terminal do allintitle — 2026-07-26

- Causa localizada no fluxo: `bridge_error` e `batch_completed` apenas alteravam o estado da extensão, mas não encerravam a execução individual; o retorno final também não carregava o mesmo `requestId` até o workspace. Reader sem resposta e callback vazio do bridge podiam deixar a interface sem uma conclusão explícita.
- Corrigido localmente: timeout por item e timeout total, resultado final com `requestId`, `keywordId`, `brandId`, etapa e código, reader com resposta estruturada mesmo em exceção, bridge com erro para callback vazio e encerramento da execução individual em erro, resposta ausente ou divergente.
- Estados terminais tratados: `success`, `zero_results`, `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled`. Falhas preservam volume, resultado anterior e demais metadados; retry usa nova operação somente para a keyword individual.
- Validação local: testes de parser/patch, terminação, bridge/reader, interface e handshake passaram; sintaxe dos scripts passou. Consulta Google real, Chrome autenticado, escrita remota, migration, commit, push e deploy não foram executados.

## Correlacao do retorno individual allintitle — 2026-07-26

- Causa localizada: a bridge espalhava a resposta depois do `requestId` raiz, permitindo que um campo ausente ou divergente sobrescrevesse a correlacao original; o workspace tambem tratava retorno sem ID como `request_mismatch`.
- Corrigido localmente: `requestId` agora e obrigatorio no pedido interno, preservado como campo autoritativo pela bridge/background/reader e carregado em progresso, resultado, pausa, cancelamento, retomada e `batch_completed`. `batchId` continua separado e `keywordId`/`brandId` sao validados individualmente.
- Resposta sem ID recebe `response_missing_request_id`; divergencia recebe `request_mismatch`; resposta de lote anterior e ignorada como `stale_response`, sem persistencia.
- Nenhuma chamada ao Google, escrita remota, migration, limpeza de armazenamento, commit, push ou deploy foi executada. Validacao manual autenticada continua pendente.

## Coerencia de volume zero e KGR — 2026-07-26

- Causa localizada: `buildVolumeMetricPatch` atualizava `volume_search` para zero, mas omitia `kgr_score: null`; o score calculado com volume anterior permanecia visivel.
- Corrigido localmente: zero numerico da keyword exata passa a registrar `volume_measurement.status = zero_confirmed`, fonte/data/match, preserva `results_allintitle` e invalida o KGR atual. O KGR anterior e guardado em `kgr_score_history`.
- Erros, ausencia, `null`, string vazia, schema invalido, keyword divergente e sugestao relacionada continuam sem patch destrutivo.
- Adicionada deteccao somente leitura de inconsistencias volume/KGR e previa diagnostica em desenvolvimento. Nenhuma correcao em massa ou escrita remota foi executada.
## Bridge reinjetável e diagnóstico classificatório — 2026-07-27

- Corrigido localmente: a bridge não usa mais um booleano global que mantinha contexto obsoleto após reload da extensão. Cada instância possui versão, `instanceId` e `dispose`, remove listeners nomeados e pode ser reinjetada sem reload da página.
- Corrigido localmente: o background reinjeta, aguarda `bridge_ready`, valida bridge/protocolo e só então envia o ping v2. Contexto invalidado, `lastError`, bridge ausente e versão incompatível possuem códigos distintos.
- Corrigido localmente: a prévia de volume/KGR separa `measurement_pending`, `zero_unconfirmed`, `not_applicable` e `inconsistent`; somente a última categoria representa incompatibilidade comprovada. A prévia é somente leitura e seus contadores são derivados dos registros atuais.
- Nenhum volume, `results_allintitle`, KGR, histórico ou dado remoto foi alterado; consulta Google, provider, migration, commit, push e deploy não foram executados.
- Validação manual em Chrome após reload da extensão e smoke test autenticado continuam pendentes.
## Qualificação simplificada e ACK da página — 2026-07-27

- Concluído localmente: `Qualificar volume (KGR calculado)` deixou de iniciar silenciosamente o allintitle; a medição allintitle agora é acionada explicitamente pelo botão próprio.
- Concluído localmente: KGR passou a ser nomeado como cálculo técnico/recalculado, separando-o de volume e resultados medidos.
- Concluído localmente: erros do provedor de volume preservam HTTP/mensagem segura quando disponíveis e aparecem na notificação por keyword; falhas não escrevem `null`.
- Concluído localmente: listener de ACK da página foi separado do estado do lote; ACK negativo estruturado evita transformar divergência conhecida em `ack_timeout`; preflight foi ampliado para tolerar o ciclo de reinjeção e despertar do service worker.
- Removida da interface principal a prévia diagnóstica inflada de volume/KGR; a classificação permanece somente em código/testes/documentação.
- Nenhum schema, migration, parser Google, autenticação, Arquiteto ou dado persistido foi alterado; nenhuma chamada externa foi executada.
## Fluxos separados de métrica, decisão e handshake — 2026-07-27

- Volume é medido exclusivamente pela rota do provedor; `results_allintitle` é medido explicitamente pela extensão; a decisão KGR calcula localmente apenas quando aplicável e com volume/resultados válidos.
- O responder de handshake agora vive na rota contextual do Minerador e publica `page_handshake_ready` antes do ACK; o background valida ator, marca, rota e acesso antes do ping e registra o último estágio confirmado no diagnóstico.
- HTTP 429 da RapidAPI encerra o lote sem retry e retorna somente `Não foi possível coletar volume.`. Itens não processados são identificados internamente; nenhum volume, KGR, `results_allintitle` ou metadado anterior é apagado.
- Validação local: 39 testes focados, TypeScript, sintaxe da extensão e `git diff --check` passaram. RapidAPI, Google, Chrome autenticado, Supabase remoto, migration, commit, push e deploy não foram executados.
## Simplificacao da extensao do Minerador Key - implementacao local - 2026-07-27

- Implementado localmente no modulo Minerador: popup sem lista, projeto, categoria, silo ou destino editorial; a marca autorizada continua obrigatoria e o `brandId` canonico e validado no handshake e no servidor.
- Fluxo implementado: sugestoes -> filtros preliminares de intencao/funil -> previa e selecao humana -> allintitle sequencial em lote pequeno -> filtro de resultados -> volume somente das sobreviventes -> filtro de volume -> confirmacao humana -> importacao autenticada.
- Endpoints canonicos implementados: `POST /api/extensao/marcas/{brandId}/volume` (somente medicao, sem persistencia) e `POST /api/extensao/marcas/{brandId}/keywords/import` (persistencia server-side autenticada).
- Payload de importacao: `extractionBatchId` e `items`; cada item carrega keyword, origem `extension`, status `bruto`, hints, evidencias de resultados/volume e localidades. Keyword nova usa `brand_id` real e `lista_id: null`; keyword existente recebe somente evidencia aditiva em `analise_semantica`, preservando decisoes e identidade anteriores.
- O caminho legado `executeMining` permanece isolado para compatibilidade/rollback e nao e chamado pelo popup novo. Nenhum schema, migration, SQL remoto ou limpeza de armazenamento foi executado.
- Validacao local desta implementacao: 18 testes focados, sintaxe dos scripts da extensao, ESLint direcionado, TypeScript, build Next.js 16 e `git diff --check` passaram. Chrome autenticado, Google, RapidAPI e persistencia Supabase remota continuam pendentes.
## Ajuste localizado da interface e preferencias da Extensao - 2026-07-27

- Implementado localmente no popup: ordem visual e-mail -> Marca -> conexao -> palavra-chave -> intencao -> funil -> filtros -> localidades -> extracao. A conexao agora possui painel separado para estado principal, rota, marca selecionada e orientacao.
- Funil substituido por selecao multipla BOFU, MOFU e TOFU, com BOFU como unico padrao inicial. O hint TOFU foi aceito de forma aditiva no contrato puro; nenhuma decisao editorial e promovida automaticamente.
- Local controla a habilitacao dos controles geograficos. Ao desmarcar Local, estados e municipios ficam desabilitados sem perder escolhas salvas; a proxima extracao nao envia localidades como filtro ativo.
- Filtros reorganizados em blocos de resultados allintitle e volume mensal, com barras visuais, campos precisos e estado Sem maximo. Volume continua sendo medido exclusivamente pelo endpoint server-side apos resultados.
- Preferencias nao sensiveis usam `chrome.storage.local` com chave `minerador_extension_preferences:{actorUserId}:{brandId}`. Sessao, token, handshake e keywords nao sao tratados como preferencia; nao houve limpeza de armazenamento.
- Consumidores preservados: popup, service worker, handshake, endpoint de importacao e rota server-side de volume. Nenhum outro modulo, schema, migration, RLS ou persistencia remota foi alterado.
- Validacao local desta etapa: testes focados, sintaxe dos scripts, TypeScript, ESLint direcionado, build Next.js e `git diff --check`; homologacao visual no Chrome, troca de marcas, rota divergente e restauracao real permanecem pendentes.

## Correcao urgente da inicializacao do popup da Extensao - 2026-07-27

- Causa localizada no popup: `setLocalControlsEnabled()` acessava `sectionLabel` antes da declaracao local durante a restauracao das preferencias. A excecao era capturada pelo fluxo amplo de carregamento e aparecia incorretamente como falha ao carregar marcas.
- Corrigido localmente: a etiqueta de localidade e inicializada antes do uso; a consulta server-side de marcas agora e separada da restauracao de preferencias, portanto falha visual/local nao descarta marcas autorizadas.
- Corrigido localmente: o email so aparece depois de a sessao ser aceita pela API de marcas. Token ausente/invalido nao e tratado como perfil autenticado e nao limpa token, refresh token ou armazenamento.
- Corrigido localmente: estado inicial `panel_not_checked` exibe aba ainda nao validada, sem codigo tecnico; `session_missing` fica reservado para sessao ausente ou rejeitada; rota e marca divergentes exibem mensagens especificas e orientacao para abrir a rota correta e reconectar.
- Troca de marca preserva preferencias por `actorUserId + brandId`, salva a marca anterior e invalida somente o handshake da aba; nao faz logout nem reutiliza dados da marca anterior.
- Validacao local: teste de regressao do TDZ/bootstrap, testes focados, sintaxe dos scripts, TypeScript e build permanecem no escopo. Chrome autenticado, troca real de marcas, rota divergente e persistencia real continuam pendentes.

## Correcao localizada Abrir Minerador -> Conectar aba - 2026-07-27

- Causa localizada: `Abrir Minerador` criava a aba diretamente no popup sem registrar seu `tabId`; `Conectar` consultava apenas a aba ativa. O status automatico tambem chamava o caminho de handshake antes do clique explicito, permitindo ping durante carregamento.
- Corrigido localmente: o service worker abre/reutiliza a rota canonica `/{brandRef}/minerador`, ativa a aba, registra o candidato por `brandId` em `chrome.storage.session` e informa `loading`/`ready`.
- Corrigido localmente: `Conectar esta aba` usa o `tabId` registrado, aguarda `status=complete` e somente entao injeta/probeia a bridge e envia o ping. A leitura de status ficou passiva e nao executa handshake automaticamente.
- Corrigido localmente: `tab_not_open`, `tab_loading`, falha de bridge/ping, rota divergente e marca divergente possuem estados separados. Falha de comunicacao nao e convertida em `route_mismatch`; rota divergente so e classificada depois de resposta da bridge.
- Corrigido localmente: ordem visual e-mail -> Marca -> Abrir Minerador -> Conectar -> painel -> palavra-chave; funil visual TOFU -> MOFU -> BOFU, mantendo selecao multipla e BOFU como padrao sem preferencia.
- Preferencias continuam em `minerador_extension_preferences:{actorUserId}:{brandId}`, com debounce e troca de marca sem logout, sem reutilizar o handshake anterior e sem limpar dados.
- Validacao local: testes direcionados da UI, preflight, handshake, bridge e contratos, sintaxe dos scripts. Chrome autenticado, aba real carregando, bridge real, Adalba/Lindisse e rota divergente continuam pendentes.

## Diagnostico tecnico da bridge no Chrome - implementacao local - 2026-07-27

- O transporte canonico confirmado no codigo e: popup -> service worker -> `chrome.scripting.executeScript` com `minerador-panel-bridge.js` no mundo isolado (`ISOLATED`, frame 0) -> `chrome.tabs.sendMessage` -> listener `chrome.runtime.onMessage` da bridge -> probe `minerador_bridge_probe` -> ACK `bridge_ready` -> eventos de handshake da pagina -> `minerador_handshake_ack`.
- O manifest nao declara `content_scripts`; a bridge e um content script programaticamente injetado. O arquivo esta presente na pasta `minerador-extensao`, o service worker e `background.js`, e `scripting`/origens locais estao declarados. A origem publicada continua exigindo permissao explicita no manifest empacotado.
- A falha generica anterior foi localizada no tratamento: rejeicoes de `executeScript` e o erro Chrome `Receiving end does not exist` eram reduzidos a `bridge_unavailable`/`bridge_context_invalidated`, sem indicar a etapa real. O fluxo agora preserva a mensagem original do Chrome e separa permissao, arquivo ausente, excecao, receptor ausente, timeout, ACK invalido e protocolo.
- Cada tentativa produz diagnostico seguro e copiavel no popup com `TAB_FOUND`, `TAB_LOADING` ou `TAB_COMPLETE`, `INJECTION_STARTED`, `INJECTION_OK`, `PROBE_SENT`, `PROBE_ACK` e `HANDSHAKE_OK`; nao inclui token, senha, cookies ou keywords.
- A bridge publica `globalThis.__MINERADOR_EXTENSION_BRIDGE__` somente como marcador de disponibilidade, com versao, instancia e `ready`; isso nao concede acesso nem substitui o handshake autenticado.
- Testes locais cobrem rejeicao da injecao, permissao/origem, arquivo inexistente, excecao, ausencia de receptor, timeout, ACK invalido, mundo isolado, manifest, preservacao de `tabId` e troca de marca. O smoke test autenticado no Chrome ainda e obrigatorio para capturar o codigo efetivo da instalacao carregada.

## Compactacao do estado de conexao - implementacao local - 2026-07-27

- Implementado localmente no popup: o estado conectado agora ocupa uma linha compacta com `Conectado ao Minerador · {nomeDaMarca}` e indicador visual verde sem expor `tabId`, rota, request IDs ou eventos no uso normal.
- O diagnostico tecnico permanece disponivel no proprio painel por `Ver diagnostico`; inicia recolhido e, ao abrir, mostra o JSON atual e `Copiar detalhes tecnicos` usando a rotina de copia existente.
- Estado neutro usa `Conecte esta aba para iniciar.`; estado de validacao usa `Validando conexao...`; erros mostram somente a mensagem principal e `Ver detalhes`, sem textarea permanente.
- O resumo conectado continua sendo renderizado a partir do registro efemero validado pelo background, portanto permanece disponivel apos fechar e reabrir o popup. Bridge, handshake, storage de sessao, importacao, funil, filtros e medicao nao foram alterados nesta etapa.
- A composicao reutiliza os tokens visuais existentes da extensao (`surface`, `border`, `text`, `accent`, `danger`, `success`), preserva foco visivel e nao cria um dialogo ou sistema de cores paralelo. A extensao permanece em tema escuro; o popup tem largura fixa de 340px e a marca longa usa truncamento seguro.
- Validacao local: testes focados da extensao, sintaxe, TypeScript, build, ESLint direcionado e verificacao visual estatica; homologacao visual manual no Chrome em popup aberto/fechado continua pendente.

## Correcao do estado conectado sobrescrito - implementacao local - 2026-07-27

- Causa localizada no popup: a leitura passiva do bootstrap e o listener de aba pronta podiam renderizar `panel_not_checked` depois de uma resposta explicita `HANDSHAKE_OK`; respostas antigas agora sao ignoradas por `connectionOperationId`, geracao, marca, aba e operacao ativa.
- A conexao confirmada continua efemera no `chrome.storage.session`. A leitura passiva valida o registro e a aba atual e retorna `code: HANDSHAKE_OK`, `status: connected`, `state: connected`, `brandId`, `brandRef`, `tabId` e `connectRequestId` quando a conexao permanece valida.
- Ausencia de registro ou rota sem handshake usa `panel_not_checked`, `status: idle`, `state: idle` e mensagem acionavel. `session_missing` permanece reservado para sessao da extensao ausente ou rejeitada.
- O popup exibe `connecting` durante a acao explicita e estado neutro sem borda vermelha para aba ainda nao validada; uma leitura passiva nao sobrescreve `connecting` ou `connected`.
- Invalidacoes reais preservadas: logout, troca de marca, aba fechada, rota/origem/marca/protocolo divergentes e falha de nova validacao explicita. Nenhuma limpeza de `storage.local`, migration, escrita remota, bridge ou manifest foi feita.
- Validacao local: testes focados da extensao, sintaxe dos scripts, TypeScript, build Next.js 16, ESLint direcionado e `git diff --check` devem ser registrados separadamente; o fechamento/reabertura do popup e a persistencia real continuam homologacao manual no Chrome.

## Correcao da transicao PROBE_ACK -> HANDSHAKE - implementacao local - 2026-07-27

- Causa exata localizada: `minerador-panel-bridge.js` recebia `minerador_handshake_ping`, disparava o evento da pagina e retornava sem `sendResponse`. O `tabs.sendMessage` do background interpretava o fechamento da porta sem resposta como falha de comunicacao e devolvia `bridge_unavailable`, apesar de `PROBE_ACK` valido.
- Corrigido localmente: a bridge confirma o transporte com `handshake_sent`; o background registra `handshake_sent`, aguarda o ACK autenticado da pagina e so entao registra `HANDSHAKE_OK`/`connected`.
- A progressao diagnostica agora e `tab_found -> tab_complete -> injection_started -> injection_ok -> probe_sent -> probe_ack -> handshake_sent -> handshake_ok`; falha posterior ao `PROBE_ACK` usa `handshake_error`, nunca `bridge_unavailable`.
- `connectRequestId`, `probeRequestId` e `handshakeRequestId` foram separados e validados com `tabId`, marca selecionada e tentativa ativa. Respostas passivas antigas ou de outra tentativa nao sobrescrevem a conexao explicita.
- O resultado de conexao explicita informa `status: connected` ou `status: error`; `status: null` nao e usado para inferir indisponibilidade da bridge.
- Validacao local: 22 testes de bridge/preflight/handshake/UI, sintaxe e `git diff --check` passaram. Chrome autenticado, `HANDSHAKE_OK` real no popup e repeticao com Adalba/Lindisse continuam como homologacao manual pendente.

## Fluxo pos-extracao, previa e importacao da Extensao - implementacao local - 2026-07-27

- Causa corrigida: o popup bloqueava a extracao ate a resposta final, descartava a previa ao iniciar e exigia volume para importar. O executor agora usa estado temporario em `chrome.storage.session`, vinculado a ator, `brandId`, `tabId` e `runId`, e continua fora do popup.
- Implementado localmente: Local desligado usa um contexto nacional `{countryCode: "BR"}`; Local ligado habilita Brasil/UF/municipios e valida localidade somente nesse modo. Preferencias geograficas continuam preservadas silenciosamente.
- Implementado localmente: semente e previa permanecem durante execucao, pausa, cancelamento e reabertura do popup. `Pausar`, `Continuar`, `Cancelar`, `Descartar resultados` e `Nova pesquisa` sao explicitos; cancelamento preserva resultados parciais e descarte remove somente a previa temporaria da execucao.
- Implementado localmente: previa compacta e rolavel mostra origem/contexto, selecao, allintitle, volume, motivo de filtro, erro e contadores. Duplicatas sao deduplicadas por execucao, preservando evidencias de localidades; filtros nao escondem linhas.
- Implementado localmente: allintitle permanece sequencial e opcional; zero confirmado permanece zero e falha nao vira zero. Volume usa somente o endpoint server-side existente e e opcional para importar.
- Implementado localmente: importacao exige apenas extracao concluida/cancelada, selecao, conexao e marca validas; confirma resumo antes do request, preserva linhas em falha e permite retry das falhas. Novas keywords seguem `bruto`, `brand_id` real e `lista_id` nulo.
- Nao alterado: bridge, handshake, storage de sessao da conexao, manifest, funil, filtros, contrato de medicao e endpoints remotos. Nao houve SQL, migration, escrita remota, limpeza geral de storage, commit, push ou deploy.
- Confirmado localmente: sintaxe dos scripts, testes direcionados da extensao e `git diff --check`. Ainda nao verificado: Chrome autenticado com popup fechado durante extração, provider Google real, endpoint remoto de volume/importacao, persistencia Supabase, dark mode manual e roteiro completo de Adalba/Lindisse.

## Ajuste localizado da tabela - colunas Funil, Principal e Keyword - 2026-07-27

- Implementado localmente: a tabela HTML agora possui colunas próprias para `Funil` e `Principal`; a política da principal não é mais renderizada dentro da célula da keyword.
- Implementado localmente: a tabela usa layout fixo com largura mínima de planilha e deixa a keyword absorver o espaço restante. Keywords longas podem quebrar; canonical publicado fica em segunda linha com truncamento apenas no metadado secundário.
- Implementado localmente: `Funil` lê somente hints já existentes em `analise_semantica.extension_import.funnelHints` ou campos equivalentes presentes; sem dado, exibe `—`. Nenhum funil é inferido, persistido ou alterado.
- Preservado: filtros, ordenação, status, resultados, volume, KGR, seleção, expansão, tenantização, persistência, importação, bridge e extensão.
- Testes locais: layout da tabela, hidratação, regressões do Minerador, TypeScript, build Next.js 16 e `git diff --check` passaram. Lint direcionado ainda acusa erros preexistentes do componente (`any`, hooks e memoização), fora do escopo desta correção.
- Validação visual manual em 360px, 768px, 1024px e 1440px, light/dark quando aplicável, permanece pendente; o script visual previsto não existe neste checkout.

## Correção da distribuição das colunas da tabela - 2026-07-27

- Implementado localmente: a ordem após as colunas utilitárias agora é `Keyword`, `Principal`, `Resultados`, `Volume`, `KGR`, `Intenção`, `Nicho de mercado`, `Funil`, `Silo/Categoria`, `Status`.
- Implementado localmente: `Keyword` permanece como a maior coluna flexível, com tabela mínima de `110rem` para reservar aproximadamente 420px ou mais; as demais colunas receberam larguras estáveis para evitar compressão e sobreposição.
- Implementado localmente: `KGR`, `Intenção`, `Nicho de mercado`, `Funil`, `Silo/Categoria` e `Status` preservam leitura, truncamento controlado nos selects e alinhamento entre cabeçalho e células.
- Preservado: dados, filtros, ordenação, seleção, expansão, persistência, importação, medição de volume, funil, bridge, handshake e contratos do Minerador.
- Validação local: teste direcionado de layout, TypeScript, build e `git diff --check`; lint direcionado continua limitado por erros preexistentes do componente. Validação visual manual em viewports menores e dark mode permanece pendente.

## Qualificação explícita e Funil na barra de ações - 2026-07-27

- Implementado localmente: o carregamento do Minerador não executa mais o DNA lógico nem persiste intenção, nicho ou Funil. Keywords antigas sem classificação final permanecem com `—` até seleção e ação explícita.
- Implementado localmente: `Qualificar selecionadas` é a ação primária da barra inferior e atualiza intenção, Funil, nicho, viés, confiança e KeywordDNA lógico somente para as linhas selecionadas.
- Implementado localmente: a proposta de Funil usa somente `TOFU`, `MOFU` ou `BOFU`, considera sinais textuais, intenção, etapa da jornada, potencial comercial, nicho, localidade e hints da Extensão, sem depender apenas de volume, resultados ou KGR.
- Implementado localmente: a proposta é persistida de forma aditiva em `analise_semantica.funnel`; `extension_import.funnelHints` é preservado como evidência, conflitos recebem `funnel_review_required`, e decisão humana reconhecida não é sobrescrita.
- Implementado localmente: cada linha processada aparece no resultado da qualificação com intenção, Funil, nicho, viés, confiança e estado de atualização, preservação, conflito ou falha.
- Implementado localmente: a barra superior mantém ações globais; a barra inferior agrupa organização, métricas, qualificação e decisão KGR. `Mais ações` contém publicação, classificação especializada de intenção/nicho e análise semântica; `Excluir` permanece separado e destrutivo.
- Preservado: layout e ordem das colunas, importação, volume, allintitle, bridge, handshake, tenantização, decisões de principal publicada e consumidores do KeywordDNA.
- Validação local: 131 testes direcionados, TypeScript e regressões de layout passaram. Lint direcionado mantém erros preexistentes do componente. Build, validação visual manual em light/dark e homologação autenticada permanecem pendentes nesta etapa.

## Correção definitiva do chevron de Silo/Categoria - 2026-07-27

- Implementado localmente: o select de `Silo/Categoria` mantém o `<select>` nativo para menu, teclado, foco, alteração e persistência, mas remove a seta nativa com `appearance: none` e compõe o estado fechado com texto truncável e `ChevronDown` separado.
- Implementado localmente: o wrapper visual usa largura compacta, limite da célula, área clicável mínima, espaçamento de 6px e chevron sem compressão; o `title` preserva o nome completo para valores longos.
- Preservado: largura e ordem das colunas, valores dos silos, handler, persistência, Status, demais selects, dados, bridge, handshake e contratos do Minerador.
- Validação manual no Chrome: desktop autenticado do Minerador, `Sem Silo/Categoria`, `Serviços`, `Crescimento de Clínicas`, foco visível, abertura via teclado e fechamento sem alteração do valor; `appearance` computado como `none` e separação medida em 6px.
- Pendente: validação manual adicional nos viewports de 360px, 768px e 1024px; não foi trocado valor durante a validação para evitar escrita remota.

## Padronização do select Silo/Categoria com Nicho de mercado - 2026-07-27

- Implementado localmente: `Silo/Categoria` agora reutiliza a mesma base de classes do select `Nicho de mercado`, incluindo altura, tipografia `10px`, peso `bold`, padding, borda, radius, fundo, largura total e comportamento nativo do chevron.
- Removido: wrapper `inline-flex`, `width: fit-content`, tipografia `text-sm`, peso `semibold`, ícone `ChevronDown` separado e seta nativa ocultada; o controle voltou a ser um `<select>` nativo consistente com o Nicho.
- Preservado: opções, `title`, handler, persistência, largura/ordem das colunas, Status, Funil, Nicho, demais selects e dados.
- Validação manual no Chrome: controles com mesma altura, fonte, peso, padding, borda, fundo e radius computados; foco/menu via teclado exercitados sem alterar o valor.
- Pendente: validação adicional em 360px, 768px e 1024px; seleção de valor não foi confirmada com escrita para evitar operação remota.

## Seleção complementar por intervalo e arraste - correção local - 2026-07-29

- Implementado localmente: clique individual, Ctrl/Cmd+clique, Shift+clique e Ctrl/Cmd+Shift+clique usam a ordem visual filtrada/ordenada como referência; a âncora `lastSelectionAnchorId` permanece local e é invalidada com segurança quando fica invisível.
- Implementado localmente: arraste somente na coluna de seleção, com tolerância de 4px, modo selecionar/desmarcar definido pelo checkbox inicial, deduplicação por gesto e supressão do clique subsequente.
- Implementado localmente: cabeçalho seleciona ou desmarca somente linhas visíveis, preserva seleções ocultas e exibe estado acessível indeterminado; contador informa o total selecionado e, quando aplicável, quantas estão visíveis.
- Preservado: foco, teclado, seleção individual, filtros, busca, ordenação, ações em lote, tenantização, persistência e dados. Nenhuma operação remota foi executada.
- Pendente: validação manual em Chrome nos viewports 360px, 768px, 1024px e 1440px, light/dark, com mouse, Ctrl/Cmd, Shift, teclado, filtros e arraste.

## Seleção por pintura e leitura localizada do allintitle - correção local - 2026-07-29

- Implementado localmente: a pintura usa listeners de Pointer Events no documento, `pointerId`, tolerância de 4px, `document.elementFromPoint()` e `closest("[data-keyword-selection-id]")`; somente a célula de seleção possui a área ativa.
- Implementado localmente: `pointerup`, `pointercancel`, perda de foco e desmontagem encerram o gesto; o clique sem movimento continua usando o fluxo individual e o clique gerado após pintura é suprimido.
- Implementado localmente: o leitor Google usa versão 2, aguarda estabilização mínima, procura `#result-stats`/`role=status`, abre `Ferramentas`/`Tools`/`Herramientas` uma vez quando necessário e extrai contagens ancoradas em texto de resultados.
- Implementado localmente: `success`, `zero_results` e `unavailable` permanecem separados; contador ausente usa `result_count_not_found`, estágio `google_result_extraction`, mensagem explícita e diagnóstico estruturado, sem persistir zero.
- Validado manualmente no Chrome: pintura selecionou 10 linhas e a mesma pintura desmarcou as 10 linhas.
- Validado manualmente no Google: após abrir `Ferramentas`, `#result-stats` exibiu `Aproximadamente 282 resultados (0,21 s)`; o valor 282 foi reconhecido e refletido na keyword `Agencia para clinica de estetica`.
- Validado manualmente após recarga do Minerador: a linha continuou exibindo `282`, confirmando a leitura da persistência já realizada pelo fluxo.
- Corrigido localmente: eventos de resultado e `batch_completed` agora aguardam a entrega do resultado antes do encerramento do lote, evitando `response_missing` por corrida de relay.
- Ainda não verificado: reload da Extensão propriamente dita e nova execução usando o background recarregado; a página interna `chrome://extensions` foi bloqueada pela política da automação. Não houve SQL, migration, deploy, commit, push ou limpeza de dados.

## Correção definitiva do modo pintar e do lote allintitle órfão - 2026-07-29

- Causa da pintura: o atributo de seleção não definia um handle interativo amplo; o `px-3` deixava o retângulo real com aproximadamente 7px e o gesto dependia do botão interno. O wrapper agora cobre a célula inteira sem alterar a largura da coluna, usa `touch-none`, captura/libera `pointerId` e valida o hit-test pelo handle.
- Causa do bloqueio: a versão anterior confundia qualquer registro `allintitle:{batchId}` com executor vivo, removia estados terminais e não reconciliava registros ativos quando o service worker reiniciava.
- Implementado localmente: ponteiro `allintitle:activeOperationByBrand:{brandId}`, estados ativos separados de terminais/interrompidos, reconciliação no startup, histórico preservado e cleanup protegido por `try/catch` do executor.
- Implementado localmente: `operation_guard` para execução viva, `operation_reconciliation` para órfão, comandos de acompanhar, retomar, cancelar e descartar, sem tocar no endpoint, schema, volume, KGR, importação ou qualificação.
- Diagnóstico do lote `6094d433-cc0d-418e-8bf5-73a786edb868`: o retorno fornecido registra o `batchId`, mas não informa o `status` armazenado; o código anterior não mantinha executor após reinício e não oferecia reconciliação. O novo startup marcará qualquer registro ativo desse lote como `orphaned` se ele ainda existir.
- Pendente manual do usuário: recarregar a Extensão e a página, testar o gesto real com botão primário em dez linhas, repetir iniciando em marcada, verificar acompanhamento/retomada/descarte/cancelamento e iniciar nova medição após cada terminal. A inspeção automatizada confirmou hitbox de aproximadamente 31px, mas não substitui o gesto manual.

## Remoção da exigência indevida de silo no allintitle - correção local - 2026-07-29

- Causa localizada no workspace: `startAllintitleMeasurement` exigia `item.lista_id` e presença em `allowedListIds`; `handleConfirmAllintitle` repetia o mesmo filtro antes de reconciliar resultados persistidos. A condição foi introduzida no handler original de medição em 2026-07-27 e pertencia a um guard de escopo de listas, não ao contrato de métrica individual.
- Corrigido localmente: a elegibilidade usa ID técnico válido, texto não vazio, `brand_id` correspondente à marca ativa e seleção explícita. Keywords Bruto, sem lista, Sem Silo/Categoria, com lista ou com silo continuam no mesmo fluxo.
- Corrigido localmente: erros de pré-validação usam `code`, `stage` e `diagnostic`; a validação por silo foi removida sem alterar vínculos, listas, endpoint, schema, persistência server-side, relay ou background-owned.
- Pendente: smoke test manual no Chrome com duas keywords Bruto sem silo, uma keyword com silo, reload do Minerador e confirmação da persistência. Nenhuma operação remota foi executada.

## Persistência server-side e fluxo background-owned do allintitle - implementação local - 2026-07-29

- SDD criada e aprovada nesta solicitação: `propostas/persistencia-server-side-results-allintitle.md`. A autorização cobre somente a persistência de `results_allintitle`, sem schema, migration, RLS ou autenticação global.
- Implementado localmente: `POST /api/extensao/marcas/[brandId]/keywords/resultados-allintitle` reutiliza a sessão autenticada da Extensão, permissão tenantizada do Minerador, rate limit e atualiza somente `keywords_kgr.results_allintitle`.
- Implementado localmente: `success` e `zero_results` persistem valor confirmado; falha, CAPTCHA, bloqueio, timeout, cancelamento e valor ausente preservam o resultado anterior. Respostas individuais distinguem `persisted`, `preserved`, `rejected` e `failed`.
- Implementado localmente: o workspace não possui mais escrita direta concorrente de `keywords_kgr` no fluxo allintitle; a interface reconcilia o valor somente após `persistenceOutcome: persisted`.
- Implementado localmente: o relay `minerador-extension-relay.js` é declarado apenas para `localhost:3000` e `127.0.0.1:3000`, valida origem/rota/protocolo e devolve `extension_page_reload_required` para contexto invalidado. A bridge programática permanece apenas para diagnóstico/conexão.
- Implementado localmente: o background reutiliza o executor sequencial existente, estado em `chrome.storage.session`, uma aba Google, intervalo conservador, pausa por CAPTCHA, retomada, cancelamento, IDs e eventos. O lote não é cancelado por popup ou reload da página.
- Ainda não verificado: smoke test autenticado no Chrome com Extensão recarregada, duas keywords, popup fechado, reload durante o lote, persistência real, zero/erro e isolamento Adalba/Lindisse. Nenhuma operação remota foi executada.
## Preflight just-in-time da medicao allintitle - implementacao local - 2026-07-27

- Causa localizada do `ack_timeout`: o registro conectado em `chrome.storage.session` podia sobreviver a reload/navegacao na mesma URL, enquanto a bridge atual ja nao era comprovada; `tabs.onUpdated` tambem ignorava o estado `loading`.
- Implementado localmente: `ensureMineradorConnection(...)` concentra a validacao de sessao, tabId, origem, rota, modulo, actorUserId, brandId, brandRef, protocolVersion, probe, `bridgeInstanceId` e handshake. A conexao armazenada nao e mais prova suficiente.
- Implementado localmente: `loading`/navegacao marca a conexao efemera como pendente de revalidacao; no `complete`, a bridge e preparada novamente somente para uma aba do Minerador que ja possuia registro efemero. O handshake continua explicito no preflight da operacao.
- Implementado localmente: falhas de probe/handshake permitem uma unica recuperacao controlada, com nova injecao, probe e handshake. Sem `HANDSHAKE_OK`, o lote nao e criado e nenhuma aba Google e aberta.
- Implementado localmente: o popup gera o `batchId` somente apos a resposta de preflight; o workspace usa `Validando conexao...`, `Preparando medicao...` e diagnostico com estagio nao nulo.
- Diagnosticos preservam `operationRequestId`, `connectRequestId`, `probeRequestId`, `handshakeRequestId`, `tabId`, bridge anterior/atual, ultimo estagio, codigo e mensagem de erro disponivel, sem segredos.
- Confirmado localmente: sintaxe, testes de preflight/handshake/allintitle, TypeScript e build devem ser registrados separadamente; Google real, reload autenticado, renovacao automatica e persistencia remota continuam validacao manual pendente.

## Renovacao automatica antes do allintitle - correcao local - 2026-07-28

- Causa confirmada: o timeout observado na pagina ocorria antes de a solicitacao chegar a bridge quando a bridge ainda nao estava instalada no documento recarregado. Por isso nao havia `INJECTION_OK`, `PROBE_ACK` ou `HANDSHAKE_OK` no diagnostico.
- Implementado localmente: `tabs.onUpdated` marca o registro efemero como obsoleto no `loading` e prepara a bridge uma unica vez no documento final `complete`; o preflight remove somente o registro efemero obsoleto e usa `ensureMineradorConnection(...)` para validar tabId, marca, origem, rota, bridge atual, probe e handshake.
- Implementado localmente: a recuperacao e limitada a uma tentativa. Em falha recuperavel, o registro e invalidado, a bridge e reinjetada, e o fluxo so cria lote depois de `HANDSHAKE_OK`. Nao ha polling nem handshake duplicado no executor allintitle.
- Diagnostico local preserva `operationRequestId`, IDs de connect/probe/handshake, tabId, bridge anterior/atual, `recoveryAttempted`, `recoveryResult`, eventos, ultimo estagio e codigo real da falha.
- Mensagens do fluxo: sucesso de renovacao usa `Conexao renovada. Preparando medicao...`; falha usa a mensagem principal de renovacao e orienta conectar novamente a aba.
- Confirmado localmente: 52 testes direcionados, sintaxe dos scripts, TypeScript e build passaram. ESLint dos scripts da extensao nao apresentou erros; o lint incluindo o workspace continua com 21 erros preexistentes do componente. `git diff --check` nao apresentou erros.
- Ainda nao verificado: Chrome autenticado com reload na mesma URL, recuperacao real, reabertura do popup e medicao real allintitle. Nenhuma operacao remota foi executada.
- Correcao definitiva apos reload - 2026-07-28: `loading` apenas marca a sessao efemera como stale, invalida `bridgeInstanceId` atual e atualiza o popup para estado de revalidacao; a reinjecao ocorre uma unica vez no `complete` para a mesma aba, origem, marca e rota.
- A preparacao pos-reload executa injecao programatica em mundo `ISOLATED`, frame 0, probe limitado e registra `ready_for_validation`; nao declara conexao e nao inicia handshake, lote, Google ou polling.
- O popup agora diferencia `Atualizando a conexao...`, `Minerador pronto para validacao.` e falha de reinjecao, sem manter o estado verde. O preflight da pagina classifica ausencia de canal como `page_bridge_unreachable` em `page_bridge_dispatch`, nao como `ack_timeout` generico.
- A operacao allintitle reutiliza a bridge preparada, confirma o `bridgeInstanceId`, executa o handshake e so depois cria o lote. Se a instancia mudar, ha uma unica recuperacao controlada.
- Eventos pos-reload: `TAB_LOADING_DETECTED`, `CONNECTION_MARKED_STALE`, `TAB_COMPLETE_DETECTED`, `REINJECTION_STARTED`, `REINJECTION_OK`, `RELOAD_PROBE_SENT`, `RELOAD_PROBE_ACK`, `READY_FOR_VALIDATION`.
- Validacao manual no Chrome permanece pendente; nao houve limpeza ampla: somente o registro efemero stale e removido no preflight. Nenhum logout, SQL, migration, operacao remota, commit, push ou deploy foi executado.

## Restauração da seleção e da fila allintitle - implementação local - 2026-07-29

- Regressão identificada no código atual: workspace, popup e background bloqueavam a operação acima de 10 itens; a prévia correlacionava resultado apenas pelo `batchId`, o que descartaria eventos dos sublotes seguintes.
- Implementado localmente: uma operação aceita qualquer quantidade selecionada e cria sublotes internos sequenciais de até 10, com `operationRequestId`, progresso geral, `batchId` técnico por sublote e persistência confirmada por item.
- Implementado localmente: a tabela voltou a iniciar pintura no botão do checkbox, sem cursor de cruz; movimento abaixo de 4px mantém o clique individual normal. A prévia do popup agora tem clique, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, pintura e ações de selecionar ou limpar visíveis.
- Implementado localmente: eventos de diagnóstico por item registram a cadeia do resultado até a reconciliação da prévia, sem consulta real ao Google em testes.
- Ainda não verificado: Chrome autenticado com a Extensão recarregada, seleção manual, 51 keywords, avanço automático entre grupos, popup fechado, reload da página e a consulta que mostrou 323 resultados. Nenhuma operação remota foi executada.

## Retorno direto do allintitle à tabela - correção local - 2026-07-29

- Correção de escopo: a prévia e a confirmação manual do lote não pertencem ao fluxo aprovado. O resultado validado no endpoint server-side é a única condição para refletir `results_allintitle` na tabela.
- Implementado localmente: removido o painel de prévia e sua seleção; cada retorno com `persistenceOutcome: persisted` atualiza imediatamente somente a linha correspondente. O encerramento do lote ainda reconcilia o snapshot final como contingência para evento individual perdido.
- Durante a execução permanece apenas o estado compacto de progresso com pausar, retomar e cancelar. Falhas, CAPTCHA, timeout e valores ausentes preservam o valor anterior.
- Ainda não verificado: recarregar extensão e página, medir um lote pequeno no Chrome autenticado e confirmar atualização direta das linhas sem painel de prévia. Nenhuma operação remota foi executada.

## Leitura e continuidade do allintitle em segundo plano - correção local - 2026-07-29

- Causa dos cinco itens sem retorno persistível: o leitor v2 deixou de considerar o texto principal da página do Google e procurava somente seletores pequenos. O fallback controlado para `document.body.innerText`, já usado pelo leitor funcional anterior, foi restaurado após a validação da consulta.
- Implementado localmente: o executor mantém um watchdog em `chrome.alarms`, com estado persistido por lote. Se o service worker for suspenso, o alarme recupera o lote e continua do índice salvo; fechar popup, mudar de aba ou sair da página do Minerador após a aceitação não interrompe o lote.
- Implementado localmente: CAPTCHA, consentimento e bloqueio pausam o lote, trazem a aba Google à frente, exibem notificação nativa do Chrome com feito/restante e mantêm Retomar/Cancelar no estado compacto do Minerador.
- Interface: o contador agora informa feito, total e restante sem reintroduzir prévia. Resultados confirmados continuam indo diretamente à tabela.
- Ainda não verificado: Chrome autenticado com extensão recarregada, uma contagem real, suspensão do service worker entre itens, alerta nativo e retomada manual após CAPTCHA/consentimento. Nenhuma operação remota foi executada.

### Correção complementar — reutilização da mesma consulta

- Causa observada em telas fornecidas: o Google exibe claramente `Aproximadamente 5 resultados` e `Aproximadamente 267 resultados`, mas uma aba reutilizada na mesma URL podia preservar o leitor anterior em memória após atualização da extensão.
- Implementado localmente: quando a próxima keyword usa exatamente a consulta já aberta, a extensão recarrega essa página sem cache antes de injetar o leitor; o contador visível passa a ser analisado pelo código atual.

## Diagnóstico preservado de falha na persistência allintitle - correção local - 2026-07-29

- Corrigido localmente: uma falha de persistência por keyword deixa de ser reduzida ao aviso genérico `no_persisted_allintitle_results`. O resultado final carrega código, mensagem, valor medido e diagnóstico seguro do endpoint (status HTTP, IDs de correlação e outcome).
- Corrigido localmente: o encerramento do lote mostra o primeiro motivo real e permite repetir somente as keywords que falharam; `Copiar diagnóstico` inclui, no máximo, dez falhas sem token, cookie ou chave.
- Preservado: a tabela só recebe resultado com `persistenceOutcome: persisted`; falha continua sem sobrescrever dado existente, sem reintroduzir prévia ou escrita direta pelo workspace.
- Confirmado por testes locais: contrato do leitor, lote, endpoint de persistência e interface de encerramento. Ainda não verificado: nova medição autenticada no Chrome para identificar e corrigir, se houver, o código remoto específico do ambiente.

## Fluxo direto do popup e retorno parcial explícito - correção local - 2026-07-29

- Corrigido localmente: o popup deixou de medir allintitle e volume sobre candidatos temporários. Ele agora extrai, permite selecionar e importa; a medição ocorre na tabela do Minerador, somente depois de a keyword possuir ID persistido.
- Corrigido localmente: clique, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, teclado e pintura da prévia usam um único fluxo de ponteiro. As gravações do estado temporário são enfileiradas e versionadas, impedindo uma resposta antiga de restaurar seleções já alteradas ou descartadas.
- Corrigido localmente: a tabela captura o ponteiro no início da pintura. No fim de um lote parcial, informa quantos resultados foram persistidos e quantas keywords não retornaram medição confirmada, mantendo os IDs faltantes para repetição dirigida.
- Ainda não verificado: Chrome autenticado com clique livre e atalhos no popup, reabertura do popup após desmarcar, importação seguida de medição na tabela e repetição somente de um item faltante. Nenhuma operação remota foi executada.

## Navegação Google e alerta de CAPTCHA - correção local - 2026-07-29

- Causa confirmada pelos diagnósticos reportados: a consulta podia tentar interpretar a URL transitória vazia da aba Google, gerando `navigation_failed` com `Invalid URL`; o carregamento inicial da aba também podia ser confundido com a navegação da consulta e gerar `unexpected_navigation`.
- Corrigido localmente: a URL transitória é tratada como consulta ausente e a espera observa especificamente a URL da query. Páginas Google conhecidas de interrupção (`/sorry/index`, reCAPTCHA e consentimento) são aceitas para o leitor classificar o desafio, em vez de falhar antes com `unexpected_navigation`.
- Preservado: CAPTCHA ou bloqueio pausa o lote, abre a aba Google, mantém feito/restante, emite aviso nativo e apresenta Retomar/Cancelar no Minerador. Não há persistência de métrica para o item interrompido.
- Ainda não verificado: desafio real no Chrome com a versão recarregada da Extensão e exibição efetiva da notificação do sistema. Nenhuma consulta Google, importação ou escrita remota foi executada nesta correção.

## Pausa imediata por CAPTCHA e reanexo da operação ativa - correção local - 2026-07-29

- Causa confirmada pelo lote reportado: a página de desafio do Google em português foi devolvida como `query_mismatch`. O executor a tratou como falha normal e percorreu os itens restantes; os 25 resultados persistidos são válidos, e os 190 não tiveram medição confirmada.
- Corrigido localmente: o leitor reconhece as rotas `/sorry/index` e reCAPTCHA antes de validar a query, além de textos como `tráfego incomum` e `Nossos sistemas detectaram`. O primeiro desafio agora gera `captcha`, pausa a operação, preserva o índice e dispara o aviso/Retomar.
- Corrigido localmente: `allintitle_operation_active` devolve o snapshot seguro da operação ativa. A tabela o usa para acompanhar automaticamente o lote existente, restaurando contador e controles em vez de deixar apenas o erro técnico.
- Ainda não verificado: CAPTCHA real com a versão atualizada da Extensão, pausa no primeiro item afetado, alerta nativo e retomada sem reprocessar os itens já concluídos. Nenhuma operação remota foi disparada nesta correção.

## Estado retomável de CAPTCHA no Minerador - correção local - 2026-07-29

- Causa confirmada pelo retorno reportado: o evento `batch_paused` já preservava o lote, mas a tabela o apresentava como notificação de erro e sem ação de retomada naquele aviso.
- Corrigido localmente: CAPTCHA agora é estado informativo de pausa, com `Retomar` e `Cancelar lote` tanto no aviso persistente quanto na barra de progresso. O botão principal passa a informar `Aguardando CAPTCHA...`, sem fingir que há uma medição em curso.
- Preservado: apenas outra medição allintitle da mesma marca fica protegida contra duplicidade; qualificação, volume e as demais ações da tabela não são bloqueados por esse estado.
- Ainda não verificado: no Chrome, liberar o desafio e confirmar que `Retomar` continua exatamente do item pausado, sem descartar resultados já persistidos.

## Aviso de CAPTCHA sem roubo de foco - correção local - 2026-07-30

- Confirmado manualmente pelo usuário: dois desafios pausaram, foram liberados e a operação continuou, inclusive com a keyword interrompida pulada no retorno final.
- Corrigido localmente: o executor não ativa mais automaticamente a aba Google ao detectar CAPTCHA ou bloqueio. A notificação persistente da Extensão, o badge `!`, o clique na notificação e o botão `Abrir Google` continuam disponíveis para abrir a aba somente por decisão do usuário.
- Preservado: pausa imediata, estado persistido, contador, Retomar/Cancelar, continuidade em segundo plano e proteção contra uma segunda medição concorrente.
- Ainda não verificado: confirmar no Chrome que o aviso do sistema aparece sem trocar a aba em primeiro plano.

## Resposta parcial da classificação de intenção e nicho - correção local - 2026-07-30

- Confirmado manualmente pelo usuário: 136 keywords foram classificadas e persistidas; três respostas do modelo chegaram sem as chaves de topo esperadas e foram recusadas sem sobrescrever dados anteriores.
- Corrigido localmente: o endpoint agora aceita somente valores já fornecidos pelo modelo nos formatos equivalentes `intent`/`intencao` e `nicho`/`niche`, inclusive quando estão sob `classification`, `classificacao`, `result` ou `data`. Respostas sem os dois valores continuam recusadas.
- Corrigido localmente: falha parcial passa a usar aviso informativo e `console.warn`, com até dez keywords falhas no diagnóstico, sem apresentar conclusão parcial como sucesso total.
- Ainda não verificado: repetir manualmente somente as três keywords que falharam, sem disparar lote real automatizado nesta correção.

## Pintura imediata da seleção de keywords - correção local - 2026-07-30

- Causa confirmada no código e no relato do usuário: o arraste acumulava checkboxes visitados e alterava `selectedIds` somente no `pointerup`, produzindo atraso visual.
- Corrigido localmente: a pintura agora recalcula o intervalo entre a checkbox inicial e a checkbox sob o ponteiro a cada movimento. Avançar seleciona ou desmarca imediatamente; voltar remove o trecho que deixou de pertencer ao intervalo, sem esperar soltar o clique.
- Preservado: clique comum, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, seleção de visíveis, seleção ocultada por filtro, acessibilidade do checkbox e ações em lote.
- Ainda não verificado: gesto real no Chrome, com ida e volta rápida, mouse e touchpad, além de modificadores de teclado.

## Volume brasileiro via SEO Keyword Research Tool - correção local - 2026-07-30

- Causa confirmada pelo retorno manual: as rotas de volume ainda restringiam configuração ao host antigo `seo-keyword-research8.p.rapidapi.com` e ao contrato `result[].avg_monthly_searches`; por isso rejeitavam o provedor validado no Playground antes de qualquer medição.
- Corrigido localmente: as rotas server-side do Minerador e da Extensão agora usam `GET /global-volume` em `seo-keyword-research-tool1.p.rapidapi.com`, com `keyword` e `country=br`.
- Normalização segura: somente `Keyword Overview.BR[]` da keyword exata pode produzir `volume_search`; valores abreviados como `1.3k` são convertidos para número. `global`, outros países, ausência de BR, payload parcial ou volume inválido não viram medição e não alteram os dados anteriores.
- Testes locais: 27 testes direcionados, `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram. Nenhuma chamada RapidAPI adicional, escrita remota, migration, commit, push ou deploy foi executada nesta correção.
- Pendente manual: após a renovação da cota, medir uma keyword brasileira autenticada e confirmar volume, fonte registrada, persistência e preservação de valor anterior em ausência/falha.

## Conclusão sem volume BR e superfície dos avisos - correção local - 2026-07-30

- Corrigido localmente: `not_found` do provedor — inclusive ausência da seção `BR` — não percorre mais o fluxo de exceção nem exibe código técnico como erro. Sem nenhuma medição, a interface informa somente que a medição foi concluída sem volume BR disponível; em lote parcial, informa a quantidade sem volume BR como conclusão normal.
- Preservado: erro HTTP, payload inválido, quota e falha real do provedor continuam visíveis como erro e não alteram métricas anteriores.
- Corrigido localmente: os avisos `success`, `info` e `error` usam superfícies `emerald`, `amber` e `rose` opacas com bordas existentes, removendo a classe inválida que deixava o aviso de erro transparente no dark mode.
- Testes locais: testes direcionados de interface/volume passaram 28/28; TypeScript, `git diff --check` e build passaram. Lint do workspace conserva erros legados fora do trecho alterado.
- Pendente manual: conferir no Chrome dark mode a conclusão sem BR, um erro real e um aviso informativo, em largura de desktop e viewport estreita.

## KGR não calculável para volume zero e estados visuais - correção local - 2026-07-30

- Corrigido localmente: toda keyword cujo `volume_search` seja exatamente `0` apresenta `Não calculável` na coluna KGR, com prioridade sobre o estado pendente ou a decisão semântica. Não recebe pontuação KGR nem tem seus dados existentes alterados.
- Corrigido localmente: tentar aprovar KGR para uma seleção que contenha volume zero encerra com aviso informativo, sem persistir uma decisão inválida e sem tratar a condição conhecida como erro técnico.
- Interface: os estados textuais de KGR (`Pendente`, `Não calculável`, `Não aplicável`, `Inconsistente`, `Inválido` e `Sem medição`) reutilizam a mesma geometria compacta dos selos da coluna Principal. Os valores numéricos e sua escala cromática permanecem inalterados.
- Preservado: política `Principal travada`/`Principal revisável`, slug, canonical, volume, resultados allintitle, ordem/largura das colunas e contratos de persistência. A política da principal continua uma decisão humana explícita.
- Testes locais: 43 testes direcionados e `npx tsc --noEmit` passaram; `git diff --check` passou. O lint do workspace conserva 21 erros e 8 avisos legados fora do trecho alterado.
- Pendente manual: validar no Chrome em dark mode que volume zero exibe o selo `Não calculável`, que os demais textos KGR seguem o mesmo padrão visual de Principal e que valores numéricos não mudaram.

## Destaque visual de volume confirmado - correção local - 2026-07-30

- Corrigido localmente: `0 confirmado` permanece reservado ao zero efetivamente retornado pela medição exata. Zero sem essa evidência continua com a apresentação normal, sem sugerir confirmação.
- Corrigido localmente: números positivos retornados pelo provedor passam a usar a mesma cor azul já aplicada ao selo `0 confirmado`, permitindo identificar a medição real sem acrescentar outro rótulo visual.
- Proteção: o destaque só é aplicado quando `volume_measurement` declara `match: exact`, status `confirmed`/`zero_confirmed` e `rawVolume` igual ao valor atualmente exibido. Números legados, estimados ou sem evidência de medição mantêm a cor existente.
- Testes locais: 36 testes direcionados e `npx tsc --noEmit` passaram. Nenhuma medição, escrita remota ou alteração de dados foi executada.
- Pendente manual: conferir no Chrome, em dark mode, zero confirmado, zero pendente, número confirmado e valor legado na mesma tabela.

## Padronização visual da intenção - correção local - 2026-07-30

- Corrigido localmente: os rótulos da coluna Intenção agora usam o mesmo selo compacto já empregado pelos estados textuais de Principal e KGR, sem alterar a taxonomia, a classificação ou a largura da coluna.
- Preservado: intenção conhecida continua legível; `Pendente/não classificada` usa a variante neutra. O texto completo permanece disponível no `title` e nomes longos truncam dentro do limite da célula.
- Pendente manual: conferir no Chrome em dark mode os selos de Intenção, textos longos e intenção pendente em desktop e viewport estreita.

## Legibilidade da grade e hover da planilha - correção local - 2026-07-30

- Corrigido localmente: os separadores horizontais e verticais das linhas da planilha usam um tom slate discretamente mais claro, preservando a densidade e o dark mode sem criar novos tokens ou cores.
- Corrigido localmente: o hover identifica a linha sob o mouse. Linhas selecionadas e publicadas mantêm seus contextos índigo e rose durante o hover, em vez de parecerem uma linha neutra.
- Preservado: ordem/largura de colunas, seleção, status, badges, filtros, persistência e dados.
- Pendente manual: validar contraste e leitura da grade em Chrome, nas larguras 360px, 768px, 1024px e 1440px.

### Ajuste corretivo das linhas horizontais

- Corrigido localmente após validação visual: o divisor horizontal agora usa exatamente a mesma intensidade das linhas verticais da tabela. O hover permanece mais claro, como solicitado.
- Ajustado localmente: o hover de qualquer linha usa cinza neutro, inclusive em linhas selecionadas ou publicadas.

## Busca ampliada e histórico ancorado - correção local - 2026-07-30

- Corrigido localmente: o campo Buscar da barra do Minerador comporta aproximadamente 60 caracteres, sem alterar o filtro, a ordenação ou a largura das colunas da planilha.
- Corrigido localmente: o Histórico do Minerador abre abaixo do botão como popover, fecha por clique fora, Escape ou botão de fechar. Os demais consumidores mantêm o painel lateral anterior pela variante compartilhada compatível.
- Correção complementar: como a barra do Minerador possui rolagem horizontal e recorta elementos internos, o popover é renderizado em portal fixo no `document.body`, ancorado no botão. Assim aparece sobre a planilha, logo abaixo da barra, sem corte.
- Pendente manual: conferir posição do popover, clique externo, Escape, restauração e campo Buscar em desktop e viewport estreita.

## Terminologia de keyword fora de artigo - correção local - 2026-07-30

- Corrigido localmente: o selo visual do estado técnico `free` passa de `Principal livre` para `Keyword livre`, pois a keyword ainda não integra um artigo.
- Preservado: o valor técnico `free`, suas regras, seleção, persistência, política de principal publicada e contratos permanecem inalterados.
- Pendente manual: conferir o rótulo na coluna Principal em dark mode, sem regressão visual dos selos `Principal travada` e `Principal revisável`.

## Densidade consistente das ações selecionadas - correção local - 2026-07-30

- Corrigido localmente: os controles do rodapé de ações em lote reutilizam a altura, padding, tipografia, radius e escala de ícones compactos da barra superior.
- Preservado: handlers, disponibilidade, seleção, menus, cores semânticas, barra de progresso e largura da planilha.
- Pendente manual: conferir no Chrome a barra inferior em dark mode, com ações habilitadas/desabilitadas e nas larguras 360px, 768px, 1024px e 1440px.

## Redistribuição de largura para Palavra-Chave - correção local - 2026-07-30

- Corrigido localmente: Principal, Intenção e Funil foram reduzidas para 128px, 168px e 80px, respectivamente. Os 62px liberados passam para Palavra-Chave, que já é a coluna elástica da tabela fixa.
- Preservado: ordem das colunas, largura de Resultados, Volume, KGR, Nicho, Silo/Categoria e Status; badges, selects, filtros, dados e persistência.
- Pendente manual: conferir no Chrome Principal travada/revisável, intenções longas, TOFU/MOFU/BOFU e keywords longas em dark mode e nas larguras 360px, 768px, 1024px e 1440px.

## Descobrir Keywords - SDD e plano estrutural - registro atualizado - 2026-08-03

- Atualização: a rota `/{brandRef}/minerador/descobrir` e a separação do Processador em `/{brandRef}/minerador` estão implementadas localmente; este bloco preserva o desenho estrutural original.
- Auditoria confirmou seleção pura reutilizável em `lib/minerador/keyword-selection.ts`; a tabela, filtros, barra e ações ainda estão acoplados ao workspace atual e exigem extração gradual por composição antes de atender os dois consumidores.
- Documentado: três linhas, pipeline de descoberta, filtros futuros de Resultados/KD dependentes de Serper, entidades conceituais DiscoveryRun/DiscoveryCandidate e importação tenantizada ao Processador sem lista artificial.
- Preservado: tabela e rota atuais, Extensão, Google Ads existente, schema, migrations, Arquiteto, Radar e serviços remotos. A implementação atual não adiciona persistência nem migration.
- Registro histórico: a autorização estrutural e a homologação da Descoberta foram concluídas nas fases seguintes. O fechamento vigente está registrado no bloco Fase 7 no topo deste documento.

## Elegibilidade por volume oficial - implementação local - 2026-08-03

- Implementado: `analise_semantica.volume_eligibility` passa a registrar `pending`, `eligible`, `below_threshold`, `unavailable` ou `measurement_failed` sem reutilizar status editorial.
- Google Ads classifica somente resultados exatos: `>= 120` é elegível, `0–119` fica abaixo do corte e média ausente fica inelegível sem alterar `volume_search`, KGR ou dados anteriores.
- A planilha inicia em `Elegíveis para produção`; o controle Organizar permite consultar pendentes, inelegíveis, falhas ou todas. Keywords publicadas continuam visíveis e não recebem esta decisão automática.
- Confirmado por testes locais: classificação pura, preservação de ausência, filtro operacional, keywords publicadas, projeção Google Ads e proveniência. Nenhuma API real, migration ou operação remota foi executada.
- Pendente manual: medir um lote misto no Chrome, conferir os selos, abrir Organizar para ver `Inelegível · sem volume oficial` e confirmar que as linhas permanecem disponíveis em Todas.

## Fundação Google Ads server-side - implementação local - 2026-08-03

- Corrigido localmente: as rotas REST estão fechadas e tipadas em `:generateKeywordIdeas`, `:generateKeywordHistoricalMetrics` e `/googleAds:searchStream`; não aceitam path arbitrário. A versão permitida é explicitamente `v25` e a mesma configuração que monta a URL fornece `providerVersion` à proveniência.
- Corrigido localmente: campos ProtoJSON `int64` aceitam string decimal ou inteiro seguro de fixture; são convertidos somente quando seguros, ausências e valores inválidos permanecem `null`, e micros permanecem strings decimais. A chave normalizada usa Unicode NFC, `trim` e lowercase neutro, sem remover acentos ou pressupor pt-BR.
- Proteções: a conta resolvida é a única fonte de customer, MCC, moeda e fuso. Divergência explícita no input é recusada antes de qualquer `fetch`; MCC configurado é aplicado quando o input o omite; OAuth usa cache isolado por configuração sem expor segredos.
- Correção complementar: cada métrica histórica preserva canônica, close variants e apenas as entradas solicitadas que correspondem àquelas chaves normalizadas. A resposta conserva todas as entradas originais e lista separadamente as não associadas; nenhuma keyword é atribuída a resultado arbitrário. SearchStream exige resposta e `results` em arrays, preservando `requestId` em payload malformado. `null` não desliga MCC configurado; o header só é omitido quando não há MCC efetivo.
- Confirmado por testes locais com `fetch` simulado: formatos REST literais, seeds de keyword/URL, paginação, 12 meses, CPC presente/ausente, int64, micros, close variants, conta sem autorização, quota, rate limit, timeout e payload malformado. Nenhuma API Google, Serper, RapidAPI ou serviço remoto foi chamado.
- Deliberadamente ainda não implementado: rota Next, interface, persistência, mapeamento marca-conta, cache de dados, substituição do provider de volume, alteração da Extensão, remoção da RapidAPI ou qualquer alteração no Radar/Serper. RapidAPI e Extensão continuam ativas.
- Pendente manual posterior: configurar uma conta anunciante autorizada explicitamente e executar smoke de uma keyword somente quando a próxima fase estiver autorizada.

### Smoke manual preparado

- Implementado localmente: `scripts/google-ads-smoke.mts` recebe conta, MCC opcional, keyword e targeting explicitamente, faz somente uma consulta histórica quando o usuário executar o comando e não persiste nada.
- Proteção: a saída mascara o customerId e exclui segredos, headers, cookies e resposta bruta. Moeda e timezone continuam vindo exclusivamente da conta resolvida.
- Ainda não verificado: execução real manual pelo usuário e comparação com a interface do Keyword Planner. Não houve chamada Google nesta implementação.
- Correção de experiência: o script direto agora carrega o ambiente com `loadEnvConfig(process.cwd())`, incluindo `.env.local`, e oferece `--check-config`/`--help`. Argumento de customer inválido é recusado antes de credenciais; configurações ausentes exibem somente seus nomes, com estágio e `apiRequestStarted: false`.

## Fase 5 — envio ao Processador — histórico superado pelo fechamento da Fase 7 — 2026-08-03

### Verificado no código

- Existe a rota server-side `POST /api/minerador/marcas/[brandId]/discovery/import`, tenantizada e protegida por `minerador:create`.
- A interface `Descobrir Keywords` envia somente UUIDs de candidatas persistidas e um `importRequestId`; não há importação automática ao pesquisar, selecionar, filtrar, ordenar ou recarregar.
- A barra informa selecionadas, novas e já existentes, desabilita a ação durante o envio, mantém a seleção até uma resposta e só oferece `Abrir no Processador` quando existe resultado aproveitável.
- A migration aditiva `supabase/migrations/0010_minerador_discovery_import.sql` define lote idempotente, vínculos de múltiplas origens, guardas de elegibilidade, RLS e o RPC transacional; seus objetos permanecem registrados como histórico da RPC antiga.
- Novas keywords são projetadas para `bruto`, Keyword livre, sem lista e sem decisão editorial; existentes são preservadas e recebem vínculo de origem.

### Confirmado por teste local

- O contrato de request rejeita seleção vazia, IDs livres e duplicatas.
- A resposta valida contagens, itens individuais e resultado idempotente.
- Testes estáticos confirmam a fronteira da rota, a migration, a ação explícita e o link canônico do Processador.

### Regressões manuais remanescentes

- Candidata já existente, repetição sem duplicação, retry idempotente e isolamento entre Adalba/Lindisse.
- Conferência visual completa no Chrome em dark mode e nos breakpoints.
- Essas regressões não bloqueiam o MVP funcionalmente concluído.

## Diagnostico da importacao Descoberta -> Processador - 2026-08-04

- Smoke autenticado de uma candidata confirmou que a rota chega ao RPC e devolve diagnostico sanitizado; esse registro é histórico da RPC antiga.
- A observacao anterior de migration nao executada refere-se ao checkout local; a existencia da RPC foi confirmada no ambiente alvo pelo smoke. O patch `0011` permanece documentado como histórico da RPC antiga, sem consumidor produtivo no fluxo convergido.
- Causa raiz comprovada: na funcao criada pela `0010`, o alias SQL `candidate` colide com a variavel record PL/pgSQL `candidate` nas validacoes de marca, IDs, run e filtro. O Postgres retornou `column reference "candidate.brand_id" is ambiguous` antes da criacao da keyword.
- Correcao local preparada em `supabase/migrations/0011_fix_minerador_discovery_import_candidate_alias.sql`, sem editar ou reaplicar silenciosamente a `0010`; a aplicacao no Supabase permanece manual e pendente.
- Validado: o fluxo novo de candidata foi persistido remotamente e apareceu no Processador; idempotência, candidata existente, retry e isolamento permanecem regressões manuais não bloqueantes.

## Importacao de runs partial finalizadas - correcao local - 2026-08-04

- Causa comprovada no codigo: a Descoberta persiste `partial` quando a resposta Google Ads tem `nextPageToken` ou atinge o limite da pagina, mas a mesma operacao ja foi consolidada com `completed_at`.
- A RPC da `0011` exigia somente `run.status = 'completed'` e rejeitava validamente uma `partial` finalizada como `MINERADOR_DISCOVERY_IMPORT_RUN_NOT_COMPLETED`.
- Preparada `supabase/migrations/0012_fix_minerador_discovery_import_finalized_run.sql`: aceita apenas `completed` ou `partial` com `completed_at` presente; continua rejeitando `pending`, `failed` e `partial` sem consolidacao. Candidatas filtradas continuam bloqueadas pela verificacao individual.
- A rota passa a devolver `runStatus`, `completedAtPresent` e `candidateCount` sanitizados e ajusta a mensagem para uma `partial` finalizada.
- Nenhuma keyword ou origem foi criada na tentativa rejeitada: a verificacao da run ocorre antes do `INSERT` do lote. A `0012` permanece documentada como histórico da RPC antiga.
- A primeira execucao da `0012` falhou apenas na localizacao textual da assinatura e foi revertida pela transacao; o patch local foi corrigido para validar diretamente schema, nome, quantidade e tipos dos argumentos.

## Importador compartilhado Extensao -> Descoberta - núcleo confirmado e legado preservado - 2026-08-04

### Verificado no codigo

- Criado `lib/minerador/keyword-import-core.ts` como nucleo server-side unico para normalizacao, deduplicacao por marca, criacao de keyword nova, preservacao de keyword existente e retorno do ID oficial.
- A rota da Extensao preserva payload, autenticacao, autorizacao tenantizada e contrato do popup, mas delega a persistencia de `keywords_kgr` ao nucleo.
- A rota da Descoberta deixou de chamar `import_minerador_discovery_candidates`. Ela relê run e candidatas por `brandId`, aceita `completed` ou `partial` finalizada, cria/recupera lote, chama o nucleo, grava origem, atualiza a candidata e consolida o lote.
- Keywords novas entram como `bruto`, `lista_id = null` e com volume/proveniencia da Descoberta; keywords existentes recebem somente evidencia aditiva e vinculo de origem.
- A RPC antiga e os objetos SQL de `0010`, `0011` e `0012` permanecem como legado, sem novos consumidores produtivos nesta convergencia.

### Confirmado por teste local

- Testes direcionados Extensao/Descoberta: 20/20.
- TypeScript passou.

### Regressões manuais remanescentes

- Candidata já existente, repetição sem duplicação, retry após falha de vínculo e isolamento entre Adalba/Lindisse.
- Conferência visual completa em dark mode e breakpoints.
- A importação nova e sua persistência remota foram confirmadas manualmente; nenhuma migration ou SQL remoto foi executado pelo agente nesta tarefa documental.

## Fase 8 - metricas atuais e allintitle nas duas areas - implementacao local - 2026-08-04

### Verificado no codigo

- A migration aditiva `0013_minerador_discovery_candidate_current_metrics.sql` foi criada, mas nao executada. Ela separa o snapshot imutavel da Descoberta da projecao operacional atual da candidata e cria historico append-only tenantizado.
- O protocolo allintitle existente aceita tanto `targetKind = keyword` com `keywordId` quanto `targetKind = discovery_candidate` com `candidateId`; a Extensao continua sendo o unico executor de leitura, fila, parser, CAPTCHA, pausa, retomada e notificacoes.
- A rota de persistencia atualiza somente valores confirmados. Falha, CAPTCHA, timeout ou resposta sem confirmacao preservam o valor anterior; candidatas registram o estado da medicao e o erro sanitizado sem apagar resultados.
- A rota Google Ads aceita `candidateIds` e grava volume, historico mensal, CPC, concorrencia, targeting, provider, versao e data na projecao atual. Keywords oficiais continuam usando o fluxo existente.
- Candidatas vinculadas a uma keyword oficial passam a registrar `keyword_id`; a atualizacao allintitle mantem a mesma medicao operacional nas duas representacoes, sem sobrescrever o snapshot da DiscoveryRun.
- A tabela da Descoberta recebeu as acoes `Medir resultados` e `Atualizar metricas`, preservando a selecao tecnica por `candidateId`.

### Ainda nao verificado

- A migration 0013 precisa ser aplicada manualmente antes do smoke autenticado; nenhuma operacao SQL remota foi executada nesta tarefa.
- Permanecem pendentes o smoke real das duas acoes nas duas abas, candidata ja importada/idempotencia, retry, isolamento Adalba/Lindisse e validacao visual completa em dark mode e breakpoints.

## Botao de importacao Descoberta -> Processador - correcao localizada - 2026-08-04

### Verificado no codigo

- O botao usa `type="button"`, fica bloqueado somente durante `importing` e envia `candidateIds` derivados de `selection.selectedIds`, que sao os `candidateId` tecnicos das candidatas persistidas.
- A reconciliacao agora detecta selecao stale ou divergente antes do `fetch` e mostra `A importacao nao pode ser iniciada. Sua selecao foi preservada.` sem apagar a selecao.
- O handler valida o `brandId` extraido do `brandRef`, gera `importRequestId`, registra o inicio da requisicao, interpreta a resposta e encerra o loading em `finally`.
- Falhas anteriores ao POST deixam detalhe tecnico somente em desenvolvimento; respostas HTTP continuam exibindo a mensagem sanitizada da rota.

### Confirmado por teste local

- Teste direcionado de importacao: 10/10.
- TypeScript e ESLint direcionado (incluindo teste com `--no-ignore`) passaram.

### Ainda nao verificado

- Network e smoke autenticado de sucesso no Chrome apos esta correcao.
- A aplicacao da `0012` foi relatada pelo usuario como `Success. No rows returned`, mas permanece sem verificacao independente pelo agente.

## Handoff canonico Minerador -> Arquiteto - implementacao local - 2026-08-11

### Verificado no codigo

- `keywords_kgr` permanece a fonte canonica das keywords; o handoff nao duplica texto, metricas ou DNA editorial.
- A operacao protegida do Arquiteto recebe somente IDs de keywords e valida a Brand no servidor antes de persistir `editorial_workflow_items` com `subject_type = keyword`, `stage = architect`, identidade da keyword, origem MINERADOR e estado `received`.
- O contrato usa `resolvePipelineContext()` para actor, sessao Supabase SSR e autorizacao server-side; nao depende de owner, nome, slug, e-mail ou storage do navegador.
- Repeticoes usam a unicidade de `(marca_id, subject_type, subject_id, stage)` e retornam `PERSISTED` ou `UNCHANGED`, sem duplicacao.

### Ainda nao verificado

- Nenhuma migration, SQL remoto, backfill ou smoke autenticado foi executado nesta tarefa. A validacao remota do handoff, da idempotencia e do isolamento entre Brands permanece pendente.
- IA, SERP, DataForSEO, providers e demais consumidores do Minerador nao foram chamados ou alterados.

## Diagnostico da divergencia do handoff canonico - 2026-08-12

### Verificado no codigo

- O modal do Arquiteto nao consulta `editorial_workflow_items` diretamente para exibir `Ja importado no Arquiteto`. O bloqueio usa `effectiveImportedKeywordIdsForUi`, que prioriza recovery/auditoria em memoria, depois IDs renderizados e, sem itens renderizados, `architectImportedKeywordIds`.
- `architectImportedKeywordIds` e restaurado e regravado por `workflowRecoveryStorageKey(actorUserId, brandId)` no `localStorage`; e um marcador legado/local, nao uma prova do handoff remoto.

### Relatado pelo usuario

- Na mesma Brand, o modal bloqueia itens como ja importados enquanto o workspace canônico permanece vazio apos reload, nova sessao, restart e mais de um navegador.

### Ainda nao verificado

- A correlacao remota keyword -> `editorial_workflow_items` -> read model aguarda a execucao manual do script read-only `supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql`. Nenhum dado foi corrigido, removido ou recriado.
## Zero Legacy — Google Ads — auditoria local — 2026-08-12

- **Baseline:** a limpeza estrutural 0032 foi relatada como aplicada e homologada; 0016 rollback e 0030 recovery não fazem parte do escopo Google Ads desta auditoria.
- **Verificado no código:** `public.minerador_google_ads_connections` é criada pela migration `0007_minerador_google_ads_volume.sql`, tem uma linha por `brand_id`, FK restritiva para `marcas`, RLS tenantizada e ACL local para `authenticated`. A contagem remota não foi consultada; não há seed/fixture local que permita inferi-la.
- **Consumidores runtime comprovados:** a rota de configuração faz GET/upsert; as rotas de Descoberta e métricas fazem leitura antes da chamada Google Ads; `modules/marca/google-ads-connection-panel.tsx` consome somente a API. Não foram encontrados outros consumidores diretos em `app`, `modules`, `lib` ou `components`.
- **Credenciais:** OAuth, Developer Token, versão e MCC técnico continuam server-side em `GOOGLE_ADS_*`; a tabela legada não armazena segredo nem refresh token. O access token fica em cache de memória.
- **Paridade:** 0024/0025 oferecem os contratos genéricos de provider, capability, connection, grant, binding, quota e usage, mas ainda não representam de modo completo Customer/MCC, targeting, moeda/timezone, validação, `secret_ref` ou a resolução das três rotas Google Ads.
- **Classificação:** `GOOGLE_ADS_LEGACY_AUDIT = COMPLETE_LOCAL_ONLY`; `CANONICAL_PARITY = PARTIAL`; `FINAL_CLASSIFICATION = MIGRATE_THEN_DROP`.
- **Próximo passo seguro:** aprovar o mapeamento semântico e adaptar primeiro a leitura server-side por binding/capability canônicos, com readback e linha legada preservada como rollback. Não criar tabela espelho, não executar provider automaticamente e não preparar migration de remoção antes de provar zero consumidores.
- **Operações:** nenhuma consulta remota, migration, alteração de dados, chamada paga ou alteração de runtime foi executada nesta auditoria.
## Google Ads — canonical cutover blocked by schema gap — 2026-08-12

- `public.minerador_google_ads_connections` remains the active runtime source for the configuration route, Google Ads Discovery and Google Ads metrics. The panel consumes that route indirectly.
- The shared 0024/0025 runtime already models provider, capability, connection, grant, binding, quota and usage, but the Google Ads consumer has not been migrated to those layers.
- The mapping has an objective structural gap: there is no approved canonical representation for the Customer-to-MCC relationship, Brand-owned targeting parameters, current external-account metadata, or `validated_at` semantics. `integration_connections.metadata` cannot be used as a silent substitute because it belongs to the connection owner, not the Brand operation configuration.
- No canonical cutover, dual-write, backfill, provider call, migration or remote SQL was performed. No fallback was added; the existing legacy path remains explicitly legacy-backed while the gate is blocked.
- Classification: `GOOGLE_ADS_CANONICAL_SCHEMA_GAP`; `GOOGLE_ADS_RUNTIME_CUTOVER = BLOCKED_BY_SCHEMA_GAP`.
- Next safe step: approve the missing canonical representation and secret/connection configuration contract, then adapt the resolver and the three routes with readback, grant/binding/quota/usage enforcement and no legacy fallback. Do not remove the legacy table before `RUNTIME_CONSUMERS = 0` is proven.

## Google Ads Research Customer ID global — implementação local — 2026-08-15

- **Verificado no código:** Keyword Discovery e Keyword Metrics resolvem o Customer ID de pesquisa a partir de `integration_connections.metadata.google_ads_research_customer_id` da Connection global Google Ads. O `brandId` continua apenas no contexto de autorização e no dono dos dados produzidos.
- **Preservado:** Login Customer ID/MCC, secrets server-side, capabilities internas, usage, auditoria e contratos futuros de vínculo externo da Brand. O vínculo externo da Brand não é exigido para pesquisa.
- **UI:** Configurações das APIs exibe `Research Customer ID` separado de `Login Customer ID (MCC)`; a Marca não exibe mais Customer ID Google Ads para Discovery/Metrics.
- **Erro canônico:** ausência do metadata retorna `GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING`; não é convertida em erro de Customer ID da Brand.
- **Confirmado por teste:** 21 testes direcionados, lint direcionado e guard visual do projeto passaram; validação manual autenticada confirmou os campos e a remoção do requisito na Marca.
- **Ainda não verificado:** Research Customer ID global ainda está vazio no ambiente atual; nenhum smoke pago de Discovery/Metrics foi executado nesta implementação.

## Google Ads — infraestrutura fixa por env — implementação local — 2026-08-16

- **Decisão vigente:** o adendo `docs/compartilhado/adendo-google-ads-platform-infrastructure-env-2026-08-16.md` substitui a leitura anterior de Connection/Vault para o runtime Google Ads.
- **Verificado no código:** `getGoogleAdsPlatformConfig()` lê exclusivamente as seis variáveis `GOOGLE_ADS_*` da Plataforma; Discovery, Metrics, health check e o endpoint de conexão da Brand não consultam Connection, Vault, metadata, binding, grant ou quota.
- **Admin:** Google Ads aparece como status de infraestrutura e mantém somente “Testar conexão”; o formulário de credenciais e Customer IDs não é renderizado nem editável.
- **Preservado:** DataForSEO e OpenRouter continuam no modelo de Connections; schema, migrations, banco legado e dados existentes não foram alterados.
- **Gap explícito:** `integration_usage_events` exige `connection_id` não nulo; as tabelas operacionais do Minerador preservam a auditoria por ator, Brand, operação e request-id, mas o ledger genérico de Usage de infraestrutura aguarda contrato posterior sem schema inventado.
- **Smoke atualizado:** o `.env.local` possui as seis variáveis exigidas; o provider foi chamado uma vez para Discovery e uma vez para Metrics, sem `SearchStream`.

## Google Ads — remoção do gate Customer Lookup — implementação e smoke real — 2026-08-16

- **Verificado no código:** Discovery e Metrics não chamam mais `resolveGoogleAdsAdvertiserAccount()` nem `GoogleAdsService.SearchStream` como preflight. A função permanece disponível para consumidores futuros ou legítimos.
- **Fluxo ativo:** `getGoogleAdsPlatformConfig()` → OAuth/access token → Research Customer ID da Plataforma → `GenerateKeywordIdeas` ou `GenerateKeywordHistoricalMetrics`.
- **Metadata opcional:** moeda e fuso são `null` quando não obtidos por lookup; a resposta do Keyword Planner não é invalidada por essa ausência e as colunas atuais já aceitam `NULL`.
- **Testes locais:** 30 testes focados passaram; ESLint direcionado passou; TypeScript mantém somente os três erros preexistentes de regex em `tests/agency-adalba-platform-internal.test.mts`.
- **Smoke real Discovery:** alcançou `/v25/customers/:customerId:generateKeywordIdeas`, request-id `NKi9LTQqaGskuyOs1Wrqxg`, HTTP 403, `authorizationError:CUSTOMER_NOT_ENABLED`, `PERMISSION_DENIED`, classificação `CUSTOMER_ACCESS/HIERARCHY`.
- **Smoke real Metrics:** alcançou `/v25/customers/:customerId:generateKeywordHistoricalMetrics`, request-id `LlWLjsTZ5mplALV6N0GuYQ`, HTTP 403, `authorizationError:CUSTOMER_NOT_ENABLED`, `PERMISSION_DENIED`, classificação `CUSTOMER_ACCESS/HIERARCHY`.
- **Conclusão:** o gate foi removido e o erro real agora vem do serviço primário; a conta Research Customer está desabilitada ou não habilitada para acesso. Nenhum ID, credencial, banco, schema ou arquitetura foi alterado.

## Google Ads — diagnóstico completo após `apiRequestStarted` — 2026-08-16

- **Observabilidade:** Discovery agora sempre retorna `providerResponseReceived`, `failureType` e `internalStage`, incluindo transporte sem `Response`, falha OAuth e erro interno após resposta.
- **Categorias:** `PROVIDER_SUCCESS`, `PROVIDER_HTTP_ERROR`, `PROVIDER_TRANSPORT_ERROR`, `OAUTH_TOKEN_ERROR` e `INTERNAL_POST_REQUEST_ERROR` são emitidas sem mascarar falhas como erro genérico.
- **Fixture:** transporte sem resposta gera `PROVIDER_TRANSPORT_ERROR`, `providerResponseReceived = false`, HTTP `null` e endpoint sanitizado; fixture HTTP preserva status, request-id e código seguro.
- **Smoke real final:** MCC usado como Research Customer retornou `PROVIDER_SUCCESS` em `GenerateKeywordIdeas`, request-id `1JVcNBAdcyj455muIbO_6w`, 10 ideias, sem `SearchStream`.
- **Classificação final:** `MCC_AS_RESEARCH_CUSTOMER = PASS`; configuração, banco, schema, DataForSEO e OpenRouter permaneceram inalterados.

## Google Ads Research — pacote local da migration de compatibilidade — 2026-08-16

- **MIGRATION_PACKAGE_PREPARED = YES:** preparados localmente `0041_google_ads_research_persistence_constraints.sql`, preflight read-only, post-verifier read-only e rollback guarded.
- **Escopo:** somente as duas `source_contract` CHECKs de `minerador_discovery_runs` e `minerador_discovery_candidates`; nenhum application code, dado, coluna, RLS, policy, grant, owner, índice, trigger, FK ou Usage foi alterado.
- **Baseline:** próximo número reconfirmado como `0041`; 0 linhas Google Ads, 8 runs e 34 candidates existentes manual/CSV; `DATA_MIGRATION_REQUIRED = NO`.
- **REMOTE_APPLY = PENDING_USER:** nenhuma migration ou SQL de escrita foi executado remotamente.
- **Ainda não homologado:** Discovery real, readback remoto e atualização visual aguardam aplicação manual, post-verifier sem falhas e smoke único posterior.

## Google Ads Historical Metrics — pacote 0043 fechado — 2026-08-17

- **Preflight remoto read-only:** `PASS`, sem drift; confirmou `currency_code text NOT NULL`, CHECK validada, zero linhas e baseline estrutural completa.
- **Pacote local:** migration 0043 mínima, rollback fail-closed, post-verifier vinculado aos fingerprints reais e teste reversível do contrato de moeda.
- **Delta único:** `minerador_keyword_metric_measurements.currency_code` de `NOT NULL` para nullable; nenhuma outra coluna, constraint, FK, índice, trigger, RLS, policy, ACL, owner ou dado é alterado.
- **Apply remoto:** executado manualmente pelo usuário; o agente realizou depois somente SELECTs/read-only.
- **Post-verifier:** `PASS`, com `target_now_nullable = true`, `invariant_fingerprints_preserved = true` e `data_delta_zero = true`.
- **Operações desta verificação:** zero escrita remota de schema/dados, zero rollback, zero migration adicional e zero chamada de provider.
