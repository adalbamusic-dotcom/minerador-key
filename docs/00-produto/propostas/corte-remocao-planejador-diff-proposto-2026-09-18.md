# Corte de remoção lógica do Planejador — aplicado e proposto

**Data:** 2026-09-18
**Base:** `auditoria-remocao-planejador-2026-09-18.md` (revisão 2) e `sdd-remocao-planejador-e-retencao-48h-2026-09-18.md`.
**Não executado nesta rodada:** SQL, migration, deploy, commit, push, purge, alteração remota.
**Executado nesta rodada:** edições locais em documentação, navegação e testes. Nada foi commitado.

---

## 1. Aplicado — o que já está no working tree

### 1.1 `lib/editorial/navigation.ts`

```diff
-export const PRODUCT_MODULES: Record<ProductModule, { label: string; href: string; adminOnly?: boolean }> = {
+export const PRODUCT_MODULES: Record<ProductModule, { label: string; href: string; adminOnly?: boolean; historical?: boolean }> = {
-  radar: { … }, planejador: { label: "Planejador", href: "/planejador" },
+  radar: { … }, planejador: { label: "Planejador", href: "/planejador", historical: true },
 };
+
+export const MODULE_STAGE: Record<ProductModule, number | null> = {
+  marca: 1, minerador: 2, arquiteto: 3, radar: 4,
+  redator: 6, publicacoes: 7, conta: 8,
+  planejador: null, admin: null,
+};

-export function menuEntriesForRole(role: string) { … .filter(([, item]) => !item.adminOnly || role === "admin") … }
+export function menuEntriesForRole(role: string) { … .filter(([, item]) => !item.historical && (!item.adminOnly || role === "admin")) … }

+export type PipelineModule = Exclude<ProductModule, "conta" | "admin" | "planejador">;
 export function derivePipelineStates(…) {
-    radar: …, planejador: "blocked", redator: "blocked", publicacoes: "not_started" } satisfies Record<Exclude<ProductModule, "conta" | "admin">, PipelineState>;
+    radar: …, redator: "blocked", publicacoes: "not_started" } satisfies Record<PipelineModule, PipelineState>;
 }
```

Três decisões dentro dessa mudança:

- **`historical: true` separa rota registrada de rota oferecida.** Apagar a entrada apagaria junto o caminho para os planos já aprovados. O menu passou a filtrar por essa marca; a rota continua respondendo.
- **`MODULE_STAGE` é mapa, não índice.** `redator: 6` é o nome do estágio. Derivar de posição obrigaria a existir algo no 5, e alguém inventaria uma etapa para preencher o vão.
- **`conta` não entra em `PRODUCT_FLOW`.** `PRODUCT_FLOW` é o que o menu de workflow exibe; pôr Conta ali a colocaria na esteira editorial. O estágio 8 vive em `MODULE_STAGE`.

### 1.2 Documentação canônica

| Arquivo | Mudança |
| --- | --- |
| `docs/00-produto/fluxo-oficial.md` | fluxo `Marca → Minerador → Arquiteto → Radar → Redator → Publicações`; nova seção **Árvore da plataforma** com os estágios e a posição 5 declarada e não atribuída; linha do Planejador vira "removido do pipeline", com os zeros medidos no banco; linha de Publicações passa a declarar que o caminho direto **ainda não existe** |
| `docs/00-produto/invariantes.md` | §47 reescrita (pipeline completo + `PLANEJADOR_STAGE = NONE`); §51 ganha **dois gatilhos, uma autoridade**; novas §59-64 (remoção lógica e árvore) e §65-69 (retenção) |
| `docs/00-produto/pipeline-editorial-papeis-handoffs.md` | seção do Planejador passa de "fora do fluxo" para "removido do pipeline", com o registro de que **não há migração de conteúdo** |
| `docs/06-planejador/spec.md` e `estado-atual.md` | cabeçalho declarando saída do pipeline, os zeros do banco e o destino futuro como aba da Marca |
| SDD | invariantes de retenção em §4.1-bis; migrations renumeradas para **M1 = `stage`, M2 = histórico editorial, M3 = mídia**; `anchor_id` → **`anchor_ref`** |
| Auditoria rev. 2 | mesma renumeração e mesmo rename |

