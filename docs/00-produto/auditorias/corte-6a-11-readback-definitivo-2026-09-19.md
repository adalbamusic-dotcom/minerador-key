# Corte 6A.11 — readback definitivo da homologação

**2026-09-19 · 08:16:50 UTC** · **somente leitura** — nenhum código, banco ou migration alterado

---

## 1. O resultado, sem rodeio

**Nada mudou no banco.** Não desde a rodada passada, não desde 05:02:58.

A leitura cobriu as tabelas inteiras, sem filtro de marca: existem 2 documentos,
2 entregáveis, 4 versões, 2 linhas de estado de usuário. Nenhuma linha nova,
nenhuma linha alterada.

| | 07:52 | 08:09 | **08:16** |
| --- | --- | --- | --- |
| `writer_deliverables.updated_at` | 05:02:58 | 05:02:58 | **05:02:58** |
| `writer_deliverables.lock_version` | 5 | 5 | **5** |
| versões de entregável | 4 | 4 | **4** |
| último `last_opened_at` | 07:14:27 | 07:14:27 | **07:14:27** |
| `publication_records` | 0 | 0 | **0** |

---

## 2. Duas provas que não dependem de interpretação

### 2.1 `lock_version` continua 5

O gatilho `pipeline_editorial_touch_lock_version` **não tem cláusula `WHEN`** —
dispara em todo `UPDATE` da linha:

```sql
NEW.lock_version := OLD.lock_version + 1;
NEW.updated_at := now();
```

Quer dizer: **reabrir para edição, sozinho, já bumparia o `lock_version`**, mesmo
que nada mais acontecesse depois. Ele está em 5 nos dois entregáveis, o mesmo
valor de 05:02.

Isto exclui o ciclo inteiro de uma vez só. Não é "a refinalização não gravou": é
que **nenhum `UPDATE` de qualquer natureza tocou essas linhas** desde 05:02:58.

### 2.2 `last_opened_at` continua 07:14:27

Esta é nova, e é a mais informativa. A tela grava `last_opened_at` **a cada
abertura de documento**, com 500 ms de debounce — é o mecanismo que o Corte
6A.10 acabou de tornar autoridade.

O valor mais recente é 07:14:27, em *"skin care noturno"*. O de *"skincare para
pele oleosa"* continua 06:24:12.

Isto é mais forte que "o ciclo não rodou". Significa que **a tela do Redator não
foi aberta** desde 07:14 — mais de uma hora antes desta leitura, e **antes de a
correção do 6A.10 existir**.

---

## 3. A correção do 6A.10 nunca foi exercida

Os arquivos foram para o disco às **08:04:59 UTC**. O último sinal de vida da
tela é de **07:14:27**. Não há sobreposição: nenhum carregamento de página passou
pelo código novo.

Como eu escrevi esse código, não posso encerrar o assunto dizendo apenas "a tela
não foi aberta". O que posso verificar sem a interface, verifiquei:

| Verificação | Resultado |
| --- | --- |
| `npx tsc --noEmit` | 0 erros |
| `eslint` nos dois arquivos | limpo |
| `test:redator` | 264/264, com 4 testes estruturais sobre esta tela |
| `documentUserStates` pode ser `undefined` em runtime? | não — campo obrigatório, inicializado `{}` (`editorial-pipeline-context.tsx:108`) e mesclado na carga (`:480`) |
| o acesso é novo? | não — o efeito de `:206` já lia `pipeline.documentUserStates[selected.id]` antes desta rodada |

Erro de compilação está descartado (derrubaria a rota com 500). Erro de runtime
na montagem é o resíduo que **só um carregamento real fecha** — e é exatamente o
que o passo 1 da homologação produz.

---

## 4. Marcadores

Nenhum pode ser fechado como PASS. Não por divergência: por **ausência de
evidência**.

