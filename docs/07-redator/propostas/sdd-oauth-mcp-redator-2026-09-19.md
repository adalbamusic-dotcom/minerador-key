# SDD — OAuth 2.1 para o MCP do Redator (ChatGPT, Claude e outros clientes remotos)

**Estado:** aprovada em 2026-09-19 para implementação (D1 = multi-Marca; D2 a D5 conforme recomendado). Fases 0 a 4 concluídas em 2026-09-19: OAuth Server ligado, M7 aplicada, deploy, painel da Agência no ar e homologação pelo ChatGPT com readback (`CHATGPT_CONNECTION = PASS`, `AUTHENTICATED_READ_WRITE = PASS`). Pendente: `MCP_GRANT_REVOCATION` e chave ES256. Evidência em `docs/07-redator/estado-atual.md`.
**Módulo proprietário:** Redator (servidor MCP do Redator). Superfícies compartilhadas tocadas: autenticação (página de consentimento sobre a sessão Supabase existente), Integrações da Agência (painel MCP) e Conta (conexões de IA do usuário).
**Data:** 2026-09-19.
**Responsável humano pela aprovação:** owner da plataforma.
**Sucede:** `sdd-redator-multiformato-mcp-2026-09-18.md` (porta MCP com bearer local) e a seção "Segurança" de `sdd-redesign-redator-mcp-agencia-2026-09-18.md`, que já previa "OAuth 2.1 com PKCE, audience, scopes e consentimento no gateway da Agência".

## 1. Problema

O cadastro de plugin do ChatGPT aceita três modos de autenticação: `OAuth`, `Sem autenticação` e `Mista`. Não há campo para bearer manual. O servidor `/api/mcp/redator` aceita somente o bearer interno `mk_mcp_...`, emitido em "Criar bearer" na Agência. Por isso as três tentativas de 2026-09-19 falharam:

| Modo escolhido no ChatGPT | Mensagem | Causa medida |
| --- | --- | --- |
| OAuth | "MCP server does not implement OAuth" | `/.well-known/oauth-protected-resource` responde 404 na Vercel; a discovery do Supabase responde 404 `feature_disabled` |
| OAuth com configuração manual | "Informe a URL de autenticação e a URL do token" | não existem endpoints de autorização e token publicados |
| Sem autenticação | "Something went wrong" | o `initialize` sem token recebe 401 `bearer_required` |
| Mista | igual ao OAuth | idem |

Medição de 2026-09-19 07:33 UTC com `node scripts/mcp-oauth-preflight.mjs https://minerador-key.vercel.app/api/mcp/redator https://hjjlntdpdgvpnazdztqw.supabase.co/auth/v1`: `oauthDiscovery = BLOCKED`, nove bloqueadores, `healthOk = true`, `authorizationServerDisabled = true`. O `health` está correto ao declarar `oauthImplemented: false` e `chatgptLoginReady: false`.

**Objetivo:** um usuário da Agência informa só a URL do servidor no ChatGPT, escolhe `OAuth`, entra com a conta normal da plataforma, aprova quais Marcas e permissões o cliente terá, e passa a operar o Redator pelo chat. Nenhum token, client ID ou secret passa pelas mãos do usuário. A Agência vê o estado da conexão, quem autorizou o quê, e revoga quando precisar.

## 2. Decisão proposta

**Supabase Auth OAuth 2.1 Server é o servidor de autorização. A Vercel é somente o servidor de recurso.** O login já é Supabase; o OAuth Server do projeto entrega Authorization Code + PKCE S256, registro dinâmico de cliente, refresh token com rotação, revogação e discovery, tudo exigido pelo ChatGPT. Escrever um servidor de autorização próprio dobraria o trabalho e nos tornaria donos da segurança de emissão de tokens.

Três fatos verificados na documentação que definem o desenho:

