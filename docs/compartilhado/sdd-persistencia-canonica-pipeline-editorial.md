# SDD — persistência canônica do pipeline editorial

Status: 0026 aplicada; fechamento com exceção de evidência documentada
Implementação: 0026 aplicada; schema editorial remoto ainda não autorizado
Migration: `MIGRATION_0026 = APPLIED`
Operações remotas nesta etapa: Nenhuma
Módulo proprietário: Fundação compartilhada / Persistência do Pipeline
Classificação: DEFAULT_ACL_BASELINE_VERIFIED_WITH_DOCUMENTED_EVIDENCE_EXCEPTION

## Decisão local de DEFAULT ACL

O gate aprovou a policy para implementação local com:

- `EXECUTION_ROLE = postgres`;
- `DEFAULT_ACL_TARGET_ROLE = postgres`;
- creator role obrigatório das futuras migrations da aplicação = `postgres`;
- owner do schema `public = pg_database_owner`, separado dos owners dos objetos;
- escopo exclusivo `FOR ROLE postgres IN SCHEMA public`.

A migration 0026 somente revoga defaults futuros para roles de aplicação em
tabelas, sequences e functions. Ela não altera tipos, ownership, objetos
existentes, RLS, policies ou dados.

## Fechamento documental da 0026

O post-verifier v1 confirmou:

- `POSTGRES_PUBLIC_DEFAULT_ACL_HARDENING = PASS`;
- `EXISTING_PUBLIC_OBJECT_ACL_PRESERVATION = PASS`, fingerprint
  `73896ca2127e3d2c13b5a45cf3a4fea5`;
- `SUPABASE_ADMIN_DEFAULT_ACL_PRESERVATION = PASS`, com pre e post
  `e40981b7b53dfc209cbff21dc0330071`.

O fingerprint histórico pré-0026 dos schemas fora de `public` não foi capturado:

`OUTSIDE_PUBLIC_PREPOST_FINGERPRINT = HISTORICAL_BASELINE_NOT_CAPTURED`

A revisão estática da migration confirmou
`OUTSIDE_PUBLIC_MIGRATION_SCOPE_REVIEW = PASS_WITH_EVIDENCE_EXCEPTION`:
0026 contém exclusivamente `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN
SCHEMA public` e não contém alteração de schema, ownership, ACL de schema,
defaults de `supabase_admin` ou comandos para `auth`, `storage`, `graphql`,
`graphql_public`, `realtime` ou `extensions`.

Isso prova que 0026 não possuía comando capaz de alterar ACL ou owner desses
schemas, mas não prova ausência de alteração externa concorrente no intervalo.
Por isso, `DEFAULT_ACL_BASELINE = VERIFIED_WITH_DOCUMENTED_EVIDENCE_EXCEPTION`.
O V2 não foi criado artificialmente.

`PIPELINE_EDITORIAL_SCHEMA = UNBLOCKED_FOR_LOCAL_IMPLEMENTATION`.
Isso não autoriza aplicação remota do schema editorial.

## 1. Evidência e decisão

O catálogo remoto informado confirmou a presença de public.keywords_kgr e
public.listas_kgr.

Não foram observadas as relações editoriais downstream:

- editorial_artifact_versions;
- editorial_workflow_items;
- editorial_serp_snapshots;
- editorial_serp_reviews;
- content_documents;
- content_document_versions;
- content_document_user_states;
- editorial_saved_views;
- publication_records.

Também não foi observado suporte remoto a SiloPage.

Esta evidência confirma que o estado remoto diverge do schema descrito pelas
migrations locais. Ela não confirma a causa operacional. As hipóteses são:
migrations históricas nunca aplicadas neste projeto, aplicação em outro projeto
Supabase ou aplicação incompleta.

A SDD define um schema sucessor. Não autoriza aplicar 0002, editar migration
histórica, executar SQL remoto ou adaptar UI.

## 2. Proveniência das migrations

