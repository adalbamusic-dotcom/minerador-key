# SDD — SERP no artigo e KGR opcional — 2026-09-28

- **Estado:** APROVADA pelo dono do produto em 2026-09-28, com o pedido
  explícito "vamos aplicar" e as respostas às cinco perguntas registradas na
  seção 2.
- **Módulos proprietários, por fatia:** Minerador (fatias M1 a M4), Arquiteto
  (fatias A1 a A5) e Radar (fatias R1 a R3). Cada fatia declara um único dono.
- **Tipo:** mudança de workflow e de contrato compartilhado, retrocompatível.
  Não há migration, SQL, schema novo nem campo novo em schema `.strict()`.
- **Fontes:** `docs/compartilhado/regras-serp-e-assuntos-2026-09-26.md`,
  ADR-020 (com o adendo de 2026-09-28), ADR-022,
  `docs/04-arquiteto/propostas/2026-08-28-sdd-article-kgr-decision-keyword-contextual-presentation.md`,
  `docs/compartilhado/sdd-cache-serp-temporario-2026-09-23.md`,
  `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md` e
  `docs/04-arquiteto/sdd-diferenciacao-publicados-canibalizados-2026-09-27.md`.
- **Estado de implementação:** Planejado. Nada nesta SDD está implementado.
  As referências de linha são do levantamento de 2026-09-28, feito só por
  leitura; confira a âncora antes de editar.

Esta SDD autoriza apenas o escopo descrito aqui. Ela não autoriza
migration, escrita remota, chamada paga real, deploy nem mudança fora das
fatias listadas.

---

## 1. Problema e motivo

O objetivo do dono é **gastar menos no provider e não guardar dado inútil**.

### 1.1 SERP paga por keyword que depois vira secundária ou sobra

Hoje a SERP é obrigatória no Minerador. Aprovar uma keyword exige o
processo **Resultados** (`resolveApprovalReadiness`,
`lib/minerador/approved-package.ts:116`), e esse processo paga, por keyword:
- o allintitle;
- o Keyword Overview (KD);
- a SERP canônica com profundidade 20 e corpo;
- as três lentes extras.

O Minerador paga isso **antes** de saber o que a keyword vai ser. A maior
parte das keywords vira secundária, reforço ou sobra no Arquiteto, e o
allintitle e o KD delas nunca são usados. Keywords sem volume também são
medidas, embora a regra D2.3 diga que elas não reforçam nada.

### 1.2 KGR que raramente se aplica

O KGR (allintitle ÷ volume, bom abaixo de 0,25) só serve a um tipo de
conteúdo. Mesmo assim, hoje ele é tratado como padrão:
- a aplicabilidade começa em "Pendente" (`readKgrApplicability`,
  `lib/minerador/kgr-applicability.ts:43-54`);
- a aprovação exige a decisão de KGR assim que Volume e Resultados existem
  (`approved-package.ts:118`);
- a conclusão da Revisão Humana lança erro com KGR pendente e calculável
  (`lib/minerador/human-review.ts:451`);
- no Arquiteto, score abaixo de 0,25 vira "Sim · KGR pleno" sozinho, sem
  decisão humana (`lib/arquiteto/article-kgr-decision.ts:128-130`,
  `FULL_KGR_RULE`).

O resultado é trabalho humano obrigatório e consulta paga para uma
qualificação que o dono raramente usa.

### 1.3 Pesquisa por Assunto e diferenciação pagam o Labs

A Pesquisa por Assunto paga 7 chamadas do DataForSEO Labs mais a SERP da
frase. A diferenciação de publicados canibalizados paga 3 chamadas do Labs
por página. O Google Ads, pela frase e pela URL como semente, entrega as
buscas reais sem custo no DataForSEO.

---

## 2. Decisão do dono (2026-09-28)

Pedido explícito: "vamos aplicar", com estas respostas:

1. **Minerador.** A SERP (Resultados/allintitle, intenção e funil pela SERP)
   deixa de ser obrigatória e sai da sequência de processos. Fica como ação
   manual e opcional, que não conta como requisito para aprovar. A keyword
   fica pronta para aprovar com os dados do Google Ads (volume etc.) e a
   Lógica. Intenção e funil ficam como indicação ao usuário (Lógica/Google),
   nunca como requisito. Nada do que já foi coletado é apagado: continua
   legível como proveniência.
2. **KGR.** O padrão passa a ser "KGR não aplicável", no Minerador e no
   Arquiteto. Quem quiser trabalhar KGR marca manualmente. Faixa de volume de
   interesse para KGR: **150 a 550**. KGR = allintitle ÷ volume; bom abaixo de
   0,25.
3. **Pesquisa por Assunto** (Minerador > Descobrir): só Google Ads (semente
   frase e semente página/URL). Sai o DataForSEO Labs (related, categoria,
   ranked). Na diferenciação de publicados canibalizados (Arquiteto), as
   keywords novas também vêm só do Google Ads (frase + URL como semente); a
   SERP continua validando.
4. **Arquiteto, aba Artigos.** É onde acontece a **primeira coleta da SERP**,
   nas 4 lentes, para **todas as keywords com volume** do lote que está sendo
   formado. Keyword sem volume nunca é coletada. A coleta acontece uma vez só,
   com cache primeiro (30 dias) e com o aviso e o plano de custo que já
   existem. Por artigo: allintitle da principal (uma consulta) e o KGR do
   **artigo**, com a escolha "Aplicar KGR" (padrão: não), que pode ser
   recalculada. A mesma escolha continua existindo no Minerador por keyword,
   também opcional e com padrão não aplicável.
5. **Radar.** A busca no Google reaproveita a mesma coleta do Arquiteto
   (mesmo cache). YouTube (artigo que vira vídeo) e Amazon (artigo que vira
   review) só **acrescentam** dados; nunca substituem nem apagam os dados de
   busca no Google.

Restrições permanentes que esta SDD respeita:
- nunca voltar a 1 lente da SERP;
- Serper e RapidAPI nunca;
- nenhuma decisão humana alterada em silêncio;
- URL, slug, canonical e marca preservados.

---

## 3. Decisão por módulo

### 3.1 Minerador (Processador)

- **Aprovar exige só Lógica e Volume** (Google Ads, inclusive a resposta sem
  média, que já é aprovável). O Assunto declarado continua exigindo só a
  Lógica.
