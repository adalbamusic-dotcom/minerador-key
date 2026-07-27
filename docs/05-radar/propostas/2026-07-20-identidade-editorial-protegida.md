# SDD — Identidade editorial e proteção compreensível no Radar

## Escopo

Adicionar uma camada de apresentação no Radar para tornar visíveis a identidade recebida do Arquiteto, os DNAs, o silo, a publicação e o próximo passo. A mudança é de leitura e orientação; não altera ArticleDNA, KeywordDNA, SiloDNA, slug, canonical, marca ou URL publicada.

## Decisão

- Artigos publicados exibem `Publicado e protegido` e seus campos estruturais em modo somente leitura, com explicação tranquilizadora.
- Artigos novos também permanecem somente leitura no Radar e apontam a revisão da formação para o Arquiteto.
- IDs técnicos ficam em `Ver proveniência e IDs`, recolhidos por padrão.
- O Resumo apresenta `Identidade editorial`, `Estratégia recebida do Arquiteto`, `Contexto do silo` e `Estratégia recebida x busca observada`.
- A página oferece progresso e `Próxima ação` por aba, sem criar versão por reload, troca de aba ou edição temporária.
- A justificativa de keyword só bloqueia a aprovação quando a decisão registrada for revisão no Arquiteto; keywords sem conflito permanecem contexto.

## Limites

Não haverá alteração compartilhada de workflow, persistência, coleta Serper, scraping, migration, Planejador ou Publicações. O status de publicado é somente derivado dos registros já hidratados no workspace.

## Rollback

Reverter os componentes/helper do Radar e a regra de gate de aprovação. Os DNAs, snapshots, publicações e ContentPlans não são escritos por esta alteração.

## Validação

Fixtures cobrirão publicado protegido, artigo novo somente leitura, nomes/versões de silo e DNA, comparação de intenção normalizada, ausência de snippet sem conflito, justificativa somente para conflito, ausência de nova versão por interação de leitura e isolamento por marca.
