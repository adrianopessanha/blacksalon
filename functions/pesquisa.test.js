const { test } = require("node:test");
const assert = require("node:assert/strict");
const { motivoParaNaoEnviar, pesquisaHoje, reservadaPorOutro, montarPayload, idTarefa } = require("./pesquisa");

const agora = Date.parse("2026-10-22T15:00:00Z");
const ts = (iso) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });
const CID = "c_0123456789abcdef0123";
const base = { cliente_id: CID, tipo: "servico", forma_pagamento: "Pix", data: ts("2026-10-22T14:00:00Z"), cliente_nome: "Ana", barbeiro_nome: "Veloso Martins", servico_descricao: "Corte maq + Barba", loja_id: "loja-01" };

test("atendimento com cliente identificado agenda; assinante usando o plano também", () => {
    assert.equal(motivoParaNaoEnviar(base, agora), null);
    assert.equal(motivoParaNaoEnviar({ ...base, forma_pagamento: "Assinante" }, agora), null);
});

test("não agenda: sem cliente, venda/renovação de assinatura, vale, produto, retroativo", () => {
    assert.ok(motivoParaNaoEnviar({ ...base, cliente_id: "5521997724661" }, agora));
    assert.ok(motivoParaNaoEnviar({ ...base, cliente_id: null }, agora));
    for (const tipo of ["venda_assinatura", "renovacao_celcoin", "venda_vale", "produto"]) assert.ok(motivoParaNaoEnviar({ ...base, tipo }, agora));
    assert.equal(motivoParaNaoEnviar({ ...base, data: ts("2026-10-20T14:00:00Z") }, agora), "lançamento retroativo");
});

test("1 por dia: bloqueia só se já recebeu hoje (fuso SP); ontem não bloqueia", () => {
    assert.equal(pesquisaHoje({ ultimaPesquisaEm: ts("2026-10-22T13:00:00Z") }, agora), true);
    assert.equal(pesquisaHoje({ ultimaPesquisaEm: ts("2026-10-21T20:00:00Z") }, agora), false);
    assert.equal(pesquisaHoje({ ultimaPesquisaEm: ts("2026-10-22T02:00:00Z") }, agora), false); // 21/10 23h em SP
    assert.equal(pesquisaHoje(undefined, agora), false);
});

test("reserva: envio em andamento bloqueia outra task e a mesma task entregue 2 vezes", () => {
    const c = { pesquisaReservadaEm: ts("2026-10-22T14:55:00Z"), pesquisaReservadaPor: "L1" };
    assert.equal(reservadaPorOutro(c, "L2", agora), true);
    assert.equal(reservadaPorOutro(c, "L1", agora), true);
    assert.equal(reservadaPorOutro({ ...c, pesquisaReservadaEm: ts("2026-10-22T14:00:00Z") }, "L2", agora), false);
});

test("payload no formato pedido, data em São Paulo", () => {
    assert.deepEqual(montarPayload("L1", base, "5521997724661"), {
        lancamentoId: "L1", telefone: "5521997724661", nome: "Ana", barbeiro: "Veloso",
        servico: "Corte maq + Barba", unidade: "loja 1", dataAtendimento: "2026-10-22 11:00:00",
    });
    assert.equal(montarPayload("L1", { ...base, loja_id: "loja-02" }).unidade, "loja 2");
});

test("id da task: um por cliente por dia (fuso SP)", () => {
    assert.equal(idTarefa(CID, new Date("2026-10-23T02:30:00Z")), `pesquisa-${CID}-20261022`);
});
