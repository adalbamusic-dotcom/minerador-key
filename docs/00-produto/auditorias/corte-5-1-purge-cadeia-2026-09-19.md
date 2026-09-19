# Corte 5.1 — a purga passou a enxergar a cadeia

**Data:** 2026-09-19
**Não executado:** DELETE real, cron, migration, DDL, deploy, commit, push.
**`WRITER_PURGE_TOKEN` continua indefinido.** Os nove ativos reais estão intactos.

---

## 1. O defeito

O Corte 5 exigia que o **sucessor direto** de um predecessor fosse o corrente da
âncora. Numa cadeia legítima:

```text
A → B → C(corrente)
```

quando a janela de `A` vencesse, `B` já estaria substituída por `C`. A guarda
`successor_not_current` recusaria `A` — e recusaria **para sempre**, porque `B`
nunca voltaria a ser corrente. Retenção indefinida sobre uma troca perfeitamente
válida, sem nada acusando.

Pior: quanto mais a pessoa trabalhasse na mesma posição, mais cedo isso
aconteceria. Duas substituições bastavam.

## 2. A regra correta

O que importa não é quem veio logo depois. É se a posição **chegou a um dono
vivo**. Se a cadeia de `A` desemboca no corrente daquela âncora, a substituição
de `A` foi bem sucedida — por mais elos que tenham acontecido no caminho.

```text
superseded_at IS NOT NULL
purge_after <= now()
replaced_by existe
cadeia íntegra até o corrente
todos os elos na mesma marca / documento / anchor
exatamente um corrente nesse anchor
o corrente é o que a cadeia alcançou
predecessor não é corrente
ninguém mais aponta para o predecessor
```

```text
DIRECT_SUCCESSOR_MUST_BE_CURRENT = NO
```

### 2.1 O que ainda recusa, e por quê

| Situação | Recusa | Raciocínio |
| --- | --- | --- |
| elo aponta para linha inexistente | `successor_missing` | a prova da troca se perdeu |
| elo cruza marca, documento ou âncora | `successor_scope_mismatch` | a cadeia não é desta posição |
| `A → B → A` ou auto-referência | `chain_cycle` | não há fim; seguir seria laço |
| cadeia termina sem corrente | `chain_no_current` | a posição ficou órfã |
| zero ou dois correntes na âncora | `anchor_current_ambiguous` | ninguém sabe qual é a boa |
| cadeia acima de 64 elos | `chain_too_long` | sinal de dado corrompido |

Em todos esses casos o predecessor deixa de ser "histórico de uma troca bem
sucedida" e passa a ser a última cópia de alguma coisa. **O modo de falha
continua sendo reter demais.**

```text
BROKEN_CHAIN_FAILS_CLOSED = YES
```

### 2.2 Cada elo mantém a própria janela

Purgar `A` não antecipa nada para `B`. `B` tem `purge_after` próprio e só sai
quando o dela vencer — o teste 19 exercita exatamente isso: `A` elegível e `B`
recusada com `window_open`, na mesma cadeia e na mesma avaliação.

---

## 3. Versões: o mesmo problema, a mesma correção

```text
v1 → v2 → v3(corrente)
```

`v1` não pode ficar retida só porque `v2` já foi substituída. A cadeia de
versões é percorrida por `superseded_by_version_id` até alcançar o
`current_version_id` do **dono** — documento ou entregável.

Artigos finalizados acumulam mais elos que imagens, então aqui o defeito seria
ainda mais frequente. O limite de cadeia é 512 para versões e 64 para mídia.

`planVersionPurge` passou a receber as linhas do mesmo dono, e o serviço as
agrupa antes de decidir — versões de outro documento não são elo.

```text
MEDIA_CHAIN_AWARE_PURGE = YES
VERSION_CHAIN_AWARE_PURGE = YES
```

---

## 4. Os sete casos pedidos, mais dois

