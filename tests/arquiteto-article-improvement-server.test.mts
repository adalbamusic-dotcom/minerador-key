import assert from "node:assert/strict";
import { register } from "node:module";
import { mock, test } from "node:test";
import { ArticleDNASchema, ProvisionalArticleGroupSchema } from "../lib/arquiteto/contracts.ts";
import { articleSerpBaseHash, resolveArticleFormationSerpState } from "../lib/arquiteto/article-serp-gate.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import { suggestArticleSlug } from "../lib/arquiteto/article-formation.ts";
import { SERP_SUBJECT_LENS_LABELS } from "../lib/arquiteto/serp-subject-overlap.ts";
import { linhaDaMesa, declarado } from "./arquiteto-assunto-fixtures.mts";
import { deriveLogicalKeywordBatchItem } from "../lib/minerador/logical-batch.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";

// Only the I/O boundaries are simulated. The planner, orchestration, ArticleDNA
// construction, versioning and exact composition checks run their real code.
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='next/server') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class NextRequest extends Request {}')}; return n(s,c); }`)}`);
globalThis.fetch = async () => { throw new Error("Network forbidden in improvement tests"); };
const brandId = "61d2e019-f44f-4fa3-af2f-d86b95628ab3", actorUserId = "11111111-1111-4111-8111-111111111111";
const oldId = "aaaaaaaa-0000-4000-8000-000000000001", newId = "aaaaaaaa-0000-4000-8000-000000000002";
const territory = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const url = "https://adalbapro.com.br/captacao-de-pacientes/como-captar-clientes-para-clinica-de-estetica";
const semantic = { entidade_central: "captação de pacientes", problema_percebido: "poucos agendamentos", publico: "gestores de clínicas", resultado_desejado: "ampliar agendamentos", intencao_principal: "Informativa", modificadores: "agenda da clínica" };
let rows: any[], articles: any[], journal: any[], assessments: any[], marker: any;
let paid = 0, plansMissing = 0, failReadback = false, failPatch = false, incomplete = false, wrongRole = false;
let external = false, qualification: string[] = [];
// Leitura da IA: keywords com SERP sem páginas em comum, ordem dos passos e lentes que só chegam depois de pagar.
let disjoint = new Set<string>(), events: string[] = [], incompleteUntilPaid = false;
// Keywords que o Google separa da principal: a composição com elas diverge (par "nenhuma" nas 4 lentes).
let diverge = new Set<string>();
const discoveredPhrase = "captação de pacientes para clínica de estética";
const clone = (v: any) => structuredClone(v);
// Postgres JSONB does not keep key order and drops undefined: the mock behaves the same.
const jsonb = (v: any): any => Array.isArray(v) ? v.map(jsonb) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([p], [q]) => q.length - p.length || (p < q ? 1 : -1)).map(([k, x]) => [k, jsonb(x)])) : v;
const json = (data: any) => new Response(JSON.stringify({ success: true, data }));
class Query {
  filters: [string, any][] = [];
  eq(k: string, v: any) { this.filters.push([k,v]); return this; }
  select() { return this; }
  async maybeSingle() { return { data: clone(journal.find(r => this.filters.every(([k,v]) => r[k] === v)) ?? null), error: null }; }
}
const context: any = { brandId, actorUserId, module: "arquiteto", action: "edit", supabase: { from: () => new Query() } };
const runtime: any = { context, authorize: async (module: string, action: string) => ({ ...context, module, action }) };
mock.module("../lib/server/arquiteto-territory-store.ts", { namedExports: { listTerritoryWorkflowItems: async () => [{territoryRef:territory,territory:{lifecycleStatus:"confirmed",centralEntity:"clínica de estética",macroIntent:"Informativa",slugState:{publishedSlug:"captacao-de-pacientes"}}}] } });
const workspace = () => ({ workflowItems: [], keywords: clone(rows), articleDnas: clone(articles), siloDnas: [] });
function setup() {
  journal=[]; articles=[]; assessments=[]; marker=null; paid=0; plansMissing=0; failReadback=false; failPatch=false; incomplete=false; wrongRole=false; external=false;qualification=[];disjoint=new Set();events=[];incompleteUntilPaid=false;diverge=new Set();
  rows = [oldId,newId].map((id,i) => ({ id, brand_id: brandId, keyword: i ? "captação de pacientes para clínica de estética" : "como captar clientes para clínica de estética", intent: "Informativa", volume_search: i ? 50 : null, volume_source: i ? "google_ads" : null, analise_semantica: semantic, isPublished: !i, publishedUrl: !i ? url : undefined, primaryKeywordPolicy: !i ? "reviewable" : "free", territoryRef: i ? "territory:other" : territory, keywordDnaRef: { entityId: id, versionId: `${id}:v1`, contentHash: `sha256:${"a".repeat(64)}` }, canonicalWorkflow: { id: `workflow-${id}`, lockVersion: 1, payload: { semanticQualification: { intent: "Informativa", semanticState: "conclusive" }, approvedDna: { analiseSemantica: semantic } } } }));
}
mock.module("../lib/arquiteto/canonical-workspace.ts", { namedExports: { buildCanonicalWorkflowWorkspaceItems: (_w: any,k: any) => k } });
mock.module("../lib/server/arquiteto-workspace.ts", { namedExports: { loadCanonicalArquitetoWorkspace: async () => workspace(), createMineradorArquitetoHandoff: async () => { assert.ok(external);qualification.push("handoff"); } } });
mock.module("../lib/server/arquiteto-differentiation-store.ts", { namedExports: {
  readDifferentiationBrandKeywords: async () => ({ pages: rows[0].isPublished ? [{ keywordId: oldId, keyword: rows[0].keyword, url, canonical: url, slug: url.split('/').at(-1), post: "reviewable" }] : [], existingByNormalized: new Map(rows.map(r=>[normalizeKeyword(r.keyword),r.id])) }),
  readPublishedFootprints: async (_c: any, queries: any[]) => ({ missingLenses: [], footprints: queries.map(q => ({ ...q, lenses: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, urls: (disjoint.has(q.keywordId) ? ["https://outro.org/1","https://outro.org/2","https://outro.org/3","https://outro.org/4"] : ["https://example.org/1","https://example.org/2","https://example.org/3","https://example.org/4"]) })) })) }),
} });
mock.module("../lib/server/arquiteto-differentiation-runtime.ts", { namedExports: {
  readGoogleAdsAverageVolumes: async () => { assert.ok(external);return new Map([[normalizeKeyword(discoveredPhrase),50]]); },
  // A IA real nunca é chamada nos testes: a do runtime injetado é simulada.
  proposeArticleImprovementAiPicks: async () => { throw new Error("IA real proibida nos testes"); },
} });
mock.module("../lib/server/arquiteto-serp-http.ts", { namedExports: { handleArchitectFormationSerp: async (req: Request) => {
  const body = await req.json();
  // Same limits as the real route: at most 20 groups, each a valid group.
  assert.ok(body.groups.length >= 1 && body.groups.length <= 20, `groups per request: ${body.groups.length}`);
  for (const group of body.groups) ProvisionalArticleGroupSchema.parse(group);
  if (body.mode === "plan") return json({ plan: { paidQueries: plansMissing, estimatedCostUsd: { min: plansMissing * .002, max: plansMissing * .003 }, missingDetails: [] } });
  if (body.authorizedPaidQueries) { paid += body.authorizedPaidQueries; incompleteUntilPaid = false; }
  else assert.equal(body.cacheOnly, true, "no implicit provider call");
  for (const group of body.groups) {
    const record = { candidateRef: group.id, payload: { formationBaseHash: body.formationBaseHashes[group.id], verdict: group.keywordIds.some((id: string) => diverge.has(id)) ? "DIVERGENCE" : "INCONCLUSIVE", interpretation: { lenses: { perLens: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, pairs: group.keywordIds.filter((id: string) => diverge.has(id)).map((id: string) => ({ left: group.principalSuggestion.keywordId, right: id, level: "nenhuma" })) })), requested: SERP_SUBJECT_LENS_LABELS, observed: incomplete || incompleteUntilPaid ? SERP_SUBJECT_LENS_LABELS.slice(0,3) : SERP_SUBJECT_LENS_LABELS, missing: incomplete || incompleteUntilPaid ? ["mobile-ios"] : [] } }, assessment: { id: `assessment:${group.id}`, contentHash: `sha256:${"b".repeat(64)}`, keywordDnaReferences: group.keywordIds.map((keywordId: string) => ({ keywordId })), recommendations: group.keywordIds.map((keywordId: string) => ({ keywordId, currentRole: wrongRole ? "secundaria" : group.roles[keywordId] })) } } };
    assessments = [...assessments.filter(a => a.candidateRef !== group.id), record];
  }
  return json({});
} } });
mock.module("../lib/server/arquiteto-article-serp-store.ts", { namedExports: {
  listArticleFormationSerpAssessments: async () => clone(assessments),
  saveArticleFormationSerpAssessment: async (_c:any,input:any) => {const record={candidateRef:input.candidateRef,payload:{...clone(input),humanResolution:null}};assessments=[...assessments.filter(a=>a.candidateRef!==input.candidateRef),record];return record;},
  resolveArticleFormationSerpAssessment: async (_c: any, input: any) => { const a=assessments.find(a=>a.candidateRef===input.candidateRef); a.payload.humanResolution=clone(input.resolution); return a; },
  readbackArticleFormationSerpAssessment: async (_c: any,id: string) => clone(assessments.find(a=>a.candidateRef===id)),
} });
mock.module("../lib/server/arquiteto-workspace-http.ts", { namedExports: { handleArchitectWorkspacePatch: async (req: Request) => {
  if(failPatch) throw new Error("fixture write failed");
  const body=await req.json();
  for(const u of body.updates) { const r=rows.find(r=>r.canonicalWorkflow.id===u.workflowItemId); assert.equal(u.expectedLock,r.canonicalWorkflow.lockVersion); Object.assign(r,u.assignment); Object.assign(r.canonicalWorkflow.payload,u.assignment); r.canonicalWorkflow.lockVersion++; }
  return json({});
} } });
mock.module("../lib/server/minerador-google-ads-metrics-http.ts", { namedExports: { handleGoogleAdsKeywordMetrics: async () => { assert.ok(external);qualification.push("metrics");rows[1].volume_search=50;rows[1].volume_source="google_ads";return json({}); } } });
mock.module("../lib/server/arquiteto-persistence.ts", { namedExports: { appendArquitetoArtifact: async (_c: any,_type: any,version: any) => { ArticleDNASchema.parse(version.payload); articles.push(clone(version)); return { version }; } } });
mock.module("../lib/server/arquiteto-article-formation-marker-store.ts", { namedExports: {
  readArticleFormationMarker: async () => clone(marker), saveArticleFormationMarker: async (_c: any,payload: any) => { marker={payload:clone(payload)}; }, readbackArticleFormationMarker: async () => failReadback ? {payload:{concludedFormations:[]}} : clone(marker),
} });
mock.module("../lib/server/pipeline-repositories.ts", { namedExports: { WorkflowRepository: class {
  context: any; constructor(c: any){this.context=c;}
  async create(input: any){ journal.push({id:"journal", marca_id:this.context.brandId,subject_type:input.subjectType,subject_id:input.subjectId,stage:input.stage,payload:jsonb(clone(input.payload)),lock_version:1}); }
  async update(id: string,lock: number,input: any){const r=journal.find(r=>r.id===id&&r.marca_id===this.context.brandId); assert.equal(r.lock_version,lock); Object.assign(r,{...clone(input),...(input.payload?{payload:jsonb(clone(input.payload))}:{})});r.lock_version++;return{data:clone(r)};}
} } });
const subjectImportActual = await import("../lib/minerador/subject-discovery-import.ts");
mock.module("../lib/minerador/subject-discovery-import.ts", { namedExports: { ...subjectImportActual, importSubjectDiscoveryWithCore: async (input:any)=>{
  assert.ok(external);qualification.push("import"); const logic=deriveLogicalKeywordBatchItem({id:newId,keyword:discoveredPhrase,location:null,intent:null,analise_semantica:{}},null,new Date().toISOString());
  rows.push({...clone(rows[0]),id:newId,keyword:input.request.items[0].keyword,isPublished:false,publishedUrl:undefined,volume_search:null,volume_source:null,territoryRef:null,analise_semantica:logic.update.analise_semantica,primaryKeywordPolicy:"free",keywordDnaRef:{entityId:newId,versionId:`${newId}:v1`,contentHash:`sha256:${"c".repeat(64)}`},canonicalWorkflow:{id:`workflow-${newId}`,lockVersion:1,payload:{approvedDna:{analiseSemantica:logic.update.analise_semantica}}}});return {ok:true};
} } });
mock.module("../lib/server/minerador-keyword-decision-core.ts", { namedExports: {
  runKeywordLogicWithCore: async ()=>{assert.ok(external);qualification.push("logic");return {readbackConfirmed:true,missingIds:[]};},
  readDecisionKeywords: async()=>({rows:[rows[1]],missingCount:0}),keywordDecisionEntries:()=>[{outcome:"applied"}],
  applyKeywordDecisionEntries:async()=>{qualification.push("approve");return[{outcome:"applied"}];},
} });
mock.module("../lib/server/google-ads-canonical.ts", { namedExports: {
  resolveGoogleAdsCanonicalContext:async()=>{assert.ok(external);return {customerId:"1234567890",managerCustomerId:null,targeting:null};},
  createGoogleAdsCanonicalClient:async()=>({client:{}}),targetingToProviderInput:()=>({}),defaultGoogleAdsCanonicalTargeting:()=>({}),
} });
mock.module("../lib/google/ads/keyword-ideas.ts",{namedExports:{generateGoogleAdsKeywordIdeas:async()=>{events.push("busca");return {ideas:[{keyword:discoveredPhrase}],nextPageToken:null};}}});
mock.module("../lib/server/arquiteto-published-reinforcement.ts", { namedExports: { stableUuid: (...parts: string[]) => parts.includes("improvement") ? "dddddddd-0000-4000-8000-000000000001" : "eeeeeeee-0000-4000-8000-000000000001" } });
const {handleArticleImprovement,projectImprovementRun}=await import("../lib/server/arquiteto-article-improvement.ts");
function assertReloadGate(kind:"published"|"subject") {
  const formation=marker.payload.concludedFormations[0];
  const bound=assessments.find(a=>a.candidateRef===formation.candidateRef).payload;
  const expected=articleSerpBaseHash({territoryRef:territory,principalKeywordId:formation.principalKeywordId,roles:formation.members,suggestedSlug:kind==="published"?null:suggestArticleSlug({principal:rows.find(r=>r.id===formation.principalKeywordId),siloSlug:"captacao-de-pacientes"}),intents:formation.members.map((m:any)=>{const row=rows.find(r=>r.id===m.keywordId);return {keywordId:m.keywordId,intent:resolveKeywordDnaSignals({keywordId:row.id,text:row.keyword,semanticQualification:row.canonicalWorkflow.payload.semanticQualification,semantic:row.canonicalWorkflow.payload.approvedDna.analiseSemantica}).intent};}),siloContext:{centralEntity:"clínica de estética",macroIntent:"Informativa"}});
  assert.equal(bound.formationBaseHash,expected);
  const gate=resolveArticleFormationSerpState({candidateRef:formation.candidateRef,expectedBaseHash:expected,observed:{formationBaseHash:bound.formationBaseHash,verdict:bound.verdict,lensesComplete:true,humanDecisionBaseHash:bound.humanResolution.formationBaseHash}});
  assert.notEqual(gate.state,"stale");assert.notEqual(gate.state,"missing");
}
const prepare=()=>handleArticleImprovement(runtime,{brandId,action:"prepare"});
const apply=(run: any)=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:run.decisionHash});

