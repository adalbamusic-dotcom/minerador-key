import { RADAR_WRITER_MAY_NOT } from "../redator/writer-handoff.ts";
import { extractionFormatLabel, type RadarExtractionFormat } from "./analysis-insights.ts";
import { RADAR_CLAIM_TYPE_LABEL, radarClaimNeedsFactualSupport } from "./claim-evidence.ts";
import { RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS } from "./competitive-blueprint.ts";
import { radarCompetitorClassLabel, type RadarCompetitorClass } from "./competitor-universe.ts";
import { RADAR_EVIDENCE_LABEL, type RadarEvidenceResolution, type RadarSerpStanding } from "./evidence-authority.ts";
import { RADAR_EDITORIAL_OUTPUT_LABELS } from "./multimodal-blueprint.ts";
import { RADAR_WRITING_RULES } from "./portable-writer-context.ts";
import { radarNormalizedUrl } from "./research-reference.ts";
import { radarResearchSourceLabel, type RadarResearchSource } from "./search-mode.ts";
import { RADAR_SOURCE_AUTHORITY_LABEL } from "./source-authority.ts";

import type { RadarAiDiscoveryContext, RadarDiscoveryApplicability, RadarRetrievabilityKind, RadarConceptRelationKind } from "./ai-discovery-context.ts";
import type { RadarAuthorityEvidence, RadarEeatDimension, RadarEeatSignalState, RadarSpecialistReviewKind } from "./authority-evidence.ts";
import type { RadarCompetitiveObservedModel, RadarObservedCompetitor } from "./competitive-observed-model.ts";
import type { RadarBundleCrossSerp, RadarBundleEditorialOutput, RadarResearchLayer } from "./evidence-bundle.ts";
import type { RadarResearchProfile } from "./research-profile.ts";

/**
 * ===== AS LACUNAS DO DOSSIÊ PORTÁTIL — "o Redator tem, o CSV não tem" =====
 *
 * ==================== POR QUE ESTE ARQUIVO EXISTE ====================
 *
 * O CSV do Radar é uma SAÍDA FINAL: quem escreve com outra ferramenta ou com
 * outra IA recebe só ele. O pedido do dono do produto foi que ele tenha, por
 * artigo, os mesmos dados que o Redator da plataforma recebe. A conferência
 * campo a campo mostrou quatro blocos do dossiê V3 que o Redator recebe e o
 * CSV deixava para trás:
 *
 *   1. a SITUAÇÃO da investigação — datas, situação da SERP, sinal cruzado do
 *      YouTube, saídas recomendadas e, sobretudo, a PRONTIDÃO: o export aceita
 *      artigo que o Redator recusaria, e o arquivo não dizia isso;
 *   2. a AUTORIDADE e a DESCOBERTA POR IA — YMYL, E-E-A-T, afirmações que pedem
 *      prova e os requisitos de clareza que a camada de descoberta derivou;
 *   3. a ESTRUTURA DE CADA CONCORRENTE — melhor posição, todas as posições,
 *      recorrência, classificação e a estrutura medida da página;
 *   4. duas das sete PROIBIÇÕES do Redator, que as regras do CSV não diziam.
 *
 * ==================== O QUE ELE NÃO FAZ ====================
 *
 * Não lê banco, não chama coleta, não recalcula nada: projeta o que o dossiê
 * canônico já resolveu. A SERP gravada e o contexto do silo são de outras
 * partes do export — misturar aqui criaria duas projeções da mesma coisa.
 *
 * ==================== HIGIENE — invariante 43 ====================
 *
 * Nada de id interno, UUID, hash, referência de snapshot ou de corrida,
 * assinatura de rodada, endereço de evidência (`page:*`, `concept:*`,
 * `question:*`) nem `provenance` — que é justamente onde esses endereços
 * moram. O que atravessa é o RÓTULO legível e a contagem.
 *
 * Domínio puro: sem fetch, sem storage, sem coleta, sem React.
 */

/* ============================== os limites ============================== */

/**
 * ===== QUANTO CABE NUMA CÉLULA — e o resto é contado, não escondido =====
 *
 * A camada de descoberta de um artigo real passa de 200 kB; a planilha não
 * comporta isso numa célula, e quem escreve não precisa de tudo. Cada lista
 * tem um teto, e o que ficou de fora vira uma linha dizendo quantos — "não
 * existe" e "não coube" precisam ser distinguíveis por quem lê de fora.
 *
 * O teto por célula fica bem abaixo do limite de uma célula de planilha, porque
 * a linha inteira carrega outras dezenas de colunas.
 */
export const RADAR_PORTABLE_GAP_LIMITS = {
  layerLimitations: 5,
  editorialOutputs: 5,
  bundleConflicts: 5,
  claims: 10,
  marketVsFact: 5,
  eeatSignals: 8,
  specialistPoints: 6,
  discoveryUnits: 8,
  questionRequirements: 8,
  definitions: 6,
  entities: 6,
  relations: 6,
  retrievability: 8,
  clarity: 4,
  excluded: 5,
  limitations: 8,
  competitors: 20,
  positionsPerCompetitor: 10,
  thirdPartyExcerpt: 300,
  cellChars: 16000,
  /*
   * O JSON tem teto próprio, maior: ele é para automação, não para leitura, e
   * vinte concorrentes medidos ocupam perto de 19 mil caracteres. Continua bem
   * abaixo do limite de uma célula de planilha (32.767).
   */
  jsonCellChars: 24000,
} as const;

/** As colunas que este módulo entrega. Sufixo `_md` ou `_json`, sempre. */
export const RADAR_PORTABLE_GAP_COLUMNS = [
  "research_status_md",
  "authority_requirements_md",
  "competitors_structure_json",
] as const;

export type RadarPortableGapColumn = typeof RADAR_PORTABLE_GAP_COLUMNS[number];

/* ============================== a higiene ============================== */

/**
 * ===== A REDE DE SEGURANÇA DO TEXTO LIVRE =====
 *
 * Os campos lidos aqui foram escolhidos para não carregar endereço interno —
 * `provenance`, `refs`, `unitIds`, `claimId` e `referenceId` ficam de fora de
 * propósito. Ainda assim, texto livre é escrito por muita gente ao longo do
 * pipeline, e um "(question:c580aef1)" no meio de uma frase passaria calado.
 *
 * A troca é por um marcador legível, e não por nada: apagar em silêncio faria a
 * frase parecer completa quando não está.
 */
/* O endereço termina em letra ou dígito: o ponto final da frase não faz parte dele. */
const ENDERECO_INTERNO = /\b(?:page|concept|question|section|need|claim|answer|specialist|research|serp|bundle|bundle-hash|organic|paa|related|knowledge_graph|ytq|amzq|competitor|response|run|snapshot):[A-Za-z0-9](?:[A-Za-z0-9:_.-]*[A-Za-z0-9])?/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HASH = /\bsha256:[0-9a-f]*/gi;
const OMITIDO = "[referência interna omitida]";

const limpo = (valor: string | null | undefined): string =>
  (valor || "").replace(HASH, OMITIDO).replace(UUID, OMITIDO).replace(ENDERECO_INTERNO, OMITIDO).replace(/\s+/g, " ").trim();

/**
 * O INSTANTE, E SÓ QUANDO ELE É UM INSTANTE.
 *
 * A fotografia usa a assinatura da rodada como carimbo quando ninguém informa o
 * relógio. Uma data que não é data é pior do que a ausência dita.
 */
const instante = (valor: string | null | undefined): string | null =>
  valor && !Number.isNaN(Date.parse(valor)) ? valor : null;

/**
 * ===== TRECHO DE TERCEIRO: curto e marcado =====
 *
 * O resumo de uma fonte verificada é texto derivado de terceiro. Ele serve para
 * quem escreve conferir o que a fonte sustenta — nunca para ser colado no
 * artigo. Por isso sai truncado e com o aviso junto, na mesma linha.
 */
export const RADAR_PORTABLE_THIRD_PARTY_MARK = "trecho de terceiro — referência, não copiar";

export function radarPortableThirdPartyExcerpt(texto: string | null | undefined, limite: number = RADAR_PORTABLE_GAP_LIMITS.thirdPartyExcerpt): string | null {
  const corpo = limpo(texto);
  if (!corpo) return null;
  const cortado = corpo.length > limite ? `${corpo.slice(0, limite - 1).trimEnd()}…` : corpo;
  return `"${cortado}" (${RADAR_PORTABLE_THIRD_PARTY_MARK})`;
}

