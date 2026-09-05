# Smoke remoto do Territory Record — Fase 2A.3

Roteiro para o **USUÁRIO** executar. O agente não executou nenhuma requisição,
nenhuma mutação remota e nenhum SQL.

Até este roteiro voltar preenchido:
`TERRITORY_REMOTE_PERSISTENCE = UNPROVEN_UNTIL_USER_SMOKE`.

---

## 0. Pré-requisitos

**A sessão autenticada é obrigatória.** `resolvePipelineContext` resolve o ator
pela sessão (`defaultActorUserId()`), depois chama duas RPCs canônicas —
`canonical_actor_can_access_brand` e `canonical_actor_can_use_brand_action`
(`arquiteto` / `view` no GET, `arquiteto` / `edit` no PATCH). Só depois disso o
client `service_role` é entregue ao repositório.

Consequência prática: **execute pelo console do navegador**, numa aba já logada
na aplicação. `curl` sem os cookies de sessão devolve 401 antes de tocar o banco.

Substitua apenas os placeholders:

| Placeholder | Onde obter |
|---|---|
| `<BRAND_ID>` | UUID canônico da Brand de teste (`marcas.id`) |
| `<TERRITORY_REF>` | devolvido pelo Smoke A |
| `<EXPECTED_LOCK>` | `lockVersion` devolvido pelo GET |

`<BRAND_REF>` não é necessário: a API é endereçada por `brandId`.
Nenhum UUID de usuário é pedido — a rota resolve o ator pela sessão.

Use uma **Brand de teste**. O smoke deixa um território `candidate` persistido;
a limpeza está na seção 7 e **não** é por `DELETE`.

---

## 1. Smoke A — CREATE

O cliente **não** envia `territoryRef` nem `brandId`. O servidor emite os dois.

```js
const BRAND_ID = "<BRAND_ID>";

const draft = {
  schemaVersion: 1,
  existingSiloRef: null,
  name: "SMOKE 2A.3 — território de teste",
  centralEntity: "",
  macroIntent: "",
  boundary: { includes: [], excludes: [] },
  narrative: { statement: null, continuity: "unknown", brandAlignment: "unknown", rationale: [] },
  discovery: { discoveredBy: null, centralEntityInKeywordUniverse: false, keywordSuggestions: [] },
  territoryKind: "new",
  architecturalOrigin: "manual_strategic",
  ingestionOrigin: "ui",
  lifecycleStatus: "candidate",
  decisionState: "pending",
  publicationProtection: "unpublished",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFromTerritoryRef: null, splitIntoTerritoryRefs: [], supersededByTerritoryRef: null, absorbedTerritoryRefs: [] },
  consolidation: null,
  pendingOperation: null,
  conflicts: [],
  reasons: ["Smoke de persistência remota da Fase 2A.3."],
  provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
};

const criar = await fetch("/api/arquiteto/workspace", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ brandId: BRAND_ID, territoryCreates: [{ territory: draft }] }),
}).then(r => r.json().then(body => ({ status: r.status, body })));

console.log(criar.status, JSON.stringify(criar.body, null, 2));
```

Este draft foi validado localmente contra `TerritoryCandidateSchema` — passa.
Ele é deliberadamente **mínimo**: `centralEntity` e `macroIntent` vazios,
narrativa `unknown`. Persiste, mas **não** fica confirmável, e é isso que se
quer aqui: o alvo é persistência, não aprovação editorial.

**EXPECTED_CREATE**

- `status = 200`
- `body.success = true`
- `body.data.persistence = "PERSISTED"`, `body.data.source = "CANONICAL_REMOTE"`
- `body.data.items = []` (nenhuma keyword foi tocada)
- `body.data.territories[0].territoryRef` casa com `/^territory:[0-9a-f-]{36}$/`
- `body.data.territories[0].lockVersion = 1`
- `body.data.territories[0].state = "candidate"`
- `body.data.territories[0].territory.brandId = <BRAND_ID>`

Guarde `<TERRITORY_REF>` = `body.data.territories[0].territoryRef`.

---

