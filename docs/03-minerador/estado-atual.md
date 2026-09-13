# Estado atual — Minerador

## Normalização do funil lógico no painel KeywordDNA — 2026-09-12

- **Verificado no código:** `components/editorial/dna-panels.tsx` normaliza o
  resultado de `funnelPresentationValue` na criação de
  `logicalFunnelDisplayValue`, com contrato explícito `string | null`, sem cast.
  Preservados o formatador compartilhado, o uso em `funnel.logic` e os demais
  consumidores do painel; valores sem conteúdo significativo tornam-se `null`.
- **Confirmado por build:** `pnpm run build` passou, incluindo TypeScript e
  geração das páginas. Correção local de tipagem, sem alteração de persistência
  ou contrato público; interface não validada manualmente nesta tarefa.
- Lint direcionado sem diagnósticos e `git diff --check` sem erros.
  Testes existentes do painel e da consolidação: 10 passaram e 8 falharam;
  as falhas estão em expectativas de estrutura/classes do painel bento,
  fora das linhas alteradas. A suíte de consolidação semântica passou.

## Consolidação canônica de integrações — 2026-08-25

- **Fundação:** `PLATFORM_INTEGRATION_FOUNDATION = READY`.
- **Infraestrutura compartilhada:** Google Ads é plataforma fixa; DataForSEO
  atende allintitle, compatibilidade e SERP compartilhada por capabilities;
  DeepSeek é a IA canônica. Google Cloud, YouTube e Telegram não são
  Connections ou quotas do Minerador.
- **Governança:** Agência recebe disponibilidade e Marca consome por
  `brandId`; nenhum módulo administra provider, credential, grant, binding ou
  quota.
- **Estado reportado no Admin:** DataForSEO e DeepSeek `Connection READY`,
  DeepSeek `deepseek-v4-pro`, Google Cloud Speech/Storage e YouTube `READY`.
  Isso não substitui smoke de operação, readback ou persistência.
- **Radar:** é consumidor da SERP compartilhada e está aberto para
  desenvolvimento; referências de provider SERP legado nos snapshots abaixo
  são históricas e não autorizam restauração ou fallback.

As entradas datadas anteriores a esta consolidação permanecem como evidência
de implementação e decisão. O bloco acima é a fonte de estado vigente.

## Aplicabilidade do KGR na planilha e decisão em lote — implementação local — 2026-09-03

- **Implementado localmente:** a coluna KGR da planilha mostra o score técnico
  (ou o estado da medição quando não há score) e, abaixo, o seletor
  `Pendente`/`Aplicável`/`Não aplicável`. O seletor por linha chama a mesma
  ação `kgr` da Revisão Humana: persiste em `analise_semantica`, confirma por
  readback canônico e, com revisão em edição aberta, altera somente a cópia de
  trabalho até concluir ou cancelar.
- **Implementado localmente:** a barra inferior da seleção ganhou o seletor
  `KGR` ao lado do `Status`, no rodapé e no menu compacto. O lote usa
  `planKgrApplicabilityBatch` (`lib/minerador/kgr-applicability-batch.ts`):
  cada keyword passa pelo mesmo contrato humano (origem, ator, data, versão e
  histórico); keywords já na decisão alvo não são reescritas; keywords com
  revisão em edição são ignoradas e contadas na notificação. Persistência por
  keyword, readback canônico, progresso na barra e histórico de desfazer.
- **Implementado localmente:** a barra inferior também oferece `Concluir
  revisão` em lote, entre o seletor de KGR e o Status, refletindo a ordem
  humana decidir KGR → concluir revisão → definir status. O lote usa
  `planHumanReviewCompletionBatch`
  (`lib/minerador/human-review-completion-batch.ts`) com o mesmo contrato da
  conclusão individual: `canCompleteHumanReview` + `completeHumanReview`,
  defaults conservadores, KGR obrigatório quando calculável; revisões já
  concluídas, com KGR pendente ou em edição ficam de fora e são contadas na
  notificação. Persistência por keyword, readback exigindo `status =
  completed`, progresso e histórico de desfazer.
- **Preservado:** score KGR, Volume, Resultado, CPC, KD, status editorial,
  aprovação e handoff não mudam com a decisão nem com a conclusão em lote;
  `REVIEW_REQUIRED_FOR_APPROVAL = NO` permanece (adendo de 2026-08-29). O
  badge de aplicabilidade da célula foi substituído pelo seletor; os badges de
  medição (`Não calculável`, `Sem medição`, `Inconsistente`, `Inválido`)
  permanecem. Largura padrão da coluna KGR passou de 88 para 108 px.
- **Spec:** seção 22 revisada; a regra anterior de tabela informativa e
  decisão KGR somente em massa por `Aprovar como KGR`/`Marcar não aplicável`
  está superada.
- **Confirmado por teste:** `tests/minerador-kgr-applicability-batch.test.mts`
  (contrato do lote, exclusões, resumo e wiring da planilha) e a suíte de
  hidratação da tabela atualizada.
- **Ainda não validado:** uso manual na UI com marca real, altura das linhas
  com o seletor e readback remoto em lote grande.

## Google Ads — rotação real do refresh token após expiração — 2026-09-03

- **Validado manualmente:** o refresh token rotacionado em 2026-08-25 passou
  a falhar com `invalid_grant` (`Token has been expired or revoked.`) em
  `oauth2.googleapis.com/token`, HTTP 400, antes de qualquer chamada à Google
  Ads API. Novo token rotacionado pelo Admin em 2026-09-03 22:01 UTC; health
  check `ready`, duas contas acessíveis, Metrics persistiu e refletiu na tabela.
- **Verificado no código:** `lib/google/ads/auth.ts` descarta o corpo de erro
  do endpoint de token; o diagnóstico do Minerador mostra `providerErrorCode`
  e `providerErrorMessage` nulos nesse caso. Melhoria pendente no backlog.
- **Ainda não verificado:** status de publicação da tela de consentimento
  OAuth no Google Cloud. Expiração em ~7 dias é compatível com modo Testing.

## Google Ads — refresh token operacional no Secret Store — 2026-08-24

- **Verificado no código:** Discovery, Metrics e a rota de conexão resolvem a
  configuração pelo `resolveGoogleAdsPlatformConfig()`. Os campos estáticos
  permanecem em ENV server-side; o OAuth Refresh Token é resolvido somente
  por `integration_connections.secret_ref` no Secret Store.
- **Verificado no código:** não existe fallback automático para
  `GOOGLE_ADS_REFRESH_TOKEN` no runtime operacional. O valor de ENV mantido
  para o smoke CLI manual não é usado pelo resolver canônico do produto.
- **Verificado no código:** ausência, referência inválida ou indisponibilidade
  do Secret Store produz bloqueio explícito e preserva o estado anterior; a
  rotação pelo Admin cria nova referência e invalida o estado `READY` até o
  health check explícito.
- **Preservado:** `brandId` continua tenant/dono dos dados do Minerador,
  Research Customer ID permanece global da Plataforma e não houve migration,
  alteração de schema ou escrita remota.
- **Ainda não verificado:** rotação, health check e smoke autenticado reais
  após a configuração remota.

## R5 Semantic Reviewer — leitura independente e gate de valor semântico — implementação local — 2026-08-21

- **Verificado no código:** a Phase 1 recebe `rawKeyword` em posição explícita e
  trata os campos da Lógica como `logicHypothesis`, comparando somente depois da
  leitura independente. A Phase 2 e a Phase 3 também recebem a keyword original;
  a síntese recebe apenas a hipótese lógica compacta, a revisão semântica e as
  evidências externas compactas, sem duplicar os snapshots anteriores.
- **Correção local:** divergências passam por um gate determinístico de mudança
  real e qualidade de evidência. Estados conhecidos como `N/A` e `Não informado`
  são equivalentes para o filtro de no-op; sinais de técnica/produto isolados não
  promovem BOFU; sinais explícitos como `perto de mim` e `qual é melhor` podem
  sustentar BOFU/MOFU respectivamente.
- **Preservado:** três fases, budgets `1100/1100/600`, reliability envelope,
  retries, DeepSeek, schema de resposta, Google Ads, DataForSEO, KGR, persistência
  do `ai_review` e readback. Não houve fase/provider/migration/schema novo.
- **Telemetria interna:** o resultado NDJSON expõe contagens de divergências e
  enriquecimentos aceitos/descartados junto ao `executionRequestId`; essas
  contagens não são persistidas nem exibidas como ruído no KeywordDNA.
- **UI:** quando a IA termina sem divergências ou enriquecimentos aceitos, o
  resumo da Revisão Humana informa `Sem correções semânticas relevantes.`;
  concordâncias permanecem recolhíveis.
- **Confirmado por teste:** suítes focadas de R5, DeepSeek, revisão humana,
  read-model e gates passaram; `check:visual-system` e ESLint direcionado dos
  arquivos de produção passaram. Nenhuma chamada paga foi executada.
- **Ainda não validado:** smoke autenticado real com keywords representativas,
  resposta atual do provider, persistência/readback remoto e avaliação manual da
  qualidade semântica.

`R5_INDEPENDENT_READING_IMPLEMENTED = YES`;
`R5_SEMANTIC_QUALITY_SMOKE = PENDING`.

## R5/R6 — auditoria vertical de execução e separação de estados — implementação local — 2026-08-21

- **Origem localizada no código:** o card observado como `CORREÇÕES PROPOSTAS`
  não é criado pelo Value Gate do R5. O painel R6/R6.1 montava
  `strategicUnknownRows` para `Intenção`, `Nicho` ou `Funil` sem leitura
  consolidada, preenchia `logicalValue = null`, `aiSuggestion = null` e
  `verdict = EVIDÊNCIA INSUFICIENTE`, e depois incluía essas linhas em
  `divergenceRows`.
- **Correção aplicada:** linhas estratégicas desconhecidas agora ficam em
  `DECISÕES PENDENTES`; `CORREÇÕES PROPOSTAS` recebe somente divergências reais.
  A ação `Confirmar desconhecido`/`Editar`, o gate de conclusão e a
  persistência/readback existentes foram preservados.
- **R5 preservado:** não foram alterados prompt, budgets, DeepSeek, retries,
  schema, engine lógico, funil, providers, Google Ads, DataForSEO, KGR ou
  reliability envelope. O Value Gate existente continua descartando
  `Não informado`/`N/A` equivalentes.
- **Concordâncias:** permanecem compactadas e recolhidas por padrão; a
  comparação individual continua disponível dentro dos detalhes da revisão.
- **Limite da auditoria:** o `executionRequestId`
  `c627df02-fa29-4c57-861a-c9e5c1ab5019` não foi encontrado em artefato
  persistido no checkout e não houve readback remoto/autenticado. Portanto os
  payloads reais das três fases e os contadores persistidos dessa execução
  específica permanecem não verificáveis localmente.

`EXECUTION_AUDITED = STATIC_CODE_TRACE_ONLY`;
`NO_OP_ORIGIN = R6_STRATEGIC_UNKNOWN_ROW_MAPPING`;
`R5_VALUE_GATE_WORKING = YES_BY_FOCUSED_TESTS`;
`R6_EXCEPTION_MAPPING = FIXED`;
`UI_GROUPING_FIXED = YES`;
`PHASE_1_RAW_KEYWORD_CONFIRMED = YES_IN_CODE`;
`PHASE_1_INDEPENDENT_READING_CONFIRMED = YES_IN_CODE_NOT_REAL_SMOKE`;
`NO_OP_CORRECTIONS_VISIBLE = 0_FOR_THE_LOCALIZED_PATH`;
`AGREEMENTS_DEFAULT_COLLAPSED = YES`;
`READY_FOR_NEXT_REAL_SMOKE = YES`.

## Fase 3 — preflight e runbook para homologação real DeepSeek — 2026-08-19

- **Implementado localmente:** o preflight read-only
  `supabase/scripts/deepseek-homologation-preflight-read-only.sql` audita a
  fundação `integration_*`, provider, capability, Connection, grants,
  bindings, quota, Secret Store/ACL e Usage sem selecionar conteúdo de
  segredo.
- **Confirmado remotamente em leitura:** a capability `ai_generation` está
  ativa em `production` com `unit_name = request`; a fundação estrutural e a
  ACL do Secret Store passaram; não existe provider ou Connection DeepSeek.
- **Bloqueio remoto:** existe uma Connection OpenRouter `platform/production`
  `READY` com segredo e há 37 eventos OpenRouter no ledger. Isso é conflito de
  configuração remota, não prova de nova chamada pelo runtime local, e não foi
  alterado nesta fase.
- **Ainda não executado:** cadastro remoto, segredo, health check, smoke R5 e
  homologação real. A Fase 3A implementou localmente a UI e o writer
  server-side; nenhuma dessas ações foi executada contra o remoto.
- **Contrato da Fase 3A:** `/admin?tab=integracoes` oferece `Configurar` para
  DeepSeek, com API Key password obrigatória, modelo `deepseek-v4-pro` e
  endpoint `https://api.deepseek.com` somente leitura. O writer reutiliza a
  Connection global equivalente, grava no Secret Store/Vault e confirma o
  readback sem segredo. Salvar não executa health check.

```text
DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED
DEEPSEEK_ADMIN_CONFIGURATION_UI = IMPLEMENTED
DEEPSEEK_SECRET_SERVER_WRITER = IMPLEMENTED
DEEPSEEK_CONNECTION_SERVER_WRITER = IMPLEMENTED
DEEPSEEK_CONFIGURATION_READBACK = IMPLEMENTED
DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
```

## R5 DeepSeek Oficial — contrato de divergências e non-thinking — implementação local — 2026-08-19

- **Verificado no código:** os budgets enviados pelo orquestrador são
  `phase_1 = 700`, `phase_2 = 700` e `phase_3 = 600` em `max_tokens`. Eles
  permanecem explícitos e não foram aumentados arbitrariamente; a Fase 1
  recebe saída JSON compacta e agora não divide esse orçamento com reasoning.
- **Correção local:** as três fases forçam `thinking: { type: "disabled" }`
  somente durante a operação R5, sem alterar o default global da Connection
  DeepSeek nem outros módulos.
- **Contrato Phase 1:** `divergences[].evidenceUsed` é obrigatório e deve ser
  um array não vazio de strings curtas. O prompt agora contém um exemplo JSON
  exato e limita a evidência aos campos lógicos; fatos quantitativos ficam na
  Phase 2.
- **Diagnóstico:** falhas Zod preservam `schemaIssuePaths` e passam a registrar
  `path`, `code`, `expected` e tipo `received`, sem copiar conteúdo do modelo,
  prompt ou chain of thought. Divergência sem evidência continua falhando;
  incerteza sem evidência deve ir para `remainingAmbiguities`.
- **Preservado:** `response_format = { type: "json_object" }`, `JSON.parse`,
  validação Zod, `AI_PHASE_1_TRUNCATED`, execução sequencial e persistência do
  `ai_review` somente depois das três fases. Falha ou truncamento não atualiza
  o registro anterior.
- **Diagnóstico sanitizado:** cada evento informa `requestedMaxTokens`, modo
  efetivo, `thinkingExplicitlyConfigured` e `reasoningEffort` quando o provider
  o devolver; reasoning textual, prompt e credencial continuam fora do evento.
- **Validação local:** 16 fixtures R5/R5.2 confirmam contrato válido, ausência
  ou tipo incorreto de `evidenceUsed`, diagnóstico sanitizado, `thinking`
  disabled nas três fases, budgets `700/700/600`, parse/schema, interrupção
  após falha da Fase 1 e zero caminho OpenRouter. Nenhuma chamada paga foi
  executada nesta correção.

## Fase 2 — cutover local OpenRouter → DeepSeek — 2026-08-19

- **Implementado localmente:** a camada compartilhada resolve somente a
  Connection DeepSeek da Plataforma para `ai_generation`, com modelo permitido,
  `https://api.deepseek.com`, segredo server-side e `response_format` em
  `json_object`.
- **Implementado localmente:** R5 mantém três fases, budgets `700/700/600`,
  progresso, JSON parse + validação Zod e preservação do `ai_review` anterior
  quando a geração falha. Thinking permanece configurável por operação e o
  default do provider não é convertido em política global.
- **Implementado localmente:** rotas estruturadas de Minerador, Arquiteto e
  Redator usam o resolver DeepSeek; rotas legadas analisadas não usam ENV como
  fallback. Admin e health check não oferecem nem chamam OpenRouter.
- **Preservado:** Usage e Connections históricas OpenRouter continuam dados
  históricos legíveis; novas operações R5 registram provider/modelo DeepSeek
  pelo ledger existente.
- **Ainda não configurado remotamente:** Connection, secret, capability,
  autorização efetiva e health check real DeepSeek. Nenhuma chamada paga ou
  smoke autenticado foi executado nesta fase.
- **Aceite local:** `DEEPSEEK_LOCAL_CUTOVER = PASS`; isso não equivale a
  `DEEPSEEK_PROVIDER_HOMOLOGATED`.

As seções posteriores que citam OpenRouter, R5 pré-cutover ou smoke anterior
são snapshots históricos preservados; não descrevem caminhos ativos atuais.

## Histórico — Fase 1: auditoria do corte OpenRouter → DeepSeek — 2026-08-19

- **Snapshot pré-Fase2:** OpenRouter participava do R5 do Minerador por
  Connection/Secret Store/Usage parcial e também de rotas legadas por ENV; os
  consumidores estruturados de Arquiteto e Redator usam o resolver ENV
  compartilhado.
- **Registro histórico:** o schema `integration_*` local é genérico e
  comporta `provider_key = deepseek`, Connection `platform`, `secret_ref`,
  capability `ai_generation` e metadata de modelo sem migration específica de
  provider.
- **Gap que motivou a Fase2:** `ai_generation` mapeava para OpenRouter,
  o caminho R5 usa `HOMOLOGATION_ALLOW_ALL` com `binding = null`, a UI/health
  ativa OpenRouter e a configuração DeepSeek de Connection é rejeitada pelo
  admin. Rotas ENV não usam o catálogo de Connection/Usage compartilhado.
- **Decisão registrada:** DeepSeek Official API será o único provider ativo da
  primeira fase futura, com Connection `platform`, modelo `deepseek-v4-pro`,
  sem fallback ou roteamento paralelo. OpenRouter histórico será preservado.
- **Ainda não verificado:** catálogo remoto, Connection/secret DeepSeek,
  capabilities/bindings efetivos, contrato real do modelo e smoke autenticado.
- **Operações desta fase:** zero migration, zero escrita remota, zero chamada
  paga, zero alteração de runtime.

## Integridade de reprocessamento e freshness do Processador — implementação local — 2026-08-19

- O Processador passou a distinguir `dna_schema_version` de
  `logicProcessorVersion`. A execução lógica explícita registra, de forma
  aditiva no JSONB existente, `logicProcessorVersion`, `logicProcessedAt` e
  `logicInputHash`; linhas antigas sem esses metadados continuam elegíveis a
  uma nova execução explícita e não são reprocessadas ao abrir ou recarregar a
  tela.
- Keywords novas e históricas executam o motor lógico atual quando
  selecionadas. O resultado é persistido com `brandId`, confirmado por
  readback canônico e somente então projetado na tabela e no KeywordDNA.
  Decisões humanas protegidas continuam preservadas.
- Tabela e KeywordDNA compartilham o read model lógico de intenção, nicho e
  funil. Resultado e Volume deixaram de promover projeções locais do provider:
  após cada ação explícita, a leitura canônica do Processador é a fonte da
  tabela; falha de readback não é tratada como sucesso local.
- Snapshots da Descoberta não validam etapas do Processador. KGR corrente só é
  projetado quando existem medições atuais válidas de Google Ads e DataForSEO;
  `KD = 0` permanece válido e ausência continua sendo `null`.
- **Validação automática:** 65 testes focados passaram nas suítes de
  freshness/revalidação, providers, hidratação e ordenação. TypeScript não
  introduziu erro novo; permanecem três diagnósticos históricos de regex em
  `tests/agency-adalba-platform-internal.test.mts`. Smoke autenticado com
  provider real ainda está pendente.


## Minerador R5.2 — correção de regressão de routing — implementação local — 2026-08-19

### Causa relatada no smoke e correção aplicada

- O smoke autenticado relatou HTTP 404 antes da geração, com `provider` e
  `returnedModel` nulos, depois que `provider.require_parameters = true` foi
  introduzido. Esse filtro exigia que um mesmo endpoint declarasse suporte a
  todos os parâmetros auxiliares e eliminava o routing normal do OpenRouter.
- O R5.2 agora omite `provider.require_parameters` no request. O default do
  OpenRouter volta a selecionar endpoints elegíveis sem pin de provider; a
  validação server-side por JSON parse + schema Zod continua obrigatória.
- O `session_id` continua presente e compartilhado pelas três fases. Modelo,
  provider, fallback e budgets `700/700/600` permanecem inalterados.

### Diagnóstico 4xx

- Respostas HTTP de erro preservam, de forma sanitizada, `error.code`,
  `error.type`, `error.message` limitado e uma categoria operacional quando
  reconhecível: `NO_PROVIDER_AVAILABLE`, `MODEL_NOT_FOUND` ou
  `INVALID_REQUEST`.
- O request conhecido no adapter contém `model`, `messages`, `response_format`,
  `temperature`, `max_completion_tokens`, `reasoning` quando suportado e
  `session_id`. A contagem de endpoints elegíveis antes/depois não é exposta
  pela API local do OpenRouter e não foi inferida nem obtida por nova chamada.

### Causa confirmada no contrato local

- `SemanticReviewPhase1OutputSchema` exigia `reviewStatus`, embora a Fase 1 intermediária produza somente `agreementFields`, `divergences`, `semanticEnrichments` e `remainingAmbiguities`. O mesmo excesso foi removido da Fase 2; `reviewStatus` permanece somente na síntese final e no contrato final `ai_review`.
- Os schemas das fases agora são independentes e estritos. Nenhum campo final é ignorado silenciosamente; campo extra ou ausente incompatível falha na fase correta.

### Verificado no código

- O resolver lê `reasoning.mandatory`, `supported_efforts` e o menor effort suportado no metadata operacional do modelo selecionado. Capability opcional envia `reasoning: { enabled: false }`; capability obrigatória usa `minimal` ou o menor effort declarado; capability desconhecida não inventa configuração.
- Cada fase recebe o mesmo `session_id` sanitizado por execução (`brandId + keywordId + operationRequestId`), sem exigir parâmetros no routing. Outra execução gera outro identificador; nenhum provider é fixado.
- O diagnóstico por fase expõe `promptTokens`, `completionTokens`, `totalTokens`, `reasoningTokens`, `cost`, limite, modo de reasoning, `finishReason`, provider routing e `providerRequireParameters`, sem reasoning textual, prompt ou credencial.

### Confirmado por teste

- Testes R5/R5.2 passaram 28/28, incluindo schema intermediário sem `reviewStatus`, reasoning opcional/obrigatório/não suportado, ausência do filtro `require_parameters`, sessão sticky, usage sanitizado e diagnóstico 404 pré-provider.
- Testes da bulk bar/progresso passaram 9/9. ESLint direcionado e `git diff --check` passaram.

### Ainda não verificado

- Nenhuma chamada OpenRouter paga/autenticada foi executada. O próximo smoke deve usar primeiro `campanha de trafego pago`, confirmando Fases 1/2/3 com `finishReason = stop`, schema válido, provider consistente e persistência/readback.

## Minerador R5.2 — revisão IA em três fases — implementação local — 2026-08-19

### Verificado no código

- O modo `semantic_review` executa três chamadas sequenciais por keyword: revisão semântica da lógica, leitura das evidências normalizadas e síntese final do KeywordDNA.
- A fase semântica recebe somente os campos lógicos; a fase quantitativa recebe somente fatos resumidos de Google Ads, DataForSEO e KGR; a síntese recebe a identidade mínima, os fatos essenciais e os resultados compactos das duas primeiras fases. Payloads raw, histórico mensal completo, request IDs e proveniência técnica não são enviados ao modelo.
- A fase quantitativa trata os fatos como imutáveis. A resposta final é expandida no servidor para o `ai_review`/`fieldReviews[]` já consumido por R6/R6.1 e somente é persistida depois das três fases e da validação final do contrato.
- A barra operacional reutiliza o progresso existente e recebe eventos NDJSON `1/3`, `2/3` e `3/3` por keyword; cada fase registra usage/diagnóstico sanitizado separadamente. Reasoning textual nunca é persistido ou exposto; capability opcional é desligada explicitamente e capability obrigatória usa o menor effort compatível.
- Nenhuma troca de modelo/provider, fallback, migration, schema, DataForSEO ou métrica quantitativa foi introduzida. A correção independente de `DATAFORSEO_PARTIAL_RESULTS` permanece fora deste bloco.

### Confirmado por teste

- Testes R5/R5.2 focados passaram 26/26, cobrindo isolamento das entradas, três chamadas com budgets separados, progresso, truncamento por fase, preservação do contrato R6/R6.1 e reasoning model-agnostic.
- Testes de progresso/bulk da IA passaram 9/9. O guard visual passou e o lint direcionado dos arquivos server-side alterados passou.

### Ainda não verificado

