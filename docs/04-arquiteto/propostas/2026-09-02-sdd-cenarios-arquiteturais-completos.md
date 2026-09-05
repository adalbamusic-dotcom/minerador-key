# SDD — Cenários arquiteturais completos (Lógica / SERP / IA / Humano → Atual)

> ## Aviso de status — 2026-09-02, decisão do Planner Geral
>
> ```
> PREVIOUS_ARTICLE_SCENARIO_SDD_STATUS = SUPERSEDE_ON_NEW_SDD_APPROVAL
> DOCUMENT_RETENTION                   = PRESERVE — não apagar
> PHASE_1                              = PRESERVE_AND_EXTEND (implementada e válida)
> PHASES_2_TO_6                        = IMPLEMENTATION_PAUSED agora;
>                                        CANCELADAS/SUPERSEDIDAS quando a
>                                        SDD Silo-first for aprovada
> ```
>
> Documento sucessor:
> [SDD — Arquitetura Silo-first](2026-09-02-sdd-arquitetura-silo-first.md).
>
> **Fase 1 permanece válida.** `lib/arquiteto/architecture-scenario.ts` e
> `tests/arquiteto-architecture-scenario.test.mts` (20 testes) continuam em
> `main`. A SDD Silo-first os **estende aditivamente** com `level: "silo" |
> "article"` — não reverte, não reescreve e não altera nenhuma expectativa de
> teste. Payload sem `level` é tratado como `article` **somente** numa borda de
> compatibilidade nomeada e isolada; o domínio novo exige `level` explícito.
>
> **Conceitos reaproveitados pela SDD sucessora:** `scenarioType`, base,
> `capability`, `universe`, `provenance`, `sourceRefs`, diff, adoção, histórico e
> comparação.
> **Premissa não reaproveitada:** o universo Article-first global da Brand.
> **Não reaproveitado:** `SiloScenario` nunca usa `articles[] +
> ungroupedKeywordIds[]` — os payloads dos dois níveis são semanticamente
> distintos.
>
> **Correções de fato da auditoria de 2026-09-02:**
> 1. a tabela `editorial_architect_work_copy` citada em §5 **não existe** — a
>    working copy do Arquiteto são linhas de `editorial_workflow_items`
>    (`subject_type='keyword'`, `stage='architect'`, `state='received'`);
> 2. o `artifact_type` `serp_architecture_scenario` proposto em §5/§7/§19 **não
>    está autorizado** e não é herdado pela SDD sucessora: `DDL = 0`,
>    `CHECK_CHANGE = 0`. A necessidade de snapshot persistido volta a ser
>    hipótese, a ser provada só na fase da SERP territorial.

- **Módulo:** Arquiteto
- **Estado:** SDD_STATUS = APPROVED (com emendas obrigatórias incorporadas em 2026-09-02)
  · **SUPERSEDE_ON_NEW_SDD_APPROVAL** · Fase 1 entregue e preservada · Fases 2–6 pausadas
- **Escopo:** contrato de projeção e comparação de arquiteturas candidatas
- **Fora de escopo:** Silos, InternalLinkGraph, Radar, Planejador, provider SERP,
  provider DeepSeek, KeywordDNA, UI (implementação posterior)

## 1. Objetivo e limites

Permitir que o Workbench compare **arquiteturas candidatas completas** produzidas
por Lógica, SERP, IA e Humano sobre o mesmo universo de KeywordDNAs, e que o
humano consolide uma delas — com ajustes — como Atual.

Nenhum cenário altera o estado canônico. Cenário é projeção; Atual é a única
arquitetura confirmada.

Esta SDD **não** autoriza implementação. Ela define contrato, storage,
compatibilidade e plano de teste para aprovação.

## 2. Fontes e método

Auditoria de código em 2026-09-02 sobre: `lib/arquiteto/engine.ts`,
`lib/arquiteto/serp-formation.ts`, `lib/arquiteto/contracts.ts`,
`lib/arquiteto/manual-architecture.ts`, `app/api/arquiteto/serp/route.ts`,
`app/api/revalidate-structure/route.ts`, `modules/arquiteto/arquiteto-workspace.tsx`,
`modules/arquiteto/arquiteto-workbench.tsx`. Nenhum código foi alterado.

