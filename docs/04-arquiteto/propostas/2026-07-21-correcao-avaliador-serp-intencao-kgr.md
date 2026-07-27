# SDD â€” CorreÃ§Ã£o semÃ¢ntica do avaliador SERP e perfil KGR leve

**MÃ³dulo proprietÃ¡rio:** Arquiteto
**Data:** 2026-07-21
**Status:** implementado em cÃ³digo, sujeito Ã  validaÃ§Ã£o manual autenticada

## Problema

O avaliador consumido pelo Arquiteto compara rÃ³tulos de intenÃ§Ã£o sem normalizaÃ§Ã£o, usa a hierarquia editorial (`Pilar`/`Suporte`) como se fosse formato de SERP e promove ausÃªncia textual em snippets a conflito. A rota tambÃ©m coleta automaticamente todas as keywords de um grupo, inclusive quando hÃ¡ vÃ­nculo KGR confirmado, e a persistÃªncia de uma nova avaliaÃ§Ã£o substitui semanticamente a anterior.

HÃ¡ ainda perda de proveniÃªncia no caminho Minerador â†’ contrato editorial â†’ Arquiteto para URL publicada, canonical, slug e estado publicado, alÃ©m de baixa visibilidade da intenÃ§Ã£o principal e de uma contagem que pode sugerir que a principal nÃ£o faz parte do bundle de KeywordDNA.

## DecisÃ£o

1. Criar um normalizador determinÃ­stico de intenÃ§Ãµes no Arquiteto. `Informativo` e `Informacional` convergem para `informational`, preservando o rÃ³tulo original. A intenÃ§Ã£o do artigo vem exclusivamente da KeywordDNA da principal; secundÃ¡rias e reforÃ§os permanecem individuais como sinais de compatibilidade.
2. Separar hierarquia editorial de formato observado/esperado na SERP. Se nÃ£o houver formato explÃ­cito no ArticleDNA/KeywordDNA, o estado serÃ¡ `Formato editorial esperado nÃ£o definido` e nÃ£o haverÃ¡ comparaÃ§Ã£o com `Suporte` ou `Pilar`.
3. Sanitizar no limite Arquiteto o diagnÃ³stico recebido, retirando conflitos derivados somente de rÃ³tulos equivalentes, hierarquia usada como formato ou ausÃªncia em snippets. A ausÃªncia vira limitaÃ§Ã£o `Cobertura nÃ£o observada nos snippets`/`EvidÃªncia insuficiente`.
4. Adicionar `standard`, `kgr_light`, `published_architecture` e `published_strengthening` como perfil complementar ao `assessmentMode`. KGR confirmado consulta a principal primeiro e sÃ³ amplia a coleta quando a evidÃªncia principal for ambÃ­gua/conflitante; o assessment preserva todas as referÃªncias, mas registra apenas as keywords efetivamente consultadas.
5. Adicionar confianÃ§a explÃ­cita Ã s recomendaÃ§Ãµes. SeparaÃ§Ã£o/retirada sÃ³ pode ser sugerida com sinais fortes e confianÃ§a alta; evidÃªncia baixa ou inconclusiva resulta em revisÃ£o humana.
6. Preservar a avaliaÃ§Ã£o antiga no histÃ³rico. Ao persistir a nova avaliaÃ§Ã£o, a anterior Ã© marcada como `Desatualizado por correÃ§Ã£o do avaliador`, sem sobrescrever seu payload. Uma nova execuÃ§Ã£o explÃ­cita gera a v2.
7. Corrigir a proveniÃªncia de URL/canonical/slug/status no contrato de entrada e exibir no ArticleDNA: intenÃ§Ã£o principal e origem, compatibilidade individual, KGR, publicaÃ§Ã£o, URL e canonical.

## Contratos e compatibilidade

As mudanÃ§as de contrato sÃ£o aditivas e opcionais para leitura de legado. `mainIntent` passa a ser canÃ´nico nos novos ArticleDNAs, enquanto `intentProfile.originalLabel` preserva o dado recebido. `keywordDnaReferences` continua contendo a principal e todas as secundÃ¡rias; `queriedKeywordDnaIds` explicita o subconjunto consultado no perfil KGR.

O Radar nÃ£o serÃ¡ alterado. Nenhuma UI/workflow vizinho, migration, escrita remota, chamada real de provider ou chamada paga de IA faz parte desta etapa.

## Rollback e validaÃ§Ã£o

O rollback Ã© por artefato versionado: assessments anteriores e referÃªncias de KeywordDNA permanecem recuperÃ¡veis; a nova avaliaÃ§Ã£o pode ser ignorada sem alterar a cÃ³pia de trabalho. Validar com fixtures e suites focadas do Arquiteto/fluxo operacional, TypeScript, lint dos arquivos alterados, build e `git diff --check`. ValidaÃ§Ã£o browser autenticada, schema remoto/RLS e coleta Serper real permanecem limitaÃ§Ãµes explÃ­citas.