- Nenhuma chamada OpenRouter paga/autenticada foi executada. O smoke manual deve usar `campanha de trafego pago` e confirmar três chamadas reais, `finishReason`, usage por fase, readback de `ai_review`, invariância de Volume/Resultado/KGR/CPC e comportamento da barra.
- O TypeScript global continua com somente os três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts`; o teste canônico isolado de OpenRouter depende do pacote local ausente `server-only`.

## R5 OpenRouter — diagnóstico real de truncamento — implementação local — 2026-08-19

- **Verificado no código:** `OpenRouterR5Diagnostic` agora diferencia
  `maxTokensSent`, `maxCompletionTokensSent`, `outputTokenParameter` e
  `outputTokenLimit`; o request atual da rota continua enviando
  `max_tokens = 1800`.
- **Verificado no código:** a falha preserva `requestedModel`, `returnedModel`,
  `finishReason`, `nativeFinishReason`, prompt/completion/total/reasoning
  tokens, `contentPresent`, `contentLength`, `responseFormatRequested`,
  `resolvedOutputFormatMode` e metadados sanitizados de provider/roteamento.
- **Causa da lacuna anterior:** a rota já devolvia o diagnóstico R5, mas o
  `handleBatchSemanticReview` guardava apenas keyword/código/etapa no notice;
  agora o diagnóstico também chega ao `copyPayload` sanitizado, incluindo o
  primeiro provider diagnostic e os detalhes dos itens com falha.
- **Preservado:** truncamento continua sendo classificado somente quando
  `finish_reason` ou `native_finish_reason` é `length`, `max_tokens` ou
  `incomplete`; nenhum token, modelo, provider, retry, fallback, schema,
  migration, métrica quantitativa ou `ai_review` foi alterado nesta correção.
- **Ainda não confirmado:** `ROOT_CAUSE_CONFIRMED = NO` até o usuário executar
  uma nova tentativa real e retornar o diagnóstico copiado. O smoke deve
  distinguir limite de saída, reasoning consumido, encerramento nativo do
  provider ou classificação incorreta.

## KD DataForSEO no Processador — implementação local — 2026-08-19

- **KD_IN_PROCESSOR = YES:** o passo existente `Resultados` mantém o allintitle e também consulta o DataForSEO Labs Keyword Overview para obter `keyword_difficulty` e evidências SEO complementares, sem criar botão ou etapa nova.
- **Fonte e read-model:** a resposta normalizada preserva provider, versão, endpoint, request IDs, timestamps dos datasets, `core_keyword`, idioma, intenção externa e médias de backlinks/domínios no JSONB sem migration. Volume, CPC e competição paga do Keyword Overview não substituem o Google Ads.
- **Exposição:** KD aparece na tabela depois de CPC, com ordenação numérica; no card DataForSEO; em FATOS MEDIDOS da Revisão Humana; no RESUMO PARA DECISÃO; e na Proveniência/detalhes técnicos. Zero é válido e ausência permanece desconhecida.
- **Revalidação:** snapshots da Discovery continuam sendo contexto anterior. `KD` só recebe estado de Processador validado quando a medição contém executor `minerador_server` e `operationRequestId`; falha complementar preserva o KD anterior e registra erro/histórico.
- **IA e decisão:** R5 recebe KD como evidência somente leitura. KD não altera KGR, aplicabilidade, decisão humana ou status final.
- **Limite da evidência:** o adapter SERP atual não retorna KD; por isso o mesmo clique/etapa faz uma chamada complementar ao endpoint Keyword Overview, usando a mesma conexão DataForSEO. Não houve smoke autenticado/pago nesta implementação local.

## Google Ads — smoke real e bloqueios encerrados — 2026-08-18

- **GOOGLE_ADS_DISCOVERY = PASS:** a utilização real confirmou provider, persistência do run/candidatas e readback em lotes; o defeito de URL/readback posterior foi tratado no fluxo local.
- **GOOGLE_ADS_HISTORICAL_METRICS = PASS:** a utilização real confirmou provider e persistência após a compatibilidade de `time_zone`.
- **0043 = CLOSED:** `currency_code` permanece `text`, nullable, com a CHECK preservada.
- **0044 = CLOSED:** `minerador_keyword_metric_measurements.time_zone` permanece `text`, agora nullable; default, dados e estrutura não alvo foram preservados.
- **Demais smoke reais do Minerador:** `DATAFORSEO_ALLINTITLE = PASS`, `MANUAL_CSV_IMPORT = PASS`, `PROCESSOR_IMPORT = PASS`, `INTENT_NICHE = PASS` e `KEYWORD_PROFILE = PASS`.
- **Limite da evidência:** esses smokes não homologam automaticamente Marca, Arquiteto, Radar, Planejador, Redator ou Publicações.
- **Preservado no snapshot de 2026-08-18:** provider Google Ads, Research Customer, DataForSEO, OpenRouter, tenantização e demais módulos. A regra atual de credencial está registrada no bloco de 2026-08-24 no início deste documento.

## Google Ads Historical Metrics — 0043 encerrada remotamente — 2026-08-17

- **METRICS_PROVIDER = PASS:** evidência remota anterior confirmou a resposta do provider `google_ads v25`; esta etapa não repetiu a chamada.
- **ROOT_CAUSE = RESOLVED:** `public.minerador_keyword_metric_measurements.currency_code` agora é `text` nullable; a CHECK validada de três letras continua protegendo valores presentes.
- **0043_POST_VERIFIER = PASS:** o verificador bound confirmou zero delta de dados e preservação de colunas não alvo, constraints, FKs, índices, triggers, RLS, policies, ACL e owner.
- **READBACK REMOTO = PASS:** `attnotnull = false`, tipo `text`, default ausente, CHECK validada e tabela ainda com zero linhas.
- **VALIDAÇÃO LOCAL:** 4 testes direcionados e lint direcionado passaram; `git diff --check` não encontrou erro. O teste SQL reversível ficou `SKIPPED_LOCAL_POSTGRES` porque não havia PostgreSQL respondendo nas portas locais 54322/5432.
- **0043_CLOSED = YES:** não executar rollback, nova migration desta frente nem provider; próximo passo é o Master Refresh Manifest.

## Usage da Discovery Google Ads — implementação local; smoke remoto pendente — 2026-08-16

- **Causa confirmada no código:** a rota `app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts` concluía chamada Google Ads, persistência e readback sem invocar o ledger canônico `integration_usage_events`.
- **Implementado localmente:** `lib/minerador/google-ads-discovery-usage.ts` reutiliza `resolveIntegrationResourceForActor` e `recordIntegrationUsageForResource`, com `operation = module_operation`, `module = minerador`, `units = 1`, capability `google_ads_keyword_discovery` e metadata sanitizada de correlação.
- **Estados:** `succeeded` só é registrado após persistência/readback; chamada iniciada com falha registra `failed`; rejeição antes do provider não registra consumo. Retry usa chave idempotente `google_ads:<operationRequestId>:keyword_discovery`.
- **Preservado no snapshot histórico:** `brandId`, `agencyId`, `actorUserId`, migrations 0041, persistência Discovery, DataForSEO e OpenRouter. O refresh token deixou de ser tratado como ENV-only pela regra vigente de 2026-08-24.
- **Confirmado por testes locais:** 31 testes relacionados passaram; nenhum provider real ou operação remota foi executado. O smoke único para confirmar `USAGE_RECORDED = YES` permanece pendente.

## Importação manual/CSV sem silo — corrigida localmente; validação manual pendente — 2026-08-13

- **Verificado no código:** `keywords_kgr.lista_id` permanece opcional e as importações manual e CSV podem persistir `lista_id = null` com `brand_id` obrigatório.
- **Verificado no código:** o parser CSV não cria listas/silos automaticamente e não descarta keywords sem coluna Silo ou com coluna vazia. Referência explícita inválida é reportada apenas para a linha afetada.
- **Verificado no código:** o modal manual começa em `Sem silo`; sem silos disponíveis, mantém a importação habilitada e informa que as keywords entrarão sem silo.
- **Preservado:** listas existentes, isolamento por marca, status, métricas, KeywordDNA, idempotência e fluxos posteriores. Não houve migration.
- **Ainda não verificado:** persistência autenticada em marca sem silos, CSV misto e recarga da tabela no navegador.

## Historical Import Guard do handoff Minerador → Arquiteto (2026-08-12)

- **Implementado localmente:** o handoff operacional cria somente `keyword/architect/received`; guard `historical_import_protected` retorna `HISTORICAL_IMPORT_PROTECTED`, sem promover ou sobrescrever o registro existente.
- **Implementado localmente:** `architectImportedKeywordIds` continua apenas como bloqueio transitório anti-duplicação até a recuperação canônica remota; não cria workflow, workspace ou ArticleDNA.
- **Regra documentada:** keyword encerra sua unidade operacional no Arquiteto. ArticleDNA é a entidade que segue para Radar, Planejador, Redator e Publicações; keyword permanece como proveniência.
- **SDD aprovada para implementação local:** `docs/compartilhado/sdd-autorizacao-excepcional-recovery-historico-minerador-arquiteto.md` formaliza `historical_import_recovery:execute` como grant excepcional, temporal e por Brand; a fundação ainda exige migration futura, auditoria e gate remoto antes do escritor.
- **Implementado localmente:** `0030_brand_exceptional_operation_grants.sql` prepara grants temporais por Brand, eventos append-only por guard e helper sem bypass; os scripts de preflight/pós-verificação permanecem somente locais e não foram executados remotamente.
- **Pendente de gate remoto:** aplicar apenas após preflight aprovado e decisão humana; ação administrativa, escritor histórico e recuperação remota auditada continuam fora desta fase. Nenhuma operação remota ocorreu.

## Handoff legado Minerador → Arquiteto — prévia local (2026-08-12)

- **Verificado no código:** `keywords_kgr` permanece a origem; `editorial_workflow_items` é a única prova remota de handoff para o Arquiteto.
- **Implementado localmente:** marcadores `architectImportedKeywordIds` de recuperação local são tratados como `LEGACY_RECOVERY_CANDIDATE`, nunca como confirmação de import.
- **Implementado localmente:** a prévia autenticada e somente leitura compara cada marcador por `keyword.id` com a keyword da Brand, workflow `keyword/architect` e `ArticleDNA.keywordReferences`; não usa texto, nome ou slug.
- **Ainda não validado manualmente:** nenhuma reconciliação foi executada e nenhum dado remoto foi alterado nesta tarefa.

## Runtime server-side de governança de integrações — implementação local — 2026-08-11

- **Verificado no código:** `lib/server/integrations-runtime.ts` é a camada canônica server-side sobre 0024/0025. Ela separa autorização, capability/entitlement, binding, connection, quota e usage; nenhum consumidor precisa consultar as tabelas diretamente.
- **Verificado no código:** o contexto exige `actorUserId`, `agencyId`/`brandId` explícitos, `capabilityKey`, operação real de capability do schema (`ai_generation`, `keyword_discovery`, `keyword_metrics`, `allintitle` ou `transactional_email`) e ambiente. Não há resolução por owner, slug, nome, primeira Agency, primeira Brand, primeiro binding ou primeira connection.
- **Verificado no código:** autorização reutiliza `requireAgencyOperationalAccess` e `requireBrandEditorialAccess` com `CanonicalAuthorizationRepository`. Admin global não é convertido automaticamente em owner/member operacional.
- **Verificado no código:** um grant Agency→Brand e seu binding só são utilizáveis enquanto o vínculo `agency_brands` ativo é confirmado pelo repositório canônico. Grant/binding persistido e vínculo operacional utilizável permanecem conceitos distintos.
- **Verificado no código:** connection só é obtida pelo binding explícito, com owner, ambiente, provider ativo, lifecycle `ready` e `secret_ref` presente. O retorno expõe apenas `secretConfigured`; nunca retorna `secret_ref` ou segredo.
- **Verificado no código:** Platform→Brand direto só é aceito quando grant e binding explícitos existem. A ausência de entitlement de Agency não cria fallback para Platform.
- **Verificado no código:** quota seleciona a policy ativa mais específica (Brand, Agency, Platform), trata `limit_units = NULL` como `UNLIMITED`, soma somente usage `succeeded` no escopo e período da policy e retorna `INTEGRATION_QUOTA_POLICY_MISSING` quando não há policy; não há default silencioso.
- **Verificado no código:** usage é registrado somente server-side, com actor, scopes, provider, connection, capability, operação de ledger, unidades, custo, status, correlação sanitizada, metadata filtrada e idempotência por `(connection_id, idempotency_key)`. Nenhum UPDATE/DELETE é emitido pelo runtime.
- **Confirmado por testes locais:** `tests/integrations-runtime.test.mts` cobre Platform→Agency, Agency→Brand ativo, vínculo inativo, binding explícito, ausência de first-match, quota disponível/esgotada/ilimitada/ausente, usage tenantizado, idempotência, isolamento Agency/Brand, Platform→Brand explícito, ausência de segredo no retorno e ausência de provider real.
- **Estado remoto relatado pelo usuário:** 0024 e 0025 aplicadas e verificadas; as sete tabelas estavam vazias no início desta camada. Isso não foi reconsultado pelo agente.
- **Snapshot da camada 0024:** Google Ads, DataForSEO e IA ainda não tinham sido adaptados aos consumidores canônicos; a consolidação de 2026-08-25 supersede essa fotografia. Nenhum provider legado é reativado por este registro.
- **Dívida preservada:** `DEFAULT_ACL_GLOBAL_POLICY_REQUIRED` continua pendente antes de qualquer futura migration que crie novas tabelas. Nenhuma migration nova foi criada.

## Governança de integrações — schema mínimo local 0024 — 2026-08-11

- **Verificado no código:** não havia tabelas `integration_*` nem ledger canônico de quota/usage. O próximo número livre local era `0024`.
- **Preparado localmente:** `supabase/migrations/0024_integrations_resource_governance.sql` cria, de forma aditiva, providers, capabilities, connections, grants, bindings, políticas de quota e usage events append-only. A revisão pré-aplicação removeu a dependência obrigatória capability→provider e adicionou validações de escopo Agency→Brand nos grants/bindings.
- **Contrato preservado:** authorization, entitlement/grant, connection/credential, binding, quota e usage continuam separados. `secret_ref` é somente referência server-side; não há segredo bruto, token, seed ou backfill.
- **Segurança preparada:** owner Platform/Agency/Brand possui escopo explícito e FKs tipadas; `anon` não recebe acesso, `authenticated` só lê sob RLS e mutações ficam no `service_role` server-side. O ledger possui idempotência e trigger append-only.
- **Compatibilidade:** Google Ads continua usando `minerador_google_ads_connections`; DataForSEO continua global por ambiente; IA continua exigindo `AI_PROVIDER` explícito. Nenhum consumidor, UI, provider ou fallback foi adaptado nesta fase.
- **Verificadores locais:** `supabase/scripts/integrations-0024-pre-apply-snapshot-read-only.sql`, `supabase/scripts/integrations-0024-preflight-read-only.sql` e `supabase/scripts/integrations-0024-post-verification-read-only.sql` retornam um único result set; versões fixas: snapshot `2026-08-11-integrations-0024-pre-apply-snapshot-v1`, preflight `2026-08-11-integrations-0024-preflight-v2` e pós-verificador `2026-08-11-integrations-0024-post-v1`.
- **Diagnóstico ACL local:** `supabase/scripts/integrations-0024-acl-diagnostic-read-only.sql` foi preparado com versão fixa `2026-08-11-integrations-0024-acl-diagnostic-v1`, uma linha por tabela e distinção entre as seis tabelas de catálogo e o ledger `integration_usage_events`. O texto do pós-verificador foi corrigido para contar somente as seis tabelas no check `acl:service_role_catalog_write`.
- **Confirmado por testes locais:** `tests/integrations-0024-schema.test.mts` cobre separação de conceitos, Platform/Agency/Brand, binding explícito, ausência de colunas de segredo bruto, RLS/ACL, append-only e read-only dos verificadores.
- **Ainda não verificado:** ACL remota detalhada de `integration_usage_events`, default ACL efetiva, aplicação remota da 0024, RLS remoto, catálogo remoto, configuração de secret manager/Vault, backfill de metadados e migração de consumidores. Nenhuma operação remota foi executada.

## Security hardening de ACL — migration sucessora 0025 — 2026-08-11

- **Relatado pelo usuário no catálogo remoto:** as sete tabelas 0024 tinham privilégios efetivos amplos para `service_role`, sem membership herdada observada; ACL explícita e default ACL ampla foram reportadas. O estado remoto não foi consultado novamente pelo agente.
- **Preparado localmente:** `supabase/migrations/0025_integrations_usage_acl_hardening.sql` revoga a ACL direta de `service_role` nas sete tabelas e concede somente `SELECT/INSERT/UPDATE` nas seis tabelas de catálogo e `SELECT/INSERT` no ledger. Reafirma `authenticated` como SELECT sob RLS e anon/PUBLIC sem acesso.
- **Preflight e pós-verificação:** `supabase/scripts/integrations-0025-acl-hardening-preflight-read-only.sql` exige a ACL ampla prévia, RLS, policies e owners; `supabase/scripts/integrations-0025-acl-hardening-post-verification-read-only.sql` prova a ACL final, privilégios finos, preservação estrutural e `DATA_DELTA = 0`.
- **Dívida registrada:** `DEFAULT_ACL_GLOBAL_POLICY_REQUIRED`. A 0025 não executa `ALTER DEFAULT PRIVILEGES`; uma política global futura exige revisão separada.
- **Ainda pendente:** execução remota do preflight, aplicação manual da 0025, pós-verificação e confirmação de `DATA_DELTA = 0`. Nenhuma operação remota foi executada.

## Histórico — IA — fallback silencioso removido localmente — 2026-08-10

- **Verificado no código:** `AI_PROVIDER` agora resolve explicitamente `deepseek` ou `openrouter`; a ausência, invalidez ou credencial ausente falha antes da chamada.
- **Verificado no código:** `lib/server/structured-ai.ts` e as rotas legadas de análise usam a mesma resolução explícita. Não há seleção DeepSeek → OpenRouter, OpenRouter → DeepSeek ou troca automática de modelo.
- **Verificado no código:** falhas HTTP do provider são classificadas por código sanitizado (`AI_PROVIDER_AUTHENTICATION`, `AI_PROVIDER_RATE_LIMIT`, `AI_PROVIDER_UNAVAILABLE`, `AI_PROVIDER_ERROR` e `AI_PROVIDER_INVALID_RESPONSE`); corpo de erro não é retornado nem registrado.
- **Confirmado por testes locais:** DeepSeek e OpenRouter explícitos usam seus próprios endpoints/modelos; falha do DeepSeek não dispara OpenRouter; provider inválido/ausente e credencial ausente falham; secrets não aparecem em erros; nenhum teste chama provider real.
- **Pendente naquela fotografia:** configurar `AI_PROVIDER` em cada ambiente de runtime e executar validação manual controlada. A consolidação posterior registra DeepSeek como IA canônica compartilhada; nenhuma alteração remota é inferida aqui.

## Fase 1.5 — Administração global de agências — implementada localmente; validação manual pendente — 2026-08-05

- **Verificado no código:** o Admin global possui a aba canônica `/admin?tab=agencias`, com lista, estado vazio, cadastro, seleção de administrador por nome/e-mail, vínculos opcionais de marcas e tela de detalhes para ativar/desativar agência, memberships e vínculos.
- **Verificado no código:** as rotas `/api/admin/agencies` e `/api/admin/agencies/users` exigem sessão e Admin global no servidor. Usuários são resolvidos por `auth.users` somente no servidor; o navegador recebe apenas resumo sanitizado de nome/e-mail/ID técnico já selecionado.
- **Verificado no código:** `lib/server/agency-admin.ts` cria o membership inicial explícito em `agency_memberships`, vincula marcas por `brand_id` real, bloqueia segunda agência ativa, não cria `brand_memberships` e não infere agência por owner, slug, nome ou `auth.uid()`.
- **Preservado:** `brand_id` continua tenant canônico; Google Ads por marca, DataForSEO global provisória, Serper do Radar, rotas `brandRef`, Minerador, Marca, Arquiteto e Radar não foram migrados nem modificados funcionalmente.
- **Ainda não verificado:** criação e persistência remotas reais, RLS remoto, conflito visual, usuário sem acesso, isolamento Adalba/Lindisse, recarga do Admin e dark mode/breakpoints. A validação manual seguirá a sequência aprovada.

## Histórico supersedido — arquitetura de provedores por plataforma e agência — 2026-08-05

- **Verificado no código:** `brand_id = public.marcas.id` continua sendo o tenant dos dados. `owner_user_id`, `auth.uid()`, admin global e `brandRef` não são agência nem podem resolver credenciais por fallback.
- **Verificado no código:** Google Ads possui OAuth/Developer Token/versionamento globais no servidor e uma conexão operacional por marca em `minerador_google_ads_connections`; Descoberta e métricas ainda dependem dessa linha por `brand_id`.
- **Verificado no código:** DataForSEO lê uma credencial única do ambiente e hoje atende o allintitle de Descoberta/Processador; não existem entidade de agência, vínculo agência-marca, conexão DataForSEO por agência ou auditoria de uso por agência.
- **Snapshot histórico:** o provider SERP legado ainda aparecia como consumidor produtivo e os contratos registravam o literal anterior.
- **Decisão posteriormente consolidada:** Google Ads é infraestrutura fixa da Plataforma; DataForSEO é infraestrutura compartilhada para Minerador, Arquiteto e Radar; resultados, medições, keywords e históricos continuam sempre em `brand_id`.
- **Gate preservado:** a substituição documental não autoriza apagar snapshots, alterar schema ou afirmar zero legado sem prova específica.
- A SDD canônica está em `docs/03-minerador/propostas/arquitetura-provedores-plataforma-agencia.md`. Não houve código, schema, migration, banco, credencial ou chamada paga nesta decisão documental.

## Fase 1 — fundação de agências — implementação local; migration pendente — 2026-08-05

- **Verificado no código:** foram adicionados somente `agencies`, `agency_memberships` e `agency_brands` na migration local `0014_agency_foundation.sql`, com FKs restritivas, RLS, roles `agency_admin`/`operator`/`viewer` e unicidade parcial para impedir duas agências ativas na mesma marca.
- **Verificado no código:** `resolveAgencyForBrand`, `requireAgencyMembership`, `requireAgencyAccessToBrand` e `isGlobalAdmin` existem em `lib/server/agency-context.ts`. O contrato compõe autorização de marca e membership ativa da agência; owner de marca não é convertido em membership de agência e admin global retorna contexto explícito sem linha de membership.
- **Snapshot histórico:** nenhuma rota existente consumia esses contratos na fase inicial. O estado posterior usa os resolvedores compartilhados já consolidados, sem fallback por owner/slug/e-mail.
- **Confirmado por teste local:** fixtures cobrem isolamento entre agências, membership inativa, ambiguidade de vínculo, papel do admin global e ausência de fallback por owner/slug/e-mail.
- **Ainda não verificado:** aplicação da migration, RLS remoto, criação de agência, vínculos marca→agência, memberships reais e regressão autenticada de rotas existentes. Não foi executado SQL, migration, backfill ou chamada paga.

## Estado vigente após a substituição do executor allintitle — 2026-08-05

Esta seção substitui qualquer registro histórico abaixo que descreva a Extensão como executor produtivo.

- A pasta `minerador-extensao/`, seus scripts, assets e adaptadores Chrome foram removidos do checkout.
- Não existem consumidores produtivos de bridge, `chrome.runtime`, `chrome.storage`, notificações Chrome, `extension_page_reload_required` ou listeners exclusivos da Extensão.
- As rotas `/api/extensao/...` exclusivas da Extensão foram removidas. O núcleo de domínio e persistência de allintitle e métricas atuais foi preservado para um futuro executor interno.
- As ações allintitle das abas Descobrir e Processar usam a rota server-side DataForSEO e só são executadas por ação explícita; sem `DATAFORSEO_LOGIN` e `DATAFORSEO_PASSWORD`, a interface informa configuração ausente sem chamada paga.
- Resultados allintitle já persistidos, KGR, histórico de medições, campos existentes de keywords, métricas atuais de candidatas e migrations (incluindo 0013) permanecem preservados. Nenhum dado foi apagado.
- Google Ads, DataForSEO, Descoberta, Processador, seleção, pintura e o importador compartilhado continuam produtivos; referências ao provider SERP legado permanecem somente em snapshots históricos até o gate próprio de zero legado.
- A substituição confirmada de métricas, a preservação em falha e o recálculo de KGR continuam regras do domínio. O histórico não é exibido como valor operacional atual.
- O allintitle continua sendo requisito do Processador e agora possui executor server-side DataForSEO, sem bridge, background, injeção ou instruções `chrome://extensions`.

### DataForSEO — implementação local sem smoke pago

- **Verificado no código:** `POST /v3/serp/google/organic/live/regular` recebe `allintitle:"<keyword>"`, `location_code`, `language_code`, `device=desktop`, `depth=10` e `tag=operationRequestId`.
- **Verificado no código:** somente `se_results_count` é aceito como total. `items_count`, `items.length` e `organic.length` não são usados; zero só é aceito quando explícito.
- **Verificado no código:** keywords oficiais e candidatas usam a mesma rota, com substituição somente após persistência confirmada, histórico preservado e KGR recalculado quando aplicável. Candidatas importadas atualizam a keyword oficial vinculada.
- **Corrigido localmente:** uma nova ação explícita sempre reconsulta a DataForSEO, inclusive quando já existe resultado. O retorno diferencia primeira medição e atualização; o valor anterior, inclusive quando igual ao novo, permanece no histórico técnico.
- **Confirmado em smoke direto do provider:** `allintitle:marketing digital`, Brasil/português/desktop, retornou `se_results_count = 134` com task `20000` e autenticação válida. Essa confirmação não prova ainda a persistência autenticada pela interface.
- **Política de localidade:** o primeiro MVP aceita Brasil (`2076`) e português; UFs Google Ads não são convertidas ou somadas silenciosamente como localidades DataForSEO. A resolução de estados permanece pendente de catálogo DataForSEO validado.
- **Ainda não verificado:** persistência remota da migration 0013 e validação visual autenticada nas quatro larguras, incluindo remedição de resultado já existente.

As seções anteriores permanecem como histórico de implementação e homologação; não representam consumidores atuais da aplicação.

## Fase 7 — fechamento da Descoberta Keywords — 2026-08-04

### Estado final aprovado

**Descobrir Keywords — MVP funcionalmente concluído.**

**Extensão — removida do produto; DataForSEO é o executor server-side de allintitle.**

Validação manual concluída para a rota tenantizada, pesquisa Google Ads nacional, targeting com uma UF, duas UFs e sete UFs, incluindo São Paulo, Minas Gerais e São Paulo + Minas Gerais. Também foram validados filtro de volume, persistência da execução, restauração após reload e preservação da última pesquisa válida quando uma nova pesquisa falha.

Foi validada a importação explícita de uma candidata nova: a keyword foi persistida remotamente, apareceu no Processador, entrou como `bruto` e sem lista automática. O núcleo compartilhado de importação entre Extensão e Descoberta também foi confirmado no fluxo validado.

Essas confirmações substituem os registros históricos de homologação pendente abaixo; eles permanecem somente como histórico do caminho de implementação, não como estado atual.

### Fonte canônica da Descoberta

- Google Ads Keyword Ideas é a fonte canônica da Descoberta.
- Google Ads fornece volume, histórico, CPC e concorrência Ads; concorrência Ads não é KD.
- KGR e allintitle continuam no Processador.
- A extração antiga de sugestões da Extensão é legado e não é fonte concorrente.

### Papel remanescente da Extensão

A Extensão não é mais necessária para descobrir, importar ou medir allintitle. Bridge, background, CAPTCHA, pausa, retomada e notificações Chrome permanecem somente no histórico; não são consumidores produtivos atuais.

### Pendências reais não bloqueantes

Permanecem como regressões manuais: candidata já existente; repetição sem duplicação; retry idempotente; isolamento da importação entre Adalba e Lindisse; e conferência visual completa em dark mode e nos breakpoints. Essas pendências não bloqueiam o encerramento do MVP.

### Legado preservado

Sem remoção nesta tarefa: `public.import_minerador_discovery_candidates` e `minerador_discovery_normalize_keyword`, ambos sem consumidor produtivo; migrations 0011 e 0012 como histórico da RPC antiga; e `executeMining`/`extractSuggestionsLegacy` como candidatos a remoção futura.

## Fase 8 — auditoria interrompeu a implementação estrutural — 2026-08-04

### Lacuna confirmada

A tabela `minerador_discovery_candidates` persiste volume, histórico mensal, CPC, concorrência Ads, targeting, provider/version e `measured_at`, mas não possui allintitle atual, estado da medição, executor, erro sanitizado ou histórico de atualizações. O protocolo produtivo da Extensão também recebe `keywordId` oficial de `keywords_kgr`; uma candidata ainda não importada não possui esse identificador.

Por isso, a Descoberta não pode medir uma candidata não importada sem criar uma persistência paralela ou importar silenciosamente a keyword. Ambas as alternativas contrariariam o contrato da Fase 8. A implementação estrutural foi interrompida antes de alterar rota, bridge, executor ou schema.

### Executor reutilizável

O executor existente permanece identificado e reutilizável: `minerador-extensao/background.js`, `minerador-panel-bridge.js`, `allintitle-google-reader.js`, o protocolo `minerador.allintitle.measure.v2`, a rota `resultados-allintitle` e o tratamento de CAPTCHA, pausa, retomada, cancelamento, timeout e notificações. Não foi criado outro leitor ou parser.

### Regra obrigatória de substituição

Após persistência confirmada, a medição nova substitui o valor operacional atual de allintitle, volume, histórico mensal, CPC, concorrência Ads, targeting, provider, versão e `measured_at`. O KGR é recalculado com os valores atuais. O valor anterior permanece somente em histórico técnico/auditoria.

Em falha, ausência, quota, CAPTCHA ou resposta não confirmada, todos os valores atuais, `measured_at` e KGR permanecem intactos; não há substituição por `null`, zero ou média entre medições.

### SDD mínima pendente

Antes do código, é necessária uma mudança estrutural aprovada para: persistir medições allintitle de candidatas não importadas com histórico e RLS; permitir no protocolo um sujeito `DiscoveryCandidate` sem `keywordId` oficial; transferir a medição para a keyword oficial na importação; e fazer Descoberta e Processador lerem a mesma medição atual quando houver `imported_keyword_id`. Nenhuma migration foi criada ou executada nesta auditoria.

## Descobrir Keywords — targeting geografico corrigido — 2026-08-03

- **Causa confirmada no codigo:** o catalogo local usava IDs antigos/incorretos para as UFs brasileiras. O Brasil nacional continuava usando `geoTargetConstants/2076`, mas estados como SP e MG eram enviados como `2043` e `2024`, rejeitados pela Google Ads.
- **Corrigido localmente:** o catalogo foi atualizado para a lista oficial fixada em 2026-07-16; por exemplo, SP usa `geoTargetConstants/20106` e MG usa `geoTargetConstants/20094`. O navegador continua enviando apenas codigos de UF.
- **Preservado:** Brasil nao e misturado com UFs; o limite permanece em 10; resource names sao resolvidos somente no servidor; falha de nova pesquisa preserva a ultima tabela valida e nao cria importacao.
- **Diagnostico:** erros provider-side preservam request ID, codigo e campo sanitizados, targeting resolvido, quantidade de localidades e customer mascarado. O smoke manual confirmou Brasil, SP, MG, SP+MG e sete UFs.

## Descobrir Keywords — Fase 4 de persistência tenantizada — 2026-08-03

- **Aprovado para implementação local:** `DiscoveryRun` e `DiscoveryCandidate` serão persistidos nas tabelas `minerador_discovery_runs` e `minerador_discovery_candidates`, sempre por `brand_id`, com todas as candidatas normalizadas e motivos de filtro.
- **Implementado localmente nesta fase:** contrato de persistência, idempotência por `brand_id + operation_request_id`, leitura da última execução e restauração após reload, sem envio ao Processador.
- **Migration criada para a fase:** `supabase/migrations/0009_minerador_discovery_persistence.sql`. A execução autenticada, persistência e restauração após reload foram confirmadas manualmente; detalhes de aplicação remota permanecem registrados no histórico operacional.
- **Preservado:** seleção/organização locais, Processador, Extensão, `keywords_kgr`, allintitle, KGR e conteúdo publicado. Nenhuma candidata filtrada entra no Processador automaticamente.

## Descobrir Keywords — prioridade espacial da coluna Keyword — 2026-08-03

- **Verificado no código:** a tabela da Descoberta usa configuração de colunas própria, com seleção fixa, `Keyword` em 380px e auxiliares compactas; a largura mínima total é 1430px e o scroll horizontal permanece restrito ao `KeywordTableShell`.
- **Preservado:** o grid e as larguras do Processador, seleção/pintura, ordenação, hover, altura das linhas, dados, filtros e tooltip `title` da keyword.
- **Pendente manual:** conferir em 768px, 1024px e 1440px, em dark mode, com keywords extensas e valores auxiliares longos.

## MineradorSectionTabs — densidade compartilhada e wrapper sem rolagem vertical — 2026-08-03

- **Verificado no código:** Descobrir e Processar usam o mesmo `MineradorSectionTabs`, com `h-8` no contêiner e `h-7` nos links, ordem fixa e estado ativo derivado da rota.
- **Corrigido localmente:** o wrapper da barra do Processador mantém o scroll horizontal e explicita `overflow-y-hidden`, removendo a scrollbar vertical própria das abas sem afetar tabela, popovers ou rolagens legítimas.
- **Pendente manual:** alternar entre as duas rotas em 360px, 768px, 1024px e 1440px, conferindo posição, altura, foco e ausência de scrollbar ao lado das abas.

## MineradorSectionTabs — densidade compartilhada e wrapper sem rolagem vertical — 2026-08-03

- **Verificado no código:** Descobrir e Processar usam o mesmo `MineradorSectionTabs`, com `h-8` no contêiner e `h-7` nos links, ordem fixa e estado ativo derivado da rota.
- **Corrigido localmente:** o wrapper da barra do Processador mantém somente o scroll horizontal e usa `overflow-y-hidden`, removendo a scrollbar vertical própria das abas sem afetar tabela, popovers ou rolagem legítima.
- **Pendente manual:** alternar entre as duas rotas em 360px, 768px, 1024px e 1440px, conferindo posição, altura, foco e ausência de scrollbar ao lado das abas.

## Descobrir Keywords — incluir adultas na Linha 2 — 2026-08-03

- **Verificado no código:** `includeAdultKeywords` permanece parte do `DiscoverySearchDraft`, mas o checkbox agora aparece somente na Linha 2, depois de Incluir/Excluir e antes de Limpar filtros.
- **Preservado:** Estados/UF encerra a Linha 1; alterar o checkbox não chama Google Ads nem substitui o snapshot executado; Limpar filtros restaura `false` sem limpar tabela, organização ou seleção.

## Descobrir Keywords — execução local com pesquisa real em memória — 2026-08-03

## Descobrir Keywords — separação de pesquisa e targeting — 2026-08-03

- **Verificado no código:** os controles superiores formam um rascunho da próxima pesquisa; a tabela usa somente o snapshot em memória da última execução válida. Mudanças no rascunho mostram `Configuração alterada` e não recalculam a tabela.
- **Verificado no código:** filtros de volume, CPC, relação, inclusão e exclusão são aplicados no ciclo do botão `Descobrir Keywords`; busca, Organizar e ordenação continuam locais sobre as candidatas aprovadas.
- **Verificado no código:** a rota recebe códigos internos de UF, resolve resources canônicos do Brasil server-side e rejeita mais de dez UFs ou códigos fora do catálogo antes da API. Brasil nacional não é combinado com UFs.
- **Verificado no código:** Targeting é apresentado com nomes humanos; várias UFs são exibidas como conjunto agregado e não como métricas individuais. `Histórico` usa `Disponível`, `Parcial` ou `Indisponível`; concorrência Ads é traduzida para Baixa, Média ou Alta.
- **Pendente manual:** pesquisa nacional, uma UF, seis UFs, alteração de rascunho após execução, falha preservando a tabela anterior e diagnóstico visual no Chrome.

- Criada a rota privada `/{brandRef}/minerador/descobrir`, protegida pela mesma resolução canônica de tenant e permissão `minerador` usada pelo Processador.
- Implementadas a navegação interna entre Descobrir e Processar, duas linhas compactas de pesquisa/filtros em memória, estado vazio e cabeçalho estrutural da tabela futura. A primeira concentra semente, modo, intenção, funil, idioma, país e UF; a segunda contém filtros e a ação Descobrir. O Processador permanece na rota canônica `/{brandRef}/minerador`.
- O segmented de modo e a linha separada foram removidos; o modo passou a select imediatamente após a semente, idioma antecede país e o botão Descobrir fecha popover aberto antes de validar a semente. Nenhuma integração ou persistência foi adicionada.
- A navegação interna agora é o componente único `MineradorSectionTabs`: na Descoberta ocupa o slot de ações do `ModuleHeader`; no Processador ocupa o grupo direito da barra operacional. A aba ativa é derivada de `usePathname`, sem estado local.
- Resultados e KD estão explicitamente desabilitados como capacidades futuras de evidência Serper. A descoberta executada chama a rota Google Ads apenas pelo botão `Descobrir Keywords`; os controles superiores editam o rascunho da próxima pesquisa e não alteram a tabela executada até nova execução. Não há persistência, extensão ou importação nesta fase.
- Fase 2 implementada localmente: `KeywordTableShell`, `KeywordTableHeader`, `KeywordSelectionHeader`, `KeywordSelectionCell`, `KeywordTableEmptyState` e `KeywordTableBulkBarShell` passaram a ser usados incrementalmente pelo Processador. Estado, helpers puros de clique/Ctrl-Cmd/Shift/pintura, filtros, ordenação e handlers continuam nos consumidores.
- A Descoberta usa o mesmo shell, cabeçalho e empty state com suas colunas contratuais, ainda sem candidatas, barra de lote, chamada, persistência ou importação. Allintitle, KGR, métricas, qualificação, silos, status, decisão humana, Extensão e Arquiteto seguem exclusivos do Processador.
- Correção responsiva local: o conteúdo e o cabeçalho agora restringem a largura ao viewport; a Linha 1 só usa a grade de sete colunas quando suas larguras mínimas cabem, e Estados/UF usa `AnchoredPopover` compartilhado, com fechamento externo/Escape e altura limitada à viewport. A tabela é a única área que recebe scroll horizontal.
- Pendente: validação manual autenticada em 360px, 768px, 1024px e 1440px.

## Exclusão de keywords não publicadas com histórico Google Ads — correção local — 2026-08-03

- Causa confirmada no código: a FK de medições Google Ads usava `ON DELETE RESTRICT`; por isso uma keyword medida não podia ser excluída pela ação permanente já autorizada na interface.
- Corrigido localmente: o diálogo encerra em sucesso ou falha e apresenta motivo sanitizado para dependência de histórico (`23503`) ou permissão (`42501`), sem o erro opaco `{}`.
- Migration manual pendente: `0008_minerador_keyword_measurement_delete_cascade.sql` substitui exclusivamente essa FK por `ON DELETE CASCADE`, permitindo que a exclusão permanente de uma keyword não publicada remova atomicamente apenas suas medições vinculadas.
- Preservado: keywords publicadas, listas, tenantização, conexão Google Ads e histórico de keywords que não forem excluídas.

## Migração local de Volume para Google Ads — 2026-08-03

- **Verificado no código:** a página envia IDs à rota Google Ads tenantizada; o servidor resolve conexão por `brandId`, persiste uma medição versionada e só então atualiza a projeção de volume. RapidAPI não é chamado pelos endpoints de volume ativos; os endpoints antigos respondem explicitamente que o fluxo mudou.
- **Confirmado por teste:** normalização Google Ads, lote interno de até 10.000, correspondência somente de keywords retornadas, preservação de itens sem retorno e projeção com proveniência.
- **Ainda não verificado manualmente:** migration 0007 aplicada, conexão Ads cadastrada, persistência real após recarga, paridade Adalba/Lindisse e lote real particionado. Nenhuma chamada Ads real foi feita nesta implementação.

## Configuração tenantizada da conexão Google Ads — 2026-08-03

- **Verificado no código:** `minerador_google_ads_connections` possui rota exclusiva de leitura/cadastro para owner/admin. O cadastro valida `Customer` server-side antes de gravar status `validated`, moeda e timezone; a rota de métricas continua sem aceitar customerId.
- **Pendente manual:** cadastrar a conta real exclusivamente para a Adalba e confirmar que a rota passa de `account_resolution` para a consulta de métricas. Nenhuma chamada real foi executada nesta implementação.

## Correção de resposta vazia de métricas Google Ads — 2026-08-03

- **Relatado pelo usuário:** a conexão da marca foi validada e uma consulta real chegou ao Google Ads, mas uma resposta HTTP bem-sucedida sem a propriedade `results` era classificada incorretamente como incompatível.
- **Corrigido no código:** `GenerateKeywordHistoricalMetrics` agora aceita `results` ausente como lista vazia; somente `results` presente com formato não-array continua sendo resposta inválida. A operação retorna ausência/resultado parcial sem alterar métricas anteriores.
- **Correção complementar:** resultado com `text` mas sem `keywordMetrics` também representa métrica ausente. Seus campos normalizados permanecem `null` e não produzem volume artificial, preservando o `requestId` quando a API o envia.
- **Confirmado por teste local:** fixture de resposta vazia, fundação Google Ads, TypeScript, lint direcionado, build e `git diff --check` passaram com fetches simulados.
- **Pendente manual:** repetir uma medição real de uma keyword para confirmar o resultado devolvido pelo Google; nenhuma nova chamada Google Ads foi feita pelo agente.

> **Estado documental vigente — 2026-07-27:** os blocos que descrevem 0005/0006 como “não aplicadas” são registros pré-aplicação. O resultado remoto posterior informa 0006 aplicada e `READY`; não reexecutar nem reverter 0005/0006. Persistem como pendências somente validação manual autenticada, RLS real e demais verificações explicitamente indicadas.

## Fotografia operacional datada — 2026-07-27

O relatório local da janela de tenantização registra 147 keywords, sendo 126 sem lista e 21 com lista, e 0 sem `brand_id`. Esta é uma fotografia operacional datada, não um invariante nem uma consulta remota executada nesta passada; divergência futura deve ser registrada antes de qualquer reconciliação.

## Implementação Site/Sitemap — 2026-07-21

