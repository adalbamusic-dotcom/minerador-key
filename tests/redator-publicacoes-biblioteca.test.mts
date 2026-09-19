/**
 * ===== A BIBLIOTECA DE PUBLICAÇÕES PROJETA O MESMO DOCUMENTO =====
 *
 * COMPORTAMENTAL (01-09) — exercita a projeção de verdade, sem banco.
 * ESTRUTURAL (10-14) — lê o código como texto e prova que a fiação é essa.
 *
 * O defeito que estes testes travam: Publicações lia apenas
 * `publication_records`, então um documento persistido no Redator não aparecia
 * em lugar nenhum da biblioteca — uma biblioteca paralela implícita.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ContentDocumentSchema } from "../lib/arquiteto/contracts.ts";
import { OperationalPublicationSchema } from "../lib/editorial/operational-flow.ts";
import {
  PUBLICATIONS_LIBRARY_DEFAULT_FILTER, PUBLICATIONS_LIBRARY_FILTERS, PUBLICATIONS_LIBRARY_FILTER_LABELS, belongsToPublications,
  deliveryStatusOf, filterEditorialLibrary, projectEditorialLibrary, writerStatusOf, writerHrefForRow,
} from "../lib/publicacoes/editorial-library.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const BRAND = "brand-1";

const ref = (entityId: string, hash: string) => ({ entityId, versionId: `${entityId}-v1`, contentHash: `legacy:${hash}` });

const documento = (overrides: Record<string, unknown> = {}) => ContentDocumentSchema.parse({
  schemaVersion: 2, id: "doc-1", title: "Artigo do Radar", status: "escrevendo",
  brandDnaRef: ref("brand-1", "brand"), keywordDnaRefs: [ref("kw-1", "kw")], siloDnaRef: ref("silo-1", "silo"),
  articleDnaRef: ref("article-1", "article"),
  serpSnapshotRefs: [], evidenceRefs: [], sourceIds: [], linkMap: [], instructions: [], blocks: [], editorContent: null,
  metadata: { slug: "artigo-do-radar", principalKeyword: "kw-1", metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "", canonical: null, indexationStatus: "noindex", plannedImages: [] },
  radarOrigin: { radarItemId: "r1", articleId: "article-1", analysisVersionId: "an-3", analysisVersionNumber: 3,
    evidenceBundleHash: "bundle", articleDnaVersionId: "article-1-v1", articleDnaContentHash: "legacy:article",
    siloDnaVersionId: "silo-1-v1", importedAt: "2026-09-18T00:00:00.000Z", importedBy: "human" },
  importedContext: { source: "radar", capturedAt: "2026-09-18T00:00:00.000Z", dossier: null, editorialContext: [], visualGuidance: [], pendingDecisions: [] },
  ...overrides,
});

const publicacao = (overrides: Record<string, unknown> = {}) => OperationalPublicationSchema.parse({
  id: "publication:article-1", brandId: BRAND, articleId: "article-1", documentId: "doc-1",
  radarOrigin: { analysisVersionId: "an-3", evidenceBundleHash: "bundle" },
  title: "Artigo do Radar", slug: "artigo-do-radar", siloId: "silo-1", hierarchy: "Pilar",
  state: "draft", responsible: null, destination: null,
  createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z", origin: "local",
  ...overrides,
});

const projetar = (docs: ReturnType<typeof documento>[], pubs: ReturnType<typeof publicacao>[] = [], extras = {}) =>
  projectEditorialLibrary({ brandId: BRAND, documents: docs, publications: pubs, ...extras });

/* ======================= COMPORTAMENTAL ======================= */

test("01 · documento sem registro de publicação aparece como RASCUNHO e NÃO ENTREGUE", () => {
  const rows = projetar([documento()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].writerStatus, "RASCUNHO");
  assert.equal(rows[0].deliveryStatus, "NAO_ENTREGUE");
  assert.equal(rows[0].documentId, "doc-1");
  assert.equal(rows[0].publicationId, null, "não deve inventar registro de publicação");
});

