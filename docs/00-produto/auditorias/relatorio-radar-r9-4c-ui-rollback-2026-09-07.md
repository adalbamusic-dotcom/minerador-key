# RADAR R9.4C-UI-ROLLBACK — correção de regressão visual

Data: 2026-09-07 · Área: Radar · Lote: R9.4C-UI-ROLLBACK
`PROVIDER_CALLS = 0` · `REMOTE_WRITES_DURING_TESTS = 0` · `MIGRATIONS = 0` ·
`SCHEMA_CHANGES = 0` · `COMMITS = 0` · `GIT_REVERT_USADO = NO`

---

## 0 · O que estava errado

O problema original era de posição de botão: um artigo sem snapshot não tinha
`Iniciar coleta SERP` visível. A resposta do lote anterior foi redesenhar o
produto — a jornada virou uma barra global de seis etapas acima dos cards e o
diagnóstico de contrato virou um painel que ocupava metade da área de trabalho.

Duas consequências concretas:

1. **A SERP deixou de ser autocontida.** Para agir sobre a SERP era preciso
   sair dela e subir a tela.
2. **Diagnóstico técnico tomou o lugar do trabalho.** A tabela de contexto
   editorial, aberta por padrão, empurrou a investigação para baixo da dobra.

Isto é regressão de composição, não de domínio. Nada do backend foi desfeito.

---

## 1 · A barra global saiu

`modules/radar/radar-investigation-bar.tsx` foi removido (arquivo não
versionado, criado no lote anterior e agora sem importadores). O Workbench
voltou à composição anterior:

```
cards superiores → área expandida da área selecionada → abas operacionais
→ ação no contexto da aba → planilha
```

A máquina de estados **permanece**: `lib/radar/investigation-state.ts`
continua sendo quem decide status e próxima ação. O que mudou é onde a resposta
aparece.

---

## 2 · O painel gigante virou um selo

O contexto editorial saiu da área principal do Workbench. Nada foi apagado:

- o card **Conteúdo** ganhou o selo compacto `Contexto parcial` no lugar de
  `dossiê preservado`, com tom de pendência;
- a leitura completa — campo, valor, fonte, classificação e dono da ausência —
  vive agora em **Conteúdo → Proveniência / detalhes técnicos**, dentro do
  `<details>` que já existia e **sem `open`**.

Toda a capacidade nova de leitura (KeywordDNA refs, secundárias/reforços,
SiloPage, decisões humanas da formação, proveniência SERP, InternalLinkGraph)
está preservada e projetada; só deixou de ocupar a tela principal.

---

## 3 · A ação voltou para dentro da aba

Nova função pura `radarSerpTabAction(tab, view)` em `investigation-state.ts`.
Ela responde uma pergunta mais estreita que a barra respondia: *estando NESTA
aba, qual é a minha ação?* A resposta é uma de três:

- **a ação primária**, quando a aba é dona dela;
- **um ponteiro** (`Continuar para Análise`, `Continuar para Revisão`) quando a
  dona é outra aba — navegação pura, sem tocar em domínio;
- **nada**, em Histórico, que é leitura.

O rodapé (`data-testid="radar-serp-tab-action"`) fica no **fim da área da aba,
alinhado à direita, antes da planilha** — a posição marcada em vermelho. Os
botões que estavam no cabeçalho de cada painel foram movidos para lá; não há
duplicação.

| Aba | Ação |
|---|---|
| Coleta | `Iniciar coleta SERP` sem snapshot · `Atualizar SERP` com snapshot · nada em bloqueio estrutural |
| Concorrentes | `Iniciar curadoria` · pendências explicam que a decisão é na tabela · `Continuar para Análise` |
| Análise | `Iniciar análise competitiva (N)` · `Analisar referências pendentes (N)` · `Gerar relatório competitivo` |
| Evidências | `Continuar para Revisão` |
| Revisão | `Revisar investigação` · `Aprovar investigação` · desabilitado com motivo quando bloqueada |
| Histórico | nenhuma |

Os estados curtos nas próprias abas (`Coleta ✓`, `Concorrentes 0/7`, `Análise
Pendente`) continuam vindo de `buildRadarSerpProcessTabs`, intocados.

Os handlers são os **canônicos que já existiam**: `onRefresh` (que é `collect`),
`onStartAnalysis`, `onAnalyzeSelected` e o dispatcher `runInvestigationAction`
da página. Nenhum handler novo foi criado.

---

