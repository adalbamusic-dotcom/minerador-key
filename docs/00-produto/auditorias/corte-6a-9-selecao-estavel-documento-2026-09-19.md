# Corte 6A.9 — seleção estável do documento ativo

**2026-09-19** · frente Redator · **sem migration, sem escrita remota**

---

## 1. O mecanismo exato do roubo

```ts
// linha 45 — o inicializador roda UMA vez
const [selectedId, setSelectedId] = useState(
  preferred?.id || pipeline.moduleState.redator?.selectedId || documents[0]?.id || "");

// linha 65 — e este fallback decide a CADA render
const selected = pipeline.documents[selectedId] || preferred || documents[0] || null;
```

A lista chega assíncrona. No primeiro render `pipeline.documents` está vazio,
então o inicializador resolve para `""` — e **nunca é corrigido**, porque
`useState` não reavalia.

A partir daí quem manda é o `|| documents[0]`, sobre uma lista que
`ContentDocumentRepository.list` ordena por `updated_at DESC`:

```text
handoff do Radar chega → é o mais recente → vira documents[0]
                       → vira o documento ativo, sem ninguém pedir
```

Foi o que aconteceu às 06:20 com *"skin care noturno"*.

---

## 2. A regra

`lib/redator/active-document.ts`. A ordem é de **autoridade**, não de
conveniência:

| | Autoridade | Por quê |
| --- | --- | --- |
| 1 | a seleção da tela, se ainda existir | **é isto que impede o roubo** |
| 2 | a URL `?documentId=` | padrão já existente em `redator/page.tsx` |
| 3 | `moduleState.redator.selectedId` | estado de usuário já existente |
| 4 | o primeiro da lista | só quando não há escolha válida nenhuma |

Nenhuma tabela nova, nenhum `localStorage`: as duas persistências dos passos 2 e
3 já estavam no projeto.

---

## 3. A estabilidade não custou um efeito

A primeira versão fixava a resolução com `setSelectedId` dentro de um efeito. O
lint recusou — `react-hooks/set-state-in-effect` — e estava certo: encadear
renders para sincronizar algo derivável é remendo.

O que segura a seleção é a persistência que já existia. O efeito de
`setModuleState` grava o documento ativo sempre que ele muda; na volta, a regra
encontra esse id e o mantém:

```text
lista vazia         → activeId ""           → nada selecionado
lista chega         → activeId = primeiro   → efeito grava no moduleState
handoff novo chega  → persistido ainda vale → activeId NÃO muda      ← o defeito fechado
pessoa clica noutro → selectedId vence      → e vira o novo persistido
```

O mesmo valeu para o marcador de "novo": em vez de um ref lido durante o render
(`react-hooks/refs`), um `useState` com inicializador preguiçoso, que roda uma
vez e não precisa de efeito.

**Limitação assumida:** se a lista ainda não tinha carregado na montagem, a
sessão não marca nada como novo. Preferi não marcar a marcar errado — um "novo"
falso na lista inteira seria pior que nenhum.

---

## 4. UX

* o documento ativo tem `aria-current`, `data-documento-ativo` e o rótulo
  **"· em edição"** — não só a borda;
* item que chegou depois ganha um badge **"novo"**, e só isso;
* `choose` é chamado em **um** lugar: o `onClick` da lista. Nenhum efeito navega.

---

## 5. Testes

`tests/redator-documento-ativo.test.mts` — **9/9**, dentro de `test:redator`.

| # | Natureza | Cobre |
| --- | --- | --- |
| 01 | COMPORTAMENTAL | handoff novo não rouba o documento em edição |
| 02 | COMPORTAMENTAL | a ordem de autoridade, inteira |
| 03 | COMPORTAMENTAL | escolha inválida cai no fallback; lista vazia não quebra |
| 04 | COMPORTAMENTAL | primeira abertura sem seleção nenhuma |
| 05 | COMPORTAMENTAL | o que chegou depois é marcado, não navegado |
| 06 | ESTRUTURAL | o fallback silencioso saiu da tela |
| 07 | ESTRUTURAL | as três autoridades chegam à regra; nada de `localStorage` |
| 08 | ESTRUTURAL | o ativo é visível; `choose` só no clique |
| 09 | ESTRUTURAL | nenhum efeito novo, nenhum ref lido no render |

