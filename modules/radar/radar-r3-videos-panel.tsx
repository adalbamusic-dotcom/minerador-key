"use client";

import { useState } from "react";
import { radarVideoSourceDisplay, type RadarVideoSourceInputVerdict, type RadarVideoSourceText } from "@/lib/radar/video-source";
import {
  filterRadarVideoLibrary,
  RADAR_VIDEO_LIBRARY_FILTERS,
  RADAR_VIDEO_LIBRARY_FILTER_LABEL,
  summarizeRadarVideoLibrary,
  type RadarLibrarySource,
  type RadarVideoLibraryFilter,
} from "@/lib/radar/video-library";
import { radarVideoAcquisitionCapability, radarVideoMetadataCanRequest, radarVideoTextCanRequest, type RadarVideoTextState } from "@/lib/radar/video-text-acquisition";
import { radarMatchingReadiness, summarizeRadarBriefCoverage, type RadarBriefCoverage } from "@/lib/radar/video-brief-matching";
import { InfoHint } from "@/components/info-hint";

/**
 * VÍDEOS — a área que não usa SERP.
 *
 * A pesquisa descobre o que o mercado já publicou. Esta área recebe o que a
 * marca escolheu deliberadamente.
 *
 * GATE 2 · TRÊS BLOCOS, NA ORDEM EM QUE SE OPERA.
 *
 *   topo       as fontes registradas e a ação de extrair texto;
 *   esquerda   as pautas que a investigação produziu;
 *   direita    o que já foi extraído de cada fonte.
 *
 * A coluna da direita NÃO se chama "Artigo" e não organiza nada por pauta: o
 * casamento entre pauta e conteúdo é o VIDEOS_3. Chamá-la de artigo agora
 * prometeria uma leitura que ninguém produziu.
 */

type RadarVideoSourceEntryFeedback = { raw: string; verdict: RadarVideoSourceInputVerdict; reason: string };

export type RadarVideoBriefView = {
  briefId: string;
  topic: string;
  narrativePurpose: string;
  whatToLookFor: string[];
  priority: string;
  /** `true` quando veio do bundle congelado, e não do blueprint vivo. */
  frozen: boolean;
  /** O bloco editorial que esta pauta complementa, quando a investigação o resolveu. */
  relatedSectionTitle: string | null;
  /** A evidência que a pauta pede. Texto da própria investigação. */
  evidenceNeeded: string;
  /** De onde a pauta saiu. Vazio no blueprint vivo, que não registra origem. */
  provenance: Array<{ source: string; detail: string }>;
};

export type RadarVideoSourcesView = {
  /** A biblioteca da MARCA, com a seleção do artigo corrente por cima. */
  sources: RadarLibrarySource[];
  texts: RadarVideoSourceText[];
  briefs: RadarVideoBriefView[];
  /** Declarado quando o artigo não tem investigação: não se inventa pauta. */
  briefsUnavailableReason: string | null;
  /*
   * O CASAMENTO GRAVADO — Gate 3. Vem do servidor; a tela não o calcula.
   *
   * `null` significa "ainda não casado", que é diferente de "casado e sem
   * resultado": o primeiro pede uma ação, o segundo é resposta.
   */
  coverage: RadarBriefCoverage[] | null;
  matching: boolean;
  /*
   * O ESTADO DA INVESTIGAÇÃO — §3.0.1, e são dois fatos, não um.
   *
   * "Não finalizei" e "finalizei e não pediu vídeo" pedem ações diferentes de
   * quem opera. Um campo só não conseguiria dizer as duas coisas.
   */
  investigationFinalized: boolean;
  frozenBriefCount: number;
  loading: boolean;
  saving: boolean;
  extracting: string | null;
  lastBatch: RadarVideoSourceEntryFeedback[] | null;
  error: string | null;
  readbackConfirmed: boolean;
};

