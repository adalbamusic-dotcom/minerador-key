# Auditoria classificatÃ³ria â€” 71 registros com volume/KGR incompatÃ­vel

**MÃ³dulo proprietÃ¡rio:** Minerador
**Data da leitura:** 2026-07-27
**Modo:** somente leitura, sessÃ£o autenticada do workspace

## Resultado executivo

A prÃ©via informa **71 registros**, mas o contador nÃ£o representa 71 incompatibilidades homogÃªneas. A tabela carregada da marca ativa continha 147 linhas. O cruzamento visual mostrou:

- **57 registros com volume ausente** (`-` ou `- ESTIMADO`); em 55 deles resultados e KGR tambÃ©m aparecem pendentes e em 2 a interface mostra `NÃ£o aplicÃ¡vel`.
- **14 registros com volume `0`, resultados numÃ©ricos e estado `Inconsistente`**. Eles sÃ£o suspeitos de KGR numÃ©rico antigo, mas a tela nÃ£o expÃµe a confirmaÃ§Ã£o `zero_confirmed`, fonte, data ou `match`.
- A implementaÃ§Ã£o atual de `assessVolumeKgrConsistency` classifica volume nulo como `inconsistent`. Portanto, os 55 registros sem mediÃ§Ã£o estÃ£o sendo apresentados na prÃ©via como incompatÃ­veis, embora a evidÃªncia observÃ¡vel seja de ausÃªncia de mÃ©tricas.

NÃ£o foi possÃ­vel confirmar, pela superfÃ­cie autenticada disponÃ­vel, IDs reais, `brand_id`, fonte/data/match, valor numÃ©rico persistido do KGR, histÃ³rico semÃ¢ntico ou Ãºltimo volume vÃ¡lido. Esses campos nÃ£o sÃ£o expostos na grade e a exportaÃ§Ã£o local existente nÃ£o foi disponibilizada como arquivo legÃ­vel. Eles sÃ£o marcados como ausentes; nenhum valor foi inferido.

## ClassificaÃ§Ã£o conservadora

Cada registro recebeu exatamente uma categoria principal. Como a confirmaÃ§Ã£o de origem exigida pelas categorias Aâ€“D nÃ£o estÃ¡ disponÃ­vel na superfÃ­cie de leitura, todos os 71 ficam conservadoramente em **E â€” INSUFFICIENT_EVIDENCE**.

| Categoria principal | Quantidade | Percentual | Volume anterior encontrado | Sem evidÃªncia suficiente | AÃ§Ã£o futura | Risco |
|---|---:|---:|---:|---:|---|---|
| A â€” ZERO_CONFIRMED_WITH_STALE_KGR | 0 | 0,00% | 0 | 0 | NÃ£o aplicar sem confirmaÃ§Ã£o semÃ¢ntica | Alto |
| B â€” ZERO_UNCONFIRMED_WITH_HISTORICAL_KGR | 0 confirmado | 0,00% | 0 comprovado | 14 suspeitos | Revisar histÃ³rico e evidÃªncia antes de decidir | Alto |
| C â€” POSITIVE_VOLUME_KGR_MISMATCH | 0 | 0,00% | 0 | 0 | NÃ£o hÃ¡ amostra positiva incompatÃ­vel comprovada | Alto |
| D â€” NOT_APPLICABLE_WITH_STORED_SCORE | 0 comprovado | 0,00% | 0 | 2 candidatos | Confirmar score histÃ³rico antes de separar como D | MÃ©dio |
| E â€” INSUFFICIENT_EVIDENCE | 71 | 100,00% | 0 comprovado | 71 | Nova mediÃ§Ã£o explÃ­cita ou revisÃ£o de histÃ³rico | Alto |
| F â€” OTHER | 0 | 0,00% | 0 | 0 | Nenhuma | Alto |

### Subperfis observados dentro de E

