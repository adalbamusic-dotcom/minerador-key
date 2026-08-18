# Spec — Minerador

## Arquitetura aprovada de providers — plataforma, agência e marca

`brand_id` permanece o único tenant de dados do Minerador. Agência é escopo operacional separado: pode administrar conexões de providers e consumo de várias marcas vinculadas, mas nunca autoriza leitura, escrita ou fallback entre seus dados. Google Ads evolui para conexão técnica global server-side; DataForSEO evolui para conexão operacional por agência; os dois contratos devem resolver marca, autorização, agência e provider no servidor antes de qualquer chamada externa.

Até a implementação aprovada na SDD `propostas/arquitetura-provedores-plataforma-agencia.md`, Google Ads continua com conexão operacional por marca, DataForSEO continua lendo a credencial global atual para allintitle e Serper continua provider do Radar. A futura substituição de Serper por DataForSEO exige paridade de contrato, testes e smoke autenticado; não há fallback silencioso entre agência, provider ou marca.

## Regra vigente — Extensão Chrome removida — 2026-08-04

A Extensão Chrome não faz parte da aplicação. Não deve existir bridge, background, script injetado, fila em `chrome.storage`, listener `window.postMessage` exclusivo, notificação Chrome ou instrução de `chrome://extensions` como dependência produtiva.

As ações explícitas de medição allintitle em Descobrir Keywords e Processar Keywords usam o provider DataForSEO server-side. A consulta é `allintitle:"<keyword>"`; o total operacional é exclusivamente `se_results_count`. `items_count`, quantidade de itens e `organic.length` não são totais válidos; zero só é aceito quando explícito.

Sem credenciais DataForSEO, a ação retorna configuração ausente sem chamada paga. Colunas e valores allintitle já persistidos continuam visíveis; falhas de medição não apagam dados, não alteram `measured_at`, não alteram KGR e não substituem valores atuais.

Google Ads, DataForSEO, importação compartilhada, Descoberta, Processador, métricas atuais, histórico e KGR permanecem ativos. Serper continua provider canônico do Radar; não é usado para allintitle. A substituição de allintitle ocorre somente após confirmação, a falha preserva integralmente o valor anterior e o KGR é recalculado após métricas confirmadas.

As seções históricas que mencionam a Extensão descrevem decisões e implementações anteriores; esta regra tem precedência para o comportamento atual.

### Contrato vigente do allintitle DataForSEO

- Endpoint server-side: `POST /v3/serp/google/organic/live/regular`.
- Payload mínimo: consulta `allintitle:"<keyword>"`, localidade DataForSEO resolvida, idioma, `desktop`, `depth = 10` e `tag = operationRequestId`.
- Provider/version: `dataforseo` / `v3`; custo fica somente na auditoria server-side.
- Escopo operacional: Brasil e português no primeiro MVP. Resource names estaduais da Google Ads não são enviados diretamente à DataForSEO e não há soma automática de UFs.
- Keywords oficiais e candidatas usam a mesma integração; candidatas importadas refletem a keyword oficial vinculada.
- A ação é explícita, não roda ao abrir, selecionar, filtrar ou ordenar e bloqueia duplicação pelo `operationRequestId`.

O Minerador qualifica a keyword e fornece, quando disponíveis, classificação KGR/não KGR/candidata/desconhecida, score, volume, resultados, intenção, confiança, origem, publicação, URL, slug, canonical e evidências. O Arquiteto não recalcula esses dados nem os transforma automaticamente em tipo de unidade ou perfil SERP; usa-os como origem para decisões editoriais humanas.

## Regra compartilhada de qualificação

O Minerador é a autoridade para volume, resultados, intenção, KeywordDNA e KGR. Evidência recebida do Site é aditiva, brand-scoped e não confirmada; novas keywords entram como `bruto` até ação explícita de qualificação. O Minerador não forma ArticleDNA nem decide a hierarquia do silo.

### Funil na qualificação

O Funil é uma dimensão estratégica opcional da qualificação da keyword, com valores restritos a `TOFU`, `MOFU` e `BOFU`. A proposta explícita é persistida aditivamente em `analise_semantica.funnel`, acompanhada, quando disponível, por `funnel_source`, `funnel_confidence`, `funnel_review_required` e `funnel_evidence`; não há coluna dedicada nem migration nova.

`analise_semantica.extension_import.funnelHints` permanece evidência de origem da Extensão e nunca equivale a aprovação. A qualificação considera texto, intenção, sinais comerciais/informativos, etapa da jornada, nicho, localidade e hints, sem usar volume, resultados ou KGR como classificador isolado. Conflitos entre hint e proposta exigem revisão humana; decisões humanas identificadas no metadado são preservadas.

