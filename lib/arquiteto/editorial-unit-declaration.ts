/**
 * A LEITURA DO [VÍNCULO] — o que o Minerador declarou sobre a keyword.
 *
 * UMA AUTORIDADE SÓ: `resolveKeywordVinculo`, do próprio Minerador.
 *
 * A primeira versão deste módulo lia nomes paralelos (`siteRole`,
 * `editorialUnitPotential`, `potencialUnidade`) que o Minerador nunca grava.
 * Auditado em 2026-09-23 contra o código do Minerador, isso tinha dois
 * efeitos silenciosos:
 *
 *   1. o tipo de página declarado pelo humano mora em
 *      `analise_semantica.keyword_page_type` — e não era lido. Nenhum
 *      "potencial de Silo" marcado no Minerador chegava ao Arquiteto;
 *   2. `analise_semantica.site_origin` pode estar gravado como TEXTO JSON, e o
 *      leitor paralelo só aceitava objeto. A declaração de publicado se perdia.
 *
 * O Minerador já resolveu as duas coisas num lugar só, justamente porque três
 * telas dele derivavam o mesmo fato e passaram a discordar. Uma quarta
 * derivação aqui no Arquiteto seria a mesma receita de divergência — então
 * este módulo não deriva: ele pergunta ao Minerador e traduz a resposta.
 *
 * O que continua sendo decisão do Arquiteto é só a TRADUÇÃO: potencial e
 * declarado viram `EditorialUnitDeclaration`, que é o que a eleição da
 * primária e a proposta de Silos sabem comparar.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import { resolveKeywordVinculo, keywordVinculoSummary } from "../minerador/keyword-vinculo.ts";
import type { KeywordPageType } from "../minerador/keyword-page-type.ts";
import type { PrimaryKeywordPolicy as MineradorPost } from "../minerador/primary-keyword-policy.ts";
import { EditorialUnitDeclarationSchema, type EditorialUnitDeclaration } from "./contracts.ts";

type RecordLike = Record<string, unknown>;

const asRecord = (value: unknown): RecordLike | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as RecordLike;
  // `analise_semantica` já chegou como texto em linhas antigas: lido, não descartado.
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as RecordLike : null;
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * O DNA que vale para o Arquiteto: o PACOTE APROVADO, não a linha viva.
 *
 * Mesma regra de `architectureKeywordSignals`: uma edição no Minerador depois
 * da aprovação não vaza para cá sem aprovação nova. A linha viva só entra
 * quando a keyword ainda não tem pacote.
 */
function semanticOf(keyword: RecordLike): RecordLike | null {
  const workflow = asRecord(keyword.canonicalWorkflow);
  const payload = asRecord(workflow?.payload);
  const aprovado = asRecord(payload?.approvedDna);
  return asRecord(aprovado?.analiseSemantica) ?? asRecord(keyword.analise_semantica);
}

export type ArchitectKeywordVinculo = {
  /** Que página a keyword é, ou viria a ser. */
  pageType: KeywordPageType;
  /** Alguém declarou, ou o site mostrou. `false` = é só o padrão `article`. */
  pageTypeDetermined: boolean;
  /** Publicada E determinada: é declaração, não aposta. */
  pageTypeDeclared: boolean;
  pageTypeSource: "human" | "site" | "default";
  /**
   * O humano declarou o tipo como DECLARADO (travado), sem publicação
   * (pedido do dono, 2026-09-24). Aditivo e presente só quando verdadeiro: sem
   * a declaração, o objeto é o de antes. A formação respeita o tipo como
   * decisão humana; o enum dos 4 tipos continua o mesmo.
   */
  pageTypeHumanDeclared?: true;
  /** O posto: pode perder a vaga de primária? */
  post: MineradorPost;
  postLockedToSlug: boolean;
  publicationDeclared: boolean;
  url: string | null;
  canonicalUrl: string | null;
  /** A frase que o Minerador mostra — repetida aqui, nunca recalculada. */
  summary: string;
  /**
   * Assunto declarado (SDD 2026-09-24, F2.2): `Assunto · declarado` ou
   * `Assunto sem nota`, o mesmo rótulo do Minerador. Aditivo e presente só
   * com declaração: sem Assunto, o objeto é o de antes.
   */
  subjectLabel?: string;
  subjectNote?: string | null;
  subjectDestinationUrl?: string | null;
};

/**
 * Lê o Vínculo de uma keyword do lote, pela autoridade do Minerador.
 *
 * Recebe a linha como o Arquiteto a tem (`masterList`), com o pacote aprovado
 * dentro de `canonicalWorkflow`. Nada é preenchido por conveniência: os
 * padrões são os do Minerador, e `pageTypeDetermined` diz quando é só padrão.
 */
export function readArchitectKeywordVinculo(keyword: RecordLike): ArchitectKeywordVinculo {
  const vinculo = resolveKeywordVinculo({
    status: typeof keyword.status === "string" ? keyword.status : null,
    semantic: semanticOf(keyword),
  });
  return {
    pageType: vinculo.pageType.type,
    pageTypeDetermined: vinculo.pageType.determined,
    pageTypeDeclared: vinculo.pageType.declared,
    pageTypeSource: vinculo.pageType.source,
    ...(vinculo.pageType.humanDeclared && !vinculo.pageType.declared ? { pageTypeHumanDeclared: true as const } : {}),
    post: vinculo.post,
    postLockedToSlug: vinculo.postLockedToSlug,
    publicationDeclared: vinculo.publicationDeclared,
    url: vinculo.url,
    canonicalUrl: vinculo.canonicalUrl,
    summary: keywordVinculoSummary(vinculo),
    ...(vinculo.subject?.declared && vinculo.subjectLabel
      ? { subjectLabel: vinculo.subjectLabel, subjectNote: vinculo.subject.note, subjectDestinationUrl: vinculo.subject.destinationUrl }
      : {}),
  };
}

