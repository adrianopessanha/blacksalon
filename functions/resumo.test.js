const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calcularResumo, mesAnterior, taxaOnline } = require("./resumo");

test("mês anterior no fuso de SP (dia 1 às 03h fecha o mês anterior)", () => {
    assert.equal(mesAnterior(new Date("2026-11-01T06:00:00Z")), "2026-10");
    assert.equal(mesAnterior(new Date("2027-01-01T06:00:00Z")), "2026-12");
});

test("taxa online igual à de src/config/taxas.js", () => {
    assert.deepEqual([taxaOnline(80), taxaOnline(100), taxaOnline(140)], [5.51, 6.74, 9.2]);
});

test("resumo: mesma conta da aba (extrato + balcão − maquininha − comissões) e eventos do mês", () => {
    const r = calcularResumo({
        mes: "2026-10", ativos: 86, liquidoReal: 1000,
        assinantes: [{ inicio_contrato: "2026-10-03" }, { inicio_contrato: "2026-09-03" }],
        lancamentosMes: [
            { tipo: "renovacao_celcoin", forma_pagamento: "Crédito", valor_bruto: 140 },
            { tipo: "servico", forma_pagamento: "Assinante", comissao_barbeiro: 300 },
        ],
        pagamentos: [{ tipo: "recusado", telefone: "A", data: "2026-10-22" }, { tipo: "recusado", telefone: "A", data: "2026-10-23" }, { tipo: "cancelada", telefone: "B", data: "2026-10-10" }],
    });
    assert.deepEqual([r.receita, r.taxas, r.comissoes, r.lucro, r.novos, r.recusados, r.cancelados, r.ativos], [1133, 7, 300, 833, 1, 1, 1, 86]);
});

test("sem lápis em mês antigo: receita e lucro ficam null", () => {
    const r = calcularResumo({ mes: "2026-09", assinantes: [], lancamentosMes: [], pagamentos: [] });
    assert.equal(r.receita, null);
    assert.equal(r.lucro, null);
});

test("resumo inclui Pix manual sem taxa", () => {
    const r = calcularResumo({ mes: "2026-11", assinantes: [{ forma_cobranca: "pix_manual", status_assinatura: "ativa", valor: 160, inicio_contrato: "2023-04-24" }], lancamentosMes: [], pagamentos: [] });
    assert.equal(r.pix_manual, 160);
    assert.equal(r.receita, 160);
});
