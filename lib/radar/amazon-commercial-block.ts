import { RADAR_AMAZON_EDITORIAL_INTENTS, RADAR_AMAZON_INTENT_LABELS, radarAmazonSetupSignature, type RadarAmazonEditorialIntentType, type RadarAmazonEditorialSetup } from "./amazon-editorial-target.ts";
import { radarAmazonEligibleCandidates, type RadarAmazonEligibility } from "./amazon-eligibility.ts";
import { radarAmazonSelectCandidates, type RadarAmazonSelection } from "./amazon-candidate-selection.ts";
import type { RadarAmazonUniverseEntry } from "./amazon-search-model.ts";
import type { RadarAmazonBlueprint, RadarCompetitiveBlueprint } from "./competitive-blueprint.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarResearchProfile } from "./research-profile.ts";
import type { RadarPortableCommercial } from "./portable-export.ts";
import { buildRadarEditorialCommercialModel, radarAmazonCommercialSkeleton, type RadarEditorialProfileModel } from "./editorial-profile-model.ts";

/**
 * ===== 2026-10-09 · A PARTE COMERCIAL SAI DA AMAZON CONGELADA, EM QUALQUER PERFIL =====
 *
 * Regra do dono: o processo do piloto substitui o antigo. Com o Google
 * finalizado, a Amazon entra como acréscimo de formato (review) — e a parte
 * comercial do entregável (produtos, links, critérios, aviso de afiliado e a
 * recusa quando nenhum produto foi selecionado) só existia quando o perfil
 * PRIMÁRIO era a Amazon. O artigo do Google com review saía sem produtos.
 *
 * Aqui a parte comercial é derivada da investigação da Amazon CONGELADA
 * (`amazonFrozenInvestigation`, o mesmo blueprint de `formatBlueprints.review`)
 * em qualquer perfil primário. É PROJEÇÃO: nada disto entra no pacote nem no
 * hash; o congelamento continua sendo lido como foi gravado.
 *
 * Módulo puro: sem servidor, sem banco, sem provider.
 */

/** O que a projeção comercial lê da análise. O payload da análise do Radar cabe aqui inteiro. */
export type RadarAmazonCommercialPayload = {
  amazonEditorialSetup?: RadarAmazonEditorialSetup | null;
  amazonSearch?: {
    universe: readonly RadarAmazonUniverseEntry[];
    queries: ReadonlyArray<{ executed: boolean }>;
  } | null;
  amazonFrozenInvestigation?: {
    finalizedAt?: string | null;
    originalEditorialIntent?: {
      type?: string | null;
      desiredCount?: number | null;
      useCase?: string | null;
      rankingCriteria?: string | null;
      setupSignature?: string | null;
    } | null;
    competitiveBlueprint?: unknown;
  } | null;
};

export type RadarAmazonCommercialState = {
  setup: RadarAmazonEditorialSetup | null;
  universe: readonly RadarAmazonUniverseEntry[];
  eligibility: RadarAmazonEligibility | null;
  selection: RadarAmazonSelection | null;
  counts: { observed: number; eligible: number; shortlist: number } | null;
};

/**
 * ===== §10 · A AMAZON EXPORTA O ESTADO CANÔNICO, E SÓ ELE =====
 *
 * (Saiu do núcleo do export em 2026-10-09, sem mudar a regra.)
 *
 * O blueprint comercial vem da FOTOGRAFIA congelada. A shortlist e os links não
 * podem vir dela: a fotografia guarda as conclusões e o resumo, não o universo
 * — então eles precisam ser recalculados sobre a corrida gravada.
 *
 * Se alguém trocou a configuração DEPOIS de congelar, a corrida gravada passou
 * a descrever outra investigação. Recalcular a shortlist sobre ela produziria
 * produtos de um alvo ao lado de um blueprint de outro. A assinatura da
 * configuração material responde isso: quando ela não bate, a leitura comercial
 * não sai — a lista de produtos fica vazia porque vazia é a verdade sobre o que
 * pode ser afirmado.
 */
