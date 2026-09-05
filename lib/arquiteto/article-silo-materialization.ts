/**
 * O SILO CANÔNICO DENTRO DO ARTICLE — CONTRATO FECHADO NA ORIGEM.
 *
 * Havia duas maneiras de descobrir a que Silo um Article pertence:
 *
 *   a) `ArticleDNA.siloId`      — a referência materializada no artefato;
 *   b) `territoryRef` + busca   — a dedução feita por quem lê, depois.
 *
 * Enquanto (a) ficava null "por desenho", todo consumidor a jusante precisava
 * refazer (b). Isso não é resiliência: é a fase seguinte terminando o serviço
 * que a anterior não terminou, e cada consumidor podendo chegar a uma resposta
 * diferente. O Radar chegou a importar oito artigos cujo pai só existia na
 * memória de quem clicou.
 *
 * A regra passa a ser: quem FECHA a fase materializa. `siloId` é preenchido no
 * ato humano que encerra a formação, não deduzido adiante.
 *
 * `territoryRef → siloId` é ESTRITAMENTE 1:1. Zero não escolhe, dois não
 * desempatam. Este módulo é a única autoridade dessa correspondência; quem
 * precisar dela importa daqui em vez de refazer o `find`.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

import type { ArticleDNA, SiloDNA, VersionEnvelope } from "./contracts.ts";

/* ------------------------ territoryRef → siloId (1:1) --------------------- */

export type CanonicalSiloBinding =
  | {
    state: "BOUND";
    siloId: string;
    siloName: string | null;
    siloDnaVersionId: string;
    siloDnaContentHash: string;
    territoryRef: string;
  }
  /** O artigo não declara território: não há de onde partir. */
  | { state: "NO_TERRITORY"; reason: string }
  /** Território declarado, nenhum SiloDNA canônico o reivindica: falta consolidar. */
  | { state: "NO_SILO"; reason: string; territoryRef: string }
  /** Mais de um SiloDNA declara o mesmo território: 1:1 quebrado. */
  | { state: "AMBIGUOUS"; reason: string; territoryRef: string; siloIds: string[] };

export function resolveCanonicalSiloIdForTerritory(input: {
  territoryRef: string | null | undefined;
  siloVersions: readonly VersionEnvelope<SiloDNA>[];
}): CanonicalSiloBinding {
  const territoryRef = typeof input.territoryRef === "string" && input.territoryRef.trim()
    ? input.territoryRef
    : null;
  if (!territoryRef) {
    return { state: "NO_TERRITORY", reason: "O artigo não declara território de origem." };
  }

  const candidatos = input.siloVersions.filter(version => version.payload.territoryRef === territoryRef);

  if (candidatos.length === 0) {
    return {
      state: "NO_SILO",
      territoryRef,
      reason: "Nenhum SiloDNA canônico declara este território: falta consolidar o Silo.",
    };
  }
  if (candidatos.length > 1) {
    return {
      state: "AMBIGUOUS",
      territoryRef,
      siloIds: [...new Set(candidatos.map(version => version.payload.siloId))].sort(),
      reason: `${candidatos.length} SiloDNA canônicos declaram o mesmo território; a correspondência precisa ser 1:1.`,
    };
  }

  const silo = candidatos[0];
  return {
    state: "BOUND",
    siloId: silo.payload.siloId,
    siloName: silo.payload.name ?? null,
    siloDnaVersionId: silo.versionId,
    siloDnaContentHash: silo.contentHash,
    territoryRef,
  };
}

/* --------------------------- o contrato do artefato ----------------------- */

/**
 * CURRENT vs LEGACY.
 *
 * Um ArticleDNA produzido a partir de agora precisa das DUAS coisas:
 * `territoryRef` (de onde veio) e `siloId` (a que pertence). São perguntas
 * distintas e nenhuma substitui a outra.
 *
 * Um ArticleDNA anterior a este corte não tem `siloId` — e não é defeito dele.
 * Ele é LEGACY: hidratável pelo território, e contabilizado como dívida até
 * ganhar sucessora. O que não pode é LEGACY ser lido como se estivesse
 * conforme, que é o que fazia a fase seguinte aceitar o incompleto.
 */
