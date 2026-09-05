# SDD — Usage para recursos de infraestrutura da Plataforma

- **Status:** SDD consolidada com inventário remoto; prepara implementação e pacote local. Apply, SQL remoto e smoke continuam dependentes de autorização explícita.
- **Módulo proprietário:** Integrações / Usage / Google Ads Infrastructure Resource
- **Data:** 2026-08-16
- **Precedência:** complementa a SDD arquitetural de integrações e o adendo `GOOGLE_ADS_CONFIG_SOURCE = PLATFORM_ENV_STATIC_PLUS_SECRET_STORE_REFRESH_TOKEN`. O resolver de credencial usa configuração estática ENV + `secret_ref` da Connection global; esta SDD trata somente o writer/ledger de Usage e não escolhe, copia ou retorna o segredo.
- **Fora do escopo:** alterar runtime, schema, RLS, dados remotos, credenciais, DataForSEO, OpenRouter, UI, quotas, grants, bindings ou executar provider.

## 1. Problema comprovado

`public.integration_usage_events` foi materializada pela migration 0024 com a premissa de que todo provider externo teria uma Connection persistida. O evento exige `connection_id NOT NULL`, possui FK para `integration_connections`, FK composta `(connection_id, provider_id)` e idempotência única em `(connection_id, idempotency_key)`.

Essa premissa é correta para Connections governáveis, como DataForSEO e OpenRouter. Para Google Ads, a resolução da credencial e o ledger de Usage são contratos separados:

```text
Google Ads credential resolver
  = configuração estática ENV / Vercel
  + refresh token por secret_ref no Secret Store
  ≠ segredo em coluna pública ou no browser

Google Ads Usage writer
  = observabilidade sanitizada
  ≠ escolha de credencial ou autorização
```

Hoje, após Provider e persistência da Discovery terem sucesso, `google-ads-discovery-usage.ts` ainda chama `resolveIntegrationResourceForActor()`. O resolvedor consulta contexto, catálogo técnico e uma Connection global READY com `secret_ref`; sua ausência ou lifecycle não READY impede a escrita de Usage e transforma uma execução já persistida em erro HTTP 503.

## 2. Invariantes preservadas

1. `provider_id` continua identificando o provider técnico.
2. `actor_user_id`, `agency_id` e `brand_id` continuam registrando o consumidor e o tenant dos dados.
3. `operation_kind`, `module`, unidades, custo, status, ambiente e correlação sanitizada continuam no ledger.
4. Usage é observabilidade append-only; não concede autorização, entitlement, quota, Connection ou credencial.
5. Google Ads usa configuração estática ENV + Refresh Token no Secret Store; o ledger não altera nem escolhe essa configuração.
6. DataForSEO e OpenRouter permanecem Connection-backed, com `secret_ref` e Vault somente server-side.
7. Não será criada Connection falsa, sentinel, placeholder ou legada para Google Ads; a Connection global canônica, quando existente, guarda apenas o `secret_ref` operacional.
8. RLS, ACL, owner, trigger append-only, isolamento por Brand e dados históricos permanecem preservados.

## 3. Contrato atual auditado

| Elemento | Estado atual | Consequência para Google Ads |
| --- | --- | --- |
| `provider_id` | `NOT NULL`, FK para `integration_providers` | reutilizável como identidade técnica |
| `connection_id` | `NOT NULL`, FK para `integration_connections` | incompatível com infraestrutura sem Connection |
| `capability_id` | `NOT NULL`, FK para `integration_capabilities` | pode permanecer como classificação técnica |
| FK composta | `(connection_id, provider_id)` | protege o provider da Connection quando há Connection |
| Idempotência | unique `(connection_id, idempotency_key)` | não atende `connection_id IS NULL` |
| `module_operation` | exige `brand_id` e `module` | preserva tenantização da Discovery |
| append-only | trigger bloqueia `UPDATE`/`DELETE` | deve permanecer intacto |
| RLS/ACL | leitura por escopo; escrita server-side | deve permanecer intacto |

O repository também exige os dois IDs: `recordIntegrationUsageForResource()` compõe a linha a partir de `resource.connection` e `resource.capability`; a busca idempotente é indexada por `connection_id`.

## 4. Contrato proposto

### 4.1 Origem de Usage explícita no contrato compartilhado

O contrato TypeScript futuro deve representar duas variantes, concentradas no ledger compartilhado:

```text
ConnectionUsage
  sourceKind = connection
  providerId + connectionId + capabilityId

PlatformInfrastructureUsage
  sourceKind = platform_infrastructure
  providerId + connectionId = null + capabilityId
```

No banco, a origem é derivada de forma determinística, sem nova entidade e sem dado duplicado:

