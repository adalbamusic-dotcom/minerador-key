# Relatório 3 — Persistência e hidratação do import Arquiteto → Radar — 2026-09-05

Rastreamento estático do caminho atual. Nenhuma escrita, nenhuma leitura
remota, nenhum provider. `PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` ·
`CODE_FILES_CHANGED = 0`.

---

## 1. O caminho, etapa por etapa

| # | Etapa | Arquivo:linha | O que acontece hoje |
| :-: | --- | --- | --- |
| 1 | Article aprovado | `pipeline-context.ts:662` | `approvedArticleVersions(articleVersions, versionEvents)` filtra por `articleIds` |
| 2 | Contexto | `:673-685` | contexto ausente é **re-resolvido** por `buildRadarHandoffContexts`; `serpProvenance` fica `null` nesse ramo |
| 3 | Hidratação | `:687-692` | `createRadarHydrationSnapshot` por artigo, com `resolvedSilo` |
| 4 | Projeção local | `:693` | `importArticlesToRadar(...)` → `next` — **calculado, ainda não aplicado** |
| 5 | Escrita remota | `:702` | `const escrita = await sendWorkflowCommand({action:"import_radar", …})` — **aguardado** |
| 6 | Recusa | `:710-723` | `if (!escrita.ok)` → `return { imported: 0, skipped: 0, blocked: [...] }` com **um item nomeado por artigo** e a mensagem do servidor. **Nenhum `updateWorkspace`.** |
| 7 | Sucesso | `:724-727` | só aqui `updateWorkspace(current => ({ …, radarItems: next }))` |
| 8 | Handler | `workflow/route.ts:17-50` | permissão dupla `arquiteto:approve` + `radar:create`; `articleApprovalIssues`; `artifacts.save`; reconstrução e validação do `RadarItem`; `workflow.importItem`; `decisions.append` |
| 9 | Persistência | `editorial-repositories.ts:119-127` | `upsert` em `editorial_workflow_items` com `onConflict: "marca_id,subject_type,subject_id,stage"`, `ignoreDuplicates: true`; sem linha retornada, relê por `(marca_id, article_id, stage)` |
| 10 | Readback do import | — | **não existe readback dedicado**; a confirmação é o `response.ok` do handler |
| 11 | Workspace | `:280-320` | `reloadOperational` carrega `/api/editorial/workspace` |
| 12 | `RadarItem` | `operational-flow.ts:33-78` | schema validado nas duas pontas |
| 13 | Após F5 | `:341-402` | recovery local por `(actorUserId, brandId)` reidrata `radarItems` com `persistenceMode: "local_fallback"` |

**Ponto de parada real:** o caminho não chega à etapa 8. Como demonstrado no
Relatório 2 §0, `WorkflowCommandSchema.parse` recusa o comando por
`siloIdProvenance` desconhecido no `handoffContext.silo`, e a etapa 6 assume.
O rastreamento abaixo descreve o comportamento das guardas — que estão
corretas — sobre um canal que hoje está fechado.

---

## 2. Respostas

### 1. Uma falha de persistência interrompe o import antes de atualizar estado local?

**Sim.** É exatamente a correção do commit `e4c5733`. A ordem é
`await` → checar `escrita.ok` → só então `updateWorkspace`. Em falha, o retorno
traz cada artigo em `blocked` com `reasons: [escrita.message]`, e a tela do
Radar imprime artigo a artigo (`radar-page.tsx:652`, montagem de `partes`).

Isso vale **apenas para `import_radar`**. As outras três mutações de workflow
que tocam o Radar continuam com o padrão antigo — ver questão 3.

### 2. O sucesso só aparece depois de confirmação do meio remoto aplicável?

**Para `import_radar`, sim** — com uma ressalva de vocabulário: a confirmação é
`response.ok` do handler, não um readback. O handler faz `upsert` e devolve
`{ ok: true }`; ninguém relê a linha para conferir que o payload gravado é o
enviado. É mais forte que o padrão anterior e mais fraco que o readback estrito
que a rota SERP usa (`GET /api/editorial/serp`).

### 3. Existe ainda algum caminho que possa informar "enviado" com banco vazio?

**Sim, três.**

| Caminho | Arquivo:linha | Comportamento |
| --- | --- | --- |
| `importApprovedSiloPagesToRadar` | `pipeline-context.ts:729-734` | **não emite comando remoto nenhum.** Atualiza `radarItems` localmente e devolve `{imported}`. Uma SiloPage "importada ao Radar" é 100% local e sobrevive ao F5 pela recuperação. |
| `updateRadarState` (`transition_radar`) | `:735-738` | `updateWorkspace(...)` **antes**; `void sendWorkflowCommand(...)` depois, sem `await` e sem checar `ok`. Aprovar um item no Radar pode não persistir e a grade mostra `approved`. |
| `importApprovedToPlanner` (`import_planner`) | `:739-747` | idem: estado local primeiro — inclusive virando `radarItems` para `sent_planner` — e `void sendWorkflowCommand` depois. |