test("single acceptance swaps Livre, preserves published identity, transfers, materializes and reads back", async()=>{
  setup();const run=await prepare(); assert.equal(run.proposals[0].status,"ready",JSON.stringify(run.proposals)); assert.equal(paid,0); assert.equal(articles.length,0);
  const result=await apply(run); assert.equal(result.state,"complete");assert.equal(result.outcomes[0].status,"improved",JSON.stringify(result.outcomes));
  const dna=articles[0].payload;assert.equal(dna.principalKeywordId,newId);assert.deepEqual(dna.secondaryKeywordIds,[oldId]);assert.equal(dna.canonical,url);assert.equal(dna.suggestedSlug,url.split('/').at(-1));assert.equal(dna.territoryRef,territory);assert.equal(rows[1].territoryRef,territory);assert.equal(dna.primaryKeywordMetrics.volumeSearch,50);
  assert.equal(assessments.find(a=>a.candidateRef===oldId).payload.humanResolution.decidedBy,actorUserId);
  const resume=await apply(result);assert.equal(resume.state,"complete");assert.equal(articles.length,1);assert.equal(paid,0);
  assert.deepEqual(projectImprovementRun(result).beforeAssignments,{});assertReloadGate("published");
});
test("stale hash and other actor or brand refuse the saved preview",async()=>{
  setup();const run=await prepare();await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:"0".repeat(64)}),/prévia mudou/);
  await assert.rejects(()=>handleArticleImprovement({...runtime,context:{...context,actorUserId:"other"}},{brandId,action:"status",runId:run.runId}),/ator/);
  await assert.rejects(()=>handleArticleImprovement(runtime,{brandId:"other",action:"status",runId:run.runId}),/Marca divergente/);assert.equal(articles.length,0);
});
test("incomplete lenses and incorrect final primary cannot appear ready",async()=>{
  for(const problem of ["incomplete","wrongRole"]){setup();if(problem==="incomplete")incomplete=true;else wrongRole=true;const run=await prepare();assert.equal(run.proposals[0].status,"insufficient_evidence");await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:run.decisionHash,targetIds:[oldId]}),/prontas/);assert.equal(articles.length,0);}
});
test("readback failure never announces material improvement and keeps the accepted set",async()=>{
  setup();const run=await prepare();failReadback=true;const result=await apply(run);assert.equal(result.outcomes[0].status,"failed");assert.deepEqual(result.acceptedIds,[oldId]);const again=await apply(result);assert.equal(again.outcomes[0].status,"failed");assert.equal(articles.length,1);
});
test("write failure does not emit approved DNA",async()=>{
  setup();const run=await prepare();failPatch=true;const result=await apply(run);assert.equal(result.outcomes[0].status,"failed");assert.equal(articles.length,0);assert.equal(paid,0);
});
test("changed architecture rejects cost authorization before any provider call",async()=>{
  setup();plansMissing=1;const run=await prepare();rows[0].keyword="Changed after preview";await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash,authorizedCostUsd:run.costs.estimatedCostUsd.max}),/arquitetura mudou/);assert.equal(paid,0);
});
test("cost ceiling is enforced server-side independently of interface",async()=>{
  setup();plansMissing=1;const run=await prepare();await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash,authorizedCostUsd:2}),/teto total/);assert.equal(paid,0);
});
test("declared subject automatically forms around a measured principal and survives working-copy reload",async()=>{
  setup();
  const subject=linhaDaMesa({id:oldId,keyword:"Como transformar interesse em agendamento na clínica",brandId,semantic:{...semantic,...declarado("Apresentar os serviços e conduzir os contatos para a agenda.")}});
  rows[0]={...rows[0],...subject,isPublished:false,publishedUrl:undefined};rows[0].canonicalWorkflow.lockVersion=1;
  const run=await prepare();assert.equal(run.targets[0].kind,"subject");assert.equal(run.proposals[0].status,"ready",JSON.stringify(run.proposals));
  const result=await apply(run);assert.equal(result.outcomes[0].status,"improved",JSON.stringify(result.outcomes));
  const dna=articles[0].payload;assert.equal(dna.subject.keywordId,oldId);assert.equal(dna.principalKeywordId,newId);assert.equal(dna.keywordReferences.length,1);assert.equal(dna.keywordReferences.some((r:any)=>r.keywordId===oldId),false);assert.equal(rows[1].articleSubjectAnchor.subjectKeywordId,oldId);assertReloadGate("subject");assert.equal(dna.suggestedSlug,suggestArticleSlug({principal:rows[1],siloSlug:"captacao-de-pacientes"}));
});
test("external idea is qualified only after acceptance; real ID replaces temporary ID in Silo and DNA",async()=>{
  setup();external=true;rows=rows.slice(0,1);
  const logic=deriveLogicalKeywordBatchItem({id:oldId,keyword:discoveredPhrase,location:null,intent:null,analise_semantica:{}},null,new Date().toISOString());
  rows[0].analise_semantica=logic.update.analise_semantica;rows[0].canonicalWorkflow.payload.approvedDna.analiseSemantica=logic.update.analise_semantica;rows[0].canonicalWorkflow.payload.semanticQualification={};
  const run=await prepare();assert.equal(run.proposals[0].status,"ready",JSON.stringify(run.proposals));assert.equal(qualification.length,0);assert.equal(rows.length,1);
  await assert.rejects(()=>apply(run),/explicitamente/);
  const result=await handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:run.decisionHash,approveNewKeywords:true});
  assert.equal(result.outcomes[0].status,"improved",JSON.stringify(result.outcomes));assert.deepEqual(qualification,["import","logic","metrics","approve","handoff"]);
  assert.equal(articles[0].payload.principalKeywordId,newId);assert.equal(rows[1].territoryRef,territory);assert.equal(paid,0);
});
test("lost journal response recovers a committed article without another version",async()=>{
  setup();const run=await prepare();const completed=await apply(run);assert.equal(completed.outcomes[0].status,"improved");
  journal[0].payload={...completed,state:"applying",outcomes:[],leaseUntil:new Date(Date.now()-1000).toISOString()};
  const recovered=await apply(run);assert.equal(recovered.outcomes[0].status,"improved");assert.match(recovered.outcomes[0].message,/recuperada/);assert.equal(articles.length,1);
});
test("one target failure keeps the accepted batch and the next subject still materializes",async()=>{
  setup();const subjectId="aaaaaaaa-0000-4000-8000-000000000003", supportId="aaaaaaaa-0000-4000-8000-000000000004";
  const subject=linhaDaMesa({id:subjectId,keyword:"Agenda e agendamento da clínica",brandId,semantic:{...semantic,...declarado()}});
  rows.push({...clone(rows[0]),...subject,isPublished:false,publishedUrl:undefined,primaryKeywordPolicy:"free",canonicalWorkflow:{...(subject.canonicalWorkflow as object),lockVersion:1}}, {...clone(rows[1]),id:supportId,keyword:"Captação de pacientes e agendamentos",keywordDnaRef:{...rows[1].keywordDnaRef,entityId:supportId,versionId:`${supportId}:v1`},canonicalWorkflow:{...clone(rows[1].canonicalWorkflow),id:`workflow-${supportId}`}});
  const run=await prepare();assert.equal(run.proposals.filter(p=>p.status==="ready").length,2,JSON.stringify(run.proposals));
  failPatch=true;const partial=await apply(run);assert.equal(partial.state,"applying");assert.equal(partial.outcomes[0].status,"failed");assert.equal(partial.acceptedIds?.length,2);
  failPatch=false;const completed=await apply(partial);assert.equal(completed.state,"complete");assert.equal(completed.acceptedIds?.length,2);assert.equal(completed.outcomes.filter(o=>o.status==="improved").length,1);assert.equal(completed.outcomes.filter(o=>o.status==="failed").length,1);
});
test("campo volátil (lock, carimbo da SERP) entre a prévia e o aplicar não derruba a melhoria; mudança real de Silo derruba", async()=>{
  setup();const run=await prepare();assert.equal(run.proposals[0].status,"ready",JSON.stringify(run.proposals));
  // O que o "Processar artigos" e a própria prévia mudam na linha: versão de lock, carimbos.
  for(const row of rows){row.canonicalWorkflow={...(row.canonicalWorkflow??{}),lockVersion:(row.canonicalWorkflow?.lockVersion??1)+7};row.updatedAt="2026-09-30T01:00:00.000Z";row.serpStamp="novo";}
  const result=await apply(run);assert.equal(result.outcomes[0].status,"improved",JSON.stringify(result.outcomes));
  setup();const outra=await prepare();rows[0].territoryRef="outro-silo";
  const recusada=await apply(outra);assert.equal(recusada.outcomes[0].status,"failed");assert.match(recusada.outcomes[0].message,/mudaram desde a prévia/);
});
test("coleta interrompida antes desta versão (presa em collecting, sem progresso) termina só pelo cache, sem pagar de novo", async()=>{
  setup();plansMissing=3;const run=await prepare();
  journal[0].payload={...journal[0].payload,state:"collecting",reservedCostUsd:.02};
  delete journal[0].payload.collect;
  // Um grupo por chamada: a tela chama de novo enquanto estiver "collecting".
  let resumed=await handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash});
  for(let i=0;i<20&&resumed.state==="collecting";i++) resumed=await handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash});
  assert.equal(resumed.state,"prepared",JSON.stringify(resumed.notices));
  assert.equal(paid,0,"nada pago na retomada");
  assert.equal((resumed as any).collect,undefined);
});
test("coleta nova grava o progresso por grupo e termina em prepared", async()=>{
  setup();plansMissing=1;const run=await prepare();
  const pedido={brandId,action:"collect" as const,runId:run.runId,decisionHash:run.decisionHash,authorizedCostUsd:run.costs.estimatedCostUsd.max};
  let done=await handleArticleImprovement(runtime,pedido);let chamadas=1;
  while(done.state==="collecting"&&chamadas<20){assert.ok((done as any).collect?.doneGroupIds.length>=1,"progresso gravado a cada chamada");done=await handleArticleImprovement(runtime,pedido);chamadas++;}
  assert.equal(done.state,"prepared");assert.ok(paid<=run.costs.paidQueries);
});