| `connection_id` | Origem canônica |
| --- | --- |
| não nulo | `connection` — consumo vinculado a Connection governável |
| nulo | `platform_infrastructure` — recurso fixo sem Connection |

O tipo discriminado existe no contrato de escrita/leitura para impedir branches espalhados em rotas. A coluna não é necessária porque sua semântica é integralmente derivável e não pode divergir do valor persistido.

### 4.2 Google Ads

```text
rota já autorizada
  → contexto actor / agency / brand já confirmado
  → identidade técnica google_ads + keyword_discovery
  → append Usage platform_infrastructure
     provider_id = Google Ads
     connection_id = NULL
     capability_id = google_ads_keyword_discovery
```

O caminho de Usage não chama `resolveHomologationResourceForActor()`, não procura Connection, `secret_ref`, grant, binding ou quota. A validação de acesso do ator continua pertencendo à rota antes da chamada ao provider; Usage recebe esse contexto já autorizado e apenas valida formato/tenant para a escrita.

### 4.3 DataForSEO e OpenRouter

Continuam chamando o resolvedor Connection-backed existente:

```text
actor / agency / brand
  → entitlement / binding / Connection READY
  → Vault server-side
  → provider
  → Usage sourceKind = connection
```

Nenhuma regra de Google Ads é generalizada para esses providers.

### 4.4 Capability

`capability_id` permanece `NOT NULL` nesta proposta. A capability é a classificação técnica da operação, unidade e ambiente do ledger; ela não é grant, binding, entitlement ou autorização de módulo.

Para Google Ads, uma resolução de classificação técnica pode consultar exclusivamente o catálogo `integration_providers` + `integration_capabilities` e confirmar a correspondência técnica conhecida (`google_ads_keyword_discovery` / `keyword_discovery`). Essa consulta:

- não lê Connections;
- não lê Vault;
- não lê grants, bindings ou quotas;
- não decide se o provider pode executar;
- não substitui `PLATFORM_ENV`.

Ausência do catálogo impede apenas uma escrita de Usage corretamente classificada; não pode virar diagnóstico de acesso negado, nem preflight da chamada Google Ads. A compatibilidade provider/capability permanece uma regra do contrato compartilhado e de testes. O schema atual já não impõe FK entre capability e provider, portanto esta SDD não amplia essa limitação.

## 5. Mudança estrutural proposta para avaliação posterior

### 5.1 `connection_id`

Alterar `integration_usage_events.connection_id` para nullable. `provider_id` continua obrigatório.

A FK simples para `connection_id` e a FK composta `(connection_id, provider_id)` continuam válidas para eventos Connection-backed. Em PostgreSQL, com `MATCH SIMPLE` — comportamento atual a confirmar no preflight remoto — uma FK composta não é validada quando a coluna `connection_id` está nula; isto permite o evento de infraestrutura sem enfraquecer a validação de provider para eventos com Connection.

Não há provider inconsistente em eventos de infraestrutura: não existe Connection correspondente a comparar. A identidade técnica é o `provider_id` obrigatório. O writer compartilhado deve aceitar `connection_id = NULL` somente na variante `platform_infrastructure`, atualmente permitida apenas para Google Ads; DataForSEO e OpenRouter permanecem obrigatoriamente na variante `connection` por contrato de runtime e testes.

### 5.2 Idempotência

A unique atual não serve para valores nulos porque PostgreSQL permite múltiplas linhas com `NULL` em uma unique convencional. A estratégia proposta, sujeita ao preflight remoto, é substituir a constraint atual por dois índices parciais:

```text
Connection-backed
  UNIQUE (connection_id, idempotency_key)
  WHERE connection_id IS NOT NULL

Platform infrastructure
  UNIQUE (provider_id, environment, idempotency_key)
  WHERE connection_id IS NULL
```

`environment` é necessário no segundo escopo. A Connection atual já separa ambientes; `provider_id + idempotency_key` isoladamente não prova que uma mesma chave não possa existir em ambientes diferentes.

O repository futuro deve receber uma chave de consulta estruturada e usar a variante correta ao tratar conflito `23505`. `usageEquivalent()` deve comparar também `sourceKind`, `provider_id`, `environment`, contexto de tenant e capability.

### 5.3 Sem mudança nesta SDD

Esta SDD não cria coluna, índice, constraint, trigger ou função. A migration futura somente poderá ser proposta após diagnóstico remoto e aprovação explícita.

## 6. Consumidores e compatibilidade

