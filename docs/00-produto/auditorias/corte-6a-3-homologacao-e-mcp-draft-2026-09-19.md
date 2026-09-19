# Corte 6A.3 — readback da homologação UI e correção do MCP draft

**2026-09-19** · frente Redator · migration `20260919050000_m6_writer_mcp_article_draft_no_history.sql`

Duas frentes independentes. A primeira não deu o resultado esperado e o relatório
começa por ela.

---

## 1. A homologação pela tela não chegou ao banco

A rodada pedia readback dos efeitos do ciclo manual de finalização e reabertura.
A leitura, somente SELECT, sobre **todos** os `writer_deliverables` (sem filtro de
marca):

| | roteiro | carrossel |
| --- | --- | --- |
| `status` | `draft` | `draft` |
| `current_version_id` | `null` | `null` |
| `lock_version` | 2 | 2 |
| versões do entregável | 1 | 1 |
| `change_reason` da única versão | `'Rascunho inicial.'` | `'Rascunho inicial.'` |
| `updated_at` | **2026-09-19T03:21:30** | **2026-09-19T03:21:30** |

`03:21:30` é o instante em que a **normalização da M4** rodou — foi ela que levou
`lock_version` de 1 para 2 e anulou os ponteiros. A M5 entrou às **04:06**.

**Não existe no banco nenhuma linha com `change_reason = 'Finalização do
entregável.'`**, em marca nenhuma. Nem um save de rascunho posterior: os
`content_hash` dos entregáveis continuam idênticos aos das versões legadas de
01:48 e 01:50.

Um `finalize` bem-sucedido escreveria `status='approved'`, moveria
`current_version_id` e dispararia o trigger de `updated_at`. Um `reopen`
escreveria `status='draft'` e também tocaria `updated_at`. Um save alterado
mudaria `content_hash`. Nada disso aconteceu.

### 1.1 Não é o ambiente

Verificado contra o servidor de desenvolvimento em execução:

```text
/                             HTTP 200
/redator                      HTTP 307   (middleware redireciona ao login)
/api/redator/deliverables     HTTP 401   (GET sem sessão)
PATCH .../deliverables        HTTP 401   "Nao autorizado: sessao Supabase ausente."
```

A rota nova existe, compila e está protegida. O `PATCH` responde 401 — não 404 e
não 500.

### 1.2 O que isso significa para os marcadores

```text
SCRIPT_FINALIZATION_UI_E2E = NOT_EXECUTED
CAROUSEL_FINALIZATION_UI_E2E = NOT_EXECUTED
REOPEN_UNCHANGED_UI = NOT_EXECUTED
REFINALIZATION_CHANGED_UI = NOT_EXECUTED
```

**Não é `FAIL`.** `FAIL` diria que o ciclo rodou e deu errado, e isso seria uma
afirmação sobre um comportamento que ninguém observou. O que há é ausência de
evidência: nenhuma escrita chegou.

Não marquei `PASS` no que não aconteceu. O roteiro da homologação continua
válido e está na §8 do relatório do Corte 6A.2.

### 1.3 As invariantes que a leitura confirmou

Aproveitei o readback para afirmar por consulta o estado atual — todas
verdadeiras:

| Invariante | |
| --- | --- |
| versões legadas de rascunho fora do lifecycle M2 | ✓ |
| toda corrente é finalização canônica do próprio entregável | ✓ (vacuamente: não há corrente) |
| retenção só em quem foi de fato substituído | ✓ |
| nenhuma corrente em retenção | ✓ |
| toda janela aberta tem exatamente 48h | ✓ |
| nenhuma final com hash igual à predecessora | ✓ |

```text
PUBLICATION_REMAINS_SEPARATE = YES
```

`publication_records` = 0. A evidência forte dessa separação não vem daqui — vem
dos smokes da M4 e da M5, que atravessaram cinco finalizações e três reaberturas
sem criar nenhum registro.

---

## 2. Auditoria do MCP `save_writer_draft`

### 2.1 O defeito, confirmado no corpo efetivo

`writer_save_article_draft`, lida de `pg_proc` com os comentários removidos antes
de qualquer busca:

```text
insere_versao_sempre               true
move_corrente                      true
grava 'Rascunho salvo via MCP.'    true
tem_guarda_de_hash_igual           true    (save idêntico devolve unchanged)
tem_ramo_sem_versao                false   (não existe um createVersion aqui)
```

E `saveWriterArticleDraft` chamava `markArticlePredecessorSuperseded` logo depois,
com o `versionId` recém-criado — abrindo janela de 48h sobre o predecessor.

### 2.2 O caminho da tela já obedecia

```ts
// persistence-contracts.ts
createVersion: z.boolean().default(false)

// app/api/editorial/documents/route.ts
const version = input.createVersion ? await repository.createVersion(...) : null;
```

