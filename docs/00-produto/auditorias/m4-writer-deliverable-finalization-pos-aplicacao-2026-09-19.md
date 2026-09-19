# M4 — lifecycle de rascunho e finalização de entregáveis (pós-aplicação)

**2026-09-19** · frente Redator · migration `20260919020000_m4_writer_deliverable_finalization.sql`

A M4 foi aplicada no banco remoto. Este relatório registra o hardening que
precedeu o DDL, o gate de estabilidade, o pré-flight, a aplicação, o readback do
schema efetivo e o smoke de banco. O documento anterior
(`m4-writer-deliverable-finalization-pre-aplicacao-2026-09-19.md`) continua
válido para o desenho; este cobre a execução.

---

## 1. Hardening — a normalização deixou de depender das guardas

O `UPDATE` que zera `current_version_id` era:

```sql
UPDATE public.writer_deliverables SET current_version_id = NULL
 WHERE current_version_id IS NOT NULL AND status <> 'approved';
```

Ele estava correto **porque** as guardas 1-4 já tinham passado. Isso é uma
dependência frágil: uma guarda que passou é afirmação sobre o passado, e o
`UPDATE` escreve no presente. Se alguma guarda fosse afrouxada, removida ou
reordenada, o comando continuaria rodando — só que sobre um mundo diferente.

Passou a ser:

```sql
UPDATE public.writer_deliverables d
   SET current_version_id = NULL
 WHERE d.current_version_id IS NOT NULL
   AND d.status <> 'approved'
   AND EXISTS (
     SELECT 1 FROM public.writer_deliverable_versions v
      WHERE v.version_id = d.current_version_id
        AND v.deliverable_id = d.id
        AND v.superseded_at IS NULL
        AND v.purge_after IS NULL
        AND v.change_reason IN ('Rascunho inicial.', 'Revisão do rascunho.')
   );
```

O critério é **exatamente** o da guarda 3, repetido inteiro. Redundância de custo
zero, e a guarda 5 logo abaixo deixou de ser tautologia: ela agora confere que o
critério estreito e o do pré-flight concordam. Discordância aborta a migration em
vez de aplicar pela metade.

```text
NORMALIZATION_DML_SCOPE = LEGACY_DRAFT_ONLY
```

### 1.1 Mutantes do escopo

Sete defeitos introduzidos de propósito na migration, suíte rodada, defeito
revertido. A migration não é compilada por ninguém, então o dev server não viu
nenhum deles.

| Mutante | Resultado |
| --- | --- |
| volta ao filtro solto de status | morto pelo teste 23 |
| perde o critério de rascunho legado | morto pelo teste 23 |
| perde a guarda de versão já substituída | morto pelo teste 23 |
| perde a guarda de janela aberta | morto pelo teste 23 |
| perde o vínculo com o próprio entregável | morto pelo teste 23 |
| deixa de excluir o aprovado | morto pelo teste 23 |
| escreve uma segunda coluna no `SET` | morto pelo teste 23 |

O teste 23 extrai o `UPDATE` do arquivo, isola a cláusula `SET` e exige que ela
seja exatamente `SET current_version_id = NULL`; depois cobra os sete critérios
do `WHERE` um a um, e recusa explicitamente a forma antiga.

---

## 2. Gate de estabilidade

Mesmo protocolo da M3: nenhuma gravação no repositório por 150 segundos
contínuos, qualquer escrita reinicia a janela. Observados **2118 arquivos**,
todo o repositório menos `node_modules`, `.git` e `.next` — o risco da M3 veio de
outra sessão mexendo em Minerador/Arquiteto, não na frente Redator.

```text
REPOSITORY_STABLE = YES · 152s de silêncio contínuo · 0 reinícios
```

| Suíte | Baseline | Antes do DDL | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 162/162 | **188/188** | +26 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |

As 4 do editorial e as 10 do operational-flow são falhas herdadas, fora desta
frente, e não foram corrigidas aqui. O `eslint` acusa 124 erros, todos em
`modules/arquiteto/arquiteto-workspace.tsx` (113) e
`modules/minerador/minerador-workspace.tsx` (11), pré-existentes no HEAD e fora
da frente — conferido por `git show HEAD:<arquivo> | npx eslint --stdin`.

---

