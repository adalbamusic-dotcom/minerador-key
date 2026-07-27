# ADR-020 — KGR, slug e formação de artigos

- **Status:** Aceita para implementação aditiva em 2026-07-21
- **Módulo proprietário da decisão:** Arquiteto
- **Módulos consumidores:** Marca/Site/Sitemap, Minerador e Radar

## Contexto

URL, slug, H1, title e meta description encontrados no Site são sinais úteis,
mas não são qualificação de keyword. KGR depende de qualificação real do
Minerador e o artigo só deve ser formado pelo Arquiteto. A SERP do Radar deve
validar o artigo já formado, preservando a decisão editorial.

## Decisão

1. Site observa e sugere; nunca confirma KGR, volume, resultados, intenção ou
   ArticleDNA.
2. Minerador é a autoridade de qualificação de keyword e KGR.
3. Arquiteto forma um artigo com exatamente uma principal e até cinco apoios,
   com teto de seis referências.
4. A principal define intenção dominante, problema, promessa, audiência, slug
   candidato, KGR, volume principal e limites editoriais.
5. Secundárias só entram quando há compatibilidade de intenção, semântica,
   resposta em uma página, ganho real, narrativa natural e baixa
   canibalização relevante.
6. Volume ausente é parcial/indisponível, nunca zero implícito; reforço
   narrativo não recebe volume inventado.
7. Silo/Pilar/Suporte é sugerido por sinais combinados e exige revisão humana.
8. Publicados preservam slug, canonical, URL, marca e principal protegida; o
   sistema propõe reforços e conflitos sem sobrescrever a identidade.
9. Radar recebe o ArticleDNA formado em modo somente leitura da estratégia.

## Consequências

- A formação fica auditável por IDs, versões, evidências e racional.
- A ausência de KGR ou volume torna-se visível e não é convertida em fato.
- O Site e o Minerador permanecem desacoplados por um contrato de evidência.
- O limite de seis impede artigos inflados e deixa a seleção humana explícita.
- Contratos novos são opcionais; não há migration nem reprocessamento.
- Será necessário manter testes de compatibilidade para ArticleDNA e Radar
  antigos.

## Alternativas rejeitadas

- Confirmar KGR por score, slug semelhante ou volume.
- Deixar Site ou Radar escolherem a principal.
- Somar volume ausente como zero sem aviso.
- Reagrupar automaticamente no Radar.
- Alterar identidade de conteúdo publicado para corrigir uma sugestão.
