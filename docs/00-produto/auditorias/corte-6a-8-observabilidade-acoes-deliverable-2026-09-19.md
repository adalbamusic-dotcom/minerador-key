# Corte 6A.8 — ações de Roteiro e Carrossel observáveis

**2026-09-19** · frente Redator · **sem migration, sem escrita remota**

---

## 1. O defeito

```tsx
/* ARTIGO · professional-writer.tsx:372 — a convenção certa, escrita à mão */
saveState === "conflict" || saveState === "error" ? "text-danger"
  : saveState === "saved_server" ? "text-success" : "text-text-muted"

/* ENTREGÁVEL · linha 334 — sempre a mesma cor */
min-w-0 max-w-64 truncate text-text-muted
```

Um 409, um 401 ou um 500 em "Reabrir para edição" apareciam em cinza, truncados
em `max-w-64`, no mesmo lugar e na mesma cor que "Sem alterações pendentes".

Clicar, falhar e não perceber era o comportamento **esperado** daquela tela — e é
a explicação mais econômica para três readbacks seguidos em que a execução
relatada não chegava ao banco.

---

## 2. Uma convenção, não duas

A tabela foi extraída para `lib/redator/action-feedback.ts`, e o **Artigo passou
a usar a mesma função**. Repetir a convenção do outro lado teria criado duas
tabelas que divergiriam no primeiro ajuste — o pedido era explícito.

| Estado | Tom | Classe |
| --- | --- | --- |
| `idle`, `dirty` | neutro | `text-text-muted` |
| `saving` | progresso | `text-context-accent` |
| `saved_server`, `saved_local` | sucesso | `text-success` |
| `conflict`, `error` | erro | `text-danger` |

O teste 07 cobra que o ternário escrito à mão **não volte**, e que os dois lados
chamem `feedbackClass`.

---

## 3. Toda ação produz estado visível

```text
Salvando…      →  Rascunho salvo e confirmado no servidor   (ou "Sem alterações a salvar")
Finalizando…   →  Finalizado na versão N  |  versão N criada
Reabrindo…     →  Reaberto para edição. A última versão finalizada continua sendo a corrente.
qualquer falha →  a mensagem do servidor, em vermelho
```

O botão **da ação em curso** troca de rótulo (`Reabrindo…`); os outros só
desabilitam. Um botão que continua dizendo "Finalizar roteiro" enquanto finaliza
convida ao segundo clique, e a idempotência do servidor não é desculpa para a
tela mentir.

```text
DELIVERABLE_SUCCESS_VISIBLE = YES
ACTION_LOADING_VISIBLE = YES
```

---

## 4. A resposta do servidor não é engolida

```ts
const body = await response.json().catch(() => null);
if (!response.ok) {
  const falha = describeActionFailure({ status: response.status, body });
  setTom(falha.tone); setMessage(falha.mensagem);
  return;                       // ← antes de load() e de qualquer sucesso
}
```

Precedência da mensagem: **`body.error` → `body.code` → mapa por status → HTTP
N**. O servidor sabe o motivo exato (`writer_lock_conflict`,
`writer_deliverable_finalized`, `writer_approved_immutable`); substituí-lo por
"Falha na operação" jogaria fora a única informação acionável.

O `catch(() => null)` existe para o caso de a resposta não ser JSON — um 502 de
gateway, por exemplo. Sem ele, o `json()` lançaria e o motivo real se perderia
num erro genérico.

**O estado local não vira sucesso.** O `return` acontece antes do `load()`:
recarregar depois de uma falha sobrescreveria o rascunho que a pessoa ainda tem
na tela. E o botão continua utilizável para nova tentativa.

Conflito é distinguível de falha genérica — `describeActionFailure` devolve
`conflito: true` só em 409. Os dois pintam de vermelho porque, para quem opera, a
diferença que importa é "não deu certo"; o que os separa é a mensagem.

```text
DELIVERABLE_ERROR_VISIBLE = YES
DELIVERABLE_CONFLICT_VISIBLE = YES
```

---

## 5. O motivo inteiro, sem DevTools

Três camadas, porque a barra tem altura fixa e não pode quebrar linha:

1. **largura maior no erro** — `max-w-md` em vez de `max-w-64`;
2. **`title` com o texto completo** — tooltip devolve o que a barra trunca;
3. **bloco contextual no corpo do ambiente**, com `role="alert"` e
   `break-words`, onde há largura de sobra:

```tsx
{tom === "erro" && message && <div role="alert" data-deliverable-erro …>
  <strong>A ação não foi concluída.</strong>
  <span className="… break-words">{message}</span>
</div>}
```

Ele fica **fora** do trecho travado por `finalizado` — um erro precisa aparecer
mesmo quando o conteúdo está em somente leitura. O teste 09 cobra isso.

```text
CRITICAL_MESSAGE_TRUNCATED = NO
```

