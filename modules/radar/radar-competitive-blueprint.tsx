"use client";

import {
  RADAR_EVIDENCE_GRADE_LABELS,
  type RadarArticleApplication,
  type RadarBlueprintRecommendation,
  type RadarObservedSignal,
  type RadarShortPlan,
  type RadarYoutubeCanonicalBlueprint,
  type RadarGoogleBlueprint,
  type RadarAmazonBlueprint,
  type RadarObservedPrice,
  RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS,
  RADAR_AMAZON_ENRICHMENT_GAP_LABELS,
  type RadarSectionDirection,
  type RadarAuthorityNeed,
  type RadarInternalLinkDirection,
} from "@/lib/radar/competitive-blueprint";
import type { RadarCompetitiveBlueprintView } from "@/lib/radar/competitive-blueprint-view";

/**
 * ===== A CASCA VISUAL CANÔNICA — RADAR_BLUEPRINT_CANONICAL_1 · §8 =====
 *
 * Os três perfis usam a MESMA hierarquia: cabeçalho, quatro cards, blueprint,
 * amostra recolhida, proveniência recolhida. Muda a semântica de cada card, não
 * a forma de ler — é isso que faz o Radar parecer uma ferramenta em vez de três.
 *
 * ================== O QUE ESTA TELA DEIXOU DE MOSTRAR ==================
 *
 * A aba de YouTube abria com 38 cards de concorrente, faixas de duração e
 * contagens de padrão. Tudo verdadeiro, e nada respondia "o que eu produzo?".
 * O material editorial — título, gancho, roteiro, Shorts — ficava embaixo de
 * tudo, quando existia.
 *
 * Aqui a ordem é a da decisão: o que a busca mostra, o que recomendamos, e como
 * isso vira artigo. A amostra continua acessível, um clique abaixo.
 *
 * ===================== OBSERVADO E RECOMENDADO — §6 =====================
 *
 * Cada afirmação carrega de onde veio. Uma recomendação nossa com a mesma
 * aparência de uma contagem de SERP é como opinião vira "dado de mercado" três
 * módulos adiante.
 */

const cartao = "rounded-md border border-divider bg-surface p-3";
const rotuloCartao = "text-sm font-semibold uppercase tracking-wide text-foreground";

/** Um sinal observado: a frase, e o que a sustenta. */
function Observado({ sinais, vazio }: { sinais: readonly RadarObservedSignal[]; vazio: string }) {
  if (!sinais.length) return <p className="text-sm text-text-muted">{vazio}</p>;
  return <ul className="space-y-1.5" data-testid="blueprint-observed-list">
    {sinais.map(sinal => <li className="text-sm" key={sinal.id}>
      <span className="text-foreground">{sinal.statement}</span>
      {/*
        * A EVIDÊNCIA ANDA COLADA NA AFIRMAÇÃO.
        *
        * "Os títulos usam rotina" sem "13 de 38" é uma frase que ninguém
        * consegue conferir nem contestar.
        */}
      <span className="mt-0.5 block text-text-muted">{sinal.evidence}</span>
      {sinal.grade !== "OBSERVED_SERP" && <span className="text-text-muted italic"> · {RADAR_EVIDENCE_GRADE_LABELS[sinal.grade]}</span>}
    </li>)}
  </ul>;
}

/** Uma recomendação: o que fazer, para quê, e a partir de quê. */
function Recomendado({ itens, vazio }: { itens: readonly RadarBlueprintRecommendation[]; vazio: string }) {
  if (!itens.length) return <p className="text-sm text-text-muted">{vazio}</p>;
  return <ul className="space-y-2" data-testid="blueprint-recommended-list">
    {itens.map(item => <li className="rounded-md border border-divider p-2" key={item.id}>
      <p className="text-sm text-foreground">{item.statement}</p>
      <p className="mt-1 text-sm text-text-muted">Objetivo: {item.objective}</p>
      {/* §6 · a origem é obrigatória no contrato, e visível aqui. */}
      <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {item.sourceSignal}</p>
    </li>)}
  </ul>;
}

function Cartao({ titulo, testid, children }: { titulo: string; testid: string; children: React.ReactNode }) {
  return <section className={cartao} data-testid={testid}>
    <h4 className={rotuloCartao}>{titulo}</h4>
    <div className="mt-2 space-y-3">{children}</div>
  </section>;
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div>
    <p className="text-sm font-semibold text-text-muted">{titulo}</p>
    <div className="mt-1">{children}</div>
  </div>;
}