| Consumidor | Estado/impacto | Tratamento futuro |
| --- | --- | --- |
| `lib/minerador/google-ads-discovery-usage.ts` | único consumidor ativo incompatível; resolve Connection para escrever Usage | migrar para o writer `platform_infrastructure` compartilhado |
| `lib/server/integrations-runtime.ts` | define `IntegrationUsageEvent`, repository, idempotência e resolvedor | separar resolução de Usage da resolução de recurso Connection-backed |
| Discovery Google Ads | runtime já usa `resolveGoogleAdsCanonicalContext()` / env | manter; somente trocar writer pós-persistência |
| DataForSEO allintitle | usa `resource.connection` + Vault + Usage | sem alteração semântica |
| OpenRouter / `process-intent-niche` | usa `resource.connection` + Vault + Usage | sem alteração semântica |
| Admin Integrações | lê Usage por provider/capability/escopo; não depende de `connection_id` na projeção atual | manter leitura; opcionalmente expor origem derivada em tarefa própria |
| quota aggregation | soma por capability, ambiente e escopo | sem alteração; Google Ads não passa a usar quota nesta fase |
| readbacks SQL | alguns correlacionam Usage por metadata/provider/capability | preservar e adaptar apenas se verificarem `connection_id` como não nulo |
| RLS/ACL/trigger | contratos estruturais da 0024/0025 | preservar literalmente, salvo alteração mínima da nullability/índices |

### Connection Google Ads legada

Não remover, editar, desativar ou migrar a Connection persistida nesta tarefa. Consumidores encontrados:

1. `google-ads-discovery-usage.ts` via `resolveIntegrationResourceForActor()`;
2. `integrations-runtime.ts` via `resolveHomologationResourceForActor()`;
3. `platform-integrations-admin.ts` lê o catálogo e expõe status estático + referência sanitizada; a interface ativa permite somente a rotação do refresh token no Secret Store e filtra a Connection Google Ads global da lista operacional;
4. actions administrativas antigas permanecem guardadas por `GOOGLE_ADS_PLATFORM_ENV_READ_ONLY`.

A remoção futura exige prova de zero consumidores de runtime, Usage, Admin operacional, schema remoto e documentação ativa, além de plano de retenção dos eventos históricos que a referenciem.

## 7. Evidência remota incorporada

Foi preparado localmente o arquivo:

`supabase/scripts/google-ads-infrastructure-usage-ledger-diagnostic-read-only.sql`

Ele é somente leitura e retorna um único result set sanitizado com:

- contagem total e por provider;
- quantidade Google Ads, connection-backed e infrastructure-backed;
- Connections Google Ads mascaradas, lifecycle, ambiente, presença de `secret_ref` e quantidade de eventos que as referenciam;
- snapshots e fingerprints de colunas, constraints, índices, RLS, policies, owner/ACL e triggers;
- FKs e funções relacionais que referenciam `integration_usage_events` ou `integration_connections`.

O diagnóstico não lê Vault, não devolve `secret_ref`, não persiste baseline e não chama provider.

O result set remoto oficial foi `PASS_READ_ONLY_INVENTORY` e confirmou:

| Provider | Eventos | Connection-backed | Infrastructure-backed | Succeeded |
| --- | ---: | ---: | ---: | ---: |
| Google Ads | 4 | 4 | 0 | 0 |
| DataForSEO | 4 | 4 | 0 | 4 |
| OpenRouter | 3 | 3 | 0 | 3 |

O ledger possui 11 eventos, sem `connection_id` ou `capability_id` nulos. A Connection legada de Google Ads está `ready` e é referenciada exclusivamente pelos quatro eventos históricos identificados. Esses eventos são append-only e permanecem imutáveis: não haverá backfill, conversão para `NULL`, remoção da Connection ou alteração histórica.

## 8. Dados e compatibilidade

Pelo inventário remoto, todos os eventos existentes possuem `connection_id` e nenhum requer conversão. A migration será apenas estrutural e os novos eventos Google Ads serão os únicos a usar `connection_id = NULL`.

| Pergunta | Estado antes do diagnóstico remoto |
| --- | --- |
| Dados existentes requerem conversão | `NO` |
| Migration pode alterar linhas existentes | proibido |
| DataForSEO/OpenRouter podem perder Connection | proibido |
| Eventos Google Ads novos podem usar Connection fake | proibido |

O preflight posterior deve falhar fechado se a definição atual de `connection_id`, FKs, unique, índices, RLS, policies, owner, ACL ou trigger divergir do baseline aprovado.

## 9. Riscos e rollback

| Risco | Mitigação |
| --- | --- |
| nullable Connection permitir uso indevido para DataForSEO/OpenRouter | union compartilhada, allowlist de infraestrutura e regressões explícitas |
| perder idempotência para `NULL` | dois índices parciais e readback por variante |
| concorrência entre alteração da unique e novos writes | migration planejada com preflight, janela controlada e post-verifier |
| rollback tornar-se impossível após evento infraestrutura | rollback guarded: abortar se existir `connection_id IS NULL`; nunca preencher, apagar ou reescrever eventos append-only |
| drift de RLS/ACL/triggers | fingerprints pré/pós e post-verifier que exige equivalência fora dos objetos alvo |
| capability virar autorização indireta | separar resolver de classificação técnica e testes negativos de grants/bindings ausentes |