export function radarAmazonCommercialStateOf(payload: RadarAmazonCommercialPayload): RadarAmazonCommercialState {
  const setup = payload.amazonEditorialSetup ?? null;
  const corrida = payload.amazonSearch ?? null;
  const congelada = payload.amazonFrozenInvestigation ?? null;

  if (!setup || !corrida) {
    return { setup, universe: [], eligibility: null, selection: null, counts: null };
  }

  const assinaturaCongelada = congelada?.originalEditorialIntent?.setupSignature ?? null;
  const assinaturaCorrente = radarAmazonSetupSignature(setup);
  if (assinaturaCongelada && assinaturaCongelada !== assinaturaCorrente) {
    return { setup, universe: [], eligibility: null, selection: null, counts: null };
  }

  const eligibility = radarAmazonEligibleCandidates({
    intent: setup.intent, target: setup.target, universe: corrida.universe,
  });
  const selection = radarAmazonSelectCandidates({
    intent: setup.intent,
    universe: eligibility.eligible,
    observedCount: eligibility.rawCount,
    queryCount: corrida.queries.filter(item => item.executed).length,
  });

  return {
    setup,
    universe: corrida.universe,
    eligibility,
    selection,
    counts: { observed: eligibility.rawCount, eligible: eligibility.eligible.length, shortlist: selection.candidates.length },
  };
}

/** O blueprint comercial da investigação da Amazon congelada (o de `formatBlueprints.review`); `null` sem congelamento. */
export function radarAmazonFrozenBlueprintOf(payload: RadarAmazonCommercialPayload): RadarAmazonBlueprint | null {
  const blueprint = payload.amazonFrozenInvestigation?.competitiveBlueprint as { profile?: unknown } | null | undefined;
  return blueprint && typeof blueprint === "object" && blueprint.profile === "AMAZON" ? blueprint as RadarAmazonBlueprint : null;
}

/** O plano comercial do export, a partir do modelo comercial e do estado canônico. */
function planoComercial(state: RadarAmazonCommercialState, model: RadarEditorialProfileModel | null): RadarPortableCommercial {
  return {
    setup: state.setup,
    counts: state.counts,
    products: (model?.promotionLinks || []).map(link => ({ asin: link.asin, productName: link.productName })),
    links: model?.promotionLinks || [],
    comparisonCriteria: model?.comparisonCriteria || [],
    disclosureRequired: Boolean(model?.affiliateDisclosureRequired),
    shortlistStatus: model?.shortlistStatus ?? null,
  };
}

/**
 * ===== A PROJEÇÃO COMERCIAL DO EXPORT, EM QUALQUER PERFIL =====
 *
 * Perfil primário AMAZON: o de sempre, byte a byte — o blueprint do dossiê
 * (`profileBlueprint`) e o plano comercial sempre presente.
 *
 * Outro perfil (o Google como base, a Amazon como review): o blueprint da
 * Amazon congelada. Sem Amazon congelada, nada comercial (`commercial: null`),
 * como antes. O `model` só serve ao perfil AMAZON como modelo do perfil; nos
 * outros, ele alimenta só o plano comercial e nunca substitui o modelo do
 * artigo.
 */
export function radarPortableCommercialOf(input: {
  profile: RadarResearchProfile;
  payload: RadarAmazonCommercialPayload;
  context: RadarArticleResearchContext | null;
  profileBlueprint: RadarCompetitiveBlueprint | null;
}): { state: RadarAmazonCommercialState | null; model: RadarEditorialProfileModel | null; commercial: RadarPortableCommercial | null } {
  const primario = input.profile === "AMAZON";
  const blueprint = primario
    ? (input.profileBlueprint?.profile === "AMAZON" ? input.profileBlueprint : null)
    : radarAmazonFrozenBlueprintOf(input.payload);
  if (!primario && !blueprint) return { state: null, model: null, commercial: null };

  const state = radarAmazonCommercialStateOf(input.payload);
  const model = input.context && blueprint
    ? buildRadarEditorialCommercialModel({
      context: input.context,
      blueprint,
      setup: state.setup,
      selection: state.selection,
      eligibility: state.eligibility,
      universe: state.universe,
    })
    : null;
  return { state, model, commercial: planoComercial(state, model) };
}

