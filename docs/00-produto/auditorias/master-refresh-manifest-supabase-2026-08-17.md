# Master Refresh Manifest do Supabase

- **Projeto remoto:** `hjjlntdpdgvpnazdztqw`
- **Data da baseline de planejamento:** 2026-08-17
- **Módulo proprietário:** fundação global compartilhada
- **Modo desta tarefa:** catálogo, contagens e diagnóstico somente leitura
- **Pré-condição:** `0043_CLOSED = YES`; a 0043 está congelada e fora do escopo
- **Estado do manifesto:** `PASS` como planejamento; execução ainda depende dos gates explícitos deste documento

> **Atualização dos gates (2026-08-17):** o readback posterior encontrou uma
> linha atual em `public.perfis`: `adalbapro@gmail.com` possui `role=admin`.
> Contagens, candidatos, exports e recomendações atuais estão em
> `master-refresh-decision-gates-2026-08-17.md`. As menções abaixo a
> `perfis = 0` e a UUID Admin não escolhido permanecem apenas como fotografia
> da baseline anterior e não devem orientar a execução.
>
> **Decisão humana posterior:** os quatro gates foram aprovados e
> `ALL_REFRESH_BLOCKERS_RESOLVED = YES`. O primeiro pacote executável está em
> `master-refresh-batch-1-execution-package-2026-08-17.md`; esta atualização
> não autoriza sua execução remota.
>
> **Fechamento posterior:** o Batch 1 foi encerrado com preflight remoto,
> testes direcionados e post-verifier bound em `PASS`; zero delta remoto,
> rollback não executado e nenhum outro Batch iniciado.

## 1. Resultado executivo

O catálogo remoto possui 49 tabelas em `public`, todas com RLS habilitado, e
seis tabelas isoladas em `migration_backup`. A integridade tenantizada
verificada está consistente: não há owner inválido, Brand ligada a mais de uma
Agency ativa, nem mismatch de `brandId` entre listas/keywords, Discovery e
métricas.

O refresh não pode começar por uma limpeza genérica. Há quatro gates reais:

1. o banco não possui flag que prove quais Agencies e Brands são apenas de
   homologação;
2. os 22 eventos de Usage são append-only e bloqueiam por FK a remoção da
   Agency e da Brand que os originaram;
3. `perfis` tem zero linhas, embora as funções canônicas reconheçam Admin
   global somente por `perfis.role = 'admin'`;
4. `migration_backup` contém 443 linhas de recuperação, incluindo duas cópias
   de 147 keywords com fingerprints diferentes.

Portanto, o manifesto está completo, mas `READY_FOR_REFRESH_EXECUTION = NO`
até a aprovação resolver a allowlist dos tenants, o UUID do Admin, a política
de retenção do Usage e a retenção/exportação de `migration_backup`.

## 2. Evidência remota atual

### 2.1 Identidades, Agencies e Brands

`auth.users` possui quatro identidades. Todas já fizeram login, são owner de
uma Agency e devem ser preservadas. Nenhuma possui papel em metadata e
`public.perfis` está vazia.

| Tipo | ID | Nome | Estado | Dados dependentes principais |
| --- | --- | --- | --- | --- |
| Agency candidata a homologação | `3cc14013-3296-4094-80de-712abc4ceae8` | AdalbaPro | active | 1 membership, 2 Brands, 4 grants, 4 bindings, 22 Usage |
| Agency candidata a homologação | `1febb431-4e44-49e9-b8cd-12115f4ad999` | AdalbaFotos | active | 1 membership, 1 convite, 1 onboarding, 4 grants, 4 bindings |
| Agency candidata a homologação | `cd84f5ee-b939-4b05-afa4-52aabb8c9aa4` | AdaMusic | active | 1 membership, 1 convite, 1 onboarding, 4 grants, 4 bindings |
| Agency candidata a homologação | `ae851a64-5bff-449b-865c-ec6aa950be38` | AdaSEO | active | 1 membership, 1 convite, 1 onboarding, 4 grants, 4 bindings |
| Brand candidata a homologação | `f514a553-ce4a-472e-9aec-c3fecff375f1` | Adalba | active | 11 keywords, 19 runs, 708 candidates, 22 Usage |
| Brand candidata a homologação | `033b0cde-6e00-472c-b9d6-3c10ad33ae61` | Care Glow | active | 6 keywords, 1 run, 6 candidates, 0 Usage |

