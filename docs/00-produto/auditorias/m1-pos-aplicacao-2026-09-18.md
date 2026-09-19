# M1 — auditoria pós-aplicação

**Data:** 2026-09-18
**Migration aplicada pelo usuário:** `20260918190000_m1_workflow_stage_sem_planner.sql`
**Retorno do SQL Editor:** `Success. No rows returned`
**Esta rodada não alterou** banco, código, migrations, nem aplicou qualquer DDL.

> `Success. No rows returned` confirma que a execução não levantou erro. **Não é prova de que o schema ficou correto** — uma migration pode rodar sem erro e deixar a constraint errada, perder uma FK ou derrubar uma policy. O que segue é o readback do schema efetivo.

---

## 1. Readback do schema efetivo

Lido com `npx supabase db query --linked`, somente `SELECT`. `PERSISTENCIA_REMOTA`.

### 1.1 O CHECK de `stage`

```sql
editorial_workflow_items_stage_check
  CHECK ((stage = ANY (ARRAY['minerador'::text, 'architect'::text, 'radar'::text,
                             'writer'::text, 'publications'::text])))
```

`'planner'` **não aparece**. Os cinco valores aceitos correspondem ao fluxo vigente: Minerador → Arquiteto → Radar → Redator → Publicações.

### 1.2 Linhas

| Medida | Valor | Antes da M1 |
| --- | --- | --- |
| `stage = 'architect'` | 25 | 25 |
| `stage = 'radar'` | 3 | 3 |
| **TOTAL** | **28** | **28** |
| `stage = 'planner'` | **0** | 0 |
| `state = 'sent_planner'` | **0** | 0 |
| linhas incompatíveis com o novo CHECK | **0** | — |

Nenhuma linha foi criada, alterada ou apagada. Nenhum estado existente ficou incompatível.

### 1.3 Constraints — todas presentes

Além do CHECK alterado, a tabela mantém:

```
CHECK  editorial_workflow_items_lock_version_check       (lock_version > 0)
CHECK  editorial_workflow_items_payload_check            (jsonb_typeof(payload) = 'object')
CHECK  editorial_workflow_items_source_entity_id_check   (char_length(btrim(...)) > 0)
CHECK  editorial_workflow_items_state_check              (char_length entre 1 e 80)
CHECK  editorial_workflow_items_subject_id_check         (char_length(btrim(...)) > 0)
CHECK  editorial_workflow_items_subject_type_check       (char_length entre 1 e 80)
FK     editorial_workflow_items_created_by_fkey          → auth.users(id) RESTRICT
FK     editorial_workflow_items_marca_id_fkey            → marcas(id) RESTRICT
FK     editorial_workflow_items_source_version_id_fkey   → editorial_artifact_versions(version_id) RESTRICT
FK     editorial_workflow_items_updated_by_fkey          → auth.users(id) RESTRICT
PK     editorial_workflow_items_pkey                     (id)
UNIQUE editorial_workflow_items_subject_stage_unique     (marca_id, subject_type, subject_id, stage)
```

**`editorial_workflow_items_state_check` continua sendo só de comprimento** — é o que mantém `'sent_planner'` legível em linha antiga, como a M1 previa.

### 1.4 Triggers, RLS e grants — inalterados

```
TRIGGER  editorial_workflow_items_touch_trg → pipeline_editorial_touch_lock_version
RLS      habilitada
POLICY   editorial_workflow_items_select_policy | SELECT | {authenticated}
GRANT    authenticated → SELECT
GRANT    service_role  → SELECT, INSERT, UPDATE   (sem DELETE)
GRANT    postgres      → todos
```

Idêntico ao lido antes da M1. **Nada foi alterado involuntariamente.**

```text
STAGE_PLANNER_ACCEPTED = NO
EXISTING_STAGE_PLANNER_ROWS = 0
EXISTING_SENT_PLANNER_ROWS = 0
```

---

## 2. Prova de que o banco recusa `planner`

O readback mostra o texto da constraint. Ele não prova que ela **age**. A prova foi comportamental, reversível, e não deixou dado.

