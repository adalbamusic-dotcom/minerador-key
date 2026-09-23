import * as runtime from "../integrations-runtime-loader.mjs";

/*
 * E1 · O REDATOR REAL, COM O PROVIDER REAL, SEM REDE.
 *
 * `ProfessionalWriter` e `EditorialPipelineProvider` leem marca e sessão, e o
 * Redator registra os controles na barra global. Montar os provedores reais
 * exigiria sessão Supabase e `/api/marcas`. Este loader troca só estes três
 * módulos — para QUALQUER importador — por leituras de
 * `globalThis.__redatorE1`; o resto passa pelo loader de runtime dos testes de
 * DOM (TypeScript, `@/`, `next/link`, `next/navigation`).
 */
const MARCA = "export function useBrand(){ return globalThis.__redatorE1.brand; }";
const SESSAO = "export function useSupabaseSession(){ return globalThis.__redatorE1.session; }";
const BARRA = "export function useGlobalTopbarControlsRegistration(){ return globalThis.__redatorE1.topbar; }";

const STUBS = {
  "@/components/brand-context": MARCA,
  "./brand-context": MARCA,
  "@/components/auth/supabase-session-context": SESSAO,
  "./auth/supabase-session-context": SESSAO,
  "@/components/global-topbar": BARRA,
};

export function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(STUBS, specifier)) {
    return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
  }
  return runtime.resolve(specifier, context, nextResolve);
}

export const load = runtime.load;
