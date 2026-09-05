# Relatório de situação — Radar — 2026-09-05

Auditoria técnica e funcional do Radar no Minerador Key, conferindo a documentação
canônica contra o código do checkout. Destinatário: responsável pelo planejamento do
Radar. Não altera código, contratos, configuração, dados nem documentos canônicos.

Módulo proprietário desta leitura: Radar. Consumidores lidos apenas para entender
contrato: Arquiteto, Planejador, Plataforma (integrações, Telegram, workflow).

## Legenda de evidência

| Marca | Significado |
| --- | --- |
| **[COD]** | Verificado no código nesta auditoria, com arquivo e linha. |
| **[TEST]** | Confirmado por teste local executado nesta auditoria. |
| **[REM]** | Validação remota/manual registrada anteriormente por terceiros, com data e origem documental. Não re-executada aqui. |
| **[PLAN]** | Planejado/documentado, sem implementação correspondente. |
| **[NV]** | Não verificado nesta auditoria. |
| **[BLOQ]** | Bloqueado, com motivo concreto. |

---

## 1. Parecer executivo

O Radar tem **duas superfícies operacionais paralelas** e elas não são
equivalentes. Essa é a conclusão central desta auditoria e ela condiciona todas
as demais.

1. **O Workbench** (`/{brandRef}/radar`, `modules/radar/radar-page.tsx`) é a
   superfície descrita como fluxo normal pela spec vigente. Ele executa muito bem
   o ciclo SERP: Coleta → Concorrentes → Análise → Evidências → Revisão →
   Histórico, com decisão humana versionada, write e readback remotos por
   decisão, fingerprint de curadoria e reabertura por mudança material. **[COD]**
   **[TEST]**
2. **A rota de detalhe** (`/{brandRef}/radar/{articleId}`,
   `modules/radar/radar-analysis-page.tsx`), descrita pela spec como rota de
   "deep link, histórico, diagnóstico, relatório detalhado", é hoje **a única
   que constrói o `RadarEvidencePackage`, o `RadarPlannerHandoff` v2 e o recibo
   de transferência ao Planejador**. **[COD]**

Consequência prática: o Radar **hoje não entrega inteligência aprovada ao
Planejador pelo fluxo que a spec chama de normal**. Um artigo trabalhado
inteiramente no Workbench pode chegar ao Planejador como `PlannerItem` sem
`radarHandoff`, e o `ContentPlan` resultante nasce com a referência do snapshot
SERP aprovado, mas **sem relatório, sem necessidades, sem observações e sem
proveniência do Radar**. Isso contraria diretamente o contrato do documento
canônico de pipeline (`RadarApprovedPackage`) e a regra da spec de que "nenhuma
função necessária ao fluxo SERP normal pode exigir a navegação para essa rota".

Sobre a correção de readback após F5 (a pergunta explícita do escopo): **ela está
implementada e é sólida**. `GET /api/editorial/serp` faz readback estreito,
autenticado, por marca/artigo/versão de ArticleDNA/snapshot; o cliente confirma
por snapshot em `serpReviewReadbackSnapshotIds[]` em vez do antigo modo global;
há proteção contra resposta obsoleta durante write; e o fingerprint de curadoria
distingue aprovação atual, reaberta e legada sem comparabilidade. **[COD]**
**[TEST]** O bloqueio `SERP_APPROVAL_RELOAD=FAIL_REMOTE_CONFIRMATION` registrado
no bloco final do `estado-atual.md` é **histórico**: foi o diagnóstico que
originou a correção registrada no topo do mesmo arquivo. **Não deve ser repetido
como bloqueio atual.** O que permanece pendente é apenas a homologação do ciclo
completo com **snapshot novo** — nenhum registro posterior a 2026-08-27 comprova
uma coleta DataForSEO nova seguida de curadoria, aprovação e F5. **[NV]**

Fora do eixo SERP, o quadro é:

- **ExternalEvidence é rótulo de interface, não fluxo.** Não existe contrato,
  schema, persistência nem `SOURCE_REQUIRED` em lugar algum do código. **[COD]**
- **Especialista/Telegram tem implementação server-side completa e madura**
  (criação de especialista, token de onboarding, brief com readback, envio com
  claim/restore, webhook inbound com seleção explícita de brief e dedupe, worker
  local com Storage/Speech/organização). O que falta é homologação e a
  configuração do webhook público. **[COD]** **[REM]**
- **Porém a decisão humana que transforma contribuição em `ExpertEvidence` é
  gravada em `window.localStorage`.** É a violação mais séria encontrada: uma
  decisão editorial que alimenta o pacote entregue ao Planejador não é
  persistida, não é compartilhada entre pessoas e some ao limpar o navegador.
  **[COD]**
- **Dos oito campos que o Arquiteto transporta no `RadarItem`, o Radar lê
  dois.** `arquitetoSerpProvenance` e `arquitetoInternalLinks` — os dois campos
  novos e mais caros de produzir — não são lidos em nenhum lugar de
  `modules/radar` ou `lib/radar`. **[COD]**

**Próxima ação recomendada:** unificar a consolidação no Workbench (Lote R8 da
seção 7), fechando o caminho `relatório aprovado → RadarEvidencePackage →
RadarPlannerHandoff v2 → envio` sem exigir a rota de detalhe, e persistir a
decisão humana de `ExpertEvidence`. Ambos são mudanças aditivas dentro dos
contratos existentes e não exigem migration.

---

## 2. Matriz por frente

`I` = implementado no código · `P` = persistido remotamente · `T` = coberto por
teste local que passa · `H` = homologado (validação autenticada registrada) ·
Pendente = o que falta.