A correção de `e4c5733` fechou **uma** das quatro portas. As outras três
mantêm a semântica antiga, e duas delas (`transition_radar`, `import_planner`)
são justamente os gates que decidem se um artigo sai do Radar.

`IMPORT_CAN_REPORT_FALSE_SUCCESS = NO` para `import_radar`;
`WORKFLOW_CAN_REPORT_FALSE_SUCCESS = YES` para as outras três.

### 4. O `localStorage` ainda pode mascarar ausência remota?

**Sim.** O efeito de auto-save (`pipeline-context.ts:405-434`) serializa o
workspace inteiro — `radarItems` incluído — a cada mudança, sob
`workflowRecoveryStorageKey(actorUserId, brandId)`. Na montagem seguinte
(`:341-402`) o recovery é aplicado.

O que mudou: como `import_radar` não escreve estado local em falha, **um import
recusado não entra mais no `localStorage`**. O mascaramento pelo caminho A/B
está fechado.

O que não mudou: qualquer item que chegue ao `radarItems` por outra porta —
notadamente `importApprovedSiloPagesToRadar` e a virada de estado de
`updateRadarState` — é persistido localmente e sobrevive ao F5. O único sinal é
`persistenceMode: "local_fallback"`, que a tela do Radar exibe apenas na rota de
detalhe (`radar-analysis-page.tsx:407`), não no Workbench.

### 5. O reload remoto é brand-scoped?

**Sim, em três camadas.**

- Chave do workspace no cliente: `workspaceKey` = `(actorUserId, brandId)`.
- Chave do recovery local: `workflowRecoveryStorageKey(actorUserId, brandId)` —
  ator **e** marca.
- Servidor: `assertEditorialPermission(profile, brandId, …)` →
  `assertCanAccessMarca` e repositórios filtrando por `marca_id`
  (`editorial-repositories.ts:177`, `:230`, `:120`).

Nenhum fallback silencioso para outra marca foi encontrado neste caminho.

### 6. O readback valida marca, artigo e versão?

Depende de **qual** readback:

| Readback | Valida | Onde |
| --- | --- | --- |
| `import_radar` | **não existe** | — |
| Análise Radar — `GET /api/editorial/radar-analysis` | marca, artigo, e recusa `radar_identity_mismatch` se divergir; devolve `radarItemId`/`lockVersion` | `radar-analysis/route.ts:29-52` |
| Revisão SERP — `GET /api/editorial/serp` | **marca + artigo + `articleDnaVersionId` + `snapshotId`**, com 409 se o snapshot não pertencer à versão | `editorial/serp/route.ts:144-206` |
| Escrita de análise — `POST` | cliente confere `radarItemId` do readback contra a linha selecionada | `pipeline-context.ts:577` |

Ou seja: o Radar tem readback estrito **depois** que o item existe; **não tem**
no ato de importar.

### 7. O `handoffContext` é persistido ou efêmero?

**O contêiner é efêmero; três projeções dele são persistidas.**

Ele existe só como campo do comando (`persistence-contracts.ts:80-96`). O
handler o usa para reconstruir o `RadarItem` (`route.ts:35`) e grava **o
RadarItem**, não o contexto. Sobrevivem: `siloId`, `arquitetoSerpProvenance`,
`arquitetoInternalLinks` e — via `hydrationByArticleId` — o bloco
`hydration.silo`. Não sobrevivem: `siloIdProvenance` (recusado antes) e
qualquer campo do contexto que o `RadarItemSchema` não declare.

### 8. Qual payload realmente fica em `editorial_workflow_items`?

O objeto devolvido por `RadarItemSchema.parse(...)` na linha
`workflow/route.ts:40`, gravado em `payload` na linha `:47`, com
`stage: "radar"`, `state: "research_pending"`, `source_entity_id`,
`source_version_id` e `source_content_hash` em colunas próprias.

**Com uma diferença material em relação ao objeto do cliente:** o handler
reconstrói com `serpAssessments = {}` (`route.ts:35`), então
`arquitetoSerpAssessment` grava **sempre `null`**, mesmo quando o Arquiteto o
enviou. O cliente mantém o valor em memória até o próximo `reloadOperational`.

### 9. Depende de `siloId` declarado ou ainda aceita `LEGACY_TERRITORY_HYDRATION`?

