import assert from "node:assert/strict";
import test from "node:test";

/*
 * 2026-10-18 · "DESFAZER SILO" PELO BOTÃO DE SEMPRE, NA TELA (DOM).
 *
 * Decisões do dono no mesmo dia: "Manter em duas etapas" (o Silo do plano consolidado sai pelo "Desfazer Silo", Pilar
 * incluído, e depois o Minerador exclui as keywords) e a que a amplia, literal: "tem que poder apagar sim não interessa
 * qual seja o estado … e alerta falando o que está apagando". AGENTS.md §0.3: o teste clica no botão que o humano usa.
 *
 *   aba Silos → linha do Silo (consolidado, do plano) → "Desfazer Silo" → o diálogo pede a PRÉVIA ao servidor (o PATCH
 *   de sempre, `mode: "preview"`) e mostra o que sai (artigos com o Pilar, o par, o grafo, o grupo, o alerta) → o botão
 *   de confirmar só habilita com o nome do Silo digitado → confirmar manda o MESMO PATCH com o `decisionHash` e o nome →
 *   a tela relê a mesa e só anuncia o que a releitura confirmou (território desfeito, nenhum artigo nem SiloDNA dele).
 *
 * Nenhuma rede real: o `fetch` é um roteiro em memória. Nada é pago.
 */

type Chamada = { url: string; method: string; body: Record<string, unknown> | null };
const chamadas: Chamada[] = [];
let roteiro: (chamada: Chamada) => { status: number; body: unknown } | null = () => null;
Object.defineProperty(globalThis, "fetch", {
  value: (url: string, init?: { method?: string; body?: string }) => {
    const chamada = { url, method: init?.method || "GET", body: init?.body ? JSON.parse(init.body) : null };
    chamadas.push(chamada);
    const resposta = roteiro(chamada);
    if (!resposta) return Promise.reject(new Error(`rede proibida: ${chamada.method} ${url}`));
    return Promise.resolve({ ok: resposta.status >= 200 && resposta.status < 300, status: resposta.status, json: async () => resposta.body });
  },
  writable: true, configurable: true,
});

const harness = await import("./radar-dom-harness.mts");
const React = harness.React;
const { TerritorialWorkspaceRows } = await import("../modules/arquiteto/territorial-workspace-rows.tsx");
const { SiloUndoDialog } = await import("../modules/arquiteto/silo-undo-dialog.tsx");
const { buildTerritorialLandscape } = await import("../lib/arquiteto/territorial-landscape.ts");
const { buildTerritorialSurface } = await import("../lib/arquiteto/territorial-surface.ts");
const { manualSiloCandidateDraft } = await import("../lib/arquiteto/silo-assignment.ts");
const { TerritoryCandidateSchema } = await import("../lib/arquiteto/territory.ts");
const { territoryUndoRefusals, territoryUndoWholeSiloReasons, territoryUndoWholeSiloSentence } = await import("../lib/arquiteto/territory-undo.ts");

const MARCA = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const AZUL = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const HASH = `sha256:${"a".repeat(64)}`;
const KEYWORDS = ["k1", "k2", "k3", "k4", "k5", "k6", "k7"].map(id => `aaaaaaaa-0000-4000-8000-0000000002${id.slice(1).padStart(2, "0")}`);

