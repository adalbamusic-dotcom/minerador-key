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
 *   CTA        ← o Pilar do plano (Suporte → "leia o Pilar") ou o objetivo do
 *                Silo do plano (Pilar); sem nenhum, fica pendente
 *   objetivo   ← o objetivo do Silo do plano
 *
 * Valor já preenchido (por gente, pela melhoria, pela IA) nunca é trocado.
 * A gravação é uma versão nova (v+1) com decisão humana; nada no Minerador,
 * nada no Redator. Domínio puro: sem React, sem rede, sem banco.
 */
export const EDITORIAL_LINE_LABEL = "Linha editorial" as const;
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
  const propor = (field: EditorialLineField, after: string | null, source: string) => {
    const antes = input.current[field] ?? "";
    if (!after || !isEditorialPending(antes) || after === antes) return;
    mudancas.push({ field, label: EDITORIAL_LINE_FIELD_LABELS[field], before: antes || "(vazio)", after, source });
  };
  const assunto = limpa(input.subjectPhrase);
  const principal = limpa(input.principalKeyword);
  const intencao = limpa(input.serpIntent);
  if (assunto) propor("angle", `${semPontoFinal(assunto)}${intencao ? ` — intenção ${intencao.toLowerCase()} confirmada pela SERP` : ""}.`, intencao ? "Assunto + parecer de SERP" : "Assunto (título cadastrado)");
  const escopo = limpa(input.scope);
  if (escopo) propor("promise", escopo, "Escopo do plano");
  if (assunto) propor("problem", `Quem busca “${principal ?? assunto}” quer resolver: ${semPontoFinal(assunto)}${/[?]$/.test(assunto) ? "" : "."}`, "Assunto (título cadastrado)");
  const publico = input.brandAudience.map(item => limpa(item)).filter((item): item is string => Boolean(item));
  if (publico.length) propor("audience", publico.join("; "), "BrandDNA aprovado");
  const pilar = limpa(input.pillarSubject);
  const objetivo = limpa(input.siloObjective);
  const silo = limpa(input.siloName);
  if (input.role === "Suporte" && pilar) propor("cta", `Aprofundar no artigo Pilar do Silo${silo ? ` “${silo}”` : ""}: “${semPontoFinal(pilar)}”.`, "Pilar do plano");
  else if (objetivo) propor("cta", `Próximo passo do Silo${silo ? ` “${silo}”` : ""}: ${semPontoFinal(objetivo)}.`, "Objetivo do Silo do plano");
  if (objetivo) propor("brandObjective", `${objetivo.charAt(0).toUpperCase()}${semPontoFinal(objetivo.slice(1))}.`, "Objetivo do Silo do plano");
  return mudancas;
}

/** A frase curta da prévia, por artigo. */
export function planEditorialLineSentence(changes: readonly EditorialLineChange[], pendingLeft: readonly EditorialLineField[]): string {
  if (!changes.length) return pendingLeft.length ? `Nada a gravar: ${pendingLeft.map(field => EDITORIAL_LINE_FIELD_LABELS[field]).join(", ")} sem fonte (sem BrandDNA aprovado ou sem objetivo no plano) — fica para a revisão humana.` : "Linha editorial já preenchida: nada a gravar.";
  const resto = pendingLeft.filter(field => !changes.some(change => change.field === field));
  return `Vai gravar a versão seguinte com ${changes.map(change => `${change.label} (${change.source})`).join(", ")}.${resto.length ? ` Continua pendente: ${resto.map(field => EDITORIAL_LINE_FIELD_LABELS[field]).join(", ")} (sem fonte).` : ""}`;
}

/** O corpo da impressão digital (o servidor faz o sha256): grupo, e por artigo a versão de hoje e o que muda. */
export function planEditorialLineHashBody(input: { groupId: string; lines: readonly { articleId: string; versionId: string; changes: readonly EditorialLineChange[] }[] }): string {
  return JSON.stringify({ groupId: input.groupId, lines: [...input.lines].sort((a, b) => a.articleId.localeCompare(b.articleId)).map(line => ({ articleId: line.articleId, versionId: line.versionId, changes: line.changes.map(change => [change.field, change.after]) })) });
}