| Caso | Teste | Resultado |
| --- | --- | --- |
| `A → B(corrente)` — A elegível após 48h | 17 | elegível, `chainLength = 1` |
| `A → B → C(corrente)` — A elegível após 48h | 18 | **elegível**, `chainLength = 2` |
| `A → B → C(corrente)` — B só com a janela dela | 19 | B recusada `window_open` |
| `A → B(missing)` | 20 | `successor_missing`, inclusive quebrado no meio |
| `A → B` de outro anchor | 21 | `successor_scope_mismatch`, nos quatro eixos |
| `A → B → A` | 22 | `chain_cycle`, sem travar |
| dois correntes no mesmo anchor | 23 | `anchor_current_ambiguous` |
| `v1 → v2 → v3(corrente)` | 24 | v1 elegível, v2 aguarda |
| versão: quebrada, cíclica, outro dono, sem corrente | 25 | cada uma com a recusa própria |

### 4.1 Um teste que precisou mudar — e por quê

O teste 05 do Corte 5 afirmava:

```ts
const sucessorSubstituido = sucessor({ supersededAt: "…" });
assert.equal(d.refusal, "successor_not_current");
```

**Essa asserção codificava o defeito.** Ela não passou por acaso: ela descrevia,
com precisão, a regra errada. Foi reescrita para o caso que continua válido —
cadeia que morre **sem** chegar a um corrente, que recusa com `chain_no_current`.

É a diferença entre um teste que quebrou porque o código regrediu e um que
quebrou porque descrevia o defeito. Este era o segundo.

---

## 5. Dry-run real, depois da correção

Executado com as guardas novas em 2026-09-19T02:12:08Z:

```text
total_assets          = 9
midia_elegivel_agora  = []          ← nada sairia
midia_recusas         = { not_superseded: 5, window_open: 4 }
versoes_documento     = { total: 0, elegiveis: 0 }
versoes_entregavel    = { total: 2, elegiveis: 0 }
```

Idêntico ao do Corte 5, e é o esperado: **as quatro cadeias reais têm um elo
só** (`predecessor → corrente`), então a correção não muda o veredito delas. Ela
muda o que aconteceria na **segunda** substituição de qualquer posição — que é
justamente o caso que ninguém teria percebido até acontecer.

Os quatro predecessores continuam identificados com o tempo restante:

| `assetId` | `purge_after` | faltam |
| --- | --- | --- |
| `c4e69d77…` (bloco) | 2026-09-21T01:40:46 | 1d 23:28 |
| `216a832b…` (capa) | 2026-09-21T01:48:22 | 1d 23:36 |
| `74455e67…` (cena) | 2026-09-21T01:49:37 | 1d 23:37 |
| `6ba107e1…` (slide 1) | 2026-09-21T01:50:32 | 1d 23:38 |

Uma observação que vale registrar: se você substituir qualquer uma dessas
posições **de novo** antes de 21/09, o predecessor mais antigo passa a ter uma
cadeia de dois elos. Com a regra anterior ele nunca sairia; com esta, sai na
hora marcada. Esse é um teste que a realidade faria sozinha.

```text
PURGE_DRY_RUN = PASS
```

---

## 6. Baseline

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 136/136 | **145/145** | +9 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos arquivos tocados | 0 | **0** | 0 |

---

## 7. Arquivos

**Alterados:**
```
lib/redator/media-purge-plan.ts      resolveSuccessorChain + guardas por cadeia
lib/redator/version-purge-plan.ts    resolveVersionChain; planVersionPurge recebe as linhas do dono
lib/server/writer-purge-service.ts   agrupa versões por dono antes de decidir
tests/redator-purge-dry-run.test.mts 25 testes (+9); o 05 corrigido
```

**Não tocados:** banco, migrations, Storage, rota, DNA, Radar, SERP.

---

```text
MEDIA_CHAIN_AWARE_PURGE = YES
VERSION_CHAIN_AWARE_PURGE = YES
BROKEN_CHAIN_FAILS_CLOSED = YES
DIRECT_SUCCESSOR_MUST_BE_CURRENT = NO
PURGE_DRY_RUN = PASS
REAL_DELETE_EXECUTED = NO
CRON_CONFIGURED = NO
PURGE_REACHABLE = NO — WRITER_PURGE_TOKEN não definido
REGRESSIONS = NONE
```
