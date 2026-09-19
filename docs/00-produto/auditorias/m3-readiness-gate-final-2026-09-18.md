# Gate final pré-M3 — auditoria do SQL e estabilização do repositório

**Data:** 2026-09-18
**Não executado:** M3, purge, DDL, deploy, commit, push. Nenhum DELETE de mídia.

Este gate encontrou **cinco divergências**, duas delas bloqueantes — a
substituição teria falhado em 100% das tentativas reais. Todas foram corrigidas
nos arquivos, sem aplicar nada.

---

## 1. Estabilidade do repositório

### 1.1 A outra sessão ainda estava trabalhando quando esta rodada começou

| Hora | Evento |
| --- | --- |
| 21:47:57 | gravação em `modules/minerador/minerador-workspace.tsx` |
| 21:48:50 | primeira verificação — atividade a menos de 1 minuto |
| 21:49:18 | `lib/editorial/pipeline-repositories.ts` |
| 21:49:23 | `lib/arquiteto/arquiteto-backup-restore.ts` |
| 21:51:42 | `components/editorial/dna-panels.tsx` |
| 21:54:11 | `modules/minerador/minerador-workspace.tsx` — **ainda ativa** |

Armei um watcher que só reporta quando o estado muda e sai após 150s
consecutivos sem gravação fora do Redator. Ele acusou **atividade retomada**
duas vezes durante a rodada, então não apliquei nada e segui com o que não
dependia dela.

Ao fim desta rodada a outra sessão **não tinha terminado**: a última gravação
alheia foi 21 segundos antes da minha última medição. `REPOSITORY_STABLE = NO`,
e a M3 não deve ser aplicada até o silêncio.

### 1.2 O `tsc` voltou ao baseline

A rodada anterior fechou com 130 → 107 → 57 linhas de erro, todas em
Minerador/Arquiteto. **`npx tsc --noEmit` devolve 0 erros**, medido duas vezes —
21:53:36 e 21:54:32, esta última depois de uma gravação alheia às 21:54:11. Os
arquivos que faltavam (`keyword-contextual-presentation`, o export
`applyHumanReviewEnrichment`) passaram a existir.

Duas leituras limpas não são o mesmo que estabilidade: elas dizem que o trabalho
alheio compila **neste instante**, não que ele acabou. A distinção importa porque
aplicar DDL durante um refactor alheio faz de qualquer erro posterior um enigma
de duas causas.

Não corrigi nada de outro módulo, conforme a instrução.

---

## 2. Reauditoria do arquivo FINAL da M3

### 2.1 Os doze pontos

| Ponto | Veredito | Onde |
| --- | --- | --- |
| `anchor_kind` e `anchor_ref` | **PASS** | colunas nuláveis + `anchor_pair_check` |
| um asset atual por anchor | **PASS** | `writer_media_assets_current_anchor_uidx` |
| sucessor pode nascer sem anchor | **PASS** | ambas nuláveis; par NULL/NULL é válido |
| transferência só pela operação atômica | **PASS com ressalva** | ver §2.3 |
| `superseded_at` só depois do sucessor confirmado | **CORRIGIDO** | ver D4 |
| `purge_after = superseded_at + 48h` | **PASS** | fixo no CHECK, não calculado por quem grava |
| corrente não é purge candidate | **PASS** | `superseded_at IS NULL` força `purge_after IS NULL` |
| isolamento por marca | **PASS** | `marca_id` na chave do índice e em todo `WHERE` |
| `role` expandido para bloco de artigo | **PASS** | `article_block` acrescentado, nenhum removido |
| ArticleDNA, SiloDNA, SERP, Radar, Arquiteto intocados | **PASS** | ver §2.2 |
| nenhum cron | **PASS** | 0 ocorrências no SQL efetivo |
| nenhum DELETE automático | **PASS** | o único DELETE é dentro do CONFIRM, que ninguém chama |

### 2.2 O SQL efetivo toca uma tabela só

Removendo comentários, os únicos objetos escritos são:

```text
ALTER TABLE public.writer_media_assets
CREATE UNIQUE INDEX writer_media_assets_current_anchor_uidx
CREATE INDEX writer_media_assets_purge_idx
UPDATE public.writer_media_assets      (dentro da RPC)
DELETE FROM public.writer_media_assets (dentro do CONFIRM de purga)
```

`pg_cron`, `editorial_artifact_versions`, `serp`, `article_dna`, `silo_dna` e
`radar_` aparecem **zero vezes** fora de comentário. Nenhum `CREATE TRIGGER`.

### 2.3 Ressalva sobre "transferência só pela operação atômica"

