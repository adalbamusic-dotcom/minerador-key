# SDD — Contexto estratégico da marca e identidade publicada no Planejador

## Status

Proposta autorizada pelo briefing da tarefa, com implementação local e aditiva condicionada à preservação do checkout já alterado. A mudança pertence ao Planejador; contratos compartilhados só receberão campos opcionais necessários para rastreabilidade.

## Objetivo

Permitir que a etapa Estratégia consulte seletivamente o contexto real da marca, registre a origem do que foi aplicado na cópia de trabalho e mantenha a separação entre observado, recomendação e decisão humana. Em paralelo, o ArticleDNA passa a poder carregar uma referência compacta da identidade publicada, sem se tornar a fonte canônica da publicação.

## Limites

Não criar BrandDNA, materiais, Skills ou prompts; não criar upload; não gerar conteúdo; não coletar SERP; não publicar; não migrar dados; não escrever no Supabase remoto; não limpar localStorage/IndexedDB; não reconstruir Marca, Arquiteto, Radar, Redator ou Publicações.

## Estado auditado

- BrandDNA versionado é lido pela rota existente `/api/marca/brand-dna`; a versão aprovada é derivada pelos eventos de status. A persistência remota depende da migration já prevista e não será confirmada nem alterada nesta tarefa.
- `BrandSkill`, `BrandPrompt` e `BrandMaterial` são contratos de consumo e estado local do pipeline. Não existe persistência própria confirmada; a interface exibirá origem e disponibilidade sem afirmar persistência.
- A publicação operacional (`OperationalPublication`, equivalente atual do `PublicationRecord`) e o briefing legado são fontes de reconciliação já consumidas pelo Planejador. A fonte operacional publicada vence para slug, URL e status; o briefing é adaptador de leitura legado.
- O ArticleDNA é versionado e imutável. A referência publicada será opcional e retrocompatível; nenhuma versão histórica será reescrita.

## Decisões

### Contexto estratégico

1. Criar em `lib/planejador/strategic-context.ts` uma composição pura e compacta do BrandDNA aprovado, marca legada, materiais, Skills e prompts pertencentes à marca ativa.
2. Filtrar cada entrada por `brandId` antes da composição. Dados de outra marca não aparecem nem são aplicados.
3. Exibir no Planejador apenas resumo, nome, versão, propósito, origem e estado. O conteúdo completo de prompt/documento não entra no ContentPlan.
4. A ação `Usar contexto da marca` aplica somente valores ausentes ou pendentes na cópia de trabalho. Campos já decididos pelo humano permanecem intactos.
5. Registrar no ContentPlan apenas referências compactas (`strategyContext.sourceRefs`) e a decisão/aplicação, sem duplicar documentos ou prompts. A seleção é idempotente por ID.
6. Materiais, Skills e prompts não disponíveis continuam ausentes; nenhuma frase, regra ou fonte será inventada.

### ArticleDNA e publicação

1. Adicionar a `ArticleDNASchema` o campo opcional `publishedIdentityRef`, com `publicationStatus: "published_protected"`, slug e URL/canonical quando realmente disponíveis.
2. O `OperationalPublication`/`PublicationRecord` publicado continua sendo a fonte canônica de status, slug, canonical, URL, marca, keyword principal e vínculo estrutural. O ArticleDNA só referencia essa identidade para proveniência.
3. O adaptador de publicação existente poderá aproveitar a referência do ArticleDNA como evidência de vínculo, mas nunca usará esse campo para sobrescrever um registro publicado ou inventar URL.
4. Em caso de divergência, o Planejador mostra conflito e mantém a proteção conservadora já existente.

### Usabilidade

- A Estratégia mostrará primeiro resumo em linguagem simples, ação explícita e estados vazios úteis.
- Observado, Recomendação e Decisão humana continuam em blocos separados.
- IDs, hashes, origem técnica e versão completa ficam em `details`/proveniência recolhida.
- Publicação confirmada continua como `Publicado protegido`; desconhecida continua como `Situação de publicação não confirmada`, nunca `Novo`.

## Arquivos e consumidores

### Proprietários do Planejador

- `lib/planejador/strategic-context.ts`
- `lib/planejador/publication-identity.ts`
- `components/planejador/planner-cockpit-workspace.tsx`
- testes focados e documentação de Planejador

### Compartilhados, somente aditivos

- `lib/arquiteto/contracts.ts`: campo opcional de referência publicada no ArticleDNA e referências de contexto no ContentPlan.
- `components/editorial-pipeline-context.tsx`: somente se o salvamento precisar transportar as referências da cópia de trabalho; não haverá novo armazenamento paralelo.

Consumidores afetados: Arquiteto/ArticleDNA, ContentPlan v2, cockpit do Planejador, writing brief do Redator e testes de contratos. Nenhum consumidor terá campo obrigatório alterado.

## Persistência e versionamento

Carregar ou selecionar contexto não cria versão. A aplicação altera apenas a cópia de trabalho. O salvamento humano usa `createContentPlanSuccessor`; sem mudança material preserva a versão, com mudança material cria sucessora. Versão aprovada continua imutável. A referência do ArticleDNA é somente contrato/versionamento aditivo e não autoriza escrita remota nesta tarefa.

## Snapshot e rollback

O snapshot é o checkout sujo auditado nesta execução, preservado sem reset, clean ou checkout destrutivo. O rollback é seletivo: remover somente os arquivos e hunks desta SDD, mantendo todas as alterações pré-existentes. Não há operação de banco, storage ou publicação para desfazer.

## Testes

Fixtures determinísticas cobrirão: BrandDNA aprovado da marca correta; outra marca bloqueada; ausência de BrandDNA/material sem invenção; Skills e prompts filtrados, aplicados e idempotentes; preservação de decisões humanas; referências de contexto; ArticleDNA com identidade publicada; publicação operacional como fonte canônica; divergência protegida; compatibilidade de ContentPlan v1/v2. Executar testes direcionados, TypeScript, ESLint dos arquivos alterados, build e `git diff --check`, sem chamadas pagas ou externas.

## Limitações a reportar

Materiais, Skills e prompts só serão mostrados quando já existirem no estado local; sua persistência própria continua pendente. BrandDNA remoto depende da infraestrutura/migration existente. A validação visual autenticada e o artigo real permanecem manuais. Nenhum campo ausente será completado por inferência.
