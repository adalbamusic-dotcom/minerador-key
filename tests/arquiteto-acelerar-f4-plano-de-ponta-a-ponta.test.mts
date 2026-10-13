import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { choosePlanSiloTerritory, confirmedTerritoryDraft, declaredPlanSiloDraft, declaredPlanSiloNote } from "../lib/arquiteto/declared-plan-silo.ts";
import { ArticleImprovementRequestSchema } from "../lib/arquiteto/article-improvement-request.ts";
import { TerritoryCandidateSchema } from "../lib/arquiteto/territory.ts";

/*
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, F4 —
 * itens 1 (Silo do plano confirmado no envio), 4 (uma porta para formar os
 * artigos do plano), 10 (aplicar o plano já com a retirada) e 15 ("Tirar do
 * plano" numa confirmação). Domínio puro e leitura estrutural sem comentários;
 * nada de banco nem chamada paga.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");
const ler = (arquivo: string) => semComentarios(readFileSync(arquivo, "utf8"));
const slug = (texto: string) => texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ------------------------------ item 1 ------------------------------ */

test("item 1 · o Silo do plano: o ligado ao grupo, senão o de mesmo slug, senão um candidato novo; rejeitado não conta", () => {
  const territorios = [
    { territoryRef: "territory:a", lifecycleStatus: "confirmed", slugs: ["outro"] },
    { territoryRef: "territory:b", lifecycleStatus: "candidate", slugs: [null, "planos-de-internet"] },
    { territoryRef: "territory:c", lifecycleStatus: "rejected", slugs: ["wi-fi"] },
  ];
  const plano = { siloName: "Planos de internet", siloSlug: "planos-de-internet" };
  assert.deepEqual(choosePlanSiloTerritory({ plan: plano, linkedTerritoryRef: "territory:a", territories: territorios, slugOf: slug }), { kind: "linked", territoryRef: "territory:a", lifecycleStatus: "confirmed" });
  assert.deepEqual(choosePlanSiloTerritory({ plan: plano, linkedTerritoryRef: null, territories: territorios, slugOf: slug }), { kind: "slug", territoryRef: "territory:b", lifecycleStatus: "candidate" });
  assert.deepEqual(choosePlanSiloTerritory({ plan: { siloName: "Wi-Fi", siloSlug: null }, linkedTerritoryRef: "territory:c", territories: territorios, slugOf: slug }), { kind: "create" }, "rejeitado não recebe membros");
});

