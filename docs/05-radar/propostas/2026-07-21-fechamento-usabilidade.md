# SDD — Fechamento de usabilidade e coerência do Radar

## Escopo

Esta proposta cobre somente o módulo Radar: estados derivados da investigação, identidade publicada/não hidratada, versões de evidência, classificação de formatos extraídos e classificação humana de ruído semântico.

O Planejador continua recebendo o pacote aditivo já existente e não terá sua lógica interna alterada.

## Decisões

- O progresso será derivado de evidências presentes no Radar, sem tratar uma transferência anterior como conclusão da versão atual.
- A transferência será registrada de forma aditiva no payload da análise (`plannerTransfer`), com a versão de origem, data e responsável. Payloads antigos continuam válidos por default `null`.
- Benchmarks estruturais considerarão somente extrações completas classificadas como artigo editorial comparável. Vídeos, páginas de serviço, categorias, redes sociais e extrações parciais continuarão visíveis como formatos observados, mas fora da média.
- Termos legais, de navegação e de plataforma serão classificados como ruído observado. A decisão humana poderá recuperá-los; apenas termos incluídos explicitamente ou classificados como conteúdo principal entrarão na evidência semântica principal.
- Canonical ausente será apresentado como não recebido nesta etapa; o Radar não inferirá URL.

## Rollback

O rollback é reversível por arquivo: remover as alterações desta proposta nos arquivos do Radar e restaurar os documentos desta pasta. Não executar reset, limpeza de storage, migration ou exclusão de registros. Snapshots SERP, versões de análise e dados publicados não serão modificados por esta rodada.

## Validação

Serão usadas fixtures e testes puros para progresso, versões, formatos comparáveis, semântica, canonical e aprovação. Nenhuma chamada real à Serper será executada automaticamente.