1. **Escopos.** O Supabase só emite `openid`, `email`, `profile` e `phone`. Escopos controlam dados OIDC, não acesso à API. Logo `writer.read`, `writer.draft.write` e `writer.media.brief` **não vão no token**. Eles vivem numa tabela de grant nossa (usuário, cliente OAuth, agência, marca, escopos), decidida na tela de consentimento e conferida a cada chamada, exatamente como `delegation.scopes` é conferido hoje.
2. **Token.** O access token é um JWT do Supabase com `sub`, `role`, `aud = authenticated` e `client_id`. O servidor de recurso valida assinatura (JWKS quando a chave for assimétrica; `getClaims` cai para verificação remota com HS256), `iss`, `exp` e exige `client_id`. Ele **não** confia em `aud` para identificar o recurso; a ligação recurso ↔ grant é feita pelo `client_id` e pela tabela de grants.
3. **Consentimento.** A tela é nossa, em `/oauth/consent`, usando `supabase.auth.oauth.getAuthorizationDetails`, `approveAuthorization` e `denyAuthorization` (disponíveis em `@supabase/auth-js 2.112.1`, já instalado). O Supabase memoriza o consentimento e **auto-aprova** reautorizações do mesmo cliente para o mesmo usuário; a seção 6.3 trata desse caso.

O que **não** muda: as dez ferramentas MCP e seus contratos, `writer_deliverables`, `content_documents`, `assertEditorialPermission` por chamada, limite de 60 chamadas por minuto, auditoria em `writer_mcp_call_events`, ausência de ferramentas de aprovação, publicação e exclusão.

## 3. Contrato proposto

- **Escopo proprietário:** agency (a conexão pertence à Agência) com grant por brand.
- **Provider e capability:** os providers `chatgpt`, `claude`, `gemini`, `custom_mcp` já existem no catálogo (migration `20260919035046`). Não há capability nova de infraestrutura; o MCP não consome crédito de provedor pago.
- **Conexão:** `integration_connections` com `metadata.kind = writer_mcp_client` (já existe). O `auth_mode` passa de `delegated_bearer` para `oauth_supabase`. `lifecycle_status` deixa de ficar preso em `pending`: `pending` até o primeiro consentimento válido daquele provider, `ready` depois do primeiro grant ativo, `revoked` por ação da Agência.
- **Grant:** nova tabela `writer_mcp_grants` (seção 7). Um consentimento pode cobrir mais de uma Marca (uma linha por Marca, mesma `consent_id`).
- **Origem efetiva:** o token OAuth identifica o usuário; a autorização por Marca continua sendo `requireAgencyAccessToBrand` + `assertEditorialPermission(redator, view|edit)` no momento da chamada. Um grant nunca amplia o que o usuário já pode fazer no Redator.
- **Interface administrativa:** `/agencias/{agencyRef}/integracoes` (estado da conexão, grants, auditoria, revogação). Autoatendimento do usuário em `/conta` (suas conexões de IA, marcas e escopos, revogação própria).
- **Endpoints públicos novos (sem segredo):**
  - `GET /.well-known/oauth-protected-resource` e `GET /.well-known/oauth-protected-resource/api/mcp/redator` → `{ resource: "<MCP_PUBLIC_BASE_URL>/api/mcp/redator", authorization_servers: ["<SUPABASE_URL>/auth/v1"], scopes_supported: ["openid","email","profile"], bearer_methods_supported: ["header"], resource_name: "Minerador Key — Redator" }`.
  - `401` do MCP passa a enviar `WWW-Authenticate: Bearer resource_metadata="<MCP_PUBLIC_BASE_URL>/.well-known/oauth-protected-resource/api/mcp/redator"`.
  - `GET /oauth/consent?authorization_id=…` (página, exige sessão).
- **Estados visíveis na Agência:** `OAuth pronto` (issuer configurado, metadata servido e OAuth Server do Supabase respondendo na discovery), `Pendente` (qualquer um dos três ausente) e `Desativado` (`MCP_OAUTH_ENABLED=false` ou conexão revogada). O estado `OAuth pronto` não afirma conexão de nenhum cliente; a conexão é provada por grant ativo com `last_used_at`.
- **Bearer `mk_mcp_`:** deixa de ser experiência de produto. Continua aceito apenas quando `MCP_ALLOW_REMOTE_BEARER=true`, com rótulo "diagnóstico interno", e o botão "Criar bearer" some do painel quando essa flag está desligada. Remoção definitiva fica para corte posterior, após um ciclo completo por OAuth.
- **Efeito durante transferência de Marca:** grants da Marca são revogados na transferência (mesma regra das delegações atuais, que ficam órfãs quando `agency_id` diverge e são recusadas com `agency_changed`).

