# RADAR R9 — Autoridade única de aprovação do relatório — 2026-09-06

`PROVIDER_CALLS = 0` · `REMOTE_WRITES_DURING_AUTOMATED_TESTS = 0` ·
`PLANNER_TRANSFER_CHANGED = NO` · `ARCHITECT_IMPORT_CHANGED = NO` ·
`HANDOFF_DEAD_FIELDS_CHANGED = NO`.

Estado de partida (R8): suíte verde, 36 arquivos, 178/178.
Estado de chegada: **37 arquivos, 191/191**, com uma só autoridade de
aprovação consumida pelas duas superfícies.

---

## 0. O que a revalidação encontrou antes de qualquer alteração

O pedido mandava revalidar antes de implementar. Foi o passo mais produtivo do
lote: **a aprovação da rota de detalhe estava quebrada no HEAD** e teria
lançado exceção antes de escrever qualquer coisa.

Histórico reconstruído por `git`:

| Commit | Estado do handler `approve` |
| --- | --- |
| `2e2e9a6^^` | chamadas completas e corretas; `plannerPackage: packageData` (v1); **sem** handoff v2; **sem** gate de readback |
| `2e2e9a6^` | o corte do Arquiteto extraiu para `lib/radar/report-approval.ts` e **acrescentou** handoff v2 e readback — mas com chamadas truncadas por `as Parameters<…>` |
| `2e2e9a6` (HEAD) | a extração foi desfeita **por inline**, trazendo os defeitos junto |

Quatro defeitos, todos mascarados pelos casts:

1. `buildRadarCompetitiveReport` sem `generatedBy`, `siloDnaVersionId`,
   `status`, `approvedAt`, `approvedBy`;
2. `buildRadarEvidencePackage` sem `research`, `selectedBy`, `kgrStrategy`,
   `competitiveReport` — `input.research.id` estouraria em `TypeError`;
3. patch com `plannerHandoff`, campo que **não existe** em
   `RadarAnalysisPayloadSchema` — e o schema é `.strict()`, então
   `createRadarAnalysisSuccessor` lançaria `unrecognized_keys`;
4. `createRadarAnalysisSuccessor(analysis, patch, actorId, approvalVersionId)`
   — o 4º posicional é `now`, não `versionId`: o identificador da versão ia
   para o campo de data e a sucessora nascia com outro `versionId`, divergente
   do usado no relatório, no pacote e no handoff.

Havia ainda um quinto, silencioso: `plannerPackage` recebia o **pacote v1**.
A união do schema aceita os dois, então nada reclamaria — mas
`approvedHandoffForRadarItem` lê esse campo com `RadarPlannerHandoffSchema`, e
o Planejador ficaria sem envelope, sem erro nenhum.

O R9 substitui esse caminho inteiro pela autoridade única escrita
corretamente; o defeito não foi remendado, foi eliminado junto com a
duplicidade que o produziu. Registro como achado, não como pendência:
`PRODUCTION_DEFECT_DISCOVERED = YES (corrigido pela própria unificação)`.

---

## IMPLEMENTED

### A autoridade

`lib/radar/report-approval.ts` — módulo novo, domínio puro, sem `fetch` e sem
storage. Exporta duas coisas:

- **`radarReportApprovalIssues(input): string[]`** — o portão;
- **`approveRadarReport(input): Promise<RadarApprovalResult>`** — o ato.

A persistência entra por **porta** (`persist`), não por import: as duas telas
injetam o writer que já têm (`pipeline.saveRadarAnalysis` / `save`).

A ordem do ato, num lugar só: portão → relatório `approved` → pacote →
handoff v2 → sucessora com `plannerPackage: handoff` → `persist` → **readback
decide**.

### O portão consolidado

Os requisitos divergentes foram unidos, com um critério explícito de corte:
**estado de sessão não decide**.