A qualificação de intenção, Funil, nicho, viés e KeywordDNA ocorre somente por ação explícita sobre keywords selecionadas. O carregamento da tela não preenche nem persiste Funil ou KeywordDNA.
## 1. Propósito
Importar, organizar e qualificar keywords de uma marca.
## 2. Responsabilidades
Listas/planilhas, filtros, KGR, status, seleção, histórico, exportação e visualizações. **Verificado no código.**
## 3. Fora de responsabilidade
Não aprova arquitetura editorial nem publica conteúdo.
## 4. Entidades
Lista KGR, keyword, briefing e KeywordDNA.
## 5. Jornada
Usuário abre `/minerador`, carrega listas e keywords, filtra/edita/importa e exporta seleção.
## 6. Regras de negócio
Keywords são escopadas por marca/lista; seleção é parcial e não decide renderização.
## 7. Estados
Carregando Supabase, lista ativa, filtros, seleção, edição, importação e erro.
## 8. Ações
Importar planilha/manual, criar lista, editar, analisar, calcular volume/KGR, exportar e excluir conforme UI.
## 9. Entradas
CSV/copiar-colar, lista, marca e APIs de análise/volume.
## 10. Saídas
Keywords persistidas, dados de KGR/status e exportações.
## 11. Contratos com outros módulos
Fornece keywords para Arquiteto; a transferência completa ainda requer confirmação ponta a ponta. Quando disponíveis, a carga pode trazer aditivamente relação keyword↔URL, evidência de URL/canonical/slug, situação arquitetural e designação/vínculo KGR. Esses campos são evidência de entrada; a decisão de agrupamento e confirmação arquitetural continua no Arquiteto.
## 12. Proteções
Escopo de marca, confirmação para ação destrutiva e guardas de publicado quando aplicáveis. Consultas browser exigem sessão NextAuth autenticada e um JWT Supabase atual, validado com margem de 60 segundos; o cliente usa `accessToken` dinâmico e nunca fallback anon ou `service_role`.
## 13. Casos de borda
Supabase indisponível, lista sem keywords, sessão ausente e importação duplicada. A sessão de dados usa resultado estruturado e códigos seguros (`NEXTAUTH_SESSION_MISSING`, `SUPABASE_GOOGLE_EXCHANGE_FAILED`, `SUPABASE_ACCESS_TOKEN_MISSING`, `SUPABASE_TOKEN_INVALID_CLAIMS`, `SUPABASE_TOKEN_EXPIRED`, `SUPABASE_TOKEN_REFRESH_FAILED`); somente expiração efetiva ou falha de refresh após vencimento pode ser apresentada como sessão expirada.
## 14. Arquitetura técnica atual aprovada
Wrapper de rota em `app/(brand)/[brandRef]/minerador/page.tsx` e implementação funcional em `modules/minerador/minerador-workspace.tsx`, com Supabase browser autenticado e APIs auxiliares.
## 15. Critérios de aceite
Importar, filtrar, selecionar e exportar não misturam marcas e retornam confirmação de persistência.
## 16. Descoberta persistente — Fase 4 aprovada

`/{brandRef}/minerador/descobrir` persiste cada execução concluída e todas as candidatas normalizadas em entidades próprias e tenantizadas de descoberta. A tabela da Descoberta mostra somente candidatas aprovadas pelos filtros; candidatas filtradas permanecem como histórico e não são inseridas em `keywords_kgr` automaticamente.

A mesma `brand_id + operation_request_id` é idempotente. Após recarregar a rota, a última execução concluída ou parcial pode ser restaurada sem nova chamada ao Google Ads; o rascunho da próxima pesquisa e a organização/seleção local continuam independentes do snapshot executado. Falhas de provider ou persistência preservam a última pesquisa válida e não transformam ausência em zero.

