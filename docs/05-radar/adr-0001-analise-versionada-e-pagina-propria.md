# ADR 0001 - Analise Radar versionada em pagina propria

## Status

Aceito e implementado em 2026-07-20.

## Decisao

O overview continua na planilha operacional, mas cada artigo possui a rota `/radar/[articleId]` com abas estaveis. A analise e armazenada como sucessoras imutaveis no payload JSONB do workflow Radar, com recovery local quando o armazenamento remoto esta indisponivel.

Dois modos explicitos existem: KGR leve, consultivo e economico em profundidade, e Competitivo completo, com extracao selecionada, benchmark robusto, estrutura e competitividade. A regra existente de KGR apenas sugere o modo; a pessoa confirma ou altera.

## Consequencias

- Curadoria e decisoes humanas ficam auditaveis por versao, hash, usuario e data.
- O Planejador recebe um pacote aditivo e preserva planos anteriores.
- A extracao e server-side e defensiva contra SSRF; falhas sao isoladas por pagina.
- A coleta SERP e a extracao de concorrentes continuam acoes explicitas, sem chamadas externas em testes.
- Guardiao futuro pode consumir campos preparatorios sem alterar scoring ou governanca atual.

## Esclarecimento posterior — hidratacao do snapshot

A analise versionada e uma camada posterior, nao um pre-requisito para recuperar `SerpSnapshot` e `SerpReview`. A rota canonica usa `RadarItem.id`, mantem compatibilidade com aliases inequivocos e preserva a aba no redirecionamento. A reconciliacao do workspace mantem dados locais validos e versoes de analise quando a resposta remota nao os contem. Essa correcao nao altera o snapshot nem dispara nova coleta.

## Revisão estrutural — RadarEvidencePackage

O identificador canônico de navegação passa a ser `articleDnaVersionId`, sem expor `radar:<alias>` na URL. A análise continua versionada, mas o pacote aprovado passa a ser evidência observada: não contém enforcement, requisitos finais, outline ou campos futuros do Guardião. A reconciliação de snapshots por payload completo impede que uma resposta remota parcial substitua a recuperação local.

## Revisão de usabilidade — identidade e proteção

O Radar apresenta identidade editorial e contexto dos DNAs antes da investigação. Publicados são explicitamente protegidos, com campos estruturais somente leitura e explicação do fluxo correto. Artigos novos seguem somente leitura e apontam revisão ao Arquiteto. A curadoria temporária não cria sucessoras até ser consolidada; keywords sem conflito não exigem justificativa.

## Revisão de usabilidade — estados, comparabilidade e semântica

Investigação, aprovação/publicação da versão e transferência ao Planejador permanecem independentes. A transferência é uma confirmação aditiva (`plannerTransfer`) associada à versão enviada; uma versão sucessora pode sinalizar atualização sem duplicar o artigo ou o `ContentPlan`.

O benchmark passou a aceitar somente extrações editoriais completas de artigos. Formatos como vídeo e resultados parciais seguem disponíveis para inspeção, mas não contaminam médias ou decisões estruturais. A semântica classifica ruído de navegação, legal e plataforma, permitindo recuperação humana explícita.

## Addendum — relatório competitivo

O Radar estende o mesmo envelope versionado com `RadarCompetitiveReport`, em vez de criar uma entidade persistente paralela. O relatório é gerado a partir da SERP revisada e das extrações selecionadas, referencia as versões de origem e participa do hash do pacote. A aprovação é humana e congela a versão; alterações futuras usam sucessora.

O relatório permanece evidência observada. O Planejador recebe respostas, concorrentes, padrões, semântica, limitações e necessidades como contexto, mas continua responsável por outline, metas, CTA, links, visual e ContentPlan. Formatos não comparáveis e dados ausentes são preservados como limitações, nunca convertidos em inferência.

## Revisão de usabilidade — contexto KGR recebido

O Radar passa a exibir e transportar `RadarKgrStrategy`, derivado de `ArticleKgrIdentity`, `ArticleVolumeStrategy`, `ArticleHierarchyStrategy` e `ArticleDNA.keywordReferences` já recebidos. A classificação KGR é preservada com origem; a sugestão de profundidade não pode substituí-la por recálculo silencioso baseado na SERP.

O bloco aditivo registra composição, volumes individuais e agregados com aviso de sobreposição, papéis, hierarquia e alinhamento principal/slug. O Radar apenas recomenda revisão no Arquiteto diante de conflito; não altera ArticleDNA, KeywordDNA, SiloDNA, slug, canonical, marca ou URL publicada. O `kgrStrategy` participa do hash do `RadarEvidencePackage` e não contém decisões finais do Planejador.