## 3. Pré-flight remoto — só SELECT, imediatamente antes do DDL

Uma única consulta, sem nenhuma escrita. O estado bateu com o auditado quando a
migration foi escrita:

```text
entregáveis   2 · ambos status='draft' · lock_version=1 · ambos com ponteiro
versões       2 · version_number=1 · previous=NULL · 'Rascunho inicial.'
              superseded_at=NULL · purge_after=NULL · superseded_by=NULL

guardas       g1 aprovados=0 · g2 em retenção=0
              g3 correntes não legadas=0 · g4 correntes órfãs=0

normalização  alvo do WHERE estreito = os 2 entregáveis
              aprovados com ponteiro = 0
              ponteiros fora do alvo = 0   (guarda 5 seria satisfeita)

vocabulário   status ['draft'] · kinds ['carousel','video_script']
              change_reasons ['Rascunho inicial.'] · version_number máx 1
              versões com previous = 0 · versões sem dono = 0

publication_records  0   (linha de base do smoke)
```

Os dois entregáveis são da marca Care Glow (`09762023-…`), ambos do mesmo
documento, um `video_script` e um `carousel`:

| entregável | kind | versão apontada |
| --- | --- | --- |
| `6a63f17f-c29f-496c-8f96-841e208bdfb3` | `video_script` | `cd9d3a55-e2d3-4ab9-a3ea-0d40ca73c14e` |
| `25b9bf20-35c0-48ed-ae49-4a22b61e2acd` | `carousel` | `32e8c9b7-834a-44d9-b4e6-7d1960c6e3a8` |

Nada fora das guardas previstas. Seguiu para o DDL.

---

## 4. Aplicação

```bash
npx supabase db query --linked -f supabase/migrations/20260919020000_m4_writer_deliverable_finalization.sql
```

Sem erro. Nenhuma outra migration foi aplicada nesta rodada.

```text
M4_DDL_APPLIED = YES
```

---

## 5. Readback do schema efetivo

Os corpos foram lidos de `pg_proc.prosrc` **com os comentários removidos antes de
qualquer busca**. Sem isso, um `-- não move current_version_id` dentro do corpo
casaria com a busca por `current_version_id` e o readback aprovaria o defeito por
causa da própria explicação dele.

### 5.1 `writer_save_deliverable`

| Verificação | Resultado |
| --- | --- |
| assinatura preservada (7 args, com `p_payload`) | ✓ |
| insere em `writer_deliverable_versions` | **não** |
| move `current_version_id` | **não** |
| inicia retenção (`superseded_at` / `purge_after`) | **não** |
| guarda de documento (`writer_document_not_found`) | ✓ |
| guarda de payload/origem (`writer_payload_invalid_or_stale`) | ✓ |
| guarda de aprovado (`writer_approved_immutable`) | ✓ |
| optimistic lock (`writer_lock_conflict`) | ✓ |
| entregável novo nasce com corrente nula | ✓ |

### 5.2 `writer_finalize_deliverable`

| Verificação | Resultado |
| --- | --- |
| existe, 5 args | ✓ |
| recebe payload como segunda autoridade | **não** |
| snapshot vem do entregável persistido (`v_current.payload`) | ✓ |
| `previous_version_id` = a corrente de antes | ✓ |
| move a corrente para a nova versão | ✓ |
| idempotente por `content_hash` | ✓ |
| recusa estado corrompido (`writer_finalized_state_inconsistent`) | ✓ |
| guarda de predecessor (`writer_predecessor_nao_e_final`) | ✓ |
| optimistic lock | ✓ |
| marca o predecessor aqui dentro | **não** — é do readback |

### 5.3 `writer_reopen_deliverable`

| Verificação | Resultado |
| --- | --- |
| existe, 4 args | ✓ |
| `approved → draft` explícito | ✓ |
| toca `current_version_id` | **não** |
| toca `writer_deliverable_versions` | **não** |
| reabrir o que já é editável é "nada" | ✓ |

### 5.4 Segurança

As três: `SECURITY DEFINER`, `search_path=public, pg_temp`.

| Função | anon | authenticated | service_role |
| --- | --- | --- | --- |
| `writer_save_deliverable(uuid,text,text,jsonb,text,integer,uuid)` | não | não | **sim** |
| `writer_finalize_deliverable(uuid,text,text,integer,uuid)` | não | não | **sim** |
| `writer_reopen_deliverable(uuid,text,text,uuid)` | não | não | **sim** |

