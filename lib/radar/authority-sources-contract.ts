/**
 * ===== 2026-10-14 · FONTES EXTERNAS DE AUTORIDADE — O CONTRATO (FASE A) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.2.
 * Pedido do dono (2026-10-14): pôr no corpo dos artigos links externos de
 * autoridade (Google, órgãos de governo como o Ministério da Saúde e "pode ser sim
 * também do https://pt.wikipedia.org/"), reforçando conceitos, dados e informações —
 * "pode implementar". O nicho é saúde (YMYL): referência marcada dá autoridade e
 * credibilidade e ajuda as IAs a usar os dados.
 *
 * A FASE A só COLETA e CONFERE. Nada aqui entra no artigo-modelo, no CSV de escrita
 * nem no MCP de escrita: isso é a Fase B.
 *
 * Este arquivo é só contrato e régua pura (zod e texto): a lista padrão de
 * autoridades, a leitura da lista que o dono edita na Marca, o casamento de um
 * endereço com a lista e o registro que a investigação grava. Sem fetch, sem banco,
 * sem relógio — e sem importar módulo que importe `analysis-contracts.ts`, porque
 * é ele que importa este (evita ciclo).
 */
import { z } from "zod";

/** A versão da régua. Mudou a lista padrão, o casamento ou o registro, muda a data. */
export const RADAR_AUTHORITY_SOURCES_VERSION = "2026-10-14";

/* ============================ os tipos de fonte ============================ */

export const RadarAuthorityKindSchema = z.enum([
  "governo",
  "conselho",
  "cientifica",
  "enciclopedia",
  "documentacao_google",
  "lista_da_marca",
  "mercado",
]);
export type RadarAuthorityKind = z.infer<typeof RadarAuthorityKindSchema>;

/** Os tipos, ditos como a tela, o arquivo de SERP crua e o catálogo dizem. */
export const RADAR_AUTHORITY_KIND_LABEL: Record<RadarAuthorityKind, string> = {
  governo: "governo ou órgão público",
  conselho: "conselho profissional",
  cientifica: "científica",
  enciclopedia: "enciclopédia",
  documentacao_google: "documentação Google",
  lista_da_marca: "autoridade escolhida pela marca",
  mercado: "mercado (citada por concorrente, fora da lista)",
};

/** De onde a candidata veio. Nenhuma origem é "a IA sugeriu". */
export const RadarAuthorityOriginSchema = z.enum([
  "concorrente",
  "serp_organico",
  "resumo_ia",
  "pessoas_perguntam",
  "painel_entidade",
  "entidade_wikipedia",
]);
export type RadarAuthorityOrigin = z.infer<typeof RadarAuthorityOriginSchema>;

export const RADAR_AUTHORITY_ORIGIN_LABEL: Record<RadarAuthorityOrigin, string> = {
  concorrente: "citada por página concorrente lida",
  serp_organico: "resultado orgânico da SERP já coletada",
  resumo_ia: "citada pelo resumo de IA da SERP já coletada",
  pessoas_perguntam: "fonte de \"Pessoas também perguntam\" da SERP já coletada",
  painel_entidade: "fonte do painel de entidade da SERP já coletada",
  entidade_wikipedia: "verbete da Wikipédia pela entidade central do artigo (aberto e conferido)",
};

/* ========================== a lista de autoridades ========================= */

export type RadarAuthorityDomain = {
  /** O host registrado, sem protocolo nem "www." (casa também os subdomínios). */
  domain: string;
  /** Um caminho que restringe a entrada (ex.: "/saude" em gov.br). */
  pathPrefix: string | null;
  /** O nome legível da entidade ("Ministério da Saúde", "Wikipédia"). */
  entity: string;
  kind: RadarAuthorityKind;
};

const entrada = (domain: string, entity: string, kind: RadarAuthorityKind, pathPrefix: string | null = null): RadarAuthorityDomain => ({ domain, pathPrefix, entity, kind });

/**
 * A LISTA PADRÃO SUGERIDA — vale quando a Marca não tem lista própria aprovada.
 *
 * O dono edita na Marca → Identidade da marca → "Fontes de autoridade". O padrão é
 * o que ele pediu (governo, Ministério da Saúde, Wikipédia, Google) mais o que o
 * nicho de saúde pede (Anvisa, IBGE, conselhos, OMS, SciELO, PubMed).
 */
