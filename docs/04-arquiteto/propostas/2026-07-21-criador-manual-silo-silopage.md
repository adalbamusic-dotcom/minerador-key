# SDD — Criador manual de SiloDNA e SiloPage

## Status

Proposta para implementação local e brand-scoped no Arquiteto.

## Problema

O modal `Criar Novo Silo` solicita `Nicho` e grava apenas o registro legado de `listas_kgr`. O campo não representa a estratégia do silo, pode divergir da marca/KeywordDNA e não cria a identidade opcional da SiloPage.

## Decisão

O modal será dividido em duas seções:

1. **Estratégia do silo:** nome obrigatório e keyword/entidade central obrigatória;
2. **Página do silo:** criação opcional, slug obrigatório quando habilitada, situação `new` ou `published` e URL publicada obrigatória somente em `published`.

SiloDNA e SiloPage continuarão sendo entidades, versões, aprovações e referências independentes. Criar um SiloDNA não criará automaticamente uma SiloPage.

## Contratos

### SiloDNA

As extensões opcionais preservam compatibilidade com versões antigas:

- `brandId`, quando a versão foi formada em contexto de marca;
- `name`, mantendo o nome editorial do silo separado de `centralEntity`;
- `centralEntitySource: manual | keyword_dna`;
- `centralKeywordDnaRef`, somente quando houver uma referência real de KeywordDNA.

O SiloDNA poderá ter zero artigos na criação manual. Isso representa uma estratégia de silo ainda sem artigos, não um artigo vazio e não uma KeywordDNA inventada.

### SiloPage

Serão adicionados campos opcionais/defaults seguros:

- `publicationStatus: new | published`;
- `publishedUrl`, nula para página nova;
- `publicationVerification`, iniciada como `not_applicable` para página nova ou `not_checked` para publicada.

O campo `canonical` existente continua sendo a fonte única do canonical da SiloPage. Não será criado um segundo campo equivalente.

Estados de verificação representam evidência, não aprovação: `not_checked`, `sitemap_match`, `accessible`, `canonical_confirmed`, `canonical_mismatch`, `not_in_sitemap`, `unreachable`, `missing_site_configuration`, `conflict` e `error`.

## Identidade e validação

- O nome e a entidade central pertencem ao SiloDNA.
- O slug, situação de publicação e URL pertencem à SiloPage.
- Slug será normalizado apenas para validação/armazenamento interno; o valor digitado permanece no formulário até confirmação.
- Slug deve iniciar com `/`, não conter espaços, URL completa ou caracteres inválidos e não conflitar com SiloPages conhecidas da marca.
- URL publicada deve ser HTTP/HTTPS, completa e pertencer ao host da marca ativa. Sem configuração de site, a publicação é bloqueada no formulário.
- URL publicada será preservada exatamente como informada; o pathname serve apenas para comparação com o slug.
- A situação `published` não confirma online, canonical, sitemap ou aprovação.
- Nenhuma validação online será executada automaticamente no salvamento. A conferência existente permanece explícita e server-side; divergências gerarão conflito sem sobrescrever URL, slug ou canonical.

## Persistência e hidratação

Ao confirmar, o Arquiteto valida tudo antes de alterar o estado local:

1. valida marca ativa e campos obrigatórios;
2. cria/preserva o registro legado do silo sem enviar `nicho` vazio;
3. cria uma versão determinística de SiloDNA com a entidade central e referência real opcional;
4. cria uma versão determinística de SiloPage somente se solicitada;
5. atualiza os mapas `siloVersions` e `siloPageVersions` brand-scoped e adiciona eventos `proposed` independentes;
6. confirma sucesso apenas depois das versões serem formadas e aplicadas ao workspace.

Falha na formação da SiloPage não será apresentada como sucesso. O SiloDNA poderá permanecer salvo apenas com mensagem explícita de operação parcial, sem apagar ou reverter dados existentes.

O campo legado `nicho` permanece aceito na leitura e em registros antigos. O novo formulário não o solicita, não o usa como estratégia e não o sobrescreve com vazio.

## Fora do escopo

- Alterar artigos, grupos, keywords ou KeywordDNA existentes;
- reconstruir o fluxo de silos;
- criar SiloPages para silos antigos;
- alterar UI/workflow de Radar, Planejador, Redator ou Publicações;
- migration remota, escrita remota adicional, limpeza de localStorage/IndexedDB, chamadas reais de IA/sites, commit, push ou deploy.

## Rollback

Como os novos campos são opcionais e as versões são sucessoras, o rollback local consiste em descartar versões manuais não aprovadas e manter versões legadas/publicadas. Nenhuma exclusão ou limpeza automática será executada.

## Testes e aceite

Fixtures cobrirão: remoção visual do campo Nicho; nome/entidade obrigatórios; SiloDNA sem SiloPage; SiloDNA com SiloPage nova/publicada; estados independentes; slug inválido/conflitante; URL de outra marca; published iniciando `not_checked`; URL/canonical preservados; dados legados com `nicho`; e ausência de alterações em artigos/keywords.

Validação prevista: testes focados do Arquiteto, fluxo operacional autorizado, TypeScript, lint dos arquivos alterados, build e `git diff --check`. Validação manual autenticada e verificação online permanecerão explicitamente pendentes.