type RadarR3VideosPanelProps = {
  /*
   * O ARTIGO É OPCIONAL — §2.3.2, e é a mudança central deste painel.
   *
   * A biblioteca é da MARCA e se administra sem artigo nenhum. `null` não é
   * estado degradado: é o modo em que se cuida do acervo. Só a CAMADA DO
   * ARTIGO — checkbox, filtro de selecionadas, lote, processar — depende dele,
   * e some quando ele não existe em vez de fingir um artigo implícito.
   */
  articleId?: string | null;
  videoSources?: RadarVideoSourcesView;
  onRegisterVideoSources?: (articleId: string | null, raw: string) => void;
  onExtractVideoText?: (articleId: string | null, videoSourceId: string) => void;
  onFetchVideoMetadata?: (articleId: string | null, videoSourceId: string) => void;
  onProvideVideoTranscript?: (articleId: string | null, videoSourceId: string, transcript: string) => void;
  onUploadVideoMedia?: (articleId: string | null, videoSourceId: string, file: File) => void;
  onLibraryAction?: (articleId: string | null, action: "SELECT" | "UNSELECT" | "PROCESS_SELECTED" | "ARCHIVE" | "CLEAR_LIST", videoSourceIds: string[]) => void;
  /** Repetir a leitura depois de uma falha, por decisão de quem opera. */
  onReloadLibrary?: (articleId: string | null) => void;
  /** Casar pauta com conteúdo. Ação humana, e a única que grava recorte. */
  onRunMatching?: (articleId: string | null) => void;
};

const bloco = "rounded-md border border-divider bg-surface p-3";
const inset = "rounded-md border border-divider bg-surface-subtle p-3";
const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";

const VEREDICTO: Record<RadarVideoSourceInputVerdict, { rotulo: string; tom: string }> = {
  VALID: { rotulo: "Registrada", tom: "text-positive" },
  ALREADY_REGISTERED: { rotulo: "Já registrada", tom: "text-text-muted" },
  DUPLICATE_IN_INPUT: { rotulo: "Repetida no que foi colado", tom: "text-text-muted" },
  UNSUPPORTED: { rotulo: "Fora do escopo desta fase", tom: "text-warning" },
  INVALID: { rotulo: "Endereço não reconhecido", tom: "text-warning" },
};

const TOM_DO_ESTADO: Record<RadarVideoTextState, string> = {
  REGISTERED: "text-text-muted",
  METADATA_READY: "text-text-muted",
  /* Limitação não é falha: tom neutro, não de alerta. */
  TEXT_ACQUISITION_UNAVAILABLE: "text-text-muted",
  /* Tentamos e o vídeo não tem legenda. Também não é falha — há saída. */
  PUBLIC_TRANSCRIPT_UNAVAILABLE: "text-text-muted",
  QUEUED: "text-pending",
  PROCESSING: "text-pending",
  TEXT_READY: "text-positive",
  FAILED_RETRYABLE: "text-warning",
  FAILED_FINAL: "text-warning",
};

const dataLegivel = (valor: string) => {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR");
};

