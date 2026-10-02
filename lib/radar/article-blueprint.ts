import { z } from "zod";
import type { RadarPortableExportInput } from "./portable-export.ts";
import type { RadarSiloExportWritingContext } from "./portable-silo-export.ts";
import { radarBrandVoiceOwnUrls, radarBrandVoiceRef, radarBrandVoiceStatusLabel, type RadarBrandVoice, type RadarBrandVoiceRef } from "./brand-voice.ts";
import { RADAR_VIDEO_USAGE_HINT, RADAR_VIDEO_USAGE_LABEL, type RadarVideoUsage } from "./video-library.ts";
import {
  radarWritingCleanUrl,
  radarWritingCompareKey,
  radarWritingDecodeEntities,
  radarWritingProjections,
  radarWritingRhetoricalQuestion,
  radarWritingSpecialistContributions,
  radarWritingUnsupportedClaims,
  type RadarWritingPublication,
} from "./portable-writing-export.ts";

/**
 * ===== O ARTIGO-MODELO (SDD diretriz editorial, Adendo A — aprovado em 2026-10-02) =====
 *
 * "A SERP teria que fornecer uma fotocópia de um artigo ideal para concorrer":
 * quantos H2, H3, parágrafos, negritos, imagens; o sentido de cada keyword; onde
 * vão os links internos e quantos; quando um link externo reforça uma afirmação.
 *
 * A IA monta o artigo-modelo sobre o pacote CONGELADO; este módulo prepara o que
 * ela recebe (cada evidência com um id), corrige o que ela devolve contra esse
 * pacote e transforma a versão APROVADA nas colunas do CSV. As medidas não são da
 * IA: vêm dos concorrentes comparáveis, contadas aqui.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== a resposta da IA ============================== */

const texto = z.string().trim().min(1).max(600);
const curto = z.string().trim().min(1).max(220);
const ids = z.array(z.string().trim().min(1).max(12)).max(12).default([]);

export const RadarArticleBlueprintAiSchema = z.object({
  keywordPlan: z.object({
    reading: texto,
    principalPlacement: z.array(curto).max(6).default([]),
    complementary: z.array(z.object({ keyword: curto, placement: curto, reason: texto })).max(12).default([]),
    slugNote: z.string().trim().max(600).nullable().default(null),
  }),
  reader: texto,
  promise: texto,
  angle: z.object({ statement: texto, evidence: ids }),
  title: z.object({
    h1: curto,
    alternatives: z.array(curto).max(3).default([]),
    seoTitle: curto,
    metaDescription: z.string().trim().min(1).max(320),
  }),
  opening: z.object({ readerQuestion: curto, direction: texto, evidence: ids }),
  sections: z.array(z.object({
    h2: curto,
    readerQuestion: curto,
    answerFirst: texto,
    h3: z.array(curto).max(6).default([]),
    explain: z.array(texto).max(8).default([]),
    paragraphs: z.number().int().min(1).max(20),
    bold: z.array(curto).max(8).default([]),
    terms: z.array(curto).max(10).default([]),
    evidence: ids,
    specialist: z.string().trim().max(12).nullable().default(null),
    video: z.string().trim().max(12).nullable().default(null),
    internalLinks: z.array(z.object({ candidate: z.string().trim().min(1).max(12), anchor: curto, reason: texto })).max(4).default([]),
    externalLinks: z.array(z.object({ claim: texto, sourceType: curto, source: z.string().trim().max(12).nullable().default(null) })).max(3).default([]),
    image: z.string().trim().max(12).nullable().default(null),
    practical: z.string().trim().max(600).nullable().default(null),
  })).min(3).max(12),
  closing: z.object({
    turn: texto,
    specialist: z.string().trim().max(12).nullable().default(null),
    cta: texto,
    nextStep: z.string().trim().max(600).nullable().default(null),
  }),
  visual: z.array(z.object({
    slot: z.string().trim().min(1).max(12),
    section: z.string().trim().max(220).nullable().default(null),
    concept: texto,
    prompt: z.string().trim().min(1).max(1200),
    alt: curto,
    caption: curto,
  })).min(1).max(5),
  eeat: z.array(texto).max(6).default([]),
  warnings: z.array(texto).max(8).default([]),
});
export type RadarArticleBlueprintAi = z.infer<typeof RadarArticleBlueprintAiSchema>;

/* ============================== o que a IA recebe ============================== */

export type RadarArticleBlueprintEvidence = { id: string; kind: string; text: string };
export type RadarArticleBlueprintLinkCandidate = {
  id: string;
  label: string;
  role: string;
  /** Endereço como o pacote o conhece: URL publicada, caminho planejado ou nada. */
  destination: string | null;
  status: "PUBLISHED" | "PLANNED" | "UNRESOLVED";
  fromGraph: boolean;
};
export type RadarArticleBlueprintSource = { id: string; url: string; title: string; claim: string };

export type RadarArticleBlueprintMeasures = {
  comparablePages: number;
  words: { median: number | null; p25: number | null; p75: number | null };
  h2: number | null;
  h3: number | null;
  paragraphs: number | null;
  images: number | null;
  lists: number | null;
};

export type RadarArticleBlueprintBrief = {
  article: {
    principal: string;
    complementary: Array<{ keyword: string; role: string; volume: number | null }>;
    subject: string | null;
    intent: string | null;
    funnel: string | null;
    siloRole: string | null;
    audience: string | null;
    promise: string | null;
    slug: string | null;
    publishedUrl: string | null;
    mustCover: string[];
  };
  silo: { label: string; centralEntity: string | null; excludedTopics: string[] } | null;
  evidence: RadarArticleBlueprintEvidence[];
  linkCandidates: RadarArticleBlueprintLinkCandidate[];
  graphLinks: string[];
  sources: RadarArticleBlueprintSource[];
  unsupportedClaims: string[];
  specialist: Array<{ id: string; kind: string | null; text: string }>;
  /**
   * 2026-10-02 · `usage` é o modo de uso escolhido pelo dono (Adendo B, D6),
   * só presente quando há modo. Contexto e Sugestão de pauta não são citáveis.
   * `title` e `url` não vão ao pedido: viram o retrato `payload.videos`, que
   * resolve o V da seção no CSV (o V do pedido não é o V da coluna de fontes).
   */
  videos: Array<{ id: string; text: string; usage?: RadarVideoUsage; title?: string; url?: string | null }>;
  outOfScope: string[];
  competitorTitles: string[];
  measures: RadarArticleBlueprintMeasures;
  /** 2026-10-02 · A Skill de voz CORRENTE da Marca (Adendo C; spec da Marca §24), inteira. Sem ela, null. */
  brandVoice: { ref: RadarBrandVoiceRef; markdown: string } | null;
};

