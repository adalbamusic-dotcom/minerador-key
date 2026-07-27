# Spec — Planejador
## 25. Estratégia KGR, volume e cobertura de keywords

O Planejador consome a principal, as keywords de apoio, o KGR, o volume e a hierarquia já consolidados no ArticleDNA. Não reagrupa keywords, não escolhe a principal, não recalcula KGR, não altera ArticleDNA/KeywordDNA/SiloDNA e não muda slug, canonical, URL, marca ou hierarquia.

Um ContentPlan novo registra um snapshot opcional `keywordStrategy`: exatamente uma principal, zero a cinco apoios e teto de seis referências. A principal é o núcleo da intenção, promessa, público, resposta, objetivo, formato, profundidade, H1, fronteira e tópicos obrigatórios/excluídos. Apoios contribuem para volume, semântica, perguntas, entidades, objeções ou narrativa, sem exigência de virar heading.

O volume exibido é potencial de volume combinado. Somente valores conhecidos, válidos, compatíveis e da origem correta participam da soma; o painel informa contagem conhecida e sinaliza cobertura parcial ou indisponível. KGR só exibe selo quando há classificação recebida do Minerador/ArticleDNA, preservando score, resultados, cauda, versão e origem sem inferência. Conteúdo publicado mantém a relação histórica de slug/canonical/URL protegida.

O mapa de cobertura distingue `covered`, `partial`, `unassigned`, `outside_boundary`, `conflict` e `upstream_review`. A principal deve estar ligada ao H1, objetivo e ao menos uma seção principal; apoios podem ser ligados a seção, tópico, pergunta, entidade, objeção ou instrução. Conflitos impeditivos e divergências da decisão recebida bloqueiam a aprovação; decisões humanas permanecem explícitas.

## 1. Propósito
Converter pesquisa aprovada em plano editorial executável.
## 2. Responsabilidades
Importar Radar aprovado, criar ContentPlan, manter revisão e iniciar redação.
## 3. Fora de responsabilidade
Não coleta SERP nem edita o conteúdo final.
## 4. Entidades
PlannerItem, ContentPlan e referências a ArticleDNA/Radar.
## 5. Jornada
Importar Radar aprovado, preparar plano, revisar/aprovar e abrir Redator.
## 6. Regras de negócio
Apenas Radar aprovado entra; ContentPlan aprovado é requisito para iniciar escrita. **Verificado no código.**
## 7. Estados
Rascunho, planejando, pendente, aguardando revisão, aprovado e enviado ao Redator.
## 8. Ações
Importar, preparar plano, aprovar e iniciar escrita.
## 9. Entradas
RadarItem aprovado, ArticleDNA e contexto da marca.
## 10. Saídas
ContentPlan versionado e comando de abertura de documento.
## 11. Contratos com outros módulos
Consome Radar e fornece plano ao Redator.
## 12. Proteções
Marca, estado de origem, permissões e lock otimista.
## 13. Casos de borda
Plano ausente, lock vencido ou referência de ArticleDNA inválida.
## 14. Arquitetura técnica atual aprovada
`PlannerPage`, contratos de domínio e `/api/editorial/workflow`.
## 15. Critérios de aceite
Plano preserva as versões de origem e não abre Redator sem aprovação.
## 16. ContentPlan definitivo
Planos novos usam `schemaVersion: 2` de forma aditiva e preservam o envelope de versão existente. O bloco `planning` registra unidade editorial, intenção validada, ângulo, promessa, fronteira, H1/H2/H3, tópicos, perguntas, entidades, objeções, links e âncoras, fontes/evidências, CTA, imagens, Skills/prompts, metadados, carga do Radar e notas humanas.

Editar um plano cria uma sucessora com `previousVersionId`, `versionNumber + 1`, hash e motivo. Uma versão consolidada nunca é mutada. O plano só pode ser aprovado após validação da estrutura, marca/unidade, intenção e ausência de claims com `needs_source`; evidência mock ou SERP não aprovada não conta como evidência.

