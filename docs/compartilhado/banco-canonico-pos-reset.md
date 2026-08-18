# Banco canônico pós-reset

**Módulo proprietário:** Infraestrutura compartilhada / Banco canônico  
**Data da auditoria:** 2026-08-12  
**Estado:** baseline documental; nenhuma migration criada; nenhuma operação remota executada.

## Escopo e evidência

O usuário informou `RESET_COMMITTED = PASS` no ambiente remoto. Esse fato é
registrado aqui como **relatado pelo usuário**; não houve readback remoto nesta
tarefa. A matriz abaixo foi construída a partir do código local, das migrations
versionadas e dos documentos ativos.

As migrations aplicadas continuam sendo histórico imutável. Uma tabela vazia
continua sendo preservada quando representa uma entidade ou contrato real. Uma
classificação de remoção é somente candidata a uma migration sucessora, depois
de preflight remoto, inventário de dependências e decisão própria.

Legenda de consumidores usada na matriz:

- `AUTH`: `lib/server/authz.ts`, `lib/server/tenant-context.ts`, rotas tenantizadas e administração.
- `AGENCY`: `lib/server/agency-*.ts`, `app/api/agencies/**`, onboarding e administração de agências.
- `BRAND`: `lib/server/brand-provisioning.ts`, `modules/marca/**`, autorização e rotas de marca.
- `MIN`: `lib/minerador/**`, `modules/minerador/**`, `app/api/minerador/**`.
- `PIPE`: `lib/server/editorial-repositories.ts`, `pipeline-repositories.ts`, `pipeline-runtime.ts`, `/api/editorial/**` e páginas tenantizadas.
- `COMM`: `lib/server/communication/**`, `/api/admin/communication` e `/api/communication/**`.
- `INT`: `lib/server/integrations-runtime.ts`, `platform-integrations-admin.ts`, `/api/admin/integrations`.
- `LEGACY`: somente código histórico, scripts, testes ou documentação; não é consumidor operacional confirmado.
- `LOCAL`: localStorage/IndexedDB ou fallback de resiliência; não é fonte canônica.

As referências a RLS, policies e FKs na matriz são as declarações encontradas
nas migrations locais. O catálogo remoto não foi consultado nesta tarefa.

### Precedência documental — Google Ads (2026-08-16)

Este baseline preserva a evidência histórica e o inventário da transição. As
linhas que descrevem `integration_connections`, `secret_ref`/Vault ou binding
como sucessores da configuração do Google Ads não prevalecem sobre a SDD
arquitetural canônica atual: `GOOGLE_ADS_CONFIG_SOURCE = PLATFORM_ENV`.
`minerador_google_ads_connections` continua preservada e classificada como
`MIGRATE_THEN_DROP` até Discovery/Metrics passarem nos smokes e a prova de
consumidores permitir uma decisão própria. Nenhuma remoção é autorizada por
esta nota.

## FASE 2 — STRUCTURAL_CLEANUP_PREFLIGHT

O preflight remoto read-only foi preparado em
`supabase/scripts/structural-cleanup-preflight-read-only.sql`, versão fixa
`2026-08-12-structural-cleanup-preflight-v1`. Ele usa uma única consulta final
e inventaria, sem mutação, existência, contagem exata de linhas, owner, RLS,
policies, ACL, FKs de entrada/saída, `pg_depend`, views/materialized views,
funções/procedures, referências textuais de funções, índices, constraints e
triggers dos candidatos 0030/0016.

Evidência local atual:

- `public.brand_exceptional_operation_grants`:
  `DROP_CANDIDATE`, sem consumidor runtime local;
- `public.brand_exceptional_operation_execution_events`:
  `DROP_CANDIDATE`, sem consumidor runtime local;
- `public.canonical_actor_can_execute_brand_exceptional_operation(...)`:
  `DROP_CANDIDATE`, sem consumidor runtime local;
- `public.tenant_0016_agency_role_rollback`:
  `DROP_CANDIDATE`, sem consumidor runtime local.

Essas classificações continuam **esperadas**, não confirmadas remotamente.
O preflight não trata linha vazia como prova suficiente: qualquer linha,
dependência externa, FK de entrada desconhecida, view, procedure, trigger
inesperada ou identidade de trigger divergente produz `BLOCKED` ou
`INVESTIGATE`.

`public.pipeline_editorial_protect_append_only()` não é candidato de remoção.
As migrations 0027/0028 registram consumidores canônicos externos à 0030,
e o script exige que esses consumidores continuem observáveis no catálogo.

O plano de snapshot anterior à futura sucessora deve materializar, antes de
qualquer DDL, os objetos públicos afetados, ACL, RLS, policies, functions,
triggers, constraints/FKs, índices e fingerprints determinísticos. O v1
somente diagnostica; não grava baseline nem executa snapshot persistente.

O repositório possui migrations até `0030`. `0031` está ausente, mas foi
reservada/abandonada e não pode ser reutilizada. O próximo número elegível,
se uma sucessora for aprovada no futuro, é `0032`; nenhum arquivo foi criado.

**Estado da Fase 2:** `STRUCTURAL_CLEANUP_PREFLIGHT = READY`;
`REMOTE_OPERATION = NONE`; `MIGRATION_CREATED = NO`.

## CANONICAL_SCHEMA_BASELINE

### TARGET SCHEMA

**Identidade**

- `auth.users` — identidade Auth canônica; permanece fora do schema `public`.
- `public.perfis` — papel/perfil global e referências auxiliares; não substitui `auth.users`.

**Agência**

- `public.agencies`;
- `public.agency_memberships`;
- `public.agency_brands`.

Aplicações, convites, onboarding, gerações de token e capabilities de agência
são contratos de suporte do mesmo domínio e permanecem enquanto forem usados
pelos fluxos atuais.

**Marca**

- `public.marcas`;
- `public.brand_memberships`;
- BrandDNA versionado em `public.editorial_artifact_versions`, com
  `artifact_type = 'brand_dna'`; não foi encontrada uma tabela BrandDNA
  separada que deva ser criada neste baseline.

**Minerador**

- `public.listas_kgr`;
- `public.keywords_kgr`;
- runs, candidates, métricas, batches e origins de discovery;
- medições de métricas Google Ads e versionamento/proveniência de KeywordDNA
  quando representados pelos contratos atuais.

O Minerador continua sendo o único dono operacional da ingestão e qualificação
de keywords. `keywords_kgr.brand_id` é a identidade do tenant; `lista_id` não
substitui a marca e a FK canônica para listas permanece restritiva.

**Pipeline editorial**

- `public.editorial_workflow_items`;
- `public.editorial_artifact_versions`;
- `public.editorial_serp_snapshots`;
- `public.editorial_serp_reviews`;
- `public.content_documents`;
- `public.content_document_versions`;
- `public.content_document_user_states`;
- `public.editorial_saved_views`;
- `public.publication_records`.

Os eventos `editorial_version_status_events` e `editorial_decision_events`
também permanecem: são auditoria/estado de domínio consumidos pelo runtime
canônico, não estado de tela.

**Integrações**

- `integration_providers`;
- `integration_capabilities`;
- `integration_connections`;
- `integration_grants` — grants/entitlements do contrato atual;
- `integration_bindings`;
- `integration_quota_policies`;
- `integration_usage_events`.

Não foi encontrada uma tabela separada `integration_entitlements`; no contrato
atual, grants são a representação de concessões. `secret_ref` referencia
segredo server-side e `metadata` não pode armazenar segredo bruto.

