# Relatório 2 — Matriz atual do contrato Arquiteto → Radar — 2026-09-05

Auditoria somente diagnóstica sobre o checkout `b3a312b` com working tree
preservado. Escritor e leitor reais localizados no código; nenhuma conclusão
tirada só de tipo ou interface. `PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` ·
`CODE_FILES_CHANGED = 0`.

---

## 0. Achado que precede a matriz

> **O import Arquiteto → Radar está recusado hoje, nas duas telas, por
> incompatibilidade de schema.**

O commit `ae72add` (Arquiteto) acrescentou `siloIdProvenance` a
`ResolvedSiloContext` (`lib/arquiteto/radar-handoff-context.ts:53`, `:121`).
Esse objeto é enviado *inteiro* no `handoffContext` do comando `import_radar`.
O schema do comando — `lib/editorial/persistence-contracts.ts:80-96` — declara
`silo` como `z.object({…}).strict()` **sem** esse campo, e não foi atualizado
(último commit do arquivo: `aa0e60d`, anterior).

Verificado empiricamente com o schema real do checkout:

```
SEM siloIdProvenance                              -> ACEITO
COM siloIdProvenance (o que as telas mandam hoje) -> REJEITADO
      unrecognized_keys @ handoffContext.<articleId>.silo
      :: Unrecognized key: "siloIdProvenance"
```

Cadeia da consequência:

```
resolveCanonicalSiloForArticle → contexto.silo (13 campos)
   → importApprovedToRadar → sendWorkflowCommand({action:"import_radar", handoffContext})
   → POST /api/editorial/workflow
   → WorkflowCommandSchema.parse(...)  ✗ ZodError
   → 400 { error: "Comando editorial inválido." }        (route.ts, catch)
   → sendWorkflowCommand: ok=false, code="http_400"      (pipeline-context.ts:860-868)
   → importApprovedToRadar: imported=0, cada artigo em `blocked`
```

As duas telas mandam o mesmo objeto:
`modules/arquiteto/arquiteto-workspace.tsx:3851` (`silo: resolucao.context`) e
`components/editorial-pipeline-context.tsx:684`
(`silo: entry.silo`, vindo de `buildRadarHandoffContexts`). **Nenhuma das duas
remove o campo.** Logo o bloqueio é total, não parcial.

Por que nada pegou isso:

| Guarda | Por que passou |
| --- | --- |
| `tsc` | O tipo TS (`RadarArticleHandoffContext.silo: ResolvedSiloContext`) **tem** o campo; a divergência só existe no Zod `.strict()`, avaliado em runtime. 5 erros de TS hoje, nenhum aqui. |
| Suíte | `WorkflowCommandSchema` não é exercitado por nenhum teste — busca em `tests/*.mts` retorna zero referências. |
| `test:arquiteto` 1480/1479/1 | Verde, e legitimamente: o lado emissor está correto. O contrato quebrado é o do canal. |

**Efeito colateral positivo:** graças ao commit `e4c5733`, a recusa é honesta —
`imported: 0` com o motivo do servidor por artigo, sem estado local. O
mecanismo de importação fantasma está fechado; o que está quebrado é a
importação em si.

`DOCUMENTATION_DRIFT = YES` — ver §6.

---

## 1. Matriz de campos

Legenda de classificação ao final de cada linha.
"Persistido?" = chega ao payload de `editorial_workflow_items` gravado pelo
handler `import_radar`.

