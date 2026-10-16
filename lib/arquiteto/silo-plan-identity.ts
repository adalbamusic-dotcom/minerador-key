/**
 * ===== O TEMA DA PÁGINA DO SILO — regras puras (2026-10-15) =====
 *
 * Caso real (WifiConecta, azul, SELECT de 15/10): o SiloDNA v1 e a SiloPage v1
 * do Silo "Wi-Fi e fibra óptica" nasceram com o tema "melhor internet para
 * jogos online" — o 5º SUPORTE do plano — e com a pendência do construtor
 * dentro da frase ("… para pendente de enriquecimento e revisão humana.").
 * Origem: "Processar arquitetura" usava a PRIMEIRA keyword do grupo do plano
 * como semente do Silo e gravava o texto dela como entidade central do
 * território; a consolidação copia a entidade do território.
 *
 * Regra do dono: o tema do Silo do plano vem do nome do Silo do plano (ou, sem
 * plano, da principal do Pilar) — NUNCA de um suporte; e nenhuma pendência
 * entra em frase. Aqui só se DECIDE (texto e diagnóstico); quem grava é a
 * versão nova do par, pelo caminho de sempre e com a confirmação do dono.
 *
 * Domínio puro: sem React, sem rede, sem banco, sem imports.
 */

/** A pendência que o construtor determinístico grava em campo vazio (ex.: público). */
const PENDENCIA = /pendente de (enriquecimento|forma[cç][aã]o)|^\s*pendente\b/i;

/** O texto é uma pendência (ou a contém)? Pendência nunca vira frase. */
export function isPendingPlaceholder(text: string | null | undefined): boolean {
  return typeof text === "string" && PENDENCIA.test(text);
}

/** Um complemento opcional da frase: some quando é vazio ou pendência. */
const complemento = (prefixo: string, valor: string | null | undefined) => {
  const limpo = String(valor ?? "").trim();
  return limpo && !isPendingPlaceholder(limpo) ? `${prefixo}${limpo.toLowerCase()}` : "";
};

/** Os textos da SiloPage que nascem do tema (os mesmos do construtor determinístico). */
export function siloPageIdentityTexts(input: { centralEntity: string; objective: string | null | undefined; audience: string | null | undefined }) {
  const tema = input.centralEntity.trim();
  const objetivo = isPendingPlaceholder(input.objective) ? "" : String(input.objective ?? "").trim();
  return {
    h1: tema,
    seoTitle: `${tema} | Guia completo`,
    intro: `${objetivo ? `${objetivo} ` : ""}Este conteúdo organiza os principais temas sobre ${tema.toLowerCase()}${complemento(" para ", input.audience)}.`,
    cta: `Conheça todos os conteúdos sobre ${tema.toLowerCase()}.`,
    coverImageBrief: `Imagem representativa de ${tema}.`,
    sectionHeading: (pillar: boolean, index: number) => (pillar ? `${tema}: visão geral` : `${tema}: aprofundamento ${index}`),
    sectionObjective: `Conectar o leitor ao tema ${tema.toLowerCase()}.`,
  };
}

/** O problema macro do SiloDNA (o mesmo do construtor), sem pendência na frase. */
export function siloMacroProblemText(centralEntity: string, audience: string | null | undefined): string {
  return `Dificuldade em ${centralEntity.trim().toLowerCase()}${complemento(" para ", audience)}.`;
}

/** Chave de comparação: sem caixa, sem acento, sem pontuação (a mesma ideia do `slugKey`). */
export function identityKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type SiloIdentityDiagnosis = {
  /** O tema que a página do Silo deve ter. */
  expected: string;
  /** O tema gravado hoje (entidade central do SiloDNA). */
  current: string;
  /** Por que corrigir, em frases curtas. */
  reasons: string[];
};

/**
 * A PÁGINA DO SILO ESTÁ COM O TEMA CERTO? `expected` é o nome do Silo do
 * plano; sem plano, a principal do Pilar; sem as duas, o nome do Silo.
 * Corrige quando o tema (ou o H1) é o de um SUPORTE do Silo, quando o tema
 * está vazio ou é pendência, ou quando uma pendência entrou numa frase. Tema
 * escolhido por gente que não é de suporte fica (não é reescrito).
 */