test("02 · finalizado no Redator NÃO significa recebido em Publicações", () => {
  /*
   * O defeito que esta asserção trava: mapear `aprovado` direto para um estado
   * de Publicações dizia que o artigo estava lá quando ele nunca foi entregue.
   * A entrega é provada pelo registro, e o registro nasce do handoff com readback.
   */
  const rows = projetar([documento({ status: "aprovado" })]);
  assert.equal(rows[0].writerStatus, "FINALIZADO");
  assert.equal(rows[0].deliveryStatus, "NAO_ENTREGUE");
  assert.equal(rows[0].publicationStatus, null);
  assert.equal(rows[0].publicationId, null);
});

test("03 · publicação publicada vence o estado do documento", () => {
  const rows = projetar([documento({ status: "aprovado" })], [publicacao({ state: "published", destinationUrl: "https://exemplo.com/a", publishedAt: "2026-09-18T10:00:00.000Z", publishedDocumentHash: "h" })]);
  assert.equal(rows[0].deliveryStatus, "PUBLICADO");
  assert.equal(rows[0].writerStatus, "FINALIZADO", "os eixos coexistem; um não apaga o outro");
  assert.equal(rows[0].destinationUrl, "https://exemplo.com/a");
  /* Publicado nunca se apresenta como apenas pronto. */
  assert.equal(deliveryStatusOf("published"), "PUBLICADO");
  assert.equal(deliveryStatusOf("ready_to_export"), "RECEBIDO");
  assert.equal(deliveryStatusOf(null), "NAO_ENTREGUE");
  assert.equal(writerStatusOf("aprovado"), "FINALIZADO");
  assert.equal(writerStatusOf("escrevendo"), "RASCUNHO");
  assert.equal(writerStatusOf("em_revisao"), "RASCUNHO");
  assert.equal(writerStatusOf("planejado"), "RASCUNHO");
});

test("04 · registro de publicação ENRIQUECE a linha; não cria uma segunda", () => {
  const rows = projetar([documento()], [publicacao({ state: "ready_to_export" })]);
  assert.equal(rows.length, 1, "um documento com publicação continua sendo UMA linha");
  assert.equal(rows[0].id, "doc-1", "o id da linha é o documento — impossível duplicar");
  assert.equal(rows[0].publicationStatus, "ready_to_export");
  assert.equal(rows[0].publicationId, "publication:article-1");
});

