import "server-only";

/**
 * ===== A LEITURA DO DOCUMENTO PARA SEMEAR =====
 *
 * `writerSourceHash` já lia `content_documents`, mas só traz `content_hash`. A
 * semeadura precisa do título, do status, dos blocos e dos fundamentos do
 * Radar; esta é uma leitura própria, para ninguém pagar pelo que não usa.
 *
 * Mesmo escopo de marca e mesmo erro do módulo vizinho: um documento de outra
 * marca é `document_not_found`, não "acesso negado" — quem não é da marca não
 * deve nem aprender que o id existe.
 *
 * ===== FASE 0 · SÓ OS CAMINHOS QUE OS FUNDAMENTOS LEEM =====
 *
 * Antes, esta leitura trazia o payload inteiro (4.502.936 B no documento
 * GOOGLE, medido em 2026-09-23) para `radarFoundationsOf` usar ~75 kB dele.
 * Agora ela pede só os caminhos de `RADAR_FOUNDATIONS_BUNDLE_PATHS`, em
 * consultas em série de até cinco caminhos cada (ver
 * `lib/redator/writer-document-reads.ts`).
 *
 * Documento v1, ou v2 sem dossiê, para na primeira consulta: sem dossiê não há
 * bundle a ler.
 *
 * ===== 2026-10-09 · O PLANO DO VÍDEO PELA LEITURA DO CSV (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." Roteiro, cortes e carrossel saíam do blueprint antigo
 * do YouTube; agora a semeadura monta o artigo pela MESMA montagem do export
 * (`assembleRadarPortableExport`, a do CSV e do MCP), com a planta escolhida
 * pelo MESMO pick do CSV, e calcula o plano pela MESMA função do CSV de vídeo
 * (`radarVideoPlan`): formato pela amostra pertinente, capítulos da planta,
 * cortes pela utilidade, trava por sentido. A projeção da planta que vai ao
 * contexto (`articleBlueprint`) é a dessa mesma versão, pela leitura
 * compartilhada, com as afirmações do pacote na trava, as exclusões do
 * ArticleDNA e a página publicada lida agora; a "Virada" do Assunto sai dela.
 *
 * O documento é de UM pacote: se o Radar recongelou a investigação (ou o
 * ArticleDNA mudou) depois do envio, o plano de hoje é de outro pacote e não é
 * servido (invariante 30). Sem a planta concluída, o estado explícito
 * `needs_article_blueprint`. Nenhum caminho cai no legado.
 */

import { radarFoundationsOfDossier, type RadarFoundations } from "@/lib/redator/radar-foundations";
import { writerBrandVoiceFoundation } from "@/lib/redator/writer-evidence-catalog";
import { writerArticleBlueprintForWriting, writerBlueprintWithCurrentNames, type WriterBlueprintKeywords } from "@/lib/redator/writer-blueprint-for-writing";
import { radarWriterEditorialContextWithBlueprint } from "@/lib/redator/radar-subject-turn";
import {
  WRITER_SEED_BUNDLE_SELECTS, WRITER_SEED_DOCUMENT_SELECT,
  writerSeedDossierFromRows, writerSeedHeadFromRow, type WriterSeedDocument,
} from "@/lib/redator/writer-document-reads";
import { getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";
import { WriterDeliverableError } from "@/lib/server/writer-deliverables";
import { readWriterBrandVoice, readWriterExportBlueprintMeta } from "@/lib/server/writer-evidence-sources";
import { assembleRadarPortableExport, radarReadPublishedStructure, type RadarPortableExportAssembly } from "@/lib/server/radar-portable-export-core";
import { RadarArticleBlueprintUnavailableError } from "@/lib/server/radar-article-blueprint-read";
import { radarVideoApprovedBlueprint, radarVideoPlan, type RadarVideoPlan } from "@/lib/radar/portable-video-export";
import { radarWritingProjections } from "@/lib/radar/portable-writing-export";
import { radarResearchContextScopeExclusions } from "@/lib/radar/article-research-context";
import type { RadarArticleBlueprintPayload } from "@/lib/radar/article-blueprint";

/*
 * 2026-10-02 · O artigo da semeadura sai da origem do Radar que a PRIMEIRA
 * consulta já traz (`radarOrigin`, validada pelo contrato do documento). O
 * apelido vem do próprio select, não de um prefixo copiado.
 */
const APELIDO_DA_ORIGEM = WRITER_SEED_DOCUMENT_SELECT.split(",")
  .find(coluna => coluna.endsWith("->radarOrigin"))?.split(":")[0] ?? null;

const objeto = (valor: unknown): Record<string, unknown> | null => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null);
const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);

