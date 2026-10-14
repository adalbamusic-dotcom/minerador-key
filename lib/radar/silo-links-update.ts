/**
 * ===== 2026-10-14 · F5 · LINKS A ATIVAR E "ATUALIZAR LINKS DO SILO" (só lista, nunca a página) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6.5,
 * §11, §14 (F5) e D10 ("Atualizar links do Silo" para publicados = lista, sem
 * editar página). Autorização do dono (2026-10-14): "pode concluir as pendências,
 * vou testar depois".
 *
 * O MESMO NÚCLEO, SEM MONTAGEM PARALELA. A malha de cada artigo é a que o CSV
 * "Para escrever" já escreve (L no corpo, T na trilha "Continue no Silo"), lida
 * pela linha dele (`radarWritingMaterialOf`): o destino, a URL canônica, a seção,
 * a âncora natural (o exemplo que a régua de âncoras já deu; sem exemplo, a ideia
 * do destino com as palavras da frase — a régua natural, sem IA) e se o destino
 * está no ar HOJE. Esta régua só cruza essa malha com:
 *   - a planta congelada (`linkCandidates[].status`): o destino que a planta
 *     gravou como "novo, ainda não publicado" e hoje está no ar é LINK A ATIVAR —
 *     quem escreveu nessa época deixou a âncora como texto simples;
 *   - a página publicada do artigo de origem, lida na mesma busca do CSV (só GET,
 *     `<a href>` internos): o que já está na página sai como "já na página"; o que
 *     falta vira a lista "Atualizar links do Silo".
 *
 * NUNCA EDITA A PÁGINA, a URL, o slug nem o canonical (invariante 28, AGENTS §11):
 * a lista diz o que fazer, e quem faz é a pessoa, no site dela.
 *
 * Domínio puro: sem banco, sem rede, sem IA.
 */

import { radarWritingExportBatchFilename } from "./portable-writing-export.ts";
import { radarWritingMaterialUrlKey, type RadarWritingMaterial, type RadarWritingMaterialItem } from "./portable-writing-material.ts";
import { radarSiloMeshKindOf, radarSiloMeshPriority, type RadarSiloMeshTargetKind } from "./silo-link-mesh.ts";

export const RADAR_SILO_LINKS_UPDATE_VERSION = "2026-10-14";

/** O nome do entregável (tela, CSV, MCP e catálogo). */
export const RADAR_SILO_LINKS_UPDATE_LABEL = "Atualizar links do Silo";
export const RADAR_SILO_LINKS_TO_ACTIVATE_LABEL = "Links a ativar";

/** A frase que acompanha a lista em todo lugar: a plataforma não mexe na página. */
export const RADAR_SILO_LINKS_NEVER_EDITS = "A lista não altera a página publicada, a URL, o slug nem o canonical: quem inclui o link é você, no seu site, na seção dita, com a âncora natural.";

/**
 * A SITUAÇÃO DE CADA LINK DA MALHA:
 *   - "ativar": o destino estava novo quando a planta foi organizada e hoje está no
 *     ar — a âncora ficou como texto simples; ative o link;
 *   - "falta_na_pagina": o artigo está no ar e a página não tem o link (destino no ar);
 *   - "conferir": o artigo está no ar, mas a página não foi lida agora (confira e inclua se faltar);
 *   - "escrever_com_link": o artigo ainda não foi publicado e o destino está no ar (o texto já sai com o link);
 *   - "aguardar_destino": o destino ainda não está no ar (texto simples até ele ir ao ar; nunca link quebrado);
 *   - "na_pagina": o link já está na página publicada.
 */
export type RadarSiloLinkSituation = "ativar" | "falta_na_pagina" | "conferir" | "escrever_com_link" | "aguardar_destino" | "na_pagina";

export const RADAR_SILO_LINK_SITUATION_LABEL: Readonly<Record<RadarSiloLinkSituation, string>> = Object.freeze({
  ativar: "a ativar: o destino foi ao ar depois da planta",
  falta_na_pagina: "falta na página",
  conferir: "conferir na página (não lida agora)",
  escrever_com_link: "escrever com o link (destino no ar)",
  aguardar_destino: "aguardar o destino ir ao ar",
  na_pagina: "já na página",
});

const O_QUE_FAZER: Readonly<Record<RadarSiloLinkSituation, string>> = Object.freeze({
  ativar: "Destino no ar: ative o link — a âncora que ficou como texto simples vira link para a URL",
  falta_na_pagina: "Inclua o link na página publicada, na frase que trata do destino",
  conferir: "A página não foi lida agora: confira se o link já existe; se faltar, inclua",
  escrever_com_link: "Escreva já com o link (o destino está no ar)",
  aguardar_destino: "Destino ainda não publicado: deixe a âncora como texto simples e ative quando ele for ao ar",
  na_pagina: "Nada a fazer: o link já está na página",
});

