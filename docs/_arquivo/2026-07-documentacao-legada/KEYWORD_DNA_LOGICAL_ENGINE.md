# Primeiro processo lógico do KeywordDNA

O Minerador volta a executar uma leitura determinística do conceito de cada keyword antes das etapas estratégicas que usam IA, agrupamento, SERP ou escrita.

## Quando executa

- automaticamente ao carregar as keywords classificadas em uma lista/silo da marca e as publicadas;
- imediatamente nas importações CSV e manual;
- manualmente pelo botão `Atualizar DNA`;
- quando houver seleção, o botão processa somente as selecionadas; sem seleção, processa as classificadas e publicadas carregadas. Keywords órfãs de teste não entram automaticamente.
- no painel expandido, o seletor `Status da keyword` permite aprovar ou rejeitar o item; `Aprovado` é o estado que o disponibiliza para importação no Arquiteto.

## O que preenche

O motor registra intenção principal e secundária, formato editorial, entidade, modificadores, público provável, problema, resultado, job to be done, consciência, jornada, potencial comercial e de afiliado, urgência, localidade, objeção, emoção, risco lexical de canibalização, necessidade de pesquisa de produto, confiança e evidências lógicas.

O resultado é salvo em `keywords_kgr.analise_semantica`, preservando a estrutura atual do banco. Não há migration nova.

## Limites e precedência

- não chama DeepSeek, OpenRouter nem qualquer outro provedor;
- não consulta SERP e não afirma que conhece o comportamento real dos resultados;
- usa somente a construção lexical, a intenção já existente, o nicho/lista e a localidade disponível;
- valores humanos ou de IA já presentes não são substituídos;
- o campo `dna_campos_logicos` registra quais valores pertencem ao motor, permitindo recalculá-los sem apagar os demais;
- o resultado nasce com revisão humana pendente;
- confiança lógica não equivale a aprovação.

Este DNA-base segue no `analise_semantica` para que o Arquiteto o utilize ao montar referências de KeywordDNA. SERP e revisão humana podem propor versões posteriores, mas nunca sobrescrever silenciosamente uma classificação aprovada.
