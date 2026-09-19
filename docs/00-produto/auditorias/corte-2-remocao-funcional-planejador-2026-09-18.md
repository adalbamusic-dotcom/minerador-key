# Corte 2 — remoção funcional do Planejador e fechamento Radar → Redator → Publicações

**Data:** 2026-09-18
**Base:** `auditoria-remocao-planejador-2026-09-18.md` (rev. 2) e `sdd-remocao-planejador-e-retencao-48h-2026-09-18.md`.
**Não executado:** migration, SQL remoto, deploy, commit, push, purge.
**Executado:** edições locais em código, contratos e testes. Nada commitado.

---

## 1. Consumidores removidos

### 1.1 Contrato de comando — `lib/editorial/persistence-contracts.ts`

`import_planner`, `prepare_plan`, `approve_plan` e `start_writing` saíram da união `WorkflowCommandSchema`. Continuam: `import_radar`, `transition_radar`, `import_publications`.

`start_writing` era a **única** porta por onde `publication_records` nascia, e exigia ContentPlan aprovado no Planejador.

### 1.2 Rota ativa — `app/api/editorial/workflow/route.ts`

Os quatro blocos `if (command.action === …)` foram removidos, junto de:

- imports `importRadarToPlanner`, `contentPlanApprovalIssues`, `ArtifactRepository`, `ContentDocumentRepository`;
- a variável `artifacts`, que só servia aos blocos removidos;
- a transição `approved → sent_planner` e `sent_planner → approved` em `allowedRadar`;
- **toda exigência de permissão `planejador:*`** — a rota não pede mais nenhuma.

### 1.3 Contexto do pipeline — `components/editorial-pipeline-context.tsx`

Removidos, com seus tipos na interface: `preparePlannerItems`, `savePlannerPlan`, `approvePlannerItems`, `startWriting` e `simulatePlanAndDocument` (61 linhas, por âncora única verificada, com backup).

`simulatePlanAndDocument` merece registro: **nenhuma tela a chamava** e ela era a última fábrica de ContentPlan + ContentDocument v1 alcançável pelo contexto. Código morto que ainda sabia criar v1 é pior que código morto.

Entrou no lugar: `sendToPublications(documentId)`, que **só grava estado local depois** de `readbackConfirmed === true` vindo do servidor.

Os cinco imports de `lib/planejador` saíram — `createContentPlanSuccessor`, `hasMaterialPlanChange`, `resolvePlannerPublicationIdentity`, `publicationSourceIssues`, `publishedIdentityReferenceIssues`. **O contexto não importa mais nada do módulo.**

### 1.4 Núcleo do fluxo — `lib/editorial/operational-flow.ts`

Removidas `createOperationalPlan`, `createOperationalDocument` (fábrica de documento **v1**) e `createPublicationDraft(item: PlannerItem, …)`.

Entrou `createWriterPublication({ brandId, document, article })`, com autoridade em ContentDocument + origem Radar. Ela **exige v2** e lança quando recebe v1 — v1 aqui significaria que alguém reabriu o caminho do Planejador, e o erro precisa dizer isso.

`documentId` passou a `z.string().min(1)` em `OperationalPublicationSchema`. O preflight mostrou a coluna nulável no banco; a garantia precisa existir onde ela pode existir.

O import de `../planejador/content-plan.ts` e o re-export de `contentPlanApprovalIssues` saíram. **O núcleo do pipeline não depende mais de `lib/planejador`.** Quem ainda usa a função — o cockpit, para validar e exibir — importa direto do módulo dono.

### 1.5 Telas do Planejador — somente leitura

`modules/planejador/planner-page.tsx`: removidos `prepare`, `approve`, `write` e os três botões. Restam "Abrir cockpit" e "Radar", ambos navegação.

`modules/planejador/planner-cockpit-workspace.tsx`: removidos `save`, `approve`, `sendWriter` e os quatro botões. Resta "Validar plano", que é leitura, com o aviso de que a área não grava mais.