/*
 * LEITURA EDITORIAL DA IA NA LISTA (decisão do dono, 2026-09-30). A IA é
 * simulada pelo runtime injetado; nenhuma chamada real. A candidata da lista
 * não tem par na SERP do publicado (páginas diferentes) nem DNA em comum:
 * sem a IA, ninguém a sugeriria.
 */
const listPhrase = "captação de clientes para clínica";
function listCandidate() {
  rows[1] = { ...rows[1], keyword: listPhrase, volume_search: 390, volume_source: "google_ads", analise_semantica: {}, canonicalWorkflow: { ...rows[1].canonicalWorkflow, payload: { semanticQualification: {}, approvedDna: { analiseSemantica: {} } } } };
  disjoint.add(newId);
}
// A IA recebe apelidos curtos (A1 = o publicado, K1 = a keyword da lista), nunca os ids reais.
const aiPick = { picks: [{ targetId: "A1", keywordId: "K1", role: "principal", reason: "Quem busca captar clientes para a clínica lê este passo a passo." }] };
function aiRuntime(answer: () => Promise<unknown>) {
  const prompts: any[] = [];
  return { prompts, runtime: { ...runtime, editorialAi: async (prompt: any) => { prompts.push(prompt); events.push("ia"); return answer(); } } };
}