## 17. Fora do escopo atual
Importação da Descoberta ao Processador, exclusão/retenção de histórico e execução remota da migration.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/minerador/page.tsx`, `app/api/mine`, `volume`, `analyze`, `clusterize`.
## 18. Arquivos compartilhados consumidos
`components/brand-context.tsx`, Supabase e contratos de Arquiteto.
## 19. Arquivos proibidos sem autorização
Migrations, pipeline editorial compartilhado e módulos seguintes.
## 20. Aplicabilidade KGR e KeywordDNA

## Tenant canonico de `keywords_kgr`

Depois da migration 0005, `keywords_kgr.brand_id` e obrigatorio e e a fonte de verdade do tenant, inclusive quando `lista_id` e nulo. Toda leitura do Minerador filtra a marca ativa; toda criacao envia o `brand_id` resolvido pelo contexto de marca; toda atualizacao ou exclusao restringe o registro ao mesmo tenant. Quando `lista_id` for informado ou alterado, a lista de destino deve pertencer a marca ativa por `listas_kgr.marca_id`. O consumidor nao possui fallback para schema pre-0005.

`lista_id` continua nullable e a FK canônica para `listas_kgr.id` é `ON DELETE RESTRICT`. A exclusão de uma lista não pode apagar keywords; a keyword deve ser movida ou permanecer em `Keywords não agrupadas`.

`kgr_aplicabilidade` possui tres estados explicitos: `applicable`, `not_applicable` e `pending`. A decisao e humana e fica registrada separadamente de `volume_search`, `results_allintitle` e `kgr_score`; nenhum desses valores, nem a intencao comercial, infere aplicabilidade.

`kgr_decisao` exibe `SIM`, `NAO` ou `PENDENTE`, com origem, ator, data, versao, justificativa opcional e historico das decisoes explicitas anteriores. O Minerador nao transforma essa decisao em `kgrIdentity` ou em confirmacao arquitetural do Arquiteto.

A medicao e classificada independentemente como `with_score`, `without_data` ou `invalid`. Filtros, ordenacao e exportacao mantem aplicabilidade e medicao em colunas distintas; `NAO` nunca e exportado como pontuacao numerica.

## 21. Site/Sitemap e briefing

A conferencia Site/Sitemap permanece preview-first e exige confirmacao explicita persistida. Depois da confirmacao, a evidencia consolida a URL de origem, URL resolvida, canonical declarado, situacao de publicacao e o silo existente escolhido pelo usuario (`lista_id`/`siloId`), sem criar silo, slug ou identidade publicada.

O Minerador nao gera nem edita briefing de silo. Briefings e suas tabelas/rotas permanecem sob os consumidores proprietarios existentes; o Minerador conserva apenas a associacao de silo e a qualificacao de keywords.
## 22. Apresentacao e estabilidade - Fase B.1

A tabela e informativa: KGR e Intencao nao possuem edicao por linha. A decisao KGR ocorre somente em massa sobre a selecao, por `Aprovar como KGR` ou `Marcar nao aplicavel`; a aprovacao exige medicao valida e a nao aplicabilidade preserva as metricas.

Os filtros ficam no painel recolhivel `Organizar`, com contador de filtros ativos e limpeza explicita. Mutations locais incorporam somente registros afetados e preservam busca, filtros, ordenacao, scroll, linha expandida e selecao quando ainda valida. `Conferir com o site` pertence a barra inferior da selecao e opera somente sobre keywords selecionadas.

A taxonomia apresentada e retrocompativel: Informativa, Comercial investigativa, Transacional, Navegacional, Local, Mista e Pendente/nao classificada. Valores legados sao normalizados na apresentacao sem reescrita em massa durante a hidratacao.

## 23. Qualificacao de volume sem perda de metadados - Fase B.2
A qualificacao somente persiste uma medicao de volume quando a resposta do provedor e valida e vinculada a uma keyword solicitada. Resposta invalida, erro do provedor ou keyword ausente nao grava `null`, nao altera `volume_source` e nao substitui `volume_search`, `results_allintitle` ou `kgr_score` existentes.
 `/api/volume` normaliza respostas para um contrato interno minimo (keyword + volume), rejeita endpoint RapidAPI de auditoria de site e permanece server-side. A integracao do provedor de volume e preparada por contrato e nao e considerada validada sem chamada externa autorizada.

## 24. Google Keyword Insight - Fase B.3
`/api/volume` usa `GET /keysuggest` com `keyword`, `location=BR` e `lang=pt`. A resposta real observada e um array de sugestoes; somente o item com `text` normalizado igual a keyword solicitada pode produzir medicao. Os campos de competencia, bids e trend sao metadados de resposta e nao substituem `results_allintitle`.
 Cada item retornado ao front possui status `success`, `not_found` ou `error`. O front persiste somente volume e `volume_source`, recalculando KGR quando houver resultado existente; nenhum erro ou ausencia persiste `null`.

## 25. Google Keyword Trending Insight - bloqueio de volume - Fase B.4
`/related-queries` retorna um envelope com `meta.keyword` e listas `data.top`/`data.rising` de consultas relacionadas. Os campos `query` e `value` representam consultas e indices de tendencia; nao sao medicao mensal da keyword e nunca podem preencher `volume_search`.
Quando `meta.keyword` nao corresponde a solicitacao, o normalizador retorna `not_found`. Quando a consulta existe mas nao ha campo de volume, retorna `error`, impedindo persistencia e recalculo de KGR.

## 26. Keyword Magic Tool - normalizacao pendente de contrato de requisicao - Fase B.5
O payload observado possui `keyword_ideas`, com a keyword em `keyword` e o volume mensal em `search volume`. Apenas uma correspondencia normalizada exata pode retornar `success`; ausencia da keyword retorna `not_found` e volume ausente, invalido ou negativo retorna `error`.

`Keyword Difficulty %`, `Keyword Difficulty Label`, `Low_CPC`, `High_CPC` e `Trend` sao metadados observados do provedor e nao alteram `results_allintitle`, KGR ou o contrato interno minimo nesta fase. O metodo e os parametros do endpoint `searchby-country-url` nao foram fornecidos no payload; portanto a rota `/api/volume` continua sem adotar essa configuracao ate que o contrato de requisicao seja confirmado.

## 27. SEO Keyword Research - provedor ativo de volume - Fase B.6
`/api/volume` usa `GET /keyword-research?keyword=<keyword>&country=br` no host `seo-keyword-research8.p.rapidapi.com`. O normalizador aceita somente `result[]` com `keyword` normalizada igual a solicitacao e usa `avg_monthly_searches` como volume; sugestoes relacionadas retornam `not_found`.

Os metadados de CPC, competencia, historico mensal, intencao e recomendacoes nao alteram o contrato interno minimo. O provedor foi confirmado uma vez para `country=br`; o payload nao devolve a localizacao, portanto a medicao e tratada como referente ao pais solicitado. Falhas, schema invalido e ausencia de match nao persistem `null`, nao alteram `results_allintitle` e nao recalculam KGR.

## 28. Hidratação e barra operacional - Fase B.3 complementar
`results_allintitle` continua sendo uma medicao historica ja persistida; esta fase nao cria rota, API ou provedor para coletar resultados. A qualificacao atualiza somente volume valido e recalcula KGR quando `results_allintitle` existente permitir o calculo.

A tabela deriva diretamente de `keywords`, listas, filtros e ordenacao por calculo puro memoizado. `Organizar` controla somente a visibilidade do painel: nunca participa da derivacao das linhas. Sem visualizacao salva valida, `Status` inicia em `Todos`; filtros e selecao nao alteram a colecao original nem decidem renderizacao.

Ha apenas uma barra operacional inferior para a selecao, com contador integrado e decisao KGR unica (`Aprovar como KGR` ou `Marcar nao aplicavel`).

## 29. Última organização local — Fase B.4

A última organização do Minerador usa a chave local existente `minerador-pro:last-view:<usuário>:<marca>:minerador` e é restaurada automaticamente depois de resolver usuário, marca e coleção local. A leitura é exclusiva do Minerador e não altera o componente compartilhado de visualizações.

Preferências legadas reconhecidas são normalizadas; JSON inválido, valores desconhecidos e silo inexistente são ignorados sem limpeza de armazenamento. A primeira gravação não pode sobrescrever uma preferência ainda não aplicada. O botão apresenta os nomes dos critérios ativos (por exemplo, `Publicados`), e `Organizar` permanece somente como controle de visibilidade do painel.

## 30. Métricas independentes da aplicabilidade KGR

Volume e `results_allintitle` são métricas próprias da keyword: são coletados, preservados, exportados pelo Minerador e mantidos no registro de origem, independentemente de `kgrApplicability`. A aplicabilidade controla somente uso estratégico da fórmula, exibição da pontuação e aprovação humana.

O estado de medição deriva apenas das duas métricas: `without_data` (Sem medição), `partial` (Parcial), `complete` (Completa) ou `invalid` (Inválida). Uma pontuação KGR válida pode coexistir com decisão pendente; para `not_applicable`, a pontuação não é usada como classificação e a interface exibe `Não utilizada`, sem ocultar volume, resultados ou pendências.

## 31. Política da keyword principal publicada

`primary_keyword_policy` é metadado estratégico independente de publicação, workflow e KGR: `free` para não publicados, `locked` para publicado legado sem política e `reviewable` apenas por decisão humana explícita. Publicado sempre mantém marca, URL, slug e canonical; a decisão nunca altera a keyword atual.

Uma troca entre `locked` e `reviewable` preserva `primary_keyword_published_original`, principal atual, ator, data, versão, motivo opcional e histórico. O contrato aditivo do Arquiteto recebe política e contexto para reconhecimento, sem autorizar seleção ou substituição automática nesta fase.

## 32. Coleta de `results_allintitle` pela extensão

`results_allintitle` é coletado somente por ação explícita, em lote pequeno, pela extensão Chrome conectada à aba do Minerador via `activeTab`. A extensão é uma coletora de evidência: não grava no Supabase. Ela usa uma aba Google reutilizável, uma consulta por vez, intervalo conservador, parser com fallback e estados terminais `success`, `zero_results`, `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled`.

O Minerador mostra prévia e só persiste `success` numérico ou `zero_results` explicitamente comprovado. Falha, ausência, CAPTCHA, bloqueio e cancelamento preservam resultado anterior e nunca enviam `null`. A confirmação atualiza somente a keyword real da marca/silo ativo, registra fonte/data/lote/consulta no metadado existente e recalcula KGR apenas quando houver volume válido e a aplicabilidade não for `not_applicable`. Volume e resultados permanecem independentes.

## 33. Contrato autenticado da extensão e handshake v2

A extensão Chrome autentica chamadas específicas do Minerador com `Authorization: Bearer <supabase_access_token>`. O servidor valida o token pelo Supabase Auth, obtém o `sub` validado e resolve perfil, owner, memberships, estado da marca e capacidade do módulo pelos helpers canônicos. O popup não concede acesso por papel, email, `brandId` ou `brandRef` enviados pelo cliente e não consulta diretamente `marcas`, `perfis` ou `listas_kgr` para listar opções.

`GET /api/extensao/marcas` retorna somente `{ brandId, brandRef, name, isActive, capabilities }`; `GET /api/extensao/marcas/{brandId}/listas` valida novamente o bearer e retorna somente listas com `listas_kgr.marca_id` igual ao tenant autorizado. `brandRef` é uma referência opaca de rota; o popup nunca o converte em ID técnico.

O handshake v2 da extensão é liberado somente quando a aba está em `/{brandRef}/minerador`, a página confirma usuário autenticado e acesso autorizado, e `selectedBrandId === activeBrandId` e `selectedBrandRef === activeBrandRef`. Mineração, allintitle e persistência pela extensão exigem essa sessão transitória v2 por aba/marca; falhas não iniciam Google nem alteram métricas.

Uma marca é selecionada automaticamente; várias marcas exigem dropdown somente com a resposta autorizada; zero marcas ou erro bloqueiam operação e oferecem estado/retry visível. A última preferência local é apenas uma sugestão e sempre é revalidada pelo endpoint.

## 34. Correlacao do allintitle pela extensao

Cada operacao de allintitle recebe um `requestId` uma unica vez no workspace. O mesmo identificador percorre bridge, background, aba Google, reader e retorno ao Minerador; a extensao nao cria substituto. `batchId` identifica o lote operacional e permanece separado de `requestId`; um fluxo individual pode ser um lote de um item. Eventos de progresso, resultado, pausa, cancelamento e `batch_completed` carregam a correlacao raiz, a marca e os IDs reais das keywords.

O workspace aceita um retorno somente quando `requestId`, `batchId` ativo, `keywordId` individual e `brandId` conferem. Resposta sem `requestId` recebe `response_missing_request_id`; divergencia recebe `request_mismatch`; resposta de uma operacao anterior e ignorada como `stale_response`. Nenhum desses casos altera metricas ou apaga resultado anterior.

## 35. Coerencia entre volume e KGR

Volume zero somente e aceito como medicao quando o provedor retorna numericamente `0` para a keyword exata, com fonte e data registradas. Esse estado e `zero_confirmed` e invalida a pontuacao KGR atual: divisao por zero nunca e score.

Ausencia, `null`, string vazia, schema invalido, keyword divergente, sugestao relacionada e erro do provedor nao gravam zero nem alteram volume ou KGR anteriores. Quando volume e resultados mudam, o KGR e recalculado somente com volume maior que zero e, se nao houver base valida, a pontuacao atual e invalidada; o valor anterior permanece apenas no historico.

Registros com volume zero e KGR numerico so sao detectados como incompatibilidade quando o zero estiver explicitamente confirmado; sem fonte, data e correspondencia exata, o estado e `zero_unconfirmed` e aparece na previa diagnostica somente leitura. Nenhuma correcao em massa ocorre durante hidratacao; qualquer nova medicao continua dependendo de acao humana explicita.
## 36. Diagnóstico independente de volume e KGR

O estado diagnóstico de volume/KGR não transforma ausência de métrica em incompatibilidade. `measurement_pending` significa que volume, resultados allintitle ou score ainda não permitem uma conclusão; `zero_unconfirmed` significa volume zero sem evidência semântica atual de confirmação; `not_applicable` representa somente a decisão estratégica da aplicabilidade; e `inconsistent` é reservado a incompatibilidade comprovada com métricas numéricas atuais, ou a zero explicitamente confirmado coexistindo com score numérico.

A prévia diagnóstica exibe contagens derivadas por categoria: `Medição pendente`, `Volume zero sem confirmação`, `KGR não aplicável` e `Incompatibilidade comprovada`. Ela é somente leitura e não altera volume, `results_allintitle`, KGR, histórico ou qualquer registro persistido.

## 37. Ciclo de vida reinjetável da bridge

A bridge da extensão é uma instância versionada e descartável. Após reload da extensão, a nova injeção chama `dispose` na instância anterior, remove listeners e invalida operações pendentes antes de registrar os handlers nomeados. O background exige `bridge_ready` com `bridgeVersion`, `protocolVersion`, `instanceId`, `extensionVersion` e timestamp antes de enviar o ping do handshake v2.

Falhas de `chrome.runtime.lastError`, exceções síncronas e contexto invalidado retornam códigos específicos (`bridge_context_invalidated`, `bridge_not_ready` ou `bridge_version_mismatch`) e permitem nova injeção sem recarregar a página. O ACK continua exigindo requestId, usuário, marca, rota e acesso confirmados.
## 38. Qualificação simplificada e cálculo KGR

A ação `Qualificar volume (KGR calculado)` consulta somente o provedor de volume e recalcula `kgr_score` quando volume e `results_allintitle` permitem o cálculo. KGR é uma pontuação derivada; não é uma métrica medida por provedor. A medição de `results_allintitle` é uma ação explícita separada pela extensão, com confirmação humana própria.

Erros do provedor devem preservar os metadados existentes e permanecer visíveis com a keyword, status HTTP ou mensagem segura retornada pelo provedor quando disponível. A interface principal não exibe a auditoria classificatória de volume/KGR; ela permanece em código/testes e documentação para investigação técnica.

## 39. ACK estável da página

O listener de `minerador:extension-handshake-ping` permanece independente do estado do lote allintitle. A página responde positivamente quando usuário, marca, rota e sessão coincidem e responde negativamente com código estruturado quando consegue identificar acesso ausente ou marca divergente. O background aguarda a reinjeção, `bridge_ready` e o ACK dentro de uma janela operacional compatível com o despertar do service worker, sem alterar autenticação ou tenant.
## 40. Decisão KGR e limite externo de volume

Volume e `results_allintitle` são métricas independentes. A decisão humana de aplicabilidade não inicia coleta externa; quando aplicável, o KGR é calculado localmente com as duas métricas persistidas. A decisão não aplicável preserva as métricas e apenas retira o score da estratégia.

Se a RapidAPI responder HTTP 429, o Minerador informa somente `Não foi possível coletar volume.`. A rota encerra a coleta, não faz retry automático, não transforma a falha em zero e não altera nenhum registro ou metadado existente.

## 41. Persistência server-side de `results_allintitle` — aprovada em 2026-07-29

O allintitle continua sendo uma ação explícita da Extensão, mas sua execução é background-owned: o workspace entrega o lote por relay declarado, o background executa consultas sequenciais e envia cada resultado terminal ao endpoint autenticado `POST /api/extensao/marcas/{brandId}/keywords/resultados-allintitle`. O popup, a página e o estado `connected` não são requisitos para a continuidade do lote.

O endpoint deriva o ator da sessão bearer da Extensão, valida acesso ativo ao tenant canônico e confere cada `keywordId` em `keywords_kgr.brand_id`. `success` com inteiro não negativo e `zero_results` com `0` atualizam somente `results_allintitle`; `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled` preservam o valor anterior. Nenhum estado grava `null`, altera volume/KGR ou usa o endpoint de importação.

O payload exige `operationRequestId`, `batchId` e de 1 a 10 itens com `requestId`, `keywordId`, status, valor confirmado quando aplicável e `measuredAt`. A resposta é individual por keyword (`persisted`, `preserved`, `rejected` ou `failed`) e repetir a mesma atualização na mesma linha é idempotente em efeito. Não há migration, tabela nova ou alteração de RLS.

## 42. Seleção complementar por intervalo e arraste — 2026-07-29

A seleção da tabela preserva clique individual, Ctrl/Cmd para alternância não contígua e Shift para intervalo pela ordem visual atual de `filteredKeywords`. Ctrl/Cmd+Shift adiciona o intervalo sem limpar a seleção existente. A âncora `lastSelectionAnchorId` é local, não persistida remotamente e é redefinida quando sai do conjunto visível.

O arraste é complementar e atua somente nos controles de seleção. O gesto começa no estado inicial do checkbox, exige tolerância mínima de movimento, visita cada linha uma vez e aplica selecionar ou desmarcar até o botão ser solto. O cabeçalho atua somente nas linhas visíveis, mantém selecionadas ocultas e expõe estado misto acessível. Filtros, busca e ordenação não limpam a seleção existente.

## 43. Extração localizada do contador allintitle no Google

O leitor da Extensão procura primeiro os seletores semânticos conhecidos, incluindo `#result-stats` e `role=status`. Quando a página concluída não apresenta um contador nesses pontos, ele localiza e abre uma única vez o controle localizado como `Ferramentas`, `Tools` ou `Herramientas`, aguarda a estabilização do painel e consulta seus textos visíveis. A extração não usa a quantidade de cards orgânicos nem números sem a palavra `resultado`, `resultados`, `result` ou `results`.