## 3. Estado atual comprovado

### 3.1 Capacidade semântica por processo

| operação | LOGIC | SERP | AI | HUMAN |
|---|---|---|---|---|
| KEEP_ARTICLE | sim | sim | sim | sim |
| CREATE_ARTICLE | sim | só 1 keyword (`separar_artigo`) | sim (`newArticleKey`) | só 1 keyword |
| DISSOLVE_ARTICLE | sim | implícito | implícito | implícito |
| SPLIT_ARTICLE | sim | sem membership | sim (`newArticleKey` compartilhada) | 1 por vez |
| MERGE_ARTICLES | sim | **não** | sim (mover todas) | por movimentos |
| MOVE_KEYWORD | sim | **não** (sem destino) | sim (`targetGroupId`) | sim |
| UNGROUP_KEYWORD | sim | sim (`retirar_do_artigo`) | **não** | sim |
| CHANGE_PRINCIPAL | sim | sim (`tornar_principal`) | sim (`suggestedRole`) | sim |
| CHANGE_ROLE | sim | sim | sim | sim |

```
SERP_CURRENT_SCOPE = um Article por assessment (SerpFormationAssessment.articleId)
AI_CURRENT_SCOPE   = decisões por keyword com sourceGroupId/targetGroupId/newArticleKey,
                     persistidas por Article em article_architecture_ai_review
```

### 3.2 Achado que muda a análise da SERP

```
SERP_RECEIVES_OTHER_ARTICLE_CATALOG = SIM
SERP_RECEIVES_CROSS_ARTICLE_CONTEXT = SIM (no input)
SERP_CAN_COMPARE_ARTICLES_TODAY     = NÃO (na saída)
```

`POST /api/arquiteto/serp` já recebe `groups: ProvisionalArticleGroupSchema[]`
(até 20) — a partição candidata inteira. O contexto cross-Article **existe na
execução**; o que não existe é vocabulário de saída para registrá-lo.

`buildSerpFormationEvidence` calcula `overlaps` apenas entre snapshots do mesmo
Article (`serp-formation.ts:369-383`). Portanto a evidência de sobreposição
cross-Article — que sustentaria MERGE ou MOVE — **não é computada hoje**, embora
os dados de entrada permitam computá-la.

### 3.3 Cenários do mapa hoje são cópias

`ArchitectMapScenario = "current" | "logic" | "serp" | "ai"`. Em
`arquiteto-workspace.tsx:2182` e `:3005`:

```js
setMapSerpArticlesSnapshot(previous => previous || architectureMapSnapshots.current.articles);
setMapAiArticlesSnapshot(previous => previous || architectureMapSnapshots.current.articles);
```

Os cenários SERP e IA são snapshots da arquitetura vigente no instante da
execução — por construção nunca divergem da base. Não existe cenário Humano nem
Base. `current` cai em `logicArticles.length ? logicArticles : currentArticles`,
ou seja, Atual pode exibir Lógica sem confirmação humana.

## 4. Contrato proposto: `ArchitectureScenario`

Read-model puro compartilhado pelos cinco cenários, em `lib/arquiteto/`.

```ts
ArchitectureScenario {
  schemaVersion: 1
  brandId: string
  scenarioType: "base" | "logic" | "serp" | "ai" | "human" | "current"
  baseRef: { scenarioType; contentHash }          // contra o que o candidato foi produzido
  provenance: ScenarioProvenance
  articles: ArticleScenario[]
  ungroupedKeywordIds: string[]
  capability: "complete" | "partial"              // ver §7
  contentHash: string
}

ArticleScenario {
  articleKey: string                              // provisionalGroupId || clusterId || id
  publishedAnchorId: string | null
  principalKeywordId: string
  keywords: Array<{ keywordId: string; role: "principal" | "secundaria" | "reforco_narrativo" }>
  protections: { principalPolicy: "locked" | "reviewable" | "unknown" | null; publishedUrl: string | null }
}

ScenarioProvenance =
  | { kind: "logic"; engine: "deterministic" }
  | { kind: "serp";  assessments: Array<{ articleId; assessmentId; version; contentHash }> }
  | { kind: "ai";    reviews:     Array<{ articleId; versionId; contentHash }> }
  | { kind: "human"; adoptedFrom: ScenarioType | null; humanChangeCount: number }
  | { kind: "current"; confirmedBy: string; confirmedAt: string; adoptedFrom: ScenarioType | null }
```

