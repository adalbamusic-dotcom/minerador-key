/**
 * ===== O MAPA DA PLATAFORMA PARA AGENTES =====
 *
 * SDD: `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md`.
 *
 * Domínio puro: sem banco, sem rede, sem sessão. Pode ser lido por servidor,
 * teste e tela.
 *
 * ==================== UMA FONTE SÓ ====================
 *
 * Tudo o que uma IA conectada pelo MCP sabe sobre COMO trabalhar aqui sai deste
 * arquivo: o guia (`get_platform_guide`), as instruções do servidor e os
 * próximos passos (`get_next_actions`). Não existe segundo texto explicando o
 * processo em outro lugar — se existisse, divergiria na primeira mudança.
 *
 * REGRA DO `AGENTS.md`: mudou um processo, muda este catálogo na mesma entrega.
 * `tests/agent-platform-catalog-sync.test.mts` falha quando uma rota de módulo
 * aparece sem estar aqui, ou quando uma ferramenta do servidor e o catálogo
 * discordam.
 *
 * ==================== O QUE A IA PODE E O QUE NÃO PODE ====================
 *
 * `access: "tool"` — existe operação de servidor, e a IA a executa pelo MCP.
 * `access: "ui"`   — a operação só existe na tela. A IA explica, manda o link e
 *                    retoma quando o estado mostrar que foi feita.
 * `decision: "human"` — a decisão continua sendo do usuário. Uma ferramenta
 *                    só pode aplicá-la se `chatConfirmationRequired` for true;
 *                    a IA precisa exibir uma prévia e registrar o aceite.
 */

export const PLATFORM_STAGES = ["marca", "minerador", "arquiteto", "radar", "redator", "publicacoes"] as const;
export type PlatformStage = typeof PLATFORM_STAGES[number];

export const PLATFORM_STAGE_LABELS: Record<PlatformStage, string> = {
  marca: "Marca",
  minerador: "Minerador",
  arquiteto: "Arquiteto",
  radar: "Radar",
  redator: "Redator",
  publicacoes: "Publicações",
};

export type OperationCost = "free" | "paid_provider" | "paid_ai";
export type OperationDecision = "agent" | "human";
export type OperationAccess = "tool" | "ui";

export type PlatformOperation = {
  id: string;
  stage: PlatformStage;
  title: string;
  /** O que a operação faz, em uma frase. */
  purpose: string;
  /** O que precisa estar pronto antes. */
  requires: readonly string[];
  /** O que existe depois. */
  produces: readonly string[];
  cost: OperationCost;
  decision: OperationDecision;
  access: OperationAccess;
  /** Permite à IA aplicar uma decisão humana aceita explicitamente no chat. */
  chatConfirmationRequired?: boolean;
  /** Nome da ferramenta MCP, quando `access = "tool"`. */
  tools?: readonly string[];
  /** Tela onde a pessoa faz a operação: o módulo da rota tenantizada. */
  screen: PlatformStage;
  /** Na tela, o caminho até a ação, com os nomes que aparecem nela. */
  howOnScreen: string;
  /** Rotas de API que implementam a operação. Conferidas pelo teste de sincronia. */
  routes: readonly string[];
  notes?: readonly string[];
};

/* ======================================================================= */
/*                              AS OPERAÇÕES                               */
/* ======================================================================= */

