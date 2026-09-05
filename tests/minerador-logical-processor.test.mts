import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { autoDetectNiche, deriveLogicalKeywordDna, mergeLogicalKeywordSemantic } from "../lib/arquiteto/keyword-dna-engine.ts";
import { applyFunnelQualification, classifyKeywordFunnel } from "../lib/minerador/keyword-qualification.ts";
import { readCanonicalKeywordDna } from "../lib/minerador/logical-read-model.ts";
import { buildLogicalOutputContract, LOGICAL_OUTPUT_FIELD_NAMES, validateLogicalKeywordOutput } from "../lib/minerador/logical-processor.ts";

test("deriva a identidade lógica de uma keyword específica sem usar métricas", () => {
  const result = deriveLogicalKeywordDna({
    keywordId: "kw-specific",
    keyword: "como funciona gestão financeira para pequenas empresas no Brasil",
    niche: "Finanças",
    location: "Brasil",
  });

  assert.equal(result.semantic.dna_origem, "logico_deterministico");
  assert.equal(result.semantic.intencao_principal, "Comercial");
  assert.equal(result.semantic.entidade_central, "gestao financeira");
  assert.match(String(result.semantic.modificadores), /brasil/);
  assert.equal(result.semantic.publico, "Responsável por pequenas empresas");
  assert.ok(result.semantic.problema_percebido);
  assert.ok(result.semantic.resultado_desejado);
  assert.equal(result.semantic.etapa_jornada, "Consideração");
  assert.equal(result.semantic.nivel_consciencia, "Consciente das soluções");
  assert.ok(Number(result.semantic.dna_confianca) > 0.7);
});

test("keyword ambígua não recebe nicho, audiência, problema ou potencial comercial inventados", () => {
  const result = deriveLogicalKeywordDna({ keywordId: "kw-ambiguous", keyword: "software" });

  assert.equal(result.semantic.intencao_ambigua, "sim");
  assert.equal(result.semantic.nicho_override, undefined);
  assert.equal(result.semantic.publico, undefined);
  assert.equal(result.semantic.problema_percebido, undefined);
  assert.equal(result.semantic.resultado_desejado, undefined);
  assert.equal(result.semantic.potencial_comercial, undefined);
  assert.equal(result.semantic.etapa_jornada, undefined);
  assert.ok(Number(result.semantic.dna_confianca) < 0.6);
  const persisted = mergeLogicalKeywordSemantic(null, result.semantic);
  assert.equal(persisted.intencao_ambigua, "sim");
});

test("decompõe termo genérico e termo específico sem transformar a keyword inteira em entidade", () => {
  const generic = deriveLogicalKeywordDna({ keywordId: "kw-portaria", keyword: "portaria" });
  const specific = deriveLogicalKeywordDna({ keywordId: "kw-portaria-remota", keyword: "portaria remota para condomínio pequeno" });

  assert.equal(generic.semantic.entidade_central, "portaria");
  assert.equal(generic.semantic.intencao_principal, "Pendente");
  assert.equal(generic.semantic.intencao_ambigua, "sim");
  assert.equal(generic.semantic.publico, undefined);
  assert.equal(generic.semantic.problema_percebido, undefined);
  assert.equal(generic.semantic.resultado_desejado, undefined);

  assert.equal(specific.semantic.entidade_central, "portaria remota");
  assert.match(String(specific.semantic.modificadores), /condominio pequeno/);
  assert.notEqual(String(specific.semantic.modificadores), "para");
  assert.equal(specific.semantic.publico, "Responsável por condominio pequeno");
  assert.equal(specific.semantic.intencao_principal, "Comercial");
  assert.equal(specific.semantic.etapa_jornada, "Consideração");
  assert.ok(Number(specific.semantic.dna_confianca) > Number(generic.semantic.dna_confianca));
});

