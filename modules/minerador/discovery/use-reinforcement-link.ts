"use client";

import { useEffect, useRef } from "react";
import { createAuthenticatedBrowserClient } from "@/lib/supabase/browser-authenticated-client";
import { reinforcementSearchFields } from "./subject-search-model";

/**
 * "BUSCAR REFORÇO" VINDO DO ARQUITETO (D2.2) — só o id viaja na URL.
 *
 * Quando nenhuma keyword do lote trata do mesmo assunto que um artigo
 * publicado, o Arquiteto abre a Pesquisa por Assunto com
 * `?modo=assunto&reforco=<uuid>`. Aqui a página lê SÓ essa keyword, na marca
 * da rota, com colunas estreitas, e preenche o tema (a principal publicada), a
 * página de destino (a URL do artigo) e a nota. Nada é pesquisado sozinho: o
 * plano de custo continua sendo mostrado antes de qualquer chamada paga.
 */
export function useReinforcementLink(input: {
  brandId: string;
  keywordId: string | null;
  apply: (fields: { phrase: string; destinationUrl: string; note: string }) => void;
  onError: (message: string) => void;
}) {
  const aplicado = useRef<string | null>(null);
  const applyRef = useRef(input.apply);
  const errorRef = useRef(input.onError);
  useEffect(() => {
    applyRef.current = input.apply;
    errorRef.current = input.onError;
  });
  const { brandId, keywordId } = input;
  useEffect(() => {
    if (!keywordId || !brandId || aplicado.current === keywordId) return;
    let ativo = true;
    const ler = async () => {
      await Promise.resolve();
      try {
        const { data, error } = await createAuthenticatedBrowserClient()
          .from("minerador_keywords")
          .select("id,keyword,status,site_origin:analise_semantica->site_origin,primary_keyword_policy:analise_semantica->primary_keyword_policy")
          .eq("brand_id", brandId)
          .eq("id", keywordId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw error;
        if (!ativo) return;
        // Marcado só aqui: uma passada interrompida (desmontagem) lê de novo.
        aplicado.current = keywordId;
        const campos = reinforcementSearchFields(data as Parameters<typeof reinforcementSearchFields>[0]);
        if (!campos) {
          errorRef.current("O artigo do link não tem publicação declarada nesta marca. Escreva o tema e a página de destino.");
          return;
        }
        applyRef.current({ phrase: campos.phrase, destinationUrl: campos.destinationUrl, note: campos.note });
      } catch {
        if (ativo) errorRef.current("O artigo do link não pôde ser lido agora. Escreva o tema ou recarregue a página para tentar de novo.");
      }
    };
    void ler();
    return () => { ativo = false; };
  }, [brandId, keywordId]);
}
