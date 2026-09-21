/**
 * A LEITURA DO [VÍNCULO] — o que o Minerador declarou sobre a keyword.
 *
 * O campo [Vínculo] já existe do outro lado (`readPublicationLink`) e já
 * carrega `siteRole` — `"silo"`, `"article"` e afins — com `url` e
 * `canonicalUrl`. O que faltava era o Arquiteto LER: `siteRole` não aparecia
 * uma vez sequer em `lib/arquiteto/`.
 *
 * Duas naturezas, e elas não se misturam:
 *
 *   PUBLICADO  a página está no ar. `siteRole` é FATO observado, com endereço.
 *              A origem 2 elege a primária do Silo lendo isto — sem SERP,
 *              sem heurística, sem ambiguidade.
 *   NOVO       não há página. O que vem é POTENCIAL: previsão de que a keyword
 *              daria um Silo ou um Artigo. A origem 1 confere na SERP.
 *
 * Nada é preenchido por conveniência: sem declaração, o resultado é `undefined`
 * e a keyword segue sem natureza definida. Inventar "article" como padrão faria
 * todo o acervo antigo parecer declarado.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import { EditorialUnitDeclarationSchema, type EditorialUnitDeclaration } from "./contracts.ts";

const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * `siteRole` chega como texto livre do Minerador. Só os papéis que o contrato
 * editorial conhece viram declaração; o resto vira `other`, que é honesto —
 * a página existe e o papel dela não é um dos nossos.
 */
const PAPEIS_PUBLICADOS = new Map<string, Extract<EditorialUnitDeclaration, { source: "published" }>["unit"]>([
  ["silo", "silo"],
  ["silopage", "silo"],
  ["silo_page", "silo"],
  ["article", "article"],
  ["artigo", "article"],
  ["post", "article"],
  ["landing_page", "landing_page"],
  ["landingpage", "landing_page"],
  ["service_page", "service_page"],
  ["servicepage", "service_page"],
  ["category_page", "category_page"],
  ["categorypage", "category_page"],
]);

const PAPEIS_POTENCIAIS = new Map<string, "silo" | "article">([
  ["silo", "silo"],
  ["article", "article"],
  ["artigo", "article"],
]);

const normalizar = (value: string) => value.toLocaleLowerCase("pt-BR").replace(/[\s-]+/g, "_");

/**
 * Lê a declaração a partir do que o handoff transportou.
 *
 * `published` ganha precedência sobre `potential` quando os dois vêm: uma
 * página no ar é fato, e previsão não sobrescreve fato.
 */
export function readEditorialUnitDeclaration(input: {
  /** `vinculo.siteRole` do Minerador, quando a keyword é publicada. */
  siteRole?: unknown;
  url?: unknown;
  canonical?: unknown;
  observedAt?: unknown;
  /** Potencial declarado para keyword NOVA. */
  potentialUnit?: unknown;
  potentialConfidence?: unknown;
  potentialReasons?: unknown;
  /** A keyword está publicada? Decide qual natureza vale. */
  published?: boolean;
}): EditorialUnitDeclaration | undefined {
  const papel = texto(input.siteRole);
  if (papel) {
    const unit = PAPEIS_PUBLICADOS.get(normalizar(papel)) || "other";
    const parsed = EditorialUnitDeclarationSchema.safeParse({
      source: "published",
      unit,
      url: texto(input.url),
      canonical: texto(input.canonical),
      observedAt: texto(input.observedAt),
    });
    if (parsed.success) return parsed.data;
  }

  /*
   * Potencial só vale para keyword NOVA. Uma potencial sobre keyword publicada
   * seria previsão discordando do que já está no ar — e o fato vence.
   */
  if (input.published) return undefined;
  const potencial = texto(input.potentialUnit);
  if (!potencial) return undefined;
  const unit = PAPEIS_POTENCIAIS.get(normalizar(potencial));
  if (!unit) return undefined;

  const parsed = EditorialUnitDeclarationSchema.safeParse({
    source: "potential",
    unit,
    confidence: typeof input.potentialConfidence === "number" ? input.potentialConfidence : null,
    reasons: Array.isArray(input.potentialReasons)
      ? input.potentialReasons.map(item => texto(item)).filter((item): item is string => Boolean(item))
      : [],
  });
  return parsed.success ? parsed.data : undefined;
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
 * O que a declaração diz para a mesa, em uma frase.
 *
 * Fato e previsão têm palavras diferentes de propósito: quem lê precisa saber
 * se está diante de uma página no ar ou de uma aposta.
 */
export function describeEditorialUnitDeclaration(declaration: EditorialUnitDeclaration | undefined): string {
  if (!declaration) return "O Minerador ainda não declarou a natureza desta keyword.";
  if (declaration.source === "published") {
    const papel = declaration.unit === "silo" ? "Silo"
      : declaration.unit === "article" ? "Artigo"
        : declaration.unit === "landing_page" ? "Landing page"
          : declaration.unit === "service_page" ? "Página de serviço"
            : declaration.unit === "category_page" ? "Página de categoria" : "outra unidade";
    return `Publicada: o site declara que esta página é ${papel}${declaration.url ? ` (${declaration.url})` : ""}.`;
  }
  return declaration.unit === "silo"
    ? "Nova: tem potencial de Silo — a SERP confirma ou recusa."
    : "Nova: tem potencial de Artigo.";
}
