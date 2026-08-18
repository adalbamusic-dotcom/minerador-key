# Rollback — Master Refresh Batch 1

Este Batch não altera dados nem schema remoto. O rollback é exclusivamente de
aplicação.

## Gatilho

Executar somente se, após o deploy autorizado, houver regressão no
provisionamento de Brand ou na política administrativa de integrações.

## Procedimento

1. Reverter o deploy para o artefato imediatamente anterior ao Batch 1.
2. Não executar SQL compensatório: `perfis`, `auth.users`, grants, bindings,
   quotas e Connections não são modificados por este Batch.
3. Executar
   `supabase/scripts/master-refresh-batch-1-post-verifier-bound-read-only.sql`.
4. Exigir `post_verifier_status = PASS` e `mismatches = {}`.
5. Se o verifier divergir, parar; não corrigir nem aplicar migration
   automaticamente.

## Comportamentos revertidos pelo deploy anterior

- `provisionBrandWithOwner` volta ao comportamento anterior do artefato;
- `applyPlatformHomologationPolicy` volta ao comportamento anterior do
  artefato;
- nenhuma identidade Auth é removida e nenhum dado é reconstruído.

`ROLLBACK_REMOTE_WRITES = 0` para o próprio Batch 1.