/** Uma linha do entregável: um link da malha (L ou T) de um artigo de origem. */
export type RadarSiloLinkUpdateItem = {
  /** "L1", "T2": o mesmo id do CSV "Para escrever". */
  id: string;
  kind: "corpo" | "trilha";
  situation: RadarSiloLinkSituation;
  /** A situação em palavras (a mesma da coluna `situacao` do CSV): a tela e o MCP leem daqui. */
  situationLabel: string;
  action: string;
  /** "obrigatório no corpo", "no corpo, na seção que trata do destino", "trilha 'Continue no Silo'". */
  obligation: string;
  required: boolean;
  /** O destino (`Pilar "leads qualificados"`), o papel e o tipo para a malha. */
  target: string;
  targetRole: string | null;
  targetKind: RadarSiloMeshTargetKind;
  url: string | null;
  targetPublished: boolean;
  /** A planta congelada gravou o destino como novo (planejado); null = o destino não estava na planta (malha lida depois). */
  plannedInBlueprint: boolean | null;
  /** A âncora natural: o exemplo da régua; sem exemplo, a instrução pela ideia do destino. */
  anchor: string;
  anchorIsExample: boolean;
  /** As keywords do destino que nunca são âncora. */
  forbidden: string[];
  /** Onde entra: a seção (L) ou a trilha (T), e a frase. */
  where: string;
  why: string | null;
};

export type RadarSiloLinksUpdate = {
  version: typeof RADAR_SILO_LINKS_UPDATE_VERSION;
  articleId: string;
  /** O artigo de origem: a principal (ou o título) e o papel no Silo. */
  article: string;
  role: string | null;
  position: number | null;
  published: boolean;
  pageUrl: string | null;
  /** A página publicada foi lida agora (os links internos dela); null quando o artigo não está no ar. */
  pageRead: boolean | null;
  items: RadarSiloLinkUpdateItem[];
  /** "Links a ativar": o destino novo da planta que foi ao ar. */
  toActivate: RadarSiloLinkUpdateItem[];
  /** "Atualizar links do Silo": o que falta da malha na página publicada (a ativar, faltando ou a conferir). */
  missingOnPage: RadarSiloLinkUpdateItem[];
  counts: Record<RadarSiloLinkSituation, number> & { total: number; required: number };
  /** A malha no ar deste artigo publicado: X links na página de Y que a malha pede (null quando não publicado ou não lido). */
  mesh: { placed: number; required: number } | null;
};

const t = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");
const chave = (valor: string | null | undefined) => t(valor).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ultimoTrecho = (url: string | null | undefined) => radarWritingMaterialUrlKey(url).split("/").filter(Boolean).pop() ?? "";

/** O destino da linha: `Pilar "leads qualificados"` → papel e nome. */
function destinoDe(rotulo: string | null): { role: string | null; name: string } {
  const lido = t(rotulo).match(/^(.+?) "(.*)"$/);
  if (!lido) return { role: null, name: t(rotulo) };
  return { role: lido[1], name: lido[2] };
}

/** O destino é da malha do Silo (Pilar, Suporte, SiloPage); a página da marca do CTA não é. */
const daMalha = (papel: string | null) => !/^p[aá]gina da marca/i.test(t(papel));

