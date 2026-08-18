# SDD — compatibilidade da persistência do Google Ads Research

- **Status:** proposta para aprovação; não autoriza migration nem execução remota
- **Módulo proprietário:** Minerador → Google Ads Discovery → persistência
- **Data:** 2026-08-16
- **SCHEMA_CHANGE_REQUIRED:** YES
- **DATA_MIGRATION_REQUIRED:** NO
- **REMOTE_EXECUTION_AUTHORIZED:** NO

## 1. Problema comprovado

O provider Google Ads já responde com sucesso para a Discovery:

- `GenerateKeywordIdeas = PASS`;
- HTTP `200`;
- ideias recebidas em quantidade positiva;
- arquitetura `PLATFORM_ENV` preservada.

A persistência falha no primeiro INSERT da RPC
`public.persist_minerador_discovery_run`, na tabela
`public.minerador_discovery_runs`, com SQLSTATE `23514` e a constraint
`minerador_discovery_runs_source_contract_check`.

O runtime não obtém metadados de anunciante para Discovery/Metrics e produz
corretamente `currency_code = null` e `time_zone = null`. O banco remoto
declara as duas colunas como nullable, mas a regra da source `google_ads`
continua exigindo os dois valores como `NOT NULL` dentro da CHECK.

O mesmo contrato incompatível existe em
`minerador_discovery_candidates_source_contract_check`.

## 2. Evidência remota somente leitura

Definições capturadas no banco vinculado em 2026-08-16:

```text
public.minerador_discovery_runs_source_contract_check
  source = 'google_ads'
  AND provider = 'google_ads'
  AND provider_version = 'v25'
  AND ...
  AND currency_code IS NOT NULL
  AND time_zone IS NOT NULL

public.minerador_discovery_candidates_source_contract_check
  source = 'google_ads'
  AND provider = 'google_ads'
  AND provider_version = 'v25'
  AND currency_code IS NOT NULL
  AND time_zone IS NOT NULL
  AND targeting IS NOT NULL
  AND measured_at IS NOT NULL
```

As colunas remotas foram confirmadas como:

```text
minerador_discovery_runs.currency_code  nullable
minerador_discovery_runs.time_zone      nullable
minerador_discovery_candidates.currency_code nullable
minerador_discovery_candidates.time_zone     nullable
source                                   NOT NULL
```

Contagens remotas capturadas:

| Tabela | source | Linhas | currency null | time_zone null |
| --- | --- | ---: | ---: | ---: |
| `minerador_discovery_runs` | `manual` | 4 | 4 | 4 |
| `minerador_discovery_runs` | `csv` | 4 | 4 | 4 |
| `minerador_discovery_candidates` | `manual` | 18 | 18 | 18 |
| `minerador_discovery_candidates` | `csv` | 16 | 16 | 16 |
| Google Ads | qualquer tabela | 0 | 0 | 0 |

Não há dados Google Ads existentes que precisem de backfill, conversão ou
alteração. Os dados existentes das outras sources devem permanecer intactos.

Baseline de segurança capturado no mesmo preflight:

- ambas as tabelas pertencem a `postgres`;
- RLS está habilitado nas duas tabelas;
- policies existentes permanecem separadas por tabela para `INSERT`/`SELECT`
  (e `UPDATE` em candidates);
- grants existentes para `authenticated`, `service_role` e `postgres` foram
  somente lidos e não serão alterados.

## 3. Auditoria de consumers

### Afetados pela compatibilidade

- `app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts`
  - recebe a resposta válida do provider;
  - constrói `runRow` e `candidateRows` com moeda/fuso nullable;
  - chama a RPC existente;
  - o readback e a UI já aceitam a pesquisa somente depois da persistência confirmada.
- `lib/minerador/discovery-persistence.ts`
  - DTOs `currencyCode` e `timeZone` são `string | null`;
  - mapper envia `null`, sem default inventado.
- `lib/minerador/discovery-candidate-adapter.ts`
  - readback converte ausência para `null`.
- `lib/minerador/discovery-current-metrics.ts`
  - projeção corrente aceita moeda nullable e não usa timezone como requisito.
- `modules/minerador/discovery/discovery-keywords-page.tsx`
  - somente aplica o snapshot retornado depois do sucesso persistido;
  - em falha mantém a última pesquisa válida.