test("IA simulada: publicado sem par da SERP ganha proposta pronta editorial_ai, com o motivo, e grava pelo parecer do cache", async () => {
  setup(); listCandidate();
  const semIa = await prepare();
  assert.notEqual(semIa.proposals[0].status, "ready", "sem a IA, a lista não vira proposta");
  assert.equal(semIa.editorialAi?.status, "off"); assert.equal(semIa.notices.filter(n => /Leitura da IA desligada/.test(n)).length, 1);
  setup(); listCandidate();
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare" });
  const proposal = run.proposals[0];
  assert.equal(proposal.status, "ready", JSON.stringify(proposal));
  assert.equal(proposal.evidenceBasis, "editorial_ai");
  assert.deepEqual(proposal.addIds, [newId]);
  assert.equal(proposal.principalId, oldId, "sem o núcleo do slug, a sugestão de principal entra como secundária");
  assert.match(proposal.reasons.join(" "), /entra como secundária/);
  assert.deepEqual(proposal.aiReasons, [{ keywordId: newId, reason: aiPick.picks[0].reason }]);
  assert.equal(run.editorialAi?.status, "answered"); assert.equal(prompts.length, 1);
  const pedido = JSON.parse(prompts[0].user);
  assert.deepEqual(pedido.alvos.map((a: any) => [a.targetId, a.tema]), [["A1", rows[0].keyword]]); assert.deepEqual(pedido.lista.map((k: any) => [k.keywordId, k.keyword, k.volume]), [["K1", listPhrase, 390]]);
  assert.ok(!prompts[0].user.includes(newId) && !prompts[0].user.includes(oldId), "ids reais não vão para a IA");
  assert.ok(prompts[0].timeoutMs <= 45000, "limite de tempo seguro dentro dos 120 s da rota");
  assert.deepEqual(events, ["ia"], "com proposta pronta pela lista, não há busca nova no Google Ads");
  assert.equal(paid, 0); assert.equal(articles.length, 0, "nada gravado sem o clique do dono");
  assert.equal(projectImprovementRun(run).keywords.some(k => k.id === newId), true);
  const result = await handleArticleImprovement(comIa, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash });
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  assert.deepEqual(articles[0].payload.secondaryKeywordIds, [newId]);
  assert.equal(articles[0].payload.principalKeywordId, oldId); assert.equal(prompts.length, 1, "aplicar não chama a IA"); assert.equal(paid, 0);
});