/* ===================== §12 · os Shorts recomendados ===================== */

function Shorts({ pecas }: { pecas: readonly RadarShortPlan[] }) {
  if (!pecas.length) {
    /*
     * §12 · SEM SINAL, SEM SHORT — e a ausência é declarada.
     *
     * Uma cota fixa produziria peças sem pergunta para responder, e elas
     * chegariam ao Planejador parecendo iguais às que têm origem.
     */
    return <p className="text-sm text-text-muted">Nenhuma pergunta observada sustenta um Short nesta investigação.</p>;
  }
  return <ul className="space-y-2" data-testid="blueprint-shorts">
    {pecas.map(peca => <li className="rounded-md border border-divider p-2" key={peca.id}>
      <p className="text-sm font-semibold text-foreground">{peca.contentPromise}</p>
      {peca.sourceQuestion && <p className="mt-1 text-sm text-text-muted">Origem: “{peca.sourceQuestion}”</p>}
      <p className="mt-1 text-sm text-foreground">Gancho: {peca.hookDirection}</p>
      <p className="mt-1 text-sm text-text-muted">Ângulo: {peca.suggestedAngle}</p>
      <p className="mt-1 text-sm text-text-muted">CTA: {peca.ctaDirection}</p>
    </li>)}
  </ul>;
}

/* ============== §13 · como a investigação vira artigo ============== */

const PECA_LABEL: Record<RadarArticleApplication["piece"], string> = {
  VIDEO_HERO: "Vídeo principal",
  SHORT: "Short",
  IMAGEM: "Apoio visual",
  GOOGLE_SUPPORT: "Apoio de descoberta (Google)",
};

function Aplicacao({ itens }: { itens: readonly RadarArticleApplication[] }) {
  if (!itens.length) return <p className="text-sm text-text-muted">Sem leitura suficiente para montar o pacote editorial.</p>;
  return <ul className="space-y-2" data-testid="blueprint-article-application">
    {itens.map((item, indice) => <li className="rounded-md border border-divider p-2" key={`${item.piece}:${indice}`}>
      <p className="text-sm font-semibold text-foreground">{PECA_LABEL[item.piece]}</p>
      <p className="mt-1 text-sm text-foreground">{item.placement}</p>
      <p className="mt-1 text-sm text-text-muted">{item.role}</p>
      <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {item.sourceSignal}</p>
    </li>)}
  </ul>;
}

/* ======================= o perfil YouTube — §10-13 ======================= */

