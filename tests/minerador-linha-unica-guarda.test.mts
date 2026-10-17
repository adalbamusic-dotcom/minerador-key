import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

/*
 * F0 DA LINHA ÚNICA DO MINERADOR — A GUARDA DA FORMA DA LINHA (SDD
 * `docs/compartilhado/sdd-linha-unica-do-minerador-2026-10-16.md` §6 F0;
 * AGENTS.md §0.3). O mesmo padrão de `arquiteto-linha-de-processo-guarda`:
 * lê o código SEM comentários (um comentário não pode passar nem reprovar um
 * teste); cada etapa tem um núcleo e os botões/MCP chamam ele; nenhuma porta
 * aposentada é chamada.
 *
 * Só testes (F0): o que está fora da linha hoje é gravado num teste "hoje:" e
 * a regra nova entra como `todo` "vermelho até a Fn". Nenhuma rede, nenhum
 * banco, nenhum custo.
 *
 * F1 (2026-10-16): os `todo` "vermelho até a F1" viraram testes normais (E-1,
 * A8, A9, A10, A12, A13, S-8/P-8) e os "hoje:" deles deram lugar à regra nova,
 * que também exige que o removido não volte. Os `todo` das outras fases não
 * mudaram.
 */

const raiz = new URL("../", import.meta.url);
const cru = (caminho: string) => readFileSync(new URL(caminho, raiz), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const codigo = (caminho: string) => semComentarios(cru(caminho));
const contar = (texto: string, trecho: string | RegExp) => typeof trecho === "string" ? texto.split(trecho).length - 1 : (texto.match(new RegExp(trecho.source, trecho.flags.includes("g") ? trecho.flags : `${trecho.flags}g`)) || []).length;

/** Todo arquivo de código de app/, lib/, modules/ e components/ (sem comentários). */
function codigoDaPlataforma(): Array<{ caminho: string; codigo: string }> {
  const saida: Array<{ caminho: string; codigo: string }> = [];
  const andar = (pasta: string) => {
    for (const nome of readdirSync(new URL(pasta, raiz))) {
      const caminho = `${pasta}/${nome}`;
      if (statSync(new URL(caminho, raiz)).isDirectory()) andar(caminho);
      else if (/\.(ts|tsx|mts)$/.test(nome)) saida.push({ caminho, codigo: codigo(caminho) });
    }
  };
  for (const pasta of ["app", "lib", "modules", "components"]) andar(pasta);
  return saida;
}
const PLATAFORMA = codigoDaPlataforma();
const quemTem = (padrao: RegExp) => PLATAFORMA.filter(arquivo => padrao.test(arquivo.codigo)).map(arquivo => arquivo.caminho).sort();

const TELA = "modules/minerador/minerador-workspace.tsx";

/* ================================================ E1 · entrada (E-1) */

const INSERT_KEYWORD = /from\("minerador_keywords"\)\s*\.insert\(/g;

test("E-1 · os gravadores de entrada em `minerador_keywords`: quatro núcleos de servidor e a rota do site (o site entra no gravador de entrada na F5/F6)", () => {
  const porArquivo = Object.fromEntries(PLATAFORMA.map(arquivo => [arquivo.caminho, contar(arquivo.codigo, INSERT_KEYWORD)]).filter(([, total]) => Number(total) > 0));
  assert.deepEqual(porArquivo, {
    "app/api/marca/site/import/keywords/route.ts": 1,
    "lib/minerador/keyword-import-core.ts": 2,
    "lib/minerador/subject-discovery-import.ts": 1,
  });
  // O cadastro não insere sozinho: delega aos núcleos irmãos.
  const cadastro = codigo("lib/minerador/declared-plan-import-core.ts");
  assert.match(cadastro, /importSubjectsWithCore\(/);
  assert.match(cadastro, /importSubjectDiscoveryWithCore\(/);
});

test("E-1 · os inserts mortos do navegador saíram (CSV/manual sem deduplicação e com status livre) e não voltam; \"Criar lista\" (inalcançável) também", () => {
  const tela = codigo(TELA);
  assert.equal(contar(tela, INSERT_KEYWORD), 0);
  assert.doesNotMatch(tela, /\.insert\(/, "a tela não insere em tabela nenhuma");
  assert.doesNotMatch(tela, /handleImportCSV|openManualModal|handleManualImport|isManualModalOpen|handleCreateList|isListModalOpen|fileInputRef/);
  assert.doesNotMatch(tela, /Importar Lista Manualmente|Criar Silo \/ Categoria/);
});

/* ================================= cada etapa chama o núcleo de sempre */

test("linha: o card e o MCP cadastram pelo MESMO núcleo; a conversão e a trava do Posto também (um gravador do plano)", () => {
  assert.deepEqual(quemTem(/importDeclaredPlanWithCore\(/), [
    "app/api/minerador/marcas/[brandId]/plans/import/route.ts",
    "lib/minerador/declared-plan-import-core.ts",
    "lib/minerador/subject-conversion-core.ts",
    "lib/server/platform-mcp-tools.ts",
  ]);
  assert.doesNotMatch(codigo("app/api/minerador/marcas/[brandId]/plans/import/route.ts"), /setKeywordSubject|\.update\(/, "a rota não grava direto");
});

test("linha: UM leitor do plano colado (`parseDeclaredPlanText`) — o card, o detector das entradas de keyword e o núcleo (rota e MCP) leem por ele; nenhum outro leitor de texto de plano (2026-10-16)", () => {
  assert.deepEqual(quemTem(/function parse\w*Plan\w*Text\s*\(/), ["lib/minerador/declared-plan.ts"], "um leitor só");
  assert.deepEqual(quemTem(/parseDeclaredPlanText\(/), [
    "lib/minerador/declared-plan-import-core.ts",
    "lib/minerador/declared-plan.ts",
    "lib/minerador/plan-text-detector.ts",
    "modules/minerador/subject-cadastro-card.tsx",
  ]);
  // O "colar em qualquer campo" do card dispara pelo detector, que pergunta ao MESMO leitor.
  assert.match(codigo("lib/minerador/plan-text-detector.ts"), /const lido = parseDeclaredPlanText\(valor\);/);
  assert.match(codigo("modules/minerador/subject-cadastro-card.tsx"), /if \(!looksLikeSiloPlanText\(texto\)\) return;[\s\S]*?preencherDoTexto\(texto\)/);
  // 2026-10-16 · abrir/arrastar o .csv não é porta nova: os bytes viram o texto do MESMO campo e vão ao MESMO preenchimento (nenhum fetch novo).
  assert.deepEqual(quemTem(/decodeDeclaredPlanFile\(/), ["lib/minerador/declared-plan.ts", "modules/minerador/subject-cadastro-card.tsx"]);
  const card = codigo("modules/minerador/subject-cadastro-card.tsx");
  const abrir = card.slice(card.indexOf("const abrirArquivo = async"), card.indexOf("const escolherArquivo"));
  assert.match(abrir, /decodeDeclaredPlanFile\(await arquivo\.arrayBuffer\(\)\)[\s\S]*setColado\(lido\.text\);[\s\S]*preencherDoTexto\(lido\.text\);/);
  assert.doesNotMatch(abrir, /fetch\(|callCadastro\(/, "abrir o arquivo não grava nem chama o servidor");
  // A escolha do Silo do texto (vários Silos) volta ao MESMO preenchimento, com o MESMO leitor.
  assert.match(card, /const escolherSiloDoTexto = \(nome: string \| null\) => \{[\s\S]*?preencherDoTexto\(colado, nome\);/);
  assert.equal((card.match(/data-subject-cadastro-abrir-arquivo/g) || []).length, 1, "um link só para abrir o arquivo");
});

/*
 * 2026-10-16 (decisão do dono; SDD da linha única do Arquiteto §15.1): a
 * keyword NOVA que o Arquiteto acha entra na confirmação dele pelos MESMOS
 * núcleos daqui — a incorporação da melhoria e as portas do "Reforçar
 * publicados" — só nas linhas que o import cria. Os dois lugares entram na lista.
 * 2026-10-17: as portas saíram da rota do Reforçar para um arquivo próprio
 * (`arquiteto-minerador-new-keyword-ports.ts`), usado também pelo "Aceitar
 * grupo" da diferenciação — a mesma função, nenhuma porta nova.
 */
test("linha: a Pesquisa por Assunto entra pelo mesmo núcleo na tela, no MCP, no cadastro, nas sugestões e na keyword nova do Arquiteto", () => {
  assert.deepEqual(quemTem(/importSubjectDiscoveryWithCore\(\{/), [
    "app/api/minerador/marcas/[brandId]/subject-discovery/import/route.ts",
    "lib/minerador/declared-plan-import-core.ts",
    "lib/server/arquiteto-article-improvement.ts",
    "lib/server/arquiteto-minerador-new-keyword-ports.ts",
    "lib/server/minerador-architect-suggestions.ts",
    "lib/server/platform-mcp-tools.ts",
  ]);
});

test("linha: a Lógica do servidor é uma só (MCP, reaprovar, recibo, sugestões, conversão, keyword nova do Arquiteto)", () => {
  assert.deepEqual(quemTem(/runKeywordLogicWithCore\(\{/), [
    "app/api/minerador/marcas/[brandId]/plans/reapprove/route.ts",
    "lib/server/arquiteto-article-improvement.ts",
    "lib/server/arquiteto-minerador-new-keyword-ports.ts",
    "lib/server/minerador-architect-suggestions.ts",
    "lib/server/minerador-subject-conversion.ts",
    "lib/server/platform-mcp-tools.ts",
    "lib/server/subject-search-receipts.ts",
  ]);
});

test("hoje: a tela tem a Lógica e o Status não-aprovado gravados pelo navegador (A3/A4), ao lado do núcleo", () => {
  const tela = codigo(TELA);
  const inicio = tela.indexOf("const processLogicalKeywordDna");
  const logica = tela.slice(inicio, tela.indexOf("\n  };\n", inicio));
  assert.match(logica, /\.from\("minerador_keywords"\)\s*\.update\(\{ intent: update\.intent, analise_semantica:/);
  assert.doesNotMatch(logica, /constrainKeywordSnapshot|runKeywordLogicWithCore/);
  assert.match(tela, /\.update\(\{ status: normalizedStatus \}\)/);
});

test("linha: aprovar é do servidor — a tela aprova por \"Aprovar e enviar\" (prévia + decisionHash), nunca grava `aprovado` direto", () => {
  const rota = codigo("app/api/minerador/marcas/[brandId]/keywords/approve-and-send/route.ts");
  assert.match(rota, /previewApproveAndSendOnServer\(/);
  assert.match(rota, /applyApproveAndSendOnServer\(/);
  const tela = codigo(TELA);
  assert.match(tela, /callApproveAndSend\(selectedBrandId, \{ mode: "preview"/);
  assert.doesNotMatch(tela, /update\(\{ status: "aprovado"/);
});

test("linha: um gravador de volume com medição — a rota do Google Ads (botão Volume, MCP measure_keywords, replay das sugestões) e o recibo da Pesquisa por Assunto", () => {
  assert.deepEqual(quemTem(/volume_measurement:/), [
    "lib/minerador/keyword-light-list.ts",
    "lib/minerador/subject-search-receipt.ts",
    "lib/minerador/volume-provider.ts",
  ]);
  assert.match(codigo("lib/minerador/google-ads-volume.ts"), /buildVolumeMetricPatch\(/, "a rota monta o patch pelo construtor de sempre");
  assert.match(codigo("lib/server/minerador-volume-measure.ts"), /handleGoogleAdsKeywordMetrics/, "o MCP mede pela rota da tela");
});

/* ============================================ portas aposentadas (F1) */

test("A8 · a rota aposentada `subjects/import` continua recusando (410) e nenhuma porta a chama; o ramo de declaração da Pesquisa por Assunto e do colar/CSV não volta", () => {
  assert.match(codigo("app/api/minerador/marcas/[brandId]/subjects/import/route.ts"), /status: 410/);
  assert.deepEqual(quemTem(/\/subjects\/import`/), []);
  assert.deepEqual(quemTem(/\bsubjectEntry\b|onSubjectsImported|subjectPhraseDeclarationPlan|subjectIdFromApply|defaultDeclarePhraseAsSubject|declarePhraseAsSubjectLabel|parseManualSubjects|SUBJECT_SEARCH_UNDECLARED_TEXT/), []);
  const pesquisa = codigo("modules/minerador/discovery/use-subject-search.ts");
  assert.doesNotMatch(pesquisa, /\boffered\b|declareRequestId|\bsetDeclare\b|postSubjects/);
});

test("A9 · o texto da Pesquisa por Assunto manda cadastrar em Cadastrar Assuntos, nunca declarar na Pesquisa ou no Processador", () => {
  const modelo = codigo("modules/minerador/discovery/subject-search-model.ts");
  assert.doesNotMatch(modelo, /declare-o antes|se você o declarar/);
  assert.match(modelo, /SUBJECT_SEARCH_NOTE_HELP = "A nota não muda a pesquisa nem vai ao banco\. Para ligar a um Assunto, cadastre-o em Cadastrar Assuntos\."/);
  const dialogos = codigo("modules/minerador/discovery/subject-search-dialogs.tsx");
  assert.match(dialogos, /cadastre-o em \\"Cadastrar Assuntos\\"/, "o diálogo do envio aponta o card");
});

test("A10 · `withdrawKeywordSubject` saiu (D4) e não volta", () => {
  assert.deepEqual(quemTem(/withdrawKeywordSubject\b/), []);
});

test("A12 · o catálogo descreve \"Tirar do plano\" pelo cadastro único (o formato anterior como caso)", () => {
  const catalogo = cru("lib/agent/platform-catalog.ts");
  assert.doesNotMatch(catalogo, /a principal deixa de ser declarada e o plano do grupo ganha versão nova/);
  assert.match(catalogo, /No cadastro único \(desde 2026-10-13\) o Assunto mora na keyword que carrega o artigo/);
  assert.match(catalogo, /Caso do formato anterior \(Assunto numa linha própria e a principal em outra\)/);
});

test("A13 · a spec marca o texto velho como SUBSTITUÍDO (§5 da SDD) e tem o §79", () => {
  const spec = cru("docs/03-minerador/spec.md");
  const trecho = spec.slice(Math.max(0, spec.indexOf("a aprovação continua sendo gravada pelo navegador") - 400), spec.indexOf("a aprovação continua sendo gravada pelo navegador"));
  assert.match(trecho, /SUBSTITUÍDO/);
  // Cada seção do §5 da SDD leva a marca com a data (até o próximo título).
  const secao = (titulo: string) => { const inicio = spec.indexOf(titulo); assert.ok(inicio >= 0, titulo); const resto = spec.slice(inicio + titulo.length); const fim = resto.search(/\r?\n#{2,4} /); return resto.slice(0, fim < 0 ? undefined : fim); };
  for (const titulo of ["## 8. Ações", "## 9. Entradas", "## 10. Saídas", "## 16. Descoberta persistente", "## 17. Arquivos pertencentes ao módulo", "## 23. Qualificacao de volume", "## 24. Google Keyword Insight", "## 25. Google Keyword Trending Insight", "## 26. Keyword Magic Tool", "## 27. SEO Keyword Research", "## 28. Hidratação e barra operacional", "## 32. Coleta de `results_allintitle` pela extensão", "## 33. Contrato autenticado da extensão", "## 34. Correlacao do allintitle pela extensao", "## 37. Ciclo de vida reinjetável da bridge", "## 38. Qualificação simplificada", "## 39. ACK estável da página", "## 40. Decisão KGR e limite externo de volume", "## 41. Persistência server-side de `results_allintitle`", "## 43. Extração localizada do contador allintitle", "## 44. Ciclo de vida e reconciliação do lote allintitle", "### Exceção do Assunto (D2)", "### 3. Assunto — 2026-09-24", "#### 4.2 Rodapé: KGR, seletor Vínculo e o Assunto"]) {
    assert.match(secao(titulo), /SUBSTITUÍDO em 2026-10-16/, titulo);
  }
  assert.match(spec, /## 79\. A linha única do Minerador e as decisões de outubro — 2026-10-16/);
  assert.match(cru("supabase/migrations/20261015120000_assunto_nunca_se_perde.sql"), /-- ESTADO: APLICADA \(conferido por SELECT em 2026-10-16: gatilhos ativos\)\./);
});

test("S-8/P-8 · as sobras sem chamador saíram e não voltam", () => {
  for (const arquivo of ["lib/minerador/package-freshness.ts", "lib/minerador/allintitle-persistence.ts"]) {
    assert.equal(existsSync(new URL(arquivo, raiz)), false, arquivo);
  }
  assert.deepEqual(quemTem(/package-freshness|allintitle-persistence/), []);
  const volume = codigo("lib/minerador/volume-provider.ts");
  assert.doesNotMatch(volume, /seo-keyword-research8|rapidapi|normalizeGoogleKeywordInsightResponse|normalizeGoogleKeywordTrendingInsightResponse|normalizeKeywordMagicToolResponse|normalizeSeoKeywordResearch/i);
  assert.match(volume, /export function buildVolumeMetricPatch\(/, "o construtor do patch, usado pela rota do Google Ads, fica");
  const allintitle = codigo("lib/minerador/allintitle.ts");
  assert.deepEqual([...allintitle.matchAll(/export (?:const|function|type) (\w+)/g)].map(match => match[1]), ["buildAllintitleQuery"], "allintitle.ts fica só com a consulta do DataForSEO");
  const ciclo = codigo("lib/minerador/keyword-lifecycle.ts");
  assert.doesNotMatch(ciclo, /assessKeywordHardDelete|keywordHardDeleteBlockMessage|KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES|KeywordLifecycleDependencyAuditError|recoverablePurgeAfter|canRestoreKeyword|isKeywordRecoverable|publicationEvidenceForLifecycle/);
  assert.deepEqual([...ciclo.matchAll(/export function (\w+)/g)].map(match => match[1]).sort(), ["isKeywordPublished", "keywordRecoveryRemainingLabel", "resolveKeywordPublication"]);
  assert.doesNotMatch(codigo("lib/server/platform-mcp-tools.ts"), /decisao_pendente/, "kgrUse inalcançável saiu");
});

test("A2 · hoje: a descrição do MCP `validate_silo_plan` exige \"página do silo com keyword e slug\"", () => {
  assert.match(codigo("lib/server/platform-mcp-tools.ts"), /página do silo com keyword e slug/);
});

test("A2 · a descrição do MCP diz a keyword do Silo opcional", { todo: "vermelho até a F2 (A2, adendo 15/10 S2)" }, () => {
  assert.doesNotMatch(codigo("lib/server/platform-mcp-tools.ts"), /página do silo com keyword e slug/);
});
