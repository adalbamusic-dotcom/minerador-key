# Corte 6A.1 — finalização e reabertura de Roteiro e Carrossel

**2026-09-19** · frente Redator · sem migration, DDL, purge, cron, deploy, commit ou push

A M4 já estava aplicada e validada. Esta rodada tirou o defeito residual do save,
criou a autoridade server-side de finalizar e reabrir, expôs uma rota discriminada
e ligou os botões na GlobalTopbar.

> **Duas coisas aqui foram superadas pelo Corte 6A.2**
> ([`corte-6a-2-finalizacao-idempotente-2026-09-19.md`](corte-6a-2-finalizacao-idempotente-2026-09-19.md)):
>
> 1. **O gap da §3.2 foi fechado pela M5.** A recusa 409
>    `finalization_without_change` **não existe mais**: a RPC passou a devolver o
>    status a `approved` reusando a versão corrente, sem criar nada. O wrapper e
>    a regra pura `precheckFinalization` foram removidos.
> 2. **A afirmação da §1 sobre o save do Artigo estava errada.** Ver §2 do 6A.2.

---

## 1. O defeito residual do save, fechado

`lib/server/writer-deliverables.ts` chamava `markDeliverablePredecessorSuperseded`
no caminho do **save de rascunho**. Fazia sentido quando o save versionava; depois
da M4 virou defeito à espera de acontecer:

```text
FINAL_A → reopen → rascunho editado → save
```

Nesse ponto `current_version_id` continua A. O save passava A como "sucessor
confirmado", a marcação procurava o predecessor de A e abriria a janela de 48h
sobre ele — por causa de um autosave, sem ninguém ter finalizado nada.

A chamada saiu. O save devolve o recibo e para.

```text
SAVE_CAN_START_RETENTION = NO
```

**O que NÃO saiu, de propósito:** `saveWriterArticleDraft` continua chamando
`markArticlePredecessorSuperseded`.

> **CORREÇÃO (Corte 6A.2).** O parágrafo que estava aqui dizia que "o save do
> artigo versiona de verdade a cada gravação alterada — é o desenho da M2". As
> duas metades estavam erradas em contexto:
>
> * O Artigo tem **dois** caminhos. Pela **tela** (autosave e "Salvar rascunho")
>   ele **nunca** versiona: `createVersion` é `false` por padrão e só vira
>   `true` em `requestStatus`, que é o que "Finalizar artigo" chama. Evidência:
>   `lock_version = 22` no documento e **zero** linhas em
>   `content_document_versions`.
> * Quem versiona a cada save alterado é a ferramenta **MCP**
>   `save_writer_draft` → `writer_save_article_draft`. E isso não é "o desenho
>   da M2": é **violação** da invariante canônica
>   `SAVE_DRAFT_CREATES_HISTORY = NO`, registrada como defeito separado na §2.5
>   do 6A.2. Nunca disparou — a ferramenta jamais foi usada.
>
> A conclusão prática não muda: a chamada continua onde está, porque corrigi-la
> pertence ao lifecycle do Artigo, não ao do entregável.

### 1.1 A conferência que sobrou ficou mais forte

```ts
if (comColuna && result.unchanged !== true && currentVersionId !== result.versionId)
```

Depois da M4 o recibo devolve `versionId` = a corrente que **já existia**, não uma
versão recém-criada. Comparar os dois deixou de significar "o servidor gravou a
versão que prometeu" e passou a significar algo melhor: **o save não mexeu no
ponteiro**. Num entregável nunca finalizado os dois são nulos; depois de um
reopen, os dois são a última final.

---

## 2. A autoridade de finalização

`finalizeWriterDeliverable` em `lib/server/writer-deliverables.ts`. Ordem, e ela
não é negociável:

```text
pré-checagem
→ writer_finalize_deliverable (RPC)
→ recibo
→ READBACK remoto obrigatório
→ conferir: status='approved' · current_version_id = receipt.versionId · hash bate
→ só então markDeliverablePredecessorSuperseded(A, B)
```

O ator vem de `requireCanonicalSessionProfile()` na rota. Nenhuma das duas funções
aceita `actorId` do corpo da requisição.

### 2.1 A decisão não mora no wrapper

O corpo é I/O e tradução de erro. Quem decide são regras puras em
`lib/redator/deliverable-lifecycle.ts`, exercitadas por teste sem banco:

| Regra | Responde |
| --- | --- |
| `precheckFinalization` | finalizar agora duplicaria a versão corrente? |
| `finalizationDecisionFromReceipt` | o que a RPC fez: criou, devolveu a mesma, ou recusou? |
| `verifyFinalizationReadback` | as três perguntas do readback |
| `planRetentionAfterFinalization` | o predecessor pode entrar em retenção? |
| `verifyReopenReadback` | a reabertura preservou a última final? |