| Requisito | Antes no Workbench | Antes no detalhe | Agora |
| --- | :-: | :-: | :-: |
| `analysisApprovalIssues` (+ KGR) | ❌ | ✅ | ✅ canônico |
| leitura remota do ExpertBrief carregada e no contexto certo | ❌ | ✅ | ✅ canônico |
| contribuições sem pendência/bloqueio | ✅ (local) | ✅ (remoto) | ✅ canônico |
| SERP aprovada | ✅ | ❌ | ✅ canônico |
| **SERP aprovada e atual** (fingerprint da curadoria) | ❌ | ❌ | ✅ **novo nos dois** |
| identidade marca/artigo/versão/snapshot | ❌ | ❌ | ✅ **novo nos dois** |
| `REPORT_REVIEWED` (`useState`) | ✅ | ❌ | pré-condição de **botão** |
| Amazon revisada (`useState`) | ✅ | ❌ | pré-condição de **botão** |

Os dois últimos moram em `r4LocalByArticle`, que não sobrevive a um F5. Usá-los
como autoridade faria a mesma aprovação valer numa aba e não valer na outra.
Continuam bloqueando o botão na superfície que os tem; a **decisão** é da
função. Isso está escrito no cabeçalho do módulo.

Duas regras que **nenhuma** das telas tinha entraram porque o pedido as exige
(itens E, F e I): atualidade do fingerprint e isolamento de identidade.

`PLANNER_DECISION_REQUIRED = NO` — não houve incompatibilidade de produto. Os
requisitos eram complementares, não contraditórios.

### As duas superfícies

**Rota de detalhe** (`modules/radar/radar-analysis-page.tsx`): o bloco inline
de ~70 linhas virou uma chamada. Ganhou também `deriveRadarSerpReviewState` —
o gate de atualidade da SERP que só existia no Workbench. E a lista de
pendências exibida passou a vir da **mesma** função que decide: antes a tela
podia dizer "sem pendências" sobre um artigo que o clique recusaria.

**Workbench** (`modules/radar/radar-page.tsx`): `approveReportForArticle`
deixou de gravar um flag em `useState` e passou a chamar a autoridade, com
`pipeline.saveRadarAnalysis` como `persist`. Ganhou `buildRadarKgrStrategy`,
porque sem o KGR o gate de teto de composição não roda e as duas telas
divergiriam.

### Um defeito pré-existente que o lote precisou fechar

`handleExpertEvidenceChange` existia em `radar-page.tsx` e **nunca era
passado** ao `RadarWorkbench` — confirmado também no HEAD. Todo o pipeline de
evidência de especialista do Workbench (`expertEvidenceByArticle`,
`canonicalExpertEvidenceByArticle`, `expertContributionSummaryByArticle`) era
código morto: a cadeia de props existia em `RadarR3Workbench` e
`RadarR3SpecialistPanel`, faltava a ponta.

Sem conectar, o gate canônico bloquearia o Workbench para sempre em "Aguarde a
leitura remota do ExpertBrief" — `WORKBENCH_CAN_BUILD_PACKAGE` seria `YES` no
código e `NO` na prática. Uma linha, dentro de `modules/radar`.

O `summary` ganhou `articleDnaVersionId` para que `contextMatches` seja real: a
resposta que chegou para outro artigo não é evidência deste.

### UX

O verbo `Aprovar` só significa aprovação canônica.

- a mensagem *"Relatório aprovado localmente. Isso não cria uma versão remota
  nem envia ao Planejador"* **não existe mais** — e há um teste que impede seu
  retorno;
- o selo `"Final local"` virou `"Pronto para aprovar"` / `"Aprovado no remoto"`;
- o status do painel mostra `"Aprovado · versão remota confirmada"` quando a
  aprovação é canônica, e o botão passa a `"Relatório aprovado"`, desabilitado;
- `"Marcar relatório revisado"` permanece — é o preparo local, com nome
  próprio e verbo diferente.

Nenhum layout foi redesenhado.

---

## TESTED

```text
npm run test:radar
tests 191 · pass 191 · fail 0 · skipped 0 · duration_ms 3982 · exit 0
```

Prova de execução por arquivo (cada um rodado isolado, soma conferida contra a
execução agregada):

```text
RADAR_OWNED_TEST_FILES_DISCOVERED   = 37
RADAR_OWNED_TEST_FILES_EXECUTED     = 37
RADAR_OWNED_TEST_FILES_NOT_EXECUTED = 0
soma dos testes = 191   (idêntica ao agregado)
```

