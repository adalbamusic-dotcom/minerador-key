# Matriz de consumidores legados — Fase 0

**Fonte:** busca local em código, migrations, scripts e testes em 2026-08-06. Esta matriz não confirma banco remoto e não autoriza corte.

| Contrato | Consumidores localizados | Classificação e plano |
| --- | --- | --- |
| NextAuth e `getServerSession` | `app/api/auth/[...nextauth]/route.ts`, `app/api/mine/route.ts`, `lib/server/authz.ts`, `lib/auth/supabase-token.ts`, `lib/server/structured-ai.ts`, `lib/supabase/browser-authenticated-client.ts`, `components/providers.tsx`, `components/product-shell.tsx`, `components/brand-context.tsx`, login, seleção de marca, módulos de produto e testes de auth/Conta. | **Legado ativo.** Não remover na Fase 1. Migrar cada consumidor para Supabase SSR; `/api/mine` é bloqueador por token Google no JWT. |
| Tokens Google na sessão | rota NextAuth, `/api/mine`, `lib/server/supabase-auth-tokens.ts`, `lib/auth/supabase-token.ts`, testes de ciclo JWT. | **Bloqueador de corte.** Google Sheets deve receber integração server-side própria ou a rota deve ser desativada por tarefa aprovada. Token operacional não pode seguir ao cliente. |
| `ADMIN_EMAIL` | `lib/server/authz.ts`, `lib/server/global-user-admin.ts`, `.env.example`, `supabase/config.toml`, scripts de demote/bootstrap e testes. | **Legado perigoso.** Fonte final é `perfis.role`; retirar apenas depois de provar dois Admins e o acesso do Admin operacional. |
| `perfis.marca_id` e `brandUserId` | `lib/server/authz.ts`, `lib/server/tenant-context.ts`, `components/brand-context.tsx`, contratos e testes tenant. | **Compatibilidade temporária.** Trocar por `brandId` de rota e actor UUID; sem fallback de primeira marca ou seleção local. |
| `brand_memberships.user_key` | `authz`, `tenant-context`, `brand-provisioning`, `editorial-authorization`, `editorial-repositories`, 0002/0005/0006, dry-runs e testes. | **Legado ativo.** `member_user_id` permanece a única coluna UUID; a remoção de `user_key` exige corte de autorização/editorial. |
| owner duplicado em membership | `brand-provisioning`, `tenant-context`, `editorial-authorization`, Conta/Marca, 0002/0005/0006 e scripts de validação. | **Redundância a confirmar.** 0015 autoriza owner diretamente e preserva linhas existentes; limpeza posterior após catálogo e uso zero. |
| `brand_roles` e permissões editoriais | `brand-provisioning`, `tenant-context`, `editorial-authorization`, `editorial-repositories`, 0002/0005/0006 e testes. | **Contrato híbrido.** Não mudar em 0015; separar papel de collaborator de owner na fase de corte. |
| resolução por slug/fallback tenant | `app/(brand)/[brandRef]/layout.tsx`, `components/brand-context.tsx`, `lib/server/tenant-context.ts`, `lib/tenant-routing.ts`, `lib/radar/route-resolution.ts`, testes tenant/navegação. | **Legado ativo.** Novo resolvedor só aceita `slug--UUID`, busca por ID e confere slug; ainda não está conectado às rotas. |
| agências 0014 | `lib/server/agency-context.ts`, `lib/server/agency-admin.ts`, `lib/server/global-user-admin.ts`, APIs Admin, scripts de agência e testes. | **Fundação não homologada.** 0015 acrescenta owner/canonical role, mas exige decisão humana de owner e validação do índice 0014; não altera consumidores nem vínculos existentes. |
| Serper | `lib/radar/serper-provider*.ts`, rotas SERP, Radar, Arquiteto, testes e documentos históricos. | **Resíduo inválido.** Nenhum adapter, fallback, migration ou chamada foi criada nesta fase. Remoção fica bloqueada pelo gate próprio de paridade. |
| RapidAPI | documentos legados, `docs/scratch/legacy/test-external-apis.js` e testes históricos. | **Resíduo inválido.** Nenhum adapter, fallback, migration ou chamada foi criada nesta fase. |
| Extensão | arquivos e testes próprios do Minerador, além de documentos de migração. | **Gate separado.** Não foi alterada nem classificada como dependência de Serper/RapidAPI. |

## Guardrail adicionado

`tests/canonical-identity-authorization.test.mts` impede que a migration 0015 ou o adaptador novo introduzam `ADMIN_EMAIL`, e-mail, `user_key`, `getServerSession`, NextAuth ou tokens operacionais no contrato canônico preparado.
## Atualização da Fase 2A — 2026-08-06

### Guardrail do smoke de roteamento — 2026-08-06

| Situação | Contrato aplicado | Limite |
| --- | --- | --- |
| `BRAND_ACCESS_DENIED` inicial | estado neutro seguido de reconsulta canônica da mesma marca e do módulo solicitado | sem confirmação, a negação permanece; não há seleção local nem primeira marca. |
| `/admin` sem papel global | tela explícita de administração global indisponível | não redireciona para `/`, marca ou agência; a área da agência ainda não foi consolidada. |
| providers | Google Ads permanece em pendência própria | nenhum provider, credencial ou fluxo externo foi alterado. |

| Persistência do shell | `ProductShell` não recebe mais `key` por `brandId`; `loading.tsx` fica abaixo do layout tenantizado. | a autorização permanece server-side; não usar contexto local para antecipar a marca de destino. |
| Troca de marca | `switchTenantPath` preserva o módulo atual quando a rota equivalente existe. | ausência de acesso deve ser bloqueada na rota solicitada, sem redirecionar para outro módulo. |

| Contrato | Consumidores migrados | Remanescentes e limite |
| --- | --- | --- |
| `brandRef` e autorização de marca | `/selecionar-marca`, shell `/{brandRef}`, raiz de Marca e Conta usam UUID, slug conferido, owner UUID, membership UUID ativa e permissões. | Rotas editoriais ainda chamam `requireTenantModule`; não houve corte nem fallback novo. |
| papel global | layout e APIs de `/admin`, usuários, owners, marcas e agências exigem `requireCanonicalPlatformAdmin()`. | `lib/server/authz.ts` e demais consumidores legados ainda têm `ADMIN_EMAIL`; a variável não foi removida nesta fase. |
| NextAuth | bridge server-side só extrai/revalida o UUID para consumidores migrados. | providers, cookies, rota NextAuth, `/api/mine` e consumidores editoriais seguem ativos. |
| `user_key` / `perfis.marca_id` | não participam das decisões da Fase 2A. | persistem nos helpers e fluxos editoriais legados até corte aprovado e uso zero comprovado. |
## Atualização da Fase 2B — 2026-08-06

| Contrato | Consumidores migrados | Remanescentes e limite |
| --- | --- | --- |
| Conta pessoal | `/conta`, `PersonalAccountPage` e `getCanonicalPersonalAccount()` usam UUID autenticado revalidado e listagens canônicas de contextos. | `/{brandRef}/conta` permanece apenas como handoff para `/conta`; a interface antiga de Conta não é removida nesta fatia. |
| `agencyRef` e autorização operacional | layout e quatro rotas `/agencias/{agencyRef}` conferem `slug--UUID`, owner ou membership ativa. | `lib/server/agency-context.ts` e administração global legada não foram cortados. Admin global não recebe contexto de agência por efeito colateral. |
| Marca vinculada à agência | workspace lista vínculo operacional e só cria link para Marca quando há acesso editorial individual confirmado. | membership de agência continua diferente de membership de marca; não houve alteração editorial. |