const t = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const corte = (valor: string, limite: number) => (valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor);
const mediana = (valores: number[]): number | null => {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : Math.round((ordem[meio - 1] + ordem[meio]) / 2);
};
const percentil = (valores: number[], p: number): number | null => {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  return ordem[Math.min(ordem.length - 1, Math.max(0, Math.round((ordem.length - 1) * p)))];
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** As medidas do artigo ideal saem das páginas comparáveis, contadas aqui — nunca da IA. */
export function radarArticleBlueprintMeasures(structures: ReadonlyArray<{ words: number; h2: number; h3: number; paragraphs: number; images: number; lists: number } | null>): RadarArticleBlueprintMeasures {
  const medidas = structures.filter((item): item is NonNullable<typeof item> => Boolean(item) && (item?.words || 0) > 0);
  const eixo = (chave: "words" | "h2" | "h3" | "paragraphs" | "images" | "lists") => medidas.map(item => item[chave]);
  return {
    comparablePages: medidas.length,
    words: { median: mediana(eixo("words")), p25: percentil(eixo("words"), 0.25), p75: percentil(eixo("words"), 0.75) },
    h2: mediana(eixo("h2")),
    h3: mediana(eixo("h3")),
    paragraphs: mediana(eixo("paragraphs")),
    images: mediana(eixo("images")),
    lists: mediana(eixo("lists")),
  };
}

export function buildRadarArticleBlueprintBrief(input: {
  entrada: RadarPortableExportInput;
  silo: RadarSiloExportWritingContext | null;
  articleId: string;
  publication: RadarWritingPublication | null;
  brandVoice?: RadarBrandVoice | null;
}): RadarArticleBlueprintBrief {
  const p = radarWritingProjections(input.entrada);
  const entrada = input.entrada;
  const principal = t(p.dna.principalKeyword);
  const volume = new Map(p.keywords.map(item => [radarWritingCompareKey(item.keyword), typeof item.volume === "number" ? item.volume : null]));
  const evidence: RadarArticleBlueprintEvidence[] = [];
  const add = (prefixo: string, kind: string, valor: string) => {
    const limpo = corte(radarWritingDecodeEntities(valor).replace(/\s+/g, " ").trim(), 260);
    if (!limpo || UUID.test(limpo)) return;
    evidence.push({ id: `${prefixo}${evidence.filter(item => item.id.startsWith(prefixo)).length + 1}`, kind, text: limpo });
  };

  const serp = p.serpObservada;
  for (const item of serp?.organic.slice(0, 10) || []) {
    const url = radarWritingCleanUrl(item.url);
    add("S", "resultado orgânico", `${item.title || item.domain} · ${url && !UUID.test(url) ? url : item.domain}${item.snippet?.thirdPartyExcerpt ? ` · "${corte(item.snippet.thirdPartyExcerpt, 140)}"` : ""}`);
  }
  for (const item of serp?.peopleAlsoAsk || []) if (t(item.question) && !radarWritingRhetoricalQuestion(t(item.question))) add("P", "Pessoas também perguntam", t(item.question));
  for (const item of p.serp.questions.slice().sort((a, b) => b.pages - a.pages).slice(0, 12)) {
    if (!radarWritingRhetoricalQuestion(item.question)) add("P", "pergunta da amostra", `${item.question} (${item.pages} de ${item.sampleSize} páginas)`);
  }
  for (const item of serp?.relatedSearches || []) if (t(item.term)) add("B", "busca relacionada", t(item.term));
  if (serp?.features?.aiOverview?.shown) add("A", "AI Overview", `aparece; cita ${serp.features.aiOverview.citedSources.slice(0, 5).map(fonte => fonte.domain).join(", ")}`);
  const foraDoEscopo = p.serp.editorialCandidates.filter(item => item.verdict === "OUT_OF_SCOPE").map(item => radarWritingDecodeEntities(item.observedLabel));
  const chavesFora = new Set(foraDoEscopo.map(radarWritingCompareKey));
  for (const item of p.serp.concepts.filter(conceito => conceito.status !== "ISOLATED").slice(0, 20)) {
    if (!chavesFora.has(radarWritingCompareKey(item.label))) add("C", "conceito da amostra", `${item.label} (${item.sourceCount} de ${item.sampleSize} páginas)`);
  }
  for (const item of p.serp.gaps.slice(0, 6)) add("G", "lacuna", `${item.subject} (${item.pagesCovering} de ${item.sampleSize} páginas cobrem)`);
  for (const item of p.serp.differentiations.slice(0, 6)) if (!chavesFora.has(radarWritingCompareKey(item.subject))) add("D", "diferencial possível", `${item.subject} (${item.pagesCovering} páginas cobrem)`);
  for (const item of serp?.features?.videos || []) add("Y", "vídeo na SERP", `${item.title || "vídeo"} · ${item.url}`);
  if (serp?.diagnostic) {
    if (serp.diagnostic.dominantFormats.length) add("F", "formato dominante", serp.diagnostic.dominantFormats.join(", "));
    for (const oportunidade of serp.diagnostic.opportunities.slice(0, 4)) add("O", "oportunidade da SERP", oportunidade);
  }

  /* Os destinos possíveis dos links: o Silo inteiro, a SiloPage e o que o grafo aprovado pede. */
  const linkCandidates: RadarArticleBlueprintLinkCandidate[] = [];
  const doGrafo = new Set(p.linksDoPlano.map(link => radarWritingCompareKey(link.targetTitle)));
  for (const membro of (input.silo?.members || []).filter(item => item.articleId !== input.articleId)) {
    const rotulo = t(membro.principalKeyword) || t(membro.title) || t(membro.slug);
    if (!rotulo) continue;
    linkCandidates.push({
      id: `K${linkCandidates.length + 1}`,
      label: rotulo,
      role: membro.role,
      destination: membro.slug ? `/${membro.slug}` : null,
      status: membro.slug ? "PLANNED" : "UNRESOLVED",
      fromGraph: doGrafo.has(radarWritingCompareKey(rotulo)) || doGrafo.has(radarWritingCompareKey(membro.title)),
    });
  }
  const pagina = input.silo?.siloPage;
  if (pagina) {
    const publicada = t(pagina.publishedUrl);
    linkCandidates.push({
      id: `K${linkCandidates.length + 1}`,
      label: `SiloPage "${input.silo?.label}"`,
      role: "SiloPage",
      destination: publicada || t(pagina.canonical) || (pagina.slug ? `/${pagina.slug}` : null),
      status: publicada ? "PUBLISHED" : pagina.canonical || pagina.slug ? "PLANNED" : "UNRESOLVED",
      fromGraph: false,
    });
  }

  /*
   * A PÁGINA DA MARCA QUE A SKILL CITA (ex.: a página comercial) é destino
   * possível do CTA. Só URL do PRÓPRIO domínio; e só entra no texto se a IA a
   * puser no plano e o dono aprovar.
   */
  if (input.brandVoice) {
    const site = t(input.publication?.publishedUrl) || t(entrada.article.canonical) || t(input.silo?.siloPage?.publishedUrl) || t(input.silo?.siloPage?.canonical) || null;
    for (const url of radarBrandVoiceOwnUrls(input.brandVoice, site)) {
      if (linkCandidates.some(item => item.destination === url)) continue;
      linkCandidates.push({ id: `K${linkCandidates.length + 1}`, label: `Página da marca ${new URL(url).pathname}`, role: "Página da marca (Skill de voz)", destination: url, status: "PUBLISHED", fromGraph: false });
    }
  }

  const afirmacao = new Map((p.autoridade?.claims || []).map(claim => [claim.claimId, claim.canonicalClaim]));
  const sources: RadarArticleBlueprintSource[] = [];
  for (const fonte of (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS")) {
    if (sources.some(item => item.url === fonte.sourceUrl)) continue;
    sources.push({ id: `X${sources.length + 1}`, url: fonte.sourceUrl, title: corte(fonte.sourceTitle || fonte.sourceDomain, 120), claim: corte(afirmacao.get(fonte.claimId) || "", 200) });
  }

  const especialista = radarWritingSpecialistContributions(p).map(item => ({ id: item.rotulo, kind: item.tipo, text: item.resposta }));
  /*
   * 2026-10-02 · OS VÍDEOS COM O MODO DE USO DO DONO (Adendo B, D6).
   *
   * Os trechos casados vêm primeiro, como antes, agora com o modo da fonte
   * quando há. Depois, um V por vídeo com modo — inclusive o que nenhuma pauta
   * casou (Incorporar, Contexto, Sugestão de pauta). "Não usar" não chega: a
   * projeção já o tirou. Sem modo nenhum, a lista é a de antes.
   */
  const trechosDeVideo = p.video.briefs.flatMap(brief => brief.extracts.slice(0, 2).map(trecho => ({
    text: `${trecho.sourceTitle} ${trecho.startLabel}–${trecho.endLabel}: ${corte(trecho.text, 220)}${trecho.usage ? ` · modo: ${RADAR_VIDEO_USAGE_LABEL[trecho.usage]}` : ""}`,
    usage: trecho.usage,
    title: trecho.sourceTitle,
    url: trecho.sourceUrl ?? null,
  })));
  const videosComModo = (p.video.selected || []).map(item => ({
    text: [
      `Vídeo "${item.title}"${item.url ? ` (${item.url})` : ""} · modo: ${item.usageLabel} — ${RADAR_VIDEO_USAGE_HINT[item.usage]}`,
      ...(item.section ? [`seção da pauta: ${item.section}`] : []),
      ...(item.excerpt ? [`trecho ${item.excerpt.startLabel}–${item.excerpt.endLabel}: ${corte(item.excerpt.text, 220)}`] : []),
      ...(item.summary ? [`do que trata: ${corte(item.summary, 220)}`] : []),
      ...(item.note ? [`nota do dono: ${corte(item.note, 220)}`] : []),
    ].join(" · "),
    usage: item.usage as RadarVideoUsage | undefined,
    title: item.title,
    url: item.url,
  }));
  const videos = [...trechosDeVideo, ...videosComModo]
    .map((item, indice) => ({ id: `V${indice + 1}`, text: item.text, ...(item.usage ? { usage: item.usage } : {}), title: item.title, url: item.url }));

  const publicacao = input.publication;
  return {
    article: {
      principal,
      complementary: [
        ...p.dna.secondaryKeywords.map(keyword => ({ keyword, role: "secundária" })),
        ...p.dna.narrativeReinforcements.map(keyword => ({ keyword, role: "reforço narrativo" })),
      ].filter(item => radarWritingCompareKey(item.keyword) !== radarWritingCompareKey(principal))
        .map(item => ({ ...item, volume: volume.get(radarWritingCompareKey(item.keyword)) ?? null })),
      subject: p.assunto?.phrase ?? null,
      intent: t(p.dna.intent) || null,
      funnel: t(p.dna.funnel) || null,
      siloRole: t(p.dna.siloRole) || null,
      audience: t(entrada.article.audience) || null,
      promise: t(entrada.article.promise) || null,
      slug: t(publicacao?.slug) || t(entrada.article.slug) || null,
      publishedUrl: publicacao?.published || entrada.article.publishedProtected ? t(publicacao?.publishedUrl) || t(entrada.article.canonical) || null : null,
      mustCover: p.dna.mustCover,
    },
    silo: input.silo && input.silo.kind === "silo"
      ? { label: input.silo.label, centralEntity: input.silo.centralEntity, excludedTopics: input.silo.excludedTopics }
      : null,
    evidence,
    linkCandidates,
    graphLinks: [
      ...p.linksDoPlano.map(link => `${link.relationship.split(",")[0]?.trim() || "link"}: âncora "${link.suggestedAnchor}" → ${link.targetTitle}`),
      ...p.dna.internalLinkRequirements.filter(item => !UUID.test(item)),
    ].slice(0, 12),
    sources,
    unsupportedClaims: radarWritingUnsupportedClaims(p.autoridade, p.serp).map(item => item.afirmacao).slice(0, 8),
    specialist: especialista,
    videos,
    outOfScope: [...foraDoEscopo, ...(input.silo?.excludedTopics || [])],
    competitorTitles: (serp?.organic || []).map(item => t(item.title)).filter(Boolean),
    measures: radarArticleBlueprintMeasures((p.concorrentes?.competitors || []).filter(item => item.comparable).map(item => item.structure)),
    brandVoice: input.brandVoice ? { ref: radarBrandVoiceRef(input.brandVoice), markdown: input.brandVoice.markdown.slice(0, 24_000) } : null,
  };
}

/* ============================== o pedido à IA ============================== */

export function radarArticleBlueprintPrompt(brief: RadarArticleBlueprintBrief): { system: string; user: string } {
  const m = brief.measures;
  const system = [
    "Você é o editor-chefe de SEO de uma agência brasileira. Monte o ARTIGO-MODELO que vence a SERP: a planta completa do artigo ideal, para um redator escrever.",
    "Responda SOMENTE com JSON no formato pedido, em português do Brasil.",
    "Regras:",
    "1. Use só o que está no pacote. Cite evidências pelos ids dados (S, P, B, A, C, G, D, Y, F, O). Nunca invente id, número, estudo, autor, depoimento ou URL.",
    "2. A SERP manda na intenção (Google e respostas de IA): responda a intenção que a busca mostra, com o recorte do leitor da marca. Se a amostra for de outro público, diga como adaptar ao leitor.",
    "3. Dê sentido a TODAS as keywords: onde cada uma entra (H1, H2, H3, corpo) e por quê, sem forçar repetição.",
    "4. Não cubra o que está em 'fora do escopo'. Sem seção de perguntas frequentes (FAQ): as perguntas entram nas seções.",
    "5. Cada seção abre respondendo a pergunta dela (resposta clara, citável por IA), depois explica. Negrito só em termo ou entidade, nunca frase inteira.",
    "6. Links internos: só para os candidatos K dados, com âncora natural e o motivo. Inclua o link para o Pilar quando o artigo for Suporte e para a SiloPage quando houver. Distribua pelas seções certas.",
    "7. Links externos: só onde uma afirmação precisa de reforço; use a fonte X quando existir; sem fonte X, source = null (o redator vai obter uma fonte oficial).",
    "8. Abertura: a dúvida real do leitor (nunca pergunta retórica de concorrente). Fechamento e CTA na voz do especialista (id E) quando houver, levando ao próximo passo no Silo.",
    "9. Plano visual: slot CAPA e 2 ou 3 respiros (R1, R2, R3), cada respiro ligado a uma seção, com prompt de imagem, ALT e legenda. Sem texto na imagem, sem marca de terceiros, sem antes/depois.",
    "10. Não copie títulos nem frases de concorrentes. URL, slug e canonical publicados não mudam.",
    `11. Medidas: use como referência os concorrentes comparáveis (${m.comparablePages} páginas): ${m.words.median ? `mediana de ${m.words.median} palavras (P25 ${m.words.p25}, P75 ${m.words.p75})` : "palavras não medidas"}, H2 ${m.h2 ?? "?"}, H3 ${m.h3 ?? "?"}, parágrafos ${m.paragraphs ?? "?"}, imagens ${m.images ?? "?"}. Supere em profundidade útil, não em enchimento.`,
    "12. VOZ DA MARCA: quando o pacote trouxer a Skill de voz, ela manda na forma: promessa, H1, títulos, abertura, CTA, transição comercial, vocabulário e prompts de imagem seguem a Skill; o que ela proíbe não entra. O CTA usa a oferta da Skill e, se couber, o candidato 'Página da marca'. A Skill não muda keyword, intenção nem escopo do artigo.",
    /* 2026-10-02 · Adendo B (D6): a regra só entra quando algum vídeo tem modo; sem modo, o pedido é o de antes. */
    ...(brief.videos.some(item => item.usage)
      ? ["13. VÍDEOS DA MARCA (id V): o modo de uso de cada um é decisão do dono e manda. Incorporar: o vídeo pode virar uma seção com ele incorporado (campo video da seção). Citação: fala literal, entre aspas, atribuída ao vídeo e com o tempo. Apoio: o trecho sustenta um ponto, atribuído ao vídeo e com o tempo. Contexto: só para entender o assunto; NÃO é citável e não vai no campo video. Sugestão de pauta: ideia de seção ou pergunta a validar contra a SERP; não é citável e não vai no campo video. Vídeo marcado 'Não usar' não está no pacote e não entra."]
      : []),
  ].join("\n");

  const a = brief.article;
  const linhas = (titulo: string, itens: string[]) => (itens.length ? [`## ${titulo}`, ...itens.map(item => `- ${item}`), ""] : []);
  const user = [
    "# Artigo",
    `Keyword principal: ${a.principal}`,
    ...a.complementary.map(item => `Keyword complementar (${item.role}): ${item.keyword}${item.volume !== null ? ` · ${item.volume}/mês` : ""}`),
    ...(a.subject ? [`Assunto (tronco): ${a.subject}`] : []),
    `Intenção declarada: ${a.intent || "não declarada"}${a.funnel ? ` · funil ${a.funnel}` : ""}`,
    `Papel no Silo: ${a.siloRole || "não declarado"}`,
    ...(a.audience ? [`Público: ${a.audience}`] : []),
    ...(a.promise ? [`Promessa declarada: ${a.promise}`] : []),
    ...(a.slug ? [`Slug: ${a.slug}`] : []),
    ...(a.publishedUrl ? [`Publicado em: ${a.publishedUrl} (preservar URL, slug e canonical; é atualização)`] : []),
    ...(a.mustCover.length ? [`Cobertura obrigatória: ${a.mustCover.join(" · ")}`] : []),
    "",
    ...(brief.silo ? [`# Silo: ${brief.silo.label}${brief.silo.centralEntity ? ` (tema central: ${brief.silo.centralEntity})` : ""}`, ""] : []),
    ...linhas("Evidências da SERP (cite pelo id)", brief.evidence.map(item => `${item.id} · ${item.kind}: ${item.text}`)),
    ...linhas("Candidatos a link interno (use o id K)", brief.linkCandidates.map(item => `${item.id} · ${item.role} · ${item.label} · ${item.destination || "sem endereço"} · ${item.status === "PUBLISHED" ? "publicado" : item.status === "PLANNED" ? "planejado" : "não resolvido"}${item.fromGraph ? " · pedido pelo grafo aprovado" : ""}`)),
    ...linhas("Grafo aprovado (links que o Arquiteto pediu)", brief.graphLinks),
    ...linhas("Fontes verificadas (id X)", brief.sources.map(item => `${item.id} · ${item.title} · ${item.url} · sustenta: ${item.claim}`)),
    ...linhas("Afirmações que o mercado repete SEM fonte (não afirmar como fato)", brief.unsupportedClaims),
    ...linhas("Especialista (id E; voz de quem pratica)", brief.specialist.map(item => `${item.id}${item.kind ? ` (${item.kind})` : ""}: ${item.text}`)),
    ...linhas("Vídeos da marca (id V)", brief.videos.map(item => `${item.id}: ${item.text}`)),
    ...linhas("Fora do escopo (não cobrir)", brief.outOfScope),
    ...(brief.brandVoice ? [`# Voz da marca — Skill "${brief.brandVoice.ref.name}" v${brief.brandVoice.ref.version} (${radarBrandVoiceStatusLabel(brief.brandVoice.ref.status)} na Marca). Siga em toda a copy, no CTA e no plano visual.`, brief.brandVoice.markdown, ""] : []),
    "# Formato da resposta (JSON)",
    JSON.stringify({
      keywordPlan: { reading: "como as keywords se atendem juntas", principalPlacement: ["H1", "primeiro parágrafo"], complementary: [{ keyword: "", placement: "H2 x", reason: "" }], slugNote: null },
      reader: "", promise: "", angle: { statement: "", evidence: ["S1"] },
      title: { h1: "", alternatives: [""], seoTitle: "até 60 caracteres", metaDescription: "até 155 caracteres" },
      opening: { readerQuestion: "", direction: "", evidence: ["P1"] },
      sections: [{ h2: "", readerQuestion: "", answerFirst: "", h3: [""], explain: [""], paragraphs: 3, bold: ["termo"], terms: ["termo LSI"], evidence: ["C1"], specialist: null, video: null, internalLinks: [{ candidate: "K1", anchor: "", reason: "" }], externalLinks: [{ claim: "", sourceType: "fonte oficial", source: null }], image: "R1", practical: null }],
      closing: { turn: "", specialist: "E1", cta: "", nextStep: "" },
      visual: [{ slot: "CAPA", section: null, concept: "", prompt: "", alt: "", caption: "" }],
      eeat: [""], warnings: [""],
    }),
  ].join("\n");
  return { system, user };
}

/* ============================== a correção do servidor ============================== */

/**
 * 2026-10-02 · O RETRATO DE UM VÍDEO V DO PEDIDO (Adendo B; aditivo ao payload do Adendo A).
 *
 * O V que a IA põe na seção segue a numeração do PEDIDO (trechos de todas as
 * pautas, depois os vídeos com modo), que não é a da coluna de fontes do CSV.
 * Sem o retrato, "Vídeo da marca: V3" no CSV não diz qual vídeo é — e, como o
 * modo é lido ao vivo (fora do hash), um "Não usar" depois da aprovação faria
 * o V apontar para nada ou para OUTRO vídeo. O retrato guarda o que a IA viu
 * (título, endereço público, modo na geração); o id da fonte não entra.
 */
export type RadarArticleBlueprintVideo = { id: string; title: string; url: string | null; usage: RadarVideoUsage | null };

/**
 * 2026-10-02 · O QUE O EXPORT SABE, AO VIVO, DE CADA VÍDEO DO ARTIGO: um por
 * trecho da projeção e um por vídeo com modo. `sourcesColumnLabel` é o V da
 * coluna de fontes do CSV, quando o trecho está lá.
 */
export type RadarArticleBlueprintLiveVideo = { title: string; url: string | null; usage: RadarVideoUsage | null; sourcesColumnLabel: string | null };

/* Título genérico de fonte sem nome não identifica vídeo: só o endereço decide. */
const TITULOS_GENERICOS = new Set(["fonte da biblioteca", "video da biblioteca"]);

/** O mesmo vídeo: pelo endereço quando os dois têm; senão, pelo título. */
function mesmoVideo(a: { title: string; url: string | null }, b: { title: string; url: string | null }): boolean {
  if (a.url && b.url) return a.url === b.url;
  const chave = radarWritingCompareKey(a.title);
  return Boolean(chave) && !TITULOS_GENERICOS.has(chave) && chave === radarWritingCompareKey(b.title);
}

export type RadarArticleBlueprintPayload = {
  schemaVersion: 1;
  blueprint: RadarArticleBlueprintAi;
  measures: {
    serp: RadarArticleBlueprintMeasures;
    plan: { sections: number; h3: number; paragraphs: number; bold: number; images: number; respites: number; internalLinks: number; externalLinks: number; wordsMin: number | null; wordsMax: number | null };
  };
  linkCandidates: RadarArticleBlueprintLinkCandidate[];
  sources: RadarArticleBlueprintSource[];
  evidence: RadarArticleBlueprintEvidence[];
  /**
   * 2026-10-02 · Aditivo (Adendo B): o retrato dos vídeos V que a IA recebeu.
   * Ausente em versões antigas e quando o pedido não teve vídeo — aí a seção
   * sai como antes ("Vídeo da marca: Vn").
   */
  videos?: RadarArticleBlueprintVideo[];
  /** 2026-10-02 · Aditivo: a versão da Skill de voz que a IA recebeu. Ausente em versões antigas. */
  brandVoice?: RadarBrandVoiceRef | null;
};

export class RadarArticleBlueprintInvalidError extends Error {
  readonly notes: string[];
  constructor(message: string, notes: string[]) {
    super(message);
    this.name = "RadarArticleBlueprintInvalidError";
    this.notes = notes;
  }
}

/**
 * O QUE A IA DEVOLVE É CONFERIDO CONTRA O PACOTE — e corrigido, com aviso.
 *
 * Id que não existe sai; link para fora do Silo sai; URL externa sem fonte vira
 * "fonte a obter"; seção fora do escopo ou de FAQ sai. Recusar a resposta inteira
 * jogaria fora uma chamada paga por um id errado; aceitar sem conferir deixaria a
 * IA inventar. Sobra menos de três seções: aí sim, recusa.
 */
export function radarSanitizeArticleBlueprint(ai: RadarArticleBlueprintAi, brief: RadarArticleBlueprintBrief): { payload: RadarArticleBlueprintPayload; notes: string[] } {
  const notes: string[] = [];
  const evidencias = new Set(brief.evidence.map(item => item.id));
  const candidatos = new Set(brief.linkCandidates.map(item => item.id));
  const fontes = new Set(brief.sources.map(item => item.id));
  const especialistas = new Set(brief.specialist.map(item => item.id));
  const videos = new Set(brief.videos.map(item => item.id));
  /*
   * 2026-10-02 · Contexto e Sugestão de pauta não são citáveis (Adendo B): o id
   * existe, mas não vale no campo `video` da seção. Sem modo, todo V vale.
   */
  const naoCitaveis = new Map(brief.videos.filter(item => item.usage === "CONTEXT" || item.usage === "TOPIC_SUGGESTION").map(item => [item.id, item.usage!]));
  const fora = brief.outOfScope.map(radarWritingCompareKey).filter(Boolean);
  const titulos = brief.competitorTitles.map(radarWritingCompareKey).filter(Boolean);

  const soIds = (lista: readonly string[], onde: string) => {
    const validos = lista.filter(id => evidencias.has(id));
    if (validos.length < lista.length) notes.push(`${onde}: ${lista.length - validos.length} evidência(s) com id inexistente removida(s).`);
    return validos;
  };
  const tocaForaDoEscopo = (valor: string) => {
    const chave = radarWritingCompareKey(valor);
    return fora.some(item => item.length > 3 && (chave.includes(item) || item.includes(chave)));
  };

  const visual = ai.visual.filter(item => /^(CAPA|R[1-3])$/i.test(item.slot)).map(item => ({ ...item, slot: item.slot.toUpperCase() }));
  if (!visual.some(item => item.slot === "CAPA")) notes.push("Plano visual sem capa: defina a capa antes de aprovar.");
  const respiros = visual.filter(item => item.slot.startsWith("R")).length;
  if (respiros < 2) notes.push(`Plano visual com ${respiros} respiro(s): a regra pede dois ou três.`);
  const slots = new Set(visual.map(item => item.slot));

  const secoes = ai.sections.flatMap(secao => {
    if (/\b(faq|perguntas frequentes|d[uú]vidas frequentes)\b/i.test(`${secao.h2} ${secao.readerQuestion}`)) {
      notes.push(`Seção "${secao.h2}" removida: FAQ não integra o fluxo.`);
      return [];
    }
    if (tocaForaDoEscopo(secao.h2)) {
      notes.push(`Seção "${secao.h2}" removida: o pacote marca o assunto como fora do escopo.`);
      return [];
    }
    const links = secao.internalLinks.filter(link => candidatos.has(link.candidate));
    if (links.length < secao.internalLinks.length) notes.push(`Seção "${secao.h2}": link interno para destino fora do Silo removido.`);
    const externos = secao.externalLinks.map(link => {
      if (link.source && !fontes.has(link.source)) {
        notes.push(`Seção "${secao.h2}": fonte externa "${link.source}" não existe no pacote; virou "fonte a obter".`);
        return { ...link, source: null };
      }
      return link;
    });
    const naoCitavel = secao.video ? naoCitaveis.get(secao.video) : undefined;
    if (naoCitavel) notes.push(`Seção "${secao.h2}": o vídeo ${secao.video} é de ${RADAR_VIDEO_USAGE_LABEL[naoCitavel]} (não citável); saiu do campo vídeo da seção.`);
    return [{
      ...secao,
      evidence: soIds(secao.evidence, `Seção "${secao.h2}"`),
      internalLinks: links,
      externalLinks: externos,
      specialist: secao.specialist && especialistas.has(secao.specialist) ? secao.specialist : null,
      video: secao.video && videos.has(secao.video) && !naoCitavel ? secao.video : null,
      image: secao.image && slots.has(secao.image.toUpperCase()) ? secao.image.toUpperCase() : null,
      bold: secao.bold.filter(item => item.split(/\s+/).length <= 6),
    }];
  });
  if (secoes.length < 3) {
    throw new RadarArticleBlueprintInvalidError("O artigo-modelo da IA ficou com menos de três seções válidas; gere de novo.", notes);
  }

  const h1 = radarWritingCompareKey(ai.title.h1);
  if (titulos.some(titulo => titulo === h1)) notes.push("O H1 repete o título de um concorrente: reescreva antes de aprovar.");
  if (radarWritingRhetoricalQuestion(ai.opening.readerQuestion)) notes.push("A abertura usa pergunta retórica de concorrente: troque pela dúvida do leitor.");
  if (ai.title.seoTitle.length > 65) notes.push(`SEO title com ${ai.title.seoTitle.length} caracteres (alvo ~60).`);
  if (ai.title.metaDescription.length > 165) notes.push(`Meta description com ${ai.title.metaDescription.length} caracteres (alvo ~155).`);

  const pilar = brief.linkCandidates.find(item => /pilar/i.test(item.role));
  const linksUsados = new Set(secoes.flatMap(secao => secao.internalLinks.map(link => link.candidate)));
  if (pilar && /suporte|support/i.test(brief.article.siloRole || "") && !linksUsados.has(pilar.id)) notes.push(`Falta o link para o Pilar (${pilar.label}).`);

  const closingSpecialist = ai.closing.specialist && especialistas.has(ai.closing.specialist) ? ai.closing.specialist : null;
  if (brief.specialist.some(item => item.kind === "FECHAMENTO" || item.kind === "CTA") && !closingSpecialist) notes.push("O parecer de fechamento do especialista não foi usado na virada final.");

  const blueprint: RadarArticleBlueprintAi = {
    ...ai,
    angle: { ...ai.angle, evidence: soIds(ai.angle.evidence, "Ângulo") },
    opening: { ...ai.opening, evidence: soIds(ai.opening.evidence, "Abertura") },
    sections: secoes,
    closing: { ...ai.closing, specialist: closingSpecialist },
    visual,
  };
  const m = brief.measures;
  return {
    notes,
    payload: {
      schemaVersion: 1,
      blueprint,
      measures: {
        serp: m,
        plan: {
          sections: secoes.length,
          h3: secoes.reduce((soma, secao) => soma + secao.h3.length, 0),
          paragraphs: secoes.reduce((soma, secao) => soma + secao.paragraphs, 0),
          bold: secoes.reduce((soma, secao) => soma + secao.bold.length, 0),
          images: visual.length,
          respites: respiros,
          internalLinks: secoes.reduce((soma, secao) => soma + secao.internalLinks.length, 0),
          externalLinks: secoes.reduce((soma, secao) => soma + secao.externalLinks.length, 0),
          wordsMin: m.words.p25 ?? m.words.median,
          wordsMax: m.words.p75 ?? m.words.median,
        },
      },
      linkCandidates: brief.linkCandidates,
      sources: brief.sources,
      evidence: brief.evidence,
      /* 2026-10-02 · O retrato dos V (Adendo B); sem vídeo no pedido, a chave não existe e o payload é o de antes. */
      ...(brief.videos.some(item => item.title)
        ? { videos: brief.videos.filter(item => item.title).map(item => ({ id: item.id, title: item.title!, url: item.url ?? null, usage: item.usage ?? null })) }
        : {}),
      brandVoice: brief.brandVoice?.ref ?? null,
    },
  };
}

/* ============================== a edição humana ============================== */

export const RadarArticleBlueprintEditSchema = z.object({
  promise: texto.optional(),
  reader: texto.optional(),
  title: z.object({ h1: curto.optional(), seoTitle: curto.optional(), metaDescription: z.string().trim().min(1).max(320).optional() }).optional(),
  openingQuestion: curto.optional(),
  sections: z.array(z.object({
    index: z.number().int().min(0).max(11),
    remove: z.boolean().optional(),
    h2: curto.optional(),
    readerQuestion: curto.optional(),
    answerFirst: texto.optional(),
  })).max(12).optional(),
}).strict();
export type RadarArticleBlueprintEdit = z.infer<typeof RadarArticleBlueprintEditSchema>;

/** A edição do dono vira OUTRA versão: a de antes fica como estava. */
export function radarApplyArticleBlueprintEdit(payload: RadarArticleBlueprintPayload, edit: RadarArticleBlueprintEdit): RadarArticleBlueprintPayload {
  const b = payload.blueprint;
  const porIndice = new Map((edit.sections || []).map(item => [item.index, item]));
  const secoes = b.sections.flatMap((secao, indice) => {
    const mudanca = porIndice.get(indice);
    if (!mudanca) return [secao];
    if (mudanca.remove) return [];
    return [{ ...secao, h2: mudanca.h2 ?? secao.h2, readerQuestion: mudanca.readerQuestion ?? secao.readerQuestion, answerFirst: mudanca.answerFirst ?? secao.answerFirst }];
  });
  if (secoes.length < 1) throw new RadarArticleBlueprintInvalidError("O artigo-modelo precisa de ao menos uma seção.", []);
  return {
    ...payload,
    blueprint: {
      ...b,
      promise: edit.promise ?? b.promise,
      reader: edit.reader ?? b.reader,
      title: { ...b.title, h1: edit.title?.h1 ?? b.title.h1, seoTitle: edit.title?.seoTitle ?? b.title.seoTitle, metaDescription: edit.title?.metaDescription ?? b.title.metaDescription },
      opening: { ...b.opening, readerQuestion: edit.openingQuestion ?? b.opening.readerQuestion },
      sections: secoes,
    },
    measures: {
      ...payload.measures,
      plan: {
        ...payload.measures.plan,
        sections: secoes.length,
        h3: secoes.reduce((soma, secao) => soma + secao.h3.length, 0),
        paragraphs: secoes.reduce((soma, secao) => soma + secao.paragraphs, 0),
        bold: secoes.reduce((soma, secao) => soma + secao.bold.length, 0),
        internalLinks: secoes.reduce((soma, secao) => soma + secao.internalLinks.length, 0),
        externalLinks: secoes.reduce((soma, secao) => soma + secao.externalLinks.length, 0),
      },
    },
  };
}

/* ============================== as colunas do CSV ============================== */

const rotuloDaEvidencia = (payload: RadarArticleBlueprintPayload, ids: readonly string[]) =>
  ids.map(id => payload.evidence.find(item => item.id === id)).filter((item): item is RadarArticleBlueprintEvidence => Boolean(item))
    .map(item => `${item.id} (${corte(item.text, 90)})`);

/**
 * 2026-10-02 · AS SEÇÕES DO PLANO APROVADO EM QUE UM VÍDEO ENTRA (Adendo B).
 *
 * Para o bloco dos modos da coluna de fontes dizer a seção do Incorporar que o
 * artigo-modelo aprovado escolheu, em vez de devolver a decisão a ele. `null` =
 * versão sem retrato dos vídeos (não dá para saber); lista vazia = o plano não
 * pôs este vídeo em seção nenhuma.
 */
export function radarArticleBlueprintVideoSections(payload: RadarArticleBlueprintPayload, video: { title: string; url: string | null }): string[] | null {
  if (!payload.videos) return null;
  const ids = new Set(payload.videos.filter(item => mesmoVideo(item, video)).map(item => item.id));
  return payload.blueprint.sections.filter(secao => secao.video && ids.has(secao.video)).map(secao => secao.h2);
}

/**
 * 2026-10-02 · O VÍDEO DE UMA SEÇÃO, RESOLVIDO (Adendo B).
 *
 * Sem retrato (versão antiga), a linha de antes. Com retrato, o título e o
 * endereço — nunca só o V do pedido. Com o que o export sabe ao vivo, a decisão
 * do dono depois da aprovação manda: vídeo que saiu do artigo ("Não usar" ou
 * retirado) ou que virou Contexto/Sugestão de pauta não fica no plano como se
 * valesse; a versão aprovada não muda (é imutável), o CSV avisa.
 */
function videoDaSecao(payload: RadarArticleBlueprintPayload, id: string, aoVivo: readonly RadarArticleBlueprintLiveVideo[] | null): string {
  const retrato = payload.videos?.find(item => item.id === id);
  if (!retrato) return `- Vídeo da marca: ${id}`;
  const nome = `"${retrato.title}"`;
  const endereco = retrato.url ? ` (${retrato.url})` : "";
  if (!aoVivo) return `- Vídeo da marca: ${nome}${endereco}${retrato.usage ? ` · ${RADAR_VIDEO_USAGE_LABEL[retrato.usage]}` : ""}`;
  const casados = aoVivo.filter(item => mesmoVideo(retrato, item));
  if (!casados.length) {
    return `- Vídeo da marca: ${nome} — não está mais entre os vídeos deste artigo no Radar (marcado "Não usar" ou retirado depois da aprovação): não usar nesta seção`;
  }
  const modo = casados.find(item => item.usage)?.usage ?? null;
  if (modo === "CONTEXT" || modo === "TOPIC_SUGGESTION" || modo === "NOT_USED") {
    return `- Vídeo da marca: ${nome} — passou a ${RADAR_VIDEO_USAGE_LABEL[modo]} no Radar depois da aprovação: não é citável e não entra nesta seção`;
  }
  const url = casados.find(item => item.url)?.url ?? retrato.url;
  const rotulos = [...new Set(casados.map(item => item.sourcesColumnLabel).filter((item): item is string => Boolean(item)))];
  return [
    `- Vídeo da marca: ${nome}${url ? ` (${url})` : ""}`,
    ...(modo ? [` · ${RADAR_VIDEO_USAGE_LABEL[modo]}${modo !== retrato.usage ? " (modo atual no Radar)" : ""}`] : []),
    ...(rotulos.length ? [` · trecho na coluna de fontes: ${rotulos.join(", ")}`] : []),
  ].join("");
}

/**
 * O ARTIGO-MODELO APROVADO VIRA AS COLUNAS DE ESTRUTURA DO CSV.
 *
 * Só as colunas que ele decide: título e SEO, promessa e leitor, estrutura, links
 * e plano visual. Identidade, SERP, fontes e veredito continuam como eram.
 *
 * 2026-10-02 · `aoVivo` é OPCIONAL (Adendo B): o que o export sabe agora dos
 * vídeos do artigo, para resolver o vídeo de cada seção contra o modo vigente.
 */
export function radarArticleBlueprintColumns(payload: RadarArticleBlueprintPayload, aoVivo: readonly RadarArticleBlueprintLiveVideo[] | null = null): {
  promessa_e_leitor: string;
  titulo_e_seo: string;
  estrutura: string;
  links_internos: string;
  plano_visual: string;
} {
  const b = payload.blueprint;
  const m = payload.measures;
  const candidato = new Map(payload.linkCandidates.map(item => [item.id, item]));
  const fonte = new Map(payload.sources.map(item => [item.id, item]));
  const status = (item: RadarArticleBlueprintLinkCandidate) => item.status === "PUBLISHED" ? "publicado" : item.status === "PLANNED" ? "planejado: use o caminho, sem domínio, e não invente URL" : "não resolvido: marque a âncora e não invente URL";

  const estrutura = [
    "ARTIGO-MODELO APROVADO (planta do artigo ideal; a redação é de quem escreve).",
    ...(payload.brandVoice ? [`Voz da marca usada no plano: Skill "${payload.brandVoice.name}" v${payload.brandVoice.version}.`] : []),
    `Medidas do plano: ${m.plan.sections} H2 · ${m.plan.h3} H3 · ~${m.plan.paragraphs} parágrafos · ${m.plan.bold} negritos · ${m.plan.images} imagens (capa + ${m.plan.respites} respiros) · ${m.plan.internalLinks} links internos · ${m.plan.externalLinks} links externos${m.plan.wordsMin && m.plan.wordsMax ? ` · ${m.plan.wordsMin}–${m.plan.wordsMax} palavras` : ""}.`,
    `Concorrentes comparáveis (${m.serp.comparablePages}): mediana de ${m.serp.words.median ?? "?"} palavras, ${m.serp.h2 ?? "?"} H2, ${m.serp.h3 ?? "?"} H3, ${m.serp.paragraphs ?? "?"} parágrafos, ${m.serp.images ?? "?"} imagens.`,
    `Keywords: ${b.keywordPlan.reading}`,
    ...b.keywordPlan.complementary.map(item => `- ${item.keyword} → ${item.placement} (${item.reason})`),
    ...(b.keywordPlan.slugNote ? [`Slug × principal: ${b.keywordPlan.slugNote}`] : []),
    "",
    `Abertura: responder "${b.opening.readerQuestion}" no primeiro parágrafo — ${b.opening.direction}${b.opening.evidence.length ? ` [${rotuloDaEvidencia(payload, b.opening.evidence).join("; ")}]` : ""}`,
    "",
    ...b.sections.flatMap((secao, indice) => [
      `## ${secao.h2}`,
      `- Pergunta do leitor: ${secao.readerQuestion}`,
      `- Abre respondendo: ${secao.answerFirst}`,
      ...secao.h3.map(h3 => `  ### ${h3}`),
      ...secao.explain.map(item => `- Explicar: ${item}`),
      `- ~${secao.paragraphs} parágrafo(s)${secao.bold.length ? ` · negrito em: ${secao.bold.join(", ")}` : ""}`,
      ...(secao.terms.length ? [`- Termos a nomear: ${secao.terms.join(" · ")}`] : []),
      ...(secao.evidence.length ? [`- Evidências: ${rotuloDaEvidencia(payload, secao.evidence).join("; ")}`] : []),
      ...secao.internalLinks.map(link => `- Link interno: âncora "${link.anchor}" → ${candidato.get(link.candidate)?.label || link.candidate}`),
      ...secao.externalLinks.map(link => `- Link externo: ${link.claim} → ${link.source && fonte.get(link.source) ? fonte.get(link.source)!.url : `fonte a obter (${link.sourceType})`}`),
      ...(secao.specialist ? [`- Especialista: usar ${secao.specialist}`] : []),
      ...(secao.video ? [videoDaSecao(payload, secao.video, aoVivo)] : []),
      ...(secao.image ? [`- Imagem: ${secao.image}`] : []),
      ...(secao.practical ? [`- Entrega prática: ${secao.practical}`] : []),
      ...(indice < b.sections.length - 1 ? [""] : []),
    ]),
    "",
    `Fechamento: ${b.closing.turn}${b.closing.specialist ? ` (voz do especialista ${b.closing.specialist})` : ""}`,
    `CTA: ${b.closing.cta}`,
    ...(b.closing.nextStep ? [`Próximo passo: ${b.closing.nextStep}`] : []),
    ...(b.eeat.length ? ["", `E-E-A-T: ${b.eeat.join(" · ")}`] : []),
  ].join("\n");

  const links = b.sections.flatMap(secao => secao.internalLinks.map(link => ({ secao: secao.h2, link })));
  const linksInternos = links.length
    ? [
      `Aplique somente estes ${links.length} link(s), com a âncora indicada (pode ajustar concordância):`,
      ...links.map(({ secao, link }, indice) => {
        const destino = candidato.get(link.candidate);
        return `L${indice + 1} · âncora "${link.anchor}" → ${destino ? `${destino.role} "${destino.label}"${destino.destination ? ` → ${destino.destination}` : ""} (${status(destino)})` : link.candidate} · onde: seção "${secao}" · por quê: ${link.reason}`;
      }),
    ].join("\n")
    : "Nenhum link interno no artigo-modelo aprovado.";

  return {
    promessa_e_leitor: [`Leitor: ${b.reader}`, `Promessa: ${b.promise}`, `Ângulo: ${b.angle.statement}${b.angle.evidence.length ? ` [${rotuloDaEvidencia(payload, b.angle.evidence).join("; ")}]` : ""}`].join("\n"),
    titulo_e_seo: [
      `H1: ${b.title.h1}`,
      ...(b.title.alternatives.length ? [`Alternativas: ${b.title.alternatives.join(" · ")}`] : []),
      `SEO title: ${b.title.seoTitle}`,
      `Meta description: ${b.title.metaDescription}`,
      `Keyword principal em: ${b.keywordPlan.principalPlacement.join(", ") || "H1 e primeiro parágrafo"}`,
    ].join("\n"),
    estrutura,
    links_internos: linksInternos,
    plano_visual: [
      `Plano visual: ${b.visual.length} imagem(ns).`,
      ...b.visual.map(item => `${item.slot === "CAPA" ? "Capa" : `Respiro ${item.slot.slice(1)}`}${item.section ? ` · seção "${item.section}"` : ""} · ${item.concept}\n  Prompt: ${item.prompt}\n  ALT: ${item.alt}\n  Legenda: ${item.caption}`),
    ].join("\n"),
  };
}
