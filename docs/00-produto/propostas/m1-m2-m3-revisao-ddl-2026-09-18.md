# M1, M2 e M3 — três migrations escritas para revisão

**Data:** 2026-09-18
**Estado:** `DDL_APPLIED = NO`. Os três arquivos existem no disco e **não foram executados**.
**Não executado nesta rodada:** `supabase db query`, `db push`, migration remota, deploy, commit, push.

| # | Arquivo |
| --- | --- |
| M1 | `supabase/migrations/20260918190000_m1_workflow_stage_sem_planner.sql` |
| M2 | `supabase/migrations/20260918190100_m2_writer_version_lifecycle.sql` |
| M3 | `supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql` |

Cada arquivo carrega, dentro dele: SQL completo, bloco de **readback pós-aplicação** e bloco de **rollback**. Este documento reúne o que é transversal — afetados, risco, testes e impacto.

---

## 1. M1 — remoção operacional do Planejador

### Afetados

| Objeto | Mudança |
| --- | --- |
| `editorial_workflow_items_stage_check` | `DROP` + `ADD` sem `'planner'` |
| Guarda `DO $$` | aborta se existir linha com `stage='planner'` |

Nada mais. Nenhuma tabela, coluna, trigger, função, policy ou grant.

### Impacto em linhas atuais

28 linhas de `editorial_workflow_items` são revalidadas contra o novo CHECK: 25 `architect` e 3 `radar`. **Todas passam.** Zero linhas escritas, alteradas ou apagadas.

### Risco

**Baixo.** O único risco real seria uma linha `stage='planner'` aparecer entre a leitura e a aplicação — e a guarda aborta a transação inteira com o motivo, em vez de deixar um `ALTER` falhar no meio.

Ordem importa: esta migration vem **depois** do Corte 2, não antes. Fechar a constraint antes de remover `import_planner` do código faria o banco recusar escrita que a aplicação ainda tentaria.

### Decisão de escopo declarada

`public.editorial_stage_module(text)` **não é alterada**. O ramo `'planner' → 'planejador'` vira inalcançável, e ramo inalcançável é inerte. Não a toquei porque verifiquei as políticas de seis tabelas, **não todos os chamadores da função no banco** — a query para fechar isso está no rodapé do arquivo.

---

## 2. M2 — lifecycle das versões produzidas

### Afetados

| Objeto | Mudança |
| --- | --- |
| `writer_deliverables` | `+ current_version_id uuid` + FK `RESTRICT` **DEFERRABLE INITIALLY DEFERRED** + backfill |
| `content_document_versions` | `+ superseded_at`, `+ superseded_by_version_id`, `+ purge_after`, CHECK pareado, índice parcial |
| `writer_deliverable_versions` | idem |
| FK `previous_version_id` (ambas) | `RESTRICT` → `SET NULL`, com o nome **descoberto no catálogo**, não assumido |
| `pipeline_editorial_protect_retention_aware()` | **função nova** |
| `content_document_versions_append_only_trg` | passa a usar a função nova |
| `writer_deliverable_versions_append_only_trg` | passa a usar a função nova |
| `writer_save_deliverable()` | `CREATE OR REPLACE` — passa a manter `current_version_id` |
| `writer_mark_document_version_superseded()` | nova |
| `writer_mark_deliverable_version_superseded()` | nova |
| `lifecycle_purge_editorial_history()` | nova |

**`pipeline_editorial_protect_append_only` NÃO é alterada. `editorial_artifact_versions` NÃO é tocada.** Essa é a decisão central do arquivo: a função antiga é compartilhada com o DNA, e afrouxá-la afrouxaria o DNA junto. A saída foi criar outra função e trocar o gatilho só nas duas tabelas do Redator.

### Impacto em linhas atuais

```
content_document_versions      0 linhas  → colunas novas, nenhuma preenchida
writer_deliverable_versions    0 linhas  → idem
writer_deliverables            0 linhas  → backfill de current_version_id é no-op
content_documents              1 linha   → NÃO é alterada por esta migration
```