Sem isso, "readback antes de marcar" só seria conferível lendo o arquivo como
texto — e texto não recusa um refactor.

```text
FINALIZATION_READBACK_REQUIRED = YES
RETENTION_ONLY_AFTER_FINALIZE_READBACK = YES
```

### 2.2 Readback falho, e marcação falha

**Readback falho** em qualquer das três perguntas: a função lança
`readback_mismatch` (502) **antes** de qualquer marcação. A predecessora não entra
em retenção — a janela de 48h abriria sobre o que talvez seja a única versão boa.

**Marcação falha depois do readback confirmar a sucessora:** a sucessora continua
corrente e o desfecho volta no campo `retention` da resposta. Não há compensação:
nada apaga a versão nova. `markDeliverablePredecessorSuperseded` nunca lança —
ela devolve desfecho —, então uma finalização já confirmada não pode ser derrubada
por uma limpeza que ficará para depois.

**Uma escolha que registro em vez de esconder:** nesse caso a rota devolve **200**
com `retention.status = "failed"`, e a tela mostra "Finalizado como versão N. A
retenção da versão anterior não começou (…); ela fica guardada por mais tempo."
Devolver 4xx/5xx faria a tela dizer "falhou" para uma finalização que deu certo, e
quem opera tentaria de novo. O erro **é** retornado — no corpo, visível — sem
mentir sobre o que aconteceu.

---

## 3. Idempotência — e um gap que exige migration

### 3.1 `approved` → finalizar de novo: resolvido

A RPC compara `content_hash` da corrente com o do entregável e devolve a **mesma**
versão com `unchanged: true`. Nenhuma B, nenhuma retenção nova. Confirmado no
smoke de banco da M4 e coberto pelo teste 03.

### 3.2 `reopen` sem editar → finalizar: **não é o que foi pedido**

O pedido: "A → reopen → nenhuma alteração → finalize deve voltar a `approved` com
A ainda corrente, sem criar nova versão e sem iniciar retenção."

`writer_finalize_deliverable` é idempotente por hash **apenas** no ramo
`approved`. No ramo `draft` ela insere versão **sempre**. Reabrir e finalizar sem
editar criaria um B de conteúdo idêntico a A, com `B.previous = A`, e a retenção
abriria uma janela de 48h sobre A — queimando uma versão boa por causa de um
clique em "Reabrir" que ninguém aproveitou.

Fechar isso na RPC é uma linha de SQL. É **DDL**, e esta rodada não podia aplicar
migration. Então o wrapper **recusa antes de chamar a RPC**:

```text
409 finalization_without_change
"Nada mudou desde a versão final N. Edite o conteúdo para criar uma nova versão."
```

Resultado honesto: **2 dos 3 requisitos**.

| Requisito | Situação |
| --- | --- |
| sem criar nova versão | ✓ |
| sem iniciar retenção | ✓ |
| voltar a `approved` | **não** — o entregável continua `draft` |

Recusar é o lado conservador do erro: um entregável que continua "Em redação" é
visível e corrigível por quem opera; uma janela de 48h aberta sobre a versão boa,
não.

**O que a próxima migration precisa fazer.** No ramo `draft` de
`writer_finalize_deliverable`, antes do `INSERT`: se existe corrente e
`v_corrente.content_hash = v_current.content_hash`, apenas
`UPDATE ... SET status='approved'` e devolver a corrente com `unchanged: true` —
sem inserir versão e sem mexer em `current_version_id`. A pré-checagem do wrapper
pode então sair, ou virar defesa em profundidade.

```text
UNCHANGED_FINALIZATION_IDEMPOTENT = YES no ramo approved
                                  = PARCIAL no ramo draft reaberto (recusa, não retorna a approved)
```

---

## 4. Reabertura

`reopenWriterDeliverable`. Lê `current_version_id` **antes**, chama
`writer_reopen_deliverable`, lê de volta e cobra:

```text
status = 'draft'   e   current_version_id inalterado
```

Não cria versão. Não inicia retenção. Não toca em `writer_deliverable_versions`.
Voltar a `draft` com a corrente trocada seria pior que um erro — seria perda
silenciosa —, então `lost_last_final` é recusa explícita.

```text
REOPEN_PRESERVES_LAST_FINAL = YES
```

---

## 5. Rota

`PATCH /api/redator/deliverables`, união discriminada por `action`:

```ts
z.discriminatedUnion("action", [
  z.object({ action: z.literal("finalize"), brandId, documentId, kind, expectedLockVersion }).strict(),
  z.object({ action: z.literal("reopen"),   brandId, documentId, kind }).strict(),
])
```

`kind` é **campo, não caminho**. Roteiro e carrossel chegam na mesma autoridade
porque é a mesma tabela, a mesma RPC e a mesma regra — uma rota por tipo criaria
duas traduções da mesma recusa, e elas divergiriam no primeiro ajuste.