**Communication**

- `communication_templates`;
- `communication_messages` — mensagem persistida/outbox;
- `communication_delivery_events`;
- convites canônicos de agência em `agency_invitations` e
  `agency_invitation_token_generations`.

### PRINCÍPIOS

1. `brandId = public.marcas.id` é o tenant editorial; owner, nome, slug,
   e-mail e storage do navegador não o substituem.
2. O banco armazena entidades e eventos do negócio, não estado transitório de
   tela.
3. O Minerador é o dono operacional das keywords. Uma keyword termina sua
   função operacional no Minerador quando forma `ArticleDNA` no Arquiteto; a
   proveniência permanece rastreável.
4. O Radar recebe o artigo; não reagrupa keywords nem troca a principal.
5. O Planejador recebe `ArticleDNA` e evidência; o Redator produz
   `ContentDocument`; `PublicationRecord` representa o conteúdo publicado.
6. Versões consolidadas são imutáveis. URL, slug, canonical e marca de um
   conteúdo publicado são preservados.
7. localStorage e IndexedDB podem apoiar UX, resiliência ou recuperação
   transitória, mas nunca são autoridade canônica.
8. `connection` determina quem fornece/paga a integração; `brandId`
   determina o dono dos dados.
9. Autorização, entitlement/grant, connection, binding, quota e usage são
   contratos diferentes e não devem ser colapsados em um único estado.
10. `historical_import_protected`, recovery/rebaseline histórico e 0030 não
    pertencem ao alvo futuro sem caso de produto aprovado.

## MATRIZ DO SCHEMA ATUAL

`RLS/POLICIES` indica a origem local da declaração. `FKs` lista os pais
relevantes; a ação `ON DELETE` deve ser confirmada novamente no preflight
remoto antes de qualquer limpeza. `SOURCE OF TRUTH?` descreve o contrato,
não uma prova de existência/contagem no banco remoto.

