/**
 * ===== 2026-10-14 · F6 · O REDATOR LÊ O MATERIAL NOVO (leitura aditiva) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §18.1
 * (F6, "Redator lê o material novo"; autorização do dono em 2026-10-14: "pode
 * sim"). O painel do Redator e o MCP (get_writer_brief, get_writer_foundations,
 * get_writer_document) recebem, do MESMO núcleo do CSV "Para escrever"
 * (`radarWritingMaterialOf` sobre a linha de `buildRadarWritingExportArticle`):
 * a análise competitiva, o diferencial da marca, o fechamento em 4 tempos, a
 * malha e a trilha do Silo, as fontes de autoridade e as regras de título.
 *
 * LEITURA ADITIVA. Nada é gravado no documento: o material é lido ao vivo, como a
 * planta. O que já foi escrito não muda sozinho. Os links (L no corpo, T na
 * trilha) e as fontes (X) viram checklist "a aplicar" — "aplicado" quando o
 * endereço já está no texto do documento. Documento já escrito com links antigos
 * ganha o aviso "Links do Silo atualizados disponíveis" com os que faltam, sem
 * reescrever o texto.
 *
 * Domínio puro: sem banco, sem rede, sem IA.
 */
import {
  RADAR_WRITING_MATERIAL_VERSION,
  radarWritingMaterialUrlKey,
  type RadarWritingMaterial,
  type RadarWritingMaterialItem,
} from "../radar/portable-writing-material.ts";

/** O material de um documento, ou por que ele não existe agora (o mesmo vocabulário da semeadura). */
export type WriterMaterialRead =
  | { state: "ready"; articleId: string; material: RadarWritingMaterial }
  | {
    /* "unreadable": a leitura falhou agora (o MCP e o painel dizem e seguem; nada é gravado). */
    state: "needs_article_blueprint" | "other_investigation" | "refused" | "blueprint_unavailable" | "absent" | "unreadable";
    articleId: string | null;
    reason: string;
  };

/*
 * 2026-10-14 · F5 (SDD silo interligado §6.5; "Links a ativar"; autorização do dono:
 * "pode concluir as pendências") · "ativar": o documento já tem texto, o destino
 * do link está no ar HOJE e o endereço ainda não está no texto — quem escreveu
 * quando o destino era novo deixou a âncora como texto simples. O checklist diz
 * "destino no ar: ative o link" no lugar de "a aplicar". Nada é reescrito sozinho.
 */
export type WriterMaterialItemStatus = "aplicado" | "a_aplicar" | "ativar";
export type WriterMaterialCheckItem = RadarWritingMaterialItem & { status: WriterMaterialItemStatus };

export const WRITER_SILO_LINKS_UPDATE_LABEL = "Links do Silo atualizados disponíveis";

/** O rótulo de cada status no painel e na regra do MCP (uma fonte só). */
export const WRITER_MATERIAL_STATUS_LABEL: Readonly<Record<WriterMaterialItemStatus, string>> = Object.freeze({
  aplicado: "aplicado",
  a_aplicar: "a aplicar",
  ativar: "destino no ar: ative o link",
});

export const WRITER_MATERIAL_READING_RULE = "Material novo do Radar, pelo mesmo núcleo do CSV 'Para escrever' (get_article_for_writing): guia de escrita. O que já foi escrito não muda sozinho; os links (L no corpo, na seção dita; T na trilha 'Continue no Silo', no fim, depois do fechamento) e as fontes de autoridade (X, na frase que sustentam, âncora no nome da entidade) são checklist: status 'a_aplicar' até o endereço estar no texto. Destino ainda não publicado: a âncora entra como texto simples até ele ir ao ar (nunca link quebrado). Status 'ativar' (destino no ar: ative o link): o texto já foi escrito, o destino foi ao ar e o endereço ainda não está no texto — proponha ao usuário transformar a âncora que ficou como texto simples em link, sem reescrever o resto.";

export const WRITER_SILO_LINKS_UPDATE_NOTE = "O documento já tem texto, e a malha do Silo de hoje traz links que ele ainda não aplica. O texto não é reescrito sozinho: aplique cada link onde ele diz (L no corpo, na seção; T na trilha 'Continue no Silo', no fim). Destino ainda não publicado entra como texto simples até ir ao ar; o marcado 'destino no ar: ative o link' (status ativar) já está no ar: a âncora que ficou como texto simples vira link.";

type Linha = Record<string, unknown>;
const registro = (valor: unknown): Linha | null => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Linha : null);