## 4. Fluxo ponta a ponta

1. Admin da Agência registra o cliente `ChatGPT` no painel (já existe). Estado `Pendente` até a plataforma estar `OAuth pronto`.
2. No ChatGPT, o usuário cria o plugin: nome, URL `https://minerador-key.vercel.app/api/mcp/redator`, autenticação `OAuth`. O ChatGPT faz `POST initialize`, recebe 401 com `resource_metadata`, lê o metadata, lê a discovery do Supabase, registra-se por Dynamic Client Registration e abre o `authorize` com PKCE.
3. O Supabase redireciona para `/oauth/consent?authorization_id=…`. Sem sessão, a página manda para `/login?callbackUrl=/oauth/consent?authorization_id=…` (o `safeAuthRedirect` já preserva o caminho com query).
4. A página mostra o nome do cliente, o `redirect_uri`, o usuário, as Marcas da Agência em que ele tem `redator:view` e os três escopos (pré-marcados conforme a conexão registrada pela Agência). O usuário escolhe Marcas e escopos e aprova. O servidor grava as linhas em `writer_mcp_grants` **antes** de chamar `approveAuthorization` e só redireciona após readback das linhas.
5. O ChatGPT troca o code por access + refresh token e chama `tools/list`. O servidor valida o JWT, resolve `(sub, client_id)` na tabela de grants, monta a lista de Marcas autorizadas e cria o `McpServer`.
6. No chat: "Leia os artigos aprovados no Radar da Care Glow, escreva o artigo no Redator e salve como rascunho." O ChatGPT chama `get_writer_connection_profile` (devolve as Marcas), `list_writer_documents` com a Marca, `get_writer_brief`, `save_writer_draft`. O rascunho aparece no Redator; a aprovação continua humana, na tela.
7. Renovação de token é do ChatGPT com o Supabase. Revogação pela Agência ou pelo usuário atua na tabela de grants e o servidor recusa na chamada seguinte, independentemente da validade do token.

## 5. Ferramentas MCP e Marca

Hoje a delegação é de uma Marca só e as ferramentas usam `delegation.brandId`. Com grant multi-Marca:

- `get_writer_connection_profile` devolve `brands: [{ brandId, name, scopes }]` em vez de um `brandId`.
- `list_writer_documents` ganha `brandId` opcional. Com uma Marca autorizada, é implícito. Com várias, é obrigatório (erro `brand_required` lista as opções). Cada linha devolve `brandId`.
- As demais ferramentas recebem `documentId`; o servidor lê a Marca do documento (`content_documents.marca_id`) e exige que ela esteja no grant com o escopo da ferramenta. Documento fora do grant responde `document_not_found`, sem revelar existência.

Decisão **D1**: multi-Marca por consentimento (recomendado) ou uma Marca por consentimento com reconexão para cada Marca. O texto acima assume a primeira; a segunda elimina o parâmetro `brandId` mas obriga um plugin por Marca no ChatGPT.

## 6. Segurança e isolamento

### 6.1 Validação do token no servidor de recurso

- `Authorization: Bearer <jwt>`. Se começar por `mk_mcp_`, cai no caminho legado somente com `MCP_ALLOW_REMOTE_BEARER=true`.
- `supabase.auth.getClaims(jwt)` com cliente anon server-side: verifica assinatura e expiração (JWKS com cache para chaves assimétricas; verificação remota para HS256). Depois: `iss === <SUPABASE_URL>/auth/v1`, `claims.client_id` presente, `sub` UUID.
- Grant: `writer_mcp_grants` com `actor_user_id = sub`, `oauth_client_id = client_id`, `status = active`. Sem grant → resposta de ferramenta `isError` com código `grant_required` e a URL de `/conta#conexoes-ia`, para o usuário autorizar Marcas sem sair do chat. Nenhuma Marca é escolhida por padrão.
- Por chamada, como hoje: `canonicalProfileForVerifiedUser(sub)`, `requireAgencyAccessToBrand` (recusa `agency_changed` se a Marca mudou de Agência), `assertEditorialPermission(redator, view|edit)`, escopo da ferramenta contido em `grant.scopes`, limite de 60 chamadas/min por grant, `last_used_at`.
- `aud` do JWT do Supabase é `authenticated`. O ChatGPT envia `resource=` e recomenda checar `aud`; a checagem equivalente aqui é `client_id` + grant. Um Custom Access Token Hook que grave `aud = <resource>` quando `client_id` estiver presente é melhoria de fase posterior (**D4**), não pré-requisito.
- `Origin` presente continua recusado (navegador nunca chama o MCP). `Host` continua na allowlist.

