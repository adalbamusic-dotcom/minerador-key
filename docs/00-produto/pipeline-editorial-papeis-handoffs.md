# Pipeline Editorial — Papéis, Entradas, Saídas e Fronteiras

## Princípio sistêmico

Cada área deve ter tudo que precisa para cumprir o próprio papel: contexto, dados, working copy, ferramentas, estados, ações, evidências, decisões humanas, versionamento, readback, histórico e handoff.

Nenhuma área deve refazer silenciosamente a etapa anterior nem antecipar a seguinte.

```text
MARCA
BrandDNA/contexto
  ↓
MINERADOR
KeywordDNA
  ↓
ARQUITETO
ArticleDNA + SiloDNA + SiloPage + InternalLinkGraph
  ↓
RADAR
SerpEvidence + ExternalEvidence + ExpertEvidence + RadarApprovedPackage
  ↓
PLANEJADOR
ContentPlan
  ↓
REDATOR
ContentDocument
  ↓
PUBLICAÇÕES
PublicationRecord
```

## Marca

Papel: identidade estratégica e contexto autorizado.

Responsabilidades: BrandDNA, estratégia, produtos/serviços, materiais, site/sitemap, equipe, convites e permissões da Marca.

Não faz KeywordDNA, arquitetura, SERP investigativa, ContentPlan ou redação.

## Minerador

Papel: transformar demanda bruta em conhecimento editorial individual qualificado.

Pergunta: “o que é esta keyword, o que sabemos sobre ela e por que ela está apta a seguir?”

Entrega: KeywordDNA com brandId, keyword original, origem, intenção, entidade, modificadores, nicho, funil, localidade, ambiguidade, confiança, volume, CPC, concorrência, resultados, KD quando houver, KGR/aplicabilidade, revisão IA, decisão humana, publicationContext quando houver, versão/hash/proveniência.

Não faz ArticleDNA, principal/secundárias/reforços, Silo ou links internos.

Keyword enviada ao Arquiteto deve permanecer em ArticleDNA ou “Não agrupadas”.

## Arquiteto

Papel: transformar KeywordDNAs em arquitetura editorial governada.

Responsabilidades: Lógica de agrupamento, SERP de compatibilidade, IA como proposta, revisão humana, ArticleDNA, SiloDNA, SiloPage, Pilar/Suportes e InternalLinkGraph.

ArticleDNA: 1 Principal + até 5 Secundárias/Reforços; máximo 6 KeywordDNAs; teto, não meta.

SiloPage != Pilar.

InternalLinkGraph define source, target, direção, relationType, reason, priority, anchorConcepts, versão, aprovação e proveniência. Não define anchor final, HTML ou posição final no parágrafo.

Estado atualizado do InternalLinkGraph: working copy persistente/editável, lock_version, aprovação atômica, versões append-only, v1/v2, guards de predecessor/sucessor, same-content prevention, cross-brand isolation e handoff guard homologados remotamente.

Entrega ao Radar: ArticleDNA aprovado/versionado, KeywordDNA refs, intenção/contexto, decisões/conflitos, publicationContext, SiloContext e InternalLinkGraph aprovado quando aplicável.

Radar não pode reabrir silenciosamente agrupamento, Principal, Silo, slug, canonical, URL ou Brand.

## Radar

Papel: investigação, evidência e validação da realidade externa.

Recebe unidade editorial já formada.

SERP do Radar é investigativa, diferente da SERP de compatibilidade do Arquiteto.

Fluxo: Coleta → Concorrentes → Análise → Evidências → Revisão → Histórico.

ExternalEvidence segue: necessidade → Source → Evidence → revisão humana → aprovação.

Source != Evidence.

Evidence registra o que sustenta, o que não sustenta, limites, conflitos, decisão humana e proveniência. Ausência de evidência pode ficar como SOURCE_REQUIRED.

Especialista: Need → ExpertBrief → ExpertContribution → transcrição/fidelidade → organização → revisão → ExpertEvidence.

Entrega ao Planejador: RadarApprovedPackage conceitual com brandId, articleId, articleDnaVersionId, ArticleDNA preservado, SiloContext/InternalLinkGraph ref, SerpSnapshot/SerpEvidence, ExternalEvidence, ExpertEvidence, ProductEvidence quando aplicável, EvidenceNeeds, gaps, conflicts, humanDecisions, approvedReport, provenance, version/hash.

Não cria ContentPlan nem estrutura final do artigo.

## Planejador

Papel: compilar inteligência aprovada em especificação executável.

Recebe BrandDNA/contexto autorizado, KeywordDNAs, ArticleDNA, SiloDNA/SiloPage, InternalLinkGraph, publicationContext, RadarApprovedPackage, evidências, necessidades, gaps, conflitos, perguntas, entidades, fontes, decisões e versões.

Entrega ContentPlan aprovado/versionado com identidade, estratégia, gabarito global, SectionSpecs, palavras/ranges, H1/H2/H3, parágrafos, distribuição de keywords, perguntas, entidades, objeções, claims, Evidence Map, links internos, anchorConcepts, links externos, CTA, plano visual, instruções, restrições e proveniência.

Princípio: liberdade de escrita, não liberdade de estratégia.

Não recalcula KGR, não forma ArticleDNA, não pesquisa SERP novamente, não escolhe fontes arbitrariamente e não escreve o artigo final.

## Redator

Papel: executar ContentPlan em ContentDocument.

Decide formulação, sintaxe, ritmo, coesão e transições dentro das restrições.

Não reinventa estratégia, Evidence, arquitetura, links ou claims.

Responsabilidades: Tiptap, salvamento, versionamento, revisão, aprovação e materialização dos links/imagens especificados.

## Publicações

Papel: preservar entrega final.

PublicationRecord controla URL, slug, canonical, versão, histórico e exportação/publicação.

PublicationRecord != ContentDocument.

## Regra de conflitos

Conflito estrutural volta para a área proprietária. A etapa seguinte diagnostica; não corrige silenciosamente.

## Regra de UI por área

Toda área deve deixar claro:
1. o que recebeu;
2. o que está vendo;
3. o que pode editar;
4. o que é proposta;
5. o que é Evidence;
6. o que está aprovado;
7. o que exige decisão humana;
8. o que está pendente;
9. o que será entregue;
10. se o handoff foi persistido e relido.

Estado local não substitui persistência real.