## 4 · O que não foi tocado

DataForSEO, persistência remota, readback, guard de Silo, hidratação remota,
curadoria persistida, `RadarSerpCollectionAction`, a distinção
`STRUCTURAL_BLOCK` / `TRANSIENT_FAILURE`, a proteção contra duplo clique, zero
coleta automática em open/F5, `CompetitiveModel`, outliers, rastreabilidade por
página, `RadarCompetitiveReport` e a autoridade única de aprovação do R9.

Nenhum contrato, schema, migração ou rota foi alterado neste lote.

---

## 5 · Bloco de flags

```
GLOBAL_INVESTIGATION_BAR_REMOVED = YES
EDITORIAL_CONTEXT_MAIN_PANEL_REMOVED = YES
EDITORIAL_CONTEXT_TECHNICAL_DATA_PRESERVED = YES

SERP_SELF_CONTAINED_AGAIN = YES

COLLECTION_ACTION_INSIDE_SERP = YES
CURATION_ACTION_INSIDE_SERP = YES
ANALYSIS_ACTION_INSIDE_SERP = YES
REVIEW_ACTION_INSIDE_SERP = YES

SERP_START_VISIBLE_WITHOUT_SNAPSHOT = YES
SERP_START_VISIBLE_WITH_SNAPSHOT = NO
SERP_START_CALLS_CANONICAL_HANDLER = YES

CANONICAL_COLLECTION_HANDLER_PRESERVED = YES
REMOTE_PERSISTENCE_PRESERVED = YES
COMPETITIVE_MODEL_PRESERVED = YES
REPORT_PIPELINE_PRESERVED = YES
R9_APPROVAL_PRESERVED = YES

RADAR_TESTS_TOTAL = 266
RADAR_TESTS_PASS = 266
RADAR_TESTS_FAIL = 0
TYPECHECK_ERRORS_IN_RADAR = 0

PROVIDER_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0
MIGRATIONS = 0
SCHEMA_CHANGES = 0
COMMITS = 0
GIT_REVERT_USADO = NO
```

---

## 6 · Regressões de composição fixadas em teste

`tests/radar-composicao-ui.test.mts` (11 testes):

| | Garantia |
|---|---|
| A | nenhuma barra global é montada acima dos cards |
| B | `CONTEXTO EDITORIAL` não é painel principal e o `<details>` não abre sozinho |
| C | sem snapshot, `Iniciar coleta SERP` na aba Coleta |
| D | com snapshot, a primeira coleta não é oferecida |
| E | a ação da curadoria pertence à aba Concorrentes |
| F | a ação da análise e a geração do relatório pertencem à aba Análise |
| G | o rodapé usa os handlers canônicos existentes |
| H | nenhum provider e nenhum `useEffect` no render da SERP, do Workbench ou do dossiê |

Dois testes do lote anterior foram invertidos porque afirmavam exatamente a
composição agora recusada:

- `radar-serp-start-visibility.test.mts` — “a barra vive acima dos cards” virou
  “a ação vive dentro da própria aba”;
- `radar-competitive-benchmark.test.mts` — os rótulos da análise passaram a ser
  verificados no domínio, e o painel continua exigindo um clique explícito.

---

## 7 · O que ainda não foi verificado

**O smoke visual continua sendo humano.** Não executei a tela: ela exige sessão
autenticada e a linha real de `máscara de skincare v7`. A verificação aqui foi
`tsc` (0 erros no Radar) e `pnpm run test:radar` (266/266).

Fora do Radar existem 3 erros de tipo pré-existentes neste working tree —
`components/editorial/dna-panels.tsx`, `lib/minerador/keyword-qualification.ts`
e `tests/agency-adalba-platform-internal.test.mts` — que vieram de outro lote e
não foram tocados aqui.

---

## 8 · Correção do smoke: a ação do artigo ativo

O rollback devolveu a ação para dentro da aba — e, com o card SERP recolhido,
ela ficou invisível. A planilha mostrava `Iniciar curadoria` como **texto** na
coluna Próxima ação: informação, não operação. Descobrir como continuar exigia
adivinhar que havia algo atrás do card.

Nova função pura `radarWorkbenchPrimaryAction({ investigation, collection })`
em `investigation-state.ts`. Ela responde a mesma pergunta da aba, um nível
acima: qual é a ação do **artigo ativo**, esteja a SERP aberta ou fechada.