- **Resultados vira ação manual e opcional.** O botão continua no rodapé do
  Processador, com rótulo e descrição que dizem "opcional · pago" e mostram o
  custo. Ele não aparece mais como etapa pendente na faixa do Perfil.
- **Intenção e funil:** a Lógica dá a indicação. Se o usuário rodar
  Resultados, a SERP conclusiva continua fechando o eixo acima da Lógica,
  como hoje. A precedência SERP > humano > Lógica **não muda**, porque está
  dentro da assinatura v2/v3 do pacote aprovado.
- **KGR por keyword:** padrão "Não aplicável". O seletor continua, com as
  opções "Não aplicável" e "Aplicável". "Pendente" só aparece para valor legado
  já gravado. A decisão de KGR deixa de ser exigida para aprovar e para
  concluir a Revisão Humana.
- **Faixa 150–550:** vira informação na tela ("volume na faixa de interesse
  para KGR"). Nunca é gate e nunca aplica o KGR sozinha.
- **Maturidade do DNA:** "completa para revisão" passa a depender do Volume
  processado e da Lógica. Os rótulos do enum de maturidade não mudam.

### 3.2 Descobrir

- **Pesquisa por Assunto:** só Google Ads (`ads_keyword_seed` e
  `ads_url_seed`, este só com página de destino aceita). Saem
  `labs_related`, `labs_category`, `labs_ranked` e a linha `serp_phrase` do
  plano, que só existia para alimentar a fonte `labs_ranked`.
- **O plano continua existindo,** porque o hash amarra o destino e o
  targeting, mas ele diz "sem custo no DataForSEO; usa a cota do Google Ads".
- **"Medir resultados"** no Descobrir (com o filtro de Resultado ou KD
  ativado) continua como está: manual e opcional.
- **Registros antigos** da lista local (IndexedDB e localStorage) com origens
  `labs_*`, estimativa DataForSEO e SERP da frase continuam legíveis e
  importáveis. Nada é limpo.

### 3.3 Arquiteto

- **Aba Artigos, primeira coleta da SERP:** antes da formação, o Arquiteto
  planeja a coleta das 4 lentes de **todas as keywords com volume** do lote
  (Silos confirmados sendo formados). O plano:
  - lê o cache primeiro, só pelo `meta`;
  - paga só as lentes que faltam;
  - usa o diálogo de plano pago que já existe (`serp-paid-plan-dialog.tsx`,
    `buildSerpPaidPlan`/`mergeSerpPaidPlans`);
  - pede uma confirmação só;
  - nunca inclui keyword sem volume.
- **Ordem na aba Artigos:**
  1. coleta do lote (ou só leitura, se tudo estiver no cache);
  2. formação, já com o índice "mesmo assunto" (D2.2) lido do cache;
  3. parecer SERP de cada artigo, que reaproveita a coleta sem custo;
  4. allintitle da principal de cada artigo;
  5. KGR do artigo, só se o humano escolher "Aplicar KGR".
- **"Com volume" tem um predicado único nas coletas novas:** média do Google
  Ads finita e maior que zero (`volume_search > 0`), o mesmo de
  `hasSearchVolume` (`lib/arquiteto/serp-subject-suggestions.ts:39-41`). A
  estimativa do Labs não conta nas coletas novas. Registros antigos da
  Pesquisa por Assunto mantêm a regra de leitura de hoje
  (`subjectDiscoveryHasVolume`).
- **Keyword sem volume dentro de um artigo** fica fora dos slots do plano e
  sai como `notObserved` (campo opcional que já existe, com
  `NOT_OBSERVED_REASON`). Ela não entra em `missing`, cujo enum é fechado e
  `.strict()`, e não trava `articleSerpLensesComplete` por falta de lente.
- **Allintitle da principal:** uma consulta por artigo, na lista de chamadas
  do mesmo plano de custo, com cache primeiro. Reaproveita:
  - a medição do Minerador (`results_allintitle` com
    `allintitle_measurement.measuredAt` de até 30 dias);
  - ou a medição anterior do próprio Arquiteto, gravada em
    `kgrIdentity.evidence` com `evaluatedAt` de até 30 dias.

  "Recalcular" é pago, com aviso, e só quando o humano pede. O Arquiteto
  **não grava** `results_allintitle` nem `kgr_score` na linha do Minerador.
  Isso seria alterar outro módulo em silêncio.
- **KGR do artigo:** a escolha "Aplicar KGR" (Sim/Não) vale para qualquer
  artigo, com padrão Não. O score vem de `kgrIdentity.resultCount` ÷ volume da
  principal. A faixa 150–550 aparece como informação.
- **Coletas antes da aba Artigos** (SERP por keyword do território e SERP
  territorial, na fase Silos) deixam de ser etapa do fluxo. Elas passam a ler
  só o cache por padrão. A coleta paga ali continua disponível como ação
  manual e explícita, com o mesmo filtro de volume e as 4 lentes.
- **Diferenciação de publicados canibalizados:**
  - as keywords novas vêm do Google Ads (`keywordSeed` com as sementes do
    ângulo e `keywordAndUrlSeed` com a URL da página), sem custo no
    DataForSEO;
  - a SERP das até 5 melhores candidatas por página continua validando, nas 4
    lentes, com cache primeiro.

### 3.4 Radar

- **Busca no Google:** reaproveita o cache pela chave (keyword normalizada ×
  localidade × idioma × lente × `advanced`). Isso já funciona hoje e não pede
  código novo. A fatia R1 só **prova** a igualdade da chave entre Arquiteto e
  Radar, inclusive sem targeting do Minerador, e corrige o desvio da rota
  `keyword-serp` que grava sob os códigos da config (`app/api/arquiteto/keyword-serp/route.ts:239-265`).
- **Keyword sem volume** não gera consulta auxiliar no Radar: disposição
  `CONTEXT_ONLY` com motivo, no plano de consultas
  (`lib/radar/research-query-plan.ts:167-205`). A mudança é aditiva e não mexe
  no schema.
- **YouTube e Amazon acrescentam.** Quando o Google do artigo foi finalizado,
  o dossiê V3 continua entregando a fotografia do Google (`observed`,
  `serpLenses`), mesmo quando o perfil primário é YouTube ou Amazon. Hoje
  `radarPrimaryProfileOfAnalysis` (`lib/radar/evidence-bundle-runtime.ts:100-107`)
  rebaixa o Google a referência. Só dossiês **novos** mudam; os já entregues
  mantêm o hash.
- **Rótulo:** "Não classificado como KGR" passa a "KGR não aplicável"
  (`lib/radar/strategy-context.ts:70-73`, `:173-174`).

---

## 4. Contrato atual × proposta

| Ponto | Contrato atual (Verificado no código) | Proposta |
| --- | --- | --- |
| Trava de aprovação | `resolveApprovalReadiness` empurra `results` sem Resultados (`approved-package.ts:116`) e `kgr` com KGR calculável e pendente (`:118`) | Não empurra mais `results` nem `kgr`. A união `ApprovalRequirement` mantém `"results"` e `"kgr"` (nunca emitidos; contrato de tipo das rotas e da MCP). O motivo de `:127` passa a "Aprovar exige Lógica e Volume". `SUBJECT_APPROVAL_REASON` passa a "dispensa Volume e KGR" (o teste que o compara é ajustado junto) |
| Envio ao Arquiteto (servidor) | `prepareCanonicalHandoff` (`lib/server/arquiteto-workspace.ts:341-362`) recusa com 409 o que a trava recusa | Relaxa junto, pela mesma função. `SERVER_APPROVAL_GATE_SINCE` não muda |
| Sequência de processos | `site · logic · volume · results · kgr · review`; `kgrCurrent` depende de `resultsCurrent` (`process-state.ts:154`) | Os nomes ficam (attempts, UI e testes dependem deles). Campo aditivo opcional `optional?: true` em `MineradorProcessState` para `results` e `kgr`, só de apresentação e não persistido |
| Maturidade | `completeForReview = googleAdsValid && dataForSeoValid && kgrTreated` (`dna-maturity.ts:26`) | `completeForReview = googleAdsValid && logicaProcessada`. Rótulos do enum iguais (KeywordDNA `.strict()`) |
| Aplicabilidade do KGR | `readKgrApplicability`: ausência, origem IA/automática e sem decisão viram `"pending"` | Ausência, origem automática e `"pending"` legado viram `"not_applicable"` na leitura. O enum de 3 valores fica (KeywordDNA `keyword-dna.ts:92`, `human_review.kgrApplicability`, filtros). Nada é regravado |
| Score KGR na medição | `dataforseo-allintitle.ts:110` e `allintitle.ts:244` só gravam `kgr_score` com aplicabilidade diferente de `not_applicable` | O score é fato técnico e é calculado sempre que houver medição, como `volume-provider.ts:282-284`. A aplicabilidade só decide o **uso** |
| Leitor paralelo | `volume-kgr-consistency.ts:46-56` lê `kgr_aplicabilidade` por conta própria | Passa a usar `readKgrApplicability` |
| Revisão Humana | `completeHumanReview` lança erro com KGR pendente e calculável (`human-review.ts:451`) | `pendingKgrDecision` é sempre falso. O KGR nunca bloqueia a conclusão |
| Faixa de interesse | Não existe (o `engine.ts:110/167` usa volume ≥ 120 e o `discovery-keywords.ts:83` filtra 120–499) | Constante aditiva `KGR_INTEREST_VOLUME_RANGE = { min: 150, max: 550 }` em `kgr-applicability.ts`, só informativa. O `engine.ts` e o filtro do Descobrir **não mudam** nesta SDD (ver 11) |
| Pesquisa por Assunto | Plano `subject-discovery-plan-v1`: Ads (2), `serp_phrase`, Labs (7 chamadas) | Plano `subject-discovery-plan-v2`: só as linhas do Ads. `SUBJECT_DISCOVERY_SOURCES` (5, legíveis) fica; entra `SUBJECT_DISCOVERY_ACTIVE_SOURCES` (2). Os campos `serp`, `labsLocale` e `prices` ficam no tipo, vazios nas pesquisas novas |
| Runtime da pesquisa | `openExecution` resolve a Connection DataForSEO antes de tudo (`subject-discovery-runtime.ts:118-126`) | Resolução preguiçosa, ainda dentro de `openExecution`. Marca sem DataForSEO pesquisa só com Ads sem receber 503 |
| Diferenciação | Plano `published-differentiation-plan-v1`: por página, `ranked_keywords`, `keyword_ideas` e `related_keywords` do Labs mais a SERP | Plano `published-differentiation-plan-v2`: `page.labs = []`; Ads `keywordSeed` [ideasSeed, relatedSeed] e `keywordAndUrlSeed` [ideasSeed, page.url], grátis e no hash; SERP igual. Plano v1 em estado `planned` é recusado com 409 antes de reservar, sem pagar |
| Origem padrão no aceite da diferenciação | `labs_category` (`published-differentiation-apply.ts:163`) | `ads_keyword_seed`. Escolhas antigas mantêm `labs_*` |
| Chave do ledger do Ads | `googleAdsDiscoveryUsageKey` só com sufixos `keyword_seed` e `url_seed`; `module` fixo em `minerador` | Sufixo aditivo por página (ex.: `keyword_seed:p2`), com a chave sem sufixo e as duas atuais iguais byte a byte. Parâmetro opcional `module`, repassado de `usage.module` |
| Primeira coleta SERP | Minerador (Resultados); o Arquiteto coleta na fase Silos e em Processar artigos, sem filtro de volume | Arquiteto, aba Artigos, coleta do lote com volume, antes da formação, pelo núcleo de `keyword-serp` (keyword × lente, cache primeiro, canônica com profundidade 20 e corpo via `architectSerpCollectionRequest`) |
| Allintitle | Só o Minerador mede (`dataforseo-serp-core.ts:131-146`, `live/regular`, profundidade 10, sem cache) | O Arquiteto mede o da principal com o mesmo núcleo de pedido, cache primeiro pela regra de 3.3, e registra em `kgrIdentity.resultCount`, `kgrValue`, `evaluatedAt`, `evaluatedBy` e `evidence` (campos que já existem) |
| KGR do artigo | `readArticleKgrDecision`: humano > score < 0,25 = YES automático > score nulo = ABSENT > applicable = PENDING_HUMAN_DECISION > not_applicable = NO > PENDING_APPLICABILITY | Humano ("Aplicar KGR" Sim/Não, `HUMAN_DECISION`) > vínculo confirmado (`CONFIRMED_KGR_BINDING`) > identidade gravada pela regra antiga (`FULL_KGR_RULE` persistida, lida como está) > padrão NO com fonte `KEYWORD_APPLICABILITY_RULE` e `decisionReason` "KGR não aplicável por padrão". `decisionContractVersion` = `"article-kgr-decision-v2"` (string livre). Nenhum valor novo de enum |
| Fechamento do artigo | `resolveKgr` do fechamento trata pendente como NOT_APPLICABLE antes do score (diverge da leitura) | As duas leituras convergem: sem "Aplicar KGR" = Sim, NOT_APPLICABLE com `source: article_decision`. Com Sim e sem métrica, `KGR_APPLICABLE_WITHOUT_METRIC` continua bloqueando até medir o allintitle |
| PATCH da decisão | `app/api/arquiteto/workspace/route.ts:180-196` recusa se `!requiresHumanDecision` ou score nulo | Aceita Sim/Não sempre. Sim sem score fica gravado e a tela oferece "Medir allintitle (pago)". A fonte do score passa a ser `kgrIdentity` (medição do Arquiteto) com fallback na linha do Minerador |
| Radar × YouTube/Amazon | Perfil primário por precedência fixa Amazon > YouTube > Google; o Google vira SUPPORT só com referência, sem `observed` e sem `serpLenses` | Com o Google finalizado, a camada Google SUPPORT leva também a fotografia (`observed`, `serpLenses`). Ver 6.4 |

---

## 5. Consumidores

**Trava de aprovação (`resolveApprovalReadiness`).**
- Tela: `modules/minerador/minerador-workspace.tsx:2733-2759` e `:2813-2824`.
- Gate de envio da tela: `lib/minerador/arquiteto-handoff-gates.ts:118-126`.
- Servidor: `prepareCanonicalHandoff`, em `lib/server/arquiteto-workspace.ts:343`.
- MCP: `decide_keywords`, em `lib/server/platform-mcp-tools.ts:768`.
- Testes: `minerador-aprovacao-sem-gates`, `minerador-aprovacao-versionada`,
  `minerador-assunto-aprovacao`, `arquiteto-assunto-trava-servidor`,
  `minerador-volume-sem-media` e `minerador-architect-send-menu`.

**`readKgrApplicability`.**
- `approved-package.ts:118`, `human-review.ts:381/459` e
  `canonical-keyword-snapshot.ts:103`.
- `dataforseo-allintitle.ts:110`, `allintitle.ts:251` e
  `kgr-applicability-batch.ts:48`.
- `platform-mcp-tools.ts:216/352/850`: `kgrUse` passa de `decisao_pendente`
  para `nao_utilizada` no padrão.
- `components/editorial/dna-panels.tsx:474` e `minerador-workspace.tsx:2887`.
- No Arquiteto: `article-kgr-decision.ts:116-118`,
  `article-expanded-panel.ts:55` e `editorial-keyword-dna-export.ts:115`.

**Estados `results`/`kgr` e maturidade.**
- `canonical-keyword-snapshot.ts:115/122`, `processor-table-cells.ts:194`,
  `arquiteto-handoff-gates.ts:94` e `minerador-workspace.tsx:3221/3359/3551`.
- `dna-panels.tsx:246/1044/1047-1053` e `keyword-decision-summary`.

**Revisão Humana.** `minerador-workspace.tsx:2915` e `:3053-3242`,
`human-review-completion-batch.ts`.

**Score KGR (`kgr_score`).**
- Arquiteto: `adapters.ts:50/171/272`, `identity-context.ts`,
  `keyword-dna-projection.ts:137`, `engine.ts:233` e `article-kgr-decision.ts`.
- Rota `google-ads/metricas-keywords:164`.

**Export CSV do Minerador** (`minerador-workspace.tsx:2140-2162`): exporta
o valor efetivo. O trecho tem mojibake literal: preservar os bytes.

**Pesquisa por Assunto.**
- Rota `subject-discovery/search`.
- MCP `search_subject_keywords` (`platform-mcp-tools.ts:998-1026`, `:417-476`).
- Tela: `use-subject-search.ts`, `subject-search-dialogs.tsx`,
  `subject-search-results.tsx` e `subject-search-model.ts`.
- Lista local: `subject-search-local-store.ts`.
- Import pelo `SubjectDiscoveryImportRequestSchema` com as 5 origens.
- Arquiteto: `arquiteto-workspace.tsx:226` e `serp-subject-model.ts:610`.

**Diferenciação.**
- Rotas `app/api/arquiteto/cannibalization/{plan,run,apply}`.
- Servidor: `handleDifferentiationPlan`/`handleDifferentiationRun`, em
  `lib/server/arquiteto-differentiation.ts`.
- Tela: `published-differentiation-model.ts`, `-panel.tsx` e
  `use-published-differentiation.ts`.

**Cache da SERP.**
- `serp_cache_entry` em `editorial_workflow_items`.
- Gravadores: Minerador (`allintitle/route.ts`,
  `minerador-serp-lens-coverage.ts`), Arquiteto (`serp`, `keyword-serp`,
  `territorial-serp`, `cannibalization/run`) e Radar
  (`radar-serp-lenses.ts`).
- As constantes `DATAFORSEO_LABS_LOCATION_CODE` e
  `DATAFORSEO_LABS_LANGUAGE_CODE` são a chave de local em
  `subject-discovery-search.ts:323` e
  `arquiteto-differentiation-store.ts:19/259`. **Não podem sair:** o núcleo
  do Labs fica no código, sem chamador.

**Radar.**
- `app/api/editorial/serp/route.ts` e `research-query-plan.ts`.
- `evidence-bundle-runtime.ts`, `strategy-context.ts` e
  `radar-support-research.ts`.
- Planejador: `lib/planejador/hydration.ts` e `keyword-strategy.ts`.
- Redator: `lib/redator/radar-foundations.ts`.

**Catálogo das IAs** (`lib/agent/platform-catalog.ts`) e
`lib/agent/silo-plan.ts`: o integrador aplica (seção 12).

---

## 6. Compatibilidade

### 6.1 Pacotes aprovados

- Relaxar `resolveApprovalReadiness` **só reduz recusas**.
  - Nenhum registro `aprovacao` é regravado.
  - `contentHash`, assinatura (`fnv1a-v3`) e `SERVER_APPROVAL_GATE_SINCE`
    ficam iguais.
  - `resolveHandoffApprovalGate` continua com `pass`, `alert` e `refuse`.
- A assinatura cobre o `analise_semantica` bruto, e não a saída de
  `readKgrApplicability`. Por isso, mudar o **padrão de leitura** do KGR não
  muda a assinatura e não rebaixa aprovadas (Verificado no código,
  `approved-package.ts:335-373`).
- `readCanonicalKeywordDna` e `v2SignatureContent` **não mudam**. Mexer na
  precedência SERP > humano > Lógica rebaixaria em massa.
- `kgrScore` é campo assinado. Calcular sempre o score numa **nova** medição
  manual de Resultados pode rebaixar uma aprovada. Isso só acontece por ação
  humana explícita, e a mesma medição já muda `resultsAllintitle`, que
  também é assinado. É o comportamento de hoje para remedição.
- O `human_review` gravado entra na assinatura v3 só em escritas novas.

### 6.2 Dados antigos legíveis

- `allintitle_measurement`, `evidencia_serp`, `dataforseo_keyword_overview`, a
  Qualificação SERP e o histórico continuam sendo lidos como estão.
- Os valores `"pending"` explícitos já gravados continuam no banco. A leitura
  os trata como "não aplicado" e o filtro "Pendente" mostra só o legado.
- Lista local da Pesquisa por Assunto: origens `labs_*`,
  `dataForSeoEstimate`, `plan.serp`, `plan.labsLocale` e `serp.topUrls`
  continuam no tipo. A tela esconde a coluna Estimativa e o bloco da SERP só
  quando estão vazios. `buildSubjectDiscoveryImportItems` e
  `mergeSubjectDiscoveryCandidates` **não** encolhem o filtro de origens: uma
  candidata antiga só do Labs não pode perder a origem e sumir do envio.
- Propostas de diferenciação já pagas (`payload.run`, `labsFailures`,
  origens `labs_*`) continuam legíveis e aceitáveis. `planDifferentiationApply`
  não chama provider.
- ArticleDNA aprovado é imutável. Identidades KGR gravadas com `FULL_KGR_RULE`
  são lidas como estão e mostradas como "Sim · regra antiga (KGR pleno
  automático)", com "Aplicar KGR" pré-selecionado em Sim. Trocar para Não é
  decisão humana e abre histórico.