| TABLE | DOMAIN | BUSINESS RESPONSIBILITY | RUNTIME CONSUMERS | TEST CONSUMERS | FKs / parents | RLS/POLICIES (local) | SOURCE OF TRUTH? | CLASSIFICATION | TARGET |
|---|---|---|---|---|---|---|---|---|---|
| `auth.users` | Identity | identidade que autentica | `AUTH` | auth/session tests | identity externa | Supabase Auth | Sim | `KEEP_CANONICAL` | manter |
| `public.perfis` | Identity | papel/perfil global | `AUTH`, admin | auth/admin tests | `auth.users` quando vinculado | policies locais de identidade | Parcial; não substitui Auth | `KEEP_CANONICAL` | manter |
| `public.agencies` | Agency | tenant/organização de agência | `AGENCY`, `AUTH` | agency foundation/onboarding | `auth.users` owner | 0014/0015/0021 | Sim | `KEEP_CANONICAL` | manter |
| `public.agency_applications` | Agency | solicitação de entrada | `AGENCY` | agency onboarding | agência/actor conforme 0014/0018 | 0014/0018 | Sim no onboarding | `KEEP_CANONICAL` | manter |
| `public.agency_brands` | Agency | vínculo agência–marca | `AGENCY`, `BRAND`, `AUTH` | agency brand authorization | `agencies`, `marcas` | 0014/0021 | Sim | `KEEP_CANONICAL` | manter |
| `public.agency_invitation_token_generations` | Agency/Communication | tokens hash-only de convite | `AGENCY`, `COMM` | invitation lifecycle/lease | `agency_invitations` | 0020/0023/ACL 0022 | Sim | `KEEP_CANONICAL` | manter |
| `public.agency_invitations` | Agency/Communication | convite, aceite e expiração | `AGENCY`, `COMM` | invitation lifecycle/template | `agencies`, `auth.users` quando aplicável | 0018/0023 | Sim | `KEEP_CANONICAL` | manter |
| `public.agency_membership_capabilities` | Authorization | capabilities da membership | `AGENCY`, `AUTH` | canonical authorization | `agency_memberships`, capabilities | 0015/0021 | Sim | `KEEP_CANONICAL` | manter |
| `public.agency_memberships` | Agency | pertencimento e papel de agência | `AGENCY`, `AUTH`, `BRAND` | agency authorization | `agencies`, `auth.users` | 0014–0021 | Sim | `KEEP_CANONICAL` | manter |
| `public.agency_onboardings` | Agency | estado de onboarding/aceite | `AGENCY` | onboarding tests | `agencies`, invitation/actor conforme 0018/0023 | 0018/0023 | Sim | `KEEP_CANONICAL` | manter |
| `public.brand_agency_capability_restrictions` | Authorization | restrição de área imposta pela marca | `AUTH`, `AGENCY`, `BRAND` | canonical authorization | `agencies`, `marcas`, capabilities | 0021 | Sim | `KEEP_CANONICAL` | manter |
| `public.brand_exceptional_operation_execution_events` | Historical exception | auditoria do recovery excepcional 0030 | nenhum consumidor runtime encontrado | 0030/static verifier/reset scripts | `editorial_workflow_items`, grants | 0030, ACL/append-only | Não; operação abandonada | `DROP_CANDIDATE` | remover por sucessora após prova |
| `public.brand_exceptional_operation_grants` | Historical exception | concessão para recovery histórico 0030 | nenhum consumidor runtime encontrado | 0030/static verifier | `marcas`, `auth.users` | 0030, service-role only | Não; operação abandonada | `DROP_CANDIDATE` | remover por sucessora após prova |
| `public.brand_invitation_permissions` | Brand authorization | permissões de convite da marca | `BRAND`, `AGENCY` | invitation/authorization tests | `brand_invitations`, permissions | 0015/0017 | Sim no contrato de marca | `KEEP_CANONICAL` | manter |
| `public.brand_invitations` | Brand | convite de colaboração na marca | `BRAND`, `AGENCY` | invitation tests | `marcas`, `auth.users`/actor | 0005/0015/0017 | Sim; distinto do convite de agência | `KEEP_CANONICAL` | manter |
| `public.brand_member_permissions` | Brand authorization | permissões por membro e área | `BRAND`, `AUTH` | canonical brand authorization | `brand_memberships`, `marcas` | 0015/0017/0021 | Sim | `KEEP_CANONICAL` | manter |
| `public.brand_memberships` | Brand | pertencimento à marca | `BRAND`, `AUTH`, `MIN`, `PIPE` | brand authorization/tenant tests | `marcas`, `auth.users` | 0005/0006/0015/0017 | Sim | `KEEP_CANONICAL` | manter |
| `public.brand_role_permissions` | Brand authorization | catálogo de permissões por papel | `AUTH`, `BRAND` | authorization tests | `brand_roles`/permission contract | 0005/0015/0017 | Sim enquanto o papel existir | `KEEP_CANONICAL` | manter; normalização futura investigar |
| `public.brand_roles` | Brand authorization | papéis de marca, incluindo compatibilidade de autorização | `AUTH`, `BRAND` | authorization tests | `marcas`/role permissions | 0005/0015/0017 | Sim no runtime atual | `KEEP_CANONICAL` | manter; escopo misto é `INVESTIGATE` |
| `public.brand_site_catalog_entries` | Site/legacy | catálogo de site preparado em 0004 | nenhum consumidor Supabase atual encontrado | migration/static tests | `marcas`/site batch conforme 0004 | 0004 local; aplicação remota não confirmada | Não comprovado | `INVESTIGATE` | confirmar existência/uso antes de decidir |
| `public.brand_site_events` | Site/legacy | eventos do importador de site 0004 | nenhum consumidor Supabase atual encontrado | migration/static tests | `brand_site_*` | 0004 local; remoto não confirmado | Não comprovado | `INVESTIGATE` | investigar |
| `public.brand_site_import_batches` | Site/legacy | lote de importação de site | nenhum consumidor Supabase atual encontrado | migration/static tests | `marcas` | 0004 local; remoto não confirmado | Não comprovado | `INVESTIGATE` | investigar |
| `public.brand_site_import_items` | Site/legacy | itens do lote de site | nenhum consumidor Supabase atual encontrado | migration/static tests | `brand_site_import_batches`, `marcas` | 0004 local; remoto não confirmado | Não comprovado | `INVESTIGATE` | investigar |
| `public.brand_site_keyword_candidates` | Site/legacy | candidatos de keywords de site | nenhum consumidor Supabase atual encontrado | migration/static tests | `brand_site_import_items`, `marcas` | 0004 local; remoto não confirmado | Não comprovado | `INVESTIGATE` | investigar |
| `public.brand_site_page_verifications` | Site/legacy | verificação de páginas do site | nenhum consumidor Supabase atual encontrado | migration/static tests | catálogo/site entries | 0004 local; remoto não confirmado | Não comprovado | `INVESTIGATE` | investigar |
| `public.brand_site_sitemaps` | Site/legacy | sitemaps importados | nenhum consumidor Supabase atual encontrado | migration/static tests | `marcas`/sync run | 0004 local; remoto não confirmado | Não comprovado | `INVESTIGATE` | investigar |
| `public.brand_site_sync_runs` | Site/legacy | execução de sincronização de site | nenhum consumidor Supabase atual encontrado | migration/static tests | `marcas` | 0004 local; remoto não confirmado | Não comprovado | `INVESTIGATE` | investigar |
| `public.canonical_capabilities` | Authorization | catálogo de capabilities de negócio | `AUTH`, `AGENCY`, `BRAND` | canonical authorization | nenhuma/atores conforme migration | 0015/0021 | Sim | `KEEP_CANONICAL` | manter |
| `public.communication_delivery_events` | Communication | eventos de entrega/idempotência | `COMM` | communication tests | `communication_messages` | 0020/0022 | Sim | `KEEP_CANONICAL` | manter |
| `public.communication_messages` | Communication | mensagem persistida e outbox | `COMM` | communication/dispatcher tests | templates, invitations conforme 0020 | 0020/0022 | Sim | `KEEP_CANONICAL` | manter |
| `public.communication_templates` | Communication | template transacional | `COMM` | template/provider tests | sem dependência de tenant obrigatória | 0020/0022 | Sim | `KEEP_CANONICAL` | manter |
| `public.content_document_comments` | Pipeline | comentários/anotações de documento | nenhum consumidor direto localizado | nenhum consumidor específico localizado | `content_documents`, actor conforme 0002/0028 | 0002/0028 local | Ainda não comprovado | `INVESTIGATE` | não remover por estar vazio |
| `public.content_document_user_states` | Pipeline | estado do usuário associado ao documento | `PIPE`, `LOCAL` | editorial pipeline tests | `content_documents`, `auth.users` | 0028 | Sim se usado por UI | `KEEP_CANONICAL` | manter |
| `public.content_document_versions` | Pipeline | versões imutáveis do documento | `PIPE` | pipeline/editorial tests | `content_documents`, self-FK previous | 0028 | Sim | `KEEP_CANONICAL` | manter |
| `public.content_documents` | Pipeline | documento editorial/redação | `PIPE` | pipeline/editorial tests | marca, ArticleDNA/versions conforme 0028 | 0028 | Sim | `KEEP_CANONICAL` | manter |
| `public.delegated_access_grants` | Legacy authorization | ponte de acesso delegado da 0016 | nenhum consumidor runtime localizado | legacy-cut/static tests | actor/brand/agency conforme 0016 | ACL/RLS histórico; remoto não revalidado | Não no contrato atual | `DROP_CANDIDATE` | remover por sucessora após dependência remota |
| `public.delegated_access_permissions` | Legacy authorization | permissões da ponte delegada | nenhum consumidor runtime localizado | legacy-cut/static tests | `delegated_access_grants`/capabilities | ACL/RLS histórico; remoto não revalidado | Não no contrato atual | `DROP_CANDIDATE` | remover por sucessora após dependência remota |
| `public.editorial_artifact_versions` | Pipeline/BrandDNA | versões canônicas de ArticleDNA, BrandDNA e demais artefatos | `PIPE`, `BRAND`, Radar/Planejador | pipeline/editorial tests | marca, workflow, self-FKs previous/source conforme 0027 | 0027 | Sim | `KEEP_CANONICAL` | manter |
| `public.editorial_decision_events` | Pipeline | decisões humanas e auditoria | `PIPE` | editorial pipeline tests | artifact/workflow, actor conforme 0027 | 0027 | Sim | `KEEP_CANONICAL` | manter |
| `public.editorial_saved_views` | Pipeline | views persistidas do usuário | `PIPE` | editorial views tests | `marcas`, `auth.users` | 0028 | Sim se a view for salva | `KEEP_CANONICAL` | manter |
| `public.editorial_serp_reviews` | Pipeline/Radar | revisão humana da evidência SERP | `PIPE`, Radar | radar/editorial tests | snapshots/artifacts conforme 0027 | 0027 | Sim | `KEEP_CANONICAL` | manter |
| `public.editorial_serp_snapshots` | Pipeline/Radar | snapshot e evidência SERP | `PIPE`, Radar | radar/editorial tests | workflow/artifact, self-FK previous | 0027 | Sim | `KEEP_CANONICAL` | manter |
| `public.editorial_version_status_events` | Pipeline | histórico de status de versão | `PIPE` | editorial pipeline tests | artifact/version, actor conforme 0027 | 0027 | Sim | `KEEP_CANONICAL` | manter |
| `public.editorial_workflow_items` | Pipeline | item de trabalho e fronteira entre etapas | `PIPE`, handoff Minerador→Arquiteto | handoff/editorial tests | marca, keyword/artifact conforme 0027 | 0027 | Sim | `KEEP_CANONICAL` | manter |
| `public.integration_bindings` | Integrations | associação capability–scope–connection | `INT`, módulos consumidores futuros | integrations runtime/schema tests | capability, connection, grant, agency/marca | 0024/0025 | Sim | `KEEP_CANONICAL` | manter |
| `public.integration_capabilities` | Integrations | operações disponíveis por provider | `INT` | integrations schema/runtime tests | provider conforme 0024 | 0024/0025 | Sim | `KEEP_CANONICAL` | manter |
| `public.integration_connections` | Integrations | conexão com owner e referência de segredo | `INT`; Google Ads ainda não usa | integrations schema/runtime tests | provider, agency/marca, actor | 0024/0025 | Sim para o contrato novo | `KEEP_CANONICAL` | manter |
| `public.integration_grants` | Integrations | concessão de uso por escopo | `INT` | integrations runtime/schema tests | capability, agency/marca, actor | 0024/0025 | Sim | `KEEP_CANONICAL` | manter |
| `public.integration_providers` | Integrations | catálogo de providers | `INT` | integrations runtime/schema tests | nenhuma/metadata provider | 0024/0025 | Sim | `KEEP_CANONICAL` | manter |
| `public.integration_quota_policies` | Integrations | limites por capability e escopo | `INT` | quota/integrations tests | capability, agency/marca | 0024/0025 | Sim | `KEEP_CANONICAL` | manter |
| `public.integration_usage_events` | Integrations | ledger append-only de consumo | `INT` | usage/ACL tests | actor, provider, connection, capability, agency/marca | 0024/0025 | Sim | `KEEP_CANONICAL` | manter |
| `public.keywords_kgr` | Minerador | keyword, qualificação, intenção e proveniência | `MIN`, handoff | minerador keyword/import tests | `marcas`, `listas_kgr` (`ON DELETE RESTRICT`) | 0005–0013 | Sim; único dono operacional | `KEEP_CANONICAL` | manter |
| `public.listas_kgr` | Minerador | listas/grupos de keywords | `MIN` | minerador import/list tests | `marcas` | 0005/0006 e contrato atual | Sim | `KEEP_CANONICAL` | manter |
| `public.minerador_discovery_candidate_current_metrics` | Minerador | projeção atual de métricas do candidato | `MIN` | discovery current metrics tests | candidate, marca | 0013 | Sim para a projeção | `KEEP_CANONICAL` | manter |
| `public.minerador_discovery_candidate_metric_history` | Minerador | histórico de métricas do candidato | `MIN` | discovery metrics tests | candidate, actor/brand | 0009/0013 | Sim | `KEEP_CANONICAL` | manter |
| `public.minerador_discovery_candidates` | Minerador | candidato descoberto antes de virar keyword | `MIN` | discovery organization/import tests | run, batch, marca | 0009–0013 | Sim | `KEEP_CANONICAL` | manter |
| `public.minerador_discovery_import_batches` | Minerador | lote de importação de discovery | `MIN` | discovery import tests | run, marca/actor | 0009/0010 | Sim | `KEEP_CANONICAL` | manter |
| `public.minerador_discovery_keyword_origins` | Minerador | origem/proveniência de keyword | `MIN`, handoff | discovery/import tests | keyword, candidate/run conforme 0009/0010 | 0009–0012 | Sim | `KEEP_CANONICAL` | manter |
| `public.minerador_discovery_runs` | Minerador | execução de discovery | `MIN` | discovery phase tests | `marcas`, actor | 0009–0012 | Sim | `KEEP_CANONICAL` | manter |
| `public.minerador_google_ads_connections` | Minerador/Integrations | configuração Google Ads por marca: customer, MCC, targeting, moeda, timezone e validação | `/api/minerador/**google-ads/**`, `modules/marca` | Google Ads foundation/connection tests | `marcas` | 0007 | Sim hoje; transitório frente ao contrato 0024 | `MIGRATE_THEN_DROP` | migrar resolver e dados para connection/binding/metadata; só depois remover |
| `public.minerador_keyword_metric_measurements` | Minerador | ledger de medições de métricas | `MIN` | volume/measurement tests | `marcas`, `keywords_kgr` | 0007/0008 | Sim | `KEEP_CANONICAL` | manter |
| `public.marcas` | Brand | tenant editorial e contexto da marca | `AUTH`, `BRAND`, `MIN`, `PIPE`, `AGENCY` | brand/tenant tests | `auth.users` owner | 0005/0006 | Sim | `KEEP_CANONICAL` | manter |
| `public.platform_communication_config` | Communication | configuração global do provider/remetente | `COMM`, admin | communication platform tests | actor/secret ref conforme 0019/0022 | 0019/0022 | Sim | `KEEP_CANONICAL` | manter |
| `public.publication_records` | Publications | registro da publicação, URL/canonical e versão publicada | `PIPE`, Publicações | publication identity tests | marca, document/version conforme 0029 | 0029 | Sim | `KEEP_CANONICAL` | manter |
| `public.tenant_0005_migration_guard` | Legacy migration | proteção auxiliar histórica de 0005 | nenhum consumidor runtime localizado | migration/reset scripts | objetos protegidos da 0005 | ACL/trigger histórico; remoto não revalidado | Não é entidade de negócio | `DROP_CANDIDATE` | remover por sucessora após preflight |
| `public.tenant_0016_agency_role_rollback` | Legacy migration | snapshot de rollback da ponte 0016 | nenhum consumidor runtime localizado | legacy-cut/reset scripts | `agency_memberships.id` (`ON DELETE RESTRICT`) | ACL histórico; RLS não foi habilitado pela migration local | Não; `agency_memberships.role` é canônico | `DROP_CANDIDATE` | remover por sucessora após preflight |

