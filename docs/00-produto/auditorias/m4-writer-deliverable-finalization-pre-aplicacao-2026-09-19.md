# M4 — lifecycle de rascunho e finalização de entregáveis (pré-aplicação)

> **A M4 foi aplicada em 2026-09-19.** Este documento registra o desenho e a
> revisão que precederam o DDL, e o `MIGRATION_APPLIED = NO` do fecho vale para
> o momento em que foi escrito. A aplicação, o readback do schema efetivo e o
> smoke de banco estão em
> [`m4-writer-deliverable-finalization-pos-aplicacao-2026-09-19.md`](m4-writer-deliverable-finalization-pos-aplicacao-2026-09-19.md).
>
> Uma diferença de conteúdo: antes do DDL o `UPDATE` da seção 0 foi **estreitado**
> para carregar o critério inteiro no próprio `WHERE`, em vez de depender das
> guardas — `NORMALIZATION_DML_SCOPE = LEGACY_DRAFT_ONLY`. O §5.2 abaixo mostra a
> forma anterior; a aplicada está no relatório pós-aplicação.

**Data:** 2026-09-19
**NÃO aplicada.** Nenhum DDL executado, nenhum dado remoto alterado.
**Não tocados:** Minerador, Arquiteto, Radar, ArticleDNA, SERP, mídia M3, purge,
Publicações.

---

## 1. Auditoria da autoridade atual

Lida do schema **efetivo**, não presumida —
`supabase/scripts/2026-09-19-m4-auditoria-pre-desenho.sql`.

### 1.1 `writer_deliverables`

| Ponto | Realidade |
| --- | --- |
| `status` CHECK | `draft` · `in_review` · `approved` — **`approved` já é o estado final canônico** |
| `current_version_id` | `uuid` NULL, FK → `writer_deliverable_versions` **DEFERRABLE INITIALLY DEFERRED** |
| `lock_version` | `int` default 1, CHECK > 0, **incrementado por trigger** `writer_deliverables_touch_trg` |
| unicidade | `(document_id, kind)` — um entregável por documento por tipo |
| RLS | ativa; política **só de SELECT** para `authenticated`, via `canonical_actor_can_access_brand` |
| grants | `service_role`: INSERT/SELECT/UPDATE (**sem DELETE**) · `authenticated`: SELECT |

### 1.2 `writer_deliverable_versions`

| Ponto | Realidade |
| --- | --- |
| `previous_version_id` | FK → self, **ON DELETE SET NULL** |
| `superseded_by_version_id` | FK → self, ON DELETE RESTRICT |
| retenção | CHECK da M2: o trio anda junto, `purge_after = superseded_at + 48h` |
| unicidade | `(deliverable_id, version_number)` |
| trigger | `pipeline_editorial_protect_retention_aware` (append-only ciente de retenção) |
| grants | `service_role`: INSERT/SELECT (**sem UPDATE, sem DELETE**) |

### 1.3 As RPCs

| Função | Existe | Grants |
| --- | --- | --- |
| `writer_save_deliverable` | sim | anon `false` · authenticated `false` · service_role `true` |
| `writer_mark_deliverable_version_superseded` | sim | idem |
| `writer_finalize_deliverable` | **não** | — |

### 1.4 Como `approved` é tratado hoje

```sql
IF v_current.status = 'approved' THEN RAISE EXCEPTION 'writer_approved_immutable';
```

O save **impede** editar um aprovado — e não há nada que produza esse estado nem
que saia dele. `approved` é hoje uma parede sem porta.

---

## 2. Os dois defeitos, confirmados no corpo da RPC

```sql
INSERT INTO public.writer_deliverable_versions (...)
VALUES (..., 'Revisão do rascunho.', p_actor_id)
...
UPDATE public.writer_deliverables SET ... current_version_id = v_version_id
```

**Todo save alterado cria versão e move a corrente.** Save idêntico já retorna
`unchanged` sem versionar — isso estava certo e foi preservado.

```text
DRAFT_SAVE_CREATES_VERSION_CURRENTLY = YES
FINALIZATION_AUTHORITY = MISSING
```

