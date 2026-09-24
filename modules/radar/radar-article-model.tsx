"use client";

import type {
  RadarEditorialArticleModel,
  RadarEditorialLinkApplication,
  RadarEditorialSection,
} from "@/lib/radar/editorial-article-model";
import { RADAR_SUBJECT_TURN_SCREEN_LABEL, radarIsSubjectTurnScreenSection } from "./radar-subject-turn-view";

/**
 * ===== O ARTIGO-MODELO NA TELA — 1.1 · §2 a §20 =====
 *
 * ==================== O QUE A VERSÃO ANTERIOR AINDA ERRAVA ====================
 *
 * Ela já sintetizava certo, e ainda assim parecia um relatório: cada seção
 * trazia Objetivo, Precisa responder, Mensagem-chave, uma frase de direção, o
 * número da posição e cinco selos — e o "Objetivo" era, literalmente, "Observado
 * em 7 de 10 páginas, sob 9 formulações".
 *
 * A pergunta que esta tela responde é só uma: QUAL É O ARTIGO? Título, abertura,
 * estrutura, o que cada seção cobre, onde há dependência. O resto — a contagem
 * que sustenta, o candidato que não entrou, o identificador do destino — vive
 * atrás de um clique.
 *
 * ==================== A REGRA DE CORTE ====================
 *
 * Um campo só fica na visão normal se alguém decidir alguma coisa olhando para
 * ele. "Encaminhar para a primeira seção sem repetir o que a abertura já
 * entregou" vale para qualquer artigo; ele continua no contrato e saiu da tela.
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
 * §14 · O LINK EM LINGUAGEM EDITORIAL — e só depois do clique.
 *
 * Na seção ele é um selo: "4 links internos". Destino, âncora, onde aplicar e
 * função são o detalhe de quem vai inserir, não a decisão de quem lê a
 * arquitetura.
 */
function Link({ link }: { link: RadarEditorialLinkApplication }) {
  return <li className={interno} data-testid="radar-article-model-link">
    <dl className="grid gap-1.5 sm:grid-cols-2">
      <Campo label="Destino">{link.destination}</Campo>
      <Campo label="Âncora sugerida">“{link.anchor}”</Campo>
      <Campo label="Onde aplicar">{link.whereToApply}</Campo>
      <Campo label="Função">{link.role}</Campo>
    </dl>
  </li>;
}

/**
 * §6 · O CARTÃO DA SEÇÃO, ENXUTO.
 *
 * Cabeçalho, uma linha de função, o que cobrir, selos. Mais do que isso e a
 * estrutura do artigo deixa de caber numa tela — que é o teste de aceitação
 * que §20 pede.
 */