### Observações da matriz

- `editorial_artifact_versions` é o destino versionado atual para BrandDNA e
  ArticleDNA; isso não autoriza transformar qualquer `artifact_type` histórico
  em entidade ativa.
- `briefings_artigos` não aparece na lista de tabelas criadas pelas migrations
  versionadas deste checkout, mas possui consumidores reais e, portanto, não é
  `DROP_CANDIDATE` nesta etapa. Está em **LEGADO ATIVO** abaixo.
- As oito tabelas `brand_site_*` são tratadas como `INVESTIGATE`: a SDD local
  classifica 0004 como histórica/preparatória e o runtime atual usa store de
  navegador, mas isso não prova que uma eventual tabela remota não exista.
- Não foi criado nenhum objeto para `historical_import_protected`. No código,
  o termo é estado/ramificação do handoff e não entra no target baseline.

## CANDIDATOS INICIAIS

### 0030 — exceptional operation grants

**Resultado local:** `ZERO_RUNTIME_CONSUMERS = CONFIRMED_IN_CODE`.

`rg` não encontrou consumidores em `app`, `components`, `lib` ou `modules` para:

- `brand_exceptional_operation_grants`;
- `brand_exceptional_operation_execution_events`;
- `canonical_actor_can_execute_brand_exceptional_operation`.

As ocorrências restantes estão em `supabase/migrations/0030_*`, scripts de
preflight/verifier/reset, testes estáticos e documentos de planejamento. Isso
não é consumidor de produto. A infraestrutura não deve ser preservada apenas
por eventual uso futuro.

**Classificação:** `DROP_CANDIDATE`.  
**Não remover agora:** a remoção precisa de uma migration sucessora, preflight
de FKs/RLS/policies/triggers e prova final de zero consumidor. A função
compartilhada `pipeline_editorial_protect_append_only()` permanece
`KEEP_CANONICAL` porque também protege objetos editoriais canônicos; somente os
objetos exclusivos de 0030 são candidatos.

### 0016 — `tenant_0016_agency_role_rollback`

A migration 0016 cria um snapshot de rollback que referencia
`agency_memberships.id`. A migration 0017 remove o contrato legado de
`canonical_role`; o runtime atual usa `agency_memberships.role`. Não foram
encontrados consumidores de `tenant_0016_agency_role_rollback` no código de
produto.

**Classificação:** `DROP_CANDIDATE`, condicionada a preflight remoto que confirme
que não há dependência externa e a uma sucessora que remova linhas/estrutura
com ordem de FK segura. A tabela pode permanecer no histórico aplicado até lá.

### `lib/legacy-routing.ts`

Há importação runtime ativa em `proxy.ts`, que ainda encaminha aliases antigos
para `/selecionar-marca`; os testes de tenant/routing também cobrem esse
contrato. O substituto canônico é `lib/tenant-routing.ts`, mas a migração dos
aliases ainda não foi autorizada.

