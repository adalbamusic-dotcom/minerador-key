import { radarCompetitiveBlueprintViewOfAnalysis } from "../radar/competitive-blueprint-view.ts";
import { buildRadarEvidenceBundleFromAnalysis, radarPrimaryProfileOfAnalysis } from "../radar/evidence-bundle-runtime.ts";
import { radarPlannerHandoffReadiness } from "../radar/planner-handoff.ts";
import type { RadarAnalysisVersion } from "../radar/analysis-contracts.ts";
import type { RadarEvidenceBundle } from "../radar/evidence-bundle.ts";
import type { RadarCompetitiveBlueprintView } from "../radar/competitive-blueprint-view.ts";
import type { RadarPlannerArticleFoundation, RadarPlannerHandoffReadiness } from "../radar/planner-handoff.ts";
import type { RadarResearchProfile } from "../radar/research-profile.ts";
import { radarKeywordContextOf } from "../radar/keyword-context.ts";
import type { RadarKeywordContext } from "../radar/keyword-context.ts";
import type { RadarCanonicalAuthorities } from "./radar-canonical-authorities.ts";

/**
 * ===== O DOSSIÊ CANÔNICO, RESOLVIDO UMA VEZ — PORTABLE_EXPORT_1 · §1 e §16 =====
 *
 * ==================== POR QUE ISTO VIROU MÓDULO ====================
 *
 * O envio ao Planejador resolvia esta cadeia dentro de `sendRadarToPlanner`:
 *
 *     análise corrente
 *        → radarCompetitiveBlueprintViewOfAnalysis   (blueprint canônico)
 *        → buildRadarEvidenceBundleFromAnalysis      (o dossiê e o hash dele)
 *        → radarPlannerHandoffReadiness              (dá para entregar?)
 *
 * O export precisa EXATAMENTE do mesmo resultado. §16 exige que o dossiê
 * exportado e o entregue tenham a mesma identidade, o mesmo hash e a mesma
 * semântica de autoridade.
 *
 * Havia duas formas de conseguir isso: escrever um teste que compara as duas
 * saídas, ou fazer as duas saírem do MESMO código. A segunda não pode falhar —
 * um teste de paridade prova que hoje coincidem; um caminho único faz com que
 * não exista "os dois". Um `observedAt` diferente já bastaria para o hash
 * divergir, e ninguém descobriria até um artigo chegar ao Redator com evidência
 * de outra rodada.
 *
 * ==================== ZERO PROVIDER — §17 e Q ====================
 *
 * Tudo aqui é LEITURA do que já está gravado e pago. Cem artigos exportados
 * custam cem leituras de estado, e nenhuma chamada a provider.
 */

export type RadarCanonicalDossier = {
  analysis: RadarAnalysisVersion;
  article: RadarPlannerArticleFoundation;
  profile: RadarResearchProfile;
  blueprintView: RadarCompetitiveBlueprintView;
  bundle: RadarEvidenceBundle;
  /** §9 · o que o export projeta. Ele NÃO resolve nada por conta própria. */
  authorities: RadarCanonicalAuthorities | null;
  /** §7 · a mesma composição que o Planejador recebe e o export projeta. */
  keywordContext: RadarKeywordContext;
  readiness: RadarPlannerHandoffReadiness;
};

export type RadarCanonicalDossierResult =
  | { ok: true; dossier: RadarCanonicalDossier }
  | { ok: false; code: string; reason: string };

/**
 * RESOLVE O DOSSIÊ DE UM ARTIGO — sem gravar, sem enviar, sem cobrar.
 *
 * Recusa com CÓDIGO em vez de lançar: o export em lote precisa saber que o
 * artigo 7 de 100 não estava finalizado e seguir com os outros 99. Uma exceção
 * aqui derrubaria o lote inteiro por causa de um item.
 */
