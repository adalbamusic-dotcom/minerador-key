# Regras globais para agentes — Minerador Key

Este arquivo contém as regras operacionais mínimas do repositório. Ele não substitui specs, ADRs, contratos nem estados atuais dos módulos.

## 1. Fontes de verdade

Antes de alterar código ou documentação, leia:

1. `docs/00-produto/invariantes.md`;
2. `docs/00-produto/glossario.md`;
3. `docs/00-produto/fluxo-oficial.md`;
4. ADRs aceitos relacionados;
5. documentos aplicáveis em `docs/compartilhado/`;
6. `spec.md`, `estado-atual.md` e `backlog.md` do módulo proprietário;
7. contratos e comportamento atual confirmados no código.

Precedência em caso de conflito:

1. invariantes aprovados;
2. ADRs aceitos;
3. spec atual;
4. contratos confirmados no código;
5. estado atual validado;
6. backlog;
7. propostas não aprovadas;
8. histórico.

`docs/_arquivo/` é histórico e não é fonte de verdade.

Não registrar como implementado algo que existe apenas como proposta. Quando necessário, distinguir: **Verificado no código**, **Confirmado por teste**, **Validado manualmente**, **Relatado pelo usuário**, **Planejado** e **Ainda não verificado**.

## 2. Produto e fluxo

O Minerador Key é um monólito modular multi-marca.

Fluxo operacional:

`Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações`

Pipeline estratégico:

`BrandDNA → KeywordDNA → ArticleDNA → SiloDNA / SiloPage → SERP e evidências → ContentPlan → ContentDocument → PublicationRecord`

Cada etapa acrescenta contexto sem apagar silenciosamente a anterior. A proveniência deve continuar rastreável até as keywords originais.

Responsabilidades:

- **Marca:** BrandDNA, posicionamento, materiais, site, equipe, papéis, permissões e contexto da marca;
- **Minerador:** Extensão, importação, listas, qualificação, KGR, intenção, KeywordDNA e envio ao Arquiteto;
- **Arquiteto:** formação dos artigos, principal, secundárias, reforços, ArticleDNA, SiloDNA, SiloPage e validação do agrupamento;
- **Radar:** recebe o artigo formado e investiga SERP, concorrentes, estruturas, semântica, perguntas, fontes e evidências;
- **Planejador:** transforma estratégia e evidências em ContentPlan;
- **Redator:** executa o ContentPlan e produz ContentDocument;
- **Publicações:** controla fila, URLs, exportações, versões, publicação, atualização e histórico.

O Radar não reagrupa keywords, não redefine papéis e não troca silenciosamente a principal. O Planejador não refaz a investigação da SERP.

## 3. Módulo proprietário

Toda tarefa deve declarar um único módulo proprietário.

É permitido consultar outros módulos para compreender contratos e consumidores. Não é permitido alterar outro módulo silenciosamente nem ampliar o escopo sem necessidade técnica comprovada.

## 4. Arquivos compartilhados

Arquivo compartilhado não bloqueia automaticamente uma tarefa.

### Mudança aditiva e retrocompatível

Pode prosseguir sem nova autorização quando:

- for mínima e necessária para a tarefa autorizada;
- preservar o contrato público e os consumidores atuais;
- identificar consumidores afetados;
- incluir regressão relacionada;
- não ampliar o escopo.

Exemplos: campo opcional, função adicional, adaptador específico, correção sem quebra, extensão compatível de tipo ou normalizador preservando o formato anterior.

O agente deve registrar arquivo, motivo, consumidores preservados, compatibilidade e testes.

### Mudança estrutural ou incompatível

Exige SDD e autorização antes do código quando envolver:

- schema, persistência, autenticação ou workflow;
- nova entidade estrutural;
- remoção ou mudança de significado de campos;
- contrato incompatível;
- hidratação global;
- substituição de componente compartilhado;
- mudança de fronteira entre módulos.

A SDD deve registrar contrato atual, proposta, consumidores, riscos, compatibilidade ou migração, rollback, testes e autorização necessária. Uma SDD aprovada autoriza apenas o escopo descrito.

## Next.js 16 e documentação aplicável

O projeto usa Next.js 16 (App Router). Antes de alterar rotas, APIs, cache, proxy/middleware ou convenções do framework, consultar a documentação aplicável em `node_modules/next/dist/docs/` no checkout. Respeitar depreciações, mudanças de versão e diferenças específicas do Next.js 16; registrar limitações quando a documentação local não estiver disponível.

## 5. Tenantização

A identidade canônica do tenant é:

`brandId = public.marcas.id`

Não usar owner como tenant.

Identidades:

- `brandId = marcas.id`;
- `ownerUserId = marcas.owner_user_id`;
- `actorUserId = auth.users.id / auth.uid()`;
- membros por `brand_memberships.member_user_id`.

Formato canônico da rota:

`brandRef = slug-da-marca--brandId`

Rotas:

- `/{brandRef}/`;
- `/{brandRef}/minerador`;
- `/{brandRef}/arquiteto`;
- `/{brandRef}/radar`;
- `/{brandRef}/radar/{articleId}`;
- `/{brandRef}/planejador`;
- `/{brandRef}/redator`;
- `/{brandRef}/publicacoes`;
- `/{brandRef}/conta`;
- `/admin` global.

