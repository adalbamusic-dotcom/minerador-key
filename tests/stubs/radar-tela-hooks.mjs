/*
 * 2026-10-08 · A TELA DO RADAR MONTADA INTEIRA NO TESTE — SEM REDE, SEM MARCA REAL.
 *
 * Registrado pelo próprio teste com `module.register(…, { data: { stubs } })`,
 * por cima do loader de runtime que `npm run test:radar` já usa. Por isso vale
 * só para o processo daquele arquivo de teste, e só para o que é importado
 * DEPOIS do registro (o teste importa a tela com `await import`).
 *
 * Stubs, escolhidos por quem registra:
 *   · "navegacao" — `next/navigation` com `usePathname()` lido de
 *     `globalThis.__radarTela.pathname` (o centro de avisos tira o escopo da rota);
 *   · "mesa" — marca, sessão e mesa editorial lidas de `globalThis.__radarTela`
 *     (`brand`, `session`, `store` + `React`), como a bancada do scratchpad;
 *   · "contagem" — cada chamada de `buildRadarDeepResearchView` soma em
 *     `globalThis.__radarTela.contagem.views`. É só um contador em volta da
 *     função real: o resultado não muda.
 *
 * Os módulos `data:` rodam na thread principal; por isso leem `globalThis` na
 * hora da chamada, nunca na resolução (que roda na thread dos hooks).
 */
import { fileURLToPath } from "node:url";

let stubs = new Set();

export function initialize(data) {
  stubs = new Set((data && data.stubs) || []);
}

const NAVEGACAO = "export function useRouter(){ return { push(){}, replace(){}, back(){}, refresh(){}, prefetch(){} }; } export function usePathname(){ const t = globalThis.__radarTela; return (t && t.pathname) || \"/\"; } export function useSearchParams(){ return new URLSearchParams(); } export function useParams(){ return {}; } export function notFound(){ throw new Error(\"NEXT_NOT_FOUND\"); } export function redirect(){ throw new Error(\"NEXT_REDIRECT\"); }";

const MESA = {
  "/components/brand-context.tsx": "export function useBrand(){ return globalThis.__radarTela.brand; } export function BrandProvider(p){ return p.children; }",
  "/components/auth/supabase-session-context.tsx": "export function useSupabaseSession(){ return globalThis.__radarTela.session; } export function SupabaseSessionProvider(p){ return p.children; }",
  "/components/editorial-pipeline-context.tsx": "export function useEditorialPipeline(){ const t = globalThis.__radarTela; return t.React.useSyncExternalStore(t.store.subscribe, t.store.get, t.store.get); } export function EditorialPipelineProvider(p){ return p.children; }",
};

const dado = codigo => ({ url: `data:text/javascript,${encodeURIComponent(codigo)}`, shortCircuit: true });

export async function resolve(specifier, context, nextResolve) {
  if (stubs.has("navegacao") && specifier === "next/navigation") return dado(NAVEGACAO);
  const resolvido = await nextResolve(specifier, context);
  if (stubs.has("mesa") && resolvido && typeof resolvido.url === "string" && resolvido.url.startsWith("file:")) {
    const arquivo = fileURLToPath(resolvido.url).replace(/\\/g, "/");
    for (const [sufixo, codigo] of Object.entries(MESA)) {
      if (arquivo.endsWith(sufixo)) return dado(codigo);
    }
  }
  return resolvido;
}

export async function load(url, context, nextLoad) {
  const carregado = await nextLoad(url, context);
  if (!stubs.has("contagem") || !url.startsWith("file:") || !url.endsWith("/lib/radar/deep-research-view.ts")) return carregado;
  const fonte = String(carregado.source);
  const declaracao = "export function buildRadarDeepResearchView(";
  if (fonte.split(declaracao).length !== 2) throw new Error("radar-tela-hooks: a declaração de buildRadarDeepResearchView mudou");
  const instrumentado = fonte.replace(declaracao, "function buildRadarDeepResearchView__real(")
    + "\nexport function buildRadarDeepResearchView(...entrada) { const t = globalThis.__radarTela; if (t && t.contagem) t.contagem.views += 1; return buildRadarDeepResearchView__real(...entrada); }\n";
  return { ...carregado, source: instrumentado };
}