O botão (`data-testid="radar-primary-action"`) é renderizado no fim do bloco
operacional, **depois do Relatório consolidado e antes da planilha**, alinhado
à direita. Um só, sem barra, stepper, wizard ou painel de diagnóstico.

Regras:

- **A SERP expandida é a dona do slot.** Enquanto `expandedArea === "serp"`, o
  botão externo não é renderizado — o rodapé da aba já carrega a mesma ação.
  Nunca existem dois botões para a mesma decisão.
- **A coleta continua decidida por `RadarSerpCollectionAction`.** Bloqueio
  estrutural não vira botão em lugar nenhum.
- **`DECIDE_RESULTS` navega em vez de rodar.** Decidir resultado acontece na
  tabela de Concorrentes; daqui o clique útil é abrir a SERP, não emitir um
  aviso pedindo que a pessoa a abra.
- **Ação bloqueada aparece desabilitada com o motivo ao lado**, nunca some.

Os três casos reais do smoke, cobertos por teste:

| Artigo | Estado | Ação |
|---|---|---|
| `mascara de skincare` | snapshot com 7 resultados, curadoria não iniciada | `Iniciar curadoria` |
| `serum facial principia` | sem snapshot | `Iniciar coleta SERP` |
| `marketing online` | 4 referências pendentes | `Analisar referências pendentes (4)` |

```
ACTIVE_ARTICLE_PRIMARY_ACTION_VISIBLE = YES
ACTION_VISIBLE_WITH_SERP_COLLAPSED = YES
NO_DUPLICATE_ACTIONS = YES
COLLECT_START_VISIBLE = YES
CURATION_START_VISIBLE = YES
ANALYSIS_CONTINUE_VISIBLE = YES
CANONICAL_HANDLERS_PRESERVED = YES

RADAR_TESTS_TOTAL = 273
RADAR_TESTS_PASS = 273
RADAR_TESTS_FAIL = 0
TYPECHECK_ERRORS_IN_RADAR = 0
PROVIDER_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0
```

Domínio, persistência, DataForSEO, `CompetitiveModel`, relatório e aprovação
não foram tocados neste ajuste.

---

## 9 · R9.4D — o contrato da extração competitiva

### Reprodução com o payload real

Payload capturado imediatamente antes do boundary de validação, sem dados
sensíveis:

```
brandId              09762023-d0d4-4c24-b34e-d0fdfd43f891
articleId            article-mascara-de-skincare
articleDnaVersionId  4bfca609-0e2e-4d50-8797-5d387adb4849
snapshotId           serp:mascara-de-skincare:v4  (versão 4)
curation fingerprint sha256:… (serpSnapshotHash da análise)
selectedResultIds    organic:1 … organic:7
selectedUrls         7
principalKeyword     mascara de skincare
campos opcionais     keyword
```

O mesmo objeto contra o schema real do endpoint:

```json
{
  "path": "candidates",
  "code": "too_big",
  "expected": "<= 5",
  "origin": "array",
  "received": "7 itens",
  "message": "Too big: expected array to have <=5 items"
}
```

O mesmo pedido com cinco candidatos: **aceito**.

### A fronteira que recusa

```
EXTRACTION_FAILURE_CLASS = C (schema do servidor e montagem do cliente divergiram)
EXTRACTION_FAILURE_PATH  = candidates → too_big (<= 5, recebido 7)
EXTRACTION_FAILURE_OWNER = Radar (contrato do endpoint de extração + handler da análise)
```

O endpoint sempre limitou uma requisição a cinco páginas externas — um teto
real de fan-out, não preferência de UI. O que faltava era o cliente conhecer
esse teto: com sete referências curadas ele mandava as sete e descobria o
limite por 400, sob uma mensagem que não dizia qual contrato havia recusado.

### A correção

O schema saiu de dentro da rota e virou `lib/radar/extraction-request.ts`:
`RADAR_EXTRACTION_BATCH_LIMIT`, `RadarExtractionRequestSchema` (ainda
`.strict()`, ainda `.max(5)`), `radarExtractionBatches()` e o portão
`radarExtractionRefusal()`. **Nada foi afrouxado**: sem `.passthrough()`, sem
`unknown`, sem remover `.strict()`, sem busca por texto.

O cliente passou a enviar a seleção em lotes do tamanho do contrato — sete
referências viram dois lotes (5 + 2), na ordem da curadoria, sem perder nem
repetir nenhuma.