/* ========================== as listas com teto ========================== */

/**
 * Uma lista Markdown com teto — e a contagem do que não coube.
 *
 * `vazio` é obrigatório: lista vazia sem frase é exatamente a ausência que não
 * se distingue de esquecimento.
 */
function listaComTeto<T>(itens: readonly T[], limite: number, render: (item: T) => string, vazio: string): string[] {
  if (!itens.length) return [`- ${vazio}`];
  const linhas = itens.slice(0, limite).map(item => `- ${render(item)}`);
  if (itens.length > limite) {
    linhas.push(`- … e mais ${itens.length - limite} não listado(s) nesta célula (${limite} de ${itens.length} mostrados).`);
  }
  return linhas;
}

/**
 * ===== O TETO DA CÉLULA, CORTANDO EM FIM DE LINHA =====
 *
 * Cortar no meio de uma frase entregaria meia instrução com cara de instrução
 * inteira. O corte é na última quebra de linha que cabe, e o aviso diz que
 * houve corte.
 */
function tetoDaCelula(markdown: string, limite: number = RADAR_PORTABLE_GAP_LIMITS.cellChars): string {
  if (markdown.length <= limite) return markdown;
  const aviso = `\n\n> Célula encurtada: ${markdown.length} caracteres excediam o limite de ${limite}. As seções finais ficaram de fora desta célula.`;
  const espaco = limite - aviso.length;
  const quebra = markdown.lastIndexOf("\n", espaco);
  return `${markdown.slice(0, quebra > 0 ? quebra : espaco).trimEnd()}${aviso}`;
}

const simNao = (valor: boolean) => (valor ? "sim" : "não");

/*
 * PONTUAÇÃO DE FRASE ALHEIA.
 *
 * Os textos lidos do dossiê às vezes terminam em ponto, às vezes não. Colados
 * numa frase nossa, isso vira ".." ou duas frases emendadas sem ponto.
 */
const semPontoFinal = (texto: string): string => texto.replace(/[.;:\s]+$/, "");
const comPontoFinal = (texto: string): string => {
  const corpo = texto.trim();
  return !corpo || /[.!?…]$/.test(corpo) ? corpo : `${corpo}.`;
};

/* ================== 1 · a situação da investigação ================== */

/**
 * O MÍNIMO de uma camada de pesquisa que a situação lê.
 *
 * `refs` entra só com `collectedAt`: o id do snapshot ou da corrida e a
 * assinatura são endereço interno e nunca atravessam. `RadarResearchLayer`
 * inteiro é aceito — o tipo estreito só impede que alguém passe a lê-los aqui.
 */
export type RadarPortableResearchLayer =
  Pick<RadarResearchLayer, "role" | "frozenAt" | "counts" | "limitations"> & {
    refs: ReadonlyArray<{ collectedAt: string | null }>;
  };

/** O bloqueio da prontidão: código e frase. O `detail` fica fora — ele carrega ids. */
export type RadarPortableReadinessBlock = { code: string; message: string };

export type RadarPortableResearchStatusInput = {
  /**
   * O instante do congelamento, lido por `radarFrozenObservedAtOfAnalysis`.
   * `null` quando a análise não o gravou — e aí a célula diz isso, em vez de
   * mostrar o `observedAt` do dossiê, que nesse caso é a hora do pedido.
   */
  frozenObservedAt: string | null;
  /** `RadarEvidenceBundle` é aceito como está. */
  bundle: {
    primaryResearchProfile: RadarResearchProfile;
    researchSources: readonly RadarResearchSource[];
    research: {
      google: RadarPortableResearchLayer | null;
      youtube: RadarPortableResearchLayer | null;
      amazon: RadarPortableResearchLayer | null;
    };
    crossSerp: RadarBundleCrossSerp | null;
    editorialOutputs: readonly RadarBundleEditorialOutput[];
    serpStanding: RadarSerpStanding;
    conflicts: readonly RadarEvidenceResolution[];
  };
  /** `canonico.dossier.readiness` — a mesma regra que o Redator usa para recusar. */
  readiness: { ready: boolean; blocks: readonly RadarPortableReadinessBlock[] };
  /**
   * O fundamento traz versão E hash do ArticleDNA? O Redator recusa sem os
   * dois (`resolveRadarImportEligibility`). `null`/ausente: não informado, e a
   * célula não afirma nada sobre isso.
   */
  articleDnaIdentityComplete?: boolean | null;
  /**
   * A situação da SERP veio gravada no congelamento?
   *
   * Calcule com `radarFrozenSerpStandingOf(analise.finalizedBundle) !== null`.
   * Quando não veio — perfil de vídeo ou de produto, ou fotografia do Google
   * anterior ao registro —, o dossiê carrega o valor PADRÃO ("vigente,
   * suficiente e válida"), que não é avaliação de ninguém. Dizer isso é o que
   * impede o padrão de ser lido como veredito.
   */
  serpStandingFrozen?: boolean | null;
  /** O instante do pedido de export, quando se quer a linha autossuficiente. */
  exportedAt?: string | null;
  /**
   * Há coleta de SERP POSTERIOR à que a investigação analisou?
   *
   * O `observed` do Google é montado sobre a coleta mais recente do artigo,
   * e a análise só entra quando bate com ela. Com uma coleta posterior, as
   * colunas de evidência derivadas dele (fontes, evidência, concorrentes,
   * autoridade) podem descrever a coleta nova, sem curadoria — e só a coluna
   * da SERP dizia isso. Ausente ou `null`: nada a avisar.
   */
  newerSerpCollection?: { collectedAt: string | null } | null;
};

/* ------------------------ a prontidão para o Redator ------------------------ */

export const RADAR_PORTABLE_WRITER_READY_LABEL = "PRONTO PARA O REDATOR";
export const RADAR_PORTABLE_WRITER_BLOCKED_LABEL = "BLOQUEADO PARA O REDATOR";

/**
 * O QUE CADA BLOQUEIO QUER DIZER — e o que fazer com ele.
 *
 * A frase vem daqui, por código, e não do `detail` da prontidão: o detalhe foi
 * escrito para quem investiga e carrega id de marca, de artigo e de versão.
 * Código desconhecido cai na `message`, que é frase de operação.
 */
const BLOQUEIO: Record<string, { motivo: string; acao: string }> = {
  NOT_FINALIZED: {
    motivo: "a investigação não tem o congelamento que o Redator exige — a pesquisa não foi finalizada neste pipeline",
    acao: "finalize a pesquisa no Radar",
  },
  STALE: {
    motivo: "os fundamentos do artigo mudaram depois da investigação",
    acao: "refaça ou refinalize a investigação sobre a versão atual do ArticleDNA",
  },
  BRAND_MISMATCH: {
    motivo: "a investigação pertence a outra marca",
    acao: "não use este dossiê nesta marca",
  },
  ARTICLE_MISMATCH: {
    motivo: "a investigação pertence a outro artigo",
    acao: "não use este dossiê neste artigo",
  },
  ARTICLE_VERSION_MISMATCH: {
    motivo: "a investigação foi feita sobre outra versão do ArticleDNA",
    acao: "refinalize a investigação sobre a versão atual do ArticleDNA",
  },
  ARTICLE_HASH_MISMATCH: {
    motivo: "o conteúdo do ArticleDNA mudou depois da investigação, na mesma versão",
    acao: "refinalize a investigação sobre o conteúdo atual do ArticleDNA",
  },
  BUNDLE_MUTATED: {
    motivo: "o pacote de evidências não passou na verificação de integridade",
    acao: "refinalize a investigação para regenerar o pacote",
  },
  DOSSIER_DIVERGES: {
    motivo: "o dossiê atual diverge da investigação congelada",
    acao: "refinalize a investigação para que dossiê e congelamento voltem a coincidir",
  },
  ARTICLE_DNA_IDENTITY_INCOMPLETE: {
    motivo: "o fundamento do artigo não traz a versão e a impressão de conteúdo do ArticleDNA",
    acao: "confira no Arquiteto se o ArticleDNA deste artigo está aprovado",
  },
};

export type RadarPortableWriterReadiness = {
  state: "READY" | "BLOCKED";
  label: typeof RADAR_PORTABLE_WRITER_READY_LABEL | typeof RADAR_PORTABLE_WRITER_BLOCKED_LABEL;
  /** Os motivos, em português, sem repetição. Vazio quando pronto. */
  reasons: string[];
  /** O que fazer, na mesma ordem dos motivos, sem repetição. */
  actions: string[];
};

