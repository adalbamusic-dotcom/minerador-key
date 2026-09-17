/**
 * ============ O PERFIL DE PESQUISA — RADAR_RESEARCH_PROFILES_1 ============
 *
 * A chavinha do Radar nunca escolheu "onde pesquisar". Ela escolhe QUE
 * RADIOGRAFIA COMPETITIVA queremos produzir sobre a intenção:
 *
 *   GOOGLE   como essa intenção é disputada em PÁGINA. O Google é a autoridade
 *            principal, e não há apoio: ele já é a pesquisa inteira.
 *   YOUTUBE  como essa intenção é disputada em VÍDEO. A autoridade competitiva
 *            é o YouTube; o Google entra para dizer como a busca geral formula
 *            a mesma intenção e o que ajuda o vídeo a se posicionar.
 *   AMAZON   como essa intenção é disputada em PRODUTO. A autoridade é a
 *            Amazon; o Google entra com a camada de descoberta e comparação.
 *
 * ===================== POR QUE ISSO NÃO É "FONTES" =====================
 *
 * O 1.1 mostrou as três fontes lado a lado e deu à pessoa um botão para somar
 * a leitura do Google quando quisesse. Parecia liberdade e era armadilha: o
 * Google de apoio entrava pelo caminho da investigação Google PRINCIPAL, que
 * exige snapshot canônico, curadoria e seleção de concorrentes — e o runtime
 * respondia "este snapshot não possui payload canônico completo".
 *
 * Duas coisas estavam erradas ao mesmo tempo. O apoio não é uma investigação
 * Google menor; é uma CAMADA dentro da investigação de vídeo. E somar fonte não
 * era decisão que a pessoa devesse tomar clique a clique: o perfil já responde.
 *
 * ========================= UM START, UM PACOTE =========================
 *
 * Uma ação do usuário produz UM pacote de investigação. No perfil YouTube isso
 * são duas coletas — a principal e o apoio —, não dois fluxos: um `runId`, um
 * status composto, um FINALIZE.
 *
 * O apoio é UMA leitura, sobre a keyword principal. Repeti-lo para as três
 * consultas do YouTube triplicaria o custo para responder três vezes a mesma
 * pergunta ("como a busca geral formula esta intenção?").
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import {
  RADAR_RESEARCH_SOURCES,
  RadarPrimarySearchModeSchema,
  radarResearchSourceLabel,
  type RadarPrimarySearchMode,
  type RadarResearchSource,
} from "./search-mode.ts";

/* ===================== os três perfis canônicos — §1 ===================== */

export const RADAR_RESEARCH_PROFILES = ["GOOGLE", "YOUTUBE", "AMAZON"] as const;
export const RadarResearchProfileSchema = z.enum(RADAR_RESEARCH_PROFILES);
export type RadarResearchProfile = typeof RADAR_RESEARCH_PROFILES[number];

/**
 * O PAPEL ESTÁ NO DADO, NÃO NA TELA — §4.
 *
 * "Apoio" é rótulo; `SEO_SUPPORT` é contrato. A diferença aparece quando o
 * Planejador lê a investigação meses depois e precisa saber se aquela SERP do
 * Google foi a radiografia principal ou a camada que sustentava um vídeo — as
 * duas produzem o mesmo snapshot e significam coisas opostas.
 */
export const RADAR_RESEARCH_SOURCE_ROLES = [
  "PRIMARY_COMPETITIVE_RESEARCH",
  "SEO_SUPPORT",
  "SEO_COMMERCIAL_SUPPORT",
] as const;
export const RadarResearchSourceRoleSchema = z.enum(RADAR_RESEARCH_SOURCE_ROLES);
export type RadarResearchSourceRole = typeof RADAR_RESEARCH_SOURCE_ROLES[number];

export const RADAR_RESEARCH_SOURCE_ROLE_LABELS: Record<RadarResearchSourceRole, string> = {
  PRIMARY_COMPETITIVE_RESEARCH: "pesquisa principal",
  SEO_SUPPORT: "apoio SEO",
  SEO_COMMERCIAL_SUPPORT: "apoio SEO e comercial",
};

export type RadarResearchProfilePlan = {
  profile: RadarResearchProfile;
  /** O alvo editorial correspondente. O vocabulário antigo continua valendo. */
  primaryTarget: RadarPrimarySearchMode;
  primarySource: RadarResearchSource;
  /** Vazio no perfil Google: ele já É a pesquisa principal. */
  supportSources: readonly RadarResearchSource[];
  supportRole: RadarResearchSourceRole | null;
  label: string;
  startLabel: string;
  /** O que o perfil produz. Aparece na tela, no lugar de "fontes". */
  purpose: string;
  /** A pergunta que o apoio responde. `null` quando não há apoio. */
  supportPurpose: string | null;
};