**Invariantes validadas pelo schema:** cada keywordId aparece exatamente uma vez
no cenário (em um Article ou em `ungroupedKeywordIds`); cada Article tem
exatamente uma Principal e no máximo 6 keywords; `principalKeywordId` pertence a
`keywords`; nenhum cenário atravessa `brandId`.

## 5. Storage: derivar onde for determinístico, persistir só o resto

```
ARCHITECTURE_SCENARIO_STORAGE_KIND = snapshot materializado + refs de proveniência,
                                     persistido apenas quando não é derivável
```

| cenário | origem | persiste? |
|---|---|---|
| BASE | working copy no início do ciclo (§8) | não — referência |
| LOGIC | `buildDeterministicArticleArchitecture` sobre a working copy | não — derivado |
| HUMAN | working copy vigente | não — já é `editorial_architect_work_copy` |
| AI | materializado dos `article_architecture_ai_review` já persistidos | não — derivado |
| SERP | **não derivável** hoje | **sim** — novo artifact |
| CURRENT | confirmação humana explícita | sim — ver §9 |

Descartei "delta/operações" como formato persistido primário: a materialização
da SERP exige consolidar N assessments por Article em uma partição global, e um
delta sem snapshot obrigaria reexecutar essa consolidação a cada leitura, com
resultado dependente da base do momento. O snapshot congela o que aquele processo
propôs; `baseRef` + `provenance` preservam a cadeia até KeywordDNA/SERP/IA.

```
NEW_TABLE_REQUIRED             = NÃO
NEW_COLUMN_REQUIRED            = NÃO
NEW_ARTIFACT_TYPE_REQUIRED     = SIM — serp_architecture_scenario
EXISTING_ARTIFACT_EXTENSION_REQUIRED = SIM — enum de KeywordArticleDecision.action
SCHEMA_DDL_REQUIRED            = apenas ampliar o CHECK de artifact_type,
                                 mesmo padrão já aplicado duas vezes
```

**Emenda aprovada.** O cenário da SERP é **global do ciclo**, nunca escopado a um
Article. Em `editorial_artifact_versions`: `entity_id = brandId`,
`artifact_type = serp_architecture_scenario`, payload = `ArchitectureScenario`.
Um cenário é sustentado por **vários** `SerpFormationAssessment` — por isso a
proveniência é uma **lista** `sourceRefs`, nunca um único `source_version_id`.
Versionamento, `previous_version_id`, `content_hash` e idempotência vêm da
fundação existente.

## 6. Opções avaliadas

### Opção A — estender os contratos atuais de SERP e IA

Adicionar `targetArticleId` e `newArticleKey` a `SerpKeywordRecommendationSchema`
e `retirar_do_artigo` a `KeywordArticleDecision.action`.

- **Contra:** quebra o significado do `SerpFormationAssessment`, que é evidência
  **por Article** com versionamento e stale por Article. Uma recomendação com
  destino em B, gravada no assessment de A, cria dependência entre versões de
  artefatos independentes: revalidar B invalidaria semanticamente o assessment de
  A sem que nada em A tenha mudado. O modelo de `evaluationStatus`/`outdated`
  atual não expressa isso.
- **Contra:** MERGE continua inexprimível — não há onde declarar que A e B viram
  um só, porque nenhum assessment é dono dessa decisão.
- **A favor:** mudança pequena, sem novo artifact.

