# Auditoria estrutural — remoção do Planejador do pipeline

**Revisão 2 — 2026-09-18.** Substitui a revisão 1 do mesmo dia.
**Escopo:** código + schema real. Mapa exato da remoção, antes de qualquer migration.
**Nada foi alterado:** nenhum código, migration, dado, UI, deploy, commit ou purge.
**Leitura do banco:** somente leitura, projeto `hjjlntdpdgvpnazdztqw`.

## O que mudou da revisão 1 para a 2

1. **Política de retenção corrigida.** Idade não apaga nada. `purge_after` só nasce depois de sucessor persistido **e** relido. §7 foi reescrita inteira.
2. **Fronteira de propriedade corrigida.** DNA, evidência do Radar, snapshots estruturais, trilhas e eventos MCP não estão "fora da regra por exceção" — estão **fora desta reforma**, sob a política do módulo dono. §7.1.
3. **Numeração corrigida.** Nenhuma etapa de "aprovação/handoff" foi inventada. §8.
4. **Preflight executado** até o limite da API. §2.4 traz nulabilidade, FKs e grants efetivos lidos do banco; §2.5 diz o que continua fechado e por quê.
5. **Máquina de estado e estruturas substituíveis do Redator** auditadas e especificadas. §11 e §12.

---

## 1. Estado de planejamento

```text
PLANEJADOR_NO_PIPELINE = NO
RADAR_TO_REDACTOR_DIRECT = REQUIRED          ← implementado e verde
REDACTOR_IMPORT_FROM_RADAR = REQUIRED        ← não existe; gatilho novo da MESMA autoridade (§5)
REDACTOR_TO_PUBLICACOES_DIRECT = REQUIRED    ← não existe; é o bloqueio real

CONTENTPLAN_REQUIRED_NEW_FLOW = NO
PLANNERITEM_REQUIRED_NEW_FLOW = NO

PLANEJADOR_STAGE = NONE
REDACTOR_STAGE = 6
PUBLICACOES_STAGE = 7
CONTA_STAGE = 8

EDITORIAL_HISTORY_PERMANENT = NO
EDITORIAL_HISTORY_MAX_RETENTION = 48H        ← só após substituição confirmada (§7)
OLD_MEDIA_MAX_RETENTION = 48H                ← só após vínculo assumido pelo sucessor (§12)

MIGRATION_NECESSARIA = SIM, 3 ADITIVAS       ← desenho em §9; autorização depende de §2.5
MCP_REMOTO_HOMOLOGADO = NO                   ← BLOQUEADO (OAuth Server desativado)
```

---

## 2. Schema real

### 2.1 O Planejador não tem dados nem tabelas

| Fato | Valor real |
| --- | --- |
| Tabelas `content_plans` / `planner_items` | **não existem** |
| `editorial_artifact_versions` com `artifact_type='content_plan'` | **0** de 531 linhas |
| `editorial_workflow_items` com `stage='planner'` | **0** de 28 |
| `state='sent_planner'` | **0** |
| `publication_records` | **0** linhas |

Distribuição real de `editorial_workflow_items`: 25 `architect`, 2 `radar/research_pending`, 1 `radar/sent_writer`.

**Conclusão mantida e agora instruída: não haverá migração de dados de ContentPlan/PlannerItem.** A auditoria trata apenas de código, contratos, constraints, estados, navegação e documentação — o necessário para **impedir novas escritas pelo caminho antigo**.

### 2.2 Volume atual das tabelas do corte

`content_documents` 1 · `content_document_versions` **0** · `publication_records` **0** · `writer_deliverables` **0** · `writer_deliverable_versions` **0** · `writer_media_assets` **0** · `writer_mcp_delegations` 1 (revogada) · `writer_mcp_call_events` 6 · `storage/writer-media` 0 objetos.

A política de retenção nasce sobre tabela vazia. Nenhuma linha existente entra em janela de purge.

### 2.3 Qual migration prevaleceu

Comparando o schema efetivo com os arquivos:

- `content_documents` e `content_document_versions` → **`0028` prevaleceu sobre `0002`**. As colunas efetivas batem coluna a coluna com a `0028`, inclusive as três nuláveis.
- `editorial_workflow_items` → **`0027` prevaleceu sobre `0002`**. O schema efetivo tem `subject_type`, `subject_id` e `source_entity_id`, que só existem na `0027`. Logo o CHECK de `stage` em vigor é o da `0027`:
  `stage IN ('minerador','architect','radar','planner','writer','publications')`.

### 2.4 Preflight — o que consegui ler do banco

`PERSISTENCIA_REMOTA`, lido hoje.

**Nulabilidade efetiva** (`required` do OpenAPI do PostgREST = `NOT NULL`; ausência = nulável — conferido contra a `0028`, que bate coluna a coluna):

| Tabela | Nuláveis |
| --- | --- |
| `content_documents` | `article_dna_version_id`, **`content_plan_version_id`**, `current_version_id` |
| `publication_records` | **`content_plan_version_id`**, **`document_id`**, `published_url`, `canonical` |
| `editorial_workflow_items` | `article_id`, `source_version_id`, `source_content_hash` |
| `content_document_versions` | `previous_version_id` |
| `writer_deliverable_versions` | `previous_version_id` |
| `writer_media_assets` | `deliverable_id`, `storage_path`, `mime_type`, `file_hash` |
| `writer_deliverables` | nenhuma |