- **Implementado localmente:** a ação explícita `Conferir com o site` carrega o workspace Site/Sitemap da marca ativa, monta prévia somente leitura e exige confirmação antes da importação.
- **Proveniência:** novas keywords recebem ID real, lista de destino, status `bruto`, métricas/intenção nulas e evidência versionada em `analise_semantica.site_origin`/`site_origins`.
- **Existentes:** preservam ID, status, métricas, intenção e DNA; a evidência é atualizada de modo aditivo e retorna `evidence_updated` ou `no_change`.
- **Dimensões separadas:** o Minerador exibe situação técnica da URL, publicação observada, relação keyword↔URL e situação arquitetural. Não forma artigo nem altera Arquiteto.
- **Proteções:** workspace inválido gera erro explícito; candidatos de outra marca, ignorados ou sem catálogo válido não entram na prévia; não há sincronização durante hidratação.
- **Testes locais:** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/marca-site.test.mts` passou 14/14. Não foram feitos `npm test`, escrita remota, migration, chamada de IA/SERP ou limpeza de armazenamento.
- **Limitações:** Supabase/RLS, browser autenticado, reload remoto e correções estruturais M-01–M-05 permanecem não verificados; a hidratação existente não foi reconstruída nesta integração.

## Regra compartilhada — 2026-07-21

A importação Site → `keywords_kgr` continua seletiva e idempotente, com IDs reais, status `bruto` e `analise_semantica.site_origin` contendo URL, catálogo, campos observados e coerência de slug. A qualificação real de KGR/volume/intenção e a validação de schema remoto continuam não verificadas nesta etapa.
- **Última auditoria:** 2026-07-20, leitura de código, testes locais e build; relatório em `docs/03-minerador/propostas/auditoria-de-saude-do-minerador.md`.
- **Funcionando no código:** importação CSV/manual, planilha, filtros, KGR, status, seleção, exportação, histórico, visões, extensão e KeywordDNA lógico.
- **Confirmado por teste:** `test:arquiteto` 48/48, `test:operational` 49/49, `test:editorial` 20/20, `test:authz` 4/4, sintaxe da extensão, `git diff --check` e `npm run build`.
- **Parcial:** integração KeywordDNA → Arquiteto; a leitura é remota/legada, mas a decisão de importação é mantida em índice local por marca.
- **Risco confirmado no código:** keywords sem lista podem entrar em qualquer marca; o carregamento executa deduplicação, atualização de nicho e persistência de DNA; alguns lotes não confirmam erro por item.
- **Risco de workflow:** importação manual aceita `publicado` diretamente e a ação em massa não exige silo/aprovação anterior.
- **Local:** seleção, histórico em memória, visões em `localStorage`, índice `architectImportedKeywordIds` e recovery do pipeline por marca.
- **Persistido no código:** `listas_kgr`, `keywords_kgr`, `briefings_artigos` e marcas são acessados; schema remoto, RLS e triggers instalados ainda não foram verificados.
- **Externo/simulado:** volume, análise semântica, nicho/intenção, briefing, Google Autocomplete e Google Sheets dependem de APIs externas; não foram chamados nesta auditoria.
- **Última validação manual:** ainda não verificada.
- **Bloqueado:** snapshot/SQL remoto, browser autenticado, extensão carregada e correções estruturais aguardam execução/autorização do usuário.
- **Arquivos centrais:** `app/(brand)/[brandRef]/minerador/page.tsx`, `minerador-extensao/background.js`, `minerador-extensao/popup.js`.
- **Diferença spec/implementação:** módulo funcional e monolítico como aprovado, mas com divergências de escopo por marca, mutações no carregamento e transferência não persistida; não reconstruir nesta fase.
## Correcao do gesto de selecao e da previa allintitle - implementacao local - 2026-07-29

- Correcao complementar: o background agora envia cada evento allintitle tambem no envelope `allintitle_relay_event` aceito pelo relay da pagina; resultados deixam de depender somente do envio direto por aba.
- Removido visualmente do popup o par redundante de acoes Selecionar visiveis/Limpar visiveis; a selecao continua diretamente nas candidates.
- Causa confirmada no codigo: a pintura da tabela fazia uma atualizacao React por movimento do ponteiro; a pintura do popup alterava as candidates em memoria, mas nao persistia nem redesenhava ao termino.
- Implementado localmente: a tabela acumula linhas visitadas e atualiza uma unica vez ao soltar/cancelar; o popup preserva o clique nativo de checkbox e persiste/redesenha ao finalizar pintura. Clique, Ctrl/Cmd, Shift, teclado, filtros e acoes em lote permanecem separados.
- Implementado localmente: resultados allintitle aceitam `operationRequestId` e `operationBatchId` raiz, mas continuam validados pela marca e pelas keywords da operacao ativa.
- Confirmado por teste local: 48 testes direcionados e sintaxe dos scripts da extensao passaram. Pendente manual: gesto real e retorno 323 na previa/tabela no Chrome apos reload da extensao. Nenhuma operacao remota foi executada.

## Fase B - aplicabilidade KGR e consolidacao Site/Sitemap - 2026-07-22

- Implementado localmente: decisao humana `applicable`/`not_applicable`/`pending`, rotulo `SIM`/`NAO`/`PENDENTE`, origem, ator, data, versao, justificativa e historico em `analise_semantica`.
- Implementado localmente: medicao separada (`with_score`, `without_data`, `invalid`), filtros, ordenacao previsivel e exportacao com aplicabilidade separada da pontuacao numerica.
- Implementado localmente: `NÃO` nao e usado como score e volume/resultados/score nao sao apagados por uma decisao de inaplicabilidade.
- Removido do Minerador: botao, modal e handlers exclusivos de `Gerar Briefing (Silo)`; endpoint e consumidores proprietarios existentes foram preservados.
- Implementado localmente: conferencia Site/Sitemap no rodape operacional e consolidacao aditiva de URL, resolved URL, canonical, publicacao e silo existente escolhido (`siloId`/`siloName`). Nenhum silo novo, slug ou identidade publicada e inferido.
- Testes locais: fixtures KGR, Marca/Site e contrato Site/KGR passaram; `npx tsc --noEmit` passou. Browser autenticado, Supabase/RLS e persistencia remota permanecem nao verificados.
- Nao executados: migration, escrita remota, chamadas de IA/SERP/API paga, limpeza de storage, commit, push ou deploy.
## Fase B.1 - correcoes de fluxo e interface - 2026-07-22

- Causa confirmada da perda de contexto: `fetchData()` era chamado apos a qualificacao, reativava loading, substituia a colecao, redefinia `targetListId`, limpava `selectedIds` e ocultava a posicao de trabalho. A hidratacao inicial tambem nao tinha deduplicacao de requests em voo.
- Corrigido localmente: qualificacao, importacoes e mutations atualizam somente linhas afetadas; selecao, busca, filtros, ordenacao e linha expandida sao preservados quando aplicavel. O carregamento inicial e deduplicado por marca/sessao/token.
- Corrigido localmente: `Conferir com o site` foi colocado na barra inferior e filtra candidatas pelo conjunto selecionado; a previa e confirmacao permanecem explicitas.
- Corrigido localmente: KGR e Intencao sao somente informativos na tabela. Decisoes KGR sao em massa e a aprovacao bloqueia itens sem medicao valida.
- Implementado localmente: painel recolhivel `Organizar`, contador, limpeza de filtros e taxonomia de intencao retrocompativel.
 - Limitacao: mutacoes de hidratacao historicas (deduplicacao, nicho e DNA logico) permanecem existentes e nao foram reconstruidas nesta correcao pontual; nao houve browser autenticado ou escrita remota.

## Fase B.2 - qualificacao de volume e preservacao de metadados - 2026-07-22
- Causa confirmada: `handleBatchQualify` tratava erro ou ausencia de item na resposta como `volume = null` e persistia `volume_search`, `kgr_score` e `volume_source`, permitindo apagar metricas validas.
- Corrigido localmente: falha HTTP, resposta invalida ou ausencia de medicao interrompe a qualificacao antes de qualquer update destrutivo; medicao valida altera somente volume, fonte real e KGR quando recalculavel.
- Corrigido localmente: `/api/volume` normaliza respostas, retorna somente mediacoes vinculadas e bloqueia explicitamente o endpoint `website-analyze-and-seo-audit-pro`/`aiseo.php`, que nao possui contrato de volume.
- Nao executado: chamada externa RapidAPI/Keywords Everywhere, browser autenticado, escrita remota fora do fluxo da aplicacao, migration, commit, push ou deploy.

## Fase B.3 - Google Keyword Insight - 2026-07-22
- Configurado localmente: `RAPIDAPI_HOST=google-keyword-insight1.p.rapidapi.com` e `RAPIDAPI_URL=https://google-keyword-insight1.p.rapidapi.com/keysuggest`.
- Chamada manual unica: `GET /keysuggest?keyword=seo%20para%20clinicas&location=BR&lang=pt`, URL registrada sem chave, HTTP `200 OK`.
- Resposta observada: array com objetos; keyword exata em `text`, volume em `volume`, e campos adicionais `competition_level`, `competition_index`, `low_bid`, `high_bid` e `trend`.
- Headers observados: `x-ratelimit-requests-limit=20` e `x-ratelimit-requests-remaining=18`; nenhum custo monetario foi informado pela resposta.
- Fixture anonimizada: `tests/google-keyword-insight-response.fixture.ts`. O payload nao informa campo de localizacao; portanto o resultado e tratado como volume solicitado para BR, sem afirmar comprovacao adicional no corpo.
- Nao executado: lote de producao, escrita remota, migration, commit, push ou deploy.

## Fase B.4 - Trending Insight sem volume - 2026-07-22
- Fixture literal recebido: array com `success`, `meta.keyword`, `meta.country`, `generatedAt`, `data.top` e `data.rising`; cada item possui `query` e `value`.
- Decisao implementada apenas no normalizador: `value` e tratado como indice de tendencia, nao como volume. A keyword solicitada sem campo de volume retorna erro estruturado e preserva todas as metricas existentes.
- `not_found` ocorre quando `meta.keyword` diverge da keyword solicitada; schema parcial ou invalido retorna erro. Nenhuma chamada externa, rota, front-end ou persistencia foi alterada nesta fase.

## Fase B.5 - Keyword Magic Tool - 2026-07-22
- Fixture representativa derivada da resposta 200 recebida: objeto `keyword_ideas[]`, keyword em `keyword` e volume em `search volume`.
- Implementado localmente somente no normalizador: correspondencia exata retorna volume; keyword ausente retorna `not_found`; volume invalido retorna `error`, sem gerar patch destrutivo.
- Metadados observados (`Keyword Difficulty %`, label, CPC e `Trend`) permanecem fora da persistencia atual e nao alteram `results_allintitle`.
- Limitacao: o payload nao informou metodo, query string nem corpo exigidos por `/searchby-country-url`; nenhuma chamada externa nem alteracao da rota foi realizada.

## Fase B.6 - SEO Keyword Research - 2026-07-22
- Configurado localmente: host `seo-keyword-research8.p.rapidapi.com`, endpoint `GET /keyword-research`, com `keyword` e `country=br`.
- Chamada manual unica: `GET /keyword-research?keyword=seo%20para%20clinicas&country=br`, HTTP `200 OK`; `result[0].keyword` correspondeu exatamente e `avg_monthly_searches` foi `10`.
- Headers observados: `x-ratelimit-requests-limit=25` e `x-ratelimit-requests-remaining=23`. Nenhum custo monetario foi informado pela resposta.
- Implementado localmente: normalizador fixture-based por correspondencia exata em `result[].keyword`/`avg_monthly_searches`; rota devolve `success`, `not_found` ou `error` por keyword e preserva resultados/KGR em falha.
- Nao executado: lote de producao, browser autenticado, escrita remota, migration, commit, push ou deploy.

## Fase B.3 complementar - hidratação, resultados existentes e barra - 2026-07-22
- Corrigido localmente: a tabela nao mantem mais copia derivada em estado; a visao e calculada por `useMemo` diretamente de `keywords`, filtros, listas e ordenacao. O filtro inicial de status e `Todos`.
- Corrigido localmente: abrir/fechar `Organizar` nao altera a colecao exibida, nem completa metadados ou dispara chamada remota.
- Mantido: `results_allintitle` ja persistido e preservado; volume valido recalcula KGR somente quando o resultado existe. Nenhuma rota/provedor de resultados foi criado.
- Corrigido localmente: uma unica barra inferior integra contador, mover para silo, conferencia Site/Sitemap, qualificacao, decisao KGR, publicacao, processamento e exclusao.

## Fase B.4 — restauração da última organização - 2026-07-22

- Implementado localmente: a preferência `minerador-pro:last-view:<usuário>:<marca>:minerador` é lida fora do painel `Organizar`, apenas após usuário, marca e coleção local estarem resolvidos.
- Compatibilidade: o leitor é proprietário do Minerador, reutiliza a chave e os valores existentes, adapta status legados e rejeita valores inválidos sem remover itens de `localStorage`.
- Interface: o botão exibe os critérios ativos pelo nome, como `Publicados`; abrir ou fechar o painel não aplica nem recalcula a organização.
- Não alterado: volume, `results_allintitle`, cálculo KGR, persistência do domínio, Supabase, migrations e componentes compartilhados.
- Complemento: a restauração usa chave hidratada explícita, ocorre uma vez por identidade e apresenta estado breve antes da pintura; a persistência compara o conteúdo antes de gravar. O resumo mostra até três filtros em ordem estável e expõe todos no tooltip quando truncado.

## Métricas independentes da aplicabilidade KGR - 2026-07-22

- Corrigido localmente: medição não depende mais de `kgr_score` ou da aplicabilidade. Estados: Sem medição, Parcial, Completa e Inválida.
- Interface: detalhe separado em Métricas, Estratégia KGR e Decisão humana; `Não aplicável` não oculta volume/resultados e mostra pontuação não utilizada.
- Mantido: decisão humana não altera `volume_search`, `results_allintitle` ou `kgr_score`; Arquiteto não foi alterado.

## Política da keyword principal publicada - 2026-07-22

- Implementado localmente: `locked`, `reviewable` e `free` em metadado aditivo; publicado legado é travado por padrão.
- Interface: badge de política e bloco Identidade publicada, com ação humana confirmada para alternar travada/revisável sem tocar URL, slug, canonical ou keyword.
- Contrato: o normalizador aditivo do Arquiteto recebe política e contexto, mas não foi alterada a formação de artigos nem há substituição automática.

## Coleta `allintitle` pela extensão — 2026-07-22

- Implementado localmente: ponte conectada explicitamente pelo popup na aba do Minerador, disponibilidade detectável, lote limitado (padrão 5, máximo 10), uma aba Google reutilizável e uma consulta por vez.
- Implementado localmente: parser fixture-based para contagem internacional/portuguesa, zero explícito, ausência, CAPTCHA, consentimento e bloqueio; CAPTCHA/bloqueio pausa o lote e oferece retomar ou cancelar.
- Implementado localmente: prévia antes de persistir, exclusão individual de resultados, patch localizado de `results_allintitle` com proveniência em `analise_semantica` e recálculo de KGR somente quando permitido.
- Permissões novas: `scripting`, `https://www.google.com/*` e `https://www.google.com.br/*`, justificadas somente para injetar o leitor na aba de medição. Não há permissão global para o painel.
- Pendente: usuário recarregar a extensão e executar o roteiro manual autenticado; não foram feitas buscas reais ao Google, escrita remota, migration, limpeza de storage, commit, push ou deploy.

### Correção do fluxo individual — 2026-07-23

- Implementado localmente: uma keyword não monta a prévia de lote. A extensão precisa estar disponível antes da solicitação; ausência mostra instrução compacta e não abre Google nem altera métricas.
- Implementado localmente: `success` e `zero_results` de uma keyword validam marca, ID, texto e seleção antes de atualizar somente a linha confirmada. CAPTCHA mantém controles compactos de retomar/cancelar; bloqueio, ausência e erro preservam dados.
- Mantido: duas ou mais keywords usam a prévia com confirmação humana, sem reload, sem `fetchData()` e sem alteração do provedor de volume.

### Correção localizada — handshake da extensão com a aba do Minerador — 2026-07-23

- Implementado localmente: o popup, service worker, bridge e `/minerador` agora concluem conexão somente após `ping` e ACK da página com `requestId`, origem, módulo e versão do protocolo conferidos.
- Sessão: a confirmação é registrada apenas em `chrome.storage.session`, vinculada a `tabId`, origem, `minerador`, versão `1` e data; sessão antiga não é aceita sem novo ping e o fechamento da aba remove o registro.
- Segurança: somente `http://localhost:3000/minerador`, `http://127.0.0.1:3000/minerador` e origem de produção configurada explicitamente podem conectar. Falha de ping/ACK bloqueia a abertura do lote e qualquer navegação ao Google.
- Interface: popup informa desconectado, verificando, conectado, incompatível ou conexão perdida sem falso sucesso. A página permanece sem barra fixa adicional.
- Não validado nesta execução: extensão carregada no Chrome e handshake manual autenticado; não houve consulta Google, escrita remota, migration, limpeza de storage, commit, push ou deploy.

### Correção diagnóstica — allintitle e volume zero — 2026-07-23

- Causa localizada no código: após o handshake, o controlador reduzia falhas de navegação, injeção e reader a `measurement_error`; a espera de navegação não comprovava que o `complete` pertencia à consulta solicitada.
- Corrigido localmente: etapas diagnósticas versionadas, URL de busca confirmada, timeout explícito, reader no frame principal e falhas específicas como `unexpected_navigation`, `reader_injection_failed` e `reader_no_response`.
- Interface: falhas de allintitle/extensão/volume permanecem até fechamento ou nova ação, mostram etapa/código e permitem copiar o diagnóstico ou repetir a seleção, sem stack trace.
- Volume: `0` só é aceito quando `result[].keyword` corresponde exatamente e `avg_monthly_searches` é um número JSON explícito igual a zero. Campo ausente, nulo, texto ou sugestão não cria patch.
- Limitação: a coleta real no Google continua pendente de validação manual; nenhuma consulta externa foi executada.

### Correção localizada — destino do popup da extensão — 2026-07-23

- Causa confirmada: o botão do popup usava `PANEL_URL` literalmente. Uma configuração legada com `/admin/marcas` abria a rota incompatível antes da tentativa de conexão; o login da extensão não cria nem redireciona abas.
- Corrigido localmente: `PANEL_URL` é usado somente como origem e o botão **Abrir Minerador** sempre deriva `/minerador`. A conexão continua sem abrir, navegar ou alterar a aba ativa.
- Validação: `/minerador`, `/minerador/`, query e hash locais são aceitos; `/admin/marcas`, `/marca` e origens externas permanecem rejeitados. A mensagem informa a rota incompatível e orienta abrir o Minerador.
# Roteamento tenant — 2026-07-23

### Compatibilização com `keywords_kgr.brand_id` obrigatório — 2026-07-24

- Implementado localmente: o workspace do Minerador carrega listas por `marca_id` e keywords por `brand_id`, sem fallback para carregar todos os tenants quando não há marca ativa.
- Implementado localmente: imports CSV/manual, import Site/Sitemap e criação de lista enviam o tenant explícito; atualizações e exclusões restringem `brand_id`; movimentação valida a lista de destino.
- Implementado localmente: `/api/analyze` e `/api/process-intent-niche` recebem a marca ativa, autorizam o tenant e atualizam a keyword com filtro de `brand_id`; `assertKeywordBelongsToMarca` usa `brand_id` também para keywords sem lista.
- Implementado localmente: preview e persistência Site/Sitemap filtram lista e keyword pelo tenant autorizado.
- Rollout: o código assume schema pós-0005 e não deve ser executado antes da migration. A ordem obrigatória é maintenance/read-only, snapshot/dry-run, migration, smoke test autenticado, deploy dos consumidores e desbloqueio.
- Fora do escopo: Arquiteto, Radar, Planejador e `app/api/inteligencia`/`app/api/editorial/serp` foram auditados e permanecem para rodada proprietária separada.
- Não validado: migration remota, RLS remoto, browser autenticado, smoke test remoto, commit, push, deploy e chamadas pagas de IA.
# Consolidacao fisica dos modulos - 2026-07-23
- Tenantizacao 0005 - endurecimento final local - 2026-07-24: `CAUSA NAO COMPROVADA`; o escritor legado sem filtro de tenant e compativel com o incidente, mas nao existe prova local de clique ou de execucao.
- Implementado localmente na infraestrutura compartilhada: lock com timeout de 10 segundos antes de qualquer snapshot ou escrita, sem desabilitar triggers.
- Implementado localmente: guard transacional somente com `keywords_kgr.id` e `lista_id`, seguido de comparacao exata por `FULL JOIN`/`IS DISTINCT FROM` antes do `COMMIT`.
- Garantia: o backfill altera apenas `brand_id`; `lista_id` permanece nullable e os totais atuais esperados sao 147 keywords, 126 sem lista e 21 com lista.
- Dry-run e snapshot manual continuam somente leitura; backups preservados sao reportados sem restauracao.
- Rollback continua assistido e nao altera `lista_id` nem restaura linhas completas de keywords.
- Migration nao aplicada, SQL remoto nao executado, browser autenticado nao validado e aplicativo deve permanecer encerrado durante a janela controlada.

## Reconciliacao tenant 0006 - 2026-07-24

- Preparada localmente a migration `0006_reconcile_tenant_security.sql` para corrigir apenas seguranca pos-0005.
- Nenhum backfill sera repetido; keywords, `lista_id`, `brand_id`, owner, listas e memberships permanecem protegidos.
- O Minerador depende do schema pos-0005 e deve permanecer encerrado durante a janela de 0006.
- Validacao remota das funcoes, grants, policies e constraints ainda pendente; 0006 nao aplicada.

## FK canônica de lista — 2026-07-24

- Autorizada a consolidação de `fk_keywords_kgr_lista_0005` com `ON DELETE RESTRICT`.
- `keywords_kgr_lista_id_fkey` é tratada como legado `ON DELETE CASCADE`; a 0006 valida os atributos semânticos do catálogo antes de removê-la e exibe as definições textuais somente para diagnóstico.
- A precondição da 0006 aceita `search_path` normalizado como `public,pg_temp` ou `pg_catalog,public,pg_temp`; somente a pós-condição exige `pg_catalog,public,pg_temp`. O dry-run sinaliza reconciliação sem bloquear, enquanto a validation permanece bloqueada até a aplicação.
- `lista_id` permanece nullable e nenhuma keyword, lista, `brand_id`, owner ou membership é alterada.
- Auditoria local não encontrou exclusão direta de `listas_kgr` no Minerador ou no Arquiteto; o Arquiteto apenas desagrupa o silo na organização local.
- Migration, rollback e validação remotos continuam pendentes; aplicação exige revisão humana do dry-run.
- Implementacao proprietaria consolidada em modules/minerador; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

## Resultado remoto da migration 0006 — 2026-07-24

- A 0006 foi aplicada remotamente; a transação principal foi consolidada e a validation pós-migration retornou `READY`.
- O erro `42P01` ocorreu somente no diagnóstico pós-`COMMIT`, porque `pg_temp.tenant_0006_snapshot` já havia sido removido por `ON COMMIT DROP`.
- Não há perda de dados reportada. Não reexecutar a migration e não executar rollback.
- O epílogo local foi corrigido para terminar imediatamente em `COMMIT;`, preservando as validações críticas antes do commit.

## Diagnóstico de acesso autenticado às listas — 2026-07-24

- Causa comprovada: o cliente browser do Minerador era criado apenas com a URL e a anon key; o `session.accessToken` do NextAuth não era enviado ao PostgREST.
- Correção: o Minerador passou a usar `lib/supabase/browser-authenticated-client.ts`, que envia o bearer da sessão sem service role; consultas continuam protegidas por sessão e `brand_id`.
- Nenhuma regra de RLS, grant, migration, keyword, `lista_id`, `brand_id`, owner ou membership foi alterada. A validação manual autenticada do Minerador ainda está pendente.
- Verificação local: 95 testes focados, TypeScript, build e `git diff --check` passaram; ESLint do factory/teste passou. O lint integral do workspace mantém erros legados de `any`/hooks, fora desta correção.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

- Causa adicional corrigida: o bearer fixo expirava porque o callback JWT não guardava/renovava o `refresh_token` do Supabase; `session.accessToken` também podia carregar indevidamente um token Google.
- `session.accessToken` agora representa somente JWT Supabase. O token Google fica separado e é usado apenas no endpoint server-side de Google Sheets.
- O cliente browser consulta `getSession()` no momento da requisição, valida `sub`, `aud`, `role` e `exp`, aplica margem de 60 segundos e não devolve token vencido.
- Refresh Supabase ocorre no callback JWT server-side, com compartilhamento de uma única promessa por refresh token; falha gera `SUPABASE_TOKEN_REFRESH_FAILED`, sem fallback anon.
- SELECT tenantizado pode repetir uma vez após erro JWT expirado; escritas não são repetidas automaticamente. Smoke test autenticado ainda está pendente.

### Diagnóstico final da sessão NextAuth → Supabase — 2026-07-24

- Corrigida a classificação que mostrava “sessão expirou” para qualquer erro de autenticação. O Minerador agora diferencia `NEXTAUTH_SESSION_MISSING`, `GOOGLE_ID_TOKEN_MISSING`, `SUPABASE_GOOGLE_EXCHANGE_FAILED`, `SUPABASE_ACCESS_TOKEN_MISSING`, `SUPABASE_REFRESH_TOKEN_MISSING`, `SUPABASE_TOKEN_INVALID_CLAIMS`, `SUPABASE_TOKEN_EXPIRED` e `SUPABASE_TOKEN_REFRESH_FAILED`.
- O resultado do token é estruturado (`ok`, `token`, `reason`, `expiresAt`) e o log contém apenas diagnóstico seguro; nenhum JWT, cookie, refresh token, Authorization ou segredo é registrado.
- `SUPABASE_SESSION_READY` limpa erros antigos. A configuração remota do provider Google permanece requisito externo, não alterado nem testado por login real.
- O fluxo de login não redireciona ao Minerador quando `session.supabaseAuth.status` não é `ready`; falhas Google/Supabase interrompem o callback e exigem novo login.

- Adicionado wrapper canônico `/{brandRef}/minerador`; a implementação funcional permanece em `modules/minerador` e o contrato de cache por marca foi preservado.

## Marcas autenticadas e handshake v2 da extensão — 2026-07-24

- Implementado localmente: `/api/extensao/marcas` valida Bearer Supabase server-side, resolve a identidade pelo `sub` validado e retorna somente marcas com acesso ao Minerador.
- Implementado localmente: `/api/extensao/marcas/{brandId}/listas` revalida o token, a capacidade e o tenant, retornando apenas `listas_kgr` da marca autorizada.
- Implementado localmente: popup com Marca sempre visível, seleção automática para uma marca, dropdown para várias, estados persistentes de erro/zero marcas/retry e lista dependente da marca.
- Implementado localmente: rota contextual `/{brandRef}/minerador`; o popup trata `brandRef` como referência opaca e não o converte em `brandId`.
- Implementado localmente: handshake v2 com `actorUserId`, `activeBrandId`, `activeBrandRef`, acesso confirmado e sessão transitória por aba/marca. Divergência bloqueia mineração e allintitle.
- Implementado localmente: rate limit em memória de 60 requisições por usuário/minuto e logs estruturados sem tokens; proteção distribuída permanece pendente.
- Testes locais: TypeScript, sintaxe dos scripts da extensão, handshake/rota/contrato e tenant-routing. Login real, Chrome manual, Supabase autenticado, RLS, consulta Google, escrita remota e deploy permanecem não verificados.
## Diagnóstico do endpoint de marcas da extensão — 2026-07-24

- Correção local: o popup agora constrói a URL da API exclusivamente a partir da origem configurada em `PANEL_URL` e exige o prefixo `/api/extensao/`; não usa origem relativa da extensão, aba ativa ou rota legada.
- Correção local: respostas não-OK são lidas antes do erro e preservam `status`, `code`, `message` e `requestId`; a resposta server-side mantém `ok`, `code`, `message`, `error` e `requestId` sem expor token.
- Correção local: o popup mostra estados distintos para rede, token ausente/inválido, token expirado, identidade sem vínculo, acesso negado e falha interna, com retry e diagnóstico copiável sem JWT.
- Correção local: login da extensão conserva `access_token`, `refresh_token`, `expires_at` e `user_id`; token expirado tenta refresh Supabase uma única vez e, se falhar, exige novo login.
- Causa do teste manual ainda não comprovada: não houve Chrome autenticado disponível nesta execução; o popup anterior escondia a primeira resposta HTTP e o código retornado, impedindo distinguir rede, token e autorização.
- Pendente: executar o roteiro manual autenticado e registrar status HTTP, código, requestId e marca retornada; não declarar a lista real homologada antes dessa evidência.

## Preflight operacional da extensão — 2026-07-25

- Corrigida a divergência entre popup, `chrome.storage.session`, bridge e workspace: a sessão continua indexada por `tabId` e agora é comparada com ator, `brandId`, `brandRef`, origem, pathname canônico, módulo e protocolo antes do allintitle.
- O ACK v2 da rota contextual exige `requestId`, `actorUserId`, marca autorizada, `pathname` sem query/hash e `timestamp`; ACK incompleto ou divergente não grava sessão.
- O preflight retorna `connected`, `code`, `message` e `session`. Códigos preservados: `connected`, `session_missing`, `tab_mismatch`, `brand_mismatch`, `actor_mismatch`, `route_mismatch`, `protocol_mismatch`, `ack_timeout`, `bridge_unavailable` e `access_not_confirmed`.
- A marca carregada no popup não é apresentada como conexão; a conexão só é exibida depois de ACK v2 e a validação operacional da aba atual.
- O Minerador exibe a causa específica e oferece reconexão/tentativa, diagnóstico copiável e fechamento; falha de preflight não abre consulta Google nem altera métricas existentes.
- Validação local: 18 testes focados, sintaxe da extensão e TypeScript passaram. Chrome autenticado, service worker suspenso, múltiplas abas/marcas e consulta Google permanecem pendentes por não haver uma aba local autenticada disponível; nenhuma chamada externa foi executada.

## Correção do retorno terminal do allintitle — 2026-07-26

- Causa localizada no fluxo: `bridge_error` e `batch_completed` apenas alteravam o estado da extensão, mas não encerravam a execução individual; o retorno final também não carregava o mesmo `requestId` até o workspace. Reader sem resposta e callback vazio do bridge podiam deixar a interface sem uma conclusão explícita.
- Corrigido localmente: timeout por item e timeout total, resultado final com `requestId`, `keywordId`, `brandId`, etapa e código, reader com resposta estruturada mesmo em exceção, bridge com erro para callback vazio e encerramento da execução individual em erro, resposta ausente ou divergente.
- Estados terminais tratados: `success`, `zero_results`, `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled`. Falhas preservam volume, resultado anterior e demais metadados; retry usa nova operação somente para a keyword individual.
- Validação local: testes de parser/patch, terminação, bridge/reader, interface e handshake passaram; sintaxe dos scripts passou. Consulta Google real, Chrome autenticado, escrita remota, migration, commit, push e deploy não foram executados.

## Correlacao do retorno individual allintitle — 2026-07-26

- Causa localizada: a bridge espalhava a resposta depois do `requestId` raiz, permitindo que um campo ausente ou divergente sobrescrevesse a correlacao original; o workspace tambem tratava retorno sem ID como `request_mismatch`.
- Corrigido localmente: `requestId` agora e obrigatorio no pedido interno, preservado como campo autoritativo pela bridge/background/reader e carregado em progresso, resultado, pausa, cancelamento, retomada e `batch_completed`. `batchId` continua separado e `keywordId`/`brandId` sao validados individualmente.
- Resposta sem ID recebe `response_missing_request_id`; divergencia recebe `request_mismatch`; resposta de lote anterior e ignorada como `stale_response`, sem persistencia.
- Nenhuma chamada ao Google, escrita remota, migration, limpeza de armazenamento, commit, push ou deploy foi executada. Validacao manual autenticada continua pendente.

## Coerencia de volume zero e KGR — 2026-07-26

- Causa localizada: `buildVolumeMetricPatch` atualizava `volume_search` para zero, mas omitia `kgr_score: null`; o score calculado com volume anterior permanecia visivel.
- Corrigido localmente: zero numerico da keyword exata passa a registrar `volume_measurement.status = zero_confirmed`, fonte/data/match, preserva `results_allintitle` e invalida o KGR atual. O KGR anterior e guardado em `kgr_score_history`.
- Erros, ausencia, `null`, string vazia, schema invalido, keyword divergente e sugestao relacionada continuam sem patch destrutivo.
- Adicionada deteccao somente leitura de inconsistencias volume/KGR e previa diagnostica em desenvolvimento. Nenhuma correcao em massa ou escrita remota foi executada.
## Bridge reinjetável e diagnóstico classificatório — 2026-07-27

- Corrigido localmente: a bridge não usa mais um booleano global que mantinha contexto obsoleto após reload da extensão. Cada instância possui versão, `instanceId` e `dispose`, remove listeners nomeados e pode ser reinjetada sem reload da página.
- Corrigido localmente: o background reinjeta, aguarda `bridge_ready`, valida bridge/protocolo e só então envia o ping v2. Contexto invalidado, `lastError`, bridge ausente e versão incompatível possuem códigos distintos.
- Corrigido localmente: a prévia de volume/KGR separa `measurement_pending`, `zero_unconfirmed`, `not_applicable` e `inconsistent`; somente a última categoria representa incompatibilidade comprovada. A prévia é somente leitura e seus contadores são derivados dos registros atuais.
- Nenhum volume, `results_allintitle`, KGR, histórico ou dado remoto foi alterado; consulta Google, provider, migration, commit, push e deploy não foram executados.
- Validação manual em Chrome após reload da extensão e smoke test autenticado continuam pendentes.
## Qualificação simplificada e ACK da página — 2026-07-27