**Ainda aceita — e não registra que aceitou.**

`resolveCanonicalSiloForArticle` tem dois ramos
(`radar-handoff-context.ts:76-104`): declaração (`article.siloId`) e hidratação
por território. O segundo continua ativo e é marcado com
`siloIdProvenance: "LEGACY_TERRITORY_HYDRATION"`. Mas:

- o campo é **recusado** pelo schema do comando (Relatório 2 §0);
- mesmo que passasse, `importArticlesToRadar` não o copia para o `RadarItem`;
- o agregador `legacyHydratedHandoffArticleIds` só é consumido no Arquiteto
  (`arquiteto-workspace.tsx:3880`).

Resultado: `CANONICAL_SILO_REQUIRED = NO` (o Silo é obrigatório, sua origem
canônica não é) e `LEGACY_SILO_HYDRATION_STILL_ACCEPTED = YES`, com o Radar sem
meio de distinguir os dois casos.

### 10. O guard de Territory duplicado pode alterar o artigo importado?

**Não altera nada já importado; só muda o que futuras importações resolvem.**

`territory-duplicate.ts` é domínio puro e seus três consumidores
(`arquiteto-workspace.tsx:7517`, `:7533`, `:7540`) apenas leem. Confirmei que
**não existe writer de `superseded`** no checkout — consistente com
`SUPERSEDE_WRITER_EXISTS = NO` relatado.

O efeito é de precedência: `territoryRefsOutOfCompetition` tira o candidato
duplicado da disputa por keywords, o que pode mudar o `territoryRef` de uma
keyword e, por consequência, o `siloId` que um import futuro resolve. Itens já
persistidos em `editorial_workflow_items` não são reescritos por nada nesse
módulo.

**Portanto: impedir nova disputa no Arquiteto — sim. Alterar artigo importado —
não.** E, alinhado com a orientação do pedido: a ausência do writer de
`superseded` **não é bloqueio do Radar**, desde que o candidato duplicado esteja
fora da disputa — o que `territoryRefsOutOfCompetition` já garante em leitura.
O que resta é dívida de higiene do Arquiteto, com os 3 assignments locais como
pré-condição.

---

## 3. Flags

```text
IMPORT_WRITE_FAILURE_IS_FATAL = YES            (import_radar)
LOCAL_STATE_UPDATED_BEFORE_REMOTE_SUCCESS = NO (import_radar)
                                          = YES (transition_radar, import_planner, import_silopages)
REMOTE_READBACK_EXISTS = NO                    (no import)
                       = YES                   (análise Radar e revisão SERP, estritos)
LOCALSTORAGE_CAN_MASK_REMOTE_ABSENCE = YES     (pelas outras três portas; não mais pelo import)
RADAR_WORKSPACE_BRAND_SCOPED = YES
ARTICLE_VERSION_VALIDATED = YES                (versionId e contentHash, 409 se divergirem)
CANONICAL_SILO_REQUIRED = NO                   (Silo obrigatório; origem canônica não)
LEGACY_SILO_HYDRATION_STILL_ACCEPTED = YES
IMPORT_CAN_REPORT_FALSE_SUCCESS = NO
```

Complementares:

```text
WORKFLOW_CAN_REPORT_FALSE_SUCCESS = YES  (transition_radar · import_planner · import_silopages)
IMPORT_CURRENTLY_OPERATIONAL = NO        (schema recusa o handoffContext atual)
SERP_ASSESSMENT_PERSISTED = NO           (handler reconstrói com serpAssessments = {})
SILO_PROVENANCE_PERSISTED = NO
```

---

## 4. Evidência e limitações

**Evidência:** leitura de `components/editorial-pipeline-context.tsx`,
`lib/editorial/operational-flow.ts`, `lib/editorial/persistence-contracts.ts`,
`app/api/editorial/workflow/route.ts`, `lib/server/editorial-repositories.ts`,
`lib/radar/hydration.ts`, `lib/arquiteto/radar-handoff-context.ts`,
`lib/arquiteto/territory-duplicate.ts`. Verificação empírica do
`WorkflowCommandSchema` por `safeParse` (arquivo temporário removido;
`git status` de `tests/` inalterado).

**Limitações:**

1. **Nenhuma linha de `editorial_workflow_items` foi lida.** Tudo que este
   relatório diz sobre "o que fica gravado" é o que o handler grava, lido no
   código.
2. O comportamento pós-F5 foi rastreado no código, não observado em navegador.
3. Os flags `SUPERSEDE_*` e `LOCAL_ASSIGNMENTS_TO_RESTORE = 3` do lote anterior
   permanecem relato; confirmei o **código** que os sustenta, não o estado
   remoto.
