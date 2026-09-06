# Relatório 4 — Autoridade de aprovação do Radar — 2026-09-05

Auditoria somente diagnóstica. Nenhuma correção implementada.
`PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` · `CODE_FILES_CHANGED = 0`.

---

## 1. Ainda existem duas semânticas de "aprovar"?

**Sim, e a distância entre elas aumentou nesta rodada.** O commit `2e2e9a6`
desfez a extração que preparava a unificação, restaurando o handler inline na
rota de detalhe.

| | **Workbench** `/{brandRef}/radar` | **Detalhe** `/{brandRef}/radar/{articleId}` |
| --- | --- | --- |
| Handler | `approveReportForArticle` · `radar-page.tsx:553-558` | `approve` · `radar-analysis-page.tsx:~490-540` |
| Portão | `radarR6CanApproveReport(r6Report)` — projeção local | `remoteExpertEvidence` carregado/sem erro/sem pendências + `analysisApprovalIssues(analysis, kgrStrategy)` |
| Relatório | não gera na aprovação (o `RadarCompetitiveReport` é `draft`, criado na análise, `radar-page.tsx:422`) | `buildRadarCompetitiveReport(… status:"approved", approvedAt, approvedBy)` |
| Pacote | — | `buildRadarEvidencePackage(…)` · `:504` |
| Handoff | — | `buildRadarPlannerHandoff(…)` · `:510` |
| Persistência | `updateLocalState(articleId, … report:"REPORT_APPROVED", reportApprovedEvidenceFingerprint)` | `save(createRadarAnalysisSuccessor(analysis, { status:"approved", competitiveReport, plannerPackage: handoff, … }))` |
| Readback | nenhum | `if (saved.persistenceMode !== "remote" \|\| !saved.readbackConfirmed) → aborta com aviso` |
| Transferência | ação de lote `planner` habilitada por `snapshot.reportApproved` | `sendCurrentEvidence()` com `plannerTransfer` gravado |
| Mensagem ao usuário | *"Relatório aprovado localmente. Isso não cria uma versão remota nem envia ao Planejador."* | *"Evidências aprovadas. Write remoto e readback confirmados…"* |

O próprio produto já declara a diferença em voz alta. O verbo é o mesmo; o ato
não é.

---

## 2. Respostas

### 1. O Workbench ainda usa somente estado local para "aprovar relatório"?

**Sim.** `approveReportForArticle` escreve em `r4LocalByArticle`, que é
`useState<Record<string, RadarR4LocalArticleState>>({})` declarado em
`radar-page.tsx:62`. Sem `localStorage`, sem IndexedDB, sem chamada remota.

### 2. Essa aprovação sobrevive ao F5?

**Não por si.** `r4LocalByArticle` é estado de componente e zera na remontagem.

Há um efeito de segunda ordem que precisa ser dito com precisão para não
confundir o Planejador: `normalizeRadarR6ReportState({ localState, legacyGenerated,
legacyApproved })` (`radar-page.tsx:146`) considera também
`legacyApproved = analysis?.payload.status === "approved"`
(`:135`). Ou seja, **uma aprovação feita na rota de detalhe — que persiste
remotamente — reaparece no Workbench depois do F5**. O inverso não ocorre: uma
aprovação nascida no Workbench não deixa rastro em lugar algum.

`APPROVAL_SURVIVES_F5_REMOTELY = NO` para a aprovação do Workbench;
`YES` para a da rota de detalhe, refletida no Workbench por herança de leitura.

### 3. Ela chama o mesmo builder/autoridade da rota de detalhe?

**Não.** O Workbench importa `buildRadarCompetitiveReport`
(`radar-page.tsx:24`) e o usa **na análise**, com `status: "draft"` (`:422`).
Não importa `buildRadarEvidencePackage` nem `buildRadarPlannerHandoff`.

Busca de chamadores no checkout:

```
buildRadarEvidencePackage   → modules/radar/radar-analysis-page.tsx:504   (1 chamador)
buildRadarPlannerHandoff    → modules/radar/radar-analysis-page.tsx:510   (1 chamador)
```

### 4. `RadarEvidencePackage` pode nascer pelo fluxo normal do Workbench?

**Não.** Único produtor é `radar-analysis-page.tsx:504`.