### 5.5 Dados normalizados

```text
entregáveis   2 · ambos status='draft' · current_version_id = NULL
versões       2 · ids, previous, change_reason inalterados
              superseded_at = NULL · purge_after = NULL · superseded_by = NULL
com ponteiro  0     aprovados 0     em retenção 0
publication_records  0
```

```text
LEGACY_DRAFT_CURRENT_NORMALIZED = YES
LEGACY_VERSION_ROWS_PRESERVED = YES
LEGACY_VERSION_RETENTION_STARTED = NO
```

**Um efeito colateral que precisa constar.** O `SET` do `UPDATE` tem uma coluna
só, mas o trigger `writer_deliverables_touch_trg` →
`pipeline_editorial_touch_lock_version` disparou junto: `lock_version` foi de
**1 para 2** nos dois entregáveis, e `updated_at` foi tocado. Não é a
normalização escrevendo outra coluna — é o trigger fazendo o que sempre faz em
qualquer `UPDATE` da tabela, e desligá-lo seria pior do que aceitá-lo. A
consequência prática é que um cliente que estivesse segurando `lock_version=1`
recebe conflito no próximo save e recarrega. Nenhum dos dois entregáveis estava
aberto.

---

## 6. Smoke de banco — a autoridade sem UI

Fluxo completo com fixture própria na marca de homologação **Somatec Blocking**
(`4a737e74-e35d-4a49-8284-87b3f964e495`), que estava vazia.

### 6.1 Por que dentro de uma transação abortada

O smoke roda num bloco `DO` que termina com `RAISE EXCEPTION` carregando o
resultado em JSON. A exceção aborta a transação: **nenhuma linha de fixture
sobra**.

Isso não é fingir execução. As RPCs rodaram de verdade, os triggers dispararam
de verdade, as constraints valeram de verdade, o optimistic lock foi respeitado
passo a passo. O que não aconteceu foi o `COMMIT`.

A alternativa seria commitar e depois apagar. Descartei porque
`writer_deliverable_versions` tem o trigger
`writer_deliverable_versions_append_only_trg` em `BEFORE DELETE OR UPDATE`
(`pipeline_editorial_protect_retention_aware`): a limpeza de uma fixture
commitada seria uma negociação com o próprio mecanismo de proteção, num banco que
já tem nove ativos reais de mídia do usuário. Rollback é mais barato e mais
seguro.

### 6.2 O que foi exercitado

| Passo | Esperado | Resultado |
| --- | --- | --- |
| criar rascunho | 0 versões, corrente nula | **PASS** |
| save alterado ×2 | 0 versões, corrente nula | **PASS** |
| finalizar | A criada, `approved`, corrente = A, `A.previous = NULL` | **PASS** |
| finalizar de novo sem mudança | devolve A, `unchanged=true`, nenhuma B | **PASS** |
| reabrir | `draft`, corrente continua A, 1 versão | **PASS** |
| save com mudança após reopen | 0 versão nova, corrente continua A | **PASS** |
| refinalizar | B criada, `B.previous = A`, corrente = B | **PASS** |
| A antes da marcação | ainda sem `superseded_at` | **PASS** |
| readback confirma B → marcar A | `A.superseded_by = B` | **PASS** |
| janela | `A.purge_after = A.superseded_at + 48h` | **PASS** |
| B | sem `superseded_at`, sem `purge_after` | **PASS** |
| `publication_records` | 0 antes, 0 depois | **PASS** |

Identificadores do smoke, todos revertidos pelo rollback:

```text
entregável  6980d672-afea-4bef-bfc1-078d6089a9c8
A           3201896f-b6ee-4bad-88a9-2b40ea5ad039  'Finalização do entregável.'
B           b6b66414-b97d-40b6-aab5-fa516ed38dbd  previous = A
A.superseded_at  2026-09-19T03:24:25.188Z
A.purge_after    2026-09-21T03:24:25.188Z          exatamente +48h
```

A ordem da M2 foi respeitada literalmente: B persistida → `current_version_id`
lido de volta e confirmado igual a B → **só então** A entrou em retenção. O
`change_reason` de A é `'Finalização do entregável.'`, não o do rascunho.