/**
 * ===== O REDATOR ACEITARIA ESTE ARTIGO? =====
 *
 * O export aceita todo artigo finalizado; o Redator só aceita o que a prontidão
 * canônica aprova. Antes, um artigo bloqueado saía no CSV com a mesma cara de
 * um pronto — e quem o levasse para outra IA escreveria sobre uma investigação
 * que a própria plataforma recusa.
 *
 * O artigo continua saindo: o CSV é pesquisa, e esconder a linha apagaria
 * trabalho legítimo. O que muda é que ele sai ROTULADO.
 */
export function radarPortableWriterReadiness(input: Pick<RadarPortableResearchStatusInput, "readiness" | "articleDnaIdentityComplete">): RadarPortableWriterReadiness {
  const blocos: RadarPortableReadinessBlock[] = [...input.readiness.blocks];
  if (input.articleDnaIdentityComplete === false) {
    blocos.push({ code: "ARTICLE_DNA_IDENTITY_INCOMPLETE", message: "O fundamento do artigo não traz a versão e a impressão de conteúdo do ArticleDNA." });
  }

  const pronto = input.readiness.ready && input.articleDnaIdentityComplete !== false;
  if (pronto) return { state: "READY", label: RADAR_PORTABLE_WRITER_READY_LABEL, reasons: [], actions: [] };

  const motivos = blocos.map(bloco => BLOQUEIO[bloco.code]?.motivo || semPontoFinal(limpo(bloco.message)) || "a prontidão recusou o pacote sem nomear o motivo");
  const acoes = blocos.map(bloco => BLOQUEIO[bloco.code]?.acao || "confira a investigação no Radar");
  return {
    state: "BLOCKED",
    label: RADAR_PORTABLE_WRITER_BLOCKED_LABEL,
    reasons: motivos.length ? [...new Set(motivos)] : ["a prontidão recusou o pacote sem nomear o motivo"],
    actions: acoes.length ? [...new Set(acoes)] : ["confira a investigação no Radar"],
  };
}

/* --------------------------- os rótulos da situação --------------------------- */

const PERFIL: Record<RadarResearchProfile, string> = {
  GOOGLE: "Google (páginas)",
  YOUTUBE: "YouTube (vídeo)",
  AMAZON: "Amazon (produto)",
};

const CAMADAS: Array<{ chave: "google" | "youtube" | "amazon"; fonte: RadarResearchSource }> = [
  { chave: "google", fonte: "WEB_SERP" },
  { chave: "youtube", fonte: "YOUTUBE_SERP" },
  { chave: "amazon", fonte: "AMAZON_SERP" },
];

/** O que `counts.items` conta depende da camada — e dizer o quê é o que dá sentido ao número. */
function itensDaCamada(chave: "google" | "youtube" | "amazon", camada: RadarPortableResearchLayer): string {
  if (chave === "google" && camada.role === "SUPPORT") {
    return "consulta de apoio sobre a keyword principal, sem amostra curada de páginas";
  }
  const rotulo = chave === "google" ? "página(s) comparável(is)" : chave === "youtube" ? "vídeo(s) no universo" : "produto(s) observado(s)";
  return `${camada.counts.queries} consulta(s) · ${camada.counts.items} ${rotulo}`;
}

const SINAL_CRUZADO: Record<RadarBundleCrossSerp["signals"][number]["signal"], string> = {
  CROSS_PLATFORM: "vídeo(s) aparecem nas duas buscas, YouTube e Google",
  YOUTUBE_ONLY: "vídeo(s) aparecem só na busca do YouTube",
  GOOGLE_ONLY: "vídeo(s) aparecem só na busca do Google",
};

const FONTE_CRUZADA: Record<string, string> = {
  GOOGLE_SERP: "SERP do Google",
  YOUTUBE_SERP: "SERP do YouTube",
};

const SAIDA: Record<string, string> = { ...RADAR_EDITORIAL_OUTPUT_LABELS, ...RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS };

/**
 * A ORIGEM DE UMA SAÍDA, EM PALAVRAS.
 *
 * `sourceSignals` é obrigatório no dossiê — é o que impede uma sugestão de
 * parecer contagem. Mas o multimodal usa um marcador técnico quando não tem
 * razão escrita, e ele não diz nada a quem está fora.
 */
function origemDaSaida(sinais: readonly string[]): string {
  const traduzidos = sinais.map(sinal => {
    if (sinal === "multimodal:cross-serp") return "leitura cruzada das buscas do YouTube e do Google";
    return limpo(sinal);
  }).filter(sinal => sinal && sinal !== OMITIDO);
  return traduzidos.length ? [...new Set(traduzidos)].join(" · ") : "origem registrada no dossiê do Radar, sem frase legível";
}

/**
 * ===== research_status_md — A SITUAÇÃO DA INVESTIGAÇÃO =====
 *
 * O que o painel "Fundamentos do Radar" do Redator lê do dossiê e o CSV não
 * dizia: quando a fotografia foi tirada, que camadas existem, se a SERP tem
 * precedência, o que o Radar recomenda produzir — e se o Redator aceitaria o
 * artigo hoje.
 */