### 1.3 Testes

| Arquivo | Mudança |
| --- | --- |
| `tests/planejador-fora-do-pipeline.test.mts` | **novo** — 8 travas verdes + 7 `todo` nomeando o que falta |
| `tests/editorial-pipeline.test.mts` | menu sem `/planejador`; `states.planejador` deixa de existir em vez de ser `"blocked"` |
| `tests/radar-to-writer-handoff-1.test.mts` | passa a exigir `historical: true`, o filtro do menu e os estágios declarados |
| `package.json` | `test:editorial` passa a incluir a trava nova |

**Resultado medido:** `test:editorial` 44/48 antes e 44/48 depois — **as mesmas 4 falhas pré-existentes**, nenhuma introduzida (§5). `tests/radar-to-writer-handoff-1.test.mts` 26/26. `tests/planejador-fora-do-pipeline.test.mts` 8 pass / 0 fail / 7 todo. `npx tsc --noEmit` sem erros.

---

## 2. Proposto — não aplicado

Quatro caminhos de escrita e um serviço novo. Ficam propostos porque o passo seguinte deste corte mexe em contrato de comando compartilhado, e a SDD pede aprovação antes disso.

### 2.1 `lib/editorial/persistence-contracts.ts` — remover três ações do contrato

```diff
   z.object({ action: z.literal("transition_radar"), brandId: z.string(), itemIds: z.array(z.string()), target: RadarItemSchema.shape.state, expectedLocks: z.record(z.string(), z.number().int().positive()) }),
-  z.object({ action: z.literal("import_planner"), brandId: z.string(), radarItemIds: z.array(z.string()), expectedLocks: z.record(z.string(), z.number().int().positive()) }),
-  z.object({ action: z.literal("prepare_plan"), brandId: z.string(), plannerItemId: z.string(), expectedLock: z.number().int().positive(), plan: VersionedContentPlanSchema }),
-  z.object({ action: z.literal("approve_plan"), brandId: z.string(), plannerItemIds: z.array(z.string()), expectedLocks: z.record(z.string(), z.number().int().positive()), versionEvents: z.array(VersionStatusEventSchema).default([]) }),
-  z.object({ action: z.literal("start_writing"), brandId: z.string(), plannerItemId: z.string(), expectedLock: z.number().int().positive(), articleVersion: VersionedArticleDNASchema, plan: VersionedContentPlanSchema, document: ContentDocumentSchema, publication: OperationalPublicationSchema }),
+  /*
+   * REMOÇÃO LÓGICA DO PLANEJADOR — 2026-09-18.
+   *
+   * `import_planner`, `prepare_plan`, `approve_plan` e `start_writing` saíram
+   * do contrato: eram os quatro caminhos de ESCRITA NOVA pelo Planejador.
+   * O vocabulário de LEITURA (`plannerItemId`, `contentPlanVersionId`,
+   * `sent_planner`) permanece — linha antiga continua fazendo parse.
+   *
+   * `start_writing` era a única porta por onde `publication_records` nascia.
+   * Quem a substitui é `writer_publication_handoff`, sem plano e sem item.
+   */
+  z.object({ action: z.literal("publish_from_writer"), brandId: z.string(), documentId: z.string().min(1), expectedLock: z.number().int().positive() }),
   z.object({ action: z.literal("import_publications"), brandId: z.string(), publicationIds: z.array(z.string()), expectedLocks: z.record(z.string(), z.number().int().positive()) }),
```

Remover `VersionedContentPlanSchema` do import se nenhum outro uso restar no arquivo.

### 2.2 `app/api/editorial/workflow/route.ts` — remover os quatro blocos

