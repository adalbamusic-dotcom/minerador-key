# SDD — Acelerar o fluxo do plano, do cadastro ao entregável — 2026-10-13

> **Status: APROVADA PELO DONO em 2026-10-13 para implementação em fases (§9).**
> Autorização literal do dono (2026-10-13): "pode implementar, que seja tudo para
> melhorar e acelerar esse fluxo, desde o início até os entregáveis, e sobre os
> entregáveis não muda nem apaga nada das últimas arrumações que fizemos, ainda
> falta pequenos ajustes mas hoje ele já entrega o artigo com bom embasamento e
> argumentação útil."
> As decisões estruturais (§10) foram tomadas pela recomendação, sob essa frase.
> Este documento não altera código, não escreve no banco e não faz chamada paga.
> A única migration (M-A, §6) é escrita aqui e aplicada pelo dono. Commit, push e
> deploy são do dono (`AGENTS.md` §15).
>
> Complementa, sem repetir: SDD `sdd-plano-declarado-e-grupos-2026-10-12.md`
> (grupos, plano, guarda, leitura por grupo §8), SDD
> `sdd-cadastro-assunto-na-keyword-2026-10-13.md` (cadastro único, trava) e SDD
> `sdd-conversao-assunto-legado-2026-10-13.md` (conversão do Assunto anterior —
> **em implementação por outra frente**; esta SDD não a refaz). ADR-020 (KGR e
> volume) e ADR-022 (Assunto, D1-bis, D1-ter) continuam valendo; o §6.4 pede um
> adendo curto ao ADR-020.

## 0. Resumo para o dono

Uma auditoria do caminho "cadastro do plano → entregável" achou 15 atritos: cliques
repetidos, lotes que param inteiros por causa de uma keyword, diálogos de custo em
sequência, quatro portas para a mesma coisa, telas lendo a marca inteira e textos
que mandam pelo caminho errado. Esta SDD resolve os 15, sem mexer nos entregáveis.

O que muda para você, em ordem de entrega:

1. **Fase 1 — atalhos e textos certos (sem risco de dado).** "Processar artigos"
   faz tudo num clique e num diálogo de custo só; não pede mais allintitle pago
   quando o KGR está "não aplicável"; as mensagens dizem o caminho inteiro; o
   catálogo da IA (MCP) para de mandar pelo caminho errado.
2. **Fase 2 — uma decisão por etapa.** "Aprovar e enviar ao Arquiteto" de uma cor
   inteira, com prévia, motivo por keyword e recusa por item; depois dos links,
   "Marcar Pronto para Radar e enviar os N artigos deste Silo" numa confirmação;
   Arquiteto e Radar carregam só a cor escolhida (hoje a mesa tem ~11 MB).
3. **Fase 3 — pesquisa em lote que já traz o volume (a única migration).** A
   Pesquisa por Assunto roda para todas as linhas do cadastro de uma vez, e as
   sustentações importadas já chegam com o Volume do Google Ads que a pesquisa
   mediu (não precisa medir de novo).
4. **Fase 4 — o plano manda de ponta a ponta (depois da conversão).** O Silo do
   plano chega ao Arquiteto já confirmado; uma porta só para formar os artigos do
   plano; o card do cadastro resolve sobras e reaprovação; "Aplicar o plano ao
   Silo" já retira o que está fora do plano; "Tirar do plano" e "mudar a trava"
   viram uma confirmação.
5. **Fase 5 — o Radar acompanha o Arquiteto.** Quando o Arquiteto grava uma versão
   nova de um artigo que já está no Radar, o item mostra "Atualização disponível do
   Arquiteto" e você adota a versão nova com um clique, aproveitando a investigação
   que continua válida. O Arquiteto não é tocado e nunca precisa reenviar.

**Entregáveis intocados:** nenhum item muda o código, as regras, o formato ou o
texto fixo do CSV "Para escrever", do artigo-modelo/blueprint, da voz humana, das
âncoras naturais, da identidade de publicação, do Redator e de
`get_article_for_writing`. A prova é um retrato byte a byte tirado antes da Fase 1 e
conferido em toda fase (§2).

## 1. Identificação

- **Módulo proprietário:** declarado por item (§4), um por item (`AGENTS.md` §3).
  Minerador: 2, 7, 8, 9, 15 (parte Minerador). Arquiteto: 1, 3, 4, 5, 10.
  Compartilhado/editorial: 6, 12, 13. Radar: 14. Item 11 é de outra frente.
- **Consumidores:** Minerador, Arquiteto, Radar (só leitura do Arquiteto no item
  14), MCP (`lib/server/platform-mcp-tools.ts`) e catálogo
  (`lib/agent/platform-catalog.ts`, `AGENTS.md` §17.1). Redator e Publicações: só
  leitura, sem mudança.
- **Tipo:** misto. Locais, compartilhados aditivos e estruturais (workflow,
  persistência nova no item 8). Por ter estruturais, SDD antes do código
  (`AGENTS.md` §4).
- **Fontes lidas:** `AGENTS.md`; `docs/00-produto/invariantes.md`,
  `fluxo-oficial.md`, `pipeline-editorial-papeis-handoffs.md`;
  `docs/compartilhado/template-proposta-evolucao-modular.md`; as três SDDs acima;
  ADR-020, ADR-022; `docs/03-minerador`, `docs/04-arquiteto`, `docs/05-radar`
  (estado-atual e backlog).
- **Base das linhas citadas:** commit `4d546ce` (HEAD de
  `resgate/trabalho-nao-commitado-2026-09-05`), conferidas com `git show HEAD:`.
  A árvore de trabalho tem mudanças **não commitadas** de outras frentes (conversão
  do Assunto e lote do Radar) em `lib/minerador/declared-plan-import-core.ts`,
  `lib/arquiteto/declared-subject.ts`, `lib/server/arquiteto-article-improvement.ts`,
  `modules/arquiteto/arquiteto-workspace.tsx`, `modules/minerador/subject-cadastro-card.tsx`,
  `modules/radar/radar-page.tsx` e `modules/radar/radar-r4-bulk-operations-bar.tsx`;
  nelas os números de linha da árvore já diferem do HEAD (ex.: as sobras do plano
  estão em `declared-plan-import-core.ts:752-767` na árvore, `:685-700` no HEAD).
- **Leitura remota (só SELECT, 2026-10-13):** 12 itens no Radar (9 + 3 em duas
  marcas), **0** atrás de uma versão aprovada mais nova do ArticleDNA; 4 documentos
  no Redator.

## 2. Restrição: entregáveis intocados (pedido do dono)

### 2.1 O que é "entregável" aqui

| Entregável | Onde mora (verificado no código) |
|---|---|
| CSV "Para escrever" (completo, em partes, vídeo) | `lib/radar/portable-writing-export.ts`, `portable-export*.ts`, `portable-video-export.ts`, `portable-silo-export.ts`, `lib/server/radar-portable-export-core.ts`, `app/api/editorial/radar-export/route.ts` |
| Artigo-modelo / blueprint | `lib/radar/article-blueprint.ts`, `article-blueprint-freeze.ts`, `editorial-blueprint.ts` |
| Voz humana | `lib/radar/human-voice-guideline.ts` |
| Âncoras naturais | `lib/radar/natural-anchor.ts` |
| Identidade de publicação | `lib/radar/editorial-identity.ts` (inclusive o rótulo "Atualização disponível" da linha 56) |
| Redator | `lib/redator/**`, `modules/redator/**` |
| MCP de escrita | `get_article_for_writing`, `get_video_material`, `get_writer_*` (`lib/server/platform-mcp-tools.ts:1348`, `lib/server/radar-mcp-material.ts`) |

### 2.2 A regra

Nenhum item desta SDD muda código, regra, ordem, formato ou texto fixo desses
arquivos. O conteúdo de um entregável de um artigo só muda quando muda o **insumo**
dele por decisão humana que já existe hoje (nova versão do ArticleDNA aprovada no
Arquiteto) ou que esta SDD cria com prévia (adotar a versão nova no Radar, item 14).
Documento já enviado ao Redator fica na versão dele (`content_documents.article_dna_version_id`).

### 2.3 Como é provado

1. **Retrato byte a byte (E0), antes da Fase 1.** Teste novo
   `tests/entregaveis-intocados-2026-10-13.test.mts`, rodado no HEAD do dia sobre as
   fixtures que já existem (`tests/radar-csv-escrever-2026-10-08.test.mts`,
   `radar-csv-coerencia-export-2026-10-09.test.mts`,
   `agent-mcp-f1-volume-e-escrita.test.mts`, `radar-grupos-f6-entregaveis.test.mts`),
   com relógio fixo (`exportedAt` injetado — `radar-portable-export-core.ts:128`
   aceita `input.exportedAt`). Ele grava SHA-256 e tamanho em bytes de: CSV "Para
   escrever" completo, em partes e de vídeo; blueprint congelado (JSON canônico);
   resposta de `get_article_for_writing`, `get_video_material` e `get_writer_brief`;
   diretriz de voz; saída das âncoras naturais; `resolveRadarPublication` para os
   três estados. O arquivo `tests/fixtures/entregaveis-2026-10-13.sha256.json` nasce
   em E0 e **nenhuma fase desta SDD pode atualizá-lo**.
2. **Portão de arquivos protegidos por fase.** O relatório de cada fase registra
   `git diff --stat <base da fase> -- <lista do §2.1>` vazio.
3. **Conferência do dono no ar (opcional, grátis).** Antes do deploy de cada fase,
   exportar o CSV "Para escrever" de 1 ou 2 artigos finalizados; depois do deploy,
   exportar de novo e comparar o SHA-256 (o único campo que depende do relógio é a
   data da exportação; qualquer outra diferença para o deploy e aciona o rollback).

## 3. Contrato atual (verificado no código, HEAD `4d546ce`)

