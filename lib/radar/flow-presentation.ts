import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import { classifyRadarSemanticTerm, isPrimaryRadarSemanticTerm } from "./analysis-insights.ts";

export const RADAR_TAB_KEYS = ["resumo", "serp", "referencias", "analise-serp", "evidencias-adicionais", "relatorio", "historico"] as const;
export type RadarTab = typeof RADAR_TAB_KEYS[number];

const RADAR_TAB_ALIASES: Record<string, RadarTab> = {
  resumo: "resumo",
  serp: "serp",
  "resultados-serp": "serp",
  "resultados_serp": "serp",
  concorrentes: "referencias",
  referencias: "referencias",
  "selecionar-referencias": "referencias",
  "selecionar_referencias": "referencias",
  estrutura: "analise-serp",
  "estrutura-observada": "analise-serp",
  semantica: "analise-serp",
  "semantica-observada": "analise-serp",
  "analise-serp": "analise-serp",
  "analise_serp": "analise-serp",
  "analise-amostra": "analise-serp",
  "analise_amostra": "analise-serp",
  analysis: "analise-serp",
  evidencias: "evidencias-adicionais",
  especialista: "evidencias-adicionais",
  "evidencias-adicionais": "evidencias-adicionais",
  "evidencias_adicionais": "evidencias-adicionais",
  decisoes: "relatorio",
  curadoria: "relatorio",
  relatorio: "relatorio",
  historico: "historico",
};

export function resolveRadarTab(value: string | null | undefined): RadarTab {
  const normalized = (value || "").trim().toLocaleLowerCase("pt-BR");
  return RADAR_TAB_ALIASES[normalized] || "resumo";
}

export const RADAR_FLOW_STEPS = [
  "SERP coletada",
  "Referências selecionadas",
  "Páginas analisadas",
  "Relatório gerado",
  "Relatório aprovado",
  "Enviado ao Planejador",
] as const;

export type RadarFlowProgress = { label: typeof RADAR_FLOW_STEPS[number]; done: boolean; current: boolean }[];

export function buildRadarFlowProgress(input: {
  serpCollected: boolean;
  referencesSelected: boolean;
  pagesAnalyzed: boolean;
  reportGenerated: boolean;
  reportApproved: boolean;
  sentToPlanner: boolean;
}): RadarFlowProgress {
  const done = [input.serpCollected, input.referencesSelected, input.pagesAnalyzed, input.reportGenerated, input.reportApproved, input.sentToPlanner];
  const firstOpen = done.findIndex(value => !value);
  return RADAR_FLOW_STEPS.map((label, index) => ({ label, done: done[index], current: index === (firstOpen === -1 ? done.length - 1 : firstOpen) }));
}

type SemanticTerm = RadarAnalysisVersion["payload"]["semanticTerms"][number];

export type RadarReferenceRole = "primary" | "support" | "format" | "own" | "excluded" | "pending";

export function deriveRadarReferenceRole(input: { decision: string; reason?: string; ownDomain?: boolean; formatReference?: boolean }): RadarReferenceRole {
  if (input.ownDomain) return input.decision === "excluded" ? "excluded" : "own";
  if (input.decision === "excluded") return "excluded";
  if (input.decision !== "included") return "pending";
  if (input.formatReference || /formato|vídeo|video|social/i.test(input.reason || "")) return "format";
  if (/apoio|apoio complementar|complementar/i.test(input.reason || "")) return "support";
  return "primary";
}

export function selectRadarSemanticPresentation(terms: SemanticTerm[], centralTerms: string[]) {
  const central = new Set(centralTerms.map(term => term.trim().toLocaleLowerCase("pt-BR")).filter(Boolean));
  const relevant: SemanticTerm[] = [];
  const ignored: SemanticTerm[] = [];
  for (const term of terms) {
    const normalized = term.term.trim().toLocaleLowerCase("pt-BR");
    const group = classifyRadarSemanticTerm(term);
    const centralTerm = central.has(normalized);
    const observedRepeatedly = term.pageCount > 1 || term.frequency >= 3;
    const explicitDecision = term.decision === "include_topic" || term.decision === "support_term";
    if (centralTerm || (group === "content" && (observedRepeatedly || explicitDecision) && isPrimaryRadarSemanticTerm(term))) relevant.push(term);
    else ignored.push(term);
  }
  return { central: relevant.filter(term => central.has(term.term.trim().toLocaleLowerCase("pt-BR"))), relevant: relevant.filter(term => !central.has(term.term.trim().toLocaleLowerCase("pt-BR"))), ignored };
}

export function radarSemanticDecisionLabel(decision: SemanticTerm["decision"]) {
  return decision === "include_topic" ? "Considerar" : decision === "support_term" ? "Usar como apoio" : decision === "ignore" ? "Ignorar" : "Aguardando decisão";
}