Dois campos opcionais foram acrescentados ao pedido: `snapshotId` e
`snapshotHash`. Com eles, o servidor recusa uma seleção montada sobre outro
snapshot ou sobre outra impressão digital de curadoria em vez de extrair
páginas que ninguém mais está vendo.

A principal só viaja quando está hidratada de verdade
(`radarPrincipalHydrated`): identificador técnico não é keyword.

### Diagnóstico com código

| Código | Quando |
|---|---|
| `EXTRACTION_REQUEST_INVALID` | o pedido não bate com o contrato |
| `EXTRACTION_BATCH_TOO_LARGE` | `too_big` em `candidates` |
| `EXTRACTION_ARTICLE_MISMATCH` | a análise é de outra marca ou outro artigo |
| `EXTRACTION_SNAPSHOT_STALE` | a seleção veio de outro snapshot |
| `EXTRACTION_CURATION_STALE` | fingerprint defasada, ou chave fora da curadoria |

A rota loga `[radar:extract] <código> <mensagem> <detalhes>` — incluindo os
`issues` do Zod. A tela mostra uma frase curta por código, e o cliente também
loga o código recebido.

### Falha parcial

Uma URL que falha volta como erro nomeado em `errors[]` e as demais seguem em
`pages[]`. O cliente acumula as falhas, preserva as páginas boas e só aborta
quando **nenhuma** página foi analisada. A mensagem de persistência diz quantas
ficaram fora da amostra. O benchmark usa apenas as extrações comparáveis.

### Semântica dos botões

A ação da SERP tem exatamente dois rótulos, e a análise nomeia o que faz:

```
SERP_PRIMARY_ACTION_WITHOUT_SNAPSHOT = "Iniciar coleta da SERP"
SERP_PRIMARY_ACTION_WITH_SNAPSHOT    = "Atualizar SERP"
ANALYSIS_ACTION                      = "Analisar páginas selecionadas (N)"
"INICIAR ANÁLISE COMPETITIVA"_VISIBLE = NO
```

Depois de uma falha transitória o rótulo **não** muda para "Tentar novamente" —
a possibilidade de repetir passou a viver no detalhe, não no nome do botão. A
coluna "Próxima ação" da planilha e a rota de detalhe usam o mesmo vocabulário.
O termo "análise competitiva" continua existindo apenas no domínio.

### Entrega

```
EXTRACTION_REQUEST_SCHEMA = lib/radar/extraction-request.ts · RadarExtractionRequestSchema (.strict())
EXTRACTION_REQUEST_INVALID_ROOT_CAUSE = candidates too_big (<= 5) com 7 selecionadas; teto do servidor desconhecido pelo cliente

PRIMARY_REACHES_EXTRACTION = YES (somente quando hidratada)
SELECTED_REFERENCES_REACH_EXTRACTION = YES (7 de 7, em lotes de 5 + 2)

STRICT_VALIDATION_PRESERVED = YES

EXTRACTION_CAN_START = YES
EXTRACTION_PARTIAL_FAILURE_SUPPORTED = YES

ANALYSIS_REMOTE_WRITE = YES
ANALYSIS_REMOTE_READBACK = YES

COMPETITIVE_MODEL_AFTER_EXTRACTION = YES (inalterado)

RADAR_TESTS_TOTAL = 285
RADAR_TESTS_PASS = 285
RADAR_TESTS_FAIL = 0
TYPECHECK_ERRORS_IN_RADAR = 0

REAL_PAGE_FETCH = 0
DATAFORSEO_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0

MANUAL_ANALYSIS_SMOKE_READY = YES (snapshot v4 já existente; nenhuma recoleta necessária)
```

Layout, botões, coleta SERP, curadoria, `CompetitiveModel`, relatório e
aprovação não foram alterados neste lote — apenas o contrato da extração e os
rótulos pedidos.

---

## 10 · R9.4E — curadoria em lote e síntese competitiva

### O que estava errado

Três coisas, todas visíveis no smoke:

1. **Cada clique de classificação era uma decisão editorial definitiva.**
   Marcar sete referências produzia sete versões remotas, sete readbacks e
   sete avisos idênticos: *"Curadoria atualizada; a análise derivada foi
   reaberta"*.
2. **A leitura era feita com amostra ainda aberta.** Uma página analisada
   chegou a produzir 31 necessidades — número que depois virou 2 com as sete
   páginas. Inteligência derivada antes de a amostra fechar.