export function radarPortableResearchStatusMarkdown(input: RadarPortableResearchStatusInput): string {
  const { bundle } = input;
  const perfil = bundle.primaryResearchProfile;
  const prontidao = radarPortableWriterReadiness(input);
  const congelado = instante(input.frozenObservedAt);
  const exportado = instante(input.exportedAt);

  const linhas: string[] = ["# Situação da investigação", ""];

  /* ---- a prontidão vem primeiro: é o que decide como o resto é lido ---- */
  linhas.push("## Prontidão para o Redator", "");
  if (prontidao.state === "READY") {
    linhas.push(`**${prontidao.label}.** Pela regra de prontidão do Radar, a plataforma aceitaria importar este dossiê no Redator agora.`);
  } else {
    linhas.push(
      `**${prontidao.label}.** Este artigo sai no CSV porque a investigação foi finalizada, mas o Redator da plataforma recusaria importá-lo agora. Use o dossiê como pesquisa e não o trate como pacote aprovado até resolver o bloqueio.`,
      "",
      ...prontidao.reasons.map(motivo => `- Motivo: ${motivo}.`),
      ...prontidao.actions.map(acao => `- O que fazer: ${acao}.`),
    );
  }

  /* ---- as datas ---- */
  linhas.push("", "## Datas", "");
  linhas.push(congelado
    ? `- Investigação congelada em: ${congelado}.`
    : "- Investigação congelada em: não gravado. A análise não registra o instante do congelamento; nenhuma data da investigação pode ser afirmada a partir deste campo.");
  if (exportado) linhas.push(`- Exportado em: ${exportado}.`);

  /* ---- as camadas ---- */
  linhas.push("", "## Camadas de pesquisa", "");
  linhas.push(`- Perfil primário: ${PERFIL[perfil] || perfil}.`);
  if (bundle.researchSources.length) {
    linhas.push(`- Fontes lidas: ${bundle.researchSources.map(fonte => radarResearchSourceLabel(fonte) || fonte).join(" · ")}.`);
  }
  const ausentes: string[] = [];
  for (const { chave, fonte } of CAMADAS) {
    const camada = bundle.research[chave];
    const nome = radarResearchSourceLabel(fonte) || fonte;
    if (!camada) { ausentes.push(nome); continue; }

    const coleta = instante(camada.refs.find(ref => instante(ref.collectedAt))?.collectedAt);
    const congelada = instante(camada.frozenAt);
    const quando = congelada && coleta && congelada === coleta
      ? `coleta congelada em ${congelada}`
      : [
        congelada ? `congelada em ${congelada}` : "instante de congelamento não gravado",
        coleta ? `coletada em ${coleta}` : "data da coleta não gravada",
      ].join(" · ");
    linhas.push(`- ${nome} — ${camada.role === "PRIMARY" ? "camada primária" : "camada de apoio"}: ${quando} · ${itensDaCamada(chave, camada)}.`);
    for (const limitacao of listaComTeto(camada.limitations.map(limpo).filter(Boolean), RADAR_PORTABLE_GAP_LIMITS.layerLimitations, item => `Limitação: ${item}`, "Nenhuma limitação registrada nesta camada.")) {
      linhas.push(`  ${limitacao}`);
    }
  }
  if (ausentes.length) linhas.push(`- Não investigadas neste artigo: ${ausentes.join(" · ")}.`);

  /* ---- a situação da SERP ---- */
  const posicao = bundle.serpStanding;
  linhas.push("", "## Situação da SERP", "");
  linhas.push(`- Tem precedência sobre o terreno competitivo: ${simNao(posicao.authoritative)}. ${limpo(posicao.reason)}`);
  linhas.push(`- Vigente: ${simNao(posicao.current)} · suficiente: ${simNao(posicao.sufficient)} · válida: ${simNao(posicao.valid)}.`);
  if (input.serpStandingFrozen === true) {
    linhas.push("- Origem: avaliada e gravada no congelamento da investigação.");
  } else if (input.serpStandingFrozen === false) {
    linhas.push(perfil === "GOOGLE"
      ? "- Origem: esta fotografia é anterior ao registro da situação da SERP. Os valores acima são o padrão do dossiê, não uma avaliação."
      : "- Origem: a investigação de vídeo e a de produto não avaliam a situação da SERP do Google. Os valores acima são o padrão do dossiê, não uma avaliação.");
  } else {
    linhas.push("- Origem: não informada ao export; os valores acima não foram conferidos contra o congelamento.");
  }
  if (input.newerSerpCollection) {
    const posterior = instante(input.newerSerpCollection.collectedAt);
    linhas.push(`- Há coleta de SERP posterior à investigação${posterior ? ` (${posterior})` : ""}, não usada por ela. As colunas de evidência montadas sobre a leitura observada (serp_sources_json, serp_evidence_json, competitors_structure_json e authority_requirements_md) partem da coleta mais recente do artigo e podem não descrever a SERP que a investigação analisou; essa está em serp_observed_md.`);
  }

  /* ---- o sinal cruzado ---- */
  linhas.push("", "## Sinal cruzado YouTube × Google", "");
  if (bundle.crossSerp) {
    const cruzado = bundle.crossSerp;
    linhas.push(...listaComTeto(cruzado.signals, 3, sinal => `${sinal.count} ${SINAL_CRUZADO[sinal.signal] || sinal.signal}.`, "O cruzamento foi gravado sem nenhum vídeo contado."));
    if (cruzado.sources.length) {
      linhas.push(`- Buscas cruzadas: ${cruzado.sources.map(fonte => FONTE_CRUZADA[fonte] || limpo(fonte)).join(" · ")}.`);
    }
    linhas.push("- Sinal competitivo, não factual: descreve onde os vídeos aparecem, não a qualidade nem a verdade do que dizem.");
  } else {
    linhas.push(perfil === "YOUTUBE"
      ? "- O cruzamento YouTube × Google não foi gravado nesta investigação."
      : "- Não se aplica: o cruzamento entre buscas existe só na investigação de vídeo.");
  }

  /* ---- as saídas recomendadas ---- */
  linhas.push("", "## Saídas editoriais recomendadas pelo Radar", "");
  linhas.push(...listaComTeto(
    bundle.editorialOutputs,
    RADAR_PORTABLE_GAP_LIMITS.editorialOutputs,
    saida => `${SAIDA[saida.output] || limpo(saida.output)} — objetivo: ${comPontoFinal(limpo(saida.objective))} Por quê: ${comPontoFinal(limpo(saida.reason))} Origem: ${semPontoFinal(origemDaSaida(saida.sourceSignals))}.`,
    "Nenhuma saída editorial foi recomendada nesta investigação.",
  ));
  if (bundle.editorialOutputs.length) {
    linhas.push("- Recomendação do Radar, não observação: a decisão do formato final continua de quem escreve.");
  }

  /* ---- as divergências de nível superior ---- */
  linhas.push("", "## Divergências registradas no dossiê", "");
  linhas.push(...listaComTeto(
    bundle.conflicts,
    RADAR_PORTABLE_GAP_LIMITS.bundleConflicts,
    conflito => `Prevalece ${RADAR_EVIDENCE_LABEL[conflito.prevailing.source] || conflito.prevailing.source}: ${comPontoFinal(limpo(conflito.prevailing.claim))}${conflito.overruled.length ? ` Sobreposta(s), preservada(s) no registro: ${conflito.overruled.map(item => semPontoFinal(limpo(item.claim))).join(" · ")}.` : ""}`,
    "Nenhuma divergência entre fontes foi registrada no nível do dossiê.",
  ));

  return tetoDaCelula(linhas.join("\n").trim());
}

/* =================== 2 · autoridade e descoberta por IA =================== */

export type RadarPortableAuthorityInput = {
  profile: RadarResearchProfile;
  /**
   * `bundle.observed` — só o perfil GOOGLE o produz. `null` é a verdade sobre
   * um artigo de vídeo ou de produto, e a célula diz isso.
   *
   * A evidência semântica e a estrutural (`observed.evidence`) ficam de fora
   * de propósito: passam de meio megabyte e já estão projetadas nas outras
   * colunas.
   */
  observed: Pick<RadarCompetitiveObservedModel, "authorityEvidence" | "aiDiscovery"> | null;
};

const YMYL: Record<string, string> = { NONE: "nenhuma", LOW: "baixa", MATERIAL: "material", HIGH: "alta" };
const RECORRENCIA: Record<string, string> = { STRONG: "forte", MODERATE: "moderada", WEAK: "fraca" };
const PRIORIDADE: Record<string, string> = { HIGH: "alta", MEDIUM: "média", LOW: "baixa" };

/**
 * O MOTIVO DA REVISÃO CITA O ENUM CRU.
 *
 * A camada de autoridade escreve "relevância high com recorrência strong" — o
 * valor técnico em minúsculas no meio da frase. Na plataforma isso passa; num
 * CSV lido por quem escreve em português, é ruído. A tradução é só destas duas
 * expressões, por par exato, e não toca no resto do texto.
 */
const ENUM_NA_FRASE: Array<[string, string]> = [
  ["relevância high", "relevância alta"],
  ["relevância material", "relevância material"],
  ["relevância low", "relevância baixa"],
  ["relevância none", "relevância nenhuma"],
  ["recorrência strong", "recorrência forte"],
  ["recorrência moderate", "recorrência moderada"],
  ["recorrência weak", "recorrência fraca"],
];

const semEnumEmIngles = (texto: string): string =>
  ENUM_NA_FRASE.reduce((frase, [cru, legivel]) => frase.split(cru).join(legivel), texto);
const ORDEM_DE_PRIORIDADE: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const DIMENSAO_EEAT: Record<RadarEeatDimension, string> = {
  EXPERIENCE: "Experiência",
  EXPERTISE: "Especialização",
  AUTHORITATIVENESS: "Autoridade",
  TRUST: "Confiança",
};

const ESTADO_EEAT: Record<RadarEeatSignalState, string> = {
  SUPPORTED: "observado com sustentação",
  DECLARED: "declarado pela página, não conferido",
  UNVERIFIED: "não verificado",
  ABSENT: "ausente na amostra",
};

const REVISAO: Record<RadarSpecialistReviewKind, string> = {
  RESOLVE_FACTUAL_UNCERTAINTY: "resolver dúvida factual",
  RESOLVE_CONFLICT: "resolver conflito entre mercado e evidência",
  VERIFY_AND_ADD_EXPERIENCE: "confirmar e acrescentar a leitura prática",
};

const APLICABILIDADE: Record<RadarDiscoveryApplicability, string> = {
  REQUIRED: "obrigatória neste estágio de funil",
  APPLICABLE: "aplicável",
  CONTEXTUAL: "contextual",
  UNDETERMINED: "indeterminada",
};

const RECUPERABILIDADE: Record<RadarRetrievabilityKind, string> = {
  DIRECT_ANSWER: "Resposta direta",
  EARLY_ANSWER_OPPORTUNITY: "Resposta cedo",
  DEFINITION_BEFORE_DEPTH: "Definição antes do aprofundamento",
  PASSAGE_INDEPENDENCE: "Trecho autossuficiente",
  REFERENTIAL_CLARITY: "Referente explícito",
  EXPLICIT_ENTITY: "Entidade nomeada",
  SUPPORTED_CLAIM: "Afirmação sustentada",
  COMPARISON_CRITERIA: "Critérios de comparação",
  STRUCTURED_FORMAT: "Formato estruturado",
};