Os nomes, a topologia e a ausência de artefatos editoriais são compatíveis
com homologação, mas não constituem autorização de exclusão. Esses IDs são a
allowlist candidata; a aprovação do batch precisa declarar explicitamente que
cada um é descartável.

### 2.2 Dados candidatos a reset

As contagens abaixo são exatas no readback desta tarefa. As tabelas são
preservadas; somente as linhas pertencentes à allowlist aprovada poderão sair.

| Domínio | Tabela | Linhas atuais | Classificação |
| --- | --- | ---: | --- |
| Agency | `agencies` | 4 | `BLOCKED_FROM_RESET` até confirmar allowlist |
| Agency | `agency_memberships` | 4 | `RESET_DATA` condicionado |
| Agency | `agency_brands` | 2 | `RESET_DATA` condicionado |
| Agency | `agency_applications` | 1 | `RESET_DATA` condicionado |
| Agency | `agency_invitations` | 4 | `RESET_DATA` condicionado |
| Agency | `agency_invitation_token_generations` | 4 | `RESET_DATA` condicionado |
| Agency | `agency_onboardings` | 3 | `RESET_DATA` condicionado |
| Agency | `agency_access_periods` | 4 | `RESET_DATA` condicionado |
| Comunicação | `communication_messages` | 8 | `RESET_DATA` condicionado |
| Comunicação | `communication_delivery_events` | 0 | tabela `PRESERVE` |
| Plataforma | `communication_templates` | 2 | `PRESERVE` |
| Plataforma | `platform_communication_config` | 1 | `PRESERVE` |
| Brand | `marcas` | 2 | `BLOCKED_FROM_RESET` até confirmar allowlist/Usage |
| Brand | `brand_memberships` | 0 | tabela `PRESERVE`; reset vazio |
| Brand | `brand_member_permissions` | 0 | tabela `PRESERVE`; reset vazio |
| Minerador | `minerador_keyword_lists` | 0 | tabela `PRESERVE`; reset vazio |
| Minerador | `minerador_keywords` | 17 | `RESET_DATA` condicionado |
| Discovery | `minerador_discovery_runs` | 20 | `RESET_DATA` condicionado |
| Discovery | `minerador_discovery_candidates` | 714 | `RESET_DATA` condicionado |
| Discovery | `minerador_discovery_import_batches` | 10 | `RESET_DATA` condicionado |
| Discovery | `minerador_discovery_keyword_origins` | 20 | `RESET_DATA` condicionado |
| Métricas | `minerador_discovery_candidate_current_metrics` | 183 | `RESET_DATA` condicionado |
| Métricas | `minerador_discovery_candidate_metric_history` | 3 | `RESET_DATA` condicionado |
| Métricas | `minerador_keyword_metric_measurements` | 0 | tabela `PRESERVE`; reset vazio |
| Legado editorial | `briefings_artigos` | 0 | `MIGRATE`, não `DROP` |
| Pipeline editorial canônico | nove tabelas 0027–0029 | 0 em todas | schemas `PRESERVE` |
| Integrações | `integration_grants` | 20 | linhas de homologação; reset após cortar writers |
| Integrações | `integration_bindings` | 20 | linhas de homologação; reset após cortar writers |
| Integrações | `integration_usage_events` | 22 | `BLOCKED_FROM_RESET`, ledger append-only |

Não será usado `TRUNCATE CASCADE`. Cada exclusão futura deve ser por ID
allowlisted, dentro de transação, com contagem PRE/POST e rollback por snapshot.

## 3. PRESERVE

Preservar integralmente:

- infraestrutura gerenciada do Supabase, schemas de sistema, Auth, Storage,
  Realtime e extensões;
