# Pré-M3 — verificação da M2 e o ciclo de vida da mídia

**Data:** 2026-09-18
**Não executado:** M3, purge, DDL, deploy, commit, push. Nenhum DELETE de mídia.
**Executado:** somente leitura remota — `migration list` e `db query` com SELECTs.

---

## 1. Verificação read-only da M2

### 1.1 Histórico

`npx supabase migration list --linked`:

| Migration | Local | Remoto |
| --- | --- | --- |
| `20260918190000` (M1) | sim | **sim** |
| `20260918190100` (M2) | sim | **sim** |
| `20260918190200` (M3) | sim | **não** |

A última migration registrada no remoto é a própria M2. **Nada foi aplicado
depois dela** — logo, nenhuma migration posterior teve chance de alterar as
garantias auditadas abaixo.

Segue valendo o que a auditoria da M1 registrou: ~76 migrations do projeto estão
aplicadas e não registradas no histórico remoto, e quatro entradas são
remote-only (`20260918052851`, `20260918052858`, `20260918053128`,
`20260918183754`). Todas são **anteriores** à M2. Nada disso foi tocado.

### 1.2 Os sete pontos pedidos

| Ponto | Veredito | Evidência |
| --- | --- | --- |
| M2 registrada como aplicada | **PASS** | `m2_registrada = 1`, `posteriores_a_m2 = 0` |
| `writer_deliverables.current_version_id` existe | **PASS** | `uuid`, nullable |
| `superseded_at` / `superseded_by_version_id` / `purge_after` onde previsto | **PASS** | 7 de 7 colunas, nos dois lados |
| Triggers retention-aware só nas versões do Redator | **PASS** | `retention_aware_fora_do_redator = 0` |
| `editorial_artifact_versions` na função append-only original | **PASS** | trigger aponta para `pipeline_editorial_protect_append_only`; zero retention-aware |
| Nenhuma migration posterior alterou as garantias | **PASS** | nada registrado após `20260918190100` |
| Nenhuma versão corrente marcada para purge | **PASS (vacuidade declarada)** | ver §1.4 |

Detalhe do mapa de triggers, para o registro. A função compartilhada continua
protegendo seis tabelas; a retention-aware protege exatamente duas:

```text
pipeline_editorial_protect_append_only   → editorial_artifact_versions
                                           editorial_decision_events
                                           editorial_serp_reviews
                                           editorial_serp_snapshots
                                           editorial_version_status_events
                                           writer_mcp_call_events

pipeline_editorial_protect_retention_aware → content_document_versions
                                             writer_deliverable_versions
```

E o corpo da função compartilhada **não menciona** `superseded` nem `purge`:
a M2 criou uma função nova em vez de alterar a que o DNA usa, como projetado.

### 1.3 Um FAIL que era do meu teste, não do banco

O primeiro check perguntava *"estes NOMES de coluna existem em alguma outra
tabela?"* e acusou duas:

| Tabela | Coluna | Origem |
| --- | --- | --- |
| `minerador_keywords` | `purge_after` | `0046_minerador_keyword_delete_lifecycle.sql`, `0047_global_lifecycle_delete_recovery_purge.sql` |
| `radar_video_brief_extract_runs` | `superseded_at` | `20260914100000_radar_video_brief_extracts.sql` |

As duas são de **outros módulos**, nasceram antes da M2, e a M2 não menciona
nenhuma das duas tabelas (0 ocorrências no arquivo). Minerador e Radar estão
explicitamente fora do escopo desta retenção.

A pergunta certa é sobre o **contrato completo** — as três colunas juntas. Refeita:

```text
tabelas_com_o_contrato_completo  = [content_document_versions, writer_deliverable_versions]
acusadas_no_check_anterior       = minerador_keywords → [purge_after]
                                   radar_video_brief_extract_runs → [superseded_at]
gatilhos_de_retencao_nas_acusadas = 0
veredito                          = PASS
```

