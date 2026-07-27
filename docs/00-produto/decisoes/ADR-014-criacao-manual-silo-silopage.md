# ADR-014 — Criação manual separa estratégia de identidade da SiloPage

## Status

Aceita para implementação local em 2026-07-21.

## Contexto

O modal manual solicitava `Nicho` no registro legado de lista, mas a marca ativa já fornece esse contexto. Também não havia caminho para formar um SiloDNA sem artigo nem para registrar a identidade inicial de uma SiloPage sem confundir publicação, aprovação e verificação online.

## Decisão

O Arquiteto solicita apenas nome do silo e keyword/entidade central para o SiloDNA. A SiloPage é opcional e possui slug, situação `new`/`published`, URL publicada e verificação próprios. SiloDNA e SiloPage permanecem versões e workflows independentes.

`published` preserva uma URL informada, mas começa como `not_checked`. A verificação online será explícita e separará sitemap, acessibilidade, canonical e conflitos. O campo legado `nicho` continua compatível na leitura e não é apagado nem enviado vazio pelo novo formulário.

## Consequências

- SiloDNA pode existir antes de artigos e sem criar KeywordDNA artificial.
- SiloPage publicada exige domínio compatível com a marca ativa.
- URL publicada, slug e canonical não são substituídos por inferência.
- Dados antigos continuam parseáveis por defaults opcionais.

## Rollback

Descartar sucessores manuais não aprovados preserva versões antigas e publicadas. Não há limpeza automática, migration remota ou exclusão de dados.