`anchorWriterMediaAsset` faz um UPDATE direto de `anchor_kind`/`anchor_ref`. Não
é transferência: é a **primeira** ancoragem, quando a posição está vazia e não
existe predecessor. Ela só passa com `anchor_kind IS NULL` na guarda otimista, e
se a posição já tiver dono o índice único devolve 23505 → `anchor_taken`.

Ou seja: **nenhum caminho tira a posição de quem a tem**, exceto a RPC.

---

## 3. As cinco divergências

### D1 · A RPC tinha três parâmetros; o código chamava com quatro — **bloqueante**

```text
SQL     writer_replace_media_asset(p_brand_id, p_old_asset_id, p_new_asset_id)
Código  rpc(..., { p_brand_id, p_old_asset_id, p_new_asset_id, p_actor_id })
```

PostgREST recusaria com PGRST202, e só na primeira substituição real.

**Corrigido** acrescentando `p_actor_id` à RPC. Não foi escolha de conveniência:
`updated_by` é NOT NULL, e sem atualizá-lo as duas linhas continuariam creditadas
a quem criou o briefing — a troca não deixaria rastro de quem a fez. Os GRANT e
REVOKE foram atualizados para `(uuid,uuid,uuid,uuid)`.

### D2 · A RPC aceitava sucessor já em janela de retenção

O código recusava (`successor_already_superseded`); o banco não. Dar a âncora a
quem já tem `purge_after` faria a posição apontar para algo agendado para sumir.
O índice único não pega este caso: ele exige `superseded_at IS NULL` para contar
como atual, então a linha ficaria com âncora **sem ser a atual de ninguém**.

**Corrigido** com `media_successor_already_superseded`, antes de qualquer escrita.

### D3 · O comentário da coluna omitia a capa

`COMMENT ON COLUMN anchor_kind` dizia "bloco do artigo, cena do roteiro ou slide
do carrossel" — sem `article_cover`, que o CHECK aceita. **Corrigido**, e passou
a registrar também por que `article_break` não entra.

### D4 · A ordem das escritas violaria o índice único — **bloqueante**

A RPC ancorava o sucessor **antes** de marcar o predecessor:

```text
2. UPDATE sucessor   SET anchor_kind = ..., anchor_ref = ...
4. UPDATE predecessor SET superseded_at = now(), purge_after = now() + 48h
```

Entre 2 e 4 existiam **duas linhas** com a mesma
`(marca_id, document_id, anchor_kind, anchor_ref)`, ambas com `superseded_at`
nulo e ambas com arquivo. O índice `writer_media_assets_current_anchor_uidx` não
é deferrable — `CREATE UNIQUE INDEX` não pode ser —, então ele recusaria o passo
2 com **23505 em toda substituição**.

**Corrigido** invertendo: o predecessor sai do índice primeiro, o sucessor entra
depois. Inverter não enfraquece nada, porque tudo é uma transação: a ordem entre
comandos não é observável de fora, e o que se observa é o estado commitado. Se a
ancoragem do sucessor falhar, o ROLLBACK devolve o predecessor intacto.

O que a invariante "predecessor só é marcado depois do sucessor confirmado"
protege é a **confirmação do arquivo** — upload, hash e readback do Storage —, e
ela continua acontecendo antes de qualquer escrita.

### D5 · O readback exigia algo que o SQL (corretamente) não faz — **bloqueante**

O código conferia `predecessor perdeu a âncora` e devolvia
`readback_failed: predecessor_manteve_ancora`. Mas a M3 **não apaga** a âncora do
predecessor, e está certa em não apagar: ela é o registro de onde ele vivia, e é
o que torna a recuperação dentro das 48h possível. Quem o tira do posto é
`superseded_at`.

Resultado: toda substituição bem sucedida seria reportada como falha.

**Corrigido** — o readback agora confere o que importa:

```text
sucessor está ancorado
sucessor está na MESMA posição que era do predecessor
predecessor tem superseded_at
predecessor declara replaced_by_asset_id = sucessor
```

### D6 · Dois testes codificavam as regras erradas

`redator-media-anchor` 22 exigia a ordem que produz 23505, e o 13 exigia o
readback do D5. Os dois foram corrigidos junto com a causa — não passavam por
acaso, passavam porque descreviam o defeito.

---

## 4. Vocabulário

```text
article_cover     ancora em document_id — uma capa por documento
article_block     ContentBlock.id — identidade estável, inclui image_brief
script_scene      VideoScene.id — identidade estável
carousel_slide    CarouselSlide.id — identidade estável
```