const origemDa = (linha: Record<string, unknown>) => objeto(APELIDO_DA_ORIGEM ? linha[APELIDO_DA_ORIGEM] : null);

/** Os dois instantes descrevem o mesmo momento (com `Z` ou com `+00:00`). */
const mesmoInstante = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [x, y] = [Date.parse(a), Date.parse(b)];
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};

/**
 * 2026-10-09 · O plano do vídeo da semeadura, ou por que ele não existe.
 * `needs_article_blueprint`: o pacote não tem artigo-modelo concluído;
 * `other_investigation`: o Radar recongelou (ou o ArticleDNA mudou) depois do
 * envio; `refused`: o Radar recusou montar o artigo agora (motivo dele);
 * `blueprint_unavailable`: a leitura das plantas falhou agora.
 */
export type WriterSeedPlanRead =
  | { kind: "ready"; plan: RadarVideoPlan }
  | { kind: "needs_article_blueprint" | "other_investigation" | "refused" | "blueprint_unavailable"; reason: string };

/**
 * 2026-10-09 · As duas leituras de fora, injetáveis (os testes passam a montagem
 * de fixture; nenhuma chamada paga, nenhum provider).
 */
export type WriterSeedPorts = {
  /** A montagem do export para UM artigo — a mesma da rota do CSV e do MCP. */
  assemble: (input: { brandId: string; articleId: string; actorUserId: string }) => Promise<RadarPortableExportAssembly>;
  /** O id, a versão e a data da planta que a montagem leu (a escolha do CSV). */
  blueprintMeta: (input: { brandId: string; articleId: string; bundleHash: string | null | undefined; montagem: RadarPortableExportAssembly }) => Promise<{ id: string; versionNumber: number | null; approvedAt: string | null } | null>;
};

export const writerSeedPorts: WriterSeedPorts = {
  /* A página publicada é lida como o CSV a lê (mapa da atualização também na planta antiga); o Silo entra como no botão "Para escrever". */
  assemble: ({ brandId, articleId, actorUserId }) => assembleRadarPortableExport({
    brandId, articleIds: [articleId], supabase: getOperationalClient(), actorUserId,
    readPublishedStructure: radarReadPublishedStructure, selectionSiloContext: true,
  }),
  /* A escolha do CSV, pelos metadados (a leitura mora com as outras do artigo-modelo, em writer-evidence-sources). */
  blueprintMeta: ({ brandId, articleId, bundleHash, montagem }) => readWriterExportBlueprintMeta(
    { brandId, client: getOperationalClient() },
    { articleId, bundleHash: bundleHash ?? null, investigation: montagem.congelamentos.get(articleId) ?? null },
  ),
};

/**
 * 2026-10-09 · A MONTAGEM DO CSV PARA O ARTIGO DO DOCUMENTO: o plano do vídeo,
 * a planta (a mesma versão, pela leitura compartilhada) e a virada pela planta.
 */