| Frente | I | P | T | H | Pendente |
| --- | :-: | :-: | :-: | :-: | --- |
| Recebimento do Arquiteto (silo canônico, gates, bloqueio declarado) | ✅ | ✅ | ✅ | 🟡 | Import pelo Radar perde `serpProvenance`/`serpAssessment`; 6 de 8 campos `arquiteto*` não são lidos |
| Coleta SERP DataForSEO (explícita, versionada, hash, usage ledger) | ✅ | ✅ | ✅ | 🟡 | Sem coleta nova registrada após 2026-08-27 |
| Curadoria de concorrentes (decisão granular, sucessora, readback) | ✅ | ✅ | ✅ | ✅ | Sem cap de 5 na UI contra `.max(5)` da rota de extração |
| Análise da amostra / benchmark / relatório competitivo | ✅ | ✅ | ✅ | ✅ | — |
| Revisão e aprovação SERP + readback após F5 | ✅ | ✅ | ✅ | 🟡 | Homologar ciclo completo com snapshot **novo** |
| Subnavegação SERP (6 subabas, `nextSerpStep`) | ✅ | n/a | ✅ | 🟡 | Percurso autenticado dos 12 passos não registrado |
| Fila sequencial / operações coletivas | ✅ | ❌ | ✅ | ❌ | Fila é estado de sessão; perde-se no F5 |
| **ExternalEvidence** | ❌ | ❌ | ❌ | ❌ | **Não existe: só rótulos de UI** |
| Cadastro de especialista + binding Telegram | ✅ | ✅ | ✅ | 🟡 | Homologar onboarding real |
| ExpertBrief (criar/salvar/revisar, readback) | ✅ | ✅ | ✅ | 🟡 | Homologação autenticada com brief real |
| Envio Telegram do brief | ✅ | ✅ | ✅ | ❌ | Webhook público não configurado; E2E pendente |
| Inbound Telegram + contribuição + jobs | ✅ | ✅ | ✅ | ❌ | E2E pendente |
| Worker local (asset, transcrição, organização) | ✅ | ✅ | 🟡 | ❌ | Speech/Storage reais não homologados |
| **Decisão humana → ExpertEvidence** | ✅ | ❌ | ✅ | ❌ | **Persistida só em `localStorage`** |
| Relatório consolidado R6/R7 (gerar/revisar/aprovar) | ✅ | 🟡 | ✅ | ❌ | Aprovação no Workbench é local e some no F5 |
| `RadarEvidencePackage` | ✅ | ✅ | ✅ | ❌ | Produzido **só** na rota de detalhe |
| `RadarPlannerHandoff` v2 | ✅ | ✅ | ✅ | ❌ | Produzido **só** na rota de detalhe; nunca validado com dado real |
| `internalLinkGraphRef` no handoff | 🟡 | ❌ | ✅ | ❌ | Campo existe; **nenhum chamador o preenche** |
| Importação Radar → Planejador | ✅ | ✅ | 🟡 | ❌ | Sem gate de pacote; sem atualização de handoff em reenvio |
| Isolamento por marca / identidade publicada | ✅ | ✅ | ✅ | 🟡 | Cross-brand do ledger Telegram é `PARTIAL` por desenho |

---

## 3. Contrato real Arquiteto → Radar

### 3.1 O que o transporte comporta

`RadarItemSchema` (`lib/editorial/operational-flow.ts:33-78`) é o contrato real.
Ele carrega, além da identidade (`brandId`, `articleId`, `articleDnaVersionId`,
`articleDnaContentHash`, `title`, `slug`, `siloId` **obrigatório**, `hierarchy`,
`principalKeywordId`, `format`, `intent`, `state`, `lockVersion`, `unitType`):

| Campo | Origem | Lido pelo Radar? |
| --- | --- | :-: |
| `hydration` (`RadarHydrationSnapshot`) | `createRadarHydrationSnapshot` | ✅ |
| `analysisVersions[]` | Radar (append-only) | ✅ |
| `arquitetoStrategyContext` | `buildArticleControlContext` | 🟡 só na rota de detalhe |
| `arquitetoKgrIdentity` | `ArticleDNA.kgrIdentity` | 🟡 só para sugerir o modo |
| `arquitetoKeywordDnaReferences` | `ArticleDNA.keywordReferences` | ❌ |
| `arquitetoKeywordUrlRelations` | referências | ❌ |
| `arquitetoArchitectureStatus` | `ArticleDNA` | ❌ |
| `arquitetoSerpAssessment` | SERP de formação | ❌ |
| `arquitetoSerpProvenance` | `buildArchitectSerpProvenance` | ❌ |
| `arquitetoInternalLinks` | `relevantEdgesForArticle` | ❌ |

**[COD]** Busca literal por `arquiteto[A-Z]*` em `modules/radar` + `lib/radar`
retorna exatamente duas ocorrências: `arquitetoStrategyContext`
(`radar-analysis-page.tsx:190`) e `arquitetoKgrIdentity`
(`radar-page.tsx:341`). `arquitetoKeywordDnaReferences` é lido apenas pelo
próprio Arquiteto, no readback do seu smoke
(`modules/arquiteto/arquiteto-workspace.tsx:3860`).

### 3.2 Dois caminhos de importação com fidelidade diferente

| | Arquiteto → "Enviar ao Radar" | Radar → "Importar do Arquiteto" |
| --- | --- | --- |
| Origem | `modules/arquiteto/arquiteto-workspace.tsx:3792-3823` | `modules/radar/radar-page.tsx:652` |
| Silo canônico | resolvido pelo Arquiteto | resolvido em `buildRadarHandoffContexts` |
| `internalLinks` | ✅ | ✅ (via grafos carregados) |
| `serpProvenance` | ✅ `buildArchitectSerpProvenance` | ❌ **`null`** |
| `arquitetoSerpAssessment` | ✅ `serpByArticle` | ❌ **`null`** (`serpAssessments = {}`) |

**[COD]** A chamada do Radar é
`pipeline.importApprovedToRadar(ids, [], {}, {}, graphs)` — terceiro e quarto
argumentos vazios. Em `components/editorial-pipeline-context.tsx:661-707`, o
contexto ausente é reconstruído pelo mesmo builder do Arquiteto, mas com
`serpProvenance: null` fixo (linha 683).

**Impacto:** um artigo importado pela tela do Radar chega sem o parecer da SERP
de formação e sem a decisão humana que resolveu uma divergência. O Radar pode
"redescobrir" um conflito já resolvido — exatamente o cenário que o comentário
de `lib/arquiteto/radar-handoff-gate.ts:255-262` diz querer evitar.

### 3.3 Gates e bloqueios

`resolveRadarEligibility` (`lib/arquiteto/radar-handoff-gate.ts:92-215`) avalia
12 códigos por artigo, entre eles `CANONICAL_SILO_BINDING`, `SERP_EXECUTED`,
`SERP_CURRENT`, `SERP_RESOLVED` e `INTERNAL_LINK_GRAPH_APPROVED`, e devolve
`blockers` em português. **[COD]** **[TEST]** (`arquiteto-radar-handoff-gate`,
`arquiteto-radar-handoff-context`).