- as quatro linhas de `auth.users`, sessões e identidade real;
- ENV/Vercel e `GOOGLE_ADS_*` de `PLATFORM_ENV`;
- Vault e segredos reais; nenhum valor de segredo foi lido nesta auditoria;
- `integration_providers` (3) e `integration_capabilities` (4);
- Connection DataForSEO `14496206-f2b4-44f0-aa2e-4b412e04386d`, READY, com
  `secret_ref`;
- Connection OpenRouter `2f1a8f5c-8070-4c40-893f-5e17f82c8507`, READY, com
  `secret_ref` e modelo persistido;
- provider e capabilities Google Ads como catálogo técnico e referência do
  histórico, mesmo com runtime em `PLATFORM_ENV`;
- `canonical_capabilities` (11), tabelas de Agency/Brand/Auth e contratos
  tenantizados;
- tabelas canônicas do Minerador, Discovery, métricas e pipeline editorial;
- `communication_templates` e `platform_communication_config`;
- migrations históricas locais; o ledger remoto antigo não será fabricado;
- constraints, índices, FKs, triggers, RLS, policies, ACLs e owners não
  classificados explicitamente para migração;
- Usage até existir política explícita de retenção/purge de homologação.

## 4. MIGRATE

### 4.1 Identidade e ownership

1. **Admin global:** escolher explicitamente uma das quatro identidades Auth e
   criar/confirmar a linha `perfis(id, role='admin')`. Hoje as funções
   `is_global_admin`, `canonical_is_platform_admin` e
   `canonical_actor_is_global_admin` dependem dessa linha, mas `perfis = 0`.
2. **Owner de Brand:** `lib/server/brand-provisioning.ts` ainda materializa
   membership `owner`. O contrato vigente diz que owner vem de
   `marcas.owner_user_id` e memberships representam colaboradores. Cortar esse
   writer antes de recriar Brands.
3. **Catálogo de papéis:** `brand_roles` contém somente `owner` global e nenhum
   membership atual. Preparar os papéis de colaborador aprovados e remover o
   papel `owner` apenas depois de `RUNTIME_CONSUMERS = 0`.

### 4.2 `briefings_artigos`

Estado remoto:

- zero linhas, mas cinco consumidores runtime locais;
- RLS habilitada e nenhuma policy;
- `anon` e `authenticated` têm DELETE, INSERT, MAINTAIN, REFERENCES, SELECT,
  TRIGGER, TRUNCATE e UPDATE;
- não possui `brand_id`; a autorização tenant depende indiretamente de
  `silo_id`.

Decisão: `MIGRATE_THEN_DROP`, em duas etapas. O hardening imediato revoga o
acesso de `anon`, reduz ACL e define política/autorização explícita. Depois, os
consumidores devem convergir para ArticleDNA/ContentPlan/workflow canônicos.
Como a tabela está vazia, não há backfill; ela não pode ser dropada enquanto
os cinco consumidores existirem.

### 4.3 Funções e ACL

O remoto possui 54 funções `SECURITY DEFINER`. Doze são executáveis por
`anon`; dez delas também por `PUBLIC`. O batch de segurança deve revisar por
assinatura e revogar `PUBLIC/anon` das funções internas, preservando apenas RPCs
intencionais com autenticação e autorização internas.

Findings confirmados:

- sete RPCs administrativas `canonical_*` de mutation/validação ainda
  executáveis por `PUBLIC/anon`;
- três trigger functions do Discovery executáveis por `PUBLIC/anon`;
- duas trigger functions históricas `tenant_0005_*` com grant direto a `anon`;
- seis funções sem `SET search_path`: `canonical_capability_for_module`,
  `minerador_discovery_normalize_keyword`, `protect_marca_with_published`,
  `protect_published_briefing`, `protect_published_keyword` e
  `protect_published_lista`.

Trigger function não é objeto morto apenas porque possui EXECUTE excessivo.
O batch deve corrigir ACL/search_path sem remover os triggers operacionais.
Também deve revisar default privileges para impedir novos auto-grants. A
[orientação do Supabase para SECURITY DEFINER](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)
confirma que essas funções podem virar RPCs expostas quando EXECUTE permanece
concedido.

### 4.4 Drift editorial

Schema remoto presente e preservado:

- `editorial_artifact_versions`, `editorial_workflow_items`,
  `editorial_serp_snapshots`, `editorial_serp_reviews`;