- **55 â€” `MISSING_METRICS_FALSE_POSITIVE`:** volume, resultados e KGR aparecem pendentes. RecomendaÃ§Ã£o: retirar esses registros da prÃ©via de incompatibilidade em alteraÃ§Ã£o futura de cÃ³digo, mas nÃ£o corrigir dados nesta auditoria.
- **14 â€” `ZERO_STALE_KGR_UNCONFIRMED`:** volume atual `0`, resultados entre 1 e 14 e estado `Inconsistente`. A forma Ã© compatÃ­vel com score antigo, mas nÃ£o prova se o zero Ã© confirmado nem se houve volume anterior vÃ¡lido.
- **2 â€” `NOT_APPLICABLE_WITHOUT_PROVABLE_SCORE`:** aplicabilidade exibida como `NÃ£o aplicÃ¡vel`, sem volume/resultados observÃ¡veis. NÃ£o hÃ¡ prova de score persistido ou histÃ³rico; por isso nÃ£o foram classificados como D.

## RelatÃ³rio por registro

`PosiÃ§Ã£o` Ã© a posiÃ§Ã£o visual na grade carregada, nÃ£o um ID de banco. O ID real nÃ£o foi exposto na interface consultada e nÃ£o foi inventado. `Marca`, fonte, data, match, Ãºltimo volume vÃ¡lido e fonte anterior tambÃ©m permanecem `nÃ£o disponÃ­vel`.

Legenda: `E-MISSING` = ausÃªncia de mÃ©tricas; `E-ZERO` = zero com resultados e KGR incompatÃ­vel, mas sem confirmaÃ§Ã£o do zero; `E-NA` = nÃ£o aplicÃ¡vel sem prova de score armazenado.