- Identidades KGR confirmadas (`isConfirmedKgrIdentity`) continuam travando
  slug e principal e mantêm o perfil `kgr_light` da SERP.

### 6.3 Schemas `.strict()`

Nenhum campo novo e nenhum valor novo de enum. Os campos usados já existem:
- `ArticleKgrIdentitySchema`: `resultCount`, `kgrValue`, `primaryVolume`,
  `evaluatedAt`/`evaluatedBy`, `decision`, `decisionSource`,
  `decisionReason`, `decisionContractVersion` (string livre), `humanDecision`
  (record livre), `evidence` (array de records livres) e `decisionHistory`.
- `ArticleClassificationSchema`: `kgr: NOT_APPLICABLE` com
  `source: article_decision`.
- `article-serp-record`: `notObserved` (opcional, já existente).
- KeywordDNA: enum de aplicabilidade de 3 valores e bloco `serp` com
  `state: "not_collected"`, já previstos.
- `SerpCacheMetaSchema`: coletores `minerador|arquiteto|radar`, sem valor
  novo.
- Radar: `RadarEvidenceBundle` V3. A inclusão de `observed`/`serpLenses` na
  camada Google SUPPORT (6.4) precisa ser conferida no schema antes da fatia
  R3 (**Ainda não verificado**). Se exigir campo ou valor novo, a fatia R3 para
  e volta como adendo, com a ordem "leitor tolerante primeiro, escritor
  depois".

