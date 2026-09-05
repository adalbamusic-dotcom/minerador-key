# SDD — Brand Skills no contexto de IA do Planejador

**Módulo proprietário:** Planejador.
**Estado:** implementação local preparatória; não autoriza provider, migration ou escrita remota.

## Contrato

`getBrandContextPack({ brandId, module, purpose })` filtra Skills ativas por
Marca e `consumerModules`. `buildBrandAIContext` transforma o pacote em uma
camada explícita `BRAND CONTEXT`, distinta de regras de sistema, evidência e
tarefa. A chamada real só registra `appliedSkillRefs` quando esse builder é
usado para montar o prompt.

`brand_voice` permanece disponível somente para Planejador e Redator. BrandDNA
é a fonte superior: Skill não altera ArticleDNA, KeywordDNA, evidência SERP,
URL/canonical ou regras de segurança.

## Proveniência

Quando uma futura operação IA do Planejador usar o builder, o `ContentPlan`
recebe referências compactas por `definitionKey`, `versionId`, `versionNumber`
e `contentHash`; Markdown integral não é copiado ao plano. Os campos são
aditivos no JSON do `ContentPlanContextSource`; não há mudança de tabela,
migration, RLS ou dado remoto.

## Gate

A auditoria confirmou que o Planejador atual é determinístico e não possui
chamada de provider ativa. A integração real está `PARTIAL` até existir uma
operação IA autorizada que invoque o builder antes da montagem do prompt,
registre as referências e passe pelo smoke controlado.