O servidor recusa gravação sem pai canônico com o artigo nomeado
(`app/api/editorial/workflow/route.ts:35-40`), e valida o `RadarItem`
reconstruído contra a versão e o hash que estão sendo gravados (linhas 40-48).
Isso fecha o "0 enviados · N ignorados" mudo.

### 3.4 Bloqueio para identidade incompatível

`resolveArticle` em `app/api/editorial/serp/route.ts:27-129` exige
`RadarSerpResolutionEnvelope` hashado, confere marca/artigo/versão/silo/vínculo
principal e bloqueia **antes** de qualquer chamada DataForSEO. Keyword remota
canônica vence a transferência local; alias sem UUID canônico só usa recuperação
local se marca, artigo e silo coincidirem. **[COD]** **[TEST]**
(`radar-resolution-envelope`).

---

## 4. Contrato real Radar → Planejador

### 4.1 O envelope

`RadarPlannerHandoffSchema` (`lib/radar/analysis-contracts.ts:179-193`,
`.strict()`, `schemaVersion: 2`) transporta:

- identidade: `brandId`, `radarItemId`, `articleId`, `articleDnaVersionId`,
  `siloDnaVersionId`;
- `status` — só `APPROVED` gera envelope (`planner-handoff.ts:32`);
- `approvedReport`: id, versão, hash, resumo, limitações, `needs[]` com decisão
  humana, recomendações e `humanDecisions[]`;
- `evidencePackage`: o `RadarEvidencePackage` inteiro (curadoria incluída e
  excluída, PAA/related/entidades relevantes, estrutura observada, semântica,
  competitividade, `kgrStrategy`, `keywordObservations`, `conflicts`,
  `humanNotes`, hash e proveniência);
- `serp`: snapshot, versão, hash, provider, query, `references[]` com papel
  (`primary`/`support`/`format`/`excluded`);
- `expertEvidence[]`, `productEvidence[]`, `humanDecisions[]`;
- `internalLinkGraphRef` opcional;
- `provenance` completa e `hash` do envelope.

### 4.2 O que o pacote **não** transporta

| Item do contrato canônico | Situação |
| --- | --- |
| `ExternalEvidence` | **Ausente do schema.** Não há campo. `RadarEvidencePackageSchema` é `.strict()`; incluir exige alteração aditiva do contrato. |
| `EvidenceNeeds` / `SOURCE_REQUIRED` | Só existem como `approvedReport.needs[]` derivadas do relatório competitivo. `SOURCE_REQUIRED` não existe no código. |
| `SiloContext` completo | Só `siloDnaVersionId`. Página-raiz, slug/canonical do silo e papel Pilar/Suporte ficam no `RadarItem`, não no envelope. |
| `internalLinkGraphRef` | Campo existe e é validado, mas **nenhum chamador o preenche** — a única chamada de `buildRadarPlannerHandoff` (`radar-analysis-page.tsx:478-493`) não passa o argumento. Sempre `null`. |

### 4.3 Onde o envelope nasce — e onde não nasce

**[COD]** `buildRadarPlannerHandoff` e `buildRadarEvidencePackage` são importados
por **um único arquivo**: `modules/radar/radar-analysis-page.tsx` (linhas 9-10).
São chamados uma vez, em `approve()` (linhas 476-494), que:

1. gera o `RadarCompetitiveReport` com `status: "approved"`;
2. gera o `RadarEvidencePackage` com `kgrStrategy`;
3. gera o `RadarPlannerHandoff` v2 com `expertEvidence` remota revisada;
4. grava uma sucessora `status: "approved"` com `plannerPackage: handoff`;
5. **só declara sucesso se `persistenceMode === "remote" && readbackConfirmed`**.

O Workbench (`radar-page.tsx`) constrói o `RadarCompetitiveReport` em modo
`draft` (linha 422) e nada mais. Sua ação `approveReportForArticle` (linha
553-558) grava `report: "REPORT_APPROVED"` em `r4LocalByArticle` — `useState`
puro (linha 62), sem localStorage — e a própria mensagem admite: *"Relatório
aprovado localmente. Isso não cria uma versão remota nem envia ao Planejador."*

Além disso, qualquer sucessora não aprovada zera o pacote:
`createRadarAnalysisSuccessor` (`analysis-contracts.ts:333`) força
`plannerPackage: null` quando `targetStatus !== "approved"`. Isso está **certo**
(mudança de curadoria invalida o pacote), mas significa que só o caminho de
aprovação da rota de detalhe deixa um pacote persistido.

### 4.4 Importação, idempotência e readback no Planejador

- **Não existe ação de importação no Planejador.** `importApprovedToPlanner` é
  chamada apenas de `radar-page.tsx:292` e `radar-analysis-page.tsx:422`. A tela
  do Planejador (`modules/planejador/planner-page.tsx`) só oferece "Preparar
  plano". O fluxo é *push* do Radar, não *pull* explícito do Planejador. **[COD]**
- **Gate de estado, não de pacote.** `importRadarToPlanner`
  (`operational-flow.ts:262-270`) exige `item.state === "approved"` e anexa
  `radarHandoff` via `approvedHandoffForRadarItem` — que devolve `undefined` se
  nenhuma versão aprovada carregar um envelope válido. **O item entra no
  Planejador mesmo assim, sem o pacote.** O servidor
  (`app/api/editorial/workflow/route.ts:58-64`) aplica o mesmo gate de estado.
- **Elegibilidade no Workbench depende de estado de sessão.** A operação em lote
  `planner` fica elegível quando `snapshot.reportApproved`
  (`lib/radar/r4-queue.ts:321-323`), e `reportApproved` inclui
  `Boolean(r6Report?.final)` — derivado do estado local volátil
  (`radar-page.tsx:173`). Após F5 essa aprovação desaparece.
- **Escrita remota não é aguardada.** `importApprovedToPlanner` atualiza o estado
  local e dispara `void sendWorkflowCommand(...)`
  (`editorial-pipeline-context.tsx:717-726`), sem `await`. A mensagem
  "Evidências enviadas ao Planejador" aparece antes de qualquer confirmação
  remota. Compare com `importApprovedToRadar` (linha 705), que **aguarda** a
  escrita antes de mudar o estado local. **[COD]**
- **Idempotência existe, atualização não.** `workflow.importItem` faz upsert com
  `onConflict: "marca_id,subject_type,subject_id,stage"` e
  `ignoreDuplicates: true` (`editorial-repositories.ts:119-127`), e
  `importRadarToPlanner` pula `articleId` já existente. Um reenvio é, portanto,
  **um no-op**: o `radarHandoff` do `PlannerItem` **nunca é atualizado**.