Nenhuma das duas carrega o contrato, e nenhuma tem gatilho de retenção do
Redator. **Não é divergência da M2.** Era um teste mal formulado, e ele está
corrigido no arquivo `2026-09-18-pre-m3-verificacao-2b-corrigida.sql`.

### 1.4 O que a verificação de purge NÃO prova

`content_document_versions` e `writer_deliverable_versions` têm **zero linhas**.

Então "nenhuma versão corrente está marcada para purge" é verdade, mas é verdade
por vacuidade: não há linha alguma para estar marcada. O que a consulta prova de
fato é que a estrutura está correta e que nada foi marcado indevidamente na
aplicação da M2 — e é isso que o marcador `EXISTING_ROWS_AUTO_SUPERSEDED = 0` da
auditoria anterior já dizia. Não trate como prova comportamental do lifecycle;
essa prova está nos testes de `lib/redator/version-lifecycle.ts`.

`pg_cron` **não está instalado**. Nada apaga nada sozinho.

---

## 2. O mapa do fluxo de mídia como ele é hoje

### 2.1 A tabela

`writer_media_assets`, criada em `20260918050959_writer_multiformat_mcp_foundation.sql`:

```text
id              uuid  PK
marca_id        uuid  NOT NULL → marcas
document_id     text  NOT NULL
deliverable_id  uuid  NULL
role            text  NOT NULL  CHECK IN ('cover','breath','storyboard','slide')
status          text  NOT NULL  CHECK IN ('prompt_ready','uploaded','reviewed')
objective       text  NOT NULL  não vazio
prompt          text  NOT NULL  não vazio
alt_text        text  NOT NULL  default ''
aspect_ratio    text  NOT NULL  não vazio
storage_path    text  NULL
mime_type       text  NULL
file_hash       text  NULL
created_by / updated_by / created_at / updated_at
```

Com dois FKs compostos que já garantem isolamento por marca:
`(document_id, marca_id) → content_documents` e
`(deliverable_id, marca_id, document_id) → writer_deliverables`.

E um CHECK pareado que já impede meia-verdade de arquivo:

```sql
(status = 'prompt_ready' AND storage_path IS NULL AND file_hash IS NULL)
OR (status IN ('uploaded','reviewed') AND storage_path IS NOT NULL
    AND file_hash IS NOT NULL AND mime_type IN ('image/png','image/jpeg','image/webp'))
```

**Não existem** `anchor_kind`, `anchor_ref`, `replaced_by_asset_id`,
`superseded_at` nem `purge_after`. Confirmado no remoto: as 17 colunas listadas
acima são todas.

### 2.2 O caminho completo, ponta a ponta

| Etapa | Onde | O que faz |
| --- | --- | --- |
| Briefing | `registerWriterMediaBrief` | INSERT com `status='prompt_ready'`, sem arquivo |
| Upload HTTP | `POST /api/redator/media-upload` | multipart, ≤10MB, valida `brandId` uuid e `assetId` uuid |
| Upload MCP | `attach_media_asset` | base64, valida alfabeto e múltiplo de 4 |
| Validação de formato | `verifiedImageMime` | **magic bytes**, não o content-type do cliente |
| Upload ao Storage | `storage.upload(..., { upsert: false })` | bucket `writer-media` |
| Readback | `storage.download(path)` | baixa de volta o que subiu |
| Hash | `sha256` dos bytes lidos vs. enviados | divergiu → `storage_hash_mismatch` (502) |
| Commit | UPDATE condicional `.eq("status","prompt_ready")` | guarda otimista |
| Readback do registro | confere `file_hash` devolvido | divergiu → `asset_readback_failed` (502) |
| Compensação | `storage.remove([path])` no catch | nenhum arquivo órfão após falha |

**Upload, validação de formato, hash e readback do Storage já existem e são
rigorosos.** Esta rodada não precisou inventá-los; precisou ligá-los a um anchor.

### 2.3 A associação atual, e por que ela não basta

Hoje a associação vive em **dois lugares diferentes**, com granularidades
diferentes:

1. `writer_media_assets.role` — `cover` · `breath` · `storyboard` · `slide`.
   Diz o *tipo* de imagem. **Não diz qual** bloco, cena ou slide.