### 6.4 Radar: dossiê com Google e YouTube/Amazon

`evidence-bundle.ts:291-305` exige exatamente uma camada PRIMARY. O Google
viaja como SUPPORT, mas com a fotografia completa quando `finalizedBundle`
existe. Regras:
- dossiês já entregues não são recalculados;
- o hash só muda para dossiês novos;
- `assertRadarEvidenceBundleIntegrity` continua valendo.

### 6.5 Deploy

- **Deploy único do monólito** (tela, servidor e MCP juntos), servidor
  junto ou antes do cliente. Os planos v2 mudam o `planHash`. Uma aba aberta
  antes do deploy recebe `PAID_PLAN_CHANGED` (Assunto) ou recusa de versão
  (diferenciação), **sem pagar**, e basta planejar de novo.
- **Sem migration.** O ledger do Arquiteto usa `operation:
  "module_operation"` com `module: "arquiteto"`, como a rota `keyword-serp`
  já faz (`app/api/arquiteto/keyword-serp/route.ts:323-336`). O allintitle
  do artigo usa `operationKind: "article_allintitle"` em `metadata`.
- **Ordem das fatias:** M1 → M2 → M3 → M4, D1 → D2, A1 → A2 → A3 → A4 → A5,
  R1 → R2 → R3. M1 e A1 podem ir juntas. A2 (coleta no Arquiteto) **tem de
  estar no ar antes ou junto** de M1: senão, keywords aprovadas sem SERP
  chegam a um Arquiteto que só coleta membros de grupos já formados, e as
  sobras ficam sem SERP.