O parser aceita contagens localizadas com separadores de milhar e ignora o tempo entre parênteses. `success` exige contagem positiva, `zero_results` exige contador zero ou indicação explícita de ausência, e a página com resultados orgânicos sem contador retorna `unavailable`, código `result_count_not_found` e estágio `google_result_extraction`. Esse estado preserva a métrica anterior e exibe que a consulta foi concluída, mas o contador não pôde ser identificado.

## 44. Ciclo de vida e reconciliação do lote allintitle

O background mantém um ponteiro efêmero `allintitle:activeOperationByBrand:{brandId}` somente para estados `queued`, `running`, `paused` ou `captcha_required`. Estados `completed`, `cancelled`, `failed`, `interrupted` e `orphaned` permanecem no histórico com resultados e progresso, mas nunca bloqueiam uma nova operação.

Ao iniciar o service worker, registros ativos sem executor vivo são marcados como `orphaned`, o ponteiro da marca é removido e a retomada passa a ser explícita. Uma operação viva retorna `allintitle_operation_active` no estágio `operation_guard`; uma operação órfã retorna `allintitle_operation_orphaned` no estágio `operation_reconciliation`. Cancelamento grava o estado terminal e libera a marca sem remover resultados persistidos.

## 45.1 Medição de volume por Google Ads

