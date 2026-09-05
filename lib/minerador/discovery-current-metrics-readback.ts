export const DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE = 100;

type CurrentMetricsReadResult<Row> = {
  data: Row[] | null;
  error: unknown;
};

export function chunkDiscoveryCandidateIds(
  candidateIds: readonly string[],
  chunkSize = DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE,
) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError("DISCOVERY_CURRENT_METRICS_INVALID_CHUNK_SIZE");
  const chunks: string[][] = [];
  for (let index = 0; index < candidateIds.length; index += chunkSize) {
    chunks.push(candidateIds.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function readDiscoveryCurrentMetricsInChunks<Row extends { candidate_id?: unknown }>(input: {
  candidateIds: readonly string[];
  readChunk: (candidateIds: readonly string[]) => Promise<CurrentMetricsReadResult<Row>>;
  chunkSize?: number;
}) {
  const rowsByCandidateId = new Map<string, Row>();
  const chunks = chunkDiscoveryCandidateIds(input.candidateIds, input.chunkSize);

  for (const candidateIds of chunks) {
    const result = await input.readChunk(candidateIds);
    if (result.error) throw result.error;
    for (const row of result.data || []) {
      const candidateId = typeof row.candidate_id === "string" ? row.candidate_id : "";
      if (candidateId && !rowsByCandidateId.has(candidateId)) rowsByCandidateId.set(candidateId, row);
    }
  }

  return {
    rows: [...rowsByCandidateId.values()],
    chunkCount: chunks.length,
  };
}
