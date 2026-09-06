# Adendo de SDD — Radar: persistência verificável e continuidade entre sessões

**Data:** 2026-09-06 · **Módulo proprietário:** Radar
**Status:** especificação para implementação. O Escopo 0 é pré-requisito dos demais.

---

## 0. PARE AQUI — um fork não resolvido decide o resto

O teste de continuidade entre navegadores usa **duas contas diferentes**
(`adalbapro@gmail.com` no navegador B). Isso não invalida o teste por si só, mas
há um fato de RLS que precisa ser checado antes de qualquer implementação.

`editorial_workflow_items` e `editorial_artifact_versions` usam **a mesma**
policy de leitura:

```sql
USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()))
```

E `canonical_actor_can_access_brand` exige marca `active` e o ator sendo
`owner_user_id` **ou** membro `active` em `brand_memberships`. É acesso **por
marca**, não por dono da linha.

Consequência: as duas tabelas são visíveis ou invisíveis **juntas**.

### O discriminador, em 5 segundos

No navegador B, abrir **"Importar do Arquiteto"**:

| O que aparece | Conclusão | Ação |
|---|---|---|
| **Os 8 artigos aprovados** | B tem acesso à marca. Se ele não vê linhas do Radar, elas **não existem** no banco. | Bug real — seguir para o Escopo 1 |
| **"Nenhum item disponível"** | B **não** tem acesso à marca. O RLS está filtrando tudo. | O teste é inválido — dar acesso a B e repetir antes de implementar |

Uma das capturas mostra exatamente `0 selecionado(s) · 0 item(ns)` com
"Nenhum item disponível. Conclua a aprovação na etapa anterior." Se isso for o
navegador B, o fork já está decidido para o segundo caso.

### Confirmação por SQL (somente leitura)

```sql
-- B tem acesso à marca?
select b.owner_user_id, m.member_user_id, m.status
from public.marcas b
left join public.brand_memberships m
  on m.marca_id = b.id and m.status = 'active'
where b.id = '<BRAND_ID>';

-- As linhas existem, independentemente de quem enxerga?
select id, article_id, stage, state, created_by, lock_version, created_at
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>' and stage = 'radar'
order by created_at desc;
```

O segundo SELECT é o que encerra a dúvida: **se ele devolver linhas, a escrita
funciona e o problema é de leitura/autorização. Se devolver vazio, a escrita não
acontece** — e aí o Escopo 1 é o alvo certo.

> Implementar os Escopos 1 a 4 sem rodar isto arrisca resolver um problema que
> não existe e deixar o real intacto.

---

## 1. O que está verificado

| Fato | Como foi verificado |
|---|---|
| A escrita agora retorna sucesso HTTP | "2 item(ns) enviado(s)" sem 400 — o servidor aceitou o comando |
| O contrato do comando fecha | Comando `import_radar` completo montado fora do browser (2 ArticleDNA versionados, 2 hidratações reais, lote heterogêneo) passa no `WorkflowCommandSchema`, inclusive após ida e volta por JSON |
| A leitura da aplicação é por marca | `.eq("marca_id", marcaId).in("stage", ["radar","planner"])`, sem filtro de autor |
| O RLS também é por marca | `canonical_actor_can_access_brand`, mesma policy para artefatos e workflow |
| O cliente aplica o item local | `response.ok` → aplica `next` construído no browser; o servidor não devolve as linhas canônicas |
| A persistência de SERP é confirmada | "SERP real v2 coletada: 7 resultado(s). Persistência remota confirmada." — o caminho de escrita ao banco funciona |

**Leitura combinada:** a SERP confirma persistência remota na mesma sessão. Isso
enfraquece a hipótese de "banco desconectado" e fortalece as duas restantes —
autorização do navegador B, ou a escrita do workflow especificamente.

---

## 2. O que a evidência nova muda no plano original

O plano dizia que "o cliente ainda aceita qualquer resposta HTTP de sucesso e
aplica itens construídos localmente". **Continua verdade** e continua sendo o
item central: mesmo com o servidor gravando corretamente, a interface hoje
mostra um objeto que ela mesma montou, não o que o banco guardou. Enquanto isso
for assim, nenhuma mensagem verde prova coisa alguma.