Nenhum outro alvo tem identidade estável comprovada no código. `plannedImages` é
`z.array(z.string())`, texto solto sem id, e por isso não vira anchor.

```text
ARTICLE_BREAK_SUPPORT = BLOCKED_BY_MISSING_STABLE_IDENTITY
```

Não inventei `anchor_ref` por posição, índice ou "depois do bloco X". O papel
`breath` continua válido como briefing; o que ele não ganha é âncora nem
substituição atômica.

---

## 5. Contrato código ↔ migration

O teste 20 compara o conjunto declarado no CHECK da M3 com `MEDIA_ANCHOR_KINDS`
e falha se divergirem. Os cinco lugares usam **uma fonte só**:

| Lugar | Como consome |
| --- | --- |
| `lib/redator/media-anchor.ts` | declara `MEDIA_ANCHOR_KINDS` |
| `lib/server/writer-media-lifecycle.ts` | reexporta, sem cópia |
| `app/api/redator/media-anchor/route.ts` | `z.enum(MEDIA_ANCHOR_KINDS)` |
| `modules/redator/writer-media-anchor-panel.tsx` | rotula os quatro |
| migration M3 | CHECK comparado pelo teste |

Papéis: o teste 21 compara `WriterMediaBriefSchema.shape.role.options` com o
CHECK de `role` e exige conjuntos iguais.

Assinatura da RPC: o teste 19 extrai os `p_*` da declaração e os `p_*` da
chamada e exige que sejam os mesmos — é o teste que teria pego o D1.

---

## 6. Testes

`tests/redator-media-anchor.test.mts` — **22/22**, dentro de `test:redator`.

| Confirmação pedida | Teste |
| --- | --- |
| briefing sucessor nasce sem anchor | 01 |
| upload sem readback não transfere anchor | 02 |
| hash/readback válido permite substituição | 03 |
| substituição é atômica | 13, 22 |
| exatamente um asset atual por anchor | 08, 22 |
| falha mantém predecessor como atual | 04 |
| substituição repetida é idempotente | 06 |
| janela de 48h só após troca confirmada | 07, 22 |
| asset atual nunca elegível para purge | 08, 22 |
| cross-brand recusado | 09 |
| `article_block` funciona com o novo `role` | 21 |
| `article_break` recusado/não suportado | 11, 20, 21 |

### 6.1 A bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | sujo (edição concorrente) | **0 erros** | baseline restaurado |
| `test:redator` | 86/86 | **90/90** | +4 (19-22) |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos arquivos tocados | 0 | **0** | 0 |

---

## 7. O que este gate NÃO prova

A M3 **não foi executada**. Provei coerência entre SQL, código e testes lendo os
três; não provei que o DDL aplica sem erro, porque isso exige aplicá-lo. O bloco
de readback pós-aplicação no fim da migration existe para essa parte.

O D4 é um bom lembrete de por que a distinção importa: era um defeito que só
aparece em execução, e foi encontrado por leitura porque o índice e a ordem das
escritas estavam no mesmo arquivo. Nem todo defeito desse tipo se deixa achar
assim.

`VALIDADO_MANUALMENTE = não`.

---

## 8. Arquivos

**Alterados (nenhum aplicado):**
```
supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql
  · p_actor_id na RPC, updated_by nas duas linhas, GRANT/REVOKE com nova aridade
  · media_successor_already_superseded
  · ordem das escritas invertida (D4)
  · COMMENT ON COLUMN corrigido
lib/server/writer-media-lifecycle.ts   readback corrigido (D5), replaced_by_asset_id lido
tests/redator-media-anchor.test.mts    +4 testes de contrato; 13 e 22 corrigidos
```

**Não tocados:** banco, Minerador, Arquiteto, Radar, Publicações, DNA, SERP.

---

```text
REPOSITORY_STABLE = NO
TSC_BASELINE_RESTORED = YES
M3_SQL_FINAL_REVIEW = PASS
CODE_SCHEMA_VOCABULARY_MATCH = YES
ARTICLE_BLOCK_ROLE_SUPPORTED = YES
ARTICLE_BREAK_SUPPORTED = NO
M3_READY_FOR_EXECUTION = NO
M3_SCHEMA_APPLIED = NO
ARTICLE_BREAK_SUPPORT = BLOCKED_BY_MISSING_STABLE_IDENTITY
```

`M3_READY_FOR_EXECUTION = NO` **não é sobre o SQL**, que passou. É sobre a
precondição: a outra sessão continuava gravando ao fim desta rodada. Com o
repositório em silêncio e um `tsc` limpo confirmado, o arquivo está pronto.
