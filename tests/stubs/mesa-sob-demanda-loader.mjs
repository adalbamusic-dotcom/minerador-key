import * as runtime from "../integrations-runtime-loader.mjs";

/*
 * E2 · MARCA E SESSÃO CONTROLADAS PELO TESTE, SÓ PARA O PROVIDER DA MESA.
 *
 * O provider real lê `useBrand()` e `useSupabaseSession()`. Montar os
 * provedores reais exigiria sessão Supabase e `/api/marcas` — rede. Este
 * loader troca apenas esses dois imports, e apenas quando quem importa é
 * `components/editorial-pipeline-context.tsx`; todo o resto passa pelo loader
 * de runtime dos testes de DOM. Os valores vêm de `globalThis.__mesaSobDemanda`.
 */
const STUBS = {
  "./brand-context": "export function useBrand(){ return globalThis.__mesaSobDemanda.brand; }",
  "./auth/supabase-session-context": "export function useSupabaseSession(){ return globalThis.__mesaSobDemanda.session; }",
};

export function resolve(specifier, context, nextResolve) {
  const pai = context.parentURL || "";
  if (pai.endsWith("/components/editorial-pipeline-context.tsx") && Object.hasOwn(STUBS, specifier)) {
    return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
  }
  return runtime.resolve(specifier, context, nextResolve);
}

export const load = runtime.load;
