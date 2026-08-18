# SDD — Aba Descobrir Keywords

## Estado vigente após a remoção da Extensão — 2026-08-04

O MVP da Descoberta permanece concluído e não depende de uma Extensão Chrome. A Extensão, bridge, background, leitor, scripts injetados e rotas exclusivas foram removidos do produto.

Google Ads Keyword Ideas continua sendo a fonte canônica da Descoberta para volume, histórico, CPC e concorrência Ads; concorrência Ads não é KD. DataForSEO é o provider server-side de allintitle nas duas abas; o total vem somente de `se_results_count`. Serper permanece exclusivo do Radar.

A Descoberta continua carregando, filtrando, selecionando e importando candidatas pelo núcleo compartilhado. O Processador continua organizando keywords e usando Google Ads. Resultados históricos, KGR, métricas atuais de candidatas, histórico técnico e migrations permanecem preservados; não há remoção de dados nem alteração remota nesta decisão.

O executor allintitle server-side está implementado localmente em `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts`. Não restaurar bridge, background, filas Chrome, rota `/api/extensao/...` ou instruções de `chrome://extensions` como solução provisória.

## Fase 8 — DataForSEO allintitle — implementação local

O cliente `lib/minerador/dataforseo-serp-core.ts` usa `POST /v3/serp/google/organic/live/regular`, consulta `allintitle:"<keyword>"`, `depth = 10`, `device = desktop` e `tag = operationRequestId`. A normalização exige task concluída, keyword/localidade/idioma correspondentes, timestamp e `se_results_count` inteiro não negativo. `items_count`, itens retornados e `organic.length` não são usados como total.

O endpoint aceita `keywordIds` para o Processador e `candidateIds` para a Descoberta, sempre relendo os registros dentro do `brandId` autorizado. Candidata não importada atualiza somente `minerador_discovery_candidate_current_metrics` e seu histórico; candidata importada atualiza a keyword oficial vinculada e mantém a projeção coerente. Keyword oficial atualiza `keywords_kgr`, histórico semântico e KGR quando aplicável, preservando decisões humanas, status, lista e silo.

O primeiro catálogo DataForSEO aceita Brasil e português. UFs Google Ads não são assumidas como códigos DataForSEO, não são somadas e retornam erro estruturado até haver catálogo validado. Sem credenciais, a ação permanece compreensível e não inicia chamada paga.

As seções Fase 7/Fase 8 abaixo permanecem como histórico da implementação e ficam subordinadas a este estado vigente.

## Fase 7 — fechamento do MVP — decisão vigente — 2026-08-04

**Descobrir Keywords — MVP funcionalmente concluído.**

O estado manualmente validado inclui a rota tenantizada, pesquisa nacional Google Ads, targeting com uma, duas e sete UFs, São Paulo, Minas Gerais, São Paulo + Minas Gerais, filtro de volume, persistência da execução, restauração após reload, preservação da última pesquisa válida em falha, importação explícita de candidata nova, persistência remota, aparecimento no Processador, entrada como `bruto` sem lista automática e uso do núcleo compartilhado entre Extensão e Descoberta.

Google Ads Keyword Ideas é a fonte canônica da Descoberta para volume, histórico, CPC e concorrência Ads. Concorrência Ads não é KD. KGR e allintitle permanecem no Processador; a extração antiga de sugestões da Extensão é legado e não é fonte concorrente.

A Extensão não é mais necessária para descoberta ou importação. Ela permanece como executor produtivo de allintitle, consumido pelo Processador para keywords oficiais e pela Descoberta para candidatas, com background, bridge, CAPTCHA, pausa, retomada e notificações. Não duplicar nem remover a Extensão enquanto esses fluxos dependerem desse executor.

As regressões manuais não bloqueantes são: candidata já existente; repetição sem duplicação; retry idempotente; isolamento da importação entre Adalba e Lindisse; e conferência visual completa em dark mode e nos breakpoints. Exportar candidatas, Resultados, KD, SERP, histórico navegável de pesquisas, municípios, conexão Google Ads por agência, remoção da RPC antiga e remoção do código legado da Extensão permanecem no backlog.

Os objetos legados `public.import_minerador_discovery_candidates`, `minerador_discovery_normalize_keyword`, migrations 0011/0012, `executeMining` e `extractSuggestionsLegacy` não são removidos nesta fase. Os dois primeiros não têm consumidor produtivo; as migrations registram a RPC antiga; os dois últimos são candidatos a remoção futura.

