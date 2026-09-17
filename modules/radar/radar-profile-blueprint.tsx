"use client";

import type {
  RadarEditorialProfileDerived,
  RadarEditorialProfileModel,
  RadarEditorialProfileBlock,
} from "@/lib/radar/editorial-profile-model";

/**
 * ===== A CASCA EDITORIAL DOS PERFIS — PROFILES_2 · §2, §12 e §19 =====
 *
 * ==================== UMA CASCA, TRÊS PRODUTOS ====================
 *
 * O Google fechou o formato: briefing aberto por padrão, evidência, amostra e
 * proveniência recolhidas, e nada além disso competindo por atenção. Este
 * componente é a mesma casca para o roteiro-modelo e para o modelo comercial.
 *
 * A FORMA muda — o vídeo tem gancho e Shorts, o comercial tem critérios e
 * faixas — e a GRAMÁTICA não: título de trabalho, promessa, blocos com o que
 * cobrir, selos acionáveis, e o resto atrás de um clique.
 *
 * Três componentes diferentes para a mesma leitura divergiriam na primeira
 * correção feita só num deles — foi assim que o Radar chegou a ter quatro
 * superfícies discordando sobre a mesma investigação.
 */

const cartao = "rounded-md border border-divider bg-surface p-3";
const interno = "rounded-md border border-divider bg-surface-subtle p-2.5";

