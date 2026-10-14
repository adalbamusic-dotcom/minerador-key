/**
 * ===== 2026-10-14c · FONTES EXTERNAS DE AUTORIDADE NO TEXTO (FASE B) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.2.
 * Autorização do dono (2026-10-14): links externos de autoridade no corpo dos
 * artigos — Google, governo (Ministério da Saúde etc.) e "pode ser sim também do
 * https://pt.wikipedia.org/" —, porque aumentam autoridade e credibilidade e o nicho
 * dele é saúde (YMYL). "Pode implementar."
 *
 * A Fase A (`authority-sources*.ts`) coleta e confere as fontes e grava o registro
 * na versão da análise (`payload.authoritySources`, ids X). Este módulo é a régua
 * ÚNICA da aplicação, lida pelo pacote do artigo-modelo, pela conferência da planta,
 * pelo CSV "Para escrever" e — pelo mesmo núcleo do export — por
 * `get_article_for_writing`:
 *
 *   - só fonte VERIFICADA vira link, e só a de autoridade: governo, conselho,
 *     ciência, enciclopédia, documentação do Google ou a lista da Marca; a fonte
 *     "mercado" (citada por concorrente, fora da lista) continua só referência;
 *     rede social, marketplace e página comercial nunca; concorrente comercial da
 *     SERP nunca;
 *   - de 2 a 5 links externos no corpo quando houver fontes verificadas (menos
 *     quando houver menos; nunca inventar);
 *   - cada link na frase que ele sustenta, com âncora natural no nome da entidade
 *     ("segundo o Ministério da Saúde", "a Wikipédia define…");
 *   - YMYL: a afirmação de saúde sem fonte verificada não é afirmada (o texto
 *     delimita ou omite).
 *
 * Domínio puro: sem fetch, sem banco, sem relógio, sem IA.
 */
import {
  RADAR_AUTHORITY_KIND_LABEL,
  radarAuthorityHost,
  radarHostBelongsTo,
  type RadarAuthorityKind,
  type RadarAuthoritySourcesRecord,
} from "./authority-sources-contract.ts";
import { classifyRadarSourceAuthority } from "./source-authority.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";

/** A versão das regras de aplicação (a mesma data das regras do artigo-modelo que as trouxeram). */
export const RADAR_AUTHORITY_WRITING_RULES_VERSION = "2026-10-14c";

/** Quantos links externos de autoridade no corpo: de 2 a 5 quando houver fontes; menos quando houver menos. */
export const RADAR_AUTHORITY_BODY_LINKS = Object.freeze({ min: 2, max: 5 });

/** Quantos links externos, no máximo, numa seção (o teto da resposta da IA, `RADAR_ARTICLE_BLUEPRINT_LIMITS.externalLinks`). */
const POR_SECAO = 2;

/** Os tipos que viram link no corpo. "mercado" fica só como referência. */
const TIPOS_DE_LINK: readonly RadarAuthorityKind[] = ["governo", "conselho", "cientifica", "documentacao_google", "enciclopedia", "lista_da_marca"];

/** A fonte verificada, pronta para o texto: o id X da Fase A, a entidade, o trecho, a afirmação e a âncora. */
export type RadarAuthorityWritingSource = {
  id: string;
  url: string;
  domain: string;
  entity: string;
  kind: RadarAuthorityKind;
  title: string;
  excerpt: string;
  claim: string;
  claimId: string | null;
  ymyl: boolean;
  /** A âncora natural com o nome da entidade ("segundo o Ministério da Saúde"). */
  anchor: string;
};

export type RadarAuthorityWriting = {
  status: "CHECKED" | "UNAVAILABLE";
  unavailableReason: string | null;
  /** As que viram link no corpo (na ordem: saúde primeiro, depois o tipo, depois o id). */
  linkable: RadarAuthorityWritingSource[];
  /** Verificadas que não viram link, com o motivo (só referência). */
  references: Array<{ id: string; url: string; entity: string; reason: string }>;
  /** As afirmações de saúde (YMYL) que seguem sem fonte verificada: não são afirmadas. */
  ymylWithoutSource: string[];
  /** As afirmações que uma fonte linkável sustenta (deixam de ser "sem fonte"). */
  supportedClaims: string[];
};