export function resolveRadarCanonicalDossier(entrada: {
  analysis: RadarAnalysisVersion;
  article: RadarPlannerArticleFoundation;
  observedAt: string;
  /**
   * ===== PARITY_1 · §2 · AS AUTORIDADES DO RADAR, JÁ LIDAS =====
   *
   * Elas entram PRONTAS porque a autoridade delas é outra: este módulo lê o
   * resultado da investigação, não a conduz. O que ele faz — e é tudo o que
   * ele faz — é reunir as camadas num dossiê só, com identidade e hash.
   *
   * Até o PARITY_1, quem exportava lia a fotografia do Google, a biblioteca de
   * vídeos e o especialista; quem enviava ao Planejador, não. O mesmo artigo
   * saía completo num CSV que vai para FORA da plataforma e incompleto no
   * pacote que alimenta o módulo seguinte DELA.
   *
   * Agora as duas pontas chamam `loadRadarCanonicalAuthorities` e entregam o
   * resultado aqui. Não há duas resoluções para comparar: há uma.
   */
  authorities?: RadarCanonicalAuthorities | null;
}): RadarCanonicalDossierResult {
  const payload = entrada.analysis.payload;
  const autoridades = entrada.authorities ?? null;

  /*
   * ===== §2 e §3 · O CONTEXTO DE KEYWORD, ANTES DE TUDO =====
   *
   * Ele é o mesmo nos três perfis porque a autoridade é uma só: a composição
   * que o Arquiteto aprovou, com o texto resolvido pela hidratação daquela
   * versão do ArticleDNA. O perfil de pesquisa não entra na conta — e é
   * exatamente por isso que o YouTube e a Amazon passaram a carregá-lo.
   */
  const keywordContext = radarKeywordContextOf(autoridades?.researchContext);

  /*
   * §2 · SÓ INVESTIGAÇÃO FINALIZADA ATRAVESSA.
   *
   * `radarPrimaryProfileOfAnalysis` responde `null` quando não há fotografia
   * nenhuma — é a mesma pergunta que o envio ao Planejador faz, com a mesma
   * resposta.
   */
  const profile = radarPrimaryProfileOfAnalysis(payload);
  if (!profile) {
    return { ok: false, code: "radar_research_not_finalized", reason: "A investigação deste artigo não está finalizada." };
  }

  const blueprintView = radarCompetitiveBlueprintViewOfAnalysis({
    profile,
    articleId: entrada.article.articleId,
    articleDnaVersionId: entrada.article.articleDnaVersionId,
    articleDnaContentHash: entrada.article.articleDnaContentHash,
    frozen: payload.youtubeFrozenInvestigation,
    liveBlueprint: null,
    liveMultimodal: null,
    googleObserved: autoridades?.google?.observed ?? null,
    primaryKeyword: null,
    amazonFrozen: payload.amazonFrozenInvestigation,
    amazonBlueprint: null,
    amazonUniverseSize: payload.amazonSearch?.universe.length || 0,
    supportSnapshotId: payload.supportResearch?.serpSnapshotId ?? null,
    serpSnapshotId: payload.serpSnapshotId,
    googleFrozenAt: payload.finalizedBundle?.frozenAt ?? null,
    generatedAt: entrada.observedAt,
  });

  const resolucao = buildRadarEvidenceBundleFromAnalysis({
    payload,
    googleObserved: autoridades?.google?.observed ?? null,
    article: entrada.article,
    competitiveBlueprint: blueprintView.blueprint,
    /*
     * §3, §4 e §10 · OS CAMPOS QUE JÁ EXISTIAM, ENFIM PREENCHIDOS.
     *
     * A camada de vídeo e a do especialista são campos do V3 desde o Gate 16 e
     * sempre chegaram nulas: os dois construtores de camada não tinham chamador
     * de produção nenhum. Não foi preciso contrato novo — foi preciso
     * alguém montar o que o contrato já esperava.
     */
    video: autoridades?.video ?? null,
    specialist: autoridades?.specialist ?? null,
    /*
     * §5 · SÓ ENTREGA O QUE RESOLVEU.
     *
     * Um contexto vazio no bundle diria "a composição foi lida e está vazia",
     * quando a verdade é que a hidratação daquela versão não trouxe o texto.
     * A ausência da chave deixa o leitor de §5 resolver pelo fundamento — e
     * mantém intacto o hash de todo pacote que não tem keyword resolvida.
     */
    keywordContext: keywordContext.principal ? keywordContext : null,
    observedAt: entrada.observedAt,
  });
  if (!resolucao.ok) return { ok: false, code: "radar_bundle_unavailable", reason: resolucao.reason };

  const readiness = radarPlannerHandoffReadiness({
    article: entrada.article,
    frozen: payload.finalizedBundle,
    dossier: resolucao.bundle,
    stale: false,
  });

  return {
    ok: true,
    dossier: {
      analysis: entrada.analysis,
      article: entrada.article,
      profile,
      blueprintView,
      bundle: resolucao.bundle,
      authorities: autoridades,
      keywordContext,
      readiness,
    },
  };
}

