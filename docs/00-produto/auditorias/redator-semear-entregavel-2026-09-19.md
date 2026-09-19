# Criar roteiro e carrossel a partir dos Fundamentos do Radar

**2026-09-19** · frente Redator · **sem migration, sem schema novo, sem serviço de IA novo**

---

## 1. A auditoria que o enunciado pediu primeiro

### 1.1 Autoridade de IA — existe, e foi reusada

```ts
// app/api/redator/section/route.ts — o caminho canônico, desde antes deste corte
const provider = await resolveDeepSeekCanonicalConfig({ actorUserId, brandId, client });
const generated = await generateStructuredAI({ provider, system, user, schema, maxTokens });
```

A semeadura usa **o mesmo par**. Nenhum cliente de IA novo, nenhuma configuração
de modelo dentro do Redator: `resolveDeepSeekCanonicalConfig` lê a Connection da
marca, que continua sendo assunto de **Agência → Integrações**.

Sem Connection válida ele lança `DeepSeekCanonicalError` com código e status
próprios (409), e a rota deixa esses valores subirem inteiros. A tela mostra o
motivo real — não gera conteúdo fictício.

### 1.2 Contrato dos entregáveis — nada a inventar

`lib/redator/multiformat-contracts.ts`, ambos `.strict()`:

| Roteiro | Carrossel |
| --- | --- |
| `channel`, `durationSeconds`, `openingHook`, `closingCta`, `scenes[]` | `channel`, `caption`, `closingCta`, `slides[]` |
| cena: `id`, `order`, `title`, `durationSeconds`, `narration`, `onScreenText`, `visualDirection`, `technicalDirection`, `storyboard`, `sourceRefs` | slide: `id`, `order`, `heading`, `body`, `visual`, `sourceRefs` |

Tudo o que o enunciado pediu — abertura, conteúdo, texto em tela, direção,
observação, duração, CTA — **já existe**. Nenhum campo foi criado, nenhuma
migration foi aberta. O CHECK do banco sobre `payload` é só
`jsonb_typeof(payload) = 'object'`.

### 1.3 Persistência — o caminho de rascunho já existia

`PUT /api/redator/deliverables` → `saveWriterDeliverable`. Grava rascunho e não
cria versão. É por ele que a semeadura persiste.

---

## 2. Como ficou

```text
POST /api/redator/seed   →  PROPÕE um payload. Não grava nada.
PUT  /api/redator/deliverables  →  grava, como em qualquer outra edição
```

Duas autoridades de propósito. Se a geração falhar, **não houve escrita** e o
estado anterior fica intacto. E como quem grava é o PUT, a semeadura herda de
graça a recusa de entregável finalizado e o conflito de lock, sem reimplementar
nenhum dos dois.

Consequência direta, que é o que o enunciado exige: **semear grava rascunho.**
Nenhuma versão, nenhuma retenção, M4–M6 intactos. Gerar não é finalizar.

### 2.1 A evidência individual não entra — por construção

O contexto é montado a partir de `RadarFoundations`, a mesma projeção que a tela
mostra. Ela **só tem conclusões agregadas**: contagens, padrões, lacunas,
direções, limitações. Não existe campo de transcrição nela.

Então a regra "não incorporar o texto integral de fontes não selecionadas" é
cumprida pela forma do tipo, não por um filtro que alguém pode esquecer de
aplicar. O teste 03 prova que campos estranhos jogados no objeto não chegam ao
prompt.

### 2.2 O artigo entra só quando está aprovado

`finalArticleText` devolve texto apenas com `status === "aprovado"`. Artigo em
escrita é material instável: semear com ele hoje e refinalizá-lo amanhã deixaria
o derivado citando uma versão que não existe mais.

### 2.3 Identidade e proveniência não são do modelo

Os schemas que o provider preenche são um **subconjunto** do contrato. `id`,
`order`, `storyboard`, `sourceRefs` e `sourceDocumentHash` são decididos no
servidor — `id` porque é a âncora da mídia (`anchor_ref`), e dois ids iguais
disputariam a mesma âncora.

### 2.4 A recomendação continua recomendação

`editorialOutput = ARTICLE` entra no contexto rotulado como *"recomendação, não
obrigação"*. Nada no código lê esse campo para decidir se pode gerar. Confirmado
ao vivo: com a recomendação em `ARTICLE`, as duas abas geram.

---

## 3. Um defeito meu, achado só na chamada real

A primeira chamada devolveu **HTTP 400** do provider.

A camada compartilhada envia `response_format: { type: "json_object" }`, e a API
**recusa** quando a palavra "json" não aparece em nenhuma mensagem. O
`SECTION_WRITING_SYSTEM_PROMPT`, que funciona, diz *"Devolva JSON conforme o
schema: paragraphs…"*. Os meus não diziam.

Nenhum teste pegou, e o motivo importa: **o schema do Zod valida a resposta e
nunca é enviado ao provider**. Eu tinha testado a tradução da saída e não o
contrato do pedido.

Corrigido declarando o envelope no próprio prompt, e o teste 05 passou a exigir
a palavra `JSON` e cada chave do contrato — é a asserção que teria pegado isto.

---

## 4. Testes — 14/14 · mutantes 17/17

