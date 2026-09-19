# Corte 6A.5 — idempotência e retry seguro da finalização do Artigo

**2026-09-19** · frente Redator · **sem migration**

---

## 1. Auditoria da ordem completa

```text
professional-writer.tsx
  hash = contentHash(pending)            canonicalização do contrato editorial
  requestStatus("aprovado")              createVersionRef.current = true
        ↓  PATCH /api/editorial/documents { document, contentHash, expectedLockVersion, createVersion }
route.ts
  repository.save(...)                   UPDATE ... WHERE id=? AND lock_version=?
  finalizeArticleVersion(...)
      createVersion(...)                 INSERT com previous = a última versão
      promoteVersionToCurrent(...)       UPDATE current_version_id
      readFinalizationState(...)         READBACK
      verifyFinalizationReadback(...)    status · corrente · hash
      markArticlePredecessorSuperseded   só depois de confirmado
  → receipt { lockVersion, updatedAt, contentHash, version }
```

### 1.1 Duas requisições concorrentes podem criar duas versões?

**Não**, e a garantia é do banco.

Leitura remota, somente SELECT:

```text
CREATE TRIGGER content_documents_touch_trg BEFORE UPDATE ON public.content_documents
  FOR EACH ROW EXECUTE FUNCTION pipeline_editorial_touch_lock_version()

  BEGIN
    NEW.lock_version := OLD.lock_version + 1;
    NEW.updated_at := now();
    RETURN NEW;
  END;
```

**Não há cláusula `WHEN`.** O lock é incrementado em **todo** `UPDATE`, inclusive
um que não mudasse valor nenhum. Essa ausência é o que torna o optimistic lock
confiável aqui.

Com duas requisições de mesmo `expectedLock = N`:

1. Ambas chegam em `repository.save()`, que emite
   `UPDATE ... WHERE id = ? AND lock_version = N`.
2. A segunda **bloqueia na linha** até a primeira commitar.
3. Liberada, ela reavalia o predicado contra a versão nova da linha —
   `lock_version` agora é `N+1` → **zero linhas** → `OptimisticLockError`.
4. Ela **nunca chega** em `createVersion`.

Segunda rede, para qualquer corrida hipotética que passasse: existe
`content_document_versions_identity_unique :: UNIQUE (document_id, version_number)`.
Dois `INSERT` concorrentes que computassem o mesmo `version_number` colidiriam
com 23505.

```text
ATOMIC_FINALIZATION_REQUIRED = NO
MIGRATION_REQUIRED = NO
```

A comparação em TypeScript **não** é o que impede o duplicado concorrente — ela
resolve outro problema, o das requisições **sequenciais** (clique duplicado e
retry). Os dois mecanismos cobrem coisas diferentes e estão documentados assim
no teste 21.

---

## 2. O que faltava: sequencial, não concorrente

| Cenário | Antes desta rodada |
| --- | --- |
| clique duplicado, o 2º chega depois da resposta do 1º | criava versão duplicada |
| retry após timeout (cliente com lock vencido) | `409` — "falhou" para algo que deu certo |
| duas requisições simultâneas | já era seguro: `409` na segunda |

O primeiro caso criava duplicata. O segundo mentia. Nenhum dos dois era
concorrência.

---

## 3. A regra

`planArticleFinalization`, pura, em `lib/redator/deliverable-lifecycle.ts`. As
**três** condições precisam valer juntas para reusar:

| Condição | O que ela cobre |
| --- | --- |
| `document.status === targetStatus` | ninguém reabriu nem mudou de estado |
| `document.contentHash === incoming` | ninguém salvou rascunho por cima depois |
| `currentVersion.contentHash === incoming` | a corrente é MESMO esta finalização |

Faltando qualquer uma, o plano é **criar**. É o lado certo do erro: criar versão
a mais gera duplicata visível; reusar indevidamente engoliria uma finalização de
verdade, e o trabalho da pessoa não viraria versão nenhuma.

Documento ausente ou sem corrente também caem em `create_version` — falha para o
lado de criar.

---

## 4. Onde a pergunta é feita — duas vezes, de propósito

```ts
// 1. ANTES de escrever: clique duplicado, ou retry cujo lock ainda vale
if (input.createVersion) {
  const jaFeito = await reuseFinalizedArticleVersion({ ... });
  if (jaFeito) return NextResponse.json({ ... });
}

let saved;
try {
  saved = await repository.save(...);
} catch (erro) {
  // 2. DEPOIS de um conflito de lock: o retry cujo lock ficou para trás
  if (input.createVersion && erro instanceof OptimisticLockError) {
    const jaFeito = await reuseFinalizedArticleVersion({ ... });
    if (jaFeito) return NextResponse.json({ ... });
  }
  throw erro;
}
```

O segundo momento é o do **timeout**: a gravação aconteceu, a resposta se perdeu,
e o cliente repete com o lock antigo. Recusar ali seria dizer "falhou" para algo
gravado exatamente como foi pedido.

**Isso não é deduplicação depois do fato.** A escrita aconteceu **uma** vez,
barrada pelo próprio `WHERE lock_version = ?`. O que se reconhece é que o estado
desejado já é o estado persistido. Se o que está gravado for **outro** conteúdo,
o plano devolve `create_version`, o reuso não acontece e o `409` sobe intacto.

`reuseFinalizedArticleVersion` **não escreve nada**: lê o documento, lê a versão
apontada, aplica a regra pura e devolve. Sem `save`, sem `createVersion`, sem
`promoteVersionToCurrent`, sem marcação de retenção (teste 20).