2. `VisualBrief.assetId` dentro do payload do entregável — em
   `VideoScene.storyboard.assetId` e `CarouselSlide.visual.assetId`.
   Diz qual asset, mas a autoridade fica **dentro do payload versionado**.

O caminho 2 está em `lib/redator/multiformat-contracts.ts`, domínio do Redator —
não toca ArticleDNA, SiloDNA nem contratos do Arquiteto. Mas ele inverte a
direção: quem aponta é o conteúdo, não o ativo. Numa substituição, seria preciso
salvar uma nova versão do entregável só para trocar a imagem, e o vínculo
morreria junto com a versão anterior.

Para o **artigo** não existe nem isso: `metadata.plannedImages` é
`z.array(z.string())`, texto solto sem identidade.

### 2.4 Onde hoje se sobrescreve ou se toma 409

Levantamento direto do código:

| Situação | O que acontece hoje |
| --- | --- |
| Segundo upload no mesmo asset | **409 `asset_already_uploaded`** — "crie outro briefing" |
| Mesmo caminho no Storage | `upsert: false` → `storage_upload_failed` (503) |
| Dois uploads concorrentes no mesmo asset | O `upsert:false` serializa; o UPDATE condicional é a segunda barreira |
| Sobrescrever a imagem de um bloco/cena/slide | **Não existe caminho** |

O defeito não é sobrescrita — é o contrário. **Nada é sobrescrito, e por isso
nada é substituído.** A única saída oferecida pelo 409 é "crie outro briefing", e
o briefing novo nasce **sem qualquer vínculo com a posição** que o antigo ocupava.
O resultado prático é um ativo órfão e uma posição que continua com a imagem
velha, ou com nenhuma.

### 2.5 A UI atual

`modules/redator/writer-derived-environment.tsx` — e **só ela**. Um formulário
de prompt (papel, proporção, objetivo, prompt, alt) mais uma lista de ativos com
anexar. Consequências:

- existe apenas nos ambientes **Roteiro** e **Carrossel**; o ambiente **Artigo**
  não tem nenhuma superfície de mídia;
- o formulário é global do documento — escolhe-se um `role`, nunca **qual**
  bloco, cena ou slide;
- não há botão de substituir, porque não há operação de substituir.

### 2.6 As ferramentas MCP

| Ferramenta | Escopo | Observação |
| --- | --- | --- |
| `get_writer_deliverables` | leitura | devolve `media: listWriterMedia(...)` |
| `register_media_brief` | `writer.media.brief` | a descrição já avisa que **não** afirma que a imagem foi gerada |
| `attach_media_asset` | `writer.media.brief` | o servidor confere bytes e hash; o modelo não decide nada |

Nenhuma delas aprova, publica, apaga ou toca DNA. A autorização é do servidor,
por delegação — o modelo não escolhe marca nem ator.

### 2.7 Identidade estável, alvo por alvo

O ponto que a instrução mandou verificar antes de propor o anchor:

| Alvo | Identidade | Situação |
| --- | --- | --- |
| `article_block` | `ContentBlock.id` (`BlockBaseSchema`) | **estável** — inclui o tipo `image_brief` |
| `script_scene` | `VideoScene.id` | **estável** |
| `carousel_slide` | `CarouselSlide.id` | **estável** |
| `article_cover` | uma por documento | **estável por convenção**: `anchor_ref = documentId` |
| `article_break` | — | **BLOQUEIO — ver §2.8** |

### 2.8 Bloqueio registrado: o respiro não tem identidade

O `role='breath'` de hoje não referencia nada, e **não existe bloco de respiro**
no `ContentBlockSchema`: os catorze tipos são heading, paragraph, list, table,
quote, internal_link, external_source, CTA, image_brief, note, source,
product_block e comparison. `metadata.plannedImages` é lista de strings soltas.

Um respiro é uma imagem *entre* blocos. Ancorá-lo exigiria ou um bloco próprio
(alteração de `ContentBlockSchema`, que é contrato do Arquiteto — proibido nesta
rodada), ou uma convenção do tipo "depois do bloco X", que quebra quando X é
apagado e migra o respiro para o lugar errado sem avisar.

