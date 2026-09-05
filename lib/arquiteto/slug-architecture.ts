/**
 * Validador de arquitetura de slug.
 *
 * Slug é decisão de ARQUITETURA, não campo isolado do formulário: a identidade
 * de uma página só faz sentido lida junto com o pai, os irmãos e o que já está
 * publicado. Este módulo é determinístico — sem IA, sem provider, sem "SEO
 * score" arbitrário — e NUNCA altera nada: devolve status, issues e sugestões
 * para uma decisão humana.
 *
 * Não cria identidade nova de slug. Lê as que já existem:
 * `SiloPage.slug`, `ArticleDNA.suggestedSlug`, `Territory.slugState`,
 * `publishedUrl`/`canonical` e a proteção de publicado.
 */

export const SLUG_ISSUE_CODES = [
  /** Mesmo slug, letra por letra. */
  "EXACT_COLLISION",
  /** Mesmo slug depois de normalizar caixa, acento, hífen e barra final. */
  "NORMALIZED_COLLISION",
  /** O filho repete a identidade do pai: `/cremes/` + `creme-para-o-rosto`. */
  "REDUNDANT_PARENT_CHILD",
  /** Página do Silo e Pilar disputando a mesma identidade/intenção. */
  "SILO_PAGE_PILLAR_IDENTITY_CONFLICT",
  /** Suporte que reproduz quase integralmente a página pai. */
  "SUPPORT_DUPLICATES_PARENT",
  /** Irmãos com a mesma identidade estrutural. */
  "SIBLING_REDUNDANCY",
  /** Identidade proposta conflita com canonical publicado e protegido. */
  "CANONICAL_CONFLICT",
] as const;
export type SlugIssueCode = (typeof SLUG_ISSUE_CODES)[number];

export type SlugSubjectKind = "silo_page" | "article" | "silo_candidate";

export type SlugSubject = {
  kind: SlugSubjectKind;
  /** `siloPageId`, `articleId` ou `territoryRef` — identidade já existente. */
  ref: string;
  label: string;
  /** Slug vigente ou proposto, como está no contrato de origem. */
  slug: string;
  /** Página do Silo à qual o Article pertence; `null` para a própria página. */
  parentRef: string | null;
  hierarchy: "Pilar" | "Suporte" | "Reforco Narrativo" | null;
  /** Publicado é intocável: nunca vira sujeito de sugestão. */
  isPublished: boolean;
  canonical: string | null;
};

export type SlugIssue = {
  code: SlugIssueCode;
  severity: "warning" | "blocked";
  reason: string;
  subject: string;
  relatedSubject: string | null;
};

export type SlugSuggestion = {
  subject: string;
  slug: string;
  reason: string;
};

export type SlugValidationResult = {
  status: "valid" | "warning" | "blocked";
  issues: SlugIssue[];
  suggestions: SlugSuggestion[];
};

/* ------------------------------ normalização ----------------------------- */

/** Palavras gramaticais que não carregam identidade editorial. */
const STOPWORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "por", "pelo", "pela", "para", "pra", "com", "sem", "e", "ou", "ao", "aos",
]);

/** Caixa, acento, separador e barra final não são identidades diferentes. */
export function normalizeSlug(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/-|-\//g, "/")
    .replace(/\/+/g, "/");
}

/** Segmentos de caminho: `/cremes/para-o-rosto` → ["cremes", "para-o-rosto"]. */
export const slugSegments = (value: string) => normalizeSlug(value).split("/").filter(Boolean);

/**
 * Plural simples do português. `cremes` e `creme` são a mesma identidade —
 * tratá-las como distintas deixaria passar exatamente a redundância que
 * queremos pegar. Heurística deliberadamente conservadora.
 */
