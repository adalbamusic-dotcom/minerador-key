# Corte 6A.6 — fechamento da homologação, diagnóstico de mídia e identidade em Publicações

**2026-09-19** · frente Redator · **somente leitura, nenhum código alterado**

---

## 1. Readback — o que a homologação deixou gravado

Leitura às 05:10, sobre **todos** os `writer_deliverables` e `content_documents`
do banco (sem filtro de marca).

### 1.1 Roteiro e Carrossel

| | Roteiro (`video_script`) | Carrossel (`carousel`) |
| --- | --- | --- |
| `id` | `6a63f17f-…` | `25b9bf20-…` |
| `status` | **`approved`** | **`approved`** |
| `lock_version` | 5 | 5 |
| `current_version_id` | `06e8fc0f-…` | `e2121556-…` |
| total de versões | 2 | 2 |
| `content_hash` da corrente == do entregável | **true** | **true** |
| `updated_at` | 05:02:58.916762 | 05:02:37.758745 |

Cadeia completa, em cada um:

| `version_number` | `change_reason` | `previous` | `superseded_at` | `superseded_by` | `purge_after` | corrente |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `Rascunho inicial.` | NULL | NULL | NULL | NULL | não |
| 2 | `Finalização do entregável.` | **NULL** | NULL | NULL | NULL | **sim** |

O que isso confirma, com dado e não com tela:

* **salvar rascunho não versionou** — o lock foi de 2 (pós-normalização M4) a 5,
  e só existe **uma** versão final;
* **a finalização criou a versão final** e moveu o ponteiro;
* **a versão legada de rascunho não virou predecessora** e **não entrou em
  retenção** — exatamente `FIRST_FINAL_VERSION_PREVIOUS_ID = NULL` da M4;
* **o estado é durável**: `approved` está gravado e é o que
  `listWriterDeliverables` devolve ao abrir a tela.

```text
SCRIPT_DRAFT_SAVE_UI = PASS          CAROUSEL_DRAFT_SAVE_UI = PASS
SCRIPT_F5_PERSISTENCE = PASS         CAROUSEL_F5_PERSISTENCE = PASS
SCRIPT_FINALIZATION_UI = PASS        CAROUSEL_FINALIZATION_UI = PASS
```

### 1.2 O que ainda não chegou ao banco

`pipeline_editorial_touch_lock_version` grava `updated_at := now()` — timestamp da
**transação**. A RPC de finalização insere a versão e atualiza o entregável na
mesma transação, então ambos recebem o mesmo instante.

```text
carousel       updated_at 05:02:37.758745 · última versão 05:02:37.758745
video_script   updated_at 05:02:58.916762 · última versão 05:02:58.916762
diferença: 0.000000 s
```

**A última escrita foi a própria finalização.** Um `reopen` posterior seria um
`UPDATE` com timestamp maior; uma refinalização criaria uma terceira versão, ou —
no caminho B da M5 — um `UPDATE` de status posterior. Nenhum dos dois existe, e o
estado às 05:10 é byte a byte o de 05:07.

```text
REOPEN_UNCHANGED_UI = NOT_EXECUTED
  UNCHANGED_CREATED_NEW_VERSION = NO (vacuamente: o caminho não rodou)
  UNCHANGED_STARTED_RETENTION = NO (idem)

REFINALIZATION_CHANGED_UI = NOT_EXECUTED
  NEW_VERSION_PREVIOUS_CORRECT = NOT_EXECUTED
  PREDECESSOR_RETENTION_48H = NOT_EXECUTED
  CURRENT_VERSION_HAS_PURGE_AFTER = NO (nenhuma versão tem)
```

### 1.3 Artigo

```text
id            redator:09762023-…:article-candidate:territory:9da03dd0-…:e42cd892-…
status        writing            payload.status  escrevendo
lock_version  22                 current_version_id  null
content_document_versions  0     updated_at  2026-09-19T03:13:53.012452Z
```

`03:13:53` é anterior à própria aplicação da M4 (03:21:30). Uma finalização
deixaria três traços simultâneos — `status='approved'`, ponteiro preenchido e uma
linha de versão. Nenhum existe.

