import { parseKeywordSemanticQualification, type KeywordSemanticQualification } from "./keyword-semantic-qualification.ts";

/**
 * Seleção da Qualificação Semântica vigente em duas etapas (E7, correção 3).
 *
 * Antes, cada leitura baixava o payload de TODAS as versões das keywords e
 * ficava com a primeira válida por entidade. Agora:
 *
 * 1. o chamador lê só metadados (`version_id`, `entity_id`, `version_number`),
 *    filtrados por Marca e `artifact_type`;
 * 2. este módulo pede o payload apenas da maior versão de cada entidade, por
 *    `version_id`, em lotes de QUALIFICATION_PAYLOAD_BATCH_SIZE (50);
 * 3. a entidade cuja versão falhar na validação (parse, `brandId` ou
 *    `keywordId` divergentes) recebe a versão anterior, buscada sob demanda,
 *    até achar uma válida ou acabar o histórico.
 *
 * O resultado é o mesmo da seleção antiga para toda entrada, inclusive a ordem
 * de inserção do Map: a posição de cada entidade segue a posição da versão
 * escolhida na lista de metadados, que vem na mesma ordem da consulta antiga.
 * O módulo não acessa rede: a leitura dos payloads é injetada pelo chamador,
 * que mantém o filtro por Marca.
 */

/**
 * `version_id` tem 107 caracteres (`keyword_semantic_qualification:<brand>:<keyword>:vN`).
 * Lotes de 50 mantêm a URL do `.in` perto de 5,5 kB, abaixo dos ~6 kB que a
 * leitura por `entity_id` de 158 keywords já usa hoje sem erro.
 */
export const QUALIFICATION_PAYLOAD_BATCH_SIZE = 50;

export type QualificationVersionMetadataRow = {
  version_id?: unknown;
  entity_id?: unknown;
  version_number?: unknown;
};

export type QualificationVersionPayloadRow = {
  version_id?: unknown;
  payload?: unknown;
};

type Candidate = { versionId: string; versionNumber: number; position: number };

/**
 * O schema declara `version_number integer NOT NULL CHECK (> 0)` e
 * `UNIQUE (marca_id, artifact_type, entity_id, version_number)` (migration
 * 0027), então nulo e empate não ocorrem. Mesmo assim, nulo segue o
 * `ORDER BY version_number DESC` da consulta, que no Postgres é NULLS FIRST:
 * `Number(null)` daria 0 e mudaria a posição da versão.
 */
function versionNumberOf(value: unknown): number {
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY;
}

/**
 * Validação única do payload de uma versão contra a linha consultada: parse
 * do próprio Minerador, Marca e keyword. Usada pela seleção e pelo cache do
 * navegador (E8), para que um payload vindo do cache passe pelo mesmo crivo.
 */
export function acceptQualificationPayload(input: {
  brandId: string;
  entityId: string;
  payload: unknown;
}): KeywordSemanticQualification | null {
  const entityId = input.entityId;
  const parsed = parseKeywordSemanticQualification(input.payload);
  // Tenant defensivo: o payload precisa concordar com a linha consultada.
  return parsed && parsed.brandId === input.brandId && parsed.keywordId === entityId ? parsed : null;
}

export type QualificationVersionPayloadReader = (versionIds: string[]) => Promise<readonly QualificationVersionPayloadRow[]>;

export async function resolveCurrentKeywordSemanticQualifications(input: {
  brandId: string;
  metadata: readonly QualificationVersionMetadataRow[];
  readPayloads: QualificationVersionPayloadReader;
  batchSize?: number;
}): Promise<Map<string, KeywordSemanticQualification>> {
  const selected = await selectCurrentKeywordSemanticQualificationVersions(input);
  return new Map([...selected.entries()].map(([entityId, value]) => [entityId, value.qualification]));
}

/**
 * Mesma seleção, devolvendo também o `version_id` escolhido por entidade.
 * A ordem de inserção é a mesma de `resolveCurrentKeywordSemanticQualifications`.
 */
export async function selectCurrentKeywordSemanticQualificationVersions(input: {
  brandId: string;
  metadata: readonly QualificationVersionMetadataRow[];
  readPayloads: QualificationVersionPayloadReader;
  batchSize?: number;
}): Promise<Map<string, { qualification: KeywordSemanticQualification; versionId: string }>> {
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? QUALIFICATION_PAYLOAD_BATCH_SIZE));
  const candidatesByEntity = new Map<string, Candidate[]>();
  input.metadata.forEach((row, position) => {
    const entityId = typeof row.entity_id === "string" ? row.entity_id : "";
    const versionId = typeof row.version_id === "string" ? row.version_id : "";
    if (!entityId || !versionId) return;
    const candidates = candidatesByEntity.get(entityId) || [];
    candidates.push({ versionId, versionNumber: versionNumberOf(row.version_number), position });
    candidatesByEntity.set(entityId, candidates);
  });
  // Maior versão primeiro; empate (não ocorre: versão única por entidade)
  // preserva a ordem recebida, como a consulta antiga.
  for (const candidates of candidatesByEntity.values()) {
    candidates.sort((left, right) => (right.versionNumber - left.versionNumber) || (left.position - right.position));
  }

  const cursor = new Map<string, number>();
  const chosen = new Map<string, { qualification: KeywordSemanticQualification; versionId: string; position: number }>();
  let pending = [...candidatesByEntity.keys()];
  while (pending.length > 0) {
    const wanted = pending.map(entityId => ({ entityId, candidate: candidatesByEntity.get(entityId)![cursor.get(entityId) || 0] }));
    const payloads = new Map<string, unknown>();
    const versionIds = wanted.map(item => item.candidate.versionId);
    for (let start = 0; start < versionIds.length; start += batchSize) {
      const batch = versionIds.slice(start, start + batchSize);
      // Só as versões pedidas são consultadas depois: linha extra é ignorada.
      for (const row of await input.readPayloads(batch)) {
        if (typeof row.version_id === "string") payloads.set(row.version_id, row.payload);
      }
    }
    const next: string[] = [];
    for (const { entityId, candidate } of wanted) {
      const parsed = payloads.has(candidate.versionId)
        ? acceptQualificationPayload({ brandId: input.brandId, entityId, payload: payloads.get(candidate.versionId) })
        : null;
      if (parsed) {
        chosen.set(entityId, { qualification: parsed, versionId: candidate.versionId, position: candidate.position });
        continue;
      }
      const nextIndex = (cursor.get(entityId) || 0) + 1;
      if (nextIndex < candidatesByEntity.get(entityId)!.length) {
        cursor.set(entityId, nextIndex);
        next.push(entityId);
      }
    }
    pending = next;
  }

  return new Map(
    [...chosen.entries()]
      .sort((left, right) => left[1].position - right[1].position)
      .map(([entityId, value]) => [entityId, { qualification: value.qualification, versionId: value.versionId }]),
  );
}
