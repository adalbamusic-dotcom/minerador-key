# RADAR R9.1 — Início explícito da SERP e diagnóstico canônico da keyword — 2026-09-06

`PROVIDER_CALLS_DURING_TESTS = 0` · `REMOTE_WRITES_DURING_TESTS = 0` ·
`R9_APPROVAL_AUTHORITY_CHANGED = NO`.

Estado de partida (R9): 37 arquivos, 191/191.
Estado de chegada: **38 arquivos, 206/206**.

---

## DIAGNOSED

### A mensagem acusava o objeto errado

`A keyword principal não pertence à marca selecionada.` **não era um erro de
keyword.** Era o guard de posse do **Silo**, em
`app/api/editorial/serp/route.ts`:

```ts
const possibleSiloIds = canonicalUuidCandidates([article.payload.siloId, keyword?.lista_id,
  publishedBriefing?.silo_id, hydratedPrincipal?.siloId, hydration?.silo?.id, resolutionEnvelope.silo?.id]);
…
const siloResult = await profile.supabase.from("minerador_keyword_lists").select("id,marca_id").in("id", possibleSiloIds);
ownedSilo = (siloResult.data || []).find(silo => silo.marca_id === brandId) || null;
if (!ownedSilo) throw new AuthzError(403, "A keyword principal não pertence à marca selecionada.");
```

A prova de que o erro veio daí, e não do cliente: `resolvePrimaryKeyword`
devolve outra frase — *"A keyword principal deste artigo não foi encontrada.
Corrija o vínculo no Arquiteto…"* — e é ela que `collect` mostraria se a
recusa fosse local. A frase observada existe **em um único lugar** do
repositório. Logo a requisição chegou ao servidor e morreu no guard de Silo.

### Por que o guard recusou

Existem **dois espaços de identidade de Silo**, e o guard só conhecia um:

| Espaço | Onde vive | O guard conferia? |
| --- | --- | :-: |
| **Legado** — lista do Minerador | `minerador_keyword_lists.id` | ✅ |
| **Canônico** — SiloDNA (fluxo Silo-first) | `editorial_artifact_versions`, `payload.siloId` | ❌ |

No fluxo Silo-first, `RadarItem.siloId` vem de
`resolveCanonicalSiloForArticle` → `SiloDNA.payload.siloId`. E esse valor
**nem sempre é UUID**: `lib/arquiteto/silo-working-copy-record.ts:26-30`
registra que, para cópias novas, o id é `working-silo:<n>`, e só para cópias
de listas existentes é *"um UUID cru vindo de `lista_id`"*.

Duas consequências, ambas fatais para o guard antigo:

1. `canonicalUuidCandidates` **descarta** um `siloId` não-UUID antes da
   consulta;
2. mesmo sendo UUID, um `SiloDNA.siloId` que não nasceu de uma lista **não
   existe** em `minerador_keyword_lists`.

Restavam então dois caminhos para provar posse — `keyword.lista_id` e
`hydration.principalKeyword.siloId` —, ambos derivados do `lista_id` da
keyword. Uma keyword sem lista é estado **válido** pelo próprio
`AGENTS.md` §14 (*"Keywords sem lista continuam válidas e visíveis"*). Com
`lista_id` nulo e Silo canônico fora do espaço legado, não sobra prova
nenhuma — e o artigo é recusado com uma frase sobre a keyword.

### Classificação

```text
CURRENT_FAILURE_ROOT_CAUSE = I (outro — provado)
```

Nenhuma das opções A–H descreve o caso: o `RadarItem` não tem referência
errada (A), o ArticleDNA é coerente (B), o snapshot de hidratação está certo
(C), o envelope está bem montado (D), o resolver não escolhe id errado (E), a
keyword não está em outra Brand (F/G) e não é preservação incompleta de import
legado (H).

É **mismatch de espaço de identidade**: o `siloId` canônico (SiloDNA) sendo
verificado contra a tabela do espaço legado (`minerador_keyword_lists`), com o
guard de Brand ancorado só nesse espaço — agravado por uma mensagem que
culpava a keyword por um problema de Silo.