A ação explícita `Atualizar métricas` envia somente IDs e `operationRequestId` para a rota autenticada tenantizada do Minerador. Conta, MCC, idioma, geolocalização, rede, moeda e timezone são resolvidos no servidor pela conexão da marca. A consulta Google Ads preserva média mensal, série mensal, concorrência Ads, lances/CPC em micros, proveniência e versão.

Cada resultado válido é persistido como medição versionada antes de atualizar `volume_search`. Falha parcial, ausência, quota ou OAuth preservam valores anteriores e nunca convertem `null` em zero. Lotes técnicos de até 10.000 são particionados internamente em sequência. A Extensão não mede volume; endpoints RapidAPI de volume estão congelados e não fazem fallback.

## 47. Áreas Descobrir Keywords e Processar Keywords — MVP da Descoberta concluído

O Minerador terá duas áreas: `/{brandRef}/minerador/descobrir` para descoberta, filtros, seleção e importação explícita; e `/{brandRef}/minerador` como Processar Keywords, preservando a planilha atual, métricas, qualificação, KGR, decisão humana e envio ao Arquiteto.

Descoberta não é qualificação editorial. Google Ads Keyword Ideas é sua fonte canônica para volume, histórico, CPC e concorrência Ads; concorrência Ads nunca é usada como KD. Resultados, KD e SERP permanecem futuros e não bloqueiam o MVP. Candidatas só entram no Processador por ação humana explícita, tenantizada e idempotente, como Bruto, Keyword livre, sem lista artificial ou Silo/Categoria, com proveniência `discoveryRunId` preservada.