| Pos. / ID | Keyword | Marca | Volume atual | ConfirmaÃ§Ã£o / fonte / data | Resultados | KGR persistido / esperado | Aplicabilidade | Ãšltimo volume / fonte anterior | Categoria | RecomendaÃ§Ã£o | ConfianÃ§a / conflitos |
|---|---|---|---:|---|---:|---|---|---|---|---|---|
| 1 / nÃ£o exposto | AdalbaPro \| SEO tÃ©cnico e captaÃ§Ã£o local para clÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 2 / nÃ£o exposto | AdalbaPro \| SEO TÃ©cnico e Performance em Next.js para ClÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 7 / nÃ£o exposto | agÃªncia de marketing para clÃ­nica de estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 3 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 8 / nÃ£o exposto | AgÃªncia de marketing para clÃ­nica de estÃ©tica sem depender sÃ³ de anÃºncios | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 10 / nÃ£o exposto | agÃªncia de marketing para cosmÃ©ticos | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 3 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 14 / nÃ£o exposto | Arquitetura &amp; plano | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 15 / nÃ£o exposto | Autoria, mÃ©todo e responsabilidade editorial | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 16 / nÃ£o exposto | Autoridade que tem responsÃ¡vel e contexto | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 17 / nÃ£o exposto | Blog com estrutura de silo para clÃ­nicas serem encontradas no Google | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 19 / nÃ£o exposto | Blog com mÃ©todo KGR para comeÃ§ar pelas palavras certas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o utilizado; score nÃ£o provado / nÃ£o calculÃ¡vel | nÃ£o aplicÃ¡vel | nÃ£o encontrado | E-NA | Confirmar histÃ³rico e medir mÃ©tricas | alta; D nÃ£o comprovada |
| 22 / nÃ£o exposto | campanhas de marketing para clÃ­nica de estÃ©tica sem anÃºncios | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 14 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 23 / nÃ£o exposto | Campanhas sem anÃºncios para estÃ©tica | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 24 / nÃ£o exposto | Campanhas sem anÃºncios para estÃ©tica: quando post nÃ£o sustenta captaÃ§Ã£o | nÃ£o disponÃ­vel | â€” ESTIMADO | estimativa sem fonte/data/match verificÃ¡veis | â€” | nÃ£o utilizado; score nÃ£o provado / nÃ£o calculÃ¡vel | nÃ£o aplicÃ¡vel | nÃ£o encontrado | E-NA | Confirmar histÃ³rico e medir mÃ©tricas | alta; estimativa nÃ£o Ã© zero confirmado |
| 27 / nÃ£o exposto | captaÃ§Ã£o de pacientes sem trÃ¡fego pago | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 9 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 28 / nÃ£o exposto | checklist de plano de marketing para clÃ­nica de estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 1 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 31 / nÃ£o exposto | ClÃ­nicas precisam de outra estratÃ©gia de presenÃ§a | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 32 / nÃ£o exposto | Como a AdalbaPro organiza a captaÃ§Ã£o orgÃ¢nica | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 37 / nÃ£o exposto | como atrair pacientes para clÃ­nica de estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 4 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 38 / nÃ£o exposto | Como atrair pacientes para clÃ­nica quando posts nÃ£o sustentam a agenda | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 41 / nÃ£o exposto | como atrair pacientes sem redes sociais | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 2 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 49 / nÃ£o exposto | como criar um plano de marketing para clÃ­nica de estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 14 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 50 / nÃ£o exposto | Como eu trabalho: do diagnÃ³stico Ã  melhoria contÃ­nua | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 53 / nÃ£o exposto | ConteÃºdo por silos para buscas reais | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 54 / nÃ£o exposto | CONTEÃšDOS DE BAIXA CONCORRÃŠNCIA | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 56 / nÃ£o exposto | do diagnÃ³stico Ã  melhoria contÃ­nua | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 57 / nÃ£o exposto | E-E-A-T com autoridade mÃ©dica organizada | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 58 / nÃ£o exposto | E-E-A-T: mÃ©dicos e especialistas como fonte de autoridade | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 59 / nÃ£o exposto | Entre na lista das ferramentas da AdalbaPro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 64 / nÃ£o exposto | Fale com a gente | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 65 / nÃ£o exposto | Ferramentas AdalbaPro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 66 / nÃ£o exposto | Ferramentas AdalbaPro \| PrÃ©-cadastro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 67 / nÃ£o exposto | Ferramentas SEO da AdalbaPro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 68 / nÃ£o exposto | Growth &amp; otimizaÃ§Ã£o | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 70 / nÃ£o exposto | Infraestrutura tÃ©cnica que nÃ£o atrapalha a busca | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 71 / nÃ£o exposto | instagram nÃ£o traz pacientes | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 3 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 73 / nÃ£o exposto | Leituras para clÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 76 / nÃ£o exposto | marketing harmonizaÃ§Ã£o facial | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 9 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 80 / nÃ£o exposto | modelos de campanha para clÃ­nica de estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 11 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 85 / nÃ£o exposto | O que Adalba e AdalbaPro fazem | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 86 / nÃ£o exposto | O que eu faÃ§o na prÃ¡tica | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 89 / nÃ£o exposto | Perguntas frequentes | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 93 / nÃ£o exposto | plano de marketing para clÃ­nica de estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 11 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 98 / nÃ£o exposto | PresenÃ§a local conectada ao Google Maps | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 100 / nÃ£o exposto | Projetos em Next.js | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 101 / nÃ£o exposto | promoÃ§Ãµes para estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 7 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 103 / nÃ£o exposto | PrÃ©-cadastro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 104 / nÃ£o exposto | quando post nÃ£o sustenta captaÃ§Ã£o | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 105 / nÃ£o exposto | Redes Sociais | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 106 / nÃ£o exposto | Redes sociais e presenÃ§a profissional | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 107 / nÃ£o exposto | Respostas diretas sobre Adalba e AdalbaPro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 109 / nÃ£o exposto | SEO Local para aparecer na regiÃ£o certa | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 110 / nÃ£o exposto | SEO Local para clÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 111 / nÃ£o exposto | SEO Local para clÃ­nicas: aparecer na regiÃ£o certa | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 115 / nÃ£o exposto | SEO para clÃ­nicas: sua clÃ­nica invisÃ­vel no Google? | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 123 / nÃ£o exposto | SEO TÃ©cnico &amp; Performance em Next.js | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 124 / nÃ£o exposto | SEO tÃ©cnico e captaÃ§Ã£o local para clÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 125 / nÃ£o exposto | SEO TÃ©cnico e Performance em Next.js para ClÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 126 / nÃ£o exposto | SEO TÃ©cnico, Next.js e Autoridade OrgÃ¢nica | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 127 / nÃ£o exposto | SEO tÃ©cnico, Next.js e autoridade orgÃ¢nica para clÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 128 / nÃ£o exposto | ServiÃ§os e recursos disponÃ­veis | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 129 / nÃ£o exposto | ServiÃ§os e soluÃ§Ãµes | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 130 / nÃ£o exposto | ServiÃ§os e soluÃ§Ãµes da AdalbaPro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 131 / nÃ£o exposto | ServiÃ§os e soluÃ§Ãµes \| AdalbaPro | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 132 / nÃ£o exposto | SILOS POR PROCEDIMENTO | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 134 / nÃ£o exposto | Site para clÃ­nicas que precisa trazer trÃ¡fego | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 135 / nÃ£o exposto | Sobre Adalba \| SEO TÃ©cnico, Next.js e Autoridade OrgÃ¢nica | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 136 / nÃ£o exposto | Sobre Adalba: SEO tÃ©cnico, Next.js e autoridade orgÃ¢nica para clÃ­nicas | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 137 / nÃ£o exposto | sua clÃ­nica invisÃ­vel no Google? | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 140 / nÃ£o exposto | Transforme seu site numa estrutura real de &quot;captaÃ§Ã£o de Leads&quot;. | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |
| 146 / nÃ£o exposto | trÃ¡fego pago vs orgÃ¢nico para clÃ­nica de estÃ©tica | nÃ£o disponÃ­vel | 0 | zero nÃ£o confirmado; fonte/data/match ausentes | 12 | numÃ©rico nÃ£o exposto / nÃ£o calculÃ¡vel com zero | nÃ£o disponÃ­vel | nÃ£o encontrado | E-ZERO | Revisar histÃ³rico antes de invalidar | mÃ©dia; possÃ­vel score antigo |
| 147 / nÃ£o exposto | Um cadastro simples para uma camada mais inteligente. | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel | â€” | nÃ£o disponÃ­vel / nÃ£o calculÃ¡vel | nÃ£o disponÃ­vel | nÃ£o encontrado | E-MISSING | Nova mediÃ§Ã£o | alta para ausÃªncia; prÃ©via chama de incompatÃ­vel |