function YoutubeBlueprint({ blueprint }: { blueprint: RadarYoutubeCanonicalBlueprint }) {
  const { observed, recommended } = blueprint;

  return <div className="space-y-3">
    {/* ---------------- os 4 cards, na grade canônica ---------------- */}
    <div className="grid gap-3 lg:grid-cols-2" data-testid="radar-blueprint-cards">

      <Cartao titulo="Modelo competitivo" testid="radar-blueprint-card-modelo">
        <p className="text-sm text-foreground">
          {observed.comparableVideos} vídeo(s) comparáveis · {observed.longForm} long-form · {observed.shorts} Short(s)
        </p>
        {observed.durationRange && <p className="text-sm text-text-muted">{observed.durationRange}</p>}
        <p className="text-sm text-text-muted">{observed.sufficiency}</p>
        <Bloco titulo="Canais que repetem">
          <Observado sinais={observed.recurrentChannels} vazio="Nenhum canal aparece mais de uma vez: a disputa está pulverizada."/>
        </Bloco>
        <Bloco titulo="O que a amostra não cobre">
          <Observado sinais={observed.gaps} vazio="Nenhuma lacuna evidente na amostra."/>
        </Bloco>
      </Cartao>

      <Cartao titulo="Títulos e hooks" testid="radar-blueprint-card-titulos">
        <Bloco titulo="O que a busca mostra">
          <Observado sinais={observed.titlePatterns} vazio="Nenhum enquadramento recorrente nos títulos."/>
        </Bloco>
        <Bloco titulo="Direções de título">
          <Recomendado itens={recommended.titleDirections} vazio="Sem amostra suficiente para recomendar direção de título."/>
        </Bloco>
        <Bloco titulo="Gancho recomendado">
          {/*
            * §10 · O GANCHO É RECOMENDAÇÃO, e a tela diz isso.
            *
            * A coleta lê TÍTULO — ela não abre vídeo nenhum. "Os concorrentes
            * abrem assim" seria uma leitura que ninguém fez.
            */}
          {recommended.hookDirection
            ? <Recomendado itens={[recommended.hookDirection]} vazio=""/>
            : <p className="text-sm text-text-muted">Sem sinal suficiente para recomendar um gancho.</p>}
          <p className="mt-1 text-sm text-text-muted italic">
            Direção derivada do que os títulos prometem. Esta pesquisa não abre nem transcreve vídeo: não há gancho observado dentro dos concorrentes.
          </p>
        </Bloco>
      </Cartao>

      <Cartao titulo="Roteiro e comunicação" testid="radar-blueprint-card-roteiro">
        <ol className="space-y-2" data-testid="blueprint-script">
          {recommended.script.map(secao => <li className="rounded-md border border-divider p-2" key={secao.block}>
            <p className="text-sm font-semibold text-foreground">{secao.block}</p>
            <p className="mt-1 text-sm text-text-muted">Objetivo: {secao.objective}</p>
            <p className="mt-1 text-sm text-foreground">{secao.direction}</p>
            <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {secao.sourceSignal}</p>
          </li>)}
        </ol>
        <Bloco titulo="Tom e linguagem">
          <ul className="space-y-1 text-sm text-text-muted" data-testid="blueprint-communication">
            {recommended.tone && <li>{recommended.tone}</li>}
            {recommended.languageDirection && <li>{recommended.languageDirection}</li>}
            {recommended.technicalLevel && <li>{recommended.technicalLevel}</li>}
            {recommended.authorityDirection && <li>{recommended.authorityDirection}</li>}
          </ul>
        </Bloco>
      </Cartao>

      <Cartao titulo="Formatos e distribuição" testid="radar-blueprint-card-formatos">
        <p className="text-sm text-foreground">Formato principal: {recommended.format}</p>
        <Bloco titulo="Shorts recomendados">
          <Shorts pecas={recommended.shorts}/>
        </Bloco>
        <Bloco titulo="O que a busca geral pergunta">
          <Observado sinais={observed.googleSupport} vazio="Sem leitura de apoio do Google nesta investigação."/>
        </Bloco>
      </Cartao>
    </div>

    {/* ---------------- §13 · o pacote editorial ---------------- */}
    <section className={cartao} data-testid="radar-blueprint-application">
      <h4 className={rotuloCartao}>Como reaproveitar no artigo</h4>
      <div className="mt-2"><Aplicacao itens={recommended.articleApplication}/></div>
    </section>
  </div>;
}

/* ======================= o perfil GOOGLE — §6 a §10 ======================= */

/**
 * §7 · UMA SEÇÃO DO ARTIGO, COMO INSTRUÇÃO.
 *
 * "H2: oleosidade" não diz a ninguém o que escrever. O que sai daqui é o que a
 * seção RESOLVE, a pergunta que ela fecha, os conceitos que precisa tocar e a
 * evidência que vai exigir — e o heading é DIREÇÃO, nunca o do concorrente.
 */
function Secoes({ secoes }: { secoes: readonly RadarSectionDirection[] }) {
  if (!secoes.length) return <p className="text-sm text-text-muted">Sem perguntas observadas suficientes para derivar a sequência de seções.</p>;
  return <ol className="space-y-2" data-testid="blueprint-sections">
    {secoes.map(secao => <li className="rounded-md border border-divider p-2" key={secao.order}>
      <p className="text-sm font-semibold text-foreground">{secao.order}. {secao.headingDirection}</p>
      <p className="mt-1 text-sm text-text-muted">Objetivo: {secao.objective}</p>
      {secao.answersQuestion && <p className="mt-1 text-sm text-foreground">Responde: “{secao.answersQuestion}”</p>}
      {secao.mustCover.length > 0 && <p className="mt-1 text-sm text-text-muted">Precisa tocar: {secao.mustCover.join(" · ")}</p>}
      {secao.evidenceNeeded && <p className="mt-1 text-sm text-warning">{secao.evidenceNeeded}</p>}
      <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {secao.sourceSignal}</p>
    </li>)}
  </ol>;
}

/**
 * §8 · O QUE PRECISA DE LASTRO — afirmação, evidência, tipo de fonte.
 *
 * O domínio que o concorrente citou fica em OBSERVADO. Aqui entra o TIPO de
 * fonte a buscar: recomendar a instituição que a amostra cita transformaria
 * observação de mercado em endosso editorial.
 */