A união discriminada também recusa `{action:"reopen", expectedLockVersion: 3}` em
vez de ignorar em silêncio o que quem chamou achou que estava pedindo. E
`.strict()` recusa um `actorId` enfiado no corpo.

Conferido contra o servidor em execução: `PATCH` sem sessão devolve **401**, não
404 nem 500.

---

## 6. UI

Os três controles moram na **GlobalTopbar**, junto com os do artigo. Nenhuma faixa
horizontal nova; o botão "Salvar rascunho" que existia no corpo do ambiente saiu.

```text
Em redação   [Salvar rascunho] [Finalizar roteiro | Finalizar carrossel]
Finalizado   [Reabrir para edição] (+ entrega, quando o ARTIGO está finalizado)
```

A lógica continua onde mora o estado: `WriterDerivedEnvironment` publica um objeto
com estado e gatilhos (`WriterDeliverableBar`), e a barra só desenha. Duas
implementações de "salvar" seriam duas verdades.

`Finalizar` fica desabilitado enquanto o entregável não existe no servidor, com o
título dizendo por quê ("Salve o rascunho antes de finalizar") — em vez de um
botão que falharia no clique.

```text
FINALIZE_BUTTON_LIVE = YES
REOPEN_BUTTON_LIVE = YES
```

### 6.1 Estado visual

O cabeçalho do ambiente mostra **Em redação** ou **Finalizado**
(`data-deliverable-status`), e a barra repete o mesmo estado. Depois de reabrir,
volta a "Em redação" — e a última versão final continua conhecida em
`current_version_id`, intocada.

Finalizado é **somente leitura na tela** (`<fieldset disabled>`) porque já é
somente leitura no servidor: `writer_save_deliverable` recusa `approved` com
`writer_approved_immutable`. Deixar os campos editáveis só adiaria a recusa até o
save, depois de a pessoa ter digitado. Um aviso explica como voltar a editar.

---

## 7. Finalizar ≠ Publicar

```text
PUBLICATION_REMAINS_SEPARATE = YES
```

O wrapper de finalização não menciona Publicações. O smoke de banco da M4 já tinha
confirmado `publication_records` 0 antes e 0 depois de duas finalizações e uma
refinalização.

**Um ajuste de rótulo que registro.** O pedido previa `[Enviar a Publicações]` na
barra do entregável quando finalizado. Auditei `sendWriterToPublications`: ela
entrega o `content_document`, **nunca lê `writer_deliverables`**, e exige o
**artigo** com `status='aprovado'`. Um botão "Enviar a Publicações" na aba Roteiro
sugeriria que o roteiro vai no pacote — e ele não vai.

O botão existe, é o mesmo gatilho de sempre (`pipeline.sendToPublications`, sem
segunda autoridade), e:

* chama-se **"Enviar artigo a Publicações"**;
* o `title` diz "Roteiro e carrossel não fazem parte desse pacote";
* aparece quando o **artigo** está finalizado, que é a única condição sob a qual a
  entrega é possível.

Gatear pelo estado do entregável teria escondido o botão de quem podia entregar e
mostrado a quem não podia.

---

## 8. Testes

`tests/redator-finalizacao-entregavel.test.mts` — **16/16**, dentro de
`test:redator`.

| # | Natureza | Cobre |
| --- | --- | --- |
| 01 | COMPORTAMENTAL | save com corrente = A não versiona nem move a corrente |
| 02 | COMPORTAMENTAL | primeira finalização → A, `approved`, sem predecessor a reter |
| 03 | COMPORTAMENTAL | refinalizar já finalizado devolve A, nenhuma B, nenhuma retenção |
| 04 | COMPORTAMENTAL | reabrir → `draft` com a corrente intacta; perdê-la é recusa |
| 05 | COMPORTAMENTAL | N saves depois do reopen → corrente continua A, zero versões |
| 06 | COMPORTAMENTAL | reopen sem editar + finalizar é recusado, não duplicado |
| 07 | COMPORTAMENTAL | reopen → editar → finalizar → B.previous = A, e só então A é retida |
| 08 | COMPORTAMENTAL | readback falho nas três perguntas → A não é retida |
| 09 | COMPORTAMENTAL | a marcação é o último passo e nunca lança; falhar nela não desfaz B |
| 10 | COMPORTAMENTAL | finalizar não cria `PublicationRecord` |
| 11 | ESTRUTURAL | o save não chama mais a marcação de retenção |
| 12 | ESTRUTURAL | a finalização confere o readback **antes** de marcar (ordem, não presença) |
| 13 | ESTRUTURAL | reabrir não cria versão nem inicia retenção |
| 14 | ESTRUTURAL | rota discriminada; roteiro e carrossel na mesma autoridade; ator da sessão |
| 15 | ESTRUTURAL | os controles moram na barra e não se repetem no corpo |
| 16 | ESTRUTURAL | a entrega continua separada e é do artigo |