- `content_documents`, `content_document_versions`,
  `content_document_user_states`, `editorial_saved_views` e
  `publication_records`.

Gaps realmente consumidos no runtime:

- `brand_dna` é gravado por `app/api/marca/brand-dna/route.ts`, mas a CHECK de
  `editorial_artifact_versions.artifact_type` permite somente `article_dna`,
  `silo_dna`, `silo_page` e `content_plan`;
- `editorial_version_status_events` é lida/escrita pela rota BrandDNA e pelo
  repositório editorial, mas não existe remotamente;
- `editorial_decision_events` é escrita pelo repositório editorial, mas não
  existe remotamente;
- `brand_invitations` e `brand_invitation_permissions` são usadas pela rota
  ativa `/api/editorial/invitations`, mas não existem remotamente.

Decisão: migration editorial única e versionada somente após fechar os
contratos UUID, FKs, RLS, ACL, imutabilidade e status. Não criar nomes antigos
automaticamente: os quatro gaps acima possuem consumidores runtime atuais e
devem ser reconciliados com o contrato canônico de Brand/convite; qualquer
outro nome apenas histórico permanece fora.

### 4.5 Google Ads persistido

O runtime Google Ads usa `PLATFORM_ENV`, mas
`applyPlatformHomologationPolicy()` ainda distribui grants, bindings e quotas
Google a partir da Connection persistida. Esse writer precisa excluir Google
Ads antes de apagar linhas; caso contrário o legado será recriado.

A Connection Google Ads `9360a075-cb90-4771-8dfd-56729263fe3a` não é
operacionalmente canônica, porém quatro eventos históricos ainda a referenciam
por FK. Classificação: `HISTORICAL_REQUIRED / MIGRATE`, não `DROP`. Após cortar
o writer, deve sair de READY operacional sem apagar o histórico nem o segredo
sem política específica.

### 4.6 Serper e IA

- Serper possui dois consumidores ativos de rota e contratos que exigem
  `provider = serper`. Classificação conceitual `MIGRATE_THEN_DROP`, fora dos
  batches destrutivos da fundação.
- `SERPER_API_KEY`/`SERPER_API_BASE_URL` continuam ativos. Não remover agora.
- OpenRouter Connection é canônica e preservada.
- `lib/server/ai-provider-config.ts` ainda lê `DEEPSEEK_API_KEY`,
  `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` por ENV para rotas legadas de IA.
  Esses consumidores devem migrar para OpenRouter Connection por área, mas não
  bloqueiam o refresh estrutural.

## 5. DROP

Somente três tabelas possuem evidência suficiente:

| Objeto | Linhas | Runtime consumers | FK entrante / função dependente | Substituto |
| --- | ---: | ---: | --- | --- |
| `public.minerador_google_ads_connections` | 0 | 0 | 0 / 0 | Google Ads `PLATFORM_ENV` |
| `public.google_ads_binding_targeting` | 0 | 0 | 0 / 0; 1 trigger próprio | Google Ads `PLATFORM_ENV` |
| `public.google_ads_binding_account_state` | 0 | 0 | 0 / 0; 1 trigger próprio | Google Ads `PLATFORM_ENV` |

Os triggers próprios das duas últimas tabelas desaparecem com elas; funções
compartilhadas de timestamp permanecem se tiverem outros consumidores.

Não entram em DROP:

- Connection/provedor/capabilities Google referenciados por Usage;
- infraestrutura `integration_*` usada por DataForSEO/OpenRouter;
- Serper, que ainda possui consumidores ativos;
- `communication_delivery_events`, que possui RPC de gravação;
- índices apenas marcados como “unused” pelo advisor;
- qualquer objeto de `migration_backup` sem decisão de retenção.

## 6. BLOCKED_FROM_RESET

1. **Allowlist dos tenants:** confirmar os quatro Agency IDs e dois Brand IDs
   acima como homologação descartável.
2. **Dados reais misturados:** não há flag remota que diferencie real/teste;
   estado atual é `UNCONFIRMED`.