**Decisão:** `article_break` fica **fora** do vocabulário de anchor. O papel
`breath` continua existindo como está — briefing sem anchor, sem substituição
atômica — até que exista identidade estável para ele. Preferi bloquear a inventar
uma referência frágil que produziria troca silenciosa de posição.

### 2.9 Divergência entre a M3 escrita e o vocabulário desta rodada

O arquivo `20260918190200_m3_writer_media_anchor_lifecycle.sql`, escrito antes,
traz:

```sql
CHECK (anchor_kind IS NULL OR anchor_kind IN ('article_block', 'scene', 'slide'))
```

O vocabulário desta instrução é `article_cover`, `article_block`,
`article_break`, `script_scene`, `carousel_slide`. Os dois não batem: `scene` e
`slide` estão sem prefixo, e `article_cover` seria **rejeitado** pelo CHECK.

Como a M3 **não está aplicada**, alinhei o arquivo ao vocabulário desta rodada,
menos `article_break` (§2.8). O CHECK passou a ser:

```sql
CHECK (anchor_kind IS NULL OR anchor_kind IN
       ('article_cover', 'article_block', 'script_scene', 'carousel_slide'))
```

Nenhum DDL foi executado. O arquivo continua apenas escrito.

---

## 3. O pré-requisito de código da M3

### 3.1 As regras, separadas da execução

`lib/redator/media-anchor.ts` — puro, sem `server-only`, exercitável sem banco e
sem Storage. Mesmo desenho de `version-lifecycle.ts`, e pelo mesmo motivo: a
decisão precisa ser auditável separada de quem a executa.

```text
MEDIA_ANCHOR_KINDS   article_cover · article_block · script_scene · carousel_slide
BREATH_BLOCKED       breath — sem identidade estável (§2.8)
planMediaReplacement as sete validações, antes de qualquer I/O
mediaFileConfirmed   status + storage_path + file_hash, os três juntos
predecessorRetention superseded_at → purge_after = +48h
newMediaBriefAnchorState  { anchorKind: null, anchorRef: null }
```

A janela de 48h vem de `RECOVERY_WINDOW_HOURS` do módulo de versões, reexportado.
Duas constantes de 48 seriam duas verdades, e um dia divergiriam.

### 3.2 O I/O que obedece

`lib/server/writer-media-lifecycle.ts`:

- `writerMediaAnchorAvailable()` — sonda `anchor_kind`, cache de 60s. **Antes da
  M3 tudo devolve `unavailable`**, sem erro e sem mudar o que o Redator faz.
- `replaceWriterMediaAsset()` — lê o estado dos dois ativos **do servidor**,
  roda as validações, chama a RPC atômica, **relê** e só então reporta a janela.
- `anchorWriterMediaAsset()` — primeira ancoragem numa posição livre. Não é
  substituição e não abre janela: não há predecessor.

O readback confere três coisas antes de a janela ser legítima: o sucessor está
com a âncora, o predecessor perdeu a âncora, e o predecessor aponta para o
sucessor. Faltando qualquer uma, o desfecho é `readback_failed` e nada é
apresentado como sucesso.

### 3.3 A ordem, implementada

```text
registrar sucessor SEM âncora   registerWriterMediaBrief — nenhuma coluna de âncora
→ upload                        uploadWriterMediaAsset (já existia)
→ validar formato/hash          verifiedImageMime (magic bytes) + sha256
→ readback do Storage           storage.download + comparação de hash
→ substituição atômica          RPC writer_replace_media_asset
→ predecessor perde a posição   ┐ mesma transação
→ sucessor recebe a âncora      ┘
→ readback                      releitura dos dois ativos
→ janela de 48h                 purge_after = superseded_at + 48h
```

A âncora é o **último** passo. O teste 01 prova que o briefing não a carrega —
nem no contrato, nem no INSERT do servidor.

---

## 4. Autoridade de mídia