export function diagnoseSiloIdentity(input: {
  centralEntity: string | null | undefined;
  siloName: string | null | undefined;
  macroProblem?: string | null;
  page?: { h1?: string | null; intro?: string | null; cta?: string | null; seoTitle?: string | null } | null;
  planSiloName?: string | null;
  pillarLabel?: string | null;
  /** Os rótulos dos suportes: principal, slug e Assunto de cada artigo que não é o Pilar. */
  supportLabels: readonly (string | null | undefined)[];
}): SiloIdentityDiagnosis | null {
  const expected = String(input.planSiloName ?? "").trim() || String(input.pillarLabel ?? "").trim() || String(input.siloName ?? "").trim();
  const current = String(input.centralEntity ?? "").trim();
  if (!expected) return null;
  const esperado = identityKey(expected);
  const pilar = identityKey(input.pillarLabel);
  const suportes = new Set(input.supportLabels.map(identityKey).filter(key => key && key !== esperado && key !== pilar));
  const reasons: string[] = [];
  if (!current || isPendingPlaceholder(current)) reasons.push("a página do Silo está sem tema");
  else if (suportes.has(identityKey(current))) reasons.push(`o tema “${current}” é de um suporte do Silo, não do Silo`);
  const h1 = String(input.page?.h1 ?? "").trim();
  if (h1 && identityKey(h1) !== identityKey(current) && suportes.has(identityKey(h1))) reasons.push(`o H1 “${h1}” é de um suporte do Silo`);
  const frases = [input.macroProblem, input.page?.h1, input.page?.intro, input.page?.cta, input.page?.seoTitle];
  if (frases.some(frase => isPendingPlaceholder(frase))) reasons.push("há pendência (“pendente de enriquecimento…”) dentro do texto");
  return reasons.length ? { expected, current, reasons } : null;
}

/** A frase da prévia: o que está errado e o que a versão nova grava. */
export function siloIdentityCorrectionSentence(diagnosis: SiloIdentityDiagnosis): string {
  const tema = diagnosis.current && identityKey(diagnosis.current) !== identityKey(diagnosis.expected)
    ? `tema “${diagnosis.current}” → “${diagnosis.expected}”`
    : `tema “${diagnosis.expected}”`;
  return `Corrigir a página do Silo: ${diagnosis.reasons.join("; ")}. A versão nova grava o ${tema} no SiloDNA e no H1, título, introdução, chamada e seções da SiloPage, sem pendência no texto.`;
}

type PageText = {
  h1: string;
  seoTitle: string;
  intro: string;
  cta: string;
  coverImageBrief: string;
  metaDescription: string;
  breadcrumbs: Array<{ label: string; slug: string }>;
  sections: Array<{ id: string; heading: string; objective: string; linkedArticleIds: string[] }>;
};

/**
 * O TEXTO DA SILOPAGE COM O TEMA NOVO. Só troca o campo que nasceu do tema
 * antigo (contém o tema antigo) ou que tem pendência; texto escrito por gente
 * sobre outra coisa fica. `pillarArticleId` decide o título "visão geral".
 */
export function retitleSiloPageText<T extends PageText>(page: T, input: {
  from: string;
  to: string;
  objective: string | null | undefined;
  audience: string | null | undefined;
  pillarArticleId: string | null;
}): T {
  const textos = siloPageIdentityTexts({ centralEntity: input.to, objective: input.objective, audience: input.audience });
  const antigo = input.from.trim().toLowerCase();
  const veioDoTema = (texto: string | null | undefined) => {
    const valor = String(texto ?? "");
    return !valor.trim() || isPendingPlaceholder(valor) || (antigo !== "" && valor.toLowerCase().includes(antigo));
  };
  const troca = (atual: string, novo: string) => (veioDoTema(atual) ? novo : atual);
  return {
    ...page,
    h1: troca(page.h1, textos.h1),
    seoTitle: troca(page.seoTitle, textos.seoTitle),
    intro: troca(page.intro, textos.intro),
    cta: troca(page.cta, textos.cta),
    coverImageBrief: troca(page.coverImageBrief, textos.coverImageBrief),
    metaDescription: isPendingPlaceholder(page.metaDescription) ? String(input.objective ?? "").trim() || page.metaDescription : page.metaDescription,
    breadcrumbs: page.breadcrumbs.map(crumb => (antigo && crumb.label.trim().toLowerCase() === antigo ? { ...crumb, label: textos.h1 } : crumb)),
    sections: page.sections.map((section, index) => ({
      ...section,
      heading: troca(section.heading, textos.sectionHeading(Boolean(input.pillarArticleId) && section.linkedArticleIds.includes(input.pillarArticleId!), index)),
      objective: troca(section.objective, textos.sectionObjective),
    })),
  };
}