3. **A saída começava pela matemática.** Mediana, faixa central e outlier
   primeiro; a conclusão, por conta do leitor. E "apareceu em 1 de 7" virava
   lacuna por aritmética, o que fez a tela recomendar *"cobrir Buscar produtos
   com profundidade"*.

### Curadoria é rascunho até confirmar

Marcar, classificar e escrever motivo passaram a alimentar um rascunho local no
painel. Nenhum write, nenhum readback, nenhuma reabertura, nenhum aviso por
clique. A aba mostra `N referência(s) selecionada(s) · M alteração(ões) ainda
não confirmada(s)` e o rodapé oferece **`Confirmar seleção (N)`**.

`confirmSerpCuration` aplica o conjunto inteiro: **uma sucessora, uma
persistência, um readback, um aviso** — `Seleção confirmada: N referência(s)
serão usadas na análise.` Sem alteração, a função sai antes de qualquer
escrita. `persistSerpDecision` foi removido.

Enquanto houver rascunho pendente, as outras abas apontam de volta para
Concorrentes em vez de analisar sobre uma seleção que ninguém gravou.

### Uma análise lógica, lotes invisíveis

Os lotes de 5 + 2 continuam existindo no transporte e desapareceram do produto:
o progresso aparece como `Analisando páginas 5 de 7…`, e **benchmark, modelo,
relatório e sucessora são construídos depois do último lote**. O resultado é
`7 páginas analisadas.` — ou `6 de 7 páginas analisadas · 1 não pôde(ram) ser
processada(s).` quando houve falha parcial.

### Nem tudo que aparece uma vez é lacuna

Novo módulo `lib/radar/topic-classification.ts`. Cada tópico observado recebe
uma classe, com motivo:

| Classe | Significado |
|---|---|
| `RECURRENT_TOPIC` | repete na maioria da amostra — é o que os concorrentes fazem |
| `COMPETITIVE_GAP` | relacionado à consulta, à principal ou ao contexto editorial, e pouco coberto |
| `ISOLATED_TOPIC` | pouco coberto e sem relação com o que se busca |
| `PAGE_SPECIFIC_NOISE` | vitrine, navegação, CTA, ficha de produto |

Só `COMPETITIVE_GAP` chega às lacunas, e só lacuna vira oportunidade. "Buscar
produtos", "Disponível nos kits" e "Descrição do produto" passam a aparecer
nomeados como fora da leitura editorial, em vez de virarem pauta.

### Conclusão primeiro, matemática depois

`lib/radar/serp-synthesis.ts` traduz o modelo em frases, e a aba Análise abre
com **Resumo da SERP**: amostra, intenção predominante, formato dominante, o
que os concorrentes fazem em comum, estrutura observada, tópicos recorrentes, o
que ficou pouco coberto, oportunidades e limitações. Mediana, faixa, outliers,
links, headings e proveniência por página seguem inteiros — dentro de
`Ver dados técnicos da amostra`, recolhido.

### Fronteira

A síntese descreve a amostra: "5 de 7 páginas fazem X", "faixa central de
palavras 1371–1871". Não diz quantos H2 o nosso artigo terá, nem quantas
palavras, nem qual o outline. Isso continua sendo do Planejador, e um teste
recusa o vocabulário prescritivo na saída.

### Entrega

```
CURATION_DRAFT_MODE = YES
REMOTE_WRITE_PER_CLASSIFICATION = NO
CURATION_CONFIRM_SINGLE_WRITE = YES (1 sucessora · 1 persistência · 1 readback · 1 aviso)

ANALYSIS_ONLY_AFTER_CONFIRMED_CURATION = YES
LOGICAL_ANALYSIS_SINGLE_ACROSS_BATCHES = YES

PARTIAL_BATCH_DOES_NOT_PUBLISH_FINAL_MODEL = YES

SUMMARY_FIRST = YES
TECHNICAL_DATA_COLLAPSED = YES

ISOLATED_TOPIC_NOT_AUTOMATIC_GAP = YES
COMPETITIVE_GAP_SEMANTICALLY_FILTERED = YES (consulta · principal · contexto editorial)

NOTIFICATION_NOISE_REDUCED = YES (só coleta, seleção confirmada, análise, relatório e revisão)

RADAR_TESTS_TOTAL = 298
RADAR_TESTS_PASS = 298
RADAR_TESTS_FAIL = 0
TYPECHECK_ERRORS_IN_RADAR = 0

REAL_PAGE_FETCH = 0
DATAFORSEO_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0
```

