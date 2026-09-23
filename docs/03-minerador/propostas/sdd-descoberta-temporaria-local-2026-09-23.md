# SDD — Descoberta temporária no navegador, banco só a partir da importação — 2026-09-23

## Identificação

- **Módulo proprietário:** Minerador (área Descobrir Keywords, `/{brandRef}/minerador/descobrir`).
- **Arquivos compartilhados tocados, se aprovada:** `lib/server/serp-cache-store.ts` (função aditiva, seção 4.7). Nenhum outro módulo muda de código. O Arquiteto é **consumidor afetado** do cache de SERP pela rota `app/api/arquiteto/territorial-serp/route.ts` (seções 4.7 e 5).
- **Data:** 2026-09-23. Revisada no mesmo dia por duas refutações (governança e dados; egress e custo). O que foi incorporado e o que foi recusado está na seção 16.
- **Estado:** **proposta aguardando autorização.** Nenhum código desta SDD foi escrito. Nenhuma migration, nenhum SQL de escrita, nenhuma escrita remota. As medições são SQL agregado de leitura (`count`, `sum(length(...::text))`, `pg_total_relation_size`, `pg_get_functiondef`, `has_function_privilege`), conforme R2 e R3 de `docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md:56-58`.
- **Tipo de mudança:** estrutural (`AGENTS.md` §4). Muda persistência, workflow e o contrato de 5 rotas, e altera duas regras vigentes da spec: §16, `docs/03-minerador/spec.md:225-229`, e §48, `docs/03-minerador/spec.md:452-460`.
- **Precedência:** abaixo de invariantes, ADRs e da SDD de egress. Esta SDD obedece às regras R1–R24 dela. A SDD de egress rejeitou "Local-first completo" **para a plataforma** (`sdd-uso-supabase-orcamento-egress-2026-09-23.md:281`). O corte proposto aqui vale **só para a lista da Descoberta**, que o usuário declarou temporária. Não abre precedente para outras áreas.

Legenda de evidência: **MEDIDO** = consulta agregada ao banco remoto em 2026-09-23. **ESTIMADO** = conta sobre números medidos. **Verificado no código** = lido no arquivo e linha citados. **Não verificado** = ver seção 14.

---

## 1. Pedido do usuário

Pedido literal, sobre a tela Descobrir Keywords:

> "coloca como default em [Sem medição] e [Sem medição] no resultado e no KD, e só quando ativar esse filtro pode ativar o provider da SERP [...] tudo que está nessa lista da planilha no descobrir, tem que ser temporário [...] nem deveria ir para o banco de dados, e trabalhar totalmente em local. Só teria que ir para o banco de dados quando for importado para o processador"

São duas partes com naturezas diferentes:

| Parte | Natureza | Situação |
| --- | --- | --- |
| A. Resultado e KD começam em "Sem medição"; "Medir resultados" só libera quando um dos dois sai de "Sem medição" | mudança local de interface, sem contrato | **Verificado no código**, feita por outro workflow nesta data: `lib/minerador/discovery-seo-filters.ts:53-75` (`DISCOVERY_SEO_DEFAULT_PRESET = "missing"`, `isDiscoverySerpMeasurementEnabled`), `modules/minerador/discovery/discovery-keywords-page.tsx:84,87,127,158,169,196`, `modules/minerador/discovery/discovery-table-placeholder.tsx:98,183-188,285`. **Não validado manualmente.** Não entra no escopo desta SDD, só na seção 4.6 |
| B. A lista da Descoberta vira temporária, local, e o banco só entra na importação | estrutural | esta SDD |

---

## 2. Contrato atual

### 2.1 O que cada gatilho lê e grava hoje

| Gatilho | Leituras no banco | Escritas no banco | Evidência |
| --- | --- | --- | --- |
| **Abrir a tela** | GET: última run (`id`), depois `runs select("*")`, `candidates select("*")` da run inteira, `current_metrics select("*")` e `metric_history` (5 colunas) em blocos de 100 ids. Cerca de 13 chamadas REST para 500 candidatas | nenhuma | `modules/minerador/discovery/discovery-keywords-page.tsx:118-136`; `app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts:153-185,250-260` |
| **Descobrir** (Google Ads) | sonda de idempotência em `runs` (`id,status`); `minerador_keywords select("id,keyword")` da marca; depois `loadRunSnapshot` de novo (mesma leitura da abertura) | RPC `persist_minerador_discovery_run`: 1 run e **todas** as N candidatas, inclusive as filtradas, com `filter_outcome` decidido no servidor por `applyDiscoveryFilters(candidates, draft)`; upsert de N linhas-semente em `current_metrics`; uso em `integration_usage_events` | `descobrir-keywords/route.ts:28` (teto 500), `:306`, `:355-366`, `:387`, `:398-411`; `lib/minerador/discovery-persistence.ts:153`; `lib/minerador/discovery-current-metrics.ts:239-265` |
| **Manual / CSV** | listas e keywords da marca; releitura de `candidates select("*")` | RPC `persist_minerador_discovery_source_run` (aceita só `manual` e `csv`, grava `source_data` na run e na candidata): 1 run e N candidatas | `app/api/minerador/marcas/[brandId]/discovery/sources/route.ts:87,104,112,138,144`; `supabase/migrations/0040_minerador_discovery_multi_source.sql:161,181-184,205,241` |
| **Atualizar métricas** (Google Ads) | `candidates` (3 colunas) e `current_metrics select("*")`; por candidata mais um `select("*")` | por candidata: insert em `metric_history`, update em `current_metrics` | `app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts:62-66,109-127` |
| **Medir resultados** (DataForSEO: allintitle, KD, SERP desktop 20) | `candidates` (6 colunas), `current_metrics select("*")`, cache de SERP (corpo inteiro no acerto, `lookupSerpCache` em modo `body`) | cache de SERP (`editorial_workflow_items`); `current_metrics` e `metric_history`; uso; **se a candidata já é keyword**, o mesmo patch do modo Processador em `minerador_keywords` e versão de Qualificação Semântica. **allintitle e KD são pagos sempre; o cache cobre só a SERP** | `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts:158-165,212,398-404,600-605,638-656`; `lib/server/serp-cache-store.ts:71-190` |
| **Enviar ao Processador** | `candidates "*"`, `current "*"`, `runs "*"`, `import_batches`; o núcleo lê `id,keyword,brand_id,lista_id,status,analise_semantica` de **todas** as keywords vivas da marca | lote em `import_batches`; keyword por `importKeywordsWithCore`; por candidata: select e insert em `keyword_origins`, update e readback em `candidates`, update em `current_metrics` | `app/api/minerador/marcas/[brandId]/discovery/import/route.ts:157-226,274-300`; `lib/minerador/keyword-import-core.ts:157-161` |

### 2.2 Contrato da importação

- O navegador manda só `{ importRequestId, candidateIds }`, com 1 a 1000 UUIDs sem duplicata (`lib/minerador/discovery-import.ts:5-12`; `discovery-table-placeholder.tsx:237`).
- O servidor relê tudo do banco e recusa: candidata de outra marca (404); seleção de execuções diferentes (409, `discovery/import/route.ts:286`); execução não concluída (409); candidata com `filter_outcome` diferente de `approved` (409, `:292`).
- **Idempotência:** o lote guarda `candidate_ids`. O mesmo `importRequestId` com outra seleção é recusado por `sameUuidArray` (`discovery/import/route.ts:163-201`), como manda a spec §48 (`spec.md:458`).
- A spec proíbe aceitar do navegador texto, targeting, métricas ou proveniência (`docs/03-minerador/spec.md:456`); o invariante 1 exige proveniência rastreável (`docs/00-produto/invariantes.md:5`).
- A proveniência vai para duas partes: `minerador_discovery_keyword_origins.source_snapshot` e a própria keyword, em `analise_semantica.discovery_import` (`lib/minerador/keyword-import-core.ts:79-127`). `buildSourceSnapshot` grava seed, relação, fonte, intenção e funil preliminares, estados, targeting, provider, `measuredAt` e as métricas (`discovery/import/route.ts:83-123`). O núcleo grava `keyword: item.keyword.trim()` e `location` nas colunas da keyword (`keyword-import-core.ts:108-124`).

