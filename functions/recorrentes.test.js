const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contaDoMes, ativaNoMes, vencimentoNoMes, mesesParaGerar } = require("./recorrentes");

const aluguel = { id: "r1", nome: "Aluguel Loja 02", categoria: "aluguel_imovel", finance_category: "despesa_operacional", valor: 2700, valor_tipo: "fixo", dia_vencimento: 10, loja: "loja02", forma_pagamento: "Boleto", inicio: "2026-11", meses: null };

test("conta do mês: a pagar, vencimento no dia, ID fixo por mês", () => {
    const c = contaDoMes(aluguel, "2026-11");
    assert.equal(c.id, "rec_r1_2026-11");
    assert.deepEqual({ ...c.dados }, {
        description: "Aluguel Loja 02", amount: 2700, valor_previsto: 2700, categoria: "aluguel_imovel", finance_category: "despesa_operacional",
        store_id: "loja02", forma_pagamento: "Boleto", status: "pendente", date: "2026-11-10", due_date: "2026-11-10", payment_date: null,
        competence_month: "2026-11", recorrencia_id: "r1", valor_tipo: "fixo", source: "recorrente",
    });
});

test("início, nº de meses, pulados e encerrada", () => {
    assert.equal(ativaNoMes(aluguel, "2026-10"), false);
    const seis = { ...aluguel, meses: 6 };
    assert.equal(ativaNoMes(seis, "2027-04"), true);
    assert.equal(ativaNoMes(seis, "2027-05"), false);
    assert.equal(ativaNoMes({ ...aluguel, pulados: ["2026-12"] }, "2026-12"), false);
    assert.equal(ativaNoMes({ ...aluguel, ativa: false, encerrada_em: "2026-12" }, "2026-12"), true);
    assert.equal(ativaNoMes({ ...aluguel, ativa: false, encerrada_em: "2026-12" }, "2027-01"), false);
});

test("conta variável usa o valor pago no mês anterior; dia 31 cai no último dia", () => {
    const luz = { ...aluguel, valor: 1300, valor_tipo: "estimado", dia_vencimento: 31 };
    assert.equal(contaDoMes(luz, "2027-02", 1180).dados.amount, 1180);
    assert.equal(contaDoMes(luz, "2027-02", null).dados.amount, 1300);
    assert.equal(contaDoMes({ ...aluguel }, "2027-02", 9999).dados.amount, 2700); // fixo ignora
    assert.equal(vencimentoNoMes("2027-02", 31), "2027-02-28");
});

test("gera o mês seguinte só na última semana", () => {
    assert.deepEqual(mesesParaGerar("2026-11-03"), ["2026-11"]);
    assert.deepEqual(mesesParaGerar("2026-11-24"), ["2026-11", "2026-12"]);
    assert.deepEqual(mesesParaGerar("2026-12-28"), ["2026-12", "2027-01"]);
});