/* O mesmo vocabulário da projeção da camada (`radarAiDiscoveryLines`), que não o exporta. */
const RELACAO: Record<RadarConceptRelationKind, string> = {
  CAUSE_OF: "é causa de",
  RESULT_OF: "é resultado de",
  AFFECTS: "afeta",
  QUALIFIES: "caracteriza",
  USED_FOR: "é usado para",
  CONTRASTS_WITH: "contrasta com",
  REQUIRES: "exige a compreensão de",
  RELATED_TO: "se relaciona com",
};

type Autoridade = RadarAuthorityEvidence;
type Afirmacao = Autoridade["claims"][number];

/**
 * A SITUAÇÃO DE UMA AFIRMAÇÃO — pela mesma regra que produziu o resumo.
 *
 * O resumo da camada conta "sem fonte" como afirmação sem evidência `SUPPORTS`.
 * Usar outra régua aqui faria a linha e o total discordarem na mesma célula.
 * Conflito mercado × fato vence: é ele que muda o que pode ser afirmado.
 */
function situacaoDaAfirmacao(afirmacao: Afirmacao, autoridade: Autoridade): string {
  if (autoridade.marketVsFactConflicts.some(item => item.claimId === afirmacao.claimId)) {
    return "em conflito com a evidência factual — não reproduzir a versão do mercado como fato";
  }
  const sustentacao = autoridade.factualEvidence.filter(item => item.claimId === afirmacao.claimId && item.supportType === "SUPPORTS");
  if (sustentacao.length) {
    const fontes = [...new Set(sustentacao.map(item => `${limpo(item.sourceDomain)} (${RADAR_SOURCE_AUTHORITY_LABEL[item.sourceType] || item.sourceType})`))];
    return `sustentada por fonte verificada: ${fontes.join(" · ")}`;
  }
  return "sem fonte adequada nesta investigação — não afirmar como fato sem fonte";
}

function blocoDeAutoridade(autoridade: Autoridade): string[] {
  const limites = RADAR_PORTABLE_GAP_LIMITS;
  const ymyl = autoridade.ymylAssessment;
  const linhas: string[] = [];

  linhas.push("## YMYL do artigo", "");
  linhas.push(`- Relevância: ${YMYL[ymyl.relevance] || ymyl.relevance}. ${limpo(ymyl.reason)}`);
  linhas.push(ymyl.signals.length
    ? `- Sinais: ${ymyl.signals.map(limpo).join(" · ")}.`
    : "- Sinais: nenhum sinal de decisão sensível sobre saúde, dinheiro ou segurança.");
  linhas.push(...listaComTeto(ymyl.evidenceRequirements.map(limpo).filter(Boolean), limites.limitations, item => `Exigência: ${item}`, "Exigência: nenhuma além da prática editorial comum."));
  linhas.push(`- Revisão profissional antes do texto final: ${ymyl.specialistReviewRequired ? "exigida" : "não exigida"}.`);

  /* ---- as afirmações que pedem prova ---- */
  const pedemProva = autoridade.claims
    .filter(radarClaimNeedsFactualSupport)
    .slice()
    .sort((a, b) => (a.ymyl.relevance === b.ymyl.relevance ? b.market.competitors - a.market.competitors : a.ymyl.relevance === "HIGH" ? -1 : 1));
  const resumo = autoridade.summary;
  linhas.push("", "## Afirmações que pedem prova", "");
  linhas.push(`- Resumo: ${resumo.claimsNeedingSupport} afirmação(ões) de relevância material ou alta · ${resumo.claimsWellSupported} com fonte · ${resumo.claimsWithEvidenceGap} sem fonte adequada.`);
  linhas.push(...listaComTeto(
    pedemProva,
    limites.claims,
    afirmacao => [
      `${RADAR_CLAIM_TYPE_LABEL[afirmacao.claimType] || afirmacao.claimType}: ${limpo(afirmacao.canonicalClaim)} — relevância ${YMYL[afirmacao.ymyl.relevance] || afirmacao.ymyl.relevance};`,
      `o mercado trata em ${afirmacao.market.competitors} de ${afirmacao.market.sampleSize} página(s) (recorrência ${RECORRENCIA[afirmacao.market.recurrence] || afirmacao.market.recurrence}).`,
      `Situação: ${situacaoDaAfirmacao(afirmacao, autoridade)}.`,
      afirmacao.observedSourceDomains.length
        ? `Fontes que os concorrentes citam (candidatas, não verificadas): ${afirmacao.observedSourceDomains.map(limpo).join(" · ")}.`
        : "",
    ].filter(Boolean).join(" "),
    "Nenhuma afirmação desta investigação foi classificada como de relevância material ou alta.",
  ));

  /* ---- mercado × fato ---- */
  linhas.push("", "## Mercado × evidência factual", "");
  linhas.push(...listaComTeto(
    autoridade.marketVsFactConflicts,
    limites.marketVsFact,
    conflito => {
      const posicao = radarPortableThirdPartyExcerpt(conflito.factualPosition);
      return `${limpo(conflito.canonicalClaim)}: ${comPontoFinal(limpo(conflito.marketObservation))} A evidência factual diz: ${posicao || "posição não registrada"}. Impacto: ${comPontoFinal(limpo(conflito.impact))}`;
    },
    "Nenhum conflito entre o que o mercado repete e a evidência factual foi registrado.",
  ));

  /* ---- E-E-A-T ---- */
  linhas.push("", "## Sinais de E-E-A-T na amostra", "");
  linhas.push("- Sinais observados, sem nota: ninguém sabe calcular a nota que o Google dá, e o Radar não inventa uma.");
  linhas.push(...listaComTeto(
    autoridade.eeatSignals,
    limites.eeatSignals,
    /* `provenance` fica de fora: é ali que moram os ids das páginas lidas. */
    sinal => `${DIMENSAO_EEAT[sinal.dimension] || sinal.dimension} · ${limpo(sinal.label)}: ${ESTADO_EEAT[sinal.state] || sinal.state}. ${limpo(sinal.observation)}`,
    "Nenhum sinal de E-E-A-T foi lido nesta amostra.",
  ));

  /* ---- o especialista ---- */
  const pontos = autoridade.specialistReviewRequirements.slice()
    .sort((a, b) => (ORDEM_DE_PRIORIDADE[a.priority] ?? 3) - (ORDEM_DE_PRIORIDADE[b.priority] ?? 3));
  /*
   * A PERGUNTA DE CONFLITO EMBUTE O RESUMO DA FONTE INTEIRO.
   *
   * `formularPergunta` cola a posição factual — texto derivado de terceiro, até
   * 400 caracteres — no meio da pergunta ao profissional. Dentro da plataforma
   * isso é contexto; num CSV que vai para fora, é trecho de terceiro sem aviso.
   * Ele é trocado pelo trecho curto e marcado, sem mexer no resto da frase.
   */
  const perguntaSemTrechoLongo = (ponto: Autoridade["specialistReviewRequirements"][number]): string => {
    const conflito = autoridade.marketVsFactConflicts.find(item => item.claimId === ponto.claimId);
    const posicao = conflito?.factualPosition?.trim();
    const pergunta = posicao && ponto.specificQuestion.includes(posicao)
      ? ponto.specificQuestion.split(posicao).join(radarPortableThirdPartyExcerpt(posicao) || "")
      : ponto.specificQuestion;
    return limpo(pergunta);
  };
  linhas.push("", "## Pontos para revisão profissional", "");
  linhas.push(...listaComTeto(
    pontos,
    limites.specialistPoints,
    ponto => `Prioridade ${PRIORIDADE[ponto.priority] || ponto.priority} · ${REVISAO[ponto.kind] || ponto.kind}: ${limpo(ponto.topic)}. ${semEnumEmIngles(limpo(ponto.whyReviewIsNeeded))} Pergunta preparada: ${perguntaSemTrechoLongo(ponto)}`,
    "Nenhum ponto desta investigação exige revisão profissional.",
  ));

  /* ---- as fontes por natureza ---- */
  if (resumo.sourcesByType.length) {
    linhas.push("", "## Fontes classificadas por natureza", "");
    linhas.push(...resumo.sourcesByType.map(item => `- ${limpo(item.label)}: ${item.count}.`));
  }

  return linhas;
}