- **Nunca voltar abaixo da F2·A** (regra de deploy em fases já registrada).

---

## 7. Custos antes e depois

### 7.1 Preços que existem no código

- `SERP_PAID_QUERY_COST_USD` (`lib/arquiteto/serp-lens-plan.ts:100-104`):
  - canônica com profundidade 20: US$ 0,0035;
  - outras lentes: US$ 0,002 a 0,0035.

  Uma keyword nas 4 lentes custa **US$ 0,0095 a 0,014**.
- `SUBJECT_DISCOVERY_PRICES` (`lib/minerador/subject-discovery-plan.ts:44-50`),
  consultados em dataforseo.com em 2026-09-24:
  - tarefa do Labs: US$ 0,012;
  - item do Labs: US$ 0,00012.

  Com `labsLimit = 100`, cada chamada do Labs custa até **US$ 0,024**. O teto
  por pesquisa é `SUBJECT_DISCOVERY_MAX_COST_USD` = US$ 0,20.
- `DIFFERENTIATION_MAX_COST_USD` = US$ 0,50 por grupo.
- **Allintitle e KD:** não há constante no código. O ledger de 30 dias medido
  na SDD da descoberta local (2026-09-23, §3.3) registra 367 alvos por US$
  9,30648 (≈ 0,0254 por alvo, com a SERP canônica). Allintitle + KD ≈ 0,022
  por alvo (ESTIMADO). O allintitle sozinho (`live/regular`, profundidade 10)
  não foi medido separado. O plano usa a faixa de outra lente, **US$ 0,002 a
  0,0035** (ESTIMADO), até o primeiro evento real no ledger confirmar.