test("IA com id inventado ou keyword barrada não vira proposta; só o que passa nas barreiras entra", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => ({ picks: [{ targetId: "A1", keywordId: "K7", role: "principal", reason: "Apelido que não existe na lista." }, { targetId: "A1", keywordId: newId, role: "principal", reason: "Id real que a IA nunca recebeu." }] }));
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare" });
  assert.notEqual(run.proposals[0].evidenceBasis, "editorial_ai");
  assert.equal(run.editorialAi?.rejectedCount, 2); assert.ok(run.editorialAi!.rejected.every(r => /id inventado/.test(r.reason)));
  assert.ok(run.notices.some(n => /recusada\(s\) pelas regras do código/.test(n)));
});

test("falha da IA não derruba: aviso único e a ordem segue lista → busca nova no Google Ads", async () => {
  setup(); listCandidate(); external = true;
  const { runtime: comIa } = aiRuntime(async () => { throw new Error("A IA excedeu o tempo limite."); });
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare" });
  assert.equal(run.editorialAi?.status, "failed");
  assert.equal(run.notices.filter(n => /Leitura da IA indisponível agora/.test(n)).length, 1);
  assert.deepEqual(events.slice(0, 2), ["ia", "busca"], "a IA na lista vem antes da busca nova");
  assert.ok(!run.proposals.some(p => p.evidenceBasis === "editorial_ai"));
  assert.equal(paid, 0);
});