/**
 * A tradução para o que a eleição e a proposta comparam.
 *
 * O padrão NÃO vira declaração. O Minerador põe `article` em toda keyword que
 * ninguém marcou — tratar isso como "o humano disse que é artigo" faria o
 * acervo inteiro parecer declarado, e a lógica deixaria de propor Silo onde o
 * léxico ainda poderia sustentar um.
 */
export function editorialUnitDeclarationFromVinculo(vinculo: ArchitectKeywordVinculo): EditorialUnitDeclaration | undefined {
  if (!vinculo.pageTypeDetermined) return undefined;

  if (vinculo.pageTypeDeclared) {
    const parsed = EditorialUnitDeclarationSchema.safeParse({
      source: "published",
      unit: vinculo.pageType,
      url: vinculo.url,
      canonical: vinculo.canonicalUrl,
      observedAt: null,
    });
    return parsed.success ? parsed.data : undefined;
  }

  const parsed = EditorialUnitDeclarationSchema.safeParse({
    source: "potential",
    unit: vinculo.pageType,
    confidence: null,
    reasons: [vinculo.pageTypeHumanDeclared
      ? PAGE_TYPE_HUMAN_DECLARED_REASON
      : vinculo.pageTypeSource === "human"
        ? "Declarado pelo humano no Minerador."
        : "Sugerido pelo papel observado no site; a publicação ainda não foi declarada."],
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * O motivo que marca o tipo DECLARADO pelo humano (travado) numa keyword sem
 * publicação. Continua `source: "potential"` — não há página no ar, e o
 * contrato estrito não ganha valor novo —, mas a mesa diz que é decisão
 * humana, não aposta.
 */
export const PAGE_TYPE_HUMAN_DECLARED_REASON = "Declarado pelo humano no Minerador como tipo travado: o tipo é decisão humana; a primária segue provisória até a SERP confirmar." as const;

/** A declaração é o tipo travado pelo humano (não publicada)? */
export function isHumanDeclaredPageType(declaration: EditorialUnitDeclaration | undefined): boolean {
  return declaration?.source === "potential" && declaration.reasons.includes(PAGE_TYPE_HUMAN_DECLARED_REASON);
}

/** Atalho: a keyword do lote, direto para a declaração. */
export function readEditorialUnitDeclaration(keyword: RecordLike): EditorialUnitDeclaration | undefined {
  return editorialUnitDeclarationFromVinculo(readArchitectKeywordVinculo(keyword));
}

/** A keyword foi declarada Silo por uma página que já está no ar? */
export function declaresPublishedSilo(declaration: EditorialUnitDeclaration | undefined): boolean {
  return declaration?.source === "published" && declaration.unit === "silo";
}

/** A keyword tem POTENCIAL de Silo — previsão, não fato. */
export function suggestsSiloPotential(declaration: EditorialUnitDeclaration | undefined): boolean {
  return declaration?.source === "potential" && declaration.unit === "silo";
}

/**
 * A keyword lidera um Silo — declarado no ar ou marcado como potencial.
 *
 * É a pergunta que a lógica da aba Silos faz primeiro: quem é cabeça de Silo
 * e quem vai para os artigos. As duas naturezas respondem SIM aqui; o que
 * muda entre elas é se a primária já está eleita (publicado) ou ainda precisa
 * da confirmação da SERP (potencial).
 */
export function headsSilo(declaration: EditorialUnitDeclaration | undefined): boolean {
  return declaration?.unit === "silo";
}

/**
 * O humano declarou que a keyword NÃO é Silo — artigo, landing ou serviço.
 *
 * Essa keyword nunca vira semente de Silo, por mais que o léxico a aponte
 * como cabeça do grupo. Ausência de declaração NÃO entra aqui.
 */
export function declaredNotSilo(declaration: EditorialUnitDeclaration | undefined): boolean {
  return Boolean(declaration) && declaration!.unit !== "silo";
}

const PAPEL: Record<string, string> = {
  silo: "Silo",
  article: "Artigo",
  landing_page: "Landing page",
  service_page: "Página de serviço",
  category_page: "Página de categoria",
  other: "outra unidade",
};

/**
 * O que a declaração diz para a mesa, em uma frase.
 *
 * Fato e previsão têm palavras diferentes de propósito: quem lê precisa saber
 * se está diante de uma página no ar ou de uma aposta.
 */
export function describeEditorialUnitDeclaration(declaration: EditorialUnitDeclaration | undefined): string {
  if (!declaration) return "O Minerador ainda não declarou a natureza desta keyword.";
  const papel = PAPEL[declaration.unit] || "outra unidade";
  if (declaration.source === "published") {
    return `Publicada: o site declara que esta página é ${papel}${declaration.url ? ` (${declaration.url})` : ""}.`;
  }
  if (isHumanDeclaredPageType(declaration)) return `Nova: declarada ${papel} pelo humano (tipo travado).`;
  return declaration.unit === "silo"
    ? "Nova: tem potencial de Silo — a SERP confirma ou recusa na etapa seguinte."
    : `Nova: tem potencial de ${papel}.`;
}
