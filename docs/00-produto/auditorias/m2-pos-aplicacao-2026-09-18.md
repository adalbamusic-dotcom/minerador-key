# M2 — aplicação e auditoria pós-aplicação

**Data:** 2026-09-18
**Aplicado nesta rodada:** `supabase/migrations/20260918190100_m2_writer_version_lifecycle.sql`
**Não aplicado:** M3. **Não executado:** purge, cron, deploy, commit, push.

---

## 1. Histórico de migrations — um achado maior do que o esperado

`npx supabase migration list --linked` revelou que **o histórico remoto está quase inteiramente vazio**, e não só para a M1.

Antes desta rodada, `supabase_migrations.schema_migrations` tinha **4 linhas**, todas da fundação do Redator/MCP, gravadas pelo Studio sob timestamps próprios, diferentes dos nomes locais:

| Remoto | Nome | Arquivo local correspondente |
| --- | --- | --- |
| `20260918052851` | `writer_multiformat_mcp_foundation` | `20260918050959_...` |
| `20260918052858` | `writer_mcp_delegations` | `20260918051757_...` |
| `20260918053128` | `writer_deliverable_atomic_save` | `20260918053018_...` |
| `20260918183754` | `writer_mcp_atomic_article_draft` | `20260918061000_...` |

Todas as outras — **as ~76 migrations de `0001` a `20260914100000`** — aparecem com `remote: ""`. O schema delas está aplicado; o registro não existe.

**A M1 estava nesse grupo:** schema aplicado (readback do CHECK confirmou de novo, antes de qualquer coisa), registro ausente. O SQL Editor executa, mas não grava histórico.

### 1.1 Consequência operacional que precisa ficar registrada

> **`supabase db push` não pode ser usado neste projeto.** Ele aplicaria as ~76 migrations já aplicadas e ausentes do histórico, e quebraria na primeira colisão de objeto. Foi por isso que a M2 foi aplicada por `db query -f` e registrada depois por `migration repair`.

Reparar as 76 é uma decisão de infraestrutura maior do que este corte, e mascararia eventual drift real. **Não foi feito.** Fica declarado.

### 1.2 Reparo da M1 — comando e resultado

```bash
npx supabase migration repair --status applied 20260918190000 --linked
```

```
Repaired migration history: [20260918190000] => applied
{"versions":["20260918190000"],"status":"applied","repairAll":false,"message":"Migration history repaired"}
```

A M1 **não foi reaplicada** — só o histórico foi corrigido. Conferido depois:

```
20260918190000 | m1_workflow_stage_sem_planner
```

---

## 2. Pré-condições, relidas do arquivo antes do DDL

| # | Condição | Resultado |
| --- | --- | --- |
| 1 | `editorial_artifact_versions` não é alterada | **OK** — 0 `ALTER TABLE` |
| 2 | `pipeline_editorial_protect_append_only` global não é substituída | **OK** — 0 `CREATE OR REPLACE` |
| 3 | Função retention-aware ligada só às tabelas do Redator | **OK** — exatamente 2 `EXECUTE FUNCTION` |
| 4 | `writer_deliverables.current_version_id` acrescentado | **OK** |
| 5 | FKs de predecessor tratados pelo catálogo, não por nome presumido | **OK** — busca por `a.attname = 'previous_version_id'`, com aborto nomeado |
| 6 | `purge_after` não deriva de `created_at` | **OK** |
| 7 | Colunas de lifecycle nulas em versão corrente | **OK** — nenhuma com `NOT NULL` ou `DEFAULT` |
| 8 | Sem DELETE automático e sem cron | **OK** — ver 2.1 |

### 2.1 O item 8 acusou divergência por um erro meu de verificação

A primeira checagem procurou `pg_cron` no arquivo inteiro e casou com o **comentário** que explica que `pg_cron` não está instalado. Refiz removendo linhas de comentário:

```
cron.schedule: 0 · pg_cron: 0 · CREATE EXTENSION: 0 · DROP TABLE: 0 · TRUNCATE: 0
```

Os dois `DELETE FROM` existentes estão **dentro** de `lifecycle_purge_editorial_history` — corpo de função definida, não executada. Fora de função, o único comando de dados é o `UPDATE` de backfill de `current_version_id`, que sobre 0 linhas é no-op.

---

## 3. Aplicação

```bash
npx supabase db query --linked -f supabase/migrations/20260918190100_m2_writer_version_lifecycle.sql
```

Retorno sem erro. Registro no histórico:

```bash
npx supabase migration repair --status applied 20260918190100 --linked
→ Repaired migration history: [20260918190100] => applied
```