### 7.2 Minerador + Arquiteto (exemplo: lote de 100 keywords, 60 com volume, 20 artigos)

| | Antes | Depois |
| --- | --- | --- |
| Minerador | Resultados obrigatório: 100 × (0,022 + 0,0095..0,014) = **US$ 3,15 a 3,60** (ESTIMADO) | **US$ 0** obrigatório. Google Ads grátis; Resultados é opcional |
| Arquiteto, SERP do lote | 0 dentro de 30 dias (reaproveita o Minerador) | 60 × 0,0095..0,014 = **US$ 0,57 a 0,84** (só o que faltar no cache) |
| Arquiteto, allintitle das principais | 0 (vinha do Minerador) | 20 × 0,002..0,0035 = **US$ 0,04 a 0,07** (ESTIMADO) |
| KD | 100 medições | Nenhuma, salvo pela ação manual no Minerador |
| **Total** | **US$ 3,15 a 3,60** | **US$ 0,61 a 0,91**: cerca de 75% a 81% a menos |

Dado que deixa de ser guardado: allintitle, KD e SERP das 40 keywords sem
volume, e allintitle e KD das 40 com volume que não viram principal.

### 7.3 Pesquisa por Assunto (por pesquisa)

- **Antes:** 7 chamadas Labs (related 1, categoria 1, ranked até 5), de US$
  0,084 a 0,168, mais a SERP da frase de até US$ 0,014. Total de **US$ 0,084
  a 0,182**, com teto de US$ 0,20.
- **Depois:** **US$ 0 no DataForSEO.** Usa a cota do Google Ads.

### 7.4 Diferenciação de publicados (por página)

- **Antes:** 3 chamadas Labs (US$ 0,036 a 0,072) mais a SERP de até 5
  candidatas (0 a 0,07). Para 2 páginas: **US$ 0,072 a 0,284**.
- **Depois:** só a SERP, de 0 a 5 × 0,014. Para 2 páginas: **US$ 0,00 a
  0,14**. Até 7 páginas cabem no teto de US$ 0,50 sem corte.

### 7.5 Radar

Sem mudança de preço. Dentro de 30 dias da coleta do Arquiteto, "Atualizar
SERP" da principal custa 0. Depois disso, ou com "Recoletar agora (pago)",
paga só as lentes que faltam (até US$ 0,014 por keyword). O apoio da Amazon
com texto derivado ("X review", "A vs B") tem chave própria e paga as 4
lentes: é acréscimo, não substituição.

---

## 8. Fatias e arquivos

| Fatia | Dono | Arquivos principais | Fim de linha |
| --- | --- | --- | --- |
| M1 · trava de aprovação | Minerador | `lib/minerador/approved-package.ts` | LF |
| M2 · padrão do KGR e score | Minerador | `kgr-applicability.ts`, `dataforseo-allintitle.ts`, `allintitle.ts`, `volume-kgr-consistency.ts`, `human-review.ts`, `human-review-completion-batch.ts`, `table-view.ts` | `allintitle.ts` CRLF; os demais LF |
| M3 · processos e maturidade | Minerador | `process-state.ts`, `dna-maturity.ts`, `canonical-keyword-snapshot.ts` | LF |
| M4 · tela | Minerador | `minerador-workspace.tsx`, `components/editorial/dna-panels.tsx` | workspace misto (CRLF + 9 LF); dna-panels CRLF |
| D1 · Pesquisa por Assunto | Minerador | `subject-discovery-plan.ts`, `-search.ts`, `subject-discovery-runtime.ts`, `modules/minerador/discovery/*`, `platform-mcp-tools.ts` (só descrição) | LF |
| D2 · diferenciação | Arquiteto | `published-differentiation-run.ts`, `-apply.ts`, `lib/server/arquiteto-differentiation.ts`, `google-ads-discovery-usage.ts` (aditivo), telas da diferenciação | LF |
| A1 · KGR do artigo | Arquiteto | `article-kgr-decision.ts`, `article-classification-closure.ts`, `strategic-context.ts`, `app/api/arquiteto/workspace/route.ts` | `article-kgr-decision.ts` misto (1 CRLF) |
| A2 · coleta do lote | Arquiteto | núcleo de `app/api/arquiteto/keyword-serp/route.ts`, `serp-lens-plan.ts`, `arquiteto-workspace.tsx` (aba Artigos) | conferir pelo Node |
| A3 · keyword sem volume no parecer | Arquiteto | `app/api/arquiteto/serp/route.ts`, `article-serp-gate.ts`, `article-serp-interpretation.ts` | conferir pelo Node |
| A4 · allintitle da principal | Arquiteto | rota nova de allintitle do artigo ou modo da rota `serp`, `kgrIdentity` | conferir pelo Node |
| A5 · fase Silos só cache | Arquiteto | `arquiteto-workspace.tsx` (`collectKeywordSerp`, territorial) | conferir pelo Node |
| R1 · chave igual | Radar | teste novo; ajuste de `keyword-serp` (códigos) | conferir pelo Node |
| R2 · sem volume não consulta | Radar | `lib/radar/research-query-plan.ts` | conferir pelo Node |
| R3 · Google preservado no dossiê | Radar | `lib/radar/evidence-bundle-runtime.ts`, `strategy-context.ts` | conferir pelo Node |

Todas as edições usam âncora única, sem splice por faixa de linhas. O fim
de linha é conferido pelo Node antes e depois de cada edição.

