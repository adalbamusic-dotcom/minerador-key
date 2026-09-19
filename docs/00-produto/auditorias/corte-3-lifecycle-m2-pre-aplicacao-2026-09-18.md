# Corte 3 — lifecycle da M2 integrado no código, antes de aplicar a M2

**Data:** 2026-09-18
**Não executado:** SQL remoto, migration, deploy, commit, push. **`M2_SCHEMA_APPLIED = NO`.**
**Executado:** edições locais em código e testes. Nada commitado.

---

## 1. Auditoria do save atual — o que já existia

Antes de escrever qualquer coisa, mapeei o caminho de gravação. A conclusão que mudou o desenho: **o artigo já tem autoridade explícita de versão corrente, e ela já é verificada.** Duplicá-la seria criar uma segunda fonte de verdade para a mesma pergunta.

### 1.1 `writer_save_article_draft` (RPC, migration `20260918061000`)

| Propriedade | Como está |
| --- | --- |
| Trava | `SELECT ... FOR UPDATE` na linha do documento |
| Imutabilidade | recusa documento `aprovado` |
| Escopo | só `blocks`, `editorContent` e `status` podem mudar; o resto é comparado por `jsonb` e recusado com `writer_draft_scope_invalid` |
| **Idempotência por hash** | `IF v_current.content_hash = p_content_hash` → devolve `unchanged: true` com o `current_version_id` existente, **sem criar versão** |
| **Lock otimista** | `p_expected_lock IS DISTINCT FROM v_current.lock_version` → `writer_lock_conflict`. Só é checado quando o hash difere — repetir a mesma gravação com lock antigo é seguro |
| Versão + estado | `INSERT` na versão e `UPDATE` da linha na **mesma transação**, com `current_version_id = v_version_id` |
| Recibo | `id, contentHash, lockVersion, versionId, versionNumber, unchanged` |

### 1.2 `saveWriterArticleDraft` (TypeScript) — readback existente

Compara contra a leitura remota: `content_hash`, `lock_version`, **`current_version_id` vs. `versionId` do recibo** e `canonicalJson(blocks)`. Divergência em qualquer um → `readback_mismatch`, 502.

**A autoridade da versão corrente do artigo já é a coluna, e já é conferida.** Não foi criada nenhuma segunda autoridade.

### 1.3 `writer_save_deliverable` (RPC, migration `20260918053018`)

| Propriedade | Como está |
| --- | --- |
| Trava | `FOR UPDATE` por `(marca_id, document_id, kind)` |
| Imutabilidade | recusa entregável `approved` |
| Idempotência por hash | igual à do artigo — devolve `unchanged: true`, sem versão nova |
| Lock otimista | igual; linha nova exige `p_expected_lock IS NULL` |
| **Versão corrente** | **deduzida**: `ORDER BY version_number DESC LIMIT 1`. Não existe `current_version_id` |
| Readback (TS) | compara `content_hash`, `lock_version` e `kind`. **Não confere a corrente**, porque a coluna não existe |

### 1.4 Onde as versões nascem

- `content_document_versions` → dentro de `writer_save_article_draft`, com `previous_version_id` apontando para a última.
- `writer_deliverable_versions` → dentro de `writer_save_deliverable`, mesma estrutura.

**O predecessor já é conhecido pelo banco**: é o `previous_version_id` do sucessor. Não foi preciso mudar RPC nem passar id pelo cliente para descobri-lo — basta lê-lo.

---

## 2. Autoridade explícita da versão corrente

| Artefato | Hoje | Depois da M2 |
| --- | --- | --- |
| Artigo | `content_documents.current_version_id` ✔ | igual — nada muda |
| Roteiro / Carrossel | `max(version_number)` (deduzido) | `writer_deliverables.current_version_id` |

`lib/server/writer-retention.ts` expõe `deliverableCurrentVersionId()`, que **devolve a resposta junto com a origem dela**:

```ts
{ versionId: string | null; authority: "column" | "max_version_number" }
```

E `canMarkWithAuthority(authority)` recusa marcação enquanto a autoridade for deduzida. Deduzir a corrente é aceitável para exibir; não é aceitável para governar a operação que apaga as outras, porque uma leitura defasada apagaria a versão viva.

### 2.1 O código não quebra antes da M2

`writer_deliverables.current_version_id` não existe ainda. Pedi-la ao PostgREST devolveria `42703` e derrubaria a gravação.

`writerRetentionAvailable()` sonda a coluna uma vez por minuto e guarda o resultado. O `SELECT` do readback só a inclui quando a capacidade foi detectada, e a marcação devolve `unavailable` — sem erro, sem log de pânico, sem mudar o que o Redator faz hoje.

Um detalhe deliberado: erro que **não** é de coluna ausente (rede, permissão) **não** entra em cache como "indisponível". Isso transformaria uma falha passageira numa desativação silenciosa da retenção, que ninguém notaria.