/**
 * ================== O CONTRATO DOS TRÊS PERFIS — §1 e §12 ==================
 *
 * A Amazon entra aqui ANTES de ter coletor. Não é adiantamento: é o que impede
 * que ela chegue exigindo arquitetura nova. O perfil existe, o papel do apoio
 * dela está declarado, e o que falta é uma coleta — não uma decisão.
 */
export const RADAR_RESEARCH_PROFILE_PLANS: Record<RadarResearchProfile, RadarResearchProfilePlan> = {
  GOOGLE: {
    profile: "GOOGLE",
    primaryTarget: "WEB",
    primarySource: "WEB_SERP",
    supportSources: [],
    supportRole: null,
    label: "Google",
    startLabel: "Iniciar pesquisa no Google",
    purpose: "Radiografia competitiva da intenção em página: quem ocupa a SERP, com que estrutura e que cobertura.",
    supportPurpose: null,
  },
  YOUTUBE: {
    profile: "YOUTUBE",
    primaryTarget: "YOUTUBE",
    primarySource: "YOUTUBE_SERP",
    supportSources: ["WEB_SERP"],
    supportRole: "SEO_SUPPORT",
    label: "YouTube",
    startLabel: "Iniciar pesquisa no YouTube",
    purpose: "Radiografia competitiva da intenção em vídeo: quem vence no YouTube, com que formato, título e duração.",
    supportPurpose: "Como a busca geral formula esta intenção, que perguntas existem e o que ajuda o vídeo a se posicionar.",
  },
  AMAZON: {
    profile: "AMAZON",
    primaryTarget: "AMAZON",
    primarySource: "AMAZON_SERP",
    supportSources: ["WEB_SERP"],
    supportRole: "SEO_COMMERCIAL_SUPPORT",
    label: "Amazon",
    startLabel: "Iniciar pesquisa na Amazon",
    purpose: "Radiografia competitiva da intenção em produto: quem vende, com que atributos, faixa de preço e objeções.",
    supportPurpose: "Como a intenção comercial aparece na busca geral: comparações, produtos exibidos e oportunidades de descoberta.",
  },
};

export const RADAR_DEFAULT_RESEARCH_PROFILE: RadarResearchProfile = "GOOGLE";

export const radarResearchProfileLabel = (profile: RadarResearchProfile) =>
  RADAR_RESEARCH_PROFILE_PLANS[profile].label;

/**
 * A TRADUÇÃO PARA O VOCABULÁRIO ANTIGO — e ela existe nos dois sentidos.
 *
 * `primaryTarget` é `WEB | YOUTUBE | AMAZON` e está gravado em toda análise já
 * existente. Renomeá-lo para `GOOGLE` quebraria a leitura do passado por uma
 * questão de rótulo. Os dois convivem: o perfil é a escolha, o alvo é o dado.
 */
export const radarProfileOfTarget = (target: RadarPrimarySearchMode): RadarResearchProfile =>
  target === "WEB" ? "GOOGLE" : target;

export const radarTargetOfProfile = (profile: RadarResearchProfile): RadarPrimarySearchMode =>
  RADAR_RESEARCH_PROFILE_PLANS[profile].primaryTarget;

export const radarResearchProfilePlan = (profile: RadarResearchProfile) =>
  RADAR_RESEARCH_PROFILE_PLANS[profile];

/**
 * O PAPEL DE UMA FONTE DENTRO DE UM PERFIL — §4.
 *
 * `null` quando a fonte não participa daquele perfil: a SERP da Amazon não tem
 * papel nenhum numa radiografia de vídeo, e dar-lhe um papel vazio faria a tela
 * listar uma coleta que nunca vai acontecer ali.
 */
export function radarResearchSourceRoleForProfile(
  profile: RadarResearchProfile,
  source: RadarResearchSource,
): RadarResearchSourceRole | null {
  const plano = RADAR_RESEARCH_PROFILE_PLANS[profile];
  if (source === plano.primarySource) return "PRIMARY_COMPETITIVE_RESEARCH";
  if (plano.supportSources.includes(source)) return plano.supportRole;
  return null;
}

/* ============== §3 · o apoio é UMA leitura, e ela é focada ============== */

/**
 * A COLETA DE APOIO, PLANEJADA — e ela tem exatamente uma consulta.
 *
 * O perfil YouTube manda três consultas competitivas ao YouTube porque três
 * formulações revelam três recortes do universo de vídeo. O Google de apoio
 * responde OUTRA pergunta — como a busca geral trata esta intenção —, e essa
 * pergunta tem uma resposta só. Repetir a leitura para cada consulta do YouTube
 * triplicaria o custo e devolveria três vezes o mesmo bloco de PAA.
 */