export const ARTICLE_SILO_CONTRACT_STATES = [
  /** Declara território e Silo canônico: fase encerrada de verdade. */
  "CURRENT",
  /** Declara território, não declara Silo: produzido antes do contrato. */
  "LEGACY_HYDRATABLE",
  /** Nem território nem Silo: não há o que hidratar. */
  "LEGACY_UNRESOLVED",
] as const;
export type ArticleSiloContractState = (typeof ARTICLE_SILO_CONTRACT_STATES)[number];

export type ArticleSiloContractReading = {
  state: ArticleSiloContractState;
  articleId: string;
  siloId: string | null;
  territoryRef: string | null;
  /** Conforme ao contrato vigente? LEGACY nunca é. */
  compliant: boolean;
  reason: string;
};

export function readArticleSiloContract(article: ArticleDNA): ArticleSiloContractReading {
  const siloId = typeof article.siloId === "string" && article.siloId.trim() ? article.siloId : null;
  const territoryRef = article.territoryRef || null;

  if (siloId && territoryRef) {
    return {
      state: "CURRENT",
      articleId: article.articleId,
      siloId,
      territoryRef,
      compliant: true,
      reason: "O artigo declara território de origem e Silo canônico.",
    };
  }
  if (territoryRef) {
    return {
      state: "LEGACY_HYDRATABLE",
      articleId: article.articleId,
      siloId: null,
      territoryRef,
      compliant: false,
      reason: "Produzido antes do contrato: declara território, não declara Silo canônico.",
    };
  }
  return {
    state: "LEGACY_UNRESOLVED",
    articleId: article.articleId,
    siloId,
    territoryRef: null,
    compliant: false,
    reason: siloId
      ? "Declara Silo canônico sem declarar o território de origem."
      : "Não declara território nem Silo canônico: não há pai a resolver.",
  };
}

/**
 * O ato de CONFIRMAR não pode emitir artefato incompleto.
 *
 * Devolve os impedimentos legíveis; lista vazia significa que o payload pode
 * ser materializado como está.
 */
export function articleSiloMaterializationIssues(input: {
  territoryRef: string | null | undefined;
  binding: CanonicalSiloBinding;
}): string[] {
  const issues: string[] = [];
  if (!input.territoryRef) {
    issues.push("O artigo não declara território de origem: a formação não pode ser encerrada sem pai.");
  }
  if (input.binding.state === "NO_SILO") issues.push(input.binding.reason);
  if (input.binding.state === "AMBIGUOUS") issues.push(input.binding.reason);
  return issues;
}

/* ------------------------- materializar no payload ------------------------ */

export type ArticleSiloMaterialization =
  | { ok: true; payload: ArticleDNA; changed: boolean; siloId: string }
  | { ok: false; reason: string };

/**
 * Preenche `siloId` PRESERVANDO todo o resto.
 *
 * Não reescreve composição, hierarquia, slug, canonical nem decisão nenhuma:
 * materializar a referência do pai não é oportunidade de reeditar o artigo. Se
 * o artigo já declara um `siloId` diferente do canônico, isto RECUSA — trocar
 * o pai de um artigo é decisão humana, não efeito colateral de um backfill.
 */
export function materializeArticleSiloId(input: {
  article: ArticleDNA;
  siloVersions: readonly VersionEnvelope<SiloDNA>[];
}): ArticleSiloMaterialization {
  const binding = resolveCanonicalSiloIdForTerritory({
    territoryRef: input.article.territoryRef,
    siloVersions: input.siloVersions,
  });
  if (binding.state !== "BOUND") {
    return { ok: false, reason: binding.reason };
  }

  const atual = typeof input.article.siloId === "string" && input.article.siloId.trim()
    ? input.article.siloId
    : null;
  if (atual && atual !== binding.siloId) {
    return {
      ok: false,
      reason: `O artigo declara o Silo ${atual} e o território aponta para ${binding.siloId}: trocar o pai é decisão humana.`,
    };
  }

  return {
    ok: true,
    changed: atual !== binding.siloId,
    siloId: binding.siloId,
    payload: { ...input.article, siloId: binding.siloId },
  };
}