**Defeito já existente (MEDIDO):** a proveniência de contexto da Descoberta (`discoveryMode`, `discoveryFocus`, `perspectiveClassifier`) nunca chega ao `sourceSnapshot` das runs Google Ads. `buildDiscoveryRunRow` monta `source_data` (`lib/minerador/discovery-persistence.ts:118`), mas a RPC `persist_minerador_discovery_run` não tem essa coluna no INSERT (`supabase/migrations/0009_minerador_discovery_persistence.sql:154-175`), e `pg_get_functiondef` da função remota não contém `source_data`. Das 110 runs `google_ads`, **0** têm `source_data`; manual tem 3 de 3 e CSV 1 de 1. Com `source_data` nulo, `readDiscoveryRunContext` devolve vazio e o bloco de perspectiva não entra (`discovery/import/route.ts:85-91`). A importação por itens corrige isso assinando e gravando esse contexto (4.3).

### 2.3 O que já é local no navegador

Só estado React: resultado executado, rascunho, filtros, organização, seleção e patches de métrica (`discovery-keywords-page.tsx:73-97`). Não há `localStorage`, `sessionStorage` nem IndexedDB em `modules/minerador/discovery` (grep sem resultado). Ao recarregar, a tabela volta pelo GET do banco.

### 2.4 Esquema que amarra a importação às candidatas

- `import_batches.discovery_run_id`, `keyword_origins.discovery_candidate_id`, `keyword_origins.discovery_run_id` e `keyword_origins.import_batch_id` são `NOT NULL` com FK `ON DELETE RESTRICT` (`supabase/migrations/0010_minerador_discovery_import.sql:23-56`). O lote tem `UNIQUE(brand_id, import_request_id)` e **um só** `discovery_run_id` (`0010:23-41`).
- `current_metrics.candidate_id` é PK com FK para `candidates` (`0013_minerador_discovery_candidate_current_metrics.sql:5-8`).
- O gatilho `minerador_discovery_run_immutable` bloqueia UPDATE e DELETE de run concluída ou parcial (`0009:125-127`).
- As duas RPCs devolvem `idempotent` **sem inserir candidatas** quando já existe run com a mesma `operation_request_id` (`0009:143-152`; `0040:186-192`). Nenhuma das duas grava o `id` da candidata: ele nasce no banco. Ambas gravam `candidate_key`, com `UNIQUE(discovery_run_id, candidate_key)` (`0009:47,73,191`; `0040:236`).
- A RPC `0009` não grava a coluna `source` da run, que fica no DEFAULT `'google_ads'` (`0040:6`). A `source_contract_check` exige, para `google_ads`, seed, relação, idioma, país, estados, rede e conteúdo adulto preenchidos; para `manual`/`csv`, todos nulos (`supabase/migrations/0041_google_ads_research_persistence_constraints.sql:8-47`).
- As duas RPCs são `SECURITY DEFINER` e o papel `authenticated` não tem `EXECUTE` sobre `persist_minerador_discovery_run` (MEDIDO). Isso não bloqueia a rota: `requireCanonicalSessionProfile` usa o cliente de `service_role` (`lib/server/authz.ts:6,54`).

**Consequência:** para gravar lote e origem na importação é preciso existir run e candidata no banco. Sem migration, isso só é possível se a importação criar essas linhas na hora, uma run por lote (seção 4.4).

---

## 3. Medido

### 3.1 Volume e tamanho das tabelas da Descoberta (MEDIDO)

| Tabela | Linhas | Criadas em 24 h | JSON no fio (`length(row_to_json)`) | Disco com índices (`pg_total_relation_size`) |
| --- | ---: | ---: | ---: | ---: |
| `minerador_discovery_runs` | 114 | 22 | 136.656 B | 204.800 B |
| `minerador_discovery_candidates` | 14.515 | 3.463 | 25.879.526 B (1.783 B/linha) | 28.106.752 B |
| `minerador_discovery_candidate_current_metrics` | 13.753 | — | 23.288.436 B (1.693 B/linha) | 20.602.880 B |
| `minerador_discovery_candidate_metric_history` | 6 | — | 11.531 B | 81.920 B |
| `minerador_discovery_import_batches` | 58 | 15 | 153.950 B | 221.184 B |
| `minerador_discovery_keyword_origins` | 280 | 103 | 557.629 B | 548.864 B |
| **Total** | | | **≈ 50,0 MB** | **49.766.400 B (47 MB)** |

- O banco inteiro tem **82 MB** (`pg_database_size` = 85.740.691 B). As tabelas da Descoberta ocupam **57%** dele (MEDIDO).
- **280 de 14.515 candidatas foram importadas (1,9%)**. 14.235 candidatas e 13.509 linhas de métricas atuais não têm origem ligada (MEDIDO).
- 9.569 candidatas foram criadas nos últimos 7 dias (MEDIDO). 168 candidatas têm `existing_keyword_id` (MEDIDO).
- As 110 runs `google_ads` estão em "Português" e nenhuma tem UF selecionada; 242 keywords vivas importadas têm idioma `languageConstants/1014` e 25 não têm idioma no `sourceSnapshot` (MEDIDO).
- `monthly_search_volumes` ocupa 64% do disco das candidatas e aparece gravado de novo em `current_metrics` (mapa de auditoria desta data, `pg_column_size`; `lib/minerador/discovery-persistence.ts:140`; `lib/minerador/discovery-current-metrics.ts:92`).

### 3.2 Leituras por gatilho

| Medida | Valor | Tipo |
| --- | --- | --- |
| Abertura da tela, marca com run de 500 candidatas (candidatas + métricas atuais) | 1.722.924 B e 1.741.782 B por abertura | MEDIDO |
| Abertura com run média (127 candidatas) | ≈ 127 × (1.783 + 1.693) B ≈ 441 kB | ESTIMADO |
| Releitura no POST Descobrir (`loadRunSnapshot` logo após gravar) | igual à abertura: até ≈ 1,7 MB | ESTIMADO |
| Leitura de keywords vivas no Descobrir (`id,keyword`) | até 158 keywords, ≈ 10 kB por marca | MEDIDO |
| Leitura do núcleo da importação (`analise_semantica` de todas as keywords) | 267 keywords, 1.771.869 caracteres, ≈ 1,8 MB **por chamada do núcleo** | MEDIDO (tamanho) / ESTIMADO (por chamada) |
| `pg_stat_statements` desde 2026-08-18: `current_metrics select *` 1.304 calls; `runs select *` 656; `candidates select *` 600 | contagem | MEDIDO |
| Egress acumulado das restaurações e releituras desde 2026-08-18 | 0,35 a 0,75 GB | ESTIMADO (o `pg_stat_statements` não guarda bytes) |

### 3.3 Uso real dos providers pagos (MEDIDO, ledger de 30 dias, módulo Minerador)

- Só 1 candidata tem `allintitle_status = 'measured'` e 2 têm `'failed'`. "Medir resultados" quase não foi usado na Descoberta.
- O cache de SERP tem **0 entradas** (`editorial_workflow_items` com `subject_type = 'serp_cache_entry'`).
- 0 de 267 keywords vivas têm KD em `discovery_import.sourceSnapshot.metrics`: o KD medido na Descoberta nunca chega ao Processador (seção 4.5).
- DataForSEO no modo keyword: 367 alvos bem-sucedidos custaram 9,30648 (≈ 0,0254 por alvo); 15 falhas custaram 0,0525 (0,0035 cada). Modo candidata: 1 falha, 0,0035.
- Eventos sem `targetKind` (o Google Ads da Descoberta está entre eles): 406 bem-sucedidos e 11 falhos, **sem custo registrado** (`sum(cost_amount)` nulo).
- ESTIMADO sobre esses números: a SERP é ≈ 14% do custo por alvo (0,0035 de 0,0254); allintitle + KD somam ≈ 0,022 por alvo.

### 3.4 As 103 chamadas a `keyword_origins`

Em 24 h foram criadas **103 origens** (MEDIDO), o mesmo número de chamadas REST que o Logs Explorer mostrou. Pelo código, cada candidata ligada faz um `select` e um `insert` (`discovery/import/route.ts:209-223`), o que daria cerca de 206. A diferença não foi explicada (seção 14). Nenhum outro caminho do app lê essa tabela por REST. O ciclo de exclusão a usa por RPC SQL (`lib/minerador/keyword-lifecycle.ts:70-116`).

---

## 4. Proposta

### 4.1 O que deixa de ir ao banco e o que continua

