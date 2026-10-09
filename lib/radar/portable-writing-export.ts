import { RADAR_WRITER_MAY_NOT_SUBJECT, radarWriterMayNotFor } from "../redator/writer-handoff.ts";
import { radarCompetitorTopics } from "./competitor-topics.ts";
import { WRITER_EVIDENCE_LIMITS } from "../redator/writer-evidence-catalog.ts";
import { RADAR_AMAZON_INTENT_LABELS, type RadarAmazonEditorialIntentType } from "./amazon-editorial-target.ts";
import { radarClaimNeedsFactualSupport } from "./claim-evidence.ts";
import { radarTextAdheresToCore, radarUbiquitousStems } from "./intent-adherence.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarOutOfScopeDistinctiveStems, radarOutOfScopeMatcher, radarSuggestionGuard, radarSuggestionRestatesKeyword, type RadarSuggestionVeto } from "./out-of-scope.ts";
/* 2026-10-09 · Defeito 2 · a base única da amostra (agente N): as páginas comparáveis do modelo, sem o teto de 20 da coluna JSON. */
import { radarSampleBasisFraction, radarSampleBasisLabel, radarSampleBasisOf, radarSampleBasisRewriteCount, radarSampleBasisSources, type RadarSampleBasis } from "./sample-basis.ts";
import { radarSubjectTurnTitle } from "./declared-subject.ts";
import { RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS } from "./competitive-blueprint.ts";
import { RADAR_EDITORIAL_OUTPUT_LABELS } from "./multimodal-blueprint.ts";
import { radarPortableSpecialistContext, radarPortableVideoContext, radarPortableVideoUsageLine, type RadarPortableVideoExtract } from "./portable-annex-context.ts";
import { radarPortableCompetitorsStructure, radarPortableWriterReadiness } from "./portable-dossier-gaps.ts";
import {
  radarPortableExternalSources,
  radarPortableInternalLinks,
  radarPortableKeywordsDna,
  radarPortableSerpEvidence,
  type RadarPortableKeywordDna,
  type RadarPortableSerpEvidence,
} from "./portable-evidence-pack.ts";
import { radarPortableActionableLimitations, type RadarPortableExportInput } from "./portable-export.ts";
import { radarPortableSeoMetadata, radarPortableVisualPlan } from "./portable-identity.ts";
import {
  radarPortableArticleDna,
  radarPortableEditorialOf,
  radarPortableFlatSections,
  type RadarPortableEditorial,
  type RadarPortableSection,
} from "./portable-read-model.ts";
import { radarPortableSerpLenses, radarPortableSerpObserved, type RadarPortableSerpLenses, type RadarPortableSerpObserved } from "./portable-serp-observed.ts";

import type { RadarAiDiscoveryContext } from "./ai-discovery-context.ts";
import type { RadarAuthorityEvidence } from "./authority-evidence.ts";
import type { RadarEditorialSubjectTurn } from "./editorial-article-model.ts";
import type { RadarSiloExportWritingContext } from "./portable-silo-export.ts";
import {
  radarArticleBlueprintColumns,
  radarArticleBlueprintMeasures,
  type RadarArticleBlueprintColumnsOptions,
  radarArticleBlueprintPublishedMapLine,
  radarArticleBlueprintPublishedMapReading,
  radarArticleBlueprintReading,
  radarArticleBlueprintVideoSections,
  radarArticleBlueprintWithCurrentNames,
  type RadarArticleBlueprintLiveVideo,
  type RadarArticleBlueprintPayload,
  type RadarArticleBlueprintPublishedMapReading,
} from "./article-blueprint.ts";
import {
  radarBrandVoiceAbsence,
  radarBrandVoiceBySlot,
  radarBrandVoiceDeliverableLabel,
  radarBrandVoiceDeliverableStatusLabel,
  radarBrandVoiceExclusionOf,
  radarBrandVoiceExclusionsLine,
  radarBrandVoiceText,
  type RadarBrandVoiceExclusion,
  type RadarBrandVoiceRef,
  type RadarBrandVoiceState,
} from "./brand-voice.ts";
import { radarClaimCommonStems, radarPendingClaims, type RadarSentenceSourceVerdict } from "./pending-claims.ts";
import { RADAR_SILO_ROLE_ASKS, radarSiloRoleText } from "./silo-role.ts";
/* 2026-10-08 · P0-B e P1 · a régua do ruído de pesquisa (agente B) e a do cabeçalho que não vira seção (artigo-modelo da SERP). */
import { radarMarketCitationIsNoise, radarReaderQuestionIsNoise, radarRegistrableDomain, type RadarResearchNoiseContext } from "./research-noise.ts";
import { radarEditorialHeadingNoiseReason, radarEditorialHeadingWithoutTemplate } from "./editorial-article-model.ts";
/* 2026-10-09b · as exclusões que os reajustes gravam no ArticleDNA (o "Não cobrir" e a planta lida). */
import { radarResearchContextScopeExclusions, type RadarResearchScopeExclusion } from "./article-research-context.ts";

/**
 * ===== O EXPORT "PARA ESCREVER" — o CSV que uma pessoa ou uma IA usa para escrever =====
 *
 * ==================== POR QUE ESTE ARQUIVO EXISTE ====================
 *
 * O dono do produto abriu o CSV real (três artigos, 61 a 63 colunas, ~180 mil
 * caracteres por artigo) e disse que ele não serve para escrever: "tem monte
 * de colunas inúteis". A medição confirmou: pares Markdown + JSON do mesmo
 * conteúdo, dois agregados que repetem 85% a 100% das outras colunas, a
 * evidência crua da SERP com 165 conceitos, telemetria de coleta.
 *
 * Este é o formato padrão do export: 13 colunas FIXAS, em Markdown curto, com
 * só o que é imprescindível para escrever. O formato de antes continua
 * disponível como "Completo (técnico)", sem nenhuma mudança
 * (`buildRadarPortableExportRow`), para auditoria.
 *
 * ==================== AS MESMAS FONTES, OUTRA PROJEÇÃO ====================
 *
 * Toda coluna nasce da MESMA entrada do formato completo
 * (`RadarPortableExportInput`: o pacote congelado, o dossiê, o modelo do
 * artigo), pelas MESMAS projeções de domínio. Nenhuma leitura nova de banco
 * e nenhuma conclusão recalculada (invariante 30): o export limpa a
 * apresentação — decodifica HTML, tira rastreio de URL, descarta conceito
 * isolado e fonte não classificada, traduz códigos — e, quando o pacote se
 * contradiz, DIZ a contradição em vez de escolher um lado.
 *
 * ==================== O QUE ELE NÃO DECIDE ====================
 *
 * Estrutura final, número de H2, contagem de palavras e ordem rígida são de
 * quem redige (invariantes 32 e 48: o Planejador saiu do pipeline em
 * 2026-09-18 e quem escreve também planeja): a estrutura sai como "ordem sugerida", e a
 * medida dos concorrentes sai rotulada como referência da SERP, nunca meta.
 * O export também não escreve texto: título, ALT e resposta de especialista
 * saem como foram gravados, ou são omitidos com o motivo dito uma vez.
 *
 * ==================== GUARDAS ====================
 *
 * Sem FAQ (AGENTS §13): perguntas vão dentro das seções, e a seção de FAQ que
 * o modelo ou a concorrência trouxer é omitida da estrutura. Dado de terceiros
 * é pesquisa: trecho de até 160 caracteres, rotulado, sem texto integral.
 * Nenhum UUID, hash, versão, id de keyword, `asin` como campo, data ISO de
 * coleta, nome de provider ou código interno.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== o contrato ============================== */

export const RADAR_WRITING_EXPORT_COLUMNS = [
  "ordem",
  "pode_escrever",
  "artigo",
  "promessa_e_leitor",
  "titulo_e_seo",
  "estrutura",
  "cobrir_e_superar",
  "serp_resumida",
  "fontes_e_especialista",
  "links_internos",
  "plano_visual",
  "produtos",
  "prompt",
] as const;

export type RadarWritingExportColumn = typeof RADAR_WRITING_EXPORT_COLUMNS[number];
export type RadarWritingExportRow = Record<RadarWritingExportColumn, string>;
export type RadarWritingVerdict = "Sim" | "Com ressalva" | "Não";

/**
 * ===== OS LIMITES =====
 *
 * O teto do ARTIGO é o dos fundamentos que o Redator da plataforma entrega à
 * IA (`WRITER_EVIDENCE_LIMITS.foundationsMaxBytes`, 24 kB): 20 mil caracteres
 * de pt-BR cabem nele. Cada célula fica muito abaixo dos 32.767 do Excel.
 *
 * Quando a linha passa do teto, corta-se primeiro a SERP resumida, depois o
 * "cobrir e superar", e o corte é declarado na própria célula. Ordem, veredito,
 * identidade, estrutura, links, produtos e prompt nunca são cortados.
 *
 * 2026-10-02 · TETOS NOVOS E A SERP POR ÚLTIMO. Com o artigo-modelo, a
 * estrutura passou de 8 mil (6 H2 com origem, evidências, links e imagem) e a
 * linha de 20 mil: a última seção saía cortada e a SERP resumida inteira virava
 * "[…] Cortado" — justo o índice que dá sentido aos ids S, P e C da estrutura.
 * O CSV é para escrever FORA da plataforma (o Redator tem os seus fundamentos,
 * com corte próprio); 14 mil na estrutura e 40 mil no artigo (32 → 40 mil com os temas dos concorrentes, 2026-10-02) seguem longe dos
 * 32.767 por célula do Excel. A ordem do corte passa a ser "cobrir e superar",
 * fontes, plano visual e, por último, a SERP, que nunca some inteira.
 *
 * 2026-10-09 · Defeito 1 · A ESTRUTURA NUNCA É CORTADA. Os CSVs de captar e de
 * promoções saíam com "[…] Célula cortada no limite de 14.000 caracteres." no
 * meio da planta (promoções perdia a lista "Afirmações que só entram com
 * fonte…"). O teto da estrutura passa ao limite SEGURO de uma célula de
 * planilha (32 mil, abaixo dos 32.767 do Excel) e, antes dele, a célula
 * encolhe por níveis que DIZEM o que encolheu (`radarWritingCompactStructure`);
 * o que ainda passar vai inteiro, por bloco, para a coluna de fontes, com
 * remissão — nunca um corte no meio. O artigo vai a 48 mil para a estrutura
 * inteira não empurrar o corte das outras colunas.
 *
 * 2026-10-09 (correção · contrato-F1) · 48 mil não bastava: com a continuação
 * na coluna de fontes, a estrutura de 31 mil mais as fontes de 11 mil já
 * passavam do teto, e o corte caía na cobrir_e_superar (o "Não cobrir"), na
 * SERP resumida e no plano visual. O artigo vai a 80 mil (o dobro do limite
 * seguro da estrutura, para a célula e a continuação, mais as outras colunas no
 * tamanho real); acima dele cedem só a SERP resumida, o plano visual e as
 * fontes sem continuação (`RADAR_WRITING_EXPORT_CUT_ORDER`), nessa ordem — a
 * cobrir_e_superar nunca.
 */
export const RADAR_WRITING_EXPORT_LIMITS = {
  cellChars: 6_000,
  structureChars: 32_000,
  /** 2026-10-02 · A SERP resumida ganhou os temas dos concorrentes (H2/H3 das páginas lidas): teto próprio. */
  serpChars: 10_000,
  articleChars: 80_000,
  /** O mínimo da célula cortável no primeiro passe: o começo da SERP (índice S/P/C) fica. */
  cutFloorChars: 1_500,
  foundationsBytes: WRITER_EVIDENCE_LIMITS.foundationsMaxBytes,
  thirdPartyExcerptChars: 160,
  titleChars: 90,
  organicResults: 8,
  questions: 10,
  terms: 15,
  moves: 6,
  /* 2026-10-08 (correção) · R10 · `specialistAnswerChars` saiu: a resposta aprovada do especialista vai inteira (P1 · fechamento). */
  verdictReasons: 4,
} as const;

/** 2026-10-02 · O teto de cada célula: a estrutura e a SERP têm o seu; as demais, o comum. */
export const radarWritingCellLimit = (coluna: RadarWritingExportColumn): number =>
  coluna === "estrutura" ? RADAR_WRITING_EXPORT_LIMITS.structureChars
    : coluna === "serp_resumida" ? RADAR_WRITING_EXPORT_LIMITS.serpChars
      : RADAR_WRITING_EXPORT_LIMITS.cellChars;

/** A estimativa que a tela mostra antes do clique: o alvo típico, não o teto. */
export const RADAR_WRITING_EXPORT_TYPICAL_CHARS_PER_ARTICLE = 10_000;

export type RadarWritingPublication = {
  published: boolean;
  publishedUrl: string | null;
  canonical: string | null;
  slug: string | null;
  /** `ArticleDNA.primaryKeywordPolicy`. `null` quando o DNA não a declara. */
  principalPolicy: string | null;
  /**
   * A estrutura da página publicada (H1, H2 e data da última atualização).
   * Nenhum pacote a traz hoje: sem ela, o veredito diz que a atualização
   * precisa preservar o que existe, em vez de reescrever às cegas.
   */
  currentStructure?: { h1: string | null; h2: string[]; updatedAt: string | null } | null;
};

export type RadarWritingArticleContext = {
  /** O rótulo da linha de topo: "Silo" no export por silo, "Marca" nos dossiês avulsos. */
  topRowLabel: "Silo" | "Marca";
  /** Posição do artigo no arquivo (1…n), usada quando não há silo. */
  filePosition: number;
  /** O silo do arquivo. `null` nos dossiês avulsos. */
  silo: RadarSiloExportWritingContext | null;
  /** Endereço interno, só para achar o artigo entre os membros do silo. Nunca sai. */
  articleId: string | null;
  publication: RadarWritingPublication | null;
  /**
   * 2026-10-02 · Aditivo: o Silo vai NA LINHA do artigo. É o export dos
   * selecionados quando a seleção cruza mais de um Silo e a linha de topo não
   * pode carregar todos. Sem ele, nada muda.
   */
  siloInline?: boolean;
  /**
   * 2026-10-02 · Aditivo: o artigo-modelo APROVADO (SDD diretriz, Adendo A).
   * Com ele, título e SEO, promessa, estrutura, links e plano visual saem dele.
   * 2026-10-09 · OBRIGATÓRIO na linha (regra do dono): sem ele (ou só com a
   * proposta em rascunho), `buildRadarWritingExportArticle` levanta
   * `RadarWritingNeedsArticleBlueprintError` — só a investigação de vídeo como
   * perfil primário passa sem ele, com a linha só de identidade.
   */
  blueprint?: RadarArticleBlueprintPayload | null;
  /** 2026-10-02 · Aditivo: a Skill de voz ATIVA da Marca, que a linha "Voz da marca" carrega (Adendo C). */
  brandVoice?: RadarBrandVoiceRef | null;
  /**
   * 2026-10-08 · P1 · Aditivo: a publicação de cada membro do Silo, por
   * `articleId` (do ArticleDNA que o lote já leu), mesmo dos que não estão no
   * arquivo: o link para um irmão publicado sai com a URL dele. Sem o mapa, o
   * destino diz o que dizia.
   */
  siloPublications?: ReadonlyMap<string, RadarWritingPublication> | null;
  /**
   * 2026-10-09 · Defeito 5 · Aditivo: as exclusões que a Skill de voz declara
   * (`radarBrandVoiceExclusions`, a régua única da voz). Valem como exclusão
   * dura em "Como superar", temas, perguntas e "Não cobrir". Sem elas, nada muda.
   */
  brandVoiceExclusions?: readonly RadarBrandVoiceExclusion[] | null;
  /**
   * 2026-10-09 (correção · contrato-F2) · Aditivo: as keywords (principal,
   * complementares e reforços do ArticleDNA vigente) de cada membro do Silo que
   * está no lote, por articleId. O tópico de "Tópicos incluídos" que é keyword
   * de um artigo do Silo pertence a ESSE artigo ("como conseguir mais clientes"
   * é de "como atrair um cliente"). Sem o mapa, o dono é só a principal do membro.
   */
  siloMemberKeywords?: ReadonlyMap<string, readonly string[]> | null;
};

export type RadarWritingExportArticle = {
  row: RadarWritingExportRow;
  verdict: RadarWritingVerdict;
  /** Como o artigo é chamado na linha de topo: a keyword principal, nunca o id. */
  label: string;
  firstReason: string | null;
  healthTopic: boolean;
  published: boolean;
  /**
   * 2026-10-02 · Aditivo: o nome da unidade quando ela NÃO é artigo ("landing
   * page", "página de serviço"…), para a linha de topo falar de "artigos e
   * páginas". Ausente no artigo: o objeto sai byte a byte como antes.
   */
  unitNoun?: string;
};

/*
 * ===== 2026-10-09 · O ARTIGO-MODELO É O FUNDAMENTO ÚNICO DO CSV "PARA ESCREVER" =====
 *
 * Regra do dono (2026-10-09): "tudo que é de processos antigos tem que ser
 * substituído pelos novos processos dos pilotos que já foram aprimorados e
 * testados". O CSV sem artigo-modelo saía com estrutura, título, promessa,
 * plano visual e links montados pelo modelo editorial (e o "Como superar" pelo
 * blueprint competitivo) — o processo antigo como caminho alternativo. Agora:
 *
 *   - a planta CONCLUÍDA (APPROVED, a de `radarArticleBlueprintPick`: hash exato
 *     ou a última do mesmo congelamento e do mesmo ArticleDNA) é obrigatória;
 *   - sem ela, nada é montado: o lote devolve o estado explícito
 *     `{ status: "needs_article_blueprint", articleIds }`
 *     (`radarWritingExportBlueprintGate`), que a rota transforma em 409 com a
 *     lista, e a tela organiza em série (custo dito no botão) e exporta;
 *   - quem chama a linha sem a planta recebe `RadarWritingNeedsArticleBlueprintError`
 *     (409, o mesmo estado), nunca uma linha pelo legado.
 * O legado (modelo editorial e competitivo) continua só como matéria-prima do
 * GERADOR do artigo-modelo (o esqueleto da SERP, `buildRadarArticleBlueprintBrief`).
 *
 * A investigação de vídeo do YouTube como perfil primário (legada, sem Google)
 * não escreve artigo: a linha dela é o bloqueio só com a identidade, como antes,
 * e não pede planta.
 */
export const RADAR_WRITING_NEEDS_ARTICLE_BLUEPRINT = "needs_article_blueprint" as const;

export type RadarWritingNeedsArticleBlueprint = { status: typeof RADAR_WRITING_NEEDS_ARTICLE_BLUEPRINT; articleIds: string[] };

/** A planta que vale para o entregável: a concluída (a proposta em rascunho não conta). */
export const radarWritingBlueprintIsApproved = (planta: RadarArticleBlueprintPayload | null | undefined): planta is RadarArticleBlueprintPayload =>
  Boolean(planta && typeof planta === "object" && planta.blueprint && planta.approval !== "DRAFT");

/**
 * A linha pede planta? Só a investigação de vídeo como perfil primário não pede (ela não escreve artigo).
 * 2026-10-09 (correção) · exportada: a exigência da rota e do MCP no modo "writing" usa esta mesma
 * regra (`radarPortableExportMissingBlueprints` com `mode`), para haver UM portão só.
 */
export const radarWritingRowNeedsBlueprint = (perfil: string | null | undefined): boolean => perfil !== "YOUTUBE";
const pedePlanta = radarWritingRowNeedsBlueprint;

/**
 * 2026-10-09 · O PORTÃO DO LOTE: todos com a planta concluída, ou a lista do que
 * falta (sem repetição, na ordem do lote). Pura: a rota, o MCP e a ponte do lote
 * chamam ANTES de montar qualquer linha.
 */
export function radarWritingExportBlueprintGate(
  articles: ReadonlyArray<{ articleId: string; blueprint?: RadarArticleBlueprintPayload | null; entrada?: { profile?: string | null } | null }>,
): { status: "ready" } | RadarWritingNeedsArticleBlueprint {
  const faltam = [...new Set(articles
    .filter(item => pedePlanta(item.entrada?.profile) && !radarWritingBlueprintIsApproved(item.blueprint))
    .map(item => item.articleId))];
  return faltam.length ? { status: RADAR_WRITING_NEEDS_ARTICLE_BLUEPRINT, articleIds: faltam } : { status: "ready" };
}

/**
 * 2026-10-09 · A LINHA SEM PLANTA NÃO É MONTADA. `status` 409 e o mesmo estado
 * do portão: a rota que não chamou o portão ainda devolve o erro claro
 * (`authzErrorResponse` lê o `status`), nunca um CSV pelo legado.
 */
export class RadarWritingNeedsArticleBlueprintError extends Error {
  readonly status = 409;
  readonly code = RADAR_WRITING_NEEDS_ARTICLE_BLUEPRINT;
  readonly articleIds: string[];

  constructor(articleIds: readonly string[]) {
    super(`${articleIds.length === 1 ? "Este artigo ainda não tem" : `${articleIds.length} artigos ainda não têm`} o artigo-modelo da SERP concluído: organize o artigo-modelo no Radar (Pesquisa → Artigo-modelo da SERP) e exporte de novo. O CSV "Para escrever" sai só pela planta.`);
    this.name = "RadarWritingNeedsArticleBlueprintError";
    this.articleIds = [...articleIds];
  }

  /** O estado explícito, na forma do contrato comum. */
  get state(): RadarWritingNeedsArticleBlueprint {
    return { status: RADAR_WRITING_NEEDS_ARTICLE_BLUEPRINT, articleIds: [...this.articleIds] };
  }
}

/* ============================== a limpeza ============================== */

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·",
  deg: "°", ordm: "º", ordf: "ª", reg: "®", copy: "©", trade: "™",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ",
};
const DIACRITICOS: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈" };
for (const base of "aeiouAEIOU") {
  for (const [nome, marca] of Object.entries(DIACRITICOS)) ENTIDADES[`${base}${nome}`] = `${base}${marca}`.normalize("NFC");
}

/** Entidades HTML viram texto: "&Eacute;" é "É", "&#8211;" é "–". Duas passadas pegam o duplo escape. */
export function radarWritingDecodeEntities(valor: string): string {
  let texto = valor;
  for (let passada = 0; passada < 2; passada += 1) {
    const proximo = texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, corpo: string) => {
      if (corpo.startsWith("#")) {
        const numero = corpo[1] === "x" || corpo[1] === "X" ? Number.parseInt(corpo.slice(2), 16) : Number.parseInt(corpo.slice(1), 10);
        return Number.isFinite(numero) && numero > 0 && numero < 0x110000 ? String.fromCodePoint(numero) : inteiro;
      }
      return ENTIDADES[corpo] ?? ENTIDADES[corpo.toLowerCase()] ?? inteiro;
    });
    if (proximo === texto) break;
    texto = proximo;
  }
  return texto;
}

const RASTREIO = /^(utm_[a-z0-9_]*|srsltid|pp|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga)$/i;

/**
 * A URL LIMPA: sem `srsltid`, `utm_*`, `pp` e parâmetros de clique.
 *
 * Endereço da Amazon perde a consulta inteira — é nela que moram `tag` e
 * `ref`, e a tag de afiliado é da etapa de publicação. O caminho nunca é
 * tocado: o endereço de um concorrente pode ter um UUID legítimo.
 */