**Método:** um `DO` com dois `INSERT` sintéticos, cada um dentro de um bloco com `EXCEPTION` — o Postgres desfaz a subtransação sozinha quando o `INSERT` falha. Um `RAISE EXCEPTION` final aborta o comando inteiro, de modo que nem o caso de sucesso deixaria linha. UUIDs zerados; **nenhum artigo, marca ou usuário real foi lido, referenciado ou alterado**. Script em `scratchpad/m1-prova-check.sql`.

**Controle deliberado:** o segundo `INSERT` é idêntico, mas com `stage='radar'`. Sem ele, "recusado" não distinguiria o CHECK da FK — e a conclusão seria falsa por acidente.

**Resultado:**

```
VERDITO planner=RECUSADO_POR_CHECK  radar=CHECK_PASSOU_FK_BARROU
```

- `planner` → `check_violation`: **a constraint recusa**.
- `radar` → `foreign_key_violation`: o CHECK deixou passar e a barreira foi a FK. O controle confirma que quem recusou `planner` foi o CHECK, não outra coisa.

**Confirmação de que nada persistiu:**

```
total = 28   fixtures_residuais (subject_type='m1-audit') = 0   planner = 0
```

---

## 3. Suítes — comparadas ao baseline anterior à M1

| Suíte | Baseline pré-M1 | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** | 0 |
| `test:redator` | 28/28 | **28/28** | 0 |
| `test:editorial` | 60/64 — 4 falhas | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `tests/planejador-fora-do-pipeline.test.mts` | 16/16 | **16/16** | 0 |
| `tests/radar-to-writer-handoff-1.test.mts` (loader) | 26/26 | **26/26** | 0 |

As 4 falhas de `test:editorial` são pré-existentes — `rotas oficiais separam…`, `Minerador e Arquiteto incorporam seus DNAs…`, `layout Admin valida sessão…` e `Marca preserva compatibilidade…`. Foram medidas antes do Corte 1 e continuam idênticas. **Não foram corrigidas nesta tarefa**, conforme instruído.

```text
REGRESSION_FROM_M1 = NO
```

---

## 4. Auditoria do Corte 2 no código, após a M1

| Item | Resultado | Evidência |
| --- | --- | --- |
| `import_planner` inexistente como comando ativo | ✔ | 0 no contrato, 0 na rota |
| `prepare_plan` inexistente | ✔ | 0 no contrato, 0 na rota |
| `approve_plan` inexistente | ✔ | 0 no contrato, 0 na rota |
| `start_writing` inexistente | ✔ | 0 no contrato, 0 na rota |
| Nenhuma transição nova produz `sent_planner` | ✔ | resta só `sent_planner: ["approved"]` — a SAÍDA, que devolve item antigo ao fluxo. `approved: ["sent_writer","needs_review"]` não tem entrada |
| Nenhum `ContentDocument` v1 nasce por fluxo operacional | ✔ | as quatro ocorrências de `schemaVersion: 1` no contexto são de `LocalWorkflowRecoverySchema`, o envelope do `localStorage`; as demais são ArticleDNA/SiloDNA/SiloPage, artefatos de outros módulos |
| Nenhum `ContentPlan` ou `PlannerItem` criado pelo pipeline | ✔ | `createOperationalPlan`, `createOperationalDocument`, `createPublicationDraft`, `createDefinitiveContentPlan` e `simulatePlanAndDocument` só aparecem em **comentários** que explicam a remoção |
| `sendRadarToWriter` continua a autoridade Radar → Redator | ✔ | chamada por `radar-writer-send.ts` e pela rota `radar-writer-handoff`; nenhum outro caminho grava documento |
| "Importar do Radar" usa a mesma autoridade | ✔ | `professional-writer.tsx` usa `postRadarWriterHandoffBatch`, o mesmo cliente de `radar-page.tsx` e `radar-analysis-page.tsx` |
| `sendWriterToPublications` sem `PlannerItem`/`ContentPlan` | ✔ | 0 ocorrências de PlannerItem; as 2 de ContentPlan são um comentário e a mensagem de recusa de documento v1 |
| `documentId` obrigatório no contrato novo | ✔ | `z.string().trim().min(1).max(512)` na rota; `z.string().min(1)` em `OperationalPublicationSchema` |

