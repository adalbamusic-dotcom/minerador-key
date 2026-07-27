# SDD — Consolidação do Supabase Auth como autenticação canônica

## Escopo autorizado

Trocar a autenticação ativa compartilhada de NextAuth/Auth.js para Supabase Auth, preservando tenantização, Admin global, owner/membership, estado sem marca, Google desativado e integração Google Sheets isolada.

Não fazem parte do escopo: schema, RLS, grants, migrations 0005/0006, dados existentes, limpeza de armazenamento, instalação automática, operações remotas, Git ou deploy.

## Estado auditado antes da edição

- SessionProvider ainda envolve todo o layout em components/providers.tsx.
- app/page.tsx usa Credentials via signIn e useSession.
- components/brand-context.tsx, shell, conta, seletor e módulos usam useSession/signOut.
- lib/server/authz.ts resolve a identidade por getServerSession.
- lib/supabase/browser-authenticated-client.ts depende de getSession, valida session.accessToken e monta o bearer.
- app/api/auth/[...nextauth]/route.ts mantém Credentials, callbacks JWT, refresh Supabase e provider Google condicional.
- app/api/mine/route.ts usa sessão NextAuth e token Google; permanece um consumidor separado.
- proxy.ts apenas redireciona rotas legadas; não atualiza sessão Supabase.
- middleware.ts não existe.
- @supabase/ssr não está instalado.

## Desenho alvo

1. Criar cliente browser singleton com createBrowserClient e persistência/refresh nativos.
2. Criar cliente server-side por request com cookies via createServerClient.
3. Criar middleware de atualização de sessão sem consultas editoriais e sem service role.
4. Criar provider compartilhado baseado em supabase.auth.getSession() e onAuthStateChange.
5. Migrar /login, /cadastro e logout.
6. Migrar BrandProvider, shell, conta, seletor e módulos.
7. Migrar requireSessionProfile para supabase.auth.getUser().
8. Preservar filtros tenantizados e revalidar brandRef no servidor.
9. Isolar fisicamente NextAuth e Google; não remover a dependência nesta etapa.

## Gates de segurança

- usuário ausente bloqueia antes de qualquer consulta privada;
- usuário sem marca não consulta tabelas editoriais;
- Admin global continua sendo identificado pelo contrato existente;
- owner/membership continuam baseados em UUID Auth;
- nenhuma resposta de erro vira lista vazia;
- nenhum token, cookie ou service role chega ao browser ou aos logs.

## Testes planejados

Fixtures para cadastro pendente, cadastro imediato, login, logout, sessão expirada, refresh nativo, usuário sem marca, Admin, owner, múltiplas marcas, isolamento entre marcas, Google suspenso, Google Sheets isolado e ausência de NextAuth nos layouts/consumidores ativos.

## Bloqueio atual

A implementação não pode começar porque o cliente server-side por cookies requer @supabase/ssr, ausente no projeto, e a instrução autoriza somente fornecer o comando manual:

    npm install @supabase/ssr

Nenhuma alteração de código foi feita nesta auditoria. O próximo passo seguro é o usuário executar o comando manual e solicitar a continuação.
