/**
 * ===== 2026-10-14 · F3 · O DIFERENCIAL DA MARCA E O FECHAMENTO EM 4 CAMPOS =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §9
 * (D7 e D8, decididas pelo dono em 2026-10-14 pela recomendação). O Guardião de
 * SEO do dono deu "Diferencial 15/100" e "Fechamento 20/100": o método da marca
 * não tinha campo, e o fechamento era uma linha de instrução sem conferência.
 *
 *   - `brandEdge`: a entrega concreta e, depois dela, o nome do método (uma vez);
 *     o contraste com a agência genérica; 2 ou 3 sinais de autoridade local, com a
 *     seção; a seção de decisão (fundo de funil);
 *   - `closing` em 4 campos conferidos: dor → mudança para a estrutura própria →
 *     facilidade (quem faz é a marca) → diagnóstico, o CTA ÚNICO (D7: a fala
 *     aprovada do especialista vai para a mudança e a facilidade, na voz dele;
 *     ela não substitui mais o diagnóstico);
 *   - D8: a oferta do diagnóstico é da Skill de voz da Marca (seção "Oferta de
 *     diagnóstico", `lib/marca/brand-diagnosis-offer.ts`); sem ela, o texto
 *     padrão neutro, e o painel da Marca mostra a proposta para o dono aplicar.
 *
 * Réguas de palavras, não de sentido (como as de `human-voice-guideline.ts`).
 * Módulo puro: sem fetch, sem banco, sem relógio.
 */
import {
  BRAND_DIAGNOSIS_OFFER_DEFAULT,
  BRAND_DIAGNOSIS_OFFER_HEADING,
  brandDiagnosisOfferOf,
  type BrandDiagnosisOfferSection,
} from "../marca/brand-diagnosis-offer.ts";

/** Os 4 campos do fechamento, na ordem (ditos iguais ao pedido, à conferência e ao CSV). */
export const RADAR_CLOSING_FIELDS = Object.freeze([
  { key: "pain", label: "Dor" },
  { key: "structureShift", label: "Mudança para a estrutura própria" },
  { key: "ease", label: "Facilidade (quem faz é a marca)" },
  { key: "diagnosis", label: "Diagnóstico (CTA único)" },
] as const);
export type RadarClosingFieldKey = (typeof RADAR_CLOSING_FIELDS)[number]["key"];

/** O fechamento em 4 campos, como a planta nova o grava (aditivo; ausente nas plantas anteriores). */
export type RadarClosingFields = { pain: string; structureShift: string; ease: string; diagnosis: string };

/** O bloco "Diferencial da marca" (aditivo, opcional). */
export type RadarBrandEdge = {
  /** Entrega concreta → o nome do método, uma vez, DEPOIS da entrega; a seção onde entra. */
  method: Array<{ deliverable: string; methodName: string | null; section: string }>;
  /** O contraste com a agência de posts e anúncios, ancorado no que a SERP mostra. */
  vsGeneric: string;
  /** 2 ou 3 sinais de autoridade local, cada um com a seção. */
  localSignals: Array<{ signal: string; section: string }>;
  /** A seção de decisão (critérios, custo, prazo, como avaliar quem executa). */
  bottomFunnel: string;
};

export const RADAR_BRAND_EDGE_LIMITS = Object.freeze({ method: 3, localSignals: 3, localSignalsMin: 2 });

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const t = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");

/*
 * O VERBO DE VERIFICAÇÃO DO DIAGNÓSTICO ("olho seu site", "analisamos o perfil",
 * "verifico", "confiro", "avalio", "mapeio", "reviso", "diagnóstico"): o CTA
 * oferece uma verificação concreta, não "vamos conversar".
 */
const VERIFICA = /\b(?:olh(?:o|amos|ar|a|e)|analis\w*|verific\w*|confer\w*|confir\w*|avali\w*|mape\w*|revis\w*|examin\w*|audit\w*|diagnostic\w*|checklist|levant\w*)\b/;
/* As chamadas: pergunta direta e imperativo de contato. Duas ou mais são dois CTAs. */
const CHAMADA = /\b(?:agende|marque|fale|chame|clique|acesse|baixe|siga|assine|inscreva|peca|solicite|entre em contato|me chama|manda|mande|vamos)\b/g;

/** D7 · O diagnóstico tem verbo de verificação (o que a marca olha) — régua de palavras. */
export const radarClosingDiagnosisVerifies = (texto: string | null | undefined): boolean => VERIFICA.test(semAcento(t(texto)));

