import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * O QUE O NODE PRECISA SABER PARA DAR BOOT NO WORKER — e nada além disso.
 *
 * O entrypoint `scripts/local-worker.mts` roda no Node ESM de verdade, não no
 * bundler do Next. E o Node ESM cobra duas coisas que o bundler perdoa:
 *
 *   1. EXTENSÃO EXPLÍCITA. `from "../lib/server/local-worker/runner"` não
 *      resolve; era esse o `ERR_MODULE_NOT_FOUND` do smoke.
 *   2. O ALIAS `@/`, que é invenção do `tsconfig` e o Node desconhece.
 *
 * São 86 imports assim em 26 arquivos do grafo de boot — e esses arquivos são
 * os MESMOS que a aplicação Next usa. Reescrevê-los todos mexeria em módulos
 * compartilhados (autorização canônica, runtime de integrações) para resolver
 * um problema que é de EXECUÇÃO, não de código.
 *
 * ================ POR QUE NÃO O LOADER DOS TESTES =========================
 *
 * `tests/integrations-runtime-loader.mjs` resolve as duas coisas — e também
 * SUBSTITUI `next/headers`, `next/navigation` e o cliente Supabase do browser
 * por dublês inertes. Num teste isso é correto; num worker que grava no banco
 * de produção, seria trocar autenticação por fake em silêncio. A semelhança
 * entre os dois arquivos é superficial: este aqui não substitui nada.
 *
 * ESTE HOOK SÓ RESOLVE CAMINHO. Não transpila (o Node 22.18+ já remove os
 * tipos de `.ts`/`.mts` sozinho), não injeta módulo, não troca implementação.
 * Se um dia ele sumir, o worker para de dar boot — não passa a mentir.
 */

const raiz = path.resolve(fileURLToPath(import.meta.url), "../..");

/*
 * A ORDEM IMPORTA: `.ts` antes de `.js`.
 *
 * Um `lib/x.js` gerado por build ao lado de um `lib/x.ts` faria o worker rodar
 * código velho sem nenhum aviso. A fonte vence.
 */
const SUFIXOS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".json"];

function comExtensao(base) {
  if (/\.(ts|tsx|mts|js|mjs|cjs|json)$/.test(base) && existsSync(base)) return base;
  for (const sufixo of SUFIXOS) {
    const candidato = `${base}${sufixo}`;
    if (existsSync(candidato)) return candidato;
  }
  for (const sufixo of SUFIXOS) {
    const candidato = path.join(base, `index${sufixo}`);
    if (existsSync(candidato)) return candidato;
  }
  return null;
}

export function resolve(especificador, contexto, proximo) {
  /* `@/` é a raiz do projeto, exatamente como o `tsconfig` declara. */
  if (especificador.startsWith("@/")) {
    const achado = comExtensao(path.resolve(raiz, especificador.slice(2)));
    if (achado) return proximo(pathToFileURL(achado).href, contexto);
  }

  /* Relativo sem extensão: o alvo existe, só falta dizer o nome inteiro. */
  if (especificador.startsWith(".") && contexto.parentURL?.startsWith("file:")) {
    const pai = path.dirname(fileURLToPath(contexto.parentURL));
    const achado = comExtensao(path.resolve(pai, especificador));
    if (achado) return proximo(pathToFileURL(achado).href, contexto);
  }

  /*
   * Todo o resto — pacotes de `node_modules`, `node:*`, URLs — segue pelo
   * resolvedor padrão. Interceptar mais que o necessário é como um hook de
   * resolução vira um hook de substituição sem ninguém decidir isso.
   */
  return proximo(especificador, contexto);
}