| Dado | Hoje | Proposto | Por quê |
| --- | --- | --- | --- |
| Run de cada busca (Google Ads, manual, CSV) | grava | **deixa de gravar** na busca | a lista é temporária; 98,1% das candidatas nunca são importadas (MEDIDO) |
| Candidatas (todas, inclusive filtradas) | grava | **deixa de gravar** na busca | mesmo motivo; são 57% do banco (MEDIDO) |
| `current_metrics` e `metric_history` de candidata | grava | **deixa de gravar** | a medição volta ao navegador com recibo assinado (4.3) |
| Restauração da última busca ao abrir a tela | lê do banco | **lê do IndexedDB**, sem consultar o banco | até ≈ 1,7 MB por abertura (MEDIDO) |
| Medição DataForSEO de candidata que **já é keyword** da marca | grava na keyword | **decisão D7**; recomendação: continua gravando na keyword, resolvida no servidor | a keyword já está no Processador, então a gravação cabe no pedido; sem ela, allintitle e KD seriam pagos de novo no Processador (≈ 0,022 por alvo, ESTIMADO, 3.3) |
| Uso e cota de provider (`integration_usage_events`) | grava | **continua** | contabilidade da plataforma e da cota; idempotência por `idempotencyKey` (`lib/minerador/google-ads-discovery-usage.ts:74-77`; `allintitle/route.ts:134-136,303`). `discoveryRunId` é só metadado anulável (`google-ads-discovery-usage.ts:43,77`) |
| Cache de SERP da marca | grava | **continua** | dado pago, 30 dias, por marca e chave de consulta (`lib/server/serp-cache-store.ts:71-190`; `lib/editorial/serp-cache.ts:86`). Evita pagar de novo **só a SERP** no Processador (`docs/compartilhado/sdd-cache-serp-temporario-2026-09-23.md`) |
| Leitura de keywords vivas para marcar "já existe" | lê | **continua só no POST Descobrir** | ≈ 10 kB (MEDIDO); na abertura a marca local é só indicativa (4.2) |
| Na importação: keyword com `analise_semantica.discovery_import` | grava | **continua** | é o que o Processador, o KeywordDNA, o Arquiteto e o Radar leem (`lib/minerador/processor-revalidation.ts:103-145`; `lib/minerador/google-ads-demand.ts:119-137`; `lib/minerador/dataforseo-keyword-overview-core.ts:230-257`; `lib/minerador/canonical-keyword-snapshot.ts:101-102`) |
| Na importação: run mínima, **só as candidatas importadas**, lote e origem | grava tudo antes | **grava só na importação** (opção A, D2) | FKs `NOT NULL` do lote e da origem (2.4); a origem alimenta a exclusão de keyword (`keyword-lifecycle.ts:70-116`); o lote dá a idempotência de `importRequestId` (`0010:41`) |

### 4.2 Armazenamento local

**Onde:** IndexedDB, em banco próprio (`minerador-descoberta`), copiando o padrão já existente em `lib/minerador/semantic-qualification-version-cache.ts`: escopo por ator e marca (`:96-103`), armazenamento injetável e memória como plano B, prazo de 2 s por operação (`:39`), adaptador que não toca `indexedDB` ao ser criado (`:295-300`). Módulo novo proposto: `lib/minerador/discovery-local-store.ts`.

**O que guarda, por busca:** os recibos assinados (4.3), que já trazem a configuração executada, as candidatas, as métricas e as medições; a marcação "já existe" / "importada"; e a data. Rascunho e filtros continuam como estado de tela.

**Chave:** `actorUserId:brandId:searchId`. A leitura confere `actorUserId` e `brandId` contra a sessão ativa (R22, `sdd-uso-supabase-orcamento-egress-2026-09-23.md:303`). Busca de outra marca ou de outro ator é ignorada, nunca mostrada.

**Abertura sem banco:** a abertura da tela não consulta o banco. "Já existe" e "importada" guardados localmente são **indicativos**. A autoridade é a importação, que deduplica contra o banco (`keyword-import-core.ts:184-251`) e devolve o estado real, que então atualiza a marca local.

**Resultado atrasado:** sem candidata no banco, a proteção contra medição atrasada da rota (`isStale`, `allintitle/route.ts:110-121,600-605`) não tem o que reler. Ela passa ao cliente: a mescla no IndexedDB só aplica uma medição se o `measuredAt` do recibo for mais novo que o guardado para a mesma keyword e targeting.

**Natureza do dado:** a lista local **não é** cache de dado do servidor. É um rascunho de pesquisa, declaradamente não canônico. Isso cabe no `AGENTS.md` §10 ("estado de apresentação/recuperação, nunca fonte canônica"): o canônico começa na importação, e a autoridade das métricas vem do recibo assinado pelo servidor, não do navegador. As regras R20 e R21 (cache conferido contra o banco) não se aplicam, porque não há cópia no banco para conferir. A R22 se aplica.

**Tamanho (ESTIMADO):** 1,6 a 3,5 kB por candidata, pela base medida (1.783 B + 1.693 B por candidata no banco). Uma busca de 500 fica entre 0,8 e 1,7 MB; a busca média (127), em cerca de 0,4 MB.

**Limites e política (dependem de decisão, D4):**

| Tema | Proposta | Observação |
| --- | --- | --- |
| Validade | 30 dias, igual ao cache de SERP e ao recibo | apagar busca vencida é limpeza de dado local: exige autorização (`AGENTS.md` §10) |
| Quantidade | até 20 buscas por ator e marca; ao passar, sai a mais antiga | 20 × 1,7 MB ≈ 34 MB no pior caso (ESTIMADO) |
| Sair da conta | apagar as buscas do ator | hoje o logout não limpa nenhum armazenamento do navegador (`components/auth/supabase-session-context.tsx:74-99`) |
| Janela anônima, dados limpos, outro dispositivo | a lista some; a tela diz isso | a SERP já paga continua no cache da marca por 30 dias; allintitle e KD não |
| Origens diferentes | `localhost`, `s-<slot>.localhost` e a Vercel têm armazenamento próprio (`sdd-uso-supabase-orcamento-egress-2026-09-23.md:280`) | a lista não segue entre elas |
| Várias abas | gravação por transação do IndexedDB, `BroadcastChannel` para avisar as outras abas, `onversionchange` para fechar conexão velha | sem isso, duas abas medindo a mesma busca perdem atualizações |
| Falha ou demora do IndexedDB | memória como plano B, com aviso de que a lista não sobrevive ao recarregar | mesmo padrão de `semantic-qualification-version-cache.ts` |

**Texto da interface:** o aviso "Descoberta salva" (`discovery-keywords-page.tsx:160`) deixa de ser verdade e sai. Entra "Lista guardada só neste navegador. Só o envio ao Processador salva no banco." Sucesso de importação só aparece depois da resposta do servidor (`AGENTS.md` §10).

### 4.3 Recibo assinado pelo servidor

O problema: hoje a importação grava `volume_search`, `results_allintitle`, `volume_source`, `keyword` e `location` direto em colunas canônicas que alimentam KGR e ordenação (`keyword-import-core.ts:108-124`), e a proveniência em `sourceSnapshot`. Se esses valores vierem do navegador sem prova, um cliente adulterado injeta texto, volume ou proveniência, contra a spec §48 (`spec.md:456`) e o invariante 1.

A proposta (decisão D3): cada rota que produz dado da lista devolve, junto com ele, um **recibo HMAC-SHA256** calculado só no servidor. O item enviado na importação **é** o conteúdo assinado mais a assinatura; o servidor recalcula o HMAC sobre o JSON canônico.

**Regra de cobertura:** todo campo que chega a `minerador_keywords` (colunas), a `analise_semantica.discovery_import`, a `keyword_origins.source_snapshot` ou às linhas mínimas de run e candidata vem de um recibo válido ou é recalculado no servidor a partir de campos assinados. Campo do corpo fora do recibo é ignorado.

| Recibo | Emitido por | Conteúdo assinado |
| --- | --- | --- |
| **Origem** | `POST descobrir-keywords` e `POST discovery/sources` | versão, id da chave, `brandId`, `actorUserId`, `searchId` (= `operationRequestId` da busca), fonte (`google_ads`, `manual`, `csv`); `keyword_original` **exato** e keyword canônica; seed original e canônica, relação, `discoveryMode`, `discoveryFocus`, `perspectiveClassifier`; intenção e funil preliminares; targeting completo (idioma, `language_constant`, país, estados, rótulos, `geo_target_constants`, rede, conteúdo adulto); `filterOutcome`, `filterReasons` e hash do rascunho de filtros; métricas Google Ads completas (`averageMonthlySearches`, `monthlySearchVolumes`, `competition`, `competitionIndex`, lances baixo e alto, `averageCpcMicros`, `currencyCode`, `timeZone`); `provider`, `providerVersion`, `measuredAt`; em manual/CSV, `listaId` já conferido contra as listas da marca e `sourceData`, com as métricas do CSV rotuladas como importadas, não medidas; validade |
| **Métricas Google Ads** | `POST metricas-keywords` (modo candidata) | id do recibo de origem, keyword canônica, hash do targeting, os mesmos campos de métrica, `measuredAt`, `operationRequestId`, validade |
| **DataForSEO** | `POST dataforseo/allintitle` (modo candidata) | id do recibo de origem, keyword canônica, hash do targeting, `resultsAllintitle`, `keywordDifficulty` (com esse nome, que é o que o leitor procura, `dataforseo-keyword-overview-core.ts:199-201`) e os campos do Keyword Overview, `subjectId` da entrada do cache de SERP, `serpSource` (`COLLECTED` ou `REUSED`) e `collectedAt` dela, `measuredAt`, `operationRequestId`, validade |

