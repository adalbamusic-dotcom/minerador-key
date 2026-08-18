# Fase 2D — corte dos consumidores legados

**Estado:** implementado localmente; nenhuma migration, SQL remoto, deploy ou operação de Auth foi executada.

## Prova de uso zero no runtime local

| Medida | Resultado | Evidência de código |
| --- | ---: | --- |
| `user_key_runtime` | 0 | APIs de documentos e views usam `actorUserId`; repositórios usam `user_id`. |
| `perfis_marca_id_runtime` | 0 | tenant é resolvido por `brandRef → brandId`, owner UUID ou `member_user_id`. |
| `nextauth_runtime` | 0 | não há imports, handlers, `getServerSession` ou `SessionProvider` em runtime. |
| `admin_email_authorization` | 0 | Admin canônico consulta `perfis.role` pelo UUID autenticado. |
| `legacy_tenant_fallbacks` | 0 | não há fallback por e-mail, owner como tenant, slug isolado, primeira marca/agência ou armazenamento local. |
| `legacy_session_consumers` | 0 | `requireCanonicalSessionProfile` parte de `requireSupabaseUser()` e retorna somente ator UUID, papel global persistido e cliente server-side. |

Esta prova combina a regressão `tests/phase-2d-legacy-cut.test.mts` com a revisão estrutural dos resolutores, APIs e repositórios. Migrations e documentos históricos não entram na contagem de runtime.

## Matriz de consumidores

| Ocorrência | Classificação | Substituto/decisão | Pode migrar agora |
| --- | --- | --- | --- |
| antigo helper de sessão | CANONICAL_BEHIND_LEGACY_NAME | renomeado para `requireCanonicalSessionProfile`; Supabase SSR e UUID | sim |
| `safe-auth-next` | CANONICAL_BEHIND_LEGACY_NAME | `safe-auth-redirect`, somente sanitização de redirect | sim |
| preferências e estado pessoal editorial | LEGACY_ACTIVE | `user_id = auth.users.id`; ponte 0016 preparada | sim, após aplicação manual da ponte |
| `perfis.marca_id` | SAFE_TO_REMOVE_LATER | não participa de tenant nem autorização | não, remoção física posterior |
| `brand_memberships.user_key` | SAFE_TO_REMOVE_LATER | `member_user_id` é canônico; coluna fica durante a ponte | não |
| `agency_memberships.canonical_role` | CANONICAL_BEHIND_LEGACY_NAME | `role` final será `agency_admin | agency_member` | não, depende da 0016 e smoke |
| `agency_memberships.role` antigo | LEGACY_ACTIVE | backfill para os dois valores finais na 0016 | sim, manualmente |
| NextAuth no `pnpm-lock.yaml` | TEST_ONLY / FÍSICO | pacote não está no `package.json`; requer `pnpm install` manual | sim, pelo operador |
| `tests/run-all.js` | TEST_ONLY | deixou de autenticar por NextAuth; teste remoto fica opt-in | sim |
| migrations 0002/0005/0006 e scripts de auditoria | HISTORICAL_ONLY | preservados por proveniência | não |
| documentação histórica em `docs/_arquivo` | DOC_ONLY | preservada e qualificada como histórica | não |
| grants e funções do Minerador apontados como débito | SAFE_TO_REMOVE_LATER | permanece tarefa de segurança separada, sem alteração nesta fase | não |

## Transição de papel de agência

O estado final é uma única coluna: `agency_memberships.role`, com apenas `agency_admin` ou `agency_member`. A 0015 mantém `canonical_role` como espelho transitório. A `0016_legacy_identity_runtime_bridge.sql` exige coerência, registra o valor anterior em `tenant_0016_agency_role_rollback`, atualiza `role` e adiciona a constraint final. Não remove `canonical_role`; essa remoção física só pode ser proposta depois do smoke e de uma nova prova de uso zero no catálogo.

## Operação manual futura

1. Fazer snapshot novo e executar o preflight aprovado no catálogo remoto.
2. Revisar e aplicar manualmente a 0016 em transação.
3. Executar `supabase/scripts/fase-2d-legacy-identity-post-bridge-validation-read-only.sql`.
4. Fazer smoke de login, Admin, Agência, Marca e módulos editoriais.
5. Executar `pnpm install` manualmente para reconciliar o lockfile; não foi feito nesta tarefa.
6. Somente então preparar e autorizar uma migration destrutiva separada para colunas físicas.

O rollback de papel está em `supabase/scripts/fase-2d-0016-rollback.sql`. Para reverter policies/funções, usar o snapshot schema-only aprovado; não recriar autorização textual parcialmente. Se o catálogo não tiver as tabelas editoriais da 0002, a 0016 informa esse estado como ausente/não migrado e não cria nem exige essas tabelas.