test("item 1 · o candidato novo nasce com nome/slug do plano e a proveniência do cadastro (campos que já existem no território)", () => {
  const nota = declaredPlanSiloNote({ groupLabel: "Azul (Wi-Fi)", planVersion: 3, actorUserId: "u1", at: "2026-10-13T10:00:00.000Z" });
  assert.equal(nota, "Plano declarado no cadastro: grupo Azul (Wi-Fi), plano v3, por u1 em 2026-10-13.");
  const rascunho = declaredPlanSiloDraft({ plan: { siloName: "Wi-Fi e fibra", siloSlug: null }, slugOf: slug, note: nota });
  assert.equal(rascunho.architecturalOrigin, "manual_strategic");
  assert.equal(rascunho.ingestionOrigin, "import");
  assert.deepEqual(rascunho.provenance, { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: nota });
  assert.equal((rascunho.slugState as { proposals: Array<{ slug: string }> }).proposals[0].slug, "wi-fi-e-fibra");
  const valido = TerritoryCandidateSchema.safeParse({ ...rascunho, territoryRef: "territory:11111111-1111-4111-8111-111111111111", brandId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(valido.success, true, valido.success ? "" : JSON.stringify(valido.error.issues.slice(0, 3)));
  const confirmado = confirmedTerritoryDraft(rascunho);
  assert.equal(confirmado.lifecycleStatus, "confirmed");
  assert.equal(confirmado.decisionState, "confirmed");
  assert.deepEqual(confirmado.slugState, rascunho.slugState, "confirmar não muda slug nem identidade");
});

test("item 1 · o envio chama o Silo do plano DEPOIS da releitura, sem derrubar o envio; publicada e de outro Silo não se movem", () => {
  const envio = ler("lib/server/arquiteto-workspace.ts");
  const corpo = envio.slice(envio.indexOf("export async function createMineradorArquitetoHandoff"), envio.indexOf("export async function previewMineradorArquitetoHandoff"));
  assert.ok(corpo.indexOf("materializeDeclaredPlanSilo(context, prepared.plan.importedKeywordIds)") > corpo.indexOf("O handoff remoto não pôde ser confirmado."), "depois da releitura do recebimento");
  assert.match(corpo, /\} catch \{\s*declaredPlanSilos = \[\];\s*\}/);
  assert.match(corpo, /\.\.\.\(declaredPlanSilos\.length \? \{ declaredPlanSilos \} : \{\}\)/);
  const silo = ler("lib/server/arquiteto-declared-plan-silo.ts");
  assert.match(silo, /const semSilo = linhas\.filter\(linha => !linha\.territoryRef && !linha\.isPublished\);/);
  assert.match(silo, /if \(aprova\) \{/);
  assert.match(silo, /pendente = "Quem envia não tem a permissão de aprovar no Arquiteto/);
  assert.match(silo, /handleArchitectWorkspacePatch\(/, "o mesmo writer da mesa");
  assert.match(silo, /linkEditorialGroupSilo\(/);
  assert.doesNotMatch(silo, /\.delete\(|keywords\/delete|purge/);
});

/* ------------------------------ item 4 ------------------------------ */

test("item 4 · 'Formar os artigos do plano · cor': o prepare aceita o grupo e lê só o recorte; sem grupo, a impressão digital de sempre", () => {
  assert.equal(ArticleImprovementRequestSchema.safeParse({ brandId: "22222222-2222-4222-8222-222222222222", action: "prepare", group: "azul" }).success, true);
  const melhoria = ler("lib/server/arquiteto-article-improvement.ts");
  assert.match(melhoria, /loadCanonicalArquitetoWorkspace\(context, \{ keywordDetail: "full", \.\.\.\(groupFilter \? \{ groupFilter \} : \{\}\) \}\)/);
  assert.match(melhoria, /readDifferentiationBrandKeywords\(context\)/, "a proteção continua lendo a marca inteira");
  assert.match(melhoria, /run\.inputsHash = stableHash\(recorte \? \{ \.\.\.\(digital as Record<string, unknown>\), groupScope: recorte\.scope\.groupId \?\? recorte\.scope\.filter \} : digital\);/);
  const painel = ler("modules/arquiteto/article-improvement-panel.tsx");
  assert.match(painel, /Formar os artigos do plano · \{grupo\.label\}/);
  assert.match(painel, /execute\("prepare", \{ group: grupo\.color \}\)/);
});

test("item 4 · as outras portas apontam para a do plano: Processar artigos (e a formação automática) não roda artigo do plano", () => {
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  const processar = tela.slice(tela.indexOf("const processArticleFormation = useCallback("), tela.indexOf("const processArticleFormationRef = useRef("));
  const portaria = processar.indexOf("planoPorKeywordRef.current.get(id)");
  assert.ok(portaria > 0 && portaria < processar.indexOf("setFormationBusy(true);"), "recusa antes de qualquer processamento");
  assert.match(processar, /use "Formar os artigos do plano · \$\{planos\[0\]\}" no painel da melhoria/);
  assert.match(tela, /planGroups=\{gruposDoPlanoNaMesa\.map\(grupo => \(\{ color: grupo\.color, label: grupo\.label \}\)\)\}/);
});

/* ------------------------------ item 10 ----------------------------- */

test("item 10 · aplicar o plano com a retirada: um hash, retirada pelo núcleo de sempre e só então o plano; falha na retirada não aplica", () => {
  const orq = ler("lib/server/arquiteto-silo-plan-with-withdrawal.ts");
  assert.match(orq, /if \(direto\.state !== "REFUSED" \|\| direto\.code !== "NON_PLAN_ARTICLES" \|\| !direto\.articleIds\?\.length\) return direto;/);
  assert.match(orq, /handleSiloArticleWithdrawal\(withdrawalDeps, \{ siloId: request\.siloId, articleId: line\.articleId, reason: PLAN_WITHDRAWAL_REASON, mode: "apply" \}\)/);
  const retirada = orq.indexOf("handleSiloArticleWithdrawal(withdrawalDeps");
  const aplicar = orq.indexOf("handleSiloDeclaredPlan(planDeps, { siloId: request.siloId, mode: \"apply\", decisionHash: previaDoPlano.decisionHash })");
  assert.ok(retirada > 0 && aplicar > retirada, "retirar antes de aplicar");
  assert.match(orq, /state: "STOPPED"[\s\S]*?o plano NÃO foi aplicado/);
  assert.match(orq, /Fora do plano e desmarcado/, "desmarcar = a recusa de sempre");
  const aplicacao = ler("lib/arquiteto/silo-declared-plan-application.ts");
  assert.match(aplicacao, /\{ \.\.\.refuse\("NON_PLAN_ARTICLES", [\s\S]*?\), articleIds: semPlano \}/);
  const rota = ler("app/api/arquiteto/silo-declared-plan/route.ts");
  assert.match(rota, /parsed\.withdrawNonPlan \? await handleSiloDeclaredPlanWithWithdrawal\(/);
  const painel = ler("modules/arquiteto/silo-declared-plan-panel.tsx");
  assert.match(painel, /withdrawNonPlan: true, withdrawArticleIds: \[\.\.\.retirar\], decisionHash: previa\.decisionHash/);
  assert.match(painel, /Processar links de novo/);
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /onProcessLinks=\{siloId => \{ setSelectedArticleIds\(new Set\(\)\); setWorkspaceMode\("links"\); handleLinksSiloChange\(siloId\); setLinksProcessPending\(siloId\); \}\}/);
  assert.match(tela, /void processarLinksRef\.current\?\.\(\);/);
});

/* ------------------------------ item 15 ----------------------------- */

test("item 15 · 'Tirar do plano' numa confirmação: plano → reaprovar e enviar (encadeamento único) → retirar do Silo, retomável", () => {
  const cadeia = ler("lib/server/declared-plan-withdraw-chain.ts");
  assert.match(cadeia, /plano\.code === "NOT_IN_PLAN"\) steps\.push\(\{ step: "plan", outcome: "already"/);
  assert.match(cadeia, /return \{ mode: "apply", steps, complete: false, message: `Nada foi feito: /);
  const runtime = ler("lib/server/declared-plan-withdraw-chain-runtime.ts");
  assert.match(runtime, /approveAndSendDeps\(brandId, actorUserId\)/);
  assert.match(runtime, /handleSiloArticleWithdrawal\(siloArticleWithdrawalRuntime\(/);
  assert.match(runtime, /withdrawFromDeclaredPlanWithCore\(\{/);
  assert.doesNotMatch(runtime + cadeia, /\.delete\(|keywords\/delete|purge/);
  const rota = ler("app/api/minerador/marcas/[brandId]/plans/withdraw/route.ts");
  assert.match(rota, /if \(input\.chain\) \{/);
  const dialogo = ler("components/editorial/group-manage-dialogs.tsx");
  assert.match(dialogo, /applyDeclaredPlanWithdrawChain\(brandId, groupId, previa\.article\.subject\.keywordId, previa\.decisionHash, opcoes\)/);
  assert.match(dialogo, /useState<DeclaredPlanWithdrawChainOptions>\(\{ reapproveAndSend: true, withdrawFromSilo: true \}\)/);
});
