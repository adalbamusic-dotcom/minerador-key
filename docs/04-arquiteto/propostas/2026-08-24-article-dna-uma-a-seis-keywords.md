# SDD — ArticleDNA com uma principal e até cinco apoios

## Status

Implementada localmente como correção de alinhamento do fluxo mínimo do
Arquiteto em 2026-08-24. Não há migration, SQL remoto ou alteração de schema.

## Contexto

O `ArticleDNA` já aceitava uma `keywordReferences` principal e até cinco
referências de apoio (`secondaryKeywordIds` + `narrativeReinforcementIds`). O
gate operacional compartilhado ainda rejeitava artigos com uma única keyword e
exigia artificialmente duas referências.

Isso contrariava a regra desta fase: uma principal é suficiente; até cinco
secundárias/reforços são permitidas; seis é teto, não meta.

## Decisão

`MIN_KEYWORDS_PER_APPROVED_ARTICLE` passa de 2 para 1. O máximo permanece 6.
O ArticleDNA continua exigindo exatamente uma principal, silo, hierarquia,
slug válido e aprovação humana. Nenhuma keyword é inventada para completar o
artigo.

## Consumidores e compatibilidade

O ajuste atua no helper comum `articleApprovalIssues`, usado pela confirmação
do Arquiteto e pela entrada aprovada do Radar. Não altera a UI interna do
Radar, nem seu provider ou investigação posterior. ArticleDNAs existentes com
duas a seis keywords continuam válidos sem regravação.

## Riscos e rollback

O risco é liberar para o próximo estágio artigos de uma única keyword quando a
decisão humana assim confirmar. Isso é intencional e fica limitado ao gate
humano; IA, SERP e volume não aprovam automaticamente.

Rollback local: restaurar a constante para 2 e a mensagem/teste para 2–6.
Não existe operação remota para executar ou desfazer.

## Testes e validação

- uma principal com aprovação humana: aceita;
- sete referências: rejeitada;
- silo ausente: continua bloqueando;
- `test:arquiteto`, `test:operational`, TypeScript, build e validação manual
  permanecem gates separados;
- smoke autenticado do Arquiteto → Radar ainda precisa ser executado pelo
  usuário com a conexão remota disponível.