---

## 3. O que a M4 estabelece

`supabase/migrations/20260919020000_m4_writer_deliverable_finalization.sql`

### 3.1 `writer_save_deliverable` — substituída

Mesma assinatura, mesmas validações de escopo, mesma guarda de `approved`, mesmo
optimistic lock. Saem **três** coisas: o INSERT em versions, o
`current_version_id = v_version_id`, e o `version_id` no recibo de criação.

Um entregável nunca finalizado passa a poder ter, depois de N saves:

```text
status = 'draft'   e   current_version_id IS NULL
```

### 3.2 `writer_finalize_deliverable` — nova, e única que cria versão

```text
writer_finalize_deliverable(p_brand_id, p_document_id, p_kind, p_expected_lock, p_actor_id)
```

**Não recebe payload.** Ela fotografa o que já está em
`writer_deliverables.payload`, e por isso não existe segunda fonte de verdade: o
que foi salvo é o que é finalizado. Quem finaliza salva antes.

`previous_version_id` recebe o `current_version_id` de antes — **NULL na primeira
finalização**, sempre, porque a seção 0 anula o ponteiro dos entregáveis nunca
finalizados antes de qualquer coisa rodar. Ver §5.1.

**Ela não marca o predecessor.** Isso é do readback, pela
`writer_mark_deliverable_version_superseded` que a M2 já criou.

### 3.3 `writer_reopen_deliverable` — nova, o contrato que faltava

```text
approved → draft, sem tocar em versões nem em current_version_id
```

Sem isto, a refinalização seria impossível — o save recusa aprovado e não há
volta. E deixar o save reabrir sozinho seria editar um finalizado sem dizer que
ele deixou de ser finalizado.

```text
REFINALIZATION_PATH_DEFINED = YES:  approved → (reopen) → draft → (save) → (finalize) → B
```

### 3.4 Idempotência — pelo mecanismo que já existe

Nenhum comparador novo foi inventado. `content_hash` já é a autoridade de
"mudou ou não" em documento, entregável e mídia. Finalizar de novo sem mudança
encontra `approved` com hash igual ao da versão corrente e devolve a **mesma**
versão, sem inserir nada.

`approved` com hash **diferente** da versão corrente é estado que o save não
consegue produzir. Se aparecer, a RPC levanta
`writer_finalized_state_inconsistent` em vez de finalizar por cima — esconder
corrupção seria pior que recusar.

---

## 4. Ordem do lifecycle M2

```text
persistir B
→ current_version_id = B
→ READBACK confirma B como corrente
→ só então marcar A superseded
```

Se o readback falhar, **A não entra em retenção**: a janela de 48h abriria sobre
o que talvez seja a única versão boa. Se a marcação de A falhar depois de B
confirmado, **B continua corrente** e A fica retido por mais tempo — nunca se
compensa apagando B.

Isso está modelado em `planRetentionAfterFinalization` e exercitado nos testes
10 e 11.

---

## 5. Dados existentes

```text
writer_deliverables          2 linhas · ambas status='draft' · lock_version=1
writer_deliverable_versions  2 linhas · version_number=1 · previous=NULL
                             change_reason='Rascunho inicial.'
                             nenhuma superseded · ambas são a corrente do seu dono
aprovados 0 · em retenção 0 · versões órfãs 0
```

Classificação: as duas são **`LEGACY_DRAFT_VERSION`** — nasceram do
comportamento antigo e não são finalizações. **A M4 não as converte, não as
apaga e não as renomeia.**

### 5.1 A decisão canônica — rascunho não é história

```text
DRAFT_IS_HISTORY = NO
FIRST_FINAL_VERSION_PREVIOUS_ID = NULL
LEGACY_DRAFT_VERSION_ENTERS_M2 = NO
```

Uma versão criada pelo save antigo é **artefato do defeito**, não finalização.
Deixá-la ser predecessora da primeira final a colocaria na janela de 48h como se
tivesse sido substituída — e o lifecycle M2 passaria a carregar um snapshot que
nunca representou uma decisão editorial.