| Migration | Contrato local | Classificação |
|---|---|---|
| 0001_protect_publicado.sql | Proteções e triggers de estruturas legadas | HISTORICAL_ONLY |
| 0002_operational_editorial_flow.sql | Artefatos, workflow, documentos, publicações, estado pessoal, views, RLS e ACL | PARTIALLY_REUSABLE |
| 0003_radar_serp_snapshots.sql | Snapshots e reviews de SERP | PARTIALLY_REUSABLE |
| 0004_brand_site_catalog.sql | Catálogo de site/Brand | HISTORICAL_ONLY nesta SDD |
| 0005_tenant_ownership_and_rls.sql | Tenantização e RLS de dados existentes | PARTIALLY_REUSABLE |
| 0006_reconcile_tenant_security.sql | Reconciliação de segurança e RLS | PARTIALLY_REUSABLE |
| 0007–0013 | Fonte e persistência do Minerador/discovery | CURRENT para Minerador; fora do downstream |
| 0014 em diante | Agency, identidade, comunicação e integrações | HISTORICAL_ONLY nesta SDD |

0002 e 0003 fornecem nomes e intenções úteis, mas não devem ser executadas
verbatim. Os contratos user_key, artifact types, grants e policies históricas
precisam ser substituídos ou revisados.

keywords_kgr e listas_kgr permanecem fontes existentes. A nova fundação não
reconstrói essas tabelas.

## 3. Entidades canônicas

A separação obrigatória é:

KeywordDNA → ArticleDNA → SiloDNA/SiloPage → SerpSnapshot/SerpReview
→ ContentPlan → ContentDocument/versions → PublicationRecord.

Workflow e handoffs são registros de transporte, estado e proveniência. Não
substituem entidades editoriais e não formarão uma tabela monolítica.

### 3.1 KeywordDNA

KeywordDNA continuará sendo um read model de keywords_kgr:

- id da keyword;
- brand_id como tenant;
- keyword e qualificação;
- analise_semantica;
- status, lista_id e decisões.

Não será criado um segundo ledger para copiar keywords_kgr.

### 3.2 editorial_artifact_versions

O ledger sucessor suportará explicitamente:

- article_dna;
- silo_dna;
- silo_page;
- content_plan.

brand_dna pertence ao domínio de Brand. keyword_dna permanece no Minerador.

Campos mínimos:

| Campo | Contrato |
|---|---|
| version_id | identificador estável |
| entity_id | entidade lógica versionada |
| marca_id | FK para marcas.id, ON DELETE RESTRICT |
| artifact_type | check fechado com os quatro tipos |
| version_number | inteiro positivo por entidade/tipo/Brand |
| previous_version_id | FK autorreferente, restrita, opcional na primeira versão |
| content_hash | hash do conteúdo |
| payload | envelope editorial, sem segredo operacional |
| origin | origem classificável |
| change_reason | justificativa da versão |
| created_by | UUID de auth.users.id |
| created_at | timestamp |

Status e aprovação serão eventos próprios. Versões consolidadas não serão
sobrescritas destrutivamente.

### 3.3 SiloPage

SiloPage será uma entidade distinta, persistida com artifact_type silo_page
e repository próprio.

Cada versão preservará:

- entity_id próprio;
- marca_id;
- source_version_id apontando para a versão de SiloDNA;
- content_hash, origin, change_reason e actor;
- status/aprovação próprios;
- payload persistido.

A aprovação de SiloPage não aprova SiloDNA nem outra entidade. O suporte não
poderá depender do LocalStorage.

### 3.4 SERP

editorial_serp_snapshots será append-only por Brand e artigo, com:

- marca_id, article_id, versão e snapshot anterior;
- content_hash, status, created_by e created_at;
- payload;
- FKs com ON DELETE RESTRICT.

editorial_serp_reviews permanecerá separado, com snapshot, artigo, Brand,
status, reviewer e timestamp. Review não substitui snapshot.

### 3.5 ContentDocument

content_documents representará o documento atual e preservará:

- marca_id e article_id;
- versão de ArticleDNA;
- versão de ContentPlan;
- status;
- título, slug e hash;
- lock_version;
- created_by e updated_by como UUID;
- payload atual.

content_document_versions será append-only, preservando versão, hash, motivo,
payload e ator.

