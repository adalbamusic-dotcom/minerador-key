# SDD — ContentPlan definitivo do Planejador

## Status

Implementação autorizada pelo briefing desta tarefa, condicionada à preservação dos contratos vizinhos e das mudanças locais já existentes no checkout.

## Módulo proprietário

Planejador. O objetivo é produzir um ContentPlan versionado, editável, revisável, aprovável e transferível ao Redator. O Planejador não escreve o artigo final, não altera ArticleDNA/SiloDNA/KeywordDNA e não publica conteúdo.

## Snapshot e rollback

O checkout já possuía alterações locais antes desta tarefa, inclusive em consumidores compartilhados ligados ao Radar. O snapshot de referência é o estado do worktree identificado pela auditoria em 2026-07-20, com `git status --short` e `git diff --stat` registrados no handoff da tarefa. Não será usado reset/checkout para rollback.

Rollback seguro: reverter somente os hunks e arquivos introduzidos por esta SDD, mantendo as alterações pré-existentes do usuário. A mudança não exige migration, limpeza de armazenamento, escrita remota ou alteração de conteúdo publicado.

## Estado encontrado

- Radar aprovado é importado de forma seletiva e idempotente para `PlannerItem`.
- `PlannerItem` guarda apenas o vínculo da unidade, estado, lock e `contentPlanVersionId`.
- `createOperationalPlan` cria um envelope v1 com refs de BrandDNA/KeywordDNA/ArticleDNA/SiloDNA, refs opcionais de SERP, outline simples, instruções e pendências.
- O plano é mantido em `BrandWorkspace.contentPlans`, recuperado por marca no `localStorage` quando o remoto não está disponível e enviado ao repositório remoto pela rota de workflow quando aplicável.
- A preparação é idempotente apenas no sentido de recuperar o plano existente; não há sucessora editável.
- Aprovação verifica estado e existência do plano, mas não valida cobertura editorial, proveniência, metadados, links, fontes, CTA, imagens ou pendências bloqueadoras.
- O Redator recebe um documento derivado do plano aprovado; o contrato de entrada do Redator não será quebrado.
- Mocks existem explicitamente em `lib/editorial/providers.ts` e não serão promovidos a evidência real.
- A carga real do Radar é parcial: somente SERP real aprovada entra como evidência; ausência permanece como pendência.

## Problemas

1. O contrato não representa explicitamente unidade editorial, intenção validada, promessa, H1/H2/H3, tópicos, perguntas, entidades, objeções, links/âncoras, fontes/evidências, CTA, imagens, Skills ou metadados.
2. A edição do plano não cria uma nova versão imutável.
3. O gate de aprovação não distingue proposta de IA/mock de decisão humana nem bloqueia pendências essenciais.
4. A transferência ao Redator não explicita idempotência por versão do plano.
5. IDs técnicos podem aparecer como fallback em algumas superfícies; textos editoriais devem vir de dados hidratados ou ser marcados como pendência.

## Arquitetura proposta

### Contrato

Adicionar ao `ContentPlanSchema` campos aditivos com defaults compatíveis com planos v1 e marcar planos novos como `schemaVersion: 2`. O núcleo existente permanece: refs versionadas, `approvedOutline`, `writingInstructions` e `humanPendingDecisions`.

O complemento v2 terá:

- identidade da unidade (`article` ou `silo_page`) e IDs de entidade;
- estratégia: intenção principal/secundária, estado de validação, ângulo, promessa, fronteira e diferenciação;
- estrutura: H1 e seções H2/H3 com objetivo, tópicos, perguntas, entidades, objeções, refs de keywords e refs de evidência;
- plano de links internos com candidatos de âncora e estado de decisão humana;
- fontes sugeridas, claims e evidências disponíveis, sem inventar URL ou estatística;
- CTA com objetivo e posição;
- briefs de imagem com texto alternativo pendente quando não validado;
- Skills/prompts selecionados;
- metadados editoriais e SEO, preservando slug/canonical/keyword principal da origem;
- carga/proveniência do Radar e notas humanas;
- estados de revisão, aprovação e transferência como metadados do plano, sem substituir os estados de workflow.

### Domínio do Planejador

Criar funções exclusivas em `lib/planejador/content-plan.ts` para:

- construir o plano definitivo a partir de ArticleDNA, SiloDNA/SiloPage e carga aprovada do Radar;
- validar o plano sem chamadas externas;
- criar sucessora com `previousVersionId`, `versionNumber + 1`, hash e `changeReason`;
- calcular pendências e motivos de bloqueio de aprovação;
- confirmar que a referência editorial continua na marca e na unidade correta.

