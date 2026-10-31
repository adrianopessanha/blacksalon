const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePagamento, atualizacaoCliente, atualizacaoAssinante, escolherCandidato, classificar, parseValor, parseData, decidirEvento, semStatus, planoPeloValor } = require("./assinatura");

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

test("cartão aprovado: sufixo do ID = transação, valor e data", () => {
    const p = parsePagamento({ ...base, status: "Capturada na Operadora", pago_fora: "false" });
    assert.equal(p.ok, true);
    assert.equal(p.sufixo, "98765");
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

test("sem transação: sufixo por tipo e dia", () => {
    const p = parsePagamento({ telefone: "5521986207196", status: "canceled", data: "2026-11-03 10:00:00" });
    assert.equal(p.sufixo, "cancelada_20261103");
});

test("classificação dos status reais da Celcoin", () => {
    assert.equal(classificar("Negada na Operadora", false), "recusado");
    assert.equal(classificar("Cancelada ao cancelar a cobrança", false), "cobranca_cancelada");
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
    const can = atualizacaoCliente(parsePagamento({ ...base, status: "Cancelado ao cancelar contrato" }));
    assert.equal(can.assinante, false);
    assert.equal(can.status_assinatura, "cancelada");
});

test("422: sem transacao_id ou telefone inválido", () => {
    assert.equal(parsePagamento({ ...base, transacao_id: "", status: "" }).ok, false);
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

test("evento sem transação: cancelamento e assinatura nova, com data; reenvio no mesmo dia tem o mesmo id", () => {
    const c = parsePagamento({ telefone: "5521986207196", status: "canceled", data: "2026-11-03 10:00:00" });
    assert.equal(c.ok, true);
    assert.equal(c.classe, "cancelada");
    assert.equal(c.sufixo, "cancelada_20261103");
    const a = atualizacaoAssinante(c);
    assert.equal(a.status_assinatura, "cancelada");
    assert.equal(a.data_cancelamento, "2026-11-03");
    const n = parsePagamento({ telefone: "5521986207196", evento: "nova", nome: "Novo", data: "2026-11-04" });
    assert.equal(n.classe, "nova");
    assert.equal(atualizacaoAssinante(n).status_assinatura, "aguardando_pagamento");
    assert.equal(atualizacaoAssinante(n).data_adesao, "2026-11-04");
});

test("planMyId: usa a tabela código → plano; sem tabela, mantém o nome que veio e guarda o código", () => {
    const p = parsePagamento({ ...base, status: "Capturada na Operadora", planMyId: "PLN-140", plano: "plano cabelo e barba ilimitado" });
    assert.equal(p.planoId, "PLN-140");
    assert.equal(atualizacaoAssinante(p, { "PLN-140": "Cabelo e Barba" }).plano, "Cabelo e Barba");
    const sem = atualizacaoAssinante(p, {});
    assert.equal(sem.plano, "plano cabelo e barba ilimitado");
    assert.equal(sem.plano_id, "PLN-140");
});
test("contrato x cobrança: só o contrato cancelado cancela o assinante; status em inglês", () => {
    const contrato = parsePagamento({ ...base, status: "Cancelado ao cancelar contrato", data: "2026-11-05" });
    assert.equal(contrato.classe, "cancelada");
    assert.equal(atualizacaoAssinante(contrato).status_assinatura, "cancelada");
    assert.equal(atualizacaoAssinante(contrato).data_cancelamento, "2026-11-05");
    const cobranca = parsePagamento({ ...base, status: "Cancelada ao cancelar a cobrança", data: "2026-11-05" });
    assert.equal(cobranca.classe, "cobranca_cancelada");
    assert.equal(atualizacaoAssinante(cobranca).status_assinatura, undefined);
    assert.equal(atualizacaoAssinante(cobranca).data_cobranca_cancelada, "2026-11-05");
    const en = parsePagamento({ telefone: "5521986207196", status: "canceled", data: "2026-11-06" });
    assert.equal(en.classe, "cancelada");
    assert.equal(en.sufixo, "cancelada_20261106");
});

test("waitingPayment/active não rebaixam assinante que já está ativo; novo fica aguardando", () => {
    const w = parsePagamento({ telefone: "5521986207196", status: "waitingPayment" });
    assert.equal(w.classe, "nova");
    assert.equal(atualizacaoAssinante(w, {}, "ativa").status_assinatura, undefined);
    assert.equal(atualizacaoAssinante(w, {}, null).status_assinatura, "aguardando_pagamento");
    const a = parsePagamento({ telefone: "5521986207196", status: "active" });
    assert.equal(a.classe, "contrato_ativo");
    assert.equal(atualizacaoAssinante(a, {}, "pagamento_recusado").status_assinatura, undefined);
    assert.equal(atualizacaoAssinante(a, {}, "cancelada").status_assinatura, "aguardando_pagamento");
    assert.equal(parsePagamento({ telefone: "5521986207196", status: "overdue" }).classe, "evento");
});

// Simula o handler: grava cobrança e assinante só pelo que decidirEvento manda
function simular(eventos) {
    const cobrancas = {};
    let ass = { status_assinatura: null, statusMs: null, aprovadoMs: null, aprovadoTx: null, plano: null };
    for (const corpo of eventos) {
        const p = parsePagamento({ telefone: "5521987735062", valor: "80", ...corpo });
        const dataMs = p.dataPagamento.getTime();
        const c = cobrancas[p.sufixo] || null;
        const d = decidirEvento(p, dataMs, c, ass);
        if (d.duplicado) continue;
        cobrancas[p.sufixo] = {
            historico: [...(c?.historico || []), { status: p.status, dataMs }],
            dataMs: d.atualizaCobranca ? dataMs : c.dataMs,
            status: d.atualizaCobranca ? p.status : c.status,
        };
        const upd = atualizacaoAssinante(p, {}, ass.status_assinatura, ass.plano);
        Object.assign(ass, d.mudaAssinante ? upd : semStatus(upd));
        if (d.mudaAssinante && upd.status_assinatura) ass.statusMs = dataMs;
        if (d.novoAprovado) Object.assign(ass, { aprovadoMs: dataMs, aprovadoTx: p.transacaoId });
    }
    return { ass, cobrancas };
}
const recusa52 = { transacao_id: "52", status: "Negada na Operadora", data: "2026-10-31 12:09:45" };
const aprova52 = { transacao_id: "52", status: "Capturada na Operadora", data: "2026-10-31 12:12:30" };

test("Marco Aurélio: recusa e aprovação na MESMA cobrança → ativo (antes a aprovação era descartada como repetida)", () => {
    const { ass, cobrancas } = simular([recusa52, aprova52, aprova52]);
    assert.equal(ass.status_assinatura, "ativa");
    assert.equal(cobrancas["52"].status, "Capturada na Operadora");
    assert.equal(cobrancas["52"].historico.length, 2); // reenvio idêntico não duplica
});

test("aprovação chegando ANTES da recusa (fora de ordem) → continua ativo, cobrança fica capturada", () => {
    const { ass, cobrancas } = simular([aprova52, recusa52]);
    assert.equal(ass.status_assinatura, "ativa");
    assert.equal(cobrancas["52"].status, "Capturada na Operadora");
    assert.deepEqual(cobrancas["52"].historico.map((h) => h.status), ["Capturada na Operadora", "Negada na Operadora"]);
});

test("recusa só vale se for mais recente que o último aprovado", () => {
    const antes = simular([aprova52, { transacao_id: "60", status: "Negada na Operadora", data: "2026-10-31 12:00:00" }]);
    assert.equal(antes.ass.status_assinatura, "ativa");
    const depois = simular([aprova52, { transacao_id: "61", status: "Negada na Operadora", data: "2026-11-30 06:40:00" }]);
    assert.equal(depois.ass.status_assinatura, "pagamento_recusado");
});

test("cobrança antiga recusada virando cancelada não derruba aprovado mais novo; contrato cancelado depois vale", () => {
    const velha = { transacao_id: "40", status: "Negada na Operadora", data: "2026-10-01 06:40:00" };
    const r = simular([velha, aprova52,
        { transacao_id: "40", status: "Cancelado ao cancelar contrato", data: "2026-10-31 13:00:00" },
        { transacao_id: "40", status: "Estornada", data: "2026-10-31 13:05:00" }]);
    assert.equal(r.ass.status_assinatura, "ativa");
    // Cancelamento do contrato (evento sem cobrança) depois do aprovado continua valendo
    const c = simular([aprova52, { status: "canceled", evento: "cancelada", data: "2026-11-05 10:00:00" }]);
    assert.equal(c.ass.status_assinatura, "cancelada");
    // Estorno da PRÓPRIA cobrança aprovada, depois dela, vale
    const e = simular([aprova52, { transacao_id: "52", status: "Estornada", data: "2026-11-01 10:00:00" }]);
    assert.equal(e.ass.status_assinatura, "inativa");
});

test("evento atrasado (status mais velho que o atual) só entra no histórico", () => {
    const r = simular([
        { status: "canceled", evento: "cancelada", data: "2026-11-05 10:00:00" },
        { transacao_id: "70", status: "Capturada na Operadora", data: "2026-11-01 06:40:00" },
    ]);
    assert.equal(r.ass.status_assinatura, "cancelada");
    assert.equal(r.ass.aprovadoTx, "70"); // o pagamento continua registrado
});

test("plano pelo valor: só para quem está sem plano e só com cobrança do cartão", () => {
    assert.equal(planoPeloValor(140), "Cabelo e Barba");
    assert.equal(planoPeloValor(100), "Corte Ilimitado");
    assert.equal(planoPeloValor(80), "Corte de Cria");
    assert.equal(planoPeloValor(160), null);
    const cartao = parsePagamento({ ...recusa52, telefone: "5521987735062", valor: "80" });
    assert.equal(atualizacaoAssinante(cartao, {}, null, null).plano, "Corte de Cria");
    assert.equal(atualizacaoAssinante(cartao, {}, null, "Barba Ilimitada").plano, undefined);
    assert.equal(atualizacaoAssinante(cartao, {}, null, "2 × Corte de Cria").plano, undefined);
    const manual = parsePagamento({ telefone: "5521987735062", transacao_id: "9", status: "Paga fora do sistema", valor: "40" });
    assert.equal(atualizacaoAssinante(manual, {}, null, null).plano, undefined);
});