function Autoridade({ itens }: { itens: readonly RadarAuthorityNeed[] }) {
  if (!itens.length) return <p className="text-sm text-text-muted">Nenhuma afirmação desta investigação exige sustentação externa.</p>;
  return <ul className="space-y-2" data-testid="blueprint-authority-plan">
    {itens.map((item, indice) => <li className="rounded-md border border-divider p-2" key={indice}>
      <p className="text-sm font-semibold text-foreground">{item.claim}</p>
      <p className="mt-1 text-sm text-text-muted">Evidência: {item.evidenceType}</p>
      <p className="mt-1 text-sm text-text-muted">Fonte: {item.sourceTypeNeeded}</p>
      {item.specialistReason && <p className="mt-1 text-sm text-warning">Especialista: {item.specialistReason}</p>}
      <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {item.sourceSignal}</p>
    </li>)}
  </ul>;
}

/**
 * §9 · OS LINKS INTERNOS, EDITORIALMENTE.
 *
 * O grafo é do Arquiteto e não é recriado aqui. Zero ocorrência é resposta
 * legítima: a relação continua exigida, e esta rodada não achou onde aplicá-la
 * com fundamento.
 */
function Links({ itens }: { itens: readonly RadarInternalLinkDirection[] }) {
  if (!itens.length) return <p className="text-sm text-text-muted">O grafo aprovado não relaciona este artigo a outras páginas.</p>;
  return <ul className="space-y-2" data-testid="blueprint-internal-links">
    {itens.map((item, indice) => <li className="rounded-md border border-divider p-2" key={indice}>
      <p className="text-sm font-semibold text-foreground">{item.target} <span className="text-text-muted">· {item.role}</span></p>
      <p className="mt-1 text-sm text-foreground">{item.placementContext}</p>
      <p className="mt-1 text-sm text-text-muted">Âncora: {item.anchorDirection}</p>
      <p className="mt-1 text-sm text-text-muted">
        {item.occurrences > 0 ? `${item.occurrences} ocorrência(s) fundamentada(s).` : "Sem posição recomendada nesta rodada — a relação permanece no grafo."}
      </p>
    </li>)}
  </ul>;
}