- Concluído localmente: `Qualificar volume (KGR calculado)` deixou de iniciar silenciosamente o allintitle; a medição allintitle agora é acionada explicitamente pelo botão próprio.
- Concluído localmente: KGR passou a ser nomeado como cálculo técnico/recalculado, separando-o de volume e resultados medidos.
- Concluído localmente: erros do provedor de volume preservam HTTP/mensagem segura quando disponíveis e aparecem na notificação por keyword; falhas não escrevem `null`.
- Concluído localmente: listener de ACK da página foi separado do estado do lote; ACK negativo estruturado evita transformar divergência conhecida em `ack_timeout`; preflight foi ampliado para tolerar o ciclo de reinjeção e despertar do service worker.
- Removida da interface principal a prévia diagnóstica inflada de volume/KGR; a classificação permanece somente em código/testes/documentação.
- Nenhum schema, migration, parser Google, autenticação, Arquiteto ou dado persistido foi alterado; nenhuma chamada externa foi executada.
## Fluxos separados de métrica, decisão e handshake — 2026-07-27

- Volume é medido exclusivamente pela rota do provedor; `results_allintitle` é medido explicitamente pela extensão; a decisão KGR calcula localmente apenas quando aplicável e com volume/resultados válidos.
- O responder de handshake agora vive na rota contextual do Minerador e publica `page_handshake_ready` antes do ACK; o background valida ator, marca, rota e acesso antes do ping e registra o último estágio confirmado no diagnóstico.
- HTTP 429 da RapidAPI encerra o lote sem retry e retorna somente `Não foi possível coletar volume.`. Itens não processados são identificados internamente; nenhum volume, KGR, `results_allintitle` ou metadado anterior é apagado.
- Validação local: 39 testes focados, TypeScript, sintaxe da extensão e `git diff --check` passaram. RapidAPI, Google, Chrome autenticado, Supabase remoto, migration, commit, push e deploy não foram executados.
## Simplificacao da extensao do Minerador Key - implementacao local - 2026-07-27

- Implementado localmente no modulo Minerador: popup sem lista, projeto, categoria, silo ou destino editorial; a marca autorizada continua obrigatoria e o `brandId` canonico e validado no handshake e no servidor.
- Fluxo implementado: sugestoes -> filtros preliminares de intencao/funil -> previa e selecao humana -> allintitle sequencial em lote pequeno -> filtro de resultados -> volume somente das sobreviventes -> filtro de volume -> confirmacao humana -> importacao autenticada.
- Endpoints canonicos implementados: `POST /api/extensao/marcas/{brandId}/volume` (somente medicao, sem persistencia) e `POST /api/extensao/marcas/{brandId}/keywords/import` (persistencia server-side autenticada).
- Payload de importacao: `extractionBatchId` e `items`; cada item carrega keyword, origem `extension`, status `bruto`, hints, evidencias de resultados/volume e localidades. Keyword nova usa `brand_id` real e `lista_id: null`; keyword existente recebe somente evidencia aditiva em `analise_semantica`, preservando decisoes e identidade anteriores.
- O caminho legado `executeMining` permanece isolado para compatibilidade/rollback e nao e chamado pelo popup novo. Nenhum schema, migration, SQL remoto ou limpeza de armazenamento foi executado.
- Validacao local desta implementacao: 18 testes focados, sintaxe dos scripts da extensao, ESLint direcionado, TypeScript, build Next.js 16 e `git diff --check` passaram. Chrome autenticado, Google, RapidAPI e persistencia Supabase remota continuam pendentes.
## Ajuste localizado da interface e preferencias da Extensao - 2026-07-27

- Implementado localmente no popup: ordem visual e-mail -> Marca -> conexao -> palavra-chave -> intencao -> funil -> filtros -> localidades -> extracao. A conexao agora possui painel separado para estado principal, rota, marca selecionada e orientacao.
- Funil substituido por selecao multipla BOFU, MOFU e TOFU, com BOFU como unico padrao inicial. O hint TOFU foi aceito de forma aditiva no contrato puro; nenhuma decisao editorial e promovida automaticamente.
- Local controla a habilitacao dos controles geograficos. Ao desmarcar Local, estados e municipios ficam desabilitados sem perder escolhas salvas; a proxima extracao nao envia localidades como filtro ativo.
- Filtros reorganizados em blocos de resultados allintitle e volume mensal, com barras visuais, campos precisos e estado Sem maximo. Volume continua sendo medido exclusivamente pelo endpoint server-side apos resultados.
- Preferencias nao sensiveis usam `chrome.storage.local` com chave `minerador_extension_preferences:{actorUserId}:{brandId}`. Sessao, token, handshake e keywords nao sao tratados como preferencia; nao houve limpeza de armazenamento.
- Consumidores preservados: popup, service worker, handshake, endpoint de importacao e rota server-side de volume. Nenhum outro modulo, schema, migration, RLS ou persistencia remota foi alterado.
- Validacao local desta etapa: testes focados, sintaxe dos scripts, TypeScript, ESLint direcionado, build Next.js e `git diff --check`; homologacao visual no Chrome, troca de marcas, rota divergente e restauracao real permanecem pendentes.

## Correcao urgente da inicializacao do popup da Extensao - 2026-07-27

- Causa localizada no popup: `setLocalControlsEnabled()` acessava `sectionLabel` antes da declaracao local durante a restauracao das preferencias. A excecao era capturada pelo fluxo amplo de carregamento e aparecia incorretamente como falha ao carregar marcas.
- Corrigido localmente: a etiqueta de localidade e inicializada antes do uso; a consulta server-side de marcas agora e separada da restauracao de preferencias, portanto falha visual/local nao descarta marcas autorizadas.
- Corrigido localmente: o email so aparece depois de a sessao ser aceita pela API de marcas. Token ausente/invalido nao e tratado como perfil autenticado e nao limpa token, refresh token ou armazenamento.
- Corrigido localmente: estado inicial `panel_not_checked` exibe aba ainda nao validada, sem codigo tecnico; `session_missing` fica reservado para sessao ausente ou rejeitada; rota e marca divergentes exibem mensagens especificas e orientacao para abrir a rota correta e reconectar.
- Troca de marca preserva preferencias por `actorUserId + brandId`, salva a marca anterior e invalida somente o handshake da aba; nao faz logout nem reutiliza dados da marca anterior.
- Validacao local: teste de regressao do TDZ/bootstrap, testes focados, sintaxe dos scripts, TypeScript e build permanecem no escopo. Chrome autenticado, troca real de marcas, rota divergente e persistencia real continuam pendentes.

## Correcao localizada Abrir Minerador -> Conectar aba - 2026-07-27

- Causa localizada: `Abrir Minerador` criava a aba diretamente no popup sem registrar seu `tabId`; `Conectar` consultava apenas a aba ativa. O status automatico tambem chamava o caminho de handshake antes do clique explicito, permitindo ping durante carregamento.
- Corrigido localmente: o service worker abre/reutiliza a rota canonica `/{brandRef}/minerador`, ativa a aba, registra o candidato por `brandId` em `chrome.storage.session` e informa `loading`/`ready`.
- Corrigido localmente: `Conectar esta aba` usa o `tabId` registrado, aguarda `status=complete` e somente entao injeta/probeia a bridge e envia o ping. A leitura de status ficou passiva e nao executa handshake automaticamente.
- Corrigido localmente: `tab_not_open`, `tab_loading`, falha de bridge/ping, rota divergente e marca divergente possuem estados separados. Falha de comunicacao nao e convertida em `route_mismatch`; rota divergente so e classificada depois de resposta da bridge.
- Corrigido localmente: ordem visual e-mail -> Marca -> Abrir Minerador -> Conectar -> painel -> palavra-chave; funil visual TOFU -> MOFU -> BOFU, mantendo selecao multipla e BOFU como padrao sem preferencia.
- Preferencias continuam em `minerador_extension_preferences:{actorUserId}:{brandId}`, com debounce e troca de marca sem logout, sem reutilizar o handshake anterior e sem limpar dados.
- Validacao local: testes direcionados da UI, preflight, handshake, bridge e contratos, sintaxe dos scripts. Chrome autenticado, aba real carregando, bridge real, Adalba/Lindisse e rota divergente continuam pendentes.

## Diagnostico tecnico da bridge no Chrome - implementacao local - 2026-07-27

- O transporte canonico confirmado no codigo e: popup -> service worker -> `chrome.scripting.executeScript` com `minerador-panel-bridge.js` no mundo isolado (`ISOLATED`, frame 0) -> `chrome.tabs.sendMessage` -> listener `chrome.runtime.onMessage` da bridge -> probe `minerador_bridge_probe` -> ACK `bridge_ready` -> eventos de handshake da pagina -> `minerador_handshake_ack`.
- O manifest nao declara `content_scripts`; a bridge e um content script programaticamente injetado. O arquivo esta presente na pasta `minerador-extensao`, o service worker e `background.js`, e `scripting`/origens locais estao declarados. A origem publicada continua exigindo permissao explicita no manifest empacotado.
- A falha generica anterior foi localizada no tratamento: rejeicoes de `executeScript` e o erro Chrome `Receiving end does not exist` eram reduzidos a `bridge_unavailable`/`bridge_context_invalidated`, sem indicar a etapa real. O fluxo agora preserva a mensagem original do Chrome e separa permissao, arquivo ausente, excecao, receptor ausente, timeout, ACK invalido e protocolo.
- Cada tentativa produz diagnostico seguro e copiavel no popup com `TAB_FOUND`, `TAB_LOADING` ou `TAB_COMPLETE`, `INJECTION_STARTED`, `INJECTION_OK`, `PROBE_SENT`, `PROBE_ACK` e `HANDSHAKE_OK`; nao inclui token, senha, cookies ou keywords.
- A bridge publica `globalThis.__MINERADOR_EXTENSION_BRIDGE__` somente como marcador de disponibilidade, com versao, instancia e `ready`; isso nao concede acesso nem substitui o handshake autenticado.
- Testes locais cobrem rejeicao da injecao, permissao/origem, arquivo inexistente, excecao, ausencia de receptor, timeout, ACK invalido, mundo isolado, manifest, preservacao de `tabId` e troca de marca. O smoke test autenticado no Chrome ainda e obrigatorio para capturar o codigo efetivo da instalacao carregada.

## Compactacao do estado de conexao - implementacao local - 2026-07-27

- Implementado localmente no popup: o estado conectado agora ocupa uma linha compacta com `Conectado ao Minerador · {nomeDaMarca}` e indicador visual verde sem expor `tabId`, rota, request IDs ou eventos no uso normal.
- O diagnostico tecnico permanece disponivel no proprio painel por `Ver diagnostico`; inicia recolhido e, ao abrir, mostra o JSON atual e `Copiar detalhes tecnicos` usando a rotina de copia existente.
- Estado neutro usa `Conecte esta aba para iniciar.`; estado de validacao usa `Validando conexao...`; erros mostram somente a mensagem principal e `Ver detalhes`, sem textarea permanente.
- O resumo conectado continua sendo renderizado a partir do registro efemero validado pelo background, portanto permanece disponivel apos fechar e reabrir o popup. Bridge, handshake, storage de sessao, importacao, funil, filtros e medicao nao foram alterados nesta etapa.
- A composicao reutiliza os tokens visuais existentes da extensao (`surface`, `border`, `text`, `accent`, `danger`, `success`), preserva foco visivel e nao cria um dialogo ou sistema de cores paralelo. A extensao permanece em tema escuro; o popup tem largura fixa de 340px e a marca longa usa truncamento seguro.
- Validacao local: testes focados da extensao, sintaxe, TypeScript, build, ESLint direcionado e verificacao visual estatica; homologacao visual manual no Chrome em popup aberto/fechado continua pendente.

## Correcao do estado conectado sobrescrito - implementacao local - 2026-07-27

- Causa localizada no popup: a leitura passiva do bootstrap e o listener de aba pronta podiam renderizar `panel_not_checked` depois de uma resposta explicita `HANDSHAKE_OK`; respostas antigas agora sao ignoradas por `connectionOperationId`, geracao, marca, aba e operacao ativa.
- A conexao confirmada continua efemera no `chrome.storage.session`. A leitura passiva valida o registro e a aba atual e retorna `code: HANDSHAKE_OK`, `status: connected`, `state: connected`, `brandId`, `brandRef`, `tabId` e `connectRequestId` quando a conexao permanece valida.
- Ausencia de registro ou rota sem handshake usa `panel_not_checked`, `status: idle`, `state: idle` e mensagem acionavel. `session_missing` permanece reservado para sessao da extensao ausente ou rejeitada.
- O popup exibe `connecting` durante a acao explicita e estado neutro sem borda vermelha para aba ainda nao validada; uma leitura passiva nao sobrescreve `connecting` ou `connected`.
- Invalidacoes reais preservadas: logout, troca de marca, aba fechada, rota/origem/marca/protocolo divergentes e falha de nova validacao explicita. Nenhuma limpeza de `storage.local`, migration, escrita remota, bridge ou manifest foi feita.
- Validacao local: testes focados da extensao, sintaxe dos scripts, TypeScript, build Next.js 16, ESLint direcionado e `git diff --check` devem ser registrados separadamente; o fechamento/reabertura do popup e a persistencia real continuam homologacao manual no Chrome.

## Correcao da transicao PROBE_ACK -> HANDSHAKE - implementacao local - 2026-07-27

- Causa exata localizada: `minerador-panel-bridge.js` recebia `minerador_handshake_ping`, disparava o evento da pagina e retornava sem `sendResponse`. O `tabs.sendMessage` do background interpretava o fechamento da porta sem resposta como falha de comunicacao e devolvia `bridge_unavailable`, apesar de `PROBE_ACK` valido.
- Corrigido localmente: a bridge confirma o transporte com `handshake_sent`; o background registra `handshake_sent`, aguarda o ACK autenticado da pagina e so entao registra `HANDSHAKE_OK`/`connected`.
- A progressao diagnostica agora e `tab_found -> tab_complete -> injection_started -> injection_ok -> probe_sent -> probe_ack -> handshake_sent -> handshake_ok`; falha posterior ao `PROBE_ACK` usa `handshake_error`, nunca `bridge_unavailable`.
- `connectRequestId`, `probeRequestId` e `handshakeRequestId` foram separados e validados com `tabId`, marca selecionada e tentativa ativa. Respostas passivas antigas ou de outra tentativa nao sobrescrevem a conexao explicita.
- O resultado de conexao explicita informa `status: connected` ou `status: error`; `status: null` nao e usado para inferir indisponibilidade da bridge.
- Validacao local: 22 testes de bridge/preflight/handshake/UI, sintaxe e `git diff --check` passaram. Chrome autenticado, `HANDSHAKE_OK` real no popup e repeticao com Adalba/Lindisse continuam como homologacao manual pendente.

## Fluxo pos-extracao, previa e importacao da Extensao - implementacao local - 2026-07-27

- Causa corrigida: o popup bloqueava a extracao ate a resposta final, descartava a previa ao iniciar e exigia volume para importar. O executor agora usa estado temporario em `chrome.storage.session`, vinculado a ator, `brandId`, `tabId` e `runId`, e continua fora do popup.
- Implementado localmente: Local desligado usa um contexto nacional `{countryCode: "BR"}`; Local ligado habilita Brasil/UF/municipios e valida localidade somente nesse modo. Preferencias geograficas continuam preservadas silenciosamente.
- Implementado localmente: semente e previa permanecem durante execucao, pausa, cancelamento e reabertura do popup. `Pausar`, `Continuar`, `Cancelar`, `Descartar resultados` e `Nova pesquisa` sao explicitos; cancelamento preserva resultados parciais e descarte remove somente a previa temporaria da execucao.
- Implementado localmente: previa compacta e rolavel mostra origem/contexto, selecao, allintitle, volume, motivo de filtro, erro e contadores. Duplicatas sao deduplicadas por execucao, preservando evidencias de localidades; filtros nao escondem linhas.
- Implementado localmente: allintitle permanece sequencial e opcional; zero confirmado permanece zero e falha nao vira zero. Volume usa somente o endpoint server-side existente e e opcional para importar.
- Implementado localmente: importacao exige apenas extracao concluida/cancelada, selecao, conexao e marca validas; confirma resumo antes do request, preserva linhas em falha e permite retry das falhas. Novas keywords seguem `bruto`, `brand_id` real e `lista_id` nulo.
- Nao alterado: bridge, handshake, storage de sessao da conexao, manifest, funil, filtros, contrato de medicao e endpoints remotos. Nao houve SQL, migration, escrita remota, limpeza geral de storage, commit, push ou deploy.
- Confirmado localmente: sintaxe dos scripts, testes direcionados da extensao e `git diff --check`. Ainda nao verificado: Chrome autenticado com popup fechado durante extração, provider Google real, endpoint remoto de volume/importacao, persistencia Supabase, dark mode manual e roteiro completo de Adalba/Lindisse.

## Ajuste localizado da tabela - colunas Funil, Principal e Keyword - 2026-07-27

- Implementado localmente: a tabela HTML agora possui colunas próprias para `Funil` e `Principal`; a política da principal não é mais renderizada dentro da célula da keyword.
- Implementado localmente: a tabela usa layout fixo com largura mínima de planilha e deixa a keyword absorver o espaço restante. Keywords longas podem quebrar; canonical publicado fica em segunda linha com truncamento apenas no metadado secundário.
- Implementado localmente: `Funil` lê somente hints já existentes em `analise_semantica.extension_import.funnelHints` ou campos equivalentes presentes; sem dado, exibe `—`. Nenhum funil é inferido, persistido ou alterado.
- Preservado: filtros, ordenação, status, resultados, volume, KGR, seleção, expansão, tenantização, persistência, importação, bridge e extensão.
- Testes locais: layout da tabela, hidratação, regressões do Minerador, TypeScript, build Next.js 16 e `git diff --check` passaram. Lint direcionado ainda acusa erros preexistentes do componente (`any`, hooks e memoização), fora do escopo desta correção.
- Validação visual manual em 360px, 768px, 1024px e 1440px, light/dark quando aplicável, permanece pendente; o script visual previsto não existe neste checkout.

## Correção da distribuição das colunas da tabela - 2026-07-27

- Implementado localmente: a ordem após as colunas utilitárias agora é `Keyword`, `Principal`, `Resultados`, `Volume`, `KGR`, `Intenção`, `Nicho de mercado`, `Funil`, `Silo/Categoria`, `Status`.
- Implementado localmente: `Keyword` permanece como a maior coluna flexível, com tabela mínima de `110rem` para reservar aproximadamente 420px ou mais; as demais colunas receberam larguras estáveis para evitar compressão e sobreposição.
- Implementado localmente: `KGR`, `Intenção`, `Nicho de mercado`, `Funil`, `Silo/Categoria` e `Status` preservam leitura, truncamento controlado nos selects e alinhamento entre cabeçalho e células.
- Preservado: dados, filtros, ordenação, seleção, expansão, persistência, importação, medição de volume, funil, bridge, handshake e contratos do Minerador.
- Validação local: teste direcionado de layout, TypeScript, build e `git diff --check`; lint direcionado continua limitado por erros preexistentes do componente. Validação visual manual em viewports menores e dark mode permanece pendente.

## Qualificação explícita e Funil na barra de ações - 2026-07-27

- Implementado localmente: o carregamento do Minerador não executa mais o DNA lógico nem persiste intenção, nicho ou Funil. Keywords antigas sem classificação final permanecem com `—` até seleção e ação explícita.
- Implementado localmente: `Qualificar selecionadas` é a ação primária da barra inferior e atualiza intenção, Funil, nicho, viés, confiança e KeywordDNA lógico somente para as linhas selecionadas.
- Implementado localmente: a proposta de Funil usa somente `TOFU`, `MOFU` ou `BOFU`, considera sinais textuais, intenção, etapa da jornada, potencial comercial, nicho, localidade e hints da Extensão, sem depender apenas de volume, resultados ou KGR.
- Implementado localmente: a proposta é persistida de forma aditiva em `analise_semantica.funnel`; `extension_import.funnelHints` é preservado como evidência, conflitos recebem `funnel_review_required`, e decisão humana reconhecida não é sobrescrita.
- Implementado localmente: cada linha processada aparece no resultado da qualificação com intenção, Funil, nicho, viés, confiança e estado de atualização, preservação, conflito ou falha.
- Implementado localmente: a barra superior mantém ações globais; a barra inferior agrupa organização, métricas, qualificação e decisão KGR. `Mais ações` contém publicação, classificação especializada de intenção/nicho e análise semântica; `Excluir` permanece separado e destrutivo.
- Preservado: layout e ordem das colunas, importação, volume, allintitle, bridge, handshake, tenantização, decisões de principal publicada e consumidores do KeywordDNA.
- Validação local: 131 testes direcionados, TypeScript e regressões de layout passaram. Lint direcionado mantém erros preexistentes do componente. Build, validação visual manual em light/dark e homologação autenticada permanecem pendentes nesta etapa.

## Correção definitiva do chevron de Silo/Categoria - 2026-07-27

- Implementado localmente: o select de `Silo/Categoria` mantém o `<select>` nativo para menu, teclado, foco, alteração e persistência, mas remove a seta nativa com `appearance: none` e compõe o estado fechado com texto truncável e `ChevronDown` separado.
- Implementado localmente: o wrapper visual usa largura compacta, limite da célula, área clicável mínima, espaçamento de 6px e chevron sem compressão; o `title` preserva o nome completo para valores longos.
- Preservado: largura e ordem das colunas, valores dos silos, handler, persistência, Status, demais selects, dados, bridge, handshake e contratos do Minerador.
- Validação manual no Chrome: desktop autenticado do Minerador, `Sem Silo/Categoria`, `Serviços`, `Crescimento de Clínicas`, foco visível, abertura via teclado e fechamento sem alteração do valor; `appearance` computado como `none` e separação medida em 6px.
- Pendente: validação manual adicional nos viewports de 360px, 768px e 1024px; não foi trocado valor durante a validação para evitar escrita remota.

## Padronização do select Silo/Categoria com Nicho de mercado - 2026-07-27

- Implementado localmente: `Silo/Categoria` agora reutiliza a mesma base de classes do select `Nicho de mercado`, incluindo altura, tipografia `10px`, peso `bold`, padding, borda, radius, fundo, largura total e comportamento nativo do chevron.
- Removido: wrapper `inline-flex`, `width: fit-content`, tipografia `text-sm`, peso `semibold`, ícone `ChevronDown` separado e seta nativa ocultada; o controle voltou a ser um `<select>` nativo consistente com o Nicho.
- Preservado: opções, `title`, handler, persistência, largura/ordem das colunas, Status, Funil, Nicho, demais selects e dados.
- Validação manual no Chrome: controles com mesma altura, fonte, peso, padding, borda, fundo e radius computados; foco/menu via teclado exercitados sem alterar o valor.
- Pendente: validação adicional em 360px, 768px e 1024px; seleção de valor não foi confirmada com escrita para evitar operação remota.

## Seleção complementar por intervalo e arraste - correção local - 2026-07-29

- Implementado localmente: clique individual, Ctrl/Cmd+clique, Shift+clique e Ctrl/Cmd+Shift+clique usam a ordem visual filtrada/ordenada como referência; a âncora `lastSelectionAnchorId` permanece local e é invalidada com segurança quando fica invisível.
- Implementado localmente: arraste somente na coluna de seleção, com tolerância de 4px, modo selecionar/desmarcar definido pelo checkbox inicial, deduplicação por gesto e supressão do clique subsequente.
- Implementado localmente: cabeçalho seleciona ou desmarca somente linhas visíveis, preserva seleções ocultas e exibe estado acessível indeterminado; contador informa o total selecionado e, quando aplicável, quantas estão visíveis.
- Preservado: foco, teclado, seleção individual, filtros, busca, ordenação, ações em lote, tenantização, persistência e dados. Nenhuma operação remota foi executada.
- Pendente: validação manual em Chrome nos viewports 360px, 768px, 1024px e 1440px, light/dark, com mouse, Ctrl/Cmd, Shift, teclado, filtros e arraste.

## Seleção por pintura e leitura localizada do allintitle - correção local - 2026-07-29

- Implementado localmente: a pintura usa listeners de Pointer Events no documento, `pointerId`, tolerância de 4px, `document.elementFromPoint()` e `closest("[data-keyword-selection-id]")`; somente a célula de seleção possui a área ativa.
- Implementado localmente: `pointerup`, `pointercancel`, perda de foco e desmontagem encerram o gesto; o clique sem movimento continua usando o fluxo individual e o clique gerado após pintura é suprimido.
- Implementado localmente: o leitor Google usa versão 2, aguarda estabilização mínima, procura `#result-stats`/`role=status`, abre `Ferramentas`/`Tools`/`Herramientas` uma vez quando necessário e extrai contagens ancoradas em texto de resultados.
- Implementado localmente: `success`, `zero_results` e `unavailable` permanecem separados; contador ausente usa `result_count_not_found`, estágio `google_result_extraction`, mensagem explícita e diagnóstico estruturado, sem persistir zero.
- Validado manualmente no Chrome: pintura selecionou 10 linhas e a mesma pintura desmarcou as 10 linhas.
- Validado manualmente no Google: após abrir `Ferramentas`, `#result-stats` exibiu `Aproximadamente 282 resultados (0,21 s)`; o valor 282 foi reconhecido e refletido na keyword `Agencia para clinica de estetica`.
- Validado manualmente após recarga do Minerador: a linha continuou exibindo `282`, confirmando a leitura da persistência já realizada pelo fluxo.
- Corrigido localmente: eventos de resultado e `batch_completed` agora aguardam a entrega do resultado antes do encerramento do lote, evitando `response_missing` por corrida de relay.
- Ainda não verificado: reload da Extensão propriamente dita e nova execução usando o background recarregado; a página interna `chrome://extensions` foi bloqueada pela política da automação. Não houve SQL, migration, deploy, commit, push ou limpeza de dados.

## Correção definitiva do modo pintar e do lote allintitle órfão - 2026-07-29

- Causa da pintura: o atributo de seleção não definia um handle interativo amplo; o `px-3` deixava o retângulo real com aproximadamente 7px e o gesto dependia do botão interno. O wrapper agora cobre a célula inteira sem alterar a largura da coluna, usa `touch-none`, captura/libera `pointerId` e valida o hit-test pelo handle.
- Causa do bloqueio: a versão anterior confundia qualquer registro `allintitle:{batchId}` com executor vivo, removia estados terminais e não reconciliava registros ativos quando o service worker reiniciava.
- Implementado localmente: ponteiro `allintitle:activeOperationByBrand:{brandId}`, estados ativos separados de terminais/interrompidos, reconciliação no startup, histórico preservado e cleanup protegido por `try/catch` do executor.
- Implementado localmente: `operation_guard` para execução viva, `operation_reconciliation` para órfão, comandos de acompanhar, retomar, cancelar e descartar, sem tocar no endpoint, schema, volume, KGR, importação ou qualificação.
- Diagnóstico do lote `6094d433-cc0d-418e-8bf5-73a786edb868`: o retorno fornecido registra o `batchId`, mas não informa o `status` armazenado; o código anterior não mantinha executor após reinício e não oferecia reconciliação. O novo startup marcará qualquer registro ativo desse lote como `orphaned` se ele ainda existir.
- Pendente manual do usuário: recarregar a Extensão e a página, testar o gesto real com botão primário em dez linhas, repetir iniciando em marcada, verificar acompanhamento/retomada/descarte/cancelamento e iniciar nova medição após cada terminal. A inspeção automatizada confirmou hitbox de aproximadamente 31px, mas não substitui o gesto manual.

## Remoção da exigência indevida de silo no allintitle - correção local - 2026-07-29

- Causa localizada no workspace: `startAllintitleMeasurement` exigia `item.lista_id` e presença em `allowedListIds`; `handleConfirmAllintitle` repetia o mesmo filtro antes de reconciliar resultados persistidos. A condição foi introduzida no handler original de medição em 2026-07-27 e pertencia a um guard de escopo de listas, não ao contrato de métrica individual.
- Corrigido localmente: a elegibilidade usa ID técnico válido, texto não vazio, `brand_id` correspondente à marca ativa e seleção explícita. Keywords Bruto, sem lista, Sem Silo/Categoria, com lista ou com silo continuam no mesmo fluxo.
- Corrigido localmente: erros de pré-validação usam `code`, `stage` e `diagnostic`; a validação por silo foi removida sem alterar vínculos, listas, endpoint, schema, persistência server-side, relay ou background-owned.
- Pendente: smoke test manual no Chrome com duas keywords Bruto sem silo, uma keyword com silo, reload do Minerador e confirmação da persistência. Nenhuma operação remota foi executada.

## Persistência server-side e fluxo background-owned do allintitle - implementação local - 2026-07-29

- SDD criada e aprovada nesta solicitação: `propostas/persistencia-server-side-results-allintitle.md`. A autorização cobre somente a persistência de `results_allintitle`, sem schema, migration, RLS ou autenticação global.
- Implementado localmente: `POST /api/extensao/marcas/[brandId]/keywords/resultados-allintitle` reutiliza a sessão autenticada da Extensão, permissão tenantizada do Minerador, rate limit e atualiza somente `keywords_kgr.results_allintitle`.
- Implementado localmente: `success` e `zero_results` persistem valor confirmado; falha, CAPTCHA, bloqueio, timeout, cancelamento e valor ausente preservam o resultado anterior. Respostas individuais distinguem `persisted`, `preserved`, `rejected` e `failed`.
- Implementado localmente: o workspace não possui mais escrita direta concorrente de `keywords_kgr` no fluxo allintitle; a interface reconcilia o valor somente após `persistenceOutcome: persisted`.
- Implementado localmente: o relay `minerador-extension-relay.js` é declarado apenas para `localhost:3000` e `127.0.0.1:3000`, valida origem/rota/protocolo e devolve `extension_page_reload_required` para contexto invalidado. A bridge programática permanece apenas para diagnóstico/conexão.
- Implementado localmente: o background reutiliza o executor sequencial existente, estado em `chrome.storage.session`, uma aba Google, intervalo conservador, pausa por CAPTCHA, retomada, cancelamento, IDs e eventos. O lote não é cancelado por popup ou reload da página.
- Ainda não verificado: smoke test autenticado no Chrome com Extensão recarregada, duas keywords, popup fechado, reload durante o lote, persistência real, zero/erro e isolamento Adalba/Lindisse. Nenhuma operação remota foi executada.
## Preflight just-in-time da medicao allintitle - implementacao local - 2026-07-27

- Causa localizada do `ack_timeout`: o registro conectado em `chrome.storage.session` podia sobreviver a reload/navegacao na mesma URL, enquanto a bridge atual ja nao era comprovada; `tabs.onUpdated` tambem ignorava o estado `loading`.
- Implementado localmente: `ensureMineradorConnection(...)` concentra a validacao de sessao, tabId, origem, rota, modulo, actorUserId, brandId, brandRef, protocolVersion, probe, `bridgeInstanceId` e handshake. A conexao armazenada nao e mais prova suficiente.
- Implementado localmente: `loading`/navegacao marca a conexao efemera como pendente de revalidacao; no `complete`, a bridge e preparada novamente somente para uma aba do Minerador que ja possuia registro efemero. O handshake continua explicito no preflight da operacao.
- Implementado localmente: falhas de probe/handshake permitem uma unica recuperacao controlada, com nova injecao, probe e handshake. Sem `HANDSHAKE_OK`, o lote nao e criado e nenhuma aba Google e aberta.
- Implementado localmente: o popup gera o `batchId` somente apos a resposta de preflight; o workspace usa `Validando conexao...`, `Preparando medicao...` e diagnostico com estagio nao nulo.
- Diagnosticos preservam `operationRequestId`, `connectRequestId`, `probeRequestId`, `handshakeRequestId`, `tabId`, bridge anterior/atual, ultimo estagio, codigo e mensagem de erro disponivel, sem segredos.
- Confirmado localmente: sintaxe, testes de preflight/handshake/allintitle, TypeScript e build devem ser registrados separadamente; Google real, reload autenticado, renovacao automatica e persistencia remota continuam validacao manual pendente.

## Renovacao automatica antes do allintitle - correcao local - 2026-07-28

- Causa confirmada: o timeout observado na pagina ocorria antes de a solicitacao chegar a bridge quando a bridge ainda nao estava instalada no documento recarregado. Por isso nao havia `INJECTION_OK`, `PROBE_ACK` ou `HANDSHAKE_OK` no diagnostico.
- Implementado localmente: `tabs.onUpdated` marca o registro efemero como obsoleto no `loading` e prepara a bridge uma unica vez no documento final `complete`; o preflight remove somente o registro efemero obsoleto e usa `ensureMineradorConnection(...)` para validar tabId, marca, origem, rota, bridge atual, probe e handshake.
- Implementado localmente: a recuperacao e limitada a uma tentativa. Em falha recuperavel, o registro e invalidado, a bridge e reinjetada, e o fluxo so cria lote depois de `HANDSHAKE_OK`. Nao ha polling nem handshake duplicado no executor allintitle.
- Diagnostico local preserva `operationRequestId`, IDs de connect/probe/handshake, tabId, bridge anterior/atual, `recoveryAttempted`, `recoveryResult`, eventos, ultimo estagio e codigo real da falha.
- Mensagens do fluxo: sucesso de renovacao usa `Conexao renovada. Preparando medicao...`; falha usa a mensagem principal de renovacao e orienta conectar novamente a aba.
- Confirmado localmente: 52 testes direcionados, sintaxe dos scripts, TypeScript e build passaram. ESLint dos scripts da extensao nao apresentou erros; o lint incluindo o workspace continua com 21 erros preexistentes do componente. `git diff --check` nao apresentou erros.
- Ainda nao verificado: Chrome autenticado com reload na mesma URL, recuperacao real, reabertura do popup e medicao real allintitle. Nenhuma operacao remota foi executada.
- Correcao definitiva apos reload - 2026-07-28: `loading` apenas marca a sessao efemera como stale, invalida `bridgeInstanceId` atual e atualiza o popup para estado de revalidacao; a reinjecao ocorre uma unica vez no `complete` para a mesma aba, origem, marca e rota.
- A preparacao pos-reload executa injecao programatica em mundo `ISOLATED`, frame 0, probe limitado e registra `ready_for_validation`; nao declara conexao e nao inicia handshake, lote, Google ou polling.
- O popup agora diferencia `Atualizando a conexao...`, `Minerador pronto para validacao.` e falha de reinjecao, sem manter o estado verde. O preflight da pagina classifica ausencia de canal como `page_bridge_unreachable` em `page_bridge_dispatch`, nao como `ack_timeout` generico.
- A operacao allintitle reutiliza a bridge preparada, confirma o `bridgeInstanceId`, executa o handshake e so depois cria o lote. Se a instancia mudar, ha uma unica recuperacao controlada.
- Eventos pos-reload: `TAB_LOADING_DETECTED`, `CONNECTION_MARKED_STALE`, `TAB_COMPLETE_DETECTED`, `REINJECTION_STARTED`, `REINJECTION_OK`, `RELOAD_PROBE_SENT`, `RELOAD_PROBE_ACK`, `READY_FOR_VALIDATION`.
- Validacao manual no Chrome permanece pendente; nao houve limpeza ampla: somente o registro efemero stale e removido no preflight. Nenhum logout, SQL, migration, operacao remota, commit, push ou deploy foi executado.