E no componente, `createVersionRef.current = true` aparece **uma vez só**: dentro
de `requestStatus`, que é o que `finalizeArticle` chama. `saveDraftNow` o desliga
explicitamente.

Evidência de dado: `content_documents.lock_version = 22` com **zero** linhas em
`content_document_versions`.

### 2.3 Por que foi preciso migration

A instrução era não fazer migration se o defeito fosse só de código. Não era: o
`INSERT` mora dentro da RPC.

Considerei a saída só-código — parar de usar a RPC e ir pelo repositório, como a
tela faz. **Descartei.** A RPC carrega a validação de ESCOPO
(`writer_draft_scope_invalid`), que compara o payload recebido contra o gravado
sob `FOR UPDATE`, garantindo que o MCP só toque `blocks`, `editorContent` e
`status`. Reimplementá-la em TypeScript viraria ler-comparar-escrever sem
atomicidade, e tiraria do banco uma autoridade que existe justamente para manter
o MCP honesto.

```text
MIGRATION_REQUIRED = YES
```

---

## 3. M6

Substitui **uma** função. Saem as três coisas que a M4 tirou do save do
entregável:

* o `SELECT` da última versão (que buscava a predecessora)
* o `INSERT` em `content_document_versions`
* o `current_version_id = v_version_id` no `UPDATE`

Ficam intactas: `FOR UPDATE`, guarda de aprovado, validação de escopo, atalho de
hash igual e optimistic lock.

O recibo passa a devolver `versionId` = a corrente que **já existia**. Isso
preserva a conferência de readback do chamador e lhe dá significado melhor: **o
save não mexeu no ponteiro**.

### 3.1 Não vira finalize implícito

A guarda `p_payload->>'status' IS DISTINCT FROM 'escrevendo'` continua, e o único
status que o `UPDATE` escreve é `'writing'`. O MCP segue sem poder aprovar
documento, e nenhuma autoridade nova de finalização foi criada para ele.

### 3.2 Pré-flight

| Guarda | Dispara quando |
| --- | --- |
| `m6_preflight_funcao_ausente` | a função não existe com a assinatura conhecida |
| `m6_preflight_ha_historico_de_mcp` | já existe versão com `'Rascunho salvo via MCP.'` |

A segunda é a que importa: zero foi o que a auditoria leu, e é o que torna esta
correção uma **prevenção**, não uma limpeza. Se aparecer alguma, a ferramenta foi
usada, há histórico indevido — possivelmente com retenção aberta — e alguém
precisa decidir o destino dele antes de mudar o comportamento que o produziu.

### 3.3 Mutantes

| Mutante | Morto por |
| --- | --- |
| a M6 volta a inserir versão | 04 |
| a M6 volta a mover o ponteiro | 04 |
| a guarda de escopo é enfraquecida | 04 |
| o save do MCP passa a aprovar o documento | 04, 05 |
| o pré-flight perde a guarda de histórico do MCP | 07 |
| o wrapper volta a marcar retenção no save *(TS)* | 06 |
| o contrato da tela passa a versionar por padrão *(TS)* | 01 |

Os dois últimos tocaram TypeScript que o dev server compila; cada um viveu ~3s,
era TypeScript válido, e os arquivos foram restaurados — `tsc` e a suíte
confirmaram depois.

Dois testes meus falharam durante a escrita e ambos por defeito meu, não do
código: um montava um `ContentDocument` incompleto à mão (trocado por asserção
sobre o campo do schema), e outro procurava a palavra `'approved'` no corpo da
função — reprovando a **guarda** que recusa editar documento finalizado. A prova
virou o que o `UPDATE` escreve, não a ausência da palavra.

---

## 4. Wrapper

`markArticlePredecessorSuperseded` saiu do caminho de save. Não há sucessora,
logo não há predecessora a reter — mantê-la seria pedir ao mecanismo de retenção
que marcasse a predecessora de uma versão que ninguém criou.

```text
MCP_DRAFT_CREATES_HISTORY = NO
MCP_DRAFT_CAN_START_RETENTION = NO
ARTICLE_UI_LIFECYCLE_UNCHANGED = YES
```

### 4.1 Uma consequência que a M6 tornou visível

Com a chamada removida, `markArticlePredecessorSuperseded` **ficou sem
chamador**. A finalização do Artigo, pela rota da tela, nunca chamou marcação
nenhuma. Ou seja:

> **Versões de artigo não entram em retenção.** Elas se acumulam, e nada abre a
> janela de 48h sobre a predecessora.

Isso **não é regressão da M6** — a rota da tela nunca marcou. É um buraco que a
M6 tornou visível ao remover o único chamador que existia. Corrigi-lo seria
alterar a finalização do Artigo, o que esta rodada proibiu explicitamente.

A função ficou onde está, com a explicação escrita no próprio corpo
(`lib/server/writer-retention.ts`), para que ninguém a leia como se estivesse em
uso.