function GoogleBlueprint({ blueprint }: { blueprint: RadarGoogleBlueprint }) {
  const { observed, recommended } = blueprint;

  return <div className="space-y-3">
    <div className="grid gap-3 lg:grid-cols-2" data-testid="radar-blueprint-cards">

      <Cartao titulo="Modelo competitivo" testid="radar-blueprint-card-modelo">
        <p className="text-sm text-foreground">{observed.comparablePages} página(s) comparável(is)</p>
        <p className="text-sm text-text-muted">{observed.sufficiency}</p>
        <Bloco titulo="O que a amostra repete">
          <Observado sinais={observed.recurringPatterns} vazio="Nenhum padrão estrutural dominante."/>
        </Bloco>
        <Bloco titulo="O que a amostra não cobre">
          <Observado sinais={observed.gaps} vazio="Nenhuma lacuna evidente."/>
        </Bloco>
        <Bloco titulo="Onde mercado e evidência divergem">
          <Observado sinais={observed.conflicts} vazio="Nenhum conflito observado."/>
        </Bloco>
        <Bloco titulo="Diferenciação recomendada">
          <Recomendado itens={recommended.differentiation} vazio="Sem diferencial sustentado pela amostra."/>
        </Bloco>
      </Cartao>

      <Cartao titulo="Busca e compreensão" testid="radar-blueprint-card-busca">
        <p className="text-sm text-foreground">Intenção a satisfazer: {recommended.intentToSatisfy}</p>
        <Bloco titulo="O que a busca mostra">
          <Observado sinais={observed.intent} vazio="A intenção não foi observada na busca."/>
        </Bloco>
        <Bloco titulo="Perguntas observadas">
          <Observado sinais={observed.questions} vazio="Nenhuma pergunta recorrente na amostra."/>
        </Bloco>
        <Bloco titulo="Conceitos recorrentes">
          <Observado sinais={observed.recurrentConcepts} vazio="Nenhum conceito recorrente."/>
        </Bloco>
        <Bloco titulo="Entidades">
          <Observado sinais={observed.entities} vazio="Nenhuma entidade compartilhada observada."/>
        </Bloco>
        <Bloco titulo="Formato dominante">
          <Observado sinais={observed.formatSignals} vazio="Formato não observado."/>
        </Bloco>
      </Cartao>

      <Cartao titulo="Fontes e autoridade" testid="radar-blueprint-card-autoridade">
        <Bloco titulo="O que a amostra cita">
          <Observado sinais={observed.sourceSignals} vazio="Nenhuma citação externa observada."/>
        </Bloco>
        <Bloco titulo="Sinais de autoridade">
          <Observado sinais={observed.authoritySignals} vazio="Nenhum sinal de autoridade observado."/>
        </Bloco>
        <Bloco titulo="O que precisa ser sustentado">
          <Autoridade itens={recommended.authorityPlan}/>
        </Bloco>
      </Cartao>

      <Cartao titulo="Aplicação editorial" testid="radar-blueprint-card-aplicacao">
        {recommended.editorialOutput && <p className="text-sm text-foreground">
          Saída recomendada: <span className="text-context-accent">{recommended.editorialOutput}</span>
        </p>}
        {recommended.contentArchitecture && <p className="text-sm text-text-muted">{recommended.contentArchitecture}</p>}
        <Bloco titulo="Links internos">
          <Links itens={recommended.internalLinkPlan}/>
        </Bloco>
        <Bloco titulo="Multimídia">
          <Recomendado itens={recommended.multimediaPlan} vazio="A amostra não sustenta recomendação de multimídia."/>
        </Bloco>
        <Bloco titulo="Camada comercial">
          <Recomendado itens={recommended.commercialApplication} vazio="A busca não mostra camada comercial nesta intenção."/>
        </Bloco>
      </Cartao>
    </div>

    {/* ---------------- §7 · a estratégia e a estrutura ---------------- */}
    <section className={cartao} data-testid="radar-blueprint-strategy">
      <h4 className={rotuloCartao}>Estratégia do conteúdo</h4>
      <div className="mt-2 space-y-3">
        <Bloco titulo="Ângulo">
          <Recomendado itens={[recommended.editorialAngle]} vazio=""/>
        </Bloco>
        {recommended.titleDirection && <Bloco titulo="Título">
          <Recomendado itens={[recommended.titleDirection]} vazio=""/>
        </Bloco>}
        <Bloco titulo="Sequência de seções">
          <Secoes secoes={recommended.sectionDirections}/>
        </Bloco>
        <Bloco titulo="Perguntas que faltam cobrir">
          <Recomendado itens={recommended.questionCoverage} vazio="A cobertura de perguntas está completa em relação à amostra."/>
        </Bloco>
        <Bloco titulo="Entidades que faltam cobrir">
          <Recomendado itens={recommended.entityCoverage} vazio="Nenhuma entidade exclusiva do mercado."/>
        </Bloco>
      </div>
    </section>
  </div>;
}

/* ============================ a seção inteira ============================ */

/* ==================== o perfil AMAZON — AMAZON_SEARCH_2 ==================== */

/**
 * §10 · O QUE A PESQUISA MOSTRA / O QUE RECOMENDAMOS.
 *
 * A mesma divisão dos outros dois perfis, sobre outra evidência. E aqui ela
 * carrega um peso extra: a SERP de produtos entrega nota, selo e preço — três
 * coisas que passam por veredito quando aparecem sem quem as observou ao lado.
 */
