# Estado atual — associação de Marca — 2026-07-26

- Usuário sem membership permanece em estado de espera e não recebe fallback para a Adalba.
- Resolução tenant prioriza `marcas.owner_user_id` e `brand_memberships.member_user_id`; e-mail é compatibilidade de schema antigo.
- O fluxo completo de aceite de convite está em SDD separado e não houve migration nesta tarefa.