test("relações e ações explícitas alimentam a leitura semântica sem parser complexo", () => {
  const price = deriveLogicalKeywordDna({ keywordId: "kw-price", keyword: "preço de seguro auto para jovem" });
  const relation = deriveLogicalKeywordDna({ keywordId: "kw-relation", keyword: "portaria de condomínio" });
  const how = deriveLogicalKeywordDna({ keywordId: "kw-how", keyword: "como instalar energia solar residencial" });
  const nearby = deriveLogicalKeywordDna({ keywordId: "kw-nearby", keyword: "portaria remota perto de mim" });
  const comparison = deriveLogicalKeywordDna({ keywordId: "kw-comparison", keyword: "portaria remota vs porteiro presencial" });

  assert.equal(price.semantic.entidade_central, "seguro auto");
  assert.match(String(price.semantic.modificadores), /para jovem/);
  assert.equal(price.semantic.intencao_principal, "Vendas");
  assert.ok(price.semantic.resultado_desejado);
  assert.equal(relation.semantic.entidade_central, "portaria");
  assert.match(String(relation.semantic.modificadores), /de condominio/);
  assert.equal(how.semantic.entidade_central, "energia solar");
  assert.match(String(how.semantic.modificadores), /residencial/);
  assert.match(String(how.semantic.resultado_desejado), /instalar energia solar residencial/);
  assert.match(String(nearby.semantic.modificadores), /perto de mim/);
  assert.equal(nearby.semantic.intencao_principal, "Local");
  assert.equal(comparison.semantic.intencao_principal, "Comercial");
  assert.equal(comparison.semantic.tipo_editorial, "comparison");
});

test("keyword de serviço local preserva entidade, modificador, intenção, nicho e funil no read-model", () => {
  const keyword = "manicure e pedicure a domicilio";
  const logical = deriveLogicalKeywordDna({ keywordId: "kw-manicure-domicilio", keyword });
  const niche = autoDetectNiche(keyword);
  const semantic = {
    ...mergeLogicalKeywordSemantic(null, {
    ...logical.semantic,
    }, { forceLogical: true }),
    nicho_override: niche,
    nicho: niche,
    nicho_origem: "logico_deterministico",
  };
  const funnel = classifyKeywordFunnel({ keyword, intent: logical.intentLabel, niche, semantic });
  const persistedSemantic = applyFunnelQualification(semantic, funnel);
  const canonical = readCanonicalKeywordDna({ intent: logical.intentLabel, analise_semantica: persistedSemantic });

  assert.equal(logical.intentLabel, "Local");
  assert.equal(niche, "Estética");
  assert.equal(logical.semantic.entidade_central, "manicure pedicure");
  assert.equal(logical.semantic.modificadores, "a domicilio");
  assert.equal(logical.semantic.intencao_local, "Localidade explícita na busca");
  assert.equal(funnel.proposed, "BOFU");
  assert.equal(funnel.determinable, true);
  assert.equal(canonical.intent, "Local");
  assert.equal(canonical.niche, "Estética");
  assert.equal(canonical.funnel, "BOFU");
});

test("contrato de saída lógico registra valores e estados explícitos sem inventar nicho ou funil", () => {
  const logical = deriveLogicalKeywordDna({ keywordId: "kw-generic-contract", keyword: "software" });
  const semantic = {
    ...logical.semantic,
    funnel_review_required: "sim",
    logical_output_contract: buildLogicalOutputContract({
      semantic: { ...logical.semantic, funnel_review_required: "sim" },
      intent: logical.intentLabel,
      niche: null,
      funnel: null,
    }),
  };
  const output = validateLogicalKeywordOutput({ semantic, intent: logical.intentLabel });
  assert.equal(output.valid, true);
  assert.deepEqual(Object.keys(output.contract?.fields || {}), [...LOGICAL_OUTPUT_FIELD_NAMES]);
  assert.equal(output.contract?.fields.intent.state, "ambiguous");
  assert.equal(output.contract?.fields.niche.state, "explicit_unknown");
  assert.equal(output.contract?.fields.funnel.state, "explicit_unknown");
  assert.equal(output.contract?.fields.niche.value, null);
  assert.equal(readCanonicalKeywordDna({ intent: logical.intentLabel, analise_semantica: semantic }).nicheLabel, "Indeterminado");
  assert.equal(readCanonicalKeywordDna({ intent: logical.intentLabel, analise_semantica: semantic }).funnelLabel, "Indefinido");
});

test("contrato completo não usa Pendente como Funil final quando a lógica resolve desconhecido", () => {
  const logical = deriveLogicalKeywordDna({ keywordId: "kw-unclassifiable-funnel", keyword: "fragmento corrompido" });
  const semantic = applyFunnelQualification(
    logical.semantic,
    classifyKeywordFunnel({ keyword: "fragmento corrompido", intent: logical.intentLabel, semantic: logical.semantic }),
  );
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: logical.intentLabel, funnel: semantic.funnel });

  const output = validateLogicalKeywordOutput({ semantic, intent: logical.intentLabel });
  const readModel = readCanonicalKeywordDna({ intent: logical.intentLabel, analise_semantica: semantic });

  assert.equal(output.valid, true);
  assert.equal(output.contract?.fields.funnel.state, "explicit_unknown");
  assert.equal(readModel.funnel, "Não classificável");
  assert.equal(readModel.funnelLabel, "Indefinido");
  assert.equal(readModel.funnelState, "resolved");
  assert.notEqual(readModel.funnelLabel, "Pendente");
});

