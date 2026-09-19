# M3 aplicada — gate de estabilidade, execução e smoke

**Data:** 2026-09-18
**Aplicado:** somente `20260918190200_m3_writer_media_anchor_lifecycle.sql`.
**Não executado:** purge, cron, DELETE de mídia, deploy, commit, push. Nenhuma
outra migration.

A primeira tentativa de aplicação **falhou** com um defeito que só a execução
encontra. A transação desfez tudo, o defeito foi corrigido e a segunda tentativa
passou. Detalhe em §3.

---

## 1. O gate de estabilidade

### 1.1 Silêncio contínuo

Watcher com janela de 150s que **reinicia do zero** a cada gravação fora da
frente Redator:

```text
SILENCIO_CONTINUO=150s  reinicios=1  duracao_total=243s
```

Uma gravação alheia reiniciou a janela; a segunda tentativa fechou. Confirmei de
novo imediatamente antes do DDL: **zero gravações alheias em 6 minutos**, e
outra vez antes da reaplicação.

### 1.2 Baseline antes de tocar no banco

| Suíte | Resultado |
| --- | --- |
| `npx tsc --noEmit` | **0 erros** |
| `test:redator` | 90/90 |
| `test:redator:mcp` | 2/2 |
| `test:editorial` | 60/64 — as mesmas 4 herdadas |
| `test:radar` | 2236/2236 |
| `operational-flow` | 41/51 — as mesmas 10 herdadas |
| `planejador-fora-do-pipeline` | 16/16 |

### 1.3 Verificações de autoridade, antes da execução

```text
P_ACTOR_ID_FROM_AUTHENTICATED_SERVER_CONTEXT = YES
CLIENT_CANNOT_CHOOSE_UPDATED_BY = YES
WRITER_REPLACE_MEDIA_ASSET_EXECUTE_ANON = NO
WRITER_REPLACE_MEDIA_ASSET_EXECUTE_AUTHENTICATED = NO
WRITER_REPLACE_MEDIA_ASSET_EXECUTE_SERVICE_ROLE = YES
```

O ator vem de `profile.userId`, devolvido por `requireCanonicalSessionProfile()`.
Os dois schemas do corpo são `.strict()` e **não têm campo algum de ator** — um
`updatedBy` enviado pelo cliente seria rejeitado pelo parse antes de chegar ao
banco. Grants confirmados depois no schema efetivo (§4).

---

## 2. Vocabulário

```text
article_cover · article_block · script_scene · carousel_slide
ARTICLE_BREAK_SUPPORT = BLOCKED_BY_MISSING_STABLE_IDENTITY
```

Confirmado no CHECK efetivo do banco (§4). `article_break` não é valor aceito;
aparece apenas no `COMMENT ON COLUMN`, documentando a exclusão.

---

## 3. A primeira aplicação falhou — e por quê

```text
ERROR: 42703: column "superseded_at" does not exist
LINE 109:     AND superseded_at IS NULL
```

A seção que criava o índice único parcial vinha **antes** da seção que adiciona
`superseded_at`. Cada bloco estava correto isoladamente; só a **ordem entre
eles** estava errada — que é exatamente o tipo de defeito que revisão de texto
não encontra e execução encontra na primeira tentativa.

### 3.1 O que o rollback preservou

O arquivo inteiro está dentro de `BEGIN ... COMMIT`, então a falha desfez tudo.
Conferido antes de qualquer correção:

```text
colunas_novas_presentes = []
indices                 = [pkey, brand_document_idx]          (os de antes)
role_check              = cover, breath, storyboard, slide     (o de antes)
rpc_existe              = 0
m3_no_historico         = 0
m1, m2                  = 1, 1                                 (intactas)
linhas_media            = 0
documentos              = 1                                    (o do usuário)
```

**O banco ficou exatamente como estava.** É o que justifica envolver migration
em transação: uma falha no meio não deixa schema pela metade.

### 3.2 A correção

O bloco do índice passou para depois das colunas de retenção. Nenhuma outra
mudança de conteúdo — mesmas colunas, mesmos CHECKs, mesma RPC. A reaplicação
passou sem erro.

Isto é o quarto defeito bloqueante encontrado nesta frente, e o único que a
leitura não pegou. Registrei o porquê no próprio arquivo, junto do bloco movido.

---

## 4. Readback do schema efetivo

| Ponto | Resultado |
| --- | --- |
| `anchor_kind`, `anchor_ref` | `text`, nuláveis |
| `replaced_by_asset_id`, `superseded_at`, `purge_after` | `uuid`/`timestamptz`, nuláveis |
| CHECK de par de âncoras | `(ambos NULL) OR (ambos NOT NULL e ref não vazia)` |
| CHECK de `anchor_kind` | os quatro valores, sem `article_break` |
| CHECK de `role` | `cover, breath, storyboard, slide, article_block` |
| CHECK de retenção | `purge_after = superseded_at + '48:00:00'` |
| `file_state_check` | **intacto**, como projetado |
| índice único parcial | `(marca_id, document_id, anchor_kind, anchor_ref) WHERE anchor_kind NOT NULL AND superseded_at IS NULL AND status IN (uploaded, reviewed)` |
| índice de purge | `(purge_after) WHERE superseded_at IS NOT NULL` |
| assinatura da RPC | `p_brand_id, p_old_asset_id, p_new_asset_id, p_actor_id` · SECURITY DEFINER |
| grants efetivos | anon `false` · authenticated `false` · public `false` · **service_role `true`** |
| triggers na tabela | só `writer_media_assets_touch_trg` (pré-existente) — **nenhuma nova** |
| `pg_cron` / `pg_net` | **0** |
| histórico | M1 ✓ · M2 ✓ · **M3 ✓** · nada depois |
| `editorial_artifact_versions` | append-only original **intacto** |