- **Recalculado no servidor, a partir de campos assinados:** keyword canônica (`normalizeKeyword`, `keyword-import-core.ts:64-68`), perspectiva (`classifyDiscoveryPerspective` com seed e foco assinados, hoje em `discovery/import/route.ts:89`) e `location` (do targeting assinado). A coluna `keyword` recebe o `keyword_original` assinado, nunca o texto do corpo: como `normalizeKeyword` remove acentos, conferir só a forma canônica deixaria um recibo de "café" valer para "cafe".
- **Filtro:** a importação recusa item cujo recibo de origem não tenha `filterOutcome = 'approved'`, mantendo a regra da spec (`spec.md:458`; hoje `discovery/import/route.ts:292`). O rascunho de filtros já vem do navegador hoje (`descobrir-keywords/route.ts:360`); a assinatura garante que a decisão é a que o servidor tomou na busca, não uma nova.
- **Validade:** 30 dias, alinhada à política local.
- **Chave:** segredo só do servidor, classificado como **infraestrutura fixa da Plataforma** (`docs/compartilhado/sdd-arquitetura-integracoes-plataforma-agencia-marca.md:79`): variável server-side, sem `NEXT_PUBLIC_`, nunca devolvida ao navegador, criada pelo usuário com aprovação. Não é credencial de provider, então não vai para connection de Agência ou Marca. Alternativa em D3: Secret Store.
- **Rotação:** o recibo leva o id da chave. O servidor assina com a chave atual e aceita a anterior até o fim da validade dos recibos dela (30 dias). Girar a chave não invalida recibos antigos de uma vez; retirar a anterior antes do prazo invalida os recibos dela, que então precisam ser medidos de novo.
- **Base técnica existente:** `node:crypto` com `createHmac` e `timingSafeEqual` já é usado em `app/api/communication/delivery/route.ts:3,11-14`.

### 4.4 Importação: o que o navegador manda e o que o servidor revalida

**Corpo novo:** `{ importRequestId, searchId, items[] }`. Cada item é `{ origin, measurements[] }`: o recibo de origem e os recibos de medição que tiver, cada um com conteúdo e assinatura. A rota aceita também o corpo antigo por UUID durante a transição (seção 9).

**Uma busca local por importação.** O lote tem um só `discovery_run_id` e `import_request_id` único por marca (2.4), e a `source_contract_check` impõe uma só fonte, seed e targeting por run (`0041:8-47`). Por isso cada `importRequestId` cobre itens de **uma única** busca local (`searchId`), como hoje a rota recusa execuções diferentes (`discovery/import/route.ts:286`). Uma seleção que mistura buscas vira uma requisição por busca, cada uma com seu `importRequestId`. O servidor recusa com 409 corpo cujos recibos de origem não sejam todos do mesmo `searchId`, fonte e targeting.

**O servidor revalida, sem confiar no navegador:**

| Item | Como |
| --- | --- |
| Marca e permissão | `brandId` da rota com `requireTenantPermission(..., action: "create")`, como hoje (`discovery/import/route.ts:270-273`) |
| Recibos | assinatura confere em tempo constante; id de chave conhecido; marca e ator batem com a sessão; dentro da validade; recibos de medição apontam para o recibo de origem do item e batem em keyword canônica e hash do targeting |
| Busca única | todos os recibos de origem com o mesmo `searchId`, fonte e targeting |
| Filtro | `filterOutcome = 'approved'` no recibo de origem |
| Keyword | `keyword_original` assinado, renormalizado com `normalizeKeyword`; recusa vazio e tamanho excessivo; deduplica no lote e contra o banco (`keyword-import-core.ts:184-251`) |
| Lista | `listaId` assinado pertence à marca e não está excluída |
| Perspectiva e `location` | recalculadas a partir de campos assinados (4.3) |
| Item sem recibo válido | **recusado** (D3). Nada do navegador sem assinatura vira texto ou proveniência |
| Idempotência | impressão da seleção pelo `candidate_key` (abaixo) e lote por `UNIQUE(brand_id, import_request_id)` (`0010:41`) |

**O que a importação grava (opção A, sem migration):**

1. Uma run mínima com `operation_request_id = importRequestId` e as candidatas importadas, pela RPC da fonte: `persist_minerador_discovery_run` para `google_ads` (`0009`) e `persist_minerador_discovery_source_run` para `manual`/`csv` (`0040:161`). Os campos da run e das candidatas vêm do recibo de origem. Usar o `importRequestId` evita o caminho `idempotent` que não insere candidatas (`0009:143-152`) quando a mesma busca é importada duas vezes.
2. Cada candidata recebe `candidate_key = sha256(searchId | fonte | keyword canônica | id do recibo de origem)`. O conjunto ordenado dessas chaves é a **impressão da seleção**. A RPC grava `candidate_key` (`0009:191`; `0040:236`), então a impressão fica no banco sem coluna nova.
3. O lote em `import_batches`, apontando para essa run, com os `id` das candidatas lidos de volta (só `id,candidate_key`, R6).
4. A keyword pelo `importKeywordsWithCore`, com `discovery_import.sourceSnapshot` montado dos recibos, **com o KD** (4.5) e com o contexto da busca (`discoveryMode`, `discoveryFocus`, perspectiva). Para `google_ads`, esse contexto vai ao `sourceSnapshot` da keyword e da origem, **não** a `source_data` da run: a RPC `0009` não grava essa coluna (2.2).
5. A origem em `keyword_origins` por candidata ligada.
6. A religação da SERP do cache à keyword (4.7).

**Nova tentativa com o mesmo `importRequestId`:**

- Se o lote existe e está concluído, a rota compara a impressão da seleção nova com os `candidate_key` da run do lote. Iguais: devolve o resultado gravado, como hoje (`discovery/import/route.ts:296-300`). Diferentes: 409 `MINERADOR_DISCOVERY_IMPORT_REQUEST_REUSED`.
- Se a falha ocorreu **depois da RPC e antes do lote**: a RPC devolve `idempotent` com o `runId`; a rota lê `id,candidate_key` das candidatas dessa run e compara com a impressão. Iguais: segue para o lote com esses ids. Diferentes: 409. A RPC grava run e candidatas numa só transação (função PL/pgSQL), então não há run sem as candidatas dela.

### 4.5 KD passa a chegar ao Processador

Hoje o KD medido na Descoberta fica só no `new_value` do histórico e não entra no `sourceSnapshot` (`allintitle/route.ts:312-336`; `discovery/import/route.ts:83-123`). O leitor do Processador já o procura em `discovery_import.lastMeasurement`, `discovery_import.metrics` e `sourceSnapshot.metrics` (`dataforseo-keyword-overview-core.ts:230-245`). Com o recibo, a importação grava o KD em `sourceSnapshot.metrics.keywordDifficulty`. Nenhum leitor muda.

**O ganho é só informativo** (ordenação e filtro no Processador). O leitor marca esse KD como `imported`, não `validated` (`dataforseo-keyword-overview-core.ts:247-252`), e a evidência importada nunca vira validação do Processador (`processor-revalidation.ts:99-101`). Quando o Processador roda Resultados, paga allintitle e KD de novo; o que a importação evita pagar é só a SERP, e só dentro dos 30 dias do cache e no mesmo idioma (4.7).

### 4.6 SERP só com filtro ativo

A parte de interface já existe (seção 1, parte A). O bloqueio é **só de interface**: a rota `dataforseo/allintitle` aceita candidatas sem nenhuma condição ligada ao filtro (`allintitle/route.ts:355-375`; grep por `isDiscoverySerpMeasurementEnabled` em `app` e `lib` sem resultado fora de `discovery-seo-filters.ts`).

