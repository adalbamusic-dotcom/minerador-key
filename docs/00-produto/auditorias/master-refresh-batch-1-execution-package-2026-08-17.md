# Master Refresh — Pacote executável do Batch 1

- **Projeto:** `hjjlntdpdgvpnazdztqw`
- **Batch:** Gate de identidade, writers e snapshot
- **Baseline remota:** 2026-08-17-v1
- **Estado:** `REFRESH_BATCH_1_CLOSED = YES` após preflight, testes dos writers
  e post-verifier autorizados; nenhum deploy ou write remoto integrou o
  fechamento
- **Módulo proprietário:** fundação global compartilhada

## Escopo fechado

1. Preservar as quatro linhas de `auth.users`.
2. Preservar `adalbapro@gmail.com` como único Admin global atual em
   `public.perfis`.
3. Preservar o acesso de owner por `marcas.owner_user_id`, sem criar
   `brand_memberships` artificiais.
4. Cortar o writer legado de membership owner em
   `lib/server/brand-provisioning.ts`.
5. Excluir Google Ads do writer persistido
   `applyPlatformHomologationPolicy`; DataForSEO/OpenRouter continuam na
   política.
6. Congelar as allowlists aprovadas de 4 Agencies e 2 Brands nos scripts bound.

Não pertencem a este Batch: DELETE/RESET_DATA, DROP, hardening de segurança,
alinhamento editorial, remoção dos resources Google existentes, Usage ou
`migration_backup`.

## Baseline remota capturada

O preflight executado diretamente no remoto retornou `PASS`, sem mismatches:

- Auth 4; Admin aprovado 1; `perfis` 1;
- 4 Agencies e 2 Brands coincidentes por UUID e nome;
- `brand_memberships` 0 e memberships owner artificiais 0;
- `brand_roles` 1 (`owner`) — preservado neste Batch;
- Google Ads: 1 provider, 2 capabilities, 1 Connection READY, 8 grants,
  8 bindings, 2 quotas e 11 Usage;
- DataForSEO/OpenRouter: duas Connections canônicas READY com `secret_ref`;
- funções canônicas: Admin reconhecido e owner com acesso às duas Brands;
- fingerprints bound estão no preflight, post-verifier e baseline local.

Não foi encontrada divergência em relação ao manifesto atualizado pelos gates
humanos.

## Delta exato preparado

### Writer de ownership

`provisionBrandWithOwner` continua validando a identidade Auth e gravando
`marcas.owner_user_id`, mas não consulta `brand_roles` nem insere
`brand_memberships(role='owner')`. O retorno mantém `membership_id: null` para
compatibilidade explícita. A compensação continua removendo listas e Brand se
uma etapa posterior falhar.

O caminho operacional atual `createAdminBrandWithAgency` já respeitava esse
contrato; a alteração elimina o writer legado restante.

### Writer Google Ads

`applyPlatformHomologationPolicy` passa a retirar capabilities Google Ads da
lista aplicável antes de qualquer quota, grant ou binding. O resultado declara:

- `excludedCapabilities`: capabilities Google encontradas;
- `googleAdsPersistedDistribution = excluded_platform_env_only`.

Os 8 grants, 8 bindings, 2 quotas e a Connection histórica permanecem
inalterados; sua remoção pertence aos Batches 4/5.

## Artefatos

- `supabase/scripts/master-refresh-batch-1-preflight-read-only.sql`;
- `supabase/scripts/master-refresh-batch-1-post-verifier-bound-read-only.sql`;
- `supabase/baseline/master-refresh-batch-1-20260817.txt`;
- `supabase/rollback/master-refresh-batch-1-writers.rollback.md`;
- `lib/server/brand-provisioning.ts`;
- `lib/server/platform-integrations-admin.ts`;
- testes direcionados em `tests/manual-auth-admin.test.mts` e
  `tests/platform-integrations-admin.test.mts`.

Não foi criada migration: a linha Admin e os contratos remotos necessários já
estão no estado aprovado. Fabricar uma migration sem delta produziria escrita
desnecessária no ledger.

## Ordem autorizável de execução

1. Reexecutar o preflight remoto imediatamente antes do Batch e exigir PASS.
2. Confirmar os SHA-256 do código preparado contra a baseline local.
3. Executar os testes direcionados e lint.
4. Fazer deploy somente dos writers preparados, após autorização específica.
5. Não chamar a ação administrativa de homologação durante o deploy.
6. Executar o post-verifier remoto bound; exigir PASS e zero mismatch.
7. Confirmar por teste de aplicação que nova Brand usa somente
   `owner_user_id`; qualquer teste com escrita exige autorização separada e
   dados descartáveis próprios.
8. Encerrar o Batch 1 antes de preparar/executar o Batch 2.

## Rollback

Como o delta remoto esperado é zero, o rollback é redeploy do artefato anterior
seguido do mesmo verifier bound. Não existe SQL de rollback para executar.

## Validação local

- testes direcionados do delta: 3/3 PASS;
- ESLint dos dois writers: PASS;
- suite combinada dos dois arquivos: 21 PASS e 1 falha preexistente/fora do
  escopo (`OAuth Client ID` ausente no painel já modificado); a falha não toca
  os dois contratos do Batch;
- exports de Usage e `migration_backup`: existentes e todos os SHA-256 do
  manifesto continuam coincidentes.

## Saída

```text
REFRESH_BATCH_1 = Gate de identidade, writers e snapshot
BATCH_SCOPE = perfis/Admin preservado; writer owner membership cortado; writer Google persistido cortado; allowlists e baseline congeladas
REMOTE_PREFLIGHT = PASS
BASELINE_CAPTURED = YES
MIGRATIONS_OR_SCRIPTS_PREPARED = preflight read-only; post-verifier bound; baseline; rollback de aplicação
RESET_DATA_INCLUDED = NO
DROP_INCLUDED = NO
ROLLBACK_READY = YES
POST_VERIFIER_BOUND = YES
UNEXPECTED_DRIFT = NO
READY_FOR_BATCH_1_EXECUTION = YES
REMOTE_WRITES = 0
PROVIDER_CALLS = 0
NEXT_STEP = aguardar autorização para executar somente o Batch 1
```

## Fechamento autorizado

Executado em sequência após autorização explícita:

1. preflight remoto read-only: `PASS`, zero mismatches;
2. testes direcionados dos dois writers: 3/3 `PASS`;
3. post-verifier remoto bound: `PASS`, zero mismatches.

O owner writer permanece canônico no código preparado, sem membership owner
artificial. Google Ads permanece excluído da materialização comercial da
política de homologação. O readback PRE/POST confirmou zero delta remoto.

```text
BATCH_1_PREFLIGHT = PASS
BATCH_1_WRITER_TESTS = PASS
BATCH_1_POST_VERIFIER = PASS
OWNER_MEMBERSHIP_WRITER = CANONICAL
GOOGLE_ADS_DISTRIBUTION_WRITER = REMOVED_FROM_COMMERCIAL_MATERIALIZATION
REMOTE_SCHEMA_DELTA = 0
REMOTE_DATA_DELTA = 0
UNEXPECTED_REMOTE_DELTA = 0
ROLLBACK_EXECUTED = NO
OTHER_BATCH_STARTED = NO
PROVIDER_CALLS = 0
REFRESH_BATCH_1_CLOSED = YES
NEXT_STEP = preparar somente o Batch 2 do Master Refresh Manifest
```