const consolidado = TerritoryCandidateSchema.parse({
  ...manualSiloCandidateDraft({ name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra-optica" }),
  territoryRef: AZUL, brandId: MARCA, lifecycleStatus: "consolidated", decisionState: "confirmed",
  consolidation: {
    siloId: AZUL,
    siloDnaVersionRef: { entityId: AZUL, versionId: "dna-v2", contentHash: HASH, versionNumber: 2 },
    siloPageVersionRef: { entityId: `silo-page:${AZUL}`, versionId: "page-v2", contentHash: HASH, versionNumber: 2 },
    consolidatedAt: "2026-10-17T12:00:00.000Z",
  },
});
const desfeito = TerritoryCandidateSchema.parse({ ...consolidado, lifecycleStatus: "rejected", decisionState: "rejected", consolidation: null });
const remoto = (territory: unknown, lockVersion: number) => ({ workflowItemId: "cccccccc-0000-4000-8000-000000000001", territoryRef: AZUL, lockVersion, state: (territory as { lifecycleStatus: string }).lifecycleStatus, territory });

const LINHAS = [
  "Artigos: 7 saem do Silo (Pilar incluído) — a versão vigente de cada ArticleDNA recebe o status “rejeitado”, com o motivo; nenhuma versão é apagada.",
  "Pilar · “diferença entre internet e wi-fi” v2",
  "SiloDNA v2 e SiloPage v2: deixam de valer (status “rejeitado”); as versões ficam como histórico.",
  "Grafo de links internos v1 (aprovado): deixa de valer junto com o par em que foi feito; nada é regravado.",
  "Território “Wi-Fi e fibra óptica”: vira desfeito (rejeitado), com o motivo, o ator e a hora; 7 keyword(s) voltam para “sem Silo” e continuam na mesa.",
  "Grupo Azul (Wi-Fi e fibra óptica): desligado deste Silo, e os artigos retirados perdem a etiqueta da cor. O plano do cadastro continua no Minerador (“Recriar o Silo do plano” traz o Silo de volta).",
  "Adiante: “fibra óptica” está no Radar — o item sai da operação (“retirado”); a investigação e o documento ficam como histórico.",
  "Custo: nenhum (nada é pago).",
];
const ARTIGOS = ["pilar", "s1", "s2", "s3", "s4", "s5", "s6"].map((id, indice) => ({ articleId: `art-${id}`, versionId: `v2-${id}`, versionNumber: 2, label: indice === 0 ? "diferença entre internet e wi-fi" : `suporte ${indice}`, role: indice === 0 ? "Pilar" : "Suporte", published: false, downstreamStages: id === "s3" ? ["radar"] : [] }));
const PREVIA = {
  success: true,
  data: {
    persistence: "NOT_PERSISTED", source: "CANONICAL_REMOTE",
    territoryUndoPreviews: [{
      territoryRef: AZUL, scope: "whole_silo", label: "Wi-Fi e fibra óptica", memberCount: 7,
      wholeSilo: {
        reasons: ["consolidated", "declared_plan", "silo_pair", "approved_articles", "downstream"], siloName: "Wi-Fi e fibra óptica", confirmationName: "Wi-Fi e fibra óptica",
        decisionHash: "f".repeat(64), lines: LINHAS, notices: [LINHAS[6]], memberCount: 7,
        articles: ARTIGOS,
        pair: [{ kind: "silo_dna", versionId: "dna-v2", versionNumber: 2, siloId: AZUL }, { kind: "silo_page", versionId: "page-v2", versionNumber: 2, siloId: AZUL }],
        linkGraphs: [{ graphVersionId: "g-1", versionNumber: 1, siloId: AZUL }],
        group: { groupId: "07fec332-4b0a-43cb-af19-cedfd9b24897", groupLabel: "Azul (Wi-Fi e fibra óptica)", siloId: AZUL },
      },
    }],
  },
};
const snapshotRelido = {
  success: true,
  data: {
    source: "CANONICAL_REMOTE", workflowItems: [], importEligibility: [], keywords: [], availableKeywords: [],
    articleDnas: [], siloDnas: [], siloPages: [], aiReviews: [], statuses: [], brandSiloCatalog: [],
    territories: [remoto(desfeito, 8)], siloWorkingCopies: [], territorialSerp: [], articleFormationSerp: [], territorialAi: [],
    architectureMarker: null, articleFormationMarker: null,
  },
};

function cenario() {
  chamadas.length = 0;
  roteiro = chamada => {
    if (chamada.method === "PATCH" && chamada.url === "/api/arquiteto/workspace") {
      const undo = (chamada.body!.territoryUndos as Array<Record<string, unknown>>)[0];
      if (undo.mode === "preview") return { status: 200, body: PREVIA };
      return { status: 200, body: { success: true, data: { persistence: "PERSISTED", source: "CANONICAL_REMOTE", items: [], territories: [remoto(desfeito, 8)], siloWorkingCopies: [], territoryUndoResults: [{ territoryRef: AZUL, scope: "whole_silo" }] } } };
    }
    if (chamada.method === "GET" && chamada.url.startsWith(`/api/arquiteto/workspace?brandId=${MARCA}`)) return { status: 200, body: snapshotRelido };
    return null;
  };
}

/** A aba Silos com o Silo do azul e o "Desfazer Silo" de sempre, e o diálogo de sempre — a mesma fiação da mesa. */
function AbaSilos({ aoTerminar }: { aoTerminar: (resultado: { tone: string; message: string }) => void }) {
  const [prompt, setPrompt] = React.useState<string[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const membros = KEYWORDS.map(keywordId => ({ keywordId, label: keywordId, isPublished: false }));
  const entrada = { territory: consolidado, members: membros, approvedArticles: [], siloArtifacts: [], declaredPlan: { groupLabel: "Azul (Wi-Fi e fibra óptica)", siloName: "Wi-Fi e fibra óptica" } };
  const inteiro = territoryUndoWholeSiloReasons(entrada);
  const readings = new Map([[AZUL, { label: "Wi-Fi e fibra óptica", keywordCount: membros.length, refusals: territoryUndoRefusals(entrada).map(item => item.message), declaredPlan: entrada.declaredPlan, wholeSilo: inteiro.length ? territoryUndoWholeSiloSentence(inteiro) : null }]]);
  const landscape = buildTerritorialLandscape({
    brandId: MARCA,
    keywords: KEYWORDS.map(id => ({ id, brand_id: MARCA, keyword: id, intent: "informacional", analise_semantica: {} })),
    territories: [consolidado],
    assignments: KEYWORDS.map(keywordId => ({ keywordId, brandId: MARCA, territoryRef: AZUL, state: "existing_silo_match", reason: "Plano.", source: "human", decidedAt: "2026-10-17T12:00:00.000Z" })) as never,
  });
  const surface = buildTerritorialSurface({ landscape, logic: null });
  return React.createElement(React.Fragment, null,
    React.createElement("table", null, React.createElement("tbody", null, React.createElement(TerritorialWorkspaceRows, {
      surface,
      keywordLabelFor: (id: string) => id,
      undoControls: { byRef: readings, eligibleCount: 0, busy, excludedNote: null, onUndo: (ref: string) => setPrompt([ref]), onUndoAll: () => undefined },
    }))),
    prompt ? React.createElement(SiloUndoDialog, {
      brandId: MARCA,
      refs: prompt,
      bulk: false,
      readings,
      excludedNote: null,
      lockOf: () => 7,
      expectedMembersOf: () => KEYWORDS,
      busy,
      onBusyChange: setBusy,
      onClose: () => setPrompt(null),
      onDone: aoTerminar,
      classes: { cancel: "cancelar", confirm: "confirmar" },
    }) : null,
  );
}

const esperar = () => React.act(async () => { for (let i = 0; i < 8; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); });

test("Desfazer Silo · o Silo consolidado do plano: o botão de sempre → a prévia do servidor (o que sai, o alerta) → o nome digitado → o PATCH com a prévia → a releitura confirma", async () => {
  cenario();
  const resultados: Array<{ tone: string; message: string }> = [];
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(AbaSilos, { aoTerminar: resultado => resultados.push(resultado) }));
  const botao = tela.get("architect-undo-silo");
  assert.equal(botao.textContent?.trim(), "Desfazer Silo", "o MESMO botão");
  assert.match(botao.getAttribute("title") || "", /sai inteiro \(artigos, Pilar incluído\)/);
  await tela.click(botao);
  await esperar();
  // A prévia: o PATCH de sempre, só leitura.
  const previa = chamadas.find(chamada => chamada.method === "PATCH");
  assert.deepEqual(previa?.body, { brandId: MARCA, territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, mode: "preview" }] });
  const dialogo = tela.get("architect-undo-silo-dialog");
  assert.match(dialogo.textContent || "", /Desfazer o Silo inteiro · Wi-Fi e fibra óptica/);
  const lista = tela.get("architect-undo-silo-preview").textContent || "";
  for (const linha of LINHAS) assert.ok(lista.includes(linha), `a prévia mostra: ${linha}`);
  const confirmar = () => tela.get("architect-undo-silo-confirm") as HTMLButtonElement;
  assert.equal(confirmar().disabled, true, "sem o nome digitado, não confirma");
  await tela.type(tela.get("architect-undo-silo-typed"), "Wi-Fi");
  assert.equal(confirmar().disabled, true, "nome incompleto não vale");
  await tela.type(tela.get("architect-undo-silo-typed"), "  wi-fi e fibra óptica ");
  assert.equal(confirmar().disabled, false, "a regra da plataforma: sem caixa e sem espaços nas pontas");
  assert.equal(chamadas.filter(chamada => chamada.method === "PATCH").length, 1, "nada gravado antes de confirmar");
  await tela.click(confirmar());
  await esperar();
  const gravar = chamadas.filter(chamada => chamada.method === "PATCH")[1];
  assert.deepEqual(gravar?.body, { brandId: MARCA, territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, decisionHash: "f".repeat(64), typedName: "  wi-fi e fibra óptica " }] }, "o MESMO PATCH, com a prévia e o nome");
  assert.ok(chamadas.some(chamada => chamada.method === "GET" && chamada.url.startsWith(`/api/arquiteto/workspace?brandId=${MARCA}`)), "a tela relê a mesa");
  assert.equal(resultados.length, 1);
  assert.equal(resultados[0].tone, "success");
  assert.match(resultados[0].message, /Silo\(s\) desfeito\(s\) e conferido\(s\) na releitura: Wi-Fi e fibra óptica \(Silo inteiro: 7 artigo\(s\), o par e 7 keyword\(s\) em sem Silo\)\. Nada foi apagado\./);
  assert.equal(tela.query("architect-undo-silo-dialog"), null, "o diálogo fecha depois da releitura");
  tela.destroy();
});