test("marcador ambíguo prevalece e conflito de Funil não transforma valor válido em Pendente", () => {
  const logical = deriveLogicalKeywordDna({ keywordId: "kw-contract-markers", keyword: "software" });
  const semantic = {
    ...logical.semantic,
    intencao_principal: "Informativo",
    intencao_ambigua: "sim",
    funnel: "TOFU",
    funnel_review_required: "sim",
  };
  const contract = buildLogicalOutputContract({ semantic, intent: "Informativo", funnel: "TOFU" });
  assert.equal(contract.fields.intent.state, "ambiguous");
  assert.equal(contract.fields.funnel.state, "value");
  assert.equal(contract.fields.funnel.value, "TOFU");
});

test("merge lógico atualiza somente campos lógicos e preserva decisão humana", () => {
  const merged = mergeLogicalKeywordSemantic(
    {
      intencao_principal: "Comercial investigativa",
      intencao_secundaria: "Decisão humana",
      publico: "Gestores de clínicas",
      nicho_override: "Estética",
      dna_origem: "humano",
    },
    {
      dna_origem: "logico_deterministico",
      intencao_principal: "Informativo",
      intencao_secundaria: "Nenhuma intenção secundária inequívoca",
      publico: "Pessoa pesquisando diretamente sobre software",
      entidade_central: "software",
    },
  );

  assert.equal(merged.intencao_principal, "Comercial investigativa");
  assert.equal(merged.intencao_secundaria, "Decisão humana");
  assert.equal(merged.publico, "Gestores de clínicas");
  assert.equal(merged.nicho_override, "Estética");
  assert.equal(merged.entidade_central, "software");
});

test("merge lógico não substitui campo lógico já aprovado por humano", () => {
  const merged = mergeLogicalKeywordSemantic(
    {
      dna_origem: "logico_deterministico",
      dna_revisao_humana: "aprovado",
      dna_campos_logicos: "intencao_principal,entidade_central",
      intencao_principal: "Comercial investigativa aprovada",
      entidade_central: "solução aprovada",
    },
    {
      dna_origem: "logico_deterministico",
      dna_revisao_humana: "pendente",
      intencao_principal: "Informativo",
      entidade_central: "solucao",
    },
  );

  assert.equal(merged.intencao_principal, "Comercial investigativa aprovada");
  assert.equal(merged.entidade_central, "solução aprovada");
});

test("merge lógico reconhece origem humana mesmo antes do status aprovado", () => {
  const merged = mergeLogicalKeywordSemantic(
    {
      dna_origem: "humano",
      dna_revisao_humana: "pendente",
      dna_campos_logicos: "intencao_principal",
      intencao_principal: "Intenção definida manualmente",
    },
    {
      dna_origem: "logico_deterministico",
      intencao_principal: "Informativo",
    },
  );

  assert.equal(merged.intencao_principal, "Intenção definida manualmente");
});

test("Processar lógica persiste somente no tenant da keyword e não chama providers externos", async () => {
  const source = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const processLogicalKeywordDna = async");
  const end = source.indexOf("const handleQualifySelected", start);
  const processor = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(processor, /deriveLogicalKeywordDna/);
  assert.match(processor, /\.eq\("brand_id", selectedBrandId\)/);
  assert.doesNotMatch(processor, /fetch\(/);
  assert.doesNotMatch(processor, /Google Ads|DataForSEO|OpenRouter|process-intent-niche|\/api\/analyze/);
});

test("painel exibe os campos lógicos do KeywordDNA", async () => {
  const panel = await readFile(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  for (const label of ["Intenção lógica", "Nicho", "Funil", "Entidade central", "Modificadores", "Audiência", "Problema percebido", "Resultado desejado", "Job to be done", "Jornada", "Nível de consciência", "Tipo editorial", "Formato esperado", "Potencial comercial lógico", "Intenção local", "Objeção implícita", "Urgência/tempo", "Emoção dominante", "Ambiguidade", "Confiança", "Evidências lógicas"]) {
    assert.match(panel, new RegExp(label));
  }
});
