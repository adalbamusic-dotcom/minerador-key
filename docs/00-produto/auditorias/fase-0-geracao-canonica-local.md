# Fase 0 — confirmação local e preparação da auditoria remota

- **Módulo proprietário:** Arquitetura compartilhada / Auth / Admin / Agências / Marcas
- **Data:** 2026-08-06
- **Modo:** implementação controlada local
- **Operação remota nesta fase:** nenhuma

## Resultado local

**Verificado no código:** o checkout mantém dois contratos em paralelo. O contrato atual usa `auth.users.id`, `marcas.owner_user_id`, `brand_memberships.member_user_id` e `brandRef`, mas ainda consome NextAuth, e-mail, `user_key`, `perfis.marca_id`, `ADMIN_EMAIL`, roles de owner duplicadas e autorização editorial automática de Admin global.

**Preparado localmente:** a migration sucessora `0015_canonical_identity_authorization_foundation.sql`, os resolvedores UUID estritos e os testes unitários da futura autorização canônica. A SDD e a decisão humana autorizam a aplicação manual da 0015 pelo usuário, sem autorização para operação remota autônoma do agente.

**Confirmado por validação local nesta revisão:** 65 testes direcionados, `pnpm exec tsc --noEmit`, ESLint focalizado e `pnpm build` aprovados. Isso não confirma catálogo, RLS, grants, dados ou persistência remotos.

**Confirmado por evidência remota sanitizada:** snapshot lógico local concluído; `uq_agency_brands_active_brand_0014` presente e compatível; não há agências, portanto não há owner pendente; os objetos esperados da 0014 estão presentes no catálogo. O ledger `supabase_migrations.schema_migrations` não está disponível para leitura e foi aceito como `UNAVAILABLE` porque o catálogo comprovou os objetos remotos.

**Confirmado pelo parecer pré-aplicação:** integridade agregada e RLS no escopo direto da 0015 retornaram `OK`. Foram identificados 12 grants e 3 funções operacionais com endurecimento pendente, todos fora das dependências diretas e indiretas da 0015; eles formam débito de segurança obrigatório separado e não bloqueiam esta migration.

## Estado oficial dos gates

```text
PRÉ-0015

snapshot: CONCLUÍDO
index_0014: OK
agency_owner: OK
catalog_0014: OK
ledger: UNAVAILABLE_ACEITO
integridade: OK
rls_0015_scope: OK
legacy_security_debt: TAREFA_SEPARADA_OBRIGATÓRIA
migration_0015: APLICADA_E_VALIDADA
consumer_cut: PROIBIDO_ATÉ_ETAPA_DE_CORTE_APROVADA
```

A aplicação manual da 0015 foi relatada pelo usuário e validada pelo parecer pós-aplicação: schema presente, zero UUID concorrente, zero UUID de collaborator ausente, zero owner/role/link inválido, índice 0014 presente, cinco funções canônicas conformes, `anon` sem execução e `post_migration_validation: OK`. As garantias `canonical_functions_security`, `public_execute_revoked`, `authenticated_grants`, `service_role_only_operations`, `admin_without_editorial_access` e `post_migration_validation` estão aprovadas no escopo da 0015. O corte de consumidores continua proibido até etapa própria aprovada; não remover `user_key`, não alterar NextAuth ou `ADMIN_EMAIL`, não reconectar rotas e não iniciar limpeza destrutiva.

## Matriz Supabase — atual, destino e gate