---

## 3. As duas fases

```
SAVE SUCCESSOR → SET CURRENT → COMMIT      ← tudo dentro da RPC, atômico
→ REMOTE READBACK → VERIFY CURRENT/HASH/LOCK
→ MARK PREDECESSOR SUPERSEDED               ← segundo ato, fora da transação
```

A marcação é um segundo ato porque **o readback só existe depois do commit** — não dá para conferir de fora uma transação que ainda não terminou. Marcar dentro da gravação abriria a janela de 48h antes de saber se o sucessor sobreviveu; se o commit passasse e o readback divergisse, o predecessor já estaria contando o tempo, e ele é a única cópia boa que restaria.

No código: em `saveWriterArticleDraft` e `saveWriterDeliverable`, a chamada de marcação vem **depois** do `throw readback_mismatch`. O teste 13 e o 14 travam essa ordem por posição no arquivo.

### 3.1 Readback falho

```text
SUCCESS_VISUAL = NO            → a função lança `readback_mismatch` (502)
PREDECESSOR_SUPERSEDED = NO    → a marcação nem é alcançada
PURGE_AFTER = NULL             → o CHECK da M2 recusa purge_after sem substituição
```

### 3.2 Marcação falha com o sucessor já confirmado

O sucessor **permanece corrente**. A falha volta no retorno como `{ status: "failed", code }`. O predecessor fica retido por mais tempo — resultado inofensivo.

**Nunca se compensa apagando o sucessor válido.** Isso trocaria uma limpeza adiada por perda de trabalho. Por isso nada em `writer-retention.ts` lança para o caminho de gravação: tudo devolve desfecho.

---

## 4. O cliente não é autoridade

Nenhum id usado na marcação vem da requisição:

| Dado | Origem |
| --- | --- |
| `brandId` | sessão canônica ou delegação MCP, já autorizada no servidor |
| `documentId` / `deliverableId` | já validados contra a marca no próprio save |
| **sucessor** | recibo da RPC, conferido contra `current_version_id` no readback |
| **predecessor** | lido do **servidor**: `previous_version_id` do sucessor |

A RPC da M2 valida de novo, do lado do banco: marca, documento/entregável, `current_version_id == sucessor`, predecessor ≠ sucessor, e recusa par divergente com `retention_already_superseded_by_other`. Um id arbitrário que chegasse pelo cliente apontaria, no pior caso, para a versão corrente de outro documento — e as duas camadas o recusariam.

---

## 5. Artigo, roteiro e carrossel

O comportamento comprovado de `writer_save_article_draft` foi **preservado sem tocar na RPC**: estado e versão coerentes, repetição de hash idêntico sem versão nova, lock antigo com conteúdo divergente recusado. A única adição é a chamada de marcação após o readback.

Roteiro e carrossel passam pelo mesmo caminho — a RPC é uma só e discrimina por `kind` (`video_script` | `carousel`), então não há dois caminhos que possam divergir. O teste 15 verifica isso; os testes 01-07 exercitam a regra que vale para os dois.

---

## 6. Purga — não implementada

```text
PURGE_EXECUTION = NO
CRON = NO
DELETE_EXPIRED_VERSION = NO
```

O teste 18 trava isso: nenhuma referência a `lifecycle_purge_editorial_history`, `lifecycle_claim_writer_media_purge` ou `pg_cron` entra no caminho de gravação.

As invariantes seguem registradas e agora também **executáveis** no lado do código: `recoveryWindowEnd()` calcula a janela do mesmo jeito que o CHECK da M2, e o teste 06 compara os dois. Se um dia divergirem, o teste falha antes do usuário.

---

## 7. Módulos anteriores — intocados

Nada foi alterado em `editorial_artifact_versions`, ArticleDNA, KeywordDNA, SiloDNA/SiloPage, SERP, evidências do Radar, eventos MCP, Arquiteto ou Minerador.

O teste 11 trava a parte mais delicada: a M2 **não** recria `pipeline_editorial_protect_append_only` e **não** faz `ALTER TABLE` em `editorial_artifact_versions`. A função append-only global desses artefatos permanece byte por byte.

`test:radar` 2236/2236 é a medida disso.

---

## 8. Limpeza autorizada

O comentário órfão em `components/editorial-pipeline-context.tsx` foi corrigido. Ele descrevia `importApprovedToPlanner` e apontava para `POST /api/editorial/radar-planner-handoff` — rota apagada. Agora nomeia os cinco métodos removidos, diz que não têm substituto, registra que a M1 fechou `'planner'` no CHECK, e aponta para a fronteira real: `radar-writer-handoff` → `sendRadarToWriter`.

---

## 9. Testes