| # | Onde | O que faz hoje |
|---|---|---|
| C1 | `lib/arquiteto/architecture-working-proposal.ts:552-592` | "Processar arquitetura" põe as keywords de grupo com plano no Silo do plano (`pelaPlano`), como **proposta**; nada é confirmado. |
| C2 | `modules/arquiteto/architecture-panel.tsx:273`; `arquiteto-workspace.tsx:16510` (`confirmArchitecture`) | O Silo só vira confirmado com "Confirmar propostas novas"; até lá "Processar artigos" recusa: "Nenhum Silo confirmado libera formação de artigos ainda." (`:14341`). |
| C3 | `lib/server/arquiteto-workspace.ts:650` (`createMineradorArquitetoHandoff`), `app/api/arquiteto/handoff/route.ts` | O envio do Minerador grava itens `keyword/architect/received`; não toca território. |
| C4 | `modules/minerador/minerador-workspace.tsx:2669` (`handleUpdateStatus`), `:2701-2727` | Aprovar em lote é tudo ou nada: uma keyword sem requisito cancela o lote e só o **primeiro** motivo aparece (`:2710-2720`). A aprovação é gravada **pelo navegador** (`:2756-2762`, `.update({ status, analise_semantica })`) com `approvedBy: session?.user?.id \|\| "usuario"`. |
| C5 | `lib/server/minerador-keyword-decision-core.ts:180-246` | O núcleo de servidor da decisão (`keywordDecisionEntries` + `applyKeywordDecisionEntries`, desfecho por item `applied/unchanged/blocked/stale`, releitura) existe e é usado pelo MCP `decide_keywords` (`platform-mcp-tools.ts:885`) — **não** pela tela. |
| C6 | `minerador-workspace.tsx:4789` (select Status `hidden … min-[1800px]:block`), `:4806` ("Mais ações"), `:2954` (`handleBatchSendToArchitect`) | O select de status some abaixo de 1800 px; "Enviar ao Arquiteto" vive dentro de "Mais ações". |
| C7 | `lib/minerador/arquiteto-handoff-gates.ts:160-167`; `lib/server/arquiteto-workspace.ts:388-398` | O portão do envio diz só o primeiro motivo; o servidor recusa o lote inteiro (409) quando uma keyword não passa. |
| C8 | `arquiteto-workspace.tsx:10580-10638` (`collectArticleBatchSerp`), `:14353-14355` | Pagou a SERP do lote → devolve `"collected"` e o clique termina; a nota manda "clique em Processar artigos de novo". |
| C9 | `arquiteto-workspace.tsx:3347` (`measureArticleAllintitle`), `:14357-14365`, `:14435`, `:14455` | "Processar artigos" mede o allintitle de **toda** principal com volume do escopo, com diálogo pago próprio, sem olhar "Aplicar KGR" (ADR-020 adendo, item 5: o allintitle é do artigo que aplica KGR). Até três diálogos por clique: SERP do lote, validação (`confirmSerpValidation`) e allintitle. |
| C10 | `modules/arquiteto/article-improvement-panel.tsx:203-235`; `subject-panels.tsx:227-229`; `leftover-opportunities-panel.tsx:138`; `arquiteto-workspace.tsx:18968` | Quatro portas para formar artigo de Assunto: "Processar artigos"/"Concluir formação", cartão "Próximo passo" 1·2·3 da melhoria, "Formar artigos automaticamente", Sobras. |
| C11 | `lib/server/arquiteto-article-improvement.ts:138` | O preparo da melhoria lê a marca inteira (`loadCanonicalArquitetoWorkspace(context, { keywordDetail: "full" })` + `readDifferentiationBrandKeywords`), embora o leitor já aceite `groupFilter` (`lib/server/arquiteto-workspace.ts:548-556`). |
| C12 | `arquiteto-workspace.tsx:18026-18043` ("Processar links", "Confirmar links internos"), `:13956` (`markSelectedReadyForRadar`), `:4933` (`sendSelectedToRadar`), `:20593` | Depois dos links: três atos — confirmar o grafo, marcar Pronto para Radar, enviar. |
| C13 | `components/editorial-pipeline-context.tsx:502`; `lib/arquiteto/canonical-workspace.ts:284-286` | As telas leem a mesa sem `groupId`; o servidor já aceita (`app/api/editorial/workspace/route.ts:60-80`, `groupScope`). `detail=light` (SDD 2026-10-12 §8) **não foi implementado**. Mesa medida: 10,95 MB (`docs/05-radar/estado-atual.md:320-321`), teto da Vercel 4,5 MB (hoje em fluxo). Cache local: `minerador-pro:workflow-recovery:${actor}:${brand}` (`lib/editorial/persistence-contracts.ts:110`), sem grupo. |
| C14 | `modules/minerador/discovery/use-subject-search.ts:249-301` (plano), `:302+` (execução), `:449-480` (importação) | Pesquisa por Assunto: uma frase por vez — plano, confirmar, abrir importação, marcar, confirmar. |
| C15 | `lib/minerador/subject-discovery-search.ts:527` | Com `subjectKeywordId`, a semente da pesquisa é o **texto da keyword**, não o título do Assunto. |
| C16 | `app/api/minerador/marcas/[brandId]/subject-discovery/search/route.ts:21-24` | As candidatas (com a média do Google Ads, `SubjectDiscoveryGoogleAdsMetrics`) **não são gravadas no servidor**; ficam no navegador. |
| C17 | `lib/minerador/subject-discovery-import.ts:84-96`, `:549-561` | O import recusa métrica vinda do navegador (`.strict()`, Q11 `provenanceVerified: false`) e cria a keyword com `volume_search: null`: o volume precisa ser medido de novo. |
| C18 | `lib/minerador/google-ads-demand.ts:236-240` | Volume validado = `volume_measurement` com provider Google Ads, `averageMonthlySearches ≥ 0` e `measuredAt` válido. Escritor de hoje: `buildGoogleAdsVolumeMetricPatch` (`lib/minerador/google-ads-volume.ts:71-111`). |
| C19 | `lib/minerador/declared-plan-import-core.ts:684-700`; `modules/minerador/subject-cadastro-card.tsx:524`, `:628-635` | A prévia já sabe as sobras e quantas aprovadas voltam a "Em revisão", mas o card só lista; a nota diz "mande para a lixeira se quiser (**recuperável**)". |
| C20 | `supabase/migrations/20260921100000_exclusao_publicada_exige_declaracao.sql:109-130`; `minerador-workspace.tsx:5121-5124` | Keyword **não publicada** na "lixeira" é `DELETE` definitivo (a própria tela diz "Excluir definitivamente", com nome digitado). A nota de C19 e o passo 3 do §11 da SDD 2026-10-12 ("recuperáveis por Restaurar") estão **errados** para não publicada. |
| C21 | `lib/arquiteto/silo-declared-plan-application.ts:152-155`, `:183`, `:37` | "Aplicar o plano declarado ao Silo" recusa artigo fora do plano (`NON_PLAN_ARTICLES`, "Retire pelo 'Retirar artigo do Silo' antes") e avisa que o grafo de links fica para trás. |
| C22 | `lib/arquiteto/declared-plan-formation.ts:97`; `arquiteto-workspace.tsx:4979`; `minerador-workspace.tsx:2718-2720` | Mensagens sem o caminho inteiro; o bloqueio do envio ao Radar nomeia o artigo pela `promise`. |
| C23 | `lib/agent/platform-catalog.ts:1236`, `:1238`, `:384`, `:445`, `:88` | Playbook `artigo_sobre_tema` manda "Formar artigos automaticamente" e diz que aprovação é só na tela (o MCP tem `decide_keywords`); `review_and_approve` lista "Concluir revisão" como passo, mas a aprovação não exige revisão concluída (`lib/minerador/approved-package.ts:72-120`); `:445` e `:88` oferecem portas concorrentes. |
| C24 | `lib/radar/editorial-identity.ts:56`; `lib/radar/article-dna-current.ts:21-34` | No Radar, "Atualização disponível" é o rótulo da **publicação** (`update_due`/`updateRequested` de Publicações). Uma versão nova do ArticleDNA **não** aparece no Radar: o item segue na versão transportada. As SDDs de 2026-10-12 (§4 princípio 5; §6.3) e da conversão (§8) dizem o contrário ("como hoje") — texto errado. |
| C25 | `app/api/editorial/workflow/route.ts:54-120`; `lib/server/editorial-repositories.ts:538-546` | `import_radar` exige Pronto para Radar e faz upsert com `ignoreDuplicates`: não muda o item que já existe; o Arquiteto recusa reenviar artigo entregue (`docs/05-radar/backlog.md:158`, `docs/04-arquiteto/backlog.md:113`). |
| C26 | `lib/minerador/declared-plan-withdraw-core.ts:228`; `lib/server/arquiteto-silo-article-withdrawal.ts`; `app/api/arquiteto/silo-article-withdrawal/route.ts` | "Tirar do plano" (Minerador) e "Retirar artigo do Silo" (Arquiteto) são atos separados; entre eles, reaprovar e reenviar. |

## 4. Proposta por item

Legenda da classificação: **local** (um módulo, sem contrato novo), **compartilhado**
(aditivo e retrocompatível, `AGENTS.md` §4), **estrutural** (workflow, persistência ou
contrato — decisão registrada em §10, autorizada pelo dono em 2026-10-13).
"Depende da conversão" = só começa depois que a SDD da conversão (V1–V5) estiver no
código, por usar os mesmos arquivos ou os dados do grupo laranja.

### Item 1 — O Silo do plano chega ao Arquiteto já confirmado