O que mudou é que o 400 anterior **já não é a causa** — ele foi corrigido, e a
próxima recusa de schema virá com o caminho nomeado (`code:
"invalid_workflow_command"` + `details[].path`).

---

## 3. Escopo 1 — importação confirmada por readback

**Problema:** o POST devolve status; a interface aplica o item que ela construiu.
Divergência entre o que o browser acha e o que o banco guardou é invisível.

**Contrato novo (aditivo):**

```
POST /api/editorial/workflow  { action: "import_radar", ... }

→ 200 {
    results: [{
      articleId, outcome: "imported" | "already_exists" | "blocked",
      reason?: string,
      item?: RadarItem            // RELIDO do banco, não montado
    }],
    counts: { imported, alreadyExists, blocked }
  }
```

**Requisitos:**

1. Após cada upsert, **reler** a linha por `marca_id + article_id + stage='radar'`
   e conferir `articleDnaVersionId`, `articleDnaContentHash`, `brandId`, id
   remoto e `lock_version` antes de declarar importado.
2. Devolver o `RadarItem` reconstruído da linha remota, com `origin: "real"`.
3. O cliente aplica **somente** os itens confirmados. O objeto montado no browser
   vira prévia, nunca estado.
4. Resultado parcial é real: falha no segundo artigo **não** apaga a confirmação
   do primeiro, e nunca reporta "0 enviados" nesse caso.
5. Resposta incerta (timeout, rede) → **reler antes de repetir**. A repetição não
   pode duplicar linha nem substituir investigação existente.

**Atenção ao `ignoreDuplicates`.** O upsert usa
`onConflict: "marca_id,subject_type,subject_id,stage"` com
`ignoreDuplicates: true`. Linha já existente retorna vazio e cai no SELECT de
fallback. Esse caminho precisa distinguir **"já existia"** de **"não gravou"** —
hoje os dois chegam ao mesmo lugar.

---

## 4. Escopo 2 — SERP e processos humanos

Separar três estados que hoje se confundem:

| Estado | Significado |
|---|---|
| `collected` | a coleta voltou do provedor |
| `saved` | o POST de gravação não lançou |
| `readback_confirmed` | a releitura bateu identidade e conteúdo |

**Requisitos:**

1. Após salvar, reler o snapshot por `marca + artigo + articleDnaVersionId +
   snapshotId`; conferir hash e **quantidade de resultados**.
2. "Persistência remota confirmada" só aparece após essa verificação.
3. Coleta, curadoria, análise e revisão reconstruídas a partir dos registros
   remotos. Coleta concluída **abre** a próxima etapa humana; não aprova nada.
4. **Mapear cada controle das etapas** e verificar se a alteração tem gravação e
   releitura. Etapa ainda exclusivamente local precisa ser **nomeada neste
   adendo** antes de implementar — não descoberta durante.
5. Falha de gravação ou readback **preserva o resultado recuperável** e permite
   tentar de novo **sem repetir a chamada paga ao DataForSEO**.
6. Composição ou snapshot novo **não herda** a aprovação anterior.

---

## 5. Escopo 3 — hidratação entre sessões

1. Carregar os artigos do Radar **ao abrir o módulo**, sem depender de visitar o
   Arquiteto antes.
2. Servidor é a fonte dos itens confirmados.
3. **Nunca misturar lista remota vazia com itens locais e rotular como remoto.**
   Hoje: `persisted.radarItems.length ? merge(...) : current.radarItems` — servidor
   vazio mantém o local silenciosamente. É isso que faz "sobrevive ao F5" parecer
   persistência.
4. Recuperação local preservada, exibida **separadamente** e marcada como
   não sincronizada.
5. Erro de leitura visível, com **"Tentar carregar novamente"**.
6. Resposta atrasada de outra marca, versão ou sessão **não sobrescreve** o
   contexto atual.
7. Revalidar ao entrar no Radar e ao retornar o foco à janela. Sincronização em
   tempo real **não** entra nesta entrega.

---