3. **Usage:** 22 eventos append-only — DataForSEO 7 sucessos, OpenRouter 4
   sucessos, Google Ads 4 falhas connection-backed e 7 sucessos
   infrastructure-backed. O trigger impede DELETE/UPDATE e as FKs bloqueiam
   remover Agency/Brand/Connection.
4. **Admin global:** UUID do Admin que deve sobreviver ao reset ainda não foi
   explicitamente escolhido para `perfis`.
5. **Connection histórica Google:** quatro eventos antigos impedem seu DROP.
6. **`migration_backup`:** retenção/exportação ainda não aprovada.

## 7. Decisão de `migration_backup`

| Tabela | Linhas | Fingerprint |
| --- | ---: | --- |
| `keywords_kgr_after_failed_0005_20260724` | 147 | `4ee7ae2d493302b1c931d61ce507cf84` |
| `keywords_kgr_before_0005_20260724` | 147 | `f40807bb165f26961ecd43766d1b4d01` |
| `listas_kgr_before_0005_20260724` | 5 | `528c7c497898a3356b054728ffbf857d` |
| `marcas_before_0005_20260724` | 1 | `2581e097fc9433204dfe990032518ce6` |
| `perfis_before_0005_20260724` | 1 | `adad261679f64bd820ba9dfab3fdeae2` |
| `policies_before_0005_20260724` | 2 | `f95208610ded30018af00f5db9340eac` |

As seis tabelas não possuem FK ou dependente de runtime, mas contêm dados não
presentes no banco operacional na mesma quantidade. As duas cópias de keywords
têm contagem igual e fingerprint diferente, portanto não são duplicatas
comprovadas.

**Decisão atual:** `BLOCKED_FROM_RESET`, com preservação temporária. Só poderão
ir para DROP após exportação verificável, hash do artefato, confirmação de que
nenhuma recuperação ainda é necessária e aprovação explícita. Não serão
mantidas como parte da baseline canônica final.

## 8. Ordem FK-safe do reset tenantizado

Quando os gates forem aprovados, a ordem interna do reset será:

1. Usage allowlisted, somente se houver política de purge aprovada;
2. `communication_delivery_events` → `communication_messages`;
3. `agency_invitation_token_generations` → `agency_access_periods` →
   `agency_onboardings` → `agency_invitations` → `agency_applications`;
4. `integration_bindings` → `integration_grants` tenantizados; quotas somente
   quando possuírem escopo do tenant;
5. `publication_records` → estados/versões/documentos → reviews/snapshots →
   workflow → artefatos editoriais;
6. `minerador_discovery_keyword_origins` → histórico/current metrics →
   measurements → candidates → import batches → runs → keywords → briefings →
   listas;
7. `brand_member_permissions` → `brand_memberships` →
   `brand_agency_capability_restrictions` → `agency_brands`;
8. `agency_membership_capabilities` → `agency_memberships`;
9. Brands allowlisted;
10. Agencies allowlisted;
11. nenhuma linha de `auth.users`.

Cada etapa deve confirmar zero referências remanescentes antes da seguinte.

## 9. Proposed execution batches

### BATCH 1 — Gate de identidade, writers e snapshot

- **Objetivo:** impedir lockout/recriação de legado e congelar a baseline PRE.
- **Objetos:** `perfis`, provisionamento de owner, writer da política de
  homologação Google e allowlists.
- **Dados:** uma linha Admin aprovada; nenhuma exclusão.
- **Migration:** sim para perfil/contratos persistidos; deploy de código para
  writers.
- **Risco:** alto por autorização.
- **Rollback:** snapshot de perfis/roles e reversão do deploy; nunca remover
  `auth.users`.
- **Preflight:** UUID Admin, quatro identidades Auth, fingerprints de roles e
  writers zero para Google persistido.
- **Post-verifier:** Admin acessa sem membership artificial; owner acessa pela
  Brand; política não recria Google grants/bindings.
- **Dependências:** aprovação explícita do UUID Admin e allowlist.

### BATCH 2 — Security hardening

- **Objetivo:** fechar Data API/RPC exposta antes de novos dados.
- **Objetos:** `briefings_artigos`, 12 `SECURITY DEFINER` callable por anon,
  seis funções com search_path mutável e default privileges.