### 1.6 Redator — a entrada é o Radar

`components/editorial/professional-writer.tsx`: `importFromPlanner` → `importFromRadar`. O botão "Plano do Planejador (histórico)" virou **"Importar do Radar"**.

O botão **não implementa handoff**: lista elegíveis (`state ∈ {approved, sent_writer}` no Radar, da marca ativa) e chama `postRadarWriterHandoffBatch` — o mesmo cliente que o botão do Radar usa, na mesma rota, no mesmo `sendRadarToWriter`.

Idempotência é do serviço: primeiro envio importa; repetição com a mesma identidade devolve `ALREADY_IMPORTED`; divergência de identidade/hash devolve `BLOCKED_STALE`, erro explícito e nunca sobrescrita.

O rodapé separou dois atos: **"Aprovar documento"** e **"Enviar a Publicações"**.

---

## 2. Arquivos criados

| Arquivo | Papel |
| --- | --- |
| `lib/server/writer-publication-handoff.ts` | `sendWriterToPublications` — ordem `validar marca → validar documento → validar origem Radar → validar pendências e gates → persistir → reler → sucesso` |
| `app/api/redator/publication-handoff/route.ts` | rota, com `redator:approve` + `publicacoes:create` e `documentId` obrigatório |

Gates aplicados no serviço, nesta ordem: documento existe na marca → passa no contrato → é v2 → declara `radarOrigin` → sem pendência **bloqueante** do Radar → sem achado `blocked` do Guardião → status `aprovado`.

Pendência bloqueante impede **entregar**, não impede **escrever**. São eixos diferentes, e foi assim que o gate anterior fechou.

---

## 3. Defeito encontrado pelo próprio teste

`createWriterPublication` repassava `document.radarOrigin` inteiro para `OperationalPublicationSchema.radarOrigin`, que é `.strict()` e aceita dois campos — o original tem dez. O parse recusava.

Corrigido com projeção explícita. E seria pior se tivesse passado: o registro de publicação viraria uma segunda cópia da origem, livre para divergir do documento.

---

## 4. Legado — classificação

| Item | Classe | Motivo |
| --- | --- | --- |
| `lib/radar/planner-handoff.ts` | **RADAR_INTERNAL_NOT_PLANNER_PRODUCT** | Tem nome de Planejador e é motor do Radar: `operational-view`, `report-approval`, `radar-canonical-dossier`, `radar-analysis-page` e o **próprio `radar-writer-send.ts`** o importam. Renomear tocaria Radar e quebraria 10 testes que o leem por caminho literal. **Registrado para renomeação em tarefa própria.** |
| `lib/server/radar-planner-send.ts` | **TEMP_READ_ONLY_DEPENDENCY** | Sem rota, sem botão, sem comando. Seis testes do Radar o leem como texto **para provar que ele não é mais o caminho** — apagá-lo apagaria a prova. Depende de `importRadarToPlanner` e `PlannerItemSchema`. |
| `importRadarToPlanner`, `PlannerItemSchema` em `operational-flow.ts` | **TEMP_READ_ONLY_DEPENDENCY** | Sustentam o item acima e `PersistedEditorialWorkspaceSchema.plannerItems`, que lê linha antiga. Nenhuma rota os invoca. |
| `sent_planner` no enum, `plannerItemId`, `contentPlanVersionId`, `contentPlanRef` | **TEMP_READ_ONLY_DEPENDENCY** | Vocabulário de leitura. Retirá-los faria a leitura recusar linha já gravada. A **transição** que produzia `sent_planner` foi removida; o valor continua legível. |
| `lib/planejador/**`, `modules/planejador/**`, rota `/planejador` | **MOVE_TO_MARCA_LATER** | Somente leitura, fora do menu e da esteira, sem caminho de escrita. As funções de planejamento vão para uma aba da Marca. |
| `lib/planejador/publication-identity.ts` | **MOVE_TO_MARCA_LATER** | Não migrou: com os métodos do contexto removidos, o único consumidor restante é o próprio cockpit. Mover agora seria churn sem consumidor novo. |
| `createOperationalPlan`, `createOperationalDocument`, `createPublicationDraft`, `simulatePlanAndDocument`, os 4 comandos | **REMOVE_NOW** ✔ | Removidos nesta rodada. |