function Secao({ section }: { section: RadarEditorialSection }) {
  const nivel = section.level === 2 ? "H2" : "H3";
  return <li
    className={section.level === 2 ? cartao : `${interno} ml-4`}
    data-testid={section.level === 2 ? "radar-article-model-section" : "radar-article-model-subsection"}
  >
    <h4 className="text-sm font-semibold text-foreground">
      <span className="mr-2 text-text-muted">{nivel}</span>
      {section.headingSuggestion}
    </h4>

    <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="radar-article-model-objective">{section.objective}</p>

    {section.keyMessage && <p className="mt-1 text-sm leading-6 text-foreground" data-testid="radar-article-model-message">{section.keyMessage}</p>}

    {section.coveragePoints.length > 0 && <div className="mt-2" data-testid="radar-article-model-coverage">
      <p className="text-xs uppercase tracking-wide text-text-muted">Cobrir</p>
      <ul className="mt-0.5 space-y-0.5 text-sm leading-6 text-foreground">
        {section.coveragePoints.map(ponto => <li key={ponto}>— {ponto}</li>)}
      </ul>
    </div>}


    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="radar-article-model-badges">
      {/*
        * ===== 1.4 · §8 · UM SELO PARA A FORÇA, E SÓ UM =====
        *
        * A seção exibia "✓ Evidência suficiente" e "Evidência moderada" lado a
        * lado: dois selos sobre a MESMA pergunta, dizendo coisas diferentes. O
        * primeiro falava de dependência de fonte; o segundo, de recorrência na
        * amostra — e quem lia tinha de adivinhar qual mandava.
        *
        * Agora a força da evidência tem uma apresentação só, e as dependências
        * — fonte e especialista — são selos separados, porque são acionáveis:
        * alguém busca a fonte, alguém aciona o especialista.
        */}
      {section.evidenceStrength === "STRONG" && <Selo tom="ok">✓ Evidência suficiente</Selo>}
      {section.evidenceStrength === "MODERATE" && <Selo tom="neutro">Evidência moderada</Selo>}
      {section.factualRequirement && <Selo tom="atencao">⚠ Precisa de fonte</Selo>}
      {section.specialistRequirement && <Selo tom="atencao">⚠ Revisão profissional</Selo>}
      {/*
        * 1.3 · §13 · O SELO NO LUGAR DO PARÁGRAFO.
        *
        * "O ArticleDNA declara este assunto: ele precisa ser coberto, e a
        * arquitetura decide onde" é a lógica certa — e repetida em cada seção
        * virava ruído. A frase inteira desceu para "Ver evidências".
        */}
      {/*
        * A VIRADA DO ASSUNTO TEM RÓTULO PRÓPRIO (F3.1): ela é exigida pelo
        * Assunto declarado, não observada na amostra.
        */}
      {radarIsSubjectTurnScreenSection(section)
        ? <Selo tom="neutro">{RADAR_SUBJECT_TURN_SCREEN_LABEL}</Selo>
        : (section.evidenceStrength === "DNA_REQUIRED" || section.mustCoverReasons.length > 0) && <Selo tom="neutro">Exigido pelo ArticleDNA</Selo>}
      {section.internalLinks.length > 0 && <Selo tom="neutro">{section.internalLinks.length} link(s) interno(s)</Selo>}
      {section.mediaOpportunity.length > 0 && <Selo tom="neutro">Vídeo</Selo>}
    </div>

    {/*
      * §7 · A CONTAGEM VIVE AQUI DENTRO, E SÓ AQUI.
      *
      * Junto dela, o que a seção também responde e os links completos: tudo o
      * que serve para conferir, e nada que sirva para decidir a arquitetura.
      */}
    <details className="mt-1.5" data-testid="radar-article-model-evidence">
      <summary className="cursor-pointer text-sm text-context-accent">Ver evidências</summary>
      <p className="mt-1.5 text-sm leading-6 text-text-muted">{section.reason}</p>
      <p className="mt-1 text-sm leading-6 text-text-muted">{section.headingDirection}</p>
      {section.mustCoverReasons.map(motivo => <p key={motivo} className="mt-1 text-sm leading-6 text-context-accent" data-testid="radar-article-model-must-cover">{motivo}</p>)}
      {section.factualRequirement && <p className="mt-1 text-sm leading-6 text-warning">{section.factualRequirement}</p>}
      {section.specialistRequirement && <p className="mt-1 text-sm leading-6 text-warning">{section.specialistRequirement}</p>}
      {section.internalLinks.length > 0 && <ul className="mt-2 space-y-2">
        {section.internalLinks.map((link, indice) => <Link key={`${link.destination}-${indice}`} link={link} />)}
      </ul>}
    </details>

    {section.childSections.length > 0 && <ul className="mt-2.5 space-y-2">
      {section.childSections.map(filho => <Secao key={filho.id} section={filho} />)}
    </ul>}
  </li>;
}