```diff
-    if (command.action === "import_planner") { … assertEditorialPermission(…, "planejador", "create") … stage: "planner" … "sent_planner" … }
-    if (command.action === "prepare_plan")   { … assertEditorialPermission(…, "planejador", "edit")   … }
-    if (command.action === "approve_plan")   { … assertEditorialPermission(…, "planejador", "approve") … }
-    if (command.action === "start_writing")  { … exige ContentPlan aprovado … new PublicationRepository().create(…) … }
```

Some junto: o import de `importRadarToPlanner`, o de `contentPlanApprovalIssues` e o `allowedRadar` que mapeia `approved → sent_planner` (linha 16). **A permissão `planejador:*` deixa de ser exigida em qualquer rota.**

### 2.3 `components/editorial-pipeline-context.tsx` — remover os acoplamentos

```diff
-import { createContentPlanSuccessor } from "@/lib/planejador/content-plan";
-import { publicationSourceIssues, publishedIdentityReferenceIssues, resolvePlannerPublicationIdentity } from "@/lib/planejador/publication-identity";
-import { hasMaterialPlanChange } from "@/lib/planejador/outline";
+import { publicationSourceIssues, publishedIdentityReferenceIssues, resolvePublicationIdentity } from "@/lib/publicacoes/publication-identity";
```

```diff
-  savePlannerPlan: (plannerItemId: string, details: ContentPlanDetails, actorId: string) => Promise<…>;
-  approvePlannerItems: (ids: string[], actorId?: string) => void;
-  startWriting: (plannerItemId: string) => Promise<{ articleId: string; documentId: string }>;
+  sendToPublications: (documentId: string) => Promise<{ publicationId: string }>;
```

`importApprovedToPublications` deixa de gravar estado local antes da resposta: hoje ele atualiza o workspace e dispara `void sendWorkflowCommand(...)`, e só `import_radar` verifica readback. **Isso é estado local fantasma** e sai no mesmo passo.

`lib/planejador/publication-identity.ts` **migra** para `lib/publicacoes/` — é identidade de publicação, não planejamento, e o caminho novo precisa dela. `resolvePlannerPublicationIdentity` passa a `resolvePublicationIdentity`.

### 2.4 `lib/editorial/operational-flow.ts` — origem Radar em vez de plano

```diff
-import { contentPlanApprovalIssues, createDefinitiveContentPlan } from "../planejador/content-plan.ts";
-
-export function createPublicationDraft(item: PlannerItem, plan: VersionEnvelope<ContentPlan>, document: ContentDocument, article: VersionEnvelope<ArticleDNA>, now = new Date().toISOString()) {
-  return OperationalPublicationSchema.parse({ id: `publication:${item.articleId}`, …,
-    plannerItemId: item.id, contentPlanVersionId: plan.versionId, … });
-}
+/**
+ * A publicação nasce do DOCUMENTO, não de um plano.
+ *
+ * `plannerItemId` e `contentPlanVersionId` continuam no schema, nulos — eles
+ * descrevem registro antigo e não são exigência de registro novo. A origem do
+ * fluxo vigente é sempre `radarOrigin`, e a invariante "todo registro declara
+ * alguma origem" continua valendo por ela.
+ */
+export function createWriterPublication(document: ContentDocument, article: VersionEnvelope<ArticleDNA>, now = new Date().toISOString()) {
+  if (document.schemaVersion !== 2) throw new Error("Publicação nova exige documento v2 de origem Radar.");
+  return OperationalPublicationSchema.parse({ id: `publication:${document.articleDnaRef.entityId}`,
+    brandId: document.brandId, articleId: document.articleDnaRef.entityId,
+    plannerItemId: null, contentPlanVersionId: null, radarOrigin: document.radarOrigin,
+    documentId: document.id, title: document.title, slug: document.metadata.slug,
+    siloId: document.siloDnaRef.entityId, hierarchy: article.payload.hierarchy,
+    state: "draft", responsible: null, destination: null,
+    createdAt: now, updatedAt: now, origin: "local", lockVersion: 1 });
+}
```