O arquivo novo entrou na suíte **sem tocar no script**: a descoberta por glob
do R8 fez o trabalho.

### Cobertura pedida (A–I) — `tests/radar-report-approval.test.mts`, 13 testes

| Item | Teste |
| :-: | --- |
| A | as duas superfícies importam e chamam `approveRadarReport`; nenhuma monta pacote ou handoff por fora; `"aprovado localmente"` não pode voltar |
| B | o mesmo estado produz a mesma lista; SERP não aprovada, evidência em leitura, com erro, com pendência e composição acima do teto bloqueiam |
| C | `persist` que devolve `local` → `NOT_PERSISTED`, sem pacote promovido |
| D | `remote` + `readbackConfirmed: false` → recusa; só `remote` + `true` fecha |
| E | `currentness: "reopened"` reabre; `"unknown"` (legado sem fingerprint) não fecha |
| F | snapshot sucessor não herda: recusa por "outro snapshot", e não cai no caminho de já aprovado |
| G | a sucessora persistida tem `status: approved`, `versionId` igual ao usado no relatório/pacote/handoff, `competitiveReport.status: approved` e **`plannerPackage` reconhecido por `isRadarPlannerHandoff`**; estado bloqueado não chama `persist` |
| H | repetir a aprovação válida devolve `ALREADY_APPROVED`, sem sucessora e **sem escrita** |
| I | outra marca, outro artigo, outra versão do ArticleDNA são recusados; handoff de **outra linha do Radar** não é aceito como repetição |

Mais uma regressão de contrato: `RadarAnalysisPayloadSchema` recusa campo
desconhecido — o teste fixa o comportamento que teria pegado o `plannerHandoff`
do §0.

### Regressão

| Verificação | Antes | Depois |
| --- | --- | --- |
| `test:radar` | 178 / 178 / 0 | **191 / 191 / 0** |
| `test:arquiteto` | 1480 / 1479 / 1 | **1480 / 1479 / 1** — idêntico |
| `npx tsc --noEmit` | 5 erros | **5 erros**, os mesmos, nenhum em Radar |
| `eslint modules/radar lib/radar` | limpo | **limpo** |
| `check:visual-system` | exit 1 (roxo no Arquiteto) | **exit 1, mesma violação**; zero dívida nova no Radar |

`tests/radar-expert-brief.test.mts` foi atualizado: as duas asserções que
descreviam a forma inline agora conferem o insumo na tela e **a regra na
autoridade**. O invariante que o teste protege é o mesmo.

---

## REMOTE_VERIFIED

Nada. Nenhuma leitura ou escrita remota foi feita neste lote.

## MANUAL_UI_VALIDATION

Nada. Preparado, não executado — ver checklist abaixo.

---

## PENDING

| # | Item |
| :-: | --- |
| P1 | **Paridade de carregamento da evidência de especialista.** A regra é única, mas o detalhe busca `/api/editorial/expert-briefs` no nível da página e o Workbench só recebe o resumo quando o card Especialista monta. Mesmo estado → mesma decisão; estados de *prontidão* diferentes → ambos recusam, o que é consistente mas não é confortável. Unificar a leitura num hook é lote próprio. |
| P2 | Indicador visual de "aprovando…" no painel do Workbench — hoje só a faixa de aviso informa. |
| P3 | `radarR6CanApproveReport` continua sendo pré-condição de botão baseada em sessão. Se `REPORT_REVIEWED` e o estado Amazon precisarem valer como decisão, precisam de persistência primeiro. |

---

## BLOCKED_EXTERNALLY

**B1 — import Arquiteto → Radar recusado.** `siloIdProvenance` →
`WorkflowCommandSchema.handoffContext.silo.strict()` → `unrecognized_keys` →
HTTP 400. Intocado. Nenhum schema flexibilizado, nenhum fallback criado.
Consequência para o smoke: só artigos **já importados** podem ser usados.

**B2 — `import_planner` e demais mutações locais antes do remoto.** Intocado,
conforme o item 7 do pedido. A distinção pedida está preservada no código: a
autoridade constrói e persiste o **pacote/handoff**; a transferência ao
Planejador continua sendo outra mutação, com a dívida dela.

