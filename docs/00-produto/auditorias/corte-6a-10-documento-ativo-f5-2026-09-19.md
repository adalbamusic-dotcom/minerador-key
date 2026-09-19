# Corte 6A.10 — o documento ativo sobrevive ao F5

**2026-09-19** · frente Redator · **sem migration, sem tabela nova, sem escrita remota**

---

## 1. O que o 6A.9 deixou aberto

A regra do 6A.9 tinha quatro passos e o terceiro era
`moduleState.redator.selectedId`. Ele **não é persistência**:

```ts
// editorial-pipeline-context.tsx:343
const updateWorkspace = useCallback((updater) => {
  setWorkspaces(previous => updateBrandWorkspace(...));   // memória React, e só
}, [...]);

// linha 108 — o workspace nasce assim a cada carregamento
moduleState: {}
```

No F5, `selectedId` volta a `""` e `moduleState` volta a `{}`. A regra caía no
passo 4 — `documents[0]` — sobre uma lista ordenada por `updated_at DESC`. O
handoff do Radar, por ser o mais recente, virava o documento ativo.

Foi o que a leitura das 07:52 mostrou: às **07:14:27** a tela estava em *"skin
care noturno"*, não no documento que precisa de homologação.

---

## 2. A autoridade certa já existia

`content_document_user_states` é gravada pela própria tela, por usuário
(`.eq("user_id", userId)`), e carregada no workspace. Ela traz `lastOpenedAt`
por documento — exatamente "quando esta pessoa abriu isto".

A ordem passou a ser:

| | Autoridade | Sobrevive ao F5? |
| --- | --- | --- |
| 1 | a escolha desta sessão | não — e não precisa |
| 2 | a URL `?documentId=` | sim, enquanto a URL for aquela |
| 3 | **`lastOpenedAt` mais recente entre os que existem** | **sim** ← o passo novo |
| 4 | o primeiro da lista | só quando não há nenhum dos anteriores |

`updated_at DESC` volta a ser o que sempre deveria ter sido: **ordenação de
lista**. Continuidade de trabalho é quando a pessoa abriu, não quando o sistema
mexeu.

### 2.1 Uma divergência do enunciado, declarada

O enunciado pede **1. URL, 2. `selectedId`**. Implementei ao contrário.

Com a ordem literal, quem entra por `?documentId=A` e depois clica em **B** na
lista continuaria em **A para sempre** — a URL não muda ao clicar, então ela
venceria todo clique. A tela ficaria travada.

O requisito que o enunciado de fato enuncia continua valendo: *"URL B → B ganha
precedência sobre `lastOpenedAt(A)`"*. A URL vence o passo 3, que é o que importa
na entrada. Está no teste 04.

---

## 3. O feedback falso — item 4 do enunciado

A auditoria pedida encontrou o mecanismo, e ele era real:

```ts
useEffect(() => { if (!selected) return; … POST /api/editorial/documents … },
  [selected?.id, leftOpen, rightOpen]);

// editorial-repositories.ts:524
saveUserState → upsert { last_opened_at: new Date().toISOString() }
```

O efeito disparava **sempre que `selected.id` mudasse** — inclusive quando mudava
por *fallback*. Quer dizer: a lista reordenava, o handoff virava `documents[0]`,
virava ativo, e **ganhava um `lastOpenedAt` que ninguém lhe deu**. A autoridade
se contaminava sozinha.

Foi assim que *"skin care noturno"* ficou com 07:14:27 sem nunca ter sido
escolhido.

Duas coisas fecham isso:

* o passo 3 entra **antes** do fallback, então o fallback só é alcançado quando
  não há nada a preservar;
* a gravação passa por `shouldPersistLastOpened(ativo.origin)`, que torna a
  condição explícita em vez de implícita na ordem dos `if`.

---

## 4. Testes

`tests/redator-documento-ativo.test.mts` — **14/14**, dentro de `test:redator`.

O núcleo é um modelo de sessão com um `recarregar()` que joga fora exatamente o
que o F5 joga — a escolha em memória — e mantém o que vem do servidor:

```ts
class Sessao {
  recarregar() { this.selectedId = ""; }    // moduleState e selectedId morrem
  abrir(quando) { /* resolve E persiste, como o efeito da tela */ }
}
```