| # | Cobre |
| --- | --- |
| 01 | o artigo só é fonte quando aprovado; bloco sem texto não vira linha vazia |
| 02 | o contexto carrega recomendação, camadas, YouTube, cobertura, limitações, `writerMayNot` |
| 03 | **evidência individual não entra**: campo estranho não chega ao prompt |
| 04 | o artigo finalizado entra como fonte adicional, e só quando existe |
| 05 | roteiro e carrossel são gerações independentes · **e o envelope JSON está declarado** |
| 06 | a recomendação `ARTICLE` não impede nenhum formato |
| 07 | o modelo só preenche subconjunto do contrato; campo fora é recusado |
| 08 | o roteiro gerado valida no contrato real; duração total = soma das cenas |
| 09 | o carrossel gerado valida no contrato real |
| 10 | **o dossiê não é copiado** para dentro do payload |
| 11 | semear não sobrescreve trabalho existente |
| 12 | a rota reusa o caminho canônico e **não grava** |
| 13 | a tela oferece as duas saídas e impede duplo clique |
| 14 | a gravação continua sendo uma só, e é rascunho |

Um mutante sobreviveu à primeira passada: *"a saída do modelo deixa de ser
validada antes de gravar"*. Meu teste checava a **mensagem** de recusa, que o
mutante deixou intacta no arquivo. Passou a exigir o `safeParse` e a ordem dele
em relação ao save.

### 4.1 Regressão que eu causei e corrigi

`redator-feedback-acoes` conta as traduções de falha por ação e esperava 2.
Com `semear` são 3. As quatro contagens passaram a derivar de uma lista nomeada
de ações, em vez de um literal solto — a próxima ação que entrar não vai
reprovar o teste por um número que ninguém sabia de onde vinha.

---

## 5. Bateria

| Suíte | Antes | Agora |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** |
| `test:redator` | 282/282 | **296/296** |
| `test:redator:mcp` | 42/42 | **46/46** |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** |
| `test:radar` | 2259/2259 | **2259/2259** |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** |
| `planejador` | 16/16 | **16/16** |
| `eslint` (erros) | 124 | **124 — os mesmos dois arquivos** |

Os cinco arquivos desta rodada saem com 0 erros.

---

## 6. Verificação ao vivo

**Estado vazio** no Roteiro do documento *"skin care noturno"*:

```text
Ainda não há cenas.
Contexto do Radar disponível.
[ Criar roteiro a partir deste contexto ]  [ Começar manualmente ]
```

**Geração real** (`POST /api/redator/seed`, sem gravar), nos dois formatos:

| | Roteiro | Carrossel |
| --- | --- | --- |
| resposta | HTTP **200** em 56 s | HTTP **200** em 39 s |
| partes | 6 cenas, `order` 0–5 | 7 slides, `order` 0–6 |
| ids | 6 únicos | 7 únicos |
| invariante | duração total 440 s = soma exata das cenas | — |
| campos preenchidos | `title`, `durationSeconds`, `narration`, `onScreenText`, `visualDirection`, `technicalDirection` | `heading`, `body`, `caption` |
| decididos pelo servidor | `storyboard: null`, `sourceRefs: []` | `visual: null`, `sourceRefs: []` |
| chaves do payload | exatamente as do contrato | exatamente as do contrato |
| vazamento de dossiê | **nenhum** | **nenhum** |

E são gerações **independentes**, não uma fatiada da outra: o roteiro abre com
*"Abertura: o caso delimitado"* e o carrossel com *"Rotina não é o segredo"* —
estruturas diferentes para o mesmo contexto.

Leitura do banco depois: `writer_deliverables` continua com 2 linhas,
`approved`, `lock_version` 5, `updated_at` 05:02. `writer_deliverable_versions`
intacta. **A rota não escreveu nada**, como projetado.

---

```text
SCRIPT_CAN_BE_SEEDED_FROM_RADAR = YES      (provado ao vivo — 6 cenas, 56 s)
CAROUSEL_CAN_BE_SEEDED_FROM_RADAR = YES    (provado ao vivo — 7 slides, 39 s)
SCRIPT_AND_CAROUSEL_GENERATED_INDEPENDENTLY = YES
MANUAL_CREATION_REMAINS_AVAILABLE = YES    ("Começar manualmente", ao lado)

FINAL_ARTICLE_USED_WHEN_AVAILABLE = YES    (por teste — nenhum artigo aprovado nesta marca)
RADAR_CONTEXT_USED = YES
RAW_DOSSIER_DUPLICATED = NO

ARTICLE_RECOMMENDATION_BLOCKS_SCRIPT = NO
ARTICLE_RECOMMENDATION_BLOCKS_CAROUSEL = NO

GENERATION_CREATES_FINAL_VERSION = NO
GENERATION_STARTS_RETENTION = NO

NEW_CONTENT_DOCUMENT_CREATED = NO
MIGRATION_REQUIRED = NO
AI_SERVICE_CREATED = NO — reusa resolveDeepSeekCanonicalConfig + generateStructuredAI
MODEL_CONFIG_IN_REDATOR = NO — continua em Agência → Integrações
DATABASE_MODIFIED = NO
REGRESSIONS = NONE
```
