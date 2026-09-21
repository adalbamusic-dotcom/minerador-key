# SDD — Dois eixos: status editorial e vínculo de publicação

**Data:** 2026-09-20 · **Owner:** Minerador · **Status:** aprovada pelo usuário ("temos separar isso e colocar a declaração e colocar a url que vai se tornar num canônico"); implementada no mesmo dia.

## Problema

O usuário relatou "3 problemas de status". Medidos, são três sintomas de **uma** causa.

### Os números

Banco inteiro, todas as marcas, keywords vivas:

```
status: bruto 80 · aprovado 29
        publicado 0 · rejeitado 0 · em_revisao 0
```

`publicado` **não existe em nenhuma linha**. `em_revisao` também não — porque é **derivado**, nunca gravado.

### Os três sintomas

| onde | lista oferecida | falta | sobra |
| --- | --- | --- | --- |
| Coluna Status (tabela) | bruto · em revisão · aprovado · rejeitado | — | — |
| Filtro Status (topo) | bruto · aprovado · rejeitado · **publicado (legado)** | em revisão | publicado |
| Status final (Decisão, no DNA) | bruto · aprovado · rejeitado · *publicado* | em revisão | publicado |

Três listas para o mesmo eixo, três conteúdos diferentes.

### A causa

**Os filtros leem o valor cru da linha; as colunas mostram o estado derivado.**

- `table-view.ts` filtrava status por `item.status` — a coluna crua, que guarda a última escolha humana. A tela mostra o status **efetivo** (`resolveEffectiveKeywordStatus`): uma keyword aprovada e depois mexida aparece como "Em revisão" sem que ninguém grave isso. Consequência: filtrar por "Em revisão" **nunca** devolvia nada, e "Aprovado" trazia keywords que a própria tela mostrava em revisão.
- O filtro de publicação lia `site_origin.publicationStatus` (cru: `not_confirmed`, `published`, …) enquanto a coluna Vínculo mostra o derivado (`Livre`, `Candidata`, `Verificada`, `Publicada`). A keyword conferida do Care Glow aparecia como **Verificada** na coluna e como **Não confirmada** no filtro. Mesma linha, dois vocabulários.
- `publicado` no filtro de status é o resto de quando publicação *era* um status editorial. Ele mistura os dois eixos na mesma pergunta e não seleciona nada.

## Decisão

**Os dois eixos são independentes, e cada um tem um vocabulário só.**

### Eixo 1 — status editorial

`bruto · em_revisao · aprovado · rejeitado`. Responde: *a keyword passou pelos processos do Minerador e foi aprovada?* A lista vem de `MINERADOR_EDITORIAL_STATUSES`, e as três telas passam a renderizá-la a partir dessa constante, com o rótulo de `editorialKeywordStatusLabel`. Uma lista, um rótulo, três telas.

`publicado` **sai** de todos os seletores. Zero linhas usam o valor; `isLegacyPublishedStatus` continua reconhecendo-o na leitura, e `legacy_unverified` continua existindo no vínculo — nada histórico é perdido.

### Eixo 2 — vínculo de publicação

`free · candidate · verified · published · legacy_unverified`. Responde: *esta keyword tem uma página real publicada?* O filtro passa a oferecer exatamente esses estados, com os mesmos rótulos da coluna, e o rótulo do filtro vira **Vínculo** (era "Publicação no site").

### A regra que amarra os dois

**Publicada no site e crua no Minerador é um estado legítimo e comum.** É o caso de toda keyword importada do site existente: a página está no ar, mas Lógica, Volume, Resultados e KGR ainda não rodaram. Declarar publicação **não** aprova; aprovar **não** publica. Nenhuma das duas ações toca a outra — travado por teste.

### Canônico declarado

Confirmar a publicação passa a congelar `site_origin.canonicalUrl` com a URL declarada (`declaredCanonicalUrl` → `resolvedUrl` → `sourceUrl`). O canonical lido da página pode mudar depois; **o que a marca declarou como endereço desta keyword, não**. `readPublicationLink` expõe `canonicalUrl`, `null` enquanto não há declaração.

## O que NÃO muda

- A trava de aprovação (§61) e a autoridade da SERP (§63): intocadas.
- `isLegacyPublishedStatus`, `legacy_unverified` e a ação "Corrigir marcação": preservados para o legado.
- Nenhuma migration: nada é gravado de novo além do campo aditivo `canonicalUrl`.
- O handoff ao Arquiteto continua filtrando por status efetivo aprovado.

## Validação

`tests/minerador-conferir-site-catalogo.test.mts`: publicada-e-crua convivem; o filtro de Vínculo fala a língua da coluna; filtrar por "Em revisão" encontra a keyword que a tela mostra em revisão e "Aprovado" não a devolve; declarar publicada congela o canônico e deixa o status editorial onde estava.

```text
EDITORIAL_STATUS_AXIS = bruto | em_revisao | aprovado | rejeitado
PUBLICATION_LINK_AXIS = free | candidate | verified | published | legacy_unverified
PUBLISHED_IMPLIES_APPROVED = NO
APPROVED_IMPLIES_PUBLISHED = NO
PUBLICADO_AS_EDITORIAL_STATUS = REMOVED_FROM_SELECTORS
FILTERS_READ_DERIVED_STATE = YES
CANONICAL_FROZEN_ON_DECLARATION = YES
```
