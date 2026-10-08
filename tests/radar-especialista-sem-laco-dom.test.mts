import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, React } from "./radar-dom-harness.mts";
import { RadarExpertBriefPanel } from "../modules/radar/radar-expert-brief-panel.tsx";
import { radarArticleDataUpdate } from "../lib/radar/expert-evidence-change.ts";
import type { RadarFrozenSpecialistRequirement } from "../lib/radar/specialist-lifecycle.ts";

/*
 * ====== 2026-10-08 · O LAÇO DO ESPECIALISTA, COM O PAINEL REAL E O AGENDADOR REAL ======
 *
 * Fora do `act`: o laço só aparece com o agendador do React rodando sozinho,
 * como no navegador — dentro do `act` ele assentaria (ou travaria) antes de o
 * teste olhar. O Pai faz o que o RadarPage fazia: entrega `requirements` como
 * array NOVO a cada render, com o mesmo conteúdo, e grava o aviso do painel
 * num mapa por artigo.
 *
 *   · com o redutor de bail-out (`radarArticleDataUpdate`): o Pai renderiza a
 *     montagem e o primeiro aviso, e para;
 *   · sem ele (o `{ ...current, [id]: x }` de antes): o contador dispara — é a
 *     prova de que este teste enxerga o laço que o dono sentiu.
 *
 * Sem rede: `context` nulo mantém a leitura remota desligada, e o `fetch`
 * global recusa qualquer tentativa. PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => { tentativasDeRede.push(String(entrada)); return Promise.reject(new Error("REDE PROIBIDA")); },
  writable: true, configurable: true,
});

const PONTO: RadarFrozenSpecialistRequirement = {
  requirementId: "req-1", claimId: "claim-1", kind: "YMYL_CLAIM", priority: "HIGH",
  specificQuestion: "A afirmação sobre o CFO continua valendo em 2026?", topic: "publicidade odontológica",
};

type Contagem = { renders: number; avisos: number; mapas: Set<unknown> };

function Pai({ comBailOut, contagem }: { comBailOut: boolean; contagem: Contagem }) {
  const [mapa, setMapa] = React.useState<Record<string, unknown>>({});
  contagem.renders += 1;
  React.useEffect(() => { contagem.mapas.add(mapa); });
  /* Array novo a cada render, conteúdo idêntico — o que a view refeita entregava. */
  const requirements = [{ ...PONTO }];
  const aoMudar = React.useCallback((articleId: string, _evidence: unknown, summary: unknown) => {
    contagem.avisos += 1;
    setMapa(current => comBailOut ? radarArticleDataUpdate(current, articleId, summary) : { ...current, [articleId]: summary });
  }, [comBailOut, contagem]);
  return React.createElement(RadarExpertBriefPanel, {
    brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v1",
    articleTitle: "Marketing digital para dentistas", articleVersion: "v1", articleRole: "Suporte",
    context: null, requirements, onExpertEvidenceChange: aoMudar,
  });
}

async function observar(comBailOut: boolean, janelaMs: number): Promise<Contagem> {
  const { createRoot } = await import("react-dom/client");
  const global = globalThis as unknown as { document: Document; IS_REACT_ACT_ENVIRONMENT: boolean };
  const anterior = global.IS_REACT_ACT_ENVIRONMENT;
  global.IS_REACT_ACT_ENVIRONMENT = false;
  const errosOriginais = console.error;
  /* Sem o bail-out, o React avisa "Maximum update depth" no console: é o próprio laço. */
  console.error = () => undefined;
  const container = global.document.createElement("div");
  global.document.body.appendChild(container);
  const root = createRoot(container);
  const contagem: Contagem = { renders: 0, avisos: 0, mapas: new Set() };
  try {
    root.render(comProductShell(React.createElement(Pai, { comBailOut, contagem })));
    await new Promise(resolve => setTimeout(resolve, janelaMs));
    return { ...contagem };
  } finally {
    root.unmount();
    container.remove();
    console.error = errosOriginais;
    global.IS_REACT_ACT_ENVIRONMENT = anterior;
  }
}

test("com o bail-out, a área aberta assenta: no máximo 3 renders do Pai em 1 s e 1 estado efetivo", async () => {
  const contagem = await observar(true, 1000);
  assert.ok(contagem.renders <= 3, `o Pai renderizou ${contagem.renders} vezes em 1 s — o laço voltou`);
  assert.ok(contagem.avisos >= 1, "o painel deixou de avisar quem o hospeda");
  /* O mapa inicial ({}) e o do primeiro aviso — nenhum outro. */
  assert.ok(contagem.mapas.size <= 2, `o aviso repetido virou ${contagem.mapas.size - 1} estado(s) novo(s)`);
});

test("controle: sem o bail-out o mesmo Pai entra no laço (o teste enxerga o defeito)", async () => {
  const contagem = await observar(false, 400);
  assert.ok(contagem.renders >= 10, `esperava o laço do defeito, vieram ${contagem.renders} renders`);
});

test("nenhuma rede foi tocada", () => {
  assert.deepEqual(tentativasDeRede, []);
});
