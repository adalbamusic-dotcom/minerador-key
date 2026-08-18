# SDD — compatibilidade de moeda das medições históricas Google Ads

- **Status:** APPROVED / LOCAL PACKAGE READY; apply remoto e smoke continuam não autorizados
- **Módulo proprietário:** Minerador → Google Ads Historical Metrics → persistência
- **Data:** 2026-08-17
- **SCHEMA_CHANGE_REQUIRED:** YES
- **DATA_MIGRATION_REQUIRED:** NO
- **REMOTE_EXECUTION_AUTHORIZED:** NO

## 1. Problema confirmado

O smoke real de Historical Metrics já confirmou o provider Google Ads `v25`:
o request recebeu resposta HTTP válida e a falha posterior foi classificada em
`persist_measurements`.

O erro remoto sanitizado é `SQLSTATE 23502`: a coluna
`public.minerador_keyword_metric_measurements.currency_code` não aceita
`NULL`. O contrato criado em `0007_minerador_google_ads_volume.sql` é:

```sql
currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$')
```

No runtime canônico, `getGoogleAdsPlatformConfig()` fornece a infraestrutura
global, mas não metadados de moeda da conta. Para não reintroduzir
`GoogleAdsService.SearchStream` como lookup de anunciante, a conta operacional
de pesquisa é construída com `currencyCode = null` e `timeZone = null`.
`GenerateKeywordHistoricalMetrics` não fornece uma moeda canônica no contrato
tipado atual. O normalizador preserva `null`, e a rota envia esse mesmo valor
ao INSERT; não há perda de valor em mapper ou DTO.

Portanto, a falha é de compatibilidade entre contrato de persistência legado e
o runtime canônico, não um erro do provider nem uma ausência que possa ser
convertida com segurança para BRL, zero ou outro valor inventado.

## 2. Contrato atual e proposta mínima

### Atual

```text
public.minerador_keyword_metric_measurements.currency_code
type: text
nullability: NOT NULL
constraint: currency_code ~ '^[A-Z]{3}$'
```

### Migration 0043 preparada localmente após preflight remoto aprovado

Permitir `NULL` somente nesta coluna:

```sql
ALTER TABLE public.minerador_keyword_metric_measurements
  ALTER COLUMN currency_code DROP NOT NULL;
```

A CHECK existente deve permanecer. Assim, o contrato proposto é:

```text
currency_code IS NULL                         -> válido, moeda desconhecida
currency_code IS NOT NULL and /^[A-Z]{3}$/   -> válido
currency_code IS NOT NULL and inválido        -> rejeitado pela CHECK existente
```

Não são propostos defaults, backfill ou modificação de dados.

## 3. Fora de escopo explícito

Esta decisão não autoriza:

- preencher ou inferir moeda, inclusive BRL;
- reintroduzir `SearchStream`/advertiser lookup como gate das métricas;
- alterar Google Ads `PLATFORM_ENV`, OAuth, MCC, Research Customer ID,
  provider ou versão;
- alterar Discovery, as migrations 0041/0042, Usage, Connections, grants,
  bindings, quotas, DataForSEO ou OpenRouter;
- flexibilizar `time_zone` ou qualquer outra coluna/tabela;
- aplicar migration remotamente, executar provider ou alterar dados.

## 4. Consumers auditados

### Escrita afetada

- `app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts`
  insere `measurement.currencyCode` em
  `minerador_keyword_metric_measurements`; antes disso atualiza a projeção
  corrente da keyword com o mesmo valor. O fluxo só conclui após a persistência
  da medição e da projeção.
- `lib/google/ads/account.ts` cria a conta de pesquisa canônica com
  `currencyCode: null` e `timeZone: null` sem lookup de anunciante.
- `lib/google/ads/normalizers.ts` propaga `account.currencyCode` para a
  medição histórica sem default.
- `lib/google/ads/contracts.ts` tipa esses campos como `string | null` para o
  contrato de medição.

### Leitura e apresentação

- Não há leitura runtime, exportação, cálculo ou agrupamento ativo que consulte
  `minerador_keyword_metric_measurements.currency_code` e exija uma string
  não nula.
- `currency_code` da Discovery é outro contrato: os adapters aceitam `null` e
  a apresentação de dinheiro mostra `—` quando a moeda é desconhecida. Essa
  SDD não altera a Discovery.

### Estrutura preservada

- A tabela mantém `brand_id`, `keyword_id`, `operation_request_id`,
  proveniência Google Ads, targeting, data da medição, FK, índice, RLS,
  policies, owner e ACL atuais.
