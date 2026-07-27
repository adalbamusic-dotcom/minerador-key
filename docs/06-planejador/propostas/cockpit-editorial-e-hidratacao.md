# SDD — Cockpit editorial e hidratação do Planejador

## Status

Implementação autorizada pelo briefing desta sprint, mantendo o módulo proprietário Planejador e mudanças compartilhadas somente aditivas, compatíveis e necessárias para transportar o briefing ao Redator.

## Problema observado

O Planejador já cria e versiona o ContentPlan definitivo v2, mas a tela principal ainda expõe principalmente contagens, IDs técnicos e uma expansão compacta. Não existe uma visão consolidada que resolva a identidade editorial, diferencie dado observado de recomendação e decisão humana, mostre a ausência de Radar sem inventar conteúdo, permita revisar um gabarito completo e preserve a proveniência até o Redator.

O workspace local já carrega `EditorialSnapshot`, ArticleDNA, SiloDNA, SiloPage, registros SERP, revisões, planos, documentos e eventos. O problema é de composição e inspeção no Planejador, não de reconstrução do Radar, Arquiteto, Tiptap ou do grid operacional.

## Contratos e comportamento preservados

- `ContentPlan` v1/v2 e o envelope versionado continuam compatíveis; campos novos serão opcionais/default.
- A unidade proprietária continua sendo Planejador: importar Radar aprovado, hidratar, editar plano, validar, aprovar e transferir.
- ArticleDNA, KeywordDNA, SiloDNA, SiloPage e Radar permanecem fontes de leitura; não serão mutados pelo cockpit.
- Seleção da grade não controla renderização. Conteúdo válido nunca é substituído por estado vazio.
- Uma versão aprovada é imutável. Salvar sem mudança material não cria sucessora; mudança material cria sucessora com `previousVersionId`, hash e motivo.
- Conteúdo publicado mantém slug, canonical, keyword principal, marca e URL estrutural protegidos.
- `no_page` e unidade sem estrutura publicável não são enviados ao Redator.
- Mocks continuam identificados como mock e não contam como evidência real.

## Arquitetura proposta

1. `lib/planejador/hydration.ts` compõe uma visão somente de leitura a partir do snapshot da marca e dos artefatos já presentes no contexto. Toda referência possui rótulo editorial, origem e diagnóstico técnico separado. Quando não resolver, o texto exibido é exatamente `Referência não hidratada`; ID, tipo, origem, versão esperada e motivo ficam em detalhe técnico.
2. `lib/planejador/outline.ts` concentra operações puras de estrutura, cálculo de métricas, validação de órfãos e comparação material. Nenhuma função escreve artigo ou chama provedor externo.
3. `lib/arquiteto/contracts.ts` recebe apenas campos opcionais do gabarito, blocos de planejamento, perguntas/entidades/objeções e briefing de transferência. O contrato atual permanece aceito.
4. `app/(brand)/[brandRef]/planejador/[contentPlanId]/page.tsx` abre um cockpit dedicado; a grade `/{brandRef}/planejador` continua sendo o ponto de entrada e ganha apenas resumo hidratado e ação de abertura.
5. O contexto existente continua sendo o adaptador de persistência. Ações do cockpit geram sucessoras locais e eventos de workflow pelos caminhos já existentes; não há migration, escrita remota, limpeza de localStorage/IndexedDB ou mudança global de navegação.

## Modelo visual

### Grade preservada

As colunas principais passam a usar rótulos hidratados: unidade/tipo/título, keyword principal, silo/hierarquia, intenção validada, versão Radar, versão ContentPlan, conflitos, pendências, status editorial/publicação/transferência e ações. IDs continuam disponíveis somente no detalhe de proveniência.

### Cockpit dedicado

O detalhe é separado em painéis de visão geral; DNA/contexto; SERP/benchmark; estrutura; gabarito; perguntas/entidades/objeções; links/fontes/evidências; CTA/imagens/metadados; validação e versões. Cada painel separa `Observado`, `Recomendação do Planejador` e `Decisão humana`.

Campos de copy do plano são editáveis. DNAs, snapshots e fontes de origem são herdados como leitura; qualquer classificação ou override vira decisão explícita no plano. O cockpit não produz parágrafos.

## Hidratação e ausência

A resolução deve considerar, quando disponíveis, `brandId`, ArticleDNA, SiloDNA, SiloPage, KeywordDNA refs, snapshot de keywords/silos, RadarResearchSnapshot, revisão SERP, fontes/evidências, plano anterior e ContentDocument associado. A camada não duplica os DNAs e não usa somente IDs como texto.

Se a referência não existir, tiver marca incompatível, versão divergente ou o dado não estiver carregado, o painel mostra `Referência não hidratada` com diagnóstico técnico e razão esperada. SERP ausente aparece como `Radar ausente`/`benchmark indisponível`, nunca como benchmark inventado. Fonte sem URL aprovada aparece como `Fonte necessária antes da aprovação`.

## Versionamento, aprovação e transferência

O snapshot de trabalho é comparado sem campos voláteis de revisão. Save sem mudança material preserva a mesma versão. Mudança material gera sucessora; editar aprovado trabalha numa cópia. O plano aprovado não é sobrescrito por nova carga Radar: o cockpit mostra `Atualização disponível` e permite incorporação seletiva.

Ao enviar ao Redator, o documento recebe referência da versão do plano e briefing estruturado com estratégia, H1/outline, extensão/gabarito, perguntas, entidades, objeções, tópicos, evidências, fontes, links, âncoras, CTA, imagens, blocos, metadados, Skills, instruções do Guardião, alertas e proveniência. A operação é idempotente por unidade e versão, não cria ContentDocument duplicado e não sobrescreve documento existente.

