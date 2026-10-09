import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintCommercial,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import type { RadarBrandVoice } from "../lib/radar/brand-voice.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import type { RadarPortableExportAssembledArticle } from "../lib/radar/portable-export-batch.ts";
import type { RadarSiloExportWritingContext } from "../lib/radar/portable-silo-export.ts";
import type { RadarWritingArticleContext, RadarWritingPublication } from "../lib/radar/portable-writing-export.ts";

/*
 * ===== 2026-10-09 · A PLANTA CONCLUÍDA NA BANCADA DO CSV "PARA ESCREVER" =====
 *
 * Regra do dono (2026-10-09): o artigo-modelo é o fundamento único, e o CSV
 * "Para escrever" sem a planta concluída não é montado (`needs_article_blueprint`).
 * As suítes que provam o resto da linha (identidade, publicado, Silo, voz, "Não
 * cobrir", veredito, fontes, limites…) passam a montá-la COM a planta — a mesma
 * que a IA organizaria sobre o pacote: o esqueleto M da SERP vira as seções (o
 * que a conferência deixa), a abertura responde à principal, capa e dois
 * respiros, sem link. Sem IA nem rede: a resposta é montada aqui e passa pela
 * MESMA conferência da plataforma (`radarSanitizeArticleBlueprint`, fechando).
 *
 * Fora do glob dos testes (não termina em `.test.mts`).
 */

type OpcoesDaPlanta = {
  silo?: RadarSiloExportWritingContext | null;
  articleId?: string;
  publication?: RadarWritingPublication | null;
  /** Ajustes na resposta da IA (seções, títulos…), antes da conferência. */
  resposta?: Record<string, unknown>;
  /** A planta que não posicionou link interno nenhum (para provar a ressalva do artigo isolado). */
  semLinks?: boolean;
  /** As seções M do esqueleto que a planta descartou (a IA não as organizou como seção). */
  semSecoes?: RegExp;
  /** A Skill de voz que o pedido leva (as exclusões dela chegam ao esqueleto e à conferência). */
  brandVoice?: RadarBrandVoice | null;
  /** O bloco comercial da Amazon congelada (2026-10-09b). */
  commercial?: RadarArticleBlueprintCommercial | null;
};

const semInterrogacao = (valor: string) => valor.replace(/[?.!\s]+$/, "");