## Fase 8 — auditoria e SDD mínima — implementação local autorizada

O bloqueio estrutural foi resolvido no checkout local pela projeção atual tenantizada de candidatas, pelo histórico append-only e pelo protocolo aditivo da Extensão. A migration `0013_minerador_discovery_candidate_current_metrics.sql` foi criada, mas permanece pendente de aplicação manual.

### Resultado da auditoria

O executor da Extensão é reutilizável e continua sendo a única fonte técnica de allintitle: `background.js`, bridge, leitor, protocolo `minerador.allintitle.measure.v2`, rota `resultados-allintitle` e o ciclo de CAPTCHA, pausa, retomada, cancelamento, timeout e notificações. Não deve ser reconstruído.

Entretanto, `minerador_discovery_candidates` não comporta a nova capacidade: não há allintitle atual, estado, executor, erro sanitizado ou histórico. O protocolo atual exige `keywordId` oficial, enquanto a Fase 8 exige medir candidatas não importadas sem importá-las automaticamente. A implementação fica interrompida antes de rotas, bridge ou schema.

### Proposta mínima

1. Criar, mediante migration futura aprovada, uma persistência tenantizada de medições allintitle por `brand_id + discovery_candidate_id`, com valor atual, status, provider, executor, erro sanitizado, `measured_at`, lote e histórico técnico.
2. Evoluir aditivamente o contrato do executor para `subjectType: "keyword" | "discovery_candidate"`, mantendo `keywordId` obrigatório para keywords oficiais e usando `candidateId` persistido para candidatas não importadas.
3. Fazer a rota server-side resolver marca, candidata, keyword vinculada e permissões; o navegador não fornece texto ou `brandId` como fonte de verdade.
4. Na importação, transferir a medição confirmada da candidata para a keyword oficial na mesma operação, preservando a proveniência e sem disparar nova medição.
5. Quando a candidata já tiver `imported_keyword_id`, Descoberta e Processador devem ler a medição atual da keyword oficial, sem dois valores ativos concorrentes.

### Regra operacional obrigatória

Somente após persistência confirmada a nova medição substitui allintitle, volume, histórico mensal, CPC, concorrência Ads, targeting, provider, versão e `measured_at` atuais. O KGR é recalculado usando os valores atuais. O histórico anterior é somente auditoria.

Qualquer falha, ausência, quota, CAPTCHA ou resposta não confirmada preserva integralmente os valores atuais, `measured_at` e KGR, sem `null`, zero artificial ou média entre versões. Em lote parcial, somente itens confirmados são substituídos.

### Autorizações necessárias antes da implementação

- aprovar a persistência e sua RLS;
- aprovar a extensão aditiva do protocolo da Extensão;
- aprovar a transferência de medição na importação;
- definir a política de retenção do histórico técnico;
- executar a migration somente em ambiente autorizado.

## Atualização de execução e targeting — 2026-08-03

A tela separa três estados: `DiscoverySearchDraft` representa somente a próxima consulta; `ExecutedDiscoverySearch` é o snapshot em memória da última pesquisa concluída, com `rawCandidates`, `acceptedCandidates`, targeting sanitizado, resumo e timestamp; a organização da tabela permanece local e independente. Alterar seed, modo, intenção preliminar, funil, idioma, UFs, volume, CPC ou termos não altera a tabela nem chama Google Ads. Somente `Descobrir Keywords` cria novo snapshot; em falha, a tabela válida anterior permanece visível.

O cliente envia códigos internos de UF. O servidor resolve os resources do catálogo brasileiro, rejeita UF desconhecida e limita a dez UFs antes da chamada. `Todos os estados` envia somente Brasil; UFs específicas não são combinadas com Brasil. As métricas de várias UFs representam o conjunto da pesquisa, não um valor individual por estado. A coluna mostra nomes humanos e o número de estados; uma comparação por UF exigirá consultas individuais e contrato futuro.

Status: **MVP da Descoberta funcionalmente concluído; migrations e objetos legados permanecem documentados conforme o estado vigente.**

## Fase 4 — Persistência tenantizada da Descoberta — decisão aprovada

Esta fase aprova a persistência local de `DiscoveryRun` e `DiscoveryCandidate`, sem autorizar a execução remota da migration. A Descoberta continua separada do Processador: candidatas persistidas não entram em `keywords_kgr` e não são enviadas automaticamente ao Arquiteto.