function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("oes") || token.endsWith("aes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("ais") || token.endsWith("eis") || token.endsWith("ois") || token.endsWith("uis")) return `${token.slice(0, -2)}l`;
  if (token.endsWith("ns")) return `${token.slice(0, -2)}m`;
  if (token.endsWith("res") || token.endsWith("ses") || token.endsWith("zes")) return token.slice(0, -2);
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/** Tokens de identidade: sem stopword, sem plural, sem ordem. */
export function identityTokens(value: string): Set<string> {
  return new Set(
    normalizeSlug(value)
      .split(/[/-]/)
      .filter(Boolean)
      .filter(token => !STOPWORDS.has(token))
      .map(singular)
      .filter(Boolean),
  );
}

const sameIdentity = (left: Set<string>, right: Set<string>) =>
  left.size > 0 && left.size === right.size && [...left].every(token => right.has(token));

const contains = (whole: Set<string>, part: Set<string>) =>
  part.size > 0 && [...part].every(token => whole.has(token));

/** Último segmento: é ele que carrega a identidade própria do filho. */
const ownSegment = (value: string) => slugSegments(value).slice(-1)[0] || "";

const canonicalPath = (value: string | null) => {
  if (!value) return null;
  try {
    return normalizeSlug(new URL(value).pathname);
  } catch {
    return normalizeSlug(value);
  }
};

/* -------------------------------- validação ------------------------------ */

const subjectLabel = (subject: SlugSubject) =>
  subject.kind === "silo_page" ? "a página do silo" : subject.kind === "silo_candidate" ? "o silo candidato" : "o artigo";

/**
 * Avalia a arquitetura de slug do conjunto informado.
 *
 * `candidate`, quando presente, é a identidade sendo proposta agora — ela entra
 * na análise sem ser gravada. Publicados participam como restrição e nunca como
 * alvo de mudança: se a causa do conflito está no publicado, a sugestão recai
 * sobre o candidato.
 */
export function validateSlugArchitecture(input: {
  subjects: readonly SlugSubject[];
  candidate?: SlugSubject | null;
}): SlugValidationResult {
  const candidate = input.candidate ?? null;
  const all = candidate ? [...input.subjects, candidate] : [...input.subjects];
  const issues: SlugIssue[] = [];
  const suggestions: SlugSuggestion[] = [];
  const byRef = new Map(all.map(subject => [subject.ref, subject]));

  /**
   * O alvo de mudança nunca é o publicado, e entre dois mutáveis é o candidato
   * em análise — quem já existe não muda por causa de uma proposta nova.
   */
  const mutableOf = (left: SlugSubject, right: SlugSubject) => {
    if (candidate) {
      if (left.ref === candidate.ref && !left.isPublished) return left;
      if (right.ref === candidate.ref && !right.isPublished) return right;
    }
    return left.isPublished ? (right.isPublished ? null : right) : left;
  };

  // ── colisão exata e normalizada
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const left = all[i];
      const right = all[j];
      if (left.ref === right.ref) continue;
      const exact = left.slug.trim() === right.slug.trim();
      const normalized = normalizeSlug(left.slug) === normalizeSlug(right.slug);
      if (!normalized) continue;
      const target = mutableOf(left, right);
      issues.push({
        code: exact ? "EXACT_COLLISION" : "NORMALIZED_COLLISION",
        severity: "blocked",
        reason: exact
          ? `${subjectLabel(left)} "${left.label}" e ${subjectLabel(right)} "${right.label}" usam o mesmo slug.`
          : `"${left.slug}" e "${right.slug}" são o mesmo endereço depois de normalizar caixa, acento e barra.`,
        subject: target?.ref ?? left.ref,
        relatedSubject: target?.ref === left.ref ? right.ref : left.ref,
      });
    }
  }

  // ── relação pai → filho
  for (const child of all) {
    if (!child.parentRef) continue;
    const parent = byRef.get(child.parentRef);
    if (!parent) continue;

    const parentIdentity = identityTokens(ownSegment(parent.slug));
    const childIdentity = identityTokens(ownSegment(child.slug));
    if (!parentIdentity.size || !childIdentity.size) continue;

    const target = mutableOf(child, parent);
    const equal = sameIdentity(parentIdentity, childIdentity);

    if (equal && child.hierarchy === "Pilar" && parent.kind !== "article") {
      // Página do Silo e Pilar competindo pela mesma identidade/intenção.
      issues.push({
        code: "SILO_PAGE_PILLAR_IDENTITY_CONFLICT",
        severity: "blocked",
        reason: `O Pilar "${child.label}" tem a mesma identidade da página do silo "${parent.label}"; as duas disputariam a mesma intenção.`,
        subject: target?.ref ?? child.ref,
        relatedSubject: parent.ref,
      });
      continue;
    }

    if (equal && child.hierarchy === "Suporte") {
      issues.push({
        code: "SUPPORT_DUPLICATES_PARENT",
        severity: "warning",
        reason: `O suporte "${child.label}" reproduz a identidade da página pai "${parent.label}".`,
        subject: target?.ref ?? child.ref,
        relatedSubject: parent.ref,
      });
      continue;
    }

    if (contains(childIdentity, parentIdentity)) {
      // `/cremes/` + `creme-para-o-rosto`: o filho repete o pai. Não é
      // penalização automática do Google — é redundância arquitetural.
      issues.push({
        code: "REDUNDANT_PARENT_CHILD",
        severity: "warning",
        reason: `"${child.slug}" repete a identidade do pai "${parent.slug}"; o nesting já carrega esse contexto.`,
        subject: target?.ref ?? child.ref,
        relatedSubject: parent.ref,
      });
      if (target && !target.isPublished) {
        const reduzido = [...childIdentity].filter(token => !parentIdentity.has(token));
        const enxuto = ownSegment(child.slug)
          .split("-")
          .filter(token => !parentIdentity.has(singular(token)))
          .join("-");
        if (reduzido.length && enxuto) {
          suggestions.push({
            subject: target.ref,
            slug: `/${enxuto}`,
            reason: `O contexto "${[...parentIdentity].join(" ")}" já vem do pai.`,
          });
        }
      }
    }
  }

  // ── irmãos com a mesma identidade estrutural
  const byParent = new Map<string, SlugSubject[]>();
  for (const subject of all) {
    if (!subject.parentRef || subject.kind !== "article") continue;
    byParent.set(subject.parentRef, [...(byParent.get(subject.parentRef) || []), subject]);
  }
  for (const siblings of byParent.values()) {
    for (let i = 0; i < siblings.length; i += 1) {
      for (let j = i + 1; j < siblings.length; j += 1) {
        const left = siblings[i];
        const right = siblings[j];
        if (normalizeSlug(left.slug) === normalizeSlug(right.slug)) continue; // já é colisão
        if (!sameIdentity(identityTokens(ownSegment(left.slug)), identityTokens(ownSegment(right.slug)))) continue;
        const target = mutableOf(left, right);
        issues.push({
          code: "SIBLING_REDUNDANCY",
          severity: "warning",
          reason: `"${left.label}" e "${right.label}" têm a mesma identidade estrutural dentro do mesmo silo.`,
          subject: target?.ref ?? left.ref,
          relatedSubject: target?.ref === left.ref ? right.ref : left.ref,
        });
      }
    }
  }

  // ── canonical publicado e protegido
  const publishedCanonicals = new Map<string, SlugSubject>();
  for (const subject of all) {
    if (!subject.isPublished) continue;
    const path = canonicalPath(subject.canonical);
    if (path) publishedCanonicals.set(path, subject);
  }
  for (const subject of all) {
    if (subject.isPublished) continue;
    const own = normalizeSlug(subject.slug);
    const declared = canonicalPath(subject.canonical);
    for (const [path, owner] of publishedCanonicals) {
      if (owner.ref === subject.ref) continue;
      if (path !== own && path !== declared) continue;
      issues.push({
        code: "CANONICAL_CONFLICT",
        severity: "blocked",
        reason: `A identidade proposta conflita com o canonical publicado de "${owner.label}", que é protegido.`,
        subject: subject.ref,
        relatedSubject: owner.ref,
      });
    }
  }

  const status: SlugValidationResult["status"] = issues.some(issue => issue.severity === "blocked")
    ? "blocked"
    : issues.length ? "warning" : "valid";

  return { status, issues, suggestions };
}

/** Atalho do formulário `+ Silo`: valida a identidade proposta contra a Marca. */
export function validateManualSiloSlug(input: {
  subjects: readonly SlugSubject[];
  name: string;
  slug: string;
}): SlugValidationResult {
  return validateSlugArchitecture({
    subjects: input.subjects,
    candidate: {
      kind: "silo_candidate",
      ref: "candidate:new-silo",
      label: input.name,
      slug: input.slug,
      parentRef: null,
      hierarchy: null,
      isPublished: false,
      canonical: null,
    },
  });
}