export const RADAR_DEFAULT_AUTHORITY_DOMAINS: readonly RadarAuthorityDomain[] = Object.freeze([
  entrada("gov.br", "Governo Federal (gov.br)", "governo"),
  entrada("gov.br", "Ministério da Saúde", "governo", "/saude"),
  entrada("saude.gov.br", "Ministério da Saúde", "governo"),
  entrada("bvsms.saude.gov.br", "Biblioteca Virtual em Saúde do Ministério da Saúde", "governo"),
  entrada("gov.br", "Anvisa", "governo", "/anvisa"),
  entrada("anvisa.gov.br", "Anvisa", "governo"),
  entrada("ibge.gov.br", "IBGE", "governo"),
  entrada("gov.br", "INCA", "governo", "/inca"),
  entrada("inca.gov.br", "INCA", "governo"),
  entrada("cfo.org.br", "Conselho Federal de Odontologia (CFO)", "conselho"),
  entrada("cfm.org.br", "Conselho Federal de Medicina (CFM)", "conselho"),
  entrada("cff.org.br", "Conselho Federal de Farmácia (CFF)", "conselho"),
  entrada("cfn.org.br", "Conselho Federal de Nutrição (CFN)", "conselho"),
  entrada("cfp.org.br", "Conselho Federal de Psicologia (CFP)", "conselho"),
  entrada("cofen.gov.br", "Conselho Federal de Enfermagem (Cofen)", "conselho"),
  entrada("coffito.gov.br", "Conselho Federal de Fisioterapia e Terapia Ocupacional (Coffito)", "conselho"),
  entrada("who.int", "Organização Mundial da Saúde (OMS)", "governo"),
  entrada("paho.org", "Organização Pan-Americana da Saúde (OPAS)", "governo"),
  entrada("scielo.br", "SciELO", "cientifica"),
  entrada("scielo.org", "SciELO", "cientifica"),
  entrada("pubmed.ncbi.nlm.nih.gov", "PubMed", "cientifica"),
  entrada("ncbi.nlm.nih.gov", "NCBI (Biblioteca Nacional de Medicina dos EUA)", "cientifica"),
  entrada("bvsalud.org", "Biblioteca Virtual em Saúde (BVS)", "cientifica"),
  entrada("pt.wikipedia.org", "Wikipédia", "enciclopedia"),
  entrada("developers.google.com", "Google Search Central (documentação oficial)", "documentacao_google", "/search"),
  entrada("support.google.com", "Ajuda do Google", "documentacao_google"),
]);

/** As linhas da lista padrão, como a Marca as mostra no campo editável. */
export function radarDefaultAuthorityLines(): string[] {
  return RADAR_DEFAULT_AUTHORITY_DOMAINS.map(item => `${item.domain}${item.pathPrefix || ""} | ${item.entity}`);
}

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** O tipo de um domínio que o dono acrescentou e o padrão não conhece. Pelo endereço, sem palpite de conteúdo. */
function tipoPeloDominio(domain: string): RadarAuthorityKind {
  if (/(^|\.)wikipedia\.org$/.test(domain)) return "enciclopedia";
  if (/(^|\.)google\.com$/.test(domain)) return "documentacao_google";
  /* Conselho federal ou regional (cfo, cro-sp, cremesp, cofen…): pela sigla no domínio .org.br/.gov.br. */
  if (/(^|\.)(cf|cr|cof)[a-z0-9-]{1,10}\.(org|gov)\.br$/.test(domain)) return "conselho";
  if (/(scielo|pubmed|ncbi\.nlm\.nih\.gov|doi\.org|bvsalud|cochrane)/.test(domain)) return "cientifica";
  if (/(^|\.)gov(\.[a-z]{2})?$|(^|\.)who\.int$|(^|\.)paho\.org$/.test(domain)) return "governo";
  return "lista_da_marca";
}

/**
 * A LISTA QUE O DONO EDITA, LIDA.
 *
 * Uma entrada por linha: `domínio` ou `domínio/caminho`, opcionalmente seguido de
 * `| Nome da entidade`. Protocolo e "www." saem. Linha que não é domínio volta em
 * `invalid` (a tela diz qual), nunca vira entrada.
 */