Não utilizar `/workspace` como rota atual.

Regras:

- Admin global pode administrar marcas sem virar owner;
- Admin global pode permanecer com `perfis.marca_id = null`;
- owner administra a própria marca;
- colaboradores acessam por membership ativa;
- não existe fallback silencioso para outra marca;
- dados de marcas diferentes nunca se misturam.

## 6. Marca ativa, Extensão e Minerador

Extensão e Minerador operam sempre no contexto da marca ativa.

- toda importação carrega o `brandId` real;
- nome ou slug não substituem o `brandId`;
- trocar a marca atualiza o contexto da Extensão;
- a Extensão não envia keywords para marca anterior, padrão ou presumida;
- listas, keywords, idempotência e deduplicação são isoladas por marca;
- marca nova pode iniciar com Minerador vazio;
- estado vazio de uma marca não sobrescreve dados válidos de outra.

Estado já validado e que não deve ser redesenhado sem evidência de regressão:

- Adalba e Lindisse estão isoladas;
- troca de marca e rotas tenantizadas funcionam;
- Minerador da Lindisse inicia vazio;
- dados da Adalba permanecem preservados;
- a Extensão acompanha a marca ativa.

O Minerador é proprietário da ingestão e qualificação das keywords.

Quando Radar ou outro módulo precisar alterar contrato compartilhado consumido pela Extensão ou pelo Minerador, pode fazer mudança aditiva mínima com testes de marca ativa, isolamento, importação e consumidores anteriores. Mudança incompatível exige SDD.

## 7. Radar e SERP

O Radar recebe o `ArticleDNA` como contrato do artigo formado.

Pode conferir ou atualizar snapshots, investigar concorrentes, estruturas, semântica, perguntas, fontes e evidências, além de registrar conflitos, lacunas e oportunidades.

Não pode reagrupar ou remover keywords, redefinir principal/secundárias/reforços, nem alterar slug, canonical, marca ou URL publicada.

Diagnósticos externos geram alertas ou propostas. Alterações de arquitetura voltam ao Arquiteto e exigem decisão humana.

Chamadas reais de SERP devem ser explícitas. Testes usam fixtures e não consomem créditos.

## 8. Identidade, autenticação e usuários

- `auth.users` é a fonte canônica das identidades que fazem login;
- `public.perfis` não precisa conter todos os usuários e pode representar papéis globais;
- owners e colaboradores vinculam-se por `owner_user_id` e memberships;
- o frontend pesquisa usuários por nome ou e-mail;
- UUID técnico pode ser exibido, mas não exigido como entrada manual.

Decisões atuais:

- Google OAuth está suspenso, não removido;
- cadastro e login manuais são prioritários;
- Google Sheets é separado do login;
- Supabase Auth será a autenticação canônica;
- NextAuth só sai na tarefa específica de consolidação;
- não remover NextAuth parcialmente;
- autenticação e convites são frentes separadas.

`/cadastro` cria apenas a identidade Auth: não cria marca, membership nem associação automática. Usuário autenticado sem marca é estado válido, não acessa módulos tenantizados e não recebe fallback para outra marca.

Convites e permissões devem seguir as specs de Marca, Conta e Admin. Admin não cria senha de colaborador; convite é temporário, de uso único e não concede acesso antes da aceitação. Mudança de owner é operação estrutural separada.

## 9. IA, decisão humana e versionamento

IA aplicada não significa aprovada.

Padrão:

`IA analisa → aplica na cópia de trabalho → destaca mudanças → registra justificativas e conflitos → usuário revisa → usuário aprova`

Regras:

- decisão final é humana;
- decisão humana confirmada não é alterada silenciosamente;
- diagnóstico externo não sobrescreve DNA;
- IDs inventados por IA são rejeitados;
- `ID · vN` é rótulo visual, não ID técnico;
- versões consolidadas são imutáveis;
- nova versão somente quando há mudança real;
- ArticleDNA preserva referências individuais aos KeywordDNAs;
- SiloDNA e SiloPage são independentes e possuem aprovações próprias;
- testes usam fixtures e mocks, sem APIs ou modelos pagos.

## 10. Importação, estado e persistência

- importações são seletivas, explícitas e idempotentes;
- seleção controla ações, não renderização;
- estado vazio nunca substitui estado válido;
- localStorage não pode ser fonte única de verdade;
- localStorage e IndexedDB não podem ser limpos sem autorização;
- sucesso só aparece após confirmação real do salvamento;
- operação estrutural exige snapshot, validação e rollback;
- nenhuma keyword importada ao Arquiteto pode desaparecer;
- toda keyword importada deve estar em artigo ou em `Keywords não agrupadas`;
- nenhum módulo modifica outro silenciosamente.

## 11. Conteúdos publicados

Sempre preservar URL, slug, canonical e marca.

A principal publicada possui dois estados:

1. **travada**;
2. **revisável**.

