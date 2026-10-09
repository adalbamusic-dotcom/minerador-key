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
    requires: ["Publicados ou Assuntos declarados recebidos no Arquiteto", "Silo do destino conhecido", "Aceite da preparação (leitura da IA pela Connection DeepSeek da marca e pesquisa gratuita que usa quota) e da prévia editorial; plano específico antes de qualquer custo de SERP"],
    produces: ["Prévia com principal, entradas, saídas, papéis, volumes, transferências, enfoques e motivos por alvo", "Execução retomável com ArticleDNA, parecer, composição e marcador relidos"],
    cost: "paid_provider", decision: "human", access: "tool", chatConfirmationRequired: true,
    tools: ["improve_articles"], screen: "arquiteto", routes: ["/api/arquiteto/article-improvement"],
    howOnScreen: "Arquiteto → Artigos (o painel abre a aba) → cartão 'Próximo passo', que mostra uma frase e um botão só: 1 · Buscar keywords (grátis) → 2 · Validar no Google (pago, se necessário) → escolher alvos na tabela do painel → 3 · Gravar melhorias → Confirmar e aplicar. Linhas prontas desmarcadas: o cartão pede para marcar na tabela. Execução parada no meio (validação ou gravação): o cartão mostra 'Continuar'; execução em andamento no servidor: 'Ver andamento'. Com a gravação concluída, o cartão é o de sempre: o Arquiteto não ganha passo do Radar (regra do dono, 2026-10-09: o Radar se adapta ao Arquiteto, nunca o contrário). O item que já está no Radar continua na versão que o Arquiteto enviou; o reenvio da versão nova ao Radar é proposta registrada no backlog do Radar e do Arquiteto (exige SDD). Sem nada pendente: 'Nada a fazer nos publicados agora. Veja artigos novos em Sobras.' ('Ver Sobras'); sem Sobras, o cartão leva a 'Artigos novos' (Processar artigos). Os outros atos ficam na fileira do painel, sem número. F5 recupera a execução do servidor; 'Continuar' retoma o mesmo lote. Com publicados marcados na planilha, 'Buscar keywords' analisa só eles (sem marcação, todos); 'Gravar melhorias' grava só as linhas marcadas na tabela da análise.",
    notes: [
      "Ordem do prepare (decisão do dono, 2026-09-30, 'lista primeiro'): 1 pares da SERP no cache → 2 leitura editorial da IA (DeepSeek da marca, uma chamada em lote com limite de tempo, guardada na execução e nunca repetida no collect) na lista livre da marca com volume do Google Ads validado, só para quem ficou sem proposta pronta → 3 busca nova no Google Ads só para quem ainda ficou sem nada. A IA escolhe de 1 a 3 keywords por alvo com papel e UMA frase de motivo (evidenceBasis editorial_ai; a linha mostra 'Leitura da IA — confira'). Ela tem a menor autoridade: id fora da lista é recusado; valem as barreiras do código (publicada, sem volume, de outro ArticleDNA aprovado, contradiz o slug, restrição sem tráfego pago, cabeça genérica > 5.000, outro nicho, sem o núcleo do assunto); principal nova só com Posto Livre, atual sem volume e página que não ranqueia; teto 3 por alvo e 6 por artigo; uma keyword vai para um alvo só. Para gravar, o parecer da SERP da composição final sai do cache; faltando lente (ou faltando tempo na etapa para ler o parecer), a linha fica 'Precisa validar no Google' (passo 2, com prévia). Até 12 alvos por chamada; cada escolha malformada é recusada sozinha; as recusas aparecem em 'Sugestões da IA recusadas pelas regras'; cada linha diz a origem (Pares da SERP, Leitura da IA — confira, Busca nova no Google Ads). Falha, tempo esgotado ou IA desligada: aviso único e a jornada segue pelas regras. A IA não aplica nada: o aceite é do dono.",
      "Leitura da lista pelo código (2026-09-30), entre a IA e a busca nova: quem ficou sem proposta pronta, inclusive o par barrado pela trava de canibalização, recebe até 3 keywords livres com volume que SÃO o núcleo do slug (as duas últimas palavras antes de 'para'/'sem', com os sinônimos atrair/captar e paciente/cliente) e levam uma palavra literal dele, sem outro ângulo ('pelo instagram' fica fora). A linha diz 'Lista · núcleo do slug'. A palavra de ação do slug (atrair, captar, campanha…) tem de estar escrita na keyword. A escolha da IA com menos de 3 entradas também é completada pela lista (a IA vem primeiro). Busca local de outra cidade ('agência de marketing em são paulo', 'perto de mim') é recusada. Dois publicados que disputam o mesmo assunto ficam separados quando cada um recebe só keywords com a palavra própria do seu slug e sem o verbo do outro ('como captar clientes' para a página de captar, 'como atrair clientes' para a de atrair); dar 'captar' à página de 'atrair' continua barrado. Como na IA, gravar exige o parecer da SERP da composição final. Quando esse parecer diverge, a composição encolhe uma vez, pelo cache e sem custo: ficam a âncora e as keywords que dividem páginas com ela (par forte ou parcial) em 2 ou mais lentes; a âncora é a principal com volume ou, quando a principal é a página sem volume, a entrada de maior volume; a linha diz quem saiu.",
      "prepare usa acervo antes de pesquisa Google Ads (grátis, com quota); consulta todas as candidatas do cache antes de limitar as pagas. status não escreve. collect requer provider.spend, hash vigente e aceite específico do custo; teto US$ 1 para a execução inteira. apply requer platform.decide, arquiteto.write, minerador.write, permissões dos módulos e aceite específico da prévia.",
      "Uma confirmação inclui principal Livre, substituições de apoios fracos, transferências de keywords livres e aprovação de novas keywords; Travada permanece. URL, slug, canonical, marca e Silo publicados preservados. Assunto continua declarado, fora do teto de seis. Uma ou duas buscas adequadas podem bastar; não preencher seis à força.",
      "Principal antiga sem demanda não é âncora obrigatória de coincidência: fundamento editorial e SERP completa das candidatas podem sustentar a proposta, com origem da evidência declarada. Contradição conclusiva impede aprovação automática. Risco de ranking é aviso, não revoga Livre.",
      "Canibalização exige enfoques distintos e exclusões recíprocas sustentados pelos dados; trocar captar clientes por atrair pacientes não basta. Se não houver diferenciação demonstrável, informar o motivo e pesquisar opções, preservando as páginas.",
      "apply avança um alvo por chamada: repetir o mesmo runId e decisionHash até state complete, sem novo aceite para etapas internas do lote já aceito. Falha isolada fica registrada e os demais seguem. Melhoria exige mudança material, composição, ArticleDNA e marcador relidos; criar só DNA é outra contagem. A operação não reescreve nem publica externamente.",
      "Volume de outra era (2026-09-30, caso 'tráfego pago vs orgânico'): no prepare, as keywords do próprio artigo e as do mesmo tema que têm volume, mas não do Google Ads (provider antigo, 'Bruto' no Minerador), são medidas no Google Ads (grátis, só leitura, até 300) e a proposta passa a enxergá-las; sem isso a principal sem volume nunca era trocada. Quem já foi medido no Google Ads (mesmo sem média) não é medido de novo. No apply, antes de comparar a composição, a medição das keywords que entram no artigo é gravada no Minerador pelo mesmo núcleo do 'Medir volume' (minerador.edit, com releitura); se não gravar, nada é gravado no artigo. O aviso da prévia diz quantas foram medidas.",
      "Formação da mesa do publicado maior que o DNA (2026-10-01, caso 'dentistas': 9 na mesa, 4 no DNA, duas principais): as keywords da formação da mesa que estão fora do ArticleDNA são candidatas DO PRÓPRIO artigo; entram as que a SERP e o sentido sustentam (teto de 6) e, ao gravar, as que sobram são liberadas para 'Keywords não agrupadas', nomeadas na mensagem — nenhuma é apagada. Publicado com principal COM volume fica travado ao slug: candidata de mais volume entra como apoio, não troca a principal. O 'Concluir formação' tira o publicado selecionado da conclusão com o caminho dito (Melhorar publicados) e segue com os artigos novos.",
      "Principal sem volume com Posto Livre (dono, 2026-10-01): só a principal com volume fica travada ao slug. Publicado Livre cuja principal não tem volume e que não ganhou outra proposta troca a principal pela keyword com volume JÁ NO ARTIGO que tem mais sentido com o slug — primeiro a que leva o núcleo do slug, depois a que divide mais palavras com ele (sinônimos atrair/captar, paciente/cliente), depois a mais enxuta; o volume só desempata, e sem palavra em comum com o slug não troca. Nada entra nem sai; a página vira secundária; URL, slug e canonical ficam. Ao gravar, a SERP da composição é relida pelo cache e decide. Na tela, a linha e o 'Resumo do artigo' mostram a principal do ArticleDNA (a página segue como identidade publicada). Publicado não passa pelo 'Concluir formação': o ato que fecha o publicado é '3 · Gravar melhorias'. Se a leitura da IA ou da lista propôs keyword nova e a SERP dela não confirmou, o preparo tenta esta troca interna pelo mesmo cache (sem custo) e ela entra no lugar quando a SERP confirma.",
      "Atualizar o DNA com a SERP (2026-10-01): publicado ou Assunto com ArticleDNA aprovado, cujo parecer da SERP (serpAssessmentRef) descreve a composição do DNA e está completo nas 4 lentes, mas o DNA está sem classificação ou com intenção/funil diferentes do que a SERP decidiu, aparece como linha pronta 'Atualizar o DNA com a SERP: intenção X · funil Y' (a composição não muda). Ao gravar: versão nova aprovada do DNA com a classificação, mainIntent, intentProfile e journeyStage da SERP, a formação no marcador como concluída, tudo relido; URL, slug e canonical preservados. Sem custo.",
      "Concluir grava tudo também na melhoria (2026-10-01): membros sem intenção em lugar nenhum (keyword 'Bruto', revisão do Minerador por fazer) recebem, ao gravar, a Lógica determinística do Minerador (intenção, nicho e funil; grátis, sem provider, sem aprovar, decisão humana preservada) antes de montar o grupo; a mensagem diz quantas. A sucessora leva a classificação (intenção, funil, KGR, compatibilidade, proteção) e as intenções auxiliares da composição NOVA, pela mesma evidência da tela (buildClassificationEvidence); se a regra devolve a decisão ao humano (KGR aplicável sem métrica), a classificação velha sai e a tela mostra a leitura ao vivo.",
      "Intenção e hash da SERP (2026-09-30): o parecer gravado pela melhoria usa a MESMA intenção que a mesa usa no hash esperado (articleSerpIntentOf: análise semântica, senão a coluna), para não nascer 'desatualizado' e travar o 'Pronto para Radar'. A intenção do ArticleDNA segue a taxonomia do Minerador ('Informativa' é informacional; 'Pendente' é ausência, não intenção).",
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
    access: "tool",
    chatConfirmationRequired: true,
    tools: ["measure_keywords"],
    screen: "minerador",
    howOnScreen: "Minerador → Processar Keywords → barra do rodapé → Volume. Opcional, fora da sequência de processos, nas ações secundárias da barra: 'Resultados (opcional · pago)', que mostra o custo estimado e pede uma confirmação antes de pagar.",
    routes: [
      "/api/minerador/marcas/[brandId]/dataforseo/allintitle",
      "/api/minerador/marcas/[brandId]/google-ads/metricas-keywords",
      "/api/minerador/marcas/[brandId]/google-ads/conexao",
    ],
    notes: [
      "Volume pelo MCP (2026-09-30): measure_keywords, o mesmo núcleo do botão Volume (blocos de 200, releitura de cada keyword). Primeiro mode 'plan' (grátis): keywords existentes, blocos e planHash. Depois 'execute' com o planHash, o aceite do usuário e o escopo provider.spend: sem custo em dinheiro, mas gasta a cota do Google Ads da marca. Até 500 keywords por chamada. Desfechos: medida, sem_media (processada, sem dado; não é falha) e falhou (com o motivo); cota atingida para o lote e o que já voltou fica gravado. Resultados (allintitle/KD, pago) continua só na tela.",
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
    notes: ["Publicado declarado não exige Confirmar arquitetura de novo: o primeiro processamento efetiva Silo e membership pela URL, com readback. Divergência de endereço continua conflito.", "O publicado é reconhecido pelo Vínculo (URL e canonical conferidos), mesmo com status aprovado e sem sitemap: a contagem de publicados reconhecidos vem do Vínculo, e o catálogo do site é só evidência adicional. Publicado sozinho é artigo completo que aguarda reforço, nunca isolado, candidato individual ou Não aplicável. Publicado que também é Assunto sem Volume continua principal do próprio artigo e recebe as sustentações do Assunto; duas publicadas nunca se fundem.", "A formação lê primeiro os KeywordDNAs aprovados (intenção e funil das 4 lentes, evidencia_serp, volume, Vínculo, Assunto e proveniência da Pesquisa por Assunto). Em cada Silo, a precedência é: artigos publicados, Assuntos declarados e livres que reforçam os dois, por semântica e importância (publicado antes de Assunto; a livre vai para onde agrega mais). O lote diz o objetivo: com publicado ou Assunto no lote recebido, o dono quer melhorá-los, e a sobra sem encaixe fica em 'Keywords não agrupadas pela formação', com o motivo, sem virar artigo novo sozinha. Artigo novo com as sobras só pela ação explícita do dono 'Formar artigos novos com as sobras' (Arquiteto → Artigos → Detalhes técnicos, bloco 'Objetivo do lote'), revisável antes de confirmar. Em lote todo novo (sem publicado nem Assunto), as livres formam artigos novos. Um artigo por Assunto: a sustentação que não coube ou não converge com a Principal do artigo do Assunto volta a ser livre, é oferecida a publicados e Assuntos com vaga e, sem encaixe, fica em Keywords não agrupadas com o motivo; nunca vira um segundo artigo concorrente. A sustentação cujo Assunto ainda não tem Principal com Volume validado também é oferecida às âncoras antes de esperar. O artigo do Assunto sozinho aparece como 'Assunto · aguardando sustentação' (nunca 'sem convergência' ou 'Não aplicável'), e o Assunto com artigo sugerido pela formação leva o selo 'Assunto · artigo sugerido na formação, aguarda confirmação'. Intenção, funil ou SERP conclusiva divergentes impedem o agrupamento automático. Decisões humanas anteriores permanecem protegidas. URL, slug, canonical e principal publicados não mudam automaticamente.", "Silos novos e keywords livres permanecem propostas; papel Pilar/Suporte e troca de principal publicada não são presumidos.", "Assunto declarado: o tronco fica fora das seis keywords e do slug. Assunto com Volume validado é a principal do próprio artigo; sem Volume, as sustentações são agrupadas por semântica e intenção com Principal de Volume validado, e o Assunto sem sustentação aparece como 'Assunto · aguardando sustentação', estado normal. Sem Principal elegível, as sustentações aguardam visíveis em Keywords não agrupadas, com o motivo. Uma ação no Arquiteto prossegue pela SERP e materializa ArticleDNA após readback e gates; não pede seleção manual de keyword. Para SERP sem cache, o usuário autoriza o plano de custo uma vez por execução.", "A formação não cruza Silo sozinha: a sobra que reforçaria um publicado ou Assunto de outro Silo aparece como proposta em 'Reforçar publicado ou Assunto de outro Silo', com origem, destino e motivo; mover é decisão humana na tela (a mesma decisão de Silo da aba Silos, com releitura). O Assunto sem Volume também vira artigo: as livres que convergem com a frase dele formam o artigo, com Principal de Volume validado. Na fase de Silos, uma livre que converge com uma página publicada é atraída ao Silo dela, e a fronteira gravada como lista dos membros não conta como tema.", "Máximo de 6 keywords por artigo (1 principal + 5). O excedente é oferecido primeiro aos publicados e Assuntos com vaga; no modo melhorar fica em 'Keywords não agrupadas pela formação'; fora dele forma outro artigo só com fronteira própria (converge com outra busca e não pede o mesmo conteúdo do artigo de origem); o resto fica em 'Keywords não agrupadas pela formação', cada uma com o motivo. Nada some. A principal é dona do slug, do KGR (quando aplicado) e do H1. Falha no plano ou na coleta não conta como SERP concluída.", "KGR do artigo: padrão 'Não aplicável'. 'Aplicar KGR' (Sim/Não, padrão Não) é escolha humana em qualquer artigo, na Revisão, e pode ser trocada; KGR = allintitle da Principal ÷ volume, bom abaixo de 0,25; faixa de volume de interesse 150–550 só informativa; KGR não aplicável nunca bloqueia formação nem aprovação; com Sim e sem allintitle a conclusão espera a medição. Identidades antigas 'KGR pleno automático' são lidas como 'Sim · regra antiga' e só o humano troca."],
  },
  {
    id: "arquiteto.undo_suggested_silo",
    stage: "arquiteto",
    title: "Desfazer Silo sugerido",
    purpose: "Tirar de cena um Silo novo sugerido pelo Arquiteto (sem endereço publicado): o Silo passa a rejeitado e as keywords dele voltam para 'sem Silo', sem apagar nada.",
    requires: ["Silo candidato ou confirmado SEM endereço publicado (sem slug publicado, sem página do site, sem SiloDNA/SiloPage aprovado ou consolidado)", "Nenhum ArticleDNA aprovado com keyword desse Silo", "Nenhuma keyword publicada dentro dele"],
    produces: ["Território em 'rejected', com o motivo, o ator e a hora nos motivos do Silo", "Cada keyword do Silo em 'sem Silo' pela decisão humana de Silo, com releitura", "Silo desfeito e vazio some da mesa e das contagens; a formação de artigos só lê Silos confirmados"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → Silos → na linha do Silo sugerido, 'Desfazer Silo' → a confirmação diz o que acontece (o Silo sai da aba Silos e fica guardado como rejeitado, nada é apagado, N keywords voltam para sem Silo e continuam na mesa) → 'Desfazer Silo'; durante o lote o diálogo mostra 'Desfazendo i de N…' e só fecha depois da releitura. Para todos de uma vez: 'Desfazer os Silos sugeridos (N)', no título da seção Silos, com uma confirmação só.",
    routes: ["/api/arquiteto/workspace"],
    notes: [
      "Desfazer é decisão humana e só existe na tela: não há ferramenta MCP. A IA explica, manda o link da aba Silos e confere depois pelo estado.",
      "O servidor confere tudo no banco antes da primeira escrita e recusa com o motivo por extenso: Silo com endereço publicado (continua ativo), Silo consolidado ou com SiloDNA/SiloPage aprovado, ArticleDNA aprovado com keyword do Silo, keyword publicada no Silo, keyword fora da etapa do Arquiteto ou lock vencido. Silo publicado nunca é desfeito por aqui.",
      "Ordem da gravação: cada keyword volta para 'sem Silo' com o lock dela (a mesma decisão de Silo da aba Silos) e só depois o território vira 'rejected' com o lock dele. Se uma keyword falhar, o Silo continua na tela e dá para tentar de novo. O sucesso só é anunciado depois da releitura: território rejeitado e nenhuma keyword apontando para ele.",
      "A edição genérica do território não rejeita Silo: ela manda usar 'Desfazer Silo'.",
    ],
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
    notes: ["Keyword sem volume (Google Ads sem média ou zero) nunca é coletada: fica fora do lote, do plano e do parecer, onde aparece como não observada com o motivo, sem travar as lentes; a Principal continua sempre consultada.", "Keyword que chega sem SERP do Minerador é o caso normal: a primeira coleta é a do Arquiteto. Nunca 'só a lente principal' na primeira coleta. A cabeça da SiloPage com volume também entra na primeira coleta (ela não forma artigo, mas a SERP dela alimenta o 'mesmo assunto' e a SiloPage no Radar).", "Allintitle: reaproveita a medição do Arquiteto ou do Minerador de até 30 dias; Recalcular é pago e pede confirmação; o Arquiteto nunca escreve results_allintitle/kgr_score na linha do Minerador; custo estimado US$ 0,002 a 0,0035 por consulta. Principal sem volume não é medida (sem volume não há KGR): o servidor confere o volume da linha da marca e devolve lacuna, sem pagar. Item fora da etapa ou Principal fora do acervo vira lacuna e não derruba os outros artigos do bloco. Medir o allintitle sem 'Aplicar KGR' não abre versão nova do ArticleDNA.", "Fase Silos: 'Consultar nas 4 lentes' (keyword-serp) é ação manual e opcional e coleta só keywords com volume; a primeira coleta do fluxo é a da aba Artigos.", "Cache primeiro: SERP vigente (Minerador, Arquiteto ou Radar) produz o parecer sem custo. Toda keyword observada, inclusive artigo unitário, exige as quatro lentes: o parecer antigo de artigo unitário marcado 'sem par' fica incompleto, faltando lentes, e bloqueia a conclusão até as extras serem coletadas; o plano de custo mostrado ao dono diz isso. Coletar do provider é permitido quando a evidência não basta (lente faltando, composição nova, SERP vencida): o plano lista a keyword, a lente, o motivo e o custo, e o humano confirma. Recoletar com cache também é possível, com aviso e custo.", "Na formação, 'Cancelar pagamento · analisar com o cache (US$ 0)' cancela só o pagamento: os artigos com evidência completa no cache recebem parecer, e os que dependem de coleta ficam pendentes com o motivo, sem chamar o provider.", "Se o cache não puder ser lido, a coleta não fica proibida: o plano volta com o custo máximo (tudo como falta) e o aviso, e o humano escolhe coletar com esse teto ou 'Tentar ler o cache de novo'. Com o cache ilegível, a tela não oferece a análise só com cache (ela devolveria SERP_CACHE_UNAVAILABLE em cada bloco): as saídas são coletar com o custo máximo, tentar ler de novo ou cancelar sem pagar.", "Parecer com lente ausente permanece legível, mas bloqueia a conclusão e o envio ao Radar. Os contadores só dizem coletada (SERP paga nesta execução) ou reaproveitada (parecer feito só com o cache) depois do readback do parecer; SERP_PENDING conta os que ficaram sem parecer, cada um com o motivo. SERP_COLLECTED e SERP_REUSED contam pareceres de artigo confirmados no acervo, não entradas do cache por keyword. Os totais 'No cache' contam entradas pela metadata, não artigos validados.", "SERP conclusiva orienta a leitura competitiva; decisões humanas e identidades publicadas não são alteradas silenciosamente.", "Concluir formação (2026-09-30): o clique também pede a SERP dos artigos selecionados sem parecer vigente, pelo mesmo caminho do Processar (cache primeiro; só as lentes que faltam entram no plano de pagamento, e a pessoa escolhe pagar ou seguir só com o cache) e depois continua sozinho. Uma pendência de um artigo não trava os outros: quem passa do teto de 6 buscas, disputa o tema com outro (os dois lados), espera decisão da SERP (Manter ou Aplicar) ou segue sem SERP completa fica de fora, continua candidato e sai nomeado com o motivo; os prontos passam pela mesma portaria e são concluídos.", "Sobras: 'Descartar sobras' tira as oportunidades da tela (preferência do navegador, por Marca). Nenhuma keyword é apagada nem movida: elas seguem em Keywords não agrupadas; sobra nova traz o painel de volta, e 'Mostrar de novo' desfaz. Silos novos que não serão usados saem por 'Desfazer os Silos sugeridos' na aba Silos (o Silo fica guardado como rejeitado; as keywords voltam para sem Silo).", "Concluir grava tudo no ArticleDNA (regra do dono, 2026-09-30): a confirmação humana resolve o vínculo KGR em vez de deixar pendência — principal ou slug fora do par KGR candidato deixa o artigo sem vínculo KGR ('não se aplica', com o par anterior guardado na decisão), porque pendência em humanPendingDecisions faz o servidor recusar o 'Pronto para Radar'; o tipo de unidade derivado (artigo, guia…) fica confirmado; a intenção segue a taxonomia do Minerador ('Informativa' é informacional; 'Pendente' é ausência e não vira intenção auxiliar). Sem intenção em lugar nenhum (keyword Bruto, revisão do Minerador por fazer), a intenção continua desconhecida: não se inventa.", "A SERP tem a última palavra sobre intenção e funil (dono, 2026-10-01; spec §40): o padrão do Minerador é genérico e sempre confrontado. O parecer lê as 4 lentes — cada resultado vota, vence a intenção de maior participação mesmo baixa (empate no topo = misto) e o funil sai dela (informacional → topo, comercial → meio, transacional → fundo); grava observedFunnel e intentShares. A classificação e o ArticleDNA (mainIntent, intentProfile, journeyStage) gravam o que a SERP decidiu; o rótulo do Minerador fica como proveniência e o KeywordDNA não é reescrito. Faltou lente: o plano lista só a que falta. O portão do Radar confere a SERP do ArticleDNA aprovado (serpAssessmentRef), se ela descrever a composição do DNA; mudança pendente na mesa não recusa o DNA aprovado."],
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
    howOnScreen: "Arquiteto → Artigos → Detalhes técnicos → 'Análise por keyword (avançado)' → painel 'Mesmo assunto no Google · publicados e Assuntos': ao abrir a aba, a mesa lê a SERP do cache (sem custo; 'Reler o cache de SERP' relê) e mostra a tabela 'Reforçar publicados' (2026-09-28: uma tabela só, no lugar da grade de cartões), com a frase 'Reforço só vale com keywords do mesmo assunto no Google; keywords de volume alto de outro assunto viram artigo novo em Sobras.' e uma linha por publicado e Assunto, nas colunas 'Publicado ou Assunto', 'Principal atual' (com o volume e, no publicado com troca proposta, a caixinha 'Aceitar a troca'), 'Keywords sugeridas' (caixinha, nível, volume, páginas em comum e Silo de origem), 'Volume somado' (keywords e volume antes → depois) e 'Estado'. 'Ver a evidência' abre, na própria linha, o cartão com o estado — Reforçado, Troca proposta, Sugestões para confirmar, Par em outro Silo, Par em outro artigo, Par com intenção diferente, Par sem volume, Sem SERP no cache (vencida ou nunca coletada), Sem par no lote ou Tema sem demanda no Google — e o ato do dilema: 'Aplicar troca' / 'Manter', 'Trazer para este artigo', 'Abrir o artigo \"…\"' (o que ficou com o par, ou este, para liberar vaga), 'Buscar reforço', 'Coletar SERP (pago, com plano)' ou 'Coletar de novo (pago, com plano)'. A leitura do cache é reaproveitada na mesma sessão por 20 minutos com o mesmo conjunto de keywords. 'Ver a evidência' mostra as páginas em comum no top 10 e em que lente cada uma aparece; 'Aceitar em grupo' (abaixo da tabela) aplica as trocas e as mudanças de Silo marcadas, com confirmação e releitura (mudar de Silo grava só o Silo; para pôr a keyword no artigo publicado, a tabela 'Reforçar publicados', que já muda o Silo). O artigo selecionado na mesa mostra o mesmo cartão, com 'Sugestões de reforço' e 'Reforçar este publicado'. Na tabela, a Forte de QUALQUER Silo vem marcada (fora de outro artigo, até as vagas; a mudança de Silo aparece na confirmação), a Provável desmarcada, e cada keyword aparece num publicado só (o de mais páginas em comum; a linha do outro diz onde ela está). No publicado, 'Gravar reforços (N)' grava tudo o que está marcado, numa confirmação por artigo; no Assunto, 'Aplicar no Assunto (N)' abre a confirmação de 'Aplicar selecionadas'. Depois de gravar, a linha mostra 'Gravado e relido agora' e o total novo de keywords e o volume somado do ArticleDNA relido. Os publicados 'Sem par no lote' ficam na tabela; acima dela, uma linha com 'Buscar keywords para os publicados sem par (até US$ 1,00)', e o resultado cai na linha de cada publicado. As mensagens dizem o que foi gravado e o que não foi (mudar keyword de Silo grava só o Silo: ela ainda não está no artigo); abaixo do painel, 'Sobras · oportunidades de artigo novo' com 'Criar artigo novo com este grupo' e a sobra sem volume recolhida no fim.",
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
    howOnScreen: "Arquiteto → Artigos → Detalhes técnicos → 'Diferenciar publicados que disputam o mesmo assunto (avançado)' → painel 'Publicados que disputam o mesmo assunto': uma linha por grupo, com os publicados, as páginas em comum, o Posto de cada um e a posição de quem ranqueia; marque os grupos e use 'Planejar diferenciação (grátis)' para ver o ângulo de cada página e a faixa de custo antes de qualquer chamada. A opção 'Pedir ângulos à IA (menor autoridade)' é desmarcada por padrão.",
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
    howOnScreen: "Arquiteto → Artigos → Detalhes técnicos → 'Diferenciar publicados que disputam o mesmo assunto (avançado)' → marcar os grupos → 'Planejar diferenciação (grátis)' → 'Buscar e validar (US$ x a y)', com uma confirmação para todos os grupos marcados e o progresso de cada um → a proposta por página (ângulo, principal nova, secundárias com volume, páginas em comum com as irmãs antes → depois, estado e motivo; 'Incluir no aceite' por página) → 'Aceitar grupo' (confirmação e releitura) ou 'Manter como está' (confirmação). Depois do aceite, 'Enviar ao Minerador' leva as keywords novas ao Processador, 'Colocar no artigo' grava as que já estão no Minerador pela formação e 'Aceitar de novo' completa a troca com a mesma avaliação. Um grupo já avaliado reabre o resultado sem cobrar; 'Planejar nova rodada' prepara outra rodada paga.",
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
    howOnScreen: "Arquiteto → Artigos → Detalhes técnicos → 'Análise por keyword (avançado)' → painel 'Mesmo assunto no Google' → tabela 'Reforçar publicados' → 'Gravar reforços (N)': a confirmação lista, por página, o que será gravado, a mudança de Silo e o total depois.",
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
    howOnScreen: "Arquiteto → Artigos → Detalhes técnicos → 'Análise por keyword (avançado)' → painel 'Mesmo assunto no Google' → tabela 'Reforçar publicados': conferir as caixinhas de cada linha (a Forte de qualquer Silo já vem marcada; a Provável, desmarcada; as keywords da busca em lote entram na linha do publicado) e, se for o caso, 'Aceitar a troca' na coluna 'Principal atual' → 'Gravar reforços (N)' acima da tabela, ou 'Reforçar este publicado' no cartão da Revisão do artigo ('Aplicar troca' num publicado sem ArticleDNA, em 'Ver a evidência', abre a mesma confirmação com a troca marcada) → a confirmação lista, por página, o ArticleDNA (novo ou versão), a troca ('Aceitar a troca'), os reforços e as keywords novas; com keyword nova, marcar 'Eu aprovo estas keywords novas no Minerador.' → 'Gravar e reler (N)'. Custo para gravar: zero. O resultado diz o que foi gravado e o que não foi; na tabela, a linha gravada mostra 'Gravado e relido agora' e o total novo (keywords e volume somado) do ArticleDNA relido.",
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
      "Concluir grava tudo (2026-10-01): depois do ArticleDNA, o parecer da SERP que a aprovação usou passa a responder pela formação da mesa (gravado sob a articleFormationRef com o hash que a mesa espera), recebe o aceite humano e a formação entra no marcador como concluída, tudo relido. Antes ficava só sob a ref do candidato calculado: a ficha dizia 'SERP · Não executada' e o 'Pronto para Radar' recusava. Se esse vínculo falhar, o ArticleDNA fica gravado e o desfecho pede 'Gravar reforços' de novo.",
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
    howOnScreen: "Arquiteto → Artigos → Detalhes técnicos → 'Análise por keyword (avançado)' → painel 'Mesmo assunto no Google' → linha 'Sem par no lote' → 'Buscar keywords para os publicados sem par (até US$ 1,00)' → a prévia mostra os publicados, a faixa de custo e o teto de US$ 1,00 → uma confirmação ('Confirmar US$ x a y'; 'Cancelar (nada é pago)') → as sugestões caem na tabela 'Reforçar publicados', na linha de cada publicado (Forte marcada, Provável desmarcada, 'busca em lote' e 'nova no Minerador' no detalhe); quem ficou sem sugestão mostra o motivo na própria linha (erro do Google Ads em tom de aviso). 'Nova busca (outra rodada paga, com prévia)' pede outra rodada. Para gravar, 'Gravar reforços'.",
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
    notes: [
      "Links internos segue a seleção (2026-10-01): 'Processar links' processa o Silo de cada linha marcada, um de cada vez (sem marcação, o Silo do seletor); o grafo é sempre por Silo. A cópia nasce da composição VIGENTE do Silo: se a fase Artigos trocou principal ou membros, a base antiga é trocada pela atual e só ficam as relações que ainda cabem nos papéis; a IA refaz as âncoras. Assim a aprovação seguinte libera os artigos no portão do Radar. Confirmar um grafo igual ao aprovado só avisa que nada mudou. 'Aplicar status → Pronto para Radar' relê antes a SERP dos artigos cuja composição mudou depois da leitura (cache primeiro; só lente que falta entra no plano de pagamento, com escolha) e depois marca sozinho.",
      "Links internos precisam do Silo fechado (par SiloDNA + SiloPage). O fechamento é automático: quando todos os artigos do Silo estão concluídos, ele deriva o Pilar (o artigo que cobre mais buscas; empate pelo volume da Principal) e os Suportes, e grava ArticleDNA pendentes, SiloDNA e SiloPage, com releitura. Enquanto não fecha, a aba Links internos mostra 'Fechamento dos Silos' com o que falta em cada Silo (2026-09-30).",
      "O que barra o fechamento é só do próprio Silo: par de canibalização ou contestação de fronteira de outro Silo não barra este, e um par cujos dois artigos já foram concluídos não barra mais (2026-09-30).",
      "Candidato que não será usado segura o Silo (formação pendente): na revisão do artigo (aba Artigos), 'Tirar este artigo do Silo' devolve as keywords dele para 'sem Silo' pela decisão de Silo de sempre, com confirmação e releitura. Nada é apagado; só vale para candidato não concluído e não publicado.",
      "Silos → 'Confirmar propostas novas' não fecha Silo e não tira keyword de artigo aprovado, de formação concluída ou decidida pela pessoa, nem de Silo fechado: essas ficam onde estão, com aviso, e o resto do plano segue. O Silo fecha pela aba Artigos ('Concluir formação' nos artigos dele); a aba Silos mostra 'Fechamento dos Silos' com o que falta (2026-09-30).",
      "'Concluir formação' fecha tudo o que está selecionado (2026-09-30): quando um artigo precisa de decisão — SERP divergente esperando decisão, par que disputa o tema com os dois lados na seleção, fronteira contestada —, o próprio Concluir mostra UMA confirmação com a lista ('Concluir e manter N'), grava para cada um a mesma decisão do 'Manter composição' (aceitar a composição atual, com releitura) e continua a conclusão sozinho; o fechamento do Silo vem em seguida.",
      "'Manter composição' (revisão do artigo, com motivo) também decide o par que disputa o tema — resolvido quando os dois lados forem mantidos, ou quando a SERP separa os dois — e a fronteira contestada do artigo mantido (fica no Silo atual). A tela lista o que ele decide antes do clique. Mudou a composição, a decisão deixa de valer sozinha (2026-09-30).",
      "Papel no Silo (Pilar/Suporte) aparece nas abas Artigos e Links internos para todo Silo fechado, lido do SiloDNA aprovado. 'Reprocessar arquitetura' não cria Silo novo para endereço de Silo que já existe (consolidado incluído) nem recria Silo desfeito pela pessoa. Reconcluir uma formação já materializada sucede o mesmo ArticleDNA; artigo publicado não é reescrito pelo 'Concluir formação' (2026-09-30).",
      "Não barram o fechamento: keyword com ponteiro de formação concluída em outro Silo (fragmento órfão) e publicado com ArticleDNA aprovado que nunca passou por 'Concluir formação' — ele entra no fechamento pelo próprio ArticleDNA. O Pilar gravado é o articleId do ArticleDNA (2026-09-30).",
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
    requires: ["ArticleDNA aprovado", "Pronto para Radar no Arquiteto, na versão enviada"],
    produces: ["Artigo no Radar, aguardando investigação"],
    cost: "free",
    decision: "human",
    access: "ui",
    screen: "arquiteto",
    howOnScreen: "Arquiteto → selecionar artigos confirmados → Enviar ao Radar; ou Radar → Importar do Arquiteto. Cada artigo volta com o próprio resultado: entrou, já estava no Radar ou o motivo da recusa (sem status no Arquiteto, outro status, base incompleta, outra versão). O Radar só importa com a lista do servidor carregada; sem ela, a tela pede 'Tentar carregar novamente'.",
    routes: ["/api/editorial/workflow"],
    notes: [
      "O envio exige a permissão de aprovar no Arquiteto; por isso fica na tela.",
      "2026-10-09 · a importação responde por artigo (`refused`, com código e motivo): a recusa de um artigo não para os outros nem é copiada para todos. A regra de entrada é a mesma de antes: Pronto para Radar na versão enviada. O Radar recebe o artigo do jeito que o Arquiteto entregou; nada muda no Arquiteto.",
    ],
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
      "O Google é a base de todo artigo (SDD Radar 2026-09-30, decisão do dono): ele começa sempre e é a investigação primária do pacote enviado ao Redator, com a fotografia congelada (observed e lentes). YouTube (o artigo também vira vídeo) e Amazon (também vira review) são acréscimos opcionais: na tela, as abas '+ YouTube (vídeo)' e '+ Amazon (review)' só liberam depois do Google finalizado, e a rota paga recusa sem ele (radar_google_base_required). Eles nunca travam, substituem nem apagam o Google; entram no pacote como camadas de apoio (acréscimo de formato) e o blueprint de vídeo ou de review vai em formatBlueprints. Acrescentar depois de enviar gera pacote novo, e o Redator mostra 'Atualização disponível'. Investigação antiga só de YouTube ou Amazon continua legível como foi entregue.",
      "No Radar, o rótulo do KGR é 'KGR não aplicável' quando o artigo não aplica KGR (o padrão).",
      "A aba Relatório é painel informativo (2026-10-02): mostra a keyword principal, a intenção declarada × a da SERP, o formato dominante, o funil, o Silo e o papel, e o gráfico 'Estado SEO do artigo' — um pilar por diretriz do Google e das respostas de IA (intenção e SERP, cobertura semântica, respostas claras, fontes, especialista, links internos, multimídia, estrutura), com nota e média. Não pede revisão nem aprovação e não alerta; o envio ao Redator nunca dependeu dela. Com o artigo-modelo da SERP do pacote congelado (2026-10-02), 'Estrutura editorial' e 'Links internos' leem a planta: proposta da IA vale 50%, aprovada 100% (links só com os destinos que o grafo aprovado pede). Planta de outro pacote não conta.",
      "Modos de uso dos vídeos (2026-10-02, SDD diretriz editorial, Adendo B): na aba Vídeos, cada vídeo selecionado para o artigo tem 6 botões — Usar como contexto, Sugerir como pauta, Usar como apoio, Marcar citação, Incorporar no artigo, Não usar — além de 'Casar pautas com o conteúdo'. O casamento só SUGERE (borda tracejada, nada gravado); vale o clique do dono. Rota: /api/editorial/radar-video-library, ação SET_USAGE (usage com os 6 modos ou nulo para limpar; usageNote até 2000 caracteres), exige artigo e fonte selecionada, grava com releitura; desmarcar o vídeo limpa o modo. Sem ferramenta MCP: decisão humana na tela.",
      "Como os modos chegam ao entregável: Não usar tira o vídeo (e os trechos dele) do CSV e do artigo-modelo; Contexto é para ler e não citar; Sugestão de pauta é ideia de seção a validar; Apoio e Citação levam trecho com tempo, atribuído ao vídeo; Incorporar leva a URL e a seção sugerida. Valem mesmo sem casamento. Mudar o modo NÃO muda o pacote congelado nem o hash: é lido ao vivo a cada exportação e na geração do artigo-modelo.",
      "Consultas do YouTube (2026-10-02): quando a principal já é uma busca enquadrada (começa por 'como', 'o que', 'por que'… ou já traz o modificador), o plano não acrescenta outro prefixo de enquadramento e registra a limitação 'A keyword principal já é uma busca enquadrada'.",
      "Coleta do YouTube ou da Amazon num artigo do Google finalizado continua visível depois de recarregar (2026-10-02): a cópia de leitura só tira a corrida de um perfil quando a fotografia DESSE perfil existe (migration 20261002130000, função editorial_radar_versao_compactada). Antes, o Google congelado escondia a coleta viva do YouTube e o botão de finalizar.",
      "Plano de consultas do YouTube (2026-10-09): o tópico do ArticleDNA que o reajuste do Arquiteto tirou do escopo (excludedSubjects, a nota de diferenciação, a fronteira anticanibalização) ou que é ruído (chamada, inglês, título de post, superstição…) não vira consulta paga, e a limitação diz qual saiu e por quê. As keywords e o Assunto sempre entram.",
      "Análise da Amazon (2026-10-09): o blueprint, as faixas de preço, os critérios, a reputação, os sinais de compra e os cards leem só os produtos compatíveis com o alvo quando há tipo de produto ou filtro de marca; a prateleira inteira continua contada como evidência, e a base é dita nas limitações. Produtos escolhidos à mão (review, X vs Y, comparação) e a busca sem filtro continuam lendo a prateleira como contexto. Finalizar um blueprint analisado antes desta regra refaz a análise na base nova, sem custo e sem provider. Investigação já congelada continua como foi gravada: mesmo hash, mesma leitura.",
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
      "/api/editorial/expert-contributions/platform",
    ],
    notes: [
      "O ponto de revisão escolhido na revisão ('Relacionar a outro ponto de revisão') vale no pacote: a resposta de uma pauta avulsa, associada e aceita, entra na camada do especialista (2026-09-30).",
      "Parecer direto (SDD Radar 2026-09-30, Parte B): na aba Especialista, o bloco 'Escrever o parecer aqui' deixa o especialista com acesso à plataforma escrever sem Telegram — resposta a um ponto de revisão, fechamento do artigo, argumentação do CTA ou diretriz de conteúdo (até 20.000 caracteres). O parecer entra em 'Respostas recebidas' com o canal 'Plataforma' e passa pela mesma revisão humana das respostas do Telegram; só vai ao pacote (Redator e CSV) depois de aceito. Exige permissão de edição do Radar e grava quem escreveu. O bloco aparece mesmo com a Marca sem especialista cadastrado: a opção 'Eu mesmo (quem está logado)' cria ou reaproveita o registro de especialista de quem digita. O parecer escrito pelo próprio especialista logado entra JÁ ACEITO (decisão do dono, 2026-10-02); o de Telegram ou de outro especialista continua pela revisão. No CSV 'para escrever', o parecer de Fechamento conduz a virada final, o de CTA a chamada final e o de Diretriz vale para o artigo inteiro; parecer pendente aparece com aviso.",
    ],
  },
  {
    id: "radar.finalize",
    stage: "radar",
    title: "Finalizar a investigação",
    purpose: "Encerrar a investigação e congelar o pacote de evidências; em seguida a IA organiza o artigo-modelo da SERP.",
    requires: ["Investigação com evidência suficiente"],
    produces: ["Pacote do Radar finalizado", "Artigo-modelo da SERP concluído"],
    cost: "paid_ai",
    decision: "human",
    access: "ui",
    screen: "radar",
    howOnScreen: "Radar → artigo → Google: na área Pesquisa, 'Analisar concorrência · e finaliza (+ até 2 chamadas de IA)' analisa e finaliza sozinho; o manual é 'Finalizar pesquisa · inclui até 2 chamadas de IA'. YouTube e Amazon: 'Finalizar investigação · inclui até 2 chamadas de IA' nas abas '+ YouTube (vídeo)' e '+ Amazon (review)'; ao fim da coleta finalizam sozinhos pela regra do Google (consulta e apoio que falham viram limitação registrada; a Amazon analisa antes, sem chamada paga).",
    routes: [],
    notes: [
      "Finalização automática nos três perfis com UMA regra (2026-10-09, regra do dono: o processo do piloto substitui o antigo; a D9 de 2026-10-02 deixou de valer no YouTube e na Amazon). Consulta que falhou e apoio do Google que falhou NÃO param: a investigação finaliza e a limitação fica registrada no congelamento com a mesma frase que a tela diz — 'N consulta(s) do YouTube/da Amazon falharam na coleta (\"…\"); o universo competitivo foi montado sem elas.' e 'O apoio de busca do Google não entrou nesta análise: perguntas, refinamentos e sinais de formato externos não foram considerados.' YouTube: congela ao fim da coleta (depois do apoio) e ao fim de 'Repetir apoio', inclusive quando o apoio falha de novo. Amazon: a coleta segue sozinha, analisa (sem chamada paga) e congela; a consulta que falhou é escrita pelo próprio congelamento a partir da corrida, e o apoio ausente pelo SUPPORT_MISSING do blueprint. Só param: coleta em andamento; coleta sem nenhuma consulta concluída ou sem nenhum vídeo ou produto; apoio do Google cuja gravação não se confirmou (botão 'Repetir apoio' no YouTube; 'Tentar novamente apoio Google' na Amazon); gravação ou releitura do servidor não confirmadas; e, na Amazon, shortlist elegível vazia (nenhum produto da coleta compatível com o alvo declarado; o guia de compra passa) e configuração do alvo que não corresponde à coleta (nem declarada no mesmo START, nem com as mesmas consultas). Nesses dois casos da Amazon o botão é 'Zerar pesquisa Amazon', e a coleta nova é paga. Quando para, a frase diz o motivo, a área ('+ YouTube (vídeo)' ou '+ Amazon (review)') e o nome exato do botão. O botão manual 'Finalizar investigação · inclui até 2 chamadas de IA' continua, congela pela mesma rotina e registra as mesmas limitações. Congelamentos anteriores não mudam. O reparo ('Reparar congelamento (YouTube)/(Amazon)') pode passar a mostrar 'Mudaram as limitações declaradas' quando a corrida congelada tinha consulta que falhou (no YouTube, também apoio que falhou); só o recongelamento confirmado na tela, que é grátis, as grava.",
      "Fotografia nova do YouTube (2026-10-09): o FINALIZE nasce da amostra pertinente (mesmo público, público vizinho e tema geral) — coortes, formato, faixa de duração, estratégia, títulos e lacunas — e não grava roteiro, gancho nem Shorts. A limitação 'Amostra pertinente (régua de 2026-10-09): …' diz quantos vídeos entraram e quantos ficaram fora. A fotografia gravada antes é lida como foi gravada, com o mesmo hash de pacote. Para ela, 'Reparar congelamento (YouTube)' pode oferecer o recongelamento grátis pela régua nova (o blueprint recalculado difere): é decisão humana na tela, e nada muda sem o clique.",
      "Google termina a Fase 1 sozinho (decisão do dono, 2026-10-08): 'Analisar concorrência · e finaliza (+ até 2 chamadas de IA)' lê as páginas, grava a análise, relê o servidor e finaliza pela mesma rotina do botão manual. Página sem acesso, página que não devolveu nada ou que o contrato de extração recusou, amostra insuficiente e consulta auxiliar que falhou NÃO param: finaliza com a limitação registrada no pacote congelado (a insuficiência em acknowledgedInsufficiency; a consulta que falhou em limitations). Página que ainda ficar sem desfecho é lida de novo uma vez (rodada extra só com ela) antes de decidir. Só param: intenção da SERP em conflito com a declarada, nenhuma página lida, fundamento mudado (pesquisa a refazer), etapa paga ainda faltando ('Completar Pesquisa Google') e gravação não confirmada. Quando para, a frase diz o motivo, a área e o nome exato do botão que a tela mostra naquele estado. A conta da análise e a da Fase 1 são a mesma (selecionadas = analisadas + sem acesso + pendentes, por URL normalizada); a página lida conta pela URL que a seleção pediu, não pela final do redirect. Revisão de 2026-10-08: se NENHUMA página da amostra abrir (todas as candidatas recusadas e nenhuma já lida), as falhas ficam gravadas como limitação, nada é consolidado e a frase manda para 'Refazer Pesquisa Google' na área Pesquisa (pesquisa paga nova, decisão do usuário); duas referências que terminam na mesma página contam o conteúdo uma vez (a repetida vira limitação declarada); o modelo, a suficiência e o pacote congelado contam só as páginas da seleção (extração órfã fora); as canônicas da SERP só entram na conta com a curadoria da pesquisa confirmada. A rota de detalhe /{brandRef}/radar/{articleId} fecha a rodada de extração pela mesma regra.",
      "Reparar congelamento (2026-10-02, SDD diretriz editorial, Adendo E): um botão por perfil, só sobre a investigação já finalizada — 'Reparar congelamento (Google)' na Pesquisa, '(YouTube)' e '(Amazon)' nas abas de acréscimo. O clique abre uma prévia que só lê: relê o servidor, refaz a fotografia com a leitura de hoje sem gravar e compara. Saídas: nada a reparar (nada grava); recongelar com a leitura atual (grátis, sem provider: o Google reabre e congela pela mesma rotina de Finalizar, o YouTube grava a fotografia nova numa escrita, a Amazon pela ação 'refreeze' da rota /api/editorial/radar-amazon-search, com dryRun para a prévia); ou, quando o material gravado não basta, zerar e coletar de novo (pago, só aquele perfil; a coleta começa depois de o servidor confirmar o reset). Recongelar o perfil PRIMÁRIO (o Google, num artigo do Google) muda a identidade do pacote: o artigo-modelo é organizado de novo (1 chamada de IA, mais 1 se houver correção) e sai concluído; recongelar só o YouTube num artigo do Google mantém o artigo-modelo concluído do mesmo congelamento primário e ArticleDNA, sem chamada de IA (2026-10-08, P0-A). A Amazon, desde 2026-10-09, também prende o artigo-modelo organizado a partir dessa data (amazonFrozenAt): recongelar a Amazon, ou congelá-la pela primeira vez depois da planta, desliga essa planta, e o artigo-modelo precisa ser organizado de novo para o bloco comercial entrar (até 2 chamadas de IA, dito no botão antes do clique); a planta organizada antes de 2026-10-09, sem esse registro, continua valendo. URL, slug, canonical, keyword, papel e Silo não mudam. Sem ferramenta MCP: decisão humana na tela.",
      "Congelar dispara a organização do artigo-modelo da SERP (D7): até 2 chamadas de IA (DeepSeek da plataforma, cota da marca) — 1 para organizar e, se a resposta vier cortada ou a conferência apontar o que corrigir, mais 1, nunca as duas. Desde a correção de 2026-10-09, os botões de finalizar dizem o teto antes do clique ('e finaliza (+ até 2 chamadas de IA)', 'inclui até 2 chamadas de IA'), o mesmo do export, do envio e do MCP. Se o pacote congelado já tem artigo-modelo concluído (ex.: acrescentar YouTube a um artigo do Google não muda o pacote), o encadeamento automático reaproveita a versão e não paga de novo; desde 2026-10-08 (P0-A), reaproveita também a concluída da MESMA investigação (mesmo congelamento e mesmo ArticleDNA) quando o hash do dossiê mudou só por código — re-congelada ou com ArticleDNA novo, organiza de novo; desde 2026-10-09, só a versão CONCLUÍDA conta (a não concluída nunca é reaproveitada) e a Amazon congelada também entra no vínculo (ver 'Artigo-modelo da SERP'). Se a IA falhar, a investigação continua finalizada e o painel oferece organizar de novo.",
    ],
  },
  {
    id: "radar.article_blueprint",
    stage: "radar",
    title: "Artigo-modelo da SERP — a planta do artigo que a SERP pede",
    purpose: "Organizar o que a SERP já entrega na planta do artigo que vence a SERP. O esqueleto vem dos concorrentes comparáveis (H2/H3 com id próprio, medidas de H2, H3, parágrafos, negritos, imagens e palavras); a IA só ordena, nomeia e liga esse esqueleto às evidências — sentido das keywords, H1/SEO title/meta, seções com a pergunta do leitor, links internos (quantos, onde, para quem) e externos, abertura, fechamento na voz do especialista e plano visual (capa + 2–3 respiros com prompt, ALT e legenda). Vale para qualquer tipo de página: artigo, review, landing page ou página de serviço.",
    requires: ["Pacote do Radar finalizado"],
    produces: ["Artigo-modelo da SERP concluído: a única estrutura de todo entregável — CSV 'Para escrever', CSV de vídeo, CSV técnico, export por Silo, envio ao Redator, Redator e MCP"],
    cost: "paid_ai",
    decision: "human",
    access: "ui",
    screen: "radar",
    howOnScreen: "Radar → artigo finalizado → Pesquisa → Artigo-modelo da SERP (vem primeiro; o antigo 'Blueprint editorial' virou o 'Esqueleto da SERP', recolhido abaixo, como insumo): já sai concluído ao finalizar. Sem nenhuma versão, 'Organizar o artigo-modelo da SERP (IA)'; com versão, 'Organizar de novo (IA)' refaz a planta. Para mudar, Editar (a edição vira a versão vigente). Organizar custa até 2 chamadas de IA por artigo, dito no botão antes do clique, e a tela confirma. Em lote, a barra do Radar: 'Organizar o artigo-modelo (N) · + até 2N chamadas de IA' (a seleção) e 'Organizar o artigo-modelo do Silo (M) · …' (o Silo das linhas). No export que parou por falta da planta: 'Organizar N artigo(s)-modelo e exportar (+ até 2N chamadas de IA)'. No envio: 'Organizar o artigo-modelo e enviar (+ até 2 chamadas de IA)'.",
    routes: ["/api/editorial/radar-article-blueprint"],
    notes: [
      "SDD docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md, Adendo A (D5) e Adendo D (D7, D8, 2026-10-02). Organizado ao FINALIZAR a investigação (D7): até 2 chamadas de IA (DeepSeek da plataforma, cota da marca) sobre o pacote congelado — 1 para organizar e, se a resposta vier cortada, fora do formato ou a conferência apontar o que corrigir, mais 1, nunca as duas. O encadeamento automático manda ifMissing e reaproveita a versão do MESMO pacote (desde 2026-10-09, só a CONCLUÍDA do mesmo congelamento, do mesmo ArticleDNA e da mesma Amazon congelada; a não concluída nunca é reaproveitada); o botão 'Organizar de novo (IA)' organiza de novo de propósito.",
      "Concluído na gravação (D10, decisão do dono, 2026-10-02, substitui D8): CSV, Redator e MCP não recebem algo inconcluso nem aviso de aprovação. Organizar grava a versão já concluída; com pendência na conferência, a IA recebe a lista e devolve a planta corrigida (1 chamada a mais; pulada se a primeira resposta já precisou de nova tentativa), e a conferência fecha o que dá sem IA (a origem M que não trata do assunto da seção sai). O que restar fica registrado na versão (o painel mostra), nunca no entregável. Editar grava outra versão concluída, que vira a vigente.",
      "Autoria e voz: a planta recebe quem assina (o especialista da aba Especialista) e fatias compactas da Skill de voz da Marca por assunto (leitor, título, estrutura, CTA, plano visual), sem inflar a resposta da IA. O tipo da unidade (do ArticleDNA: artigo, SiloPage, landing page, serviço…) e o formato que a SERP pediu vão à IA e mandam na forma da planta.",
      "A voz segue a Skill da Marca (versão corrente não arquivada, rascunho incluído): promessa, H1, abertura, CTA, transição comercial e prompts de imagem seguem a voz; página do próprio site da marca citada na Skill (ex.: a página comercial) vira candidata a link do CTA. O payload registra a versão da Skill usada.",
      "O artigo-modelo concluído do pacote entregue chega ao Redator (2026-10-02, D10): get_writer_foundations traz articleBlueprint (H1, SEO title, meta, promessa, leitor, ângulo, abertura, seções com a pergunta do leitor, a resposta que abre, H3 e links internos com o destino resolvido, fechamento com CTA e próximo passo, medidas do plano); o manifesto lista radar.blueprint/<id>; a planta inteira sai por read_writer_evidence radar.blueprint/<id>. É lido ao vivo por Marca + artigo + hash do pacote, não viaja no envio nem é gravado no documento; desde 2026-10-08 (P0-A), sem o hash exato vale a concluída mais nova organizada sobre o MESMO congelamento e o MESMO ArticleDNA do envio (o hash do dossiê muda com o código que lê a amostra; a investigação, não). Planta de outro congelamento (re-congelada) ou de outro ArticleDNA não vale: o Redator avisa — organize no Radar a do pacote entregue ou reenvie o pacote atual. Desde 2026-10-08 a leitura do Redator aplica os nomes atuais de produto e marca as frases que só entram com fonte (needsSource) — também no artigo-modelo antigo, porque é leitura — e traz o mapa da atualização (publishedMap) da planta que leu a página publicada ao organizar (ver 'Ler o dossiê do artigo').",
      "Conferências da planta (2026-10-02): além de id, Silo, fonte, escopo e FAQ, o servidor acha a seção que cita uma origem M de outro assunto, a afirmação absoluta ('foi feito para…', 'procuram no Google, não no…', 'nunca', 'sempre') e duas seções quase iguais; com isso a IA corrige numa passada (D10) e o que sobrar fica na versão, fora do entregável. O pedido à IA tem a regra 19: uma entrega por seção, e o conteúdo prático cedo.",
      "O servidor confere a resposta contra o pacote: id de evidência inexistente sai, link para fora do Silo sai, fonte externa sem verificação fica sem fonte (o entregável diz a regra concluída: a afirmação sai delimitada e sem link externo — 2026-10-08, D10), seção fora do escopo ou de FAQ sai; com menos de 3 seções válidas, recusa. As medidas vêm dos concorrentes comparáveis, não da IA.",
      "Rodada dos entregáveis (2026-10-08, desenho a partir dos CSVs reais de 08/10): (1) a IA vê a página publicada — no artigo publicado com URL, a organização lê o H1 e os H2 de hoje com o MESMO leitor da exportação (só GET, até 10 s; falha, tempo esgotado ou página vazia seguem sem ela; reaproveitar a versão do pacote não lê nada); o que a página já cobre dentro do escopo e a amostra não cobre é diferencial e fica na planta, e a planta grava o mapa da atualização (publishedMap: cada H2 de hoje → a seção que o absorve, ou sai com motivo; o que a IA omitir é casado pelo título, e nada sai sem decisão); (2) a abertura e a 1ª seção respondem à busca — principal 'como …' pede a 1ª seção prática, e a tese da marca vem depois sem negar o assunto; (3) TODA afirmação absoluta das seções vira nota (antes, só a primeira), e a régua por sentido do Radar aponta efeito comercial, comportamento do público e plataforma afirmados sem fonte, também na promessa, no ângulo, na abertura e na virada — a tese que nega o efeito passa; (4) nomes atuais de produto: 'Google Meu Negócio' e 'Google My Business' viram 'Perfil da Empresa no Google' na conferência e na leitura para o export e o Redator (artigo-modelo antigo incluído); a keyword que traz o nome antigo e a menção 'antigo …' ficam; (5) o plano visual segue o 'Evitar' da voz e não repete sujeito e objeto em duas imagens (ex.: profissional com celular na capa e num respiro); (6) o ângulo é a ENTREGA concreta que a amostra não tem (exemplo comentado, checklist de diagnóstico, comparação), não a costura de temas, e só cita a evidência que o sustenta; (7) a versão das regras fica gravada (rulesVersion '2026-10-08'; desde 2026-10-09, '2026-10-09' e, com a regra do dono do mesmo dia, '2026-10-09b'; o aviso diz o que falta pela versão gravada): a planta montada antes ganha, na tela do Radar, o aviso de que foi montada com regras anteriores e o caminho 'Organizar de novo (IA)' (sem botão novo; pago, confirma o custo); (8) os parágrafos do plano saem da faixa de palavras ÷ palavras por parágrafo dos concorrentes, com a parte de cada seção pelo peso da IA ('~N parágrafos por seção' sem medida), e a contagem concorda ('1 link externo'). As notas novas pedem ação antes de concluir, então a passada de correção (1 chamada a mais) tende a disparar mais; elas ficam só no painel, nunca no entregável. O payload antigo continua válido: os campos novos são opcionais.",
      "Versões append-only presas ao hash do pacote: cada organização e cada edição é uma versão nova, concluída e imutável. Refinalizar a investigação organiza de novo. No CSV vale a versão CONCLUÍDA mais nova do pacote vigente (título e SEO, promessa, estrutura, links internos, plano visual), sem marca de proposta; sem nenhuma, desde 2026-10-09 nenhum formato sai (409 needs_article_blueprint — ver a nota da regra do dono). Desde 2026-10-08 (P0-A), presas à INVESTIGAÇÃO: a versão grava o congelamento e o ArticleDNA em que foi organizada; vale a do hash exato e, sem ela, a concluída mais nova do mesmo congelamento e ArticleDNA (a antiga, sem esse registro, pela data: organizada depois do congelamento vigente e na vigência da versão do ArticleDNA). Mudança de código que muda o hash do dossiê não tira o artigo-modelo do CSV, do Redator nem do MCP, e o entregável não diz nada disso (D10); re-congelar ou um ArticleDNA novo, sim.",
      /* 2026-10-09 · regra do dono: o processo do piloto substitui o antigo em toda operação. */
      "O artigo-modelo é obrigatório em toda entrega (2026-10-09, regra do dono: 'tudo que é de processos antigos tem que ser substituído pelos novos processos dos pilotos'). Os quatro formatos da rota /api/editorial/radar-export — 'Para escrever', 'para vídeo e redes sociais', técnico e por Silo — exigem a versão CONCLUÍDA (APPROVED) de cada artigo, da investigação congelada e do ArticleDNA transportado pelo item do Radar (radarArticleBlueprintPick). Sem ela, nada sai pelo modelo editorial antigo: a rota responde 409 { code: 'needs_article_blueprint', missingArticleBlueprints: [{ articleId, title }], maxAiCalls: 2N, refused }, e a leitura da planta que falha responde 503 'blueprint_unavailable' (tente de novo; nada foi montado sem a planta). Versão não concluída (DRAFT) não vai a nenhuma entrega: o painel a oferece para concluir. O modelo editorial antigo e o blueprint competitivo continuam só como insumo do gerador (o 'Esqueleto da SERP'). O envio ao Redator também exige a planta (ver 'Enviar ao Redator'). O painel aparece também em investigação só de Amazon ou só de YouTube.",
      "Pelo MCP não se organiza o artigo-modelo: organizar chama a IA (paga) e é ato humano na tela; não há ferramenta nem escopo para isso. get_article_for_writing, get_video_material e send_radar_to_writer recusam sem a planta concluída com o que falta e a ação na tela (onde, os botões e o custo, até 2 chamadas de IA por artigo); get_writer_brief e get_writer_foundations dizem o estado em articleBlueprintState. Mostre a ação ao usuário e chame de novo depois que ele organizar.",
      "A Amazon no artigo-modelo (2026-10-09, regras '2026-10-09b'): com a Amazon congelada, o pedido à IA leva o bloco comercial — o formato da review, a quantidade e o critério do ranking, o uso, a classe e o filtro de marca, a shortlist (evidências Z, só os produtos compatíveis com o alvo), os critérios de comparação (evidências Q) e o aviso de afiliado — com a regra 25 (review pela Amazon congelada: só os produtos Z, comparados pelos critérios Q, nota e preço como sinal da prateleira, veredito pelo critério declarado). O vínculo da planta passou a incluir o congelamento da Amazon (amazonFrozenAt, aditivo): a Amazon congelada de novo, ou pela primeira vez depois da planta, desliga a planta organizada desde 2026-10-09 e pede organizar de novo; planta mais antiga, sem esse registro, continua valendo. 'Organizar de novo (IA)' é o caminho quando o artigo tem Amazon congelada e a planta foi montada com regras anteriores.",
      "As exclusões dos reajustes valem no artigo-modelo (2026-10-09, regras '2026-10-09b'): o que o Arquiteto gravou no ArticleDNA ao reajustar o artigo — assuntos excluídos (excludedSubjects), a nota de diferenciação com o artigo dono e a fronteira anticanibalização — entra no pedido como fora do escopo DURO, com a regra 26 (não vira seção, H3, pergunta, diferencial, ângulo nem demonstração; de outro artigo, no máximo mencionado e linkado), e a conferência tira a seção que o cubra. Na planta já concluída, a leitura do CSV 'Para escrever' tira a seção que cobre um assunto excluído, com a nota 'Sai do artigo-modelo (exclusão do ArticleDNA, decidida no Arquiteto)', e o 'Não cobrir' diz que o ArticleDNA tira o assunto; o H2 publicado sobre o assunto excluído sai do mapa da atualização. Desde a correção de 2026-10-09, a planta já concluída é lida com a exclusão em todo entregável — CSV 'Para escrever', CSV de vídeo e o plano do vídeo do Redator (a seção excluída não vira capítulo, corte, cena nem lâmina; cortes_para_redes diz 'Fora do vídeo (exclusão do ArticleDNA, decidida no Arquiteto): …'), CSV técnico e fundamentos do Redator; o pedido e a conferência a aplicam em toda planta nova. Nada disso entra no hash do pacote.",
      "Tela do artigo-modelo, correção de 2026-10-09: (1) na aba '+ Amazon (review)', o painel 'Artigo-modelo da SERP' vem ANTES do painel da Amazon, e o modelo comercial antigo desceu para 'Esqueleto da SERP · o que a prateleira mostra (insumo do artigo-modelo)', recolhido; o selo do esqueleto diz 'Esqueleto completo' ('Pronto para o Redator' só existe com a planta). (2) O fechamento mostra o próximo passo como 'Leitura seguinte (opcional, não é uma chamada)'; o próximo passo que chama não aparece (a única chamada é o CTA). (3) Quando a leitura das versões falha, o envio diz 'Não foi possível conferir o artigo-modelo desta investigação agora' e não oferece organizar (pago) — antes a falha de leitura virava 'falta organizar'.",
      "A versão do ArticleDNA que vale no Radar (2026-10-09, correção) é a TRANSPORTADA pelo item do Radar — a que o Arquiteto enviou (RadarItem.articleDnaVersionId, a coluna source_version_id do item, o vínculo do congelamento) — na montagem do export (os CSVs, get_article_for_writing, get_video_material e a geração do artigo-modelo, pela versão que a análise corrente carrega), na análise da Amazon, no envio ao Redator (pelo item), no START do YouTube e da Amazon (a versão que a tela manda, a do item) e no apoio do Google. Existindo no acervo, ela vale mesmo com uma aprovada mais nova; sem versão transportada, vale a regra da mesa do Arquiteto (radarCurrentArticleDnaVersion: a última aprovada pelo status efetivo; sem aprovada, a mais nova viva), sem depender da ordem da leitura. Por isso 'Gravar melhorias' num artigo que já está no Radar não trava a coleta, o export, a planta nem o envio: o Radar segue na versão enviada, com a investigação e o artigo-modelo dela. A versão nova só chega ao Radar pelo reenvio da versão nova ao Radar, que ainda não existe: é proposta registrada no backlog do Radar e do Arquiteto (mudança de workflow, exige SDD e autorização), que atualiza o item existente e depois reinvestiga e reorganiza o artigo-modelo. Não ofereça 'reinvestigar no Radar' para levar a versão nova: esse caminho não existe.",
    ],
  },
  {
    id: "radar.send_to_writer",
    stage: "radar",
    title: "Enviar ao Redator",
    purpose: "Criar o documento do Redator a partir do pacote finalizado, com o dossiê inteiro.",
    requires: ["Pacote do Radar finalizado", "Artigo-modelo da SERP concluído do pacote (do congelamento e do ArticleDNA transportado pelo item do Radar)"],
    produces: ["ContentDocument em 'planejado' no Redator"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["send_radar_to_writer"],
    screen: "radar",
    howOnScreen: "Radar → artigo finalizado → Enviar ao Redator (individual ou em lote). Sem o artigo-modelo concluído, o botão é 'Organizar o artigo-modelo e enviar (+ até 2 chamadas de IA)', com confirmação; o envio em lote marca os recusados por falta do artigo-modelo e diz o caminho.",
    routes: ["/api/editorial/radar-writer-handoff"],
    notes: [
      "Idempotente: repetir devolve o documento existente. Documento existente com outro pacote nunca é sobrescrito.",
      "O envio exige o artigo-modelo concluído (2026-10-09, regra do dono), pela MESMA leitura do Redator, na tela, no lote e no MCP (o mesmo núcleo sendRadarToWriter): sem ele, nada é criado e a recusa é 409 'radar_handoff_article_blueprint_missing', com o bloqueio ARTICLE_BLUEPRINT_MISSING ('O envio ao Redator leva o artigo-modelo concluído desta investigação: organize o artigo-modelo da SERP (Pesquisa → Artigo-modelo da SERP).'); a leitura que falha é 503 'radar_handoff_article_blueprint_unreadable'. A planta não entra no pacote nem no hash. Pelo MCP, cada artigo recusado traz a ação na tela (onde organizar e o custo) e a resposta junta os ids em needsArticleBlueprint; o MCP não organiza: mostre ao usuário onde clicar e envie de novo depois.",
      "'Pronto para o Redator' só com a planta (2026-10-09): no Relatório, 'Pacote para o Redator?' fica READY apenas com o artigo-modelo concluído conferido; sem a conferência, PENDING ('o envio ao Redator confere o artigo-modelo'). No CSV técnico, research_status_md diz 'PRONTO PARA O REDATOR' citando a planta, ou 'BLOQUEADO PARA O REDATOR' com o motivo da planta ausente.",
      "Correção de 2026-10-09 no envio (tela, lote e MCP send_radar_to_writer): (1) a versão do ArticleDNA é a TRANSPORTADA pelo item do Radar (a que o Arquiteto enviou; radarCurrentArticleDnaVersion com transportedVersionId) — a mesma do export, da planta e da semeadura; sem versão transportada, a vigente da mesa (a última aprovada; sem aprovada, a mais nova viva). O envio, o START do YouTube e o apoio do Google escolhiam a primeira que o banco devolvia e conferiam a planta com outro ArticleDNA. (2) A conferência da planta leva o congelamento da Amazon do pacote (amazonFrozenAt), como o Redator, o CSV e o MCP: a planta organizada antes de a Amazon ser congelada (de novo) também é recusada no envio. (3) O documento grava a virada do Assunto pela seção da planta concluída (a leitura com o conteúdo, sem IA), e get_writer_brief serve as linhas do Assunto pela planta, como o painel e os fundamentos. (4) 'Organizar o artigo-modelo e enviar' e 'Organizar N artigo(s)-modelo e exportar' organizam só se faltar (ifMissing): a planta concluída da mesma investigação não é paga de novo. Num artigo que já está no Radar e ganhou versão nova aprovada do ArticleDNA (reajuste 'Gravar melhorias'), o envio continua na versão transportada pelo item: a investigação congelada e a planta dela seguem valendo, e o documento do Redator nasce sobre a versão enviada. Levar a versão nova ao Radar depende do reenvio da versão nova ao Radar, pendência registrada no backlog do Radar e do Arquiteto (exige SDD).",
    ],
  },
  {
    id: "radar.export_for_writing",
    stage: "radar",
    title: "Exportar 'Para escrever' (CSV/markdown)",
    purpose: "Levar o dossiê do artigo para escrever fora da plataforma.",
    requires: ["Pacote do Radar finalizado", "Artigo-modelo da SERP concluído de cada artigo"],
    produces: ["Arquivo portátil com keywords, SERP, a estrutura do artigo-modelo, Assunto e links"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["get_article_for_writing"],
    screen: "radar",
    howOnScreen: "Radar → Exportar → Para escrever. Sem o artigo-modelo concluído de algum artigo, o pedido para e o próprio botão vira 'Organizar N artigo(s)-modelo e exportar (+ até 2N chamadas de IA)': confirma o custo, organiza em série com progresso e exporta no fim (com falha, não exporta).",
    routes: ["/api/editorial/radar-export"],
    notes: [
      "Pelo MCP (2026-09-30): get_article_for_writing devolve o MESMO CSV 'Para escrever' da tela, de um artigo com investigação finalizada. Grátis e só leitura: nunca chama provider. O CSV vem em partes (part 1 … parts); junte na ordem. A coluna pode_escrever diz se há bloqueio. Desde 2026-10-09 a ferramenta segue a rota passo a passo (lib/server/radar-mcp-material.ts): a mesma montagem (assembleRadarPortableExport), a mesma exigência do artigo-modelo concluído antes de qualquer projeção (radarPortableExportMissingBlueprints) e a mesma projeção (radarPortableWritingExport). Sem a planta, a resposta é o erro needs_article_blueprint com missingArticleBlueprints [{ articleId, title }], maxAiCalls e a ação na tela; a leitura da planta que falha é blueprint_unavailable.",
      "Correção de 2026-10-09 (CSV técnico e portão): o técnico lê a planta pelas regras do piloto — a trava de fonte com as afirmações do pacote (radarPendingClaims + radarClaimCommonStems), as exclusões do ArticleDNA (a seção excluída sai, com a nota), o próximo passo que chama fora (sem segunda chamada no fechamento) e, no writer_brief_md, só o contrato da planta: objetivo pelo ArticleDNA, 'Formato: o do artigo-modelo da SERP concluído', o SEO da planta e as fontes do pacote; a 'ESTRATÉGIA PARA SUPERAR A SERP' sai do brief (fica na coluna serp_outperformance_strategy_md, auditoria). A regra que fecha a lista de quem escreve passou a 'o que não tem fonte do pacote entra delimitado ou fica fora do texto' (D10). No modo 'writing', a investigação de vídeo como perfil primário não pede o artigo-modelo (a linha dela é só a identidade, bloqueada): a rota e get_article_for_writing usam a mesma regra do portão puro da escrita, e o 409 não cobra planta que o arquivo não lê.",
      "CSV 'Para escrever' só pelo artigo-modelo (2026-10-09, regra do dono): título, promessa, estrutura, links e plano visual vêm só da planta concluída; a versão não concluída conta como falta. 'Como superar' (cobrir_e_superar) diz o que a planta assumiu: a abertura da planta, 'Cobrir/Diferenciar em X na seção Y', a entrega da planta e o E-E-A-T; fica o conflito que pede decisão humana (diferencial que o ArticleDNA declara e o Radar marca fora do escopo). Não existem mais 'estrutura sugerida', 'Sustentar…', 'Já coberto pela maioria', 'Explicar a divergência', nem tronco, virada ou direção do H1 nas colunas: o Assunto e o destino da virada aparecem na coluna artigo, e a virada e a direção do H1 vão ao pedido do artigo-modelo. A regra geral do topo diz: 'A estrutura de cada artigo é a do artigo-modelo da SERP (coluna estrutura): siga as seções, as medidas, os links e as imagens da planta; a redação é de quem escreve.' As réguas que o CSV antigo aplicava sem planta (fecho retórico, cabeçalho ruidoso pela unidade, pergunta que toca o 'Não cobrir') passaram ao esqueleto que o gerador do artigo-modelo recebe. Valem para todo artigo, inclusive investigação antiga só de YouTube: a rota recusa qualquer artigo sem a planta concluída. As notas abaixo que falam do CSV sem artigo-modelo descrevem réguas que hoje moram no esqueleto do gerador, não um arquivo que ainda sai.",
      "Formatos da rota (2026-10-09): sem `mode`, a rota usa 'writing' (antes 'full'); o técnico é pedido explícito ('full'). CSV técnico: com a planta, título, alternativas, promessa, abertura, fechamento, estrutura (outline_md/outline_json), links internos, plano visual, capa, respiros, SEO title e meta saem do artigo-modelo, writer_brief_md e writer_context_md seguem as mesmas colunas da planta, e external_writer_prompt_md manda escrever por ele. A situação da investigação (research_status_md) diz se a parte comercial está nas colunas desta linha e que o roteiro de vídeo sai pelo artigo-modelo no CSV de vídeo.",
      "Parte comercial da Amazon em qualquer perfil (2026-10-09): com o Google finalizado e a Amazon acrescentada como review, o export leva a parte comercial da Amazon congelada — produtos da shortlist (só os compatíveis com o alvo), links limpos, critérios de comparação e aviso de afiliado; sem produto selecionado, a recusa 'nenhum produto foi selecionado'. É projeção, fora do pacote e do hash. O CSV técnico a traz em commercial_plan_md, selected_products_json e promotion_links_json, e ela entra no pedido do artigo-modelo (ver 'Artigo-modelo da SERP'). Desde a correção de 2026-10-09, o CSV 'Para escrever' também traz, com o Google como base e a Amazon como review, a coluna produtos (links limpos), a ressalva do parcial e 'Coloque o aviso de afiliado antes do primeiro link de produto'. Sem produto selecionado: no perfil AMAZON a linha é bloqueada ('nenhum produto foi selecionado'); com o Google como base, a ressalva diz que a parte de review fica fora do texto e que nenhum produto fora do arquivo entra (bloquear o artigo inteiro nesse caso é decisão do dono). O gerador do artigo-modelo recebe o bloco comercial COMPLETO da Amazon congelada (faixas de preço, regras de escrita, limitações e o esqueleto comercial como matéria-prima), fora do pacote e do hash.",
      "Papel no Silo (2026-10-08): o Radar lê o papel que o Arquiteto decidiu na fase Silos — o SiloDNA vigente do Silo do artigo (Pilar, Suportes e ordem narrativa) e, sem ele em mãos, a foto do envio ao Radar. ArticleDNA.hierarchy é só a sugestão da formação: aparece marcada '(formação)' quando o Silo não decidiu, e nunca como decisão. Planilha, perfil, Workbench, contexto KGR, CSVs, artigo-modelo e get_article_for_writing usam a mesma régua; get_article_for_writing recebe o Silo como o botão 'Para escrever' (ordem, papéis, link Suporte → Pilar e SiloPage resolvidos pelo SiloDNA, links pelo nó do grafo aprovado). O Pilar não recebe planta de Suporte nem link para si mesmo. O Radar nunca grava papel: trocar o Pilar é no Arquiteto.",
      "Papel no Silo, revisão (2026-10-08): o Silo do artigo é o que o envio do Arquiteto resolveu, também depois que uma versão nova do ArticleDNA territorial chega ao Radar. Artigo que saiu da composição do SiloDNA vigente sai 'Fora da composição do SiloDNA vigente' (sem papel, resolva no Arquiteto), e não com o papel da foto do envio. Silo sem Pilar decidido sai '(formação)' também no CSV do Silo, no CSV 'Para escrever' e no artigo-modelo. FORA da régua, de propósito: o dossiê do Redator (observed.identity.hierarchy e observed.internalLinkPlan.articleRole) continua com a sugestão da formação e a foto do envio, porque trocar esses campos mudaria o hash de todo dossiê e desligaria o artigo-modelo aprovado — leia o papel em get_article_for_writing ('Papel no Silo') ou no SiloDNA (pillarArticleId).",
      "Escolha do usuário no fim da jornada: escrever no Redator (send_radar_to_writer e as ferramentas do Redator) ou puxar este material e escrever no ambiente da IA. Nos dois casos, URL, slug e canonical de página publicada continuam protegidos.",
      "Só os artigos selecionados (2026-10-02): o CSV 'Para escrever' também leva o Silo — seleção de um Silo só abre pela linha 'Silo' com a ordem narrativa e a SiloPage; seleção que cruza Silos põe o Silo, o papel e a ordem narrativa na linha de cada artigo. Irmão não marcado sai como 'fora desta seleção'. Os links internos resolvem o destino pelo slug do irmão.",
      "Voz da marca (2026-10-02, SDD diretriz editorial, Adendo C): o CSV 'Para escrever' e o CSV de vídeo ganham a linha 'Voz da marca', logo abaixo do topo, com a Skill brand_voice da Marca (Marca → Skills e prompts) distribuída pelas colunas de mesmo assunto (leitor e oferta, título e abertura, estrutura e transição comercial, SERP e exclusões, fontes, links, plano visual; voz, vocabulário e critérios no prompt). Cada artigo é instruído a seguir essa linha na copy e no CTA. Vale a versão corrente não arquivada, como na Marca e no Redator (rascunho incluído), e o arquivo diz a versão e o estado de entregável: 'versão corrente na Marca' (no CSV de vídeo desde 2026-10-07; no CSV 'Para escrever' e na semeadura de roteiro e carrossel do Redator desde 2026-10-08, pelo mesmo rótulo compartilhado) — nunca o estado de tela da Marca, porque o entregável sai concluído (D10); a ativa continua dita 'ativa'. As telas operacionais (Radar, Marca) seguem dizendo o estado de tela. Sem Skill, o topo diz onde ela mora. A voz não entra no congelamento da investigação: é lida a cada exportação.",
      "Autoria (E-E-A-T, 2026-10-02): cada artigo do CSV diz quem assina — o especialista da aba Especialista do Radar (nome e especialidade cadastrados), lido ao vivo pelo especialista das contribuições aceitas; sem contribuição e com um único especialista ativo na marca, ele é sugerido para confirmação; sem nenhum, o arquivo pede para definir antes de publicar. Nunca inventar autor nem credencial além do cadastro.",
      "CSV para vídeo e redes sociais (2026-10-02, mode 'video' na mesma rota; na tela: Radar → Exportar → 'CSV para vídeo e redes sociais'): dados, evidências e diretrizes de roteiro de YouTube — SERP do YouTube (vídeos no topo, canais, padrões de título, faixa de duração por coorte — desde 2026-10-09, P25–P75 dos vídeos pertinentes (mesmo público, público vizinho ou tema geral), referência e não meta —, lacunas), perguntas do público, termos, fatos com fonte, voz do especialista, trechos da biblioteca da marca, gancho, capítulos, CTA para o artigo, cortes para Shorts/Reels/TikTok e o carrossel com texto publicável por lâmina (Título, Apoio e sugestão Visual), e (2026-10-07) três colunas da pesquisa competitiva antes do prompt: concorrencia_curtos_e_carrossel, storyboard_visual e cadeia_competitiva. O prompt pede os três produtos — o vídeo longo, os cortes (até 3, escolhidos por utilidade, com a cena de storyboard_visual e a duração-alvo de concorrencia_curtos_e_carrossel) e o carrossel com o visual de storyboard_visual — e libera a ordem dos capítulos quando o vídeo render melhor; estilo de imagem só o observado ou anotado por quem abrir as referências. Sem estrutura de artigo (nem H1/H2, nem plano de links ou de imagens). Usa a pesquisa do YouTube gravada (a congelada vence a viva); sem ela, a coluna pode_gravar diz 'Com ressalva'. Grátis: nunca chama provider.",
      "CSV para vídeo pronto para roteiro (2026-10-02): leva a mesma linha 'Voz da marca' e o mesmo plano do Silo da seleção; a mesma regra de fora do escopo do CSV 'Para escrever' tira dele perguntas, termos e lacunas fora do Assunto; os vídeos selecionados pela marca vêm com o modo de uso escolhido na aba Vídeos, o canal (corte só de vídeo da própria marca; de outro canal, referência citada e atribuída), o começo da transcrição quando a biblioteca tem, e, no modo Incorporar, a seção do artigo-modelo aprovado. O vídeo fica amarrado ao artigo do mesmo assunto (CTA para o artigo).",
      "Briefing do CSV de vídeo (2026-10-02): com o artigo-modelo da SERP, os capítulos do vídeo são as seções dele, cada um com pergunta do público, o que entregar, o que explicar, o que mostrar na tela e a afirmação que pede fonte. Desde 2026-10-09 (regra do dono) o CSV de vídeo sai só com o artigo-modelo CONCLUÍDO de cada artigo do lote; sem ele, a rota responde 409 needs_article_blueprint com os artigos e não gera roteiro sem planta. Os blocos da SERP do YouTube não entram mais, nem como ritmo, e não há roteiro genérico, estratégia da amostra inteira, títulos da coorte líder nem CTA genérico. Cada corte traz gancho, ideia única, o que mostrar (os passos que a ideia única nomeia, uma tela rápida cada; desde 2026-10-08, com menos de dois, o passo que ela nomeia ou, sem casamento, a própria ideia numa situação — nunca 'o primeiro passo' por posição), fonte, a Origem recomendada com o motivo (extrair da gravação do capítulo ou gravar à parte com fala própria) e fechamento com UM CTA só (o artigo com endereço ou o vídeo longo quando publicado); os cortes são escolhidos pela utilidade isolada (2026-10-07; no empate, espalhados pelo começo, meio e fim dos capítulos); o carrossel, uma lâmina por capítulo com Título, Apoio (texto publicável, sem instrução interna) e sugestão Visual, com capa (H1) e CTA com endereço. Cada concorrente do topo diz a relevância para o público (mesmo público, próximo, tema geral, outro público); consulta que repete outra é dita e não conta como outra perspectiva; lacunas dizem o que a amostra mostra. Nos vídeos selecionados, o trecho da transcrição ligado ao tema (não a saudação), o capítulo que ele sustenta e o aviso de idioma e de transcrição automática. Células do CSV de vídeo até 10 mil caracteres.",
      "Briefing de vídeo, o que alimenta os campos (2026-10-02): a 'Premissa do vídeo' sai sem afirmação absoluta, e a mesma limpeza vale para capítulos, cortes e carrossel; 'Mostrar na tela' diz o que o editor prepara: a demonstração que a planta define (2026-10-07: antes → ajuste → depois, passos ou uma ação, uma tela por momento), e o capítulo sem demonstração é dito explicativo, com o conceito da imagem só como contexto visual; a ordem dos capítulos pode mudar se o vídeo render mais abrindo pela demonstração; o gancho sai sem conector ('Então', 'Mas'); a capa do carrossel é o título, não uma instrução; os tempos são ESTIMADOS. Relevância dos concorrentes: mesmo público; mesma dor com público vizinho; tema geral; outro público; e fora do tema da busca (só cita a plataforma). Problema → solução reconhece 'o que fazer', 'como resolver', 'ajustes', 'como corrigir'. Nos trechos de transcrição, o estado diz 'selecionado pela marca · trecho candidato encontrado' e o tempo é estimado pela duração.",
      "Revisão do CSV de vídeo (2026-10-07): a linha 'Voz da marca' NÃO leva seção de entrega de artigo da Skill (entrega e revisão final, instrução para o teste/para o redator, checklist de entrega): ela sai de todas as colunas e é nomeada no 'Fica fora desta linha' — 'Critérios antes de redigir', 'Voz' e 'Vocabulário e estilo' ficam, e o CSV 'Para escrever' não muda. 'Entregar' nunca fica sem resposta: sem answerFirst aproveitável, entra a primeira frase não-absoluta de explicar ('o que a pesquisa sustenta: …; a resposta completa se delimita na fala', sem repeti-la no Explicar) ou, sem nenhuma, a instrução concluída de abrir pela pergunta e responder só com o que a linha sustenta, em fala delimitada (D10: nunca 'PENDÊNCIA'). E a amostra é declarada: a coluna de intenção diz quantos vídeos do universo inteiro ficam fora da conta (fora do tema da busca e de outro público) — e, desde a pesquisa competitiva do mesmo dia, as estatísticas de duração e formato saem só dos pertinentes. Passada de revisão (mesmo dia): o título no plural ('Instruções para o redator') também é entrega de artigo; o Mostrar do corte usa o mesmo material que o capítulo prepara (a entrega prática vence os passos dos H3); e o cabeçalho do carrossel diz que o título de cada lâmina já puxa a seguinte (o 'Puxa a próxima' não existe mais no corpo da lâmina).",
      "Pesquisa competitiva no CSV de vídeo (2026-10-07, Parte 1 do desenho, sem coleta nova): (1) TRAVA DE FONTE em todo texto publicável — a frase que a planta liga a um link externo sem fonte do pacote, o que o mercado repete sem fonte, o que a fonte contradiz e a afirmação de efeito sobre plataforma, algoritmo ou recurso sem link (regra 17 da planta) saem do Apoio da lâmina, da Ideia única do corte, da premissa, da capa e da promessa do gancho; na produção ficam numa linha 'Fala delimitada, sem fonte', sem o rótulo 'o que a pesquisa sustenta'; a coluna cortes_para_redes lista tudo em 'Fica fora do texto publicável' (regra concluída, com o motivo) e o pode_gravar conta as frases. Com fonte do pacote, a frase fica e leva '(fonte: url)'. A tese de quem fala passa: só a afirmação sem fonte sai. (2) ESTATÍSTICAS SÓ COM PERTINENTES — formato, duração, faixa e formato recomendado da coluna de intenção saem dos vídeos de mesmo público, público vizinho e tema geral (fora do tema e outro público ficam fora da conta, por motivo), com ressalva abaixo de 4 vídeos; a divergência com a fotografia é dita, não aplicada; sem a corrida referenciada, 'não recalculável'. (3) DEMONSTRAÇÃO DEFINIDA PELA PLANTA — 'antes → ajuste → depois' é uma demonstração (não três passos), ';' separa passos e, desde 2026-10-08, o H3 só é passo quando é ação (imperativo, infinitivo, 'Como + infinitivo'; com menos de dois, o capítulo é explicativo e os H3 viram os pontos dele), sem separador é uma ação, e o capítulo sem demonstração é explicativo e não vira corte; a régua da cena (sem métrica, ranking nem resultado fictício como prova; nunca antes e depois de paciente ou de resultado) vem uma vez por coluna. (4) CORTES PELA UTILIDADE ISOLADA — portões (pergunta e frase publicável livres; demonstração definida) e pontuação de 0 a 4 (demanda pela pergunta citada na SERP ou de um Short recomendado, uma ação, lacuna/diferencial/oportunidade), até 3 cortes, menos quando faltam elegíveis (desde 2026-10-08, só com 1 ponto ou mais; sem nenhum, nenhum corte nesta linha e o prompt não pede corte de capítulo); cada corte diz a utilidade, o alinhamento entre gancho, ideia e demonstração e a Origem recomendada com o motivo; 'Capítulos sem corte' diz por quê. Desde 2026-10-08 a mesma trava, pela régua por sentido, vale também no CSV 'Para escrever' e no Redator (ver a nota da rodada dos entregáveis).",
      "Conteúdos derivados competitivos no CSV de vídeo (2026-10-07, Parte 1 do desenho, itens 6, 2, 8 e 7; pedido do dono: usar a SERP para fazer os derivados competitivos, com os estilos de imagem para o storyboard): (1) concorrencia_curtos_e_carrossel — os curtos e vídeos que o Google mostra na lente da investigação (sem repetição; autor = o nome que o Google mostra; duração só quando o título traz m:ss; relevância pela régua do topo; o vídeo comum do bloco de vídeos fica fora da amostra de curtos), os Shorts da pesquisa do YouTube com o motivo do zero (o YouTube não marcou ou a leitura perdeu), a presença dos blocos por lente (cópia congelada), as redes sociais no orgânico das quatro lentes (Reel, post, carrossel CONFIRMADO só com img_index na URL, TikTok, Short, LinkedIn; perfil fora da conta), a leitura da amostra pertinente de curtos (duração, plataformas, credencial no nome, padrões de título), a duração-alvo dos cortes (P75 dos curtos pertinentes; sem duração, a régua de 60 segundos) e os carrosséis e posts que ranqueiam para abrir e anotar; nada sobre retenção ou alcance. A ÚNICA LEITURA NOVA: o resumo orgânico das três lentes extras da keyword principal no cache (modo digest, grátis, uma vez por lote, só no modo vídeo da exportação — o CSV 'Para escrever' e o get_article_for_writing não a fazem); falhou, a coluna diz. (2) storyboard_visual — estilo observado SÓ com o que se afirma sem ver imagem (o Radar não vê imagem: domínio e presença do bloco de imagens, sinais dos títulos pertinentes — caixa alta, número, pergunta, emoji, credencial —, presença de imagem, lista e tabela nas páginas concorrentes), referências para abrir (thumbnails dos pertinentes, curtos e posts), o checklist para quem abrir anotar, a identidade visual que a Marca não guarda (definir antes de produzir), o storyboard do vídeo (uma cena por capítulo = a demonstração da planta), dos cortes (vertical) e do carrossel (que leva texto na imagem: a regra 'sem texto legível' do plano visual do artigo não vale lá); nenhum adjetivo de estilo. (3) cadeia_competitiva — referência → observação → oportunidade → entrega → formato do vídeo inteiro e de cada capítulo, pelos ids da planta (o mesmo rótulo do CSV 'Para escrever'); as páginas de uma lacuna, diferencial ou pergunta só ligam por igualdade exata do rótulo com a leitura do Google, senão 'não ligadas'; o corte de cada capítulo é o MESMO da coluna de cortes. Sem planta, desde 2026-10-09, o CSV de vídeo não sai (409 needs_article_blueprint). (4) serp_youtube: o vídeo do topo que tem transcrição na biblioteca da marca é dito pelo número da lista (seleção da marca, não da pesquisa); os outros seguem não assistidos. As células novas encolhem por igual quando passam do teto de 10 mil caracteres e dizem que encolheram. Coleta nova (transcrever concorrentes, itens de vídeo e imagem das lentes extras, coleta de Shorts, visão computacional, provider novo) é decisão do dono, fora desta entrega.",
      "Revisão do CSV de vídeo competitivo (2026-10-07, mesmo dia): (1) a trava de fonte olha a POLARIDADE nas afirmações do mercado — a frase que nega o que o mercado repete (a tese 'o Instagram, sozinho, não enche a agenda', do lado da fonte) não o reproduz e fica no texto publicável; a que repete trava, com o motivo da fonte que contradiz quando há (não 'sem fonte'); o link externo da planta trava nos dois sentidos; (2) o detector da regra 17 pega a plataforma como sujeito de ordenar, entregar ou punir ('O Instagram prioriza…', 'penaliza…', 'mostra … primeiro para quem…', 'têm mais alcance', 'o alcance caiu'), não trava preço nem recurso sem plataforma na frase, e diz 'afirmação sobre conversão do público' para 'converte visitantes'; (3) com o H1 travado, a capa do carrossel é a pergunta da abertura da planta, nunca a premissa de produção; (4) diretrizes_de_roteiro e cortes_para_redes encolhem por níveis (frases encurtadas, e dizem que encolheram) em vez de o teto da célula cortar o CTA, as regras e a lista 'Fica fora'; (5) a abertura dos cortes conta só os Shorts pertinentes e aponta para concorrencia_curtos_e_carrossel quando ela tem a concorrência do curto ('sem dado de concorrência' só quando não tem); (6) quando a ideia única nomeia 2+ passos, o corte mostra esses passos, uma tela cada (a cena do storyboard igual), em vez de pedir para ficar no primeiro; verbo de uso comum ('serve', 'usar', 'traz') não é assunto do alinhamento; (7) capítulo empatado que saiu pela distribuição diz 'empatada com os escolhidos', não 'abaixo'; com todos em 0 de 4, desde 2026-10-08, nenhum corte nesta linha (cada capítulo diz o motivo); (8) a cadeia diz a faixa do formato que a sequência segue (longos ou Shorts pertinentes) e, quando os pertinentes lideram pelo outro formato, diz isso; (9) a divergência de formato compara os pertinentes com a amostra inteira pela mesma régua de hoje (não com o classificador gravado na fotografia); (10) as lentes extras do orgânico dizem que são resumo do cache fora do pacote, com a data de cada coleta e se é posterior ao congelamento; (11) D10: o rótulo da Skill de voz, a lacuna de formato do YouTube ('confira se a coleta…'), o especialista único ('confirme antes de gravar'), o estado do trecho da biblioteca ('falta conferir…') e a linha de topo sobre apresentador e identidade visual saem concluídos. O prompt pede usar em cada capítulo a oportunidade de cadeia_competitiva.",
      "Leitura dos concorrentes (2026-10-02): a SERP resumida diz O QUE as páginas comparáveis lidas cobrem, pelos H2/H3 delas — cada tema com quantos sites o tratam (desde 2026-10-08, sites distintos; desde 2026-10-09, sobre a BASE ÚNICA — as páginas comparáveis do modelo, sem o teto de 20 da coluna JSON, a mesma da lista impressa e de todo 'N de M' do arquivo; o cabeçalho repetido em várias páginas do mesmo site é menu e sai) e cabeçalhos de exemplo, e à parte o que só 1 site trata (diferencial possível) —, com a régua do 'não cobrir'. É leitura ao lado do congelamento: não muda conceito, hash nem pacote. Os mesmos temas (2+ páginas) entram no esqueleto do artigo-modelo como seções M. A limitação 'nenhuma página foi visitada' passa a dizer que é da camada multiformato e dos recursos da SERP, não das páginas lidas. Cada link interno sai com um destino só (o caminho com o prefixo do Silo e o slug do Arquiteto; desde 2026-10-08, o destino planejado é instrução concluída e condicional — ver a nota da rodada dos entregáveis). O prompt manda levar as três linhas (Silo, Voz da marca e a do artigo); o artigo-modelo chega concluído (D10). O tema é dito com nome neutro ('Hashtags certas', 'Bio atrativa'), nunca com a frase de comando de um concorrente.",
      "Estrutura publicada atual e lente de cada evidência (2026-10-02): no artigo publicado, a exportação (tela e MCP) lê a página no ar — só GET, até 10 páginas, 8 s cada — e o bloco 'Publicado:' traz o H1 e os H2 de hoje, sem rodapé, widgets nem a assinatura do próprio site; a atualização parte deles e, desde 2026-10-08, cada H2 de hoje tem o destino dito pelo mapa da atualização (ver a nota da rodada dos entregáveis) — nada sai sem decisão humana. Falha de leitura mantém a ressalva de antes; nada é gravado. Cada evidência S das seções do artigo-modelo diz em que lente da SERP a página apareceu ('em todas as 4 lentes' ou 'só em desktop · Windows e desktop · macOS (2 de 4 lentes)'), ligando achado, janela, URL, decisão e seção. A conferência da planta pega também duas seções com títulos genéricos iguais ('estratégias práticas para…' e 'como usar … de forma estratégica').",
      "Integridade do CSV 'Para escrever' (2026-10-02): até 14 mil caracteres na estrutura, 10 mil na SERP resumida e 40 mil por artigo (desde 2026-10-09: a estrutura vai até 32 mil, o limite seguro de uma célula de planilha, e NUNCA é cortada — acima dele encolhe por níveis que dizem o que saiu e, no limite, continua inteira na coluna de fontes; o artigo, 80 mil desde a correção do mesmo dia, e acima dele cedem só a SERP resumida, o plano visual e as fontes sem continuação — a cobrir_e_superar, com o 'Não cobrir', nunca); cortar é a exceção, sempre dito na célula, e a SERP resumida (índice dos ids S, P, C) é a última a ceder e nunca some inteira. URL de evidência sai inteira; destino de link sai pelo nome do artigo, e caminho planejado ganha o prefixo provável da URL publicada deste artigo (desde 2026-10-08, dito como instrução concluída e condicional). Com artigo-modelo, a abertura é a dele. O bloqueio por divergência com o congelado diz o que divergiu (ex.: conceitos, afirmações a sustentar).",
      "Artigo-modelo no CSV 'Para escrever' (D10): sai a versão concluída do pacote vigente, sem marca de proposta nem pendência; o prompt sai fechado. Pergunta retórica, pergunta de Shopping e texto de FAQ duplicado não entram; o plano visual é capa + 2–3 respiros. Desde 2026-10-08 (caso real do Instagram), cada imagem aponta a seção pelo TÍTULO do H2, resolvido depois do mapa da página publicada (a seção que declara a imagem manda; número da IA nunca vira âncora; respiro sem par vai à primeira seção sem imagem), e antes e depois, resultado clínico e promessa visual de resultado são proibidos em prompt, conceito, ALT e legenda: na organização viram nota que pede a passada de correção; na planta fechada e no export da planta antiga, a imagem sai concluída (o prompt vira a instrução de escrever a cena a partir da seção, sem a cena proibida).",
      "Rodada dos entregáveis no CSV 'Para escrever' (2026-10-08, desenho a partir do CSV real de 08/10; vale para a tela e para get_article_for_writing): (1) a linha 'Voz da marca' e a frase da Skill dizem 'versão corrente na Marca' (a ativa, 'ativa'), nunca o estado de tela; (2) MAPA DA ATUALIZAÇÃO no publicado: cada H2 de hoje vai para a seção N da planta (reescrito na voz), para o fechamento, ou 'sai: <motivo> (decisão no artigo-modelo)'; no artigo-modelo antigo, sem mapa gravado, o casamento de títulos decide e o H2 sem par 'fica como seção própria, reescrita na voz, depois da seção N' — nada sai sem decisão humana, e a linha sai concluída, sem espera aberta; (3) o link externo que a planta não ligou a fonte do pacote vira instrução concluída: a afirmação sai delimitada e sem link externo; (4) TRAVA DE FONTE no CSV 'Para escrever': a frase da planta (abertura, resposta que abre, explicação, ângulo, promessa, fechamento e CTA) que a régua por sentido do Radar marca — efeito comercial ('converte', 'canais que convertem', 'traz pacientes', 'gera agendamentos'), comportamento do público ('procuram no Google, não no Instagram') e plataforma sem fonte do pacote — leva '(precisa de fonte: <motivo>)', e a coluna estrutura ganha a linha concluída 'Afirmações que só entram com fonte ou delimitadas: …'; a tese que nega o efeito ('o Instagram, sozinho, não enche a agenda'), a orientação ('a bio deve deixar claro…') e a frase coberta por fonte do pacote passam; (5) os cabeçalhos dos concorrentes ('O que os concorrentes lidos cobrem', 'Tratado por 1 página só') saem sem ruído — autopromoção com a marca ou o domínio do concorrente, nome próprio solto, chamada de loja ou navegação, conteúdo recomendado datado e catálogo/loja quando o artigo não é de loja —, sem tirar tema legítimo; (6) 'Como superar a SERP' — substituído em 2026-10-09: a coluna diz só o que o artigo-modelo assumiu (ver a nota 'CSV Para escrever só pelo artigo-modelo'); (7) 'Perguntas a responder' e 'Não cobrir' seguem o mesmo critério, e a pergunta que é a keyword de outro artigo do Silo vai para 'pertence ao artigo X do Silo'; (8) sem o marcador de relato a completar: sem material próprio da marca, o artigo é escrito sem relato e sem inventar (decisão desta rodada, como pede a voz); (9) link interno para destino ainda não publicado é instrução concluída e condicional — entra com a URL final quando o destino for publicado junto ou antes; se este artigo for ao ar antes, a âncora fica como texto simples (nunca link quebrado), e slug planejado não vira endereço publicado.",
      "Rodada dos entregáveis no CSV de vídeo (2026-10-08): (1) corte exige utilidade de pelo menos 1 de 4 — sem elegível com pontuação, menos cortes (até zero), e o cabeçalho diz o número real; 'Capítulos sem corte' continua dizendo o motivo; (2) a cena do corte casa com a ideia (o passo que casa com ela; sem casamento, a cena mostra a própria ideia como situação), nunca o tema de uma afirmação que travou; (3) demonstração é AÇÃO: o H3 só conta como passo quando é ação (imperativo, infinitivo ou 'Como + verbo'); seção só com H3 de tópico é explicativa e não vira corte nem carrossel de passos; (4) o carrossel diz que 'lista' é a estrutura das PÁGINAS concorrentes, não de carrosséis observados; (5) o rótulo da voz é o compartilhado com o CSV 'Para escrever', e a trava de fonte lê o SENTIDO nas lâminas, nas ideias dos cortes, no gancho, na premissa, na capa e no Apoio — 'canais que convertem' e 'procuram no X, não no Y' travam, a tese que nega o efeito passa — com o motivo concluído ('a planta pede fonte oficial ou verificada: …'), sem espera aberta (D10).",
      "Correções da revisão da rodada dos entregáveis (2026-10-08; CSV 'Para escrever', CSV de vídeo, Redator e MCP): (1) a régua por sentido não trava ORIENTAÇÃO — imperativo com 'o que …' ou 'quando …' (o próximo passo real 'Acesse … e descubra como aparecer no Google quando o paciente procura' passa), quem orienta contra ('Evite dizer que…', 'Não prometa que…'; só a causa que ele dá conta), o efeito no infinitivo depois de modal ou de 'para' ('podem ampliar', 'para ajudar'), a tese negada com mecanismo na frase ('O engajamento não garante pacientes'), a finalidade do guia ('Este guia foi pensado para…'; só a plataforma como sujeito trava) e o público que só define o sujeito ('Quem procura um dentista quer saber…', 'busca atrair') —, e passou a travar 'se tornam pacientes', 'capta pacientes', 'recebem mais pacientes', 'fecham mais', 'a agenda enche', 'faz a agenda encher' e 'dá mais alcance'; (2) no CSV 'Para escrever', H1, alternativas, SEO title, meta description, próximo passo, ALT e legenda das imagens também passam pela trava e entram na lista concluída; (3) mapa da atualização no artigo-modelo antigo: só a principal não distingue títulos, a complementar que a planta põe numa seção leva para ela o H2 publicado que a contém, o H2 sem par fica depois da última seção absorvida — nunca antes da 1ª seção; sem nenhuma absorvida, depois da última seção da planta — e 'Medidas do plano' soma os H2 mantidos; (4) até a planta antiga ser regerada, o export a protege com instrução concluída: 'Ordem de leitura' quando a busca é 'como …' e a abertura ou a 1ª seção é diagnóstico, 'Cena repetida' quando duas imagens repetem sujeito e objeto, e o ângulo cita só evidência G, D ou O; (5) a pergunta que a planta usa como evidência de uma seção não vai ao 'Não cobrir', e a pergunta que É a keyword de outro artigo ou tópico do Silo vai a ele mesmo dividindo duas raízes com este artigo; (6) esperas antigas saem concluídas: SEO title e meta sem texto ('escreva com cerca de …'), especialista que responde outra coisa ('use só como orientação geral…'; 'Aplicar em: onde couber no texto, como orientação'), fontes citadas pelo mercado ('sem verificação no pacote, só como referência delimitada'), transcrição ('cite só o que o vídeo confirma'), público do vídeo sem definição ('quem busca …') e seção do vídeo sem artigo-modelo; (7) no CSV de vídeo, a frase absoluta (regra universal) entra na lista 'Fica fora' com o motivo e na contagem do pode_gravar — continua fora do vídeo, também da fala —, e, sem corte de capítulo, o fato com fonte sai sem número e o prompt cita a exceção; (8) o texto da Skill de voz é transcrito como a Marca o escreveu: palavra de espera dentro dele é da Marca, não da plataforma (ajuste, se quiser, na Skill); (9) no MCP, brandVoice.statusLabel e a nota da voz no manifesto dizem 'ativa' ou 'versão corrente' (o estado técnico continua em status).",
      "Rodada dos 8 CSVs do Silo 'Leads sem Tráfego Pago' no CSV 'Para escrever' sem artigo-modelo (2026-10-08, P0-B e P1; tela e get_article_for_writing; desde 2026-10-09 o CSV não sai sem o artigo-modelo concluído: o que aqui era estrutura — títulos de seção, H1, links, estrutura de referência do publicado — vive no esqueleto que o gerador do artigo-modelo recebe e na planta, e o que é coluna de pesquisa — 'Não cobrir', ruído, fontes, especialista — continua no CSV): (1) 'Obrigatória pelo ArticleDNA' só por TERMO DE CONTEÚDO da cobertura declarada — verbo genérico ('ganhar', 'conquistar', 'gerar'), grau ('mais', 'novos'), palavra funcional e de formato, e a raiz da principal no singular ou no plural, sozinhos, não tornam um cabeçalho exigido; (2) cabeçalho de concorrente que é título de post (número + dicas, 'Guia', 'Saiba mais', pergunta seguida de outra frase), encerramento ('gostou de saber', 'tudo certo sobre'), propaganda do concorrente (a marca de um site lido), inglês, newsletter ou loja fora do leitor não vira seção nem obrigação (no modelo editorial da SERP fica como 'Evidência opcional', com o motivo); (3) o título de cada seção é a PERGUNTA DO LEITOR que ela responde, sem os moldes 'no dia a dia?', 'O que considerar sobre', 'Afinal,' e 'Na prática, o que' (dito como título de trabalho, para reescrever na voz); bloco picotado ('Atrair cliente e clientes') sai pela pergunta, e a subseção que repete a mesma pergunta sai nele; H1 picotado ('Como atrair cliente e praticidade: atrair clientes e fazer um pitch…') vira 'formule a partir da promessa', e o fechamento picotado vira 'retome a resposta principal (a da abertura)'; as linhas da virada do Redator nomeiam a seção sem o molde, como o CSV; (4) UMA RÉGUA para o 'Não cobrir': o rótulo fora do escopo e a pergunta mandada a outro artigo ou tópico do Silo (o mesmo item) saem também de H2/H3 e do 'Cobrir:' da estrutura, e isso é dito no topo da coluna; (5) ruído de pesquisa fora das listas: 'Citadas pelo mercado' sem cookie, selo, CPF/CNPJ, e-MEC, W3C, aposta, lei de rodapé fora do tema, institucional e site do próprio concorrente (domínio oficial só fica quando o assunto toca o artigo); perguntas, PAA e abertura sem newsletter, inglês, encerramento, loja ou cupom fora do leitor, outra profissão e produto de concorrente; os temas dos concorrentes contam sites sobre a lista impressa; (6) a resposta aprovada do especialista sai INTEIRA (a original quando a síntese é o começo dela cortado em '…'); fechamento, CTA e diretriz saem inteiros na promessa e a coluna de fontes remete a ela; (7) UM CTA SÓ: a chamada final é o argumento do especialista (ou a do modelo); o próximo artigo do Silo entra como 'Continuação (não é uma segunda chamada)' no fechamento, com o link L aprovado pelo grafo ou 'cite sem link: o grafo aprovado não traz esse link' — nunca 'peça ao Arquiteto'; a SiloPage só é a continuação do último da ordem; (8) os links vão às seções que tratam o destino (as palavras próprias do destino no título, na pergunta e nos pontos), nunca todos numa seção (no máximo dois, ou a média); (9) o destino de um irmão do Silo publicado sai com a URL '(publicado)', mesmo fora do arquivo: o núcleo resolve a publicação de todos os membros pelo ArticleDNA que o lote já leu; (10) sem estrutura do modelo e com a página publicada lida, a estrutura de referência é a da página publicada (atualização) e o arquivo não bloqueia; a SERP que responde a outra intenção é ressalva — trocar a principal ou a intenção é decisão do Arquiteto; escreve-se pela intenção e pelo leitor declarados.",
      "Correção da rodada dos 8 CSVs (2026-10-08; CSV 'Para escrever', tela, get_article_for_writing e Redator): (1) com artigo-modelo, o irmão do Silo que está no ar sai com a URL '(publicado)' também na planta (o aviso de destino planejado só fica com destino ainda não publicado), e a planta nova já nasce assim; (2) a planta no CSV traz UMA chamada — a do especialista quando ele é CTA, senão a da planta — e o 'Próximo passo' vira 'Continuação (não é uma segunda chamada)' para o próximo artigo do Silo, com o link da planta ou citado sem link; o mesmo link (âncora e destino) repetido sai uma vez; (3) antes e depois no texto da planta (resposta e 'Explicar') sai — na conferência é nota que pede troca; no export da planta antiga sai só o trecho; 'antes e após' conta, e antes e depois de feed ou métrica (marketing, sem contexto clínico) não; (4) o motivo do descarte cita a seção pelo TÍTULO (nunca 'seção N'; sem título seguro, 'em outra seção'); (5) a seção inteira só sai pelo 'Não cobrir' quando é o MESMO item; a pergunta do leitor excluída sai sozinha e a seção fica; 'outros' e 'estratégia' não distinguem assunto; (6) o modelo não tira chamada, fecho e navegação de oferta (numa landing page são seção); o CSV os tira só do artigo editorial; blocos do Amazon nunca passam pela régua de cabeçalho de concorrente; ano na principal ('… 2026') não data o cabeçalho com o mesmo ano; o tópico de cobertura declarado pelo humano continua exigindo; (7) buscas relacionadas passam pela régua do PAA (marca de concorrente, superstição); FAQ não é termo a nomear; subtítulo de post no gerúndio ou no imperativo é título de post; órgão oficial e entidade que ranqueiam continuam fonte; a pergunta de outra profissão que trata do assunto do núcleo fica; no artigo de promoção, vale-presente e oferta do dia ficam; (8) a ressalva de intenção diz 'página de consumidor' só quando o lado observado é comercial; (9) o Redator e o MCP só aceitam a planta antiga (sem a referência do congelamento) quando o congelamento do documento ainda é o vigente da análise, e a linha 'Virada' do Redator nomeia a seção como o CSV (a pergunta do leitor utilizável); (10) o painel do artigo-modelo aplica a regra do export (desde 2026-10-09, só a versão concluída; versão de outro ArticleDNA não vai) e não afirma que a versão antiga vai aos entregáveis sem o ArticleDNA conferido.",
      "Coerência final dos 8 CSVs, trava de fonte e ruído (2026-10-09; CSV 'Para escrever', CSV de vídeo, Redator e get_article_for_writing): (1) a régua por sentido não trava o OBJETIVO do que se cria ou ensina — a oração 'que <efeito>' depois de 'como + infinitivo', de 'aprenda a'/'ensina a' ou de verbo de criação no infinitivo, no imperativo ou como nome (criar, montar, planejar, fazer, escrever, construir, produzir…; criação, produção…): 'como criar ofertas que atraem pacientes', 'Aprenda a criar promoções… que atraem pacientes' e 'construir uma presença orgânica que traz pacientes' passam —, nem a pergunta indireta depois de verbo de conferir ('para avaliar se a promoção atrai o paciente certo', 'Acompanhe quantos leads se tornam pacientes'), nem o efeito no infinitivo depois de 'como' ('como reduzir a dependência de anúncios'); continuam travando 'canais que convertem' sem verbo de criação, o particípio que afirma ('Promoções bem planejadas atraem pacientes'), o comparativo ('Faça como as clínicas que lotam a agenda') e 'Entenda por que X gera agendamentos'; (2) o link externo da planta, fora da seção que o escreveu, só alcança a frase que FALA dele — as raízes em comum são metade ou mais das raízes distintivas da frase, além dos 60% da afirmação (a meta real de leads deixou de travar por 'Diferença entre lead qualificado e interessado'); na mesma seção e nas afirmações do mercado vale a regra de antes; (3) a fonte oficial citada pelo mercado tem o assunto da âncora e do caminho (sem palavra de portal, de link, de endereço, do próprio domínio nem identificador com número); a seção do concorrente em que o link aparece só decide quando âncora e caminho não dizem nada — CVM e 'Atendimento CVM' saem do artigo de atrair cliente, e o artigo científico citado pelo domínio continua pela seção; (4) 'Biblioteca de Marketing', 'Biblioteca', 'Informações' e 'Exclusivo pra você' são navegação, não tema dos concorrentes nem 'Tratado por 1 site só'.",
      "Coerência do CSV 'Para escrever' com o artigo-modelo (2026-10-09; tela e get_article_for_writing; com a correção do mesmo dia, a leitura da planta vale também no CSV de vídeo e no Redator): (1) a ESTRUTURA NUNCA É CORTADA — teto no limite seguro de uma célula de planilha (32 mil); acima dele, ela encolhe por níveis que dizem o que saiu (as URLs das evidências, as linhas 'Vem do esqueleto da SERP' e 'Origem', as linhas 'Termos a nomear') e, se ainda passar, as seções do fim vão inteiras para a coluna fontes_e_especialista ('Continuação da coluna estrutura'), com remissão; o artigo vai a 80 mil (correção do mesmo dia; a cobrir_e_superar nunca é cortada); (2) UMA BASE DE AMOSTRA SÓ — a lista 'Páginas comparáveis lidas…', os temas dos concorrentes, o 'Diferencial possível' (em sites e páginas), os 'N de M' de 'Como superar' e das fontes, a linha 'Concorrentes comparáveis' e os rótulos '(N de M páginas)' das evidências do artigo-modelo falam da mesma base: as páginas comparáveis do modelo observado, sem o teto de 20 da coluna JSON, dita 'N páginas comparáveis, de S sites'; o rótulo gravado é reescrito na leitura, sem IA e sem mudar a planta (o D ganha o 'de M'); se a fotografia e a lista divergirem, o número é recontado pelas URLs que o sustentam e, sem elas, a contagem sai; o modelo observado e o hash do dossiê não mudam; (3) O ARTIGO-MODELO VENCE O 'NÃO COBRIR' GENÉRICO — o item 'O ArticleDNA não declara…' ou 'outro foco' que a planta trata (duas raízes que o distinguem, ou a única, no mesmo texto; a sigla entre parênteses é apelido) sai do 'Não cobrir'; o item de OUTRO ARTIGO do Silo continua fora e a seção da planta que o toca diz 'só mencione e linke para <artigo>' (com o L dele, ou citado sem link); 'Diferencial possível', 'Sustentar…', 'Diferenciar em', lacunas, temas, perguntas e termos nunca sugerem item do 'Não cobrir' (régua radarSuggestionGuard, mais o mesmo item e a sigla numerada como '4 Ps'); (4) o DONO de um assunto é só ARTIGO membro do Silo (ordem narrativa do SiloDNA) — keyword de 'Tópicos incluídos' não é dona: a pergunta vai ao artigo que trata dela, fica neste artigo ou é 'outro foco', e 'outro tópico do Silo' não existe mais; (5) as EXCLUSÕES DA VOZ DA MARCA (as seções da Skill que proíbem recurso ou tema, como 'Recursos antigos ou inadequados': Instagram Shopping, ativação de loja, conselhos de lojas virtuais) são exclusão dura em 'Como superar', temas, perguntas, termos e estrutura, e entram no 'Não cobrir' com a seção da Skill de onde vêm; o diferencial do pacote que elas tocam vira nota; (6) 'Sustentar <a principal ou uma complementar> como diferencial' sai (singular e plural contam como a mesma keyword) e não toma o lugar de um diferencial de verdade; (7) UM CTA SÓ — a continuação para o próximo artigo do Silo (ou a SiloPage, no último) deixou o fechamento e a coluna promessa: é opcional, no corpo da seção que tem o link aprovado para o destino ou, sem ele, da última seção que trata o assunto dele, citada sem link ('Leitura seguinte (opcional, não é uma chamada)'); na planta antiga, o CTA que cita a página comercial candidata ganha o link dela na última seção; (8) PUBLICADO SEM ARTIGO-MODELO (até a regra do dono de 2026-10-09; hoje, sem artigo-modelo, o CSV não sai e a página publicada lida vai ao pedido do artigo-modelo) — com a página no ar lida, a estrutura de referência é a da página publicada (os H2 de hoje, na ordem); as seções do modelo da SERP entram como complemento do H2 que trata o mesmo assunto, a que o ArticleDNA exige e nenhum H2 trata vira seção própria, e o tema sem H2 correspondente é dito no fim, sem virar seção obrigatória; a regra (3) vale com a página publicada como referência. O certo continua sendo organizar o artigo-modelo (decisão do dono), e desde 2026-10-09 é a única saída.",
      "Artigo-modelo e correção da coerência dos 8 CSVs (2026-10-09; Radar → Pesquisa → Artigo-modelo da SERP, CSV 'Para escrever', CSV de vídeo, Redator, get_article_for_writing e a fatia radar.blueprint/<id>): (1) as regras gravadas passam a rulesVersion '2026-10-09' — o pedido ganhou as regras 6 (o CTA que cita a página comercial leva o link dela, na última seção), 7 (claim é a FRASE afirmativa; rótulo de tema como 'Estatísticas sobre…', 'Passos para…' ou 'Definição de…' não é link externo), 8 (um CTA só: nextStep null; o próximo artigo do Silo é mencionado no corpo), 12 (o que a Skill de voz proíbe como assunto não entra em seção, H3, pergunta, diferencial, ângulo nem demonstração), 19 (cada H2 responde uma pergunta diferente; um H3 nunca repete um H2), 20 (a demonstração mostra o ajuste, sem resultado atribuído a um caso sem fonte) e 24 (um leitor só; a promessa nunca é a moldura 'Cobrir com clareza o tema…'); a conferência tira o link externo sem fonte que é rótulo de tema, reescreve a demonstração com resultado atribuído como 'exemplo ilustrativo…, sem resultado atribuído', remove o H3 igual a um H2, põe o link da página comercial citada pelo CTA, avisa H2 sobrepostos (só quando o corpo de uma cobre TODAS as palavras próprias do título da outra, nunca só palavra de contexto como 'erro' ou 'perfil'), tira a moldura da promessa, trata o público duplo (só quando o consumidor ganha uma ação de compra ou busca) e remove a seção que a voz exclui, dizendo de onde vem; e, já na planta nova, a virada perde a frase que chama quando há CTA e o título perde o público duplo; (2) a planta LIDA é uma função pura só (radarArticleBlueprintReading), usada pelo CSV para escrever, pelo CSV de vídeo e pelo Redator (fundamentos, fatia radar.blueprint/<id> e semente dos derivados; a regra de leitura do Redator passou a '2026-10-09' e o etag da fatia mudou): link de rótulo de tema fora, demonstração sem resultado atribuído, H3 repetido fora, promessa sem moldura nem segundo público, leitor único, H1/alternativas/SEO title/meta sem 'para clínicas e pacientes', virada sem a frase que chama quando há CTA; no Redator e no vídeo, o próximo passo que CHAMA ('Acesse a página…', 'Fale com…') sai e o que só aponta a leitura seguinte fica; o link da página comercial do CTA depende dos candidatos e continua só no CSV; (3) trava de fonte: o rótulo de tema sem fonte sai na ORIGEM (radarPendingClaims), decidido por cabeça de lista fechada ('Definição', 'Estatísticas', 'Passos', 'Diferença', 'Métricas', 'Riscos'…) — afirmação normativa ('Resolução do CFM proíbe…'), de efeito ('Clínicas com perfil completo recebem mais ligações') e de direção ('Queda no alcance orgânico…') continuam pedindo fonte; o link da planta fora da seção dele trava a frase que traz 90% ou mais das raízes dele, em qualquer tamanho (meta, H1, promessa), ou uma ORAÇÃO que o reafirma; a isenção do objetivo do que se cria só vale com verbo de criação e sem número, prazo, comparação ('mais que'), 'faça parte' ou cópula ('é o que traz'); (4) a regra 3(a) é a mesma no CSV e no pedido do artigo-modelo (com a planta anterior aprovada ou, sem ela, a página publicada lida): palavra de modo não distingue ('da forma certa', 'quem'), o substantivo de agente ('captador') não some no núcleo, a raiz única só vale num título da referência (H2, pergunta, H3, termos, negritos) ou pela expressão inteira ('custo por lead'), e verbo comum ('faz', 'vende') nunca basta; (5) o tópico que é keyword de um artigo do Silo tem nele o dono — o lote passa as keywords de cada membro ('como conseguir mais clientes' é de 'como atrair um cliente'); (6) publicado sem artigo-modelo (até a regra do dono do mesmo dia; hoje o CSV não sai sem a planta): a exigência do ArticleDNA vai, como complemento e 'Cobrir', ao H2 publicado com a mesma pergunta ('O que não fazer…' em 'Erros que…'), sem H2 duplicado; (7) o artigo do CSV vai a 80 mil e a cobrir_e_superar nunca é cortada (acima do teto dela, cede o 'Como superar' de antes e o 'Não cobrir' fica inteiro); (8) a 'Leitura seguinte' vai à última seção pertinente (a palavra que está em metade das seções não basta; com o link numa seção do começo, a menção vai à última pertinente depois dela, citando o L sem repetir o link); o plano de parágrafos usa a mesma base da linha 'Concorrentes comparáveis', e o esqueleto conta o tema em sites ('N de S sites'); (9) ruído: página de login ou de controle de acesso e 'SPC Brasil' saem; a fonte regulatória que nomeia o instrumento (lei, resolução, RDC, código, manual) volta a ser decidida também pela seção onde o mercado a cita (a home de órgão sem instrumento, como a CVM, continua saindo); (10) voz da marca: a exclusão com condição na Skill ('automaticamente') não veta o texto que trata de produto, a raiz não casa 'atividades', e 'Instagram Shopping' reconhece 'loja no Instagram', 'sacola', 'catálogo' e 'marcar produtos'; (11) o aviso de regras anteriores na tela diz o que falta pela versão gravada — para as plantas de 08/10, que os entregáveis já aplicam as correções de 09/10 na leitura e que 'Organizar de novo (IA)' (até 2 chamadas de IA, pagas, com o custo confirmado antes) só refaz a planta. Nada disso chama IA, provedor ou banco: é leitura e conferência determinística.",
    ],
  },
  /* 2026-10-09 · o material do vídeo pelo MCP (inventário do YouTube, item 7): o mesmo CSV da tela. */
  {
    id: "radar.export_for_video",
    stage: "radar",
    title: "Material do vídeo (CSV para vídeo e redes sociais)",
    purpose: "Levar o artigo para vídeo longo, cortes e carrossel pelo artigo-modelo: capítulos, cortes, formato, faixa de duração, gancho, CTA, carrossel, storyboard e cadeia competitiva.",
    requires: ["Pacote do Radar finalizado", "Artigo-modelo da SERP concluído de cada artigo"],
    produces: ["CSV para vídeo e redes sociais, o mesmo da tela"],
    cost: "free",
    decision: "agent",
    access: "tool",
    tools: ["get_video_material"],
    screen: "radar",
    howOnScreen: "Radar → Exportar → 'CSV para vídeo e redes sociais'. Sem o artigo-modelo concluído de algum artigo, o botão vira 'Organizar N artigo(s)-modelo e exportar (+ até 2N chamadas de IA)'. No artigo, a aba '+ YouTube (vídeo)' abre por 'Vídeo pelo artigo-modelo': a amostra pertinente, a faixa por coorte e o formato decidido; os capítulos e os cortes vêm no CSV de vídeo.",
    routes: ["/api/editorial/radar-export"],
    notes: [
      "Pelo MCP (2026-10-09): get_video_material devolve o MESMO CSV do botão, de um artigo, seguindo a rota passo a passo (lib/server/radar-mcp-material.ts): a mesma montagem do modo vídeo (assembleRadarPortableExport com o Silo da seleção e o resumo orgânico das lentes extras no cache), a mesma exigência do artigo-modelo concluído antes de qualquer projeção e a mesma projeção (radarPortableVideoExport). Grátis: só leituras, nunca provider nem IA; permissão de leitura (platform.read e ver o Radar). O CSV vem em partes (part 1 … parts); junte na ordem. withoutYoutube diz se o artigo não tem pesquisa do YouTube gravada (a coluna pode_gravar diz a ressalva). Sem a planta, o erro needs_article_blueprint com missingArticleBlueprints [{ articleId, title }], maxAiCalls e a ação na tela; a leitura da planta que falha é blueprint_unavailable; artigo não finalizado volta recusado com o motivo.",
      "Formato do vídeo, uma decisão só (2026-10-09): formato curto só quando os Shorts PERTINENTES (mesmo público, público vizinho ou tema geral) lideram a amostra e são pelo menos 4; aí o curto é o recorte do artigo-modelo — a série de vídeos curtos são os capítulos que funcionam sozinhos —, nunca os blocos da SERP do YouTube. Senão, vídeo longo pelo artigo-modelo. A faixa de duração é por coorte (P25–P75 dos pertinentes), referência e não meta. A mesma decisão vale na fotografia nova, na camada canônica nova, no CSV e na tela; o plano de vídeo é um só, com um gancho que abre pelo próprio tema.",
      "O roteiro sai só do artigo-modelo APROVADO de cada artigo (2026-10-09, regra do dono): capítulos = seções da planta, cortes escolhidos pela utilidade, premissa e gancho pelo tema, CTA para o artigo. Saíram o gancho e a promessa antigos, as estratégias da amostra inteira, o 'Ritmo que a SERP do YouTube sugere', os títulos da coorte líder e o CTA genérico. As perguntas, os termos e os fatos do CSV de vídeo passam pela régua de ruído (chamada, inglês, título de post, superstição…). As outras regras do CSV de vídeo (trava de fonte, cortes, carrossel, storyboard, cadeia competitiva, voz) estão nas notas de 'Exportar Para escrever'.",
      "Multiformato pela amostra pertinente (correção de 2026-10-09): o congelamento NOVO do YouTube (clique, automático e reparo) grava o blueprint multiformato com as contagens long-form × Shorts da amostra pertinente e a saída SHORTS × vídeo longo pela decisão única de formato (radarMultimodalBlueprintOfRun), a mesma da fotografia e do CSV. A camada gravada antes continua lida como foi congelada (mesmo hash). A semeadura do Redator e o painel não trazem mais a saída Shorts × vídeo longo da camada antiga: o formato é o do plano do vídeo.",
      "Aba '+ YouTube (vídeo)' do Radar (2026-10-09): a superfície principal é 'Vídeo pelo artigo-modelo' (amostra pertinente, faixa por coorte e formato decidido). Saíram 'Roteiro-modelo competitivo', 'Roteiro recomendado', a direção de gancho pelos títulos e 'Shorts recomendados'; as peças curtas do multiformato ficam ocultas, com a linha que diz que os vídeos curtos são os cortes da planta. Na evidência, o blueprint técnico diz qual régua fez a fotografia ('Amostra pertinente (régua de 2026-10-09)' ou a amostra inteira, na fotografia antiga).",
    ],
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
    routes: ["/api/editorial/documents", "/api/redator/seed", "/api/redator/article-blueprint"],
    notes: [
      "get_writer_foundations traz, quando existem (2026-10-02): articleBlueprint (o artigo-modelo aprovado no Radar para o pacote entregue; inteiro em radar.blueprint/<id>) e brandVoice (a Skill brand_voice corrente da Marca, inclusive rascunho, com versão e estado: trecho de CTA e transição comercial, trecho de voz e vocabulário e os títulos das outras seções; inteira em brand.skill/<versionId>). Sem eles, os fundamentos do Redator são os de sempre; pelo MCP, desde 2026-10-09, vêm com o estado da planta (ver a nota seguinte).",
      "O artigo-modelo no MCP do Redator (2026-10-09, regra do dono): get_writer_brief e get_writer_foundations trazem articleBlueprintState, pela MESMA leitura do Redator e do envio (só metadados, pelo pacote e pela investigação congelada do documento): 'approved' (sourceKey radar.blueprint/<id>), 'needs_article_blueprint' (motivo, mensagem e a ação na tela: onde organizar, os botões e o custo, até 2 chamadas de IA) ou 'blueprint_unavailable' (a leitura falhou; tente de novo). Sem a planta, nunca o legado: editorialContext — as linhas gravadas no envio pelo modelo editorial anterior (onde virar, a seção da virada, a direção do H1) — sai da resposta (omitted diz o quê e omittedReason, por quê), e o próximo passo dos fundamentos começa pelo que falta. O Assunto declarado continua no ArticleDNA (article.fields.subject). A IA não escreve pela estrutura antiga: mostra a ação ao usuário e relê depois.",
      "Painel do artigo-modelo no Redator (2026-10-09): GET /api/redator/article-blueprint (só leitura, permissão redator/view) devolve { state: 'approved', articleId, blueprint, editorialContext }, { state: 'absent', articleId, reason } ou, desde a correção do mesmo dia, { state: 'unreadable', articleId, reason } quando a leitura das plantas falhou. Ausente, a tela mostra o motivo e o link 'Organizar o artigo-modelo no Radar' (/{brandRef}/radar/{articleId}) com o custo (até 2 chamadas de IA por artigo); não lida agora, só diz que não leu e não oferece organizar. A escolha da planta é a MESMA do CSV (radarArticleBlueprintPick: só a concluída; hash exato do pacote; depois a concluída do mesmo congelamento e ArticleDNA e, quando o pacote traz research.amazon.frozenAt, do mesmo congelamento da Amazon; a gravada antes dessa regra, sem amazonFrozenAt, continua valendo). A leitura é a do CSV (fontes do pacote, exclusões do ArticleDNA, próximo passo que chama fora; o que só aponta a leitura seguinte fica como 'Leitura seguinte (opcional, não é uma chamada)'). needsSource inclui as afirmações do pacote congelado (claims, factualEvidence, marketVsFactConflicts) pela trava do CSV. publishedMap vale também na planta antiga, pela página publicada lida agora (H1 e H2, teto de 4 s, só em publicado protegido) nas rotas de seção e de melhoria. A régua de ruído do CSV (research-noise) vale nos fundamentos, no pacote da seção (campo noise) e nas pautas do especialista. A shortlist da Amazon no manifesto tem fonte 'frozen' quando o pacote tem a Amazon congelada. As pautas do especialista (/api/editorial/radar-topics) listam as seções da planta concluída do mesmo ArticleDNA e as afirmações que só entram com fonte. Fundamentos: o bloco youtube é só o observado ({ role, frozenAt, comparableVideos, longForm, shorts, durationRange, recurrentChannels, titlePatterns, gaps, ruler PERTINENTE|AMOSTRA_INTEIRA }) e o bloco review traz intenção, saída, produtos, faixas, critérios e apoio do Google; no painel, a 'Recomendação editorial' aparece como matéria-prima (sem a saída Shorts × vídeo longo, que é do plano do vídeo) e as perguntas e conceitos do blueprint antigo como evidência, não exigência.",
      "Matéria-prima, não estrutura (2026-10-09): read_writer_evidence continua servindo o blueprint competitivo antigo do pacote (radar.bundle.competitiveBlueprint), os blueprints de formato (radar.bundle.formatBlueprints), as saídas que ele sugeria (radar.bundle.editorialOutputs) e as amostras inteiras das corridas (run.youtube.universe, run.youtube.results, run.amazon.products, run.amazon.results) como proveniência, marcados com role 'raw_material' e a frase rawMaterial: servem de insumo do gerador do artigo-modelo, nunca de estrutura, roteiro, formato nem duração. A estrutura sai do artigo-modelo (articleBlueprint e radar.blueprint/<id>); o vídeo, de get_video_material. O teto pedido vale para a resposta inteira, com o marcador.",
      "No manifesto, radar.blueprint/<id> tem dono radar e nível 'Interpretação de IA' (planta aprovada pelo dono, não evidência), e a linha brand.skill da voz diz a versão e o estado na Marca. Sem eles, o manifesto declara as ausências 'radar.blueprint' e 'brand.voice'.",
      "Papel no Silo no dossiê (2026-10-08): observed.identity.hierarchy é a sugestão da formação (ArticleDNA.hierarchy, hoje 'Suporte' em todo artigo) e observed.internalLinkPlan.articleRole é a foto do envio ('pillar'/'support'); nenhum dos dois é a decisão. Quem decide o Pilar é o SiloDNA (dna.silo/<versionId>: pillarArticleId igual ao articleId do artigo = Pilar; supportArticleIds = Suportes, na ordem de narrativeOrder) — o mesmo papel da linha 'Papel no Silo' do CSV 'Para escrever' (get_article_for_writing) e o papel com que o artigo-modelo foi pedido (os linkCandidates dele dizem quem é o Pilar). Quando divergirem, vale o SiloDNA.",
      "Planta para quem escreve (2026-10-08, rodada dos entregáveis; aditivo, mesma leitura nos fundamentos, no pacote da IA interna e na semeadura): (1) articleBlueprint sai com os nomes atuais de produto ('Perfil da Empresa no Google' no lugar de 'Google Meu Negócio' e 'Google My Business'; a keyword que traz o nome antigo e a menção 'antigo …' ficam), inclusive no artigo-modelo antigo; a fatia radar.blueprint/<id> também, e serve publishedStructure (a página que a IA viu ao organizar); (2) needsSource — em articleBlueprint (título, meta, promessa, ângulo, direção da abertura, virada, CTA e próximo passo) e em cada seção (resposta que abre, explicação, prática e a afirmação que a planta liga a fonte oficial sem fonte do pacote) — lista { field, sentence, label }: a frase que só entra com fonte do pacote, pela mesma régua por sentido do CSV (efeito comercial, comportamento do público, plataforma); a tese que nega o efeito e a frase coberta por fonte do pacote não entram na lista; o texto da planta não muda e o label nunca vai ao texto; (3) publishedMap (só na planta que leu a página publicada ao organizar): cada H2 de hoje com kind (ABSORBED, CLOSING, REMOVED, KEEP), a seção e a frase concluída do destino (line). Sem nada disso, os fundamentos saem byte a byte como antes; o mapa cede antes das seções da planta no teto de 24 kB. Desde a correção da revisão (2026-10-08), brandVoice.statusLabel é rótulo de entregável ('ativa' ou 'versão corrente'), o estado técnico fica em status, e a nota da voz no manifesto diz 'versão corrente na Marca' (D10: o MCP sai concluído).",
    ],
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
    notes: [
      "Divergência com um DNA se registra (record_writer_divergence); nunca se contraria o DNA em silêncio.",
      "A IA interna (/api/redator/section e /improve) segue o artigo-modelo aprovado e escreve copy, transições e CTA na voz da marca (2026-10-02). A semeadura do roteiro e do carrossel (/api/redator/seed, 1 chamada de IA por entregável) lê o MESMO plano do CSV de vídeo (radarVideoPlan, o mesmo de get_video_material e get_article_for_writing), pela montagem do export: o formato decidido pela amostra pertinente com o motivo, o gancho, a premissa, os capítulos (= seções da planta, na ordem, com as exclusões do ArticleDNA aplicadas), os cortes pela utilidade, os capítulos sem corte e 'Fica fora do texto publicável', além da planta inteira (H1, promessa, leitor, seções, CTA único, leitura seguinte) e da voz. Contagens: roteiro longo = capítulos + 2 cenas; formato curto = uma cena por corte; carrossel = capítulos + 2 lâminas. Não entram mais formato, gancho, tom, linguagem nem estrutura do blueprint antigo do YouTube, nem a 'Recomendação editorial do Radar' nem 'Precisa responder/cobrir' do blueprint antigo (correção de 2026-10-09: uma decisão de formato só; as perguntas vêm nos capítulos). Recusas, sempre antes de qualquer IA: 409 needs_article_blueprint (sem planta concluída: organizar no Radar, até 2 chamadas de IA por artigo, ditas no botão), 409 other_investigation (o Radar recongelou ou o ArticleDNA mudou depois do envio: reenviar o pacote atual), 409 refused, 409 seed_plan_without_parts e 503 blueprint_unavailable. Pelo MCP, save_writer_deliverable exige a mesma planta concluída (needs_article_blueprint com a ação na tela, ou blueprint_unavailable); nada é gravado sem ela. Planta e voz não mudam keyword, intenção, escopo nem fatos. A seção do artigo-modelo só chega à IA de seção quando o H2 casa com segurança (mesmo H2, ou as palavras que distinguem a seção); sem casamento, valem a ordem dos H2 e a voz. A melhoria de trecho (/api/redator/improve) recebe a seção da planta do H2 sob o qual o trecho está (focus.sectionLabel; trecho antes do primeiro H2 ou sob um H1 = só a forma), a regra do mapa da página publicada e a regra D10, e continua sem acrescentar CTA, link, H3, pergunta nem afirmação nova. Conflito vira divergência: na IA interna a voz entra como fonte citada (brand.skill/<versionId>); pelo MCP, record_writer_divergence aceita target { kind: 'brand_dna', versionId: <versionId da Skill de voz> } para apontar a própria voz.",
      "Trava de fonte e mapa na escrita (2026-10-08): a frase listada em needsSource (da planta ou da seção) só entra no texto com uma fonte do pacote que a sustente; sem ela, sai delimitada (orientação ou possibilidade, sem afirmar como fato o efeito comercial, a conversão ou o comportamento do público) ou fica fora, e o motivo nunca vai ao texto. Com publishedMap, o artigo atualiza a página publicada: o conteúdo do H2 de hoje é reescrito na seção de destino, e nada da página sai sem a decisão registrada no item. A IA interna recebe as duas regras no pedido (a melhoria de trecho só a da fonte). Roteiro e carrossel recebem a lista 'Frases do artigo-modelo que só entram com fonte' (promessa, CTA e próximo passo) e a voz com o rótulo de entregável ('versão corrente na Marca'; a ativa, 'ativa').",
    ],
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
      "No Radar, o usuário investiga e finaliza; o artigo-modelo da SERP sai concluído ao finalizar; você envia ao Redator (send_radar_to_writer). Sem o artigo-modelo concluído, o envio é recusado com a ação na tela: mostre ao usuário onde organizar e o custo (até 2 chamadas de IA por artigo, dito no botão) e envie de novo depois — o MCP não organiza.",
      "Escreva: playbook 'escrever_artigo'. Para escrever fora da plataforma, get_article_for_writing; para vídeo, cortes e carrossel, get_video_material — os dois pelo artigo-modelo.",
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
      "Confira articleBlueprintState (fundamentos e briefing): com 'needs_article_blueprint' ou 'blueprint_unavailable', não escreva pela estrutura antiga — mostre ao usuário a ação na tela (organizar o artigo-modelo no Radar, com o custo dito no botão; se o pacote mudou, reenviar ao Redator) e releia depois. Fatia com role 'raw_material' é proveniência, nunca estrutura.",
      "Com articleBlueprint nos fundamentos, siga a planta aprovada (H1, seções, pergunta do leitor, resposta que abre, links internos com as âncoras indicadas e o CTA). Com brandVoice, escreva a copy e o CTA na voz da marca (vale também a Skill em rascunho; statusLabel diz se é a ativa ou a versão corrente na Marca, e o estado técnico vem em status).",
      "Frase listada em needsSource (na planta ou na seção) só entra com uma fonte do pacote; sem ela, escreva delimitado (orientação ou possibilidade) ou deixe fora — o label não vai ao texto. Com publishedMap, o artigo atualiza a página publicada: leve cada H2 de hoje ao destino dito e não tire nada sem a decisão registrada. Use os nomes atuais de produto que a planta traz.",
      "get_writer_brief: instruções, links internos planejados e pendências do Radar.",
      "Estrutura: a principal no H1 e no slug; secundárias nos H2/H3 de forma natural (LSI/PNL, sem densidade forçada); o Assunto com a virada na seção sugerida.",
      "TOFU/informacional: abra cada seção com a resposta direta em 1–2 frases, depois aprofunde — é o formato que as IAs citam.",
      "Sem FAQ. Perguntas observadas na SERP viram cobertura dentro do texto.",
      "Inclua os links internos planejados (linkMap) com as âncoras indicadas, e o link para a página do silo.",
      "Dentro da plataforma: save_writer_draft com o lockVersion; depois get_writer_guardian e corrija os achados.",
      "Fora da plataforma (WordPress): use o mesmo dossiê ou get_article_for_writing (o CSV 'Para escrever', pelo artigo-modelo), escreva lá, e preserve slug, H1, links e a virada. Registre divergência se a evidência contrariar um DNA.",
      "Vídeo, cortes e carrossel do artigo: get_video_material (o CSV para vídeo e redes sociais, pelo artigo-modelo: capítulos = seções da planta, cortes pela utilidade, formato pela amostra pertinente). No Redator, salve o roteiro ou o carrossel com save_writer_deliverable.",
      "A aprovação final é do usuário, na tela do Redator.",
    ],
  },
  {
    id: "reforcar_publicado_pela_serp",
    title: "Melhorar publicados e formar Assuntos",
    whenToUse: "O usuário quer fortalecer publicados, resolver concorrência ou formar artigos com Assuntos declarados.",
    steps: [
      "get_platform_state: confira marca, publicados, Assuntos, DNAs aprovados e Posto das principais. Não trate SiloPage como Article.",
      "Com aceite que cite a leitura da IA (consome a Connection DeepSeek da marca) e a quota gratuita do Google Ads, improve_articles action prepare prepara a marca inteira. Na tela: Arquiteto → Artigos → cartão 'Próximo passo' → 1 · Buscar keywords (grátis) — o Google Ads é grátis; a leitura da IA usa a Connection DeepSeek da marca.",
      "Mostre a prévia: principal atual e proposta com demanda, entradas, saídas, transferências, enfoque, exclusões e motivo por alvo. Dados do DNA são de leitura; nunca invente volume ou compatibilidade.",
      "Linha com evidenceBasis editorial_ai veio da leitura da IA da plataforma na lista existente (depois dos pares da SERP, antes da busca nova): mostre o motivo de cada keyword como 'Leitura da IA — confira' e peça ao usuário que confira. Não trate a leitura da IA como prova; needsValidation significa que falta lente da SERP (ou faltou tempo para ler o parecer) e o passo 2 (collect, com prévia de custo) vem antes de gravar. As recusas da IA ficam em editorialAi.rejected: mostre-as quando o usuário perguntar por uma keyword que não entrou. Não escolha keywords por conta própria para completar a lista.",
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
  /* 2026-10-08 · rodada dos entregáveis: a mesma régua no CSV para escrever, no CSV de vídeo e no Redator. */
  { rule: "Afirmação de efeito comercial ('converte', 'traz pacientes', 'gera agendamentos'), de comportamento do público ('procuram no Google, não no Instagram') ou de mecanismo de plataforma só entra com fonte do pacote; sem fonte, sai delimitada (orientação ou possibilidade) ou fica fora. A tese que nega o efeito passa.", why: "E-E-A-T: afirmação sem fonte tira a confiança do leitor e das IAs que citam; a régua é uma só nos entregáveis." },
  { rule: "Nomes atuais de produto ('Perfil da Empresa no Google', não 'Google Meu Negócio'); o nome antigo só quando a keyword o traz ou para dizer que mudou.", why: "Nome desatualizado sinaliza conteúdo velho; a keyword que o leitor busca continua respeitada." },
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
  /* 2026-10-09 · regra do dono: o processo do piloto substitui o antigo em toda operação. */
  "Toda entrega de escrita e de vídeo sai do artigo-modelo da SERP concluído. Com needs_article_blueprint, mostre ao usuário a ação na tela (onde organizar e o custo, até 2 chamadas de IA por artigo, dito no botão); não escreva pela estrutura antiga e não tente organizar pelo MCP.",
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
    `Pipeline: ${pipeline}. O Planejador foi aposentado em 2026-10-01: o Radar entrega direto ao Redator, e /{brandRef}/planejador redireciona para o Radar.`,
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