### Opção B — evidência por Article + camada de cenário consolidado

Preservar `SerpFormationAssessment` e `KeywordArticleReview` como estão. Introduzir
`ArchitectureScenario` como read-model comum e persistir apenas o cenário da SERP.

- **A favor:** cada artefato mantém seu escopo e seu ciclo de vida. A consolidação
  cross-Article passa a ser um passo explícito, com proveniência declarada.
- **A favor:** um contrato, um diff, um consumidor de mapa para os cinco cenários.
- **A favor:** aditivo — nenhum artefato existente muda de forma.
- **Contra:** um artifact_type novo e um passo de materialização a manter.

### Opção C — híbrida

Opção B **mais** uma ampliação aditiva mínima do enum da IA.

## 7. Recomendação

```
RECOMMENDED_ARCHITECTURE = OPÇÃO C (B como espinha dorsal + ampliação aditiva do enum da IA)
```

1. **`ArchitectureScenario`** como read-model compartilhado (§4).
2. **SERP:** novo artifact `serp_architecture_scenario`, materializado a partir
   dos assessments vigentes + a partição de entrada que a rota já recebe. A
   evidência cross-Article (overlap entre keywords de Articles diferentes) passa a
   ser computada na execução — os snapshots necessários já são coletados.
3. **IA:** ampliar `KeywordArticleDecision.action` com `"retirar_do_artigo"`.
   Aditivo, retrocompatível (decisões antigas continuam válidas), e fecha a única
   lacuna do vocabulário da IA. O cenário da IA continua **derivado** dos artefatos
   já persistidos — sem novo storage.
4. **Humano e Lógica:** derivados, sem contrato novo.
5. **Atual:** §9.

```
SERP_CONTRACT_CHANGE  = nenhum no assessment; novo artifact de cenário consolidado
AI_CONTRACT_CHANGE    = enum de action +1 valor (aditivo)
HUMAN_CONTRACT_CHANGE = nenhum
```

**`capability`** no cenário resolve o histórico: um cenário SERP materializado de
assessments antigos, sem evidência cross-Article, nasce `partial` e não inventa
destino — a UI mostra "recomendação sem destino definido, decisão humana".

## 8. BASE

`BASE` é a arquitetura vigente **no início do ciclo de revisão**, não a Lógica.

- Article com ArticleDNA consolidado → BASE = a arquitetura desse ArticleDNA.
- Article em formação → BASE = a working copy imediatamente antes da execução do
  primeiro processo do ciclo.

Não cria estado novo: é a mesma referência que `ArticleAiReviewBase.articleContentHash`
já congela hoje por Article. A implementação deve reusar essa base, elevada ao
escopo da Marca.

## 9. CURRENT e confirmação

```
CURRENT_CONFIRMATION_MODEL = confirmação humana explícita, com proveniência mista
```

Proibido: `currentScenario = logicScenario` como fallback. Sem confirmação, o
trilho mostra **Base**, não **Atual**.

A confirmação grava um `ArchitectureScenario` com `scenarioType: "current"` e
`provenance.kind: "current"`, registrando `adoptedFrom` (o candidato de partida,
se houver) **e** o snapshot resultante. Isso preserva "SERP + 3 ajustes humanos"
sem reduzir o Atual ao rótulo "SERP".

A implementação deve primeiro verificar se `confirmArticleArchitecture`
(`lib/arquiteto/architecture-confirmation.ts`) e o ArticleDNA aprovado já cumprem
esse papel por Article; em caso positivo, `current` é derivado deles e o artifact
de cenário é dispensável. **Essa verificação é um pré-requisito da implementação,
não uma conclusão desta SDD.**

## 10. Diff

```ts
deriveArchitectureScenarioDiff(reference: ArchitectureScenario, candidate: ArchitectureScenario): ScenarioDiffEntry[]
```

Tipos: `ARTICLE_CREATED`, `ARTICLE_REMOVED`, `ARTICLE_SPLIT`, `ARTICLE_MERGED`,
`KEYWORD_MOVED`, `KEYWORD_UNGROUPED`, `PRINCIPAL_CHANGED`, `ROLE_CHANGED`.