Não é "a função consulta `lastOpenedAt`". É: **perde-se o estado em memória, e a
resolução seguinte cai no mesmo documento.**

| # | Natureza | Cobre |
| --- | --- | --- |
| 01 | COMPORTAMENTAL | A aberto → F5 → A continua ativo |
| 02 | COMPORTAMENTAL | A aberto → B chega mais recente → F5 → A continua · **e um segundo F5** |
| 03 | COMPORTAMENTAL | handoff novo não ganha `lastOpenedAt` automaticamente |
| 04 | COMPORTAMENTAL | a URL vence o `lastOpenedAt`; a escolha da sessão vence a URL |
| 05 | COMPORTAMENTAL | a escolha da sessão sobrevive à lista inteira reordenar |
| 06 | COMPORTAMENTAL | referência obsoleta (seleção, URL ou `lastOpenedAt`) cai em fallback válido |
| 07 | COMPORTAMENTAL | sem estado anterior, `documents[0]`; lista vazia não quebra |
| 08 | COMPORTAMENTAL | o mais recente **entre os que ainda existem** |
| 09 | COMPORTAMENTAL | só a origem `none` não grava |
| 10 | COMPORTAMENTAL | o que chegou depois é marcado, não navegado |
| 11 | ESTRUTURAL | a tela passa `documentUserStates`; `moduleState` não volta a ser autoridade |
| 12 | ESTRUTURAL | o fallback silencioso continua fora; a seleção não vira `localStorage` |
| 13 | ESTRUTURAL | a gravação de `lastOpenedAt` é condicionada à origem |
| 14 | ESTRUTURAL | o ativo é visível; `choose` só no clique |

Cobertura pedida, ponto a ponto:

| Pedido | Onde |
| --- | --- |
| `A aberto → F5 → A continua ativo` | 01, 02 |
| `A aberto → B chega mais recente → F5 → A continua` | 02 |
| `URL B → B ganha precedência sobre lastOpenedAt(A)` | 04 |
| `selectedId da sessão A → lista atualiza → A continua` | 05 |
| `lastOpenedAt aponta para documento inexistente → fallback válido` | 06 |
| `nenhum estado anterior → documents[0]` | 07 |
| `handoff novo não recebe lastOpenedAt automaticamente` | 03 |
| modelar unmount/remount, não só "consulta o campo" | `Sessao.recarregar()`, usado em 01, 02, 03 |

### 4.1 Mutantes

Doze introduzidos, **doze mortos**, na mesma execução que o `test:redator` usa:

| Mutante | Morto por |
| --- | --- |
| estado sem `lastOpenedAt` passa a contar | 07 |
| escolhe o aberto há **mais** tempo | 08 |
| ignora quais documentos ainda existem | 06, 08 |
| **o passo do `lastOpenedAt` some (o defeito do 6A.9 volta)** | 01, 02, 03, 06 |
| o primeiro da lista passa na frente do `lastOpenedAt` | 01, 02 |
| a URL passa a vencer a escolha da sessão | 04 |
| id fora da lista passa a ser aceito | 06 |
| grava `lastOpenedAt` até sem documento | 09 |
| só a escolha explícita grava | 09 |
| a tela volta a gravar sem olhar a origem | 13 |
| a tela para de passar o estado persistido | 11 |
| a tela para de passar a URL | 11 |

### 4.2 Dois erros meus no caminho

**O arquivo inteiro foi recusado pelo runner.** Escrevi `Sessao` com propriedades
de parâmetro (`constructor(public availableIds: string[])`). Sob `tsx` passou;
sob `node --test`, que é o que `test:redator` usa, não: a remoção nativa de tipos
recusa o que exige transformação. O relatório de falha não aponta a linha, aponta
o arquivo — `✖ tests\redator-documento-ativo.test.mts 'test failed'`. Campos
declarados e atribuídos à mão resolvem.

**Um `doesNotMatch(/localStorage/)` amplo demais.** A tela usa `localStorage`
legitimamente, para o rascunho de recuperação. A asserção certa é sobre a
*seleção* virar estado de navegador, não sobre a palavra aparecer.

A bateria de mutantes foi refeita no runner real depois da primeira correção —
não bastava o resultado obtido sob `tsx`.