A associação mora em `writer_media_assets.anchor_kind` + `anchor_ref`, domínio
do Redator. **Nada foi adicionado** a ArticleDNA, SiloDNA ou contratos do
Arquiteto — o teste 16 lê `lib/arquiteto/contracts.ts` e prova a ausência de
`assetId`, `anchorKind` e `writer_media_assets`.

Uma correção que o mapa exigiu: o CHECK de `role` tinha quatro valores e nenhum
descrevia imagem dentro de bloco do artigo, o que tornaria `article_block`
inalcançável — não haveria briefing possível para ancorar. O valor foi
**acrescentado** no arquivo da M3 (nenhum removido, nenhuma linha existente passa
a violar), e o nome real do constraint foi confirmado por leitura remota:
`writer_media_assets_role_check`.

---

## 5. Substituição

Sete validações, com recusa **nomeada** — quem lê o log precisa saber qual
barrou, sem reproduzir o estado:

| Validação | Recusa |
| --- | --- |
| mesma marca | `brand_mismatch` |
| mesmo documento | `document_mismatch` |
| mesmo entregável | `deliverable_mismatch` |
| mesmo anchor | `anchor_divergent` |
| novo asset com arquivo confirmado | `successor_file_unconfirmed` |
| predecessor realmente atual | `predecessor_without_anchor`, `predecessor_not_current` |
| novo asset não superseded | `successor_already_superseded` |

Mais `same_asset`, que barra antes de tudo.

Elas rodam **duas vezes**: no servidor, contra o estado lido, para dar
diagnóstico específico; e dentro da RPC, sob lock, que é quem decide de verdade.

**Se a substituição falhar, o predecessor continua atual** — teste 04. Nenhum
caminho compensa falha apagando ativo válido: isso trocaria limpeza adiada por
perda de trabalho.

Repetir a substituição é recusado (`predecessor_without_anchor`), que é a forma
idempotente aqui: não reivindica a posição de novo e **não recalcula
`purge_after`**, o que esticaria a janela a cada clique — teste 06.

---

## 6. Purge

```text
M3_APPLIED = NO    PURGE_ROUTE = NO    CRON = NO    DELETE_MEDIA = NO
```

`pg_cron` não está instalado (§1.2). Nenhum caminho do código executa DELETE de
mídia — o teste 13 prova a ausência. A ausência de purge continua sendo o modo
seguro: o pior desfecho é guardar demais.

---

## 7. UI

`modules/redator/writer-media-anchor-panel.tsx`, montado no **painel lateral
direito** do Redator, acima do Guardião.

- **Não** é seção global "Prompts e imagens". Sem posição selecionada o
  componente devolve `null`.
- **Não** é barra horizontal. Conferido na tela: uma `<header>` na página, a
  GlobalTopbar, ainda com 40px.
- O seletor lista a capa e os blocos **deste** documento. Escolhida a posição, o
  painel fala só dela: o que a ocupa hoje e o que pode assumi-la.
- O botão de trocar **não aparece** sem os dois lados. Botão desabilitado
  convidaria a perguntar "por quê", e a resposta seria uma explicação de ordem
  que a própria tela deve dar.
- `unavailable` é apresentado como capacidade ausente, não como erro.

Verificado no navegador: escolher "Bloco · aqui tem que ir o h1" faz o painel
aparecer nomeando o bloco, dizendo que nada ocupa a posição e explicando a ordem.

O alvo é **derivado**, não sincronizado por efeito: guarda de qual documento é e
deixa de valer sozinho quando o documento muda. A leitura de ativos acontece sob
demanda, ao escolher a posição e após cada troca.

---

## 8. Testes

`tests/redator-media-anchor.test.mts` — 18 testes, **18/18**, incluído em
`test:redator`.

| Cobertura pedida | Teste |
| --- | --- |
| sucessor nasce sem anchor | 01 |
| upload sem readback não permite substituição | 02 |
| hash/readback válido permite | 03 |
| predecessor continua atual se falhar | 04 |
| exatamente um asset atual por anchor | 08 (índice único parcial) |
| substituição repetida é idempotente | 06 |
| janela de 48h só após troca confirmada | 07 |
| asset corrente nunca é purge candidate | 08 |
| isolamento por marca | 09 |
| artigo, roteiro e carrossel | 10 |
| contratos do Arquiteto/Radar intocados | 16 |