### Schema definitivo da fase

Os nomes canônicos da migration são `public.minerador_discovery_runs` e `public.minerador_discovery_candidates`.

`minerador_discovery_runs` registra uma execução completa por `brand_id`, `actor_user_id` e `operation_request_id`, incluindo seed original/canônica, configuração executada, targeting efetivo, filtros, provider/version, moeda/fuso, status, contagens, truncamento e timestamps. A chave única `(brand_id, operation_request_id)` impede duplicação da mesma operação. Execuções concluídas são imutáveis no fluxo desta fase.

`minerador_discovery_candidates` registra todas as candidatas normalizadas da execução, não somente as aprovadas. Preserva keyword original/canônica, relação, métricas, histórico mensal, targeting, filtro e motivos, referência a keyword existente e `import_status`. A tabela exibida pela Descoberta consulta apenas candidatas aprovadas; candidatas filtradas continuam disponíveis para auditoria e não entram no Processador.

As relações são `marcas → discovery_runs → discovery_candidates`, com `ON DELETE RESTRICT`, índice por tenant/data e unicidade da chave da candidata dentro da execução. Um guard de tenant impede candidato com `brand_id` divergente do run. Não há exclusão em cascata de histórico nesta fase.

### Persistência, idempotência e reload

O POST valida o tenant, a conexão e o draft, consulta uma operação já persistida antes de chamar o Google Ads, executa a pesquisa, normaliza, classifica filtros e persiste run/candidatas em uma operação server-side transacional. Somente depois da confirmação da escrita o cliente substitui o snapshot exibido. Repetição do mesmo `operationRequestId` devolve o run existente sem nova chamada Google Ads.

O GET da mesma rota carrega a última execução `completed` ou `partial` da marca, sem chamada ao Google Ads. Ele restaura o snapshot e a configuração executada; o draft continua editável e a organização/seleção continuam locais ao navegador.

Falha do provider não cria run concluído. Falha de persistência retorna erro estruturado e preserva o snapshot anterior. `pending`, `completed`, `partial` e `failed` permanecem estados técnicos distintos; sucesso só é emitido após escrita confirmada.

### RLS, segurança e rollback

As duas tabelas têm RLS habilitado, não concedem acesso a `anon` e usam `can_access_brand`/`tenant_actor_has_permission` para leitura e escrita autenticadas. A rota também resolve o contexto server-side por `brand_id` canônico e permissão `minerador:edit`; owner, membership ativa e admin global são avaliados pelo contexto existente. Nenhum slug, owner ou valor do navegador substitui o tenant. Segredos, tokens, headers, customerId/MCC completos e resposta bruta sensível não são persistidos.

O rollback da fase é remover a rota de leitura/escrita e a tela continuar exibindo somente o comportamento anterior, sem apagar `keywords_kgr`. A migration é aditiva e não contém limpeza de dados. Antes de aplicá-la, o usuário deve revisar snapshot, RLS e dependências; a aplicação remota continua pendente.

## Problema

### Intenção preliminar e filtro futuro

Na Fase 3, a intenção preliminar é um contexto único da consulta e é exibida igualmente nas candidatas carregadas. Por isso a Linha 2 não possui filtro de intenção: ele seria redundante e não reduziria a coleção. Um filtro de intenção só poderá ser reintroduzido quando existir uma classificação individual por candidata, identificada na interface como `Intenção sugerida`; essa classificação não é implementada nesta fase.

O Minerador atual concentra descoberta, planilha operacional, medições, KGR, decisões humanas e encaminhamento editorial em uma única tela. Isso mistura candidatas temporárias com keywords já importadas e qualificadas, dificulta a leitura da origem dos dados e torna arriscado duplicar a interface para uma nova jornada.

## Objetivo e fronteiras

Criar duas áreas explícitas, ambas no módulo Minerador:

- `/{brandRef}/minerador/descobrir`: pesquisa, filtros de descoberta, seleção e importação explícita;
- `/{brandRef}/minerador`: Processar Keywords, mantendo a planilha atual como rota canônica para métricas, qualificação, KGR, decisão humana e envio ao Arquiteto.

As fases iniciais não alteram o Processador, não removem a Extensão, não criam KD aproximado e não alteram Arquiteto ou Radar. A Fase 4 aprova somente a migration local e o código de persistência descritos nesta SDD; a migration não é aplicada nesta tarefa.

## Auditoria atual

### Tabela e seleção