- **Dados:** zero.
- **Migration:** sim, exclusiva de segurança.
- **Risco:** médio/alto; revogar EXECUTE errado pode quebrar RPC legítima.
- **Rollback:** grants/policies/definições capturados por assinatura.
- **Preflight:** ACL, owners, proconfig, triggers e dependências.
- **Post-verifier:** advisors sem findings-alvo; regressão autenticada e
  service-role; isolamento entre Brands.
- **Dependências:** Batch 1.

### BATCH 3 — Alinhamento editorial

- **Objetivo:** tornar BrandDNA, eventos, decisões e convites compatíveis com
  os consumidores atuais e com UUID/RLS canônicos.
- **Objetos:** CHECK de artifact type e quatro relações ausentes confirmadas.
- **Dados:** tabelas editoriais atuais estão vazias; sem backfill.
- **Migration:** sim, uma migration editorial coesa após contrato aprovado.
- **Risco:** médio; nomes antigos não podem virar schema sem validar semântica.
- **Rollback:** DROP apenas dos objetos novos vazios e restauração da CHECK,
  antes de qualquer uso real.
- **Preflight:** consumidores, payloads, FKs, statuses, RLS e ACL.
- **Post-verifier:** BrandDNA create/approve/readback, decisão append-only,
  convite de Brand sem conceder acesso antes da aceitação.
- **Dependências:** Batch 2 e contrato editorial aprovado.

### BATCH 4 — Corte do legado Google Ads persistido

- **Objetivo:** deixar Google Ads exclusivamente em `PLATFORM_ENV` sem perder
  histórico.
- **Objetos:** writer administrativo, 8 grants Google, 8 bindings Google, 2
  quotas Google, Connection histórica e três tabelas em DROP.
- **Dados:** remover resources de homologação; preservar 11 eventos Google e a
  Connection enquanto quatro eventos a referenciam.
- **Migration:** sim para drops/estado persistido; deploy de código antes.
- **Risco:** alto se o writer não for cortado ou Usage for mutilado.
- **Rollback:** restauração do schema vazio e dos resources via snapshot; ENV
  não é alterado.
- **Preflight:** zero runtime consumers das três tabelas, zero linhas/deps,
  writer Google desativado, Usage/FKs capturados.
- **Post-verifier:** Google runtime resolve apenas ENV; nenhum grant/binding
  Google é recriado; Usage histórico continua legível.
- **Dependências:** Batch 1 e política de retenção do Usage.

### BATCH 5 — Reset allowlisted dos tenants

- **Objetivo:** remover dados antigos de homologação preservando identidades e
  schema.
- **Objetos:** linhas listadas na seção 2.2, na ordem FK-safe da seção 8.
- **Dados:** até 4 Agencies, 2 Brands, 17 keywords, 20 runs, 714 candidates,
  10 batches, 20 origins, 183 métricas atuais, 3 históricos, convites e
  comunicação associados.
- **Migration:** não para DML ordinária; exige script transacional versionado e
  auditável. Se o Usage for purgado, a exceção ao append-only exige migration
  específica e política aprovada.
- **Risco:** crítico; possível mistura de dado real e teste.
- **Rollback:** export/snapshot validado por ID e hash antes de qualquer DELETE.
- **Preflight:** allowlist assinada, contagens por ID, FKs e zero dados fora da
  lista no conjunto de exclusão.
- **Post-verifier:** zero órfãos/mismatch; `auth.users = 4`; Admin preservado;
  tabelas canônicas vazias e operacionais.
- **Dependências:** Batches 1–4 e resolução de todos os blockers de reset.

### BATCH 6 — `migration_backup` e órfãos finais

- **Objetivo:** retirar somente arquivos de recuperação já exportados e objetos
  mortos finais.
- **Objetos:** seis tabelas `migration_backup` após gate; nenhum objeto público
  adicional além dos três Google já classificados.