**Classificação:** `PRESERVED_ACTIVE_LEGACY`; não foi removido nesta Fase 1.

### Histórico/recovery do Arquiteto

Na Fase 1, o runtime do recovery/rebaseline abandonado foi retirado depois de
uma busca completa por imports diretos, imports dinâmicos, route handlers e
chamadas internas. Foram removidos:

- `lib/arquiteto/legacy-handoff-reconciliation.ts`;
- `app/api/arquiteto/handoff/preview/route.ts`;
- `app/api/arquiteto/handoff/rebaseline/route.ts`;
- schemas/clientes de prévia e o modal sem disparador que dependiam desse
  conjunto;
- tipos, planos, mensagens e testes exclusivos do rebaseline histórico.

O handoff normal foi separado: `createMineradorArquitetoHandoff()` consulta a
Brand, aceita somente `aprovado`/`publicado`, cria apenas
`keyword/architect/received` e trata qualquer workflow remoto não-`received`
como conflito explícito. Não existe mais transição automática de marcador
histórico para `received`.

Foram preservados `lib/editorial/architect-recovery.ts`,
`browser-artifact-store.ts`, o recovery local do Redator e os contratos
canônicos de workspace/persistência, pois ainda possuem consumidores ativos.
Migrations, scripts read-only e SDDs históricos permanecem como
`ARCHIVE_ONLY`; isso não altera o banco.

**Classificação atual:** `REMOVED_RUNTIME_LEGACY` para o conjunto histórico
sem consumidores; `PRESERVED_ACTIVE_LEGACY` para recovery local.

### Google Ads legado

`minerador_google_ads_connections` hoje é lida e escrita diretamente por:

- `app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts`;
- rotas de discovery e métricas Google Ads;
- `modules/marca/google-ads-connection-panel.tsx`;
- testes de fundação/conexão/volume.

O novo contrato já oferece a forma estrutural necessária para a transição:

- `integration_connections`: provider, owner `brand`, ambiente, lifecycle,
  `secret_ref` e metadata sanitizada;
- `integration_bindings`: target Brand, connection, grant e
  `external_account_ref`;
- `integration_capabilities`: `keyword_discovery` e `keyword_metrics`;
- grants, quota e usage separados.

O runtime ainda não fez a migração: customer/MCC, targeting, moeda, timezone,
status e `validated_at` continuam no schema antigo. Portanto:

**Classificação:** `MIGRATE_THEN_DROP`.  
**Condição:** criar/adotar o resolver canônico e um mapeamento aprovado antes
de qualquer remoção. Não remover `minerador_google_ads_connections` nesta
tarefa e não restaurar credenciais no novo contrato sem decisão própria.

## LEGADO ATIVO

Estes itens têm consumidor atual, duplicam fonte ou são fallback de
resiliência. Não podem ser removidos como entulho nesta etapa.

| LEGACY | EVIDÊNCIA | PLANO DE SUBSTITUIÇÃO |
|---|---|---|
| `briefings_artigos` | leitura/escrita em `modules/arquiteto/arquiteto-workspace.tsx`, `app/api/generate-briefing`, `app/api/inteligencia`, `app/api/editorial/serp`, proteção em `lib/server/authz.ts` e projeção em Publicações | migrar cada consumidor para artefatos/workflow/documentos canônicos; só depois avaliar remoção |
| `/api/editorial/workspace` | rota ativa; `components/editorial-pipeline-context.tsx` ainda a consulta e usa fallback local em falha | concluir bootstrap/readback canônico e retirar a rota somente com consumidor zero |
| `lib/editorial/editorial-repositories.ts` e adapters | repositorie/adapters ainda sustentam rotas e páginas atuais | consolidar chamadas no contrato canônico sem quebrar consumidores |
| `lib/editorial/operational-flow.ts` | usado pelo fluxo editorial e pela recuperação de documento | substituir por `resolvePipelineContext`/repositories após equivalência comprovada |
| `lib/editorial/architect-recovery.ts` | painel e workspace preservam recuperação local | manter como resiliência não autoritativa até readback canônico e depois retirar gradualmente |
| recovery do Redator | `professional-writer.tsx` usa `document-recovery:<actor>:<brand>:<document>` quando o servidor falha | manter como recuperação UX; remover apenas quando a persistência canônica e o readback estiverem estáveis |
| `components/editorial-pipeline-context.tsx` | mistura remoto canônico, `/api/editorial/workspace` legado e local recovery | deixar remoto/server-side como única autoridade; local apenas para UX transitória |
| `lib/legacy-routing.ts` | `proxy.ts` ainda importa `legacyTargetFromPathname`; testes de tenant/routing cobrem os aliases | preservar até migração/remoção explícita dos aliases de entrada |
| `brand_roles`/permissões mistas | SDDs e runtime ainda consultam papéis e permissões de marca | normalizar em adendo próprio; não apagar enquanto autorização atual depender deles |

`localStorage`, IndexedDB e caches não foram limpos. Eles não são classificados
como tabelas e não podem ser apagados automaticamente; a descontinuação exige
identificar chaves e retirar apenas a autoridade decisória do código.

## F — 0030

`brand_exceptional_operation_grants`,
`brand_exceptional_operation_execution_events` e o helper exclusivo de 0030
foram classificados como `DROP_CANDIDATE` por zero consumidor runtime local
confirmado. O fato de a migration estar aplicada não torna sua função de
recovery parte da fundação. A confirmação final deve incluir:

1. busca de imports/chamadas no código, testes e rotas;
2. dependências de FK, policy, trigger, função e ACL no catálogo remoto;
3. snapshot e rollback da sucessora;
4. remoção em uma única migration estrutural sucessora.

## G — 0016 ROLLBACK

`agency_memberships.role` é a fonte canônica de papel de membership no código
atual. Não foi encontrado consumidor runtime da tabela
`tenant_0016_agency_role_rollback`. Ela é `DROP_CANDIDATE`, mas a remoção deve
aguardar o preflight remoto de entrada/saída e respeitar a FK para
`agency_memberships`.

## H — GOOGLE ADS LEGADO

`integration_connections`/bindings/capabilities conseguem representar o
owner-Brand, o provider, a connection, o account ref e o consumo governado.
O que falta é a migração do resolver e do writer atuais, incluindo o
mapeamento dos metadados operacionais não secretos. Por isso a decisão é
`MIGRATE_THEN_DROP`, não remoção imediata.

## I — MIGRATION BACKUP

Todos os arquivos em `supabase/migrations/` são `ARCHIVE_ONLY` como histórico
aplicado/proposto. Não editar, apagar, renumerar ou reutilizar migration. Isso
inclui 0030 e a candidata abandonada 0031. Scripts de preflight/reset e SDDs
históricas também permanecem como evidência até a decisão de arquivamento
documental.

## ZERO_LEGACY_BLOCKERS

**Não comprovado nesta etapa.**

Não há bloqueio para manter o baseline canônico ou continuar o desenvolvimento
normal: o novo fluxo editorial e as entidades 0027–0029 têm consumidores reais.
O conjunto runtime do recovery/rebaseline histórico não é mais bloqueio. Há,
porém, bloqueios para afirmar “zero legado” estrutural:

- `briefings_artigos` e `/api/editorial/workspace` ainda têm consumidores;
- recovery local ainda é compartilhado com o fluxo atual;
- Google Ads ainda grava na tabela antiga;
- a limpeza estrutural 0032 foi aplicada; o registro anterior de 0030/0016 pendentes é histórico e está superseded pela seção pós-aplicação;
- status remoto das tabelas 0004 não foi confirmado.

