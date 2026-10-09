import { radarFrozenObservedAtOfAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import type { RadarArticleBlueprintPayload } from "../lib/radar/article-blueprint.ts";

/*
 * ===== 2026-10-09 · O ARTIGO-MODELO CONCLUÍDO NA BANCADA DO EXPORT =====
 *
 * A regra do dono desta rodada: toda entrega (CSV para escrever, de vídeo,
 * técnico e por Silo) exige a planta CONCLUÍDA de cada artigo. As bancadas que
 * rodam a rota de verdade sobre o PostgREST simulado precisam, então, da linha
 * de `radar_article_blueprints` de cada artigo finalizado — presa à
 * investigação congelada pela referência gravada (`investigationRef`), como a
 * versão nova grava, e não pelo hash do dossiê (que a bancada não fixa).
 *
 * Uma planta por instante de congelamento das versões do item e por versão do
 * ArticleDNA da marca: a regra do export (`radarArticleBlueprintPick`) escolhe
 * a concluída mais nova que casa com a investigação corrente, seja qual for a
 * versão de análise que a leitura escolheu. Nada aqui chama rede.
 */

type Linha = Record<string, unknown>;
type Banco = Record<string, Linha[]>;

/** Uma planta concluída e completa o bastante para os quatro formatos (capa, respiro, seção com link e fechamento). */
export function plantaConcluidaDaBancada(h1: string, investigationRef?: unknown): RadarArticleBlueprintPayload {
  return {
    schemaVersion: 1,
    blueprint: {
      keywordPlan: { reading: "A principal define a intenção e o H1.", principalPlacement: ["H1", "primeiro parágrafo"], complementary: [], slugNote: null },
      reader: "Quem quer uma rotina de cuidados que caiba na manhã",
      promise: "Montar a rotina da manhã em poucos passos, sem produto sobrando",
      angle: { statement: "A rotina curta e constante vence a rotina longa e esquecida", evidence: [] },
      title: { h1, alternatives: [`${h1}: o passo a passo`], seoTitle: `${h1} | Bancada`, metaDescription: "Os passos da rotina da manhã, na ordem certa." },
      opening: { readerQuestion: "Qual é a ordem dos produtos de manhã?", direction: "Responder a ordem no primeiro parágrafo.", evidence: [] },
      sections: [
        {
          h2: "A ordem dos passos de manhã", readerQuestion: "Em que ordem passar os produtos?", answerFirst: "Limpeza, tratamento, hidratação e protetor, nesta ordem.",
          h3: ["Limpeza", "Hidratação"], explain: ["Cada passo prepara a pele para o seguinte."], terms: ["rotina"], paragraphs: 3, bold: ["protetor"],
          internalLinks: [], externalLinks: [], evidence: [], specialist: null, video: null, image: "R1", practical: null,
        },
        {
          h2: "Quanto tempo a rotina leva", readerQuestion: "Cabe em cinco minutos?", answerFirst: "Cabe, com quatro passos e sem esperas longas.",
          h3: [], explain: ["O tempo de espera entre os passos é curto."], terms: [], paragraphs: 2, bold: [],
          internalLinks: [], externalLinks: [], evidence: [], specialist: null, video: null, image: null, practical: null,
        },
      ],
      closing: { turn: "A rotina que dura é a que cabe no dia.", specialist: null, cta: "Monte a sua rotina hoje.", nextStep: "" },
      visual: [
        { slot: "CAPA", section: null, concept: "Bancada de banheiro com quatro frascos em fila", prompt: "Quatro frascos em fila numa bancada clara, luz da manhã. Sem texto legível. Proporção 16:9.", alt: "Quatro produtos em fila", caption: "" },
        { slot: "R1", section: "A ordem dos passos de manhã", concept: "Mão aplicando hidratante", prompt: "Mão aplicando hidratante no rosto, luz natural. Sem texto legível. Proporção 4:3.", alt: "Aplicação de hidratante", caption: "" },
      ],
      eeat: [], warnings: [],
    } as unknown as RadarArticleBlueprintPayload["blueprint"],
    measures: {
      serp: { comparablePages: 5, words: { median: 1500, p25: 1200, p75: 1800 }, h2: 6, h3: 4, paragraphs: 20, images: 3, lists: 2 },
      plan: { sections: 2, h3: 2, paragraphs: 5, bold: 1, images: 2, respites: 1, internalLinks: 0, externalLinks: 0, wordsMin: 1200, wordsMax: 1800 },
    },
    linkCandidates: [], sources: [], evidence: [],
    ...(investigationRef ? { investigationRef } : {}),
  } as RadarArticleBlueprintPayload;
}

/**
 * O banco semeado COM o artigo-modelo concluído de cada artigo finalizado.
 * `exceto`: os artigos que ficam sem planta (para provar a recusa).
 */
export function comArtigosModeloConcluidos(banco: Banco, opcoes: { exceto?: readonly string[] } = {}): Banco {
  const dnas = (banco.editorial_artifact_versions || []).filter(linha => linha.artifact_type === "article_dna");
  const linhas: Linha[] = [];
  let numero = 0;
  for (const item of banco.editorial_workflow_items || []) {
    const articleId = String(item.article_id);
    if (opcoes.exceto?.includes(articleId)) continue;
    const versoes = (((item.payload as Linha | null)?.analysisVersions as unknown[]) || [])
      .filter((versao): versao is Linha => Boolean(versao) && typeof versao === "object");
    const instantes = [...new Set(versoes.map(versao => radarFrozenObservedAtOfAnalysis(versao.payload)).filter((valor): valor is string => Boolean(valor)))];
    /* A coluna `payload` guarda o envelope da versão: o ArticleDNA mora em `payload.payload`. */
    const doArtigo = (linha: Linha) => {
      const envelope = linha.payload as Linha | null;
      return ((envelope?.payload as Linha | null)?.articleId ?? envelope?.articleId) === articleId;
    };
    const versoesDoDna = dnas.filter(doArtigo).map(linha => String(linha.version_id));
    for (const frozenAt of instantes) {
      for (const articleDnaVersionId of versoesDoDna) {
        numero += 1;
        linhas.push({
          id: `planta-da-bancada-${numero}`, brand_id: item.marca_id, article_id: articleId,
          /* Outro hash de propósito: a planta vale pela investigação congelada, não pelo dossiê montado ao vivo. */
          bundle_hash: `hash-de-outra-leitura-${numero}`, version_number: numero, state: "APPROVED", origin: "ai",
          payload: plantaConcluidaDaBancada(`Artigo-modelo ${numero}`, { frozenAt, frozenBundleId: null, frozenBundleHash: null, articleDnaVersionId, articleDnaContentHash: null }),
          validation: [], created_by: "ator-da-bancada", created_at: "2026-10-09T09:00:00+00:00",
          approved_by: "ator-da-bancada", approved_at: "2026-10-09T09:00:00+00:00",
        });
      }
    }
  }
  return { ...banco, radar_article_blueprints: linhas };
}