**B3 — `npm test` global aborta em `test:authz`.**
`GLOBAL_NPM_TEST_BLOCKED_BY_PLATFORM = YES`; não usado como gate.

---

## Fronteiras respeitadas

| Não tocado | Confirmação |
| --- | --- |
| Arquiteto, Planejador | 0 arquivos |
| `WorkflowCommandSchema`, `import_planner`, `transition_radar` | 0 alterações |
| `RadarEvidencePackage`, `RadarCompetitiveReport`, `RadarPlannerHandoff` v2 | contratos reutilizados, **nenhuma entidade nova** |
| Campos mortos do handoff | intocados |
| `git revert 2e2e9a6` | **não executado** — o módulo foi reescrito contra o checkout atual, corrigindo os defeitos do original |
| Banco, migrations, RLS, providers | nenhum acesso |

**Arquivos alterados — 9:**

```text
lib/radar/report-approval.ts                (novo)
tests/radar-report-approval.test.mts        (novo)
modules/radar/radar-page.tsx
modules/radar/radar-analysis-page.tsx
modules/radar/radar-r6-report-panel.tsx
modules/radar/radar-r3-workbench.tsx
modules/radar/radar-r3-specialist-panel.tsx
modules/radar/radar-expert-brief-panel.tsx
tests/radar-expert-brief.test.mts
```

---

## Checklist de smoke manual — preparado, não executado

Pré-requisito: usar um artigo **já importado** (B1 impede importar novos).

```text
 1. Abrir /{brandRef}/radar e selecionar um dos artigos locais.
 2. Coletar a SERP manualmente (única chamada DataForSEO autorizada).
 3. Curar concorrentes até zerar as decisões pendentes.
 4. Executar a análise da amostra.
 5. Abrir o card Especialista — necessário para a leitura remota do ExpertBrief.
 6. Gerar o relatório e marcar como revisado.
 7. Aprovar pelo Workbench. Esperado: "Relatório aprovado na versão vN.
    Write remoto e readback confirmados".
 8. F5.
 9. Confirmar no Workbench: status "Aprovado · versão remota confirmada" e
    botão "Relatório aprovado" desabilitado.
10. Abrir /{brandRef}/radar/{articleId}.
11. Conferir a MESMA versão, o mesmo status e o mesmo hash no Histórico.
12. Voltar ao Workbench.
13. Confirmar o pacote disponível no Histórico do detalhe (handoff v2 com
    snapshot e hash).
14. Clicar "Aprovar" de novo em qualquer uma das telas: esperado
    "já está aprovado nesta versão… Nenhuma sucessora foi criada".
15. Alterar uma decisão de concorrente e conferir que a revisão reabre nas
    duas telas.
```

`MANUAL_LOCAL_ARTICLE_SMOKE_READY = YES`

---

## Drift documental

```text
WORKBENCH_DETAIL_FUNCTIONAL_PARITY = YES (aprovação, pacote e handoff v2)
DOCUMENTATION_DRIFT_AFTER_R9 = PARTIAL
```

O drift funcional que a spec descrevia — *"nenhuma função necessária ao fluxo
SERP normal pode exigir a navegação para essa rota"* — **foi eliminado no que
toca aprovação e pacote**. O que resta na rota de detalhe e ainda não tem
equivalente no Workbench: o envio ao Planejador (`sendCurrentEvidence`, com a
dívida do B2) e o histórico detalhado de evidências. A atualização canônica dos
documentos é lote separado, conforme o item 14 do pedido.

---

## Critério de PASS

| Critério | Resultado |
| --- | --- |
| Uma única autoridade decide aprovação | ✅ `lib/radar/report-approval.ts` |
| Workbench e detalhe usam essa autoridade | ✅ testado por leitura de fonte |
| Falha remota não aparece como sucesso | ✅ `NOT_PERSISTED`, sem promoção |
| Readback faz parte do fechamento | ✅ `persistenceMode === "remote" && readbackConfirmed` |
| Package depende da aprovação canônica | ✅ estado bloqueado nem chama `persist` |
| `npm run test:radar` verde | ✅ 191/191 |

```text
R9 = PASS (implementação)
```

O smoke DataForSEO real e a validação pós-F5 permanecem gate do usuário.