test("IA que não responde no limite de tempo: a preparação segue sem ela", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(() => new Promise(() => {}));
  const run = await handleArticleImprovement({ ...comIa, editorialAiTimeoutMs: 20 } as any, { brandId, action: "prepare" });
  assert.equal(run.editorialAi?.status, "failed"); assert.match(run.editorialAi!.message!, /tempo limite/);
  assert.ok(run.proposals.every(p => p.evidenceBasis !== "editorial_ai"));
});

test("faltando lente, a linha da IA fica 'precisa validar' (passo 2 pago) e o collect reaproveita a resposta guardada", async () => {
  setup(); listCandidate(); plansMissing = 1; incompleteUntilPaid = true;
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare" });
  const proposal = run.proposals[0];
  assert.equal(proposal.status, "insufficient_evidence"); assert.equal(proposal.needsValidation, true, JSON.stringify(proposal));
  assert.match(proposal.reasons.join(" "), /Precisa validar no Google/);
  assert.ok(run.costs.paidQueries > 0, "o passo 2 pago aparece com prévia de custo");
  await assert.rejects(() => handleArticleImprovement(comIa, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, targetIds: [oldId] }), /prontas/);
  const pedido = { brandId, action: "collect" as const, runId: run.runId, decisionHash: run.decisionHash, authorizedCostUsd: run.costs.estimatedCostUsd.max };
  let done = await handleArticleImprovement(comIa, pedido);
  for (let i = 0; i < 20 && done.state === "collecting"; i++) done = await handleArticleImprovement(comIa, pedido);
  assert.equal(done.state, "prepared");
  assert.equal(paid > 0, true, "a composição escolhida pela IA foi validada no passo 2");
  assert.equal(done.proposals[0].status, "ready", JSON.stringify(done.proposals[0]));
  assert.equal(done.proposals[0].evidenceBasis, "editorial_ai");
  assert.equal(prompts.length, 1, "a IA não é chamada de novo no collect");
});