## Restauração da seleção e da fila allintitle - implementação local - 2026-07-29

- Regressão identificada no código atual: workspace, popup e background bloqueavam a operação acima de 10 itens; a prévia correlacionava resultado apenas pelo `batchId`, o que descartaria eventos dos sublotes seguintes.
- Implementado localmente: uma operação aceita qualquer quantidade selecionada e cria sublotes internos sequenciais de até 10, com `operationRequestId`, progresso geral, `batchId` técnico por sublote e persistência confirmada por item.
- Implementado localmente: a tabela voltou a iniciar pintura no botão do checkbox, sem cursor de cruz; movimento abaixo de 4px mantém o clique individual normal. A prévia do popup agora tem clique, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, pintura e ações de selecionar ou limpar visíveis.
- Implementado localmente: eventos de diagnóstico por item registram a cadeia do resultado até a reconciliação da prévia, sem consulta real ao Google em testes.
- Ainda não verificado: Chrome autenticado com a Extensão recarregada, seleção manual, 51 keywords, avanço automático entre grupos, popup fechado, reload da página e a consulta que mostrou 323 resultados. Nenhuma operação remota foi executada.

## Retorno direto do allintitle à tabela - correção local - 2026-07-29

- Correção de escopo: a prévia e a confirmação manual do lote não pertencem ao fluxo aprovado. O resultado validado no endpoint server-side é a única condição para refletir `results_allintitle` na tabela.
- Implementado localmente: removido o painel de prévia e sua seleção; cada retorno com `persistenceOutcome: persisted` atualiza imediatamente somente a linha correspondente. O encerramento do lote ainda reconcilia o snapshot final como contingência para evento individual perdido.
- Durante a execução permanece apenas o estado compacto de progresso com pausar, retomar e cancelar. Falhas, CAPTCHA, timeout e valores ausentes preservam o valor anterior.
- Ainda não verificado: recarregar extensão e página, medir um lote pequeno no Chrome autenticado e confirmar atualização direta das linhas sem painel de prévia. Nenhuma operação remota foi executada.

## Leitura e continuidade do allintitle em segundo plano - correção local - 2026-07-29

- Causa dos cinco itens sem retorno persistível: o leitor v2 deixou de considerar o texto principal da página do Google e procurava somente seletores pequenos. O fallback controlado para `document.body.innerText`, já usado pelo leitor funcional anterior, foi restaurado após a validação da consulta.
- Implementado localmente: o executor mantém um watchdog em `chrome.alarms`, com estado persistido por lote. Se o service worker for suspenso, o alarme recupera o lote e continua do índice salvo; fechar popup, mudar de aba ou sair da página do Minerador após a aceitação não interrompe o lote.
- Implementado localmente: CAPTCHA, consentimento e bloqueio pausam o lote, trazem a aba Google à frente, exibem notificação nativa do Chrome com feito/restante e mantêm Retomar/Cancelar no estado compacto do Minerador.
- Interface: o contador agora informa feito, total e restante sem reintroduzir prévia. Resultados confirmados continuam indo diretamente à tabela.
- Ainda não verificado: Chrome autenticado com extensão recarregada, uma contagem real, suspensão do service worker entre itens, alerta nativo e retomada manual após CAPTCHA/consentimento. Nenhuma operação remota foi executada.

### Correção complementar — reutilização da mesma consulta

- Causa observada em telas fornecidas: o Google exibe claramente `Aproximadamente 5 resultados` e `Aproximadamente 267 resultados`, mas uma aba reutilizada na mesma URL podia preservar o leitor anterior em memória após atualização da extensão.
- Implementado localmente: quando a próxima keyword usa exatamente a consulta já aberta, a extensão recarrega essa página sem cache antes de injetar o leitor; o contador visível passa a ser analisado pelo código atual.

## Diagnóstico preservado de falha na persistência allintitle - correção local - 2026-07-29

- Corrigido localmente: uma falha de persistência por keyword deixa de ser reduzida ao aviso genérico `no_persisted_allintitle_results`. O resultado final carrega código, mensagem, valor medido e diagnóstico seguro do endpoint (status HTTP, IDs de correlação e outcome).
- Corrigido localmente: o encerramento do lote mostra o primeiro motivo real e permite repetir somente as keywords que falharam; `Copiar diagnóstico` inclui, no máximo, dez falhas sem token, cookie ou chave.
- Preservado: a tabela só recebe resultado com `persistenceOutcome: persisted`; falha continua sem sobrescrever dado existente, sem reintroduzir prévia ou escrita direta pelo workspace.
- Confirmado por testes locais: contrato do leitor, lote, endpoint de persistência e interface de encerramento. Ainda não verificado: nova medição autenticada no Chrome para identificar e corrigir, se houver, o código remoto específico do ambiente.

## Fluxo direto do popup e retorno parcial explícito - correção local - 2026-07-29

- Corrigido localmente: o popup deixou de medir allintitle e volume sobre candidatos temporários. Ele agora extrai, permite selecionar e importa; a medição ocorre na tabela do Minerador, somente depois de a keyword possuir ID persistido.
- Corrigido localmente: clique, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, teclado e pintura da prévia usam um único fluxo de ponteiro. As gravações do estado temporário são enfileiradas e versionadas, impedindo uma resposta antiga de restaurar seleções já alteradas ou descartadas.
- Corrigido localmente: a tabela captura o ponteiro no início da pintura. No fim de um lote parcial, informa quantos resultados foram persistidos e quantas keywords não retornaram medição confirmada, mantendo os IDs faltantes para repetição dirigida.
- Ainda não verificado: Chrome autenticado com clique livre e atalhos no popup, reabertura do popup após desmarcar, importação seguida de medição na tabela e repetição somente de um item faltante. Nenhuma operação remota foi executada.

## Navegação Google e alerta de CAPTCHA - correção local - 2026-07-29

- Causa confirmada pelos diagnósticos reportados: a consulta podia tentar interpretar a URL transitória vazia da aba Google, gerando `navigation_failed` com `Invalid URL`; o carregamento inicial da aba também podia ser confundido com a navegação da consulta e gerar `unexpected_navigation`.
- Corrigido localmente: a URL transitória é tratada como consulta ausente e a espera observa especificamente a URL da query. Páginas Google conhecidas de interrupção (`/sorry/index`, reCAPTCHA e consentimento) são aceitas para o leitor classificar o desafio, em vez de falhar antes com `unexpected_navigation`.
- Preservado: CAPTCHA ou bloqueio pausa o lote, abre a aba Google, mantém feito/restante, emite aviso nativo e apresenta Retomar/Cancelar no Minerador. Não há persistência de métrica para o item interrompido.
- Ainda não verificado: desafio real no Chrome com a versão recarregada da Extensão e exibição efetiva da notificação do sistema. Nenhuma consulta Google, importação ou escrita remota foi executada nesta correção.

## Pausa imediata por CAPTCHA e reanexo da operação ativa - correção local - 2026-07-29

- Causa confirmada pelo lote reportado: a página de desafio do Google em português foi devolvida como `query_mismatch`. O executor a tratou como falha normal e percorreu os itens restantes; os 25 resultados persistidos são válidos, e os 190 não tiveram medição confirmada.
- Corrigido localmente: o leitor reconhece as rotas `/sorry/index` e reCAPTCHA antes de validar a query, além de textos como `tráfego incomum` e `Nossos sistemas detectaram`. O primeiro desafio agora gera `captcha`, pausa a operação, preserva o índice e dispara o aviso/Retomar.
- Corrigido localmente: `allintitle_operation_active` devolve o snapshot seguro da operação ativa. A tabela o usa para acompanhar automaticamente o lote existente, restaurando contador e controles em vez de deixar apenas o erro técnico.
- Ainda não verificado: CAPTCHA real com a versão atualizada da Extensão, pausa no primeiro item afetado, alerta nativo e retomada sem reprocessar os itens já concluídos. Nenhuma operação remota foi disparada nesta correção.

## Estado retomável de CAPTCHA no Minerador - correção local - 2026-07-29

- Causa confirmada pelo retorno reportado: o evento `batch_paused` já preservava o lote, mas a tabela o apresentava como notificação de erro e sem ação de retomada naquele aviso.
- Corrigido localmente: CAPTCHA agora é estado informativo de pausa, com `Retomar` e `Cancelar lote` tanto no aviso persistente quanto na barra de progresso. O botão principal passa a informar `Aguardando CAPTCHA...`, sem fingir que há uma medição em curso.
- Preservado: apenas outra medição allintitle da mesma marca fica protegida contra duplicidade; qualificação, volume e as demais ações da tabela não são bloqueados por esse estado.
- Ainda não verificado: no Chrome, liberar o desafio e confirmar que `Retomar` continua exatamente do item pausado, sem descartar resultados já persistidos.

## Aviso de CAPTCHA sem roubo de foco - correção local - 2026-07-30

- Confirmado manualmente pelo usuário: dois desafios pausaram, foram liberados e a operação continuou, inclusive com a keyword interrompida pulada no retorno final.
- Corrigido localmente: o executor não ativa mais automaticamente a aba Google ao detectar CAPTCHA ou bloqueio. A notificação persistente da Extensão, o badge `!`, o clique na notificação e o botão `Abrir Google` continuam disponíveis para abrir a aba somente por decisão do usuário.
- Preservado: pausa imediata, estado persistido, contador, Retomar/Cancelar, continuidade em segundo plano e proteção contra uma segunda medição concorrente.
- Ainda não verificado: confirmar no Chrome que o aviso do sistema aparece sem trocar a aba em primeiro plano.

## Resposta parcial da classificação de intenção e nicho - correção local - 2026-07-30

- Confirmado manualmente pelo usuário: 136 keywords foram classificadas e persistidas; três respostas do modelo chegaram sem as chaves de topo esperadas e foram recusadas sem sobrescrever dados anteriores.
- Corrigido localmente: o endpoint agora aceita somente valores já fornecidos pelo modelo nos formatos equivalentes `intent`/`intencao` e `nicho`/`niche`, inclusive quando estão sob `classification`, `classificacao`, `result` ou `data`. Respostas sem os dois valores continuam recusadas.
- Corrigido localmente: falha parcial passa a usar aviso informativo e `console.warn`, com até dez keywords falhas no diagnóstico, sem apresentar conclusão parcial como sucesso total.
- Ainda não verificado: repetir manualmente somente as três keywords que falharam, sem disparar lote real automatizado nesta correção.

## Pintura imediata da seleção de keywords - correção local - 2026-07-30

- Causa confirmada no código e no relato do usuário: o arraste acumulava checkboxes visitados e alterava `selectedIds` somente no `pointerup`, produzindo atraso visual.
- Corrigido localmente: a pintura agora recalcula o intervalo entre a checkbox inicial e a checkbox sob o ponteiro a cada movimento. Avançar seleciona ou desmarca imediatamente; voltar remove o trecho que deixou de pertencer ao intervalo, sem esperar soltar o clique.
- Preservado: clique comum, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, seleção de visíveis, seleção ocultada por filtro, acessibilidade do checkbox e ações em lote.
- Ainda não verificado: gesto real no Chrome, com ida e volta rápida, mouse e touchpad, além de modificadores de teclado.

## Volume brasileiro via SEO Keyword Research Tool - correção local - 2026-07-30

- Causa confirmada pelo retorno manual: as rotas de volume ainda restringiam configuração ao host antigo `seo-keyword-research8.p.rapidapi.com` e ao contrato `result[].avg_monthly_searches`; por isso rejeitavam o provedor validado no Playground antes de qualquer medição.
- Corrigido localmente: as rotas server-side do Minerador e da Extensão agora usam `GET /global-volume` em `seo-keyword-research-tool1.p.rapidapi.com`, com `keyword` e `country=br`.
- Normalização segura: somente `Keyword Overview.BR[]` da keyword exata pode produzir `volume_search`; valores abreviados como `1.3k` são convertidos para número. `global`, outros países, ausência de BR, payload parcial ou volume inválido não viram medição e não alteram os dados anteriores.
- Testes locais: 27 testes direcionados, `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram. Nenhuma chamada RapidAPI adicional, escrita remota, migration, commit, push ou deploy foi executada nesta correção.
- Pendente manual: após a renovação da cota, medir uma keyword brasileira autenticada e confirmar volume, fonte registrada, persistência e preservação de valor anterior em ausência/falha.

## Conclusão sem volume BR e superfície dos avisos - correção local - 2026-07-30

- Corrigido localmente: `not_found` do provedor — inclusive ausência da seção `BR` — não percorre mais o fluxo de exceção nem exibe código técnico como erro. Sem nenhuma medição, a interface informa somente que a medição foi concluída sem volume BR disponível; em lote parcial, informa a quantidade sem volume BR como conclusão normal.
- Preservado: erro HTTP, payload inválido, quota e falha real do provedor continuam visíveis como erro e não alteram métricas anteriores.
- Corrigido localmente: os avisos `success`, `info` e `error` usam superfícies `emerald`, `amber` e `rose` opacas com bordas existentes, removendo a classe inválida que deixava o aviso de erro transparente no dark mode.
- Testes locais: testes direcionados de interface/volume passaram 28/28; TypeScript, `git diff --check` e build passaram. Lint do workspace conserva erros legados fora do trecho alterado.
- Pendente manual: conferir no Chrome dark mode a conclusão sem BR, um erro real e um aviso informativo, em largura de desktop e viewport estreita.

## KGR não calculável para volume zero e estados visuais - correção local - 2026-07-30

- Corrigido localmente: toda keyword cujo `volume_search` seja exatamente `0` apresenta `Não calculável` na coluna KGR, com prioridade sobre o estado pendente ou a decisão semântica. Não recebe pontuação KGR nem tem seus dados existentes alterados.
- Corrigido localmente: tentar aprovar KGR para uma seleção que contenha volume zero encerra com aviso informativo, sem persistir uma decisão inválida e sem tratar a condição conhecida como erro técnico.
- Interface: os estados textuais de KGR (`Pendente`, `Não calculável`, `Não aplicável`, `Inconsistente`, `Inválido` e `Sem medição`) reutilizam a mesma geometria compacta dos selos da coluna Principal. Os valores numéricos e sua escala cromática permanecem inalterados.
- Preservado: política `Principal travada`/`Principal revisável`, slug, canonical, volume, resultados allintitle, ordem/largura das colunas e contratos de persistência. A política da principal continua uma decisão humana explícita.
- Testes locais: 43 testes direcionados e `npx tsc --noEmit` passaram; `git diff --check` passou. O lint do workspace conserva 21 erros e 8 avisos legados fora do trecho alterado.
- Pendente manual: validar no Chrome em dark mode que volume zero exibe o selo `Não calculável`, que os demais textos KGR seguem o mesmo padrão visual de Principal e que valores numéricos não mudaram.

## Destaque visual de volume confirmado - correção local - 2026-07-30

- Corrigido localmente: `0 confirmado` permanece reservado ao zero efetivamente retornado pela medição exata. Zero sem essa evidência continua com a apresentação normal, sem sugerir confirmação.
- Corrigido localmente: números positivos retornados pelo provedor passam a usar a mesma cor azul já aplicada ao selo `0 confirmado`, permitindo identificar a medição real sem acrescentar outro rótulo visual.
- Proteção: o destaque só é aplicado quando `volume_measurement` declara `match: exact`, status `confirmed`/`zero_confirmed` e `rawVolume` igual ao valor atualmente exibido. Números legados, estimados ou sem evidência de medição mantêm a cor existente.
- Testes locais: 36 testes direcionados e `npx tsc --noEmit` passaram. Nenhuma medição, escrita remota ou alteração de dados foi executada.
- Pendente manual: conferir no Chrome, em dark mode, zero confirmado, zero pendente, número confirmado e valor legado na mesma tabela.

## Padronização visual da intenção - correção local - 2026-07-30

- Corrigido localmente: os rótulos da coluna Intenção agora usam o mesmo selo compacto já empregado pelos estados textuais de Principal e KGR, sem alterar a taxonomia, a classificação ou a largura da coluna.
- Preservado: intenção conhecida continua legível; `Pendente/não classificada` usa a variante neutra. O texto completo permanece disponível no `title` e nomes longos truncam dentro do limite da célula.
- Pendente manual: conferir no Chrome em dark mode os selos de Intenção, textos longos e intenção pendente em desktop e viewport estreita.

## Legibilidade da grade e hover da planilha - correção local - 2026-07-30

- Corrigido localmente: os separadores horizontais e verticais das linhas da planilha usam um tom slate discretamente mais claro, preservando a densidade e o dark mode sem criar novos tokens ou cores.
- Corrigido localmente: o hover identifica a linha sob o mouse. Linhas selecionadas e publicadas mantêm seus contextos índigo e rose durante o hover, em vez de parecerem uma linha neutra.
- Preservado: ordem/largura de colunas, seleção, status, badges, filtros, persistência e dados.
- Pendente manual: validar contraste e leitura da grade em Chrome, nas larguras 360px, 768px, 1024px e 1440px.

### Ajuste corretivo das linhas horizontais

- Corrigido localmente após validação visual: o divisor horizontal agora usa exatamente a mesma intensidade das linhas verticais da tabela. O hover permanece mais claro, como solicitado.
- Ajustado localmente: o hover de qualquer linha usa cinza neutro, inclusive em linhas selecionadas ou publicadas.

## Busca ampliada e histórico ancorado - correção local - 2026-07-30

- Corrigido localmente: o campo Buscar da barra do Minerador comporta aproximadamente 60 caracteres, sem alterar o filtro, a ordenação ou a largura das colunas da planilha.
- Corrigido localmente: o Histórico do Minerador abre abaixo do botão como popover, fecha por clique fora, Escape ou botão de fechar. Os demais consumidores mantêm o painel lateral anterior pela variante compartilhada compatível.
- Correção complementar: como a barra do Minerador possui rolagem horizontal e recorta elementos internos, o popover é renderizado em portal fixo no `document.body`, ancorado no botão. Assim aparece sobre a planilha, logo abaixo da barra, sem corte.
- Pendente manual: conferir posição do popover, clique externo, Escape, restauração e campo Buscar em desktop e viewport estreita.

## Terminologia de keyword fora de artigo - correção local - 2026-07-30

- Corrigido localmente: o selo visual do estado técnico `free` passa de `Principal livre` para `Keyword livre`, pois a keyword ainda não integra um artigo.
- Preservado: o valor técnico `free`, suas regras, seleção, persistência, política de principal publicada e contratos permanecem inalterados.
- Pendente manual: conferir o rótulo na coluna Principal em dark mode, sem regressão visual dos selos `Principal travada` e `Principal revisável`.

## Densidade consistente das ações selecionadas - correção local - 2026-07-30

- Corrigido localmente: os controles do rodapé de ações em lote reutilizam a altura, padding, tipografia, radius e escala de ícones compactos da barra superior.
- Preservado: handlers, disponibilidade, seleção, menus, cores semânticas, barra de progresso e largura da planilha.
- Pendente manual: conferir no Chrome a barra inferior em dark mode, com ações habilitadas/desabilitadas e nas larguras 360px, 768px, 1024px e 1440px.

## Redistribuição de largura para Palavra-Chave - correção local - 2026-07-30

- Corrigido localmente: Principal, Intenção e Funil foram reduzidas para 128px, 168px e 80px, respectivamente. Os 62px liberados passam para Palavra-Chave, que já é a coluna elástica da tabela fixa.
- Preservado: ordem das colunas, largura de Resultados, Volume, KGR, Nicho, Silo/Categoria e Status; badges, selects, filtros, dados e persistência.
- Pendente manual: conferir no Chrome Principal travada/revisável, intenções longas, TOFU/MOFU/BOFU e keywords longas em dark mode e nas larguras 360px, 768px, 1024px e 1440px.

## Descobrir Keywords - SDD e plano estrutural - registro atualizado - 2026-08-03

- Atualização: a rota `/{brandRef}/minerador/descobrir` e a separação do Processador em `/{brandRef}/minerador` estão implementadas localmente; este bloco preserva o desenho estrutural original.
- Auditoria confirmou seleção pura reutilizável em `lib/minerador/keyword-selection.ts`; a tabela, filtros, barra e ações ainda estão acoplados ao workspace atual e exigem extração gradual por composição antes de atender os dois consumidores.
- Documentado: três linhas, pipeline de descoberta, filtros futuros de Resultados/KD dependentes de Serper, entidades conceituais DiscoveryRun/DiscoveryCandidate e importação tenantizada ao Processador sem lista artificial.
- Preservado: tabela e rota atuais, Extensão, Google Ads existente, schema, migrations, Arquiteto, Radar e serviços remotos. A implementação atual não adiciona persistência nem migration.
- Registro histórico: a autorização estrutural e a homologação da Descoberta foram concluídas nas fases seguintes. O fechamento vigente está registrado no bloco Fase 7 no topo deste documento.

## Elegibilidade por volume oficial - implementação local - 2026-08-03

- Implementado: `analise_semantica.volume_eligibility` passa a registrar `pending`, `eligible`, `below_threshold`, `unavailable` ou `measurement_failed` sem reutilizar status editorial.
- Google Ads classifica somente resultados exatos: `>= 120` é elegível, `0–119` fica abaixo do corte e média ausente fica inelegível sem alterar `volume_search`, KGR ou dados anteriores.
- A planilha inicia em `Elegíveis para produção`; o controle Organizar permite consultar pendentes, inelegíveis, falhas ou todas. Keywords publicadas continuam visíveis e não recebem esta decisão automática.
- Confirmado por testes locais: classificação pura, preservação de ausência, filtro operacional, keywords publicadas, projeção Google Ads e proveniência. Nenhuma API real, migration ou operação remota foi executada.
- Pendente manual: medir um lote misto no Chrome, conferir os selos, abrir Organizar para ver `Inelegível · sem volume oficial` e confirmar que as linhas permanecem disponíveis em Todas.

## Fundação Google Ads server-side - implementação local - 2026-08-03

- Corrigido localmente: as rotas REST estão fechadas e tipadas em `:generateKeywordIdeas`, `:generateKeywordHistoricalMetrics` e `/googleAds:searchStream`; não aceitam path arbitrário. A versão permitida é explicitamente `v25` e a mesma configuração que monta a URL fornece `providerVersion` à proveniência.
- Corrigido localmente: campos ProtoJSON `int64` aceitam string decimal ou inteiro seguro de fixture; são convertidos somente quando seguros, ausências e valores inválidos permanecem `null`, e micros permanecem strings decimais. A chave normalizada usa Unicode NFC, `trim` e lowercase neutro, sem remover acentos ou pressupor pt-BR.
- Proteções: a conta resolvida é a única fonte de customer, MCC, moeda e fuso. Divergência explícita no input é recusada antes de qualquer `fetch`; MCC configurado é aplicado quando o input o omite; OAuth usa cache isolado por configuração sem expor segredos.
- Correção complementar: cada métrica histórica preserva canônica, close variants e apenas as entradas solicitadas que correspondem àquelas chaves normalizadas. A resposta conserva todas as entradas originais e lista separadamente as não associadas; nenhuma keyword é atribuída a resultado arbitrário. SearchStream exige resposta e `results` em arrays, preservando `requestId` em payload malformado. `null` não desliga MCC configurado; o header só é omitido quando não há MCC efetivo.
- Confirmado por testes locais com `fetch` simulado: formatos REST literais, seeds de keyword/URL, paginação, 12 meses, CPC presente/ausente, int64, micros, close variants, conta sem autorização, quota, rate limit, timeout e payload malformado. Nenhuma API Google, Serper, RapidAPI ou serviço remoto foi chamado.
- Deliberadamente ainda não implementado: rota Next, interface, persistência, mapeamento marca-conta, cache de dados, substituição do provider de volume, alteração da Extensão, remoção da RapidAPI ou qualquer alteração no Radar/Serper. RapidAPI e Extensão continuam ativas.
- Pendente manual posterior: configurar uma conta anunciante autorizada explicitamente e executar smoke de uma keyword somente quando a próxima fase estiver autorizada.

### Smoke manual preparado

- Implementado localmente: `scripts/google-ads-smoke.mts` recebe conta, MCC opcional, keyword e targeting explicitamente, faz somente uma consulta histórica quando o usuário executar o comando e não persiste nada.
- Proteção: a saída mascara o customerId e exclui segredos, headers, cookies e resposta bruta. Moeda e timezone continuam vindo exclusivamente da conta resolvida.
- Ainda não verificado: execução real manual pelo usuário e comparação com a interface do Keyword Planner. Não houve chamada Google nesta implementação.
- Correção de experiência: o script direto agora carrega o ambiente com `loadEnvConfig(process.cwd())`, incluindo `.env.local`, e oferece `--check-config`/`--help`. Argumento de customer inválido é recusado antes de credenciais; configurações ausentes exibem somente seus nomes, com estágio e `apiRequestStarted: false`.

## Fase 5 — envio ao Processador — histórico superado pelo fechamento da Fase 7 — 2026-08-03

### Verificado no código

- Existe a rota server-side `POST /api/minerador/marcas/[brandId]/discovery/import`, tenantizada e protegida por `minerador:create`.
- A interface `Descobrir Keywords` envia somente UUIDs de candidatas persistidas e um `importRequestId`; não há importação automática ao pesquisar, selecionar, filtrar, ordenar ou recarregar.
- A barra informa selecionadas, novas e já existentes, desabilita a ação durante o envio, mantém a seleção até uma resposta e só oferece `Abrir no Processador` quando existe resultado aproveitável.
- A migration aditiva `supabase/migrations/0010_minerador_discovery_import.sql` define lote idempotente, vínculos de múltiplas origens, guardas de elegibilidade, RLS e o RPC transacional; seus objetos permanecem registrados como histórico da RPC antiga.
- Novas keywords são projetadas para `bruto`, Keyword livre, sem lista e sem decisão editorial; existentes são preservadas e recebem vínculo de origem.

### Confirmado por teste local

- O contrato de request rejeita seleção vazia, IDs livres e duplicatas.
- A resposta valida contagens, itens individuais e resultado idempotente.
- Testes estáticos confirmam a fronteira da rota, a migration, a ação explícita e o link canônico do Processador.

### Regressões manuais remanescentes

- Candidata já existente, repetição sem duplicação, retry idempotente e isolamento entre Adalba/Lindisse.
- Conferência visual completa no Chrome em dark mode e nos breakpoints.
- Essas regressões não bloqueiam o MVP funcionalmente concluído.

## Diagnostico da importacao Descoberta -> Processador - 2026-08-04

- Smoke autenticado de uma candidata confirmou que a rota chega ao RPC e devolve diagnostico sanitizado; esse registro é histórico da RPC antiga.
- A observacao anterior de migration nao executada refere-se ao checkout local; a existencia da RPC foi confirmada no ambiente alvo pelo smoke. O patch `0011` permanece documentado como histórico da RPC antiga, sem consumidor produtivo no fluxo convergido.
- Causa raiz comprovada: na funcao criada pela `0010`, o alias SQL `candidate` colide com a variavel record PL/pgSQL `candidate` nas validacoes de marca, IDs, run e filtro. O Postgres retornou `column reference "candidate.brand_id" is ambiguous` antes da criacao da keyword.
- Correcao local preparada em `supabase/migrations/0011_fix_minerador_discovery_import_candidate_alias.sql`, sem editar ou reaplicar silenciosamente a `0010`; a aplicacao no Supabase permanece manual e pendente.
- Validado: o fluxo novo de candidata foi persistido remotamente e apareceu no Processador; idempotência, candidata existente, retry e isolamento permanecem regressões manuais não bloqueantes.

## Importacao de runs partial finalizadas - correcao local - 2026-08-04

- Causa comprovada no codigo: a Descoberta persiste `partial` quando a resposta Google Ads tem `nextPageToken` ou atinge o limite da pagina, mas a mesma operacao ja foi consolidada com `completed_at`.
- A RPC da `0011` exigia somente `run.status = 'completed'` e rejeitava validamente uma `partial` finalizada como `MINERADOR_DISCOVERY_IMPORT_RUN_NOT_COMPLETED`.
- Preparada `supabase/migrations/0012_fix_minerador_discovery_import_finalized_run.sql`: aceita apenas `completed` ou `partial` com `completed_at` presente; continua rejeitando `pending`, `failed` e `partial` sem consolidacao. Candidatas filtradas continuam bloqueadas pela verificacao individual.
- A rota passa a devolver `runStatus`, `completedAtPresent` e `candidateCount` sanitizados e ajusta a mensagem para uma `partial` finalizada.
- Nenhuma keyword ou origem foi criada na tentativa rejeitada: a verificacao da run ocorre antes do `INSERT` do lote. A `0012` permanece documentada como histórico da RPC antiga.
- A primeira execucao da `0012` falhou apenas na localizacao textual da assinatura e foi revertida pela transacao; o patch local foi corrigido para validar diretamente schema, nome, quantidade e tipos dos argumentos.

## Importador compartilhado Extensao -> Descoberta - núcleo confirmado e legado preservado - 2026-08-04

### Verificado no codigo

- Criado `lib/minerador/keyword-import-core.ts` como nucleo server-side unico para normalizacao, deduplicacao por marca, criacao de keyword nova, preservacao de keyword existente e retorno do ID oficial.
- A rota da Extensao preserva payload, autenticacao, autorizacao tenantizada e contrato do popup, mas delega a persistencia de `keywords_kgr` ao nucleo.
- A rota da Descoberta deixou de chamar `import_minerador_discovery_candidates`. Ela relê run e candidatas por `brandId`, aceita `completed` ou `partial` finalizada, cria/recupera lote, chama o nucleo, grava origem, atualiza a candidata e consolida o lote.
- Keywords novas entram como `bruto`, `lista_id = null` e com volume/proveniencia da Descoberta; keywords existentes recebem somente evidencia aditiva e vinculo de origem.
- A RPC antiga e os objetos SQL de `0010`, `0011` e `0012` permanecem como legado, sem novos consumidores produtivos nesta convergencia.

### Confirmado por teste local

- Testes direcionados Extensao/Descoberta: 20/20.
- TypeScript passou.

### Regressões manuais remanescentes

- Candidata já existente, repetição sem duplicação, retry após falha de vínculo e isolamento entre Adalba/Lindisse.
- Conferência visual completa em dark mode e breakpoints.
- A importação nova e sua persistência remota foram confirmadas manualmente; nenhuma migration ou SQL remoto foi executado pelo agente nesta tarefa documental.

## Fase 8 - metricas atuais e allintitle nas duas areas - implementacao local - 2026-08-04

### Verificado no codigo

- A migration aditiva `0013_minerador_discovery_candidate_current_metrics.sql` foi criada, mas nao executada. Ela separa o snapshot imutavel da Descoberta da projecao operacional atual da candidata e cria historico append-only tenantizado.
- O protocolo allintitle existente aceita tanto `targetKind = keyword` com `keywordId` quanto `targetKind = discovery_candidate` com `candidateId`; a Extensao continua sendo o unico executor de leitura, fila, parser, CAPTCHA, pausa, retomada e notificacoes.
- A rota de persistencia atualiza somente valores confirmados. Falha, CAPTCHA, timeout ou resposta sem confirmacao preservam o valor anterior; candidatas registram o estado da medicao e o erro sanitizado sem apagar resultados.
- A rota Google Ads aceita `candidateIds` e grava volume, historico mensal, CPC, concorrencia, targeting, provider, versao e data na projecao atual. Keywords oficiais continuam usando o fluxo existente.
- Candidatas vinculadas a uma keyword oficial passam a registrar `keyword_id`; a atualizacao allintitle mantem a mesma medicao operacional nas duas representacoes, sem sobrescrever o snapshot da DiscoveryRun.
- A tabela da Descoberta recebeu as acoes `Medir resultados` e `Atualizar metricas`, preservando a selecao tecnica por `candidateId`.

### Ainda nao verificado

- A migration 0013 precisa ser aplicada manualmente antes do smoke autenticado; nenhuma operacao SQL remota foi executada nesta tarefa.
- Permanecem pendentes o smoke real das duas acoes nas duas abas, candidata ja importada/idempotencia, retry, isolamento Adalba/Lindisse e validacao visual completa em dark mode e breakpoints.

## Botao de importacao Descoberta -> Processador - correcao localizada - 2026-08-04

### Verificado no codigo

- O botao usa `type="button"`, fica bloqueado somente durante `importing` e envia `candidateIds` derivados de `selection.selectedIds`, que sao os `candidateId` tecnicos das candidatas persistidas.
- A reconciliacao agora detecta selecao stale ou divergente antes do `fetch` e mostra `A importacao nao pode ser iniciada. Sua selecao foi preservada.` sem apagar a selecao.
- O handler valida o `brandId` extraido do `brandRef`, gera `importRequestId`, registra o inicio da requisicao, interpreta a resposta e encerra o loading em `finally`.
- Falhas anteriores ao POST deixam detalhe tecnico somente em desenvolvimento; respostas HTTP continuam exibindo a mensagem sanitizada da rota.

### Confirmado por teste local

- Teste direcionado de importacao: 10/10.
- TypeScript e ESLint direcionado (incluindo teste com `--no-ignore`) passaram.

### Ainda nao verificado

- Network e smoke autenticado de sucesso no Chrome apos esta correcao.
- A aplicacao da `0012` foi relatada pelo usuario como `Success. No rows returned`, mas permanece sem verificacao independente pelo agente.

## Handoff canonico Minerador -> Arquiteto - implementacao local - 2026-08-11

### Verificado no codigo

- `keywords_kgr` permanece a fonte canonica das keywords; o handoff nao duplica texto, metricas ou DNA editorial.
- A operacao protegida do Arquiteto recebe somente IDs de keywords e valida a Brand no servidor antes de persistir `editorial_workflow_items` com `subject_type = keyword`, `stage = architect`, identidade da keyword, origem MINERADOR e estado `received`.
- O contrato usa `resolvePipelineContext()` para actor, sessao Supabase SSR e autorizacao server-side; nao depende de owner, nome, slug, e-mail ou storage do navegador.
- Repeticoes usam a unicidade de `(marca_id, subject_type, subject_id, stage)` e retornam `PERSISTED` ou `UNCHANGED`, sem duplicacao.

### Ainda nao verificado

- Nenhuma migration, SQL remoto, backfill ou smoke autenticado foi executado nesta tarefa. A validacao remota do handoff, da idempotencia e do isolamento entre Brands permanece pendente.
- IA, SERP, DataForSEO, providers e demais consumidores do Minerador nao foram chamados ou alterados.

## Diagnostico da divergencia do handoff canonico - 2026-08-12

### Verificado no codigo

- O modal do Arquiteto nao consulta `editorial_workflow_items` diretamente para exibir `Ja importado no Arquiteto`. O bloqueio usa `effectiveImportedKeywordIdsForUi`, que prioriza recovery/auditoria em memoria, depois IDs renderizados e, sem itens renderizados, `architectImportedKeywordIds`.
- `architectImportedKeywordIds` e restaurado e regravado por `workflowRecoveryStorageKey(actorUserId, brandId)` no `localStorage`; e um marcador legado/local, nao uma prova do handoff remoto.

### Relatado pelo usuario

- Na mesma Brand, o modal bloqueia itens como ja importados enquanto o workspace canônico permanece vazio apos reload, nova sessao, restart e mais de um navegador.

### Ainda nao verificado

- A correlacao remota keyword -> `editorial_workflow_items` -> read model aguarda a execucao manual do script read-only `supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql`. Nenhum dado foi corrigido, removido ou recriado.
## Zero Legacy — Google Ads — auditoria local — 2026-08-12

- **Baseline:** a limpeza estrutural 0032 foi relatada como aplicada e homologada; 0016 rollback e 0030 recovery não fazem parte do escopo Google Ads desta auditoria.
- **Verificado no código:** `public.minerador_google_ads_connections` é criada pela migration `0007_minerador_google_ads_volume.sql`, tem uma linha por `brand_id`, FK restritiva para `marcas`, RLS tenantizada e ACL local para `authenticated`. A contagem remota não foi consultada; não há seed/fixture local que permita inferi-la.
- **Consumidores runtime comprovados:** a rota de configuração faz GET/upsert; as rotas de Descoberta e métricas fazem leitura antes da chamada Google Ads; `modules/marca/google-ads-connection-panel.tsx` consome somente a API. Não foram encontrados outros consumidores diretos em `app`, `modules`, `lib` ou `components`.
- **Credenciais:** OAuth, Developer Token, versão e MCC técnico continuam server-side em `GOOGLE_ADS_*`; a tabela legada não armazena segredo nem refresh token. O access token fica em cache de memória.
- **Paridade:** 0024/0025 oferecem os contratos genéricos de provider, capability, connection, grant, binding, quota e usage, mas ainda não representam de modo completo Customer/MCC, targeting, moeda/timezone, validação, `secret_ref` ou a resolução das três rotas Google Ads.
- **Classificação:** `GOOGLE_ADS_LEGACY_AUDIT = COMPLETE_LOCAL_ONLY`; `CANONICAL_PARITY = PARTIAL`; `FINAL_CLASSIFICATION = MIGRATE_THEN_DROP`.
- **Próximo passo seguro:** aprovar o mapeamento semântico e adaptar primeiro a leitura server-side por binding/capability canônicos, com readback e linha legada preservada como rollback. Não criar tabela espelho, não executar provider automaticamente e não preparar migration de remoção antes de provar zero consumidores.
- **Operações:** nenhuma consulta remota, migration, alteração de dados, chamada paga ou alteração de runtime foi executada nesta auditoria.
## Google Ads — canonical cutover blocked by schema gap — 2026-08-12

- `public.minerador_google_ads_connections` remains the active runtime source for the configuration route, Google Ads Discovery and Google Ads metrics. The panel consumes that route indirectly.
- The shared 0024/0025 runtime already models provider, capability, connection, grant, binding, quota and usage, but the Google Ads consumer has not been migrated to those layers.
- The mapping has an objective structural gap: there is no approved canonical representation for the Customer-to-MCC relationship, Brand-owned targeting parameters, current external-account metadata, or `validated_at` semantics. `integration_connections.metadata` cannot be used as a silent substitute because it belongs to the connection owner, not the Brand operation configuration.
- No canonical cutover, dual-write, backfill, provider call, migration or remote SQL was performed. No fallback was added; the existing legacy path remains explicitly legacy-backed while the gate is blocked.
- Classification: `GOOGLE_ADS_CANONICAL_SCHEMA_GAP`; `GOOGLE_ADS_RUNTIME_CUTOVER = BLOCKED_BY_SCHEMA_GAP`.
- Next safe step: approve the missing canonical representation and secret/connection configuration contract, then adapt the resolver and the three routes with readback, grant/binding/quota/usage enforcement and no legacy fallback. Do not remove the legacy table before `RUNTIME_CONSUMERS = 0` is proven.

## Google Ads Research Customer ID global — implementação local — 2026-08-15

- **Verificado no código:** Keyword Discovery e Keyword Metrics resolvem o Customer ID de pesquisa a partir de `integration_connections.metadata.google_ads_research_customer_id` da Connection global Google Ads. O `brandId` continua apenas no contexto de autorização e no dono dos dados produzidos.
- **Preservado:** Login Customer ID/MCC, secrets server-side, capabilities internas, usage, auditoria e contratos futuros de vínculo externo da Brand. O vínculo externo da Brand não é exigido para pesquisa.
- **UI:** Configurações das APIs exibe `Research Customer ID` separado de `Login Customer ID (MCC)`; a Marca não exibe mais Customer ID Google Ads para Discovery/Metrics.
- **Erro canônico:** ausência do metadata retorna `GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING`; não é convertida em erro de Customer ID da Brand.
- **Confirmado por teste:** 21 testes direcionados, lint direcionado e guard visual do projeto passaram; validação manual autenticada confirmou os campos e a remoção do requisito na Marca.
- **Ainda não verificado:** Research Customer ID global ainda está vazio no ambiente atual; nenhum smoke pago de Discovery/Metrics foi executado nesta implementação.

## Histórico superseded — Google Ads — infraestrutura fixa por env — implementação local — 2026-08-16

- **Decisão vigente:** o adendo `docs/compartilhado/adendo-google-ads-platform-infrastructure-env-2026-08-16.md` substitui a leitura anterior de Connection/Vault para o runtime Google Ads.
- **Verificado no código:** `getGoogleAdsPlatformConfig()` lê exclusivamente as seis variáveis `GOOGLE_ADS_*` da Plataforma; Discovery, Metrics, health check e o endpoint de conexão da Brand não consultam Connection, Vault, metadata, binding, grant ou quota.
- **Admin:** Google Ads aparece como status de infraestrutura e mantém somente “Testar conexão”; o formulário de credenciais e Customer IDs não é renderizado nem editável.
- **Preservado:** DataForSEO e OpenRouter continuam no modelo de Connections; schema, migrations, banco legado e dados existentes não foram alterados.
- **Gap explícito:** `integration_usage_events` exige `connection_id` não nulo; as tabelas operacionais do Minerador preservam a auditoria por ator, Brand, operação e request-id, mas o ledger genérico de Usage de infraestrutura aguarda contrato posterior sem schema inventado.
- **Smoke atualizado:** o `.env.local` possui as seis variáveis exigidas; o provider foi chamado uma vez para Discovery e uma vez para Metrics, sem `SearchStream`.

## Google Ads — remoção do gate Customer Lookup — implementação e smoke real — 2026-08-16

- **Verificado no código:** Discovery e Metrics não chamam mais `resolveGoogleAdsAdvertiserAccount()` nem `GoogleAdsService.SearchStream` como preflight. A função permanece disponível para consumidores futuros ou legítimos.
- **Fluxo ativo:** `getGoogleAdsPlatformConfig()` → OAuth/access token → Research Customer ID da Plataforma → `GenerateKeywordIdeas` ou `GenerateKeywordHistoricalMetrics`.
- **Metadata opcional:** moeda e fuso são `null` quando não obtidos por lookup; a resposta do Keyword Planner não é invalidada por essa ausência e as colunas atuais já aceitam `NULL`.
- **Testes locais:** 30 testes focados passaram; ESLint direcionado passou; TypeScript mantém somente os três erros preexistentes de regex em `tests/agency-adalba-platform-internal.test.mts`.
- **Smoke real Discovery:** alcançou `/v25/customers/:customerId:generateKeywordIdeas`, request-id `NKi9LTQqaGskuyOs1Wrqxg`, HTTP 403, `authorizationError:CUSTOMER_NOT_ENABLED`, `PERMISSION_DENIED`, classificação `CUSTOMER_ACCESS/HIERARCHY`.
- **Smoke real Metrics:** alcançou `/v25/customers/:customerId:generateKeywordHistoricalMetrics`, request-id `LlWLjsTZ5mplALV6N0GuYQ`, HTTP 403, `authorizationError:CUSTOMER_NOT_ENABLED`, `PERMISSION_DENIED`, classificação `CUSTOMER_ACCESS/HIERARCHY`.
- **Conclusão:** o gate foi removido e o erro real agora vem do serviço primário; a conta Research Customer está desabilitada ou não habilitada para acesso. Nenhum ID, credencial, banco, schema ou arquitetura foi alterado.

## Google Ads — diagnóstico completo após `apiRequestStarted` — 2026-08-16

- **Observabilidade:** Discovery agora sempre retorna `providerResponseReceived`, `failureType` e `internalStage`, incluindo transporte sem `Response`, falha OAuth e erro interno após resposta.
- **Categorias:** `PROVIDER_SUCCESS`, `PROVIDER_HTTP_ERROR`, `PROVIDER_TRANSPORT_ERROR`, `OAUTH_TOKEN_ERROR` e `INTERNAL_POST_REQUEST_ERROR` são emitidas sem mascarar falhas como erro genérico.
- **Fixture:** transporte sem resposta gera `PROVIDER_TRANSPORT_ERROR`, `providerResponseReceived = false`, HTTP `null` e endpoint sanitizado; fixture HTTP preserva status, request-id e código seguro.
- **Smoke real final:** MCC usado como Research Customer retornou `PROVIDER_SUCCESS` em `GenerateKeywordIdeas`, request-id `1JVcNBAdcyj455muIbO_6w`, 10 ideias, sem `SearchStream`.
- **Classificação final:** `MCC_AS_RESEARCH_CUSTOMER = PASS`; configuração, banco, schema, DataForSEO e OpenRouter permaneceram inalterados.

## Google Ads Research — pacote local da migration de compatibilidade — 2026-08-16

- **MIGRATION_PACKAGE_PREPARED = YES:** preparados localmente `0041_google_ads_research_persistence_constraints.sql`, preflight read-only, post-verifier read-only e rollback guarded.
- **Escopo:** somente as duas `source_contract` CHECKs de `minerador_discovery_runs` e `minerador_discovery_candidates`; nenhum application code, dado, coluna, RLS, policy, grant, owner, índice, trigger, FK ou Usage foi alterado.
- **Baseline:** próximo número reconfirmado como `0041`; 0 linhas Google Ads, 8 runs e 34 candidates existentes manual/CSV; `DATA_MIGRATION_REQUIRED = NO`.
- **REMOTE_APPLY = PENDING_USER:** nenhuma migration ou SQL de escrita foi executado remotamente.
- **Ainda não homologado:** Discovery real, readback remoto e atualização visual aguardam aplicação manual, post-verifier sem falhas e smoke único posterior.

## Google Ads Historical Metrics — pacote 0043 fechado — 2026-08-17

- **Preflight remoto read-only:** `PASS`, sem drift; confirmou `currency_code text NOT NULL`, CHECK validada, zero linhas e baseline estrutural completa.
- **Pacote local:** migration 0043 mínima, rollback fail-closed, post-verifier vinculado aos fingerprints reais e teste reversível do contrato de moeda.
- **Delta único:** `minerador_keyword_metric_measurements.currency_code` de `NOT NULL` para nullable; nenhuma outra coluna, constraint, FK, índice, trigger, RLS, policy, ACL, owner ou dado é alterado.
- **Apply remoto:** executado manualmente pelo usuário; o agente realizou depois somente SELECTs/read-only.
- **Post-verifier:** `PASS`, com `target_now_nullable = true`, `invariant_fingerprints_preserved = true` e `data_delta_zero = true`.
- **Operações desta verificação:** zero escrita remota de schema/dados, zero rollback, zero migration adicional e zero chamada de provider.

## Notification Center global — integração operacional — 2026-08-18

- **Verificado no código:** avisos do Minerador, inclusive erros de workflow e
  persistência, passam pelo contrato compartilhado `publishNotice` ou por
  bridge compatível com o estado inline existente.
- **Histórico:** o `GlobalNoticeProvider` vive acima das rotas e o sino mantém
  históricos separados por módulo e `brandId` durante a sessão SPA, com ordem
  mais recente primeiro, badge de não lidos, marcação individual/coletiva como
  lido e reabertura sem apagar o histórico.
- **Preview:** um aviso novo abre automaticamente o sino por aproximadamente
  cinco segundos; interação no painel interrompe o fechamento automático e o
  aviso permanece disponível.
- **Acessibilidade:** o painel possui nome acessível, `aria-controls`, foco ao
  abrir, retorno de foco ao fechar, fechamento por `Escape` e clique externo.
- **Limitação deliberada:** a retenção atual é em memória durante a sessão SPA,
  sem TTL arbitrário; fechar o painel ou marcar como lido não remove avisos.
  F5, logout e novo login iniciam estado limpo. Não houve alteração de banco,
  schema, migrations, Auth, providers ou layout global.
- **Validação:** testes visuais focados passaram; smoke visual autenticado foi
  concluído em Minerador, Arquiteto e Radar, incluindo auto-open, preview,
  fechamento, reabertura, isolamento entre áreas e restauração do histórico ao
  voltar. Uma segunda Brand não estava disponível para o smoke cross-brand.

## Minerador R1.2 — Perfil da Keyword organizado por processo — implementação local — 2026-08-18

### Verificado no código

- `KeywordDnaPanel` passou a organizar o perfil em uma caixa por processo, na ordem `Identidade → Leitura lógica → Google Ads → DataForSEO → KGR → IA → decisão humana → proveniência técnica`.
- Identidade ficou restrita a keyword, URL/canonical, origem, situação livre/publicada e lista/silo atual; métricas e interpretação não são repetidas nesse bloco.
- A leitura lógica apresenta os campos R1/R1.1 com origem determinística, confiança e revisão humana separadas dos providers.
- Google Ads e DataForSEO agora recebem seus registros de medição pelo workspace e exibem leitura humana; históricos e payload integral ficam recolhidos em detalhes técnicos.
- A decisão humana mantém os controles existentes de status e política da principal publicada, sem alterar keyword, URL, slug, canonical, schema, persistência ou providers.

### Confirmado por teste

- 85 testes focados do Minerador/Arquiteto passaram, incluindo regressões estáticas da ordem das caixas, separação dos providers, KGR, IA, decisão humana e preservação da proveniência.
- `pnpm run check:visual-system` passou (`VISUAL_SYSTEM_GUARD = PASS (4 files)`). ESLint direcionado do painel passou.

### Ainda não verificado

- Smoke visual autenticado do perfil expandido permanece pendente: o servidor local redirecionou para login e não havia sessão autenticada disponível no navegador.
- `pnpm exec tsc --noEmit` continua com somente os três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts`; o lint amplo do workspace mantém débitos anteriores não relacionados ao R1.2.