A correção é tirar o **ponteiro**, não a linha.

### 5.2 A normalização — seção 0 da migration

```sql
UPDATE public.writer_deliverables SET current_version_id = NULL
 WHERE current_version_id IS NOT NULL AND status <> 'approved';
```

É o único `UPDATE` da seção, num único alvo, com uma única coluna. **Nenhuma
linha de `writer_deliverable_versions` é lida para escrita, movida ou apagada.**
Ficam intactos: `version_id`, `payload`, `content_hash`, `previous_version_id`,
`superseded_at`, `superseded_by_version_id`, `purge_after`.

Depois disso `current_version_id` passa a significar uma coisa só: **a última
versão finalizada**. Nunca um rascunho.

### 5.3 O pré-flight — sete guardas que abortam a transação

A forma auditada em 2026-09-19 está escrita no cabeçalho da seção 0. Contagem
**maior** é tolerada (saves antes da aplicação criam mais versões legadas — é o
defeito em ação, não surpresa). Mudança de **natureza** aborta:

| Guarda | Dispara quando |
| --- | --- |
| `m4_preflight_ha_entregavel_aprovado` | alguém já finalizado por caminho que não existe |
| `m4_preflight_ha_versao_em_retencao` | janela de 48h já aberta |
| `m4_preflight_corrente_nao_reconhecida` | corrente que não é rascunho legado reconhecível |
| `m4_preflight_corrente_orfa` | ponteiro para versão inexistente ou de outro dono |
| `m4_normalizacao_incompleta` | sobrou corrente depois do `UPDATE` |
| `m4_normalizacao_alterou_versoes` | a contagem de versões mudou |
| `m4_normalizacao_iniciou_retencao` | alguma versão ganhou `superseded_at` ou `purge_after` |

Reconhecer rascunho legado é por `change_reason IN ('Rascunho inicial.',
'Revisão do rascunho.')` — o que o save antigo de fato escrevia — e não por
adivinhação de data ou posição.

### 5.4 Defesa em profundidade na finalização

Depois da normalização, `current_version_id` só é preenchido pela própria
`writer_finalize_deliverable` — logo, quando existe, já é uma final. A conferência
abaixo existe para o caso de um rascunho legado voltar a ser apontado por
qualquer caminho futuro:

```sql
IF v_corrente.deliverable_id IS DISTINCT FROM v_current.id
   OR v_corrente.superseded_at IS NOT NULL
   OR v_corrente.change_reason <> 'Finalização do entregável.' THEN
  RAISE EXCEPTION 'writer_predecessor_nao_e_final' USING ERRCODE = 'P0001';
END IF;
```

Ela vem **antes** do `INSERT`: impede, não conserta depois.

---

## 6. Segurança

Confirmado no schema efetivo para o que existe hoje, e escrito na M4 para o que
ela cria:

```text
SAVE_RPC_ANON = NO                  FINALIZE_RPC_ANON = NO
SAVE_RPC_AUTHENTICATED_DIRECT = NO  FINALIZE_RPC_AUTHENTICATED_DIRECT = NO
SAVE_RPC_SERVICE_ROLE = YES         FINALIZE_RPC_SERVICE_ROLE = YES
```

As três funções: `SECURITY DEFINER`, `search_path = public, pg_temp`, REVOKE de
`PUBLIC, anon, authenticated, service_role` e GRANT só a `service_role`.

O ator chega por parâmetro, derivado da sessão no servidor. A camada de rota
valida o payload pelo Zod, deriva o ator de `requireCanonicalSessionProfile()` e
**nunca** aceita `actor_id` vindo do navegador — é o mesmo padrão já usado em
`media-anchor` e no save atual.

---

## 7. Publicações continua separada

Finalizar define `status='approved'` e `current_version_id`. **Não cria
`publication_record`.** A M4 não menciona a tabela (teste 18), e o módulo de
regras também não (teste 12). Entregar segue sendo
`sendWriterToPublications`, pela autoridade que já existe.

