# Proposta SDD — Aba Site e Sitemap no módulo Marca

## Status

Autorizada para implementação aditiva e retrocompatível nesta entrega.

> **Estado da execução — 2026-07-27:** a Fase A/B possui implementação local documentada no módulo Marca/Minerador, com ações explícitas, preview-first, brand-scoped e importação seletiva. A decisão de segurança server-side/SSRF, a separação de conteúdo legado e a regra de não exibir sucesso sem persistência continuam vigentes. A migration 0004, escrita remota e validação browser autenticada não foram executadas nesta auditoria.

## Problema

O endereço do site da marca é exibido dentro do cadastro de DNA/configurações e não possui uma área operacional própria. Isso dificulta localizar, revisar e salvar o endereço principal sem confundir contexto estratégico da marca com configuração do site.

## Decisão desta entrega

Adicionar a seção `Site e Sitemap` em `/{brandRef}/?secao=site` com uma configuração inicial do endereço principal do site. A seção será proprietária do módulo Marca e usará o campo legado `marcas.site_url` por meio do endpoint existente `/api/marcas`.

O valor legado não será apagado, renomeado ou migrado. A tela passa a ser a interface canônica para editá-lo, enquanto DNA e Configurações deixam de duplicar visualmente o campo. O salvamento continuará sujeito à autorização já aplicada pelo endpoint existente e só exibirá sucesso após a resposta persistida ser confirmada.

## Limites

Esta entrega não cria tabela, migration, integração externa, verificação HTTP, leitura de sitemap, catálogo de URLs, importação editorial ou alterações em Arquiteto, Radar, Planejador, Redator ou Publicações. Esses itens exigem contratos de persistência, segurança SSRF, autorização e consumidores próprios e ficam registrados para uma etapa posterior.

## Compatibilidade e integridade

- Marcas existentes continuam lendo `site_url` sem alteração de formato.
- URL vazia permanece permitida para não substituir estado válido por erro de validação local.
- A tela preserva o valor anterior quando o salvamento falha.
- O estado visual distingue edição, salvamento, sucesso e erro.
- O escopo permanece na marca ativa; a troca de marca reidrata o formulário.
- Não há chamadas externas automáticas ou chamadas pagas de IA.
- Nenhum dado publicado, DNA, versão, hash, evento ou anotação é alterado.

## Arquivos previstos

- `components/marca/site-sitemap-panel.tsx`: interface da seção e validação local do endereço.
- `modules/marca/brand-page.tsx` e `modules/marca/marca-page-entry.tsx`: registro da nova seção e remoção da duplicação visual do site; `components/product/operational-pages.tsx` é somente referência histórica.
- `tests/marca-site.test.mts`: testes puros de normalização/validação e compatibilidade.
- `tests/editorial-pipeline.test.mts`: regressão da navegação e preservação do cadastro legado.
- documentação de estado, backlog e especificação do módulo.

## Rollback

Reverter os arquivos acima restaura a navegação e a edição visual anterior. Como não haverá alteração de schema nem limpeza de armazenamento, o campo legado permanece recuperável pelo endpoint atual.

## Critérios de aceite

1. `/{brandRef}/?secao=site` abre a aba `Site e Sitemap`.
2. O endereço atual é carregado da marca ativa e pode ser salvo sem alterar outros campos.
3. URL `http`/`https` é normalizada; entradas inválidas não são persistidas.
4. DNA não exibe mais o site como dado de DNA e Configurações não mantém um segundo campo editável.
5. A marca e o valor legado permanecem isolados e compatíveis.
6. Testes direcionados, TypeScript, lint dos arquivos alterados e `git diff --check` passam.

## Continuação — fluxo real de sitemap, catálogo e importação

### Estado parcial auditado em 2026-07-21

- A aba já possui URL principal e salvamento retrocompatível em `marcas.site_url`.
- Não havia tabela, parser XML, store ou API de sitemap no código canônico.
- O Minerador lê e grava diretamente `listas_kgr` e `keywords_kgr` pelo cliente Supabase; não havia adaptador de importação de site.
- O pipeline compartilhado possui fallback local por marca e IndexedDB para artefatos, mas não possui entidades de site.
- Os arquivos canônicos de contratos compartilhados de importações, unidades editoriais, versionamento, persistência e autorização citados na solicitação não existem neste checkout; `docs/_arquivo` não foi usado como fonte.