const t = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");

/** A chave de comparação de textos (sem acento, sem pontuação, minúscula). */
export function radarAuthorityCompareKey(valor: string | null | undefined): string {
  return t(valor).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const numeroDoId = (id: string) => Number(id.replace(/\D/g, "")) || 0;

/** O nome da entidade sem o parêntese final ("Conselho Federal de Odontologia (CFO)" → "Conselho Federal de Odontologia"). */
const nomeCurto = (entidade: string) => t(entidade.replace(/\s*\([^)]*\)\s*$/, "")) || t(entidade);

/** O artigo definido do nome: sigla em maiúsculas é masculina ("o IBGE"); nome que termina em "a" ou "ção" é feminino ("a Anvisa", "a Organização…"). */
function artigoDe(nome: string): "o" | "a" {
  const primeira = nome.split(" ")[0] || "";
  if (primeira.length > 1 && primeira === primeira.toUpperCase()) return "o";
  const minuscula = primeira.toLowerCase();
  return /(a|ção|dade|gem)$/.test(minuscula) ? "a" : "o";
}

/**
 * A ÂNCORA NATURAL COM O NOME DA ENTIDADE. O link vai no nome da entidade, dentro
 * da frase que a fonte sustenta: "segundo o Ministério da Saúde", "a Wikipédia
 * define…", "um estudo indexado no PubMed", "segundo a documentação do Google".
 */
export function radarAuthorityAnchor(fonte: { entity: string; kind: RadarAuthorityKind; domain?: string | null }): string {
  const entidade = t(fonte.entity);
  const dominio = t(fonte.domain);
  if (!entidade || (dominio && radarAuthorityCompareKey(entidade) === radarAuthorityCompareKey(dominio))) return `segundo o site ${dominio || entidade}`;
  const nome = nomeCurto(entidade);
  if (fonte.kind === "enciclopedia") return `${artigoDe(nome)} ${nome} define`;
  if (fonte.kind === "cientifica") return `um estudo indexado ${artigoDe(nome) === "a" ? "na" : "no"} ${nome}`;
  if (fonte.kind === "documentacao_google" && /search central/i.test(entidade)) return "segundo a documentação do Google";
  return `segundo ${artigoDe(nome)} ${nome}`;
}

const ORDEM_DO_TIPO = new Map(TIPOS_DE_LINK.map((tipo, indice) => [tipo, indice]));

/**
 * O REGISTRO DA FASE A, LIDO PARA O TEXTO. Sem registro, `null` (a investigação é
 * anterior à conferência; nada muda). `competitorDomains` são os domínios dos
 * resultados orgânicos da SERP: a fonte da lista da Marca ou do mercado que é um
 * concorrente da SERP nunca vira link.
 */
