# ADR-013 — ArticleDNA como contexto estratégico central

## Status

Aceita para implementação local em 2026-07-21.

## Decisão

O Arquiteto mantém `ArticleDNA` como fonte estratégica do artigo e adiciona projeções determinísticas de intenção, KGR, volume, hierarquia e propósito. Um `ArticleControlContext` derivado transporta essa visão para IA, SERP e transferências operacionais.

As extensões são opcionais e retrocompatíveis. Consumidores não recebem cópias equivalentes de cada regra: Radar recebe um contexto opcional único e pode continuar hidratando o ArticleDNA pela referência versionada.

## Motivos

- A principal e sua intenção devem ser identificadas antes da SERP profunda.
- KGR confirmado depende do vínculo principal–slug, não de score, volume ou similaridade.
- Volume bruto, volume ajustado e sobreposição precisam ser distinguidos.
- Reforço narrativo não pode receber volume artificial.
- Hierarquia precisa considerar centralidade, abrangência, silo e negócio, além de volume.
- Publicados exigem proteção de identidade sem congelar uma principal ainda candidata.

## Consequências

- ArticleDNA novo possui contexto estratégico auditável e explicável.
- IA pode enriquecer a cópia de trabalho, mas não substitui os campos estratégicos determinísticos.
- O Radar recebe contexto adicional sem mudança de UI ou workflow.
- Fixtures antigas continuam válidas porque os campos são opcionais.
- Provider/SERP reais, navegador autenticado e schema remoto continuam validações separadas.

## Rollback

Remover as projeções opcionais e o campo opcional de transferência restaura a leitura anterior. Não é necessário reprocessar dados, limpar storage ou alterar publicação existente.
