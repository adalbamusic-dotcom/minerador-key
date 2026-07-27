# SDD — Estratégia KGR, volume agregado e cobertura de keywords no ContentPlan

## Status

Proposta para implementação no módulo Planejador.

## Contexto

O Planejador recebe um ArticleDNA já formado pelo Arquiteto e evidências do Radar. A interface precisa tornar interpretável a relação entre keyword principal, keywords de apoio, volume conhecido, identidade KGR, hierarquia do silo e cobertura do outline. O erro não deve ser resolvido aceitando um plano incompleto nem deslocando para o Planejador responsabilidades de formação, agrupamento ou cálculo de KGR.

## Decisão proposta

1. Consumir, sem recalcular ou sobrescrever, `ArticleKeywordStrategy`, `ArticleVolumeStrategy`, `ArticleHierarchyStrategy` e `ArticleKgrIdentity` presentes no ArticleDNA.
2. Adicionar ao contrato de `ContentPlanDetails` um bloco opcional e retrocompatível de estratégia de keywords. O bloco será um snapshot compacto da decisão recebida e da sua interpretação no outline:
   - uma principal e no máximo cinco secundárias;
   - volumes individuais conhecidos, soma conhecida e indicação de cobertura parcial/indisponível;
   - evidência KGR somente quando a identidade recebida estiver classificada como KGR;
   - coerência do slug, com proteção histórica para conteúdo publicado;
   - papel e ordem hierárquica recebidos do silo/ArticleDNA;
   - cobertura da principal e das secundárias, sem exigir que uma secundária vire H2;
   - conflitos, fora da fronteira, revisão upstream e origem da informação.
3. Criar funções puras no Planejador para construir a leitura e validar a interpretação. A função não agrupará keywords, não escolherá a principal, não alterará DNA, URL, slug, canonical, marca ou hierarquia.
4. Exibir um painel compacto em Contexto/Estratégia e uma abertura de detalhes técnicos. A associação de uma keyword a uma seção, quando exposta na cópia de trabalho, será uma decisão humana registrada no snapshot; nenhum heading será criado automaticamente.
5. Integrar os critérios ao checklist/alertas do cockpit. Conflitos impeditivos, principal sem cobertura e mudança de intenção dominante podem bloquear a aprovação; lacunas factuais permanecem pendências explícitas.

## Limites de módulo e consumidores

Proprietário: `lib/planejador` e `components/planejador`.

Consulta somente leitura: contratos e estratégias do Arquiteto, hidratação do Radar, identidade de publicação e fluxo operacional. O ajuste compartilhado em `lib/arquiteto/contracts.ts` será apenas aditivo e opcional, para transportar o snapshot no ContentPlan; os consumidores existentes continuam válidos.

Consumidores avaliados: construção/sucessão do ContentPlan, view model do cockpit, workspace do cockpit, pipeline editorial que salva o plano, testes de contrato e de aprovação. Redator e Publicações continuam recebendo o ContentPlan existente; não haverá mudança de geração, publicação ou persistência remota.

## Regras de integridade

- Uma principal é obrigatória; de zero a cinco secundárias são permitidas; seis keywords é teto, não objetivo.
- A principal conserva intenção dominante, promessa, público, resposta, objetivo, formato, profundidade, H1, fronteira, tópicos obrigatórios/excluídos, slug e vínculo KGR recebidos.
- Secundárias apenas reforçam volume, cobertura semântica, perguntas, entidades, objeções ou narrativa compatível.
- Volume agregado é potencial de volume combinado, nunca promessa de tráfego. Valores ausentes, inválidos, incompatíveis ou de outra marca não entram na soma.
- KGR não é inferido por score, similaridade textual ou slug. A classificação e a evidência vêm do Minerador/ArticleDNA.
- Para item novo, coerência entre principal e slug gera alerta determinístico. Para publicado, a relação histórica é preservada e os campos publicados permanecem protegidos.
- A hierarquia é consumida com papel, ordem e justificativa disponíveis; não é recalculada no Planejador.
- Links exibem apenas destinos/evidências já recebidos.

## Snapshot, rollback e compatibilidade

Antes da implementação foi preservado o estado lógico do checkout sujo por meio da inspeção do diff e da listagem de arquivos. Não será executado reset, limpeza ou checkout destrutivo. O rollback desta mudança é seletivo: remover o novo helper, os campos opcionais do contrato, as integrações do builder/view model/UI e os testes/documentação desta proposta, mantendo as alterações preexistentes do Planejador.

O campo novo será opcional para ler planos legados. Novos ContentPlans definitivos passarão a carregar o snapshot. Sucessores preservarão a identidade publicada e atualizarão apenas a cópia de trabalho e as decisões humanas permitidas.

## Verificação

Serão usados fixtures locais, sem API, SERP, provider ou IA. A validação inclui testes unitários do snapshot/soma/cobertura/KGR/proteções, testes de contrato e aprovação do Planejador, TypeScript, ESLint focado, build, `git diff --check` e um script manual determinístico. Não será declarada validação end-to-end autenticada, remota ou de navegador sem executá-la.

## Fora de escopo

Reagrupar keywords, escolher ou trocar principal, recalcular KGR, criar ArticleDNA/KeywordDNA/SiloDNA, alterar schema remoto, migrar dados, consultar SERP, scraping, geração de texto/imagem, publicação ou reconstrução do cockpit.