- **Dados:** 443 linhas de backup.
- **Migration:** sim para DROP do schema/tabelas, se aprovado.
- **Risco:** alto e irreversível sem export.
- **Rollback:** restauração do dump verificado por fingerprint.
- **Preflight:** export legível, hashes acima conferidos e aceite de retenção.
- **Post-verifier:** schema/objetos ausentes e catálogo não-alvo idêntico.
- **Dependências:** Batch 5 e decisão explícita `PRESERVE` ou `DROP`.

### BATCH 7 — Baseline canônica final

- **Objetivo:** congelar a fundação encerrada.
- **Objetos:** tables, columns, constraints, indexes, FKs, triggers, RLS,
  policies, ACL, functions, owners, tenant model e integration model.
- **Dados:** somente contagens sanitizadas e fingerprints.
- **Migration:** não.
- **Risco:** baixo; baseline incorreta vira dívida futura.
- **Rollback:** não aplicável.
- **Preflight:** todos os post-verifiers anteriores em PASS.
- **Post-verifier:** `DATABASE_CANONICAL_BASELINE_DATE = 2026-08-17`, artefato
  versionado e nenhuma reconstrução artificial de ledger histórico.
- **Dependências:** todos os batches aprovados/executados.

## 10. Saída contratual

```text
MASTER_REFRESH_MANIFEST = PASS

PRESERVE = auth.users; infraestrutura Supabase; ENV/Vercel; Google Ads PLATFORM_ENV;
DataForSEO/OpenRouter Connections e secrets; catálogos técnicos; schemas canônicos;
tenantização; migrations históricas locais; Usage até política explícita

RESET_DATA = dados allowlisted de Agency/Brand, convites/onboarding/comunicação,
20 grants e 20 bindings de homologação, 17 keywords, 20 runs, 714 candidates,
10 import batches, 20 origins, 183 current metrics e 3 metric histories

MIGRATE = Admin/perfis; writer de owner membership; catálogo brand_roles;
briefings_artigos; ACL/SECURITY DEFINER/search_path/default privileges;
BrandDNA/events/decisions/brand invitations; writer/resources Google persistidos;
Serper e IA ENV em fase funcional posterior

DROP = public.minerador_google_ads_connections;
public.google_ads_binding_targeting; public.google_ads_binding_account_state

BLOCKED_FROM_RESET = allowlist de 4 Agencies e 2 Brands; 22 Usage append-only;
Connection Google histórica; UUID Admin; seis tabelas migration_backup

TEST_TENANTS_IDENTIFIED = NO
TEST_TENANT_CANDIDATES_IDENTIFIED = YES
REAL_DATA_MIXED_WITH_TEST_DATA = UNCONFIRMED

GOOGLE_ADS_LEGACY_PLAN = MIGRATE writer/resources; PRESERVE histórico/provider;
DROP três tabelas vazias; runtime permanece PLATFORM_ENV
SERPER_PLAN = MIGRATE_THEN_DROP posterior; não bloqueia fundação
AI_LEGACY_PLAN = migrar quatro rotas ENV para OpenRouter Connection por área;
não bloquear refresh estrutural
MIGRATION_BACKUP_PLAN = BLOCKED_FROM_RESET / PRESERVE temporariamente;
exportar e validar antes de decidir DROP

SECURITY_FIXES_REQUIRED = YES
EDITORIAL_FIXES_REQUIRED = YES

REMOTE_WRITES = 0
MIGRATIONS_APPLIED = 0
PROVIDER_CALLS = 0

READY_FOR_REFRESH_EXECUTION = NO

NEXT_STEP = aguardar aprovação explícita dos batches destrutivos e das quatro
decisões bloqueadoras: allowlist, UUID Admin, retenção do Usage e migration_backup
```

## 11. Limites da evidência

- Verificado diretamente no remoto: catálogo, contagens, FKs, RLS/ACL de
  `briefings_artigos`, functions/EXECUTE/search_path, integrations, Usage,
  editorial drift, backups e integridade tenantizada.
- Verificado no código: consumidores runtime, writers administrativos, Serper,
  IA ENV, BrandDNA e convites.
- Não verificado porque exige decisão humana: quais tenants são descartáveis,
  quem é o Admin global e se o histórico de Usage/backups pode ser apagado.
- Nenhuma alteração remota, chamada de provider, migration, reset ou leitura de
  segredo foi realizada.