- **Nova versão do Radar com ContentPlan existente:** `preparePlannerItems`
  (`editorial-pipeline-context.tsx:727-745`) usa `existing || await
  createOperationalPlan(...)`. Havendo plano, ele é reaproveitado e a nova
  evidência do Radar **não entra**. O `plannerTransfer` do Radar sinaliza
  "atualização disponível" na sua própria tela
  (`radar-analysis-page.tsx:200-201`), mas **não há caminho que leve essa
  atualização ao `ContentPlan`**.
- **Consumo:** quando o pacote chega, o Planejador o usa de verdade —
  `readPlannerRadarEvidence` alimenta perguntas, entidades, tópicos, faixa de
  palavras, requisitos e decisões humanas do `ContentPlan`
  (`lib/planejador/content-plan.ts:73-145`). O problema é a origem, não o
  consumo.

---

## 5. Problemas e divergências

Ordenados por impacto. Nenhum foi corrigido nesta auditoria.

### P1 — O fluxo normal não produz o pacote entregue ao Planejador · alto

- **Causa:** `buildRadarEvidencePackage` / `buildRadarPlannerHandoff` só são
  chamados em `modules/radar/radar-analysis-page.tsx:476-494`. O Workbench aprova
  relatório apenas em estado de sessão (`radar-page.tsx:553-558`).
- **Evidência:** **[COD]** busca de chamadores retorna um único arquivo;
  `radar-page.tsx:62` mostra `r4LocalByArticle` como `useState` sem persistência.