`DiscoveryRun` e `DiscoveryCandidate` são entidades server-side tenantizadas no fluxo vigente. A seleção, tabela e barra inferior reutilizam componentes extraídos por composição, preservando clique, Ctrl/Cmd, Shift, pintura e selecionar visíveis. Foram validados manualmente a rota, pesquisa nacional, targeting com uma, duas e sete UFs, filtro de volume, persistência, reload, preservação da última pesquisa válida em falha e importação explícita de candidata nova até o Processador.

A Extensão não é mais necessária para descobrir ou importar keywords. Ela permanece como executor produtivo de allintitle, agora consumido pelo Processador para keywords oficiais e pela Descoberta para candidatas, incluindo background, bridge, CAPTCHA, pausa, retomada e notificações. Não duplicar esse executor nem remover a Extensão enquanto o Processador ou a Descoberta dependerem dele.

## 50. Fase 8 — métricas atuais e allintitle nas duas áreas — implementação autorizada localmente

O contrato estrutural desta fase foi implementado no checkout local. `minerador_discovery_candidate_current_metrics` representa a projeção operacional atual da candidata e `minerador_discovery_candidate_metric_history` preserva o histórico append-only; o snapshot da DiscoveryRun não é sobrescrito. A migration aditiva `0013_minerador_discovery_candidate_current_metrics.sql` ainda não foi executada.

