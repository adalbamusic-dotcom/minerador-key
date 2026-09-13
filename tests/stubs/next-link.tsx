import React from "react";

/**
 * `next/link`, REDUZIDO À ÂNCORA QUE ELE É.
 *
 * A barra superior global usa `Link`, e a planilha registra os controles dela
 * nessa barra — então renderizar o grid fora do Next exige resolver isto.
 *
 * POR QUE UM ARQUIVO E NÃO UM `data:` URL, como os outros stubs do loader: um
 * módulo `data:` não resolve especificador nu, e este precisa de `react`.
 * Tentar importar `react` de lá falha com `ERR_UNSUPPORTED_RESOLVE_REQUEST`.
 *
 * Devolve um `<a href>` de verdade: o markup continua conferível e nenhuma
 * navegação acontece, porque nenhum teste clica num link.
 */
export default function Link({ href, children, ...rest }: { href?: unknown; children?: React.ReactNode } & Record<string, unknown>) {
  return React.createElement("a", { href: typeof href === "string" ? href : "", ...rest }, children as React.ReactNode);
}