Estado do histórico ao fim: `20260918190000` e `20260918190100` registradas. **`20260918190200` (M3) não está registrada nem aplicada.**

---

## 4. Readback do schema efetivo

### 4.1 Colunas — todas presentes e nuláveis

```
writer_deliverables.current_version_id                 nullable=YES
content_document_versions.superseded_at                nullable=YES
content_document_versions.superseded_by_version_id     nullable=YES
content_document_versions.purge_after                  nullable=YES
writer_deliverable_versions.superseded_at              nullable=YES
writer_deliverable_versions.superseded_by_version_id   nullable=YES
writer_deliverable_versions.purge_after                nullable=YES
```

### 4.2 Foreign keys

```
writer_deliverables_current_version_fk                  → RESTRICT   (a corrente nunca é apagada)
content_documents_current_version_fk                    → RESTRICT   (preservada)
content_document_versions_previous_version_id_fkey      → SET NULL   (era RESTRICT)
writer_deliverable_versions_previous_version_id_fkey    → SET NULL   (era RESTRICT)
```

### 4.3 CHECKs de retenção — a regra virou estrutural

```sql
CHECK (((superseded_at IS NULL) AND (superseded_by_version_id IS NULL) AND (purge_after IS NULL))
    OR ((superseded_at IS NOT NULL) AND (superseded_by_version_id IS NOT NULL)
        AND (purge_after = (superseded_at + '48:00:00'::interval))))
```

Idêntico nas duas tabelas. O banco passa a **recusar** `purge_after` sem substituição declarada.

### 4.4 Triggers — e o DNA intacto

```
content_document_versions    → pipeline_editorial_protect_retention_aware   ← trocada
writer_deliverable_versions  → pipeline_editorial_protect_retention_aware   ← trocada
editorial_artifact_versions  → pipeline_editorial_protect_append_only       ← INTACTA
editorial_decision_events    → pipeline_editorial_protect_append_only       ← INTACTA
editorial_serp_reviews       → pipeline_editorial_protect_append_only       ← INTACTA
editorial_serp_snapshots     → pipeline_editorial_protect_append_only       ← INTACTA
editorial_version_status_events → pipeline_editorial_protect_append_only    ← INTACTA
writer_mcp_call_events       → pipeline_editorial_protect_append_only       ← INTACTA
```

E o corpo da função original continua incondicional, sem qualquer referência a `purge_after` — verificado por comparação direta do `pg_get_functiondef`. **Seis tabelas de módulos anteriores seguem com a proteção permanente.**

### 4.5 RLS e grants — sem regressão

As três tabelas do corte mantêm RLS habilitada e **apenas política de `SELECT` para `authenticated`**. Grants inalterados: `authenticated` só SELECT; `service_role` com SELECT/INSERT (e UPDATE em `writer_deliverables`). Nenhuma permissão foi ampliada — as funções de lifecycle são `SECURITY DEFINER` e não dependem de grant de tabela.

### 4.6 Linhas

| Tabela | Antes | Depois |
| --- | --- | --- |
| `content_documents` | 1 | **1** |
| `content_document_versions` | 0 | **0** |
| `writer_deliverables` | 0 | **0** |
| `writer_deliverable_versions` | 0 | **0** |
| `editorial_artifact_versions` | 554 | **554** |
| linhas com `superseded_at` | — | **0** |
| linhas com `purge_after` | — | **0** |

```text
M2_SCHEMA_APPLIED = YES
DNA_APPEND_ONLY_UNCHANGED = YES
EXISTING_ROWS_AUTO_SUPERSEDED = 0
PURGE_EXECUTION = NO
```

---

## 5. Prova funcional

Fixture própria, com id `m2-fixture:<uuid>`. Marca e usuário foram **lidos** apenas para satisfazer FK; **nenhum documento real do usuário foi escrito**. Tudo dentro de um `DO` que termina em `RAISE EXCEPTION`, o que desfaz a transação inteira e devolve o veredito na mensagem.

### 5.1 Artigo

| Asserção | Resultado |
| --- | --- |
| salvar A → `current_version_id = A` | `A_IS_CURRENT=true` |
| salvar B diferente → readback confirma B como corrente | `B_IS_CURRENT=true` |
| B aponta para A como predecessora | `B_PREV_IS_A=true` |
| A recebe `superseded_by_version_id = B` | `A_SUP_BY_B=true` |
| `A.superseded_at` preenchido | `A_SUP_AT_SET=true` |
| **`A.purge_after = superseded_at + 48h`** | `A_PURGE_48H=true` |
| salvar idêntico a B → não cria C | `IDENT_UNCHANGED=true` · `VERSIONS=2` |
| salvar idêntico não altera a janela | `WINDOW_STABLE=true` |
| repetir a marcação é idempotente e não move a janela | `REMARK_UNCHANGED=true` · `WINDOW_SAME=true` |