Guarda de versionamento (A1): `prepareSelectedLogicalArticleDnas`
(`arquiteto-workspace.tsx:7066-7091`) não pode abrir sucessora do ArticleDNA
só porque a derivação mudou de v1 para v2. Só abre sucessora quando a
principal muda ou quando o humano muda "Aplicar KGR".

---

## 9. Rollback

- Todas as fatias são reversíveis por código. Não há dado migrado, campo
  novo nem registro regravado.
- **Efeito conhecido de um rollback abaixo de M1:** keywords aprovadas **sem**
  Resultados com `approvedAt` ≥ 2026-09-24 passam a ser **recusadas (409)**
  pelo código antigo em `prepareCanonicalHandoff` e pela MCP. Nada se perde:
  basta medir Resultados (pago, manual) ou esperar o novo deploy. Registrar
  isso em `docs/03-minerador/estado-atual.md`.
- **Rollback abaixo de A1:** o código antigo volta a mostrar "Sim · KGR pleno"
  automático para score < 0,25. Isso só muda a leitura: `decisionSource` e
  `decisionContractVersion` gravados são valores que o leitor antigo aceita.
- **Rollback abaixo de D1/D2:** abas com plano v2 recebem `PAID_PLAN_CHANGED`
  ou recusa de versão, sem pagar. Propostas v2 gravadas em `planned` são
  recusadas pelo código antigo ao executar, porque o hash não bate.
- **Rollback de R3:** dossiês novos entregues com a fotografia Google
  continuam íntegros pelo hash deles, e o código antigo os lê se o schema os
  aceitar (conferir na fatia; ver 6.3).
- Nenhum rollback limpa localStorage, IndexedDB ou cache de SERP.

---

## 10. Testes

Todos usam fixtures e fetch falso. Nenhuma chamada paga, nenhum dev server,
nenhum build. Mutantes só valem com a suíte verde.

**Minerador.**
- `resolveApprovalReadiness` aprova com Lógica e Volume, sem Resultados e sem
  KGR, na tela, no gate de envio, em `prepareCanonicalHandoff` e na MCP.
- Uma aprovada antiga continua com a mesma assinatura e o mesmo hash.
- `readKgrApplicability`: ausência, origem IA e `"pending"` legado dão
  `not_applicable`; `applicable` explícito continua `applicable`.
- Medição nova grava `kgr_score` com qualquer aplicabilidade.
- `volume-kgr-consistency` segue o leitor único.
- `completeHumanReview` não lança erro por KGR.
- A maturidade chega a "completa para revisão" sem SERP.
- A faixa 150–550 é só informativa: não aplica o KGR nem bloqueia.
- CSV: o valor efetivo sai sem reencodar o trecho com mojibake.
- Ajustar: `minerador-aprovacao-*`, `minerador-assunto-aprovacao`,
  `minerador-human-review*`, `minerador-process-state`,
  `minerador-r6-process-artifacts` e `minerador-volume-sem-media`.

**Pesquisa por Assunto.**
- O plano v2 tem custo 0 e nenhuma linha paga.
- O execute não chama o Labs nem a SERP.
- Uma marca sem DataForSEO pesquisa só com Ads.
- Um registro local antigo com `labs_*` e SERP renderiza e importa.
- A chave do ledger do Ads sem sufixo continua igual byte a byte.
- Mover a asserção do locale de `catalogo.test.mts:129-133` para
  `subjectDiscoverySerpRequests`. Limpar comentários antes de `doesNotMatch`.

**Diferenciação.**
- Um plano v1 gravado é recusado antes de reservar, sem pagar.
- O custo vai de 0,00 a 0,14 para 2 páginas.
- A chave do Ads por página não colide.
- Uma rodada antiga com `labs_*` continua aceitável.

**Arquiteto.**
- A coleta do lote exclui a keyword sem volume.
- Uma keyword no cache não entra no plano pago.
- A canônica é pedida com profundidade 20 e corpo.
- A keyword sem volume sai como `notObserved` e não trava a conclusão.
- "Aplicar KGR" tem padrão Não. Sim sem métrica bloqueia com
  `KGR_APPLICABLE_WITHOUT_METRIC` até o allintitle.
- A identidade `FULL_KGR_RULE` gravada é lida sem abrir sucessora.
- A identidade confirmada mantém `kgr_light`.
- O allintitle reaproveita a medição de até 30 dias, e "Recalcular" pede
  confirmação.
- O Arquiteto não escreve em `minerador_keywords`.

**Radar.**
- A chave do cache é igual entre Arquiteto e Radar, com e sem targeting e
  com config ≠ ambiente.
- A keyword sem volume vira `CONTEXT_ONLY`.
- Um dossiê com YouTube ou Amazon finalizado mais o Google finalizado mantém
  `observed` e `serpLenses` do Google.
- O hash de dossiê antigo não muda.

**Gerais.** TypeScript, lint direcionado, `git diff --check` e
`npm run test:agent`, este depois de o integrador aplicar o catálogo.
TypeScript e testes não provam a interface: a homologação manual é do
usuário.

---

## 11. O que NÃO muda

- **4 lentes, sempre.** Nenhuma coleta com menos de 4 lentes e nenhuma opção
  "só a principal" como padrão.
- **Cache:** mesma chave, mesma validade de 30 dias, cache primeiro, recoleta
  só por "Recoletar agora (pago)" com confirmação.
- **Toda chamada paga é explícita:** plano, preço, uma confirmação, servidor
  nunca paga além do autorizado, ledger sempre.
- **A precedência SERP conclusiva > humano > Lógica > IA** e a assinatura
  v2/v3 do pacote aprovado.
- **`SERVER_APPROVAL_GATE_SINCE`,** `contentHash` e assinatura dos pacotes
  aprovados.
- **O Assunto:** aprovação só com a Lógica; nunca principal sem volume
  validado.
- **Publicados:** URL, slug, canonical, marca e principal protegida.
- **O Radar** não reagrupa, não troca a principal e congela as lentes ao
  finalizar.
- **O enum de aplicabilidade** (3 valores), o enum de maturidade, os enums da
  decisão KGR do artigo e os motivos de lente faltante.