```text
/* §1 · persistência da seleção */
ACTIVE_DOCUMENT_SURVIVES_F5 = FAIL (não executado — tela não foi aberta)
ACTIVE_DOCUMENT_SURVIVES_SECOND_F5 = FAIL (não executado)
FALSE_LAST_OPENED_CONTAMINATION_CORRECTED_BY_REAL_SELECTION = NO
  last_opened_at mais recente continua sendo "skin care noturno" (07:14:27);
  "skincare para pele oleosa" continua em 06:24:12

/* §2 · Roteiro */
REOPEN_UNCHANGED_UI = FAIL (não executado — lock_version continua 5)
UNCHANGED_CREATED_NEW_VERSION = NÃO AVALIÁVEL (o ciclo não rodou)
UNCHANGED_CHANGED_CURRENT_VERSION = NÃO AVALIÁVEL
UNCHANGED_STARTED_RETENTION = NÃO AVALIÁVEL
SCRIPT_REFINALIZATION_CHANGED_UI = FAIL (não executado)
SCRIPT_NEW_VERSION_CREATED = NO (continuam 2 versões: v1 e v2 de 05:02:58)
SCRIPT_PREVIOUS_VERSION_CORRECT = NÃO AVALIÁVEL (v2.previous_version_id = null, decisão M4)
SCRIPT_PREDECESSOR_SUPERSEDED = NO (superseded_at null nas duas)
SCRIPT_PURGE_AFTER_48H = NÃO AVALIÁVEL (purge_after null nas duas)
SCRIPT_CURRENT_PURGE_AFTER_NULL = YES (mas trivialmente — nada foi supersedido)

/* §3 · Carrossel — idêntico */
CAROUSEL_REOPEN_UNCHANGED_UI = FAIL (não executado — lock_version continua 5)
CAROUSEL_UNCHANGED_CREATED_NEW_VERSION = NÃO AVALIÁVEL
CAROUSEL_REFINALIZATION_CHANGED_UI = FAIL (não executado)
CAROUSEL_NEW_VERSION_CREATED = NO (continuam 2 versões: v1 e v2 de 05:02:37)
CAROUSEL_PREVIOUS_VERSION_CORRECT = NÃO AVALIÁVEL
CAROUSEL_PREDECESSOR_SUPERSEDED = NO
CAROUSEL_PURGE_AFTER_48H = NÃO AVALIÁVEL
CAROUSEL_CURRENT_PURGE_AFTER_NULL = YES (trivialmente)

/* §4 · mídia */
FINALIZED_MEDIA_PREVIEW_UI = NOT_CONFIRMED
SERVER_SIDE_MEDIA_GUARDS_PRESENT = YES (§5)

/* §5 · Publicações */
PUBLICATION_RECORD_CREATED_AUTOMATICALLY = NO
  apoiado nas duas finalizações reais de 05:02, que criaram 0 publication_records

/* §6 · encerramento */
SCRIPT_FINALIZATION_UI_E2E = PASS na primeira finalização · ciclo reopen/refinalização NOT_EXECUTED
CAROUSEL_FINALIZATION_UI_E2E = PASS na primeira finalização · ciclo reopen/refinalização NOT_EXECUTED
F5_PERSISTENCE = NOT_EXECUTED (corrigido em código no 6A.10, nunca carregado)
CORTE_6A_EDITOR_LIFECYCLE_READY_TO_CLOSE = NO

CODE_MODIFIED_THIS_ROUND = NO
DATABASE_MODIFIED = NO
MIGRATION_OPENED = NO
```

---

## 5. Guardas de mídia — confirmação estrutural

Intactas, em 6 pontos de chamada, nos dois módulos de I/O:

| Arquivo | Linhas |
| --- | --- |
| `lib/server/writer-deliverables.ts` | 424, 450 — lançam `WriterDeliverableError(..., 409)` com `MENSAGEM_ENTREGAVEL_FINALIZADO` |
| `lib/server/writer-media-lifecycle.ts` | 190, 330, 392 |
| `lib/server/writer-media-guard.ts` | 55, 80 — a autoridade |

A recusa é do servidor, não da interface. `FINALIZED_MEDIA_PREVIEW_UI` continua
`NOT_CONFIRMED` porque o banco não tem como provar que uma signed URL apareceu na
tela — isso é confirmação visual sua, e continua pendente.

---

## 6. O caminho mais curto para sair disto

A leitura anterior custou seis rodadas a mais do que precisava porque a evidência
só foi verificada no fim. Dá para cortar isso para **um passo**:

**Abra a tela do Redator e me avise.** Só isso — sem ciclo, sem finalizar nada.

Em menos de um segundo `last_opened_at` deve se mover. Uma consulta resolve:

* **se mover** → a tela carregou o código novo, a persistência está viva, e aí
  sim vale rodar o ciclo inteiro;
* **se não mover** → o problema não é o ciclo nem o documento ativo. É que esta
  tela não está chegando neste banco, e a investigação muda de lugar: qual porta
  o navegador está aberto, se o servidor é o de `:3000`, se a aba não é antiga,
  se o build é o de desenvolvimento.

Depois que o passo 1 passar:

1. clicar em *"Cobrir com clareza o tema «skincare para pele oleosa»"* e conferir
   o rótulo **"· em edição"** nele — isto também corrige o `last_opened_at`
   contaminado de 07:14;
2. **F5** — o rótulo tem de continuar no mesmo documento;
3. Roteiro: **Reabrir** → **Finalizar** sem alterar → **Reabrir** → editar uma
   cena → **Salvar** → **Finalizar**;
4. o mesmo no Carrossel.

O passo 3 sozinho já muda `lock_version` de 5 para 6 no primeiro clique em
**Reabrir**. É o sinal mais barato de que a homologação encostou no banco.