---

## 6. Testes

`tests/redator-feedback-acoes.test.mts` — **9/9**, dentro de `test:redator`.

| # | Natureza | Cobre |
| --- | --- | --- |
| 01 | COMPORTAMENTAL | a semântica do Artigo, e quatro tons distinguíveis |
| 02 | COMPORTAMENTAL | o tom vem do código HTTP, 2xx contra 3xx/4xx/5xx |
| 03 | COMPORTAMENTAL | a mensagem do servidor tem precedência; 409 marcado como conflito |
| 04 | COMPORTAMENTAL | erro não trunca curto |
| 05 | COMPORTAMENTAL | só o botão em curso muda de rótulo |
| 06 | ESTRUTURAL | a linha do entregável não volta a ser sempre `muted` |
| 07 | ESTRUTURAL | uma convenção só; o Artigo usa a mesma tabela |
| 08 | ESTRUTURAL | toda ação produz estado; a falha não vira sucesso; trava nos dois caminhos |
| 09 | ESTRUTURAL | o bloco contextual existe e não some em finalizado |

Cobertura pedida, ponto a ponto:

| Pedido | Onde |
| --- | --- |
| reopen 200 → sucesso | 02, 08 |
| reopen 409 → mensagem visível + danger | 02, 03, 06 |
| reopen 401 → mensagem visível + danger | 02, 03 |
| finalize 200 → sucesso | 02, 08 |
| finalize 500 → erro visível + danger | 02, 03 |
| loading desabilita ação repetida | 05, 08 |
| erro não é tratado como saved | 08 (os dois `return` antes do `load()`) |
| o status não volta a ser sempre `muted` | 06 |

### 6.1 Mutantes

Nove introduzidos, nove mortos — **depois de três sobreviverem à primeira
versão dos testes**, todos por falha minha:

| Mutante | Morto por |
| --- | --- |
| erro volta a ser `muted` na tabela | 01, 04 |
| a fronteira de sucesso vira 400 (3xx viraria sucesso) | 02 |
| a mensagem do servidor é engolida por texto genérico | 03 |
| erro volta a truncar curto | 04 |
| o botão em curso não muda de rótulo | 05 |
| a linha do entregável volta à cor fixa | 06, 07 |
| a falha volta a virar sucesso (`return` removido) | 08 |
| some o bloco de erro contextual | 09 |
| a trava de clique duplo some | 08 |

**Os três que sobreviveram, e por quê.** Dois usavam `assert.match` onde existem
**duas** ocorrências do mesmo padrão (`save` e `acao`): o regex encontrava a do
`save` mesmo com a da `acao` quebrada. Passaram a **contar** ocorrências e exigir
2. O terceiro testava 4xx e 5xx mas não 3xx, então mover a fronteira de 300 para
400 passava — um 302 para a tela de login viraria "sucesso", que é exatamente o
tipo de falha silenciosa que este corte veio fechar.

É a mesma classe de erro que já me pegou antes: asserção que casa numa ocorrência
quando o arquivo tem duas.

---

## 7. Bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 241/241 | **250/250** | +9 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` (erros) | 124 | **124 — os mesmos dois arquivos** | 0 |

Nada de M1–M6, schema, lifecycle, mídia, Publicações ou purge foi tocado. A única
mudança fora do entregável foi a linha de estado do Artigo passar a chamar a
função extraída — mesma cor, mesma condição, uma cópia a menos.

---

## 8. Agora sim, a homologação

Sem readback nesta rodada, como pedido. O ciclo:

**Roteiro** (está `Finalizado`, lock 5, versão 2):

1. **Reabrir para edição** → o botão vira "Reabrindo…"; depois a mensagem deve
   ficar **verde**: "Reaberto para edição…". Se aparecer **vermelho**, é o motivo
   real do servidor — e agora ele é legível, na barra e no bloco do corpo.
2. **Finalizar** sem alterar → "Finalizado na versão 2; nenhuma versão nova foi
   criada", em verde.
3. **Reabrir** → editar uma cena → **Salvar rascunho** → **Finalizar** →
   "Finalizado e confirmado no servidor como versão 3".

Repetir no **Carrossel**.

Se alguma ação falhar **mesmo com o feedback correto**, aí sim vale DevTools →
Network no `PATCH /api/redator/deliverables`, capturando request, status,
response body, `expectedLockVersion` e o `kind`. Não vou supor causa antes dessa
evidência.

---

```text
DELIVERABLE_ERROR_VISIBLE = YES
DELIVERABLE_CONFLICT_VISIBLE = YES
DELIVERABLE_SUCCESS_VISIBLE = YES
CRITICAL_MESSAGE_TRUNCATED = NO
ACTION_LOADING_VISIBLE = YES

DATABASE_MODIFIED = NO
MIGRATION_REQUIRED = NO
REGRESSIONS = NONE
```