## Minerador R1.3 — Compactação visual do Perfil da Keyword — implementação local — 2026-08-18

### Verificado no código

- `KeywordDnaPanel` mantém a ordem operacional e usa grid responsivo: lógica e decisão ocupam a largura principal; Google Ads/DataForSEO e KGR/IA ficam lado a lado em desktop; a proveniência ocupa a largura completa.
- `ProfileFields` omite valores nulos, vazios e marcadores de ausência. A keyword livre exibe somente contexto real e situação; URL/canonical ficam condicionados à publicação; origem técnica permanece em proveniência.
- Google Ads e DataForSEO mostram somente `Medição pendente` quando não há dados. KGR mostra `Ainda não calculado` e aguarda volume + allintitle. A IA usa superfície neutra e não repete uma grande pendência amarela.
- Textos longos usam `min-w-0`, whitespace normal, quebra de palavras e largura integral para problema, resultado, job, evidências, justificativas e payloads. Históricos e JSON técnico continuam preservados em detalhes recolhidos.
- Nenhum handler, API, provider, persistência, schema, migration ou contrato de leitura do workspace foi alterado.

### Confirmado por teste

- 28 testes focados passaram, incluindo as regressões R1.3 de placeholders, estados vazios, expansão com dados, grid, wrapping, overflow e preservação técnica.
- `pnpm run check:visual-system` passou (`VISUAL_SYSTEM_GUARD = PASS (4 files)`). ESLint direcionado de `components/editorial/dna-panels.tsx` passou.
- `git diff --check` passou nos arquivos da implementação.

### Ainda não verificado

- Smoke visual autenticado permanece pendente: o navegador local redirecionou para login e não havia sessão autenticada disponível para abrir o perfil real nos viewports 360, 768, 1024 e 1440, em light/dark mode.
- `pnpm exec tsc --noEmit` continua com somente os três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts`; não surgiu erro novo no painel.

## Minerador R5 — OpenRouter: saída compacta e diagnóstico de truncamento — implementação local — 2026-08-19

### Verificado no código

- O contrato enviado ao provider agora é compacto: `agreementFields`, `divergences`, `enrichments` e `remainingAmbiguities`; concordâncias não repetem valores, motivos ou evidências já presentes na lógica.
- O adapter server-side expande concordâncias para `fieldReviews[]` completos, preservando o contrato consumido por `analise_semantica.ai_review`, R6 e R6.1. Divergências mantêm sugestão, justificativa e evidências; enriquecimentos mantêm valor e detalhes objetivos.
- O diagnóstico sanitizado preserva modelo solicitado/retornado, `maxTokensSent`, `finishReason`, `nativeFinishReason`, tokens de prompt/completion/total, reasoning tokens quando disponíveis, tamanho do conteúdo, modo de formato e estágio de falha. Prompt, reasoning, headers e credencial não são registrados.
- A resolução é por capacidade do modelo selecionado: `json_schema` quando declarado suportado; `json_object` no mesmo modelo quando esse é o formato mínimo disponível; ausência explícita de formato compatível falha antes da chamada. Não existe troca de modelo/provider.
- Truncamento por `finish_reason` ou `native_finish_reason` falha antes do parse e não chega ao update de `analise_semantica`; volume, Resultado/DataForSEO, KGR e CPC permanecem fora da escrita da revisão.

### Confirmado por teste

- 18 testes focados do adapter/semântica passaram, cobrindo 20 concordâncias compactas, divergência, enriquecimento, JSON Schema, JSON mode, capability incompatível, conteúdo vazio, truncamento, limite de tokens e reasoning sanitizado.
- 5 testes canônicos de OpenRouter passaram com o loader de runtime, incluindo resolução de `json_schema`, `json_object`, `unsupported` e `unknown` sem fallback de modelo.
- `git diff --check` passou nos arquivos da implementação.

### Ainda não verificado

- `ROOT_CAUSE_CONFIRMED` em provider real permanece pendente: nenhuma chamada paga foi executada. O próximo smoke autenticado deve usar `marketing digital` e confirmar `finishReason = stop`, parse/schema/normalização, persistência/readback de `ai_review` e invariância de Volume, Resultado, KGR e CPC.
- `pnpm exec tsc --noEmit` continua somente com os três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts`.
- Não houve alteração de provider, modelo, Connection, schema, migration ou API; a atualização continua no campo JSON já utilizado `analise_semantica`.
## Descoberta — filtros SEO locais por Resultado e KD — implementação local — 2026-08-19

- **Verificado no código:** os filtros `Resultado` e `KD` aparecem na linha existente da Descoberta como intervalos numéricos mínimo/máximo. Eles operam somente sobre as candidatas já carregadas e medidas no read-model; editar, limpar, ordenar ou abrir o filtro não chama provider.
- **Fonte preservada:** Google Ads continua sendo a fonte de descoberta, volume, CPC e concorrência Ads. A ação explícita existente `dataforseo/allintitle` continua sendo a fonte de Resultado e também executa o Keyword Overview/KD; nenhum botão, provider ou endpoint novo foi criado.
- **Política de ausência:** zero é valor válido; `null` não vira zero e fica fora somente quando o intervalo correspondente está ativo. Sem dados SEO, o popover informa `Meça os dados SEO para usar este filtro`.
- **Proveniência/revalidação:** snapshots da Descoberta não são sobrescritos. A restauração pode projetar o KD da última medição bem-sucedida já registrada no histórico existente, enquanto a revalidação oficial no Processador permanece independente.
- **Limites:** não foram criados thresholds editoriais, score combinado, classificação fácil/médio/difícil, migration ou alteração de schema. Nenhuma chamada paga foi executada nesta implementação local.
- **Validação local:** testes focados de Descoberta, TypeScript (somente os três erros preexistentes `TS1501` em `tests/agency-adalba-platform-internal.test.mts`), ESLint direcionado e guard visual foram executados. Smoke autenticado/visual ainda depende de validação manual.

## Descoberta — bulk bar de triagem — implementação local — 2026-08-19

- **Verificado no código:** a barra usa a ordem `Atualizar métricas → Medir resultados → Enviar selecionadas ao Processador`, com contadores antes das ações e `Limpar seleção` isolado no lado direito.
- **Verificado no código:** `Exportar` foi removido somente da bulk bar da Descoberta; nenhum handler compartilhado ou exportação global foi apagado.
- **Verificado no código:** Google Ads e DataForSEO continuam sendo chamados somente por seus botões explícitos. O envio não exige volume, Resultado, KD ou qualquer outra medição prévia e não dispara provider silenciosamente.
- **Preservado:** os snapshots e a proveniência que existirem seguem no handoff; a revalidação oficial continua pertencendo ao Processador.
- **Confirmado por teste:** a ordem, a ausência de Exportar e a ausência de gates/chamadas automáticas no envio estão cobertas por `tests/minerador-discovery-bulk-bar.test.mts`.
- **Ainda não verificado:** smoke autenticado visual da Descoberta em desktop/mobile e confirmação remota do handoff permanecem pendentes.

## Minerador — distribuição inicial de InfoHint — implementação local — 2026-08-19

### Verificado no código

- O primeiro lote reutiliza o `InfoHint` global nos conceitos de maior dúvida: Volume, KGR, Intenção, Nicho, Funil, Silo/Categoria, Status e Perfil da keyword.
- As ações operacionais `Processar lógica`, `Atualizar métricas`, `Revisar com IA`, `Revisar` e `Enviar ao Arquiteto` receberam explicações curtas sem substituir handlers, estados disabled ou pré-condições visíveis.
- A Descoberta explica Intenção preliminar, Etapa do funil e o filtro local de Volume. Não foram adicionados hints genéricos à sidebar, navegação ou controles autoexplicativos.
- O gate textual do handoff ao Arquiteto continua renderizado fora do tooltip; nenhuma regra obrigatória, erro ou pré-condição foi escondida.
- Não houve alteração de provider, API, persistência, schema, migration ou chamada remota.

### Confirmado por teste

- 14 testes focados de distribuição passaram em `tests/minerador-info-hint.test.mts` e `tests/minerador-keyword-profile-bento.test.mts`.
- O lint dos arquivos menores tocados e o guard visual passaram. `git diff --check` passou.

### Ainda não verificado

- A revisão manual autenticada de hover/foco, collision/viewport e dark mode não foi concluída: o servidor local redirecionou `/admin` para `/login` e não havia sessão autenticada disponível.
- `pnpm exec tsc --noEmit` mantém somente os três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts`; o lint do workspace do Minerador mantém problemas preexistentes fora dos trechos adicionados.

## Minerador — ciclo de vida e exclusão segura de keyword — implementação local — 2026-08-20

### Verificado no código

- A exclusão definitiva agora faz preflight das referências protegidas e só executa dentro do `brandId` ativo quando não há medições, histórico, proveniência, DNA, workflow ou publicação formal vinculados.
- Google Ads, histórico de descoberta, métricas atuais/históricas e proveniência usam referências restritivas; referências sem FK também são auditadas antes da exclusão.
- A remoção automática de duplicatas durante o carregamento foi retirada. A ação explícita de duplicatas também usa preflight e readback antes de atualizar a UI.
- Falha de dependência ou `23503` não produz falso sucesso nem remove parcialmente o estado local. Nenhuma medição, histórico ou proveniência é apagada em cascata.
- Não existe contrato vigente de `archive`/`soft delete` em `minerador_keywords`; portanto, arquivamento permanece uma decisão estrutural separada.

### Confirmado por teste

- 28 testes focados de ciclo de vida, exclusão e regressão do workbench passaram.
- O guard visual passou; não houve alteração de schema, migration, provider ou operação remota.

### Ainda não verificado

- Não foi executado smoke autenticado/remoto de exclusão. O comportamento remoto depende do readback no ambiente alvo.
- Purga de dados de teste continua sendo operação administrativa separada; `tests/run-all.js` é harness de validação, não ferramenta segura de purge.

## Minerador — purge administrativo controlado de dados de teste — implementação local — 2026-08-20

### Verificado no código e no schema

- O ciclo de vida normal e o botão `Excluir` não foram alterados. A nova operação fica exclusivamente nos helpers manuais `supabase/scripts/minerador-test-data-purge-dry-run-read-only.sql` e `supabase/scripts/minerador-test-data-purge.sql`.
- O dry-run recebe apenas `brandId` e `keywordId[]`, produz `PURGE_PLAN`, texto sanitizado, estado editorial/publicação, contagens por dependência e inventário das FKs recebidas pela entidade `minerador_keywords`.
- O helper de execução exige Admin global conferido em `auth.users`/`perfis`, ambiente explícito de homologação, confirmação, UUIDs exatos e `approvedPlanHash` igual ao plano revisado. Cada keyword usa subtransação, ordem explícita de filhos, readback e resultado individual.
- Publicação formal, `PublicationRecord`, status legado não corrigido, workflow/handoff, versionamento, decisões e eventos append-only bloqueiam a operação. Referência de outra Brand e drift do alvo também falham fechados. Runs de descoberta pais permanecem preservados quando imutáveis; somente registros filhos explicitamente auditados podem ser removidos.
- Não existe ledger genérico de execution events compatível: o contrato existente de operação excepcional é restrito a `historical_import_recovery:execute`. Por isso não foi criado registro persistente novo; `executionRequestId` fica vinculado ao resultado temporário da execução manual e a repetição de keyword ausente retorna `already_absent`.

### Confirmado por teste

- 8 testes estáticos passaram em `tests/minerador-test-data-purge.test.mts`, cobrindo read-only, gates, dependências/FKs, ordem de exclusão, rollback por exceção, publicação, cross-brand, `already_absent` e preservação do caminho normal.
- Não houve alteração de runtime, UI, schema, migration, FK, trigger, provider ou dados. Nenhuma operação remota foi executada.

### Ainda não verificado

- O PostgreSQL local não estava disponível (`127.0.0.1:54322 - no response`); portanto a validação desta etapa é estática e não prova execução SQL.
- O smoke manual depende de o usuário executar primeiro o dry-run, revisar cada linha/hash e somente então editar os placeholders do helper. O Codex não executou purge nem SQL remoto.

## Minerador — correção do pre-delete de dependências — 2026-08-20

### Verificado no código e no contrato local

- A falha `KEYWORD_DEPENDENCY_AUDIT_FAILED` era causada pelo descriptor ativo de `brand_site_keyword_candidates`. A migration `0004_brand_site_catalog.sql` está preparada, mas a própria documentação da Marca a classifica como não aplicada e sem consumidor remoto canônico confirmado.
- O descriptor legado foi removido somente do catálogo ativo do botão normal `Excluir`. Nenhuma tabela, FK, trigger, `ON DELETE`, migration ou helper administrativo de purge foi alterado.
- As dependências canônicas do Minerador continuam `required`, `current_contract` e `block_on_reference`. Consulta com zero linhas é `clear`; referência encontrada bloqueia; tabela/coluna/permissão/RLS inválida gera `KEYWORD_DEPENDENCY_AUDIT_FAILED` e continua fail-closed.
- O diagnóstico sanitizado agora registra `dependencyKey`, tabela, coluna de referência, código, categoria (`TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `PERMISSION_DENIED`, `RLS_DENIED`, `INVALID_QUERY`, `WRONG_SCHEMA`, `LEGACY_TABLE` ou `OTHER`) e mensagem curta.

### Confirmado por teste

- 13 testes focados passaram em `tests/minerador-keyword-lifecycle.test.mts`, incluindo ausência da fonte legada no catálogo ativo, dependência real bloqueante, falhas de tabela/coluna/permissão/RLS, sanitização e preservação do readback.
- Não houve chamada de provider, operação remota, alteração de schema, migration, FK, trigger, purge ou dados.

### Ainda não verificado

- O smoke autenticado do botão `Excluir` ainda depende de execução manual no ambiente alvo; a existência remota de `brand_site_keyword_candidates` não foi consultada nesta tarefa. Ela não é tratada como dependência ativa porque seu contrato local está explicitamente preparado/não aplicado e sem consumidor canônico confirmado.

## Minerador — camada InfoHint e barra de processos — implementação local — 2026-08-20

### Verificado no código

- Os seis processos do Minerador usam o `InfoHint` compartilhado com glyph visível e ação independente: o glyph não fica dentro do botão nem dispara o handler.
- Vínculo, Resultados, KGR e Status usam glyph explícito na tabela; Volume, CPC, KD, Intenção, Nicho, Funil e Silo/Categoria usam o próprio título como trigger textual sem glyph adicional.
- Descobrir aplica a mesma hierarquia a modo cliente, Enfoque, medições e envio; campos comuns usam triggers textuais e a barra mantém a ação de seleção separada.
- A superfície de cada ação foi compactada com tokens visuais existentes, sem novas cores, tooltip local, alteração de handlers, provider, API, persistência, schema ou workflow.

### Confirmado por teste

- 10 testes focados passaram em `tests/minerador-info-hint.test.mts`, `tests/minerador-bulk-bar-visual.test.mts` e `tests/minerador-discovery-bulk-bar.test.mts`.
- `node scripts/check-visual-system.mjs` passou e `git diff --check` passou.

### Ainda não verificado

- A homologação visual autenticada em 360/768/1024/1440, light/dark mode, foco por teclado, Escape e collision dos tooltips ainda depende do smoke manual no ambiente com sessão.
- `pnpm exec tsc --noEmit` continua bloqueado pelos três `TS1501` preexistentes de `tests/agency-adalba-platform-internal.test.mts`; o lint do workspace mantém erros preexistentes no `minerador-workspace.tsx`, sem erro nos arquivos menores adicionados nesta etapa.

## Plataforma/Minerador — lifecycle global e exclusão canônica — aplicado — 2026-08-20

### Verificado no código e nos artefatos locais

- A regra aprovada substitui a política anterior: keyword não publicada exige confirmação digitada pelo nome exato e recebe hard delete imediato, mesmo com Google Ads, DataForSEO, KGR, análise, DNA, proveniência ou histórico. Dependências próprias são limpas explicitamente em uma única RPC transacional; referências compartilhadas são preservadas e somente seus vínculos são removidos.
- Keyword publicada usa `isPublished` server-side: publicação formal em `site_origin` ou linhagem real até `PublicationRecord` exige evidência técnica e confirmação canônica. `status = 'publicado'`/`published` isolado é somente sinal legado não verificado e não promove publicação. DNA, ArticleDNA, workflow, handoff e métricas não promovem publicação.
- A remoção publicada exige a mesma confirmação digitada, grava tombstone de 24 horas, retira a keyword da grade operacional e disponibiliza painel de recuperação com restauração. O purge exige vencimento e permanece endpoint server-side explícito; não é disparado automaticamente pela UI.
- A confirmação é fornecida pelo componente compartilhado `components/lifecycle/delete-confirmation.tsx`, com impacto curto/recolhível, botão bloqueado até correspondência exata (trim e caixa ignorada), Enter condicionado à correspondência e limpeza do campo ao fechar.
- Homologação visual autenticada do hard delete passou sem mutação: match inválido manteve o botão bloqueado, match válido habilitou, Enter inválido não confirmou, Escape fechou e a reabertura limpou o campo; a modal coube em 360/768/1440px sem overflow horizontal.
- `0047_global_lifecycle_delete_recovery_purge.sql` foi aplicada no projeto canônico após preflight, snapshot/baseline, drift check e gate de migration não aplicada. O post-verifier passou com `structural_failures = 0` antes da limpeza; o rollback permanece somente local. Artefatos editoriais imutáveis, hashes, anotações, eventos append-only e `PublicationRecord` permanecem fora das exclusões.
- Consultas operacionais do Minerador, Arquiteto e consumidores de qualificação/medição ignoram tombstones; o endpoint editorial downstream por ID continua podendo ler referências publicadas preservadas.

### Confirmado por teste