Portanto não seria correto declarar que o schema já está sem legado. O
resultado desta tarefa é um inventário com caminho de remoção controlada.

## STRUCTURAL_CLEANUP_PLAN

### PHASE 1 — dead runtime cleanup

1. concluída a remoção do conjunto runtime de rebaseline/preview histórico sem
   consumidor interno;
2. manter `lib/legacy-routing.ts`, porque `proxy.ts` e os testes de tenant ainda
   o consomem;
3. retirar branches futuras de UI/código que tratem recovery histórico como
   autoridade;
4. manter localStorage/IndexedDB como dados do usuário até haver política
   explícita; somente remover a decisão canônica desses stores;
5. não alterar migrations nem banco.

### PHASE 2 — uma migration estrutural de remoção

Depois de snapshot e preflight remoto, uma única migration sucessora deve
remover somente os objetos comprovadamente mortos, potencialmente:

- estruturas exclusivas de 0030;
- `tenant_0016_agency_role_rollback`;
- `tenant_0005_migration_guard`;
- `delegated_access_grants` e `delegated_access_permissions`, se o catálogo
  confirmar zero dependência.

A lista final não está autorizada. A migration deve ser numerada somente após
verificar o próximo número livre; 0031 não será reutilizada.

### PHASE 3 — migrar consumidores legados ativos

1. substituir `/api/editorial/workspace` pelo bootstrap canônico;
2. migrar `briefings_artigos` para artefatos/workflow/documentos conforme
   contrato aprovado;
3. retirar, em auditoria posterior, referências documentais/scripts históricos
   que deixarem de ser necessários, sem tratá-los como runtime;
4. migrar Google Ads para `integration_connections` + binding/capability e
   preservar usage/quota;
5. retirar adapters antigos somente após testes de consumidor e readback.

### PHASE 4 — segunda limpeza, somente se necessária

Executar novo inventário de consumidores e uma segunda migration apenas se a
Fase 3 deixar objetos comprovadamente mortos. Não criar uma migration por
tabela e não remover PublicationRecord real sem decisão humana individual.

## ACEITE

- `CANONICAL_SCHEMA_BASELINE = DOCUMENTED`
- `KEEP_CANONICAL = matrix above`
- `MIGRATE_THEN_DROP = minerador_google_ads_connections`
- `DROP_CANDIDATE = 0030 exclusive objects, 0016 rollback, 0005 guard, delegated access after remote proof`
- `ARCHIVE_ONLY = applied migrations, historical SDDs/scripts and backups`
- `INVESTIGATE = brand_site_* status, content_document_comments, mixed legacy workspace, active recovery and brand role normalization`
- `REMOVED_RUNTIME_LEGACY = preview/rebaseline route, reconciliation module and exclusive branches/types/tests`
- `ZERO_RUNTIME_CONSUMERS = PASS for removed historical runtime set; FAIL for lib/legacy-routing.ts and active local recovery`
- `ZERO_LEGACY_BLOCKERS = NOT_YET_PROVEN; active legacy consumers and structural candidates remain`
- `STRUCTURAL_CLEANUP_PLAN = PHASES 1–4 above`
- `REMOTE_OPERATION = NONE`
- `MIGRATION_CREATED = NO`
- `DATA_REBUILT = NO`

## FASE 3 — LIMPEZA ESTRUTURAL 0032 — 2026-08-12

O targeted preflight remoto foi executado manualmente e relatado como
`STRUCTURAL_CLEANUP_DECISION = DROP_SAFE`. As tabelas candidatas estavam
vazias, sem dependentes externos bloqueadores e sem consumidores runtime
locais comprovados. A trigger de execution events foi tratada pelo nome real
do catálogo, `brand_exceptional_operation_execution_events_append_only_trg_00`.

Foi preparada localmente uma única migration sucessora, sem editar 0016,
0030 ou reutilizar 0031:

- remove a trigger exclusiva e a tabela de execution events;
- remove o helper exclusivo de 0030;
- remove a tabela de grants de 0030;
- remove `tenant_0016_agency_role_rollback`;
- preserva `pipeline_editorial_protect_append_only()` e seus quatro
  consumidores editoriais canônicos.

Artefatos locais: `docs/compartilhado/sdd-limpeza-estrutural-0032.md`,
`supabase/migrations/0032_structural_legacy_cleanup.sql`, o preflight e o
post-verifier read-only específicos de 0032, e o rollback documental/local.
O post-verifier exige o fingerprint das estruturas não-alvo capturado antes
da aplicação; o placeholder não é baseline válido.

Registro de preparação: `0030 runtime/schema = REMOVAL_PREPARED`, `0016
rollback table = REMOVAL_PREPARED`, `STRUCTURAL_CLEANUP_0032 =
READY_FOR_MANUAL_APPLY`. Esse estado foi supersedido pelo resultado de
pós-aplicação abaixo.

## Pós-aplicação da limpeza estrutural 0032 — 2026-08-12

Segundo o resultado remoto informado pelo usuário, a 0032 foi aplicada com
sucesso. O post-verifier confirmou a remoção exata do helper, das três tabelas
alvo e da trigger exclusiva; as 12 tabelas preservadas, a função compartilhada
e seus quatro consumidores canônicos permaneceram presentes.

O único resultado divergente foi o fingerprint do catálogo preservado: o
verifier ainda comparava contra `__PASTE_PRE_0032_PRESERVED_CATALOG_FINGERPRINT__`.
Não foi localizado no workspace nem nos anexos locais um output/snapshot/log
pré-0032 com o mesmo algoritmo e o mesmo conjunto `public/non-target-catalog`.
O hash pós-aplicação não é baseline retroativo.

Classificação atual:

- `MIGRATION_0032 = APPLIED` — evidência relatada pelo usuário;
- `TARGET_REMOVAL = PASS`;
- `PRESERVED_OBJECT_CHECKS = PASS`;
- `SHARED_APPEND_ONLY = PASS`;
- `PRE_APPLY_FINGERPRINT = NOT_CAPTURED`;
- `STRUCTURAL_CLEANUP_0032 = PASS_WITH_DOCUMENTED_FINGERPRINT_EVIDENCE_GAP`.

O post-verifier local foi atualizado para v3: relações/função removidas são
verificadas somente por catálogo; o placeholder produz `EVIDENCE_GAP`, nunca
FAIL estrutural; somente um baseline real divergente produz FAIL. Não há
correção de schema, reaplicação ou restauração prevista.
## ZERO LEGACY — GOOGLE ADS — AUDITORIA LOCAL — 2026-08-12

Este bloco é o registro vigente após a aplicação remota da 0032. Avaliações
anteriores que listavam 0016/0030 como pendentes são históricas e não alteram
o estado atual; o único legado desta auditoria é Google Ads.

### GOOGLE_ADS_LEGACY_AUDIT

O objeto auditado é `public.minerador_google_ads_connections`. A origem local
é `supabase/migrations/0007_minerador_google_ads_volume.sql`. A migration cria
uma linha por `brand_id`, sem identificador de conexão separado, e declara
`brand_id -> public.marcas(id) ON DELETE RESTRICT`.

O schema legado contém `customer_id`, `login_customer_id`,
`language_constant`, `geo_target_constants`, `keyword_plan_network`,
`include_adult_keywords`, `currency_code`, `time_zone`, `status`,
`validated_at`, `created_at` e `updated_at`. A chave primária é `brand_id`;
além dela, a migration não cria índice de negócio adicional para essa tabela.
Os checks locais validam IDs de conta, localidades, rede, moeda e status.