### Arquitetura desta etapa

1. APIs server-side proprietárias de Marca executam teste/sincronização de sitemap e verificação explícita de páginas.
2. `lib/marca/site-fetch.ts` concentra parser XML/HTML, limites de resposta, redirects e SSRF.
3. `lib/marca/site-contracts.ts` tipa sitemaps, execuções, catálogo, verificações, candidatos, lotes e eventos.
4. O provider local usa IndexedDB com fallback localStorage por `brandId`; erro de parse não apaga o último estado válido.
5. A aba permanece a única interface do fluxo. Não há leitura automática ao abrir, crawler irrestrito ou uso de IA.
6. Keywords só podem ser enviadas de forma explícita e seletiva para uma lista/silo validado da marca; entram como `bruto`, sem volume, KGR, intenção ou aprovação inventados.
7. Artigos/páginas são mantidos no catálogo como conteúdo legado observado; não são convertidos em ArticleDNA, SiloDNA, ContentPlan ou documento editorial.

### Persistência

- A configuração principal continua em `marcas.site_url`.
- Sitemaps, catálogo, verificações, candidatos, lotes e eventos têm provider local identificado no estado da tela.
- A migration preparada `supabase/migrations/0004_brand_site_catalog.sql` descreve persistência remota futura e policies por marca, mas não é aplicada nem acessada como requisito desta entrega.
- O sucesso da UI local só aparece após a escrita confirmada pelo provider do navegador; respostas externas são mantidas apenas após validação do contrato.

### Segurança

- Nenhuma requisição externa sai do navegador.
- Somente HTTP/HTTPS e hosts do site principal são aceitos nesta etapa; domínios alternativos ficam pendentes de configuração persistida.
- DNS é resolvido antes do acesso; loopback, localhost, redes privadas, link-local, metadata e redirects não autorizados são bloqueados.
- Há limite de redirects, timeout, tamanho de resposta e `Content-Type`; HTML não é executado e não é armazenado integralmente.
- Cada API valida sessão, `brandId`, acesso à marca e pertencimento do destino ao site configurado.

### Consumidores e compatibilidade

- Marca consome `BrandProvider` apenas para resolver a marca ativa.
- Minerador não é reconstruído nem ganha uma lista paralela; a importação usa `keywords_kgr` e exige `lista_id` da marca.
- Arquiteto não é alterado; o contrato de transferência futura de conteúdo legado permanece no catálogo.
- DNA, Radar, Planejador, Redator e Publicações não são modificados.

## Correção direcionada — fila operacional de keywords — 2026-07-21

### Diagnóstico

- As candidatas estavam em `BrandSiteWorkspace.candidates`, persistidas por `brandId` no provider IndexedDB/localStorage e ligadas a `catalogEntryId`/`sourceUrl`.
- A tela só mostrava o contador e as candidatas dos conteúdos atualmente selecionados; não havia tabela global, detalhe por conteúdo ou evidência visual do resultado no Minerador.
- `extractCandidatesForEntry` gerava a frase completa e palavras isoladas de cada fonte, gerando ruído e inflando o contador.
- O envio criava um lote apenas depois da escrita remota; não existia prévia read-only nem registro de IDs retornados pelo Minerador.

### Correção implementada

- `SiteKeywordCandidate` passou a guardar papel sugerido, confiança compatível, status de erro, `mineradorKeywordId`, `importBatchId` e `sentAt`; workspaces antigos recebem defaults e convertem confiança numérica.
- A extração agora filtra stopwords/ruídos genéricos, evita palavras isoladas, deduplica por conteúdo e sugere no máximo uma candidata `possible_primary`; todas continuam observadas e não confirmadas.
- O catálogo ganhou a ação `Ver keywords`, com conteúdo, URL, origem, papel, confiança, status e ações de seleção/ignorar/reextrair.
- A aba ganhou `Keywords encontradas` com filtros por conteúdo, campo, papel, status e situação no Minerador.
- `/api/marca/site/import/keywords/preview` consulta duplicatas sem escrita. O lote só é criado localmente como `preview` e a escrita real acontece depois de `Confirmar importação`.
- O endpoint de importação retorna itens individuais, resultado, ID do registro no Minerador e resumo de novas/existentes/duplicadas/falhas. Nenhum registro existente é atualizado.
- Lotes locais mostram status, detalhes, link para o Minerador e seleção de somente falhas para nova revisão.

