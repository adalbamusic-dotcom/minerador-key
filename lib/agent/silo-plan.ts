import { z } from "zod";
import { suggestArticleSlug } from "../arquiteto/article-formation.ts";
import { reviewSlugQuality, SLUG_REVIEW_LABELS } from "../arquiteto/article-silo-view.ts";
import { normalizeManualSiloPageSlug } from "../arquiteto/manual-silo.ts";
import { topicCoverage, normalizeTopicText } from "./topic-match.ts";

/**
 * ===== VALIDAR UM SILO PROPOSTO PELA IA =====
 *
 * Domínio puro. A IA propõe o silo — nome, página do silo, 4 a 7 artigos — e
 * a plataforma confere pelas regras da casa e pelo que a marca já tem. Nada é
 * gravado: o plano vive na conversa até o usuário aceitar, e o que o
 * materializa é a declaração dos Assuntos no Minerador.
 *
 * ==================== OS SLUGS SÃO OS DA CASA ====================
 *
 * Nenhuma regra de slug nasce aqui. A página do silo usa
 * `normalizeManualSiloPageSlug`; o artigo usa `suggestArticleSlug` — a
 * principal inteira, relativa ao slug do silo (`/cremes/para-o-rosto`, não
 * `/cremes/creme-para-o-rosto`); a qualidade é a de `reviewSlugQuality`. Uma
 * regra própria faria a IA propor um endereço e o Arquiteto formar outro.
 *
 * ==================== TRÊS NÍVEIS ====================
 *
 * `block`   — o plano não pode seguir assim (URL já publicada, slug repetido,
 *             pilar ausente ou duplicado, fora de 4 a 7).
 * `warning` — pode seguir, mas a IA precisa falar com o usuário (intenção
 *             repetida, funil sem TOFU, slug fraco ou diferente do da casa).
 * `info`    — o que ainda vai ser decidido depois (keyword sem medição).
 */

export const SILO_ARTICLE_RANGE = { min: 4, max: 7 } as const;

const FUNIS = ["TOFU", "MOFU", "BOFU"] as const;
const INTENCOES = ["informacional", "comercial", "transacional", "navegacional"] as const;

export const SiloPlanSchema = z.object({
  siloName: z.string().trim().min(3).max(120),
  siloPage: z.object({
    keyword: z.string().trim().min(2).max(120).describe("A keyword da página do silo: ela é uma página publicável."),
    slug: z.string().trim().max(120).optional().describe("Opcional: sem ele, a plataforma sugere pela keyword."),
    subject: z.string().trim().max(400).optional(),
  }),
  articles: z.array(z.object({
    subject: z.string().trim().min(3).max(400).describe("O Assunto (tronco) do artigo."),
    targetKeyword: z.string().trim().max(120).optional().describe("A principal pretendida, se já houver. Sem ela, sai da pesquisa por Assunto."),
    slug: z.string().trim().max(120).optional(),
    role: z.enum(["Pilar", "Suporte"]),
    funnel: z.enum(FUNIS),
    intent: z.enum(INTENCOES),
  })).min(1).max(20),
});
export type SiloPlan = z.infer<typeof SiloPlanSchema>;

export type SiloPlanIssue = { severity: "block" | "warning" | "info"; field: string; message: string };

/** O que a marca já tem e com que o plano não pode colidir. */
export type SiloPlanContext = {
  /** Caminhos publicados, sem barras nas pontas: `blog/pele-oleosa`. */
  publishedPaths: readonly string[];
  existingArticleSlugs: readonly string[];
  existingSiloPageSlugs: readonly string[];
  existingArticleTopics: readonly { id: string; text: string }[];
};

const semBarras = (value: string) => value.replace(/^\/+|\/+$/g, "").toLowerCase();
const ultimoSegmento = (path: string) => semBarras(path).split("/").filter(Boolean).at(-1) ?? "";

/** O caminho de uma URL publicada, sem barras nas pontas — é o que colide. */
export function pathOfUrl(url: string): string | null {
  try {
    const caminho = semBarras(decodeURIComponent(new URL(url).pathname));
    return caminho || null;
  } catch {
    return null;
  }
}