## 2. Smoke B — GET e identidade

```js
const ler = async () => {
  const r = await fetch(`/api/arquiteto/workspace?brandId=${BRAND_ID}`);
  const body = await r.json();
  return { status: r.status, territorios: body?.data?.territories ?? [] };
};

const t1 = await ler();
console.log(t1.status, JSON.stringify(t1.territorios, null, 2));
```

**EXPECTED_READBACK** — no item cujo `territoryRef` é `<TERRITORY_REF>`:

| Campo | Esperado |
|---|---|
| `territoryRef` | `<TERRITORY_REF>` |
| `lockVersion` | `1` |
| `state` | `"candidate"` |
| `territory.brandId` | `<BRAND_ID>` |
| `territory.lifecycleStatus` | `"candidate"` |
| `territory.decisionState` | `"pending"` |
| `territory.centralEntity` | `""` |
| `territory.macroIntent` | `""` |
| `territory.boundary` | `{ includes: [], excludes: [] }` |
| `territory.narrative` | `continuity` e `brandAlignment` = `"unknown"` |
| `territory.lineage` | os quatro campos vazios/`null` |
| `territory.pendingOperation` | `null` |
| `territory.existingSiloRef` | `null` |

E **nada** de `lista_id`, `siloId` ou `articleId` deve ter aparecido em qualquer
lugar do território.

A API **não** expõe `subject_id`, `source_entity_id` nem `marca_id` — o
`TerritoryWorkflowItem` devolve só `workflowItemId · territoryRef · lockVersion ·
state · territory · createdAt · updatedAt`. Por isso a verificação dessas três
colunas é a sonda SQL da seção 6.

---

## 3. Smoke C — UPDATE com lock correto

**`territory` é o candidato COMPLETO, não um patch.** O store faz
`TerritoryCandidateSchema.parse({ ...draft, territoryRef, brandId })`, e o schema
é `.strict()`: um objeto parcial é recusado com 400.

```js
const TERRITORY_REF = "<TERRITORY_REF>";
const EXPECTED_LOCK = <EXPECTED_LOCK>;

const alterado = {
  ...draft,
  narrative: { ...draft.narrative, statement: "Narrativa gravada pelo smoke 2A.3." },
};

const atualizar = (lock) => fetch("/api/arquiteto/workspace", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    brandId: BRAND_ID,
    territoryUpdates: [{ territoryRef: TERRITORY_REF, expectedLock: lock, territory: alterado }],
  }),
}).then(r => r.json().then(body => ({ status: r.status, body })));

const ok = await atualizar(EXPECTED_LOCK);
console.log(ok.status, JSON.stringify(ok.body?.data?.territories, null, 2));

const t2 = await ler();
console.log(JSON.stringify(t2.territorios.find(t => t.territoryRef === TERRITORY_REF), null, 2));
```

**EXPECTED_UPDATE**

- `status = 200`, `body.success = true`
- `territory.narrative.statement = "Narrativa gravada pelo smoke 2A.3."`
- `lockVersion = 2` (avançou; o gatilho da tabela incrementa)
- o GET seguinte devolve o valor novo — **este é o ponto em que
  `REMOTE_PERSISTENCE = PROVEN`**
- `territoryRef` inalterado; `state` continua `"candidate"`

---

## 4. Smoke D — stale lock

Repita o update com o lock **antigo**:

```js
const stale = await atualizar(EXPECTED_LOCK); // o mesmo 1 de antes
console.log(stale.status, stale.body);

const t3 = await ler();
console.log(JSON.stringify(t3.territorios.find(t => t.territoryRef === TERRITORY_REF), null, 2));
```

**EXPECTED_STALE_LOCK**

- `status = 409`
- `body.code = "CONFLICT"`
- `body.error = "O item de workflow foi alterado ou não pertence à Brand."`
  (vem de `WorkflowRepository.update`, que exige `.eq("lock_version", expectedLock)`)
- o GET seguinte mostra o estado do Smoke C **intacto**: `lockVersion = 2`,
  `statement` preservado. Nenhuma segunda mutação.

