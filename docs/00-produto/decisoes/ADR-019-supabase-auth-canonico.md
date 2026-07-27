# ADR-019 — Supabase Auth como autenticação canônica

## Status

Proposta autorizada localmente em 2026-07-26; implementação bloqueada até a instalação manual de @supabase/ssr e validação local subsequente. Nenhuma remoção do NextAuth foi feita nesta etapa.

> **Estado vigente — 2026-07-27:** cadastro manual e login manual continuam operacionais; Google OAuth está suspenso; NextAuth/Auth.js ainda possui consumidores; Google Sheets permanece separado. Supabase Auth é a decisão aprovada para convergência, não a arquitetura já consolidada. Não instalar dependências nem retirar NextAuth nesta tarefa.

## Contexto

O projeto possui dois caminhos ativos de sessão:

- NextAuth/Auth.js mantém a sessão do navegador, o login Credentials, o logout, o SessionProvider, o BrandProvider, os módulos e a autorização server-side;
- Supabase Auth emite o usuário e o JWT usado indiretamente pelo cliente browser e pelo provisionamento administrativo.

Essa ponte faz o browser depender de getSession() do NextAuth, expõe session.accessToken como intermediário e força o cliente Supabase a montar o header Bearer manualmente. O servidor usa getServerSession() e não lê cookies nativos do Supabase.

## Decisão

Adotar o Supabase Auth como única autenticação ativa:

- browser usa um cliente Supabase único e onAuthStateChange;
- cadastro usa supabase.auth.signUp;
- login usa supabase.auth.signInWithPassword;
- logout usa supabase.auth.signOut;
- Server Components, Route Handlers e Server Actions usam cliente Supabase server-side com cookies;
- autorização server-side valida supabase.auth.getUser() antes de acessar dados privados;
- auth.users.id continua sendo a identidade canônica;
- marcas.owner_user_id e brand_memberships.member_user_id continuam sendo as relações de tenant;
- NextAuth/Auth.js permanece fisicamente isolado, desativado e documentado para eventual reversão;
- Google OAuth permanece oculto e desativado;
- Google Sheets permanece isolado e não recebe token Supabase indevido.

## Auditoria de consumidores

| Consumidor | Evidência local | Ambiente | Risco na remoção |
| --- | --- | --- | --- |
| Login | app/page.tsx:6,26,50,76 usa useSession, signIn e signOut | browser | login e redirecionamento deixam de funcionar até a troca |
| Cadastro | app/cadastro/page.tsx chama /api/auth/signup; app/api/auth/signup/route.ts chama REST signup | browser/server | precisa migrar para signUp e manter confirmação sem enumeração |
| Provider | components/providers.tsx:4,10 usa SessionProvider | browser | todos os consumidores perdem contexto |
| Marca/tenant | components/brand-context.tsx:4,33 usa useSession; lib/server/authz.ts:1,77 usa getServerSession | browser/server | todas as Route Handlers protegidas precisam trocar a fonte de identidade |
| Cliente browser | lib/supabase/browser-authenticated-client.ts:1,76,157,176 usa getSession e session.accessToken | browser | remover token manual e usar sessão nativa |
| Shell e conta | components/product-shell.tsx, modules/conta/account-page.tsx, app/selecionar-marca/select-brand-client.tsx | browser | logout e identidade visual |
| Módulos | Minerador, Arquiteto, Radar, Planejador, Redator, Publicações, Marca e componentes editoriais usam useSession | browser | estados de carregamento, actorId e logout |
| Auth principal legado | app/api/auth/[...nextauth]/route.ts | server | deve deixar de ser importado por layouts/rotas ativas |
| Google Sheets | app/api/mine/route.ts:2-20 usa sessão NextAuth e token Google | server | permanece isolado; não será convertido nesta tarefa |
| Admin owner | app/api/admin/owners/route.ts usa requireSessionProfile e service role server-side | server | deve manter Admin global e cliente Auth Admin |

## Bloqueio técnico

@supabase/ssr não está declarado no package.json nem no lockfile. Também não há middleware.ts que atualize a sessão Supabase. A especificação proíbe instalar dependências automaticamente e proíbe improvisar uma segunda implementação de cookies.

Comando para execução manual pelo usuário, quando autorizado:

    npm install @supabase/ssr

Após a instalação, a implementação deve criar o cliente browser, o cliente server-side e o middleware Supabase antes de remover consumidores NextAuth.

## Segurança e limites

- não usar service role no browser;
- não registrar tokens, cookies ou Authorization;
- não usar getSession() como autorização server-side;
- não limpar localStorage ou IndexedDB;
- não alterar schema, RLS, grants, owners ou memberships;
- não executar SQL, migration, rollback, commit, push ou deploy.

## Rollback de código

O rollback local deve restaurar:

1. SessionProvider em components/providers.tsx;
2. imports NextAuth dos consumidores;
3. cliente browser dependente da sessão Supabase;
4. cliente server-side/middleware Supabase;
5. requireSessionProfile baseado em cookies Supabase.

Não há rollback de banco.

## Critério para continuar

Prosseguir somente depois da instalação manual de @supabase/ssr, mantendo o checkout e executando auditoria de imports novamente. Até lá, o fluxo NextAuth existente permanece intacto para evitar deixar o aplicativo sem autenticação funcional.