export async function writerSeedPlanOf(input: {
  brandId: string;
  actorUserId: string;
  articleId: string;
  bundleObservedAt: string | null;
  articleDnaVersionId: string | null;
  keywords: WriterBlueprintKeywords | null;
  editorialContext: readonly string[];
}, portas: WriterSeedPorts = writerSeedPorts): Promise<{ plano: WriterSeedPlanRead; articleBlueprint: RadarFoundations["articleBlueprint"] | null; editorialContext: string[] | null }> {
  let montagem: RadarPortableExportAssembly;
  try {
    montagem = await portas.assemble({ brandId: input.brandId, articleId: input.articleId, actorUserId: input.actorUserId });
  } catch (erro) {
    if (erro instanceof RadarArticleBlueprintUnavailableError) return { plano: { kind: "blueprint_unavailable", reason: erro.message }, articleBlueprint: null, editorialContext: null };
    throw erro;
  }
  const montada = montagem.montadas.find(item => item.articleId === input.articleId);
  if (!montada) {
    const recusa = montagem.recusados.find(item => item.articleId === input.articleId);
    return { plano: { kind: "refused", reason: recusa?.reason ?? "O Radar não montou este artigo agora: a investigação não está finalizada." }, articleBlueprint: null, editorialContext: null };
  }
  const congelamento = montagem.congelamentos.get(input.articleId) ?? null;
  if (!congelamento || !mesmoInstante(congelamento.frozenAt, input.bundleObservedAt) || (input.articleDnaVersionId && congelamento.articleDnaVersionId !== input.articleDnaVersionId)) {
    return {
      plano: { kind: "other_investigation", reason: "A investigação do Radar foi congelada de novo (ou o ArticleDNA mudou) depois do envio: o artigo-modelo e o plano de hoje são de outro pacote e não valem para este documento. O Radar reenvia o pacote atual ao Redator." },
      articleBlueprint: null, editorialContext: null,
    };
  }
  const planta = radarVideoApprovedBlueprint(montada.blueprint ?? null);
  if (!planta?.blueprint.sections.length) {
    return {
      plano: { kind: "needs_article_blueprint", reason: "Este artigo ainda não tem o artigo-modelo da SERP concluído: organize-o no Radar (Pesquisa → Artigo-modelo da SERP; até 2 chamadas de IA por artigo, ditas no botão) e crie o roteiro e o carrossel de novo." },
      articleBlueprint: null, editorialContext: null,
    };
  }
  const excluidos = new Map<string, string[]>();
  for (const arquivo of montagem.planoDaSelecao?.files || []) {
    if (!arquivo.writing) continue;
    for (const articleId of arquivo.articleIds) excluidos.set(articleId, arquivo.writing.excludedTopics);
  }
  let plano: ReturnType<typeof radarVideoPlan>;
  try {
    plano = radarVideoPlan(montada.entrada, {
      youtube: montada.youtube ?? null,
      brandVoiceActive: montagem.brandVoice.kind === "available",
      brandVoice: montagem.brandVoice,
      blueprint: montada.blueprint ?? null,
      ...(excluidos.has(input.articleId) ? { siloExcludedTopics: excluidos.get(input.articleId) } : {}),
      lentesCongeladas: montada.lentesCongeladas ?? null,
      lensDigests: null,
    });
  } catch {
    /* Planta gravada fora do contrato (seção sem forma): o CSV de vídeo também não a monta. O estado explícito, sem estrutura de outro lugar. */
    return { plano: { kind: "refused", reason: "O artigo-modelo concluído deste pacote está fora do contrato do Radar e não monta o plano do vídeo: organize-o de novo no Radar." }, articleBlueprint: null, editorialContext: null };
  }
  if (plano.status !== "ready") {
    return { plano: { kind: "needs_article_blueprint", reason: "Este artigo ainda não tem o artigo-modelo da SERP concluído: organize-o no Radar e crie o roteiro e o carrossel de novo." }, articleBlueprint: null, editorialContext: null };
  }

  /* A projeção da MESMA planta, pela leitura compartilhada e pela trava do CSV (as afirmações do pacote). */
  const meta = await portas.blueprintMeta({ brandId: input.brandId, articleId: input.articleId, bundleHash: montada.bundleHash, montagem });
  const entrada = montada.entrada;
  const principal = entrada.article.principalKeyword || null;
  const nucleo = [principal, ...(entrada.article.secondaryKeywords || []), ...(entrada.article.narrativeReinforcements || []), entrada.researchContext?.article.subject?.phrase ?? null]
    .filter((item): item is string => Boolean(item));
  const versao = planta as RadarArticleBlueprintPayload;
  const exclusoes = { items: radarResearchContextScopeExclusions(entrada.researchContext), core: nucleo };
  const articleBlueprint = meta
    ? writerArticleBlueprintForWriting({
      id: meta.id, versionNumber: meta.versionNumber, approvedAt: meta.approvedAt,
      blueprint: versao.blueprint, plan: versao.measures?.plan ?? null, linkCandidates: versao.linkCandidates, brandVoice: versao.brandVoice ?? null,
      publishedStructure: versao.publishedStructure ?? null,
      currentStructure: montagem.publicacoes.get(input.articleId)?.currentStructure ?? null,
      keywords: input.keywords,
      sources: versao.sources,
      exclusions: exclusoes,
      claims: { projections: radarWritingProjections(entrada) },
    })
    : null;
  /* A virada lê a planta pela mesma leitura (nomes atuais, fontes do pacote e exclusões). */
  const lidaParaVirada = articleBlueprint ? writerBlueprintWithCurrentNames(versao.blueprint, input.keywords, { sources: versao.sources, exclusions: exclusoes }) : null;
  const editorialContext = radarWriterEditorialContextWithBlueprint(input.editorialContext, {
    subject: entrada.researchContext?.article.subject ?? null,
    blueprint: lidaParaVirada,
    principal,
  });
  return { plano: { kind: "ready", plan: plano }, articleBlueprint, editorialContext };
}