O protocolo allintitle existente aceita `keywordId` para keywords oficiais e `candidateId` para candidatas. A Extensão permanece como executor único. Confirmados substituem os valores atuais somente após persistência; falhas preservam valores, data medida e KGR. Candidatas importadas mantêm `keyword_id` vinculado para refletir a mesma medição no Processador.

A regra permanente de métricas é de substituição confirmada: uma medição nova de allintitle, volume, histórico mensal, CPC, concorrência Ads ou targeting substitui o valor operacional atual somente depois da persistência confirmada. Provider, versão e `measured_at` também são atualizados, e o KGR é recalculado com os valores atuais. O valor anterior fica somente em histórico técnico/auditoria.

Falha, ausência, quota, CAPTCHA ou resposta não confirmada preserva integralmente os valores atuais, `measured_at` e KGR. Não se usa `null` para apagar, zero para representar ausência ou média entre medições. Em lote parcial, somente itens confirmados são substituídos.

A integração da Descoberta usa a persistência tenantizada de allintitle para `DiscoveryCandidate` e o contrato aditivo que aceita `candidateId` sem exigir `keywordId` oficial. A Extensão continua sendo o executor técnico único; Descoberta e Processador consomem o mesmo protocolo, sem duplicar leitor, parser, fila, CAPTCHA, pausa ou retomada.