- `modules/minerador/minerador-workspace.tsx` contém a tela Processar, os filtros, a tabela, a barra inferior, ações de métricas/KGR e detalhes. Ela não deve ser copiada para a Descoberta.
- `lib/minerador/keyword-selection.ts` já contém a lógica pura de clique individual, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, selecionar visíveis e pintura por intervalo visual. É a base compartilhável confirmada.
- `lib/minerador/table-view.ts` deriva a visão filtrada e ordenada sem mutar a coleção; `lib/minerador/last-organization.ts` e `modules/minerador/last-organization-restorer.tsx` guardam a preferência local do Processador.
- O Processador possui barra inferior, contador de selecionadas, estado vazio e controles de organização, mas ainda os compõe dentro do workspace monolítico.

### Dados, métricas e publicação

- `keywords_kgr` é a projeção operacional persistida, tenantizada por `brand_id`; `lista_id` é opcional. A keyword sem lista já é válida.
- `volume_search`, `results_allintitle`, KGR e `analise_semantica` pertencem à keyword processada. Volume Google Ads é versionado em `minerador_keyword_metric_measurements` e não deve ser usado para produzir KD.
- Keywords publicadas preservam identidade estrutural. A Descoberta não toca em publicadas, slug, canonical, Principal, Silo ou status editorial.

## Interface contratada

### Linha 1 — consulta base

- keyword principal, serviço ou nicho;
- intenção preliminar;
- funil preliminar;
- país;
- estados/UF;
- ação `Descobrir Keywords`.

Esses campos são critérios de descoberta, não aprovação editorial e não preenchem intenção/funil da keyword importada sem confirmação posterior.

### Linha 2 — tipo de descoberta

- Todas as palavras-chave;
- Concordância ampla;
- Concordância de frase;
- Concordância exata;
- Relacionadas;
- idioma.

Os modos precisam ser mapeados para o contrato oficial do provider na fase de integração. Enquanto não houver mapeamento confirmado, a interface não promete semântica de correspondência que o provider não ofereça.

### Linha 3 — filtros e critérios

- range de Resultados — futuro, depende de Serper ou provider explícito de contagem; não cria resultado orgânico nem allintitle falso;
- range de Volume — usa somente métrica oficial normalizada quando disponível;
- KD — futuro e dependente de Serper/evidência própria; concorrência Ads não é KD;
- intenção;
- CPC na moeda validada da conta anunciante;
- incluir palavras-chave;
- excluir palavras-chave;
- `Limpar filtros`.

Todos os filtros devem expor estado vazio e motivo agregado; ausência de dado não pode ser convertida em zero, KD ou resultado inventado.

## Pipeline antes da tabela

`Google Ads → normalização neutra → classificação de relação → filtros → deduplicação → identificação de existentes → tabela de candidatas aprovadas`.

O resumo da execução apresenta `encontradas`, `aprovadas`, `filtradas` e motivos agregados. Uma candidata existente em `keywords_kgr` é identificada pela chave normalizada e marca; não é reimportada. Duplicatas dentro da execução são agrupadas sem apagar a evidência da origem.

## Componentes compartilhados propostos

Extrair somente após a primeira tela contratada e coberta por regressão:

1. `KeywordDataGridShell`: cabeçalho, tabela, ordenação declarativa, empty state, densidade e slots de colunas/linhas; sem regra de negócio.
2. `KeywordSelectionController`: composição React sobre as funções puras existentes, com âncora, Ctrl/Cmd, Shift, pintura, selecionar visíveis e contador.
3. `KeywordBatchActionBar`: contador, ações recebidas por slot e sem handlers internos de negócio.
4. `KeywordDiscoveryFilters`: as três linhas da Descoberta; não reutiliza filtros do Processador sem compatibilidade explícita.

Consumidores previstos: Processar Keywords e Descobrir Keywords. A extração deve preservar comportamento visual, teclado, pintura e seleção do Processador antes de qualquer migração de consumidor.

Permanece exclusivo do Processador: conexão/Extensão, allintitle, atualização de métricas, elegibilidade de volume, KGR, intenções definitivas, nicho, funil definitivo, política de Principal, Silo/Categoria, status editorial, histórico operacional e envio ao Arquiteto.

## Persistência conceitual

Os nomes e contratos definitivos da Fase 4 estão aprovados na seção acima e serão materializados somente pela migration local desta tarefa. A aplicação da migration no banco é uma operação manual ainda pendente.

### DiscoveryRun