test("prazo da etapa: composição que não começou a tempo fica 'precisa validar', sem ler parecer nem pagar", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement({ ...comIa, compositionDeadlineMs: -1 } as any, { brandId, action: "prepare" });
  const proposal = run.proposals[0];
  assert.equal(proposal.evidenceBasis, "editorial_ai");
  assert.equal(proposal.status, "insufficient_evidence"); assert.equal(proposal.needsValidation, true);
  assert.match(proposal.reasons.join(" "), /Faltou tempo nesta etapa/);
  assert.equal(assessments.length, 0, "nenhum parecer começou depois do prazo"); assert.equal(paid, 0); assert.equal(articles.length, 0);
});

test("falha da IA vai para a execução como texto fixo, nunca a mensagem crua do provider", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => { throw Object.assign(new Error("upstream 401: chave sk-segredo-123 recusada em https://api.exemplo"), { code: "AI_PROVIDER_UNAVAILABLE" }); });
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare" });
  assert.equal(run.editorialAi?.status, "failed"); assert.equal(run.editorialAi?.message, "A IA está indisponível.");
  assert.ok(!JSON.stringify(run).includes("sk-segredo"), "nada do erro cru na execução");
  const formato = aiRuntime(async () => { throw Object.assign(new Error("Campo picks.0.role: Invalid enum"), { code: "AI_OUTPUT_INVALID" }); });
  setup(); listCandidate();
  assert.equal((await handleArticleImprovement(formato.runtime, { brandId, action: "prepare" })).editorialAi?.message, "A resposta da IA veio fora do formato.");
});

