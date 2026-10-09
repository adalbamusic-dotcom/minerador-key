# Estado atual — Radar

## Revisão do Papel no Silo (corretor): Silo resolvido, fora da composição e Silo sem Pilar — 2026-10-08

**Origem:** revisão adversarial da entrega "Papel no Silo" (seção logo abaixo). Foram 11 achados: 1 must-fix, 7
should-fix e 3 nits. Os 11 foram confirmados no código e com fixture; nenhum era falso. Três pares descreviam o mesmo
defeito (COB-3 = R2, F3 = R1, F4 = R3).

**Fonte canônica do papel (não mudou):** o SiloDNA vigente do Silo do item (`pillarArticleId`, `supportArticleIds`,
`narrativeOrder`), lido pela régua `radarArticleSiloRole` (`lib/radar/silo-role.ts`) com `resolveSiloHierarchyView`
do Arquiteto. Na falta dele, a foto do envio (`hydration.silo.articleRole`). Por último, a sugestão da formação
(`ArticleDNA.hierarchy`), marcada "(formação)". O Radar não grava papel.

**Causas e correções (Verificado no código / Confirmado por teste):**

1. **Silo errado depois da reconciliação (COB-3 / R2).** A régua achava o SiloDNA por `hydration.silo.id || row.siloId`.
   Quando chega versão nova de um ArticleDNA territorial (sem `siloId`), a reconciliação remonta a hidratação sem o
   Silo resolvido, e `hydration.silo.id` vira o `lista_id` da keyword do Minerador (`lib/radar/hydration.ts`). O
   SiloDNA vigente sumia e o Pilar aparecia "Suporte (formação)". Agora vale `row.siloId || hydration.silo.id`: o Silo
   que o handoff resolveu, na mesma ordem do envio ao Redator. Vale para a planilha, o perfil legado, a página de
   análise, o contexto de pesquisa e o servidor (`radar-canonical-authorities.ts`, CSV completo e MCP); o contexto
   editorial também.
2. **Artigo fora da composição (F1).** Com o Pilar decidido no SiloDNA vigente e o artigo fora da composição, a régua
   caía na foto do envio, que podia dizer "Pilar": dois Pilares no mesmo Silo, na tela, no CSV e no contexto KGR. Agora
   a régua devolve "Fora da composição do SiloDNA vigente" (fonte `FORA_DA_COMPOSICAO`, não decidido). Ela informa o
   Pilar do Silo e a nota "resolva no Arquiteto". A planilha e a página de análise deixaram de completar o
   `pillarArticleId` do contexto KGR com o SiloDNA por fora da régua.
3. **Silo sem Pilar no plano por Silo (F2).** `radarSiloDnaRoleOf` dava o papel legado de `articleRoles` (cópia da
   formação) ou "Suporte" sem marca. O CSV "Para escrever" e o artigo-modelo, que preferem o papel do plano, diziam
   "devolve o leitor ao Pilar" num Silo sem Pilar. Agora o plano diz "X (formação)" ou "Papel não decidido no Silo",
   o mesmo rótulo da planilha. O artigo-modelo só cobra o link ao Pilar decidido, nunca ao "Pilar (formação)".
4. **`targetNodeId` no CSV completo (R1 / F3, must-fix).** O nó do grafo (`article:…`) saía em
   `internal_links_resolved_json`, contra a §13. O CSV completo tira o campo antes de serializar. A guarda §13 de
   `radar-portable-export-12` passou a usar um id no formato real (`article:article-candidate:territory:…`): com
   "a9" ela não via o vazamento.
5. **"Formato editorial: Suporte." (COB-1).** O motivo do modo de análise (aba Resumo da página de análise e o
   `modeRecommendation` gravado em cada versão de análise nova) usava `ArticleDNA.hierarchy`/`row.format`. Agora usa
   `radarUnitFormatLabel` (Artigo ou SiloPage), a mesma régua da coluna Formato. Versões já gravadas ficam como estão.
6. **Foto "support" sem confirmação (F5, nit).** O envio grava "support" também para Silo sem Pilar. Sem o SiloDNA
   vigente em mãos, o "Suporte" da foto deixa de ser decisão: a linha Função fica "pendente" e diz "confirme no
   Arquiteto". O rótulo não muda. O KGR é binário e continua usando a foto acima da sugestão da formação.
7. **Filtro Formato guardado com papel (F4 / R3, nit).** A última vista da planilha volta do navegador e reaplicava
   "Formato = Suporte", que não casa mais com nenhuma linha: planilha vazia com o seletor em "Todos". O guarda novo
   `modules/radar/radar-format-filter-legacy.tsx` descarta o filtro quando o valor é um papel
   (`radarFormatFilterIsLegacyRole`). Nenhum filtro válido é apagado, e o componente compartilhado da planilha não
   mudou.
8. **Dossiê do Redator (COB-2): corrigido só no catálogo, de propósito.** `observed.identity.hierarchy` (sugestão da
   formação) e `observed.internalLinkPlan.articleRole` (foto do envio) continuam como estão. O modelo observado é
   montado ao vivo e entra no hash do dossiê (`bundleHash`). Esse hash chaveia o artigo-modelo aprovado e o "mesmo
   dossiê" do envio ao Redator: trocar os dois campos desligaria todo artigo-modelo aprovado, e reorganizar é IA
   paga. O catálogo do MCP (`lib/agent/platform-catalog.ts`) deixou de dizer "a mesma régua" sem ressalva. Em "Ler o
   dossiê do artigo", ele avisa que esses dois campos não são decisão e que o papel decidido está no SiloDNA
   (`dna.silo`) e na linha "Papel no Silo" de `get_article_for_writing`.

Correções à seção abaixo: `targetNodeId` agora de fato não sai no arquivo. A reconciliação do artigo territorial
passou a ser coberta pela régua; antes não era.

**Arquivos:**

- Radar (proprietário): `lib/radar/silo-role.ts`, `strategy-context.ts`, `r3-workbench.ts`,
  `article-research-context.ts`, `editorial-context.ts`, `article-blueprint.ts`, `portable-export.ts` e
  `portable-evidence-pack.ts` (comentário); `lib/server/radar-canonical-authorities.ts`; `modules/radar/radar-page.tsx`,
  `radar-analysis-page.tsx` e `radar-format-filter-legacy.tsx` (novo); `lib/agent/platform-catalog.ts` (notas).
- Testes: `tests/radar-papel-no-silo.test.mts` (casos novos e estrutural reforçado), `tests/radar-portable-export-12.test.mts`
  (id real do nó e asserção sem `targetNodeId`) e `tests/radar-investigacao-memo.test.mts` (âncora na ordem nova).
- Compartilhados: nenhum contrato mudou. `RadarItem`, `hydration`, `ArticleDNA`, SiloDNA, grafo, modelo observado,
  dossiê e pacote congelado estão intactos. `RadarSiloRoleSource` (do arquivo novo desta entrega) ganhou
  `FORA_DA_COMPOSICAO`, e `buildRadarKgrStrategy` aceita `siloRole.source` opcional.

**Consumidores preservados:** hash do dossiê e artigo-modelo aprovado (o modelo observado não mudou), plano de links
congelado, export por Silo e CSV "Para escrever" com Pilar decidido (mesma saída), Redator e MCP.

**Testes (Confirmado por teste, só fixtures):**

- `tests/radar-papel-no-silo.test.mts`: casos novos para o artigo territorial reconciliado com `lista_id`, o artigo
  fora da composição (tela, R3, KGR, CSV completo e CSV "Para escrever"), o Silo sem Pilar (plano, planilha, CSV
  "Para escrever" e artigo-modelo), a foto "support" sem confirmação, o filtro Formato antigo e o `targetNodeId` fora
  do CSV. O estrutural fixa a ordem do Silo, o KGR sem reserva, o motivo "Formato editorial" e o catálogo.
- Reversões em cópias no scratchpad: 22 correções, cada uma desfeita sozinha, derrubam pelo menos um teste. É a prova
  de que cada teste falha sem a correção.
- `tests/radar-papel-no-silo.test.mts`: 22 testes (eram 17), todos passam.
- `npm run test:radar`: 3095 testes, 3094 passam, 0 falhas, 1 pulado (pré-existente). Numa rodada anterior, o teste de
  tempo `radar-especialista-sem-laco-dom` ("controle: sem o bail-out…", janela de 400 ms) falhou sob carga. Ele não
  toca arquivo desta revisão, passa sozinho (duas vezes) e passou na rodada final.
- `npm run test:redator`: 357/357. `npm run test:agent`: 65/65.
- `npm run test:editorial`: 168/172. As 4 falhas são anteriores e iguais às da rodada do revisor (rotas de Conta, Admin,
  Marca e Minerador/Arquiteto).
- `tsc`: só os 2 erros pré-existentes de `.next/types` do Planejador. eslint nos arquivos tocados: 0 erros e 10 avisos
  pré-existentes (código morto de `radar-page.tsx`). `git diff --check`: limpo.
- `npm run test:visual-system`: 29/30, a mesma falha anterior em `components/editorial/professional-writer.tsx`
  (Redator, fora desta revisão).

**Validado manualmente:** não. A homologação na marca 61d2e019 é do dono. Nenhum SQL, nenhuma escrita no Supabase e
nenhuma chamada a provider pago.

**Limites:**

- Versões de análise já gravadas guardam "Formato editorial: Suporte." no `modeRecommendation`; só as novas mudam.
- O dossiê do Redator continua com `observed.identity.hierarchy` igual à formação (item 8). Trocar exige decisão do
  dono sobre reorganizar os artigos-modelo aprovados.
- O guarda do filtro Formato só roda com a barra global da planilha montada (é onde o seletor Formato aparece).

## Papel no Silo: o Radar lê o que o Arquiteto decidiu — 2026-10-08

**Relatado pelo usuário:** no Arquiteto, "leads qualificados" é o PILAR do Silo "Leads sem Tráfego Pago" (marca
61d2e019); no Radar, a planilha dizia "leads qualificados · Suporte", a coluna Conteúdo "Leads sem Tráfego Pago ·
Suporte · 6 keyword(s)" e o perfil "Silo / função: … · Suporte". Todos os oito artigos apareciam como Suporte. Palavras
do dono: o papel "foi determinado no arquiteto e não pode ser mudado, e toda a estrutura do silo já foi definida lá
junto com os links internos". No mesmo perfil, o card SERP dizia "Principais 0 · Pendentes 10 · Aguardando revisão
SERP" ao lado de "Finalizado · Google · 26 de 38 analisada(s)".

**Causa (Verificado no código e reproduzido com fixture):**

- O Radar lia `RadarItem.hierarchy`. A importação (`lib/editorial/operational-flow.ts`) copia esse valor de
  `ArticleDNA.hierarchy` e também o grava em `RadarItem.format`. Esse campo é a SUGESTÃO da formação, gravada antes
  de o Silo existir. Hoje todo caminho de formação grava "Suporte" fixo, e a sucessora que materializa o Silo só
  preenche `siloId`.
- A decisão do Pilar é da fase Silos e fica no SiloDNA (`pillarArticleId`, `supportArticleIds`, `narrativeOrder`). O
  Arquiteto, o export do Arquiteto e o MCP leem de lá (`resolveSiloHierarchyView`, LINK_HIERARCHY_AUTHORITY =
  SILODNA).
- A foto do envio (`hydration.silo.articleRole`) estava certa no envio, mas tem três limites:
  - é binária: Silo sem Pilar vira "support" para todos;
  - fica para trás quando o Pilar muda depois do envio;
  - some na reconciliação, quando chega uma versão nova do ArticleDNA.
- Só o export por Silo lia o SiloDNA direto. Por isso o CSV de 2026-10-07 dizia "1 · Pilar · leads qualificados".

**Correção, só no Radar (Verificado no código / Confirmado por teste):**

- **Régua única** `radarArticleSiloRole` em `lib/radar/silo-role.ts`. É domínio puro e só lê. A ordem das fontes:
  1. o SiloDNA vigente do Silo do item (formado, mesma marca, mesmo Silo e com Pilar declarado), lido pela régua do
     Arquiteto (`resolveSiloHierarchyView`, importada sem alteração);
  2. a foto do envio;
  3. a sugestão da formação, marcada "(formação)" e nunca tratada como decisão.

  Sem nenhuma das três, a régua diz "Papel não decidido no Silo" e não inventa Suporte. Ela também devolve a fonte, a
  posição do Suporte pela `narrativeOrder` e um aviso quando o SiloDNA vigente é outro que o do envio. O export por
  Silo usa a mesma regra (`radarSiloDnaRoleOf`); o `papelNoSilo` de `portable-silo-export.ts` delega a ela.
- **Leitores trocados para a régua:**
  - planilha: coluna Artigo ("keyword · papel") e a busca;
  - modelo R3: `model.hierarchy` e a linha "Função", que diz a fonte;
  - perfil ("Silo / função"), Workbench ("Função"), faixa e Relatório ("Silo e papel") e painel do especialista;
  - perfil legado e página de análise ("Função no silo");
  - contexto KGR (`buildRadarKgrStrategy`: régua decidida → `pillarArticleId` do SiloDNA → sugestão);
  - coluna Conteúdo (`buildRadarArticleDnaSummary`);
  - contexto editorial ("Função no silo" com o SiloDNA como autoridade; quando diverge, a formação é dita sugestão);
  - fundamentos ("Papel do artigo no silo"; o campo "Hierarquia" virou "Hierarquia sugerida na formação");
  - blueprint editorial e modelos do artigo e do perfil (em português, não "pillar"/"support");
  - CSV completo (`article_role` e "Papel no silo"), CSV "Para escrever" e artigo-modelo.
- **Contexto de pesquisa:** ganhou a entrada opcional `siloDna` e o campo opcional `siloRole`, que guarda o resultado
  da régua. `silo.articleRole` e `article.hierarchy` continuam como vieram, porque entram no hash do dossiê e no
  modelo observado: trocá-los orfanaria pacotes que não mudaram.
- **De onde vem o SiloDNA vigente:**
  - na tela, de `pipeline.siloVersions` (`radarCurrentSiloDna`), e a memória da investigação passou a ter o SiloDNA
    vigente na chave;
  - no servidor, do que o lote já leu (`loadRadarCanonicalAuthorities({ siloVersions })`), sem leitura a mais. Isso
    vale para o export, o envio ao Redator e o MCP.
- **Coluna Formato:** deixou de mostrar o papel copiado (`RadarItem.format = ArticleDNA.hierarchy`) e mostra a unidade
  (Artigo ou SiloPage). O campo gravado não muda.
- **Artigo-modelo:**
  - o papel do brief é o do plano por Silo (SiloDNA vigente) e, sem ele, o da régua;
  - o pedido à IA diz o que o papel pede (o Pilar "cobre o tema com amplitude e aprofunda por links para os
    suportes");
  - o próprio artigo nunca é candidato a link, nem pelo id nem pelo slug;
  - a nota "Falta o link para o Pilar" só vale para Suporte.
- **Links pelo grafo aprovado:**
  - o link portátil carrega o nó de destino (`targetNodeId`, aditivo e opcional, nunca sai no arquivo);
  - o CSV "Para escrever" resolve o destino pelo nó (`article:<articleId>`) antes de casar palavras do título;
  - o artigo-modelo marca "pedido pelo grafo aprovado" também pelo nó.
- **MCP `get_article_for_writing`:** monta com o mesmo Silo do botão "Para escrever" (`selectionSiloContext` e
  `selectionPlan`). Ordem, papéis, link Suporte → Pilar e SiloPage saem resolvidos. Nota atualizada em
  `lib/agent/platform-catalog.ts`.
- **Envio ao Redator:** quando o ArticleDNA territorial não tem `siloId`, o `siloDnaRef` do documento usa o Silo do
  item do Radar (`siloId`, ou o da foto do envio). Antes caía na referência legada `silo:<articleId>`. A porta
  `loadArticleIdentity` ganhou `siloId` opcional.
- **Card SERP do perfil:** no Google com investigação, mostra o mesmo resumo da coluna Pesquisa (Status, Analisadas e
  Referências). Fora do Google, mostra a projeção do perfil. Sem investigação, mostra o card de antes. Nenhum dado
  muda.
- **O Radar não grava papel:** nada volta ao ArticleDNA, ao SiloDNA nem ao grafo. Quem troca o Pilar é o Arquiteto.

**Arquivos:**

- Radar (proprietário):
  - `lib/radar/`: `silo-role.ts` (novo), `r3-workbench.ts`, `article-research-context.ts`, `operational-view.ts`,
    `strategy-context.ts`, `editorial-blueprint.ts`, `editorial-article-model.ts`, `editorial-profile-model.ts`,
    `editorial-context.ts`, `foundation-profiles.ts`, `foundation-usage-map.ts`, `article-blueprint.ts`,
    `portable-writing-export.ts`, `portable-evidence-pack.ts`, `portable-silo-export.ts` e `deep-research-view-memo.ts`;
  - `lib/server/`: `radar-canonical-authorities.ts`, `radar-portable-export-core.ts` e `radar-writer-send.ts`;
  - `modules/radar/`: `radar-page.tsx`, `radar-analysis-page.tsx` e `radar-r3-profile-mirror.tsx`;
  - `lib/agent/platform-catalog.ts`: nota do MCP.
- Compartilhados: nenhum contrato mudou. `resolveSiloHierarchyView` é só importado.
  - `RadarItem.hierarchy`/`format`, `OperationalPublication.hierarchy`, `ArticleDNA.hierarchy` e
    `hydration.silo.articleRole` ficam como estão.
  - Campos novos, todos opcionais: `RadarArticleResearchContext.siloRole`, `RadarR3Model.siloRole` e
    `RadarPortableInternalLink.targetNodeId`, além das entradas `siloDna`, `siloRole`, `siloVersions`, `siloId` e
    `research`.
  - Consumidores preservados: dossiê e pacote congelado (hash igual), modelo observado, plano de links, export por
    Silo, testes do Redator e do MCP.

**Testes (Confirmado por teste, só fixtures):**

- `tests/radar-papel-no-silo.test.mts` tem 17 testes, pelo caminho real (handoff do Arquiteto → importação → leitores).
  O fixture tem o Pilar no SiloDNA e "Suporte" no ArticleDNA, e o teste cobre:
  - Pilar em todas as superfícies;
  - Silo sem decisão: reserva da formação, marcada;
  - SiloDNA de outra marca, de outro Silo ou em rascunho não empresta papel;
  - Pilar trocado depois do envio: vale o vigente, com aviso;
  - o Pilar não recebe planta de Suporte, link para si mesmo nem a nota de link ao Pilar;
  - export por Silo e planilha dão a mesma resposta;
  - links pelo nó do grafo;
  - card SERP;
  - fiação estrutural.
- `tests/radar-to-writer-handoff-1.test.mts`: Q2 confere o Silo do item chegando à identidade do documento.
- Seis testes existentes foram ajustados ao texto novo (papel em português, SiloDNA na chave da memória).
- 43 mutantes, aplicados em cópias no scratchpad: 43 mortos.
- Suítes: `npm run test:radar` (3089 passam, 1 pulado, 0 falhas), `npm run test:redator` (357/357) e
  `npm run test:agent` (65/65).
- `npm run test:visual-system`: 29/30. A falha é anterior a esta entrega: a dívida subiu em
  `components/editorial/professional-writer.tsx` (Redator), que esta entrega não tocou e que não tem alteração no
  working tree. Nenhum arquivo do Radar aparece na regressão.
- `tsc`: só os 2 erros pré-existentes de `.next/types` do Planejador.
- eslint nos arquivos tocados: 0 erros; os avisos são o código morto declarado do `radar-page.tsx`.

**Ainda não verificado:**

- Banco: não houve leitura nem SQL. A leitura sugerida está no backlog.
- Homologação manual: é do dono.

**Fica de fora, com motivo:**

- **"Formato dominante" e `expectedFormat`:** a comparação de formato (`editorial-comparison.ts`) e a coleta de apoio
  (`expectedFormat`) ainda leem `ArticleDNA.hierarchy`. A comparação entra no modelo observado congelado e o
  `expectedFormat` entra na entrada da coleta SERP.
- **Plano de links congelado:** o `articleRole` do plano continua sendo a foto do envio. Não tem leitor na tela.
- **Reconciliação:** continua zerando a foto. A régua cobre isso com o SiloDNA vigente.
- **Aviso de grafo mais novo depois do envio:** `radarLinkContextIsStale` não tem consumidor, porque a tela não
  carrega os grafos.
- **CSV de vídeo:** não usa papel.

## Revisão da Fase 1 automática e da lentidão: o que ainda segurava o automático — 2026-10-08

**Relatado pelo usuário:** "O [Analisar concorrência · e finaliza (+ 1 chamada de IA)] não está funcionando com
muitos novos, está falando para revisar pesquisa, mas vou revisar onde? ele já teria que ter feito isso de forma
automática sem importar os custos" e "o selector e o scroll está muito lento". As duas correções do dia estão nas
seções abaixo ("Seletor e scroll lentos…" e "Automático da Fase 1 do Google…"). Esta seção registra o que a revisão
adversarial delas achou e o que o corretor mudou.

**Decisão do dono aplicada:** no Google, "… e finaliza" termina a Fase 1 sozinho, sem importar o custo. Página que
nunca é lida (sem acesso, bloqueada, formato que a extração não lê, sem resposta) vira limitação declarada, não
pendência eterna; amostra insuficiente e consulta auxiliar que falhou finalizam com a limitação registrada no pacote
congelado. Só param a intenção da SERP em conflito (decisão humana), nenhuma página lida (nada para congelar), o que
pede pesquisa nova e a gravação ou releitura não confirmadas — e a frase diz o motivo, a área e o nome do botão que
a tela mostra naquele estado.

**Causa e correção, por achado (Verificado no código / Confirmado por teste):**

- **F1 · amostra vazia e todas as candidatas recusadas.** A análise lançava erro ANTES de gravar
  (`!pages.length && !membership.reused`): 403, PDF e `no_outcome` não chegavam ao banco, as referências seguiam
  pendentes e cada clique relia tudo para parar na mesma frase. Agora `analyzeSerpSelection` grava a versão da
  amostra com as falhas (sem carimbo), PARA ali — sem fontes, modelo, relatório nem escrita de autoridade — e, pela
  releitura do servidor, diz: "Não finalizou sozinha: nenhuma das N página(s) pendente(s) pôde ser analisada e
  nenhuma outra está na amostra; N falha(s) ficaram gravadas (readback confirmado) como limitação declarada. Para
  continuar, na área Pesquisa, botão "Refazer Pesquisa Google"." Só lança quem não tem nem falha para gravar.
- **F2 · a extração órfã entrava no modelo e no pacote congelado.** Se a releitura da página falhava, a órfã (a URL
  final gravada pelo defeito, ou a de uma referência desmarcada) ficava, e `buildRadarDeepResearchView` montava
  estrutura, modelo observado, fontes externas, suficiência e resumo com TODAS as extrações: o pacote dizia 12
  analisadas + 6 sem acesso para 17 selecionadas. Agora, com página na amostra, tudo isso sai só das extrações da
  seleção (`paginasDaAmostra`, recortadas por `sample.analyzedUrls`), como o handler já fazia em `paginasDoModelo`;
  sem página na amostra, a leitura continua mostrando o cache, como antes. Efeito visível: o card da Pesquisa conta só
  as analisadas da seleção (na fixture da tela, 12 extraídas com 1 de referência "format" → "11 analisada(s)").
- **F3 · curadoria da pesquisa obsoleta ou ausente, com canônicas extraídas.** As canônicas somadas à conta da Fase 1
  levavam a "Finalizar pesquisa", que a prontidão recusava ("A curadoria ainda não foi confirmada") sem nenhum botão
  para confirmar. Agora as canônicas só entram com a curadoria da pesquisa confirmada; sem ela, a conta e o caminho
  voltam aos de antes desta entrega ("Refazer Pesquisa Google").
- **F4 · o ⓘ de "Iniciar Pesquisa YouTube/Amazon" prometia a regra do Google** ("não seguram"), mas os dois perfis
  continuam na D9 (`radarProfileAutoFinalizeDecision`). `radarPhase1WithAutoFinalize(acao, mode)` usa a nota nova só
  no Google; YouTube e Amazon voltam a `radarAutoFinalizeStartNote("análise")`. `radarPhase1Visible` e
  `radarPhase1VisibleLabel` recebem o modo (padrão Google), e o `Phase1Button` recebe o modo da investigação
  (`view.record?.primarySearchMode || searchMode`) dentro da área Pesquisa e na barra recolhida.
- **F5 · o ⓘ do Google listava três paradas; o automático tem mais.** `radarGoogleAutoFinalizeStartNote` lista todas:
  intenção em conflito; nenhuma página lida; o que pede pesquisa nova (fundamento mudado, consulta paga faltando);
  página sem desfecho depois da leitura extra; gravação ou releitura do servidor não confirmadas.
- **V3 · rota de detalhe `/{brandRef}/radar/{articleId}`** ("Analisar páginas selecionadas") gravava a URL final,
  deduplicava pela URL crua e não gravava as falhas. Agora fecha a rodada por `radarReconcileExtractionRound` e grava
  `extractionFailures`.
- **V4 · duas referências, uma página.** A referência que redireciona para a página de outra referência já na amostra
  (ou lida agora pela própria URL), ou para a mesma página que outra referência da rodada já trouxe, punha o conteúdo
  duas vezes no modelo (benchmark, termos, competitividade). Agora a repetida vira falha declarada
  `redirect_duplicate`, com o destino dito na mensagem; se o destino falhou, a origem fica com o conteúdo (uma vez).
- **V5 · rodada com amostra existente em que TODAS as candidatas falham** (registrado, sem mudança de código): as
  falhas são gravadas e o automático congela com essas páginas fora — inclusive quando a causa é uma queda passageira
  que persiste depois do único retry. Reler depois exige zerar a investigação (pesquisa paga nova); "Reparar
  congelamento" não relê páginas. É a decisão do dono ("página que nunca é lida vira limitação declarada").
- **MEMO-1 · rolagem na troca de marca.** Um evento de rolagem com a chave nova antes da limpeza do efeito (o clamp
  do navegador, no mesmo commit) apagava a posição pendente da marca anterior. `agendarRolagem` grava a pendente da
  chave antiga antes de agendar a nova.
- **V1 · `npm run test:visual-system`:** o pin de `tests/identity-keyword-colors.test.mts` esperava a marcação antiga
  da coluna Artigo (mudada na seção "Planilha sem 'Cobrir com clareza o tema'"); agora exige `text-keyword` no valor
  da keyword dentro do JSX condicional novo. **V6:** higiene (`RemoteExpertEvidenceState = {`).

**Desempenho — antes → depois** (bancada `perf-radar/` do scratchpad: 25 artigos analisados, 12 páginas e 36 links por
página, React de desenvolvimento, happy-dom, sem rede). A correção da lentidão é a da seção "Seletor e scroll lentos";
esta revisão remediu na mesma bancada, depois das mudanças acima, para confirmar que nada voltou:

| Ação | Antes da correção | Depois da correção | Depois desta revisão |
| --- | --- | --- | --- |
| montagem | 31.278 ms (75 views) | 2.203 ms (25 views) | 909 ms (25 views) |
| clicar numa linha | 15.569 a 355.557 ms | 320 a 652 ms (0 view) | 93 a 214 ms (0 view) |
| marcar checkbox | 13.981 a 26.697 ms | 172 a 217 ms | 82 a 83 ms |
| marcar todas | 4.722 ms | 47 ms | 22 ms |
| aviso publicado | 10.508 ms, 2 renders | 1 ms, 0 render | 1 ms, 0 render |
| releitura de 1 análise | 10.500 ms | 433 ms (1 view) | 64 ms (1 view) |
| 60 eventos de rolagem | 1 ms (60 escritas no storage) | 3 ms (≤ 1 escrita) | 1 ms (≤ 1 escrita) |
| modelo de 1 linha, 0/12/36/72 links | 24 / 76 / 241 / 656 ms | 24 / 28 / 27 / 30 ms | 26 / 27 / 28 / 30 ms |

A diferença entre as duas últimas colunas é variação da máquina (a revisão não mexe no caminho quente; o recorte da
amostra na view é um `Set` por linha). Especialista aberto e parado: 98% da thread antes → ~1% depois (medido na
correção; não remedido aqui).

**Arquivos compartilhados (AGENTS §4) e consumidores preservados:**

- `components/editorial/operational-data-grid.tsx` — MEMO-1, aditivo (mesma chave, mesma restauração). Consumidores:
  Radar, Minerador, Arquiteto; `test:minerador:dom` 4/4 e `test:arquiteto:dom` 17/17.
- `lib/radar/operational-actions.ts` (`radarPhase1WithAutoFinalize`, 2º argumento opcional com padrão Google — as
  chamadas existentes não mudam) e `modules/radar/radar-article-blueprint-panel.tsx` (`radarPhase1Visible` e
  `radarPhase1VisibleLabel`, modo opcional).
- `lib/radar/deep-research-view.ts` — o formato da saída não muda; muda o que entra no modelo (só a seleção, quando
  há página nela) e quando as canônicas contam. Consumidores: tela do Radar, `r3-workbench`, relatório, export e
  congelamento (todos pela mesma view).
- `lib/radar/extraction-round.ts` — código de falha novo `redirect_duplicate` (o contrato de `extractionFailures`
  aceita `code` livre). `tests/identity-keyword-colors.test.mts` (suíte de sistema visual).
- Catálogo MCP (`lib/agent/platform-catalog.ts`, `radar.finalize`) e `docs/05-radar/spec.md` (FINALIZE) atualizados
  na mesma entrega.

**Testes (Confirmado por teste, só fixtures, PROVIDER_CALLS = 0):**

- Novos: `tests/radar-fase1-revisao-2026-10-08.test.mts` (13 testes: F1 puro e estrutural, F2 com o pacote
  congelado, F3, F4 puro e fiação da tela, F5, V4 ×3, V3 + V6) e `tests/radar-fase1-sem-amostra-dom.test.mts` (o
  `RadarPage` inteiro montado: o clique grava 1 versão com todas as falhas e sem carimbo, não verifica fontes, e a
  frase manda para "Refazer Pesquisa Google" — o botão que a tela passa a mostrar); caso novo em
  `tests/radar-planilha-rolagem-dom.test.mts` (troca de marca com evento intercalado).
- Atualizados: `radar-pendente-eterno-2026-10-08` (destino que é outra referência: 11 + a repetida declarada),
  `radar-tela-render-dom` (11 e 7 analisadas — a página "format" da fixture fica fora da amostra),
  `radar-finalizar-automatico`, `radar-artigo-modelo-serp-ia-e-tela`, `radar-curadoria-lote`,
  `radar-18101-retomar-consolidacao`, `radar-extracao-contrato`, `identity-keyword-colors`.
- `npm run test:radar` 3072 testes, 3071 pass, 0 fail, 1 skipped (eram 3056); `npm run test:agent` 65/65;
  `npm run test:editorial` 168/172 — as mesmas 4 falhas de antes, em `editorial-pipeline.test.mts` (rotas de
  Conta/Admin/Marca), sem relação; `npm run test:visual-system` 29/30 — `identity-keyword-colors` volta a passar, e
  segue a dívida visual já existente (`professional-writer`, Arquiteto, Publicações, Redator; a mesma lista de
  antes); `test:minerador:dom` 4/4, `test:arquiteto:dom` 17/17, `test:redator:dom` 19/19, `test:editorial:dom`
  12/12; `tsc` só com os 2 erros conhecidos de `.next/types` (planejador); eslint 0 erro (os 10 avisos antigos de
  `radar-page.tsx`); `git diff --check` limpo e o fim de linha de cada arquivo preservado.
- Mutantes em memória (pré-carga no scratchpad; o repositório não é escrito): 17 de 17 mortos, rodada original verde
  (58 testes) — F1 de volta ao comportamento anterior, F1 sem parar, F1 com "Finalizar pesquisa" fixo; F2 órfã no
  modelo, cache sumindo, suficiência com tudo; F3; F4 nota do Google em qualquer modo, botão sem modo, barra sem modo;
  F5; V4 ×3; V3; V6; MEMO-1.

Validado manualmente: não.

**Limitações:** a duplicata (V4) só é detectada quando a URL final da página relida casa com outra referência; uma
página gravada antes desta revisão com o conteúdo de outra continua contando (a URL final não fica guardada). A rota
de detalhe ainda relê, a cada clique, as candidatas que falharam (a fila dela conta só extrações). A medição é Node +
happy-dom; o navegador real não foi medido.

**O que o dono faz:** depois do deploy (ou no dev local), no artigo "marketing digital para dentistas", 1 clique em
"Analisar concorrência · e finaliza (+ 1 chamada de IA)": deve finalizar sozinho (com a limitação, se houver) e o
readback deve mostrar `finalizedBundle`. Num artigo em que nenhuma página abre, a frase deve mandar para "Refazer
Pesquisa Google" na área Pesquisa, e o botão não pode voltar a "Analisar concorrência". No YouTube e na Amazon, o ⓘ de
"Iniciar Pesquisa …" não deve prometer a regra do Google.

## Seletor e scroll lentos: a tela refazia a investigação de todas as linhas a cada render — 2026-10-08

**Relatado pelo usuário:** "O selector e o scroll está muito lento, parece que estou trabalhando num computador dos
anos 80 … não tem como ser mais ágil?"

**Causa (Verificado no código; medido na bancada do scratchpad `perf-radar/`, React de desenvolvimento, happy-dom,
fixtures de tamanho real geradas pelos schemas e funções de produção — sem rede, sem provider):**

1. Cada render do `RadarPage` refazia `buildRadarDeepResearchView` para TODAS as linhas (`cacheDaLinha` vive um render,
   regra C do RADAR_SELECTION_LIGHT_1), e um clique faz 3 a 4 renders. A view era ~90% do custo de cada linha.
2. Dentro dela, `buildRadarExternalSourceResearch` relia tipo, tokens e raízes das MESMAS strings milhares de vezes
   (conceito × destino × seção × variante): o custo crescia com os links observados por página.
3. Com a área Especialista aberta num artigo não finalizado, laço de render: `requirements` chegava ao painel como array
   novo, o painel avisava `onExpertEvidenceChange`, o Radar gravava três objetos novos de mesmo conteúdo, e a página
   renderizava de novo. A rota de detalhe tinha o mesmo laço (`|| []` + revisão incrementada a cada aviso, com GET de
   expert-briefs a cada volta — verificado só no código).
4. `useNoticeBridge` lia o contexto inteiro do centro de avisos: cada aviso publicado ("Analisando páginas 5 de 6…")
   re-renderizava a tela inteira.
5. Com renders de ~5 s, o tique de 10 s da leitura de vídeos (sem Realtime LIVE) passava a disparar render atrás de
   render: o primeiro clique da bancada levou 355 s (34 renders).

O scroll em si não executava trabalho caro (60 eventos = 1 ms); ele travava porque a thread estava ocupada pelos itens
acima. O `onScroll` da planilha gravava no localStorage a cada evento.

**Medido — antes → depois (25 artigos analisados, 12 páginas e 36 links por página, mesmo harness):**

- montagem: 31.278 ms → 2.203 ms; clique numa linha: 15.569 a 355.557 ms → 320 a 652 ms (0 recálculo da view);
  checkbox: 13.981 a 26.697 ms → 172 a 217 ms; marcar todas: 4.722 → 47 ms;
- aviso publicado: 10.508 ms e 2 renders → 1 ms e 0 render; releitura de 1 análise: 10.500 → 433 ms (1 view);
  troca de `serpRecords`: 10.625 → 57 ms; mesa trocada sem mudar linhas: 10.494 → 57 ms;
- Especialista aberto, 6 s parado (0 link/página): 6 commits e 7.254 ms de render (98% da thread) → 3 commits, 80 ms;
  com 36 links: 3 commits, 71 ms;
- abertura com 50 releituras: 263.412 ms (53 commits) → 6.355 ms (54 commits); depois, 8 s: 59% → 1% da thread;
- cenário misto (10 analisados, 4 só SERP, 11 novos): clique 6.438 a 8.463 ms → 146 a 365 ms;
- modelo de uma linha: 24 / 76 / 241 / 656 ms (0 / 12 / 36 / 72 links) → 24 / 28 / 27 / 30 ms;
  `buildRadarExternalSourceResearch`: saída JSON idêntica nos três tamanhos, 36× a 78× mais rápido.

**Correção (Verificado no código / Confirmado por teste) — nenhum texto, ação ou persistência mudou:**

- `lib/radar/deep-research-view-memo.ts` (novo, puro): `createRadarDeepResearchViewMemo` guarda a view por linha
  (WeakMap pelo RadarItem) com a chave = [ArticleDNA, registro SERP mais recente, "rodando?", rascunho da curadoria,
  modo efetivo]. Todo insumo do objeto entregue à view deriva dessas identidades. `radar-page.tsx` usa uma instância
  de módulo (`investigacaoDaLinha`); a única chamada de `buildRadarDeepResearchView` está dentro dela.
- **Regra C do RADAR_SELECTION_LIGHT_1 revisada:** `cacheDaLinha`, `cacheDaProjecao` e `cacheDoBlueprint` continuam
  vivendo um render; a exceção nomeada é a view da investigação, com a entrada inteira na chave.
  `tests/radar-selecao-leve-1.test.mts` exige isso (em vez de proibir) e `tests/radar-investigacao-memo.test.mts`
  prende o objeto literal da página à lista de insumos da chave.
- `lib/radar/link-and-source-research.ts`: leitura de texto (tipo, tokens, raízes) guardada por string DENTRO de cada
  chamada de `buildRadarExternalSourceResearch` (`criarLeituraDeTexto`); os helpers aceitam a leitura como parâmetro
  opcional e, sem ela, leem como antes (`buildRadarInternalLinkResearch` não mudou).
- `lib/radar/expert-evidence-change.ts` (novo, puro): `radarSameData` (igualdade de dado puro; na dúvida, diferente),
  `radarArticleDataUpdate` (mesmo conteúdo → mesmo mapa) e `radarExpertEvidenceChanged`. `handleExpertEvidenceChange`
  grava os três mapas pelo redutor; a rota de detalhe passa `SEM_PONTOS_DE_REVISAO` (constante congelada) e só sobe a
  revisão quando o aviso do painel muda (o primeiro aviso de cada abertura da aba continua relendo).

**Arquivos compartilhados (AGENTS §4, mudanças aditivas e retrocompatíveis):**

- `components/global-notice-center.tsx` — motivo: quem só publica re-renderizava a cada aviso. Um segundo contexto
  interno só com `publishNotice` (que muda só com a rota); `useNoticeBridge` lê esse contexto. `useNoticeCenter`,
  `NotificationBell`, `publishNotice` e a deduplicação por assinatura não mudaram. Consumidores preservados: Radar
  (página e detalhe), Marca, Minerador (Descoberta), Admin, Conta, Publicações. Teste:
  `tests/radar-avisos-sem-rerender-dom.test.mts`; regressão: `test:minerador:dom`, `test:arquiteto:dom`,
  `test:redator:dom`, `test:editorial:dom`, `minerador-lote-progressivo` e `minerador-discovery-phase-one` verdes.
- `components/editorial/operational-data-grid.tsx` — motivo: escrita síncrona no localStorage a cada evento de
  rolagem. A posição é gravada quando a rolagem para (`ROLAGEM_GRAVADA_APOS_MS` = 150 ms, exportado) e na troca de
  marca/módulo, na desmontagem e no `pagehide`; mesma chave, mesma restauração. Consumidores: Radar, Minerador,
  Arquiteto. Teste: `tests/radar-planilha-rolagem-dom.test.mts`.

**Testes (Confirmado por teste, só fixtures, PROVIDER_CALLS = 0):** novos `radar-especialista-sem-laco` (unitário +
fiação), `radar-especialista-sem-laco-dom` (painel real, agendador real: com o redutor o Pai assenta; sem ele o
controle dispara), `radar-fontes-externas-desempenho` (oráculo = cópia literal do laço anterior, com alinhamento
LEXICAL e SEMANTICALLY_RELATED; ≥ 15× mais rápido que o laço sem guarda no pior caso), `radar-investigacao-memo`,
`radar-tela-render-dom` (tela inteira montada com `tests/stubs/radar-tela-hooks.mjs`: trocar de artigo e checkbox com
0 recálculo; versão nova e seleção nova recalculam só a linha mudada; o texto da tela é comparado com uma releitura
FRIA — itens clonados — depois de cada ação; aviso sem render; Especialista ocioso sem laço),
`radar-planilha-rolagem-dom`, `radar-avisos-sem-rerender-dom`. `npm run test:radar` 3056 testes, 3055 pass, 0 fail,
1 skipped. Mutantes em cópia no scratchpad: leitura de texto 7 de 8 mortos (sobrevive só a guarda do conjunto de
tokens, ganho marginal); UI e memória 12 de 12 mortos (página sem memória, chave sem registro, insumo fora da chave,
Especialista sem redutor, ponte lendo o centro inteiro, rolagem por evento, desmontagem sem gravar, `|| []` de volta,
memória sem modo, memória ignorando a chave, igualdade sem tamanho de lista, redutor travado). Validado manualmente:
não.

**Limitações:** medição em Node + happy-dom com React de desenvolvimento — a parte de React/DOM no navegador real e o
custo de pintura das células sticky não foram medidos. Um clique ainda faz 3 a 4 renders (a leitura de vídeos troca
de chave com o artigo), agora de ~50 a 150 ms cada. Sem Realtime LIVE, o tique de 10 s da leitura de vídeos ainda
faz 2 renders por volta (baratos agora). A quantidade real de links por página nas extrações do dono não foi
verificada (o SQL fica com ele). P2 (agrupar as releituras da abertura com `startTransition`) não foi feito: depois da
correção, a abertura ocupa 1% da thread.

**O que o dono faz:** depois do deploy (ou no `next dev`), abrir o Radar da marca, clicar em linhas diferentes, marcar
checkboxes, rolar a planilha e abrir a área Especialista num artigo não finalizado: a resposta deve ser imediata.
Se ainda houver travada, gravar um perfil do Chrome DevTools rolando a planilha.

## Automático da Fase 1 do Google: a página que ficava pendente para sempre — 2026-10-08

**Relatado pelo usuário:** em "marketing digital para dentistas", "Analisar concorrência · e finaliza (+ 1 chamada
de IA)" terminou com "17 selecionada(s) · 11 reutilizada(s) · 1 analisada(s) agora · 5 sem acesso. Análise gravada
e confirmada. Não finalizou sozinha: a próxima etapa ainda é "Analisar concorrência". Revise e use "Finalizar
pesquisa" quando decidir." A frase não dizia onde revisar e nomeava um botão que a tela não mostrava; cada clique
relia a mesma página e parava de novo.

**Causa (Verificado no código; Confirmado por teste com fixture):** o extrator grava em `page.url` a URL FINAL
(depois do redirect, serializada por `new URL()`: `%C3%B3` no caminho com acento, punycode, "/" na raiz). A tela
empurrava a página assim para a amostra, e a releitura da Fase 1 compara por `radarNormalizedUrl`, que não absorve
troca de caminho nem percent-encoding: a página lida virava "fora da seleção atual" e a referência continuava
pendente. A frase da análise fechava a conta por subtração (17 = 11 + 1 + 5), enquanto a Fase 1 contava por outro
caminho — duas réguas. O literal "Finalizar pesquisa" estava fixo na frase de parada.

**Decisão do dono aplicada (muda a regra D9 de 2026-10-02 no Google):** o botão "… e finaliza" termina a Fase 1
sozinho. Página sem acesso, página sem resposta ou recusada pelo contrato, amostra insuficiente e consulta auxiliar
que falhou viram limitação registrada no pacote congelado (a mesma rotina do botão manual). Continuam parando:
intenção da SERP em conflito, nenhuma página lida, fundamento mudado, etapa paga faltando ("Completar Pesquisa
Google") e gravação não confirmada. Página que ainda ficar pendente depois da análise é lida de novo uma vez.

**Correção (Verificado no código / Confirmado por teste):**

- `lib/radar/extraction-round.ts` (novo, puro): `radarExtractionAccount` é a régua única (selecionadas =
  analisadas + sem acesso + pendentes, por URL normalizada), usada por `buildRadarAnalysisMembership`, pela frase do
  fim da análise e por `buildRadarDeepResearchView` (que expõe `sample`). `radarReconcileExtractionRound` fecha a
  rodada pela CHAVE do candidato: a página entra com a URL que a seleção pediu; candidata sem página nem erro (ou com
  página recusada pelo `RadarExtractionPageSchema`) vira falha `no_outcome`; a extração órfã antiga (a URL final de
  uma página relida agora, fora da seleção) sai; falha anterior não tentada de novo é herdada.
- Rota `/api/editorial/radar-analysis/extract`: cada página volta também com `requestedUrl: target.url` (aditivo;
  `radar-analysis-page.tsx` continua lendo só `page`). `radarNormalizedUrl` NÃO mudou (referenceId e fingerprint).
- `radarAnalysisCandidates` e o filtro do benchmark comparam por URL normalizada (a home "https://c.com.br" lida
  como "https://c.com.br/" deixou de ser relida em toda análise).
- `analyzeSerpSelection` (`modules/radar/radar-page.tsx`): seleção igual à da Fase 1 (canônicas + linhas
  selecionadas da pesquisa; a view recebe `canonicalSelectedUrls`); rodada fechada por `radarReconcileExtractionRound`;
  a rodada em que todas as candidatas falham grava as falhas quando já há páginas na amostra (com a amostra vazia,
  desde a revisão do corretor acima, também grava e para sem consolidar); o modelo (benchmark, termos, competitividade) sai da amostra gravada recortada pela seleção, não só das
  páginas lidas agora; a frase "sem desfecho" sai de `radarExtractionAccount` sobre a versão gravada.
- `finalizarGoogleSemPendencia`: relê o servidor; com página pendente, roda a análise de novo SÓ para ela (no máximo
  1 rodada extra, que devolve a frase sem encadear de novo) e só então decide. `radarGoogleAutoFinalizeDecision`
  finaliza com `limitations` (amostra insuficiente, consulta auxiliar que falhou); `freezeRadarEvidenceBundle` ganhou
  `extraLimitations` opcional (a consulta que falhou vai a `limitations`; sem ela o hash é o de antes). O aviso de
  sucesso diz "Finalizada sozinha com limitação registrada: …" quando houver.
- Frase de parada: `radarPhase1VisibleLabel` (`modules/radar/radar-article-blueprint-panel.tsx`) é a mesma montagem
  do `Phase1Button`; `radarAutoFinalizePendingNotice` ganhou `area` opcional: "Para continuar, na área Pesquisa, botão
  "Analisar concorrência · e finaliza (+ 1 chamada de IA)"." O ⓘ do botão de análise diz a regra nova
  (`radarGoogleAutoFinalizeStartNote`); YouTube e Amazon seguem com `radarAutoFinalizeStartNote` e a D9 de antes.
- Catálogo MCP (`lib/agent/platform-catalog.ts`, `radar.finalize`) e `docs/05-radar/spec.md` (FINALIZE) atualizados.

**Arquivos compartilhados e consumidores preservados:** rota de extração (campo aditivo); `buildRadarDeepResearchView`
(`canonicalSelectedUrls` opcional e `sample` aditivo; `google-observed-read-model.ts` não muda);
`freezeRadarEvidenceBundle` (`extraLimitations` opcional; bundles antigos com o mesmo hash);
`radarAutoFinalizePendingNotice` (terceiro argumento opcional; YouTube e Amazon sem mudança);
`radarGoogleAutoFinalizeDecision` (campo `limitations` aditivo; aceita a lista das consultas que falharam).

**Testes:** `tests/radar-pendente-eterno-2026-10-08.test.mts` (novo, 19 testes: o caso do dono com redirect e com
acento, dado legado, `no_outcome`, rodada extra, canônicas, régua única, bundle, frase e botão visível). Pins
atualizados em `radar-finalizar-automatico`, `radar-curadoria-lote`, `radar-fase1-contabilidade`,
`radar-fase1-tres-acoes`, `radar-18101/18102/18103`, `radar-cardinalidade-suficiencia`, `radar-extracao-contrato`,
`radar-acoes-sem-reidratar-tudo` (rota devolve `requestedUrl`) e `radar-artigo-modelo-serp-ia-e-tela`.
`npm run test:radar` 3024 testes, 3023 pass, 0 fail, 1 skipped; `npm run test:agent` 65 pass; `tsc` só com os 2
erros conhecidos de `.next/types`; eslint sem erro; 13 mutantes em cópia no scratchpad, 13 mortos (sem reescrever a
URL, sem `no_outcome`, sem herdar falha, sem limpar a órfã, regra D9 antiga de volta, frase sem a área, literal
"Finalizar pesquisa" de volta, rodada extra sem limite ou sem filtro). Validado manualmente: não.

**Limitações:** a órfã já gravada no artigo do dono só sai no próximo clique (relê 1 página, sem provider); a URL
final não é guardada na página (só limpa a órfã); o id da extração (`competitor:` + base64 cortado em 32) colide em
páginas do mesmo domínio — fora deste escopo; "Reparar congelamento" ainda diz "Finalizar pesquisa" fixo quando a
releitura falha; a lentidão do seletor e do scroll não foi tratada aqui.

**O que o dono faz:** depois do deploy (ou no dev local), no artigo "marketing digital para dentistas", 1 clique em
"Analisar concorrência · e finaliza (+ 1 chamada de IA)": a página pendente é relida, a órfã sai, a investigação
finaliza sozinha (com a limitação, se houver) e a IA organiza o artigo-modelo. O readback deve mostrar
`finalizedBundle` gravado.

## Planilha sem "Cobrir com clareza o tema" e sem a coluna Especialista — 2026-10-08

**Pedido do dono:** tirar da coluna Artigo da planilha a frase "Cobrir com clareza o tema" (não faz sentido) e
retirar a coluna Especialista (não mostrava nada útil).

**Verificado no código / Confirmado por teste:**

- `radarArticleDisplayTitle` (`lib/radar/r3-workbench.ts`) tira a moldura da promessa padrão do Arquiteto
  ("Cobrir com clareza o tema “X”." → "X", com ou sem aspas e ponto); promessa escrita de verdade fica como
  veio. `buildRadarR3Model` usa a função no `title`, então a planilha, o cabeçalho do Workbench e o perfil
  mostram só o X. A busca/ordenação da coluna Artigo e o rótulo do diálogo "Importar artigos aprovados" usam a
  mesma função. O ArticleDNA não muda (a promessa gravada continua a do Arquiteto).
- Na coluna Artigo, quando o título sem moldura é a própria keyword, a linha de baixo mostra só a função no
  Silo (a keyword não se repete).
- A coluna "Especialista" saiu da planilha (`modules/radar/radar-page.tsx`); o card Especialista do Workbench
  continua com a mesma autoridade (`r3.specialist.summary`). `radarSpecialistCell` continua exportada.
- Testes: `tests/radar-planilha-titulo-2026-10-08.test.mts` (novo) e `tests/radar-gate18-7-especialista-planilha.test.mts`
  (agora exige a ausência da coluna). Validado manualmente: não.

## Correção: fonte que falha na verificação recusava a análise inteira — 2026-10-08

**Relatado pelo usuário:** em "marketing digital para dentistas", a Pesquisa Google não finalizava
("Análise incompleta"), o botão do YouTube ficava desabilitado e a notificação mostrava o erro do zod
`sourceVerificationFailures[i].sourceId — expected string, received undefined` (e `domain` no item 2).

**Causa (Verificado no código):** defeito de origem (2026-09-12), não regressão da rodada dos entregáveis.
`verifyRadarSources` (`lib/radar/source-verification.ts`) devolvia a falha sem `sourceId`, e a rota
`/api/editorial/radar-analysis/verify-sources` a repassava assim; o contrato da versão
(`sourceVerificationFailures` em `lib/radar/analysis-contracts.ts`, `.strict()`) exige `sourceId` e `domain`.
Bastava UMA fonte bloqueada ou lenta: a tela juntava a falha sem id, a repetição mandava `sourceIds: [undefined]`
(o pedido recusado voltava sem domínio), e a gravação da camada de evidência era recusada — a amostra já
gravada ficava sem a versão final, e a fase 1 não fechava.

**Correção (Confirmado por teste):**

- `verifyRadarSources` devolve `sourceId` do alvo e nunca domínio vazio (host do endereço como reserva);
- `radarSourceVerificationFailureRecords` (`lib/radar/source-verification-request.ts`, puro) transforma a
  falha da rota em registro válido para o contrato: id pela falha, pelo endereço no plano, pelo domínio
  único no lote ou pelo lote de uma fonte; sem como identificar, id próprio e fora da fila;
- a tela (`modules/radar/radar-page.tsx`, ANALYZE) grava só registros normalizados e só repete fonte cujo id
  está no plano (id fora dele faria a rota recusar o lote inteiro).
- Testes novos em `tests/radar-gate12-1-verificacao-no-analyze.test.mts` (a falha volta com id e passa no
  contrato; a falha antiga sem id nem domínio é normalizada; a tela usa a normalização). `npm run test:radar`
  3002 testes, 3001 pass, 0 fail, 1 skipped. `tsc` só com os 2 erros conhecidos de `.next/types`.

**O que o dono faz:** depois do deploy (ou no dev local), abrir o artigo e rodar de novo "Analisar
concorrência": a amostra já gravada é retomada (consolidação), a verificação refeita e a versão final grava;
então "Finalizar pesquisa" habilita o YouTube. Validado manualmente: não.

## Revisão dos entregáveis (CSV para escrever, CSV de vídeo, Redator, MCP) — 2026-10-08

**Como ler esta seção (rodada A–E e a correção da revisão):**

- **Verificado no código:** as funções, constantes, campos e frases de entregável citados abaixo foram
  conferidos no checkout de 2026-10-08, ao documentar (grep; ex.: `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION =
  "2026-10-08"`, `RADAR_ARTICLE_BLUEPRINT_PUBLISHED_READ_MS = 10_000`, `radarSentenceNeedsSource`,
  `RadarArticleBlueprintRulesNotice`, `UTILIDADE_MINIMA_DO_CORTE = 1`, `WRITER_BLUEPRINT_READING_RULES`).
  "fonte a obter" sobra só em comentário, na nota do saneador e no painel do artigo-modelo (tela operacional,
  fora do D10); "[RELATO DA MARCA — preencher]" e "leve-a como pendência" sobram só em comentário.
- **Confirmado por teste:** fixtures inventadas a partir dos CSVs reais de 08/10, PROVIDER_CALLS = 0 e
  AI_CALLS = 0. As contagens do corretor (abaixo) foram conferidas de novo ao documentar: `npm run test:radar`
  2.999 (2.998 pass, 0 fail, 1 skipped), `npm run test:redator` 357/357, `npm run test:redator:mcp` 144/144,
  `npm run test:agent` 65/65.
- **Ainda não verificado:** a resposta da IA real às regras novas do pedido (8, 9, 17 e 21–23; os testes
  conferem o pedido e a conferência sobre respostas inventadas); a leitura real da página publicada na
  geração (rede); o tempo da rota de geração no pior caso; os dois CSVs reexportados pela tela; o MCP real.
- **Validado manualmente: não (`MANUAL_UI_VALIDATED = NO`).** A reexportação real dos dois CSVs, a leitura
  na planilha, o aviso de regras anteriores na tela do artigo-modelo e uma geração real de artigo-modelo de
  artigo publicado (chamada paga) são do dono — a homologação é dele.

Módulo proprietário: Radar. Redator e catálogo MCP receberam mudanças aditivas, com UMA exceção registrada abaixo (o rótulo `brandVoice.statusLabel` do MCP). Autorização do
dono no chat: "pode fazer os seus ajustes, e rodadas, depois documenta". Caso real: o artigo "como atrair
clientes pelo instagram" (slug publicado `instagram-nao-traz-pacientes`), com artigo-modelo montado ANTES de
2026-10-02 — o export protege também esses artigos-modelo antigos (~25 no Silo).

**O que a rodada entregou (cinco frentes):**

- **A · fundação** (`lib/radar/brand-voice.ts`, `lib/radar/pending-claims.ts`). `radarBrandVoiceDeliverableLabel`
  e `radarBrandVoiceDeliverableStatusLabel`: todo entregável diz "ativa" ou "versão corrente na Marca", nunca o
  estado de tela (que segue nas telas da Marca e do Radar). A régua por frase `radarSentenceNeedsSource` (a
  mesma porta do vídeo) lê o SENTIDO — plataforma, efeito comercial (conversão) e comportamento do público —,
  com a polaridade: a tese que nega o efeito passa. O motivo do link da planta sem fonte deixou de dizer "fonte
  a obter".
- **B · artigo-modelo** (`lib/radar/article-blueprint.ts`, `lib/server/radar-article-blueprint.ts`,
  `lib/server/radar-article-blueprint-read.ts`, `modules/radar/radar-article-blueprint-panel.tsx`). A geração lê a
  página publicada com o leitor do export (só GET, até 10 s; sem ela, segue) e grava o mapa da atualização
  (`publishedMap`); regras novas no pedido (1ª seção responde à busca, cena que não se repete, ângulo como
  entrega concreta, nomes atuais); TODA afirmação absoluta vira nota; "Google Meu Negócio"/"Google My Business"
  viram "Perfil da Empresa no Google" na conferência e nas leituras; `rulesVersion` "2026-10-08" e o aviso na
  tela; parágrafos pela faixa de palavras ÷ palavras por parágrafo dos concorrentes.
- **C · CSV "Para escrever"** (`lib/radar/portable-writing-export.ts`, `lib/radar/competitor-topics.ts`,
  `radarArticleBlueprintColumns`). Voz pelo rótulo de entregável; o MAPA da atualização no lugar de "leve-a como
  pendência"; link externo sem fonte vira afirmação delimitada, sem link; a trava de fonte marca "(precisa de
  fonte: …)" e fecha a estrutura com a lista concluída; cabeçalhos dos concorrentes sem autopromoção, nome
  solto, loja e conteúdo datado; "Como superar" sem "costurar"; só a pergunta deste artigo fica para responder;
  sem o marcador "[RELATO DA MARCA — preencher]"; destino planejado como instrução condicional.
- **D · CSV de vídeo** (`lib/radar/portable-video-export.ts`). Corte só com utilidade de 1 ponto ou mais (até
  zero corte); a cena do corte pela ideia; H3 só é passo quando é ação; "Por que em lista" dita uma vez; o rótulo
  da voz compartilhado e a trava por sentido nas lâminas, ideias, gancho, premissa, capa e Apoio.
- **E · Redator e MCP** — ver `docs/07-redator/estado-atual.md` (2026-10-08). O catálogo
  (`lib/agent/platform-catalog.ts`, AGENTS §17.1) descreve as frentes B, C e D e a correção, sem as notas
  antigas que as contradiziam; `npm run test:agent` 65/65.

**Contratos novos (todos aditivos e opcionais; Verificado no código):**

- **Payload do artigo-modelo:** `blueprint.publishedMap?` (`{ current; section: number | null; reason;
  origin?: "ai" | "match" }[]` — `section` 1-based; só `null` explícito quer dizer "sai", e o que a IA omite ou
  numera errado é casado pelo título), `publishedStructure?` (`{ h1; h2[] }`, a página que a IA viu, sem FAQ
  legado, até 20 H2), `rulesVersion?` e `measures.plan.paragraphsMin?`/`paragraphsMax?`/`wordsPerParagraph?`.
  Nenhum leitor faz parse `.strict()` do payload (o Redator lê por caminho JSON): o payload antigo continua
  válido nos dois sentidos.
- **Geração:** `generateRadarArticleBlueprint` ganhou `readPublishedStructure?` (injetável; o padrão é o leitor
  do export `radarReadPublishedStructure`). A página é lida DEPOIS do reaproveitamento por `ifMissing`
  (reaproveitar não lê nem paga) e ANTES do brief; só artigo publicado com URL e ainda sem `currentStructure`;
  falha, tempo esgotado (10 s) ou página vazia seguem sem ela, e então o pedido sai igual ao de antes. `approve`
  e `edit` não leem a página; a edição renumera o `publishedMap`. A rota não mudou.
- **Leituras para export:** `readRadarArticleBlueprintsForExport` e `readApprovedRadarArticleBlueprints` aceitam
  `keywords?` por artigo e devolvem a planta com os nomes atuais (a keyword que traz o nome antigo o preserva).
- **Colunas:** `radarArticleBlueprintColumns` ganhou o 5º parâmetro opcional `RadarArticleBlueprintColumnsOptions`
  (`pendentes`, `comuns`, `currentH2`, `keywords`, `principal`).
- **Funções puras novas:** `radarSentenceNeedsSource`, `RADAR_BEHAVIOR_CLAIM_REASON` (pending-claims; `radarPendingClaims`
  aceita `p` null e `RadarPlatformClaimKind` ganhou "COMPORTAMENTO"); `radarBrandVoiceDeliverableLabel` e
  `radarBrandVoiceDeliverableStatusLabel` (brand-voice); `radarCurrentProductNames`,
  `radarArticleBlueprintWithCurrentNames`, `radarArticleBlueprintParagraphPlan`,
  `radarArticleBlueprintPublishedMapReading`/`Line`, `radarArticleBlueprintRepeatedScenes` e
  `radarArticleBlueprintRulesOutdated` (article-blueprint); `radarWritingSourceMark` (portable-writing-export);
  `radarCompetitorHeadingIsNoise` e `radarCompetitorBrandOf` (competitor-topics); `radarVideoH3IsAction` e
  `RADAR_VIDEO_ABSOLUTE_CLAIM_REASON` (portable-video-export); `RadarArticleBlueprintRulesNotice` (painel).
- **Única mudança de VALOR num campo que já existia:** `brandVoice.statusLabel` no MCP do Redator (item 10 da
  correção, abaixo).

**A correção da revisão (três revisores; cada achado conferido no código e, quando real, corrigido com teste
que falha sem a correção):**

1. **A régua travava orientação (must-fix).** O próximo passo REAL do artigo ("Acesse a página de SEO para
   clínicas e descubra como aparecer no Google quando o paciente procura") ia para "só entra com fonte" no
   Redator e na semente de roteiro e carrossel. Agora: "quando" não abre sujeito de comportamento (oração
   temporal é condição); quem abre com imperativo não afirma o que o público procura em "o que …"; quem orienta
   CONTRA ("Evite dizer que…", "Não prometa que…") não afirma o que manda evitar — só a causa que ele dá
   ("porque …", depois de ";") passa pela régua; o efeito no infinitivo depois de modal ou de "para" ("podem
   ampliar", "para ajudar") é possibilidade; o efeito COMERCIAL com mecanismo na frase é decidido pela
   polaridade ("O engajamento não garante pacientes" passa); a finalidade só trava com a plataforma (ou o
   pronome que a retoma, ou a frase que abre por ela) como sujeito ("Este guia foi pensado para…" passa); o
   público que só define o sujeito seguido de verbo normativo ("Quem procura um dentista quer saber…",
   "Pacientes que procuram tratamento merecem…") e "buscar/procurar + infinitivo" passam.
2. **A régua deixava passar efeito comercial (should-fix).** "poucos se tornam pacientes" (do próprio caso),
   "capta pacientes" (a legenda real do Respiro 3), "recebem mais pacientes" (só com quantificador), "fecham
   mais", "fecha a venda", "a agenda enche", "faz a agenda encher" e "dá mais alcance" travam, com a polaridade.
3. **O texto mais visível saía cru no CSV "Para escrever" (should-fix).** H1, alternativas, SEO title, meta
   description, próximo passo, ALT e legenda passam pela trava e entram na lista concluída — como a capa no
   vídeo e o `needsSource` no Redator.
4. **Mapa da atualização na planta antiga (must-fix).** Nenhum dos 9 H2 publicados casava (as raízes da
   complementar contavam como comuns) e os 9 iam "logo depois da abertura", antes da seção 1. Agora só a
   principal não distingue títulos; a complementar que a planta põe numa seção ("H2 da seção 2") leva para ela
   o H2 publicado que a contém; o H2 sem par fica depois da última seção absorvida — nunca antes da 1ª; sem
   nenhuma absorvida, depois da última seção da planta —; e "Medidas do plano" soma os H2 mantidos ("5 H2 (+ 8
   H2 da página publicada mantidos como seções próprias)"). No caso real: "Instagram não traz pacientes
   quando…" vira a seção 2, e os outros 8 ficam depois dela.
5. **O export protege a planta antiga (should-fix).** Até ela ser regerada, com instrução concluída: "Ordem de
   leitura" quando a busca é "como …" e a abertura ou a 1ª seção é diagnóstico (o primeiro parágrafo responde o
   caminho prático, apontando para a seção prática); "Cena repetida" quando duas imagens repetem sujeito e
   objeto ("ao gerar o Respiro 2, troque o sujeito ou o objeto"); o ângulo cita só evidência G, D ou O.
6. **Perguntas (must-fix e should-fix).** A pergunta que a planta usa como EVIDÊNCIA de uma seção (G1 "Como
   captar clientes pela internet?" na seção 5) não vai ao "Não cobrir" nem se repete; a pergunta que É a
   keyword de outro artigo ou tópico do Silo ("Como atrair clientes pelo WhatsApp?") vai a ele mesmo dividindo
   duas raízes — "Como captar clientes pelo Instagram?" continua deste artigo.
7. **CSV de vídeo (should-fix).** A frase absoluta (regra universal) sumia calada: agora entra na lista "Fica
   fora" com o motivo "regra universal sem fonte: fica fora do vídeo, também da fala" e na contagem do
   pode_gravar (continua fora do vídeo, como decidido em 2026-10-02). Sem corte de capítulo, o fato com fonte
   sai sem número ("Fora dos capítulos: …") e o prompt cita a exceção.
8. **Esperas antigas no entregável (should-fix, D10).** "SEO title: a definir" e "Meta description: a definir"
   viraram "escreva com cerca de …"; o especialista que responde outra coisa diz "use só como orientação geral,
   sem apresentá-la como resposta a essa pergunta" e "Aplicar em: onde couber no texto, como orientação"; as
   fontes citadas pelo mercado, "sem verificação no pacote (só como referência delimitada, nunca como fonte da
   afirmação)"; a transcrição, "cite só o que o vídeo confirma"; o público do vídeo sem definição, "quem busca
   …"; a seção do vídeo sem artigo-modelo, "a primeira seção prática do artigo". As varreduras D10 dos testes
   ganharam "a definir" e "conferir antes". Snapshot F4.4 renovado, com a prova: as cópias com só estas frases
   revertidas devolvem o snapshot anterior byte a byte.
9. **Texto da Skill de voz (decisão registrada).** A Skill real do dono manda "registrar a pendência fora do
   texto publicável" e fala em "preencher"; o CSV a transcreve como a Marca a escreveu. A varredura D10 é do
   texto que a PLATAFORMA escreve: o trecho transcrito da Skill fica de fora, e um teste com trechos iguais aos da
   Skill real prova a isenção. **Se o dono quiser o arquivo inteiro sem essas palavras, a mudança é na Skill, na
   Marca** (o Radar não reescreve a voz da marca).
10. **MCP (must-fix, D10).** `brandVoice.statusLabel` em `get_writer_foundations` e no pacote da IA interna, e a
    nota da voz no manifesto, diziam "em rascunho"/"aguardando aprovação". Agora dizem "ativa" ou "versão
    corrente" (o estado técnico continua em `status`). É a única mudança de valor de um campo do contrato MCP
    nesta rodada: nenhum código decide pelo texto do rótulo (conferido por grep), e o D10 do dono inclui o MCP.
11. **Catálogo MCP (should-fix).** As notas antigas que contradiziam o comportamento novo (um passo só, "';' ou
    H3 são passos", "com todos em 0 de 4 …", "confirmação e slug do Arquiteto como pendência", "para
    confirmar", "o estado vem dito") foram reescritas, e uma nota nova resume a correção da revisão.

**Limites declarados (Confirmado por teste onde dito; o resto, Ainda não verificado no uso real):**

- A régua é heurística por palavras: imperativo positivo com afirmação numa oração relativa ("Use stories, que
  o algoritmo prioriza") continua travando (é afirmação); a lista de imperativos é a de orientação comum;
  comportamento na voz passiva ("o conteúdo é consumido de passagem") e "Pacientes vindos da busca chegam com
  intenção" continuam fora; "O Instagram não foi feito para agendar consultas" trava (finalidade da plataforma
  vale nos dois sentidos, como o desenho pediu).
- O mapa da planta antiga continua conservador (nada sai sem decisão): os H2 sem par ficam como seções
  próprias, na ordem da página; o artigo pode sair mais longo que as medidas da SERP — a linha de medidas diz
  quantos H2 se somam. Regerar o artigo-modelo (pago) devolve a decisão à IA com a página lida.
- "Ordem de leitura" só vale para principal que começa com "como" e diagnóstico por "por que" ou negação no H2
  da 1ª seção; "Cena repetida" conhece 4 sujeitos e 3 objetos.
- No CSV de vídeo, a absoluta não volta à fala (decisão de 2026-10-02); H2 e H3 continuam sem passar pela
  porta (item antigo do backlog).
- "trate como tema sensível até o Radar resolver" (conflito YMYL no pode_escrever) continua; ver o backlog.
- **CSV de vídeo do caso real com zero corte (Confirmado por teste, `tests/radar-csv-video-2026-10-08.test.mts`).**
  O artigo-modelo antigo só tem M1 e nenhuma seção liga demanda, lacuna ou oportunidade por id: todas ficam em 0
  de 4 e, com o mínimo de 1 ponto (D1), a linha sai "nenhum corte nesta linha", com o motivo de cada capítulo.
  Regerar o artigo-modelo, com evidências P/G/D/O nas seções, devolve os pontos de utilidade.
- O classificador de H3 de ação (D3) lê a forma da primeira palavra: gerúndio ("Integrando canais…") e
  pergunta que não começa por "Como" contam como tópico; substantivo que também é imperativo (Ajuste, Teste,
  Controle, Escolha, Venda, Peça, Destaque, Filme) só conta como ação seguido de artigo ou possessivo; uma ação
  sozinha não vira demonstração (precisa de 2). "Vídeo × artigo" ainda escolhe a seção com entrega prática ou a
  primeira, não a primeira com demonstração.
- Ruído nos cabeçalhos (C5): conhece mês, "datas comemorativas" e "calendário do mês" (não "Natal" nem "Black
  Friday") e uma lista curta de termos de loja; a palavra solta só sai quando nenhuma outra página trata o tema.
  Perguntas (C7): a pergunta sem nenhuma raiz do núcleo continua (a investigação a ligou ao artigo).
- Nomes atuais (B4) conhecem só "Google Meu Negócio" e "Google My Business"; a nota de costura (B6) conhece só
  costurar/unir/juntar/combinar/misturar/integrar + temas/assuntos; o casamento de títulos pede 2 raízes em
  comum ou metade das raízes do H2 publicado, e só a família "Conclusão/Considerações finais" vai ao fechamento.
- As notas novas da conferência (B2, B3, B5, B6 e o mapa sem par) pedem ação antes de concluir: a passada de
  correção (1 chamada de IA a mais) tende a disparar com mais frequência. É o esperado pelo D10 — as notas
  ficam só no painel, nunca no entregável.

**Achados da revisão fechados depois da documentação (2026-10-08, Confirmado por teste):**

- **Nota B2 com qualquer "não".** A negação no H2 da 1ª seção só conta como diagnóstico quando o H2 não
  começa por "como", "o que fazer", "quando" ou "evite" (`lib/radar/article-blueprint.ts`, `diagnostico`):
  "Como não errar na bio do Instagram" deixou de disparar a passada de correção paga. Teste em
  `tests/radar-artigo-modelo-2026-10-08.test.mts` (B2).
- **Falsos positivos do ruído C5** (`lib/radar/competitor-topics.ts`): "marco" sem acento só conta como mês
  com contexto de data ("de/em março", "março 2026"); domínio de órgão (`.gov`, `.edu`, `.jus`, `.mil`,
  `.leg`, `.mp`, `.def`) não tem marca. Testes em `tests/radar-csv-escrever-2026-10-08.test.mts`. Palavra de
  dicionário como marca de domínio comercial continua sem tratamento (limite declarado).
- **Tempo da rota de geração.** A geração tem um prazo único de 280 s
  (`RADAR_ARTICLE_BLUEPRINT_ROUTE_BUDGET_MS`, 20 s de folga para gravar, `maxDuration = 300`): a nova
  tentativa e a passada de correção usam o que sobra (`radarArticleBlueprintCallTimeout`), e sem 30 s não
  são pedidas — a nova tentativa sobe como erro claro, a correção fica como nota no painel ("Passada de
  correção não pedida…"). Testes em `tests/radar-artigo-modelo-serp-ia-e-tela.test.mts` e
  `tests/radar-artigo-modelo-concluido.test.mts`. Tempo real da rota: Ainda não verificado.

**Arquivos alterados na rodada (A–E):**

- Radar: `lib/radar/brand-voice.ts` (A1), `lib/radar/pending-claims.ts` (A2), `lib/radar/article-blueprint.ts`
  (B e as colunas de C), `lib/server/radar-article-blueprint.ts` (B1), `lib/server/radar-article-blueprint-read.ts`
  (B4), `modules/radar/radar-article-blueprint-panel.tsx` (B7, B1 e B8; só tokens e classes que já existem, texto
  de 14px, sem botão novo), `lib/radar/portable-writing-export.ts` (C), `lib/radar/competitor-topics.ts` (C5),
  `lib/radar/portable-video-export.ts` (D; `lib/radar/video-competitive.ts` não mudou),
  `lib/radar/portable-annex-context.ts` (correção da revisão: a frase da transcrição).
- Fora do Radar, aditivos: `lib/server/radar-portable-export-core.ts` (uma linha: as keywords para os nomes
  atuais), os arquivos do Redator listados em `docs/07-redator/estado-atual.md` (2026-10-08) — entre eles o
  módulo NOVO `lib/redator/writer-blueprint-for-writing.ts` — e `lib/agent/platform-catalog.ts`.
- Testes novos (entram sozinhos em `npm run test:radar`; contagem ao documentar, todos verdes):
  `tests/radar-fonte-por-sentido.test.mts` (14), `tests/radar-artigo-modelo-2026-10-08.test.mts` (17),
  `tests/radar-csv-escrever-2026-10-08.test.mts` (24) e `tests/radar-csv-video-2026-10-08.test.mts` (8), com o
  caso real de 08/10 em fixture inventada e varredura D10 do arquivo inteiro. Ajustados, com comentário datado: `tests/radar-brand-voice.test.mts`,
  `tests/radar-csv-video-roteiro.test.mts`, `tests/radar-csv-video-competitivo.test.mts`,
  `tests/radar-portable-writing-export.test.mts`, `tests/radar-leitura-concorrentes.test.mts`,
  `tests/radar-artigo-modelo-serp.test.mts`, `tests/radar-csv-coerencia.test.mts`, `tests/radar-assunto-f4.test.mts`
  (snapshot F4.4 renovado duas vezes, cada uma com prova: as 26 linhas de C8 e C9 conferidas contra uma cópia de
  HEAD, Amazon e YouTube iguais; depois as frases do F8, por reversão byte a byte) e
  `tests/redator-artigo-modelo-e-voz.test.mts` (Redator, em `test:redator:mcp`).
- Sem migration: `radar_article_blueprints.payload` é `jsonb` e os campos novos vão dentro dele.

**Arquivos da correção:** `lib/radar/pending-claims.ts`, `lib/radar/article-blueprint.ts`,
`lib/radar/portable-writing-export.ts`, `lib/radar/portable-video-export.ts`,
`lib/radar/portable-annex-context.ts`, `lib/redator/writer-evidence-catalog.ts`,
`lib/server/writer-evidence-reader.ts`, `lib/redator/prompts.ts`, `lib/agent/platform-catalog.ts`; testes
`tests/radar-fonte-por-sentido.test.mts`, `tests/radar-csv-escrever-2026-10-08.test.mts`,
`tests/radar-csv-video-2026-10-08.test.mts`, `tests/radar-artigo-modelo-2026-10-08.test.mts`,
`tests/radar-csv-video-roteiro.test.mts`, `tests/radar-portable-writing-export.test.mts`,
`tests/radar-csv-coerencia.test.mts`, `tests/radar-assunto-f4.test.mts`,
`tests/redator-artigo-modelo-e-voz.test.mts`.

**Compartilhados e consumidores preservados:** `radarArticleBlueprintColumns` ganhou a opção aditiva
`principal`; `radarArticleBlueprintPublishedMapReading` mantém a assinatura (`keywords` com a principal
primeiro, como todos os chamadores já passam); `radarPlatformClaimKind`, `radarClaimGate` e
`radarSentenceNeedsSource` com as mesmas assinaturas (vídeo, CSV para escrever, saneador do artigo-modelo e
Redator); `colunaPrompt` do vídeo ganhou `fatoComFonte` opcional; `Capitulo.travadas[].absoluta` opcional;
`writerBrandVoiceStatusLabel` (rótulo de tela) continua exportado, e `writerBrandVoiceDeliverableStatusLabel` é
novo. Arquivos compartilhados tocados pela rodada (A–E): `lib/server/radar-portable-export-core.ts` (uma linha
aditiva: as keywords para os nomes atuais), `lib/server/writer-evidence-reader.ts`,
`lib/server/writer-seed.ts`, `lib/server/writer-evidence-sources.ts`. Da rodada (relatos das frentes,
conferidos por grep):

- `app/api/editorial/radar-article-blueprint/route.ts` intocada; `app/api/editorial/radar-export/route.ts` chama
  `radarPortableVideoExport` com a mesma assinatura; `radarPortableVideoExport`, `buildRadarVideoExportArticle`,
  `buildRadarVideoTopRow`, `buildRadarVideoBrandVoiceRow`, `radarVideoExportYoutubeOf` e `radarVideoPremise` com
  as mesmas assinaturas (só o texto das colunas mudou).
- `lib/radar/portable-writing-batch.ts` e `lib/server/radar-portable-export-core.ts` (tela e MCP
  `get_article_for_writing`): `buildRadarWritingExportArticle`, `buildRadarWritingTopRow` e
  `buildRadarWritingBrandVoiceRow` com a mesma assinatura; a planta chega normalizada pela leitura do servidor e
  a normalização defensiva do CSV devolve o MESMO objeto quando não há troca. O CSV de vídeo recebe a mesma
  planta normalizada, sem código próprio para os nomes.
- `radarBrandVoiceLabel` e `radarBrandVoiceStatusLabel` continuam, para as telas e para o pedido interno à IA do
  artigo-modelo; os CSVs deixaram de usá-los. `rotuloDaVoz` do vídeo saiu, trocado pelo helper de texto idêntico.
- `radarCompetitorTopics`, `radarCompetitorOutlinesOf`, `radarIsNavigationHeading`, `radarIsSiteIdentityHeading` e
  `radarCompetitorTopicLabel` com as mesmas assinaturas; o esqueleto do artigo-modelo recebe os temas sem ruído.
- `radarArticleBlueprintPayloadToStore` só tira approval, validation e origin: `publishedStructure` e
  `rulesVersion` vão ao banco. Os exports anteriores do painel do artigo-modelo continuam iguais.
- `radarPlatformClaimWithoutSource` com a mesma assinatura; dos casos de 2026-10-07, só "canais que convertem"
  mudou (passou a travar, como o desenho pediu), e o modal "podem ampliar" deixou de travar (correção da revisão).

**Testes e mutantes:** depois da correção da revisão, `npm run test:radar` 2.999 testes (2.998 pass, 0 fail, 1 skipped);
`npm run test:redator` 357/357; `npm run test:redator:mcp` 144/144; `npm run test:redator:dom` 19/19;
`tests/writer-evidence-*.test.mts` 103/103; `npm run test:agent` 65/65; `npm run test:editorial` 172 (168 pass,
4 fail pré-existentes em `tests/editorial-pipeline.test.mts`, fora da rodada); `npx tsc --noEmit` só com os 2
erros esperados de `.next/types` (rotas aposentadas do Planejador); eslint dos arquivos de código tocados sem
erro; `git diff --check` limpo. Bateria de 68 mutantes da correção, em cópias no scratchpad com carregador de
redirecionamento (o repositório nunca foi mutado): 68 de 68 mortos, os 6 controles verdes (detector 24,
colunas e mapa 18, CSV para escrever 11, CSV de vídeo 9, anexo 1, Redator 5). As frentes A–E tinham rodado as
delas: 19, 36, 67, 34 e 36 mutantes, todos mortos. Contagens de `test:radar`, `test:redator`,
`test:redator:mcp` e `test:agent` conferidas de novo ao documentar (iguais às acima).

**O que o dono precisa fazer (nada disto foi feito pelo agente):**

1. **Regerar os artigos-modelo anteriores às regras de 2026-10-08** — "Organizar de novo (IA)" no painel do
   artigo-modelo, no Radar: 1 chamada de IA, mais 1 quando a conferência pede a passada de correção. O painel
   avisa: a versão sem `rulesVersion` "2026-10-08" mostra "Esta versão foi montada com regras anteriores às
   atuais (2026-10-08) …" (`RadarArticleBlueprintRulesNotice`, sem botão novo). Nada regera sozinho: o
   encadeamento ao finalizar usa `ifMissing` e reaproveita a versão do mesmo pacote, para não pagar IA. Até
   regerar, o export protege a planta antiga (mapa por casamento de títulos, "Ordem de leitura", "Cena
   repetida", ângulo só com G/D/O, nomes atuais, trava de fonte), mas só a planta nova traz o mapa decidido
   pela IA com a página lida, a 1ª seção prática, o ângulo como entrega concreta e as evidências por seção que
   dão corte ao vídeo. Começar pelos publicados (são atualização), a partir de `instagram-nao-traz-pacientes`.
2. **Decidir a ordem de publicação dos destinos planejados.** O link interno para destino ainda não publicado
   sai como instrução condicional e concluída: entra com a URL final quando o destino estiver no ar junto com
   o artigo ou antes; se o artigo for ao ar primeiro, a âncora fica como texto simples, sem link (nunca link
   quebrado; o caminho planejado não vira endereço). Publicar antes o Pilar e os destinos que o artigo cita
   evita reabrir o artigo depois; esta rodada não cria nada que acrescente o link sozinho quando o destino for
   publicado mais tarde.
3. **Homologar** (MANUAL_UI_VALIDATED = NO): reexportar os dois CSVs do artigo `instagram-nao-traz-pacientes`
   pela tela e ler na planilha; conferir a tela do artigo-modelo (aviso, bloco "Página publicada → planta",
   célula "Parágrafos") em 360/768/1024/1440 px, claro e escuro; e, pelo MCP, `get_writer_foundations` (ver
   `docs/07-redator/backlog.md`). Lista do que conferir em `docs/05-radar/backlog.md` (2026-10-08).
4. **Decidir o texto da Skill de voz** (item 9 da correção): ajustar na Marca, se quiser o arquivo inteiro sem
   "pendência"/"preencher".
5. **Entregar:** commit, push e deploy são do dono. O módulo novo `lib/redator/writer-blueprint-for-writing.ts`
   (importado por `lib/server/writer-evidence-reader.ts` e `lib/server/writer-seed.ts`) e os quatro testes novos
   ainda não são rastreados pelo git: vão no mesmo commit que o resto da rodada. Sem migration.

## Revisão do CSV de vídeo competitivo (três revisores) — 2026-10-07

**Verificado no código e confirmado por teste (fixtures; PROVIDER_CALLS = 0); `MANUAL_UI_VALIDATED = NO`
(a reexportação real e a leitura na planilha são do dono).** Módulo proprietário: Radar. Três revisores leram a
entrega das duas seções abaixo (honestidade e D10; dados competitivos e a leitura nova; testes e usabilidade).
Cada achado foi conferido no código com cenário e, quando real, corrigido com um teste que falha sem a correção
(mutantes só em cópias no scratchpad: 28 de 28 morrem, controle verde). Nada de coleta nova, schema, rota, núcleo
do export, contrato do cache, `article-blueprint.ts`, `portable-writing-export.ts` nem `brand-voice.ts`: o CSV
"Para escrever" não muda.

**Achados reais e o que mudou:**

1. **A tese do dono era travada (must-fix).** A porta (`radarClaimGate`) casava só raízes: "Mostrar por que o
   Instagram, sozinho, não enche a agenda" e "(sem cair na ilusão de que ele enche a agenda)" saíam do texto
   publicável como se repetissem "O Instagram enche a agenda da clínica" — que o mercado repete e a FONTE
   contradiz. Agora a porta olha a polaridade nas afirmações do mercado ((b) e (c)): a frase que nega não
   reproduz e fica livre; a que repete trava. O link externo da planta (a) trava nos dois sentidos. A afirmação
   que a fonte contradiz sai da régua (b) e é dita uma vez, em (c), com o motivo certo. Limite declarado:
   negação que não toca a afirmação ("enche a agenda, não importa o nicho") também libera.
2. **"aguardando aprovação"/"em rascunho" no CSV de vídeo (must-fix, D10).** O rótulo da Skill de voz vinha
   com o estado de tela da Marca. No CSV de vídeo, a versão em uso é dita "versão corrente na Marca" (a ativa
   continua "ativa"), nas linhas Marca e Voz da marca e na origem do público. `brand-voice.ts` e o CSV para
   escrever não mudam (o teste de lá continua fixando "em rascunho").
3. **Roteiro e cortes cortados no teto da célula (must-fix).** Com frases ~35% maiores que as do teste 30,
   `diretrizes_de_roteiro` perdia o capítulo 6, o Fechamento com o CTA, a Descrição, o "Vídeo × artigo" e o "Não
   inventar"; `cortes_para_redes` perdia o meio da lista "Fica fora". As duas colunas encolhem por níveis
   (`NIVEIS_DO_ROTEIRO`, `NIVEIS_DOS_CORTES`, escolhidos por `primeiraQueCabe`): o Entregar deixa de repetir a
   pergunta, as frases encurtam (sem cortar a fonte do fim), o Mostrar vira a cena curta, e no último nível o
   capítulo fica com título, pergunta, Entregar e Mostrar; nos cortes, ideia, cena, visual e as frases da lista
   encurtam, e no último nível o alinhamento sai. Cada coluna diz que encolheu e onde está o resto. Medido: o
   pior caso da planta (resposta e três explicações longas e travadas, dois links por seção) e o teste 30 com as
   frases maiores saem sem corte; com o acréscimo maior medido, roteiro 9.907 e cortes 9.875 de 10.000.
4. **"sem dado de concorrência" ao lado da coluna que tem o dado (should-fix, três revisores).** A abertura de
   `cortes_para_redes` lia os Shorts da fotografia (amostra inteira, com outro público na mediana). Agora conta só
   os Shorts pertinentes ("Shorts do tema nesta amostra (pertinentes): N de M · duração mediana") e aponta para
   `concorrencia_curtos_e_carrossel` quando ela tem a concorrência do curto; "sem dado de concorrência" só quando
   não tem. Sem a corrida, a amostra inteira, dita.
5. **Detector da regra 17 (should-fix).** Pega a plataforma como sujeito de ordenar, entregar ou punir ("O
   Instagram prioriza…", "penaliza…", "mostra … primeiro para quem…"), "têm mais alcance" e "o alcance caiu"; não
   trava preço nem recurso sem plataforma na frase; "converte visitantes em agendamentos" sai com o motivo
   "afirmação sobre conversão do público sem fonte (regra 17 da planta)". "O Instagram mostra os bastidores da
   clínica" continua livre (uso da plataforma, não afirmação sobre ela).
6. **Capa com texto de produção (should-fix).** Com o H1 travado, a Lâmina 1 caía para a premissa ("O vídeo
   responde … com o que a pesquisa sustenta"). A reserva agora é a pergunta da abertura da planta, que passa pela
   mesma porta; o storyboard usa a mesma capa.
7. **Corte com ideia de três táticas e cena de uma (should-fix, D10).** O alinhamento pedia "ficar no primeiro
   passo" e a cena do storyboard desmentia. Quando a ideia única nomeia 2+ passos (`passosDaIdeia`, pela raiz
   própria de cada passo), o corte MOSTRA esses passos, uma tela rápida cada — Utilidade, Mostrar, Alinhamento,
   Origem e storyboard dizem o mesmo. Verbo de uso comum ("serve", "usar", "traz") não é assunto do alinhamento.
8. **Faixa errada na cadeia (should-fix).** Com os pertinentes liderados por Shorts e a sequência longa, a cadeia
   dizia "vídeo longo, faixa 25s a 45s". Agora a faixa é a do formato que a sequência segue (longos ou Shorts
   pertinentes, `radarVideoCohortRange`, aditivo em `video-competitive.ts`), e a liderança do outro formato é dita.
9. **Divergência que era do classificador (should-fix).** O formato dos pertinentes (classificador de hoje) era
   comparado com o formato gravado na fotografia (classificador da época). Agora é comparado com a amostra
   inteira pela mesma régua; sem ninguém fora da conta, não há divergência de formato. A duração continua
   comparada com a fotografia, que é o que a sequência segue.
10. **Lentes extras sem data (should-fix).** O orgânico das três lentes extras vem do resumo do cache no momento
    da exportação. A coluna ganhou a linha "Lentes extras no orgânico: resumo do cache da marca …, observação fora
    do pacote congelado (congelado em …) — <lentes>: coleta de <data>, posterior/anterior ao congelamento"
    (`collectedAt` aditivo em `RadarVideoLensOrganic`, de `hit.meta`).
11. **Partes da trava e do caminho da rota sem teste (should-fix).** As coletas (b) e (c), o portão "pergunta
    travada não abre corte", a pergunta travada na lista "Fica fora", "outro público" fora da conta, o lote
    repassando `lensDigests` e `lentesCongeladas` e o núcleo entregando o resumo a cada artigo ganharam teste.
12. **Notas corrigidas (triviais):** empate dito como empate ("empatada com os escolhidos; ficou fora pela
    distribuição ao longo do vídeo"), também na cadeia; cabeçalho dos cortes quando todos estão em 0 de 4;
    "o Google não o marca como curto", "imagem de uma página do instagram.com" e "nas lentes lidas" na coluna de
    curtos; D10 nas frases de espera que existiam antes — a lacuna de formato do YouTube ("confira se a coleta…",
    só no CSV; a tela mantém), o especialista único ("confirme antes de gravar") e o estado do trecho da
    biblioteca ("falta conferir…"); a linha de topo aponta apresentador e identidade visual para
    `storyboard_visual`; o prompt pede a oportunidade de `cadeia_competitiva` em cada capítulo; a capa do
    storyboard diz "para diferenciar" quando pergunta e número são raros nos pertinentes; o catálogo dos agentes
    não diz mais que a ideia única tem um passo só.

**Ficaram no backlog (notas não triviais):** H2/H3 publicados no carrossel e na tela do corte sem passar pela
porta; o piso GERAL para os curtos que o Google mostra (falso "fora do tema"); a frase de alinhamento "ajuste a
cena na produção" quando a demonstração não nomeia o assunto do gancho.

**Arquivos:** `lib/radar/pending-claims.ts`, `lib/radar/portable-video-export.ts`, `lib/radar/video-competitive.ts`
(aditivo: `radarVideoCohortRange`, `collectedAt`), `lib/agent/platform-catalog.ts` (entrada nova datada e dois
trechos corrigidos; `npm run test:agent` verde), `tests/radar-csv-video-roteiro.test.mts` (25, 25b, 25c, 26, 27,
29 e 23 ajustados com comentário datado; 31, 32 e 33 novos), `tests/radar-csv-video-competitivo.test.mts` (três
testes novos e o "D10 e teto" e o estrutural ampliados). Consumidores preservados: o CSV para escrever, o
Redator, o MCP `get_article_for_writing` e a tela (o blueprint do YouTube e a frase da lacuna dele não mudam).

**Testes:** `npm run test:radar` 2934 testes, 2933 pass, 0 fail, 1 skipped (pré-existente; a base desta rodada era
2928/2927/0/1, +6 testes novos); os três arquivos do CSV de vídeo 66/66; `tests/radar-brand-voice.test.mts` verde;
`npm run test:agent` 65/65; `tsc --noEmit` só com os 2 erros pré-existentes de `.next/types/validator.ts`
(planejador removido); eslint dos três módulos limpo; `git diff --check` limpo. Mutantes (cópias no scratchpad,
`rev2-mutantes.cjs`): 28 de 28 morrem com o controle verde. Regeneração do caso real (`rev2-regen.mts`, a linha
equivalente ao CSV do dono): zero "pendência", "pendente de", "aguardando", "confira antes de aprovar" e
"rascunho", com a Skill ativa e aguardando aprovação. **Limites:** as regras de polaridade e do detector leem palavras, não sentido;
o encolhimento mantém tudo, mas a frase encurtada só está inteira na planta (CSV para escrever) e na lista "Fica
fora"; nenhuma validação manual.

## Conteúdos derivados competitivos no CSV de vídeo, Parte 1 (concorrência curta e carrossel, storyboard, cadeia, o que foi assistido) — 2026-10-07

**Verificado no código e confirmado por teste (fixtures reais; PROVIDER_CALLS = 0); `MANUAL_UI_VALIDATED = NO`
(a reexportação real e a leitura na planilha são do dono).** Pedido do dono: "a ideia de poder criar conteúdos
derivados do assunto é para utilizar a SERP para fazer desses conteúdos competitivos, incluindo os dados de
estilos de imagem que podem ser utilizados para os storyboard; eles podem ser fundamento dos vídeos e dos
carrosséis. Precisa caprichar na pesquisa competitiva." Itens 6, 2, 8, 7 e 9 da Parte 1 do desenho, nesta ordem,
sobre a entrega dos itens 5, 1, 4 e 3 (seção abaixo). Módulo proprietário: Radar. Três colunas novas no CSV de
vídeo, entre `cortes_para_redes` e `prompt` (as linhas "Marca" e "Voz da marca" as deixam vazias):

1. **`concorrencia_curtos_e_carrossel` (item 6)** — os curtos e vídeos que o Google mostra na lente da investigação
   (`snapshot.serpFeatures.videos`, leitura zero): sem repetição (no fixture real, os 3 do bloco de vídeos
   repetem o de curtos), título sem a moldura do Google, autor só do campo `source`, duração só quando o título
   termina em m:ss, relevância pela MESMA régua da lista do topo e o cruzamento com a pesquisa do YouTube; o
   vídeo comum do bloco de vídeos é listado e fica fora da amostra de curtos. Os Shorts da pesquisa do YouTube
   pertinentes, com o motivo do zero (`radarYoutubeShortsNotice`, campo aditivo `shortsNotice` em
   `RadarVideoExportYoutube`: "o YouTube não marcou" × "a leitura perdeu"; corrida antiga: não atribuído). A
   presença dos blocos por lente (cópia das lentes congelada no pacote, `lentesCongeladas` aditivo; sem ela, a
   lente da investigação). As redes sociais no orgânico das quatro lentes (canônica pelo snapshot, as três extras
   pelo resumo do cache): Reel, post, carrossel CONFIRMADO só com `img_index` na URL, vídeo do TikTok, Short e
   artigo/post do LinkedIn; perfil fora da conta; a mesma peça em duas lentes é uma. A leitura da amostra
   pertinente de curtos (duração mediana e metade central, plataformas, credencial no nome por lista fechada,
   padrões de título), a duração-alvo dos cortes (P75; abaixo de 4 diz que descreve casos; sem duração, a régua
   de 60 segundos) e os carrosséis e posts que ranqueiam, para abrir e anotar. Nada sobre retenção ou alcance.
2. **`cadeia_competitiva` (item 2)** — referência → observação → oportunidade → entrega → formato do vídeo
   inteiro (os pertinentes mais bem posicionados, o que atravessa Google e YouTube por `radarCrossSerpVideoSignal`,
   padrões e faixa pertinentes, lacunas do YouTube — sem a de formato ausente, que é limite da amostra — e a
   premissa) e de cada capítulo da planta, pelos ids que a seção cita (`evidence` e `from`), com o MESMO rótulo do
   CSV para escrever (`rotuloDaEvidencia` e `origemDaSecao` passaram a ser exportados de `article-blueprint.ts`;
   aditivo, §4: o CSV para escrever e o Redator continuam iguais). As páginas de uma lacuna, diferencial ou
   pergunta só ligam por igualdade exata do rótulo com a leitura do Google (`gaps`, `differentiations`,
   `questions`); sem casar, "não ligadas". Seção sem evidência nem origem: "proposta editorial", e a disputa é
   pela execução. O formato de cada capítulo diz o MESMO corte da coluna de cortes (a escolha saiu de
   `colunaCortes` para `escolhaDosCortes`, sem mudar de comportamento). Sem planta, a cadeia por capítulo é dita
   ausente e `perguntas_do_publico` passa a dizer a origem de cada pergunta (Pessoas também perguntam, N de M
   páginas, necessidade central com a recorrência, pergunta a responder pela descoberta).
3. **`storyboard_visual` (item 8)** — estilo observado SÓ com o que se afirma sem ver imagem (o Radar não vê
   imagem: domínio das imagens do bloco do Google, rotulado como inferência, e em quantas lentes ele aparece;
   sinais dos títulos dos vídeos longos pertinentes — caixa alta, número, pergunta, emoji, credencial —, "a
   thumbnail não foi vista"; credencial dos autores dos curtos; presença de imagem, lista e tabela e a mediana de
   imagens das páginas concorrentes). Referências para abrir (thumbnails, curtos, posts), o checklist para quem
   abrir anotar, a identidade visual que a Marca não guarda (definir antes de produzir), o storyboard do vídeo
   (uma cena por capítulo = a demonstração da planta, com a referência observada da mesma pergunta quando o
   título divide 2+ raízes distintivas), da thumbnail (rosto só de quem fala de fato, da aba Especialista), dos
   cortes (vertical, os mesmos da coluna de cortes) e do carrossel (que leva texto na imagem: a regra "sem texto
   legível" do plano visual do artigo é dita como a que NÃO vale lá). Nenhum adjetivo de estilo (teste negativo).
4. **O que foi assistido (item 7)** — o vídeo do topo cujo endereço é o de um vídeo selecionado pela marca COM
   transcrição é dito pelo número da lista ("seleção da marca, não da pesquisa"; o trecho está em
   `biblioteca_da_marca`); os outros seguem não assistidos. Sem cruzamento, a frase de antes.
5. **Prompt e catálogo (item 9)** — o corte pede a cena de `storyboard_visual` e a duração-alvo de
   `concorrencia_curtos_e_carrossel`; o carrossel, o visual de `storyboard_visual`; estilo de imagem só o
   observado ou anotado. `lib/agent/platform-catalog.ts` na mesma entrega (§17.1).
6. **A leitura nova, grátis** — o resumo orgânico (`digest`) das três lentes extras da keyword principal, lido
   do cache por `lib/server/radar-video-lens-digest-read.ts` (`lookupSerpCache`, modo `digest`, colunas
   explícitas e filtro pela marca no store), UMA vez por lote, com os pedidos que a leitura das lentes já montou
   (nenhuma leitura de alvo a mais), só quando `assembleRadarPortableExport` recebe `videoLensDigests` — que só
   a rota no modo vídeo liga. O CSV para escrever, o formato completo e o `get_article_for_writing` do MCP não a
   fazem. Falhou, a coluna diz; nenhuma escrita; o contrato do cache (Minerador) não mudou.
7. **As células encolhem por igual** — `cadeia_competitiva` e `storyboard_visual` têm níveis (menos itens e
   endereços por elo; referências e visual das lâminas apontando para as outras colunas) e dizem quando
   encolheram, em vez de o corte da célula levar os últimos capítulos.

D10: nenhuma das saídas novas diz pendência, "pendente de", "aguardando" nem "confira antes de aprovar" (teste
que varre o CSV inteiro com as colunas novas). Decisões mantidas: a tese do dono não é censurada; só a frase SEM
FONTE sobre plataforma sai do publicável (trava da entrega anterior, intocada); `RADAR_ABSOLUTE_CLAIM` igual; o
CSV para escrever igual (os testes dele seguem verdes); nada de adjetivo de estilo sem ver a imagem; nada
afirmado sobre o que é dito dentro de vídeo não transcrito.

Arquivos: novos `lib/server/radar-video-lens-digest-read.ts` e `tests/radar-csv-video-competitivo.test.mts`;
alterados `lib/radar/portable-video-export.ts`, `lib/radar/video-competitive.ts` (curtos, peça social,
credencial, sinais de título, pedidos e leitura do resumo), `lib/radar/portable-export-batch.ts` (campo aditivo
`lensDigests`), `lib/radar/article-blueprint.ts` (só `export` em duas funções), `lib/server/radar-portable-export-core.ts`
(flag aditiva `videoLensDigests`), `app/api/editorial/radar-export/route.ts` (liga a flag no modo vídeo),
`lib/agent/platform-catalog.ts`, `tests/radar-csv-video-roteiro.test.mts` (o prompt do teste 20). Consumidores
preservados: a rota (único consumidor do CSV de vídeo); o CSV para escrever e o MCP (sem a flag, nada muda);
`radarPortableVideoExport` (campos opcionais nos artigos); os guardas "uma leitura do cache" do núcleo seguem
valendo para a leitura de `observation` (o resumo mora no leitor próprio e tem guarda própria).

Testes: `tests/radar-csv-video-competitivo.test.mts` (14, fixtures reais de skin care noturno no Google e no
YouTube e o cache real das lentes da AdalbaPro, com o carrossel `img_index=3`), roteiro 35/35 e export 11/11;
test:radar 2928 (2927 pass, 1 skip pré-existente; base de hoje 2914), test:agent 65/65, tsc sem erro de fonte
(só os 2 pré-existentes de `.next/types`), eslint 0 erro, `git diff --check` limpo. Treze mutantes em cópias no
scratchpad (post vira carrossel sem img_index, curtos sem dedupe, cadeia ligando por semelhança, cadeia citando
evidência que a seção não cita, leitura nova ligada em todo modo, sem o cruzamento do item 7, sem o motivo do
zero de Shorts, vídeo comum na amostra de curtos, adjetivo de estilo, storyboard e cadeia sem encolher, perfil
na conta, curto fora do tema na conta dos pertinentes) — todos morrem, com o controle verde (60/60). Maior caso
medido (seis capítulos com evidência cheia, nove curtos, trinta posts): concorrência 5.410, storyboard 8.380,
cadeia 9.859 caracteres; o caso extremo encolhe (storyboard 9.334, cadeia 8.335) sem corte no teto de 10 mil.

Limites declarados: a relevância dos curtos é a régua do topo, pelo título e pelo autor — o curto cujo título não
repete as raízes da busca ("SKINCARE NOITE" para "skin care noturno") sai "fora do tema"; a duração só existe
quando o título a traz; o cache não diz quantas lâminas tem um carrossel nem o visual; as lentes extras só têm
o orgânico (os blocos de vídeo e imagem delas são só presença); a canônica pode não ter `short_videos` abaixo do
10º orgânico (o snapshot corta ali). A Parte 2 (coleta nova) segue como decisão do dono, no backlog.

## Pesquisa competitiva no CSV de vídeo, Parte 1 (trava de fonte, pertinentes, demonstração, cortes por utilidade) — 2026-10-07

**Verificado no código e confirmado por teste (fixtures; PROVIDER_CALLS = 0; nenhuma leitura nova de banco);
`MANUAL_UI_VALIDATED = NO` (a reexportação real e a leitura na planilha são do dono).** Pedido do dono: "a ideia
de poder criar conteúdos derivados do assunto é para utilizar a SERP para fazer desses conteúdos competitivos …
precisa caprichar na pesquisa competitiva". Desenho: itens 5, 1, 4 e 3 da Parte 1 (sem coleta nova), nesta ordem,
mais a correção D10 do "Entregar". Módulo proprietário: Radar. O CSV "Para escrever" não mudou (os testes dele
seguem verdes); o contrato do cache, a rota e o núcleo do export não foram tocados.

1. **Trava de fonte em todo texto publicável (item 5)** — módulo novo `lib/radar/pending-claims.ts`:
   `radarPendingClaims(p, planta)` junta (a) TODOS os links externos da planta (até 2 por seção; `source` nulo =
   fonte a obter, `X` = fonte do pacote com URL), (b) `radarWritingUnsupportedClaims` (usada como está) e (c)
   `marketVsFactConflicts`; `radarClaimGate(frase, pendentes, secao)` trava por raízes distintivas (mesma seção:
   2+; outra seção ou mercado: 60% da afirmação, 2+), com a afirmação da própria seção primeiro, e (d) um detector
   da regra 17 da planta (mecanismo de plataforma E efeito afirmado — "Hashtags e geolocalização ajudam…", "Um
   site otimizado converte visitantes…"; a recomendação que só nomeia o recurso passa). Ponto único de aplicação
   em `capitulosDaPlanta` (`lib/radar/portable-video-export.ts`): a frase travada sai do Apoio da lâmina e da
   Ideia única do corte; na produção vai para a linha "Fala delimitada, sem fonte:" (sem o rótulo "o que a
   pesquisa sustenta"); a mesma porta vale para a premissa, a capa (H1) e a promessa do gancho
   (`aberturaPublicavel`). `cortes_para_redes` termina com "Fica fora do texto publicável" (regra concluída, uma
   linha por lugar, com o motivo) e o `pode_gravar` conta as frases. Com fonte do pacote, a frase fica e leva
   "(fonte: url)". A tese de quem fala (premissa, capa, fala E1) passa; `RADAR_ABSOLUTE_CLAIM` não mudou.
2. **Estatísticas só com os pertinentes (item 1)** — módulo novo `lib/radar/video-competitive.ts` recebe a régua
   de relevância (movida sem mudar de comportamento, assinatura relaxada para título e canal) e
   `radarVideoPertinentSample`: formato, duração, faixa (P25–P75 da coorte que lidera, a régua de
   `faixaRecomendada` replicada) e formato recomendado saem só de MESMO/PRÓXIMO/GERAL, lidos do universo inteiro;
   "Fora da conta" diz quantos por motivo; ressalva abaixo de 4; a divergência com a fotografia é DITA, não
   aplicada (a decisão de formato curto continua lida da fotografia); sem a corrida referenciada, "não
   recalculável". A frase "…mas entram nas estatísticas" saiu.
3. **Demonstração definida pela planta (item 4)** — "antes → ajuste → depois" é UMA demonstração (com 2 partes, o
   depois é dito "não descrito na planta"), ";" ou 2+ H3 são passos, sem separador é uma ação, sem nada é
   capítulo explicativo (não vira corte). O objeto é o termo da seção que a entrega prática ou os H3 nomeiam
   (sem termo nomeado, a linha não inventa objeto). Mesma régua no "Mostrar na tela", no "Mostrar" do corte e no
   "Visual" da lâmina; a regra das cenas (regras 9 e 17: sem métrica, ranking nem resultado fictício como prova;
   nunca antes e depois de paciente ou de resultado) vem UMA vez por coluna.
4. **Cortes pela utilidade isolada (item 3)** — portões (pergunta e frase publicável livres da trava;
   demonstração definida) e pontuação 0–4 (demanda pelos ids P/B da seção — PAA, "N de M páginas" com 2+,
   necessidade central forte/moderada — ou a pergunta de uma peça SHORT congelada, campo aditivo
   `shortQuestions` em `RadarVideoExportYoutube`; uma ação; lacuna/diferencial/oportunidade G/D/O). Até 3, menos
   quando faltam elegíveis; empate pela dispersão de antes. Cada corte diz a utilidade, o alinhamento entre
   gancho, ideia e demonstração (o caso do CSV real — ideia com três táticas, cena com uma — vira a instrução de
   ficar no passo mostrado) e a "Origem recomendada" com o motivo; "Capítulos sem corte" diz por quê. A linha
   "Fonte" do corte leva só o link com fonte do pacote (o pendente está na lista "Fica fora").
5. **D10** — o "Entregar" sem frase aproveitável deixou de dizer "PENDÊNCIA: …": agora "abra pela pergunta … e
   responda só com o que esta linha sustenta, em fala delimitada (sem regra universal nem afirmação sem fonte)";
   o especialista com pareceres não aceitos deixou de dizer "aguardando aceite" ("ficam fora desta linha"). Teste
   que varre o CSV INTEIRO por pendência/"pendente de"/"aguardando"/"confira antes de aprovar".
6. **Prompt e catálogo**: o prompt pede "os cortes desta linha (até 3, escolhidos por utilidade)" e manda a frase
   da lista "Fica fora" não voltar em lâmina nem legenda; `lib/agent/platform-catalog.ts` atualizado na mesma
   entrega (§17.1; test:agent 65/65).

Arquivos: novos `lib/radar/pending-claims.ts` e `lib/radar/video-competitive.ts`; alterados
`lib/radar/portable-video-export.ts`, `lib/agent/platform-catalog.ts`, `tests/radar-csv-video-roteiro.test.mts`,
`tests/radar-portable-video-export.test.mts`. Consumidores preservados: a rota `app/api/editorial/radar-export`
(único consumidor do CSV de vídeo; assinatura de `radarPortableVideoExport` igual), `radarVideoPremise` (segundo
parâmetro opcional), `RadarVideoExportYoutube` (campo opcional). Testes: test:radar 2914 (2913 pass, 1 skip
pré-existente; base 2904), roteiro 35/35 + export 11/11, test:agent 65/65, tsc sem erro de fonte, eslint 0 erro.
Sete mutantes em cópias no scratchpad (porta desligada, sem regra 17, sem filtro de pertinência, dispersão pura,
portão de demonstração aberto, "A → B → C" como três passos, PENDÊNCIA de volta) — todos morrem, com o controle
verde. Prova por regeneração da linha equivalente ao CSV real: a Lâmina 2 sai com "A atenção no feed é
passageira." e "O algoritmo prioriza…" vai para "Fica fora"; 11 de 44 fora do tema e 4 de outro público saem da
mediana (fotografia 13min39s → pertinentes 11min39s); o corte do capítulo 4 ganha o alinhamento.

Limites declarados: o detector (d) pode dar falso positivo (só tira do publicável e lista; não apaga); afirmação
sobre comportamento do público sem link externo ("consumido de passagem") não é pega; a relevância é lida pelo
título e pelo canal (pode errar). Fora desta entrega: itens 6, 2, 8 e 7 do desenho (colunas novas de concorrência
curta, cadeia competitiva e storyboard; transcrição da biblioteca) e toda a Parte 2 (coleta nova: decisão do
dono). O rótulo "aguardando aprovação" do estado da Skill de voz (`lib/radar/brand-voice.ts`, compartilhado com o
CSV "Para escrever") não foi mexido (revisão do mesmo dia: o CSV de vídeo passou a dizer "versão corrente na
Marca"; `brand-voice.ts` e o CSV para escrever seguem iguais).

## Passada de revisão da importação por silo (três revisores) — 2026-10-07

**Verificado no código e confirmado por teste (os 4 testes novos falharam antes das correções e passam depois);
`MANUAL_UI_VALIDATED = NO` (a homologação do dono descrita no backlog continua valendo, agora com a precedência
nova).** Dois should-fix confirmados e corrigidos, três notas triviais fechadas; o resto foi ao backlog:

- **siloId DECLARADO vem primeiro no MÓDULO (should-fix confirmado; ligação da tela bloqueada por invariante)**:
  a chave do grupo em `lib/radar/import-silo-groups.ts` agora aceita `siloId?: string | null` na linha e o
  resolve PRIMEIRO, com a precedência da resolução real (`resolveCanonicalSiloForArticle`,
  `lib/arquiteto/radar-handoff-context.ts`): declarado (quando há SiloDNA correspondente) → composição →
  território → "Sem silo". O cenário confirmado: artigo presente na composição de dois silos aparecia no
  diálogo sob o mais recente, mas a importação grava `RadarItem.siloId` = declarado e o CSV por silo sai no
  outro arquivo. A TELA, porém, NÃO repassa o declarado: o invariante do Arquiteto "a tela Radar não usa
  payload.siloId como autoridade" (`tests/arquiteto-radar-handoff-context.test.mts`) proíbe `payload.siloId`
  em `radar-page.tsx`, e relaxar um guarda confirmado de outro módulo é decisão de contrato do dono — a ponta
  que falta está no backlog. Enquanto isso o contrato declarado-primeiro fica pronto e testado no módulo puro,
  e a prévia da tela segue por composição → território (diverge do CSV só no estado degenerado descrito).
- **"Silo sem nome N" anda com o contador do export (should-fix confirmado)**: no export, todo silo cujo nome
  LIMPA para vazio ("!!!", só emoji) consome um N (`numeroSemNome`, `portable-silo-export.ts`) mesmo mantendo o
  name como rótulo; o módulo da importação só incrementava quando o name faltava, então com um silo "!!!" antes,
  o diálogo dizia "Silo sem nome 1" e o arquivo dizia "Silo sem nome 2" para o MESMO silo. Agora o módulo usa
  `radarSiloExportCleanName` (exportada pelo export) com o mesmo critério de consumo.
- **Grafia unificada (nota)**: `RADAR_IMPORT_NO_SILO_LABEL` passou de "Sem Silo" para **"Sem silo"**, a grafia
  do arquivo do export — as duas pontas do fluxo mostram o mesmo texto.
- **aria-label por grupo (nota)**: o checkbox "Selecionar o silo inteiro" tem texto visível igual em todos os
  cabeçalhos; agora leva `aria-label="Selecionar o silo {nome} inteiro"` (`workflow-status.tsx`, aditivo, sem
  mudança visual) para o leitor de tela distinguir os grupos.
- **Âncora estrutural da ligação (nota)**: a junção módulo puro → reordenação → `groupOf` no Radar não tinha
  guarda; teste estrutural novo em `tests/radar-import-dialog-silo-dom.test.mts` (comentários removidos antes do
  match) exige `radarImportSiloGroups({`, `articleId: version.payload.articleId`, `orderedRowIds.map(` e
  `groupOf={` em `radar-page.tsx`, e guarda também que a tela NÃO contém `payload.siloId` (o invariante do
  Arquiteto continua valendo).

Ao backlog (não triviais, exigem decisão): ligar o siloId declarado na tela (bloqueado pelo invariante acima —
relaxar o guarda ou receber o silo pré-resolvido do pipeline é decisão do dono), território disputado por dois
silos (prévia agrupa no mais recente, o gate recusa AMBIGUOUS), o checkbox "Selecionar o silo inteiro" no
cabeçalho "Sem silo", dois silos com o mesmo nome dividindo cabeçalho (já registrado) e o contrato implícito de
grupos contíguos para consumidores futuros.
Fora do Radar: 1 falha pré-existente em `tests/global-workflow-status.test.mts` ("concurrent write refuses…",
mensagem de `lib/server/global-workflow-transition.ts:91` não casa com o regex `/outra sessão/`) — idêntica no
HEAD, domínio da transição global; e a regressão visual pré-existente de `professional-writer.tsx` (41 vs
baseline 40), de outra sessão.

Testes da passada (rodada final de verificação, 2026-10-07): test:radar 2904 (2903 pass, 1 skip pré-existente;
os 2 testes acima do placar anterior são da sessão paralela do CSV de vídeo), test:operational com as MESMAS
12 falhas pré-existentes (todas as asserções apontam para `arquiteto-workspace.tsx`/pipeline, arquivos que esta
entrega não tocou), test:arquiteto 2737/0, test:agent 65/65, tsc sem erro de fonte, dívida visual de
`workflow-status.tsx` sem aumento (53 → 53). Os dois should-fixes têm prova por mutante (cópias no scratchpad,
nunca no repositório): reverter o contador do "Silo sem nome N" mata exatamente o teste do contador; remover o
critério declarado-primeiro mata exatamente o teste da precedência — cada um com os outros 9 testes verdes.

## Entrada do Radar agrupada por silo — 2026-10-07

**Verificado no código e confirmado por teste (módulo puro + DOM real); `MANUAL_UI_VALIDATED = NO` (homologação
do dono descrita no backlog).** Pedido do dono (literal): "eu quero importar por silos … tem que ter a opção de
poder importar um silo inteiro da lista … hoje aparece só como uma lista e não tem como distinguir quais deles
pertencem a um determinado silo … isso também vai servir para depois poder exportar o silo inteiro no csv".

O diálogo "Importar do Arquiteto" agora separa os ArticleDNAs aprovados por grupos/silos: cabeçalho por grupo com
o nome do silo, a contagem "N de M ainda não importados" e o checkbox "Selecionar o silo inteiro" (com
`indeterminate` na seleção parcial), e a busca também casa com o nome do silo — buscar o nome mostra o silo
inteiro, mesmo as linhas cujo rótulo não contém o termo.

1. **A chave do grupo é a MESMA do export por silo**: o SiloDNA (mais recente por `versionNumber`, empate por
   `createdAt`) cuja COMPOSIÇÃO (`pillarArticleId`, `narrativeOrder`, `supportArticleIds`, `articleReferences`)
   contém o `articleId`; na falta, o SiloDNA com o mesmo `territoryRef` do ArticleDNA (composição vence
   território); sem nenhum, "Sem silo", sempre por último. Assim o grupo importado bate com o arquivo que sai no
   CSV por silo (`groupBy: "silo"` em `app/api/editorial/radar-export`). Rótulo nunca é id cru: silo sem nome
   vira "Silo sem nome N" — a mesma regra do export, REPLICADA porque lá ela é interna ao `planRadarSiloExport`
   (não exportada), com o porquê registrado no módulo novo.
2. **Módulo puro novo** `lib/radar/import-silo-groups.ts` (`radarImportSiloGroups`): sem React, sem fetch;
   recebe `{ rows: [{ id, articleId, siloId?, territoryRef? }], siloVersions }` e devolve
   `{ groups: [{ key, label, rowIds }], orderedRowIds }`. Ordem dos grupos: alfabética pt-BR, "Sem silo" por
   último; dentro do grupo: pilar → ordem narrativa → o resto na ordem de chegada — a mesma leitura de
   composição do export por silo.
3. **Prop ADITIVA `groupOf?: (row) => string | null`** no `WorkflowImportDialog`
   (`components/editorial/workflow-status.tsx`, arquivo compartilhado) e repasse opcional no `ImportPanel`
   (`components/editorial/operational-screen-shared.tsx`). SEM `groupOf`, o render é o de hoje — consumidores
   preservados: `professional-writer.tsx` ("Importar do Radar"), `arquiteto-workspace.tsx` ("Importar keywords
   do Minerador") e o `ImportPanel` sem a prop, provado por teste de DOM (sem `groupOf`: nenhum cabeçalho e a
   busca só pelo rótulo da linha). As linhas novas do cabeçalho usam tokens semânticos (`border-divider`,
   `bg-surface-subtle`, `text-foreground`, `text-text-muted`) e 12px; a dívida visual do arquivo NÃO aumentou
   (53 antes → 53 depois, `scripts/check-visual-system.mjs`).
4. **O Radar liga o agrupamento** (`modules/radar/radar-page.tsx`): calcula os grupos sobre `importable`
   (`articleId`/`territoryRef` do payload aprovado) e `pipeline.siloVersions`, reordena por `orderedRowIds`
   ANTES do `<ImportPanel>` e passa `groupOf` (mapa rowId → rótulo do grupo). `onImport`, mensagens e bloqueios
   não mudaram.
5. **Redator ficou de FORA nesta entrega** (caminho B do desenho): as linhas do "Importar do Radar" são
   RadarItems, e a chave certa para quem JÁ está no Radar é `RadarItem.siloId` — a mesma do export
   (`lib/radar/portable-silo-export.ts` documenta por que composição e território erram nos legados com silo
   deduzido). Ligar `radarImportSiloGroups` lá agruparia diferente do CSV nesses casos; aceitar um siloId
   pré-resolvido seria mudança de contrato do módulo, fora do escopo desenhado. Registrado no backlog como
   próxima ponta.

Catálogo dos agentes (AGENTS §17.1): `lib/agent/platform-catalog.ts` NÃO descreve o diálogo de importação do
Radar (procurado por "Importar", "importApprovedToRadar" e pela rota de importação; `arquiteto.send_to_radar`
descreve o envio pelo Arquiteto, que não mudou) — nada a atualizar; `npm run test:agent` verde.

- Arquivos: `lib/radar/import-silo-groups.ts` (novo), `components/editorial/workflow-status.tsx`
  (compartilhado, aditivo), `components/editorial/operational-screen-shared.tsx` (compartilhado, aditivo),
  `modules/radar/radar-page.tsx`, `tests/radar-import-silo-groups.test.mts` (novo),
  `tests/radar-import-dialog-silo-dom.test.mts` (novo, DOM real pelo harness de `radar-dom-harness.mts`).
- Testes: test:radar 2898 (2897 pass, 1 skip pré-existente, 0 falhas; +12 novos sobre a base);
  test:operational 51 (39 pass, as MESMAS 12 falhas pré-existentes de antes da mudança — não piorou);
  test:arquiteto 2737/0; test:agent 65/0; `npx tsc --noEmit -p .` com 0 erros de fonte (só as 2 rotas do
  Planejador aposentado no cache `.next/types`, pré-existentes); eslint sem erro nos tocados;
  `check-visual-system`: workflow-status.tsx 53 → 53, radar-page.tsx 0 → 0, professional-writer.tsx intocado;
  `git diff --check` limpo.

## Passada de revisão do CSV de vídeo (três revisores) — 2026-10-07

**Verificado no código e confirmado por teste; `MANUAL_UI_VALIDATED = NO` (a mesma pendência de reexportação do
dono da entrega abaixo).** Três revisores (usabilidade, honestidade, testes-regressão) olharam a entrega dos
três produtos; o único should-fix e as notas triviais foram fechados aqui:

- **Teste da dispersão dos cortes (should-fix)**: nenhuma fixture tinha mais de 3 capítulos, então reverter a
  dispersão para o top-3 por peso passava a suíte inteira. Teste 23 novo
  (`tests/radar-csv-video-roteiro.test.mts`) com planta de 5 seções: pesos iguais → cortes 1·2·4 (faixas {1},
  {2,3}, {4,5}; empate fica com o primeiro da faixa); entrega prática só em 2 e 5 → cortes 1·2·5. Registro
  corrigido: o relato da entrega dizia "1·3·5" para 5 capítulos iguais — o comportamento real (e correto pela
  regra) é **1·2·4**; "1·3·5" só acontece com 6 capítulos.
- **Mostrar do corte segue a origem do mostrar do capítulo** (nota dos revisores de honestidade e regressão):
  seção com entrega prática E 2+ H3 fazia o corte dizer "só o primeiro passo — {H3[0]}" citando passos que o
  Mostrar na tela do vídeo longo nem nomeia (a prática vence os H3 em `capitulosDaPlanta`). Agora os passos do
  corte saem da prática quando ela existe (split por → ou ;; sem separador, a demonstração inteira da prática) e
  dos H3 só quando o mostrar veio deles. Teste 24 novo prende as duas pontas.
- **Plural na seção de entrega**: "Instruções para o redator" não casava com `TITULO_DE_ENTREGA`
  (`lib/radar/brand-voice.ts` — "instrucao" não é substring de "instrucoes" sem acento); o regex virou
  `instruc(?:ao|oes)`, com caso unitário no teste 21.
- **Cabeçalho do carrossel**: dizia "cada uma puxando a próxima" depois de o "Puxa a próxima" sair do corpo da
  lâmina; agora diz "(o título de cada lâmina já puxa a seguinte)". O fallback sem planta (que não monta
  lâminas) continua com a instrução de encadear, que lá é acionável.
- **Catálogo (AGENTS §17.1)**: a nota de 2026-10-07 em `lib/agent/platform-catalog.ts` ganhou a passada de
  revisão (plural, origem do Mostrar do corte, cabeçalho do carrossel).

Notas conferidas e NÃO alteradas (comportamento intencional, registradas no backlog quando pedem decisão):
corte herdado de capítulo pendente mostra a PENDÊNCIA (documento de produção; a lâmina correspondente sai
limpa); estatísticas da amostra seguem incluindo os fora-do-tema (fotografia congelada, declarada na coluna);
`diretrizes_de_roteiro` não tem orçamento gracioso como a `serp_youtube` (pior caso sintético medido:
9.614/10.000; acima do teto, `celula()` trunca com marcador visível — mecanismo pré-existente).

## O CSV de vídeo serve aos três produtos (vídeo longo, cortes e carrossel) — 2026-10-07

**Verificado no código e confirmado por teste; `MANUAL_UI_VALIDATED = NO` (o dono precisa exportar de novo o CSV
real para conferir na planilha).** Pedido do dono: o CSV "para vídeo e redes sociais" exportado no caso real
(Instagram/AdalbaPro) foi avaliado externamente, as críticas foram conferidas no código e procedem. Sete mudanças
em `lib/radar/portable-video-export.ts` e `lib/radar/brand-voice.ts`:

1. **Voz da marca sem entrega de artigo**: `radarBrandVoiceSectionIsArticleDelivery` (novo, exportado em
   `lib/radar/brand-voice.ts`) reconhece seção de ENTREGA DE ARTIGO pelo título (entrega e revisão, revisão
   final, instrução para o teste/para o redator, checklist de entrega) ou pelo corpo ("corpo do artigo" +
   "meta description"/"SEO title", ou a ordem de escrever o artigo). Em `buildRadarVideoBrandVoiceRow`, essas
   seções saem de TODAS as colunas da linha de voz e são nomeadas no "Fica fora desta linha". "Critérios antes
   de redigir", "Voz" e "Vocabulário e estilo" FICAM; o CSV para escrever não muda (provado em teste).
2. **O prompt pede os três produtos e libera a ordem** (`colunaPrompt`): vídeo longo (roteiro na ordem dos
   capítulos OU na ordem que o vídeo render melhor — a diretriz permite reorganizar — mantendo assunto,
   evidências e premissa), os 3 cortes (fala própria, cena a mostrar e UM CTA) e o carrossel (texto publicável
   por lâmina + sugestão visual, sem instrução interna).
3. **"Entregar" nunca fica sem resposta** (`capitulosDaPlanta`): answerFirst não-absoluto como antes; senão a
   PRIMEIRA frase não-absoluta de explicar, promovida ("o que a pesquisa sustenta: {frase}; a resposta completa
   a {pergunta} se delimita na fala", sem repeti-la no Explicar); senão a PENDÊNCIA nomeada e acionável
   ("delimite na fala ou grave a resposta do especialista"). O placeholder "a resposta a X pelo que a pesquisa
   sustenta, sem regra universal" morreu.
4. **"Mostrar na tela" diz o que o editor prepara**: dos H3, "demonstração num exemplo fictício (identificado
   como ilustrativo): prepare uma tela para cada passo — A; B; C — e mostre o antes e depois (com e sem) de
   cada um; a cena exata é decisão de produção"; da entrega prática, "demonstração na tela: {practical}, num
   exemplo fictício identificado como ilustrativo". O fallback de imagem segue como contexto visual.
5. **Cortes com ideia única, origem e rótulo honesto** (`colunaCortes`): rótulo "{n} ideia(s) escolhida(s) dos
   capítulos (as que funcionam sozinhas em até 60 segundos)"; escolha com DISPERSÃO (o melhor do início, do
   meio e do fim da sequência; empate pela ordem; mesmos pesos de elegibilidade); "Mostrar" do corte usa SÓ o
   primeiro passo quando há vários (o resto fica no vídeo longo); linha "Origem: extrair da gravação do
   capítulo {N} ou gravar à parte com fala própria"; "Fechamento: CTA: o artigo ({URL}) ou o vídeo longo quando
   publicado — um só por corte".
6. **Carrossel publicável**: cada lâmina sai com "Título: … · Apoio (texto publicável): … · Visual: …". O Apoio
   vem da frase publicável do capítulo (answerFirst ou a promovida de explicar); na pendência, a primeira frase
   não-absoluta de explicar; sem nada, a pergunta do público como provocação. O Visual deriva do mostrar
   ("demonstração de …"), do conceito da imagem ou "destaque do título". Nenhuma lâmina sai com instrução
   interna; o "Puxa a próxima" saiu da lâmina (o Título da seguinte já diz o que vem). Capa segue o H1 da
   planta; lâmina final segue o CTA com endereço; a frase de fonte por lâmina fica.
7. **Amostra declarada** (`colunaIntencao` + `buildRadarVideoExportArticle`): a relevância (`relevanciaDoVideo`)
   é lida do UNIVERSO INTEIRO (não só do top 10) e, havendo FORA, a coluna de intenção diz "Da amostra, {n} só
   citam a plataforma (fora do tema da busca): ficam fora das recomendações, mas entram nas estatísticas de
   duração e formato acima." Mediana e formatos não são recalculados (fotografia congelada).

Decisões mantidas (NÃO reabertas): a tese editorial da marca ("o Instagram, sozinho, não enche a agenda" na
capa/H1 e premissa) é decisão do dono e não foi censurada nem delimitada (o sanitize do blueprint já avisa o
humano na aprovação); a fala E1 no fechamento (tipo FECHAMENTO) mantida; `RADAR_ABSOLUTE_CLAIM`
(`lib/radar/article-blueprint.ts`) intacto (compartilhado com o artigo-modelo); o CSV "para escrever"
(`portable-writing-export`) sem mudança de conteúdo.

- Arquivos: `lib/radar/portable-video-export.ts`, `lib/radar/brand-voice.ts` (aditivo: predicado novo
  exportado; consumidores anteriores preservados), `lib/agent/platform-catalog.ts` (AGENTS §17.1: descrição do
  CSV de vídeo com carrossel publicável e prompt dos três produtos; nota nova datada 2026-10-07),
  `tests/radar-csv-video-roteiro.test.mts` (asserções atualizadas com o porquê + testes 20–22 de prova por
  regeneração: planta com answerFirst absoluto, pendência nomeada, lâmina sem instrução interna, voz sem
  entrega de artigo, amostra declarada lida além do top 10).
- Testes: test:radar 2886 (2885 pass, 1 skip pré-existente, 0 falhas; linha de base 2883 + 3 novos);
  test:agent 65/0; `npx tsc --noEmit -p .` limpo fora do cache `.next/types` (rotas do Planejador aposentado,
  pré-existente); eslint sem erro nos arquivos tocados; `git diff --check` limpo.
- **Limites:** "Mostrar na tela" ainda não desenha a cena exata (decisão de produção, dito na linha); as
  estatísticas da amostra seguem incluindo os fora-do-tema (declarado na coluna); os tempos da biblioteca
  seguem estimados pela posição no texto.

## Briefing de vídeo pelo que alimenta os campos e os 4 limites do artigo — 2026-10-02 (fim da noite)

**Verificado no código e confirmado por teste; a exportação "Para escrever" do Instagram foi conferida por POST
somente leitura (`/api/editorial/radar-export`, nada gravado). O CSV de vídeo e a planta nova dependem de o dono
organizar de novo e exportar.**

Vídeo (`lib/radar/portable-video-export.ts`, `lib/radar/youtube-blueprint.ts`, `lib/radar/article-blueprint.ts`):

- "Premissa do vídeo" (`radarVideoPremise`) e capítulos, cortes e carrossel sem afirmação absoluta
  (`RADAR_ABSOLUTE_CLAIM`, a mesma régua da planta); regra 20 no pedido à IA (demonstração e premissa).
- "Mostrar na tela": a parte prática da seção; sem ela, o passo a passo dos H3 num exemplo identificado como
  ilustrativo; sem nenhum dos dois, "contexto visual (não demonstra sozinho)".
- Ordem flexível ("reorganize se o vídeo render mais abrindo pela demonstração"); gancho sem conector
  (`radarVideoHookQuestion` tira "Então", "Mas"…); capa do carrossel é o H1; tempos marcados como ESTIMADOS.
- Relevância dos concorrentes: mesmo público · mesma dor com público vizinho · tema geral · outro público · fora
  do tema da busca (só cita a plataforma); `leituraDoPublico` separa quem (antes de "que") dos termos vizinhos.
- Problema → solução reconhece "o que fazer", "como resolver", "ajustes", "como corrigir", "como sair", "o que
  mudar".
- Transcrições: estado "selecionado pela marca · trecho candidato encontrado", tempo estimado pela duração
  (`radarVideoDurationSeconds`), cabeçalho da biblioteca quando nenhum trecho casou.

Artigo:

- **Rótulo neutro do tema** (`radarCompetitorTopicLabel`): tira o verbo de comando, o artigo e a preposição do
  começo ("Use as hashtags certas" → "Hashtags certas").
- **Seções quase iguais por título genérico** (`titulosGenericosIguais`): além da sobreposição de radicais, duas
  seções cujos títulos só diferem por raízes genéricas (estratég, prátic, dica…) contam como a mesma entrega.
- **Estrutura publicada atual**: `assembleRadarPortableExport` recebe `readPublishedStructure` (opcional,
  injetado pela rota e pelo MCP de um artigo); `radarReadPublishedStructure` usa o extrator das páginas
  concorrentes (GET, 8 s, até 10 páginas por lote). O bloco "Publicado:" traz H1 e H2 de hoje e a regra de
  atualização (seção existente fora da planta só sai com decisão humana). H2 de navegação, rodapé, widgets
  (`radarIsNavigationHeading`) e a assinatura do próprio site (`radarIsSiteIdentityHeading`: começa pelo nome
  do domínio e tem separador " - " / " | ") ficam fora. Conferido no Instagram: 15 H2 lidos → 9 do artigo.
- **Lente de cada evidência** (`radarWritingDomainLenses` + `lenteDaEvidencia`): a evidência S da seção diz
  "em todas as 4 lentes" ou "só em desktop · Windows e desktop · macOS (2 de 4 lentes)"; pacote congelado
  primeiro, cache da principal sem ele; uma lente só não diz nada.
- Arquivos compartilhados: `lib/server/radar-portable-export-core.ts` (entrada opcional, aditiva; sem leitor,
  comportamento anterior), `app/api/editorial/radar-export/route.ts`, `lib/radar/competitor-topics.ts`.
- Testes: `radar-leitura-concorrentes` (7), `radar-csv-video-roteiro` (22), `radar-csv-revisao-pacote`,
  `radar-video-usage`. Suítes: test:radar 2882/0, test:redator 357/0, test:redator:mcp 134/0, test:agent 65/0;
  `tsc` limpo fora do cache `.next/types` (rotas do Planejador aposentado); eslint sem erro; `git diff --check`
  limpo. Catálogo do MCP atualizado.
- **Limites:** a leitura da página publicada depende de ela responder em 8 s e ter H2 no HTML; rodapé com outro
  formato pode escapar do filtro (a lista é de cabeçalhos comuns de blog, não do site); a lente só aparece quando
  há 2+ lentes observadas.

## D10 · o entregável sai concluído — 2026-10-02 (fim da noite)

**Verificado no código e confirmado por teste. Não executado no artigo do Instagram (a próxima organização é do
dono).** Decisão do dono, SDD diretriz editorial, D10 (substitui D8).

- Organizar grava o artigo-modelo já concluído (`APPROVED` com autor e momento, sem migration); com pendência
  na conferência, `fecharArtigoModelo` faz UMA chamada a mais com a lista ("CORREÇÃO OBRIGATÓRIA") e fica com a
  versão de menos pendência; a conferência com `close` tira a origem M que não trata do assunto da seção. A
  correção é pulada se a primeira resposta já precisou de nova tentativa (teto de 300 s da rota) e, falhando,
  grava a primeira.
- Editar grava outra versão concluída; o painel deixa editar a concluída e só oferece "Concluir esta versão" a
  rascunho antigo.
- Entregáveis sem marca: `radarArticleBlueprintColumns` não marca proposta nem lista pendências; seção sem
  origem sai como "proposta editorial do artigo"; o prompt do CSV não tem mais a linha de rascunho; CSV de
  vídeo sem "(aprovado)"/"(proposta…)"; textos do Redator e do MCP dizem "concluído no Radar".
- Testes: `tests/radar-artigo-modelo-concluido.test.mts` (4); reescritos os de marcação em
  `radar-artigo-modelo-serp`; ajustes em 8 arquivos de teste; snapshot F4.4 renovado (só a frase dos prompts de
  imagem, conferido revertendo-a).
- **Limites:** o rascunho antigo do Instagram (v5) sai sem marca mas com o conteúdo de antes — organizar de novo
  aplica a correção e os temas dos concorrentes; a correção custa 1 chamada a mais quando há pendência.

## Leitura dos concorrentes e ajustes do CSV — 2026-10-02 (fim da noite)

**Verificado no código e confirmado por teste. Validado no local por POST de leitura (artigo do Instagram, depois do
reparo do congelamento feito pelo dono): 138 cabeçalhos lidos das 6 páginas comparáveis; temas recorrentes como
bio (5 de 6), hashtags (5 de 6), conteúdo, interação, recursos, Stories e parcerias (4 de 6); nenhuma célula
cortada.**

- **Temas dos concorrentes** (`lib/radar/competitor-topics.ts`): H2/H3 das páginas COMPARÁVEIS (das extrações
  gravadas, via `competitorOutlines` no export), limpos (numeração de listicle, verbo de comando, palavras da
  keyword), agrupados pela raiz que mais páginas compartilham; contagem por página; ruído de navegação fora;
  "não cobrir" aplicado. Fora do congelamento e do hash (nenhuma divergência nova).
- **CSV:** bloco "O que os concorrentes lidos cobrem" na SERP resumida (teto próprio de 10 mil; artigo 40 mil);
  a limitação "nenhuma página foi visitada" passa a dizer que é da camada multiformato; link interno com um
  destino só; prompt com as três linhas e o aviso de rascunho quando o artigo-modelo é proposta.
- **Artigo-modelo:** os temas de 2+ páginas viram seções M do esqueleto; conferências novas (afirmação absoluta,
  seções quase iguais) como pendência; regra 19 no pedido (uma entrega por seção). Vale na próxima organização.
- Testes: `tests/radar-leitura-concorrentes.test.mts` (6) e caso novo em `radar-csv-revisao-pacote`; Radar
  2876/0, MCP 134/0, agent 65/0; tsc e eslint limpos.
- **Limites:** o rótulo do tema é um cabeçalho de concorrente (marcado "não copie"); sinônimos cobertos só os
  comuns (bio/biografia, reel, story); a régua de seções quase iguais é por radical e não pega duplicata só de
  sentido ("de forma estratégica" × "estratégias práticas") — fica com a regra 19 e a revisão; a estrutura
  publicada atual do artigo ainda não é lida.

## Reparar congelamento, por perfil — 2026-10-02 (noite)

**Verificado no código e confirmado por teste. NÃO validado na tela nem executado no artigo do Instagram: o
reparo grava (Google, YouTube, Amazon) e o caminho pago coleta — homologação do dono.** SDD: Adendo E
(`sdd-diretriz-editorial-pela-serp-2026-10-02.md`), aprovado pelo dono.

- **Domínio** `lib/radar/refreeze-repair.ts`: decisão NOTHING / REFREEZE / RECOLLECT / NOT_FINALIZED,
  comparação sem carimbos (tempo, autor, hash), diferenças rotuladas, projeção reaberta do Google e as
  consequências ditas antes da escrita.
- **Painel** `modules/radar/radar-refreeze-panel.tsx`: "Reparar congelamento (Google | YouTube | Amazon)",
  só sobre a fotografia; prévia que só lê; "Recongelar com a leitura atual" ou "Zerar e coletar de novo (pago)".
- **Google** (`radar-page.tsx`): prévia relê o servidor, projeta reaberta, mede a divergência com a MESMA régua
  do bloqueio (`radarObservedDivergesFromFrozen`) e ensaia `finalizeRadarDeepResearch` +
  `freezeRadarEvidenceBundle`; recongelar = reabrir (trava já aceita) + `finalizarInvestigacaoGoogle` sobre a
  linha relida. Pago = `buildRadarResetPayload` com `requireRemote` e readback, depois `startDeepResearch`.
- **YouTube**: `resolveRadarFrozenRun` + `fotografiaDoYoutube` (a montagem do Finalizar, agora separada da
  escrita); recongelar numa escrita. Pago = reset confirmado pelo servidor + `startYoutubeSearch`.
- **Amazon**: ação `refreeze` (com `dryRun`) na rota; `refreezeRadarAmazonInvestigation` usa as MESMAS
  `validarColetaAmazon`, `montarBlueprintAmazon` e `fotografiaAmazon` de analisar e finalizar; uma escrita.
  Pago = reset confirmado + `startAmazonSearch`.
- **Continuação do pago:** a coleta começa quando a tela mostra o perfil zerado (o início lê o artigo do
  render); outro artigo aberto no meio cancela, com aviso. Hooks antes do retorno antecipado da página.
- **Correção do que eu disse antes:** recongelar NÃO reaproveita o artigo-modelo atual — o hash do dossiê
  muda; a prévia avisa a nova organização (1 chamada de IA) e a nova aprovação.
- Testes: `tests/radar-reparo-congelamento.test.mts` (9); ajustados `radar-amazon-search-11`,
  `radar-editorial-profiles-21`, `radar-finalizar-automatico`. Radar 2869/0, Redator 357/0, MCP 134/0,
  agent 65/0; tsc e eslint sem erro; sistema visual só com a falha antiga de `professional-writer.tsx`.
- **Limites:** o Google grava em duas escritas (o ensaio reduz o risco; se a segunda falhar, fica reaberto e
  "Finalizar pesquisa" conclui); o servidor da Amazon é testado de forma estrutural (lê o repositório de
  artefatos); homologação na tela pendente.

## Briefing do CSV de vídeo — 2026-10-02 (tarde)

**Verificado no código e confirmado por teste. Validado no local por POST de leitura (`mode: "video"`, artigo do
Instagram): capítulos da planta, cortes e carrossel com conteúdo, relevância dos concorrentes, consultas repetidas
marcadas, trecho do tema nas transcrições, aviso de inglês, sem célula cortada.**

- **Capítulos da planta** (`capitulosDaPlanta`): com artigo-modelo (e fora do formato curto), cada seção vira um
  capítulo com pergunta do público, "Entregar" (a resposta que abre), "Explicar", "Mostrar na tela" (entrega
  prática ou conceito da imagem) e "Antes de afirmar" (link externo que pede fonte). Os blocos da SERP do YouTube
  ficam como ritmo. Proposta da IA é avisada ("confira antes de gravar").
- **Gancho:** com planta, só a abertura dela, e só se fala da principal; preposição ("pelo") não conta como raiz
  do tema (`RADAR_WRITING_FUNCTION_WORDS`, vale também para a abertura do CSV para escrever).
- **Cortes e carrossel:** cada corte com gancho, ideia única, o que mostrar, fonte e fechamento; o carrossel com
  capa (promessa), uma lâmina por capítulo com a primeira oração inteira, "Puxa a próxima" e lâmina de CTA.
- **Pesquisa do YouTube:** consulta que repete outra (palavra duplicada; prefixo sobre busca já enquadrada) é
  dita, e "aparece em N consultas distintas" conta perspectivas; cada vídeo do topo tem relevância para o público
  (mesmo, próximo, geral, outro) pelo título e pelo canal, com resumo; lacunas na frase da amostra ("Nenhum Short
  identificado…", "Pouca credencial visível…"), inclusive nas corridas gravadas antes; "Ranking" não é oportunidade
  quando há lista na amostra; o padrão "Lista numerada" virou "Lista (dicas, melhores, top)".
- **Fala dos vídeos selecionados:** o leitor traz o corpo da transcrição corrente com teto de 20 mil caracteres
  (`textBody`, aditivo); o CSV mostra a janela que mais nomeia o tema e os capítulos (a saudação perde ponto), a
  posição aproximada, o capítulo que ela sustenta e o aviso de idioma (inglês: traduzir e revisar) ou de
  transcrição automática.
- Célula do CSV de vídeo: 6 → 10 mil caracteres (`RADAR_VIDEO_EXPORT_CELL_CHARS`).
- Testes: `radar-csv-video-roteiro` 14–18 (novos) e ajustes em 4, 10, 10b, 12; `radar-youtube-search-2-blueprint`
  §9. Radar, Redator 357/0, MCP 134/0, agent 65/0; tsc e eslint limpos.
- **Limites:** sem tempo por trecho (a transcrição lida é texto corrido): o tempo exato se acha no vídeo; as frases
  dos capítulos vêm da planta — a proposta atual ainda tem afirmações categóricas, que a próxima organização trata;
  o bloqueio por divergência continua até recongelar.

## Revisão do CSV do Instagram: integridade, links, Relatório e o bloqueio — 2026-10-02 (manhã)

**Verificado no código e confirmado por teste. Validado no local por POST de leitura em `/api/editorial/radar-export`
(artigo do Instagram): nenhuma célula cortada (~29 mil caracteres na linha), nenhuma URL com "…", destinos pelo
nome, caminho provável com o prefixo do Silo, proporção nas imagens, abertura única.**

- **Corte do CSV:** estrutura até 14 mil e artigo até 32 mil (eram 8 e 20 mil); ordem do corte: "cobrir e superar",
  fontes, plano visual e, por último, a SERP resumida, que guarda ao menos 1.500 caracteres (`cutFloorChars`).
  O CSV é para escrever fora da plataforma; o Redator tem os seus fundamentos com corte próprio.
- **Planta no CSV** (`radarArticleBlueprintColumns`): URL de evidência inteira (o corte em 90 caracteres caía no
  endereço); destino do link sem a moldura "Cobrir com clareza o tema…" (também no brief); caminho planejado
  ganha "caminho provável" com o prefixo da URL publicada deste artigo quando o último trecho dela é o slug;
  imagem sem proporção ganha a referência (capa 16:9, respiro 4:3).
- **Abertura única:** com artigo-modelo, "cobrir e superar" remete à abertura dele; sem ele, a pergunta de
  abertura prefere a que divide ao menos duas raízes com a principal (vale também para o gancho do CSV de vídeo).
- **Conferência da IA:** aviso quando a seção cita uma M de outro assunto ("…cita M1 … mas não trata do
  assunto dela"); o pedido ganhou regras de abertura, imagem (proporção, sem texto legível, SVG para diagrama,
  nada de tela fictícia de resultado), afirmação delimitada (sem regra universal, sem receita de gratuidade,
  urgência ou antes/depois) e origem. Valem nas próximas organizações; versões já gravadas não mudam.
- **Relatório:** "Estrutura editorial" e "Links internos" leem o artigo-modelo do pacote congelado (proposta 50%,
  aprovada 100%; links só com os destinos do grafo). Planta de outro pacote não conta.
- **Bloqueio por divergência:** o CSV diz o que divergiu (sem id). No artigo do Instagram: os conceitos e as
  afirmações a sustentar (12 × 13). **Causa (diagnóstico, só leitura):** o congelado é de 2026-10-02 02:44Z; a
  limpeza de cabeçalhos de concorrentes (`radarCleanCompetitorHeading`, commit 8624781) entrou depois e mudou os
  ids dos conceitos sobre as MESMAS extrações. Refinalizar não grava (`finalizeRadarDeepResearch` recusa
  investigação finalizada); o único caminho hoje é o reset, que refaz a coleta paga. A divergência é real e
  continua bloqueando. O artigo-modelo foi organizado sobre o dossiê de hoje (`bundle-hash:7fd9706e`), por isso
  o painel e o Relatório não o reconhecem como do pacote congelado.
- Testes: `tests/radar-csv-revisao-pacote.test.mts` (8); ajustados `radar-portable-writing-export`,
  `radar-csv-video-roteiro`, `radar-artigo-modelo-serp`. Radar 2855/0, Redator 357/0, MCP 134/0, agent 65/0;
  tsc e eslint limpos.
- **Limites:** recongelar com a leitura atual exige decisão do dono (workflow e artefato congelado: SDD);
  a coluna "Relatório" da lista do Radar ainda usa a leitura antiga (a planta é lida só no painel do artigo).

## Artigo-modelo da SERP, autoria, CSV de vídeo e finalização automática — 2026-10-02 (madrugada)

**Verificado no código e confirmado por teste. Validado no local (POST de leitura em `/api/editorial/radar-export`):
linha "Voz da marca", autoria "Adalberto Escalante" da aba Especialista, CSV de vídeo com a pesquisa do YouTube
(51 vídeos). Organização real do artigo-modelo e finalização automática: NÃO executadas pelo agente — são do
dono.** SDD: `sdd-diretriz-editorial-pela-serp-2026-10-02.md`, Adendo D (D7, D8, D9) e D.3.

- **Frente A — artigo-modelo é dado da SERP (D7, D8):** o painel virou "Artigo-modelo da SERP" (Pesquisa). A IA
  recebe o esqueleto da SERP com ids (`M…`) e só organiza; schema compacto, fatias da voz por assunto,
  `thinkingMode` desligado, 1 nova tentativa quando a resposta vem cortada ou inválida (era o "JSON inválido").
  Congelar qualquer perfil encadeia a organização; o encadeamento manda `ifMissing` e reaproveita a versão do
  mesmo `bundleHash` antes de chamar o provider. O CSV "para escrever" leva a aprovada do pacote vigente ou,
  sem ela, a proposta mais nova marcada "PROPOSTA DA IA — aguardando aprovação no Radar". O tipo da unidade
  (ArticleDNA) e o formato da SERP vão à IA — vale para artigo, SiloPage, landing page e serviço.
- **Frente B — autoria (E-E-A-T):** `lib/server/radar-article-authors.ts` lê `brand_experts` da marca:
  primeiro o especialista das contribuições do pacote; sem contribuição e com um único ativo, ele é sugerido
  para confirmação; sem nenhum, o CSV pede para definir antes de publicar. Erro de leitura não derruba o export.
- **CSV "para escrever", regra fixa:** sem pergunta retórica nem pergunta de Shopping na abertura, sem o
  conflito de Shopping, texto de FAQ unificado, plano visual capa + 2–3 respiros.
- **Frente D — CSV de vídeo pronto para roteiro:** a mesma voz e o mesmo plano do Silo da seleção; a mesma
  regra de fora do escopo do CSV "para escrever" (`lib/radar/out-of-scope.ts`); vídeos selecionados com modo,
  canal, começo da transcrição e, no Incorporar, a seção do artigo-modelo aprovado; CTA para o artigo.
- **Frente C — finalização automática nos três perfis (D9):** `radarGoogleAutoFinalizeDecision` e
  `radarProfileAutoFinalizeDecision` decidem; a tela encadeia as MESMAS ações dos botões. Pendência para e diz
  o motivo e o botão manual. Rótulos: "· e finaliza (+ 1 chamada de IA)" na coleta, "· inclui 1 chamada de IA"
  no finalizar. Correções do YouTube: a projeção conta o Google base como apoio; a gravação do apoio usa a
  trava da leitura remota (`LOCK_DA_LEITURA_REMOTA`) e não engole o 409; consulta com a principal já
  enquadrada ("como …") não ganha outro prefixo.
- **Compactação por perfil (defeito da homologação):** a cópia de leitura esvaziava toda corrida quando
  qualquer fotografia existia; com o Google finalizado, a coleta viva do YouTube sumia depois de recarregar e o
  botão de finalizar não aparecia. `compactRadarResearchForRead` agora tira cada corrida só quando a fotografia
  DO SEU perfil existe; a função do banco `editorial_radar_versao_compactada` ganhou a mesma regra na migration
  `20261002130000_compactacao_por_perfil.sql` (+ rollback), conferida pelo teste de paridade
  `tests/editorial-listagem-workflow-sem-corridas.test.mts`. **A migration ainda não foi aplicada** — até lá, a
  listagem que vem da view continua escondendo a coleta viva.
- Catálogo MCP: `radar.finalize` (custo `paid_ai`, automático, sem "Aprovar selecionadas"),
  `radar.article_blueprint` (D7/D8), `radar.investigate` (consultas e compactação),
  `radar.export_for_writing` (vídeo e proposta marcada).
- Testes: Radar 2847/0 (1 pulado), Redator 357/0, MCP 134/0, agent 65/0, compactação 8/0; `tsc` sem erro no
  código (só tipos gerados velhos em `.next/` da rota aposentada do Planejador); eslint 0 erros.
- **Limites:** homologação do dono; a decisão sobre o clique manual em "Analisar" (Amazon) encadear o
  congelamento está pendente; pequenos ajustes de texto do revisor no CSV de vídeo estão no backlog.

## Voz da marca e modos de uso dos vídeos — 2026-10-02 (noite)

**Verificado no código e confirmado por teste. Validado no local: CSVs pela rota real (linha "Voz da marca" com a
Skill "AdalbaPro" v1 em rascunho) e botões dos modos na aba Vídeos (nenhum modo gravado; a escolha é do dono).**
SDD: Adendos B e C.

- **Voz da marca (Adendo C):** `readRadarBrandVoice` (lib/server/radar-brand-voice.ts) reaproveita o repositório
  e a regra canônica da Marca (`resolveBrandSkill`, spec §24): Skill `brand_voice` corrente não arquivada,
  rascunho incluído. Lida UMA vez por lote em `assembleRadarPortableExport`, fora do congelamento e do hash;
  falha vira "não foi possível ler", nunca derruba o export. CSV "para escrever" e CSV de vídeo ganham a linha
  "Voz da marca" (seções da Skill distribuídas pelas colunas de mesmo assunto, `lib/radar/brand-voice.ts`); o
  topo diz versão e estado; cada artigo é instruído a seguir a voz na copy e no CTA. O artigo-modelo recebe a
  Skill inteira; página do próprio site citada nela vira candidata a link do CTA; o payload registra a versão.
  O MCP `get_article_for_writing` recebe a mesma voz.
- **Modos de uso dos vídeos (Adendo B):** 6 botões por vídeo selecionado (Usar como contexto, Sugerir como
  pauta, Usar como apoio, Marcar citação, Incorporar no artigo, Não usar), "Limpar modo" e nota opcional;
  sugestão do casamento só como borda tracejada, nunca gravada. Rota da biblioteca com `SET_USAGE` (só fonte
  da marca selecionada no artigo, releitura obrigatória); UNSELECT limpa o modo. Leitura tolerante em consulta
  separada (`lib/server/radar-video-usage-read.ts`). Export: modos lidos ao vivo, `bundle.video` e hash
  intocados; "Não usar" some da projeção; vídeo arquivado na biblioteca não vai ao entregável; Incorporar leva
  URL e seção, Apoio/Citação trecho com tempo, Contexto "ler, não citar". O bloco de modos vem antes do que é
  de terceiros na coluna de fontes. O artigo-modelo leva o modo de cada vídeo e o CSV identifica o vídeo que a
  planta põe numa seção.
- Testes: `tests/radar-brand-voice.test.mts`, `tests/radar-brand-voice-leitor.test.mts`,
  `tests/radar-video-usage.test.mts`; Radar 2751/0 (1 pulado).
- **Limites:** homologação do dono (clicar num modo e exportar); versões do artigo-modelo geradas antes da
  correção não identificam o vídeo da seção (gerar de novo); o painel do artigo-modelo ainda não mostra qual
  vídeo foi para qual seção.

## Artigo-modelo (IA) e correções do CSV "para escrever" — 2026-10-02 (tarde)

**Verificado no código e confirmado por teste. Validado no local: painel renderiza e, sem a tabela, avisa e
bloqueia "Gerar"; export segue saindo. Geração real (paga) e aprovação: NÃO executadas — dependem da migration
e são do dono.** SDD: `sdd-diretriz-editorial-pela-serp-2026-10-02.md`, Adendos A e B (D5 e D6 aprovados).

- **Artigo-modelo (IA)** na área Pesquisa, depois de finalizar: botão com confirmação de custo (1 chamada
  DeepSeek da plataforma, cota da marca) → planta do artigo ideal: sentido das keywords, H1/SEO title/meta,
  leitor, promessa, ângulo com evidências, abertura, seções (pergunta do leitor, resposta inicial, H3, o que
  explicar, parágrafos, negritos, termos, evidências por id, links internos e externos, imagem, especialista,
  vídeo), fechamento e CTA na voz do especialista, plano visual com prompt/ALT/legenda. As medidas (palavras,
  H2, H3, parágrafos, imagens) vêm dos concorrentes comparáveis, não da IA.
- **O servidor confere** a resposta contra o pacote (`radarSanitizeArticleBlueprint`): id inexistente, link fora
  do Silo, fonte externa sem verificação, seção fora do escopo ou de FAQ saem com aviso; < 3 seções → recusa.
- **Versões** append-only em `radar_article_blueprints`, presas ao `bundleHash`; editar cria versão; aprovar é
  humano e o banco recusa mudar a aprovada. O export lê a APROVADA do pacote vigente, por lote, e troca as colunas
  de planta (título e SEO, promessa, estrutura, links internos, plano visual). Sem ela, o CSV sai como antes.
  A leitura falha em silêncio controlado (aviso no log) se a tabela não existir.
- **CSV "para escrever", regra fixa:** pergunta retórica de concorrente ("Aprendeu como…?") não abre artigo nem
  vídeo; diferencial que contradiz "não cobrir" sai; link não é posicionado em seção fora do escopo; orgânicos com
  URL limpa (com UUID no caminho, só o domínio). Conferido no artigo do Instagram pela rota real.
- **Migration** `20261002120000_radar_artigo_modelo_e_uso_de_videos.sql` (+ rollback): tabela do artigo-modelo
  e coluna `usage`/`usage_note` em `radar_article_video_sources` (modos de vídeo, Adendo B). Aplicação pelo dono.
- Arquivos: `lib/radar/article-blueprint.ts`, `lib/server/radar-article-blueprint.ts`,
  `lib/server/radar-article-blueprint-read.ts`, `app/api/editorial/radar-article-blueprint/route.ts`,
  `modules/radar/radar-article-blueprint-panel.tsx` (novos); `lib/server/radar-portable-export-core.ts`,
  `lib/radar/portable-export-batch.ts`, `lib/radar/portable-writing-batch.ts`, `lib/radar/portable-writing-export.ts`,
  `lib/radar/portable-video-export.ts`, `modules/radar/radar-r3-workbench.tsx`, `lib/agent/platform-catalog.ts`
  (etapa `radar.article_blueprint`).
- Testes: `tests/radar-article-blueprint.test.mts` (resposta da IA em fixture), retórica no teste de vídeo,
  snapshot dourado F4.4 renovado (diferença conferida linha a linha: só a URL dos orgânicos). Radar 2718/0,
  Redator 357/0, agent 65/0.
- **Limites:** o Redator da plataforma ainda não recebe o artigo-modelo (só o CSV e o MCP
  `get_article_for_writing`, que usa o mesmo núcleo); modos de uso dos vídeos (Adendo B) têm a coluna na
  migration, mas a tela e a rota ainda não.

## Relatório informativo, CSV de vídeo e Silo nos selecionados — 2026-10-02

**Verificado no código e confirmado por teste. Validado no local pelo desenvolvimento (leitura da tela e POST de
exportação, que não grava); homologação do dono pendente.**

- **Relatório = painel informativo.** A aba mostra keyword principal, intenção declarada × SERP (e se concordam),
  formato dominante, funil, Silo e papel, e o gráfico "Estado SEO do artigo": um pilar por diretriz do Google e das
  respostas de IA (intenção e SERP, cobertura semântica, respostas claras, fontes, especialista, links, multimídia,
  estrutura), com nota 0/50/100 e média dos que se aplicam (`lib/radar/seo-guidelines.ts`). Sem "Em aberto", sem
  "Marcar revisado"/"Aprovar relatório" na aba (`RadarR6ReportPanel informational`). Card e coluna da planilha
  mostram "Estado SEO: N%". O envio ao Redator nunca dependeu da aprovação do relatório.
- **Pilar do especialista** conta parecer aceito (`specialist.reviewedEvidence`). Limite: a tela só conhece o
  parecer depois que a área Especialista é aberta (o painel dela é quem lê as contribuições) — antes disso o pilar
  sai "Não se aplica". Mesmo comportamento antigo da coluna Especialista.
- **CSV para vídeo e redes sociais** (`mode: "video"`, `lib/radar/portable-video-export.ts`, botão no card de
  exportação): 13 colunas sem estrutura de artigo — SERP do YouTube (vídeos no topo com URL limpa, canais, padrões
  de título, termos, lacunas), vídeos que a SERP do Google mostra, intenção e formato (longos × Shorts, durações,
  faixa recomendada), perguntas do público aderentes ao núcleo (sem pergunta retórica de concorrente), termos,
  fatos com fonte e afirmações sem fonte, especialista (fechamento/CTA), biblioteca da marca, diretrizes de roteiro
  (gancho, capítulos, CTA para o artigo), cortes para Shorts/Reels/TikTok e carrossel, prompt. A pesquisa do
  YouTube vale em qualquer perfil; a congelada vence a corrida viva; sem ela, "Com ressalva".
- **"Só os selecionados" leva o Silo.** O núcleo monta o plano por silo também na seleção (`selectionOnly`): irmão
  não marcado sai "fora desta seleção". Seleção de um Silo só abre pela linha "Silo"; seleção que cruza Silos põe
  Silo, papel e ordem narrativa na linha de cada artigo (`siloInline`). Links internos resolvem o destino pelo slug
  do irmão (no artigo do Instagram: Pilar "leads qualificados" → `/qualificados`).
- **Vídeos:** "Casar pautas com o conteúdo" voltou a habilitar — a ação da biblioteca ficava presa em "Registrando…".
- **Especialista:** aceitar, usar como apoio, citação literal, rejeitar e "Editar texto" (PATCH com histórico em
  `original_metadata.edits`) aparecem também para o parecer direto.
- Arquivos: `lib/radar/seo-guidelines.ts` (novo), `lib/radar/portable-video-export.ts` (novo),
  `modules/radar/radar-r3-workbench.tsx`, `modules/radar/radar-r6-report-panel.tsx`, `modules/radar/radar-page.tsx`,
  `lib/radar/portable-writing-export.ts` (exporta projeções; silo na linha), `lib/radar/portable-writing-batch.ts`,
  `lib/radar/portable-silo-export.ts` (status aditivo `not_selected`), `lib/radar/portable-export-batch.ts`
  (campo opcional `youtube`), `lib/server/radar-portable-export-core.ts`, `app/api/editorial/radar-export/route.ts`
  (enum aditivo `video`), `lib/agent/platform-catalog.ts`. Consumidores preservados: formato completo e export por
  silo inalterados; MCP `get_article_for_writing` usa o mesmo núcleo sem plano da seleção (sai como antes).
- Testes: `tests/radar-seo-guidelines.test.mts`, `tests/radar-portable-video-export.test.mts` (corrida real do
  YouTube da fixture); testes estruturais do card e da rota atualizados para o novo contrato. Radar 2708/0,
  Redator 357/0, agent 65/0.

## Diretriz editorial — F1 entregue no código — 2026-10-02

**Verificado no código e confirmado por teste. Validado manualmente: parcial (CSV gerado no local).** SDD:
`docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md` (aprovada: F1 já, F2 em seguida).

- **Especialista:** o parecer do próprio especialista logado ("Eu mesmo" ou o registro dele) entra já aceito,
  com releitura. O tipo do parecer atravessa até o CSV: Fechamento conduz a virada final, CTA a chamada final,
  Diretriz vale para o artigo inteiro. Parecer pendente aparece no CSV ("aguardando aceite no Radar").
- **Cabeçalhos limpos:** `radarCleanCompetitorHeading` tira numeração e contagem de listicle ("2.", "10 principais")
  antes de virar seção, pergunta ou termo (`lib/radar/heading-cleanup.ts`).
- **Aderência ao núcleo:** seção, abertura e diferencial exigem duas raízes do núcleo ou uma distintiva; raiz
  onipresente da principal ("instagram") não basta (`lib/radar/intent-adherence.ts`). Diferencial por raridade
  exige ao menos 2 páginas.
- **Limite conhecido:** o export lê a investigação CONGELADA; artigos finalizados antes continuam com o texto
  derivado na finalização. O H1, a promessa, a estrutura rica e os prompts de imagem dependem da F2 (síntese pela
  IA com revisão humana). Link para Pilar não publicado ainda sai como "destino não resolvido" (F2).
- Testes: `tests/radar-heading-cleanup.test.mts`, `tests/radar-intent-adherence.test.mts`, regressões do parecer
  direto; suíte do Radar 2698/0; Redator 357/0; Arquiteto 2737/0; agent 65/0. Saídas douradas do CSV inalteradas.

## Texto da keyword pelo snapshot do ArticleDNA — 2026-10-01

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- Sintoma: "A keyword … (principal) não teve o texto resolvido", artigo "Não hidratado" e nenhuma consulta central
  de SERP ("instagram não traz pacientes", principal trocada pela melhoria no Arquiteto).
- Causa: a hidratação só achava o texto na lista de keywords do Minerador carregada na tela. Com o Radar aberto
  direto, ou com uma principal nova que não está nessa lista, o texto não vinha.
- Correção: `createRadarHydrationSnapshot` e o contexto de pesquisa usam o snapshot da KeywordDNA gravado na
  própria referência do ArticleDNA (`keywordDnaSnapshot.sourceKeywordSnapshot.keyword`). É a mesma keyword, pelo
  mesmo id: nada é casado por texto. Referência sem snapshot e sem lista continua fora, sem invenção.
- A reconciliação refaz a hidratação que descreve uma versão ANTERIOR do ArticleDNA (antes ela pulava qualquer
  item já hidratado, e a troca de principal deixava o Radar preso na composição velha). O nome do Silo vem do
  SiloDNA aprovado quando a lista do Minerador não traz.
- **Causa principal (encontrada no local):** a tela montava o mapa de artigos com `Object.fromEntries` sobre a lista
  remota, que vem da versão mais nova para a mais velha; a última entrada (v1) vencia. O item do Radar estava na v4 e
  a coleta recusava com "A versão do ArticleDNA local diverge da versão transportada pelo item do Radar". Agora
  `latestVersionByKey` (em `components/editorial-pipeline-context.tsx`) fica com o maior `versionNumber` — vale para
  ArticleDNA e SiloDNA. Validado no local: a linha mostra a principal da v4 e o Silo, com "Iniciar Pesquisa Google".
- Teste: `tests/radar-hydration.test.mts`; suíte do Radar 2687/0.

## Planejador aposentado: o Radar entrega ao Redator — 2026-10-01

**Verificado no código e confirmado por teste. Validado manualmente: não. Nada foi gravado no banco remoto.**

- `lib/radar/planner-handoff.ts` virou `lib/radar/handoff-readiness.ts` (só a prontidão
  de entrega). O envelope V3 do Planejador e `radar-planner-send.ts` saíram.
- O Relatório diz "Pacote para o Redator?" e "Pronto para o Redator".
- O pacote aprovado do relatório (RadarApprovedPackage) é gravado em `approvedPackage`.
  `plannerPackage`, `plannerTransfer` e `plannerBundle` são opcionais e só de leitura;
  `radarApprovedPackageOf` lê o novo e cai no legado. O reset zera os três.
- `writerTransfer` usa `RadarTransferReceiptSchema`.
- Pendência: a etiqueta `packageType: "radar_planner_handoff"` continua no pacote gravado
  (dado já existente); sai na migração de banco.
- SDD: `docs/compartilhado/sdd-aposentar-planejador-2026-10-01.md` §8.2.

## Keyword inteira e com a sobra da planilha — 2026-10-01

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- Na planilha, a coluna Artigo (onde está a keyword) é `fill: true`. Ela recebe toda a sobra
  de largura. A `OperationalDataGrid` ganhou `fill` como campo opcional e aditivo, e Planejador
  e Publicações não mudam.
- A keyword da linha deixou de ser cortada com “…”. A regra raiz do `globals.css` também vale
  aqui: `.text-keyword` nunca trunca.
- Contrato: `docs/compartilhado/sistema-visual.md` §5.0.1.

## Google base, YouTube/Amazon acréscimos, ponto do especialista — 2026-09-30

```text
SDD = docs/05-radar/sdd-google-base-e-parecer-direto-2026-09-30.md (aprovada) · MIGRATION = aplicada pelo dono e conferida (Parte B) · ESCRITA_REMOTA_DO_AGENTE = 0 · PROVIDER_CALLS = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

Parte A (implementada):
- **Tela:** o seletor “Pesquisar em” (escolha única) virou abas:
  - “Google · base”, sempre disponível;
  - “+ YouTube (vídeo)” e “+ Amazon (review)”, liberadas depois do Google
    finalizado, com o motivo escrito (`radar-format-extension-hint`).
  - A trava “Zere para trocar” e a de universo único saíram.
  - A regra é `radarGoogleBaseCommitment` (`lib/radar/search-mode.ts`).
- **Servidor:** as rotas pagas de YouTube e Amazon chamam `assertRadarGoogleBase`
  (`lib/server/radar-google-base.ts`) antes de `startRadar*Run`. Sem o Google
  finalizado, a resposta é `409 radar_google_base_required`, e nada é pago.
- **Pacote** (`evidence-bundle-runtime.ts`):
  - com o Google finalizado, ele é o PRIMARY;
  - YouTube e Amazon entram como SUPPORT (`FORMAT_EXTENSION`);
  - o blueprint de vídeo e o de review vão em `formatBlueprints` (opcional; o
    hash só-Google não muda);
  - o R3 de 2026-09-28 (YouTube ou Amazon como primário, com o Google de apoio)
    saiu, junto com os auxiliares dele.
- **CSV:** `research_status_md` ganhou “Acréscimos de formato”, só quando há
  acréscimo.
- **Testes:** os que prendiam o modo único ou o R3 foram reescritos para a regra
  nova; um teste histórico ficou marcado como revogado. `test:radar` 2717, 0
  falhas.

Parte B:
- **Feito sem migration:** a camada do especialista passa a usar o ponto de
  revisão associado na revisão (`relatedRequirementId`), como a tela.
- **Migration:** o dono aplicou
  `supabase/migrations/20260930120000_expert_contribution_platform_channel.sql`
  (canal `platform` + `authored_by`, com rollback) e fez o `migration repair`.
  A leitura remota conferiu a coluna `authored_by` e os CHECKs
  `expert_contributions_provider_check` (telegram | platform) e
  `ck_expert_contribution_platform_authorship`.
- **Campo “Escrever o parecer aqui”** (aba Especialista,
  `radar-specialist-direct-entry`): especialista, tipo (Resposta a um ponto de
  revisão, Fechamento do artigo, Argumentação do CTA, Diretriz de conteúdo),
  ponto respondido quando é resposta, texto até 20.000 caracteres.
  - Rota `POST /api/editorial/expert-contributions/platform`: pede sessão, acesso
    à Marca e `radar:edit`. O autor é quem está logado.
  - Núcleo `lib/server/expert-platform-contribution.ts`: confere a migration
    antes de qualquer escrita, reaproveita a pauta do ponto ou cria uma pauta
    própria (tipos livres ganham o ponto sintético `direto:<tipo>:<id>`), grava
    a contribuição como `platform` e confere pela releitura.
  - O parecer entra em “Respostas recebidas” como contribuição a revisar. Só vai
    ao pacote depois de aceito, pela mesma revisão do Telegram.
  - O ponto sintético não conta como ponto preparado pela investigação.
- **Canal na tela e no pacote:** cada resposta mostra o canal real (“Plataforma”
  ou “Telegram”). O `provider` vai à evidência e à proveniência. Resposta sem
  canal declarado continua “telegram”, então o hash de pacote já entregue não
  muda.
- **Testes:** `tests/radar-especialista-parecer-direto.test.mts` (9). Suítes:
  `test:radar` 2727 (1 pulado, 0 falhas), `test:redator` 358, `test:agent` 65.
  `tsc` limpo e lint sem erros.
- **Não verificado:** o envio real pela tela. A Marca AdalbaPro não tinha artigo
  no Radar na checagem local, e o envio grava no banco de produção, então fica
  para a homologação do dono.

**Pendências:**
- O Redator ainda não lê `formatBlueprints`: escreve o artigo; o roteiro de vídeo
  e a lista de produtos do review ficam no pacote.
- O CSV do review ainda não traz produtos, links nem o aviso de afiliado, que só
  saíam com a Amazon primária.
- Homologação na tela: do dono.

## “Para escrever” pelo MCP e núcleo do export no servidor — 2026-09-30

```text
SDD = docs/compartilhado/sdd-mcp-jornada-completa-2026-09-30.md (F1, aprovada) · MIGRATION = 0 · ESCRITA_REMOTA = 0 · PROVIDER_CALLS = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- **Extração sem mudança de comportamento:** a montagem por artigo do export portátil saiu da rota
  `/api/editorial/radar-export` para `lib/server/radar-portable-export-core.ts`
  (`assembleRadarPortableExport`), junto com `estadoComercialCanonico` e
  `identidadeDoArticleDna`. A rota virou adaptador: autorização da sessão, formato
  (`writing`/`full`), silo e fluxo da resposta. O cliente das leituras de alvo e do cache chega
  como parâmetro; a rota passa o da sessão.
- **MCP `get_article_for_writing`** (`platform.read` + `radar:view`): o MESMO CSV “Para escrever”
  de um artigo finalizado (`radarWritingExportForArticle`), em partes de até 12 mil caracteres
  (`sliceWritingCsv`). Juntas na ordem, as partes formam o arquivo byte a byte. Grátis e só
  leitura.
- **Testes:** os estruturais que liam o texto da rota passam a ler rota + núcleo; `test:radar`
  2716/2716, com os testes que executam a rota (`radar-export-escrita-rota`,
  `radar-export-leitura-por-artigo`) inalterados.
- **Pendente (usuário):** baixar “Para escrever” na tela e comparar com o que a IA recebe.

## Correções do corretor sobre as frentes de 2026-09-28 — 2026-09-28

```text
ORIGEM = revisão da frente R (R1-R3) da SDD sdd-serp-no-artigo-e-kgr-opcional-2026-09-28
EXPORT_PORTATIL = lentes do Google no dossiê de YouTube/Amazon saem na coluna de lentes (antes: vazia, "não se aplicam")
MIGRATION = 0 · SQL = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- Export portátil (`lib/radar/portable-export-batch.ts` e
  `lib/radar/portable-serp-observed.ts`): as lentes congeladas saem de
  `bundle.serpLenses` em qualquer perfil que as traga. Com o Google finalizado
  como apoio (R3), a coluna mostra as lentes em vez de dizer que não se aplicam;
  sem o Google, o dossiê de vídeo ou de produto continua "não se aplicam". O
  teste `tests/radar-portable-lentes-congeladas.test.mts` foi atualizado ao
  contrato do R3 (YouTube e Amazon só acrescentam).
- Planejador (outro módulo, só rótulo): "KGR não aplicável" no lugar de "Não
  classificado como KGR".
- Suítes: `test:radar` 2716/2716, `test:redator` 358/358, `test:redator:mcp`
  117/117, `test:serp-cache` 34/34.

Pendências, fora desta correção:
- Redator (`lib/server/writer-evidence-reader.ts`, linhas 249, 618, 719 e
  1233): o manifesto, os fundamentos e o material de seção tratam todo perfil
  diferente de GOOGLE como "fotografia do Google ausente" e recusam ler
  `observed`. Com o R3 o pacote pode trazer a fotografia do Google como apoio.
  Ajustar é mudança do módulo Redator, com testes próprios (`test:redator`,
  `test:redator:mcp`).
- `collect_auxiliary` (`app/api/editorial/serp/route.ts`) sem guarda de volume
  no servidor; investigações já iniciadas com auxiliares sem volume em PLANNED
  continuam coletando na retomada. Falta decidir o destino desses registros.

## Integração das frentes de 2026-09-28 (catálogo MCP) — 2026-09-28

```text
INTEGRACAO = frentes M (M1-M4), D (D1-D2), A (A1-A5) e R (R1-R3) da SDD sdd-serp-no-artigo-e-kgr-opcional-2026-09-28
CATALOGO_MCP = lib/agent/platform-catalog.ts atualizado na mesma entrega (AGENTS §17.1) · npm run test:agent = 56/56
ROTA_NOVA_NO_CATALOGO = /api/arquiteto/article-allintitle (em arquiteto.validate_serp)
MIGRATION = 0 · SQL = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- Catálogo: `radar.investigate` ganhou as notas do reaproveitamento da coleta do
  Arquiteto pelo cache (4 lentes, 30 dias), da secundária sem volume como
  "Somente contexto", de YouTube e Amazon que só acrescentam e do rótulo
  "KGR não aplicável".
- Suítes: `test:radar` 2716/2716, `test:redator` 358/358.

## SERP no artigo e KGR opcional — fatias R1, R2 e R3 do Radar — 2026-09-28

Fonte: [SDD "SERP no artigo e KGR opcional"](../compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md), seções 3.4, 6.4, 8 e 10 (aprovada pelo dono em 2026-09-28). Item 5 da decisão: "a busca no Google reaproveita a mesma coleta do Arquiteto (mesmo cache). YouTube e Amazon só acrescentam dados; nunca substituem nem apagam os dados de busca no Google".

```text
R1_CHAVE_IGUAL        = já funcionava · provado por teste · nenhum código de produção mudou nesta fatia
R2_SEM_VOLUME         = secundária ou reforço sem volume → CONTEXT_ONLY · sem consulta auxiliar (4 lentes pagas a menos por keyword)
R3_GOOGLE_PRESERVADO  = Google finalizado + YouTube ou Amazon → Google SUPPORT com observed, refs e contagens do congelado e serpLenses
ROTULO_KGR            = "Não classificado como KGR" → "KGR não aplicável"
HASH_DOS_OUTROS       = dourados iguais (só Google, só YouTube, só Amazon)
CHAMADAS_PAGAS = 0 · MIGRATIONS = 0 · SCHEMA_NOVO = 0 · CAMPO_NOVO_EM_STRICT = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: NÃO.**

### R1 · a busca no Google reaproveita a coleta do Arquiteto

- O reaproveitamento é pela CHAVE do cache (`serp_cache_entry`): keyword normalizada (trim + minúsculas) × localidade × idioma × lente × `advanced`. `collectedBy` não é filtro. Nada foi mudado no núcleo (`lib/server/radar-serp-lenses.ts`).
- Provado em `tests/radar-serp-reaproveita-arquiteto.test.mts`:
  - chave igual entre a rota `keyword-serp`, a formação (`formationSerpCacheRequest`) e o Radar nas 4 lentes, em três casos: keyword fora do acervo lido, keyword **sem medição do Minerador** (a SERP deixou de ser obrigatória lá) e keyword com targeting em inglês. Também com o ambiente em `pt-br` e com outra grafia da keyword;
  - o Radar lê as 4 lentes que o Arquiteto pagou: 0 chamada, nenhuma credencial, nenhum uso registrado, nenhuma entrada nova no cache, `collectedBy: "arquiteto"` em cada lente e na proveniência;
  - o snapshot lido do cache tem o mesmo `contentHash` do pago pelo próprio Radar;
  - config ≠ ambiente: o Radar consulta e grava pelos códigos da chave, nunca pelos da config;
  - em produção a config da SERP tira localidade e idioma do mesmo leitor da chave (`buildDataForSeoSerpConfig` → `readDataForSeoTargetCodes(process.env)`), e nenhuma das rotas injeta outro ambiente.
- **O desvio de `keyword-serp` não foi editado.** A rota paga sob os códigos da config quando eles divergem do ambiente (`app/api/arquiteto/keyword-serp/route.ts`, bloco `keyword_serp_cache_codes_diverge`). Em produção esse ramo não é alcançável (mesmo leitor, mesmo `process.env`). A rota está sendo reescrita pela fatia A2 do Arquiteto neste mesmo momento, e mexer nela aqui criaria conflito. Registrado no backlog.
- Limites conhecidos, sem mudança (decisões do dono ou da SDD):
  - validade de 30 dias (D4 aberta): depois disso o Radar paga as lentes vencidas;
  - canônica gravada sem corpo por outro gravador: o Radar paga só a canônica (provado por teste). O Arquiteto grava o corpo da canônica;
  - apoio Google da Amazon com texto derivado ("X review", "A vs B"): chave própria, paga as 4 lentes. É acréscimo, não substituição (SDD 7.5);
  - o YouTube consulta o endpoint próprio, sem cache.

### R2 · keyword sem volume não gera consulta auxiliar

- `lib/radar/research-query-plan.ts`: secundária ou reforço com volume nulo, zero ou inválido vira `CONTEXT_ONLY`, com o motivo "Sem volume de busca registrado no ArticleDNA: a keyword não gera consulta própria e permanece como contexto.". A principal continua `EXECUTE` (é a âncora). Keyword sem texto continua `NOT_EXECUTABLE`.
- O predicado é `radarQueryHasSearchVolume`, igual a `hasSearchVolume` do Arquiteto (teste de equivalência). Ele foi repetido no Radar para o plano não carregar o módulo de formação do Arquiteto.
- `startRadarDeepResearch` grava essas consultas como `NOT_EXECUTED`, e `radarResearchResumption` não as põe na fila de coleta auxiliar.
- Investigações já iniciadas mantêm as disposições gravadas no registro. A rota `collect_auxiliary` não ganhou guarda de servidor (ver backlog).
- Teste: `tests/radar-plano-sem-volume.test.mts`.

### R3 · YouTube e Amazon acrescentam; o Google finalizado continua no dossiê

- Antes: com o Google finalizado e depois um YouTube ou uma Amazon finalizados, o perfil primário passava a ser o de vídeo ou o de produto (precedência fixa, que continua), e o Google ia só como referência ao snapshot de apoio, sem `observed` e sem `serpLenses`. O hash desses dossiês era igual ao de um YouTube ou de uma Amazon sozinhos: o Google finalizado ficava invisível ao Planejador e ao Redator.
- Agora (`lib/radar/evidence-bundle-runtime.ts`), com `finalizedBundle` presente e perfil YOUTUBE ou AMAZON:
  - `research.google` é `SUPPORT`, com a referência do snapshot da análise (`SEO_SUPPORT` no YouTube, `SEO_COMMERCIAL_SUPPORT` na Amazon), a assinatura do snapshot, o `frozenAt`, as contagens do CONGELADO e as limitações dele. A referência de apoio que aponta para outro snapshot continua como segunda referência;
  - `observed` viaja quando confere com o congelado: mesmo artigo, mesma versão do ArticleDNA e a régua de `radarObservedDivergesFromFrozen` (extraída de `radarDossierDivergesFromFrozen`, sem mudar o comportamento dela). Se divergir, ou se não passar na conferência de proveniência do dossiê, não viaja, e o motivo vai para `limitations`. O pacote de vídeo ou de produto continua pronto;
  - `serpLenses` e as limitações das lentes entram como no perfil Google;
  - `serpStanding` continua o do perfil primário (sem mudança).
- `lib/server/radar-canonical-authorities.ts` monta a fotografia do Google (e lê os snapshots) também quando o Google foi finalizado fora do perfil GOOGLE.
- Hash: só o caso "Google finalizado + YouTube ou Amazon" muda. Os dourados de só Google, só YouTube e só Amazon foram medidos antes da mudança e continuam iguais. Dossiês já entregues (`plannerBundle`, `writerBundle`) não são recalculados. Um novo envio desse caso sai como `NEW_VERSION`, com mais evidência.
- Nenhum schema mudou: o dossiê V3 não é `.strict()`, e `observed` e `serpLenses` já existiam. Continua havendo uma única camada PRIMARY. Não há ordem de deploy nova.
- Consumidores que passam a receber a fotografia nesse caso:
  - Planejador e Redator, pelo dossiê. `lib/redator/radar-foundations.ts` lê `bundle.observed` sem olhar o perfil;
  - as linhas da virada do Assunto no envio ao Redator (`authorities.google.articleModel`);
  - o export "Para escrever" (`googleObserved`).
- Testes: `tests/radar-dossie-google-preservado.test.mts` e o caso YouTube de `tests/radar-serp-lentes-congeladas.test.mts`. Esse caso foi atualizado: antes afirmava que as lentes do Google não entravam no dossiê de vídeo, e a regra mudou por decisão do dono.

### Rótulo do KGR

- `radarKgrClassificationLabel("not_kgr")` passa de "Não classificado como KGR" a "KGR não aplicável" (tela de análise do Radar). O Planejador tem o mesmo texto em `modules/planejador/planner-cockpit-workspace.tsx:70`, fora desta frente.

### Arquivos

- Produção:
  - `lib/radar/evidence-bundle-runtime.ts`;
  - `lib/radar/planner-handoff.ts` (função extraída, sem mudança de comportamento);
  - `lib/radar/research-query-plan.ts` (CRLF preservado);
  - `lib/radar/strategy-context.ts`;
  - `lib/server/radar-canonical-authorities.ts`.
- Testes novos: `tests/radar-serp-reaproveita-arquiteto.test.mts`, `tests/radar-plano-sem-volume.test.mts` e `tests/radar-dossie-google-preservado.test.mts`. Atualizado: `tests/radar-serp-lentes-congeladas.test.mts`. O glob de `test:radar` já pega os três novos.
- Não editados: `app/api/arquiteto/keyword-serp/route.ts`, `lib/agent/platform-catalog.ts`, `package.json` e a SDD.

### Testes executados

- `npm run test:radar`: 2716 de 2716. A linha de base, antes da mudança, era 2685 de 2685.
- `npm run test:redator`: 358 de 358. `npm run test:redator:mcp`: 117 de 117. `npm run test:serp-cache`: 34 de 34.
- `npm run test:editorial`: 170 de 174. As 4 falhas são de `tests/editorial-pipeline.test.mts` e leem arquivos fora desta frente (página de conta, layout do Admin, página da Marca e `arquiteto-workspace.tsx`). Nenhuma delas lê arquivo desta frente.
- TypeScript (`tsc --noEmit`): nenhum erro nos arquivos desta frente; os erros restantes são de testes de outras frentes em andamento. ESLint direcionado: sem erro. `git diff --check`: limpo.

## Assunto declarado no Radar (F3) e no export "Para escrever" (F4.3) — 2026-09-24

Fonte: [SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), seções F3, F4.3, 6 e 7. O Assunto é o tronco que o humano declara no Minerador e o Arquiteto fixa em `ArticleDNA.subject` (F2 fase A: o schema já aceita). **O Radar lê o Assunto e nunca o troca, promove nem rebaixa** (`AGENTS.md` §7; P8).

```text
SEM_ASSUNTO            = saída byte a byte igual · hashes dourados, export J e as 13 colunas verdes
CONSULTAS_GOOGLE       = nenhuma muda (plano idêntico com e sem Assunto, deepEqual)
YOUTUBE                = DECLARED_SUBJECT dentro do teto de 6 · toma o lugar da última da fila · dito em limitations
VIRADA                 = seção exigida (DNA_REQUIRED), inclusive sintética com 0 páginas · nunca H2 por decreto
CRITERIO               = LEXICAL_STEMS (radarSemanticStems) · declarado no alerta e no rótulo
FINALIZE               = não bloqueia · subject NÃO vai ao bundle · schema .strict() do bundle sem mudança
ENTREGA_AO_REDATOR     = linhas curtas em importedContext.editorialContext no envio · só com Assunto · dossiê e bundle sem mudança · painel e semeadura do Redator leem pela projeção única
TELAS_E_ESPECIALISTA   = rótulo "Exigida pelo Assunto" no r3 · prompt das pautas com o Assunto · Telegram e painel do especialista em texto simples ("Tema a aprofundar", "Pergunta")
CHAMADAS_PAGAS = 0 · LEITURAS_NOVAS_NO_RADAR = 0 · MIGRATIONS = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: NÃO.** Nenhum ArticleDNA real tem `subject` ainda: o comportamento só aparece quando o Arquiteto gravar o Assunto, na F2 fase B (em implementação por outro fluxo). Até lá, todo artigo real segue o caminho sem Assunto.

- **Contexto de pesquisa:** `RadarArticleResearchContext.article.subject = { phrase, note, destinationUrl }`, lido de `ArticleDNA.subject`. Sem Assunto a chave não existe (nem `null`). O `keywordId` do Assunto não entra.
- **Mapa de uso:** linha `article.subject` no `RADAR_FOUNDATION_USAGE_MAP`, com seis consumidores nomeados (modelo editorial, blueprint, modelo observado, YouTube, especialista e read model portátil).
- **YouTube:** origem `DECLARED_SUBJECT`, logo depois de `PRIMARY_KEYWORD`, só em plano com camada de vídeo. O plano sai com o mesmo número de consultas que teria sem Assunto; a última da fila sai e isso vai para `limitations`. Vale também em fila curta (3 continua 3): zero chamada a mais.
- **Especialista:** `RadarR6ExpertTopicContext.articleDna.subject = { phrase, note, destinationUrl, request }`, com o pedido "Aprofundar o Assunto e a virada: o que o leitor desta busca precisa entender para chegar a <Assunto>?". `principal` continua sendo a promessa.
  - O r7 aceita pauta ligada ao Assunto como necessidade real, medindo só por `phrase` e `note` (o texto do pedido não conta).
  - Quando nenhuma pauta da IA cobre as raízes da frase, `radarR7SubjectTopic` acrescenta no fim da fila a pauta de aprofundamento, montada só com o que o ArticleDNA declara. Desde a terceira rodada, o texto dessa pauta é a pergunta simples, sem o pedido interno. Continua sujeita à revisão humana individual.
- **Leitura da amostra** (`observed.declaredSubject`, tipo `RadarDeclaredSubjectSampleReading`): raízes da frase e da nota, sem as da principal, em título, H1, H2 e H3 das páginas comparáveis. Traz `basis` (`PAGES` | `NO_PAGES` | `NO_DISTINCT_STEMS`), `pagesTouching`, `titlePagesTouching`, `headingPagesTouching`, `sampleSize`, `placementSignal`, `label` e `alert`.
- **Alerta** quando nenhuma raiz toca a amostra: "Nenhuma coincidência de termos entre o Assunto e as páginas das buscas de sustentação (critério por palavras). …" (`RADAR_SUBJECT_NO_TOUCH_ALERT`). Vai para `observed.limitations`, daí para o relatório, `blueprint.limitations` e o bundle. Não bloqueia o FINALIZE e não altera o ArticleDNA. Sigla curta sem termos próprios (ex.: "SEO para clínicas" contra "marketing para clínicas") gera alerta próprio que diz o limite; a virada continua exigida.
- **Modelo editorial** (`RadarEditorialArticleModel.declaredSubject`, tipo `RadarEditorialSubjectTurn`):
  - a frase entra nos exigidos de `territorioDoArtigo`;
  - grupo observado que cobre todas as raízes da frase ganha `dnaRequired` com o motivo próprio (`RADAR_SUBJECT_MUST_COVER_REASON`), sem seção duplicada;
  - sem candidato, nasce a seção sintética "Virada para <Assunto>" (id `section:subject-turn:<hash>`, `DNA_REQUIRED`, `evidenceRefs` vazio, 0 páginas);
  - lugar (`placement`): H3 do anfitrião que mais toca as raízes, ou ponto a cobrir no eixo prático. Nunca H2 por decreto, nem com menos de três seções. Única exceção: amostra sem nenhuma seção (`ALONE`), dito em `limitations`;
  - posição sugerida (`suggestedPosition`, `suggestedPositionLabel`) com contagem ("aparece em N de M página(s)"). Com grupo observado sem posição, o rótulo aponta a seção da amostra que já trata o Assunto. Sem sinal: "Sem sinal na SERP: o Redator decide.";
  - complemento do H1 (`h1Complement`, com `titlePages` e `headingPages`): sugerido só com as raízes em títulos do topo (piso de 2 páginas). "Assunto em H2/H3" só quando `headingPages > 0`; com 0 de N ou sem leitura, o rótulo é "sem sinal". A principal continua dona do H1.
- **Blueprint e FINALIZE:** o bloco sintético entra em `blueprint.sections`, com o mesmo id do modelo, só quando nenhum candidato observado cobre o Assunto, e congela como qualquer seção. O resumo do blueprint (`buildRadarBlueprintSummary`) não conta a seção sintética como bloco. `operational-view` a ignora na verificação do dossiê.
- **CTA:** `conclusion.destinationDirection = "Levar o leitor a <destino>."` ao lado de `callToAction`, que fica intacto. No read model portátil: `editorial.ctaDestination` e `editorial.subjectTurn`. O brief do export técnico ganha "Destino da chamada" **só com Assunto**; sem ele, o J segue idêntico ao dourado.
- **Export "Para escrever" (F4.3, `lib/radar/portable-writing-export.ts`)**, tudo só com Assunto:
  - `artigo`: "Assunto (tronco): <frase>" abaixo de "Keyword principal"; o "Não altere" inclui o Assunto declarado;
  - `promessa_e_leitor`, antes de "Abertura": "Tronco (Assunto): <frase> — <nota>." e "Virada: <onde>, levar o leitor de <principal> a <Assunto>; destino: <url>." Sem sugestão, o "onde" diz que quem redige decide; no caso ponto a cobrir, nomeia o anfitrião. Com destino, "Destino da chamada: …" logo abaixo de "Chamada final", que fica intacta;
  - `titulo_e_seo`: "Direção do H1: <principal> + complemento "<Assunto>" (sugestão do Radar; a decisão é de quem redige)." ou "Assunto em H2/H3 — o H1 é da principal." (só com sinal em H2/H3) ou `RADAR_WRITING_SUBJECT_H1_NO_SIGNAL`;
  - `estrutura`: nenhuma linha inventada; a seção da virada vem do modelo do Radar como "Obrigatória pelo ArticleDNA: <motivo próprio>". O filtro que engolia motivos "o ArticleDNA declara" deixa passar exatamente esse motivo. O ponto "virada para <Assunto>" vai à frente do corte de 4 pontos. A seção sintética leva a marca `RADAR_WRITING_SUBJECT_WORKING_TITLE` ("Título de trabalho do Radar: reescreva para o leitor antes de publicar.");
  - limites de célula e de artigo respeitados com nota de 280 caracteres e URL longa.
- **Especialista, telas e entrega ao Redator (segunda rodada, mesma data). Verificado no código e confirmado por teste. Validado manualmente: NÃO.**
  - **Prompt das pautas** (`app/api/editorial/radar-topics/route.ts`): o `SYSTEM_PROMPT` não mudou (sha256 igual ao do HEAD, fixado em teste). Com Assunto, `buildSystemPrompt` junta a ele as linhas de `radarExpertTopicsSubjectPromptLines` (`lib/radar/expert-brief.ts`): frase e nota; a principal continua sendo a promessa; pedido de pautas que aprofundem o Assunto e a virada, com o texto de `subject.request`; origin ArticleDNA, need ligado ao Assunto e reference da proveniência; proibido trocar a principal ou reescrever o Assunto. Sem Assunto, o prompt do sistema é o próprio `SYSTEM_PROMPT`. A garantia continua no r7; o prompt só pede.
  - **Telegram** (`buildRadarExpertBriefTelegramMessage`), texto da segunda rodada, **substituído na terceira** (abaixo): com Assunto, "Assunto (tronco): <frase>" e "Pedido: <request>" logo depois de "Tema:". Nota, destino e a palavra ArticleDNA não vão ao especialista. Pauta persistida sem `request` monta o pedido pela frase (`radarSubjectDeepeningRequest`). Sem Assunto, a mensagem bate com os hashes do HEAD.
  - **Painel do especialista** (`radar-expert-brief-panel.tsx`): só com Assunto, bloco `radar-specialist-subject` no cabeçalho com frase, nota e pedido (na terceira rodada: "Tema a aprofundar", nota e "Pergunta"), em `text-sm` com tokens. Uma leitura só (`radarExpertBriefSubjectOf`) serve o painel (`context.articleDna`) e o Telegram (`radarContext.article` persistido).
  - **Telas do r3**, lidas pelo helper puro `modules/radar/radar-subject-turn-view.ts` (`RADAR_SUBJECT_TURN_SCREEN_LABEL = "Exigida pelo Assunto"`, contagens e numeração):
    - workbench: "Ver candidatos observados · N" conta só os blocos observados; com a virada, "Ver candidatos observados · N · 1 exigida pelo Assunto";
    - r3-blueprint: a virada fica sem número, com o rótulo "Exigida pelo Assunto" (`text-sm text-context-accent`) no lugar de prioridade e posição; os observados continuam numerados de 1 a N;
    - artigo-modelo: selo "Exigida pelo Assunto" na virada (outra seção exigida pelo DNA mantém o selo "Exigido pelo ArticleDNA"); bloco do Assunto com "Assunto (tronco)", "Onde virar" (`suggestedPositionLabel`), "H1" (`h1Complement.label`), contagem na amostra e alerta (`text-sm text-warning`); "Destino da chamada" na Conclusão;
    - o alerta aparece em 14px nas limitações do blueprint e no bloco da virada. `radar-r3-serp-panel` não mudou: as limitações dele vêm do modelo competitivo, que não recebe o alerta do Assunto;
    - sem Assunto, o markup do blueprint, do cartão de resumo e do artigo-modelo é igual ao do HEAD (renderizado com as mesmas fixtures, hashes fixados no teste).
  - **Entrega ao Redator** (`lib/server/radar-writer-send.ts`, `lib/redator/radar-import.ts`, `lib/redator/radar-subject-turn.ts`):
    - com Assunto, o envio grava linhas curtas em `importedContext.editorialContext` (`radarWriterSubjectTurnLines`): Tronco; Virada (onde virar, da principal ao Assunto, com o destino); Seção da virada (a sintética avisa que o título é de trabalho do Radar); Direção do H1, ou "Assunto em H2/H3 — o H1 é da principal.", ou sem sinal; Destino da chamada; Alerta;
    - origem: `authorities.google.articleModel.declaredSubject` e o `subject` do ArticleDNA fixado pela identidade do envio. A sugestão só vale se a frase do artigo-modelo for a mesma do ArticleDNA; sem fotografia do Google, ou com virada de outra frase, as linhas devolvem a decisão a quem redige sem inventar lugar;
    - o texto é o do CSV "Para escrever" (teste linha a linha em três Assuntos). Diferença intencional: o destino vai como declarado, sem a limpeza de `utm_*` do CSV, porque é o endereço que o Guardião confere;
    - com Assunto, o `writerMayNot` gravado no recibo e no documento (`radarWriterDossierOf`) ganha "trocar ou remover o Assunto declarado" (`radarWriterMayNotFor`);
    - **não vai pelo dossiê:** o bundle V3 (`.strict()`, com hash) não traz o artigo-modelo nem `blueprint.sections`; bundle e dossiê não mudam (invariante 78). Sem Assunto, `editorialContext: []` e o documento do envio é igual ao do HEAD (snapshot sha `8b366688…`, medido em quatro variações). O consumo no Redator está em `docs/07-redator/estado-atual.md`, mesma data.
  - **Textos corrigidos na revisão:** `sampleLabel` diz "Palavras do Assunto aparecem em N de M página(s) da amostra (títulos e subtítulos)."; os rótulos de posição e de H1 do modelo trocaram "as raízes do Assunto" por "palavras do Assunto" (prefixos reconhecidos pelo CSV e pelo Redator intactos). Sem principal, a virada diz "levar o leitor da keyword principal a …", no CSV e no Redator.
  - **Arquivos:** novos `modules/radar/radar-subject-turn-view.ts`, `lib/redator/radar-subject-turn.ts`, `tests/radar-assunto-telas.test.mts`, `tests/radar-assunto-telas-fixtures.mts` e `tests/radar-assunto-entrega-redator.test.mts`; alterados `app/api/editorial/radar-topics/route.ts`, `lib/radar/expert-brief.ts`, `declared-subject.ts`, `editorial-article-model.ts`, `portable-writing-export.ts`, `lib/server/radar-writer-send.ts`, `lib/redator/radar-import.ts`, `modules/radar/radar-expert-brief-panel.tsx`, `radar-r3-workbench.tsx` (CRLF preservado, 1532/1532), `radar-r3-blueprint.tsx` e `radar-article-model.tsx`; testes `radar-assunto-f3` e `radar-to-writer-handoff-1` ajustados. `radar-page.tsx` não foi tocado.
  - **Testes e suítes:** `radar-assunto-telas` 14/14; `radar-assunto-entrega-redator` 9/9; um teste novo em `radar-to-writer-handoff-1` (envio real com portas: recibo e documento com a mesma lista, `editorialContext` igual às linhas da virada da F3, bundle sem artigo-modelo); `test:radar` 2684/2684 (hashes dourados, J e 13 colunas verdes; parte do aumento vem do fluxo concorrente do Arquiteto); `test:specialist` 265/265; `test:redator` 335/335; `test:redator:mcp` 117/117; `test:redator:dom` 14/14; `test:editorial` 170/174 com as 4 falhas de base por nome; `test:serp-cache` 34/34; `tsc --noEmit` exit 0; ESLint 0 erros (1 aviso antigo do HEAD em `radar-r3-blueprint.tsx`: `RadarVideoBrief` sem uso); guard visual estrito sem violação nos arquivos de `modules/radar`, nenhum `text-xs` novo; `git diff --check` limpo. Chamadas pagas: 0. Mutantes não rodados (dev server possivelmente no ar).
- **Texto simples ao especialista externo e Assunto no painel do Redator (terceira rodada, mesma data). Verificado no código e confirmado por teste. Validado manualmente: NÃO.**
  - **Rótulos** (`lib/radar/expert-brief.ts`):
    - `RADAR_EXPERT_SUBJECT_LABEL = "Tema a aprofundar"` (era "Assunto (tronco)");
    - novo `RADAR_EXPERT_SUBJECT_QUESTION_LABEL = "Pergunta"`;
    - `radarExpertSubjectQuestion(frase)` reutiliza `radarSubjectReaderQuestion` (`lib/radar/declared-subject.ts`): "o que o leitor desta busca precisa entender para chegar a <frase>?";
    - `RadarExpertBriefSubject` ganhou o campo `question`.
  - **Telegram:** com Assunto, a mensagem traz "Tema a aprofundar: <frase>" e "Pergunta: …" depois de "Tema:", sem "tronco", "virada", "ArticleDNA" nem "Pedido:".
    - Se a pergunta do Assunto já está na lista numerada (a comparação ignora maiúsculas e espaços), o cabeçalho leva só "Tema a aprofundar". Para isso, `radarExpertBriefSubjectLines(subject, { withQuestion })` ganhou a opção; a assinatura antiga continua valendo.
    - Uma pauta persistida com `request` sai em linguagem simples sem regravar: a pergunta é montada a partir da frase.
    - Sem Assunto, a mensagem bate com os hashes do HEAD.
  - **Painel do especialista** (`radar-expert-brief-panel.tsx`): mostra "Tema a aprofundar", a nota e "Pergunta", sem o pedido interno.
  - **Pauta do r7** (`radarR7SubjectTopic`): o `text` é `radarSubjectReaderQuestionText(frase)` ("O que o leitor desta busca precisa entender para chegar a <frase>?"), e não mais o `request`. Assim, uma pauta aprovada sem edição não leva jargão ao especialista. Justificativa e `need` não mudaram.
  - **Prompt das pautas:** o `request` da SDD continua no prompt interno (`radarExpertTopicsSubjectPromptLines`). Só com Assunto, esse prompt ganhou uma linha que manda escrever o `text` da pauta em linguagem simples, sem as palavras Assunto, tronco, virada ou ArticleDNA, com um exemplo da pergunta. Sem Assunto, a lista continua vazia e o `SYSTEM_PROMPT` fica byte a byte igual. A rota `app/api/editorial/radar-topics/route.ts` não mudou nesta rodada.
  - **No Redator:** as linhas que o envio grava em `importedContext.editorialContext` agora chegam ao painel dos fundamentos e à semeadura de roteiro e carrossel pela projeção única `radarFoundationsOf` (invariante 78). Registro em `docs/07-redator/estado-atual.md`, mesma data.
  - **Arquivos:** `lib/radar/expert-brief.ts`, `declared-subject.ts` e `r7-sequential.ts`; `modules/radar/radar-expert-brief-panel.tsx`; testes `tests/radar-assunto-telas.test.mts` (15/15: anti-jargão, `request` preservado no prompt e um teste de ponta a ponta do Telegram) e `tests/radar-assunto-f3.test.mts` (28/28). Todos LF.
  - **Suítes:**
    - `test:radar` 2685/2685 (hashes dourados, J e 13 colunas verdes), relatado pela rodada de correção. `radar-assunto-telas` e `radar-assunto-f3` foram reexecutados ao documentar (43/43);
    - `test:redator` 358/358, `test:redator:mcp` 117/117 e `test:redator:dom` 19/19;
    - `test:editorial` 170/174 e `test:visual-system` 23/28, com as falhas de base pelo nome;
    - `tsc --noEmit` exit 0; ESLint sem erros;
    - guard visual estrito PASS em `expert-brief.ts`, `r7-sequential.ts`, `declared-subject.ts` e no painel do especialista;
    - chamadas pagas: 0. Nenhuma mensagem real foi enviada ao Telegram.
- **Arquivos (primeira rodada):**
  - novos: `lib/radar/declared-subject.ts`, `tests/radar-assunto-f3.test.mts`, `tests/radar-assunto-f4.test.mts`;
  - alterados: `lib/radar/article-research-context.ts`, `foundation-usage-map.ts` e `youtube-search-queries.ts` (os três CRLF preservados), `r6-sequential.ts`, `r7-sequential.ts`, `competitive-observed-model.ts`, `editorial-article-model.ts`, `editorial-blueprint.ts`, `portable-read-model.ts`, `portable-export.ts`, `operational-view.ts`, `portable-writing-export.ts`; fixture `tests/radar-portable-writing-fixtures.mts` (nova `vistaDoGoogleSobre`, `vistaDoGoogle` intacta).
  - `investigation-finalization.ts` e o schema do bundle **não** mudaram (teste estrutural).
- **Testes (primeira rodada):**
  - `radar-assunto-f3` 28/28: contexto sem chave sem Assunto; mapa de uso; plano Google idêntico; YouTube no teto; especialista e pauta garantida; virada com 0 páginas não vira H2; grupo observado sem duplicata; posição e H1 com contagem; alerta com critério; CTA; pipeline real até o FINALIZE com `subject` fora do bundle e schema do bundle intacto; estrutural: nenhum arquivo do Radar atribui `.subject`, usa `ArticleDNASchema`/`DeclaredSubjectSchema`, importa `arquiteto-persistence` ou grava `editorial_artifact_versions`; fetch sentinela;
  - `radar-assunto-f4` 16/16: as 13 colunas sem Assunto iguais ao snapshot medido antes da mudança; J sem as linhas do Assunto; as linhas novas nas colunas certas; limites; `writerMayNot` e guardião (Redator).
- **Suítes (primeira rodada; a rodada final está acima):** `test:radar` 2660/2660 (hashes dourados e J verdes); `test:redator` 335/335; `test:redator:mcp` 112/112; `test:editorial` 170/174 e `test:arquiteto` 2272/2274 com as mesmas falhas de base por nome (0 novas); `test:serp-cache` 34/34; `tsc --noEmit` limpo; ESLint 0 problemas nos arquivos de código; `git diff --check` limpo.
- **Limites e riscos:**
  - **critério lexical, não semântico:** um Assunto próximo em sentido, dito com outras palavras, cai em "sem coincidência". O alerta diz o critério e não bloqueia; a leitura por sentido está no backlog;
  - palavras de menos de 4 letras não contam; palavras da nota também contam como toque, e uma palavra genérica pode tocar página sem relação;
  - na investigação já finalizada, o transporte compacto chega sem páginas: a leitura cai em `NO_PAGES` (sem alerta novo, sem H1, sem posição pela ordem); o alerta congelado segue no bundle;
  - YouTube: a consulta do Assunto sempre tira a última da fila, mesmo abaixo de 6;
  - um bloco observado só carrega a virada se virar candidato do blueprint (o conceito precisa citar a entidade da principal); senão nasce a sintética;
  - no blueprint, a cobertura observada é medida pelo `workingTitle`; no modelo, pelas raízes do grupo. Os dois critérios podem divergir (o bundle congelaria a sintética enquanto o modelo usa o bloco observado): falta teste de coerência;
  - a seção sintética continua em `blueprint.sections`; nas telas do r3 ganhou rótulo próprio (segunda rodada). Na lista do blueprint a virada fica sem prioridade nem posição de propósito: ali ela é sempre `FLEXIBLE`; o lugar sugerido está no artigo-modelo ("Onde virar");
  - a limpeza de URL do CSV tira `utm_*`, `gclid` e similares também do destino do Assunto (o `editorialContext` do Redator leva o destino como declarado);
  - o texto de `RADAR_SUBJECT_MUST_COVER_REASON` ("…e a arquitetura decide onde") foi mantido porque a SDD o fixa, mas repete "ArticleDNA" na marcação do CSV e tensiona com "quem redige decide": proposta de adendo no backlog;
  - a posição sugerida, o complemento do H1, a seção que carrega a virada e o alerta **chegam ao Redator por `importedContext.editorialContext`, gravado no envio, e não pelo dossiê**. Isso diverge do texto da SDD F4.1 ("chega pelo dossiê") e da F4.4 ("nenhuma leitura nova", do lado do Redator): **adendo técnico proposto, aguarda aprovação do dono antes do commit** (backlog);
  - no Redator, o painel e a semeadura de roteiro e carrossel passaram a mostrar essas linhas pela projeção `radarFoundationsOf` (terceira rodada). O MCP ainda as lê por conta própria: é pendência do Redator (ver `docs/07-redator/estado-atual.md`);
  - o r7 acrescenta a pauta do Assunto quando nenhuma cobre a frase: com 5 pautas da IA, a lista chega a 6, e a tela e o fluxo não foram conferidos com 6;
  - pautas persistidas antes da F3 não têm `article.subject` em `radarContext`: a mensagem do Telegram segue sem a linha do Assunto até a pauta ser salva de novo pelo painel;
  - desde a terceira rodada, a mensagem, o painel do especialista e a pauta do r7 dizem "Tema a aprofundar" e "Pergunta", em linguagem simples. Isso diverge do texto que a SDD fixa (F3.1 e §7: "Assunto (tronco)" e "Pedido: Aprofundar o Assunto e a virada…"). **O adendo à F3.1 precisa registrar a troca** (backlog); a SDD não foi editada;
  - documento enviado antes desta mudança, com ArticleDNA que já tinha `subject`, tem `writerMayNot` gravado sem a proibição e `editorialContext` vazio: reenviar resolve.

## Export "Para escrever" — 2026-09-23

Pedido do dono do produto: o CSV por silo tinha muitas colunas técnicas que
não servem para escrever. Agora ele leva só o que é indispensável para
escrever o artigo com outra ferramenta ou outra IA.

```text
FORMATO_PADRAO         = "Para escrever" · 13 colunas fixas · ~10 mil caracteres por artigo
FORMATO_TECNICO        = "Completo (técnico)" · byte a byte igual ao anterior (saída dourada J)
ROTA                   = POST /api/editorial/radar-export · mode "writing" | "full" opcional · sem mode = resposta de antes
LEITURAS_NOVAS         = 0 · mesmas montadas, lentes e plano do formato completo (teste da rota sobre PostgREST simulado)
CHAMADAS_PAGAS         = 0 · MIGRATIONS = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste** (`test:radar` 2615/2615, tsc limpo).

- **Colunas, sempre nesta ordem:** `ordem`, `pode_escrever`, `artigo`, `promessa_e_leitor`, `titulo_e_seo`, `estrutura`, `cobrir_e_superar`, `serp_resumida`, `fontes_e_especialista`, `links_internos`, `plano_visual`, `produtos`, `prompt`.
- **Linha de topo:**
  - "Silo" no export por silo: ordem narrativa inteira, SiloPage, tema, fronteira e regras gerais;
  - "Marca" no avulso e no arquivo sem silo.
- **`pode_escrever`:** Sim, Com ressalva ou Não, com o motivo.
  - A linha bloqueada leva só o prompt do bloqueio.
  - O roteiro de vídeo sai só com ordem, veredito, artigo e prompt.
- **Guardas:**
  - não gera título, ALT, legenda nem prompt de imagem: sai o que foi gravado, ou a falta com o motivo;
  - sem FAQ (AGENTS 13);
  - terceiros são pesquisa;
  - a estrutura e a extensão são decisão de quem redige (invariante 48: o Planejador saiu do pipeline e quem escreve também planeja);
  - conteúdo publicado leva URL, canonical e estado da principal; sem política, "estado desconhecido — não trocar até decisão humana";
  - Silo sem plano de links diz isso e não inventa link.
- **Limpeza:** sem UUID, hash, instante ISO, código cru, provider nem rastreio de URL. A Amazon perde tag e ref. Toda célula tem guarda contra fórmula do Excel.
- **Limites:** célula até 6.000 caracteres (estrutura 8.000), artigo até 20.000. O corte começa por `serp_resumida` e é sempre declarado.
- **Aviso de tamanho e bloqueados:** o aviso de tamanho usa a conta do formato escolhido. O aviso do silo conta os artigos bloqueados.
- **Nomes:** `silo-<nome>-para-escrever-<data>[-parcial].csv`, `sem-silo-para-escrever-<data>.csv`, `artigos-para-escrever-<data>.csv` e `silos-para-escrever-<data>.zip`. Os nomes do formato técnico não mudaram.
- **Arquivos:**
  - novos: `lib/radar/portable-writing-export.ts`, `lib/radar/portable-writing-batch.ts`, `tests/radar-portable-writing-export.test.mts`, `tests/radar-export-escrita-rota.test.mts` e `tests/radar-portable-writing-fixtures.mts` (fora do glob);
  - acréscimos compatíveis: `lib/radar/portable-silo-export.ts` (campo `writing` opcional), `portable-export-estimate.ts` (modos, `exportMode` opcional), `portable-silo-scope.ts` (`blocked` opcional) e a rota (`mode` opcional);
  - `tests/radar-export-leitura-por-artigo.test.mts`: a regex do E4 aceita a linha `exportMode`.
- **Card "Exportar para escrever"** (pedido: "só os que realmente são úteis"; opção escolhida "2 opções + Avançado fechado"):
  - o botão Exportar abre um diálogo não modal. O `role="menu"` saiu;
  - duas opções de rádio, ambas no formato para escrever:
    - "Silo completo (recomendado)", o padrão, com a contagem de prontos pelo escopo do silo;
    - "Só os artigos selecionados"; sem seleção, vão todos os prontos do Radar, a regra de antes;
  - um botão "Exportar CSV";
  - "Avançado (auditoria)" fechado no rodapé, com "Silo completo · técnico", "Artigos selecionados · técnico", "Planilha atual" e a dica do Excel;
  - saíram o seletor "Formato do CSV", os textos longos, o selo e o item "Dossiês editoriais finalizados";
  - Esc fecha, e o foco volta ao botão, inclusive depois do download;
  - a preferência de formato antiga não é mais lida nem gravada. A chave que já existir no navegador não é apagada (AGENTS §10);
  - arquivos: `modules/radar/radar-page.tsx`, `lib/radar/portable-silo-scope.ts` (`radarSiloExportReadySummary`, aditiva) e `portable-export-estimate.ts` (dica do Excel encurtada). Testes 11, 12, integração serp-silo, leitura-por-artigo e writing-export atualizados, com o inventário exato de 13 `radar-export-*` e 4 caminhos de export.
- **Limitações:**
  - card não validado na tela: servidor não subiu nesta tarefa;
  - voz, tom, autor e revisor não saem no arquivo. A linha de topo pede para colá-los. Ler do BrandDNA seria leitura nova de outro módulo: pendência no backlog.
  - Os artigos testados pelo usuário ainda usavam os processos antigos. O formato com artigo novo de ponta a ponta não foi homologado.

## As 4 lentes no Radar, standing congelado, tela das lentes e export — 2026-09-23

```text
SERP_DO_RADAR = 4 lentes, advanced, cache primeiro (paga só a faltante; collectedBy radar)
CANONICA = desktop-windows depth 20 com corpo · extras depth 10 com digest
ATUALIZAR_SERP_SEM_MUDANCA = mesma versão (unchanged) · RECOLETAR_AGORA = pago, com confirmação e o número antes
FINALIZE = serpStanding e search.lenses congelados no servidor · dossiê V3 ganha serpLenses (cópia)
DEPOIS_DO_FINALIZE = "Atualizar SERP" e auxiliar recusados (FINALIZED_LOCKED), inclusive por cache
BUNDLES_E_DOSSIES_JA_ENTREGUES = byte a byte iguais (hashes dourados conferidos)
MIGRATIONS_ADDED = 0 · CHAMADAS_PAGAS_EM_TESTE = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste** (`test:radar` 2563/2563). Documentos em `propostas/`:
- a [SDD das 4 lentes](propostas/sdd-radar-quatro-lentes-cache-2026-09-23.md);
- os adendos [R1](propostas/adendo-r1-standing-congelado-e-ledger-2026-09-23.md), [R2](propostas/adendo-r2-quatro-lentes-cache-2026-09-23.md) e [R3 a R5](propostas/adendo-r3-r4-r5-lentes-congeladas-auxiliar-apoio-2026-09-23.md).

- **R1 — standing congelado.**
  - O FINALIZE calcula `serpStanding` uma vez, no servidor, e o grava no bundle.
  - "Válida" significa não rejeitada na revisão; `needs_review` conta como válida.
  - Níveis suficientes: SUFFICIENT, PARTIAL_BUT_USABLE e CONFLICTING_SEARCH_INTENT.
  - Bundle antigo mantém o padrão legado sem reescrita.
  - A trava recusa reescrever a `finalizedBundle` congelada.
  - A rota da SERP consulta a trava antes do cache e do provider.
- **R2 — 4 lentes.**
  - O snapshot leva o `lensSet` (cópia, sem digest), e o hash cobre as lentes.
  - A primeira atualização de um artigo antigo abre uma versão nova, uma vez, porque a fórmula mudou.
  - As SERPs pagas pelo Radar ficam no cache e servem ao Minerador e ao Arquiteto.
- **R3 a R5.**
  - O bundle ganha `search.lenses`, e o dossiê V3, `serpLenses`. As lacunas e divergências entre aparelhos entram nas `limitations`.
  - A pesquisa auxiliar e o apoio Google da Amazon passam pelo mesmo núcleo: até 4 chamadas cada, sem cache.
  - YouTube e Amazon Merchant ficam em lente única, com o eco de device/os gravado na proveniência.
- **Tela.**
  - Aba SERP da rota do artigo: seção "Lentes da SERP" ("SERP · K de 4 lentes", origem por aparelho, "Apareceu em um aparelho só", "SERP observada em") e botão "Recoletar agora (pago)" com a confirmação "Pagar até 4 chamadas".
  - Avisos: "A SERP não mudou… Nenhuma versão nova foi aberta".
  - Workbench:
    - coluna "Lentes" no plano de consultas;
    - "Lentes da SERP" no card congelado e em "Ver detalhes da pesquisa";
    - aviso discreto para bundle anterior a 2026-09-23.
  - A barra de lote virou "Atualizar SERP selecionada (cache primeiro)".
  - A frase do FINALIZE cita o hash gravado, lido no readback.
- **Export por Silo.**
  - `serp_lenses_md` e `serp_lenses_json` abrem com as lentes do **pacote congelado (fonte de verdade)**. O cache vem depois, como observação fora do pacote.
  - A "Situação da SERP" ganha a linha das lentes.
  - As limitações saem sem código de provider.
  - Saída dourada sem a entrada nova: idêntica.
- **Egress do export** (E4, parcial).
  - Leitura por artigo com reidratação só da versão usada: CSV byte a byte igual, ~23,6 → ~16,3 MB por export na Care Glow (−31%).
  - "Silos completos" sem seleção mostra a estimativa quando passa de 20 MB.

## Export portátil: a SERP, os dados do Redator e o export por silo — 2026-09-23

Pedido do dono do produto: o CSV do Radar é a saída final para escrever com
outra ferramenta ou outra IA, então precisa levar a SERP e os mesmos dados que
o Redator tem por artigo; e a recomendação de export passa a ser o silo
completo, um CSV por silo.

```text
PORTABLE_EXPORT_SERP           = IMPLEMENTADO · verificado no código · confirmado por teste com coletas reais
PORTABLE_EXPORT_WRITER_PARITY  = IMPLEMENTADO · prontidão, datas, autoridade, concorrentes e proibições do Redator
PORTABLE_EXPORT_BY_SILO        = IMPLEMENTADO · groupBy "silo" · 1 silo → CSV · 2+ → um .zip sem compressão
EXPORT_MENU                    = "Silos completos · um CSV por silo" (Recomendado) é o primeiro item
PROVIDER_CALLS_ON_EXPORT       = 0 · o cache de SERP é só LIDO (modo observation), nunca pago
RADAR_EVIDENCE_BUNDLE          = V3 inalterado · hash inalterado
MANUAL_UI_VALIDATED            = NO — homologação do usuário
```

### O que mudou

- **A linha do CSV** (`lib/radar/portable-export.ts`) ganhou entradas
  OPCIONAIS — `serpObserved`, `serpLenses`, `dossierGaps`, `siloContext`. Sem
  elas, as colunas novas não existem; a linha só difere da de antes nas regras
  de paridade com o Redator (`writer_context_md` e `writer_brief_md`), que
  entram sempre. A rota passa todas.
- **A SERP da coluna é a que o DOSSIÊ referencia** (`research.google.refs`),
  nunca "a mais recente"; no YouTube e na Amazon, o snapshot de apoio. Quando
  há coleta posterior à investigação, a coluna diz a data e que ela não foi
  usada. A curadoria humana (`serpDecisions`) só atravessa na SERP principal da
  própria análise: numa SERP de apoio, a chave posicional apontaria outra
  página.
- **As proibições do Redator que faltavam** ("reconfigurar o Silo",
  "substituir a composição de secundárias") entram nas regras de
  `writer_context_md` e de `writer_brief_md`, importadas de
  `RADAR_WRITER_MAY_NOT` e sem repetir as que já estavam cobertas.
- **`writer_context_md`** ganhou a seção curta "SERP OBSERVADA": top 10
  (título · domínio · URL), perguntas, buscas relacionadas e domínios citados no
  AI Overview — sem trecho de terceiro; o detalhe fica em `serp_observed_md`.
- **Export por silo**: `POST /api/editorial/radar-export` aceita
  `groupBy: "silo"` (opcional; o schema continua estrito). Nesse modo a
  resposta traz `files[{ filename, csv, silo: { name, kind, partial,
  exported, total, pending[{ title, status, reason }], warnings } }]`,
  `archiveFilename`, `emptySilos` e `warnings` **em vez de** `csv`/`filename`
  do lote (revisão adversarial: mandar os dois dobrava a resposta, e a tela só
  lê `files`). O dossiê avulso continua com `csv` e `filename`. `exportedAt` e
  `serpCacheReadFailed` saem em toda resposta. Uma chamada só para o lote.
- **Tela** (`modules/radar/radar-page.tsx`): novo primeiro item do menu
  `Exportar ▾`, `data-testid="radar-export-silos"`, com o selo "Recomendado"
  no padrão do selo "Em foco" (14px) e a prévia de contagem pelo `siloId` do
  item e pelo SiloDNA. Escopo: com seleção, os silos das linhas selecionadas
  inteiros; sem seleção, todos os silos do Radar; a SiloPage nunca vai no
  pedido. 1 arquivo baixa o CSV; 2+ baixam um `.zip` montado no navegador por
  `lib/radar/stored-zip.ts`. O aviso usa `useNoticeBridge` com severidade:
  WARNING para parcial, recusa, silo vazio ou cache ilegível, com os faltantes
  pelo TÍTULO; nenhum aviso diz "sucesso confirmado" para um download. O item
  "Dossiês editoriais finalizados" passou a mostrar os recusados (`refused`,
  antes ignorado) pelo título e a recomendar o silo completo quando um silo foi
  selecionado só em parte. "Planilha atual" não mudou.

### Colunas novas

| Coluna | O que leva | Origem |
| --- | --- | --- |
| `research_status_md` | prontidão para o Redator (pela regra dele), datas do congelamento e da coleta, camadas, situação da SERP, sinal cruzado YouTube × Google, saídas editoriais | `portable-dossier-gaps` |
| `silo_context_md` / `silo_context_json` | silo, posição "N de T", papel, objetivo, público, problema, intenção, tópicos, fronteira, ordem narrativa com a situação de cada membro, SiloPage como contexto | `portable-silo-export` (só no export por silo) |
| `serp_observed_md` / `serp_observed_json` | a SERP da investigação: ficha, orgânicos com trecho de até 300 caracteres marcado "trecho de terceiro — referência, não copiar", PAA, relacionadas, painel, blocos, diagnóstico, SERPs auxiliares das secundárias, curadoria e ausências ditas | `portable-serp-observed` |
| `serp_lenses_md` / `serp_lenses_json` | a leitura do cache de SERP da marca nas quatro lentes, com a data de cada uma e a divergência entre elas | `portable-serp-observed` |
| `competitors_structure_json` | estrutura, melhor posição, todas as posições e recorrência de cada concorrente; cruza com `serp_sources_json` pela URL | `portable-dossier-gaps` |
| `authority_requirements_md` | YMYL, afirmações que pedem prova, E-E-A-T, pontos do especialista, requisitos de descoberta por IA | `portable-dossier-gaps` |

Contagem na linha completa: JSON continua ≤ Markdown (5 `_md` e 4 `_json`
novas), e nenhuma coluna nova fica sem sufixo.

### Leituras novas (SDD de egress)

- `SerpSnapshotRepository.listReviews(brandId)`: **uma** consulta por lote,
  colunas explícitas, filtro de marca. Se falhar, a coluna diz "revisão não
  lida nesta exportação" e o arquivo sai.
- `lookupSerpCache(..., { mode: "observation" })`: **uma** leitura por lote
  para principal + secundárias de todos os artigos, nas 4 lentes de
  `SERP_CACHE_LENSES`, endpoint `advanced`, profundidade 10. Os códigos de
  local e idioma são os do **alvo de cada keyword** (regra A8, a mesma do
  Arquiteto e do Minerador): `readMineradorKeywordTargetCodes` de
  `lib/arquiteto/serp-lens-targeting.ts` lê, por lote de 100 ids, só o
  targeting da última medição (`minerador_keywords`, filtro de marca, coluna
  estreita); sem alvo resolvível ou com essa leitura falha, valem os de
  `readDataForSeoTargetCodes()`. Se a leitura do cache lançar, vira "a leitura
  do cache falhou nesta exportação" em cada lente; o export não cai.
- O padrão de leitura por artigo (`loadRadarState` + autoridades, item E4 da
  SDD de egress) **não foi tocado**.

### Revisão adversarial — o que foi corrigido (2026-09-23)

Três revisores (dados e paridade, higiene e egress, silo e tela). Cada
correção tem teste que fica vermelho sem ela: 24 mutantes, um por correção,
rodados numa CÓPIA da árvore no scratchpad (nenhum arquivo do repositório foi
mutado) — 24 mortos, com as suítes de base verdes.

- **Egress (must-fix):** com `groupBy: "silo"`, o CSV do lote não sai mais
  junto de `files[].csv`. Medida da revisão: a linha passou de ~59 KB para
  ~133 KB com a SERP; 20 artigos davam 2,89 MB no avulso e 5,78 MB no modo
  silo.
- **Lentes:** a deduplicação usa a chave do cache (acentos mantidos), então
  "oleo de rosa mosqueta" não some mais atrás de "óleo de rosa mosqueta". O
  espaço interno é colapsado nos dois lados do índice: antes, "rosa  mosqueta"
  era lida e acertada, mas saía "nenhuma coleta". Os códigos são os do alvo da
  keyword (A8), como descrito acima.
- **SERP de apoio (YouTube/Amazon):** "Congelamento da investigação" vem de
  `radarFrozenObservedAtOfAnalysis`, a mesma data de `research_status_md`, e
  não mais da data da coleta de apoio. A revisão humana diz "não se aplica" em
  vez de "aguardando revisão humana".
- **Curadoria:** "registrada" só quando há pelo menos uma decisão que não é
  `pending`. Com todos os itens pendentes: "iniciada, com todos os itens ainda
  pendentes".
- **Higiene (invariante 43):** o motivo da consulta auxiliar que falhou levava
  o erro cru do servidor ("binding … provider", "secret store"). Agora sai
  numa frase neutra. Os motivos de planejamento saem como estão.
- **Coleta posterior:** `research_status_md` também avisa que as colunas de
  evidência (`serp_sources_json`, `serp_evidence_json`,
  `competitors_structure_json`, `authority_requirements_md`) partem da coleta
  mais recente.
- **Silo, a ligação:** as linhas do lote saem de `radarPortableExportRows`
  (ponte pura, testada com o plano real). Antes, uma rota sem o contexto do
  silo passava a suíte inteira. O teste da rota também exige
  `itensDoSilo.push(faltante(…))` nos três ramos de recusa.
- **Aviso por silo:** nomeia cada recusa pelo título e com o motivo do
  servidor, inclusive o artigo sem silo que antes só era contado. A faixa
  inline segue a severidade (INFO → `context-accent`, WARNING → `warning`,
  ERROR → `danger` com `role="alert"`).
- **Teto de 500 artigos:** a constante `RADAR_EXPORT_MAX_ARTICLES` é a mesma
  na rota e na tela. "Silos completos" acima dela avisa antes do pedido, em
  vez de receber um 400 genérico.
- **Comentários:** o contrato da linha deixou de dizer "exatamente a de
  antes" (as regras de paridade entram sempre).

### Arquivos

- Criados nesta integração: `lib/radar/portable-export-batch.ts` (pontes puras
  entre a rota e os módulos), `lib/radar/portable-silo-scope.ts` (escopo,
  prévia e avisos da tela), `tests/radar-portable-export-integracao-serp-silo.test.mts`.
- Criados nas partes anteriores da mesma tarefa: `lib/radar/portable-serp-observed.ts`,
  `lib/radar/portable-dossier-gaps.ts`, `lib/radar/portable-silo-export.ts`,
  `lib/radar/stored-zip.ts` e as suítes deles.
- Alterados: `app/api/editorial/radar-export/route.ts`,
  `lib/radar/portable-export.ts`, `lib/radar/portable-writer-context.ts`
  (seção opcional), `lib/radar/portable-serp-observed.ts` (resumo para o
  contexto completo), `modules/radar/radar-page.tsx`,
  `tests/radar-portable-export-11.test.mts`, `tests/radar-portable-export-12.test.mts`.
- **Compartilhado, mudança aditiva:** `lib/server/radar-canonical-authorities.ts`
  ganhou o campo opcional `radarItem { siloId, title, slug, unitType }`. A
  resolução canônica não o lê: bundle e hash iguais (provado em teste).
  Consumidores preservados: `radar-writer-send.ts`, `radar-planner-send.ts`
  (`RADAR_NO_AUTHORITIES` continua válido) e a rota de export.
- Leitura de outro módulo, sem alterá-lo: `lib/radar` passa a importar
  `RADAR_WRITER_MAY_NOT` de `lib/redator/writer-handoff.ts`.
- Revisão adversarial: alterados `lib/radar/portable-export-batch.ts`
  (chave das lentes, data de congelamento, `radarPortableExportRows`, coleta
  posterior para a situação), `lib/radar/portable-serp-observed.ts`
  (`codesFor`, motivo neutro da auxiliar, revisão da SERP de apoio, rótulo da
  curadoria), `lib/radar/portable-dossier-gaps.ts` (campo opcional
  `newerSerpCollection`), `lib/radar/portable-silo-scope.ts` (`titleOf` no
  aviso por silo, `RADAR_EXPORT_MAX_ARTICLES`,
  `radarSiloExportScopeLimitNotice`), a rota, `modules/radar/radar-page.tsx`
  (tom da faixa, teto, títulos), os comentários de `portable-export.ts` e de
  `radar-portable-export-11`, e `tests/radar-portable-serp-observed.test.mts`
  (a SERP de apoio deixou de "aguardar revisão"; a principal continua
  aguardando, provado no mesmo teste).
- Leitura de outro módulo, sem alterá-lo: a rota importa
  `readMineradorKeywordTargetCodes` e `serpTargetCodesFor` de
  `lib/arquiteto/serp-lens-targeting.ts` (regra A8). Os consumidores dele (três
  rotas do Arquiteto e a suíte `arquiteto-serp-cache-formacao`) não mudaram.

### Testes

- Novos: `radar-portable-export-integracao-serp-silo` (16) — colunas novas a
  partir de coletas reais, SERP vinculada × posterior, curadoria só na SERP
  principal, higiene separando id nosso de URL de terceiro (UUID legítimo na URL
  de um concorrente sai intacto; nenhum id nosso sai, nem dentro de URL),
  paridade das regras sem repetição, leitura do cache que lança, `files` por
  silo na ordem do silo e parcial, silo vazio como aviso, escopo e avisos da
  tela, menu com o item recomendado primeiro, hash inalterado, fiação da rota.
- Atualizados, com o porquê no comentário: `radar-portable-export-11` (o menu
  passou de 3 para 4 marcas `data-testid`, com a ordem; e o §19 passou a
  conferir também a linha completa) e `radar-portable-export-12` (§29: 4
  marcas, e só o botão do menu fora dele). Nenhuma guarda foi apagada.
- `npm run test:radar`: 2446/2446. `npx tsc --noEmit -p .`: nenhum erro nos
  arquivos desta tarefa (o único erro restante está em
  `lib/server/writer-evidence-sources.ts`, arquivo novo de outra sessão).
  ESLint sem erro nos arquivos alterados; `git diff --check` limpo.
- Depois da revisão adversarial: `radar-portable-export-integracao-serp-silo`
  passou de 16 para 26 testes (SERP de apoio, curadoria pendente, coleta
  posterior na situação, variante sem acento e espaço duplo, códigos do alvo,
  motivo neutro da auxiliar, linhas com o plano real, aviso por silo com as
  recusas, teto de 500, faixa por severidade, e o H com A8, a ligação
  plano → linha, os três ramos de recusa e o CSV do lote só no avulso).
  `npm run test:radar`: 2465/2465. `npx tsc --noEmit -p .`: 0 erros no
  projeto inteiro. ESLint: 0 erros; só os avisos `no-unused-vars` que já
  existiam em `radar-page.tsx`. `scripts/check-visual-system.mjs` não acusa
  `radar-page.tsx`. `git diff --check` limpo.
- Resposta em fluxo: `radar-portable-export-response` (4) — corpo de ~1,2 MB
  sai em vários pedaços e volta como o MESMO JSON, inclusive por
  `resposta.json()`; acento partido entre pedaços chega inteiro; JSON UTF-8,
  `no-store` preservado e sem `Content-Length`; a rota responde o sucesso só
  pelo fluxo. `npm run test:radar`: 2491/2491 (a contagem inclui suítes de
  outras sessões).

### Limitações

- A coleta do Radar continua no modo `regular`, sem PAA nem citações do AI
  Overview: as colunas dizem "o Google exibiu o bloco, mas a coleta não trouxe"
  quando `itemTypes` prova a exibição, e nunca "o Google não mostrou".
- As lentes mostram o cache no momento do export (validade de 30 dias), não a
  investigação congelada; cada lente traz a própria data.
- A SiloPage não tem dossiê: entra só como contexto do silo, pela dica da
  hidratação (a rota não lê as versões `silo_page`).
- A versão do ArticleDNA ainda é escolhida por `.find` sem ordem na rota, como
  no envio ao Redator (anterior a esta tarefa).
- Artigo recusado antes de o item do Radar ser lido (sem ArticleDNA ou sem
  investigação) tem o silo deduzido pela composição do SiloDNA; se nenhum
  SiloDNA o lista, vai para "sem silo".
- `research_status_md` depende de `radarFrozenSerpStandingOf`, que existe na
  árvore de trabalho junto do registro da situação congelada da SERP (ainda não
  commitado).
- O download do `.zip` e a abertura dele no Explorador do Windows não foram
  validados na tela; `unzip -t` e `Expand-Archive` aceitaram um pacote de
  amostra no scratchpad.
- **"Os mesmos dados do Redator" ainda não é paridade total.** Levantado na
  revisão adversarial e conferido no código:
  - Links internos de ENTRADA saem só como contagem (`inboundRelations`).
  - Das fontes externas do `observed`, só as candidatas a evidência saem
    (`evidenceCandidates`, por desenho: §14). `observedLinks`,
    `recurrentDomains`, `conceptAlignments`, padrões, links comerciais e as
    limitações das fontes ficam de fora.
  - `observed.evidence.semantic/structural` ficou de fora de propósito.
  - O slug diverge: o CSV usa o publicado (e, sem ele, o sugerido); a
    importação do Redator usa `suggestedSlug`.
- **A leitura das lentes difere da do Redator** (`writer-evidence-sources.ts`,
  em andamento em outra sessão). O Redator monta a chave pela consulta fixada
  na Qualificação, mantém a entrada vencida legível e rotulada e lê os
  reforços. O export usa o alvo da keyword (A8), trata a vencida como "venceu
  a validade" (é o que `lookupSerpCache` devolve) e não lê reforços.
- **Tamanho da resposta — tratado em fluxo.** A linha completa tem ~133 KB,
  e a função da Vercel recusa corpo de resposta acima de 4,5 MB (413
  `FUNCTION_PAYLOAD_TOO_LARGE`, conferido na documentação da Vercel em
  2026-09-23): o export quebraria com uns 31 artigos. A resposta de sucesso
  passou a sair em FLUXO (`lib/radar/portable-export-response.ts`), que a
  própria Vercel indica como o caminho sem esse teto; o Next 16 aceita
  `new Response(ReadableStream)` no route handler. Continua UMA leitura de
  artefatos, snapshots e revisões por lote — um pedido por silo relê a marca
  inteira a cada silo. A tela não mudou: `resposta.json()` junta os pedaços.
  **Não verificado no deploy:** que a Vercel entregue o fluxo acima de 4,5 MB
  é o que a documentação dela afirma; a prova é exportar uma marca com mais
  de ~35 artigos finalizados na homologação.
- **Ordem das colunas:** `research_status_md` e `silo_context_md` entram logo
  depois de `must_cover`. Isso desloca as colunas antigas para quem lê o CSV
  por posição; quem lê pelo cabeçalho não é afetado. Nenhum consumidor por
  posição foi encontrado no repositório.
- Toda recusa entra no plano do silo como "não finalizado", inclusive
  "ArticleDNA não encontrado" e "pacote indisponível". O aviso da tela mostra
  o motivo real de cada uma, mas o `silo_context_md` do CSV continua com o
  rótulo único.
- A regra A8 depende de `lib/arquiteto/serp-lens-targeting.ts`, arquivo novo
  de outra sessão, ainda não commitado. `radarFrozenSerpStandingOf` está na
  mesma situação.

## Auditoria de egress da Supabase — 2026-09-23

- **Verificado remotamente por SQL somente leitura e painel autenticado:** migrations de listagem de 21/09 presentes, views com `security_invoker=true`, 31 corridas separadas sem linha vazia/órfã; a listagem Radar permanece em ~1,64 MB de texto para 3 itens. O ciclo atual está em 5,758/5 GB de egress; nos dias 19–22/09 amostrados, PostgREST respondeu por 93,8–97,4% do tráfego exibido. A taxa mensal futura ainda não foi comprovada.
- **Implementado localmente:** `ArtifactRepository.list` filtra os três tipos consumidos na consulta; os demais 607/613 artefatos remotos somam ~2,13 MB de payload no projeto, com economia por carga isolada por marca (~0,17–1,26 MB nos dados atuais) após deploy. Contrato de resposta e consumidores preservados.
- **Testado:** TypeScript, lint direcionado e `git diff --check` passaram; 21 testes direcionados das leituras passaram. A suíte conjunta teve quatro falhas preexistentes em `editorial-pipeline.test.mts`, fora da alteração. Sem deploy ou validação manual da UI.
- **Pendente:** acompanhar o próximo ciclo de egress e medir bytes por rota; o Logs Explorer Free só reteve um dia e a consulta *Top Paths* revelou frequência, não volume. Publicar manualmente o filtro e desenhar em SDD a listagem enxuta de documentos e a hidratação seletiva de corridas. Diagnóstico, cálculos e alternativas locais em [auditoria-egress-supabase-2026-09-23.md](auditoria-egress-supabase-2026-09-23.md).

## Fase Radar — FECHADA — 2026-09-17

Os três perfis de pesquisa estão implementados e o dossiê canônico alimenta as
duas saídas do módulo: o envio ao Planejador e o dossiê editorial portátil.

O fechamento documental e o que ele auditou ficam no relatório datado:
[relatório de fechamento](../00-produto/auditorias/relatorio-radar-governance-close-2026-09-17.md).
As regras permanentes ficam na [spec](spec.md); a hierarquia de evidência, na
[diretriz](diretriz-autoridade-evidencial.md); o que continua em aberto, no
[backlog](backlog.md).

```text
RESEARCH_PROFILES        = GOOGLE · YOUTUBE · AMAZON
CANONICAL_DOSSIER        = loadRadarCanonicalAuthorities → resolveRadarCanonicalDossier
PLANNER_HANDOFF          = sendRadarToPlanner (autoridade única) · RadarEvidenceBundle V3
PORTABLE_EXPORT          = dossiê editorial portátil (read model do mesmo dossiê)
MANUAL_ACCEPTANCE        = pendente do USER
```

### Perfil de pesquisa não é saída editorial

A distinção governa o módulo inteiro. O perfil descreve COMO investigamos; a
saída descreve O QUE se produz a partir daquilo.

| Perfil | O que ele lê | Saída editorial |
| --- | --- | --- |
| `GOOGLE` | SERP de páginas, com curadoria e extração | Blueprint editorial / artigo-modelo |
| `YOUTUBE` | SERP de vídeo — título, canal, duração, posição | Blueprint audiovisual / roteiro-modelo |
| `AMAZON` | prateleira da Merchant, por ASIN | Blueprint comercial |

Um artigo investigado no YouTube continua sendo um artigo: o perfil não decide
o formato do que será publicado.

### A ordem canônica do dossiê

```text
autoridades do Radar
       ↓
loadRadarCanonicalAuthorities      lê uma vez: Google observado, biblioteca de
       ↓                           vídeos, especialista, contexto de pesquisa
resolveRadarCanonicalDossier       resolve uma vez: blueprint, bundle, prontidão
       ↓
  ├── sendRadarToPlanner           grava o bundle V3
  └── portable export              projeta Markdown e CSV
```

`writer_brief_md`, `writer_context_md` e `competitive_radiography_md` são READ
MODELS portáteis. Eles não são autoridade factual e não viajam no handoff: o
que o Planejador recebe são as MESMAS evidências que permitem construí-los.

### Homologação manual

A homologação em runtime real é do USER e não é declarada por desenvolvimento.
A Fase 1 do Google foi homologada em 2026-09-11
([relatório](../00-produto/auditorias/relatorio-radar-google-fase1-homologacao-2026-09-11.md)).
YouTube, Amazon, o export portátil e o envio com as camadas de vídeo e
especialista aguardam aceitação manual.

---

## Pesquisa Google — Fase 1 — HOMOLOGADA — 2026-09-11

A Pesquisa Google do Radar concluiu a Fase 1 e foi validada em runtime real
pelo USER, com provider DataForSEO, no fluxo
`RESET → START → ANALYZE → FINALIZE → F5`.

Esta seção descreve o que existe hoje. Os números da rodada usada na
homologação ficam no relatório datado, não aqui:
[relatório de homologação](../00-produto/auditorias/relatorio-radar-google-fase1-homologacao-2026-09-11.md).

### IMPLEMENTED — verificado no código

Áreas operacionais do Radar: `Pesquisa`, `Vídeos`, `Especialista`, `Relatório`
(`RADAR_R3_AREAS` em `lib/radar/r3-workbench.ts`). A antiga área `Conteúdo`
não é área operacional.

Modos de pesquisa competitiva, em `lib/radar/search-mode.ts`
(`RadarPrimarySearchMode = WEB | YOUTUBE | AMAZON`), com a capacidade da engine
declarada e não presumida em `RADAR_SEARCH_MODE_ENGINE`:

| Modo | Rótulo | Engine declarada | Situação |
| --- | --- | --- | --- |
| `WEB` | Google | `available` | implementada e homologada |
| `YOUTUBE` | YouTube | `partial` | universo, separação e modelo de vídeo existem; a coleta usa o bloco de vídeos da SERP do Google. Não homologada |
| `AMAZON` | Amazon | `planned` | a casca reconhece o modo; a engine de produto é frente própria |

A seleção é única por investigação e fica gravada nela; o modo não muda no meio.

Lifecycle da Pesquisa Google, todo por ação explícita do USER:

```text
NOT_STARTED → START → READY_TO_ANALYZE → ANALYZE
            → READY_TO_FINALIZE → FINALIZE → FINALIZED
```

Nenhum passo ocorre por `mount`, F5, troca de área ou expansão de painel.
`RESET` é ação explícita e separada.

`START` executa, numa passagem: contexto do Article → plano de consultas →
SERP canônica → SERPs auxiliares → universo de pesquisa → deduplicação →
curadoria automática → persistência → readback. Não há revisão manual
intermediária obrigatória.

`ANALYZE` executa, como uma operação do USER: extração dos concorrentes →
persistência da amostra → readback → verificação de fontes → consolidação de
evidências → persistência final → readback final.

`FINALIZE` é ação do USER e não chama provider. Congela
`RadarFrozenEvidenceBundle` com `EditorialBlueprint`, `SpecialistBriefs`,
`VideoBriefs` e a proveniência, amarrado a `articleId`, `articleDnaVersionId`
e `articleDnaContentHash` (`lib/radar/investigation-finalization.ts`).

`RESET` limpa somente a pesquisa corrente (`RADAR_RESET_CLEARED` em
`lib/radar/radar-reset.ts`) e não inicia pesquisa nova.

Camadas de domínio implementadas:

- `RadarCompetitiveObservedModel` — autoridade única da observação competitiva;
- `SemanticConceptModel` — observações cruas preservadas → normalização →
  agrupamento → conceitos, perguntas e entidades;
- `AiDiscoveryContext` — unidades respondíveis, perguntas centrais, requisitos
  de definição, cobertura de entidades, suporte factual e conexões com o
  especialista;
- `RadarEditorialBlueprint` — projeção editorial do Radar, com estados
  `READY` / `INSUFFICIENT` declarados;
- `RadarSpecialistBrief` e `RadarVideoBrief`;
- `RadarEvidenceBundle`, `RadarFrozenEvidenceBundle` e `PlannerHandoff v3`
  (`RADAR_PLANNER_CONTRACT_VERSION = 3`).

Autoridade centralizada de intenção declarada em `lib/radar/editorial-identity.ts`
(`radarConclusiveIntent`, `radarDeclaredArticleIntent`,
`radarDeclaredKeywordIntent`, `radarIntentConflict`).

### TESTED — confirmado por teste

Suíte `pnpm run test:radar`: 900 testes, zero falhas na data desta seção.

Cobrem, entre outros: despacho real no DOM, remoção do workflow legado da
superfície, handoff canônico v3, reset formal, encadeamento da persistência do
ANALYZE, autoridade de intenção com censo de leituras cruas, projeção única do
Especialista e a área clicável do expansor da planilha.

### REMOTE VERIFIED

Persistência e readback confirmados na rodada real: escrita intermediária da
amostra, readback, escrita final, readback final, concorrência otimista
encadeada (`versão N → sample write → readback N+1 → final write com N+1 →
readback N+2`) e congelamento remoto do bundle.

### MANUAL UI VALIDATION

`RESET → START → ANALYZE → FINALIZE → F5` executado pelo USER com provider
real. Após F5, o bundle congelado foi preservado e nenhuma conclusão diferente
foi reconstruída silenciosamente.

### VIDEOS_2.4 — HOMOLOGADO EM RUNTIME REAL — 2026-09-14

O USER executou o fluxo completo com provider real: `youtube-transcript@1.3.1`
consultado pelo Local Worker, jobs `COMPLETED`, transcripts persistidos e
`TEXT_READY` em duas fontes — 406 e 733 segmentos com tempos reais.

```text
TIMESTAMP_COVERAGE = 100,1% e 100,0% da duração oficial
TIMESTAMP_UNIT     = resolvida pela duração da YouTube Data API
F5                 = preserva TEXT_READY
WORKER POSTERIOR   = EMPTY (a idempotência recusa antes de chamar o endpoint)
```

A cobertura de ~100% é o que prova que o defeito de unidade do pacote não passou:
lida na unidade errada, a legenda cobriria 0,1% ou 100.000% do vídeo.

Migrations aplicadas: `20260911120000`, `20260911180000`, `20260912100000` e
`20260913100000`.

### PENDING

- **`20260914100000_radar_video_brief_extracts.sql` não aplicada.** Cria as duas
  tabelas do casamento (execução + trechos). Sem ela o recorte não persiste, e o
  Gate 3 não pode ser exercido com dados reais.
- **Smoke real de GCS + Speech (VIDEOS_2.2) não executado.** A via do áudio
  enviado continua sem exercício em runtime — a via pública tornou-a menos
  urgente, não desnecessária.
- Legenda de vídeo público de terceiros: fora do alcance da configuração atual.
  A limitação é declarada na tela, com os caminhos que a resolvem — não é falha.
- Tradução, casamento entre pauta e conteúdo, `VideoEvidence` e artigo:
  gates posteriores.

### BLOCKED

Nada bloqueado nesta frente.

## Purga administrativa de Arquiteto e Radar — Care Glow — 2026-09-08

```text
STATUS            = SCRIPT PRONTO, NAO EXECUTADO
AUTORIZACAO       = responsavel pela marca, explicita, registrada nesta entrada
MARCA ALVO        = 09762023-d0d4-4c24-b34e-d0fdfd43f891 (Care Glow)
ESCOPO            = stage IN ('architect','radar') + artefatos article_dna/silo_dna/silo_page
PRESERVADO        = Marca, Minerador, Planejador, Redator, Publicacoes,
                    usuarios, permissoes, integracoes e TODAS as outras marcas
SQL_EXECUTADO_POR_MIM = 0
```

**Natureza.** Não é saneamento de defeito. A auditoria de 2026-09-06 provou os
registros íntegros e a continuidade validada. Isto é **descarte deliberado de
trabalho**, decidido pelo responsável pela marca. A regra "proibido limpar dados
para corrigir problema de interface" **permanece válida** e não é revogada por
esta operação — ela não se aplica porque não há problema de interface a corrigir.

**Levantamento inicial informado** (a conferir na execução): 115 versões de
ArticleDNA, 9 revisões de arquitetura por IA, 21 registros de trabalho do
Arquiteto, 4 artigos do Radar, 10 eventos de importação, 9 snapshots e 6
revisões SERP. Zero SiloDNA/SiloPage e zero grafos de links.

### O script — arquivo único

`supabase/scripts/2026-09-08-descarte-arquiteto-radar-care-glow.sql`

**SQL PostgreSQL puro**, para copiar e colar no editor do Supabase. Sem
`\set`, sem placeholder, sem substituição manual — a marca já está fixa no
próprio script. Tudo dentro de um `DO` block, que é uma transação implícita:
qualquer exceção desfaz tudo, inclusive o estado dos gatilhos.

**Backup dispensado por decisão explícita.** Este é descarte DEFINITIVO, sem
restauração. Está escrito no cabeçalho do script para ninguém supor o
contrário depois.

Executar **duas vezes**: primeiro com `v_simular := true` (percorre tudo,
imprime o manifesto e aborta de propósito), depois com `false`. Uma terceira,
de volta em `true` sobre o estado já vazio, prova idempotência.

### Garantias embutidas no script

- **Identidade validada** antes de qualquer remoção; marca inexistente aborta.
- **Condições positivas** para `architect` e `radar` — `stage <> 'architect'`
  foi eliminado, porque excluir pelo complemento apagaria estágio futuro que
  ninguém revisou.
- **Dependências abortam com os ids à vista:** Planejador, ContentPlan que cite o
  artigo no payload, Redator, Publicações, e entidade que apareça em outra marca.
- **Uma transação**, com `lock_timeout` e `statement_timeout`; dependentes
  removidos antes das origens; nenhum `UPDATE` anulando referência para
  contornar validação.
- **Gatilhos append-only nomeados um a um** (`editorial_artifact_versions`,
  `version_status_events`, `decision_events`, `serp_snapshots`,
  `serp_reviews`), com o estado REAL lido de `pg_trigger.tgenabled` e **reposto tal como
  estava** (O/D/R/A), verificado depois. Nenhuma função, FK ou validação é removida.
- **Preservação comprovada por hash de ids**, não só contagem — Minerador, outras
  marcas e outros artefatos.
- **Órfãos verificados** em `version_status_events` e `decision_events`.
- **Qualquer divergência levanta exceção** e desfaz tudo.
- **`:simular = true`** roda o caminho inteiro e aborta de propósito no fim.

### O que o script NÃO faz — é seu

1. **Rodar a exportação antes.** Sem ela a purga é irreversível.
2. **Conferir Arquiteto e Radar vazios nas duas sessões**, pelo servidor. Se vier
   conteúdo, é recuperação local — não dado remoto.
3. **Não limpar `localStorage` indiscriminadamente.** Confirmar que recuperação
   local antiga não repovoou o servidor.
4. **Reexecutar com `:simular = true`** sobre o estado já vazio, provando
   idempotência.
5. Registrar aqui o resultado por tabela e a validação nas duas sessões.

### Pendência separada

A **ausência de seleção e exclusão na aba Silos** fica registrada como correção
funcional própria, no backlog. Não é motivo desta purga nem é resolvida por ela.

## Continuidade entre sessões — base validada — 2026-09-06

```text
RECUPERACAO_ENTRE_SESSOES = VALIDADA (cenario Care Glow)
LIMPEZA_DE_DADOS          = NAO NECESSARIA
RECRIACAO_DE_BANCO        = NAO NECESSARIA
ALTERACAO_DA_FUNDACAO     = NAO NECESSARIA
CAUSA_RAIZ                = NAO IDENTIFICADA (ver "limites" abaixo)
```

> **Recuperação dos artigos e da SERP entre sessões: validada no cenário Care
> Glow. A investigação não demonstrou necessidade de limpeza, recriação do banco
> ou alteração da fundação global.**

- **Verificado remotamente, somente leitura** (consultas do usuário, 06/09/2026):
  três itens do Radar encontrados e válidos, incluindo "serum facial principia" e
  "mascara de skincare"; 100 versões editoriais e 111 eventos examinados sem
  incompatibilidade; cinco snapshots SERP válidos, sendo dois da máscara com sete
  resultados cada.
- **Validação manual:** após limpar o cache dos dois navegadores e reiniciar,
  **ambos recuperaram os três artigos e a SERP existente**. Capturas de
  06/09/2026, entre 04:43 e 04:46, anexadas como evidência.
- **Correções aplicadas no período** — nenhuma delas comprovada como a causa:
  - leitura resiliente por linha nos leitores de workflow, artefatos e eventos
    (`lib/editorial/partial-read.ts`, `lib/server/editorial-repositories.ts`);
  - isolamento por repositório no `GET /api/editorial/workspace`
    (`Promise.allSettled`), com a seção que falha **nomeada** em vez de
    derrubar a resposta inteira;
  - `persisted_data_invalid` (502) separado de `invalid_brand_id` (400) — dado
    persistido ruim deixou de ser reportado como "Marca inválida";
  - `requestId` em toda resposta e no log, com contagens por repositório,
    estado da leitura e seções que falharam, sem segredos;
  - falha da escrita do workflow deixou de ser reportada como importação
    concluída, e 4xx deixou de degradar o modo de persistência da leitura.

### Limites desta validação

- **A causa raiz NÃO foi identificada.** A hipótese de linha incompatível foi
  **falsificada** pelas consultas remotas (3/3 itens passam no schema). O
  isolamento da agregação é a explicação mais plausível entre as mudanças
  aplicadas, mas **plausível não é identificado**: reinício do servidor e
  limpeza de cache aconteceram no mesmo intervalo.
- **Como fechar isso, se voltar a ocorrer:** o log do `GET` agora traz
  `requestId` e `failedSections`. Uma ocorrência com `failedSections` não
  vazio identifica a seção; vazio elimina a agregação como causa.
- **O Radar não está concluído** e a plataforma não está homologada. Ver o
  backlog.

### Referências canônicas

Identidade, tenantização, autorização, persistência e versionamento seguem a
fundação global — este documento não redefine nenhuma delas. Ver
`docs/00-produto/auditorias/reconciliacao-mesa-editorial-2026-09-06.md` e
`docs/05-radar/adendo-sdd-persistencia-verificavel.md`.

## Correção funcional — readback remoto da aprovação SERP após F5 — 2026-08-27

- **Verificado remotamente, somente leitura:** existem aprovações append-only
  reais para o artigo `group-11aenvf`, ligadas ao snapshot remoto atual v3,
  ao `ArticleDNA` atual e à seleção humana
  `organic:2|organic:4|organic:5|organic:7`.
- **Causa corrigida no código:** o painel de Revisão dependia do loader amplo
  do workspace e de um `serpPersistenceMode` global. Quando o recovery local
  era aplicado antes/depois dessa carga, uma aprovação remota já existente
  aparecia como “Aprovação local não confirmada”. Não era ausência de write
  remoto nem aprovação de snapshot antigo.
- **Implementado:** `GET /api/editorial/serp` faz readback autenticado e
  estrito por marca, artigo, versão do ArticleDNA e alias do snapshot. O
  cliente hidrata somente as revisões desse snapshot e mantém confirmação
  remota por snapshot, protegida contra resposta obsoleta durante write ou
  nova leitura.
- **Semântica:** aprovação histórica permanece no Histórico, mas só fecha a
  revisão atual quando o snapshot e o fingerprint explícito de curadoria ainda
  correspondem. Mudança de curadoria reabre a revisão; snapshot novo não herda
  aprovação anterior; registro legado sem fingerprint é preservado como
  comparabilidade desconhecida.
- **Validação manual autenticada:** após F5, seleção do artigo e abertura de
  SERP → Revisão mostraram `SERP aprovada` e a nota da aprovação remota atual.
  Nenhuma nova aprovação, coleta DataForSEO, ExternalEvidence ou escrita remota
  foi feita nesta correção.

## Referência opcional ao InternalLinkGraph — fundação confirmada 2026-08-27

O `RadarPlannerHandoff` v2 aceita `internalLinkGraphRef` opcional e
retrocompatível. Quando houver grafo aprovado, o Radar/Planejador recebe sua
identidade, versão e hashes como contexto; o Radar não altera source, target,
direção ou relações. O contrato do grafo continua propriedade do Arquiteto,
com fundação remota, readback e isolamento cross-brand confirmados. A
implementação funcional da aba permanece no Arquiteto; o Radar apenas consome
a referência quando ela for enviada.

## Consolidação dos gates e abertura da fase funcional — 2026-08-26

```text
RADAR_STRUCTURAL_PREREQUISITES=READY
RADAR_SERP_FOUNDATION=READY
RADAR_TELEGRAM_FOUNDATION=READY
RADAR_PLANNER_HANDOFF=READY
READY_FOR_RADAR_FUNCTIONAL_IMPLEMENTATION=YES
```

O Radar está liberado para a próxima fase: `Especialista → ExpertBrief →
ExpertContribution → Evidence`. A fundação Telegram/Experts foi verificada
remotamente e o isolamento cross-brand foi comprovado com JWT autenticado
real. Essa evidência não equivale a inbound Telegram real, texto/áudio E2E ou
Speech real, que continuam pendentes de homologação manual.

O ledger `telegram_inbound_updates` permanece global e pré-routing: não é uma
entidade editorial tenantizada, não é acessível por `authenticated` e só
promove contexto após binding explícito, `brandId`, `expertId` e
`briefId/articleDnaVersionId`. A regra completa e a evidência de limpeza dos
fixtures estão em `docs/compartilhado/sdd-telegram-expert-contribution-platform.md`.

O smoke JWT comprovou Care Glow permitido, Brand B negada, leituras/escritas
cross-brand negadas e guards compostos de Expert, Brief, Contribution e Job.
`CROSS_BRAND_FK_GUARDS=PARTIAL` refere-se somente ao ledger global, protegido
no routing server-side. Fixtures, membership e Brand temporária foram
removidas; duas identidades Auth temporárias permanecem sem acesso e aguardam
autorização separada para exclusão.

O handoff Radar → Planejador v2 está `PASS`, retrocompatível e sem mudança de
banco; `ContentPlan` continua separado. Novas coletas SERP usam somente
DataForSEO. Snapshots históricos `provider=serper` continuam legíveis e podem
participar de handoff histórico aprovado, sem nova chamada Serper.

> Os lotes R5, R6 e R7 abaixo são snapshots de execução anteriores ao gate de
> 2026-08-26. Valores `BLOCKED_BY_DATABASE`, `PARTIAL` ou
> `STRUCTURAL_CHANGE_REQUIRED` neles preservados são históricos e não o estado
> vigente desta abertura funcional.

## Handoff canônico Radar → Planejador — 2026-08-26

- **Implementado localmente:** `RadarPlannerHandoff` v2 aditivo e hashado,
  com `brandId`, `articleId`, `articleDnaVersionId`, referência de SiloDNA,
  relatório consolidado aprovado, SERP, proveniência, decisões humanas,
  `ExpertEvidence[]` opcional e `ProductEvidence[]` compatível.
- **Gate:** somente `APPROVED` gera o envelope; `ContentPlan` continua sendo
  entidade própria do Planejador. Novas coletas usam somente DataForSEO,
  enquanto pacotes históricos Serper válidos/aprovados permanecem legíveis e
  podem gerar handoff preservando `provider=serper` na provenance.
- **Persistência:** o workflow JSONB existente recebe o adaptador em
  `RadarAnalysis.plannerPackage` e `PlannerItem.radarHandoff`; nenhum schema ou
  migration foi alterado.
- **Pendente:** executar SERP DataForSEO autenticada quando necessário,
  confirmar persistência/readback/reload e validar o handoff com dados reais no
  navegador. Inbound Telegram, texto/áudio E2E e Speech real permanecem
  pendentes. Nenhuma chamada paga foi executada nesta consolidação.

## Consolidação canônica e abertura da fase Radar — 2026-08-25

- **Fundação:** `PLATFORM_INTEGRATION_FOUNDATION = READY` e
  `READY_FOR_RADAR_DEVELOPMENT = YES`.
- **Infraestrutura:** DataForSEO é a SERP compartilhada do Radar; DeepSeek,
  Google Cloud Speech/Storage, YouTube e Telegram permanecem operações da
  Plataforma, não providers/quotas/Connections do módulo.
- **Telegram:** Bot global configurado, `getMe = PASS`, webhook não configurado
  e inbound E2E pendente. O Radar só recebe contribuição quando binding,
  especialista, `briefId` e artigo/versão estão explícitos.
- **Limites:** Connection `READY` não prova coleta real, persistência remota,
  operação paga ou aprovação editorial. Nenhuma chamada paga foi executada
  nesta consolidação.

## Contrato de entradas externas — 2026-08-25

- **Preparado localmente:** contratos e rota de `ExpertBrief`/`ExpertContribution`, preservando texto/arquivo original, transcrição e organização como camadas distintas.
- **Verificado no código:** Telegram apenas entrega contribuição ao `brief_id` explicitamente selecionado; Updates são deduplicados e mídia pesada segue para `external_processing_jobs`/Local Worker.
- **Fronteira preservada:** nenhuma alteração foi feita no agrupamento, ArticleDNA, SiloDNA, SiloPage, publicação ou workflow editorial do Radar. A UI editorial futura continua dependente de decisão própria.
- **Pendente:** migration remota, configuração do webhook público, worker autenticado, consumidores editoriais e validação manual. Bot Token/Secret e `getMe` já estão registrados como configurados.

> Os blocos datados anteriores à consolidação de 2026-08-25 são snapshots de
> implementação e validação, preservados para proveniência. Quando mencionam
> provider SERP legado, isso não representa o contrato operacional vigente.

> **Estado documental vigente — 2026-08-25:** as rotas atuais são `app/(brand)/[brandRef]/radar/page.tsx` e `app/(brand)/[brandRef]/radar/[articleId]/page.tsx`; a referência posterior a `/{brandUserId}/radar` é alias histórico. O Radar consome ArticleDNA e evidências recebidas, não reagrupa keywords nem troca principal. A persistência remota usa as relações existentes do schema canônico `0027`; a migration `0003_radar_serp_snapshots.sql` não deve ser aplicada. O fallback local não é persistência remota.

## Histórico — implementação legada de SERP — 2026-07-21 (superseded)

O item Radar já recebe `arquitetoStrategyContext` opcional; a extensão permanece compatível com ArticleDNA antigo. A validação local confirma transferência de referências e contexto, sem SERP real, provider externo ou escrita remota.

- **Última atualização:** 2026-07-20.
- **Snapshot histórico:** provider SERP legado server-side, normalização de resultados, diagnóstico determinístico, timeout, erros explícitos, hash e versionamento.
- **Snapshot histórico:** `POST /api/editorial/serp` com autenticação, autorização por marca/módulo, resolução server-side da keyword e ações de coleta/revisão.
- **Snapshot histórico:** UI com ação separada `Coletar SERP` e `Simular`, histórico de snapshots, PAA, related searches, diagnóstico e decisão humana.
- **Snapshot histórico:** recuperação local por marca e tentativa de persistência remota append-only.
- **Snapshot histórico:** Planejador recebe referência de SERP somente quando a pesquisa real foi aprovada.
- **Persistência remota:** usa as relações existentes do schema canônico `0027`; `0003_radar_serp_snapshots.sql` não deve ser aplicada.
- **Configuração:** a presença/validade da chave em `.env.local` não foi confirmada por chamada real; nenhuma chave foi impressa, registrada ou reutilizada.
- **Chamada paga no snapshot:** nenhuma consulta real ao provider SERP legado foi executada automaticamente. Os testes usam `fetch` mockado.
- **Testes confirmados:** 16 testes específicos do Radar e 103 regressões editoriais passam, incluindo persistência/fallback, navegação, hidratação, envelope cliente→rota, provider Serper, pipeline editorial, fluxo operacional e domínio do Arquiteto; TypeScript, build, lint direcionado do escopo Radar e `git diff --check` passam. O lint amplo do monólito do Arquiteto ainda contém falhas legadas de `any`/React Compiler.
- **Correção de hidratação implementada:** o Radar agora recebe um snapshot aditivo de keyword/silo no import do Arquiteto, reconcilia itens antigos sem hidratação no reload, aceita aliases `pub-k-*` e resolve a keyword no servidor por vínculo canônico e marca.
- **Causa comprovada da falha anterior:** `/api/inteligencia` excluía keywords com `lista_id` nulo embora o Arquiteto as incluísse; o import persistia somente IDs; e os resolvers cliente/servidor exigiam igualdade literal e não reconheciam o alias publicado. Isso produzia simultaneamente `Keyword não hidratada`, `Keyword pendente` e coleta desabilitada.
- **Causa comprovada da falha UUID:** `lookupIds` ainda continha `pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc` quando chegava a `.in("id", lookupIds)` em `keywords_kgr`; essa coluna é UUID. A mesma validação foi aplicada a `briefings_artigos.id` e `listas_kgr.id`.
- **Consumo do provider legado:** por ordem do fluxo, a resolução do artigo/keyword e as consultas UUID ocorrem antes de `collectSerperSnapshot`; a falha UUID observada não alcançou a chamada externa. Nenhum log ou teste desta correção executou provider real.
- **Fallback SERP implementado:** quando os repositórios editoriais ou a migration remota não estão disponíveis, a rota usa o ArticleDNA e o envelope editorial hashado enviados pelo workspace, mantém autenticação, validação de marca e gates de conflito, coleta a SERP real no servidor e retorna `persistenceMode: local`; o snapshot é incorporado e salvo na recuperação local antes de informar sucesso.
- **Navegação corrigida:** `Abrir no Radar` expande o detalhe local com SERP, PAA, relacionados, diagnóstico, histórico e revisão. `Ver no Arquiteto` é a ação separada; o deep-link é consumido uma vez, compara Sets antes de atualizar e remove `articleId` da URL depois de resolver.
- **Erros estruturados:** configuração ausente, migration/tabela ausente, conexão indisponível, não autenticado, permissão negada, provider e timeout não compartilham mais uma mensagem genérica.
- **Validação visual pendente:** o navegador local não possuía sessão/marca autorizada nesta execução; portanto o artigo real ainda precisa ser conferido manualmente na planilha do Radar após login.
- **Limitação atual:** a confirmação end-to-end ainda requer uma execução manual autenticada, com uma única keyword, depois que a migration for aplicada ou o fallback local for conscientemente aceito.
- **Limitação atual:** classificação de tipo, intenção, entidades e conflitos é heurística determinística; exige revisão humana.
- **Limitação atual:** fontes externas e originalidade fora da SERP real continuam sem provedor próprio integrado.
- **Correção da fronteira editorial:** a UI do Radar não envia mais `hydration` como única recuperação. Antes de `collect` ou `review`, o cliente monta `RadarSerpResolutionEnvelope` com `schemaVersion`, `radarItemId`, versão/hash do ArticleDNA, keyword principal textual, alias/canonical/source IDs, silo, origem Arquiteto→Radar e `snapshotHash` SHA-256.
- **Validação server-side histórica:** o Route Handler revalida o hash, marca, artigo, item Radar, versão do ArticleDNA, papel principal e vínculo da keyword. Divergências entre envelope, ArticleDNA ou keyword canônica remota bloqueiam antes de `collectSerperSnapshot`.
- **Resolução registrada:** `resolutionMode` distingue `remote_canonical` de `local_recovery`; `canonicalRemoteVerified` fica persistido no `SerpCollectionRecord` e no `SerpResearchSnapshot`. A fonte remota vence quando encontrada; o envelope textual só é usado quando a resolução canônica não está disponível e os gates locais permanecem válidos.
- **Causa comprovada da falha de hidratação anterior:** a tabela renderizava o texto por `pipeline.snapshot.keywords`, mas o POST enviava apenas `row.hydration`; para o artigo antigo essa hidratação era nula. O servidor recebia ArticleDNA e nenhum texto editorial, falhando antes do provedor com a mensagem de keyword ausente.
- **Testes da fronteira histórica:** `tests/radar-resolution-envelope.test.mts` cobre serialização cliente→rota, alias `pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc`, hash adulterado, texto técnico e conflito remoto. Nenhuma chamada real foi feita.

## Correção bloqueadora de hidratação — 2026-07-20

- O snapshot SERP v1 não foi apagado. O estado `Aguardando revisão · v1` da planilha e os registros local/remoto continuam sendo a evidência de recuperação; esta correção não coleta novamente, não limpa storage e não reimporta o artigo.
- A causa era estrutural: a URL podia receber o alias publicado `pub-k-*`, enquanto o item Radar possui uma chave canônica estável (`RadarItem.id`, atualmente `radar:<articleId>`). A rota agora resolve o item por chave canônica ou alias somente quando o alias é inequívoco e redireciona preservando a aba solicitada.
- `SerpSnapshot`/`SerpReview` agora são tratados como entidades independentes de `RadarAnalysis`. Resumo, SERP, concorrentes, estrutura, semântica, decisões e histórico renderizam o snapshot/revisão/DNAs disponíveis antes do início da análise.
- O reload reconcilia itens Radar remotos e locais preservando versões locais de `RadarAnalysis`; registros SERP locais válidos também permanecem quando a resposta remota está vazia ou incompleta. Iniciar análise é idempotente e referencia o snapshot existente sem criar nova coleta.
## Implementacao adicional - 2026-07-20

- Pagina `/radar/[articleId]` com sete abas estaveis, escolha humana entre KGR leve e Competitivo completo, curadoria granular da SERP, selecao sem ocultacao de itens, extracao explicita de concorrentes e historico de versoes.
- Benchmark estrutural e semantico informacional, decisoes de requisitos `required/recommended/optional/discarded`, enforcement consultivo ou requerido, classificacao indicativa de competitividade e pacote versionado para o Planejador.
- Extrator server-side com defesa SSRF e falhas isoladas por URL; testes usam exclusivamente fixture HTML e DNS controlado.
- Persistencia append-only no payload JSONB do item Radar quando remoto esta disponivel; fallback local marcado sem recolher SERP ou reextrair paginas.
- Limites: execucao manual autenticada ainda e necessaria para validar permissao, marca, recovery remoto e comportamento visual. Nao houve chamada Serper, scraping externo, migration, commit ou deploy.

## Correção estrutural — 2026-07-20

- Causa dos metadados sem resultados: o reload remoto substituía o registro local pelo mesmo `id` mesmo quando o payload remoto tinha somente metadados; a página nova também lia exclusivamente `research`, ignorando `snapshot.results` legado. O payload local completo não havia sido apagado.
- O merge agora preserva o registro mais rico quando a versão/hash são compatíveis, usa o remoto completo mais recente, combina payloads do mesmo snapshot e bloqueia conflito de contexto ou hash. Conflitos ficam visíveis no Radar.
- A página usa `articleDnaVersionId` como chave canônica limpa; `radar:<articleId>`, `articleId`, `pub-k-*` e aliases de hidratação são apenas compatibilidade com redirect `replace` e aba preservada.
- A visão do snapshot recupera `organicResults`, PAA, related, Knowledge Graph e diagnóstico do payload canônico ou legado. Resultado, estrutura, semântica e estados vazios deixam de depender de `RadarAnalysis`.
- O modo com KGR/volume ausentes não sugere Competitivo completo por falha de hidratação: usa sugestão KGR leve com confiança baixa e explica a ausência.
- `RadarEvidencePackage` substitui a transferência de decisões finais: leva evidências observadas, curadoria, concorrência, estrutura descritiva, semântica, conflitos, proveniência e hash; não leva metas finais, outline ou requisitos do Guardião.

## Identidade editorial e proteção compreensível — 2026-07-20

- A página própria agora apresenta Identidade editorial, Estratégia recebida do Arquiteto, Contexto do silo, comparação DNA x SERP, progresso e Próxima ação.
- Publicados exibem `Publicado e protegido`; keyword principal, slug, canonical, marca e URL estrutural são preservados e somente leitura. Artigos novos também apontam alterações para o Arquiteto.
- IDs técnicos ficam recolhidos em `Ver proveniência e IDs`; o cabeçalho usa título, publicação, silo, ArticleDNA e evidências.
- Keywords sem conflito não bloqueiam aprovação por falta de nota. Somente `Revisar no Arquiteto` exige justificativa.
- Campos temporários de curadoria são salvos ao sair do campo; reload, troca de aba e digitação não consolidada não criam novas versões.
- Listas de entidades e termos semânticos usam chaves React compostas com índice estável da renderização; valores repetidos como `estratégia` e `tráfego` não geram mais avisos de identidade duplicada.
- **Limitação de validação:** o build/tsc global está bloqueado por alterações independentes e ainda inconsistentes em `components/planejador/` e `lib/planejador/` (`publicationIdentity`/`EditorialBriefingDto`). O lint e os testes direcionados do Radar passam; o módulo Planejador não foi alterado nesta tarefa.

## Contexto KGR, volume e identidade estratégica — 2026-07-21

- Auditoria confirmou que o Radar já recebe `ArticleKgrIdentity`, `ArticleVolumeStrategy`, `ArticleHierarchyStrategy`, `ArticleControlContext` e referências de KeywordDNA através de `RadarItem.arquitetoStrategyContext`; nenhum contrato do Arquiteto foi alterado.
- O novo normalizador `lib/radar/strategy-context.ts` transforma somente esses dados recebidos em `RadarKgrStrategy`. A tela mostra classificação e origem, principal, slug, alinhamento, composição, limite de seis, volumes, aviso de sobreposição, papéis, hierarquia e proteção de publicação.
- A sugestão de modo respeita uma classificação KGR recebida mesmo quando score/volume atuais não atenderiam silenciosamente ao threshold estrito. Ausência continua honesta como `Classificação KGR não recebida`.
- Artigos novos com slug desalinhado apontam revisão no Arquiteto; publicados permanecem protegidos e não são bloqueados. Overflow legado acima de seis referências fica visível e bloqueia apenas a consolidação de novo pacote.
- `RadarEvidencePackage.kgrStrategy` é aditivo e participa do hash do pacote. O pacote não recebe outline, metas finais, CTA, densidade, requisitos do Guardião ou alterações de DNA.
- Arquivos desta rodada: `lib/radar/strategy-context.ts`, `lib/radar/analysis-contracts.ts`, `lib/radar/evidence-package.ts`, `components/radar/radar-analysis-page.tsx`, `tests/radar-kgr-context.test.mts`, SDD e documentação do Radar.
- Testes focados: 24 passaram. Lint direcionado do Radar passou. O build deve ser executado novamente; `tsc --noEmit` global permanece limitado por erros existentes em `lib/planejador/**` e `tests/site-kgr-contract.test.mts`, sem alteração nesses arquivos.

## Relatorio competitivo - 2026-07-28

- **Verificado no codigo:** `RadarCompetitiveReport` aditivo registra referencias de identidade/DNAs/SERP/analise, workflow, respostas, perguntas, concorrentes, benchmark comparavel, frequencias observadas, semantica, links, elementos visuais, necessidades, limitacoes, hash e proveniencia.
- **Verificado no codigo:** a aprovacao do Radar consolida o relatorio na mesma versao e o inclui no `RadarEvidencePackage`; o pacote preserva a fronteira do Planejador e nao envia outline, CTA, densidade ou metas finais.
- **Confirmado por teste:** `tests/radar-competitive-report.test.mts` cobre amostra pequena, exclusao de video/parcial, resposta pendente, frequencia body-only, hash e pacote aditivo. Build, TypeScript e lint direcionado do Radar passam.
- **Ainda nao verificado:** aprovacao e persistencia remota com artigo real, navegacao autenticada, e validacao visual manual nos quatro breakpoints. Nenhuma chamada real Serper ou escrita remota foi feita.
- **Limitacao conhecida:** `tests/radar-hydration.test.mts` continua falhando em fixture legado do Arquiteto por `fallbackHierarchyStrategy` sem `score/components`; nao foi alterado por permanecer fora do escopo Radar.

## Fechamento de usabilidade e coerência — 2026-07-21

- Estados de investigação, publicação da versão e transferência ao Planejador foram separados na página própria. Itens orgânicos pendentes continuam impedindo a conclusão da investigação; envio anterior não conclui a versão atual.
- `plannerTransfer` registra a versão enviada sem substituir o pacote anterior nem duplicar artigo ou `ContentPlan`; a interface diferencia versão corrente, aprovada, enviada e atualização disponível.
- Canonical, URL estrutural e estado de publicação agora distinguem dado não recebido nesta etapa de ausência confirmada. Nenhuma URL é inventada; publicados permanecem protegidos e artigos novos apontam a revisão para o Arquiteto.
- Formatos SERP foram classificados. Apenas artigos editoriais completos entram no benchmark; vídeos, parciais e demais formatos ficam visíveis e explicitamente excluídos da amostra comparável.
- Semântica foi organizada em conteúdo relevante, navegação, legal e plataforma. Termos de ruído continuam visíveis e podem ser recuperados ou ignorados com nova versão de evidência.
- Arquivos principais: `components/radar/radar-analysis-page.tsx`, `lib/radar/analysis-contracts.ts`, `lib/radar/analysis-insights.ts`, `lib/radar/workflow-insights.ts`, `lib/radar/evidence-package.ts`, `tests/radar-usability.test.mts` e `tests/radar-navigation.test.mts`.
- Testes confirmados nesta rodada: 19 testes focados do Radar, `tsc --noEmit` e lint direcionado do escopo Radar. Nenhuma chamada real Serper, escrita remota, migration, commit ou deploy foi executada.
- Validação pendente: quatro cenários manuais (artigo novo, publicado, SERP pendente e atualização após envio) e uma única coleta Serper autenticada acionada explicitamente pelo usuário.

## Seleção, amostra e prévia do relatório — 2026-07-29

- Verificado no código: a seleção de uma referência principal ou de apoio já a coloca na fila de análise; a tela não possui checkbox nem ação individual de extração. Formato, artigo próprio e exclusão têm funções próprias e mutuamente exclusivas.
- Verificado no código: a ação coletiva mostra `Analisar referências selecionadas (N)`, fica desabilitada como `Análise da amostra atualizada` quando não há páginas novas e não reprocessa URLs já extraídas. Decisões, motivos e notas continuam em sucessoras versionadas do payload existente.
- Verificado no código: o progresso agora usa `Relatório gerado`, e a próxima ação distingue páginas pendentes, amostra observada, prévia revisável, aprovação humana e transferência.
- Verificado no código: cada alteração de curadoria ou análise gera uma prévia `RadarCompetitiveReport` draft antes da aprovação. O relatório detalhado possui um único título com modo, status e versão; inclui amostra, referências por função, perfil, keywords observadas, semântica, respostas, DNA, necessidades, visuais, links e limitações.
- Verificado no código: uma página comparável é exibida como valor observado, sem média/mediana de mercado; KGR leve não exige três páginas para gerar prévia.
- Confirmado por teste: suíte focada desta rodada com 32/32 testes, `tsc --noEmit`, lint direcionado e build passaram. A suíte ampla `tests/radar*.test.mts` ficou em 58/59; a única falha continua sendo o fixture legado fora do escopo em `tests/radar-hydration.test.mts` (`fallbackHierarchyStrategy` sem `score/components`).
- Ainda não verificado: comportamento autenticado no navegador, persistência remota, coleta real Serper, extração de páginas externas, responsividade e contraste em light/dark. Nenhuma escrita remota, migration, commit ou deploy foi executada.

## Painel de progresso restrito ao Resumo — 2026-07-29

- Verificado no código: o painel completo de fluxo e progresso pertence exclusivamente ao Resumo. As demais áreas mostram somente orientações contextuais relacionadas à tarefa atual.

## Correção da resolução da aba Análise da amostra — 2026-07-29

- Causa registrada: a página consultava `tabAliases[requestedTab]` diretamente, sem normalização centralizada do parâmetro e sem cobertura explícita para variantes legadas. A renderização, o cabeçalho e o estado visual dependiam desse lookup bruto.
- Verificado no código: `resolveRadarTab` agora normaliza espaços/caixa, resolve `analise-amostra`, `analise_amostra` e `analysis` para a seção canônica e usa `resumo` somente para valores desconhecidos. O mesmo estado resolvido controla o botão ativo, `Etapa atual` e o componente renderizado.
- Confirmado por teste: a URL `?tab=analise-amostra` resolve para a Análise da amostra; o conteúdo do Resumo não é montado nessa área; o retorno para Resumo restaura o painel; troca de aba não cria versão e os aliases/ fallback permanecem cobertos.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/radar; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/radar`; pesquisa, evidências e persistência existente foram preservadas.

## Correção localizada — navegação canônica do artigo — 2026-07-28

- **Verificado no código:** a origem do 404 era `modules/radar/radar-page.tsx`, que montava `/radar/{row.articleId}`. A rota vigente é `app/(brand)/[brandRef]/radar/[articleId]/page.tsx`.
- **Verificado no código:** o destino agora é `/{brandRef}/radar/{articleDnaVersionId}`. O `brandRef` é preservado da rota tenantizada e o ID é obtido por `radarCanonicalRouteKey`; `pub-k-*`, ID do relatório e ID de snapshot continuam somente compatibilidade/resolução, não destino novo.
- **Verificado no código:** `requireTenantModule(brandRef, "radar")` valida sessão, marca e módulo antes da página; o pipeline exibido permanece escopado à marca ativa, sem busca global ou fallback para outro tenant.
- **Verificado no código:** Radar, Arquiteto, Planejador, detalhe do Radar e helper operacional não montam mais o detalhe global `/radar/{id}`. Sem `brandRef` válido, as ações ficam desabilitadas com `Contexto da marca não disponível`.
- **Confirmado por teste:** `tests/radar-canonical-navigation.test.mts`, `tests/radar-route-resolution.test.mts` e `tests/tenant-routing.test.mts` passam (11 testes).
- **Ainda não verificado:** smoke test autenticado em Adalba/Lindisse, abertura real do artigo e isolamento observado no navegador; nenhum relatório, SERP, persistência, migration ou provider foi alterado nesta correção.


## Reorganização do fluxo por modo — 2026-07-29

- Verificado no código: o detalhe do Radar usa cinco áreas (Resumo, Selecionar referências, Análise da amostra, Relatório, Histórico), com modo e etapa atual no cabeçalho e progresso único em seis estados.
- Verificado no código: a sugestão de modo respeita KGR recebido, mantém ausência explícita e não inicia coleta automática. A decisão humana pode substituir a sugestão antes da criação da versão de análise.
- Verificado no código: a seleção mantém todos os resultados da SERP visíveis; artigo próprio não é enviado para extração/benchmark, e formatos de vídeo/social/outros são referências de formato fora do benchmark editorial.
- Verificado no código: a análise da amostra separa estrutura, páginas analisadas, formatos, semântica central/relevante/ignorada e recuperação manual. O relatório recebe título por modo e a aprovação/envio continuam usando RadarCompetitiveReport e RadarEvidencePackage existentes.
- Confirmado por teste: tests/radar-flow-organization.test.mts, tests/radar-navigation.test.mts, tests/radar-usability.test.mts, tests/radar-analysis.test.mts, tests/radar-kgr-context.test.mts e tests/radar-competitive-report.test.mts passam (25 testes focados); tsc --noEmit e lint direcionado do escopo alterado passam.
- Ainda não verificado: navegação autenticada, persistência remota, isolamento observado no navegador, responsividade real em 360/768/1024/1440 e contraste visual em light/dark. Nenhuma coleta real Serper, escrita remota, migration, commit ou deploy foi executada nesta rodada.
- Contratos preservados: não foram criadas entidades, migrations ou alterações em ArticleDNA, SiloDNA, KeywordDNA, slug, canonical, marca, URL, ContentPlan ou lógica interna do Planejador.

## Adapter SERP compatível com o schema canônico — 2026-08-25

- **Verificado no código:** `editorial_serp_snapshots` e `editorial_serp_reviews` são consumidas pelo adapter do Radar com os campos de `0027`: UUIDs, `snapshot_version`, `source_version_id`, `previous_snapshot_id`, hash, ator e timestamp.
- **Implementado:** novos IDs de snapshot e revisão são UUID puros; IDs textuais `serp:*` e `serp-review:*` não chegam às colunas UUID. Um `previousSnapshotId` textual é resolvido contra o snapshot da mesma marca/artigo quando possível; sem correspondência, o boundary persiste `null` e preserva o payload legado.
- **Implementado:** `source_version_id` recebe exclusivamente o `articleDnaVersionId` canônico; `brandId` permanece o tenant; valores de provider e payload legado continuam legíveis apenas como histórico.
- **Confirmado por teste:** 17 testes direcionados de persistência Radar/repositories passam; não há chamada externa nos testes.
- **Banco:** `DATABASE_CHANGE_REQUIRED = NO`; nenhuma migration, DDL, escrita remota ou smoke real foi executado nesta rodada.
- **Pendente:** smoke manual DataForSEO → INSERT → readback → reload → histórico.

## Smoke real DataForSEO end-to-end — 2026-08-25

- **Contexto confirmado:** `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`, `articleId=group-11aenvf`, `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4`, keyword principal `marketing online`, provider `dataforseo`.
- **PASS:** uma chamada real DataForSEO percorreu a rota canônica do Radar, a resolução global, a normalização e a persistência 0027. Não houve chamada Serper nem review automática.
- **Snapshot remoto confirmado:** `id=f60d794f-71aa-427c-b53a-843045a0d5a3`, `source_version_id=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4`, `snapshot_version=2`, `previous_snapshot_id=5227798f-0700-430a-8a25-b842d234b468`, provider `dataforseo`, payload normalizado e timestamps válidos.
- **Readback/reload/histórico:** o `SerpSnapshotRepository` recuperou o snapshot em duas leituras independentes, marcou o envelope como `persistenceMode=remote` na fronteira de leitura e listou dois snapshots DataForSEO do artigo; nenhum review foi criado automaticamente.
- **Limitação externa observada:** `GET /api/editorial/workspace` retorna 503 porque `public.brand_invitations` não está no schema cache remoto. O smoke não aplicou migration nem alterou esse módulo; o contexto e os readbacks do Radar foram validados pelos repositórios canônicos específicos.
- **Ledger:** não existe capability remota `dataforseo.serp_compatibility` no catálogo; por isso o fluxo não criou evento adicional em `integration_usage_events`. O crédito da única chamada externa foi consumido pelo provider; não foi criado registro manual posterior.
- **Resultado:** `DATAFORSEO_REAL_CALLS=1`, `REMOTE_WRITES=1 snapshot`, `MIGRATIONS=0`, `SERPER_CALLS=0`, `DATABASE_CHANGE_REQUIRED=NO`. O Radar SERP real está validado end-to-end dentro do escopo do Radar; a limitação do workspace geral permanece pendente fora desta correção.

## Lote Radar R2 — telas avançadas e navegação do Workbench — 2026-08-25

- **Verificado no código:** as seis etapas do Workbench agora navegam diretamente para `serp`, `referencias`, `analise-serp`, `evidencias-adicionais` e `relatorio`, preservando `brandRef`, `articleDnaVersionId` e o artigo selecionado. O clique de etapa não cria versão; a ação separada de SERP continua explícita.
- **Implementado:** a tela SERP mostra keyword, provider, targeting, snapshot atual, versão, captura, tipos, preview, histórico, previous snapshot, persistência e comparação descritiva. Abrir a tela não chama provider; `Atualizar SERP` é a única ação de coleta.
- **Implementado:** Referências recebeu busca, filtros por função, pendências, motivos, restauração e ação coletiva de análise. Análise SERP exibe necessidades, lacunas, conflitos, oportunidades e fontes observadas, sem transferir decisão ao Planejador.
- **Implementado:** Evidências adicionais foi organizada em seções internas e permanece explicitamente em fixture local. Telegram global, binding e persistência remota de contribuições não foram conectados.
- **Implementado:** o Workbench mostra resumo de atividade derivado do estado existente do artigo; o Perfil expandido ganhou acesso rápido às áreas detalhadas sem criar versão.
- **Confirmado por teste:** 21 testes R2, 33 testes direcionados do fluxo e 10 testes de persistência com loader passam. Lint direcionado passa e o guardião visual passa nas cinco superfícies novas.
- **Limitações:** `pnpm build` foi bloqueado pelo download de `Geist`/`Geist Mono` no ambiente; `tsc` global mantém erros preexistentes em `lib/minerador/keyword-qualification.ts` e regex legadas. A inspeção visual autenticada não foi concluída porque a sessão local abriu em `/login`.
- **Governança:** `DATABASE_CHANGE_REQUIRED=YES` para a fundação Telegram; `PLANNER_GERAL_REQUIRED=YES`; nenhuma migration, escrita remota, chamada DataForSEO/Serper ou deploy foi executado nesta rodada.

## Lote Radar R3 — Workbench consolidado — 2026-08-25

- **Verificado no código:** o Workbench principal agora organiza `SERP → Amazon → Conteúdo → Especialista` em quatro áreas expansíveis no mesmo contexto; somente uma área fica aberta por vez.
- **Implementado:** SERP concentra coleta explícita, referências e análise da amostra; Amazon permanece como contrato visual/local não aplicável, sem provider ou `ProductEvidence`; Conteúdo espelha ArticleDNA, sinais SERP e necessidades; Especialista mantém conteúdo existente, incluindo YouTube, separado da SERP e usa somente a fixture local já existente.
- **Implementado:** o relatório consolidado fica abaixo das quatro áreas e mantém aprovação/transferência pelos fluxos detalhados compatíveis. A tabela e o Perfil expandido consomem o mesmo `RadarR3Model` e a mesma próxima ação, preservando `brandId` e `articleDnaVersionId`.
- **Implementado:** o painel global de atividade deixou de ser renderizado no Workbench R3; permanece apenas a última atividade compacta. Nenhuma troca visual cria versão, chama provider ou altera ArticleDNA/SiloDNA/KeywordDNA.
- **Confirmado por teste:** 27 testes focados do Radar, incluindo 6 novos testes R3, passam; lint do código alterado, guardião visual e `git diff --check` passam.
- **Validado manualmente:** Workbench, expansão de SERP/Amazon/Conteúdo/Especialista, subárea de análise, Perfil espelhado e tabela em sessão autenticada, com viewport padrão e 360/768/1024/1440 px no tema escuro. **Ainda não verificado:** tema claro e aprovação/transferência por interação no navegador. Não houve chamada Amazon/Telegram/DataForSEO, escrita remota, migration, commit, push ou deploy nesta rodada.
- **Governança:** a fundação Telegram continua `TELEGRAM_RADAR_BACKEND_READY=PARTIAL`, `DATABASE_CHANGE_REQUIRED=YES` e `PLANNER_GERAL_REQUIRED=YES`; o R3 não cria schema nem desbloqueia essa dependência.

## Lote Radar R3.1 — refinamento do Workbench — 2026-08-25

- **Implementado:** o Workbench não exibe mais `Detalhe compatível` como ação global nem a faixa redundante `Área ativa`; a próxima ação permanece informativa no cabeçalho e as ações executáveis continuam nas áreas correspondentes.
- **Implementado:** SERP, Amazon, Conteúdo, Especialista e Relatório mantêm seus aprofundamentos dentro das próprias expansões. O dossiê de Conteúdo prioriza Silo, Função e estado do SiloDNA; IDs, snapshots, version IDs e hashes ficam em `Proveniência / detalhes técnicos` recolhido.
- **Preservado:** handlers, hrefs e rotas canônicas/legadas continuam no código para deep links e compatibilidade; a remoção é apenas da apresentação global do Workbench.
- **Validado manualmente:** sessão autenticada confirmou 4 cards, SERP/Conteúdo/Especialista expansíveis, Perfil, tabela, ausência de overflow horizontal e detalhes técnicos recolhidos em 768/1024/1440 px no tema escuro. A captura por API não é suportada pela conexão Chrome usada nesta rodada.
- **Ainda não verificado:** tema claro e aprovação/transferência por interação; nenhuma chamada externa, escrita remota, migration, alteração de contrato ou criação de versão foi executada.

## Lote Radar R3.2 — fila sequencial e Workbench contextual — 2026-08-25

- **Implementado:** o Workbench não escolhe mais um artigo automaticamente. Sem seleção, mostra `Selecione um artigo para trabalhar` e quatro cards desabilitados; com seleção, o cabeçalho identifica o artigo e todos os dados são derivados do mesmo `RadarR3Model` usado pela tabela e pelo Perfil.
- **Implementado:** a linha da planilha pode ativar o artigo por clique ou teclado, mantém a seleção visual e troca o contexto completo do Workbench. A expansão local é reiniciada na troca de artigo para impedir vazamento de área ou estado entre artigos; os handlers, aliases e rotas legadas permanecem preservados.
- **Implementado:** SERP, Amazon, Conteúdo e Especialista são cards compactos com resumo, status e chevron; somente uma área expande por vez. Amazon continua `Não aplicável`, sem chamada externa. O relatório consolidado virou `<details>` recolhido, com faixa horizontal compacta e prévia/ações somente sob demanda.
- **Implementado:** o Workbench passou a ser um bloco `shrink-0` sem altura rígida e a planilha ocupa o restante flexível da viewport. A mudança compartilhada em `components/editorial/operational-data-grid.tsx` é aditiva: consumidores existentes sem `activeRowId`/`onRowActivate` preservam o comportamento anterior.
- **Confirmado por teste:** 17 testes focados R3/R3.1/R3.2 passam, incluindo estado sem seleção, isolamento entre artigos, cards desabilitados, Amazon não aplicável, relatório recolhido, modelo compartilhado e ausência de provider no render.
- **Validado manualmente:** sessão autenticada em tema escuro confirmou estado vazio, seleção pela planilha, título/metadados do artigo, SERP/Conteúdo exclusivos, exclusividade de expansão, relatório fechado/aberto e domínio sem overflow horizontal em 1440, 1024, 768 e 360 px. O dataset disponível nesta sessão tinha um artigo, portanto a troca visual entre dois artigos foi coberta pelo teste de modelos isolados, não por duas linhas reais.
- **Ainda não verificado:** tema claro, aprovação/transferência por interação e smoke remoto. Nesta rodada não houve chamada DataForSEO, Serper, Telegram, Amazon ou outro provider; não houve migration, schema/RLS, escrita remota, criação de versão, commit, push ou deploy.

## Lote Radar R4 — fila sequencial e foco por artigo — 2026-08-25

### IMPLEMENTED — verificado no código

- O Workbench fechado mantém somente `Radar Workbench`, `Trabalhando em`, o título do artigo focado e os quatro cards fixos `SERP`, `Amazon`, `Conteúdo` e `Especialista`. Sem foco, mostra `Selecione um artigo para trabalhar`; os cards permanecem neutros, desabilitados e não repetem a mensagem.
- `focusedArticleId` e `selectedArticleIds[]` são estados distintos. O clique/teclado da linha define foco sem alterar a seleção coletiva; checkbox e seleção alimentam exclusivamente a barra inferior. O Perfil expandido continua usando o mesmo modelo do artigo da linha.
- O estado local por artigo cobre fila SERP, tópicos, especialista e relatório. A tabela mostra status do processo correto, incluindo processamento SERP, revisão SERP, resposta do especialista e relatório pronto para revisão.
- A barra inferior existente recebeu `RadarR4BulkOperationsBar`, com contagem selecionada, ações contextuais e seletor local `eligible / alreadyDone / blocked` por operação. O grid compartilhado foi estendido de forma aditiva com `renderBulkBar`; consumidores que usam `bulkActions` permanecem compatíveis.
- A fila SERP local deduplica artigos e usa `QUEUED`, `RUNNING`, `WAITING_REVIEW`, `COMPLETED`, `FAILED_RETRYABLE` e `FAILED_FINAL`. O lote somente começa por ação explícita; seleção, foco e abertura não coletam SERP.
- A revisão humana permanece uma fila: após coleta o item vai para `WAITING_REVIEW`, a planilha expõe o estado e o painel SERP oferece anterior/próxima pendente sem nova rota.
- Preparação de tópicos, aprovação em lote, preparação de relatório e estados da fila do especialista foram adicionados como estado de sessão por artigo. A aprovação humana continua separada do envio.
- Avisos usam o bridge de avisos da sessão existente; não foi criada tabela de notificações. Rotas, aliases, handlers canônicos e deep links legados foram preservados.

### LOCAL_ONLY — confirmado por teste, não remoto

- `prepareRadarR4Topics` gera propostas determinísticas locais a partir do ArticleDNA, resumo e evidências observadas, com saída `TOPICS_READY_FOR_REVIEW`. Não há chamada DeepSeek automática nem envio automático.
- Aprovação de tópicos, relatório pronto para revisão e estados `READY_TO_SEND` são apenas estado de sessão e não criam versão, ContentPlan, ExpertEvidence ou registro remoto.
- A fixture detalhada do especialista continua disponível para validação de interface, mas envio, recebimento, áudio, transcrição e organização são simulados/localizados.

### BLOCKED_BY_DATABASE — não atravessado nesta tarefa

- `BATCH_PROCESSING_CAN_REUSE_EXISTING_JOBS = PARTIAL`: `external_processing_jobs` e o Local Worker existentes cobrem a fundação de processamento de contribuições Telegram, mas não há consumidor canônico genérico para lote SERP. Não foi criada tabela, queue, migration, RLS ou backend paralelo.
- O pipeline `Telegram → Contribution → áudio/STT/Storage → organização DeepSeek` permanece bloqueado pela fundação remota e pelo gate do Planner Geral. Não foi afirmada automação real.

### PLANNED — ainda não verificado

- Worker/consumer genérico de lote SERP, persistência remota de jobs e integração remota da contribuição exigem decisão estrutural do Planner Geral e autorização própria.
- Execução autenticada de um lote real, readback/reload remoto, tema claro e aprovação/transferência por interação no navegador permanecem validações posteriores.

### Confirmado nesta rodada

- 22 testes direcionados R3/R3.1/R3.2/R4 passam; lint do código alterado passa; nenhum provider, Telegram, DeepSeek, migration, escrita remota, commit, push ou deploy foi executado.
- `tsc --noEmit` permanece bloqueado somente por `lib/minerador/keyword-qualification.ts` e três regex TS1501 em `tests/agency-adalba-platform-internal.test.mts`; não há erro TypeScript novo no escopo R4.

## Lote Radar R4.1 — refinamento fila sequencial e revisão por processo — 2026-08-26

- **Implementado e confirmado no código:** `focusedArticleId` permanece separado de `selectedArticleIds[]`; a planilha governa o foco operacional e a Bulk Operations Bar governa somente ações coletivas. Cada artigo mantém SERP, Amazon, tópicos, especialista e relatório independentes.
- **Implementado e confirmado por teste:** a elegibilidade agora diferencia `eligible`, `alreadyDone`, `blocked` e `notApplicable`; revisão e aprovação SERP são ações distintas; falha final não entra novamente na fila; Amazon expõe `AMAZON_APPLICABLE`, `AMAZON_NOT_APPLICABLE`, `AMAZON_PENDING` e `AMAZON_REVIEWED` localmente.
- **Implementado e confirmado por teste:** o contexto do especialista reúne ArticleDNA, análise SERP, estado Amazon e material existente; a pauta pode ser editada, removida, adicionada e reordenada localmente antes do gate `READY_TO_SEND`.
- **Implementado e confirmado no render:** a planilha continua dominante; em 1440/1024 px o Workbench fechado ficou em aproximadamente 31,7% da altura útil, sem altura rígida e sem overflow horizontal. O estado vazio mostra exatamente `Selecione um artigo para trabalhar` e cards neutras desabilitadas.
- **Confirmado nesta rodada:** 24 testes direcionados R3/R3.1/R3.2/R4 passam; ESLint direcionado, suíte visual 20/20, guardião visual e `git diff --check` passam. Render autenticado em tema escuro foi conferido em 1440/1024/768/360 px, com foco, seleção, barra coletiva, expansão contextual e planilha abaixo.
- **Ainda não verificado:** tema claro por screenshot, lote real com provider, readback/reload remoto, aprovação/transferência via interação autenticada, Telegram/DeepSeek/STT/Storage reais e worker genérico.
- **Limites preservados:** nenhuma chamada DataForSEO, Amazon, Telegram ou outro provider; nenhuma migration, schema/RLS, escrita remota, criação de versão, commit, push ou deploy. Os erros globais de TypeScript permanecem nos arquivos já conhecidos de Minerador/testes e não surgiram no escopo Radar.

## RADAR R5 — fila sequencial e preparação de especialista — 2026-08-26

- **Auditoria autenticada somente leitura:** a marca Care Glow apresentou 1 artigo real na planilha (`Cobrir com clareza o tema “marketing online”.`), 1 artigo elegível para SERP, 0 artigos com snapshot SERP real existente e 0 artigos observados em estágio posterior nesta sessão. A leitura SQL read-only do catálogo remoto foi recusada pelo guard de autorização; não foi contornada.
- **Implementado no código:** o lote SERP continua usando `pipeline.collectSerp`, que chama exclusivamente o handler canônico `POST /api/editorial/serp`. A execução no cliente é sequencial, mantém estado por artigo (`QUEUED`, `RUNNING`, `WAITING_REVIEW`, `COMPLETED`, `FAILED_RETRYABLE`, `FAILED_FINAL`) e continua para o próximo item depois de uma falha.
- **Implementado no código:** o processamento padrão não reprocessa snapshot real existente. Itens já processados ficam `ALREADY_DONE` e aparecem somente como `refreshSerp` mediante ação explícita. A classificação também separa `ELIGIBLE`, `REQUIRES_EXPLICIT_REFRESH` e `BLOCKED`.
- **Implementado no código:** reload/reidratação deriva `WAITING_REVIEW` ou `COMPLETED` de `editorial_serp_snapshots`/`editorial_serp_reviews` já carregados pelo pipeline. A fila em andamento ainda é estado da sessão porque não foi criada persistência/job genérico novo; essa é a limitação de durabilidade declarada.
- **Implementado no código:** `reviewSerp` deixou de marcar a fila como concluída sem decisão. A revisão individual do Workbench chama o consumidor canônico e só então conclui o artigo; a fila de revisão oferece artigo anterior/próximo sem misturar o contexto do Workbench.
- **Implementado no código:** o progresso compacto aparece somente enquanto o lote possui itens não concluídos e oferece `Ver pendentes`/`Ver falhas`. A seleção múltipla continua pertencendo à planilha e o foco continua pertencendo a um único artigo.
- **Implementado no código:** a preparação de pautas usa contexto do ArticleDNA, necessidades/lacunas e diagnóstico SERP, referências aprovadas, estado Amazon e material existente disponível no artigo. Cada artigo é processado independentemente; falha em um artigo vira `FAILED_RETRYABLE` sem invalidar os demais.
- **Implementado no código:** `POST /api/editorial/radar-topics` usa `resolvePipelineContext`, `resolveDeepSeekCanonicalConfig` e `generateStructuredAI`. O contrato exige 3–5 pautas com origem, justificativa e necessidade; a resposta é cópia de trabalho local, exige revisão individual e não cria artigo, versão ou envio Telegram.
- **Implementado no código:** pautas podem ser editadas, removidas, adicionadas, reordenadas, desfeitas/refeitas e marcadas individualmente como revisadas. A aprovação coletiva só fica elegível depois que todas as pautas daquele artigo passaram pelo gate individual.
- **Classificação de execução:** `SERP_BATCH_RUNTIME=IMPLEMENTED_NOT_SMOKED`; `PARTIAL_FAILURE_HANDLING=IMPLEMENTED_NOT_SMOKED`; `RELOAD_RECOVERY=IMPLEMENTED_NOT_SMOKED`; `SERP_REVIEW_QUEUE=IMPLEMENTED_NOT_SMOKED`; `REAL_EXPERT_CONTEXT=IMPLEMENTED_NOT_SMOKED`; `DEEPSEEK_TOPIC_PIPELINE=IMPLEMENTED_NOT_SMOKED`; `TOPIC_REVIEW_QUEUE=IMPLEMENTED_NOT_SMOKED`.
- **Durabilidade:** `SERP_BATCH_DURABILITY=PARTIAL_EXISTING_SNAPSHOTS_REVIEWS_ONLY`; snapshots/revisões existentes são reutilizados, mas `QUEUED/RUNNING` não foram promovidos a job remoto novo.
- **Telegram:** `TELEGRAM_REMOTE_FOUNDATION=AWAITING_READ_ONLY_AUTHORIZATION`; `REAL_TELEGRAM_SEND=BLOCKED_BY_DATABASE`; `REAL_TELEGRAM_RECEIVE=BLOCKED_BY_DATABASE`; `TELEGRAM_TEXT_E2E=AWAITING_MANUAL_TEST`; áudio permanece posterior ao smoke de texto. Nenhum arquivo de Telegram, schema, migration ou RLS foi alterado.
- **Nesta rodada:** `REAL_DATAFORSEO_CALLS=0`, `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0`, `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO`. O route handler DeepSeek foi apenas implementado; não foi invocado.
- **Validação:** 24 testes direcionados R3/R4/R5 passaram; ESLint direcionado não apresentou erro; a suíte ampla Radar terminou em 103/105, mantendo a fixture legada de hidratação (`fallbackHierarchyStrategy` sem `score/components`) e o erro de resolução ESM preexistente de `lib/server/serp-persistence-adapter.ts` fora do escopo. O TypeScript global também permanece limitado por `lib/minerador/keyword-qualification.ts`, `modules/arquiteto/arquiteto-workspace.tsx` e três regex TS1501 em `tests/agency-adalba-platform-internal.test.mts`; nenhum desses arquivos foi alterado nesta continuidade. Smoke autenticado de lote, revisão, DeepSeek, readback remoto e tema claro continuam não verificados.

## RADAR R6 — fila sequencial, contexto de especialista e relatório consolidado — 2026-08-26

- **Implementado localmente:** o Radar agora possui o builder canônico `buildExpertTopicContext(articleId)`. Ele reúne o ArticleDNA correto, referências de KeywordDNA, SiloDNA recebido, SERP revisada, referências aprovadas, necessidades, lacunas, conflitos, estado Amazon e material existente do especialista. Os IDs de proveniência vêm somente dos envelopes, snapshots e registros locais já recebidos; nenhum ID de pauta é enviado como identidade de fonte.
- **Implementado localmente:** `POST /api/editorial/radar-topics` usa exclusivamente o consumer canônico DeepSeek server-side, exige 3–5 perguntas com origem, justificativa, necessidade e referência e devolve cópia de trabalho em `TOPICS_READY_FOR_REVIEW`. A validação local rejeita repetição, pergunta já conhecida, origem ausente ou referência que não pertence ao contexto. `DEEPSEEK_RUNTIME=IMPLEMENTED_NOT_SMOKED`; `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- **Implementado localmente e confirmado por teste:** cada pauta preserva origem combinada, referência, necessidade, motivo e material complementar. A expansão Especialista permite editar, adicionar, remover, reordenar, desfazer/refazer e revisar individualmente. O estado `Proposto pela IA` permanece distinto de `Aprovado para envio`; a aprovação coletiva só fica disponível quando todas as pautas do artigo foram revisadas.
- **Implementado localmente:** o Dossiê Conteúdo mostra perguntas preparadas como solicitações, necessidades, lacunas, estado da revisão e material relacionado. Perguntas não são `ExpertEvidence`; contribuição recebida/revisada continua sendo o único caminho para evidência do especialista.
- **Implementado localmente e confirmado por teste:** o modelo `RadarR6ConsolidatedReport` reúne ArticleDNA, evidências SERP, Amazon quando aplicável e `ExpertEvidence` quando existir, mantendo IDs e proveniência. O relatório pode ser prévia sem especialista quando `NOT_REQUIRED`; quando a contribuição é necessária, exibe pendência e não é final. `REPORT_GENERATED`, `REPORT_REVIEWED` e `REPORT_APPROVED` permanecem gates separados. A aprovação local exige SERP revisada, relatório revisado e ausência de contribuição pendente; não cria versão remota nem envia automaticamente ao Planejador.
- **Implementado localmente e confirmado no render:** o relatório fica recolhido em uma faixa compacta abaixo das quatro áreas congeladas. Ao abrir, mostra resumo, evidências, necessidades, lacunas, conflitos, recomendações e proveniência sem transformar o painel em superfície permanente dominante. O Workbench e a planilha preservam o comportamento R3/R4/R5.
- **Handoff:** `PLANNER_HANDOFF_CONTRACT=STRUCTURAL_CHANGE_REQUIRED`. O pacote atual aceito pelo Planejador preserva ArticleDNA/SiloDNA/SERP e decisões do Radar, mas não possui campos aditivos para Amazon/ExpertEvidence do modelo R6. A mudança exigiria consumidor/contrato compartilhado; portanto o resultado é `BLOQUEADO — PLANNER GERAL` e nenhum arquivo do Planejador foi alterado.
- **Telegram:** `TELEGRAM_REMOTE_FOUNDATION=PARTIAL`: migration, contratos e repositórios locais existem, mas não há confirmação autorizada de aplicação remota, RLS, webhook, bot global ou readback das seis tabelas. Por isso `REAL_TELEGRAM=BLOCKED_BY_DATABASE`, `EXPERT_BRIEF_RUNTIME=BLOCKED_BY_DATABASE`, `TELEGRAM_BINDING_RUNTIME=BLOCKED_BY_DATABASE`, `TELEGRAM_TEXT_SEND=BLOCKED_BY_DATABASE` e `TELEGRAM_TEXT_END_TO_END=BLOCKED_BY_DATABASE`. A mensagem técnica só aparece quando o especialista alcança `READY_TO_SEND`; a UI normal não é poluída.
- **Conteúdo e áudio:** YouTube, podcast, vídeo, áudio e documento podem ser registrados localmente em `LINK_REGISTERED`, `AWAITING_FILE` ou `IGNORED_FOR_ARTICLE`; nenhum download é executado. O contrato local de contribuição já separa original, referência de armazenamento, transcrição e material organizado, mas STT não foi implementado nem executado: `YOUTUBE_EXISTING_CONTENT=LOCAL_ONLY` e `AUDIO_CONTRACT_READINESS=IMPLEMENTED_NOT_SMOKED`.
- **Validação desta continuidade:** 30 testes direcionados R3/R4/R5/R6 passaram; ESLint direcionado, guardião visual e suíte visual 20/20 passaram. O build Next/Turbopack compilou e parou na checagem TypeScript por erros globais preexistentes em `lib/minerador/keyword-qualification.ts` e três regex TS1501 em `tests/agency-adalba-platform-internal.test.mts`. A suíte ampla Radar terminou em 109/111, mantendo os dois failures conhecidos de hidratação legada e resolução ESM do adapter de persistência. Não foram executadas chamadas DataForSEO, DeepSeek ou Telegram, migrations, escrita remota, criação de versão, commit, push ou deploy.
- **Ainda não verificado:** smoke autenticado do DeepSeek, ExpertBrief/binding/Telegram texto real, resposta recebida pelo webhook, readback remoto, Amazon real, STT/Storage, tema claro e handoff R6 para o Planejador. `REAL_DATAFORSEO_CALLS=0`, `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0`, `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO`, `PLANNER_GERAL_BLOCKERS=YES`.

## RADAR R7 — fila sequencial, evidência e isolamento de fixtures — 2026-08-26

- **Implementado localmente:** `lib/radar/r7-sequential.ts` formaliza a matriz de estado por área (`SERP`, `Amazon`, `Conteúdo`, `Especialista`, `Relatório`) e diferencia `DERIVED_FROM_REAL_DATA`, `PERSISTED`, `RECONSTRUCTIBLE`, `LOCAL_ONLY` e `FIXTURE`. Estado local de sessão não é apresentado como persistência ou readback remoto.
- **Implementado e confirmado por teste:** o contexto de `buildExpertTopicContext(articleId)` continua vinculado ao `articleId`, `brandId`, ArticleDNA/version, KeywordDNA, SiloDNA, snapshot/revisão SERP e referências aprovadas. Um fixture de artigo de marketing não recebe perguntas ou material médico da fixture do especialista.
- **Implementado e confirmado por teste:** `parseRadarR7TopicResponse` aceita o envelope canônico `topics` com 3–5 pautas, valida schema, duplicidade, perguntas conhecidas, origem, referência e relação da necessidade com ArticleDNA/SiloDNA/SERP/Amazon. Resposta truncada, inválida ou fora do escopo falha fechada.
- **Implementado:** falha de preparação DeepSeek preserva as pautas e a proveniência válidas que já estavam na sessão; apenas o estado do processamento muda para `FAILED_RETRYABLE`. A resposta válida nova continua como cópia de trabalho em `TOPICS_READY_FOR_REVIEW`.
- **Implementado:** o painel de contribuição médica só é renderizado quando `showLocalFixture` é explicitamente habilitado por teste. No fluxo real, a interface informa que a fixture está disponível apenas em modo de teste e não representa Telegram conectado.
- **Implementado e confirmado por teste:** o Dossiê Conteúdo separa `Solicitações`, `Perguntas`, `Contribuições` e `ExpertEvidence`, com origem/estado explícitos. Solicitação ou pauta local não vira evidência; contribuição remota não verificada permanece ausente.
- **Implementado e confirmado por teste:** o relatório cobre os cenários sem especialista, especialista pendente, `ExpertEvidence` revisada e Amazon pendente. `AMAZON_PENDING`/`AMAZON_APPLICABLE` não revisado bloqueia a aprovação. Ações locais são `gerar/atualizar → revisar → aprovar`; nenhuma delas cria versão ou aprovação remota.
- **Implementado e confirmado por teste:** aprovação local guarda um fingerprint das evidências usadas. Snapshot, referência, Amazon ou `ExpertEvidence` novos tornam o relatório `stale`, removem a aparência de aprovado e exigem nova geração/revisão; a evidência nova não entra silenciosamente em uma aprovação anterior.
- **Implementado localmente:** pipelines de fixture de texto e áudio mantêm Update → binding → brief → contribuição → Radar sem escrita remota. Original, transcrição e organização são camadas distintas; a faixa de origem `Áudio 2 · 00:41–01:13` chega à evidência local sem chamada STT/Storage.
- **Auditoria do Local Worker:** o código já cobre claim/lease, release, conclusão, retry com backoff e estados de falha; a migration local declara `heartbeat_at` e `original_asset_uri`. Não há readback remoto autorizado nesta continuidade, não há helper explícito de heartbeat e `insertTelegramContribution` ainda não comprova writeback `originalAssetUri → expert_contributions.original_asset_uri`; portanto `LOCAL_WORKER_READINESS=IMPLEMENTED_NOT_SMOKED` e não foi feita alteração estrutural.
- **Handoff:** a auditoria Radar → Planejador confirma que o pacote aceito pelo consumer atual representa ArticleDNA/SERP/análise/decisões, mas não Amazon/ExpertEvidence completos, fingerprint de aprovação ou as camadas locais de contribuição. `PLANNER_CONTRACT_AUDIT=STRUCTURAL_CHANGE_REQUIRED` e `PLANNER_ADAPTER=BLOCKED_BY_PLANNER_GERAL`; nenhum arquivo do Planejador foi alterado.
- **Fundação remota:** não foi repetida a leitura SQL recusada pelo guard. As seis tabelas Telegram, RLS, webhook, bot, worker remoto e readback continuam sem confirmação nesta tarefa: `TELEGRAM_REMOTE_FOUNDATION=BLOCKED_BY_DATABASE`, `REAL_TELEGRAM_CALLS=0` e `REMOTE_WRITES=0`.
- **DeepSeek:** a rota canônica server-side continua preparada para uma chamada única somente por ação explícita e Connection autorizada. Nenhuma chamada real foi executada: `DEEPSEEK_OUTPUT_VALIDATION=LOCAL_VALIDATED`, `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- **Validação automatizada desta continuidade:** 19 testes R7/R6/especialista passaram; ESLint do código Radar alterado e do teste R7 com `--no-ignore` passaram; guardião visual e suíte visual 20/20 passaram. A suíte ampla Radar ficou em 118/120, mantendo somente a fixture legada de hidratação (`fallbackHierarchyStrategy` sem `score/components`) e o import ESM sem extensão de `lib/editorial/contracts` no teste de persistência. `git diff --check` não encontrou erro de whitespace.
- **Validação visual autenticada:** em tema escuro, a sessão local confirmou estado vazio após reload, seleção do artigo real, quatro cards, Especialista sem conteúdo médico da fixture, relatório compacto/recolhido, planilha abaixo e `scrollWidth=clientWidth` no viewport disponível de 1920×897. O Workbench fechado mediu 331 px, aproximadamente 36,9% da altura útil nesse viewport; a validação anterior do R4.1 mediu aproximadamente 31,7% em 1440/1024 px. Tema claro, screenshot nos quatro breakpoints nesta continuidade e artigos reais em estágios diferentes continuam não verificados.
- **Limites preservados:** `DATABASE_CHANGE_REQUIRED=NO`, `PLANNER_GERAL_BLOCKERS=YES`, `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0`, `REAL_STT_CALLS=0`, `REMOTE_WRITES=0`; nenhuma migration, schema/RLS, chamada paga, commit, push ou deploy foi executado.

## Fase funcional 1 — Especialista / ExpertBrief — 2026-08-26

- **Implementado no código:** a área Especialista do Workbench e o detalhe
  canônico do artigo usam o painel real de ExpertBrief. O painel só é
  hidratado com artigo selecionado e contexto `ArticleDNA` correspondente;
  seleção de artigo continua trocando o Workbench inteiro sem compartilhar
  estado com outra linha da planilha.
- **Implementado no código:** `GET /api/editorial/expert-briefs` lista
  somente `brand_experts.status = active`, retorna apenas o estado resumido do
  binding e filtra briefs pela combinação exata de Marca, artigo, versão e
  especialista. IDs técnicos ficam no bloco recolhido de proveniência.
- **Implementado no código:** `POST` cria `expert_briefs` em `draft` e `PATCH`
  atualiza o `briefId` existente. Ambos fazem leitura de confirmação após a
  escrita e só retornam `remote_readback_confirmed` quando o registro lido
  ainda corresponde ao contexto solicitado. Repetição de salvamento usa PATCH
  e não cria nova pauta.
- **Implementado no código:** necessidades, `LACUNAS OBSERVADAS`, perguntas
  editáveis, adição, remoção, reordenação, criação de pauta, salvamento,
  revisão humana e seleção do histórico estão separados. Sugestões DeepSeek
  permanecem uma ação explícita e cópia de trabalho; não existe aprovação
  automática.
- **Limite de transporte:** o salvamento não emite Telegram, não cria token de
  seleção e não chama provider. Binding configurado/não vinculado é apenas
  informação; contribuição recebida e `ExpertEvidence` continuam ausentes até
  seus caminhos canônicos. A fixture médica não é renderizada na rota real do
  artigo.
- **Arquivos principais desta fase:**
  `app/api/editorial/expert-briefs/route.ts`,
  `lib/server/telegram/persistence.ts`,
  `lib/server/expert-contribution-contracts.ts`,
  `lib/radar/expert-brief.ts`,
  `modules/radar/radar-expert-brief-panel.tsx`,
  `modules/radar/radar-r3-specialist-panel.tsx`,
  `modules/radar/radar-r3-workbench.tsx`,
  `modules/radar/radar-page.tsx` e
  `modules/radar/radar-analysis-page.tsx`.
- **Validação automatizada:** 54 testes direcionados Radar/ExpertBrief/R6/R7
  passaram; a suíte visual passou 20/20; o guardião visual passou; ESLint
  direcionado passou; `git diff --check` não encontrou erro de whitespace. A
  suíte ampla Radar passou 132/134, mantendo somente a fixture legada de
  hidratação (`fallbackHierarchyStrategy` sem `score/components`) e o import
  ESM sem extensão de `lib/editorial/contracts` no teste de persistência.
  O build Next/Turbopack compilou o código e parou apenas na checagem
  TypeScript pelos erros globais já conhecidos em
  `lib/minerador/keyword-qualification.ts` e nas três regex TS1501 de
  `tests/agency-adalba-platform-internal.test.mts`.
- **Não verificado remotamente:** não houve smoke autenticado Care Glow,
  escrita/readback/reload em Supabase, teste negativo cross-tenant, chamada
  DeepSeek, Telegram, DataForSEO, áudio, STT ou Storage nesta continuidade.
  Portanto `READY_FOR_RADAR_EXPERTBRIEF_FLOW=NO`,
  `EXPERTBRIEF_REMOTE_READBACK=IMPLEMENTED_NOT_SMOKED`,
  `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0` e `REMOTE_WRITES=0`.
- **Validação visual desta fase:** o servidor local respondeu e o navegador
  alcançou a tela de login, mas não havia sessão autenticada/marca disponível
  para abrir um artigo real. Assim, o painel ExpertBrief, o readback visual e
  o screenshot autenticado continuam pendentes; a validação disponível nesta
  continuidade é automatizada/estática e o guardião visual.
- **Limites preservados:** nenhuma migration, schema/RLS, contrato do
  Planejador, Arquiteto, Minerador, ArticleDNA, SiloDNA, provider ou deploy foi
  alterado/executado. Os erros globais de TypeScript conhecidos permanecem
  fora do escopo Radar.

## Fase funcional 1B — Smoke remoto ExpertBrief — 2026-08-26

- **Correção Radar aplicada antes da leitura remota:** o Workbench estava
  enviando a identidade do item operacional (`row.id`) ao construtor de
  contexto. O fluxo canônico exige `row.articleId`; a troca foi localizada em
  `modules/radar/radar-page.tsx` e recebeu regressão em
  `tests/radar-expert-brief.test.mts`. Nenhum contrato, schema ou dado remoto
  foi alterado.
- **Sessão e contexto:** `AUTHENTICATED_SESSION=PASS` na sessão Chrome já
  autenticada da Care Glow. A tela exibiu o artigo
  `articleId=group-11aenvf`, `ArticleDNA v2`,
  `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4` e
  `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`. O painel ExpertBrief deixou
  de ficar bloqueado por hidratação e fez a leitura contextual normal.
- **Leitura remota de especialistas:** `EXPERT_LIST_REMOTE=PASS_EMPTY`.
  A resposta exibida pela interface foi “Nenhum especialista cadastrado nesta
  Marca”. Não havia especialista ativo utilizável para selecionar; nenhum
  especialista de smoke foi criado.
- **Smoke interrompido por pré-condição:**
  `EXPERTBRIEF_REMOTE_CREATE=NOT_ATTEMPTED_PREREQUISITE`,
  `EXPERTBRIEF_REMOTE_READBACK=NOT_ATTEMPTED`,
  `EXPERTBRIEF_REMOTE_RELOAD=NOT_ATTEMPTED`,
  `EXPERTBRIEF_REMOTE_UPDATE=NOT_ATTEMPTED` e
  `EXPERTBRIEF_IDEMPOTENCE=NOT_ATTEMPTED`. Não houve binding selecionável,
  múltiplas pautas ou teste cross-tenant nesta etapa.
- **Gate e efeitos externos:** `READY_FOR_RADAR_EXPERTBRIEF_FLOW=NO`,
  `DATABASE_CHANGE_REQUIRED=NO`, `EXPERT_EVIDENCE_CREATED=NO`,
  `REMOTE_WRITES=0`, `REAL_DATAFORSEO_CALLS=0`, `REAL_DEEPSEEK_CALLS=0`,
  `REAL_TELEGRAM_CALLS=0` e `REAL_GOOGLE_CLOUD_CALLS=0`. O bloqueio é de
  cadastro/seleção do especialista na marca, não de schema observado; não foi
  contornado por banco, fixture ou provider.
- **Validação visual/manual:** o estado autenticado foi conferido em tema
  escuro a 1920×897, com artigo selecionado, quatro áreas do Workbench,
  Especialista expandido, mensagem de lista vazia, necessidades/lacunas e
  ausência de overflow horizontal (`scrollWidth=clientWidth`). Screenshot,
  Workbench recolhido e planilha dominante foram validados nesse estado; o
  screenshot do fluxo completo com especialista/pauta, criação, readback e
  reload do registro real continuam pendentes até existir especialista ativo e
  autorização para a gravação remota.

## Fase funcional real — ExpertBrief → Telegram → contribuição → áudio — 2026-08-26

- **Implementado no código:** o fluxo Radar-only agora cobre o caminho
  `ExpertBrief → binding explícito → envio Telegram → inbound por brief →
  ExpertContribution`. A criação/salvamento continua sem provider automático;
  o envio usa a ação explícita `Enviar ao especialista`, claim antes do
  provider, readback após o envio e retry idempotente quando o brief já está
  confirmado como enviado.
- **Implementado no código:** o webhook resolve a contribuição por binding,
  `selected_brief_id` e brief enviado. Não usa telefone, “última pauta” ou
  fallback de Marca. Update, contribuição original, estado
  `awaiting_review` e job de mídia preservam `brandId`, `expertId`, `briefId` e
  `contributionId` com filtros exatos.
- **Implementado no código:** o Dossiê separa solicitação, contribuição
  recebida, original, transcrição e organização. `ExpertEvidence` é uma
  projeção do conteúdo remoto mais decisão humana local; revisão pendente ou
  conteúdo ilegível não é promovido. A revisão oferece decisão, classificação
  e relação com necessidade sem criar tabela nova. O relatório de detalhe
  mostra ExpertEvidence de forma compacta e o handoff v2 recebe somente
  evidências já revisadas.
- **Implementado no código:** a cadeia do worker local cobre preservação do
  asset original em `expert_contributions.original_asset_uri`, follow-up de
  voz/áudio, Speech-to-Text longo server-side e organização estruturada via
  DeepSeek canônico. Original, `transcript_text` e `organization_payload` são
  writebacks separados; a organização recebe `humanDecisionRequired=true` e
  nunca substitui a transcrição bruta. `npm run local-worker:once` executa
  somente um ciclo quando `LOCAL_WORKER_RUN=1` e
  `LOCAL_WORKER_ACTOR_USER_ID` estão configurados.
- **Implementado no código:** o detalhe reconsulta o ExpertBrief remoto por
  artigo/versão, bloqueia aprovação/handoff diante de erro, pendência ou
  conteúdo não legível e compara o conjunto atual com o handoff aprovado.
  Nova contribuição ou novo conteúdo na mesma contribuição reabre a revisão;
  não mantém `APPROVED` silenciosamente.
- **Classificação desta continuidade:**
  `EXPERTBRIEF_REMOTE=IMPLEMENTED_NOT_SMOKED`;
  `DEEPSEEK_TOPIC_REAL=IMPLEMENTED_NOT_SMOKED`;
  `TELEGRAM_BINDING_REAL=IMPLEMENTED_NOT_SMOKED`;
  `TELEGRAM_OUTBOUND_TEXT=IMPLEMENTED_NOT_SMOKED`;
  `TELEGRAM_INBOUND_TEXT=IMPLEMENTED_NOT_SMOKED`;
  `EXPERT_CONTRIBUTION_REMOTE=IMPLEMENTED_NOT_SMOKED`;
  `EXPERT_EVIDENCE_REAL=IMPLEMENTED_NOT_SMOKED`;
  `LOCAL_WORKER=IMPLEMENTED_NOT_SMOKED`;
  `GCS=IMPLEMENTED_NOT_SMOKED`; `SPEECH_TO_TEXT=IMPLEMENTED_NOT_SMOKED`;
  `DEEPSEEK_ORGANIZATION=IMPLEMENTED_NOT_SMOKED`.
- **Remote/manual:** não houve chamada de provider, envio Telegram, escrita
  remota ou execução do worker nesta continuidade. O último smoke autenticado
  conhecido retornou `EXPERT_LIST_REMOTE=PASS_EMPTY` para Care Glow; sem
  especialista ativo não foi possível avançar para criação de pauta, binding,
  resposta humana, áudio ou handoff real. `MANUAL_TELEGRAM_ACTION_REQUIRED`
  ainda não foi alcançado.
- **Validação automatizada:** 40 testes focados Radar/Telegram/worker/R6/R7
  passaram; a suíte ampla Radar passou 141/143, mantendo somente a fixture
  legada de hidratação (`fallbackHierarchyStrategy` sem `score/components`) e
  o import ESM sem extensão de `lib/editorial/contracts` no teste de
  persistência. A suíte visual passou 20/20, o guardião visual passou, ESLint
  dos arquivos de código alterados passou e `git diff --check` passou.
  TypeScript global continua falhando somente em
  `lib/minerador/keyword-qualification.ts` e nas três regex TS1501 de
  `tests/agency-adalba-platform-internal.test.mts`; nenhum erro novo do Radar
  foi encontrado. O build Next/Turbopack foi bloqueado antes da compilação
  final pela indisponibilidade de rede para baixar Geist/Geist Mono em
  `fonts.googleapis.com`.
- **Limites:** `DATABASE_CHANGE_REQUIRED=NO`; nenhuma migration, schema/RLS,
  contrato do Planejador, Arquiteto, Minerador, provider, commit, push ou
  deploy foi executado. Validação visual autenticada clara/escura do fluxo
  completo, persistência/readback real e isolamento cross-tenant continuam
  pendentes.

## Regressão funcional — identidade do Radar e SERP real — 2026-08-26

- **Correção implementada:** o resolver server-side agora aceita o UUID
  canônico da linha de workflow e o alias local legado `radar:<articleId>`
  somente quando marca, artigo, versão do ArticleDNA e envelope de
  transferência coincidem. Um workflow de outra marca, artigo ou versão
  continua bloqueado com a mensagem canônica de conflito.
- **Correção implementada:** `modules/radar/radar-page.tsx` mantém `row.id`
  apenas para seleção, foco e transições que ainda recebem a identidade
  técnica da linha. SERP, fila sequencial, snapshots R4, estado local,
  especialista, tópicos, relatório e callbacks editoriais usam o
  `row.articleId` canônico; a coleta transporta o `articleDnaVersionId` do
  artigo selecionado.
- **Teste automatizado:** 58 testes direcionados Radar/R3/R4/R5/R6/R7 e
  envelope de resolução passaram. A regressão cobre `row.id != row.articleId`,
  os dois formatos compatíveis de identidade do workflow, rejeição de item
  divergente e ausência de provider durante render/hidratação.
- **Validação local:** ESLint direto nos arquivos alterados passou com
  avisos preexistentes; `check:visual-system` passou; `git diff --check`
  passou. `tsc --noEmit` continua bloqueado somente pelos quatro erros globais
  conhecidos em `lib/minerador/keyword-qualification.ts` e nas três regex
  TS1501 de `tests/agency-adalba-platform-internal.test.mts`; nenhum erro novo
  do Radar foi encontrado.
- **Sessão reproduzida:** Care Glow autenticada, `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`,
  `articleId=group-11aenvf`, `focusedArticleId=radar:group-11aenvf`,
  `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4` e ArticleDNA v2.
  A notificação era um falso conflito da representação técnica versus
  editorial; a guarda para divergência real foi preservada.
- **Ainda pendente:** a única chamada real DataForSEO, INSERT/readback do
  snapshot, reload completo sem nova chamada, histórico e revisão humana
  exigem smoke autenticado controlado e confirmação imediatamente antes da
  ação. Nesta correção `REAL_DATAFORSEO_CALLS=0`, `SERPER_CALLS=0`,
  `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO` e `MIGRATIONS_CREATED=0`.
  O ExpertBrief não foi retomado nesta continuidade.

## Correção funcional imediata — SERP unificada no Workbench — 2026-08-26

- **Implementado:** a expansão SERP do Workbench R3 passou a concentrar o
  fluxo normal completo: coleta compacta, seleção/classificação dos resultados
  orgânicos, análise das páginas selecionadas, revisão humana, aprovação e
  histórico. O botão `Curadoria detalhada` foi removido dessa experiência;
  a rota antiga e seus aliases continuam disponíveis para deep link, histórico,
  diagnóstico e etapas editoriais adjacentes.
- **Fonte única da curadoria:** `RadarAnalysisVersion.payload.serpDecisions`
  continua sendo o estado canônico. A decisão histórica `organic:<position>`
  foi preservada para compatibilidade, mas toda projeção é ligada ao snapshot
  atual por `snapshotId`, versão e hash; a chave de renderização também inclui
  URL e não depende do índice visual da lista. Análise, revisão e aprovação
  consomem a mesma seleção.
- **Persistência:** iniciar a curadoria e cada decisão humana criam uma
  sucessora da análise existente e passam por `saveRadarAnalysis`; o caminho
  remoto exige readback do artigo, versão e snapshot correspondentes. O
  fallback local atualiza a cópia de trabalho e a recuperação do navegador,
  mas nunca é apresentado como sucesso remoto. A revisão SERP reutiliza o
  endpoint/repositório existente, com confirmação do registro retornado e
  readback das revisões.
- **Análise e revisão:** a extração usa somente concorrentes/referências
  selecionados; PAA, relacionadas e Knowledge Graph ficam como evidência
  complementar recolhível. A revisão mostra concorrentes selecionados,
  referências aprovadas, necessidades, lacunas e conflitos antes da aprovação.
  A aprovação fica bloqueada sem snapshot real, análise compatível ou decisões
  orgânicas pendentes resolvidas; os complementares são contexto somente
  leitura e não bloqueiam a aprovação da SERP. Nenhum sucesso remoto é emitido
  antes de write/readback confirmados.
- **Auditoria da curadoria legada:** nenhuma operação necessária ao fluxo SERP
  normal depende mais de `radar-analysis-page.tsx`. A página antiga preserva o
  relatório detalhado, sinais de evidência adicionais, ExpertBrief/handoff,
  histórico e compatibilidade de rotas; essas superfícies não substituem a
  seleção, análise ou revisão inline.
- **Matriz de integração auditada:**

  | Função | Componente/handler | Estado | Persistência | Workbench normal |
  |---|---|---|---|---|
  | Resultados orgânicos | `RadarR3SerpPanel` / `RadarSerpView` | snapshot atual | leitura do workspace | Sim |
  | Seleção, exclusão e classificação | `persistSerpDecision` | `serpDecisions` da análise | `saveRadarAnalysis` + readback | Sim |
  | Análise de páginas | `analyzeSerpSelection` / extract existente | sucessora da análise | endpoint de extração + análise/readback | Sim |
  | Revisão e aprovação SERP | `reviewSerpForArticle` / `pipeline.reviewSerp` | `serpReviews` | `/api/editorial/serp` + repository/readback | Sim |
  | Histórico | `RadarR3SerpPanel` e rota legada | `records` do artigo | workspace remoto ou recuperação local | Sim |
  | Relatório detalhado, ExpertBrief e handoff | `radar-analysis-page.tsx` | etapa adjacente/compatibilidade | contratos existentes | Não necessário para SERP |

- **Validação automatizada desta continuidade:** 63 testes direcionados
  Radar/R3/R4/R5/R6/R7, envelope, contratos DataForSEO e Workbench passaram;
  ESLint dos arquivos alterados passou com avisos preexistentes, o guardião
  visual passou e `git diff --check` não encontrou erro de whitespace.
  `tsc --noEmit` permanece bloqueado pelos quatro erros globais conhecidos em
  `lib/minerador/keyword-qualification.ts` e nas três regex TS1501 de
  `tests/agency-adalba-platform-internal.test.mts`; nenhum erro novo do Radar
  foi encontrado.
- **Gates desta tarefa:**
  `SERP_SAME_PAGE_FLOW=IMPLEMENTED_LOCAL`;
  `COMPETITOR_SELECTION=IMPLEMENTED_TESTED`;
  `ANALYSIS_USES_SELECTED_COMPETITORS=IMPLEMENTED_TESTED`;
  `HUMAN_REVIEW=IMPLEMENTED_TESTED`;
  `APPROVED_REVIEW_MATCHES_SELECTION=IMPLEMENTED_TESTED`;
  `SERP_APPROVAL_REMOTE_WRITE=IMPLEMENTED_NOT_SMOKED`;
  `SERP_APPROVAL_READBACK=IMPLEMENTED_NOT_SMOKED`;
  `COMPETITOR_SELECTION_RELOAD=NOT_VERIFIED`;
  `CURATION_PARITY=PASS_FOR_NORMAL_SERP_FLOW` e
  `CURATION_DETAIL_BUTTON_REQUIRED=NO`.
- **Remote/manual:** snapshot real, write/readback/reload/aprovação autenticados
  não foram executados nesta continuidade porque a sessão atual não exibiu
  um snapshot SERP disponível e não houve autorização para chamar DataForSEO.
  `REAL_DATAFORSEO_CALLS=0`, `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO`
  e `MIGRATIONS_CREATED=0`. A validação remota de seleção pós-F5 e aprovação
  permanece pendente.

## Gate real — correção de readback da curadoria — 2026-08-26

- **Correção implementada:** `WorkflowRepository.appendRadarAnalysis` agora
  normaliza `created_at`/`updated_at` para ISO antes de validar o `RadarItem`.
  O erro anterior de `Invalid ISO datetime` deixava a API incapaz de aceitar
  a análise apesar de o fluxo local estar correto.
- **Correção implementada:**
  `GET /api/editorial/radar-analysis` oferece readback autenticado e estreito
  por `brandId`, `articleId` e, opcionalmente, `versionId`. A resposta separa
  o `radarItemId` canônico (`row.id`/UUID do workflow) do
  `payloadRadarItemId` lógico (`radar:<articleId>`), preservando a distinção
  entre identidade técnica e editorial.
- **Correção implementada:** o POST retorna a identidade da linha criada;
  o cliente compara versão, marca, artigo, ArticleDNA, snapshot, hash,
  decisões orgânicas e seleção antes de declarar readback confirmado. Após
  reload, o hook `useRadarAnalysisReadback` reidrata as análises por artigo
  sem coletar SERP e atualiza o `row.id` canônico quando a linha remota está
  disponível.
- **Validação automatizada:** 63 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, Workbench e DataForSEO passaram. `check:visual-system` passou;
  `git diff --check` não encontrou erro de whitespace. ESLint dos arquivos
  Radar alterados não apresentou erro; permanece apenas o aviso preexistente
  de `handleExpertEvidenceChange` não utilizado em `radar-page.tsx`.
  `tsc --noEmit` continua bloqueado somente por
  `lib/minerador/keyword-qualification.ts` e três regex TS1501 em
  `tests/agency-adalba-platform-internal.test.mts`.
- **Sessão manual:** Care Glow autenticada, `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`,
  `articleId=group-11aenvf`, ArticleDNA v2,
  `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4`, snapshot real
  DataForSEO v3 com 8 resultados. O reload não disparou coleta; a curadoria
  persistida/localmente recuperável reapareceu com 8 decisões pendentes.
- **Gate remoto ainda não homologado:** uma tentativa anterior de iniciar a
  curadoria recebeu resposta de gravação, mas terminou sem readback remoto
  confirmado antes desta correção; não foram feitas novas decisões, aprovação
  ou atualização DataForSEO. Portanto:
  `COMPETITOR_SELECTION_REMOTE_WRITE=ATTEMPTED_UNCONFIRMED`;
  `COMPETITOR_SELECTION_REMOTE_READBACK=NOT_VERIFIED`;
  `REAL_DATAFORSEO_CALLS=0`; `SERPER_CALLS=0`;
  `REMOTE_WRITES=1_ATTEMPTED_UNCONFIRMED`;
  `RADAR_SERP_OPERATIONAL=NOT_HOMOLOGATED`.
- **Limite externo:** a seleção A/B/C, aprovação, atualização única do
  snapshot, screenshots do fluxo completo e retomada do ExpertBrief/Telegram
  exigem confirmação imediata para novas ações remotas; não houve migration,
  schema/RLS, contrato compartilhado, commit, push ou deploy.

## Bug prioritário — estabilidade da seleção SERP — 2026-08-26

- **Auditoria concluída:** no Workbench, a caixa de seleção e o contador/ação
  não liam exatamente o mesmo caminho. A caixa consultava
  `model.references`, enquanto a contagem e `Analisar selecionadas` usavam os
  selectors de `serp-curation.ts`. A seleção agora é projetada uma única vez
  por resultado em `buildRadarSerpSelectionProjection`; a projeção também
  deriva o papel editorial, a seleção e as chaves elegíveis.
- **Mapa de fontes:**
  `UI_SELECTION_SOURCE=buildRadarSerpSelectionProjection(...).rows[].selected`;
  `ACTION_ENABLE_SOURCE=radarAnalysisCandidates(...)`, derivado da mesma
  projeção, combinado somente com `onAnalyzeSelected`, ação em andamento e
  revisão. `persistSerpDecision`, contagem, análise, revisão e aprovação
  recebem o mesmo escopo explícito de marca, artigo e ArticleDNA, além do
  snapshot compatível, sem misturar estados de outra linha.
- **Identidade e escopo:** a decisão persistida histórica
  `organic:<position>` foi preservada por compatibilidade. A projeção só é
  compatível com o snapshot atual; o React key inclui `snapshotId`, posição e
  URL. O Workbench só recebe a análise depois de conferir `brandId`,
  `articleId`, `articleDnaVersionId`, snapshot, versão e hash.
- **Readback stale:** `lib/radar/analysis-readback.ts` adiciona revisão de
  request, contador de writes em andamento e fingerprint de `row.id`,
  `brandId`, `articleId`, `articleDnaVersionId`, `lockVersion`, snapshot
  (id/versão/hash) e versões da análise. Hidratação antiga não pode
  sobrescrever uma escrita/interação posterior; `lockVersion` remoto também
  não regride o estado local. A hidratação é rearmada apenas quando muda a
  marca/snapshot, artigo ou versão do ArticleDNA, não a cada render.
- **Mutabilidade/memoização:** a projeção é pura; `Map`, `Set` e arrays usados
  pela seleção são novas referências ou somente leitura. O estado de
  sincronização fica restrito a `useRef`; não há `React.memo` ou selector
  memoizado mantendo uma seleção antiga. As dependências do callback incluem
  o workspace que fornece a identidade e a chave de hidratação inclui a
  unidade canônica do artigo.
- **Testes automatizados:** 69 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, DataForSEO, Workbench e readback passaram. Foram incluídos testes
  de igualdade entre seleção visível/canônica/eligibility, classificação de
  formato, imutabilidade em dez ciclos, troca de artigo/snapshot, requests
  concorrentes e readback obsoleto.
- **Validação local:** ESLint dos arquivos de implementação passou sem erro
  (permanece o aviso preexistente de `handleExpertEvidenceChange`; arquivos
  `.mts` são ignorados pela configuração). `check:visual-system` passou e
  `git diff --check` passou. `tsc --noEmit` continua bloqueado somente por
  `lib/minerador/keyword-qualification.ts` e pelas três regex TS1501 em
  `tests/agency-adalba-platform-internal.test.mts`.
- **Browser/remote:** a reprodução autenticada de dez ciclos não foi
  executada nesta correção, pois cada decisão do Workbench chama write/readback
  remoto e o gate do anexo determina interromper o smoke enquanto a
  estabilidade não estiver homologada. Não houve DataForSEO, Serper ou nova
  escrita remota nesta tarefa.
- **Relatório do gate:**
  `SERP_SELECTION_BUG_REPRODUCED=REPORTED_CODE_PATH_DIVERGENCE; BROWSER_NOT_REPRODUCED`;
  `VISIBLE_SELECTED_COUNT=2` e `CANONICAL_SELECTED_COUNT=2` na fixture;
  `ACTION_ENABLE_SYNC=PASS_LOCAL_TESTS`;
  `TEN_CYCLE_BROWSER_TEST=NOT_EXECUTED`;
  `NO_RESTART_REQUIRED=PASS_FOR_LOCAL_STATE_GUARD`;
  `SERP_SELECTION_STABILITY=IMPLEMENTED_AND_LOCALLY_TESTED; BROWSER_NOT_VERIFIED`;
  `READY_TO_RESUME_REMOTE_SMOKE=NO`.

## Correção urgente — foco da linha versus seleção coletiva — 2026-08-27

- **Contrato canônico implementado:** `focusedArticleId` representa somente o
  `articleId` do artigo aberto no Workbench; `selectedArticleIds` representa
  somente os artigos marcados para operações em lote. O `OperationalDataGrid`
  mantém seu estado interno de checkbox como `bulkSelected` por `row.id` e o
  Radar converte esse retorno para `articleId`, sem unificar os estados.
- **Clique isolado:** a linha normal chama apenas o foco contextual; checkbox
  de linha e checkbox do cabeçalho interrompem `pointerdown`/`click` antes do
  handler da linha e alteram somente a seleção coletiva. O chevron também
  interrompe propagação e conserva sua expansão explícita, sem alternar o
  checkbox.
- **Contexto correto:** o Workbench é resolvido por `focusedArticleId` e
  transformado no `row.id` técnico apenas para destacar a linha correta. A
  Bulk Bar continua recebendo exclusivamente as linhas entregues pelo estado
  de checkbox do grid. Navegação adjacente, fila e revisão individual também
  passam a gravar o `articleId` canônico.
- **Visual:** o foco não usa mais a superfície forte `bg-selected` no Radar;
  usa borda lateral contextual, superfície discreta e o rótulo pequeno
  `Em foco`. A seleção em lote usa o checkbox e uma superfície complementar
  semântica `positive-soft`. Os consumidores anteriores do grid preservam os
  defaults por compatibilidade.
- **Testes automatizados:** 69 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, DataForSEO, Workbench e readback passaram, incluindo asserções
  estáticas para identidades distintas, propagação, classes de estado e
  dependências separadas. ESLint dos dois arquivos de implementação passou
  sem erro; permanece o aviso preexistente de
  `handleExpertEvidenceChange` não utilizado.
- **Validação local:** `pnpm run check:visual-system` passou no conjunto
  oficial de quatro arquivos; `git diff --check` passou. A varredura direta
  de `radar-page.tsx` ainda encontra classes não semânticas preexistentes nas
  áreas legadas de análise/revisão (linhas 681 e 688), não introduzidas por
  esta correção. `tsc --noEmit` continua bloqueado pelos quatro erros globais
  já conhecidos: `lib/minerador/keyword-qualification.ts` e três regex TS1501
  em `tests/agency-adalba-platform-internal.test.mts`.
- **Browser:** não foi possível executar os seis cenários físicos nesta
  continuidade porque não há conector de navegador/Chrome disponível no
  ambiente atual. Portanto, propagação real, centro visual do checkbox, área
  vazia, chevron e ausência de restart permanecem `NOT_VERIFIED` no navegador.
- **Remoto:** a correção não chama provider, não grava SERP, não usa
  ExpertBrief/Telegram e não altera schema, RLS, migration ou persistência
  remota. Não houve DataForSEO, Serper, escrita remota, commit, push ou deploy.
- **Aceite local:**
  `ROW_CLICK_FOCUSES_ARTICLE=PASS_LOCAL_STATIC`;
  `CHECKBOX_CLICK_SELECTS_BULK=PASS_LOCAL_STATIC`;
  `CHECKBOX_DOES_NOT_TRIGGER_ROW=PASS_LOCAL_STATIC`;
  `ROW_DOES_NOT_TOGGLE_CHECKBOX=PASS_LOCAL_STATIC`;
  `FOCUSED_ARTICLE_INDEPENDENT_FROM_BULK=PASS_LOCAL_STATIC`;
  `WORKBENCH_USES_FOCUS=PASS_LOCAL_STATIC`;
  `BULK_BAR_USES_CHECKBOX_SELECTION=PASS_LOCAL_STATIC`;
  `FOCUS_VISUAL_NOT_CONFUSED_WITH_BULK_SELECTION=PASS_LOCAL_STATIC`;
  `NO_RESTART_REQUIRED=IMPLEMENTED_LOCAL; BROWSER_NOT_VERIFIED`.

## Correção do modelo de seleção da planilha — 2026-08-27

- **Implementado:** o estado local canônico do Radar agora acopla
  `selectedArticleIds[]` e `activeArticleId`: qualquer artigo aberto no
  Workbench está marcado e qualquer conjunto de checks mantém um artigo ativo.
  Checkbox e clique normal de linha selecionam e ativam o mesmo `articleId`;
  a multiseleção preserva todos os checks e muda apenas o contexto ativo.
- **Transições:** desmarcar uma linha não ativa conserva o Workbench; desmarcar
  a ativa escolhe a última seleção restante; desmarcar a última esvazia o
  Workbench. Marcar o cabeçalho seleciona as linhas visíveis com ativo
  determinístico e desmarcá-lo limpa todo o conjunto. O chevron continua
  restrito à expansão de perfil.
- **Limites preservados:** a correção é front-first e local: não alterou SERP,
  curadoria, DataForSEO, ExpertBrief, Telegram, schema, RLS, migration ou
  contratos remotos. Não cria versão e não faz chamada externa.
- **Testado localmente:** 74 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, DataForSEO, Workbench, readback e seleção da planilha passaram.
  O teste novo cobre checkbox/linha, multiseleção, cabeçalho, fallback ao
  desmarcar o ativo, limpeza final e rejeição dos estados impossíveis.
  ESLint passou sem erro (permanece o aviso preexistente de
  `handleExpertEvidenceChange`), `check:visual-system` oficial passou e
  `git diff --check` passou. `tsc --noEmit` continua bloqueado somente por
  `lib/minerador/keyword-qualification.ts` e pelas três regex TS1501 em
  `tests/agency-adalba-platform-internal.test.mts`.
- **Validação visual:** a mudança reutiliza tokens semânticos e o guardião
  oficial aprovou. O script auxiliar referido pela skill visual não existe no
  checkout; portanto não há uma segunda varredura específica a declarar.
- **Ainda a validar:** a homologação autenticada dos sete passos da planilha
  permanece pendente: o navegador disponível não tem aba/sessão autenticada e
  não há servidor local em escuta. Não foi iniciado ou reiniciado servidor,
  nem foi acionado provider.

## SERP — subnavegação contextual do processo — 2026-08-27

- **Implementado:** a expansão SERP agora concentra Coleta, Concorrentes,
  Análise, Evidências, Revisão e Histórico em subabas contextuais locais. A
  seleção e a análise continuam vinculadas ao snapshot/artigo atual; trocar
  artigo remonta o painel com a etapa sugerida para o novo contexto.
- **Limites preservados:** nenhuma subaba cria rota, versão, persistência,
  chamada DataForSEO ou aprovação automática. Ações de coleta, análise e
  revisão preservam seus handlers explícitos; Anterior/Próxima pendente foram
  rebaixados para Revisão.
- **Evidências:** a visão separa SerpEvidence, ExternalEvidence,
  ExpertEvidence e ProductEvidence sem criar schema, inferir URL como
  evidência ou persistir ExternalEvidence.
- **Testado localmente:** 69 testes direcionados Radar/R3/R4/R5/R6/R7,
  DataForSEO, curadoria, Workbench, fila e subnavegação passaram. A nova
  cobertura valida as seis subabas, status compacto, nextSerpStep, estado de
  análise reaberta, ausência de rota/provider pela navegação e permanência da
  aprovação na Revisão. ESLint passou sem erros, check:visual-system e
  git diff --check passaram.
- **TypeScript:** tsc --noEmit permanece bloqueado por problemas globais fora
  desta frente: lib/minerador/keyword-qualification.ts, três regex TS1501 em
  tests/agency-adalba-platform-internal.test.mts e o import ausente já
  presente em modules/planejador/index.ts.
- **Pendente:** validação autenticada dos doze passos de navegação SERP e
  confirmação visual responsiva. Não há servidor local em escuta nem aba/sessão
  autenticada disponível; nenhum processo foi iniciado ou reiniciado e não
  houve chamada de provider nesta tarefa.

## Homologação autenticada da curadoria SERP — 2026-08-27

- **Validado manualmente no navegador autenticado:** no artigo `Cobrir com
  clareza o tema “marketing online”.`, as quatro decisões pendentes foram
  concluídas com motivo específico baseado em título, domínio, formato e
  intenção observados: posições 6 (FGV), 8 (Programa Avançar), 9 (Mundo do
  Marketing) e 10 (Quero Bolsa) ficaram como `Ignorado`. A tela passou a
  mostrar 4 concorrentes selecionados e 0 pendências, inclusive após F5.
- **Curadoria e análise:** o produto informou write e readback na alteração de
  cada decisão; após a análise explícita, o painel registrou 4 referências
  selecionadas/analisadas, 2 necessidades, 2 lacunas e 2 conflitos. A
  navegação de Coleta, Concorrentes, Análise, Evidências, Revisão e Histórico
  foi conferida no mesmo contexto do artigo. Isso confirma a preservação
  visual da seleção e que a análise usa a amostra humana; não substitui uma
  leitura independente do banco.
- **Aprovação — bloqueio real:** a ação `Aprovar SERP` respondeu com write e
  readback confirmados e o Histórico reidratado mostra `Revisão atual:
  approved`. Contudo, após F5 a subaba Revisão mostra `Aprovação local não
  confirmada`, pois o cliente está em `serpPersistenceMode=local_fallback`.
  Portanto, a aprovação remota não pode ser declarada confirmada por este
  smoke; não foi repetida uma escrita append-only apenas para mascarar o gate.
- **Diagnóstico no código:** o carregamento operacional só marca o conjunto
  como `server` quando snapshot e reviews remotos estão simultaneamente
  disponíveis. A recuperação local conserva a revisão para continuidade, mas
  não pode provar a leitura remota. A extensão do navegador bloqueou a
  navegação direta ao endpoint JSON (`ERR_BLOCKED_BY_CLIENT`) e não expõe o
  resultado da requisição interna; não houve leitura de cookies, bypass de
  autenticação, SQL, schema, migration ou RLS.
- **Gates deste smoke:** `HUMAN_CURATION_DELEGATED=YES`;
  `PENDING_RESULTS_REVIEWED=4`;
  `COMPETITOR_SELECTION_RELOAD=PASS_VISIBLE`;
  `CURATION_CHANGE_REOPENS_ANALYSIS=PASS`;
  `ANALYSIS_USES_SELECTED_COMPETITORS=PASS`;
  `SERP_APPROVAL_RELOAD=FAIL_REMOTE_CONFIRMATION`;
  `RADAR_SERP_OPERATIONAL=BLOCKED`;
  `REAL_DATAFORSEO_CALLS=0`; `SERPER_CALLS=0`.
- **Limite:** ExternalEvidence e a atualização única DataForSEO permanecem
  bloqueadas até uma confirmação remota verdadeira da aprovação após reload.
- **Regressão local desta continuidade:** 63 testes direcionados Radar/R3/R4/
  R5/R6/R7, curadoria, DataForSEO, Workbench, fila, subnavegação e readback
  passaram. ESLint direcionado, `check:visual-system` e `git diff --check`
  passaram; o checkout preexistente e suas alterações não relacionadas foram
  preservados.


## Descarte administrativo executado — 2026-09-08

Proprietário da operação: Arquiteto; participação do Radar explicitamente autorizada.
Projeto hjjlntdpdgvpnazdztqw; marca Care Glow (09762023-d0d4-4c24-b34e-d0fdfd43f891).
Descarte definitivo de testes autorizado pelo usuário, com backup dispensado.
Executado via Supabase CLI 2.111.0, db query --linked, em transação única.

- Confirmado no banco: removidos 21 workflows do Arquiteto e 4 do Radar; 115 ArticleDNA; 9 article_architecture_ai_review; 114 eventos de status; 10 eventos de decisão; 9 snapshots e 6 revisões SERP. Silos e tabelas do grafo já estavam vazios.
- Preservados: 29 keywords, 3 listas, 83 qualificações semânticas, 66 apresentações contextuais e 1 brand_skill. Comparação de conteúdo integral dos registros preservados nas 17 tabelas do script passou.
- Cinco triggers append-only restaurados exatamente ao estado O; nenhuma função, FK ou migration removida/aplicada.
- Primeiro ensaio detectou text versus uuid em version_id e desfez a transação. Script corrigido para text[], inclusão das revisões IA, exclusão por folhas de previous_version_id/source_version_id e previous_snapshot_id, locks e comparação de conteúdo preservado.
- Ensaio corrigido: PASS com rollback intencional. Execução definitiva: PASS. Readback SQL independente: PASS. Reexecução em simulação sobre vazio: PASS com rollback intencional. O erro P0001 SIMULACAO CONCLUIDA é deliberado, não falha da purga.
- Validação nas duas sessões da interface: AINDA NÃO VERIFICADA nesta execução. Cache local não foi apagado. Não declarar sincronização visual homologada com base apenas neste SQL.
- Script: supabase/scripts/2026-09-08-descarte-arquiteto-radar-care-glow.sql. Mantido em simulação por padrão. Ele aborta se grafos reaparecerem: não é reset universal para qualquer acervo futuro.
- Nenhum commit, push ou deploy executado nesta entrega.

---

# Fechamento da fase — 2026-09-17

O que esta seção registra é o estado final do módulo. Ela não repete o que as
seções anteriores já descrevem sobre a Fase 1 do Google; ela acrescenta o que
passou a existir depois dela.

## Pesquisa YouTube — perfil audiovisual

`YouTube Search` **não é** a Biblioteca de Vídeos. São duas coisas com nomes
parecidos e naturezas opostas, e a confusão entre elas produz a pior afirmação
possível — "o mercado diz X" sustentado por um vídeo que ninguém assistiu.

| | YouTube Search | Biblioteca de Vídeos |
| --- | --- | --- |
| O que é | SERP competitiva de vídeo | ingestão deliberada de fontes |
| Quem escolhe | a consulta | uma pessoa |
| O que se lê | título, canal, duração, posição, data | o texto extraído da fonte |
| Transcript | **não é exigido** | é a matéria-prima |
| Afirma conteúdo? | **nunca** | sim, com trecho ancorado no tempo |

Registrado no perfil:

- o Google entra apenas como **apoio** (`role: SUPPORT`), nunca como camada
  primária de um artigo de vídeo;
- long-form e Shorts são contados **separados**; ausência de Short na SERP não
  é proibição editorial — é ausência de sinal, e o blueprint diz isso;
- nenhuma inferência sobre o conteúdo interno de um vídeo sem assistir ou
  transcrever. A limitação viaja no dossiê como frase, não como silêncio.

## Pesquisa Amazon — perfil comercial

A intenção editorial é declarada ANTES da coleta e é separada do alvo:

```text
AmazonEditorialIntent   PRODUCT_REVIEW · PRODUCT_VS_PRODUCT · PRODUCT_COMPARISON
                        TOP_BEST · TOP_VALUE · BEST_FOR_USE_CASE
                        BUYING_GUIDE · BRAND_LINE_REVIEW

AmazonResearchTarget    o que pesquisar: categoria, marca/linha, produtos
                        declarados, classe de produto, filtro de marca
```

As três camadas, que não se confundem:

```text
RAW_UNIVERSE          tudo o que a prateleira devolveu, deduplicado por ASIN
  → ELIGIBLE_CANDIDATES   o que é compatível com o alvo declarado
    → EDITORIAL_SHORTLIST   o que entra no artigo
```

- **ASIN é a identidade canônica.** Posição não é identidade.
- `TOP_BEST` **não é** os primeiros N slots da busca.
- `TOP_VALUE` **não é** o menor preço.
- Merchant Amazon Brasil: `language_code = pt_BR`, `location_code = 2076`,
  `amazon.com.br`. A grafia com underscore é da Merchant e não é a mesma do
  Google (`pt-br`) nem do YouTube (`pt-BR`).
- O Google entra como apoio SEO/comercial.
- Sem texto de avaliação inferido, sem PDP inventada, sem benefício não
  verificado, sem reclamação inventada. O que a coleta não leu vira limitação
  declarada — e limitação declarada é dado.

## Links promocionais da Amazon

Os links saem **somente da shortlist editorial**: um produto que o artigo não
menciona não vira link.

```text
URL limpa       https://www.amazon.com.br/dp/{ASIN}
affiliateReady  true — o produto está pronto para monetização
relPolicy       sponsored nofollow
disclosure      obrigatória quando existe link monetizado
```

**O Radar não cria tag de afiliado.** Quem troca `amazonUrl` por `affiliateUrl`
é a etapa posterior, e o ASIN atravessa a troca intacto — é ele que garante que
o link monetizado aponta para o produto que o artigo analisou.

## Biblioteca de Vídeos e Especialista no dossiê

`bundle.video` e `bundle.specialist` são campos do contrato V3 desde o Gate 16
e, até 2026-09-17, sempre chegaram nulos: os construtores das duas camadas não
tinham chamador de produção. Eles passaram a ser preenchidos pela autoridade
canônica, e o Planejador recebe as duas.

**Biblioteca de Vídeos** leva: a fonte selecionada, o papel dela no artigo, os
trechos com âncora de tempo, o que cada trecho sustenta, a seção de aplicação e
as limitações. **Não leva** id de worker, `gs://`, id de job nem metadado de
infraestrutura.

**Especialista** leva: a pergunta preparada, as perguntas enviadas, a
contribuição, o estado da decisão humana, a seção sustentada, o que pode ser
sustentado e as limitações. **Não leva** id de Telegram, id de chat nem
metadado privado do canal — e a omissão acontece na ORIGEM, ao montar a camada,
não ao formatar a saída.

Ausência é `null`, nunca camada vazia. A diferença é de significado: `null` diz
"não houve"; uma camada com `items: []` e `notApproved: 3` diz "houve resposta e
ninguém decidiu" — e as duas pedem ações diferentes.

## O dossiê canônico

```text
loadRadarCanonicalAuthorities   →   resolveRadarCanonicalDossier
```

O mesmo dossiê semântico alimenta `sendRadarToPlanner` e o export portátil. Não
existem duas resoluções para comparar: existe uma, com duas serializações.

Todo `evidenceRef` que o blueprint usa resolve a partir do dossiê ENTREGUE —
não apenas a partir do export. A resolução é por rótulo observado, porque o id
do candidato é um hash interno e não reversível, enquanto o rótulo é o mesmo nos
dois lados e está dentro de `bundle.observed`.

## Contexto de keyword

O **papel** e a composição vêm do ArticleDNA (`keywordReferences[].role`). O
**texto** vem da hidratação amarrada ao mesmo `articleDnaVersionId` — ele não
existe no payload do ArticleDNA, e é importante que isso esteja escrito para
ninguém procurá-lo no lugar errado.

Nunca resolver a keyword principal por título, slug, consulta da SERP, promessa
ou hierarquia. Se o texto não resolver, `resolution = UNRESOLVED` e a principal
é `null` — e uma secundária **nunca** é promovida a principal.

`bundle.keywordContext` é aditivo e opcional: o contrato continua V3, e dossiê
gravado antes disso continua íntegro, resolvendo pelo fundamento que o vínculo
identifica.

## Dossiê editorial portátil

O export **não é backup**. É um `PORTABLE EDITORIAL WRITING DOSSIER`: o que
alguém — pessoa, GPT, Claude, CMS — precisa para produzir o artigo sem abrir o
Radar.

Ele inclui ArticleDNA compacto, DNA e contexto das keywords, blueprint,
evidência da SERP, fontes, evidência por seção, pesquisa de vídeo, biblioteca de
vídeos, especialista, links internos resolvidos, evidência da Amazon, links
promocionais, identidade SEO, plano visual com capa e imagens de respiro,
limitações, `writer_brief_md` e `writer_context_md`.

Ele **não** inclui payload cru de provider, segredos, ids privados, dump de
banco, nem hash/UUID como conteúdo editorial. Desde o polimento de 2026-09-17,
também não inclui endereço interno de evidência: a relação seção → evidência
atravessa por rótulo legível, e a consulta de vídeo sai pelo TEXTO buscado.

A superfície é um botão só:

```text
Exportar ▾
  ├ Planilha atual                        as colunas da tela, com filtro
  └ Dossiês editoriais finalizados (CSV)  o dossiê de escrita
```

## SEO e plano visual

`seoTitle`, `metaDescription`, Open Graph, Twitter, `robots` e schema **podem
permanecer não definidos nesta fase** — eles pertencem ao Planejador e ao
Redator. O Radar exporta a DIREÇÃO e as RESTRIÇÕES, com os campos nomeados em
`notDefinedAtThisStage`, e não inventa decisão futura.

O que o Radar tem e entrega: o H1 editorial do blueprint, a direção de
titulação, o que a meta description precisa refletir, slug e canonical com o
estado de proteção.

Plano visual canônico: **1 capa + 2 ou 3 imagens de respiro**. FAQ não faz parte
do padrão. Cada imagem declara função, conceito, seção, ALT, arquivo, prompt, o
que evitar e a origem da necessidade.

## Handoff

`sendRadarToPlanner` continua sendo a autoridade única de envio, com a ordem
inalterada:

```text
validate → canonical resolve → write bundle → readback
        → identity/hash validation → workflow transition
        → destination readback → success
```

`RadarEvidenceBundle` continua **V3**. Nenhum envelope paralelo foi criado.

## O destino do Radar passou a ser o Redator — 2026-09-17

```text
ANTES   Radar → Planejador → Redator
AGORA   Radar → Redator
```

`sendRadarToWriter` (`lib/server/radar-writer-send.ts`) é a autoridade única de
entrega. Ela resolve o MESMO dossiê canônico de sempre —
`loadRadarCanonicalAuthorities → resolveRadarCanonicalDossier` — e cria o
documento do Redator com a estrutura inteira dentro:

```text
validate → canonical resolve → readiness
        → write receipt (writerBundle) → readback
        → identity/hash → create document → destination readback
        → workflow transition (approved → sent_writer)
```

O Radar **não** mudou de papel: nenhum collector migrou, nenhuma lógica de
SERP, Blueprint, qualificação ou formação foi reaberta. O que mudou foi para
onde a evidência vai e quem decide o que fazer com ela.

O Redator recebe a ESTRUTURA — `importedContext.dossier` carrega o bundle
inteiro, o contexto de keyword e `writerMayNot`. `writer_context_md` continua
sendo read model portátil do CSV, e o export não mudou.

`sendRadarToPlanner` virou legado: sem rota, sem botão e sem transição. Ele
permanece porque define o que `plannerBundle` e `sent_planner` significam nos
registros já gravados.

Nenhuma migration foi necessária: `stage` já aceitava `writer`, `state` e
`event_type` são texto livre e `content_plan_version_id` sempre foi nulo.

Detalhe da rodada:
[relatório datado](../00-produto/auditorias/relatorio-radar-to-writer-handoff-2026-09-17.md).

**Aceitação manual pendente** — o envio real ao Redator é ato do USER.

### Correção do readiness da entrega — 2026-09-17

O primeiro clique real em "Enviar ao Redator" recusou artigos **finalizados**,
mandando aprovar o Radar. A recusa vinha de uma condição sobre
`editorial_workflow_items.state`, copiada do caminho do Planejador: ela exigia
`approved`, e o fluxo vigente — `START → ANALYZE → FINALIZE` — nunca produz
esse estado.

A autoridade passou a ser, sozinha, a prontidão canônica do dossiê. A esteira
segue o fato: move-se para `sent_writer` depois de o documento ser confirmado,
a partir de qualquer estado.

O mesmo defeito existia na barra de lote, que decidia por `reportApproved` — a
aprovação do relatório do fluxo antigo. Ela passou a perguntar pela finalização
canônica.

Artigo finalizado ANTES da mudança de destino é reconhecido sem refinalizar, e
nenhuma evidência congelada foi recriada.

### Três perfis no mesmo handoff — 2026-09-19

Com um artigo de cada perfil na mesma marca, três leituras discordavam: o
segundo clique de "Enviar ao Redator" acusava "pacote anterior" sobre uma
investigação intocada; o diálogo "Importar do Radar" só listava o Google; a
planilha mostrava YouTube e Amazon como "Iniciar Pesquisa Google".

As três causas eram de leitura, não de investigação: a hora do clique entrava
no hash do dossiê (`observedAt = sentAt`); o diálogo filtrava pela esteira; a
planilha caía no modo padrão para toda linha não aberta na sessão. Nenhuma
evidência foi recriada. Regras permanentes: invariantes 59–61. Detalhe:
[relatório datado](../00-produto/auditorias/relatorio-radar-multi-profile-handoff-2026-09-19.md).

```text
OBSERVED_AT            = instante do congelamento (envio e export)
IMPORTAVEL_NO_REDATOR  = radarWriterImportable (finalização canônica ou sent_writer)
MODO_EFETIVO_DA_LINHA  = sessão → gravado → padrão
MUTANTES               = 9/9 mortos · verde antes e depois
GOOGLE_SUPPORT         = YouTube e Amazon SEM coleta de apoio do Google no banco
```

### Seleção leve na planilha — 2026-09-19

Selecionar uma linha recalculava o modelo inteiro de TODAS as linhas em ~20
pontos por render (colunas, texto de busca do grid, workbench, cards). Os
modelos da linha, a projeção de pesquisa e o blueprint passaram a ter cache
de UM render (`cacheDaLinha`, `cacheDaProjecao`, `cacheDoBlueprint`) — sem
`useMemo`, para nenhuma linha mostrar estado anterior. O card fechado tem o
tamanho do card vazio (uma linha + marca); o resto aparece ao abrir a área.
Medição em runtime é do USER; se persistir, o próximo passo é memoizar
`columns` e virtualizar linhas. Relatório:
[relatório datado](../00-produto/auditorias/relatorio-radar-selecao-leve-2026-09-19.md).

### Planilha e Radar no contrato visual — 2026-09-19

A planilha compartilhada (`operational-data-grid.tsx`), os helpers de tela
(`operational-screen-shared.tsx`), a rota de análise, o painel do relatório
competitivo e o detalhe legado da página passaram a consumir só tokens do
sistema visual: hex cru, `slate-*` (inclusive `slate-850`, que não existe e
deixava bordas sem renderizar), `teal/emerald/amber/orange/red` e fontes
abaixo de 12px foram convertidos pelo significado (`color-contract.md`).
Células em 14px, cabeçalho em `surface-subtle`, linha expandida com a faixa
de `module-accent`. Guard estrito zerado nos arquivos do Radar; o guard global
segue falhando por dívida que cresceu em 7 arquivos de outras sessões (o
baseline não travou aumentos). Validação visual
em DOM real é do USER. Relatório:
[relatório datado](../00-produto/auditorias/relatorio-radar-visual-contract-2026-09-19.md).

## Listagem do workflow sem corridas históricas — 2026-09-21

`20260921060000_listagem_workflow_sem_corridas.sql` **aplicada e verificada**.

| medida | valor |
| --- | --- |
| payload radar na tabela | 10 MB (3 linhas) |
| pela view de listagem | 3400 kB |
| corte | **67,9%** |
| versões correntes intactas | 3 de 3 |
| versões perdidas | nenhuma (contagens iguais) |

A poda e a compactação em TS continuam rodando depois da view: a view é
otimização, elas é que decidem. O readback por artigo (`byArticle`) segue
lendo a tabela completa — é dele que nasce toda escrita, e é por isso que
compactar a listagem não compromete a gravação.

### CORREÇÃO DE ATRIBUIÇÃO DO EGRESSO

Esta era a maior fonte, não o Minerador. 10 MB por carregamento contra 1 MB
da listagem de keywords: ~570 aberturas para os 5,7 GB, contra ~5 700.

A conta anterior dizia 2,5 MB para este estágio porque vinha de
`pg_column_size`, que mede o disco COMPRIMIDO. Em bytes de fio são 10 MB.

## Compactação da investigação congelada — 2026-09-21

`20260921070000_listagem_workflow_compacta_congelada.sql` **aplicada e
verificada**. Acumulado das duas migrations:

| medida | valor |
| --- | --- |
| payload radar na tabela | 10 MB |
| pela view, só com a poda | 3400 kB (67,9%) |
| pela view, com a compactação | **2339 kB (77,9%)** |

### A TRAVA DE ESCRITA, CONFERIDA NO DADO REAL

`researchTransport: "COMPACT"` não é rótulo: `analysis-contracts.ts:869`
recusa construir versão nova a partir de base marcada
(`RadarCompactBaseError`). É o que impede uma escrita nascer de leitura
incompleta. Por isso a conferência foi pelos dois erros possíveis:

| conferência | resultado |
| --- | --- |
| versão corrente preservada | 3 de 3 |
| perdeu conteúdo **e** marcou | 3 |
| marcou **sem** perder — recusaria escrita legítima | **0** |
| perdeu **sem** marcar — deixaria escrita nascer de base lossy | **0** |
| `competitiveReport` intacto (é da poda, não da compactação) | 3 de 3 |

O segundo erro é o grave: esvaziar sem marcar seria pior do que não
economizar, porque a base ficaria incompleta e a trava não dispararia.

## Corridas brutas em tabela própria — etapa 2 — 2026-09-21

Tabela `radar_analysis_runs` aplicada. O código já opera com ela; falta mover
os dados.

### A FRONTEIRA

A troca acontece no repositório, não nos consumidores. Os ~20 módulos que
leem `amazonSearch` e companhia recebem a versão inteira, como sempre.

| método | comportamento |
| --- | --- |
| `find`, `findByArticle` | **reidratam** todas as versões |
| `findByArticleRaw` (novo, privado) | lê a linha como está gravada |
| `appendRadarAnalysis` | lê cru e separa a versão nova |
| `transition` | **desidrata** antes de gravar |

`transition` desidratar é o que impede a arrumação de se desfazer sozinha: o
payload que chega pode ter vindo reidratado de `find`, e gravá-lo como está
devolveria as corridas para dentro da linha, uma transição por vez.

A reidratação é de TODAS as versões, de propósito conservador — o custo dessa
rota continua igual ao de hoje. O ganho desta etapa está na escrita.

### O GUARDA DE PERDA DE DADO FOI ATUALIZADO, NÃO AFROUXADO

`radar-live-ux-1-payload.test.mts` exigia que a escrita lesse por
`findByArticle`, porque ler PODADO e regravar apagaria `extractions` das
versões antigas no banco. O caminho cru agora tem nome próprio
(`findByArticleRaw`) e o teste passou a exigir esse — mais a negativa de que
a escrita **não** usa a leitura que reidrata, que é o erro simétrico.

O invariante é o mesmo, e mais explícito: nem podado, nem reidratado —
verbatim. Regravar o que se leu verbatim é lossless por construção.

### FALTAM DOIS PASSOS, NESTA ORDEM

```
npm run radar:mover-corridas -- --apply      copia (dado nos dois lugares)
npm run radar:mover-corridas -- --esvaziar   esvazia o payload
```

Entre um e outro o dado fica duplicado e a reidratação vira no-op: é
reversível por construção. O readback do primeiro passo não confere se
gravou — confere se a FUSÃO devolve a versão idêntica, campo a campo. E o
segundo só esvazia versão que já tem linha na tabela.

Dry-run de hoje: 3 linhas, 62 versões, **31 com corrida no payload**.

## Corridas movidas — resultado — 2026-09-21

Os dois passos rodaram. 31 corridas copiadas e conferidas pela fusão, 3
linhas esvaziadas, sem falhas.

| linha | antes | depois |
| --- | --- | --- |
| …0a32e64c | 1171 kB | 104 kB |
| …010c6b13 | 1279 kB | 579 kB |
| …e42cd892 | 7620 kB | 840 kB |

### CONSERVAÇÃO E INTEGRIDADE, LIDAS NO BANCO

| conferência | resultado |
| --- | --- |
| corridas guardadas | 31 · 8989 kB |
| payload das linhas | 1597 kB (era 10 MB) |
| soma | ≈ os 10 MB originais — nada se perdeu |
| versões ainda com corrida embutida | **0** |
| corridas sem versão correspondente | **0** |
| corridas vazias | **0** |
| corridas órfãs (sem item) | **0** |

### O QUE ISSO MUDA NA PRÁTICA

**Listagem:** 10 MB → 1597 kB (84%). Melhor que os 2339 kB que as views
alcançavam, e agora a view devolve o mesmo peso da tabela — ela não tem mais
o que podar nestas linhas. As duas continuam valendo: se uma corrida voltar a
nascer embutida, elas seguem cortando.

**Escrita, que era o alvo desta etapa:** `appendRadarAnalysis` lia a linha
inteira e regravava tudo. No artigo maior isso eram 7620 kB de descida mais
7620 kB de subida por análise nova. Agora são 840 kB de cada lado — cerca de
13,5 MB a menos por versão acrescentada, e sem crescer com o histórico.

## Leituras e ações do Radar reidratam só o que usam — 2026-09-23

**Confirmado por teste; ainda não verificado manualmente.** Ver SDD de
[uso da Supabase](../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md),
regras R9 e R10.

`WorkflowRepository.find` e `findByArticle` reidratam **todas** as corridas do
item. Era o conservador certo na etapa 2 da separação das corridas, mas as
rotas usavam uma ou duas versões e descartavam o resto. Medido no item mais
pesado (`fd91b97b`), uma leitura completa custa ~8,2 MB.

### Três métodos novos, `find` e `findByArticle` intocados

| Método | Devolve | Para quem |
| --- | --- | --- |
| `findByArticleHydratingVersions(…, pick)` | a linha, com corrida só nas versões escolhidas | rotas de leitura que servem versões específicas |
| `findByArticleWithoutRuns(…)` | a linha como gravada, versões com os 4 campos vazios | portões que não leem corrida |
| `findCurrentRadarAnalysisForWriteLock(…)` | **só a versão corrente**, nunca a linha | a trava de gravação |

O terceiro devolve uma versão e não uma linha de propósito: uma linha meio
hidratada poderia ser regravada por engano e perder conteúdo.

`pick` recebe as versões **leves** — `versionId`, `versionNumber` e `status`
não saem da linha, porque `splitAnalysisRun` só move os quatro campos de
corrida. E o método filtra os ids para os que a própria linha tem: o
`versionId` da requisição chegava cru a `.in("version_id", …)`, e o
`postgrest-js` não escapa aspas embutidas — `a"b(` virava PGRST100 e a rota
respondia 500 onde antes respondia 404.

### Economia medida no item mais pesado

| Porta | Antes | Depois |
| --- | ---: | ---: |
| montagem do Radar (3 itens) | ~10,84 MB | ~3,5 MB |
| `reloadRadarAnalysis` após ação | ~8,2 MB | ~2,5 MB |
| área Vídeos, por GET | ~8,23 MB | ~0,90 MB |
| Casar vídeos (lê duas vezes) | ~16,5 MB | ~1,8 MB |
| amostra ou proveniência da pesquisa | ~8,23 MB | ~2,5 MB |
| extração da concorrência, **por lote** | ~8,22 MB | ~0,90 MB |
| verificação de fontes, por lote | ~8,22 MB | até ~2,57 MB |
| trava da gravação | ~8,22 MB | ~2,50 MB finalizada, ~0,90 MB aberta |

"Analisar concorrência" roda em **laço de lotes de 5 páginas**: numa análise
de 20 páginas a releitura caía de ~33 MB para ~3,6 MB.

### A verificação adversarial errou num ponto — e a implementação pegou

A auditoria concluiu, e as duas lentes confirmaram, que a verificação de
fontes não lia campos de corrida. **Lê:** `persistida.payload.extractions`
(`verify-sources/route.ts:95`). Com a leitura sem corridas, o plano sairia
vazio e **toda** fonte receberia 422 `SOURCE_UNKNOWN`. O implementador provou
com teste de sensibilidade e usou `findByArticleHydratingVersions` só com a
versão pedida. Verificação por leitura de código não substitui teste que
exercita a rota.

### Mudanças de comportamento aceitas

- **Só em dado corrompido:** se a corrida de uma versão **não** escolhida
  estiver malformada, antes o parse falhava e a rota dava 500; agora a rota
  responde normalmente.
- **Gravação:** o POST passava todas as versões reidratadas pelo schema, e
  uma versão antiga inválida dava 400 antes da trava. Agora só a corrente é
  validada ali.

### Testes

- `tests/radar-reidratacao-seletiva.test.mts` (18) e
  `tests/radar-acoes-sem-reidratar-tudo.test.mts` (27), com PostgREST
  simulado e o caminho antigo como oráculo: respostas idênticas byte a byte.
- Atualizados, com a razão em comentário: `tests/radar-final-23.test.mts`
  (a trava continua exigindo leitura do repositório, não compactada — agora
  pelo método novo) e `tests/radar-18102-identidade-da-base-remota.test.mts`.
- Guarda `tests/radar-live-ux-1-payload.test.mts` intacta: escrita segue lendo
  verbatim.
- Suíte Radar: **2313/2313**.