/** Slug da página do silo pela regra da casa, sem a barra inicial. */
export function suggestSiloPageSlug(keyword: string): string {
  try {
    return semBarras(normalizeManualSiloPageSlug(keyword));
  } catch {
    return "";
  }
}

/** Slug do artigo pela regra da casa: a principal, relativa ao silo. */
export function suggestArticleSlugFor(keyword: string, siloSlug: string | null): string {
  return suggestArticleSlug({ principal: { keyword }, siloSlug });
}

export type ValidatedSiloPlan = {
  ok: boolean;
  issues: SiloPlanIssue[];
  plan: Omit<SiloPlan, "siloPage" | "articles"> & {
    siloPage: Omit<SiloPlan["siloPage"], "slug"> & { slug: string };
    articles: Array<Omit<SiloPlan["articles"][number], "slug"> & { slug: string | null; path: string | null }>;
  };
  nextSteps: string[];
};

export function validateSiloPlan(input: SiloPlan, context: SiloPlanContext): ValidatedSiloPlan {
  const issues: SiloPlanIssue[] = [];
  const add = (severity: SiloPlanIssue["severity"], field: string, message: string) => issues.push({ severity, field, message });

  /* ---- tamanho e hierarquia ---- */
  const total = input.articles.length;
  if (total < SILO_ARTICLE_RANGE.min || total > SILO_ARTICLE_RANGE.max) {
    add("block", "articles", `O silo inicial tem de ${SILO_ARTICLE_RANGE.min} a ${SILO_ARTICLE_RANGE.max} artigos; a proposta tem ${total}.`);
  }
  const pilares = input.articles.filter(article => article.role === "Pilar").length;
  if (pilares !== 1) add("block", "articles.role", `O silo precisa de exatamente 1 Pilar; a proposta tem ${pilares}.`);

  /* ---- slugs, pela regra da casa ---- */
  const sugeridoSilo = suggestSiloPageSlug(input.siloPage.keyword);
  const siloSlug = input.siloPage.slug ? suggestSiloPageSlug(input.siloPage.slug) : sugeridoSilo;
  if (!siloSlug) add("block", "siloPage.slug", "Não foi possível formar um slug válido para a página do silo.");
  if (input.siloPage.slug && siloSlug !== sugeridoSilo) {
    add("warning", "siloPage.slug", `O slug "${siloSlug}" difere do que a plataforma forma pela keyword ("${sugeridoSilo}").`);
  }

  /* O slug que a casa formaria, lado a lado com o artigo — para comparar, não para devolver. */
  const sugeridos = input.articles.map(article => article.targetKeyword ? suggestArticleSlugFor(article.targetKeyword, siloSlug || null) : null);
  const artigos = input.articles.map((article, indice) => {
    const slug = article.slug ? semBarras(article.slug) : sugeridos[indice];
    return { ...article, slug, path: slug ? `${siloSlug}/${slug}` : null };
  });

  const publicados = new Set(context.publishedPaths.map(semBarras));
  const segmentosPublicados = new Set(context.publishedPaths.map(ultimoSegmento));

  const conferir = (slug: string, caminhos: string[], field: string) => {
    for (const code of reviewSlugQuality(slug)) add("warning", field, `Slug "${slug}": ${SLUG_REVIEW_LABELS[code]}.`);
    if (caminhos.some(caminho => publicados.has(caminho))) {
      add("block", field, `O endereço "${caminhos.find(caminho => publicados.has(caminho))}" já está publicado. Publicado é protegido: trabalhe a página existente ou escolha outro slug.`);
    } else if (segmentosPublicados.has(ultimoSegmento(slug))) {
      add("warning", field, `Já existe página publicada terminando em "${ultimoSegmento(slug)}" noutro caminho. Confira se não é o mesmo conteúdo.`);
    }
    if (context.existingArticleSlugs.map(semBarras).includes(slug)) add("block", field, `Já existe artigo na plataforma com o slug "${slug}".`);
  };

  if (siloSlug) {
    conferir(siloSlug, [siloSlug], "siloPage.slug");
    if (context.existingSiloPageSlugs.map(semBarras).includes(siloSlug)) add("block", "siloPage.slug", `Já existe página de silo com o slug "${siloSlug}".`);
  }
  artigos.forEach((article, indice) => {
    const field = `articles.${indice}.slug`;
    if (!article.slug) {
      add("info", `articles.${indice}.targetKeyword`, `"${article.subject}" ainda sem keyword: ela sai da pesquisa por Assunto, e o slug junto.`);
      return;
    }
    conferir(article.slug, [article.slug, article.path as string], field);
    const sugerido = sugeridos[indice];
    if (sugerido && article.slug !== sugerido) {
      add("warning", field, `O slug "${article.slug}" difere do que a plataforma forma pela principal ("${sugerido}"). A principal é dona do slug.`);
    }
  });

  const todos = [siloSlug, ...artigos.map(article => article.slug)].filter((slug): slug is string => Boolean(slug));
  for (const slug of new Set(todos.filter((slug, indice) => todos.indexOf(slug) !== indice))) {
    add("block", "slug", `O slug "${slug}" aparece mais de uma vez no plano.`);
  }

  /* ---- canibalização ---- */
  artigos.forEach((article, i) => {
    artigos.forEach((outro, j) => {
      if (j <= i) return;
      const mesmoTema = topicCoverage(article.subject, outro.subject) >= 0.99 || topicCoverage(outro.subject, article.subject) >= 0.99;
      if (mesmoTema && article.intent === outro.intent) {
        add("warning", `articles.${j}.subject`, `"${outro.subject}" e "${article.subject}" parecem o mesmo tema com a mesma intenção: risco de canibalização.`);
      }
    });
    for (const existente of context.existingArticleTopics) {
      if (topicCoverage(article.subject, existente.text) >= 0.99) {
        add("warning", `articles.${i}.subject`, `Já existe artigo parecido na marca: "${existente.text}". Confirme com o usuário que a intenção é outra.`);
      }
    }
  });

  if (input.articles.some(article => article.targetKeyword && normalizeTopicText(article.targetKeyword) === normalizeTopicText(input.siloPage.keyword))) {
    add("warning", "siloPage.keyword", "A keyword da página do silo é igual à de um artigo: as duas páginas disputariam a mesma busca.");
  }

  /* ---- funil ---- */
  const funis = new Set(input.articles.map(article => article.funnel));
  if (!funis.has("TOFU")) add("warning", "articles.funnel", "Nenhum artigo TOFU: sem conteúdo informacional, o silo atrai pouco tráfego e quase nada aparece nas respostas de IA.");
  if (funis.size === 1 && total > 1) add("warning", "articles.funnel", "Todos os artigos estão na mesma etapa do funil. Misture TOFU, MOFU e BOFU para levar o leitor até a oferta.");
  input.articles.forEach((article, indice) => {
    if (article.funnel === "TOFU" && article.intent !== "informacional") {
      add("warning", `articles.${indice}.intent`, `"${article.subject}" é TOFU mas a intenção está como ${article.intent}. TOFU costuma ser informacional.`);
    }
  });

  const ok = !issues.some(issue => issue.severity === "block");
  const nextSteps = ok
    ? [
      "Mostre o plano ao usuário e peça o aceite (ele pode trocar, remover ou pedir outros temas).",
      "Com o aceite: declare_subjects (preview → apply) com os Assuntos dos artigos e o da página do silo, enviando o aceite em userConfirmation.",
      "Depois: search_subject_keywords por Assunto (plan → custo ao usuário → execute) e import_subject_keywords com as escolhidas.",
      "Peça ao usuário para marcar na Revisão Humana do Minerador o tipo de página 'silo' na keyword da página do silo.",
    ]
    : ["Corrija os itens 'block' e valide de novo antes de mostrar ao usuário."];

  return {
    ok,
    issues,
    plan: {
      ...input,
      siloPage: { ...input.siloPage, slug: siloSlug },
      articles: artigos,
    },
    nextSteps,
  };
}