- `modules/minerador/discovery/discovery-table-placeholder.tsx`
  - `formatDiscoveryMoney` exibe `—` quando não há moeda;
  - não lança erro nem inventa BRL.
- `app/api/minerador/marcas/[brandId]/discovery/import/route.ts`
  - usa `source` para distinguir Google Ads de manual/CSV;
  - só aproveita métricas Google Ads quando a source é Google Ads;
  - não exige `currency_code` ou `time_zone` para a leitura da candidata.

### Não afetados pela migration

- Exportação da Discovery: botão ainda desabilitado; não há consumidor ativo
  desses dois campos em exportação.
- `lib/minerador/google-ads-volume.ts` e a rota de métricas de keywords:
  pertencem ao fluxo de métricas da tabela de keywords, com contrato próprio;
  não usam as CHECK constraints de `minerador_discovery_runs/candidates`.
- `lib/google/ads/smoke.ts`, `resolveGoogleAdsAdvertiserAccount` e
  `lib/server/google-ads-canonical.ts`: caminhos de health/legacy advertiser
  metadata, fora do gate Discovery/Metrics aprovado; não serão alterados.
- `source` permanece discriminador persistido e usado pelo adapter, readback,
  importação e badge da UI. Nenhum consumidor exige mudança de semântica.

## 4. Contrato proposto

### Google Ads

Para `source = 'google_ads'`, manter todas as validações atuais de proveniência,
tenant, targeting e temporalidade, removendo somente:

```sql
currency_code IS NOT NULL
time_zone IS NOT NULL
```

Assim, o contrato Google Ads passa a exigir:

```text
provider = 'google_ads'
provider_version = 'v25'
run: campos de execução atuais não nulos
candidate: targeting não nulo
candidate: measured_at não nulo
currency_code: nullable
time_zone: nullable
```

### Manual e CSV

Preservar exatamente a branch atual:

- `provider IS NULL`;
- `provider_version IS NULL`;
- `currency_code IS NULL`;
- `time_zone IS NULL`;
- demais campos específicos de provider nulos;
- `monthly_search_volumes = '[]'::jsonb` quando aplicável.

Não ampliar a mudança para outras sources.

## 5. Migration proposta

O próximo número é provisoriamente `0041`; deve ser reconfirmado no preflight
imediatamente antes da aplicação. Nenhum arquivo de migration foi criado ou
executado nesta SDD.

A migration aprovada deverá ser transacional e alterar somente as duas CHECKs:

```sql
BEGIN;

ALTER TABLE public.minerador_discovery_runs
  DROP CONSTRAINT minerador_discovery_runs_source_contract_check,
  ADD CONSTRAINT minerador_discovery_runs_source_contract_check
  CHECK (
    (
      source = 'google_ads'
      AND provider = 'google_ads'
      AND provider_version = 'v25'
      AND seed_original IS NOT NULL
      AND seed_canonical IS NOT NULL
      AND relationship_mode IS NOT NULL
      AND language IS NOT NULL
      AND country_code IS NOT NULL
      AND country_label IS NOT NULL
      AND language_constant IS NOT NULL
      AND selected_states IS NOT NULL
      AND state_labels IS NOT NULL
      AND geo_target_constants IS NOT NULL
      AND keyword_plan_network IS NOT NULL
      AND include_adult_keywords IS NOT NULL
    )
    OR (
      source IN ('manual', 'csv')
      AND provider IS NULL
      AND provider_version IS NULL
      AND seed_original IS NULL
      AND seed_canonical IS NULL
      AND relationship_mode IS NULL
      AND language IS NULL
      AND country_code IS NULL
      AND country_label IS NULL
      AND language_constant IS NULL
      AND selected_states IS NULL
      AND state_labels IS NULL
      AND geo_target_constants IS NULL
      AND keyword_plan_network IS NULL
      AND include_adult_keywords IS NULL
      AND currency_code IS NULL
      AND time_zone IS NULL
    )
  );

ALTER TABLE public.minerador_discovery_candidates
  DROP CONSTRAINT minerador_discovery_candidates_source_contract_check,
  ADD CONSTRAINT minerador_discovery_candidates_source_contract_check
  CHECK (
    (
      source = 'google_ads'
      AND provider = 'google_ads'
      AND provider_version = 'v25'
      AND targeting IS NOT NULL
      AND measured_at IS NOT NULL
    )
    OR (
      source IN ('manual', 'csv')
      AND provider IS NULL
      AND provider_version IS NULL
      AND currency_code IS NULL
      AND time_zone IS NULL
      AND targeting IS NULL
      AND measured_at IS NULL
      AND average_monthly_searches IS NULL
      AND monthly_search_volumes = '[]'::jsonb
      AND competition IS NULL
      AND competition_index IS NULL
      AND low_top_of_page_bid_micros IS NULL
      AND high_top_of_page_bid_micros IS NULL
      AND average_cpc_micros IS NULL
    )
  );

COMMIT;
```

