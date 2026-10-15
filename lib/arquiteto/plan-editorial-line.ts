/**
 * ===== ETAPA 3 DA ABA ARTIGOS · LINHA EDITORIAL (2026-10-15) =====
 *
 * Pedido do dono: "Artigo só mexe com artigos: só reforçar as keywords, fazer
 * do assunto/tema uma linha editorial de copy, e finalizar com os links
 * internos." O ArticleDNA nasce com ângulo, CTA, problema e público como
 * "Pendente de enriquecimento e revisão humana" (`deterministicArticleDnaPayload`).
 * Nenhum núcleo existente os preenchia (a melhoria só reescreve o ângulo a
 * partir do DNA da principal; o Redator planeja a copy, mas não grava no
 * ArticleDNA). Esta etapa preenche SÓ o que está pendente, de graça e sem IA,
 * com o que já é decisão humana ou dado gravado — nunca inventa fato:
 *
 *   ângulo     ← o Assunto (título cadastrado) e, com parecer, a intenção da SERP
 *   promessa   ← o escopo do plano (quando ainda pendente)
 *   problema   ← a pergunta do Assunto, ligada à principal
 *   público    ← o público do BrandDNA aprovado (sem BrandDNA: fica pendente)
 *   CTA        ← o Pilar do plano (Suporte → "leia o Pilar"); os Suportes do
 *                plano pelos Assuntos (Pilar); sem eles, a página do Silo
 *                pelo nome do Silo; sem nenhum, fica pendente
 *   objetivo   ← o objetivo do Silo do plano
 *
 * Valor já preenchido (por gente, pela melhoria, pela IA) nunca é trocado.
 * A gravação é uma versão nova (v+1) com decisão humana; nada no Minerador,
 * nada no Redator. Domínio puro: sem React, sem rede, sem banco.
 *
 * 2026-10-15 (noite) · acabamentos do readback da WifiConecta azul:
 *  - a intenção entra no ângulo com o rótulo pt-BR da plataforma
 *    (`canonicalIntentLabel`: "comercial investigativa", "informativa"…),
 *    nunca com o enum cru ("commercial_investigation");
 *  - o CTA do Pilar é para o LEITOR: convida aos Suportes do Silo pelos
 *    Assuntos deles (ou, sem Suporte, à página do Silo pelo nome do Silo).
 *    O objetivo do plano é meta de negócio e fica só em "Objetivo";
 *  - o texto que nasceu da regra antiga (ângulo com o enum cru; CTA "Próximo
 *    passo do Silo …: <objetivo>") é reconhecido pela forma exata que a regra
 *    antiga gerava e corrigido na versão seguinte. Texto editado por gente não
 *    casa com essa forma e fica.
 */
import { CANONICAL_INTENT_LABELS, normalizeIntentKey } from "../minerador/intent-taxonomy.ts";

export const EDITORIAL_LINE_LABEL = "Linha editorial" as const;
/** O caminho do público sem BrandDNA aprovado (a prévia diz isto com clareza). */
export const EDITORIAL_LINE_BRAND_DNA_HINT = "Aprove o BrandDNA em Marca e rode a Linha editorial de novo" as const;
export const EDITORIAL_LINE_ROUTE = "/api/arquiteto/plan-silo/editorial-line" as const;
/** A frase que o construtor grava no campo ainda não decidido. */
export const EDITORIAL_PENDING_TEXT = "Pendente de enriquecimento e revisão humana";

export const EDITORIAL_LINE_FIELDS = ["angle", "promise", "problem", "audience", "cta", "brandObjective"] as const;
export type EditorialLineField = typeof EDITORIAL_LINE_FIELDS[number];
export const EDITORIAL_LINE_FIELD_LABELS: Record<EditorialLineField, string> = {
  angle: "Ângulo", promise: "Promessa", problem: "Problema", audience: "Público", cta: "CTA", brandObjective: "Objetivo",
};

/** O campo ainda não foi decidido (vazio, "Pendente…", "A confirmar", a moldura genérica da promessa). */
export function isEditorialPending(value: unknown): boolean {
  const texto = typeof value === "string" ? value.trim() : "";
  if (!texto) return true;
  return /pendente de enriquecimento|^a confirmar$|^cobrir com clareza o tema/i.test(texto);
}

/** O ArticleDNA ainda tem algum dos campos da linha editorial pendente? (ângulo, CTA, problema, público). */
export function articleEditorialPending(payload: Partial<Record<EditorialLineField, unknown>> | null | undefined): boolean {
  if (!payload) return false;
  return (["angle", "cta", "problem", "audience"] as const).some(field => isEditorialPending(payload[field]));
}

