"use client";

import { useEffect } from "react";
import { radarFormatFilterIsLegacyRole } from "@/lib/radar/silo-role";

/*
 * 2026-10-08 (revisão) · O FILTRO "FORMATO" GUARDADO COM UM PAPEL É DE ANTES.
 *
 * A coluna Formato da planilha trocou o papel copiado na importação
 * ("Suporte", "Pilar") pela unidade ("Artigo", "SiloPage"). A última vista da
 * planilha volta do navegador com o filtro antigo, que escondia TODAS as
 * linhas enquanto o seletor dizia "Formato: Todos" (nenhuma opção casava).
 * Papel nunca é valor desta coluna: o filtro é descartado. Nada além do filtro
 * muda; a vista guardada se regrava sozinha com o filtro limpo.
 *
 * Arquivo próprio: os testes estruturais de `radar-page.tsx` leem os hooks e
 * os efeitos do componente principal pela posição e pela indentação.
 */
export function RadarFormatoFiltroLegado({ valor, limpar }: { valor: string | undefined; limpar: () => void }) {
  useEffect(() => {
    if (radarFormatFilterIsLegacyRole(valor)) limpar();
  }, [valor, limpar]);
  return null;
}
