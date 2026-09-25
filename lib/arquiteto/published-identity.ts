/**
 * PUBLICADO É FATO DO SITE, NÃO STATUS LEGADO.
 *
 * O Arquiteto só tratava como publicada a keyword com `status = "publicado"`
 * — o status legado. A publicação declarada pelo caminho atual do Minerador
 * (URL conferida, confirmação humana, posto travado, tipo de página
 * declarado, tudo dentro do [Vínculo]) chegava com o status `aprovado` e
 * perdia, em silêncio, as quatro proteções que a identidade publicada exige
 * (AGENTS §11):
 *
 *   1. artigo próprio — a publicada não é reagrupada por afinidade;
 *   2. principal preservada — ela ancora o conteúdo que já está no ar;
 *   3. URL, slug, canonical e marca intocados;
 *   4. a trava do PATCH da cópia de trabalho.
 *
 * A pergunta "esta keyword está publicada?" passa a ter UMA resposta, e ela
 * vem do Minerador: o status legado OU a publicação declarada no Vínculo
 * (`resolveKeywordVinculo`, lido por `readArchitectKeywordVinculo`, a partir
 * do PACOTE APROVADO quando ele existe). Nenhum leitor paralelo de
 * `site_origin` é criado aqui.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import { isLegacyPublishedStatus } from "../minerador/editorial-status.ts";
import { readArchitectKeywordVinculo } from "./editorial-unit-declaration.ts";

type RecordLike = Record<string, unknown>;

/** De onde vem a publicação: o status legado ou a declaração do Vínculo. */
export type PublishedIdentitySource = "legacy_status" | "vinculo";

/**
 * Por que a keyword é publicada — ou `null` quando não é.
 *
 * Recebe a linha como o Arquiteto a tem: com `canonicalWorkflow.payload`
 * quando existe, para o Vínculo ser lido do pacote aprovado e não da linha
 * viva (a mesma regra de `readArchitectKeywordVinculo`).
 */
export function publishedIdentitySource(keyword: RecordLike): PublishedIdentitySource | null {
  return readPublishedIdentity(keyword)?.source ?? null;
}

export type PublishedIdentity = {
  source: PublishedIdentitySource;
  /** Endereço declarado no Vínculo; `null` no status legado sem evidência. */
  url: string | null;
  /** Canônico congelado na declaração; nunca recalculado aqui. */
  canonicalUrl: string | null;
};

/**
 * A identidade publicada inteira, numa leitura só do Vínculo.
 *
 * O status legado vem primeiro porque ele continua sendo a autoridade de
 * compatibilidade do registro antigo; o endereço, quando o Vínculo o tem,
 * viaja junto nos dois casos.
 */
export function readPublishedIdentity(keyword: RecordLike): PublishedIdentity | null {
  const vinculo = readArchitectKeywordVinculo(keyword);
  const source: PublishedIdentitySource | null = isLegacyPublishedStatus(keyword.status)
    ? "legacy_status"
    : vinculo.publicationDeclared ? "vinculo" : null;
  if (!source) return null;
  return { source, url: vinculo.url, canonicalUrl: vinculo.canonicalUrl };
}

/** A keyword tem identidade publicada a proteger? */
export function isArchitectKeywordPublished(keyword: RecordLike): boolean {
  return publishedIdentitySource(keyword) !== null;
}

/**
 * Campos da cópia de trabalho que SÃO a identidade publicada.
 *
 * Uma lista só, usada pela rota (que recusa) e pela mesa (que não envia):
 * duas listas seria a receita de uma aceitar o que a outra recusa.
 *
 * `territoryRef` NÃO está aqui de propósito: a membership territorial é
 * organização da mesa, não identidade da página. Pôr a publicada no Silo que
 * o próprio site declara (URL sob a URL do Silo) não muda URL, slug nem
 * canonical — e é justamente isso que "revalidar" precisa gravar.
 */
export const PUBLISHED_IDENTITY_ASSIGNMENT_KEYS = [
  "clusterId",
  "provisionalGroupId",
  "siloId",
  "silo_id",
  "siloName",
  "computedSlug",
  "slug_sugerido",
  "principalKeywordId",
  "role",
] as const;

const IDENTITY_KEYS: ReadonlySet<string> = new Set(PUBLISHED_IDENTITY_ASSIGNMENT_KEYS);

/** Quais campos de identidade publicada um assignment tenta escrever. */
export function publishedIdentityKeysIn(assignment: RecordLike): string[] {
  return Object.keys(assignment).filter(key => IDENTITY_KEYS.has(key));
}

/**
 * O assignment sem os campos de identidade publicada.
 *
 * Usado pela mesa ANTES de enviar: a publicada continua podendo gravar o que
 * não é identidade (decisão KGR, `workingArticleId`, hierarquia), e o
 * servidor continua recusando qualquer tentativa que escape daqui.
 */
export function withoutPublishedIdentityKeys<T extends RecordLike>(assignment: T): Partial<T> {
  return Object.fromEntries(Object.entries(assignment).filter(([key]) => !IDENTITY_KEYS.has(key))) as Partial<T>;
}
