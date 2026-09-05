# Master Refresh Batch 5 — pacote de execução

Módulo proprietário: fundação global / Supabase. Estado: preparado, não executado.

O remoto foi lido diretamente no projeto `hjjlntdpdgvpnazdztqw`. A allowlist contém somente quatro Agencies e duas Brands aprovadas. Nenhuma Connection canônica tem `owner_agency_id` ou `owner_brand_id` nesses tenants. DataForSEO e OpenRouter continuam Connections de plataforma com secret correspondente no Vault. O reset não contém DELETE para Connections, Vault, providers, capabilities, quotas de plataforma, `perfis` ou `auth.users`.

## Baseline bound

- Agencies: 4; Brands: 2; memberships de Agency: 4; vínculos Agency/Brand: 2.
- Applications: 1; invitations: 3 de 4; token generations: 3 de 4; messages: 7 de 8; access periods: 4; onboardings: 3.
- Grants: 12; bindings: 12; quotas tenantizadas: 0.
- Usage homologação: 22/22, fingerprint remoto MD5 `ce3174ca2afe39b352ae704c6f96153c`.
- Export sanitizado aprovado: 22 linhas; SHA-256 `b4239c81455e8d90b08e96e0e6a2840218d37fcb7f16f3c5d7f85ed72266df70`.
- Keywords: 17; runs: 20; candidates: 714; import batches: 10; origins: 20; current metrics: 183; metric history: 3.
- Pipeline editorial canônico: zero linhas tenantizadas no baseline; schema preservado.
- `auth.users`: 4; `adalbapro@gmail.com`: Auth presente e `perfis.role=admin`.
- Connections: 3; Vault catalog: 4. Fingerprint estrutural canônico: 1.368 definições, MD5 `f058b86b56e6d99ab24dac967241c221`.

## Execução e recovery

Ordem: Usage allowlisted; comunicação; convites/onboarding/acesso; bindings/grants; dados editoriais se presentes no baseline; origens e métricas; candidates/batches/runs/keywords/listas; permissões/memberships/vínculos; Brands; Agencies. Todas as FKs, RLS e triggers permanecem habilitadas.

Usage e Discovery runs possuem proteção contra DELETE. O script troca as duas funções somente dentro da mesma transação, limita a exceção aos IDs aprovados por um GUC local e restaura os corpos originais byte a byte antes do commit. Como DDL transacional não fica visível a outras sessões antes do commit e a definição original é restaurada antes dele, não existe janela remota persistida de proteção enfraquecida.

`ROLLBACK_MODE = RESTORE_FROM_VERIFIED_EXPORT`. O rollback automático protege falhas durante a transação. Depois de commit, recuperação exige o export integral produzido por `master-refresh-batch-5-tenant-reset-export-read-only.sql`, salvo localmente, legível, com contagens/fingerprints coincidentes e SHA-256 registrado. O export sanitizado de Usage é evidência de aprovação, mas não restaura linhas completas. Portanto o gate de execução exige capturar esse export integral imediatamente antes do reset.

Arquivos:

- preflight bound: `supabase/scripts/master-refresh-batch-5-tenant-reset-preflight-bound-read-only.sql`;
- export de recovery: `supabase/scripts/master-refresh-batch-5-tenant-reset-export-read-only.sql`;
- reset: `supabase/scripts/master-refresh-batch-5-tenant-reset.sql`;
- post-verifier: `supabase/scripts/master-refresh-batch-5-tenant-reset-post-verifier-bound-read-only.sql`;
- teste de contrato: `tests/master-refresh-batch-5-tenant-reset.test.mts`.

## Execução remota e fechamento

Executado no projeto `hjjlntdpdgvpnazdztqw` em 2026-08-17/18, após autorização explícita:

- export integral read-only salvo em `exports/master-refresh-batch-5-2026-08-17/recovery-export.json`;
- tamanho: 1.693.059 bytes;
- SHA-256: `df706eb1d08dc5daddaf0b753eec24de5e8063c143f1f48d6cf0fb1e896743d3`;
- preflight bound: PASS, sem divergência de contagem ou preservação;
- reset transacional: PASS;
- primeira execução do post-verifier não avaliou invariantes por incompatibilidade local de tipos no `UNION` editorial (`text` versus `uuid`); o verifier read-only recebeu somente casts `::text` equivalentes e foi repetido;
- post-verifier corrigido: PASS, zero checks falhos;
- target tenants, Usage e dados tenantizados: zero;
- Admin global, quatro Auth users, três Connections, DataForSEO, OpenRouter e quatro secrets: preservados;
- fingerprints de dados não alvo e catálogo estrutural: preservados;
- funções temporariamente substituídas: corpos e fingerprints originais restaurados;
- restore: não executado.

`REFRESH_BATCH_5_CLOSED = YES`.
