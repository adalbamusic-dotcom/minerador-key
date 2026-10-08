/**
 * ===== A VOZ DA MARCA NOS ENTREGÁVEIS DO RADAR (SDD diretriz editorial, Adendo C — 2026-10-02) =====
 *
 * A Skill `brand_voice` é da Marca. Vale a regra canônica da Marca (spec §24,
 * `resolveBrandSkill`): a versão CORRENTE não arquivada — rascunho, aguardando
 * aprovação ou ativa — está disponível a todas as áreas. O Radar não a congela
 * no pacote da SERP (mudaria o hash a cada ajuste de voz): lê a corrente quando
 * monta o entregável e diz qual versão usou e em que estado ela está.
 *
 * Este módulo é a régua pura: em que assunto do entregável cada seção da Skill
 * entra, e o que dizer quando não há Skill ativa. Sem fetch, sem banco.
 */

export type RadarBrandVoiceSection = { heading: string; body: string };

/** A Skill corrente, como o servidor a leu. */
export type RadarBrandVoice = {
  versionId: string;
  version: number;
  name: string;
  contentHash: string;
  /** Estado de tela da Marca: "draft" | "pending_approval" | "active". */
  status: string;
  title: string;
  sections: RadarBrandVoiceSection[];
  /** O Markdown inteiro, para quem lê tudo (o artigo-modelo). */
  markdown: string;
};

/** O que o entregável sabe da voz: disponível (corrente não arquivada), nenhuma, ou ilegível. */
export type RadarBrandVoiceState =
  | { kind: "available"; voice: RadarBrandVoice }
  | { kind: "none" }
  | { kind: "unreadable"; reason: string };

/** A referência que fica gravada em quem usou a voz (artigo-modelo, linha do CSV). */
export type RadarBrandVoiceRef = { versionId: string; version: number; name: string; contentHash: string; status?: string };

export const radarBrandVoiceRef = (voice: RadarBrandVoice): RadarBrandVoiceRef =>
  ({ versionId: voice.versionId, version: voice.version, name: voice.name, contentHash: voice.contentHash, status: voice.status });

const ESTADO: Record<string, string> = { draft: "em rascunho", pending_approval: "aguardando aprovação", active: "ativa" };
export const radarBrandVoiceStatusLabel = (status: string | undefined) => ESTADO[status || ""] || "estado desconhecido";

/**
 * OS ASSUNTOS DO ENTREGÁVEL — a Skill de cada marca tem os títulos que quiser.
 *
 * A ordem importa: o primeiro que casa leva a seção ("Fontes, experiência e
 * autoridade" é de fontes, não de leitor). Título que não casa vai para a voz,
 * que é lida por inteiro: nada da Skill se perde.
 */
export type RadarBrandVoiceSlot = "visual" | "links" | "sources" | "structure" | "research" | "title" | "reader" | "voice";

const REGRAS: ReadonlyArray<[RadarBrandVoiceSlot, RegExp]> = [
  ["visual", /visual|imagem|imagens|fotografia|ilustra/],
  ["links", /\blinks?\b|publicad|url/],
  ["sources", /fonte|autoridade|e-?e-?a-?t|evid[eê]ncia/],
  ["structure", /constru[cç][aã]o|estrutura|transi[cç][aã]o|comercial|\bcta\b|faq|dados estruturados|formato do artigo/],
  ["research", /serp|janela|pesquisa|recursos|inadequad|exclus|n[aã]o cobrir|evitar temas/],
  ["title", /keyword|palavra-chave|t[ií]tulo|abertura|responder|h1/],
  ["reader", /miss[aã]o|p[uú]blico|leitor|leitora|persona|identidade|oferta|servi[cç]o|quem somos/],
];

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function radarBrandVoiceSlotOf(heading: string): RadarBrandVoiceSlot {
  const chave = semAcento(heading);
  for (const [slot, regra] of REGRAS) if (regra.test(chave) || regra.test(heading.toLowerCase())) return slot;
  return "voice";
}

/** As seções da Skill agrupadas por assunto, na ordem em que a marca as escreveu. */
export function radarBrandVoiceBySlot(voice: RadarBrandVoice): Record<RadarBrandVoiceSlot, RadarBrandVoiceSection[]> {
  const saida: Record<RadarBrandVoiceSlot, RadarBrandVoiceSection[]> = { visual: [], links: [], sources: [], structure: [], research: [], title: [], reader: [], voice: [] };
  for (const secao of voice.sections) {
    if (!secao.body.trim()) continue;
    saida[radarBrandVoiceSlotOf(secao.heading)].push(secao);
  }
  return saida;
}

/** Texto de um assunto: título da seção da Skill e o corpo, como a marca escreveu. */
export function radarBrandVoiceText(secoes: readonly RadarBrandVoiceSection[]): string {
  return secoes.map(secao => `${secao.heading.replace(/^\d+[.)]\s*/, "")}:\n${secao.body.trim()}`).join("\n\n");
}

/*
 * 2026-10-07 · SEÇÃO DE ENTREGA DE ARTIGO (revisão do CSV de vídeo). A Skill
 * real da marca traz "Entrega e revisão final" (H1, SEO title, meta
 * description, corpo do artigo…) e a "Instrução curta para o teste" que manda
 * ESCREVER O ARTIGO — no CSV de vídeo, as duas conflitam com a finalidade do
 * arquivo. O predicado reconhece a entrega pelo título (entrega e revisão,
 * revisão final, instrução para o teste/para o redator, checklist de entrega)
 * ou pelo corpo ("corpo do artigo" junto de "meta description"/"SEO title",
 * ou a ordem de escrever o artigo). CUIDADO com o falso positivo: "Critérios
 * antes de redigir" NÃO é entrega (a regra de coerência e bloqueio serve ao
 * vídeo), e "Voz" e "Vocabulário e estilo" ficam.
 *
 * 2026-10-07 (passada de revisão) · o plural escapava: "instrucao" não é
 * substring de "instrucoes" sem acento, e "Instruções para o redator" ficava
 * na linha de voz.
 */
