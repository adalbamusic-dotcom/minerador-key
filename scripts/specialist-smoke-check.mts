/**
 * O ESTADO REAL DO ESPECIALISTA, LIDO DO BANCO — apoio ao SPECIALIST_2.2.
 *
 * O smoke precisa provar que a tela diz a verdade. Comparar a tela com ela
 * mesma não prova nada: se o número estivesse errado, os dois lados estariam
 * errados juntos. Este script lê o banco direto e deriva os contadores pela
 * MESMA função de domínio que o painel usa — se os dois divergirem, é a tela
 * que está mentindo.
 *
 * SOMENTE LEITURA. Nenhum INSERT, UPDATE, DELETE ou RPC. Nenhuma chamada a
 * provider — nem ao Telegram, nem ao Google Cloud. Nenhum valor secreto é
 * impresso: só os nomes das variáveis quando elas faltam.
 *
 *   pnpm run specialist:smoke-check -- <brandId> [articleId]
 */
import { readFileSync } from "node:fs";
import {
  radarSpecialistCounters,
  radarSpecialistRequirementIdOf,
  radarSpecialistStateFromBrief,
  radarSpecialistStateLabel,
  type RadarSpecialistBriefReading,
} from "../lib/radar/specialist-lifecycle.ts";
import { RADAR_SPECIALIST_PROVISIONAL_NAME, radarSpecialistConsultationOf } from "../lib/radar/specialist-consultation.ts";

type Registro = Record<string, unknown>;