### 6.2 Registro dinâmico de cliente

Com DCR ligado, qualquer cliente MCP pode se registrar no projeto. Isso não concede acesso: sem consentimento não há token, sem grant não há chamada, sem permissão no Redator não há dado. Mitigações: o painel da Agência lista os `client_id` vistos nos grants; a plataforma monitora clientes registrados pelo Supabase (`auth.admin.oauth.listClients`); a revogação de um cliente pela Agência chama `auth.admin.oauth.deleteClient(client_id)` além de revogar os grants, o que força novo registro e novo consentimento.

### 6.3 Consentimento memorizado pelo Supabase

Quando o usuário já consentiu para o mesmo cliente e escopos, `getAuthorizationDetails` devolve `redirect_url` direto, sem exibir nossa tela. Regra: a página redireciona imediatamente (o ChatGPT precisa do code) e a autoridade sobre Marcas e escopos permanece na tabela de grants. Se os grants foram revogados, a primeira chamada devolve `grant_required` com a URL de autoatendimento em `/conta`, onde o usuário vê as conexões OAuth dele (`auth.oauth.listGrants()`), escolhe Marcas e escopos por cliente e pode revogar (`auth.oauth.revokeGrant` + tabela). Reativação de grant revogado pela Agência é ação da Agência, não reconsentimento.

### 6.4 Segredos e logs

Nenhum segredo novo em env. O issuer deriva de `NEXT_PUBLIC_SUPABASE_URL`; o recurso deriva de `MCP_PUBLIC_BASE_URL`. Tokens OAuth não são gravados; a tabela guarda `client_id` (identificador público). Logs e `writer_mcp_call_events` continuam sem token, sem e-mail e sem payload. A página de consentimento não devolve `authorization_id` a terceiros nem aceita `redirect_uri` do cliente por query; ela usa o `redirect_url` devolvido pelo Supabase.

### 6.5 Fallback silencioso

Não existe: sem `MCP_OAUTH_ENABLED=true` as rotas `.well-known` e `/oauth/consent` respondem 404 e o servidor recusa JWT com `oauth_disabled`. Falha na discovery do Supabase não faz o servidor aceitar bearer legado. O estado `Pendente` no painel nunca vira `OAuth pronto` por inferência local.

## 7. Persistência e migração

### 7.1 Nova tabela `writer_mcp_grants`

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid PK | |
| `consent_id` | uuid NOT NULL | agrupa as Marcas de um mesmo consentimento |
| `agency_id` | uuid NOT NULL FK `agencies` RESTRICT | |
| `marca_id` | uuid NOT NULL FK `marcas` RESTRICT | |
| `actor_user_id` | uuid NOT NULL FK `auth.users` RESTRICT | `sub` do token |
| `oauth_client_id` | text NOT NULL, 1..200 | `client_id` do token |
| `client_name` | text NOT NULL, 1..120 | nome exibido no consentimento |
| `provider_connection_id` | uuid NULL FK `integration_connections` SET NULL | conexão registrada pela Agência, quando identificável |
| `scopes` | text[] NOT NULL, subconjunto dos três escopos, não vazio | |
| `status` | text NOT NULL CHECK (`active`, `revoked`) | |
| `revoked_by_user_id` | uuid NULL | |
| `created_at`, `revoked_at`, `last_used_at` | timestamptz | |

Índice único parcial `(actor_user_id, oauth_client_id, marca_id) WHERE status = 'active'`. Índice `(agency_id, created_at DESC)` para o painel. RLS habilitada; `REVOKE ALL` de `PUBLIC, anon, authenticated, service_role`; `GRANT SELECT, INSERT, UPDATE TO service_role` (mesmo padrão de `writer_mcp_delegations`). Sem `DELETE`.

### 7.2 Alteração aditiva em `writer_mcp_call_events`

