# ADR-012 — Intenção editorial canônica e avaliação SERP KGR leve

## Status

Aceita para o módulo Arquiteto em 2026-07-21.

## Contexto

O avaliador tratava rótulos equivalentes como conflitos, confundia hierarquia editorial com formato de resultado e usava ausência em snippets como prova de ausência de cobertura. Em artigos KGR, a coleta automática de todas as keywords ainda criava baixa evidência e recomendações destrutivas desproporcionais.

## Decisão

O ArticleDNA passa a carregar `intentProfile`, cuja intenção principal vem da KeywordDNA da principal, com rótulo original e sinais individuais das secundárias. A comparação usa valores canônicos; CTA comercial não altera a intenção do artigo. Hierarquia e formato permanecem dimensões independentes e formato ausente não é inferido.

O Arquiteto normaliza snapshots no limite de consumo: conflitos por labels equivalentes, hierarquia usada como formato e ausência em snippets são removidos; a limitação fica registrada como `Cobertura não observada nos snippets`/`Evidência insuficiente`. Conflitos fortes permanecem sujeitos a confiança explícita.

`validationProfile` complementa `assessmentMode`. KGR confirmado usa `kgr_light`, consulta a principal e amplia somente diante de ambiguidade real. Todas as referências de KeywordDNA permanecem no assessment, enquanto `queriedKeywordDnaIds` registra o subconjunto consultado. Separação/retirada exige confiança alta; baixa ou inconclusiva gera revisão humana.

Uma nova avaliação não substitui a anterior. A avaliação antiga recebe estado `outdated` com a mensagem `Desatualizado por correção do avaliador`, e a nova execução explícita cria a versão seguinte.

## Consequências

- A intenção principal fica auditável e visível no ArticleDNA.
- KGR reduz custo e evita desmontar artigos por SERP pouco consistente.
- Assessments legados continuam preservados e distinguíveis de avaliações atuais.
- Radar, seu avaliador e sua UI/workflow não são alterados nesta decisão.

## Rollback

Ignorar a nova avaliação ou decisão humana mantém o assessment anterior e a cópia de trabalho. Não há limpeza de armazenamento, escrita remota, migration ou chamada real de provider no rollback.

## Evidência

`tests/arquiteto-serp-formation.test.mts`, `npm run test:arquiteto` (70/70), validação de proveniência editorial, TypeScript e lint/build do escopo.