test("uma escolha malformada da IA não derruba a boa, e a recusa guarda o texto para a tela", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => ({ picks: [{ ...aiPick.picks[0], role: "Secundária" }, { targetId: "A1", keywordId: "K1", role: "reforço", reason: "Papel inválido." }] }));
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare" });
  assert.equal(run.proposals[0].status, "ready", JSON.stringify(run.proposals[0])); assert.equal(run.proposals[0].evidenceBasis, "editorial_ai");
  assert.equal(run.editorialAi?.rejectedCount, 1); assert.match(run.editorialAi!.rejected[0].reason, /fora do formato/);
});
test("publicado que também é Assunto declarado grava: a página fora da lista de keywords não conta como 'keyword mudou' (caso real)", async()=>{
  setup();
  // A página publicada é também um Assunto declarado: readInputs a tira da lista de keywords, na prévia e no aplicar.
  const pagina=linhaDaMesa({id:oldId,keyword:"como captar clientes para clínica de estética",brandId,semantic:{...semantic,...declarado()}});
  rows[0]={...rows[0],analise_semantica:(pagina as any).analise_semantica ?? rows[0].analise_semantica,canonicalWorkflow:{...(rows[0].canonicalWorkflow as object),payload:{...((rows[0].canonicalWorkflow as any)?.payload??{}),...((pagina as any).canonicalWorkflow?.payload??{})}}};
  const run=await prepare();
  const alvo=run.proposals.find((p:any)=>p.targetId===oldId);
  assert.equal(alvo?.status,"ready",JSON.stringify(alvo));
  assert.ok(!run.keywords.some((k:any)=>k.id===oldId),"a página declarada fica fora da lista, como em produção");
  const result=await apply(run);
  assert.notEqual(result.outcomes[0].status,"failed",JSON.stringify(result.outcomes));
});

test("o Google separou parte da composição: sai quem não divide páginas com a principal e a menor é conferida de novo, sem custo (caso real 'campanhas de marketing', 2026-09-30)", async()=>{
  setup();
  const k3 = "aaaaaaaa-0000-4000-8000-000000000003";
  rows.push({ ...clone(rows[1]), id: k3, keyword: "captação de pacientes em clínica de estética", volume_search: 40, territoryRef: "territory:other", keywordDnaRef: { entityId: k3, versionId: `${k3}:v1`, contentHash: `sha256:${"d".repeat(64)}` }, canonicalWorkflow: { ...clone(rows[1].canonicalWorkflow), id: `workflow-${k3}` } });
  diverge = new Set([k3]);
  const run = await prepare();
  const p = run.proposals[0];
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.equal(p.principalId, newId);
  assert.ok(!p.memberIds.includes(k3) && !p.addIds.includes(k3), "a que o Google separou fica de fora");
  assert.match(p.reasons.join(" "), /O Google separou “captação de pacientes em clínica de estética” da principal/);
  assert.equal(paid, 0, "a composição menor sai do cache");
});

test("composição menor com a página sem volume como principal: a âncora é a entrada de maior volume (caso real 'como captar clientes', 2026-09-30)", async()=>{
  setup();
  rows[0].primaryKeywordPolicy = "locked";
  const k3 = "aaaaaaaa-0000-4000-8000-000000000003";
  rows.push({ ...clone(rows[1]), id: k3, keyword: "captação de pacientes em clínica de estética", volume_search: 40, territoryRef: "territory:other", keywordDnaRef: { entityId: k3, versionId: `${k3}:v1`, contentHash: `sha256:${"d".repeat(64)}` }, canonicalWorkflow: { ...clone(rows[1].canonicalWorkflow), id: `workflow-${k3}` } });
  diverge = new Set([k3]);
  const run = await prepare();
  const p = run.proposals[0];
  assert.equal(p.principalId, oldId, "Travado: a página continua a principal");
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.deepEqual(p.addIds, [newId]);
  assert.match(p.reasons.join(" "), /O Google separou/);
  assert.equal(paid, 0);
});

test("o Google separa todas as entradas da página: a linha diz 'outro assunto' e aponta as Sobras (caso real 'como captar clientes', 2026-09-30)", async()=>{
  setup();
  rows[0].primaryKeywordPolicy = "locked"; rows[0].volume_search = 10; rows[0].volume_source = "google_ads";
  diverge = new Set([newId]);
  const run = await prepare();
  const p = run.proposals[0];
  assert.notEqual(p.status, "ready");
  assert.match(p.reasons.join(" "), /O Google trata “captação de pacientes para clínica de estética” como outro assunto/, JSON.stringify(p.reasons));
  assert.match(p.reasons.join(" "), /Sobras/);
  assert.equal(paid, 0);
});