| Campo | Produzido por | Persistido? | Transportado? | Validado server-side? | Hidratado no Radar? | Consumido funcionalmente? | Repassado ao pacote/handoff? | Classificação |
| --- | --- | :-: | :-: | --- | :-: | --- | :-: | --- |
| `brandId` | `importArticlesToRadar` · `operational-flow.ts:227` | sim (`marca_id` + payload) | sim | **sim** — `validado.brandId !== command.brandId` → 409 (`workflow/route.ts:44`) | sim | sim — escopo de tudo, envelope, rota SERP | sim | `REQUIRED_AND_CONSUMED` |
| `articleId` | idem | sim (`article_id` + payload) | sim | **sim** — `:41` | sim | sim | sim | `REQUIRED_AND_CONSUMED` |
| `articleDnaVersionId` | idem | sim | sim | **sim** — `:42` | sim | sim — escopo, envelope, readback `GET /api/editorial/serp` | sim | `REQUIRED_AND_CONSUMED` |
| `articleDnaContentHash` | idem | sim | sim | **sim** — `:43` | sim | sim — `radar-analysis-page.tsx:517` alimenta `provenance` do handoff | sim | `REQUIRED_AND_CONSUMED` |
| keyword principal (id) | `principalKeywordId` do ArticleDNA | sim | sim | indireto (schema) | sim | sim — `resolvePrimaryKeyword`, envelope, query SERP | sim | `REQUIRED_AND_CONSUMED` |
| keyword principal (texto) | `hydration.principalKeyword` · `hydration.ts:140` | sim | sim | via `hydrationByArticleId` no comando | sim | sim — a coleta usa texto, nunca id | sim | `REQUIRED_AND_CONSUMED` |
| secundárias/reforços (refs) | `arquitetoKeywordDnaReferences` · `operational-flow.ts:234` | sim | sim | não | sim | **não no Radar** — lido só pelo Arquiteto (`arquiteto-workspace.tsx:3914`) | não | `TRANSPORTED_BUT_UNUSED` |
| secundárias/reforços (texto+aliases) | `hydration.keywordSnapshots` | sim | sim | via comando | sim | **sim** — `route-resolution.ts:44`, `radar-page.tsx:101` | indireto | `REQUIRED_AND_CONSUMED` |
| `arquitetoKeywordUrlRelations` | `operational-flow.ts:235` | sim | sim | não | sim | **não** | não | `TRANSPORTED_BUT_UNUSED` |
| `siloId` | `handoffContext.silo.siloId` ‖ `payload.siloId` · `:225` | sim | sim | **sim** — item sem Silo é recusa nomeada (`route.ts:37-39`) | sim (obrigatório no schema) | sim — rótulo, envelope, checagem de posse na rota SERP | sim (`PlannerItem.siloId`) | `REQUIRED_AND_CONSUMED` |
| **provenance de `siloId`** | `siloIdProvenance` · `radar-handoff-context.ts:121` | **não** | **enviado e REJEITADO** | — | **não** | não | não | `MISSING_FROM_HANDOFF` ⚠ bloqueante |
| `territoryRef` | `hydration.silo.territoryRef` · `hydration.ts:132` | sim | sim | não | sim | **não** | não | `TRANSPORTED_BUT_UNUSED` |
| SiloDNA version/hash | `hydration.silo.siloDnaVersionId/ContentHash` | sim | sim | não | sim | parcial — o objeto inteiro entra no `RadarSerpResolutionEnvelope` (`resolution-envelope.ts:195`), mas só `silo.id` é usado na rota | **não desta origem**: o handoff lê `siloDnaVersionId` de `pipeline.siloVersions` | `OPTIONAL_AND_CONSUMED` (parcial) |
| SiloPage (id/version/slug/canonical/status) | `hydration.silo.siloPage*` · `hydration.ts:33-37` | sim | sim | não | sim | **não** — nenhum leitor em `modules/radar`/`lib/radar` | não | `TRANSPORTED_BUT_UNUSED` |
| Pilar/Suporte — declaração do artigo | `RadarItem.hierarchy` (= `ArticleDNA.hierarchy`) | sim | sim | schema | sim | **sim** — coluna, `format`, `articleRole` do painel de especialista | sim | `REQUIRED_AND_CONSUMED` |
| Pilar/Suporte — papel no Silo | `hydration.silo.articleRole` (de `SiloDNA.pillarArticleId`) | sim | sim | não | sim | **não** | não | `TRANSPORTED_BUT_UNUSED` |
| `publicationContext` | — | **não existe campo** | não | — | não | derivado no Radar de `operationalPublications` e `identity.publication` | parcial | `DERIVED_LEGACY` |
| `arquitetoStrategyContext` | `buildArticleControlContext` no import · `:237` | sim | sim | não | sim | **sim, só na rota de detalhe** — `radar-analysis-page.tsx:190` (`buildRadarKgrStrategy`) | sim, via `evidencePackage.kgrStrategy` | `OPTIONAL_AND_CONSUMED` |
| `arquitetoKgrIdentity` | `ArticleDNA.kgrIdentity` · `:238` | sim | sim | não | sim | **sim** — `radar-page.tsx:341`, sugestão de modo | indireto | `OPTIONAL_AND_CONSUMED` |
| `arquitetoSerpAssessment` | `serpAssessments[articleId]` · `:239` | **NÃO** — o handler reconstrói com `serpAssessments = {}` (`route.ts:35`) | só no cliente | não | só até o próximo reload remoto | **não** | não | `TRANSPORTED_BUT_UNUSED` + furo de persistência |
| `arquitetoSerpProvenance` (verdict) | `buildArchitectSerpProvenance` → `handoffContext` · `:240` | sim | sim | não | sim | **não** — zero leitores | não | `TRANSPORTED_BUT_UNUSED` |
| resolução humana da formação | `arquitetoSerpProvenance.humanResolution` | sim | sim | não | sim | **não** | não | `TRANSPORTED_BUT_UNUSED` |
| conflitos de formação | `arquitetoArchitectureStatus` · `:236` | sim | sim | não | sim | **não** | não | `TRANSPORTED_BUT_UNUSED` |
| `arquitetoInternalLinks` (graph ref/version/hash) | `relevantEdgesForArticle` → `handoffContext` · `:241` | sim | sim | não | sim | **não** — zero leitores | não | `TRANSPORTED_BUT_UNUSED` |
| `anchorConcepts` | dentro de `arquitetoInternalLinks.edges[]` | sim | sim | não | sim | **não** | não | `TRANSPORTED_BUT_UNUSED` |
| `internalLinkGraphRef` (no handoff v2) | `RadarPlannerHandoffSchema` · `analysis-contracts.ts:190` | n/a | n/a | validado se presente (`planner-handoff.ts:32`) | n/a | — | **nenhum chamador o preenche** — a única chamada (`radar-analysis-page.tsx:510-530`) não passa o argumento | `MISSING_FROM_HANDOFF` |
| `handoffContext` (contêiner) | as duas telas | **efêmero** — não é gravado como objeto; suas projeções entram no `RadarItem` | sim | **schema `.strict()`** — hoje recusa | — | — | — | ver §0 |
| `siloIdProvenance` agregado | `legacyHydratedHandoffArticleIds` · `radar-handoff-context.ts:305-310` | não | não | — | não | consumido só no Arquiteto (`arquiteto-workspace.tsx:3880`, contador) | não | Arquiteto-only |