```text
ARTICLE_FINALIZATION_UI_E2E = NOT_EXECUTED
ARTICLE_CURRENT_POINTER = NOT_EXECUTED
ARTICLE_LOCK_AFTER_FINALIZE = NOT_EXECUTED
ARTICLE_REFINALIZATION_RETENTION = NOT_EXECUTED
```

### 1.4 Invariantes e Publicações

Todas verdadeiras por consulta: sem duplicata de hash, corrente válida e não
retida, retenção só em substituído, janelas de 48h, legadas intocadas, nenhuma
versão `Rascunho salvo via MCP.`.

```text
PUBLICATION_RECORD_CREATED_AUTOMATICALLY = NO
```

Agora com evidência **real**: duas finalizações de verdade pela interface, às
05:02:37 e 05:02:58, e `publication_records` continua em zero.

---

## 2. O upload de imagem — causa raiz identificada

### 2.1 O mecanismo

Em `modules/redator/writer-derived-environment.tsx`:

| linha | |
| --- | --- |
| 244 | `<fieldset ... disabled={finalizado}>` |
| 282-283 | `<section data-cena onFocusCapture={() => setCenaSelecionada(parte.id)}>` — **dentro** do fieldset |
| 377 | `</fieldset>` |
| 380-382 | `<aside>` com o painel de mídia — **fora** do fieldset |

`onFocusCapture` é o **único** caminho para `cenaSelecionada`. Elemento
desabilitado **não dispara eventos de foco**. Então, com o entregável
finalizado:

```text
fieldset disabled → nenhum input recebe foco → cenaSelecionada continua ""
                  → targets = alvos.filter(a => a.ref === "") = []
                  → o aside mostra "Selecione uma cena para trabalhar a mídia dela"
                  → e não existe cena selecionável
```

O painel (linha 83) ainda devolve `null` quando `targets.length === 0`, mas nem
chega a ser montado: o `aside` já cai no texto de estado vazio.

**Resultado: um beco sem saída silencioso.** Nenhum erro, nenhum toast, nenhuma
explicação — só uma instrução impossível de cumprir.

### 2.2 A evidência que confirma

```text
writer_media_assets · status distintos  →  ["uploaded"]
```

Os 9 ativos estão todos `uploaded`. **Não existe nenhuma linha `prompt_ready`.**
Se a tentativa tivesse chegado ao painel e registrado um briefing, haveria uma —
`registerWriterMediaBrief` insere com `status: "prompt_ready"` antes de qualquer
byte subir.

A tentativa **nunca passou da seleção de cena**. Não foi MIME, não foi Storage,
não foi hash, não foi anchor, não foi permissão, não foi a M3.

### 2.3 Vale igual para os dois

O mesmo `fieldset` envolve cenas e slides — a tela é a mesma, com
`ehRoteiro` decidindo só os rótulos. `script_scene` e `carousel_slide` falham
pelo mesmo motivo.

### 2.4 Um segundo defeito, que a mesma auditoria encontrou

**O backend de mídia não tem guarda de `approved`.**

`registerWriterMediaBrief` valida apenas `documentForBrand(brandId, documentId)`.
Nem ela, nem `uploadWriterMediaAsset`, nem a rota `media-anchor` olham o `status`
do entregável.

Consequência: se `cenaSelecionada` tivesse sido preenchida **antes** de
finalizar, o estado do React sobrevive ao `load()`, o painel continuaria montado
— e o upload **teria sido aceito** num entregável finalizado. A leitura-somente
do finalizado hoje é garantida só pelo `fieldset`, e o painel está fora dele.

### 2.5 Veredito

