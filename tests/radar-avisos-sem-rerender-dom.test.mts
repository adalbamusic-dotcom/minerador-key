import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * ====== 2026-10-08 · PUBLICAR UM AVISO NÃO RE-RENDERIZA QUEM SÓ PUBLICA ======
 *
 * O dono: "o selector e o scroll estão muito lentos". Medido na bancada do
 * scratchpad: `useNoticeBridge` lia o contexto INTEIRO do centro de avisos, e
 * cada aviso — inclusive o "Analisando páginas 5 de 6…" do próprio Radar —
 * re-renderizava a tela que publicou (~10 s com 25 artigos e 36 links por
 * página). Agora a ponte lê um contexto só com `publishNotice`, que só muda
 * com a rota.
 *
 * O centro de avisos é COMPARTILHADO (Marca, Minerador, Admin, Conta,
 * Publicações, Radar…). O que este teste prende para todos eles:
 *   · o componente que só usa a ponte não renderiza quando OUTRO aviso entra;
 *   · o centro continua recebendo tudo (o sino conta os avisos);
 *   · a deduplicação da ponte é a mesma: texto igual ao último não publica de
 *     novo; texto vazio zera a memória; texto que volta depois de outro publica.
 */

register("./stubs/radar-tela-hooks.mjs", import.meta.url, { data: { stubs: ["navegacao"] } });
(globalThis as Record<string, unknown>).__radarTela = { pathname: "/adalbapro--61d2e019-f44f-4fa3-af2f-d86b95628ab3/radar" };

const harness = await import("./radar-dom-harness.mts");
const React = harness.React;
const { SupabaseSessionProvider } = await import("../components/auth/supabase-session-context.tsx");
const { GlobalNoticeProvider, NotificationBell, useNoticeBridge, useNoticeCenter } = await import("../components/global-notice-center.tsx");

let rendersDoProdutor = 0;
let avisosNoCentro = 0;
let publicarDeFora: ((texto: string) => void) | null = null;
let trocarTextoDaPonte: ((texto: string) => void) | null = null;

/* Usa a ponte e nada mais — como o RadarPage, a Marca, o Admin. */
function Produtor() {
  useNoticeBridge({ notice: "", module: "radar", area: "Radar" });
  return null;
}
/* Uma ponte com texto controlado pelo teste, para provar a deduplicação. */
function Ponte() {
  const [texto, setTexto] = React.useState("");
  trocarTextoDaPonte = setTexto;
  useNoticeBridge({ notice: texto, module: "radar", area: "Radar" });
  return null;
}
/* Outro publicador, direto no centro. */
function Outro() {
  const { publishNotice } = useNoticeCenter();
  publicarDeFora = texto => { publishNotice({ severity: "INFO", title: "Radar", message: texto, source: "workflow", module: "radar", area: "Radar" }); };
  return null;
}
function Leitor() {
  avisosNoCentro = useNoticeCenter().notices.length;
  return null;
}

const tela = await harness.montarRadar();
await tela.render(harness.comProductShell(
  React.createElement(SupabaseSessionProvider, null,
    React.createElement(GlobalNoticeProvider, null,
      React.createElement(React.Profiler, { id: "produtor", onRender: () => { rendersDoProdutor += 1; } }, React.createElement(Produtor)),
      React.createElement(Ponte),
      React.createElement(Outro),
      React.createElement(Leitor),
      React.createElement(NotificationBell)))));

const act = (fazer: () => void) => React.act(async () => { fazer(); });

test("cinco avisos de outro publicador: o centro recebe os cinco, quem só usa a ponte não renderiza", async () => {
  const antes = rendersDoProdutor;
  for (let n = 1; n <= 5; n += 1) await act(() => publicarDeFora?.(`Analisando páginas ${n} de 6…`));
  assert.equal(avisosNoCentro, 5);
  assert.equal(rendersDoProdutor - antes, 0, "a ponte voltou a assinar o centro inteiro");
  const sino = tela.container.querySelector("[aria-label*='avisos não lidos']");
  assert.ok(sino, "o sino deixou de contar os avisos");
  assert.match(sino?.getAttribute("aria-label") || "", /\(5 avisos não lidos\)/);
});

test("a deduplicação da ponte é a de sempre", async () => {
  const inicio = avisosNoCentro;
  await act(() => trocarTextoDaPonte?.("17 selecionada(s) · 12 analisada(s)"));
  assert.equal(avisosNoCentro - inicio, 1, "texto novo publica");
  await act(() => trocarTextoDaPonte?.("17 selecionada(s) · 12 analisada(s)"));
  assert.equal(avisosNoCentro - inicio, 1, "o mesmo texto não publica de novo");
  await act(() => trocarTextoDaPonte?.("Finalizada sozinha."));
  assert.equal(avisosNoCentro - inicio, 2);
  await act(() => trocarTextoDaPonte?.("17 selecionada(s) · 12 analisada(s)"));
  assert.equal(avisosNoCentro - inicio, 3, "texto que volta depois de outro publica");
  await act(() => trocarTextoDaPonte?.(""));
  assert.equal(avisosNoCentro - inicio, 3, "texto vazio não publica");
  await act(() => trocarTextoDaPonte?.("17 selecionada(s) · 12 analisada(s)"));
  assert.equal(avisosNoCentro - inicio, 4, "depois do vazio, o mesmo texto publica de novo");
  tela.destroy();
});
