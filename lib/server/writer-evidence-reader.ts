import "server-only";

/**
 * ===== LEITOR DE EVIDÊNCIAS DO REDATOR · MANIFESTO, FUNDAMENTOS E FATIAS =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §4 (desenho), §6 (isolamento) e §9 (testes); adendo de decisões D1–D11 e
 * §5 (antes da migration). Regras R1–R16 da SDD de egress.
 *
 * Três camadas, um leitor, resolvidos SEMPRE a partir da linha do documento:
 *
 *   (1) MANIFESTO ≤ 8 kB — cada fonte e cada ausência declarada, com dono,
 *       versão, data, status, bytes, itens, páginas e etag. Não lê payload:
 *       tamanhos vêm da função SQL `writer_evidence_manifest`; sem ela, o
 *       manifesto diz "tamanho desconhecido (migration pendente)".
 *   (2) FUNDAMENTOS ≤ 24 kB — o que toda escrita precisa ter à mão: contexto
 *       da keyword, o que o Redator não pode redefinir, hierarquia, origem,
 *       pendências, projeção editorial do ArticleDNA, especialista e vídeo
 *       congelados, concorrentes e perguntas resumidos. Só caminhos pequenos
 *       e fixos, por seletor de caminho; funciona antes da migration.
 *   (3) FATIAS ≤ 32 kB (padrão 16 kB) — uma `sourceKey` do manifesto, com
 *       cursor, projeção e `ifNoneMatch`. Paginadas no banco pela função
 *       `writer_evidence_slice`; sem ela, só a lista fechada de seções medidas
 *       e as fontes pequenas lidas pela regra de parse do dono. O resto
 *       responde `migration_pendente` — nunca baixa MB para compensar.
 *
 * Quem consome: o MCP externo, a IA interna (pacote por seção montado no
 * servidor) e o painel humano. Nenhum deles escolhe id: só `sourceKey`, e
 * a chave precisa ser alcançável pelas referências do documento.
 */

import { RADAR_EVIDENCE_LABEL } from "@/lib/radar/evidence-authority";
import {
  WRITER_BUNDLE_KNOWN_PATHS,
  WRITER_BUNDLE_STRUCTURAL_ALIAS,
  WRITER_EVIDENCE_ENVELOPE_RESERVE_BYTES,
  WRITER_EVIDENCE_GUARDS,
  WRITER_EVIDENCE_HIERARCHY,
  WRITER_EVIDENCE_LIMITS,
  WRITER_RUN_ALIASES,
  WRITER_RUN_DEFAULT_EXCLUDED_KEYS,
  WRITER_RUN_DEFAULT_FIELDS,
  buildWriterEvidenceManifest,
  clampWriterSliceBytes,
  clampWriterSliceItems,
  fitWriterEvidenceEnvelope,
  fitWriterFoundations,
  parseWriterEvidenceCursor,
  parseWriterEvidenceFields,
  parseWriterEvidenceSourceKey,
  truncateWriterThirdPartyText,
  writerBundlePathReadableWithoutMigration,
  writerEvidenceEnvelope,
  writerEvidenceEtag,
  writerEvidenceHierarchyOf,
  writerEvidencePageOf,
  writerEvidenceJsonBytes,
  writerSliceRowsOf,
  type WriterEvidenceEnvelope,
  type WriterEvidenceFamily,
  type WriterEvidenceHierarchy,
  type WriterEvidenceManifest,
  type WriterEvidenceNotModified,
  type WriterEvidenceOrigin,
  type WriterEvidenceSourceKey,
  type WriterManifestAbsence,
  type WriterManifestBundleRow,
  type WriterManifestSourceRow,
  type WriterSliceRow,
} from "@/lib/redator/writer-evidence-catalog";
import { RADAR_WRITER_MAY_NOT } from "@/lib/redator/writer-handoff";
import { WRITER_SECTION_BUNDLE_PATHS, type WriterSectionMaterial } from "@/lib/redator/writer-section-evidence";
import {
  WriterEvidenceError,
  callWriterEvidenceManifestRpc,
  callWriterEvidenceSliceRpc,
  isLegacyVersionReference,
  readWriterBundlePaths,
  readWriterEvidenceHead,
  writerEvidenceNow,
  type WriterEvidenceContext,
  type WriterEvidenceHead,
  type WriterManifestRpcRow,
} from "@/lib/server/writer-evidence-document";
import {
  countWriterBrandPublications,
  countWriterPosteriorSpecialist,
  countWriterSiteCatalog,
  readWriterArtifactVersionMeta,
  readWriterArticleProjection,
  readWriterBrandContextVersions,
  readWriterBrandPublicationsPage,
  readWriterDnaVersion,
  readWriterFormation,
  readWriterFormationAssessment,
  readWriterFormationMeta,
  readWriterGraphEdges,
  readWriterGraphMeta,
  readWriterKeywordMetrics,
  readWriterLatestSerpSnapshotMeta,
  readWriterLatestVersionNumbers,
  readWriterOwnPublication,
  readWriterSerpCache,
  readWriterSerpSnapshotMeta,
  readWriterSerpSnapshotRecord,
  readWriterSiteCatalogPage,
  readWriterTerritorial,
  readWriterTerritorialMeta,
  readWriterVideoStatuses,
  WRITER_BRAND_CONTEXT_MAX_VERSIONS,
  WRITER_SERP_CACHE_CANONICAL_LENS,
  writerKeywordRefOf,
  writerSerpCacheCanonicalLens,
  writerSerpCacheIsCanonical,
  writerSerpCacheLensOf,
  writerVideoSourcesOf,
  type WriterVideoStatus,
} from "@/lib/server/writer-evidence-sources";
import { KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE } from "@/lib/minerador/keyword-semantic-qualification";

export { WriterEvidenceError, type WriterEvidenceContext } from "@/lib/server/writer-evidence-document";

type Linha = Record<string, unknown>;

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const registro = (valor: unknown): Linha | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Linha : null;
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);

/** A referência ao parecer SERP de formação no ArticleDNA fixado. */
function registroDoParecer(valor: unknown): { entityId: string; contentHash: string | null } | null {
  const referencia = registro(valor);
  const entityId = texto(referencia?.entityId);
  return entityId ? { entityId, contentHash: texto(referencia?.contentHash) } : null;
}

const PARECER_SUBSTITUIDO = "O parecer SERP de formação fixado foi substituído: o hash gravado difere da referência do ArticleDNA. Religar o parecer é decisão do Arquiteto; o Redator não serve o novo como se fosse o fixado.";

/** Quando o pacote foi congelado: a régua de "posterior ao pacote". */
function momentoDoPacote(head: WriterEvidenceHead): string | null {
  return head.bundleObservedAt ?? head.radarOrigin?.importedAt ?? head.capturedAt ?? null;
}