Layout, posição de botões, `radarWorkbenchPrimaryAction`, `radarSerpTabAction`,
DataForSEO, batching 5+2, contratos de extração, Arquiteto e Planejador não
foram alterados.

---

## 11 · Correção: `classifiedTopics` precisava ser aditivo

O R9.4E acrescentou `classifiedTopics` ao `RadarCompetitiveModelSchema` como
campo **obrigatório**. Os relatórios gravados entre o R9.4B e o R9.4E já tinham
`observedCompetitiveModel`, mas sem esse campo — e passaram a falhar no parse:

```
2 item(ns) carregado(s) · 1 registro(s) incompatível(is) · radar e509fc16…
(analysisVersions.8.payload.competitiveReport.observedCompetitiveModel.classifiedTopics,
 analysisVersions.9.payload.competitiveReport.observedCompetitiveModel.classifiedTopics)
```

Erro meu, e do tipo que a disciplina do projeto já previne: campo novo em
payload persistido nasce com `.default()`. Agora
`classifiedTopics: z.array(...).default([])` — versão antiga volta a parsear com
lista vazia, e o campo se preenche quando o relatório for gerado de novo.

Nada foi perdido: a recuperação nunca apaga o `localStorage`, só recusa o
registro incompatível. Depois do reload as versões 8 e 9 carregam normalmente.

```
ADDITIVE_FIELD_DEFAULT = YES
LEGACY_MODEL_PARSES = YES (classifiedTopics = [])
RADAR_TESTS_TOTAL = 299
RADAR_TESTS_PASS = 299
RADAR_TESTS_FAIL = 0
```

---

## 12 · R9.4F — isolamento por snapshot e estado canônico

### Evidência 1 · `8 resultados · 7 selecionados · 8 aprovadas`

**Classificação: B — o contador usava a fonte errada.** Não havia aprovação
antiga vazando, curadoria em outro snapshot nem merge entre versões.

`approvedReferences` contava `projection.rows.filter(row => row.decision?.decision === "included")` —
**toda decisão marcada como incluída**, o que soma concorrente, apoio e formato.
`selectedCompetitors` contava outra coisa: só as páginas cujo papel é
`primary`/`support`. Duas fontes sob nomes que sugeriam a mesma grandeza, e um
rótulo — "Referências aprovadas" — que fala de aprovação humana sem nunca ter
olhado para a revisão da SERP.

Correção:

- `approvedReferences` passa a vir da **aprovação corrente**: revisão aprovada,
  do snapshot atual, com `currentness === "current"`. Sem isso, zero.
- O total honesto ganhou nome próprio: `includedReferences`, exibido como
  **Referências incluídas**.

### Evidência 2 · `Seleção confirmada: 7` → `Nenhuma das 1 página(s) selecionada(s)`

**Root cause: duas palavras erradas sobre dois números diferentes.**

O "1" era a quantidade de **falhas**, e o conjunto tentado era o de **páginas
pendentes** — a seleção de 7 menos as 6 já extraídas na versão anterior da
análise (`radarAnalysisCandidates` filtra URLs já extraídas). Nada estava
corrompido: as outras 6 não foram reprocessadas porque **já estavam na amostra,
reutilizadas**. O que faltava era a tela dizer isso.

Novo módulo `lib/radar/analysis-membership.ts` com uma fonte só:

```
selecionadas = a curadoria confirmada de agora
reutilizadas = já extraídas E ainda selecionadas
pendentes    = selecionadas sem extração
órfãs        = extrações que não pertencem mais à seleção (cache, não amostra)
```

Invariante: `selecionadas = reutilizadas + pendentes`, sempre. Extração existir
nunca decide pertencimento — quem decide é a seleção confirmada.

A tela passa a mostrar `7 selecionada(s) · 6 já analisada(s) · 1 pendente(s)`, e
as mensagens usam o vocabulário certo: `Nenhuma das 1 página(s) pendente(s)
pôde ser analisada. As 6 já analisada(s) continuam na amostra.`

### A cadeia canônica

`lib/radar/current-state-chain.ts` monta a matriz pedida — snapshot, curadoria,
análise, relatório e aprovação — cada uma declarando o snapshot e a impressão
digital da curadoria a que pertence, com `consistent` e `breaks` nomeando o que
não fecha. Ela aparece dentro de **Ver dados técnicos da amostra**, recolhida.