## 17. Fora do escopo atual
Redigir o artigo final, validar fontes externas automaticamente, coletar SERP, alterar DNAs de origem, publicar ou alterar conteúdo publicado.
## 18. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/planejador/page.tsx`, `modules/planejador/planner-page.tsx`, `components/planejador/content-plan-editor.tsx`, `lib/planejador/content-plan.ts` e testes direcionados.
## 19. Arquivos compartilhados consumidos
Contratos Arquiteto, fluxo/contexto/repositorio editorial.
## 20. Arquivos proibidos sem autorização
Radar, Redator, migrations e contratos compartilhados.

## 21. Cockpit hidratado
O Planejador mantém a grade operacional e oferece o detalhe `/{brandRef}/planejador/[contentPlanId]`. A camada de hidratação resolve os rótulos editoriais disponíveis no workspace e nunca transforma ID técnico em keyword, título, silo ou copy. Ausências usam `Referência não hidratada` com diagnóstico técnico separado. O detalhe diferencia observado, recomendação e decisão humana; Radar mock/local permanece identificado e Radar ausente é pendência explícita.

O gabarito é orientativo: aceita faixas de palavras/parágrafos, métricas derivadas e blocos especiais, sem gate de densidade rígida. Save sem mudança material não cria versão. Mudança material cria sucessora; aprovação permanece humana e a versão aprovada é imutável. O ContentDocument recebe `writingBrief` opcional com a versão e os detalhes estruturados do plano.

## 22. Organização do cockpit
O detalhe do Planejador é organizado em cinco etapas internas: Contexto, Estratégia, Estrutura, Recursos editoriais e Revisão/aprovação. A etapa Estrutura é o centro do trabalho e usa outline recolhível, gabarito editável e histórico local de desfazer/refazer. O resumo fixo deriva progresso e próxima ação de critérios aplicáveis; nenhum valor decorativo substitui uma lacuna real.

Workflow editorial, publicação e transferência são adaptados e exibidos separadamente. A aprovação continua humana e fica desabilitada quando o view model encontra bloqueios, com checklist e motivo navegável. Trocar de etapa, expandir ou validar sem mudança não cria versão; somente save material cria sucessora.

## 23. Integridade editorial e publicados

## 24. Contexto estrategico e identidade publicada

A etapa Estrategia pode carregar o BrandDNA aprovado pela rota existente da Marca e, quando presentes no workspace, materiais, Skills e prompts da marca ativa. Cada fonte e filtrada pelo `brandId`, selecionada explicitamente e registrada por referencia compacta em `strategyContext`; o conteudo integral de documentos/prompts nao e duplicado no ContentPlan. Aplicar contexto altera somente a copia de trabalho e preserva decisoes humanas existentes.

O ArticleDNA aceita `publishedIdentityRef` opcional para manter a relacao com a identidade publicada. `OperationalPublication`/`PublicationRecord` continua sendo a fonte canonica de status, marca, keyword principal, slug, canonical, URL estrutural e vinculo publicado; a referencia do ArticleDNA nao pode sobrescrever essa fonte. Divergencias bloqueiam a aprovacao/sucessora e mantem a protecao conservadora.

O Planejador resolve a identidade editorial por marca e artigo usando as referências versionadas do ArticleDNA, a hidratação rica do Radar e as fontes de publicação disponíveis. Keyword principal, silo, ArticleDNA, SiloDNA/SiloPage, marca, slug, canonical e URL estrutural não podem ser reconstruídos por posição, slug ou texto inventado.

A situação publicada é `Publicado protegido`; publicação desconhecida é `Situação de publicação não confirmada` e conflito é `Situação de publicação inconsistente`. Desconhecido e conflito mantêm proteção conservadora. A guarda de domínio rejeita alterações de identidade em sucessoras; seções, estratégia, fontes, links, CTA, imagens, blocos, instruções e metadados permitidos continuam editáveis e geram nova versão humana.