function posterior(head: WriterEvidenceHead, quando: string | null | undefined): boolean {
  const pacote = momentoDoPacote(head);
  if (!pacote || !quando) return false;
  const [a, b] = [Date.parse(quando), Date.parse(pacote)];
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

const writerMayNotOf = (head: WriterEvidenceHead): readonly string[] =>
  head.dossier?.writerMayNot?.length ? head.dossier.writerMayNot : RADAR_WRITER_MAY_NOT;

function navegar(valor: unknown, caminho: readonly string[]): unknown {
  let atual: unknown = valor;
  for (const parte of caminho) {
    if (Array.isArray(atual)) {
      if (!/^\d{1,9}$/.test(parte)) return undefined;
      atual = atual[Number(parte)];
    } else {
      const objeto = registro(atual);
      if (!objeto || !Object.prototype.hasOwnProperty.call(objeto, parte)) return undefined;
      atual = objeto[parte];
    }
    if (atual === undefined) return undefined;
  }
  return atual;
}

/* ================================ manifesto ================================ */

/** Chaves de identidade do dossiê: já estão no cabeçalho do manifesto. */
const CHAVES_DE_IDENTIDADE_DO_PACOTE = new Set(["bundleVersion", "bundleId", "bundleHash", "primaryResearchProfile", "binding", "keywordContext"]);

function linhasDoPacoteMedidas(rpc: readonly WriterManifestRpcRow[]): WriterManifestBundleRow[] {
  const raiz = ["importedContext", "dossier", "bundle"];
  return rpc
    .filter(linha => linha.source === "document" && linha.kind === "bundle" && linha.jsonPath.length > raiz.length
      && raiz.every((parte, indice) => linha.jsonPath[indice] === parte))
    .map(linha => ({ path: linha.jsonPath.slice(raiz.length), bytes: linha.bytes, items: linha.items, depth: linha.jsonPath.length - raiz.length, tipo: linha.valueType }))
    .filter(linha => !CHAVES_DE_IDENTIDADE_DO_PACOTE.has(linha.path[0]) && linha.tipo !== "null")
    .map(({ path, bytes, items, depth }) => ({ path, bytes, items, depth }));
}

function linhasDoPacoteConhecidas(perfil: string): WriterManifestBundleRow[] {
  return Object.keys(WRITER_BUNDLE_KNOWN_PATHS)
    .map(caminho => caminho.split("."))
    .filter(caminho => perfil === "GOOGLE" || caminho[0] !== "observed")
    .map(path => ({ path, bytes: null, items: null, depth: path.length }));
}

const SITUACAO_DO_VIDEO: Record<Exclude<WriterVideoStatus["situation"], "available">, string> = {
  removed_after_delivery: "vídeo removido do artigo por uma pessoa depois do envio; não reaparece em silêncio",
  text_version_missing: "a versão do texto que sustentou o pacote não existe mais; texto reprocessado não a substitui",
  not_selected: "vídeo sem vínculo com o artigo",
  invalid_reference: "referência de vídeo inválida no pacote",
};

/**
 * O MANIFESTO. Lista cada fonte e cada ausência, sem baixar payload para
 * medir: bytes e contagens vêm da função SQL; sem ela, "desconhecido".
 */
export async function readWriterEvidenceManifest(context: WriterEvidenceContext, documentId: string): Promise<WriterEvidenceManifest> {
  const head = await readWriterEvidenceHead(context, documentId);
  const rpc = await callWriterEvidenceManifestRpc(context, head.documentId);
  const medido = rpc !== null;
  const linhasRpc = rpc ?? [];
  const fontes: WriterManifestSourceRow[] = [];
  const ausentes: WriterManifestAbsence[] = [];
  const avisos: string[] = [];
  const nivelExterno = writerEvidenceHierarchyOf({ family: "serp.cache" });
  const nivelDna = writerEvidenceHierarchyOf({ family: "dna.article" });
  const fonte = (linha: Omit<WriterManifestSourceRow, "level"> & { level?: WriterManifestSourceRow["level"] }) =>
    fontes.push({ level: nivelExterno.level, ...linha });

  if (!medido) {
    avisos.push("migration_pendente: sem as funções SQL do leitor, bytes e contagens saem como desconhecidos; corridas, transcrições, o snapshot entregue e as seções grandes do dossiê respondem migration_pendente.");
  }

  /* ----------------------------- dossiê congelado ----------------------------- */
  let bundle: Parameters<typeof buildWriterEvidenceManifest>[0]["bundle"] = null;
  let fontesDeVideo: ReturnType<typeof writerVideoSourcesOf> = [];
  let grafoCongelado: string | null = null;
  if (head.dossier) {
    const lidos = await readWriterBundlePaths(context, head, [["video", "sources"], ["observed", "internalLinks", "graphVersionId"]]);
    fontesDeVideo = writerVideoSourcesOf(lidos.get("video.sources"));
    grafoCongelado = texto(lidos.get("observed.internalLinks.graphVersionId"));
    const perfil = head.dossier.researchProfile;
    const nivelDaFotografia = writerEvidenceHierarchyOf({ family: "radar.bundle", bundlePath: ["observed"], serpAuthoritative: head.serpStanding?.authoritative });
    bundle = {
      bundleId: head.dossier.bundleId,
      bundleHash: head.dossier.bundleHash,
      profile: perfil,
      observedAt: head.bundleObservedAt,
      level: nivelDaFotografia.level,
      levelOverrides: { "radar.bundle.specialist": "QUALIFIED_SPECIALIST" },
      etag: writerEvidenceEtag(["radar.bundle", head.dossier.bundleHash]),
      rows: medido ? linhasDoPacoteMedidas(linhasRpc) : linhasDoPacoteConhecidas(perfil),
    };
    if (perfil !== "GOOGLE") ausentes.push({ sourceKey: "radar.bundle.observed", owner: "radar", reason: `fotografia do Google ausente no perfil ${perfil}: ausência declarada, não lista vazia` });
    if (medido && !bundle.rows.some(linha => linha.path[0] === "observed") && perfil === "GOOGLE") {
      ausentes.push({ sourceKey: "radar.bundle.observed", owner: "radar", reason: "o pacote não trouxe a fotografia do Google" });
    }
  } else {
    ausentes.push({
      sourceKey: "radar.bundle", owner: "radar",
      reason: head.schemaVersion === 1 ? "documento do Planejador (v1): não há dossiê do Radar" : "documento sem dossiê (anterior ao gate): não inferir evidências",
    });
  }

  /* ------------------------------ Radar: SERP e corridas ------------------------------ */
  const origem = head.radarOrigin;
  if (origem) {
    const versao = linhasRpc.find(linha => linha.source === "analysis_version" && linha.jsonPath.length === 0);
    const linhaEntregue = linhasRpc.find(linha => linha.source === "serp_snapshot" && linha.kind === "delivered");
    const referenciaEntregue = linhaEntregue?.refId ?? texto(versao?.note);
    const entregue = medido && referenciaEntregue ? await readWriterSerpSnapshotMeta(context, head, referenciaEntregue) : null;
    const recente = await readWriterLatestSerpSnapshotMeta(context, head);
    const bytesDoSnapshot = (id: string) => linhasRpc.find(linha => linha.source === "serp_snapshot" && linha.refId === id)?.bytes ?? null;
    if (entregue) {
      fonte({
        sourceKey: "serp.radar.snapshot", owner: "radar", status: entregue.status ?? "desconhecido", bytes: bytesDoSnapshot(entregue.id), items: null,
        etag: writerEvidenceEtag([entregue.id, entregue.contentHash, entregue.reviewStatus]), observedAt: entregue.createdAt, posteriorAoPacote: false,
        note: `snapshot da versão de análise entregue; revisão humana: ${entregue.reviewStatus ?? "nenhuma"}`,
      });
    } else {
      ausentes.push({ sourceKey: "serp.radar.snapshot", owner: "radar", reason: medido ? "a versão de análise entregue não aponta snapshot deste artigo" : "migration_pendente: o snapshot entregue é resolvido pela função SQL" });
    }
    if (recente && recente.id !== entregue?.id) {
      fonte({
        sourceKey: "serp.radar.snapshot.latest", owner: "radar", status: recente.status ?? "desconhecido", bytes: bytesDoSnapshot(recente.id), items: null,
        etag: writerEvidenceEtag([recente.id, recente.contentHash, recente.reviewStatus]), observedAt: recente.createdAt,
        posteriorAoPacote: posterior(head, recente.createdAt),
        note: `snapshot mais recente do artigo${medido ? "" : " (sem a função SQL não se sabe se é o entregue)"}; revisão humana: ${recente.reviewStatus ?? "nenhuma"}; não substitui o pacote`,
      });
    }

    if (medido) {
      const corrida = linhasRpc.filter(linha => linha.source === "radar_run");
      const atualizada = corrida.find(linha => linha.jsonPath.length === 0)?.observedAt ?? null;
      for (const [apelido, caminho] of Object.entries(WRITER_RUN_ALIASES)) {
        const linha = corrida.find(item => item.jsonPath.length === caminho.length && item.jsonPath.every((parte, indice) => parte === caminho[indice]));
        if (!linha || linha.valueType === "null") continue;
        fonte({
          sourceKey: `run.${apelido}`, owner: "radar", status: "research_not_frozen", bytes: linha.bytes, items: linha.items,
          etag: writerEvidenceEtag(["run", apelido, origem.analysisVersionId, atualizada]), observedAt: atualizada, posteriorAoPacote: false,
          note: apelido.startsWith("amazon.") ? "pesquisa, não congelada" : "corrida da versão entregue; pesquisa, não matéria-prima",
        });
      }
      if (!corrida.length) ausentes.push({ sourceKey: "run", owner: "radar", reason: "sem corrida gravada para a versão de análise entregue" });
    }
    if (head.dossier?.researchProfile === "AMAZON" || fontes.some(item => item.sourceKey.startsWith("run.amazon."))) {
      ausentes.push({ sourceKey: "run.amazon.shortlist", owner: "radar", reason: "shortlist editorial não congelada pelo Radar; os produtos da corrida são pesquisa, não congelada (invariante 30)" });
    }
  }

  /* ------------------------------ vídeos do pacote ------------------------------ */
  if (fontesDeVideo.length) {
    const situacoes = await readWriterVideoStatuses(context, head, fontesDeVideo);
    for (const video of situacoes) {
      const chave = `video.transcript/${video.videoSourceId}`;
      if (video.situation !== "available") {
        ausentes.push({ sourceKey: chave, owner: "radar", reason: SITUACAO_DO_VIDEO[video.situation] });
        continue;
      }
      const bytes = linhasRpc.find(linha => linha.source === "video_text" && linha.kind === "transcript_text" && linha.refId?.toLowerCase() === video.videoSourceId.toLowerCase())?.bytes ?? null;
      fonte({
        sourceKey: chave, owner: "radar", status: "bound_to_bundle", bytes, items: null,
        etag: writerEvidenceEtag([head.dossier?.bundleHash, video.videoSourceId, video.processingVersion, video.textHash]),
        observedAt: video.textCreatedAt, posteriorAoPacote: false,
        note: `${video.displayName ?? "vídeo"}; texto v${video.processingVersion}${video.languageCode ? ` (${video.languageCode})` : ""}${medido ? "" : "; leitura exige a migration"}`,
      });
    }
  }

  /* ------------------------------ DNAs fixados ------------------------------ */
  const { articleDnaRef, siloDnaRef, keywordDnaRefs } = head.refs;
  const reais = [articleDnaRef, siloDnaRef, ...keywordDnaRefs].filter(referencia => !isLegacyVersionReference(referencia));
  const metas = await readWriterArtifactVersionMeta(context, reais.map(referencia => referencia.versionId));
  const maisNovas = async (tipo: string, entidades: string[]) => readWriterLatestVersionNumbers(context, tipo, entidades);
  const bytesDaVersao = (versionId: string) => linhasRpc.find(linha => linha.source === "artifact_version" && linha.refId === versionId)?.bytes ?? null;
  const notaDeVersao = (numero: number | null, maior: number | undefined) =>
    `v${numero ?? "?"}${maior && numero !== null && maior > numero ? `; há v${maior} mais nova (não substitui a fixada)` : ""}`;

  const metaDoArtigo = isLegacyVersionReference(articleDnaRef) ? null : metas.get(articleDnaRef.versionId) ?? null;
  if (metaDoArtigo) {
    const maior = (await maisNovas("article_dna", [metaDoArtigo.entityId])).get(metaDoArtigo.entityId);
    fonte({
      sourceKey: `dna.article/${articleDnaRef.versionId}`, owner: "arquiteto", status: "fixed", level: nivelDna.level,
      bytes: bytesDaVersao(articleDnaRef.versionId), items: null, etag: writerEvidenceEtag([articleDnaRef.versionId, articleDnaRef.contentHash]),
      observedAt: metaDoArtigo.createdAt, posteriorAoPacote: false, note: notaDeVersao(metaDoArtigo.versionNumber, maior),
    });
  } else {
    ausentes.push({ sourceKey: "dna.article", owner: "arquiteto", reason: isLegacyVersionReference(articleDnaRef) ? "referência legada: sem versão fixada" : "a versão fixada não existe nesta Marca" });
  }

  const metaDoSilo = isLegacyVersionReference(siloDnaRef) ? null : metas.get(siloDnaRef.versionId) ?? null;
  if (metaDoSilo && metaDoSilo.artifactType === "silo_dna") {
    const maior = (await maisNovas("silo_dna", [metaDoSilo.entityId])).get(metaDoSilo.entityId);
    fonte({
      sourceKey: `dna.silo/${siloDnaRef.versionId}`, owner: "arquiteto", status: "fixed", level: nivelDna.level,
      bytes: bytesDaVersao(siloDnaRef.versionId), items: null, etag: writerEvidenceEtag([siloDnaRef.versionId, siloDnaRef.contentHash]),
      observedAt: metaDoSilo.createdAt, posteriorAoPacote: false, note: notaDeVersao(metaDoSilo.versionNumber, maior),
    });
  } else {
    ausentes.push({ sourceKey: "dna.silo", owner: "arquiteto", reason: isLegacyVersionReference(siloDnaRef) ? "referência legada: sem versão fixada no documento" : "a versão fixada não existe nesta Marca" });
  }
  ausentes.push({ sourceKey: "dna.siloPage", owner: "arquiteto", reason: "sem vínculo determinístico entre a SiloPage e o artigo" });

  const keywordsReais = keywordDnaRefs.filter(referencia => !isLegacyVersionReference(referencia));
  const maioresDasKeywords = await maisNovas(KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE, keywordsReais.map(referencia => referencia.entityId));
  for (const referencia of keywordDnaRefs) {
    const chave = `dna.keyword/${referencia.entityId}`;
    const meta = isLegacyVersionReference(referencia) ? null : metas.get(referencia.versionId) ?? null;
    if (!meta) {
      ausentes.push({ sourceKey: chave, owner: "minerador", reason: isLegacyVersionReference(referencia) ? "referência legada: sem Qualificação fixada" : "a Qualificação fixada não existe nesta Marca" });
      continue;
    }
    fonte({
      sourceKey: chave, owner: "minerador", status: "fixed", level: nivelDna.level, bytes: bytesDaVersao(referencia.versionId), items: null,
      etag: writerEvidenceEtag([referencia.versionId, referencia.contentHash]), observedAt: meta.createdAt, posteriorAoPacote: false,
      note: notaDeVersao(meta.versionNumber, maioresDasKeywords.get(referencia.entityId)),
    });
  }
  /* Uma linha só para todas as keywords: o manifesto tem 8 kB, e o motivo é o mesmo. */
  ausentes.push({ sourceKey: "dna.keyword.presentation/*", owner: "minerador", reason: "sem vínculo determinístico entre a apresentação contextual e a versão fixada" });
  fonte({
    sourceKey: "dna.keyword.metrics", owner: "minerador", status: "current_unpinned", bytes: null, items: keywordDnaRefs.length,
    etag: writerEvidenceEtag(["dna.keyword.metrics", ...keywordDnaRefs.map(referencia => referencia.entityId)]), observedAt: null, posteriorAoPacote: false,
    note: "volume, KGR, allintitle, CPC e KD pelo snapshot canônico do Minerador; vigentes, não fixados no documento",
  });

  /* ------------------------------ Marca ------------------------------ */
  const contextoDaMarca = await readWriterBrandContextVersions(context);
  if (contextoDaMarca.brandDna) {
    const dna = contextoDaMarca.brandDna;
    fonte({
      sourceKey: "dna.brand/current", owner: "marca", status: "current_unpinned", level: nivelDna.level, bytes: bytesDaVersao(dna.versionId), items: null,
      etag: writerEvidenceEtag([dna.versionId, dna.contentHash]), observedAt: dna.createdAt, posteriorAoPacote: posterior(head, dna.createdAt),
      note: "BrandDNA aprovado vigente; não fixado no documento",
    });
  } else {
    ausentes.push({
      sourceKey: "dna.brand/current", owner: "marca",
      reason: contextoDaMarca.truncated.brandDna
        ? `nenhum BrandDNA aprovado entre as ${WRITER_BRAND_CONTEXT_MAX_VERSIONS} versões mais novas; as anteriores não foram lidas`
        : "nenhum BrandDNA aprovado nesta Marca",
    });
  }
  if (contextoDaMarca.truncated.skills) {
    ausentes.push({ sourceKey: "brand.skill/*", owner: "marca", reason: `mais de ${WRITER_BRAND_CONTEXT_MAX_VERSIONS} versões de Skill na Marca: definições além do corte não foram listadas` });
  }
  for (const skill of contextoDaMarca.skills) {
    fonte({
      sourceKey: `brand.skill/${skill.versionId}`, owner: "marca", status: skill.lifecycle, level: nivelDna.level, bytes: bytesDaVersao(skill.versionId), items: null,
      etag: writerEvidenceEtag([skill.versionId, skill.contentHash]), observedAt: skill.createdAt, posteriorAoPacote: posterior(head, skill.createdAt),
      note: `Skill da Marca ${skill.entityId} v${skill.versionNumber ?? "?"}; não fixada no documento`,
    });
  }

  /* ------------------------------ Arquiteto: SERP e grafo ------------------------------ */
  const projecao = await readWriterArticleProjection(context, head, ["serpAssessmentRef", "territoryRef"]);
  const parecer = registroDoParecer(projecao?.fields.serpAssessmentRef);
  const formacao = parecer ? await readWriterFormationMeta(context, parecer) : null;
  if (formacao && !formacao.hashMatches) {
    ausentes.push({ sourceKey: "serp.architect.formation", owner: "arquiteto", reason: "o parecer fixado foi substituído (hash gravado difere da referência do ArticleDNA); religar é do Arquiteto" });
  } else if (formacao) {
    const nivel1 = linhasRpc.filter(linha => linha.source === "architect_formation" && linha.jsonPath.length === 1);
    const bruto = nivel1.find(linha => linha.jsonPath[0] === "assessment")?.bytes ?? null;
    const compacto = nivel1.length ? nivel1.filter(linha => linha.jsonPath[0] !== "assessment").reduce((soma, linha) => soma + (linha.bytes ?? 0), 0) : null;
    fonte({
      sourceKey: "serp.architect.formation", owner: "arquiteto", status: formacao.state ?? "desconhecido", bytes: compacto, items: null,
      etag: writerEvidenceEtag([parecer?.entityId, formacao.state, formacao.updatedAt]), observedAt: formacao.updatedAt, posteriorAoPacote: posterior(head, formacao.updatedAt),
      note: `parecer SERP de formação sem o assessment bruto${bruto !== null ? ` (assessment: ${bruto} B em #assessment)` : " (assessment em #assessment)"}`,
    });
  } else {
    ausentes.push({ sourceKey: "serp.architect.formation", owner: "arquiteto", reason: parecer ? "o parecer ligado ao ArticleDNA não existe mais nesta Marca (refeito ou removido)" : "o ArticleDNA fixado não aponta parecer SERP de formação" });
  }
  const territorio = texto(projecao?.fields.territoryRef);
  const territoriais = territorio ? await readWriterTerritorialMeta(context, territorio) : [];
  if (territoriais.length) {
    const maisRecente = territoriais[0].updatedAt;
    fonte({
      sourceKey: "serp.architect.territorial", owner: "arquiteto", status: "current_unpinned", bytes: null, items: territoriais.length,
      etag: writerEvidenceEtag([territorio, ...territoriais.map(item => `${item.workflowItemId}@${item.updatedAt}`)]), observedAt: maisRecente,
      posteriorAoPacote: posterior(head, maisRecente), note: "SERP no nível do território, não do artigo",
    });
  } else {
    ausentes.push({ sourceKey: "serp.architect.territorial", owner: "arquiteto", reason: territorio ? "sem parecer territorial gravado" : "o ArticleDNA fixado não declara território" });
  }

  const grafo = grafoCongelado ? await readWriterGraphMeta(context, grafoCongelado) : null;
  if (grafo) {
    fonte({
      sourceKey: `graph.article/${grafo.graphVersionId}`, owner: "arquiteto", status: grafo.workflowStatus ?? "desconhecido", bytes: null, items: null,
      etag: writerEvidenceEtag([grafo.graphVersionId, grafo.contentHash, grafo.workflowStatus]), observedAt: grafo.createdAt, posteriorAoPacote: false,
      note: grafo.latest
        ? `versão congelada pelo Radar; há v${grafo.latest.versionNumber ?? "?"} mais nova, posterior ao pacote, que não a substitui`
        : "versão congelada pelo Radar; arestas de entrada e saída do artigo",
    });
  } else {
    ausentes.push({ sourceKey: "graph.article", owner: "arquiteto", reason: grafoCongelado ? "a versão do grafo congelada não existe nesta Marca" : "o Radar não congelou versão do InternalLinkGraph neste pacote" });
  }

  /* ------------------------------ cache de SERP (4 lentes) ------------------------------ */
  const cache = await readWriterSerpCache(context, head, { mode: "meta" });
  const algumaColetada = cache.some(keyword => keyword.lenses.some(lente => lente.entry));
  if (cache.length && !algumaColetada) {
    ausentes.push({ sourceKey: "serp.cache/*", owner: "minerador", reason: `SERP de nenhuma das ${cache.length} keyword(s) no cache; a coleta é do Minerador, Arquiteto ou Radar — o Redator nunca coleta` });
  }
  for (const keyword of algumaColetada ? cache : []) {
    const chave = `serp.cache/${keyword.keywordId}`;
    const presentes = keyword.lenses.filter(lente => lente.entry);
    if (!presentes.length) {
      ausentes.push({ sourceKey: chave, owner: "minerador", reason: keyword.query ? "SERP não coletada no cache; o Redator nunca coleta" : "consulta da Qualificação fixada ilegível" });
      continue;
    }
    const datas = presentes.map(lente => lente.entry?.meta.collectedAt ?? "").filter(Boolean).sort();
    const recente = datas[datas.length - 1] ?? null;
    fonte({
      sourceKey: chave, owner: "minerador", status: presentes.some(lente => lente.stale) ? "partly_stale" : "collected", bytes: null, items: presentes.length,
      etag: writerEvidenceEtag(presentes.map(lente => `${lente.subjectId}@${lente.entry?.meta.collectedAt}#${lente.entry?.meta.providerRequestId}`)),
      observedAt: recente, posteriorAoPacote: presentes.some(lente => posterior(head, lente.entry?.meta.collectedAt)),
      note: `lentes: ${presentes.map(lente => `${lente.lens}${lente.lens === writerSerpCacheCanonicalLens ? "+corpo" : ""}${lente.stale ? " (vencida)" : ""}`).join(", ")}; descer com #<lente> ou #body`,
    });
  }
  if (!algumaColetada) {
    avisos.push("PAA, buscas relacionadas e citações do AI Overview só existem no cache de SERP; sem coleta, não há essas fontes neste artigo.");
  }

  /* ------------------------------ Marca, Publicações, especialista ------------------------------ */
  const [catalogo, propria, publicadas, especialistas] = await Promise.all([
    countWriterSiteCatalog(context),
    readWriterOwnPublication(context, head),
    countWriterBrandPublications(context),
    countWriterPosteriorSpecialist(context, head, momentoDoPacote(head)),
  ]);
  if (catalogo) {
    fonte({ sourceKey: "brand.site.catalog", owner: "marca", status: "current_unpinned", bytes: null, items: catalogo, etag: writerEvidenceEtag(["brand.site.catalog", catalogo]), observedAt: null, posteriorAoPacote: false, note: "páginas do site da Marca: url, título, h1, tipo; paginado" });
  } else {
    ausentes.push({ sourceKey: "brand.site.catalog", owner: "marca", reason: "catálogo do site vazio nesta Marca" });
  }
  if (propria) {
    const atualizada = texto(propria.updated_at);
    fonte({
      sourceKey: "publication.self", owner: "publicacoes", status: texto(propria.status) ?? "desconhecido", bytes: null, items: null,
      etag: writerEvidenceEtag([String(propria.id), texto(propria.content_hash), atualizada]), observedAt: atualizada, posteriorAoPacote: posterior(head, atualizada),
      note: "URL, slug e canonical publicados são protegidos (AGENTS.md §11)",
    });
  } else {
    ausentes.push({ sourceKey: "publication.self", owner: "publicacoes", reason: "o artigo não tem registro de publicação" });
  }
  if (publicadas) {
    fonte({ sourceKey: "publication.brand", owner: "publicacoes", status: "current_unpinned", bytes: null, items: publicadas, etag: writerEvidenceEtag(["publication.brand", publicadas]), observedAt: null, posteriorAoPacote: false, note: "registros de publicação da Marca; paginado" });
  }
  if (especialistas) {
    avisos.push(`${especialistas} contribuição(ões) de especialista recebida(s) depois do pacote: só a contagem aparece aqui; o conteúdo chega por reenvio do Radar (invariante 51).`);
    ausentes.push({ sourceKey: "specialist.posterior", owner: "radar", reason: `só contagem: ${especialistas}` });
  }

  const manifesto = buildWriterEvidenceManifest({
    documentId: head.documentId,
    articleId: head.articleId,
    brandId: head.brandId,
    generatedAt: writerEvidenceNow(context).toISOString(),
    sizes: medido ? "measured" : "unknown_migration_pending",
    bundle,
    sources: fontes,
    absent: ausentes,
    notices: avisos,
  });
  if (!manifesto) throw new WriterEvidenceError("source_too_large", "O manifesto não coube no limite de 8 kB.");
  return manifesto;
}

/* ================================ fundamentos ============================== */

export type WriterFoundations = {
  kind: "writer_foundations";
  documentId: string;
  articleId: string;
  brandId: string;
  documentHash: string;
  guards: readonly string[];
  writerMayNot: readonly string[];
  hierarchy: typeof WRITER_EVIDENCE_HIERARCHY;
  keywordContext: unknown;
  radarOrigin: unknown;
  documentRefs: WriterEvidenceHead["refs"];
  pendingDecisions: unknown[];
  bundle: { bundleId: string; bundleHash: string; researchProfile: string; observedAt: string | null; status: "frozen" } | null;
  serpStanding: unknown;
  conflicts: unknown[];
  limitations: unknown[];
  article: { versionId: string; contentHash: string | null; status: string | null; fields: Linha; invalidFields: string[] } | null;
  specialist: unknown;
  video: { summary: unknown; sources: unknown[]; results: unknown[] } | null;
  competitors: Array<{ url: string | null; domain: string | null; title: string | null; bestRank: number | null; classification: string | null }>;
  questions: Array<{ id: string | null; question: string; pages: number | null; status: string | null; declaredByArticle: boolean | null }>;
  absent: Array<{ field: string; reason: string }>;
  next: string;
  trimmed?: Array<{ field: string; kept: number; total: number; readAt: string }>;
};

const ONDE_LER = Object.freeze({
  competitors: "radar.bundle.observed.competitors",
  questions: "radar.bundle.observed.questions",
  "video.results": "radar.bundle.video",
  conflicts: "radar.bundle.conflicts",
  limitations: "radar.bundle.limitations",
  "specialist.items": "radar.bundle.specialist",
  pendingDecisions: "get_writer_document",
});

const cortar = (valor: unknown, limite: number) => {
  const linha = texto(valor);
  if (!linha) return null;
  const caracteres = [...linha];
  return caracteres.length > limite ? `${caracteres.slice(0, limite).join("")}…` : linha;
};

/**
 * OS FUNDAMENTOS, ≤ 24 kB. Sempre pequenos, sempre os mesmos caminhos, e sem
 * depender da migration. O que não coube diz quantos ficaram de fora e onde
 * ler inteiro.
 */
export async function readWriterFoundations(context: WriterEvidenceContext, documentId: string): Promise<WriterFoundations> {
  const head = await readWriterEvidenceHead(context, documentId);
  const lidos = head.dossier
    ? await readWriterBundlePaths(context, head, [["conflicts"], ["limitations"], ["specialist"], ["video"], ["observed", "competitors"], ["observed", "questions"]])
    : new Map<string, unknown>();
  const projecao = await readWriterArticleProjection(context, head);
  const ausentes: WriterFoundations["absent"] = [];

  const concorrentes = lista(lidos.get("observed.competitors")).map(registro).filter((item): item is Linha => Boolean(item))
    .map(item => {
      const posicoes = lista(item.ranks).map(posicao => registro(posicao)?.rank).filter((rank): rank is number => typeof rank === "number");
      return {
        url: texto(item.url), domain: texto(item.domain), title: cortar(item.title, 160),
        bestRank: posicoes.length ? Math.min(...posicoes) : null, classification: texto(item.classification),
      };
    })
    .sort((a, b) => (a.bestRank ?? Number.MAX_SAFE_INTEGER) - (b.bestRank ?? Number.MAX_SAFE_INTEGER));
  const perguntas = lista(lidos.get("observed.questions")).map(registro).filter((item): item is Linha => Boolean(item))
    .map(item => ({
      id: texto(item.id), question: cortar(item.canonicalQuestion, 240) ?? "", pages: typeof item.pages === "number" ? item.pages : null,
      status: texto(item.status), declaredByArticle: typeof item.declaredByArticle === "boolean" ? item.declaredByArticle : null,
    }))
    .filter(item => item.question);

  const video = registro(lidos.get("video"));
  const projecaoDoVideo = video ? {
    summary: video.summary ?? null,
    sources: lista(video.sources).map(registro).filter((item): item is Linha => Boolean(item))
      .map(item => ({ videoSourceId: texto(item.videoSourceId), displayName: cortar(item.displayName, 120), languageCode: texto(item.languageCode), processingVersion: item.processingVersion ?? null })),
    results: lista(video.results).map(registro).filter((item): item is Linha => Boolean(item))
      .map(item => ({ topic: cortar(item.topic, 160), state: texto(item.state), relatedSectionTitle: cortar(item.relatedSectionTitle, 160), extracts: lista(item.extracts).length })),
  } : null;

  if (!head.dossier) ausentes.push({ field: "bundle", reason: head.schemaVersion === 1 ? "documento do Planejador (v1): sem dossiê do Radar" : "documento sem dossiê: não inferir evidências" });
  else if (head.dossier.researchProfile !== "GOOGLE") ausentes.push({ field: "competitors/questions", reason: `fotografia do Google ausente no perfil ${head.dossier.researchProfile}` });
  if (!projecao) ausentes.push({ field: "article", reason: isLegacyVersionReference(head.refs.articleDnaRef) ? "ArticleDNA com referência legada" : "a versão fixada do ArticleDNA não existe nesta Marca" });
  if (head.dossier && !video) ausentes.push({ field: "video", reason: "o pacote não trouxe evidência audiovisual" });
  if (head.dossier && !registro(lidos.get("specialist"))) ausentes.push({ field: "specialist", reason: "nenhuma contribuição de especialista aceita no pacote" });

  const fundamentos: WriterFoundations = {
    kind: "writer_foundations",
    documentId: head.documentId,
    articleId: head.articleId,
    brandId: head.brandId,
    documentHash: head.contentHash,
    guards: WRITER_EVIDENCE_GUARDS,
    writerMayNot: writerMayNotOf(head),
    hierarchy: WRITER_EVIDENCE_HIERARCHY,
    keywordContext: head.dossier?.keywordContext ?? null,
    radarOrigin: head.radarOrigin,
    documentRefs: head.refs,
    pendingDecisions: head.pendingDecisions,
    bundle: head.dossier
      ? { bundleId: head.dossier.bundleId, bundleHash: head.dossier.bundleHash, researchProfile: head.dossier.researchProfile, observedAt: head.bundleObservedAt, status: "frozen" }
      : null,
    serpStanding: head.serpStanding,
    conflicts: truncateWriterThirdPartyText(lista(lidos.get("conflicts"))).value as unknown[],
    limitations: lista(lidos.get("limitations")),
    article: projecao
      ? { versionId: projecao.meta.versionId, contentHash: projecao.meta.contentHash, status: projecao.meta.status, fields: projecao.fields, invalidFields: projecao.invalidFields }
      : null,
    specialist: lidos.get("specialist") ?? null,
    video: projecaoDoVideo,
    competitors: concorrentes,
    questions: perguntas,
    absent: ausentes,
    next: "Leia get_writer_evidence_manifest e, para a seção que está escrevendo, read_writer_evidence com a sourceKey do manifesto. As perguntas orientam a cobertura dentro do texto — nunca uma seção de FAQ.",
  };
  const cabe = fitWriterFoundations(fundamentos, ONDE_LER);
  if (!cabe) throw new WriterEvidenceError("source_too_large", "Os fundamentos não couberam no limite de 24 kB.");
  return cabe as WriterFoundations;
}

/* ================================== fatias ================================= */

export type WriterEvidenceSliceRequest = {
  sourceKey: string;
  cursor?: string | null;
  fields?: string[] | null;
  ifNoneMatch?: string | null;
  /** Teto da resposta, 1.024–32.768 B; padrão 16.384. */
  maxBytes?: number | null;
  limit?: number | null;
};

type Pedido = { offset: number; limit: number; maxBytes: number; fields: string[] | undefined };

const WRITER_EVIDENCE_RESPONSE_MIN_BYTES = 4_096;

type Preparado = {
  /** Identidade da fonte, conhecida ANTES de ler o conteúdo; `null` = fonte mutável, o etag sai dos dados. */
  identity: Array<string | number | boolean | null> | null;
  origin: Omit<WriterEvidenceOrigin, "module">;
  posteriorAoPacote: boolean;
  hierarchy: WriterEvidenceHierarchy;
  truncate: boolean;
  notice?: string | null;
  load: (pedido: Pedido) => Promise<WriterSliceRow[]>;
};

function recusar(motivo: string): never {
  throw new WriterEvidenceError("source_not_in_manifest", motivo);
}

const linhasDe = (valor: unknown, pedido: Pedido, extra: { excludeKeys?: readonly string[] } = {}) =>
  writerSliceRowsOf(valor, { offset: pedido.offset, limit: pedido.limit, maxBytes: pedido.maxBytes, fields: pedido.fields, excludeKeys: extra.excludeKeys });

/** Uma lista paginada pelo PostgREST (`range`), na forma das linhas da fatia. */
function linhasDeLista(itens: readonly unknown[], total: number | null, pedido: Pedido): WriterSliceRow[] {
  let acumulado = 0;
  return itens.map((item, indice) => {
    const bytes = writerEvidenceJsonBytes(item);
    acumulado += bytes;
    const omitido = acumulado > pedido.maxBytes;
    return { containerType: "array", total: total ?? pedido.offset + itens.length, ordinal: pedido.offset + indice, span: 1, itemKey: null, valueType: "object", bytes, omitted: omitido, value: omitido ? null : item };
  });
}

async function secaoDoPacoteSemMigration(context: WriterEvidenceContext, head: WriterEvidenceHead, caminho: readonly string[]): Promise<unknown> {
  for (let tamanho = caminho.length; tamanho > 0; tamanho -= 1) {
    const prefixo = caminho.slice(0, tamanho);
    if (!writerBundlePathReadableWithoutMigration(prefixo)) continue;
    const lidos = await readWriterBundlePaths(context, head, [prefixo]);
    return navegar(lidos.get(prefixo.join(".")), caminho.slice(tamanho));
  }
  throw new WriterEvidenceError("migration_pendente",
    "Esta seção do dossiê é paginada no banco pela função writer_evidence_slice, que ainda não foi aplicada. Nada é baixado para compensar.",
    { migration: "20260923150000_writer_evidence_reader" });
}

async function prepararPacote(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  const dossie = head.dossier ?? recusar("Este documento não tem dossiê do Radar.");
  const caminho = [...chave.basePath, ...chave.path];
  if (head.dossier?.researchProfile !== "GOOGLE" && caminho[0] === "observed") recusar("A fotografia do Google não existe neste perfil de pesquisa.");
  const origin = { entityId: dossie.bundleId, versionId: dossie.bundleId, contentHash: dossie.bundleHash, collectedAt: head.bundleObservedAt, status: "frozen" };
  const hierarchy = writerEvidenceHierarchyOf({ family: "radar.bundle", bundlePath: caminho, serpAuthoritative: head.serpStanding?.authoritative });
  const alias = WRITER_BUNDLE_STRUCTURAL_ALIAS;
  if (alias.path.every((parte, indice) => caminho[indice] === parte)) {
    const destino = `radar.bundle.${[...alias.aliasOf, ...caminho.slice(alias.path.length)].join(".")}`;
    return {
      identity: [dossie.bundleHash, "alias"], origin, posteriorAoPacote: false, hierarchy, truncate: false,
      notice: `Cópia idêntica de ${destino} (525 kB medidos); leia por lá. A deduplicação é do Radar.`,
      load: async () => [],
    };
  }
  const exatamenteEstrutural = caminho.length === 3 && caminho.every((parte, indice) => parte === alias.path[indice]);
  const excludeKeys = exatamenteEstrutural ? ["semantic"] : undefined;
  return {
    identity: [dossie.bundleHash], origin, posteriorAoPacote: false, hierarchy, truncate: true,
    notice: exatamenteEstrutural ? `A chave semantic foi omitida: é cópia de radar.bundle.${alias.aliasOf.join(".")}.` : null,
    load: async pedido => {
      const rpc = await callWriterEvidenceSliceRpc(context, {
        documentId: head.documentId, source: "document", path: ["importedContext", "dossier", "bundle", ...caminho],
        offset: pedido.offset, limit: pedido.limit, maxBytes: pedido.maxBytes, fields: pedido.fields, excludeKeys,
      });
      if (rpc) return rpc;
      return linhasDe(await secaoDoPacoteSemMigration(context, head, caminho), pedido, { excludeKeys });
    },
  };
}

async function fontesDeVideoDoPacote(context: WriterEvidenceContext, head: WriterEvidenceHead) {
  if (!head.dossier) return [];
  const lidos = await readWriterBundlePaths(context, head, [["video", "sources"]]);
  return writerVideoSourcesOf(lidos.get("video.sources"));
}

async function prepararTranscricao(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  const id = (chave.ref ?? "").toLowerCase();
  const fonte = (await fontesDeVideoDoPacote(context, head)).find(item => item.videoSourceId.toLowerCase() === id)
    ?? recusar("Este vídeo não está entre as fontes congeladas do pacote.");
  const [situacao] = await readWriterVideoStatuses(context, head, [fonte]);
  if (situacao.situation !== "available") {
    throw new WriterEvidenceError("source_absent", SITUACAO_DO_VIDEO[situacao.situation], { situation: situacao.situation });
  }
  const caminho = chave.path.length ? [...chave.path] : ["transcript_text"];
  if (caminho[0] !== "transcript_text" && caminho[0] !== "segments") throw new WriterEvidenceError("invalid_request", "A transcrição aceita #transcript_text ou #segments.");
  if (caminho[0] === "transcript_text" && caminho.length > 1) throw new WriterEvidenceError("invalid_request", "O texto da transcrição é paginado pelo cursor, não por caminho.");
  return {
    identity: [head.dossier?.bundleHash ?? null, id, situacao.processingVersion, situacao.textHash],
    origin: { entityId: fonte.videoSourceId, versionId: String(situacao.processingVersion), contentHash: situacao.textHash, collectedAt: situacao.textCreatedAt, status: "active" },
    posteriorAoPacote: false,
    hierarchy: writerEvidenceHierarchyOf({ family: "video.transcript" }),
    truncate: false,
    notice: "Transcrição de terceiro: pesquisa. Não copiar trechos; parafrasear e confrontar.",
    load: async pedido => {
      const rpc = await callWriterEvidenceSliceRpc(context, {
        documentId: head.documentId, source: "video_text", path: caminho, ref: fonte.videoSourceId,
        offset: pedido.offset, limit: pedido.limit, maxBytes: pedido.maxBytes, fields: pedido.fields,
      });
      if (!rpc) throw new WriterEvidenceError("migration_pendente", "A transcrição é paginada no banco pela função writer_evidence_slice, que ainda não foi aplicada.", { migration: "20260923150000_writer_evidence_reader" });
      return rpc;
    },
  };
}

const semDiagnostico = (registroLido: Linha): Linha => {
  const pesquisa = registro(registroLido.research);
  if (!pesquisa || !("diagnostic" in pesquisa)) return registroLido;
  const { diagnostic: _diagnostico, ...resto } = pesquisa;
  void _diagnostico;
  return { ...registroLido, research: resto };
};

async function prepararSnapshot(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  if (!head.radarOrigin) recusar("Documento sem origem no Radar.");
  let meta: Awaited<ReturnType<typeof readWriterSerpSnapshotMeta>>;
  if (chave.family === "serp.radar.snapshot") {
    const rpc = await callWriterEvidenceSliceRpc(context, {
      documentId: head.documentId, source: "analysis_version", path: ["payload", "serpSnapshotId"],
      offset: 0, limit: 1, maxBytes: WRITER_EVIDENCE_LIMITS.sliceMinBytes,
    });
    if (!rpc) throw new WriterEvidenceError("migration_pendente", "O snapshot entregue é resolvido pela função SQL, que ainda não foi aplicada. serp.radar.snapshot.latest é posterior ao pacote e não substitui o snapshot entregue: use-o só para confronto datado.", { migration: "20260923150000_writer_evidence_reader" });
    const id = texto(rpc[0]?.value);
    meta = id ? await readWriterSerpSnapshotMeta(context, head, id) : null;
  } else {
    meta = await readWriterLatestSerpSnapshotMeta(context, head);
  }
  if (!meta) throw new WriterEvidenceError("source_absent", "Não há snapshot SERP deste artigo para esta chave.");
  const snapshot = meta;
  return {
    identity: [snapshot.id, snapshot.contentHash, snapshot.reviewStatus],
    origin: { entityId: snapshot.id, versionId: snapshot.snapshotVersion === null ? null : String(snapshot.snapshotVersion), contentHash: snapshot.contentHash, collectedAt: snapshot.createdAt, status: [snapshot.status, snapshot.reviewStatus ? `revisão: ${snapshot.reviewStatus}` : null].filter(Boolean).join("; ") },
    posteriorAoPacote: chave.family === "serp.radar.snapshot.latest" && posterior(head, snapshot.createdAt),
    hierarchy: writerEvidenceHierarchyOf({ family: chave.family }),
    truncate: true,
    notice: chave.family === "serp.radar.snapshot.latest" ? "Snapshot mais recente do artigo: observação datada; não substitui o pacote entregue." : null,
    load: async pedido => {
      const lido = await readWriterSerpSnapshotRecord(context, head, snapshot.id);
      const base = chave.path.length ? navegar(lido, chave.path) : semDiagnostico(lido);
      return linhasDe(base, pedido);
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function prepararCorrida(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  const origem = head.radarOrigin ?? recusar("Documento sem origem no Radar.");
  if (!UUID.test(origem.radarItemId)) throw new WriterEvidenceError("source_absent", "A origem do Radar não aponta um item válido.");
  const alias = chave.runAlias ?? "";
  const caminho = [...chave.basePath, ...chave.path];
  const listagem = chave.path.length === 0;
  const excluidos = WRITER_RUN_DEFAULT_EXCLUDED_KEYS[alias];
  const noItem = alias === "extractions" ? chave.path.length <= 1 : listagem;
  return {
    identity: ["run", alias, origem.analysisVersionId],
    origin: { entityId: origem.radarItemId, versionId: origem.analysisVersionId, contentHash: null, collectedAt: null, status: "research_not_frozen" },
    posteriorAoPacote: false,
    hierarchy: writerEvidenceHierarchyOf({ family: "run" }),
    truncate: listagem,
    notice: alias.startsWith("amazon.")
      ? "Produtos da corrida: pesquisa, não congelada. A shortlist editorial é conclusão do Radar e não está congelada."
      : "Corrida da versão de análise entregue: pesquisa, não matéria-prima.",
    load: async pedido => {
      const fields = pedido.fields ?? (listagem ? WRITER_RUN_DEFAULT_FIELDS[alias] as string[] | undefined : undefined);
      const excludeKeys = noItem && excluidos ? excluidos.filter(chaveExcluida => !pedido.fields?.includes(chaveExcluida)) : undefined;
      const rpc = await callWriterEvidenceSliceRpc(context, {
        documentId: head.documentId, source: "radar_run", path: caminho,
        offset: pedido.offset, limit: pedido.limit, maxBytes: pedido.maxBytes, fields, excludeKeys,
      });
      if (!rpc) throw new WriterEvidenceError("migration_pendente", "As corridas do Radar são paginadas no banco pela função writer_evidence_slice, que ainda não foi aplicada.", { migration: "20260923150000_writer_evidence_reader" });
      return rpc;
    },
  };
}

/**
 * `vigenteDesde` só existe para o contexto da Marca (versão vigente, não
 * fixada): é a data da versão, e a régua de "posterior ao pacote" é a mesma
 * do manifesto. DNA fixado no documento nunca é posterior — é a base.
 */
function prepararDna(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey, alvo: { versionId: string; entityId: string | null; contentHash: string | null; types: string[]; status?: string; vigenteDesde?: string | null }): Preparado {
  const vigente = alvo.vigenteDesde !== undefined;
  return {
    identity: [alvo.versionId, alvo.contentHash],
    origin: { entityId: alvo.entityId, versionId: alvo.versionId, contentHash: alvo.contentHash, collectedAt: vigente ? alvo.vigenteDesde ?? null : null, status: alvo.status ?? "fixed" },
    posteriorAoPacote: vigente && posterior(head, alvo.vigenteDesde),
    hierarchy: writerEvidenceHierarchyOf({ family: chave.family }),
    truncate: false,
    notice: chave.family === "dna.brand" || chave.family === "brand.skill" ? "Versão vigente da Marca, não fixada no documento." : null,
    load: async pedido => {
      const lida = await readWriterDnaVersion(context, { versionId: alvo.versionId, expectedTypes: alvo.types, entityId: alvo.entityId });
      return linhasDe(chave.path.length ? navegar(lida.data, chave.path) : lida.data, pedido);
    },
  };
}

async function prepararFormacao(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  const projecao = await readWriterArticleProjection(context, head, ["serpAssessmentRef"]);
  const parecer = registroDoParecer(projecao?.fields.serpAssessmentRef) ?? recusar("O ArticleDNA fixado não aponta parecer SERP de formação.");
  const noAssessment = chave.path[0] === "assessment";
  const meta = await readWriterFormationMeta(context, parecer);
  if (!meta) throw new WriterEvidenceError("source_absent", "O parecer SERP de formação ligado ao ArticleDNA não existe mais nesta Marca.");
  /* Mesmo id, outro hash: é outro parecer. Servi-lo como o fixado trocaria a base em silêncio (invariante 30). */
  if (!meta.hashMatches) throw new WriterEvidenceError("source_absent", PARECER_SUBSTITUIDO, { reason: "hash_mismatch" });
  return {
    identity: null,
    origin: { entityId: parecer.entityId, versionId: null, contentHash: parecer.contentHash, collectedAt: meta.updatedAt, status: meta.state },
    posteriorAoPacote: posterior(head, meta.updatedAt),
    hierarchy: writerEvidenceHierarchyOf({ family: "serp.architect.formation" }),
    truncate: true,
    load: async pedido => {
      if (noAssessment) {
        const bruto = await readWriterFormationAssessment(context, parecer);
        if (bruto === undefined) throw new WriterEvidenceError("source_absent", "O parecer SERP de formação ligado ao ArticleDNA não existe mais nesta Marca.");
        if (parecer.contentHash && registro(bruto)?.contentHash !== parecer.contentHash) {
          throw new WriterEvidenceError("source_absent", PARECER_SUBSTITUIDO, { reason: "hash_mismatch" });
        }
        return linhasDe(navegar(bruto, chave.path.slice(1)), pedido);
      }
      const formacao = await readWriterFormation(context, parecer);
      if (!formacao) throw new WriterEvidenceError("source_absent", "O parecer SERP de formação ligado ao ArticleDNA não existe mais nesta Marca.");
      if (!formacao.hashMatches) throw new WriterEvidenceError("source_absent", PARECER_SUBSTITUIDO, { reason: "hash_mismatch" });
      const base = { state: formacao.state, updatedAt: formacao.updatedAt, hashMatchesArticleDnaRef: formacao.hashMatches, ...formacao.data };
      return linhasDe(chave.path.length ? navegar(base, chave.path) : base, pedido);
    },
  };
}

async function prepararTerritorial(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  const projecao = await readWriterArticleProjection(context, head, ["territoryRef"]);
  const territorio = texto(projecao?.fields.territoryRef) ?? recusar("O ArticleDNA fixado não declara território.");
  const [maisRecente] = await readWriterTerritorialMeta(context, territorio);
  if (!maisRecente) throw new WriterEvidenceError("source_absent", "Sem parecer territorial gravado para o território do ArticleDNA.");
  return {
    identity: null,
    origin: { entityId: territorio, versionId: null, contentHash: null, collectedAt: maisRecente.updatedAt, status: "current_unpinned" },
    posteriorAoPacote: posterior(head, maisRecente.updatedAt),
    hierarchy: writerEvidenceHierarchyOf({ family: "serp.architect.territorial" }),
    truncate: true,
    notice: "SERP no nível do território, não do artigo.",
    load: async pedido => {
      const pareceres = await readWriterTerritorial(context, territorio);
      const base = pareceres.map(item => ({ questionId: item.questionId, state: item.state, updatedAt: item.updatedAt, ...item.data }));
      return linhasDe(chave.path.length ? navegar(base, chave.path) : base, pedido);
    },
  };
}

async function prepararGrafo(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  if (!head.dossier) recusar("Documento sem dossiê do Radar: não há versão do grafo congelada.");
  const lidos = await readWriterBundlePaths(context, head, [["observed", "internalLinks", "graphVersionId"]]);
  const congelado = texto(lidos.get("observed.internalLinks.graphVersionId"));
  if (!congelado || congelado !== chave.ref) recusar("Esta versão do grafo não é a que o Radar congelou para o artigo.");
  const meta = await readWriterGraphMeta(context, congelado);
  if (!meta) throw new WriterEvidenceError("source_absent", "A versão do grafo congelada não existe nesta Marca.");
  const versaoDoArtigo = head.radarOrigin?.articleDnaVersionId ?? head.refs.articleDnaRef.versionId;
  return {
    identity: [meta.graphVersionId, meta.contentHash, meta.workflowStatus],
    origin: { entityId: meta.graphId, versionId: meta.graphVersionId, contentHash: meta.contentHash, collectedAt: meta.createdAt, status: meta.workflowStatus },
    posteriorAoPacote: false,
    hierarchy: writerEvidenceHierarchyOf({ family: "graph.article" }),
    truncate: false,
    notice: meta.latest ? `Há versão mais nova do grafo (v${meta.latest.versionNumber ?? "?"}), posterior ao pacote; ela não substitui a congelada.` : null,
    load: async pedido => {
      const arestas = await readWriterGraphEdges(context, meta.graphVersionId, versaoDoArtigo);
      return linhasDe(chave.path.length ? navegar(arestas, chave.path) : arestas, pedido);
    },
  };
}

async function prepararCache(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  const referencia = writerKeywordRefOf(head, chave.ref);
  if (!referencia || isLegacyVersionReference(referencia)) recusar("Esta keyword não está fixada no documento.");
  const pedida = chave.basePath[0] ?? null;
  const corpo = pedida === "body";
  const lente = pedida && !corpo ? writerSerpCacheLensOf(pedida) : null;
  if (pedida && !corpo && !lente) throw new WriterEvidenceError("invalid_request", "Lente desconhecida. Use desktop-windows, desktop-macos, mobile-android, mobile-ios ou body.");
  const lentes = corpo ? [WRITER_SERP_CACHE_CANONICAL_LENS] : lente ? [lente] : undefined;
  const [meta] = await readWriterSerpCache(context, head, { keywordIds: [referencia.entityId], mode: "meta", lenses: lentes });
  const presentes = (meta?.lenses ?? []).filter(item => item.entry);
  if (!presentes.length) throw new WriterEvidenceError("source_absent", "SERP não coletada no cache para esta keyword. O Redator nunca coleta.");
  const coleta = presentes.map(item => item.entry?.meta.collectedAt ?? "").filter(Boolean).sort().pop() ?? null;
  return {
    identity: presentes.map(item => `${item.subjectId}@${item.entry?.meta.collectedAt}#${item.entry?.meta.providerRequestId}`),
    origin: {
      entityId: referencia.entityId, versionId: presentes.length === 1 ? presentes[0].subjectId : null,
      contentHash: presentes.length === 1 ? presentes[0].entry?.meta.providerRequestId ?? null : null,
      collectedAt: coleta, status: presentes.some(item => item.stale) ? "vencida" : "vigente",
    },
    posteriorAoPacote: presentes.some(item => posterior(head, item.entry?.meta.collectedAt)),
    hierarchy: writerEvidenceHierarchyOf({ family: "serp.cache" }),
    truncate: true,
    notice: "Observação do cache de SERP, datada e não revisada pelo Radar; não substitui o pacote.",
    load: async pedido => {
      if (corpo) {
        const [lido] = await readWriterSerpCache(context, head, { keywordIds: [referencia.entityId], mode: "body", lenses: lentes });
        const body = lido?.lenses[0]?.entry?.body;
        if (!body) throw new WriterEvidenceError("source_absent", "A lente canônica não tem corpo gravado no cache.");
        const itens = navegar(body, ["tasks", "0", "result", "0", "items"]);
        return linhasDe(Array.isArray(itens) ? itens : [], pedido);
      }
      const [observacao] = await readWriterSerpCache(context, head, { keywordIds: [referencia.entityId], mode: "observation", lenses: lentes });
      const digestos = lente && !writerSerpCacheIsCanonical(lente)
        ? (await readWriterSerpCache(context, head, { keywordIds: [referencia.entityId], mode: "digest", lenses: lentes }))[0]
        : null;
      const porLente = Object.fromEntries((observacao?.lenses ?? []).filter(item => item.entry).map(item => [item.lens, {
        meta: item.entry?.meta, stale: item.stale, observation: item.entry?.observation ?? null,
        ...(digestos ? { digest: digestos.lenses.find(outra => outra.lens === item.lens)?.entry?.digest ?? null } : {}),
      }]));
      return linhasDe(lente ? porLente[pedida as string] ?? null : porLente, pedido);
    },
  };
}

async function prepararLista(chave: WriterEvidenceSourceKey, input: {
  ler: (offset: number, limit: number) => Promise<{ rows: Linha[]; total: number | null }>;
}): Promise<Preparado> {
  if (chave.path.length) throw new WriterEvidenceError("invalid_request", "Esta fonte é uma lista paginada: use o cursor, não um caminho.");
  return {
    identity: null,
    origin: { entityId: null, versionId: null, contentHash: null, collectedAt: null, status: "current_unpinned" },
    posteriorAoPacote: false,
    hierarchy: writerEvidenceHierarchyOf({ family: chave.family }),
    truncate: true,
    load: async pedido => {
      const pagina = await input.ler(pedido.offset, pedido.limit);
      const projetadas = pedido.fields ? pagina.rows.map(linha => Object.fromEntries(Object.entries(linha).filter(([campo]) => pedido.fields!.includes(campo)))) : pagina.rows;
      return linhasDeLista(projetadas, pagina.total, pedido);
    },
  };
}

async function preparar(context: WriterEvidenceContext, head: WriterEvidenceHead, chave: WriterEvidenceSourceKey): Promise<Preparado> {
  const familia: WriterEvidenceFamily = chave.family;
  switch (familia) {
    case "radar.bundle": return prepararPacote(context, head, chave);
    case "video.transcript": return prepararTranscricao(context, head, chave);
    case "serp.radar.snapshot":
    case "serp.radar.snapshot.latest": return prepararSnapshot(context, head, chave);
    case "run": return prepararCorrida(context, head, chave);
    case "dna.article": {
      const referencia = head.refs.articleDnaRef;
      if (isLegacyVersionReference(referencia) || chave.ref !== referencia.versionId) recusar("Esta versão do ArticleDNA não é a fixada no documento.");
      return prepararDna(context, head, chave, { versionId: referencia.versionId, entityId: referencia.entityId, contentHash: referencia.contentHash, types: ["article_dna"] });
    }
    case "dna.silo": {
      const referencia = head.refs.siloDnaRef;
      if (isLegacyVersionReference(referencia) || chave.ref !== referencia.versionId) recusar("Esta versão do SiloDNA não é a fixada no documento.");
      return prepararDna(context, head, chave, { versionId: referencia.versionId, entityId: referencia.entityId, contentHash: referencia.contentHash, types: ["silo_dna"] });
    }
    case "dna.keyword": {
      const referencia = writerKeywordRefOf(head, chave.ref);
      if (!referencia || isLegacyVersionReference(referencia)) recusar("Esta keyword não está fixada no documento.");
      return prepararDna(context, head, chave, { versionId: referencia.versionId, entityId: referencia.entityId, contentHash: referencia.contentHash, types: [KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE] });
    }
    case "dna.keyword.metrics":
      return {
        identity: null,
        origin: { entityId: null, versionId: null, contentHash: null, collectedAt: null, status: "current_unpinned" },
        posteriorAoPacote: false,
        hierarchy: writerEvidenceHierarchyOf({ family: "dna.keyword.metrics" }),
        truncate: false,
        notice: "Métricas vigentes no Minerador, pelo snapshot canônico; não fixadas no documento.",
        load: async pedido => {
          const metricas = await readWriterKeywordMetrics(context, head.refs.keywordDnaRefs.map(referencia => referencia.entityId));
          return linhasDe(chave.path.length ? navegar(metricas, chave.path) : metricas, pedido);
        },
      };
    case "dna.brand": {
      if (chave.ref !== "current") recusar("A BrandDNA é lida na versão vigente: use dna.brand/current.");
      const { brandDna } = await readWriterBrandContextVersions(context);
      if (!brandDna) throw new WriterEvidenceError("source_absent", "Nenhum BrandDNA aprovado nesta Marca.");
      return prepararDna(context, head, chave, { versionId: brandDna.versionId, entityId: brandDna.entityId, contentHash: brandDna.contentHash, types: ["brand_dna"], status: "current_unpinned", vigenteDesde: brandDna.createdAt });
    }
    case "brand.skill": {
      const { skills } = await readWriterBrandContextVersions(context);
      const skill = skills.find(item => item.versionId === chave.ref) ?? recusar("Esta versão de Skill não é a corrente da Marca.");
      return prepararDna(context, head, chave, { versionId: skill.versionId, entityId: skill.entityId, contentHash: skill.contentHash, types: ["brand_skill"], status: skill.lifecycle, vigenteDesde: skill.createdAt });
    }
    case "serp.architect.formation": return prepararFormacao(context, head, chave);
    case "serp.architect.territorial": return prepararTerritorial(context, head, chave);
    case "graph.article": return prepararGrafo(context, head, chave);
    case "serp.cache": return prepararCache(context, head, chave);
    case "brand.site.catalog":
      return prepararLista(chave, { ler: (offset, limit) => readWriterSiteCatalogPage(context, offset, limit) });
    case "publication.brand":
      return prepararLista(chave, { ler: (offset, limit) => readWriterBrandPublicationsPage(context, offset, limit) });
    case "publication.self": {
      /* Uma linha de colunas estreitas: lida uma vez, para datar a fonte e servir a página. */
      const propria = await readWriterOwnPublication(context, head);
      if (!propria) throw new WriterEvidenceError("source_absent", "O artigo não tem registro de publicação.");
      const atualizada = texto(propria.updated_at);
      return {
        identity: null,
        origin: { entityId: head.articleId, versionId: null, contentHash: texto(propria.content_hash), collectedAt: atualizada, status: texto(propria.status) },
        posteriorAoPacote: posterior(head, atualizada),
        hierarchy: writerEvidenceHierarchyOf({ family: "publication.self" }),
        truncate: false,
        notice: "URL, slug e canonical publicados são protegidos (AGENTS.md §11).",
        load: async pedido => linhasDe(propria, pedido),
      };
    }
    case "specialist.posterior": {
      const contagem = await countWriterPosteriorSpecialist(context, head, momentoDoPacote(head));
      throw new WriterEvidenceError("count_only",
        "Contribuição de especialista posterior ao pacote aparece só como contagem; o conteúdo chega por reenvio do Radar (invariante 51).",
        { count: contagem });
    }
    case "run.amazon.shortlist":
      throw new WriterEvidenceError("source_absent", "A shortlist editorial da Amazon é conclusão do Radar e não está congelada; o Redator não a recalcula (invariante 30).");
    case "dna.siloPage":
    case "dna.keyword.presentation":
      throw new WriterEvidenceError("source_absent", "Sem vínculo determinístico com o artigo: ausência declarada.");
    default:
      return recusar("Chave de fonte desconhecida.");
  }
}

/**
 * UMA FATIA. A chave precisa estar na gramática E ser alcançável pelas
 * referências do documento; id inventado é recusado (AGENTS.md §9).
 *
 * `ifNoneMatch` igual ao etag responde `not_modified` SEM ler o conteúdo
 * quando a identidade da fonte é conhecida antes (dossiê congelado, versões
 * de DNA imutáveis, vídeo, snapshot, grafo, cache). Fonte mutável (métricas,
 * catálogo, publicações, pareceres) calcula o etag dos dados: a leitura
 * acontece, mas nada é devolvido.
 */
export async function readWriterEvidence(
  context: WriterEvidenceContext,
  documentId: string,
  pedido: WriterEvidenceSliceRequest,
): Promise<WriterEvidenceEnvelope | WriterEvidenceNotModified> {
  const chave = parseWriterEvidenceSourceKey(pedido.sourceKey);
  if (!chave) throw new WriterEvidenceError("source_not_in_manifest", "sourceKey fora da gramática do manifesto.");
  const offset = parseWriterEvidenceCursor(pedido.cursor);
  if (offset === null) throw new WriterEvidenceError("invalid_request", "cursor inválido: use o `next` da página anterior.");
  const fields = parseWriterEvidenceFields(pedido.fields);
  if (fields === null) throw new WriterEvidenceError("invalid_request", "fields inválido: até 30 chaves de primeiro nível.");
  /*
   * O teto é da RESPOSTA inteira. O envelope (origem, guardas, o que o Redator
   * não pode) ocupa ~1,4 kB: abaixo de 4 kB não sobraria página. A página
   * recebe o teto menos a reserva do envelope, e nunca menos que 1 kB.
   */
  const teto = Math.max(WRITER_EVIDENCE_RESPONSE_MIN_BYTES, clampWriterSliceBytes(pedido.maxBytes ?? undefined));
  const paginaPedida: Pedido = {
    offset,
    limit: clampWriterSliceItems(pedido.limit ?? undefined),
    maxBytes: Math.max(WRITER_EVIDENCE_LIMITS.sliceMinBytes, teto - WRITER_EVIDENCE_ENVELOPE_RESERVE_BYTES),
    fields,
  };

  const head = await readWriterEvidenceHead(context, documentId);
  const preparado = await preparar(context, head, chave);
  const etagDe = (identidade: ReadonlyArray<unknown>) => writerEvidenceEtag([
    chave.raw, JSON.stringify(identidade), paginaPedida.offset, paginaPedida.limit, teto, fields ? fields.join(",") : null,
  ]);
  const naoMudou = (etag: string): WriterEvidenceNotModified | null =>
    pedido.ifNoneMatch && pedido.ifNoneMatch === etag ? { sourceKey: chave.raw, notModified: true, etag } : null;

  if (preparado.identity) {
    const cedo = naoMudou(etagDe(preparado.identity));
    if (cedo) return cedo;
  }
  const linhas = await preparado.load(paginaPedida);
  const etag = preparado.identity ? etagDe(preparado.identity) : etagDe(linhas.map(linha => [linha.ordinal, linha.itemKey, linha.bytes, linha.omitted, linha.value]));
  const tarde = naoMudou(etag);
  if (tarde) return tarde;

  const pagina = preparado.notice && !linhas.length && chave.family === "radar.bundle"
    ? null
    : writerEvidencePageOf(linhas, { offset: paginaPedida.offset, baseKey: chave.raw, truncate: preparado.truncate });
  const envelope = writerEvidenceEnvelope({
    sourceKey: chave.raw,
    family: chave.family,
    origin: preparado.origin,
    posteriorAoPacote: preparado.posteriorAoPacote,
    hierarchy: preparado.hierarchy,
    etag,
    writerMayNot: writerMayNotOf(head),
    page: pagina,
    notice: preparado.notice ?? null,
  });
  const cabe = fitWriterEvidenceEnvelope(envelope, teto);
  if (!cabe) throw new WriterEvidenceError("source_too_large", "A página não coube no teto pedido; desça um nível com sourceKey#caminho.");
  return cabe;
}

/** Rótulo legível do nível, para quem monta instrução de IA. */
export const writerEvidenceLevelLabel = (nivel: keyof typeof RADAR_EVIDENCE_LABEL) => RADAR_EVIDENCE_LABEL[nivel];

/* =========================== etapa B2 · consumidores ========================= */

export type WriterEvidenceSourceDescription = {
  /** A chave como citada, normalizada. */
  sourceKey: string;
  family: WriterEvidenceFamily;
  frozen: boolean;
  level: WriterEvidenceHierarchy["level"];
  posteriorAoPacote: boolean;
  observedAt: string | null;
  /**
   * A identidade da fonte NO MOMENTO DO REGISTRO, calculada aqui (a mesma
   * `identity` que a fatia usa antes de ler conteúdo). `null` quando a fonte é
   * mutável e só tem etag pelos dados. Não é prova de que a IA leu: é qual
   * versão da fonte existia quando a divergência foi registrada.
   */
  identityEtag: string | null;
};

/** O etag de identidade de uma fonte, sem página: `src:` + hash da chave e da identidade. */
export const writerEvidenceIdentityEtag = (sourceKey: string, identity: ReadonlyArray<unknown> | null): string | null =>
  identity ? `src:${writerEvidenceEtag([sourceKey, JSON.stringify(identity)])}` : null;

/**
 * A EVIDÊNCIA CITADA NUMA DIVERGÊNCIA, descrita pelo SERVIDOR. A chave passa
 * pela mesma resolução da fatia — alcançável pelas referências do documento,
 * senão `source_not_in_manifest` —, mas nenhum conteúdo é lido: só o que
 * `preparar` lê para datar a fonte. Hierarquia, congelamento e frescor saem
 * daqui, nunca do que a IA declarar.
 */
export async function describeWriterEvidenceSource(
  context: WriterEvidenceContext,
  head: WriterEvidenceHead,
  sourceKey: string,
): Promise<WriterEvidenceSourceDescription> {
  const chave = parseWriterEvidenceSourceKey(sourceKey);
  if (!chave) throw new WriterEvidenceError("source_not_in_manifest", "sourceKey fora da gramática do manifesto.");
  const preparado = await preparar(context, head, chave);
  const frozen = chave.family === "radar.bundle";
  const level = !frozen && preparado.hierarchy.level === "CURRENT_SUFFICIENT_SERP" ? "OTHER_RADAR_EVIDENCE" : preparado.hierarchy.level;
  return {
    sourceKey: chave.raw,
    family: chave.family,
    frozen,
    level,
    posteriorAoPacote: frozen ? false : preparado.posteriorAoPacote,
    observedAt: frozen ? head.bundleObservedAt : preparado.origin.collectedAt,
    identityEtag: writerEvidenceIdentityEtag(chave.raw, preparado.identity),
  };
}

/**
 * O MATERIAL DO PACOTE POR SEÇÃO DA IA INTERNA (SDD §4.4), cru, para o
 * catálogo puro projetar e cortar em ≤ 24 kB. As seções do dossiê saem por
 * caminho, em consultas de até 5 caminhos com o `bundleHash` conferido — o
 * mesmo desenho dos fundamentos. Nada de payload inteiro; funciona antes da
 * migration.
 */
export async function readWriterSectionMaterial(context: WriterEvidenceContext, head: WriterEvidenceHead): Promise<WriterSectionMaterial> {
  const lidos = head.dossier ? await readWriterBundlePaths(context, head, WRITER_SECTION_BUNDLE_PATHS) : new Map<string, unknown>();
  const projecao = await readWriterArticleProjection(context, head);
  const ausentes: WriterSectionMaterial["absent"][number][] = [];
  if (!head.dossier) ausentes.push({ field: "bundle", reason: head.schemaVersion === 1 ? "documento do Planejador (v1): sem dossiê do Radar" : "documento sem dossiê: não inferir evidências" });
  else if (head.dossier.researchProfile !== "GOOGLE") ausentes.push({ field: "questions/gaps/entities/claims", reason: `fotografia do Google ausente no perfil ${head.dossier.researchProfile}` });
  if (!projecao) ausentes.push({ field: "article", reason: isLegacyVersionReference(head.refs.articleDnaRef) ? "ArticleDNA com referência legada" : "a versão fixada do ArticleDNA não existe nesta Marca" });
  if (head.dossier && head.dossier.researchProfile === "GOOGLE") {
    for (const [caminho, rotulo] of [["observed.authorityEvidence.claims", "claims"], ["observed.gaps", "gaps"], ["observed.questions", "questions"]] as const) {
      if (!lidos.has(caminho)) ausentes.push({ field: rotulo, reason: "o pacote não trouxe esta seção" });
    }
  }
  return {
    documentId: head.documentId,
    articleId: head.articleId,
    documentHash: head.contentHash,
    writerMayNot: writerMayNotOf(head),
    keywordContext: head.dossier?.keywordContext ?? null,
    bundle: head.dossier
      ? { bundleId: head.dossier.bundleId, bundleHash: head.dossier.bundleHash, researchProfile: head.dossier.researchProfile, observedAt: head.bundleObservedAt, serpAuthoritative: head.serpStanding?.authoritative ?? null }
      : null,
    article: projecao ? { versionId: projecao.meta.versionId, contentHash: projecao.meta.contentHash, fields: projecao.fields } : null,
    pendingDecisions: head.pendingDecisions,
    sections: Object.fromEntries(lidos),
    absent: ausentes,
  };
}
