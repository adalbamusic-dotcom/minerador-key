import { validateSlugArchitecture, type SlugSubject } from "./slug-architecture.ts";
import type { ArticleCandidate, ArticleFormationUniverse, ArticleKeywordRole } from "./article-formation.ts";

/**
 * PLANO DE CONFIRMAÇÃO DA FORMAÇÃO.
 *
 * Aqui a formação deixa de ser leitura e vira decisão: os candidatos aprovados
 * são os que podem virar ArticleDNA. O plano é PURO — ele diz quem entra, quem
 * fica pendente e por quê. Quem escreve é o chamador, pelo writer canônico que
 * já existe.
 *
 * Três coisas bloqueiam um candidato, e nenhuma delas é opinião:
 *
 *   1. conflito declarado na formação (ambiguidade, excesso além do teto)
 *   2. slug que o SlugArchitectureValidator recusa
 *   3. colisão com patrimônio publicado — publicado vence, sempre
 *
 * Confirmação PARCIAL é o caso normal: o que está pronto passa, o resto
 * continua candidato. Bloquear o lote inteiro por causa de um caso duvidoso
 * transformaria revisão em impasse.
 *
 * Domínio puro: sem storage, sem fetch, sem provider.
 */

export const CONFIRMATION_BLOCK_CODES = [
  "FORMATION_CONFLICT",
  "SLUG_BLOCKED",
  "PUBLISHED_COLLISION",
  "MISSING_PRINCIPAL",
] as const;
export type ConfirmationBlockCode = (typeof CONFIRMATION_BLOCK_CODES)[number];

export type ConfirmationBlock = {
  candidateRef: string;
  code: ConfirmationBlockCode;
  reason: string;
  /** Quando o bloqueio é patrimônio, qual página já responde a essa busca. */
  publishedPath?: string;
};

export type ConfirmationEntry = {
  candidateRef: string;
  siloRef: string;
  principalKeywordId: string;
  keywordIds: string[];
  /**
   * A composição COM os papéis do cenário.
   *
   * Materializar só os ids fazia todo reforço virar secundária no ArticleDNA:
   * a decisão editorial de quem sustenta a narrativa e quem apenas a reforça
   * morria exatamente no momento em que ela deveria ser gravada.
   */
  keywords: { keywordId: string; role: ArticleKeywordRole }[];
  /** Slug validado, relativo ao Silo pai. */
  slug: string;
  fullPath: string;
};

export type ArticleFormationConfirmationPlan = {
  approved: ConfirmationEntry[];
  blocked: ConfirmationBlock[];
  /** Publicados reconhecidos; nunca materializados de novo neste corte. */
  protectedPublished: { siloRef: string; path: string; label: string }[];
};