The final migration must preserve the exact existing constraint definitions
for all expressions not explicitly removed above. It must not alter columns,
rows, indexes, RLS, grants, owners, RPCs or other tables.

## 6. Preflight and post-verifier

### Preflight, read-only

Require all of the following before applying:

1. the remote constraint names and definitions still match this SDD;
2. both columns remain nullable;
3. `source` remains `NOT NULL`;
4. no unexpected Google Ads rows with partial or invalid contracts exist;
5. manual/CSV counts and nullability are unchanged from the captured baseline;
6. next migration number is still available;
7. RLS, policies, grants and owners match the baseline;
8. no concurrent migration changes these objects.

### Post-verifier, read-only

Require zero failures for:

- new run constraint contains no currency/time non-null requirement in the
  Google Ads branch;
- new candidate constraint contains no currency/time non-null requirement in
  the Google Ads branch;
- manual/CSV branches remain exact;
- columns remain nullable;
- `source` remains not null;
- RLS remains enabled and policies are unchanged;
- owners remain `postgres`;
- grants remain unchanged;
- row counts and checksums/counts of existing rows are unchanged;
- no row was inserted, updated or deleted by the migration.

## 7. Rollback

Rollback is prepared conceptually and must be a separate, non-automatic SQL
operation. It restores the exact two pre-change constraint definitions captured
above.

Before restoring them, rollback must abort if any Google Ads row has
`currency_code IS NULL OR time_zone IS NULL`. This guard prevents rollback from
silently deleting or rewriting valid Discovery data. Therefore rollback is
non-destructive and ready before the first null Google Ads row is created; after
successful homologation with such rows, the old contract cannot be restored
without a separate data decision.

`ROLLBACK_READY = YES (guarded)`.

## 8. Usage gap, separado

`GOOGLE_ADS_DISCOVERY_USAGE_GAP = CONFIRMED`.

A auditoria do fluxo atual confirmou que a rota de Discovery não chama
`recordIntegrationUsage`. A migration não deve esconder nem corrigir esse gap.

Depois que a persistência for homologada, uma tarefa separada deverá adaptar o
consumidor para registrar, conforme o contrato global existente:

```text
actorUserId
agencyId
brandId
resource/provider = google_ads
operation = keyword_discovery
units
status
```

Esse evento representa telemetria/consumo e não autorização. Não faz parte do
DDL desta SDD e não deve alterar Connections, grants, bindings, quotas ou a
fonte `PLATFORM_ENV`.

## 9. Validação posterior à aplicação manual

Somente após aplicação manual autorizada, post-verifier sem falhas e reinício
normal do servidor, executar exatamente um smoke real de Discovery:

```text
PROVIDER_OUTCOME = SUCCESS
HTTP_STATUS = 200
IDEAS_RECEIVED > 0
DISCOVERY_RUN_PERSISTED = YES
CANDIDATES_PERSISTED = YES
REMOTE_READBACK = PASS
UI_UPDATED_FROM_PERSISTED_DATA = YES
currency_code = null permitido
time_zone = null permitido
LAST_VALID_STATE_PRESERVATION = PASS
```

Não executar Metrics nesta etapa e não repetir a chamada em loop.

## 10. Classificação final

```text
ROOT_CAUSE = GOOGLE_ADS_RESEARCH_METADATA_CONSTRAINT_INCOMPATIBILITY
SCHEMA_CHANGE_REQUIRED = YES
DATA_MIGRATION_REQUIRED = NO
CONSUMERS_AFFECTED = Discovery persistence/readback/UI types only; no active export consumer
PROPOSED_CONSTRAINT_CHANGE = remove only currency_code/time_zone NOT NULL predicates from google_ads branches of the two source_contract checks
RISK = rollback becomes guarded after valid null Google Ads rows exist; other sources remain contractually unchanged
ROLLBACK_READY = YES (guarded)
REMOTE_EXECUTION_AUTHORIZED = NO
```