### 4.1 O que ainda impede a exclusão física de `/planejador`

1. **Seis testes do Radar** leem `lib/server/radar-planner-send.ts` como texto; dois testes do fluxo operacional e um da topbar leem `modules/planejador/*.tsx`. Apagar os arquivos quebra a suíte do Radar, que está fora do corte.
2. **`PersistedEditorialWorkspaceSchema.plannerItems`** e `LocalWorkflowRecoverySchema.plannerItems` continuam no contrato de leitura. Removê-los exige decidir o que acontece com um `localStorage` gravado antes do corte.
3. **`lib/planejador/hydration.ts`** e `cockpit-view-model.ts` são consumidos pelo cockpit, que ainda abre para leitura.
4. **Decisão de produto pendente:** a aba da Marca ainda não existe. Enquanto ela não existir, apagar o módulo apaga a referência de para onde ele vai.

Nenhum desses é "preservar por histórico": são dependências de compilação e de suíte, nomeadas, com dono e com condição de saída.

---

## 5. Testes

### 5.1 Resultado, comparado ao baseline

| Suíte | Baseline | Depois | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** | — |
| `test:redator` | 28/28 | **28/28** | 0 |
| `test:editorial` | 60/64, 4 falhas | **60/64, 4 falhas** | 0 |
| `tests/operational-flow.test.mts` | 40/50, **10 falhas** (medido em HEAD) | **41/51, 10 falhas** | **0 regressões** |
| `tests/planejador-fora-do-pipeline.test.mts` | 8 pass + 7 todo | **16/16, 0 todo** | +8 |
| `test:radar` (loader correto) | — | **2236/2236** | 0 falhas |
| `eslint` nos arquivos tocados | — | **0 erros**, 7 avisos pré-existentes | 0 novos |

As 4 falhas de `test:editorial` e as 10 de `operational-flow` são **pré-existentes**. Medi o baseline restaurando os arquivos do git e rodando a suíte antes de reaplicar o corte: mesma lista, mesma contagem. Não foram corrigidas — são regressão não relacionada e a tarefa pede para não misturá-las.

### 5.2 Uma falha foi causada pelo corte, e foi resolvida atualizando o teste

`interface operacional identifica mocks e usa o Redator Tiptap real` exigia, via `assertHistoricalPlannerEntryIsSecondary`, que o Redator mantivesse o caminho do Planejador "alcançável e nomeado como histórico", e exigia o rótulo `Aprovar para Publicações`.

As duas assertivas descreviam o **Corte 1**. O Corte 2 removeu o comando que aquele botão chamava; manter a exigência obrigaria a tela a oferecer uma ação que o servidor recusa — o teste estaria protegendo o defeito que o corte fechou.

A função virou `assertRadarIsTheOnlyWriterEntry`, que exige "Importar do Radar", exige que ele chame `postRadarWriterHandoffBatch` e **recusa** qualquer volta de `startWriting` ou do botão do Planejador.

### 5.3 O que a trava cobre agora

16 testes verdes em `tests/planejador-fora-do-pipeline.test.mts`: estágios declarados, menu, esteira, estado de pipeline, documentação, telas, leitura do legado preservada, documento novo v2, os quatro comandos fora do contrato, os quatro fora da rota, nenhuma tela chamando os métodos removidos, Planejador respondendo sem gravar, publicação nascendo do documento, `documentId` obrigatório, readback obrigatório no cliente, e o botão do Redator chamando a mesma autoridade.

---

## 6. Retenção de 48h — não implementada

Nada de purge foi escrito. As invariantes permanecem registradas em `invariantes.md` §65-69 e na SDD §4.1-bis:

