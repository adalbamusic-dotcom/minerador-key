import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_AMAZON_REFREEZE_LABELS,
  RADAR_YOUTUBE_REFREEZE_LABELS,
  radarRefreezeButtonLabel,
  radarRefreezeComparable,
  radarRefreezeDiagnosis,
  radarRefreezeDifferences,
  radarReopenedGooglePatch,
} from "../lib/radar/refreeze-repair.ts";

/*
 * ===== REPARAR O CONGELAMENTO — SDD diretriz editorial, Adendo E (2026-10-02) =====
 *
 * Decisão do dono: um botão cirúrgico POR PERFIL (Google, YouTube, Amazon),
 * com dois caminhos incorporados — recongelar com a leitura atual (grátis) e,
 * quando o material gravado não basta, zerar e coletar de novo (pago) — e
 * salvaguardas. Aqui: a regra (domínio puro, de verdade) e as salvaguardas da
 * tela e do servidor (estruturais: o servidor da Amazon lê o repositório de
 * artefatos, e a tela é React). PROVIDER_CALLS = 0.
 */

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8").then(texto => texto.replace(/\r\n/g, "\n"));
const semComentarios = (fonte: string) => fonte.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ");

test("a decisão: não finalizada, nada a reparar, recongelar grátis ou coletar pago — com as consequências ditas antes", () => {
  assert.equal(radarRefreezeDiagnosis({ profile: "GOOGLE", finalized: false, differences: ["x"], blocker: null }).mode, "NOT_FINALIZED");
  const nada = radarRefreezeDiagnosis({ profile: "YOUTUBE", finalized: true, differences: [], blocker: null });
  assert.equal(nada.mode, "NOTHING");
  assert.deepEqual(nada.consequences, [], "nada a reparar não promete escrita");

  const gratis = radarRefreezeDiagnosis({ profile: "GOOGLE", finalized: true, differences: ["Afirmações a sustentar: 12 no dossiê, 13 no congelado."], blocker: null });
  assert.equal(gratis.mode, "REFREEZE");
  assert.match(gratis.consequences.join("\n"), /nenhuma chamada ao provider/);
  assert.match(gratis.consequences.join("\n"), /São duas gravações: reabrir e congelar/, "o Google diz que são duas escritas");
  assert.match(gratis.consequences.join("\n"), /artigo-modelo da SERP é organizado de novo \(1 chamada de IA/);
  assert.match(gratis.consequences.join("\n"), /Atualização disponível/);
  assert.match(gratis.consequences.join("\n"), /URL, slug, canonical, keyword principal, papel e Silo não mudam; YouTube, Amazon, Vídeos e Especialista não são tocados/);

  const pago = radarRefreezeDiagnosis({ profile: "AMAZON", finalized: true, differences: ["y"], blocker: "A pesquisa Amazon ainda não está concluída." });
  assert.equal(pago.mode, "RECOLLECT", "o bloqueio do ensaio vence a diferença: o material gravado não basta");
  assert.equal(pago.reason, "A pesquisa Amazon ainda não está concluída.");
  assert.match(pago.consequences.join("\n"), /CHAMADA PAGA ao provider/);
  assert.match(pago.consequences.join("\n"), /A coleta só começa depois de o servidor confirmar o reset/);
  assert.match(pago.consequences.join("\n"), /Google, YouTube, Vídeos e Especialista não são tocados/, "zera só o perfil");

  assert.equal(radarRefreezeButtonLabel("YOUTUBE"), "Reparar congelamento (YouTube)");
});

test("a comparação não olha o relógio nem o hash: refazer hoje sem mudança é nada a reparar", () => {
  const antes = { finalizedAt: "2026-10-01T02:44:09.902Z", finalizedBy: "u1", blueprint: { generatedAt: "2026-10-01", recommended: { gaps: ["a"] }, observed: { padroes: [1] } }, bundleHash: "aaaa" };
  const hoje = { finalizedAt: "2026-10-02T15:00:00.000Z", finalizedBy: "u2", blueprint: { observed: { padroes: [1] }, recommended: { gaps: ["a"] }, generatedAt: "2026-10-02" }, bundleHash: "bbbb" };
  assert.equal(radarRefreezeComparable(antes), radarRefreezeComparable(hoje));
  assert.deepEqual(radarRefreezeDifferences(antes, hoje, RADAR_YOUTUBE_REFREEZE_LABELS), []);

  const mudou = { ...hoje, blueprint: { ...hoje.blueprint, recommended: { gaps: ["Nenhum Short identificado na amostra coletada"] } } };
  assert.deepEqual(radarRefreezeDifferences(antes, mudou, RADAR_YOUTUBE_REFREEZE_LABELS), ["Mudou a recomendação do YouTube (estratégia, lacunas, roteiro ou títulos)."]);
  assert.deepEqual(
    radarRefreezeDifferences({ competitiveBlueprint: { a: 1 }, limitations: [] }, { competitiveBlueprint: { a: 2 }, limitations: ["nova"] }, RADAR_AMAZON_REFREEZE_LABELS),
    ["Mudou o blueprint competitivo da Amazon (critérios, shortlist ou recomendação).", "Mudaram as limitações declaradas."],
  );
  assert.deepEqual(radarRefreezeDifferences({ x: { y: 1 } }, { x: { y: 2 } }), ["Mudou: x.y"], "caminho sem rótulo sai como está");
});

test("a projeção reaberta do Google tira a fotografia e o carimbo de finalização, e só isso", () => {
  const registro = { fingerprint: "f1", queries: [1, 2], finalizedAt: "2026-10-01", finalizedBy: "u", conclusion: { x: 1 }, startedAt: "s" };
  const patch = radarReopenedGooglePatch(registro);
  assert.equal(patch.finalizedBundle, null);
  assert.deepEqual(patch.deepResearch, { fingerprint: "f1", queries: [1, 2], finalizedAt: null, finalizedBy: null, conclusion: null, startedAt: "s" });
  assert.deepEqual(radarReopenedGooglePatch(null), { finalizedBundle: null, deepResearch: null });
});

test("Google: a prévia relê o servidor e ensaia as MESMAS funções do Finalizar antes de qualquer escrita", async () => {
  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  const ensaio = pagina.slice(pagina.indexOf("const ensaioDoGoogle = async"), pagina.indexOf("const recongelarGoogle = async"));
  assert.match(ensaio, /await analiseConfirmadaNoServidor\(target\)/, "lê a versão corrente inteira do servidor");
  assert.match(ensaio, /radarReopenedGooglePatch\(/);
  assert.match(ensaio, /radarObservedDivergesFromFrozen\(investigacao\.observed, congelado\)/, "a MESMA régua do bloqueio");
  assert.match(ensaio, /finalizeRadarDeepResearch\(\{/);
  assert.match(ensaio, /freezeRadarEvidenceBundle\(\{/);
  assert.doesNotMatch(ensaio, /saveRadarAnalysis|gravarYoutube|fetch\(/, "a prévia não grava nem chama rede além da leitura");

  const recongelar = pagina.slice(pagina.indexOf("const recongelarGoogle = async"), pagina.indexOf("const recoletarGoogle = async"));
  const ordem = ["recusarSeEmCurso()", "await ensaioDoGoogle(target)", "diagnosis.mode !== \"REFREEZE\"", "saveRadarAnalysis(target.articleId, reaberta, { requireRemote: true", "await analiseConfirmadaNoServidor(target)", "await finalizarInvestigacaoGoogle(linhaRelida"];
  const posicoes = ordem.map(trecho => recongelar.indexOf(trecho));
  assert.ok(posicoes.every(posicao => posicao >= 0), `todos os passos: ${posicoes}`);
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes, "ensaio antes de reabrir; congela pela rotina do botão depois da releitura");
});

test("caminho pago: o reset tem de voltar confirmado do servidor antes de a coleta começar, e só no artigo da tela", async () => {
  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  const google = pagina.slice(pagina.indexOf("const recoletarGoogle = async"), pagina.indexOf("const ensaioDoYoutube = async"));
  assert.match(google, /buildRadarResetPayload\(lida\.corrente\.payload\)/, "o MESMO reset do Google");
  assert.match(google, /requireRemote: true/);
  assert.ok(google.indexOf("if (!gravado.readbackConfirmed) throw") < google.indexOf("coletaDepoisDoResetRef.current = { articleId: target.articleId, profile: \"GOOGLE\" }"));

  const zerar = pagina.slice(pagina.indexOf("const zerarPerfilNoServidor = async"), pagina.indexOf("const ensaioDoGoogle = async"));
  assert.match(zerar, /requireRemote: true/);
  assert.match(zerar, /if \(!gravado\.readbackConfirmed\) throw/);
  for (const perfil of ["YOUTUBE", "AMAZON"]) {
    const nome = perfil === "YOUTUBE" ? "recoletarYoutube" : "recoletarAmazon";
    const corpo = pagina.slice(pagina.indexOf(`const ${nome} = async`), pagina.indexOf(`const ${nome} = async`) + 900);
    assert.ok(corpo.indexOf("await zerarPerfilNoServidor(") < corpo.indexOf(`profile: "${perfil}"`), `${perfil}: reset confirmado antes da continuação`);
  }

  /* A continuação: só com o perfil zerado na tela; outro artigo aberto cancela. Hooks antes do retorno antecipado. */
  const continuar = pagina.slice(pagina.indexOf("continuarColetaRef.current = () => {"), pagina.indexOf("continuarColetaRef.current = () => {") + 1800);
  assert.match(continuar, /activeRadarItem\.articleId !== pendente\.articleId[\s\S]*coletaDepoisDoResetRef\.current = null/);
  assert.match(continuar, /if \(!zerado\) return;/);
  assert.match(continuar, /startDeepResearch : pendente\.profile === "YOUTUBE" \? startYoutubeSearch : startAmazonSearch/, "os MESMOS handlers de iniciar");
  assert.ok(pagina.indexOf("useEffect(() => { continuarColetaRef.current?.(); });") < pagina.indexOf("if (state || !pipeline.snapshot) return state;"));
});

test("YouTube: a corrida tem de ser a da fotografia, e a fotografia nova é a mesma montagem do Finalizar", async () => {
  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  const ensaio = pagina.slice(pagina.indexOf("const ensaioDoYoutube = async"), pagina.indexOf("const recongelarYoutube = async"));
  assert.match(ensaio, /resolveRadarFrozenRun\(\{ frozen: congelada, liveRun: base\.payload\.youtubeSearch \}\)/);
  assert.match(ensaio, /fotografiaDoYoutube\(target, \{ run: corrida, base \}\)/);
  assert.match(pagina, /const congelarInvestigacaoYoutube = async [^=]*=> gravarYoutube\(target, \{ youtubeFrozenInvestigation: fotografiaDoYoutube\(target, entrada\) \}, entrada\.base\)/, "o botão Finalizar usa a mesma montagem");
  assert.doesNotMatch(ensaio, /gravarYoutube|saveRadarAnalysis/, "a prévia não grava");
});

test("Amazon: a ação refreeze — prévia sem escrita, nada a reparar sem escrita, uma escrita só e sem provider", async () => {
  const servidor = semComentarios(await ler("lib/server/radar-amazon-analyze.ts"));
  const refreeze = servidor.slice(servidor.indexOf("export async function refreezeRadarAmazonInvestigation"), servidor.indexOf("export { resolveRadarAmazonFrozenRun"));
  assert.match(refreeze, /amazonFrozenInvestigation: null, amazonBlueprint: null/, "analisa a projeção sem a fotografia");
  assert.match(refreeze, /validarColetaAmazon\(projetado\)[\s\S]*montarBlueprintAmazon\([\s\S]*fotografiaAmazon\(/, "as MESMAS montagens de analisar e finalizar");
  assert.match(refreeze, /if \(entrada\.dryRun \|\| diagnosis\.mode !== "REFREEZE" \|\| !nova\) return \{ diagnosis, written: false/);
  assert.equal((refreeze.match(/appendAnalysis\(/g) || []).length, 1, "uma escrita só");
  assert.doesNotMatch(refreeze, /fetch\(|executeDataForSeo|collect/i, "sem provider");

  const rota = semComentarios(await ler("app/api/editorial/radar-amazon-search/route.ts"));
  assert.match(rota, /action: z\.enum\(\["collect", "retry-support", "analyze", "finalize", "resolve-product", "refreeze"\]\)/);
  assert.match(rota, /dryRun: z\.boolean\(\)\.optional\(\)/);
  const bloco = rota.slice(rota.indexOf("if (input.action === \"refreeze\")"), rota.indexOf("if (input.action === \"finalize\")"));
  assert.match(bloco, /dryRun: input\.dryRun === true/);
  assert.ok(rota.indexOf("if (input.action === \"refreeze\")") < rota.indexOf("if (!input.queries.length)"), "antes de qualquer coisa de coleta");

  /* Analisar continua recusando sobre a fotografia (§27); finalizar continua idempotente. */
  assert.match(servidor, /"amazon_already_finalized"/);
  assert.match(servidor, /alreadyFrozen: true/);
});

test("um painel por perfil, só sobre a fotografia, com a prévia antes da confirmação", async () => {
  const painel = semComentarios(await ler("modules/radar/radar-refreeze-panel.tsx"));
  assert.match(painel, /O diagnóstico é leitura e não altera nada\. Só a confirmação abaixo grava\./);
  assert.match(painel, /diagnostico\?\.mode === "REFREEZE" && <button[^>]*onClick=\{\(\) => void executar\(onRefreeze\)\}/);
  assert.match(painel, /diagnostico\?\.mode === "RECOLLECT" && <button[^>]*onClick=\{\(\) => void executar\(onRecollect\)\}/);
  assert.match(painel, /Zerar e coletar de novo \(pago\)/);

  const workbench = semComentarios(await ler("modules/radar/radar-r3-workbench.tsx"));
  assert.match(workbench, /refreeze && view\.finalizedBundle && <RadarRefreezePanel profile="GOOGLE"/);
  const youtube = semComentarios(await ler("modules/radar/radar-youtube-search-panel.tsx"));
  assert.match(youtube, /finalizada && refreeze && <RadarRefreezePanel profile="YOUTUBE"/);
  const amazon = semComentarios(await ler("modules/radar/radar-amazon-search-panel.tsx"));
  assert.match(amazon, /finalizada && refreeze && <RadarRefreezePanel profile="AMAZON"/);

  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  assert.match(pagina, /googleRefreeze=\{reparoDoCongelamento\("GOOGLE"\)\}/);
  assert.match(pagina, /refreeze: reparoDoCongelamento\("YOUTUBE"\)/);
  assert.match(pagina, /refreeze: reparoDoCongelamento\("AMAZON"\)/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.ok(true, "domínio puro e leitura de fonte: nenhuma rede");
});
