# Biblioteca editorial unificada — Redator e Publicações no mesmo documento

**Data:** 2026-09-18
**Não executado:** DDL, SQL remoto, migration, deploy, commit, push, purge. **M3 não aplicada.**

---

## 1. Auditoria — o defeito, encontrado antes de mexer

### 1.1 Como Publicações lia

`modules/publicacoes/publications-workspace.tsx` montava as linhas de **duas** fontes:

```ts
const workflowRows = pipeline.operationalPublications.map(...)   // publication_records
const legacyRows   = pipeline.snapshot.briefings.map(...)        // briefings_artigos (legado)
const allRows = [...workflowRows, ...legacyRows];
```

E a aba `library` filtrava `["approved", "ready_to_export"]` **sobre essas linhas**.

**`content_documents` nunca era lido.** Com 1 documento no banco e 0 registros de publicação, a biblioteca ficava vazia enquanto o Redator mostrava o artigo — exatamente o sintoma relatado.

O efeito estrutural é pior que o visual: a lista de rascunhos do Redator virava a **única** lista que conhecia o trabalho em andamento. Uma biblioteca paralela implícita.

### 1.2 Como o Redator cria e carrega

`content_documents` **já é** a autoridade. O documento nasce pelo handoff do Radar (`sendRadarToWriter`), é lido pela rota de workspace e chega ao contexto como `pipeline.documents`. O autosave grava por `PATCH /api/editorial/documents` com lock otimista; `writer_save_article_draft` mantém `current_version_id`.

Nada disso precisava mudar — e não mudou.

### 1.3 Um campo que a leitura trazia e o contexto jogava fora

`PersistedDocumentSchema` sempre trouxe `updatedAt` e `contentHash` do servidor. O contexto guardava apenas `document` e `lockVersion`. Sem `updatedAt`, a biblioteca não teria como ordenar nem o Redator como dizer a que horas o servidor confirmou.

---

## 2. A correção

```text
PARALLEL_EDITOR_LIBRARY = NO
COPY_TO_PUBLICATIONS = NO
SAME_CONTENT_DOCUMENT = YES
NEW_EDITOR_LIST_TABLE = NO
NEW_PUBLICATION_DRAFT_COPY = NO
DUPLICATE_DOCUMENT = NO
```

### 2.1 Projeção, não cópia — `lib/publicacoes/editorial-library.ts`

Módulo **puro**, sem I/O. Recebe documentos e registros de publicação, devolve **uma linha por documento**:

```
document · current version · editorial status · origin · updated_at · publication status (quando houver)
```

Duas decisões que sustentam a regra:

- **O `id` da linha é o `documentId`.** Um documento com registro de publicação continua sendo uma linha. Duplicar é estruturalmente impossível, não é disciplina.
- **`PublicationRecord` enriquece, nunca substitui.** Ele continua representando publicação, agendamento e destino real.

Estados visíveis e sua origem:

| Estado | De onde vem |
| --- | --- |
| `PUBLICADO` | registro de publicação em `published` |
| `PRONTO` | `content_documents.status = 'aprovado'` |
| `RASCUNHO` | qualquer outro estado do documento |

A ordem importa e está testada: um documento aprovado **já publicado** é PUBLICADO, não PRONTO. Perguntar ao documento primeiro mostraria como "pronto para publicar" algo que já está no ar.

`PRONTO` reusa `status = 'aprovado'` em vez de inventar estado novo — o gate do Guardião já protege essa transição, e um estado paralelo teria de ser mantido em sincronia com ele para sempre.

### 2.2 Publicações passa a projetar

A aba **Biblioteca** deixou de filtrar registros e passou a renderizar a projeção, com filtro por `TODOS · RASCUNHO · PRONTO · PUBLICADO`. Cada linha abre `/{brandRef}/redator?documentId=…` — a rota **já aceitava** `documentId`, nada precisou ser criado.

As abas **Fila**, **Publicados** e **Atualizações** continuam lendo os registros de publicação, intocadas.

Registro de publicação **órfão** — sem documento — é deliberadamente ignorado pela projeção: não tem conteúdo para abrir no Redator, e inventá-lo como linha seria a mesma confusão que a correção veio desfazer.

### 2.3 Contexto expõe `documentUpdatedAt`

Campo aditivo em `BrandWorkspace`, preenchido do `updatedAt` que a leitura remota já trazia. Nenhuma tabela, nenhuma chamada nova.

### 2.4 Barra global e toolbar do documento

**Saíram da barra global:** estado, contagem de palavras, tela cheia e o atalho para Publicações. `actions: null`.

**Entrou a toolbar do documento**, logo abaixo das abas:

```
[Status]  17 palavras  Salvo no servidor às 20:19:30      [Tela cheia] [Salvar rascunho] [Finalizar artigo]
```

Dois lugares mostrando o estado do documento viram dois controles concorrentes, e quem opera deixa de saber qual manda. Por isso o rodapé perdeu **"Enviar para aprovação"** e **"Aprovar documento"**: a transição agora é uma só, chamada **Finalizar artigo**, e mora na toolbar. O rodapé mantém **"Enviar a Publicações"** — finalizar e entregar são atos diferentes.

### 2.5 Salvar rascunho e Finalizar