export function radarWritingCleanUrl(valor: string): string {
  const cru = radarWritingDecodeEntities(valor.trim());
  try {
    const url = new URL(cru);
    if (/(^|\.)amazon\.[a-z.]+$/i.test(url.hostname)) {
      url.search = "";
      url.hash = "";
      return url.toString();
    }
    for (const chave of [...url.searchParams.keys()]) if (RASTREIO.test(chave)) url.searchParams.delete(chave);
    if (url.hash.startsWith("#:~:")) url.hash = "";
    return url.toString().replace(/\?$/, "");
  } catch {
    return cru.replace(/[?&](utm_[a-z0-9_]*|srsltid|pp|gclid|fbclid)=[^&#\s]*/gi, "").replace(/\?&/, "?").replace(/\?$/, "");
  }
}

/* O endereço interno nunca é texto de escrita. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HASH = /\bsha256:[0-9a-f]*/gi;
const ENDERECO_INTERNO = /\b(?:page|concept|question|section|need|claim|answer|specialist|research|serp|bundle|organic|paa|related|knowledge_graph|ytq|amzq|competitor|response|run|snapshot|article|territory|node):[A-Za-z0-9](?:[A-Za-z0-9:_.-]*[A-Za-z0-9])?/g;
const ROTULO_DE_VERSAO = /\bID\s*·\s*v\d+\b/g;
const INSTANTE_ISO = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;

/*
 * 2026-10-09 · os rótulos dos códigos são montados na PRIMEIRA chamada, não no
 * carregamento: o ciclo de importação multimodal-blueprint → youtube-blueprint
 * → este módulo deixava `RADAR_EDITORIAL_OUTPUT_LABELS` ainda não inicializado
 * quando este módulo carregava primeiro pelo outro lado.
 */
let codigosMontados: Record<string, string> | null = null;
const CODIGOS = (): Record<string, string> => (codigosMontados ??= {
  PILLAR_TO_SUPPORT: "Pilar → Suporte",
  SUPPORT_TO_PILLAR: "Suporte → Pilar",
  SUPPORT_TO_SUPPORT: "Suporte → Suporte",
  ARTICLE_TO_SILO_PAGE: "Artigo → SiloPage",
  SILO_PAGE_TO_ARTICLE: "SiloPage → Artigo",
  INFORMATIONAL: "Informacional",
  COMMERCIAL: "Comercial",
  TRANSACTIONAL: "Transacional",
  NAVIGATIONAL: "Navegacional",
  COMMERCIAL_INVESTIGATION: "Investigação comercial",
  ...RADAR_AMAZON_INTENT_LABELS,
  ...RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS,
  ...RADAR_EDITORIAL_OUTPUT_LABELS,
});
let codigoNoTextoMontado: RegExp | null = null;
const CODIGO_NO_TEXTO = (): RegExp => (codigoNoTextoMontado ??= new RegExp(`\\b(${Object.keys(CODIGOS()).sort((a, b) => b.length - a.length).join("|")})\\b`, "g"));

/** Um trecho de TEXTO (fora de URL): entidades decodificadas, endereço interno fora, código traduzido. */
function textoLimpo(valor: string): string {
  return radarWritingDecodeEntities(valor)
    .replace(HASH, "")
    .replace(UUID, "")
    .replace(ENDERECO_INTERNO, "")
    .replace(ROTULO_DE_VERSAO, "")
    .replace(INSTANTE_ISO, "")
    .replace(CODIGO_NO_TEXTO(), codigo => CODIGOS()[codigo] || codigo)
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    /* O que sobrou da remoção: " , , " vira ", ". */
    .replace(/[ \t]+([,;])/g, "$1")
    .replace(/([,;])(?:[ \t]*[,;])+/g, "$1");
}

const URL_NO_TEXTO = /https?:\/\/[^\s"'<>]+/g;

/**
 * A HIGIENE DA CÉLULA: texto limpo, URL limpa — cada um pela sua regra.
 *
 * O UUID sai do texto (é nosso) e fica na URL (é do concorrente). Separar os
 * dois é o que impede a limpeza de quebrar um endereço de terceiro.
 */
function higiene(celula: string): string {
  let saida = "";
  let ultimo = 0;
  for (const achado of celula.matchAll(URL_NO_TEXTO)) {
    const inicio = achado.index ?? 0;
    saida += textoLimpo(celula.slice(ultimo, inicio));
    let url = achado[0];
    const pontuacao = url.match(/[.,;:!?)\]]+$/)?.[0] || "";
    if (pontuacao) url = url.slice(0, -pontuacao.length);
    saida += radarWritingCleanUrl(url) + pontuacao;
    ultimo = inicio + achado[0].length;
  }
  saida += textoLimpo(celula.slice(ultimo));
  return saida.split("\n").map(linha => linha.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * ===== A CÉLULA QUE O EXCEL NÃO LÊ COMO FÓRMULA =====
 *
 * O Excel interpreta como fórmula a célula que começa com "=", "+", "-" ou
 * "@", mesmo entre aspas — e uma lista Markdown começa com "- ". As células
 * deste formato começam por um rótulo; se alguma escapar, o apóstrofo
 * neutraliza a fórmula.
 */
export function radarWritingSpreadsheetSafe(celula: string): string {
  return /^[=+\-@\t\r]/.test(celula) ? `'${celula}` : celula;
}

/* ============================== utilidades ============================== */

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/** A chave de comparação: sem acento, sem caixa, sem pontuação, sem entidade HTML. */
export function radarWritingCompareKey(valor: string | null | undefined): string {
  return radarWritingDecodeEntities(valor || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const unicosPorChave = <T>(itens: readonly T[], chaveDe: (item: T) => string): T[] => {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const item of itens) {
    const chave = chaveDe(item);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(item);
  }
  return saida;
};

const cortar = (valor: string, limite: number): string => {
  const limpo = radarWritingDecodeEntities(valor).replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
};

const numeroBr = (valor: number): string => new Intl.NumberFormat("pt-BR").format(valor);

/** "COMO É A PELE OLEOSA?" vira "Como é a pele oleosa?": caixa alta de cabeçalho não é ênfase de quem escreve. */
const semCaixaAlta = (valor: string): string => {
  const letras = valor.replace(/[^\p{L}]/gu, "");
  if (letras.length < 4 || letras !== letras.toUpperCase()) return valor;
  const baixa = valor.toLocaleLowerCase("pt-BR");
  return baixa.charAt(0).toLocaleUpperCase("pt-BR") + baixa.slice(1);
};

/** dd/mm/aaaa, em UTC. Instante inválido não vira data. */
export function radarWritingDate(valor: string | null | undefined): string | null {
  if (!valor || Number.isNaN(Date.parse(valor))) return null;
  const data = new Date(valor);
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}/${data.getUTCFullYear()}`;
}

const semPontoFinal = (valor: string): string => valor.trim().replace(/[.;:\s]+$/, "");
const comPontoFinal = (valor: string): string => {
  const corpo = valor.trim();
  return !corpo || /[.!?…:]$/.test(corpo) ? corpo : `${corpo}.`;
};
const entreAspas = (valor: string) => `"${semPontoFinal(valor).replace(/^["“]|["”]$/g, "")}"`;

const origemDe = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/* O que o pacote escreve quando o campo não foi preenchido. Isso não é conteúdo. */
const PREENCHIMENTO = [
  /^pendente\b/i,
  /pendente de enriquecimento/i,
  /n[aã]o definid[oa] nesta fase/i,
  /ainda n[aã]o definid/i,
  /^cobrir com clareza o tema/i,
  /^reunir o que o artigo precisa dizer/i,
  /^cobrir um ponto que o leitor procura/i,
  /^dar ao leitor o fundamento/i,
  /^transformar o fundamento em aplica/i,
  /^explicar a causa por tr[aá]s do que o leitor observa/i,
  /^representar visualmente a promessa/i,
];
const ehPreenchimento = (valor: string | null | undefined): boolean => {
  const limpo = texto(valor);
  return !limpo || PREENCHIMENTO.some(padrao => padrao.test(limpo)) || /cobrir com clareza o tema/i.test(limpo);
};
const util = (valor: string | null | undefined): string | null => (ehPreenchimento(valor) ? null : texto(valor));

/** "Cobrir com clareza o tema “X”." é a moldura da promessa padrão: o que importa é o X. */
const semMolduraDoTema = (valor: string | null | undefined): string | null => {
  const limpo = texto(valor);
  const dentro = limpo.match(/cobrir com clareza o tema\s*[“"]([^”"]+)[”"]/i);
  return dentro ? dentro[1].trim() : limpo || null;
};

const EH_FAQ = /\b(faq|perguntas frequentes|d[uú]vidas frequentes)\b/i;

/** 2026-10-02 · Palavras funcionais que o radical não remove: não contam como raiz do tema. */
export const RADAR_WRITING_FUNCTION_WORDS: ReadonlySet<string> = new Set(["pelo", "pela", "pelos", "pelas", "para", "como", "com", "sem", "sobre", "que", "dos", "das", "nos", "nas", "uma", "uns", "umas", "seu", "sua", "seus", "suas", "mais"]);

const VAZIAS = new Set([
  "a", "as", "o", "os", "um", "uma", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
  "e", "ou", "que", "se", "com", "para", "por", "ao", "aos", "sobre", "seu", "sua", "este", "esta",
  "isso", "como", "qual", "quais", "quando", "onde", "porque", "voce", "voces", "nosso", "nossos", "nossa",
  "aqui", "mais", "muito", "ser", "ter", "fazer", "pode", "sao", "e", "ja",
]);

export const radarWritingContentWords = (valor: string | null | undefined): Set<string> => new Set(
  radarWritingCompareKey(valor).split(" ").filter(palavra => palavra.length > 2 && !VAZIAS.has(palavra)),
);

/* ============================== os rótulos ============================== */

/* 2026-10-08 · o rótulo e o que o papel pede vêm da régua única do Papel no Silo (`silo-role.ts`). */
const papelLegivel = (valor: string | null | undefined): string | null => radarSiloRoleText(valor);

const O_QUE_O_PAPEL_PEDE: Readonly<Record<string, string>> = RADAR_SILO_ROLE_ASKS;

/* Papel que o plano por Silo dá ao membro: "sem silo" e "fora da composição" não são papel. */
const papelDoMembro = (membro: { role: string } | null): string | null => {
  if (!membro || membro.role === "sem silo" || membro.role === "fora da composição do SiloDNA") return null;
  return papelLegivel(membro.role);
};

const INTENCAO: Record<string, string> = {
  informational: "Informacional", informacional: "Informacional", informativa: "Informacional",
  commercial: "Comercial", comercial: "Comercial",
  transactional: "Transacional", transacional: "Transacional",
  navigational: "Navegacional", navegacional: "Navegacional",
  commercial_investigation: "Investigação comercial",
};
const intencaoLegivel = (valor: string | null | undefined): string | null => {
  const chave = radarWritingCompareKey(valor).replace(/ /g, "_");
  if (!chave || chave === "unknown" || chave === "desconhecida") return null;
  return INTENCAO[chave] || texto(valor);
};

const OMITIR = new Set(["medium", "unknown", "desconhecido", "desconhecida", "nao informado", "nao declarado"]);
const legivelOuNulo = (valor: string | null | undefined): string | null => {
  const limpo = texto(valor);
  return !limpo || OMITIR.has(radarWritingCompareKey(limpo)) ? null : limpo;
};

/* ============================== o formato ============================== */

/**
 * ===== O TIPO DA UNIDADE (pedido do dono, 2026-10-02) =====
 *
 * "Todas essas melhorias, regras e diretrizes têm que ser aplicáveis para
 * qualquer tipo de artigo ou landing page." O CSV falava sempre de "o artigo":
 * numa landing page ou numa página de serviço, "escreva o artigo descrito" e
 * "com a data de atualização visível" mandam fazer outra coisa.
 *
 * O tipo vem do ArticleDNA (`unitClassification.type`, lido pelo núcleo em
 * `input.article.contentType`). Sem tipo, ou "article", a unidade é o artigo e
 * toda frase sai byte a byte como antes. `editorial` diz se a data de
 * atualização visível faz parte da entrega (artigo e review: sim; página de
 * serviço, landing page e categoria: não).
 */
export type RadarWritingUnit = {
  kind: "article" | "review" | "landing_page" | "service_page" | "category_page" | "page";
  /** "artigo", "landing page", "página de serviço"… — sempre em minúscula. */
  noun: string;
  feminine: boolean;
  editorial: boolean;
};

const ARTIGO_COMO_UNIDADE: RadarWritingUnit = { kind: "article", noun: "artigo", feminine: false, editorial: true };

export function radarWritingUnitOf(input: Pick<RadarPortableExportInput, "article">): RadarWritingUnit {
  const tipo = radarWritingCompareKey(input.article.contentType).replace(/ /g, "_");
  if (!tipo || tipo === "article" || tipo === "artigo") return ARTIGO_COMO_UNIDADE;
  if (tipo === "landing_page") return { kind: "landing_page", noun: "landing page", feminine: true, editorial: false };
  if (tipo === "service_page" || tipo === "pagina_de_servico") return { kind: "service_page", noun: "página de serviço", feminine: true, editorial: false };
  if (tipo === "category_page" || tipo === "pagina_de_categoria") return { kind: "category_page", noun: "página de categoria", feminine: true, editorial: false };
  if (/review|resenha/.test(tipo)) return { kind: "review", noun: "review", feminine: false, editorial: true };
  return { kind: "page", noun: "página", feminine: true, editorial: false };
}

/* As formas que a frase pede: "o artigo" / "a landing page", "este" / "esta", "descrito" / "descrita". */
const daUnidade = (unidade: RadarWritingUnit) => ({
  o: unidade.feminine ? "a" : "o",
  do: unidade.feminine ? "da" : "do",
  este: unidade.feminine ? "esta" : "este",
  deste: unidade.feminine ? "desta" : "deste",
  neste: unidade.feminine ? "Nesta" : "Neste",
  terminacao: unidade.feminine ? "a" : "o",
  Nome: unidade.noun.charAt(0).toUpperCase() + unidade.noun.slice(1),
});

function formatoLegivel(input: RadarPortableExportInput, editorial: RadarPortableEditorial): string | null {
  const setup = input.commercial?.setup ?? input.amazon?.setup ?? null;
  if (input.profile === "AMAZON") {
    const tipo = (setup?.intent.type || editorial.editorialOutput || null) as RadarAmazonEditorialIntentType | null;
    const rotulo = tipo ? RADAR_AMAZON_INTENT_LABELS[tipo] || texto(tipo) : "Artigo comercial";
    const quantidade = setup?.intent.desiredCount;
    return quantidade ? `${rotulo} · lista comparativa de ${quantidade} produtos` : rotulo;
  }
  if (input.profile === "YOUTUBE") {
    return `Roteiro de vídeo${editorial.editorialOutput ? ` (${editorial.editorialOutput})` : ""}`;
  }
  const saida = editorial.editorialOutput ? CODIGOS()[editorial.editorialOutput] || editorial.editorialOutput : null;
  /* 2026-10-02 · página que não é artigo diz o que é; o artigo continua "Artigo editorial". */
  const unidade = radarWritingUnitOf(input);
  if (unidade.kind !== "article") return `${daUnidade(unidade).Nome}${saida ? ` · ${saida}` : ""}`;
  return saida || "Artigo editorial";
}

/* ============================== as projeções ============================== */

/**
 * AS MESMAS PROJEÇÕES DO FORMATO COMPLETO, NA MESMA ORDEM.
 *
 * `buildRadarPortableExportRow` monta cada uma destas a partir da mesma
 * entrada. Aqui elas são montadas de novo, e não relidas de colunas: reler o
 * Markdown do formato completo seria projetar uma projeção.
 */
export function radarWritingProjections(input: RadarPortableExportInput) {
  const blueprint = input.blueprintView.blueprint;
  const editorial = radarPortableEditorialOf({
    profile: input.profile,
    principalKeyword: input.article.principalKeyword,
    articleModel: input.articleModel,
    profileModel: input.profileModel,
  });
  const dna = radarPortableArticleDna({
    principalKeyword: input.article.principalKeyword,
    secondaryKeywords: input.article.secondaryKeywords,
    narrativeReinforcements: input.article.narrativeReinforcements,
    intent: input.article.intent,
    funnel: input.article.funnel,
    silo: input.article.siloName,
    siloRole: input.article.articleRole,
    mustCover: input.article.mustCover,
    slug: input.article.slug,
    publishedProtected: Boolean(input.article.publishedProtected),
    internalLinkRequirements: input.internalLinks || [],
  });
  const observado = input.googleObserved ?? null;
  const serp = radarPortableSerpEvidence({ observed: observado, blueprint, articleModel: input.articleModel ?? null });
  const fontesExternas = radarPortableExternalSources(observado);
  const linksDoPlano = radarPortableInternalLinks({ observed: observado, blueprint });
  const keywords = radarPortableKeywordsDna(input.researchContext ?? null);
  const seo = radarPortableSeoMetadata({
    editorial, dna, blueprint,
    slug: input.article.slug,
    canonical: input.article.canonical ?? null,
    protectedFields: input.article.protectedFields || [],
  });
  const visual = radarPortableVisualPlan({
    editorial, blueprint,
    principalKeyword: input.article.principalKeyword,
    articleTitle: editorial.title,
    promise: input.article.promise ?? editorial.readerPromise,
    hasVideoBlueprint: input.profile === "YOUTUBE",
  });
  const video = input.videoContext ?? radarPortableVideoContext(null);
  const especialista = input.specialistContext ?? radarPortableSpecialistContext(null);
  const serpObservada: RadarPortableSerpObserved | null = input.serpObserved ? radarPortableSerpObserved(input.serpObserved) : null;
  const lentes: RadarPortableSerpLenses | null = input.serpLenses ? radarPortableSerpLenses(input.serpLenses) : null;
  const concorrentes = input.dossierGaps
    ? radarPortableCompetitorsStructure({ profile: input.profile, observed: input.dossierGaps.observed })
    : null;
  const autoridade: RadarAuthorityEvidence | null = input.dossierGaps?.observed?.authorityEvidence ?? observado?.authorityEvidence ?? null;
  const descoberta: RadarAiDiscoveryContext | null = input.dossierGaps?.observed?.aiDiscovery ?? observado?.aiDiscovery ?? null;
  const prontidao = input.dossierGaps ? radarPortableWriterReadiness(input.dossierGaps.status) : null;
  const limitacoes = radarPortableActionableLimitations([
    ...(input.researchLimitations || []),
    ...(blueprint?.limitations || []),
    ...editorial.limitations,
  ]);
  const secoes = radarPortableFlatSections(editorial.sections);
  const assunto = assuntoDe(input, editorial);
  return {
    blueprint, editorial, dna, serp, fontesExternas, linksDoPlano, keywords, seo, visual,
    video, especialista, serpObservada, lentes, concorrentes, autoridade, descoberta, prontidao, limitacoes,
    secoes,
    assunto,
    /* 2026-10-02 · o tipo da unidade (artigo, landing page, página de serviço…), para as frases que dependem dele. */
    unidade: radarWritingUnitOf(input),
    /*
     * 2026-10-08 (correção) · o perfil da pesquisa: as réguas de cabeçalho de
     * CONCORRENTE só valem para a estrutura que veio da SERP do Google. Os blocos
     * do Amazon ("Conclusão", "Comparação resumida") são da própria plataforma.
     */
    perfil: input.profile,
    /* 2026-10-08 · P1 · o contexto da régua do ruído de pesquisa: núcleo, temas, leitor e os sites concorrentes lidos. */
    ruido: contextoDoRuido(input, dna, secoes, assunto, observado, concorrentes),
    /*
     * 2026-10-09 · Defeito 2 · UMA BASE SÓ: as comparáveis do modelo, sem o teto
     * de 20 da coluna JSON (`sample-basis.ts`). A lista impressa, os temas, o
     * "Diferencial possível", os "N de M" de "Como superar" e os rótulos das
     * evidências do artigo-modelo falam dela. `null` sem página comparável no
     * modelo (transporte compacto): os números do modelo, como antes.
     */
    base: radarSampleBasisOf(observado) as RadarSampleBasis | null,
    /* As URLs de cada medida; lista vazia não reconta nada ("0 de M" sairia de um rótulo sem fonte registrada): vale como sem fonte. */
    fontesDaBase: semFonteVazia(radarSampleBasisSources(observado)),
    /*
     * 2026-10-09 · Defeitos 3(c) e 5 · O QUE UMA SUGESTÃO NÃO PODE SUGERIR,
     * preenchido pela linha (`buildRadarWritingExportArticle`) depois de montar
     * o "Não cobrir": temas, "Diferencial possível" e "Como superar" leem daqui.
     * Fora da linha (o pedido do artigo-modelo), `null`: nada muda.
     */
    vetoDeSugestao: null as ((sugestao: string | null | undefined) => RadarSuggestionVeto | null) | null,
  };
}

/* 2026-10-09 · Defeito 2 · o leitor das fontes da base, sem a lista vazia (sem URL, a contagem não é recontável). */
const semFonteVazia = (fontes: ReturnType<typeof radarSampleBasisSources>): ReturnType<typeof radarSampleBasisSources> =>
  (rotulo, tipo) => {
    const urls = fontes(rotulo, tipo);
    return urls && urls.length ? urls : null;
  };

/*
 * ===== 2026-10-08 · P1 · O CONTEXTO DO RUÍDO DE PESQUISA =====
 *
 * As réguas de `research-noise.ts` recebem o artigo por parâmetro: o núcleo
 * (principal, complementares, Assunto e a cobertura que o ArticleDNA exige),
 * os temas (os cabeçalhos e perguntas da estrutura), o leitor declarado e os
 * domínios dos concorrentes lidos — sem o site da própria marca, que não é
 * "produto de terceiro" nem "site do concorrente".
 */
function contextoDoRuido(
  input: RadarPortableExportInput,
  dna: ReturnType<typeof radarPortableArticleDna>,
  secoes: readonly RadarPortableSection[],
  assunto: AssuntoDeEscrita | null,
  observado: RadarPortableExportInput["googleObserved"] | null,
  concorrentes: ReturnType<typeof radarPortableCompetitorsStructure> | null,
): RadarResearchNoiseContext {
  const proprios = new Set([input.article.canonical, input.researchContext?.silo?.siloPageCanonical]
    .map(valor => (valor ? radarRegistrableDomain(valor) : "")).filter(Boolean));
  const dominios = [...(observado?.competitors || []).map(item => item.domain), ...(concorrentes?.competitors || []).map(item => item.domain)]
    .filter((valor): valor is string => Boolean(valor) && !proprios.has(radarRegistrableDomain(valor)));
  return {
    core: [dna.principalKeyword, ...dna.secondaryKeywords, ...dna.narrativeReinforcements, assunto?.phrase, ...dna.mustCover],
    topics: [...secoes.flatMap(secao => [secao.heading, secao.readerQuestion]), ...dna.mustCover],
    audience: input.article.audience ?? null,
    competitorDomains: [...new Set(dominios)],
  };
}

/**
 * ===== O ASSUNTO DECLARADO — SDD do Assunto, F4.3 (P9) =====
 *
 * O tronco vem do ArticleDNA pelo contexto de pesquisa, e a virada (seção,
 * posição e complemento do H1) vem do artigo-modelo do Radar, como veio. O
 * export não recalcula nem decide nada: diz. Sem Assunto, `null`, e nenhuma
 * célula muda.
 */
type AssuntoDeEscrita = {
  phrase: string;
  note: string | null;
  destinationUrl: string | null;
  turn: RadarEditorialSubjectTurn | null;
};

function assuntoDe(input: RadarPortableExportInput, editorial: RadarPortableEditorial): AssuntoDeEscrita | null {
  const turn = editorial.subjectTurn ?? null;
  const doContexto = input.researchContext?.article.subject ?? null;
  const phrase = texto(turn?.phrase) || texto(doContexto?.phrase);
  if (!phrase) return null;
  return {
    phrase,
    note: texto(turn ? turn.note : doContexto?.note) || null,
    destinationUrl: texto(turn ? turn.destinationUrl : doContexto?.destinationUrl) || null,
    turn,
  };
}

export type RadarWritingProjections = ReturnType<typeof radarWritingProjections>;
type Projecoes = RadarWritingProjections;

/* ============================== o silo e os links ============================== */

type Membro = RadarSiloExportWritingContext["members"][number];

const rotuloDoMembro = (membro: Pick<Membro, "principalKeyword" | "title" | "slug">): string =>
  texto(membro.principalKeyword) || semMolduraDoTema(membro.title) || texto(membro.slug) || "artigo sem título conhecido";

/*
 * 2026-10-08 (correção) · F1 · Os irmãos do Silo que estão no ar, para o
 * artigo-modelo: o destino que a planta gravou como "planejado" sai com a URL.
 * Do mesmo mapa de publicações do lote (`siloPublications`); sem ele, nada.
 */
function irmaosNoAr(contexto: RadarWritingArticleContext): Array<{ slug: string | null; labels: string[]; url: string }> | undefined {
  if (!contexto.silo || !contexto.siloPublications?.size) return undefined;
  const saida: Array<{ slug: string | null; labels: string[]; url: string }> = [];
  for (const membro of contexto.silo.members) {
    if (membro.articleId === contexto.articleId) continue;
    const publicada = contexto.siloPublications.get(membro.articleId);
    const url = publicada?.published ? texto(publicada.publishedUrl) || texto(publicada.canonical) : "";
    if (url) saida.push({ slug: membro.slug, labels: [rotuloDoMembro(membro), texto(membro.title)].filter(Boolean), url });
  }
  return saida.length ? saida : undefined;
}

/*
 * 2026-10-09 · OS LINKS INTERNOS SÃO OS DA PLANTA. A coluna links_internos pelo
 * plano de links do pacote (o destino casado pelo Silo, a seção pela estrutura
 * legada, a distribuição pelas seções) saiu com a estrutura legada: a planta
 * posiciona os links (candidatos K, do Silo e do grafo aprovado) e a coluna sai
 * dela. Do pacote fica só a pergunta "há plano de links?", para a ressalva do
 * artigo isolado do Silo.
 */
function haPlanoDeLinks(p: Projecoes): boolean {
  if (p.linksDoPlano.length) return true;
  /* Requisito do ArticleDNA com âncora de verdade (não endereço de nó). */
  return p.dna.internalLinkRequirements.some(requisito => {
    const bruto = /^[A-Z_]+:\s*(.*)$/.exec(requisito)?.[1] || "";
    return Boolean(bruto) && !/[:/]|[0-9a-f]{8}-[0-9a-f]{4}/i.test(bruto) && bruto.split(",").some(item => item.trim());
  });
}

/* ============================== a autoridade ============================== */

const YMYL: Record<string, string> = { NONE: "nenhuma", LOW: "baixa", MATERIAL: "material", HIGH: "alta" };
const YMYL_SENSIVEL = new Set(["MATERIAL", "HIGH"]);

type Afirmacao = RadarAuthorityEvidence["claims"][number];

export function radarWritingUnsupportedClaims(
  autoridade: RadarAuthorityEvidence | null,
  serp: RadarPortableSerpEvidence,
  /* 2026-10-09 · Defeito 2 · aditivo: a base única; o "N de M páginas tratam" sai sobre ela (recontado pelas páginas que sustentam a afirmação, ou sem contagem). */
  base: RadarSampleBasis | null = null,
): Array<{ afirmacao: string; mercado: string | null }> {
  if (autoridade) {
    const sustentadas = new Set(autoridade.factualEvidence.filter(item => item.supportType === "SUPPORTS").map(item => item.claimId));
    return autoridade.claims
      .filter((claim: Afirmacao) => radarClaimNeedsFactualSupport(claim) && !sustentadas.has(claim.claimId))
      .map(claim => {
        const fracao = radarSampleBasisFraction(base, {
          pages: claim.market.competitors,
          sampleSize: claim.market.sampleSize,
          urls: (claim.market.supportingCompetitors || []).map(item => item.url),
        });
        return { afirmacao: claim.canonicalClaim, mercado: fracao ? `${fracao.pages} de ${fracao.sampleSize} páginas tratam` : null };
      });
  }
  return serp.authorityClaims.filter(item => item.ymylRelevant).map(item => ({ afirmacao: item.claim, mercado: null }));
}

function temaSensivel(p: Projecoes): boolean {
  const ymyl = p.autoridade?.ymylAssessment;
  if (ymyl && YMYL_SENSIVEL.has(ymyl.relevance)) return true;
  if (p.autoridade?.claims.some(claim => YMYL_SENSIVEL.has(claim.ymyl.relevance))) return true;
  return p.serp.authorityClaims.some(item => item.ymylRelevant);
}

/**
 * O PACOTE SE CONTRADIZ SOBRE YMYL? Isso vira conflito DITO, e não escolha.
 *
 * "Relevância baixa" no artigo e afirmação de saúde sem fonte no mesmo pacote
 * são duas conclusões gravadas. O export não decide qual vale (invariante 30):
 * diz as duas, e manda tratar pela mais restritiva até o Radar resolver.
 */
function conflitoDeYmylDetalhado(p: Projecoes): { texto: string; nomeadas: string[] } | null {
  const ymyl = p.autoridade?.ymylAssessment;
  if (!ymyl || YMYL_SENSIVEL.has(ymyl.relevance)) return null;
  const sensiveis = [
    ...(p.autoridade?.claims.filter(claim => YMYL_SENSIVEL.has(claim.ymyl.relevance)).map(claim => claim.canonicalClaim) || []),
    ...p.serp.authorityClaims.filter(item => item.ymylRelevant).map(item => item.claim),
  ];
  const unicas = unicosPorChave(sensiveis, radarWritingCompareKey);
  if (!unicas.length) return null;
  const quantas = unicas.length === 1 ? "uma afirmação sensível que pede fonte" : `${unicas.length} afirmações sensíveis que pedem fonte`;
  const nomeadas = unicas.slice(0, 2);
  return {
    texto: `o pacote registra YMYL ${YMYL[ymyl.relevance] || ymyl.relevance} e também ${quantas} (${nomeadas.map(entreAspas).join(", ")}); trate como tema sensível até o Radar resolver`,
    nomeadas: nomeadas.map(radarWritingCompareKey),
  };
}

const conflitoDeYmyl = (p: Projecoes): string | null => conflitoDeYmylDetalhado(p)?.texto ?? null;

/* ============================== o especialista ============================== */

type TipoDoParecer = "FECHAMENTO" | "CTA" | "DIRETRIZ";
export type RadarWritingSpecialistContribution = Contribuicao;
/*
 * 2026-10-08 · P1 · `referencia` (aditivo): a linha da coluna de fontes para o
 * parecer de fechamento, CTA ou diretriz, que já sai inteiro na coluna
 * promessa_e_leitor — sem repetir o texto aprovado.
 */
type Contribuicao = { rotulo: string; linha: string; aviso: string | null; secao: string | null; tipo: TipoDoParecer | null; resposta: string; referencia?: string };

/*
 * ===== 2026-10-08 · P1 · A RESPOSTA APROVADA SAI INTEIRA =====
 *
 * A "Chamada final" e o bloco Especialista dos 8 CSVs do Silo terminavam em
 * "…marcar uma consulta…": `contribution` é a SÍNTESE da resposta
 * (`extractedSummary`, cortada por frase em `specialist-contribution-review`),
 * e o export ainda cortava em 400 caracteres. O texto aprovado é a resposta
 * original (`fullAnswer`): quando a síntese é só o começo dela, cortado com
 * "…", sai a original inteira. Síntese organizada (outro texto) sai como foi
 * aprovada — e nenhuma das duas é cortada aqui.
 */
export function radarWritingApprovedAnswer(item: { contribution: string; fullAnswer?: string | null }): string {
  const sintese = texto(item.contribution);
  const original = texto(item.fullAnswer).replace(/\s+/g, " ");
  if (!original || !/(?:…|\.\.\.)$/.test(sintese)) return sintese;
  const comeco = radarWritingCompareKey(sintese.replace(/(?:…|\.\.\.)$/, ""));
  return comeco && radarWritingCompareKey(original).startsWith(comeco) ? original : sintese;
}

/*
 * A VOZ DO ESPECIALISTA NA VIRADA FINAL E NO CTA (SDD diretriz editorial, 2026-10-02).
 *
 * O parecer direto de fechamento, de CTA ou de diretriz tem lugar certo no
 * artigo. Sem o tipo, ele ia para a coluna de fontes como "sem ponto de
 * aplicação" e o fecho continuava derivado de um cabeçalho de concorrente.
 */
/* 2026-10-02 · o lugar do parecer na unidade que a linha descreve: "fechamento do artigo", "fechamento da landing page". */
const aplicacaoDoTipo = (tipo: TipoDoParecer, unidade: RadarWritingUnit): string => {
  const formas = daUnidade(unidade);
  if (tipo === "FECHAMENTO") return `fechamento ${formas.do} ${unidade.noun} (virada final)`;
  if (tipo === "CTA") return "chamada final (CTA)";
  return `${formas.o} ${unidade.noun} inteir${formas.terminacao} (diretriz)`;
};
const tipoDoParecer = (kind: string | null | undefined): TipoDoParecer | null =>
  kind === "FECHAMENTO" || kind === "CTA" || kind === "DIRETRIZ" ? kind : null;
const vozDoEspecialista = (especialista: readonly Contribuicao[], tipo: TipoDoParecer) => especialista.filter(item => item.tipo === tipo);
const falaDoEspecialista = (item: Contribuicao) => `${entreAspas(item.resposta)} (${item.rotulo}; atribuir como fala do especialista, sem inventar nome ou credencial)`;

/*
 * 2026-10-08 · P0-B · `tituloDe` (opcional): a seção pelo título com que ela sai na coluna estrutura.
 * 2026-10-09 · `planta` (opcional): com o artigo-modelo, a seção é a da planta —
 * a que a planta atribuiu ao especialista (`specialist`) ou, sem ela, a que
 * nasceu da seção da pauta (`tituloDe`); sem par na planta, o ponto de
 * aplicação do pacote, nunca o título de uma seção que o entregável não tem.
 */
export function radarWritingSpecialistContributions(p: Projecoes, tituloDe: ((cabecalho: string) => string | null) | null = null, planta: RadarArticleBlueprintPayload | null = null): Contribuicao[] {
  if (p.especialista.state !== "RECEIVED") return [];
  return p.especialista.items.filter(item => item.approved).map((item, indice) => {
    const pergunta = texto(item.requirementQuestion) || texto(item.questionsSent[0]) || null;
    const assunto = p.autoridade?.specialistReviewRequirements.find(ponto => pergunta && radarWritingCompareKey(ponto.specificQuestion).includes(radarWritingCompareKey(pergunta).slice(0, 40)))?.topic
      || item.questionsSent.map(frase => frase.match(/["“]([^"”]+)["”]/)?.[1]).find(Boolean)
      || null;
    /* 2026-10-08 · P1 · a resposta aprovada, inteira (sem o corte da síntese nem o de 400 caracteres). */
    const resposta = radarWritingApprovedAnswer(item);
    const tipo = tipoDoParecer(item.kind);
    const aplicacao = tipo ? aplicacaoDoTipo(tipo, p.unidade) : ehPreenchimento(item.appliesTo) || /ainda n[aã]o definida/i.test(item.appliesTo) ? null : texto(item.appliesTo);
    const secao = aplicacao && !tipo ? p.secoes.find(secao => {
      const alvo = radarWritingContentWords(aplicacao);
      const cab = radarWritingContentWords(`${secao.heading} ${secao.readerQuestion || ""}`);
      return [...alvo].filter(palavra => cab.has(palavra)).length >= Math.max(1, Math.ceil(alvo.size / 2));
    }) ?? null : null;
    /*
     * A CONTRIBUIÇÃO ACEITA NÃO É DESCARTADA — ela sai com o aviso.
     *
     * Um humano a aceitou (AGENTS §9). Se a resposta não fala do assunto da
     * pergunta, ou não tem ponto de aplicação, quem escreve precisa saber
     * antes de usar: descartar em silêncio apagaria uma decisão humana.
     */
    const avisos: string[] = [];
    const doAssunto = radarWritingContentWords(assunto);
    /*
     * 2026-10-08 (correção da revisão) · D10: "conferir antes de usar" e "a
     * definir" eram espera aberta no entregável. O aviso diz o que fazer com a
     * contribuição, concluído.
     */
    if (!tipo && doAssunto.size && ![...doAssunto].some(palavra => radarWritingContentWords(item.contribution).has(palavra))) {
      avisos.push(`aceita, mas a resposta não trata de ${entreAspas(assunto || "")}: use só como orientação geral, sem apresentá-la como resposta a essa pergunta`);
    }
    if (!aplicacao) avisos.push("sem ponto de aplicação no pacote: entra onde couber, como orientação");
    avisos.push(...item.limitations.map(semPontoFinal));
    const rotulo = `E${indice + 1}`;
    /* 2026-10-09 · com a planta, a seção é dela (a atribuída ao E, ou a que nasceu da seção da pauta); sem par, o ponto de aplicação. */
    const daPlanta = planta && !tipo ? planta.blueprint.sections.find(item => item.specialist === rotulo)?.h2 ?? (secao ? tituloDe?.(secao.heading) ?? null : null) : null;
    const ondeAplicar = planta
      ? daPlanta ? `seção "${daPlanta}"` : aplicacao || "onde couber no texto, como orientação"
      : secao ? `seção "${tituloDe?.(secao.heading) || secao.heading}"` : aplicacao || "onde couber no texto, como orientação";
    const partes = (respostaDita: string) => [
      `${rotulo} · Pergunta: ${entreAspas(assunto || pergunta || "ponto preparado pela investigação")}`,
      `Resposta aprovada: ${respostaDita}`,
      `Aplicar em: ${ondeAplicar}`,
      `Atribuir como: ${semPontoFinal(item.classification).toLowerCase()} de especialista, sem inventar nome ou credencial`,
      ...(avisos.length ? [`Atenção: ${avisos.join("; ")}`] : []),
    ].join(" · ");
    return {
      rotulo,
      secao: secao?.heading ?? null,
      tipo,
      resposta,
      aviso: avisos.length ? avisos.join("; ") : null,
      linha: partes(entreAspas(resposta)),
      ...(tipo ? { referencia: partes("inteira na coluna promessa_e_leitor") } : {}),
    };
  });
}

/* ============================== as colunas do artigo ============================== */

/**
 * ===== O FAQ LEGADO, NUMA FRASE SÓ (AGENTS §13 — 2026-10-02) =====
 *
 * O arquivo dizia o FAQ de três jeitos: "manter como está, sem ampliar nem
 * remover" na regra geral e na linha do publicado, e "mantenha a seção de
 * perguntas existente" no prompt — e nenhum dizia que o FAQ legado pode sair
 * com decisão humana. A regra é uma: FAQ não integra o fluxo novo; o legado da
 * página publicada não é removido automaticamente, só com decisão humana
 * registrada, e aí as respostas úteis vão para o corpo. A MESMA frase vai à
 * regra geral, à linha do publicado e ao prompt, para qualquer tipo de página.
 */
export const RADAR_WRITING_LEGACY_FAQ = "FAQ legado de página publicada: mantenha como está, sem ampliar; ele não integra o fluxo novo, mas só sai com decisão humana registrada (por exemplo, reescrita integral autorizada pela marca), e então as respostas úteis vão para o corpo das seções.";

/*
 * ===== 2026-10-08 · C2 · O MAPA DA ATUALIZAÇÃO, NO LUGAR DA PENDÊNCIA =====
 *
 * A linha dizia "seção existente que a planta não tem só sai com decisão
 * humana — leve-a como pendência fora do texto": espera aberta no entregável
 * (D10), e nenhuma resposta sobre o que fazer com cada H2 publicado. Agora cada
 * H2 tem destino, pela leitura do mapa do artigo-modelo
 * (`radarArticleBlueprintPublishedMapReading`): vira a seção N da planta
 * (reescrito na voz), vai para o fechamento, fica como seção própria depois da
 * seção N, ou sai com o motivo que a planta registrou. O artigo-modelo antigo
 * (sem `publishedMap`) é lido pelo casamento de títulos, conservador: o H2 sem
 * par FICA — nada sai sem decisão. O FAQ legado segue a regra dele. Sem
 * artigo-modelo, a regra concluída: o que a página cobre fica, reescrito.
 */
/*
 * 2026-10-09 · sem a "estrutura sugerida" legada: a base da atualização é a
 * planta (com o mapa da página publicada). Esta frase só sobra para a linha que
 * não tem planta (a investigação de vídeo como perfil primário, só identidade)
 * e para o H2 publicado que nenhum mapa lê (página só com FAQ legado).
 */
const RADAR_WRITING_UPDATE_WITHOUT_BLUEPRINT = "Atualização: o que a página já cobre fica no texto, reescrito na voz e reordenado se preciso. Nada sai da página sem decisão humana registrada.";

/** 2026-10-08 · C2 · O destino de um H2 publicado; o "depois da seção N" diz também o título da seção N. */
function destinoDoH2(item: RadarArticleBlueprintPublishedMapReading, secoes: ReadonlyArray<{ h2: string }>): string {
  const frase = radarArticleBlueprintPublishedMapLine(item);
  const depois = item.kind === "KEEP" && item.after ? secoes[item.after - 1]?.h2 : null;
  return depois ? `${frase} (${entreAspas(depois)})` : frase;
}

function linhasDaAtualizacao(
  atual: { h1: string | null; h2: string[] },
  planta: RadarArticleBlueprintPayload | null,
  keywords: readonly string[],
  lida = "lida da página na exportação",
  /* 2026-10-09b · as exclusões dos reajustes no ArticleDNA: a seção da planta que as cobre sai, e o H2 publicado delas também. */
  exclusoes: readonly RadarResearchScopeExclusion[] = [],
): string[] {
  const titulo = `Estrutura publicada atual (${lida}): H1 ${entreAspas(atual.h1 || "sem H1 legível")}`;
  if (!atual.h2.length) return [`${titulo}; nenhum H2 legível.`];
  const comExclusoes = exclusoes.length ? { items: exclusoes, core: keywords } : null;
  /* A mesma planta lida das colunas (sem a seção excluída), para o "vira a seção N" apontar a mesma seção. */
  const plantaLida = planta && comExclusoes ? { ...planta, blueprint: radarArticleBlueprintReading(planta.blueprint, { exclusions: comExclusoes }).blueprint } : planta;
  const leitura = plantaLida ? radarArticleBlueprintPublishedMapReading(plantaLida, atual.h2, { keywords, ...(comExclusoes ? { exclusions: comExclusoes } : {}) }) : [];
  if (!plantaLida || !leitura.length) {
    return [`${titulo}; ${atual.h2.length} H2: ${atual.h2.map(item => entreAspas(cortar(item, 80))).join(" · ")}.`, RADAR_WRITING_UPDATE_WITHOUT_BLUEPRINT];
  }
  const faq = unicosPorChave(atual.h2.filter(item => EH_FAQ.test(item)), radarWritingCompareKey);
  return [
    `${titulo}; ${atual.h2.length} H2.`,
    "Atualização: cada H2 publicado tem destino na planta do artigo-modelo (coluna estrutura); nada sai da página sem decisão registrada no artigo-modelo:",
    ...leitura.map(item => `- ${entreAspas(cortar(item.current, 80))} → ${destinoDoH2(item, plantaLida.blueprint.sections)}`),
    ...faq.map(item => `- ${entreAspas(cortar(item, 80))} → FAQ legado: segue a regra do FAQ legado, abaixo`),
  ];
}

/* 2026-10-08 · As keywords do artigo (principal, complementares e Assunto), sem vazio: não distinguem um título do outro. */
const keywordsDoArtigo = (p: Projecoes): string[] => nucleoDoArtigo(p).map(valor => texto(valor)).filter(Boolean);

/**
 * 2026-10-09 (correção) · AS EXCLUSÕES DO REAJUSTE, NA FORMA QUE A LEITURA DA
 * PLANTA RECEBE, para todo entregável. O CSV "Para escrever" já as aplicava; o
 * CSV de vídeo, o plano do vídeo do Redator (`radarVideoPlan`) e o técnico liam
 * a mesma planta sem elas — a seção sobre um assunto que o Arquiteto tirou do
 * artigo virava capítulo, corte e lâmina. Aditivo: `null` sem exclusão (a
 * leitura fica a de antes).
 */
export function radarWritingBlueprintExclusions(input: RadarPortableExportInput, p: RadarWritingProjections = radarWritingProjections(input)): { items: RadarResearchScopeExclusion[]; core: string[] } | null {
  const items = radarResearchContextScopeExclusions(input.researchContext);
  return items.length ? { items, core: keywordsDoArtigo(p) } : null;
}

function colunaArtigo(input: RadarPortableExportInput, p: Projecoes, contexto: RadarWritingArticleContext, papel: string | null): string {
  const principal = texto(p.dna.principalKeyword);
  const volumes = new Map<string, RadarPortableKeywordDna>(p.keywords.map(item => [radarWritingCompareKey(item.keyword), item]));
  const comoUsar = (papelDaKeyword: "SECONDARY" | "NARRATIVE") => (papelDaKeyword === "SECONDARY"
    ? "faceta da mesma intenção: cabeçalho ou dentro da seção que trata do assunto"
    : "reforço no corpo, sem seção própria");
  const complementares = unicosPorChave([
    ...p.dna.secondaryKeywords.map(keyword => ({ keyword, papel: "SECONDARY" as const })),
    ...p.dna.narrativeReinforcements.map(keyword => ({ keyword, papel: "NARRATIVE" as const })),
  ], item => radarWritingCompareKey(item.keyword)).filter(item => radarWritingCompareKey(item.keyword) !== radarWritingCompareKey(principal));
  const chavesDasKeywords = new Set([principal, ...complementares.map(item => item.keyword)].map(radarWritingCompareKey));
  const coberturaAlem = p.dna.mustCover.filter(item => !chavesDasKeywords.has(radarWritingCompareKey(item)));
  const intencao = intencaoLegivel(p.dna.intent);
  const funil = legivelOuNulo(p.dna.funnel);
  const publicacao = contexto.publication;
  const publicado = Boolean(publicacao?.published || input.article.publishedProtected);
  const slug = texto(publicacao?.slug) || texto(input.article.slug);

  const linhas = [
    `Keyword principal: ${principal || "não resolvida no pacote"}`,
    /* 2026-10-09 · o destino da virada do Assunto (a coluna promessa legada que o dizia saiu; a planta o recebe no pedido). */
    ...(p.assunto ? [`Assunto (tronco): ${p.assunto.phrase}${p.assunto.destinationUrl ? ` — destino da virada: ${radarWritingCleanUrl(p.assunto.destinationUrl)}` : ""}`] : []),
    ...(complementares.length
      ? ["Keywords complementares:", ...complementares.map(item => {
        const volume = volumes.get(radarWritingCompareKey(item.keyword))?.volume;
        return `- ${item.keyword}${typeof volume === "number" ? ` · ${numeroBr(volume)}/mês` : ""} · ${comoUsar(item.papel)}`;
      })]
      : []),
    ...(coberturaAlem.length ? [`Cobertura obrigatória: ${coberturaAlem.join(" · ")}`] : []),
    ...(intencao ? [`Intenção: ${[intencao, funil].filter(Boolean).join(" · ")}`] : []),
    ...(papel ? [`Papel no Silo: ${papel}${O_QUE_O_PAPEL_PEDE[papel] ? ` — ${O_QUE_O_PAPEL_PEDE[papel]}` : ""}`] : []),
    ...(formatoLegivel(input, p.editorial) ? [`Formato: ${formatoLegivel(input, p.editorial)}`] : []),
    ...(slug ? [`Slug: ${slug}`] : []),
  ];

  /*
   * ARTIGO PUBLICADO (AGENTS §11): URL, slug, canonical e o estado da
   * principal saem SEMPRE — inclusive o "desconhecido". Omitir a política
   * ausente liberaria a troca da principal em silêncio.
   */
  if (publicado) {
    const url = texto(publicacao?.publishedUrl);
    const canonical = texto(publicacao?.canonical) || texto(input.article.canonical);
    const politica = radarWritingCompareKey(publicacao?.principalPolicy);
    linhas.push(
      `Publicado: ${url || "sim (URL publicada não registrada no pacote)"} — preservar URL, slug e canonical`,
      /* 2026-10-02 · a estrutura atual da página, lida na exportação: a atualização parte dela. 2026-10-08 · C2 · com o destino de cada H2. */
      /* 2026-10-09b · com as exclusões dos reajustes no ArticleDNA (o H2 publicado de assunto excluído sai, com o motivo). */
      ...(publicacao?.currentStructure
        ? linhasDaAtualizacao(publicacao.currentStructure, contexto.blueprint ?? null, keywordsDoArtigo(p), undefined, radarResearchContextScopeExclusions(input.researchContext))
        /* 2026-10-08 · C2 · sem a leitura de agora, a página que o artigo-modelo viu ao ser montado (com o mapa dele). */
        : contexto.blueprint?.publishedStructure?.h2.length
          ? linhasDaAtualizacao(contexto.blueprint.publishedStructure, contexto.blueprint, keywordsDoArtigo(p), "lida ao montar o artigo-modelo", radarResearchContextScopeExclusions(input.researchContext))
          : []),
      `Canonical: ${canonical || "não registrado no pacote; não criar um novo"}`,
      politica === "locked"
        ? "Principal: travada — não trocar"
        : politica === "revisable"
          ? "Principal: revisável — só troca com decisão humana no Arquiteto, nova versão e histórico"
          : "Principal: estado desconhecido — não trocar até decisão humana",
      RADAR_WRITING_LEGACY_FAQ,
    );
  } else if (texto(input.article.canonical)) {
    linhas.push(`Canonical: ${texto(input.article.canonical)}`);
  }

  if (contexto.siloInline) linhas.push(...siloNaLinha(contexto));
  if (input.authors !== undefined && input.authors !== null) linhas.push(linhaDeAutoria(input.authors, p.unidade));
  linhas.push(`Não altere: ${naoAltere(publicado, p.assunto).join("; ")}.`);
  return linhas.join("\n");
}

/**
 * QUEM ASSINA (E-E-A-T) — o especialista da aba Especialista (pedido do dono, 2026-10-02).
 * Vale para qualquer artigo ou página: o nome cadastrado, sem credencial além da especialidade.
 */
export function radarWritingAuthorLine(autores: ReadonlyArray<{ name: string; specialty: string | null; source: string }>, unidade: RadarWritingUnit = ARTIGO_COMO_UNIDADE): string {
  /* 2026-10-02 · `unidade` é opcional: sem ela (ou artigo), as frases de antes; com landing page, "assina a landing page". */
  const formas = daUnidade(unidade);
  if (!autores.length) return `Autoria (E-E-A-T): nenhum especialista definido para ${formas.este} ${unidade.noun} na aba Especialista do Radar; defina quem assina antes de publicar. Não invente autor.`;
  const nomes = autores.map(autor => `${autor.name}${autor.specialty ? ` (${autor.specialty})` : ""}`).join(" e ");
  return autores.every(autor => autor.source === "only_active")
    ? `Autoria (E-E-A-T): ${nomes}, único especialista ativo da marca (aba Especialista); confirme antes de publicar. Não acrescente credencial além do cadastro.`
    : `Autoria (E-E-A-T): ${nomes}, especialista da aba Especialista; assina ${formas.o} ${unidade.noun} e é a voz das falas atribuídas. Não acrescente credencial além do cadastro.`;
}
const linhaDeAutoria = radarWritingAuthorLine;

/**
 * O SILO NA LINHA DO ARTIGO (2026-10-02, pedido do dono).
 *
 * "Só os selecionados" saía "sem o contexto do Silo": sem ordem narrativa, sem
 * SiloPage, sem os irmãos que os links pedem. Quando a seleção cruza Silos, o
 * contexto de cada um vai na linha do próprio artigo, curto.
 */
function siloNaLinha(contexto: RadarWritingArticleContext): string[] {
  const silo = contexto.silo;
  if (!silo || silo.kind !== "silo") return ["Silo: sem silo resolvido no Radar; escreva sem pressupor ordem narrativa nem irmãos."];
  const pagina = silo.siloPage;
  const endereco = pagina ? pagina.publishedUrl || pagina.canonical || (pagina.slug ? `/${pagina.slug}` : null) : null;
  return [
    /* 2026-10-08 · D10: o estado do Silo dito sem "rascunho" (a composição continua podendo mudar). */
    `Silo: ${silo.label}${silo.draft ? " (em formação no Arquiteto: a composição pode mudar)" : ""}`,
    ...(util(silo.centralEntity) ? [`Tema central do Silo: ${silo.centralEntity}`] : []),
    ...(pagina ? [`SiloPage: ${endereco || "endereço não registrado"} (${pagina.status})`] : []),
    ...(silo.excludedTopics.length ? [`Fora do Silo (não cobrir): ${silo.excludedTopics.join(" · ")}`] : []),
    "Ordem narrativa do Silo:",
    ...silo.members.map(membro => `${membro.position} · ${papelLegivel(membro.role) || membro.role} · ${rotuloDoMembro(membro)}${membro.slug ? ` · /${membro.slug}` : ""}${membro.articleId === contexto.articleId ? " · ESTE ARTIGO" : membro.inThisFile ? " · neste arquivo" : ` · ${membro.statusLabel}`}`),
  ];
}

/**
 * AS DECISÕES PROTEGIDAS — as mesmas proibições que o Redator recebe
 * (`RADAR_WRITER_MAY_NOT`), em frase curta. A lista vem de lá: uma proibição
 * nova no Redator aparece aqui sem ninguém lembrar de copiar. Com Assunto
 * declarado, a lista é a de `radarWriterMayNotFor`, com a proibição dele.
 */
function naoAltere(publicado: boolean, assunto: Pick<AssuntoDeEscrita, "phrase"> | null = null): string[] {
  const curtas: Record<string, string> = {
    "trocar a keyword principal": "a keyword principal",
    "reconfigurar o Silo": "a configuração do Silo",
    "remover uma cobertura obrigatória": "a cobertura obrigatória (não remova nenhuma)",
    "alterar a intenção declarada do artigo": "a intenção declarada",
    "alterar slug protegido": "o slug",
    "alterar canonical protegido": "o canonical",
    "substituir a composição de secundárias por decisão própria": "a composição de keywords complementares",
    [RADAR_WRITER_MAY_NOT_SUBJECT]: "o Assunto declarado (não troque nem remova)",
  };
  const itens = radarWriterMayNotFor(assunto).map(proibicao => curtas[proibicao] || proibicao);
  return [...itens.slice(0, 1), "o papel no Silo", ...itens.slice(1), ...(publicado ? ["a URL publicada"] : [])];
}

/*
 * 2026-10-02 · O PRÓXIMO PASSO DO LEITOR NUNCA INVENTA LINK. Sem link aprovado
 * no plano para aquele destino, a frase diz isso — o texto pode citar o próximo
 * conteúdo, mas o link é do Arquiteto.
 * 2026-10-08 · D10: "peça ao Arquiteto" era espera aberta no entregável; a
 * regra concluída é citar sem link.
 */
export const RADAR_WRITING_NO_APPROVED_LINK = "(cite sem link: o grafo aprovado não traz esse link; não crie o link)";

/**
 * ===== 2026-10-08 · C4 · A TRAVA DE FONTE NO CSV PARA ESCREVER =====
 *
 * O CSV de vídeo já tirava do texto publicável a frase que só entra com fonte;
 * o CSV para escrever não marcava nada ("O CSV 'Para escrever' não muda", no
 * catálogo). Agora a frase que a régua por sentido (`radarSentenceNeedsSource`)
 * reprova leva o rótulo da regra geral 5 — "(precisa de fonte: …)" — e quem
 * escreve a sustenta com fonte do pacote, a delimita ou a omite. A tese que
 * NEGA o efeito ("o Instagram, sozinho, não enche a agenda") passa.
 */
export function radarWritingSourceMark(frase: string, veredito: Pick<RadarSentenceSourceVerdict, "needs" | "label">): string {
  if (!veredito.needs || !veredito.label) return frase;
  const corpo = frase.trim();
  const comPonto = corpo.endsWith(".");
  return `${corpo.replace(/[.;:\s]+$/, "")} (precisa de fonte: ${veredito.label})${comPonto ? "." : ""}`;
}

/*
 * 2026-10-08 · P1 · A CONTINUAÇÃO DA LEITURA (o próximo artigo do Silo ou, no
 * último, a SiloPage), com o link aprovado pelo grafo ou citada sem link.
 * 2026-10-09 · a continuação é dita só pela planta (`radarArticleBlueprintColumns`,
 * opcional e no corpo da seção dela); a versão pela estrutura legada saiu com
 * ela (regra do dono: o artigo-modelo é o fundamento único).
 */

/** 2026-10-08 (correção) · F2 · O destino da continuação: o próximo membro do Silo ou, no último, a SiloPage. */
export type RadarWritingContinuation = { kind: "article" | "siloPage"; label: string; articleId: string | null; slug: string | null; names: string[] };

function destinoDaContinuacao(contexto: RadarWritingArticleContext): RadarWritingContinuation | null {
  const silo = contexto.silo;
  if (!silo) return null;
  const eu = silo.members.find(membro => membro.articleId === contexto.articleId) || null;
  const proximo = eu ? silo.members.find(membro => membro.position === eu.position + 1) || null : null;
  if (proximo) {
    return { kind: "article", label: rotuloDoMembro(proximo), articleId: proximo.articleId, slug: proximo.slug, names: [rotuloDoMembro(proximo), texto(proximo.title), texto(proximo.principalKeyword)].filter(Boolean) };
  }
  if (!silo.siloPage) return null;
  return { kind: "siloPage", label: silo.label, articleId: null, slug: silo.siloPage.slug ?? null, names: [silo.label] };
}

/**
 * 2026-10-08 (correção) · F2 · A linha da continuação, com o rótulo do link aprovado (L…) ou citada sem link.
 *
 * 2026-10-09 · Defeito 10 · a linha vai no CORPO da seção, opcional — o mesmo
 * texto da planta ("Leitura seguinte (opcional, não é uma chamada)"). Com o
 * link na própria seção (`naSecao`), "o link Ln desta seção leva…"; com o link
 * em outra parte, "mencione … com o link Ln"; sem link, citada sem link.
 */
export function radarWritingContinuationLine(destino: Pick<RadarWritingContinuation, "kind" | "label">, rotuloDoLink: string | null, naSecao = true): string {
  const nome = entreAspas(destino.label);
  const opcional = "- Leitura seguinte (opcional, não é uma chamada):";
  if (rotuloDoLink && naSecao) {
    const para = destino.kind === "article" ? `ao próximo artigo do Silo, ${nome}` : `à SiloPage ${nome}`;
    return `${opcional} o link ${rotuloDoLink} desta seção leva ${para}; se couber, apresente-o ali como a leitura seguinte, nunca como uma segunda chamada no fechamento.`;
  }
  const quem = destino.kind === "article" ? `o próximo artigo do Silo, ${nome},` : `a SiloPage ${nome}`;
  return `${opcional} se couber, mencione ${quem} no corpo desta seção ${rotuloDoLink ? `com o link ${rotuloDoLink}` : RADAR_WRITING_NO_APPROVED_LINK}; nunca como uma segunda chamada no fechamento.`;
}

/*
 * 2026-10-09 · A COLUNA PROMESSA E O TÍTULO SÃO DA PLANTA. A promessa, a
 * abertura, o fechamento, a chamada, o tronco (Assunto) e a direção do H1 pelo
 * modelo editorial da SERP saíram com ele (regra do dono: o artigo-modelo é o
 * fundamento único). O Assunto e o destino da virada chegam ao gerador do
 * artigo-modelo e saem também na coluna artigo.
 */

/** Sem sinal na SERP, a linha do H1 devolve a decisão a quem redige. */
export const RADAR_WRITING_SUBJECT_H1_NO_SIGNAL = "Assunto no H1: sem sinal na SERP, quem redige decide. O H1 é da principal.";

/**
 * O TÍTULO GRAVADO É UTILIZÁVEL?
 *
 * O gerador antigo emendava assuntos: "Como cuidar de uma pele oleosa: pele
 * oleosa e acne e skincare para pele oleosa: como fazer…". O export não
 * reescreve o título: ele o omite e diz por quê. A régua é estreita — longo E
 * (dois ou mais dois-pontos OU a principal repetida) —, para não descartar um
 * título legítimo.
 */
export function radarWritingTitleIsUsable(titulo: string | null | undefined, principal: string | null | undefined): boolean {
  const limpo = texto(titulo);
  if (!limpo) return false;
  if (limpo.length <= 90) return true;
  const doisPontos = (limpo.match(/:/g) || []).length;
  const chave = radarWritingCompareKey(principal);
  const repeticoes = chave ? radarWritingCompareKey(limpo).split(chave).length - 1 : 0;
  return !(doisPontos >= 2 || repeticoes >= 2);
}

/* ------------------------------ a estrutura ------------------------------ */

/** "Virada para <Assunto>" é o nome da seção no Radar, não um título para publicar. */
export const RADAR_WRITING_SUBJECT_WORKING_TITLE = "- Título de trabalho do Radar: reescreva para o leitor antes de publicar.";

/*
 * ===== 2026-10-08 · P0-B · O TÍTULO DE TRABALHO DA SEÇÃO É A PERGUNTA DO LEITOR =====
 *
 * Sem artigo-modelo, a estrutura vinha do modelo editorial da SERP, que veste
 * o cabeçalho do concorrente com um molde para não copiá-lo (§10): "Como X no
 * dia a dia?", "O que considerar sobre X?", "Afinal, X?", "Na prática, o que
 * X?". Nos CSVs reais isso deu "Como fazer um pitch de vendas eficiente? Guia
 * para converter clientes no dia a dia?" e "Afinal, tudo certo sobre como
 * atrair clientes para loja?" — e a própria voz da marca proíbe "O que
 * considerar sobre…". O bloco guarda-chuva ("Atrair cliente e clientes",
 * "Qualificados e gerar") é picotado de keyword.
 *
 * No CSV, a seção recebe a PERGUNTA DO LEITOR que ela responde, limpa (sem
 * caixa alta, sem entidade). Sem pergunta utilizável, o cabeçalho sem o molde.
 * O título é de trabalho: quem escreve o reescreve na voz, sem copiar o
 * cabeçalho do concorrente — isso é dito no topo da coluna. O modelo editorial
 * (e a tela do Radar) continua como é.
 */
export function radarWritingStripHeadingTemplate(cabecalho: string | null | undefined): string {
  /* A régua mora no artigo-modelo (`radarEditorialHeadingWithoutTemplate`), a mesma das linhas da virada do Redator. */
  return radarEditorialHeadingWithoutTemplate(radarWritingDecodeEntities(texto(cabecalho)));
}

/* As raízes de um título pelas cinco primeiras letras: "captar" e "captação", "cliente" e "clientes" são a mesma. */
const raizCurta = (palavra: string) => palavra.slice(0, 5);
const palavrasDeConteudo = (valor: string) => radarWritingCompareKey(valor).split(" ")
  .filter(palavra => palavra.length >= 4 && !VAZIAS.has(palavra) && !RADAR_WRITING_FUNCTION_WORDS.has(palavra));

/**
 * ===== 2026-10-08 · P0-B · O TÍTULO PICOTADO =====
 *
 * "Como atrair cliente e praticidade: atrair clientes e fazer um pitch de
 * vendas eficiente? guia para converter clientes", "Leads qualificados:
 * qualificados e gerar e o que considerar sobre estratégias para gerar",
 * "Como campanhas marketing e digital". O título sai montado com pedaços de
 * keyword e de cabeçalho. É picotado quando: traz um molde ("o que considerar
 * sobre", "no dia a dia", "Afinal,"), uma pergunta no meio, termina em
 * preposição, repete a raiz de um lado do dois-pontos no
 * outro, ou tem o bloco "A e B" sem verbo em que A é pedaço da keyword
 * principal ("Pacientes dentista e tráfego"). O trecho que é uma keyword do
 * artigo não conta como repetição ("tráfego pago e tráfego orgânico").
 */
export function radarWritingTitleIsFragmented(titulo: string | null | undefined, keywords: ReadonlyArray<string | null | undefined> = []): boolean {
  const limpo = radarWritingDecodeEntities(texto(titulo)).replace(/\s+/g, " ").trim();
  if (!limpo) return false;
  const chave = radarWritingCompareKey(limpo);
  if (/\b(?:o que considerar sobre|no dia a dia)\b/.test(chave) || /^(?:como )?(?:afinal|na pratica o que|o que explica o que)\b/.test(chave) || /:\s*afinal,/i.test(limpo)) return true;
  if (/^como (?:o que|afinal|na pratica|qual|quais)\b/.test(chave)) return true;
  if (/\?\s*\S/.test(limpo.replace(/[\s?!.…]+$/, ""))) return true;
  const palavras = chave.split(" ");
  const ultima = palavras[palavras.length - 1] || "";
  if (["de", "da", "do", "das", "dos", "para", "entre", "e", "ou", "com", "sobre", "em", "a", "o", "que", "como"].includes(ultima)) return true;
  const chavesDasKeywords = keywords.map(radarWritingCompareKey).filter(item => item.length > 3);
  const semKeyword = (trecho: string) => chavesDasKeywords.reduce((atual, keyword) => atual.split(keyword).join(" "), trecho);
  const segmentos = limpo.split(":").map(item => radarWritingCompareKey(item)).filter(Boolean);
  if (segmentos.length >= 2) {
    const antes = new Set(palavrasDeConteudo(semKeyword(segmentos[0])).map(raizCurta));
    if (segmentos.slice(1).some(segmento => palavrasDeConteudo(segmento).some(palavra => antes.has(raizCurta(palavra))))) return true;
  }
  const principal = new Set(palavrasDeConteudo(keywords[0] || "").map(raizCurta));
  for (const segmento of segmentos) {
    for (const parte of semKeyword(segmento).split(/\s+e\s+o\s+que\s+|\s*,\s*/)) {
      const bloco = parte.trim().match(/^(?:como\s+)?((?:\S+\s+){0,2}\S+)\s+e\s+(\S+)$/);
      if (!bloco) continue;
      const esquerda = palavrasDeConteudo(bloco[1]).map(raizCurta);
      const direita = raizCurta(bloco[2]);
      if (esquerda.length && (esquerda.includes(direita) || esquerda.every(raiz => principal.has(raiz)))) return true;
    }
  }
  return false;
}

/* A pergunta como título: caixa de cabeçalho fora, entidade decodificada, espaço antes do "?" fora. */
const perguntaComoTitulo = (valor: string) => semCaixaAlta(radarWritingDecodeEntities(valor).replace(/\s+\?/g, "?").replace(/\s+/g, " ").trim());

/*
 * ===== 2026-10-08 · P0-B · UMA RÉGUA SÓ PARA O "NÃO COBRIR" =====
 *
 * O item que a coluna cobrir_e_superar manda NÃO cobrir aparecia como H2 ou no
 * "Cobrir:" da mesma estrutura: "Como identificar um lead qualificado na
 * prática" (leads), "Como prospectar clientes pela Internet em 8 passos" e o
 * ICP (captar), "como funciona o tráfego vindo de ferramentas de IA" (tráfego e
 * captação). Agora o que é excluído sai de todas as colunas: o rótulo fora do
 * escopo pela régua de sempre (`radarWritingOutOfScope`), e a pergunta que a
 * coluna manda para outro artigo ou tópico do Silo pelo MESMO ITEM — as raízes
 * de conteúdo de um e de outro coincidem (três quartos ou mais), para que
 * "captar clientes" não saia só porque "Como captar clientes para atacado de
 * açaí…" pertence a outro artigo.
 */
export function radarWritingSameItem(a: string | null | undefined, b: string | null | undefined): boolean {
  const chaveA = radarWritingCompareKey(a);
  const chaveB = radarWritingCompareKey(b);
  if (!chaveA || !chaveB) return false;
  if (chaveA === chaveB) return true;
  const raizesA = raizesDeEscrita(a);
  const raizesB = raizesDeEscrita(b);
  if (Math.min(raizesA.length, raizesB.length) < 2) return false;
  /*
   * 2026-10-08 (correção) · o verbo e o particípio são a mesma raiz no MESMO
   * ITEM: "Como qualificar um lead na prática?" (no "Não cobrir") e "Como
   * identificar um lead qualificado na prática" (H2 do Pilar) — "qualificar" e
   * "qualificad" dividem "qualifica". Só aqui: a régua comum não muda.
   */
  const mesmoRadical = (x: string, y: string) => {
    let comum = 0;
    while (comum < Math.min(x.length, y.length) && x[comum] === y[comum]) comum += 1;
    return comum >= 7 && comum >= Math.min(x.length, y.length) - 2;
  };
  const comuns = raizesA.filter(raiz => temRaiz(raizesB, raiz) || raizesB.some(outra => mesmoRadical(raiz, outra))).length;
  const uniao = raizesA.length + raizesB.length - comuns;
  return uniao > 0 && comuns / uniao >= 0.75;
}

/*
 * 2026-10-09 · A ESTRUTURA LEGADA SAIU DO CSV. O plano da coluna estrutura pelo
 * modelo editorial da SERP (`planoDaEstrutura`), a estrutura pela página
 * publicada sem artigo-modelo (`planoDaPaginaPublicada`) e a coluna que os
 * escrevia (`colunaEstrutura`) foram substituídos pelo artigo-modelo (regra do
 * dono: o processo do piloto substitui o antigo). As seções do modelo editorial
 * continuam como ENTRADA do gerador (o esqueleto M1…Mn de `buildRadarArticleBlueprintBrief`).
 */

/*
 * ===== 2026-10-08 (correção) · O TÍTULO DA SEÇÃO PARA QUEM NÃO MONTA O PLANO (o envio ao Redator) =====
 *
 * As linhas "Virada" e "Seção da virada" do Redator nomeavam a seção pelo
 * cabeçalho sem molde, e o CSV pela pergunta do leitor (o título com que a
 * seção sai na coluna estrutura): com PAA, as duas divergiam. Esta é a régua do
 * título de `planoDaEstrutura` para uma seção do modelo — a pergunta do leitor
 * utilizável (sem ruído e sem retórica) ou, sem ela, o cabeçalho sem molde; o
 * título de trabalho da virada sintética fica como está. Fora dela ficam os
 * casos que só o plano inteiro conhece (pergunta excluída pelo "Não cobrir",
 * bloco picotado que herda o título da subseção).
 */
export function radarWritingSectionTitleResolver(
  modelo: { sections: ReadonlyArray<RadarWritingModelSectionForTitle> } | null | undefined,
  contexto: { core?: ReadonlyArray<string | null | undefined>; subjectPhrase?: string | null } = {},
): (cabecalho: string | null | undefined) => string | null {
  const porCabecalho = new Map<string, RadarWritingModelSectionForTitle>();
  const visitar = (secoes: ReadonlyArray<RadarWritingModelSectionForTitle>) => {
    for (const secao of secoes) {
      if (!porCabecalho.has(secao.headingSuggestion)) porCabecalho.set(secao.headingSuggestion, secao);
      visitar(secao.childSections || []);
    }
  };
  visitar(modelo?.sections || []);
  const deTrabalho = texto(contexto.subjectPhrase) ? radarSubjectTurnTitle(texto(contexto.subjectPhrase)) : null;
  const ruido: RadarResearchNoiseContext = { core: contexto.core || [] };
  return cabecalho => {
    if (!cabecalho) return null;
    if (deTrabalho && cabecalho === deTrabalho) return cabecalho;
    const secao = porCabecalho.get(cabecalho);
    if (!secao) return null;
    const crua = util(secao.readerQuestion);
    const pergunta = crua && !radarWritingRhetoricalQuestion(crua) && !radarEditorialHeadingNoiseReason(crua, ruido) ? perguntaComoTitulo(crua) : null;
    return pergunta || radarWritingStripHeadingTemplate(cabecalho) || cabecalho;
  };
}

export type RadarWritingModelSectionForTitle = { headingSuggestion: string; readerQuestion?: string | null; childSections?: ReadonlyArray<RadarWritingModelSectionForTitle> };

/* ---------------------------- cobrir e superar ---------------------------- */

const STATUS_DE_PERGUNTA = new Set(["ARTICLE_QUESTION_CONFIRMED", "MARKET_QUESTION_UNDERCOVERED"]);
const PRIORIDADE: Record<string, string> = { HIGH: "prioridade alta", MEDIUM: "prioridade média", LOW: "prioridade baixa" };

/**
 * PERGUNTA DE FECHO DE CONCORRENTE NÃO É DÚVIDA DO LEITOR (2026-10-02).
 *
 * "Aprendeu como atrair clientes no Instagram?" é a última linha de uma página
 * concorrente, e virava a abertura do artigo.
 */
export function radarWritingRhetoricalQuestion(pergunta: string): boolean {
  /*
   * 2026-10-02 · A RÉGUA VALE PARA QUALQUER ASSUNTO, e lê a frase sem acento e
   * sem pontuação: "E aí, gostou?", "Ficou com dúvidas?", "O que você achou?" e
   * "Pronto para começar?" são fecho de página, não dúvida de leitor — em blog,
   * landing page ou página de serviço. A frase de antes continua coberta.
   *
   * 2026-10-02 · ESTA É A RÉGUA DAS LISTAS (perguntas a responder, movimentos,
   * termos, abertura, PAA): reação ao conteúdo, dúvida que sobrou e chamada
   * para ação. A chamada só conta quando é chamada — "pronto para" + verbo, sem
   * pergunta de verdade depois —, e "Preparado para a cirurgia: o que levar?"
   * ou "Pronto para consumo pode ser congelado?" continuam perguntas do leitor.
   * Para tirar SEÇÃO da estrutura, a régua é `radarWritingRhetoricalHeading`.
   */
  const chave = radarWritingCompareKey(pergunta);
  return REACAO_AO_CONTEUDO.test(chave) || DUVIDA_QUE_SOBROU.test(chave) || CHAMADA_PARA_ACAO.test(chave);
}

/**
 * ===== SEÇÃO DE FECHO RETÓRICO: A RÉGUA DA ESTRUTURA (2026-10-02) =====
 *
 * Revisão da frente: a régua das listas ganhou formas de chamada para ação, e
 * a mesma régua tirava cabeçalho da estrutura. Numa landing page ou página de
 * serviço, "Pronto para agendar sua avaliação?" é a seção de conversão da
 * página — e sumia rotulada como fecho de concorrente.
 *
 * Na estrutura (cabeçalho, ponto a cobrir e respiro) só sai a reação ao
 * conteúdo lido ("Aprendeu…?", "Gostou…?", "O que achou?"), em qualquer tipo de
 * página. "Ficou com alguma dúvida?" sai só da unidade editorial (artigo e
 * review): em landing page, página de serviço e categoria é o convite ao
 * contato, e é da página. Chamada para ação nunca tira nada da estrutura.
 */
export function radarWritingRhetoricalHeading(cabecalho: string, unidade: RadarWritingUnit = ARTIGO_COMO_UNIDADE): boolean {
  const chave = radarWritingCompareKey(cabecalho);
  return REACAO_AO_CONTEUDO.test(chave) || (unidade.editorial && DUVIDA_QUE_SOBROU.test(chave));
}

/* A reação ao conteúdo que acabou de ser lido: fecho de página, nunca dúvida de leitor. */
const REACAO_AO_CONTEUDO = /^(?:(?:e ai|e entao|entao|e agora) )?(?:aprendeu|aprenderam|gostou|gostaram|curtiu|curtiram|entendeu|entenderam|viu|viram|percebeu|perceberam|o que (?:voce )?achou|o que acharam)(?: |$)/;

/* A dúvida que sobrou depois da leitura: fecho no artigo; convite ao contato numa landing page. */
const DUVIDA_QUE_SOBROU = /^(?:(?:e ai|e entao|entao|e agora) )?(?:ficou com (?:alguma )?duvidas?|ficou alguma duvida|tem alguma duvida|ainda tem duvidas?)(?: |$)/;

/*
 * A chamada para ação. "Pronto/preparado para" só é chamada com VERBO logo
 * depois ("…para agendar", "…para começar") e sem pergunta de verdade no resto
 * da frase ("o que", "como", "pode", "vale"…): "Pronto para usar pode ser
 * congelado?" é dúvida do leitor.
 */
const CHAMADA_PARA_ACAO = /^(?:(?:e ai|e entao|entao|e agora) )?(?:(?:(?:quer|querem) (?:saber|aprender) mais|vamos (?:la|comecar|juntos)|bora)(?: |$)|(?:(?:voce|voces) )?(?:(?:esta|estao|ta|tao) )?(?:pront|preparad)[oa]s? para (?:ir|[a-z]+(?:ar|er|ir))(?: |$)(?!.*\b(?:o que|como|quando|quant[oa]s?|qual|quais|onde|por que|porque|pode|podem|posso|deve|devem|devo|precisa|precisam|preciso|vale|funciona|funcionam|serve|servem)\b))/;

/**
 * ===== O "NÃO COBRIR" ALCANÇA ESTE TEXTO? (2026-10-02) =====
 *
 * O CSV real dizia "Não cobrir: Ative o Instagram Shopping" e, na lista de
 * perguntas a responder, "Como prospectar clientes pelo Instagram com o
 * Instagram Shopping". A comparação era por igualdade de rótulo: a pergunta que
 * TOCA o assunto excluído passava.
 *
 * A régua, a mesma para qualquer marca e qualquer tipo de página: as palavras
 * que DISTINGUEM o rótulo fora do escopo — as dele, sem as raízes da keyword
 * principal, das complementares e do Assunto declarado — aparecem no texto, ao
 * menos metade delas (mínimo uma). "Instagram" é do núcleo e não distingue;
 * "Shopping" distingue. Rótulo feito só de palavras do núcleo não exclui nada
 * além dele mesmo, por igualdade, como antes.
 *
 * Os rótulos são os do pacote (`editorialCandidates` com veredito fora do
 * escopo) e, quando há Silo, os tópicos que ele exclui. Nada é inventado.
 *
 * 2026-10-02 · A RÉGUA MORA EM `out-of-scope.ts` (régua única): a mesma do
 * artigo-modelo e do CSV de vídeo. Os qualificadores de antes continuam lá,
 * junto com os verbos de abertura e as palavras genéricas de formato, e a
 * assinatura desta função não mudou.
 */
export function radarWritingOutOfScopeMatcher(input: {
  labels: ReadonlyArray<string | null | undefined>;
  core: ReadonlyArray<string | null | undefined>;
}): (valor: string | null | undefined) => boolean {
  return radarOutOfScopeMatcher(input);
}

/* O núcleo do artigo: principal, complementares e o Assunto declarado — o que nunca distingue um rótulo. */
const nucleoDoArtigo = (p: Projecoes) => [p.dna.principalKeyword, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, p.assunto?.phrase];

/** Os rótulos "não cobrir" do pacote e do Silo, contra o núcleo do artigo. */
export function radarWritingOutOfScope(p: Projecoes, excluidosDoSilo: readonly string[] = []): (valor: string | null | undefined) => boolean {
  return radarWritingOutOfScopeMatcher({
    labels: [...p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE").map(item => item.observedLabel), ...excluidosDoSilo],
    core: nucleoDoArtigo(p),
  });
}

export function radarWritingOpeningQuestion(p: Projecoes, foraDoEscopo: (valor: string | null | undefined) => boolean = radarWritingOutOfScope(p)): string | null {
  /*
   * A ABERTURA RESPONDE A PERGUNTA DO LEITOR DESTE ARTIGO (SDD 2026-10-02).
   *
   * A mais recorrente da amostra podia ser "10 principais influencers de IA do
   * Instagram" — recorrente e alheia ao artigo. Só vale pergunta que adere ao
   * núcleo: principal e complementares.
   */
  const nucleo = new Set([p.dna.principalKeyword, ...p.keywords.map(item => item.keyword)]
    .flatMap(valor => radarSemanticStems(texto(valor) || "")));
  const centrais = (p.descoberta?.answerableUnits || [])
    .filter(unidade => unidade.importance === "CORE")
    .sort((a, b) => b.marketRecurrence.pages - a.marketRecurrence.pages)
    .map(unidade => unidade.questionOrNeed);
  const doBlueprint = p.blueprint?.profile === "GOOGLE" ? p.blueprint.observed.questions.map(item => item.statement) : [];
  const observadas = p.serp.questions.filter(item => STATUS_DE_PERGUNTA.has(item.status)).sort((a, b) => b.pages - a.pages).map(item => item.question);
  /*
   * 2026-10-02 · nem fecho retórico de concorrente, nem pergunta que toca o "não cobrir".
   * 2026-10-08 · P1 · nem ruído de pesquisa: "👍As marcas e lojas de Estética são
   * seguras e confiáveis?" abria o artigo de promoções escrito para a clínica.
   */
  const todas = [...centrais, ...doBlueprint, ...observadas].filter((valor): valor is string => Boolean(texto(valor)) && !radarWritingRhetoricalQuestion(valor) && !foraDoEscopo(valor)
    && !radarReaderQuestionIsNoise(valor, p.ruido));
  /* Só raiz da PRINCIPAL vira cenário (ex.: "instagram"). */
  const daPrincipal = new Set(radarSemanticStems(texto(p.dna.principalKeyword) || ""));
  const onipresentes = new Set([...radarUbiquitousStems(todas)].filter(raiz => daPrincipal.has(raiz)));
  const aderentes = nucleo.size ? todas.filter(pergunta => radarTextAdheresToCore(pergunta, nucleo, onipresentes)) : todas;
  /*
   * 2026-10-02 · ENTRE AS ADERENTES, A QUE FALA DA PRINCIPAL. "Como captar
   * clientes pelo WhatsApp?" adere pelo "clientes", mas é outro canal; a
   * abertura de "como atrair clientes pelo instagram" vinha dela. Primeiro a
   * que divide ao menos duas raízes com a principal; sem nenhuma, a de antes.
   */
  /* Preposição ("pelo", "para") não é raiz do tema: "…clientes pelo WhatsApp" não fala da principal por ela. */
  const raizesDaPrincipal = [...daPrincipal].filter(raiz => !RADAR_WRITING_FUNCTION_WORDS.has(raiz));
  const minimo = Math.min(2, raizesDaPrincipal.length);
  const daPropriaPrincipal = minimo ? aderentes.find(pergunta => {
    const raizes = new Set(radarSemanticStems(pergunta));
    return raizesDaPrincipal.filter(raiz => raizes.has(raiz)).length >= minimo;
  }) : undefined;
  const escolhida = daPropriaPrincipal ?? aderentes[0];
  return escolhida ? radarWritingDecodeEntities(escolhida) : null;
}

/*
 * 2026-10-02 · A LIMITAÇÃO DIZ DE QUAL CAMADA FALA. "Nenhuma página foi
 * visitada" é verdade da leitura multiformato e dos recursos da SERP (vídeos,
 * blocos), não da investigação, que leu as páginas comparáveis — o CSV dizia as
 * duas coisas ao mesmo tempo. Com páginas lidas, a frase nomeia a camada.
 */
function limitacaoDaCamada(limitacao: string, paginasLidas: number): string {
  if (!paginasLidas || !/nenhuma p[aá]gina foi visitada/i.test(limitacao)) return limitacao;
  return `A leitura multiformato e dos recursos da SERP (vídeos e blocos) usa só o que a SERP devolveu: nenhum vídeo foi assistido ou transcrito. As ${paginasLidas} páginas comparáveis, estas sim, foram lidas pela investigação (base das medidas e dos temas dos concorrentes)`;
}

/* ---------------------- 2026-10-08 · C6 e C7: o diferencial e o foco das perguntas ---------------------- */

/* A raiz de comparação, sem palavra de função nem vazia; o radical não é uniforme ("cliente" × "client"): casa pelo começo (5+ letras). */
const mesmaRaizDeEscrita = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
const raizesDeEscrita = (valor: string | null | undefined): string[] =>
  [...new Set(radarSemanticStems(radarWritingDecodeEntities(texto(valor))))].filter(raiz => raiz.length >= 3 && !RADAR_WRITING_FUNCTION_WORDS.has(raiz) && !VAZIAS.has(raiz));
const temRaiz = (lista: readonly string[], raiz: string) => lista.some(outra => mesmaRaizDeEscrita(raiz, outra));
/* As raízes do núcleo do artigo: principal, complementares, Assunto e a cobertura que o ArticleDNA exige. */
const raizesDoNucleo = (p: Projecoes): string[] => [...new Set([...keywordsDoArtigo(p), ...p.dna.mustCover].flatMap(raizesDeEscrita))];
/* Palavras de forma, não de assunto: "Destaques de forma estratégica" não toca "Como usar… de forma estratégica". */
const RAIZES_DE_FORMA = ["estrateg", "pratic", "dica", "forma", "maneira", "tatic", "passo", "guia", "melhor", "import", "eficient", "complet"];
const deAssunto = (raiz: string) => !RAIZES_DE_FORMA.some(forma => raiz.startsWith(forma));

/*
 * ===== 2026-10-08 · C7 · A PERGUNTA É DESTE ARTIGO? =====
 *
 * No CSV real de 08/10, "Como fazer um pitch de vendas eficiente?" e "O que
 * fazer para vender muito no Instagram?" entravam nas perguntas a responder,
 * enquanto "Como chamar a atenção no Instagram?" estava no "Não cobrir": as
 * três só dividem com "como atrair clientes pelo instagram" a palavra do
 * cenário. E "Como captar clientes pelo WhatsApp?" é o assunto de outro
 * tópico do Silo ("como atrair clientes pelo whatsapp").
 *
 * A régua, a mesma da pergunta de abertura (`radarWritingOpeningQuestion`):
 * a pergunta é deste artigo quando divide com o núcleo duas raízes, ou uma que
 * não é cenário — a raiz do núcleo que está em metade ou mais das perguntas
 * (com quatro ou mais) é cenário ("instagram", "clientes"). A pergunta sem
 * nenhuma raiz do núcleo continua: a investigação a ligou ao artigo por outro
 * caminho, e o export não tem base para tirá-la ("Quais são os tipos de acne?"
 * num artigo de skincare). A que só divide o cenário sai das perguntas e vai ao
 * "Não cobrir": para o artigo ou tópico do Silo cujas palavras próprias ela
 * traz (a mais rara entre os destinos vence; empate, o artigo), ou como outro
 * foco. Vale para qualquer marca, assunto e tipo de página.
 */
/*
 * 2026-10-09 · Defeito 4 · O DONO DE UM ASSUNTO SÓ É ARTIGO DO SILO. "pertence a
 * 'como fazer captação de clientes', outro tópico do Silo" (e WhatsApp,
 * "como conseguir mais clientes", "como captar pacientes", "trafego pago como
 * funciona") mandava a pergunta para uma keyword de "Tópicos incluídos" que
 * não é artigo — a ordem narrativa tem 8 artigos — e o assunto sumia de todo
 * lugar. O destino agora é só um ARTIGO membro do Silo (a ordem narrativa do
 * SiloDNA); sem artigo dono, a pergunta é deste artigo (pela régua do núcleo)
 * ou "outro foco". `destino` diz também o artigo, para a coluna estrutura.
 */
type DestinoDaPergunta = { linha: string; artigo: { rotulo: string; articleId: string } | null };
type FocoDasPerguntas = { doArtigo: (pergunta: string) => boolean; destino: (pergunta: string) => DestinoDaPergunta };

function focoDasPerguntas(p: Projecoes, contexto: RadarWritingArticleContext, perguntas: readonly string[]): FocoDasPerguntas {
  const nucleo = raizesDoNucleo(p);
  const raizesDe = (pergunta: string) => raizesDeEscrita(pergunta);
  const lidas = perguntas.map(raizesDe);
  const cenario = lidas.length >= 4 ? nucleo.filter(raiz => lidas.filter(raizes => temRaiz(raizes, raiz)).length / lidas.length >= 0.5) : [];

  const silo = contexto.silo?.kind === "silo" ? contexto.silo : null;
  const proprias = new Set(keywordsDoArtigo(p).map(radarWritingCompareKey));
  /*
   * 2026-10-09 (correção · contrato-F2) · cada membro entra pelo nome E pelas
   * keywords dele (`siloMemberKeywords`): a pergunta que é a complementar de
   * outro artigo do Silo tem nele o dono, com o nome do artigo na linha.
   */
  const alvos = unicosPorChave([
    ...(silo?.members || []).filter(membro => membro.articleId !== contexto.articleId).flatMap(membro => [rotuloDoMembro(membro), ...(contexto.siloMemberKeywords?.get(membro.articleId) || [])]
      .map(chave => ({ rotulo: rotuloDoMembro(membro), chave: texto(chave), articleId: membro.articleId }))),
  ], item => radarWritingCompareKey(item.chave))
    .filter(item => item.chave && !proprias.has(radarWritingCompareKey(item.chave)))
    .map(item => ({ ...item, todas: raizesDeEscrita(item.chave), proprias: raizesDeEscrita(item.chave).filter(raiz => !temRaiz(nucleo, raiz)) }))
    .filter(item => item.proprias.length);
  /*
   * 2026-10-08 (correção da revisão) · a pergunta que É a keyword de outro
   * artigo ou tópico do Silo ("Como atrair clientes pelo WhatsApp?", com o
   * tópico "como atrair clientes pelo whatsapp") pertence a ele, mesmo dividindo
   * duas raízes com o núcleo: ela traz as palavras próprias do destino e nenhuma
   * fora dele. "Como captar clientes pelo Instagram?" continua deste artigo — o
   * "instagram" não está em "como captar um cliente".
   * 2026-10-09 · Defeito 4 · só ARTIGO do Silo: o tópico sem artigo não é dono.
   */
  const ehDeOutroDoSilo = (pergunta: string) => {
    const daPergunta = raizesDe(pergunta);
    return daPergunta.length > 0 && alvos.some(alvo => alvo.proprias.every(raiz => temRaiz(daPergunta, raiz)) && daPergunta.every(raiz => temRaiz(alvo.todas, raiz)));
  };
  const doArtigo = (pergunta: string) => {
    if (ehDeOutroDoSilo(pergunta)) return false;
    const comuns = raizesDe(pergunta).filter(raiz => temRaiz(nucleo, raiz));
    /* 2026-10-09 (correção · contrato-F2) · a pergunta sem nada do núcleo deste artigo e com o assunto inteiro de outro artigo do Silo é dele ("Como conseguir mais clientes para minha empresa?" no artigo de captação de pacientes). */
    if (!comuns.length && alvos.some(alvo => alvo.proprias.every(raiz => temRaiz(raizesDe(pergunta), raiz)))) return false;
    return !comuns.length || comuns.length >= 2 || comuns.some(raiz => !temRaiz(cenario, raiz));
  };
  const raridade = (raiz: string) => 1 / Math.max(1, alvos.filter(alvo => temRaiz(alvo.proprias, raiz)).length);
  const principal = texto(p.dna.principalKeyword);
  const comComplementares = p.dna.secondaryKeywords.length + p.dna.narrativeReinforcements.length > 0;

  const destino = (pergunta: string): DestinoDaPergunta => {
    const daPergunta = raizesDe(pergunta);
    /* No empate, fica o primeiro na ordem narrativa. */
    let melhor: { alvo: typeof alvos[number]; nota: number } | null = null;
    for (const alvo of alvos) {
      if (!alvo.proprias.every(raiz => temRaiz(daPergunta, raiz))) continue;
      const nota = alvo.proprias.reduce((soma, raiz) => soma + raridade(raiz), 0);
      if (!melhor || nota > melhor.nota + 1e-9) melhor = { alvo, nota };
    }
    const dita = entreAspas(pergunta);
    if (melhor) {
      return { linha: `${dita}: pertence ao artigo ${entreAspas(melhor.alvo.rotulo)} do Silo; não responder aqui.`, artigo: { rotulo: melhor.alvo.rotulo, articleId: melhor.alvo.articleId } };
    }
    return { linha: `${dita}: outro foco; não trata de ${principal ? entreAspas(principal) : "a keyword principal"}${comComplementares ? " nem das complementares" : ""}.`, artigo: null };
  };
  return { doArtigo, destino };
}

/* "Conclusão", "Considerações finais": fecho da página, não diferencial. */
const EH_FECHO_DA_PAGINA = /^(?:conclusao|consideracoes finais|para finalizar|finalizando|em resumo|resumo final|resumindo)\b/;

/** 2026-10-08 · C6 · O diferencial do artigo, na ordem do desenho; `null` = nenhum (o movimento não existe). */
function diferencialDoArtigo(
  input: RadarPortableExportInput,
  p: Projecoes,
  contexto: RadarWritingArticleContext,
  tocaForaDoEscopo: (valor: string | null | undefined) => boolean,
): string | null {
  const nucleo = raizesDoNucleo(p);
  const cabecalhos = (input.competitorOutlines || []).flatMap(pagina => pagina.headings.filter(item => item.level === 2 || item.level === 3).map(item => raizesDeEscrita(item.text)));
  /* 1 · o que a página publicada já trata e os concorrentes lidos não tratam (o que a planta decidiu tirar não conta). */
  const atual = contexto.publication?.published ? contexto.publication.currentStructure ?? null : null;
  if (atual?.h2.length && cabecalhos.length) {
    const removidos = new Set(contexto.blueprint
      ? radarArticleBlueprintPublishedMapReading(contexto.blueprint, atual.h2, { keywords: keywordsDoArtigo(p) }).filter(item => item.kind === "REMOVED").map(item => radarWritingCompareKey(item.current))
      : []);
    const daPagina = unicosPorChave(atual.h2.map(item => radarWritingDecodeEntities(item).replace(/\s+/g, " ").trim()), radarWritingCompareKey)
      .filter(h2 => h2 && !EH_FAQ.test(h2) && !EH_FECHO_DA_PAGINA.test(radarWritingCompareKey(h2)) && !removidos.has(radarWritingCompareKey(h2)) && !tocaForaDoEscopo(h2) && !p.vetoDeSugestao?.(h2))
      .filter(h2 => {
        const proprias = raizesDeEscrita(h2).filter(raiz => !temRaiz(nucleo, raiz) && deAssunto(raiz));
        if (proprias.length < 2) return false;
        return !cabecalhos.some(outro => {
          const divididas = proprias.filter(raiz => temRaiz(outro, raiz)).length;
          return divididas >= 2 || divididas / proprias.length >= 0.5;
        });
      })
      .slice(0, 3);
    if (daPagina.length) {
      return `Diferencial da página publicada: ela já trata o que os concorrentes lidos não tratam — ${daPagina.map(item => entreAspas(cortar(item, 80))).join("; ")}. Isso fica na atualização, reescrito na voz (o destino de cada H2 está na coluna artigo).`;
    }
  }
  /* 2 · o tema de uma página só que serve ao leitor: toca uma seção da planta (2026-10-09 · só da planta: a estrutura legada saiu). */
  const leituraDosTemas = radarWritingCompetitorTopicsOf(input, p);
  const unicos = (leituraDosTemas?.topics || []).filter(item => item.pages < 2);
  const baseDosTemas = leituraDosTemas?.naBaseUnica ? p.base : null;
  if (unicos.length && contexto.blueprint) {
    /* O título e os H3 da seção dizem o assunto dela (peso 2); a resposta e o "Explicar", o que ela desenvolve (peso 1). */
    const secoes = contexto.blueprint.blueprint.sections.map(secao => ({ titulo: secao.h2, nome: raizesDeEscrita([secao.h2, ...secao.h3].join(" ")), corpo: raizesDeEscrita([secao.readerQuestion, secao.answerFirst, ...secao.explain].join(" ")) }));
    for (const tema of unicos) {
      /*
       * 2026-10-09 · Defeitos 3(c), 5 e 6 · o diferencial possível nunca sugere
       * item do "Não cobrir" nem exclusão da voz da marca ("Como identificar leads
       * qualificados" ao lado da nota que o põe fora), nem a própria keyword.
       */
      if (p.vetoDeSugestao?.(tema.label) || tema.headings.some(cabecalho => p.vetoDeSugestao?.(cabecalho)) || radarSuggestionRestatesKeyword(tema.label, keywordsDoArtigo(p))) continue;
      const proprias = raizesDeEscrita([tema.label, ...tema.headings].join(" ")).filter(raiz => !temRaiz(nucleo, raiz) && deAssunto(raiz));
      if (proprias.length < 2) continue;
      const notas = secoes.map(item => proprias.reduce((soma, raiz) => soma + (temRaiz(item.nome, raiz) ? 2 : temRaiz(item.corpo, raiz) ? 1 : 0), 0));
      const melhor = Math.max(0, ...notas);
      const secao = melhor > 0 ? secoes[notas.indexOf(melhor)] : null;
      /*
       * 2026-10-08 · P1 · a recorrência dos temas conta SITES (`competitor-topics.ts`).
       * 2026-10-09 · Defeito 2 · sobre a BASE ÚNICA, dita em sites e páginas ("um só site entre os 20 sites das 23 páginas comparáveis").
       */
      const amostra = baseDosTemas ? `os ${baseDosTemas.sites} ${baseDosTemas.sites === 1 ? "site" : "sites"} das ${baseDosTemas.size} páginas comparáveis` : `as ${tema.sampleSize} páginas comparáveis`;
      if (secao) return `Diferencial possível: ${entreAspas(tema.label)}, tratado por um só site entre ${amostra} — aprofunde na seção ${entreAspas(secao.titulo)}, sem copiar o cabeçalho do concorrente.`;
    }
  }
  return null;
}

/*
 * 2026-10-09 · AS LACUNAS (G) E OS DIFERENCIAIS (D) DA SERP QUE A PLANTA
 * ASSUMIU: os ids G e D que cada seção cita (em `evidence` ou `from`), com o
 * texto que a IA viu sem o "(N de M páginas…)" — a contagem fica na SERP
 * resumida e na estrutura, pela base única. Na ordem da planta, sem repetir.
 */
function lacunasDaPlanta(planta: RadarArticleBlueprintPayload | null): Array<{ tipo: "G" | "D"; rotulo: string; secao: string }> {
  if (!planta) return [];
  const textoDe = new Map((planta.evidence || []).map(item => [item.id, item.text]));
  const vistos = new Set<string>();
  const saida: Array<{ tipo: "G" | "D"; rotulo: string; secao: string }> = [];
  for (const secao of planta.blueprint.sections) {
    for (const id of [...(secao.evidence || []), ...(secao.from || [])]) {
      const tipo = /^G\d/i.test(id) ? "G" : /^D\d/i.test(id) ? "D" : null;
      const dito = tipo ? textoDe.get(id) : undefined;
      if (!tipo || !dito) continue;
      const semContagem = radarWritingDecodeEntities(dito).replace(/\s*\([^()]*p[áa]ginas?[^()]*\)\s*$/i, "").trim();
      /* A lacuna dita como frase ("O ArticleDNA declara 'X' e…") vale pelo assunto entre aspas. */
      const rotulo = (/["“]([^"”]+)["”]/.exec(semContagem)?.[1] || semContagem).trim();
      const chave = radarWritingCompareKey(rotulo);
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ tipo, rotulo, secao: secao.h2 });
    }
  }
  return saida;
}

/** 2026-10-08 · C6 · Sem outro diferencial: a entrega concreta que a planta pede (B6), quando ela a diz. */
function entregaDaPlanta(planta: RadarArticleBlueprintPayload | null): string | null {
  const secao = planta?.blueprint.sections.find(item => texto(item.practical));
  return secao ? `Entrega concreta da planta: ${semPontoFinal(texto(secao.practical))} (seção ${entreAspas(secao.h2)}).` : null;
}

/*
 * ===== 2026-10-08 · AS PERGUNTAS DA LINHA, ANTES DA ESTRUTURA =====
 *
 * As perguntas a responder e as que vão ao "Não cobrir" (outro artigo ou
 * tópico do Silo, outro foco) saíam no fim da coluna cobrir_e_superar, depois
 * da estrutura pronta. A régua única do "não cobrir" (P0-B) precisa delas
 * ANTES: a pergunta que a coluna manda para outro artigo não pode ficar como
 * ponto a cobrir da estrutura.
 */
type PerguntasDaLinha = {
  /** As linhas "- pergunta (prioridade…)" a responder dentro das seções. */
  linhas: string[];
  /** As linhas do "Não cobrir" das perguntas de outro foco. */
  foraDoFoco: string[];
  /** As mesmas perguntas, cruas, para a régua do mesmo item. */
  foraDoFocoPerguntas: string[];
  /** 2026-10-09 · Defeito 3(b) · as mesmas, com o artigo do Silo que é dono (null = outro foco). */
  foraDoFocoItens: Array<{ pergunta: string; linha: string; artigo: { rotulo: string; articleId: string } | null }>;
};

/*
 * 2026-10-02 · NENHUMA LISTA DA COLUNA cobrir_e_superar leva fecho retórico de
 * concorrente nem texto que toca o "não cobrir". 2026-10-08 · P1 · nem o ruído
 * de pesquisa: newsletter, inglês, encerramento, loja ou cupom fora do leitor,
 * outra profissão, produto de concorrente, título de post.
 */
const descartavelNaPesquisa = (p: Projecoes, tocaForaDoEscopo: (valor: string | null | undefined) => boolean) =>
  (valor: string | null | undefined): boolean => !texto(valor) || radarWritingRhetoricalQuestion(texto(valor)) || tocaForaDoEscopo(valor)
    || radarReaderQuestionIsNoise(valor, p.ruido) || radarEditorialHeadingNoiseReason(valor, p.ruido) !== null;

function perguntasDaLinha(
  p: Projecoes,
  contexto: RadarWritingArticleContext,
  perguntaDeAbertura: string | null,
  tocaForaDoEscopo: (valor: string | null | undefined) => boolean,
  /*
   * 2026-10-09 · aditivos: `vetar`, a guarda das sugestões (defeitos 3c e 5: a
   * pergunta que toca item do "Não cobrir" ou exclusão da voz não é sugerida);
   * `cobertaPelaReferencia`, a régua 3(a): a pergunta de "outro foco" que a
   * estrutura de referência (o artigo-modelo ou a página publicada) já trata
   * não vai ao "Não cobrir" — a referência vence, e ela já está na estrutura.
   */
  vetar: ((valor: string | null | undefined) => unknown) | null = null,
  cobertaPelaReferencia: ((valor: string) => boolean) | null = null,
): PerguntasDaLinha {
  const descartarNaPesquisa = descartavelNaPesquisa(p, tocaForaDoEscopo);
  const descartar = (valor: string | null | undefined) => descartarNaPesquisa(valor) || Boolean(vetar?.(valor));
  const naoProntas = new Set((p.descoberta?.answerableUnits || []).filter(unidade => unidade.readiness !== "READY").map(unidade => radarWritingCompareKey(unidade.questionOrNeed)));
  const semFonte = new Set(radarWritingUnsupportedClaims(p.autoridade, p.serp).map(item => radarWritingCompareKey(item.afirmacao)));
  const jaNaEstrutura = new Set(p.secoes.flatMap(secao => [radarWritingCompareKey(secao.readerQuestion), radarWritingCompareKey(secao.heading)]).filter(Boolean));
  /*
   * 2026-10-08 · C7 · com o artigo-modelo, a abertura e as seções são as DELE:
   * a pergunta que a planta já responde não se repete aqui, e a "pergunta de
   * abertura" do export (que a planta não usa) volta para a lista.
   */
  const planta = contexto.blueprint?.blueprint;
  if (planta) for (const pergunta of [planta.opening.readerQuestion, ...planta.sections.map(secao => secao.readerQuestion)]) jaNaEstrutura.add(radarWritingCompareKey(pergunta));
  else jaNaEstrutura.add(radarWritingCompareKey(perguntaDeAbertura));
  /*
   * 2026-10-08 (correção da revisão) · a pergunta que a planta usa como
   * EVIDÊNCIA de uma seção ou da abertura (G1 "Como captar clientes pela
   * internet?" na seção 5 do caso real) também já está na estrutura: ela não
   * se repete nas perguntas a responder e nunca vai ao "Não cobrir" — o mesmo
   * tema não pode ser obrigatório na estrutura e proibido aqui.
   */
  if (planta && contexto.blueprint) {
    const textoDaEvidencia = new Map((contexto.blueprint.evidence || []).map(item => [item.id, item.text]));
    for (const id of [...(planta.opening.evidence || []), ...planta.sections.flatMap(secao => secao.evidence || [])]) {
      const dita = /^[PGDO]\d/i.test(id) ? textoDaEvidencia.get(id) : undefined;
      if (dita) jaNaEstrutura.add(radarWritingCompareKey(dita.replace(/\s*\([^()]*p[áa]ginas?[^()]*\)\s*$/i, "")));
    }
  }
  const candidatas = [
    ...(p.descoberta?.questionCoverageRequirements || [])
      .slice().sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.priority] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority] ?? 3))
      .map(item => ({ pergunta: item.question, prioridade: PRIORIDADE[item.priority] || null })),
    ...p.serp.questions.filter(item => STATUS_DE_PERGUNTA.has(item.status)).sort((a, b) => b.pages - a.pages)
      .map(item => ({ pergunta: item.question, prioridade: null as string | null })),
  ].map(item => ({ ...item, pergunta: semCaixaAlta(radarWritingDecodeEntities(item.pergunta).replace(/\s+\?/g, "?").trim()) }));
  const elegiveis = unicosPorChave(candidatas, item => radarWritingCompareKey(item.pergunta))
    .filter(item => !jaNaEstrutura.has(radarWritingCompareKey(item.pergunta)) && !descartar(item.pergunta) && !EH_FAQ.test(item.pergunta));
  /* 2026-10-08 · C7 · só a pergunta DESTE artigo; a que só divide o cenário vai ao "Não cobrir", com o destino. */
  const foco = focoDasPerguntas(p, contexto, elegiveis.map(item => item.pergunta));
  /* 2026-10-09 · Defeito 3(a) · o "outro foco" que a estrutura de referência trata sai do "Não cobrir"; o de outro ARTIGO do Silo fica (3b). */
  const deOutroFoco = elegiveis.filter(item => !foco.doArtigo(item.pergunta))
    .map(item => ({ ...item, destino: foco.destino(item.pergunta) }))
    .filter(item => item.destino.artigo || !cobertaPelaReferencia?.(item.pergunta));
  return {
    linhas: elegiveis.filter(item => foco.doArtigo(item.pergunta))
      .slice(0, RADAR_WRITING_EXPORT_LIMITS.questions)
      .map(item => {
        const chave = radarWritingCompareKey(item.pergunta);
        const insuficiente = naoProntas.has(chave) || semFonte.has(chave) || semFonte.has(chave.replace(/\s*$/, ""));
        const marcas = [item.prioridade, insuficiente ? "material insuficiente: responder de forma qualificada ou só com fonte" : null].filter(Boolean);
        return `- ${item.pergunta}${marcas.length ? ` (${marcas.join("; ")})` : ""}`;
      }),
    foraDoFoco: deOutroFoco.map(item => item.destino.linha),
    foraDoFocoPerguntas: deOutroFoco.map(item => item.pergunta),
    foraDoFocoItens: deOutroFoco.map(item => ({ pergunta: item.pergunta, linha: item.destino.linha, artigo: item.destino.artigo })),
  };
}

/*
 * ===== 2026-10-08 · P1 · A INTENÇÃO DA SERP CONTRA A DECLARADA =====
 *
 * A SERP de "promoções estética" é de consumidor (cupom, compra coletiva) e o
 * artigo é para a clínica. O CSV dizia "Explicar a divergência que o mercado
 * repete sem resolver: O que o mercado repete sobre 'Intenção de busca'…" —
 * instrução para o texto de um assunto que não é do texto. A divergência de
 * intenção é decisão do Arquiteto (trocar a principal ou manter): fica dita
 * como ressalva, sem bloquear, e o texto segue a intenção e o leitor declarados.
 */
function divergenciaDeIntencao(input: RadarPortableExportInput): string | null {
  const conflitos = input.googleObserved?.conflicts ?? [];
  const conflito = conflitos.find(item => item.dimension === "intent");
  if (!conflito) return null;
  const principal = texto(input.article.principalKeyword);
  const leitor = util(input.article.audience);
  const declarada = texto(conflito.articleSide) || intencaoLegivel(input.article.intent) || "a declarada";
  const observada = texto(conflito.observedSide);
  /*
   * 2026-10-08 (correção) · a ressalva vale para todo conflito de intenção
   * (informacional × comercial, nos dois sentidos): "página de consumidor" só
   * quando o lado observado é comercial ou de consumidor; senão, "as páginas da
   * SERP".
   */
  const deConsumidor = /comerci|transac|consumid|compra|loja|cupo|ofert|promo|produto/i.test(observada);
  return `a SERP de ${principal ? entreAspas(principal) : "a keyword principal"} responde a outra intenção${observada ? ` (${semPontoFinal(observada)})` : ""} e o ArticleDNA declara ${semPontoFinal(declarada)}${leitor ? ` para ${semPontoFinal(leitor).charAt(0).toLowerCase()}${semPontoFinal(leitor).slice(1)}` : ""}: trocar a principal ou a intenção é decisão do Arquiteto; escreva pela intenção e pelo leitor declarados, sem copiar ${deConsumidor ? "a página de consumidor" : "as páginas da SERP"}`;
}

/*
 * ===== 2026-10-09 · DEFEITOS 3, 5 E 14 · O "NÃO COBRIR" DA LINHA, ANTES DA ESTRUTURA =====
 *
 * Os CSVs de 09/10 se contradiziam: a planta de leads mede "custo por lead" e
 * o "Não cobrir" proibia "Custo por Lead (CPL)"; a planta de captar tem "Defina
 * o perfil do seu cliente ideal", "…na primeira abordagem" e "Ferramentas e
 * próximos passos", e o "Não cobrir" proibia ICP, primeira abordagem,
 * ferramentas e o captador. Decisão do dono: todos seguem o artigo-modelo.
 *
 *   (a) o item GENÉRICO ("O ArticleDNA não declara…", "outro foco") que a
 *       estrutura de referência (o artigo-modelo ou, sem ele, a página
 *       publicada) trata SAI do "Não cobrir": a referência vence;
 *   (b) o item de OUTRO ARTIGO do Silo continua fora; se a referência o toca,
 *       a seção diz "só mencione e linke para <artigo>";
 *   (c) nenhuma sugestão ("Diferencial possível", "Sustentar…", "Diferenciar
 *       em", lacunas, temas, perguntas, termos) sugere item do "Não cobrir" nem
 *       exclusão da voz da marca (`radarSuggestionGuard`, régua do agente R).
 *
 * "Trata" é a régua única do "não cobrir" (`radarOutOfScopeMatcher`) aplicada a
 * cada texto da referência (título, pergunta, resposta, H3, "Explicar", termos
 * e negritos da planta; os H2 da página), mais o mesmo item e a sigla numerada
 * ("4 Ps", "7 Ps": as palavras curtas que a régua de raízes não vê).
 */
type NaoCobrirDaLinha = {
  /** Os rótulos fora do escopo do pacote que ficam (a referência não os trata). */
  foraDoEscopo: RadarPortableSerpEvidence["editorialCandidates"];
  /** As exclusões da voz da marca. */
  voz: readonly RadarBrandVoiceExclusion[];
  /** 2026-10-09b · As exclusões dos reajustes no ArticleDNA (duras; a planta não as libera). */
  dna?: readonly RadarResearchScopeExclusion[];
};

/* A sigla numerada de um texto ("4 ps", "7 p"): número seguido de palavra curta que não é vazia. */
const siglasNumeradas = (valor: string | null | undefined): string[] =>
  [...radarWritingCompareKey(valor).matchAll(/\b(\d+)\s+([a-z]{1,3})\b/g)]
    .filter(achado => !VAZIAS.has(achado[2]) && !RADAR_WRITING_FUNCTION_WORDS.has(achado[2]))
    .map(achado => `${achado[1]} ${achado[2]}`);
const mesmaSiglaNumerada = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const deA = siglasNumeradas(a);
  return deA.length > 0 && siglasNumeradas(b).some(sigla => deA.includes(sigla));
};

/* O molde do modelo editorial ("… na prática", "… no dia a dia") não é assunto: fora dele, o rótulo alcança o texto. */
const semMoldeDoRotulo = (rotulo: string) => rotulo.replace(/\s+(?:no dia a dia|na pr[aá]tica)\b/gi, "").trim() || rotulo;

/**
 * 2026-10-09 (correção) · A ESTRUTURA DE REFERÊNCIA, com os TÍTULOS à parte (H2,
 * pergunta do leitor, H3, termos e negritos da planta; os H2 da página
 * publicada): o rótulo de uma palavra distintiva só é tratado quando ela está
 * num título — no "Explicar" ela aparece de passagem ("A personalização FAZ o
 * cliente se sentir único", "o guru VENDE frequência"). Exportada para o brief do
 * artigo-modelo aplicar a mesma regra 3(a) que o CSV (casos-reais-F9).
 */
export function radarWritingReferenceTexts(
  planta: Pick<RadarArticleBlueprintPayload, "blueprint"> | null,
  publicada: { h1: string | null; h2: readonly string[] } | null,
): { textos: string[]; titulos: string[] } {
  if (planta) {
    const b = planta.blueprint;
    const titulos = [
      b.opening?.readerQuestion,
      ...(b.sections || []).flatMap(secao => [secao.h2, secao.readerQuestion, ...(secao.h3 || []), ...(secao.terms || []), ...(secao.bold || [])]),
    ].map(item => texto(item)).filter(Boolean);
    const textos = [
      b.opening?.readerQuestion,
      ...(b.sections || []).flatMap(secao => [secao.h2, secao.readerQuestion, secao.answerFirst, ...(secao.h3 || []), ...(secao.explain || []), ...(secao.terms || []), ...(secao.bold || [])]),
    ].map(item => texto(item)).filter(Boolean);
    return { textos, titulos };
  }
  const h2 = (publicada?.h2 || []).map(item => radarWritingDecodeEntities(texto(item))).filter(item => item && !EH_FAQ.test(item));
  return { textos: h2, titulos: h2 };
}

/*
 * 2026-10-09 · Defeito 3(a) · A REFERÊNCIA TRATA O RÓTULO? Texto a texto: o mesmo
 * item, a sigla numerada ou as raízes que DISTINGUEM o rótulo (as do núcleo, os
 * verbos de abertura e as palavras de formato saem — a régua de
 * `out-of-scope.ts`), com o radical largo ("abordar" e "abordagem",
 * "prospectar" e "prospecção"). Mais exigente que o "não cobrir": duas raízes
 * (ou a única, quando o rótulo só tem uma) e metade ou mais delas — "Como chamar
 * a atenção no Instagram?" não sai só porque a planta diz "a atenção no feed".
 * A sigla entre parênteses é apelido: "Custo por Lead (CPL)" é "custo por lead".
 *
 * 2026-10-09 (correção) · as réguas do 3(a) e da guarda das sugestões ficavam
 * assimétricas, e a raiz única casava de passagem:
 *   - palavra de modo ou de função não distingue ("da forma CERTA", "QUEM é
 *     responsável", "de maneira eficaz"): "Como prospectar clientes da forma
 *     certa" ficava no "Não cobrir" com a planta inteira sobre prospecção;
 *   - o substantivo de agente ("captador") não some no núcleo ("captar"): ele é
 *     o assunto do rótulo, não a keyword;
 *   - com UMA raiz distintiva, ela precisa estar num TÍTULO da referência, e
 *     verbo comum (faz, vende, quer) nunca basta sozinho: "O que fazer para
 *     vender muito no Instagram?" saía pelo H3 "O guru vende frequência";
 *   - com mais de uma, a metade basta quando casa num título (a mesma metade
 *     com que a guarda veta a sugestão); fora dos títulos, duas e a metade.
 */
const prefixoComum = (a: string, b: string) => {
  let comum = 0;
  while (comum < Math.min(a.length, b.length) && a[comum] === b[comum]) comum += 1;
  return comum;
};
const raizParecida = (a: string, b: string) => a === b || prefixoComum(a, b) >= Math.max(5, Math.min(a.length, b.length) - 3);
const MODO_OU_FUNCAO = [
  "quem", "certa", "certo", "certas", "certos", "correta", "correto", "maneira", "maneiras", "jeito", "jeitos", "eficaz", "eficazes",
  "eficiente", "eficientes", "rapido", "rapida", "facil", "faceis", "simples", "realmente", "sempre", "bem", "certeira", "certeiro",
];
let raizesDeModo: ReadonlySet<string> | null = null;
/* Calculado na primeira chamada: nada roda no carregamento do módulo. */
const modoOuFuncao = () => (raizesDeModo ??= new Set(MODO_OU_FUNCAO.flatMap(palavra => radarOutOfScopeDistinctiveStems(palavra, [])).concat(MODO_OU_FUNCAO)));
/* O substantivo de agente ("captador", "vendedora"): o assunto, não a keyword. */
const AGENTE = /dor(?:a|es|as)?$/;
/* O verbo comum que, sozinho, não diz assunto. */
const VERBO_COMUM = /^(?:faz|fazem|fac|vend(?:e|em|er)?$|quer|querem|ter$|tem$|usa$|usam$|usar$|ser$|sao$|esta$|pode|deve|precis|dar$|da$|vai$|ver$|ganh)/;

/** 2026-10-09 (correção) · A régua 3(a) exportada: a referência (textos e títulos) trata o rótulo genérico do "Não cobrir"? */
export function radarWritingReferenceTreats(
  referencia: { textos: readonly string[]; titulos?: readonly string[] },
  nucleo: ReadonlyArray<string | null | undefined>,
): (rotulo: string) => boolean {
  const textos = referencia.textos;
  if (!textos.length) return () => false;
  const lidos = textos.map(item => ({ texto: item, raizes: radarOutOfScopeDistinctiveStems(item, []) }));
  const deTitulo = (referencia.titulos ?? textos).map(item => radarOutOfScopeDistinctiveStems(item, []));
  /* O núcleo pelo MESMO radical largo: "qualificar" não distingue num artigo de "leads qualificados". */
  const doNucleo = radarOutOfScopeDistinctiveStems(nucleo.filter(Boolean).join(" "), []);
  const modo = modoOuFuncao();
  return rotulo => {
    if (lidos.some(({ texto: lido }) => radarWritingSameItem(lido, rotulo) || mesmaSiglaNumerada(rotulo, lido))) return true;
    const distintivas = radarOutOfScopeDistinctiveStems(semMoldeDoRotulo(rotulo.replace(/\s*\([^()]*\)\s*/g, " ").trim()), nucleo)
      .filter(raiz => !modo.has(raiz))
      .filter(raiz => AGENTE.test(raiz) || !doNucleo.some(outra => raizParecida(raiz, outra)));
    if (!distintivas.length) return false;
    /* O agente só casa com agente: "captador" não é "captar" do título "Como captar clientes". */
    const parecida = (raiz: string, outra: string) => (AGENTE.test(raiz) ? AGENTE.test(outra) && raizParecida(raiz, outra) : raizParecida(raiz, outra));
    const casa = (raizes: readonly string[]) => distintivas.filter(raiz => raizes.some(outra => parecida(raiz, outra))).length;
    if (distintivas.length === 1) {
      if (VERBO_COMUM.test(distintivas[0])) return false;
      if (deTitulo.some(raizes => casa(raizes) === 1)) return true;
      /* Fora dos títulos, só a EXPRESSÃO inteira do rótulo ("custo por lead" na resposta que manda medir custo por lead), nunca a palavra solta. */
      const expressao = radarWritingCompareKey(semMoldeDoRotulo(rotulo.replace(/\s*\([^()]*\)\s*/g, " ")))
        .replace(/^(?:o que|como|quais?|por que|quando|onde|vale a pena)\s+/, "").trim();
      return expressao.split(" ").length >= 2 && lidos.some(({ texto: lido }) => radarWritingCompareKey(lido).includes(expressao));
    }
    const metade = Math.ceil(distintivas.length / 2);
    return deTitulo.some(raizes => casa(raizes) >= metade) || lidos.some(({ raizes }) => casa(raizes) >= Math.max(2, metade));
  };
}

function referenciaTrata(textos: readonly string[], nucleo: ReadonlyArray<string | null | undefined>, titulos?: readonly string[]): (rotulo: string) => boolean {
  return radarWritingReferenceTreats({ textos, titulos }, nucleo);
}

/**
 * 2026-10-09 · Os diferenciais do pacote que tocam o "Não cobrir" (os mesmos
 * que `colunaCobrir` resolve na nota): também não podem voltar como sugestão.
 */
function diferenciaisForaDoEscopo(p: Projecoes, tocaForaDoEscopo: (valor: string | null | undefined) => boolean): string[] {
  const doBlueprint = diferenciaisRecomendados(p).slice(0, 2).map(item => item.statement.match(/["“]([^"”]+)["”]/)?.[1] || item.statement);
  return [...doBlueprint, ...diferenciaisObservados(p).slice(0, 3).map(item => item.subject)].filter(item => tocaForaDoEscopo(item));
}

/*
 * 2026-10-09 · Defeito 6 · os diferenciais do pacote sem os que só repetem a
 * principal ou uma complementar ("Sustentar 'como atrair um cliente' como
 * diferencial"): sustentar a própria keyword não é diferencial. Sem eles, o
 * corte em dois (ou três) fica com os diferenciais de verdade.
 */
const citadoNoDiferencial = (statement: string) => statement.match(/["“]([^"”]+)["”]/)?.[1] || statement;
function diferenciaisRecomendados(p: Projecoes) {
  if (p.blueprint?.profile !== "GOOGLE") return [];
  const keywords = keywordsDoArtigo(p);
  return p.blueprint.recommended.differentiation.filter(item => !radarSuggestionRestatesKeyword(citadoNoDiferencial(item.statement), keywords));
}
function diferenciaisObservados(p: Projecoes) {
  const keywords = keywordsDoArtigo(p);
  return p.serp.differentiations.filter(item => !radarSuggestionRestatesKeyword(item.subject, keywords));
}

/**
 * 2026-10-09 · Defeitos 3(c) e 5 · A GUARDA DAS SUGESTÕES DA LINHA: a régua do
 * agente R (`radarSuggestionGuard`: a voz primeiro, depois os rótulos do "Não
 * cobrir", pelo assunto entre aspas) e, para as perguntas mandadas a outro
 * artigo ou foco, o MESMO ITEM (a régua de metade das raízes pegaria demais
 * numa pergunta); a sigla numerada vale para todos.
 */
export function radarWritingSuggestionVeto(input: {
  labels: ReadonlyArray<string | null | undefined>;
  questions?: ReadonlyArray<string>;
  core: ReadonlyArray<string | null | undefined>;
  voice?: ReadonlyArray<RadarBrandVoiceExclusion>;
}): (sugestao: string | null | undefined) => RadarSuggestionVeto | null {
  const guarda = radarSuggestionGuard({ labels: input.labels, core: input.core, voice: input.voice });
  const rotulos = input.labels.map(item => texto(item)).filter(Boolean);
  const perguntas = (input.questions || []).map(item => texto(item)).filter(Boolean);
  return sugestao => {
    const veto = guarda(sugestao);
    if (veto) return veto;
    const valor = texto(sugestao);
    const assunto = valor.match(/["“]([^"”]+)["”]/)?.[1]?.trim() || valor;
    if (!assunto) return null;
    const pergunta = perguntas.find(item => radarWritingSameItem(item, assunto) || mesmaSiglaNumerada(item, assunto));
    if (pergunta) return { kind: "NAO_COBRIR", label: pergunta };
    const sigla = rotulos.find(item => mesmaSiglaNumerada(item, assunto));
    return sigla ? { kind: "NAO_COBRIR", label: sigla } : null;
  };
}

/*
 * ===== 2026-10-09 · "COBRIR E SUPERAR" PELA PLANTA (regra do dono: o piloto substitui o processo antigo) =====
 *
 * Com o artigo-modelo, a coluna ainda trazia o "Como superar" do blueprint
 * competitivo legado ("Sustentar 'X' como diferencial", "Explicar a divergência
 * que o mercado repete…", "Já coberto pela maioria…", "Comparar por…") e as
 * lacunas e diferenciais da SERP que a planta NÃO assumiu ("Cobrir 'X': N de M
 * concorrentes tratam…", "Diferenciar em 'Y'…") — instruções ao lado da planta,
 * às vezes contra ela. Esse material é ENTRADA do gerador do artigo-modelo (G, D
 * e o esqueleto M já foram à IA); aqui fica o que a planta decidiu:
 *   - a abertura é a da planta (remissão);
 *   - o diferencial da página publicada e o tema de um site só, ancorados numa
 *     seção da planta (como antes);
 *   - as lacunas (G) e diferenciais (D) da SERP que a planta assumiu, com a
 *     seção onde ela os cobre;
 *   - sem nada disso, a entrega concreta da planta;
 *   - os sinais de E-E-A-T, as perguntas a responder dentro das seções, os
 *     termos a nomear e o "Não cobrir" (pacote, Silo, voz da marca e, desde
 *     2026-10-09b, as exclusões dos reajustes no ArticleDNA).
 */
function colunaCobrir(
  input: RadarPortableExportInput,
  p: Projecoes,
  contexto: RadarWritingArticleContext,
  tocaForaDoEscopo: (valor: string | null | undefined) => boolean = radarWritingOutOfScope(p, contexto.silo?.excludedTopics || []),
  /* 2026-10-08 · P0-B · as perguntas calculadas antes da estrutura (a régua única do "não cobrir"); sem elas, calculadas aqui. */
  perguntasProntas: PerguntasDaLinha | null = null,
  /* 2026-10-09 · Defeitos 3 e 5 · o "Não cobrir" da linha, montado antes da estrutura (a referência vence o item genérico; a voz exclui). */
  naoCobrirDaLinha: NaoCobrirDaLinha | null = null,
): { celula: string; conflitos: string[] } {
  /* Só conflito que pede DECISÃO HUMANA vai ao veredito por aqui; o que o export resolve vira nota (2026-10-02). */
  const conflitos: string[] = [];
  /* 2026-10-09 · Defeito 2 · a amostra é a base única (o mesmo M da lista impressa e dos temas); sem base, a do modelo. */
  const amostra = p.base?.size || p.serp.sample?.comparablePages || (p.blueprint?.profile === "GOOGLE" ? p.blueprint.observed.comparablePages : 0) || 0;
  const maioria = Math.max(2, Math.ceil(amostra / 2));
  /* Um "N de M" sobre a base: recontado pelas URLs que o sustentam quando a fotografia diverge; sem como recontar, sem contagem. */
  const naBase = (pages: number, sampleSize: number, urls: ReadonlyArray<string> | null = null) => radarSampleBasisFraction(p.base, { pages, sampleSize, urls });
  const vetar = p.vetoDeSugestao;
  const keywords = keywordsDoArtigo(p);
  /* 2026-10-09 · Defeitos 3(c), 5 e 6 · a sugestão que toca o "Não cobrir" ou a voz, ou que só repete a própria keyword, não é movimento. */
  const sugestaoDescartada = (assunto: string) => Boolean(vetar?.(assunto)) || Boolean(radarSuggestionRestatesKeyword(assunto, keywords));
  /* 2026-10-09 · Defeito 3(a) · com o "Não cobrir" da linha, só os rótulos que a estrutura de referência (a planta) não trata. */
  const foraDoEscopo = naoCobrirDaLinha?.foraDoEscopo ?? p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE");
  const voz = naoCobrirDaLinha?.voz ?? [];
  const planta = contexto.blueprint ?? null;
  /*
   * 2026-10-02 · NENHUMA LISTA DESTA CÉLULA leva fecho retórico de concorrente
   * nem texto que toca o "não cobrir" (antes: só igualdade de rótulo, e só a
   * abertura tirava a retórica). Vale para movimentos, perguntas, termos e o
   * "já coberto pela maioria". 2026-10-08 · P1 · nem ruído de pesquisa.
   */
  const descartar = descartavelNaPesquisa(p, tocaForaDoEscopo);
  /*
   * 2026-10-09 · O CONFLITO COM O ArticleDNA CONTINUA NO VEREDITO. Saíram os
   * movimentos de diferencial da SERP (a planta decide o que assume, e o que é
   * só da SERP fora do escopo o "não cobrir" resolve, sem lista a conciliar);
   * ficou a régua de 2026-10-02: o diferencial fora do escopo que o ArticleDNA
   * DECLARA, ou que toca um ponto que ele exige (`mustCover`), é decisão humana
   * (Radar ou Arquiteto) — o diagnóstico do Radar não o muda em silêncio.
   */
  const conflitosComODna = new Map<string, string>();
  const origemPorAssunto = new Map(p.serp.differentiations.map(item => [radarWritingCompareKey(item.subject), item.basis]));
  const obrigatoriosDoDna = new Set(p.dna.mustCover.map(radarWritingCompareKey).filter(Boolean));
  const diferencialForaDoEscopo = (assunto: string, origem: string | undefined) => {
    const chave = radarWritingCompareKey(assunto);
    const declara = (origemPorAssunto.get(chave) ?? origem) === "ARTICLE_DECLARES";
    const tocaOAssunto = radarWritingOutOfScopeMatcher({ labels: [assunto], core: nucleoDoArtigo(p) });
    const exige = !declara && (obrigatoriosDoDna.has(chave) || p.dna.mustCover.some(item => tocaOAssunto(item)));
    if ((!declara && !exige) || conflitosComODna.has(chave)) return;
    const rotulo = entreAspas(radarWritingDecodeEntities(assunto));
    conflitosComODna.set(chave, declara
      ? `o ArticleDNA declara ${rotulo} como diferencial e o pacote do Radar o marca como fora do escopo: cabe decisão humana (Radar ou Arquiteto), e o diagnóstico do Radar não muda o DNA; neste texto, não o sustente como diferencial`
      : `o ArticleDNA exige um ponto ligado a ${rotulo}, que o pacote do Radar marca como fora do escopo e também como diferencial: cabe decisão humana (Radar ou Arquiteto); neste texto, cubra o que o ArticleDNA exige, sem sustentá-lo como diferencial`);
  };
  if (p.blueprint?.profile === "GOOGLE") {
    for (const item of p.blueprint.recommended.differentiation.slice(0, 2)) {
      const citado = item.statement.match(/["“]([^"”]+)["”]/)?.[1] || "";
      if (citado ? tocaForaDoEscopo(citado) : tocaForaDoEscopo(item.statement)) {
        diferencialForaDoEscopo(citado || item.statement, /fundamento prometeu/i.test(item.objective) ? "ARTICLE_DECLARES" : "SERP_EVIDENCE");
      }
    }
  }
  for (const item of p.serp.differentiations.slice(0, 3)) {
    if (tocaForaDoEscopo(item.subject)) diferencialForaDoEscopo(item.subject, item.basis);
  }
  conflitos.push(...conflitosComODna.values());

  /* ---- como superar a SERP: o que a planta decidiu ---- */
  const movimentos: string[] = [];
  /*
   * 2026-10-02 · COM O ARTIGO-MODELO, A ABERTURA É A DELE. Duas aberturas no
   * mesmo arquivo (a da planta e a desta coluna) davam ordens contraditórias a
   * quem escreve; aqui fica só a remissão. 2026-10-09 · a pergunta de abertura
   * calculada pelo export (sem planta) não vai mais ao entregável.
   */
  if (planta) movimentos.push("Abertura: a do artigo-modelo (coluna estrutura); as perguntas abaixo entram nas seções.");
  /*
   * 2026-10-08 · C6 · O DIFERENCIAL, NUNCA A COSTURA DO QUE A MAIORIA JÁ COBRE:
   * o que a página publicada já trata e a amostra não trata; o tema de um site
   * só que serve ao leitor (ancorado numa seção da planta).
   */
  const diferencial = diferencialDoArtigo(input, p, contexto, tocaForaDoEscopo);
  if (diferencial) movimentos.push(diferencial);
  /* 2026-10-09 · as lacunas (G) e os diferenciais (D) da SERP que a PLANTA assumiu, com a seção onde ela os cobre. */
  const daPlanta = lacunasDaPlanta(planta).filter(item => !descartar(item.rotulo) && !sugestaoDescartada(item.rotulo));
  for (const item of daPlanta.slice(0, RADAR_WRITING_EXPORT_LIMITS.moves)) {
    movimentos.push(item.tipo === "G"
      ? `Cobrir ${entreAspas(item.rotulo)} na seção ${entreAspas(item.secao)}: lacuna da SERP que o artigo-modelo assume.`
      : `Diferenciar em ${entreAspas(item.rotulo)} na seção ${entreAspas(item.secao)}: diferencial da SERP que o artigo-modelo assume.`);
  }
  /* 2026-10-08 · C6 · sem diferencial da página, de tema de um site só nem da SERP assumido pela planta: a entrega concreta que a planta pede, se houver. */
  if (!diferencial && !daPlanta.length) {
    const entrega = entregaDaPlanta(planta);
    if (entrega) movimentos.push(entrega);
  }
  const sinal = (chave: string) => p.autoridade?.eeatSignals.find(item => item.key === chave) || null;
  const experiencia = sinal("FIRSTHAND_ACCOUNT");
  /*
   * 2026-10-08 · C8 · SEM MATERIAL PRÓPRIO, SEM RELATO E SEM MARCADOR. O
   * "[RELATO DA MARCA — preencher]" contrariava D10 e a própria voz da marca
   * ("não ficaram marcadores internos ou relatos por preencher no texto
   * publicável?"; a ausência de caso próprio não impede um artigo explicativo).
   * Decisão da rodada: sem material da marca, o texto sai sem relato e sem
   * inventá-lo — nada de marcador.
   */
  /*
   * 2026-10-09 · Defeito 2 · E-E-A-T sobre a base única. O sinal não guarda a
   * URL de cada página: com a fotografia alinhada à base, os números do modelo;
   * na deriva, a contagem sai (nunca um "N de M" sobre outra base).
   */
  const experienciaNaBase = experiencia ? naBase(0, experiencia.sampleSize) : null;
  if (experiencia && experiencia.state === "ABSENT") {
    movimentos.push(`Experiência: ${experienciaNaBase ? `nenhuma das ${experienciaNaBase.sampleSize} páginas traz` : "as páginas comparáveis não trazem"} relato de prática. Não há material próprio da marca neste arquivo: escreva sem relato e sem inventá-lo; nenhum marcador vai ao texto.`);
  }
  const autoria = sinal("NAMED_AUTHOR");
  const credencial = sinal("DECLARED_CREDENTIAL");
  if (autoria && autoria.pages > 0) {
    const contagem = naBase(autoria.pages, autoria.sampleSize);
    movimentos.push(contagem
      ? `Autoria: ${contagem.pages} de ${contagem.sampleSize} páginas identificam quem escreveu${credencial && credencial.pages ? ` e ${credencial.pages} declaram credencial` : ""}; assine com autor real, sem inventar credencial.`
      : "Autoria: assine com autor real, sem inventar credencial.");
  }
  const datas = sinal("SHOWS_DATES");
  const datasNaBase = datas ? naBase(datas.pages, datas.sampleSize) : null;
  if (datas && datasNaBase && datasNaBase.pages >= maioria) movimentos.push(`Data de atualização visível: ${datasNaBase.pages} de ${datasNaBase.sampleSize} páginas mostram.`);
  /* 2026-10-09 · os eixos de comparação da review são os da planta (critérios Q da Amazon congelada), não os do blueprint competitivo. */

  /* ---- perguntas dentro das seções (2026-10-08 · calculadas antes da estrutura, pela régua única do "não cobrir") ---- */
  const { linhas: perguntas, foraDoFoco } = perguntasProntas ?? perguntasDaLinha(p, contexto, null, tocaForaDoEscopo);

  /* ---- termos a nomear: rótulos de conceito com recorrência, nunca unigrama ---- */
  const termos = unicosPorChave([
    ...p.serp.concepts
      .filter(item => item.status !== "ISOLATED" && item.sourceCount >= 2 && !item.label.trim().endsWith("?"))
      .map(item => item.label),
    ...(p.descoberta?.conceptRelations || [])
      .filter(relacao => relacao.basis === "OBSERVED")
      .flatMap(relacao => [relacao.subject, relacao.object]),
  ].map(item => radarWritingDecodeEntities(item).trim()), radarWritingCompareKey)
    /* 2026-10-08 (correção) · F8 · cabeçalho de FAQ não é tema a nomear (AGENTS §13: não sugerir FAQ). */
    /* 2026-10-09 · Defeitos 3(c) e 5 · nem item do "Não cobrir", nem exclusão da voz da marca. */
    .filter(item => !item.endsWith("?") && radarWritingContentWords(item).size >= 2 && !descartar(item) && !vetar?.(item) && !EH_FAQ.test(item))
    .map(item => (item === item.toUpperCase() ? item.toLowerCase() : item))
    .slice(0, RADAR_WRITING_EXPORT_LIMITS.terms);

  /*
   * ---- o que a maioria já cobre ----
   * 2026-10-09 · saiu: era o modelo observado do blueprint competitivo, que é
   * entrada do gerador do artigo-modelo (a planta já decidiu quanto cobrir).
   */

  /* ---- o que não cobrir ---- */
  /* 2026-10-09 · Defeito 5 · a exclusão da voz da marca é exclusão dura: dita uma vez, com a seção da Skill de onde vem. */
  const linhaDaVoz = radarBrandVoiceExclusionsLine(voz);
  const naoCobrir = [
    ...foraDoEscopo.map(item => `${entreAspas(radarWritingDecodeEntities(item.observedLabel))}: ${semPontoFinal(item.reason)}.`),
    ...foraDoFoco,
    ...(linhaDaVoz ? [comPontoFinal(linhaDaVoz)] : []),
    ...(contexto.silo?.excludedTopics || []).map(item => `${entreAspas(item)}: fora da fronteira do Silo.`),
    /* 2026-10-09b · as exclusões dos reajustes no ArticleDNA: decididas no Arquiteto, duras (a planta não as libera). */
    ...(naoCobrirDaLinha?.dna || []).map(item => `${entreAspas(item.label)}: o ArticleDNA tira este assunto do artigo (reajuste decidido no Arquiteto)${item.owner ? `; é do artigo ${entreAspas(item.owner)}, que no máximo se menciona e linka` : ""}.`),
    ...(p.blueprint?.profile === "AMAZON"
      ? p.blueprint.recommended.requiresEnrichment.slice(0, 3).map(item => `Não comparar por ${item.toLowerCase().replaceAll("_", " ")}: essa camada não foi coletada.`)
      : []),
    ...p.limitacoes
      .filter(item => /n[aã]o traz|n[aã]o foram lid|n[aã]o foi lid|nenhum v[ií]deo foi assistido|n[aã]o foi coletad|n[aã]o foram coletad/i.test(item))
      .slice(0, 3)
      .map(item => `Não afirmar o que depende disto: ${comPontoFinal(semPontoFinal(limitacaoDaCamada(item, amostra)))}`),
  ];

  const blocos = [
    ...(movimentos.length ? ["Como superar a SERP:", ...movimentos.slice(0, RADAR_WRITING_EXPORT_LIMITS.moves + 2).map(item => `- ${item}`)] : []),
    ...(perguntas.length ? ["", "Perguntas a responder dentro das seções (sem seção de perguntas frequentes):", ...perguntas] : []),
    ...(termos.length >= 5 ? ["", `Termos e temas a nomear: ${termos.join(" · ")}`] : []),
    ...(naoCobrir.length ? ["", "Não cobrir:", ...unicosPorChave(naoCobrir, radarWritingCompareKey).map(item => `- ${item}`)] : []),
  ];
  if (!blocos.length) return { celula: "", conflitos };
  const celula = blocos[0] === "" ? blocos.slice(1) : blocos;
  return { celula: celula.join("\n"), conflitos };
}

/* ------------------------------ a SERP resumida ------------------------------ */

const LENTES_NAO_CONFERIDAS = "Lentes: não conferidas neste pacote; o topo acima é da coleta principal.";

/*
 * 2026-10-02 · A CONFIGURAÇÃO DE CADA LENTE, COMO O PACOTE A TEM (pedido do
 * dono: SERP rastreável sem despejar a API). Rótulo (dispositivo e sistema) e
 * data da observação; a lente sem observação é dita como tal — nada além do
 * que o pacote guarda.
 */
type LeituraDeLente = { label: string; observed: boolean; collectedAt: string | null };

function configuracaoDasLentes(leituras: readonly LeituraDeLente[]): string[] {
  if (!leituras.length) return [];
  const uma = (item: LeituraDeLente) => {
    if (!item.observed) return `${item.label} (sem observação)`;
    const data = radarWritingDate(item.collectedAt);
    return `${item.label} (${data ? `observada em ${data}` : "observada, sem data registrada"})`;
  };
  return [`- Configuração de cada lente: ${leituras.map(uma).join("; ")}.`];
}

function resumoDeLentes(leituras: ReadonlyArray<{ label: string; domains: readonly string[] }>, rotulo: string, configuracao: readonly string[] = []): string[] {
  if (leituras.length < 2) return [LENTES_NAO_CONFERIDAS, ...configuracao];
  const conjuntos = leituras.map(item => new Set(item.domains));
  const todas = [...conjuntos[0]].filter(dominio => conjuntos.every(conjunto => conjunto.has(dominio)));
  const exclusivos = leituras
    .map(item => ({ label: item.label, dominios: item.domains.filter(dominio => leituras.filter(outra => outra.domains.includes(dominio)).length === 1) }))
    .filter(item => item.dominios.length);
  return [
    `Lentes (${rotulo}; ${leituras.length} de 4 observadas): ${todas.length ? `em todas, ${todas.slice(0, 6).join(" · ")}` : "nenhum domínio aparece em todas"}.`,
    ...configuracao,
    ...exclusivos.slice(0, 4).map(item => `- Só em ${item.label}: ${item.dominios.slice(0, 4).join(" · ")}.`),
  ];
}

/*
 * 2026-10-02 · EM QUE LENTE CADA PÁGINA APARECEU. A revisão pediu ligar cada
 * decisão à janela da SERP (achado → janela → URL → decisão → seção). As lentes
 * lidas (o pacote congelado primeiro; sem ele, o cache) dizem, por domínio,
 * "em todas as 4 lentes" ou "só em celular · iOS"; a planta põe isso ao lado de
 * cada evidência S da seção. Uma lente só não é conferência: nada é dito.
 */
function lentesLidas(lentes: RadarPortableSerpLenses | null): Array<{ label: string; domains: readonly string[] }> {
  if (!lentes) return [];
  const pacote = lentes.frozenPackage;
  if (pacote?.state === "frozen" && pacote.canonical) {
    const lidas = pacote.canonical.readings.filter(item => item.observed).map(item => ({ label: item.label, domains: item.competitorDomains }));
    if (lidas.length >= 2) return lidas;
  }
  const principal = lentes.keywords.find(item => item.role === "principal") || lentes.keywords[0];
  return (principal?.readings || []).filter(item => item.observed).map(item => ({ label: item.label, domains: item.competitorDomains }));
}

export function radarWritingDomainLenses(lentes: RadarPortableSerpLenses | null): ((dominio: string) => string | null) | null {
  const lidas = lentesLidas(lentes);
  if (lidas.length < 2) return null;
  const limpo = (dominio: string) => dominio.toLowerCase().replace(/^www\./, "");
  return dominio => {
    const alvo = limpo(dominio);
    const onde = lidas.filter(item => item.domains.some(outro => limpo(outro) === alvo)).map(item => item.label);
    if (!onde.length) return null;
    if (onde.length === lidas.length) return `em todas as ${lidas.length} lentes`;
    return `só em ${onde.join(" e ")} (${onde.length} de ${lidas.length} lentes)`;
  };
}

function linhasDasLentes(lentes: RadarPortableSerpLenses | null): string[] {
  if (!lentes) return [LENTES_NAO_CONFERIDAS];
  const pacote = lentes.frozenPackage;
  if (pacote?.state === "frozen" && pacote.canonical) {
    const lidas = pacote.canonical.readings.filter(item => item.observed).map(item => ({ label: item.label, domains: item.competitorDomains }));
    if (lidas.length >= 2) return resumoDeLentes(lidas, "pacote congelado", configuracaoDasLentes(pacote.canonical.readings));
  }
  const principal = lentes.keywords.find(item => item.role === "principal") || lentes.keywords[0];
  const lidas = (principal?.readings || []).filter(item => item.observed);
  if (lidas.length >= 2) {
    const data = radarWritingDate(lidas.map(item => item.collectedAt).filter((valor): valor is string => Boolean(valor)).sort()[0]);
    return resumoDeLentes(
      lidas.map(item => ({ label: item.label, domains: item.competitorDomains })),
      `cache da marca, fora do pacote${data ? `, observado a partir de ${data}` : ""}`,
      configuracaoDasLentes(principal?.readings || []),
    );
  }
  /* Uma lente só não é conferência entre lentes; a configuração dela é dita, para rastrear. */
  return lidas.length ? [LENTES_NAO_CONFERIDAS, ...configuracaoDasLentes(principal?.readings || [])] : [LENTES_NAO_CONFERIDAS];
}

/**
 * 2026-10-02 · AS PÁGINAS COMPARÁVEIS QUE EMBASARAM AS MEDIDAS E AS CONCLUSÕES.
 *
 * A mediana de palavras e os "N de M páginas" do arquivo vêm destas páginas, e
 * o CSV não dizia quais eram. Título curto e endereço limpo, para conferir;
 * endereço com UUID de terceiro no caminho sai só pelo domínio, como no topo
 * orgânico. Nenhum dado além do que o dossiê guarda.
 */
const COMPARAVEIS_NA_LINHA = 10;

function linhasDosComparaveis(p: Projecoes): string[] {
  /*
   * 2026-10-09 · Defeito 2 · UMA BASE SÓ: a lista é a base única (as comparáveis
   * do modelo, sem o teto de 20 da coluna JSON), na ordem da melhor posição — a
   * mesma de que saem os "N de M" e os temas. Sem base, a lista de antes.
   */
  const comparaveis: ReadonlyArray<{ url: string; domain: string; title: string }> = p.base?.pages ?? (p.concorrentes?.competitors || []).filter(item => item.comparable);
  if (!comparaveis.length) return [];
  /* Em tópico, e não numerada: a numeração da célula é a ordem do topo orgânico; esta lista não é ranking. */
  const linhas = comparaveis.slice(0, COMPARAVEIS_NA_LINHA).map(item => {
    const url = radarWritingCleanUrl(item.url || "");
    const endereco = url && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(url) ? url : item.domain;
    return `- ${cortar(item.title || item.domain, 70)} · ${endereco}`;
  });
  const fora = comparaveis.length - linhas.length;
  return [
    p.base
      ? `Páginas comparáveis lidas pela investigação (a base das medidas e das contagens deste arquivo: ${radarSampleBasisLabel(p.base)}):`
      : `Páginas comparáveis lidas pela investigação (a base das medidas e dos "N de M páginas" deste arquivo; ${comparaveis.length}):`,
    ...linhas,
    ...(fora > 0 ? [`- e mais ${fora} página(s) comparável(is), na investigação do Radar`] : []),
  ];
}

/*
 * 2026-10-02 · O QUE OS CONCORRENTES LIDOS COBREM, PELOS H2/H3 DELES
 * (`competitor-topics.ts`). O CSV listava QUAIS páginas foram lidas, não O QUE
 * elas tratam: o redator via 6 links e 13 conceitos de 1 página. Agora os temas,
 * com quantas páginas tratam cada um e os cabeçalhos de exemplo; os de 1 página
 * só, à parte. A régua do "não cobrir" vale aqui também.
 */
const TEMAS_RECORRENTES_NA_LINHA = 10;
const TEMAS_UNICOS_NA_LINHA = 8;

export function radarWritingCompetitorTopicsOf(input: RadarPortableExportInput, p: Projecoes) {
  const paginas = input.competitorOutlines || [];
  if (!paginas.length) return null;
  const foraDoEscopo = radarWritingOutOfScope(p);
  /*
   * 2026-10-08 · P1 · UMA BASE SÓ: a lista impressa de páginas comparáveis
   * ("N de 23" enquanto a lista dizia 12). Os esboços vão inteiros — o cromo de
   * um site é reconhecido também pelas páginas dele fora da lista —, e o
   * leitor declarado tira o consumo e a outra profissão (`competitor-topics.ts`).
   */
  /* 2026-10-09 · Defeito 2 · a base é a base única (sem o teto de 20); sem ela, a lista de antes. */
  const comparaveis: ReadonlyArray<{ url: string; domain: string }> = p.base?.pages ?? (p.concorrentes?.competitors || []).filter(item => item.comparable);
  /* A base só vale quando os esboços lidos são dessa lista; sem nenhuma página em comum, a amostra é a de antes. */
  const chaveDaPagina = (url: string | null | undefined) => texto(url).toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const daLista = new Set(comparaveis.map(item => chaveDaPagina(item.url)).filter(Boolean));
  const comBase = paginas.some(pagina => daLista.has(chaveDaPagina(pagina.url)));
  /* 2026-10-09 · aditivo: `naBaseUnica` diz que a contagem saiu da base única (o cabeçalho dos temas usa o nome dela). */
  return { naBaseUnica: comBase && Boolean(p.base), ...radarCompetitorTopics({
    pages: paginas,
    core: [p.dna.principalKeyword, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, p.assunto?.phrase || ""].filter((valor): valor is string => Boolean(valor)),
    /*
     * 2026-10-09 · Defeitos 3 e 5 · na linha, a guarda das sugestões (o "Não
     * cobrir" que ficou depois da regra 3a, a exclusão da voz da marca e as
     * perguntas mandadas a outro artigo); fora dela, a régua de antes.
     */
    outOfScope: valor => (p.vetoDeSugestao ? Boolean(p.vetoDeSugestao(valor)) : foraDoEscopo(valor)),
    ...(comBase ? { basis: comparaveis.map(item => ({ url: item.url, domain: item.domain })) } : {}),
    audience: input.article.audience ?? null,
  }) };
}

function linhasDosTemas(input: RadarPortableExportInput, p: Projecoes): string[] {
  const leitura = radarWritingCompetitorTopicsOf(input, p);
  if (!leitura?.topics.length) return [];
  const recorrentes = leitura.topics.filter(item => item.pages >= 2).slice(0, TEMAS_RECORRENTES_NA_LINHA);
  const unicos = leitura.topics.filter(item => item.pages < 2).slice(0, TEMAS_UNICOS_NA_LINHA);
  /*
   * 2026-10-08 · P1 · a recorrência conta SITES distintos (o menu repetido de um site não vira tema), sobre a lista impressa.
   * 2026-10-09 · Defeito 2 · sobre a base única, com o mesmo nome da lista ("23 páginas comparáveis, de 20 sites").
   */
  const base = leitura.naBaseUnica ? p.base : null;
  const sites = base?.sites || leitura.sampleDomains || leitura.sampleSize;
  return [
    `O que os concorrentes lidos cobrem (H2/H3 das ${base ? radarSampleBasisLabel(base) : `${leitura.sampleSize} páginas comparáveis, de ${sites} site(s)`}; ${leitura.headingsRead} cabeçalhos lidos; a recorrência conta sites e mostra o que a amostra trata, não o que funciona):`,
    ...(recorrentes.length
      ? recorrentes.map(item => `- ${item.label} · ${item.pages} de ${sites} sites · ex.: ${item.headings.map(entreAspas).join("; ")}`)
      : ["- Nenhum tema aparece em mais de um site: a amostra trata o assunto de jeitos diferentes."]),
    ...(unicos.length ? [`Tratado por 1 site só (diferencial possível, se servir ao leitor): ${unicos.map(item => entreAspas(item.label)).join("; ")}.`] : []),
  ];
}

function colunaSerp(input: RadarPortableExportInput, p: Projecoes): string {
  const serp = p.serpObservada;
  if (!serp) return "";
  const cabecalho = "Referência de pesquisa, não conteúdo a copiar: não reproduza frases nem títulos de terceiros.";
  if (!serp.available) {
    return [cabecalho, `SERP: ${comPontoFinal(serp.unavailableReason || "a coleta referenciada pelo dossiê não está disponível")}`, ...linhasDosComparaveis(p), ...linhasDosTemas(input, p), ...linhasDasLentes(p.lentes)].join("\n");
  }
  const principal = radarWritingCompareKey(input.article.principalKeyword);
  const consulta = texto(serp.query);
  const lugar = texto(serp.location).replace(/\s*\(c[oó]digo[^)]*\)/i, "") || texto(serp.country);
  /* 2026-10-02 · o sistema da coleta principal, quando o pacote o registra: a configuração dela, rastreável. */
  const local = [lugar, serp.language, serp.device, serp.operatingSystem].filter(Boolean).join(" · ");
  const data = radarWritingDate(serp.collectedAt);
  /*
   * A ORDEM ORGÂNICA, E NÃO A POSIÇÃO NA PÁGINA.
   *
   * `position` conta também os recursos da SERP (AI Overview, vídeos, PAA): o
   * topo parecia começar no 7 e ter buracos. A lista numera 1, 2, 3… entre os
   * orgânicos e mantém a posição na página como informação secundária.
   */
  const organicos = serp.organic.slice(0, RADAR_WRITING_EXPORT_LIMITS.organicResults).map((item, indice) => {
    const trecho = item.snippet?.thirdPartyExcerpt ? ` · “${cortar(item.snippet.thirdPartyExcerpt, RADAR_WRITING_EXPORT_LIMITS.thirdPartyExcerptChars)}”` : "";
    const naPagina = typeof item.position === "number" && item.position !== indice + 1 ? ` · posição ${item.position} na página` : "";
    /* A URL limpa, para conferir (2026-10-02); com endereço interno de terceiro no caminho, só o domínio. */
    const url = radarWritingCleanUrl(item.url);
    const endereco = url && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(url) ? url : item.domain;
    return `${indice + 1}. ${cortar(item.title || item.domain, RADAR_WRITING_EXPORT_LIMITS.titleChars)} · ${endereco}${item.type && item.type !== "outro" ? ` · ${item.type}` : ""}${naPagina}${trecho}`;
  });
  const formatos = (serp.diagnostic?.dominantFormats || []).filter(item => item && item !== "outro");
  const aiOverview = serp.features?.aiOverview || null;
  /*
   * 2026-10-08 (correção) · F5 · as buscas relacionadas passam pela mesma régua
   * do PAA: marca de concorrente ("Magote promoção", "Uva rosa"), superstição
   * ("Simpatias para atrair clientes") e outra profissão não são subtema.
   */
  const relacionadas = serp.relatedSearches.map(item => texto(item.term))
    .filter(termo => termo && !radarWritingRhetoricalQuestion(termo) && !radarReaderQuestionIsNoise(termo, p.ruido)).slice(0, 8);
  /* 2026-10-02 · fecho retórico de concorrente não entra em lista nenhuma, nem na SERP resumida. */
  /* 2026-10-08 · P1 · nem o ruído de pesquisa (loja, cupom, outra profissão, produto de concorrente…) no PAA. */
  const paa = serp.peopleAlsoAsk.map(item => texto(item.question)).filter(pergunta => pergunta && !radarWritingRhetoricalQuestion(pergunta) && !radarReaderQuestionIsNoise(pergunta, p.ruido)).slice(0, 6);
  const auxiliares = serp.auxiliaryQueries.filter(item => item.results.length).slice(0, 3).map(item =>
    `- ${entreAspas(item.query || "consulta auxiliar")} (${item.role}): ${item.results.slice(0, 4).map(resultado => resultado.domain).filter(Boolean).join(" · ")}`);

  return [
    cabecalho,
    `Consulta: ${consulta || "não registrada"}${local ? ` · ${local}` : ""}${data ? ` · coleta de ${data}` : ""}`,
    ...(consulta && principal && radarWritingCompareKey(consulta) !== principal ? [`Atenção: a consulta difere da keyword principal ("${input.article.principalKeyword}").`] : []),
    ...(organicos.length ? ["Topo orgânico, na ordem entre os orgânicos (a posição na página conta também os recursos da SERP):", ...organicos] : []),
    ...linhasDosComparaveis(p),
    ...linhasDosTemas(input, p),
    ...(formatos.length ? [`Formatos dominantes: ${formatos.join(" · ")}`] : []),
    ...(aiOverview
      ? [aiOverview.shown
        ? `AI Overview: aparece${aiOverview.citedSources.length ? `; cita ${aiOverview.citedSources.slice(0, 5).map(item => `${item.domain}${item.title ? ` (${cortar(item.title, 60)})` : ""}`).join(" · ")}` : ""}.`
        : "AI Overview: não apareceu nesta coleta."]
      : []),
    ...linhasDasLentes(p.lentes),
    ...(relacionadas.length ? [`Buscas relacionadas (subtemas): ${relacionadas.join(" · ")}`] : []),
    ...(paa.length ? [`Pessoas também perguntam: ${paa.join(" · ")}`] : []),
    ...(auxiliares.length ? [`Outras consultas ${daUnidade(p.unidade).do} ${p.unidade.noun}:`, ...auxiliares] : []),
  ].join("\n");
}

/* ------------------------------ fontes e especialista ------------------------------ */

function colunaFontes(p: Projecoes, especialista: readonly Contribuicao[], videos: ReadonlyArray<{ rotulo: string; linha: string }>, plano: RadarArticleBlueprintPayload | null = null): string {
  const linhas: string[] = [];
  const ymyl = p.autoridade?.ymylAssessment || null;
  if (ymyl) {
    const exigencia = ymyl.evidenceRequirements.map(item => radarWritingDecodeEntities(item)).find(item => !ehPreenchimento(item));
    linhas.push(`YMYL: ${YMYL[ymyl.relevance] || ymyl.relevance}${exigencia ? ` — ${semPontoFinal(exigencia)}` : ""}${ymyl.specialistReviewRequired ? "; revisão profissional exigida antes de publicar" : ""}.`);
    const conflito = conflitoDeYmyl(p);
    if (conflito) linhas.push(`Conflito no pacote: ${conflito}.`);
  } else {
    linhas.push("Autoridade: a camada de YMYL e de fontes só existe na investigação de páginas do Google; afirmação sensível continua pedindo fonte.");
  }

  const verificadas = (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS");
  const afirmacaoDe = new Map((p.autoridade?.claims || []).map(claim => [claim.claimId, claim.canonicalClaim]));
  linhas.push(verificadas.length
    ? "Fontes verificadas:"
    : "Fontes verificadas: nenhuma nesta investigação.");
  for (const fonte of unicosPorChave(verificadas, item => `${item.sourceUrl}|${item.claimId}`).slice(0, 6)) {
    linhas.push(`- ${cortar(fonte.sourceTitle || fonte.sourceDomain, 90)} — ${fonte.sourceUrl} — sustenta ${entreAspas(afirmacaoDe.get(fonte.claimId) || "afirmação registrada no pacote")}`);
  }

  /*
   * 2026-10-02 · O MODO DE USO ESCOLHIDO NO RADAR (Adendo B, D6), um vídeo por
   * linha e mesmo sem casamento: Incorporar leva URL e seção; Apoio e Citação,
   * o trecho com tempo; Contexto é para ler, não citar; Sugestão de pauta é
   * ideia a validar. Nunca a transcrição inteira — o corte da célula vale aqui.
   * Sem modo nenhum, o bloco não existe e a célula é a de antes.
   *
   * 2026-10-02 · Com artigo-modelo aprovado, a seção é a que o PLANO escolheu
   * para o vídeo — o bloco não devolve a decisão a ele. Sem plano, ou com
   * versão sem retrato dos vídeos, a linha é a de antes.
   *
   * Revisão de 2026-10-02: o bloco vem ANTES do que é de terceiros (citadas pelo
   * mercado, sem fonte, conflitos). A célula é cortada do fim para o começo, e a
   * decisão do dono não pode ser a primeira a sair.
   */
  /*
   * 2026-10-02 · "Vídeos SELECIONADOS pela marca", e não "da marca": o vídeo
   * escolhido pode ser de outro canal, e cada linha diz o canal (ou que ele não
   * está registrado). Citação e Apoio são atribuídos a ele.
   */
  const modos = p.video.selected || [];
  if (modos.length) {
    linhas.push("Vídeos selecionados pela marca (modo de uso escolhido no Radar, decisão do dono; conferir no vídeo e atribuir ao canal):");
    for (const item of modos) linhas.push(`- ${radarPortableVideoUsageLine(item, plano ? radarArticleBlueprintVideoSections(plano, item) : null)}`);
  }

  /*
   * 2026-10-08 · P1 · "Citadas pelo mercado" sem o ruído de pesquisa: aviso de
   * cookie, selo, consulta de CPF/CNPJ, e-MEC, W3C, aposta, lei de rodapé fora do
   * tema, institucional e o site do próprio concorrente; domínio oficial só fica
   * quando o assunto da citação toca o tema do artigo (`research-noise.ts`).
   */
  const citadas = p.fontesExternas.filter(item => item.authorityClass !== "NAO_CLASSIFICADA" && !radarMarketCitationIsNoise(item, p.ruido));
  if (citadas.length) {
    /* 2026-10-08 (correção da revisão) · D10: a regra concluída, não "conferir antes de citar". */
    linhas.push("Citadas pelo mercado, sem verificação no pacote (só como referência delimitada, nunca como fonte da afirmação):");
    for (const fonte of unicosPorChave(citadas, item => item.url).slice(0, 6)) {
      const titulo = /^https?:\/\//.test(fonte.title) ? fonte.domain : cortar(fonte.title, 80);
      linhas.push(`- ${titulo} — ${fonte.url} (${fonte.authorityClass}; citada por ${fonte.citedByPages} página(s))`);
    }
  }

  /* 2026-10-09 · Defeito 2 · o "N de M páginas tratam" do mercado sobre a base única. */
  const semFonte = radarWritingUnsupportedClaims(p.autoridade, p.serp, p.base);
  if (semFonte.length) {
    linhas.push("Não afirmar como fato sem fonte:");
    for (const item of unicosPorChave(semFonte, entrada => radarWritingCompareKey(entrada.afirmacao)).slice(0, 6)) {
      linhas.push(`- ${entreAspas(radarWritingDecodeEntities(item.afirmacao))}${item.mercado ? ` (${item.mercado}; sem fonte adequada)` : ""}`);
    }
  }

  const conflitos = p.autoridade?.marketVsFactConflicts || [];
  if (conflitos.length) {
    linhas.push("Mercado × fonte (escreva os dois lados, sem resolver em silêncio):");
    for (const conflito of conflitos.slice(0, 4)) {
      linhas.push(`- ${entreAspas(conflito.canonicalClaim)}: o mercado repete ${entreAspas(cortar(conflito.marketObservation, 160))}; a fonte diz ${entreAspas(cortar(conflito.factualPosition, 160))} (trecho de terceiro, não copiar)`);
    }
  }

  /* 2026-10-08 · D10: o parecer ainda não aceito fica fora do texto — dito como regra cumprida, sem "aguardando" (como o CSV de vídeo, 2026-10-07). */
  const pendentes = p.especialista.pending;
  linhas.push(especialista.length
    ? "Especialista:"
    : pendentes
      ? `Especialista: sem contribuição aceita; ${pendentes} parecer(es) ainda não aceito(s) no Radar ficam fora deste texto.`
      : "Especialista: sem contribuição aceita.");
  if (especialista.length && pendentes) linhas.push(`- ${pendentes} parecer(es) ainda não aceito(s) no Radar ficam fora deste texto.`);
  /*
   * 2026-10-08 · P1 · fechamento, CTA e diretriz já saem inteiros na promessa: aqui, a remissão (sem repetir o texto).
   * Com o artigo-modelo, a promessa é a da planta, que não os traz: a resposta sai aqui, inteira.
   */
  for (const item of especialista) linhas.push(`- ${plano ? item.linha : item.referencia ?? item.linha}`);

  if (videos.length) {
    linhas.push("Trechos dos vídeos selecionados pela marca (embutir ou citar no ponto indicado, atribuído ao vídeo e ao canal; conferir o trecho no vídeo):");
    for (const item of videos) linhas.push(`- ${item.linha}`);
  }
  return linhas.join("\n");
}

/* ------------------------------ links, visual e produtos ------------------------------ */

/*
 * A FALTA DE LINK É DITA, E NÃO PREENCHIDA (invariante 30): o artigo do Silo
 * sem plano de links ganha a ressalva no veredito. 2026-10-09 · a coluna
 * links_internos é a da planta (`radarArticleBlueprintColumns`); a coluna pelo
 * plano de links do pacote saiu com a estrutura legada.
 */
const artigoDeSilo = (contexto: RadarWritingArticleContext): boolean => contexto.silo?.kind === "silo";

const EVITAR = "Evitar: ";

/*
 * 2026-10-02 · A REGRA É CAPA + 2 OU 3 RESPIROS (AGENTS §13), para qualquer
 * tipo de página. O plano do pacote só põe respiro em seção H2 elegível: com
 * uma seção só, saía "uma capa e 1 respiro" — a regra reduzida em silêncio.
 * Agora o respiro que falta é declarado, com o lugar sugerido (depois da
 * abertura ou antes do fechamento) e a decisão devolvida à estrutura final.
 */
export const RADAR_WRITING_MIN_RESPITES = 2;

/*
 * 2026-10-09 · O PLANO VISUAL É O DA PLANTA (capa e respiros com prompt, ALT e
 * legenda, ancorados pelo título da seção). O plano visual do pacote saiu com a
 * estrutura legada (regra do dono: o artigo-modelo é o fundamento único).
 */

/*
 * 2026-10-09 (correção) · A PARTE COMERCIAL EM QUALQUER PERFIL. Com o Google como
 * base e a Amazon congelada como review, o núcleo já entrega `input.commercial`
 * (`radarPortableCommercialOf`) e a planta planeja a review (regra 25): a coluna
 * produtos, a ressalva do parcial e o aviso de afiliado deixam de depender do
 * perfil primário. Sem Amazon congelada, `commercial` é null e nada muda.
 */
function colunaProdutos(input: RadarPortableExportInput): string {
  if (!input.commercial) return "";
  const comercial = input.commercial;
  const setup = comercial.setup ?? input.amazon?.setup ?? null;
  const tipo = setup?.intent.type as RadarAmazonEditorialIntentType | undefined;
  const universo = new Map((input.amazon?.universe || []).map(item => [item.asin, item]));
  const data = radarWritingDate(input.dossierGaps?.status.frozenObservedAt ?? input.dossierGaps?.status.bundle.research.amazon?.frozenAt ?? null);
  const linhas = [
    `Formato: ${tipo ? RADAR_AMAZON_INTENT_LABELS[tipo] || tipo : "lista de produtos"}${setup?.intent.desiredCount ? ` · ${setup.intent.desiredCount} produtos` : ""}`,
    ...(comercial.comparisonCriteria.length ? [`Critérios de comparação: ${comercial.comparisonCriteria.join(" · ")}`] : []),
    ...(setup?.target.brandFilter ? [`Marca exigida: ${setup.target.brandFilter}`] : []),
  ];
  if (!comercial.links.length) {
    linhas.push(`Produtos selecionados: nenhum produto selecionado${comercial.counts ? ` (${comercial.counts.observed} observados na prateleira, ${comercial.counts.eligible} compatíveis com o alvo)` : ""}.`);
    return linhas.join("\n");
  }
  linhas.push("Produtos selecionados:");
  comercial.links.forEach((link, indice) => {
    const item = universo.get(link.asin);
    const preco = item?.priceFrom != null
      ? `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: item.currency || "BRL" }).format(item.priceFrom)} observado${data ? ` em ${data}` : " na coleta"}`
      : null;
    const nota = item?.ratingValue != null ? `nota ${numeroBr(item.ratingValue)}${item.ratingVotes != null ? ` (${numeroBr(item.ratingVotes)} avaliações)` : ""}` : null;
    const selos = [item?.isAmazonChoice ? "Escolha da Amazon" : null, item?.isBestSeller ? "Mais vendido" : null].filter(Boolean);
    linhas.push(`${indice + 1}. ${cortar(link.productName, 110)}${preco ? ` · ${preco}` : ""}${nota ? ` · ${nota}` : ""}${selos.length ? ` · ${selos.join(", ")}` : ""} · ${radarWritingCleanUrl(link.amazonUrl)}`);
  });
  linhas.push("Preço e nota são da coleta: não prometa preço atual. A tag de afiliado entra na publicação, não no texto.");
  if (comercial.disclosureRequired) linhas.push("Aviso de afiliado: obrigatório antes do primeiro link de produto.");
  return linhas.join("\n");
}

/* ------------------------------ o prompt ------------------------------ */

/**
 * O PROMPT DA LINHA É CURTO: o específico do artigo, e as regras pela linha de topo.
 *
 * As regras gerais moram UMA vez na linha "Silo"/"Marca". Repeti-las inteiras
 * em cada artigo era o mesmo volume repetido de que o dono do produto
 * reclamou. Ficam aqui só as guardas que não podem se perder quando alguém
 * copia uma linha sozinha: sem FAQ, terceiros são pesquisa, nada inventado.
 *
 * Linha BLOQUEADA não recebe instrução de escrever: um "Não escreva" seguido
 * de "Escreva em português…" se contradiz.
 */
function colunaPrompt(contexto: RadarWritingArticleContext, especificas: readonly string[], bloqueio: string | null, unidade: RadarWritingUnit = ARTIGO_COMO_UNIDADE): string {
  /* 2026-10-02 · o tipo da unidade: "o artigo descrito", "a landing page descrita"; a data visível só na unidade editorial. */
  const formas = daUnidade(unidade);
  if (bloqueio) {
    return `Não escreva ${formas.este} ${unidade.noun} antes de resolver o bloqueio: ${comPontoFinal(bloqueio)} Depois de resolvido, exporte de novo para receber o prompt de escrita.`;
  }
  const topo = contexto.topRowLabel;
  return [
    `Escreva em português do Brasil ${formas.o} ${unidade.noun} descrit${formas.terminacao} nesta linha, com as regras gerais da linha "${topo}" deste arquivo (${contexto.brandVoice ? `leve as três linhas juntas para a IA: "${topo}", "Voz da marca" e esta` : "leve as duas linhas juntas para a IA"}). Em resumo: siga o artigo-modelo da coluna estrutura (seções, medidas, links e imagens da planta), e a redação é de quem escreve; keyword principal no H1, no primeiro parágrafo e com naturalidade no corpo; cada seção abre respondendo a pergunta dela; sem seção de perguntas frequentes; a SERP e os trechos de concorrentes são pesquisa: não copie frases nem títulos; não invente fatos, fontes, depoimentos nem URLs; só os links L1, L2… indicados. Entregue H1, SEO title, meta description e o texto em Markdown${unidade.editorial ? ", com a data de atualização visível" : ""}.`,
    ...(especificas.length ? [`${formas.neste} ${unidade.noun}:`, ...especificas.map(item => `- ${comPontoFinal(item)}`)] : []),
    /* 2026-10-02 · D10 (decisão do dono): o prompt sai fechado — sem "proposta" nem "aguardando aprovação". */
  ].join("\n");
}

/* ============================== o veredito ============================== */

/** O nome curto de um motivo: o trecho antes da primeira explicação (":" ou ";"). */
const motivoCurto = (valor: string): string => cortar(semPontoFinal(valor.split(/[:;]/)[0] || valor), 80);

/**
 * O VEREDITO: até quatro motivos por inteiro, e o resto pelo NOME.
 *
 * "(+2 ressalva(s) nas colunas desta linha)" escondia, no caso real, que o
 * título do pacote era inutilizável. O excedente agora aparece pelo nome
 * curto de cada motivo, e o motivo repetido (mesma frase) entra uma vez só.
 */
function veredito(bloqueios: readonly string[], ressalvas: readonly string[]): { verdict: RadarWritingVerdict; celula: string; primeira: string | null } {
  const limite = RADAR_WRITING_EXPORT_LIMITS.verdictReasons;
  const todos = unicosPorChave([...bloqueios, ...ressalvas], radarWritingCompareKey);
  if (!todos.length) return { verdict: "Sim", celula: "Sim", primeira: null };
  const verdict: RadarWritingVerdict = bloqueios.length ? "Não" : "Com ressalva";
  const mostrados = todos.slice(0, limite);
  const resto = todos.slice(limite);
  return {
    verdict,
    primeira: mostrados[0],
    celula: [
      `${verdict}: ${comPontoFinal(mostrados[0])}`,
      ...mostrados.slice(1).map(item => `- ${comPontoFinal(item)}`),
      ...(resto.length ? [`- Também: ${resto.map(motivoCurto).join("; ")} (detalhes nas colunas desta linha).`] : []),
    ].join("\n"),
  };
}

/* ============================== os limites da linha ============================== */

/*
 * 2026-10-09 (correção · contrato-F1) · A ORDEM DO CORTE DO ARTIGO. Com a
 * estrutura inteira (célula + continuação na coluna de fontes), o teto de 48
 * mil empurrava o corte para cobrir_e_superar — a coluna do "Como superar", do
 * "Não cobrir", da exclusão da voz e da nota da voz, cortada pelo fim, onde
 * está o "Não cobrir". Ela é contrato do artigo e não cede ao teto: sai da
 * lista. Cedem, nesta ordem, a SERP resumida (o resumo da pesquisa, que o
 * dossiê guarda inteiro), o plano visual e as fontes (só quando não levam a
 * continuação da estrutura).
 */
export const RADAR_WRITING_EXPORT_CUT_ORDER: readonly RadarWritingExportColumn[] = ["serp_resumida", "plano_visual", "fontes_e_especialista"];
const CORTAVEIS = RADAR_WRITING_EXPORT_CUT_ORDER;

/* A linha que abre o bloco "Não cobrir" da coluna cobrir_e_superar: o fim da coluna, que nunca é cortado. */
const ABRE_O_NAO_COBRIR = /^Não cobrir:/m;

function cortarCelula(celula: string, limite: number, motivo: string): string {
  if (celula.length <= limite) return celula;
  const aviso = `\n[…] ${motivo}`;
  const espaco = Math.max(0, limite - aviso.length);
  const quebra = celula.lastIndexOf("\n", espaco);
  return `${celula.slice(0, quebra > 0 ? quebra : espaco).trimEnd()}${aviso}`;
}

/**
 * 2026-10-09 (correção · contrato-F1) · O corte de uma célula pelo teto dela.
 * Na cobrir_e_superar, o bloco "Não cobrir" (e o que vem depois dele: a
 * exclusão e a nota da voz) fica inteiro: cede o "Como superar" de antes, em fim
 * de linha, com o aviso no ponto do corte. Nas outras, o corte pelo fim de antes.
 */
export function radarWritingCutCell(coluna: RadarWritingExportColumn, celula: string, limite: number, motivo: string): string {
  if (celula.length <= limite) return celula;
  const naoCobrir = coluna === "cobrir_e_superar" ? ABRE_O_NAO_COBRIR.exec(celula) : null;
  if (!naoCobrir) return cortarCelula(celula, limite, motivo);
  const cauda = celula.slice(naoCobrir.index);
  const aviso = `[…] ${motivo}`;
  const espaco = limite - cauda.length - aviso.length - 2;
  if (espaco <= 0) return cortarCelula(celula, limite, motivo);
  const cabeca = celula.slice(0, naoCobrir.index).trimEnd();
  const quebra = cabeca.lastIndexOf("\n", espaco);
  return `${cabeca.slice(0, quebra > 0 ? quebra : espaco).trimEnd()}\n${aviso}\n${cauda}`;
}

/*
 * ===== 2026-10-09 · Defeito 1 · A ESTRUTURA ENCOLHE DIZENDO O QUE ENCOLHEU, E NUNCA É CORTADA =====
 *
 * Acima do limite seguro de uma célula de planilha, a estrutura encolhe por
 * níveis, nesta ordem, e diz no topo o que saiu: (1) as URLs das evidências
 * (fica o título de cada página); (2) as linhas "Vem do esqueleto da SERP" e
 * "Origem"; (3) as linhas "Termos a nomear". Se ainda passar, os blocos do fim
 * (seção inteira, nunca meia) vão para a coluna fontes_e_especialista, com a
 * remissão nas duas pontas. Abaixo do limite, a célula sai byte a byte igual.
 */
const NIVEIS_DA_ESTRUTURA: ReadonlyArray<{ diz: string; aplicar: (linha: string) => string | null }> = [
  {
    diz: "as URLs das evidências (fica o título de cada página; o topo orgânico com o endereço está na coluna serp_resumida)",
    aplicar: linha => (/^(?:- Evidências:|Abertura:)/.test(linha) ? linha.replace(/ · https?:\/\/[^\s)]+/g, "") : linha),
  },
  { diz: "as linhas \"Vem do esqueleto da SERP\" e \"Origem\" de cada seção", aplicar: linha => (/^- (?:Vem do esqueleto da SERP|Origem):/.test(linha) ? null : linha) },
  { diz: "as linhas \"Termos a nomear\" de cada seção", aplicar: linha => (/^- Termos a nomear:/.test(linha) ? null : linha) },
];

export const RADAR_WRITING_STRUCTURE_CONTINUATION = "Continuação da coluna estrutura (não coube numa célula de planilha; vale como parte da estrutura, na ordem):";

export function radarWritingCompactStructure(celula: string, limite: number = RADAR_WRITING_EXPORT_LIMITS.structureChars): { celula: string; continuacao: string | null; niveis: string[] } {
  if (celula.length <= limite) return { celula, continuacao: null, niveis: [] };
  const niveis: string[] = [];
  let linhas = celula.split("\n");
  const comAviso = (lista: readonly string[]) => (niveis.length
    ? [lista[0], `Compactação (a célula passou do limite seguro de uma planilha): saíram ${niveis.join("; ")}. O resto da estrutura está inteiro.`, ...lista.slice(1)]
    : [...lista]).join("\n");
  for (const nivel of NIVEIS_DA_ESTRUTURA) {
    if (comAviso(linhas).length <= limite) break;
    const depois = linhas.map(nivel.aplicar).filter((linha): linha is string => linha !== null);
    if (depois.join("\n") === linhas.join("\n")) continue;
    linhas = depois;
    niveis.push(nivel.diz);
  }
  const compacta = comAviso(linhas);
  if (compacta.length <= limite) return { celula: compacta, continuacao: null, niveis };
  /* Ainda passa: os blocos do fim, inteiros, vão para a outra coluna. Um bloco é o que fica entre linhas em branco (uma seção, a lista do fim). */
  const blocos = compacta.split(/\n\n+/);
  const remissao = "[A estrutura continua na coluna fontes_e_especialista, no bloco \"Continuação da coluna estrutura\": as seções seguintes não couberam numa célula de planilha.]";
  let ficam = blocos.length;
  while (ficam > 1 && `${blocos.slice(0, ficam).join("\n\n")}\n\n${remissao}`.length > limite) ficam -= 1;
  return {
    celula: `${blocos.slice(0, ficam).join("\n\n")}\n\n${remissao}`,
    continuacao: [RADAR_WRITING_STRUCTURE_CONTINUATION, ...blocos.slice(ficam)].join("\n\n"),
    niveis,
  };
}

/**
 * ===== A LINHA CABE NO TETO =====
 *
 * Primeiro o teto de cada célula; depois o do artigo, cortando na ordem de
 * `CORTAVEIS`. O corte é sempre em fim de linha e sempre declarado.
 *
 * 2026-10-09 · Defeito 1 · a estrutura não entra no corte: encolhe por níveis
 * (`radarWritingCompactStructure`) e, no limite, continua inteira na coluna de
 * fontes, que nesse caso também não é cortada.
 */
function dentroDosLimites(linha: RadarWritingExportRow): RadarWritingExportRow {
  const saida = { ...linha };
  const estrutura = radarWritingCompactStructure(saida.estrutura);
  saida.estrutura = estrutura.celula;
  if (estrutura.continuacao) saida.fontes_e_especialista = [estrutura.continuacao, saida.fontes_e_especialista].filter(Boolean).join("\n\n");
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
    const limite = coluna === "fontes_e_especialista" && estrutura.continuacao ? RADAR_WRITING_EXPORT_LIMITS.structureChars : radarWritingCellLimit(coluna);
    /* 2026-10-09 (correção · contrato-F1) · na cobrir_e_superar, o "Não cobrir" fica inteiro (cede o "Como superar" de antes). */
    saida[coluna] = radarWritingCutCell(coluna, saida[coluna], limite, `Célula cortada no limite de ${numeroBr(limite)} caracteres.`);
  }
  const total = () => RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + saida[coluna].length, 0);
  const motivo = `Cortado para o artigo caber em ${numeroBr(RADAR_WRITING_EXPORT_LIMITS.articleChars)} caracteres.`;
  /* Primeiro passe: cada cortável guarda o começo. Só se ainda não couber, o segundo corta sem piso. */
  for (const piso of [RADAR_WRITING_EXPORT_LIMITS.cutFloorChars, 0]) {
    for (const coluna of CORTAVEIS) {
      /* 2026-10-09 · Defeito 1 · a coluna de fontes que leva a continuação da estrutura não cede. */
      if (coluna === "fontes_e_especialista" && estrutura.continuacao) continue;
      const excesso = total() - RADAR_WRITING_EXPORT_LIMITS.articleChars;
      if (excesso <= 0) return saida;
      if (saida[coluna].length <= piso) continue;
      const alvo = Math.max(piso, saida[coluna].length - excesso);
      saida[coluna] = alvo < motivo.length + 10 ? `[…] ${motivo}` : cortarCelula(saida[coluna], alvo, motivo);
    }
  }
  return saida;
}

const finalizarLinha = (linha: RadarWritingExportRow): RadarWritingExportRow => {
  const limpa = {} as RadarWritingExportRow;
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) limpa[coluna] = radarWritingSpreadsheetSafe(higiene(linha[coluna] || ""));
  return dentroDosLimites(limpa);
};

/* ============================== o artigo ============================== */

/**
 * 2026-10-02 · O MODO DO VÍDEO DE UM TRECHO V (Adendo B, D6). Sem modo, nada
 * se acrescenta e a linha é a de antes.
 */
function modoDoTrecho(trecho: RadarPortableVideoExtract): string {
  if (trecho.usage === "SUPPORT") return " · Apoio: o trecho sustenta o ponto, atribuído ao vídeo e com o tempo";
  if (trecho.usage === "QUOTE") return " · Citação: fala literal entre aspas, atribuída ao vídeo e com o tempo";
  if (trecho.usage === "EMBED") return ` · Incorporar o vídeo nesta seção${trecho.sourceUrl ? `: ${trecho.sourceUrl}` : ""}`;
  return "";
}

/*
 * 2026-10-09 · A SEÇÃO DA PAUTA, DITA PELA PLANTA. A pauta do pacote (as seções
 * do modelo editorial da SERP) virou o esqueleto M1…Mn do artigo-modelo; cada
 * seção da planta diz de que M veio (`from`). O título com que uma seção da
 * pauta aparece no entregável é o H2 da planta que nasceu dela — e, sem par na
 * planta, nenhum (o entregável não cita seção de estrutura legada).
 */
function tituloNaPlanta(planta: RadarArticleBlueprintPayload | null): (cabecalho: string | null | undefined) => string | null {
  if (!planta) return () => null;
  const porCabecalho = new Map<string, string>();
  for (const item of planta.skeleton || []) {
    for (const chave of [radarWritingCompareKey(item.heading), radarWritingCompareKey(radarWritingStripHeadingTemplate(item.heading))]) {
      if (chave && !porCabecalho.has(chave)) porCabecalho.set(chave, item.id);
    }
  }
  return cabecalho => {
    const id = porCabecalho.get(radarWritingCompareKey(cabecalho)) ?? porCabecalho.get(radarWritingCompareKey(radarWritingStripHeadingTemplate(cabecalho)));
    if (!id) return null;
    return planta.blueprint.sections.find(secao => (secao.from || []).includes(id))?.h2 ?? null;
  };
}

/*
 * 2026-10-09 · Defeito 3(b) · AS NOTAS DA PLANTA: o assunto de outro artigo do
 * Silo vai à PRIMEIRA seção da planta que o toca (título, pergunta, resposta,
 * H3 e "Explicar"), com o link da planta para aquele artigo, quando há.
 */
function notasDaPlanta(
  planta: RadarArticleBlueprintPayload,
  itens: ReadonlyArray<{ pergunta: string; artigo: { rotulo: string } | null }>,
  nucleo: ReadonlyArray<string | null | undefined>,
  nota: (pergunta: string, artigo: string, rotuloDoLink: string | null) => string,
): NonNullable<RadarArticleBlueprintColumnsOptions["sectionNotes"]> {
  const secoes = planta.blueprint.sections;
  const primeira = itens.map(item => secoes.findIndex(secao =>
    referenciaTrata([secao.h2, secao.readerQuestion, secao.answerFirst, ...secao.h3, ...secao.explain].map(valor => texto(valor)).filter(Boolean), nucleo)(item.pergunta)));
  return (_secao, indice, linkPara) => itens.flatMap((item, posicao) =>
    (primeira[posicao] === indice && item.artigo ? [nota(item.pergunta, item.artigo.rotulo, linkPara(item.artigo.rotulo))] : []));
}

/**
 * ===== UMA LINHA POR ARTIGO — o que é preciso para escrever, e nada além =====
 *
 * `contexto` diz onde o artigo está no arquivo (silo ou avulso) e o que se
 * sabe da página publicada. A entrada é a MESMA do formato completo.
 */
export function buildRadarWritingExportArticle(input: RadarPortableExportInput, contextoRecebido: RadarWritingArticleContext): RadarWritingExportArticle {
  const p = radarWritingProjections(input);
  /*
   * 2026-10-09 · SEM A PLANTA CONCLUÍDA, A LINHA NÃO É MONTADA (regra do dono:
   * o processo antigo é substituído, não fica de alternativa). A única exceção
   * é a investigação de vídeo como perfil primário, cuja linha é o bloqueio só
   * com a identidade.
   */
  const soIdentidade = input.profile === "YOUTUBE";
  const plantaRecebida = radarWritingBlueprintIsApproved(contextoRecebido.blueprint) ? contextoRecebido.blueprint : null;
  if (!plantaRecebida && pedePlanta(input.profile)) throw new RadarWritingNeedsArticleBlueprintError([contextoRecebido.articleId || texto(input.article.slug) || "artigo"]);
  /*
   * 2026-10-08 · B4 também aqui: o artigo-modelo com os nomes atuais de
   * produtos ("Perfil da Empresa no Google"), para valer em todo caminho que
   * monte esta linha — a leitura do servidor já troca; sem troca, o MESMO
   * objeto. A keyword que traz o nome antigo o preserva.
   */
  const plantaAtual = plantaRecebida ? radarArticleBlueprintWithCurrentNames(plantaRecebida, keywordsDoArtigo(p)) : null;
  const contexto: RadarWritingArticleContext = plantaAtual !== (contextoRecebido.blueprint ?? null) ? { ...contextoRecebido, blueprint: plantaAtual } : contextoRecebido;
  const membro = contexto.silo?.members.find(item => item.articleId === contexto.articleId) || null;
  const papel = papelDoMembro(membro) || papelLegivel(p.dna.siloRole);
  const posicao = membro?.position ?? contexto.filePosition;
  const principal = texto(p.dna.principalKeyword) || null;
  const rotulo = principal || texto(input.article.slug) || "artigo sem keyword";
  const publicacao = contexto.publication;
  const publicado = Boolean(publicacao?.published || input.article.publishedProtected);

  /*
   * 2026-10-02 · UMA régua de "não cobrir" para a linha inteira (pacote e
   * Silo), e o tipo da unidade para as frases que falavam só de artigo.
   * 2026-10-08 · P0-B · a régua sai ANTES da estrutura: o rótulo fora do escopo
   * e a pergunta que a coluna cobrir_e_superar manda para outro artigo ou tópico
   * do Silo (o mesmo item) saem de H2/H3 e do "Cobrir:" também.
   */
  /*
   * 2026-10-09 · Defeitos 3 e 5 · O "NÃO COBRIR" DA LINHA. (a) O rótulo
   * genérico que a estrutura de referência (a planta) trata sai (a referência
   * vence); (5) a exclusão da voz da marca entra como exclusão dura; (c) a
   * guarda das sugestões lê o que ficou, mais os diferenciais do pacote que o
   * tocam. 2026-10-09b · e as exclusões dos reajustes no ArticleDNA (pelo
   * contexto de pesquisa), duras como as do Silo: a planta não as libera.
   */
  const voz = contexto.brandVoiceExclusions || [];
  const nucleo = nucleoDoArtigo(p);
  const excluidosDoSilo = contexto.silo?.excludedTopics || [];
  const exclusoesDoDna = radarResearchContextScopeExclusions(input.researchContext);
  const rotulosDoDna = exclusoesDoDna.map(item => item.label);
  /* 2026-10-09 (correção) · a raiz única só vale num título da referência (H2, pergunta, H3, termos, negritos). */
  const referenciaCobre = radarWritingReferenceTreats(radarWritingReferenceTexts(contexto.blueprint ?? null, null), nucleo);
  const temReferencia = Boolean(contexto.blueprint);
  const foraMantidos = p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE" && !(temReferencia && referenciaCobre(item.observedLabel)));
  const tocaRotulos = radarWritingOutOfScopeMatcher({ labels: [...foraMantidos.map(item => item.observedLabel), ...excluidosDoSilo, ...rotulosDoDna], core: nucleo });
  const tocaForaDoEscopo = (valor: string | null | undefined) => tocaRotulos(valor) || Boolean(radarBrandVoiceExclusionOf(valor, voz));
  const rotulosDaGuarda = [...foraMantidos.map(item => item.observedLabel), ...excluidosDoSilo, ...rotulosDoDna, ...diferenciaisForaDoEscopo(p, tocaForaDoEscopo)];
  const guardaSemPerguntas = radarWritingSuggestionVeto({ labels: rotulosDaGuarda, core: nucleo, voice: voz });
  const perguntaDeAbertura = radarWritingOpeningQuestion(p, valor => tocaForaDoEscopo(valor) || Boolean(guardaSemPerguntas(valor)));
  const perguntas = perguntasDaLinha(p, contexto, perguntaDeAbertura, tocaForaDoEscopo, guardaSemPerguntas, temReferencia ? referenciaCobre : null);
  p.vetoDeSugestao = radarWritingSuggestionVeto({ labels: rotulosDaGuarda, questions: perguntas.foraDoFocoPerguntas, core: nucleo, voice: voz });

  /*
   * 2026-10-09 · A SEÇÃO É A DA PLANTA. O especialista e o trecho de vídeo
   * apontam a seção da planta (pela origem M de cada seção, ou, no
   * especialista, pela seção a que a planta o atribuiu); sem par na planta, o
   * ponto de aplicação do pacote, sem título de estrutura legada.
   */
  const tituloDe = tituloNaPlanta(contexto.blueprint ?? null);
  const especialista = radarWritingSpecialistContributions(p, tituloDe, contexto.blueprint ?? null);
  /*
   * 2026-10-02 · O TRECHO QUE VAI AO TEXTO É O DE VÍDEO CITÁVEL (Adendo B).
   *
   * Contexto ("ler para entender, não citar") e Sugestão de pauta ("ideia a
   * validar") não viram V no texto: eles aparecem no bloco dos modos da coluna
   * de fontes. "Não usar" já saiu na projeção. Sem modo, todo trecho é citável
   * e a lista é exatamente a de antes.
   */
  const citavel = (trecho: RadarPortableVideoExtract) => trecho.usage !== "CONTEXT" && trecho.usage !== "TOPIC_SUGGESTION";
  const videos = p.video.briefs
    .filter(brief => brief.coverage.startsWith("Sustentada") && brief.extracts.some(citavel))
    .flatMap(brief => brief.extracts.filter(citavel).slice(0, 1).map(trecho => ({ brief, trecho })))
    .map((item, indice) => {
      /* 2026-10-09 · a seção do trecho é a da planta que nasceu da seção da pauta; sem par na planta, a linha não cita seção. */
      const daPauta = p.secoes.find(secao => radarWritingCompareKey(secao.heading) === radarWritingCompareKey(item.brief.relatedSection))?.heading ?? null;
      const naPlanta = daPauta ? tituloDe(daPauta) : null;
      return {
        rotulo: `V${indice + 1}`,
        trecho: item.trecho,
        /* 2026-10-02 · o canal do vídeo, quando o modo de uso o trouxe: a atribuição é a ele. */
        linha: `V${indice + 1} · ${entreAspas(item.trecho.sourceTitle)}${texto(item.trecho.sourceChannel) ? ` · canal: ${texto(item.trecho.sourceChannel)}` : ""} (${item.trecho.startLabel}–${item.trecho.endLabel})${naPlanta ? ` · seção "${naPlanta}"` : ""} · ${semPontoFinal(item.brief.narrativePurpose)}${modoDoTrecho(item.trecho)}`,
      };
    });
  /*
   * 2026-10-02 · OS VÍDEOS DO ARTIGO AGORA, para o artigo-modelo aprovado
   * (Adendo B). O V da seção do plano é o do PEDIDO à IA; aqui ele vira título,
   * endereço e o V desta coluna de fontes, contra o modo vigente — "Não usar"
   * já saiu da projeção, então o vídeo que sumiu daqui é aviso, não instrução.
   * Só é usado quando há plano aprovado; sem ele, nada muda.
   */
  const rotuloNasFontes = new Map(videos.map(item => [item.trecho, item.rotulo]));
  const videosAoVivo: RadarArticleBlueprintLiveVideo[] = [
    ...p.video.briefs.flatMap(brief => brief.extracts.map(trecho => ({
      title: trecho.sourceTitle,
      url: trecho.sourceUrl ?? null,
      usage: trecho.usage ?? null,
      sourcesColumnLabel: rotuloNasFontes.get(trecho) ?? null,
    }))),
    ...(p.video.selected || []).map(item => ({ title: item.title, url: item.url, usage: item.usage, sourcesColumnLabel: null })),
  ];

  const unidade = p.unidade;
  const formas = daUnidade(unidade);

  /*
   * 2026-10-09 · Defeito 3(b) · o assunto de OUTRO ARTIGO do Silo que a planta
   * toca: a seção dela diz "só mencione e linke para <artigo>" (opção
   * `sectionNotes` das colunas da planta).
   */
  const deOutroArtigo = perguntas.foraDoFocoItens.filter(item => item.artigo);
  const notaDeOutroArtigo = (pergunta: string, artigo: string, rotuloDoLink: string | null) =>
    `- Outro artigo do Silo: ${entreAspas(pergunta)} é assunto do artigo ${entreAspas(artigo)}; aqui só mencione ${rotuloDoLink ? `e linke para ${entreAspas(artigo)} (link ${rotuloDoLink})` : `${entreAspas(artigo)} ${RADAR_WRITING_NO_APPROVED_LINK}`}, sem responder a pergunta.`;
  /* 2026-10-09 · "cobrir e superar" pela planta: o blueprint competitivo é só entrada do gerador do artigo-modelo. */
  const cobrir = colunaCobrir(input, p, contexto, tocaForaDoEscopo, perguntas, { foraDoEscopo: foraMantidos, voz, dna: exclusoesDoDna });

  /* ---- o veredito ---- */
  const bloqueios: string[] = [];
  const ressalvas: string[] = [];
  if (p.prontidao?.state === "BLOCKED") {
    bloqueios.push(`a plataforma recusaria este dossiê: ${p.prontidao.reasons.join("; ")} (${p.prontidao.actions.join("; ")})`);
  }
  if (input.profile === "YOUTUBE") {
    bloqueios.push("a investigação deste artigo foi feita para vídeo do YouTube: a estrutura é roteiro e não há SERP de artigo; para escrever texto, a pesquisa precisa ser feita no perfil Google");
  }
  if (input.commercial && !input.commercial.links.length) {
    const contagem = input.commercial.counts ? ` (${input.commercial.counts.observed} observados, ${input.commercial.counts.eligible} compatíveis com o alvo)` : "";
    /*
     * 2026-10-09 (correção) · no perfil AMAZON a lista É o artigo: sem produto, bloqueia
     * (como antes). Com o Google como base, a review é uma parte do artigo — a decisão
     * de bloquear o artigo inteiro é do dono; até lá, a ressalva concluída tira a parte
     * de produtos do texto, sem inventar produto.
     */
    if (input.profile === "AMAZON") {
      const formato = formatoLegivel(input, p.editorial) || "lista de produtos";
      bloqueios.push(`formato ${formato}, mas nenhum produto foi selecionado${contagem}; não há lista a construir`);
    } else {
      ressalvas.push(`nenhum produto da Amazon foi selecionado${contagem}: a parte de review fica fora do texto, e nenhum produto que não está no arquivo entra`);
    }
  }
  /* 2026-10-09 · a estrutura é a da planta: a falta de seções no modelo editorial da SERP não bloqueia nada (ele é só entrada do gerador). */

  const conflitoYmyl = conflitoDeYmylDetalhado(p);
  if (conflitoYmyl) ressalvas.push(conflitoYmyl.texto);
  /* A afirmação que o conflito já nomeia não vira um segundo motivo com a mesma frase. */
  const jaNoConflito = new Set(conflitoYmyl?.nomeadas || []);
  const semFonte = unicosPorChave(radarWritingUnsupportedClaims(p.autoridade, p.serp), item => radarWritingCompareKey(item.afirmacao))
    .filter(item => !jaNoConflito.has(radarWritingCompareKey(item.afirmacao)));
  const sensivel = temaSensivel(p);
  if (semFonte.length) {
    const varias = semFonte.length > 1;
    ressalvas.push(`${semFonte.slice(0, 2).map(item => entreAspas(radarWritingDecodeEntities(item.afirmacao))).join(" e ")} ${varias ? "são afirmações" : "é afirmação"}${sensivel ? (varias ? " sensíveis" : " sensível") : ""} sem fonte verificada: escreva de forma qualificada ou omita`);
  }
  const desejados = input.commercial?.setup?.intent.desiredCount ?? input.amazon?.setup?.intent.desiredCount ?? null;
  if (input.commercial?.links.length && desejados && input.commercial.links.length < desejados) {
    ressalvas.push(`o formato pede ${desejados} produtos e só ${input.commercial.links.length} foi(ram) selecionado(s): não complete a lista com produto que não está no arquivo`);
  }
  if (publicado && !publicacao?.currentStructure) {
    ressalvas.push("estrutura publicada atual indisponível: trate como atualização, preservando URL, slug, canonical e as seções existentes, sem remover conteúdo sem decisão humana");
  }
  const politica = radarWritingCompareKey(publicacao?.principalPolicy);
  if (publicado && politica !== "locked" && politica !== "revisable") ressalvas.push("principal publicada em estado desconhecido: não trocar até decisão humana");
  /* 2026-10-09 · título e promessa são os da planta: o título de trabalho e a promessa do modelo editorial não viram ressalva. */
  /* 2026-10-08 · P1 · a SERP que responde a outra intenção: decisão do Arquiteto, dita sem bloquear. */
  const intencaoDivergente = input.profile === "GOOGLE" ? divergenciaDeIntencao(input) : null;
  if (intencaoDivergente) ressalvas.push(intencaoDivergente);
  for (const item of especialista) if (item.aviso) ressalvas.push(`especialista ${item.rotulo}: ${item.aviso}`);
  ressalvas.push(...cobrir.conflitos);
  /* 2026-10-08 · a planta que já posiciona links internos (coluna links_internos dela) não deixa o artigo isolado do Silo. */
  const plantaComLinks = Boolean(contexto.blueprint?.blueprint.sections.some(secao => secao.internalLinks.length));
  if (artigoDeSilo(contexto) && !haPlanoDeLinks(p) && !plantaComLinks && input.profile !== "YOUTUBE") {
    ressalvas.push(`sem links internos no pacote: ${formas.o} ${unidade.noun} sai isolad${formas.terminacao} do Silo (sem link para o Pilar nem para a SiloPage) até o Arquiteto definir o plano de links`);
  }
  const decisao = veredito(bloqueios, ressalvas);
  /*
   * BLOQUEIO DE PERFIL: a pesquisa foi feita para vídeo, não para texto
   * (`soIdentidade`, no começo da função).
   *
   * Roteiro, SERP de vídeo e plano visual de roteiro não servem para escrever
   * o artigo — e a linha ficava com ~4 mil caracteres que não devem ser
   * usados. Ela se reduz à ordem, ao veredito e à identidade do artigo. O
   * formato completo continua com tudo, para auditoria.
   */

  /* ---- as linhas específicas do prompt: o bloqueio, o publicado e o comercial ---- */
  const especificas = [
    ...(decisao.verdict === "Com ressalva" && decisao.primeira ? [decisao.primeira] : []),
    ...(publicado ? [
      /* 2026-10-08 · C2 · com o mapa da atualização (artigo-modelo e H2 publicados), o prompt aponta para ele. */
      contexto.blueprint && (publicacao?.currentStructure?.h2.length || contexto.blueprint.publishedStructure?.h2.length)
        ? `${formas.Nome} publicad${formas.terminacao}: é atualização; preserve URL, slug e canonical e siga o mapa da página publicada (coluna artigo): nenhuma seção existente sai sem decisão registrada no artigo-modelo`
        : `${formas.Nome} publicad${formas.terminacao}: é atualização; preserve URL, slug e canonical e não remova seção existente sem decisão humana`,
      /* 2026-10-02 · a MESMA frase do FAQ legado da regra geral e da coluna artigo (AGENTS §13). */
      RADAR_WRITING_LEGACY_FAQ,
    ] : []),
    ...(input.commercial?.disclosureRequired ? ["Coloque o aviso de afiliado antes do primeiro link de produto"] : []),
  ].slice(0, publicado ? 4 : 3);

  const conteudo = (celula: () => string): string => (soIdentidade ? "" : celula());
  /*
   * 2026-10-09 · AS COLUNAS DE PLANTA SÃO SÓ DA PLANTA: título e SEO, promessa e
   * leitor, estrutura, links e plano visual saem do artigo-modelo concluído —
   * nunca do modelo editorial nem do blueprint competitivo (regra do dono). Sem
   * planta (só a investigação de vídeo como perfil primário chega aqui sem
   * ela), essas colunas ficam vazias, com a linha só de identidade.
   */
  const linha: RadarWritingExportRow = {
    ordem: `${posicao} · ${papel || "Artigo"}`,
    pode_escrever: decisao.celula,
    artigo: colunaArtigo(input, p, contexto, papel),
    promessa_e_leitor: "",
    titulo_e_seo: "",
    estrutura: "",
    cobrir_e_superar: conteudo(() => cobrir.celula),
    serp_resumida: conteudo(() => colunaSerp(input, p)),
    fontes_e_especialista: conteudo(() => colunaFontes(p, especialista, videos, contexto.blueprint ?? null)),
    links_internos: "",
    plano_visual: "",
    produtos: conteudo(() => colunaProdutos(input)),
    prompt: colunaPrompt(contexto, especificas, decisao.verdict === "Não" ? decisao.primeira : null, unidade),
  };
  /*
   * O artigo-modelo APROVADO decide as colunas de planta.
   * 2026-10-08 · C2 e C4 · a planta recebe a trava de fonte (as afirmações do
   * pacote e as raízes de cenário, como no CSV de vídeo) e os H2 publicados,
   * para marcar a frase que só entra com fonte e o destino de cada H2.
   */
  if (contexto.blueprint && !soIdentidade) {
    Object.assign(linha, radarArticleBlueprintColumns(contexto.blueprint, videosAoVivo, { slug: texto(publicacao?.slug) || texto(input.article.slug), publishedUrl: texto(publicacao?.publishedUrl) }, radarWritingDomainLenses(p.lentes), {
      /* 2026-10-09b · as exclusões dos reajustes no ArticleDNA: a seção da planta que as cobre sai, com a nota concluída. */
      ...(exclusoesDoDna.length ? { exclusions: { items: exclusoesDoDna, core: keywordsDoArtigo(p) } } : {}),
      pendentes: radarPendingClaims(p, contexto.blueprint),
      comuns: radarClaimCommonStems(p, contexto.blueprint),
      /* 2026-10-08 (correção da revisão) · a principal, para a ordem de leitura da busca "como …" também na planta antiga. */
      principal: texto(p.dna.principalKeyword),
      ...(publicado ? { currentH2: publicacao?.currentStructure?.h2 ?? null, keywords: keywordsDoArtigo(p) } : {}),
      /* 2026-10-08 (correção) · F1 · os irmãos no ar (do mapa de publicações do lote): o destino planejado da planta sai publicado. */
      publishedMembers: irmaosNoAr(contexto),
      /*
       * 2026-10-08 (correção) · F2 · UM CTA SÓ TAMBÉM NA PLANTA: a chamada do
       * especialista (quando ele é CTA) ou a da planta; o "Próximo passo" vira a
       * continuação para o próximo artigo do Silo, com o link aprovado ou citado
       * sem link — a mesma linha do caminho sem planta.
       */
      continuation: destinoDaContinuacao(contexto),
      specialistCta: vozDoEspecialista(especialista, "CTA").map(falaDoEspecialista).join("; ") || null,
      /*
       * 2026-10-09 · Defeito 2 · UMA BASE SÓ também na planta gravada: o "(N de M
       * páginas)" das evidências reescrito pela base única (sem IA; a planta não
       * muda) e a linha "Concorrentes comparáveis" com as medidas da base.
       */
      evidenceText: evidencia => radarSampleBasisRewriteCount(evidencia.text, p.base, p.fontesDaBase, evidencia.id),
      ...(p.base ? { sampleMeasures: { ...radarArticleBlueprintMeasures(p.base.pages.map(pagina => pagina.structure)), label: radarSampleBasisLabel(p.base) } } : {}),
      /* 2026-10-09 · Defeito 3(b) · a seção da planta que toca o assunto de outro artigo do Silo: só menciona e linka. */
      ...(deOutroArtigo.length ? { sectionNotes: notasDaPlanta(contexto.blueprint, deOutroArtigo, nucleo, notaDeOutroArtigo) } : {}),
    }));
  }
  if (contexto.brandVoice && !soIdentidade) {
    linha.promessa_e_leitor = [
      linha.promessa_e_leitor,
      `Voz da marca: copy, CTA e transição comercial seguem a linha "Voz da marca" deste arquivo (Skill "${contexto.brandVoice.name}" v${contexto.brandVoice.version}). Oferta e página comercial só como a Skill e o plano de links permitem; sem inventar preço, prazo nem garantia.`,
    ].filter(Boolean).join("\n");
  }

  return {
    row: finalizarLinha(linha),
    verdict: decisao.verdict,
    label: rotulo,
    firstReason: decisao.primeira,
    healthTopic: sensivel,
    published: publicado,
    ...(unidade.kind !== "article" ? { unitNoun: unidade.noun } : {}),
  };
}

export function buildRadarWritingExportRow(input: RadarPortableExportInput, contexto: RadarWritingArticleContext): RadarWritingExportRow {
  return buildRadarWritingExportArticle(input, contexto).row;
}

/* ============================== a linha de topo ============================== */

export const RADAR_WRITING_GENERAL_RULES = [
  "Escreva em português do Brasil, na voz da marca. A voz não faz parte deste arquivo: cole-a junto antes de pedir o texto a uma IA.",
  /* 2026-10-02 · o FAQ legado na MESMA frase da coluna artigo e do prompt do publicado (AGENTS §13). */
  `Sem seção de perguntas frequentes (FAQ): as perguntas são respondidas dentro das seções. ${RADAR_WRITING_LEGACY_FAQ}`,
  "Dado de terceiros é pesquisa: não copie frases, títulos, trechos, transcrições nem avaliações.",
  /* 2026-10-08 · C8 · sem marcador por preencher (D10): sem experiência própria da marca, o texto sai sem relato e sem inventá-lo. */
  "Não invente fatos, números, estudos, preços, produtos, autores, credenciais, depoimentos nem URLs; onde faltar experiência própria da marca, escreva sem relato e sem inventá-lo, sem marcador no texto.",
  "Afirmação marcada \"precisa de fonte\" só entra com uma das fontes listadas; sem fonte, escreva de forma qualificada ou omita. Tema de saúde pede autor e revisor reais.",
  "Conflito entre fonte factual e o que o mercado repete fica escrito dos dois lados.",
  "Cada seção abre respondendo a pergunta dela, nomeando o termo, de forma compreensível fora da página.",
  "Imagens: uma capa e dois ou três respiros, no ponto indicado em cada artigo. Tom visual: editorial e direto, fotografia ou ilustração de contexto real; a imagem serve à compreensão, não à decoração.",
  "Links internos: só os indicados em cada artigo (L1, L2…), com a âncora e o destino dados; sem criar outros.",
  /* 2026-10-09 · a estrutura é a do artigo-modelo (regra do dono: o fundamento único); a redação continua de quem escreve. */
  "A estrutura de cada artigo é a do artigo-modelo da SERP (coluna estrutura): siga as seções, as medidas, os links e as imagens da planta; a redação é de quem escreve.",
  "Ler não é mudar: se o que você apurar divergir da definição do artigo, registre a divergência para decisão humana; o texto não redefine keyword, intenção nem Silo.",
] as const;

export type RadarWritingTopRowInput = {
  label: "Silo" | "Marca";
  silo: RadarSiloExportWritingContext | null;
  articles: ReadonlyArray<Pick<RadarWritingExportArticle, "label" | "verdict" | "firstReason" | "healthTopic" | "published" | "unitNoun">>;
  /** Um endereço da marca já lido (SiloPage ou canonical), só para dizer o site. */
  siteUrl: string | null;
  /** A lista "Evitar" das imagens, quando é a mesma em todos os artigos do arquivo. */
  sharedVisualAvoid?: string | null;
  /** 2026-10-02 · Aditivo: export dos selecionados com o Silo na linha de cada artigo. */
  siloPerRow?: boolean;
  /** 2026-10-02 · Aditivo: a voz da marca (Adendo C). Ausente = texto de antes. */
  brandVoice?: RadarBrandVoiceState;
  /** 2026-10-02 · Aditivo: a autoria foi lida (cada artigo diz quem assina). Ausente = texto de antes. */
  authorsKnown?: boolean;
  /** 2026-10-08 · P1 · Aditivo: a publicação de cada membro do Silo, por `articleId`, para a ordem narrativa dizer "publicado" também dos que estão fora do arquivo. */
  memberPublications?: ReadonlyMap<string, RadarWritingPublication> | null;
};

/**
 * ===== A LINHA DE TOPO: o Silo (ou a Marca) UMA vez só =====
 *
 * O formato completo repetia o contexto do silo em cada linha. Aqui ele vem
 * uma vez, com a ordem narrativa inteira — inclusive os artigos que ficaram
 * fora do arquivo, para que os links resolvam — e as regras gerais de escrita.
 *
 * A voz da marca, o autor e o revisor NÃO estão no pacote do Radar e não são
 * lidos na exportação: a falta é dita aqui, uma vez, em vez de inventada.
 */
export function buildRadarWritingTopRow(input: RadarWritingTopRowInput): RadarWritingExportRow {
  const silo = input.silo && input.silo.kind === "silo" ? input.silo : null;
  const artigos = input.articles;
  const bloqueados = artigos.filter(item => item.verdict === "Não");
  const fora = (silo?.members || []).filter(membro => !membro.inThisFile);
  const saude = artigos.some(item => item.healthTopic);
  /*
   * 2026-10-02 · ARQUIVO COM LANDING PAGE, PÁGINA DE SERVIÇO OU REVIEW: as
   * regras valem para "artigos e páginas", e "cada artigo" vira "cada artigo ou
   * página". Só artigos: o texto de antes, byte a byte.
   */
  const comPaginas = artigos.some(item => Boolean(item.unitNoun));
  const paraAsUnidades = (frase: string) => (comPaginas ? frase.replace(/\bcada artigo\b/g, "cada artigo ou página").replace(/\bdo artigo\b/g, "do artigo ou da página") : frase);

  const resumo = silo
    ? `${artigos.length} de ${silo.members.length} artigos do Silo estão neste arquivo`
    : `${artigos.length} artigo(s) neste arquivo`;
  const motivos = [
    `${resumo}${bloqueados.length ? `; ${bloqueados.length} com bloqueio (${bloqueados.slice(0, 4).map(item => entreAspas(item.label)).join(", ")})` : ""}`,
    ...(fora.length ? [`fora do arquivo: ${fora.slice(0, 6).map(membro => `${entreAspas(rotuloDoMembro(membro))} (${membro.statusLabel})`).join(", ")}`] : []),
    input.authorsKnown
      ? paraAsUnidades(`autoria: cada artigo diz quem assina (o especialista da aba Especialista); revisor não faz parte deste arquivo${saude ? " (há tema de saúde: autoria e revisão reais são exigidas)" : ""}`)
      : `${input.brandVoice?.kind === "available" ? "autor e revisor" : "voz da marca, autor e revisor"} não fazem parte deste arquivo: defina-os antes de publicar${saude ? " (há tema de saúde: autoria e revisão reais são exigidas)" : ""}`,
    ...(silo?.draft ? ["o Silo está em formação no Arquiteto: a composição pode mudar"] : []),
  ];
  const verdict: RadarWritingVerdict = artigos.length && bloqueados.length === artigos.length ? "Não" : "Com ressalva";
  const pode = [
    `${verdict}: ${comPontoFinal(motivos[0])}`,
    ...motivos.slice(1).map(item => `- ${comPontoFinal(item)}`),
  ].join("\n");

  const site = origemDe(input.siteUrl);
  const pagina = silo?.siloPage || null;
  const enderecoDaPagina = pagina ? pagina.publishedUrl || pagina.canonical || (pagina.slug ? `/${pagina.slug}` : null) : null;
  const artigo = silo
    ? [
      `Silo: ${silo.label}`,
      ...(pagina ? [`SiloPage: ${enderecoDaPagina || "endereço não registrado"} (${pagina.status})`] : []),
      ...(util(silo.centralEntity) ? [`Tema central: ${silo.centralEntity}`] : []),
      ...(util(silo.objective) ? [`Objetivo do Silo: ${comPontoFinal(silo.objective || "")}`] : []),
      ...(util(silo.macroProblem) && !/pendente/i.test(silo.macroProblem || "") ? [`Problema do leitor: ${comPontoFinal(silo.macroProblem || "")}`] : []),
      ...(util(silo.whyTogether) && !/derivada pelo processamento/i.test(silo.whyTogether || "") ? [`Por que os artigos andam juntos: ${comPontoFinal(silo.whyTogether || "")}`] : []),
      ...(silo.includedTopics.length ? [`Tópicos incluídos: ${silo.includedTopics.join(" · ")}`] : []),
      ...(silo.excludedTopics.length ? [`Fora do Silo (não cobrir): ${silo.excludedTopics.join(" · ")}`] : []),
      ...(util(silo.boundary) ? [`Fronteira: ${comPontoFinal(silo.boundary || "")}`] : []),
      "Ordem narrativa:",
      ...silo.members.map(membro => {
        const publicado = artigos.find(item => radarWritingCompareKey(item.label) === radarWritingCompareKey(membro.principalKeyword))?.published
          || Boolean(input.memberPublications?.get(membro.articleId)?.published);
        return `${membro.position} · ${papelLegivel(membro.role) || membro.role} · ${rotuloDoMembro(membro)}${membro.slug ? ` · /${membro.slug}` : ""} · ${membro.inThisFile ? "neste arquivo" : `fora do arquivo (${membro.statusLabel})`}${publicado ? " · publicado" : ""}`;
      }),
    ].join("\n")
    : [
      input.silo?.kind === "no_silo"
        ? "Artigos sem silo resolvido no Radar: escreva cada um sem pressupor ordem narrativa, papel no Silo nem artigos irmãos."
        : input.siloPerRow
          ? "Artigos selecionados de mais de um Silo: o Silo, o papel, a ordem narrativa e os destinos dos links de cada um vão na linha do próprio artigo."
          : "Artigos avulsos, sem o contexto do Silo: exporte o Silo completo para ter a ordem narrativa e os destinos dos links.",
      "Artigos neste arquivo:",
      ...artigos.map((item, indice) => `${indice + 1} · ${item.label}${item.published ? " · publicado" : ""}`),
    ].join("\n");

  const audiencia = silo && util(silo.audience) ? silo.audience : null;
  /* 2026-10-08 · C1 · D10: o rótulo de entregável (a versão corrente, nunca "em rascunho" nem "aguardando aprovação"). */
  const marca = [
    `Marca: ${site ? `site ${site}` : "site não registrado neste arquivo"}.`,
    ...(input.brandVoice?.kind === "available"
      ? [`Voz da marca: aplique a linha "Voz da marca", logo abaixo (${radarBrandVoiceDeliverableLabel(input.brandVoice.voice)}). ${input.authorsKnown ? paraAsUnidades("Autoria: na linha de cada artigo (especialista da aba Especialista).") : "Autor e revisor: não fazem parte deste arquivo."} Não invente autor, credencial nem depoimento.`]
      : input.brandVoice
        ? [radarBrandVoiceAbsence(input.brandVoice) || "", "Autor e revisor: não fazem parte deste arquivo. Não invente autor, credencial nem depoimento."]
        : ["Voz, tom, autor e revisor: não fazem parte deste arquivo; cole-os antes de pedir o texto a uma IA. Não invente autor, credencial nem depoimento."]),
    ...(audiencia ? [`Público do Silo: ${comPontoFinal(audiencia)}`] : []),
  ].join("\n");

  const regras = [
    `Regras gerais para todos os ${comPaginas ? "artigos e páginas" : "artigos"} deste arquivo (valem para cada linha abaixo):`,
    ...RADAR_WRITING_GENERAL_RULES.map((regra, indice) => `${indice + 1}. ${indice === 0 && input.brandVoice?.kind === "available" ? "Escreva em português do Brasil, na voz da marca da linha \"Voz da marca\" deste arquivo." : paraAsUnidades(regra)}`),
    `${RADAR_WRITING_GENERAL_RULES.length + 1}. Não altere: ${naoAltere(false).join("; ")}.`,
    ...(texto(input.sharedVisualAvoid) ? [`${RADAR_WRITING_GENERAL_RULES.length + 2}. Imagens, em todos os ${comPaginas ? "artigos e páginas" : "artigos"} deste arquivo — ${texto(input.sharedVisualAvoid).replace(/^Evitar: /, "evitar: ")}`] : []),
  ].join("\n");

  return finalizarLinha({
    ordem: input.label,
    pode_escrever: pode,
    artigo,
    promessa_e_leitor: marca,
    titulo_e_seo: "",
    estrutura: "",
    cobrir_e_superar: "",
    serp_resumida: "",
    fontes_e_especialista: "",
    links_internos: "",
    plano_visual: "",
    produtos: "",
    prompt: regras,
  });
}

/**
 * ===== A LINHA "VOZ DA MARCA" (SDD diretriz editorial, Adendo C — 2026-10-02) =====
 *
 * A Skill ativa da Marca, inteira, distribuída pelas colunas do mesmo assunto:
 * leitor e oferta em promessa_e_leitor, título e abertura em titulo_e_seo,
 * estrutura e transição comercial em estrutura, SERP e exclusões em
 * cobrir_e_superar, fontes, links, plano visual; voz, vocabulário e critérios no
 * prompt. Vale para todas as linhas do arquivo. Sem Skill ativa, a linha não existe.
 */
export function buildRadarWritingBrandVoiceRow(state: RadarBrandVoiceState | undefined): RadarWritingExportRow | null {
  if (state?.kind !== "available") return null;
  const voz = state.voice;
  const por = radarBrandVoiceBySlot(voz);
  /* 2026-10-08 · C1 · D10: "Versão 1 da Skill de voz, corrente na Marca." — o estado de tela ("em rascunho") fica nas telas do Radar e da Marca. */
  return finalizarLinha({
    ordem: "Voz da marca",
    pode_escrever: `Vale para todas as linhas deste arquivo: ${radarBrandVoiceDeliverableLabel(voz)}. O dossiê de cada artigo decide o assunto; esta linha decide a forma, o CTA e o que a marca não faz. Em conflito, registre a divergência para decisão humana.`,
    artigo: `${voz.title || voz.name}\nVersão ${voz.version} da Skill de voz, ${radarBrandVoiceDeliverableStatusLabel(voz.status)} na Marca.`,
    promessa_e_leitor: radarBrandVoiceText(por.reader),
    titulo_e_seo: radarBrandVoiceText(por.title),
    estrutura: radarBrandVoiceText(por.structure),
    cobrir_e_superar: radarBrandVoiceText(por.research),
    serp_resumida: "",
    fontes_e_especialista: radarBrandVoiceText(por.sources),
    links_internos: radarBrandVoiceText(por.links),
    plano_visual: radarBrandVoiceText(por.visual),
    produtos: "",
    prompt: radarBrandVoiceText(por.voice),
  });
}

/**
 * A LISTA "EVITAR" DAS IMAGENS, QUANDO É A MESMA EM TODOS OS ARTIGOS, SOBE PARA O TOPO.
 *
 * O plano visual traz as mesmas restrições em cada artigo (~350 caracteres
 * repetidos por linha). Se todas as linhas com plano visual trazem a MESMA
 * lista, ela sai delas e vai uma vez para as regras da linha de topo. Se uma
 * só for diferente, nada muda: cada artigo continua com a sua.
 */
export function radarWritingShareVisualAvoid(rows: readonly RadarWritingExportRow[]): { rows: RadarWritingExportRow[]; shared: string | null } {
  const linhaEvitar = (celula: string): string | null => celula.split("\n").find(linha => linha.startsWith(EVITAR)) ?? null;
  const comPlano = rows.filter(row => row.plano_visual);
  const listas = comPlano.map(row => linhaEvitar(row.plano_visual));
  const comum = listas[0] ?? null;
  if (comPlano.length < 2 || !comum || listas.some(item => item !== comum)) return { rows: [...rows], shared: null };
  return {
    rows: rows.map(row => (row.plano_visual ? { ...row, plano_visual: row.plano_visual.split("\n").filter(linha => linha !== comum).join("\n") } : row)),
    shared: comum,
  };
}

/* ============================== o arquivo ============================== */

/**
 * AS 13 COLUNAS, SEMPRE NA MESMA ORDEM — e o mesmo escape do formato completo.
 *
 * UTF-8 com BOM, vírgula, toda célula entre aspas, CRLF entre linhas e `\n`
 * dentro da célula. As colunas deixam de ser a união das chaves por linha:
 * todo arquivo "Para escrever" tem o mesmo cabeçalho.
 */
export function radarWritingExportCsv(rows: readonly RadarWritingExportRow[]): string {
  if (!rows.length) return "";
  const celula = (valor: string) => `"${valor.replaceAll("\"", "\"\"")}"`;
  const linhas = [
    RADAR_WRITING_EXPORT_COLUMNS.map(celula).join(","),
    ...rows.map(row => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => celula(row[coluna] ?? "")).join(",")),
  ];
  return `﻿${linhas.join("\r\n")}\r\n`;
}