```text
CURRENT_SERP_KEYWORD_FAILURE_OWNER = RADAR
```

A rota `app/api/editorial/serp/route.ts` é do Radar pela própria spec
(*"Radar possui … `app/api/editorial/serp/route.ts`"*). **Não é o mesmo
bloqueio do B1**: aquele é `siloIdProvenance` → `WorkflowCommandSchema` →
HTTP 400 no `import_radar`, e impede importar artigos **novos**. Este é
403 na coleta de um artigo **já importado**. Causas diferentes, superfícies
diferentes, donos diferentes. B1 permanece intocado.

---

## IMPLEMENTED

### 1. A prova de posse do Silo passa a aceitar as duas identidades

`app/api/editorial/serp/route.ts`:

- os SiloDNA da marca são lidos do repositório **tenantizado** que a rota já
  chamava — `new ArtifactRepository().list(brandId)`, filtrado por
  `.eq("marca_id", marcaId)` — sem custo extra e sem consulta nova;
- um candidato é aceito se provar posse **no espaço legado** (linha de
  `minerador_keyword_lists` com `marca_id === brandId`) **ou no canônico**
  (`siloId` presente entre os SiloDNA daquela marca);
- sem nenhuma prova, continua 403.

**O guard cross-brand não foi enfraquecido — foi estendido.** Nada passou a
confiar no navegador: as duas provas são leituras remotas escopadas por marca.
Nenhum `.eq("brand_id", …)` foi removido, nenhum match por texto foi
introduzido, nenhum alias ambíguo é aceito. A regra segue:
`Brand da rota = Brand do RadarItem = Brand do ArticleDNA = Brand do Silo`.

`ownedSiloIds` agora é uma lista, e ela inteira vira `allowedSiloIds` do
`resolvePrimaryKeyword` — o que preserva o caso em que a keyword pertence a uma
lista de **outra** marca: ela continua barrada.

### 2. A mensagem passou a dizer o que falhou

> *O Silo deste artigo não pôde ser comprovado dentro da marca selecionada.
> Nenhuma coleta foi iniciada.*

Um teste impede o retorno da frase antiga.

### 3. Ação primária explícita

`lib/radar/serp-collection-state.ts` (novo, domínio puro) define os sete
estados do pedido e a ação derivada deles:

| Estado | Rótulo |
| --- | --- |
| `NOT_COLLECTED` | **Iniciar coleta SERP** |
| `VALIDATING` | Validando artigo… |
| `COLLECTING` | Coletando SERP… |
| `PERSISTING` | Salvando snapshot… |
| `SUCCESS` | Snapshot disponível |
| `TRANSIENT_FAILURE` | Tentar novamente |
| `STRUCTURAL_BLOCK` | Coleta bloqueada |

A ação é **derivada do estado real** (snapshot + contexto), nunca de um clique
preso na sessão. Sem snapshot e com contexto pronto, há uma ação primária
destacada. Com snapshot, a primeira coleta **não** é oferecida — só
`Atualizar SERP`, com a semântica de sucessor já vigente. Em bloqueio
estrutural, **nenhuma** ação primária é oferecida.

### 4. Bloqueio ≠ retry

O `code` da resposta passou a viajar com o erro
(`components/editorial-pipeline-context.tsx`), porque sem ele o cliente
classificava vínculo quebrado como falha transitória.
`classifyRadarSerpCollectionFailure` decide **pelo código** primeiro
(`permission_denied`, `invalid_transfer`, `transfer_conflict`,
`invalid_serp_request`, `unauthenticated`, …) e só cai no texto como rede de
segurança. `persistence_unavailable`, timeout, 5xx e rede continuam
transitórios.

Projeções corrigidas:

| Onde | Antes | Agora (estrutural) |
| --- | --- | --- |
| Painel Coleta | `Tentar novamente` | bloco **Coleta bloqueada** + *"Corrija o vínculo da keyword antes de coletar. Nenhuma chamada DataForSEO foi iniciada."* |
| Coluna SERP | `Falha · tentar novamente` | **Coleta bloqueada** |
| Próxima ação | `Colete ou recupere a SERP…` | **Corrija o vínculo da keyword antes de coletar.** |