const TITULO_DE_ENTREGA = /entrega e revis|revisao final|instruc(?:ao|oes)[^:\n]*para o (teste|redator)|checklist d[aeo] entrega/;
const ORDEM_DE_ESCREVER = /escrev[ae]r?[^.!?\n]*\bo artigo\b/;

export function radarBrandVoiceSectionIsArticleDelivery(secao: RadarBrandVoiceSection): boolean {
  if (TITULO_DE_ENTREGA.test(semAcento(secao.heading))) return true;
  const corpo = semAcento(secao.body);
  if (corpo.includes("corpo do artigo") && (corpo.includes("meta description") || corpo.includes("seo title"))) return true;
  return ORDEM_DE_ESCREVER.test(corpo);
}

/**
 * As URLs do PRÓPRIO site da marca citadas na Skill (ex.: a página comercial).
 * URL de outro domínio (fonte, documentação) não é destino de link interno.
 */
export function radarBrandVoiceOwnUrls(voice: RadarBrandVoice, siteUrl: string | null): string[] {
  const urls = [...new Set(voice.markdown.match(/https?:\/\/[^\s)>\]"']+/g) || [])].map(url => url.replace(/[.,;:]+$/, ""));
  const host = (valor: string | null) => {
    try { return valor ? new URL(valor).hostname.replace(/^www\./, "") : null; } catch { return null; }
  };
  const doSite = host(siteUrl) || host(/site:\s*(https?:\/\/\S+)/i.exec(voice.markdown)?.[1] || null);
  if (!doSite) return [];
  return urls.filter(url => host(url) === doSite && new URL(url).pathname.replace(/\/+$/, "") !== "");
}

/** A frase que o entregável usa quando a voz não entra. */
export function radarBrandVoiceAbsence(state: RadarBrandVoiceState): string | null {
  if (state.kind === "available") return null;
  if (state.kind === "unreadable") return `Voz da marca: não foi possível ler a Skill nesta exportação (${state.reason}).`;
  return "Voz da marca: não há Skill de voz na Marca (Skills e prompts); voz, tom, autor e revisor ficam por conta de quem escreve.";
}

/** O rótulo de TELA: diz o estado da Skill na Marca. Telas operacionais (Radar, Marca); entregável usa `radarBrandVoiceDeliverableLabel`. */
export const radarBrandVoiceLabel = (voice: Pick<RadarBrandVoice, "name" | "version" | "status">) =>
  `Skill "${voice.name}" v${voice.version} (${radarBrandVoiceStatusLabel(voice.status)} na Marca)`;

/*
 * 2026-10-08 · D10 NO RÓTULO DA VOZ, EM TODO ENTREGÁVEL. `radarBrandVoiceLabel`
 * diz o estado de tela da Skill ("em rascunho", "aguardando aprovação"): certo
 * nas telas operacionais, espera aberta no entregável (CSV para escrever, CSV
 * de vídeo, Redator, MCP), que sai concluído. No entregável, a versão em uso é
 * dita pelo que ela é — a corrente da Marca, a mesma regra de
 * `resolveBrandSkill` —; a ativa continua dita "ativa". Era o `rotuloDaVoz`
 * do CSV de vídeo (2026-10-07); agora é um só, para todos.
 */
export const radarBrandVoiceDeliverableLabel = (voice: Pick<RadarBrandVoice, "name" | "version" | "status">) =>
  (voice.status === "active" ? radarBrandVoiceLabel(voice) : `Skill "${voice.name}" v${voice.version} (versão corrente na Marca)`);

/**
 * 2026-10-08 · O estado dito em frase de entregável ("Versão 1 da Skill de voz,
 * corrente na Marca."): "ativa" para a ativa; qualquer outro estado — rascunho,
 * aguardando aprovação, desconhecido — é a versão "corrente", a que a Marca
 * entrega a todas as áreas. Nunca "em rascunho" nem "aguardando aprovação".
 */
export const radarBrandVoiceDeliverableStatusLabel = (status: string | undefined) => (status === "active" ? ESTADO.active : "corrente");

/**
 * A Skill da Marca, do jeito que o repositório devolve, vira a voz do Radar.
 * Sem reparsear o registro: `provenance.importedAt` vem do banco com "+00:00".
 */
export function radarBrandVoiceFromSkill(skill: {
  versionId?: string | null;
  version: number;
  name: string;
  contentHash: string;
  status: string;
  originalMarkdown: string;
  normalizedContent: { title: string | null; sections: ReadonlyArray<{ heading: string; body: string }> };
}): RadarBrandVoice | null {
  if (!skill.versionId) return null;
  return {
    versionId: skill.versionId,
    version: skill.version,
    name: skill.name,
    contentHash: skill.contentHash,
    status: skill.status,
    title: skill.normalizedContent.title || skill.name,
    sections: skill.normalizedContent.sections.map(secao => ({ heading: secao.heading, body: secao.body })),
    markdown: skill.originalMarkdown,
  };
}