→ **Confirmado: nada no banco exige ContentPlan.** O bloqueio é inteiramente de código.
→ Observação nova: `publication_records.document_id` **é nulável**. Um registro de publicação sem documento é aceito pelo banco; a invariante que impede isso terá de ser de contrato.

**Foreign keys efetivas** (só as de coluna única; FK composta não é anotada pelo PostgREST):

```
content_documents.article_dna_version_id   -> editorial_artifact_versions.version_id
content_documents.content_plan_version_id  -> editorial_artifact_versions.version_id
content_documents.current_version_id       -> content_document_versions.version_id   ← relevante ao purge
content_document_versions.document_id      -> content_documents.id
content_document_versions.previous_version_id -> content_document_versions.version_id ← relevante ao purge
writer_deliverable_versions.deliverable_id -> writer_deliverables.id
writer_deliverable_versions.previous_version_id -> writer_deliverable_versions.version_id ← relevante ao purge
publication_records.content_plan_version_id -> editorial_artifact_versions.version_id
publication_records.document_id            -> content_documents.id
writer_mcp_call_events.delegation_id       -> writer_mcp_delegations.id
```

Apontam para `editorial_artifact_versions` (DNA), além dessas: `editorial_serp_reviews`, `editorial_serp_snapshots`, `editorial_decision_events`, `editorial_version_status_events`, `editorial_workflow_items`, `internal_link_graphs`, `internal_link_graph_nodes`. **Sete tabelas de módulos anteriores dependem do DNA por FK** — o que confirma, do lado do banco, que `editorial_artifact_versions` não pertence a esta reforma (§7.1).

**Grants efetivos por papel na API:**

| Papel | Tabelas visíveis | RPC visíveis |
| --- | --- | --- |
| `service_role` | 144 | 71, incluindo `writer_save_article_draft` e `writer_save_deliverable` |
| `anon` | **0** | **0** |

→ `anon` não enxerga nada em `public`. Confirma a `0002:390` (`REVOKE ALL ... FROM anon`) e a `20260918050959:101-105`.
→ Precedente de purga já existe e é visível: `rpc/lifecycle_purge_minerador_keywords`, `lifecycle_delete_minerador_keywords`, `lifecycle_restore_minerador_keywords`, `lifecycle_preview_minerador_keywords`.

### 2.5 Preflight — COMPLETO em 2026-09-18

> **Correção.** As revisões anteriores declararam este bloco "fechado" porque `npx supabase inspect db` só tem subcomandos fixos. **`query` é subcomando de `supabase db`, não de `supabase inspect db`** — e `npx supabase db query --linked "<sql>"` executa SQL arbitrário no remoto pela Management API, **sem Docker e sem senha**. O gate não existia. Chequei o `--help` do grupo errado.

Tudo abaixo foi lido por mim no banco real. `PERSISTENCIA_REMOTA`.

**CHECK de `stage` (bloco [2])** — confirmado como o da `0027`:

```sql
editorial_workflow_items_stage_check
  CHECK (stage = ANY (ARRAY['minerador','architect','radar','planner','writer','publications']))
```

**Triggers append-only (bloco [3])** — as três são `BEFORE DELETE OR UPDATE`:

```
content_document_versions_append_only_trg    → pipeline_editorial_protect_append_only
writer_deliverable_versions_append_only_trg  → pipeline_editorial_protect_append_only
editorial_artifact_versions_append_only_trg  → pipeline_editorial_protect_append_only
```

**Corpo da função (bloco [3b])** — incondicional, sem nenhuma exceção:

```sql
BEGIN
  RAISE EXCEPTION 'append-only editorial record cannot be changed';
END;
```

Ela não olha `TG_OP`, não olha coluna e não olha linha. **Qualquer** UPDATE ou DELETE nessas três tabelas é recusado. A M2 precisa reescrevê-la para liberar exatamente dois casos — `DELETE` de linha com `purge_after <= now()` e `UPDATE` restrito aos campos de retenção — mantendo o resto bloqueado.

**FKs relevantes ao purge (bloco [4], nível efetivo):**

```
content_documents.current_version_id            -> content_document_versions   [RESTRICT]
content_document_versions.previous_version_id   -> content_document_versions   [RESTRICT]
writer_deliverable_versions.previous_version_id -> writer_deliverable_versions [RESTRICT]
```

**RLS** — as seis tabelas do corte têm **apenas política de `SELECT` para `authenticated`**. Não há política de INSERT, UPDATE ou DELETE: escrita só pelo `service_role`, que ignora RLS. Nenhuma política precisa mudar.

**`pg_cron` (bloco [5]) — NÃO está instalado.** `pg_net` também não. **O purge não pode ser agendado no banco**; ele terá de ser disparado por rota server-side. Este é o único achado do preflight que muda o desenho da M2 e da M3.

