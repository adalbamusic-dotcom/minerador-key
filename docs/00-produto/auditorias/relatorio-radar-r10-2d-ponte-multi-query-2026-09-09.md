# RADAR R10.2D — A ponte multi-query: universo → curadoria → extração → modelo

Data: 2026-09-09 · Lote: R10.2D · Implementação autorizada

## ENTREGA

```
MULTI_QUERY_DISCOVERY          = YES
MULTI_QUERY_CURATION           = YES
MULTI_QUERY_EXTRACTION         = YES
MULTI_QUERY_COMPETITIVE_MODEL  = YES
MULTI_QUERY_COMPETITIVE_REPORT = YES

RESEARCH_REFERENCE_IDENTITY    = research:<fnv1a-64 hex da URL normalizada>
POSITION_COLLISION_ELIMINATED  = YES

CANONICAL_CURATION_UNCHANGED       = YES
CANONICAL_SERP_SEMANTICS_PRESERVED = YES

AUXILIARY_ONLY_COMPETITOR_VISIBLE     = YES
AUXILIARY_ONLY_COMPETITOR_CURATABLE   = YES
AUXILIARY_ONLY_COMPETITOR_EXTRACTABLE = YES
AUXILIARY_ONLY_COMPETITOR_IN_MODEL    = YES
AUXILIARY_ONLY_COMPETITOR_IN_REPORT   = YES

SERVER_RESOLVES_URL_FROM_REFERENCE_ID = YES
CLIENT_ARBITRARY_URL_FETCH_POSSIBLE   = NO

RESEARCH_CURATION_CURRENTNESS = universeFingerprint (referenceId:queryCount, ordenado) → STALE
LEGACY_ITEMS_SUPPORTED        = YES

RADAR_TESTS_TOTAL = 418
RADAR_TESTS_PASS  = 418
RADAR_TESTS_FAIL  = 0

PROVIDER_CALLS_DURING_TESTS = 0
REMOTE_WRITES_DURING_TESTS  = 0
MIGRATIONS                  = 0

MANUAL_SMOKE_READY = YES
```

---

## 1 · A identidade nova, e o que ela NÃO tocou

A colisão que a R10.2C provou:

```
Principal, posição 2 → B  ⎫
Auxiliar,  posição 2 → D  ⎬ ambas seriam `organic:2`
```

`lib/radar/research-reference.ts` dá à pesquisa profunda o seu próprio espaço:

```
referenceId  = research:<fnv1a-64 hex>   derivado da URL NORMALIZADA
normalizedUrl = protocolo, www., query, fragmento e barra final removidos
                — o CAMINHO permanece
```

A normalização é a que o Arquiteto já usava para comparar SERPs
(`candidate-serp-boundary.ts`), agora exportada e compartilhada: **uma
autoridade só** para "é a mesma página?". O universo passou a chavear por ela
também, então universo e curadoria não podem discordar por construção.

**A curadoria canônica não mudou uma linha.** `organic:<position>`, snapshot,
revisão, aprovação e histórico continuam exatamente como estavam — o teste U
verifica inclusive que a string `research:` não aparece em `serp-curation.ts`.

---

## 2 · A curadoria da pesquisa

`lib/radar/research-curation.ts`. Fonte: CompetitorUniverse → ResearchReferences.

**Vocabulário reaproveitado, não duplicado.** `primary`, `support`, `format`,
`excluded` e `pending` são os mesmos da curadoria canônica. Só `authority`
é novo — o universo enxerga fonte de autoridade, e a SERP canônica nunca
precisou nomear isso. Uma taxonomia com um valor a mais.

**Recorrência sugere, não decide** (§20 e §21): a classificação vira
`suggestedDecision`, e `decision` nasce `pending`. Uma URL em quatro consultas
chega pré-classificada como concorrente **e continua pendente** até uma pessoa
marcar.

**Draft + confirmação**: marcar é local; `Confirmar seleção (N)` grava uma vez,
com readback, exatamente como a canônica.

**Persistência sem migração**: `deepResearch.researchCuration`, aditiva com
`.default(null)`. Guarda `universeFingerprint`, `confirmedAt`, `confirmedBy` e,
por referência, `referenceId + normalizedUrl + url + decision + reason`.

**Currentness**: a impressão do universo é `referenceId:queryCount` ordenado. Se
uma URL entra, sai, ou passa a aparecer em outra consulta, a curadoria anterior
vira `STALE` — preservada, nunca reaplicada (teste J).

---

## 3 · A extração, e o buraco que ela fechou

O achado da R10.2C: o portão validava a **chave**, e a URL vinha do cliente ao
lado dela. Três mudanças eliminam isso:

**1. O contrato não tem onde colocar a URL.**

```ts
RadarResearchExtractionCandidateSchema = z.object({
  source: z.literal("research"),
  referenceId: z.string().min(1),
}).strict();
```

**2. A autoridade é a análise PERSISTIDA, não a enviada.** A rota lê a linha
Radar da marca (`WorkflowRepository.findByArticle`) e resolve `referenceId → URL`
sobre ela. Sem leitura remota, referência nenhuma é extraída — recusa declarada,
503, e o caminho canônico segue.

**3. O canônico também ficou amarrado.** `RadarSerpDecisionSchema` ganhou `url`
(aditivo, opcional), preenchido na criação a partir de `research.organicResults`.
E para a decisão antiga, sem `url`, a rota carrega o **snapshot persistido** e
monta `organic:<posição> → URL`. Chave legítima com destino trocado passa a ser
`EXTRACTION_URL_MISMATCH`.

Três códigos novos: `REFERENCE_UNKNOWN`, `REFERENCE_NOT_SELECTED`, `URL_MISMATCH`.

