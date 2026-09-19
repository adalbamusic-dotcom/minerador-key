# Corte 5.2 — purga executada de verdade, contra fixture isolada

**Data:** 2026-09-19
**Não executado:** cron, migration, DDL, deploy, commit, push.
**Os nove ativos reais do usuário não foram tocados** — conferido antes e depois.

O caminho completo foi percorrido de ponta a ponta com DELETE real: dry-run →
elegível → execute → remoção no Storage → RPC de purga → readback → repetição.

---

## 1. O isolamento veio primeiro

A fixture não mora perto dos dados reais. Ela foi criada em **outra marca**:

| | Marca | Documento |
| --- | --- | --- |
| Ativos reais do usuário | `09762023…` Care Glow | o artigo de skincare |
| **Fixture** | `4a737e74…` Somatec Blocking | `fixture-purge-52-doc` |

Nenhum id dos nove ativos reais aparece em nada desta rodada. E como a rota é
escopada por marca, executar na fixture **não tem como** alcançar a Care Glow —
o isolamento é estrutural, não uma promessa de cuidado.

### 1.1 A fixture

Três pares predecessor/sucessor, todos `article_block` em âncoras próprias:

| Caso | Predecessor | Objeto no Storage |
| --- | --- | --- |
| 1 · caminho completo | `ff6d4d29…` | **PNG real enviado ao bucket** |
| 2 · objeto já ausente | `c0cc1482…` | caminho para onde nada foi enviado |
| 3 · chave malformada | `1ffc4bba…` | caminho de 917 caracteres com quebra de linha |

Todos com `superseded_at` 49h no passado e, portanto, `purge_after` vencido há
1h — o CHECK de retenção amarra os dois, então a janela vencida é consequência,
não um valor escolhido à parte.

Os dois PNGs do caso 1 foram enviados de verdade, via
`supabase storage cp`, e confirmados no bucket antes de qualquer purga.

---

## 2. O token

Gerado com `randomBytes(32)` e gravado **apenas** em `.env.local`, que o
`.gitignore` cobre (`.gitignore:34`) e que o git não rastreia. O valor nunca foi
impresso: nem em log, nem em terminal, nem neste documento. As chamadas à rota
passaram por um script que lê o arquivo e monta o header, sem exibir nada.

O Next recarregou o `.env.local` sozinho — a primeira chamada sem header já
respondeu **404** em vez de 503, provando que a variável tinha sido lida. **Não
foi preciso reiniciar a porta 3000**, e eu não reiniciei nada.

Conferido ao fim da rodada: sem o header, a rota continua devolvendo **404**,
inclusive pedindo `mode=execute`.

---

## 3. Dry-run, antes de qualquer escrita

| Marca | Elegíveis | Recusas |
| --- | --- | --- |
| **Fixture** | **1** — `ff6d4d29…` | `not_superseded: 1` |
| **Real (usuário)** | **0** | `not_superseded: 5`, `window_open: 4` |

```text
FIXTURE_ELIGIBLE = YES
REAL_WINDOW_OPEN_ASSETS_ELIGIBLE = NO
CURRENT_ASSETS_ELIGIBLE = NO
```

O dry-run devolveu o item com `storagePath`, `supersededAt`, `purgeAfter` e
`successorAssetId` — tudo o que a execução usaria, antes de usar.

---

## 4. A execução

```json
{ "assetId": "ff6d4d29…", "result": "purged", "storage": "removed" }
resumo: { purgados: 1, falhas_de_storage: 0 }
versões: { documentVersionsPurged: 0, deliverableVersionsPurged: 0 }
```

### 4.1 Readback

| Verificação | Resultado |
| --- | --- |
| objeto do predecessor no bucket | **removido** — a pasta passou a listar só o sucessor |
| linha do predecessor no banco | **removida** (0) |
| linha do sucessor | presente (1) |
| objeto do sucessor | presente (1) |
| sucessor continua corrente do anchor | **YES** |
| ativos reais do usuário | **9 linhas, 9 objetos, os 4 predecessores intactos** |
| `editorial_artifact_versions` | **555**, inalterado |
| versões estruturais | `content_document_versions` 0 · `writer_deliverable_versions` 2 |

```text
STORAGE_DELETE_REAL = PASS
DATABASE_PURGE_REAL = PASS
REAL_USER_ASSETS_TOUCHED = NO
```

### 4.2 Segunda execução

```json
{ "outcomes": [], "resumo": { "total": 0, "purgados": 0 } }
```

Status 200, lista vazia, nenhum erro. A linha já não está na tabela, então nem
chega a ser candidata — a idempotência aqui não é um tratamento especial, é
consequência de a seleção partir do estado atual.

```text
SECOND_EXECUTION_ERROR = NO
DUPLICATE_EFFECT = NO
IDEMPOTENT_SECOND_RUN = PASS
```