Os arquivos de migration, cruzados com o schema efetivo da §2.3, previam corretamente os quatro primeiros itens:

| Item | Origem | Consequência |
| --- | --- | --- |
| `content_document_versions_append_only_trg` `BEFORE UPDATE OR DELETE` | `0028:90-92` | **bloqueia o DELETE do purge** |
| `writer_deliverable_versions_append_only_trg` `BEFORE UPDATE OR DELETE` | `20260918050959:82-83` | idem |
| `content_documents.current_version_id` FK `ON DELETE RESTRICT` | `0028:43-47` | impede purgar a versão corrente |
| `content_document_versions.previous_version_id` FK `ON DELETE RESTRICT` | `0028:33` | impede purgar elo da cadeia |
| `writer_deliverable_versions.previous_version_id` FK `ON DELETE RESTRICT` | `20260918050959:35` | idem |
| CHECK de `stage` com `'planner'` | `0027:36-38` | alvo da M1 |
| `pg_cron` | previsão impossível pelo arquivo | **e a leitura mostrou que NÃO existe** |

**Três RESTRICT e três triggers append-only estão exatamente no caminho do purge, e `pg_cron` não existe.** Isso não invalida o desenho da §9 — é o que o desenho tem de resolver, agora com o texto efetivo em mãos.

O script `supabase/scripts/2026-09-18-remocao-planejador-preflight-read-only.sql` continua válido como auditoria reexecutável: ele reúne os sete blocos num arquivo, e pode ser rodado de uma vez com

```bash
npx supabase db query --linked -f supabase/scripts/2026-09-18-remocao-planejador-preflight-read-only.sql
```

**Nenhum bloco do preflight continua pendente.** M1, M2 e M3 deixam de estar bloqueadas por leitura de catálogo; o que falta para escrevê-las é **aprovação de DDL**, que é decisão sua e não medição minha.

---

## 3. Inventário classificado

Taxonomia: **REMOVER · MIGRAR · LEGADO TEMPORÁRIO · MANTER FORA DO PIPELINE · BANCO/CONSTRAINT · TESTE ANTIGO · DOCUMENTAÇÃO**.

O objetivo de cada classificação é **impedir nova escrita pelo caminho antigo**, não apagar o passado.

### 3.1 `ContentPlan`

| Onde | Classe | Ação |
| --- | --- | --- |
| `lib/planejador/*` (8 arquivos) e `modules/planejador/*` | **MANTER FORA DO PIPELINE** | sai do fluxo, fica disponível para a futura aba da Marca. Não apagar. |
| `lib/editorial/operational-flow.ts:9` | **REMOVER** | acoplamento 1 de 4 |
| `lib/editorial/providers.ts:71` — mock de plano | **REMOVER** | criação simulada, sem lugar no fluxo novo |
| `lib/editorial/persistence-contracts.ts:111-113` | **REMOVER** | `prepare_plan`, `approve_plan`, `start_writing` saem do contrato |
| `lib/arquiteto/contracts.ts` — v1 com `contentPlanRef` | **LEGADO TEMPORÁRIO** | **arquivo do Arquiteto; não tocar.** v2 já recusa a chave |
| `lib/redator/contracts.ts`, `prompts.ts` | **LEGADO TEMPORÁRIO** | `documentContentPlanRef()` já devolve `null` em v2 |
| `lib/radar/planner-handoff.ts` e correlatos do Radar | **MANTER FORA DO PIPELINE** | §6 |
| `tests/planejador-*.test.mts` (5) | **TESTE ANTIGO** | verdes enquanto o módulo existir fora do pipeline |
| 74 arquivos em `docs/` | **DOCUMENTAÇÃO** | §10 |

### 3.2 `PlannerItem` / `plannerItemId`

| Onde | Classe |
| --- | --- |
| `operational-flow.ts:92` `PlannerItemSchema`, `:326` `createOperationalPlan`, `:349` `createPublicationDraft` | **REMOVER** |
| `operational-flow.ts:106` `plannerItemId` em `OperationalPublicationSchema` | **LEGADO TEMPORÁRIO** — já `.nullable().default(null)`; manter para leitura |
| `editorial-pipeline-context.tsx` — `savePlannerPlan`, `approvePlannerItems`, `startWriting` | **REMOVER** |
| `app/api/editorial/workflow/route.ts:93,99,106` + permissões `planejador:edit|approve` | **REMOVER** |
| `lib/server/radar-planner-send.ts` | **MANTER FORA DO PIPELINE** — §6 |
| `lib/server/pipeline-repositories.ts:259-484` | **LEGADO TEMPORÁRIO** — já opcional |

### 3.3 `contentPlanVersionId` / `contentPlanRef`

| Onde | Classe |
| --- | --- |
| `operational-flow.ts:136` invariante "plano OU Radar" | **MIGRAR** — Radar como origem única do fluxo novo; registro antigo continua válido |
| `editorial-repositories.ts:472,490` | **MIGRAR** — grava `null` no caminho novo; **coluna fica** |
| `workflow/route.ts:95,101,109` | **REMOVER** |
| `lib/arquiteto/contracts.ts:1740,1855,1869` | **LEGADO TEMPORÁRIO** — não tocar |