RLS está habilitada pela migration. A policy de leitura usa
`can_access_brand(brand_id)`; a policy `FOR ALL` exige
`tenant_actor_has_permission(brand_id, 'minerador', 'manage')`. A ACL declarada
revoga acesso de `PUBLIC`/`anon`, remove `TRUNCATE/REFERENCES/TRIGGER` de
`authenticated` e concede `SELECT/INSERT/UPDATE` a `authenticated`. Isso é
contrato da migration local; a ACL/RLS efetiva atual não foi consultada
remotamente nesta auditoria.

Não há segredo bruto, refresh token ou ciclo de token persistido nessa tabela.
As credenciais técnicas atuais são `GOOGLE_ADS_CLIENT_ID`,
`GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`,
`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_API_VERSION` e o MCC opcional no
ambiente server-side. O cache do access token é em memória por configuração;
não é lifecycle persistido de `minerador_google_ads_connections`.

`LOCAL_ROW_COUNT = NOT_AVAILABLE`: nenhum banco remoto foi consultado e não há
seed/fixture local que materialize linhas dessa tabela. Não se deve inferir que
ela esteja vazia. O único write produtivo encontrado é o `upsert` da rota de
configuração.

### RUNTIME_CONSUMERS

- `app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts`: GET lê a
  linha por Brand; POST valida a conta anunciante via Google Ads e faz upsert
  da linha. Exige sessão canônica e permissão `minerador/manage`.
- `app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts`:
  lê conta, MCC, targeting, moeda, timezone, status e `validated_at` antes da
  Descoberta. O restante da persistência é em runs/candidates/keywords do
  Minerador.
- `app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts`:
  lê a mesma configuração antes de medir volume/métricas e persiste os
  resultados nas entidades de métricas do Minerador.
- `modules/marca/google-ads-connection-panel.tsx` é consumidor de API, não
  consulta Supabase diretamente; exibe IDs mascarados, targeting, moeda,
  timezone e data de validação.

Não foram encontrados outros consumidores diretos em `app`, `modules`,
`lib` ou `components`. `lib/google/ads/*` implementa configuração, OAuth,
cliente, conta e chamadas ao provider, mas não lê a tabela. O smoke em
`scripts/google-ads-smoke.mts` é uma ação explícita de provider e não é
consumidor da tabela.

Os testes de conexão verificam o builder e a proteção das rotas; os testes de
fundação/integrações preservam a existência histórica e garantem que 0024 não
duplique a tabela. Esses testes não provam contagem ou estado remoto.

### SCRIPTS_AND_TESTS

As referências locais à tabela fora do runtime são classificadas como
evidência/compatibilidade, não como consumidores produtivos: os preflights e
snapshots `supabase/scripts/integrations-0024-*`, os verificadores do
development reset (`development-data-reset-dry-run.sql`,
`development-data-reset-real.sql` e `development-data-reset-verifier-read-only.sql`)
e os scripts de auditoria canônica (`auditoria-geracao-canonica-ledger-read-only.sql`,
`auditoria-geracao-canonica-integridade-read-only.sql` e
`auditoria-geracao-canonica-catalogo-read-only.sql`).

Os testes `tests/agency-foundation.test.mts` e
`tests/integrations-0024-schema.test.mts` verificam respectivamente a
preservação da migration legada e a não duplicação da tabela em 0024. Os testes
Google Ads exercitam contratos, builders, rotas e fixtures sem chamar provider
real nem consultar o Supabase remoto.

### CANONICAL_PARITY

| LEGACY_FIELD | LEGACY_RESPONSIBILITY | CANONICAL_REPLACEMENT | PARITY | GAP | ACTION |
| --- | --- | --- | --- | --- | --- |
| `brand_id` | tenant e chave 1:1 da configuração | `integration_bindings.target_brand_id` e `integration_usage_events.brand_id` | FULL | o resolver atual ainda busca a tabela legada | adaptar o resolver para binding explícito |
| `customer_id` | conta anunciante usada pelo provider | `integration_bindings.external_account_ref` | PARTIAL | `external_account_ref` é genérico e não tipa que o valor é Customer Google Ads | definir mapeamento semântico e readback |
| `login_customer_id` | MCC/conta administradora opcional | nenhum campo tipado equivalente; possível metadata sanitizado somente após decisão | PARTIAL | relação Customer→MCC não é representada explicitamente | aprovar representação e validar a relação |
| `language_constant` | targeting da Keyword Planner | `integration_connections.metadata` somente como extensão genérica | PARTIAL | não existe contrato tipado nem política de escopo para esse targeting | definir metadata/configuração por capability |
| `geo_target_constants` | localidades usadas na consulta | `integration_connections.metadata` somente como extensão genérica | PARTIAL | não há campo canônico nem contrato de cardinalidade | preservar formato validado em mapeamento aprovado |
| `keyword_plan_network` | rede da consulta | metadata/configuração da connection | PARTIAL | sem campo canônico específico | mapear sem alterar semântica |
| `include_adult_keywords` | opção da consulta | metadata/configuração da connection | PARTIAL | sem campo canônico específico | mapear com decisão explícita de segurança |
| `currency_code` | moeda retornada/conferida da conta | metadata sanitizado e evidência de validação/usage | PARTIAL | não há campo tipado de conta externa | persistir somente como metadado não secreto, se aprovado |
| `time_zone` | fuso retornado/conferido da conta | metadata sanitizado e evidência de validação/usage | PARTIAL | não há campo tipado de conta externa | mesma decisão de mapeamento da moeda |
| `status` | `validated`, `invalid`, `pending`, `disabled` da configuração por Brand | `integration_connections.lifecycle_status`, binding lifecycle e usage result | PARTIAL | estados e prova de validação têm semânticas diferentes | criar tabela de mapeamento; não converter silenciosamente |
| `validated_at` | instante da validação da conta | `integration_usage_events` com operação de validação/health e timestamps da connection | PARTIAL | não há equivalente único de “última conta validada” | definir read model/evidência sem usar `updated_at` como substituto implícito |
| `created_at`/`updated_at` | ciclo da linha legada | timestamps de `integration_connections`/bindings | FULL | o ciclo de substituição ainda não existe para Google Ads | preservar auditoria durante a transição |
| credenciais `GOOGLE_ADS_*` | OAuth/Developer Token globais server-side | `integration_connections.secret_ref` + secret manager | PARTIAL | nenhum vínculo entre o secret atual e uma connection canônica foi feito | migrar referência server-side; nunca copiar segredo |
| autorização de `minerador/manage` | quem pode configurar a linha | autorização + `integration_grants`/entitlement + binding canônico | PARTIAL | rotas ainda não consultam grant/capability canônicos | adaptar autorização antes do corte |
| provider implícito Google Ads | escolha fixa no código/env | `integration_providers` + `integration_connections.provider_id` | PARTIAL | não há resolução Google Ads pelo catálogo no runtime atual | registrar provider/capability somente em fluxo aprovado |
| capability implícita de descoberta/métricas | finalidade da chamada | `integration_capabilities` (`keyword_discovery`/`keyword_metrics`) | PARTIAL | nenhuma rota Google Ads resolve capability canônica hoje | resolver capability explicitamente por operação |
| binding implícito por `brand_id` | conecta Brand à conta | `integration_bindings` com capability, connection, grant e `external_account_ref` | PARTIAL | não há binding canônico nem prova de entitlement | criar binding pelo fluxo administrativo aprovado |
| quota/usage | não existe na tabela legada nem nas rotas atuais | `integration_quota_policies` + `integration_usage_events` | NONE | o consumidor Google Ads ainda não aplica quota nem registra usage canônico | integrar antes de declarar substituição completa |
| idempotência | PK `brand_id` e upsert substituem a configuração | unicidades ativas de connection/grant/binding e idempotência de usage | PARTIAL | semântica de substituição não é equivalente à seleção de binding ativo | preservar conexão ativa e exigir decisão para troca |