function Selo({ tom, children }: { tom: "ok" | "atencao" | "neutro"; children: React.ReactNode }) {
  const cor = tom === "ok" ? "border-success/40 text-success"
    : tom === "atencao" ? "border-warning/50 text-warning"
      : "border-divider text-text-muted";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cor}`}>{children}</span>;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div>
    <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm leading-6 text-foreground">{children}</dd>
  </div>;
}

/**
 * §9 e §23 · O BLOCO MOSTRA O QUE PRODUZIR — e o sinal que o sustenta fica
 * atrás do clique, junto do resto da telemetria.
 */
function Bloco({ bloco }: { bloco: RadarEditorialProfileBlock }) {
  return <li className={cartao} data-testid="radar-profile-block">
    <h4 className="text-sm font-semibold text-foreground">
      <span className="mr-2 text-text-muted">{bloco.order}</span>
      {bloco.heading}
    </h4>

    <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="radar-profile-block-objective">{bloco.objective}</p>

    {bloco.coveragePoints.length > 0 && <div className="mt-2" data-testid="radar-profile-block-coverage">
      <p className="text-xs uppercase tracking-wide text-text-muted">Cobrir</p>
      <ul className="mt-0.5 space-y-0.5 text-sm leading-6 text-foreground">
        {bloco.coveragePoints.map(ponto => <li key={ponto}>— {ponto}</li>)}
      </ul>
    </div>}

    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="radar-profile-block-badges">
      {bloco.evidenceStrength === "STRONG" && <Selo tom="ok">✓ Forte sinal competitivo</Selo>}
      {bloco.evidenceStrength === "MODERATE" && <Selo tom="neutro">Apoio limitado</Selo>}
      {bloco.sourceNeeded && <Selo tom="atencao">⚠ Precisa de fonte</Selo>}
      {bloco.specialistRequired && <Selo tom="atencao">⚠ Revisão profissional</Selo>}
      {/* §8 · o selo diz que existe exigência; o motivo inteiro fica dentro. */}
      {bloco.mustCoverReasons.length > 0 && <Selo tom="neutro">Exigido pelo ArticleDNA</Selo>}
      {bloco.visualOpportunity && <Selo tom="neutro">Apoio visual</Selo>}
    </div>

    <details className="mt-1.5" data-testid="radar-profile-block-evidence">
      <summary className="cursor-pointer text-sm text-context-accent">Ver evidências</summary>
      <p className="mt-1.5 text-sm leading-6 text-text-muted">{bloco.function}</p>
      <p className="mt-1 text-sm leading-6 text-text-muted">{bloco.sourceSignal}</p>
      {bloco.mustCoverReasons.map(motivo => <p key={motivo} className="mt-1 text-sm leading-6 text-context-accent" data-testid="radar-profile-must-cover">{motivo}</p>)}
      {bloco.sourceNeeded && <p className="mt-1 text-sm leading-6 text-warning">{bloco.sourceNeeded}</p>}
      {bloco.specialistRequired && <p className="mt-1 text-sm leading-6 text-warning">{bloco.specialistRequired}</p>}
    </details>
  </li>;
}

function Derivada({ item }: { item: RadarEditorialProfileDerived }) {
  return <li className={interno} data-testid="radar-profile-derived">
    <p className="text-sm font-medium text-foreground">{item.label}</p>
    <p className="mt-0.5 text-sm leading-6 text-text-muted">{item.detail}</p>
  </li>;
}

export function RadarProfileBlueprintSection({ model }: { model: RadarEditorialProfileModel }) {
  const titulo = model.kind === "VIDEO" ? "Blueprint audiovisual" : "Blueprint comercial";
  const subtitulo = model.kind === "VIDEO" ? "Roteiro-modelo competitivo" : "Modelo comercial competitivo";
  const rotuloDaPromessa = model.kind === "VIDEO" ? "Promessa ao espectador" : "Promessa ao comprador";
  const rotuloDaEstrutura = model.kind === "VIDEO" ? "Estrutura do vídeo" : "Estrutura comercial";

  return <section className="rounded-md border border-context-accent/40 bg-surface-subtle p-3" data-testid="radar-profile-blueprint">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
        <p className="text-sm text-text-muted">{subtitulo}</p>
      </div>
      {/* §24 · "Parcial" sempre com o que falta ao lado. */}
      <span
        className={`text-sm ${model.readiness.state === "READY" ? "text-success" : "text-warning"}`}
        data-testid="radar-profile-readiness"
      >{model.readiness.label}</span>
    </div>

    <dl className="mt-3 grid gap-2.5 md:grid-cols-3" data-testid="radar-profile-executive">
      <Campo label="Saída recomendada">{model.editorialOutput}</Campo>
      <Campo label="Título sugerido">{model.workingTitle}</Campo>
      <Campo label={rotuloDaPromessa}>{model.promise}</Campo>
    </dl>

    {model.alternateTitleDirections.length > 0 && <p className="mt-1.5 text-sm leading-6 text-text-muted" data-testid="radar-profile-title-alternatives">
      Outras direções: {model.alternateTitleDirections.join(" · ")}
    </p>}

    {/* §6 · o gancho existe onde o formato tem gancho, e nunca é inventado. */}
    {model.hook && <div className={`mt-3 ${cartao}`} data-testid="radar-profile-hook">
      <h4 className="text-sm font-semibold text-foreground">Hook</h4>
      <p className="mt-1 text-sm leading-6 text-foreground">{model.hook}</p>
    </div>}

    {model.blocks.length > 0 && <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{rotuloDaEstrutura}</p>
      <ul className="mt-1.5 space-y-2.5" data-testid="radar-profile-blocks">
        {model.blocks.map(bloco => <Bloco key={bloco.id} bloco={bloco} />)}
      </ul>
    </div>}

    {(model.conclusion || model.cta) && <div className={`mt-3 ${cartao}`} data-testid="radar-profile-closing">
      <h4 className="text-sm font-semibold text-foreground">Fechamento</h4>
      <dl className="mt-1.5 grid gap-1.5 md:grid-cols-2">
        {model.conclusion && <Campo label="Conclusão">{model.conclusion}</Campo>}
        {model.cta && <Campo label="CTA">{model.cta}</Campo>}
      </dl>
    </div>}

    {model.derived.length > 0 && <details className="mt-3" data-testid="radar-profile-derived-list">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {model.derivedLabel} · {model.derived.length}
      </summary>
      <ul className="mt-2 space-y-2">{model.derived.map(item => <Derivada key={item.id} item={item} />)}</ul>
    </details>}

    {model.articleApplication.length > 0 && <details className="mt-3" data-testid="radar-profile-article-application">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Aplicação no artigo · {model.articleApplication.length}
      </summary>
      <ul className="mt-2 space-y-2">
        {model.articleApplication.map((item, indice) => <li key={`${item.piece}-${indice}`} className={interno}>
          <dl className="grid gap-1.5 sm:grid-cols-3">
            <Campo label="Peça">{item.piece}</Campo>
            <Campo label="Onde">{item.placement}</Campo>
            <Campo label="Função">{item.role}</Campo>
          </dl>
        </li>)}
      </ul>
    </details>}

    {/*
      * ===== 1.2 · §4 e §5 · A SHORTLIST NÃO FINGE SER MAIOR =====
      *
      * Um "Top 10" com 4 compatíveis continua sendo um artigo possível — com 4.
      * O que não pode acontecer é a tela apresentá-lo como se os 10 existissem.
      *
      * Com ZERO, não há ranking a construir, e o caminho não é seguir: é
      * corrigir o alvo. O aviso diz o que fazer, e não só o que falta.
      */}
    {model.shortlistStatus.state !== "OK" && <div
      className={`mt-3 rounded-md border p-2 ${model.shortlistStatus.state === "BLOCKED" ? "border-warning/40 bg-warning-soft/10" : "border-divider"}`}
      role="status"
      data-testid="radar-profile-shortlist-status"
      data-state={model.shortlistStatus.state}
    >
      <p className="text-sm font-semibold text-warning">{model.shortlistStatus.message}</p>
      {model.shortlistStatus.fixHint && <p className="mt-1 text-sm text-text-muted" data-testid="radar-profile-shortlist-fix">
        {model.shortlistStatus.fixHint}
      </p>}
    </div>}

    {/*
      * §10 · OS CRITÉRIOS SÃO AS COLUNAS DA COMPARAÇÃO.
      *
      * Eles descrevem a tabela, e não as seções do texto. Como cabeçalho,
      * viravam "Incluir a coluna Faixa de preço na comparação" no lugar de um H2.
      */}
    {model.comparisonCriteria.length > 0 && <div className="mt-3" data-testid="radar-profile-comparison-criteria">
      <p className="text-xs uppercase tracking-wide text-text-muted">Critérios da comparação</p>
      <p className="mt-0.5 text-sm leading-6 text-text">{model.comparisonCriteria.join(" · ")}</p>
    </div>}

    {/*
      * ===== PROMOTION_LINK_PLAN_1 · §6 · OS LINKS DE PRODUTO =====
      *
      * Uma lista curta e legível: produto, onde entra, e como aplicar. §6 é
      * explícito sobre não mostrar parâmetro técnico — a URL limpa existe no
      * dado e o ASIN é a identidade, mas nenhum dos dois ajuda quem está
      * montando o artigo a decidir onde o link vai.
      */}
    {model.promotionLinks.length > 0 && <div className="mt-3" data-testid="radar-profile-promotion-links">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        Links de produtos · {model.promotionLinks.length}
      </p>
      <ol className="mt-1 space-y-2">
        {model.promotionLinks.map((link, indice) => <li key={link.asin} className="text-sm leading-6 text-text">
          <span className="font-semibold text-foreground">{indice + 1}. {link.suggestedAnchor}</span>
          <span className="mt-0.5 block text-text-muted">Destino: Amazon · {link.placement}</span>
          <span className="block text-text-muted">
            Sugestão: {link.linkFormat === "BUTTON"
              ? `botão "${link.suggestedButtonLabel}"`
              : "nome do produto como âncora"}
          </span>
        </li>)}
      </ol>
      {/*
        * §9 · A EXIGÊNCIA DE DIVULGAÇÃO VIAJA COM O PLANO.
        *
        * O texto do aviso não é escrito aqui, e a posição dele é decisão do
        * Planejador/Redator. O que o Radar declara é que ele será necessário.
        */}
      {model.affiliateDisclosureRequired && <p className="mt-2 text-sm text-text-muted" data-testid="radar-profile-affiliate-disclosure">
        Estes links serão monetizados: o artigo precisa de aviso de afiliado, e a aplicação usa <code>rel=&quot;sponsored nofollow&quot;</code>.
      </p>}
    </div>}

    {model.seoApplication.length > 0 && <details className="mt-3" data-testid="radar-profile-seo">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Aplicação SEO · {model.seoApplication.length}</summary>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted">
        {model.seoApplication.map(item => <li key={item}>— {item}</li>)}
      </ul>
    </details>}

    {/*
      * §15 e §24 · AS LIMITAÇÕES FICAM VISÍVEIS.
      *
      * "Sem texto de avaliação nesta coleta" não é rodapé: é o que impede o
      * Redator de escrever elogio que ninguém disse. Ela sobe para a leitura.
      */}
    {model.limitations.length > 0 && <div className="mt-3" data-testid="radar-profile-limitations">
      <p className="text-xs uppercase tracking-wide text-text-muted">Limitações declaradas</p>
      <ul className="mt-0.5 space-y-0.5 text-sm leading-6 text-warning">
        {model.limitations.map(item => <li key={item}>⚠ {item}</li>)}
      </ul>
    </div>}
  </section>;
}
