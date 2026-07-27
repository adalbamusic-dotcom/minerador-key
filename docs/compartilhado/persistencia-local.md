# Persistencia local por tenant

Recuperacoes, filtros e snapshots existentes usam `brandId` nas chaves. A rota canônica usa `brandRef = slug-da-marca--brandId`; `selected_brand_id` é somente preferência compatível de navegação, nunca fonte de autorização ou tenant. URL, contexto server-side e persistência devem permanecer na mesma marca. Nenhuma chave existente é apagada, localStorage ou IndexedDB é limpo, e estado vazio não substitui estado válido.
