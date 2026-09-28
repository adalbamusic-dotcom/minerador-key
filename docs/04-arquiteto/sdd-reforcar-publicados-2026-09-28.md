# SDD curta — Reforçar publicados (2026-09-28)

```text
ESTADO = APROVADA PELO DONO EM 2026-09-28 ("Sim, teto US$ 1,00")
MODULO_PROPRIETARIO = Arquiteto
CRUZA = Minerador (import, Lógica, Volume, aprovação e envio ao Arquiteto — pelos núcleos existentes)
MIGRATION = 0 · SQL = 0 · CAMPO_NOVO_EM_STRICT = 0 · ESCRITA_REMOTA_NO_DESENVOLVIMENTO = 0 · CHAMADA_PAGA_NO_DESENVOLVIMENTO = 0
DEPLOY = uma fase só (sem schema novo; ArticleDNA sem campo novo)
```

## 1. Problema (AdalbaPro, 2026-09-28)

"Reprocessar artigos" dizia SUCCESS ("FORMATIONS_CHANGED = 21 · READY_TO_CONCLUDE =
21") sem gravar nada no artigo, e todo cartão de publicado mandava "conclua a
formação e volte aqui". Publicado nunca passa por "Concluir formação": o candidato
dele nasce sem slug e a confirmação o recusa (`PUBLISHED_COLLISION`,
`lib/arquiteto/article-formation-confirmation.ts`). Resultado: 21 publicados sem
ArticleDNA, a troca e a diferenciação sem onde gravar, 14 publicados "Sem par no
lote" sem saída, e o par de 7 páginas de "como atrair pacientes para clínica"
barrado pelo rótulo de intenção.

## 2. Decisão (os 5 pontos do dono)

1. **"Reforçar publicados"**: numa confirmação só, grava o ArticleDNA do publicado
   (o primeiro, quando não existe), a troca aceita e os reforços marcados, com
   releitura. Acaba o "conclua a formação e volte aqui".
2. **"Buscar keywords para os publicados sem par"**, em lote: Google Ads (URL e
   tema como semente, grátis), só com volume do Google Ads, as melhores
   validadas pela SERP nas 4 lentes (pago, prévia com hash, uma confirmação,
   cache primeiro), **teto de US$ 1,00 por rodada no servidor**. Resultado no
   cartão: Forte (≥ 3 páginas em comum) ou Provável (2 páginas com palavras).
   Publicados que disputam o mesmo assunto entre si seguem a diferenciação.
3. **D2.3.1 — as páginas vencem o rótulo**: com 3+ páginas em comum, a intenção
   observada diferente vira aviso; com 2 ou menos (ou sem SERP), continua barrando.
4. Mensagens simples que dizem o que foi gravado e o que não foi.
5. Cartões "Sem par no lote" viram uma linha com o botão da busca em lote.

Esta SDD cobre o núcleo (1, 2, 3 e a frase do desfecho de 4); a tela (4 e 5) usa
os contratos abaixo.

## 3. Contrato — Reforçar publicados

`POST /api/arquiteto/published-reinforcement`
(`lib/server/arquiteto-published-reinforcement.ts`, domínio
`lib/arquiteto/published-reinforcement.ts`).

Pedido (`.strict()`):

```ts
{
  brandId: string;                       // o servidor confere; a marca vem do contexto
  mode: "preview" | "apply";
  pages: Array<{                         // 1 a 30
    publishedKeywordId: string;          // a principal publicada
    keywordIds: string[];                // keywords do Minerador que devem estar no artigo (até 10)
    newKeywords: string[];               // texto das novas, do resultado gravado da busca em lote (até 10)
    swapKeywordId: string | null;        // troca aceita (Posto Livre)
  }>;
  decisionHash?: string;                 // apply: o da prévia
  operationRequestId?: string;           // apply: uuid (idempotência dos passos do Minerador)
  approveNewKeywords?: boolean;          // apply com keyword nova: o dono aprova no Minerador
}
```

Recusas no pedido: publicado repetido; a mesma keyword em dois publicados (ela
iria para dois artigos); publicada como reforço de outro publicado.

`preview` (grátis, `arquiteto:view`, não grava): relê publicados (Vínculo), Posto,
itens de workflow do Arquiteto, ArticleDNA vigente, cache de SERP (nível de cada
keyword e ranqueamento da página) e o resultado gravado da busca em lote. Devolve
`{ decisionHash, pages: PublishedReinforcementPagePlan[], approvalText, message }`.
Cada página: `status` (`ready` | `unchanged` | `refused`), `dna.mode` (`first` |
`successor` | `none`), `keep`, `add` (com `fromTerritoryRef` quando muda de Silo),
`create` (keywords novas), `swap` (`apply` | `refused` | `none`, com motivo),
`refused` (keyword e motivo) e `lines` (as frases da confirmação).

`apply` (`arquiteto:edit`; com keyword nova também `minerador:create/edit/approve`
e `arquiteto:create`): exige o mesmo `decisionHash` (estado mudou → 409
`PREVIEW_CHANGED`, nada gravado) e, com keyword nova, `approveNewKeywords = true`
(senão 422 `HUMAN_APPROVAL_REQUIRED`). Por página, na ordem, **parando no primeiro
erro com o motivo**:

1. Keyword nova: `importSubjectDiscoveryWithCore` (tema = a principal publicada,
   `subjectKeywordId = null`, `searchId` = a rodada da busca, `importRequestId`
   estável) → `runKeywordLogicWithCore` → Volume do Google Ads (a MESMA rota
   `/api/minerador/marcas/[brandId]/google-ads/metricas-keywords`, em processo) →
   releitura do volume (sem volume do Google Ads: fica de fora, com motivo) →
   aprovação (`keywordDecisionEntries` + `applyKeywordDecisionEntries`, ator = a
   sessão; exige só Lógica e Volume) → `createMineradorArquitetoHandoff`.
2. Composição: `articleFormationRef` (o existente ou `article-formation:<uuid
   estável>`) + decisão humana `move` em cada item, e `territoryRef` do publicado
   para quem vem de outro Silo — pela MESMA rota PATCH `/api/arquiteto/workspace`
   da mesa (lock por item, trava da identidade publicada). Releitura do ref.
3. ArticleDNA: o primeiro (`buildFirstPublishedArticleDna`: construtor
   determinístico com `publishedAnchorId`, guarda do publicado, pai = território
   no estágio INITIAL, `siloId` nulo sem Silo canônico) ou a sucessora
   (`withReinforcementKeywords`: acrescenta referências secundárias, nada
   remove). Troca aceita por `decidePublishedPrimarySwap` +
   `buildPublishedSwapArticlePayload` (os da mesa). Gravado por
   `appendArquitetoArtifact(..., "approved")` e confirmado por
   `publishedReinforcementReadbackConfirms` (principal, keywords — nenhuma a
   menos —, slug, canonical e marca).

Resposta: `{ pages: PublishedReinforcementPageOutcome[], written, readbackConfirmed,
stopped, tone, message }`. `tone = "success"` só quando a releitura confirmou;
nada gravado é `info`; parada é `warning`.

**Status do primeiro ArticleDNA**: `approved`. A confirmação é a aprovação humana
do artigo (o mesmo papel de "Concluir formação" para os não publicados), e o
texto da confirmação diz isso. A sucessora também sai aprovada.

**Aprovação revalidada (correção de 2026-09-28, §12)**: antes de gravar `approved`,
o núcleo marca `architectureStatus = architecture_confirmed` e leva o
`serpAssessmentRef` do parecer de SERP do artigo gravado pelo Processar
(`withHumanArticleApproval`), e roda `articleApprovalRevalidationIssues` — a mesma
portaria da rota `/api/arquiteto/artifacts`. Sem parecer, a página é recusada na
prévia com o motivo. O Posto do publicado (política da principal) não é travado.

## 4. Contrato — busca em lote

`POST /api/arquiteto/published-reinforcement/search/plan` e `.../search/run`
(`lib/server/arquiteto-published-reinforcement-search.ts`, domínio
`lib/arquiteto/published-reinforcement-search.ts`).

- `plan` `{ brandId, pageKeywordIds (1–30), resume?, replaceResult? }` (grátis):
  separa os pedidos pelos dois modos (`partitionReinforcementPages` sobre
  `detectPublishedCannibalization`), monta o plano (`published-reinforcement-plan-v1`:
  Google Ads `keyword_seed` [tema] e `url_seed` [tema + URL]; SERP de até 5
  candidatas por página nas 4 lentes), corta acima de US$ 1,00 (candidatas 5 →
  3 → 2, depois páginas) e grava a prévia (`planned`). Devolve `searchId`
  (`rs-<16 hex>` do conjunto de páginas), `plan` (faixa de custo, `planHash`),
  `differentiation` (grupos que vão ao painel da diferenciação).
- `run` `{ brandId, searchId, operationRequestId, authorizedPlan: { planHash,
  maxCostUsd ≤ 1 } }` (pago): hash, teto, releitura das páginas (mudou → nada
  pago), reserva `planned → running` por `lock_version` antes de abrir o
  provider; a MESMA rodada repetida devolve o gravado sem pagar; outra rodada na
  mesma prévia é recusada (`REINFORCEMENT_ALREADY_RUN`).
- Núcleo comum com a diferenciação (refatorado sem mudar comportamento):
  `executePublishedSearchRound` (ledger, orçamento, Google Ads, junção,
  métricas históricas, SERP com cache), `fitPublishedSearchPagesToCap`,
  `authorizePublishedSearchPlan`, `acquirePublishedSearchLock`.
- Filtro de reforço: só `adsVolume > 0` (Google Ads; estimativa não vale), nunca
  publicada da marca; o tema da página vai à frente, depois o volume.
- Avaliação: cada candidata vai para UM publicado (o que divide mais páginas);
  Forte = `measureAnchorConvergence` com base `serp` (3+ páginas); Provável =
  `serp_and_words` (2 páginas com palavras). Forte vem marcada até as vagas.
- Resultado por página em `payload.run.pages[].suggestions[]` (`keyword`,
  `normalizedKeyword`, `adsVolume`, `level`, `sharedPageCount`, `reason`,
  `existingKeywordId`, `origins`, `evidence`, `preselected`). O Reforçar lê daí
  as keywords novas (`readReinforcementSearchSuggestions`).
- Proposta em `editorial_workflow_items` (`subject_type =
  published_reinforcement_search`, `stage = architect`), o mesmo lugar e o mesmo
  writer da diferenciação (`writeDifferentiationProposal` com `subjectType`).

## 5. D2.3.1 — as páginas vencem o rótulo

`serpObservedBarrier` e `serpObservedWarning` (`lib/arquiteto/serp-subject-convergence.ts`):
com overlap `strong`, a intenção/funil observados diferentes não barram e
entram como aviso ("…, mas N páginas do top 10 coincidem; quem diz o assunto são
as páginas"). `serpAwareDnaBarrier`, `measureAnchorConvergence`,
`suggestAnchorReinforcements` e `groupLeftoverOpportunities` seguem a regra; a
formação (`article-formation-priority.ts`) e a troca (`published-primary-swap.ts`)
herdam pela barreira. Com 2 páginas ou sem SERP, nada muda.

## 6. Consumidores

- Mesa do Arquiteto (cartões, painel da diferenciação, faixa "Sem par no lote"):
  passa a chamar as três rotas novas (tela, outra frente).
- Diferenciação: mesmas rotas e mesmo comportamento (núcleo refatorado; suítes
  da diferenciação verdes). A mensagem "conclua a formação" dela aponta para o
  Reforçar publicados (tela).
- MCP/catálogo (§17.1): ferramenta nova `preview_published_reinforcement` (só
  prévia, `platform.read`); gravar e pagar ficam na tela. `run_keyword_logic` e
  `decide_keywords` delegam ao núcleo extraído
  (`lib/server/minerador-keyword-decision-core.ts`), sem mudar a saída.
- Radar e Planejador: recebem o ArticleDNA do publicado como qualquer outro
  (identidade publicada protegida).
- Minerador: nenhuma regra nova; os núcleos são os mesmos das telas/MCP.

## 7. Riscos

- **Composição idêntica**: a mesa reconhece o ArticleDNA pela composição igual à
  do candidato (`partitionMaterializedArticles`). O Reforçar grava a formação
  humana ANTES do DNA com as mesmas keywords; se a tela recompuser o candidato
  com outras keywords, o DNA aparece como acervo (sinal, não perda).
- **Publicado sem slug**: sem URL no Vínculo, a página é recusada com o motivo.
- **Silo que não fecha**: o fechamento automático usa todos os candidatos; o
  publicado agora tem ArticleDNA, mas o marcador `concludedFormations` não é
  atualizado por esta rota (pendência abaixo).
- **Chamada de rota em processo** (PATCH da mesa e Volume do Minerador): usa a
  mesma sessão do pedido; no MCP não há sessão de cookie, por isso aplicar não é
  ferramenta.
- **Import sem índice único**: dois pedidos simultâneos em instâncias diferentes
  podem duplicar a keyword nova (limite já registrado do núcleo do import).

## 8. Rollback

Reverter o código. As versões de ArticleDNA gravadas ficam como histórico (nada é
apagado); a formação humana gravada nos itens continua válida para a mesa; as
propostas `published_reinforcement_search` ficam inertes. Nenhuma migration a
desfazer.

## 9. Testes

- `tests/arquiteto-reforcar-publicados.test.mts` (em `test:arquiteto`): plano por
  página, recusas, teto de 6, troca (Livre/Travado/não declarado/ranqueia),
  primeiro DNA com identidade do site, sucessora sem perder keyword, readback,
  mensagens, plano da busca (14 × 5 = US$ 0,98; 30 cortam), dois modos, filtro,
  avaliação com a SERP real e rodada com portas falsas.
- `tests/arquiteto-reforcar-publicados-servidor.test.mts` (em
  `test:arquiteto:servidor`): prévia sem gravar e isolada por marca, aplicar com
  e sem hash, keyword nova na ordem dos núcleos com o aceite, parada no passo que
  falha, busca em lote com diferenciação separada, rodada paga e repetição sem
  pagar, recusas do pedido.
- `tests/arquiteto-serp-mesmo-assunto.test.mts`: D2.3.1 (7 páginas → Forte com
  aviso; 2 páginas → barra).

## 10. Ordem de deploy

Uma fase só: nenhum schema novo, ArticleDNA sem campo novo, propostas num
`subject_type` livre de `editorial_workflow_items` (CHECK só em `stage`).

## 11. Tela (entregue em 2026-09-28)

Sem mudança de contrato do núcleo. `modules/arquiteto/published-reinforcement-model.ts`
(pedido a partir dos cartões, prévia, desfecho, busca em lote, linha dos sem par),
`use-published-reinforcement.ts` (as chamadas; gravar só com o hash e um
`operationRequestId` novo; rodada paga só pela confirmação, id novo por rodada)
e `published-reinforcement-panel.tsx` (a barra, a confirmação única, a linha
"Sem par no lote" e as keywords da busca no cartão). Mensagens simples em
`lib/arquiteto/plain-run-messages.ts` (Processar/Reprocessar e allintitle) e em
`describeSerpSubjectBatchOutcome` (mudança de Silo). A confirmação do custo da
busca usa o diálogo da diferenciação (mesmo núcleo e teto por rodada), não o
`SerpPaidPlanDialog`, que descreve lentes. Teste: `tests/arquiteto-reforcar-publicados-tela.test.mts`.

## 12. Correções de 2026-09-28 (revisão)

- **Aprovação sem portaria** (corrigido): ver §3, "Aprovação revalidada". Teste:
  o ArticleDNA gravado passa em `articleApprovalRevalidationIssues`; sem parecer
  de SERP a prévia recusa.
- **Papel humano preservado** (corrigido): o papel de quem não está no ArticleDNA
  vem da decisão humana da formação (`reforco` → `reforco_narrativo`); quem já
  está na formação do publicado não é regravado só para normalizar papel.
- **Silo só de quem entra** (corrigido): só as keywords que entram agora (marcadas
  e novas, anunciadas na prévia) mudam para o Silo do publicado.
- **Uma keyword, um artigo** (corrigido): formação gravada com outra principal
  decidida por humano, membro ou escolhida já no ArticleDNA de outro artigo, e
  keyword do Minerador em outro estado no Arquiteto são recusadas com o motivo.
  Na tela, a keyword marcada em dois publicados entra só no de mais páginas em
  comum (membro ou substituta da troca vencem) e a confirmação segue com todos.
- **Desfecho honesto** (corrigido): na parada, o publicado que falhou diz o que já
  ficou gravado (Minerador, composição); os não tentados são nomeados; keyword
  nova sem volume fica no Minerador, fora do artigo, e é dita; sucessora igual à
  vigente não grava versão.
- **Releitura** (reforçada): composição confere ref, papel e Silo; ArticleDNA
  confere `versionId` e `contentHash` do que foi gravado.
- **Permissões do Minerador** (corrigido): conferidas só quando a prévia
  confirmada tem keyword nova (`loadMinerador`).
- **Chamadas em processo** (corrigido): levam só cookie/authorization e
  `content-type` (`inProcessRequestHeaders`), nunca o `content-length` de outro corpo.
- **Teto por rodada** (corrigido): rodada paga que para no meio marca a prévia
  (`interrupted`); a mesma prévia não roda de novo com outro id. A próxima rodada
  exige prévia e confirmação novas; o coletado está no cache.
- **MCP** (corrigido): a prévia passa pelo mesmo schema e pelas mesmas leituras
  da rota (`lib/server/arquiteto-published-reinforcement-deps.ts`).
- **Convenção do slug do publicado**: `suggestedSlug` = último segmento da URL
  publicada (`publishedSlugOf`); a identidade protegida da troca guarda o caminho
  inteiro (como a mesa lê). Pendência: a rota `article-dna` (IA) usa
  `slug_sugerido` da keyword; se ele divergir da URL, uma versão gerada por ela
  trocaria o slug — conferir antes de usar a IA num publicado reforçado.
