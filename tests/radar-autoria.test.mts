import assert from "node:assert/strict";
import test from "node:test";
import { readRadarArticleAuthors } from "../lib/server/radar-article-authors.ts";
import { radarWritingAuthorLine } from "../lib/radar/portable-writing-export.ts";

/*
 * QUEM ASSINA O ARTIGO (pedido do dono, 2026-10-02): o especialista da aba
 * Especialista é o E-E-A-T. O nome é lido ao vivo pelo id que o pacote guarda,
 * filtrado pela marca. Cliente falso: nada de banco.
 */

const MARCA = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";

function cliente(linhas: Array<{ id: string; display_name: string; specialty: string | null; status: string }>, erro: { message: string } | null = null) {
  const filtros: Array<[string, unknown]> = [];
  return {
    filtros,
    from(tabela: string) {
      assert.equal(tabela, "brand_experts");
      const consulta = {
        select: () => consulta,
        eq: (coluna: string, valor: unknown) => { filtros.push([coluna, valor]); return Promise.resolve({ data: erro ? null : linhas, error: erro }); },
      };
      return consulta;
    },
  };
}

test("assina quem respondeu: o especialista das contribuições aceitas, filtrado pela marca", async () => {
  const falso = cliente([
    { id: "e1", display_name: "Adalberto Escalante", specialty: "SEO local", status: "active" },
    { id: "e2", display_name: "Outra Pessoa", specialty: null, status: "active" },
  ]);
  const autores = await readRadarArticleAuthors(falso as never, MARCA, [{ articleId: "a1", expertIds: ["e1"] }]);
  assert.deepEqual(falso.filtros, [["brand_id", MARCA]]);
  assert.deepEqual(autores?.get("a1"), [{ name: "Adalberto Escalante", specialty: "SEO local", source: "contribution" }]);
});

test("sem contribuição: o único especialista ativo é sugerido; com dois, ninguém é inventado", async () => {
  const um = await readRadarArticleAuthors(cliente([{ id: "e1", display_name: "Adalberto Escalante", specialty: null, status: "active" }]) as never, MARCA, [{ articleId: "a1", expertIds: [] }]);
  assert.equal(um?.get("a1")?.[0]?.source, "only_active");
  const dois = await readRadarArticleAuthors(cliente([
    { id: "e1", display_name: "A", specialty: null, status: "active" },
    { id: "e2", display_name: "B", specialty: null, status: "active" },
  ]) as never, MARCA, [{ articleId: "a1", expertIds: [] }]);
  assert.deepEqual(dois?.get("a1"), []);
});

test("leitura falhou: null (o arquivo diz o texto de antes, sem inventar)", async () => {
  assert.equal(await readRadarArticleAuthors(cliente([], { message: "fora" }) as never, MARCA, [{ articleId: "a1", expertIds: ["e1"] }]), null);
});

test("a linha de autoria diz o nome, a origem e não acrescenta credencial", () => {
  assert.match(radarWritingAuthorLine([{ name: "Adalberto Escalante", specialty: "SEO local", source: "contribution" }]), /^Autoria \(E-E-A-T\): Adalberto Escalante \(SEO local\), especialista da aba Especialista/);
  assert.match(radarWritingAuthorLine([{ name: "X", specialty: null, source: "only_active" }]), /único especialista ativo da marca/);
  assert.match(radarWritingAuthorLine([]), /nenhum especialista definido.*Não invente autor/);
});