export function radarParseAuthorityLines(lines: readonly string[]): { entries: RadarAuthorityDomain[]; invalid: string[] } {
  const entries: RadarAuthorityDomain[] = [];
  const invalid: string[] = [];
  const vistos = new Set<string>();
  for (const bruta of lines) {
    const linha = String(bruta || "").trim();
    if (!linha) continue;
    const [enderecoBruto, ...nome] = linha.split("|");
    const endereco = enderecoBruto.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    const barra = endereco.indexOf("/");
    const domain = barra >= 0 ? endereco.slice(0, barra) : endereco;
    const pathPrefix = barra >= 0 ? endereco.slice(barra) : null;
    if (!HOST.test(domain)) { invalid.push(linha); continue; }
    const chave = `${domain}${pathPrefix || ""}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const doPadrao = RADAR_DEFAULT_AUTHORITY_DOMAINS.find(item => item.domain === domain && (item.pathPrefix || null) === pathPrefix) || null;
    const entidade = nome.join("|").trim();
    entries.push({
      domain,
      pathPrefix,
      entity: entidade || doPadrao?.entity || domain,
      kind: doPadrao?.kind || tipoPeloDominio(domain),
    });
  }
  return { entries, invalid };
}

/** A lista que vale: a da Marca (aprovada e não vazia) ou a padrão sugerida. */
export function radarEffectiveAuthorityList(brandLines: readonly string[] | null | undefined): { origin: "marca" | "padrao"; entries: RadarAuthorityDomain[]; invalid: string[] } {
  const lida = radarParseAuthorityLines(brandLines || []);
  if (lida.entries.length) return { origin: "marca", entries: lida.entries, invalid: lida.invalid };
  return { origin: "padrao", entries: [...RADAR_DEFAULT_AUTHORITY_DOMAINS], invalid: lida.invalid };
}

/** O host sem "www.", minúsculo; vazio quando o endereço não é legível. */
export function radarAuthorityHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** O host pertence ao domínio (ele mesmo ou subdomínio)? */
export function radarHostBelongsTo(host: string, domain: string): boolean {
  const limpo = host.toLowerCase().replace(/^www\./, "");
  const alvo = domain.toLowerCase().replace(/^www\./, "");
  return Boolean(limpo && alvo) && (limpo === alvo || limpo.endsWith(`.${alvo}`));
}

/**
 * A ENTRADA DA LISTA QUE ESTE ENDEREÇO CASA — a mais específica.
 *
 * `www.gov.br/saude/...` casa "gov.br" e "gov.br/saude": vence a de caminho
 * (Ministério da Saúde). `website.cfo.org.br` casa "cfo.org.br". Sem casamento, `null`.
 */
export function radarAuthorityEntryFor(url: string, list: readonly RadarAuthorityDomain[]): RadarAuthorityDomain | null {
  const host = radarAuthorityHost(url);
  if (!host) return null;
  let caminho = "/";
  try { caminho = new URL(url).pathname.toLowerCase() || "/"; } catch { caminho = "/"; }
  let melhor: RadarAuthorityDomain | null = null;
  let peso = -1;
  for (const item of list) {
    if (!radarHostBelongsTo(host, item.domain)) continue;
    const prefixo = (item.pathPrefix || "").toLowerCase();
    if (prefixo && !(caminho === prefixo || caminho.startsWith(`${prefixo}/`))) continue;
    const valor = item.domain.length * 1000 + prefixo.length;
    if (valor > peso) { melhor = item; peso = valor; }
  }
  return melhor;
}

/* ============================ o registro gravado ============================ */

/** Os tetos da conferência — por artigo, sem varredura. */
export const RADAR_AUTHORITY_LIMITS = Object.freeze({
  /** Quantas fontes, no máximo, são abertas por artigo. */
  maxSources: 8,
  /** Quantas ao mesmo tempo (educado com os sites). */
  concurrency: 3,
  /** O tempo de uma página (cabeçalho e corpo). */
  pageTimeoutMs: 6000,
  /** O tempo do robots.txt. */
  robotsTimeoutMs: 3000,
  /** O trecho guardado (o arquivo de SERP crua corta em 300). */
  excerptChars: 300,
  titleChars: 200,
});
export type RadarAuthorityLimits = { [Chave in keyof typeof RADAR_AUTHORITY_LIMITS]: number };

export const RadarAuthorityVerifiedSourceSchema = z.object({
  /** "X1", "X2"… na ordem da conferência (o id que a Fase B cita). */
  id: z.string().regex(/^X\d+$/),
  url: z.string().min(1),
  domain: z.string().min(1),
  entity: z.string().min(1),
  kind: RadarAuthorityKindSchema,
  origin: RadarAuthorityOriginSchema,
  title: z.string(),
  /** O trecho da fonte que trata da afirmação. Curto: referência, não cópia. */
  excerpt: z.string().max(400),
  /** A data que a página declara (publicação ou atualização), quando declara. */
  publishedAt: z.string().nullable(),
  checkedAt: z.string().min(1),
  /** A afirmação do artigo que a fonte sustenta. */
  claim: z.string().min(1),
  claimId: z.string().nullable(),
  /** Afirmação de saúde/dinheiro/segurança que exige fonte (YMYL). */
  ymyl: z.boolean(),
  citedByCompetitors: z.number().int().nonnegative(),
  matchedTerms: z.array(z.string()).max(12),
}).strict();
export type RadarAuthorityVerifiedSource = z.infer<typeof RadarAuthorityVerifiedSourceSchema>;

export const RadarAuthorityFailureSchema = z.object({
  url: z.string().min(1),
  domain: z.string().min(1),
  entity: z.string().min(1),
  kind: RadarAuthorityKindSchema,
  origin: RadarAuthorityOriginSchema,
  code: z.string().min(1),
  /** O motivo, em português, como a tela mostra. */
  reason: z.string().min(1),
  status: z.number().int().nonnegative().nullable(),
}).strict();
export type RadarAuthorityFailure = z.infer<typeof RadarAuthorityFailureSchema>;

export const RadarAuthoritySourcesRecordSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["CHECKED", "UNAVAILABLE"]),
  unavailableReason: z.string().nullable(),
  checkedAt: z.string().min(1),
  list: z.object({
    origin: z.enum(["marca", "padrao"]),
    brandDnaVersionId: z.string().nullable(),
    domains: z.number().int().nonnegative(),
  }).strict(),
  /** Quantas candidatas existiam (antes do teto). */
  candidates: z.number().int().nonnegative(),
  /** Quantas foram abertas nesta rodada. */
  checked: z.number().int().nonnegative(),
  /** Quantas ficaram de fora pelo teto por artigo. */
  notChecked: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  verified: z.array(RadarAuthorityVerifiedSourceSchema),
  failures: z.array(RadarAuthorityFailureSchema),
  /** As afirmações de saúde (YMYL) que exigem fonte, e quais X as sustentam. */
  ymylClaims: z.array(z.object({
    claimId: z.string().min(1),
    claim: z.string().min(1),
    relevance: z.string().min(1),
    sourceIds: z.array(z.string()),
  }).strict()),
  /** O que a rodada não pôde ler ou considerar (ex.: SERP sem snapshot, linha inválida na lista). */
  notes: z.array(z.string()).default([]),
  /** O custo, dito: nenhuma chamada paga, nenhuma IA; só abrir páginas públicas. */
  cost: z.object({
    providerCalls: z.literal(0),
    aiCalls: z.literal(0),
    pageFetches: z.number().int().nonnegative(),
    robotsFetches: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type RadarAuthoritySourcesRecord = z.infer<typeof RadarAuthoritySourcesRecordSchema>;

/** O registro de quando a conferência não pôde rodar (a análise continua valendo). */
export function radarAuthoritySourcesUnavailable(reason: string, checkedAt: string): RadarAuthoritySourcesRecord {
  return {
    version: RADAR_AUTHORITY_SOURCES_VERSION,
    status: "UNAVAILABLE",
    unavailableReason: reason.trim() || "A conferência das fontes externas não pôde rodar.",
    checkedAt,
    list: { origin: "padrao", brandDnaVersionId: null, domains: 0 },
    candidates: 0,
    checked: 0,
    notChecked: 0,
    limit: RADAR_AUTHORITY_LIMITS.maxSources,
    verified: [],
    failures: [],
    ymylClaims: [],
    notes: [],
    cost: { providerCalls: 0, aiCalls: 0, pageFetches: 0, robotsFetches: 0 },
  };
}
