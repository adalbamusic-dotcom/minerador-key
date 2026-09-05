import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const keywordPanel = panel.slice(panel.indexOf("export function KeywordDnaPanel"), panel.indexOf("export function KeywordDnaProvenance"));
const renderedProfile = keywordPanel.slice(keywordPanel.indexOf('return <section data-keyword-profile="bento"'));

test("R1.3B preserva a ordem operacional na faixa e nos cards preenchidos", () => {
  const stages = [
    "<ProfileStepStrip steps={profileSteps} />",
    '<ProfileBento number="1" title="LEITURA LÓGICA"',
    '<ProfileBento number="2" title="GOOGLE ADS"',
    '<ProfileBento number="3" title="DATAFORSEO"',
    "<HumanReviewPanel",
    "data-keyword-human-decision",
    "<TechnicalDetails semantic=",
  ];
  let previousIndex = -1;
  for (const stage of stages) {
    const index = keywordPanel.indexOf(stage);
    assert.ok(index > previousIndex, `${stage} precisa respeitar a ordem operacional`);
    previousIndex = index;
  }
  assert.equal((keywordPanel.match(/<ProfileBento number=/g) || []).length, 3);
  assert.match(keywordPanel, /<ProfileStepStrip steps=\{profileSteps\} \/>/);
  assert.match(panel, /data-keyword-profile-steps/);
  assert.match(keywordPanel, /data-keyword-profile-stage="human-review"/);
  assert.match(keywordPanel, /data-keyword-profile-stage="decision"/);
  assert.match(keywordPanel, /<TechnicalDetails semantic=/);
  assert.doesNotMatch(keywordPanel, /<ProfileBento number="4" title="KGR"/);
  assert.doesNotMatch(keywordPanel, /REVISÃO SEMÂNTICA — IA/);
  assert.doesNotMatch(keywordPanel, /title="IDENTIDADE"/);
  assert.doesNotMatch(keywordPanel, /identityFields/);
});

test("R1.3B mantém o cabeçalho como identidade e contexto publicado condicional", () => {
  assert.match(renderedProfile, /ProfilePill label=\{published \? "Publicada" : "Livre"\}/);
  assert.match(renderedProfile, /h2 className="mt-0\.5 min-w-0 break-words text-xl font-semibold tracking-tight text-foreground \[overflow-wrap:anywhere\]"/);
  assert.match(renderedProfile, /publishedContextFields\.length > 0/);
  assert.match(renderedProfile, /CONTEXTO PUBLICADO/);
  assert.doesNotMatch(renderedProfile, /label: "Situação"/);
  assert.doesNotMatch(renderedProfile, /label: "Origem"/);
  assert.doesNotMatch(renderedProfile, /Sem Silo\/Categoria/);
  assert.match(keywordPanel, /published \? semantic\.published_url/);
  assert.match(keywordPanel, /published \? semantic\.canonical_url/);
  assert.match(keywordPanel, /published \? profile\?\.listName/);
  assert.match(renderedProfile, /published && publishedContextFields\.length > 0/);
});

test("R1.3B reduz a leitura lógica ao resumo e recolhe a profundidade do DNA", () => {
  const summary = keywordPanel.slice(keywordPanel.indexOf("const logicSummaryFields"), keywordPanel.indexOf("const logicDetailsFields"));
  const details = keywordPanel.slice(keywordPanel.indexOf("const logicDetailsFields"), keywordPanel.indexOf("const hasLogicDetails"));
  const state = keywordPanel.slice(keywordPanel.indexOf("const logicStateFields"), keywordPanel.indexOf("const profileSteps"));
  for (const label of ["Intenção lógica", "Intenção secundária", "Funil", "Entidade central", "Modificadores", "Nicho", "Potencial comercial lógico"]) {
    assert.match(summary, new RegExp(label));
  }
  for (const label of ["Confiança", "Ambiguidade", "Revisão humana", "Status final"]) {
    assert.match(state, new RegExp(label));
  }
  for (const label of ["Audiência", "Problema percebido", "Resultado desejado", "Job to be done", "Jornada", "Nível de consciência", "Tipo editorial", "Formato esperado", "Intenção local", "Objeção implícita", "Urgência/tempo", "Emoção dominante", "Evidências lógicas"]) {
    assert.match(details, new RegExp(label));
  }
  assert.match(renderedProfile, /ProfileFields fields=\{logicSummaryFields\} compact layout="rows-compact"/);
  assert.match(renderedProfile, /Mais detalhes da leitura lógica/);
  assert.match(renderedProfile, /ProfileFields fields=\{logicDetailsFields\} compact layout="rows"/);
  assert.match(keywordPanel, /logicalSummaryValue\(semantic\.intencao_secundaria\)/);
});