```text
PURGE_BY_AGE_ONLY = NO
ONLY_AFTER_CONFIRMED_REPLACEMENT = YES
RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H
DNA_AND_RADAR_RETENTION = OUT_OF_SCOPE
```

Nenhum DNA, SERP, evidência, evento MCP ou histórico de módulo anterior foi tocado. `test:radar` 2236/2236 é a medida disso.

---

## 7. Preflight — concluído; o que M1/M2/M3 ainda esperam

> **Correção de método.** Este documento e as revisões anteriores davam o preflight como bloqueado. Ele não estava: **`npx supabase db query --linked "<sql>"` executa SQL arbitrário no banco remoto, sem Docker e sem senha.** Eu havia checado `supabase inspect db --help` — e `query` é subcomando de `supabase db`. Os sete blocos foram executados em 2026-09-18; os resultados estão na §2.5 da auditoria rev. 2.

O que a leitura efetiva mudou no desenho:

- **`pg_cron` e `pg_net` NÃO estão instalados.** O purge não pode ser agendado no banco: precisa de rota server-side disparada de fora. É o único achado que altera M2 e M3.
- **`pipeline_editorial_protect_append_only` é incondicional** — `RAISE EXCEPTION` sem olhar `TG_OP`, coluna ou linha — e está em `BEFORE DELETE OR UPDATE` nas **três** tabelas de versão, incluindo `editorial_artifact_versions`. A M2 precisa reescrevê-la liberando exatamente dois casos.
- **Três FKs `RESTRICT`** confirmados no nível efetivo, como os arquivos previam.
- **RLS não precisa mudar:** as seis tabelas do corte têm apenas política de `SELECT` para `authenticated`; escrita é só por `service_role`.
- **CHECK de `stage`** confirmado como o da `0027`, com `'planner'`.

Estado das três migrations:

- **M1** (`stage` sem `planner`) — desenho fechado. Nota prática: o CHECK ainda aceita `'planner'`, **mas nenhum código grava com esse valor**, porque `import_planner` não existe mais. A remoção funcional nunca dependeu da constraint.
- **M2** (retenção de histórico + `current_version_id` em `writer_deliverables`) — desenho fechado, com a ressalva do agendamento por rota.
- **M3** (âncora `anchor_kind` + `anchor_ref` e substituição de mídia) — desenho fechado.

**As três esperam apenas autorização de DDL, que é decisão de produto.** Nada mais está pendente de medição.

---

## 8. Arquivos alterados neste corte

**Criados:**
```
lib/server/writer-publication-handoff.ts
app/api/redator/publication-handoff/route.ts
docs/00-produto/auditorias/corte-2-remocao-funcional-planejador-2026-09-18.md
```

**Alterados:**
```
lib/editorial/persistence-contracts.ts          (4 comandos fora da união)
lib/editorial/operational-flow.ts               (3 fábricas fora; createWriterPublication; documentId .min(1); sem import de planejador)
app/api/editorial/workflow/route.ts             (4 blocos fora; sem permissão planejador; sem transição sent_planner)
components/editorial-pipeline-context.tsx       (5 métodos fora; sendToPublications com readback; sem imports de planejador)
components/editorial/professional-writer.tsx    ("Importar do Radar"; "Enviar a Publicações"; sem startWriting)
modules/planejador/planner-page.tsx             (somente leitura)
modules/planejador/planner-cockpit-workspace.tsx (somente leitura; import direto do módulo dono)
tests/operational-flow.test.mts                 (fixture v2; createWriterPublication; entrada pelo Radar)
tests/planejador-fora-do-pipeline.test.mts      (7 todo → 8 testes reais)
```

**Intocados:** `lib/arquiteto/**`, `lib/radar/**`, `lib/minerador/**`, `modules/arquiteto/**`, `modules/radar/**`, `modules/minerador/**`, `lib/radar/planner-handoff.ts`, `lib/server/radar-planner-send.ts`.