```text
PUBLICATION_REMAINS_SEPARATE = YES
```

---

## 8. Roteiro e carrossel, uma autoridade só

A M4 não é "migration de roteiro": ela corrige o lifecycle de
`writer_deliverables`. A RPC recebe `p_kind` e valida
`IN ('video_script', 'carousel')` — **uma função, não duas** (teste 17).

```text
SCRIPT_AND_CAROUSEL_SHARED_AUTHORITY = YES
```

---

## 9. Testes

`tests/redator-m4-deliverable-lifecycle.test.mts` — **26/26**, em `test:redator`.

### 9.1 As três categorias, separadas de propósito

| Categoria | Testes | O que provam | O que **não** provam |
| --- | --- | --- | --- |
| `PURE_BEHAVIOR_TEST` | 01-12, 20-22 | as regras de decisão, exercitadas de verdade | que o banco se comporta assim |
| `STRUCTURAL_SQL_TEST` | 13-19, 23-26 | o que está **escrito** na migration | que o SQL executa sem erro |
| `REMOTE_SCHEMA_TEST` | — | — | não existe no runner: ele não alcança o banco |

A leitura remota desta rodada foi feita pelo script de auditoria (§1), com
SELECTs. **Nenhum teste aqui finge provar execução real** — a M4 não rodou.

O Corte 5.2 já mostrou o preço de confundir as coisas: a primeira aplicação da
M3 falhou com 42703 por ordem interna, um defeito que nenhuma leitura pegou.

### 9.2 Cobertura pedida

| Caso | Teste |
| --- | --- |
| draft save 1, 2, N → zero versões | 01 |
| entregável novo nasce sem versão nem corrente | 02 |
| save idêntico não versiona | 03 |
| first finalize → versão A, current = A | 06 |
| finalize unchanged → continua A, zero duplicata | 07 |
| changed + refinalize → B, B.previous = A, current = B | 09 |
| A só entra em retenção depois de B confirmado | 10 |
| readback failure → A não superseded | 10 |
| script e carousel, mesma autoridade | 17 |
| finalize não cria `publication_record` | 12, 18 |
| o save da M4 não versiona | 13 |
| uma única inserção de versão em toda a migration | 14 |
| reabrir não toca em versões | 16 |
| grants e escopo | 18 |
| rollback existe e é fiel | 19 |
| rascunho legado nunca vira predecessor (puro) | 20 |
| `supersededAt`, dono errado e motivo desconhecido falham fechados | 20 |
| normalizado → primeira finalização com `previous = NULL` | 21 |
| reopen A → N saves → corrente continua A, zero versões | 22 |
| save idêntico depois do reopen não zera a corrente | 22 |
| refinalizar modificado → B.`previous` = A | 22 |
| a normalização só toca o ponteiro, e só em quem nunca finalizou | 23 |
| linha legada preservada · sem `superseded_at` · sem `purge_after` | 23 |
| as sete guardas do pré-flight existem | 24 |
| o save não escreve `current_version_id` nem para anulá-la | 25 |
| a guarda de predecessor vem antes do `INSERT` | 26 |