`tests/redator-lifecycle-versoes.test.mts` — **18/18**, registrado em `test:redator`.

O arquivo separa duas naturezas de prova, e o **nome de cada teste diz qual é**:

- **COMPORTAMENTAL (01-07)** — exercita `planSupersede` e `recoveryWindowEnd` de verdade. Rodam sem banco porque as regras foram escritas sem I/O, em `lib/redator/version-lifecycle.ts`.
- **ESTRUTURAL (08-18)** — lê o SQL da M2 e o código do save como texto. Prova que a regra está **declarada** onde precisa estar. **Não prova que o Postgres a executa**, porque a M2 não foi aplicada.

Essa distinção está no nome para que ninguém leia "18/18 verde" como "lifecycle homologado".

Cobertura pedida:

| Item | Teste |
| --- | --- |
| nova versão torna-se current | 01, 12, 13, 14 |
| conteúdo idêntico não cria sucessora | 03 (comportamental) + 1.1/1.3 da auditoria |
| lock divergente recusa | auditado em §1.1 e §1.3; é regra da RPC existente, já comprovada em rodada anterior |
| readback falho não marca predecessor | 02, 13, 14 |
| readback correto permite marcar | 01, 13, 14 |
| `purge_after = superseded_at + 48h` | 06 (cálculo) + 08 (CHECK da M2) |
| current nunca marcado para purga | 04 (regra) + 10 (purga) + 12 (FK RESTRICT) |
| artigo | 13 |
| roteiro | 15 |
| carrossel | 15 |
| isolamento por marca | 09 (`marca_id = p_brand_id`) + 17 (`p_brand_id` sempre repassado) |
| repetição idempotente da marcação | 09 (`'unchanged', true` nas duas RPCs) |

**Uma correção durante a escrita:** o teste 14 falhou casando com o **próprio comentário** que explica por que a dedução saiu — "falhou" sobre um texto, não sobre o código. A asserção passou a remover comentários antes de procurar a chamada `.order("version_number"`.

### 9.1 Resultado, comparado ao baseline

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** | 0 |
| `test:redator` | 28/28 | **46/46** | +18 novos |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 — 4 falhas | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `operational-flow` | 41/51 — 10 falhas | **41/51 — as mesmas 10** | 0 |
| `radar-to-writer-handoff-1` (loader) | 26/26 | **26/26** | 0 |
| `eslint` nos arquivos tocados | — | **0 erros** | 6 avisos pré-existentes, nenhum novo |

As 4 falhas de `test:editorial` e as 10 de `operational-flow` são pré-existentes, medidas em rodadas anteriores. Não foram corrigidas.

---

## 10. Arquivos

**Criados:**
```
lib/redator/version-lifecycle.ts          (regras puras, sem server-only)
lib/server/writer-retention.ts            (I/O: capacidade, leitura do predecessor, RPC)
tests/redator-lifecycle-versoes.test.mts  (18 testes)
```

**Alterados:**
```
lib/server/writer-deliverables.ts         (marcação após readback, nos dois saves; SELECT condicional)
components/editorial-pipeline-context.tsx (comentário órfão corrigido)
package.json                              (test:redator inclui o arquivo novo)
```

**Não tocados:** RPCs existentes, migrations, `lib/arquiteto/**`, `lib/radar/**`, `lib/minerador/**`, `modules/**`.

---

## 11. O que falta antes de aplicar a M2

1. **Revisão deste corte.** É o que esta entrega pede.
2. **Aplicar a M2** — `20260918190100_m2_writer_version_lifecycle.sql`. A partir daí `writerRetentionAvailable()` passa a detectar a coluna sozinha, em até 60 segundos, sem redeploy.
3. **Readback pós-M2**, conforme o bloco dentro do arquivo da migration.
4. **Homologação manual — é do usuário:** salvar artigo, roteiro e carrossel duas vezes cada, conferir que a segunda versão vira corrente, que a primeira ganha `superseded_at` e `purge_after = superseded_at + 48h`, e que salvar conteúdo idêntico não cria versão nem janela.

A rota de purga continua não existindo, e é o último passo de todos. Enquanto ela não existir, nada é apagado — e esse é o estado seguro.

---

```text
M1_VERIFIED = YES
M2_CODE_READY = YES
M2_SCHEMA_APPLIED = NO
ARTICLE_CURRENT_VERSION_AUTHORITY = content_documents.current_version_id (já existia; verificada no readback)
DELIVERABLE_CURRENT_VERSION_AUTHORITY = max(version_number) hoje → writer_deliverables.current_version_id após M2 (detecção automática de capacidade)
SUPERSEDE_AFTER_READBACK = YES
PURGE_IMPLEMENTED = NO
M3_APPLIED = NO
REGRESSIONS = NONE (test:redator 46/46, test:radar 2236/2236, demais idênticas ao baseline)
```