- `0041` trata somente `minerador_discovery_runs` e
  `minerador_discovery_candidates`; `0042` trata o ledger de Usage. Ambas
  ficam inalteradas.

## 5. Riscos e compatibilidade

O risco é um consumidor futuro presumir `currency_code` como string. Consultas
ou exportações futuras devem preservar `NULL` como moeda desconhecida e não
apresentá-lo como zero ou BRL. A inexistência de moeda impede somente a
formatação monetária confiável de CPC/lances, não invalida volumes, competição
ou a resposta do provider.

A mudança é aditiva para dados existentes: não altera nenhuma linha e mantém a
CHECK para valores presentes. O preflight deve capturar a estrutura e dados
atuais; o futuro post-verifier deverá provar que somente a nullability da
coluna-alvo mudou.

## 6. Rollback fail closed

Uma futura reversão só pode restaurar `NOT NULL` se o seguinte SELECT retornar
zero:

```sql
SELECT COUNT(*)
FROM public.minerador_keyword_metric_measurements
WHERE currency_code IS NULL;
```

Se houver qualquer linha nula, o rollback deve abortar. Ele não pode preencher,
apagar, converter ou reescrever dados/histórico para tornar a reversão possível.

`ROLLBACK_READY = YES (guarded)`.

## 7. Evidência remota e binding da baseline

O preflight read-only `0043-google-ads-metrics-currency-compatibility-preflight-read-only.sql`
foi executado no projeto `hjjlntdpdgvpnazdztqw` em 2026-08-17 e retornou
`PASS`, sem drift. Confirmou:

- tabela e coluna existentes;
- `currency_code text NOT NULL`, sem default;
- uma CHECK validada: `currency_code ~ '^[A-Z]{3}$'`;
- zero linhas na tabela e zero linhas com moeda nula;
- RLS habilitado, owner `postgres`, três policies e nenhum trigger;
- fingerprints reais de colunas não alvo, constraints, FKs, índices, RLS,
  policies, ACL, owner e triggers.

O post-verifier contém esses fingerprints reais e falhou fechado antes do apply
exclusivamente porque `target_now_nullable = false`. Após o apply manual de
2026-08-17, retornou `PASS`: `target_now_nullable = true`, tipo/default
preservados, `invariant_fingerprints_preserved = true` e
`data_delta_zero = true`.

## 8. Validação

Testes locais, com mocks e sem provider, devem cobrir:

- Historical Metrics com `currencyCode = null` persiste quando os demais dados
  de medição são válidos;
- código válido de três letras continua aceito;
- código não nulo inválido continua rejeitado pela CHECK;
- dados existentes não sofrem alteração;
- RLS, policies, ACL, FKs, índices, triggers e owner são preservados;
- o delta de dados da migration é zero;
- o mock de métricas pode representar legitimamente moeda desconhecida.

Após autorização específica, apply manual e post-verifier aprovado, um único
smoke real de Metrics pode confirmar a persistência. Este documento não
autoriza essa chamada.

## 9. Gate de aprovação

```text
METRICS_PROVIDER = PASS (evidência remota anterior; não reexecutado nesta SDD)
ROOT_CAUSE = SCHEMA_CONTRACT_INCOMPATIBLE
SCHEMA_CHANGE_REQUIRED = YES
DATA_MIGRATION_REQUIRED = NO
NEXT_MIGRATION_CANDIDATE = 0043
PROPOSED_SCHEMA_DELTA = currency_code NOT NULL -> NULLABLE
CHECK_CONSTRAINT_PRESERVED = YES
SDD = APPROVED / LOCAL PACKAGE READY
REMOTE_PREFLIGHT = PASS
REMOTE_DRIFT = NO
BASELINE_CAPTURED = YES
POST_VERIFIER_BOUND_TO_REAL_BASELINE = YES
REMOTE_APPLY = PASS (manual pelo usuário)
REMOTE_POST_VERIFIER = PASS
READBACK_DIRECT = PASS
TARGETED_TESTS = PASS (4/4)
LOCAL_POSTGRES_CONTRACT_TEST = SKIPPED_LOCAL_POSTGRES
TARGETED_LINT = PASS
GIT_DIFF_CHECK = PASS
ROLLBACK_EXECUTED = NO
OTHER_MIGRATIONS_APPLIED = 0
PROVIDER_CALLS = 0
0043_CLOSED = YES
NEXT_STEP = MASTER REFRESH MANIFEST
```
