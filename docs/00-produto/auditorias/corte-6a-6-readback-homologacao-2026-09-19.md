# Corte 6A.6 — readback da homologação real

**2026-09-19** · frente Redator · **somente leitura, nenhum código alterado**

A homologação aconteceu **em parte**. O que rodou, rodou certo — com evidência. O
que não rodou está nomeado abaixo, com o dado que sustenta a afirmação.

---

## 1. Roteiro e Carrossel — primeira finalização PASSOU

### 1.1 Estado observado

| | Roteiro (`video_script`) | Carrossel (`carousel`) |
| --- | --- | --- |
| `id` | `6a63f17f-c29f-496c-8f96-841e208bdfb3` | `25b9bf20-35c0-48ed-ae49-4a22b61e2acd` |
| `status` | **`approved`** | **`approved`** |
| `lock_version` | 5 | 5 |
| `current_version_id` | `06e8fc0f-4674-4a97-89cb-9dced2ae73ba` | `e2121556-34b6-4bba-8230-de74996a1159` |
| total de versões | 2 | 2 |
| corrente bate com o entregável | **true** | **true** |
| `updated_at` | 05:02:58.916762 | 05:02:37.758745 |

### 1.2 A cadeia de versões

Cada entregável tem **duas** linhas, e elas contam a história inteira:

| `version_number` | `change_reason` | `previous` | corrente? | retenção |
| --- | --- | --- | --- | --- |
| 1 | `Rascunho inicial.` | NULL | não | nenhuma |
| 2 | `Finalização do entregável.` | **NULL** | **sim** | nenhuma |

**Isto é a decisão canônica da M4 funcionando em produção.** A versão legada de
rascunho (`version_number = 1`) **não** virou predecessora da primeira final,
**não** entrou em retenção e continua exatamente onde estava. A primeira
finalização nasceu com `previous_version_id = NULL`, como
`FIRST_FINAL_VERSION_PREVIOUS_ID = NULL` determinava.

O `version_number = 2` vem de `max(version_number) + 1`, que conta a linha
legada. Esperado e inofensivo.

```text
FIRST_FINALIZATION_UI = PASS  (roteiro e carrossel)
LEGACY_DRAFT_NOT_PREDECESSOR = CONFIRMED
LEGACY_DRAFT_NOT_RETAINED = CONFIRMED
```

---

## 2. O que NÃO foi executado, e como sei

### 2.1 O dado que decide

`pipeline_editorial_touch_lock_version` grava `NEW.updated_at := now()` — o
timestamp da **transação**. `writer_deliverable_versions.created_at` tem o mesmo
default. Dentro da RPC de finalização, o `INSERT` da versão e o `UPDATE` do
entregável acontecem na mesma transação, logo recebem o mesmo instante.

```text
carousel       updated_at 05:02:37.758745 · última versão 05:02:37.758745
video_script   updated_at 05:02:58.916762 · última versão 05:02:58.916762

segundos entre elas: 0.000000   ·   escrita depois da última versão: false
```

**A última escrita no entregável foi a própria transação que criou a versão.**
Se tivesse havido um `reopen` depois, ele seria um `UPDATE` posterior e
`updated_at` seria maior. Se tivesse havido uma segunda finalização, ou existiria
uma terceira versão, ou — no caminho B da M5 — um `UPDATE` de status com
timestamp posterior.

Nada disso existe.

### 2.2 A aritmética do lock concorda

O lock estava em **2** depois da normalização da M4. Está em **5**. Cada `UPDATE`
incrementa 1, então houve **três** escritas, e a última foi a finalização.

Duas escritas antes dela — compatível com salvar rascunho duas vezes. Um `reopen`
sobre um entregável que já está `draft` retorna cedo, sem `UPDATE`, então não
consome lock.

### 2.3 Conclusão

```text
REOPEN_UNCHANGED_UI = NOT_EXECUTED
REFINALIZATION_CHANGED_UI = NOT_EXECUTED
```

Os passos 4, 5 e 6 do roteiro de homologação — **reabrir**, **finalizar sem
editar**, **editar e finalizar de novo** — não chegaram ao banco. Não há B, não há
`superseded_at` em lugar nenhum, não há janela de 48h aberta.

Não é `FAIL`: `FAIL` afirmaria que o caminho rodou e deu errado. Não rodou.

---

## 3. Artigo — nada foi executado

```text
id            redator:09762023-…:article-candidate:territory:9da03dd0-…:e42cd892-…
status        writing            payload.status  escrevendo
lock_version  22
current_version_id  null
content_document_versions  0
updated_at    2026-09-19T03:13:53.012452Z
```

`03:13:53` é **anterior à própria aplicação da M4** (03:21:30). O documento não é
tocado desde antes de qualquer uma das correções desta noite.

Uma finalização de artigo deixaria três traços simultâneos: `status = 'approved'`,
`current_version_id` preenchido e uma linha em `content_document_versions`.
**Nenhum dos três existe.**

```text
ARTICLE_FINALIZATION_UI_E2E = NOT_EXECUTED
ARTICLE_CURRENT_POINTER = NOT_EXECUTED (null, e nada foi finalizado)
ARTICLE_NEXT_SAVE_LOCK = NOT_EXECUTED
ARTICLE_DUPLICATE_FINAL_VERSION = NO (vacuamente: zero versões)
ARTICLE_RETENTION_ONLY_ON_REPLACED_VERSION = YES (vacuamente: zero retenções)
```

