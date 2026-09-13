"use client";

import { buildRadarResearchDetails, type RadarResearchDetailsView } from "@/lib/radar/operational-view";
import type { RadarDeepResearchView } from "@/lib/radar/deep-research-view";
import type { RadarR3Model } from "@/lib/radar/r3-workbench";

/**
 * OS DETALHES DA PESQUISA — LEITURA, E SOMENTE LEITURA.
 *
 * O que existia aqui antes não era um painel de consulta: era o workflow
 * inteiro da SERP antiga, guardado atrás de um expansível. Coleta,
 * Concorrentes, Análise, Evidências, Revisão e Histórico continuavam sendo
 * ABAS DE PROCESSO, com Aprovar SERP, Rejeitar SERP, Continuar para Análise,
 * Analisar páginas pendentes, checkboxes de curadoria e classificadores
 * manuais funcionando. Esconder não é substituir: eram duas autoridades de
 * workflow na mesma tela, e a antiga tinha mais botões que a nova.
 *
 * A GARANTIA É ESTRUTURAL, NÃO VISUAL.
 *
 * Este componente não recebe NENHUM handler. Não há prop para aprovar, para
 * rejeitar, para reclassificar, para confirmar curadoria nem para analisar
 * pendentes — então não existe caminho pelo qual um controle destes volte a
 * aparecer aqui por descuido. `display:none` some com o botão; uma superfície
 * sem handler não tem o que ligar.
 *
 * A única autoridade de operação da Fase 1 continua sendo START → ANALYZE →
 * FINALIZE, com RESET como saída explícita — e ela vive no painel da
 * investigação, não aqui.
 *
 * NADA FOI APAGADO. Concorrentes, páginas analisadas, evidências e histórico
 * continuam inteiros; muda o caminho até eles, não a existência deles.
 */

const secao = "rounded-md border border-divider bg-surface p-3";
const bloco = "rounded-md border border-divider bg-surface-subtle p-3";

function Meta({ label, value }: { label: string; value: string | number }) {
  return <div>
    <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
    <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</dd>
  </div>;
}

/** Uma seção de consulta: título, contagem e o conteúdo atrás de um clique. */
function Consulta({ testId, title, count, empty, children }: {
  testId: string; title: string; count: number; empty: string; children: React.ReactNode;
}) {
  return <details className={secao} data-testid={testId}>
    <summary className="cursor-pointer text-sm font-semibold text-foreground">
      {title} <span className="font-normal text-text-muted">({count})</span>
    </summary>
    <div className="mt-3">{count ? children : <p className="text-sm leading-6 text-text-muted">{empty}</p>}</div>
  </details>;
}

