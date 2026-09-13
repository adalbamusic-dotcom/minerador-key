import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ts from "typescript";

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export default undefined;", shortCircuit: true };
  if (specifier === "next/headers") return { url: "data:text/javascript,export async function cookies(){ return { getAll(){ return []; }, get(){ return undefined; }, set(){} }; }", shortCircuit: true };
  /*
   * Navegação do App Router, para renderizar componente de tela fora do browser.
   *
   * Um teste que só varre string não prova que o botão certo aparece no estado
   * certo. Para renderizar de verdade é preciso resolver `next/navigation`, que
   * não existe como módulo isolado — e nenhum teste navega: os stubs devolvem
   * no-ops observáveis, nunca uma rota real.
   */
  if (specifier === "next/navigation") {
    return {
      url: "data:text/javascript,export function useRouter(){ return { push(){}, replace(){}, back(){}, refresh(){}, prefetch(){} }; } export function usePathname(){ return \"/\"; } export function useSearchParams(){ return new URLSearchParams(); } export function useParams(){ return {}; } export function notFound(){ throw new Error(\"NEXT_NOT_FOUND\"); } export function redirect(){ throw new Error(\"NEXT_REDIRECT\"); }",
      shortCircuit: true,
    };
  }
  /* `next/link` precisa de `react`, e módulo `data:` não resolve especificador nu. */
  if (specifier === "next/link") {
    return resolveFile(path.resolve(process.cwd(), "tests/stubs/next-link.tsx"), context, nextResolve);
  }
  /*
   * Cliente Supabase do browser, inerte.
   *
   * A área Especialista do Radar usa o centro de avisos, que por sua vez lê a
   * sessão — e o provedor de sessão constrói o cliente do browser ao montar.
   * Construí-lo aqui exigiria configuração pública e faria chamada real, que é
   * exatamente o que um teste de despacho não pode fazer. O stub devolve um
   * cliente que responde sem sessão e sem rede: o provedor monta de verdade, e
   * nenhum provider externo é tocado.
   */
  if (specifier === "@/lib/supabase/browser-client" || specifier.endsWith("/lib/supabase/browser-client")) {
    return {
      url: "data:text/javascript,export function getBrowserSupabaseClient(){ return { auth: { async getSession(){ return { data: { session: null } }; }, onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; }, async signOut(){} } }; }",
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const base = path.resolve(process.cwd(), specifier.slice(2));
    return resolveFile(base, context, nextResolve);
  }
  if (specifier.startsWith(".")) {
    const parentFile = context.parentURL && context.parentURL.startsWith("file:") ? fileURLToPath(context.parentURL) : process.cwd();
    const parent = parentFile.endsWith(path.sep) ? parentFile : path.dirname(parentFile);
    return resolveFile(path.resolve(parent, specifier), context, nextResolve);
  }
  return nextResolve(specifier, context);
}

function resolveFile(base, context, nextResolve) {
    for (const suffix of ["", ".ts", ".tsx", ".mts", ".js"]) {
      const candidate = `${base}${suffix}`;
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  return nextResolve(pathToFileURL(base).href, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && /\.(?:ts|tsx|mts)$/.test(url)) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: fileURLToPath(url),
    });
    return { format: "module", source: output.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