`delegation_id` passa a `NULL` permitido; nova coluna `grant_id uuid NULL FK writer_mcp_grants RESTRICT`; `CHECK (num_nonnulls(delegation_id, grant_id) = 1)`; índice `(grant_id, occurred_at DESC)`. O trigger append-only permanece. Linhas existentes não mudam.

### 7.3 Aplicação e rollback

- Arquivo: `supabase/migrations/2026MMDDHHMMSS_writer_mcp_oauth_grants.sql`, envolvida em `BEGIN … COMMIT`, precondições: `writer_mcp_delegations` e `writer_mcp_call_events` existem, `writer_mcp_grants` não existe.
- Aplicação pelo usuário com `npx supabase db query --linked -f <arquivo>` seguido de `npx supabase migration repair --status applied <versao> --linked`. **Nunca `db push`.**
- Preflight read-only e post-verifier em `supabase/scripts/`, no padrão `check_name/expected/observed/verdict`, consolidados num único `SELECT jsonb_pretty(...)`.
- Rollback em `supabase/rollback/`: remove o CHECK e a coluna `grant_id` somente se `count(*) WHERE grant_id IS NOT NULL = 0`, restaura `NOT NULL` em `delegation_id`, dropa `writer_mcp_grants` somente se vazia; caso contrário aborta com contagem. Rollback operacional sem SQL: `MCP_OAUTH_ENABLED=false`.
- Sem backfill: delegações `mk_mcp_` não viram grants.

## 8. Mapa de arquivos

**Novos**

| Arquivo | Papel |
| --- | --- |
| `app/.well-known/oauth-protected-resource/route.ts` e `app/.well-known/oauth-protected-resource/api/mcp/redator/route.ts` | metadata do recurso protegido; 404 com OAuth desligado |
| `lib/server/mcp-oauth.ts` | issuer, resource, metadata, `verifyWriterMcpOAuthToken(jwt)` (getClaims + iss + client_id), erro tipado |
| `lib/server/writer-mcp-grants.ts` | criar por consentimento (readback obrigatório), listar por Agência e por usuário, revogar, reativar, `resolveGrantForToken` |
| `lib/redator/mcp-consent-domain.ts` | funções puras: Marcas elegíveis, validação de escopos, agrupamento por `consent_id`, rótulos |
| `app/oauth/consent/page.tsx` + `app/api/oauth/consent/route.ts` | página de consentimento e ação aprovar/negar |
| `app/api/oauth/grants/route.ts` | autoatendimento: listar grants do usuário, criar/ajustar por cliente, revogar |
| `modules/conta/ai-connections-panel.tsx` | seção "Conexões de IA" em `/conta` |
| migration, preflight, post-verifier, rollback | seção 7 |
| `tests/mcp-oauth-token.test.mts`, `tests/mcp-oauth-metadata.test.mts`, `tests/mcp-consent-domain.test.mts`, `tests/writer-mcp-grants.test.mts` | seção 10 |

**Modificados**

| Arquivo | Mudança |
| --- | --- |
| `app/api/mcp/redator/route.ts` | resolução de autenticação: OAuth primeiro, bearer legado atrás da flag; 401 com `resource_metadata`; `createWriterServer` recebe `{ grants, brands }` em vez de uma Marca; ferramentas conforme seção 5 |
| `lib/server/mcp-runtime-config.ts` | `oauthEnabled`, `issuer`, `resource`, `metadataUrl`; falha `mcp_oauth_issuer_missing` |
| `app/api/mcp/redator/health/route.ts` | `oauth.configured`, `readiness.oauthImplemented = true`; `chatgptLoginReady` continua `false` até homologação manual registrada |
| `lib/server/integration-governance.ts` | grants no workspace, cálculo de `OAuth pronto/Pendente/Desativado`, `auth_mode`, revogação de grant e de cliente (`deleteClient`), esconder emissão de bearer sem a flag |
| `app/api/agencies/[agencyRef]/integrations/route.ts` | ações `revoke_writer_mcp_grant`, `reactivate_writer_mcp_grant`; `create_writer_mcp_delegation` responde 409 sem a flag |
| `modules/conta/agency-integrations-page.tsx` | estado da conexão, lista de grants (usuário, cliente, Marcas, escopos, criado, último uso, revogar), auditoria por grant; bloco "Criar bearer" só com a flag |
| `proxy.ts` | excluir `.well-known` do matcher |
| `.env.example` | `MCP_OAUTH_ENABLED=false` documentado |
| `tests/redator-mcp-http-boundary.test.mts`, `tests/mcp-runtime-config.test.mts`, `tests/redator-mcp-protocol.test.mts`, `tests/redator-mcp-agency-boundary.test.mts` | novos headers, novo perfil multi-Marca, novas ações |
| `docs/07-redator/estado-atual.md`, `docs/07-redator/backlog.md`, `docs/compartilhado/autenticacao-e-permissoes.md` (adendo), `docs/01-admin/estado-atual.md` (gate de Auth) | ao concluir cada fase |

