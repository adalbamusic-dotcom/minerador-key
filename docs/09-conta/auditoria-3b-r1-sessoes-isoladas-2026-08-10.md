# Auditoria 3B-R1 — sessões isoladas e contextos — 2026-08-10

## Classificação

`HOMOLOGADA_MANUALMENTE`

Homologação manual registrada conforme evidência relatada pelo usuário; o
agente não repetiu o smoke nesta rodada.

Implementação existente auditada. Nenhuma reconstrução de 3B-R1, migration,
operação remota, alteração de dados, provider, e-mail, commit, push ou deploy
foi executado nesta auditoria. A classificação não representa homologação:
o smoke real no mesmo perfil de navegador continua pendente.

## Implementação existente

- `/auth/new-slot` cria um identificador aleatório de slot e redireciona para
  um host separado (`s-{slot}.localhost` ou domínio configurado). O redirect
  passa por `safeAuthRedirect`, usa `Cache-Control: private, no-store` e não
  transporta cookie, token, `userId`, localStorage ou IndexedDB.
- “Entrar em outra conta” usa exclusivamente o link canônico
  `/auth/new-slot?next=...`; não cria uma sessão nem uma identidade antes do
  login no novo host.
- `SupabaseSessionContext` mantém `actorUserId`, incrementa `sessionEpoch`
  quando o actor muda e invalida a sessão em memória no logout ou na troca de
  identidade.
- `BrandContext` limpa marcas, papel e seleção antes de recarregar `/api/marcas`
  com `cache: "no-store"`; uma geração impede que resposta antiga sobrescreva
  o actor atual. A rota tenantizada continua sendo a autoridade da marca, sem
  fallback por seleção local.
- O pipeline editorial usa `actorUserId:brandId` como `workspaceKey`, inclui o
  actor nas chaves de recovery local e abandona resultados assíncronos quando
  actor ou `sessionEpoch` deixam de coincidir. Logout não limpa documentos
  editoriais offline indiscriminadamente.
- O logout compartilhado chama `supabase.auth.signOut()` no host atual,
  limpa o contexto em memória, incrementa o epoch e redireciona para login.
  O host separado mantém o outro slot fora desse escopo.

## Contextos e 0021

Não foi encontrada regressão causada por 0021 ou por `/api/contexts` no
contrato de sessões. `/api/contexts` consulta os contextos no servidor,
retorna `Cache-Control: no-store` e não escolhe tenant por primeiro registro,
histórico ou armazenamento local.

`listCanonicalAccessibleAgencies` compõe owner e membership ativos do actor.
Admin global não recebe Agency por efeito colateral. `operationalAgency` só é
preenchida quando exatamente uma Agency operacional é resolvida; portanto,
`isPlatformAdmin` e Agency operacional continuam separados.

Para Actor A, o mesmo actor pode acessar `/admin`, sua Agency operacional e as
Brands autorizadas por Agency → Brand. A troca entre esses contextos não cria
segunda sessão e não altera `actorUserId`.

Para Actor B, o acesso depende da identidade autenticada, do `agencyRef`
estrito e dos vínculos ativos. Não existe fallback para primeira Agency,
owner da Brand, slug, nome, e-mail ou outro tenant. A comprovação dos dados
remotos de B permanece dependente do smoke manual.

## Cache, cookies e documentação Next.js 16

Não há `use cache`, `unstable_cache` ou `force-cache` nas superfícies privadas
auditadas. As layouts de Agency e Brand usam `revalidate = 0`; as consultas de
contexto e marcas no browser usam `cache: "no-store"`; `/api/contexts` e o
redirect de slot explicitam `no-store`.

Foram consultados no checkout os documentos locais:

- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`;
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`;
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`;
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md`.

As orientações relevantes confirmam que Route Handlers não são cacheados por
default, que `cookies()` é API de request-time e que autenticação, gestão de
sessão e autorização devem permanecer separadas. Nenhuma alteração de rota,
cookie, cache, Server Component, Route Handler, proxy ou auth foi necessária.

## Testes automatizados

- Sessões, slots, `actorUserId`, `sessionEpoch`, contexts privados, cache/recovery
  actor+brand, logout compartilhado, tenantização e autorização Agency/Brand:
  **56/56 aprovados**.
- TypeScript (`npx tsc --noEmit`): **aprovado**.
- ESLint direcionado: **aprovado**; apenas os dois arquivos de teste ignorados
  pela configuração foram reportados como warning.
- Build Next.js 16: **aprovado**.
- `git diff --check`: **aprovado**; apenas avisos de conversão LF/CRLF do
  checkout foram exibidos.

A suíte ampliada reproduziu duas falhas de expectativa textual preexistentes
em `tests/canonical-phase-2b.test.mts` e `tests/canonical-phase-2c.test.mts`
(rótulos `Agências autorizadas`/`Agências`). Elas não envolvem sessão,
actor, cache, autorização ou isolamento e não foram modificadas nesta tarefa.

## Smoke manual pendente

Executar com um único perfil de navegador, sem incognito:

1. No host normal, entrar com o Actor A real informado pelo usuário.
2. Confirmar `/admin`, `Minha Agência`, a Agency do Actor A e uma Brand dessa
   Agency pelo caminho oficial Agency → Brand.
3. No mesmo perfil, acionar “Entrar em outra conta”, que deve abrir
   `/auth/new-slot?next=...` em um novo host.
4. No novo slot, autenticar uma identidade real já existente do Actor B,
   pertencente a outra Agency; não criar usuário fictício.
5. Confirmar que B não acessa `/admin`, vê somente sua Agency e suas Brands,
   e não recebe nomes ou links da Agency A.
6. Voltar ao slot A e atualizar a página; confirmar que A continua A.
7. Voltar ao slot B e atualizar a página; confirmar que B continua B.
8. Fazer logout somente no slot B; confirmar que B retorna ao login.
9. Voltar ao slot A, atualizar e confirmar que A permanece autenticado.
10. Fazer logout no slot A.

Registrar somente resultados sanitizados: acesso Admin A, Agency/Brand A,
negação do Admin B, Agency/Brand B, refresh de A e B, logout isolado de B e
ausência de nomes/links da Agency A no slot B. Não limpar localStorage,
IndexedDB ou cookies globalmente.

## Homologação manual registrada — 2026-08-10

Evidência manual relatada pelo usuário e incorporada ao estado do módulo:

```text
MULTI_SESSION_SMOKE = PASS
SESSION_ISOLATION = PASS
CONTEXT_ISOLATION = PASS
LOGOUT_ISOLATION = PASS
```

O mesmo perfil de navegador confirmou duas identidades simultâneas em hosts
distintos, Agencies e Brands distintas, refresh sem mistura, negação de outra
Agency e logout de um slot sem derrubar o outro. A homologação é registrada
como evidência manual do usuário; não foi repetida pelo agente nesta rodada.