export function RadarR3ResearchDetails({ model, view }: { model: RadarR3Model; view: RadarDeepResearchView }) {
  /*
   * NADA É RECALCULADO AQUI.
   *
   * A projeção inteira vem do domínio: qual é o estado, de onde vêm os números
   * (congelado ou vivo), quem são os concorrentes, o que falhou e por quê. A
   * tela escolhe hierarquia e tipografia — não conclusão.
   */
  const detalhes: RadarResearchDetailsView = buildRadarResearchDetails({
    view,
    extractionFailures: model.serp.analysis?.payload.extractionFailures || [],
    collections: model.serp.records.map(item => ({
      id: item.id, provider: item.provider, status: item.status, origin: item.origin, error: item.error,
    })),
  });

  return <section className="space-y-2.5" aria-label="Detalhes da pesquisa" data-testid="radar-research-details" data-source={detalhes.source}>
    {/*
      * §4 — A COLETA NÃO PRECISA DE ABA.
      *
      * O que a coleta produziu de útil são números: quantas consultas, quantas
      * canônicas, quantas auxiliares, quantas referências. Isso cabe em uma
      * linha de leitura. O resto era controle.
      */}
    <div className={bloco} data-testid="radar-research-details-collection">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">O que esta pesquisa reuniu</h3>
        <span className="text-sm text-text-muted" data-testid="radar-research-details-status">{detalhes.statusLabel}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        <Meta label="Modo" value={detalhes.collection.modeLabel} />
        <Meta label="Consultas" value={detalhes.collection.queriesExecuted} />
        <Meta label="Canônicas" value={detalhes.collection.canonicalQueries} />
        <Meta label="Auxiliares" value={detalhes.collection.auxiliaryQueries} />
        <Meta label="Referências" value={detalhes.collection.uniqueReferences} />
        <Meta label="Na amostra" value={detalhes.collection.selectedReferences} />
      </dl>
      {detalhes.frozen && <p className="mt-2 text-sm leading-6 text-text-muted" data-testid="radar-research-details-frozen-note">
        Estes números são os do pacote congelado {detalhes.frozen.bundleId} · hash {detalhes.frozen.bundleHash}. Eles não mudam mais.
      </p>}
    </div>

    {/*
      * §5 e §6 — CONCORRENTES COMO INFORMAÇÃO.
      *
      * A lista continua inteira: título, domínio, de que consulta veio, que
      * papel a curadoria automática observou e por quê, como terminou a
      * leitura da página, e o motivo quando ela não entra no benchmark.
      *
      * O que sai são os controles. A curadoria por evidência já decidiu no
      * pipeline; oferecer Concorrente/Apoio/Formato/Ignorar aqui pediria que a
      * pessoa refizesse à mão a mesma decisão, com menos informação do que o
      * pipeline tinha. Override humano, se um dia existir, é contrato da Fase
      * 2 — não um botão herdado.
      */}
    <Consulta testId="radar-research-details-competitors" title="Concorrentes e referências" count={detalhes.competitors.length}
      empty="Esta rodada não registrou referências.">
      <div className="overflow-x-auto rounded-md border border-divider">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">Referências encontradas pela investigação, com papel observado e estado da leitura</caption>
          <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th scope="col" className="min-w-64 px-3 py-2">Página</th>
              <th scope="col" className="w-48 px-3 py-2">Papel observado</th>
              <th scope="col" className="w-40 px-3 py-2">Origem</th>
              <th scope="col" className="w-40 px-3 py-2">Leitura</th>
            </tr>
          </thead>
          <tbody>
            {detalhes.competitors.map(item => <tr key={item.referenceId || item.url} className="border-t border-divider align-top first:border-t-0" data-testid="radar-research-details-competitor">
              <td className="px-3 py-2">
                <a className="font-medium text-foreground underline decoration-divider underline-offset-2 hover:text-context-accent" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                <span className="mt-0.5 block break-all text-xs text-text-muted">{item.domain}</span>
              </td>
              <td className="px-3 py-2">
                <span className="text-foreground">{item.roleLabel}</span>
                {item.roleReason && <span className="mt-0.5 block text-xs leading-5 text-text-muted">{item.roleReason}</span>}
              </td>
              <td className="px-3 py-2 text-text-muted">
                {item.originLabel}
                {item.queries.length > 0 && <span className="mt-0.5 block text-xs leading-5">{item.queries.join(" · ")}</span>}
              </td>
              <td className="px-3 py-2 text-text-muted">
                {item.extractionLabel}
                {item.notComparableReason && <span className="mt-0.5 block text-xs leading-5">{item.notComparableReason}</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Consulta>

    {/*
      * §8 — FALHA É LIMITAÇÃO, NÃO FILA DE TRABALHO.
      *
      * "2 páginas não puderam ser analisadas" é uma frase que termina em si
      * mesma. "Analisar páginas pendentes" era a mesma informação convertida
      * em convite para reabrir uma rodada encerrada.
      */}
    <Consulta testId="radar-research-details-pages" title="Páginas analisadas" count={detalhes.pages.analyzed}
      empty="Nenhuma página foi lida nesta rodada.">
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Meta label="Lidas com sucesso" value={detalhes.pages.analyzed} />
        <Meta label="Comparáveis" value={detalhes.pages.comparable} />
        <Meta label="Não analisadas" value={detalhes.pages.failed} />
      </dl>
      {detalhes.pages.failureHeadline && <div className="mt-3" data-testid="radar-research-details-failures">
        <p className="text-sm leading-6 text-foreground">{detalhes.pages.failureHeadline}</p>
        {detalhes.pages.failures.length > 0 && <details className="mt-1">
          <summary className="cursor-pointer text-sm text-context-accent">Ver detalhes</summary>
          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-text-muted">
            {detalhes.pages.failures.map(item => <li key={item.id} className="break-all">{item.url} — {item.reason}</li>)}
          </ul>
        </details>}
      </div>}
    </Consulta>

    {/*
      * §9 — EVIDÊNCIAS COMO LEITURA DA AUTORIDADE CONSOLIDADA.
      *
      * Sem os avisos de arquitetura que ocupavam o topo desta seção: que a
      * visão não cria persistência, que ExternalEvidence não nasce aqui, que
      * as camadas permanecem separadas. Tudo verdadeiro, tudo documentação.
      */}
    <Consulta testId="radar-research-details-evidence" title="Evidências"
      count={detalhes.evidence.sources.length + detalhes.evidence.factual.length + detalhes.evidence.observations.length}
      empty="A investigação ainda não consolidou evidências.">
      <div className="grid gap-2.5 md:grid-cols-2">
        <div className={bloco}>
          <h4 className="text-sm font-semibold text-foreground">Fontes verificadas</h4>
          {detalhes.evidence.sources.length
            ? <ul className="mt-1.5 space-y-1 text-sm leading-6 text-foreground">
              {detalhes.evidence.sources.map(item => <li key={item.id}>
                {item.domain} — {item.typeLabel}
                <span className="text-text-muted">{item.verified ? " · conteúdo verificado" : " · classificada pela URL"}</span>
              </li>)}
            </ul>
            : <p className="mt-1 text-sm text-text-muted">Nenhuma fonte citada foi verificada nesta rodada.</p>}
        </div>
        <div className={bloco}>
          <h4 className="text-sm font-semibold text-foreground">Evidência factual</h4>
          {detalhes.evidence.factual.length
            ? <ul className="mt-1.5 space-y-1 text-sm leading-6 text-foreground">
              {detalhes.evidence.factual.map(item => <li key={item.id}>{item.claim} — {item.sourceDomain} · {item.supportLabel}</li>)}
            </ul>
            : <p className="mt-1 text-sm text-text-muted">Nenhuma afirmação foi sustentada por fonte verificada.</p>}
        </div>
        <div className={bloco}>
          <h4 className="text-sm font-semibold text-foreground">Observações da SERP</h4>
          <ul className="mt-1.5 space-y-1 text-sm leading-6 text-foreground">
            {detalhes.evidence.observations.map(item => <li key={item.id}>{item.text}</li>)}
          </ul>
        </div>
        <div className={bloco}>
          <h4 className="text-sm font-semibold text-foreground">Conflitos, necessidades e limitações</h4>
          {detalhes.evidence.conflicts.map(item => <p key={item.id} className="mt-1 text-sm leading-6 text-warning">Conflito: {item.text}</p>)}
          {detalhes.evidence.needs.map(item => <p key={item.id} className="mt-1 text-sm leading-6 text-foreground">Necessidade: {item.text}</p>)}
          {detalhes.evidence.limitations.map(item => <p key={item.id} className="mt-1 text-sm leading-6 text-text-muted">Limitação: {item.text}</p>)}
          {!detalhes.evidence.conflicts.length && !detalhes.evidence.needs.length && !detalhes.evidence.limitations.length
            && <p className="mt-1 text-sm text-text-muted">Nada registrado nesta rodada.</p>}
        </div>
      </div>
    </Consulta>

    {/* §12 — HISTÓRICO READ-ONLY: o que aconteceu, quando, com que resultado. */}
    <Consulta testId="radar-research-details-history" title="Histórico" count={detalhes.history.length}
      empty="Nenhum evento registrado para este artigo.">
      <ul className="space-y-1.5">
        {detalhes.history.map(item => <li key={item.id} className={bloco}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{item.label}</span>
            {item.at && <span className="text-xs text-text-muted">{item.at.slice(0, 16).replace("T", " ")}</span>}
          </div>
          <p className="mt-0.5 break-words text-sm leading-6 text-text-muted">{item.detail}</p>
        </li>)}
      </ul>
    </Consulta>
  </section>;
}