function AmazonBlueprint({ blueprint }: { blueprint: RadarAmazonBlueprint }) {
  const observado = blueprint.observed;
  const recomendado = blueprint.recommended;

  return <div className="space-y-3" data-testid="radar-amazon-blueprint">
    {/*
      * §23 · A ANÁLISE PARCIAL SE ANUNCIA.
      *
      * Um blueprint sem apoio do Google, calado sobre o motivo, é
      * indistinguível de um cujo apoio não achou nada — e quem lê tomaria a
      * ausência de sinal externo por ausência de demanda externa.
      */}
    {recomendado.supportState === "SUPPORT_MISSING" && <p
      className="rounded-md border border-warning/40 bg-warning-soft/20 p-2 text-sm text-warning"
      role="status"
      data-testid="radar-amazon-support-missing"
    >Análise parcial: o apoio de busca do Google não entrou. Nenhuma recomendação desta página depende dele.</p>}

    <Cartao titulo="O que a pesquisa mostra" testid="radar-amazon-blueprint-observed">
      <Bloco titulo="Modelo competitivo">
        <Observado sinais={observado.placementSignals} vazio="A coleta não devolveu produtos."/>
      </Bloco>
      <Bloco titulo="Preço e oferta">
        <Observado sinais={[...observado.priceSignals, ...observado.offerTextSignals]} vazio="Nenhum produto exibiu preço."/>
        {observado.priceBands.length > 0 && <ul className="mt-2 space-y-1" data-testid="radar-amazon-price-bands">
          {observado.priceBands.map(banda => <li className="text-sm" key={banda.band}>
            <span className="text-foreground">{BANDA_LABEL[banda.band]}</span>
            {/*
              * §7 · O MÉTODO VIAJA COM A FAIXA.
              *
              * "Intermediário" sem o tercil declarado é opinião com cara de
              * estatística — e ninguém consegue discordar de um rótulo assim.
              */}
            <span className="mt-0.5 block text-text-muted">
              {banda.sampleSize} produto(s) · {banda.method}
            </span>
          </li>)}
        </ul>}
      </Bloco>
      <Bloco titulo="Reputação e sinais de compra">
        <Observado sinais={[...observado.ratingSignals, ...observado.purchaseSignals]} vazio="A coleta não trouxe avaliação nem sinal de compra."/>
      </Bloco>
      <Bloco titulo="Estrutura comercial e SEO">
        <Observado sinais={[...observado.relatedSearchSignals, ...observado.googleSupport]} vazio="Sem buscas relacionadas nem apoio externo nesta análise."/>
      </Bloco>
      <p className="text-sm text-text-muted" data-testid="radar-amazon-sufficiency">{observado.sufficiency}</p>
    </Cartao>

    <Cartao titulo="O que recomendamos" testid="radar-amazon-blueprint-recommended">
      {/* §11 · o que produzir — e cada saída diz o sinal que a sustenta. */}
      <Bloco titulo="O que produzir">
        {recomendado.recommendedOutputs.length
          ? <ul className="space-y-2" data-testid="radar-amazon-outputs">
            {recomendado.recommendedOutputs.map(saida => <li className="rounded-md border border-divider p-2" key={saida.output}>
              <p className="text-sm font-semibold text-foreground">{RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS[saida.output]}</p>
              <p className="mt-1 text-sm text-text-muted">Objetivo: {saida.objective}</p>
              <p className="mt-1 text-sm text-text-muted">Por quê: {saida.reason}</p>
              <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {saida.sourceSignals.join(" · ")}</p>
            </li>)}
          </ul>
          : <p className="text-sm text-text-muted">Nenhum sinal desta coleta sustenta uma saída editorial específica.</p>}
      </Bloco>

      <Bloco titulo="Ângulo editorial e comercial">
        <Recomendado
          itens={[
            ...(recomendado.editorialAngle ? [recomendado.editorialAngle] : []),
            ...(recomendado.commercialAngle ? [recomendado.commercialAngle] : []),
            ...recomendado.differentiationDirection,
          ]}
          vazio="A amostra não sustenta um ângulo próprio."
        />
      </Bloco>

      {/* §13 · direções, nunca títulos copiados. */}
      <Bloco titulo="Direções de título">
        {recomendado.titleDirections.length
          ? <ul className="space-y-2" data-testid="radar-amazon-title-directions">
            {recomendado.titleDirections.map(direcao => <li className="rounded-md border border-divider p-2" key={direcao.pattern}>
              <p className="text-sm text-foreground">{direcao.pattern}</p>
              <p className="mt-1 text-sm text-text-muted">Objetivo: {direcao.objective}</p>
              <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {direcao.sourceSignals.join(" · ")}</p>
            </li>)}
          </ul>
          : <p className="text-sm text-text-muted">Sem sinal suficiente para derivar direções de título.</p>}
      </Bloco>

      <Bloco titulo="Estrutura do conteúdo">
        <Secoes secoes={recomendado.sectionDirections}/>
      </Bloco>

      {/*
        * §15 e §16 · EIXOS COM RESSALVA, E AGRUPAMENTO NO LUGAR DE RANKING.
        *
        * A ressalva fica colada no eixo: uma coluna "4,7" sem ela é lida como
        * veredito de qualidade, e o artigo passa a afirmar o que a coleta nunca
        * mediu.
        */}
      <Bloco titulo="Eixos de comparação">
        {recomendado.comparisonAxes.length
          ? <ul className="space-y-2" data-testid="radar-amazon-comparison-axes">
            {recomendado.comparisonAxes.map(eixo => <li className="rounded-md border border-divider p-2" key={eixo.axis}>
              <p className="text-sm font-semibold text-foreground">{eixo.label}</p>
              <p className="mt-1 text-sm text-text-muted">Objetivo: {eixo.objective}</p>
              {eixo.caveat && <p className="mt-1 text-sm text-warning" data-testid="radar-amazon-axis-caveat">{eixo.caveat}</p>}
              <p className="mt-1 text-sm text-text-muted opacity-80">Observado: {eixo.sourceSignal}</p>
            </li>)}
          </ul>
          : <p className="text-sm text-text-muted">Nenhum campo coletado sustenta um eixo de comparação.</p>}
      </Bloco>

      <Bloco titulo="Como agrupar">
        <Recomendado itens={recomendado.comparisonGrouping} vazio="Sem agrupamento sustentado por esta amostra."/>
      </Bloco>

      <Bloco titulo="Apoio SEO e comercial do Google">
        <Recomendado itens={recomendado.googleSeoSupport} vazio="O apoio do Google não entrou nesta análise."/>
      </Bloco>

      <Bloco titulo="Multimídia">
        <Recomendado itens={recomendado.multimediaPlan} vazio="Nenhum sinal externo sustenta peça de vídeo ou imagem."/>
      </Bloco>

      {/*
        * §22 · A LACUNA DECLARADA É O OPOSTO DA LACUNA PREENCHIDA.
        *
        * Quem lê fica sabendo que comparar por benefício exigiria outra coleta —
        * em vez de receber benefícios inventados com a cara dos observados.
        */}
      {recomendado.requiresEnrichment.length > 0 && <Bloco titulo="O que outra coleta destravaria">
        <ul className="flex flex-wrap gap-1" data-testid="radar-amazon-enrichment">
          {recomendado.requiresEnrichment.map(lacuna => <li
            className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted"
            key={lacuna}
          >{RADAR_AMAZON_ENRICHMENT_GAP_LABELS[lacuna]}</li>)}
        </ul>
      </Bloco>}
    </Cartao>
  </div>;
}