```text
SCRIPT_SCENE_UPLOAD = FAIL
CAROUSEL_SLIDE_UPLOAD = FAIL

MEDIA_UPLOAD_ROOT_CAUSE =
  A seleção de cena depende exclusivamente de `onFocusCapture`, e as cenas ficam
  dentro do `<fieldset disabled>` quando o entregável está finalizado. Elemento
  desabilitado não emite foco, então `cenaSelecionada` nunca é preenchida e o
  painel de mídia — que vive FORA do fieldset — nunca recebe alvo. A tela pede
  "selecione uma cena" sem oferecer forma de selecionar. Falha silenciosa de
  alcançabilidade na UI.

  Defeito acoplado: o backend de mídia não recusa entregável `approved`, então a
  leitura-somente do finalizado não é garantida no servidor.

MIGRATION_REQUIRED = NO   (é UI + guarda de servidor, não schema)
```

**A recusa seria correta; o beco sem saída não é.** Item 2 do brief diz que a
tela finalizada deve continuar somente leitura, e que uma recusa pós-finalização
pode estar certa desde que explicada. Hoje não há recusa nem explicação — e, pior,
o servidor aceitaria.

Não corrigi nada: esta rodada é de leitura.

---

## 3. Publicações — por que Roteiro e Carrossel não aparecem

### 3.1 O schema efetivo

```text
publication_records
  id · marca_id · article_id · content_plan_version_id · document_id
  status · published_url · slug · canonical · content_hash · payload
  lock_version · created_by · updated_by · created_at · updated_at

UNIQUE (marca_id, article_id)
FK document_id → content_documents(id)
```

Busca por qualquer coluna com `deliverable`, `kind`, `source` ou `type` no nome:

```text
[]
```

**Nenhuma.** Não existe discriminador.

### 3.2 As três paredes

1. **`UNIQUE (marca_id, article_id)`** — cabe **uma** linha por artigo por marca.
   Artigo, Roteiro e Carrossel do mesmo artigo colidiriam nessa constraint.
2. **`document_id` tem FK para `content_documents`** — um `writer_deliverables.id`
   não pode sequer ser gravado ali.
3. **Não há coluna de tipo** — mesmo que coubessem três linhas, nada diria qual é
   qual.

### 3.3 A projeção reforça a mesma identidade

`lib/publicacoes/editorial-library.ts`:

```ts
/** É o `documentId`. Uma linha por documento — a garantia de não duplicar. */
documentId: string;
```

A biblioteca agrupa `publication_records` **por `documentId`**, uma linha por
documento. Os filtros (`ENTREGUES`, `RECEBIDO`, `PUBLICADO`, `NAO_ENTREGUE`) são
todos do eixo de entrega, e nenhum conhece tipo de saída.

### 3.4 Resposta à pergunta central

> Como Publicações representa Artigo, Roteiro e Carrossel derivados do mesmo
> ContentDocument, sem colidir identidade?

**Hoje: não representa.** A identidade de Publicações é o documento, e o
documento é o Artigo. Roteiro e Carrossel não têm como existir ali — não por
falta de código, mas por falta de lugar no modelo.

```text
SCRIPT_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
CAROUSEL_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
PUBLICATIONS_DELIVERABLE_MIGRATION_REQUIRED = YES
```

Parei antes do DDL, como pedido.

### 3.5 O que a migration precisaria resolver

Levanto o que o audit mostrou, **sem escolher nomes** — isso é decisão da rodada
que fizer o DDL:

| Problema | O que precisa mudar |
| --- | --- |
| uma linha por artigo | a chave única precisa incluir o tipo de saída |
| `document_id` amarrado a `content_documents` | precisa de um jeito de apontar para `writer_deliverables` sem afrouxar a FK do artigo |
| nada distingue as saídas | um discriminador explícito, não inferido |
| a projeção agrupa por documento | o read model precisa de identidade composta |

**Uma observação do audit de mídia que importa aqui:** os 9 ativos têm
`deliverable_id` **NULL** — inclusive os 3 `carousel_slide` e os 2
`script_scene`. Hoje a mídia de um Roteiro só é identificável pelo
`anchor_kind`, não pelo vínculo com o entregável. Se o handoff tiver que levar a
mídia junto, esse vínculo precisa existir antes.

---

## 4. Regra de produto, registrada

```text
FINALIZE_CREATES_PUBLICATION_RECORD = NO
DELIVERY_REQUIRES_EXPLICIT_ACTION = YES
```