## Amostra manual possÃ­vel

As amostras abaixo sÃ£o amostras de **forma observada**, nÃ£o confirmaÃ§Ã£o de categoria A ou B:

- **3 zeros com KGR incompatÃ­vel:** `agÃªncia de marketing para clÃ­nica de estÃ©tica` (3 resultados), `agÃªncia de marketing para cosmÃ©ticos` (3) e `campanhas de marketing para clÃ­nica de estÃ©tica sem anÃºncios` (14). Todos permanecem E-ZERO porque a confirmaÃ§Ã£o do zero nÃ£o estÃ¡ exposta.
- **3 sem evidÃªncia de mediÃ§Ã£o:** `AdalbaPro | SEO tÃ©cnico e captaÃ§Ã£o local para clÃ­nicas`, `SEO Local para clÃ­nicas` e `Projetos em Next.js`.
- **NÃ£o houve 3 exemplos comprovados de volume positivo divergente:** nenhum dos 71 apresentou, na tela, volume positivo com KGR incompatÃ­vel.
- **NÃ£o houve 3 exemplos comprovados de KGR nÃ£o aplicÃ¡vel com score armazenado:** foram observados apenas 2 registros nÃ£o aplicÃ¡veis sem score comprovÃ¡vel: `Blog com mÃ©todo KGR para comeÃ§ar pelas palavras certas` e `Campanhas sem anÃºncios para estÃ©tica: quando post nÃ£o sustenta captaÃ§Ã£o`.
- **NÃ£o houve zero confirmado:** fonte, data e `match: exact` nÃ£o foram expostos para nenhum dos 14 zeros.

## Publicados e possÃ­vel volume sobrescrito

