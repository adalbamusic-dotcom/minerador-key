/**
 * O ESTADO SEO DO ARTIGO, COMO PAINEL (pedido do dono, 2026-10-02).
 *
 * O Relatório deixa de pedir revisão: ele mostra. Cada verificação que o Radar
 * já faz vira um pilar das diretrizes do Google e das respostas de IA, com nota
 * 0–100. O que não se aplica ao artigo sai da conta, em vez de puxar a média.
 *
 * Domínio puro: lê as verificações de `buildRadarReportSummary`, não recalcula nada.
 */

export type RadarSeoCheckState = "READY" | "PARTIAL" | "PENDING" | "NOT_REQUIRED";

export type RadarSeoPillar = {
  id: string;
  label: string;
  /** A diretriz por trás do pilar, em linguagem de quem escreve. */
  guideline: string;
  percent: number | null;
  detail: string;
};

const PILARES: Record<string, { label: string; guideline: string }> = {
  research: { label: "Intenção e SERP", guideline: "Google: responder à intenção que a busca mostra (4 lentes)." },
  model: { label: "Cobertura semântica", guideline: "LSI e entidades: os conceitos que a concorrência trata, sem copiar." },
  discovery: { label: "Respostas claras", guideline: "BERT e respostas de IA: perguntas respondidas no início de cada seção." },
  sources: { label: "Fontes verificadas", guideline: "E-E-A-T e YMYL: afirmação factual com fonte conferida." },
  specialist: { label: "Experiência do especialista", guideline: "E-E-A-T: a voz de quem pratica, atribuída." },
  links: { label: "Links internos", guideline: "Arquitetura do Silo: Pilar, Suportes e SiloPage ligados." },
  videos: { label: "Multimídia", guideline: "Vídeo e imagem quando a SERP e o assunto pedem." },
  blueprint: { label: "Estrutura editorial", guideline: "Blocos sustentados pela amostra, na ordem do leitor." },
};

const NOTA: Record<RadarSeoCheckState, number | null> = { READY: 100, PARTIAL: 50, PENDING: 0, NOT_REQUIRED: null };

export function radarSeoGuidelineState(checks: ReadonlyArray<{ id: string; state: RadarSeoCheckState; detail: string }>, extra: {
  /**
   * Pareceres do especialista ACEITOS (evidência canônica). A verificação do
   * relatório só conta pontos de revisão; o parecer direto (fechamento, CTA,
   * diretriz) aceito é a voz de quem pratica e conta como E-E-A-T atendido.
   */
  specialistAccepted?: number;
} = {}): {
  pillars: RadarSeoPillar[];
  /** Média dos pilares que se aplicam; `null` sem nenhum. */
  overall: number | null;
} {
  const aceitos = extra.specialistAccepted || 0;
  const pillars = checks
    .filter(check => PILARES[check.id])
    .map(check => check.id === "specialist" && aceitos > 0
      ? { id: check.id, ...PILARES[check.id], percent: 100, detail: `${aceitos} parecer(es) do especialista aceito(s): a voz de quem pratica entra no artigo.` }
      : { id: check.id, ...PILARES[check.id], percent: NOTA[check.state], detail: check.detail });
  const aplicaveis = pillars.filter(pillar => pillar.percent !== null);
  const overall = aplicaveis.length ? Math.round(aplicaveis.reduce((soma, pillar) => soma + (pillar.percent || 0), 0) / aplicaveis.length) : null;
  return { pillars, overall };
}