### MIGRATION_GAPS

1. O schema compartilhado possui os contratos genéricos, mas as três rotas
   Google Ads ainda não usam `integration_*` nem o resolver canônico.
2. Customer, MCC, targeting, moeda, timezone e validação não têm todos os
   campos tipados necessários; `metadata` não deve virar mapeamento implícito.
3. O secret server-side ainda é resolvido por ambiente, sem `secret_ref`
   canônico associado a uma connection Google Ads.
4. Não há, no código auditado, prova de registros de provider, capabilities,
   grant, binding, quota ou usage para Google Ads. Isso não foi verificado no
   Supabase remoto e não autoriza afirmar ausência remota.
5. O painel e as rotas de configuração, Descoberta e métricas precisam de
   transição coordenada; remover a tabela antes disso quebra o contrato atual.

### FINAL_CLASSIFICATION

`minerador_google_ads_connections = MIGRATE_THEN_DROP`.

Não é `KEEP_CANONICAL`, porque a tabela mistura configuração de provider com o
tenant e não implementa authorization, entitlement, connection, binding, quota
e usage como contratos separados. Não é `BLOCKED`: a direção canônica e os
consumidores estão identificados, mas a substituição ainda não foi executada
nem provada.

### NEXT_SAFE_STEP

1. Aprovar o mapeamento semântico de Customer/MCC/targeting/validação e a
   origem server-side do secret, sem criar uma tabela espelho.
2. Adaptar primeiro a leitura por resolver canônico com leitura paralela e
   readback, preservando a linha legada como rollback.
3. Adaptar a escrita e o painel para connection/binding/capability/grant;
   depois integrar quota e usage.
4. Executar somente uma ação explícita de validação/provider autorizada e um
   smoke autenticado de Descoberta e métricas, sem chamadas automáticas.
5. Pesquisar novamente o repositório e provar `RUNTIME_CONSUMERS = 0` da
   tabela, excluindo apenas migrations e documentação histórica.
6. Só então preparar uma única migration sucessora de remoção, com preflight,
   snapshot, post-verifier e rollback documental. Não definir número nem
   executar migration nesta auditoria.

`GOOGLE_ADS_LEGACY_AUDIT = COMPLETE_LOCAL_ONLY`
`CANONICAL_PARITY = PARTIAL`
`REMOTE_OPERATION = NONE`
## Google Ads — canonical cutover gate — 2026-08-12

This section is the current decision for the first migration attempt. It supersedes the previous local `MIGRATE_THEN_DROP` assessment for execution: the legacy table remains in place until the canonical representation is approved and the runtime is cut over.

### Mapping audit

| LEGACY_FIELD | CANONICAL_OWNER | CANONICAL_FIELD_OR_STRUCTURE | PARITY | GAP | ACTION |
| --- | --- | --- | --- | --- | --- |
| `brand_id` | Brand binding and produced usage | `integration_bindings.target_brand_id`; `integration_usage_events.brand_id` | FULL | The routes still resolve the legacy row | Cut over through an explicit Brand binding |
| `customer_id` | External account binding | `integration_bindings.external_account_ref` | PARTIAL | The field is generic and is not typed as a Google Ads customer ID | Approve the semantic mapping and readback |
| `login_customer_id` | Google Ads account relationship | No typed Customer-to-MCC relationship exists | NONE | MCC/account-manager semantics have no canonical destination | Resolve the structural representation before code |
| `language_constant`, `geo_target_constants`, `keyword_plan_network`, `include_adult_keywords` | Brand-owned Google Ads operation parameters | No approved Brand/capability parameter structure exists | NONE | `integration_connections.metadata` is connection-owned and cannot silently become Brand configuration | Approve a canonical parameter contract; do not use generic metadata as a shortcut |
| `currency_code`, `time_zone` | Validated external-account metadata | No typed current account metadata/read model exists | NONE | Usage events are historical evidence, not the current configuration state | Approve the current-state representation |
| `status` | Connection/binding lifecycle | `integration_connections.lifecycle_status` and binding lifecycle | PARTIAL | Legacy validation states do not have the same semantics as connection lifecycle | Define an explicit state mapping |
| `validated_at` | Validation evidence/current state | No canonical last-validation field | NONE | `occurred_at` in usage is an event timestamp, not a replacement read model | Define validation evidence without overloading timestamps |
| `created_at`, `updated_at` | Canonical connection/binding lifecycle | Connection and binding timestamps | PARTIAL | No Google Ads canonical records exist yet | Preserve audit timestamps during cutover |
| `GOOGLE_ADS_*` credentials | Platform connection secret | `integration_connections.secret_ref` | PARTIAL | The current routes still resolve environment credentials and no Google Ads connection is linked to the secret reference | Configure the server-side canonical connection before switching reads |
| authorization and provider selection | Capability, grant, connection, binding | `integration_capabilities`, `integration_grants`, `integration_connections`, `integration_bindings` | PARTIAL | Google Ads routes do not resolve the canonical layers | Use the shared resolver with explicit errors and no fallback |
| quota and usage | Governance and ledger | `integration_quota_policies`, `integration_usage_events` | NONE | Current Google Ads calls do not enforce quota or record canonical usage | Integrate before claiming full replacement |

### Confirmed runtime boundary

- `app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts` still performs the legacy GET and upsert.
- `descobrir-keywords/route.ts` and `metricas-keywords/route.ts` still read the legacy row before calling Google Ads.
- `modules/marca/google-ads-connection-panel.tsx` consumes the configuration route indirectly.
- The shared `resolveIntegrationResource()` and usage repository exist, but no Google Ads route currently supplies the canonical provider/capability/grant/binding/quota context.
- No new canonical-to-legacy fallback or dual-write was introduced. The existing legacy write remains because the cutover is blocked; it is not evidence of a completed migration.

### Decision

`GOOGLE_ADS_CANONICAL_SCHEMA_GAP = YES`

The existing 0024/0025 entities provide the governance layers, but they do not yet provide a semantically approved destination for MCC relationship, Brand-specific targeting parameters, current external-account metadata, and validation state. Putting those values into a Platform connection's generic metadata would violate the ownership contract. Creating a mirror table or generic JSON contract without approval is also prohibited.

`GOOGLE_ADS_RUNTIME_CUTOVER = BLOCKED_BY_SCHEMA_GAP`

`GOOGLE_ADS_GOVERNED_CALL_PATH = NOT_READY`

The current runtime is not silently falling back between canonical and legacy sources; it is still explicitly legacy-backed. Therefore the safe next step is an approved structural decision for the missing canonical fields, followed by the server-side resolver and coordinated route cutover. No provider call, migration, backfill, or remote operation was performed.

`FINAL_CLASSIFICATION = GOOGLE_ADS_CANONICAL_SCHEMA_GAP`

`REMOTE_OPERATION = NONE`
