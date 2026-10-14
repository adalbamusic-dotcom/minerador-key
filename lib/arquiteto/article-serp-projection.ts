/**
 * ===== PARECER DE SERP DA FORMAÇÃO EM PROJEÇÃO (2026-10-14) =====
 *
 * SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 4, F2. Medido em 2026-10-13: `GET /api/arquiteto/workspace` devolvia
 * os 200 pareceres da AdalbaPro inteiros (9,8 MB) — 3,6 MB de cópias do
 * KeywordDNA (`keywordDnaReferences[].sourceKeywordSnapshot`) e 3,7 MB de SERP
 * bruta (`snapshots[]`: snippet, título, SERP features, "as pessoas também
 * perguntam", diagnóstico do provider).
 *
 * A mesa do Arquiteto lê do parecer só isto, e é isto que a projeção mantém:
 *
 * - tudo fora de `assessment` (base, veredito, `interpretation` inteira com o
 *   marcador das 4 lentes, decisão humana, proveniência, `snapshotIds`);
 * - de `assessment`, todos os campos escalares e `formationEvidence`,
 *   `recommendations`, `notes`, `conflicts`, `queriedKeywordDnaIds`,
 *   `dominantResultTypes`, `supportBasis` e qualquer campo que não seja um
 *   dos dois pesados abaixo;
 * - `snapshots[]`: os campos escalares de cada consulta (id, keyword, versão,
 *   hash, data…) e de cada resultado orgânico só `url`, `domain` e `position`
 *   — o que a canibalização confronta e o que a prioridade da evidência conta
 *   (`organicResults.length`);
 * - `keywordDnaReferences[]`: identidade, versão, data e, do KeywordDNA, só
 *   `searchIntent` e `originalIntentLabel` (a "intenção esperada" do veredito).
 *
 * Parecer SEM `interpretation` (gravado antes do campo legível) NÃO é
 * projetado: a tela o reconstrói dos resultados orgânicos completos
 * (`articleSerpParecerFromAssessment`), e cortá-los mudaria o parecer.
 *
 * O parecer inteiro continua no banco e é lido pelo servidor em toda escrita
 * (o registro gravado nunca nasce do que a tela tem) e pela exportação do
 * Arquiteto (`serpDetail=full`). Domínio puro: sem rede, sem storage.
 */

export const ARTICLE_FORMATION_SERP_LIST_DETAIL = "list" as const;

type Registro = Record<string, unknown>;

const isRecord = (value: unknown): value is Registro => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isScalar = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

function slimOrganic(result: unknown): unknown {
  if (!isRecord(result)) return result;
  const slim: Registro = {};
  for (const key of ["url", "domain", "position"] as const) if (key in result) slim[key] = result[key];
  return slim;
}

function slimSnapshot(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return snapshot;
  const slim: Registro = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "organicResults") slim.organicResults = Array.isArray(value) ? value.map(slimOrganic) : value;
    else if (isScalar(value)) slim[key] = value;
  }
  return slim;
}

function slimKeywordDnaReference(reference: unknown): unknown {
  if (!isRecord(reference)) return reference;
  const slim: Registro = {};
  for (const [key, value] of Object.entries(reference)) {
    if (key === "sourceKeywordSnapshot") continue;
    if (key === "payload") {
      if (!isRecord(value)) { slim.payload = value; continue; }
      const dna: Registro = {};
      for (const campo of ["searchIntent", "originalIntentLabel"] as const) if (campo in value) dna[campo] = value[campo];
      slim.payload = dna;
      continue;
    }
    slim[key] = value;
  }
  return slim;
}

/** O payload do parecer na forma da LISTA, ou o próprio payload quando não pode ser projetado. */
export function projectArticleFormationSerpPayload<T>(payload: T): { payload: T; projected: boolean } {
  if (!isRecord(payload) || !isRecord(payload.assessment) || !isRecord(payload.interpretation)) return { payload, projected: false };
  const assessment = payload.assessment;
  const projetado: Registro = {};
  for (const [key, value] of Object.entries(assessment)) {
    if (key === "snapshots") projetado.snapshots = Array.isArray(value) ? value.map(slimSnapshot) : value;
    else if (key === "keywordDnaReferences") projetado.keywordDnaReferences = Array.isArray(value) ? value.map(slimKeywordDnaReference) : value;
    else projetado[key] = value;
  }
  return { payload: { ...payload, assessment: projetado } as T, projected: true };
}

/** O registro remoto (`{ candidateRef, payload, … }`) projetado, com `detail: "list"` quando cortado. */
export function projectArticleFormationSerpRecord<R extends { payload: unknown }>(record: R): R & { detail?: typeof ARTICLE_FORMATION_SERP_LIST_DETAIL } {
  const { payload, projected } = projectArticleFormationSerpPayload(record.payload);
  return projected ? { ...record, payload, detail: ARTICLE_FORMATION_SERP_LIST_DETAIL } : record;
}