content_document_user_states será estado pessoal, não entidade editorial:

- document_id FK para content_documents.id;
- user_id uuid FK para auth.users.id;
- cursor, scroll, painéis e timestamps;
- PK document_id + user_id.

### 3.6 Saved views

editorial_saved_views usará:

- id;
- marca_id;
- user_id uuid FK para auth.users.id;
- módulo, nome, settings e is_default;
- timestamps;
- unicidade marca_id + user_id + module + name;
- no máximo uma view default por marca, actor e módulo.

A decisão canônica é user_id. user_key não será transportado para o schema novo.

### 3.7 PublicationRecord

publication_records será entidade distinta de briefing, snapshot e
ContentDocument. Preservará:

- Brand e artigo;
- documento de origem;
- versão de ContentPlan;
- status;
- URL, slug e canonical;
- lock_version;
- atores de criação e atualização.

Briefing legado não substitui PublicationRecord.

## 4. Tenant e identidade

| Runtime | Banco |
|---|---|
| brandId | public.marcas.id |
| brandRef | referência de rota resolvida para brandId |
| actorUserId | auth.users.id / auth.uid() |
| agencyId | escopo operacional, não tenant editorial |
| marca_id | nomenclatura persistida preferencial |

Nenhuma consulta canônica poderá resolver Brand por slug isolado, nome, owner,
primeiro registro ou identificador textual legado.

## 5. Workflow e handoffs

editorial_workflow_items será ledger de handoff, estado, lock e proveniência.
Não armazenará o conteúdo canônico completo das entidades.

Contrato sucessor mínimo:

- id;
- marca_id;
- subject_type e subject_id;
- stage e state;
- source_entity_id;
- source_version_id opcional;
- source_content_hash;
- created_by, updated_by e timestamps;
- lock_version.

Os estágios serão minerador, architect, radar, planner, writer e publications.

O handoff Minerador → Arquiteto será um item com subject_type keyword,
subject_id igual ao id de keywords_kgr, Brand, origem, decisão e estado.
Depois da formação, um item de artigo apontará para a keyword pela proveniência
e para a versão de ArticleDNA.

A keyword importada deverá ficar associada a artigo ou explicitamente em
estado de não agrupada. architectImportedKeywordIds continuará como recovery
local, mas não será a única fonte do handoff.

O workflow não substitui ArticleDNA, ContentPlan, ContentDocument ou
PublicationRecord.

## 6. Autorização server-side

Toda operação de ArticleDNA, SiloDNA e SiloPage deverá:

1. autenticar o actor pela sessão Supabase SSR;
2. resolver o brandId canônico;
3. validar acesso à Brand com helpers canônicos;
4. criar o contexto server-side;
5. ler ou gravar com filtros de Brand e actor quando aplicável.

As rotas atuais de ArticleDNA, SiloDNA e SiloPage possuem gap porque validam
sessão, mas não fecham a autorização da Brand recebida. A correção será
implementada somente na fase de runtime.

## 7. resolvePipelineContext

Contrato conceitual:

resolvePipelineContext({ brandId | brandRef })
  -> actorUserId
  -> brandId
  -> permissions
  -> serverSupabaseClient
  -> sourceMode
  -> authorizationSource

Regras:

- brandRef é somente entrada de rota e resulta em UUID confirmado;
- actorUserId vem da sessão, nunca do browser storage;
- o cliente é server-side;
- não há fallback silencioso para anon;
- o contexto não contém lógica editorial;
- erros distinguem sessão, Brand, autorização e persistência.

## 8. Repositories

Repositories finos, recebendo contexto já autorizado:

- KeywordDNARepository;
- ArticleDNARepository;
- SiloDNARepository;
- SiloPageRepository;
- SerpSnapshotRepository;
- ContentPlanRepository;
- ContentDocumentRepository;
- PublicationRecordRepository.

Nenhum repository poderá resolver Brand por conta própria ou converter erro de
schema em array vazio.

## 9. Workspace e sucesso de persistência

O workspace distinguirá:

- NO_DATA: consulta válida com zero registros;
- QUERY_FAILURE: consulta existente falhou;
- SCHEMA_MISSING: relação, coluna, FK, função ou policy ausente;
- NOT_AUTHORIZED: actor sem acesso;
- READY: leitura válida, com ou sem dados.

A Promise.all atual pode fazer uma query inválida derrubar toda a resposta. O
contrato sucessor poderá carregar erro por seção, mas nunca mascarar SCHEMA_MISSING
como NO_DATA.

sendWorkflowCommand deverá separar:

optimistic_pending → remote_request → remote_confirmed

Falha resultará em remote_failed, erro sanitizado e reconciliação local. A UI
pode mostrar progresso otimista, mas sucesso persistido depende de confirmação
remota.

## 10. Local, legacy, fixture e mock

Nenhum LocalStorage, IndexedDB ou recovery será limpo nesta fase.

Fontes serão classificadas como:

- REMOTE_CANONICAL;
- LOCAL_RECOVERY;
- LEGACY;
- FIXTURE;
- MOCK.

Estado local vazio nunca substitui leitura remota válida. Estado local existente
não será promovido automaticamente a persistência canônica.

## 11. RLS, ACL e default ACL

DEFAULT_ACL_GLOBAL_POLICY_REQUIRED foi resolvido para a implementação da 0026.
O schema editorial está `UNBLOCKED_FOR_LOCAL_IMPLEMENTATION`, mas sua
aplicação remota continua exigindo gate próprio.

O preflight deverá confirmar:

- pg_default_acl para as roles proprietárias;
- ausência de grants futuros amplos para PUBLIC, anon ou authenticated;
- grants mínimos para service_role;
- owner e role de execução das funções;
- ausência de herança inesperada.

Contrato:

- anon: sem acesso direto;
- authenticated: somente acesso necessário, sujeito a RLS;
- service_role: mínimo server-side, nunca no browser;
- RLS habilitado desde a criação;
- policies filtram marca_id por autorização canônica;
- estado pessoal também filtra user_id = auth.uid();
- histórico append-only não recebe UPDATE/DELETE sem contrato;
- SECURITY DEFINER, quando necessário, usa search_path restrito.

### 11.1 Matriz ACL editorial aprovada

Decisão permanente de fechamento de segurança do schema local:

| Tabela | authenticated | service_role |
|---|---|---|
| editorial_artifact_versions | SELECT | SELECT, INSERT |
| editorial_workflow_items | SELECT | SELECT, INSERT, UPDATE |
| editorial_serp_snapshots | SELECT | SELECT, INSERT |
| editorial_serp_reviews | SELECT | SELECT, INSERT |
| content_documents | SELECT | SELECT, INSERT, UPDATE |
| content_document_versions | SELECT | SELECT, INSERT |
| content_document_user_states | SELECT | SELECT, INSERT, UPDATE |
| editorial_saved_views | SELECT | SELECT, INSERT, UPDATE |
| publication_records | SELECT | SELECT, INSERT, UPDATE |

`anon` não recebe acesso direto a nenhuma tabela privada nova. Nenhuma das
tabelas recebe `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` ou `MAINTAIN`.
Versões e snapshots não recebem `UPDATE`; toda mutação canônica permanece
server-side.

`service_role` bypassa RLS. Portanto, nenhum repository futuro poderá usá-lo
sem primeiro resolver `actorUserId`, `brandId`, autorização e ação permitida
em `resolvePipelineContext()`. Esta decisão não implementa runtime.

As policies de leitura continuam filtrando Brand pelos helpers canônicos e,
para estado pessoal, preservam `user_id = auth.uid()`. A ausência de grants de
escrita para `authenticated` é intencional e não remove esse isolamento.

Nenhuma migration editorial de criação será aplicada remotamente nesta etapa.
Para futuras migrations, o preflight deverá capturar todos os fingerprints
necessários antes da aplicação, inclusive os schemas fora de `public`.

## 12. Fases futuras

Os números finais das migrations não são definidos nesta SDD.