/** Os valores crus de intenção que a regra antiga colava no ângulo (enum do provider/da SERP, em inglês). */
const ENUM_CRU_DE_INTENCAO = ["informational", "commercial_investigation", "commercial", "transactional", "navigational", "local", "mixed", "unknown"] as const;
const ANGULO_DA_REGRA_ANTIGA = new RegExp(`^.+ — intenção (?:${ENUM_CRU_DE_INTENCAO.join("|")}) confirmada pela SERP\\.$`);
const CTA_DA_REGRA_ANTIGA = /^Próximo passo do Silo(?: “[^”]*”)?: (.+)\.$/;
const chaveDeTexto = (value: string) => value.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "").toLocaleLowerCase("pt-BR");

/** O ângulo nasceu da regra antiga (Assunto + "intenção <enum cru> confirmada pela SERP.")? */
export function isLegacyEditorialAngle(value: unknown): boolean {
  return typeof value === "string" && ANGULO_DA_REGRA_ANTIGA.test(value.trim());
}

/**
 * O CTA nasceu da regra antiga do Pilar ("Próximo passo do Silo “…”: <objetivo
 * do plano>.")? Só quando o texto depois dos dois-pontos é EXATAMENTE o
 * objetivo (o do plano ou o gravado em "Objetivo" pela mesma regra): CTA
 * escrito por gente não casa e fica.
 */
export function isLegacyEditorialCta(value: unknown, objectives: readonly (string | null | undefined)[]): boolean {
  if (typeof value !== "string") return false;
  const casou = CTA_DA_REGRA_ANTIGA.exec(value.trim());
  if (!casou) return false;
  const resto = chaveDeTexto(casou[1]);
  return objectives.some(objective => typeof objective === "string" && !isEditorialPending(objective) && chaveDeTexto(objective) === resto);
}

/**
 * A etapa 3 ainda tem o que fazer neste ArticleDNA? Campo pendente, ou texto
 * da regra antiga a corrigir (ângulo com o enum cru; CTA do Pilar com o
 * objetivo do plano). É o que a aba lê para a etapa "3 · Linha editorial".
 */
export function articleEditorialNeedsLine(payload: Partial<Record<EditorialLineField, unknown>> | null | undefined): boolean {
  if (!payload) return false;
  return articleEditorialPending(payload) || isLegacyEditorialAngle(payload.angle) || isLegacyEditorialCta(payload.cta, [typeof payload.brandObjective === "string" ? payload.brandObjective : null]);
}

/** A intenção da SERP com o rótulo pt-BR da plataforma, em minúsculas; desconhecida = nada. */
export function editorialIntentLabel(value: string | null | undefined): string | null {
  const chave = normalizeIntentKey(value);
  return chave === "unknown" ? null : CANONICAL_INTENT_LABELS[chave].toLocaleLowerCase("pt-BR");
}

export type EditorialLineChange = { field: EditorialLineField; label: string; before: string; after: string; source: string };

export type EditorialLineInput = {
  /** Os campos de hoje do ArticleDNA. */
  current: Partial<Record<EditorialLineField, string>>;
  /** O Assunto (título cadastrado na keyword). */
  subjectPhrase: string | null;
  /** A principal do artigo, legível. */
  principalKeyword: string | null;
  /** O escopo do plano (vira promessa). */
  scope: string | null;
  role: "Pilar" | "Suporte" | null;
  /** O Silo do plano: nome e objetivo. */
  siloName: string | null;
  siloObjective: string | null;
  /** O Assunto do Pilar do plano (para o CTA do Suporte). */
  pillarSubject: string | null;
  /** 2026-10-15 (noite) · os Assuntos dos Suportes do plano, na ordem do plano (para o CTA do Pilar). */
  supportSubjects?: readonly (string | null | undefined)[];
  /** O público do BrandDNA aprovado; vazio = sem BrandDNA. */
  brandAudience: readonly string[];
  /** A intenção que a SERP decidiu (só com parecer). */
  serpIntent: string | null;
};

const limpa = (value: string | null | undefined) => typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;
const semPontoFinal = (value: string) => value.replace(/[.\s]+$/, "");