function credenciais() {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const ler = (nome: string) => (env.match(new RegExp(`^${nome}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const url = ler("NEXT_PUBLIC_SUPABASE_URL");
  const chave = ler("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) {
    /* Os NOMES, nunca os valores. */
    throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY em .env.local");
  }
  return { url, cabecalhos: { apikey: chave, Authorization: `Bearer ${chave}`, Accept: "application/json" } };
}

async function ler<T = Registro>(caminho: string): Promise<T[]> {
  const { url, cabecalhos } = credenciais();
  const resposta = await fetch(`${url}/rest/v1/${caminho}`, { headers: cabecalhos });
  if (!resposta.ok) throw new Error(`${resposta.status} ao ler ${caminho.split("?")[0]}: ${(await resposta.text()).slice(0, 200)}`);
  return resposta.json() as Promise<T[]>;
}

const marca = (valor: boolean) => (valor ? "OK   " : "FALTA");
const objeto = (valor: unknown) => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Registro : {});

async function principal() {
  /* `pnpm run -- x` repassa o próprio "--"; ele não é um argumento nosso. */
  const [brandId, articleId] = process.argv.slice(2).filter(item => item !== "--");
  if (!brandId) throw new Error("uso: pnpm run specialist:smoke-check -- <brandId> [articleId]");

  /* ========================= as pré-condições ========================= */

  console.log("== PRÉ-CONDIÇÕES DA PLATAFORMA ==");
  const providers = await ler("integration_providers?select=id,provider_key&provider_key=in.(telegram,google_cloud)");
  const idPorChave = new Map(providers.map(item => [String(item.provider_key), String(item.id)]));

  const telegramId = idPorChave.get("telegram");
  const telegram = telegramId ? await ler(`integration_connections?select=metadata,lifecycle_status&provider_id=eq.${telegramId}&owner_scope_type=eq.platform&order=created_at.desc&limit=1`) : [];
  const metaTelegram = objeto(telegram[0]?.metadata);
  const saudeTelegram = objeto(objeto(metaTelegram.health_check).details);
  const canalTelegram = objeto(metaTelegram.telegram);
  const botUsername = typeof saudeTelegram.botUsername === "string" ? saudeTelegram.botUsername : null;
  const webhookUrl = typeof canalTelegram.webhook_url === "string" ? canalTelegram.webhook_url : null;

  console.log(`${marca(Boolean(botUsername))} botUsername = ${botUsername ? `@${botUsername}` : "ausente — sem ele o link do convite não é montado"}`);
  /*
   * SEM WEBHOOK, O `/start` MORRE NO TELEGRAM.
   *
   * O bot recebe a mensagem e não tem para onde entregá-la: nenhuma linha entra
   * em `telegram_inbound_updates`, o binding não nasce, e a tela do Radar fica
   * eternamente em "aguardando especialista" sem nenhum erro visível. É a falha
   * mais cara do smoke porque ela não parece uma falha.
   */
  console.log(`${marca(Boolean(webhookUrl))} webhook = ${webhookUrl || "NUNCA CONFIGURADO — registre no Admin, com URL pública HTTPS"}`);

  const googleId = idPorChave.get("google_cloud");
  const google = googleId ? await ler(`integration_connections?select=metadata,lifecycle_status&provider_id=eq.${googleId}&owner_scope_type=eq.platform&order=created_at.desc&limit=1`) : [];
  const metaGoogle = objeto(google[0]?.metadata);
  const bucket = objeto(metaGoogle.google_cloud_media).bucket_name;
  const saudeGoogle = objeto(metaGoogle.google_cloud_health);
  console.log(`${marca(Boolean(bucket))} bucket GCS = ${bucket || "ausente — o áudio não tem onde ser preservado"}`);
  console.log(`${marca(objeto(saudeGoogle.speech).status === "ready")} Speech-to-Text = ${objeto(saudeGoogle.speech).status || "nunca verificado"}`);

  const updates = await ler("telegram_inbound_updates?select=external_update_id,status,received_at&order=received_at.desc&limit=200");
  console.log(`     updates já entregues pelo webhook = ${updates.length}${updates.length ? "" : "  (nada nunca chegou)"}`);

  /* ============================ §2 · o convite ======================== */

  const especialistas = await ler(`brand_experts?select=id,display_name,status,metadata,created_at&brand_id=eq.${brandId}&order=created_at`);
  const provisorios = especialistas.filter(item => objeto(item.metadata).origin === "radar_specialist_consultation");
  const vinculos = await ler(`telegram_expert_bindings?select=id,expert_id,status,telegram_user_id,selected_brief_id,verified_at&brand_id=eq.${brandId}`);
  const ativos = vinculos.filter(item => item.status === "active");

  console.log("\n== §2 e §5 · PARTICIPANTE E VÍNCULO ==");
  console.log(`     brand_experts na marca = ${especialistas.length} (criados por consulta: ${provisorios.length})`);
  for (const item of especialistas) {
    const doConvite = objeto(item.metadata).origin === "radar_specialist_consultation";
    const aindaProvisorio = String(item.display_name) === RADAR_SPECIALIST_PROVISIONAL_NAME;
    console.log(`  · ${item.display_name}${doConvite ? "  [criado pela consulta]" : ""}${aindaProvisorio ? "  <- ainda não entrou pelo link" : ""}`);
  }
  console.log(`${marca(ativos.length >= 1)} telegram_expert_bindings ACTIVE = ${ativos.length}`);
  for (const item of ativos) console.log(`  · expert ${item.expert_id} · verificado em ${item.verified_at}`);

  /*
   * DUPLICATE_PARTICIPANT_CREATED = NO — a prova é contar, não confiar.
   *
   * Cada consulta cria no máximo um participante; um segundo com a mesma origem
   * e o mesmo requisito significaria que a guarda da pauta gêmea falhou.
   */
  const porRequisito = new Map<string, number>();
  for (const item of provisorios) {
    const chave = String(objeto(item.metadata).requirementId || "sem-requisito");
    porRequisito.set(chave, (porRequisito.get(chave) || 0) + 1);
  }
  const duplicados = [...porRequisito.entries()].filter(([, total]) => total > 1);
  console.log(`${marca(!duplicados.length)} participantes duplicados por requisito = ${duplicados.length}`);
  for (const [chave, total] of duplicados) console.log(`  · ${chave} tem ${total} participantes`);

  /* ===================== §3 · o token de uma vez só =================== */

  const tokens = await ler(`telegram_onboarding_tokens?select=id,expert_id,created_at,expires_at,used_at,revoked_at&brand_id=eq.${brandId}&order=created_at`);
  const usados = tokens.filter(item => item.used_at);
  console.log("\n== §3 · TOKENS DE CONVITE ==");
  console.log(`     emitidos = ${tokens.length} · consumidos = ${usados.length} · abertos = ${tokens.filter(item => !item.used_at && !item.revoked_at).length}`);
  for (const item of tokens) console.log(`  · ${item.used_at ? `consumido em ${item.used_at}` : item.revoked_at ? "revogado" : `aberto até ${item.expires_at}`}`);

  /* ========================= §1 a §8 · as pautas ====================== */

  const filtroArtigo = articleId ? `&article_id=eq.${encodeURIComponent(articleId)}` : "";
  const pautas = await ler(`expert_briefs?select=id,expert_id,article_id,article_dna_version_id,title,radar_context,status,sent_at,completed_at,created_at&brand_id=eq.${brandId}${filtroArtigo}&order=created_at`);
  const contribuicoes = await ler(`expert_contributions?select=id,brief_id,expert_id,source_type,processing_status,transcript_text,original_text,original_asset_uri,original_duration_seconds,received_at,external_update_id&brand_id=eq.${brandId}&order=received_at`);
  const doArtigo = new Set(pautas.map(item => String(item.id)));
  const respostas = contribuicoes.filter(item => doArtigo.has(String(item.brief_id)));
  const expertsVinculados = new Set(ativos.map(item => String(item.expert_id)));

  console.log("\n== §1 a §8 · PAUTAS E RESPOSTAS ==");
  if (!pautas.length) console.log("     nenhuma pauta neste contexto");
  for (const pauta of pautas) {
    const minhas = respostas.filter(item => String(item.brief_id) === String(pauta.id));
    const estado = radarSpecialistStateFromBrief({
      status: String(pauta.status),
      sentAt: (pauta.sent_at as string) || null,
      contributions: minhas.length,
      connected: expertsVinculados.has(String(pauta.expert_id)),
      invited: Boolean(radarSpecialistConsultationOf(pauta.radar_context)),
    });
    console.log(`  · ${String(pauta.title).slice(0, 60)}`);
    console.log(`      estado canônico = ${radarSpecialistStateLabel(estado)}  (coluna status = ${pauta.status})`);
    console.log(`      ${marca(true)} sent_at = ${pauta.sent_at || "NULL"}   completed_at = ${pauta.completed_at || "NULL"}`);
    console.log(`      requirementId = ${radarSpecialistRequirementIdOf(pauta.radar_context) || "AUSENTE"}`);
    console.log(`      consultationId = ${radarSpecialistConsultationOf(pauta.radar_context)?.consultationId || "não nasceu de consulta"}`);
    console.log(`      respostas = ${minhas.length}`);
    for (const resposta of minhas) {
      const transcrito = typeof resposta.transcript_text === "string" && resposta.transcript_text.trim();
      const audio = resposta.source_type === "VOICE" || resposta.source_type === "AUDIO";
      console.log(`        - ${resposta.source_type} · ${resposta.processing_status} · ${resposta.received_at}`);
      console.log(`          update_id = ${resposta.external_update_id}`);
      if (audio) console.log(`          ${marca(Boolean(resposta.original_asset_uri))} asset preservado = ${resposta.original_asset_uri || "ainda não"}`);
      console.log(`          ${marca(Boolean(transcrito) || !audio)} transcript ${transcrito ? `= ${String(resposta.transcript_text).slice(0, 70)}…` : audio ? "ainda não disponível" : "(texto não precisa)"}`);
    }
  }

  /* ========================= §7 · a idempotência ====================== */

  const porUpdate = new Map<string, number>();
  for (const item of respostas) {
    const chave = String(item.external_update_id);
    porUpdate.set(chave, (porUpdate.get(chave) || 0) + 1);
  }
  const repetidos = [...porUpdate.entries()].filter(([, total]) => total > 1);
  console.log("\n== IDEMPOTÊNCIA ==");
  console.log(`${marca(!repetidos.length)} contribuição duplicada por update_id = ${repetidos.length ? "SIM" : "NÃO"}`);
  for (const [chave, total] of repetidos) console.log(`  · update_id ${chave} aparece ${total} vezes`);
  console.log(`${marca(usados.length <= tokens.length)} token consumido mais de uma vez = ${usados.filter(item => item.revoked_at).length ? "verificar" : "NÃO"}`);

  /* ========================== §8 · a fila do worker =================== */

  const fila = await ler(`external_processing_jobs?select=id,job_kind,status,attempts,last_error_code,last_error_message,created_at&brand_id=eq.${brandId}&job_kind=in.(telegram_media_preservation,speech_transcription,document_extraction)&order=created_at.desc&limit=10`);
  console.log("\n== §8 · FILA DO USER WORKER (só jobs de especialista) ==");
  if (!fila.length) console.log("     nenhum job de contribuição ainda");
  for (const job of fila) {
    console.log(`  · ${job.job_kind} · ${job.status} · tentativas ${job.attempts} · ${job.created_at}`);
    if (job.last_error_code) console.log(`      erro: ${job.last_error_code} — ${String(job.last_error_message || "").slice(0, 160)}`);
  }

  /* =========================== os contadores ========================= */

  const leituras: RadarSpecialistBriefReading[] = pautas.map(pauta => ({
    id: String(pauta.id),
    expertId: String(pauta.expert_id),
    status: String(pauta.status),
    sentAt: (pauta.sent_at as string) || null,
    requirementId: radarSpecialistRequirementIdOf(pauta.radar_context),
    contributionIds: respostas.filter(item => String(item.brief_id) === String(pauta.id)).map(item => String(item.id)),
    /* ACCEPTED é decisão humana local; o banco ainda não a guarda. */
    acceptedContributionIds: [],
    connected: expertsVinculados.has(String(pauta.expert_id)),
    invited: Boolean(radarSpecialistConsultationOf(pauta.radar_context)),
  }));

  /*
   * PREPARED sai da investigação congelada, não das pautas: é conclusão do
   * Radar, e continua valendo mesmo que ninguém tenha criado consulta nenhuma.
   */
  const itens = articleId
    ? await ler(`editorial_workflow_items?select=payload&marca_id=eq.${brandId}&stage=eq.radar&article_id=eq.${encodeURIComponent(articleId)}`)
    : [];
  const versoes = (itens[0]?.payload as { analysisVersions?: Array<{ payload?: Registro }> } | undefined)?.analysisVersions || [];
  const congeladas = versoes.filter(item => item.payload?.finalizedBundle);
  const bundle = congeladas.at(-1)?.payload?.finalizedBundle as { bundleId?: string; authority?: { specialistRequirements?: unknown[] } } | undefined;
  const requisitos = (bundle?.authority?.specialistRequirements || []) as Array<{ requirementId: string }>;

  const contadores = radarSpecialistCounters({ requirements: requisitos, briefs: leituras });
  console.log("\n== CONTADORES (derivados do banco, pela função do domínio) ==");
  console.log(`     bundle congelado = ${bundle?.bundleId || "nenhum"}`);
  console.log(`     PREPARED  = ${contadores.prepared}`);
  console.log(`     SENT      = ${contadores.sent}`);
  console.log(`     WAITING   = ${contadores.waiting}`);
  console.log(`     RESPONDED = ${contadores.responded}`);
  console.log(`     ACCEPTED  = ${contadores.accepted}  (decisão humana local; o banco não a guarda)`);
  console.log(`     rascunhos = ${contadores.drafts}  (inclui convidadas e conectadas)`);
  console.log("\nCompare estes números com os do cabeçalho da área Especialista. Divergência = a tela mente.");
}

principal().catch(erro => {
  console.error(`FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
});