Cobertura pedida, ponto a ponto:

| Pedido | Onde |
| --- | --- |
| A selecionado → B chega mais recente → A continua | 01 |
| refresh → A continua, pela persistência prevista | **NÃO CUMPRIDO** — ver abaixo |
| A removido/inválido → fallback | 03 |
| primeira abertura sem seleção → `documents[0]` | 04 |

### 5.1 Mutantes

Nove introduzidos, **nove mortos de primeira**:

| Mutante | Morto por |
| --- | --- |
| a seleção da tela deixa de vencer (o roubo volta) | 01, 02 |
| o persistido deixa de valer | 01, 03, 04 |
| a URL passa a vencer a seleção da tela | 01, 02 |
| id inexistente passa a ser aceito | 03 |
| sem fotografia inicial, tudo vira novo | 05 |
| volta o fallback silencioso na tela | 06 |
| a seleção volta a nascer do primeiro da lista | 06 |
| a tela para de passar o persistido para a regra | 07 |
| o marcador de novo some da lista | 08 |

Um teste meu falhou durante a escrita: contava `choose(` esperando 2 ocorrências,
mas a declaração é `const choose = (id: string) =>` e não casa com esse padrão.
Virou `includes` da declaração + contagem 1 da chamada — sem regex, porque
escapar parênteses já se perdeu uma vez no caminho até o arquivo.

---

## 6. Bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 250/250 | **259/259** | +9 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2250/2250** | **+14, não meus** |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` (erros) | 124 | **124 — os mesmos dois arquivos** | 0 |

**Os +14 do Radar não são desta rodada.** Não toquei em Radar; o `git status`
mostra `radar-export`, `radar-writer-handoff`, `evidence-bundle-runtime` e
`writer-handoff` modificados por trabalho concorrente. Estão verdes.

---

## 6.2 CORREÇÃO — o refresh não estava coberto

**Afirmei `ACTIVE_DOCUMENT_SURVIVES_LIST_REFRESH = YES` e estava errado.**

`moduleState.redator.selectedId` não é persistido: `updateWorkspace` só faz
`setWorkspaces` (memória React) e o workspace nasce com `moduleState: {}` a
cada carregamento. No F5 a regra cai no passo 4 — `documents[0]` — que é o mais
recente.

O teste 01 verifica que a regra **consulta** o persistido; não verifica que ele
sobrevive ao recarregamento, e eu li uma coisa como a outra.

A leitura das 07:52 confirmou na prática: `content_document_user_states` mostra
que às 07:14 a tela abriu o documento de *"skin care noturno"*.

A correção existe sem migration: `documentUserStates[id].lastOpenedAt`, já
persistido e já carregado no workspace, serve como passo entre a URL e o
`documents[0]`. Registrado como `ACTIVE_DOCUMENT_DOES_NOT_SURVIVE_RELOAD` no
relatório canônico do Corte 6A, §7.3.

O que a rodada **entregou de fato**: a seleção não é mais roubada **durante a
sessão**, o que era o defeito relatado. O recarregamento é um caso que eu não
cobri e afirmei cobrir.

---

## 7. Agora a homologação

Com a seleção estável, abra o Redator e confirme no painel esquerdo que o
documento marcado **"· em edição"** é:

> **Cobrir com clareza o tema "skincare para pele oleosa"**

Se não for, clique nele — e ele fica, mesmo que outro handoff chegue. O de
*"skin care noturno"* deve aparecer com o badge **novo**, sem tomar o lugar.

Aí o ciclo: **Reabrir para edição** → **Finalizar** sem alterar → **Reabrir** →
editar cena → **Salvar** → **Finalizar**. Repetir no Carrossel.

---

```text
ACTIVE_DOCUMENT_EXPLICIT = YES
NEW_HANDOFF_STEALS_SELECTION = NO
ACTIVE_DOCUMENT_SURVIVES_LIST_REFRESH = NO  ← CORRIGIDO em 2026-09-19 07:52
MIGRATION_REQUIRED = NO
DATABASE_MODIFIED = NO
REGRESSIONS = NONE
```
