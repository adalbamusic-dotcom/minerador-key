# Autenticacao e permissoes

Sessao e validada no servidor. Proprietario legado, membership ativa e Admin global sao caminhos distintos; interface oculta modulos sem permissao, mas APIs e RLS sao a fronteira obrigatoria. Membership suspensa, convite pendente ou tenant divergente nao concedem acesso.

## Identidades canônicas

- `auth.users.id` identifica o usuário autenticado.
- `public.marcas.id` é `brandId`, o tenant.
- `public.marcas.owner_user_id` identifica o owner da marca.
- `public.brand_memberships.member_user_id` identifica o membro da marca.
- `auth.uid()` identifica o ator corrente dentro do banco.

`public.perfis` não representa necessariamente todas as contas Auth. Pode conter papéis globais, e um Admin global pode permanecer com `marca_id = null`. Owner, membro, ator e tenant não são intercambiáveis.

## Fronteiras de autorização

`resolveTenantContext`/`requireTenantPermission` resolvem sessão, marca ativa, status, owner, membership, papel e ação solicitada. A URL não é autoridade sozinha; `brandId` no body, cache, provider ou extensão deve coincidir com o tenant autorizado. O servidor revalida o owner selecionado e a Extensão recebe somente marcas/capacidades autorizadas.

Usuários Auth são pesquisados somente por endpoint server-side (`app/api/admin/owners`). O retorno é mínimo e não contém segredo. A criação de marca ocorre server-side, associa `owner_user_id`, cria membership owner ativa e só anuncia sucesso após confirmar consistência; falha posterior exige compensação e não pode virar falso sucesso.

## Supabase e sessão atual

O Supabase Auth é a decisão aprovada para a arquitetura futura (`signUp`, `signInWithPassword`, `signOut`, `auth.uid()`), mas a consolidação ainda está pendente. Cadastro manual já cria somente a identidade e informa associação/convite pendente; não cria marca nem membership automaticamente. Google OAuth está suspenso e Google Sheets permanece separado do login.

NextAuth/Auth.js ainda possui consumidores ativos e funciona como ponte atual para sessão do navegador e `session.accessToken` Supabase. A retirada controlada, `@supabase/ssr`, cookies nativos, atualização dos consumidores e smoke test completo permanecem pendentes. `service_role` somente pode existir no servidor; nunca no navegador ou na Extensão.

## Fase preparatória Supabase SSR — 2026-08-05

`@supabase/ssr` está instalado e a infraestrutura local cria clientes browser/server, refresh de cookies no `proxy.ts`, callback PKCE seguro, helper de usuário/claims e logout Supabase. NextAuth ainda é a sessão operacional de todos os consumidores privados; cookies SSR não concedem acesso por si só. Google permanece desativado e seu botão não é renderizado até o smoke completo. Ver `docs/compartilhado/sdd-consolidacao-sessao-supabase-ssr.md`.

## Fase 2C — corte local de sessão e acesso — 2026-08-06

Supabase Auth SSR passou a ser a sessão local operacional. `auth.users.id` é resolvido no servidor; `perfis.role = 'admin'` abre somente a Administração global. Uma marca exige owner em `marcas.owner_user_id` ou `brand_memberships.member_user_id` ativo, além da permissão solicitada. Admin global e membership de agência não produzem acesso editorial por inferência.

`user_key`, `perfis.marca_id` e campos de estado editorial históricos ainda podem existir fisicamente, mas não são fallback de autorização. Sua retirada exige auditoria de consumidores, snapshot e operação remota manual posterior.

## RLS, roles e permissões

No SQL local, `is_global_admin`, `can_access_brand`, `can_manage_brand`, `can_access_list` e `tenant_actor_has_permission` separam papel global, acesso ao tenant, gestão da marca e ação granular. `brand_roles` diferencia papéis globais (`marca_id` nulo) de papéis por marca; `brand_member_permissions` registra `membership_id + module + action + granted`. `authenticated` opera sob RLS; `anon` não recebe acesso às tabelas privadas nem execução das funções tenantizadas; `service_role` é reservado ao servidor. A compatibilidade legada por `user_key`/e-mail permanece explicitamente identificada no código e no SQL, não é a identidade canônica.

## Correção dos gates globais — 2026-08-17

- **Verificado no código:** `/admin`, `/conta`, `/selecionar-marca` e as rotas tenantizadas redirecionam sessões ausentes ou inválidas para `/login` com `callbackUrl` seguro.
- **Verificado no código:** `authzErrorResponse` converte `SupabaseSessionError` em HTTP `401`; APIs privadas não tratam ausência de sessão como erro interno `500`.
- **Confirmado por teste:** suite focada de Auth/tenant passou `25/25`; smoke HTTP local sem cookies confirmou `307` em `/admin`, `/conta`, `/selecionar-marca` e uma rota tenantizada, além de `401` em `/api/marcas?scope=operational`.
- **Limitação:** não houve login autenticado real, alteração remota, migration, RLS, deploy ou validação de produção nesta tarefa.