/* ======================= o bloco comercial do artigo-modelo ======================= */

/**
 * O BLOCO COMERCIAL DA AMAZON CONGELADA, para o GERADOR do artigo-modelo.
 *
 * Tudo o que a planta precisa para escrever a parte comercial pelo processo
 * novo: a intenção comercial declarada (a da fotografia), a shortlist ELEGÍVEL
 * (só ela entra como produto do artigo), os critérios da comparação, as faixas
 * observadas sobre os compatíveis, o aviso de afiliado e as regras de escrita do
 * review. `skeleton` é o esqueleto genérico da forma comercial — MATÉRIA-PRIMA do
 * gerador, ao lado do esqueleto da SERP; nunca estrutura de entregável.
 */
export type RadarAmazonCommercialBlock = {
  /** Quando a investigação da Amazon foi congelada. */
  frozenAt: string | null;
  /** A intenção comercial congelada (a da fotografia; sem ela, a configuração atual). */
  intent: {
    type: string;
    label: string;
    desiredCount: number | null;
    useCase: string | null;
    rankingCriteria: string | null;
  } | null;
  /** A forma de saída que a intenção declara (ex.: TOP_BEST). */
  editorialOutput: string | null;
  workingTitle: string | null;
  promise: string | null;
  /** A shortlist elegível, na ordem da seleção, com a URL limpa do produto. */
  shortlist: Array<{
    order: number;
    asin: string;
    title: string;
    amazonUrl: string | null;
    suggestedAnchor: string | null;
    supportingSignals: string[];
    missingSignals: string[];
  }>;
  shortlistStatus: { state: "OK" | "PARTIAL" | "BLOCKED"; desired: number | null; available: number; message: string | null };
  counts: { observed: number; eligible: number; shortlist: number } | null;
  /** As colunas da comparação ("Faixa de preço", "Nota de avaliação"…). */
  comparisonCriteria: string[];
  /** As faixas de preço observadas (sobre os compatíveis, no congelamento novo). */
  priceBands: Array<{ label: string; detail: string }>;
  affiliateDisclosureRequired: boolean;
  /** As regras de escrita da parte comercial, ditas em português. */
  rules: string[];
  limitations: string[];
  /** MATÉRIA-PRIMA do gerador: as seções genéricas da forma comercial. Nunca é saída. */
  skeleton: Array<{ heading: string; objective: string; sourceSignal: string }>;
};

const ROTULO_DA_FAIXA: Record<string, string> = {
  ECONOMICO: "Faixa econômica",
  INTERMEDIARIO: "Faixa intermediária",
  PREMIUM: "Faixa premium",
};

