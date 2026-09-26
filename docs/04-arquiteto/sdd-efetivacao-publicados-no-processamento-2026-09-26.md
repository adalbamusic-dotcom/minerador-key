# SDD — Efetivar a arquitetura já publicada no primeiro processamento

**Módulo proprietário:** Arquiteto. **Estado:** autorizado pela correção explícita do dono em 2026-09-26. Não autoriza SQL/migration remota, deploy ou chamadas pagas.

## Contrato atual e defeito

O Vínculo aprovado do Minerador declara a natureza publicada (`Silo · declarado` ou `Artigo · declarado`) e a URL/canonical. A URL do artigo sob a raiz da página de Silo determina sua membership. O processamento reconhece isso na proposta, mas cria o território publicado como `candidate/pending` e deixa as memberships declaradas para `Confirmar arquitetura`. A formação exige território confirmado. Resultado observado: quatro Silos publicados e 21 artigos publicados ficam bloqueados, embora não exista decisão editorial nova a tomar.

## Contrato proposto

No primeiro `Processar arquitetura`, materializar apenas os fatos já declarados: criar/reutilizar o território do Silo publicado com identidade protegida; associar a cabeça e os artigos publicados cuja URL resolve inequivocamente sob essa raiz; verificar as escritas por releitura; e marcar esse território como pronto para a formação de artigos. O Vínculo publicado é a decisão humana anterior; a efetivação não é nova aprovação. Também reconhecer territórios publicados candidatos criados por processamento anterior, sem duplicá-los. Artigos publicados continuam artigos próprios; cabeças publicadas continuam SiloPages.

O reconhecimento só ocorre com declaração publicada legível e destino inequívoco. URL ausente, colisão de raízes, outra marca, falha de escrita ou identidade divergente são conflitos explícitos. Keywords livres, Silos novos/potenciais, papéis Pilar/Suporte, troca da principal revisável e alterações propostas de ArticleDNA/SiloDNA continuam sujeitos aos gates existentes. O sistema não altera URL, slug, canonical nem identidade publicada.

## Consumidores, compatibilidade, rollback e testes

Consumidores: paisagem territorial, aba Artigos, formador por Silo, confirmação de arquitetura, Radar e guia MCP. O payload existente de território/workflow é reutilizado; sem schema nem migration. A confirmação manual permanece para Silos novos e propostas livres. O marcador do cenário registra resultado parcial quando houver falhas; não atesta o que a releitura não mostrou.

Rollback de código: retornar à versão anterior, preservando os territórios e memberships já efetivados; não apagar dados. Reprocessar é idempotente. Testar o lote de quatro Silos/21 artigos, candidato publicado legado, Silo potencial, keyword livre, conflito de URL, falha de escrita, isolamento por marca e readback. TypeScript, lint, `test:arquiteto`, `test:agent` e verificação visual manual após deploy. Nenhuma escrita remota faz parte desta implementação local.
