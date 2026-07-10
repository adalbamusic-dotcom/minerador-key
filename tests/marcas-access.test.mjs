import assert from "node:assert/strict";
import test from "node:test";
import {
  listMarcasForProfile,
  MarcasAccessError,
} from "../lib/server/marcas-access.mjs";

const brands = [
  { id: "marca-a", nome: "Marca A" },
  { id: "marca-b", nome: "Marca B" },
];

async function fakeFetchBrands(marcaId) {
  return marcaId === null
    ? brands
    : brands.filter((brand) => brand.id === marcaId);
}

test("GET /api/marcas: sem sessao retorna 401", async () => {
  await assert.rejects(
    () => listMarcasForProfile(null, fakeFetchBrands),
    (error) => error instanceof MarcasAccessError && error.status === 401
  );
});

test("GET /api/marcas: perfil ausente ou sem vinculo retorna 403", async () => {
  let fetchCalled = false;

  await assert.rejects(
    () =>
      listMarcasForProfile(
        { isAdmin: false, marcaId: null },
        async () => {
          fetchCalled = true;
          return brands;
        }
      ),
    (error) => error instanceof MarcasAccessError && error.status === 403
  );

  assert.equal(fetchCalled, false, "a consulta Service Role nao deve ser iniciada");
});

test("GET /api/marcas: cliente recebe somente a marca vinculada", async () => {
  const result = await listMarcasForProfile(
    { isAdmin: false, marcaId: "marca-a" },
    fakeFetchBrands
  );

  assert.deepEqual(result, [{ id: "marca-a", nome: "Marca A" }]);
});

test("GET /api/marcas: admin pode listar todas as marcas", async () => {
  const result = await listMarcasForProfile(
    { isAdmin: true, marcaId: null },
    fakeFetchBrands
  );

  assert.deepEqual(result, brands);
});
