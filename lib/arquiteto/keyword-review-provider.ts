import { z } from "zod";

const recordOf = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const stringArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
  : [];

const nullableString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

const normalizedToken = (value: unknown) => typeof value === "string" ? value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, "_") : value;

const normalizedAction = (value: unknown) => {
  const token = normalizedToken(value);
  const aliases: Record<string, string> = {
    manter: "manter_no_artigo",
    manter_grupo: "manter_no_artigo",
    manter_no_grupo: "manter_no_artigo",
    manter_no_artigo_atual: "manter_no_artigo",
    manter_na_posicao_atual: "manter_no_artigo",
    validar_agrupamento: "manter_no_artigo",
    agrupamento_valido: "manter_no_artigo",
    manter_silo: "manter_no_artigo",
    keep: "manter_no_artigo",
    keep_in_article: "manter_no_artigo",
    mover: "mover_para_artigo",
    mover_keyword: "mover_para_artigo",
    mover_para_outro_artigo: "mover_para_artigo",
    realocar_para_artigo: "mover_para_artigo",
    realocar_keyword: "mover_para_artigo",
    reatribuir_artigo: "mover_para_artigo",
    move_to_article: "mover_para_artigo",
    anexar_ao_publicado: "reforcar_publicado",
    adicionar_ao_publicado: "reforcar_publicado",
    incorporar_ao_publicado: "reforcar_publicado",
    fortalecer_publicado: "reforcar_publicado",
    reforcar: "reforcar_publicado",
    attach_to_published: "reforcar_publicado",
    criar_artigo: "criar_novo_artigo",
    criar_artigo_novo: "criar_novo_artigo",
    separar_em_novo_artigo: "criar_novo_artigo",
    desmembrar_em_novo_artigo: "criar_novo_artigo",
    novo_artigo: "criar_novo_artigo",
    create_article: "criar_novo_artigo",
  };
  return typeof token === "string" ? aliases[token] || token : token;
};

const allowedActions = new Set(["manter_no_artigo", "mover_para_artigo", "reforcar_publicado", "criar_novo_artigo"]);

const normalizedRole = (value: unknown) => {
  const token = normalizedToken(value);
  const aliases: Record<string, string> = {
    primary: "principal",
    primaria: "principal",
    secondary: "secundaria",
    secundario: "secundaria",
    reinforcement: "reforco_narrativo",
    narrative_reinforcement: "reforco_narrativo",
    reforco: "reforco_narrativo",
  };
  return typeof token === "string" ? aliases[token] || token : token;
};

const normalizedConfidence = (value: unknown) => {
  const numeric = typeof value === "string" ? Number(value.replace(",", ".").replace("%", "")) : value;
  return typeof numeric === "number" && numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
};

const normalizedPlacement = (value: unknown) => {
  const placement = recordOf(value);
  const action = normalizedToken(placement?.action);
  if (!placement || action === "manter_silo" || action === "manter") return undefined;
  return {
    action,
    siloId: nullableString(placement.siloId ?? placement.silo_id),
    siloName: nullableString(placement.siloName ?? placement.silo_name),
    newSiloKey: nullableString(placement.newSiloKey ?? placement.new_silo_key),
  };
};