O adaptador existente `createOperationalPlan` continuará disponível e passará a usar esse construtor para preservar o fluxo atual.

### Persistência e versionamento

O envelope de versão continua sendo a unidade persistida. A edição sempre cria uma sucessora; versões consolidadas não são mutadas. O workspace local mantém todas as versões por chave de `versionId`, e o item aponta para a versão ativa. A rota remota existente continua recebendo `VersionedContentPlanSchema`; não haverá schema/migration nova.

### Interface

O Planejador exibirá o plano por unidade com abas/seções compactas para estratégia, estrutura, links, fontes/evidências, CTA, imagens, Skills e metadados. Campos editoriais serão editáveis; refs técnicas serão mostradas como proveniência/diagnóstico, não como texto de artigo. Ações serão: salvar sucessora, enviar para revisão, aprovar quando não houver bloqueio e abrir Redator.

### Aprovação e transferência

Preparar cria rascunho. Salvar cria nova versão e devolve o item a `awaiting_review`. Aprovar exige uma versão ativa, aprovação humana, unidade/marca coerentes, H1/outline válidos e nenhuma pendência bloqueadora; pendências informativas continuam visíveis. Abrir o Redator continua exigindo plano aprovado e usa sempre o `contentPlanVersionId` ativo. Repetições não criam outro documento/publicação para o mesmo artigo e plano.

## Entradas

`RadarItem` aprovado; ArticleDNA versionado; SiloDNA ou SiloPage versionado quando disponível; BrandDNA/legacy brand ref; KeywordDNA refs; snapshots SERP reais aprovados; evidências de produto/fontes já existentes; Skills/prompts da marca; notas humanas. Ausências são pendências explícitas, nunca dados inventados.

## Saída

`VersionedContentPlan` v2 compatível com o envelope existente, com proveniência compacta e instruções suficientes para o Redator produzir o documento. O Redator continua recebendo `ContentPlan` aprovado e não recebe artigo final.

## Arquivos afetados

- `lib/arquiteto/contracts.ts`: campos aditivos do ContentPlan compartilhado.
- `lib/planejador/contracts.ts` e `lib/planejador/content-plan.ts`: contrato/validação/construção exclusivos do módulo.
- `lib/editorial/operational-flow.ts`: adaptador e gates do Planejador, preservando exports existentes.
- `components/editorial-pipeline-context.tsx`: sucessoras, edição, aprovação e recuperação de versões do plano.
- `modules/planejador/*` e `components/planejador/*`: editor visual do Planejador; `components/product/operational-pages.tsx` permanece somente como referência histórica da extração.
- `tests/planejador-content-plan.test.mts` e ajustes direcionados em `tests/operational-flow.test.mts`.
- `docs/06-planejador/spec.md`, `estado-atual.md` e `backlog.md` ao concluir.

## Arquivos compartilhados e consumidores

`lib/arquiteto/contracts.ts`, `lib/editorial/operational-flow.ts`, `components/editorial-pipeline-context.tsx`, `lib/editorial/persistence-contracts.ts` e a rota/repositórios editoriais são compartilhados. A alteração será aditiva, mantendo nomes e campos v1. Consumidores: workspace/recovery local, rota de workflow, `editorial-repositories`, `WriterPage`, `professional-writer`, Publicações e testes de pipeline. Não haverá alteração incompatível em Radar, Redator, Tiptap, autenticação ou migration.

## Riscos e controles

- Planos v1 já armazenados: parser aceita v1 e defaults; não sobrescrever estado válido.
- Mudança local concorrente: usar patches pequenos e conferir diff antes dos testes.
- Dados Radar incompletos: marcar `pending`, não fabricar fontes/estatísticas.
- Aprovação automática acidental: exigir evento humano e manter IA/mock como origem não aprovada.
- IDs em copy editorial: renderizar labels hidratados e mostrar refs somente em painéis técnicos.
- Publicados: não alterar slug/canonical/keyword principal; atualização fica como indicação de sucessora, fora da publicação automática.

## Testes

Fixtures determinísticas cobrirão contrato v2, compatibilidade v1, construção sem SERP, construção com SERP real aprovada, ausência de fonte, validação de H1/outline, sucessão imutável, aprovação humana, idempotência e isolamento por marca. Executar testes direcionados, `tsc --noEmit` e lint dos arquivos alterados; não executar chamadas pagas nem migration.

## Limitações

Persistência remota depende da infraestrutura já existente e da aplicação manual da migration vigente. A coleta real, validação externa de fontes e revisão final no navegador permanecem manuais. O Planejador não gera conteúdo final nem aprova decisões editoriais em nome do humano.
