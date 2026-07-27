# SDD â€” Integridade editorial, hidrataÃ§Ã£o dos DNAs e proteÃ§Ã£o de publicados

## Status

Auditoria concluÃ­da em 2026-07-20; correÃ§Ã£o aditiva e retrocompatÃ­vel autorizada dentro do mÃ³dulo Planejador. A validaÃ§Ã£o do artigo real no navegador ficou limitada porque a sessÃ£o local disponÃ­vel nÃ£o tinha marca selecionada. Nenhum dado de produÃ§Ã£o foi inventado ou alterado.

## Problema

O cockpit do Planejador recebe parte da identidade editorial, mas nÃ£o compÃµe todas as referÃªncias que jÃ¡ existem no workspace. O sintoma observado Ã© `ReferÃªncia nÃ£o hidratada` para a keyword principal, silo com nome sem SiloDNA/versionamento visÃ­vel e `PublicaÃ§Ã£o: Novo` para conteÃºdo que pode estar publicado no briefing legado.

O risco Ã© maior que visual: o estado `Novo` pode liberar uma interpretaÃ§Ã£o insegura de campos estruturais publicados, e o salvamento de sucessora nÃ£o possui uma validaÃ§Ã£o de domÃ­nio que preserve slug, canonical, keyword principal, marca e URL estrutural.

## Estado anterior e ponto exato da perda

1. A referÃªncia histÃ³rica `components/product/operational-pages.tsx` e `components/planejador/planner-cockpit-workspace.tsx` chamavam `hydratePlanner` com ArticleDNA, SiloDNA, SiloPage, snapshot e SERP, mas nÃ£o transportavam o `RadarItem.hydration`. A composiÃ§Ã£o atual pertence a `modules/planejador` e `components/planejador`. O Radar jÃ¡ armazena aliases, texto real da principal, versÃ£o do KeywordDNA e o vÃ­nculo do silo em `RadarHydrationSnapshot`.
2. `lib/planejador/hydration.ts` resolve keyword somente com `snapshot.keywords.find(candidate => candidate.id === id)`. Isso nÃ£o considera aliases/publication IDs preservados pelo Radar nem materializa a resoluÃ§Ã£o por ID + versÃ£o. O predicado atual tambÃ©m compara `lista_id` com `brandId`, embora `lista_id` represente o silo no adaptador legado; ele nÃ£o valida a marca de forma confiÃ¡vel.
3. `lib/planejador/hydration.ts` usa o DTO legado do silo como se fosse `SiloDNA` quando o envelope versionado nÃ£o estÃ¡ carregado e atribui o mesmo `siloRef` a `silo` e `siloDna`. Assim, o nome pode aparecer, mas a ausÃªncia de SiloDNA versionado fica mascarada.
4. `lib/planejador/hydration.ts` cai em `not_started`, e `buildCockpitViewModel` traduz esse valor como `Novo`. `PlannerCockpitWorkspace` procura publicaÃ§Ã£o apenas em `operationalPublications`; os briefings reais do `EditorialSnapshot` nÃ£o entram nessa resoluÃ§Ã£o. A tela de PublicaÃ§Ãµes jÃ¡ deriva registros reais de `snapshot.briefings`, confirmando a divergÃªncia de fontes.
5. `createDefinitiveContentPlan` inicializa `review.publicationStatus` como `not_started`, independentemente de uma publicaÃ§Ã£o legada jÃ¡ existir. O status precisa ser derivado no Planejador a partir de evidÃªncia de publicaÃ§Ã£o; nÃ£o deve ser regravado no ArticleDNA.
6. `savePlannerPlan` chama `createContentPlanSuccessor` com qualquer cÃ³pia de trabalho. `createContentPlanSuccessor` valida o schema, mas nÃ£o compara a identidade protegida com a publicaÃ§Ã£o confirmada. O `disabled` de slug/canonical no cockpit Ã© apenas apresentaÃ§Ã£o e nÃ£o protege payload, domÃ­nio ou versionamento.