/** O que a etapa 3 grava em UM artigo: só os campos pendentes que têm fonte. Lista vazia = nada a gravar. */
export function planEditorialLineChanges(input: EditorialLineInput): EditorialLineChange[] {
  const mudancas: EditorialLineChange[] = [];
  /** `legado`: o valor de hoje é o texto da regra antiga (corrigido na versão seguinte); senão, só o pendente ganha valor. */
  const propor = (field: EditorialLineField, after: string | null, source: string, legado = false) => {
    const antes = input.current[field] ?? "";
    if (!after || after === antes) return;
    const pendente = isEditorialPending(antes);
    if (!pendente && !legado) return;
    mudancas.push({ field, label: EDITORIAL_LINE_FIELD_LABELS[field], before: antes || "(vazio)", after, source: pendente ? source : `${source} · corrige o texto da regra antiga` });
  };
  const assunto = limpa(input.subjectPhrase);
  const principal = limpa(input.principalKeyword);
  const intencao = editorialIntentLabel(limpa(input.serpIntent));
  if (assunto) propor("angle", `${semPontoFinal(assunto)}${intencao ? ` — intenção ${intencao} confirmada pela SERP` : ""}.`, intencao ? "Assunto + parecer de SERP" : "Assunto (título cadastrado)", isLegacyEditorialAngle(input.current.angle));
  const escopo = limpa(input.scope);
  if (escopo) propor("promise", escopo, "Escopo do plano");
  if (assunto) propor("problem", `Quem busca “${principal ?? assunto}” quer resolver: ${semPontoFinal(assunto)}${/[?]$/.test(assunto) ? "" : "."}`, "Assunto (título cadastrado)");
  const publico = input.brandAudience.map(item => limpa(item)).filter((item): item is string => Boolean(item));
  if (publico.length) propor("audience", publico.join("; "), "BrandDNA aprovado");
  const pilar = limpa(input.pillarSubject);
  const objetivo = limpa(input.siloObjective);
  const silo = limpa(input.siloName);
  /*
   * CTA = convite ao LEITOR, de fonte declarada. Suporte → o Pilar do plano
   * (pelo Assunto). Pilar → os Suportes do Silo (pelos Assuntos, na ordem do
   * plano); sem Suporte, a página do Silo (pelo nome do Silo). O objetivo do
   * plano é meta de negócio: nunca vira CTA (fica em "Objetivo").
   */
  const ctaAntigo = isLegacyEditorialCta(input.current.cta, [input.siloObjective, input.current.brandObjective]);
  const suportes = (input.supportSubjects ?? []).map(item => limpa(item)).filter((item): item is string => Boolean(item)).map(semPontoFinal);
  if (input.role === "Suporte" && pilar) propor("cta", `Aprofundar no artigo Pilar do Silo${silo ? ` “${silo}”` : ""}: “${semPontoFinal(pilar)}”.`, "Pilar do plano", ctaAntigo);
  else if (input.role === "Pilar" && suportes.length) propor("cta", `Leia também os artigos do Silo${silo ? ` “${silo}”` : ""}: ${editorialSupportList(suportes)}.`, "Suportes do plano (Assuntos)", ctaAntigo);
  else if (silo) propor("cta", `Conheça todos os conteúdos do Silo “${silo}”.`, "Silo do plano (nome)", ctaAntigo);
  if (objetivo) propor("brandObjective", `${objetivo.charAt(0).toUpperCase()}${semPontoFinal(objetivo.slice(1))}.`, "Objetivo do Silo do plano");
  return mudancas;
}

/** Os Assuntos dos Suportes no CTA do Pilar: até três, entre aspas, na ordem do plano; o resto contado. */
export function editorialSupportList(subjects: readonly string[]): string {
  const citados = subjects.slice(0, 3).map(item => `“${item}”`);
  const resto = subjects.length - citados.length;
  if (resto > 0) return `${citados.join(", ")} e mais ${resto}`;
  return citados.length > 1 ? `${citados.slice(0, -1).join(", ")} e ${citados[citados.length - 1]}` : citados.join("");
}

/** A frase curta da prévia, por artigo. */
export function planEditorialLineSentence(changes: readonly EditorialLineChange[], pendingLeft: readonly EditorialLineField[]): string {
  const resto = pendingLeft.filter(field => !changes.some(change => change.field === field));
  // O público só vem do BrandDNA aprovado: pendente aqui = sem BrandDNA, e a frase diz o caminho.
  const publico = resto.includes("audience") ? ` Público pendente (sem BrandDNA aprovado): ${EDITORIAL_LINE_BRAND_DNA_HINT}.` : "";
  const outros = resto.filter(field => field !== "audience");
  const semFonte = outros.length ? ` ${changes.length ? "Continua pendente" : "Sem fonte"}: ${outros.map(field => EDITORIAL_LINE_FIELD_LABELS[field]).join(", ")} — fica para a revisão humana.` : "";
  if (!changes.length) return resto.length ? `Nada a gravar.${publico}${semFonte}` : "Linha editorial já preenchida: nada a gravar.";
  return `Vai gravar a versão seguinte com ${changes.map(change => `${change.label} (${change.source})`).join(", ")}.${publico}${semFonte}`;
}

/** O corpo da impressão digital (o servidor faz o sha256): grupo, e por artigo a versão de hoje e o que muda. */
export function planEditorialLineHashBody(input: { groupId: string; lines: readonly { articleId: string; versionId: string; changes: readonly EditorialLineChange[] }[] }): string {
  return JSON.stringify({ groupId: input.groupId, lines: [...input.lines].sort((a, b) => a.articleId.localeCompare(b.articleId)).map(line => ({ articleId: line.articleId, versionId: line.versionId, changes: line.changes.map(change => [change.field, change.after]) })) });
}
