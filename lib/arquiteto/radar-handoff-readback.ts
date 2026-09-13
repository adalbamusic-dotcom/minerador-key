/**
 * O READBACK PRECISA LER O SERVIDOR.
 *
 * O smoke do handoff conferia `radarItems` — e `radarItems` acabava de ser
 * montado localmente, no mesmo clique, a partir do que o Arquiteto pretendia
 * enviar. Comparar a intenção com ela mesma passa sempre: o teste dizia
 * "confirmado" sem nunca ter perguntado nada ao servidor.
 *
 * Este módulo NÃO busca nada. Ele recebe o que o servidor devolveu e o que o
 * Arquiteto esperava, e diz se batem. A separação é o que torna a checagem
 * testável — e é o que impede que alguém volte a passar o estado local aqui
 * sem perceber: `remoteItems` só tem sentido vindo de uma leitura nova.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export type RadarReadbackExpectation = {
  articleId: string;
  brandId: string;
  articleDnaVersionId: string;
  contentHash: string;
  /** Ids das KeywordDNA que o ArticleDNA referencia. A ordem não importa. */
  keywordIds: readonly string[];
};

/** O item como o servidor devolveu. Campos ausentes são tratados como falha. */
export type RadarReadbackItem = {
  articleId: string;
  brandId?: string | null;
  articleDnaVersionId?: string | null;
  articleDnaContentHash?: string | null;
  arquitetoKeywordDnaReferences?: readonly { keywordId: string }[] | null;
};

export type RadarReadbackIssue = { articleId: string; reasons: string[] };

export type RadarReadbackVerdict = {
  /** `RADAR_HANDOFF_CONFIRMED = YES` só quando isto é verdadeiro. */
  ok: boolean;
  confirmed: string[];
  issues: RadarReadbackIssue[];
};

const ordenado = (values: readonly string[]) => [...values].sort();

export function verifyRadarHandoffReadback(input: {
  expectations: readonly RadarReadbackExpectation[];
  remoteItems: readonly RadarReadbackItem[];
}): RadarReadbackVerdict {
  const porArtigo = new Map(input.remoteItems.map(item => [item.articleId, item]));
  const confirmed: string[] = [];
  const issues: RadarReadbackIssue[] = [];

  for (const esperado of input.expectations) {
    const remoto = porArtigo.get(esperado.articleId);
    if (!remoto) {
      /*
       * Ausência é a falha que importa. Era exatamente ela que o readback
       * local não conseguia ver: o item estava na memória desta aba e em
       * lugar nenhum do servidor.
       */
      issues.push({
        articleId: esperado.articleId,
        reasons: ["O Radar não devolveu este artigo na leitura remota."],
      });
      continue;
    }

    const reasons: string[] = [];
    if (remoto.brandId && remoto.brandId !== esperado.brandId) {
      reasons.push("A Brand do item no Radar não é a Brand do envio.");
    }
    if (remoto.articleDnaVersionId !== esperado.articleDnaVersionId) {
      reasons.push("A versão do ArticleDNA no Radar não é a versão enviada.");
    }
    if (remoto.articleDnaContentHash !== esperado.contentHash) {
      reasons.push("O contentHash do ArticleDNA no Radar diverge do enviado.");
    }
    const refsRemotas = ordenado((remoto.arquitetoKeywordDnaReferences || []).map(reference => reference.keywordId));
    const refsEsperadas = ordenado(esperado.keywordIds);
    if (JSON.stringify(refsRemotas) !== JSON.stringify(refsEsperadas)) {
      reasons.push(`Refs de KeywordDNA divergentes: ${refsRemotas.length} no Radar, ${refsEsperadas.length} esperadas.`);
    }

    if (reasons.length) issues.push({ articleId: esperado.articleId, reasons });
    else confirmed.push(esperado.articleId);
  }

  return { ok: issues.length === 0 && confirmed.length === input.expectations.length, confirmed, issues };
}

/**
 * A frase do resultado.
 *
 * Falha de readback NÃO vira sucesso parcial: enquanto houver pendência, o que
 * a pessoa lê é a pendência, com o nome do artigo.
 */
export function describeRadarReadback(verdict: RadarReadbackVerdict): string {
  if (verdict.ok) {
    return `RADAR_HANDOFF_CONFIRMED = YES · ${verdict.confirmed.length} artigo(s) confirmados na leitura remota do Radar.`;
  }
  const detalhes = verdict.issues
    .map(issue => `${issue.articleId}: ${issue.reasons.join(" ")}`)
    .join(" · ");
  return `RADAR_HANDOFF_CONFIRMED = NO · ${verdict.confirmed.length} confirmado(s), ${verdict.issues.length} pendente(s). ${detalhes}`;
}
