# SDD — SERP de formação e SERP de fortalecimento

## Status

Proposta aprovada nesta tarefa para o módulo Arquiteto. A mudança é aditiva no assessment e não altera a integração Serper, snapshots ou associação por KeywordDNA.

## Decisão

O assessment preservará o `mode` de coleta legado e receberá `assessmentMode` explícito:

- `formacao`: artigo sem publicação, no qual a SERP pode sugerir mudanças de agrupamento e papel;
- `fortalecimento`: artigo publicado, no qual a principal, slug, canonical, URL e marca são restrições de entrada.

Assessments legados sem `assessmentMode` serão interpretados como `formacao` por compatibilidade. A evolução complementar aceita também `arquitetura_publicado`; sua resolução usa o contexto rico do KeywordDNA, não apenas `publishedAnchorId`.

Para publicados, URL, slug, canonical e marca continuam protegidos. A principal só é protegida com relação `confirmed_primary` e arquitetura `architecture_confirmed`, ou com KGR confirmado e vínculo principal+slug explícito. KGR candidato, score KGR isolado e semelhança textual permanecem editáveis.

## Regras de domínio

Em `formacao`, a recomendação mantém as ações estruturais já existentes e a decisão humana pode alterar somente a cópia de trabalho.

Em `fortalecimento`:

- a principal publicada nunca será candidata a troca, remoção ou reclassificação;
- conflitos da principal geram `fortalecer_intencao` ou `revisar_conteudo`, preservando o diagnóstico técnico;
- secundárias/reforços continuam podendo ser mantidos, removidos ou enviados a proposta complementar, preservando KeywordDNA;
- ações de atualização da principal são propostas, não aplicação estrutural automática;
- a UI não exibirá `Seguir recomendação` para uma ação protegida; usará proposta de atualização, sugestão complementar ou ignorar.

## Compatibilidade e rollback

O campo é opcional com default seguro para assessments existentes. Nenhuma migração remota ou limpeza de storage será executada. Rollback consiste em remover apenas successors não aprovados do artefato local, preservando assessments e identidades publicadas anteriores.

## Testes e aceite

Fixtures cobrirão os dois modos, principal publicada protegida contra ações antigas, recomendações de fortalecimento, secundária removível com cópia de trabalho, texto UTF-8 e preservação de snapshots/KeywordDNA. Nenhuma chamada real Serper será executada.