---

## 5. Smoke E — identidade imutável

```js
const identidade = await fetch("/api/arquiteto/workspace", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    brandId: BRAND_ID,
    territoryUpdates: [{
      territoryRef: TERRITORY_REF,
      expectedLock: 2,
      territory: { ...alterado, territoryRef: "territory:99999999-9999-4999-8999-999999999999" },
    }],
  }),
}).then(r => r.json().then(body => ({ status: r.status, body })));

console.log(identidade.status, identidade.body);
```

**Ponto exato da recusa:** `app/api/arquiteto/workspace/route.ts`, no laço de
`territoryUpdates`, **antes** de qualquer chamada ao store — a comparação
`declaredRef !== update.territoryRef`.

- `status = 409`, `code = "CONFLICT"`
- `body.error = "A identidade do território é imutável."`
- GET seguinte: `lockVersion` continua `2`, nenhum território novo criado.

Confirme os três "não": o body **não** vence, a linha **não** vence em silêncio,
e **nenhum** território novo aparece.

Variante de criação (opcional): mande `territoryCreates` com `territoryRef`
declarado. Recusa em `"territoryRef" in create.territory` →
`"O territoryRef é emitido pelo servidor e não pode ser declarado na criação."`

---

## 6. Sonda SQL — SOMENTE LEITURA

Um único `SELECT`. Sem `INSERT`, `UPDATE` ou `DELETE`.

```sql
SELECT
  id,
  marca_id,
  subject_type,
  subject_id,
  stage,
  state,
  source_entity_id,
  article_id,
  lock_version,
  payload ->> 'contractVersion'                AS contract_version,
  payload -> 'territory' ->> 'territoryRef'    AS payload_territory_ref,
  payload -> 'territory' ->> 'brandId'         AS payload_brand_id,
  payload -> 'territory' ->> 'lifecycleStatus' AS payload_lifecycle_status
FROM public.editorial_workflow_items
WHERE marca_id = '<BRAND_ID>'::uuid
  AND subject_type = 'territory'
  AND subject_id = '<TERRITORY_REF>';
```

Confirmar, na linha única devolvida:

- `subject_id = payload_territory_ref = source_entity_id = <TERRITORY_REF>`
- `marca_id = payload_brand_id = <BRAND_ID>`
- `state = payload_lifecycle_status = 'candidate'`
- `stage = 'architect'`, `subject_type = 'territory'`, `article_id IS NULL`
- `contract_version = 'territory-record-v1'`
- `lock_version = 2` depois do Smoke C

---

## 7. Cross-brand — Smoke F

Só se você tiver uma segunda Brand de teste. Autenticado como um ator **sem**
acesso à Brand A, com `<BRAND_ID>` da Brand A:

```js
await fetch(`/api/arquiteto/workspace?brandId=<BRAND_ID_A>`).then(r => r.status);
```

Esperado: `403`, `code = "NOT_AUTHORIZED"` — barrado em
`canonical_actor_can_access_brand`, antes de qualquer query. O mesmo vale para o
PATCH, com `action = "edit"`.

Se não houver segunda Brand adequada: **`CROSS_BRAND_REMOTE_SMOKE = NOT_EXECUTED`**.
Não marcar PASS por dedução.

---

## 8. O que este smoke NÃO cobre

- **`pendingOperation` parcial:** persistir um exigiria `appliedKeywordIds` /
  `failedKeywordIds` com ids de keyword. Inventá-los deixaria referências falsas
  gravadas. Fica para o smoke de integração, com keywords reais.
- Formação de ArticleDNA, consolidação de SiloDNA/SiloPage, InternalLinkGraph,
  Site/Sitemap, providers — todos fora de escopo.

## 9. Limpeza

O território de smoke fica `candidate` e não bloqueia nada: não tem keywords, não
entra em consolidação, e a leitura do Arquiteto o trata como candidato pendente.

Se quiser tirá-lo da lista, use o caminho de domínio quando existir
(`lifecycleStatus = "archived"` via `territoryUpdates`) — **não** por `DELETE`.