## Fluxo real auditado

`ArticleDNA.keywordReferences` preserva cada KeywordDNA por `keywordId`, `keywordDnaVersionId` e hash. O Arquiteto envia o ArticleDNA ao Radar; `importArticlesToRadar` cria o RadarItem e pode anexar `RadarHydrationSnapshot`. O Radar confronta intenÃ§Ã£o/tÃ³picos com SERP e preserva o original, observado e conflito. Ao importar para o Planejador, `importRadarToPlanner` preserva o `radarItemId`, mas a hidrataÃ§Ã£o do Planejador nÃ£o reabre o RadarItem correspondente.

O ContentPlan v2 preserva referÃªncias compactas a KeywordDNA, ArticleDNA, SiloDNA, BrandDNA e evidÃªncias. A correÃ§Ã£o nÃ£o duplicarÃ¡ DNAs: o Planejador usarÃ¡ referÃªncias versionadas e o snapshot de hidrataÃ§Ã£o jÃ¡ existente. SiloDNA continuarÃ¡ entidade estratÃ©gica; SiloPage continuarÃ¡ unidade publicÃ¡vel independente.

## EstratÃ©gia de correÃ§Ã£o

- Adicionar ao input de hidrataÃ§Ã£o uma referÃªncia opcional ao `RadarHydrationSnapshot`/RadarItem, sem alterar o contrato obrigatÃ³rio de `PlannerItem`.
- Resolver keyword principal, secundÃ¡rias e reforÃ§os por correspondÃªncia explÃ­cita de IDs, aliases e versÃ£o esperada; nunca pela primeira keyword, slug ou texto reconstruÃ­do.
- Exibir o nome do silo a partir do DTO somente como `Silo`; marcar `SiloDNA` como nÃ£o hidratado quando o envelope versionado nÃ£o existir. Quando existir, mostrar versÃ£o e proveniÃªncia separadamente.
- Criar uma resoluÃ§Ã£o de publicaÃ§Ã£o somente leitura que combine `OperationalPublication`, registros de publicaÃ§Ã£o existentes e briefing real do snapshot. AusÃªncia ou conflito produzirÃ¡ `SituaÃ§Ã£o de publicaÃ§Ã£o nÃ£o confirmada`, nunca `Novo`.
- Derivar uma identidade publicada compacta no Planejador com marca, unidade, ArticleDNA, keyword principal, SiloDNA/SiloPage, slug, canonical e URL disponÃ­vel. NÃ£o criar contrato paralelo se os campos jÃ¡ existirem; manter o resultado interno e aditivo.
- Implementar uma guarda de domÃ­nio na criaÃ§Ã£o de sucessora. Para publicaÃ§Ã£o confirmada, slug, canonical, principalKeywordId, brandId, editorialUnitId e referÃªncia de unidade publicada permanecem iguais. Tentativa de alteraÃ§Ã£o deve retornar conflito explÃ­cito; atualizaÃ§Ã£o de seÃ§Ãµes, fontes, evidÃªncias, CTA, imagens, blocos e demais campos permitidos continua criando sucessora.
- Para estado desconhecido, proteger conservadoramente os campos estruturais e exibir mensagem simples ao usuÃ¡rio.

## Compatibilidade e consumidores

Os consumidores atuais de `hydratePlanner`, `PlannerPage`, `PlannerCockpitWorkspace`, ContentPlan v2, Radar e Redator permanecem compatÃ­veis. Campos de entrada novos serÃ£o opcionais. O Radar e o Arquiteto nÃ£o serÃ£o reconstruÃ­dos nem terÃ£o seus DNAs sobrescritos. A Ãºnica alteraÃ§Ã£o compartilhada prevista Ã© transportar uma referÃªncia de hidrataÃ§Ã£o jÃ¡ existente e, se necessÃ¡rio, reutilizar tipos de publicaÃ§Ã£o existentes.

