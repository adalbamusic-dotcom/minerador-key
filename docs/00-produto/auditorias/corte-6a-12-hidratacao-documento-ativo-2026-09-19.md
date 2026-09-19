# Corte 6A.12 — o fallback não grava durante a hidratação

**2026-09-19** · frente Redator · **sem migration, sem tabela, sem schema**

---

## 1. A auditoria pedida, e o que ela achou

> *Auditar primeiro se o pipeline já expõe um estado de hidratação/loading para
> `documentUserStates`. Reusar se existir.*

**Não existe, e o que existe afirma o contrário.**

`WorkspaceLoadDiagnostics` tem cinco estados e nenhum significa "ainda não
perguntei":

```ts
// lib/editorial/partial-read.ts:58
export const WORKSPACE_LOAD_STATES = [
  "complete", "partial", "empty_confirmed", "access_denied", "read_failure",
] as const;

// :81 — e o valor inicial é este
export const emptyLoadDiagnostics = () => ({ state: "empty_confirmed", … });
```

Quer dizer: **antes de qualquer leitura, o workspace já declara "a consulta
respondeu e a marca não tem registros mesmo"**. É a mesma mentira que o comentário
do próprio arquivo diz querer evitar — "dizia que a marca não tinha artigos
quando na verdade a consulta havia falhado" — só que na casa do vizinho.

`persistenceMode` também não serve: nasce `"local_fallback"`, que é um valor
legítimo de desfecho.

Então criei o booleano, como o enunciado autoriza: `documentUserStatesReady` em
`BrandWorkspace`, exposto pelo contexto porque o valor já é `{ ...workspace }`.
Nenhuma tabela, nenhum schema, nenhum `localStorage`.

---

## 2. Onde estava a janela

Não era a ordem da regra. Era esta linha:

```ts
// components/editorial-pipeline-context.tsx:555 — recuperação local
documents: recovered.documents,      // ← a lista vem do navegador
                                     // ← e os user states NÃO vêm
```

A recuperação local restaura os documentos do `localStorage` e não restaura o
mapa de user states. Existe, portanto, uma janela real com **lista cheia e mapa
vazio** — e ali `documents[0]` parecia um fallback legítimo:

```text
t0  recuperação local  → documents cheio, userStates {}  → fallback → documents[0]
                                                         → GRAVA last_opened_at  ✗
t1  leitura do servidor → userStates chegam              → o certo vence
                                                         → grava de novo
```

Foi exatamente o que a leitura ao vivo mostrou: um carregamento, dois documentos
gravados, o errado primeiro.

Meu argumento do 6A.10 — "o fallback só é alcançado quando não há o que
preservar" — só valia com o mapa já carregado. Eu tratei a ausência de dados como
ausência de fatos.

---

## 3. A regra

`lib/redator/active-document.ts` ganha uma origem e um insumo:

```text
1. a escolha desta sessão                        resolve já
2. a URL ?documentId=                            resolve já
-- daqui para baixo depende de saber o que já foi aberto --
3. user states não chegaram  → "pending"         a tela espera
4. o lastOpenedAt mais recente                   atravessa o F5
5. o primeiro da lista                           só sem nenhum dos anteriores
```

E a decisão de gravar deixa de olhar só a origem:

```ts
export function shouldPersistLastOpened(input: {
  origin: ActiveDocumentOrigin; documentId: string; userStatesReady: boolean;
}): boolean {
  if (!input.documentId) return false;
  if (input.origin === "pending" || input.origin === "none") return false;
  if (input.origin === "session" || input.origin === "url") return true;
  return input.userStatesReady;      // ← last_opened e fallback
}
```

O raciocínio das duas últimas linhas: `session` e `url` são **escolhas**, e não
melhoram quando o mapa chegar — travá-las seria travar a tela à toa. Já
`last_opened` e `fallback` são **conclusões tiradas do mapa**; tirar conclusão de
um mapa que não chegou é inventar, e aqui inventar significa escrever no banco.

`userStatesReady` é obrigatório de propósito: um `undefined` silencioso
significaria "assuma que chegou", que é o defeito.

### 3.1 A readiness vira `true` em três lugares

Nos três desfechos da leitura do workspace — sucesso, resposta ruim e exceção.
Depois de uma falha os user states continuam desconhecidos, mas manter `false`
travaria a tela para sempre; o preço honesto é um fallback que a próxima leitura
corrige. A recuperação local **não** marca: é justamente ela que traz lista sem
mapa.

### 3.2 Sem flash

Durante a espera `selected` é `null` — nenhum documento provisório é montado — e
a lista mostra "Carregando o que você abriu por último…". Isso substitui a
mensagem "Nenhum rascunho disponível", que durante a hidratação era a mesma
mentira do `empty_confirmed`.

---

## 4. Testes — 19/19