O estado do filtro vive no navegador. Um "portão" no servidor que confia numa bandeira mandada pelo navegador não protege nada. A proteção real de custo continua sendo a permissão `edit` e a cota por provider, que conta alvos, inclusive quando a SERP vem do cache (`allintitle/route.ts:158-165,398-404`). Decisão D8.

### 4.7 Religar a SERP da candidata à keyword na importação

A SERP medida numa candidata vai ao cache sem keyword. A entrada nunca fica com `source_entity_id` nulo: sem `keywordId`, ele recebe o próprio `subject_id` (`lib/editorial/serp-cache.ts:432`). A gravação só herda uma keyword quando o valor anterior é diferente do `subject_id` (`lib/server/serp-cache-store.ts:148-153`). Depois da importação, o Processador reaproveita a entrada sem regravar, então ela nunca ganha a keyword e escapa da exclusão, que remove as linhas da marca pelo `source_entity_id` (`sdd-cache-serp-temporario-2026-09-23.md`, seção 2).

**O cache é compartilhado por chave.** A rota `app/api/arquiteto/territorial-serp/route.ts` grava de propósito entradas sem keyword para pseudo-ids de território (`:82-86,135`). A mesma consulta (keyword, local, idioma, lente, endpoint) é a mesma linha, venha de qual módulo vier (`serp-cache.ts:138-143`). Religar qualquer entrada "sem keyword" com a chave da keyword importada prenderia à keyword uma entrada que o Arquiteto também usa, e excluir a keyword apagaria o cache dele.

**Proposta:** função aditiva em `lib/server/serp-cache-store.ts` que, na importação, só religa entradas **gravadas pela própria medição da Descoberta** do item importado. O predicado é:

- `marca_id` = marca da rota e `subject_type = 'serp_cache_entry'`;
- `subject_id` = `subjectId` de um recibo DataForSEO válido do item, com `serpSource = 'COLLECTED'`;
- `source_entity_id = subject_id` (ainda sem keyword);
- `payload->meta->>collectedAt` igual ao `collectedAt` do recibo (ninguém regravou a entrada depois).

A escrita é condicional por marca (R4) e devolve só `id` (R6). O `payload` não é reescrito: a herança lê `source_entity_id` (`serp-cache-store.ts:148-150`), único leitor de `meta.keywordId` fora da montagem da linha (grep em `lib` e `app`). Entradas `REUSED` na Descoberta, ou regravadas por outro módulo, ficam como estão. Consumidores preservados: `readSerpCacheEntries` e `writeSerpCacheEntry` não mudam de assinatura. Hoje há 0 entradas (MEDIDO).

**Idioma:** a chave inclui o idioma (`serp-cache.ts:138-143`). O modo keyword do `allintitle` não tem linha de candidata e mede com idioma nulo, que vira `pt` (`allintitle/route.ts:95-100`; `lib/minerador/dataforseo-targeting.ts:25-27`). Uma candidata de busca em inglês (`languageConstants/1000`) ou espanhol (`1003`) grava a chave em `en` ou `es`, e o Processador não a encontra: paga a SERP de novo, e no idioma errado. Hoje isso não ocorre: as 110 runs são em português (MEDIDO). A SDD declara que **só buscas em português reaproveitam o cache**; fazer o Processador ler o idioma de `discovery_import` é mudança do modo keyword, fora deste escopo (D11). UFs não afetam o cache: com UF selecionada, `resolveDataForSeoTargeting` recusa a medição (`dataforseo-targeting.ts:37-38`), então não há SERP nem entrada.

### 4.8 Rotas, antes e depois

| Rota | Hoje | Proposto |
| --- | --- | --- |
| `GET google-ads/descobrir-keywords` | restaura a última run do banco | removida do uso da tela; mantida na transição para a cópia única da última run (D10) e para o rollback |
| `POST google-ads/descobrir-keywords` | chama Google Ads, grava run, candidatas e métricas, relê tudo | chama Google Ads, aplica os filtros, marca "já existe" contra o banco, registra uso e devolve candidatas com recibos de origem. **Não grava lista** |
| `POST discovery/sources` | grava run e candidatas manual/CSV | valida listas e entradas e devolve candidatas com recibos de origem. **Não grava lista** |
| `POST google-ads/metricas-keywords` (modo candidata) | exige a candidata no banco; grava `current` e `history` | recebe itens com recibo de origem e devolve medição com recibo. **Não grava** |
| `POST dataforseo/allintitle` (modo candidata) | exige a candidata no banco; grava `current`, `history` e, se já for keyword, a keyword e a Qualificação | recebe itens com recibo de origem; usa e grava o cache de SERP; registra uso; devolve allintitle, KD e SERP com recibo. **Não grava** `current` nem `history`. Candidata que já é keyword: D7 |
| `POST discovery/import` | recebe UUIDs, relê tudo do banco | recebe itens com recibos de uma busca, revalida e grava run mínima, candidatas importadas, lote, origem, keyword e religação da SERP |

O modo keyword (Processador) de `metricas-keywords` e `allintitle` não muda.

**Modo candidata local do `allintitle`:**

- **Schema:** `{ operationRequestId, candidates: [{ origin }] }`, com o recibo de origem de cada alvo no lugar do UUID que o schema exige hoje (`allintitle/route.ts:25-32`). Teto de 1000 alvos somados aos `keywordIds`, como hoje. Keyword e targeting saem do recibo, e a keyword é renormalizada no servidor.
- **Alvo:** `targetKind = 'discovery_local'` e `targetId = sha256(brandId | keyword canônica | hash do targeting)`, determinístico. A chave de uso fica `dataforseo:{operationRequestId}:discovery_local:{targetId}` (`allintitle/route.ts:134-136,303`), então uma nova tentativa não conta em dobro nem deixa de contar. O tipo novo não colide com os alvos `discovery_candidate` já no ledger.
- **Candidata que já é keyword:** o servidor resolve se a keyword canônica existe na marca lendo `id,keyword` das keywords vivas (≈ 10 kB, MEDIDO), a mesma leitura do Descobrir (`descobrir-keywords/route.ts:355-358`). Nunca usa um `keywordId` mandado pelo navegador. Se D7 mantiver a gravação, o alvo vira `targetKind = 'keyword'` e segue o modo Processador, com o mesmo patch de hoje (`allintitle/route.ts:638-656`).
- **Resultado atrasado:** a proteção passa ao cliente (4.2).

**Idempotência de "Descobrir" sem run no banco:** hoje uma nova tentativa com a mesma `operationRequestId` devolve a run gravada sem chamar o Google Ads (`descobrir-keywords/route.ts:306-330`). A interface nunca usa esse caminho: gera uma `operationRequestId` nova a cada clique (`discovery-keywords-page.tsx:150`). Sem a run, só quem repete a mesma requisição fora da interface chama o Google Ads de novo. O ledger não conta em dobro, porque a chave é a mesma (`google-ads-discovery-usage.ts:74`), e o Google Ads da Descoberta não tem custo registrado no ledger (3.3). Decisão D6.

---

## 5. Consumidores

| Consumidor | Usa | Efeito da proposta |
| --- | --- | --- |
| Tela Descobrir (`modules/minerador/discovery/**`, inclusive `discovery-source-controls.tsx`) | GET de restauração, POSTs, importação por UUID | passa a ler e gravar o IndexedDB e a mandar itens com recibos |
| Processador, KeywordDNA, Arquiteto, Radar | só `analise_semantica.discovery_import` na keyword (`processor-revalidation.ts:103-145`; `google-ads-demand.ts:119-137`; `dataforseo-keyword-overview-core.ts:230-257`; `canonical-keyword-snapshot.ts:101-102`; `components/editorial/dna-panels.tsx:601`; `lib/minerador/table-view.ts:112-119`) | nenhum; a forma do `discovery_import` se mantém e ganha o KD e o contexto da busca |
| View `minerador_keywords_listagem` e gatilho `minerador_keywords_preserva_series` | podam e restauram `discovery_import.sourceSnapshot.metrics.monthlySearchVolumes` (`supabase/migrations/20260923140000_minerador_keywords_row_version.sql:176-191`; `20260921090000_gatilhos_rodam_como_dono.sql:121-135`) | nenhum; o caminho continua o mesmo |
| RPCs de exclusão e purga de keyword | contam e apagam origens, métricas atuais e histórico e desvinculam candidatas (`0047_global_lifecycle_delete_recovery_purge.sql:226,304-314`; `20260921040000_exclusao_recusa_publicada.sql:30,99-102`; `20260921100000_exclusao_publicada_exige_declaracao.sql:43,118-121`) | na opção A, continuam valendo: origem e candidata importada existem. Métricas atuais de candidatas novas deixam de existir, e a contagem delas passa a ser 0 |
| Ledger de uso | `discoveryRunId` como metadado anulável; chave por alvo no DataForSEO | Google Ads passa `null` ou o `searchId` como texto (D6); DataForSEO ganha o alvo `discovery_local` (4.8) |
| Cache de SERP | entrada por marca e chave de consulta | ganha a religação restrita da 4.7 |
| **Arquiteto — `app/api/arquiteto/territorial-serp/route.ts`** | grava e lê entradas do cache sem keyword (`:82-86,135`) | sem mudança de código; protegido pelo predicado da 4.7 e por teste de não religação (seção 11) |
| Scripts de purga, reset e auditoria (`supabase/scripts/minerador-test-data-purge.sql` e outros 24 arquivos com `minerador_discovery`) | leem e apagam as 6 tabelas | continuam válidos, porque as tabelas ficam |
| Testes estruturais | casam com o desenho atual | reescritos (seção 11) |