export function radarAuthorityWritingOf(
  record: RadarAuthoritySourcesRecord | null | undefined,
  opcoes: { competitorDomains?: readonly string[] } = {},
): RadarAuthorityWriting | null {
  if (!record) return null;
  if (record.status !== "CHECKED") {
    return { status: "UNAVAILABLE", unavailableReason: t(record.unavailableReason) || "motivo não registrado", linkable: [], references: [], ymylWithoutSource: [], supportedClaims: [] };
  }
  const concorrentes = (opcoes.competitorDomains || []).map(item => t(item).toLowerCase().replace(/^www\./, "")).filter(Boolean);
  const linkable: RadarAuthorityWritingSource[] = [];
  const references: RadarAuthorityWriting["references"] = [];
  const vistas = new Set<string>();
  for (const fonte of record.verified) {
    const chave = t(fonte.url).replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    const host = radarAuthorityHost(fonte.url) || t(fonte.domain);
    const natureza = classifyRadarSourceAuthority({ domain: host, url: fonte.url });
    const motivo = !TIPOS_DE_LINK.includes(fonte.kind)
      ? "citada pelo mercado, fora da lista de autoridades da Marca: só referência, sem link"
      : ["SOCIAL", "MARKETPLACE", "COMMERCIAL"].includes(natureza.type)
        ? "endereço comercial ou de rede social: só referência, sem link"
        : (fonte.kind === "lista_da_marca" && concorrentes.some(dominio => radarHostBelongsTo(host, dominio)))
          ? "é um concorrente da SERP: só referência, sem link"
          : null;
    if (motivo) { references.push({ id: fonte.id, url: fonte.url, entity: fonte.entity, reason: motivo }); continue; }
    linkable.push({
      id: fonte.id, url: fonte.url, domain: host, entity: t(fonte.entity), kind: fonte.kind, title: t(fonte.title),
      excerpt: t(fonte.excerpt), claim: t(fonte.claim), claimId: fonte.claimId, ymyl: fonte.ymyl,
      anchor: radarAuthorityAnchor({ entity: fonte.entity, kind: fonte.kind, domain: host }),
    });
  }
  linkable.sort((a, b) => Number(b.ymyl) - Number(a.ymyl) || (ORDEM_DO_TIPO.get(a.kind) ?? 9) - (ORDEM_DO_TIPO.get(b.kind) ?? 9) || numeroDoId(a.id) - numeroDoId(b.id));
  const idsLinkaveis = new Set(linkable.map(item => item.id));
  const ymylWithoutSource = record.ymylClaims.filter(item => !item.sourceIds.some(id => idsLinkaveis.has(id))).map(item => t(item.claim)).filter(Boolean);
  const supportedClaims = [...new Set([
    ...linkable.map(item => item.claim),
    ...record.ymylClaims.filter(item => item.sourceIds.some(id => idsLinkaveis.has(id))).map(item => t(item.claim)),
  ].filter(Boolean))];
  return { status: "CHECKED", unavailableReason: null, linkable, references, ymylWithoutSource, supportedClaims };
}

/** Quantos links externos de autoridade o corpo pede: de 2 (ou menos, quando houver menos fontes) a 5. */
export function radarAuthorityBodyLinkRange(disponiveis: number): { min: number; max: number } {
  const total = Math.max(0, Math.floor(disponiveis));
  return { min: Math.min(RADAR_AUTHORITY_BODY_LINKS.min, total), max: Math.min(RADAR_AUTHORITY_BODY_LINKS.max, total) };
}

/** A linha curta de uma fonte (pedido, CSV): id, entidade e tipo, endereço, afirmação, âncora, saúde. */
export function radarAuthoritySourceLine(
  fonte: Pick<RadarAuthorityWritingSource, "id" | "entity" | "kind" | "url" | "claim" | "anchor" | "ymyl"> & { excerpt?: string | null },
  opcoes: { excerpt?: boolean; where?: string | null } = {},
): string {
  return [
    `${fonte.id} · ${fonte.entity} (${RADAR_AUTHORITY_KIND_LABEL[fonte.kind]})`,
    fonte.url,
    `sustenta "${fonte.claim.replace(/[.\s]+$/, "")}"`,
    ...(opcoes.excerpt && fonte.excerpt ? [`trecho: "${fonte.excerpt.replace(/[.\s]+$/, "")}"`] : []),
    `âncora no nome da entidade: "${fonte.anchor}"`,
    ...(opcoes.where ? [opcoes.where] : []),
    ...(fonte.ymyl ? ["afirmação de saúde (YMYL)"] : []),
  ].join(" · ");
}

/* ======================= a seção que trata da afirmação ======================= */

type SecaoLida = {
  h2: string;
  readerQuestion: string;
  answerFirst: string;
  h3: readonly string[];
  explain: readonly string[];
  practical?: string | null;
};

const raizesDe = (texto: string, comuns: ReadonlySet<string>) => radarSemanticStems(texto).filter(raiz => raiz.length >= 3 && !comuns.has(raiz));
const mesmaRaiz = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