### 3.4 `start_writing`

`workflow/route.ts:106,114` · `editorial-pipeline-context.tsx:1210` · `persistence-contracts.ts:113` → **REMOVER**.
É a única porta por onde `publication_records` nasce hoje, e ela exige plano aprovado no Planejador.

### 3.5 `sent_planner`

| Onde | Classe |
| --- | --- |
| `operational-flow.ts:27` valor no enum | **LEGADO TEMPORÁRIO** — fica, para ler linha antiga |
| `operational-flow.ts:306,307` transições | **REMOVER** — a transição some; o valor permanece legível |
| `workflow/route.ts:16,90` `allowedRadar` e `import_planner` | **REMOVER** |
| `components/editorial/workflow-status.tsx:34` rótulo | **LEGADO TEMPORÁRIO** |

### 3.6 `Importar do Planejador`

`professional-writer.tsx:92` `importFromPlanner`, `:199` botão, `:206` diálogo → **REMOVER**. É o lugar exato onde entra "Importar do Radar" (§5).

### 3.7 `publication_records`

| Onde | Classe |
| --- | --- |
| `editorial-repositories.ts:466-520` `PublicationRepository` | **MIGRAR** — ganha criação a partir do Redator, sem plano nem item |
| coluna `content_plan_version_id` | **BANCO/CONSTRAINT** — **manter**, já nulável (§2.4) |
| 24 scripts em `supabase/scripts/` | **DOCUMENTAÇÃO** — auditoria somente-leitura |

### 3.8 Tabelas de versão e mídia

`content_document_versions`, `writer_deliverable_versions`, `writer_media_assets` → **BANCO/CONSTRAINT**, tratadas em §11 e §12.

### 3.9 Testes que leem código como texto

`tests/operational-flow.test.mts:17-19` e `tests/planner-global-topbar.test.mts:6` leem arquivos do Planejador; `radar-final-1/2/11`, `radar-canonical-dossier-parity-1`, `radar-portable-export-1`, `radar-to-writer-handoff-1:721` leem `radar-planner-send.ts`.
**TESTE ANTIGO.** São o motivo de **apagar arquivos do Planejador quebrar a suíte do Radar**. Congelar mantém verde; apagar exige reescrever teste do Radar, fora do corte.

---

## 4. Os quatro acoplamentos de produção

Fora do próprio Planejador e dos testes, ele entra no produto por quatro linhas:

```
components/editorial-pipeline-context.tsx:15  createContentPlanSuccessor
components/editorial-pipeline-context.tsx:16  resolvePlannerPublicationIdentity,
                                              publicationSourceIssues,
                                              publishedIdentityReferenceIssues
components/editorial-pipeline-context.tsx:17  hasMaterialPlanChange
lib/editorial/operational-flow.ts:9           contentPlanApprovalIssues,
                                              createDefinitiveContentPlan
```

Três saem com as funções que os usam. O quarto atravessa: `lib/planejador/publication-identity.ts` resolve slug, canonical e identidade publicada — isso é identidade de publicação, não planejamento, e o caminho novo vai precisar dela.
**MIGRAR** para `lib/publicacoes/publication-identity.ts`. É o único arquivo do Planejador que sobrevive ao corte.

---

## 5. Handoff — autoridade única, dois gatilhos

**Decisão registrada:** `sendRadarToWriter` continua sendo a **única autoridade** de handoff. A invariante muda de *"porta única"* para *"autoridade única, gatilho em qualquer ponta"*.

Dois gatilhos:
1. ação "Enviar ao Redator" no Radar (R3, R4 e página de análise) — já existe;
2. botão "Importar do Radar" no Redator — **novo**.

O botão do Redator **apenas lista elegíveis e chama o serviço existente**. Ele não valida, não aprova, não monta documento e não tem caminho próprio de escrita:

- lista: artigos da marca com `state = 'approved'` no estágio `radar`;
- ação: chama `sendRadarToWriter` com o mesmo `articleId`;
- ordem preservada: `validar → resolver dossiê canônico → prontidão → revalidar identidade → integridade do pacote → criar documento → reler destino → mover esteira`;
- idempotência: já garantida por `radarDocumentId` determinístico, que devolve `ALREADY_IMPORTED` em vez de duplicar.

**Texto novo da invariante**, para substituir o atual em `docs/00-produto/invariantes.md`:

> A transferência Radar → Redator tem **autoridade única**: `sendRadarToWriter`. Ela pode ser **disparada de duas pontas** — pela ação no Radar e pelo botão "Importar do Radar" no Redator. O gatilho do Redator não constitui segunda autoridade: ele lista elegíveis e chama o mesmo serviço, sem validação, aprovação ou escrita próprias. Não existe segunda aprovação entre Radar e Redator.

---

## 6. O que não pode ser apagado

`lib/radar/planner-handoff.ts` tem nome de Planejador e é **motor do Radar**. Importadores em produção:

```
lib/radar/operational-view.ts:33        radarPlannerHandoffReadiness
lib/radar/report-approval.ts:40         buildRadarPlannerHandoff, isRadarPlannerHandoff
lib/server/radar-canonical-dossier.ts   readiness + RadarPlannerArticleFoundation
lib/server/radar-writer-send.ts:43      RadarPlannerHandoffReadiness  ← o fluxo NOVO depende dele
modules/radar/radar-analysis-page.tsx   isRadarPlannerHandoff
```

Apagar ou renomear **tocaria Radar** — proibido no corte — e quebraria 10 testes que o leem por caminho literal. **MANTER FORA DO PIPELINE, sem renomear nesta rodada.** Mesma classe e mesma razão para `lib/server/radar-planner-send.ts`, lido como texto por 6 testes do Radar que provam que ele não é mais o caminho.

---

## 7. Política de retenção — corrigida

### 7.1 Escopo: o que esta reforma alcança

**Alcança** — apenas artefatos do processo novo, do Redator:

- versões substituíveis de **artigo**;
- versões substituíveis de **roteiro**;
- versões substituíveis de **carrossel**;
- **mídia** substituída.

**Não alcança, e não é exceção — é propriedade de outro módulo:** ArticleDNA, KeywordDNA, SiloDNA, SiloPage, InternalLinkGraph, evidências e snapshots do Radar, trilhas de auditoria, eventos MCP e qualquer outro artefato de módulo anterior. Esses seguem a política do módulo dono e ficam **fora desta reforma**, salvo dependência técnica comprovada e autorização posterior.

A §2.4 mostra o lastro técnico dessa fronteira: **sete tabelas de módulos anteriores dependem de `editorial_artifact_versions` por FK**. Ela não é histórico editorial; é base de validação de terceiros.

Tabelas explicitamente fora: `editorial_artifact_versions`, `editorial_serp_snapshots`, `editorial_serp_reviews`, `editorial_decision_events`, `editorial_version_status_events`, `writer_mcp_call_events`, `minerador_discovery_candidate_metric_history`, `internal_link_graph_*`.

### 7.2 A regra

> **Idade não apaga nada.** A retenção máxima de 48h aplica-se **somente** a artefato do processo novo que tenha sido **explicitamente substituído** por um sucessor **válido, salvo e confirmado por readback remoto**. **Antes da substituição confirmada não existe `purge_after`.**

Três consequências de desenho que seguem disso:

1. `purge_after` é **derivado de `superseded_at`**, nunca de `created_at`. Não existe purga por antiguidade.
2. Se o readback falhar, ou se o processo morrer entre a gravação e a confirmação, **nada é marcado** — o predecessor permanece indefinidamente. A regra é *fail-safe por construção*: o modo de falha é guardar demais, nunca apagar.
3. Marcar substituição é **um ato próprio**, separado da gravação. Não pode acontecer dentro da mesma transação que grava o sucessor, porque o readback só existe depois do commit.

### 7.3 Reusar o padrão que já existe

`supabase/migrations/0047_global_lifecycle_delete_recovery_purge.sql` já implementa esta forma para as keywords do Minerador: `deleted_at` + `purge_after = deleted_at + interval '24 hours'` + CHECK pareado + índice parcial + `lifecycle_purge_*`. As RPCs estão visíveis na API (§2.4).

A retenção editorial deve ser **a mesma forma**, com `superseded_at` + `purge_after = superseded_at + interval '48 hours'`. Duas linguagens de retenção no mesmo banco seria dívida nova.

---

## 8. Árvore e numeração

`lib/editorial/navigation.ts:18` já exclui o Planejador de `PRODUCT_FLOW`. Falta: `planejador` ainda está em `ProductModule` (linha 3), em `PRODUCT_MODULES` (linha 7 — **por isso ainda aparece no menu**), em `LEGACY_REDIRECTS` (linha 21) e em `derivePipelineStates` (linha 27, fixo em `"blocked"`).

**Nenhuma etapa foi inventada.** Os números são **identificadores de estágio declarados**, não índices de posição em array:

```ts
MODULE_STAGE: Record<ProductModule, number | null> = {
  marca: 1, minerador: 2, arquiteto: 3, radar: 4,
  redator: 6, publicacoes: 7, conta: 8,
  planejador: null,   // PLANEJADOR_STAGE = NONE
  admin: null,
}
```

O número 6 é o identificador do Redator, não a sexta posição de uma lista. **A posição 5 fica declarada e não atribuída** — nenhum módulo a ocupa e nenhuma etapa foi criada para preenchê-la. Implementar como mapa evita que qualquer leitor derive uma etapa inexistente a partir de um índice.

`PRODUCT_FLOW` passa a `["marca","minerador","arquiteto","radar","redator","publicacoes","conta"]`, e `planejador` sai de `PRODUCT_MODULES` — a rota `/planejador` continua respondendo por link direto, como arquivo histórico, mas some da navegação.

---

## 9. Migrations

`MIGRATION_NECESSARIA = SIM, 3 ADITIVAS.` Nenhuma destrutiva. Nenhuma toca dado existente. Nenhuma migra ContentPlan ou PlannerItem — não há o que migrar (§2.1).

> **Renumeração vigente desde 2026-09-18:** M1 = corte do `stage`, M2 = retenção de histórico editorial, M3 = âncora e substituição de mídia.