A regra de snapshot novo já era estrutural (`radarAnalysisMatchesSerp` amarra a
análise a id + versão + hash) e agora está fixada em teste: com snapshot novo,
curadoria, análise, relatório e aprovação correntes são `null`, os contadores
zeram — e o histórico continua inteiro e inalterado.

### Entrega

```
CURRENT_STATE_CHAIN_CONSISTENT = YES (após as correções; a cadeia expõe as quebras quando existem)
CROSS_SNAPSHOT_STATE_LEAK = NO
OLD_APPROVAL_PRESENTED_AS_CURRENT = NO (era o contador, não a aprovação)

MASK_RESULTS = snapshot corrente · organicResults.length
MASK_CURRENT_SELECTED = curadoria confirmada corrente · selectedResultIds.length
MASK_CURRENT_APPROVED = aprovação corrente (aprovada + mesmo snapshot + fingerprint atual); 0 sem ela
MASK_CURRENT_ANALYZED = extrações que pertencem à seleção confirmada

"1 PAGE SELECTED" ROOT_CAUSE = a mensagem chamava de "selecionadas" o número de falhas, sobre um conjunto que era o de pendentes (7 selecionadas − 6 reutilizadas)
PAGE_EXTRACTION_CACHE_SEPARATED_FROM_ANALYSIS_MEMBERSHIP = YES (reused/pending/orphan)

NEW_SNAPSHOT_RESETS_CURRENT_INVESTIGATION = YES
HISTORY_PRESERVED = YES

FRESH_SERUM_SMOKE_READY = YES

RADAR_TESTS_TOTAL = 307
RADAR_TESTS_PASS = 307
RADAR_TESTS_FAIL = 0
TYPECHECK_ERRORS_IN_RADAR = 0
```

Nada de visual, `CompetitiveModel`, qualidade do resumo ou `ExpertEvidence` foi
alterado neste lote.

---

## 13 · R9.4G — cardinalidade real e gate de suficiência

### Parte A · por que 8

Não existe teto artificial. O normalizador da DataForSEO
(`lib/server/dataforseo-serp-normalizer.ts`) faz duas coisas:

1. **filtra por tipo** — `if (!item || (itemType && itemType !== "organic" && itemType !== "video")) return null;`
   Tudo que não é `organic` ou `video` (ads, shopping, featured snippet, PAA,
   related searches, knowledge graph) sai da lista de resultados e vai para os
   campos próprios;
2. **corta pelo pedido** — `.slice(0, input.resultLimit)`, e `resultLimit` é
   `SERP_DEFAULT_RESULTS || 10`.

A prova está nas próprias posições do smoke: **5, 6, 7, 8, 9, 11, 12, 13** — não
contíguas e começando em 5. As posições 1–4 e 10 existiam na resposta e não eram
organic/video. Oito é o número real depois do filtro de tipo.

O arquivo *tem* um `slice(0, 8)`, e vale dizer qual: ele corta `missingTopics`
no diagnóstico, não os resultados.

Como o payload cru não é persistido, a conta agora fica registrada:
`diagnostic.rawItemTypeCounts` (aditivo, `.default({})`) guarda quantos itens de
cada tipo o provider devolveu. A próxima coleta traz a distribuição sem depender
de inferência.

```
REQUESTED_SERP_DEPTH   = SERP_DEFAULT_RESULTS || 10
RAW_ITEMS_TOTAL        = não persistido no snapshot v1; a partir de agora em diagnostic.rawItemTypeCounts
RAW_ITEMS_BY_TYPE      = idem
RAW_ORGANIC_ITEMS      = 8 organic+video (inferido das posições 5–13, confirmado pelo filtro de tipo)
NORMALIZED_ORGANIC     = 8
PERSISTED_ORGANIC      = 8
UI_ORGANIC             = 8
SERP_RESULT_CAP_8_EXISTS = NO
```

### Parte B · por que 7 e não 8

`SELECTION_CAP_7_EXISTS = NO`. Há perda, e ela tem causa nomeada:
`deriveRadarReferenceRole` rebaixa a `format` qualquer resultado de
vídeo/social — inclusive quando a decisão humana é `included` — e
`radarOrganicSelectionFor` define `selected = role === "primary" || "support"`.
No smoke, a posição 12 é `youtube.com`: a pessoa incluiu 8, o benchmark ficou
com 7, e a diferença nunca foi explicada.