O histórico foi alinhado com `migration repair --status applied 20260918190200`,
o mecanismo oficial — nunca `db push`, que reaplicaria as ~76 migrations que
este projeto tem aplicadas sem registro.

---

## 5. Smoke da substituição

Fixture próprio, ids declaradamente falsos, dentro de `BEGIN ... ROLLBACK`. A
marca e o usuário reais entram **apenas para satisfazer FK**; nenhuma linha do
usuário foi lida como sujeito, alterada ou usada.

```text
1. briefing do sucessor       → anchor NULL, status prompt_ready, sem arquivo   PASS
2. "upload"                   → uploaded + storage_path + file_hash, SEM anchor  PASS
3. ancorar o predecessor      → article_block / bloco-fixture-7
4. writer_replace_media_asset → recibo com anchorKind, anchorRef, purgeAfter
5. reler as duas linhas       → oito vereditos
6. repetir o mesmo par        → unchanged: true, MESMA janela
```

```text
SUCCESSOR_HAS_ANCHOR = YES
PREDECESSOR_KEEPS_HISTORICAL_ANCHOR = YES
PREDECESSOR_SUPERSEDED = YES
PREDECESSOR_REPLACED_BY_SUCCESSOR = YES
PURGE_AFTER_EQUALS_SUPERSEDED_PLUS_48H = YES
EXACTLY_ONE_CURRENT_ASSET_PER_ANCHOR = YES
SUCCESSOR_NOT_SUPERSEDED = YES
UPDATED_BY_REGISTRA_O_ATOR = YES
```

Os timestamps do recibo confirmam a aritmética sem margem:
`supersededAt 2026-09-19T01:09:08.054001+00` →
`purgeAfter 2026-09-21T01:09:08.054001+00`.

A repetição devolveu `unchanged: true` com **exatamente os mesmos** `supersededAt`
e `purgeAfter` — a janela não se moveu, que é o ponto da idempotência aqui.

### 5.1 O que este smoke não exercita

O upload ao Storage e o readback do arquivo. Isso é caminho de aplicação
(`uploadWriterMediaAsset`), não de SQL, e a M3 não o altera. O que o SQL confere
é o **rastro** que aquele caminho deixa — `uploaded` com `storage_path` e
`file_hash` preenchidos —, que é o que a RPC exige.

---

## 6. Smoke de rollback

Quatro substituições inválidas, cada uma num savepoint próprio:

| Tentativa | Recusa |
| --- | --- |
| sucessor sem arquivo | `media_successor_not_confirmed` |
| sucessor de outro documento | `media_document_mismatch` |
| substituir por si mesmo | `media_self_replace` |
| marca errada | `media_old_not_found` |

A última é a prova de isolamento: o ativo **não é alcançável** por outra marca —
não existe para ela.

Depois das quatro falhas:

```text
PREDECESSOR_CONTINUA_ATUAL = YES
  anchor_kind = article_block · anchor_ref = bloco-rollback-1
  superseded_at = null · purge_after = null · replaced_by_asset_id = null
candidato_sem_arquivo_nao_ancorou = YES
candidato_de_outro_doc_nao_ancorou = YES
```

---

## 7. Nada ficou para trás

```text
media_assets_total     = 0
documentos_total       = 1     (o do usuário, intocado)
fixtures_remanescentes = 0
ativos_em_janela       = 0
ativos_com_purge_after = 0
```

Nenhuma linha em janela de retenção, e nada para purgar — que é o estado
correto: `PURGE_IMPLEMENTED = NO` e nada apaga nada sozinho.

---

## 8. Suítes depois da aplicação

| Suíte | Baseline | Agora |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** |
| `test:redator` | 90/90 | **90/90** |
| `test:redator:mcp` | 2/2 | **2/2** |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** |
| `test:radar` | 2236/2236 | **2236/2236** |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** |

Com a M3 aplicada, `writerMediaAnchorAvailable()` passa a devolver `true` e
`listWriterMedia` começa a pedir as colunas de âncora. Conferido no navegador: o
Redator carrega, o seletor de posição lista capa e blocos, o painel contextual
aparece nomeando o bloco, uma `<header>` na página e a barra ainda com 40px.

---

## 9. O que continua fora

**Purga.** Não foi implementada nem executada. As funções CLAIM e CONFIRM
existem no banco, mas nenhuma rota as chama e `pg_cron` não está instalado. A
ausência de purge continua sendo o modo seguro.

**Respiro.** `article_break` segue sem identidade estável e fora do vocabulário.

**Homologação do fluxo real é sua.** Provei o contrato do banco com fixture e
provei que a tela carrega. Não registrei prompt, não subi imagem pelo Storage e
não troquei imagem pela interface. `VALIDADO_MANUALMENTE = não`.

---

```text
REPOSITORY_STABLE = YES
M3_DDL_APPLIED = YES
M3_SCHEMA_READBACK = PASS
MEDIA_REPLACEMENT_SMOKE = PASS
ROLLBACK_SMOKE = PASS
ARTICLE_BREAK_SUPPORTED = NO
PURGE_IMPLEMENTED = NO
REGRESSIONS = NONE — todas as suítes no baseline, tsc limpo, nenhuma linha do
              usuário tocada, nenhum dado de fixture persistido
FIRST_APPLY_ATTEMPT = FAILED (42703, ordem interna) — rollback completo, sem efeito
SECOND_APPLY_ATTEMPT = SUCCESS
```