**`Salvar rascunho`** não abre um segundo caminho de gravação: monta a cópia a partir do editor, liga um *flush* e deixa o **mesmo autosave** disparar imediatamente. Dois caminhos de escrita para o mesmo documento divergiriam no primeiro campo novo.

- persiste pelo `PATCH` com lock otimista — o mesmo de sempre;
- o readback é o da rota, que devolve `lockVersion` confirmado;
- **não cria versão**: `createVersion` fica desligado em rascunho, então salvar duas vezes o mesmo conteúdo não produz versão nova **por construção**, não por comparação;
- o horário só aparece quando a resposta volta OK. "Salvo" sobre uma gravação que falhou é pior que nenhum aviso.

**`Finalizar artigo`** reusa `requestStatus("aprovado")`, que já recusa com achado bloqueante do Guardião. Muda o estado do **mesmo** `content_document`: não publica, não copia, não cria outro documento. Publicações passa a mostrá-lo como PRONTO porque projeta esse documento.

---

## 3. Testes

`tests/redator-publicacoes-biblioteca.test.mts` — **14/14**, registrado em `test:redator`.

**COMPORTAMENTAL (01-09)**, exercitando a projeção de verdade: rascunho aparece sem registro; aprovado vira PRONTO; publicado vence; registro enriquece sem duplicar; publicação de outra marca não vaza; registro órfão não vira linha; origem declarada; `updated_at` e versão corrente; destino sempre o Redator no mesmo documento.

**ESTRUTURAL (10-14)**: a biblioteca consome `content_documents`; a projeção é leitura pura (sem `insert`, `upsert` ou `fetch`); a barra global não tem ações; a toolbar existe **depois** das abas com os seis elementos; salvar e finalizar reusam o caminho existente.

### 3.1 Dois testes anteriores precisaram ser atualizados

Ambos em `tests/operational-flow.test.mts`, e ambos porque descreviam a UI que este corte mudou:

1. exigia o rótulo `Aprovar documento` — virou `Finalizar artigo`, na toolbar.
2. `assertRadarIsTheOnlyWriterEntry` localizava a barra global por `data-redator-topbar-actions` para conferir que o Planejador não estava lá. Com `actions: null` **não existe barra de ações onde ele possa voltar** — a garantia ficou mais forte, e a checagem passou a olhar a toolbar.

### 3.2 Resultado, comparado ao baseline

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** | 0 |
| `test:redator` | 46/46 | **60/60** | +14 novos |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 — 4 falhas | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `operational-flow` | 41/51 — 10 falhas | **41/51 — as mesmas 10** | 0 |
| `radar-to-writer-handoff-1` (loader) | 26/26 | **26/26** | 0 |
| `publicacoes-domain` + `publicacoes-global-topbar` | — | **6/6** | 0 |
| `eslint` nos arquivos tocados | — | **0 erros** | 6 avisos pré-existentes |

---

## 4. O cenário obrigatório — o que está provado e o que não está

O cenário pedido termina em **"outro navegador → mesmo estado"**. Isso é homologação de navegador, e **é do usuário**. O que consigo afirmar:

| Passo | Estado |
| --- | --- |
| importar/abrir artigo do Radar | `VERIFICADO_NO_CODIGO` — caminho inalterado |
| aparece em Publicações como Rascunho | `CONFIRMADO_POR_TESTE` (01) — a projeção o produz |
| editar · autosave · F5 · conteúdo permanece | `VERIFICADO_NO_CODIGO` — persistência não mudou |
| Publicações mostra o mesmo documento | `CONFIRMADO_POR_TESTE` (04, 10) — a linha é o documento |
| Salvar rascunho · nenhuma duplicata | `CONFIRMADO_POR_TESTE` (04, 14) |
| save idêntico não cria versão | `CONFIRMADO_POR_TESTE` (14) — `createVersion` desligado em rascunho |
| Finalizar artigo → Publicações mostra Pronto | `CONFIRMADO_POR_TESTE` (02) |
| outro navegador → mesmo estado | **`VALIDADO_MANUALMENTE` = não. É do usuário.** |

---

## 5. Arquivos

**Criados:**
```
lib/publicacoes/editorial-library.ts            (projeção pura)
tests/redator-publicacoes-biblioteca.test.mts   (14 testes)
```

**Alterados:**
```
components/editorial-pipeline-context.tsx       (+documentUpdatedAt; nada mais)
modules/publicacoes/publications-workspace.tsx  (aba Biblioteca projeta o documento)
components/editorial/professional-writer.tsx    (barra global sem ações; toolbar; salvar/finalizar)
tests/operational-flow.test.mts                 (duas asserções de UI atualizadas)
package.json                                    (test:redator inclui o arquivo novo)
```

**Não tocados:** Radar, Arquiteto, Minerador, migrations, RPCs, contratos de `PublicationRecord`, rotas de API.

---

## 6. Fora deste corte

```text
M3 = NO
PURGE = NO
RADAR_CHANGE = NO
```

`writer_media_assets`, âncora de mídia e purga continuam intocados.

Uma observação para o próximo corte: a aba **Fila** ainda depende de `publication_records` criados por `importApprovedToPublications`, que grava estado local antes da resposta do servidor. O caminho novo (`sendWriterToPublications`) já exige readback; o antigo, não. Não mexi nele aqui porque está fora do escopo declarado — fica registrado.