test("05 · publicação de outra marca não enriquece nem duplica", () => {
  const rows = projetar([documento()], [publicacao({ brandId: "brand-2", state: "published" })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deliveryStatus, "NAO_ENTREGUE", "registro de outra marca não prova entrega");
  assert.equal(rows[0].publicationId, null);
});

test("06 · registro de publicação órfão não vira linha da biblioteca editorial", () => {
  /* Sem documento, não há o que abrir no Redator. As abas de fila e publicados
   * continuam lendo os registros direto — esta projeção é a do documento. */
  const rows = projetar([], [publicacao({ documentId: "doc-inexistente" })]);
  assert.equal(rows.length, 0);
});

test("07 · a origem é declarada, não inferida do título", () => {
  assert.equal(projetar([documento()])[0].origin, "radar");
  /*
   * O v1 é montado do zero, e não espalhando o v2: o schema é `.strict()`, e
   * `radarOrigin: undefined` espalhado ainda é uma CHAVE presente — a primeira
   * versão deste teste falhou exatamente aí.
   */
  const base = documento() as unknown as Record<string, unknown>;
  const comum = { ...base };
  delete comum.radarOrigin; delete comum.importedContext;
  const v1 = ContentDocumentSchema.parse({ ...comum, schemaVersion: 1, contentPlanRef: ref("plan-1", "plan") });
  assert.equal(projetar([v1])[0].origin, "planner");
});

test("08 · a linha carrega versão corrente e updated_at quando a leitura os traz", () => {
  const rows = projetar([documento()], [], {
    updatedAtByDocument: { "doc-1": "2026-09-18T20:19:30.000Z" },
    currentVersionByDocument: { "doc-1": "versao-7" },
  });
  assert.equal(rows[0].updatedAt, "2026-09-18T20:19:30.000Z");
  assert.equal(rows[0].currentVersionId, "versao-7");
});

test("09 · o destino da linha é sempre o Redator, no mesmo documento", () => {
  const row = projetar([documento()])[0];
  assert.equal(writerHrefForRow(row, "marca-x"), "/marca-x/redator?documentId=doc-1");
  assert.equal(writerHrefForRow(row, null), "/redator?documentId=doc-1");
  /* E o filtro de estado não inventa linha nem perde documento. */
  assert.equal(filterEditorialLibrary([row], "TODOS").length, 1);
  assert.equal(filterEditorialLibrary([row], "RASCUNHO").length, 1);
  assert.equal(filterEditorialLibrary([row], "PUBLICADO").length, 0);
  /* `ENTREGUES` cobre o caso de a biblioteca precisar ser exclusiva de Publicações. */
  assert.equal(filterEditorialLibrary([row], "ENTREGUES").length, 0, "sem registro, não entra na visão de entregues");
});

/* ======================= ESTRUTURAL ======================= */

test("10 · a biblioteca consome content_documents, e não uma tabela nova", async () => {
  const workspace = await fonte("../modules/publicacoes/publications-workspace.tsx");
  assert.match(workspace, /projectEditorialLibrary\(\{/);
  assert.match(workspace, /documents: Object\.values\(pipeline\.documents\)/);
  assert.match(workspace, /publications: pipeline\.operationalPublications/);
  /* Nenhuma tabela/lista nova de rascunho do lado de Publicações. */
  const projecao = await fonte("../lib/publicacoes/editorial-library.ts");
  assert.equal(/from\(["']publication_drafts|editor_library|writer_library/.test(projecao), false);
});

test("11 · a projeção não copia documento para outra tabela", async () => {
  const projecao = await fonte("../lib/publicacoes/editorial-library.ts");
  /* Projeção é leitura pura: sem insert, upsert ou fetch. */
  assert.equal(/insert\(|upsert\(|fetch\(/.test(projecao), false, "a projeção precisa ser leitura pura");
  assert.match(projecao, /id: document\.id/, "a linha é o documento");
});

test("12 · a barra global do Redator não carrega controle de documento", async () => {
  const writer = await fonte("../components/editorial/professional-writer.tsx");
  /*
   * CORTE 3.5 · os controles do documento voltaram para a barra global — que
   * é a barra que JÁ existia. O que a versão anterior chamava de "toolbar"
   * era uma faixa horizontal extra, e a tela chegou a ter três.
   */
  assert.match(writer, /data-redator-document-actions/, "os controles do documento vivem na GlobalTopbar");
  const semComentarios = writer.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const inicio = semComentarios.indexOf("useGlobalTopbarControlsRegistration");
  const bloco = semComentarios.slice(semComentarios.indexOf("globalTopbarControls"), inicio > 0 ? inicio : undefined);
  assert.equal(/data-redator-document-toolbar/.test(bloco), false, "nenhuma barra horizontal extra pode voltar");
});

test("13 · a toolbar do documento existe, abaixo das abas, com as ações humanas", async () => {
  const writer = await fonte("../components/editorial/professional-writer.tsx");
  assert.match(writer, /data-redator-document-actions/);
  for (const controle of ["Salvar rascunho", "Finalizar artigo", "palavras", "Salvo no servidor às"]) {
    assert.ok(writer.includes(controle), `a GlobalTopbar precisa de: ${controle}`);
  }
  /* `Tela cheia` foi apagada; nada a substitui. */
  assert.equal(/Tela cheia/.test(writer), false);
  /* E não existe segunda barra de abas nem rodapé de workflow. */
  assert.equal(/aria-label="Formato de redação"/.test(writer), false, "a segunda barra de abas não pode voltar");
  assert.equal(/<footer/.test(writer), false, "o rodapé de ações não pode voltar");
});

test("14 · salvar rascunho e finalizar reusam o caminho que já existe", async () => {
  const writer = await fonte("../components/editorial/professional-writer.tsx");
  /* Um segundo caminho de gravação divergiria do autosave no primeiro campo novo. */
  assert.match(writer, /const saveDraftNow = \(\) => \{/);
  assert.match(writer, /flushRef\.current = true; createVersionRef\.current = false;/,
    "rascunho não cria versão: createVersion fica desligado");
  assert.match(writer, /const finalizeArticle = \(\) => requestStatus\("aprovado"\);/,
    "finalizar reusa o gate do Guardião em vez de abrir outro");
  /* O horário só é escrito quando o servidor confirma. */
  assert.match(writer, /response\.ok\) \{ flushRef\.current = false; setSavedAt\(/);
});

test("15 · a Fila não tem caminho local-first", async () => {
  const workspace = await fonte("../modules/publicacoes/publications-workspace.tsx");
  const page = await fonte("../modules/publicacoes/publications-page.tsx");
  const contexto = await fonte("../components/editorial-pipeline-context.tsx");
  const contrato = await fonte("../lib/editorial/persistence-contracts.ts");
  const rota = await fonte("../app/api/editorial/workflow/route.ts");
  for (const [nome, fonteArquivo] of [["workspace", workspace], ["page", page]] as const) {
    assert.equal(/pipeline\.importApprovedToPublications/.test(fonteArquivo), false, nome + " ainda chama o caminho local-first");
  }
  assert.equal(/importApprovedToPublications: publicationIds/.test(contexto), false, "o método saiu do contexto");
  assert.equal(/z\.literal\("import_publications"\)/.test(contrato), false, "o comando saiu do contrato");
  assert.equal(/command\.action === "import_publications"/.test(rota), false, "a rota não executa mais o comando");
});

test("16 · a entrada em Publicações continua sendo o handoff com readback", async () => {
  const servico = await fonte("../lib/server/writer-publication-handoff.ts");
  assert.match(servico, /RELER DO SERVIDOR/);
  assert.match(servico, /writer_publication_readback_failed/);
  /* E não existe uma segunda implementação de handoff. */
  const rota = await fonte("../app/api/redator/publication-handoff/route.ts");
  assert.match(rota, /sendWriterToPublications/);
});

test("17 · o Redator não tem barra de abas extra, rodapé, Tela cheia nem Conectar IA", async () => {
  const writer = await fonte("../components/editorial/professional-writer.tsx");
  assert.equal(/aria-label="Formato de redação"/.test(writer), false, "a segunda barra de abas saiu");
  assert.equal(/<footer/.test(writer), false, "o rodapé de ações saiu");
  assert.equal(/Tela cheia|setFullscreen/.test(writer), false, "Tela cheia foi apagada");
  assert.equal(/WriterMcpConnections|writingFormat === "mcp"/.test(writer), false, "Conectar IA saiu do Redator");
  /* As três abas de ambiente ficam na GlobalTopbar, e só elas. */
  assert.match(writer, /data-redator-environment-tabs/);
  for (const ambiente of ["Artigo", "Roteiro e storyboard", "Carrossel"]) assert.ok(writer.includes(ambiente));
});

test("18 · Importar do Radar continua no painel esquerdo, com a mesma autoridade", async () => {
  const writer = await fonte("../components/editorial/professional-writer.tsx");
  assert.match(writer, /Importar do Radar/);
  assert.match(writer, /postRadarWriterHandoffBatch/);
  assert.match(writer, /setImportOpen\(true\)/);
});

/**
 * ===== 19-22 · O ESCOPO DE PUBLICAÇÕES É A ENTREGA =====
 *
 * O corte anterior deixou o default em `TODOS` e ofereceu `RASCUNHO` e
 * `FINALIZADO` como filtros. Os dois são estados do REDATOR: usados como
 * recorte de Publicações, punham na lista, como item normal, documento que
 * Publicações nunca recebeu. Estes testes travam o escopo.
 */

test("19 · o escopo padrão da biblioteca é ENTREGUES, não TODOS", () => {
  assert.equal(PUBLICATIONS_LIBRARY_DEFAULT_FILTER, "ENTREGUES");

  const rows = projetar(
    [documento({ id: "doc-1", status: "aprovado" }), documento({ id: "doc-2", status: "aprovado" })],
    [publicacao({ id: "publication:doc-2", documentId: "doc-2" })],
  );
  assert.equal(rows.length, 2, "o read model continua conhecendo os dois");

  const visiveis = filterEditorialLibrary(rows, PUBLICATIONS_LIBRARY_DEFAULT_FILTER);
  assert.equal(visiveis.length, 1, "só o documento com registro entra no escopo padrão");
  assert.equal(visiveis[0].documentId, "doc-2");
  assert.equal(visiveis[0].deliveryStatus, "RECEBIDO");
});

test("20 · nenhum recorte oferecido pertence ao eixo do Redator", () => {
  /* `ENTREGUES` é o escopo; os outros três são valores de `deliveryStatus`. */
  assert.deepEqual([...PUBLICATIONS_LIBRARY_FILTERS], ["ENTREGUES", "RECEBIDO", "PUBLICADO", "NAO_ENTREGUE"]);
  for (const doRedator of ["TODOS", "RASCUNHO", "FINALIZADO"]) {
    assert.ok(!PUBLICATIONS_LIBRARY_FILTERS.includes(doRedator as never), `${doRedator} não é recorte de Publicações`);
  }
  /* Rótulo carrega significado: nenhum deles fala em rascunho ou finalização. */
  for (const rotulo of Object.values(PUBLICATIONS_LIBRARY_FILTER_LABELS)) {
    assert.doesNotMatch(rotulo, /rascunho|finaliz/i);
  }
});

test("21 · NAO_ENTREGUE existe no read model, e nunca como item já recebido", () => {
  const rows = projetar([documento({ status: "aprovado" })]);

  /* Existe: a projeção não descarta o documento sem registro. */
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deliveryStatus, "NAO_ENTREGUE");
  assert.equal(rows[0].writerStatus, "FINALIZADO", "os dois eixos seguem separados");
  assert.equal(belongsToPublications(rows[0]), false);

  /* E não é recebido por nenhum caminho de leitura. */
  for (const recorte of ["ENTREGUES", "RECEBIDO", "PUBLICADO"] as const) {
    assert.equal(filterEditorialLibrary(rows, recorte).length, 0, `NAO_ENTREGUE não pode entrar em ${recorte}`);
  }
  /* Alcançável só pelo recorte que o nomeia. */
  assert.equal(filterEditorialLibrary(rows, "NAO_ENTREGUE").length, 1);
});

test("22 · a tela usa o contrato de escopo e não filtra por estado do Redator", async () => {
  const workspace = await fonte("../modules/publicacoes/publications-workspace.tsx");
  const codigo = workspace.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(codigo, /useState<EditorialLibraryFilter>\(PUBLICATIONS_LIBRARY_DEFAULT_FILTER\)/);
  assert.match(codigo, /PUBLICATIONS_LIBRARY_FILTERS\.map/);
  assert.match(codigo, /PUBLICATIONS_LIBRARY_FILTER_LABELS\[value\]/);
  assert.doesNotMatch(codigo, /\["TODOS",/, "a lista literal de filtros saiu da tela");
  assert.doesNotMatch(codigo, /useState<EditorialLibraryFilter>\("TODOS"\)/);

  /* Os dois selos continuam: um eixo por selo, nunca um só. */
  assert.match(codigo, /row\.writerStatus/);
  assert.match(codigo, /row\.deliveryStatus/);
  /* E a identidade da linha segue sendo o documento. */
  assert.match(codigo, /key=\{row\.id\}/);
});