/** A resposta que a IA daria sobre o esqueleto: até quatro seções M (as que não estão fora do escopo), na ordem. */
export function respostaDaPlanta(brief: RadarArticleBlueprintBrief, patch: Record<string, unknown> = {}, opcoes: { semLinks?: boolean; semSecoes?: RegExp } = {}): Record<string, unknown> {
  const principal = brief.article.principal || "o tema";
  const dentro = brief.skeleton.filter(item => !item.outOfScope && item.level === 2 && !opcoes.semSecoes?.test(item.heading)).slice(0, 4);
  /* A conferência pede três seções válidas: sem esqueleto bastante, entram seções de passo, sem origem (a conferência as aceita com nota). */
  const enchimento = [
    { h2: `O primeiro passo em ${principal}`, readerQuestion: `Por onde começar em ${principal}?`, answerFirst: "Comece pelo passo que destrava os outros.", from: [] as string[] },
    { h2: `Os erros que atrasam ${principal}`, readerQuestion: `O que evitar em ${principal}?`, answerFirst: "Evite pular etapas e medir cedo demais.", from: [] as string[] },
    { h2: `Como saber se ${principal} deu certo`, readerQuestion: "Como medir o resultado?", answerFirst: "Compare o antes e o depois com o mesmo critério.", from: [] as string[] },
  ];
  const doEsqueleto = dentro.map(item => ({ h2: item.heading, readerQuestion: item.readerQuestion || `${semInterrogacao(item.heading)}?`, answerFirst: `Resposta direta sobre ${semInterrogacao(item.heading).toLowerCase()}.`, from: [item.id] }));
  /* Os links que a IA poria: um candidato K do Silo (irmãos e SiloPage) por seção, com a âncora no nome do destino. */
  const candidatos = opcoes.semLinks ? [] : brief.linkCandidates.filter(item => item.role !== "Página da marca (Skill de voz)").slice(0, 4);
  const secoes = [...doEsqueleto, ...enchimento].slice(0, Math.max(4, doEsqueleto.length)).map((secao, indice) => {
    const candidato = candidatos[indice];
    return candidato ? { ...secao, internalLinks: [{ candidate: candidato.id, anchor: candidato.label.replace(/^SiloPage\s+/, "").replace(/["“”]/g, ""), reason: `leva ao ${candidato.role}` }] } : secao;
  });
  return {
    keywordPlan: { reading: "A principal no H1 e no primeiro parágrafo." },
    reader: brief.article.audience || "Quem procura a keyword principal.",
    promise: `Entender ${principal} e saber o próximo passo.`,
    angle: { statement: "Um passo a passo com exemplo comentado.", evidence: [] },
    title: { h1: `${principal.charAt(0).toUpperCase()}${principal.slice(1)}: o guia prático`, seoTitle: principal, metaDescription: `O que fazer sobre ${principal}, passo a passo.` },
    opening: { readerQuestion: `Como resolver ${principal}?`, direction: "Responder no primeiro parágrafo.", evidence: [] },
    sections: secoes,
    discarded: [],
    closing: { turn: "Retome a resposta principal.", cta: "Comece pelo primeiro passo hoje.", nextStep: null },
    visual: [
      { slot: "CAPA", section: null, concept: "Bancada clara com o material do tema", prompt: "Bancada clara com o material do tema, luz natural. Sem texto legível. Proporção 16:9.", alt: "Material do tema na bancada", caption: "" },
      { slot: "R1", section: secoes[0]?.h2 ?? null, concept: "Mão organizando o primeiro passo", prompt: "Mão organizando o primeiro passo, luz natural. Sem texto legível. Proporção 4:3.", alt: "Primeiro passo", caption: "" },
      { slot: "R2", section: secoes[1]?.h2 ?? null, concept: "Caderno com a lista de passos", prompt: "Caderno aberto com a lista de passos, sem texto legível. Proporção 4:3.", alt: "Lista de passos", caption: "" },
    ],
    eeat: [], warnings: [],
    ...patch,
  };
}

/** A planta concluída de uma entrada: o pedido real, a resposta acima e a conferência que fecha. */
export function plantaDe(entrada: RadarPortableExportInput, opcoes: OpcoesDaPlanta = {}): RadarArticleBlueprintPayload {
  const brief = buildRadarArticleBlueprintBrief({
    entrada,
    silo: opcoes.silo ?? null,
    articleId: opcoes.articleId ?? "artigo",
    publication: opcoes.publication ?? null,
    ...(opcoes.brandVoice ? { brandVoice: opcoes.brandVoice } : {}),
    ...(opcoes.commercial ? { commercial: opcoes.commercial } : {}),
  });
  const ai = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, opcoes.resposta, { semLinks: opcoes.semLinks, semSecoes: opcoes.semSecoes }));
  return { ...radarSanitizeArticleBlueprint(ai, brief, { close: true }).payload, approval: "APPROVED" };
}

/** As montadas do lote, cada uma com a planta concluída dela (a investigação de vídeo como perfil primário não pede planta). */
export function comPlantas(montadas: readonly RadarPortableExportAssembledArticle[], silo: RadarSiloExportWritingContext | null = null): RadarPortableExportAssembledArticle[] {
  return montadas.map(item => (item.entrada.profile === "YOUTUBE" || item.blueprint
    ? item
    : { ...item, blueprint: plantaDe(item.entrada, { silo, articleId: item.articleId }) }));
}

/** O contexto da linha com a planta concluída da entrada (a que a linha recebe da leitura do export). */
export function comPlanta(entrada: RadarPortableExportInput, contexto: RadarWritingArticleContext): RadarWritingArticleContext {
  if (contexto.blueprint || entrada.profile === "YOUTUBE") return contexto;
  return { ...contexto, blueprint: plantaDe(entrada, { silo: contexto.silo, articleId: contexto.articleId ?? "artigo", publication: contexto.publication }) };
}