Os guardas SSRF continuam **obrigatórios e ativos** — localhost, `.local`,
metadata, IP privado/reservado, revalidação pós-DNS (teste Q). Eles nunca foram
substituídos pela validação de identidade: são camadas diferentes.

---

## 4 · Modelo e relatório

`CompetitiveModel` recebe as páginas extraídas da curadoria confirmada: o
relatório calcula a amostra comparável somando as primárias canônicas às
referências marcadas `primary` na pesquisa, comparadas por URL normalizada.

`referenceProvenance` (aditivo, `.default([])`) responde "de onde saiu essa
página?" — `origin` (CANONICAL / AUXILIARY / CANONICAL_AND_AUXILIARY / FORMATION),
`queryCount`, `classification` e as aparições com keyword, papel e rank.

Nota de escopo: o array `competitors` do relatório continua descrevendo a **SERP
canônica** (cada item exige `serpPosition`, que uma referência só-auxiliar não
tem nela). A procedência das páginas só-auxiliares vive em `referenceProvenance`.

---

## 5 · A tela

Com pesquisa profunda ativa, a aba **Concorrentes** mostra o **universo
pesquisado**: página, domínio, origem, classificação com motivo, a frase de
recorrência ("Encontrada em 2 consulta(s): Secundária "melhor sabonete…" #2 ·
Secundária "protetor solar…" #1") e a seleção humana.

A curadoria da SERP canônica continua na mesma aba, recolhida em
`<details>` — íntegra, porque é ela que sustenta snapshot, revisão e aprovação.

**Contadores separados** (§17): a canônica mostra os seus resultados; a pesquisa
mostra referências pesquisáveis, selecionadas, aguardando decisão e alterações
não confirmadas. O 7 da canônica não é mais reaproveitado como se fosse o
universo.

---

## 6 · Testes

`tests/radar-r10-2d-ponte-multi-query.test.mts` — 24 testes, fixture A–F exata do
lote, todos passando.

| Grupo | Cobertura |
| --- | --- |
| **22 · Identidade (A–D)** | posições iguais em SERPs diferentes não colidem; B na canônica e na auxiliar é uma referência com duas aparições; a mesma URL escrita de três jeitos dá `queryCount = 3`; URLs distintas no mesmo domínio são referências distintas |
| **23 · Curadoria (E–J)** | `available = 6`; D tem linha, classe e motivo; D é selecionável; a confirmação persiste D com a URL; F5 preserva D; universo diferente → `STALE` sem reaplicar |
| **24 · Extração (K–Q)** | D aceita por `referenceId`; aceita mesmo fora da canônica; URL manipulada impossível de expressar **e** recusada no canônico; id inexistente, não selecionado, sem curadoria e cross-brand recusados; SSRF ativo |
| **25 · Modelo (R–U)** | D entra no CompetitiveModel; D entra no relatório; procedência mostra as auxiliares; **CANONICAL_SERP_RESULTS continua 3** |
| **26 · Compatibilidade** | item sem `researchCuration` parseia e segue canônico; decisão antiga sem `url` continua válida; universo vazio não quebra |

Dois testes anteriores foram **invertidos**, não afrouxados: o `HOP 2` da R10.2C
provava a desconexão e agora guarda a correção; o `corte` provava as três URLs
sem porta e agora guarda a separação entre as duas listas.

```
pnpm run test:radar        418/418
pnpm run test:arquiteto    2011/2012  (falha pré-existente do Minerador, alheia)
npx tsc --noEmit           0 erro em Radar
eslint (arquivos tocados)  0 erro
```

### Correção pós-entrega: TDZ no painel

A primeira versão quebrou a aba em runtime — `ReferenceError: Cannot access
'busy' before initialization`. O painel é uma função única com dezenas de
`const` de JSX, avaliadas na ordem em que aparecem; a tabela do universo foi
inserida **antes** da linha que declara `busy`. O typecheck não vê (a referência
existe) e os testes de texto não veem (a string está lá).

A declaração subiu para o topo do componente e nasceu um guarda:
`o painel não lê nenhuma const antes de declará-la (TDZ)`, que varre o corpo
inteiro do arquivo com comentários, strings e texto de JSX mascarados — e foi
verificado contra a regressão simulada, para não ser um teste que passa sempre.

`pnpm run test:operational` tem 10 falhas **pré-existentes nesta branch**: elas
verificam texto de arquivos do Arquiteto/Minerador alterados por lotes
anteriores (`git diff HEAD` mostra a linha `if (response.ok) return { ok: true };`
removida antes deste lote). Nenhuma cita Radar.

---

## 7 · O que NÃO foi tocado

ArticleDNA, Minerador, SiloDNA, planejamento de consultas, agrupamento semântico
de tópicos, Planejador, decisão de links, outline, Workbench. Nenhuma migration.

---

## 8 · Homologação manual

1. Abrir um artigo com pesquisa profunda concluída → a aba **Concorrentes**
   mostra o universo inteiro, não só os resultados da principal.
2. Uma página encontrada apenas por secundária aparece com origem **Auxiliar** e
   a frase de recorrência.
3. Marcar essa página como concorrente → o rodapé oferece
   `Confirmar seleção (N)`; nada é gravado antes.
4. Confirmar → uma escrita, um aviso, readback.
5. `Analisar páginas selecionadas (N)` → a página auxiliar é extraída.
6. O relatório traz a página na amostra, com procedência auxiliar.
7. A subaba **Coleta** e a **Revisão** continuam mostrando só a SERP canônica.
8. Reabrir depois de nova pesquisa (universo diferente) → a curadoria anterior
   aparece como obsoleta, sem decisões reaplicadas.