Execução tenantizada de descoberta: `brandId`, ator, consulta, targeting, filtros, provider/version, timestamps, resumo, estado e proveniência sanitizada. É imutável após conclusão, salvo campos técnicos de encerramento.

### DiscoveryCandidate

Candidata vinculada a um `DiscoveryRun`: texto original/canônico, relação com a consulta, métricas retornadas, motivos de filtro, deduplicação, referência a keyword existente quando houver, seleção local e estado de importação. Não é KeywordDNA nem keyword editorial.

A decisão de persistência (tabelas, RLS, retenção, índices, idempotência e rollback) depende de auditoria de schema e SDD complementar aprovada antes de migration.

## Importação contratada

`Enviar selecionadas ao Processador` é explícita, seletiva, idempotente e tenantizada. O servidor resolve ator e `brandId`, recusa candidatos de outra marca e registra a origem `discoveryRunId`.

Para novas entradas, cria keyword Bruto, Keyword livre, sem lista artificial e sem Silo/Categoria. Preserva métricas oficiais, targeting e proveniência recebida. Não atribui KGR, status editorial, Principal, silo, intenção/funil definitivos nem envia ao Arquiteto. Existentes não são duplicadas; devem receber resultado individual `já existente` com referência segura.

## Segurança e tenantização

Todas as operações server-side usam a marca canônica da rota e autorização `minerador` apropriada. `brandRef`, texto da keyword, país ou dados do navegador não substituem `brandId`. Tokens OAuth, developer token, client secret, refresh token, customerId completo e MCC completo nunca entram na tabela ou no navegador além do contrato já sanitizado.

## Riscos e rollback

- Duplicar o workspace atual pode gerar regressões de seleção e filtros; mitigação: shell declarativo e regressões do Processador antes da troca.
- Provider pode não oferecer os modos/filtros prometidos; mitigação: capability flags e campos futuros desabilitados até contrato real.
- Confluir concorrência Ads e KD induz decisão falsa; mitigação: campos e proveniência separados.
- Discovery persistente sem RLS/idempotência pode misturar marcas; mitigação: SDD de schema posterior com migração manual, snapshot e rollback.
- Importação pode duplicar keywords ou alterar publicados; mitigação: deduplicação server-side por marca, resultado individual e guardas de publicação.

Rollback de interface: remover o link/rota da Descoberta sem tocar no Processador. Rollback de persistência é decisão posterior, documentada junto da migration; nenhuma candidata importada é apagada automaticamente.

## Fase 8 — métricas atuais e allintitle nas duas áreas

### Decisão e implementação local

A Descoberta e o Processador compartilham os executores existentes. A Extensão continua responsável pela fila, leitura do Google, parser, CAPTCHA, pausa, retomada e notificações; a Descoberta apenas envia alvos de candidata pelo protocolo aditivo. O Processador continua enviando keywords oficiais pelo mesmo protocolo.

Foi criada a migration aditiva `0013_minerador_discovery_candidate_current_metrics.sql`, ainda não executada. Ela cria uma projeção atual única por candidata e um histórico append-only separado do snapshot de `DiscoveryRun`. A substituição operacional ocorre somente depois de persistência confirmada; falhas preservam os valores anteriores.

O contrato de volume aceita `candidateIds` junto dos `keywordIds` existentes. A rota de métricas Google Ads usa a conexão e targeting da marca, grava a projeção atual da candidata e preserva a proveniência. Candidatas importadas registram a keyword oficial vinculada para manter as duas abas coerentes.

### Limites de validação

Validações locais: testes direcionados, TypeScript e lint direcionado. Ainda dependem de aplicação manual da migration, smoke autenticado no Chrome e regressão de idempotência, candidata existente, retry, isolamento entre marcas e conferências visuais. Não foram executados SQL remoto, migration, chamadas pagas ou deploy.

## Fases de implementação

1. Criar rota, navegação e tela estática com as três linhas e capability states, sem provider nem persistência.
2. Extrair e migrar o shell visual/seleção com testes de regressão do Processador.
3. Integrar Google Ads para ideias/métricas oficiais, normalização e resumo em memória; testes com fixtures, sem chamadas pagas.
4. **Implementar localmente a persistência tenantizada de `DiscoveryRun`/`DiscoveryCandidate`, RLS, idempotência, reload e rollback; migration remota permanece pendente.**
5. Implementar a importação explícita e idempotente ao Processador em fase separada.
6. Integrar filtros futuros de Resultados/KD somente após provider Serper aprovado e contrato explícito; validar browser, multi-marca e dados reais.