### 6.3 Resíduo

Confirmado por leitura depois do rollback:

```text
documento da fixture       0
entregável do smoke        0
versões A e B              0
Somatec Blocking           0 documentos · 0 entregáveis · 0 mídias

estado do banco            2 entregáveis · 2 versões legadas intactas
                           0 com ponteiro · 0 aprovados · 0 em retenção
mídias Care Glow           9 (5 correntes, 4 em janela) — intactas
```

---

## 7. Publicações

```text
PUBLICATION_RECORD_CREATED_BY_FINALIZE = NO
```

Zero antes, zero depois do smoke inteiro — incluindo duas finalizações e uma
refinalização. Finalizar define `status='approved'` e move a corrente; entregar
continua sendo `sendWriterToPublications`, autoridade separada.

---

## 8. UI

```text
FINALIZE_BUTTON_LIVE = NO
```

Nenhum componente foi tocado nesta rodada. Não há botão de finalizar nem de
reabrir na tela.

---

## 9. Histórico de migrations

Aplicada por `db query -f` e alinhada por `migration repair --status applied`.

```text
M1  20260918190000  local ✓  remoto ✓
M2  20260918190100  local ✓  remoto ✓
M3  20260918190200  local ✓  remoto ✓
M4  20260919020000  local ✓  remoto ✓

nenhuma migration remota depois da M4
```

Continua existindo a divergência histórica antiga — 4 entradas só no remoto e 29
datadas só no local, herdadas de antes desta frente. Não foram tocadas.

---

## 10. O que a próxima rodada precisa saber

**`saveWriterDeliverable` ainda chama `markDeliverablePredecessorSuperseded`.**
Em `lib/server/writer-deliverables.ts:142`, o save chama a marcação de retenção
depois do readback. Hoje isso é **inerte**: como nenhum entregável tem corrente,
o recibo traz `versionId: null`, e `planSupersede` devolve
`skip / successor_not_current` sem tocar o banco. Conferi as duas rotas que
consomem o resultado (`app/api/redator/deliverables/route.ts` e
`app/api/mcp/redator/route.ts`) — nenhuma exige `versionId` não-nulo, e a
comparação de readback `currentVersionId !== result.versionId` vira `null !==
null`. O runtime segue compatível.

Mas quando a finalização entrar na tela, o quadro muda: depois de um reopen, o
save passa a devolver `versionId = A` com `unchanged: false`, e a marcação
deixará de ser inerte. Pela invariante da M4, iniciar retenção é ato da
**finalização**, nunca do save. Essa linha precisa sair do caminho do save na
rodada que ligar o botão — junto com o handler de finalizar/reabrir.

Não mexi nela agora porque ligar a finalização é a rodada seguinte, e uma
alteração no save sem o resto do fluxo só criaria um estado intermediário sem
teste de ponta a ponta.

---

```text
REPOSITORY_STABLE = YES
NORMALIZATION_DML_SCOPE = LEGACY_DRAFT_ONLY
M4_DDL_APPLIED = YES
M4_SCHEMA_READBACK = PASS
LEGACY_DRAFT_CURRENT_NORMALIZED = YES
LEGACY_VERSION_ROWS_PRESERVED = YES
LEGACY_VERSION_RETENTION_STARTED = NO
DRAFT_SAVE_CREATES_VERSION = NO
FIRST_FINALIZATION_SMOKE = PASS
UNCHANGED_FINALIZATION_IDEMPOTENT = YES
REOPEN_PRESERVES_LAST_FINAL = YES
REFINALIZATION_SMOKE = PASS
M2_RETENTION_AFTER_READBACK = PASS
PUBLICATION_RECORD_CREATED_BY_FINALIZE = NO
FINALIZE_BUTTON_LIVE = NO
SMOKE_COMMITTED = NO (transação abortada de propósito · zero resíduo)
REAL_USER_DATA_MODIFIED = NO (exceto a normalização prevista: 2 ponteiros → NULL)
REGRESSIONS = NONE
```

### Alerta

A M3 falhou na primeira aplicação por ordem interna de comandos — defeito que só
a execução encontra. A M4 passou de primeira, mas a lição vale para a próxima: o
botão de finalizar deve entrar depois de um smoke de ponta a ponta pela rota
real, não só pela RPC.
