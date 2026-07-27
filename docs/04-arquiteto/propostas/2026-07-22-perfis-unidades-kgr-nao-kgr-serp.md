# SDD — Perfis estratégicos para KGR, não KGR e unidades editoriais

## Status

Proposta aprovada para implementação aditiva no módulo Arquiteto em 2026-07-22.

## Problema

O Arquiteto já preserva KGR, intenção, publicação, hierarquia e contexto estratégico, mas ainda não representa de forma única três dimensões que precisam permanecer independentes:

1. ciclo editorial: `formacao`, `arquitetura_publicado` ou `fortalecimento`;
2. estratégia competitiva: `kgr_light`, `competitive` ou `unknown`;
3. tipo da unidade: artigo, serviço, landing page, categoria ou outro.

Sem essa projeção, a SERP pode aplicar uma régua de artigo informacional a uma página de serviço ou exigir pesquisa de uma landing page de campanha. Ausência de KGR também corre o risco de ser confundida com não KGR.

## Decisão

Adicionar ao ArticleDNA e ao ArticleControlContext, sem remover campos existentes:

- `unitClassification`: sugestão ou confirmação humana do tipo da unidade, com evidências;
- `unitPurpose`: objetivo editorial, necessidade de busca, papel de conversão e intenção de indexação;
- `serpStrategy`: ciclo, competição, perfil, intenção central, recomendações permitidas e proibidas.

`SiloPage` continua entidade independente e não será transformada em ArticleDNA. O enum operacional compartilhado permanece `article|silo_page`; os novos tipos editoriais vivem em `ArticleDNA.unitClassification` e `ArticleControlContext.unit`, evitando alteração do workflow do Planejador/Publicações.

## Resolução determinística

### Tipo da unidade

O Arquiteto pode sugerir o tipo por URL, slug, H1/title recebidos, dados estruturados, sinais semânticos, origem e intenção. A sugestão terá `status: suggested` e nunca será confirmação automática. Sem sinal suficiente, registros antigos usam `type: other`, `status: unknown`, `source: legacy`.

Landing page recebe `landingPagePurpose` separado: `seo`, `campaign`, `hybrid` ou `unknown`.

### Estratégia competitiva

- KGR confirmado por identidade explícita e vínculo confirmado: `kgr_light`.
- Não KGR explicitamente recebido: `competitive`.
- KGR candidato, conflito ou dado ausente: `unknown`.

O Arquiteto não recalcula KGR, não promove score/volume/slug/SERP a KGR e não altera os valores recebidos.

### Ciclo editorial

- unidade nova: `formacao`;
- publicado sem principal/arquitetura confirmadas: `arquitetura_publicado`;
- publicado com arquitetura/principal confirmadas ou KGR confirmado: `fortalecimento`.

O ciclo continua independente do tipo e da competição.

## Perfis SERP

- artigo + KGR leve: consulta a principal como âncora, consultas de apoio somente quando ambíguas/conflitantes/solicitadas e baixa evidência não gera separação;
- artigo competitivo: análise profunda de intenção, formatos, concorrência, canibalização e candidatas, sem sobrescrever a intenção da principal;
- serviço: perfil comercial/local, oferta, prova, localização, diferenciais, CTA e conflito com artigos informacionais;
- landing SEO: aderência busca/oferta, conversão, prova, objeções, CTA e indexação;
- landing campanha: SERP opcional; prioridade para origem, mensagem, oferta e conversão;
- landing híbrida: combinação explícita de SEO e conversão, com conflito quando incompatíveis;
- categoria: perfil de hub, taxonomia, navegação, unidades filhas e canibalização.

As recomendações serão descritas no `serpStrategy`; o domínio bloqueará recomendações proibidas por perfil. Nenhuma recomendação será aplicada automaticamente.

## Classificação humana

A interface mostrará a sugestão e evidências no painel estratégico do ArticleDNA. A pessoa poderá confirmar, alterar o tipo, definir a finalidade da landing page, marcar conflito ou manter desconhecido. Cada decisão cria uma nova versão do ArticleDNA e preserva a versão anterior.

## Contratos e consumidores

Campos novos serão opcionais no ArticleDNA, ArticleControlContext e transporte para Radar. ArticleDNAs antigos continuarão parseáveis. O Radar apenas transportará/exibirá os dados recebidos; não haverá alteração de sua UI ou workflow nesta tarefa. SiloDNA, SiloPage e contratos de publicação permanecerão separados.

## Persistência e hidratação

A confirmação humana será persistida como versão sucessora no estado versionado existente e no recovery local já utilizado pelo Arquiteto. Nenhum registro antigo será regravado em lote. Estado vazio não substituirá classificação válida. A marca será parte da validação e da recuperação.

## Proteções

Para publicados, URL, slug, canonical, marca e principal confirmada permanecem protegidos. Diagnósticos geram proposta/conflito, nunca sobrescrita silenciosa. Assessment SERP anterior não será apagado; uma mudança de perfil deverá produzir nova avaliação explícita, deixando a anterior histórica/desatualizada quando aplicável.

## Fronteiras

Não serão alterados: cálculo KGR ou UI do Minerador, UI/workflow do Radar, Planejador, Redator, Publicações, migrations remotas, chamadas externas reais, artigos reais ou dependências.

## Snapshot e rollback

Snapshot de integridade foi capturado antes da implementação com `git status --short`. O workspace já estava deliberadamente sujo, com alterações em vários módulos e arquivos legados removidos; essas alterações não pertencem a esta SDD e serão preservadas.

Rollback: remover somente os campos opcionais, o resolver, a UI e os testes desta SDD. ArticleDNAs legados continuam válidos porque os campos novos são opcionais; nenhuma migration ou alteração remota é necessária.

## Riscos

- inferência excessiva do tipo por sinais incompletos;
- classificação antiga aparecer como `other/unknown` até revisão humana;
- consumidores que exibem `unitType` precisarem aceitar os novos valores;
- provider de IA tentar substituir classificação ou estratégia.

Mitigações: status de sugestão explícito, evidências preservadas, normalização server-side, campos opcionais e enforcement determinístico depois do merge do provider.

## Testes e aceite

Fixtures devem cobrir todos os tipos, finalidades, estados de confirmação, marcas, KGR confirmado/não KGR/candidato/desconhecido, os três ciclos, perfis SERP, proteção de publicados, compatibilidade com ArticleDNA antigo, persistência de sucessor e transporte retrocompatível.

Validação prevista: `test:arquiteto`, contratos/ArticleDNA/SERP/KGR/publicados, `test:operational`, TypeScript, lint direcionado, build e `git diff --check`. Nenhum teste fará chamada real de Serper ou IA.