function blocoDeDescoberta(descoberta: RadarAiDiscoveryContext): string[] {
  const limites = RADAR_PORTABLE_GAP_LIMITS;
  const linhas: string[] = ["## Descoberta por IA", ""];

  linhas.push(`- Aplicabilidade: ${APLICABILIDADE[descoberta.applicability] || descoberta.applicability}. ${limpo(descoberta.reason)}`);
  /* `funnel.source` fica de fora: ele cita a versão da qualificação. */
  if (descoberta.funnel.declared) linhas.push(`- Funil declarado pelo fundamento: ${limpo(descoberta.funnel.declared)}.`);
  if (!descoberta.applicable) {
    linhas.push("- Por não se aplicar a este artigo, a camada não gerou requisitos de descoberta.");
    return linhas;
  }
  linhas.push("- Um artigo só, para quem busca e para quem interpreta: não existe versão \"para máquina\".");

  linhas.push("", "### Necessidades que o artigo precisa responder", "");
  const unidades = descoberta.answerableUnits.slice()
    .sort((a, b) => ({ CORE: 0, SUPPORTING: 1, PERIPHERAL: 2 }[a.importance] ?? 3) - ({ CORE: 0, SUPPORTING: 1, PERIPHERAL: 2 }[b.importance] ?? 3));
  linhas.push(...listaComTeto(
    unidades,
    limites.discoveryUnits,
    unidade => `${limpo(unidade.questionOrNeed)} — ${unidade.importance === "CORE" ? "central" : unidade.importance === "SUPPORTING" ? "de apoio" : "periférica"}; ${unidade.marketRecurrence.pages} de ${unidade.marketRecurrence.sampleSize} concorrente(s). Material: ${unidade.readiness === "READY" ? "suficiente" : "insuficiente"} — ${limpo(unidade.readinessReason)}`,
    "Nenhuma necessidade foi sustentada pela amostra.",
  ));

  linhas.push("", "### Perguntas a cobrir", "");
  const perguntas = descoberta.questionCoverageRequirements.slice()
    .sort((a, b) => (ORDEM_DE_PRIORIDADE[a.priority] ?? 3) - (ORDEM_DE_PRIORIDADE[b.priority] ?? 3));
  linhas.push(...listaComTeto(
    perguntas,
    limites.questionRequirements,
    pergunta => `${limpo(pergunta.question)} (prioridade ${PRIORIDADE[pergunta.priority] || pergunta.priority}) — ${comPontoFinal(limpo(pergunta.requirement))} Evidência: ${comPontoFinal(limpo(pergunta.evidence))}`,
    "Nenhuma pergunta recorrente exigiu cobertura.",
  ));

  linhas.push("", "### Definições necessárias", "");
  linhas.push(...listaComTeto(
    descoberta.definitionRequirements,
    limites.definitions,
    definicao => `${limpo(definicao.term)} — ${limpo(definicao.reason)}`,
    "Nenhuma definição se mostrou necessária para compreender o restante.",
  ));

  linhas.push("", "### Entidades a nomear", "");
  linhas.push(...listaComTeto(
    descoberta.entityCoverageRequirements,
    limites.entities,
    entidade => `${limpo(entidade.label)} — ${semPontoFinal(limpo(entidade.requirement))} (${entidade.pages} de ${entidade.sampleSize} página(s)).`,
    "Nenhuma entidade exigiu cobertura explícita.",
  ));

  linhas.push("", "### Relações entre conceitos observadas", "");
  linhas.push(...listaComTeto(
    descoberta.conceptRelations.filter(relacao => relacao.basis === "OBSERVED"),
    limites.relations,
    relacao => `${limpo(relacao.subject)} ${RELACAO[relacao.kind] || relacao.kind} ${limpo(relacao.object)} — ${relacao.pages} de ${relacao.sampleSize} página(s).`,
    "Nenhuma relação entre conceitos foi observada na amostra.",
  ));

  linhas.push("", "### Trechos que precisam se sustentar sozinhos", "");
  /* `unitIds` e `provenance` ficam de fora: são endereço interno. */
  linhas.push(...listaComTeto(
    descoberta.retrievabilityRequirements,
    limites.retrievability,
    requisito => `${RECUPERABILIDADE[requisito.kind] || requisito.kind} · ${limpo(requisito.subject)}: ${limpo(requisito.requirement)}`,
    "Nenhum requisito de recuperabilidade foi derivado da amostra.",
  ));

  if (descoberta.potentialClarityImprovements.length) {
    linhas.push("", "### Oportunidades de clareza (leitura interpretativa, não exigência)", "");
    linhas.push(...listaComTeto(
      descoberta.potentialClarityImprovements,
      limites.clarity,
      item => `${limpo(item.subject)} — ${limpo(item.suggestion)}`,
      "",
    ));
  }

  const cobertura = descoberta.factualCoverage;
  linhas.push("", "### Cobertura factual das necessidades", "");
  linhas.push(`- ${cobertura.adequate} sustentada(s) · ${cobertura.partial} parcial(is) · ${cobertura.missing} sem fonte adequada · ${cobertura.conflicted} em conflito · ${cobertura.notRequired} sem exigência factual · ${descoberta.specialistConnections.length} dependem do especialista.`);

  for (const conflito of descoberta.conflicts) {
    linhas.push(`- Divergência registrada: a observação prevalece sobre a leitura interpretativa, que fica no registro — ${conflito.overruled.map(item => limpo(item.claim)).join(" · ")}`);
  }

  if (descoberta.excluded.length) {
    linhas.push("", "### Fora dos requisitos, com o motivo", "");
    linhas.push(...listaComTeto(descoberta.excluded, limites.excluded, item => `${limpo(item.subject)} — ${limpo(item.reason)}`, ""));
  }

  return linhas;
}

/**
 * ===== authority_requirements_md — O QUE O ARTIGO PRECISA SUSTENTAR =====
 *
 * O CSV levava só o plano de autoridade do blueprint. O Redator recebe a camada
 * inteira: YMYL, afirmações que pedem prova, conflitos mercado × fato, sinais de
 * E-E-A-T, os pontos preparados para o especialista e os requisitos de
 * descoberta por IA. Aqui ela vem RESUMIDA, com teto por lista e com a contagem
 * do que ficou de fora.
 */
export function radarPortableAuthorityRequirementsMarkdown(input: RadarPortableAuthorityInput): string {
  const linhas: string[] = ["# Autoridade e descoberta por IA", ""];
  const autoridade = input.observed?.authorityEvidence ?? null;
  const descoberta = input.observed?.aiDiscovery ?? null;

  if (!autoridade && !descoberta) {
    linhas.push(input.profile === "GOOGLE"
      ? "A investigação de páginas deste artigo não carrega a camada de autoridade nem a de descoberta por IA. Nada nesta célula pode ser usado como exigência de prova."
      : `Este artigo foi investigado pelo perfil ${PERFIL[input.profile] || input.profile}. A camada de autoridade (YMYL, E-E-A-T, afirmações que pedem prova) e a de descoberta por IA são produzidas só pela investigação de páginas do Google, e não existem neste dossiê. Ausência da camada não é ausência de exigência: afirmação sensível continua pedindo fonte.`);
    return linhas.join("\n").trim();
  }

  linhas.push("Resumo da camada de autoridade e da camada de descoberta por IA do dossiê. Cada lista tem teto; o que não coube é contado no fim dela.", "");

  if (autoridade) {
    linhas.push(...blocoDeAutoridade(autoridade));
  } else {
    linhas.push("## Autoridade", "", "- A camada de autoridade não foi gravada neste dossiê.");
  }

  linhas.push("");
  if (descoberta) {
    linhas.push(...blocoDeDescoberta(descoberta));
  } else {
    linhas.push("## Descoberta por IA", "", "- A camada de descoberta por IA não foi gravada neste dossiê.");
  }

  const limitacoes = [...new Set([...(autoridade?.limitations || []), ...(descoberta?.limitations || [])].map(limpo).filter(Boolean))];
  linhas.push("", "## Limitações destas camadas", "");
  linhas.push(...listaComTeto(limitacoes, RADAR_PORTABLE_GAP_LIMITS.limitations, item => item, "Nenhuma limitação registrada nestas camadas."));

  return tetoDaCelula(linhas.join("\n").trim());
}

/* ================= 3 · a estrutura de cada concorrente ================= */