export const PLATFORM_OPERATIONS: readonly PlatformOperation[] = [
  {
    id: "arquiteto.article_improvement", stage: "arquiteto", title: "Melhorar publicados e formar Assuntos",
    purpose: "Analisar todos os alvos da marca, redistribuir keywords elegíveis, pesquisar lacunas e aplicar a composição final numa confirmação editorial, com diferenciação entre publicados concorrentes.",
    requires: ["Publicados ou Assuntos declarados recebidos no Arquiteto", "Silo do destino conhecido", "Aceite da pesquisa gratuita que usa quota e da prévia editorial; plano específico antes de qualquer custo"],
    produces: ["Prévia com principal, entradas, saídas, papéis, volumes, transferências, enfoques e motivos por alvo", "Execução retomável com ArticleDNA, parecer, composição e marcador relidos"],
    cost: "paid_provider", decision: "human", access: "tool", chatConfirmationRequired: true,
    tools: ["improve_articles"], screen: "arquiteto", routes: ["/api/arquiteto/article-improvement"],
    howOnScreen: "Arquiteto → Artigos → Melhorar publicados e formar Assuntos → Preparar melhorias → revisar custo se necessário → escolher alvos → Aplicar melhorias → Confirmar e aplicar. F5 recupera a execução do servidor; Continuar melhorias aceitas retoma o mesmo lote.",
    notes: [
      "prepare usa acervo antes de pesquisa Google Ads (grátis, com quota); consulta todas as candidatas do cache antes de limitar as pagas. status não escreve. collect requer provider.spend, hash vigente e aceite específico do custo; teto US$ 1 para a execução inteira. apply requer platform.decide, arquiteto.write, minerador.write, permissões dos módulos e aceite específico da prévia.",
      "Uma confirmação inclui principal Livre, substituições de apoios fracos, transferências de keywords livres e aprovação de novas keywords; Travada permanece. URL, slug, canonical, marca e Silo publicados preservados. Assunto continua declarado, fora do teto de seis. Uma ou duas buscas adequadas podem bastar; não preencher seis à força.",
      "Principal antiga sem demanda não é âncora obrigatória de coincidência: fundamento editorial e SERP completa das candidatas podem sustentar a proposta, com origem da evidência declarada. Contradição conclusiva impede aprovação automática. Risco de ranking é aviso, não revoga Livre.",
      "Canibalização exige enfoques distintos e exclusões recíprocas sustentados pelos dados; trocar captar clientes por atrair pacientes não basta. Se não houver diferenciação demonstrável, informar o motivo e pesquisar opções, preservando as páginas.",
      "apply avança um alvo por chamada: repetir o mesmo runId e decisionHash até state complete, sem novo aceite para etapas internas do lote já aceito. Falha isolada fica registrada e os demais seguem. Melhoria exige mudança material, composição, ArticleDNA e marcador relidos; criar só DNA é outra contagem. A operação não reescreve nem publica externamente.",
    ],
  },
  /* ------------------------------- Marca -------------------------------- */
  {
    id: "marca.brand_dna",
    stage: "marca",
    title: "Identidade da marca (BrandDNA)",
    purpose: "Registrar público, tom, oferta, diferenciais e diretrizes que todo conteúdo da marca herda.",
    requires: ["Marca criada"],
    produces: ["BrandDNA"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "marca",
    howOnScreen: "Marca → Identidade da marca.",
    routes: ["/api/marca/brand-dna", "/api/marca/skills", "/api/marcas/[brandId]/experts"],
  },
  {
    id: "marca.site_catalog",
    stage: "marca",
    title: "Site e sitemap (o que já está publicado)",
    purpose: "Sincronizar o sitemap da marca para a plataforma saber quais páginas já existem, com URL, título e H1.",
    requires: ["site_url da marca"],
    produces: ["Catálogo de páginas publicadas"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "marca",
    howOnScreen: "Marca → Site e Sitemap → sincronizar; conferir página por link quando precisar.",
    routes: [
      "/api/marca/site/sitemap",
      "/api/marca/site/sitemap/sync",
      "/api/marca/site/sitemap/test",
      "/api/marca/site/page/verify",
      "/api/marca/site/lists",
      "/api/marca/site/import/keywords",
      "/api/marca/site/import/keywords/preview",
    ],
    notes: ["Sem catálogo sincronizado, a IA não consegue saber o que já está publicado: sincronize antes de planejar silos."],
  },

  /* ----------------------------- Minerador ------------------------------ */
  {
    id: "minerador.declare_subjects",
    stage: "minerador",
    title: "Declarar Assuntos (o tronco dos artigos)",
    purpose: "Registrar no Minerador as frases que serão o tronco de artigos ou de um silo, com nota e página de destino opcionais.",
    requires: ["Assuntos escolhidos pelo usuário no chat (a IA propõe; só o humano declara — ADR-022)"],
    produces: ["Keywords com 'Assunto · declarado' no Processador"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["declare_subjects"],
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → importar lista com 'Esta lista é: Assunto'.",
    routes: ["/api/minerador/marcas/[brandId]/subjects/import"],
    notes: [
      "Sempre `preview` antes de `apply`. Frase que já existe na marca só é declarada se o usuário marcar (declareExistingIds).",
      "No `apply`, envie em `userConfirmation` a frase em que o usuário aceitou os Assuntos. Sem aceite explícito, não aplique.",
    ],
  },
  {
    id: "minerador.search_subject_keywords",
    stage: "minerador",
    title: "Pesquisar keywords de sustentação por Assunto",
    purpose: "Buscar no Google Ads (frase e página de destino) as buscas reais que trazem o leitor até o Assunto.",
    requires: ["Assunto (declarado ou só a frase)", "Conexão Google Ads da marca"],
    produces: ["Lista de candidatas (não gravada: volta só para a IA escolher)"],
    cost: "paid_provider",
    decision: "agent",
    access: "tool",
    tools: ["search_subject_keywords"],
    screen: "minerador",
    howOnScreen: "Minerador → Descobrir Keywords → Por Assunto.",
    routes: ["/api/minerador/marcas/[brandId]/subject-discovery/search"],
    notes: [
      "Primeiro `mode: plan` (grátis): devolve o plano (frase, página de destino e segmentação do Google Ads). Sem custo no DataForSEO; usa a cota do Google Ads. Desde 2026-09-28 a pesquisa não usa o DataForSEO Labs nem coleta SERP: uma marca sem DataForSEO pesquisa normalmente.",
      "Custo em dinheiro: zero. A operação continua como 'paid_provider' porque a execução gasta a cota do Google Ads da marca (aceite do usuário e escopo provider.spend); não a apresente como gasto em dinheiro.",
      "Mostre o plano ao usuário. Só com o aceite dele chame `mode: execute` com o `authorizedPlan` recebido (planHash; maxCostUsd = 0). Sem ele: PAID_PLAN_REQUIRED; plano mudou: PAID_PLAN_CHANGED. Se o Google Ads não abrir, GOOGLE_ADS_UNAVAILABLE: nada foi consultado.",
      "Volume primeiro (D2.3): as candidatas vêm ordenadas pela média do Google Ads. Candidata sem média do Google Ads (ou com média 0) está sem volume e não reforça artigo: não a proponha. Cada candidata traz `hasVolume` (true/false); `estimate` (estimativa DataForSEO, rotulada) só aparece em pesquisas antigas, e `volume` continua sendo só a média do Google Ads. Na tela, 'Só com volume' vem ligado, mostra quantas ficaram escondidas e o envio avisa quantas selecionadas estão sem volume.",
    ],
  },
  {
    id: "minerador.import_subject_keywords",
    stage: "minerador",
    title: "Importar as candidatas escolhidas ao Processador",
    purpose: "Levar ao Processador as keywords de sustentação escolhidas, ligadas ao Assunto.",
    requires: ["Candidatas da pesquisa por Assunto", "Escolha do usuário (individual ou em grupo)"],
    produces: ["Keywords em 'bruto' no Processador, aguardando medição"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["import_subject_keywords"],
    screen: "minerador",
    howOnScreen: "Minerador → Descobrir Keywords → Por Assunto → Enviar ao Processador.",
    routes: ["/api/minerador/marcas/[brandId]/subject-discovery/import"],
  },
  {
    id: "minerador.discover_keywords",
    stage: "minerador",
    title: "Descobrir keywords (sem Assunto)",
    purpose: "Expandir uma semente em candidatas pelo Google Ads e por fontes de descoberta.",
    requires: ["Semente ou lista"],
    produces: ["Candidatas na Descoberta (no navegador) e import ao Processador"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "minerador",
    howOnScreen: "Minerador → Descobrir Keywords.",
    routes: [
      "/api/minerador/marcas/[brandId]/discovery/sources",
      "/api/minerador/marcas/[brandId]/discovery/import",
      "/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords",
    ],
  },
  {
    id: "minerador.run_logic",
    stage: "minerador",
    title: "Executar a Lógica determinística",
    purpose: "Classificar intenção, nicho e funil sem chamar provedores, preservando decisões humanas existentes.",
    requires: ["Keywords no Processador"],
    produces: ["Contrato de Lógica completo por keyword"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["run_keyword_logic"],
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → barra do rodapé → Lógica.",
    routes: [],
    notes: ["Pode rodar para uma keyword ou em grupo. Usa o mesmo núcleo da tela; não mede volume nem Resultados; o KGR é opcional (padrão não aplicável). Intenção e funil da Lógica são indicação ao usuário, não requisito de SERP."],
  },
  {
    id: "minerador.measure_keywords",
    stage: "minerador",
    title: "Medir Volume",
    purpose: "Consultar o Google Ads para obter Volume, CPC e demanda. Resultados (SERP/allintitle/KD no DataForSEO) é ação manual, opcional e paga, e não entra na aprovação.",
    requires: ["Keywords no Processador"],
    produces: ["Volume (Google Ads)", "Resultados, KD e KGR só quando o usuário roda a ação opcional"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → barra do rodapé → Volume. Opcional, fora da sequência de processos, nas ações secundárias da barra: 'Resultados (opcional · pago)', que mostra o custo estimado e pede uma confirmação antes de pagar.",
    routes: [
      "/api/minerador/marcas/[brandId]/dataforseo/allintitle",
      "/api/minerador/marcas/[brandId]/google-ads/metricas-keywords",
      "/api/minerador/marcas/[brandId]/google-ads/conexao",
    ],
    notes: [
      "A medição chama provedores pagos. A IA ainda não a executa pelo MCP; faça-a na tela.",
      "Resultados (SERP) é opcional e pago, cerca de US$ 0,025 a 0,036 por keyword (estimativa). A primeira coleta da SERP acontece no Arquiteto, aba Artigos, só para keywords com volume. O que já foi coletado continua legível como proveniência.",
      "Resultados nunca coleta keyword sem volume (nulo, zero ou ainda não medido): ela fica fora do lote e a confirmação diz quantas. Meça o Volume antes.",
      "Com Assunto declarado, aprovar dispensa Volume e KGR: só a Lógica é exigida.",
    ],
  },
  {
    id: "minerador.review_and_approve",
    stage: "minerador",
    title: "Revisar e aprovar keywords",
    purpose: "Decisão humana sobre cada keyword: Vínculo (Assunto, tipo de página, posto), revisão concluída e aprovação.",
    requires: ["Keywords com Volume e Lógica"],
    produces: ["Keywords 'aprovado', prontas para o Arquiteto"],
    cost: "free",
    decision: "human",
    access: "tool",
    chatConfirmationRequired: true,
    tools: ["set_keyword_vinculo", "set_kgr_applicability", "decide_keywords"],
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → Revisão Humana (individual) ou barra do rodapé (em grupo) → Concluir revisão → Status: aprovado. Pelo MCP, a IA apresenta prévia e só aplica após o aceite explícito no chat.",
    routes: [],
    notes: [
      "Tipo de página 'silo' marca a keyword que será a cabeça do silo (a página do silo). Declare-o para a keyword do silo.",
      "O Vínculo, o KGR e a aprovação podem ser aplicados pelo MCP só após prévia, aceite específico, hash vigente e readback. Conteúdo publicado segue protegido.",
      "Aprovar exige só Lógica e Volume (Google Ads, inclusive a resposta sem média). Resultados e KGR não são exigidos para aprovar, concluir a revisão nem enviar ao Arquiteto.",
      "`set_kgr_applicability` é opcional: o padrão é 'não aplicável'; só a decisão humana 'Aplicável' liga o KGR. O 'pending' legado é lido como não aplicável. A faixa de volume de interesse para KGR (150 a 550) é só informativa.",
      "Marcar 'Não aplicável' em grupo grava a decisão humana só onde havia o 'pending' legado ou valor de origem automática (a linha sai do filtro 'Pendente (legado)'); sem nenhum valor gravado, nada é escrito.",
    ],
  },
  {
    id: "minerador.keyword_lifecycle",
    stage: "minerador",
    title: "Excluir, restaurar ou purgar keywords",
    purpose: "Tirar keywords do trabalho com janela de restauração.",
    requires: ["Decisão do usuário"],
    produces: ["Keyword excluída (restaurável) ou restaurada"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → selecionar → Excluir; Restaurar pela lista de recuperáveis.",
    routes: [
      "/api/minerador/marcas/[brandId]/keywords/delete",
      "/api/minerador/marcas/[brandId]/keywords/delete/preview",
      "/api/minerador/marcas/[brandId]/keywords/purge",
      "/api/minerador/marcas/[brandId]/keywords/recoverable",
      "/api/minerador/marcas/[brandId]/keywords/restore",
    ],
    notes: ["Exclusão é sempre decisão humana. A IA nunca exclui."],
  },
  {
    id: "minerador.send_to_arquiteto",
    stage: "minerador",
    title: "Enviar keywords aprovadas ao Arquiteto",
    purpose: "Transferir as keywords aprovadas para o Arquiteto formar artigos e silos.",
    requires: ["Keywords com status 'aprovado'"],
    produces: ["Keywords recebidas no Arquiteto"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["send_keywords_to_arquiteto"],
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → selecionar aprovadas → Enviar ao Arquiteto.",
    routes: ["/api/arquiteto/handoff"],
    notes: ["Keyword não aprovada é recusada pelo servidor. Idempotente: repetir não duplica."],
  },

  /* ----------------------------- Arquiteto ------------------------------ */
  {
    id: "arquiteto.form_architecture",
    stage: "arquiteto",
    title: "Formar artigos e silos (Processar lógica)",
    purpose: "Reconhecer Silos e artigos já publicados pelo Vínculo e canonical; propor o agrupamento das keywords livres e a arquitetura nova.",
    requires: ["Keywords recebidas do Minerador"],
    produces: ["Silos e memberships publicados efetivados", "Proposta de artigos, keywords livres e Silos novos na cópia de trabalho"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Silos → Processar arquitetura; depois Artigos → Processar artigos (que primeiro coleta a SERP do lote com volume nas 4 lentes). Confira o Vínculo e o canonical dos publicados e revise a proposta das livres.",
    routes: [
      "/api/arquiteto/workspace",
      "/api/arquiteto/artifacts",
      "/api/arquiteto/architecture-marker",
      "/api/arquiteto/article-formation-marker",
      "/api/arquiteto/workflow-status",
      "/api/arquiteto/silos",
      "/api/arquiteto/silo-pair",
      "/api/arquiteto/homologation-fresh",
      "/api/arquiteto/backup/restore",
    ],
    notes: ["Publicado declarado não exige Confirmar arquitetura de novo: o primeiro processamento efetiva Silo e membership pela URL, com readback. Divergência de endereço continua conflito.", "O publicado é reconhecido pelo Vínculo (URL e canonical conferidos), mesmo com status aprovado e sem sitemap: a contagem de publicados reconhecidos vem do Vínculo, e o catálogo do site é só evidência adicional. Publicado sozinho é artigo completo que aguarda reforço, nunca isolado, candidato individual ou Não aplicável. Publicado que também é Assunto sem Volume continua principal do próprio artigo e recebe as sustentações do Assunto; duas publicadas nunca se fundem.", "A formação lê primeiro os KeywordDNAs aprovados (intenção e funil das 4 lentes, evidencia_serp, volume, Vínculo, Assunto e proveniência da Pesquisa por Assunto). Em cada Silo, a precedência é: artigos publicados, Assuntos declarados e livres que reforçam os dois, por semântica e importância (publicado antes de Assunto; a livre vai para onde agrega mais). O lote diz o objetivo: com publicado ou Assunto no lote recebido, o dono quer melhorá-los, e a sobra sem encaixe fica em 'Keywords não agrupadas pela formação', com o motivo, sem virar artigo novo sozinha. Artigo novo com as sobras só pela ação explícita do dono 'Formar artigos novos com as sobras' (Arquiteto → Artigos, bloco 'Objetivo do lote'), revisável antes de confirmar. Em lote todo novo (sem publicado nem Assunto), as livres formam artigos novos. Um artigo por Assunto: a sustentação que não coube ou não converge com a Principal do artigo do Assunto volta a ser livre, é oferecida a publicados e Assuntos com vaga e, sem encaixe, fica em Keywords não agrupadas com o motivo; nunca vira um segundo artigo concorrente. A sustentação cujo Assunto ainda não tem Principal com Volume validado também é oferecida às âncoras antes de esperar. O artigo do Assunto sozinho aparece como 'Assunto · aguardando sustentação' (nunca 'sem convergência' ou 'Não aplicável'), e o Assunto com artigo sugerido pela formação leva o selo 'Assunto · artigo sugerido na formação, aguarda confirmação'. Intenção, funil ou SERP conclusiva divergentes impedem o agrupamento automático. Decisões humanas anteriores permanecem protegidas. URL, slug, canonical e principal publicados não mudam automaticamente.", "Silos novos e keywords livres permanecem propostas; papel Pilar/Suporte e troca de principal publicada não são presumidos.", "Assunto declarado: o tronco fica fora das seis keywords e do slug. Assunto com Volume validado é a principal do próprio artigo; sem Volume, as sustentações são agrupadas por semântica e intenção com Principal de Volume validado, e o Assunto sem sustentação aparece como 'Assunto · aguardando sustentação', estado normal. Sem Principal elegível, as sustentações aguardam visíveis em Keywords não agrupadas, com o motivo. Uma ação no Arquiteto prossegue pela SERP e materializa ArticleDNA após readback e gates; não pede seleção manual de keyword. Para SERP sem cache, o usuário autoriza o plano de custo uma vez por execução.", "A formação não cruza Silo sozinha: a sobra que reforçaria um publicado ou Assunto de outro Silo aparece como proposta em 'Reforçar publicado ou Assunto de outro Silo', com origem, destino e motivo; mover é decisão humana na tela (a mesma decisão de Silo da aba Silos, com releitura). O Assunto sem Volume também vira artigo: as livres que convergem com a frase dele formam o artigo, com Principal de Volume validado. Na fase de Silos, uma livre que converge com uma página publicada é atraída ao Silo dela, e a fronteira gravada como lista dos membros não conta como tema.", "Máximo de 6 keywords por artigo (1 principal + 5). O excedente é oferecido primeiro aos publicados e Assuntos com vaga; no modo melhorar fica em 'Keywords não agrupadas pela formação'; fora dele forma outro artigo só com fronteira própria (converge com outra busca e não pede o mesmo conteúdo do artigo de origem); o resto fica em 'Keywords não agrupadas pela formação', cada uma com o motivo. Nada some. A principal é dona do slug, do KGR (quando aplicado) e do H1. Falha no plano ou na coleta não conta como SERP concluída.", "KGR do artigo: padrão 'Não aplicável'. 'Aplicar KGR' (Sim/Não, padrão Não) é escolha humana em qualquer artigo, na Revisão, e pode ser trocada; KGR = allintitle da Principal ÷ volume, bom abaixo de 0,25; faixa de volume de interesse 150–550 só informativa; KGR não aplicável nunca bloqueia formação nem aprovação; com Sim e sem allintitle a conclusão espera a medição. Identidades antigas 'KGR pleno automático' são lidas como 'Sim · regra antiga' e só o humano troca."],
  },
  {
    id: "arquiteto.validate_serp",
    stage: "arquiteto",
    title: "Primeira coleta da SERP do lote e parecer por artigo",
    purpose: "Na aba Artigos, antes da formação, coletar as 4 lentes de todas as keywords COM VOLUME do lote (Silos em formação), cache primeiro (30 dias), e depois dar o parecer de cada artigo pelo cache; medir o allintitle da Principal de cada artigo.",
    requires: ["Keywords recebidas do Minerador (com ou sem SERP do Minerador)"],
    produces: ["SERP das 4 lentes no cache compartilhado para as keywords com volume", "Parecer de SERP por artigo e por silo", "Allintitle da Principal de cada artigo (base do KGR do artigo, quando aplicado)"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Artigos → Processar artigos: 1) primeira coleta da SERP do lote (plano de custo, uma confirmação; com tudo no cache segue direto); se algo foi pago, a formação é refeita e o próximo clique dá o parecer pelo cache, sem custo; 2) parecer SERP de cada artigo; 3) allintitle da Principal, uma consulta por artigo, com plano e confirmação. A notificação diz em português simples quantos artigos foram analisados (pelo cache ou pagos), o que foi gravado (só o parecer confirmado) e o que não foi, com o botão que grava: 'Reforçar publicados' para os publicados, 'Concluir formação' para os novos. Processar não grava keyword em artigo. Na Revisão do artigo: 'Medir allintitle (pago)' / 'Recalcular allintitle (pago)'.",
    routes: ["/api/arquiteto/serp", "/api/arquiteto/keyword-serp", "/api/arquiteto/territorial-serp", "/api/arquiteto/serp-resolution", "/api/arquiteto/article-allintitle"],
    notes: ["Keyword sem volume (Google Ads sem média ou zero) nunca é coletada: fica fora do lote, do plano e do parecer, onde aparece como não observada com o motivo, sem travar as lentes; a Principal continua sempre consultada.", "Keyword que chega sem SERP do Minerador é o caso normal: a primeira coleta é a do Arquiteto. Nunca 'só a lente principal' na primeira coleta. A cabeça da SiloPage com volume também entra na primeira coleta (ela não forma artigo, mas a SERP dela alimenta o 'mesmo assunto' e a SiloPage no Radar).", "Allintitle: reaproveita a medição do Arquiteto ou do Minerador de até 30 dias; Recalcular é pago e pede confirmação; o Arquiteto nunca escreve results_allintitle/kgr_score na linha do Minerador; custo estimado US$ 0,002 a 0,0035 por consulta. Principal sem volume não é medida (sem volume não há KGR): o servidor confere o volume da linha da marca e devolve lacuna, sem pagar. Item fora da etapa ou Principal fora do acervo vira lacuna e não derruba os outros artigos do bloco. Medir o allintitle sem 'Aplicar KGR' não abre versão nova do ArticleDNA.", "Fase Silos: 'Consultar nas 4 lentes' (keyword-serp) é ação manual e opcional e coleta só keywords com volume; a primeira coleta do fluxo é a da aba Artigos.", "Cache primeiro: SERP vigente (Minerador, Arquiteto ou Radar) produz o parecer sem custo. Toda keyword observada, inclusive artigo unitário, exige as quatro lentes: o parecer antigo de artigo unitário marcado 'sem par' fica incompleto, faltando lentes, e bloqueia a conclusão até as extras serem coletadas; o plano de custo mostrado ao dono diz isso. Coletar do provider é permitido quando a evidência não basta (lente faltando, composição nova, SERP vencida): o plano lista a keyword, a lente, o motivo e o custo, e o humano confirma. Recoletar com cache também é possível, com aviso e custo.", "Na formação, 'Cancelar pagamento · analisar com o cache (US$ 0)' cancela só o pagamento: os artigos com evidência completa no cache recebem parecer, e os que dependem de coleta ficam pendentes com o motivo, sem chamar o provider.", "Se o cache não puder ser lido, a coleta não fica proibida: o plano volta com o custo máximo (tudo como falta) e o aviso, e o humano escolhe coletar com esse teto ou 'Tentar ler o cache de novo'. Com o cache ilegível, a tela não oferece a análise só com cache (ela devolveria SERP_CACHE_UNAVAILABLE em cada bloco): as saídas são coletar com o custo máximo, tentar ler de novo ou cancelar sem pagar.", "Parecer com lente ausente permanece legível, mas bloqueia a conclusão e o envio ao Radar. Os contadores só dizem coletada (SERP paga nesta execução) ou reaproveitada (parecer feito só com o cache) depois do readback do parecer; SERP_PENDING conta os que ficaram sem parecer, cada um com o motivo. SERP_COLLECTED e SERP_REUSED contam pareceres de artigo confirmados no acervo, não entradas do cache por keyword. Os totais 'No cache' contam entradas pela metadata, não artigos validados.", "SERP conclusiva orienta a leitura competitiva; decisões humanas e identidades publicadas não são alteradas silenciosamente."],
  },
  {
    id: "arquiteto.serp_subject_dilemmas",
    stage: "arquiteto",
    title: "Reforçar publicados e Assuntos pela SERP (mesmo assunto no Google)",
    purpose: "Medir, pelo cache de SERP já pago, quais keywords do lote tratam do mesmo assunto que cada publicado e cada Assunto (páginas em comum no top 10, nas 4 lentes); reforçar, propor a troca da principal com Posto Livre e dizer, para cada um, o dilema e a ação.",
    requires: ["Keywords recebidas do Minerador", "SERP das keywords no cache (coleta do Arquiteto na aba Artigos, Minerador ou Radar)"],
    produces: ["Reforço dos publicados e sustentação dos Assuntos por SERP", "Proposta de troca da principal publicada (Posto Livre), pendente de decisão humana", "Propostas entre Silos", "Diagnóstico por publicado e por Assunto", "Sugestões de reforço com volume (Forte marcada, Provável desmarcada), aplicadas só por confirmação humana", "Oportunidades de artigo novo com as sobras, criadas só por confirmação humana"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Artigos → painel 'Mesmo assunto no Google · publicados e Assuntos': ao abrir a aba, a mesa lê a SERP do cache (sem custo; 'Reler o cache de SERP' relê) e mostra a tabela 'Reforçar publicados' (2026-09-28: uma tabela só, no lugar da grade de cartões), com a frase 'Reforço só vale com keywords do mesmo assunto no Google; keywords de volume alto de outro assunto viram artigo novo em Sobras.' e uma linha por publicado e Assunto, nas colunas 'Publicado ou Assunto', 'Principal atual' (com o volume e, no publicado com troca proposta, a caixinha 'Aceitar a troca'), 'Keywords sugeridas' (caixinha, nível, volume, páginas em comum e Silo de origem), 'Volume somado' (keywords e volume antes → depois) e 'Estado'. 'Ver a evidência' abre, na própria linha, o cartão com o estado — Reforçado, Troca proposta, Sugestões para confirmar, Par em outro Silo, Par em outro artigo, Par com intenção diferente, Par sem volume, Sem SERP no cache (vencida ou nunca coletada), Sem par no lote ou Tema sem demanda no Google — e o ato do dilema: 'Aplicar troca' / 'Manter', 'Trazer para este artigo', 'Abrir o artigo \"…\"' (o que ficou com o par, ou este, para liberar vaga), 'Buscar reforço', 'Coletar SERP (pago, com plano)' ou 'Coletar de novo (pago, com plano)'. A leitura do cache é reaproveitada na mesma sessão por 20 minutos com o mesmo conjunto de keywords. 'Ver a evidência' mostra as páginas em comum no top 10 e em que lente cada uma aparece; 'Aceitar em grupo' (abaixo da tabela) aplica as trocas e as mudanças de Silo marcadas, com confirmação e releitura (mudar de Silo grava só o Silo; para pôr a keyword no artigo publicado, a tabela 'Reforçar publicados', que já muda o Silo). O artigo selecionado na mesa mostra o mesmo cartão, com 'Sugestões de reforço' e 'Reforçar este publicado'. Na tabela, a Forte de QUALQUER Silo vem marcada (fora de outro artigo, até as vagas; a mudança de Silo aparece na confirmação), a Provável desmarcada, e cada keyword aparece num publicado só (o de mais páginas em comum; a linha do outro diz onde ela está). No publicado, 'Gravar reforços (N)' grava tudo o que está marcado, numa confirmação por artigo; no Assunto, 'Aplicar no Assunto (N)' abre a confirmação de 'Aplicar selecionadas'. Depois de gravar, a linha mostra 'Gravado e relido agora' e o total novo de keywords e o volume somado do ArticleDNA relido. Os publicados 'Sem par no lote' ficam na tabela; acima dela, uma linha com 'Buscar keywords para os publicados sem par (até US$ 1,00)', e o resultado cai na linha de cada publicado. As mensagens dizem o que foi gravado e o que não foi (mudar keyword de Silo grava só o Silo: ela ainda não está no artigo); abaixo do painel, 'Sobras · oportunidades de artigo novo' com 'Criar artigo novo com este grupo' e a sobra sem volume recolhida no fim.",
    routes: ["/api/arquiteto/serp-subject"],
    notes: [
      "Entre as que o Google junta (3+ páginas), entra primeiro a de maior volume (D1.3: a livre vai para onde agrega mais); com o mesmo volume, mais páginas em comum. Por isso a substituta de um Posto Livre (a de maior volume) já cabe no artigo; se mesmo assim ela ficar fora de um artigo cheio, a troca não é proposta (não caberia) e o cartão diz qual é a substituta e oferece 'Abrir este artigo para liberar uma vaga'.",
      "Par em outro artigo: o par real do publicado ou do Assunto está no mesmo Silo, mas já em outro artigo (em geral outro publicado que divide mais páginas com ele). O cartão NÃO diz 'sem par no lote': diz qual keyword, em que artigo, quantas páginas com cada lado, avisa quando os dois publicados disputam o mesmo assunto (canibalização) e oferece 'Abrir o artigo \"…\"' — lá, 'Mover para…' leva a keyword com prévia do efeito. Abrir não move nada; a decisão é do usuário.",
      "Mesmo assunto é o que a SERP diz: 3 ou mais páginas em comum no top 10 (união das 4 lentes) é forte; 2 é vizinhança e só vale com as palavras; 1 ou nenhuma, o Google diz que é outro assunto e a keyword não entra na formação, mesmo parecida nas palavras (a lista de sugestões ainda pode mostrar, desmarcada, a Provável por 3+ sites em comum; ver 'Sugestões de reforço'). Régua calibrada na leitura real de 2026-09-26. Sem SERP no cache de uma das duas, a formação volta às palavras e diz isso; ausência nunca vira zero.",
      "A leitura é só do cache e estreita: meta, as 10 URLs do digest e os domínios da observação (~1,5 KB por keyword × lente), em lotes de 100; o corpo da lente canônica não é lido (ela entra pelos domínios). A rota não paga, não coleta e não grava; o custo de leitura volta em 'egress'. Coletar SERP faltante é o caminho pago de 'Validar pela SERP', com plano e confirmação.",
      "A intenção que barra é a da SERP (D2.3): intenção ou funil OBSERVADOS na SERP (evidencia_serp conclusiva) diferentes barram quando o par divide 2 páginas ou menos (ou não tem SERP) — a revisão é humana no Minerador. D2.3.1 (2026-09-28): com 3 ou mais páginas em comum, as páginas vencem o rótulo e a intenção observada diferente vira só aviso; 'como atrair pacientes para clínica' (7 páginas com 'como atrair pacientes', 'como atrair pacientes para o consultório' e 'como atrair mais pacientes') recebe as três como sugestão Forte, com o aviso. A intenção ou o funil da Lógica, quando divergem e a SERP mede o par, viram só aviso ('Aviso: intenção da Lógica diferente …'): 'como atrair pacientes' (7 páginas em comum) reforça 'como atrair pacientes para clínica'. Sem SERP no cache para medir o par, a Lógica ainda segura a entrada automática.",
      "Volume primeiro (D2.3, 'se não tem volume, não presta'): keyword sem volume (Google Ads sem média e estimativa zero ou vazia) nunca é sugerida como reforço, sustentação ou nova principal; com a SERP da mesa lida, ela também não entra sozinha em artigo e fica nas sobras, recolhida em 'Sem volume'. O Assunto é a única exceção: ele é o tronco.",
      "Sugestões de reforço (D2.3): cada cartão de publicado e Assunto traz a lista 'Sugestões de reforço', ordenada por volume, só com volume, cada uma com nível, volume e motivo curto. Forte = 3+ páginas em comum no top 10 (vem marcada se couber: no Assunto, fora de artigo no mesmo Silo; no publicado, na tabela, também a de outro Silo fora de artigo); Provável = 2 páginas, ou 3+ sites em comum (sem rede social nem portal presente em mais de 15% das SERPs do lote), ou mesma entidade e mesmo problema no DNA, este só quando a SERP não mede o par (vem desmarcada). SERP que mediu 0 ou 1 página e menos de 3 sites em comum é outro assunto: não é sugestão. Par em outro Silo e keyword em outro artigo entram na mesma lista, desmarcados. 'Aplicar selecionadas' mostra a prévia (o que entra, o que sai de outro artigo, o que muda de Silo antes) e só grava depois da confirmação: entra no artigo pelo mesmo writer da formação (lock e releitura); o par de outro Silo muda de Silo pela decisão de Silo e depois aparece na lista para entrar. Teto de 6; publicada nunca entra em outro artigo; decisão humana de formação em outro artigo não é sugerida. O Assunto sem artigo ganha um artigo com as marcadas (principal = maior Volume validado; o Assunto fica como tronco). O estado 'Sugestões para confirmar' aparece quando o cartão não tem reforço nem troca e há sugestões.",
      "Sobras como oportunidades (D2.3): o painel 'Sobras · oportunidades de artigo novo' agrupa as sobras com volume por tema (SERP forte, ou 2 páginas com palavras em comum; sem SERP, só palavras), com o nome da keyword de maior volume, ordenados pelo volume somado, até 6 por grupo. 'Criar artigo novo com este grupo' é ação explícita: confirmação, gravação pelo writer da formação e releitura; a principal é a de maior volume. As sobras já marcadas como reforço Forte de um publicado ou Assunto ficam lá (o publicado vem antes). A sobra sem volume fica recolhida no fim, com a contagem. Os motivos das sobras são curtos, sem o rótulo da Lógica.",
      "Posto Travado ao slug: a principal fica, o artigo só recebe reforço, e nenhuma troca é proposta. Posto Livre: a principal está ali para ser trocada; o Arquiteto propõe a melhor substituta com Volume validado maior que o da atual, mesma intenção na SERP e páginas em comum com o artigo (3+ páginas, ou 2 páginas confirmadas pelas palavras). URL, slug, canonical e marca nunca mudam; a principal antiga vira secundária; a troca só vale por decisão humana, com nova versão do ArticleDNA e histórico. Posto não declarado em página publicada não libera nem bloqueia em silêncio: nada é proposto até o dono declarar — o Minerador mostra 'Travado ao slug' por padrão, mas padrão não é declaração; o cartão diz isso e mostra qual seria a troca se o dono declarasse 'Livre'. Posto Livre sem substituta aparece no título do cartão, com 'Buscar reforço'. A substituta pode vir do nível Forte (3+ páginas) ou Provável (só 2 páginas com palavras em comum), sempre com volume maior que o da atual: sites em comum ou o DNA sozinhos nunca propõem troca, e sem SERP no cache a troca é recusada. A Forte tem prioridade; a Provável só é proposta quando não há Forte, traz '(Provável)' no título do cartão e no 'Aceitar em grupo', vem com aviso ('Nível Provável … confira a evidência'), fica fora de 'Marcar todas as disponíveis' e aparece nas alternativas quando há Forte. Entre as substitutas válidas (2026-09-28), primeiro a que cabe no slug publicado (as palavras dela estão no slug: 'como atrair pacientes' em como-atrair-pacientes-para-clinica), depois Forte antes de Provável, depois mais páginas em comum, depois volume. A que troca a entidade do slug ('para o consultório' num slug '-para-clinica') não é proposta: aparece nas recusadas com o motivo. A âncora de outro publicado e a keyword que já mora em outro artigo (ArticleDNA ou formação humana) também são recusadas com o motivo. A sobra de OUTRO Silo que divide SERP Forte com a página entra como candidata; a mudança de Silo é anunciada na confirmação.",
      "Sem par no lote, a tela diz 'nenhuma keyword deste lote trata do mesmo assunto no Google'. Os publicados sem par viram uma linha só, com 'Buscar keywords para os publicados sem par' (a busca em lote do 'Reforçar publicados', até US$ 1,00 por rodada); para o Assunto, 'Buscar reforço': a Pesquisa por Assunto do Minerador com o tema e a página de destino. Se nem a busca achar demanda, 'tema sem demanda no Google' e a decisão fica com o dono. Nada de outro assunto é colado para encher o artigo.",
      "O par que está em outro Silo vira proposta em 'Reforçar publicado ou Assunto de outro Silo'; mover é decisão humana. Outra página publicada que divide a SERP aparece como possível canibalização: publicados nunca se fundem.",
      "Publicado é a PÁGINA (a keyword do Vínculo, com URL): quem entrou num artigo publicado pelo Reforçar é membro dele, não outro publicado — não ganha cartão de publicado, nem 'Reforçar este publicado', nem slug/canonical próprios (o perfil diz 'Slug do artigo publicado de \"…\"'). Depois da troca da principal, o artigo continua identificado pela página (o id do ArticleDNA é a keyword publicada original); a página fica secundária do próprio artigo sem conflito e o slug continua o dela.",
      "'Aplicar troca' grava uma nova versão do ArticleDNA do artigo publicado, em revisão, com a decisão (ator e hora), as candidatas e o histórico do Posto; a principal antiga fica como secundária, os reforços narrativos ficam onde estavam e URL, slug e canonical são copiados da versão atual. Com o Posto Livre, sem ArticleDNA do publicado (ou sem a substituta nele), 'Aplicar troca' abre a confirmação do 'Reforçar publicados' com a troca marcada: ele cria o ArticleDNA (ou a versão com a substituta) e aplica a troca na mesma confirmação — publicado nunca passa por 'Concluir formação'. Posto não declarado ou travado: o botão diz o que falta. Na hora de gravar, o Posto é relido do Minerador (não da memória da mesa): travado ou não declarado desde a leitura, nada é gravado. As métricas da principal (volume, KGR, estratégia de keywords) passam a ser as da nova; a identidade KGR confirmada volta a candidata. Sucesso só com a releitura. A aprovação da versão continua sendo a de sempre.",
      "'Manter' não grava versão (nova versão só com mudança real): a escolha fica neste navegador, por marca, e a sugestão volta se a substituta mudar. 'Rever a sugestão' desfaz.",
      "'Buscar reforço' abre a Pesquisa por Assunto do Minerador só com o id na URL: /{brandRef}/minerador/descobrir?modo=assunto&reforco=<id> para publicado (tema = principal publicada, página de destino = URL do artigo) e &assunto=<id> para Assunto (a mesma de 'Buscar sustentação'). Nada é pesquisado sozinho: o plano aparece antes (só Google Ads, sem custo no DataForSEO). A busca que já rodou é lida da lista local da Pesquisa por Assunto (só leitura): sem candidata com volume (média do Google Ads maior que zero; em buscas antigas também a estimativa DataForSEO, a mesma regra do Minerador), o cartão diz 'Tema sem demanda no Google'.",
    ],
  },
  {
    id: "arquiteto.published_differentiation_detect",
    stage: "arquiteto",
    title: "Publicados que disputam o mesmo assunto: detectar e montar a prévia",
    purpose: "Achar, pelo cache de SERP já pago, os publicados da marca que o Google trata como o mesmo assunto (canibalização) e montar a prévia da diferenciação: ângulo de cada página, chamadas, faixa de custo e hash.",
    requires: ["Páginas publicadas reconhecidas pelo Vínculo", "SERP dos publicados no cache (4 lentes)"],
    produces: ["Grupos de publicados por componente de pares Fortes (3+ páginas em comum), com os Prováveis anotados, o Posto, o volume e se a página ranqueia", "Prévia da rodada paga com teto de US$ 0,50 por grupo e hash"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["plan_published_differentiation"],
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Artigos → painel 'Publicados que disputam o mesmo assunto': uma linha por grupo, com os publicados, as páginas em comum, o Posto de cada um e a posição de quem ranqueia; marque os grupos e use 'Planejar diferenciação (grátis)' para ver o ângulo de cada página e a faixa de custo antes de qualquer chamada. A opção 'Pedir ângulos à IA (menor autoridade)' é desmarcada por padrão.",
    routes: ["/api/arquiteto/cannibalization/plan"],
    notes: [
      "Mesmo assunto é a régua D2.2: Forte = 3 ou mais páginas em comum no top 10 (união das 4 lentes), lida do cache; Provável = 2 páginas confirmadas pelas palavras (a régua da troca, D2.1). O grupo é o componente conexo dos pares Fortes; os Prováveis ficam anotados e não formam grupo. Publicado sem SERP no cache fica de fora, com o motivo (ausência nunca vira zero).",
      "Ângulos, na ordem de autoridade: o que já separa os slugs (as palavras que só aquela página tem), o DNA (entidade e problema), o Google Ads na rodada (sementes do ângulo e a URL da página como semente, grátis) e, por último, a IA — opcional, a menor autoridade; nada dela vale sem volume e SERP. Pelo MCP a prévia sai sem a IA da plataforma.",
      "'Página que ranqueia' é a URL do próprio publicado no top 10 de alguma lente, com a posição; sem a URL no Vínculo, qualquer página do site conta. Ela nunca troca a principal (Q3): só entram secundárias. Posto Travado ao slug também só recebe secundárias, com o aviso de que a diferenciação fica mais fraca.",
      "Custo da prévia: só a SERP de até 5 candidatas por página nas 4 lentes (até US$ 0,014 cada; par: US$ 0,00 a 0,14). As keywords novas vêm do Google Ads (frase do ângulo e URL como semente), grátis. Teto de US$ 0,50 por grupo, aplicado no servidor: acima dele o plano corta candidatas na SERP (5 → 3 → 2) e, por fim, as últimas páginas do grupo; a prévia diz cada corte. Cache válido não cobra.",
      "A prévia fica gravada na proposta do grupo (editorial_workflow_items, subject_type differentiation_proposal, estágio architect). 'Manter como está' (com confirmação) tira o grupo do painel até a SERP dele mudar.",
      "A prévia nunca apaga uma rodada paga nem desfaz 'Manter como está': grupo mantido com a mesma SERP é recusado (DIFFERENTIATION_GROUP_KEPT) e grupo com avaliação gravada também (DIFFERENTIATION_EVALUATION_PENDING). Na tela, 'Planejar diferenciação' reabre o resultado gravado sem cobrar; só 'Planejar nova rodada' substitui a avaliação, que vai ao histórico da proposta. Pelo MCP, a prévia é recusada nesses casos.",
    ],
  },
  {
    id: "arquiteto.published_differentiation",
    stage: "arquiteto",
    title: "Diferenciar publicados que disputam o mesmo assunto (buscar keywords e aceitar)",
    purpose: "Dar a cada publicado do grupo um ângulo próprio, sem mudar endereço: buscar keywords com volume que caibam no slug, validar pela SERP que elas separam as páginas, e aplicar por decisão humana.",
    requires: ["Prévia do grupo montada (hash e custo)", "Confirmação humana do custo da rodada"],
    produces: ["Avaliação por página: principal nova (só Posto Livre, sem ranquear, com volume do Google Ads maior), 1 ou 2 secundárias com volume, páginas em comum antes e depois, custo gasto", "Estado do grupo: Diferenciado, Diferenciação fraca (com o motivo) ou Sem saída pelo provider", "Nova versão do ArticleDNA de cada página aceita, em revisão, com a nota de diferenciação, os assuntos excluídos e o link sugerido entre as irmãs"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Artigos → 'Publicados que disputam o mesmo assunto' → marcar os grupos → 'Planejar diferenciação (grátis)' → 'Buscar e validar (US$ x a y)', com uma confirmação para todos os grupos marcados e o progresso de cada um → a proposta por página (ângulo, principal nova, secundárias com volume, páginas em comum com as irmãs antes → depois, estado e motivo; 'Incluir no aceite' por página) → 'Aceitar grupo' (confirmação e releitura) ou 'Manter como está' (confirmação). Depois do aceite, 'Enviar ao Minerador' leva as keywords novas ao Processador, 'Colocar no artigo' grava as que já estão no Minerador pela formação e 'Aceitar de novo' completa a troca com a mesma avaliação. Um grupo já avaliado reabre o resultado sem cobrar; 'Planejar nova rodada' prepara outra rodada paga.",
    routes: ["/api/arquiteto/cannibalization/run", "/api/arquiteto/cannibalization/apply"],
    notes: [
      "A rodada exige o hash da prévia e o custo autorizado; o servidor confere o hash gravado e o teto do grupo, relê os publicados e a SERP deles (se um saiu ou o grupo mudou, nada é pago) e reserva a proposta antes de pagar (trava por lock_version). A prévia vale UMA rodada: outra rodada na mesma prévia, de outra aba ou outro membro, é recusada sem pagar (DIFFERENTIATION_ALREADY_RUN ou OPERATION_IN_PROGRESS); a MESMA rodada repetida (mesmo operationRequestId, quando a resposta se perdeu) devolve o resultado gravado sem pagar, e o ledger também barra a repetição quando a capability dele está ativa. Rodar de novo exige 'Planejar nova rodada'. Usa as mesmas portas da Pesquisa por Assunto (ideias do Google Ads grátis; SERP com cache primeiro e só as lentes que faltam; ledger), registrado como módulo arquiteto. O volume do Google Ads é grátis e não é gravado no Minerador. Uma prévia de antes de 2026-09-28 é recusada com DIFFERENTIATION_PLAN_OUTDATED, sem pagar; basta planejar de novo.",
      "Filtro (D2.3): só candidata com volume (média do Google Ads; em rodadas antigas também a estimativa DataForSEO maior que zero). A semente por URL não conta como 'a URL já ranqueia'; nunca a própria keyword, outra publicada da marca ou o ângulo de uma irmã. Ela precisa caber no slug: dividir a entidade central dele (ex.: 'clínica de estética' ou 'estética') ou 2 ou mais páginas com a principal atual.",
      "Validação pela SERP: vão à SERP as melhores de cada página (até 5, por volume). Separação: a keyword proposta para uma página divide no máximo 1 página do top 10 com cada irmã — a principal que a irmã mantém (Travado, ranqueando, sem Posto ou Livre sem troca) mais as propostas dela. Encaixe: divide 2 ou mais páginas com a própria página (principal atual, keywords em que a URL já ranqueia ou as outras escolhidas). A principal nova passa pela régua da troca (volume do Google Ads maior, mesma intenção, SERP em comum). Teto de 6 keywords por artigo.",
      "'Diferenciação fraca' mostra a melhor candidata que cabe no slug só como evidência: ela não separa as páginas e nunca entra no aceite. 'Aceitar grupo' leva, por padrão, só as páginas 'Diferenciado'; página fraca ou sem saída entra só se a pessoa a marcar ('Incluir no aceite') e recebe só a nota do ângulo, sem keyword.",
      "'Aceitar grupo' exige o hash da avaliação e grava, em cada página com ArticleDNA, uma versão nova em revisão pelo writer canônico, com ator e histórico: em excludedSubjects o ângulo das irmãs; em differentiation a nota 'Diferenciação: …' (desce ao Redator nos fundamentos e nas linhas de editorialContext do envio do Radar); em internalLinks o 'Link interno sugerido' para cada irmã; em nearbyArticleIds as irmãs. A troca da principal só é gravada quando a nova já está no ArticleDNA, o Posto relido agora é Livre e a página não ranqueia na SERP relida agora do cache (Q3); a antiga vira secundária. URL, slug, canonical e marca nunca mudam; nada é apagado, redirecionado ou fundido. A nota chega ao Redator quando a versão nova do ArticleDNA for aprovada e o Radar enviar o artigo de novo.",
      "Keyword nova que ainda não está no Minerador volta como passo seguinte: vai ao Processador pela importação da Pesquisa por Assunto (tema = a principal publicada), o Minerador mede e aprova, e depois ela entra no artigo pela formação. 'Aceitar de novo' (a mesma avaliação, sem nova rodada paga) completa a troca. Sem ArticleDNA, a página pede 'Reforçar publicados' antes (ele cria o primeiro ArticleDNA do publicado; publicado nunca passa por 'Concluir formação').",
      "Esta operação não é ferramenta MCP: pagar e aplicar são atos humanos na tela. A IA conectada detecta e monta a prévia (plan_published_differentiation) e mostra o custo ao usuário.",
    ],
  },
  {
    id: "arquiteto.published_reinforcement_preview",
    stage: "arquiteto",
    title: "Reforçar publicados: prévia do que será gravado",
    purpose: "Mostrar, por página publicada e sem gravar, o que a confirmação 'Reforçar publicados' grava: o primeiro ArticleDNA do publicado (ou a versão nova), as keywords que entram, as novas que passam pelo Minerador, a troca aceita e o que fica de fora, com o motivo.",
    requires: ["Páginas publicadas reconhecidas pelo Vínculo", "Keyword publicada recebida no Arquiteto, com Silo confirmado"],
    produces: ["Plano por página com decisionHash e as frases da confirmação"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["preview_published_reinforcement"],
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Artigos → painel 'Mesmo assunto no Google' → tabela 'Reforçar publicados' → 'Gravar reforços (N)': a confirmação lista, por página, o que será gravado, a mudança de Silo e o total depois.",
    routes: [],
    notes: [
      "A prévia relê tudo no servidor (publicados, Posto, itens de workflow, ArticleDNA, cache de SERP e o resultado gravado da busca em lote) e não grava nada. O decisionHash muda quando o estado muda: a confirmação exige o mesmo hash.",
      "Cada keyword pedida é conferida de novo: publicada nunca entra em outro artigo; sem volume do Google Ads não entra; em outro artigo por decisão humana não sai de lá; o Google precisa juntar (3+ páginas = Forte, 2 páginas = Provável, ou 3+ sites) e a intenção observada só barra abaixo de 3 páginas. Teto de 6.",
    ],
  },
  {
    id: "arquiteto.published_reinforcement",
    stage: "arquiteto",
    title: "Reforçar publicados (gravar numa confirmação só)",
    purpose: "Efetivar o reforço dos artigos publicados: numa confirmação humana, gravar o ArticleDNA do publicado (o primeiro, quando ainda não existe), a composição do artigo, a troca da principal aceita e as keywords novas escolhidas, com releitura de cada passo.",
    requires: ["Prévia do 'Reforçar publicados' (decisionHash)", "Keyword publicada recebida no Arquiteto, com Silo confirmado", "Para gravar o ArticleDNA: o parecer da SERP DESTA composição (as mesmas keywords, a mesma principal e os mesmos papéis nas keywords consultadas, com as 4 lentes e ainda vigente), gravado pelo 'Processar artigos'", "Para keyword nova: o resultado gravado da busca em lote e o aceite de que o usuário a aprova no Minerador"],
    produces: ["ArticleDNA do publicado aprovado (v1 ou versão nova), com URL, slug, canonical e marca do site", "Composição do artigo no item de workflow (decisão humana 'move', mesmo writer da mesa), com a mudança de Silo quando preciso", "Keywords novas importadas, com Lógica, Volume do Google Ads, aprovadas e enviadas ao Arquiteto"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Artigos → painel 'Mesmo assunto no Google' → tabela 'Reforçar publicados': conferir as caixinhas de cada linha (a Forte de qualquer Silo já vem marcada; a Provável, desmarcada; as keywords da busca em lote entram na linha do publicado) e, se for o caso, 'Aceitar a troca' na coluna 'Principal atual' → 'Gravar reforços (N)' acima da tabela, ou 'Reforçar este publicado' no cartão da Revisão do artigo ('Aplicar troca' num publicado sem ArticleDNA, em 'Ver a evidência', abre a mesma confirmação com a troca marcada) → a confirmação lista, por página, o ArticleDNA (novo ou versão), a troca ('Aceitar a troca'), os reforços e as keywords novas; com keyword nova, marcar 'Eu aprovo estas keywords novas no Minerador.' → 'Gravar e reler (N)'. Custo para gravar: zero. O resultado diz o que foi gravado e o que não foi; na tabela, a linha gravada mostra 'Gravado e relido agora' e o total novo (keywords e volume somado) do ArticleDNA relido.",
    routes: ["/api/arquiteto/published-reinforcement"],
    notes: [
      "Publicado nunca passa por 'Concluir formação' (que recusa candidato sem slug): o 'Reforçar publicados' cria o primeiro ArticleDNA pelo mesmo construtor determinístico com a identidade publicada (articleId = a keyword publicada) e a guarda do publicado, que trava slug, marca, canonical e principal nos valores do site. O pai é o território do publicado (sem Silo canônico ainda, siloId nulo). Status aprovado: a confirmação é a aprovação humana do artigo — arquitetura confirmada por humano e a evidência SERP do artigo (o parecer do 'Processar artigos'); o servidor revalida com a mesma portaria da rota de artefatos antes de gravar. O Posto do publicado (Livre/Travado) não muda. O suggestedSlug é o último segmento da URL publicada.",
      "O parecer que vai no ArticleDNA aprovado é o que DESCREVE a composição gravada (mesmas keywords e mesma principal, depois da troca): o da formação humana do publicado ou o do candidato da página no Silo dela (2026-09-28). Quando a composição muda (reforços, keywords novas, troca) e ainda não há parecer dela, a confirmação grava a mesa (Minerador, composição, Silo e os papéis da troca) e o ArticleDNA fica para depois: o desfecho diz 'O ArticleDNA ainda não foi gravado' e o próximo passo — 'Processar artigos' para o artigo (cache primeiro: sem custo quando as 4 lentes estão no cache) e usar 'Gravar reforços' de novo. A segunda confirmação grava o ArticleDNA com os membros já na composição e aplica a troca decidida, pela mesma régua relida (a linha diz 'Troca que você confirmou na confirmação anterior do Reforçar'). Só a troca gravada PELO Reforçar (com o marcador próprio na decisão da mesa) vira troca na confirmação seguinte; uma formação da Revisão humana com outra principal continua recusada com 'confirme a composição na mesa antes'. A mesa reconhece essa troca gravada: a página fica secundária sem o conflito 'publicada e não é a principal'. Sem parecer e sem nada a gravar na mesa, a página é recusada na prévia com esse caminho. Na tabela, a linha nesse estado diz 'Mesa gravada · falta o ArticleDNA' (aviso, com o próximo passo), não conta em 'Gravar reforços (N)' e continua em 'Pedem decisão'; a mesa é relida depois de qualquer gravação, inclusive só da mesa.",
      "ArticleDNA aprovado com o parecer de outra composição (o que a gravação de 2026-09-28 fez em 2 artigos): a prévia diz isso; se a mesa estiver desalinhada da troca já confirmada (a página como principal), a confirmação alinha os papéis na mesa (nova principal 'principal', página 'secundária'); depois do 'Processar artigos', a nova versão leva só o parecer certo ('nova versão só para levar o parecer da SERP desta composição'). Nenhuma keyword sai; a troca confirmada é preservada.",
      "Ordem, parando no primeiro erro com o motivo: keywords novas (import da Pesquisa por Assunto com o tema = a principal publicada → Lógica → Volume do Google Ads → aprovação humana → envio ao Arquiteto) → composição e Silo no item de workflow (a mesma rota da mesa, com lock) → ArticleDNA pelo writer canônico. Cada passo confirma pela releitura; sucesso só com a releitura. Nova tentativa: nova prévia (os passos já feitos ficam como 'já estava').",
      "Keyword nova só entra com volume do Google Ads medido agora; a que voltar sem volume fica de fora, com o motivo. Aprovar exige só Lógica e Volume (SERP e KGR opcionais, SDD 2026-09-28).",
      "Uma keyword vai para UM artigo só: marcada em dois publicados, ela entra só no de mais páginas em comum (a que já é membro da formação ou a substituta da troca aceita vence) e sai dos outros, com a frase dizendo onde entrou; a confirmação segue com os demais. Keyword que já está no ArticleDNA de outro artigo, formação gravada com outra principal decidida por humano, ou keyword do Minerador em outro estado no Arquiteto são recusadas com o motivo. Papel humano de reforço narrativo é preservado; quem já estava no artigo não muda de Silo.",
      "O desfecho diz o que foi gravado e o que não foi: numa parada, o que já ficou gravado no publicado que falhou (Minerador, composição) e, pelo nome, os publicados que nem foram tentados; keyword nova sem volume fica no Minerador, fora do artigo, e é dita. A frase ao lado de 'Gravar reforços' conta os artigos com algo a gravar, as keywords que entram, as trocas e quem ganha o primeiro ArticleDNA; o filtro 'Pedem decisão' mostra o que falta gravar, as linhas com sugestão e as gravadas agora.",
      "Troca da principal só com Posto Livre relido, página que não ranqueia (SERP relida do cache) e a substituta dentro do artigo; a antiga vira secundária, e a mesa grava os mesmos papéis (nova principal 'principal', página 'secundária'). A régua é a da mesa: a substituta que troca a entidade do slug (só o último segmento da URL conta como slug; a pasta do Silo não), ou que já mora em outro artigo, é recusada com o motivo. Troca JÁ confirmada cuja principal contradiz o slug (a de 2026-09-28: 'para o consultório' em /como-atrair-pacientes-para-clinica): o cartão avisa em tom de aviso (nunca 'Troca aplicada' em verde), a mesa NÃO é alinhada a ela, e uma nova troca para a que cabe no slug pode ser aceita ('Aceitar a troca', desmarcada por padrão): a principal errada vira secundária e a página segue sendo o artigo. Posto Travado só recebe secundárias. Nenhuma keyword some: o que o ArticleDNA já tem continua lá.",
      "'Gravar reforços' manda à prévia todos os publicados da tabela (até 30 por confirmação; primeiro os que têm algo marcado ou ainda não têm ArticleDNA), inclusive os já gravados sem nada marcado: o servidor é quem sabe se falta algo neles (alinhar na mesa a troca já confirmada, nova versão só com o parecer da SERP da composição, ou a recusa com o caminho 'Processar artigos'). A confirmação lista os que mudam e agrupa numa linha os 'Sem mudança (N)'.",
      "Não é ferramenta MCP: gravar é ato humano na tela. A IA conectada mostra a prévia (preview_published_reinforcement).",
    ],
  },
  {
    id: "arquiteto.published_reinforcement_search",
    stage: "arquiteto",
    title: "Buscar keywords para os publicados sem par (em lote, até US$ 1,00)",
    purpose: "Para os publicados sem keyword do mesmo assunto no lote, trazer keywords com volume do Google Ads (URL e tema da página como semente, grátis) e validar as melhores pela SERP nas 4 lentes (pago, cache primeiro), numa rodada com teto de US$ 1,00.",
    requires: ["Publicados 'Sem par no lote' na mesa", "Confirmação humana do custo da rodada"],
    produces: ["Sugestões por publicado: Forte (3+ páginas em comum) ou Provável (2 páginas com palavras), com volume do Google Ads, no cartão", "Os publicados que disputam o mesmo assunto entre si vão ao painel da diferenciação"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Artigos → painel 'Mesmo assunto no Google' → linha 'Sem par no lote' → 'Buscar keywords para os publicados sem par (até US$ 1,00)' → a prévia mostra os publicados, a faixa de custo e o teto de US$ 1,00 → uma confirmação ('Confirmar US$ x a y'; 'Cancelar (nada é pago)') → as sugestões caem na tabela 'Reforçar publicados', na linha de cada publicado (Forte marcada, Provável desmarcada, 'busca em lote' e 'nova no Minerador' no detalhe); quem ficou sem sugestão mostra o motivo na própria linha (erro do Google Ads em tom de aviso). 'Nova busca (outra rodada paga, com prévia)' pede outra rodada. Para gravar, 'Gravar reforços'.",
    routes: ["/api/arquiteto/published-reinforcement/search/plan", "/api/arquiteto/published-reinforcement/search/run"],
    notes: [
      "O MESMO núcleo da diferenciação: ideias do Google Ads (grátis), métricas históricas do Google Ads (grátis), SERP do DataForSEO só das melhores candidatas (até 5 por página, nas 4 lentes, até US$ 0,014 cada), cache primeiro, ledger e trava por operação; a prévia vale uma rodada (a mesma rodada repetida devolve o resultado gravado, sem pagar).",
      "Teto de US$ 1,00 por rodada, conferido no servidor: acima dele o plano corta candidatas (5 → 3 → 2) e, por fim, as últimas páginas. 14 publicados × 5 candidatas cabem sem corte (até US$ 0,98).",
      "Dois modos por grupo: publicados que disputam o mesmo assunto entre si (3+ páginas em comum) seguem pela diferenciação e saem da busca; os demais seguem a regra de reforço. Cada candidata vai para UM publicado só (o que divide mais páginas com ela).",
      "Só keyword com volume do Google Ads; publicada da marca nunca é candidata. Nada é gravado no artigo: as sugestões vão à linha do publicado na tabela (e o cartão, em 'Ver a evidência', passa a dizer 'A busca em lote achou N keywords…' e perde o 'Buscar reforço'), e entrar é o 'Gravar reforços'.",
      "Rodada paga que para no meio: a mesma prévia não roda de novo com outro id (o teto vale por rodada); a próxima rodada exige prévia nova e nova confirmação, e o que já foi coletado está no cache e não é pago de novo.",
      "Cada publicado sem sugestão diz o porquê, pelo funil gravado na rodada (ideias recebidas por semente, iguais à própria frase, já publicadas, sem volume, cortadas, mandadas à SERP, e o texto das primeiras ideias): 'o Google Ads devolveu só a própria frase (N ideias em N buscas)' com o próximo passo ('Buscar reforço' com um tema mais amplo), 'trouxe N keywords novas: N sem volume' ou, só quando a SERP mediu alguma candidata, 'o Google trata como outro assunto'. Erro do Google Ads é erro: todas as sementes de uma página falhando viram 'Erro do Google Ads: <motivo>' naquela página; todas as páginas falhando viram erro da rodada (503, com o motivo), nunca 'nada achado'. Em 2026-09-28 o Google Ads respondeu com sucesso, mas só com a própria frase (1 ideia por semente).",
    ],
  },
  {
    id: "arquiteto.review_ai",
    stage: "arquiteto",
    title: "Revisar com IA",
    purpose: "Apoio semântico sobre a proposta, carregado com as diretrizes de SEO. Não decide.",
    requires: ["Proposta formada"],
    produces: ["Sugestões registradas na cópia de trabalho"],
    cost: "paid_ai",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Revisar com IA.",
    routes: ["/api/arquiteto/territorial-ai"],
  },
  {
    id: "arquiteto.confirm_architecture",
    stage: "arquiteto",
    title: "Confirmar propostas novas de arquitetura (ArticleDNA, SiloDNA e SiloPage)",
    purpose: "Revisar e aprovar a arquitetura nova ou alterada; publicados declarados já foram reconhecidos no processamento.",
    requires: ["Proposta revisada"],
    produces: ["ArticleDNA, SiloDNA e SiloPage aprovados"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Silos → Confirmar propostas novas; a formação canônica do Silo e da SiloPage segue depois dos Artigos.",
    routes: [
      "/api/arquiteto/article-dna",
      "/api/arquiteto/silo-dna",
      "/api/arquiteto/silo-page",
      "/api/arquiteto/silo-review",
      "/api/arquiteto/silo-consolidation",
    ],
    notes: ["A página do silo precisa de keyword própria e slug: é uma página publicável, não só um agrupador."],
  },
  {
    id: "arquiteto.internal_links",
    stage: "arquiteto",
    title: "Links internos (InternalLinkGraph)",
    purpose: "Planejar os links entre artigos e a página do silo, com âncoras.",
    requires: ["Silo e artigos confirmados"],
    produces: ["InternalLinkGraph aprovado"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Links internos → revisar propostas e âncoras → Aprovar grafo.",
    routes: [
      "/api/arquiteto/internal-link-graph",
      "/api/arquiteto/internal-link-graph/anchors",
      "/api/arquiteto/internal-link-graph/proposals",
      "/api/arquiteto/internal-link-graph/working-copy",
    ],
  },
  {
    id: "arquiteto.verify_published",
    stage: "arquiteto",
    title: "Conferir página publicada",
    purpose: "Confirmar URL, canonical e identidade de um artigo já no ar. Publicado fica protegido.",
    requires: ["Artigo com URL publicada"],
    produces: ["Identidade publicada verificada"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → artigo publicado → Conferir publicação.",
    routes: ["/api/arquiteto/publication/verify"],
  },
  {
    id: "arquiteto.send_to_radar",
    stage: "arquiteto",
    title: "Enviar artigos ao Radar",
    purpose: "Transferir artigos confirmados para a investigação.",
    requires: ["ArticleDNA aprovado"],
    produces: ["Artigo no Radar, aguardando investigação"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → selecionar artigos confirmados → Enviar ao Radar.",
    routes: ["/api/editorial/workflow"],
    notes: ["O envio exige a permissão de aprovar no Arquiteto; por isso fica na tela."],
  },

  /* -------------------------------- Radar ------------------------------- */
  {
    id: "radar.investigate",
    stage: "radar",
    title: "Investigar o artigo",
    purpose: "Pesquisa (SERP, concorrentes, estrutura, perguntas, fontes), Vídeos, Especialista e Relatório, em torno da principal e do Assunto.",
    requires: ["Artigo recebido do Arquiteto"],
    produces: ["Evidências e dossiê do artigo"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "radar",
    howOnScreen: "Radar → abrir o artigo → Pesquisa, Vídeos, Especialista e Relatório.",
    routes: [
      "/api/editorial/radar-analysis",
      "/api/editorial/radar-analysis/extract",
      "/api/editorial/radar-analysis/verify-sources",
      "/api/editorial/radar-research-part",
      "/api/editorial/radar-topics",
      "/api/editorial/radar-amazon-search",
      "/api/editorial/radar-youtube-search",
      "/api/editorial/radar-video-library",
      "/api/editorial/radar-video-matching",
      "/api/editorial/radar-video-media",
      "/api/editorial/radar-video-metadata",
      "/api/editorial/radar-video-sources",
      "/api/editorial/radar-video-text",
      "/api/editorial/radar-worker-status",
      "/api/editorial/serp",
    ],
    notes: [
      "O Radar não reagrupa keywords, não troca a principal e não troca o Assunto: diverge e devolve ao Arquiteto.",
      "A SERP do Google no Radar é lida primeiro do cache compartilhado (4 lentes, validade de 30 dias). A coleta feita pelo Arquiteto na aba Artigos é reaproveitada sem custo; só a lente faltante ou vencida é paga, e 'Recoletar agora (pago)' continua exigindo confirmação.",
      "Keyword secundária ou de reforço sem volume de busca não gera consulta auxiliar: fica como 'Somente contexto', com o motivo. A principal é sempre consultada.",
      "YouTube (artigo que vira vídeo) e Amazon (artigo que vira review) acrescentam fontes e nunca substituem nem apagam a SERP do Google. Com o Google finalizado, o pacote enviado ao Planejador ou ao Redator leva o Google como apoio, com a fotografia congelada (observed e lentes), e o YouTube ou a Amazon como investigação primária.",
      "No Radar, o rótulo do KGR é 'KGR não aplicável' quando o artigo não aplica KGR (o padrão).",
    ],
  },
  {
    id: "radar.expert",
    stage: "radar",
    title: "Especialista (E-E-A-T)",
    purpose: "Pedir e revisar a contribuição de um especialista humano para dar autoridade ao artigo.",
    requires: ["Artigo em investigação"],
    produces: ["Contribuição do especialista revisada"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "radar",
    howOnScreen: "Radar → artigo → Especialista.",
    routes: [
      "/api/editorial/expert-briefs",
      "/api/editorial/expert-briefs/send",
      "/api/editorial/expert-consultations",
      "/api/editorial/expert-contributions/review",
    ],
  },
  {
    id: "radar.finalize",
    stage: "radar",
    title: "Finalizar a investigação",
    purpose: "Encerrar a investigação e congelar o pacote de evidências.",
    requires: ["Investigação com evidência suficiente"],
    produces: ["Pacote do Radar finalizado"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "radar",
    howOnScreen: "Radar → artigo → Finalizar investigação (ou Aprovar selecionadas, em lote).",
    routes: [],
  },
  {
    id: "radar.send_to_writer",
    stage: "radar",
    title: "Enviar ao Redator",
    purpose: "Criar o documento do Redator a partir do pacote finalizado, com o dossiê inteiro.",
    requires: ["Pacote do Radar finalizado"],
    produces: ["ContentDocument em 'planejado' no Redator"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["send_radar_to_writer"],
    screen: "radar",
    howOnScreen: "Radar → artigo finalizado → Enviar ao Redator (individual ou em lote).",
    routes: ["/api/editorial/radar-writer-handoff"],
    notes: ["Idempotente: repetir devolve o documento existente. Documento existente com outro pacote nunca é sobrescrito."],
  },
  {
    id: "radar.export_for_writing",
    stage: "radar",
    title: "Exportar 'Para escrever' (CSV/markdown)",
    purpose: "Levar o dossiê do artigo para escrever fora da plataforma.",
    requires: ["Pacote do Radar finalizado"],
    produces: ["Arquivo portátil com keywords, SERP, estrutura, Assunto e links"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "radar",
    howOnScreen: "Radar → Exportar → Para escrever.",
    routes: ["/api/editorial/radar-export"],
    notes: ["Pelo MCP, o mesmo conteúdo chega pelas ferramentas de evidência do Redator: não precisa do arquivo."],
  },

  /* ------------------------------- Redator ------------------------------ */
  {
    id: "redator.read_evidence",
    stage: "redator",
    title: "Ler o dossiê do artigo",
    purpose: "Ler o que o Radar juntou, na ordem: manifesto → fundamentos → fatias da seção que está escrevendo.",
    requires: ["Documento no Redator"],
    produces: ["Base para escrever, dentro ou fora da plataforma"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: [
      "get_writer_connection_profile",
      "list_writer_documents",
      "get_writer_document",
      "get_writer_brief",
      "get_writer_evidence_manifest",
      "get_writer_foundations",
      "read_writer_evidence",
      "get_writer_deliverables",
    ],
    screen: "redator",
    howOnScreen: "Redator → documento → Rascunhos e fundamentos.",
    routes: ["/api/editorial/documents", "/api/redator/seed"],
  },
  {
    id: "redator.write_draft",
    stage: "redator",
    title: "Escrever o rascunho",
    purpose: "Salvar os blocos do artigo, roteiros e carrosséis como rascunho, com lock e readback.",
    requires: ["Documento lido (lockVersion atual)"],
    produces: ["Rascunho salvo"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["save_writer_draft", "save_writer_deliverable", "record_writer_divergence"],
    screen: "redator",
    howOnScreen: "Redator → documento → editor.",
    routes: ["/api/redator/section", "/api/redator/improve", "/api/redator/deliverables"],
    notes: ["Divergência com um DNA se registra (record_writer_divergence); nunca se contraria o DNA em silêncio."],
  },
  {
    id: "redator.media",
    stage: "redator",
    title: "Mídia do artigo",
    purpose: "Registrar prompts visuais (uma capa e dois ou três respiros) e anexar imagens realmente geradas.",
    requires: ["Documento no Redator"],
    produces: ["Briefings de imagem e imagens anexadas"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["register_media_brief", "attach_media_asset"],
    screen: "redator",
    howOnScreen: "Redator → documento → Mídia.",
    routes: ["/api/redator/media-anchor", "/api/redator/media-upload"],
  },
  {
    id: "redator.guardian",
    stage: "redator",
    title: "Conferir com o Guardião",
    purpose: "Análise determinística do rascunho: cobertura, virada para o Assunto, links, fontes. Não aprova.",
    requires: ["Rascunho"],
    produces: ["Achados do Guardião"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["get_writer_guardian"],
    screen: "redator",
    howOnScreen: "Redator → documento → Guardião.",
    routes: ["/api/redator/guardian"],
  },
  {
    id: "redator.approve",
    stage: "redator",
    title: "Aprovar o documento",
    purpose: "Aprovação final do texto, bloqueada por achado crítico do Guardião ou pendência bloqueante do Radar.",
    requires: ["Rascunho sem bloqueio"],
    produces: ["Documento aprovado, pronto para Publicações"],
    cost: "free",
    decision: "human",
    access: "tool",
    chatConfirmationRequired: true,
    tools: ["finalize_writer_document"],
    screen: "redator",
    howOnScreen: "Redator → documento → Aprovar para Publicações; pelo MCP, prévia do Guardião → aceite explícito no chat → aplicar.",
    routes: ["/api/editorial/documents", "/api/redator/publication-handoff"],
  },

  /* ----------------------------- Publicações ---------------------------- */
  {
    id: "publicacoes.register",
    stage: "publicacoes",
    title: "Registrar publicação",
    purpose: "Registrar destino, URL e estado de publicação do documento aprovado.",
    requires: ["Documento aprovado"],
    produces: ["PublicationRecord"],
    cost: "free",
    decision: "human",
    access: "tool",
    chatConfirmationRequired: true,
    tools: ["send_writer_to_publications"],
    screen: "publicacoes",
    howOnScreen: "Redator → documento aprovado → enviar a Publicações; pelo MCP, prévia → aceite explícito → criar PublicationRecord interno.",
    routes: ["/api/redator/publication-handoff", "/api/publicacoes"],
    notes: ["Cria o registro interno. Não publica URL, altera slug nem muda canonical."],
  },
] as const;

/* ======================================================================= */
/*                   FERRAMENTAS QUE NÃO SÃO DE UMA ETAPA                  */
/* ======================================================================= */

/**
 * Ferramentas transversais: servem para a IA se orientar, não executam etapa.
 * Estão aqui para o teste de sincronia saber que existem de propósito.
 */
export const PLATFORM_NAVIGATION_TOOLS = [
  "get_platform_guide",
  "get_platform_state",
  "find_topic_in_platform",
  "list_platform_keywords",
  "get_next_actions",
  "validate_silo_plan",
] as const;

/* ======================================================================= */
/*                       ROTAS FORA DO PIPELINE, COM MOTIVO                */
/* ======================================================================= */

/**
 * Toda rota de API precisa estar numa operação acima OU aqui, com o motivo.
 * Rota nova que não entrar em nenhum dos dois lugares derruba o teste de
 * sincronia — é esse o lembrete de atualizar o que as IAs sabem.
 */
export const ROUTES_OUTSIDE_AGENT_PIPELINE: Readonly<Record<string, string>> = {
  "/api/admin/agencies": "Administração da plataforma.",
  "/api/admin/agencies/users": "Administração da plataforma.",
  "/api/admin/agency-applications": "Administração da plataforma.",
  "/api/admin/agency-invitations": "Administração da plataforma.",
  "/api/admin/communication": "Administração da plataforma.",
  "/api/admin/integrations": "Administração da plataforma.",
  "/api/admin/owners": "Administração da plataforma.",
  "/api/admin/users": "Administração da plataforma.",
  "/api/agencies/[agencyRef]": "Gestão da Agência.",
  "/api/agencies/[agencyRef]/brands": "Gestão da Agência.",
  "/api/agencies/[agencyRef]/integrations": "Gestão da Agência: conexões de provider.",
  "/api/agencies/[agencyRef]/members": "Gestão da Agência.",
  "/api/agency-applications": "Cadastro de Agência.",
  "/api/auth/google-client-id": "Autenticação.",
  "/api/auth/invited-signup": "Autenticação.",
  "/api/auth/signup": "Autenticação.",
  "/api/communication/delivery": "Entrega de comunicações.",
  "/api/contexts": "Troca de contexto da sessão.",
  "/api/contexts/restore": "Troca de contexto da sessão.",
  "/api/integrations/telegram/webhook": "Webhook de integração.",
  "/api/inteligencia": "Leitura legada de contexto da marca; o agente usa get_platform_state.",
  "/api/internal/writer-purge": "Manutenção interna.",
  "/api/marcas": "Cadastro de marcas.",
  "/api/mcp/redator": "O próprio servidor MCP.",
  "/api/mcp/redator/health": "Saúde do servidor MCP.",
  "/api/mine": "Exportador legado desativado.",
  "/api/oauth/consent": "Consentimento OAuth do MCP.",
  "/api/oauth/grants": "Grants OAuth do MCP.",
  "/api/oauth/protected-resource": "Metadata OAuth do MCP.",
  "/api/oauth/protected-resource/api/mcp/redator": "Metadata OAuth do MCP.",
  "/api/onboarding/agency": "Onboarding de Agência.",
  "/api/onboarding/agency/continue": "Onboarding de Agência.",
  "/api/redator/mcp-delegations": "Gestão das conexões MCP.",
  "/api/revalidate-structure": "Cache da estrutura.",
  "/api/tenants": "Resolução de tenant.",
  "/api/volume": "Legado: responde que a medição mudou para o Google Ads.",
  "/api/editorial/workspace": "Leitura agregada da mesa editorial pela tela; o agente usa get_platform_state.",
  "/api/editorial/views": "Preferência de visualização de grade.",
  "/api/editorial/invitations": "Convites de equipe.",
};

/* ======================================================================= */
/*                              PLAYBOOKS                                  */
/* ======================================================================= */

export type PlatformPlaybook = {
  id: string;
  title: string;
  whenToUse: string;
  steps: readonly string[];
};

export const PLATFORM_PLAYBOOKS: readonly PlatformPlaybook[] = [
  {
    id: "artigo_sobre_tema",
    title: "Pediram um artigo sobre um tema",
    whenToUse: "O usuário pede no chat um artigo sobre um assunto.",
    steps: [
      "get_platform_state: entenda a marca — silos, artigos, publicados, Assuntos.",
      "find_topic_in_platform com o tema: ele já é artigo, silo, Assunto, keyword ou página publicada?",
      "Se já existe artigo sobre o tema: não crie outro (canibalização). Siga o artigo existente pela etapa em que ele está (get_next_actions).",
      "Se existe um silo onde o tema cabe: o artigo entra como Suporte desse silo. Confira os artigos do silo para não repetir intenção.",
      "Se não existe silo que o comporte: siga o playbook 'silo_do_zero'.",
      "Declare o tema como Assunto (declare_subjects: preview → aceite do usuário → apply).",
      "Pesquise keywords de sustentação (search_subject_keywords: plan → plano mostrado ao usuário → execute; só Google Ads, sem custo no DataForSEO).",
      "No Minerador, escolha quais descobertas devem entrar no Processador e qualificar-se. Essa seleção controla os insumos aprovados; ela não define o agrupamento final dos artigos.",
      "Medição, Lógica, revisão e aprovação ficam na tela do Minerador: mande o link e espere o usuário aprovar.",
      "Com as keywords aprovadas: send_keywords_to_arquiteto.",
      "No Arquiteto, Silos e artigos publicados declarados pelo Vínculo/canonical são reconhecidos sem novo aceite. Para Assunto já declarado, inicie uma vez 'Formar artigos automaticamente': o Arquiteto agrupa keywords aprovadas e recebidas por evidência semântica, Silo confirmado e intenção, escolhe Principal com Volume validado, forma slug/canonical e valida os artigos na SERP; não pede escolha keyword por keyword nem confirmação por artigo. Este início é uma ação na interface; o MCP orienta o caminho, mas ainda não dispara essa operação por ferramenta.",
      "Se faltar evidência SERP no cache, apresente o plano com keyword, lente, motivo e custo. Cancelar o pagamento não cancela a análise: com 'Cancelar pagamento · analisar com o cache (US$ 0)', os artigos atendidos recebem parecer e os demais ficam pendentes com motivo individual. Se o cache estiver ilegível, o plano mostra o custo máximo e oferece coletar ou tentar ler de novo. Só pague após aceite do plano. Readback e gates aprovam automaticamente apenas os candidatos aptos; reporte motivos dos demais. Propostas gerais de arquitetura fora desse fluxo continuam com revisão humana.",
      "Depois dos artigos aptos no Arquiteto, envie ao Radar e siga o fluxo normal de investigação e finalização (send_radar_to_writer).",
      "No Radar, o usuário investiga e finaliza; você envia ao Redator (send_radar_to_writer).",
      "Escreva: playbook 'escrever_artigo'.",
    ],
  },
  {
    id: "silo_do_zero",
    title: "Não há nada publicado: criar o primeiro silo",
    whenToUse: "A marca não tem silo que comporte o tema, ou não tem nada publicado.",
    steps: [
      "Proponha UM silo com 4 a 7 artigos: um Pilar (o tema amplo) e 3 a 6 Suportes (cada um uma intenção específica).",
      "A página do silo é uma página publicável: dê a ela uma keyword e um slug. Ela não é o mesmo que o artigo Pilar.",
      "Distribua o funil: TOFU (informacional, aprender) para trazer tráfego e aparecer nas respostas de IA; MOFU (comparar, escolher); BOFU (decidir, contratar) ligado à oferta.",
      "Para cada artigo, proponha o Assunto (tronco), a intenção e o papel. Deixe o usuário escolher, trocar ou pedir outros temas.",
      "validate_silo_plan com a proposta: corrija o que a validação apontar (slug, colisão com publicado, repetição de intenção).",
      "Com o aceite do usuário: declare os Assuntos (declare_subjects) — os dos artigos e o da página do silo.",
      "Na Revisão Humana do Minerador, a keyword da página do silo recebe o tipo de página 'silo' (peça ao usuário).",
      "Siga 'artigo_sobre_tema' a partir da pesquisa de keywords, trabalhando os artigos em grupo.",
    ],
  },
  {
    id: "escrever_artigo",
    title: "Escrever o artigo (dentro ou fora da plataforma)",
    whenToUse: "O documento já está no Redator.",
    steps: [
      "list_writer_documents → get_writer_document (guarde o lockVersion).",
      "get_writer_evidence_manifest → get_writer_foundations → read_writer_evidence só para a seção que está escrevendo.",
      "get_writer_brief: instruções, links internos planejados e pendências do Radar.",
      "Estrutura: a principal no H1 e no slug; secundárias nos H2/H3 de forma natural (LSI/PNL, sem densidade forçada); o Assunto com a virada na seção sugerida.",
      "TOFU/informacional: abra cada seção com a resposta direta em 1–2 frases, depois aprofunde — é o formato que as IAs citam.",
      "Sem FAQ. Perguntas observadas na SERP viram cobertura dentro do texto.",
      "Inclua os links internos planejados (linkMap) com as âncoras indicadas, e o link para a página do silo.",
      "Dentro da plataforma: save_writer_draft com o lockVersion; depois get_writer_guardian e corrija os achados.",
      "Fora da plataforma (WordPress): use o mesmo dossiê, escreva lá, e preserve slug, H1, links e a virada. Registre divergência se a evidência contrariar um DNA.",
      "A aprovação final é do usuário, na tela do Redator.",
    ],
  },
  {
    id: "reforcar_publicado_pela_serp",
    title: "Melhorar publicados e formar Assuntos",
    whenToUse: "O usuário quer fortalecer publicados, resolver concorrência ou formar artigos com Assuntos declarados.",
    steps: [
      "get_platform_state: confira marca, publicados, Assuntos, DNAs aprovados e Posto das principais. Não trate SiloPage como Article.",
      "Com aceite para usar a quota gratuita do Google Ads, improve_articles action prepare prepara a marca inteira. Na tela: Arquiteto → Artigos → Melhorar publicados e formar Assuntos → Preparar melhorias.",
      "Mostre a prévia: principal atual e proposta com demanda, entradas, saídas, transferências, enfoque, exclusões e motivo por alvo. Dados do DNA são de leitura; nunca invente volume ou compatibilidade.",
      "Principal Livre sem demanda pode usar o fundamento editorial e SERP completa da candidata se a antiga for inconclusiva. SERP conclusiva contraditória impede a proposta; Travada ou Posto desconhecido ficam preservados.",
      "Cache antes de custo: se falta evidência, mostre lentes, consultas e faixa do plano. improve_articles action collect exige aceite específico, hash vigente e provider.spend; teto total US$ 1. Cancelar permite aplicar alvos prontos. Google Ads gratuito não é chamada SERP paga.",
      "Keywords pertencem a um artigo só: distribua entre publicados e Assuntos antes de novos candidatos, até seis incluindo a antiga principal publicada. O Assunto é fundamento fora das seis. Uma ou duas keywords adequadas podem bastar.",
      "Páginas concorrentes precisam de enfoques sustentados e exclusões recíprocas; trocar captar por atrair não demonstra solução. Mostre lacunas restantes com honestidade.",
      "Após aceite editorial específico da prévia, improve_articles action apply com decisionHash, targetIds e approveNewKeywords quando necessário, platform.decide e permissões dos módulos. Import, Lógica, métricas, aprovação, handoff, working copy, ArticleDNA e parecer final são executados pelo mesmo núcleo da tela.",
      "Enquanto state applying, continue apply com o mesmo runId e hash, sem pedir outro aceite para etapas internas. status retoma após interrupção. Resuma melhoria gravada, DNA criado, sem mudança e falha; só diga sucesso depois do readback. A execução não reescreve o site nem publica externamente.",
      "Rotas e painéis anteriores continuam disponíveis para operações pontuais, mas não exigem repetir Processar artigos entre duas confirmações nesta jornada.",
    ],
  },
  {
    id: "grupo_ou_individual",
    title: "Trabalhar em grupo ou individualmente",
    whenToUse: "Sempre que houver mais de uma keyword ou artigo.",
    steps: [
      "Em grupo: declare todos os Assuntos de um silo num só declare_subjects; importe as candidatas escolhidas numa chamada; envie ao Arquiteto e ao Redator em lote.",
      "Individual: quando um artigo precisa de cuidado próprio (publicado, YMYL, oferta), trate-o sozinho.",
      "Lote nunca esconde falha: leia o desfecho de cada item e reporte ao usuário o que passou, o que ficou bloqueado e por quê.",
    ],
  },
];

/* ======================================================================= */
/*                           CRITÉRIOS DE SEO                              */
/* ======================================================================= */

export const PLATFORM_SEO_RULES: readonly { rule: string; why: string }[] = [
  { rule: "Autoridade: SERP > lógica > IA.", why: "A SERP é o dado real; a IA só dá apoio semântico." },
  { rule: "KGR padrão não aplicável; aplicar é escolha manual do usuário ('Aplicar KGR' no artigo, 'Aplicável' na keyword). KGR = allintitle ÷ volume, bom abaixo de 0,25 (0,25 exato não é pleno); faixa de volume de interesse 150–550, só informativa (nunca aplica o KGR sozinha).", why: "Keyword Golden Ratio: poucas páginas com o termo no título para o volume buscado." },
  { rule: "Um artigo: 1 principal + até 5 keywords de apoio (máximo 6), com intenção e coerência reais.", why: "Mais que isso dilui a intenção e canibaliza." },
  { rule: "A principal é dona do slug, do KGR (quando aplicado) e do H1. Slug curto e alinhado à principal.", why: "Coerência slug–H1–title é sinal de relevância." },
  { rule: "Termo amplo e de maior volume tende a Pilar; intenções específicas são Suportes.", why: "O Pilar organiza o silo e recebe os links dos Suportes." },
  { rule: "Silo: 4 a 7 artigos no começo, com página do silo própria (keyword + slug).", why: "Um silo enxuto e completo ganha autoridade tópica mais rápido que muitos artigos soltos." },
  { rule: "Nunca dois artigos para a mesma intenção.", why: "Canibalização: as páginas disputam entre si." },
  { rule: "TOFU/informacional: resposta direta no começo de cada seção, definições claras, entidades nomeadas, dados com fonte.", why: "É o conteúdo que as IAs (AI Overviews, ChatGPT, Perplexity) conseguem citar." },
  { rule: "E-E-A-T e YMYL: autoridade declarada, especialista quando o tema pede, fontes verificáveis.", why: "Saúde, dinheiro e segurança têm exigência maior do Google." },
  { rule: "Sem FAQ. Perguntas viram cobertura no texto.", why: "Decisão editorial da casa." },
  { rule: "Uma capa e dois ou três respiros de imagem.", why: "Padrão visual da casa." },
  { rule: "SERP nas 4 lentes (desktop-windows, desktop-macos, mobile-android, mobile-ios).", why: "O artigo precisa posicionar em todos os aparelhos." },
  { rule: "A SERP não é requisito do Minerador: a primeira coleta é a do Arquiteto (aba Artigos), só das keywords com volume, cache primeiro (30 dias), e o Radar reaproveita a mesma coleta. Keyword sem volume nunca é coletada.", why: "Gastar menos no provider e não guardar dado inútil; o que já foi coletado continua legível como proveniência." },
  { rule: "Publicado é protegido: URL, slug, canonical e principal não mudam sem decisão humana.", why: "Mudar publicado perde tráfego já conquistado." },
  { rule: "O lote diz o objetivo: com publicados ou Assuntos no lote, reforce-os (até 6 keywords por artigo) e deixe a sobra sem encaixe em Keywords não agrupadas; artigo novo com as sobras só por ação explícita do dono.", why: "Quem manda publicados e Assuntos quer melhorá-los, não criar artigos concorrentes." },
  { rule: "Mesmo assunto é o que a SERP diz: 3+ páginas em comum no top 10 nas 4 lentes (cache já pago). Palavras e Lógica só apoiam; 1 ou nenhuma página em comum é outro assunto.", why: "O Google agrupa pela intenção que ele mesmo observa; palavras parecidas colam keyword de outro assunto e deixam de fora a que ele trata como a mesma busca." },
  { rule: "Principal publicada com Posto Livre é para trocar: proponha a substituta com demanda medida e intenção preservada; quando a antiga sem demanda for inconclusiva, use fundamento editorial e SERP completa da candidata, com aviso na prévia; URL, slug e canonical ficam, a antiga vira secundária, e só o humano aplica. Posto Travado ao slug: só reforço.", why: "O dono soltou a principal porque ela não tem volume; trocar a keyword sem mexer no endereço ganha demanda sem perder o que a página já conquistou." },
  { rule: "Dado de concorrente é pesquisa: parafrasear e confrontar, nunca copiar.", why: "Conteúdo original e sem risco de direito autoral." },
];

/* ======================================================================= */
/*                             REGRAS DE CONDUTA                           */
/* ======================================================================= */

export const AGENT_CONDUCT_RULES: readonly string[] = [
  "Comece por get_platform_state e find_topic_in_platform. Não proponha nada antes de saber o que a marca já tem.",
  "Proponha; o usuário decide. Operações com chatConfirmationRequired podem aplicar o aceite específico da prévia com platform.decide, hash vigente e auditoria; as demais aprovações ficam na tela.",
  "A IA nunca declara Assunto por conta própria: declare só o que o usuário aceitou, e envie o aceite em userConfirmation.",
  "Nada pago sem o custo mostrado e aceito. Use sempre o modo plan antes do execute.",
  "Nunca exclua, nunca publique, nunca troque a principal de um publicado.",
  "Quando algo não existir como ferramenta, diga ao usuário exatamente onde clicar (howOnScreen + link).",
  "Reporte o desfecho de cada item de um lote: sucesso, bloqueio com motivo, ou falha.",
];

/* ======================================================================= */
/*                                LEITURAS                                 */
/* ======================================================================= */

export function operationById(id: string): PlatformOperation | undefined {
  return PLATFORM_OPERATIONS.find(operation => operation.id === id);
}

export function operationsOfStage(stage: PlatformStage): PlatformOperation[] {
  return PLATFORM_OPERATIONS.filter(operation => operation.stage === stage);
}

/** Todas as ferramentas MCP que o catálogo declara: as de etapa e as de navegação. */
export function catalogToolNames(): string[] {
  const deEtapa = PLATFORM_OPERATIONS.flatMap(operation => operation.tools ?? []);
  return [...new Set([...deEtapa, ...PLATFORM_NAVIGATION_TOOLS])].sort();
}

/** Todas as rotas que o catálogo conhece, de operação ou de exclusão. */
export function catalogRoutes(): string[] {
  return [...new Set([
    ...PLATFORM_OPERATIONS.flatMap(operation => operation.routes),
    ...Object.keys(ROUTES_OUTSIDE_AGENT_PIPELINE),
  ])].sort();
}

const COST_LABEL: Record<OperationCost, string> = {
  free: "grátis",
  paid_provider: "pago (provider)",
  paid_ai: "pago (IA)",
};

function renderOperation(operation: PlatformOperation): string {
  const quem = operation.decision === "human" ? "decisão humana" : "a IA executa";
  const via = operation.access === "tool" ? `ferramenta: ${(operation.tools ?? []).join(", ")}` : "só na tela";
  const linhas = [
    `### ${operation.title} [${operation.id}]`,
    operation.purpose,
    `- Quem: ${quem} · Como: ${via} · Custo: ${COST_LABEL[operation.cost]}`,
    `- Precisa de: ${operation.requires.join("; ") || "—"}`,
    `- Produz: ${operation.produces.join("; ")}`,
    `- Na tela: ${operation.howOnScreen}`,
    ...(operation.notes ?? []).map(nota => `- ${nota}`),
  ];
  return linhas.join("\n");
}

export const PLATFORM_GUIDE_TOPICS = ["overview", "seo", "playbooks", ...PLATFORM_STAGES] as const;
export type PlatformGuideTopic = typeof PLATFORM_GUIDE_TOPICS[number];

/**
 * O GUIA, GERADO DO CATÁLOGO.
 *
 * Não há texto de guia escrito à mão em outro lugar. Se o guia disser algo
 * diferente do catálogo, o defeito está aqui — e o teste de sincronia confere.
 */
export function renderPlatformGuide(topic: PlatformGuideTopic = "overview"): string {
  if (topic === "seo") {
    return ["# Critérios de SEO da plataforma", ...PLATFORM_SEO_RULES.map(item => `- ${item.rule} — ${item.why}`)].join("\n");
  }
  if (topic === "playbooks") {
    return ["# Playbooks", ...PLATFORM_PLAYBOOKS.map(playbook => [
      `## ${playbook.title} [${playbook.id}]`,
      `Quando: ${playbook.whenToUse}`,
      ...playbook.steps.map((passo, indice) => `${indice + 1}. ${passo}`),
    ].join("\n"))].join("\n\n");
  }
  if ((PLATFORM_STAGES as readonly string[]).includes(topic)) {
    const stage = topic as PlatformStage;
    return [`# ${PLATFORM_STAGE_LABELS[stage]}`, ...operationsOfStage(stage).map(renderOperation)].join("\n\n");
  }
  const pipeline = PLATFORM_STAGES.map(stage => PLATFORM_STAGE_LABELS[stage]).join(" → ");
  const porEtapa = PLATFORM_STAGES.map(stage => {
    const ops = operationsOfStage(stage);
    return `- **${PLATFORM_STAGE_LABELS[stage]}**: ${ops.map(op => `${op.title} (${op.access === "tool" ? "ferramenta" : "tela"}${op.decision === "human" ? ", humano" : ""})`).join("; ")}`;
  });
  return [
    "# Minerador Key — guia para agentes",
    `Pipeline: ${pipeline}. O Planejador não faz mais parte do fluxo.`,
    "",
    "## Como se conduzir",
    ...AGENT_CONDUCT_RULES.map(regra => `- ${regra}`),
    "",
    "## Etapas",
    ...porEtapa,
    "",
    "## Mais detalhes",
    `Chame get_platform_guide com topic: ${PLATFORM_GUIDE_TOPICS.filter(item => item !== "overview").join(", ")}.`,
  ].join("\n");
}

/** Instruções curtas do servidor MCP: o ponto de partida, sem repetir o guia. */
export function platformServerInstructions(): string {
  return [
    "Plataforma editorial de SEO: Marca → Minerador → Arquiteto → Radar → Redator → Publicações.",
    "Comece por get_platform_guide (como trabalhar), get_platform_state (o que a marca já tem) e find_topic_in_platform (o tema pedido já existe?).",
    "get_next_actions diz o que fazer agora e quem faz. Aprovações são humanas: mande o link da tela.",
    ...AGENT_CONDUCT_RULES.slice(2, 4),
  ].join(" ");
}
