# SDD — compatibilidade de timezone das medições históricas Google Ads

- **Status:** APPROVED / LOCAL PACKAGE IN PREPARATION; apply remoto não autorizado
- **Módulo proprietário:** Minerador → Google Ads Historical Metrics
- **Data:** 2026-08-18
- **Migration candidata:** `0044_google_ads_metrics_time_zone_compatibility.sql`

## Decisão

`GoogleAdsKeywordAccount.timeZone` e a medição normalizada usam `string | null`.
`GenerateKeywordHistoricalMetrics` não retorna timezone, e o runtime canônico
não executa o lookup opcional de metadata do Customer por `SearchStream`.
Nenhum consumidor atual exige uma string e a tabela remota estava vazia no
diagnóstico bound. Portanto, o contrato canônico é `NULLABLE`.

O único delta autorizado no pacote local é:

```sql
ALTER TABLE public.minerador_keyword_metric_measurements
  ALTER COLUMN time_zone DROP NOT NULL;
```

Tipo, default, constraints, FKs, índices, triggers, RLS, policies, ACL, owner,
demais colunas e dados devem permanecer idênticos. Não há backfill nem default.

## Consumidores e compatibilidade

A rota `metricas-keywords` grava o valor normalizado, inclusive `null`. As
projeções do Minerador usam timezone apenas como metadata opcional; volume,
competição, CPC, autorização e tenantização não dependem dele. `currency_code`
permanece congelado no estado encerrado pela 0043.

## Rollback e verificação

O rollback restaura `NOT NULL` somente quando não existir linha com
`time_zone IS NULL`; caso contrário, aborta sem reescrever dados. O preflight
captura a baseline remota e o post-verifier compara estrutura não alvo e dados
por fingerprints. O preflight remoto read-only de 2026-08-18 retornou `PASS`,
confirmou zero linhas e vinculou os fingerprints reais no post-verifier. Apply
e rollback remotos exigem autorização separada.

## Fora de escopo

Não alterar provider, ENV, Research Customer, SearchStream, DataForSEO,
OpenRouter, Discovery schema, outros módulos ou qualquer outro campo da tabela.