### 5.2 Roteiro e carrossel — testados separadamente

| Asserção | `video_script` | `carousel` |
| --- | --- | --- |
| v1 vira corrente pela **coluna** | `true` | `true` |
| v2 vira corrente pela **coluna** | `true` | `true` |
| autoridade é `writer_deliverables.current_version_id` | `AUTHORITY_IS_COLUMN=true` | `AUTHORITY_IS_COLUMN=true` |
| `v1.purge_after = superseded_at + 48h` | `true` | `true` |
| salvar idêntico não cria v3 | `IDENT_UNCHANGED=true` · `VERSIONS=2` | `IDENT_UNCHANGED=true` · `VERSIONS=2` |

`max(version_number)` deixou de ser autoridade: a coluna é preenchida pela própria `writer_save_deliverable` na mesma transação da versão.

### 5.3 Teste de falha

| Cenário | Resultado |
| --- | --- |
| marcar a versão **corrente** | **RECUSADO** — `retention_self_supersede` |
| sucessor que não é a corrente (readback inválido) | **RECUSADO** |
| o predecessor não marcado permanece limpo | `B_NOT_SUPERSEDED=true` (`superseded_at` e `purge_after` NULL) |
| outra marca tentando alcançar o documento | **RECUSADO** — `BRAND_ISOLATION=OK` |

A camada de código cobre o mesmo em `planSupersede` (Corte 3, testes 01-04): readback falho não chega a chamar a RPC. As duas camadas recusam.

### 5.4 Nada persistiu

```
docs=1  fixtures=0  cdv=0  wdv=0  wd=0  superseded=0  eav=554
```

---

## 6. Suítes — comparadas ao baseline

| Suíte | Baseline | Depois da M2 | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** | 0 |
| `test:redator` | 46/46 | **46/46** | 0 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 — 4 falhas | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `operational-flow` | 41/51 — 10 falhas | **41/51 — as mesmas 10** | 0 |
| `radar-to-writer-handoff-1` (loader) | 26/26 | **26/26** | 0 |

As 4 e as 10 falhas são pré-existentes, medidas em rodadas anteriores. Não foram corrigidas.

---

## 7. O que muda agora no runtime

`writerRetentionAvailable()` sonda `writer_deliverables.current_version_id` a cada 60 segundos. Com a M2 aplicada, ele passa a detectar a coluna **sem redeploy**, e a partir daí:

- o readback do entregável passa a conferir `current_version_id`;
- a marcação do predecessor deixa de devolver `unavailable` e passa a chamar a RPC;
- a autoridade de roteiro/carrossel vira a coluna.

O caminho do artigo não muda — ele já usava a coluna desde antes.

---

## 8. O que continua não existindo

**Purga.** Nenhuma rota chama `lifecycle_purge_editorial_history`. `pg_cron` e `pg_net` não estão instalados. Enquanto essa rota não existir, **nada é apagado** — versões marcadas acumulam `purge_after` vencido e permanecem. É o estado seguro, e é deliberado.

**M3.** `20260918190200_m3_writer_media_anchor_lifecycle.sql` não foi aplicada nem registrada. Ela exige, antes, que o fluxo de mídia respeite `registrar sucessor SEM anchor → upload → hash → readback → substituição atômica → transferência do anchor`.

---

## 9. Homologação manual — é do usuário

Nada aqui substitui abrir o Redator e conferir. Sugestão de roteiro: salvar um artigo duas vezes com conteúdo diferente, conferir que a segunda versão é a corrente e a primeira ganhou `purge_after` 48h à frente; salvar uma terceira vez com conteúdo idêntico e conferir que nenhuma versão nova aparece nem a janela se move; repetir com roteiro e com carrossel.

---

```text
M1_MIGRATION_HISTORY_ALIGNED = YES (para a M1; ver §1 — ~76 migrations do projeto seguem aplicadas e não registradas)
M2_DDL_APPLIED = YES
M2_SCHEMA_READBACK = PASS
ARTICLE_CURRENT_VERSION = PASS
SCRIPT_CURRENT_VERSION = PASS
CAROUSEL_CURRENT_VERSION = PASS
SUPERSEDE_ONLY_AFTER_READBACK = PASS
IDENTICAL_SAVE_IDEMPOTENT = PASS
DNA_APPEND_ONLY_UNCHANGED = YES
PURGE_IMPLEMENTED = NO
M3_APPLIED = NO
REGRESSION_FROM_M2 = NO
```