test("Desfazer Silo · a releitura que ainda mostra um artigo do Silo não vira sucesso", async () => {
  cenario();
  const comArtigo = structuredClone(snapshotRelido);
  (comArtigo.data as { articleDnas: unknown[] }).articleDnas = [];
  const roteiroBase = roteiro;
  roteiro = chamada => {
    if (chamada.method === "GET") return { status: 200, body: { ...comArtigo, data: { ...comArtigo.data, territories: [remoto(consolidado, 7)] } } };
    return roteiroBase(chamada);
  };
  const resultados: Array<{ tone: string; message: string }> = [];
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(AbaSilos, { aoTerminar: resultado => resultados.push(resultado) }));
  await tela.click(tela.get("architect-undo-silo"));
  await esperar();
  await tela.type(tela.get("architect-undo-silo-typed"), "Wi-Fi e fibra óptica");
  await tela.click(tela.get("architect-undo-silo-confirm"));
  await esperar();
  assert.equal(resultados.length, 1);
  assert.notEqual(resultados[0].tone, "success", "o território não voltou desfeito: não é sucesso");
  assert.match(resultados[0].message, /Wi-Fi e fibra óptica: as keywords já saíram do Silo; falta marcar o Silo como desfeito\. Tente de novo\./);
  tela.destroy();
});