**M1 — `stage` sem `planner`** (fecha a remoção lógica no banco)
CHECK da `0027` passa a `('minerador','architect','radar','writer','publications')` e `editorial_stage_module()` deixa de mapear `planner → planejador`. Com **0 linhas** em `stage='planner'`, não há dado a converter. É a única que toca constraint usada pela policy `workflow_write`, então vai sozinha.

**M2 — retenção de histórico editorial**
`content_document_versions` e `writer_deliverable_versions` recebem `superseded_at`, `purge_after`, `superseded_by_version_id`, CHECK pareado e índice parcial. `writer_deliverables` recebe `current_version_id` explícito com FK — hoje a coluna não existe e a corrente seria deduzida por `max(version_number)`, o que é frágil justamente na operação que apaga as outras. `pipeline_editorial_protect_append_only` passa a permitir `DELETE` de linha com `purge_after <= now()`, continuando a bloquear todo o resto. Os dois FKs `previous_version_id ... ON DELETE RESTRICT` passam a `ON DELETE SET NULL`; `content_documents.current_version_id` **permanece** RESTRICT. Funções `writer_mark_superseded()` e `lifecycle_purge_editorial_history()`.

**M3 — âncora e substituição de mídia**
`writer_media_assets` recebe `anchor_kind`, `anchor_ref`, `replaced_by_asset_id`, `superseded_at`, `purge_after`. Substituição significa **sucessor confirmado no mesmo anchor**. Função `writer_replace_media_asset()` (transfere vínculo e só então marca o predecessor) e `lifecycle_purge_writer_media()` (idempotente, objeto antes da linha).

**Nenhuma delas pode ser escrita antes dos blocos [2], [2b], [3], [3b] e [5] do preflight** (§2.5). São eles que dizem o texto exato dos CHECK, das triggers e das políticas que a M1 e a M2 precisam alterar sem reescrever o que não é delas. **Nenhuma migration é executada no corte de remoção lógica.**

---

## 10. Documentação a atualizar

| Documento | Mudança |
| --- | --- |
| `docs/00-produto/fluxo-oficial.md` | árvore com estágios declarados; Planejador vira nota histórica |
| `docs/00-produto/invariantes.md` | §47-49 reescritas; invariante do handoff conforme §5; nova invariante de retenção conforme §7.2 |
| `docs/00-produto/pipeline-editorial-papeis-handoffs.md` | remove Radar→Planejador e Planejador→Redator; acrescenta Redator→Publicações direto |
| `docs/00-produto/glossario.md` | ContentPlan e PlannerItem como legado sem linha no banco |
| `docs/07-redator/spec.md` | "Importar do Radar"; retenção 48h; estados de substituição |
| `docs/07-redator/estado-atual.md` | evidências desta revisão |
| `docs/07-redator/backlog.md` | ordem: Publicações direto → retenção → Agência/MCP → produção |
| `docs/06-planejador/*` | cabeçalho declarando saída do pipeline e destino futuro como aba da Marca |
| SDD | `docs/00-produto/propostas/sdd-remocao-planejador-e-retencao-48h-2026-09-18.md` |

---

## 11. Estruturas substituíveis do Redator e máquina de estado

### 11.1 O que é substituível, tabela por tabela

| Artefato | Estado corrente | Versões substituíveis | Ponteiro de "qual é a corrente" |
| --- | --- | --- | --- |
| **Artigo** | `content_documents.payload` | `content_document_versions` | `content_documents.current_version_id` ✔ |
| **Roteiro** | `writer_deliverables.payload` (`kind='video_script'`) | `writer_deliverable_versions` | **não existe** ✘ |
| **Carrossel** | `writer_deliverables.payload` (`kind='carousel'`) | `writer_deliverable_versions` | **não existe** ✘ |
| **Mídia** | `writer_media_assets` com `status='uploaded'` | a própria linha, quando substituída | **não existe** ✘ |

**Assimetria encontrada.** `content_documents` tem `current_version_id` com FK; `writer_deliverables` **não tem coluna equivalente** — a versão corrente é implícita, deduzida por `max(version_number)`. Deduzir a corrente é frágil justamente na operação que apaga as outras: uma leitura errada apagaria a versão viva.

→ **M1 acrescenta `current_version_id` a `writer_deliverables`**, com FK, espelhando `content_documents`. Aditivo, nulável, preenchido pela própria `writer_save_deliverable` na mesma transação que já cria a versão.

Fora do banco: o rascunho de recuperação em `localStorage` (`lib/editorial/local-recovery.ts`) não é versão e não entra nesta política — ele já distingue `remoteConfirmed` e não é fonte canônica.

### 11.2 Máquina de estado mínima

Quatro estados, **derivados de duas colunas** — não um enum paralelo que possa divergir da realidade:

```
                          sucessor persistido
                        + readback confirmado
   ┌─────────┐        ┌──────────────────────┐        ┌──────────────────┐        ┌────────────────┐
   │ current │ ─────► │      superseded      │ ─────► │ recoverable_until│ ─────► │ purge_eligible │
   └─────────┘        └──────────────────────┘        └──────────────────┘        └────────────────┘
   superseded_at        superseded_at = now()          now() < purge_after         now() >= purge_after
   IS NULL              purge_after =                  (restaurável)                (elegível ao purge)
   purge_after          superseded_at + 48h
   IS NULL
```