Quando uma candidata possuir `imported_keyword_id`, a keyword oficial será a fonte atual compartilhada pelas duas áreas. A importação transferirá a medição confirmada e sua proveniência sem criar medição concorrente ou repetir automaticamente a consulta. A migration aditiva 0013 foi criada para essa lacuna e permanece pendente de aplicação manual; não foi executada nesta tarefa.

## 49. Nucleo compartilhado de importacao

Extensao e Descoberta devem chamar o mesmo servico server-side de importacao do Minerador. O nucleo normaliza com uma unica funcao neutra, deduplica dentro do lote, procura keywords somente na marca validada, preserva keywords existentes, cria novas como `bruto` com `lista_id = null` e devolve o `keywordId` oficial com resultado por item.

A Extensao preserva seu payload e contrato de resposta. A Descoberta acrescenta lote idempotente, vinculo `DiscoveryRun`/`DiscoveryCandidate`, snapshot de targeting/metricas/proveniencia e atualizacao do estado da candidata. Nenhuma origem pode duplicar a regra de normalizacao ou criar keywords por RPC especifica.

Keywords existentes recebem apenas evidencia aditiva e vinculo de origem; status, lista, silo, publicacao, KGR e decisoes humanas permanecem preservados. A RPC historica da Descoberta e seus patches SQL permanecem legados ate eventual remocao autorizada, sem novos consumidores produtivos e sem migration nova nesta fase.

## 46. Elegibilidade por volume oficial

Google Ads é o provider canônico da elegibilidade mínima de demanda para keywords novas. O limiar operacional é `120` buscas mensais confirmadas.

- média oficial `>= 120`: `eligible` e pode seguir para qualificação;
- média oficial entre `0` e `119`: `below_threshold` e sai da fila de produção;
- resposta exata sem média mensal: `unavailable` e sai da fila de produção;
- sem medição: `pending`;
- falha técnica: `measurement_failed`, preservando volume, KGR e metadados anteriores.

O estado é aditivo em `analise_semantica.volume_eligibility`, com provider, versão, data, limiar e média retornada. Ele não reutiliza status editorial, não converte ausência em zero e não apaga keywords. A visualização operacional padrão mostra somente `eligible`; keywords publicadas continuam visíveis e estruturalmente protegidas.

## 48. Envio explícito de candidatas ao Processador

Descoberta e Processador são áreas distintas. A pesquisa, o reload, filtros, ordenação e seleção não importam candidatas automaticamente. A importação só ocorre pela ação humana `Enviar selecionadas ao Processador`.

O navegador envia apenas UUIDs técnicos de `DiscoveryCandidate` e um `importRequestId` UUID. O servidor resolve novamente a marca por `brandId`, o ator autenticado e todos os dados da candidata; texto, targeting, métricas ou proveniência enviados livremente pelo navegador não são aceitos como fonte.

O envio é seletivo, tenantizado, idempotente e rastreável. As candidatas precisam pertencer à marca ativa, estar em uma execução concluída, normalizada e aprovadas pelo motor de filtros. A mesma seleção com o mesmo `importRequestId` retorna o resultado consolidado sem duplicar; o mesmo identificador com outra seleção é recusado.

Uma candidata nova cria uma keyword no Processador como `bruto`, `Keyword livre`, sem lista, Silo/Categoria, Principal, KGR, intenção/funil definitivos ou envio automático ao Arquiteto. A intenção e o funil preliminares, targeting, métricas oficiais, provider/version, seed, relação, execução e timestamps permanecem como proveniência. Keywords existentes da mesma marca não são duplicadas nem têm decisões, publicação, lista, silo, métricas ou classificação humana sobrescritas; recebem apenas vínculo adicional de origem.

O lote de importação e os vínculos de origem são entidades server-side com RLS, restrições de tenant e resultado individual por candidata. A RPC histórica e os objetos SQL de `0010`, `0011` e `0012` permanecem documentados sem consumidor produtivo; o fluxo vigente usa o núcleo compartilhado de importação. A validação manual de candidata nova, persistência remota, defaults `bruto`/sem lista e aparecimento no Processador foi concluída. O Processador continua sendo aberto por `/{brandRef}/minerador`, sem redirecionamento automático.

## 45. Seleção livre e fila contínua de allintitle

Clique comum, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, seleção de visíveis e pintura são complementares tanto na tabela do Minerador quanto na prévia da Extensão. A pintura só inicia após deslocamento de 4px e não troca o cursor normal do checkbox; um gesto de pintura suprime somente o clique sintético dele próprio.

A seleção total não tem limite funcional. O background cria uma operação única por `operationRequestId`, reparte internamente em sublotes sequenciais de até 10 keywords e preserva `brandId`, resultados confirmados, zero explícito, pausas, cancelamento e reconciliação. Cada evento carrega o identificador da operação, `batchId` técnico, índice geral e índice de sublote; a prévia acompanha a operação e mostra cada resultado persistido sem esperar a conclusão total. Durante a execução, o marcador informa progresso e orienta manter o Chrome aberto.
