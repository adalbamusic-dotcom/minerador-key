# Correção de integridade da hidratação do Radar — 2026-07-20

## Decisão

O Radar passa a transportar um `RadarHydrationSnapshot` aditivo no import do Arquiteto e a reconciliar registros antigos sem esse snapshot durante o reload. A identidade do `RadarItem`, seus estados, locks, ArticleDNA, KeywordDNA e SiloDNA não são substituídos.

## Causa comprovada

O Arquiteto montava a lista mestre incluindo keywords com `lista_id` nulo. O endpoint `/api/inteligencia` filtrava essas linhas para fora e ainda exigia `lista_id` não nulo no DTO. Em paralelo, o item Radar carregava apenas referências por ID, enquanto o resolver exigia igualdade literal. Artigos publicados podiam chegar com `pub-k-<id>` em vez do ID canônico. O resultado era a perda do texto hidratado e o bloqueio indevido da SERP.

## Regras de segurança

- IDs técnicos nunca são enviados como query à Serper.
- Aliases `pub-k-*` são resolvidos apenas contra registros da marca autorizada.
- O texto persistido no snapshot é uma cópia de recuperação; a validação server-side continua obrigatória.
- Falha de reconciliação mantém o item sem dados e bloqueia a coleta, sem inventar keyword ou silo.
- Não há exclusão, limpeza de storage, recriação de artigo, alteração de slug/canonical ou chamada real paga nesta implementação.

## Validação

As fixtures cobrem alias `pub-k-*`, preservação do texto canônico, reconciliação sem duplicação e preservação da identidade do item. A validação visual do artigo real e a coleta real continuam pendentes de sessão autenticada e configuração operacional autorizada.
