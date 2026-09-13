/**
 * YMYL E E-E-A-T DO ARTIGO — como exigência de evidência, não como nota.
 *
 * Duas decisões de método aqui, ambas deliberadas:
 *
 *   1. NÃO EXISTE NOTA DE E-E-A-T. Ninguém sabe calcular a que o Google dá, e
 *      fingir que sabe produz número bonito e falso. O que existe são SINAIS
 *      OBSERVÁVEIS numa página — autoria, fontes, data, entidade responsável —
 *      e o Radar reporta o que viu.
 *
 *   2. YMYL ELEVA A EXIGÊNCIA, não bloqueia a pesquisa. Quando o tema toca
 *      saúde, dinheiro ou segurança, o pacote passa a exigir fonte primária e
 *      revisão de especialista — e diz isso ao Planejador e ao Especialista.
 *
 * A DESCOBERTA POR BUSCA E POR IA SAIU DAQUI. Este módulo teve, por um tempo,
 * um esboço dela: quatro listas de texto e uma leitura de topo de funil. Ele
 * cumpriu o papel de fixar o vocabulário e virou dívida no dia em que a camada
 * de verdade nasceu com o mesmo nome. Duas funções homônimas em módulos
 * diferentes é uma armadilha silenciosa — a autoridade agora é uma só, em
 * `ai-discovery-context`, derivada de conceito, pergunta, entidade e evidência.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import { radarDeclaredArticleIntent } from "./editorial-identity.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarExtractionPage } from "./analysis-contracts.ts";

/* ------------------------------- YMYL ----------------------------------- */

export const RadarYmylRelevanceSchema = z.enum(["NONE", "LOW", "MATERIAL", "HIGH"]);
export type RadarYmylRelevance = z.infer<typeof RadarYmylRelevanceSchema>;

/*
 * Os campos onde o tema aparece. A classificação é declarada e auditável — se
 * ela errar, dá para apontar a palavra que a fez errar e corrigir a lista.
 */
const YMYL_ALTO = /\b(saude|saúde|doenc|doenç|sintoma|diagnostic|tratamento|medicament|remedio|remédio|dosagem|gravidez|cancer|câncer|diabetes|depress|ansiedade|suicid|vacina|cirurgia|nutric|nutriç|dieta|emagrec)\b/i;
const YMYL_FINANCEIRO = /\b(investiment|financiament|emprestim|empréstim|credito|crédito|divida|dívida|imposto|tributar|aposentadoria|seguro|juros|renda fixa|criptomoeda)\b/i;
const YMYL_MATERIAL = /\b(seguranc|seguranç|juridic|jurídic|advogad|direito|contrato|lei |legisla|crianca|criança|bebe|bebê|idoso|alergi|toxic|efeito colateral|contraindic)\b/i;

export type RadarYmylAssessment = {
  relevance: RadarYmylRelevance;
  /** As expressões que sustentam a classificação. Nada de veredicto sem prova. */
  signals: string[];
  reason: string;
  /** O que o pacote passa a exigir. Vazio quando não se aplica. */
  evidenceRequirements: string[];
  /** O especialista precisa revisar antes do pacote final? */
  specialistReviewRequired: boolean;
};

export function assessRadarYmylRelevance(context: RadarArticleResearchContext): RadarYmylAssessment {
  const texto = [
    context.article.promise,
    radarDeclaredArticleIntent(context.article),
    ...context.editorialTopics,
    ...context.resolvedKeywordTexts,
  ].filter(Boolean).join(" · ");

  const signals: string[] = [];
  if (YMYL_ALTO.test(texto)) signals.push("saúde ou bem-estar físico");
  if (YMYL_FINANCEIRO.test(texto)) signals.push("dinheiro, crédito ou investimento");
  if (YMYL_MATERIAL.test(texto)) signals.push("segurança, direito ou público vulnerável");

  const relevance: RadarYmylRelevance = signals.length >= 2 ? "HIGH"
    : signals.length === 1 ? "MATERIAL"
      : /\b(bem-estar|cuidado|pele|cabelo|exercicio|exercício|sono)\b/i.test(texto) ? "LOW"
        : "NONE";

  const exigencias = relevance === "HIGH" || relevance === "MATERIAL"
    ? [
      "Fonte primária ou documento oficial para cada afirmação factual sensível.",
      "Literatura científica ou órgão reconhecido quando houver recomendação de conduta.",
      "Autoria identificada e revisão por especialista com credencial pertinente.",
      "Data de publicação e de revisão visíveis.",
      "Nenhuma promessa de resultado sem evidência declarada.",
    ]
    : relevance === "LOW"
      ? ["Fonte identificável para afirmações factuais; evitar recomendação de conduta sem respaldo."]
      : [];

  return {
    relevance,
    signals,
    reason: signals.length
      ? `O tema toca ${signals.join(" e ")}: a exigência de evidência sobe.`
      : "O tema não apresenta sinais de decisão sensível sobre saúde, dinheiro ou segurança.",
    evidenceRequirements: exigencias,
    specialistReviewRequired: relevance === "HIGH" || relevance === "MATERIAL",
  };
}

/* ------------------------------- E-E-A-T -------------------------------- */

export type RadarEeatSignals = {
  sampleSize: number;
  /** Páginas da amostra que identificam quem escreveu. */
  withAuthor: number;
  /** Páginas que expõem data de publicação ou atualização. */
  withDates: number;
  /** Páginas que declaram entidade responsável em dados estruturados. */
  withOrganization: number;
  /** Páginas que citam fontes externas. */
  withExternalSources: number;
  observations: string[];
  /** O que o nosso artigo vai precisar para competir neste conjunto. */
  requirements: string[];
};

/**
 * Os sinais que a amostra realmente mostrou.
 *
 * Sem nota, sem média ponderada: contagem sobre o que a extração observou, e
 * uma leitura do que isso exige de nós para competir ali.
 */
export function readRadarEeatSignals(input: {
  pages: readonly RadarExtractionPage[];
  ymyl: RadarYmylAssessment;
}): RadarEeatSignals {
  const pages = [...input.pages];
  const withAuthor = pages.filter(page => Boolean(page.author && page.author.trim())).length;
  const withDates = pages.filter(page => page.hasDates).length;
  const withOrganization = pages.filter(page => page.structuredDataTypes.some(tipo => /organization|person|article|medical/i.test(tipo))).length;
  const withExternalSources = pages.filter(page => page.externalLinkCount > 0).length;

  const observations: string[] = [];
  if (!pages.length) observations.push("Sem páginas analisadas: nenhum sinal de autoria ou fonte pôde ser observado.");
  else {
    observations.push(`${withAuthor} de ${pages.length} página(s) identificam autoria.`);
    observations.push(`${withDates} de ${pages.length} expõem data.`);
    observations.push(`${withExternalSources} de ${pages.length} citam fonte externa.`);
  }

  const requirements: string[] = [];
  if (pages.length && withAuthor > pages.length / 2) requirements.push("A maioria dos concorrentes assina o conteúdo: autoria identificada é padrão nesta busca.");
  if (pages.length && withExternalSources > pages.length / 2) requirements.push("A maioria cita fontes externas: publicar sem referência ficaria abaixo do padrão observado.");
  if (input.ymyl.specialistReviewRequired) requirements.push("Tema YMYL: revisão e assinatura de especialista com credencial pertinente antes da publicação.");

  return { sampleSize: pages.length, withAuthor, withDates, withOrganization, withExternalSources, observations, requirements };
}
