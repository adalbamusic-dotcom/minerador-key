import { runLocalWorkerOnce, type ExternalProcessingJob } from "../lib/server/local-worker/runner";
import { runLocalWorkerContinuously } from "../lib/server/local-worker/continuous";
import { createCanonicalServiceClient } from "../lib/server/canonical-authorization";
import { createRadarExpertContributionWorkerProcessor } from "../lib/server/local-worker/radar-expert-contribution";
import { createRadarVideoTextWorkerProcessor } from "../lib/server/local-worker/radar-video-text";
import { isTenantId } from "../lib/tenant-routing";

/**
 * O WORKER LOCAL — dois modos, um só worker.
 *
 *   pnpm run local-worker        serviço contínuo: pega job, processa, pega o
 *                                próximo, e espera quando a fila esvazia
 *   pnpm run local-worker:once   uma execução, um job — o modo de homologação,
 *                                preservado com a trava LOCAL_WORKER_RUN=1
 *
 * O MESMO ARQUIVO SERVE AOS DOIS de propósito. Um segundo script duplicaria a
 * validação de ambiente, a escolha do ator e — pior — o roteamento por
 * `job_kind`. Foi exatamente esse tipo de duplicação que deixou o processor de
 * vídeo existindo, testado e não LIGADO, com a fonte parada em `QUEUED`.
 *
 * ENV: o script carrega `.env` e `.env.local` pelo próprio Node
 * (`--env-file-if-exists`), na mesma ordem de precedência que o Next usa. Quem
 * opera não exporta segredo à mão; a configuração server-side do repositório é
 * a autoridade, e o ambiente do shell continua vencendo o arquivo quando
 * alguém precisa sobrepor deliberadamente.
 *
 * NADA AQUI IMPRIME SEGREDO. As checagens abaixo falam de NOMES de variáveis.
 */

const continuo = process.argv.includes("--continuous");
const workerId = process.env.LOCAL_WORKER_ID?.trim() || `local-worker-${process.pid}`;
const actorUserId = process.env.LOCAL_WORKER_ACTOR_USER_ID?.trim() || "";

/**
 * O QUE FALTA, DITO ANTES DE TENTAR.
 *
 * `createCanonicalServiceClient` lança `REMOTE_UNAVAILABLE` com uma frase que
 * não diz QUAL variável falta — foi assim que o smoke parou sem saber o que
 * configurar. Aqui a recusa nomeia as ausentes, e só os nomes.
 */
function configuracaoAusente(): string[] {
  return ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(nome => !process.env[nome]?.trim());
}

/**
 * O ATOR É EXPLÍCITO, E PRECISA SER UM DE VERDADE.
 *
 * O smoke passou literalmente `SEU_AUTH_USER_ID` — um placeholder — e o worker
 * o teria levado até o claim, onde falharia como se fosse problema de
 * autorização. Um UUID inválido é erro de OPERAÇÃO, e é aqui que ele aparece.
 *
 * E ele não é adivinhado: nada de "primeiro usuário do banco" nem de dono
 * arbitrário. Quem roda o worker declara em nome de quem está rodando.
 *
 * No modo contínuo esta validação acontece ANTES do laço: um worker que roda
 * para sempre com ator inválido falharia em cada volta, para sempre.
 */
function atorInvalido(valor: string): string | null {
  if (!valor) return "LOCAL_WORKER_ACTOR_USER_ID não configurado";
  if (!isTenantId(valor)) return "LOCAL_WORKER_ACTOR_USER_ID não é um UUID válido (parece um placeholder)";
  return null;
}

/*
 * A TRAVA DE HOMOLOGAÇÃO CONTINUA SENDO DO MODO `once`.
 *
 * `LOCAL_WORKER_RUN=1` existe para que rodar o script sem querer não consuma
 * um job durante um smoke. O modo contínuo é iniciado por um comando próprio e
 * explícito — pedir a variável ali seria exigir cerimônia para começar um
 * serviço que a pessoa acabou de mandar começar.
 */
if (!continuo && process.env.LOCAL_WORKER_RUN !== "1") {
  console.log("LOCAL_WORKER_RUN=1 não configurado; nenhum job foi executado.");
} else {
  const faltando = configuracaoAusente();
  const problemaDoAtor = atorInvalido(actorUserId);

  if (faltando.length) {
    console.log(`LOCAL_WORKER_CONFIG_REQUIRED: ${faltando.join(", ")}; nenhum job foi executado.`);
  } else if (problemaDoAtor) {
    console.log(`LOCAL_WORKER_ACTOR_USER_ID_REQUIRED: ${problemaDoAtor}; nenhum job foi executado.`);
  } else {
    const client = createCanonicalServiceClient();
    /*
     * UMA FILA, DOIS SUJEITOS — e o roteamento é por `job_kind`.
     *
     * O processor de vídeo existia, estava testado e NÃO estava ligado aqui: um
     * job de vídeo era reclamado pelo processor do Especialista e voltava
     * `BLOCKED` com `RADAR_WORKER_JOB_KIND_UNSUPPORTED`. A fonte ficava em
     * `QUEUED` para sempre.
     *
     * O teste que faltava não era sobre o processor existir — era sobre ele
     * estar LIGADO. Estar injetável e estar injetado são coisas diferentes.
     */
    const especialista = createRadarExpertContributionWorkerProcessor({ actorUserId, client });
    const video = createRadarVideoTextWorkerProcessor({ actorUserId, client });
    const processor = (job: ExternalProcessingJob) =>
      job.job_kind === "radar_video_text_acquisition" ? video(job) : especialista(job);

    if (!continuo) {
      const result = await runLocalWorkerOnce({ workerId, processor, client });
      console.log(JSON.stringify({ status: result.status, jobId: result.job?.id || null }));
    } else {
      /*
       * ENCERRAMENTO COOPERATIVO.
       *
       * O sinal não interrompe um job em andamento: ele impede o PRÓXIMO
       * claim. Matar o processo no meio devolveria a fonte ao limbo com o lease
       * ainda válido — ninguém mais poderia reivindicá-la até ele expirar.
       *
       * Dois sinais seguidos continuam matando o processo pelo caminho normal
       * do Node: quem precisa sair agora não fica refém do próprio worker.
       */
      const parada = new AbortController();
      let pedidoDeParada = false;
      for (const sinal of ["SIGINT", "SIGTERM"] as const) {
        process.on(sinal, () => {
          if (pedidoDeParada) return;
          pedidoDeParada = true;
          console.log(`\n${sinal} recebido; encerrando após o job atual. Nenhum job novo será reivindicado.`);
          parada.abort();
        });
      }

      console.log(`local-worker contínuo iniciado · workerId=${workerId} · aguardando jobs (Ctrl+C para encerrar).`);
      const relatorio = await runLocalWorkerContinuously({
        workerId, processor, client,
        signal: parada.signal,
        onCycle: ({ status, job }) => {
          /* Fila vazia é o estado normal e não merece uma linha por volta. */
          if (status === "EMPTY") return;
          console.log(JSON.stringify({ status, jobId: job?.id || null, jobKind: job?.job_kind || null }));
        },
      });
      console.log(JSON.stringify({ encerrado: true, ...relatorio }));
    }
  }
}