- **Classificação:** estrutural (workflow: confirmação sem clique no Arquiteto). Dono: Arquiteto.
- **Contrato atual:** C1, C2, C3.
- **Proposta:** quando o envio ao Arquiteto (`createMineradorArquitetoHandoff`)
  recebe keywords de um grupo com plano declarado, o núcleo do Arquiteto, na mesma
  operação e depois da releitura do recebimento, chama `materializeDeclaredPlanSilo`
  (novo, no servidor do Arquiteto): acha o Silo do plano pela mesma regra de C1 (o
  ligado ao grupo em `editorial_groups.silo_id`, o existente com o mesmo slug, ou um
  candidato novo com nome/slug do plano), cria o território quando falta e o
  confirma, atribuindo as keywords do plano. Usa só campos que já existem no
  território (`lib/arquiteto/territory.ts`): `architecturalOrigin =
  "manual_strategic"`, `ingestionOrigin = "import"`, `provenance.producedBy =
  "human"`, `provenance.note = "Plano declarado no cadastro: grupo <cor>, plano vN,
  por <ator> em <data>"`. Liga o grupo com o evento existente `silo_linked`.
  Idempotente pelo `plan_hash` do grupo. Precedente: Silo publicado declarado já é
  efetivado sem novo aceite (`platform-catalog.ts:1238`, primeira frase).
- **Proveniência:** a decisão humana é o cadastro (ator e data do plano); o ator do
  envio fica no evento. Sem permissão `arquiteto:approve` do ator, o território fica
  candidato com o motivo e a tela diz quem pode confirmar.
- **Consumidores:** mesa do Arquiteto, "Processar arquitetura" (passa a encontrar o
  Silo já confirmado; C1 continua como rede de segurança), "Processar artigos" (sai
  de C2), MCP `send_keywords_to_arquiteto` (mesmo núcleo).
- **Compatibilidade:** sem campo novo; `ProposalAssignment.declaredBy` ganha
  `"declared_plan"` (aditivo, fora do hash). Sem plano, o envio é o de hoje.
- **Rollback:** código anterior; os territórios confirmados ficam como território
  confirmado comum (estado válido).
- **Testes:** envio de grupo com plano cria/acha e confirma o Silo uma vez (reenvio =
  sem mudança); sem plano = byte a byte o de hoje; sem permissão = candidato com
  motivo; isolamento por marca; Silo publicado nunca muda de URL/slug.
- **Riscos:** confirmar Silo que o dono não queria → mitigado: só com plano
  declarado (decisão humana explícita) e desfazível pelo caminho de hoje.
- **Depende da conversão:** não para planos do cadastro; sim para o grupo laranja.

### Item 2 — "Aprovar e enviar ao Arquiteto" por cor, com prévia e recusa por item

- **Classificação:** estrutural (workflow: aprovar + enviar numa decisão; a aprovação
  da tela passa ao núcleo de servidor). Dono: Minerador.
- **Contrato atual:** C4, C5, C6, C7.
- **Proposta:**
  - Botão visível na barra do Minerador (fora de "Mais ações"): **"Aprovar e enviar
    ao Arquiteto"**, para a seleção ou, sem seleção, para a cor ativa.
  - **Prévia (servidor):** rota nova `POST /api/minerador/marcas/[brandId]/keywords/approve-and-send`
    (`mode: preview|apply`, `decisionHash`), montada com `keywordDecisionEntries`
    (C5) e `evaluateMineradorArquitetoHandoff` por keyword. A tela mostra três
    grupos: "aprovar e enviar (N)", "já aprovadas, só enviar (M)", "não podem ir (K)"
    com **o motivo de cada uma**, agrupado por motivo ("falta a Lógica: 3 · falta o
    Volume: 2 · publicada: 1"). Cada linha pode ser desmarcada (recusa por item).
  - **Aplicar:** `applyKeywordDecisionEntries` (mesmo núcleo do MCP) para as
    marcadas → `createMineradorArquitetoHandoff` só para as que ficaram aprovadas
    → resultado por keyword. A barra de lote de sempre (`startBulkProgress`) mostra
    o andamento; sucesso só depois da releitura das linhas e dos itens recebidos.
  - O servidor do envio ganha o modo parcial (opção aditiva em
    `prepareCanonicalHandoff`): recusa por item em vez de 409 do lote (C7). A rota
    antiga `/api/arquiteto/handoff` mantém o comportamento de hoje.
  - A aprovação individual (select Status) passa a usar a mesma rota (sem gravação
    pelo navegador); `approvedBy` vira o `auth.users.id` da sessão no servidor.
  - **Um encadeamento só.** A frente da conversão já escreve, na árvore de trabalho
    (não commitado), o encadeamento de servidor "aprovar (só a Lógica) → enviar ao
    Arquiteto" em `lib/server/minerador-subject-conversion.ts` (`runConversionFollowUp`,
    sobre `applyKeywordDecisionEntries` e `createMineradorArquitetoHandoff`). Os itens
    2, 9 e 15 extraem e reaproveitam esse mesmo encadeamento (generalizado para
    qualquer keyword, com recusa por item), sem criar um segundo caminho.
- **Consumidores:** `handleUpdateStatus`, `handleBatchSendToArchitect`, MCP
  `decide_keywords` e `send_keywords_to_arquiteto` (inalterados; o catálogo descreve
  a nova porta da tela), `resolveApprovalReadiness` (inalterado).
- **Compatibilidade:** o registro de aprovação é o mesmo `applyApproval`; pacotes e
  hashes iguais aos de hoje.
- **Rollback:** código anterior (a tela volta a gravar pelo navegador).
- **Testes:** prévia com motivos por item; desmarcar uma; lote misto sem 409;
  idempotência (reaplicar = `unchanged`); prévia vencida recusada; isolamento; teste
  estrutural de que a tela não grava `status: "aprovado"` direto.
- **Riscos:** permissão diferente entre RLS e servidor → a rota exige
  `minerador:approve` e `arquiteto:create`; sem uma delas, a prévia diz qual falta.
- **Depende da conversão:** não para a lógica; para o arquivo, sim: o encadeamento
  comum sai de `lib/server/minerador-subject-conversion.ts` depois que a conversão
  for commitada (antes disso, a F2 não edita esse arquivo).

### Item 3 — "Processar artigos" num clique e num diálogo de custo

- **Classificação:** local (Arquiteto, tela; sem contrato novo). Dono: Arquiteto.
- **Contrato atual:** C8, C9.
- **Proposta:**
  1. Depois de pagar a SERP do lote, o mesmo clique relê o índice "mesmo assunto"
     (função que devolve promessa, no lugar do contador `setSerpSubjectReload`) e
     segue para o parecer pelo cache (custo 0). Falha na releitura para com a
     mensagem de hoje.
  2. Allintitle só para os artigos com "Aplicar KGR: Sim" (`articleKgr.applyKgr`);
     com "não aplicável" (o padrão, ADR-020 adendo), nada é medido nem perguntado.
  3. Um diálogo só: o plano soma SERP do lote + validação + allintitle (KGR Sim)
     por `mergeSerpPaidPlans`, um `askSerpPaidPlan`; lacuna do provider aparece no
     resultado, sem segundo diálogo (recoletar falhas continua sendo ato separado).
- **Consumidores:** "Processar artigos", formação automática do Assunto
  (`automatic`), MCP (não chama esta tela).
- **Compatibilidade:** mesmas rotas pagas (`/api/arquiteto/keyword-serp`,
  `/api/arquiteto/article-allintitle`), mesmo cache, mesma autorização por bloco.
- **Rollback:** código anterior.
- **Testes:** clique com coleta paga chega ao parecer sem segundo clique; KGR "não
  aplicável" = zero chamada de allintitle; um diálogo com o total; cancelar = US$ 0
  e análise pelo cache, como hoje.
- **Riscos:** o arquivo está em edição pela frente da conversão → fazer depois do
  commit dela ou em coordenação.
- **Depende da conversão:** não (só coordenação de arquivo).

### Item 4 — Uma porta só para formar artigos de grupo com plano, recortada pela cor

- **Classificação:** estrutural (workflow: portas concorrentes viram uma; leitura
  recortada). Dono: Arquiteto.
- **Contrato atual:** C10, C11.
- **Proposta (decisão D4):** para artigo de grupo com plano declarado, a porta é
  **"Formar os artigos do plano · <cor>"**, que usa o núcleo da melhoria
  (`handleArticleImprovement`: prepare → validar → gravar) — o caminho que já
  obedece ao plano, à trava, à D2(a) e à guarda de retrabalho. O pedido ganha
  `group` opcional (cor, uuid ou `sem-grupo`); o preparo lê alvos e pool por
  `loadCanonicalArquitetoWorkspace(context, { keywordDetail: "full", groupFilter })`
  (fechado por artigo), e mantém em leitura estreita da marca inteira só o que é
  proteção (publicados e canibalização). A leitura da IA passa a ler só a lista do
  grupo (menos custo). As outras portas, diante de um artigo/Assunto de grupo com
  plano, mostram "Este artigo é do plano <cor>: use 'Formar os artigos do plano'" e
  não rodam; Sobras some para grupo com plano (D6 da SDD 2026-10-12). Fora de grupo
  com plano, tudo como hoje. MCP `improve_articles` ganha `group` opcional.
- **Consumidores:** painel da melhoria, "Processar artigos", painel do Assunto,
  Sobras, MCP `improve_articles`, catálogo.
- **Compatibilidade:** sem `group`, o preparo é o de hoje (mesma impressão digital
  da guarda); com `group`, a impressão digital inclui o recorte.
- **Rollback:** código anterior.
- **Testes:** preparo com `group` lê só o grupo (contagem de leituras); publicados de
  fora continuam protegidos; porta única para plano, portas antigas para sem plano;
  impressão digital distinta por recorte.
- **Riscos:** keyword boa fora do grupo deixa de ser sugerida → é a regra do plano
  (§6.2 item 2(c) da SDD 2026-10-12: nada de fora do grupo sem decisão humana).
- **Depende da conversão:** sim (arquivos em edição; laranja só tem plano depois dela).

### Item 5 — Depois dos links, Pronto para Radar e envio numa decisão