### Limites preservados

O fluxo não confirma keyword principal, não cria KeywordDNA/ArticleDNA/SiloDNA/ContentPlan, não inventa volume/KGR/intenção, não altera BrandDNA e mantém conteúdos legados separados. A escrita remota só ocorre pelo clique explícito de confirmação do usuário; testes usam fixtures.

### Rollback e limitações

- O lote de importação local é armazenado antes da escrita e pode ser marcado como falho/rollback; nenhum dado publicado é removido ou rebaixado.
- Reverter os arquivos da etapa remove o fluxo sem limpar IndexedDB/localStorage e sem aplicar schema remoto.
- Persistência remota do catálogo depende de aplicação manual da migration preparada.
- Verificação real depende de domínio acessível; testes automatizados usam fixtures e não fazem chamadas externas.
- Domínios alternativos, seleção de tipo de lista automática e transferência real ao Arquiteto permanecem fora desta etapa.

## Correção definitiva — confirmação real no Minerador — 2026-07-21

### Diagnóstico reproduzido

- O Minerador lê e grava `listas_kgr` e `keywords_kgr` via Supabase; o workspace de Site continua sendo apenas o catálogo local por marca.
- A sessão autenticada reproduziu a prévia com `brandId` da marca ativa, ID real de `listas_kgr` e duas candidatas. A resposta foi `200`, `persisted: false` e `status: preview`, sem escrita remota.
- A confirmação anterior fazia um `insert` bulk sem receber o ID retornado pelo repositório, consultava novamente toda a lista para inferir IDs por texto e podia marcar o lote local como concluído sem validar `persisted` e o status final.
- A lista de destino podia permanecer stale ao trocar de marca e falhas no carregamento das listas eram ocultadas como lista vazia.

### Decisão

- Consolidar `importSiteKeywordsToMinerador` em `lib/marca/site-minerador-import.ts`, com repositório injetável para fixtures e Supabase real.
- Validar marca/lista/candidatas antes da escrita, normalizar no serviço, consultar duplicatas na lista real e inserir uma candidata por vez com `insert(...).select("id,keyword")`.
- Persistir somente campos compatíveis com `keywords_kgr`: texto original, `lista_id`, `status: bruto` e proveniência em `analise_semantica.site_origin`; volume, KGR, intenção e DNA permanecem nulos/ausentes.
- O lote local só muda para resultado final após a resposta remota confirmar a persistência. Falhas retornam por item e não limpam a seleção.
- A interface passa a organizar o workspace em três modos mutuamente exclusivos: `Conteúdos`, `Keywords` e `Importação e lotes`, usando largura integral e barra de ação sticky.
- A sugestão de principal usa convergência determinística entre slug, H1 e início/título; continua sendo sugestão humana, sem confirmação automática.

### Escopo, rollback e validação

- Arquivos proprietários: `app/api/marca/site/import/keywords/route.ts`, `lib/marca/site-minerador-import.ts`, `lib/marca/site-parser.ts`, `lib/marca/site-reconciliation.ts`, `components/marca/site-sitemap-panel.tsx`, testes e documentação de Marca.
- Nenhuma alteração no componente do Minerador, schema, migration, storage local, dados publicados ou Supabase remoto.
- Rollback: reverter os arquivos da correção restaura o endpoint e a UI anteriores; nenhum dado local/remoto é apagado.
- Testes usam repositório fixture e não executam confirmação remota. A confirmação manual `enviar → abrir lista real → recarregar → reenviar` permanece necessária no ambiente autorizado.
