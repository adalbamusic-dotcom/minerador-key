# Relatório de governança documental — 2026-07-27

## Precedência de consolidação — 2026-08-25

Este relatório permanece como fotografia da revisão de 2026-07-27. A fonte
canônica posterior registra DataForSEO como infraestrutura SERP compartilhada,
DeepSeek como IA canônica, Google Cloud Speech/Storage e YouTube como operações
compartilhadas e Telegram como Bot global da Plataforma. O Radar está aberto
para desenvolvimento (`READY_FOR_RADAR_DEVELOPMENT = YES`), mas coleta real,
persistência remota e inbound Telegram continuam gates separados. As passagens
abaixo que mencionam o provider SERP legado são preservadas como histórico da
fotografia anterior, não como contrato operacional atual.

## Escopo e segurança

Auditoria e atualização documental do Minerador Key. O conteúdo anterior do `AGENTS.md` foi preservado e recebeu somente a regra adicional de consulta à documentação do Next.js 16. Nenhum arquivo de produção, contrato TypeScript, rota, API, provider, schema, SQL ou migration foi alterado por esta tarefa. Não houve escrita remota, chamada paga, limpeza de localStorage/IndexedDB, execução de migration, commit, push ou deploy.

## Inventário e classificação

| Classe | Fontes e regra |
| --- | --- |
| Ativa canônica | `docs/00-produto/invariantes.md`, `glossario.md`, `fluxo-oficial.md`, `visao-geral.md`, `arquitetura.md`; `spec.md`, `estado-atual.md` e `backlog.md` dos módulos; contratos compartilhados vigentes. |
| ADR aceita | ADRs aceitas em `docs/00-produto/decisoes/`, incluindo Site/Sitemap, proteção de publicados, SiloPage, tenantização e FK `RESTRICT`, sempre subordinadas às notas de estado atuais. |
| SDD/proposta aprovada ou implementada localmente | Propostas de Site/Sitemap, sincronização com Minerador, contrato autenticado da extensão, recuperação/formação do Arquiteto, Radar/SERP, Planejador, Redator e Publicações, quando o próprio documento registra implementação local. |
| Proposta não aprovada ou dependência externa | Documentos que ainda pedem aprovação, migration, schema, provider, RLS remoto, autenticação ou validação manual. A proposta não é evidência de implementação. |
| Histórica | `docs/_arquivo/**`, snapshots internos dos SDDs e trechos explicitamente marcados como pré-aplicação. Não são fonte de verdade atual. |
| Supersedida | Trechos que usam `/workspace`, `brandUserId` como rota final, dizem que 0005/0006 não foram aplicadas ou tratam `operational-pages.tsx` como consumidor atual. Foram anotados, não apagados, para preservar proveniência. |
| Contraditória/unverificável | Alegações sem confirmação de código, teste, browser autenticado, provider real ou estado remoto. Permanecem qualificadas como pendentes, não como fato. |

## Regras consolidadas

- Tenant canônico: `brandId = public.marcas.id`.
- Relações distintas: `ownerUserId = marcas.owner_user_id`, `memberUserId = brand_memberships.member_user_id`, `actorUserId = auth.users.id/auth.uid()`.
- Rota canônica: `/{brandRef}`, onde `brandRef = slug-da-marca--brandId`. `/workspace` não é rota atual.
- `selected_brand_id`, localStorage e IndexedDB não autorizam acesso nem substituem estado válido.
- A Extensão resolve marcas autorizadas por contrato server-side e envia keywords ao Minerador; o Minerador qualifica e é proprietário do KeywordDNA. Não há fallback silencioso para outra marca.
- O Radar consome ArticleDNA e evidências recebidas; não reagrupa keywords, não redefine papéis e não troca principal.
- Os efeitos de 0005/0006 são considerados existentes conforme o resultado remoto registrado em `docs/compartilhado/supabase.md`; não reexecutar nem reverter. A 0006 registrou validation `READY` e a FK canônica é `ON DELETE RESTRICT`.
- Site/Sitemap permanece preview-first, explícito, seletivo, idempotente e brand-scoped. Conteúdo legado não vira keyword nem DNA automaticamente. A migration 0004, persistência remota dedicada e validação autenticada continuam pendentes.
- Publicados preservam marca, URL, slug, canonical, principal, versões, hashes, eventos e anotações. IA, SERP e sugestões não equivalem a decisão humana.

## Arquivos atualizados nesta auditoria

- Contrato de autorização, arquitetura, visão geral, fluxo oficial e README documental global.
- ADR/propostas de tenantização e migrations 0005/0006, com distinção entre snapshot pré-aplicação e estado vigente.
- Persistência local, Supabase compartilhado e regras compartilhadas.
- `spec`, `estado-atual`, `backlog` e propostas de Marca, Minerador, Arquiteto e Radar diretamente afetados.

As mudanças foram aditivas e documentais: regras atuais foram registradas no início dos documentos quando havia risco de leitura equivocada, e os trechos históricos foram mantidos para auditoria. Consumidores de código e contratos públicos não foram alterados.

## Validação executada

- `git diff --check`: passou; o Git exibiu apenas avisos preexistentes de normalização LF/CRLF.
- Busca de referências stale em Markdown fora de `docs/_arquivo`: executada; ocorrências restantes de `/workspace`, `brandUserId` e “não aplicada” ficam em snapshots/propostas históricas ou são qualificadas como alias/limitação.
- Conferência dos caminhos canônicos no código: `app/(brand)/[brandRef]`, `lib/tenant-routing.ts`, API da extensão e wrappers dos módulos.
- Verificação simples de links Markdown locais fora de `docs/_arquivo`: 23 links analisados, 0 quebrados na segunda passada.
- Build, testes de aplicação, browser autenticado, Supabase remoto, migrations, providers e IA: não executados por regra operacional.

