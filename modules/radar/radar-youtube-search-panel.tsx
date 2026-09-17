"use client";

import {
  RADAR_YOUTUBE_SIGNAL_LABELS,
  RADAR_YOUTUBE_UNIVERSE_LABELS,
  radarYoutubeCompetitiveSignal,
  radarYoutubeFormatCohorts,
  type RadarYoutubeUniverseEntry,
} from "@/lib/radar/youtube-search-model";
import { radarYoutubeRunSummary, type RadarYoutubeSearchRun } from "@/lib/radar/youtube-search-run";
import type { RadarYoutubeBlueprint, RadarYoutubeCohort } from "@/lib/radar/youtube-blueprint";
import type { RadarYoutubeFrozenInvestigation } from "@/lib/radar/youtube-evidence";
import { RADAR_EDITORIAL_OUTPUT_LABELS, type RadarMultimodalBlueprint } from "@/lib/radar/multimodal-blueprint";
import { radarResearchSourceLabel } from "@/lib/radar/search-mode";
import { RADAR_RESEARCH_PACKAGE_STATE_LABELS, RADAR_RESEARCH_SOURCE_ROLE_LABELS, radarResearchProfilePlan, type RadarResearchPackage } from "@/lib/radar/research-profile";
import type { RadarResearchProfileProjection } from "@/lib/radar/research-profile-state";
import type { RadarCompetitiveBlueprintView } from "@/lib/radar/competitive-blueprint-view";
import type { RadarResearchProvenancePayload } from "@/lib/radar/research-read-model";
import { RadarCompetitiveBlueprintSection } from "./radar-competitive-blueprint";
import { RadarProfileBlueprintSection } from "./radar-profile-blueprint";
import type { RadarEditorialProfileModel } from "@/lib/radar/editorial-profile-model";

/** Os rótulos das peças, em português — a tela não mostra o enum. */
const RADAR_PIECE_LABELS: Record<RadarMultimodalBlueprint["recommended"]["pieces"][number]["piece"], string> = {
  ARTIGO: "Artigo", VIDEO_HERO: "Vídeo principal", SHORT: "Short",
  SECAO_COMERCIAL: "Seção comercial", IMAGEM: "Apoio visual",
};

/**
 * PESQUISA → YOUTUBE — YOUTUBE_SEARCH_1 · §2, §8 e §9; 1.1 · §4, §7 e §9.
 *
 * ========================= ISTO NÃO É A ÁREA VÍDEOS =========================
 *
 * A área Vídeos é a biblioteca DELIBERADA da marca. Aqui é a SERP do YouTube: o
 * que compete pela intenção, escolhido pelo algoritmo e não por nós. As duas
 * respondem perguntas opostas, e é por isso que esta tela não oferece
 * "registrar fonte" nem "extrair texto": curar concorrente não é adotá-lo.
 *
 * ================== LONG-FORM E SHORTS SÃO DUAS LISTAS ==================
 *
 * Não é preferência visual: é o §4. Uma lista só faria a pessoa comparar um
 * tutorial de 19 minutos com um Short de 15 segundos como se disputassem a
 * mesma coisa — e a média de qualquer métrica entre os dois não descreveria
 * nenhum dos dois.
 *
 * ===================== O QUE ESTE GATE MOSTRA, E SÓ ELE =====================
 *
 * START, o universo e a curadoria. Transcript de concorrente, hook e roteiro
 * são o YOUTUBE_SEARCH_2 — e não há botão para eles aqui, porque um botão
 * desabilitado esperando o próximo gate é um convite a clicá-lo.
 */

export type RadarYoutubeSearchPanelProps = {
  run: RadarYoutubeSearchRun | null;
  /** Quantas consultas o plano produziria. Mostrado ANTES de gastar. */
  plannedQueries: number;
  busy: boolean;
  /** Por que não dá para começar agora. `null` quando dá. */
  blockedReason: string | null;
  /** §12 · a investigação congelada, quando já houve FINALIZE. */
  frozen: RadarYoutubeFrozenInvestigation | null;
  /**
   * §6 · O PACOTE — uma investigação, não uma lista de fontes.
   *
   * A principal e o apoio viajam juntos porque foram um START só. Separá-los
   * em props independentes reabriria na tela a ideia de dois fluxos, que é
   * exatamente o que este gate fechou.
   */
  pacote: RadarResearchPackage;
  /**
   * §3 · O ESTADO CANÔNICO — a mesma autoridade que o card e a tabela leem.
   *
   * O painel não deriva estado por conta própria: quatro derivações foi
   * exatamente o que fez a tela dizer "não iniciada" e "finalizada" ao mesmo
   * tempo sobre a mesma investigação.
   */
  projecao: RadarResearchProfileProjection;
  /**
   * §7 e §19 · O BLUEPRINT CANÔNICO, montado pela autoridade única.
   *
   * O painel não interpreta o dado: quatro componentes React montando a mesma
   * leitura foi o defeito que o 1.1 fechou, com um dado mais barato.
   */
  blueprintView: RadarCompetitiveBlueprintView;
  /** PROFILES_2 · o roteiro-modelo. A superfície principal do perfil. */
  editorialModel?: RadarEditorialProfileModel | null;
  /** 2.1 · §25 · os painéis de consulta legados, absorvidos pela evidência. */
  evidenceExtras?: React.ReactNode;
  /** §11 · o blueprint multiformato vivo, quando as coletas o sustentam. */
  multimodal: RadarMultimodalBlueprint | null;
  /** §7 · retry que alcança SÓ o apoio. A principal já foi paga. */
  onRetrySupport?: () => void;
  onStart?: () => void;
  onToggleVideo?: (videoId: string) => void;
  onFinalize?: () => void;
  onReset?: () => void;
  /**
   * ============ 2.2 · §1 · O QUE CHEGA SOB DEMANDA ============
   *
   * Depois do freeze a corrida sai da cópia de leitura — 2.1 compactou o
   * transporte —, e sem esta fiação a amostra ficava VAZIA: o disclosure
   * abria sobre um `run` que não veio.
   *
   * As props têm a mesma forma das da Amazon de propósito: é a mesma
   * autoridade genérica atrás delas, e duas formas para a mesma leitura
   * divergiriam na primeira correção feita só num painel.
   */
  sampleSummary?: { count: number; available: boolean; unit: string };
  provenanceSummary?: { available: boolean };
  lazySample?: { state: "IDLE" | "LOADING" | "READY" | "FAILED"; run: RadarYoutubeSearchRun | null; message: string | null };
  lazyProvenance?: { state: "IDLE" | "LOADING" | "READY" | "FAILED"; data: RadarResearchProvenancePayload | null; message: string | null };
  onLoadSample?: () => void;
  onLoadProvenance?: () => void;
};

const bloco = "rounded-md border border-divider bg-surface p-3";
const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";
const primary = `${button} border-context-accent bg-selected`;

const TOM_DO_SINAL = { FORTE: "text-positive", MEDIO: "text-pending", OBSERVAR: "text-text-muted" } as const;

const duracaoLegivel = (segundos: number | null, rotulo: string | null) => {
  /* O rótulo do provider ganha: é como o YouTube escreve, e a pessoa reconhece. */
  if (rotulo) return rotulo;
  if (segundos === null) return "duração não informada";
  const total = Math.max(0, Math.round(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  return horas
    ? `${horas}:${String(minutos).padStart(2, "0")}:${String(resto).padStart(2, "0")}`
    : `${minutos}:${String(resto).padStart(2, "0")}`;
};

const dataLegivel = (valor: string | null) => {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toLocaleDateString("pt-BR");
};

const visualizacoesLegiveis = (views: number | null) =>
  views === null ? null : `${views.toLocaleString("pt-BR")} visualização(ões)`;

function VideoCard({ video, selecionado, busy, textoDaConsulta, totalQueries, collectedAt, onToggleVideo }: {
  video: RadarYoutubeUniverseEntry;
  selecionado: boolean;
  busy: boolean;
  textoDaConsulta: Map<string, string>;
  totalQueries: number;
  collectedAt: string | null;
  onToggleVideo?: (videoId: string) => void;
}) {
  const sinal = radarYoutubeCompetitiveSignal({ entry: video, totalQueries, collectedAt });
  const consultas = video.queriesFoundIn.map(id => textoDaConsulta.get(id) || id);
  /* §7 · recência preferindo o instante; o rótulo do provider é o reserva. */
  const recencia = dataLegivel(video.publishedAt) || video.publishedAtLabel;
  const visualizacoes = visualizacoesLegiveis(video.views);

  return <li className={bloco} data-testid="radar-youtube-video" data-universe-class={video.universeClass} data-signal={sinal.level}>
    <div className="flex flex-wrap items-start gap-3">
      {/*
        * A MINIATURA É O PRIMEIRO SINAL DE ADERÊNCIA — §9.
        *
        * Quem cura reconhece pelo frame antes de ler o título. Ela é decorativa
        * para quem usa leitor de tela: o título ao lado já diz o que ela mostra.
        */}
      {/*
        * `<img>` DE PROPÓSITO, E NÃO POR ESQUECIMENTO.
        *
        * `next/image` exigiria liberar `i.ytimg.com` e `yt3.ggpht.com` no
        * `next.config` de TODA a aplicação e passaria a otimizar — e a cobrar —
        * miniatura de terceiro que ninguém guarda. Para uma lista de curadoria
        * interna, `loading="lazy"` resolve sem espalhar configuração global.
        */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {video.thumbnailUrl && <img className="h-16 w-28 shrink-0 rounded-md border border-divider object-cover" src={video.thumbnailUrl} alt="" loading="lazy" data-testid="radar-youtube-thumb"/>}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{video.title}</p>
        <p className="mt-1 text-sm text-text-muted">
          {video.channelName || "canal não informado"} · {duracaoLegivel(video.durationSeconds, video.durationLabel)} · melhor posição {video.bestRank}
          {recencia ? ` · ${recencia}` : ""}
          {visualizacoes ? ` · ${visualizacoes}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* §9 · o selo de FORMATO, separado do sinal competitivo. */}
        <span className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted" data-testid="radar-youtube-class">
          {RADAR_YOUTUBE_UNIVERSE_LABELS[video.universeClass]}
        </span>
        <span className={`rounded-full border border-divider px-2 py-1 text-sm ${TOM_DO_SINAL[sinal.level]}`} data-testid="radar-youtube-signal">
          {RADAR_YOUTUBE_SIGNAL_LABELS[sinal.level]}
        </span>
      </div>
    </div>

    {/* POR QUE ele ficou nesta classe. Sem isto, o rótulo não se confere. */}
    <p className="mt-2 text-sm text-text-muted" data-testid="radar-youtube-class-reason">{video.universeReason}</p>

    {/*
      * §6 · O SINAL MOSTRA OS MOTIVOS, PORQUE NÃO É VERDADE FACTUAL.
      *
      * "Sinal forte" sozinho seria um veredito que ninguém confere. Com as
      * razões à vista, quem opera discorda quando quiser — e continua sendo
      * quem seleciona.
      */}
    <p className="mt-1 text-sm text-text-muted" data-testid="radar-youtube-signal-reasons">{sinal.reasons.join(" ")}</p>

    {/* §8 · quais consultas o encontraram — a proveniência, por extenso. */}
    <p className="mt-2 text-sm text-text-muted" data-testid="radar-youtube-provenance">
      Encontrado por {video.occurrenceCount} de {totalQueries} consulta(s): {consultas.join(" · ")}
    </p>

    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={selecionado ? primary : button}
        disabled={busy}
        onClick={() => onToggleVideo?.(video.videoId)}
        data-testid={`radar-youtube-select-${video.videoId}`}
      >{selecionado ? "Selecionado" : "Selecionar"}</button>
      <a className="text-sm text-context-accent underline underline-offset-2" href={video.url} target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>
      {video.channelUrl && <a className="text-sm text-context-accent underline underline-offset-2" href={video.channelUrl} target="_blank" rel="noopener noreferrer">Ver canal</a>}
    </div>
  </li>;
}


/**
 * ============ §10 · O BLUEPRINT NA TELA — YOUTUBE_SEARCH_2 ============
 *
 * OBSERVADO E RECOMENDADO NUNCA APARECEM NA MESMA COLUNA.
 *
 * Quem lê precisa saber, sem esforço, o que a SERP mostrou e o que nós
 * derivamos. Misturá-los faria uma sugestão nossa ganhar, na leitura, a mesma
 * autoridade de uma contagem de vídeos.
 */
function Faixa({ label, range, unidade }: { label: string; range: { sampleSize: number; p25: number | null; median: number | null; p75: number | null }; unidade: (valor: number) => string }) {
  if (!range.sampleSize) return <p className="text-sm text-text-muted">{label}: o provider não informou este dado em nenhum vídeo da coorte.</p>;
  return <p className="text-sm text-text-muted">
    {label}: <strong className="text-foreground">{range.p25 === null ? "—" : unidade(range.p25)} → {range.p75 === null ? "—" : unidade(range.p75)}</strong>
    {range.median === null ? "" : ` · mediana ${unidade(range.median)}`}
    {/* A faixa DECLARA de quantos itens ela saiu — §7. */}
    {` · ${range.sampleSize} vídeo(s)`}
  </p>;
}

function Coorte({ coorte }: { coorte: RadarYoutubeCohort }) {
  const segundos = (valor: number) => `${Math.floor(valor / 60)}:${String(Math.round(valor % 60)).padStart(2, "0")}`;
  return <section className={bloco} data-testid={`radar-youtube-cohort-${coorte.format.toLowerCase()}`}>
    <h5 className="text-sm font-semibold text-foreground">{coorte.format === "SHORTS" ? "Shorts" : "Long-form"} · {coorte.videoCount} vídeo(s)</h5>
    <div className="mt-2 space-y-1">
      <Faixa label="Duração observada" range={coorte.durationSeconds} unidade={segundos}/>
      <Faixa label="Visualizações" range={coorte.views} unidade={valor => valor.toLocaleString("pt-BR")}/>
      <Faixa label="Idade" range={coorte.ageMonths} unidade={valor => `${Math.round(valor)} mês(es)`}/>
    </div>

    {coorte.dominantChannels.length > 0 && <p className="mt-2 text-sm text-text-muted">
      Canais recorrentes: {coorte.dominantChannels.map(canal => `${canal.channelName} (${canal.videos})`).join(" · ")}
    </p>}

    {coorte.titlePatterns.length > 0 && <div className="mt-2">
      <p className="text-sm text-text-muted">Padrões de título observados:</p>
      <ul className="mt-1 flex flex-wrap gap-1" data-testid="radar-youtube-title-patterns">
        {coorte.titlePatterns.map(padrao => <li className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted" key={padrao.id}>
          {padrao.label} · {padrao.count}
        </li>)}
      </ul>
    </div>}

    {coorte.recurrentTerms.length > 0 && <p className="mt-2 text-sm text-text-muted">
      {/* TERMOS, nunca títulos: reproduzir o texto do concorrente não é leitura. */}
      Termos recorrentes: {coorte.recurrentTerms.map(termo => `${termo.term} (${termo.count})`).join(" · ")}
    </p>}

    {coorte.limitations.map(item => <p className="mt-1 text-sm text-warning" key={item}>{item}</p>)}
  </section>;
}

function Blueprint({ blueprint, finalizedAt }: { blueprint: RadarYoutubeBlueprint; finalizedAt: string | null }) {
  const { observed, recommended } = blueprint;
  const segundos = (valor: number) => `${Math.floor(valor / 60)}:${String(Math.round(valor % 60)).padStart(2, "0")}`;

  return <section className="space-y-3" aria-label="Blueprint competitivo de YouTube" data-testid="radar-youtube-blueprint">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">Blueprint competitivo</h4>
      {finalizedAt && <span className="text-sm text-positive" data-testid="radar-youtube-frozen-at">Congelado em {new Date(finalizedAt).toLocaleString("pt-BR")}</span>}
    </div>

    {/* ---------------- OBSERVADO ---------------- */}
    <div className="space-y-2" data-testid="radar-youtube-observed">
      <p className="text-sm font-semibold text-foreground">Observado na SERP</p>
      <p className="text-sm text-text-muted">
        Intenção declarada: {observed.declaredIntent || "não fechada pelo Arquiteto"} · {observed.universeSize} vídeo(s), {observed.comparableSize} comparável(is).
      </p>

      <div className="grid gap-2 lg:grid-cols-2">
        <Coorte coorte={observed.longForm}/>
        <Coorte coorte={observed.shorts}/>
      </div>

      {observed.avFormats.length > 0 && <p className="text-sm text-text-muted" data-testid="radar-youtube-av-formats">
        Formatos audiovisuais recorrentes: {observed.avFormats.map(formato => `${formato.label} (${formato.count})`).join(" · ")}
      </p>}

      {observed.crossQueryVideos.length > 0 && <div className={bloco} data-testid="radar-youtube-cross-query">
        <p className="text-sm font-semibold text-foreground">Vídeos que disputam mais de uma consulta</p>
        {/* §8 · força competitiva OBSERVADA — nunca verdade editorial. */}
        <ul className="mt-1 space-y-1">
          {observed.crossQueryVideos.map(video => <li className="text-sm text-text-muted" key={video.videoId}>
            {video.title} — {video.occurrenceCount} consultas, melhor posição {video.bestRank} · {video.signalLevel}
          </li>)}
        </ul>
      </div>}
    </div>

    {/* ---------------- RECOMENDADO ---------------- */}
    <div className="space-y-2" data-testid="radar-youtube-recommended">
      <p className="text-sm font-semibold text-foreground">Estratégia recomendada</p>
      <p className="text-sm text-text-muted">
        Formato: <strong className="text-foreground">{recommended.format}</strong>
        {recommended.durationSecondsRange ? ` · duração ${segundos(recommended.durationSecondsRange.min)} a ${segundos(recommended.durationSecondsRange.max)}` : " · sem faixa de duração observável"}
        {` · destino ${recommended.destination}`}
      </p>

      <ul className="space-y-2" data-testid="radar-youtube-strategy">
        {recommended.strategy.map(item => <li className={bloco} key={item.dimension}>
          <p className="text-sm font-semibold text-foreground">{item.dimension}</p>
          {/*
            * O SINAL FICA COLADO NA RECOMENDAÇÃO, e rotulado.
            *
            * Sem o "observado" ao lado, a recomendação vira palpite que ninguém
            * consegue conferir — e discordar dela exigiria refazer a leitura.
            */}
          <p className="mt-1 text-sm text-text-muted"><span className="font-semibold">Observado:</span> {item.observedSignal}</p>
          <p className="mt-1 text-sm text-foreground"><span className="font-semibold">Recomendado:</span> {item.recommendedStrategy}</p>
        </li>)}
      </ul>

      <div className={bloco} data-testid="radar-youtube-script">
        <p className="text-sm font-semibold text-foreground">Roteiro recomendado</p>
        <ol className="mt-1 space-y-1">
          {recommended.script.map(bloco2 => <li className="text-sm text-text-muted" key={bloco2.block}>
            <span className="font-semibold text-foreground">{bloco2.block}</span> — {bloco2.purpose}
          </li>)}
        </ol>
        {/* §6 · o aviso é parte do dado, não rodapé decorativo. */}
        <p className="mt-2 text-sm text-warning" data-testid="radar-youtube-script-disclaimer">{recommended.scriptDisclaimer}</p>
      </div>

      {recommended.gaps.length > 0 && <div className={bloco} data-testid="radar-youtube-gaps">
        <p className="text-sm font-semibold text-foreground">Oportunidades</p>
        <ul className="mt-1 space-y-1">
          {recommended.gaps.map(gap => <li className="text-sm text-text-muted" key={`${gap.kind}:${gap.statement}`}>
            <span className="text-foreground">{gap.statement}</span> <span className="opacity-80">({gap.evidence})</span>
          </li>)}
        </ul>
      </div>}

      {recommended.titleOpportunities.length > 0 && <details className="rounded-md border border-divider p-2" data-testid="radar-youtube-title-opportunities">
        <summary className="cursor-pointer text-sm font-semibold text-text-muted">Padrões de título que a SERP não usa</summary>
        <ul className="mt-1 space-y-1">
          {recommended.titleOpportunities.map(item => <li className="text-sm text-text-muted" key={item}>{item}</li>)}
        </ul>
      </details>}
    </div>

    <ul className="space-y-1" data-testid="radar-youtube-blueprint-limitations">
      {blueprint.limitations.map(item => <li className="text-sm text-text-muted" key={item}>{item}</li>)}
    </ul>
  </section>;
}


/**
 * ======= §9 e §14 · O PACOTE DE PESQUISA — RADAR_RESEARCH_PROFILES_1 =======
 *
 * A lista de três fontes com um botão "Adicionar leitura Google" saiu daqui, e
 * por dois motivos.
 *
 * O primeiro é de fluxo: somar leitura deixou de ser decisão de clique. O
 * perfil escolhido já responde quais coletas o pacote faz, e um START só.
 *
 * O segundo é que aquele botão estava quebrado de um jeito que a tela não
 * mostrava: ele levava ao caminho da investigação GOOGLE PRINCIPAL — que exige
 * snapshot canônico, curadoria e seleção de concorrentes — e o runtime
 * respondia "este snapshot não possui payload canônico completo". O apoio nunca
 * coletou nada.
 *
 * O que fica é o estado do pacote: a principal, o apoio, e um retry que
 * alcança SÓ o apoio (§7) — refazer a principal cobraria de novo as consultas
 * do YouTube para corrigir uma leitura do Google que custou uma.
 */
function PacoteDePesquisa({ pacote, projecao, busy, onRetrySupport }: {
  pacote: RadarResearchPackage;
  /*
   * §3 e §12 · O ESTADO VEM DA AUTORIDADE, NÃO DO PACOTE.
   *
   * `RadarResearchPackageState` descreve a COLETA e não conhece o
   * congelamento — depois do FINALIZE ele continuava dizendo "Coletando"
   * porque um campo de apoio seguia pendente. Quem responde "em que pé está a
   * investigação" é a projeção; o pacote responde "o que foi coletado".
   */
  projecao: RadarResearchProfileProjection;
  busy: boolean;
  onRetrySupport?: () => void;
}) {
  const plano = radarResearchProfilePlan(pacote.profile);
  const apoio = pacote.support;

  return <section className={bloco} aria-label="Pacote de pesquisa" data-testid="radar-research-package">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="text-sm font-semibold text-foreground">Pesquisa {plano.label}</h4>
      <span className="text-sm text-text-muted" data-testid="radar-research-package-state">
        {projecao.statusLabel || RADAR_RESEARCH_PACKAGE_STATE_LABELS[pacote.state]}
      </span>
    </div>
    {/* O perfil diz que RADIOGRAFIA se está produzindo — não "onde pesquisar". */}
    <p className="mt-1 text-sm text-text-muted">{plano.purpose}</p>

    <ul className="mt-2 space-y-1">
      <li className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="radar-research-primary">
        <span className="text-foreground">{radarResearchSourceLabel(pacote.primary.source)}</span>
        <span className={pacote.primary.collected ? "text-positive" : "text-text-muted"}>
          {pacote.primary.collected
            ? `✓ ${pacote.primary.queryCount} consulta(s) · ${pacote.primary.resultCount} vídeo(s)`
            : pacote.primary.running ? "coletando…" : pacote.primary.failed ? "falhou" : "não coletada"}
        </span>
      </li>

      {/*
        * O APOIO NÃO É FONTE DE SEGUNDA CLASSE — §4.
        *
        * Ele tem papel próprio no dado (`SEO_SUPPORT`), e a tela diz que
        * PERGUNTA ele responde. Sem isso, "apoio Google" pareceria uma coleta
        * menor da mesma coisa, e a pessoa não saberia o que esperar dela.
        */}
      {apoio && <li className="text-sm" data-testid="radar-research-support">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-foreground">
            Apoio {radarResearchSourceLabel(apoio.source)}
            <span className="ml-1 text-text-muted">· {RADAR_RESEARCH_SOURCE_ROLE_LABELS[apoio.role]}</span>
          </span>
          {apoio.collected
            ? <span className="text-positive" data-testid="radar-research-support-ok">✓ coletado automaticamente</span>
            : apoio.failureReason
              ? projecao.state === "FINALIZED"
              ? <span className="text-text-muted">não participou da fotografia</span>
              : <button type="button" className={button} disabled={busy} onClick={() => onRetrySupport?.()} data-testid="radar-retry-support">Repetir apoio</button>
              : <span className="text-text-muted">no mesmo START</span>}
        </div>
        <p className="mt-1 text-sm text-text-muted">{apoio.purpose}</p>
        {/*
          * §7 · A FALHA DO APOIO NÃO APAGA A PRINCIPAL.
          *
          * Sem este estado, o pacote teria de escolher entre mentir "pronta" e
          * jogar fora uma coleta paga.
          */}
        {!apoio.collected && apoio.failureReason && <p className="mt-1 text-sm text-warning" role="status" data-testid="radar-research-support-failed">
          O apoio falhou e a pesquisa {plano.label} foi preservada. {apoio.failureReason}
        </p>}
      </li>}
    </ul>
  </section>;
}

/**
 * ====== §6 · O BLUEPRINT MULTIFORMATO, COMPACTO ======
 *
 * O que a busca MOSTRA fica de um lado; o que RECOMENDAMOS, do outro. Sem essa
 * separação visual, uma sugestão nossa ganha na leitura a mesma autoridade de
 * uma contagem de vídeos.
 *
 * §12: nada de hash, runId, id de concorrente ou JSON. Só o que decide.
 */
function BlueprintMultiformato({ blueprint }: { blueprint: RadarMultimodalBlueprint }) {
  const { observed, recommended } = blueprint;
  const google = observed.googleFeatures;
  const atravessaram = observed.crossSerpVideos.filter(item => item.signal === "CROSS_PLATFORM");

  return <section className="space-y-3" aria-label="Blueprint competitivo multiformato" data-testid="radar-multimodal-blueprint">
    <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">Blueprint competitivo multiformato</h4>

    {/* ---------------- OBSERVADO ---------------- */}
    <div className={bloco} data-testid="radar-multimodal-observed">
      <p className="text-sm font-semibold text-foreground">O que a busca mostra</p>

      {google ? <ul className="mt-1 space-y-1">
        {google.observedIntentSignals.map(sinal => <li className="text-sm text-text-muted" key={sinal}>{sinal}</li>)}
      </ul> : <p className="mt-1 text-sm text-text-muted">Sem leitura do Google para esta investigação.</p>}

      <p className="mt-2 text-sm text-text-muted">
        YouTube: {observed.youtubeLongForm} long-form e {observed.youtubeShorts} Short(s) disputando a intenção.
      </p>

      {google && google.questionMap.length > 0 && <div className="mt-2">
        <p className="text-sm text-text-muted">Perguntas que a busca faz:</p>
        <ul className="mt-1 space-y-1" data-testid="radar-multimodal-questions">
          {google.questionMap.map(item => <li className="text-sm text-foreground" key={item.question}>{item.question}</li>)}
        </ul>
      </div>}

      {google && google.entityMap.length > 0 && <p className="mt-2 text-sm text-text-muted" data-testid="radar-multimodal-entities">
        Temas que a busca trata como parte da intenção: {google.entityMap.map(item => item.term).join(" · ")}
      </p>}

      {/*
        * §5 · O SINAL DE TRAVESSIA, em português — não em videoId.
        *
        * Mostrar o id serviria a quem depura, não a quem decide. O que importa
        * é QUE um vídeo venceu nas duas buscas, e com que posição.
        */}
      {atravessaram.length > 0 && <div className="mt-2" data-testid="radar-multimodal-cross">
        <p className="text-sm text-text-muted">Atravessam as duas buscas:</p>
        <ul className="mt-1 space-y-1">
          {atravessaram.map(video => <li className="text-sm text-foreground" key={video.videoId}>
            {video.title} <span className="text-text-muted">— {video.reason}</span>
          </li>)}
        </ul>
      </div>}
    </div>

    {/* ---------------- RECOMENDADO ---------------- */}
    <div className={bloco} data-testid="radar-multimodal-recommended">
      <p className="text-sm font-semibold text-foreground">
        O que recomendamos: <span className="text-context-accent">{RADAR_EDITORIAL_OUTPUT_LABELS[recommended.editorialOutput]}</span>
      </p>

      <ul className="mt-1 space-y-1" data-testid="radar-multimodal-rationale">
        {recommended.rationale.map(item => <li className="text-sm text-text-muted" key={item}>{item}</li>)}
      </ul>

      <ul className="mt-2 space-y-2" data-testid="radar-multimodal-pieces">
        {recommended.pieces.map((peca, indice) => <li className="rounded-md border border-divider p-2" key={`${peca.piece}:${indice}`}>
          <p className="text-sm font-semibold text-foreground">{RADAR_PIECE_LABELS[peca.piece]}</p>
          <p className="mt-1 text-sm text-foreground">{peca.role}</p>
          {/*
            * §7 · O SHORT CARREGA O PRÓPRIO SINAL.
            *
            * Quem produz precisa saber qual pergunta responder e com que
            * ângulo, sem reabrir a SERP para descobrir o porquê.
            */}
          {peca.sourceQuestion && <p className="mt-1 text-sm text-text-muted">Pergunta observada: “{peca.sourceQuestion}”</p>}
          {peca.suggestedAngle && <p className="mt-1 text-sm text-text-muted">Ângulo: {peca.suggestedAngle}</p>}
          <p className="mt-1 text-sm text-text-muted opacity-80">Vem de: {peca.derivedFrom}</p>
        </li>)}
      </ul>
    </div>

    <ul className="space-y-1" data-testid="radar-multimodal-limitations">
      {blueprint.limitations.map(item => <li className="text-sm text-text-muted" key={item}>{item}</li>)}
    </ul>
  </section>;
}

export function RadarYoutubeSearchPanel({ run, plannedQueries, busy, blockedReason, frozen, pacote, projecao, blueprintView, editorialModel, evidenceExtras, multimodal, sampleSummary, provenanceSummary, lazySample, lazyProvenance, onLoadSample, onLoadProvenance, onStart, onToggleVideo, onFinalize, onReset, onRetrySupport }: RadarYoutubeSearchPanelProps) {
  /*
   * ============ 2.2 · §2 · A CORRIDA EFETIVA ============
   *
   * A do payload enquanto a investigação está viva — ali o universo É a
   * superfície de curadoria e vem inteiro. A buscada depois do freeze, quando
   * o transporte foi compactado.
   *
   * Ela alimenta TODAS as derivações abaixo, e não só a amostra: coortes,
   * proveniência e seleção leem a mesma corrida. Duas fontes aqui fariam a
   * tela contar uma coisa no rótulo e outra nos cards.
   */
  const corrida = run || lazySample?.run || null;
  const resumo = radarYoutubeRunSummary(corrida);
  const finalizada = projecao.state === "FINALIZED";
  const selecionados = new Set(corrida?.selectedVideoIds || []);
  /* O texto de cada consulta, para o card dizer QUAL delas achou o vídeo. */
  const textoDaConsulta = new Map((corrida?.queries || []).map(item => [item.queryId, item.text]));
  const coortes = radarYoutubeFormatCohorts(corrida?.universe || []);
  const totalQueries = corrida?.queries.filter(item => item.executed).length || corrida?.queries.length || 0;
  const collectedAt = corrida?.provenance.collectedAt || null;

  const secao = (titulo: string, explicacao: string, itens: RadarYoutubeUniverseEntry[], testid: string) =>
    itens.length > 0 && <section className="space-y-2" data-testid={testid}>
      <div>
        <h4 className="text-sm font-semibold text-foreground">{titulo} · {itens.length}</h4>
        <p className="text-sm text-text-muted">{explicacao}</p>
      </div>
      <ul className="space-y-2">
        {itens.map(video => <VideoCard
          key={video.videoId}
          video={video}
          selecionado={selecionados.has(video.videoId)}
          busy={busy}
          textoDaConsulta={textoDaConsulta}
          totalQueries={totalQueries}
          collectedAt={collectedAt}
          onToggleVideo={onToggleVideo}
        />)}
      </ul>
    </section>;

  /*
   * A MESMA AMOSTRA NOS DOIS CAMINHOS — recolhida ou aberta.
   *
   * Duas construções divergiriam com o tempo, e a versão recolhida acabaria
   * mostrando algo diferente da aberta sobre a mesma investigação.
   */
  const amostra = <>
    {secao("Long-form", "Ensinam hook, ordem dos blocos, argumentação, demonstração e CTA. Comparam-se entre si.", coortes.longForm, "radar-youtube-cohort-long-form")}
    {secao("Shorts", "Ensinam gancho imediato, formulação curta, promessa e microestrutura. Comparam-se entre si — nunca com long-form.", coortes.shorts, "radar-youtube-cohort-shorts")}
    {secao("Parcial", "Falam do assunto e o formato não sustenta comparação: ao vivo, estreia, ou sem duração e sem formato declarado.", coortes.partial, "radar-youtube-cohort-partial")}
    {secao("Não disputa a intenção", "Playlist, canal, anúncio ou filme. Ficam à vista para não parecerem esquecidos.", coortes.notRelevant, "radar-youtube-cohort-not-relevant")}
  </>;

  return <section className="mt-3 space-y-3" aria-label="Pesquisa de YouTube" data-testid="radar-youtube-search">
    {/*
      * §9 · O RESUMO DA ABA — curto, e sem hash nem debug.
      *
      * O fingerprint e os ids continuam no dado, para conferência. Quem opera
      * decide com os números de formato e um estado.
      */}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-text-muted" data-testid="radar-youtube-summary">
        {/* §5 · finalizada, quem conta é a fotografia — nunca a corrida viva. */}
        {finalizada ? projecao.headline : resumo ? resumo.headline : `Nenhuma coleta ainda · ${plannedQueries} consulta(s) planejada(s)`}
      </p>
      <div className="flex flex-wrap gap-2">
        {/*
          * ====== §10 · DEPOIS DO FREEZE NÃO HÁ AÇÃO NORMAL QUE O SUBSTITUA ======
          *
          * [Refinalizar (nova fotografia)] saiu daqui: ele oferecia, como ação
          * corriqueira, reescrever o que "congelado" promete não reescrever. E
          * [Nova coleta] saiu junto, porque uma coleta nova por cima de uma
          * investigação finalizada trocaria o universo sob um carimbo que já
          * tinha sido dado — em silêncio.
          *
          * Reabrir continua possível, e agora é o que parece: uma ação com
          * consequência declarada.
          */}
        {!finalizada && <button
          type="button"
          className={primary}
          disabled={busy || Boolean(blockedReason) || plannedQueries === 0}
          onClick={() => onStart?.()}
          data-testid="radar-youtube-start"
        >{busy ? "Coletando…" : run ? "Nova coleta" : radarResearchProfilePlan(pacote.profile).startLabel}</button>}

        {/*
          * §12 · FINALIZE É DECISÃO HUMANA, e só aparece quando há o que congelar.
          *
          * Ele não chama provider, worker nem transcrição: recalcula o blueprint
          * a partir da coleta que já existe e tira a fotografia. A autoridade
          * canônica já sabe quando isso vale — READY ou apoio falho.
          */}
        {!finalizada && (projecao.state === "READY" || projecao.state === "PARTIAL_SUPPORT_FAILED") && <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => onFinalize?.()}
          data-testid="radar-youtube-finalize"
        >Finalizar investigação</button>}

        {/*
          * ====== §5 · [VER BLUEPRINT] É A AÇÃO PRINCIPAL DEPOIS DO FREEZE ======
          *
          * Some o START e sobra o quê? Uma aba finalizada sem ação nenhuma
          * parece uma aba morta. O que a pessoa vem fazer aqui depois de
          * congelar é LER a recomendação — e ela estava enterrada embaixo de
          * 38 cards de concorrente.
          */}
        {projecao.showBlueprint && <button
          type="button"
          className={primary}
          onClick={() => document.querySelector('[data-testid="radar-competitive-blueprint"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
          data-testid="radar-youtube-view-blueprint"
        >Ver blueprint</button>}

        {/*
          * A FOTOGRAFIA TAMBÉM AUTORIZA REABRIR — 2.2.
          *
          * Depois do freeze a corrida sai da cópia de leitura. Ler só `run`
          * faria a única ação que sobra desaparecer de uma investigação
          * finalizada.
          */}
        {(corrida || frozen) && <button type="button" className={button} disabled={busy} onClick={() => onReset?.()} data-testid="radar-youtube-reset">
          {finalizada ? "Reabrir / zerar investigação" : "Zerar pesquisa YouTube"}
        </button>}
      </div>
    </div>

    {/*
      * §10 · O QUE SUBSTITUI OS BOTÕES: o estado, dito.
      *
      * Some a ação e fica a informação. Sem esta linha, a aba de uma
      * investigação finalizada pareceria uma aba sem nada para fazer.
      */}
    {finalizada && <div className="rounded-md border border-positive/30 bg-positive-soft/10 p-2" data-testid="radar-youtube-finalized">
      <p className="text-sm text-positive" role="status">Investigação finalizada. Uma coleta nova exige reabrir antes — a fotografia não é substituída em silêncio.</p>
      {/*
        * §11 · A CONSEQUÊNCIA DE REABRIR, ANTES DE CLICAR.
        *
        * "Zerar" não diz o que se perde. Quem lê isto está prestes a tirar do
        * corrente uma investigação paga, e precisa saber disso antes — não
        * depois, num aviso de sucesso.
        */}
      <p className="mt-1 text-sm text-text-muted" data-testid="radar-youtube-reopen-consequence">
        Reabrir tira esta fotografia do corrente e libera a escolha do perfil para uma investigação nova. O histórico gravado é preservado; a coleta, não — uma nova custa de novo.
      </p>
    </div>}

    <PacoteDePesquisa pacote={pacote} projecao={projecao} busy={busy} onRetrySupport={onRetrySupport}/>

    {/*
      * §13 · ZERO SHORTS PRECISA DIZER DE QUEM É O ZERO.
      *
      * "0 Short(s)" no resumo cobre duas histórias opostas: o YouTube não
      * entregou nenhum, ou entregou e a leitura perdeu. A segunda é defeito
      * nosso e não pode passar por resultado.
      */}
    {resumo?.shortsNotice && <p className="text-sm text-text-muted" role="status" data-testid="radar-youtube-shorts-notice">{resumo.shortsNotice}</p>}

    {blockedReason && <p className="text-sm text-warning" role="status" data-testid="radar-youtube-blocked">{blockedReason}</p>}

    {/*
      * A FALHA DE COLETA NÃO SE PARECE COM COLETA VAZIA.
      *
      * "O YouTube não devolveu nada para estas consultas" e "não conseguimos
      * perguntar" pedem ações opostas de quem opera.
      */}
    {/*
      * A CORRIDA EM ANDAMENTO SOBREVIVE AO F5 — 1.3 · §4 e §10.
      *
      * Ela é gravada antes da chamada, então recarregar no meio mostra a
      * corrida existindo em vez de uma aba vazia. Se a aba foi fechada durante
      * a coleta, este é o estado que fica — e "Nova coleta" é o retry.
      */}
    {run?.state === "COLLECTING" && <p className="text-sm text-text-muted" role="status" data-testid="radar-youtube-collecting">
      Coleta em andamento: {run.provenance.queriesRequested} consulta(s) enviadas ao YouTube. Se esta tela foi reaberta e nada mudar, use [Nova coleta] para tentar de novo.
    </p>}

    {run?.state === "COLLECTION_FAILED" && <p className="text-sm text-warning" role="alert" data-testid="radar-youtube-failed">
      Nenhuma consulta foi respondida pelo provider. {run.provenance.failures[0]?.reason || ""}
    </p>}

    {corrida && corrida.limitations.length > 0 && <ul className="space-y-1" data-testid="radar-youtube-limitations">
      {corrida.limitations.map(item => <li className="text-sm text-text-muted" key={item}>{item}</li>)}
    </ul>}

    {/*
      * ============ AS DUAS COORTES, UMA EMBAIXO DA OUTRA — §4 ============
      *
      * Cada bloco diz o que ELE ensina. É isso que impede a leitura de que a
      * lista de cima é "a boa" e a de baixo é o resto.
      */}
    {/*
      * ====== §8 · O BLUEPRINT VEM ANTES DA AMOSTRA ======
      *
      * A aba abria com 38 cards de concorrente e o material editorial ficava
      * no fim. A ordem aqui é a da decisão: o que produzir primeiro, a matéria-
      * prima um clique abaixo.
      */}
    {/*
      * ====== PROFILES_2 · §3 · O PRODUTO PRINCIPAL É O ROTEIRO ======
      *
      * O blueprint competitivo multiformato provava o que a SERP mostrou — e
      * ocupava, como superfície principal, o lugar do que se vai produzir. Ele
      * não foi apagado: desceu para a evidência competitiva, que é onde a
      * pergunta dele é feita.
      */}
    {editorialModel && <RadarProfileBlueprintSection model={editorialModel} />}

    {/*
      * ====== 2.1 · §22, §23 e §25 · UMA PORTA PARA A EVIDÊNCIA ======
      *
      * Depois do PROFILES_2 o roteiro virou a superfície principal, e o que
      * ficou embaixo dele foi um campo de disclosures irmãos: blueprint
      * multiformato, leitura técnica das coortes, candidatos observados,
      * detalhes da pesquisa. Cada um respondia uma variação da MESMA pergunta —
      * "com base em quê?" —, e quatro portas para a mesma sala fazem a pessoa
      * abrir todas para descobrir que já tinha lido aquilo.
      *
      * Nada foi apagado: tudo entra aqui, na ordem em que se consulta.
      */}
    <details className="rounded-md border border-divider bg-surface p-3" data-testid="radar-youtube-competitive-evidence">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Ver evidência competitiva</summary>
      <div className="mt-3 space-y-3">
        <RadarCompetitiveBlueprintSection view={blueprintView}/>

        {/*
          * §22 · O BLUEPRINT MULTIFORMATO NÃO É UM SEGUNDO PRODUTO PRINCIPAL.
          *
          * "O que a busca mostra / o que recomendamos" é leitura de evidência —
          * e, aberto ao lado do roteiro, disputava com ele o lugar de coisa a
          * ser produzida. Aqui ele responde a pergunta que é dele.
          */}
        {(frozen?.multimodal?.blueprint || multimodal)
          && <BlueprintMultiformato blueprint={frozen?.multimodal?.blueprint || multimodal!}/>}

        {/*
          * §23 · A LEITURA TÉCNICA DESCE MAIS UM NÍVEL.
          *
          * Percentis de duração e contagens de padrão continuam conferíveis, e
          * continuam fechados por padrão: quem abre a evidência quer a leitura,
          * não a planilha por trás dela.
          */}
        {frozen && <details className="rounded-md border border-divider p-2" data-testid="radar-youtube-cohort-details">
          <summary className="cursor-pointer text-sm font-semibold text-text-muted">Leitura técnica das coortes</summary>
          <div className="mt-2"><Blueprint blueprint={frozen.blueprint} finalizedAt={frozen.finalizedAt}/></div>
        </details>}

        {/*
          * §25 · O PAINEL LEGADO ENTRA INTEIRO, em vez de competir de fora.
          *
          * "Ver detalhes da pesquisa" e "Ver candidatos observados" existiam
          * como irmãos soltos porque, quando foram escritos, o YouTube não
          * tinha onde absorvê-los. Agora tem.
          */}
        {evidenceExtras}
      </div>
    </details>

    {/*
      * ============ §6 · A AMOSTRA CEDE O LUGAR DEPOIS DO FREEZE ============
      *
      * Antes de congelar, os vídeos SÃO o trabalho: é neles que se cura. Depois,
      * o trabalho é ler a recomendação — e 38 cards abertos empurravam o
      * blueprint para fora da tela.
      *
      * Recolher não é esconder: a contagem fica no rótulo, e abrir mostra
      * exatamente a mesma amostra. Nada é recalculado e nada é buscado.
      */}
    {corrida && corrida.universe.length > 0 && projecao.sampleDefaultExpanded
      && <div className="space-y-4" data-testid="radar-youtube-universe">{amostra}</div>}

    {/*
      * ============ 2.2 · §1 e §3 · A AMOSTRA RECOLHIDA É BUSCADA ============
      *
      * Depois do freeze a corrida não vem no payload inicial. Abrir faz UMA
      * leitura remota da coleta que JÁ está gravada — provider calls = 0: ela
      * foi paga uma vez, e um clique de curiosidade não pode cobrá-la de novo.
      *
      * O rótulo vem do resumo, e é por isso que ele existe: dizer
      * "38 vídeos" sem ter transportado 38 vídeos.
      */}
    {!projecao.sampleDefaultExpanded && (corrida?.universe.length || sampleSummary?.available) && <details
      className="rounded-md border border-divider p-2"
      onToggle={evento => {
        /* Só o PRIMEIRO clique busca. Fechar e reabrir lê o que já chegou. */
        if (!(evento.currentTarget as HTMLDetailsElement).open) return;
        if (corrida || lazySample?.state !== "IDLE") return;
        onLoadSample?.();
      }}
      data-testid="radar-youtube-sample-details"
    >
      <summary className="cursor-pointer text-sm font-semibold text-foreground" data-testid="radar-youtube-sample-summary">
        Ver amostra competitiva · {corrida?.universe.length ?? sampleSummary?.count ?? 0} vídeo(s)
      </summary>

      {/*
        * §3 · O ERRO DA AMOSTRA NÃO TOCA O ESTADO FINALIZED.
        *
        * A fotografia continua válida e o blueprint continua legível acima. O
        * que falhou foi a consulta — e ela tem um botão próprio.
        */}
      {!corrida && lazySample?.state === "LOADING" && <p className="mt-2 text-sm text-text-muted" role="status" data-testid="radar-youtube-sample-loading">
        Carregando amostra…
      </p>}
      {!corrida && lazySample?.state === "FAILED" && <div className="mt-2" data-testid="radar-youtube-sample-failed">
        <p className="text-sm text-warning" role="status">{lazySample.message || "Não foi possível carregar a amostra."}</p>
        <button type="button" className={`${button} mt-1`} onClick={() => onLoadSample?.()} data-testid="radar-youtube-sample-retry">Tentar novamente</button>
      </div>}

      {corrida && <div className="mt-3 space-y-4" data-testid="radar-youtube-universe">{amostra}</div>}
    </details>}

    {/*
      * §12 · O QUE A TELA MOSTRA DEPOIS DO FINALIZE É A FOTOGRAFIA.
      *
      * Não o recálculo. F5 e outra sessão leem o mesmo blueprint porque leem o
      * que foi congelado — e é isso que faz "finalizado" significar alguma coisa.
      */}
    {/*
      * §9 e 2.1 · §22 e §23 · DEPOIS DO FINALIZE, O QUE VALE É A FOTOGRAFIA.
      *
      * O blueprint vivo é recalculado a cada abertura; o congelado não muda. Se
      * os dois existissem na tela ao mesmo tempo, a pessoa veria duas leituras
      * da mesma investigação sem saber qual assinar. A escolha entre eles
      * continua sendo esta — ela só acontece dentro da evidência agora.
      */}

    {run && run.state === "COLLECTED" && run.universe.length === 0 && <p className="text-sm text-text-muted" data-testid="radar-youtube-empty">
      As consultas foram respondidas e o YouTube não devolveu vídeo nenhum para elas.
    </p>}

    {/*
      * A PROVENIÊNCIA TÉCNICA FICA UM NÍVEL ABAIXO — §9.
      *
      * Fingerprint, endpoint e identificadores existem e são conferíveis; eles
      * só não competem com o universo pela atenção de quem cura.
      */}
    {/*
      * ============ 2.2 · §4 · A PROVENIÊNCIA, PELA MESMA AUTORIDADE ============
      *
      * Ela responde com ou sem a corrida ao lado: a fotografia guarda `runRef`
      * com id, assinatura, provider e locale. Duplicar a implementação da
      * Amazon aqui criaria duas leituras técnicas da mesma investigação.
      */}
    {(corrida || provenanceSummary?.available) && <details
      className="rounded-md border border-divider p-2"
      onToggle={evento => {
        if (!(evento.currentTarget as HTMLDetailsElement).open) return;
        if (corrida || lazyProvenance?.state !== "IDLE") return;
        onLoadProvenance?.();
      }}
      data-testid="radar-youtube-provenance-details"
    >
      <summary className="cursor-pointer text-sm font-semibold text-text-muted">Proveniência / detalhes técnicos</summary>

      {!corrida && lazyProvenance?.state === "LOADING" && <p className="mt-2 text-sm text-text-muted" role="status" data-testid="radar-youtube-provenance-loading">
        Carregando proveniência…
      </p>}
      {!corrida && lazyProvenance?.state === "FAILED" && <div className="mt-2" data-testid="radar-youtube-provenance-failed">
        <p className="text-sm text-warning" role="status">{lazyProvenance.message || "Não foi possível carregar a proveniência."}</p>
        <button type="button" className={`${button} mt-1`} onClick={() => onLoadProvenance?.()} data-testid="radar-youtube-provenance-retry">Tentar novamente</button>
      </div>}

      {/* Sem a corrida, a leitura técnica vem da referência da fotografia. */}
      {!corrida && lazyProvenance?.data && <dl className="mt-2 grid gap-2 text-sm text-text-muted sm:grid-cols-2" data-testid="radar-youtube-provenance-ref">
        <div><dt>Corrida</dt><dd className="break-all text-foreground">{lazyProvenance.data.runId} · v{lazyProvenance.data.runVersion ?? "?"}</dd></div>
        <div><dt>Fingerprint</dt><dd className="break-all text-foreground">{lazyProvenance.data.fingerprint}</dd></div>
        <div><dt>Provider</dt><dd className="break-all text-foreground">{lazyProvenance.data.provider} · {lazyProvenance.data.endpoint}</dd></div>
        <div><dt>Coletado em</dt><dd className="text-foreground">{dataLegivel(lazyProvenance.data.collectedAt) || lazyProvenance.data.collectedAt}</dd></div>
      </dl>}

      {corrida && <dl className="mt-2 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
        <div><dt>Corrida</dt><dd className="break-all text-foreground">{corrida.runId} · v{corrida.runVersion}</dd></div>
        <div><dt>Fingerprint</dt><dd className="break-all text-foreground">{corrida.fingerprint.signature}</dd></div>
        <div><dt>Provider</dt><dd className="break-all text-foreground">{corrida.provenance.provider} · {corrida.provenance.endpoint}</dd></div>
        <div><dt>Profundidade</dt><dd className="text-foreground">{corrida.provenance.blockDepth ?? "não declarada"} por consulta{corrida.provenance.device ? ` · ${corrida.provenance.device}` : ""}{corrida.provenance.os ? `/${corrida.provenance.os}` : ""}</dd></div>
        <div><dt>Consultas</dt><dd className="text-foreground">{corrida.provenance.queriesSucceeded} de {corrida.provenance.queriesRequested} respondida(s)</dd></div>
        <div><dt>Coletado em</dt><dd className="text-foreground">{dataLegivel(corrida.provenance.collectedAt) || corrida.provenance.collectedAt}</dd></div>
        <div><dt>Resultados crus</dt><dd className="text-foreground">{corrida.results.length}</dd></div>
      </dl>}

      {/*
        * CADA CONSULTA, CONFERÍVEL À MÃO — §3.
        *
        * `checkUrl` é a mesma busca aberta no YouTube, e `seResultsCount` é o
        * que a plataforma diz existir: é o que impede alguém de ler 20 itens
        * como se fossem o universo inteiro.
        */}
      {corrida && corrida.queries.some(item => item.checkUrl || item.seResultsCount !== null) && <ul className="mt-2 space-y-1" data-testid="radar-youtube-query-checks">
        {corrida.queries.map(consulta => <li className="text-sm text-text-muted" key={consulta.queryId}>
          {consulta.text}: {consulta.resultCount} coletado(s)
          {consulta.seResultsCount !== null ? ` de ${consulta.seResultsCount.toLocaleString("pt-BR")} que o YouTube declara` : ""}
          {consulta.checkUrl ? <> · <a className="text-context-accent underline underline-offset-2" href={consulta.checkUrl} target="_blank" rel="noopener noreferrer">conferir</a></> : null}
        </li>)}
      </ul>}

      {corrida && corrida.provenance.failures.length > 0 && <ul className="mt-2 space-y-1">
        {corrida.provenance.failures.map(falha => <li className="text-sm text-warning" key={falha.queryId}>{textoDaConsulta.get(falha.queryId) || falha.queryId}: {falha.reason}</li>)}
      </ul>}
    </details>}
  </section>;
}