/** A âncora natural da linha: o exemplo da régua de âncoras; sem ele, a instrução pela ideia do destino (sem IA). */
export function radarSiloLinkAnchorOf(linha: string): { anchor: string; isExample: boolean; forbidden: string[]; idea: string | null } {
  const exemplo = linha.match(/por exemplo "([^"]+)"/)?.[1] ?? null;
  const ideia = linha.match(/ideia do destino(?: em \d a \d palavras)? \(((?:[^()]|\([^()]*\))+)\)/)?.[1] ?? null;
  const proibidas = [...(linha.match(/não use como âncora: (.+?) → /)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(item => item[1]);
  return {
    anchor: exemplo ?? (ideia ? `com as palavras da frase, a ideia do destino: ${ideia}` : "com as palavras da frase, a ideia do destino (2 a 4 palavras)"),
    isExample: Boolean(exemplo),
    forbidden: proibidas,
    idea: ideia,
  };
}

/** Um candidato da planta congelada (o que a planta gravou de cada destino quando foi organizada). */
export type RadarSiloLinksBlueprintCandidate = { label: string; role?: string | null; destination: string | null; url?: string | null; status: string };

/** O destino estava "novo" na planta congelada? true/false pelo candidato dele; null sem candidato (malha lida depois da planta). */
function planejadoNaPlanta(item: RadarWritingMaterialItem, candidatos: readonly RadarSiloLinksBlueprintCandidate[]): boolean | null {
  const { name } = destinoDe(item.label);
  const nome = chave(name);
  const url = radarWritingMaterialUrlKey(item.url);
  const fim = ultimoTrecho(item.url);
  const achado = candidatos.find(candidato => {
    const rotulo = chave(t(candidato.label).replace(/^silopage\s+"?|"$/gi, ""));
    if (nome && (rotulo === nome || chave(candidato.label) === chave(item.label))) return true;
    const enderecos = [candidato.url, candidato.destination].map(valor => t(valor)).filter(Boolean);
    return enderecos.some(endereco => (url && radarWritingMaterialUrlKey(endereco) === url) || (fim && ultimoTrecho(endereco) === fim));
  });
  if (!achado) return null;
  return achado.status !== "PUBLISHED";
}

/**
 * O ENTREGÁVEL DE UM ARTIGO: cada link da malha (L e T do CSV) com a situação,
 * o que fazer, a obrigação, a âncora natural e onde entra.
 */
export function radarSiloLinksUpdateOf(input: {
  articleId: string;
  article: string;
  role: string | null;
  position?: number | null;
  material: Pick<RadarWritingMaterial, "links">;
  /** O artigo de origem hoje: publicado e a URL; os links internos da página lida agora (null = não lida). */
  source: { published: boolean; url: string | null; pageLinks: readonly string[] | null };
  /** A planta congelada do artigo (os candidatos K, com a situação gravada). */
  blueprintCandidates?: readonly RadarSiloLinksBlueprintCandidate[] | null;
}): RadarSiloLinksUpdate {
  const naPagina = input.source.pageLinks ? new Set(input.source.pageLinks.map(radarWritingMaterialUrlKey).filter(Boolean)) : null;
  const items: RadarSiloLinkUpdateItem[] = [];
  for (const item of input.material.links) {
    const destino = destinoDe(item.label);
    if (!daMalha(destino.role)) continue;
    const targetKind = radarSiloMeshKindOf(destino.role);
    const prioridade = radarSiloMeshPriority({ articleRole: input.role, targetRole: destino.role });
    const required = prioridade === "HIGH";
    const noAr = item.published === true;
    const planejado = planejadoNaPlanta(item, input.blueprintCandidates || []);
    const ancora = radarSiloLinkAnchorOf(item.line);
    const situation: RadarSiloLinkSituation = (() => {
      if (!noAr) return "aguardar_destino";
      if (input.source.published) {
        if (naPagina && item.url && naPagina.has(radarWritingMaterialUrlKey(item.url))) return "na_pagina";
        if (planejado === true) return "ativar";
        return naPagina ? "falta_na_pagina" : "conferir";
      }
      return planejado === true ? "ativar" : "escrever_com_link";
    })();
    const obligation = item.kind === "corpo"
      ? (required ? "obrigatório no corpo" : "no corpo, na seção que trata do destino")
      : (required ? "obrigatório (na trilha: nenhuma seção tinha lugar no corpo)" : "trilha \"Continue no Silo\"");
    const where = item.kind === "corpo"
      ? `no corpo, seção "${item.section ?? "a que trata do destino"}", na frase que trata ${ancora.idea ? `de: ${ancora.idea}` : "do destino"}`
      : `trilha "Continue no Silo", no fim do artigo (depois do fechamento), item ${item.id}`;
    items.push({
      id: item.id,
      kind: item.kind === "trilha" ? "trilha" : "corpo",
      situation,
      situationLabel: RADAR_SILO_LINK_SITUATION_LABEL[situation],
      action: O_QUE_FAZER[situation],
      obligation,
      required,
      target: t(item.label),
      targetRole: destino.role,
      targetKind,
      url: item.url,
      targetPublished: noAr,
      plannedInBlueprint: planejado,
      anchor: ancora.anchor,
      anchorIsExample: ancora.isExample,
      forbidden: ancora.forbidden,
      where,
      why: item.line.match(/ · por quê: (.+)$/)?.[1] ?? null,
    });
  }
  const conta = (situacao: RadarSiloLinkSituation) => items.filter(item => item.situation === situacao).length;
  const counts = {
    ativar: conta("ativar"), falta_na_pagina: conta("falta_na_pagina"), conferir: conta("conferir"),
    escrever_com_link: conta("escrever_com_link"), aguardar_destino: conta("aguardar_destino"), na_pagina: conta("na_pagina"),
    total: items.length, required: items.filter(item => item.required).length,
  };
  return {
    version: RADAR_SILO_LINKS_UPDATE_VERSION,
    articleId: input.articleId,
    article: t(input.article),
    role: input.role,
    position: typeof input.position === "number" ? input.position : null,
    published: input.source.published,
    pageUrl: input.source.url,
    pageRead: input.source.published ? Boolean(naPagina) : null,
    items,
    toActivate: items.filter(item => item.situation === "ativar"),
    missingOnPage: input.source.published ? items.filter(item => item.situation === "ativar" || item.situation === "falta_na_pagina" || item.situation === "conferir") : [],
    counts,
    mesh: input.source.published && naPagina ? { placed: counts.na_pagina, required: items.length } : null,
  };
}

/* ============================== o arquivo por artigo ============================== */

export const RADAR_SILO_LINKS_COLUMNS = [
  "artigo_de_origem",
  "pagina_de_origem",
  "id",
  "tipo",
  "situacao",
  "o_que_fazer",
  "obrigacao",
  "destino",
  "url",
  "destino_no_ar",
  "ancora",
  "nao_use_como_ancora",
  "onde_entra",
  "por_que",
] as const;

/** O CSV curto do artigo (`<NN>-<papel>-<slug>-links.csv`): BOM UTF-8, cabeçalho, todas as células entre aspas. */
export function radarSiloLinksCsv(update: RadarSiloLinksUpdate): string {
  const celula = (valor: string) => `"${valor.replaceAll("\"", "\"\"")}"`;
  const origem = update.published ? (update.pageUrl ?? "publicado (URL não registrada)") : "ainda não publicado";
  const linhas = update.items.map(item => [
    update.article,
    origem,
    item.id,
    item.kind,
    item.situationLabel,
    item.action,
    item.obligation,
    item.target,
    item.url ?? "",
    item.targetPublished ? "sim" : "não",
    item.anchor,
    item.forbidden.join(" · "),
    item.where,
    item.why ?? "",
  ]);
  const todas = [RADAR_SILO_LINKS_COLUMNS.map(celula).join(","), ...linhas.map(linha => linha.map(celula).join(","))];
  return `﻿${todas.join("\r\n")}\r\n`;
}

/** O nome: o mesmo prefixo do CSV "Para escrever" do artigo, com "-links.csv". */
export function radarSiloLinksFilename(input: { slug: string | null; keyword: string | null; position?: number | null; role?: string | null; today: string }): string {
  return radarWritingExportBatchFilename({ articles: [input], today: input.today }).replace(/-para-escrever\.csv$/, "-links.csv");
}

/* ============================== o painel "malha X/Y" do Silo ============================== */

export type RadarSiloLinksSiloSummary = {
  siloLabel: string | null;
  articles: number;
  published: number;
  pagesRead: number;
  /** X de Y: os links da malha que já estão nas páginas publicadas lidas, dos que a malha pede a elas. */
  placed: number;
  required: number;
  toActivate: number;
  missingOnPage: number;
  waiting: number;
  unchecked: number;
  line: string;
};

export function radarSiloLinksSiloSummary(input: { siloLabel: string | null; updates: readonly RadarSiloLinksUpdate[] }): RadarSiloLinksSiloSummary {
  const publicados = input.updates.filter(item => item.published);
  const lidos = publicados.filter(item => item.pageRead);
  const placed = lidos.reduce((soma, item) => soma + (item.mesh?.placed ?? 0), 0);
  const required = lidos.reduce((soma, item) => soma + (item.mesh?.required ?? 0), 0);
  const soma = (campo: RadarSiloLinkSituation) => input.updates.reduce((total, item) => total + item.counts[campo], 0);
  const toActivate = soma("ativar");
  const missingOnPage = soma("falta_na_pagina");
  const waiting = soma("aguardar_destino");
  const unchecked = soma("conferir");
  const nome = input.siloLabel ? `"${input.siloLabel}"` : "deste artigo";
  const line = publicados.length
    ? `Malha do Silo ${nome}: ${placed}/${required} links da malha nas páginas publicadas lidas (${lidos.length} de ${publicados.length} página(s) lida(s), ${input.updates.length} artigo(s)) · ${toActivate} a ativar · ${missingOnPage} faltam nas páginas${unchecked ? ` · ${unchecked} a conferir (página não lida)` : ""} · ${waiting} aguardam o destino ir ao ar.`
    : `Malha do Silo ${nome}: nenhum artigo publicado ainda (${input.updates.length} artigo(s)); a malha entra na escrita · ${toActivate} a ativar · ${waiting} aguardam o destino ir ao ar.`;
  return { siloLabel: input.siloLabel, articles: input.updates.length, published: publicados.length, pagesRead: lidos.length, placed, required, toActivate, missingOnPage, waiting, unchecked, line };
}
