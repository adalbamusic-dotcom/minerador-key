"use client";

import { buildRadarAmazonBlueprintCards, buildRadarAmazonObservedView } from "@/lib/radar/amazon-observed";
import type { RadarAmazonSearchRun } from "@/lib/radar/amazon-search-run";
import type { RadarAmazonFrozenInvestigation } from "@/lib/radar/amazon-evidence";
import type { RadarResearchProvenancePayload } from "@/lib/radar/research-read-model";
import type { RadarResearchPackageRecord } from "@/lib/radar/research-package";
import { radarPackageHeadline } from "@/lib/radar/research-package";
import type { RadarResearchProfileProjection } from "@/lib/radar/research-profile-state";
import type { RadarCompetitiveBlueprintView } from "@/lib/radar/competitive-blueprint-view";
import { RADAR_RESEARCH_SOURCE_ROLE_LABELS } from "@/lib/radar/research-profile";
import { RadarCompetitiveBlueprintSection } from "./radar-competitive-blueprint";
import { RadarProfileBlueprintSection } from "./radar-profile-blueprint";
import type { RadarEditorialProfileModel } from "@/lib/radar/editorial-profile-model";

/**
 * PESQUISA → AMAZON — AMAZON_SEARCH_1.1 · §8 a §20 e AMAZON_SEARCH_2 · §5 a §30.
 *
 * ================== A ORDEM DA TELA É A ORDEM DA DECISÃO — §28 ==================
 *
 * Cabeçalho, quatro cards, blueprint, amostra recolhida, proveniência recolhida.
 *
 * Cinquenta e um cards de produto antes da conclusão editorial empurrariam para
 * fora da tela exatamente o que a pessoa veio ler — foi esse o defeito que a
 * casca canônica corrigiu no YouTube, e não há motivo para recriá-lo aqui.
 *
 * ===================== NENHUMA HEURÍSTICA DE MARCA — §13 =====================
 *
 * Nada aqui adivinha fabricante a partir do título. "Nivea" no começo de um
 * título é uma palavra, não um campo; tratá-la como marca produziria um
 * concorrente inventado dentro de um relatório que a pessoa vai assinar.
 *
 * ======================= IDS TÉCNICOS FICAM NA GAVETA — §30 =======================
 *
 * runId, snapshotId, hash e endpoint vivem na proveniência recolhida. Na visão
 * normal eles só competem com a leitura.
 */

export type RadarAmazonSearchPanelProps = {
  run: RadarAmazonSearchRun | null;
  /** Quantas consultas o plano produziria. Mostrado ANTES de gastar. */
  plannedQueries: number;
  busy: boolean;
  /** Por que não dá para começar agora. `null` quando dá. */
  blockedReason: string | null;
  /** §6 · o pacote gravado: as duas coletas amarradas ao mesmo clique. */
  pacote: RadarResearchPackageRecord | null;
  /** §16 · a autoridade única de estado — a mesma que o card e a tabela leem. */
  projecao: RadarResearchProfileProjection;
  /**
   * §31 · O BLUEPRINT, MONTADO PELA AUTORIDADE ÚNICA.
   *
   * O painel não deriva recomendação: quatro componentes React montando a mesma
   * leitura foi o defeito que o 1.1 fechou, com um dado mais barato.
   */
  blueprintView: RadarCompetitiveBlueprintView;
  /** PROFILES_2 · o modelo comercial. A superfície principal do perfil. */
  editorialModel?: RadarEditorialProfileModel | null;
  /** 2.1 · §25 · os painéis de consulta legados, absorvidos pela evidência. */
  evidenceExtras?: React.ReactNode;
  /** §8 e §31 · a configuração do alvo editorial, renderizada antes do START. */
  targetSetup?: React.ReactNode;
  /** 1.1 · §16 · observados / compatíveis / selecionados. */
  counts?: { observed: number; eligible: number; shortlist: number } | null;
  /** §25 · a fotografia, quando já houve FINALIZE. */
  frozen: RadarAmazonFrozenInvestigation | null;
  onStart?: () => void;
  /** §19 · retry que alcança SÓ o apoio. A principal já foi paga. */
  onRetrySupport?: () => void;
  /** §23 · a análise determinística, sem provider. */
  onAnalyze?: () => void;
  /** §25 · o congelamento, por decisão humana. */
  onFinalize?: () => void;
  onReset?: () => void;
  /**
   * ============ §4 e §5 · O QUE CHEGA SOB DEMANDA ============
   *
   * Numa investigação CONGELADA a corrida não vem no payload inicial: ela
   * alimenta um disclosure fechado, e disclosure fechado não é lazy loading
   * se os 129,7 KB já atravessaram a rede.
   *
   * O resumo basta para o rótulo — "Ver amostra competitiva · 51 produtos" —
   * e o conteúdo é buscado no primeiro clique.
   */
  sampleSummary?: { count: number; available: boolean; unit: string };
  provenanceSummary?: { available: boolean };
  onLoadSample?: () => void;
  onLoadProvenance?: () => void;
  /** `null` enquanto ninguém abriu. `undefined` não existe aqui de propósito. */
  lazySample?: { state: "IDLE" | "LOADING" | "READY" | "FAILED"; run: RadarAmazonSearchRun | null; message: string | null };
  lazyProvenance?: { state: "IDLE" | "LOADING" | "READY" | "FAILED"; data: RadarResearchProvenancePayload | null; message: string | null };
};