- **O Descobrir:** "Medir resultados" manual com o filtro ativo.
- **`engine.ts`** (sinal `kgrOpportunity` com volume ≥ 120) e o filtro do
  Descobrir (120–499). Alinhar à faixa 150–550 muda a eleição de candidatas a
  Silo e exige fatia própria com testes de formação.
- **O núcleo do Labs** fica no código, sem chamador, porque as constantes de
  local são a chave do cache.
- **Serper e RapidAPI** não voltam.

---

## 12. Mudanças para o integrador (arquivos que as fatias não editam)

**`lib/agent/platform-catalog.ts`** (AGENTS.md §17.1; `npm run test:agent`):

- **Pesquisa por Assunto** (`:138-156`):
  - `purpose` passa a "Google Ads (frase e página de destino)";
  - `requires` passa a "Conexão Google Ads da marca";
  - o custo passa a "sem custo no DataForSEO; usa a cota do Google Ads", com
    a confirmação mantida;
  - sai "US$ 0,15, teto US$ 0,20";
  - o volume passa a ser a média do Google Ads, e a estimativa só aparece em
    pesquisas antigas.
- **`minerador.measure_keywords`** (`:204-227`):
  - passa a "Medir Volume" (Google Ads);
  - ganha uma ação opcional "Resultados/SERP", paga e manual, que não entra
    na aprovação;
  - a nota do Assunto passa a "dispensa Volume e KGR".
- **`review_and_approve`** (`:231-246`):
  - passa a exigir "Keywords com Volume e Lógica";
  - `set_kgr_applicability` fica opcional, com padrão não aplicável.
- **Arquiteto** (`:298-345`):
  - a primeira coleta SERP (4 lentes) do lote com volume acontece na aba
    Artigos, antes da formação, com cache primeiro;
  - allintitle da principal por artigo;
  - "Aplicar KGR" com padrão Não e opção de recalcular;
  - a SERP da fase Silos passa a ser só cache, com coleta manual.
- **Diferenciação** (`:360-399`):
  - as keywords novas vêm do Google Ads (frase do ângulo + URL como semente);
  - o custo é só a SERP de até 5 candidatas por página (até US$ 0,014 cada);
  - saem o Labs e o corte "sem pesquisas relacionadas".
- **`radar.investigate`** (`:489-517`):
  - a SERP do Google é lida primeiro do cache, e a coleta do Arquiteto é
    reaproveitada sem custo;
  - keyword sem volume não gera consulta auxiliar;
  - YouTube e Amazon acrescentam e nunca substituem.
- **Regras de SEO** (`:866-879`): "KGR padrão não aplicável; aplicar é
  manual; faixa de volume de interesse 150–550; KGR = allintitle ÷ volume, bom
  abaixo de 0,25".
- **Rotas ou ferramentas novas** do Arquiteto (coleta do lote, allintitle do
  artigo) precisam de entrada no catálogo e em
  `lib/server/platform-mcp-tools.ts`.

**`lib/server/platform-mcp-tools.ts`:**
- as descrições `:640` e `:1100` saem de "sem Lógica, Volume, Resultados ou
  KGR" para "sem Lógica ou Volume";
- `kgrUse` (`:367`) passa a `nao_utilizada` no padrão;
- a descrição de `search_subject_keywords` (`:1001-1006`) passa a Google Ads.
  Recomenda-se manter `annotations` paid e `provider.spend`, porque o Ads
  consome cota e o teste 17 continua verde.

**`lib/agent/silo-plan.ts:209`:** "(plan → confirmação → execute)".

**`package.json`:** nenhuma mudança obrigatória. Se
`tests/minerador-assunto-pesquisa-labs.test.mts` for aposentado, tirar do
script. A recomendação é manter.

**SDDs com adendo do dono das SDDs:**
- `sdd-assunto-tronco-editorial-2026-09-24.md` (F1b.2 fontes 3–5, F1b.4,
  F1b.10);
- `sdd-diferenciacao-publicados-canibalizados-2026-09-27.md` (§3.3–3.5);
- `2026-08-28-sdd-article-kgr-decision-keyword-contextual-presentation.md`
  (§5.1: padrão não aplicável, "Aplicar KGR", allintitle medido pelo
  Arquiteto, faixa 150–550).

**Documentação de módulo ao concluir cada fatia:** `estado-atual.md` e
`backlog.md` do Minerador, do Arquiteto e do Radar. Spec do Minerador: §319 e
§529 (score sempre calculado); §685 (`KGR_DECISION_REQUIRED_WHEN_CALCULABLE`
passa a NO; Resultados sai da trava).

---

## 13. Riscos

| Risco | Mitigação |
| --- | --- |
| Rollback abaixo de M1 recusa aprovadas sem Resultados | Documentado (9); deploy único; não voltar abaixo |
| Minerador para de coletar antes de o Arquiteto coletar o lote | A2 no ar antes ou junto de M1 (6.5) |
| Formação sem índice "mesmo assunto" na primeira rodada | A coleta do lote vem antes da formação (3.3) |
| Sucessoras em massa do ArticleDNA ao trocar a regra do KGR | Guarda de versionamento (8) |
| Radar paga de novo por divergência de códigos | R1 prova a chave e corrige `keyword-serp` |
| Dossiê perde o Google com YouTube ou Amazon | R3, aditivo, só em dossiês novos |
| Idempotência mais fraca na Pesquisa por Assunto sem chamada DataForSEO | Trava da instância mais chaves do Ads; a repetição gasta cota, sem custo. Documentar |
| Diferenciação sem `ranked_keywords` perde a faixa "ranked" | Registrar no estado atual: mais "Diferenciação fraca"; a semente por URL não liga `rankedByUrl` |
| Intenção e funil sem SERP no Radar | `expectedIntent` vazio pula a comparação; a indicação da Lógica não é autoridade de SERP |
| Validade de 30 dias expira antes do Radar | Decisão D4 do dono continua aberta; nada muda aqui |

Ponto a confirmar com o dono, que não bloqueia as fatias M1–M4, D1–D2 e
A1–A3: **artigo sem nenhuma keyword com volume**, como um publicado com
Posto Livre cuja principal não tem volume. A recomendação é concluir com
aviso "sem SERP: nenhuma keyword com volume", sem coletar. Um artigo novo
nessa condição não se forma (D2.3). Até a confirmação, a fatia A3 mantém o
bloqueio de hoje só para esse caso.