### Contagem

| Classificação | Campos |
| --- | ---: |
| `REQUIRED_AND_CONSUMED` | 8 |
| `OPTIONAL_AND_CONSUMED` | 3 (um deles só na rota de detalhe; um parcial) |
| `TRANSPORTED_BUT_UNUSED` | **10** |
| `MISSING_FROM_HANDOFF` | 2 |
| `DERIVED_LEGACY` | 1 |

---

## 2. Revalidação dos dois campos apontados como mortos

Pedido explícito: não assumir que continuam mortos.

| Campo | Leitores em `modules/radar` + `lib/radar` | Veredito |
| --- | ---: | --- |
| `arquitetoSerpProvenance` | **0** | **continua morto** |
| `arquitetoInternalLinks` | **0** | **continua morto** |

Busca literal por todos os `arquiteto*` do `RadarItem` em `modules/`, `lib/`,
`components/` e `app/`, excluindo o próprio arquivo de definição, devolve
exatamente **três** consumidores:

```
modules/radar/radar-analysis-page.tsx:190  → arquitetoStrategyContext
modules/radar/radar-page.tsx:341           → arquitetoKgrIdentity
modules/arquiteto/arquiteto-workspace.tsx:3914 → arquitetoKeywordDnaReferences (readback do próprio Arquiteto)
```

Dos **9** campos `arquiteto*` do `RadarItemSchema`, o Radar lê **2**.

Nuance nova em relação ao parecer anterior: `arquitetoSerpAssessment` não é só
não-consumido — ele **nem chega ao banco**. O handler reconstrói o `RadarItem`
passando `{}` como `serpAssessments` (`app/api/editorial/workflow/route.ts:35`),
então o valor existe apenas no objeto local do cliente e desaparece no primeiro
reload remoto. É o único campo do contrato com divergência
cliente↔servidor no conteúdo persistido.

---

## 3. Respostas

### 1. Os dois caminhos de importação ainda existem?

**Sim, dois, inalterados.**

| Caminho | Entrada | Chamada |
| --- | --- | --- |
| **A — Arquiteto** | "Enviar ao Radar" | `arquiteto-workspace.tsx:3870` → `importApprovedToRadar(articleIds, masterList, serpByArticle, contexto, approvedLinkGraphs)` |
| **B — Radar** | "Importar do Arquiteto" | `radar-page.tsx:652` → `importApprovedToRadar(ids, [], {}, {}, graphs)` |

`IMPORT_PATHS_COUNT = 2`.

### 2. Produzem o mesmo contexto?

**Não.**

