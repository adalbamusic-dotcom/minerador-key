# SDD — Três eixos: status editorial, publicação e posto de principal

**Data:** 2026-09-20 · **Owner:** Minerador · **Status:** aprovada pelo usuário; implementada no mesmo dia. Sucede e corrige o [SDD dos dois eixos](sdd-dois-eixos-status-editorial-e-vinculo-2026-09-20.md) do mesmo dia.

## O erro do SDD anterior

Aquele SDD tratou o Vínculo como **o eixo da publicação**. Está errado, e o usuário corrigiu:

> "o Vínculo não é para declarar se está publicado ou não, ele é para declarar se essa keyword é livre para ser utilizada como primário/secundário ou se ele pertence a um publicado e essa keyword que está como primário normalmente teria que estar atrelada e travada com o slug/URL; se ele é livre para ser removido e perder seu posto de keyword primária dessa publicação ou não é livre."

Isso não é publicação — é **posto de principal**, e já existia modelado em `lib/minerador/primary-keyword-policy.ts` (`free` · `locked` · `reviewable`). O que faltava era estar no lugar certo.

## A colisão que gerava a confusão

**"Livre" significava duas coisas na mesma tela.**

| onde | "Livre" queria dizer |
| --- | --- |
| Coluna Vínculo (`PublicationLinkState.free`) | não há URL conferida |
| Política da principal (`PrimaryKeywordPolicy.free`) | não está presa a nenhuma publicação; pode ser primária de qualquer coisa |

Duas perguntas diferentes com a mesma resposta na tela. Nenhuma quantidade de rótulo conserta isso enquanto os dois eixos dividem uma coluna.

## Decisão: três eixos, três vocabulários, e uma tela para cada papel

| eixo | pergunta | valores | quem escreve |
| --- | --- | --- | --- |
| **Status editorial** | passou pelos processos e foi aprovada? | `bruto` · `em_revisao` · `aprovado` · `rejeitado` | barra do rodapé (lote e uma a uma) e card do DNA |
| **Publicação** | existe página real no ar? | conferência → declaração humana | Vínculo: "Conferir por link" → "Confirmar publicada" |
| **Posto de principal** | pode perder a vaga de primária? | `free` · `locked` · `reviewable` | **Revisão Humana**, junto da aplicabilidade do KGR |

### Papel de cada tela — o pedido do usuário, literal

- **Barra do rodapé:** classifica em grupo, e serve para uma a uma. Mesma lista do card do DNA.
- **Card do DNA:** classifica uma a uma.
- **Coluna Status:** **só informa**. Deixa de ser `<select>`; vira leitura do estado atual.
- **Filtros:** mostram e organizam por tipo de classificação.

### O "novo status" que faltava

O usuário lembrou por que havia colocado `publicado` no status: **era preciso ver, na coluna, que a keyword já está no ar.** Sem isso, uma página publicada parece idêntica a uma keyword recém-importada.

`publicado` **não volta a ser um valor do enum editorial** — seria dizer que uma página no ar passou pelos processos, e o próprio usuário recusou isso ("mesmo sendo publicados têm que passar pelos processos até serem aprovados"). Ele volta como **marcador**: a coluna Status, que agora é informativa, mostra a classificação **e**, abaixo dela, o selo `Publicado` quando há publicação declarada.

```
Bruto              ← ainda não passou pelos processos
Publicado          ← e já está no ar
```

Os dois fatos ao mesmo tempo, sem um mentir sobre o outro. O enum que se escreve continua com quatro valores.

### Posto de principal na Revisão Humana

`canCompleteHumanReview` ganha `pendingPrimaryPolicy`: **quando existe publicação declarada e o posto ainda é `free`**, há decisão humana concreta esperando escolha — do mesmo tipo que a aplicabilidade do KGR, e contada junto dela. Sem publicação declarada a pergunta não existe: keyword sem página no ar é livre por definição, não há vaga a perder.

O seletor duplicado saiu do card DECISÃO. Decisão humana mora na Revisão Humana.

## O que NÃO muda

- `PrimaryKeywordPolicy`, seu histórico versionado e `setPrimaryKeywordPolicy`: intocados. Só mudou onde se declara.
- A trava de aprovação (§61), a autoridade da SERP (§63) e a separação status × publicação (§65): valem.
- Conferir uma página continua sem publicar: a declaração é humana e explícita.
- Nenhuma migration.

## Validação

`tests/minerador-conferir-site-catalogo.test.mts`: o posto é decisão da Revisão Humana e não da Decisão; sem publicação declarada não pende; declarado, deixa de pender; a coluna Status não escreve mais; `Publicado` é marcador e não entra no enum.

```text
EDITORIAL_STATUS_AXIS   = bruto | em_revisao | aprovado | rejeitado
PUBLICATION_AXIS        = conferência técnica + declaração humana
PRIMARY_POST_AXIS       = free | locked | reviewable
PUBLICADO_IS_ENUM_VALUE = NO
PUBLICADO_IS_MARKER     = YES
STATUS_COLUMN_IS_READ_ONLY = YES
PRIMARY_POST_DECIDED_IN  = HUMAN_REVIEW
```