### 5. `RadarPlannerHandoff v2` pode nascer pelo fluxo normal do Workbench?

**Não.** Único produtor é `radar-analysis-page.tsx:510`.

E há um efeito ativo de apagamento: `createRadarAnalysisSuccessor`
(`analysis-contracts.ts:333`) força `plannerPackage: null` sempre que
`targetStatus !== "approved"`. Como toda ação de curadoria do Workbench cria
sucessora em `draft`, **qualquer pacote existente é zerado a cada decisão
tomada no Workbench**. Isso é correto — mudou a curadoria, o pacote não vale
mais — mas significa que o Workbench só sabe *invalidar* o pacote, nunca
produzi-lo.

### 6. O detalhe continua sendo o único caminho completo?

**Sim.** É o único que percorre portão → relatório aprovado → pacote → handoff
v2 → sucessora persistida → readback → `plannerTransfer`.

Isso contradiz a própria spec do Radar, seção *"Contrato operacional — SERP
unificada no Workbench — 2026-08-26"*: *"Nenhuma função necessária ao fluxo
SERP normal pode exigir a navegação para essa rota."* Entregar ao Planejador é
função necessária. `DOCUMENTATION_DRIFT = YES`.

### 7. Existem duas implementações da regra de aprovação?

**Sim — e são regras diferentes, não duas cópias da mesma.**

| Condição | Workbench (`radarR6CanApproveReport`, `r6-sequential.ts:422-424`) | Detalhe |
| --- | :-: | :-: |
| `state === "REPORT_REVIEWED"` | ✅ | ❌ (usa `reportGenerated`) |
| `!report.stale` | ✅ | ✅ via `expertEvidenceNeedsReapproval` |
| `pendingContributions.length === 0` | ✅ (projeção local) | ✅ (`remoteExpertEvidence.pendingCount`, remoto) |
| `evidence.serp.reviewed` | ✅ | ✅ |
| Amazon revisada ou não aplicável | ✅ | ❌ |
| `analysisApprovalIssues(analysis, kgrStrategy)` | ❌ | ✅ |
| Leitura remota do ExpertBrief concluída e casando a chave | ❌ | ✅ |

Nem sequer é possível dizer qual é a mais estrita: cada uma exige algo que a
outra não exige. É um artigo que passa num portão e é barrado no outro.

### 8. Existe módulo/serviço compartilhado de autoridade de aprovação?

**Não, hoje.** Existiu por um commit.

### 9. Existe código revertido/histórico que já extraiu essa autoridade?

**Sim, e está recuperável em um comando.**

```
commit 2e2e9a6  radar: desfazer a extracao de aprovacao feita pelo corte do Arquiteto
   lib/radar/report-approval.ts          | 198 ---------------------
   modules/radar/radar-analysis-page.tsx | 103 ++++++-------
```

O módulo `lib/radar/report-approval.ts` (198 linhas) declarava exatamente o
objetivo desta seção — cabeçalho verbatim do arquivo em `2e2e9a6^`:

> *"A AUTORIDADE ÚNICA DE APROVAÇÃO DO RADAR. Existiam duas. […] Aprovar passa
> a ser UM ato, definido aqui: 1. o portão confere que as evidências estão
> resolvidas; 2. o relatório competitivo é construído; 3.
> `buildRadarEvidencePackage` monta o pacote; 4. `buildRadarPlannerHandoff`
> monta o handoff; 5. a sucessora é persistida com os três dentro; 6. o
> READBACK decide — não o POST que não lançou exceção. […] A persistência entra
> por PORTA (`persist`), não por import."*

A reversão foi **por escopo, não por mérito** — a mensagem do commit diz isso
explicitamente: o corte que criou o módulo era do Arquiteto e devia ter
`RADAR_FILES_CHANGED = 0`. E registra a rota de volta: `git revert 2e2e9a6`.

Importante para o planejamento: mesmo revertido, o módulo **não unificava nada
sozinho** — só a rota de detalhe o consumia. O trabalho restante é o Workbench
passar a chamá-lo.

### 10. Menor mudança conceitual para existir uma única autoridade?

Sem implementar, e em ordem de dependência:

