"use client";

import { useMemo } from "react";
import {
  RADAR_AMAZON_EDITORIAL_INTENTS,
  RADAR_AMAZON_INTENT_LABELS,
  RADAR_AMAZON_INTENT_REQUIREMENTS,
  RADAR_AMAZON_TARGET_LABELS,
  radarAmazonEmptyTargetFor,
  radarAmazonParseTargetInput,
  radarAmazonValidateSetup,
  type RadarAmazonEditorialIntent,
  type RadarAmazonEditorialIntentType,
  type RadarAmazonResearchTarget,
  type RadarAmazonTargetProduct,
} from "@/lib/radar/amazon-editorial-target";

/**
 * ===== A CONFIGURAÇÃO DA PESQUISA AMAZON — §8 a §17 e §31 =====
 *
 * ==================== POR QUE ESTA TELA EXISTE ====================
 *
 * O ArticleDNA diz `skin care nivea` e para por aí. Isso cabe num review de um
 * creme, num Nivea contra Neutrogena, num top 10 de óleos e num guia de compra —
 * e cada um desses precisa de uma pesquisa diferente.
 *
 * Sem esta tela, o Radar escolhia implicitamente: pesquisava a keyword, trazia a
 * prateleira da marca e montava um blueprint genérico. A pessoa pagava a coleta
 * para descobrir, depois, que ela tinha respondido outra pergunta.
 *
 * ==================== DUAS DECISÕES, NESTA ORDEM ====================
 *
 * O QUE PRODUZIR vem antes de O QUE INVESTIGAR, e não por gosto: a primeira
 * escolha determina quais campos a segunda precisa. Um `TOP_BEST` pede categoria
 * e quantidade; um `X vs Y` pede exatamente dois produtos. Mostrar os dois
 * conjuntos ao mesmo tempo ofereceria campos que a escolha feita torna inúteis.
 *
 * ==================== §20 · NADA AQUI CHAMA PROVIDER ====================
 *
 * Digitar não pesquisa. URL e ASIN se resolvem por leitura de forma, sem rede.
 * Nome precisa de descoberta paga, e ela só acontece por clique explícito no
 * botão próprio — uma ação humana, uma chamada.
 */

export type RadarAmazonTargetSetupProps = {
  intent: RadarAmazonEditorialIntent | null;
  target: RadarAmazonResearchTarget | null;
  /** O texto cru do campo multilinha, preservado enquanto a pessoa digita. */
  rawInput: string;
  busy: boolean;
  /** §19 · a resolução por nome está em curso para esta entrada. */
  resolving: boolean;
  /** §18 · a configuração congelou com a coleta; a tela vira leitura. */
  locked: boolean;
  /** §19 · candidatos devolvidos pela loja, à espera de escolha humana. */
  candidates: Array<{ asin: string; title: string; imageUrl: string | null }> | null;
  candidatesFor: string | null;
  onIntentChange: (type: RadarAmazonEditorialIntentType) => void;
  onIntentDetailChange: (patch: Partial<RadarAmazonEditorialIntent>) => void;
  onTargetChange: (patch: Partial<RadarAmazonResearchTarget>) => void;
  onRawInputChange: (valor: string) => void;
  onResolveName: (entrada: RadarAmazonTargetProduct) => void;
  onPickCandidate: (candidato: { asin: string; title: string; imageUrl: string | null }) => void;
};

const bloco = "rounded-md border border-divider bg-surface p-3";
const campo = "mt-1 w-full rounded-md border border-divider bg-surface-subtle px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";