---

## 5. Testes

`tests/redator-artigo-save-sem-historico.test.mts` — **8/8**, dentro de
`test:redator`.

| # | Natureza | Cobre |
| --- | --- | --- |
| 01 | COMPORTAMENTAL | o contrato da rota da tela nasce com `createVersion: false` |
| 02 | ESTRUTURAL | a rota da tela só versiona quando pedem, e nunca retém |
| 03 | ESTRUTURAL | autosave e "Salvar rascunho" mandam false; só `requestStatus` liga |
| 04 | ESTRUTURAL | M6: o save do MCP não versiona, não move o ponteiro, não retém |
| 05 | ESTRUTURAL | M6: `save_writer_draft` não vira finalize implícito |
| 06 | ESTRUTURAL | o wrapper do MCP não marca retenção |
| 07 | ESTRUTURAL | M6 substitui uma função e não toca em mais nada |
| 08 | ESTRUTURAL | o rollback repõe o versionamento e avisa que o wrapper vai junto |

Cobertura pedida, ponto a ponto:

| Pedido | Onde |
| --- | --- |
| UI save draft → 0 versões | 01, 02, 03 |
| MCP `save_writer_draft` → 0 versões | 04, smoke §6.2 |
| UI finalize → cria versão | 02, 03 (`createVersion: true` só em `requestStatus`) |
| MCP draft save com final existente → preserva `current_version_id` | smoke §6.2 |
| MCP draft save → não inicia retenção | 04, 06, smoke §6.2 |

---

## 6. Gate, aplicação e smoke

```text
REPOSITORY_STABLE = YES · 155s de silêncio contínuo
```

| Suíte | Baseline | Antes do DDL | Depois |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | **0** |
| `test:redator` | 207/207 | **215/215** | **215/215** |
| `test:redator:mcp` | 2/2 | **2/2** | — |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | — |
| `test:radar` | 2236/2236 | **2236/2236** | — |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | — |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | — |

Aplicada **somente** a M6, por `db query -f`, sem erro. Histórico alinhado por
`migration repair`:

```text
M1 ✓  M2 ✓  M3 ✓  M4 ✓  M5 ✓  M6 ✓     nenhuma migration remota depois da M6
```

### 6.1 Readback do corpo efetivo

| Verificação | |
| --- | --- |
| não insere em `content_document_versions` | ✓ |
| não move `current_version_id` | ✓ |
| não lê sequer a tabela de versões | ✓ |
| não menciona `superseded_at` nem `purge_after` | ✓ |
| guarda de escopo · guarda de aprovado · optimistic lock | ✓ ✓ ✓ |
| o único status que escreve é `'writing'` | ✓ |

### 6.2 Smoke, em transação abortada

Fixture própria na marca **Somatec Blocking**, copiando um documento existente
para não adivinhar constraints.

**Dois saves alterados pelo MCP, sem versão final anterior:**

```text
versões do documento   0
current_version_id     null
recibo versionId       null (nos dois saves)
```

**Um save do MCP com versão final já existente** — a final foi criada como a
rota da tela cria (INSERT + ponteiro), de propósito, porque é exatamente o que a
RPC não faz mais:

```text
current_version_id depois   = a final (inalterado)
versões do documento        1 (nenhuma nova)
recibo versionId            = a final
final entrou em retenção    NO
```

Tudo PASS. Depois do rollback: `content_document_versions` de volta a 0, fixture
inexistente, Somatec Blocking vazia, as 9 mídias da Care Glow intactas.

---

```text
SCRIPT_FINALIZATION_UI_E2E = NOT_EXECUTED (sem evidência no banco — ver §1)
CAROUSEL_FINALIZATION_UI_E2E = NOT_EXECUTED
REOPEN_UNCHANGED_UI = NOT_EXECUTED
REFINALIZATION_CHANGED_UI = NOT_EXECUTED
PUBLICATION_REMAINS_SEPARATE = YES

MCP_DRAFT_CREATES_HISTORY = NO
MCP_DRAFT_CAN_START_RETENTION = NO
ARTICLE_UI_LIFECYCLE_UNCHANGED = YES
MIGRATION_REQUIRED = YES
M6_APPLIED = YES

REMOTE_DATA_MODIFIED = NO
REGRESSIONS = NONE
```

### O que fica aberto

1. **§1** — a homologação pela tela, que não chegou ao banco. O ambiente está de
   pé e a rota responde; falta o ciclo ser executado com sessão.
2. **§4.1** — `ARTICLE_VERSION_RETENTION = NOT_WIRED`: versões de artigo nunca
   entram em retenção. Pertence ao lifecycle do Artigo.
3. `SCRIPT_PUBLICATION_HANDOFF` e `CAROUSEL_PUBLICATION_HANDOFF` seguem
   `NOT_IMPLEMENTED`, como no Corte 6A.2.
