import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";

let screen: RadarDomScreen, calls: any[], restored: any, applied: number;
const fixture = () => ({ brandId: "brand-a", runId: "run", decisionHash: "a".repeat(64), state: "prepared", acceptedIds: null, leaseUntil: null, costs: { paidQueries: 2, estimatedCostUsd: {min:.004,max:.006}, missingDetails:[{keyword:"demanda nova",lens:"mobile-ios",reason:"missing"}] }, keywords:[{id:"old",keyword:"tema antigo",volumeValidated:false},{id:"new",keyword:"demanda nova",volume:50,volumeValidated:true}], proposals:["a","b"].map(id=>({targetId:id,kind:"published",theme:`Publicado ${id}`,currentPrimaryId:"old",principalId:"new",memberIds:["old","new"],addIds:["new"],removeIds:[],transfers:[],angle:`enfoque ${id}`,exclusions:[],reasons:["Cache completo"],status:"ready"})),notices:[],outcomes:[] });
const panel = (brandId="brand-a", hasLeftovers?: boolean) => comProductShell(React.createElement(ArticleImprovementPanel,{brandId,onApplied:()=>{applied++;},buttonClassName:"button",primaryButtonClassName:"button",hasLeftovers}));
const button = (text: string) => [...screen.container.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===text)!;
const nextStep = () => screen.container.querySelector<HTMLElement>("[data-testid='architect-improvement-next-step']");
test.beforeEach(async()=>{
  calls=[]; restored=null; applied=0; screen=await montarRadar();
  globalThis.fetch=async (_url,options) => {
    if(!options?.method) return new Response(JSON.stringify({success:true,data:restored}));
    const body=JSON.parse(String(options.body));calls.push(body);
    const run=fixture();
    if(body.action==="apply"){
      const number=calls.filter(c=>c.action==="apply").length;
      Object.assign(run,{state:number===1?"applying":"complete",acceptedIds:["a","b"],outcomes:[{targetId:"a",status:"improved",message:"Relido"},...(number===2?[{targetId:"b",status:"failed",message:"Falha por alvo"}]:[])]});
    }
    return new Response(JSON.stringify({success:true,data:run}));
  };
});
test.afterEach(()=>screen.destroy());
test("one acceptance completes the batch; cancelling costs does not block ready targets",async()=>{
  await screen.render(panel());await screen.click(button("1 · Buscar keywords (grátis)"));assert.equal(calls.length,1);
  assert.match(screen.text(),/volume 50/);await screen.click(button("2 · Validar no Google (2 consultas, até US$ 0.01)"));assert.match(screen.text(),/mobile-ios/);await screen.click(button("Cancelar"));assert.equal(calls.filter(c=>c.action==="collect").length,0);
  // Com a validação pendente (passo 2 no cartão), gravar direto fica na fileira, sem número.
  await screen.click(button("Gravar sem validar (2)"));assert.equal(calls.length,1);await screen.click(button("Confirmar e aplicar"));
  const applies=calls.filter(c=>c.action==="apply");assert.equal(applies.length,2);assert.deepEqual(applies[0].targetIds,["a","b"]);assert.equal(applies[0].approveNewKeywords,true);assert.equal(applies[1].targetIds,undefined);
  assert.match(screen.text(),/Melhoria gravada/);assert.match(screen.text(),/Falha recuperável/);assert.equal(applied,1);
});
test("F5 restores server acceptance and offers continuation without another confirmation",async()=>{
  restored={...fixture(),state:"applying",acceptedIds:["a","b"]};await screen.render(panel());
  // O cartão Próximo passo assume o "Continuar"; a fileira não repete o mesmo ato.
  assert.equal(nextStep()?.dataset.nextStep,"resume_apply");assert.equal(button("Continuar melhorias aceitas"),undefined);
  await screen.click(button("Continuar"));assert.equal(calls[0].action,"apply");assert.equal(calls[0].targetIds,undefined);assert.equal(calls.length,2);
});
test("o cartão Próximo passo mostra uma frase e um botão, na ordem 1 → 2 → 3",async()=>{
  await screen.render(panel());
  assert.equal(nextStep()?.dataset.nextStep,"prepare");assert.match(nextStep()!.textContent!,/Comece aqui/);
  assert.equal(nextStep()!.querySelectorAll("button").length,1);
  // Um botão por ato: o "1 · Buscar" do cartão não aparece de novo na fileira.
  assert.equal([...screen.container.querySelectorAll("button")].filter(b=>b.textContent==="1 · Buscar keywords (grátis)").length,1);
  await screen.click(button("1 · Buscar keywords (grátis)"));
  assert.equal(nextStep()?.dataset.nextStep,"validate");assert.equal(nextStep()!.querySelector("button")!.textContent,"2 · Validar no Google (2 consultas, até US$ 0.01)");
});
test("sem nada pendente, o cartão manda para as Sobras quando elas existem",async()=>{
  restored={...fixture(),state:"complete",acceptedIds:["a","b"],costs:{paidQueries:0,estimatedCostUsd:{min:0,max:0},missingDetails:[]}};
  await screen.render(panel("brand-a",true));
  assert.equal(nextStep()?.dataset.nextStep,"none");assert.match(nextStep()!.textContent!,/Nada a fazer nos publicados agora\. Veja artigos novos em Sobras\./);
  assert.equal(nextStep()!.querySelector("button")!.textContent,"Ver Sobras");
});
test("sem Sobras, o cartão não promete Sobras e o botão leva a Artigos novos",async()=>{
  restored={...fixture(),state:"complete",acceptedIds:["a","b"],costs:{paidQueries:0,estimatedCostUsd:{min:0,max:0},missingDetails:[]}};
  const alvo=document.createElement("section");alvo.id="architect-articles-new";let rolou=0;alvo.scrollIntoView=()=>{rolou++;};document.body.appendChild(alvo);
  try{
    await screen.render(panel("brand-a",false));
    assert.doesNotMatch(nextStep()!.textContent!,/Veja artigos novos em Sobras/);assert.match(nextStep()!.textContent!,/Processar artigos/);
    await screen.click(button("Ir para Artigos novos"));assert.equal(rolou,1);assert.equal(calls.length,0);
  }finally{alvo.remove();}
});
test("linhas prontas desmarcadas: o cartão pede a marcação, com o botão desabilitado",async()=>{
  restored={...fixture(),costs:{paidQueries:0,estimatedCostUsd:{min:0,max:0},missingDetails:[]}};await screen.render(panel());
  assert.equal(nextStep()?.dataset.nextStep,"apply");
  for(const caixa of screen.container.querySelectorAll<HTMLInputElement>("input[type='checkbox']")) await screen.click(caixa);
  assert.equal(nextStep()?.dataset.nextStep,"select");assert.match(nextStep()!.textContent!,/2 melhoria\(s\) pronta\(s\)\. Marque na tabela/);
  assert.equal(nextStep()!.querySelector("button")!.disabled,true);assert.doesNotMatch(screen.text(),/Nada a fazer/);
});
test("a fileira não repete números: no passo 2, gravar aparece como 'Gravar sem validar'",async()=>{
  restored=fixture();await screen.render(panel());
  assert.equal(nextStep()?.dataset.nextStep,"validate");
  assert.ok(button("Gravar sem validar (2)"));assert.equal(button("3 · Gravar melhorias (2)"),undefined);
});
test("tempo esgotado na validação: continua sozinho pelo andamento guardado",async()=>{
  restored={...fixture(),state:"collecting"};await screen.render(panel());
  let collects=0;
  globalThis.fetch=async (_url,options)=>{
    const body=JSON.parse(String(options!.body));calls.push(body);
    // 1º passo avança e continua "collecting"; o 2º esgota o tempo (a plataforma responde HTML); o 3º termina.
    if(body.action==="collect"&&++collects===2) return new Response("<html>timeout</html>",{status:504});
    return new Response(JSON.stringify({success:true,data:{...fixture(),state:body.action==="collect"&&collects>=3?"validated":"collecting"}}));
  };
  await screen.click(button("Continuar"));
  assert.deepEqual(calls.map(c=>c.action),["collect","collect","status","collect"]);assert.doesNotMatch(screen.text(),/demorou demais/);
});
test("a tabela mostra só o que pode mudar; o resto fica em 'sem melhoria possível'",async()=>{
  const base=fixture();restored={...base,proposals:[base.proposals[0],{...base.proposals[1],status:"adequate",reasons:["Já cobre a busca"]}]};
  await screen.render(panel());
  assert.equal(screen.container.querySelectorAll("tbody tr").length,1);
  const guardado=[...screen.container.querySelectorAll("details")].find(d=>/sem melhoria possível/.test(d.querySelector("summary")?.textContent??""));
  assert.ok(guardado);assert.equal(guardado!.open,false);assert.match(guardado!.textContent!,/1 sem melhoria possível agora[\s\S]*Publicado b · Já adequado · Já cobre a busca/);
});
test("validação pela metade: o cartão oferece Continuar, sem custo novo",async()=>{
  restored={...fixture(),state:"collecting"};await screen.render(panel());
  assert.equal(nextStep()?.dataset.nextStep,"resume_collect");assert.equal(button("Continuar validação (sem custo novo)"),undefined);
});
test("an old-brand response cannot restore state after switching brand",async()=>{
  let deliver: ((value: Response)=>void)|undefined;
  globalThis.fetch=async (_url,options)=>options?.method?new Promise<Response>(resolve=>{deliver=resolve;}):new Response(JSON.stringify({success:true,data:null}));
  await screen.render(panel());await screen.click(button("1 · Buscar keywords (grátis)"));await screen.render(panel("brand-b"));
  await React.act(async()=>{deliver!(new Response(JSON.stringify({success:true,data:fixture()})));});
  assert.doesNotMatch(screen.text(),/Publicado a/);assert.equal(button("1 · Buscar keywords (grátis)").disabled,false);
});
test("leitura da IA: a linha mostra 'Leitura da IA — confira' com o motivo; a que falta validar fica sem marcação",async()=>{
  const base=fixture();
  restored={...base,keywords:[...base.keywords,{id:"lista",keyword:"como atrair clientes",volume:720,volumeValidated:true}],proposals:[
    {...base.proposals[0],principalId:"old",memberIds:["old","lista"],addIds:["lista"],evidenceBasis:"editorial_ai",aiReasons:[{keywordId:"lista",reason:"Quem busca quer o mesmo passo a passo."}]},
    {...base.proposals[1],status:"insufficient_evidence",needsValidation:true,evidenceBasis:"editorial_ai",aiReasons:[{keywordId:"new",reason:"Mesmo público da página."}]},
  ]};
  await screen.render(panel());
  const leituras=screen.container.querySelectorAll("[data-testid='architect-improvement-ai-reading']");
  assert.equal(leituras.length,2);
  assert.match(leituras[0].textContent!,/Leitura da IA — confira[\s\S]*como atrair clientes: Quem busca quer o mesmo passo a passo\./);
  assert.equal(screen.container.querySelectorAll("tbody tr").length,2,"a linha que precisa validar continua visível");
  const caixas=[...screen.container.querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
  assert.equal(caixas[0].disabled,false);assert.equal(caixas[1].disabled,true);
  assert.match(screen.text(),/Precisa validar no Google \(passo 2\)/);
});
test("origem por linha, recusas da IA recolhidas e sugestão da IA derrubada pela SERP com o motivo",async()=>{
  const base=fixture();
  restored={...base,costs:{paidQueries:0,estimatedCostUsd:{min:0,max:0},missingDetails:[]},keywords:[...base.keywords,{id:"lista",keyword:"como atrair clientes",volume:720,volumeValidated:true},{id:"ideia",keyword:"ideia nova",volume:90,volumeValidated:true,external:true}],proposals:[
    {...base.proposals[0],evidenceBasis:"serp"},
    {...base.proposals[1],principalId:"old",memberIds:["old","ideia"],addIds:["ideia"],evidenceBasis:"editorial_and_candidate_serp"},
    {...base.proposals[0],targetId:"c",theme:"Publicado c",principalId:"old",memberIds:["old","lista"],addIds:["lista"],status:"insufficient_evidence",evidenceBasis:"editorial_ai",aiReasons:[{keywordId:"lista",reason:"Mesmo passo a passo."}],reasons:["A IA sugeriu esta composição, mas a SERP dela não confirmou: nada entra."]},
  ],editorialAi:{status:"answered",askedTargetIds:["c"],listSize:3,picks:[],rejected:[{targetId:"c",keywordId:"k9",keyword:"clinica de estetica facial",theme:"Publicado c",reason:"Não leva o núcleo do assunto do artigo: outro público ou outra necessidade."}],rejectedCount:1}};
  await screen.render(panel());
  assert.deepEqual([...screen.container.querySelectorAll("[data-testid='architect-improvement-origin']")].map(e=>e.textContent),["Origem: Pares da SERP","Origem: Busca nova no Google Ads"]);
  assert.match(screen.container.querySelector("[data-testid='architect-improvement-ai-parked']")!.textContent!,/Leitura da IA — confira: como atrair clientes \(Mesmo passo a passo\.\)/);
  assert.match(screen.text(),/Publicado c · Evidência insuficiente · A IA sugeriu esta composição/);
  const recusas=screen.container.querySelector<HTMLDetailsElement>("[data-testid='architect-improvement-ai-rejected']")!;
  assert.equal(recusas.open,false);assert.match(recusas.textContent!,/Sugestões da IA recusadas pelas regras \(1\)[\s\S]*clinica de estetica facial → Publicado c: Não leva o núcleo/);
});
test("barra de progresso: contador e porcentagem quando o total é conhecido; pulso e tempo decorrido quando não é", async () => {
  const { ImprovementProgress } = await import("../modules/arquiteto/article-improvement-panel.tsx");
  const inicio = 1_000_000;
  await screen.render(React.createElement(ImprovementProgress, { activity: { action: "collect", startedAt: inicio }, now: inicio + 75_000, done: 7, total: 36, unit: "grupos validados" }));
  assert.match(screen.text(), /Validando no Google/);
  assert.match(screen.text(), /7 de 36 grupos validados/);
  assert.match(screen.text(), /19%/);
  assert.match(screen.text(), /1 min 15 s/);
  const barra = screen.container.querySelector('[role="progressbar"]')!;
  assert.equal(barra.getAttribute("aria-valuenow"), "19");
  await screen.render(React.createElement(ImprovementProgress, { activity: { action: "prepare", startedAt: inicio }, now: inicio + 12_000, done: null, total: null, unit: "" }));
  assert.match(screen.text(), /Buscando keywords/);
  assert.match(screen.text(), /Em andamento · 12 s/);
  assert.equal(screen.container.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow"), null);
});