| Fase | Conteúdo | Gate |
|---|---|---|
| A | catálogo, snapshot e default ACL | DEFAULT_ACL_GLOBAL_POLICY_REQUIRED = PASS |
| B | artifact versions, workflow, FKs e índices | preflight e rollback aprovados |
| C | SERP, documentos, versões, estado pessoal, views e publicações | decisão user_id e FKs |
| D | RLS, policies, ACL, funções e triggers | matriz anon/authenticated/service_role |
| E | resolvePipelineContext e repositories | testes server-side |
| F | consumidores e handoffs | leitura remota e smoke autorizados |

Não haverá migration gigante nem edição de 0002.

## 13. Ordem dos consumidores

1. camada compartilhada;
2. Arquiteto;
3. Radar;
4. Planejador;
5. Redator;
6. Publicações;
7. handoff Minerador → Arquiteto.

O Minerador existente será preservado. Permanecem separadas as dívidas:

- MINERADOR_ACL_REVIEW;
- LISTAS_KGR_DUPLICATE_BRAND_FK_REVIEW.

## 14. Snapshot e rollback

Antes de qualquer aplicação futura, será necessário snapshot restaurável de
marcas, listas, keywords e objetos criticamente referenciados, além do catálogo
de schema e default ACL.

Como as relações downstream estão ausentes, não haverá backfill destrutivo nem
reescrita de dados editoriais nesta fundação.

Rollback deverá:

- desativar consumidores novos;
- restaurar leitura/escrita anterior quando houver;
- preservar registros criados;
- remover apenas estruturas novas e vazias, quando seguro;
- usar migration reversa própria ou restauração validada;
- nunca reaplicar 0002, usar git reset ou apagar recovery local.

## 15. Testes

A implementação futura deverá testar:

- FKs, checks, índices e versionamento;
- relação SiloPage–SiloDNA;
- aprovação independente;
- estado pessoal por documento + user_id;
- saved views por Brand + actor;
- handoff de keyword para artigo e não agrupadas;
- isolamento cross-tenant;
- anon sem leitura;
- authenticated sujeito a RLS;
- service_role somente server-side;
- NO_DATA diferente de SCHEMA_MISSING;
- erro de seção não convertido em vazio;
- confirmação remota antes de sucesso;
- concorrência por lock_version;
- rollback isolado;
- TypeScript, lint, build e repositories.

Não haverá provider, SERP pago ou chamada externa nesta fundação.

## 16. Respostas das decisões

1. O remoto diverge porque migrations locais não provam aplicação no projeto
   remoto; a causa específica ainda não foi confirmada.
2. As migrations centrais são 0002 e 0003, com padrões de tenant/RLS em 0005 e
   0006.
3. Nomes, separação de entidades, versionamento e proveniência são
   reutilizáveis; user_key, artifact types, grants e policies históricas não
   são carregados sem revisão.
4. Devem existir artifact versions, workflow, SERP/reviews, documentos/versões,
   estado pessoal, saved views e PublicationRecord.
5. SiloPage será versionada como entidade própria, com status e relação
   source_version_id para SiloDNA.
6. A identidade canônica é user_id uuid referenciando auth.users.id.
7. Minerador → Arquiteto será persistido no workflow com keyword, Brand, origem,
   decisão e estado.
8. O workspace diferenciará NO_DATA, QUERY_FAILURE, SCHEMA_MISSING,
   NOT_AUTHORIZED e READY.
9. Sucesso remoto dependerá do retorno confirmado do repository.
10. A ordem é catálogo/default ACL, schema, documentos, RLS/ACL, runtime e
    consumidores.
11. DEFAULT_ACL_GLOBAL_POLICY_REQUIRED precede qualquer tabela nova.
12. A adaptação seguirá camada compartilhada, Arquiteto, Radar, Planejador,
    Redator, Publicações e handoff do Minerador.

## 17. Limites

A migration 0026 foi aplicada conforme evidência fornecida pelo usuário. Não
foram criados RLS, RPC, repository, rota, UI ou camada runtime nesta etapa.
Não houve nova operação remota, backfill, provider, chamada paga, limpeza de
storage, commit, push ou deploy nesta etapa.

A aprovação desta SDD autorizará separadamente implementação local, preflights,
snapshot e migrations sucessoras. Não autoriza aplicação remota.