Rollback futuro restaura `connection_id NOT NULL` e a unique original somente se não existir evento infrastructure-backed. Não há rollback automático e não há DML corretivo.

## 10. Plano de migration local, apply remoto não autorizado

1. preservar o inventário remoto como evidência de baseline;
2. gerar preflight determinístico e post-verifier ligado ao baseline da 0042;
3. preparar migration mínima: nullability de `connection_id`, índice parcial de idempotência e nenhum backfill;
4. preparar rollback guarded separado;
5. adaptar o writer compartilhado e Google Ads Discovery localmente;
6. executar testes mockados e teste PostgreSQL local para a FK composta `MATCH SIMPLE`;
7. executar preflight remoto, aprovar manualmente e somente então aplicar remotamente;
8. executar post-verifier remoto antes de qualquer smoke;
9. só então iniciar auditoria futura de remoção da Connection Google Ads legada.

O pacote local candidato é numerado `0042`, por ser o próximo número livre no checkout. Ele contém:

- `0042_google_ads_infrastructure_usage_ledger.sql` — `connection_id` nullable e somente o índice parcial de infraestrutura;
- preflight read-only com baseline determinístico e guard fail-closed;
- post-verifier read-only que recebe o `evidence_json` do preflight na mesma sessão por `minerador.usage_0042_baseline_json`;
- rollback separado, serializado e bloqueado pela existência de qualquer evento com `connection_id IS NULL`.

## 11. Testes exigidos para a implementação futura

- Google Ads Usage `platform_infrastructure` persiste `connection_id = NULL` e mantém provider/capability/actor/agency/brand;
- Google Ads não chama resolvedor de Connection, Vault, grants, bindings ou quota para gravar Usage;
- retry Google Ads no mesmo provider/ambiente/chave não duplica;
- mesma chave em ambientes distintos segue a semântica aprovada;
- DataForSEO e OpenRouter continuam exigindo Connection READY e secret server-side;
- provider/capability incorretos falham no writer sem vazar segredo;
- falha anterior ao provider não registra consumo; provider chamado e falha segue a regra de Usage aprovada;
- append-only, RLS, ACL, owner, políticas, FKs Connection-backed e dados existentes permanecem inalterados;
- testes não chamam Google Ads, DataForSEO ou OpenRouter reais.

## 12. Critérios de aceite desta SDD

```text
GOOGLE_ADS_CONNECTION_REQUIRED_FOR_USAGE = NO
DATAFORSEO_CONNECTION_SEMANTICS_PRESERVED = YES
OPENROUTER_CONNECTION_SEMANTICS_PRESERVED = YES
USAGE_AUTHORIZATION_COUPLING_REMOVED = YES
APPEND_ONLY_PRESERVED = YES
RLS_PRESERVED = YES
TENANT_ISOLATION_PRESERVED = YES
IDEMPOTENCY_STRATEGY_DEFINED = YES
CAPABILITY_SEMANTICS_EXPLICIT = YES

DATA_MIGRATION_REQUIRED = NO
REMOTE_DIAGNOSTIC_REQUIRED = NO
MIGRATION_READY = LOCAL_PACKAGE_ONLY

REAL_PROVIDER_CALLS = 0
REMOTE_OPERATIONS = 0

SDD_REMOTE_EVIDENCE_INCORPORATED = YES
HISTORICAL_GOOGLE_ADS_EVENTS_PRESERVED = YES
CONNECTION_ID_TARGET_NULLABLE = YES
CAPABILITY_ID_TARGET_REQUIRED = YES
COMPOSITE_CONNECTION_PROVIDER_FK_PRESERVED = YES
CONNECTION_BACKED_UNIQUE_PRESERVED = YES
INFRASTRUCTURE_PARTIAL_UNIQUE_DEFINED = YES
GOOGLE_ADS_NEW_USAGE_CONNECTION_ID = NULL
DATAFORSEO_CONNECTION_REQUIRED = YES
OPENROUTER_CONNECTION_REQUIRED = YES
GOOGLE_ADS_USAGE_CONNECTION_RESOLUTION_REMOVED = YES
GOOGLE_ADS_USAGE_AUTHORIZATION_COUPLING_REMOVED = YES
SCHEMA_CHANGE_REQUIRED = YES
MIGRATION_NUMBER = 0042
MIGRATION_PACKAGE_READY = LOCAL_ONLY
REMOTE_APPLY_AUTHORIZED = NO
```

Esses critérios definem o destino do contrato. A implementação, a migration e qualquer operação remota continuam bloqueadas até aprovação explícita desta SDD e dos artefatos de preflight correspondentes.