### 9.3 Baseline

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 162/162 | **188/188** | +26 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` (erros) | ~~0~~ **124** | **124** | 0 |

**Correção da linha do `eslint`.** A rodada anterior registrou baseline 0, e isso
não se reproduz: `npx eslint` acusa 124 erros, todos em
`modules/arquiteto/arquiteto-workspace.tsx` (113) e
`modules/minerador/minerador-workspace.tsx` (11). Conferi contra o HEAD por
`git show HEAD:<arquivo> | npx eslint --stdin --stdin-filename <arquivo>`: os
mesmos arquivos já acusavam 113 e 13 erros no código **commitado**. São
pré-existentes, estão fora da frente Redator, e a M4 não acrescenta nenhum. Não
os corrigi: esta rodada não toca em Minerador nem Arquiteto.

Na frente Redator o `eslint` acusa 0 erros. Os dois avisos em
`modules/redator/writer-page.tsx` (imports não usados) são anteriores a esta
rodada.

### 9.4 Mutantes

Cada asserção nova foi conferida por mutante — defeito introduzido de propósito,
suíte rodada, defeito revertido. Os sete mutantes atingiram só a migration (que
ninguém compila) e `lib/redator/deliverable-lifecycle.ts` (que nenhum módulo da
app importa); o dev server não viu nenhum.

| Mutante | Morto por |
| --- | --- |
| normalização passa a atingir quem já finalizou | 23 |
| pré-flight perde a guarda de versão em retenção | 24 |
| o save volta a escrever a corrente, zerando-a | 25 |
| a finalização aceita qualquer corrente como predecessora | 26 |
| o save de rascunho zera a corrente no estado seguinte | 22 |
| predecessor já substituído volta a ser aceito | 20 |
| rascunho legado passa a ser classificado como final | 20 |

Sete mutantes, sete mortos, nenhum sobrevivente.

---

## 10. UI

Nenhum botão de finalizar foi criado.

```text
FINALIZE_BUTTON_LIVE = NO
```

As regras de decisão existem em `lib/redator/deliverable-lifecycle.ts` e podem
ser usadas pela camada de servidor assim que a M4 for aplicada. Não preparei o
handler no componente: enquanto a RPC não existir, ele só teria como falhar, e
prefiro ligar a tela depois do readback confirmar a migration — como foi feito
com a M3.

---

## 11. Rollback

`supabase/scripts/2026-09-19-m4-rollback-writer-save-deliverable.sql` traz o
corpo **anterior** de `writer_save_deliverable`, capturado do schema efetivo
antes de escrever a M4, e derruba as duas funções novas.

A M4 substitui e cria funções, e faz **uma** escrita de dado: a normalização da
seção 0. Nenhuma tabela, coluna ou constraint é alterada; nenhuma linha é
apagada. Por isso o rollback é limpo — **enquanto nenhuma finalização tiver
acontecido**. Depois de existirem versões finalizadas, o save antigo voltaria a
versionar por cima delas e a misturar rascunho com finalização. Está escrito no
próprio arquivo.

**O rollback não repõe os ponteiros anulados, e não deveria.** Repô-los seria
recriar o defeito — um rascunho voltando a ser "versão corrente". Se o save
antigo for restaurado, ele torna a preencher `current_version_id` no próximo save
alterado, e as linhas legadas continuam todas lá, intactas. A anulação do
ponteiro é reversível pelo próprio uso, e nada se perde com ela.

---

```text
DRAFT_SAVE_CREATES_VERSION_CURRENTLY = YES
M4_REMOVES_DRAFT_VERSIONING = YES
FINALIZATION_RPC_DESIGNED = YES
FIRST_FINALIZATION_CREATES_VERSION = YES
UNCHANGED_FINALIZATION_IDEMPOTENT = YES
REFINALIZATION_PATH_DEFINED = YES
M2_RETENTION_INTEGRATED = YES
LEGACY_DRAFT_CURRENT_NORMALIZED = YES
LEGACY_VERSION_ROWS_PRESERVED = YES
LEGACY_VERSION_RETENTION_STARTED = NO
FIRST_FINAL_PREVIOUS_NULL = YES
CURRENT_VERSION_MEANS_LAST_FINALIZED_VERSION = YES
SCRIPT_AND_CAROUSEL_SHARED_AUTHORITY = YES
PUBLICATION_REMAINS_SEPARATE = YES
MIGRATION_APPLIED = NO
REMOTE_DATA_MODIFIED = NO
FINALIZE_BUTTON_LIVE = NO
REGRESSIONS = NONE
```

### O alerta que continua de pé

A decisão de §5.1 está fechada: `DRAFT_IS_HISTORY = NO`. Nada mais está aberto
nesta frente.

**Alerta:** a M3 falhou na primeira aplicação por ordem interna de comandos, um
defeito que só a execução encontra. Recomendo que a aplicação da M4 siga o mesmo
gate: silêncio no repositório, baseline verde, aplicar por `db query -f`,
readback, `migration repair`, e só então ligar o botão.