O teste 12 confere a **ordem** dos cinco passos por índice no corpo da função, não
só a presença de cada um. Uma reordenação que quebrasse "readback antes de marcar"
falha o teste.

Todos os `doesNotMatch` rodam sobre o texto **sem comentários** — um comentário que
explica uma ausência casa com a busca pela ausência, e isso já custou três falsos
negativos neste projeto.

O teste 15 pegou um caso legítimo durante a escrita: a asserção larga
`doesNotMatch(/Reabrir para edição/)` reprovava o aviso em prosa que diz onde o
botão está. Foi estreitada para o que importa — nenhum `onClick` do corpo dispara
salvar, finalizar ou reabrir.

### 8.1 Bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 188/188 | **204/204** | +16 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` (erros) | 124 | **124** | 0 |

Os 124 erros de lint continuam sendo os pré-existentes de
`modules/arquiteto/arquiteto-workspace.tsx` (113) e
`modules/minerador/minerador-workspace.tsx` (11), fora desta frente. Os arquivos
tocados nesta rodada acusam **0 erros e 0 avisos**.

---

## 9. Teste real no navegador — pendente, e é do usuário

Não executei o ciclo pela tela. O navegador embutido é isolado do Chrome do
usuário e não tem sessão; chegar ao Redator exigiria digitar credenciais, o que
não faço.

O que ficou verificado contra o servidor em execução na porta 3000:

```text
/redator                      HTTP 307  (middleware redireciona ao login)
/api/redator/deliverables     HTTP 401  (GET sem sessão)
PATCH .../deliverables        HTTP 401  "Nao autorizado: sessao Supabase ausente."
```

O 401 no `PATCH` prova três coisas: a rota compilou, o método novo está
registrado, e `requireCanonicalSessionProfile()` dispara antes de qualquer outra
coisa. Não prova o ciclo.

```text
SCRIPT_FINALIZATION_UI_E2E = PENDENTE
CAROUSEL_FINALIZATION_UI_E2E = PENDENTE
```

### 9.1 Roteiro da homologação, para quem tem sessão

Em Redator → aba **Roteiro e storyboard**, com um artigo selecionado:

1. editar uma cena → **Salvar rascunho** → esperado: "Rascunho salvo e confirmado
   no servidor"; estado continua **Em redação**;
2. **Finalizar roteiro** → esperado: "Finalizado e confirmado no servidor como
   versão 1"; estado vira **Finalizado**; campos ficam somente leitura;
3. **F5** → esperado: continua **Finalizado**;
4. **Reabrir para edição** → esperado: volta a **Em redação**; os campos voltam a
   aceitar edição;
5. **Finalizar** sem editar nada → esperado: **recusa** 409 "Nada mudou desde a
   versão final 1" (o gap da §3.2);
6. editar uma cena → **Salvar rascunho** → **Finalizar roteiro** → esperado:
   "versão 2".

Mesmo ciclo mínimo no **Carrossel**.

Depois do passo 6, o readback remoto (somente SELECT) deve mostrar, para esse
entregável: duas versões; `B.previous_version_id = A`; `current_version_id = B`;
`A.superseded_at` preenchido com `A.purge_after = superseded_at + 48h`; B sem
janela; e `publication_records` sem nenhuma linha nova.

---

## 10. Fora de escopo, não tocado

M1/M2/M3/M4, purge, mídia, Minerador, Arquiteto, Radar, ArticleDNA, SERP. Em
Publicações, só o botão que já existia — reusado, renomeado no rótulo, sem
autoridade nova.

---

```text
SAVE_CAN_START_RETENTION = NO
FINALIZE_BUTTON_LIVE = YES
REOPEN_BUTTON_LIVE = YES
FINALIZATION_READBACK_REQUIRED = YES
RETENTION_ONLY_AFTER_FINALIZE_READBACK = YES
UNCHANGED_FINALIZATION_IDEMPOTENT = YES (approved) · PARCIAL (draft reaberto — ver §3.2)
REOPEN_PRESERVES_LAST_FINAL = YES
SCRIPT_FINALIZATION_UI_E2E = PENDENTE (homologação do usuário)
CAROUSEL_FINALIZATION_UI_E2E = PENDENTE (homologação do usuário)
PUBLICATION_REMAINS_SEPARATE = YES
MIGRATION_APPLIED = NO
REMOTE_DATA_MODIFIED = NO
REGRESSIONS = NONE
```

### O que fica aberto

1. **§3.2** — a linha de SQL que falta na próxima migration para que reabrir e
   finalizar sem editar volte a `approved` em vez de ser recusado.
2. **§9** — a homologação pela tela, que depende de sessão.