Função pura, derivada, sem estado. Nunca é fonte de verdade do cenário.

## 11. Ganhos, perdas e mudanças

Três categorias distintas, nunca misturadas:

- **MUDANÇAS** — fato objetivo do diff (N keywords movidas, Principal alterada…).
- **GANHOS** — só quando sustentados pelos dados daquele processo:
  compatibilidade de intenção (`intentCompatibility`), redução de sobreposição
  (`overlaps`), centralidade da Principal, proteção publicada preservada.
- **PERDAS/RISCOS** — cobertura perdida, Article novo ainda sem SERP, análise
  anterior stale, proteção publicada em risco, evidência insuficiente, conflito novo.

**Proibido** derivar ranking, tráfego ou receita. Volume somado é comparação
estrutural, nunca ganho de tráfego.

## 12. Versionamento, stale e histórico

```
VERSIONING       = sucessora por content_hash na fundação existente; UNCHANGED em reexecução idêntica
STALE_POLICY     = cenário cujo baseRef.contentHash difere da base atual é histórico, nunca vigente,
                   e nunca degrada para "não executado" (regra já implementada para a revisão IA)
BASE_REFERENCE   = baseRef { scenarioType, contentHash }
SOURCE_REFERENCES= provenance por processo, encadeando até assessment/review/KeywordDNA
```

Lógica, SERP e IA históricas não mudam quando o Humano edita. Reexecução gera
nova versão; nunca reescreve.

## 13. Proteções

Todo cenário valida: `brandId` único, máximo 6 keywords, exatamente 1 Principal,
`primaryKeywordPolicy` da Principal publicada, slug/canonical/URL protegidos,
cross-brand proibido. Uma recomendação bloqueada pode ser **exibida** com o motivo,
mas o cenário não a materializa como aplicável.

## 14. Compatibilidade

```
BACKWARD_COMPATIBILITY = aditiva; nenhum artefato existente muda de forma
```

- Assessments SERP antigos → cenário `capability: "partial"`; sem destino, sem
  invenção. Continuam legíveis e válidos como evidência.
- Reviews IA antigas → materializam normalmente; `retirar_do_artigo` simplesmente
  não aparece nelas.
- Nenhuma reescrita de payload, hash ou versão histórica.

## 15. Consumidores

```
CONSUMERS = Workbench (ArchitectMapScenario, snapshots, painel de ganhos/perdas)
            React Flow (nodes/edges por cenário)
            Revisão Humana (adotar candidato, ajuste fino, confirmar)
            article-consolidation / ArticleDNA (Atual como entrada)
            serp-assessment-registry, serp-formation-verdict
            ai-strategic-payload (projeção da SERP para a IA)
            silo-consolidation (lê SerpFormationAssessment — não muda)
            editorial/operational-flow, editorial-pipeline-context
            Radar gate/handoff — NÃO alterado nesta frente
            tests: arquiteto-workbench, arquiteto-serp-formation,
                   arquiteto-ai-*, arquiteto-manual-architecture*
```

## 16. Riscos

```
RISKS
  1. Materialização da SERP produzir partição que o avaliador não sustenta.
     Mitigação: capability/partial + destino só com evidência de overlap cross-Article.
  2. Novo artifact_type exigir aplicação remota do CHECK antes do código funcionar.
     Precedente conhecido: a revisão IA ficou dias falhando por isso. Mitigação:
     aplicar o CHECK e verificar ANTES do deploy do código.
  3. Custo de execução da SERP: overlap cross-Article é O(n²) sobre snapshots já
     coletados — sem chamada nova ao provider, mas com custo de CPU no servidor.
  4. Divergência entre cenário derivado e working copy se a base mudar durante a
     sessão. Mitigação: baseRef + política de stale.
  5. Confusão de produto entre "adotar candidato" e "confirmar Atual".
     Mitigação: duas ações distintas, §9.
```

## 17. Rollback

