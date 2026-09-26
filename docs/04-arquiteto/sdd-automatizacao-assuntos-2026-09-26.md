# SDD — Formação automática de artigos a partir de Assuntos

**Estado:** autorizada pelo pedido explícito do dono em 2026-09-26; implementação nesta entrega.
**Módulo proprietário:** Arquiteto.
**Escopo:** automatizar a formação de artigos iniciada por um Assunto já declarado e aprovado no Minerador.
**Não inclui:** descobrir/importar novas keywords no Minerador, publicar conteúdo no site, alterar Schema/RLS/autenticação, trocar principal/URL/canonical de conteúdo publicado, ou criar/confirmar Silos novos.

## 1. Problema verificado

A implementação vigente de F2.4 exibe sugestões para o Assunto, mas exige que a pessoa marque as keywords, confirme a sustentação, selecione artigos, execute o processamento e clique em **Concluir formação**. `suggestSubjectSupport` só olha sinais de origem, entidade, lista, intenção/funil e nota; não compara a frase do Assunto com as keywords. Isso explica tanto o resultado vazio do screenshot de 2026-09-26 quanto a formação incompleta relatada.

## 2. Decisão autorizada

Para Assuntos já declarados e aprovados, uma ação de início do lote executa a composição automaticamente. Não haverá escolha manual keyword por keyword nem confirmação manual repetida por artigo.

1. O Arquiteto lê todos os pacotes aprovados, da marca ativa, já recebidos no Arquiteto. A busca da frase do Assunto, seus termos normalizados, a nota, `subject_discovery`, entidade, lista, intenção e funil contribuem para a sustentação. A frase não vira keyword nem recebe volume inventado.
2. As buscas elegíveis são encaminhadas ao candidato de artigo sem conflito no mesmo Silo confirmado. Um Assunto pode sustentar mais de um artigo; um artigo só recebe o mesmo Assunto ou fica sem mudança quando já possui outro. Candidatos publicados ou com identidade editorial aprovada não têm principal, slug, URL, canonical ou marca alterados por este caminho.
3. Keywords livres que ainda não estão num candidato podem formar novos grupos apenas quando possuem volume utilizável para eleger Principal, pertencem a um único Silo confirmado e respeitam o teto de seis. Principal e slug saem das keywords pela regra atual; o Assunto fica fora das referências de keyword e do slug. O pai é o Silo confirmado já pertencente às keywords.
4. Os grupos passam pela validação SERP existente, nas quatro lentes. Cache válido não exige chamada. Consultas pagas continuam mostrando o plano e exigem uma autorização de custo no início do lote; após essa autorização, o encadeamento não pede confirmações por artigo.
5. Depois da releitura remota da SERP, a confirmação e materialização do ArticleDNA são automáticas e idempotentes. A evidência, os papéis, a principal, o slug e o vínculo do Silo são os que passaram pelos validadores atuais. O readback remoto confirma cada artefato antes da interface anunciar sucesso.
6. A execução fica atribuída ao usuário autenticado que iniciou o lote, com origem `system` e razão explícita de automação. A declaração original do Assunto continua atribuída ao autor humano do Minerador.
7. Evidência insuficiente, conflito de assunto, colisão de slug, falta de Principal/Volume, múltiplos Silos, canibalização não resolvida ou divergência de versão interrompem só os candidatos afetados. A plataforma conserva as keywords e mostra o motivo e a etapa necessária; não escolhe valores nem remove dados em silêncio.
8. Se não houver pacote recebido que sustente o Assunto, o Arquiteto explica que não há insumo elegível e aponta para a pesquisa/importação do Minerador. Este SDD não autoriza nova descoberta paga nem leitura de keywords não aprovadas.

A instrução do dono autoriza o lote automático de formação e aprovação editorial desses casos que passaram os gates. Ela não autoriza publicação externa. A SERP continua sujeita ao consentimento de custo descrito no item 4.

## 3. Contrato e compatibilidade

- A expansão de `ArticleFormationDecision.source` de `human` para `human | system` é aditiva no payload JSONB do workflow. Registros antigos e consumidores que leem `human` continuam válidos. Não exige migration.
- A rotina de materialização continua usando os writers canônicos de ArticleDNA, os status events, o marcador de formação, as guardas tenantizadas e readback existentes.
- A automação não cruza `brandId`, não consulta estado de apresentação como autorização e não muda decisões humanas ou identidades publicadas.
- O catálogo MCP e os testes do catálogo acompanham a mudança na mesma entrega, conforme `AGENTS.md` §17.1.

## 4. Arquivos e consumidores

Proprietários: `modules/arquiteto/subject-workspace-model.ts`, `lib/arquiteto/declared-subject.ts`, `lib/arquiteto/article-formation-decision.ts` e `modules/arquiteto/arquiteto-workspace.tsx`.

Consumidores a preservar: hidratação da cópia de trabalho canônica, reprocessamento e edição da formação, plano de conclusão, SERP e gates existentes, materialização de ArticleDNA, tela do Arquiteto, ferramentas/guia MCP e a leitura de published ArticleDNA no Radar. Nenhuma rota ou tabela nova é introduzida.

## 5. Testes e validação

- Testar correspondência direta da frase, sinais fracos insuficientes, marca diferente, pacote não recebido, Assunto sem volume, separação por Silo, teto seis, Principal, slug, origem system e idempotência.
- Testar regressão de payloads antigos `source: human`, fluxo normal manual e proteção de identidade publicada.
- Integrar o processo ao `test:arquiteto` e atualizar `test:agent`/catálogo MCP.
- Testes usam fixtures; nenhum provider pago, SQL/migration, escrita remota ou publicação externa.
- A homologação real do lote requer o deploy e smoke do dono; não será simulada por sucesso local.

## 6. Rollback

Reverter o caminho automático e restaurar a UI anterior. A leitura de `source: system` é compatível com a versão anterior somente se o leitor anterior rejeitar campos; por isso a reversão após gravar dados automáticos precisa manter o novo schema de leitura ou primeiro mapear os registros system para sua descrição suportada. Não apagar nem limpar os payloads persistidos. Não há migration SQL para reverter.