## Testes e critérios de aceite futuros

- rota Descobrir exige a mesma autorização tenantizada do Minerador;
- Processador preserva rota, tabela, seleção, filtros, ações e dados;
- clique, Ctrl/Cmd, Shift, pintura e selecionar visíveis funcionam igual nos dois consumidores;
- filtros não mutam coleção original, seleção não decide renderização e empty state é claro;
- importação é seletiva, idempotente, sem lista artificial e isolada por marca;
- inexistência de volume, Resultados ou KD não vira zero nem dado sintético;
- publicadas permanecem protegidas;
- dark mode, teclado, foco, 360/768/1024/1440px e validação manual autenticada são conferidos antes de homologar.

## Decisões futuras, sem bloquear o MVP

1. retenção posterior de DiscoveryRun/DiscoveryCandidate;
2. regra de atualização quando candidata corresponde a keyword existente;
3. provider, método e semântica de Resultados/KD futuros;
4. limite de custo, lote e rate limit por marca/provider.

## Fase 5 — envio explícito ao Processador

### Escopo implementado localmente

A Fase 5 adiciona o caminho explícito `Descobrir Keywords → Processar Keywords` sem importar automaticamente durante pesquisa, reload, filtro, ordenação ou seleção. A interface envia somente `candidateIds` técnicos persistidos e um `importRequestId` UUID; o servidor recarrega a candidata e toda a proveniência a partir do banco.

O endpoint tenantizado é `POST /api/minerador/marcas/{brandId}/discovery/import`. Ele exige a permissão `minerador:create`, valida a marca canônica e delega a criação/deduplicação ao núcleo server-side compartilhado do Minerador, não à RPC histórica. A URL final do Processador permanece `/{brandRef}/minerador` e não há redirecionamento automático.

### Migration aditiva e histórico da implementação

`supabase/migrations/0010_minerador_discovery_import.sql` cria, sem alterar a `0009`:

- `minerador_discovery_import_batches`, com `importRequestId` único por marca, seleção, contagens, status terminal, falhas sanitizadas e itens individuais;
- `minerador_discovery_keyword_origins`, com vínculo único entre keyword e candidata, permitindo múltiplas origens para a mesma keyword;
- normalizador neutro server-side, guardas de tenant, índices, RLS de leitura e execução restrita ao RPC.

Os objetos dessa migration permanecem documentados como histórico da primeira proposta de importação. O fluxo produtivo convergido usa o núcleo server-side compartilhado de importação; não criar ou reaplicar migration corretiva nesta fase documental.

### Regras do importador compartilhado

O fluxo aceita somente candidatas da mesma marca, da mesma execução concluída, normalizadas e com `filter_outcome = approved`. Candidatas filtradas, de execução pendente/falha, inexistentes ou de outro tenant são recusadas antes da criação da keyword.

Uma nova keyword entra em `keywords_kgr` como `bruto`, Keyword livre, sem lista (`lista_id = null`), Silo/Categoria ou decisão editorial. A intenção e o funil preliminares permanecem dentro da proveniência, sem serem promovidos a valores definitivos. Métricas oficiais, targeting, provider/version, seed, relação e timestamps ficam no snapshot de origem e, quando aplicável, a média mensal é projetada para `volume_search` com `volume_source = google_ads`.

Keywords existentes da mesma marca não são duplicadas nem sobrescritas: status, publicação, lista, silo, decisões humanas, intenção final e métricas existentes permanecem intactos. O resultado informa `already_existing` e registra o vínculo de origem.

O mesmo `importRequestId` com a mesma seleção retorna o lote consolidado (`idempotent = true`) após perda de conexão ou repetição. Reutilizá-lo com outra seleção é rejeitado. A barra inferior mantém a seleção até confirmação, exibe novas/existentes/falhas e só oferece `Abrir no Processador` quando existe resultado aproveitável.

### Homologação e estado final da Fase 5

Foi confirmada manualmente a candidata nova, sua persistência remota, a aparição no Processador e a criação como `bruto`, Keyword livre e sem lista automática. Permanecem como regressões manuais não bloqueantes a candidata já existente, repetição sem duplicação, retry idempotente, isolamento entre Adalba e Lindisse e a conferência visual completa. A Descoberta não implementa allintitle; essa capacidade continua no Processador por meio da Extensão.