---

## 5. Bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 259/259 | **264/264** | +5 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2250/2250 | **2250/2250** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` (erros) | 124 | **124 — os mesmos dois arquivos** | 0 |

Os 124 erros continuam sendo `arquiteto-workspace.tsx` (113) e
`minerador-workspace.tsx` (11), herdados. Os dois arquivos desta rodada saem
limpos.

Arquivos tocados: `lib/redator/active-document.ts`,
`components/editorial/professional-writer.tsx`,
`tests/redator-documento-ativo.test.mts`. Nada de Radar, lifecycle, M4/M5/M6,
mídia, Publicações ou purge. O `git status` fecha igual ao do início da rodada.

---

## 6. Readback — 08:09 UTC, somente leitura

Nada mudou desde 05:02. **Os ciclos de reopen/refinalização continuam sem chegar
ao banco.**

| | |
| --- | --- |
| entregáveis | `carousel` e `video_script`, ambos `approved`, `lock_version` **5**, `updated_at` **05:02** |
| versões | 4 — duas `Rascunho inicial.` (v1) e duas `Finalização do entregável.` (v2) |
| `previous_version_id` | `null` nas quatro · `superseded_at` e `purge_after` vazios |
| `content_document_versions` | 0 |
| `publication_records` | 0 |
| `writer_media_assets` | 9 |
| último `last_opened_at` | **07:14:27** — ainda *"skin care noturno"* |

### 6.1 Uma consequência que precisa ser dita

A correção impede **novas** contaminações. Ela não limpa a que já está gravada.

Hoje `lastOpenedAt` é 07:14 para *"skin care noturno"* e 06:24 para *"skincare
para pele oleosa"*. Na próxima abertura da tela, a regra vai — corretamente, pela
regra — escolher o de 07:14, que é o documento errado.

**Basta clicar uma vez** em *"skincare para pele oleosa"* na lista da esquerda (ou
entrar pela URL do §7.4 do relatório canônico). A partir daí ele passa a ser o de
`lastOpenedAt` mais recente, e aí sim atravessa F5, reordenação e handoff novo.

---

## 7. A homologação, agora

1. abrir o Redator e **clicar** em *"Cobrir com clareza o tema «skincare para
   pele oleosa»"* — confirmar o rótulo **"· em edição"** nele;
2. **F5.** O rótulo tem de continuar no mesmo documento. *"skin care noturno"*
   deve aparecer com o badge **novo**, sem tomar o lugar;
3. no Roteiro: **Reabrir para edição** → **Finalizar** sem alterar nada →
   **Reabrir** → editar uma cena → **Salvar** → **Finalizar**;
4. repetir no Carrossel.

O passo 2 é o teste desta rodada. Os passos 3 e 4 são o que falta para o Corte 6A
poder fechar.

---

```text
ACTIVE_DOCUMENT_SURVIVES_F5 = YES (por teste; aguardando execução na UI)
ACTIVE_DOCUMENT_SURVIVES_SECOND_F5 = YES (teste 02)
NEW_HANDOFF_STEALS_SELECTION = NO
PERSISTED_SELECTION_USES_LAST_OPENED_AT = YES
URL_HAS_PRECEDENCE = YES sobre lastOpenedAt · NO sobre a escolha da sessão (§2.1)
EPHEMERAL_MODULE_STATE_REQUIRED_FOR_RELOAD = NO
FALSE_LAST_OPENED_WRITE = PARCIAL ← CORRIGIDO pelo Corte 6A.12
  o §3 fechou o fallback DEPOIS da hidratação; durante a carga assíncrona ele
  continuava gravando, porque a recuperação local traz `documents` sem trazer os
  user states. Ver corte-6a-12-hidratacao-documento-ativo-2026-09-19.md
CONTAMINATED_LAST_OPENED_AT_REMAINS = YES — 07:14 no documento errado (§6.1)
MIGRATION_REQUIRED = NO
DATABASE_MODIFIED = NO
MANUAL_UI_VALIDATED = NO
REOPEN_REFINALIZE_CYCLES_IN_DATABASE = 0
CORTE_6A_EDITOR_LIFECYCLE_READY_TO_CLOSE = NO
REGRESSIONS = NONE
```
