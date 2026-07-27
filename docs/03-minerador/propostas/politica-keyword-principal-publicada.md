# PolÃ­tica da keyword principal em conteÃºdos publicados

**MÃ³dulo proprietÃ¡rio:** Minerador
**Consumidor aditivo:** Arquiteto

## Problema e contrato

O status `publicado` protege URL, slug, canonical, marca e identidade, mas nÃ£o distinguia se a keyword principal poderia ser revista estrategicamente. Esse novo estado nÃ£o substitui publicaÃ§Ã£o, workflow ou aplicabilidade KGR.

## DecisÃ£o

Adicionar ao metadado estratÃ©gico `analise_semantica` a polÃ­tica `primary_keyword_policy`: `locked`, `reviewable` ou `free`.

- NÃ£o publicado: `free`.
- Publicado legado sem estado explÃ­cito: `locked` por seguranÃ§a.
- Publicado: somente uma aÃ§Ã£o humana pode trocar `locked` e `reviewable`; ela preserva a principal atual e registra original publicada, ator, data, versÃ£o, motivo opcional e histÃ³rico.

O contrato enviado ao Arquiteto recebe campos opcionais correspondentes. A adaptaÃ§Ã£o Ã© aditiva: `locked` mantÃ©m a proteÃ§Ã£o existente; `reviewable` apenas permite uma proposta futura sujeita a validaÃ§Ã£o humana, sem confirmar nem alterar principal, URL, slug ou canonical nesta tarefa.

## Arquivos e consumidores

- Minerador: utilitÃ¡rio de polÃ­tica, pÃ¡gina e testes.
- Arquiteto: somente schema e adaptaÃ§Ã£o de leitura aditiva, se o mapeamento atual aceitar campos opcionais sem alterar formaÃ§Ã£o.
- NÃ£o hÃ¡ migration, atualizaÃ§Ã£o durante hidrataÃ§Ã£o, lote, chamada externa ou troca de principal.

## Riscos, rollback e aceite

O risco Ã© confundir revisÃ£o estratÃ©gica com mutaÃ§Ã£o de identidade; a UI mostra ambos separadamente e a atualizaÃ§Ã£o persiste apenas metadado apÃ³s confirmaÃ§Ã£o humana. Rollback remove o leitor/escritor do metadado sem tocar campos publicados ou dados de domÃ­nio. Testes cobrem legado, trÃªs estados, histÃ³rico, preservaÃ§Ã£o de identidade, escopo de marca e envelope aditivo do Arquiteto.