## ProteÃ§Ã£o visual

O cockpit exibirÃ¡ `Publicado protegido` quando a publicaÃ§Ã£o for confirmada e manterÃ¡ valor, slug, canonical, marca e URL visÃ­veis. Os campos terÃ£o modo somente leitura, cadeado e explicaÃ§Ã£o curta; os detalhes tÃ©cnicos ficarÃ£o em painel recolhÃ­vel. Para ausÃªncia de confirmaÃ§Ã£o, usarÃ¡ `SituaÃ§Ã£o de publicaÃ§Ã£o nÃ£o confirmada` e manterÃ¡ a proteÃ§Ã£o.

## Snapshot e rollback

Snapshot: `git status --short` e auditoria dos arquivos acima em 2026-07-20. O checkout jÃ¡ estava muito sujo e todas as alteraÃ§Ãµes preexistentes serÃ£o preservadas. Rollback seletivo: reverter somente os hunks desta SDD, helpers de hidrataÃ§Ã£o/publicaÃ§Ã£o, guarda de sucessora, componentes do Planejador e testes adicionados. NÃ£o executar reset, checkout destrutivo, limpeza de localStorage/IndexedDB ou exclusÃ£o de dados.

## Testes e critÃ©rios de aceite

Fixtures cobrirÃ£o: principal por ID/versÃ£o e alias do Radar; secundÃ¡rias/reforÃ§os; ausÃªncia sem texto inventado; ArticleDNA/SiloDNA/SiloPage corretos; marca divergente; briefing publicado; publicaÃ§Ã£o operacional; status desconhecido; campos protegidos inalterÃ¡veis via payload; atualizaÃ§Ã£o editorial permitida; ausÃªncia de nova versÃ£o por hidrataÃ§Ã£o; ContentPlan v2 e envio ao Redator.

ValidaÃ§Ãµes: testes direcionados do Planejador/Radar/contratos afetados, TypeScript, ESLint direcionado, build e `git diff --check`. A validaÃ§Ã£o manual do artigo `trÃ¡fego pago vs orgÃ¢nico para clÃ­nica de estÃ©tica` serÃ¡ entregue em roteiro e depende de uma sessÃ£o com marca e dados reais disponÃ­veis.

## LimitaÃ§Ãµes

NÃ£o haverÃ¡ migration remota, escrita no Supabase, coleta SERP, chamada paga de IA, publicaÃ§Ã£o em CMS ou alteraÃ§Ã£o do artigo publicado. A URL publicada sÃ³ serÃ¡ exibida quando existir em `OperationalPublication`, registro de publicaÃ§Ã£o ou briefing/canonical vÃ¡lido; nenhum valor serÃ¡ inventado.

## Implementacao realizada â€” 2026-07-20

- Resolucao aditiva de identidade de publicacao em `lib/planejador/publication-identity.ts`, combinando OperationalPublication e briefing legado por marca/artigo; publicado, desconhecido e conflito nao caem em `Novo`.
- HidrataÃ§Ã£o do Planejador agora consome `RadarHydrationSnapshot`, resolve aliases por IDs e separa `Silo` de `SiloDNA`; a ausÃªncia do envelope versionado permanece explÃ­cita.
- Protecao de dominio em `createContentPlanSuccessor` preserva marca, unidade, artigo, silo, keyword principal, slug e canonical; mudanÃ§as editoriais permitidas continuam criando sucessora.
- O contexto aplica a mesma identidade no salvamento e na aprovaÃ§Ã£o, e o cockpit explica a proteÃ§Ã£o visualmente.
- Testes executados: 83 testes focados passaram; typecheck, ESLint direcionado, build Next.js e diff-check passaram.
- LimitaÃ§Ã£o: a sessÃ£o de navegador disponÃ­vel nÃ£o tinha marca selecionada; o artigo real nÃ£o foi declarado validado.