A regra continua correta (vídeo não é artigo editorial comparável), mas deixou
de ser silenciosa: o painel mostra **Referências incluídas** ao lado de
**Concorrentes selecionados** e explica a diferença —
"N referência(s) incluída(s) foram classificadas como formato observado (vídeo
ou social) e ficam fora do benchmark editorial."

```
SELECTION_CAP_7_EXISTS = NO
SELECTION_LOSS_EXISTS  = YES (visível, não silenciosa)
SELECTION_LOSS_REASON  = rebaixamento a "format" por tipo de resultado (vídeo/social)
CONFIRMED_SELECTION_EXACT = YES (a seleção humana não encolhe; a elegibilidade é outro número)
```

### Partes C a I · o defeito funcional

`lib/radar/investigation-sufficiency.ts` é a autoridade nova:
`SUFFICIENT` (≥3 comparáveis, sem falha), `PARTIAL_BUT_USABLE` (1–2
comparáveis, ou com falhas), `INSUFFICIENT` (zero comparáveis) e `BLOCKED`
(sem snapshot, sem curadoria confirmada ou sem seleção).

Com zero comparáveis:

- o modelo competitivo, as lacunas e as oportunidades **não são montados** —
  já era assim no cálculo, e agora a UI diz por quê em vez de mostrar caixas
  vazias;
- as **necessidades competitivas não são derivadas**: `need:semantics` e
  `need:structure` passaram a exigir amostra comparável;
- a **aprovação é recusada** pelo portão canônico do R9.

O painel abre com o estado real — `Análise insuficiente` — e nomeia a causa
provável: páginas comerciais/produto, vídeo, bloqueio de extração ou formato
incompatível. Quando a SERP é dominada por produto, isso aparece como
descoberta sobre a consulta, não como artigo editorial a imitar.

### Parte E · de onde vieram as 49 necessidades

`need:semantics` usava `payload.semanticTerms` — os termos recorrentes de
**todas** as páginas extraídas, comparáveis ou não, cortados em 50. O
consolidado R6 achata `[title, ...topics]`, e 48 termos + 1 título = 49. Os
restos de entidade HTML na tela (`aacute`, `ccedil`, `oacute`, `atilde`)
confirmam a origem: texto cru de extração, promovido a necessidade.

```
"49 NEEDS" ROOT_CAUSE = need:semantics derivado de semanticTerms (termos crus de todas as páginas, sem exigir amostra comparável), achatado pelo consolidado R6
```

Agora, sem amostra comparável, `competitiveNeeds = []` e os termos observados
continuam visíveis como observação e limitação.

### Parte F · falhas por página

`extractionFailures` entrou no payload da análise (aditivo, `.default([])`) com
`key`, `url`, `code`, `message`, `status` e `observedAt`. A tela agrega —
"3 página(s) selecionada(s) não puderam ser extraídas" — e detalha por página
em bloco recolhido.

### Parte G · intenção e formato

Fontes separadas e rotuladas: **Intenção observada na SERP**
(`research.diagnostic.dominantIntent`, derivada de títulos e snippets) e
**Formatos observados na SERP** (`diagnostic.dominantFormats`). O formato
dominante do benchmark só existe quando há amostra comparável.

```
SERP_INTENT_SOURCE     = research.diagnostic.dominantIntent (títulos e snippets do snapshot)
DOMINANT_FORMAT_SOURCE = classificação da extração; só publicado com amostra comparável
```

### Entrega

```
SERP_RESULT_CAP_8_EXISTS = NO
SELECTION_CAP_7_EXISTS = NO
CONFIRMED_SELECTION_EXACT = YES

CURRENT_SELECTED   = 7   (smoke "cremes skin care")
CURRENT_ANALYZED   = 4
CURRENT_FAILED     = 3
CURRENT_COMPARABLE = 0

INVESTIGATION_SUFFICIENCY = INSUFFICIENT

ZERO_COMPARABLE_CAN_BUILD_FINAL_MODEL = NO
ZERO_COMPARABLE_CAN_GENERATE_COMPETITIVE_NEEDS = NO
ZERO_COMPARABLE_CAN_BE_APPROVED = NO

RADAR_TESTS_TOTAL = 320
RADAR_TESTS_PASS = 320
RADAR_TESTS_FAIL = 0
TYPECHECK_ERRORS_IN_RADAR = 0

PROVIDER_CALLS_DURING_TESTS = 0
REMOTE_WRITES_DURING_TESTS = 0
```

Layout, Workbench, Arquiteto, ExpertEvidence e migrations não foram tocados.
