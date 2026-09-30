import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";

let screen: RadarDomScreen, calls: any[], restored: any, applied: number;
const fixture = () => ({ brandId: "brand-a", runId: "run", decisionHash: "a".repeat(64), state: "prepared", acceptedIds: null, leaseUntil: null, costs: { paidQueries: 2, estimatedCostUsd: {min:.004,max:.006}, missingDetails:[{keyword:"demanda nova",lens:"mobile-ios",reason:"missing"}] }, keywords:[{id:"old",keyword:"tema antigo",volumeValidated:false},{id:"new",keyword:"demanda nova",volume:50,volumeValidated:true}], proposals:["a","b"].map(id=>({targetId:id,kind:"published",theme:`Publicado ${id}`,currentPrimaryId:"old",principalId:"new",memberIds:["old","new"],addIds:["new"],removeIds:[],transfers:[],angle:`enfoque ${id}`,exclusions:[],reasons:["Cache completo"],status:"ready"})),notices:[],outcomes:[] });
const panel = (brandId="brand-a") => React.createElement(ArticleImprovementPanel,{brandId,onApplied:()=>{applied++;},buttonClassName:"button",primaryButtonClassName:"button"});
const button = (text: string) => [...screen.container.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===text)!;
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
  await screen.render(panel());await screen.click(button("Preparar melhorias"));assert.equal(calls.length,1);
  assert.match(screen.text(),/volume 50/);await screen.click(button("Revisar custo da SERP"));assert.match(screen.text(),/mobile-ios/);await screen.click(button("Cancelar"));assert.equal(calls.filter(c=>c.action==="collect").length,0);
  await screen.click(button("Aplicar melhorias (2)"));assert.equal(calls.length,1);await screen.click(button("Confirmar e aplicar"));
  const applies=calls.filter(c=>c.action==="apply");assert.equal(applies.length,2);assert.deepEqual(applies[0].targetIds,["a","b"]);assert.equal(applies[0].approveNewKeywords,true);assert.equal(applies[1].targetIds,undefined);
  assert.match(screen.text(),/Melhoria gravada/);assert.match(screen.text(),/Falha recuperável/);assert.equal(applied,1);
});
test("F5 restores server acceptance and offers continuation without another confirmation",async()=>{
  restored={...fixture(),state:"applying",acceptedIds:["a","b"]};await screen.render(panel());
  await screen.click(button("Continuar melhorias aceitas"));assert.equal(calls[0].action,"apply");assert.equal(calls[0].targetIds,undefined);assert.equal(calls.length,2);
});
test("an old-brand response cannot restore state after switching brand",async()=>{
  let deliver: ((value: Response)=>void)|undefined;
  globalThis.fetch=async (_url,options)=>options?.method?new Promise<Response>(resolve=>{deliver=resolve;}):new Response(JSON.stringify({success:true,data:null}));
  await screen.render(panel());await screen.click(button("Preparar melhorias"));await screen.render(panel("brand-b"));
  await React.act(async()=>{deliver!(new Response(JSON.stringify({success:true,data:fixture()})));});
  assert.doesNotMatch(screen.text(),/Publicado a/);assert.equal(button("Preparar melhorias").disabled,false);
});
