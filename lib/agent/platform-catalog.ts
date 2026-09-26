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
 * `decision: "human"` — aprovação. Continua humana mesmo que um dia vire
 *                    ferramenta (`AGENTS.md` §9; ADR-022 para o Assunto).
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
    purpose: "Buscar no Google Ads e no DataForSEO Labs as buscas reais que trazem o leitor até o Assunto.",
    requires: ["Assunto (declarado ou só a frase)", "Conexões DataForSEO e Google Ads da marca"],
    produces: ["Lista de candidatas (não gravada: volta só para a IA escolher)"],
    cost: "paid_provider",
    decision: "agent",
    access: "tool",
    tools: ["search_subject_keywords"],
    screen: "minerador",
    howOnScreen: "Minerador → Descobrir Keywords → Por Assunto.",
    routes: ["/api/minerador/marcas/[brandId]/subject-discovery/search"],
    notes: [
      "Primeiro `mode: plan` (grátis): devolve o custo estimado (cerca de US$ 0,15 por pesquisa, teto US$ 0,20).",
      "Mostre o custo ao usuário. Só com o aceite dele chame `mode: execute` com o `authorizedPlan` recebido.",
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
    id: "minerador.measure_and_qualify",
    stage: "minerador",
    title: "Medir e qualificar (Volume, Resultados, KGR, Lógica)",
    purpose: "Medir volume e allintitle, calcular KGR e rodar a Lógica (intenção e funil) para cada keyword.",
    requires: ["Keywords no Processador"],
    produces: ["Métricas, KGR e hipótese de intenção/funil por keyword"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → barra do rodapé, nesta ordem: Lógica → Volume → Resultados → Revisar → KGR → Vínculo.",
    routes: [
      "/api/minerador/marcas/[brandId]/dataforseo/allintitle",
      "/api/minerador/marcas/[brandId]/google-ads/metricas-keywords",
      "/api/minerador/marcas/[brandId]/google-ads/conexao",
    ],
    notes: [
      "Com Assunto declarado, aprovar dispensa Volume, Resultados e KGR: só a Lógica é exigida.",
      "Ainda não há operação de servidor para a Lógica e as medições: a IA não executa esta etapa.",
    ],
  },
  {
    id: "minerador.review_and_approve",
    stage: "minerador",
    title: "Revisar e aprovar keywords",
    purpose: "Decisão humana sobre cada keyword: Vínculo (Assunto, tipo de página, posto), revisão concluída e aprovação.",
    requires: ["Keywords medidas e com Lógica"],
    produces: ["Keywords 'aprovado', prontas para o Arquiteto"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → Revisão Humana (individual) ou barra do rodapé (em grupo) → Concluir revisão → Status: aprovado.",
    routes: [],
    notes: [
      "Tipo de página 'silo' marca a keyword que será a cabeça do silo (a página do silo). Declare-o para a keyword do silo.",
      "A aprovação grava direto do navegador; a IA pede ao usuário e confere o resultado com get_platform_state.",
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
    purpose: "Agrupar as keywords em artigos (uma principal + até 5 de apoio) e os artigos em silos, com pilar e suportes.",
    requires: ["Keywords recebidas do Minerador"],
    produces: ["Proposta de ArticleDNA e SiloDNA na cópia de trabalho"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Processar lógica. Revise principal, secundárias e reforços de cada artigo antes de seguir.",
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
    notes: ["Máximo de 6 keywords por artigo (1 principal + 5). A principal é dona do slug, do KGR e do H1."],
  },
  {
    id: "arquiteto.validate_serp",
    stage: "arquiteto",
    title: "Validar pela SERP",
    purpose: "Coletar a SERP das keywords nas 4 lentes e confirmar agrupamento, principal e fronteira do silo pelo que o Google mostra.",
    requires: ["Proposta formada"],
    produces: ["Parecer de SERP por artigo e por silo"],
    cost: "paid_provider",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Validar SERP.",
    routes: ["/api/arquiteto/serp", "/api/arquiteto/keyword-serp", "/api/arquiteto/territorial-serp", "/api/arquiteto/serp-resolution"],
    notes: ["SERP vence a lógica e a IA quando discordam."],
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
    title: "Confirmar arquitetura (ArticleDNA, SiloDNA e SiloPage)",
    purpose: "Aprovar os artigos, o silo e a página do silo. SiloDNA e SiloPage têm aprovações próprias.",
    requires: ["Proposta revisada"],
    produces: ["ArticleDNA, SiloDNA e SiloPage aprovados"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Confirmar arquitetura; depois aprovar o Silo e a página do Silo.",
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
    notes: ["O Radar não reagrupa keywords, não troca a principal e não troca o Assunto: diverge e devolve ao Arquiteto."],
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
    access: "ui",
    screen: "redator",
    howOnScreen: "Redator → documento → Aprovar para Publicações.",
    routes: ["/api/redator/publication-handoff"],
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
    access: "ui",
    screen: "publicacoes",
    howOnScreen: "Publicações → documento → registrar publicação.",
    routes: ["/api/publicacoes"],
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
      "Pesquise keywords de sustentação (search_subject_keywords: plan → custo ao usuário → execute).",
      "Escolha com o usuário a principal candidata (KGR < 0,25 quando houver medição; intenção coerente com o tema) e até 5 de apoio; importe (import_subject_keywords).",
      "Medição, Lógica, revisão e aprovação ficam na tela do Minerador: mande o link e espere o usuário aprovar.",
      "Com as keywords aprovadas: send_keywords_to_arquiteto.",
      "No Arquiteto, o usuário processa a lógica, valida a SERP, confirma a arquitetura e envia ao Radar (link da tela).",
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
  { rule: "KGR pleno é < 0,25 (0,25 exato não é pleno), sujeito à aprovação do usuário.", why: "Keyword Golden Ratio: poucas páginas com o termo no título para o volume buscado." },
  { rule: "Um artigo: 1 principal + até 5 keywords de apoio (máximo 6), com intenção e coerência reais.", why: "Mais que isso dilui a intenção e canibaliza." },
  { rule: "A principal é dona do slug, do KGR e do H1. Slug curto e alinhado à principal.", why: "Coerência slug–H1–title é sinal de relevância." },
  { rule: "Termo amplo e de maior volume tende a Pilar; intenções específicas são Suportes.", why: "O Pilar organiza o silo e recebe os links dos Suportes." },
  { rule: "Silo: 4 a 7 artigos no começo, com página do silo própria (keyword + slug).", why: "Um silo enxuto e completo ganha autoridade tópica mais rápido que muitos artigos soltos." },
  { rule: "Nunca dois artigos para a mesma intenção.", why: "Canibalização: as páginas disputam entre si." },
  { rule: "TOFU/informacional: resposta direta no começo de cada seção, definições claras, entidades nomeadas, dados com fonte.", why: "É o conteúdo que as IAs (AI Overviews, ChatGPT, Perplexity) conseguem citar." },
  { rule: "E-E-A-T e YMYL: autoridade declarada, especialista quando o tema pede, fontes verificáveis.", why: "Saúde, dinheiro e segurança têm exigência maior do Google." },
  { rule: "Sem FAQ. Perguntas viram cobertura no texto.", why: "Decisão editorial da casa." },
  { rule: "Uma capa e dois ou três respiros de imagem.", why: "Padrão visual da casa." },
  { rule: "SERP nas 4 lentes (desktop-windows, desktop-macos, mobile-android, mobile-ios).", why: "O artigo precisa posicionar em todos os aparelhos." },
  { rule: "Publicado é protegido: URL, slug, canonical e principal não mudam sem decisão humana.", why: "Mudar publicado perde tráfego já conquistado." },
  { rule: "Dado de concorrente é pesquisa: parafrasear e confrontar, nunca copiar.", why: "Conteúdo original e sem risco de direito autoral." },
];

/* ======================================================================= */
/*                             REGRAS DE CONDUTA                           */
/* ======================================================================= */

export const AGENT_CONDUCT_RULES: readonly string[] = [
  "Comece por get_platform_state e find_topic_in_platform. Não proponha nada antes de saber o que a marca já tem.",
  "Proponha; o usuário decide. Aprovações são humanas e ficam na tela — mande o link da tela e confira depois com get_platform_state.",
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