**Nenhuma linha entra em janela de purge pela aplicação.** `superseded_at` nasce `NULL`, e sem ele o CHECK proíbe `purge_after`.

### Risco

| Risco | Grau | Por quê / mitigação |
| --- | --- | --- |
| Afrouxar append-only no DNA | **seria alto** | **Evitado por construção:** função nova, gatilho trocado só nas duas tabelas. O readback item 3 confirma que `editorial_artifact_versions` continua na função antiga. |
| `writer_save_deliverable` regredir | médio | A função é reescrita. A ordem mudou (versão antes da linha) para evitar um segundo `UPDATE` que bumparia `lock_version` de novo e faria o readback do cliente divergir do recibo. Cobrir com teste antes de aplicar. |
| FK com nome diferente do padrão | médio | **Mitigado:** o nome é descoberto por `pg_constraint`; se não achar, aborta com mensagem. |
| `SET NULL` disparar o gatilho | médio | **Previsto:** a função nova permite `previous_version_id` mudar **apenas para NULL**. Qualquer outra reescrita do elo é recusada. |
| Purga apagar a versão corrente | baixo | Rede tripla: FK `RESTRICT` nas duas tabelas, condição explícita na função, e o CHECK que exige substituição declarada. |
| Perda irreversível após purga | **alto se mal sequenciado** | O rollback devolve estrutura, **não devolve versão apagada**. Por isso: aplicar → conferir readback → só então habilitar a rota que chama `lifecycle_purge_editorial_history`. |

### Pendência de aplicação declarada

`pg_cron` e `pg_net` **não existem** neste projeto. A migration **não configura agendamento** de propósito: deixar um agendador implícito num banco que não o tem seria prometer uma limpeza que nunca acontece. A purga precisa de uma rota server-side, que **ainda não foi escrita** — está fora desta rodada.

---

## 3. M3 — lifecycle de mídia

### Afetados

| Objeto | Mudança |
| --- | --- |
| `writer_media_assets` | `+ anchor_kind`, `+ anchor_ref`, `+ replaced_by_asset_id`, `+ superseded_at`, `+ purge_after` |
| CHECKs novos | `anchor_kind_check`, `anchor_pair_check`, `retention_check`, `no_self_replace_check` |
| `writer_media_assets_file_state_check` | **intacta**, nem na migration nem no rollback |
| `writer_media_assets_current_anchor_uidx` | índice único parcial — um atual por âncora |
| `writer_media_assets_purge_idx` | índice parcial do purge |
| `writer_replace_media_asset()` | nova |
| `lifecycle_claim_writer_media_purge()` | nova (somente leitura) |
| `lifecycle_confirm_writer_media_purge()` | nova |

### Impacto em linhas atuais

```
writer_media_assets              0 linhas
storage.objects (writer-media)   0 objetos
```

Todas as colunas novas são nuláveis. Nada entra em janela.

### Risco

| Risco | Grau | Por quê / mitigação |
| --- | --- | --- |
| Arquivo órfão no bucket | médio | **Evitado pela ordem:** CLAIM → apagar objeto no servidor → CONFIRM apaga a linha. Se o processo morrer no meio, sobra linha sem arquivo — recuperável. A ordem inversa deixaria arquivo sem dono e sem rastro, que é o estado irrecuperável. |
| Índice único rejeitar upload legítimo | médio | **Dependência de ordem no app** — ver §3.1. |
| `replaced_by_asset_id` violar o CHECK | baixo | Por isso é `RESTRICT` e não `SET NULL`: anular o campo quebraria a própria declaração de substituição. O predecessor tem `purge_after` mais antigo e sai primeiro. |
| Purgar ativo ainda referenciado | baixo | `CONFIRM` recusa com `referenced` se alguma cena ou slide ainda apontar para o id, via `jsonb_path_exists`. |
| Perda irreversível do arquivo | **alto se mal sequenciado** | Mesma regra da M2: aplicar → readback → só então habilitar a rota. |