| Objeto | Estado local observado | Contrato canônico | Preparação 0015 | Backfill/gate remoto | RLS e rollback |
| --- | --- | --- | --- | --- | --- |
| `perfis` | `role` é usado, mas `ADMIN_EMAIL` ainda contorna o papel; `marca_id` continua em compatibilidade. | `id = auth.users.id`; `role = admin | user`; sem tenant. | `canonical_is_platform_admin()` consulta somente UUID e `role`. | Confirmar colunas, valores, último Admin e dependências de `marca_id`. | As policies vigentes não mudam nesta fase; rollback é não aplicar 0015. |
| `marcas` | `owner_user_id` e `status` são consumidos com fallback legado em alguns caminhos. | owner autoriza somente após resolver `brandId`; owner não é tenant. | `canonical_can_access_brand()` usa owner UUID ou membership UUID. | Confirmar owner não nulo, FK e status. | Nenhuma policy ativa é substituída; a função não concede Admin editorial. |
| `brand_memberships` | `member_user_id`, `user_key`, `role_id` e role legado coexistem. | `member_user_id` é o único UUID de colaborador; owner não precisa membership. | não cria nova coluna UUID; bloqueia UUID ausente e preserva `member_user_id`. | `user_key` só sai depois de consumidores textuais zerados; não há resolução por e-mail. | Fase posterior remove somente contratos textuais; nenhuma linha é apagada em 0015. |
| `brand_roles` e permissões | catálogo/policies antigos podem incluir owner e escopo por `marca_id`. | papéis globais de marca; owner fora de membership. | preservados, sem remoção nem mudança de significado. | Confirmar finalidade, consumidores e dependência de `marca_id`. | Corte posterior precisa recriar policies por UUID e provar paridade. |
| `agencies` | 0014 local possui id, nome, slug e status, sem owner UUID. | `owner_user_id` UUID; agência não é tenant editorial. | adiciona FK/índice e aborta se qualquer owner não estiver decidido. | zero ou múltiplos `agency_admin` candidatos bloqueiam; candidato único também exige decisão humana posterior. | As policies 0014 permanecem até corte; rollback é atômico/não aplicação. |
| `agency_memberships` | UUID e status existem; roles são `agency_admin | operator | viewer`. | colaborador UUID com `agency_admin | agency_member`. | adiciona `canonical_role`, mapeando `operator/viewer` para `agency_member`. | Falha para papel fora do mapeamento; o campo definitivo será `role` depois do corte. | Não remove `role` antigo nesta fase; RLS final depende de corte aprovado. |
| `agency_brands` | 0014 local declara índice parcial de uma ativa por marca. | uma agência operacional ativa por marca. | exige e valida `uq_agency_brands_active_brand_0014`; não cria índice concorrente. | Confirmar presença/definição remota e dados; falta de vínculo é bloqueio operacional, não é preenchida automaticamente. | Não cria vínculo, não move marca, não altera owner. |
| funções/RLS/grants | `can_access_brand` e `can_access_agency` atuais incluem regras de transição. | funções canônicas separadas e sem e-mail/Admin editorial implícito. | cria cinco funções `canonical_*`; revoga `anon`/`PUBLIC` e concede apenas `authenticated`/`service_role`. | Auditar ACL, `search_path`, `SECURITY DEFINER` e policies efetivas antes de uso. | Nenhuma policy existente é removida ou trocada; corte terá migration posterior e rollback específico. |

## Auditoria remota manual pendente

Sequência obrigatória de gate, executada manualmente, sem compartilhar secrets ou e-mails:

1. [`auditoria-geracao-canonica-catalogo-read-only.sql`](../../../supabase/scripts/auditoria-geracao-canonica-catalogo-read-only.sql)
2. [`auditoria-geracao-canonica-ledger-read-only.sql`](../../../supabase/scripts/auditoria-geracao-canonica-ledger-read-only.sql), somente se o catálogo confirmar acesso ao ledger.
3. [`canonical-0015-agency-owner-preflight-read-only.sql`](../../../supabase/scripts/canonical-0015-agency-owner-preflight-read-only.sql), depois de confirmar as relações de agência.
4. As seções compatíveis de [`auditoria-geracao-canonica-integridade-read-only.sql`](../../../supabase/scripts/auditoria-geracao-canonica-integridade-read-only.sql).
5. Gerar e arquivar o snapshot aprovado (no plano Free, dump lógico local).
6. Executar o parecer único [`canonical-0015-pre-apply-verdict-read-only.sql`](../../../supabase/scripts/canonical-0015-pre-apply-verdict-read-only.sql). Ele devolve apenas os contadores e os dois gates `integridade` e `current_rls_and_grants`.
7. Fazer revisão humana explícita da 0015. Se alguma agência existente não tiver `owner_user_id`, aprovar primeiro uma migration sucessora, separada, com o mapeamento UUID decidido por humano.
8. Aplicar manualmente a 0015 apenas quando todos os gates anteriores estiverem aprovados.
9. Executar [`canonical-0015-post-apply-verdict-read-only.sql`](../../../supabase/scripts/canonical-0015-post-apply-verdict-read-only.sql) e arquivar sua única linha de resultado. O diagnóstico detalhado [`canonical-0015-post-migration-validation.sql`](../../../supabase/scripts/canonical-0015-post-migration-validation.sql) permanece disponível para investigação.

Esses são os únicos SQLs manuais preparados nesta fase: todos são somente leitura. A escrita futura é exclusivamente o conteúdo revisado de [`0015_canonical_identity_authorization_foundation.sql`](../../../supabase/migrations/0015_canonical_identity_authorization_foundation.sql), aplicada pelo usuário apenas depois do gate remoto. Nenhum script de bootstrap, demote, migration histórica ou rollback anterior deve ser reexecutado.