1. **Nomear um dono para a regra.** Hoje a pergunta *"este artigo pode ser
   aprovado?"* tem duas respostas em dois arquivos. Uma função pura — que
   receba análise, SERP revisada, evidência de especialista lida e estado Amazon,
   e devolva `ok` ou a lista de pendências — resolve o item 7 sem tocar em
   persistência.
2. **Nomear um dono para o ato.** A sequência portão → relatório → pacote →
   handoff → sucessora → readback é uma ordem, não uma opinião. Ela precisa
   existir num lugar só, com a persistência entrando por parâmetro para o
   domínio não conhecer `fetch`. Era exatamente o desenho de
   `lib/radar/report-approval.ts`.
3. **O Workbench chamar esse ato** em vez de gravar um flag local.
4. **Decidir o que a rota de detalhe passa a ser** — diagnóstico e histórico, ou
   segunda superfície de aprovação. Manter duas superfícies com uma autoridade
   é sustentável; manter duas autoridades não é.

Os passos 1–3 não exigem schema novo, migration, contrato novo nem mudança no
Planejador: os builders já existem, já são testados e já produzem o v2. O que
falta é ordem e ponto de entrada.

---

## 3. Classificação

```text
WORKBENCH_APPROVAL = LOCAL_ONLY
DETAIL_APPROVAL = REMOTE
SINGLE_APPROVAL_AUTHORITY = NO
WORKBENCH_CAN_BUILD_PACKAGE = NO
WORKBENCH_CAN_BUILD_HANDOFF_V2 = NO
APPROVAL_SURVIVES_F5_REMOTELY = NO   (aprovação nascida no Workbench)
                              = YES  (aprovação nascida no detalhe, refletida no Workbench)
```

Complementares:

```text
APPROVAL_RULE_IMPLEMENTATIONS = 2 (divergentes, não duplicadas)
SHARED_APPROVAL_MODULE_EXISTS = NO
SHARED_APPROVAL_MODULE_RECOVERABLE = YES (git revert 2e2e9a6)
WORKBENCH_CAN_INVALIDATE_PACKAGE = YES (createRadarAnalysisSuccessor zera plannerPackage fora de "approved")
PLANNER_SEND_GATED_BY_LOCAL_STATE = YES (r4-queue.ts:321-323 → snapshot.reportApproved)
```

---

## 4. Contradições registradas

`DOCUMENTATION_DRIFT = YES`

| Documento | Afirma | Comportamento |
| --- | --- | --- |
| `docs/05-radar/spec.md` §"Contrato operacional — SERP unificada no Workbench — 2026-08-26" | *"Nenhuma função necessária ao fluxo SERP normal pode exigir a navegação para essa rota"* | Aprovar o relatório e gerar o pacote **exigem** `/{brandRef}/radar/{articleId}` |
| `docs/05-radar/spec.md` §R6 | *"`REPORT_GENERATED`, `REPORT_REVIEWED` e `REPORT_APPROVED` são gates distintos […] persistência local não equivale a aprovação humana nem cria versão remota"* | O Workbench respeita a distinção **e** para nela: `REPORT_APPROVED` nunca sai do estado de sessão |
| `docs/05-radar/estado-atual.md` §"Handoff canônico Radar → Planejador — 2026-08-26" | handoff v2 *"Implementado localmente"* | Verdadeiro, mas alcançável só por uma rota que a spec classifica como diagnóstico |

Nenhum documento foi corrigido, conforme escopo.

---

## 5. Evidência e limitações

**Evidência:** `modules/radar/radar-page.tsx`,
`modules/radar/radar-analysis-page.tsx`, `lib/radar/r6-sequential.ts`,
`lib/radar/r4-queue.ts`, `lib/radar/analysis-contracts.ts`,
`git show 2e2e9a6`, `git show 2e2e9a6^:lib/radar/report-approval.ts`.
Busca de chamadores dos dois builders em `modules/`, `lib/` e `app/`.

**Limitações:**

1. Nada foi observado em navegador. O comportamento pós-F5 foi derivado da
   leitura de `normalizeRadarR6ReportState` e do ciclo de vida do `useState`.
2. Não avaliei se `radarR6CanApproveReport` e o portão do detalhe estão
   *corretos* — apenas que são **diferentes**.
3. A comparação dos dois portões é estrutural; não há teste no repositório que
   os confronte, e nenhum foi criado.