export async function writerSeedDocument(brandId: string, documentId: string, opcoes: { actorUserId: string; ports?: WriterSeedPorts }): Promise<{
  document: WriterSeedDocument;
  foundations: RadarFoundations | null;
  contentHash: string;
  /** 2026-10-09 · O plano do vídeo (o mesmo do CSV de vídeo), ou o motivo explícito de não haver. `null` sem dossiê. */
  plan: WriterSeedPlanRead | null;
}> {
  const client = getOperationalClient();
  const ler = async (select: string): Promise<Record<string, unknown>> => {
    const { data, error } = await client.from("content_documents")
      .select(select).eq("id", documentId).eq("marca_id", brandId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new WriterDeliverableError("document_not_found", "Documento não encontrado nesta marca.", 404);
    return data as unknown as Record<string, unknown>;
  };

  const primeira = await ler(WRITER_SEED_DOCUMENT_SELECT);
  const head = writerSeedHeadFromRow(primeira);
  if (!head) {
    /*
     * Documento gravado fora do contrato não vira contexto de IA. Semear com
     * leitura parcial produziria um roteiro coerente construído sobre um
     * documento que ninguém validou — o pior tipo de saída, porque parece certa.
     */
    throw new WriterDeliverableError("document_incompatible",
      "O documento está gravado fora do contrato atual e não pode ser usado como contexto.", 422);
  }
  if (!head.dossier) return { document: head.document, foundations: null, contentHash: head.contentHash, plan: null };

  const linhas: Record<string, unknown>[] = [];
  for (const select of WRITER_SEED_BUNDLE_SELECTS) linhas.push(await ler(select));
  const dossier = writerSeedDossierFromRows(head.dossier, linhas);
  if (!dossier) {
    throw new WriterDeliverableError("document_changed",
      "O pacote do Radar deste documento mudou durante a leitura. Tente de novo.", 409);
  }
  /* As linhas do envio (Assunto, F4.2) vêm do cabeçalho, pela mesma projeção do painel. */
  const fundamentos = radarFoundationsOfDossier(dossier, { editorialContext: head.editorialContext });
  if (!fundamentos) return { document: head.document, foundations: null, contentHash: head.contentHash, plan: null };

  /* 2026-10-02 · a voz corrente da Marca, lida ao vivo (copy e CTA); sem ela, nenhuma linha. */
  const voz = await readWriterBrandVoice({ brandId, client }, { content: true });
  const brandVoice = voz.kind === "current"
    ? writerBrandVoiceFoundation({ versionId: voz.meta.versionId, versionNumber: voz.meta.versionNumber, name: voz.name, lifecycle: voz.lifecycle, title: voz.title, sections: voz.sections })
    : null;

  /* 2026-10-09 · o plano, a planta e a virada pela montagem do CSV do artigo da origem. */
  const origem = origemDa(primeira);
  const articleId = texto(origem?.articleId);
  const bundleObservedAt = texto(objeto(dossier.bundle)?.observedAt);
  const montado = articleId
    ? await writerSeedPlanOf({
      brandId, actorUserId: opcoes.actorUserId, articleId, bundleObservedAt,
      articleDnaVersionId: texto(origem?.articleDnaVersionId),
      keywords: head.dossier.keywordContext,
      editorialContext: head.editorialContext,
    }, opcoes.ports)
    : { plano: { kind: "refused" as const, reason: "O documento não aponta o artigo do Radar de onde veio." }, articleBlueprint: null, editorialContext: null };

  const linhasDoEnvio = montado.editorialContext;
  return {
    document: head.document,
    foundations: {
      ...fundamentos,
      ...(linhasDoEnvio?.length ? { editorialContext: linhasDoEnvio } : {}),
      ...(brandVoice ? { brandVoice } : {}),
      ...(montado.articleBlueprint ? { articleBlueprint: montado.articleBlueprint } : {}),
    },
    contentHash: head.contentHash,
    plan: montado.plano,
  };
}