- **Classificação:** estrutural (workflow: dois atos humanos viram um). Dono: Arquiteto.
- **Contrato atual:** C12, C25.
- **Proposta:** com o grafo do Silo aprovado ("Confirmar links internos" com
  sucesso), o mesmo painel oferece **"Marcar Pronto para Radar e enviar os N artigos
  deste Silo"**. Prévia: cada artigo com Assunto, principal e slug, e o bloqueio de
  cada um (o mesmo portão de hoje). Confirmar → `markSelectedReadyForRadar` (releitura)
  → `sendSelectedToRadar` (releitura) → resultado por artigo (recusa nomeada por
  Assunto + slug, item 12). Os dois botões de hoje continuam para quem quer separar.
- **Consumidores:** rotas `/api/arquiteto/workflow-status` e `/api/editorial/workflow`
  (`import_radar`) inalteradas.
- **Rollback:** código anterior.
- **Testes:** sequência com releitura; recusa de um artigo não para os outros (já é
  assim no `import_radar`); nada é enviado se marcar Pronto falhar.
- **Depende da conversão:** não.

### Item 6 — Telas leem só a cor escolhida

- **Classificação:** compartilhado (aditivo; já aprovado na SDD 2026-10-12 §8, que
  deixou "a leitura parcial pela tela" para depois da medição). Dono: compartilhado/editorial.
- **Contrato atual:** C13.
- **Proposta:** com uma cor escolhida, `reloadOperational` e
  `loadCanonicalArquitetoWorkspace` (cliente) passam `groupId`; "Todos os grupos" é a
  leitura de hoje. Cache e recuperação local com chave
  `${actor}:${brand}:${groupId|"todos"}`; a leitura de um grupo só substitui o
  recorte desse grupo (`AGENTS.md` §10: vazio não substitui válido). Implementar
  `detail=light` (ArticleDNA/SiloDNA: só a vigente e a última aprovada, com eventos;
  histórico por `GET …/workspace/versions` sob demanda). **Operações que precisam da
  marca inteira** (Processar arquitetura, canibalização, Reforçar publicados, links
  entre Silos, importação ao Radar) rodam no servidor sobre a marca inteira, ou a
  tela pede a leitura completa antes de habilitá-las e diz isso.
- **Rollback:** código anterior (parâmetros opcionais).
- **Testes:** "ler grupo não remove artigos de outro grupo"; sem parâmetro = corpo
  idêntico; `detail=light` só com vigente e última aprovada; medição de bytes por
  seção (AdalbaPro) antes/depois, com meta < 1 MB por cor (sem número prometido
  antes de medir).
- **Riscos:** operação de marca inteira rodando sobre recorte → lista explícita
  acima, com teste por operação.
- **Depende da conversão:** não.

### Item 7 — Pesquisa por Assunto em lote para as linhas do cadastro

- **Classificação:** estrutural (persistência nova, via M-A; workflow em lote). Dono: Minerador.
- **Contrato atual:** C14, C15, C16.
- **Proposta:** no card "Cadastrar Assuntos" (e no resultado do cadastro), **"Pesquisar
  sustentações das N linhas"**: um plano somado (cota do Google Ads; custo em
  dinheiro zero, como hoje) → uma confirmação → o servidor executa uma pesquisa por
  linha com `subjectKeywordId` = a keyword da linha (a semente é o texto da keyword,
  C15; o título só vira semente quando a pessoa escolhe e tem até 200 caracteres) e
  grava o recibo de cada uma (M-A) com o mesmo `batch_id`. Depois, uma tela de
  importação por linha, com "marcar as que têm volume" por linha e no lote; confirmar
  importa cada linha pelo núcleo de hoje (`importSubjectDiscoveryWithCore`), ligada ao
  Assunto da linha. Resultado por linha; nada some se uma linha falhar.
- **Consumidores:** `runSubjectDiscoverySearch` (mesmo núcleo, uma vez por linha),
  `importSubjectDiscoveryWithCore`, MCP `search_subject_keywords`/`import_subject_keywords`
  (ganham `batchId` opcional), catálogo.
- **Rollback:** código anterior; recibos ficam sem leitor.
- **Testes:** plano somado; execução por linha com recibo; falha de uma linha não
  para as outras; importação seletiva (nada pré-importado); isolamento.
- **Depende da conversão:** não (usa o card, mas em arquivo próprio; coordenar).

### Item 8 — A sustentação importada já chega com o Volume da pesquisa

- **Classificação:** estrutural (persistência nova: recibo da pesquisa; regra de
  volume com proveniência). Dono: Minerador. Toca ADR-020 (adendo, §6.4).
- **Contrato atual:** C16, C17, C18.
- **Proposta:** a execução da pesquisa grava, no servidor, o recibo (M-A) com a média
  do Google Ads de cada candidata. O import lê o recibo pelo `searchId`
  (= `operationRequestId`) e, para cada keyword **nova**, ou existente **sem**
  medição válida e **não publicada**, grava `volume_search`, `volume_source =
  "google_ads"` e `volume_measurement` no formato de `buildGoogleAdsVolumeMetricPatch`
  (C18) com proveniência: `origin: "subject_search"`, `measurementKind:
  "keyword_ideas"`, `receiptRef: { operationRequestId }`, `measuredAt = executed_at`.
  Pelo predicado de C18 isso já é **Volume validado**, sem mudança no leitor.
  Média ausente = nada é gravado (ADR-020 item 6). Medição válida existente nunca é
  sobrescrita. **Keyword que carrega Assunto ou marca de principal do plano não
  recebe volume pelo import** (senão a trava automática viraria "travada" sem ato
  do dono — D1-ter); a prévia diz "meça pelo botão Volume".
- **Consumidores:** aprovação (passa a ter Volume), trava D1-ter (só via medição
  explícita), Arquiteto (sustentações com volume entram no parecer pelas
  sustentações, D2(a)).
- **Compatibilidade:** `provenanceVerified` passa a `true` só quando o recibo confere
  (keyword e marca); sem recibo (busca antiga ou MCP sem recibo), o import é o de hoje.
- **Rollback:** código anterior; depois, rollback da M-A. As medições já gravadas
  continuam válidas (formato de sempre); `receiptRef` fica sem destino (dito no
  painel como "recibo indisponível").
- **Testes:** volume gravado só com recibo; média nula não grava; existente com
  medição não muda; publicada não muda; keyword do plano não muda; recibo de outra
  marca recusado; Volume validado pelo predicado de C18.
- **Riscos:** a média de "ideias" do Google Ads pode diferir da medição histórica
  exata → marcada em `measurementKind`; o botão Volume continua remedindo quando o
  dono quiser.
- **Depende da conversão:** não.

### Item 9 — O card resolve o que a prévia já sabe

- **Classificação:** "Ver na planilha" e textos: local. Sobras para a lixeira: local
  (usa o núcleo de exclusão de sempre). "Reaprovar as N": estrutural (workflow, igual
  ao item 2). Dono: Minerador.
- **Contrato atual:** C19, C20.
- **Proposta:** na prévia do cadastro, (a) **"Excluir as k sobras"** — só para sobra
  não publicada e nunca enviada ao Arquiteto; abre a mesma confirmação de exclusão do
  Minerador (impacto + nome digitado, `minerador-workspace.tsx:5121-5124`), com o
  texto certo: **exclusão definitiva**; (b) **"Reaprovar as N que voltam a Em
  revisão"** (só pede a Lógica, D2-bis) e, opcional, **"e enviar ao Arquiteto"** —
  executa a rota do item 2 só para elas, depois do cadastro e da releitura; (c)
  **"Ver na planilha (cor X)"** — link `/{brandRef}/minerador?grupo=<cor>`.
- **Rollback:** código anterior.
- **Testes:** sobra recebida pelo Arquiteto não é oferecida; reaprovação só das N;
  falha na reaprovação não desfaz o cadastro (diz o que ficou).
- **Depende da conversão:** sim (mesmos arquivos: `declared-plan-import-core.ts`,
  `subject-cadastro-card.tsx`).

### Item 10 — "Aplicar o plano ao Silo" já com a retirada, e os links em sequência

- **Classificação:** estrutural (workflow: retirar + aplicar numa decisão). Dono: Arquiteto.
- **Contrato atual:** C21, C26.
- **Proposta:** a prévia de "Aplicar o plano declarado ao Silo" lista os artigos fora
  do plano com **"retirar do Silo"** marcado (ArticleDNA preservado; keywords voltam
  a "não agrupadas" do grupo). Confirmar → retirada pelo núcleo de hoje (evento
  `rejected`, par v+1, releitura) → aplicação do plano (par v+1, releitura). Um
  `decisionHash` cobre os dois; a guarda de retrabalho registra os dois. Ao fim, o
  painel oferece **"Processar links de novo"** (troca para Links internos e roda
  `processarLinks` neste Silo; custo das âncoras, se houver, dito antes, como hoje).
  O aviso "o artigo N do plano ainda não tem ArticleDNA" (`:183`) leva à porta do
  item 4.
- **Rollback:** código anterior; versões gravadas ficam (imutáveis).
- **Testes:** prévia com retirada; desmarcar = recusa de hoje; falha na retirada não
  aplica o plano; MCP `apply_declared_plan_to_silo` com o mesmo comportamento.