const bloco = "rounded-md border border-divider bg-surface p-3";
const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";
const primary = `${button} border-context-accent bg-selected`;

function PacoteDaPesquisa({ pacote, busy, counts, onRetrySupport }: {
  pacote: RadarResearchPackageRecord;
  busy: boolean;
  /** 1.1 · §16 · os três números: observados, compatíveis, selecionados. */
  counts?: { observed: number; eligible: number; shortlist: number } | null;
  onRetrySupport?: () => void;
}) {
  const primaria = pacote.primaryResearch;
  const apoio = pacote.supportResearch;

  return <section className={bloco} aria-label="Pacote de pesquisa" data-testid="radar-amazon-package">
    <h4 className="text-base font-semibold text-foreground">Pacote de pesquisa</h4>
    <ul className="mt-2 space-y-2">
      <li className="text-sm text-foreground" data-testid="radar-amazon-package-primary">
        <span className="font-semibold">Pesquisa principal · Amazon</span>
        {" — "}
        {/*
          * ============ 1.1 · §16 · TRÊS NÚMEROS, TRÊS PERGUNTAS ============
          *
          * "59 produto(s) comparável(is)" era uma frase falsa sobre um número
          * verdadeiro: os 59 existem, e não eram comparáveis entre si — havia
          * sérum Nivea, sérum Dove e creme de mãos Nivea na mesma contagem.
          *
          * Observados é evidência; compatíveis é o universo que o alvo admite;
          * selecionados é a decisão editorial. Um número só escondia duas
          * decisões.
          */}
        {primaria.status === "COLLECTED"
          ? counts
            ? `${counts.observed} resultado(s) observado(s) · ${counts.eligible} compatível(is) com o alvo · ${counts.shortlist} selecionado(s) para o artigo`
            : `${primaria.uniqueProductCount} resultado(s) observado(s)`
          : primaria.status === "FAILED"
            ? primaria.failureReason || "a coleta falhou"
            : "em andamento…"}
      </li>

      {/*
        * §2 · O APOIO É APOIO, E A TELA DIZ ISSO.
        *
        * Listá-lo como "segunda pesquisa" convidaria a operá-lo sozinho — que é
        * o fluxo duplo que o 1.1 fechou. Ele acontece no mesmo clique, no
        * servidor, e aqui só relata o desfecho.
        */}
      {apoio && <li className="text-sm" data-testid="radar-amazon-package-support">
        <span className="font-semibold text-foreground">
          Apoio · Google ({RADAR_RESEARCH_SOURCE_ROLE_LABELS[apoio.role]})
        </span>
        {" — "}
        {apoio.status === "COLLECTED"
          ? <span className="text-positive" data-testid="radar-amazon-support-ok">✓ coletado automaticamente</span>
          : <span className="text-warning" data-testid="radar-amazon-support-failed">
            {apoio.failureReason || "não foi coletado"}
          </span>}
        {apoio.status !== "COLLECTED" && <button
          type="button"
          className={`${button} ml-2`}
          disabled={busy}
          onClick={() => onRetrySupport?.()}
          data-testid="radar-amazon-retry-support"
        >Tentar novamente apoio Google</button>}
      </li>}
    </ul>
  </section>;
}