- 39 testes focados do lifecycle, cleanup administrativo e regressões passaram em `tests/global-lifecycle.test.mts`, `tests/minerador-keyword-lifecycle.test.mts`, `tests/minerador-keyword-delete-lifecycle-v2.test.mts`, `tests/minerador-keyword-delete.test.mts` e `tests/minerador-test-data-purge.test.mts`.
- Nenhuma chamada paga de IA/provider foi executada. A limpeza remota posterior usou somente a allowlist UUID do `docs/compartilhado/0047-test-cleanup-plan-2026-08-20.md`: três raízes e dependências próprias foram removidas; dois ArticleDNA canônicos permaneceram; zero `PublicationRecord` foi tocado.

### Ainda não verificado

- A variante visual recuperável ainda aguarda uma keyword com publicação formal elegível no ambiente; restore real, purge após vencimento e o pipeline novo completo pelas seis áreas ainda não foram executados. A validação local não substitui prova manual de interface nem novo fluxo end-to-end.

## Minerador — respiro horizontal das barras superiores do Descobrir — implementação local — 2026-08-20

### Verificado no código

- `DiscoverySearchRow` e `DiscoveryFilterRow` receberam somente padding horizontal responsivo (`px-3 sm:px-4 xl:px-6`) nos próprios wrappers superiores.
- O inset cria separação visual da sidebar e reduz a sobra útil à direita, mantendo a distribuição existente de País, Estados/UF, Moeda e CTA sem alterar o total da página.
- A planilha, seus headers, colunas, ordenação, InfoHints e handlers permanecem fora do ajuste.

### Confirmado por teste

- Teste focado de espaçamento cobre os dois wrappers, ausência de overflow no wrapper e preservação dos handlers/tabela.

### Ainda não verificado

- Homologação visual autenticada em 360/768/1024/1440, nos temas claro/escuro e com confirmação manual de overflow permanece pendente.

## Minerador — integridade de intenção, nicho, funil e confirmação humana — implementação local — 2026-08-20

### Diagnóstico confirmado no código

- Para `manicure e pedicure a domicilio`, o motor lógico anterior não reconhecia `a` como marcador relacional, não tratava `a domicilio` como sinal local e não incluía `manicure`/`pedicure` no catálogo de nichos. A entidade absorvia o modificador, a intenção local não era proposta e o nicho caía em `Geral`, que o read-model não apresenta como nicho canônico.
- O caminho de Processar Lógica já executava a derivação, qualificação do Funil, persistência tenantizada e leitura canônica; a ausência era produzida antes da persistência, não por troca de consumidor entre tabela e KeywordDNA.
- O gate anterior aceitava o marcador `dna_revisao_humana = aprovado` mesmo quando ainda havia divergências, enriquecimentos ou campos estratégicos sem evidência. Isso permitia o estado observado de `Revisão concluída`/`Aprovado` sem uma confirmação coerente.

### Implementado localmente

- O engine reconhece `a domicilio`/`em domicilio`/`atendimento domiciliar` como evidência local, separa `a domicilio` como modificador e detecta `manicure`/`pedicure` no nicho `Estética`. A qualificação atual do exemplo produz intenção `Local`, entidade `manicure pedicure`, modificador `a domicilio` e Funil `BOFU`.
- `canCompleteHumanReview`, `completeHumanReview` e `isHumanReviewConfirmationValid` agora exigem divergências e enriquecimentos tratados, aplicabilidade do KGR tratada quando calculável e confirmação explícita de Intenção/Nicho/Funil quando não houver evidência. `Confirmar desconhecido` registra a decisão sem criar valor.
- A Revisão Humana apresenta exceções sintéticas para campos estratégicos sem evidência e não aceita IA/enriquecimentos silenciosamente. O gate do status final usa a confirmação válida, e não apenas o marcador legado.
- DataForSEO, Google Ads, KGR, R5, APIs, provider, schema e migrations não foram alterados.

### Confirmado por teste

- `tests/minerador-logical-processor.test.mts`: 10/10.
- `tests/minerador-human-review.test.mts`: 11/11.
- `tests/minerador-keyword-read-model.test.mts`: 4/4.
- Regressões de freshness/revalidação: 8/8 e 4/4; R5.2 com loader de aliases: 4/4.
- `node scripts/check-visual-system.mjs`: PASS; `git diff --check`: PASS.

### Ainda não verificado