`Falha · tentar novamente` continua existindo — só para o transitório.
Detalhes técnicos (versão, ids) permanecem na proveniência; a mensagem
principal não carrega UUID, e há teste para isso.

### 5. Duplo clique

`collectingArticleIdRef` fecha a porta **antes do primeiro `await`**.
`busyArticleId` é estado de render e chega tarde. Um teste verifica a ordem
guard → await e a liberação no `finally`.

---

## TESTED

```text
npm run test:radar
tests 206 · pass 206 · fail 0 · skipped 0 · exit 0

arquivos descobertos = 38   executados = 38   não executados = 0
soma por arquivo = 206  (idêntica ao agregado)
```

O arquivo novo entrou pelo glob, sem tocar no script.

### Cobertura A–J — `tests/radar-serp-collection-start.test.mts`, 15 testes

| Item | O que ficou coberto |
| :-: | --- |
| A | sem snapshot: `Iniciar coleta SERP` visível, `canStart`, `isFirstCollection`; sem contexto, nenhuma ação |
| B/C | `pipeline.collectSerp` tem **um único** ponto de chamada; nenhum `useEffect` do Workbench coleta; o painel não coleta ao montar |
| D | os três estados em voo recusam novo disparo; o ref é conferido antes do `await` e liberado no `finally` |
| E | erro de Silo/marca/transferência/identidade/keyword técnica → `STRUCTURAL_BLOCK`, sem ação primária, sem "tentar novamente", sem UUID na mensagem |
| F | `persistence_unavailable`, 5xx, timeout e rede → `TRANSIENT_FAILURE` com `Tentar novamente` |
| G/H | com snapshot o estado é `SUCCESS`; após reload o modelo cai em `SUCCESS` pelo snapshot, nunca em `NOT_COLLECTED` |
| I | a rota mantém a prova legada com `marca_id`, lê os SiloDNA do repositório tenantizado, recusa sem prova, e a mensagem culpa o Silo |
| J | com snapshot não há primeira coleta; `Atualizar SERP` mantém a semântica de sucessor |

### Regressão

| Verificação | Antes | Depois |
| --- | --- | --- |
| `test:radar` | 191 / 191 / 0 | **206 / 206 / 0** |
| `test:arquiteto` | 1480 / 1479 / 1 | **idêntico** |
| `test:editorial` | 20 / 16 / 4 | **idêntico** |
| `test:operational` | 50 / 41 / 9 | **idêntico** |
| `npx tsc --noEmit` | 5 erros | **5**, os mesmos, nenhum em Radar |
| `eslint` (radar, rota, pipeline) | limpo | **limpo** |

---

## REMOTE_VERIFIED

Nada. Nenhuma leitura ou escrita remota, nenhuma chamada de provider.

## MANUAL_UI_VALIDATION

Nada — preparado, não executado.

---

## BLOCKED_EXTERNALLY

**B1 — `siloIdProvenance` → `WorkflowCommandSchema.strict()` → HTTP 400 no
`import_radar`.** Intocado. Impede importar artigos **novos**; não impede
coletar nos já importados. Dono: Arquiteto / transporte compartilhado.

**B2 — mutações locais antes do remoto** (`transition_radar`,
`import_planner`, `importApprovedSiloPagesToRadar`). Intocado.

**B3 — `npm test` global aborta em `test:authz`.** Não usado como gate.

---

## Fronteiras respeitadas

Não tocados: autoridade de aprovação do R9 (nenhuma linha de
`lib/radar/report-approval.ts`), ExternalEvidence, ExpertEvidence, Telegram,
Planejador, `import_planner`, InternalLinkGraph, campos mortos do handoff,
`matchedToPublished`, Territory duplicado, schema, migrations, RLS. O Workbench
não foi redesenhado.

**Arquivos alterados — 6 + 2 novos:**