Os 14 casos E-ZERO aparecem como publicados na grade. Nenhum URL, slug, canonical, keyword principal, polÃ­tica da principal, publicaÃ§Ã£o ou marca foi alterado. Eles sÃ£o os Ãºnicos candidatos a possÃ­vel volume sobrescrito ou a zero confirmado com KGR antigo, mas a distinÃ§Ã£o depende de `analise_semantica.volume_measurement`, `kgr_score_history` e metadados de mediÃ§Ã£o.

## Fontes e confiabilidade

| Fonte | Uso | Confiabilidade nesta auditoria |
|---|---|---|
| Registro exibido na tabela autenticada | keyword, posiÃ§Ã£o, mÃ©tricas apresentadas, aplicabilidade aparente e status | Alta para o que estÃ¡ visÃ­vel; insuficiente para proveniÃªncia |
| PrÃ©via diagnÃ³stica | contador 71 e rÃ³tulo atual | Alta para o sintoma; baixa para a classificaÃ§Ã£o, pois mistura pendÃªncia |
| HistÃ³rico semÃ¢ntico | nÃ£o exposto na grade | NÃ£o utilizado; nÃ£o inventado |
| HistÃ³rico de mediÃ§Ã£o | nÃ£o exposto na grade | NÃ£o utilizado; nÃ£o inventado |
| Snapshot/exportaÃ§Ã£o canÃ´nica | nÃ£o disponÃ­vel localmente | NÃ£o utilizado |
| Backup `migration_backup...` | nÃ£o consultado por SQL e nÃ£o tratado como verdade | NÃ£o utilizado |

## Riscos e correÃ§Ã£o futura

1. Corrigir primeiro o classificador/prÃ©via para separar `pending`/`inconsistent`; volume ausente nÃ£o deve entrar automaticamente como incompatÃ­vel.
2. Para os 14 E-ZERO, gerar uma prÃ©via read-only com ID real, `volume_measurement`, fonte, data, match, histÃ³rico e score anterior. SÃ³ depois de confirmaÃ§Ã£o humana invalidar o KGR atual.
3. Para os 55 E-MISSING, solicitar nova mediÃ§Ã£o explÃ­cita; nÃ£o gravar zero, nÃ£o restaurar volume presumido e nÃ£o alterar allintitle.
4. Para os 2 E-NA, preservar a aplicabilidade e medir as mÃ©tricas independentemente; somente classificar como D se houver score histÃ³rico comprovado.
5. Qualquer operaÃ§Ã£o futura deve ter snapshot lÃ³gico somente leitura, confirmaÃ§Ã£o por categoria, patch localizado, verificaÃ§Ã£o pÃ³s-escrita e rollback lÃ³gico que preserve resultados, URL, slug, canonical, principal e marca.

## LimitaÃ§Ãµes e confirmaÃ§Ã£o de integridade

- A auditoria nÃ£o corrigiu nenhum registro.
- NÃ£o houve chamada Google/RapidAPI, SQL, migration, escrita remota, commit, push ou deploy.
- NÃ£o foi possÃ­vel entregar IDs reais ou metadados ocultos sem uma fonte de exportaÃ§Ã£o/consulta que exponha esses campos; preencher esses valores seria inventar evidÃªncia.
- A seleÃ§Ã£o e os filtros usados para leitura foram restaurados ao estado observado originalmente (`Publicados`, 20 termos) antes do encerramento da sessÃ£o; nenhuma preferÃªncia ou dado de domÃ­nio foi deliberadamente alterado.
> AtualizaÃ§Ã£o de implementaÃ§Ã£o â€” 2026-07-27: a classificaÃ§Ã£o do workspace foi corrigida de forma localizada. AusÃªncia de mÃ©tricas agora Ã© `measurement_pending`, zero sem confirmaÃ§Ã£o Ã© `zero_unconfirmed`, decisÃ£o nÃ£o aplicÃ¡vel Ã© `not_applicable` e somente evidÃªncia numÃ©rica suficiente Ã© `inconsistent`. Os registros nÃ£o foram corrigidos nem escritos remotamente; esta auditoria histÃ³rica continua conservadora em `INSUFFICIENT_EVIDENCE`.