const joinPath = (siloSlug: string | null, slug: string) => {
  const base = siloSlug || "";
  const raiz = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${raiz}/${slug}`;
};

/**
 * Monta os assuntos que o validador de slug precisa enxergar.
 *
 * O publicado entra como `isPublished`, que é o que faz o validador escolher
 * SEMPRE o candidato como alvo de mudança. Sem isso, ele poderia propor mexer
 * numa URL que já está no ar.
 */
function slugSubjectsOf(universe: ArticleFormationUniverse): SlugSubject[] {
  const subjects: SlugSubject[] = [];

  if (universe.siloSlug) {
    subjects.push({
      ref: universe.siloRef,
      kind: "silo_page",
      label: universe.siloLabel,
      slug: universe.siloSlug,
      parentRef: null,
      hierarchy: null,
      isPublished: false,
      canonical: null,
    });
  }

  for (const published of universe.publishedArticles) {
    subjects.push({
      ref: `published:${published.path}`,
      kind: "article",
      label: published.label,
      slug: published.path,
      parentRef: universe.siloSlug ? universe.siloRef : null,
      hierarchy: "Suporte",
      isPublished: true,
      canonical: published.canonical,
    });
  }

  return subjects;
}

export function buildArticleFormationConfirmationPlan(input: {
  universes: readonly ArticleFormationUniverse[];
}): ArticleFormationConfirmationPlan {
  const approved: ConfirmationEntry[] = [];
  const blocked: ConfirmationBlock[] = [];
  const protectedPublished: { siloRef: string; path: string; label: string }[] = [];

  for (const universe of input.universes) {
    for (const published of universe.publishedArticles) {
      protectedPublished.push({ siloRef: universe.siloRef, path: published.path, label: published.label });
    }

    const publicadosPorCaminho = new Map(
      universe.publishedArticles.map(item => [item.path.trim().toLowerCase(), item]),
    );
    const base = slugSubjectsOf(universe);
    // Os já aprovados deste Silo entram como assuntos: dois candidatos novos
    // não podem sair com o mesmo endereço.
    const aprovadosDoSilo: SlugSubject[] = [];

    for (const candidate of universe.candidates) {
      const bloqueio = blockFor(candidate, universe, publicadosPorCaminho);
      if (bloqueio) {
        blocked.push(bloqueio);
        continue;
      }

      const slug = candidate.suggestedSlug!;
      const fullPath = joinPath(universe.siloSlug, slug);
      const assunto: SlugSubject = {
        ref: candidate.candidateRef,
        kind: "article",
        label: slug,
        slug: fullPath,
        parentRef: universe.siloSlug ? universe.siloRef : null,
        hierarchy: "Suporte",
        // Candidato NUNCA é publicado: é isso que faz o validador escolher
        // ele como alvo de mudança em vez da URL que já está no ar.
        isPublished: false,
        canonical: null,
      };

      const validacao = validateSlugArchitecture({
        subjects: [...base, ...aprovadosDoSilo],
        candidate: assunto,
      });
      const impeditivo = validacao.issues.find(issue =>
        issue.severity === "blocked" && (issue.subject === candidate.candidateRef || issue.relatedSubject === candidate.candidateRef));
      if (impeditivo) {
        blocked.push({ candidateRef: candidate.candidateRef, code: "SLUG_BLOCKED", reason: impeditivo.reason });
        continue;
      }

      aprovadosDoSilo.push(assunto);
      approved.push({
        candidateRef: candidate.candidateRef,
        siloRef: universe.siloRef,
        principalKeywordId: candidate.principalKeywordId,
        keywordIds: candidate.keywords.map(item => item.keywordId),
        keywords: candidate.keywords.map(item => ({ keywordId: item.keywordId, role: item.role })),
        slug,
        fullPath,
      });
    }
  }

  return { approved, blocked, protectedPublished };
}

function blockFor(
  candidate: ArticleCandidate,
  universe: ArticleFormationUniverse,
  publicadosPorCaminho: ReadonlyMap<string, { path: string; label: string }>,
): ConfirmationBlock | null {
  // Patrimônio primeiro: "colide com o que já está no ar" é mais específico —
  // e mais útil para quem revisa — do que o rótulo genérico de conflito.
  const colisaoPublicada = candidate.conflicts.find(conflict => conflict.includes("publicado"));
  if (colisaoPublicada) {
    return {
      candidateRef: candidate.candidateRef,
      code: "PUBLISHED_COLLISION",
      reason: colisaoPublicada,
    };
  }
  if (candidate.conflicts.length) {
    return {
      candidateRef: candidate.candidateRef,
      code: "FORMATION_CONFLICT",
      reason: candidate.conflicts[0],
    };
  }
  if (!candidate.principalKeywordId) {
    return {
      candidateRef: candidate.candidateRef,
      code: "MISSING_PRINCIPAL",
      reason: "O artigo não tem keyword principal definida.",
    };
  }
  // Sem slug proposto: ou a principal é publicada (patrimônio, não se
  // materializa de novo) ou a proposta foi retirada por colidir com o que já
  // está no ar. Nos dois casos, publicado vence.
  if (!candidate.suggestedSlug) {
    const colisao = candidate.conflicts.find(conflict => conflict.includes("publicado"));
    return {
      candidateRef: candidate.candidateRef,
      code: "PUBLISHED_COLLISION",
      reason: colisao || "O conteúdo já existe publicado; este candidato é possível reforço, não artigo novo.",
    };
  }

  const caminho = joinPath(universe.siloSlug, candidate.suggestedSlug).trim().toLowerCase();
  const publicado = publicadosPorCaminho.get(caminho);
  if (publicado) {
    return {
      candidateRef: candidate.candidateRef,
      code: "PUBLISHED_COLLISION",
      reason: `Possível reforço do artigo publicado "${publicado.label}".`,
      publishedPath: publicado.path,
    };
  }
  return null;
}

/** Síntese para a UI dizer o que aconteceu sem repetir a lista inteira. */
export function summarizeConfirmationPlan(plan: ArticleFormationConfirmationPlan) {
  const porCodigo = plan.blocked.reduce((acc, item) => {
    acc.set(item.code, (acc.get(item.code) ?? 0) + 1);
    return acc;
  }, new Map<ConfirmationBlockCode, number>());
  return {
    approved: plan.approved.length,
    blocked: plan.blocked.length,
    protectedPublished: plan.protectedPublished.length,
    reinforcements: porCodigo.get("PUBLISHED_COLLISION") ?? 0,
    slugBlocked: porCodigo.get("SLUG_BLOCKED") ?? 0,
    needsReview: porCodigo.get("FORMATION_CONFLICT") ?? 0,
  };
}

/* --------------------- §14 portaria de Concluir formação ----------------- */

export const CONCLUSION_GATE_CODES = [
  "SINGLE_PARENT_PER_ARTICLE",
  "EXACTLY_ONE_PRINCIPAL",
  "NO_DUPLICATED_KEYWORD",
  "KEYWORD_CEILING",
  "PUBLISHED_PROTECTION",
  "SLUG_ARCHITECTURE",
  "NO_CROSS_SILO_COMPOSITION",
  "NO_OPEN_HUMAN_CONFLICT",
  "SERP_EVIDENCE_CURRENT",
  "SERP_HUMAN_DECISION",
  /**
   * §13 — nenhum ArticleDNA aprovado carrega estado de processo.
   *
   * Incerteza é resultado e fecha o campo: `Ambígua`, `Indeterminado`,
   * `Não aplicável`. Pendência é trabalho não feito, e não pode atravessar a
   * conclusão. Quando a regra vigente devolve a decisão ao humano — KGR fora
   * do pleno com aplicabilidade `Aplicável` — concluir BLOQUEIA em vez de
   * escolher um default por conveniência.
   */
  "ARTICLE_REQUIRED_CLASSIFICATIONS_RESOLVED",
] as const;

export type ConclusionGateCode = (typeof CONCLUSION_GATE_CODES)[number];

export type ConclusionGate = {
  code: ConclusionGateCode;
  ok: boolean;
  /** O motivo em uma frase: a portaria explica, não apenas recusa. */
  detail: string;
};

export type ConclusionVerdict = {
  ok: boolean;
  gates: ConclusionGate[];
  /** Quantos artigos passariam a existir se o clique acontecesse agora. */
  approved: number;
  blocked: number;
};

/**
 * O QUE PRECISA SER VERDADE ANTES DE ESCREVER.
 *
 * O plano de confirmação decide caso a caso; esta portaria olha o LOTE. São
 * invariantes estruturais: uma keyword em dois artigos, um artigo sem
 * Principal ou uma composição que atravessa Silos não são casos duvidosos que
 * podem esperar — são contradições, e escrever ArticleDNA em cima delas
 * gravaria a contradição no acervo canônico.
 *
 * A portaria não substitui o plano: ela roda ANTES dele virar escrita.
 */
export function validateFormationConclusion(input: {
  universes: readonly ArticleFormationUniverse[];
  plan: ArticleFormationConfirmationPlan;
  /** Silo confirmado de cada keyword, lido da membership territorial. */
  keywordSiloRef: ReadonlyMap<string, string | null>;
  /** Teto contratual de keywords por artigo. */
  ceiling: number;
  /**
   * Gate SERP por candidato.
   *
   * A lógica propõe; o mercado verifica. Concluir sem evidência vigente é
   * gravar como contrato uma hipótese que nunca foi confrontada — e é
   * justamente isso que este parâmetro impede.
   */
  /**
   * Classificações ainda em estado de processo, por candidato.
   *
   * O portão não RESOLVE nada: quem resolve é `resolveArticleClassification`.
   * Aqui só se pergunta se sobrou pendência — e pendência barra a escrita.
   */
  unresolvedClassifications?: ReadonlyMap<string, readonly string[]>;
  serpGates: ReadonlyMap<string, { state: string; blocksConclusion: boolean; requiresHumanDecision: boolean; reason: string }>;
}): ConclusionVerdict {
  const candidatos = input.universes.flatMap(universe =>
    universe.candidates.map(candidate => ({ candidate, siloRef: universe.siloRef })));

  const semPrincipal = candidatos.filter(({ candidate }) =>
    candidate.keywords.filter(item => item.role === "principal").length !== 1);

  // Só os candidatos que o plano aprovou: pendência de quem não vai ser
  // escrito agora não é motivo para barrar quem está pronto.
  const aprovadosDoPlano = new Set(input.plan.approved.map(entry => entry.candidateRef));
  const classificacoesAbertas = [...(input.unresolvedClassifications || new Map())]
    .filter(([candidateRef, campos]) => aprovadosDoPlano.has(candidateRef) && campos.length)
    .map(([candidateRef, campos]) => ({ candidateRef, campos: [...campos] }));

  const vistas = new Map<string, number>();
  for (const { candidate } of candidatos) {
    for (const item of candidate.keywords) vistas.set(item.keywordId, (vistas.get(item.keywordId) || 0) + 1);
  }
  const duplicadas = [...vistas.entries()].filter(([, total]) => total > 1);

  const acimaDoTeto = candidatos.filter(({ candidate }) =>
    candidate.keywords.length + candidate.overflowKeywordIds.length > input.ceiling);

  const paiDivergente = candidatos.filter(({ candidate, siloRef }) => candidate.siloRef !== siloRef);

  const crossSilo = candidatos.filter(({ candidate, siloRef }) => candidate.keywords.some(item => {
    const dela = input.keywordSiloRef.get(item.keywordId);
    return dela !== undefined && dela !== null && dela !== siloRef;
  }));

  const publicadoEmCandidato = candidatos.filter(({ candidate }) =>
    input.plan.approved.some(entry => entry.candidateRef === candidate.candidateRef)
    && candidate.conflicts.some(conflito => conflito.toLowerCase().includes("publicado")));

  // A SERP olha SÓ os candidatos que seriam gravados agora. Um candidato que
  // o plano já barrou não precisa de evidência para continuar de fora.
  const comGate = input.plan.approved.map(entry => ({ entry, gate: input.serpGates.get(entry.candidateRef) }));
  /**
   * Dois impedimentos DIFERENTES, contados à parte.
   *
   * Juntá-los fazia a portaria acusar "sem evidência" sobre artigos que
   * foram ao mercado e voltaram com um achado — mandando coletar de novo o
   * que já estava gravado, em vez de pedir a decisão que de fato faltava.
   */
  const semColeta = comGate.filter(item => !item.gate || item.gate.blocksConclusion && !item.gate.requiresHumanDecision);
  const semDecisao = comGate.filter(item => item.gate?.requiresHumanDecision);
  const semEvidencia = [...semColeta, ...semDecisao];

  const slugBloqueado = input.plan.blocked.filter(item => item.code === "SLUG_BLOCKED");
  const conflitoAberto = input.plan.blocked.filter(item => item.code === "FORMATION_CONFLICT");

  const gates: ConclusionGate[] = [
    {
      code: "SINGLE_PARENT_PER_ARTICLE",
      ok: paiDivergente.length === 0,
      detail: paiDivergente.length === 0
        ? "Cada artigo declara exatamente um Silo pai."
        : `${paiDivergente.length} artigo(s) declaram um Silo diferente do universo em que foram formados.`,
    },
    {
      code: "EXACTLY_ONE_PRINCIPAL",
      ok: semPrincipal.length === 0,
      detail: semPrincipal.length === 0
        ? "Todo artigo tem uma Principal, e apenas uma."
        : `${semPrincipal.length} artigo(s) não têm exatamente uma Principal.`,
    },
    {
      code: "NO_DUPLICATED_KEYWORD",
      ok: duplicadas.length === 0,
      detail: duplicadas.length === 0
        ? "Nenhuma busca aparece em dois artigos."
        : `${duplicadas.length} busca(s) aparecem em mais de um artigo do cenário.`,
    },
    {
      code: "KEYWORD_CEILING",
      ok: acimaDoTeto.length === 0,
      detail: acimaDoTeto.length === 0
        ? `Nenhum artigo passa do teto de ${input.ceiling} buscas.`
        : `${acimaDoTeto.length} artigo(s) passam do teto de ${input.ceiling} buscas e esperam decisão editorial.`,
    },
    {
      code: "PUBLISHED_PROTECTION",
      ok: publicadoEmCandidato.length === 0,
      detail: publicadoEmCandidato.length === 0
        ? "Nenhum candidato aprovado disputa endereço com patrimônio publicado."
        : `${publicadoEmCandidato.length} candidato(s) aprovados ainda colidem com conteúdo publicado.`,
    },
    {
      code: "SLUG_ARCHITECTURE",
      ok: slugBloqueado.length === 0,
      detail: slugBloqueado.length === 0
        ? "Todos os endereços propostos passaram pelo validador de arquitetura."
        : `${slugBloqueado.length} endereço(s) foram recusados pelo validador e ficam de fora.`,
    },
    {
      code: "NO_CROSS_SILO_COMPOSITION",
      ok: crossSilo.length === 0,
      detail: crossSilo.length === 0
        ? "Nenhum artigo reúne buscas de Silos diferentes."
        : `${crossSilo.length} artigo(s) reúnem buscas de Silos diferentes e não pertencem a nenhuma SiloPage.`,
    },
    {
      code: "ARTICLE_REQUIRED_CLASSIFICATIONS_RESOLVED",
      ok: classificacoesAbertas.length === 0,
      detail: classificacoesAbertas.length === 0
        ? "Intenção, funil, KGR, aplicabilidade, compatibilidade e proteção fecham em estado terminal."
        : `${classificacoesAbertas.length} artigo(s) ainda possuem classificações não resolvidas: ${[...new Set(classificacoesAbertas.flatMap(item => item.campos))].join(", ")}.`,
    },
    {
      code: "NO_OPEN_HUMAN_CONFLICT",
      ok: conflitoAberto.length === 0,
      detail: conflitoAberto.length === 0
        ? "Nenhuma formação está com conflito humano aberto."
        : `${conflitoAberto.length} formação(ões) continuam com conflito aberto e seguem como candidatas.`,
    },
    {
      code: "SERP_EVIDENCE_CURRENT",
      ok: semColeta.length === 0,
      detail: semColeta.length === 0
        ? `Todos os ${comGate.length} artigo(s) a gravar foram confrontados com a SERP para a composição atual.`
        : `${semColeta.length} artigo(s) ainda precisam de coleta SERP: ${[...new Set(semColeta.map(item => item.gate?.reason
          || "este artigo ainda não foi confrontado com a SERP."))].join(" ")}`,
    },
    {
      code: "SERP_HUMAN_DECISION",
      ok: semDecisao.length === 0,
      detail: semDecisao.length === 0
        ? "Nenhum parecer da SERP está esperando decisão editorial."
        : `A SERP está vigente nestes artigos, mas ${semDecisao.length} precisa(m) de decisão humana: `
          + `${semDecisao.filter(item => item.gate?.state === "current_divergent_unresolved").length} divergente(s) e `
          + `${semDecisao.filter(item => item.gate?.state === "current_inconclusive_unresolved").length} inconclusivo(s).`,
    },
  ];

  /**
   * Só as contradições estruturais barram o lote inteiro.
   *
   * Slug recusado, conflito aberto e colisão com publicado já mantêm o
   * candidato de fora pelo plano — transformá-los em impasse geral faria uma
   * dúvida isolada travar uma revisão inteira que estava pronta.
   */
  const estruturais: ConclusionGateCode[] = [
    "SINGLE_PARENT_PER_ARTICLE",
    "EXACTLY_ONE_PRINCIPAL",
    "NO_DUPLICATED_KEYWORD",
    "KEYWORD_CEILING",
    "NO_CROSS_SILO_COMPOSITION",
    // Evidência de mercado ausente, envelhecida ou com falha barra o lote: o
    // ArticleDNA é contrato, e um contrato assinado sobre hipótese não
    // verificada é pior que nenhum contrato.
    "SERP_EVIDENCE_CURRENT",
    // Parecer vigente esperando decisão também barra — mas por outro motivo,
    // e a mensagem precisa dizer qual dos dois é.
    "SERP_HUMAN_DECISION",
  ];

  return {
    ok: gates.filter(gate => estruturais.includes(gate.code)).every(gate => gate.ok)
      && input.plan.approved.length > 0,
    gates,
    approved: input.plan.approved.length,
    blocked: input.plan.blocked.length,
  };
}