export type RadarSupportCollectionPlan = {
  source: RadarResearchSource;
  role: RadarResearchSourceRole;
  /** A keyword principal do artigo, verbatim. */
  keyword: string;
  /** Sempre 1 neste gate. Explícito para a proveniência poder ser conferida. */
  queryCount: number;
  purpose: string;
};

export function radarProfileSupportPlan(input: {
  profile: RadarResearchProfile;
  primaryKeyword: string | null | undefined;
}): RadarSupportCollectionPlan | null {
  const plano = RADAR_RESEARCH_PROFILE_PLANS[input.profile];
  const fonte = plano.supportSources[0];
  if (!fonte || !plano.supportRole || !plano.supportPurpose) return null;

  /*
   * SEM KEYWORD PRINCIPAL NÃO HÁ APOIO FOCADO.
   *
   * Cair no título do artigo pareceria robusto e produziria uma leitura sobre
   * uma formulação que ninguém pesquisa. O pacote declara o apoio como não
   * planejado, e a tela diz por quê.
   */
  const keyword = (input.primaryKeyword || "").trim();
  if (!keyword) return null;

  return { source: fonte, role: plano.supportRole, keyword, queryCount: 1, purpose: plano.supportPurpose };
}

/* ================= §6 e §7 · o pacote e o status composto ================= */

export const RADAR_RESEARCH_PACKAGE_STATES = ["COLLECTING", "READY", "PARTIAL_SUPPORT_FAILED", "FAILED"] as const;
export const RadarResearchPackageStateSchema = z.enum(RADAR_RESEARCH_PACKAGE_STATES);
export type RadarResearchPackageState = typeof RADAR_RESEARCH_PACKAGE_STATES[number];

export const RADAR_RESEARCH_PACKAGE_STATE_LABELS: Record<RadarResearchPackageState, string> = {
  COLLECTING: "Coletando",
  READY: "Pronta para finalizar",
  PARTIAL_SUPPORT_FAILED: "Principal concluída · apoio pendente",
  FAILED: "Falhou",
};

/**
 * O REGISTRO DO APOIO — §4, e ele mora no dado.
 *
 * Aditivo com `.default(null)`: uma análise gravada antes deste gate não tem
 * apoio declarado, e isso é a verdade sobre ela. Preencher retroativamente
 * diria que uma coleta Google feita como investigação principal foi apoio.
 */
export const RadarSupportResearchRecordSchema = z.object({
  source: z.enum(RADAR_RESEARCH_SOURCES),
  role: RadarResearchSourceRoleSchema,
  /** A consulta que foi de fato executada. */
  keyword: z.string().min(1),
  /** O `runId` do pacote que pediu esta coleta — a ligação com a principal. */
  packageRunId: z.string().min(1),
  collectedAt: z.string().min(1).nullable().default(null),
  /** O snapshot produzido, quando houve. */
  serpSnapshotId: z.string().min(1).nullable().default(null),
  /** Por que falhou. Preenchido só quando falhou. */
  failureReason: z.string().max(500).nullable().default(null),
}).strict();
export type RadarSupportResearchRecord = z.infer<typeof RadarSupportResearchRecordSchema>;

export type RadarResearchPackage = {
  profile: RadarResearchProfile;
  primaryTarget: RadarPrimarySearchMode;
  primary: {
    source: RadarResearchSource;
    role: RadarResearchSourceRole;
    collected: boolean;
    /** `true` enquanto a coleta principal está aberta. */
    running: boolean;
    failed: boolean;
    queryCount: number;
    resultCount: number;
  };
  /** `null` no perfil Google: ele não tem apoio, e isso não é lacuna. */
  support: {
    source: RadarResearchSource;
    role: RadarResearchSourceRole;
    purpose: string;
    keyword: string | null;
    collected: boolean;
    failureReason: string | null;
  } | null;
  state: RadarResearchPackageState;
  /** Uma linha em português sobre o pacote. Sem id, sem hash. */
  headline: string;
};

/**
 * ============ §7 · O STATUS É COMPOSTO, E A PRINCIPAL MANDA ============
 *
 * `PARTIAL_SUPPORT_FAILED` existe para uma razão só: o apoio falhar NÃO pode
 * apagar a coleta principal. Sem esse estado, o pacote teria de escolher entre
 * mentir ("pronta") e jogar fora uma coleta paga ("falhou") — e a segunda é o
 * que o Radar fazia antes de o 1.4 separar START de coleta.
 *
 * O retry é só do apoio. Refazer a principal cobraria de novo as três consultas
 * do YouTube para corrigir uma leitura do Google que custou uma.
 */