No estado revisável, pode ser substituída apenas com melhor adequação, intenção preservada, URL/slug/canonical protegidos, validação no Arquiteto, decisão humana, nova versão e histórico.

Nenhum módulo troca a principal silenciosamente. O Radar apenas diagnostica e propõe revisão.

Ausência de política em conteúdo publicado resulta em estado desconhecido/conflito; não libera nem bloqueia silenciosamente a troca. A principal atual permanece preservada até resolução humana.

## 12. Status separados

### Workflow editorial

- Em processo;
- Aguardando aprovação;
- Aprovado;
- Bloqueado/com conflitos.

### Publicação

- Novo;
- Publicado protegido.

### Transferência

- Não enviado;
- Enviado à próxima etapa;
- Atualização disponível.

Ações como enviar, exportar ou publicar não são status editoriais.

## 13. Regras editoriais

- FAQ não integra mais o fluxo padrão;
- não gerar nem sugerir FAQ automaticamente;
- FAQ legado não é removido automaticamente;
- padrão visual normal: uma capa e dois ou três respiros;
- Planejador cria plano visual e prompts de imagem;
- artigo KGR pode reunir até seis keywords somente com intenção e coerência reais;
- conteúdo KGR novo mantém forte alinhamento entre principal e slug;
- termos de maior volume e cauda menor tendem a Pilar quando houver centralidade;
- secundárias reforçam volume e narrativa;
- agrupamento e validação da formação pertencem ao Arquiteto;
- Radar recebe ArticleDNA como contrato.

## 14. Banco e migrations consolidadas

Os efeitos das migrations `0005` e `0006` já existem no banco.

Não executar novamente `0005`, `0006` nem seus rollbacks.

Estado consolidado:

- `keywords_kgr.brand_id` existe;
- `marcas.owner_user_id` existe;
- `brand_memberships` existe;
- RLS e policies tenantizadas existem;
- `anon` não acessa tabelas privadas;
- `authenticated` opera sujeito a RLS;
- `service_role` é reservado a operações administrativas server-side.

FK canônica:

`keywords_kgr.lista_id → listas_kgr.id → ON DELETE RESTRICT`

Excluir lista nunca pode apagar keywords. Keywords sem lista continuam válidas e visíveis.

## 15. Segurança operacional

O usuário executa manualmente:

- instalações;
- comandos simples;
- SQL e migrations;
- configuração de serviços;
- login, cadastro e smoke tests reais;
- commit, push e deploy.

O agente trabalha em diagnóstico, arquitetura, implementação, correções, testes direcionados, integrações e documentação.

Não executar ou autorizar automaticamente, salvo autorização explícita para a operação específica:

- commit, push ou deploy;
- migration ou SQL remoto;
- escrita no Supabase remoto;
- troca de projeto Supabase;
- alteração remota de autenticação;
- instalação;
- exclusão ou limpeza de dados;
- limpeza de localStorage ou IndexedDB;
- chamadas pagas em testes.

Não solicitar plugins de GitHub ou Supabase.

## 16. Processo e testes

### Mudança localizada

1. ler spec e estado atual;
2. confirmar o comportamento no código;
3. corrigir a causa;
4. testar o módulo e regressões relacionadas;
5. executar TypeScript e lint direcionado;
6. atualizar documentação.

### Mudança estrutural

1. ler documentação e auditar código;
2. criar SDD;
3. mapear arquivos, consumidores e riscos;
4. definir compatibilidade, migração, rollback e testes;
5. obter autorização quando incompatível;
6. gerar snapshot quando houver dados locais;
7. implementar somente o escopo aprovado;
8. executar testes do módulo, contratos e consumidores;
9. executar TypeScript, lint, build e `git diff --check`;
10. documentar.

TypeScript, build e testes unitários não provam que a interface funciona. Regressões visuais ou operacionais exigem validação manual.

Alterações compartilhadas entre Extensão, Minerador, Arquiteto e Radar devem testar marca ativa, isolamento por `brandId`, importação idempotente, preservação de listas/keywords e consumidores anteriores.

## 17. Documentação ao concluir

- atualizar `estado-atual.md`;
- atualizar `backlog.md`;
- alterar `spec.md` somente quando uma regra permanente mudar;
- criar ou atualizar ADR somente para decisão arquitetônica;
- registrar arquivos alterados, compartilhados e consumidores preservados;
- registrar testes, validação manual, limitações e pendências;
- diferenciar persistência local, remota e simulada.

Não declarar conclusão apenas porque TypeScript, build ou testes passaram, um botão renderizou, fallback local funcionou ou uma mensagem de sucesso apareceu.

A conclusão exige comparar objetivo, código, persistência real, interface e comportamento validado.

## 18. Ordem atual de desenvolvimento

1. Radar — SERP real;
2. Arquiteto — recuperação e integridade;
3. Planejador — ContentPlan definitivo;
4. Redator — salvamento, aprovação e envio;
5. Publicações — exportação e atualização;
6. Marca — equipe, permissões e BrandDNA;
7. Minerador — revisão fina;
8. Conta — preferências e segurança;
9. Admin — gestão da plataforma.

Não alterar a ordem nem abrir nova frente sem dependência técnica comprovada.
