# Estado atual — Marca

## Estado operacional de marcas — registrado em janela anterior

Adalba e Lindisse permanecem documentadas como marcas isoladas, com owners distintos; Lindisse inicia vazia, os dados da Adalba são preservados, a troca de marca funciona e a navegação/Extensão acompanham `brandRef`. O registro é uma evidência operacional datada e não substitui smoke test autenticado ou validação remota nesta passada.

## Formação compartilhada — 2026-07-21

O Site/Sitemap agora preserva evidência de campos convergentes (`sourceFields`) e coerência de slug nas candidatas. A evidência segue para o Minerador sem promover KGR; a formação de artigo continua no Arquiteto. Testes locais cobrem candidata não-KGR e importação como `bruto`; confirmação autenticada real continua pendente.

- **Última auditoria:** 2026-07-20, código, documentação canônica e checkout local.
- **Funcionando:** seleção, leitura e atualização legada de marca; criação de convite com validação server-side; contrato e domínio de BrandDNA; painel estruturado com draft por marca. **Verificado no código.**
- **BrandDNA:** rota `/api/marca/brand-dna` implementada para listar versões, salvar sucessora imutável como `draft` e registrar aprovação humana separada. **Verificado por TypeScript e testes de domínio; persistência de ambiente ainda não validada.**
- **Persistência remota:** a rota usa `editorial_artifact_versions`/`editorial_version_status_events` previstos na migration 0002; a migration não foi aplicada nem executada nesta tarefa.
- **Fallback local:** `selected_brand_id` e draft de BrandDNA em `localStorage`, isolados por marca. O fallback é recuperação e não é fonte única de verdade.
- **Materiais, Skills e prompts:** contratos/estado local no pipeline; persistência própria e aprovação remota ainda não implementadas.
- **Equipe/permissões:** contratos, convites e autorização server-side existem; membership, edição granular de permissões, aceite e revogação ainda não estão expostos por API exclusiva de Marca.
- **Simulado:** nenhuma simulação nova foi adicionada.
- **Bloqueado:** validação manual/browser, confirmação do banco e aplicação de migration não realizadas.
- **Regressões/bugs:** nenhum confirmado no escopo Marca; o checkout já possuía alterações não consolidadas de outros módulos e foi preservado.
- **Arquivos centrais:** `components/brand-context.tsx`, `components/marca/marca-page-entry.tsx`, `components/marca/brand-dna-panel.tsx`, `lib/marca/domain.ts`, `app/api/marca/brand-dna/route.ts`.
- **Testes:** `tests/marcas-access.test.mjs`, `tests/marca-domain.test.mts`; `tsc --noEmit` passou.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** BrandDNA agora tem jornada de draft/aprovação implementada, mas depende da migration 0002 para persistência remota; materiais, Skills, prompts e gestão completa de equipe continuam parciais.
- **Limitação conhecida:** aprovação e supersessão de versões usam eventos append-only em duas escritas; a atomicidade transacional ainda precisa de RPC/migration validada.
### Atualização de continuidade — 2026-07-21

- **Implementado:** contratos Zod e reconciliação para sitemaps, execuções, catálogo, verificações, candidatos, lotes e eventos em `lib/marca/site-contracts.ts` e `lib/marca/site-reconciliation.ts`.
- **Implementado:** APIs server-side de teste, sincronização, verificação de página, consulta de listas do Minerador e importação seletiva em `app/api/marca/site/**`.
- **Implementado:** proteção de host, resolução DNS, redirects autorizados, timeout, limite de bytes e Content-Type em `lib/marca/site-fetch.ts` e `lib/marca/site-security.ts`.
- **Implementado:** fallback local identificado por marca em IndexedDB com fallback localStorage, sem limpeza e sem sobrescrever estado inválido durante a leitura.
- **Implementado:** prévia explícita de keywords e registro local de conteúdo legado; nenhum DNA, plano, documento ou estado publicado é fabricado.
- **Preparado, não aplicado:** `supabase/migrations/0004_brand_site_catalog.sql`, com entidades e RLS futuras. Nenhuma escrita remota ou chamada externa foi executada pelo agente.
- **Validação automatizada:** `node --test tests/marca-site.test.mts` passou 7/7; `npx tsc --noEmit`, lint direcionado, `git diff --check` e `npm run build` passaram.
- **Limitação:** não houve validação manual autenticada no navegador nem confirmação de persistência Supabase; domínios alternativos ainda não são cadastráveis nesta etapa.

## Site e Sitemap

### Navegação tenantizada — 2026-07-23

- O seletor do shell e o cartão de Admin entram na marca pela URL canônica baseada em marcas.id.
- A troca preserva somente módulo autorizado e parâmetros globais de interface; IDs de entidades não passam entre marcas.
- A sidebar concentra Conta, Admin global e saída. O reset editorial fica no cabeçalho do Arquiteto, fora da navegação geral.
- Validação remota de permissões por marca e teste manual autenticado permanecem pendentes.

### Integração aditiva com o Minerador — 2026-07-21