- **Impacto:** um artigo trabalhado só no Workbench chega ao Planejador sem
  relatório aprovado, sem necessidades, sem observações estruturais/semânticas e
  sem proveniência do Radar. O `ContentPlan` nasce com a referência do snapshot
  SERP e nada mais. Contraria `pipeline-editorial-papeis-handoffs.md` ("Entrega ao
  Planejador: RadarApprovedPackage…") e a própria spec do Radar ("Nenhuma função
  necessária ao fluxo SERP normal pode exigir a navegação para essa rota").
- **Recomendação:** portar a consolidação para o Workbench reusando os builders
  existentes; manter a rota de detalhe como diagnóstico. Mudança aditiva, sem
  schema novo.

### P2 — Decisão humana de `ExpertEvidence` vive em `localStorage` · alto

- **Causa:** a decisão por contribuição é lida e gravada em
  `radar:expert-evidence-review:<brand>:<article>:<version>:<brief>`
  (`modules/radar/radar-expert-brief-panel.tsx:268,280-298` para escrita;
  `modules/radar/radar-analysis-page.tsx:239-247` para leitura).
- **Evidência:** **[COD]**
- **Impacto:** viola AGENTS.md §10 (localStorage nunca é fonte canônica de
  autorização/persistência) e §9 (decisão humana confirmada não muda em
  silêncio). Outra pessoa, outro dispositivo ou o mesmo navegador com dados
  limpos vê todas as contribuições como `pending_review`, o que **bloqueia a
  aprovação do relatório** (`radar-analysis-page.tsx:466-468`). E a
  `ExpertEvidence` que entra no handoff — e no hash do envelope — deriva de um
  estado não persistido.
- **Recomendação:** persistir a decisão como camada do contrato de contribuição
  já existente (o campo de revisão pertence a `expert_contributions`, que já é
  remoto), com readback. Avaliar se cabe como aditivo ao contrato atual ou se
  exige SDD — ver seção 6.

### P3 — `ExternalEvidence` não existe fora da interface · alto (escopo)

- **Causa:** o painel Evidências mostra o rótulo "ExternalEvidence" com o texto
  *"Nenhuma ExternalEvidence é criada nesta tela; o contrato atual não persiste
  fontes externas neste painel"* (`modules/radar/radar-r3-serp-panel.tsx:76`).
- **Evidência:** **[COD]** busca por `ExternalEvidence`/`externalEvidence` em
  `.ts`/`.tsx` não retorna nenhum contrato, schema, rota ou repositório do Radar.
  `SOURCE_REQUIRED` aparece **apenas** em
  `docs/00-produto/pipeline-editorial-papeis-handoffs.md:84`.
- **Impacto:** a cadeia canônica "necessidade → Source → Evidence → revisão →
  aprovação" e a distinção `Source != Evidence` são inteiramente **[PLAN]**.
  Afirmações sustentadas, não sustentadas, limites, fontes conflitantes e
  `SOURCE_REQUIRED` não têm nenhuma representação. O envelope v2, sendo
  `.strict()`, não tem campo para transportá-las.
- **Recomendação:** tratar como frente própria, dimensionada honestamente
  (contrato + persistência + UI + extensão aditiva do envelope), não como
  "acabamento" do lote SERP.

### P4 — Envio ao Planejador anuncia sucesso sem confirmação remota · médio/alto

- **Causa:** `importApprovedToPlanner` dispara `void sendWorkflowCommand(...)`
  (`editorial-pipeline-context.tsx:723`) e retorna síncrono; ambos os chamadores
  emitem a mensagem de sucesso em seguida (`radar-analysis-page.tsx:422-425`,
  `radar-page.tsx:292`).
- **Evidência:** **[COD]**
- **Impacto:** viola AGENTS.md §10 ("sucesso só aparece após confirmação real do
  salvamento"). Uma falha do servidor deixa a tela dizendo "enviado" com o item
  ausente do Planejador remoto. O padrão correto já existe ao lado, em
  `importApprovedToRadar` (linha 705, `await`).

### P5 — Reenvio do Radar não atualiza o Planejador · médio/alto

- **Causa:** dedupe por `articleId` em `importRadarToPlanner`
  (`operational-flow.ts:263-264`), upsert com `ignoreDuplicates: true`
  (`editorial-repositories.ts:122`) e `existing || createOperationalPlan(...)`
  em `preparePlannerItems`.
- **Evidência:** **[COD]**
- **Impacto:** a promessa da spec ("Uma atualização posterior deve ser exibida
  como disponível para envio e não pode duplicar artigo ou `ContentPlan`") cumpre
  a metade "não duplica" e falha a metade "atualização chega". Uma nova versão
  aprovada do Radar fica visível no Radar e invisível para o Planejador.

### P6 — Extração falha com mais de 5 referências selecionadas · médio

- **Causa:** `app/api/editorial/radar-analysis/extract/route.ts:12` valida
  `candidates` com `.min(1).max(5)`; `radarAnalysisCandidates`
  (`lib/radar/serp-curation.ts:146-153`) não aplica limite e inclui **todas** as
  linhas com papel `primary` **ou** `support`
  (`serp-curation.ts:71-86`).
- **Evidência:** **[COD]**
- **Impacto:** com o padrão de 10 resultados orgânicos
  (`SERP_DEFAULT_RESULTS`), marcar 6 referências e clicar em "Analisar
  referências selecionadas (N)" devolve 400 com "Solicitação de extração Radar
  inválida" — mensagem que não diz o que fazer. A spec fala em amostra de 3-5
  páginas comparáveis, mas nada na UI comunica ou aplica o teto.

### P7 — `tests/radar-persistence.test.mts` não carrega · médio

- **Causa:** `lib/server/serp-persistence-adapter.ts:1-3` usa imports relativos
  **sem extensão** (`"../editorial/contracts"`, `"../radar/identifiers"`,
  `"../radar/serp/contracts"`). Os demais módulos consumidos por testes usam
  `.ts` explícito.
- **Evidência:** **[TEST]** `ERR_MODULE_NOT_FOUND: Cannot find module
  '…/lib/editorial/contracts' imported from …/lib/server/serp-persistence-adapter.ts`.
- **Impacto:** o arquivo de teste que cobre **exatamente** o adaptador de
  persistência de snapshot/revisão SERP — a camada no centro do problema de
  readback pós-F5 — está morto. Não afeta build nem `tsc` (`moduleResolution:
  bundler`); é defeito só do runner `node --test`. Explica por que os registros de
  2026-08-27 falam em "69 testes" e "63 testes": as execuções não incluíram este
  arquivo.

### P8 — `tests/radar-hydration.test.mts` falha por fixture desatualizada · baixo

- **Causa:** a fixture (`as any`, linhas 9-14) monta um `ArticleDNA` sem
  `confidence`. `fallbackHierarchyStrategy`
  (`lib/arquiteto/strategic-context.ts:267-274`) usa `article.confidence` para
  `score` e para quatro `components`, que `ArticleHierarchyStrategySchema`
  (`contracts.ts:277-289`) exige.
- **Evidência:** **[TEST]** ZodError em `importArticlesToRadar`.
- **Impacto:** risco de produção baixo — `ArticleDNASchema` exige `confidence`,
  então um payload real validado sempre a tem. Mas é um teste vermelho na suíte
  do Radar, e a documentação afirma que os testes direcionados passam.

### P9 — Chamada DeepSeek do Radar não entra no ledger de uso · médio

- **Causa:** `app/api/editorial/radar-topics/route.ts` resolve a Connection e
  gera, mas não chama `recordIntegrationUsage`. Rotas de IA comparáveis do
  Arquiteto e do Minerador chamam
  (`arquiteto/territorial-ai`, `minerador/.../ia/brief-apresentacao`,
  `process-intent-niche`), e a própria rota SERP do Radar chama
  (`app/api/editorial/serp/route.ts:236-245`).
- **Evidência:** **[COD]**
- **Impacto:** consumo pago do único consumidor de IA do Radar fica fora da
  contabilidade. Agravado por `HOMOLOGATION_ALLOW_ALL` em
  `lib/server/integrations-runtime.ts:28`, registrado na revisão de 2026-09-04.

### P10 — `internalLinkGraphRef` é contrato sem produtor · médio

- **Causa:** `buildRadarPlannerHandoff` aceita e valida `internalLinkGraphRef`
  (`lib/radar/planner-handoff.ts:21,32,90`), mas a única chamada não o passa
  (`radar-analysis-page.tsx:478-493`). E `arquitetoInternalLinks`, gravado no
  `RadarItem`, não é lido em lugar nenhum do Radar.
- **Evidência:** **[COD]**
- **Impacto:** o `estado-atual.md` de 2026-08-27 diz "o Radar apenas consome a
  referência quando ela for enviada" — correto quanto ao contrato, mas o
  consumo não existe e o campo chega sempre `null` ao Planejador.

### P11 — `snapshot.save` declara `remote` sem readback · médio

- **Causa:** `SerpSnapshotRepository.save`
  (`lib/server/editorial-repositories.ts:194-205`) faz `insert` e retorna `true`
  sem reler. `saveReview` (linhas 207-226) faz insert **+ readback + conferência**
  e falha fechado se divergir.
- **Evidência:** **[COD]**
- **Impacto:** assimetria. A coleta anuncia "Persistência remota confirmada"
  (`radar-page.tsx:280`) sobre um insert não relido. O `GET` estreito compensa na
  leitura seguinte, mas a mensagem imediata afirma mais do que foi provado.

### P12 — Importar do Arquiteto exige permissão de aprovação do Arquiteto · médio

- **Causa:** `import_radar` exige `arquiteto:approve` **e** `radar:create`
  (`app/api/editorial/workflow/route.ts:18`). Para colaborador com
  `brand_membership`, a permissão é conferida por par módulo/ação em
  `brand_member_permissions` (`lib/server/editorial-authorization.ts:26-31`).
- **Evidência:** **[COD]**
- **Impacto:** um operador de Radar sem grant explícito de `arquiteto:approve`
  recebe 403 no botão "Importar do Arquiteto" da própria tela do Radar. É
  precondição de cadastro, não bug — mas precisa estar documentada.

### P13 — Fingerprint de curadoria viaja como texto livre · baixo

- **Causa:** a aprovação grava a seleção dentro de `notes`
  (`radar-page.tsx:441`) e a leitura a extrai por regex
  `/seleção humana:\s*([^.;\n]+)/i` (`lib/radar/serp-review-state.ts:17`).
- **Evidência:** **[COD]** **[TEST]**
- **Impacto:** funciona hoje porque a nota é gerada pelo código. Mas a rota
  legada de revisão inline aceita nota humana livre
  (`radar-page.tsx:703`); uma aprovação por ali fica sem fingerprint e cai em
  `currentness: "unknown"` ("Aprovação histórica exige comparação"). Carregar
  identidade estrutural em texto livre é frágil por desenho.

### P14 — Dívida visual concentrada no caminho que entrega ao Planejador · baixo

- **Evidência:** **[COD]** `scripts/visual-system-baseline.json` tolera 94
  ocorrências no Radar — `radar-analysis-page.tsx` 58, `radar-page.tsx` 32,
  `competitive-report-panel.tsx` 3, `[articleId]/page.tsx` 1 — de 714 no
  repositório. `node scripts/check-visual-system.mjs` passa (a única violação de
  "roxo proibido" está no Arquiteto).
- **Impacto:** a rota de detalhe usa paleta `slate/teal` fixa
  (`text-white`, `bg-slate-950`, `border-slate-800`), fora dos tokens
  compartilhados — e é justamente a tela obrigatória para aprovar e entregar.

### Divergências documentais

| Tema | Fontes em conflito | Regra canônica aplicável |
| --- | --- | --- |
| Aprovação SERP após F5 | `estado-atual.md:3-27` (corrigido, validado) × `estado-atual.md:906-948` (`SERP_APPROVAL_RELOAD=FAIL_REMOTE_CONFIRMATION`) e `backlog.md:473-487` | **Vale o bloco do topo.** O código confirma a correção. Os gates do bloco final são o diagnóstico que a originou. Recomenda-se marcá-los explicitamente como supersedidos no backlog. |
| Posição/quantidade de links internos | `lib/editorial/operational-flow.ts:64-66` ("nunca a âncora final nem quantidade ou posição de link: essas três são pergunta do Radar") × `docs/05-radar/spec.md` §Fronteira permanente ("Radar não define … links internos") × `docs/04-arquiteto/links-internos-estado-e-contrato.md` ("Planejador decide seção/contexto/obrigatoriedade; Redator formula a âncora final") | **Vale a fronteira: o Radar não decide links.** O comentário de código é o divergente. **O código se comporta conforme a regra canônica** — o Radar não lê `arquitetoInternalLinks` e não emite nenhuma decisão de link. Recomenda-se corrigir o comentário, não o comportamento. Se a intenção era que o Radar *observasse* padrões de linkagem dos concorrentes como evidência, isso é decisão arquitetural pendente (D3). |
| `RadarApprovedPackage` × `RadarEvidencePackage` × `RadarPlannerHandoff` | `AGENTS.md` §2 e pipeline canônico citam `RadarApprovedPackage`; o código implementa `RadarEvidencePackage` (v1) embrulhado em `RadarPlannerHandoff` (v2) | `RadarApprovedPackage` é **nome conceitual** do artefato canônico; sua materialização é o `RadarPlannerHandoff` v2. Vale registrar o mapeamento explicitamente para acabar com a ambiguidade. |
| Fluxo por modo (5 áreas) × subabas SERP (6) | `spec.md` §"Fluxo organizado por modo — 2026-07-29" (Resumo/Selecionar referências/Análise da amostra/Relatório/Histórico) × §"Subnavegação contextual da SERP — 2026-08-27" (Coleta/Concorrentes/Análise/Evidências/Revisão/Histórico) | Vale a mais recente (2026-08-27), que descreve o Workbench. A de 2026-07-29 descreve a rota de detalhe e deveria ser marcada como tal. |

---

## 6. Pendências separadas por natureza

### 6.1 Código

| # | Pendência | Origem |
| --- | --- | --- |
| C1 | Produzir `RadarEvidencePackage` + `RadarPlannerHandoff` v2 a partir do Workbench | P1 |
| C2 | Persistir remotamente a aprovação do relatório consolidado (hoje some no F5) | P1 |
| C3 | Persistir a decisão humana de `ExpertEvidence` fora do `localStorage`, com readback | P2 |
| C4 | Aguardar a confirmação remota antes de anunciar envio ao Planejador | P4 |
| C5 | Permitir atualização do `radarHandoff` do `PlannerItem` em reenvio, sem duplicar `ContentPlan` | P5 |
| C6 | Limitar/comunicar a amostra de extração na UI (teto de 5) | P6 |
| C7 | Corrigir os três imports sem extensão em `lib/server/serp-persistence-adapter.ts` | P7 |
| C8 | Atualizar a fixture de `tests/radar-hydration.test.mts` | P8 |
| C9 | Registrar uso da integração em `radar-topics` | P9 |
| C10 | Preencher `internalLinkGraphRef` no handoff e/ou exibir `arquitetoInternalLinks` | P10 |
| C11 | Readback no `SerpSnapshotRepository.save`, como já existe em `saveReview` | P11 |
| C12 | Propagar `serpProvenance`/`serpAssessment` também no import feito pela tela do Radar | §3.2 |
| C13 | Promover o fingerprint de curadoria a campo estruturado da revisão | P13 |
| C14 | Criar script `test:radar` em `package.json` (36 arquivos de teste do Radar sem script) | §9 |

### 6.2 Homologação

| # | Pendência |
| --- | --- |
| H1 | Coleta DataForSEO **nova** autenticada → curadoria → aprovação → F5 → readback remoto confirmado (fecha `SERP_APPROVAL_RELOAD=PASS` com snapshot novo) |
| H2 | Percurso autenticado das 6 subabas SERP e da análise reaberta após mudança de concorrente |
| H3 | Onboarding real de especialista: token → `/start` no bot → binding ativo |
| H4 | Envio real de ExpertBrief pelo Telegram com readback |
| H5 | Inbound Telegram E2E: texto, depois voz/áudio → job → worker → transcrição → organização |
| H6 | Primeiro `RadarPlannerHandoff` v2 real: aprovar, enviar, reler no Planejador e verificar isolamento entre marcas |
| H7 | Validação visual responsiva do Workbench e da rota de detalhe |

### 6.3 Cadastro e configuração

| # | Pendência |
| --- | --- |
| K1 | Configurar o **webhook público do Telegram** (`TELEGRAM_WEBHOOK = NOT_CONFIGURED` em `docs/00-produto/invariantes.md`). Bot global e `getMe = PASS` não substituem isso |
| K2 | Cadastrar ao menos um `brand_expert` ativo e um binding Telegram para a marca de homologação (UI já existe: `modules/marca/brand-experts-panel.tsx`) |
| K3 | Conceder `arquiteto:approve` ao operador de Radar, ou revisar o gate de `import_radar` (P12) |
| K4 | Confirmar Connections READY de DeepSeek, Speech e Storage para o worker |
| K5 | Revisar a política comercial de consumo antes de ampliar chamadas pagas, dado `HOMOLOGATION_ALLOW_ALL` |

### 6.4 Decisão arquitetural

| # | Decisão pendente |
| --- | --- |
| D1 | **`ExternalEvidence`**: definir contrato (necessidade → Source → Evidence → revisão), persistência e a extensão aditiva do envelope v2. É trabalho de SDD, não de lote de UI |
| D2 | **Atualização Radar → Planejador com `ContentPlan` existente**: sucessora do plano? aviso de "atualização disponível"? decisão humana obrigatória do Planejador? Fronteira compartilhada — exige acordo com o Planejador |
| D3 | **Links internos**: o Radar deve *observar* padrões de linkagem dos concorrentes como evidência? Hoje não observa. Se sim, é evidência, nunca decisão; e o comentário divergente de `operational-flow.ts:64-66` precisa ser corrigido de qualquer forma |
| D4 | **Onde vive a decisão humana sobre `ExpertContribution`**: campo do contrato de contribuição (aditivo) ou entidade de revisão própria (estrutural)? |
| D5 | **Papel da rota `/{brandRef}/radar/{articleId}`** depois de C1: diagnóstico e histórico, ou superfície de aprovação alternativa? Duas superfícies de aprovação são custo permanente |
| D6 | **Nome canônico do artefato**: consolidar `RadarApprovedPackage` (conceito) ↔ `RadarPlannerHandoff` v2 (implementação) na documentação |

---

## 7. Próximo lote recomendado

### Lote R8 — Consolidação e entrega no Workbench

**Escopo mínimo.** Fechar, dentro do Workbench e sem exigir a rota de detalhe, o
caminho `relatório revisado → relatório aprovado (remoto) → RadarEvidencePackage
→ RadarPlannerHandoff v2 → envio confirmado ao Planejador`, e persistir a decisão
humana que produz `ExpertEvidence`.

Itens: **C1, C2, C3, C4, C7**. Oportunisticamente, no mesmo toque: **C6, C8,
C9, C11**.

**Fora do escopo.** `ExternalEvidence` (D1), atualização de `ContentPlan`
existente (D2), links internos (D3), Telegram E2E, migrations, novo schema,
alteração de contrato do Planejador.

**Dependências.**

- D4 precisa ser decidida **antes** de C3. Se a decisão couber como campo aditivo
  no contrato de contribuição já remoto, o lote segue sem SDD; se exigir entidade
  nova, C3 sai do lote e vira frente própria.
- C1 e C2 não dependem de decisão externa: reusam `buildRadarEvidencePackage`,
  `buildRadarPlannerHandoff` e `saveRadarAnalysis`, todos já existentes e
  testados.
- C4 e C5 tocam `editorial-pipeline-context.tsx`, compartilhado. C4 é aditivo
  (trocar `void` por `await`, alinhando com o padrão já usado ao lado). **C5 fica
  fora do lote** por depender de D2.
- H1 (coleta nova autorizada) é pré-requisito para o critério A5 e exige
  autorização explícita para uma chamada paga.

**Critérios de aceite.**

| # | Critério |
| --- | --- |
| A1 | Aprovar o relatório no Workbench grava sucessora `status: "approved"` com `plannerPackage` do tipo `RadarPlannerHandoff` v2 e só declara sucesso após write + readback remotos |
| A2 | Após F5, o Workbench relê a aprovação do relatório do remoto — sem depender de `r4LocalByArticle` |
| A3 | "Enviar ao Planejador" só fica elegível com envelope v2 válido presente; o `PlannerItem` criado **sempre** carrega `radarHandoff` |
| A4 | A mensagem de envio só aparece após a confirmação remota do `import_planner`; falha exibe erro e não muda o estado local |
| A5 | Com um snapshot **novo** coletado no lote: curadoria → análise → aprovação SERP → F5 → "SERP aprovada" com readback remoto (fecha `SERP_APPROVAL_RELOAD=PASS` e `RADAR_SERP_OPERATIONAL=PASS`) |
| A6 | A decisão sobre uma `ExpertContribution` sobrevive a F5, a outro navegador e a outro usuário da mesma marca, com readback; contribuição nova reabre a revisão do relatório |
| A7 | `node --test tests/radar-*.test.mts` passa em **todos** os 36 arquivos, incluindo `radar-persistence` e `radar-hydration` |
| A8 | Selecionar 6+ referências não produz 400: a UI comunica o teto antes da ação |
| A9 | `tsc --noEmit` não introduz erro novo (linha de base atual: 5 erros, nenhum no Radar); `eslint` e `check:visual-system` continuam passando; a dívida visual do Radar no baseline não aumenta |
| A10 | Nenhuma migration, RLS, tabela, provider ou alteração de contrato do Planejador foi criada |

**Lotes seguintes sugeridos (não neste):** R9 — `ExternalEvidence` (após D1);
R10 — Telegram E2E (após K1/K2); R11 — atualização Radar → Planejador (após D2).

---

## 8. Roteiro curto de validações manuais

Executado pelo usuário, em sessão autenticada. **R1-R3 não gastam créditos.**
**R4 gasta e exige autorização explícita.**

**R1 — Readback SERP após F5 (snapshot existente) · sem custo**
1. Abrir `/{brandRef}/radar`, marcar o artigo com snapshot e aprovação atuais.
2. SERP → Revisão: anotar o rótulo exibido.
3. F5. Reabrir SERP → Revisão.
4. **Esperado:** "SERP aprovada", com a nota da aprovação remota.
5. Mudar uma decisão de concorrente e reabrir Revisão.
6. **Esperado:** "Revisão reaberta"; a aprovação anterior permanece no Histórico.

**R2 — Fidelidade da importação · sem custo**
1. Importar um artigo pela tela do **Arquiteto** ("Enviar ao Radar").
2. Importar outro pela tela do **Radar** ("Importar do Arquiteto").
3. **Esperado hoje:** ambos entram; nenhuma tela do Radar exibe a proveniência da
   SERP de formação. Confirma §3.2 e a pendência C12.

**R3 — Onde a entrega realmente acontece · sem custo**
1. No Workbench, levar um artigo até "Relatório aprovado" e enviar ao Planejador.
2. Abrir o Planejador, expandir a linha e conferir o campo "Radar".
3. F5 e repetir.
4. **Esperado hoje:** a aprovação do relatório some após F5; o `ContentPlan`
   preparado não traz necessidades nem observações do Radar. Confirma P1.
5. Repetir pelo caminho `/{brandRef}/radar/{articleId}` → Relatório → "Aprovar
   relatório" → "Enviar ao Planejador".
6. **Esperado:** aqui o pacote aparece. Confirma a assimetria entre as superfícies.

**R4 — Ciclo completo com snapshot novo · COM CUSTO, exige autorização**
1. Autorizar **uma** atualização DataForSEO para um artigo.
2. "Atualizar SERP" → conferir nova versão de snapshot e hash no Histórico.
3. Curadoria completa (nenhum orgânico pendente) → "Analisar referências
   selecionadas" com **no máximo 5** → aprovar SERP.
4. F5 e reabrir Revisão.
5. **Esperado:** "SERP aprovada" com readback remoto. Fecha H1/A5.
6. Registrar `REAL_DATAFORSEO_CALLS=1` e `SERPER_CALLS=0`.

**R5 — Pré-condições do Especialista · sem custo**
1. Marca → painel de especialistas: criar/conferir especialista `active`.
2. Emitir token de onboarding e conferir o `startLink` do bot.
3. **Esperado:** sem webhook configurado (K1), o `/start` não completa o binding.
   Registrar como bloqueio de configuração, não de código.

---

## 9. Arquivos inspecionados, testes executados e limitações

### 9.1 Documentação lida

`AGENTS.md`; `docs/00-produto/invariantes.md`,
`pipeline-editorial-papeis-handoffs.md`, `mapa-estado-atual-plataforma.md`;
`docs/README.md`; `docs/compartilhado/regras-de-trabalho-e-documentacao.md`,
`sdd-radar-planejador-evidence-handoff-2026-08-26.md`;
`docs/04-arquiteto/links-internos-estado-e-contrato.md`;
`docs/05-radar/spec.md`, `estado-atual.md`, `backlog.md`, `propostas/`;
`docs/00-produto/auditorias/revisao-geral-plataforma-2026-09-04.md`.

### 9.2 Código inspecionado

**Radar — UI:** `modules/radar/radar-page.tsx`, `radar-analysis-page.tsx`,
`radar-r3-serp-panel.tsx`, `radar-expert-brief-panel.tsx`, `radar-workbench.tsx`,
`radar-r4-bulk-operations-bar.tsx`, `use-radar-serp-review-readback.ts`.

**Radar — domínio:** `lib/radar/serp-curation.ts`, `serp-review-state.ts`,
`serp-review-readback.ts`, `serp-process-navigation.ts`, `analysis-contracts.ts`,
`evidence-package.ts`, `planner-handoff.ts`, `competitor-extractor.ts`,
`expert-evidence.ts`, `expert-brief.ts`, `r4-queue.ts`, `r6-sequential.ts`,
`workbench.ts`, `resolution-envelope.ts`.

**Rotas:** `app/api/editorial/serp/route.ts`, `radar-analysis/route.ts`,
`radar-analysis/extract/route.ts`, `radar-topics/route.ts`,
`expert-briefs/route.ts`, `expert-briefs/send/route.ts`,
`editorial/workflow/route.ts`, `integrations/telegram/webhook/route.ts`,
`marcas/[brandId]/experts/route.ts`;
`app/(brand)/[brandRef]/radar/page.tsx` e `[articleId]/page.tsx`.

**Fronteiras:** `lib/arquiteto/radar-handoff-context.ts`,
`radar-handoff-gate.ts`, `strategic-context.ts`, `contracts.ts`;
`lib/editorial/operational-flow.ts`; `components/editorial-pipeline-context.tsx`;
`lib/server/editorial-repositories.ts`, `editorial-authorization.ts`,
`serp-persistence-adapter.ts`, `telegram/{webhook,operations,persistence}.ts`,
`local-worker/radar-expert-contribution.ts`; `lib/planejador/content-plan.ts`;
`modules/planejador/planner-page.tsx`;
`modules/arquiteto/arquiteto-workspace.tsx` (trecho de handoff).

**Configuração:** `package.json`, `tsconfig.json`,
`scripts/check-visual-system.mjs`, `scripts/visual-system-baseline.json`,
`supabase/migrations/` (inventário).

### 9.3 Testes e verificações executados

| Comando | Resultado |
| --- | --- |
| `node --test tests/radar-serp-review-readback tests/radar-serp-curation tests/radar-planner-handoff tests/radar-analysis-readback tests/radar-expert-evidence tests/radar-expert-brief` | **36/36 passaram** |
| `node --test tests/radar-*.test.mts` (36 arquivos) | **167 passaram, 2 falharam** — ver P7 e P8 |
| `npx tsc --noEmit --incremental false` | **5 erros, nenhum no Radar** — `components/editorial/dna-panels.tsx:1146`, `lib/minerador/keyword-qualification.ts:157`, 3× TS1501 em `tests/agency-adalba-platform-internal.test.mts` |
| `node scripts/check-visual-system.mjs` | **Passou** (exit 0). Única violação de "roxo proibido": `modules/arquiteto/territorial-workspace-rows.tsx:166` |

Nenhuma migration, SQL remoto, chamada paga, IA real, envio Telegram, worker,
commit, push ou deploy foi executado. `tsc` rodou com `--incremental false` para
não reescrever `tsconfig.tsbuildinfo`. `check-visual-system` rodou sem
`--update-baseline`.

### 9.4 Limitações desta auditoria

1. **Sem estado remoto.** Nenhuma consulta ao banco. Tudo que é dito sobre
   persistência remota vem da leitura do código e de registros documentais
   anteriores, nunca de leitura direta do Supabase.
2. **Sem navegador autenticado.** Nenhum servidor de desenvolvimento foi
   iniciado. Comportamentos de render, foco, responsividade e F5 não foram
   observados nesta sessão — daí o roteiro da seção 8.
3. **Sem chamada de provider.** DataForSEO, DeepSeek, Telegram, Speech e Storage
   não foram exercitados. `REAL_DATAFORSEO_CALLS=0`, `SERPER_CALLS=0`,
   `TELEGRAM_SENDS=0`, `AI_CALLS=0`.
4. **Checkout com alterações preexistentes extensas** (~1.900 entradas em
   `git status`, incluindo arquivos não rastreados como
   `lib/server/serp-persistence-adapter.ts`). O relatório descreve **este
   checkout**, não o `HEAD`. Todas as alterações preexistentes foram preservadas;
   o único arquivo criado é este relatório.
5. **Cobertura de teste ≠ aprovação.** Os 36 arquivos de teste do Radar não estão
   em nenhum script de `package.json`; a suíte só roda por invocação manual, o
   que explica P7 ter passado despercebido.
6. **Não auditado em profundidade:** RLS e policies das tabelas de Telegram/
   Experts; runner do Local Worker; contrato do Guardião; `ProductEvidence`/
   Amazon, que permanece declaradamente fora de escopo no código.