---

## 5. Conteúdo alterado

Só quando o hash material difere:

```text
A → criar B → B.previous = A → promover B → readback B → supersede A
```

Inalterado desde o Corte 6A.4.

```text
RETENTION_AFTER_READBACK_ONLY = YES
```

---

## 6. Lock

Promover a corrente dispara o trigger, então **todo** caminho devolve o lock
efetivamente corrente:

| Caminho | Lock devolvido |
| --- | --- |
| reuso (nada escrito) | o que está no banco agora |
| finalização normal | o do readback, pós-movimento do ponteiro |
| readback reprovado | o que foi lido, ou `null` |
| retenção pulada | o do readback |

A próxima gravação do usuário não recebe conflito causado pela própria
finalização — nem pela que aconteceu, nem pela que foi reconhecida.

A tela também deixou de mentir: `reused: true` faz a mensagem dizer
"Versão N já estava finalizada; nada foi criado" em vez de "criada e salva".

---

## 7. Testes

`tests/redator-artigo-save-sem-historico.test.mts` — **22/22**, dentro de
`test:redator`. Os novos:

| # | Natureza | Cobre |
| --- | --- | --- |
| 17 | COMPORTAMENTAL | o plano só reusa com as três condições; cada uma derruba sozinha |
| 18 | COMPORTAMENTAL | o ciclo: primeira → idêntica → mudança → idêntica de novo |
| 19 | ESTRUTURAL | a rota pergunta antes de escrever, e de novo depois do conflito |
| 20 | ESTRUTURAL | reconhecer finalização já feita não escreve nada |
| 21 | ESTRUTURAL | a concorrência é barrada pelo banco, não por comparação em TS |
| 22 | ESTRUTURAL | todo caminho devolve o lock corrente e diz se reusou |

Cobertura pedida, ponto a ponto:

| Pedido | Onde |
| --- | --- |
| primeira finalização → A | 18 (passo 1), 09 |
| finalize idêntico → A, total continua 1 | 17, 18 (passo 2), 20 |
| retry idêntico após promoção → mesma versão | 19 (ramo do conflito), 18 |
| mudança material → B, previous = A, retenção só após readback | 18 (passo 3), 10, 13 |
| finalize B idêntico → B, nenhuma C | 18 (passo 4) |
| requests concorrentes → comportamento definido e seguro | 21 + §1.1 |

### 7.1 Mutantes

| Mutante | Morto por |
| --- | --- |
| o plano ignora o status e reusa mesmo reaberto | 17 |
| o plano ignora o hash do documento | 17 |
| o plano ignora o hash da versão corrente | 17 |
| o reuso passa a escrever (promove a corrente) | 20 |
| a rota deixa de perguntar antes de escrever | 19 |
| o retry pós-conflito aceita qualquer conteúdo | 19 |
| o save perde o `UPDATE` condicional por lock | 21 |

Todos tocaram TypeScript que o dev server compila; cada um viveu ~3s, era
TypeScript válido, e os arquivos foram restaurados.

Três testes das rodadas anteriores (14, 15, 16) apontavam para formas que esta
rodada mudou legitimamente — a linha de `import`, `versionContentHash` que virou
`versionSummary`, e o `select` do readback que ganhou `updated_at`. As âncoras
foram atualizadas sem afrouxar o que garantiam; a do 16 passou a cobrar a
**coluna** em vez da lista inteira, que quebraria a cada coluna nova.

---

## 8. Bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 225/225 | **231/231** | +6 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos arquivos tocados | — | **0 erros, 0 avisos** | — |

Nenhuma escrita remota: só leituras do gatilho, das constraints e do estado.

---

## 9. Não tocado

`save draft`, MCP draft, Roteiro, Carrossel, Publicações, M1–M6, mídia e purge.
A única mudança fora da finalização foi extrair `documentStatusColumn` de dentro
de `save` para um helper exportado — a tradução de status passou a ter **uma**
cópia, usada pelo save e pela pré-checagem. Comportamento idêntico.

---

## 10. O que não foi exercitado

Nada disso passou pela tela: chegar ao Redator exige sessão, e não digito
credenciais. Os testes provam a decisão e a ordem escrita; a leitura remota prova
o mecanismo de lock e as constraints.

Quando o primeiro ciclo real acontecer, o traço é conferível: uma finalização
idêntica repetida deixa `content_document_versions` com **a mesma contagem**, o
mesmo `current_version_id`, e nenhuma linha nova em retenção.

---

```text
ARTICLE_FINALIZATION_IDEMPOTENT = YES
ARTICLE_FINALIZATION_RETRY_SAFE = YES
ARTICLE_FINALIZATION_CONCURRENCY_SAFE = YES
DUPLICATE_FINAL_VERSION_POSSIBLE = NO
RETENTION_AFTER_READBACK_ONLY = YES
ATOMIC_FINALIZATION_REQUIRED = NO
MIGRATION_REQUIRED = NO

ARTICLE_AUTOSAVE_CREATES_VERSION = NO
ARTICLE_SAVE_DRAFT_CREATES_VERSION = NO
ARTICLE_SAVE_CAN_START_RETENTION = NO

REMOTE_DATA_MODIFIED = NO
REGRESSIONS = NONE
```

### O que fica aberto

1. A homologação pela tela — do Roteiro, do Carrossel e agora do Artigo.
2. `SCRIPT_PUBLICATION_HANDOFF` e `CAROUSEL_PUBLICATION_HANDOFF` seguem
   `NOT_IMPLEMENTED`.