- Não houve nesta passada smoke autenticado da keyword real, persistência/readback remoto, execução paga de Google Ads/DataForSEO/IA, screenshot ou homologação visual manual. O cenário foi reproduzido por engine, read-model, testes focados e inspeção do caminho de persistência.
- `pnpm exec tsc --noEmit` e `next build` chegam à compilação, mas permanecem bloqueados pelos três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts`. O teste estático `minerador-semantic-review` também mantém uma asserção antiga que procura literalmente `aria-label="IA"` no workspace, embora o atributo seja renderizado pelo componente compartilhado a partir de `ariaLabel="IA"`; essa falha não é causada pelo gate lógico desta correção. O lint amplo mantém débitos preexistentes no workspace.

## Minerador — consistência canônica, completude do KeywordDNA e revisão reaberta — implementação local — 2026-08-20

### Verificado no código

- `lib/minerador/canonical-keyword-snapshot.ts` concentra a projeção de Resultado, Volume, KGR, CPC, KD, intenção canônica, intenção externa, Nicho, Funil, revisão humana, maturidade, status e vínculo.
- A tabela, o Perfil, a Revisão Humana e a Decisão passaram a ler esse snapshot; o score KGR não é escondido quando a aplicabilidade é `Não aplicável`.
- `lib/minerador/logical-read-model.ts` distingue campo resolvido, indeterminado confirmado e campo ainda não resolvido. O estado externo do DataForSEO não substitui a intenção canônica.
- `lib/minerador/human-review.ts` invalida a confirmação ao editar e suporta reabertura/cancelamento. O workspace mantém a revisão aberta em cópia de trabalho, sem chamada a provider; as medições e o score continuam somente leitura.
- A tabela mantém Intenção, Nicho e Funil como projeções informativas; somente Silo/Categoria e Status continuam editáveis na linha.
- Nenhuma migration, alteração de schema, provider, API ou persistência estrutural foi criada nesta implementação.

### Confirmado por teste

- Snapshot canônico, KGR, estados de completude e invalidação/reabertura: 4/4 em `tests/minerador-canonical-keyword-snapshot.test.mts`.
- Revisão humana e gates existentes: 11/11 em `tests/minerador-human-review.test.mts`.
- Read-model, revalidação/freshness, decisão, tabela, layout, infraestrutura e reabertura da revisão: 42/42 no conjunto focado executado, incluindo `tests/minerador-canonical-review-ui.test.mts`.
- Lint focado dos arquivos centrais e `node scripts/check-visual-system.mjs`: PASS. `git diff --check`: PASS.

### Ainda não verificado

- Falta smoke autenticado com uma keyword nova e dados reais, incluindo reload/readback, comparação entre tabela/Perfil/Revisão/Decisão e reabertura/cancelamento sem provider.
- A validação local não comprova nova medição Google Ads/DataForSEO/IA nem homologação visual autenticada. O lint amplo do workspace continua com débitos anteriores em `minerador-workspace.tsx`; o `tsc` global continua com os três `TS1501` preexistentes documentados acima.

## Plataforma — ajuda contextual global Fase 1 — implementação local — 2026-08-20

### Verificado no código

- O `GlobalTopbar` resolve a área pelo `brandRef` tenantizado validado e pelo
  segmento canônico do módulo; a raiz da marca resolve para Marca. Admin,
  Conta/Perfil, autenticação, seleção de contexto, agência e rotas públicas
  permanecem sem trigger.
- `ContextHelpCenter` é compartilhado e abre um drawer fixo por portal no
  `document.body`, com busca local, detalhe, retorno, Escape, trap de foco e
  retorno ao trigger. A camada usa somente tokens visuais existentes.
- O contrato tipado está em `lib/context-help.ts`; o registry não cria fallback
  entre módulos. O único conteúdo real desta fase é o piloto do Minerador em
  `modules/minerador/context-help.ts`, com os sete tópicos autorizados.
- Não houve alteração em InfoHint, InlineLabelCluster, handlers do Minerador,
  APIs, IA, providers, Supabase, schema, migration ou persistência.

### Confirmado por teste e validação manual

- Cinco testes estáticos do contrato e da composição passaram em
  `tests/context-help.test.mts`; guard visual direcionado passou para os cinco
  arquivos novos/consumidores; `test:visual-system` passou com 20/20.
- Sessão autenticada local validou abertura, busca com normalização, detalhe,
  retorno, Escape, foco, hover do InfoHint, ausência de nested button, Marca
  sem conteúdo/fallback e ausência do trigger em Conta/Admin.
- O drawer foi validado em 360, 768, 1024 e 1440px: largura total no mobile,
  384px no desktop, reposicionamento pela viewport e zero overflow horizontal.

### Ainda não verificado

- Conteúdo definitivo das demais seis áreas ainda não foi publicado; elas
  mostram estado explícito de ajuda indisponível.
- Não foi feita homologação manual equivalente em light mode porque a sessão
  disponível permaneceu no tema escuro e não há alternador de tema exposto
  nesta superfície.
- O `tsc` global continua bloqueado pelos três `TS1501` preexistentes em
  `tests/agency-adalba-platform-internal.test.mts`; o lint direcionado da nova
  implementação passou, com somente os dois avisos prévios de `<img>` no
  `GlobalTopbar`.

## Minerador — preset protegido das colunas das tabelas — implementação local — 2026-08-20

### Verificado no código

- Descobrir e Processar mantêm `Resultados` e `Volume` com presets de `128px`
  e `120px`, mínimos de `115px` e `105px`, e prioridade protegida na projeção
  responsiva.
- A projeção responsiva reduz primeiro keyword, Silo/Categoria e demais
  colunas flexíveis/auxiliares; quando o espaço é insuficiente, a tabela pode
  rolar horizontalmente sem colapsar os headers protegidos.
- Headers de `Resultados` e `Volume` usam uma linha sem quebra, preservando o
  InfoHint, a ordenação e o handle de resize. O resize manual existente foi
  preservado e continua limitado pelos mínimos canônicos.
- Não há persistência de largura existente; F5 retorna ao preset inicial novo.
  Não houve mudança de dados, handlers funcionais, backend, API, provider,
  schema ou migration.

### Confirmado por teste

- O conjunto focado das tabelas, responsividade e infraestrutura passou com
  28/28 testes, incluindo a função pura que protege Resultados/Volume.
- `node scripts/check-visual-system.mjs`: PASS.
- `git diff --check`: PASS.

### Ainda não verificado

- Falta screenshot autenticado/manual em 1024, 1440 e 1920px, com F5 e
  redimensionamento manual, para confirmar visualmente colisão de InfoHint e
  acabamento nos temas disponíveis.

## Minerador — contrato rígido de processamento, estados e R5 Phase 2 — implementação local — 2026-08-20

### Verificado no código

- A conclusão das etapas passa por `resolveMineradorProcessState()`, que
  separa tentativa de execução e estado do artefato, e é consumida pela barra,
  tabela e KeywordDNA.
- Lógica, Volume, Resultados, IA e Revisão promovem a projeção local somente
  depois de validação e readback canônico; Resultados e Volume conferem o
  `measuredAt` retornado pela operação com a medição lida novamente.
- Falhas preservam os dados anteriores no registro e impedem o check verde na
  tentativa corrente. KGR permanece automático e depende de Volume e Resultado
  atuais válidos; zero real continua válido.
- IA exige as três fases, parse/schema, persistência, readback e `inputHash`
  atual. Revisão humana fica vinculada ao hash da IA e deixa de ser atual quando
  uma nova revisão semântica material é executada.
- Phase 2 usa saída compacta validada em no máximo três itens de até 160
  caracteres por lista, teto de 1100 tokens, raciocínio desabilitado nesta
  operação e uma única repetição controlada para truncamento DeepSeek em ação
  explícita do usuário. Não foi criado fallback de provider/modelo.

### Confirmado por teste

- Testes focados de estado/processamento, lógica, revisão humana e R5.2:
  35/35 passaram, incluindo a repetição única da Phase 2 após truncamento.
- O teste de estado cobre leitura lógica atual, Volume atual com zero válido,
  Resultado atual com zero válido, KGR automático e falha que preserva artefato
  anterior sem conclusão verde.
- TypeScript não apresentou erro novo; permanece o bloqueio global conhecido
  de três `TS1501` em `tests/agency-adalba-platform-internal.test.mts`.
- O guard do sistema visual passou. Nenhuma migration, schema, provider,
  connection ou modelo foi alterado.

### Ainda não verificado

- Não foi executado smoke autenticado com chamada paga real do DeepSeek/DataForSEO/Google Ads.
- Ainda falta confirmar em navegador o retry da Phase 2, o readback real e o
  comportamento de falha com dados anteriores em uma keyword real.
- O estado de tentativa é local enquanto os contratos persistidos existentes
  não distinguem uma falha após reload de um snapshot anterior; não foi criada
  migration para preencher essa lacuna.

## Minerador — rollout de conteúdo da ajuda contextual — implementação local — 2026-08-20

### Verificado no código

- O catálogo local em `modules/minerador/context-help.ts` foi ampliado com
  orientação em português para visão geral, Descobrir, Processar, Perfil da
  Keyword e Revisão/Decisão.
- Os IDs existentes de Sobre, Conferir site, Lógica, Volume, Resultados, IA
  e Revisão Humana foram preservados; aliases de busca cobrem Resultado,
  allintitle, Google Ads, DataForSEO, KGR, KD, KeywordDNA e os controles da
  Descoberta.
- O conteúdo explica o contrato atual: dados importados não validam etapa,
  zero não é ausência, a intenção externa não substitui a intenção canônica,
  KGR é automático e IA não substitui a decisão humana.
- A implementação usa exclusivamente o contrato local existente. Não houve
  alteração em `ContextHelpCenter`, `GlobalTopbar`, registry compartilhado,
  InfoHint, navegação, handlers, APIs, providers, schema, migration ou
  persistência.

### Confirmado por teste

- `tests/context-help.test.mts`: 5/5 testes passaram, incluindo catálogo,
  IDs únicos, resumos curtos, aliases de busca e ausência de chamadas de
  provider no conteúdo.
- `node scripts/check-visual-system.mjs`: PASS.
- `git diff --check`: sem erros de whitespace; o Git apenas reportou avisos
  preexistentes de conversão LF/CRLF do checkout.
- ESLint direcionado não encontrou erro no catálogo; o arquivo de teste é
  ignorado pela configuração atual do lint.

### Limitação explícita

- O contrato compartilhado atual resolve ajuda por área (`Minerador`), não por
  aba (`Descobrir` versus `Processar`). Como o rollout não autoriza mudança na
  infraestrutura global, os grupos permanecem no catálogo local do Minerador e
  são encontrados por ordem e busca; não foi criado filtro de rota/tab novo.

### Ainda não verificado

- Falta homologação visual autenticada do conteúdo no drawer em Descobrir e
  Processar, nos viewports 360/768/1024/1440 e nos temas disponíveis.

## Minerador — R5 Phase 3: alinhamento de schema e reparo único — implementação local — 2026-08-20

### Verificado no código

- O schema canônico da Phase 3 permanece em
  `lib/minerador/semantic-review-phases.ts`:
  `reviewStatus`, `overallVerdict`, `divergences`, `enrichments`,
  `remainingAmbiguities` e `humanReviewNotes`.
- O prompt da Phase 3 agora descreve exatamente os objetos exigidos:
  `divergences[]` exige `field`, `suggestion`, `rationale` e `evidenceUsed`;
  `enrichments[]` exige `type`, `value` e `rationale`. O exemplo mínimo é
  derivado do mesmo arquivo do schema.
- Após JSON válido com falha de schema, uma ação IA explicitamente iniciada
  pode executar somente `repair_1` da Phase 3. O reparo recebe o JSON anterior,
  issues sanitizados e o formato obrigatório; não refaz Phase 1 ou Phase 2.
- Truncamento, JSON inválido e execução sem ação explícita não entram no
  reparo de schema. O limite normal da Phase 3 permanece 600 tokens.
- O diagnóstico sanitizado preserva paths/issues e acrescenta `responseShape`
  com chaves de topo, tipo de arrays e tipos dos itens, sem registrar o output
  completo em telemetria. Usage registra fase, tentativa, modelo, tokens e
  `attemptLabel = repair_1`.
- A saída reparada continua sendo expandida pelo contrato existente de
  `fieldReviews`/`enrichmentDetails`, preservando a compatibilidade com R6/R6.1
  e a revisão humana.

### Confirmado por teste

- Testes focados R5/R5.2/R6: 20/20 passaram com fixtures, incluindo primeira
  resposta válida, schema inválido reparado, reparo inválido, ausência de ação
  explícita e truncamento sem reparo.
- Lint direcionado: sem erros; permanecem apenas dois avisos prévios de
  parâmetros não usados em `thinkingModeForPhase`.
- `node scripts/check-visual-system.mjs`: PASS.
- `git diff --check`: sem erros de whitespace.

### Ainda não verificado

- O caso real `manicure proximo a mim` ainda depende de smoke autenticado com
  DeepSeek configurado. Nenhuma chamada paga foi feita nesta implementação.

## Minerador — convergência do pipeline e envelope de confiabilidade R5 — implementação local — 2026-08-20

### Verificado no código

- As três fases da revisão R5 usam `executeR5PhaseWithReliability()` com uma
  chamada inicial e, somente em ação explícita DeepSeek, no máximo uma
  recuperação da própria fase (`MAX_CALLS_PER_PHASE = 2`). Phase 1 e Phase 2
  usam teto local de 1100 tokens; Phase 3 permanece em 600.
- Phase 1 foi compactada para divergências, enriquecimentos e ambiguidades
  limitados a três itens, com textos curtos. Truncamento repete apenas a fase
  atual; o reparo estrutural único da Phase 3 continua separado e não reinicia
  Phase 1 ou Phase 2.
- O Processo Lógico grava e valida `logical_output_contract` versão `r1` no
  JSONB semântico existente. O contrato cobre os campos estratégicos e os
  demais campos lógicos do KeywordDNA, registrando valor ou estado explícito
  (`explicit_unknown`, `ambiguous`, `pending`).
- `Lógica ✓` e os gates consumidores exigem contrato completo, metadados atuais,
  persistência e readback. Uma falha de reprocessamento preserva o artefato
  anterior e não produz conclusão verde.
- Execuções de Conferir site, Lógica, Volume, Resultados, IA e Revisar carregam
  `executionRequestId` nos attempts, progresso, notices e diagnóstico R5. O sucesso da IA só é
  publicado depois das três fases, persistência do resultado final e readback
  com `inputHash` atual.

### Confirmado por teste

- Envelope R5: 8/8 testes, incluindo truncamento da Phase 1, truncamento da
  Phase 2, reparo de schema da Phase 3, tentativa inválida sem ação explícita
  e ausência de reinício das fases já válidas.
- DeepSeek/R5 e semantic review: 13/13 testes.
- Lógica, read-model canônico, freshness, maturidade, snapshot e handoff:
  24/24 testes; o contrato verifica todos os campos lógicos declarados.
- Nenhum teste executou provider pago ou alterou schema/migration.

### Ainda não verificado

- Falta smoke autenticado real com DeepSeek e reload/readback remoto para
  confirmar o comportamento com os dados atuais da marca.
- Falta homologação manual no navegador do retry visível, dos notices
  correlacionados e da ausência de check verde após falha real.

## Minerador — Funil lógico resolvido e ajuda contextual — implementação local — 2026-08-20

### Verificado no código

- O Processo Lógico não promove mais `Pendente` como classificação final de
  Funil. Sinais de ação/localidade resolvem `BOFU`, sinais de comparação e
  consideração resolvem `MOFU`, e termos amplos reconhecíveis sem sinal mais
  forte resolvem `TOFU` mesmo quando a Intenção permanece ambígua.
- Quando não há entidade ou sinal semântico reconhecível, o contrato lógico
  existente registra `explicit_unknown`; o read-model comum apresenta
  `Indefinido`. O estado `Pendente` continua reservado a contrato ou
  processamento incompleto.
- Tabela, Perfil, Revisão e Decisão continuam consumindo o mesmo Funil
  canônico. O cabeçalho Funil agora usa o `InfoHint` compartilhado com a
  explicação de TOFU, MOFU e BOFU.
- O tópico `processar-funil` do ContextHelp foi ampliado com definições,
  exemplos e a distinção entre Intenção e Funil.

### Confirmado por teste

- 56 testes focados passaram, cobrindo termos amplos/ambíguos, comparação,
  preço, busca local, desconhecido explícito, contrato, read-model, InfoHint
  visível e ContextHelp.
- Lint direcionado dos arquivos de produção alterados passou.
- Nenhum provider, API, schema, migration ou persistência foi alterado.

### Ainda não verificado

- Falta homologação visual autenticada no navegador em 360/768/1024/1440px,
  nos temas disponíveis, conferindo tooltip do cabeçalho e o Perfil de uma
  keyword com Funil `Indefinido`.

## Minerador — Funil: InfoHint visível e label de apresentação — 2026-08-21

### Verificado no código

- O header `Funil` reutiliza o `InfoHint` global com o título `Etapa provável
  da jornada` e explicação de TOFU, MOFU e BOFU. O clique do glyph interrompe a
  propagação e não participa de ordenação; o header não ganhou handler novo.
- O read-model mantém o estado técnico e apresenta `Indefinido` quando o
  contrato lógico está completo, mas registra `explicit_unknown` para Funil.
  `Pendente` permanece reservado a processamento ou decisão incompleta.
- O ContextHelp usa o tópico `Entender TOFU, MOFU e BOFU`, com explicações,
  exemplos, a distinção entre Intenção e Funil e aliases para Funil, TOFU,
  MOFU, BOFU, topo/meio/fundo do funil, jornada e Indefinido.
- Nenhum enum, schema, persistência, provider ou mecanismo de ordenação foi
  alterado.

### Confirmado por teste

- 31 testes focados passaram cobrindo InfoHint, ContextHelp, read-model,
  apresentação de `Indefinido` e layout da tabela.
- Lint direcionado e o guard do sistema visual passaram.

### Ainda não verificado

- Falta homologação visual autenticada nos breakpoints 360/768/1024/1440px e
  nos temas claro/escuro.

## Minerador — R5 como revisora semântica acionável — 2026-08-21

### Verificado no código

- A IA continua sendo uma segunda leitura crítica do KeywordDNA: pode propor
  divergências e enriquecimentos semânticos, mas não aplica mudanças nem
  substitui a leitura determinística ou a decisão humana.
- A normalização do R5 aceita somente campos semânticos revisáveis. Volume,
  Resultado, CPC, KD, KGR, tendência, concorrência, backlinks, targeting,
  timestamps, URL, canonical e `brandId` permanecem evidências imutáveis.
- Divergências iguais ao valor lógico atual, sugestões de `Pendente` para
  Funil, repetições, fatos medidos e frases genéricas são descartados de forma
  determinística. Enriquecimentos úteis ficam limitados a três itens e não
  recebem uma chamada adicional de IA.
- A Revisão Humana prioriza correções acionáveis e enriquecimentos úteis; as
  concordâncias ficam compactadas em uma seção recolhida. Valores de evidência
  aparecem com rótulos humanos, enquanto caminhos técnicos permanecem na
  proveniência. `Não classificável` é apresentado como `Indefinido` quando o
  funil já foi processado sem evidência classificável.
- O fluxo R5/R6, reabertura da revisão, gates KGR e persistência/readback foram
  preservados. Nenhum provider, modelo, orçamento, API, schema, migration ou
  dado medido foi alterado.

### Confirmado por teste

- 36 testes focados passaram cobrindo as três fases R5, normalização acionável,
  filtragem de enriquecimentos, preservação dos fatos quantitativos, revisão
  humana, InfoHint e gates existentes.
- Lint direcionado dos arquivos de produção alterados e o guard do sistema
  visual passaram.

### Ainda não verificado

- Falta smoke autenticado real com DeepSeek e readback remoto, sem executar
  provider pago durante os testes locais.
- Falta homologação visual manual em 360/768/1024/1440px e nos temas
  disponíveis. A suíte ampla ainda contém expectativas estáticas antigas de
  layout em `minerador-keyword-profile-bento.test.mts` e
  `minerador-final-workbench.test.mts`.

## Minerador — SDD R6: artefatos independentes e freshness — 2026-08-24

### Verificado no código

- Foi criada a auditoria estrutural/SDD
  [`sdd-r6-process-state-freshness-independent-artifacts-2026-08-24.md`](propostas/sdd-r6-process-state-freshness-independent-artifacts-2026-08-24.md).
- O read-model atual separa logic, volume, results, KGR, IA e revisão na
  apresentação, mas usa contratos específicos por domínio; a tentativa de
  execução permanece em estado React local e não constitui um ledger
  persistido por processo.
- Lógica já possui versão, timestamp, hash de entrada e contrato de saída.
  Volume/Resultados possuem measurements, timestamps, provider, operação e
  histórico, mas ainda não um envelope comum de hash/versionamento. IA usa
  `inputHash`; a Revisão Humana depende do hash da IA atual.
- O SDD registra a matriz de efeitos de reprocessamento, a preservação de
  artefatos stale, o acoplamento atual do KGR às tentativas locais e o gate de
  conclusão humana ainda bloqueado por pendências.

### Ainda não implementado

- Nenhuma alteração de código, schema, migration, provider, API ou banco foi
  feita por esta etapa.
- A conclusão humana com defaults explícitos (`keep_logic`, `ignore`,
  `confirm_unknown`) continua sendo proposta e aguarda aprovação do SDD.
- O envelope comum de artefato/tentativa/freshness e os hashes faltantes
  aguardam uma etapa de implementação aprovada.

## Minerador — consolidação documental após validação manual do Perfil — 2026-08-28

### IMPLEMENTED

- O Perfil da Keyword usa composição front-end responsiva com a primeira linha `Leitura Lógica (25%) + Google Ads (25%) + Qualificação Semântica (50%)` e a segunda `Revisão Humana (50%) + Decisão (50%)` em desktop.
- Qualificação Semântica funciona como cópia de trabalho/front-first: mantém Intenção e Funil como eixos separados, mostra Lógica e SERP visualmente como fontes distintas e não apresenta a IA como um terceiro voto para esses eixos.
- O card visual independente de DataForSEO foi removido do Perfil. Resultado, KD, KGR, referring domains, backlinks e demais fatos suportados continuam disponíveis na síntese de Decisão e/ou na proveniência.
- A proveniência técnica deixou de ocupar um card principal e permanece em acordeão fechado dentro de Decisão. Revisão Humana, defaults de conclusão e controles existentes foram preservados.

### TESTED

- Teste focado de cópia de trabalho semântica: 7/7 passaram.
- ESLint direcionado de `dna-panels.tsx` e `semantic-consolidation-draft.ts`: passou.
- Guard do sistema visual: passou (242 arquivos, zero roxo, baseline 714).
- `git diff --check` direcionado ao painel: passou.
- A suíte visual ampla teve uma falha preexistente e não relacionada no teste estático da GlobalTopbar do Arquiteto; não foi usada como prova deste Perfil.

### MANUAL UI VALIDATION

- **PASS — confirmado pelo usuário no navegador autenticado.** A confirmação foi registrada nesta consolidação documental e não foi reexecutada por esta tarefa.

### PENDING

- Não existe ainda SERP semântica real de qualificação individual no Minerador; o preview local não chama DataForSEO nem fecha Intenção/Funil canônicos.
- Não existe `KeywordDNA` consolidado, persistido, imutável e versionado com readback remoto para este contrato.
- O handoff real ao Arquiteto ainda não exige nem entrega essa versão consolidada; o consumo upstream definitivo permanece pendente.
- O contexto de marca/voz e a apresentação contextual por IA foram implementados localmente como camada não canônica. A homologação real permanece pendente e nenhuma dessas frentes ganha autoridade para definir Intenção/Funil.

## Minerador — primeiro consumo de Brand Skill por IA: apresentação contextual — 2026-08-28

### IMPLEMENTADO LOCALMENTE

- A ação explícita do Perfil da Keyword chama a rota de Apresentação Contextual e recebe uma saída não canônica, curta e somente informativa.
- O prompt reúne a KeywordDNA atual em projeção somente leitura, o BrandDNA aprovado compacto quando existir e a `brand_voice` corrente válida da própria `brandId`.
- Intenção, Funil, Nicho, medições, evidências e identidade permanecem autoridades externas/canônicas; a IA não altera nem aprova KeywordDNA, artigo, ContentPlan, SERP ou KGR.
- A proveniência inclui `inputKeywordDnaRef` e `appliedSkillRefs` com `definitionKey`, versão e hash. A saída permanece `persisted: false` como working copy.
- Sem `brand_voice` corrente válida, a rota continua não bloqueante e retorna apresentação neutra com `brandVoiceApplied: false`; `draft`, `pending_approval` e `active` entram quando são a versão corrente, enquanto `archived`/`superseded` não entram.
- O painel mostra “IA · Apresentação contextual”, a indicação de Voz da Marca quando aplicada e a nota de que o texto se baseia nos dados atuais e no contexto persistido da Marca; BrandDNA ausente permanece uma lacuna separada.

### VALIDADO

- 11 testes A–K do primeiro consumo passaram; a regressão combinada de Brand Skills/contexto passou com 50 testes.
- Não foram executados providers, chamadas Google Ads/DataForSEO/OpenRouter, escritas remotas, migrations ou alterações de schema.

### PENDENTE

- Smoke autenticado real com uma keyword da Care Glow e revisão humana do texto produzido ainda não foi executado; portanto a validação visual/manual e a homologação de provider permanecem abertas.

## Minerador — IA = Apresentação Contextual: estado consolidado — 2026-08-28

Esta seção substitui a consolidação parcial anterior desta frente e registra o estado congelado após os smokes reais e a estabilização de reliability.

### IMPLEMENTED

- **Papel canônico**: a IA do Minerador é a **Apresentação Contextual**. Entrada = keyword/tema + contexto disponível da Marca + Voz da Marca disponível/versionada + BrandDNA aprovado quando existir + demais contextos autorizados quando disponíveis. Saída = `ContextualPresentation { text }`, um texto compacto de orientação editorial — **não** é artigo, post, roteiro, ContentPlan nem ContentDocument.
- **Autoridade**: `AI_INTENT_AUTHORITY = NONE`, `AI_FUNNEL_AUTHORITY = NONE`, `AI_SERP_AUTHORITY = NONE`, `AI_KGR_AUTHORITY = NONE`, `AI_STATUS_AUTHORITY = NONE`. A IA não altera o KeywordDNA e não produz concordâncias R5, comparação Lógica × IA, divergências de Intenção/Funil nem enrichments R5 como fluxo operacional. O R5 antigo permanece **legado/histórico, sem gatilho operacional**.
- **Gatilho**: `AI_TRIGGER_COUNT = 1` — o botão IA da barra de processos. `PANEL_AI_TRIGGER_COUNT = 0`: o painel de Revisão Humana apenas exibe a working copy. Nenhuma chamada em mount, F5, abertura de painel ou testes.
- **Voz da Marca**: disponível por mesma `brandId`, versão corrente por `definitionKey`, conteúdo válido e status diferente de `archived`/`superseded`. `draft`, `pending_approval` e `active` podem ser consumidos pela IA. `consumerModules` é metadata de recomendação, **não autorização**. "Disponível" não é sinônimo de "aprovada".
- **Proveniência**: a execução recebe `appliedSkillRefs` com `definitionKey`, `versionId`, `versionNumber`, `contentHash` e `lifecycleStatus`, identificando exatamente a versão da Voz da Marca utilizada. A referência ainda não é persistida junto de uma apresentação porque a saída é working copy.
- **BrandDNA**: carregado pelo resolver canônico quando existir. Ausência vira lacuna declarada, **não** impede o uso da Voz da Marca e **não** autoriza fallback para `marcas.dna_diretrizes`.
- **Insumos excluídos**: Volume, Resultados, KD, KGR, Intenção, Funil, SERP e status editorial não entram como insumo editorial da apresentação. Esses fatos seguem existindo nos seus próprios contratos. A IA responde "Como esta Marca deve apresentar este tema?", não "Como esta keyword performa em SEO?".
- **Transporte**: o provider responde em **texto puro** e a aplicação monta `ContextualPresentation { text }`; não se exige JSON do modelo para transportar uma única string. O DeepSeek canônico continua sendo o provider.
- **Recovery**: `MAX_PROVIDER_ATTEMPTS_PER_OPERATION = 2`. A tentativa 1 retorna em caso de sucesso; havendo erro recuperável `AI_PROVIDER_INVALID_RESPONSE` por conteúdo vazio/inutilizável, executa-se **uma única** nova tentativa. Falhando a segunda, o erro é sanitizado. Não há retry para auth, permission, configuração, tenant, carga de Skill, contexto de Marca, request inválido ou demais falhas não recuperáveis.
- **Accounting**: uma ação humana = **um** `operationRequestId`, com 1 ou 2 provider attempts, registrados em um evento de usage correlacionado cujas `units` refletem o número real de tentativas. Um retry nunca é registrado como nova operação humana.
- **Copy final do painel**: "Baseada no tema da keyword e no contexto disponível da Marca. O KeywordDNA permanece inalterado."

### TESTED

- Regressões automatizadas por fixture, sem provider (`REAL_PROVIDER_CALLS_IN_TESTS = 0`): gatilho único e ausência de gatilho no painel; contrato de texto puro com wrapper `{ text }`; prompt com Markdown canônico da Voz e sem dado operacional de SEO; isolamento Brand A/B; BrandDNA ausente sem bloquear a Voz; proveniência de versão; preservação da working copy em falha; recovery de 1 retry e não-retry de erros não recuperáveis; accounting por tentativas reais; ausência de chamadas em mount/F5; semântica de lifecycle e copy do rodapé.
- Nenhuma escrita remota, migration ou alteração de schema em testes.

### MANUAL SMOKE

- **PASS — Care Glow real, navegador autenticado, múltiplas keywords**: `skin care noturno`, `retinol principia antes e depois` e `mascara skin care`.
- Resultado: `VOICE_SKILL_RUNTIME = PASS`, `VOICE_SKILL_GENERALIZATION = PASS`, `CONTEXTUAL_PRESENTATION_QUALITY = PASS`, `BRAND_SPECIFICITY = PASS`, `THEME_ADAPTATION = PASS`. As saídas aplicaram a Voz da Care Glow, adaptaram o enquadramento a cada tema, não foram genéricas, não decidiram Intenção/Funil, não mencionaram Volume/KGR/SERP e não alteraram o KeywordDNA.
- Smoke real é evidência humana no navegador autenticado e **não** se confunde com as regressões automatizadas acima.

### LIMITATIONS

- `PERSISTED = NO`: a apresentação é gerada na sessão como working copy. Reexecução com sucesso substitui a working copy; reexecução com falha preserva a anterior; F5 a descarta. Esse é o comportamento esperado desta fase.
- Diagnóstico real de reliability observado em runtime — `executionRequestId 2f9b2e40-5f73-4fdc-a19d-d5b9833c28c0`: HTTP 200, `finishReason = length`, `contentPresent = false`, `contentLength = 0`, `reasoningPresent = true`, `model = deepseek-v4-pro`, `thinkingMode = provider_default`. Classificação: **TRUNCATED / REASONING_ONLY** — o reasoning consumiu o completion budget antes de existir content utilizável. Não é falha aleatória/transitória do provider. `TRUNCATED_EMPTY_CONTENT_RECOVERY = YES`.
- A proveniência da Voz da Marca existe em memória e na resposta, mas não é persistida junto de um artefato de apresentação.

### PENDING

- Persistência e versionamento da Apresentação Contextual: `REQUIRES_SDD`. Working copy **não** é persistência.
- BrandDNA aprovado da Care Glow ainda não existe; hoje é lacuna declarada no contexto.
- Loader canônico server-side de materiais aprovados da Marca ainda não existe.
- SERP real da Qualificação Semântica continua pendente; Intenção/Funil seguem aguardando evidência externa.

## Minerador — Resultados + SERP real: ajustes pré-smoke — 2026-08-28

### IMPLEMENTED

- **Gatilho único**: o processo **Resultados** dispara, por keyword, no máximo **três** chamadas técnicas DataForSEO — CALL 1 `allintitle` (Resultado/KGR), CALL 2 Keyword Overview (KD e sinais Labs), CALL 3 SERP orgânica da **keyword natural** (evidência semântica). Não existe botão próprio de SERP.
- **Independência pós-preflight**: depois do preflight comum (sessão, tenant, config canônica, targeting), as três finalidades são independentes. `CALL1_FAILURE_BLOCKS_CALL3 = NO`: a falha da medição allintitle não impede a coleta da SERP natural, a falha do Keyword Overview preserva allintitle e SERP, e a falha da SERP preserva Resultado, KD e KGR. Cada caminho coleta a SERP **uma única vez**.
- **Accounting**: uma ação humana = um `operationRequestId` = um evento de usage por alvo, com custo somado das chamadas técnicas efetivamente executadas e `providerReference` concatenando os request ids reais — inclusive no alvo que falhou no allintitle mas coletou a SERP.
- **Rótulo do Labs**: `main_intent` do DataForSEO Labs é exibido como **"Sinal DataForSEO Labs"** no Perfil e no resumo de decisão. Não é Intenção canônica e não é evidência de SERP.

### THRESHOLDS DA EVIDÊNCIA

- `EVIDENCE_THRESHOLDS_SOURCE = criado nesta implementação` (não vem de spec, de norma DataForSEO nem de estudo citável).
- `EVIDENCE_THRESHOLDS_STATUS = PROVISIONAL_HEURISTIC`. Valores atuais em `lib/minerador/serp-semantic-evidence.ts`: `CONCLUSIVE_SHARE = 0.6`, `MIXED_SHARE = 0.4`, `MINIMUM_OBSERVED = 5`.
- Por serem heurística provisória, **não** foram consolidados na spec; ficam cobertos por teste e sujeitos a revisão após smoke real.

### GATE CONSERVADOR DA EVIDÊNCIA SERP

Auditoria de 2026-08-28 mostrou que "os gates não leem a working copy" **não** significava bloqueio: antes desta correção, aprovação e handoff simplesmente **não exigiam** SERP alguma. Estado anterior medido: `CURRENT_APPROVAL_GATE_REQUIRES_CANONICAL_SERP = NO`, `CURRENT_HANDOFF_GATE_REQUIRES_CANONICAL_SERP = NO`.

- Novo read-model `lib/minerador/serp-canonical-evidence.ts`: lê somente o artefato persistido em `analise_semantica` e rejeita explicitamente marcas de working copy (`localOnly`, `persisted: false`, `source: "local_fixture"`). Blocker `SERP_REQUIRED_BUT_NOT_CANONICALLY_PERSISTED` com a mensagem "A Qualificação Semântica ainda não possui evidência SERP persistida."
- Bloqueia **aprovação final** (`status → aprovado` na planilha; rejeição e demais status seguem livres) e o **handoff ao Arquiteto**, tanto no preflight de UI (`evaluateMineradorArquitetoHandoff`, novo campo `serpEvidencePersisted`) quanto na rota canônica `POST /api/arquiteto/handoff` — esta última também recusa keywords aprovadas antes do gate existir.
- É gate temporário e conservador: **não** cria persistência, schema, migration nem transforma working copy em artefato. Sai quando a persistência canônica da SERP existir (`REQUIRES_SDD`).
- `AI_ADDS_NO_BLOCKER = YES`: a IA continua opcional e sua ausência não entra neste impedimento.

### LIMITATIONS

- `SESSION_SERP_PERSISTED = NO`: a evidência semântica vive na working copy da Qualificação Semântica. `SESSION_SERP_CAN_SUPPORT_PERSISTED_APPROVAL = NO` e `SESSION_SERP_CAN_SUPPORT_HANDOFF = NO`.
- Consequência operacional aceita: enquanto a persistência não existir, **nenhuma** keyword nova é aprovada nem enviada ao Arquiteto. O pipeline Minerador → Arquiteto fica parado por decisão explícita, e não por falha.
- Persistir a evidência (`SerpResearchSnapshot` no escopo de keyword) exige mudança estrutural: `REQUIRES_SDD`.
- `ORIGINAL_UNTRACKED_TEST_RECOVERED = NO` / `RECONSTRUCTED_TEST_COVERAGE = YES`: `tests/minerador-dataforseo-competition.test.mts` era untracked e foi perdido em uma edição automatizada; o arquivo atual é uma reconstrução sobre o comportamento vigente, não a cobertura original preservada.

### TESTED

- `tests/minerador-semantic-serp.test.mts`: independência das três chamadas nos dois caminhos, teto de chamadas técnicas, rótulo do sinal Labs e pureza da derivação.
- `tests/minerador-serp-canonical-gate.test.mts`: cenário crítico (Lógica/Volume/Resultado/KGR/Revisão Humana completos, SERP ausente) bloqueado na aprovação e no handoff; working copy conclusiva não desbloqueia; recusa também na rota canônica; IA ausente não cria blocker; controle positivo com evidência persistida libera.
- `REAL_PROVIDER_CALLS_IN_TESTS = 0`.

### AUTORIDADE SEMÂNTICA — SERP CONCLUSIVA CONSOLIDA SOZINHA

Correção de 2026-08-28 após o smoke: a Qualificação Semântica ainda oferecia "Decisão humana local", "Proposta", `[Seguir SERP]`, `[Manter atual]` e `[Editar]` sobre uma SERP já conclusiva. Isso contrariava a regra canônica e foi removido.

- **Autoridade**: Lógica = hipótese determinística inicial; SERP real = evidência externa observada. `CONCLUSIVE_SERP_REQUIRES_HUMAN_CONFIRMATION = NO` — evidência conclusiva fecha Intenção e Funil automaticamente, por eixos independentes. A IA não participa (`AI_HAS_SEMANTIC_AUTHORITY = NO`).
- **Não conclusiva** (mista, fraca ou insuficiente): eixo fica "Não consolidado" com motivo declarado. A Lógica **não** vira canônica por fallback, o `main_intent` do Labs não vira canônico e o humano não inventa o valor — `MIXED_SERP_ALLOWS_HUMAN_SEMANTIC_OVERRIDE = NO`, `WEAK_SERP_ALLOWS_HUMAN_SEMANTIC_OVERRIDE = NO`.
- **Read-model**: `SemanticAxisResolution` passou a `{ value, status: awaiting_serp | serp_inconclusive | serp_consolidated, reason }`. Os campos de decisão humana (`humanDecision`, `humanValue`, `overrideReason`) e o fixture `applyLocalSerpFixture` foram removidos: a working copy é session-only e não havia dado histórico a preservar. A Qualificação Semântica virou camada **somente de leitura** (sem `button`, `input` ou `textarea`).
- **Estados honestos**: depois da coleta, "sem sinal suficiente" é `insufficient` — nunca "não coletada".
- **Revisão Humana**: não pede confirmação de Intenção/Funil (o R5 segue neutralizado) e mantém a aplicabilidade do KGR como decisão humana própria — `HUMAN_KGR_APPLICABILITY_DECISION_PRESERVED = YES`.
- **Lacuna declarada**: não existe hoje mecanismo canônico de **invalidar a evidência** por defeito técnico (query/localização/idioma/snapshot inconsistente). Os falsos controles semânticos foram retirados e nenhum substituto foi criado nesta tarefa.
- **Camadas distintas**: "Consolidado pela SERP" ≠ keyword aprovada. `SESSION_AUTO_CONSOLIDATION = YES`, `CANONICAL_PERSISTENCE = NO`, `HANDOFF_WITH_SESSION_ONLY_SERP = NO` (gate da seção anterior permanece).

### ESTADOS VISUAIS DA SERP — CORREÇÃO PÓS-SMOKE

Smoke real com `retinol creamy antes e depois` provou a execução da CALL 3 e expôs duas inconsistências, corrigidas em 2026-08-28:

- **`null` deixou de significar "não coletada"**: o card do eixo derivava "Ainda não coletada" do valor nulo, mesmo com a SERP analisada. Agora a força do eixo é a fonte: `null` = não coletada; coletada sem conclusão = **"Sem conclusão"**; conclusiva = valor consolidado.
- **Vocabulário único de força**: a working copy usava um enum paralelo (`strong`/`moderate`/`absent`) que produzia "Evidência fraca" no card e "evidência insuficiente" no cabeçalho para a mesma execução. O draft passou a carregar o enum canônico `conclusive | mixed | weak | insufficient` (com `null` para ausência de coleta) e todos os consumidores leem `serpEvidenceStrengthPresentation`: forte / mista / fraca / insuficiente. `semanticDraftStrength` foi removida.
- **Cabeçalho**: descreve a coleta, não a força de um eixo — "SERP · Analisada · sem consolidação" substitui "· evidência insuficiente".
- **Notificação do processo Resultados**: uma única mensagem agregada por lote, que não esconde a CALL 3 — consolidada, analisada sem evidência suficiente, ou coleta da SERP falhou.
- Sem mudança em provider, CALL 1/2/3, thresholds, fórmula ou faixa visual do KGR, IA Contextual, Revisão Humana, schema, migration ou Arquiteto.

### PERSISTÊNCIA CANÔNICA DA QUALIFICAÇÃO SEMÂNTICA

SDD: [sdd-persistencia-qualificacao-semantica-serp-2026-08-28.md](propostas/sdd-persistencia-qualificacao-semantica-serp-2026-08-28.md).

**IMPLEMENTED (local)**

- Contrato `KeywordSemanticQualification` (`lib/minerador/keyword-semantic-qualification.ts`): identity, source, query, evidência normalizada com `evidenceHash`, eixos com força própria, `derivationVersion`/`thresholdsVersion` (thresholds seguem `provisional_heuristic`) e lifecycle com `version`, `contentHash`, `createdBy` e `supersedesVersionId`.
- Armazenamento: reuso aditivo de `editorial_artifact_versions` com `artifact_type = keyword_semantic_qualification` e `entity_id = keywordId`. Escrita server-side (`service_role`), leitura sob RLS por Marca. Append-only: nenhuma versão é apagada ou mutada.
- Escrita no processo Resultados, depois da CALL 3 e antes de qualquer relato de sucesso. `CALL_COUNT_PER_KEYWORD` continua no máximo 3. Evidência **conclusiva e não conclusiva** são persistidas.
- Reidratação server-side no carregamento do Perfil/planilha: F5, nova aba, outro navegador e nova sessão autorizada leem o mesmo artifact, com `PROVIDER_CALLS_ON_READ = 0`.
- Card da Qualificação Semântica é parte estável do Perfil (sem coleta mostra "SERP · Não coletada"); com artifact mostra "Qualificação persistida · vN"; falha de nova coleta mantém a última versão válida na tela.
- Gates: aprovação e handoff exigem artifact persistido **e** eixos consolidados (`SERP_PERSISTED_BUT_NOT_CONSOLIDATED` quando a evidência é fraca/mista/insuficiente). O handoff transporta `source_version_id`/`source_content_hash` da Qualificação e a referência no payload; nenhuma SERP é reexecutada no envio.
- Notificação do Resultados só afirma persistência quando o write foi confirmado; caso contrário reporta a falha sem sucesso falso.

**AUTOMATED_TESTED** — `tests/minerador-semantic-qualification-persistence.test.mts` (A–R): reidratação conclusiva, weak/insufficient persistidos, versionamento com `supersedes`, append-only, falha sem sucesso falso, leitura sem provider, isolamento por Marca/keyword, Labs/IA/KGR fora do artifact, os dois degraus do gate, referência no handoff e isolamento em lote. `REAL_PROVIDER_CALLS_IN_TESTS = 0`.

**MIGRATION** — `supabase/migrations/20260828234500_keyword_semantic_qualification_artifact.sql`, aditiva e defensiva (falha se a constraint tiver drifted). O schema já suporta materialmente `keyword_semantic_qualification`. Dívida separada, fora desta frente: o registro correspondente em `supabase_migrations.schema_migrations` está ausente no baseline pós-refresh (reconciliação seletiva do ledger é outra tarefa).

**STORE_REAL_TEST = PASS** — write, read-back canônico, v1, v2 com `previous_version_id`, preservação da versão anterior, retry idempotente e guarda cross-brand verificados contra o banco real, com `DATAFORSEO_CALLS = 0`.

**LIMITATIONS** — a working copy continua existindo apenas durante a execução; keywords com Qualificação apenas de sessão (coletas anteriores a esta implementação) aparecem como não coletadas até uma nova execução do Resultados.

**PENDING** — smokes manuais abaixo.

### SMOKE

- `SERP_CALL3_IMPLEMENTED = YES`
- `SERP_CALL3_AUTOMATED_TESTS = PASS`
- `SERP_REAL_SMOKE_CALL3 = PASS` (`retinol creamy antes e depois`, navegador autenticado).
- `SERP_UI_CONSOLIDATION_MANUAL_SMOKE = PENDING`.
- `MANUAL_F5_SMOKE = PENDING`, `MANUAL_CROSS_BROWSER_SMOKE = PENDING`, `PERSISTENCE_CONFIRMED = PENDING` — nenhum deles pode ser declarado antes da migration executada e do smoke real.

> Superado pela consolidação de 2026-08-29 abaixo: a migration foi aplicada, a persistência foi homologada em runtime e a CALL 3 migrou para o endpoint `advanced`.

## Minerador — SERP advanced + Apresentação Contextual persistida: estado homologado — 2026-08-29

Consolida o que foi validado em runtime real. Testes automatizados e smokes manuais estão registrados separadamente: teste não é prova de runtime.

### QUALIFICAÇÃO SEMÂNTICA — CALL 3 NO ENDPOINT ADVANCED

Uma ação **Resultados** continua disparando exatamente **três** chamadas técnicas por keyword; não existe quarta.

| | antes | agora |
| --- | --- | --- |
| CALL 1 | allintitle | **inalterada** |
| CALL 2 | Keyword Overview | **inalterada** |
| CALL 3 | `/v3/serp/google/organic/live/regular` | `/v3/serp/google/organic/live/advanced` |

Medição real que motivou a troca (2026-08-29): `regular` devolveu 7 orgânicos com 9 campos por item e nenhum bloco de feature, a US$ 0,0020; `advanced` devolveu 17 orgânicos com ~34 campos e os blocos da SERP, a US$ 0,0035. O custo real do provider é o que entra no accounting.

**Sinais consumidos pela derivação**, quando disponíveis: orgânicos (`title`, `description`, `url`, `breadcrumb`, `website_name`, `extended_snippet`, `price`, `rating`, `is_featured_snippet`, `faq`), padrões comerciais/editoriais de URL, e os blocos `popular_products`, `people_also_ask`, `related_searches`, `video`, `images`, `local_pack`. O `ai_overview` é **observado como feature estrutural com peso zero** — nunca adquire autoridade factual ou editorial.

### DERIVAÇÃO V2 — COBERTURA E DOMINÂNCIA SEPARADAS

`DERIVATION_VERSION = serp-semantic-derivation-v2`

```
COVERAGE  = classified / observed      (o quanto a SERP foi interpretada)
DOMINANCE = supporting / classified    (o quanto o topo domina entre os interpretados)
```

A força combina cobertura, dominância, reforço estrutural compatível com o rótulo dominante e mínimo de resultados observados. Invariantes:

- reforço estrutural **não** entra no denominador (um bug real de dominância de 113% foi encontrado e corrigido durante o smoke);
- dominância nunca ultrapassa 100%;
- empate entre rótulos permanece misto, mesmo com reforço;
- cobertura alta **não** implica conclusão quando a distribuição está dividida;
- cobertura baixa com dominância de 100% é `insufficient`, não conclusão.

`SERP_THRESHOLDS_STATUS = PROVISIONAL_HEURISTIC` — os valores atuais funcionaram nos smokes, mas **não** são regra permanente de produto e não sobem para a spec nesta rodada. Recalibrar exige amostra maior de SERPs reais.

### EVIDÊNCIA REAL OBSERVADA

Casos **conclusivos** (UI autenticada, keywords da Care Glow):

- `principia skincare` — Intenção **Transacional**, 93% de cobertura (14/15), 79% de dominância, forte/conclusiva. Funil **BOFU**, 80% (12/15), 83%, forte/conclusiva. Reforços exibidos: Perguntas relacionadas, Produtos populares. Qualificação persistida v1 naquele smoke.
- `serum facial principia` — com o payload/derivação anteriores, 6 de 7 orgânicos ficavam "indefinido" e a evidência morria em fraca. Na coleta `advanced` medida pelo agente: Intenção **Transacional**, 76% de cobertura (13/17), 62% de dominância; Funil 82% (14/17) com 43% de dominância, permanecendo misto. O ganho veio da ampliação e interpretação da evidência observável, **não** de afrouxar threshold.

Caso **não conclusivo**, igualmente importante:

- `principia olheiras antes e depois` — Intenção: 94% de cobertura (16/17) com 38% de dominância → **fraca, não consolidada**. Funil: 100% (17/17) com 41% → **mista, não consolidada**. Reforço observado: Perguntas relacionadas.

`HIGH_COVERAGE != AUTOMATIC_CONCLUSION`. Uma SERP quase toda interpretada continua não consolidada quando os resultados estão semanticamente divididos — comportamento esperado, não falha.

### SEMÂNTICA CANÔNICA (inalterada)

SERP conclusiva fecha automaticamente Intenção e/ou Funil; mista, fraca ou insuficiente mantém o eixo não consolidado. Intenção e Funil são eixos independentes. A IA não participa da decisão semântica, a Revisão Humana não substitui SERP conclusiva por opinião, e Lógica, Labs `main_intent` e IA nunca são fallback para fechar eixo não conclusivo.

### PERSISTÊNCIA — DOIS ARTIFACTS, UM STORE

| | Qualificação Semântica | Apresentação Contextual |
| --- | --- | --- |
| `artifact_type` | `keyword_semantic_qualification` | `keyword_contextual_presentation` |
| storage | `public.editorial_artifact_versions` | `public.editorial_artifact_versions` |
| append-only | YES | YES |
| versionado | YES | YES |
| escopo | `entity_id = keywordId`, `marca_id = brandId` | idem |

Qualificação **conclusiva e não conclusiva** são persistidas: ausência de conclusão não significa ausência de artifact.

Store da Apresentação verificado contra o banco real, sem provider: `STORE_WRITE_V1 = PASS`, `STORE_READ_BACK_V1 = PASS`, `STORE_WRITE_V2 = PASS`, `STORE_READ_BACK_V2 = PASS`, `PREVIOUS_VERSION_ID = PASS`, `IDEMPOTENCY = PASS`, `CROSS_BRAND_STORE = PASS`. Nenhum DELETE ou UPDATE destrutivo foi usado em nenhum momento.

### BANCO — ESTADO MATERIAL

`editorial_artifact_versions_artifact_type_check` aceita: `article_dna`, `silo_dna`, `silo_page`, `content_plan`, `brand_dna`, `brand_skill`, `keyword_semantic_qualification`, `keyword_contextual_presentation`.

`NEW_TABLE = NO` · `NEW_COLUMN = NO` · `NEW_RLS = NO` · `NEW_GRANT = NO` · `MIGRATION_LEDGER_RECONCILIATION = DEFERRED`.

Enquanto a dívida do ledger existir, `supabase db push` **não** é operação segura: as alterações de CHECK são aplicadas manualmente pelo responsável.

### IA — PAPEL, CONTEXTO E OTIMIZAÇÃO

A IA do Minerador é a **Apresentação Contextual**: responde "como esta Marca deve apresentar este tema?". `AI_CAN_DEFINE_INTENT = NO`, `AI_CAN_DEFINE_FUNNEL = NO`, `AI_CAN_CLASSIFY_SERP = NO`, `AI_CAN_DECIDE_KGR = NO`, `AI_CAN_CHANGE_STATUS = NO`, `AI_CAN_CHANGE_ARCHITECTURE = NO`.

Contexto por `getBrandContextPack` → `buildBrandAIContextForPresentation`, com BrandDNA aprovado quando existir e a Voz da Marca disponível da própria `brandId`. `appliedSkillRefs` preserva `definitionKey`, `versionId`, `versionNumber`, `contentHash` e `lifecycleStatus`. Na Care Glow a apresentação foi validada usando a Voz da Marca **sem** BrandDNA aprovado — ausência é lacuna declarada, não bloqueio.

**Thinking desabilitado apenas nesta operação.** Provider DeepSeek e modelo `deepseek-v4-pro` inalterados; o default global do DeepSeek continua intocado. Evidência: com `provider_default`, ~82% dos completion tokens iam para raciocínio (2.017 de 2.453) numa tarefa de redação curta, estourando o teto e forçando retry; com `thinking: disabled`, `reasoningTokens = 0` e o provider aceitou a configuração.

**Limite do contrato**: `ContextualPresentation { text }`, 1–3 parágrafos curtos. O parser passou de 2.200 para **3.200** caracteres depois que o smoke real mostrou respostas válidas de 2.457 e 2.862 caracteres — o teto anterior rejeitava conteúdo bom. Isso **não** é licença para gerar artigo, ContentPlan ou ContentDocument.

### DOMÍNIOS DE FALHA DA IA

A rota distingue: `request_validation`, `keyword_read`, `brand_context`, `provider_configuration`, `provider_generation`, `response_validation`, `contextual_presentation_persistence`, `authorization_or_context`. Geração e persistência são domínios separados:

- geração PASS + persistência PASS → `SUCCESS` / `persistence`;
- geração PASS + persistência FAIL → `INFO` / `workflow`, com a tentativa identificada como não persistida;
- geração FAIL → `ERROR` / `workflow`.

`FAILED_SUCCESSOR_RULE = IMPLEMENTED_AND_AUTOMATED_TESTED`: com v1 persistida, uma nova tentativa que gera conteúdo mas não persiste **não** substitui v1; a tentativa aparece explicitamente como não persistida e o F5 reidrata a última versão persistida. Ainda não reproduzido manualmente em runtime.

### HOMOLOGAÇÃO REAL

| Item | Estado |
| --- | --- |
| `SEMANTIC_QUALIFICATION_PERSISTENCE` | PASS |
| `SEMANTIC_QUALIFICATION_F5` | PASS |
| `SEMANTIC_QUALIFICATION_CROSS_BROWSER` | PASS |
| `KEYWORD_CONTEXTUAL_PRESENTATION_STORAGE` | READY |
| `CONTEXTUAL_PRESENTATION_SINGLE` (geração + persistência) | PASS |
| `CONTEXTUAL_PRESENTATION_SINGLE_F5` | PASS |
| `CONTEXTUAL_PRESENTATION_BATCH_8` (geração + persistência) | PASS — `executionRequestId 5df86fa8-2001-4a4a-ac7e-d959a9f9a370` |
| `CONTEXTUAL_PRESENTATION_BATCH_8_F5_REHYDRATION` | não validado |
| `CONTEXTUAL_PRESENTATION_CROSS_BROWSER` | PENDING_MANUAL_VALIDATION |
| `ARQUITETO_PRESENTATION_HANDOFF` | IMPLEMENTED_AND_AUTOMATED_TESTED (sem smoke ponta a ponta) |

`PRESENTATION_REQUIRED_FOR_REVIEW = NO` · `PRESENTATION_REQUIRED_FOR_APPROVAL = NO` · `PRESENTATION_REQUIRED_FOR_HANDOFF = NO`. A ausência da apresentação nunca impede o pipeline; quando existe, a `presentationRef` versionada viaja no handoff e o Arquiteto apenas lê — não regenera, não chama DeepSeek nem DataForSEO, não altera o artifact upstream.

### PLANILHA — OVERFLOW DO PERFIL

`TABLE_OVERFLOW_ROOT_CAUSE = CONFIRMED`: `table` com `whitespace-nowrap` + `td colSpan` do Perfil + strings técnicas longas (ids de versão, hashes, refs) inflavam o `scrollWidth`. Com `table-layout: fixed`, conteúdo comum não alarga a tabela — só o token sem ponto de quebra.

Medição em browser real, container de 1868px: sem Perfil 1868; Perfil comum 1868; Perfil com string longa em nowrap **2035**; após a correção 1868.

`TABLE_OVERFLOW_FIX = IMPLEMENTED` — `min-w-0`, `max-w-full`, `whitespace-normal` e `overflow-wrap: anywhere` no conteúdo expandido. Problemas mais amplos de navegação e seleção **não** estão declarados resolvidos: não houve reprodução nem validação manual abrangente.

### VALIDAÇÃO TÉCNICA (último estado reportado antes dos smokes finais)

`TESTS = 1111 total · 1064 pass · 47 fail` — as 47 falhas são o baseline pré-existente (drift de asserções de UI e arquivos com `ERR_MODULE_NOT_FOUND` por alias `@/`). `TypeScript = 2 erros legados` · `ESLint = 0/0 nos arquivos tocados` · `VISUAL_GUARD = PASS` · `GIT_DIFF_CHECK = PASS`.

### REGRAS PARA RODADAS FUTURAS

- **Não** criar tabela dedicada para `KeywordSemanticQualification` nem para `KeywordContextualPresentation`: ambas usam `editorial_artifact_versions`.
- **Não** restaurar o R5 como IA operacional do Minerador. **Não** restaurar o Serper.
- **Não** voltar a CALL 3 para `regular` sem nova decisão arquitetônica baseada em evidência.
- **Não** tratar `main_intent` do DataForSEO Labs como Intenção canônica.
- **Não** transformar a Apresentação Contextual em gate.
- **Não** promover os thresholds provisórios da v2 a regra permanente silenciosamente.

## Minerador — aprovação humana sem gates editoriais e independência dos processos — 2026-08-29

Estado de processo passou a ser **informação**, nunca veto. A rodada anterior tinha transformado Lógica, Volume, Resultados, SERP, KGR, IA e Revisão em pré-condições de decisão editorial, o que produzia um loop operacional: SERP mista → aprovação bloqueada → reprocessar → refazer revisão → reprocessar, ou apagar a keyword de teste. Decisão de produto do responsável, registrada em [sdd-aprovacao-humana-sem-gates-editoriais-2026-08-29.md](propostas/sdd-aprovacao-humana-sem-gates-editoriais-2026-08-29.md).

### O QUE DEIXOU DE BLOQUEAR

| critério | antes | agora |
| --- | --- | --- |
| `APPROVAL_ALWAYS_AVAILABLE` | NO | **YES** |
| `SERP_REQUIRED_FOR_APPROVAL` | YES | **NO** |
| `SERP_CONSOLIDATION_REQUIRED_FOR_APPROVAL` | YES | **NO** |
| `REVIEW_REQUIRED_FOR_APPROVAL` | YES | **NO** |
| `AI_REQUIRED_FOR_APPROVAL` | NO | NO |
| `LOGIC/VOLUME/RESULTS/KGR_REQUIRED_FOR_HANDOFF` | YES | **NO** |
| `SERP_REQUIRED_FOR_HANDOFF` | YES | **NO** |
| `REVIEW_REQUIRED_FOR_HANDOFF` | YES | **NO** |

Sobrou apenas integridade técnica: a keyword pertence à Brand ativa, o status editorial permite o envio e o vínculo de publicação legado continua protegido contra rebaixamento. As duas mensagens que travavam o usuário — `"Conclua a revisão do DNA antes da decisão final."` e `"A SERP persistida não consolidou Intenção e Funil"` — foram removidas do produto junto com o módulo que só existia para hospedá-las (`lib/minerador/serp-canonical-evidence.ts`).

Aprovar **não** converte SERP mista em conclusiva. Significa apenas: "eu, humano, aceito esta keyword neste estado". O read-model (`serpEvidencePersisted`, `semanticAxesConsolidated`, `humanReviewCompleted`, `kgrReady`…) continua íntegro e legível — só deixou de vetar.

### INDEPENDÊNCIA DOS PROCESSOS

| reexecutar | altera | nunca altera |
| --- | --- | --- |
| Lógica | Lógica | Volume, Resultados, SERP, IA, Revisão, Aprovação, Status |
| Volume | Volume + KGR derivado | Lógica, Resultados, SERP, IA, Revisão, Aprovação, Status |
| Resultados | Resultado/allintitle, sinais Labs, Qualificação Semântica, KGR derivado | Lógica, Volume, IA, Revisão, Aprovação, Status |
| IA | nova versão da Apresentação Contextual | todo o resto |
| Revisão | apenas decisões humanas explicitamente tomadas | todo o resto |
| Status | apenas Status | todo o resto |

`RESULTS_OR_VOLUME_MAY_RECALCULATE_KGR = YES` é a **única** dependência legítima. `RERUN_AI_INVALIDATES_OTHERS = NO` · `RERUN_SERP_INVALIDATES_OTHERS = NO` · `APPROVAL_SURVIVES_RERUN = YES` · `REVIEW_SURVIVES_RERUN = YES` · `SELECTION_SURVIVES_RERUN = YES` · `DELETE_KEYWORD_TO_RETEST_REQUIRED = NO`.

Verificado por teste estático: existe **um único** ponto de escrita de status (`handleUpdateStatus`), e nenhum handler de reprocesso chama `setSelectedIds` ou `setExpandedRowId`. A seleção só é limpa na troca de Marca/recarga de dados e por ação do usuário.

### REVISÃO HUMANA DEIXA DE SER COBRANÇA VAZIA

Novo estado canônico em `lib/minerador/human-review-ui-state.ts`:

| estado | rótulo |
| --- | --- |
| `no_decision_needed` | Sem decisões pendentes |
| `decision_available` | Decisão disponível |
| `decisions_recorded` | Decisões registradas |

Com o R5 fora da operação, a única decisão humana concreta que resta hoje é a **aplicabilidade do KGR**. Sem ela pendente, o painel se declara de leitura em vez de exibir "Revisão pendente" — que cobrava trabalho inexistente. O rótulo antigo saiu do KeywordDNA.

### HANDOFF HONESTO

O pacote transporta o que existe, sem inventar valor para liberar fluxo:

```
semanticQualificationRef = vN
intent  = null
funnel  = null
semanticState = non_conclusive
```

`semanticState` é novo no contrato `MineradorKeywordHandoffSource` e é derivado do artifact persistido (`conclusive` | `non_conclusive`). Quando a SERP é conclusiva, os eixos viajam preenchidos. Qualificação ausente continua sendo `null` e não impede o envio.

### VALIDAÇÃO TÉCNICA

`tests/minerador-aprovacao-sem-gates.test.mts` — 17/17 (A–Q), incluindo a regressão de `retinol principia antes e depois` (SERP mista, sem IA e sem revisão → aprovação e envio livres) e `REAL_PROVIDER_CALLS_IN_TESTS = 0`.

Runner `npx tsx --test`: `tests/minerador-*` = 699 total · 669 pass · 30 fail; `tests/*` = 1779 total · 1706 pass · 73 fail. As falhas restantes são o baseline pré-existente de asserções de UI (blocos `ProfileBento`, largura mínima da tabela, `handleBatchSemanticReview`, DataForSEO no Perfil) e não citam nenhum símbolo tocado nesta rodada. `TypeScript = 2 erros legados` (`dna-panels.tsx` e `keyword-qualification.ts`) · `ESLint = 0 erros nos arquivos tocados` · `VISUAL_GUARD = PASS`.

Nenhuma migration, nenhum SQL remoto, nenhuma chamada de provider e nenhuma alteração de schema nesta rodada.

### NÃO MUDOU

DataForSEO advanced na CALL 3, `serp-semantic-derivation-v2` e seus thresholds provisórios, DeepSeek com thinking desabilitado nesta operação, Voz da Marca, BrandDNA, fórmula e faixa do KGR, os dois artifacts em `editorial_artifact_versions`, o CHECK aplicado e o append-only.

### REGRAS PARA RODADAS FUTURAS

- **Não** restaurar gate editorial de aprovação, status ou handoff sem nova decisão explícita de produto.
- **Não** transformar estado de processo (SERP, IA, Revisão, KGR) em pré-condição de decisão humana.
- **Não** exigir exclusão de keyword para repetir teste: os artifacts são versionados e append-only.
- **Não** invalidar processo alheio ao reprocessar — exceto o KGR, que deriva de Volume e Resultado.