| Estado | Condição | Pode ser apagado? |
| --- | --- | --- |
| `current` | `superseded_at IS NULL` | **não, nunca** |
| `superseded` | `superseded_at IS NOT NULL` | não |
| `recoverable_until` | `purge_after > now()` | não |
| `purge_eligible` | `purge_after <= now()` | sim |

`superseded` e `recoverable_until` são o mesmo instante visto de dois ângulos: a marcação e a janela que ela abre. Modelei assim de propósito — um estado a mais seria estado a mais para dessincronizar.

**CHECK que sustenta a invariante:**

```sql
CHECK ( (superseded_at IS NULL AND purge_after IS NULL AND superseded_by_version_id IS NULL)
     OR (superseded_at IS NOT NULL AND superseded_by_version_id IS NOT NULL
         AND purge_after = superseded_at + interval '48 hours') )
```

O banco passa a recusar `purge_after` sem substituição declarada. A regra "antes da substituição não existe `purge_after`" deixa de depender de disciplina do código.

### 11.3 Onde `superseded` nasce — e por que não pode ser antes

A gravação atual já é atômica e já faz readback:

```
TX1  writer_save_article_draft / writer_save_deliverable
     → grava estado corrente + versão imutável, sob lock, na mesma transação
COMMIT
     readback: relê remoto e compara content_hash, lock_version,
               current_version_id e canonicalJson(blocks)
TX2  writer_mark_superseded(...)   ← NOVO, só roda se o readback bateu
```

`writer_mark_superseded` recebe o par `(predecessor, sucessor)` e:
1. recusa se o sucessor não existir, não pertencer ao mesmo documento/entregável ou não for a versão corrente;
2. recusa se o predecessor já for a corrente;
3. grava `superseded_at`, `purge_after` e `superseded_by_version_id`;
4. **é idempotente**: repetir com o mesmo par devolve o estado existente sem mover `purge_after` — repetir uma chamada não pode encurtar a janela de ninguém.

Se a TX2 nunca rodar, o predecessor fica sem `purge_after` e **nunca é apagado**. É o comportamento correto sob falha.

### 11.4 Os três RESTRICT e as duas triggers

Do §2.5, no caminho do purge:

| Obstáculo | Tratamento na M1 |
| --- | --- |
| `content_documents.current_version_id` FK RESTRICT | **manter** — é a garantia de que a corrente nunca é apagada |
| `content_document_versions.previous_version_id` FK RESTRICT | → `ON DELETE SET NULL` |
| `writer_deliverable_versions.previous_version_id` FK RESTRICT | → `ON DELETE SET NULL` |
| `content_document_versions_append_only_trg` (UPDATE **e** DELETE) | liberar `DELETE` com `purge_after <= now()`, e o `UPDATE` restrito aos três campos de retenção |
| `writer_deliverable_versions_append_only_trg` | idem |

A cadeia `previous_version_id` vira buraco quando um elo é purgado — e isso é aceitável e desejado: a cadeia descreve o histórico, e o histórico é exatamente o que deixa de ser permanente. `SET NULL` registra "havia algo aqui, não está mais" em vez de impedir a política.

### 11.5 Purge idempotente

`lifecycle_purge_editorial_history(p_brand_id, p_limit)`:

| Situação | Retorno |
| --- | --- |
| linha não existe | `already_purged` |
| `purge_after IS NULL` ou `> now()` | `not_eligible` |
| linha é `current_version_id` de alguém | `not_eligible` (rede dupla, além do FK) |
| apagada agora | `purged` |

Nunca lança erro por "já feito". Reexecução é segura por construção, o que é requisito de qualquer rotina agendada.

---

## 12. Mídia — substituição com transferência de vínculo

### 12.1 O estado de hoje

- `writer_media_assets` **não tem** `anchor_kind`/`anchor_ref`: o ativo se liga ao documento e, opcionalmente, ao entregável — **nunca ao bloco, cena ou slide**. Confirmado no schema efetivo (§2.4: nuláveis são `deliverable_id`, `storage_path`, `mime_type`, `file_hash` — não há coluna de âncora).
- O caminho inverso existe no contrato e **nunca é escrito**: `VisualBrief.assetId` em `lib/redator/multiformat-contracts.ts:13` não é preenchido por nenhum código.
- Não há substituição: segundo upload recebe `asset_already_uploaded` (409) em `lib/server/writer-deliverables.ts:144`.

**Consequência direta para esta política:** sem âncora, a frase "o novo asset assume o mesmo vínculo antes de o anterior entrar na janela" **não tem onde ser executada**. O vínculo é pré-requisito da retenção de mídia, não um extra.

### 12.2 A ordem exigida

`writer_replace_media_asset(p_old_asset_id, p_new_asset_id)`, uma transação:

```
1. valida: mesmo marca_id e document_id; novo com status='uploaded' e file_hash não nulo
2. TRANSFERE O VÍNCULO: novo.anchor_kind/anchor_ref := antigo.anchor_kind/anchor_ref
   (ou exige que o novo já traga âncora idêntica — nunca vínculo divergente)
3. confirma que o novo está ancorado
4. SÓ ENTÃO: antigo.replaced_by_asset_id := novo.id
                antigo.superseded_at     := now()
                antigo.purge_after       := now() + interval '48 hours'
COMMIT
```

Os passos 2 e 4 na mesma transação são o que garante que **nunca existe instante em que o bloco ficou sem imagem** e o antigo já estava em contagem. Se a transação falhar, o antigo continua `current` e sem `purge_after`.

Idempotência: repetir com o mesmo par devolve o estado atual sem mover `purge_after`. Chamar com um par diferente para um ativo já substituído é **recusado**, não sobrescrito.

`replaced_by_asset_id` usa `ON DELETE SET NULL` — o sucessor pode, no futuro, ser ele próprio substituído e purgado sem travar a linha antiga.

### 12.3 Purge de mídia — objeto antes da linha

`lifecycle_purge_writer_media(p_asset_id)`:

```
1. linha ausente                         → already_purged
2. purge_after nulo ou futuro            → not_eligible
3. alguma cena/slide ainda aponta        → not_eligible  (rede contra vínculo órfão)
4. remove o objeto em writer-media
   - objeto ausente                      → segue (idempotente)
5. apaga a linha
```

A ordem importa: apagar a linha primeiro deixaria o arquivo órfão no bucket, **sem dono e sem rastro**. Apagar o objeto primeiro e falhar na linha deixa uma linha reparável, que a próxima execução resolve.

Hoje o bucket tem **0 objetos** e a tabela **0 linhas** — a rotina nasce sem passivo.

### 12.4 Pré-requisito declarado

A retenção de mídia **depende** do vínculo fino (`anchor_kind`/`anchor_ref`). As duas coisas entram na **mesma M3**, e não faz sentido separá-las: sem âncora não existe "mesmo vínculo" para o sucessor assumir.

---

## 13. Ordem de execução

1. **Preflight** — blocos [2], [2b], [3], [3b], [5] (§2.5). Sem eles, nenhuma migration é escrita.
2. **Commitar a fundação untracked** — 23 arquivos, incluindo 4 migrations e 7 testes, seguem fora do git.
3. Código: remover os 4 acoplamentos, `start_writing`/`prepare_plan`/`approve_plan`; migrar `publication-identity.ts`.
4. Redator → Publicações direto, com readback obrigatório.
5. Botão "Importar do Radar" chamando `sendRadarToWriter`.
6. Navegação e estágios declarados (§8).
7. M1 e M2, com testes de substituição, janela e idempotência.
8. M3, isolada.
9. Documentação.

Cada passo tem rollback por ocultação de superfície. Nenhum passo apaga dado.

---

## 14. Evidência

| Afirmação | Marcação |
| --- | --- |
| 0 tabelas de Planejador, 0 ContentPlan, 0 `stage='planner'`, 0 `sent_planner` | `PERSISTENCIA_REMOTA` |
| `publication_records` vazia; `content_documents` com 1 linha v2 | `PERSISTENCIA_REMOTA` |
| Tabelas de versão e mídia vazias; bucket com 0 objetos | `PERSISTENCIA_REMOTA` |
| `editorial_artifact_versions` = 531 linhas de DNA, 0 de plano | `PERSISTENCIA_REMOTA` |
| Nulabilidade efetiva (§2.4) | `PERSISTENCIA_REMOTA` |
| FKs de coluna única (§2.4) | `PERSISTENCIA_REMOTA` |
| Grants efetivos por papel; `anon` sem acesso (§2.4) | `PERSISTENCIA_REMOTA` |
| `0028` e `0027` como migrations efetivas (§2.3) | `PERSISTENCIA_REMOTA` (schema cruzado com arquivo) |
| 4 acoplamentos; `start_writing` como porta única de Publicações | `VERIFICADO_NO_CODIGO` |
| `planner-handoff.ts` importado por 5 arquivos de produção do Radar | `VERIFICADO_NO_CODIGO` |
| `writer_deliverables` sem `current_version_id` | `VERIFICADO_NO_CODIGO` + `PERSISTENCIA_REMOTA` |
| `writer_media_assets` sem coluna de âncora; `assetId` nunca escrito | `VERIFICADO_NO_CODIGO` + `PERSISTENCIA_REMOTA` |
| CHECK de `stage`, triggers append-only e FKs RESTRICT | `VERIFICADO_NO_CODIGO` (migration) · **`PENDENTE`** no estado efetivo |
| `pg_cron` | `PENDENTE` |
| Suítes `test:redator` 28/28 e `test:redator:mcp` 2/2 | `CONFIRMADO_POR_TESTE` (rodadas hoje) |
| Qualquer homologação de navegador | `VALIDADO_MANUALMENTE` = **nenhuma** |

**Nenhuma migration foi escrita ou aplicada. Nenhum código, UI ou dado foi alterado. Nenhum purge foi executado.**