export function normalizeKeywordReviewProviderResponse(value: unknown): unknown {
  const initial = recordOf(value);
  if (!initial) return value;
  const wrapped = [initial.review, initial.result, initial.data]
    .map(recordOf)
    .find(candidate => [candidate?.decisions, candidate?.decisoes, candidate?.operations, candidate?.recommendations]
      .some(source => Array.isArray(source) || Boolean(recordOf(source))));
  const root = wrapped || initial;
  const decisionSource = root.decisions ?? root.decisoes ?? root.operations ?? root.recommendations;
  const rawDecisions = Array.isArray(decisionSource)
    ? decisionSource.map(item => ({ key: null, value: item }))
    : recordOf(decisionSource)
      ? Object.entries(recordOf(decisionSource)!).map(([key, item]) => ({ key, value: item }))
      : [];
  const rawConflicts = Array.isArray(root.conflicts) ? root.conflicts : Array.isArray(root.conflitos) ? root.conflitos : [];

  return {
    decisions: rawDecisions.map(item => {
      const decision = recordOf(item.value) || {};
      const humanPoints = stringArray(decision.humanDecisionPoints ?? decision.human_decision_points);
      const rawAction = decision.action ?? decision.recommendation ?? decision.decision;
      const action = normalizedAction(rawAction);
      const actionIsKnown = typeof action === "string" && allowedActions.has(action);
      const rawActionLabel = typeof rawAction === "string" && rawAction.trim() ? rawAction.trim().slice(0, 120) : "valor ausente";
      return {
        keywordId: decision.keywordId ?? decision.keyword_id ?? item.key,
        sourceGroupId: decision.sourceGroupId ?? decision.source_group_id,
        action: actionIsKnown ? action : "manter_no_artigo",
        providerWarning: actionIsKnown ? undefined : `A IA devolveu a acao nao reconhecida "${rawActionLabel}"; a distribuicao logica foi mantida por seguranca.`,
        targetGroupId: nullableString(decision.targetGroupId ?? decision.target_group_id ?? decision.targetArticleId ?? decision.target_article_id),
        newArticleKey: nullableString(decision.newArticleKey ?? decision.new_article_key),
        suggestedRole: normalizedRole(decision.suggestedRole ?? decision.suggested_role ?? decision.role ?? decision.papel),
        siloPlacement: normalizedPlacement(decision.siloPlacement ?? decision.silo_placement),
        justification: decision.justification ?? decision.justificativa ?? decision.reason ?? decision.motivo,
        confidence: normalizedConfidence(decision.confidence ?? decision.confianca ?? decision.score),
        humanDecision: nullableString(decision.humanDecision ?? decision.human_decision ?? humanPoints[0]),
      };
    }),
    conflicts: rawConflicts.map(item => {
      const conflict = recordOf(item) || {};
      return {
        keywordIds: stringArray(conflict.keywordIds ?? conflict.keyword_ids ?? conflict.entityIds ?? conflict.entity_ids),
        reason: conflict.reason ?? conflict.motivo ?? conflict.justification ?? conflict.justificativa,
      };
    }),
    summary: nullableString(root.summary ?? root.resumo) ?? "Revisao de distribuicao concluida.",
  };
}

export const CompactProviderResponseSchema = z.preprocess(normalizeKeywordReviewProviderResponse, z.object({
  decisions: z.array(z.object({
    keywordId: z.string().min(1),
    sourceGroupId: z.string().min(1).optional(),
    action: z.enum(["manter_no_artigo", "mover_para_artigo", "reforcar_publicado", "criar_novo_artigo"]),
    targetGroupId: z.string().min(1).nullable().optional(),
    newArticleKey: z.string().min(1).nullable().optional(),
    suggestedRole: z.enum(["principal", "secundaria", "reforco_narrativo"]).optional(),
    siloPlacement: z.object({
      action: z.enum(["usar_silo_existente", "propor_novo_silo"]),
      siloId: z.string().min(1).nullable().optional(),
      siloName: z.string().min(1).nullable().optional(),
      newSiloKey: z.string().min(1).nullable().optional(),
    }).optional(),
    justification: z.string().min(1).max(2000).optional(),
    confidence: z.coerce.number().min(0).max(1).optional(),
    humanDecision: z.string().min(1).max(400).nullable().optional(),
    providerWarning: z.string().min(1).max(400).optional(),
  })).min(1).max(40),
  conflicts: z.array(z.object({
    keywordIds: z.array(z.string().min(1)).default([]),
    reason: z.string().min(1).max(600),
  })).max(12).default([]),
  summary: z.string().min(1).max(5000),
}));

export type CompactProviderResponse = z.infer<typeof CompactProviderResponseSchema>;