| Marcador do enunciado | Teste |
| --- | --- |
| `DOCS_READY_USER_STATES_PENDING_DOES_NOT_PERSIST_FALLBACK` | 01 |
| `PERSISTED_SELECTION_AFTER_HYDRATION_WINS` | 02 |
| `ONE_MOUNT_WRITES_ONLY_FINAL_ACTIVE_DOCUMENT` | 02, 03 |
| `EXPLICIT_SESSION_SELECTION_CAN_RESOLVE_EARLY` | 04 |
| `EXPLICIT_URL_SELECTION_CAN_RESOLVE_EARLY` | 05 |
| `LOADED_EMPTY_USER_STATE_ALLOWS_FALLBACK` | 03 |
| `F5_DOES_NOT_TOUCH_UNSELECTED_DOCUMENT` | 06 |

Os dois cenários pedidos estão nos testes 02 e 03, literalmente na sequência do
enunciado. O modelo de sessão registra **cada gravação** num log — sem isso dá
para afirmar "A ficou ativo" sem notar que B foi gravado no caminho, que era o
defeito.

Estrutural: 16 (o contexto), 17 (a tela passa a hidratação), 18 (a espera não
monta documento provisório), 19 (o que o 6A.9/6A.10 já guardava).

### 4.1 Mutantes — 14, todos mortos

Cobrindo os três arquivos: o passo de hidratação removido, a hidratação posta na
frente da sessão, a origem derivada gravando sem hidratação, a gravação sem
documento, `session`/`url` passando a exigir hidratação, `pending` virando
gravável, o workspace vazio já se declarando hidratado, um dos três desfechos
deixando de marcar, a recuperação local mentindo que trouxe user states, a tela
fingindo hidratação, a gravação voltando a olhar só a origem, e a espera sumindo.

Um deles não foi encontrado na primeira passada: a âncora de várias linhas com
`\n` não casa no contexto, que está em CRLF. O script passou a tentar as duas
formas — sem isso o mutante teria contado como "não aplicável" em vez de
"sobreviveu".

---

## 5. Bateria

| Suíte | Baseline | Agora |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** |
| `test:redator` | 277/277 | **282/282** |
| `test:redator:mcp` | 2/2 | **42/42** (outra sessão ampliou) |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** |
| `test:radar` | 2250/2250 | **2259/2259** |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** |
| `planejador` | 16/16 | **16/16** |
| `eslint` (erros) | 124 | **124 — os mesmos dois arquivos** |

Os três arquivos desta rodada saem com 0 erros.

---

## 6. Verificação ao vivo

Dois carregamentos consecutivos no dev server, medindo `last_opened_at` antes e
depois de cada um:

```text
carregamento 1 — sem URL, resolve por lastOpenedAt
  skin care noturno          10:25:16.992 → 10:26:09.065   (o ativo)
  skincare para pele oleosa  10:24:56.704 → 10:24:56.704   INTOCADO

carregamento 2 — com ?documentId= do outro documento
  skincare para pele oleosa  10:24:56.704 → 10:26:36.989   (o ativo, por URL)
  skin care noturno          10:26:09.065 → 10:26:09.065   INTOCADO
```

**Uma montagem, uma gravação.** Antes da correção o mesmo carregamento gravava os
dois, com o errado primeiro.

O segundo carregamento também deixou o ambiente como a homologação precisa:
*"skincare para pele oleosa"* é o documento ativo e o de `lastOpenedAt` mais
recente, então atravessa F5, reordenação e handoff novo.

---

## 7. Uma coisa que eu causei

A bateria de mutantes roda reescrevendo os arquivos, e o seu dev server estava no
ar recompilando por HMR. As duas gravações de **10:24:56 e 10:25:16** — que são o
padrão antigo, com o documento errado por último — provavelmente vieram de um
carregamento seu contra código mutado.

Parei o servidor antes da primeira bateria por causa disso; na segunda passada o
seu já estava no ar e eu não parei de novo. Da próxima vez aviso antes.

---

```text
DOCS_READY_USER_STATES_PENDING_DOES_NOT_PERSIST_FALLBACK = YES
PERSISTED_SELECTION_AFTER_HYDRATION_WINS = YES
ONE_MOUNT_WRITES_ONLY_FINAL_ACTIVE_DOCUMENT = YES   (provado ao vivo, §6)
EXPLICIT_SESSION_SELECTION_CAN_RESOLVE_EARLY = YES
EXPLICIT_URL_SELECTION_CAN_RESOLVE_EARLY = YES      (provado ao vivo, §6)
LOADED_EMPTY_USER_STATE_ALLOWS_FALLBACK = YES
F5_DOES_NOT_TOUCH_UNSELECTED_DOCUMENT = YES

HYDRATION_AUTHORITY_REUSED = NO — nenhuma existia (§1)
HYDRATION_AUTHORITY_CREATED = documentUserStatesReady, cliente/contexto
MIGRATION_REQUIRED = NO
SCHEMA_MODIFIED = NO
DATABASE_MODIFIED = NO — só last_opened_at, que é o que abrir a tela faz
VISUAL_FLASH_AVOIDED = YES — selected null + "Carregando…", sem documento provisório
REGRESSIONS = NONE

CORTE_6A_EDITOR_LIFECYCLE_READY_TO_CLOSE = NO
REOPEN_REFINALIZE_CYCLES_IN_DATABASE = 0
```