| Insumo | A (Arquiteto) | B (Radar) |
| --- | --- | --- |
| `sourceKeywords` | `masterList` completo | `[]` → cai no fallback `snapshots[workspaceKey]?.keywords` (`pipeline-context.ts:663`) — equivalente na prática |
| `serpAssessments` | `serpByArticle` (real) | `{}` |
| `handoffContext.silo` | resolvido no Arquiteto | **re-resolvido** por `buildRadarHandoffContexts` (`:675-681`) — mesmo builder, mesmo resultado |
| `handoffContext.internalLinks` | `relevantEdgesForArticle` com grafos carregados | idem, via `graphs` passados pela tela |
| `handoffContext.serpProvenance` | `buildArchitectSerpProvenance(...)` | **`null` fixo** (`:684`) |

### 3. Campo que um caminho preserva e o outro perde?

**Dois:**

1. **`serpProvenance`** — A preenche, B fixa em `null`. É o parecer da SERP de
   formação com a resolução humana: o caminho B importa um artigo sem saber que
   uma divergência já foi vista e decidida.
2. **`arquitetoSerpAssessment`** — A envia `serpByArticle`, B envia `{}`. *Mas
   isto é academicamente irrelevante hoje*: o servidor descarta o campo nos dois
   caminhos (§2), então a diferença só existe na aba aberta.

Efeito líquido após persistência: **a única perda real do caminho B é
`serpProvenance`** — e ela é perda de um campo que ninguém lê. A assimetria é
real e deve ser fechada, mas hoje não muda comportamento observável.

### 4. Dedução do lado do Radar que deveria sumir com o ArticleDNA sucessor canônico?

**Sim, três — todas do mesmo tipo: o consumidor a jusante re-derivando
arquitetura.**

| Dedução | Onde | Deveria sumir quando |
| --- | --- | --- |
| `buildRadarHandoffContexts` chamado de dentro do pipeline do Radar | `pipeline-context.ts:673-685` | o ArticleDNA declarar `siloId` materializado: o contexto passa a vir pronto e o consumidor não resolve mais nada |
| `siloIdOf` com fallback em `version.payload.siloId` | `operational-flow.ts:225` | idem — vira leitura direta |
| `createRadarHydrationSnapshot` com fallback `article.payload.siloId ‖ principalSource.siloId` | `hydration.ts:125-126` | idem |

Todas correspondem ao ramo `LEGACY_TERRITORY_HYDRATION` que o Arquiteto agora
sabe contar (`legacyHydratedHandoffArticleIds`) — mas **o Radar não recebe esse
número**, então não tem como saber se está consumindo contrato ou compatibilidade.

### 5. O tratamento do Territory duplicado altera dado que chega ao Radar?

**Indiretamente, e só para importações futuras.**

`lib/arquiteto/territory-duplicate.ts` é domínio puro, consumido em três pontos
do Arquiteto (`arquiteto-workspace.tsx:7517`, `:7533`, `:7540`). Nenhum deles
escreve: coerente com `SUPERSEDE_WRITER_EXISTS = NO` relatado pelo lote
anterior — confirmo que **não existe writer de `superseded`** no checkout
(`territory.ts:89-90` declara a transição como permitida; nada a executa).

O que muda: `territoryRefsOutOfCompetition` remove o candidato duplicado da
disputa por keywords. Isso altera qual `territoryRef` uma keyword recebe → qual
Silo `resolveCanonicalSiloForArticle` resolve → qual `siloId` entra no
`RadarItem`. **Portanto:**

- **Itens já importados: intocados.** Nada reescreve `RadarItem` persistido.
- **Importações futuras: `siloId` pode mudar** para artigos cujas keywords
  estavam presas ao candidato duplicado.
- Os `LOCAL_ASSIGNMENTS_TO_RESTORE = 3` relatados são pré-condição do lado do
  Arquiteto; enquanto não forem restaurados, `resolveSupersedeReadiness` devolve
  `blocked` — e isso é **bloqueio do Arquiteto, não do Radar**.

Tratando o dado relatado como relato: os oito flags do lote anterior
(`ANTI_IDADE_*`, `SUPERSEDE_*`, etc.) **não foram reconferidos remotamente**
nesta auditoria. O que confirmei é o **código** que os produz.

---

## 4. Flags