test("R1.3B não cria cards para processos vazios", () => {
  for (const condition of ["hasGoogleAdsMeasurement", "hasDataForSeoMeasurement"]) {
    assert.match(renderedProfile, new RegExp(`${condition} && <div`));
  }
  assert.doesNotMatch(renderedProfile, /hasKgrInputs/);
  assert.doesNotMatch(renderedProfile, /<ProfileBento number="4" title="KGR"/);
  assert.match(panel, /data-keyword-ai-review/);
  assert.doesNotMatch(renderedProfile, /REVISÃO SEMÂNTICA — IA/);
  assert.doesNotMatch(renderedProfile, /Medição pendente/);
  assert.doesNotMatch(renderedProfile, /Ainda não realizada/);
  assert.doesNotMatch(renderedProfile, /Aguardando volume \+ allintitle/);
});

test("R1.3B mantém os cards preenchidos compactos e os dados essenciais", () => {
  for (const label of ["Volume", "CPC", "Concorrência", "Tendência", "Resultado", "Última medição", "Estado da medição", "KGR", "Aplicabilidade", "IA: ", "Resultado IA", "Divergências", "Enriquecimentos", "Revisão humana", "Concluir revisão", "Ver detalhes da revisão"]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /ProfileFields fields=\{googleAdsFields\} compact layout="rows"/);
  assert.match(panel, /ProfileFields fields=\{dataForSeoFields\} compact layout="rows"/);
  assert.match(panel, /ProfileFields fields=\{kgrDetails\} compact layout="rows"/);
  assert.match(panel, /data-keyword-ai-review/);
  assert.match(panel, /SemanticReviewDetails review=\{aiReview\}/);
  assert.match(panel, /data-keyword-human-review-checklist/);
  assert.match(keywordPanel, /text-xl[\s\S]*font-semibold/);
});

test("R1.3B transforma a decisão humana em linha final e preserva controles reais", () => {
  assert.match(renderedProfile, /data-keyword-human-decision/);
  assert.match(renderedProfile, />DECISÃO<\/p>/);
  assert.match(renderedProfile, /Status final/);
  assert.match(renderedProfile, /onWorkflowStatusChange/);
  // O selo da decisão vem do estado canônico da revisão, não de contagem
  // de campos: sem decisão pendente, o Perfil não cobra revisão.
  assert.ok(renderedProfile.includes("humanReviewStatePill(profileReviewUiState)"));
  assert.doesNotMatch(renderedProfile, /<ProfileBento number="6"/);
  assert.doesNotMatch(renderedProfile, /<ProfileBento number="7"/);
});

test("R1.3B preserva wrapping, proveniência e consumidores existentes", () => {
  const fieldHelpers = panel.slice(panel.indexOf("function ProfileField"), panel.indexOf("function ProfileBento"));
  assert.match(fieldHelpers, /min-w-0/);
  assert.match(fieldHelpers, /whitespace-normal break-words/);
  assert.match(fieldHelpers, /overflow-wrap:anywhere/);
  assert.match(renderedProfile, /w-full min-w-0 whitespace-normal rounded-lg/);
  assert.doesNotMatch(renderedProfile, /max-w-6xl|max-xl:max-w|max-lg:max-w/);
  assert.match(panel, /function TechnicalDetails/);
  assert.match(panel, /Proveniência e detalhes técnicos/);
  assert.match(panel, /Payload técnico completo/);
  assert.match(panel, /profileJson\(semantic\)/);
  assert.match(panel, /ProvenancePanel/);
  assert.match(panel, /Histórico DataForSEO/);
  assert.match(panel, /Histórico KGR/);
  assert.match(workspace, /googleAds:/);
  assert.match(workspace, /dataForSeo:/);
  assert.match(workspace, /kgr:/);
  assert.match(workspace, /onWorkflowStatusChange/);
});