Finalizar é do Redator; entregar é a fronteira. `Entregues` mostra só o que foi
explicitamente entregue. `Ainda no Redator` pode mostrar o que existe e não foi
entregue — mas **distinguindo** Artigo, Roteiro e Carrossel, o que exige o
discriminador da §3.5.

**Não fingir que Roteiro e Carrossel vão junto com o Artigo entregue.** Hoje
`sendWriterToPublications` não lê `writer_deliverables` em lugar nenhum — é por
isso que o rótulo na barra diz **"Enviar artigo a Publicações"**, e ele continua
correto até existir backend.

```text
FAKE_DELIVERY_BUTTON_CREATED = NO
```

---

## 5. Direção do handoff, sem implementar

Uma autoridade conceitual só, recebendo o tipo de saída:

```text
Article   → content_document
Script    → writer_deliverable(kind = video_script)
Carousel  → writer_deliverable(kind = carousel)
```

Uma fronteira Redator→Publicações, não três algoritmos. O que hoje é específico
de artigo em `sendWriterToPublications` — origem Radar v2, `status='aprovado'`,
gates do Guardião — precisará ser separado entre "o que vale para toda saída" e
"o que é do artigo". Isso é desenho da próxima rodada, depois do DDL de
identidade.

---

## 6. O que falta executar

O Roteiro e o Carrossel estão **Finalizado**. Continuando de onde parou:

1. **Reabrir para edição** → lock a 6, ponteiro segue na versão 2;
2. **Finalizar** sem editar → "Finalizado na versão 2; nenhuma versão nova foi
   criada", lock a 7, nenhuma versão nova, versão 2 sem `superseded_at`;
3. **Reabrir** → editar uma cena → **Salvar rascunho** → **Finalizar** → versão 3
   com `previous` = versão 2; e só então a versão 2 com `superseded_at`,
   `superseded_by_version_id` = 3 e `purge_after = superseded_at + 48h`.

E o ciclo do **Artigo** inteiro, que não teve nenhum passo.

Sobre a mídia: enquanto o defeito da §2 não for corrigido, **anexar imagem a
Roteiro/Carrossel finalizado é impossível pela tela**. Para testar mídia agora, é
preciso estar em **Em redação** — reabra antes de tentar.

---

```text
SCRIPT_FINALIZATION_UI_E2E = PASS (primeira finalização) · restante NOT_EXECUTED
CAROUSEL_FINALIZATION_UI_E2E = PASS (primeira finalização) · restante NOT_EXECUTED
ARTICLE_FINALIZATION_UI_E2E = NOT_EXECUTED
REOPEN_UNCHANGED_UI = NOT_EXECUTED
REFINALIZATION_CHANGED_UI = NOT_EXECUTED
F5_PERSISTENCE = PASS
PUBLICATION_RECORD_CREATED_AUTOMATICALLY = NO

SCRIPT_SCENE_UPLOAD = FAIL
CAROUSEL_SLIDE_UPLOAD = FAIL
MEDIA_UPLOAD_ROOT_CAUSE = seleção de cena inalcançável com o fieldset desabilitado
                          (ver §2.5) · defeito acoplado: backend de mídia sem
                          guarda de `approved`
MEDIA_MIGRATION_REQUIRED = NO

SCRIPT_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
CAROUSEL_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
PUBLICATIONS_DELIVERABLE_MIGRATION_REQUIRED = YES

CODE_MODIFIED_THIS_ROUND = NO
REMOTE_DATA_MODIFIED = NO
CORTE_6A_EDITOR_LIFECYCLE_READY = NO
CORTE_6A_EDITOR_LIFECYCLE_READY_TO_CLOSE = NO
REGRESSIONS = NONE
```

### Por que ainda não fecha

1. Três dos cinco caminhos da homologação não foram exercitados (reopen,
   refinalização, e o Artigo inteiro).
2. O upload de mídia tem defeito de UI identificado e **não corrigido** — esta
   rodada era de leitura.
3. Publicações precisa de migration de identidade antes de qualquer handoff de
   Roteiro/Carrossel.