const URL_NO_TEXTO = /https?:\/\/[^\s"'<>\\)]+/g;

/**
 * O QUE O DOCUMENTO JÁ TEM: os endereços dos links (marcas de link do editor e
 * blocos) e se há texto escrito. Lê só o documento que quem chama já tem; nada
 * é gravado.
 */
export function writerDocumentLinkReading(documento: unknown): { urls: Set<string>; written: boolean } {
  const doc = registro(documento);
  const conteudo = { editorContent: doc?.editorContent ?? null, blocks: Array.isArray(doc?.blocks) ? doc.blocks : [] };
  const serializado = JSON.stringify(conteudo);
  const urls = new Set<string>();
  for (const achado of serializado.matchAll(URL_NO_TEXTO)) urls.add(radarWritingMaterialUrlKey(achado[0].replace(/[.,;:!?]+$/, "")));
  const comTexto = (bloco: unknown) => {
    const lido = registro(bloco);
    if (!lido) return false;
    if (typeof lido.text === "string" && lido.text.trim()) return true;
    return Array.isArray(lido.items) && lido.items.some(item => typeof item === "string" && item.trim());
  };
  const written = conteudo.blocks.some(comTexto) || /"text":"[^"\s][^"]*"/.test(JSON.stringify(conteudo.editorContent ?? null));
  return { urls, written };
}

/* 2026-10-14 · F5 · "ativar": só link (L, T), com texto escrito e destino no ar hoje; a fonte (X) segue "a aplicar". */
const comStatus = (item: RadarWritingMaterialItem, urls: ReadonlySet<string>, written = false): WriterMaterialCheckItem => ({
  ...item,
  status: item.url && urls.has(radarWritingMaterialUrlKey(item.url)) ? "aplicado" : written && item.kind !== "fonte" && item.published === true ? "ativar" : "a_aplicar",
});

export type WriterMaterialChecklist = {
  links: WriterMaterialCheckItem[];
  authority: WriterMaterialCheckItem[];
  /** toApply: tudo o que não está no texto (com os "ativar"); toActivate (2026-10-14 · F5): os links cujo destino foi ao ar. */
  counts: { toApply: number; applied: number; toActivate: number };
  /** Só com texto escrito e link da malha ainda não aplicado. */
  siloLinksUpdate: { label: typeof WRITER_SILO_LINKS_UPDATE_LABEL; note: string; items: Array<Pick<WriterMaterialCheckItem, "id" | "kind" | "label" | "url" | "section" | "published"> & { status?: "ativar" }> } | null;
};

/** O CHECKLIST "A APLICAR" contra o documento de agora (links e fontes) e o aviso dos links novos do Silo. */
export function writerMaterialChecklist(material: RadarWritingMaterial, documento: unknown): WriterMaterialChecklist {
  const { urls, written } = writerDocumentLinkReading(documento);
  const links = material.links.map(item => comStatus(item, urls, written));
  const authority = material.authority.map(item => comStatus(item, urls));
  const todos = [...links, ...authority];
  const faltam = links.filter(item => item.status !== "aplicado");
  return {
    links,
    authority,
    counts: {
      toApply: todos.filter(item => item.status !== "aplicado").length,
      applied: todos.filter(item => item.status === "aplicado").length,
      toActivate: links.filter(item => item.status === "ativar").length,
    },
    siloLinksUpdate: written && faltam.length
      ? {
        label: WRITER_SILO_LINKS_UPDATE_LABEL,
        note: WRITER_SILO_LINKS_UPDATE_NOTE,
        items: faltam.map(({ id, kind, label, url, section, published, status }) => ({ id, kind, label, url, section, ...(published !== undefined ? { published } : {}), ...(status === "ativar" ? { status } : {}) })),
      }
      : null,
  };
}

/* ============================== o material no MCP ============================== */

/** O teto do material numa resposta do MCP (o briefing tem 32 kB; os fundamentos, 24 kB). */
export const WRITER_MATERIAL_MCP_MAX_BYTES = 14_000;

/* As listas que cedem, nesta ordem, quando o material passa do teto (cada passo corta pela metade). Os links e as fontes cedem por último. */
const ORDEM_DE_CORTE = ["titleAndKeyword", "competitive", "authorityReferences", "brandEdge", "linkRules", "authorityRules", "ymylWithoutSource", "closing", "links", "authority"] as const;

/* TextEncoder (e não Buffer): o painel do navegador importa este módulo. */
const bytes = (valor: unknown) => new TextEncoder().encode(JSON.stringify(valor)).length;

/**
 * O MATERIAL COMO O MCP O ENTREGA: o estado; pronto, os blocos, o checklist com
 * o status contra o documento e o aviso dos links novos. Cabe no teto: o que
 * cede é dito em `trimmed`, com onde ler inteiro (o CSV "Para escrever" pelo
 * get_article_for_writing).
 */
export function writerMaterialForMcp(leitura: WriterMaterialRead, documento: unknown, teto: number = WRITER_MATERIAL_MCP_MAX_BYTES): Record<string, unknown> {
  if (leitura.state !== "ready") return { state: leitura.state, reason: leitura.reason };
  const { material } = leitura;
  const checklist = writerMaterialChecklist(material, documento);
  let atual: Record<string, unknown> = {
    state: "ready",
    version: RADAR_WRITING_MATERIAL_VERSION,
    source: "CSV 'Para escrever' do artigo (o mesmo núcleo de get_article_for_writing)",
    rule: WRITER_MATERIAL_READING_RULE,
    angle: material.angle,
    competitive: material.competitive,
    brandEdge: material.brandEdge,
    closing: material.closing,
    titleAndKeyword: material.titleAndKeyword,
    linkRules: material.linkRules,
    links: checklist.links,
    authorityRules: material.authorityRules,
    authority: checklist.authority,
    authorityReferences: material.authorityReferences,
    ymylWithoutSource: material.ymylWithoutSource,
    checklist: checklist.counts,
    siloLinksUpdate: checklist.siloLinksUpdate,
  };
  const trimmed: Array<{ field: string; kept: number; total: number; readAt: string }> = [];
  const medir = () => bytes({ ...atual, ...(trimmed.length ? { trimmed } : {}) });
  for (const campo of ORDEM_DE_CORTE) {
    while (medir() > teto) {
      const lista = atual[campo];
      if (!Array.isArray(lista) || !lista.length) break;
      const manter = Math.floor(lista.length / 2);
      const existente = trimmed.find(item => item.field === campo);
      if (existente) existente.kept = manter;
      else trimmed.push({ field: campo, kept: manter, total: lista.length, readAt: "get_article_for_writing (CSV 'Para escrever' deste artigo)" });
      atual = { ...atual, [campo]: lista.slice(0, manter) };
    }
    if (medir() <= teto) break;
  }
  return trimmed.length ? { ...atual, trimmed } : atual;
}

export const WRITER_MATERIAL_UNREADABLE_REASON = "A leitura do material novo do Radar falhou agora; o resto da resposta vale. Tente de novo.";

/** O ponteiro do get_writer_document (o documento continua numa leitura só, adendo D4). */
export const WRITER_MATERIAL_DOCUMENT_POINTER = "get_writer_brief (writerMaterial: o material novo do Radar pelo mesmo núcleo do CSV 'Para escrever' e o checklist 'a aplicar' dos links do Silo e das fontes de autoridade contra o texto de agora, com siloLinksUpdate quando o texto já escrito não aplica a malha de hoje)";

/** O motivo do estado sem planta (o mesmo texto no servidor e nos testes). */
export const WRITER_MATERIAL_NEEDS_BLUEPRINT_REASON = "Este artigo ainda não tem o artigo-modelo da SERP concluído: organize-o no Radar (Pesquisa → Artigo-modelo da SERP; até 2 chamadas de IA por artigo, ditas no botão).";

/**
 * NOS FUNDAMENTOS (≤ 24 kB): o material no que sobra do teto. Se nem cortado
 * couber, fica o ponteiro para get_writer_brief, dito, nunca em silêncio.
 */
export function writerMaterialForFoundations(leitura: WriterMaterialRead, documento: unknown, usados: number, teto: number): Record<string, unknown> {
  const sobra = teto - usados - 256;
  const completo = writerMaterialForMcp(leitura, documento, Math.max(0, Math.min(WRITER_MATERIAL_MCP_MAX_BYTES, sobra)));
  if (bytes(completo) <= sobra) return completo;
  return { state: leitura.state, readAt: "get_writer_brief", reason: "o material novo não coube nos fundamentos: leia-o inteiro em get_writer_brief (writerMaterial)" };
}

/**
 * NO DOCUMENTO (get_writer_document): só o checklist — os links (L, T) e as
 * fontes (X) com o status contra o texto de agora, e o aviso dos links novos do
 * Silo. Os blocos de guia (análise competitiva, diferencial, fechamento, título)
 * estão em get_writer_brief.
 */
export function writerMaterialChecklistForMcp(leitura: WriterMaterialRead, documento: unknown): Record<string, unknown> {
  if (leitura.state !== "ready") return { state: leitura.state, reason: leitura.reason };
  const checklist = writerMaterialChecklist(leitura.material, documento);
  const curto = (item: WriterMaterialCheckItem) => ({ id: item.id, kind: item.kind, status: item.status, label: item.label, url: item.url, section: item.section, ...(item.published !== undefined ? { published: item.published } : {}) });
  return {
    state: "ready",
    version: RADAR_WRITING_MATERIAL_VERSION,
    readAt: "get_writer_brief (writerMaterial: a instrução inteira de cada item e os blocos de guia)",
    links: checklist.links.map(curto),
    authority: checklist.authority.map(curto),
    checklist: checklist.counts,
    siloLinksUpdate: checklist.siloLinksUpdate,
  };
}