---

## 6. O que acontece com as linhas existentes

**Nesta SDD, nada é apagado.** Quando a tela deixa de chamar o GET, as 14.235 candidatas sem origem e as 13.509 linhas de métricas sem origem (MEDIDO) ficam sem leitor no app, salvo a cópia única da última run (D10). As 280 candidatas importadas, as 43 runs que elas referenciam, os 58 lotes e as 280 origens continuam em uso pelas RPCs de exclusão.

Liberar espaço é **operação separada do usuário** (decisão D5), com dry-run antes e autorização explícita (`AGENTS.md` §10 e §15):

| Limite | Evidência |
| --- | --- |
| Run concluída ou parcial não pode ser apagada: o gatilho recusa | `0009:125-127` |
| Candidata com origem não pode ser apagada: FK `RESTRICT` | `0010:48` |
| Métricas atuais saem antes da candidata: FK de `current_metrics.candidate_id` | `0013:5-8` |
| O que pode sair sem migration | candidatas sem origem e suas métricas atuais e histórico. Runs ficam, e são 205 kB (MEDIDO) |
| Espaço em jogo | até ≈ 48 MB de disco (candidatas + métricas atuais, `pg_total_relation_size`, MEDIDO), menos as 280 importadas. O espaço volta ao limite só depois do `VACUUM` do Postgres (Não verificado quando isso ocorre no plano Free) |

---

## 7. Ganho e custo

### 7.1 Egress

| Gatilho | Hoje | Depois | Tipo |
| --- | --- | --- | --- |
| Abrir a tela, run de 500 | 1.722.924 a 1.741.782 B e ≈ 13 chamadas REST | 0 B do banco | MEDIDO (hoje) |
| Abrir a tela, run média de 127 | ≈ 441 kB | 0 B | ESTIMADO |
| Descobrir, run de 500 | releitura ≈ 1,7 MB + keywords vivas ≈ 10 kB | keywords vivas ≈ 10 kB | ESTIMADO (releitura) / MEDIDO (keywords) |
| Atualizar métricas e Medir resultados, por candidata | `select("*")` de `current` (≈ 1,7 kB) mais leituras de candidata | 0 B das tabelas da Descoberta; o cache de SERP continua (corpo inteiro no acerto; tamanho Não verificado); ≈ 10 kB de keywords vivas por requisição se D7 mantiver a gravação | ESTIMADO |
| Importar | releitura de candidatas, `current` e run (≈ 3,5 kB por candidata) + núcleo ≈ 1,8 MB | núcleo ≈ 1,8 MB **por requisição** | ESTIMADO |

**Sem número de aberturas por dia, não há economia diária medida.** O ganho por abertura é MEDIDO. A economia acumulada desde 2026-08-18 seria da ordem de 0,35 a 0,75 GB (ESTIMADO, seção 3.2).

**A leitura do núcleo é o custo que sobra, e ele se multiplica por requisição.** `importKeywordsWithCore` lê `analise_semantica` de todas as keywords vivas a cada chamada (`keyword-import-core.ts:157-161`). Por isso:

