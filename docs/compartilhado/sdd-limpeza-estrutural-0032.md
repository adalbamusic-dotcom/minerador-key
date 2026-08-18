# SDD — Limpeza estrutural pós-reset 0032

**Módulo proprietário:** Infraestrutura compartilhada / Banco canônico
**Status:** Proposto; aplicação remota relatada, sem reabrir a autorização
**Implementação:** migration 0032 aplicada remotamente conforme relato do usuário
**Operações remotas nesta correção:** nenhuma

## 1. Problema

Após o development reset e a remoção local do runtime de recovery/rebaseline,
permanecem no schema objetos estruturais exclusivos de 0016/0030. Eles não
representam entidades do produto atual e não possuem consumidor runtime
confirmado.

## 2. Evidência e escopo

O targeted preflight remoto read-only confirmou `STRUCTURAL_CLEANUP_DECISION =
DROP_SAFE`, tabelas vazias, ausência de dependências externas bloqueadoras e
identidade real da trigger truncada pelo limite de identificador do PostgreSQL.

Serão removidos somente:

- `public.brand_exceptional_operation_execution_events`;
- `public.brand_exceptional_operation_grants`;
- `public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)`;
- `brand_exceptional_operation_execution_events_append_only_trg_00`;
- `public.tenant_0016_agency_role_rollback`.

A ordem é trigger → tabela de eventos → helper → tabela de grants → tabela de
rollback. A migration não usa `CASCADE` e não edita as migrations históricas.

## 3. Preservação obrigatória

`public.pipeline_editorial_protect_append_only()` permanece. Também permanecem
seus consumidores canônicos:

- `content_document_versions_append_only_trg`;
- `editorial_artifact_versions_append_only_trg`;
- `editorial_serp_reviews_append_only_trg`;
- `editorial_serp_snapshots_append_only_trg`.

Permanecem intactos os contratos de identidade/tenant, Agency, Brand, Minerador,
workflow editorial, artefatos, SERP, documentos, publicações, RLS, policies,
ACLs e as estruturas editoriais canônicas.

## 4. Riscos e gates

Riscos principais: drift entre o preflight e a aplicação, dependência externa
criada no intervalo, trigger com nome diferente, ou alteração acidental em
estrutura preservada. A aplicação exige, na mesma revisão manual:

1. preflight 0032 com todas as tabelas presentes e vazias;
2. zero dependentes externos dos candidatos;
3. trigger real com nome, função e eventos esperados;
4. quatro consumidores externos da função append-only compartilhada;
5. snapshot/fingerprint das estruturas preservadas;
6. aplicação da migration;
7. post-verifier sem objetos candidatos e com fingerprint preservado ou com
   lacuna de evidência explicitamente registrada.

## 5. Rollback

O rollback local recria somente o schema vazio necessário das migrations
históricas 0016/0030, incluindo constraints, índices, RLS, ACLs, helper e a
trigger com o identificador real de 63 caracteres. Ele não restaura dados
históricos, grants, eventos ou linhas de rollback. Não é executável
automaticamente e exige novo snapshot, decisão humana e revisão do catálogo.

## 6. Artefatos

- migration: `supabase/migrations/0032_structural_legacy_cleanup.sql`;
- preflight: `supabase/scripts/structural-cleanup-0032-preflight-read-only.sql`;
- post-verifier: `supabase/scripts/structural-cleanup-0032-post-verification-read-only.sql`;
- rollback local: `supabase/scripts/0032_structural_legacy_cleanup-rollback.sql`.

## 7. Gate

`0030 runtime/schema = REMOVED`
`0016 rollback table = REMOVED`
`TARGET_REMOVAL = PASS`
`PRESERVED_OBJECT_CHECKS = PASS`
`SHARED_APPEND_ONLY = PASS`
`PRE_APPLY_FINGERPRINT = NOT_CAPTURED`
`STRUCTURAL_CLEANUP_0032 = PASS_WITH_DOCUMENTED_FINGERPRINT_EVIDENCE_GAP`

Esta SDD não reabre a arquitetura de recovery nem autoriza novas operações
excepcionais. Não há ação corretiva remota autorizada; o post-verifier v3
torna a lacuna de fingerprint explícita e não referencia diretamente objetos
removidos.