---

## 5. Objeto já ausente no Storage

Caso 2: linha elegível apontando para um caminho onde **nada foi enviado**.

```json
{ "assetId": "c0cc1482…", "result": "purged", "storage": "removed" }
```

A limpeza da linha **concluiu**, que é o comportamento exigido.

Uma precisão que vale registrar: o desfecho veio como `removed`, e não
`already_absent`. Não é uma falha do serviço — é que **a API de Storage do
Supabase não devolve erro para objeto inexistente**; ela responde sucesso. O
ramo `already_absent` existe para APIs e versões que devolvem 404, e continua
coberto por teste unitário. O requisito — tratar como já removido e concluir —
está atendido pelos dois caminhos.

```text
STORAGE_ALREADY_MISSING = PASS
```

---

## 6. Falha de Storage que não é "not found" — o que eu NÃO consegui provar

Caso 3 foi uma tentativa de induzir erro real: `storage_path` com 917
caracteres, incluindo quebra de linha. A API **aceitou**, devolveu sucesso, e a
linha foi purgada.

Ou seja: **não consegui produzir uma falha real de Storage** pelos meios que
controlo. A API é permissiva com chaves ausentes e malformadas, e as causas que
produziriam `failed` — rede, permissão, bucket errado — exigiriam degradar o
ambiente de propósito.

O que existe de prova para este caso:

- `classifyStorageRemoval` devolve `failed` para 500, 403, `fetch failed` e 400 —
  teste unitário 08 e 11;
- `canDeleteRowAfterStorage("failed")` é `false`;
- o serviço faz `continue` antes de chamar a CONFIRM quando a classificação é
  `failed` — teste estrutural 13 confere a ordem no código.

Isso é cobertura de unidade e de estrutura, **não** de caminho real.

```text
STORAGE_FAILURE_PRESERVES_ROW = PASS (unitário + estrutural) — caminho real NÃO exercitado
```

Registro assim de propósito. Marcar PASS liso daria a impressão de que uma falha
real de Storage foi observada preservando a linha, e ela não foi.

---

## 7. O que sobrou da fixture

Três ativos **correntes**, um por âncora, na marca Somatec Blocking, mais o
documento `fixture-purge-52-doc`:

```text
f0f03f34-5f2e-4beb-bc35-3d4bd06d43b6   fixture-bloco-1   (com objeto no bucket)
ba077573-8b25-44ac-8815-fb05db9f16fc   fixture-bloco-2   (sem objeto)
0f653609-2c77-4c0e-944f-e4db18c634d9   fixture-bloco-3   (sem objeto)
```

Não os apaguei: são **correntes**, e portanto não elegíveis à purga. Removê-los
exigiria um DELETE por fora da autoridade da M3 — exatamente o que este corte
existe para não fazer. Ficam registrados para limpeza controlada quando você
quiser.

Os três predecessores da fixture foram purgados e não existem mais.

---

## 8. Baseline

| Suíte | Baseline | Agora |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** |
| `test:redator` | 145/145 | **145/145** |
| `test:redator:mcp` | 2/2 | **2/2** |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** |
| `test:radar` | 2236/2236 | **2236/2236** |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** |

Nenhum arquivo de código foi alterado nesta rodada — ela foi de execução e
verificação.

---

```text
PURGE_EXECUTE_FIXTURE = PASS
STORAGE_DELETE_REAL = PASS
DATABASE_PURGE_REAL = PASS
IDEMPOTENT_SECOND_RUN = PASS
STORAGE_ALREADY_MISSING = PASS
STORAGE_FAILURE_PRESERVES_ROW = PASS (unitário/estrutural) — caminho real não induzido
REAL_USER_ASSETS_TOUCHED = NO
CRON_CONFIGURED = NO
REGRESSIONS = NONE
```

### Fechado no Corte 5.3

As três fixtures correntes foram removidas e a rota foi desarmada —
`WRITER_PURGE_TOKEN` saiu do `.env.local` e a rota voltou a responder
`purge_not_configured`. Ver [corte-5-3-fechamento-purge-2026-09-19.md](corte-5-3-fechamento-purge-2026-09-19.md).

**O próximo teste real de purga só depois de 2026-09-21 01:50 UTC**, quando as
quatro janelas dos ativos reais vencerem naturalmente.

### A decisão que era sua, e foi tomada

`WRITER_PURGE_TOKEN` está agora definido no `.env.local` local. Enquanto ele
existir, quem tiver o valor pode executar purga real nesta máquina. Se preferir
o estado anterior — fechado por ausência de configuração — basta remover a linha
do arquivo. Eu não a removi porque ela é o que torna a rota utilizável, e essa é
uma escolha sua, não minha.