const dinheiro = (valor: number | null | undefined, moeda: string | null | undefined) =>
  typeof valor === "number" ? `${moeda ? `${moeda} ` : ""}${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;

const ehIntencao = (valor: unknown): valor is RadarAmazonEditorialIntentType =>
  typeof valor === "string" && (RADAR_AMAZON_EDITORIAL_INTENTS as readonly string[]).includes(valor);

const textoOuNulo = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

export function radarAmazonFrozenCommercialBlock(input: {
  payload: RadarAmazonCommercialPayload;
  context: RadarArticleResearchContext | null;
}): RadarAmazonCommercialBlock | null {
  const blueprint = radarAmazonFrozenBlueprintOf(input.payload);
  if (!blueprint) return null;
  const congelada = input.payload.amazonFrozenInvestigation ?? null;
  const state = radarAmazonCommercialStateOf(input.payload);
  const model = input.context
    ? buildRadarEditorialCommercialModel({
      context: input.context,
      blueprint,
      setup: state.setup,
      selection: state.selection,
      eligibility: state.eligibility,
      universe: state.universe,
    })
    : null;

  /* A intenção da FOTOGRAFIA é a autoridade; a configuração atual só responde quando a fotografia não a gravou. */
  const original = congelada?.originalEditorialIntent ?? null;
  const tipo = ehIntencao(original?.type) ? original!.type as RadarAmazonEditorialIntentType : state.setup?.intent.type ?? null;
  const intent = tipo
    ? {
      type: tipo,
      label: RADAR_AMAZON_INTENT_LABELS[tipo] || tipo,
      desiredCount: original ? original.desiredCount ?? null : state.setup?.intent.desiredCount ?? null,
      useCase: original ? textoOuNulo(original.useCase) : state.setup?.intent.useCase ?? null,
      rankingCriteria: original ? textoOuNulo(original.rankingCriteria) : state.setup?.intent.rankingCriteria ?? null,
    }
    : null;

  const links = new Map((model?.promotionLinks || []).map(link => [link.asin, link]));
  const shortlist = (state.selection?.candidates || []).map(candidato => ({
    order: candidato.order,
    asin: candidato.asin,
    title: candidato.title,
    amazonUrl: links.get(candidato.asin)?.amazonUrl ?? null,
    suggestedAnchor: links.get(candidato.asin)?.suggestedAnchor ?? null,
    supportingSignals: [...candidato.supportingSignals],
    missingSignals: [...candidato.missingSignals],
  }));

  const status = model?.shortlistStatus ?? { state: "OK" as const, desired: intent?.desiredCount ?? null, available: shortlist.length, message: null };
  const comparisonCriteria = model?.comparisonCriteria?.length
    ? [...model.comparisonCriteria]
    : blueprint.recommended.comparisonAxes.map(eixo => eixo.label);
  const priceBands = blueprint.observed.priceBands.map(faixa => {
    const de = dinheiro(faixa.rangeFrom, faixa.currency);
    const ate = dinheiro(faixa.rangeTo, faixa.currency);
    const mediana = dinheiro(faixa.observedValue, faixa.currency);
    return {
      label: ROTULO_DA_FAIXA[faixa.band] || faixa.band,
      detail: [de && ate ? `de ${de} a ${ate}` : null, mediana ? `mediana ${mediana}` : null, `${faixa.sampleSize} produto(s)`, faixa.method]
        .filter(Boolean).join(" · "),
    };
  });
  const affiliateDisclosureRequired = model ? model.affiliateDisclosureRequired : shortlist.length > 0;

  const regras = [
    "Só os produtos da shortlist entram como produto do artigo; o resto da prateleira é contexto e não ganha link.",
    "Preço e nota são da coleta: não prometa preço atual nem trate nota ou selo como prova de qualidade.",
    "Nenhum texto de avaliação foi lido: não atribua opinião de comprador a nenhum produto.",
    ...(affiliateDisclosureRequired ? ["Coloque o aviso de afiliado antes do primeiro link de produto; a tag de afiliado entra na publicação, não no texto."] : []),
    ...(state.selection && !state.selection.supportsSuperlative ? ["A reputação observada não sustenta \"os melhores\": prometa opções para comparar."] : []),
    ...(status.state === "PARTIAL" && status.desired ? [`O formato pede ${status.desired} produtos e a shortlist tem ${status.available}: não complete a lista com produto de fora dela.`] : []),
    ...(status.state === "BLOCKED" ? ["Nenhum produto compatível com o alvo foi selecionado: o artigo não tem lista de produtos a construir."] : []),
  ];

  const assunto = (model?.articleIdentity.principalKeyword || "o produto").trim();
  const skeleton = tipo
    ? radarAmazonCommercialSkeleton({
      intent: tipo,
      assunto,
      criterios: comparisonCriteria,
      selecionados: shortlist.length,
      produtos: state.setup?.target.products || [],
      necessidade: intent?.useCase ?? null,
    })
    : [];

  return {
    frozenAt: textoOuNulo(congelada?.finalizedAt),
    intent,
    editorialOutput: model?.editorialOutput ?? tipo,
    workingTitle: model?.workingTitle ?? null,
    promise: model?.promise ?? null,
    shortlist,
    shortlistStatus: { state: status.state, desired: status.desired, available: status.available, message: status.message },
    counts: state.counts,
    comparisonCriteria,
    priceBands,
    affiliateDisclosureRequired,
    rules: regras,
    limitations: model ? [...model.limitations] : [...blueprint.limitations],
    skeleton,
  };
}
