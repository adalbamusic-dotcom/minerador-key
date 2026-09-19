# Corte 6A.4 — retenção M2 na finalização do Artigo

**2026-09-19** · frente Redator · **sem migration**

---

## 1. Auditoria — a causa era mais fundo que a chamada faltando

O defeito relatado: `FINAL_A → editar → FINAL_B`, com B virando a última versão e
A sem `superseded_at`, `superseded_by_version_id` e `purge_after`.

### 1.1 O caminho real da finalização do Artigo

Não é o mesmo do entregável, e não há RPC:

```text
professional-writer.tsx
  requestStatus("aprovado")          → createVersionRef.current = true
  finalizeArticle = () => requestStatus("aprovado")
        ↓
PATCH /api/editorial/documents       (createVersion: true)
        ↓
ContentDocumentRepository.save(...)        → UPDATE payload/hash/status
ContentDocumentRepository.createVersion(…) → INSERT em content_document_versions
```

`writer_save_article_draft` **não participa**: ela é do caminho MCP, e a M6 já a
corrigiu. Item 4 preservado — o save não foi tocado nesta rodada.

### 1.2 O que cada peça fazia

| Peça | Estado antes desta rodada |
| --- | --- |
| `createVersion` | insere a linha com `previous_version_id` = a última versão ✓ |
| `content_documents.current_version_id` | **ninguém escrevia** |
| RPC `writer_mark_document_version_superseded` | **existe e está completa** (M2) |
| `markArticlePredecessorSuperseded` | sem chamador desde a M6 |

### 1.3 A causa

A RPC da M2 tem esta guarda:

```sql
IF v_doc.current_version_id IS DISTINCT FROM p_successor_version_id THEN
  RAISE EXCEPTION 'retention_successor_not_current';
END IF;
```

Como `current_version_id` era sempre nulo, **a guarda nunca podia passar**. Antes
da M6 quem movia o ponteiro era `writer_save_article_draft` — e o fazia no
*save*, que é a hora errada. A M6 tirou isso, e não sobrou ninguém.

Ou seja: não faltava a chamada de marcação. Faltava alguém dizer **qual é a
corrente**.

---

## 2. Sem migration

```text
MIGRATION_REQUIRED = NO
```

A autoridade de banco que importa **existe e está correta**:
`writer_mark_document_version_superseded`, `SECURITY DEFINER`, só `service_role`,
com a guarda de sucessor-corrente e a janela de 48h.

O que faltava é orquestração. `current_version_id` é uma coluna comum da tabela
que o repositório **já atualiza** em `save()`. Conferido por leitura remota:

```text
content_documents · UPDATE na tabela            true
content_documents · UPDATE em current_version_id true
content_document_versions · INSERT/SELECT        true
RPC de retenção · exec service_role              true · anon false
```

O versionamento do artigo sempre morou do lado TypeScript — não existe RPC que
crie versão de artigo, ao contrário do entregável. Mover o ponteiro na mesma
camada que insere a versão **completa** o que já era daqui; não abre um segundo
caminho.

---

## 3. A correção

`lib/server/article-finalization.ts`, chamado pela rota só quando
`input.createVersion` é verdadeiro:

```text
inserir versão → mover ponteiro → READBACK → conferir → só então marcar A
```

A decisão continua nas regras puras já existentes —
`finalizationDecisionFromReceipt`, `verifyFinalizationReadback`,
`planRetentionAfterFinalization` —, as mesmas que o entregável usa. A execução
continua na RPC da M2.

### 3.1 Uma regra pura ganhou um parâmetro

`requestStatus("em_revisao")` **também** liga `createVersion`, e a coluna guarda
`in_review`. Forçar `approved` no readback reprovaria uma gravação correta e a
retenção seria pulada por um motivo inventado.

`verifyFinalizationReadback` passou a aceitar `expectedStatus`, com padrão
`"approved"` — os chamadores do entregável não mudaram, e o teste 12 prova que o
padrão não foi afrouxado.

### 3.2 Readback falho não derruba a requisição