## 6. Escopo 4 — diagnóstico por operação

1. Separar validação de entrada, autorização, gravação, readback e hidratação.
2. Registrar id da operação, marca, artigo, `articleDnaVersionId`, linha do
   workflow e snapshot. **Sem segredos.**
3. Preservar status HTTP e problemas de validação. Erro de dados persistidos
   **não** pode ser chamado de "comando inválido" nem "marca inválida".
4. Diferenciar, no GET: **resposta vazia**, **acesso negado**, **falha de
   leitura** e **payload inválido**. Hoje os quatro chegam como lista vazia.

Item 4 é o que teria encurtado esta investigação inteira.

---

## 7. Contratos e governança

- Respostas estendidas de forma **aditiva**: resultados, identidades canônicas e
  confirmação de releitura. Cliente antigo continua funcionando.
- Reutilizar tabelas e endpoints existentes. A restrição
  `UNIQUE (marca_id, subject_type, subject_id, stage)` já suporta a correção.
- **Nenhuma migration prevista.** Necessidade comprovada vem em documento
  separado, com o SELECT que a justifica.
- **Não alterar Auth, RLS ou a fundação global com base no sintoma.** Se o
  Escopo 0 apontar autorização, a correção é de *membership*, não de policy.
- **Não limpar caches nem dados como parte da correção.**
- Rollback: como tudo é aditivo, reverter é remover a leitura dos campos novos no
  cliente. O contrato antigo permanece válido.

---

## 8. Testes e aceite

**Fixtures:**

- importação simples, duplicidade, lote parcialmente concluído
- falha de gravação e falha de readback (separadas)
- snapshot salvo que não pode ser relido
- versão divergente entre artefato e linha
- recuperação local antiga
- resposta tardia após troca de marca

**Invariantes:**

- curadoria e revisão sobrevivem à reconstrução do workspace
- mudança material invalida **apenas** a aprovação corrente
- duas sessões autorizadas da mesma marca veem o mesmo
- outra marca não lê nem importa

**Smoke manual — o aceite:**

1. Importar dois artigos no navegador A
2. Abrir o Radar **diretamente** no navegador B (sem passar pelo Arquiteto)
3. Encontrar os **mesmos ids e versões**
4. Reutilizar a SERP já coletada de 7 resultados para validar leitura, curadoria e
   revisão nos dois. **Nova coleta paga só com autorização explícita.**
5. Recarregar as duas sessões e confirmar os mesmos snapshots e decisões

> **Aviso verde e F5 não encerram a tarefa.** O aceite exige POST confirmado por
> readback, GET confirmado e o segundo navegador.

**Suítes:** o Radar tem **36 arquivos de teste que não rodam em suíte nenhuma**
(não existe `test:radar`). Criar o script é pré-requisito para "coberto por
teste" significar alguma coisa aqui. Dois deles já falham por fixture
desatualizada. As 5 falhas de TypeScript e as regressões amplas de
`test:operational` e `test:authz` são pré-existentes e **não** devem ser
atribuídas a esta correção.

---

## 9. Ordem de execução

| Etapa | O quê | Depende de |
|---|---|---|
| **0** | Rodar o discriminador do Escopo 0 | — |
| **1** | `test:radar` + corrigir as 2 fixtures | — |
| **2** | Escopo 4 (diagnóstico por operação) | 0 |
| **3** | Escopo 1 (importação confirmada) | 0, 2 |
| **4** | Escopo 3 (hidratação) | 3 |
| **5** | Escopo 2 (SERP e processos) | 3 |
| **6** | Smoke de aceite nos dois navegadores | 3, 4, 5 |

Etapas 0 e 1 são baratas e independentes. **Começar por elas.**

---

## 10. Fronteiras

Radar é o **único módulo proprietário** desta especificação. Arquiteto e
Planejador entram como contratos consumidor e fornecedor — mudança neles é
conversa entre planners, não commit unilateral.

A correção do Arquiteto (materialização de `siloId` nas sucessoras) é tarefa
independente e **não bloqueia** nada aqui: o handoff hoje resolve o Silo por
hidratação de território, declarada em `siloIdProvenance`.
