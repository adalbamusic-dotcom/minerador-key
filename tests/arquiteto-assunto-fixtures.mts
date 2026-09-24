/**
 * Fixtures do Assunto no Arquiteto (SDD 2026-09-24, F2 fase B).
 *
 * Dados puros: linhas da mesa como o Arquiteto as tem (`masterList`), com o
 * pacote aprovado dentro de `canonicalWorkflow.payload.approvedDna`, e as
 * entradas de referência da formação, do motor e da portaria SEM Assunto —
 * as mesmas que geraram os hashes dourados capturados com o código anterior à
 * fase B. Timestamps sempre com `+00:00`, como o PostgREST devolve.
 */

export const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
export const OUTRA_MARCA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
export const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";

export const ASSUNTO_ID = "kw-seo-para-clinicas";
export const ASSUNTO_FRASE = "SEO para clínicas";
export const ASSUNTO_NOTA = "Serviço para donas de clínicas de estética que querem atrair pacientes pelo Google.";
export const LISTA_CLINICAS = "lista-clinicas";

type Semantic = Record<string, unknown>;

/** Volume do Google Ads medido e com data: é o "Volume validado" do pacote. */
export const VOLUME_VALIDADO: Semantic = {
  volume_measurement: { provider: "google_ads", averageMonthlySearches: 320, measuredAt: "2026-09-20T10:00:00+00:00" },
};

export function declarado(note: string | null = ASSUNTO_NOTA, destinationUrl: string | null = null): Semantic {
  return {
    keyword_subject: { declared: true, note, destinationUrl, destinationCheck: null },
    keyword_subject_actor: ATOR,
    keyword_subject_at: "2026-09-24T09:00:00+00:00",
    keyword_subject_origin: "review",
  };
}

export function logica(input: { entity?: string | null; intent?: string | null; funnel?: string | null } = {}): Semantic {
  return {
    dna_origem: "logico_deterministico",
    ...(input.entity ? { entidade_central: input.entity } : {}),
    ...(input.intent ? { intencao_principal: input.intent } : {}),
    ...(input.funnel ? { funnel: input.funnel } : {}),
  };
}

export type LinhaDaMesa = Record<string, unknown> & { id: string; keyword: string };

/**
 * Uma linha da mesa com pacote aprovado. `received: false` tira o item de
 * workflow (keyword que não chegou ao Arquiteto); `semPacote` deixa o item
 * sem `approvedDna` (em revisão).
 */
export function linhaDaMesa(input: {
  id: string;
  keyword: string;
  semantic?: Semantic;
  brandId?: string;
  listaId?: string | null;
  version?: number;
  contentHash?: string;
  received?: boolean;
  semPacote?: boolean;
}): LinhaDaMesa {
  const brandId = input.brandId ?? MARCA;
  const semantic = input.semantic ?? {};
  const approvedDna = {
    schemaVersion: "v1",
    keywordId: input.id,
    brandId,
    keyword: input.keyword,
    intent: null,
    volumeSearch: null,
    resultsAllintitle: null,
    kgrScore: null,
    listaId: input.listaId ?? null,
    analiseSemantica: semantic,
    approvedAt: "2026-09-24T09:30:00+00:00",
    approvedBy: ATOR,
    version: input.version ?? 1,
    contentHash: input.contentHash ?? `pkg-${input.id}-v${input.version ?? 1}`,
  };
  return {
    id: input.id,
    keyword: input.keyword,
    brand_id: brandId,
    lista_id: input.listaId ?? null,
    status: "aprovado",
    clusterId: null,
    analise_semantica: semantic,
    ...(input.received === false ? {} : {
      canonicalWorkflow: {
        id: `wf-${input.id}`,
        state: "received",
        payload: {
          brandId,
          keywordId: input.id,
          source: "MINERADOR",
          state: "received",
          ...(input.semPacote ? { approvedDna: null } : { approvedDna }),
        },
      },
    }),
  };
}

/* --------------------------- formação de referência --------------------------- */

export const SILO_REF = "territory:skin-care";

export function kwFormacao(keywordId: string, keyword: string, extra: Record<string, unknown> = {}) {
  return {
    keywordId,
    keyword,
    intent: "Informativa",
    volume: 100,
    kgr: 0.2,
    entity: null,
    semanticState: "conclusive" as const,
    modifiers: [] as string[],
    problem: null,
    isPublished: false,
    ...extra,
  };
}

/** Entrada da formação sem Assunto, com grupo humano, grupo do motor, publicado e sobra. */
export function formacaoDeReferencia() {
  return {
    siloRef: SILO_REF,
    siloLabel: "Skin care",
    siloSlug: "skin-care",
    groups: [{ principalKeywordId: "k3", keywordIds: ["k3", "k4"] }],
    keywords: [
      kwFormacao("k1", "skin care para pele oleosa", { humanFormationRef: "formation:human-1", humanRole: "principal" }),
      kwFormacao("k2", "skin care pele oleosa masculina", { humanFormationRef: "formation:human-1", humanRole: "reforco" }),
      kwFormacao("k3", "rotina noturna skin care", { volume: 400, entity: "rotina noturna" }),
      kwFormacao("k4", "rotina skin care noite", { volume: 90, entity: "rotina noturna" }),
      kwFormacao("k5", "protetor solar com cor", { intent: "Comercial", volume: 700 }),
      kwFormacao("k6", "protetor solar colorido para pele", { intent: "Comercial", volume: 300 }),
      kwFormacao("k7", "acido hialuronico serum", { intent: "Transacional", volume: 50 }),
      kwFormacao("k8", "limpeza de pele profunda", { volume: 1200 }),
    ],
    publishedArticles: [{ normalizedUrl: "https://exemplo.com.br/skin-care/limpeza-de-pele-profunda", path: "/skin-care/limpeza-de-pele-profunda", label: "limpeza de pele profunda", canonical: null, matchedKeywordId: null }],
  };
}

/** Entrada do motor legado sem Assunto. */
export function motorDeReferencia() {
  const kw = (id: string, keyword: string, extra: Record<string, unknown> = {}) => ({
    id, keyword, intent: "Informativa", volume_search: 100, results_allintitle: 30, kgr_score: 0.3, lista_id: LISTA_CLINICAS,
    analise_semantica: { entidade_central: "clínica" }, ...extra,
  });
  return [
    kw("m1", "marketing para clinicas", { volume_search: 900 }),
    kw("m2", "marketing para clinicas de estetica", { volume_search: 300 }),
    kw("m3", "como atrair pacientes para clinica"),
    kw("m4", "agendamento online consultorio", { intent: "Transacional" }),
    kw("m5", "google meu negocio para consultorio", { intent: "Comercial" }),
  ];
}