export function RadarAmazonSearchPanel({ run, plannedQueries, busy, blockedReason, pacote, projecao, blueprintView, editorialModel, evidenceExtras, targetSetup, counts, frozen, sampleSummary, provenanceSummary, lazySample, lazyProvenance, onLoadSample, onLoadProvenance, onStart, onRetrySupport, onAnalyze, onFinalize, onReset }: RadarAmazonSearchPanelProps) {
  const finalizada = projecao.state === "FINALIZED";
  /*
   * A CORRIDA EFETIVA — a do payload quando ela veio, a buscada quando não.
   *
   * Antes do freeze `run` está presente: o universo é a superfície de
   * trabalho. Depois dele a corrida sai da cópia de leitura, e o que
   * preenche a amostra é o que o disclosure buscou.
   */
  const corridaEfetiva = run || lazySample?.run || null;
  const leitura = buildRadarAmazonObservedView(corridaEfetiva);

  /*
   * §5 · A LEITURA TÉCNICA — do payload quando a corrida veio, buscada quando não.
   *
   * Ela existe para CONFERÊNCIA; quem opera não decide nada olhando para
   * `run-amz-1`. Transportá-la na primeira pintura é pagar rede por um dado
   * que quase ninguém abre.
   */
  const tecnico = lazyProvenance?.data || (run ? {
    profile: "AMAZON" as const,
    runId: run.runId, runVersion: run.runVersion,
    fingerprint: run.fingerprint.signature,
    provider: run.provenance.provider, endpoint: run.provenance.endpoint,
    languageCode: run.provenance.languageCode, collectedAt: run.provenance.collectedAt,
    frozenAt: frozen?.finalizedAt ?? null,
    supportSnapshotId: pacote?.supportResearch?.snapshotId ?? null,
    limitations: run.limitations,
  } : null);

  /*
   * ============ §5 e §31 · OS CARDS SAEM DO BLUEPRINT, QUANDO ELE EXISTE ============
   *
   * Antes da análise não há recomendação nenhuma, e os cards descrevem a coleta.
   * Depois dela, contar a corrida de novo ao lado do blueprint gravado abriria
   * duas contagens da mesma pesquisa — e elas divergiriam na primeira melhoria
   * de qualquer uma das duas.
   */
  const analisado = blueprintView.blueprint?.profile === "AMAZON" ? blueprintView.blueprint : null;
  const cards = analisado ? buildRadarAmazonBlueprintCards(analisado) : leitura?.cards || [];

  /*
   * §20 · UMA NOTIFICAÇÃO FINAL, E ELA VEM DO PACOTE.
   *
   * O resumo da corrida e o do pacote contariam a mesma coleta com números
   * diferentes — a corrida conta itens de página, o pacote conta produtos.
   */
  const resumo = pacote ? radarPackageHeadline(pacote) : null;

  return <section className="mt-3 space-y-3" aria-label="Pesquisa Amazon" data-testid="radar-amazon-search">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-text-muted" data-testid="radar-amazon-summary">
        {/* §27 · finalizada, quem conta é a fotografia — nunca a corrida viva. */}
        {finalizada ? projecao.headline : resumo || projecao.headline || `Nenhuma coleta ainda · ${plannedQueries} consulta(s) planejada(s)`}
      </p>

      {/*
        * ====== §8 e §31 · A CONFIGURAÇÃO VEM ANTES DA COLETA ======
        *
        * Ela só aparece enquanto há coleta a fazer. Depois do START, a pergunta
        * "o que vamos investigar?" já foi respondida e gravada — mantê-la aberta
        * convidaria a mudar o alvo de uma investigação que já foi paga.
        */}
      {targetSetup && !finalizada && projecao.canStart && projecao.state !== "READY" && targetSetup}

      <div className="flex flex-wrap gap-2">
        {/*
          * ====== §27 · DEPOIS DO FREEZE NÃO HÁ AÇÃO NORMAL QUE O SUBSTITUA ======
          *
          * Some START, some [Analisar], some [Nova coleta] e não existe
          * [Refinalizar]: cada um deles ofereceria, como ação corriqueira,
          * reescrever o que "congelado" promete não reescrever.
          *
          * Reabrir continua possível — e é o que parece: uma ação com
          * consequência declarada.
          */}
        {!finalizada && projecao.canStart && projecao.state !== "READY" && <button
          type="button"
          className={primary}
          disabled={busy || Boolean(blockedReason) || plannedQueries === 0}
          onClick={() => onStart?.()}
          data-testid="radar-amazon-start"
        >{busy ? "Coletando…" : projecao.state === "FAILED" ? "Tentar novamente Pesquisa Amazon" : "Iniciar Pesquisa Amazon"}</button>}

        {/*
          * §23 · ANALISAR SÓ EXISTE COM PESQUISA PRONTA — e ele não gasta nada.
          *
          * A pré-condição é do read-model, que lê o pacote gravado. A rota
          * confere de novo, sobre o mesmo estado: se as duas discordarem, a de
          * lá vence.
          */}
        {!finalizada && (projecao.state === "READY" || projecao.state === "PARTIAL_SUPPORT_FAILED") && <button
          type="button"
          className={primary}
          disabled={busy}
          onClick={() => onAnalyze?.()}
          data-testid="radar-amazon-analyze"
        /*
         * §16 · O RÓTULO VEM DA PROJEÇÃO, e não daqui.
         *
         * A barra de ação e a tabela precisam dizer a mesma coisa; duas
         * fontes de texto para a mesma decisão divergem na primeira mudança.
         */
        >{busy ? "Analisando…" : projecao.nextAction.label}</button>}

        {/* §24 · FINALIZE só depois de haver blueprint para congelar. */}
        {!finalizada && projecao.state === "READY_TO_FINALIZE" && <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => onFinalize?.()}
          data-testid="radar-amazon-finalize"
        >Finalizar investigação</button>}

        {/*
          * ============ 1.1 · §24 · UMA AÇÃO DE RETRY, E SÓ UMA ============
          *
          * Havia duas: uma na barra de ações e outra dentro do card do pacote,
          * ao lado da linha que explica o que falhou. As duas chamavam o mesmo
          * handler, e a tela parecia oferecer duas coisas diferentes.
          *
          * A que ficou é a do CARD: ela vive ao lado da frase que diz o que
          * aconteceu, e é lá que a pergunta "e agora?" é feita. A da barra
          * competia com START, Analisar e Finalizar sem esse contexto.
          */}

        {/*
          * §27 · [VER BLUEPRINT] É A AÇÃO PRINCIPAL DEPOIS DO FREEZE.
          *
          * Some o START e sobra o quê? Uma aba finalizada sem ação nenhuma
          * parece uma aba morta. O que a pessoa vem fazer aqui depois de
          * congelar é LER a recomendação.
          */}
        {projecao.showBlueprint && <button
          type="button"
          className={primary}
          onClick={() => document.querySelector('[data-testid="radar-competitive-blueprint"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
          data-testid="radar-amazon-view-blueprint"
        >Ver blueprint</button>}

        {run && <button type="button" className={button} disabled={busy} onClick={() => onReset?.()} data-testid="radar-amazon-reset">
          {finalizada ? "Reabrir / zerar investigação" : "Zerar pesquisa Amazon"}
        </button>}
      </div>
    </div>

    {/*
      * §27 · O QUE SUBSTITUI OS BOTÕES: o estado, dito.
      *
      * Some a ação e fica a informação — e a consequência de reabrir vem ANTES
      * do clique, não depois, num aviso de sucesso.
      */}
    {finalizada && <div className="rounded-md border border-positive/30 bg-positive-soft/10 p-2" data-testid="radar-amazon-finalized">
      <p className="text-sm text-positive" role="status">
        Investigação finalizada. Uma coleta nova exige reabrir antes — a fotografia não é substituída em silêncio.
      </p>
      <p className="mt-1 text-sm text-text-muted" data-testid="radar-amazon-reopen-consequence">
        Reabrir tira do corrente esta fotografia e a pesquisa paga que a sustenta. Uma coleta nova custa outra chamada à Amazon.
      </p>
    </div>}

    {blockedReason && !finalizada && <p className="text-sm text-warning" role="status" data-testid="radar-amazon-blocked">{blockedReason}</p>}

    {projecao.profileLocked && <p className="text-sm text-text-muted" role="status" data-testid="radar-amazon-locked">{projecao.lockReason}</p>}

    {pacote && !finalizada && <PacoteDaPesquisa pacote={pacote} busy={busy} counts={counts} onRetrySupport={onRetrySupport} />}

    {run?.state === "COLLECTING" && <p className="text-sm text-text-muted" role="status" data-testid="radar-amazon-collecting">
      Coleta em andamento. Os produtos aparecem quando a consulta responder.
    </p>}

    {run?.state === "COLLECTION_FAILED" && <p className="text-sm text-warning" role="alert" data-testid="radar-amazon-failed">
      A coleta não conseguiu perguntar à Amazon. Nada foi cobrado por consulta não respondida.
    </p>}

    {/* ============ 2 · o blueprint, antes da amostra — §28 ============ */}
    {/*
      * ====== PROFILES_2 · §13 · O PRODUTO PRINCIPAL É O MODELO COMERCIAL ======
      *
      * "O que a pesquisa encontrou" continua útil — e continua sendo evidência.
      * O que a pessoa abre a aba para fazer é montar a seção comercial.
      */}
    {editorialModel && <RadarProfileBlueprintSection model={editorialModel} />}

    {/*
      * ============ 1.3 · §2 e §10 · A PORTA ABRE SEMPRE QUE HÁ EVIDÊNCIA ============
      *
      * A condição era só de ANÁLISE. Quando os quatro cards viviam soltos acima,
      * isso não importava — eles apareciam por conta própria. Movidos para cá,
      * herdariam a condição da porta e SUMIRIAM numa coleta ainda não analisada,
      * que é exatamente o estado em que a pessoa mais quer olhar a prateleira.
      *
      * §10 é explícito: nada é removido. A porta passa a existir quando há o que
      * mostrar — análise, cards ou os painéis legados.
      */}
    {(analisado || projecao.state === "READY" || projecao.state === "PARTIAL_SUPPORT_FAILED" || cards.length > 0)
      && <details className="rounded-md border border-divider bg-surface p-3" data-testid="radar-amazon-competitive-evidence">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Ver evidência competitiva</summary>
        <div className="mt-3 space-y-3">
        {/* ============ 1 · os quatro cards — §5 ============ */}
        {cards.length > 0 && <section className="space-y-3" aria-label="O que a pesquisa encontrou" data-testid="radar-amazon-observed">
          <h3 className="text-base font-semibold text-foreground">O que a pesquisa encontrou</h3>
          {!analisado && <p className="text-sm text-text-muted" data-testid="radar-amazon-observed-scope">
            Síntese do que foi observado nesta coleta. A recomendação editorial ainda não foi produzida.
          </p>}

          <div className="grid gap-3 md:grid-cols-2">
            {cards.map(card => <section key={card.id} className={bloco} data-testid={`radar-amazon-card-${card.id.toLowerCase()}`}>
              <h4 className="text-sm font-semibold text-foreground">{card.title}</h4>
              {card.empty
                ? <p className="mt-1 text-sm text-text-muted">{card.empty}</p>
                : <ul className="mt-1 space-y-1">
                  {card.lines.map(linha => <li key={linha} className="text-sm text-text-muted">{linha}</li>)}
                </ul>}

              {/*
                * §5 · OS DOIS LADOS DO CARD, SEPARADOS NA TELA.
                *
                * Uma recomendação nossa impressa no meio das contagens seria lida
                * com o mesmo peso de uma leitura de SERP — e é assim que palpite
                * vira "dado de mercado" três módulos adiante.
                */}
              {card.recommended.length > 0 && <div className="mt-2 border-t border-divider pt-2" data-testid="radar-amazon-card-recommended">
                <p className="text-sm font-semibold text-text-muted">O que recomendamos</p>
                <ul className="mt-1 space-y-1">
                  {card.recommended.map(item => <li key={item.statement} className="text-sm text-foreground">
                    {item.statement}
                    <span className="mt-0.5 block text-text-muted opacity-80">Observado: {item.sourceSignal}</span>
                  </li>)}
                </ul>
              </div>}
            </section>)}
          </div>

          {/*
            * §19 · "BUSCAS RELACIONADAS" — o nome que o dado sustenta.
            *
            * Chamá-las de categoria afirmaria uma taxonomia da loja que ninguém
            * coletou.
            */}
          {leitura && leitura.relatedSearches.length > 0 && <div className={bloco} data-testid="radar-amazon-related-searches">
            <h4 className="text-sm font-semibold text-foreground">Buscas relacionadas</h4>
            <ul className="mt-1 flex flex-wrap gap-1">
              {leitura.relatedSearches.map(termo => <li key={termo} className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted">{termo}</li>)}
            </ul>
          </div>}
        </section>}
          <RadarCompetitiveBlueprintSection view={blueprintView} />
          {/* 2.1 · §25 · os painéis de consulta legados entram aqui, como no YouTube. */}
          {evidenceExtras}
        </div>
      </details>}

    {/*
      * ============ 3 · a amostra, recolhida e BUSCADA — 2.1 · §4 e §11 ============
      *
      * Um card por ASIN, com os placements dentro dele. Abrir faz uma leitura
      * remota da coleta que JÁ está gravada — PROVIDER_CALLS = 0: a coleta foi
      * paga uma vez, e um clique de curiosidade não pode cobrá-la de novo.
      *
      * O rótulo vem do resumo, não do conteúdo: é ele que permite dizer
      * "51 produtos" sem ter transportado 51 produtos.
      */}
    {/*
      * ============ 1.3 · §8 · O UNIVERSO OBSERVADO NASCE FECHADO ============
      *
      * Ele abria sozinho antes da análise, herdando a regra do YouTube — onde os
      * vídeos SÃO o trabalho, porque é neles que se cura. Na Amazon não há
      * curadoria por produto: a amostra é leitura, e 59 cards abertos empurram
      * o blueprint para fora da tela.
      *
      * O rótulo continua dizendo quantos são, e abrir mostra exatamente a mesma
      * amostra. Recolher não é esconder.
      */}
    {(leitura || sampleSummary?.available) && <details
      className="rounded-md border border-divider p-2"
      onToggle={evento => {
        /* Só o PRIMEIRO clique busca. Fechar e reabrir lê o que já chegou. */
        if (!(evento.currentTarget as HTMLDetailsElement).open) return;
        if (leitura || lazySample?.state !== "IDLE") return;
        onLoadSample?.();
      }}
      data-testid="radar-amazon-sample"
    >
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {leitura ? leitura.sample.label : (counts ? `Universo observado na Amazon · ${counts.observed} resultado(s)` : `Ver amostra competitiva · ${sampleSummary?.count ?? 0} ${sampleSummary?.unit ?? "produto(s)"}`)}
      </summary>

      {/*
        * §11 · ENQUANTO FECHADO NÃO HÁ SPINNER. Ao abrir pela primeira vez, sim.
        *
        * E a falha de leitura NÃO toca o estado FINALIZED: a fotografia continua
        * válida e o Blueprint continua legível acima. O que falhou foi a consulta.
        */}
      {!leitura && lazySample?.state === "LOADING" && <p className="mt-2 text-sm text-text-muted" role="status" data-testid="radar-amazon-sample-loading">
        Carregando amostra…
      </p>}
      {!leitura && lazySample?.state === "FAILED" && <div className="mt-2" data-testid="radar-amazon-sample-failed">
        <p className="text-sm text-warning" role="status">{lazySample.message || "Não foi possível carregar a amostra."}</p>
        <button type="button" className={`${button} mt-1`} onClick={() => onLoadSample?.()} data-testid="radar-amazon-sample-retry">Tentar novamente</button>
      </div>}

      {leitura && <ul className="mt-2 space-y-2">
        {leitura.sample.products.map(produto => <li key={produto.asin} className={bloco} data-testid="radar-amazon-product">
          <div className="flex items-start gap-3">
            {produto.imageUrl && <img className="h-16 w-16 shrink-0 rounded-md border border-divider object-contain" src={produto.imageUrl} alt="" loading="lazy" />}
            <div className="min-w-0">
              <a className="text-sm text-foreground underline-offset-2 hover:underline" href={produto.url} target="_blank" rel="noreferrer">{produto.title}</a>
              <p className="mt-1 text-sm text-text-muted" data-testid="radar-amazon-product-placement">{produto.placementLine}</p>
              <p className="mt-1 text-sm text-text-muted">
                {[produto.priceLine, produto.ratingLine, produto.purchaseLine].filter(Boolean).join(" · ") || "sem preço ou avaliação na listagem"}
              </p>
              {produto.badges.length > 0 && <ul className="mt-1 flex flex-wrap gap-1" data-testid="radar-amazon-product-badges">
                {produto.badges.map(selo => <li key={selo} className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted">{selo}</li>)}
              </ul>}
              {produto.offerText.length > 0 && <p className="mt-1 text-sm text-text-muted">{produto.offerText.join(" · ")}</p>}
            </div>
          </div>
        </li>)}
      </ul>}
    </details>}

    {/*
      * ============ 4 · a proveniência, recolhida — §30 ============
      *
      * Os ids técnicos moram aqui e em nenhum outro lugar da visão normal. Eles
      * existem para conferência; competir com a leitura não é função deles.
      */}
    {(run || provenanceSummary?.available) && <details
      className="rounded-md border border-divider p-2"
      onToggle={evento => {
        if (!(evento.currentTarget as HTMLDetailsElement).open) return;
        if (tecnico || lazyProvenance?.state !== "IDLE") return;
        onLoadProvenance?.();
      }}
      data-testid="radar-amazon-provenance"
    >
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Proveniência e detalhes técnicos</summary>

      {!tecnico && lazyProvenance?.state === "LOADING" && <p className="mt-2 text-sm text-text-muted" role="status" data-testid="radar-amazon-provenance-loading">
        Carregando proveniência…
      </p>}
      {!tecnico && lazyProvenance?.state === "FAILED" && <div className="mt-2" data-testid="radar-amazon-provenance-failed">
        <p className="text-sm text-warning" role="status">{lazyProvenance.message || "Não foi possível carregar a proveniência."}</p>
        <button type="button" className={`${button} mt-1`} onClick={() => onLoadProvenance?.()} data-testid="radar-amazon-provenance-retry">Tentar novamente</button>
      </div>}

      {tecnico && <dl className="mt-2 grid gap-1 text-sm text-text-muted sm:grid-cols-2">
        <div><dt className="inline font-semibold">Coleta: </dt><dd className="inline">{tecnico.runId} (v{tecnico.runVersion ?? "?"})</dd></div>
        <div><dt className="inline font-semibold">Assinatura: </dt><dd className="inline">{tecnico.fingerprint || "não informada"}</dd></div>
        <div><dt className="inline font-semibold">Provider: </dt><dd className="inline">{tecnico.provider} · {tecnico.endpoint}</dd></div>
        {/* §13 do gate anterior · a grafia REALMENTE enviada, não a canônica. */}
        <div><dt className="inline font-semibold">Locale enviado: </dt><dd className="inline">{tecnico.languageCode || "não informado"}</dd></div>
        <div><dt className="inline font-semibold">Capturado em: </dt><dd className="inline">{tecnico.collectedAt}</dd></div>
        {tecnico.supportSnapshotId && <div>
          <dt className="inline font-semibold">Snapshot do apoio: </dt><dd className="inline">{tecnico.supportSnapshotId}</dd>
        </div>}
        {tecnico.frozenAt && <div>
          <dt className="inline font-semibold">Congelado em: </dt><dd className="inline">{tecnico.frozenAt}</dd>
        </div>}
      </dl>}
      {/*
        * §24 do 2.0 · AS LIMITAÇÕES TÉCNICAS ATRAVESSAM O LAZY.
        *
        * Elas vêm da leitura técnica, que responde com ou sem a corrida ao lado.
        * Perdê-las na compactação seria trocar transporte por semântica.
        */}
      {tecnico && tecnico.limitations.length > 0 && <ul className="mt-2 space-y-1" data-testid="radar-amazon-run-limitations">
        {tecnico.limitations.map(limite => <li key={limite} className="text-sm text-text-muted">{limite}</li>)}
      </ul>}
    </details>}
  </section>;
}
