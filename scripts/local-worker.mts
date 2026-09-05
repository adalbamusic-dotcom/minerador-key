import { runLocalWorkerOnce } from "../lib/server/local-worker/runner";
import { createCanonicalServiceClient } from "../lib/server/canonical-authorization";
import { createRadarExpertContributionWorkerProcessor } from "../lib/server/local-worker/radar-expert-contribution";

const workerId = process.env.LOCAL_WORKER_ID?.trim() || `local-worker-${process.pid}`;
const actorUserId = process.env.LOCAL_WORKER_ACTOR_USER_ID?.trim() || "";

if (process.env.LOCAL_WORKER_RUN !== "1") {
  console.log("LOCAL_WORKER_RUN=1 não configurado; nenhum job foi executado.");
} else if (!actorUserId) {
  console.log("LOCAL_WORKER_ACTOR_USER_ID não configurado; nenhum job foi executado.");
} else {
  const client = createCanonicalServiceClient();
  const processor = createRadarExpertContributionWorkerProcessor({ actorUserId, client });
  const result = await runLocalWorkerOnce({ workerId, processor, client });
  console.log(JSON.stringify({ status: result.status, jobId: result.job?.id || null }));
}
