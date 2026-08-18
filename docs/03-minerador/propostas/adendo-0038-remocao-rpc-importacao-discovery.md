# Adendo estrutural 0038 — remoção da RPC legada de importação da Descoberta

- **Módulo proprietário:** Minerador
- **Tipo:** decisão estrutural e gate de aplicação manual
- **Migration:** `supabase/migrations/0038_remove_legacy_minerador_discovery_import_rpc.sql`
- **Status:** aprovado para aplicação manual remota
- **Operação remota do agente:** `NONE`

## Problema

Existe a RPC legada:

```text
public.import_minerador_discovery_candidates(uuid, uuid, uuid, uuid[])
```

Ela é `SECURITY DEFINER`, recebe `p_actor_user_id` e não comprova a igualdade
com `auth.uid()`. A superfície de actor spoofing foi confirmada. Não há
consumidor produtivo conhecido que justifique manter ou endurecer essa API.

## Decisão

Autorizar a remoção definitiva da assinatura exata acima por meio da migration
0038, usando somente:

```sql
DROP FUNCTION public.import_minerador_discovery_candidates(
  uuid, uuid, uuid, uuid[]
);
```

A operação é sem `CASCADE`. Qualquer dependência inesperada deve interromper a
operação no banco, sem remoção implícita de outro objeto.

A migration 0038 permanece sem alteração neste adendo. Migrations históricas
0010, 0011 e 0012 continuam imutáveis e são apenas histórico da RPC.

## Consumidores e evidência

```text
RUNTIME_CONSUMERS = 0
DATABASE_CALLERS = 0
TRIGGERS = 0
VIEWS = 0

PRECHECK_GATE = PASS
TARGET_FUNCTION_PRESENT = PASS
TARGET_FUNCTION_SIGNATURE = PASS
DATABASE_DEPENDENCIES = 0
FUNCTION_SOURCE_CALLERS = 0
TRIGGER_CALLERS = 0
VIEW_SOURCE_CALLERS = 0
PRESERVED_RELATIONS = 9/9
PRESERVED_ROUTINES = 6/6
```

Referências em migrations, testes de não utilização, documentação histórica e
artefatos de auditoria não são consumidores ativos.

## Substituto canônico

O fluxo produtivo atual é:

```text
rota protegida e authz
  → importKeywordsWithCore
  → minerador_keywords
  → origins / batches / candidate links / metrics
```

Esse fluxo preserva autenticação, resolução de `brandId`, `actorUserId`,
idempotência por lote/request, deduplicação, proveniência, vínculo da
candidata, métricas e isolamento por marca. A remoção da RPC não remove esses
contratos nem altera a rota atual.

## Riscos e mitigação

Risco residual: existir consumidor externo não conhecido pelo repositório.

Mitigações obrigatórias:

- preflight read-only de presença, assinatura, `pg_depend`, funções, triggers,
  views e ACLs;
- aplicação somente da 0038, sem `CASCADE`;
- post-verifier confirmando ausência da função;
- comparação dos data counts e fingerprints capturados no preflight;
- confirmação da integridade das nove relações e seis rotinas preservadas.

Os valores concretos de data counts e fingerprints devem ser obtidos da mesma
execução aprovada do preflight e colados no post-verifier. Este adendo não
inventa nem substitui essa evidência.

## Rollback

Existe rollback técnico local em:

`supabase/scripts/0038-legacy-minerador-discovery-import-rollback.sql`

A recriação deve usar a definição exata capturada pelo preflight, com revisão
de owner, `SECURITY DEFINER`, `search_path` e ACL. O rollback é somente para
incidente confirmado, não é automático e reabre a superfície de actor spoofing;
não constitui estratégia de hardening.

## Testes locais

```text
Discovery/Core: 12 PASS
TypeScript: PASS
Build: PASS
Lint: 0 erros
git diff --check: PASS
```

## Aceite remoto e limites

O responsável humano deve:

1. aplicar somente `0038_remove_legacy_minerador_discovery_import_rpc.sql`;
2. executar o post-verifier read-only;
3. confirmar a ausência da função;
4. confirmar relações e rotinas preservadas;
5. confirmar data counts e fingerprints iguais aos capturados no preflight;
6. confirmar que nenhuma operação `CASCADE` foi usada.

```text
0038_STRUCTURAL_DECISION = APPROVED_FOR_MANUAL_REMOTE_APPLY
MIGRATION_UNCHANGED = YES
REMOTE_OPERATION = NONE
```

Este adendo não autoriza execução remota pelo agente, hardening da RPC,
alteração de runtime, atualização de `estado-atual.md` ou `backlog.md`,
commit, push ou deploy.