- Candidatas carregam situação técnica da URL, situação de publicação observada, relação keyword↔URL e situação arquitetural, sem inferir publicação ou arquitetura.
- A confirmação de relação é explícita no painel; `confirmed_primary` registra ator/data localmente, mas não altera Arquiteto nem cria publicação.
- A importação atualiza evidência de keywords existentes sem substituir semântica, métricas, intenção, DNA ou status editorial do Minerador.
- A validação local passou 14/14 testes focados. Migration `0004`, Supabase remoto, RLS e browser autenticado continuam não verificados.

### Fechamento da fila de keywords — 2026-07-21

- A contagem de candidatas agora é operacional: a tela oferece detalhe por conteúdo, fila global, filtros, seleção, ignorar, prévia real e confirmação.
- A prévia consulta o Minerador sem escrita; o lote local é marcado como `preview` antes da confirmação e só recebe `imported`, `partial` ou `failed` após a resposta do provider real.
- Keywords novas entram na lista existente como `bruto`, sem volume, KGR ou intenção inventados. Existentes não são sobrescritas e recebem o ID visualizado quando retornado.
- Candidatas antigas com confiança numérica continuam legíveis; novas extrações filtram palavras isoladas e sugerem papel sem confirmar decisão editorial.
- A validação automatizada desta correção passou 9/9 testes focados, TypeScript e lint direcionado; build e validação manual autenticada ainda são etapas separadas.

- **Implementado em 2026-07-21:** a aba `/{brandRef}/?secao=site` concentra a edicao do endereco principal e preserva `marcas.site_url` pelo PUT legado.
- **Validacao:** testes de URL, autorizacao de `/api/marcas`, regressao editorial, TypeScript e lint direcionado passaram. Nenhuma chamada externa, migration ou escrita remota foi executada pelo agente.
- **Limitacao:** multiplos sitemaps, verificacao HTTP, catalogo de URLs, health checks e importacao seletiva ainda nao possuem contrato ou persistencia nesta etapa.


### Correção funcional Site e Sitemap — 2026-07-21

- A navegação da aba dedicada permanece em `/{brandRef}/?secao=site`; o painel de revisão usa `painel=importacao` ou `painel=catalogo`, sem voltar para Visão geral após refresh ou ações locais.
- O reset do workspace foi corrigido: o carregamento agora depende da marca, não da alteração de `siteUrl`. Salvar a URL não limpa catálogo, filtros, seleções, prévias ou lotes.
- A aba dedicada ganhou dono de scroll vertical em seu conteúdo, mantendo o shell e o cabeçalho; tabelas continuam com rolagem horizontal própria.
- Preparar importação abre uma revisão visível no topo, começa com zero keywords e zero conteúdos autorizados e informa as contagens disponíveis. Keywords e conteúdos usam seleções independentes.
- O registro de conteúdo legado exige revisão e confirmação separadas e não cria keyword, DNA ou documento editorial.
- Validação automatizada desta correção: testes focados de navegação/revisão, TypeScript e lint direcionado. Validação autenticada no navegador, persistência remota e resposta real do Minerador continuam pendentes.
### Site e Sitemap — importação real no Minerador — 2026-07-21

- Auditoria autenticada confirmou que a tela do Minerador e a importação usam a mesma fonte remota: `listas_kgr`/`keywords_kgr`; o IndexedDB/localStorage guarda somente catálogo, candidatas e lotes locais da Marca.
- A prévia foi reproduzida com `brandId`, lista real e duas candidatas, sem escrita remota. A confirmação real permanece pendente por política operacional.
- Implementado `importSiteKeywordsToMinerador`: valida destino, normaliza, deduplica, preserva existentes, insere somente novas com `status: bruto`, registra `site_sitemap` e retorna ID real por item.
- A UI não marca sucesso quando `persisted` não é confirmado, preserva seleção em falha, reseta lista ao trocar marca, mostra erro explícito e usa os três modos `Conteúdos`, `Keywords` e `Importação e lotes` em largura integral.
- Sugestão de keyword principal agora exige convergência determinística de slug/H1/título; continua sem confirmação automática.
- Validação: testes focados do Site/Minerador, TypeScript e verificação browser com fixture passaram; confirmação manual `enviar → abrir lista real → recarregar → reenviar` ainda depende de autorização para escrita remota.
### Payload Site/Sitemap consumido pelo Minerador - 2026-07-22

- A confirmacao do lote continua explicita e o destino continua sendo uma lista existente validada para a marca.
- O payload aditivo agora pode registrar no `site_origin` a associacao do destino (`siloId`/`siloName`) e o instante de consolidacao, junto com URL resolvida, canonical e publicacao observadas.
- Nenhuma entidade nova, migration, publicacao automatica ou alteracao no Arquiteto foi executada; validacao remota e browser autenticado continuam pendentes.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/marca; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Implementado localmente: wrappers canônicos `/{brandRef}/...`, contexto de tenant resolvido no servidor e seleção autenticada de marcas.
- Limite: `brandId` é o tenant canônico e `brandRef` é a referência pública; owner, membership, plano e estado ativo continuam sujeitos às evidências/documentos de autorização e às validações remotas pendentes.