Fora do escopo: Minerador, Arquiteto, Radar, SERP, DNAs, Publicações, provedores pagos, ferramenta nova de aprovação ou publicação, servidor de autorização próprio.

## 9. Fases e gates

| Fase | Quem | O quê | Gate de saída |
| --- | --- | --- | --- |
| 0. Supabase | usuário | Authentication → OAuth Server: ligar; Authorization Path `/oauth/consent`; ligar Dynamic Client Registration. Conferir que o Site URL do Auth é `https://minerador-key.vercel.app` (ele compõe a URL do consentimento e já compõe links de e-mail; registrar o valor anterior). JWT Signing Keys: criar chave ES256 e promover (a chave anterior segue válida para verificação; fazer em horário de baixo uso; as sessões do app não dependem de verificação local). | `GET https://hjjlntdpdgvpnazdztqw.supabase.co/.well-known/oauth-authorization-server/auth/v1` = 200 com `code_challenge_methods_supported` contendo `S256` e `registration_endpoint` presente. Preflight passa de nove para no máximo três bloqueadores (os do recurso). |
| 1. Código | agente | tudo da seção 8 exceto o painel da Agência; testes verdes; `tsc`, lint direcionado, `git diff --check` | `pnpm run test:redator`, `test:redator:mcp`, `test:mcp:runtime`, novos testes e `tests/mcp-oauth-preflight.test.mjs` verdes |
| 2. Remoto | usuário | aplicar migration (`db query -f` + `migration repair`), post-verifier PASS; Vercel: `MCP_OAUTH_ENABLED=true`, `MCP_ALLOW_REMOTE_BEARER=false`; deploy | preflight `oauthDiscovery = PASS` com zero bloqueadores |
| 3. Homologação | usuário | ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode ligado; criar plugin com URL e `OAuth` (deixar "Escopos padrão" vazio); Criar; login; consentimento (Care Glow, três escopos); conferir lista de ferramentas; no chat, `get_writer_connection_profile` e depois um `save_writer_draft` num documento de teste | readback por `db query --linked`: 1+ linhas em `writer_mcp_grants` com `status = active` e `last_used_at` preenchido; eventos em `writer_mcp_call_events` com `grant_id` e `result_code = success` para `get_writer_connection_profile` e `save_writer_draft`; `content_document_versions` com a versão salva. Só então `CHATGPT_CONNECTION = PASS` e `AUTHENTICATED_READ_WRITE = PASS` |
| 4. Código | agente | painel da Agência (estado, grants, auditoria, revogação, reativação), seção em `/conta`, esconder bearer; docs | validação manual do painel pelo usuário; revogação testada: chamada seguinte no ChatGPT devolve `grant_required` |

Marcadores documentais: `MCP_OAUTH_DISCOVERY`, `MCP_OAUTH_CONSENT_UI`, `CHATGPT_CONNECTION`, `AUTHENTICATED_READ_WRITE`, `MCP_GRANT_REVOCATION`, cada um `PENDING` até a evidência da fase. `health.readiness.chatgptLoginReady` só muda depois do gate 3, por edição explícita, nunca por inferência.

## 10. Testes (fixtures, sem rede e sem chamada paga)