Saem também `PlannerItemSchema`, `createOperationalPlan` e as transições `approved → sent_planner` / `sent_planner → approved`. **O valor `sent_planner` permanece no enum** — linha antiga precisa fazer parse.

### 2.5 Contrato novo de Publicações — `documentId` obrigatório

O preflight mostrou que `publication_records.document_id` **é nulável no banco**. Registro de publicação sem documento passa no schema físico. A garantia tem de ser de contrato:

```diff
 export const OperationalPublicationSchema = z.object({
-  documentId: z.string(),
+  /*
+   * OBRIGATÓRIO NO CONTRATO NOVO — o banco aceita nulo, e por isso a garantia
+   * mora aqui. Publicação sem documento é registro órfão: não há o que exportar
+   * nem o que revisar, e ninguém saberia que conteúdo ele representa.
+   */
+  documentId: z.string().min(1),
   …
 }).superRefine((publication, context) => {
   if (!publication.contentPlanVersionId && !publication.radarOrigin) { … }
 });
```

`.min(1)` é aditivo para leitura: nenhum registro existente tem `documentId` vazio — há **0 linhas** em `publication_records`.

### 2.6 Serviço novo — `lib/server/writer-publication-handoff.ts`

```ts
/**
 * REDATOR → PUBLICAÇÕES, SEM PLANEJADOR.
 *
 * A ordem é a mesma que o handoff do Radar já usa, e pela mesma razão: falha
 * parcial não pode virar sucesso. Se o readback do destino não confirmar, a
 * resposta é ERRO — um registro marcado como entregue que Publicações nunca
 * recebeu é pior do que não ter entregue.
 */
export async function sendWriterToPublications(input: {
  brandId: string; documentId: string; expectedLock: number; actorId: string;
}): Promise<{ change: "CREATED" | "ALREADY_SENT"; publicationId: string; documentHash: string }>;
```

Ordem obrigatória:

```
validar origem (documento v2, marca, permissão redator:approve + publicacoes:create)
  → validar hash do documento
  → verificar pendências bloqueantes do Guardião
  → montar registro (createWriterPublication, sem plano e sem item)
  → gravar no servidor
  → RELER do servidor
  → só então responder sucesso
```

Idempotência por id determinístico `publication:${articleId}`: repetir devolve `ALREADY_SENT`, não duplica.

### 2.7 Gatilho "Importar do Radar" no Redator

Substitui o botão "Plano do Planejador (histórico)" em `components/editorial/professional-writer.tsx:199` e o `WorkflowImportDialog` da linha 206.

```ts
// Lista: artigos da marca com state = 'approved' no estágio 'radar'.
// Ação: chama sendRadarToWriter com o mesmo articleId.
// NÃO valida, NÃO aprova, NÃO monta documento, NÃO escreve.
```

Uma autoridade, dois gatilhos. Idempotência já garantida por `radarDocumentId` determinístico, que devolve `ALREADY_IMPORTED`.

---

## 3. Arquivos afetados

**Alterados nesta rodada (working tree, sem commit):**
```
lib/editorial/navigation.ts
package.json
tests/editorial-pipeline.test.mts
tests/radar-to-writer-handoff-1.test.mts
tests/planejador-fora-do-pipeline.test.mts      (novo)
docs/00-produto/fluxo-oficial.md
docs/00-produto/invariantes.md
docs/00-produto/pipeline-editorial-papeis-handoffs.md
docs/00-produto/auditorias/auditoria-remocao-planejador-2026-09-18.md
docs/00-produto/propostas/sdd-remocao-planejador-e-retencao-48h-2026-09-18.md
docs/00-produto/propostas/corte-remocao-planejador-diff-proposto-2026-09-18.md  (novo)
docs/06-planejador/spec.md
docs/06-planejador/estado-atual.md
```