/** A afirmação, para casar com a seção ("Definição e contexto de "bruxismo"" casa pela entidade). */
const textoDaAfirmacao = (claim: string) => t(claim).replace(/^defini[cç][aã]o e contexto de\s+/i, "").replace(/["“”]/g, "");

/**
 * A SEÇÃO QUE TRATA DA AFIRMAÇÃO — sem IA, pelas raízes em comum entre a afirmação
 * e o título, a pergunta, a resposta, os H3 e o "Explicar" da seção (as raízes
 * comuns ao artigo inteiro não contam). Casa com 2 raízes em comum (ou todas,
 * quando a afirmação tem menos): uma raiz solta ("public" de "publicação" e de
 * "publicidade") não diz que a seção trata da afirmação. Sem casamento, `null`.
 */
export function radarAuthoritySectionFor(claim: string, secoes: readonly SecaoLida[], comuns: ReadonlySet<string> = new Set()): number | null {
  const daAfirmacao = raizesDe(textoDaAfirmacao(claim), comuns);
  if (!daAfirmacao.length) return null;
  const minimo = Math.min(2, daAfirmacao.length);
  let melhor: { indice: number; pontos: number } | null = null;
  secoes.forEach((secao, indice) => {
    const daSecao = raizesDe([secao.h2, secao.readerQuestion, secao.answerFirst, ...secao.h3, ...secao.explain, secao.practical || ""].join(" "), comuns);
    const pontos = daAfirmacao.filter(raiz => daSecao.some(outra => mesmaRaiz(raiz, outra))).length;
    if (pontos >= minimo && (!melhor || pontos > melhor.pontos)) melhor = { indice, pontos };
  });
  return (melhor as { indice: number; pontos: number } | null)?.indice ?? null;
}

/* ======================= a conferência da planta nova ======================= */

type LinkExterno = { claim: string; sourceType: string; source: string | null };
type SecaoComLinks = SecaoLida & { externalLinks: LinkExterno[] };

/** A fonte do pacote na forma que a conferência lê (as da Fase A trazem a entidade). */
export type RadarAuthorityPlanSource = { id: string; claim: string; entity?: string; kind?: RadarAuthorityKind; ymyl?: boolean };

export type RadarAuthorityPlanCheck<S> = {
  sections: S[];
  /** Pendências (sem fechar) ou o que o servidor fez (fechando), em português. */
  notes: string[];
  /** Os links de autoridade que o servidor pôs (fechando). */
  added: Array<{ id: string; section: string }>;
  /** Os links de autoridade além de 5 que saíram (fechando). */
  removed: Array<{ id: string; section: string }>;
  /** Quantos links externos de autoridade ficaram no corpo. */
  count: number;
};

/**
 * OS LINKS EXTERNOS DE AUTORIDADE NA PLANTA NOVA (regra 7, 2026-10-14c).
 *
 * Só contam as fontes X da Fase A (as que trazem a entidade). Com N fontes no
 * pacote, o corpo leva de min(2, N) a 5 links. Sem fechar, o que falta ou sobra
 * vira pendência para a passada de correção da IA; fechando (D10, entregável
 * concluído), o servidor põe a fonte que falta na seção que trata da afirmação
 * dela (a de saúde primeiro), respeitando o teto de 2 por seção, e tira o que
 * passa de 5 (a de saúde fica). Sem fonte X no pacote, nada muda.
 */
export function radarAuthorityLinksInPlan<S extends SecaoComLinks>(
  secoes: readonly S[],
  fontes: readonly RadarAuthorityPlanSource[],
  opcoes: { close?: boolean; commonStems?: ReadonlySet<string> } = {},
): RadarAuthorityPlanCheck<S> {
  const autoridades = fontes.filter(fonte => t(fonte.entity));
  const lista = [...secoes];
  if (!autoridades.length) return { sections: lista, notes: [], added: [], removed: [], count: 0 };
  const porId = new Map(autoridades.map(fonte => [fonte.id, fonte]));
  const faixa = radarAuthorityBodyLinkRange(autoridades.length);
  const notes: string[] = [];
  const added: RadarAuthorityPlanCheck<S>["added"] = [];
  const removed: RadarAuthorityPlanCheck<S>["removed"] = [];
  const comuns = opcoes.commonStems || new Set<string>();
  const ehDeAutoridade = (link: LinkExterno) => Boolean(link.source && porId.has(link.source));
  const contar = () => lista.reduce((soma, secao) => soma + secao.externalLinks.filter(ehDeAutoridade).length, 0);

  /* Sobra: além de 5, a de saúde fica; sai a última das outras. */
  let total = contar();
  if (total > faixa.max) {
    if (!opcoes.close) {
      notes.push(`Links externos de autoridade: ${total} no corpo; o teto é ${RADAR_AUTHORITY_BODY_LINKS.max} (regra 7): deixe os ${RADAR_AUTHORITY_BODY_LINKS.max} que sustentam as afirmações mais importantes, a de saúde primeiro, antes de aprovar.`);
    } else {
      const ordem = lista.flatMap((secao, indice) => secao.externalLinks.map((link, posicao) => ({ indice, posicao, link })))
        .filter(item => ehDeAutoridade(item.link))
        .sort((a, b) => Number(Boolean(porId.get(a.link.source!)?.ymyl)) - Number(Boolean(porId.get(b.link.source!)?.ymyl)) || b.indice - a.indice || b.posicao - a.posicao);
      const sair = new Set(ordem.slice(0, total - faixa.max).map(item => `${item.indice}:${item.posicao}`));
      lista.forEach((secao, indice) => {
        const ficam = secao.externalLinks.filter((link, posicao) => {
          if (!sair.has(`${indice}:${posicao}`)) return true;
          removed.push({ id: link.source!, section: secao.h2 });
          return false;
        });
        if (ficam.length !== secao.externalLinks.length) lista[indice] = { ...secao, externalLinks: ficam };
      });
      for (const item of removed) notes.push(`Links externos de autoridade: ${item.id} saiu da seção "${item.section}" — o corpo leva no máximo ${RADAR_AUTHORITY_BODY_LINKS.max} (regra 7).`);
      total = contar();
    }
  }

  /* Falta: menos que min(2, N). A fonte que ainda não está no corpo, a de saúde primeiro. */
  if (total < faixa.min) {
    const usadas = new Set(lista.flatMap(secao => secao.externalLinks.filter(ehDeAutoridade).map(link => link.source!)));
    const faltantes = autoridades.filter(fonte => !usadas.has(fonte.id)).sort((a, b) => Number(Boolean(b.ymyl)) - Number(Boolean(a.ymyl)));
    if (!opcoes.close) {
      const sugestoes = faltantes.slice(0, faixa.min - total).map(fonte => {
        const indice = radarAuthoritySectionFor(fonte.claim, lista, comuns);
        return `${fonte.id} (${fonte.entity}${indice !== null ? `, na seção "${lista[indice].h2}"` : ""})`;
      });
      notes.push(`Links externos de autoridade: ${total} no corpo; com ${autoridades.length} fonte(s) X verificada(s) no pacote, ponha de ${faixa.min} a ${faixa.max}, cada um na frase que ele sustenta, com âncora no nome da entidade (regra 7): ${sugestoes.join("; ")}, antes de aprovar.`);
    } else {
      for (const fonte of faltantes) {
        if (total >= faixa.min) break;
        const preferida = radarAuthoritySectionFor(fonte.claim, lista, comuns);
        const cabe = (indice: number) => lista[indice].externalLinks.length < POR_SECAO;
        const indice = preferida !== null && cabe(preferida) ? preferida : lista.findIndex((_, posicao) => cabe(posicao));
        if (indice < 0) break;
        const secao = lista[indice];
        lista[indice] = { ...secao, externalLinks: [...secao.externalLinks, { claim: fonte.claim, sourceType: fonte.kind ? RADAR_AUTHORITY_KIND_LABEL[fonte.kind] : "fonte verificada", source: fonte.id }] };
        added.push({ id: fonte.id, section: secao.h2 });
        notes.push(`Links externos de autoridade: ${fonte.id} (${fonte.entity}) entrou na seção "${secao.h2}", na frase que sustenta "${textoDaAfirmacao(fonte.claim)}" (sem IA; regra 7).`);
        total += 1;
      }
    }
  }
  return { sections: lista, notes, added, removed, count: total };
}