A versão existe e a gravação do documento valeu. Dizer "falhou" mandaria quem
opera refazer algo que deu certo. O que não acontece é a retenção — falha
fechada, com o motivo visível em `version.retention`.

```text
RETENTION_AFTER_FINALIZE_READBACK_ONLY = YES
```

### 3.3 Marcação falha depois de B confirmada

`markArticlePredecessorSuperseded` **nunca lança** — devolve desfecho. B continua
corrente, A fica retida por mais tempo, e o desfecho volta no resultado. Não há
compensação: nada apaga B.

### 3.4 Um defeito que a leitura de grants evitou

`content_documents` tem `content_documents_touch_trg` →
`pipeline_editorial_touch_lock_version`. Mover o ponteiro é um `UPDATE`, logo
**incrementa `lock_version`**.

A rota devolvia `saved.lock_version` — o lock de *antes* do movimento. O cliente
guardaria um número já vencido e a **próxima gravação do usuário bateria em
conflito, logo depois de finalizar**. Seria uma regressão introduzida por esta
rodada.

O readback passou a trazer o lock, a orquestração o devolve em **todos** os
caminhos de retorno (inclusive os de recusa), e a rota responde
`version?.lockVersion ?? saved.lock_version`.

---

## 4. Finalização sem mudança — gap registrado, não corrigido

O botão da tela é `disabled={selected.status === "aprovado"}`, então pela
interface não dá para finalizar duas vezes. **A rota, porém, não compara
hashes**: um `PATCH` com `createVersion: true` e o mesmo conteúdo criaria uma
versão duplicada.

```text
GAP · ARTICLE_FINALIZE_NOT_IDEMPOTENT
A rota PATCH /api/editorial/documents não recusa uma segunda finalização com
conteúdo idêntico. Diferente do entregável, que a M5 resolveu na RPC, o artigo
não tem autoridade de banco para a finalização — a correção seria comparar o
hash contra a versão corrente antes de chamar `createVersion`. Não foi feita
aqui: item 3 pediu registrar, não inventar correção silenciosa.
```

**O que eu fiz foi impedir o pior efeito, não o gap.** Se uma duplicata for
criada, a predecessora teria hash idêntico à sucessora, e marcá-la condenaria
uma versão boa à exclusão por causa de um ato que não produziu nada. Há uma
guarda explícita antes da marcação:

```ts
const predecessorHash = await repository.versionContentHash(documentId, passo.predecessorVersionId);
if (predecessorHash !== null && predecessorHash === input.contentHash) {
  return { ...version, lockVersion: lido.lockVersion,
    retention: { status: "skipped", reason: "no_material_change" } };
}
```

Isso está dentro do escopo da rodada — "retenção somente no predecessor realmente
substituído" — e é o lado conservador do erro: na dúvida, não retém.

---

## 5. O save continua intocado

```text
ARTICLE_AUTOSAVE_CREATES_VERSION = NO
ARTICLE_SAVE_DRAFT_CREATES_VERSION = NO
ARTICLE_SAVE_CAN_START_RETENTION = NO
```

Sem `createVersion`, a rota faz o `save` e nada mais. O contrato mantém
`createVersion: z.boolean().default(false)`, e `createVersionRef.current = true`
aparece **uma vez só** no componente, dentro de `requestStatus`.

`markArticlePredecessorSuperseded` é chamado agora em **um único lugar**:
`finalizeArticleVersion`, depois do readback confirmado.

---

## 6. Testes

`tests/redator-artigo-save-sem-historico.test.mts` — **16/16**, dentro de
`test:redator`. Os 8 primeiros são do Corte 6A.3; os novos:

| # | Natureza | Cobre |
| --- | --- | --- |
| 09 | COMPORTAMENTAL | primeira finalização → A, sem predecessora a reter |
| 10 | COMPORTAMENTAL | refinalização com mudança → readback confirma B, e só então A |
| 11 | COMPORTAMENTAL | readback falho (as quatro formas) → A não é retida |
| 12 | COMPORTAMENTAL | `in_review` também versiona, e o padrão segue `approved` |
| 13 | ESTRUTURAL | a ordem dos seis passos, por índice no corpo da função |
| 14 | ESTRUTURAL | só a finalização marca; o save não |
| 15 | ESTRUTURAL | finalizar sem mudança material não retém a predecessora |
| 16 | ESTRUTURAL | o lock devolvido é o de depois do movimento do ponteiro |