- **Depende da conversão:** sim para o laranja (decisão D5 da conversão: "plano vivo
  controle"); a lógica em si não.

### Item 11 — Lote "Pesquisar e finalizar" no Radar (outra frente)

- **Só registro.** Em implementação por outro agente (árvore de trabalho:
  `lib/radar/research-batch.ts`, `modules/radar/radar-r4-bulk-operations-bar.tsx`,
  `modules/radar/radar-page.tsx`, não commitados): lote "Pesquisar e finalizar" e
  saída das operações antigas da barra. Esta SDD não define nem altera esse
  trabalho; o item 14 reaproveita o lote quando a adoção pedir coleta.

### Item 12 — Mensagens que dizem o caminho inteiro

- **Classificação:** local, por módulo. Dono: cada módulo dono da mensagem.
- **Contrato atual:** C19, C20, C22.
- **Proposta:**
  - `declared-plan-formation.ts:97`: "A principal está travada no plano. Para trocar:
    Minerador → Cadastrar Assuntos → trava 'Livre' → Aprovar e enviar → aqui,
    'Atualização disponível' → Formar os artigos do plano."
  - `arquiteto-workspace.tsx:4979`: nomear o artigo por Assunto + slug (como o
    Radar já faz), não pela `promise`.
  - `minerador-workspace.tsx:2718-2720`: todos os motivos, agrupados (até o item 2
    tirar esse caminho).
  - Nota de sobras (C19) e card `:524`: "exclusão definitiva" e o próximo clique certo.
- **Testes:** os testes estruturais que citam essas frases mudam de propósito, com
  comentários removidos antes do `doesNotMatch` (memória "teste estrutural casa com
  o próprio comentário").
- **Depende da conversão:** a nota de sobras sim (arquivo em edição); o resto não.

### Item 13 — Catálogo e documentos conduzem pelo caminho certo

- **Classificação:** compartilhado (catálogo aditivo/correção; `npm run test:agent`).
  Dono: compartilhado (MCP/catálogo).
- **Contrato atual:** C20, C23, C24.
- **Proposta:**
  - Playbook `artigo_sobre_tema` (`:1236`, `:1238`): aprovação também pelo MCP
    (`decide_keywords` com aceite), envio por cor (item 2), formação pela porta única
    (item 4); "Formar artigos automaticamente" sai do playbook.
  - `minerador.review_and_approve` (`:384`): "Concluir revisão" é opcional; a
    aprovação exige a Lógica e o requisito de cada caso.
  - `:445` e `:88`: uma porta por situação (com plano / sem plano).
  - "Atualização disponível": o rótulo de `editorial-identity.ts:56` é de
    **publicação** e fica como está (identidade de publicação é entregável
    protegido). O aviso de versão nova do Arquiteto no Radar ganha texto próprio,
    **"Atualização disponível do Arquiteto"** (item 14). Corrigir os trechos que
    afirmam o contrário: SDD 2026-10-12 §4 (princípio 5) e §6.3; SDD da conversão §8;
    e o passo 3 do §11 da SDD 2026-10-12 ("recuperáveis" → definitiva para não
    publicada). As correções em SDD aprovada vão como nota datada no fim do
    documento, sem reescrever o histórico.
- **Testes:** `npm run test:agent`.
- **Depende da conversão:** as notas sobre o laranja sim; o resto não.

### Item 14 — O Radar adota a versão nova do ArticleDNA (com decisão humana)

- **Classificação:** estrutural (workflow do Radar: atualização do item existente).
  Dono: Radar. **O Arquiteto não muda** (regra do dono, 2026-10-09: "o Radar se
  adapta ao Arquiteto e nunca exige reenvio manual nem mexe nele").
- **Contrato atual:** C24, C25; `docs/05-radar/backlog.md:158`.
- **Proposta:**
  1. **Detecção (leitura pura no Radar):** para cada item, a versão transportada
     (`radarCurrentArticleDnaVersion` com `transportedVersionId`) contra a última
     aprovada do mesmo artigo (a mesma regra sem `transportedVersionId`). Havendo
     mais nova, o item mostra **"Atualização disponível do Arquiteto · vN → vM"**
     (eixo de transferência, `AGENTS.md` §12). Nada é gravado por ler; o Radar não
     escreve no item do Arquiteto (`stage = architect`).
  2. **Classificação do que muda** (função pura nova `classifyArchitectUpdate(vN, vM)`):
     - `same_research_basis` — principal, conjunto e papéis das keywords e slug
       iguais (mudou promessa, papel no Silo, Assunto, plano): a SERP e as
       evidências continuam válidas;
     - `composition_changed` — entraram/saíram keywords, principal igual: vale o que
       foi coletado das que ficaram; as novas pedem coleta (cache primeiro, custo
       antes);
     - `principal_changed` — principal/slug mudou: a pesquisa do Google da
       principal precisa ser refeita (custo antes); Vídeos e Especialista ficam
       (como no `RESET`, invariante 31).
  3. **Adotar (decisão humana, prévia):** o painel diz o que continua válido, o que
     precisa coletar (custo), se o artigo-modelo precisa ser reorganizado (até 2
     chamadas de IA, dito no botão) e se já há documento no Redator. Confirmar →
     núcleo novo `adoptArchitectVersionWithCore` (Radar):
     - item **não finalizado**: troca do item para vM (`source_version_id`,
       `source_content_hash`, `payload.articleDnaVersionId`/`articleDnaContentHash`/
       `hydration`), com `lock_version`, releitura e evento
       `adopt_architect_version` em `editorial_decision_events` (texto livre);
     - item **finalizado**: a troca só acontece quando o novo congelamento estiver
       pronto — `same_research_basis` refaz a fotografia sem provider (como o
       REFREEZE do reparo, invariante 30) e reorganiza o artigo-modelo se a prévia
       pedir; os outros casos coletam o que falta (pode usar o lote do item 11) e
       finalizam. Até a troca, o item segue em vN e os entregáveis também. O
       congelamento de vN fica no histórico (`radar_analysis_runs`), nada é apagado.
     - Contexto do Silo e links: resolvidos no servidor pelo índice canônico
       (`buildCanonicalIndex`); aresta só existente para vN vira lacuna declarada,
       nunca bloqueio.
  4. **Redator:** documento já criado continua em vN; o reenvio ao Redator usa o
     caminho de hoje (que já mostra "Atualização disponível" no Redator,
     `lib/radar/refreeze-repair.ts:124`). Nada muda no Redator.
  5. **MCP:** `get_platform_state` mostra a atualização disponível; ferramenta
     `adopt_architect_version` (prévia com `platform.read`; aplicar com
     `radar.write` + `platform.decide`, aceite no chat e hash vigente) chamando o
     mesmo núcleo. Catálogo atualizado.
- **Compatibilidade:** sem campo novo no `RadarItem` (`.strict()`): a adoção fica no
  evento e no histórico de análises. Código anterior lê o item pela versão
  transportada (que passa a ser vM) — já suportado.
- **Rollback:** código anterior; itens adotados ficam em vM (estado válido).
- **Testes:** detecção sem escrita; três classes; adoção não finalizada; finalizada
  só troca depois do novo congelamento; nada pago sem autorização; Redator intocado;
  Arquiteto intocado (teste estrutural: o núcleo não escreve `stage = architect`);
  **entregáveis byte a byte para item não adotado** (§2.3).
- **Riscos:** adoção trocar a investigação sem querer → só por clique com prévia;
  hoje há 0 itens atrás (SELECT de 2026-10-13).
- **Depende da conversão:** não.

### Item 15 — "Tirar do plano" e mudar a trava numa confirmação

- **Classificação:** estrutural (workflow entre Minerador e Arquiteto). Dono:
  Minerador (o plano), com a parte do Arquiteto executada pelo núcleo do Arquiteto.
- **Contrato atual:** C26; trava em `keyword_subject.plan.lock` (SDD do cadastro §3.3).
- **Proposta:** no card (linha do artigo), **"Tirar do plano"** e **"Mudar a trava"**
  abrem uma prévia que lista os efeitos nos dois módulos: plano vN+1, keywords que
  voltam a "Em revisão" e são reaprovadas (só a Lógica), reenvio, e — marcado por
  padrão quando o artigo está num Silo — "retirar o artigo do Silo" (Arquiteto) ou,
  na trava, "o artigo volta à principal travada" (nova versão do ArticleDNA pela
  melhoria). Confirmar executa cada passo pelo núcleo do dono
  (`withdrawFromDeclaredPlanWithCore` → rota do item 2 → retirada do Arquiteto),
  com releitura e estado derivado por passo (retomável, como a conversão §10). Sem
  permissão do Arquiteto, os passos do Minerador rodam e a prévia diz o que fica
  para o Arquiteto.
- **Rollback:** código anterior; versões e eventos ficam.
- **Testes:** sequência completa; parada no meio retoma; Pilar não sai
  (`PILLAR_CANNOT_LEAVE`); sem permissão do Arquiteto.
- **Depende da conversão:** sim.

## 5. Consumidores consolidados

| Consumidor | Itens | Proteção |
|---|---|---|
| Aprovação (`approved-package.ts`) | 2, 8, 9, 15 | mesma função; teste de pacote igual |
| Envio ao Arquiteto (`arquiteto-workspace.ts` servidor) | 1, 2 | modo parcial aditivo; rota antiga igual |
| Território/Silo | 1, 10 | só campos existentes; publicado protegido |
| Formação/melhoria | 3, 4 | sem `group` = igual; guarda de retrabalho |
| Mesa editorial e do Arquiteto | 6 | sem parâmetro = corpo idêntico |
| Pesquisa e import por Assunto | 7, 8 | recibo opcional; sem recibo = igual |
| Radar (item e congelamento) | 14 | sem campo novo; invariantes 23, 30, 31 |
| Redator, Publicações | — | nenhum; retrato byte a byte |
| MCP/catálogo | 2, 4, 7, 13, 14 | `npm run test:agent` |

## 6. Migration M-A (única) — recibo da Pesquisa por Assunto

Necessária para os itens 7 e 8: o volume só pode virar Volume validado se o
servidor guardou o que o Google Ads devolveu (o navegador não é fonte, Q11). Nenhuma
outra fase pede migration.

### 6.1 `supabase/migrations/20261014120000_recibos_da_pesquisa_por_assunto.sql` (proposta)

```sql
-- =============================================================================
-- RECIBOS DA PESQUISA POR ASSUNTO — M-A
-- SDD: docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md, §6
-- (aprovada pelo dono em 2026-10-13; itens 7 e 8, dono do módulo: Minerador).
--
-- APLICAÇÃO (somente pelo dono, nesta ordem):
--   1. Ensaio: copie o arquivo, troque o `COMMIT;` do fim por
--      DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$; e rode a cópia com
--      `npx supabase db query --linked -f <copia>`. O erro 'ENSAIO' prova que
--      guardas, criação e pós-checagem passaram; tudo é desfeito.
--   2. npx supabase db query --linked -f supabase/migrations/20261014120000_recibos_da_pesquisa_por_assunto.sql
--   3. npx supabase migration repair --status applied 20261014120000 --linked
-- Nunca `supabase db push`.
-- Rollback: supabase/rollback/20261014120000_recibos_da_pesquisa_por_assunto.rollback.sql
--
-- O QUE FAZ: cria a tabela append-only com o que o Google Ads devolveu em cada
-- execução da Pesquisa por Assunto (média mensal e métricas por candidata).
-- Escrita só pelo servidor (service_role); `authenticated` lê pela RLS da marca.
-- O QUE NÃO FAZ: não muda minerador_keywords, nem RLS de outra tabela, nem dado
-- existente. `subject_keyword_id` não tem FK de propósito: a exclusão definitiva de
-- keyword não publicada não pode ser bloqueada por um recibo.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.can_access_brand(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RECIBOS_PRE: public.can_access_brand(uuid) ausente.';
  END IF;
  IF to_regclass('public.minerador_subject_search_receipts') IS NOT NULL THEN
    RAISE EXCEPTION 'RECIBOS_PRE: minerador_subject_search_receipts já existe (migration aplicada?).';
  END IF;
END $$;

CREATE TABLE public.minerador_subject_search_receipts (
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL,
  batch_id uuid NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subject_keyword_id uuid NULL,
  phrase text NOT NULL CHECK (char_length(btrim(phrase)) BETWEEN 1 AND 200),
  provider text NOT NULL CHECK (provider = 'google_ads'),
  provider_version text NOT NULL CHECK (char_length(btrim(provider_version)) BETWEEN 1 AND 20),
  targeting jsonb NOT NULL CHECK (jsonb_typeof(targeting) = 'object'),
  google_ads_request_ids text[] NOT NULL DEFAULT '{}'::text[],
  executed_at timestamptz NOT NULL,
  -- { "<keyword normalizada>": { keyword, averageMonthlySearches, competition,
  --   competitionIndex, averageCpcMicros, lowTopOfPageBidMicros,
  --   highTopOfPageBidMicros, currencyCode } }
  candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'object'),
  candidate_count integer NOT NULL CHECK (candidate_count BETWEEN 0 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marca_id, operation_request_id)
);

CREATE INDEX ix_minerador_subject_search_receipts_executed
  ON public.minerador_subject_search_receipts (marca_id, executed_at DESC);
CREATE INDEX ix_minerador_subject_search_receipts_batch
  ON public.minerador_subject_search_receipts (marca_id, batch_id)
  WHERE batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.minerador_subject_search_receipts_append_only()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'minerador_subject_search_receipts_is_append_only';
END;
$$;
REVOKE ALL ON FUNCTION public.minerador_subject_search_receipts_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER minerador_subject_search_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.minerador_subject_search_receipts
  FOR EACH ROW EXECUTE FUNCTION public.minerador_subject_search_receipts_append_only();

ALTER TABLE public.minerador_subject_search_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.minerador_subject_search_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.minerador_subject_search_receipts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.minerador_subject_search_receipts TO service_role;

CREATE POLICY minerador_subject_search_receipts_select ON public.minerador_subject_search_receipts
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));

COMMENT ON TABLE public.minerador_subject_search_receipts IS
  'Recibo append-only da Pesquisa por Assunto (Google Ads). Fonte do Volume validado das sustentações importadas (SDD 2026-10-13 acelerar-fluxo §6).';

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.minerador_subject_search_receipts'::regclass) THEN
    RAISE EXCEPTION 'RECIBOS_POS: RLS desligada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'minerador_subject_search_receipts'
                 AND policyname = 'minerador_subject_search_receipts_select') THEN
    RAISE EXCEPTION 'RECIBOS_POS: policy de leitura ausente.';
  END IF;
  IF has_table_privilege('anon', 'public.minerador_subject_search_receipts', 'SELECT') THEN
    RAISE EXCEPTION 'RECIBOS_POS: anon lê a tabela.';
  END IF;
END $$;

COMMIT;
```

### 6.2 `supabase/rollback/20261014120000_recibos_da_pesquisa_por_assunto.rollback.sql` (proposta)

```sql
-- Rollback da M-A. O CÓDIGO volta antes (sem leitor/escritor da tabela).
-- As medições já gravadas em minerador_keywords continuam válidas; o
-- `receiptRef` delas fica sem destino (a tela diz "recibo indisponível").
BEGIN;
DROP TRIGGER IF EXISTS minerador_subject_search_receipts_append_only ON public.minerador_subject_search_receipts;
DROP TABLE IF EXISTS public.minerador_subject_search_receipts;
DROP FUNCTION IF EXISTS public.minerador_subject_search_receipts_append_only();
COMMIT;
```

### 6.3 Ordem e retenção

- Ordem: M-A aplicada e conferida por SELECT **antes** do deploy da Fase 3; o código
  da Fase 3 responde sem recibo (tabela ausente → `42P01`) como hoje, sem gravar
  volume.
- Retenção: sem expurgo por idade nesta SDD (linhas pequenas; até 600 candidatas por
  execução). Expurgo, se um dia preciso, é decisão nova.

### 6.4 Adendo ao ADR-020 (texto proposto)

"Adendo 2026-10-13 — Volume da Pesquisa por Assunto. A média mensal do Google Ads
devolvida pela Pesquisa por Assunto e guardada no recibo do servidor vale como Volume
validado da keyword importada, com proveniência (`origin: subject_search`,
`measurementKind: keyword_ideas`, recibo). Não sobrescreve medição válida, não vale
para keyword publicada nem para a que carrega Assunto ou marca de principal do plano
(a trava D1-ter só muda por medição explícita). Ausência continua ausência (item 6)."

## 7. Riscos gerais

| # | Risco | Mitigação |
|---|---|---|
| R1 | Mexer nos entregáveis sem querer | §2: retrato byte a byte, portão de arquivos, conferência do dono |
| R2 | Juntar decisões humanas (itens 2, 5, 9, 10, 15) e alguém confirmar sem ler | prévia lista cada efeito; `decisionHash`; recusa por item; desfazer pelos caminhos de hoje |
| R3 | Leitura por cor alimentar operação que precisa da marca inteira | lista explícita no item 6, teste por operação |
| R4 | Conflito com a frente da conversão e a do Radar (mesmos arquivos) | Fase 4 depois da conversão; item 3 coordenado; item 11 não tocado |
| R5 | Confirmação automática do Silo (item 1) contra a vontade do dono | só com plano declarado; desfazer de sempre; sem permissão vira candidato |
| R6 | Volume de "ideias" ≠ medição histórica (item 8) | proveniência marcada; botão Volume remede |
| R7 | Adoção no Radar trocar investigação válida (item 14) | classificação pura; nada pago sem autorização; troca só depois do novo congelamento |
| R8 | Mensagens trocadas quebrarem testes estruturais | ajustes declarados, sem comentário no alvo |
| R9 | Texto de SDD aprovada corrigido apagar histórico | correção como nota datada no fim, sem reescrever |

## 8. Testes (fixtures; sem chamada paga, sem banco remoto)

- Novo `tests/entregaveis-intocados-2026-10-13.test.mts` (E0, §2.3) — roda em todas
  as fases.
- Por item, os testes listados em §4, em arquivos novos por fase
  (`tests/acelerar-f1-*.test.mts` … `tests/acelerar-f5-*.test.mts`), mais ajustes
  declarados nos testes estruturais que citam frases.
- Suítes a cada fase: Minerador por glob, `test:arquiteto`, `test:arquiteto:servidor`,
  `test:arquiteto:lentes`, `test:radar`, `test:redator`, `test:redator:mcp`,
  `test:agent`, `test:editorial`, `tsc`, eslint dos tocados,
  `scripts/check-visual-system.mjs` nas telas, `git diff --check`, build nas fases
  com rota nova (2, 3, 4, 5). Contagem antes/depois por nome (falhas antigas iguais).
- Mutantes só com suíte verde e com o dev server parado (memórias do projeto).
- **Validação manual (do dono):** cada fase com a tela real, dark mode e
  360/768/1024/1440 px; readback no banco por SELECT. TypeScript e testes não provam a
  interface (`AGENTS.md` §16).

## 9. Fases (maior ganho com menor risco primeiro)

| Fase | Itens | Ganho | Risco | Migration | Depende da conversão |
|---|---|---|---|---|---|
| E0 | retrato dos entregáveis | prova da restrição | nenhum | não | não |
| **F1 · Atalhos e textos certos** | 3, 12 (sem a nota de sobras), 13 (sem as notas do laranja) | "Processar artigos" num clique e num diálogo; fim do allintitle pago inútil; IA e telas mandam pelo caminho certo | baixo (tela e texto) | não | não |
| **F2 · Uma decisão por etapa** | 2, 5, 6 | uma cor aprovada e enviada de uma vez, com motivo por item; Pronto+envio num ato; telas leves por cor | médio (workflow; leitura parcial) | não | só o commit da conversão (o item 2 reaproveita o encadeamento dela) |
| **F3 · Pesquisa em lote com volume** | 8, depois 7 | todas as linhas pesquisadas de uma vez; sustentações já com Volume, sem medir de novo | médio (persistência nova) | **sim, M-A** (antes do deploy) | não |
| **F4 · O plano de ponta a ponta** | 1, 9, 4, 10, 15 (+ resto de 12 e 13) | Silo do plano já confirmado; uma porta para formar; card resolve sobras e reaprovação; plano no Silo com retirada; tirar do plano numa confirmação | médio-alto (workflow entre módulos) | não | **sim** |
| **F5 · O Radar acompanha o Arquiteto** | 14 | versão nova chega ao Radar com um clique, aproveitando a investigação válida | médio (item e congelamento) | não | não |
| — | 11 | lote do Radar | outra frente | — | — |

Cada fase é um deploy. Documentação ao concluir cada fase: `estado-atual.md` e
`backlog.md` do módulo dono de cada item, catálogo do MCP (`AGENTS.md` §17.1) e o
andamento desta SDD (§11).

## 10. Decisões (recomendação — autorizadas pelo dono em 2026-10-13, frase do topo)

| # | Decisão | Recomendação adotada |
|---|---|---|
| D1 | Item 1: confirmar o Silo do plano sem clique no Arquiteto | sim, no envio ao Arquiteto, com proveniência do cadastro; sem permissão, candidato |
| D2 | Item 2: aprovar e enviar numa decisão; aprovação da tela pelo servidor | sim, rota nova com prévia/recusa por item; rota antiga mantida |
| D3 | Item 3: allintitle só com "Aplicar KGR: Sim" | sim (ADR-020 adendo item 5) |
| D4 | Item 4: qual é a porta única para grupo com plano | o núcleo da melhoria ("Formar os artigos do plano · cor"); as outras apontam para ela |
| D5 | Item 5: Pronto para Radar + envio num ato | sim, com os dois botões de hoje mantidos |
| D6 | Item 6: `detail=light` e cache por ator:marca:grupo | sim (SDD 2026-10-12 §8) |
| D7 | Item 7: semente da pesquisa em lote | a keyword da linha; título só por escolha e até 200 caracteres |
| D8 | Item 8: guardar recibo no servidor (M-A) e gravar Volume validado | sim; nunca na keyword do plano, publicada ou já medida |
| D9 | Item 9: lixeira das sobras | só não publicada e nunca enviada, com a confirmação de exclusão definitiva de sempre |
| D10 | Item 10: retirar e aplicar | duas versões em sequência (retirada v+1, plano v+2), uma decisão |
| D11 | Item 14: rótulo e adoção | "Atualização disponível do Arquiteto"; adoção por clique; troca só depois do novo congelamento; sem campo novo no `RadarItem` |
| D12 | Item 14: ferramenta MCP | sim, `adopt_architect_version` com prévia, aceite e hash |
| D13 | Item 15: escopo da confirmação | Minerador + Arquiteto numa prévia, passos pelo núcleo de cada dono |
| D14 | Correções em SDD aprovada (item 13) | nota datada no fim de cada SDD, sem reescrever |

## 11. Autorização e andamento

- [x] SDD aprovada e decisões D1–D14 pela recomendação — dono, 2026-10-13 (frase no topo).
- [x] Implementação autorizada nas fases E0, F1–F5, cada uma com o seu deploy.
- [x] M-A autorizada como texto; **aplicação pelo dono**, com ensaio, antes da F3.
- [x] Entregáveis intocados (§2), com prova byte a byte.
- [x] F4 só começa com a conversão (V1–V5) no código — a conversão estava no código quando a F4 começou (2026-10-13).

| Fase | Estado em 2026-10-13 |
|---|---|
| E0 | **feito (2026-10-13).** `tests/entregaveis-intocados-2026-10-13.test.mts` (105 hashes de CSV "Para escrever" completo/em partes/vídeo, artigo-modelo, voz humana, âncoras naturais, identidade de publicação, `get_article_for_writing`/`get_video_material`/`get_writer_brief`), em `test:radar`; verde em todas as fases com os MESMOS hashes (nunca atualizados). `git diff --stat HEAD` dos arquivos do §2.1 vazio. |
| F1 | **feito no código (2026-10-13), sem deploy.** Item 3: "Processar artigos" num clique (releitura do "mesmo assunto" e parecer pelo cache no mesmo clique) e num diálogo de custo (`lib/arquiteto/article-processing-click.ts`); allintitle só com "Aplicar KGR: Sim". Item 12: principal travada com o caminho inteiro (`declaredPrincipalLockedMessage`), recusa do envio ao Radar por Assunto + slug (`architectArticleNoticeLabel`), motivos do lote agrupados no Minerador (`lib/minerador/approval-blockers.ts`); a nota de sobras já tinha sido corrigida pela conversão. Item 13: playbook `artigo_sobre_tema` (aprovação pelo MCP, porta por situação, sem "Formar artigos automaticamente"), `review_and_approve` ("Concluir revisão" opcional), `form_architecture` e melhoria (uma porta por situação); notas datadas no fim da SDD 2026-10-12 e da SDD da conversão. Testes: `tests/arquiteto-acelerar-f1-processar-artigos.test.mts`, `tests/minerador-acelerar-f1-motivos-agrupados.test.mts`; ajustes declarados em 4 testes estruturais. Suítes: `test:arquiteto` 2892/2892, servidor 122, lentes 90, `test:redator` 361, `test:redator:mcp` 150, `test:editorial` 4 falhas antigas (mesmos nomes); Minerador por glob sem falha nova minha; falhas novas em `test:radar` (2), `test:agent` (1) e `tsc` (1) são das frentes Y/Z (arquivos delas). E0 verde, mesmos hashes. **Validado manualmente: não.** |
| F2 | **feito no código (2026-10-13), sem deploy.** Item 2: rota `POST /api/minerador/marcas/[brandId]/keywords/approve-and-send` (prévia/aplicar, `decisionHash`, recusa por item, releitura) sobre o encadeamento único `lib/server/minerador-approve-and-send.ts` (aprovar = núcleo do `decide_keywords`; enviar = `createMineradorArquitetoHandoff` com o modo parcial aditivo em `prepareCanonicalHandoff`); orquestração pura `lib/minerador/approve-and-send-core.ts`; diálogo `modules/minerador/approve-and-send-dialog.tsx`; botão "Aprovar e enviar" visível na barra de seleção e na topbar com uma cor ativa (sem seleção = a cor inteira); Status → aprovado passa pelo servidor (o navegador não grava mais a aprovação); a conversão do Assunto e a reaprovação do card (`plans/reapprove`, F3) usam o mesmo encadeamento. Item 5: no painel de Links internos, com o grafo aprovado e atual, "Marcar Pronto para Radar e enviar os N artigos deste Silo" — prévia por artigo (Assunto + principal + slug, motivo), marca com releitura e só então envia, estreitando aos prontos (recusa por artigo); os dois botões de sempre continuam. Item 6: `detail=light` em `/api/editorial/workspace` (vigente + última aprovada + referenciadas), `GET /api/editorial/workspace/versions` (histórico sob demanda), pipeline lê por cor **só na rota do Radar** (`groupId` da etiqueta, a cor pendente espera, leitura de um grupo nunca tira da memória os outros, cópia local do recorte com chave própria, fora do Radar relê inteiro). **Não feito no item 6:** a mesa do Arquiteto continua inteira (operações de marca inteira na tela — Processar arquitetura, canibalização, Reforçar publicados, links entre Silos); medição de bytes por cor fica com o dono. Testes novos: `minerador-acelerar-f2-aprovar-e-enviar` (8), `arquiteto-acelerar-f2-pronto-e-envio` (3), `editorial-acelerar-f2-leitura-por-cor` (6); ajustes declarados em 9 testes estruturais. Suítes: Minerador por glob com as 25 falhas antigas (mesmos nomes), `test:arquiteto` 2895/2895, servidor 122, lentes 90, `test:redator` 361, `test:redator:mcp` 150, `test:agent` 90/90, `test:editorial` 4 falhas antigas, `test:editorial:dom` 12/12, `tsc` 0; `test:radar` com o E0 verde (mesmos hashes). **Validado manualmente: não.** |
| F3 | **feito no código (2026-10-13), sem deploy; M-A ESCRITA e NÃO aplicada (dono aplica ANTES do deploy da F3).** Item 8: a execução da Pesquisa por Assunto grava o recibo no servidor (`recordReceipt` nas portas de `subject-discovery-runtime.ts` → `lib/server/subject-search-receipts.ts`, service_role, só INSERT; resposta com `receipt`/`batchId` aditivos); o import (`importSubjectDiscoveryWithCore`, portas `volume` e `runLogic` montadas por `subjectDiscoveryImportPorts` na rota e no MCP `import_subject_keywords`) grava a média como Volume validado (`buildGoogleAdsVolumeMetricPatch` + `origin: subject_search`, `measurementKind: keyword_ideas`, `receiptRef`, `measuredAt = executed_at`) só em keyword nova ou existente sem medição, não publicada e fora do plano, e roda a Lógica (`runKeywordLogicWithCore`); sem a tabela (`42P01`/`PGRST205`) degrada para o import de antes, com aviso. Domínio: `lib/minerador/subject-search-receipt.ts`. Adendo ao ADR-020 escrito. Item 7: "Buscar sustentação para os N artigos" no resultado do card (plano por linha somado, uma confirmação, a MESMA rota por linha com `subjectKeywordId` e o mesmo `batchId`, tabela por artigo com "Só com volume" marcado e nada pré-selecionado, uma confirmação de envio pelo MESMO import) — `modules/minerador/discovery/subject-search-{batch-model,client,batch-panel}.ts(x)`, `use-subject-search-batch.ts`. **Item 9 (adiantado da F4):** caixas "Excluir as k sobras (apaga de vez — decisão sua)" (só não publicada e nunca enviada ao Arquiteto, `lib/minerador/declared-plan-leftovers.ts`; abre a confirmação de exclusão de sempre, com nome digitado) e "Reaprovar as N que voltaram a Em revisão (só a Lógica é exigida)" (rota `…/plans/reapprove` sobre `runKeywordLogicWithCore` + `keywordDecisionEntries`/`applyKeywordDecisionEntries`; a troca pela rota do item 2 fica para quando a F2 existir), ambas nunca marcadas por padrão e executadas só depois do cadastro relido; "Ver na planilha (cor X)" filtra a cor e seleciona as linhas. Catálogo: notas em `declare_silo_plan`, `search_subject_keywords`, `import_subject_keywords`; operação `minerador.cadastro_follow_up`. Testes: `tests/minerador-acelerar-f3-recibo-e-lote.test.mts` (19); ajuste declarado em `tests/minerador-assunto-pesquisa-tela-local.test.mts`. Suítes: Minerador por glob 1305 (1277 + 28 falhas: as 25 antigas, mesmos nomes, e 3 novas de arquivos da frente X — `minerador-aprovacao-sem-gates` M, `minerador-volume-sem-media` "tela: o lote…", `minerador-acelerar-f1-motivos-agrupados` item 12 — por mudanças dela em `minerador-workspace.tsx`), `test:agent` 90/90, `test:arquiteto` 2892/2892, `test:radar` 3544 (3543 + 1 pulado, 0 falha), `tsc` sem erro. E0 verde, mesmos hashes; nenhum arquivo do §2.1 tocado. **Validado manualmente: não.** |
| F4 | **feito no código (2026-10-13), sem deploy** (a conversão V1–V5 já estava no código; o item 9 foi feito pela frente da F3). Item 1: o envio ao Arquiteto prepara o Silo do plano depois da releitura do recebimento (`materializeDeclaredPlanSilo`: o ligado ao grupo / mesmo slug / candidato novo com a proveniência do cadastro; confirmado com `arquiteto:approve`, senão candidato com o motivo; keywords do grupo sem Silo entram nele pelo writer da mesa, com releitura; grupo ligado com `silo_linked`; idempotente; nunca derruba o envio; desfecho em `declaredPlanSilos`). Item 4: melhoria com `group` (alvos e lista do grupo, proteção da marca inteira, recorte na impressão digital só quando há), botão "Formar os artigos do plano · cor", "Processar artigos"/formação automática recusam artigo do plano apontando para a porta, MCP `improve_articles` com `group`. Item 10: "Aplicar o plano ao Silo" com a retirada na prévia (marcada), um `decisionHash`, retirada pelo núcleo de sempre e só então o plano, "Processar links de novo"; MCP `apply_declared_plan_to_silo` com `withdrawNonPlan`. Item 15: "Tirar do plano" numa confirmação (plano → reaprovar e enviar pelo encadeamento único → retirar do Silo), retomável; **"Mudar a trava" sem cadeia própria** (o cadastro + reaprovar/enviar do card e a porta do item 4 cobrem). Itens 12/13 restantes: aviso do plano leva à porta única; catálogo atualizado (`send_to_arquiteto`, `article_improvement`, `form_architecture`, `apply_declared_plan_to_silo`, "Tirar do plano", playbook). Testes: `arquiteto-acelerar-f4-plano-de-ponta-a-ponta` (7), `arquiteto-acelerar-f4-cadeia-servidor` (5); ajustes declarados em `minerador-assunto-dominio` (lista fechada), `radar-grupos-gerenciar-historico-dom` e `agent-platform-mcp`. Suítes finais: Minerador por glob 1313 com as 25 falhas antigas (mesmos nomes), `test:arquiteto` 2902/2902, servidor 127/127, lentes 90/90, `test:radar` 3544 (1 pulado, 0 falha, E0 com os mesmos hashes), `test:redator` 361, `test:redator:mcp` 150, `test:agent` 90/90, `test:editorial` 4 falhas antigas (mesmos nomes), `tsc` 0. **Validado manualmente: não.** |
| F5 | **feito no código (2026-10-13), sem deploy, parte A.** Item 14: detecção só lendo (versão transportada × vigente aprovada no índice canônico), rótulo próprio "Atualização disponível do Arquiteto · vN → vM" (o de `editorial-identity.ts` não mudou), `classifyArchitectUpdate` (três classes), prévia por Silo e recorte da cor com uma confirmação e recusa por item, `decisionHash` da seleção, adoção `adoptArchitectVersionWithCore` (item montado pelo `importArticlesToRadar`, Silo resolvido no servidor, links do envio com lacuna declarada, versão nova da análise reaproveitando a investigação válida — mesma base reaponta a impressão, composição marca para refazer, principal pelo RESET —, trava otimista, releitura e evento `adopt_architect_version`; só a linha `stage = radar`). Rota `/api/editorial/radar-architect-update`; faixa sob "Planilha" no Radar; MCP `adopt_architect_version` (prévia `platform.read`; aplicar `radar.write` + `platform.decide` + aceite + hash); `get_platform_state` com `radar.items[].architectUpdate`; catálogo `radar.adopt_architect_version`. **Parte B pendente (F5.b):** item finalizado, aprovado ou enviado ao Redator é recusado com o motivo (D11: troca só depois do congelamento novo, que ainda não é feito no servidor). Testes: `tests/radar-f5-adocao-versao-arquiteto-2026-10-13.test.mts` (13), `tests/radar-f5-adocao-tela-2026-10-13.test.mts` (3), +1 em `tests/agent-platform-mcp.test.mts` (asserção da pendência trocada de propósito). Suítes: `test:radar` 3544 (3543 + 1 pulado; antes 3528), `test:redator` 361, `test:redator:mcp` 150, `test:agent` 90 (antes 89), `test:arquiteto` 2892; `tsc` sem erro nos arquivos da F5 (o erro restante é de `tests/minerador-acelerar-f3-*`, frente Y). E0 verde, mesmos hashes; nenhum arquivo do §2.1 tocado. **Validado manualmente: não.** **Extensão de 2026-10-14 (decisão do dono: "estender a 'Atualização disponível do Arquiteto' do Radar para avisar também quando o grafo de links muda… sem reenviar nada e sem refazer a pesquisa, porque links não mudam a SERP"), feita no código, sem deploy:** classe `links_changed` e rótulo "Atualização disponível do Arquiteto · links · grafo vA → vB" quando o InternalLinkGraph aprovado vigente do Silo é outro que o transportado e cobre a versão transportada (mesmos `findApprovedGraphForSilo` e `relevantEdgesForArticle` do envio); o que muda por destino na régua do Radar (`radarSiloMeshPriority`); adoção pelo MESMO núcleo (prévia, `decisionHash` sobre as duas seleções, trava, releitura, evento com `updateKind: "links"`) trocando só `arquitetoInternalLinks`, sem versão nova da análise e sem escrever `source_*`, em qualquer estado (finalizado, aprovado e enviado ao Redator inclusive); a adoção do ArticleDNA passa a levar o grafo vigente que cobre a vM (a "lacuna declarada" fica só quando nenhum grafo aprovado a cobre). Leitura sem regravar o congelado: `radarResearchIsStale` deixa o grafo fora da comparação e `radarObservedDivergesFromFrozen` só compara a contagem de links no mesmo grafo. MCP `adopt_architect_version` com `kinds`/`decisionHashByKind`; `get_platform_state` com `radar.items[].linksUpdate`; catálogo. Testes: `tests/radar-f5-links-novos-2026-10-14.test.mts` (8) e `tests/radar-f5-links-novos-tela-2026-10-14.test.mts` (1). Suítes: `test:radar` 3637 (3636 + 1 pulado, 0 falha), `test:redator` 361, `test:redator:mcp` 150, `test:agent` 90, `test:arquiteto` 2980, `tsc` 0 erro. Caso real (SELECT, simulado em memória): os 8 do Silo "Leads sem Tráfego Pago" estão no grafo v1; com a malha aprovada como v2, 8 de 8 adotáveis numa confirmação, só o campo de links muda. **Validado manualmente: não.** |
| Importar do Minerador (itens 1, 2 e 6, pedido do dono de 2026-10-13) | **feito no código (2026-10-13), sem deploy.** O modal do Arquiteto "não importava" porque escondia as keywords não aprovadas (WifiConecta: 58 aprovadas já no Arquiteto, 6 brutas invisíveis), recusava o lote inteiro (409) por uma keyword e mostrava o erro atrás do modal; e abrir relia a mesa inteira. Agora: rota `/api/arquiteto/import` (GET lista leve; POST prévia/aplicar) sobre `previewApproveAndSend`/`applyApproveAndSend` com `approveAndSendDeps` — o MESMO encadeamento do "Aprovar e enviar" (aprovar só com `minerador:approve`; envio parcial com recusa por item e o Silo do plano do item 1); modal `modules/arquiteto/minerador-import-dialog.tsx` com as cinco cores e contagens, "Importar a cor X (N)", quem fica fora com o motivo curto, abre pela cor ativa, progresso por etapa (`OperationProgress`) e resultado por keyword relido do servidor. Peso medido no banco (WifiConecta, `EXPLAIN ANALYZE SERIALIZE`): ~5,0 MB/~108 ms antes → ~51 kB/~34 ms; resposta ao navegador ~14 kB (64 linhas). Catálogo `arquiteto.import_from_minerador`. Testes: `tests/arquiteto-importar-do-minerador-2026-10-13.test.mts` (8); ajuste declarado em `minerador-arquiteto-handoff`. Suítes: `test:arquiteto` 2912/2912 (antes 2904), servidor 127/127, `test:agent` 90/90, `test:radar` 3544 (1 pulado, 0 falha, E0 com os mesmos hashes), Minerador por glob 1337 com as 25 falhas antigas (mesmos nomes), `tsc` 0. **Validado manualmente: não.** |

Esta SDD não autoriza: SQL de escrita fora da M-A, migration além da M-A, chamada
paga automática, exclusão de keyword recebida pelo Arquiteto, mudança de URL/slug/
canonical de publicado, troca de principal travada fora da prévia, mudança em
qualquer arquivo do §2.1, nem commit/push/deploy.