### 3.1 Dependência de ordem que o app precisa respeitar

O índice único parcial diz: **um ativo com arquivo, não substituído, por âncora**. Isso só funciona se o sucessor for criado **sem âncora** e recebê-la na substituição.

```
1. registerWriterMediaBrief  → cria o sucessor SEM anchor_kind/anchor_ref
2. uploadWriterMediaAsset    → sobe, relê, confere hash → status 'uploaded'
3. writer_replace_media_asset → transfere a âncora e só então abre a janela do antigo
```

Se o passo 1 já gravasse a âncora do antigo, o índice rejeitaria a criação. **Isso precisa estar no código do app antes de a M3 ser aplicada**, e é a razão de a M3 não ser aplicável sozinha.

---

## 4. Testes

Os três arquivos são DDL e **não são cobertos pela suíte Node**. A verificação de cada um é o bloco de readback dentro do próprio arquivo. O que precisa de teste é o **código que passará a usá-los** — e esse código ainda não existe:

| Teste | Alvo | Quando |
| --- | --- | --- |
| `retencao-substituicao` | `purge_after` **não** nasce sem sucessor; nasce após readback; repetir `mark_superseded` **não move** a janela; versão corrente nunca fica elegível | com o serviço de retenção |
| `retencao-purge-idempotente` | purgar duas vezes devolve `already_purged`; linha não elegível é recusada; cadeia `previous_version_id` sobrevive ao `SET NULL` | idem |
| `midia-substituicao-vinculo` | sucessor assume a âncora **antes** de o antigo ganhar janela; par divergente recusado; objeto ausente não falha o purge; sucessor sem `file_hash` é recusado | com o serviço de mídia |
| `writer-deliverable-current-version` | `writer_save_deliverable` mantém `current_version_id`; `lock_version` bumpa **uma vez** por gravação; `unchanged: true` devolve o ponteiro corrente | **antes de aplicar a M2** |
| `append-only-dna-intacto` | `editorial_artifact_versions` continua na função antiga e recusa qualquer UPDATE/DELETE | depois da M2 |

Suítes atuais permanecem como no fim do Corte 2: `tsc` limpo, `test:redator` 28/28, `test:editorial` 60/64 (4 falhas pré-existentes), `operational-flow` 41/51 (10 pré-existentes), `planejador-fora-do-pipeline` 16/16, `test:radar` 2236/2236. **Nenhum arquivo de código foi tocado nesta rodada** — só os três `.sql` e este documento.

---

## 5. Ordem de aplicação recomendada

1. **M1 sozinha.** É a única que toca constraint em tabela com dado (28 linhas). Aplicar, rodar o readback, parar.
2. **Escrever e testar o código que usa M2** (`current_version_id` em `writer_save_deliverable`, serviço de marcação). Só então aplicar a M2.
3. **Escrever e testar o código que usa M3** (criação de sucessor sem âncora, §3.1). Só então aplicar a M3.
4. **A rota de purga é o último passo de todos**, depois de os readbacks confirmarem tudo. Enquanto ela não existir, nada é apagado — e esse é o estado seguro.

M2 e M3 são independentes entre si. Ambas dependem da M1 apenas por coerência de sequência, não tecnicamente.

---

## 6. O que estas três migrations **não** resolvem

- **Não existe agendador.** Sem `pg_cron`, a purga só roda quando uma rota a chamar. As migrations criam a capacidade; não criam o hábito.
- **`editorial_artifact_versions` continua append-only permanente.** É o esperado: DNA está fora desta reforma.
- **O bloco `image_brief` do ContentDocument continua sem `assetId`.** A âncora `article_block` existe do lado da mídia, mas ligar a capa e os respiros a um bloco específico do artigo exige mudar `ContentBlockSchema`, que é contrato do **Arquiteto** — fora do corte, e registrado como decisão pendente.

---

```text
M1_READY_FOR_REVIEW = YES
M2_READY_FOR_REVIEW = YES
M3_READY_FOR_REVIEW = YES
DDL_APPLIED = NO
```