## Snapshot e rollback

O snapshot de referência é o `git status --short` e os arquivos/linhas observados nesta auditoria em 2026-07-20. O rollback é seletivo: remover somente os arquivos novos do Planejador e os hunks aditivos desta SDD, preservando alterações já existentes no checkout. Não executar reset, checkout destrutivo ou limpeza de armazenamento.

## Arquivos e consumidores

Pertencem ao Planejador: `lib/planejador/hydration.ts`, `lib/planejador/outline.ts`, `components/planejador/*`, `app/(brand)/[brandRef]/planejador/*`, `modules/planejador/*`, testes direcionados e esta documentação.

Compartilhados, somente quando necessário: `lib/arquiteto/contracts.ts` (consumidores Arquiteto, Planejador e Redator), `lib/editorial/operational-flow.ts` e `components/editorial-pipeline-context.tsx` (workflow e persistência local), `lib/editorial/persistence-contracts.ts`/rota existente (validação do envelope). Nenhuma tabela, migration, contrato do Radar ou editor Tiptap será reconstruído.

## Riscos e compatibilidade

- Artefatos legados podem não ter texto suficiente para hidratar; devem ser marcados, não preenchidos por inferência.
- O snapshot atual pode ter SERP mock/local; a origem e o modo de persistência permanecem visíveis.
- O fallback local pode não equivaler a persistência remota confirmada; o cockpit não exibirá sucesso remoto sem confirmação.
- Mudanças no contrato compartilhado são aditivas, com defaults e regressão dos testes existentes.

## Testes e aceitação

Testes puros cobrirão hidratação, IDs não editoriais, marca incorreta, ausência explícita, outline/gabarito, órfão H3, cálculo de métricas, comparação material, artigo/SiloPage, fontes sem URL e proteção de publicados. Testes de contexto cobrirão reload, ausência sem esvaziamento, aprovação imutável, save sem mudança, sucessora e transferência idempotente sem duplicação.

Validação manual obrigatória: abrir `/planejador`, localizar artigo Radar, verificar hidratação e painéis, editar H1/H2/H3, mover/reordenar, alterar gabarito/pergunta/entidade/link/fonte/CTA/imagem, salvar e recarregar, confirmar que save sem mudança não gera versão, confirmar sucessora material, validar, aprovar, enviar ao Redator duas vezes e conferir o mesmo documento e a versão correta. A execução real não faz parte desta sprint automatizada.

## Limitações declaradas

Não haverá chamada paga de IA, coleta SERP, geração de imagem, escrita remota, migration, publicação ou alteração do artigo final nesta implementação. Benchmark depende de Radar real aprovado; ausência permanece pendência humana.

## Aditivo — organização guiada e editor central

### Estado encontrado

O cockpit dedicado inicial foi entregue como uma página com todos os painéis abertos. A hidratação, o ContentPlan v2, a grade e a rota já existentes serão preservados. Os problemas desta sprint são de hierarquia visual, fluxo, labels, estado derivado e ergonomia do editor.

### Decisão de composição

O cockpit será organizado em cinco etapas internas sem alterar a navegação global: Contexto, Estratégia, Estrutura, Recursos editoriais e Revisão/aprovação. A etapa Estrutura será o centro da experiência; as demais funcionarão como contexto, preparação e fechamento do plano. A etapa ativa será persistida apenas como estado de interface local, nunca como nova versão.

Um view model exclusivo do Planejador derivará resumo, progresso, próxima ação, alertas, status traduzidos e habilitação de aprovação a partir do ContentPlan/hidratação/documento/publicação já existentes. O view model não escreverá dados nem duplicará o contrato central.

### Progresso e regras de estado

O progresso será a razão de critérios concluídos sobre critérios aplicáveis: identidade/keyword principal hidratada, estratégia mínima, H1 e H2 válidos, perguntas associadas ou explicitamente ausentes, fontes resolvidas ou marcadas como necessárias, CTA, gabarito informativo, conflitos e pendências. Critérios não aplicáveis não entram no denominador. O resumo exibirá valores explicativos para lacunas, nunca zero decorativo.

Aviso, pendência, conflito e bloqueio serão apresentados separadamente. Workflow editorial, publicação e transferência terão adaptadores de labels próprios. A aprovação ficará visível, porém desabilitada quando o validador retornar bloqueios, com ligação para a etapa Revisão e a quantidade de pendências.

### Editor central

O editor da Estrutura usará uma árvore/outline compacta e recolhível. Cada seção mostrará nível, título, função, faixa de palavras, itens associados e alertas; campos completos só aparecerão ao expandir. Operações de adicionar, editar, remover, reordenar, mover e converter H2/H3 usarão as funções puras existentes, com histórico de trabalho local para desfazer/refazer. Keywords secundárias/reforços serão associação editorial, não headings automáticos.

### Compatibilidade, snapshot e rollback

Nenhum contrato, schema remoto, migration, Radar, Redator ou persistência será alterado nesta etapa. O snapshot é o worktree auditado em 2026-07-20, preservando as alterações pré-existentes. Rollback: remover somente os novos componentes/view models/testes e reverter seus hunks; não usar reset, checkout destrutivo ou limpeza de recovery.

### Arquivos previstos

Proprietários: `components/planejador/planner-cockpit-workspace.tsx`, `components/planejador/planner-outline-editor.tsx`, `lib/planejador/cockpit-view-model.ts`, testes do Planejador e documentação. O uso de `components/editorial-pipeline-context.tsx`, contratos e da referência histórica `components/product/operational-pages.tsx` será evitado; se um ajuste compartilhado se tornar necessário, será aditivo, documentado e testado antes da alteração.