Os dois últimos são verdadeiros por ausência, não por prova. Registro assim para
que ninguém os leia como homologação.

---

## 4. As invariantes, afirmadas por consulta

Todas verdadeiras:

| Invariante | |
| --- | --- |
| artigo sem duas versões de mesmo hash | ✓ |
| entregável sem duas versões de mesmo hash | ✓ |
| toda corrente existe, é do próprio dono e não está retida | ✓ |
| toda corrente de entregável é `Finalização do entregável.` | ✓ |
| retenção só em quem foi substituído por sucessora existente | ✓ |
| toda janela aberta tem exatamente 48h | ✓ |
| versões legadas de rascunho fora do lifecycle M2 | ✓ |
| nenhuma versão com `Rascunho salvo via MCP.` | ✓ |

As duas de retenção e a de janela são **vacuamente** verdadeiras: não há nenhuma
versão em retenção ainda, porque nenhuma refinalização aconteceu.

---

## 5. Publicações — agora com evidência real

```text
publication_records = 0
```

Diferente das rodadas anteriores, isto **não** é mais vacuidade: duas
finalizações de verdade aconteceram pela interface, às 05:02:37 e 05:02:58, e
nenhum registro de publicação foi criado.

```text
PUBLICATION_AUTOMATIC = NO
```

As 9 mídias da Care Glow continuam intactas: 5 correntes, 4 em janela.

---

## 6. Persistência e lock

**Persistência.** O estado `approved` está gravado e é lido pelo mesmo
`listWriterDeliverables` que a tela usa ao abrir. O que observei é o dado
durável; não observei o recarregamento em si.

**Lock.** Os dois entregáveis estão em 5, coerente com as três escritas. A tela
chama `load()` depois de cada ação, então ela relê o lock do servidor em vez de
depender do recibo. Nenhum conflito seria observável no banco de qualquer forma —
o que se pode afirmar é que o estado é consistente.

Para o **Artigo**, o comportamento de lock corrigido no Corte 6A.4 (devolver o
lock de depois do movimento do ponteiro) continua **sem exercício real**.

---

## 7. O que falta para fechar o Corte 6A

Nenhuma correção foi feita nesta rodada, e nenhuma é necessária pelo que se
observou. Falta **executar**:

### Roteiro (e o mesmo no Carrossel)

Os dois já estão **Finalizado**. Continuando de onde parou:

1. **Reabrir para edição** → esperado: volta a **Em redação**, lock vai a 6,
   `current_version_id` **continua** a versão 2.
2. **Finalizar** sem editar nada → esperado: volta a **Finalizado** com
   "Finalizado na versão 2; nenhuma versão nova foi criada"; lock vai a 7;
   **nenhuma** versão nova; a versão 2 **sem** `superseded_at`.
3. **Reabrir** → editar uma cena → **Salvar rascunho** → **Finalizar** →
   esperado: versão 3 com `previous_version_id` = a versão 2; ponteiro na 3; e
   só então a versão 2 com `superseded_at`, `superseded_by_version_id` = a 3 e
   `purge_after = superseded_at + 48h`.

### Artigo

Abrir a aba **Artigo**, editar, **Salvar rascunho** (esperado: nenhuma versão),
depois **Finalizar artigo** (esperado: `status approved`, ponteiro preenchido,
primeira versão). Depois editar e finalizar de novo, para a versão B e a retenção
da A.

Quando rodar, eu confirmo por readback — os traços acima são todos conferíveis.

---

```text
ARTICLE_FINALIZATION_UI_E2E = NOT_EXECUTED
SCRIPT_FINALIZATION_UI_E2E = PARTIAL (primeira finalização PASS; reopen e refinalização não executados)
CAROUSEL_FINALIZATION_UI_E2E = PARTIAL (idem)
REOPEN_UNCHANGED_UI = NOT_EXECUTED
REFINALIZATION_CHANGED_UI = NOT_EXECUTED
F5_FINALIZED_PERSISTENCE = PASS (estado durável observado; o recarregamento em si não)
LOCK_AFTER_FINALIZATION = PASS no entregável · NOT_EXECUTED no artigo
PUBLICATION_AUTOMATIC = NO (com evidência real: duas finalizações, zero registros)

FIRST_FINALIZATION_UI = PASS
LEGACY_DRAFT_NOT_PREDECESSOR = CONFIRMED
LEGACY_DRAFT_NOT_RETAINED = CONFIRMED
DUPLICATE_FINAL_VERSION = NO
RETENTION_ONLY_ON_REPLACED_VERSION = YES (vacuamente)

CODE_MODIFIED_THIS_ROUND = NO
REMOTE_DATA_MODIFIED = NO
CORTE_6A_READY_TO_CLOSE = NO
```

`CORTE_6A_READY_TO_CLOSE = NO` porque três dos cinco caminhos da homologação não
foram exercitados. O relatório canônico do Corte 6A **não** foi atualizado para
"fechado" — seria carimbar como homologado o que ainda não rodou.
