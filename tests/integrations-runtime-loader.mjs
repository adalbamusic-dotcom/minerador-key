import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ts from "typescript";

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export default undefined;", shortCircuit: true };
  if (specifier === "next/headers") return { url: "data:text/javascript,export async function cookies(){ return { getAll(){ return []; }, get(){ return undefined; }, set(){} }; }", shortCircuit: true };
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