```text
ARQUITETO_RADAR_SINGLE_CONTRACT = NO
IMPORT_PATHS_COUNT = 2
IMPORT_PATHS_EQUIVALENT = NO
FORMATION_SERP_REACHES_RADAR = PARTIAL
    (arquitetoSerpProvenance persiste pelo caminho A e não tem leitor;
     arquitetoSerpAssessment é descartado pelo servidor nos dois caminhos)
HUMAN_FORMATION_DECISION_REACHES_RADAR = TRANSPORTED_BUT_UNUSED
    (dentro de arquitetoSerpProvenance.humanResolution; zero leitores)
INTERNAL_LINK_GRAPH_REACHES_RADAR = TRANSPORTED_BUT_UNUSED
    (arquitetoInternalLinks persiste e não é lido;
     internalLinkGraphRef do handoff v2 não tem produtor)
DEAD_HANDOFF_FIELDS = 7
    arquitetoSerpProvenance · arquitetoInternalLinks · arquitetoArchitectureStatus
    · arquitetoKeywordDnaReferences · arquitetoKeywordUrlRelations
    · hydration.silo.siloPage* · hydration.silo.articleRole
LEGACY_DERIVATIONS = 3
    buildRadarHandoffContexts no pipeline do Radar · siloIdOf fallback
    · createRadarHydrationSnapshot fallback
```

Flags adicionais que o Planejador precisa ver junto:

```text
IMPORT_COMMAND_SCHEMA_ACCEPTS_CURRENT_CONTEXT = NO   ⚠ bloqueante
ARQUITETO_RADAR_IMPORT_OPERATIONAL = NO
SERP_ASSESSMENT_PERSISTED_SERVER_SIDE = NO
SILO_PROVENANCE_REACHES_RADAR = NO
```

---

## 5. Contradição documentação × código

`DOCUMENTATION_DRIFT = YES`

| Documento | Afirma | Código |
| --- | --- | --- |
| `docs/05-radar/estado-atual.md` §"Referência opcional ao InternalLinkGraph — 2026-08-27" | *"o Radar apenas consome a referência quando ela for enviada"* | Nenhum consumidor. `arquitetoInternalLinks` tem zero leitores; `internalLinkGraphRef` do handoff v2 não tem produtor. O verbo "consome" descreve intenção, não comportamento. |
| `lib/editorial/persistence-contracts.ts:74-78` (comentário) | *"O servidor o REVALIDA contra o estado canônico antes de gravar; ele chega como insumo, nunca como veredito."* | O servidor revalida `brandId`/`articleId`/`versionId`/`contentHash` do **RadarItem construído**, mas aceita `handoffContext.silo` como verdade: não confere `siloDnaVersionId`, `siloDnaContentHash` nem `articleRole` contra o artefato remoto. E hoje nem chega lá — o `.strict()` recusa antes. |
| `lib/editorial/operational-flow.ts:64-66` (comentário) | `anchorConcepts` … *"quantidade ou posição de link: essas três são pergunta do Radar"* | O Radar não lê `arquitetoInternalLinks`. O comentário descreve uma fronteira que o código não exercita. Já registrado no Adendo 01. |
| `docs/00-produto/invariantes.md` / pipeline canônico | Entrega ao Radar inclui *"InternalLinkGraph aprovado quando aplicável"* e *"decisões/conflitos"* | Ambos transportados e não consumidos. |

Nenhum documento foi corrigido, conforme escopo.

---

## 6. Evidência e limitações

**Verificações executadas:**

| Verificação | Resultado |
| --- | --- |
| `WorkflowCommandSchema.safeParse` com `ResolvedSiloContext` atual | **REJEITADO** — `unrecognized_keys: siloIdProvenance` |
| Busca de leitores dos 9 campos `arquiteto*` | 3 consumidores, 2 no Radar |
| Busca de leitores de `hydration.silo.*` | apenas `.name` (2×) e o objeto inteiro no envelope |
| Busca de produtores de `internalLinkGraphRef` | 0 |
| Busca de writers de `superseded` | 0 |
| `npx tsc --noEmit --incremental false` | 5 erros, **nenhum** no Radar nem na cadeia de handoff |
| `pnpm run test:arquiteto` | 1480 / 1479 / 1 — verde no lado emissor |

O teste de schema rodou a partir de arquivo temporário criado e **removido** em
`tests/`; `git status` confirma que `tests/` mantém apenas as modificações
pré-existentes do working tree.

**Limitações:**

1. **Nenhuma leitura remota.** Nada foi conferido contra
   `editorial_workflow_items` real. A coluna "Persistido?" descreve o que o
   handler grava, lido no código — não uma linha observada.
2. Os flags do lote anterior do Arquiteto (`ANTI_IDADE_*`, `SUPERSEDE_*`,
   `LOCAL_ASSIGNMENTS_TO_RESTORE = 3`) permanecem **relato**, reutilizados como
   contexto e não promovidos a evidência.
3. Não avaliei se os campos hoje consumidos são consumidos **corretamente** —
   só se têm leitor real.