/** D7 · Quantas chamadas o texto faz: perguntas diretas ("?") e imperativos de contato. */
export function radarClosingCalls(texto: string | null | undefined): number {
  const lido = semAcento(t(texto));
  if (!lido) return 0;
  const perguntas = (lido.match(/\?/g) || []).length;
  const imperativos = (lido.match(CHAMADA) || []).length;
  return Math.max(perguntas, imperativos);
}

/*
 * QUEM FAZ, NA FACILIDADE: a marca (primeira pessoa de quem assina, "nós", "a
 * gente", "nossa equipe", o nome da marca), nunca "você começa com poucas
 * páginas" (o caso real: a facilidade virou tarefa da leitora).
 */
const QUEM_FAZ = /\b(?:eu|nos|a gente|nossa equipe|nosso time|a equipe|fa[cz]o|fazemos|cuido|cuidamos|organizo|organizamos|escrevo|escrevemos|publico|publicamos|pesquiso|pesquisamos|monto|montamos|resolvo|resolvemos|entrego|entregamos)\b/;
export function radarClosingEaseNamesDoer(texto: string | null | undefined, marca: string | null = null): boolean {
  const lido = semAcento(t(texto));
  if (!lido) return false;
  if (QUEM_FAZ.test(lido)) return true;
  const nome = semAcento(t(marca));
  return Boolean(nome && lido.includes(nome));
}

/* A chamada explícita fora do diagnóstico ("agende", "fale com", "clique") — a pergunta retórica da dor não conta. */
const CHAMADA_EXPLICITA = /\b(?:agende|marque|fale com|chame|clique|acesse|baixe|siga|assine|inscreva|solicite|entre em contato|me chama|mande)\b/;

/** O que a conferência diz de um fechamento em 4 campos (lista vazia = passa). */
export function radarClosingIssues(closing: Partial<RadarClosingFields> | null | undefined, marca: string | null = null): string[] {
  if (!closing) return [];
  const problemas: string[] = [];
  const vazios = RADAR_CLOSING_FIELDS.filter(campo => !t(closing[campo.key])).map(campo => campo.label);
  if (vazios.length) problemas.push(`faltam ${vazios.join(", ")}`);
  if (t(closing.ease) && !radarClosingEaseNamesDoer(closing.ease, marca)) problemas.push("a facilidade não diz quem faz (a marca faz; a leitora só contribui com o que sabe)");
  if (t(closing.diagnosis) && !radarClosingDiagnosisVerifies(closing.diagnosis)) problemas.push("o diagnóstico não diz o que a marca verifica (verbo + objeto: \"olho seu site, seu perfil no Google…\")");
  if (radarClosingCalls(closing.diagnosis) > 1) problemas.push("o diagnóstico faz mais de uma chamada (um CTA só)");
  for (const campo of ["pain", "structureShift", "ease"] as const) {
    if (CHAMADA_EXPLICITA.test(semAcento(t(closing[campo])))) problemas.push(`${RADAR_CLOSING_FIELDS.find(item => item.key === campo)!.label.toLowerCase()} chama para a ação: a chamada é só o diagnóstico`);
  }
  return problemas;
}

/*
 * ===== D8 · A OFERTA DO DIAGNÓSTICO, DA SKILL DA MARCA =====
 */
export type RadarDiagnosisOffer = {
  /** O texto que vale como base do diagnóstico. */
  text: string;
  /** "skill" = a seção da Skill de voz; "default" = o texto padrão neutro (a Skill não tem a seção). */
  source: "skill" | "default";
};

/** A oferta de diagnóstico da Skill corrente (seção "Oferta de diagnóstico"); sem ela, o texto padrão neutro. */
export function radarDiagnosisOfferOf(secoes: ReadonlyArray<BrandDiagnosisOfferSection> | null | undefined): RadarDiagnosisOffer {
  const daSkill = brandDiagnosisOfferOf(secoes);
  return daSkill ? { text: daSkill, source: "skill" } : { text: BRAND_DIAGNOSIS_OFFER_DEFAULT, source: "default" };
}

/** A frase que o pedido, a nota e o CSV dizem sobre a origem da oferta. */
export function radarDiagnosisOfferNote(oferta: RadarDiagnosisOffer): string {
  return oferta.source === "skill"
    ? `Oferta de diagnóstico da Skill de voz da Marca (seção "${BRAND_DIAGNOSIS_OFFER_HEADING}"): ${oferta.text}`
    : `A Skill de voz da Marca não tem a seção "${BRAND_DIAGNOSIS_OFFER_HEADING}" (D8): o diagnóstico usa o texto padrão neutro ("${oferta.text}"); a proposta de texto para a Skill v2 está no painel da Marca, para o dono aplicar.`;
}