- **Token:** par de chaves ES256 gerado no teste com `jose` (já instalado, 6.2.8); JWKS servido por `fetch` mockado; casos: válido; expirado; `iss` errado; sem `client_id`; assinatura de outra chave; `sub` sem grant (`grant_required`); grant revogado; Marca do documento fora do grant; escopo ausente; `agency_changed`; limite 60/min.
- **Metadata:** rota responde 404 com OAuth desligado; 200 com `resource`, `authorization_servers`, `scopes_supported` só OIDC; `Cache-Control` público curto; sem cookies.
- **HTTP boundary:** 401 traz `resource_metadata` apontando o próprio host; `Host` externo 403; `Origin` 403; bearer `mk_mcp_` recusado sem a flag; nada toca rede.
- **Consent domain:** Marcas elegíveis excluem as sem `redator:view`; escopos inválidos recusados; `consent_id` único por aprovação; não cria grant sem Marca.
- **Grants:** inserção com readback; unicidade ativa por `(actor, client, marca)`; revogação idempotente; reativação; listagem por Agência não vaza outra Agência.
- **Protocolo MCP:** `get_writer_connection_profile` devolve `brands`; `list_writer_documents` exige `brandId` com duas Marcas; ferramentas por `documentId` respeitam a Marca do documento.
- **Preflight:** `tests/mcp-oauth-preflight.test.mjs` já cobre o script; adicionar o caso "metadata com `scopes_supported` OIDC e discovery com `registration_endpoint`" = PASS.
- **Estáticos:** `redator-mcp-agency-boundary` passa a afirmar que emissão de bearer exige a flag e que a Agência tem revogação de grant.

Nenhum teste chama Supabase, Vercel, ChatGPT ou Telegram. `tests/run-all.js` e `test:real-db` seguem fora.

## 11. Riscos e mitigações

| # | Risco | Mitigação |
| --- | --- | --- |
| R1 | O ChatGPT pedir `writer.*` como escopo e o Supabase recusar com `invalid_scope` | `scopes_supported` só anuncia `openid email profile`; "Escopos padrão" vazio no ChatGPT; escopos de produto ficam no grant. Confirmar na fase 3. |
| R2 | O Supabase ignorar ou recusar `resource=` enviado pelo ChatGPT | Documentação não menciona o parâmetro; a validação de recurso é por `client_id` + grant. Se o `authorize` recusar, registrar e avaliar o hook de `aud` (D4) ou o plano B. |
| R3 | Registro dinâmico aberto | seção 6.2; monitorar `listClients`; revogar cliente apaga o registro. |
| R4 | Consentimento auto-aprovado esconder a escolha de Marcas | seção 6.3: `grant_required` com URL de autoatendimento. |
| R5 | Troca de chave JWT afetar sessões | chave anterior permanece válida para verificação; app usa `getUser` remoto; janela de baixo uso; registrar antes/depois. |
| R6 | Alterar Site URL quebrar links de e-mail | conferir valor atual antes; provavelmente já é o domínio da Vercel. |
| R7 | Plano do ChatGPT limitar ações de escrita em conectores personalizados | conferir Developer mode e o plano antes da fase 3; leitura funciona em qualquer caso. |
| R8 | `.well-known` interceptado pelo proxy | excluir do matcher; teste de boundary cobre. |

**Plano B**, só se R1 ou R2 se confirmarem na fase 3 e não houver contorno: servidor de autorização próprio na Vercel (`/api/oauth/{register,authorize,token}` com `jose`, PKCE, DCR e refresh rotativo), reutilizando a mesma tabela de grants e a mesma página de consentimento. Exige nova SDD; não é iniciado por esta.

## 12. Decisões pendentes para o aprovador

- **D1** Grant multi-Marca por consentimento (recomendado) ou uma Marca por consentimento.
- **D2** Quem pode consentir: qualquer usuário com `redator:view` na Marca (recomendado; a Agência revoga) ou somente owner/admin da Agência.
- **D3** Bearer `mk_mcp_`: manter atrás de `MCP_ALLOW_REMOTE_BEARER` como diagnóstico (recomendado) ou remover neste corte.
- **D4** Custom Access Token Hook para `aud = resource`: fase posterior (recomendado) ou incluir agora.
- **D5** Fase 4 (painel da Agência e `/conta`) no mesmo corte ou como corte seguinte após a homologação do ChatGPT.

## 13. Decisão

- [ ] aprovada para documentação somente
- [ ] aprovada para implementação no escopo descrito (fases 1 e 4 pelo agente; fases 0, 2 e 3 pelo usuário)
- [ ] bloqueada: decisão humana pendente
- Decisão, data e aprovador:
