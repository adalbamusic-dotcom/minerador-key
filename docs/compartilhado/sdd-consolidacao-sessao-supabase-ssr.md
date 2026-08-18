# SDD — Consolidação da sessão Supabase SSR

## Escopo aprovado — fase preparatória

Supabase Auth passa a possuir infraestrutura SSR local, sem retirar NextAuth/Auth.js nesta fase e sem ativar Google. A identidade canônica continua `auth.users.id`; login não cria perfil, Admin, owner, agência, membership ou tenant.

## Inventário de consumidores atuais

- **Sessão browser:** `components/providers.tsx` mantém `SessionProvider`; `components/brand-context.tsx`, `components/product-shell.tsx`, `app/page.tsx`, `app/selecionar-marca/select-brand-client.tsx`, Conta, Marca, Minerador, Arquiteto, Radar, Planejador, Redator e Publicações usam `useSession`/`signOut`.
- **Sessão server-side:** `lib/server/authz.ts` usa `getServerSession(authOptions)` e fornece `requireSessionProfile`; layouts Admin e tenant, `TenantContext`, `AgencyContext` e os Route Handlers privados dependem dele.
- **JWT e callbacks:** `app/api/auth/[...nextauth]/route.ts` mantém Credentials, callback JWT/session e a ponte atual de token Supabase. `lib/supabase/browser-authenticated-client.ts` ainda consome `getSession()` do NextAuth.
- **Configuração e testes:** `ADMIN_EMAIL` ainda é consumido por `lib/server/authz.ts` e `lib/server/global-user-admin.ts`; `TEST_AUTH_EMAIL`/senha são usados somente por `tests/run-all.js`. Ambos permanecem fora da mudança.
- **Banco:** RLS resolve `auth.uid()` por UUID Supabase. A ponte NextAuth atual já armazena esse UUID em `session.user.id`; nenhum e-mail é convertido em tenant.

## Implementação desta fase

- `lib/supabase/browser-client.ts`: cliente browser único com cookies Supabase.
- `lib/supabase/server-client.ts`: cliente server com adaptador assíncrono de cookies do Next.js 16.
- `lib/supabase/session-proxy.ts` e `proxy.ts`: atualizam cookies nativos sem decidir autorização nem redirecionar usuário por identidade.
- `lib/server/supabase-session.ts`: helpers de usuário e claims autenticados por `auth.getUser()`/`getClaims()`.
- `app/auth/callback/route.ts`: troca PKCE de `code`, valida `next` local e redireciona sem registrar tokens.
- `app/auth/confirm/route.ts`: confirma links administrativos por `token_hash`/`type` com `verifyOtp`, cliente SSR e cookies de sessão; aceita somente `signup`, `magiclink`, `recovery` e `invite`.
- Links gerados por `auth.admin.generateLink` não são tratados como PKCE: o callback `/auth/callback` permanece reservado a fluxos que realmente retornam `code` compatível com `code_verifier`.
- `app/auth/signout/route.ts`: encerra a sessão Supabase via POST. Nenhuma tela aponta para ele ainda.
- `components/auth/google-oauth-button.tsx` e `lib/auth/google-oauth.ts`: preparados e não renderizados enquanto `GOOGLE_LOGIN_ENABLED=false`.

## Coexistência temporária

NextAuth continua sendo a fonte de sessão operacional para todos os consumidores existentes. Cookies Supabase SSR existem para callback, refresh e futura migração, mas não concedem acesso a layouts, APIs, Admin, TenantContext ou AgencyContext nesta fase. Isso impede duplicação de identidade e evita uma migração parcial de autorização.

## Corte futuro

1. Migrar login manual para `signInWithPassword` e cadastro para cliente SSR, com smoke test.
2. Adaptar `requireSessionProfile` para validar `requireSupabaseUser` e preservar UUID/role/tenant.
3. Migrar `BrandProvider`, shell e módulos clientes para um provider Supabase compatível.
4. Migrar handlers e layouts privados, validar Admin, agência, Adalba, Lindisse, colaborador e usuário sem acesso.
5. Configurar Google manualmente, habilitar a flag e realizar smoke OAuth.
6. Somente então remover NextAuth, seus cookies, callbacks e consumidores.

## Riscos, rollback e operações manuais

O principal risco é uma sessão SSR existir antes de os consumidores NextAuth terem sido migrados; por isso Google permanece desativado. Rollback local: remover apenas os novos clientes, callback, signout e refresh no proxy, preservando NextAuth e banco. Não há rollback de banco.

Antes do smoke Google, o operador deve confirmar o provider no Supabase, o callback Google Cloud `https://hjjlntdpdgvpnazdztqw.supabase.co/auth/v1/callback`, a Redirect URL local `http://localhost:3000/auth/callback`, a URL hospedada real e `GOOGLE_LOGIN_ENABLED=true` somente em ambiente controlado.

## Adendo aprovado — Fase 2C, 2026-08-06

A Fase 2C substitui a coexistência operacional deste documento: Supabase Auth SSR é a sessão utilizada por login, cadastro, layouts, shells, Route Handlers e guards. A rota e a dependência direta de NextAuth foram removidas localmente; o `pnpm-lock.yaml` só será reconciliado pelo operador com `pnpm install`.

Não há autorização editorial por papel global, e-mail, `ADMIN_EMAIL`, `user_key`, `perfis.marca_id`, localStorage ou primeiro contexto. A remoção física de campos e dados históricos continua dependente de prova de uso zero, snapshot e operação remota manual. Google permanece desativado e não recebeu smoke real.