/* ==================== §6 · a alcançabilidade da evidência ==================== */

export type RadarResolvedEvidence = {
  ref: string;
  label: string;
  /** Onde, DENTRO do bundle entregue, esta evidência está. */
  locator: "observed.concepts" | "observed.questions" | "observed.gaps";
  pages: number;
  sampleSize: number;
  evidence: string;
};

/**
 * ===== §6 · TODO `evidenceRef` DO BLUEPRINT RESOLVE NO DOSSIÊ ENTREGUE =====
 *
 * ==================== O QUE ESTA FUNÇÃO IMPEDE ====================
 *
 * As seções do artigo-modelo apontam para a evidência por ID. Se aquele id não
 * tiver correspondência no que o Planejador recebe, ele lê uma seção que diz
 * "sustentada pela amostra" e não tem como ver por quê — e a única saída dele
 * seria acreditar.
 *
 * ==================== POR QUE A RESOLUÇÃO É POR RÓTULO ====================
 *
 * O id do candidato é um hash de `conceptId|rótulo`, calculado dentro do
 * blueprint editorial. Ele não é reversível, e recalculá-lo aqui duplicaria a
 * fórmula — que é a primeira coisa a divergir quando um dos dois lados mudar.
 *
 * O que ATRAVESSA os dois lados é o `observedLabel` do candidato, que é o
 * rótulo canônico do conceito. É por ele que a ponte é feita: o ref aponta
 * para um candidato, o candidato nomeia o conceito, e o conceito está dentro
 * de `bundle.observed` — que é exatamente o que o Planejador recebe.
 */
export function radarCanonicalEvidenceIndex(dossier: RadarCanonicalDossier): Map<string, RadarResolvedEvidence> {
  const indice = new Map<string, RadarResolvedEvidence>();
  const observado = dossier.bundle.observed;
  const candidatos = dossier.authorities?.google?.articleModel.candidates || [];
  if (!observado) return indice;

  const normalizar = (valor: string) => valor
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const conceitos = new Map(observado.concepts.all.map(item => [normalizar(item.canonicalLabel), item]));
  const perguntas = new Map(observado.questions.map(item => [normalizar(item.canonicalQuestion), item]));
  const lacunas = new Map(observado.gaps.map(item => [normalizar(item.subject), item]));

  for (const candidato of candidatos) {
    const chave = normalizar(candidato.observedLabel);

    const conceito = conceitos.get(chave);
    if (conceito) {
      indice.set(candidato.id, {
        ref: candidato.id, label: conceito.canonicalLabel, locator: "observed.concepts",
        pages: conceito.sourceCount, sampleSize: conceito.sampleSize, evidence: conceito.evidence,
      });
      continue;
    }

    const pergunta = perguntas.get(chave);
    if (pergunta) {
      indice.set(candidato.id, {
        ref: candidato.id, label: pergunta.canonicalQuestion, locator: "observed.questions",
        pages: pergunta.pages, sampleSize: pergunta.sampleSize, evidence: pergunta.evidence,
      });
      continue;
    }

    const lacuna = lacunas.get(chave);
    if (lacuna) {
      indice.set(candidato.id, {
        ref: candidato.id, label: lacuna.subject, locator: "observed.gaps",
        pages: lacuna.pagesCovering, sampleSize: lacuna.sampleSize, evidence: lacuna.evidence,
      });
    }
  }

  return indice;
}

export function radarCanonicalResolveEvidenceRef(
  dossier: RadarCanonicalDossier,
  ref: string,
): RadarResolvedEvidence | null {
  return radarCanonicalEvidenceIndex(dossier).get(ref) ?? null;
}