test("R1.3C compacta espacialmente o Perfil sem alterar os processos", () => {
  assert.match(renderedProfile, /<ProfileStepStrip steps=\{profileSteps\} \/>/);
  assert.match(renderedProfile, /grid-cols-1/);
  assert.match(renderedProfile, /md:grid-cols-2/);
  assert.match(renderedProfile, /xl:grid-cols-3/);
  assert.match(renderedProfile, /items-start/);
  assert.match(renderedProfile, /md:grid-cols-2/);
  assert.match(renderedProfile, /<TechnicalDetails semantic=\{semantic\} reference=\{reference\}/);
  assert.match(panel, /data-keyword-technical-details-disclosure/);
  assert.match(panel, /grid-cols-\[8rem_minmax\(0,1fr\)\]/);
  assert.match(panel, /space-y-1/);
  assert.match(panel, /p-2\.5/);
  assert.doesNotMatch(renderedProfile, /Qualificação operacional da keyword/);
  assert.doesNotMatch(panel.slice(panel.indexOf("function ProfileBento"), panel.indexOf("function HistoryDetails")), /min-h-/);
});

test("R7 finaliza o grid sem card KGR e torna a Proveniência o sexto bloco", () => {
  const order = [
    '<ProfileBento number="1" title="LEITURA LÓGICA"',
    '<ProfileBento number="2" title="GOOGLE ADS"',
    '<ProfileBento number="3" title="DATAFORSEO"',
    'data-keyword-profile-stage="human-review"',
    'data-keyword-profile-stage="decision"',
    "<TechnicalDetails semantic={semantic}",
  ];
  let previousIndex = -1;
  for (const marker of order) {
    const index = panel.indexOf(marker);
    assert.ok(index > previousIndex, `${marker} precisa respeitar a ordem R7`);
    previousIndex = index;
  }
  assert.doesNotMatch(panel, /<ProfileBento number="4" title="KGR"/);
  assert.match(panel, /grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3/);
  assert.match(panel, /FATOS MEDIDOS · somente leitura/);
  assert.match(panel, /KGR técnico|<dt className=.*>KGR<\/dt>/);
  assert.match(panel, /Você pode revisar cada item ou concluir agora\./);
  assert.match(panel, /divergências sem decisão mantêm a Lógica/);
  assert.match(panel, /Ver detalhes da revisão/);
  assert.match(panel, /PROVENIÊNCIA/);
  assert.match(panel, /Ver detalhes técnicos/);
});

test("R7.1 usa a variante compacta em todos os selos de estado do KeywordDNA", () => {
  const profilePill = panel.slice(panel.indexOf("function ProfilePill"), panel.indexOf("type ProfileFieldDefinition"));
  assert.match(profilePill, /rounded border px-1\.5 py-0\.5 text-\[11px\] font-medium leading-none/);
  assert.doesNotMatch(profilePill, /rounded-full/);
  assert.match(renderedProfile, /title="GOOGLE ADS"[\s\S]*?ProfilePill/);
  assert.match(renderedProfile, /title="DATAFORSEO"[\s\S]*?ProfilePill/);
  assert.match(renderedProfile, /processorMetricStateLabel\(processorRevalidation\.volume\.state/);
  assert.match(renderedProfile, /processorMetricStateLabel\(processorRevalidation\.results\.state/);
  assert.doesNotMatch(renderedProfile, /GOOGLE ADS[\s\S]*?rounded-full/);
  assert.doesNotMatch(renderedProfile, /DATAFORSEO[\s\S]*?rounded-full/);
});

test("R6 não apresenta atualização cruzada para IA ou Revisão", () => {
  assert.doesNotMatch(panel, /IA anterior · Atualizar/);
  assert.doesNotMatch(panel, /Revisão anterior · Atualizar/);
  assert.doesNotMatch(panel, /A IA mudou\. Atualize a revisão/);
});