const nomeLimpo = (valor: string) => valor
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60)
  .replace(/-+$/, "");

/** O nome do arquivo por silo: o do formato completo, com "para-escrever" — e sem o prefixo "radar-". */
export function radarWritingExportSiloFilename(nomeCompleto: string): string {
  const silo = nomeCompleto.match(/^radar-silo-(.+)-(\d{4}-\d{2}-\d{2})(-parcial)?\.csv$/);
  if (silo) return `silo-${silo[1]}-para-escrever-${silo[2]}${silo[3] || ""}.csv`;
  const semSilo = nomeCompleto.match(/^radar-sem-silo(-\d+)?-(\d{4}-\d{2}-\d{2})\.csv$/);
  if (semSilo) return `sem-silo${semSilo[1] || ""}-para-escrever-${semSilo[2]}.csv`;
  return nomeCompleto.replace(/\.csv$/, "-para-escrever.csv");
}

export function radarWritingExportBatchFilename(input: { articles: readonly { slug: string | null; keyword: string | null }[]; today: string }): string {
  if (input.articles.length === 1) {
    const unico = input.articles[0];
    const base = nomeLimpo(texto(unico.slug) || texto(unico.keyword) || "artigo");
    return `artigo-${base || "artigo"}-para-escrever.csv`;
  }
  return `artigos-para-escrever-${input.today.slice(0, 10)}.csv`;
}

export function radarWritingExportArchiveFilename(today: string): string {
  return `silos-para-escrever-${today.slice(0, 10)}.zip`;
}