export type RadarPortableCompetitorStructure = {
  title: string;
  domain: string;
  url: string;
  /** A MELHOR posição entre todas as consultas — não a da primeira aparição. */
  bestPosition: number | null;
  positions: Array<{ query: string | null; keywordRole: string; position: number }>;
  /** Em quantas consultas a página apareceu. Sinal competitivo, não de qualidade. */
  queryRecurrence: number;
  origin: string;
  classification: string | null;
  /** O mesmo papel de `serp_sources_json`, para as duas colunas se cruzarem pela URL. */
  role: "COMPARABLE" | "REFERENCE" | "SUPPORT";
  format: string | null;
  comparable: boolean;
  extraction: string;
  structure: { words: number; h2: number; h3: number; paragraphs: number; images: number; lists: number } | null;
  /**
   * O valor DESTA página em cada eixo medido da amostra: rótulo → valor.
   *
   * Mapa, e não lista de objetos, porque a régua da amostra (mediana e faixa
   * central) é a mesma para todos e sai uma vez só, em `sampleMeasures`.
   * Repeti-la em cada concorrente triplicava a célula sem dizer nada novo.
   */
  measures: Record<string, number>;
  /** Os eixos em que esta página fica FORA da faixa central — o outlier nomeado. */
  outsideCentralRange: string[];
  presencesObserved: string[];
  conceptsCovered: number;
  questionsCovered: number;
  limitations: string[];
};

export type RadarPortableCompetitorsStructure = {
  usage: string;
  total: number;
  listed: number;
  /** A frase do que ficou de fora. `null` quando todos couberam. */
  omitted: string | null;
  measuresAvailable: boolean;
  /** A régua da amostra, uma vez só: contra ela se lê o valor de cada página. */
  sampleMeasures: Array<{ label: string; median: number | null; centralRange: [number, number] | null; pages: number }>;
  /** Por que não há concorrentes, quando não há. `null` quando há. */
  absence: string | null;
  competitors: RadarPortableCompetitorStructure[];
};

export type RadarPortableCompetitorsInput = {
  profile: RadarResearchProfile;
  /** `bundle.observed` — só o perfil GOOGLE o produz. */
  observed: Pick<RadarCompetitiveObservedModel, "competitors" | "structure"> | null;
};

const ORIGEM: Record<RadarObservedCompetitor["origin"], string> = {
  CANONICAL: "consulta canônica do artigo",
  AUXILIARY: "consulta auxiliar (secundárias e reforços)",
  CANONICAL_AND_AUXILIARY: "consulta canônica e auxiliar",
  UNKNOWN: "origem não observada",
};

const EXTRACAO: Record<string, string> = {
  success: "página lida",
  partial: "página lida em parte",
  blocked: "leitura bloqueada pelo site",
  timeout: "leitura interrompida por tempo",
  invalid_html: "página sem conteúdo legível",
  unsupported: "formato que a leitura não suporta",
  failed: "leitura falhou",
  pending: "leitura pendente",
  not_extracted: "página não lida nesta investigação",
};

const PAPEL_DA_CONSULTA: Record<string, string> = {
  principal: "principal",
  secundaria: "secundária",
  reforco_narrativo: "reforço narrativo",
};

const USO_DOS_CONCORRENTES = "Estrutura medida de páginas de terceiros: referência de mercado, nunca molde a copiar. Títulos e URLs são de terceiros.";

function estruturaDoConcorrente(
  concorrente: RadarObservedCompetitor,
  estrutura: Pick<RadarCompetitiveObservedModel, "structure">["structure"],
): RadarPortableCompetitorStructure {
  const chave = radarNormalizedUrl(concorrente.url);
  const posicoes = concorrente.ranks
    .filter(item => typeof item.rank === "number" && Number.isFinite(item.rank))
    .map(item => ({
      query: item.keyword ? limpo(item.keyword) : null,
      keywordRole: PAPEL_DA_CONSULTA[item.role] || limpo(item.role).replace(/_/g, " "),
      position: item.rank,
    }))
    .sort((a, b) => a.position - b.position);

  /*
   * ===== A MEDIDA POR PÁGINA, PELA URL =====
   *
   * Cada medida guarda as páginas que a sustentam com o valor de cada uma. O
   * elo com o concorrente é a URL normalizada — o id da página é endereço
   * interno e não atravessa.
   */
  const medidas: Record<string, number> = {};
  const foraDaFaixa: string[] = [];
  for (const medida of estrutura.measures) {
    if (medida.kind === "absent") continue;
    const fonte = medida.sources.find(item => radarNormalizedUrl(item.url) === chave);
    if (!fonte) continue;
    const rotulo = limpo(medida.label);
    medidas[rotulo] = fonte.value;
    if (medida.outliers.some(item => radarNormalizedUrl(item.url) === chave)) foraDaFaixa.push(rotulo);
  }

  /*
   * PRESENÇA LISTADA É PRESENÇA OBSERVADA.
   *
   * As presenças têm denominadores diferentes (abertura, fechamento, keyword),
   * e a fonte só guarda quem atende. Por isso a lista diz o que foi visto, e a
   * ausência dela NÃO prova que a página não faz — isso vai escrito no `usage`.
   */
  const presencas = estrutura.presences
    .filter(presenca => presenca.sources.some(item => radarNormalizedUrl(item.url) === chave))
    .map(presenca => limpo(presenca.label));

  return {
    title: limpo(concorrente.title),
    domain: limpo(concorrente.domain),
    url: concorrente.url,
    bestPosition: posicoes.length ? posicoes[0].position : null,
    positions: posicoes.slice(0, RADAR_PORTABLE_GAP_LIMITS.positionsPerCompetitor),
    queryRecurrence: concorrente.queryRecurrence,
    origin: ORIGEM[concorrente.origin] || ORIGEM.UNKNOWN,
    classification: concorrente.classification ? radarCompetitorClassLabel(concorrente.classification as RadarCompetitorClass) || null : null,
    /* A mesma regra de `radarPortableSerpSources`: as duas colunas precisam concordar. */
    role: concorrente.comparable ? "COMPARABLE" : concorrente.origin === "AUXILIARY" ? "SUPPORT" : "REFERENCE",
    format: concorrente.format ? extractionFormatLabel(concorrente.format as RadarExtractionFormat) || null : null,
    comparable: concorrente.comparable,
    extraction: EXTRACAO[concorrente.extractionStatus] || "situação de leitura não registrada",
    structure: concorrente.structure ? { ...concorrente.structure } : null,
    measures: medidas,
    outsideCentralRange: foraDaFaixa,
    presencesObserved: presencas,
    conceptsCovered: concorrente.conceptsCovered.length,
    questionsCovered: concorrente.questionsCovered.length,
    limitations: concorrente.limitations.map(limpo).filter(Boolean),
  };
}

/**
 * ===== competitors_structure_json — CADA CONCORRENTE, MEDIDO =====
 *
 * `serp_sources_json` já leva endereço, consultas e o que a página sustentou, e
 * o formato dele é fixado por teste. O que faltava — melhor posição, todas as
 * posições, recorrência, classificação e a estrutura medida — vem numa coluna
 * própria, cruzável com aquela pela URL.
 *
 * A ordem é pela melhor posição: com teto de itens, o que fica de fora é o que
 * menos disputa a busca, e a contagem diz quantos.
 */
export function radarPortableCompetitorsStructure(input: RadarPortableCompetitorsInput): RadarPortableCompetitorsStructure {
  const observado = input.observed;
  if (!observado) {
    return {
      usage: USO_DOS_CONCORRENTES,
      total: 0,
      listed: 0,
      omitted: null,
      measuresAvailable: false,
      sampleMeasures: [],
      absence: input.profile === "GOOGLE"
        ? "A investigação de páginas deste artigo não carrega a fotografia competitiva: nenhum concorrente pode ser descrito a partir deste dossiê."
        : `Este artigo foi investigado pelo perfil ${PERFIL[input.profile] || input.profile}. A estrutura de concorrentes é produzida só pela investigação de páginas do Google, e não existe neste dossiê.`,
      competitors: [],
    };
  }

  const ordenados = observado.competitors
    .map((concorrente, ordem) => ({ item: estruturaDoConcorrente(concorrente, observado.structure), ordem }))
    .sort((a, b) => {
      const pa = a.item.bestPosition ?? Number.POSITIVE_INFINITY;
      const pb = b.item.bestPosition ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      if (a.item.queryRecurrence !== b.item.queryRecurrence) return b.item.queryRecurrence - a.item.queryRecurrence;
      return a.ordem - b.ordem;
    })
    .map(entrada => entrada.item);

  const limite = RADAR_PORTABLE_GAP_LIMITS.competitors;
  const listados = ordenados.slice(0, limite);
  const medidas = observado.structure.measures.filter(medida => medida.kind !== "absent");
  const medidasDisponiveis = medidas.length > 0;

  return {
    usage: `${USO_DOS_CONCORRENTES} Presença listada é presença observada; a ausência dela não prova que a página não faz.`,
    total: ordenados.length,
    listed: listados.length,
    omitted: ordenados.length > limite
      ? `${ordenados.length - limite} concorrente(s) de pior posição ficaram fora desta coluna (${limite} de ${ordenados.length}). Todos continuam em serp_sources_json.`
      : null,
    measuresAvailable: medidasDisponiveis,
    sampleMeasures: medidas.map(medida => ({
      label: limpo(medida.label),
      /* Página única não tem mediana de mercado: o valor observado é o dela. */
      median: medida.kind === "single_page" ? medida.observed : medida.median,
      centralRange: medida.centralRange ? [medida.centralRange[0], medida.centralRange[1]] as [number, number] : null,
      pages: medida.sampleSize,
    })),
    absence: ordenados.length
      ? (medidasDisponiveis ? null : "A fotografia não carrega medidas estruturais por página: só a estrutura resumida de cada concorrente lido está disponível.")
      : "A investigação não registrou nenhum concorrente.",
    competitors: listados,
  };
}