```
ROLLBACK = aditivo e reversível sem apagar histórico
  - remover a leitura do artifact de cenário: o mapa volta ao comportamento atual;
  - o valor extra do enum da IA pode deixar de ser emitido sem invalidar decisões gravadas;
  - reverter o CHECK exige antes decidir o destino de linhas já gravadas com o tipo novo
    (mesma nota da migration de article_architecture_ai_review);
  - nenhum dado é apagado em nenhum caminho de rollback.
```

## 18. Plano de teste da implementação

```
TEST_PLAN
  contrato: partição completa; keyword em exatamente um lugar; 1 Principal; máx 6;
            cross-brand recusado; principal pertence a keywords
  materialização: logic, serp (complete e partial), ai, human, current
  operações: create, dissolve, split, merge, move, ungroup, principal, role
  diff: os 8 tipos, incluindo split e merge
  compatibilidade: assessment antigo → partial sem destino inventado;
                   review antiga sem retirar_do_artigo → materializa
  humano: adota SERP → HUMAN == SERP; ajusta → HUMAN != SERP e SERP imutável
  current: só após confirmação; edição posterior não altera o Atual confirmado
  histórico: LOGIC/SERP/AI imutáveis após edição humana
  proteções: published locked exibido como bloqueado, nunca aplicável
  ganhos/perdas: nenhuma métrica de ranking/tráfego/receita
  mapa: React Flow consome o cenário selecionado, não a masterList
  nenhum provider chamado automaticamente em qualquer caminho
```

## 19. Autorização necessária

Esta SDD altera contrato compartilhado persistido e o CHECK remoto. Conforme
AGENTS.md §"alterações estruturais", exige aprovação antes da implementação:

1. novo `artifact_type = serp_architecture_scenario`;
2. ampliação aditiva do enum `KeywordArticleDecision.action`;
3. cálculo de evidência de overlap cross-Article na execução da SERP.

Sem aprovação, a frente permanece parada — o lote intermediário foi descartado
pelo Planner.

## 20. Emendas obrigatórias aprovadas — 2026-09-02

`SDD_STATUS = APPROVED_WITH_MANDATORY_AMENDMENTS` → incorporadas abaixo.

1. **Escopo do cenário SERP:** global do ciclo (`entity_id = brandId`), nunca
   `entity_id = articleId`. Incorporado em §5.
2. **Universo declarado:** todo cenário declara `universe { keywordIds[], contentHash }`.
   Comparar cenários de universos diferentes é proibido — o validador reporta
   `UNIVERSE_HASH_MISMATCH`. Impede comparar silenciosamente um cenário antigo de
   10 keywords com uma working copy de 12.
3. **Proveniência múltipla:** `sourceRefs` é lista. Um cenário SERP referencia N
   assessments; um cenário IA referencia N reviews.
4. **Overlap cross-Article não cria chamada ao provider:** o cálculo usa snapshots
   já coletados na mesma execução. Custo é de CPU no servidor, nunca de API paga.
5. **Ganhos/perdas são derivados, nunca persistidos como verdade.** Fase posterior,
   sobre diff + evidência SERP + racional da IA + proteções.
6. **Artifact de CURRENT não autorizado.** `scenarioType: "current"` existe no
   read-model, mas `NEW_CURRENT_ARTIFACT = PROIBIDO` até auditar
   `confirmArticleArchitecture`, o ArticleDNA aprovado e o versionamento da
   working copy confirmada.
7. **Ordem das fases:**
   - **Fase 1** — contrato comum, invariantes, universo, validador, normalizador
     e diff. Domínio puro, sem storage, sem UI. *(esta entrega)*
   - **Fase 2** — materialização do cenário Lógica.
   - **Fase 3** — cenário Humano e adoção de candidato.
   - **Fase 4** — cenário IA derivado (+ enum `retirar_do_artigo`).
   - **Fase 5** — `serp_architecture_scenario` + overlap cross-Article + CHECK remoto.
   - **Fase 6** — mapa, trilho, ganhos/perdas e confirmação de CURRENT.