export function RadarArticleModelSection({ model }: { model: RadarEditorialArticleModel }) {
  return <section className="rounded-md border border-context-accent/40 bg-surface-subtle p-3" data-testid="radar-article-model">
    {/*
      * §3 · O TOPO EXECUTIVO.
      *
      * Antes eram seis campos, dois deles descrevendo o processo ("7
      * necessidades sintetizadas de 20 candidatos"). Ficaram os três que
      * decidem o artigo — título, direção, promessa — mais o status.
      */}
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-foreground">Blueprint editorial</h3>
        <p className="text-sm text-text-muted">Artigo-modelo competitivo</p>
      </div>
      <span
        className={`text-sm ${model.readiness.state === "READY" ? "text-success" : "text-warning"}`}
        data-testid="radar-article-model-readiness"
      >{model.readiness.label}</span>
    </div>

    <dl className="mt-3 grid gap-2.5 md:grid-cols-3" data-testid="radar-article-model-executive">
      <Campo label="Título sugerido">{model.titleSuggestion}</Campo>
      <Campo label="Direção do artigo">{model.editorialAngle}</Campo>
      <Campo label="Promessa ao leitor">{model.readerPromise}</Campo>
    </dl>

    {/* §1 · outras direções, quando a estrutura as sustenta. */}
    {model.titleAlternatives.length > 0 && <p className="mt-1.5 text-sm leading-6 text-text-muted" data-testid="radar-article-model-title-alternatives">
      Outras direções: {model.titleAlternatives.join(" · ")}
    </p>}

    {/*
      * O ASSUNTO, QUANDO HÁ — SDD do Assunto, F3.1.
      *
      * A principal é a promessa; o Assunto é para onde o artigo faz a virada.
      * Quem lê o artigo-modelo precisa ver o tronco, onde a amostra sugere
      * virar, o que ela diz do H1 e o alerta quando a SERP não o toca. Sem
      * Assunto este bloco não existe.
      */}
    {model.declaredSubject && <div className={`mt-3 ${cartao}`} data-testid="radar-article-model-subject">
      <h4 className="text-sm font-semibold text-foreground">Assunto (tronco): {model.declaredSubject.phrase}</h4>
      <dl className="mt-1.5 grid gap-1.5 md:grid-cols-2">
        <Campo label="Onde virar">{model.declaredSubject.suggestedPositionLabel}</Campo>
        <Campo label="H1">{model.declaredSubject.h1Complement.label}</Campo>
      </dl>
      <p className="mt-1.5 text-sm leading-6 text-text-muted">{model.declaredSubject.sampleLabel}</p>
      {model.declaredSubject.alert && <p className="mt-1 text-sm leading-6 text-warning" data-testid="radar-article-model-subject-alert">{model.declaredSubject.alert}</p>}
    </div>}

    {/* §5 · abertura: hook, promessa e a resposta que vem cedo. Nada além. */}
    <div className={`mt-3 ${cartao}`} data-testid="radar-article-model-opening">
      <h4 className="text-sm font-semibold text-foreground">Abertura</h4>
      <dl className="mt-1.5 grid gap-1.5 md:grid-cols-3">
        <Campo label="Hook">{model.opening.hookDirection}</Campo>
        <Campo label="Promessa">{model.opening.promise}</Campo>
        <Campo label="Resposta inicial">{model.opening.initialAnswer}</Campo>
      </dl>
    </div>

    <ul className="mt-3 space-y-2.5" data-testid="radar-article-model-sections">
      {model.sections.map(section => <Secao key={section.id} section={section} />)}
    </ul>

    <div className={`mt-3 ${cartao}`} data-testid="radar-article-model-conclusion">
      <h4 className="text-sm font-semibold text-foreground">Conclusão</h4>
      {/* §12 · objetivo e chamada. O passo intermediário fica no contrato. */}
      <dl className="mt-1.5 grid gap-1.5 md:grid-cols-2">
        <Campo label="Objetivo">{model.conclusion.synthesis}</Campo>
        <Campo label="CTA">{model.conclusion.callToAction}</Campo>
        {model.conclusion.destinationDirection && <Campo label="Destino da chamada">{model.conclusion.destinationDirection}</Campo>}
      </dl>
    </div>

    {/*
      * §15 · O PLANO VISUAL É UM RESUMO, não cinco recomendações no fluxo.
      *
      * Quantas peças, de que tipo. O porquê de cada uma fica no disclosure —
      * é decisão de produção, não de arquitetura.
      */}
    {model.mediaPlan.length > 0 && <details className={`mt-3 ${cartao}`} data-testid="radar-article-model-media">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Plano visual · {model.mediaSummary || `${model.mediaPlan.length} peça(s)`}
      </summary>
      <ul className="mt-1.5 space-y-1 text-sm leading-6 text-text-muted">
        {model.mediaPlan.map((item, indice) => <li key={`${item.kind}-${indice}`}>{item.kind} · {item.subject} — {item.purpose}</li>)}
      </ul>
    </details>}

    {model.internalLinkApplications.length > 0 && <details className="mt-3" data-testid="radar-article-model-links">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Links internos · {model.internalLinkApplications.length} aplicação(ões) planejada(s)
      </summary>
      <ul className="mt-2 space-y-2">
        {model.internalLinkApplications.map((link, indice) => <Link key={`${link.destination}-${indice}`} link={link} />)}
      </ul>
    </details>}
  </section>;
}

/**
 * ===== §16 · AS DECISÕES DE EXCLUSÃO — FORA DO BLUEPRINT =====
 *
 * "O que a amostra mostrou e não entrou" é auditoria: ela responde "o Radar viu
 * e decidiu?", não "o que eu escrevo?". Ocupando espaço antes do envio ao
 * Planejador, ela competia com a arquitetura.
 *
 * Continua inteira — cada candidato com o seu motivo — dentro da evidência
 * competitiva, que é onde a pergunta dela é feita.
 */
export function RadarArticleModelExclusions({ model }: { model: RadarEditorialArticleModel }) {
  const recusados = model.candidates.filter(item => !item.sectionId);
  if (!recusados.length) return null;

  return <details className="mt-3 rounded-md border border-divider bg-surface p-3" data-testid="radar-article-model-rejected">
    <summary className="cursor-pointer text-sm font-semibold text-foreground">
      Decisões de exclusão · {recusados.length} de {model.candidates.length} candidato(s)
    </summary>
    <ul className="mt-2 space-y-1.5">
      {recusados.map(item => <li key={item.id} className={interno} data-testid="radar-article-model-rejected-item">
        <p className="text-sm text-foreground">{item.observedLabel}</p>
        <p className="mt-0.5 text-sm leading-6 text-text-muted">{item.reason}</p>
      </li>)}
    </ul>
  </details>;
}