**Propostos para o passo seguinte:**
```
lib/editorial/persistence-contracts.ts
lib/editorial/operational-flow.ts
lib/editorial/providers.ts
lib/server/editorial-repositories.ts
lib/publicacoes/publication-identity.ts          (movido de lib/planejador/)
lib/server/writer-publication-handoff.ts         (novo)
app/api/editorial/workflow/route.ts
app/api/redator/publication-handoff/route.ts     (novo)
app/api/redator/radar-import/route.ts            (novo)
components/editorial-pipeline-context.tsx
components/editorial/professional-writer.tsx
```

**Intocados por decisão registrada:**
```
lib/radar/planner-handoff.ts        lib/server/radar-planner-send.ts
lib/planejador/**                   modules/planejador/**
lib/arquiteto/**  lib/radar/**  lib/minerador/**
```

---

## 4. Testes que precisarão ser atualizados

| Teste | Por quê | Quando |
| --- | --- | --- |
| `tests/planejador-fora-do-pipeline.test.mts` | os 7 `todo` viram assertivas reais | ao remover as 4 ações |
| `tests/operational-flow.test.mts` | lê `planner-page.tsx`, `planner-cockpit-workspace.tsx` e `content-plan-editor.tsx` como texto; e exercita `createPublicationDraft` | ao remover a fábrica |
| `tests/editorial-pipeline.test.mts` | usa `createMockPlanAndDocument` de `providers.ts` | ao remover o mock de plano |
| `tests/planejador-cockpit.test.mts`, `planejador-content-plan.test.mts`, `planejador-strategic-context.test.mts`, `planejador-publication-identity.test.mts` | **TESTE ANTIGO** — continuam verdes enquanto o módulo existir fora do pipeline; `planejador-publication-identity` muda de caminho quando o arquivo migrar | na migração de `publication-identity.ts` |
| `tests/radar-final-1/2/11`, `radar-canonical-dossier-parity-1`, `radar-portable-export-1`, `radar-to-writer-handoff-1` | leem `radar-planner-send.ts` como texto para provar que **não** é mais o caminho | **não mudam** — apagar o arquivo apagaria a prova |
| novos: `redator-publicacoes-origem-radar`, `redator-importar-do-radar` | caminho novo | no passo seguinte |

---

## 5. Bloqueios descobertos

1. **Quatro falhas pré-existentes em `test:editorial`**, medidas com e sem este corte — `44/48` nos dois casos. São testes que leem arquivos que não toquei: `rotas oficiais separam…`, `Minerador e Arquiteto incorporam seus DNAs…`, `layout Admin valida sessão…` e `Marca preserva compatibilidade…` (esta última procura `responsável legado`, que **não existe** em `modules/marca/brand-page.tsx` nem em `modules/conta/account-page.tsx`). **Não foram causadas aqui e não foram corrigidas aqui** — corrigi-las é tarefa própria, e mascará-las seria pior.

2. **`tests/radar-to-writer-handoff-1.test.mts` não roda com o runner padrão.** Precisa do loader: `--experimental-loader ./tests/integrations-runtime-loader.mjs`. Sem ele falha com `ERR_MODULE_NOT_FOUND` em `lib/server/editorial-db` — erro de invocação, não do código.

3. **A fundação MCP/multiformato continua untracked** — 23 arquivos, incluindo 4 migrations e 7 testes. Refatorar sobre arquivo sem histórico é risco evitável, e o passo seguinte mexe em contrato compartilhado. **Commitar antes.**

4. **O preflight de catálogo continua aberto** — blocos [2], [2b], [3], [3b] e [5]. Não bloqueia este corte; bloqueia M1, M2 e M3.

5. **`publication_records.document_id` é nulável no banco.** Registro órfão passa no schema físico. A garantia precisa ser de contrato Zod (§2.5), e o banco não a substitui.
