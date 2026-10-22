const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePagamento, atualizacaoCliente, atualizacaoAssinante, escolherCandidato, classificar, parseValor, parseData } = require("./assinatura");

const base = {
    transacao_id: "98765",
    telefone: "5521986207196",
    nome: "Márcia",
    valor: "R$ 100,00",
    plano: "Corte Completo",
    codigo_cliente: "123",
    email: "m@x.com",
    documento: "000.000.000-00",
    data: "21/10/2026 14:30",
};

test("cartão aprovado: ID composto telefone_transacao, valor e data", () => {
    const p = parsePagamento({ ...base, status: "Capturada na Operadora", pago_fora: "false" });
    assert.equal(p.ok, true);
    assert.equal(p.id, "5521986207196_98765");
    assert.equal(p.classe, "cartao_aprovado");
    assert.equal(p.valor, 100);
    assert.equal(p.dataStr, "2026-10-21");
    assert.equal(p.dataPagamento.toISOString(), "2026-10-21T17:30:00.000Z");
});

test("baixa manual por pago_fora=true (string de formulário)", () => {
    const p = parsePagamento({ ...base, status: "Paga fora do sistema", pago_fora: "true" });
    assert.equal(p.classe, "baixa_manual");
    assert.equal(p.pagoFora, true);
});

test("mesma transação em contas diferentes não colide (telefone diferente)", () => {
    const a = parsePagamento({ ...base, status: "x" });
    const b = parsePagamento({ ...base, telefone: "5521999990000", status: "x" });
    assert.notEqual(a.id, b.id);
});

test("classificação dos status reais da Celcoin", () => {
    assert.equal(classificar("Negada na Operadora", false), "recusado");
    assert.equal(classificar("Cancelada ao cancelar a cobrança", false), "cancelada");
    assert.equal(classificar("Estornada", false), "outro");
    assert.equal(classificar("Expirada", false), "outro");
});

test("clientes: ativa, recusado, cancelada", () => {
    const ok = atualizacaoCliente(parsePagamento({ ...base, status: "Capturada na Operadora" }));
    assert.equal(ok.assinante, true);
    assert.equal(ok.status_assinatura, "ativa");
    assert.equal(ok.plano, "Corte Completo");
    const rec = atualizacaoCliente(parsePagamento({ ...base, status: "Negada na Operadora" }));
    assert.equal(rec.status_assinatura, "pagamento_recusado");
    assert.equal(rec.assinante, undefined);
    const can = atualizacaoCliente(parsePagamento({ ...base, status: "Cancelada ao cancelar a cobrança" }));
    assert.equal(can.assinante, false);
    assert.equal(can.status_assinatura, "cancelada");
});

test("422: sem transacao_id ou telefone inválido", () => {
    assert.equal(parsePagamento({ ...base, transacao_id: "" }).ok, false);
    assert.equal(parsePagamento({ ...base, telefone: "21986207196" }).ok, false);
});

test("valores e datas em vários formatos", () => {
    assert.equal(parseValor("R$ 1.234,56"), 1234.56);
    assert.equal(parseValor("140.00"), 140);
    assert.equal(parseValor(80), 80);
    assert.equal(parseData("2026-10-21 14:30:00").toISOString(), "2026-10-21T17:30:00.000Z");
    assert.equal(parseData("2026-10-21T14:30:00Z").toISOString(), "2026-10-21T14:30:00.000Z");
    assert.equal(parseData(""), null);
});

test("escolha do lançamento: 7 dias, prefere valor igual, depois mais recente", () => {
    const agora = Date.parse("2026-10-21T12:00:00Z");
    const dia = 24 * 3600 * 1000;
    const c = [
        { id: "velho", valor: 100, dataMs: agora - 8 * dia },
        { id: "outroValor", valor: 80, dataMs: agora - 1 * dia },
        { id: "igualAntigo", valor: 100, dataMs: agora - 5 * dia },
        { id: "igualRecente", valor: 100, dataMs: agora - 2 * dia },
    ];
    assert.equal(escolherCandidato(c, 100, agora).id, "igualRecente");
    assert.equal(escolherCandidato(c, 140, agora).id, "outroValor");
    assert.equal(escolherCandidato([c[0]], 100, agora), null);
});

test("valor é sempre em reais e nunca é dividido", () => {
    assert.equal(parsePagamento({ ...base, valor: "140", status: "x" }).valor, 140);
    assert.equal(parsePagamento({ ...base, valor: "14000", status: "x" }).valor, 14000);
    assert.equal(parsePagamento({ ...base, valor: 80, valor_centavos: "8000", status: "x" }).valor, 80);
});

test("assinantes: status por tipo de evento, origem celcoin, sem CPF/e-mail", () => {
    const a = atualizacaoAssinante(parsePagamento({ ...base, status: "Capturada na Operadora" }));
    assert.equal(a.status_assinatura, "ativa");
    assert.equal(a.origem, "celcoin");
    assert.equal(a.valor, 100);
    assert.equal(a.email, undefined);
    assert.equal(a.documento, undefined);
    assert.equal(atualizacaoAssinante(parsePagamento({ ...base, status: "Estornada" })).status_assinatura, "inativa");
    assert.equal(atualizacaoAssinante(parsePagamento({ ...base, status: "Negada na Operadora" })).status_assinatura, "pagamento_recusado");
});
