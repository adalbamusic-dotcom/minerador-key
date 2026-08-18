# Fase 2C.1 - auditoria local de rotas e guards

Data: 2026-08-06. Escopo: estrutura local de rotas do Interface Planner.
Nenhum SQL, bootstrap, Auth remoto, provider pago, migration, commit, push ou deploy foi executado.

## Matriz de rotas obrigatorias

| URL | Antes | Depois | Guard ou estado |
| --- | --- | --- | --- |
| `/login` | ROUTE_OK | ROUTE_OK | sessao Supabase no cliente |
| `/cadastro` | ROUTE_OK | ROUTE_OK | cadastro Supabase no cliente |
| `/auth/callback` | ROUTE_OK | ROUTE_OK | Route Handler e destino seguro |
| `/conta` | ROUTE_OK | ROUTE_OK | `getCanonicalPersonalAccount` |
| `/admin` | ROUTE_OK | ROUTE_OK | `requireCanonicalPlatformAdmin` |
| `/admin/usuarios` | ROUTE_404 | ROUTE_OK | shell Admin e redirect para tab `usuarios` |
| `/admin/agencias` | ROUTE_404 | ROUTE_OK | shell Admin e redirect para tab `agencias` |
| `/admin/marcas` | ROUTE_OK | ROUTE_OK | shell Admin e redirect para tab `marcas` |
| `/agencias/{agencyRef}` | ROUTE_OK | ROUTE_OK | `getCanonicalAgencyWorkspace` |
| `/agencias/{agencyRef}/membros` | ROUTE_OK | ROUTE_OK | mesmo guard de agencia |
| `/agencias/{agencyRef}/marcas` | ROUTE_OK | ROUTE_OK | mesmo guard de agencia |
| `/agencias/{agencyRef}/configuracoes` | ROUTE_OK | ROUTE_OK | mesmo guard de agencia |
| `/{brandRef}` | ROUTE_OK | ROUTE_OK | brandRef estrito e layout canonico |
| `/{brandRef}/minerador` | ROUTE_OK | ROUTE_OK | modulo canonico `minerador` |
| `/{brandRef}/arquiteto` | ROUTE_OK | ROUTE_OK | modulo canonico `arquiteto` |
| `/{brandRef}/radar` | ROUTE_OK | ROUTE_OK | modulo canonico `radar` |
| `/{brandRef}/planejador` | ROUTE_OK | ROUTE_OK | modulo canonico `planejador` |
| `/{brandRef}/redator` | ROUTE_OK | ROUTE_OK | modulo canonico `redator` |
| `/{brandRef}/publicacoes` | ROUTE_OK | ROUTE_OK | modulo canonico `publicacoes` |
| `/{brandRef}/conta` | LEGACY_GUARD | ROUTE_OK | handoff direto e unico para `/conta` |

`ROUTE_OK` comprova arquivos locais e compilacao; nao comprova sessao, dados ou permissao remota. Para refs validas sem permissao, layouts retornam bloqueio explicito. Para ref invalida, a rota tenantizada usa `notFound()` ou bloqueio de contexto, sem correcao silenciosa.

## Shells e navegacao

- Admin: `app/(admin)/layout.tsx`, com guard global server-side.
- Agencia: `app/(agency)/agencias/[agencyRef]/layout.tsx`, com `WorkspaceFrame` e loading somente do conteudo.
- Marca: `app/(brand)/[brandRef]/layout.tsx`, com `ProductShell`, brandRef estrito e loading somente do conteudo.
- Pessoal: `app/(personal)/conta/page.tsx`, sem brandRef.
- O handoff legado de conta permanece como pagina minima em `app/(brand)/[brandRef]/conta/page.tsx`: so executa `redirect("/conta")`, sem cliente ou loop. O layout tenantizado continua recusando brandRef invalido ou sem acesso antes do handoff.
- `ProductShell` usa `continuar=/{modulo}` ao abrir a selecao sem marca e aponta agencia somente por `agencyRef` retornado pelo servidor.

## Matriz de contratos ainda em compatibilidade

| Consumidor | Sessao | Guard | Estado |
| --- | --- | --- | --- |
| Layouts Admin, Agencia, Marca e Conta | Supabase SSR | helpers `canonical-authorization` | CANONICO |
| `/api/contexts` e APIs Admin | Supabase SSR | helpers canonicos | CANONICO |
| APIs editoriais e de Minerador | adaptador Supabase em `requireSessionProfile` | `authz` e permissoes UUID | COMPATIBILIDADE |
| `lib/server/tenant-context.ts` e `agency-context.ts` | adaptador Supabase | compatibilidade sem fallback por e-mail | COMPATIBILIDADE |
| Estados de documento e views editoriais | identidade UUID | coluna fisica `user_key` | LEGADO_DE_PERSISTENCIA |
| `perfis.marca_id` | nao concede acesso | somente metadado historico | LEGADO_DE_PERSISTENCIA |
| `canonical_role` | coluna de transicao 0015 | consumida por agencia | LEGADO_TRANSITORIO |

Busca local: nao ha import operacional de `next-auth` ou `getServerSession` em `app`, `components`, `lib` ou `modules`. A remocao fisica do pacote do lockfile depende de `pnpm install` manual.

## Correcao do bootstrap inicial

O estado visual confirmado mostrou Admin global e marcas existentes, mas nenhuma agencia. O bootstrap anterior tratava uma Agencia Adalba ativa e seus dois vinculos como pre-condicoes; por isso ele abortaria no estado atual.

Os scripts `fase-2c-initial-identity-*` agora aceitam zero ou uma agencia com o slug `agencia-adalba`. Em uma unica transacao, criam a agencia apenas se ausente, definem owner e membership administrativa, criam ou reativam os dois vinculos de agencia e concedem acessos editoriais UUID explicitos. Owners das marcas sao fingerprintados antes e depois; qualquer mudanca aborta a transacao. O preflight e a validacao posterior continuam somente leitura e sanitizados.

## Roteiro manual unico posterior

1. Executar `pnpm install` e confirmar a reconciliacao do lockfile.
2. Executar preflight, bootstrap e validacao 2C somente quando o snapshot aprovado estiver disponivel.
3. Em uma unica sessao autenticada, validar login, logout, reload, conta, Admin e suas tres subrotas, agencia, duas marcas, usuario sem vinculo, ref divergente e bloqueio entre marcas.
4. Confirmar em 360, 768, 1024 e 1440 pixels que os shells preservam navegacao e que loading fica restrito ao conteudo.
