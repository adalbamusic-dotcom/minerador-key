# Roteiro manual — Cockpit do Planejador

Não executar automaticamente nem usar IA paga neste roteiro.

1. Abra `/planejador` com uma marca selecionada e localize um artigo que veio do Radar.
2. Confirme na grade unidade/tipo, título, keyword principal, silo, hierarquia, intenção, Radar, `ID · vN`, conflitos, pendências, publicação e transferência.
3. Abra o cockpit e confira Visão geral, DNA/contexto e proveniência. Se faltar dado, confirme `Referência não hidratada` e o diagnóstico técnico.
4. Verifique SERP: apenas dados reais carregados devem aparecer; ausência deve indicar Radar/benchmark indisponível; mock deve permanecer marcado.
5. Edite a cópia de trabalho: H1, um H2, um H3, ordem, faixa de palavras/parágrafos, pergunta, entidade, link, fonte, CTA e imagem. Salve e recarregue.
6. Salve novamente sem alterar nada: a versão deve continuar igual.
7. Faça uma mudança material: deve aparecer nova versão com `previousVersionId`; a anterior deve permanecer imutável.
8. Valide as pendências. Não aprove enquanto houver conflito bloqueador, fonte necessária ou H3 órfão.
9. Aprove a versão revisada e envie ao Redator. Repita o envio e confirme o mesmo ContentDocument, sem duplicata e sem sobrescrever conteúdo escrito.
10. Confirme no Redator a versão correta do plano e a presença de estratégia, H1/outline, gabarito, perguntas, entidades, objeções, links, fontes, CTA, imagens, blocos, metadados, Skills, alertas e proveniência.
11. Para SiloPage, confirme navegação/filhos/breadcrumbs e que a estrutura não foi tratada como artigo comum. Para `no_page`, confirme que o envio ao Redator foi bloqueado.
12. Para conteúdo publicado, confirme que slug, canonical, keyword principal, marca e URL estrutural continuam protegidos.

## Roteiro da organização guiada

1. Em `/planejador`, confirme labels em português e a separação entre workflow, publicação e transferência.
2. Abra o cockpit e navegue por Contexto, Estratégia, Estrutura, Recursos e Revisão.
3. Confirme que a etapa ativa é visível, o resumo permanece fixo e trocar de etapa não cria versão nem perde a cópia de trabalho.
4. Confira a próxima ação sugerida e abra diretamente a etapa indicada.
5. Edite estratégia, H1, H2, H3, ordem, conversão H2/H3, faixa de palavras, pergunta, entidade, link, fonte, CTA e imagem.
6. Use desfazer/refazer no outline e confira os alertas de H3 órfão e sobreposição.
7. Confirme o recálculo de progresso, perguntas cobertas, links, fontes, imagens, conflitos e bloqueios.
8. Em Revisão, tente aprovar um plano incompleto; o botão deve estar visível, desabilitado e explicar as pendências.
9. Resolva as pendências, valide, aprove, recarregue e confirme a recuperação da versão.
10. Envie ao Redator, confira `Enviado ao Redator`, repita o envio e confirme que não há ContentDocument duplicado.