const BANDA_LABEL: Record<RadarObservedPrice["band"], string> = {
  ECONOMICO: "Econômico",
  INTERMEDIARIO: "Intermediário",
  PREMIUM: "Premium",
};

export function RadarCompetitiveBlueprintSection({ view }: { view: RadarCompetitiveBlueprintView }) {
  if (!view.blueprint) {
    return <section className={cartao} data-testid="radar-competitive-blueprint">
      <h3 className={rotuloCartao}>Blueprint competitivo</h3>
      {/* A ausência é DITA. Uma seção vazia não explica se falta coleta ou freeze. */}
      <p className="mt-1 text-sm text-text-muted" data-testid="radar-blueprint-unavailable">{view.unavailableReason}</p>
    </section>;
  }

  return <section className="space-y-3" aria-label="Blueprint competitivo" data-testid="radar-competitive-blueprint">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className={rotuloCartao}>Blueprint competitivo</h3>
      {/*
        * §20 · DE ONDE ESTA LEITURA VEIO.
        *
        * Vivo é recalculado a cada abertura; congelado não muda. Quem vai
        * produzir a partir disto precisa saber qual dos dois está lendo.
        */}
      <span className="text-sm text-text-muted" data-testid="radar-blueprint-origin">
        {view.frozen ? "Fotografia congelada" : "Leitura viva · muda a cada nova coleta"}
      </span>
    </div>

    {/*
      * §5 · A MESMA CASCA, SEMÂNTICA DIFERENTE.
      *
      * Cabeçalho, quatro cards, blueprint, amostra e proveniência — a mesma
      * hierarquia nos três perfis. O que muda é o que cada card significa.
      */}
    {view.blueprint.profile === "YOUTUBE" && <YoutubeBlueprint blueprint={view.blueprint}/>}
    {view.blueprint.profile === "GOOGLE" && <GoogleBlueprint blueprint={view.blueprint}/>}
    {view.blueprint.profile === "AMAZON" && <AmazonBlueprint blueprint={view.blueprint}/>}

    {view.blueprint.limitations.length > 0 && <ul className="space-y-1" data-testid="radar-blueprint-limitations">
      {view.blueprint.limitations.map(item => <li className="text-sm text-text-muted" key={item}>{item}</li>)}
    </ul>}
  </section>;
}