Depois de uma aplicação manual bem-sucedida, executar [`canonical-0015-post-apply-verdict-read-only.sql`](../../../supabase/scripts/canonical-0015-post-apply-verdict-read-only.sql). Ele confirma em uma única linha a coluna UUID única, owner de agência, papéis transitórios, índice 0014, grants e funções canônicas; não altera dados.

## Checklist de aplicação manual futura

- [x] confirmar catálogo remoto; ledger indisponível aceito pela presença dos objetos esperados;
- [ ] confirmar que 0005 e 0006 não serão reexecutadas;
- [ ] confirmar presença e contrato de 0014, ou interromper para adendo aprovado;
- [ ] corrigir manualmente qualquer membership sem UUID, sem usar e-mail como chave;
- [ ] registrar decisão humana de owner UUID para cada agência; candidato `agency_admin` não é atribuição automática;
- [x] confirmar `uq_agency_brands_active_brand_0014`; ainda confirmar que não há duas `agency_brands` ativas para uma marca;
- [x] revisar FKs, índices, RLS, grants e `SECURITY DEFINER` no escopo da 0015; os itens operacionais externos foram registrados como débito separado;
- [x] criar snapshot lógico local aprovado;
- [ ] se houver agência existente sem owner explícito, interromper: elaborar migration sucessora com mapeamento `agencyId → ownerUserId` aprovado; a 0015 não infere owner;
- [x] aplicar 0015 manualmente pelo usuário em ambiente autorizado;
- [x] executar validação pós-aplicação read-only: `post_migration_validation: OK`;
- [ ] realizar smoke autenticado de owner, colaborador, agência e Admin global em tarefa de corte aprovada;
- [ ] somente então autorizar a fase de corte dos consumidores.

## Rollback

Antes da aplicação, o rollback é não aplicar a migration. Depois de aplicação manual, não executar rollback histórico. A reversão deve ser uma migration sucessora aprovada, baseada no snapshot e no catálogo efetivamente retornados. Não remover `user_key`, `member_user_id`, `canonical_role`, policies antigas, dados, owners, memberships ou vínculos de agência nesta fase.
## Fase 2A — reconexão de consumidores — 2026-08-06

### Smoke de roteamento — correção local 2026-08-06

- A seleção não transforma uma negação inicial em acesso por escolha automática. Quando o shell precisar revalidar `BRAND_ACCESS_DENIED`, ele encaminha somente o `brandRef` solicitado; a seleção mantém estado neutro e consulta o resolvedor canônico com a permissão de módulo correspondente.
- O retorno automático é permitido apenas para aquela mesma marca confirmada. Sem ela, a tela encerra em acesso negado; não usa localStorage, primeira marca, agência ou contexto anterior.
- `/admin` exige exclusivamente `perfis.role = 'admin'` no consumidor migrado. Sem esse papel, renderiza acesso global indisponível e uma ação explícita para a seleção de marca; não há redirecionamento silencioso para uma agência, marca ou `/`.
- A área própria da agência não foi criada. Google Ads e demais providers permanecem fora deste escopo. Homologação manual autenticada continua pendente e não houve operação remota.

### Persistência de shell — correção local 2026-08-06

- O shell do tenant não é desmontado por uma `key` de marca. O layout mantém a validação server-side estrita de `brandRef`, actor, owner ou membership e permissões antes de atualizar a rota.
- O boundary de carregamento fica no conteúdo de `/{brandRef}`. O painel lateral permanece e a marca ativa continua sendo derivada do `brandRef`; estado local só permanece como compatibilidade de rotas legadas, nunca como autorização.
- Ao alternar marca, `switchTenantPath` mantém o módulo equivalente. O bloqueio da rota de destino continua server-side e não é convertido em redirecionamento para outro módulo.

- **Conectado localmente:** seleção de marca, shell de `brandRef`, página raiz de Marca, Conta contextual e Administração global agora chamam o adaptador canônico. O bridge de sessão obtém somente o UUID de NextAuth e o revalida em `auth.users`; as decisões seguem `perfis.role`, `owner_user_id`, `member_user_id` e permissões persistidas.
- **Mantido fora da fatia:** os módulos editoriais continuam nos helpers legados. Não houve migração de `agency-context`, nem atribuição de owner/membership de agência.
- **Estados preparados:** carregando, sem marca, sem permissão, marca inativa, contexto inválido e erro remoto recebem mensagens explícitas; nenhuma preferência local concede acesso ou substitui a confirmação server-side.
- **Pendente:** smoke autenticado e expansão gradual após as evidências manuais. Esta reconexão não autoriza remover NextAuth, `ADMIN_EMAIL`, `user_key`, `perfis.marca_id`, contratos legados ou débito de segurança fora do escopo da 0015.