Cobertura pedida, ponto a ponto:

| Pedido | Onde |
| --- | --- |
| save draft → 0 versões | 01, 02, 03 |
| first finalize → A | 09 |
| refinalize changed → `B.previous = A` | 10 (a cadeia vem de `createVersion`, teste 02) |
| readback B → A superseded | 10, 13 |
| readback failure → A não superseded | 11, 13 |
| unchanged finalize → nenhuma retenção indevida | 15 |
| save depois de final → não inicia retenção | 06, 14 |

### 6.1 Mutantes

| Mutante | Morto por |
| --- | --- |
| o readback falho deixa de barrar a marcação | 13 |
| o ponteiro deixa de ser movido | 13 |
| a guarda de conteúdo idêntico some | 15 |
| a rota versiona sempre, ignorando `createVersion` | 02, 14 |
| o padrão do readback deixa de ser `approved` | 09, 10, 11, 12 |
| a rota volta a devolver o lock velho | 16 |

Todos tocaram TypeScript que o dev server compila; cada um viveu ~3s, era
TypeScript válido, e os arquivos foram restaurados — `tsc` e a suíte confirmaram
depois.

Quatro testes meus falharam durante a escrita, todos por defeito meu: três
usavam `indexOf` no arquivo inteiro e achavam os nomes no bloco de `import` do
topo em vez do corpo da função — o que reprovava uma ordem correta e, pior,
aprovaria uma errada. A busca passou a ser no corpo.

---

## 7. Bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 215/215 | **225/225** | +10 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos arquivos tocados | — | **0 erros, 0 avisos** | — |

Nenhuma escrita remota nesta rodada: só leituras (`SELECT` de grants, triggers e
estado). Estado do banco inalterado — 1 documento, 0 versões de artigo, 0
ponteiros.

---

## 8. O que não foi exercitado

A finalização do Artigo pela tela não foi executada: chegar ao Redator exige
sessão, e não digito credenciais. O que os testes provam é a decisão e a ordem
escrita; o que a leitura de grants prova é que a escrita é permitida.

O primeiro `FINAL_A → editar → FINAL_B` real vai deixar traço conferível:
`content_documents.current_version_id` = B, e A com `superseded_at`,
`superseded_by_version_id` = B e `purge_after = superseded_at + 48h`. Quando
acontecer, eu confirmo por readback.

---

```text
ARTICLE_FINALIZE_RETENTION_INTEGRATED = YES
ARTICLE_SAVE_CAN_START_RETENTION = NO
RETENTION_AFTER_FINALIZE_READBACK_ONLY = YES
FIRST_FINALIZATION_SAFE = YES
REFINALIZATION_SAFE = YES
MIGRATION_REQUIRED = NO

ARTICLE_AUTOSAVE_CREATES_VERSION = NO
ARTICLE_SAVE_DRAFT_CREATES_VERSION = NO
ARTICLE_FINALIZE_CREATES_VERSION = YES
ARTICLE_CURRENT_VERSION_POINTER_WRITTEN = YES (era NO antes desta rodada)

REMOTE_DATA_MODIFIED = NO
REGRESSIONS = NONE
```

### O que fica aberto

1. ~~**§4** — `ARTICLE_FINALIZE_NOT_IDEMPOTENT`~~ — **fechado pelo Corte 6A.5**
   ([corte-6a-5-idempotencia-finalizacao-artigo-2026-09-19.md](corte-6a-5-idempotencia-finalizacao-artigo-2026-09-19.md)).
   A rota passou a reconhecer a finalização já feita antes de escrever e depois
   de um conflito de lock, sem migration.
2. **§8** — a homologação pela tela, do Redator e agora também do Artigo.
3. `SCRIPT_PUBLICATION_HANDOFF` e `CAROUSEL_PUBLICATION_HANDOFF` seguem
   `NOT_IMPLEMENTED`.
