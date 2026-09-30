# SDD — Melhoria de publicados e formação por Assunto

Estado: APROVADA pelo dono em 2026-09-29, no pedido de implementar os dois planos anexados e resolver publicados concorrentes. Módulo proprietário: Arquiteto.

## Contrato e autorização

Uma jornada prepara todos os publicados e Assuntos da marca, distribui keywords elegíveis, pesquisa lacunas e oferece uma única prévia editorial. O aceite explícito inclui principal Livre, entradas, saídas, transferências e aprovação das novas keywords pelo Minerador. A principal Travada não muda. Publicação externa, exclusão, redirecionamento, mudança de URL/canonical/slug/marca e troca do Silo publicado ficam fora.

O dono autorizou substituir apoios fracos com prévia e propor principal com demanda quando a frase antiga sem demanda tem SERP inconclusiva. A mesma intenção geral não prova diferenciação: captar clientes/atrair pacientes são variantes do mesmo problema. Propostas para páginas concorrentes devem fixar enfoques distintos e exclusões recíprocas. Uma ou duas keywords adequadas podem bastar; seis é teto, nunca meta. Ranqueamento é evidência de risco e não revoga o Posto Livre declarado; a prévia registra o aviso.

## Implementação

- Núcleo determinístico comum de distribuição com capacidade e remanejamento; preserva artigos aprovados e dá cobertura aos alvos sem apoio antes de preencher os demais, entre encaixes equivalentes.
- Preparação server-side pelo DNA aprovado, declarações, ArticleDNA, Silo e catálogo do site; cache em lote. Afinidade editorial combina entidade, problema, público, intenção e qualificadores. Keywords sem demanda não viram nova principal. Ausência não vira zero nem evidência conclusiva.
- Descoberta gratuita Google Ads por frase, URL isolada e conceitos; duas etapas, até três páginas de 500 por semente, consultas deduplicadas. Métricas históricas antes de aplicar; erros/eco/lacunas são explicados.
- SERP nas quatro lentes, cache primeiro. Plano só das faltas; teto padrão US$ 1 por execução, ajustável na prévia de custo e exigido no servidor. Custos extras nunca são autorizados apenas por abrir, recarregar ou retomar uma tela.
- Família `/api/arquiteto/article-improvement`: prepare, collect, apply e status. Proposta JSONB versionada em `editorial_workflow_items`, estágio architect, sem migration. Hash da prévia, ator e locks vigentes; snapshot do estado anterior; execução retomável por artigo com resultados parciais honestos.
- A SERP observa a composição final. Import, Lógica, métricas, aprovação, handoff, working copy, ArticleDNA, marcador e readback usam os núcleos existentes. O contexto autenticado é injetável para tela/MCP; não depender de cookie entre rotas.
- ArticleDNA mantém o contrato atual; principal original publicada permanece identificável e, na troca, secundária. Assunto continua declaração humana e fundamento externo às seis keywords. Novos artigos por Assunto seguem os gates de formação e vínculo canônico existentes.
- MCP usa o mesmo núcleo. Prévia/leitura: platform.read; preparação persistida: arquiteto.write; aplicação: platform.decide + permissões dos módulos tocados; novas keywords: minerador.write; custo: provider.spend e confirmação do plano. Catálogo atualizado na mesma entrega.

## Compatibilidade, falhas e rollback

Rotas antigas continuam operantes. Extrações de núcleo preservam handlers e contratos. Artefatos e decisões antigos permanecem legíveis. Cada artigo é retomado sem versões/pagamentos duplicados; conflito externo pede nova prévia. A última versão aprovada permanece no histórico. Não há transação SQL entre todas as etapas: falha parcial é registrada e retomada, nunca anunciada como conclusão. Keywords removidas não são apagadas e voltam à fila após confirmação.

Rollback: desabilitar a jornada nova mantendo leitores compatíveis; recuperar composição anterior por sucessora e decisão explícita a partir do snapshot. Não apagar propostas, versões ou cache.

## Verificação e gates

Fixtures: artigos captar/atrair estética concorrentes; ausência de demanda; Assunto longo; 130 livres; artigo cheio; proposta de troca não aceita; keyword já usada; principal Travada; divergência conclusiva; quatro lentes/cache parcial/ilegível; limite de custo; isolamento, concorrência e falha por etapa. Providers e banco simulados nos testes. Testar a interface, reabertura e catálogo/MCP. TypeScript, lint direcionado, build e diff check.

Nenhum SQL remoto, migration, escrita em produção ou provider pago é executado no desenvolvimento. Deploy e homologação da marca real pelo dono. Implementação só será registrada como confirmada onde houver evidência de código/teste/readback ou validação manual.
