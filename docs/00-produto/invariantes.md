# Invariantes do produto

13. Site observa, Minerador qualifica, Arquiteto forma e Radar valida somente o ArticleDNA formado; KGR, volume, resultados e intenção não podem ser promovidos por inferência de URL ou slug.

1. DNAs permanecem rastreáveis por identidade, versão, hash e proveniência.
2. IA aplicada não significa aprovado.
3. Publicados mantêm slug, canonical, keyword principal, marca e URL estrutural protegidos.
4. Importação é seletiva, idempotente e limitada à marca correta.
5. Seleção não controla renderização.
6. Estado vazio não sobrescreve estado válido.
7. Toda keyword importada possui localização conhecida ou é bloqueada para reconciliação.
8. SiloDNA e SiloPage são entidades diferentes.
9. Versões consolidadas são imutáveis; uma alteração cria sucessora.
10. Operações estruturais exigem snapshot, rollback definido e regressão executada.
11. Sucesso só aparece após salvamento confirmado pelo meio de persistência aplicável.
12. Dados de marcas diferentes nunca se misturam.
13. Tenant de URL, body de API e cache local deve resolver para a mesma marca; divergência é recusada no servidor.
14. Preferência local de marca não concede acesso nem substitui contexto canônico de rota.
15. `brandId` é `public.marcas.id`; `brandRef` é somente referência pública, e owner, membro e ator são identidades distintas.
16. `keywords_kgr.brand_id` é obrigatório e `lista_id` é opcional; uma keyword sem lista permanece válida e vinculada à marca.
17. `keywords_kgr.lista_id → listas_kgr.id` usa `ON DELETE RESTRICT`; excluir uma lista nunca apaga keywords.

Estas regras são canônicas. Uma exceção exige proposta SDD aprovada e atualização desta documentação quando permanente.