```text
CODE_FLOW_WITHOUT_PLANNER = PASS
```

---

## 5. Legado — confirmado inerte, não removido

Conforme instruído, nada foi removido ou renomeado. O que foi verificado é que **nenhum deles escreve ou controla o fluxo**:

| Item | Escreve? | Controla fluxo? | Evidência |
| --- | --- | --- | --- |
| `lib/server/radar-planner-send.ts` | não | não | `sendRadarToPlanner` não é chamada por nenhuma rota, tela ou componente |
| `lib/radar/planner-handoff.ts` | não pelo Planejador | não | importado por 5 arquivos de produção **do Radar**, incluindo o `radar-writer-send.ts` novo. É motor do Radar com nome herdado |
| `contentPlanRef`, `contentPlanVersionId`, `plannerItemId` | não | não | nulos/ausentes em registro novo; existem para leitura de linha antiga |
| `sent_planner` no enum | não | não | sem transição de entrada; só a saída para `approved` |
| `lib/planejador/**`, `modules/planejador/**` | não | não | telas somente leitura; `contentPlanApprovalIssues` importada direto do módulo dono, para validar e exibir |

---

## 6. Um achado, não bloqueante

**Comentário órfão em `components/editorial-pipeline-context.tsx`, linhas ~258-278.**

O bloco de documentação que ficava acima de `preparePlannerItems` sobreviveu à remoção do método. Ele descreve uma capacidade que não existe mais e termina apontando para uma rota **que foi apagada**:

> "A fronteira inteira passa por `POST /api/editorial/radar-planner-handoff`, que grava o dossiê, relê, transiciona e relê o destino."

`app/api/editorial/radar-planner-handoff/route.ts` está marcado como `D` no git e não existe no disco.

Não afeta comportamento — é comentário. Mas ensina o caminho errado a quem ler, que é exatamente o que a disciplina de comentários deste repositório existe para evitar. **Não corrigido nesta rodada**, porque a tarefa proíbe alterar código. Fica registrado para o próximo corte que tocar o arquivo.

---

## 7. Resultado

```text
M1_DDL_APPLIED = YES
M1_SCHEMA_READBACK = PASS
PLANNER_STAGE_ACCEPTED = NO
PLANNER_ROWS = 0
SENT_PLANNER_ROWS = 0
CODE_FLOW_WITHOUT_PLANNER = PASS
TSC = PASS
TEST_REDATOR = 28/28 PASS
TEST_EDITORIAL = 60/64 PASS (4 falhas pré-existentes, idênticas ao baseline)
TEST_RADAR = 2236/2236 PASS
PLANEJADOR_FORA_DO_PIPELINE = 16/16 PASS
REGRESSION_FROM_M1 = NO
M1_VERIFIED = YES
M2_APPLIED = NO
M3_APPLIED = NO
```

---

## 8. O que continua valendo para M2 e M3

Nenhuma das duas foi aplicada, e nenhuma deve ser antes do código que as usa.

**M2** (`20260918190100_m2_writer_version_lifecycle.sql`) só depois de existir e estar auditado o código que mantém `current_version_id` em `writer_save_deliverable` e o serviço que marca substituição após readback.

**M3** (`20260918190200_m3_writer_media_anchor_lifecycle.sql`) só depois de o fluxo de mídia respeitar a ordem:

```
registrar sucessor SEM anchor → upload → hash → readback
→ substituição atômica → transferência do anchor
```

O sucessor precisa nascer sem âncora: o índice único parcial da M3 rejeita um segundo ativo com arquivo na mesma âncora.

Purge, scheduler e alterações de mídia continuam **não implementados**. Sem `pg_cron`, nada é apagado enquanto não existir uma rota que chame a purga — e esse é o estado seguro.