export function RadarAmazonTargetSetup(props: RadarAmazonTargetSetupProps) {
  const { intent, target } = props;
  const exigencia = intent ? RADAR_AMAZON_INTENT_REQUIREMENTS[intent.type] : null;

  const validacao = useMemo(
    () => radarAmazonValidateSetup({ intent, target }),
    [intent, target],
  );

  /* A leitura é de FORMA e acontece a cada tecla — sem rede, sem custo. */
  const entradas = useMemo(() => radarAmazonParseTargetInput(props.rawInput), [props.rawInput]);
  const porNome = entradas.filter(item => item.inputType === "NAME");

  /*
   * ============ 1.1 · §18 · CONFIGURAÇÃO CONGELADA COM A COLETA ============
   *
   * Depois de um START com coleta gravada, esta tela vira LEITURA. Trocar
   * `TOP_BEST` por `TOP_VALUE` aqui produziria um blueprint novo sobre
   * evidência velha, com a aparência de ter sido pesquisado assim.
   */
  if (props.locked && intent) {
    return <section className={bloco} aria-label="Configuração da pesquisa Amazon" data-testid="radar-amazon-setup-locked">
      <p className="text-sm text-foreground">
        <span className="font-semibold">Alvo desta coleta:</span> {RADAR_AMAZON_INTENT_LABELS[intent.type]}
        {target?.productClass ? ` · ${target.productClass}` : ""}
        {target?.brandFilter ? ` · marca ${target.brandFilter}` : ""}
        {target?.categoryQuery ? ` · busca "${target.categoryQuery}"` : ""}
        {intent.desiredCount ? ` · ${intent.desiredCount} para o artigo` : ""}
      </p>
      <p className="mt-1 text-sm text-text-muted">
        A configuração ficou congelada com a coleta que ela originou. Para investigar outro alvo, zere a investigação e colete de novo.
      </p>
    </section>;
  }

  return <section className={`${bloco} space-y-4`} aria-label="Configuração da pesquisa Amazon" data-testid="radar-amazon-setup">
    {/* ====================== §8 · a primeira decisão ====================== */}
    <div>
      <h4 className="text-sm font-semibold text-foreground">O que você quer produzir?</h4>
      <p className="mt-1 text-sm text-text-muted">
        O ArticleDNA diz qual é o território. Esta escolha diz qual artigo comercial vamos construir dentro dele.
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Intenção editorial" data-testid="radar-amazon-intent">
        {RADAR_AMAZON_EDITORIAL_INTENTS.map(tipo => <button
          key={tipo}
          type="button"
          role="radio"
          aria-checked={intent?.type === tipo}
          disabled={props.busy}
          className={`${button} ${intent?.type === tipo ? "border-context-accent bg-selected" : ""}`}
          onClick={() => props.onIntentChange(tipo)}
          data-testid={`radar-amazon-intent-${tipo.toLowerCase()}`}
        >{RADAR_AMAZON_INTENT_LABELS[tipo]}</button>)}
      </div>
    </div>

    {intent && exigencia && <>
      {/* ================= §9 a §16 · a segunda decisão ================= */}
      <div>
        <h4 className="text-sm font-semibold text-foreground">Quais produtos vamos investigar?</h4>
        <p className="mt-1 text-sm text-text-muted" data-testid="radar-amazon-target-kind">
          {RADAR_AMAZON_TARGET_LABELS[exigencia.target]}.
        </p>
      </div>

      {/*
        * §9, §10 e §11 · A ENTRADA DE PRODUTOS — um por linha, sempre.
        *
        * O mesmo campo serve para um, dois ou dez. Três caixas separadas para o
        * X vs Y e um textarea para a comparação dariam duas gramáticas de
        * entrada para a mesma coisa, e a pessoa teria de aprender as duas.
        */}
      {exigencia.produtosResolvidos && <label className="block text-sm font-medium text-text">
        {exigencia.produtosResolvidos.maximo === 1
          ? "Produto — link da Amazon, ASIN ou nome"
          : `Produtos — um por linha (link, ASIN ou nome)`}
        <textarea
          className={`${campo} min-h-24 font-mono`}
          value={props.rawInput}
          disabled={props.busy}
          rows={exigencia.produtosResolvidos.maximo === 1 ? 2 : 5}
          placeholder={"https://www.amazon.com.br/.../dp/B0XXXXXXXX\nB0XXXXXXXX\nNIVEA Óleo Corporal Firmador 200 ml"}
          onChange={evento => props.onRawInputChange(evento.target.value)}
          data-testid="radar-amazon-target-input"
        />
      </label>}

      {/*
        * A LEITURA DO QUE FOI COLADO, enquanto se digita.
        *
        * URL e ASIN aparecem já resolvidos porque a identidade estava no texto.
        * Nome aparece pendente — e com o botão que o resolve ao lado.
        */}
      {exigencia.produtosResolvidos && entradas.length > 0 && <ul className="space-y-1" data-testid="radar-amazon-target-entries">
        {entradas.map((entrada, indice) => <li
          key={`${entrada.input}:${indice}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider px-2 py-1 text-sm"
          data-testid="radar-amazon-target-entry"
          data-input-type={entrada.inputType}
          data-resolved={entrada.resolvedAsin ? "yes" : "no"}
        >
          <span className="min-w-0 flex-1 truncate text-foreground">
            {entrada.resolvedTitle || entrada.input}
          </span>
          {entrada.resolvedAsin
            ? <span className="text-positive">✓ produto identificado</span>
            : <button
              type="button"
              className={button}
              disabled={props.busy || props.resolving}
              onClick={() => props.onResolveName(entrada)}
              data-testid="radar-amazon-resolve-name"
            >{props.resolving ? "Localizando…" : "Localizar produto na Amazon"}</button>}
        </li>)}
      </ul>}

      {/*
        * §19 · OS CANDIDATOS, PARA A PESSOA ESCOLHER.
        *
        * "óleo nivea" devolve variantes, tamanhos e versões. O Radar não decide
        * qual delas o artigo avalia — decidir seria escolher o SKU pela
        * relevância da loja, que é exatamente o automatismo que este gate
        * removeu.
        */}
      {props.candidates && props.candidates.length > 0 && <div className={bloco} data-testid="radar-amazon-candidates">
        <p className="text-sm font-semibold text-foreground">
          Qual destes é o produto{props.candidatesFor ? ` de "${props.candidatesFor}"` : ""}?
        </p>
        <ul className="mt-2 space-y-1">
          {props.candidates.map(candidato => <li key={candidato.asin}>
            <button
              type="button"
              className={`${button} w-full justify-start text-left`}
              disabled={props.busy}
              onClick={() => props.onPickCandidate(candidato)}
              data-testid="radar-amazon-candidate"
            >{candidato.title}</button>
          </li>)}
        </ul>
        <p className="mt-2 text-sm text-text-muted">
          A identidade do produto escolhido passa a ser o ASIN dele.
        </p>
      </div>}

      {/* ============== §12 a §16 · categoria, quantidade, necessidade ============== */}
      {exigencia.exigeCategoria && <label className="block text-sm font-medium text-text">
        Consulta que a Amazon vai usar para descobrir os produtos
        <input
          className={campo}
          value={target?.categoryQuery || ""}
          disabled={props.busy}
          placeholder="sérum nivea"
          onChange={evento => props.onTargetChange({ categoryQuery: evento.target.value.trim() ? evento.target.value : null })}
          data-testid="radar-amazon-category-query"
        />
        <span className="mt-1 block text-sm text-text-muted">
          Esta é a busca feita na loja. Ela pode ser ampla — a loja responde por relevância, e o que vier junto fica como evidência.
        </span>
      </label>}

      {/*
        * ============ 1.1 · §4 e §5 · O QUE ENTRA NO RANKING ============
        *
        * A consulta e o universo comparável são coisas diferentes, e o gate
        * nasceu de confundi-las: "Serum Nivea" trouxe 59 produtos e o ranking
        * comparou sérum Nivea com creme de mãos Nivea e sérum Dove.
        *
        * Buscar amplo e comparar estreito é o que estes dois campos permitem.
        */}
      {exigencia.exigeTipoDeProduto && <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm font-medium text-text">
          Tipo de produto comparado
          <input
            className={campo}
            value={target?.productClass || ""}
            disabled={props.busy}
            placeholder="sérum facial"
            onChange={evento => props.onTargetChange({ productClass: evento.target.value.trim() ? evento.target.value : null })}
            data-testid="radar-amazon-product-class"
          />
          <span className="mt-1 block text-sm text-text-muted">
            Só produtos cujo título contenha estes termos entram no ranking.
          </span>
        </label>
        <label className="block text-sm font-medium text-text">
          Restringir a uma marca (opcional)
          <input
            className={campo}
            value={target?.brandFilter || ""}
            disabled={props.busy}
            placeholder="Nivea"
            onChange={evento => props.onTargetChange({ brandFilter: evento.target.value.trim() ? evento.target.value : null })}
            data-testid="radar-amazon-brand-filter"
          />
          <span className="mt-1 block text-sm text-text-muted">
            A loja não entrega marca estruturada: a restrição é por texto no título observado.
          </span>
        </label>
      </div>}

      {exigencia.exigeQuantidade && <label className="block text-sm font-medium text-text">
        Quantos produtos o artigo pretende apresentar
        <input
          className={`${campo} max-w-24`}
          type="number"
          min={1}
          max={50}
          value={intent.desiredCount ?? ""}
          disabled={props.busy}
          onChange={evento => props.onIntentDetailChange({
            desiredCount: evento.target.value ? Math.max(1, Math.min(50, Number(evento.target.value))) : null,
          })}
          data-testid="radar-amazon-desired-count"
        />
      </label>}

      {exigencia.exigeNecessidade && <label className="block text-sm font-medium text-text">
        Necessidade que o ranking atende
        <input
          className={campo}
          value={intent.useCase || ""}
          disabled={props.busy}
          placeholder="pele seca"
          onChange={evento => props.onIntentDetailChange({ useCase: evento.target.value.trim() ? evento.target.value : null })}
          data-testid="radar-amazon-use-case"
        />
        <span className="mt-1 block text-sm text-text-muted">
          A coleta não lê atributo de produto: a adequação à necessidade vira consulta de busca, e a limitação é declarada no blueprint.
        </span>
      </label>}

      {exigencia.exigeMarca && <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm font-medium text-text">
          Marca
          <input
            className={campo}
            value={target?.brand || ""}
            disabled={props.busy}
            placeholder="Nivea"
            onChange={evento => props.onTargetChange({ brand: evento.target.value.trim() ? evento.target.value : null })}
            data-testid="radar-amazon-brand"
          />
        </label>
        <label className="block text-sm font-medium text-text">
          Linha (opcional)
          <input
            className={campo}
            value={target?.line || ""}
            disabled={props.busy}
            placeholder="Óleos corporais"
            onChange={evento => props.onTargetChange({ line: evento.target.value.trim() ? evento.target.value : null })}
            data-testid="radar-amazon-line"
          />
        </label>
      </div>}

      {/*
        * §17 · O QUE FALTA, DITO — e é isso que desabilita o START.
        *
        * Um botão apagado sem motivo é um botão que a pessoa clica de novo
        * achando que a tela travou.
        */}
      {!validacao.valid && <ul className="space-y-1" role="status" data-testid="radar-amazon-setup-issues">
        {validacao.issues.map(motivo => <li className="text-sm text-warning" key={motivo}>{motivo}</li>)}
      </ul>}

      {validacao.valid && <p className="text-sm text-positive" role="status" data-testid="radar-amazon-setup-ready">
        ✓ Alvo definido: {RADAR_AMAZON_INTENT_LABELS[intent.type]}
        {validacao.resolvedProducts.length ? ` · ${validacao.resolvedProducts.length} produto(s) identificado(s)` : ""}
        {target?.categoryQuery ? ` · "${target.categoryQuery}"` : ""}
      </p>}

      {porNome.length > 0 && <p className="text-sm text-text-muted">
        Entradas por nome precisam de uma busca na loja para virar produto. Link ou ASIN identificam sem custo.
      </p>}
    </>}
  </section>;
}

export { radarAmazonEmptyTargetFor };