export function radarResearchPackageState(input: {
  primaryRunning: boolean;
  primaryCollected: boolean;
  primaryFailed: boolean;
  supportPlanned: boolean;
  supportCollected: boolean;
  supportFailed: boolean;
}): RadarResearchPackageState {
  if (input.primaryFailed) return "FAILED";
  if (input.primaryRunning || !input.primaryCollected) return "COLLECTING";
  if (input.supportPlanned && !input.supportCollected) return input.supportFailed ? "PARTIAL_SUPPORT_FAILED" : "COLLECTING";
  return "READY";
}

/**
 * O PACOTE LIDO DO QUE ESTÁ GRAVADO — §6.
 *
 * Uma investigação, não duas. A tela do YouTube mostra este objeto e não uma
 * lista de fontes com botões: somar leitura deixou de ser decisão de clique.
 */
export function buildRadarResearchPackage(input: {
  profile: RadarResearchProfile;
  primaryKeyword: string | null | undefined;
  primaryRunning: boolean;
  primaryCollected: boolean;
  primaryFailed: boolean;
  primaryQueryCount: number;
  primaryResultCount: number;
  support: RadarSupportResearchRecord | null;
  /** A SERP do Google já coletada por fora — conta como apoio satisfeito. */
  webSerpCollected: boolean;
}): RadarResearchPackage {
  const plano = RADAR_RESEARCH_PROFILE_PLANS[input.profile];
  const apoioPlanejado = radarProfileSupportPlan({ profile: input.profile, primaryKeyword: input.primaryKeyword });

  /*
   * UM SNAPSHOT DO GOOGLE QUE JÁ EXISTE SATISFAZ O APOIO.
   *
   * O artigo pode ter passado pelo perfil Google antes de virar vídeo. Cobrar
   * de novo a mesma SERP para carimbar "apoio coletado" faria a pessoa pagar
   * pela troca de perfil.
   */
  const apoioColetado = Boolean(input.support?.collectedAt) || (Boolean(apoioPlanejado) && input.webSerpCollected);
  const apoioFalhou = Boolean(input.support?.failureReason) && !apoioColetado;

  const state = radarResearchPackageState({
    primaryRunning: input.primaryRunning,
    primaryCollected: input.primaryCollected,
    primaryFailed: input.primaryFailed,
    supportPlanned: Boolean(apoioPlanejado),
    supportCollected: apoioColetado,
    supportFailed: apoioFalhou,
  });

  const partes = [`${plano.label}: ${input.primaryQueryCount} consulta(s) · ${input.primaryResultCount} resultado(s)`];
  if (apoioPlanejado) {
    partes.push(apoioColetado
      ? `Apoio ${radarResearchSourceLabel(apoioPlanejado.source)}: coletado`
      : apoioFalhou
        ? `Apoio ${radarResearchSourceLabel(apoioPlanejado.source)}: falhou`
        : `Apoio ${radarResearchSourceLabel(apoioPlanejado.source)}: pendente`);
  }

  return {
    profile: input.profile,
    primaryTarget: plano.primaryTarget,
    primary: {
      source: plano.primarySource,
      role: "PRIMARY_COMPETITIVE_RESEARCH",
      collected: input.primaryCollected,
      running: input.primaryRunning,
      failed: input.primaryFailed,
      queryCount: input.primaryQueryCount,
      resultCount: input.primaryResultCount,
    },
    support: apoioPlanejado || plano.supportRole
      ? {
        source: apoioPlanejado?.source || plano.supportSources[0]!,
        role: apoioPlanejado?.role || plano.supportRole!,
        purpose: plano.supportPurpose!,
        keyword: apoioPlanejado?.keyword || input.support?.keyword || null,
        collected: apoioColetado,
        failureReason: apoioColetado ? null : input.support?.failureReason || null,
      }
      : null,
    state,
    headline: `${partes.join(" · ")} · ${RADAR_RESEARCH_PACKAGE_STATE_LABELS[state]}`,
  };
}

/**
 * O PERFIL DECLARADO NA ANÁLISE, LIDO DO QUE ESTÁ GRAVADO.
 *
 * O alvo explícito vence. Sem ele, o perfil é o padrão — e não uma inferência
 * a partir de qual coleta existe: o 2.1 já mostrou que inferir alvo de fonte
 * transforma uma leitura de apoio em troca de destino.
 */
export function radarResearchProfileOfAnalysis(payload: unknown): RadarResearchProfile {
  const analise = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as {
    researchTarget?: { primaryTarget?: unknown } | null;
  };
  const alvo = RadarPrimarySearchModeSchema.safeParse(analise.researchTarget?.primaryTarget);
  return alvo.success ? radarProfileOfTarget(alvo.data) : RADAR_DEFAULT_RESEARCH_PROFILE;
}