### 8.1 A bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `test:redator` | 68/68 | **86/86** | +18 novos |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos 7 arquivos tocados | — | **0 problemas** | 0 |
| `tsc` | limpo | **NÃO limpo — ver §8.2** | — |

### 8.2 O `tsc` quebrou por fora desta rodada

No início desta rodada `npx tsc --noEmit` estava limpo. No meio dela passou a
acusar 130 linhas de erro, depois 107, depois 57 — todas em arquivos de
**Minerador e Arquiteto**, nenhuma nos arquivos deste corte.

A causa está registrada por mtime: `lib/arquiteto/canonical-workspace.ts` foi
gravado às 21:36:16 e `lib/server/arquiteto-workspace.ts` às 21:36:23, segundos
depois de eu ter gravado `media-anchor.ts` (21:34) — arquivos que eu não toquei.
**Outra sessão estava editando o repositório em paralelo.** Os erros diminuindo
sozinhos ao longo da rodada indicam que ela seguia corrigindo o próprio trabalho.

Não mexi em nada disso: reverter arquivo sujo de outra sessão já custou 138
arquivos neste projeto uma vez.

O que posso afirmar: **zero erros de tipo nos arquivos deste corte**, verificado
por filtro por caminho. O que não posso afirmar é `tsc` limpo no repositório,
porque o repositório não estava estável enquanto eu trabalhava.

---

## 9. Dois pontos que ficam registrados

**O respiro continua sem âncora** (§2.8). É bloqueio declarado, não esquecimento:
ancorá-lo exigiria alterar `ContentBlockSchema`, que é contrato do Arquiteto.

**A homologação do fluxo real é sua.** Verifiquei na tela que o painel aparece na
posição certa, nomeia o bloco e não cria barra nova. Não registrei prompt, não
subi imagem e não troquei nada — e nem poderia: a M3 não está aplicada, então a
capacidade responde `unavailable`. `VALIDADO_MANUALMENTE = não`.

---

## 10. Arquivos

**Criados:**
```
lib/redator/media-anchor.ts                          regras puras
lib/server/writer-media-lifecycle.ts                 I/O, sonda de capacidade
app/api/redator/media-anchor/route.ts                anchor + replace
modules/redator/writer-media-anchor-panel.tsx        painel contextual
tests/redator-media-anchor.test.mts                  18 testes
supabase/scripts/2026-09-18-pre-m3-verificacao-m2-consolidada.sql
supabase/scripts/2026-09-18-pre-m3-verificacao-2b-corrigida.sql
```

**Alterados:**
```
supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql   (NÃO aplicada)
lib/redator/multiformat-contracts.ts                 papel article_block
lib/server/writer-deliverables.ts                    listagem ciente de âncora
components/editorial/professional-writer.tsx         seletor de posição + painel
package.json                                         suíte do Redator
```

**Não tocados:** banco (nenhum DDL), `editorial_artifact_versions`, DNA, Radar,
SERP, eventos MCP, Arquiteto, Minerador, Publicações.

---

```text
M2_REMOTE_RECHECK = PASS
M2_HISTORY_ALIGNED = YES
M3_CODE_READY = YES
SUCCESSOR_CREATED_WITHOUT_ANCHOR = YES
STORAGE_READBACK_REQUIRED = YES
ATOMIC_ANCHOR_TRANSFER = YES
SUPERSEDE_AFTER_MEDIA_READBACK = YES
M3_SCHEMA_APPLIED = NO
PURGE_IMPLEMENTED = NO
REGRESSIONS = NONE nas suítes. `tsc` sujo por edição concorrente de outra sessão
              em Minerador/Arquiteto; zero erros nos arquivos deste corte.
BLOQUEIO = article_break (respiro) — sem identidade estável
```