```text
app/api/editorial/serp/route.ts              prova de posse do Silo nos dois espaços
components/editorial-pipeline-context.tsx    o code da resposta viaja com o erro
lib/radar/serp-collection-state.ts           (novo) estados e classificação
lib/radar/r3-workbench.ts                    campo opcional `serp.collection`
modules/radar/radar-page.tsx                 máquina de estados, guard de duplo clique, projeções
modules/radar/radar-r3-serp-panel.tsx        ação primária e bloco de bloqueio
tests/radar-serp-collection-start.test.mts   (novo) 15 testes
```

Os demais arquivos com modificação pendente no checkout são do R9 e do lote
anterior do Arquiteto.

---

## Retorno

```text
SERP_INITIAL_START_BUTTON = YES ("Iniciar coleta SERP")

SERP_OPEN_AUTO_COLLECT = NO
SERP_SELECT_AUTO_COLLECT = NO
SERP_RELOAD_AUTO_COLLECT = NO

STRUCTURAL_ERROR_DISTINCT_FROM_RETRY = YES
CROSS_BRAND_GUARD_PRESERVED = YES (estendido, não afrouxado)

CURRENT_FAILURE_ROOT_CAUSE = I — mismatch de espaço de identidade do Silo:
    SiloDNA.siloId (canônico, às vezes não-UUID) verificado apenas contra
    minerador_keyword_lists (legado), com mensagem culpando a keyword
CURRENT_FAILURE_OWNER = RADAR

CURRENT_ARTICLE_CAN_COLLECT_AFTER_FIX = LIKELY — depende de o SiloDNA deste
    artigo existir entre os artefatos da marca; só o smoke manual confirma

RADAR_TEST_FILES_EXECUTED = 38/38
RADAR_TESTS_TOTAL = 206
RADAR_TESTS_PASS = 206
RADAR_TESTS_FAIL = 0

PROVIDER_CALLS_DURING_TESTS = 0
REMOTE_WRITES_DURING_TESTS = 0

R9_APPROVAL_AUTHORITY_CHANGED = NO

MANUAL_SERP_SMOKE_READY = YES (para o artigo já importado)
```

**Sobre `MANUAL_SERP_SMOKE_READY = YES`:** a causa diagnosticada é do Radar e
foi corrigida aqui; o bloqueio externo B1 não participa deste caminho, porque
o artigo `serum facial principia` **já está importado**. O que permanece
incerto não é um bloqueio externo, e sim se a correção cobre este caso
concreto — daí `CURRENT_ARTICLE_CAN_COLLECT_AFTER_FIX = LIKELY`.

---

## Smoke manual — preparado, não executado

```text
 1. Abrir /{brandRef}/radar, selecionar "serum facial principia".
 2. SERP → Coleta. Esperado: botão "Iniciar coleta SERP" em destaque.
 3. Clicar UMA vez. Esperado, em sequência: "Validando artigo…",
    "Coletando SERP…", "Salvando snapshot…".
 4a. Sucesso → snapshot vN com resultados; a coluna SERP deixa de dizer
     "Aguardando SERP".
 4b. Bloqueio → bloco "Coleta bloqueada", SEM botão de repetir, e a coluna
     "Próxima ação" dizendo "Corrija o vínculo da keyword antes de coletar."
 5. F5. Esperado: snapshot continua disponível e NENHUMA nova coleta ocorre;
    o botão passa a ser "Atualizar SERP".
 6. Conferir no painel que a primeira coleta não é mais oferecida.
```

Se o passo 4b acontecer, o próximo diagnóstico é uma leitura read-only —
verificar se existe SiloDNA da marca `09762023-d0d4-4c24-b34e-d0fdfd43f891`
cujo `payload.siloId` coincide com o `siloId` do `RadarItem` deste artigo, e
qual é o `lista_id` da keyword `serum facial principia`. Duas linhas de SELECT
fecham a classificação entre `I` (corrigido aqui) e `G` (keyword sem vínculo
nesta Brand).

```text
NEXT_RECOMMENDED_RADAR_LOT = R10 — paridade de leitura da evidência de
    especialista entre Workbench e detalhe (P1 do R9)
```
