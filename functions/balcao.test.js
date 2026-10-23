const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decidirVendaBalcao, vencimentoDe } = require("./balcao");

const venda = { nome: "Ana", telefone: "5521986207196", plano: "Corte Completo", valor: 100, hoje: "2026-10-23" };

test("vencimento: mesmo dia do mês seguinte", () => {
    assert.equal(vencimentoDe("2026-10-23"), "2026-11-23");
    assert.equal(vencimentoDe("2026-12-10"), "2027-01-10");
    assert.equal(vencimentoDe("2027-01-31"), "2027-03-03");
});

test("cliente novo vira assinante de balcão, com início do contrato", () => {
    const r = decidirVendaBalcao({ ...venda, atual: null, admin: false });
    assert.equal(r.resultado, "criado");
    assert.equal(r.upd.origem, "balcao");
    assert.equal(r.upd.inicio_contrato, "2026-10-23");
    assert.equal(r.upd.vencimento, "2026-11-23");
});

test("balcão existente renova e mantém o início do contrato", () => {
    const r = decidirVendaBalcao({ ...venda, atual: { origem: "balcao", inicio_contrato: "2026-05-01" }, admin: false });
    assert.equal(r.resultado, "renovado");
    assert.equal(r.upd.inicio_contrato, undefined);
    assert.equal(r.upd.ciclo_desde, "2026-10-23");
});

test("Celcoin nunca é alterado; Abacatepay só por admin, sem trocar a origem", () => {
    assert.equal(decidirVendaBalcao({ ...venda, atual: { origem: "celcoin" }, admin: true }).upd, null);
    assert.equal(decidirVendaBalcao({ ...venda, atual: { origem: "abacatepay" }, admin: false }).upd, null);
    const r = decidirVendaBalcao({ ...venda, atual: { origem: "abacatepay" }, admin: true });
    assert.equal(r.upd.origem, undefined);
    assert.equal(r.upd.status_assinatura, "ativa");
});