## Pendências da revisão de 2026-07-27 — histórico

Continuam dependentes de ação manual e evidência externa: login/Chrome real da extensão, execução autenticada real do provider SERP legado, smoke test e validação da persistência remota, RLS remoto, migration 0004, validação browser do recovery do Arquiteto e confirmação visual dos fluxos. O provider SERP legado estava integrado no código e testado com fixtures naquela fotografia; nenhuma dessas pendências foi convertida em “concluída” por documentação.

## Segunda passada arquitetural — 2026-07-27

Esta atualização preserva a primeira passada e incorpora somente fatos conferidos no código e no SQL local:

- `app/(admin)` e `app/(brand)/[brandRef]` foram confirmados; o detalhe do Radar usa `/{brandRef}/radar/{articleId}`. Os grupos de rota não aparecem na URL.
- `modules/` é a camada funcional dos módulos; `lib/` concentra infraestrutura, autorização, Supabase, contratos e serviços; `app/api/` concentra operações server-side; `supabase/` guarda migrations, dry-runs, validações e rollbacks.
- A criação de marca usa endpoint server-side, pesquisa `auth.users` somente no servidor, revalida o owner, cria `owner_user_id` e membership owner ativa, cria listas iniciais quando solicitadas e tenta compensação em falhas posteriores. O sucesso depende da consistência retornada.
- O SQL local foi conferido para `brand_roles`, `brand_memberships`, `brand_member_permissions`, `brand_id NOT NULL`, `lista_id NULLABLE`, funções tenantizadas, RLS, policies e grants. A documentação não transforma essa leitura em validação remota.
- A fotografia operacional 147 keywords / 126 sem lista / 21 com lista / 0 sem `brand_id` foi registrada no estado do Minerador como dado datado de 27/07/2026, fora de invariantes, specs e ADRs.
- Supabase Auth ficou descrito como decisão aprovada, porém pendente; NextAuth permanece consumidor atual temporário, Google OAuth suspenso e `service_role` server-side.
- O README passou a orientar navegação e a marcar o resumo antigo como snapshot histórico, evitando que a primeira descrição da regressão do Arquiteto ou da SERP seja lida como estado atual.

Documentos diretamente atualizados nesta segunda passada: `docs/00-produto/arquitetura.md`, `visao-geral.md`, `invariantes.md`, `docs/compartilhado/autenticacao-e-permissoes.md`, `supabase.md`, `docs/README.md`, estados do Admin/Marca/Minerador/Radar e specs do Minerador/Arquiteto/Radar. Nenhum documento histórico foi reescrito.

Validação desta segunda passada: `git diff --check` terminou com código 0, emitindo somente avisos de normalização LF/CRLF do checkout; 23 links Markdown locais foram conferidos e nenhum quebrou. A busca final ainda encontra frases de aplicação em snapshots/propostas qualificadas como históricas; não há autorização documental vigente para reexecutar 0005/0006.

## Correção final de governança — 2026-07-27

- A política de arquivos compartilhados foi corrigida em `ADR-006`, `docs/compartilhado/README.md` e no README raiz: mudanças aditivas, mínimas e retrocompatíveis podem avançar dentro da tarefa autorizada quando consumidores e regressão forem registrados; mudanças estruturais ou incompatíveis exigem SDD e autorização.
- Os ADRs globais foram desduplicados: o ADR de KGR agora é `ADR-020-kgr-slug-e-formacao-de-artigos.md` e o ADR de tenantização agora é `ADR-021-roteamento-tenant-brand-ref.md`. `ADR-007-localstorage-nao-e-fonte-unica.md` e `ADR-014-criacao-manual-silo-silopage.md` foram preservados.
- O ADR-008 registra o refinamento da política da principal publicada: URL, slug, canonical e marca permanecem protegidos; a principal pode estar travada ou revisável, sempre com Arquiteto, decisão humana, sucessora versionada e histórico.
- A proposta ativa de Marca foi alinhada a `app/(brand)/[brandRef]`, `modules/marca` e APIs/libs reais. Referências a `app/(workspace)`, `brandUserId` ou `components/product/operational-pages.tsx` que permanecem em snapshots e propostas históricas foram preservadas e qualificadas como históricas.
- `docs/README.md` lista apenas ADRs existentes e separa documentos planejados dos documentos presentes. O README raiz documenta as rotas globais, tenantizadas e o detalhe do Radar.
- `AGENTS.md` passou a exigir consulta à documentação local do Next.js 16 em `node_modules/next/dist/docs/` antes de mudanças em rotas, APIs, cache, proxy/middleware ou convenções.
- O topo do estado do Radar naquela fotografia distinguia provider SERP legado server-side, testes com fixtures, ausência de coleta autenticada real validada, dependência de migration/validação manual para persistência remota e fallback local sem equivalência a persistência remota.
- Os arquivos temporários de auditoria (`.next-codex-verify/`, `.codex-page-lint.txt`, `arquivos-nao-rastreados.txt`, `diff-completo.patch`, `diff-documentacao-completo.txt`, `diff-documentacao.patch` e `status-completo.txt`) estavam fora do escopo documental desta revisão histórica; a consolidação pós-refresh removeu os artefatos descartáveis ainda presentes, sem alterar documentos canônicos, migrations ou código funcional. Os novos arquivos documentais continuam não rastreados até o stage manual do usuário.