const tempoLegivel = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export function RadarR3VideosPanel({ articleId = null, videoSources, onRegisterVideoSources, onExtractVideoText, onFetchVideoMetadata, onProvideVideoTranscript, onUploadVideoMedia, onLibraryAction, onReloadLibrary, onRunMatching }: RadarR3VideosPanelProps) {
  const [raw, setRaw] = useState("");
  const [filtro, setFiltro] = useState<RadarVideoLibraryFilter>("ALL");
  /* Qual fonte está com o campo de transcrição aberto, e o que há nele. */
  /* Qual pauta está aberta na coluna da direita. Filtro de leitura, nada mais. */
  const [transcricaoDe, setTranscricaoDe] = useState<string | null>(null);
  const [transcricao, setTranscricao] = useState("");
  const vista = videoSources;
  const registradas = vista?.sources || [];
  const visiveis = filterRadarVideoLibrary(registradas, filtro);
  const textoPorFonte = new Map((vista?.texts || []).map(item => [item.videoSourceId, item]));
  const ocupado = Boolean(vista?.saving || vista?.loading);
  const selecionadasDoArtigo = registradas.filter(item => item.selectedForArticle && item.registrationStatus !== "ARCHIVED");
  /* O lote age sobre a vista corrente, e só sobre o lado que faz sentido mudar. */
  /* A CAMADA DO ARTIGO, em uma variável só: ou existe artigo, ou não existe. */
  const camadaDoArtigo = Boolean(articleId);
  /*
   * A MESMA PROJEÇÃO QUE O CARD — §2.3.3.
   *
   * "Nenhuma fonte" só pode ser dito depois de uma leitura que voltou. Com o
   * SELECT quebrado esta linha afirmava um acervo vazio que ninguém conhecia.
   */
  const leitura = summarizeRadarVideoLibrary({
    sources: registradas, articleId,
    loading: vista?.loading, error: vista?.error, readbackConfirmed: vista?.readbackConfirmed,
  });
  const selecionadasVisiveis = visiveis.filter(item => item.selectedForArticle);
  const naoSelecionadasVisiveis = visiveis.filter(item => !item.selectedForArticle && item.registrationStatus !== "ARCHIVED");
  /*
   * A PRONTIDÃO DECIDE A MENSAGEM E O BOTÃO — uma decisão, dois consumidores.
   *
   * As fontes entram no formato do domínio: o que importa para a prontidão é
   * selecionada, não arquivada e com texto pronto — os mesmos três critérios
   * que o casamento usa depois.
   */
  const prontidao = radarMatchingReadiness({
    articleId,
    investigationFinalized: Boolean(vista?.investigationFinalized),
    frozenBriefCount: vista?.frozenBriefCount || 0,
    sources: registradas.map(item => ({
      videoSourceId: item.id, displayName: item.displayName,
      textState: item.textState, selectedForArticle: item.selectedForArticle,
      registrationStatus: item.registrationStatus, languageCode: null,
      processingVersion: 1, segments: [], transcriptText: "",
    })),
  });
  const cobertura = vista?.coverage || null;
  const coberturaPorPauta = new Map((cobertura || []).map(item => [item.videoBriefId, item]));
  const resumoDaCobertura = cobertura ? summarizeRadarBriefCoverage(cobertura) : null;
  const nomeDaFonte = new Map(registradas.map(item => [item.id, radarVideoSourceDisplay(item).title]));

  return <section className="space-y-3" aria-label="Área Vídeos do Radar" data-testid="radar-videos-panel">

    {/* ======================= TOPO · as fontes ======================= */}
    <section className={bloco}>
      {/*
        * EXPLICAÇÃO VAI PARA O INFOHINT; ESTADO E AÇÃO FICAM — §2.3.3.
        *
        * O parágrafo sobre o MODELO (a fonte é da marca, registrar não é
        * selecionar) é didático: quem já entendeu lê três linhas toda vez. Ele
        * some da primeira camada e continua alcançável.
        *
        * O que NÃO vai para cá: contagem, estado de leitura, erro e ação. Isso
        * é operação, e operação escondida atrás de um ícone é operação perdida.
        */}
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        Biblioteca de fontes da marca
        <InfoHint
          title="Biblioteca de fontes da marca"
          description="A fonte de vídeo pertence à MARCA e pode servir a vários artigos: uma URL, uma fonte, uma transcrição — reutilizada por todos os artigos que a selecionarem. Registrar apenas coloca a fonte na biblioteca; declarar que este artigo a usa é o checkbox da linha, e marcar não processa nada."
        />
      </h3>

      {/* FILTROS — §10. Simples de propósito: nada de busca sofisticada ainda. */}
      <div className="mt-2 flex flex-wrap gap-2" data-testid="radar-videos-filters">
        {RADAR_VIDEO_LIBRARY_FILTERS.filter(item => camadaDoArtigo || item !== "SELECTED_FOR_ARTICLE").map(item => <button
          key={item}
          type="button"
          data-testid={`radar-videos-filter-${item}`}
          aria-pressed={filtro === item}
          className={`${button} ${filtro === item ? "border-context-accent text-context-accent" : ""}`}
          onClick={() => setFiltro(item)}
        >{RADAR_VIDEO_LIBRARY_FILTER_LABEL[item]}</button>)}
      </div>

      {/*
        * AÇÕES EM LOTE — §13. Todas por ação humana, nenhuma automática.
        *
        * O lote opera sobre o QUE ESTÁ NA VISTA, não sobre uma marcação
        * paralela: com o checkbox valendo como seleção, uma segunda camada de
        * "marcadas" faria a mesma caixa significar duas coisas diferentes.
        *
        * "Remover deste artigo" e "Arquivar" continuam distintas: a primeira
        * desfaz um vínculo, a segunda tira da biblioteca. Nenhuma apaga.
        */}
      {camadaDoArtigo && visiveis.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="radar-videos-bulk">
        <span className="text-sm text-text-muted">{visiveis.length} na vista</span>
        <button type="button" data-testid="radar-videos-bulk-select" className={button}
          disabled={!onLibraryAction || ocupado || naoSelecionadasVisiveis.length === 0}
          onClick={() => onLibraryAction?.(articleId, "SELECT", naoSelecionadasVisiveis.map(item => item.id))}
        >Usar todas da vista neste artigo</button>
        <button type="button" data-testid="radar-videos-bulk-unselect" className={button}
          disabled={!onLibraryAction || ocupado || selecionadasVisiveis.length === 0}
          onClick={() => onLibraryAction?.(articleId, "UNSELECT", selecionadasVisiveis.map(item => item.id))}
        >Remover todas da vista deste artigo</button>
      </div>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {camadaDoArtigo && <button type="button" data-testid="radar-videos-process-selected" className={button}
          disabled={!onLibraryAction || !registradas.some(item => item.selectedForArticle)}
          onClick={() => onLibraryAction?.(articleId, "PROCESS_SELECTED", [])}
        >Processar selecionados</button>}
        <button type="button" data-testid="radar-videos-clear-list" className={button} disabled={!onLibraryAction || ocupado}
          onClick={() => onLibraryAction?.(articleId, "CLEAR_LIST", [])}
        >Limpar lista</button>
        {camadaDoArtigo
          ? <span className="text-sm text-text-muted" data-testid="radar-videos-article-count">
            {registradas.filter(item => item.selectedForArticle).length} selecionada(s) para este artigo
          </span>
          : <span className="text-sm text-text-muted" data-testid="radar-videos-no-article">
            Nenhum artigo selecionado — a biblioteca é da marca. Selecione um artigo para declarar quais fontes ele usa.
          </span>}
      </div>

      <p
        className={`mt-1 text-sm leading-6 ${leitura.state === "READ_FAILED" ? "text-warning" : "text-text-muted"}`}
        role={leitura.state === "READ_FAILED" ? "status" : undefined}
        data-testid="radar-videos-reading"
        data-read-state={leitura.state}
      >
        {leitura.headline}
        {leitura.detail ? ` · ${leitura.detail}` : ""}
        {leitura.state === "READ_OK" && registradas.length ? ` · ${visiveis.length} no filtro atual.` : ""}
        {leitura.state === "READ_OK" ? " Entrada deliberada: o endereço é registrado como referência, e nenhum download acontece ao registrar." : ""}
      </p>

      {/*
        * O ERRO VEM COM A SAÍDA — §2.3.2.
        *
        * A leitura é tentada UMA vez por contexto, de propósito: a versão
        * anterior redisparava a cada falha e piscava a tela. O preço dessa
        * decisão é que repetir precisa ser oferecido a quem opera, aqui.
        */}
      {vista?.error && <p className="mt-2 text-sm text-warning" role="status" data-testid="radar-videos-error">
        {vista.error}
        {onReloadLibrary && <button
          type="button"
          data-testid="radar-videos-retry"
          className="ml-2 underline"
          disabled={ocupado}
          onClick={() => onReloadLibrary(articleId)}
        >Tentar novamente</button>}
      </p>}

      {visiveis.length > 0 && <ul className="mt-3 space-y-2" data-testid="radar-videos-registered">
        {visiveis.map(fonte => {
          const leitura = radarVideoSourceDisplay(fonte);
          const texto = textoPorFonte.get(fonte.id) || null;
          const capacidade = radarVideoAcquisitionCapability({
            kind: fonte.sourceKind,
            hasProvidedTranscript: Boolean(texto),
            hasUploadedMedia: leitura.hasUploadedMedia,
          });
          const pedido = radarVideoTextCanRequest({ state: fonte.textState, capability: capacidade });
          const metadados = radarVideoMetadataCanRequest({ kind: fonte.sourceKind, hasMetadata: leitura.hasMetadata });
          return <li key={fonte.id} className="rounded-md border border-divider bg-surface-subtle px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-w-0 items-center gap-2">
                {/* Sem artigo não há uso a declarar: a caixa não aparece. */}
                {/*
                  * O CHECKBOX É A SELEÇÃO — §2.3.1. Ele não processa.
                  *
                  * Marcar cria o vínculo Article ↔ Source; desmarcar o desativa.
                  * A extração é outra ação, explícita, e só das selecionadas —
                  * por isso marcar não chama provider nenhum.
                  *
                  * O estado exibido vem do SERVIDOR (`selectedForArticle`), não
                  * de uma cópia local: uma caixa que mostra a intenção do clique
                  * em vez do que foi gravado mente quando a gravação falha.
                  */}
                {camadaDoArtigo && <input
                  type="checkbox"
                  data-testid={`radar-videos-check-${fonte.id}`}
                  aria-label={`Usar ${leitura.title} neste artigo`}
                  checked={fonte.selectedForArticle}
                  disabled={!onLibraryAction || ocupado}
                  onChange={() => onLibraryAction?.(articleId, fonte.selectedForArticle ? "UNSELECT" : "SELECT", [fonte.id])}
                />}
                <span className="truncate text-sm text-foreground">{leitura.title}</span>
                {camadaDoArtigo && fonte.selectedForArticle && <span className="shrink-0 rounded border border-context-accent/35 px-1.5 py-0.5 text-xs font-semibold text-context-accent">neste artigo</span>}
              </label>
              <span className="flex items-center gap-2 text-sm text-text-muted">
                <span>
                  {leitura.statusLabel} · {dataLegivel(leitura.registeredAt)}
                  {` · ${fonte.articleUsageCount} artigo(s)`}
                </span>
                {/*
                  * ARQUIVAR É DA BIBLIOTECA, não do artigo — e por isso fica na
                  * linha da fonte, longe do checkbox. A recusa (uso em outro
                  * artigo, evidência congelada) vem do servidor, por item.
                  */}
                {fonte.registrationStatus !== "ARCHIVED" && <button
                  type="button"
                  data-testid={`radar-videos-archive-${fonte.id}`}
                  className={button}
                  disabled={!onLibraryAction || ocupado}
                  onClick={() => onLibraryAction?.(articleId, "ARCHIVE", [fonte.id])}
                >Arquivar</button>}
              </span>
            </div>
            <p className="mt-1 break-all text-sm text-text-muted">
              {leitura.platform}
              {leitura.channel ? ` · ${leitura.channel}` : ""}
              {leitura.duration ? ` · ${leitura.duration}` : ""}
              {texto?.languageCode ? ` · idioma ${texto.languageCode}` : ""}
            </p>
            <p className="mt-1 break-all text-sm text-text-muted">{leitura.url}</p>
            <p className={`mt-1 text-sm ${TOM_DO_ESTADO[fonte.textState] || "text-text-muted"}`}>{leitura.textStatus}</p>

            {/*
              * O MOTIVO VEM JUNTO DO "NÃO" — §9.
              *
              * Dizer só "texto não disponível" faria parecer defeito. A frase
              * explica que é uma fronteira da autorização, e as ações abaixo
              * dizem o que ainda é possível fazer.
              */}
            {!pedido.allowed && !capacidade.available && <p className="mt-1 text-sm text-text-muted">{capacidade.reason}</p>}
            {leitura.textStatusReason && <p className="mt-1 text-sm text-text-muted">{leitura.textStatusReason}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Obter metadados: a única coisa que a API key alcança. */}
              {metadados.allowed && <button
                type="button"
                data-testid={`radar-videos-metadata-${fonte.id}`}
                className={button}
                disabled={!onFetchVideoMetadata || vista?.extracting === fonte.id}
                onClick={() => onFetchVideoMetadata?.(articleId, fonte.id)}
              >Obter metadados</button>}

              {/*
                * "Extrair texto" SÓ APARECE quando existe capability — §9.
                *
                * Um botão que sempre recusa transforma uma fronteira conhecida
                * em suspeita de defeito a cada clique.
                */}
              {pedido.allowed && <button
                type="button"
                data-testid={`radar-videos-extract-${fonte.id}`}
                className={button}
                disabled={!onExtractVideoText || vista?.extracting === fonte.id}
                onClick={() => onExtractVideoText?.(articleId, fonte.id)}
              >{vista?.extracting === fonte.id ? "Enfileirando…" : "Extrair texto"}</button>}

              {/*
                * ENVIAR ÁUDIO — entrada deliberada, como o registro da fonte.
                *
                * O `accept` lista o que o Speech transcreve de verdade.
                * Contêiner de vídeo fica de fora: extrair a trilha exigiria um
                * conversor que esta infraestrutura não tem, e aceitar para
                * falhar depois faria quem opera esperar a fila para descobrir.
                */}
              {!texto && !leitura.hasUploadedMedia && <label
                className={`${button} cursor-pointer`}
                data-testid={`radar-videos-upload-${fonte.id}`}
              >Enviar áudio
                <input
                  type="file"
                  className="sr-only"
                  accept="audio/flac,audio/wav,audio/mpeg,audio/ogg,audio/webm,audio/amr"
                  disabled={!onUploadVideoMedia}
                  onChange={event => {
                    const arquivo = event.target.files?.[0];
                    /* O envio nasce da ESCOLHA do arquivo, e de nada mais. */
                    if (arquivo) onUploadVideoMedia?.(articleId, fonte.id, arquivo);
                    event.target.value = "";
                  }}
                />
              </label>}

              {/* Informar transcrição: o caminho legítimo quando a marca já a tem. */}
              {!texto && <button
                type="button"
                data-testid={`radar-videos-provide-${fonte.id}`}
                className={button}
                disabled={!onProvideVideoTranscript}
                onClick={() => { setTranscricaoDe(transcricaoDe === fonte.id ? null : fonte.id); setTranscricao(""); }}
              >Informar transcrição</button>}
            </div>

            {transcricaoDe === fonte.id && <div className="mt-2">
              <label className="block text-sm text-text-muted" htmlFor={`radar-video-transcript-${fonte.id}`}>
                Cole a transcrição desta fonte. Ela é preservada no idioma original, como veio.
              </label>
              <textarea
                id={`radar-video-transcript-${fonte.id}`}
                data-testid={`radar-videos-transcript-input-${fonte.id}`}
                value={transcricao}
                onChange={event => setTranscricao(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground"
              />
              <button
                type="button"
                data-testid={`radar-videos-transcript-save-${fonte.id}`}
                className={`${button} mt-2`}
                disabled={!transcricao.trim() || !onProvideVideoTranscript}
                onClick={() => { onProvideVideoTranscript?.(articleId, fonte.id, transcricao); setTranscricaoDe(null); setTranscricao(""); }}
              >Preservar transcrição</button>
            </div>}
          </li>;
        })}
      </ul>}

      <label className="mt-3 block text-sm text-text-muted" htmlFor={`radar-video-urls-${articleId || "marca"}`}>
        {/*
          * UM CAMPO PARA OS DOIS CASOS — §11.
          *
          * Cadastro individual é o lote de tamanho um. Dois caminhos de entrada
          * seriam duas deduplicações, e a segunda erraria mais cedo ou mais
          * tarde. A fonte entra na biblioteca da marca e já fica selecionada
          * para este artigo.
          */}
        Cole uma URL do YouTube, ou várias — uma por linha. Elas entram na biblioteca da marca sem ficar
        selecionadas para este artigo.
      </label>
      <textarea
        id={`radar-video-urls-${articleId || "marca"}`}
        data-testid="radar-videos-input"
        value={raw}
        onChange={event => setRaw(event.target.value)}
        rows={4}
        className="mt-1 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground"
        placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="radar-videos-register"
          className={button}
          disabled={!raw.trim() || ocupado || !onRegisterVideoSources}
          onClick={() => { onRegisterVideoSources?.(articleId, raw); setRaw(""); }}
        >{vista?.saving ? "Registrando…" : "Registrar fontes"}</button>
        {vista && !vista.readbackConfirmed && !vista.loading && <span className="text-sm text-warning">Leitura remota ainda não confirmada.</span>}
      </div>

      {vista?.lastBatch?.length ? <ul className="mt-3 space-y-1" data-testid="radar-videos-batch-result">
        {vista.lastBatch.map((entrada, indice) => <li key={`${entrada.raw}:${indice}`} className="text-sm">
          <span className={VEREDICTO[entrada.verdict].tom}>{VEREDICTO[entrada.verdict].rotulo}</span>
          <span className="text-text-muted"> · {entrada.raw}</span>
          <span className="block text-text-muted">{entrada.reason}</span>
        </li>)}
      </ul> : null}
    </section>

    {/* ================= ABAIXO · conteúdo e casamento ================= */}
    {/*
      * UMA LISTA DE PAUTAS, NÃO DUAS — VIDEOS 3.1 · §3 e §6.
      *
      * Aqui vivia "Pautas do Radar": as mesmas quatro pautas que o bloco do
      * topo já mostrava, agora como seletor. Duas listas do mesmo dado, e a de
      * cima lia o blueprint vivo enquanto esta lia o congelado.
      *
      * O briefing recolheu para o disclosure do topo. O que fica embaixo é o
      * que ESTA área produz: o conteúdo das fontes, a ação, e o resultado por
      * pauta depois que o casamento roda. Antes disso não se repete a pauta —
      * mostra-se o estado e o CTA.
      */}
    <div className="space-y-3">

      <section className={bloco} data-testid="radar-videos-extracted">
        {/*
          * DUAS CAMADAS NA MESMA SEÇÃO, e nesta ordem — VIDEOS 3.2.
          *
          * Primeiro o RESULTADO do casamento (o que esta área produz), depois
          * as FONTES com texto (a matéria-prima que o alimentou). Antes as duas
          * vinham misturadas, com o transcript bruto aberto por cima de tudo.
          */}
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Resultado do casamento
          <InfoHint
            title="Conteúdo extraído"
            description="O texto extraído é preservado no idioma ORIGINAL: nada é traduzido, resumido nem reescrito. O casamento entre pauta e conteúdo, a tradução de trechos e a evidência de vídeo ainda não existem — são gates posteriores."
          />
        </h3>
      {/*
        * O CASAMENTO É AÇÃO HUMANA — §4 do Gate 3.
        *
        * Ele não roda ao abrir, ao trocar de artigo nem ao clicar numa pauta:
        * roda quando alguém pede, sobre transcript já gravado e pauta já
        * congelada.
        */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {camadaDoArtigo && <button
          type="button"
          data-testid="radar-videos-run-matching"
          data-readiness={prontidao.state}
          className={button}
          /*
            * DESLIGADO QUANDO NÃO HÁ O QUE CASAR — e o motivo fica ao lado, não
            * escondido num tooltip. Um botão aceso que sempre recusa transforma
            * uma ausência conhecida em suspeita de defeito a cada clique.
            */
          disabled={!onRunMatching || ocupado || vista?.matching || !prontidao.canRun}
          title={prontidao.canRun ? undefined : prontidao.reason}
          onClick={() => onRunMatching?.(articleId)}
        >{vista?.matching ? "Casando…" : "Casar pautas com o conteúdo"}</button>}
        {/*
          * A ÚNICA FRASE DE ESTADO — VIDEOS 3.1 · §6.
          *
          * Ela carrega o `data-readiness` que antes ficava na lista de pautas
          * removida. A mensagem e o botão continuam lendo a MESMA prontidão —
          * agora sem um segundo texto ao lado para divergir dela.
          */}
        <span className="text-sm text-text-muted" data-testid="radar-videos-coverage-summary" data-readiness={prontidao.state}>
          {cobertura
            ? `${resumoDaCobertura!.supported} pauta(s) coberta(s) · ${resumoDaCobertura!.partial} parcial(is) · ${resumoDaCobertura!.notFound} sem trecho · ${resumoDaCobertura!.extracts} trecho(s)`
            : prontidao.canRun
              ? "Pautas e conteúdo ainda não foram casados."
              : prontidao.reason}
        </span>
      </div>

      {/*
        * A COLUNA DA DIREITA SEGUE A PAUTA ABERTA — §10.
        *
        * Sem pauta escolhida ela mostra o panorama; com pauta, só os trechos
        * daquela pauta. Nada aqui é traduzido, resumido ou reescrito: o texto é
        * o original, e os tempos são os do transcript.
        */}
      {/*
        * O RESULTADO, PAUTA A PAUTA — §5.
        *
        * Sem repetir o briefing: o que aparece aqui é o desfecho de cada pauta
        * nesta execução — estado, fonte que sustentou, trecho original, tempos
        * quando existem, e o que ficou faltando. Nada é traduzido, resumido ou
        * reescrito; os tempos são os do transcript.
        */}
      {cobertura && <div className="mt-3 space-y-2" data-testid="radar-videos-brief-extracts">
        {vista?.briefs.map(pauta => {
          const dela = coberturaPorPauta.get(pauta.briefId) || null;
          return <div key={pauta.briefId} className={inset} data-testid={`radar-videos-result-${pauta.briefId}`}>
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{pauta.topic}</span>
              <span
                className={`text-sm ${dela?.state === "SUPPORTED" ? "text-positive" : dela?.state === "PARTIAL" ? "text-pending" : "text-text-muted"}`}
                data-testid={`radar-videos-coverage-${pauta.briefId}`}
              >{dela?.state || "NOT_FOUND"}</span>
            </p>
            {/* §5 · o que faltou é dito; ausência de trecho não é erro. */}
            {(!dela || !dela.extracts.length) && <p className="mt-1 text-sm text-text-muted" data-testid={`radar-videos-brief-empty-${pauta.briefId}`}>
              {dela?.reason || "Esta pauta não foi alcançada por nenhuma fonte nesta execução."}
            </p>}
            {dela && dela.extracts.length > 0 && <ul className="mt-2 space-y-2">
            {dela.extracts.map(trecho => <li key={`${trecho.videoSourceId}:${trecho.startMs}`} className={inset}>
              <p className="text-sm font-semibold text-foreground">
                {nomeDaFonte.get(trecho.videoSourceId) || trecho.videoSourceId}
                <span className="ml-2 font-normal text-text-muted">{tempoLegivel(trecho.startMs)}–{tempoLegivel(trecho.endMs)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{trecho.originalText}</p>
              <p className="mt-1 text-sm text-text-muted">Por que ajuda: {trecho.reasonForRelevance}</p>
              {trecho.sourceLanguage && <p className="mt-1 text-sm text-text-muted">Idioma original: {trecho.sourceLanguage} · não traduzido</p>}
              {trecho.limitations.length > 0 && <p className="mt-1 text-sm text-text-muted">{trecho.limitations.join(" · ")}</p>}
            </li>)}
            </ul>}
          </div>;
        })}
      </div>}

      <h4 className="mt-4 text-sm font-semibold text-foreground" data-testid="radar-videos-sources-heading">Fontes com texto disponível</h4>
      {(selecionadasDoArtigo.length === 0
          ? <p className="mt-1 text-sm text-text-muted">Nenhuma fonte selecionada para este artigo.</p>
          : <ul className="mt-2 space-y-2">
            {selecionadasDoArtigo.map(fonte => {
              const texto = textoPorFonte.get(fonte.id) || null;
              const leitura = radarVideoSourceDisplay(fonte);
              return <li key={fonte.id} className={inset}>
                <p className="text-sm font-semibold text-foreground">{leitura.title}</p>
                <p className={`mt-1 text-sm ${TOM_DO_ESTADO[fonte.textState] || "text-text-muted"}`}>{leitura.textStatus}</p>
                {texto
                  ? <>
                    <p className="mt-1 text-sm text-text-muted">
                      Idioma original: {texto.languageCode || "não informado"} ·{" "}
                      {/* §6 · declarado, nunca presumido. Nada é estimado. */}
                      {texto.hasTimestamps ? `${texto.segments.length} trecho(s) com tempo` : "sem marcação de tempo"}
                      {texto.hasTimestamps && texto.segments.length > 0 && ` · começa em ${tempoLegivel(texto.segments[0].startMs)}`}
                      {texto.hasTimestamps && texto.segments.length > 0 && ` · termina em ${tempoLegivel(texto.segments[texto.segments.length - 1].endMs)}`}
                    </p>
                    {/*
                      * A MATÉRIA-PRIMA RECOLHEU — VIDEOS 3.2.
                      *
                      * Setecentos e trinta e três segmentos abertos por padrão
                      * empurravam o resultado editorial para fora da tela e
                      * misturavam duas coisas: o que a fonte DISSE e o que o
                      * casamento CONCLUIU. O transcript continua inteiro, a um
                      * clique — e o clique não grava nada nem chama ninguém.
                      */}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-context-accent" data-testid={`radar-videos-transcript-${fonte.id}`}>Ver transcrição completa</summary>
                      <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-6 text-foreground">{texto.transcriptText}</p>
                    </details>
                  </>
                  : <p className="mt-1 text-sm text-text-muted">
                    {leitura.textStatusReason || "Nada foi extraído desta fonte ainda."}
                  </p>}
              </li>;
            })}
          </ul>)}
      </section>
    </div>

    {/*
      * O QUE ESTA ÁREA AINDA NÃO FAZ — dito, não insinuado.
      *
      * Prometer num rótulo o que não se entrega é pior do que a ausência: quem
      * opera esperaria a leitura de volta. A extração passou a existir; o
      * casamento com a pauta, a tradução e a evidência, não.
      */}
  </section>;
}