- **não se divide** uma importação por tamanho. O limite de 1 MB do Next vale só para Server Actions (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:83`); o `proxy.ts` exclui `/api` do matcher (`proxy.ts:18`), então `proxyClientMaxBodySize` não se aplica. Um corpo de 500 itens (≈ 0,85 MB, ESTIMADO) cabe numa requisição. O limite de corpo da Vercel está fora do código (Não verificado);
- a regra "uma busca por importação" (4.4) faz uma seleção que mistura K buscas ler o núcleo K vezes (K × ≈ 1,8 MB, ESTIMADO);
- **dependência entre fases:** estreitar a leitura do núcleo para `id,keyword` e buscar `analise_semantica` só das keywords que casaram (fase F2b) vem **antes** da F3.

### 7.2 Banco

| Medida | Hoje | Depois | Tipo |
| --- | --- | --- | --- |
| Crescimento por dia | 3.463 candidatas em 24 h × ≈ 3,35 kB de disco (candidatas + métricas atuais) ≈ 11,6 MB/dia | só candidatas importadas: 103 em 24 h × (≈ 1,9 kB candidata + ≈ 2 kB origem) ≈ 0,4 MB/dia | ESTIMADO sobre contagens MEDIDAS |
| Crescimento em 7 dias | 9.569 candidatas ≈ 32 MB | ≈ 3 MB no mesmo ritmo de importação | ESTIMADO |
| Ocupação atual | 47 MB de 82 MB (57%) | igual até a limpeza (D5) | MEDIDO |

### 7.3 Custo de provider

| Situação | Efeito | Tipo |
| --- | --- | --- |
| Candidata nova medida na Descoberta e importada | o Processador paga allintitle e KD de novo (hoje também paga, porque a evidência importada nunca é validada); a SERP vem do cache se for em português e dentro de 30 dias | Verificado no código (4.5, 4.7) |
| Candidata que já é keyword, com D7 "manter" | nada muda: a medição fica na keyword, como hoje | Verificado no código (`allintitle/route.ts:638-656`) |
| Candidata que já é keyword, com D7 "deixar de gravar" | allintitle e KD pagos duas vezes: ≈ 0,022 por alvo; 168 candidatas têm `existing_keyword_id` | ESTIMADO sobre ledger MEDIDO |
| Lista perdida ou recibo vencido | allintitle e KD pagos de novo na Descoberta se o usuário quiser filtrar de novo | risco 1, aceito pelo pedido |
| Google Ads | sem custo registrado no ledger; a interface não repete `operationRequestId` | MEDIDO (3.3) / Verificado no código |

---

## 8. Riscos

1. **Perda da lista.** Limpar dados do navegador, usar janela anônima ou trocar de dispositivo apaga a busca não importada e as medições de allintitle e KD já pagas. A SERP fica no cache da marca por 30 dias. O usuário aceita a lista como temporária, mas a tela precisa dizer isso (4.2). Decisão D1.
2. **Recibo e segredo.** Sem chave só do servidor, a importação volta a confiar no navegador. Vazar a chave permite forjar métricas e proveniência. Mitigação: chave como infraestrutura fixa server-side, id de chave no recibo e rotação com janela de 30 dias (4.3).
3. **Recibo vencido.** Uma lista importada depois da validade é recusada (D3) e precisa ser medida de novo.
4. **Várias abas e troca de marca.** Tratadas em 4.2. Sem a conferência de ator e marca, um computador compartilhado exporia a lista de outro ator pelas ferramentas do navegador.
5. **Nova tentativa de "Descobrir" fora da interface** chama o Google Ads de novo e consome cota da API, sem custo monetário registrado (4.8, D6). A interface não passa por esse caminho.
6. **Histórico e restauração entre dispositivos** prometidos pela spec §16 (`spec.md:225-229`) deixam de existir. A spec precisa mudar junto (D9).
7. **Leitura do núcleo por requisição.** Cada importação lê ≈ 1,8 MB (ESTIMADO) e cresce com o acervo; seleção com várias buscas multiplica isso. Mitigação: F2b antes da F3 (7.1).
8. **Opção A e as constraints da 0041.** A run mínima precisa passar pela `source_contract_check` da fonte (`0041:8-47`) e pelos contadores da run. Não verificado se uma run com `received_count` igual ao total da busca e só as candidatas importadas passa (seção 14).
9. **Cache compartilhado.** Religar entrada que outro módulo também usa faria a exclusão da keyword apagar o cache dele. Mitigação: predicado da 4.7 e teste de não religação.
10. **Outro workflow edita a Descoberta em paralelo.** Os números de linha da tela mudaram durante a auditoria. Toda implementação relê o arquivo antes de editar.
11. **Proveniência de keywords importadas pela opção B** (se escolhida): sem origem, a prévia de exclusão conta 0 origens para elas.

---

## 9. Compatibilidade e migração

- **Sem migration na opção A.** Tabelas, RPCs, gatilhos e policies ficam como estão.
- **Transição:** a rota de importação aceita os dois corpos (UUIDs e itens) durante uma fase. O GET de restauração fica no servidor, sem chamada da tela para restaurar, até a validação manual.
- **Última busca gravada (D10):** "estado vazio nunca substitui estado válido" (`AGENTS.md` §10). Recomendação: na primeira abertura depois do corte, se o IndexedDB não tiver nenhuma busca do ator e da marca, a tela chama o GET **uma vez**, e ele devolve a última run com recibos de origem assinados a partir das linhas do banco, que é a autoridade delas. Custo: uma leitura de até ≈ 1,7 MB por ator e marca (MEDIDO), uma só vez. Alternativa: a tela abre vazia com um aviso de que a última busca ficou no banco e pode ser enviada pelo corpo antigo até a F5.
- **Forma do `discovery_import`:** mantida. Muda só a origem dos valores (recibos em vez de linhas relidas) e entram o KD e o contexto da busca.

---

## 10. Rollback

- Reverter o código. Como esquema, RPCs e dados antigos não mudam, a tela volta a chamar o GET, que restaura a última run gravada antes do corte.
- Buscas que existiam só no IndexedDB ficam inertes no navegador. Enquanto a versão nova estava ativa, a política D4 (se aprovada) apagava buscas vencidas, excedentes e as do ator ao sair da conta. Depois do rollback, nenhum código as lê nem as apaga.
- Keywords importadas durante o período continuam válidas. Na opção A, elas têm run, candidata, lote e origem, então a prévia de exclusão continua correta.
- Entradas de cache religadas continuam presas à keyword; isso é o comportamento esperado do cache (`serp-cache.ts:425-433`).
- O segredo do recibo pode ficar configurado sem efeito.

---

## 11. Testes

Fixtures e mocks, sem rede nem chamada paga. Teste estrutural remove comentários antes de casar. Arquivos `.mts` sem sintaxe TS não apagável.

**Novos:**

- `lib/minerador/discovery-local-store.ts` com armazenamento em memória: escopo por ator e marca, recusa de outra marca e de outro ator, validade, limite de buscas, mescla de medições, **medição atrasada não sobrescreve a mais nova**, gravação concorrente, plano B em memória quando o armazenamento falha ou demora, registro inválido ignorado.
- Recibo: válido aceito; comparação em tempo constante; chave anterior aceita dentro da janela e recusada depois; **adulteração recusada campo a campo**: `keyword_original` (inclusive só acento), keyword canônica, seed, relação, `discoveryMode`, `discoveryFocus`, `perspectiveClassifier`, intenção e funil preliminares, cada campo do targeting, `filterOutcome`, cada métrica Google Ads, `resultsAllintitle`, `keywordDifficulty`, `subjectId`, `collectedAt`, `listaId`, `sourceData`, `measuredAt`, marca, ator e validade.
- Importação por itens: keyword gravada com `keyword_original` assinado; perspectiva e `location` recalculadas; deduplicação; `listaId` de outra marca recusado; **item sem recibo recusado**; **candidata com `filterOutcome` diferente de `approved` recusada**; **lote misto (duas buscas, duas fontes ou dois targetings) recusado com 409**; run mínima pela RPC certa por fonte (`google_ads` e `manual`/`csv`); `candidate_key` determinístico; mesmo `importRequestId` com a mesma seleção devolve o gravado; **mesmo `importRequestId` com outra seleção recusado**, inclusive quando a falha anterior ocorreu entre a RPC e o lote; KD e contexto da busca em `sourceSnapshot`.
- `allintitle` no modo candidata local: `targetId` determinístico e chave de uso estável entre tentativas; schema recusa recibo inválido e mais de 1000 alvos; keyword existente resolvida no servidor, nunca por id do navegador.
- Religação da SERP: só entradas da marca; só `subjectId` de recibo `COLLECTED` do item; só com `source_entity_id = subject_id` e `collectedAt` igual; **entrada gravada pela `territorial-serp` sem keyword não é religada**; entrada `REUSED` não é religada; devolve só `id`.

**Estruturais:**

- `POST descobrir-keywords` e `POST discovery/sources` sem `.from("minerador_discovery_` e sem RPC de persistência de busca.
- `metricas-keywords` e `allintitle` no modo candidata sem escrita em `candidate_current_metrics` e `candidate_metric_history`; `allintitle` ainda com o cache de SERP e o registro de uso; escrita em `minerador_keywords` só pelo caminho de keyword resolvida no servidor (conforme D7).
- A tela sem `fetch` do GET de restauração, salvo a cópia única (D10).

**Suítes a atualizar:** `tests/minerador-discovery-persistence.test.mts`, `tests/minerador-discovery-import.test.mts`, `tests/minerador-discovery-current-metrics.test.mts`, `tests/minerador-discovery-sources.test.mts`, `tests/minerador-dataforseo-allintitle-route.test.mts`, `tests/minerador-google-ads-discovery-usage.test.mts`, `tests/minerador-discovery-seo-filters.test.mts`, `tests/minerador-google-ads-blockers-fix.test.mts`, `tests/minerador-discovery-geo-targeting.test.mts`, `tests/minerador-test-data-purge.test.mts`, e os testes do cache de SERP que cobrem `serp-cache-store.ts`.

**Porta de saída:** suíte do Minerador comparada à base de 28 falhas preexistentes; `npx tsc --noEmit`; ESLint nos arquivos tocados; `git diff --check`.

**Validação manual (do usuário):** descobrir; recarregar e ver a lista voltar do navegador; abrir duas abas; trocar de marca; sair da conta; medir resultados com o filtro ativo; importar; rodar Resultados no Processador e conferir que a SERP vem do cache sem nova cobrança dela; readback no banco de keyword, lote, origem, KD e contexto da busca.

---

## 12. Fases

Cada fase fecha com testes e pode ser entregue sozinha.

| Fase | Conteúdo | Muda contrato? | Ganho |
| --- | --- | --- | --- |
| F0 | Padrão "Sem medição" e bloqueio de "Medir resultados" na interface | não | **já no código** (seção 1); falta validação manual |
| F1 | Armazenamento local e restauração pelo IndexedDB; cópia única da última run (D10); a tela deixa de chamar o GET para restaurar. As rotas ainda gravam | não | todo o egress da abertura (7.1) |
| F2 | Recibos nas respostas de `descobrir-keywords`, `sources`, `metricas-keywords` e `allintitle`, como campo novo | aditivo | nenhum sozinho; prepara F3 |
| F2b | Leitura do núcleo da importação estreitada: `id,keyword` e `analise_semantica` só das que casaram (`keyword-import-core.ts:157-161`), com testes dos importadores que usam o núcleo | não | ≈ 1,8 MB por importação vira proporcional à seleção (ESTIMADO) |
| F3 | Importação por itens com recibo, opção A, uma busca por importação, impressão por `candidate_key`, KD e contexto no `sourceSnapshot`, religação restrita da SERP. O corpo por UUID continua aceito. **Depende de F2 e F2b** | aditivo | releitura da importação |
| F4 | As rotas deixam de gravar a lista (runs, candidatas, `current`, `history`); modo candidata local do `allintitle` com `discovery_local`; D7 aplicada | **sim** | crescimento do banco (7.2) |
| F5 | Remoção do corpo por UUID e do GET; spec §16 e §48 atualizadas; texto da interface; `estado-atual.md` e `backlog.md` | **sim** | — |
| F6 | Limpeza opcional das linhas antigas, com dry-run, executada pelo usuário | dado | até ≈ 48 MB de disco |

---

## 13. Decisões do usuário

| # | Decisão | Opções | Recomendação |
| --- | --- | --- | --- |
| D1 | A lista fica só neste navegador | aceitar a perda ao limpar dados ou trocar de dispositivo / manter cópia no banco | aceitar; é o pedido |
| D2 | Proveniência na importação | **A:** run mínima e só as candidatas importadas, com lote e origem, sem migration / **B:** só `discovery_import` na keyword, sem lote e origem (perde a contagem da exclusão e a idempotência pelo lote) / **C:** migration para FKs opcionais (SDD de esquema) | A |
| D3 | Confiança nos dados vindos do navegador | recibo HMAC com segredo novo como infraestrutura fixa da Plataforma / recibo com segredo no Secret Store / remedir na importação (gasta cota) / importar sem métricas | recibo com segredo novo, server-side, sem `NEXT_PUBLIC_`; **item sem recibo válido é recusado** |
| D4 | Política local | validade de 30 dias, até 20 buscas por ator e marca, apagar ao sair da conta | aprovar os três; é autorização de limpeza local (`AGENTS.md` §10) |
| D5 | Linhas existentes | manter / limpar candidatas sem origem e suas métricas, com dry-run, pelo usuário | manter até F4 validada; depois decidir a F6 |
| D6 | Nova tentativa de "Descobrir" sem run no banco | chamar o Google Ads de novo com a mesma chave (conta uma vez, gasta cota da API, sem custo registrado) / recusar e pedir nova busca | chamar de novo; a interface nem usa esse caminho |
| D7 | Medir candidata que já é keyword da marca | **manter** a gravação na keyword, resolvida no servidor, como hoje / **bloquear** "Medir resultados" para candidatas "já existe" e apontar o Processador / **deixar de gravar**, aceitando pagar allintitle e KD de novo (≈ 0,022 por alvo, ESTIMADO) | manter: a keyword já está no Processador, e é o único caminho sem custo repetido |
| D8 | Bloqueio da SERP | só na interface, com permissão e cota como proteção / exigir confirmação explícita no servidor | só na interface; bandeira do navegador não é proteção |
| D9 | Spec | atualizar §16 (`spec.md:225-229`) e §48 (`spec.md:452-460`) para o novo contrato: o navegador passa a mandar itens com recibos; continuam valendo filtro aprovado, marca ativa, idempotência e recusa de outra seleção com o mesmo `importRequestId` | atualizar na F5; nenhuma regra da §48 cai, só muda o meio de prova |
| D10 | Última busca gravada no banco | cópia única para o IndexedDB, com recibos assinados na leitura / tela vazia com aviso | cópia única |
| D11 | Idioma no reaproveitamento do cache | só buscas em português reaproveitam a SERP no Processador / o modo keyword do `allintitle` passa a ler o idioma de `discovery_import` (mudança do Processador, proposta separada) | só português agora; registrar a outra como proposta |

---

## 14. Não verificado

- Egress real em bytes por rota: o `pg_stat_statements` não guarda bytes. Os totais acumulados são ESTIMADOS.
- Número de aberturas da tela por dia; por isso não há economia diária.
- Por que o Logs Explorer mostrou 103 chamadas a `keyword_origins` quando o código faz pelo menos duas por origem criada.
- Se a run mínima da opção A passa pela `source_contract_check` da `0041` e pelos contadores da run; e se a policy de insert de candidatas (`0009:231`) ainda vale depois do endurecimento de segurança. É irrelevante para a rota, porque as RPCs são `SECURITY DEFINER` e a rota usa o cliente de `service_role` (2.4).
- Limite de corpo de requisição da Vercel (fora do código) e comportamento do IndexedDB no Safari e na janela anônima.
- Tamanho do corpo de SERP transferido num acerto do cache: há 0 entradas para medir.
- Com que frequência a interface manda "Medir resultados" para candidatas "já existe": a tela não bloqueia (`discovery-table-placeholder.tsx:149,184-197`), e só 3 candidatas têm medição.
- A consulta de candidatas em `metricas-keywords/route.ts:62` não filtra por `brand_id` na própria consulta (R4); a checagem vem depois, pela contagem. Não verifiquei se isso é seguro com o cliente usado.
- Nada desta proposta foi executado, testado ou validado manualmente. A parte A (seção 1) está só verificada no código; não rodei `tsc`, testes nem ESLint sobre ela.

---

## 15. Autorização necessária

- Aprovação desta SDD e das decisões D1 a D11, antes de qualquer código das fases F1 a F5.
- Criação do segredo do recibo pelo usuário como infraestrutura fixa da Plataforma (D3), antes da F2.
- A F6 é limpeza de dados remotos: exige autorização específica, dry-run e execução pelo usuário (`AGENTS.md` §15).
- A F0 já está no código e só precisa de validação manual.

---

## 16. Revisão de 2026-09-23

Duas refutações foram conferidas no repositório e no banco (SQL agregado de leitura). Todos os achados foram confirmados, com os ajustes abaixo.

**Incorporado:**

| Achado | Onde |
| --- | --- |
| Recibo não cobria `keyword_original`, seed, relação, modo, foco, intenção e funil, targeting e métricas completas | 4.3 (regra de cobertura e tabela de recibos), testes na seção 11 |
| Importação deixava de conferir `filter_outcome` | 4.3 e 4.4; D9 declara que a regra fica |
| Idempotência por itens indefinida; texto errado sobre `source_data` | 4.4 (impressão por `candidate_key`, recuperação entre RPC e lote); 2.2 e 4.4 passo 4 |
| Opção A não cobria manual/CSV nem lote misto | 2.4 e 4.4 (RPC por fonte, uma busca por importação) |
| Justificativa da D7 errada; custo em dobro de allintitle e KD | 4.1, 4.8, 7.3, D7 |
| Leitura do núcleo multiplicada pela divisão da importação; limite do Next mal atribuído | 7.1, F2b, risco 7 |
| Modo candidata sem identidade estável de alvo e sem proteção de resultado atrasado | 4.2 e 4.8 |
| Religação podia prender entradas da `territorial-serp`; predicado errado (`source_entity_id` nunca é nulo) | 4.7, seção 5, teste |
| D3 aceitava item sem recibo | 4.4 e D3: recusado |
| Tela vazia após o corte; rollback em conflito com a D4 | 9 (D10) e 10 |
| Classificação e rotação do segredo | 4.3 e D3 |
| `source_data` nunca gravado nas runs Google Ads | 2.2, como defeito já existente MEDIDO |
| Cache perde o acerto em buscas `en`/`es`; UFs não eram a causa | 4.7, D11, seção 14 corrigida |
| KD importado não evita pagamento | 4.5 |
| Marca "já existe" na abertura | 4.2 |
| Risco 5 e D6 superestimados | 4.8, risco 5, D6 |

**Recusado ou ajustado, e por quê:**

- **Rodar `applyDiscoveryFilters` de novo na importação** (alternativa do achado de filtro): recusado. O resultado dependeria do rascunho de filtros mandado na hora da importação, que vem do navegador e pode diferir do usado na busca (`descobrir-keywords/route.ts:360`). Assinar `filterOutcome` na busca preserva a decisão que o servidor tomou.
- **Guardar a impressão da seleção "numa coluna da run"**: recusado. A RPC `0009` só grava as colunas fixas do INSERT (`0009:154-175`) e nenhuma delas tem esse significado. `candidate_key` já é gravado pelas duas RPCs e é único por run.
- **"Uma run mínima por busca e fonte dentro do mesmo `importRequestId`"**: recusado. O lote é único por `(brand_id, import_request_id)` e tem um só `discovery_run_id` (`0010:23-41`); várias runs exigiriam vários lotes com o mesmo id. Ficou "uma busca por importação".
- **Marcador em `meta` para a religação**: recusado. Mudaria o contrato compartilhado de `lib/editorial/serp-cache.ts` e não resolve o compartilhamento por chave: a mesma consulta é a mesma linha em qualquer módulo. O predicado usa o recibo (`subjectId`, `serpSource`, `collectedAt`).
- **Atualizar `payload.meta.keywordId` na religação**: recusado. Reescrever o `payload` transfere o corpo da SERP, e a herança lê `source_entity_id` (`serp-cache-store.ts:148-150`), o único leitor de `meta.keywordId` fora da montagem da linha.
- **"O Processador deve usar o idioma da candidata"**: adiado para D11. É mudança do modo keyword do `allintitle`, fora do escopo. Hoje não há caso: as 110 runs são em português (MEDIDO).
- **"Eventos sem `targetKind` somaram custo 0"**: corrigido. A soma é nula, ou seja, sem custo registrado (MEDIDO).
- **"O papel `authenticated` não tem `EXECUTE` sobre a RPC"**: confirmado (MEDIDO), sem efeito, porque a rota usa o cliente de `service_role` (`lib/server/authz.ts:6,54`). Registrado em 2.4, não como risco.