/**
 * A MESMA ESTRUTURA, COMO CÉLULA — com o teto aplicado sem quebrar o JSON.
 *
 * Cortar um JSON no meio produz texto que nenhuma ferramenta abre. Quando não
 * cabe, saem menos concorrentes, e `omitted` diz quantos.
 */
export function radarPortableCompetitorsStructureJson(input: RadarPortableCompetitorsInput, limite: number = RADAR_PORTABLE_GAP_LIMITS.jsonCellChars): string {
  const completo = radarPortableCompetitorsStructure(input);
  let listados = completo.competitors.length;
  let texto = JSON.stringify(completo);
  while (texto.length > limite && listados > 0) {
    listados -= 1;
    const reduzido: RadarPortableCompetitorsStructure = {
      ...completo,
      listed: listados,
      omitted: `${completo.total - listados} concorrente(s) de pior posição ficaram fora desta coluna para caber no limite da célula (${listados} de ${completo.total}). Todos continuam em serp_sources_json.`,
      competitors: completo.competitors.slice(0, listados),
    };
    texto = JSON.stringify(reduzido);
  }
  return texto;
}

/* ================= 4 · as proibições do Redator no CSV ================= */

/**
 * ===== A COBERTURA DE CADA PROIBIÇÃO NAS REGRAS DO CSV =====
 *
 * O Redator recebe `RADAR_WRITER_MAY_NOT` junto do dossiê; o CSV recebe
 * `RADAR_WRITING_RULES`. As duas listas nasceram em gates diferentes e dizem
 * quase a mesma coisa — "quase" é o problema: quem escreve fora da plataforma
 * não sabia que não pode reconfigurar o silo nem trocar as secundárias.
 *
 * A lista do Redator é importada, e não copiada: uma cópia envelheceria em
 * silêncio quando o Redator ganhasse uma proibição nova.
 *
 * Cada proibição conhecida tem os termos que uma regra do CSV precisa conter
 * para cobri-la, e a frase que entra quando nenhuma cobre. Proibição que este
 * mapa não conhece é tratada como NÃO coberta e entra com a redação do Redator:
 * repetir uma regra é barato, perder uma proibição não é.
 */
const COBERTURA: Record<string, { termos: RegExp[]; regra: string }> = {
  "trocar a keyword principal": {
    termos: [/keyword principal/, /(preservar|nao trocar|manter)/],
    regra: "não trocar a keyword principal — ela foi qualificada no Minerador e aprovada no Arquiteto;",
  },
  "reconfigurar o Silo": {
    termos: [/\bsilo\b/, /(nao reconfigurar|nao alterar|preservar|manter)/],
    regra: "não reconfigurar o Silo — a formação do silo, a ordem dos artigos e o papel deste artigo pertencem ao Arquiteto;",
  },
  "remover uma cobertura obrigatória": {
    termos: [/(must_cover|cobertura obrigatoria)/],
    regra: "não remover nenhuma cobertura obrigatória (MUST_COVER);",
  },
  "alterar a intenção declarada do artigo": {
    termos: [/intencao declarada/, /(preservar|nao alterar|manter)/],
    regra: "não alterar a intenção declarada do artigo;",
  },
  "alterar slug protegido": {
    termos: [/\bslug\b/, /(nao alterar|preservar|manter)/],
    regra: "não alterar slug protegido;",
  },
  "alterar canonical protegido": {
    termos: [/\bcanonical\b/, /(nao alterar|preservar|manter)/],
    regra: "não alterar canonical protegido;",
  },
  "substituir a composição de secundárias por decisão própria": {
    termos: [/secundarias/, /(composicao|nao substituir|preservar|manter)/],
    regra: "não substituir a composição de secundárias por decisão própria — a composição de keywords foi aprovada no Arquiteto;",
  },
};

const normalizarRegra = (texto: string) =>
  texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const proibicaoCoberta = (proibicao: string, regras: readonly string[]): boolean => {
  const cobertura = COBERTURA[proibicao];
  if (!cobertura) {
    /* Sem mapa: coberta só quando alguma regra já traz a frase do Redator. */
    const alvo = normalizarRegra(proibicao);
    return regras.some(regra => normalizarRegra(regra).includes(alvo));
  }
  return regras.some(regra => {
    const texto = normalizarRegra(regra);
    return cobertura.termos.every(termo => termo.test(texto));
  });
};

/**
 * As proibições do Redator que as regras informadas NÃO cobrem, na redação do
 * Redator. Vazio quando a paridade já existe.
 */
export function radarWriterProhibitionsMissingFromRules(
  rules: readonly string[] = RADAR_WRITING_RULES,
  prohibitions: readonly string[] = RADAR_WRITER_MAY_NOT,
): string[] {
  return prohibitions.filter(proibicao => !proibicaoCoberta(proibicao, rules));
}

/**
 * As regras que faltam, já na redação do CSV — prontas para acrescentar.
 *
 * Chamar de novo sobre a lista já completada devolve vazio: é isso que deixa o
 * integrador acrescentar sem duplicar.
 */
export function radarWriterParityRules(
  rules: readonly string[] = RADAR_WRITING_RULES,
  prohibitions: readonly string[] = RADAR_WRITER_MAY_NOT,
): string[] {
  return radarWriterProhibitionsMissingFromRules(rules, prohibitions)
    .map(proibicao => COBERTURA[proibicao]?.regra || `não ${proibicao};`);
}

/**
 * A LISTA DO CSV COM A PARIDADE APLICADA.
 *
 * As regras que faltam entram ANTES da última, que fecha a lista com ponto
 * final — a lista continua lendo como uma frase só.
 */
export function radarWritingRulesWithWriterParity(
  rules: readonly string[] = RADAR_WRITING_RULES,
  prohibitions: readonly string[] = RADAR_WRITER_MAY_NOT,
): string[] {
  const faltantes = radarWriterParityRules(rules, prohibitions);
  if (!faltantes.length) return [...rules];
  if (!rules.length) return faltantes;
  const ultima = rules[rules.length - 1];
  return ultima.trim().endsWith(".")
    ? [...rules.slice(0, -1), ...faltantes, ultima]
    : [...rules, ...faltantes];
}

/* ============================ as três colunas ============================ */

export type RadarPortableDossierGapsInput = {
  status: RadarPortableResearchStatusInput;
  /** `bundle.observed`. `null` fora do perfil GOOGLE. */
  observed: Pick<RadarCompetitiveObservedModel, "authorityEvidence" | "aiDiscovery" | "competitors" | "structure"> | null;
};

/**
 * As três colunas de uma vez, para a linha do export.
 *
 * O perfil sai do próprio dossiê, e não de um segundo parâmetro: duas fontes
 * para a mesma resposta seriam duas respostas.
 */
export function radarPortableDossierGapColumns(input: RadarPortableDossierGapsInput): Record<RadarPortableGapColumn, string> {
  const profile = input.status.bundle.primaryResearchProfile;
  return {
    research_status_md: radarPortableResearchStatusMarkdown(input.status),
    authority_requirements_md: radarPortableAuthorityRequirementsMarkdown({ profile, observed: input.observed }),
    competitors_structure_json: radarPortableCompetitorsStructureJson({ profile, observed: input.observed }),
  };
}
