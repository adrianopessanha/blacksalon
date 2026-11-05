const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contratoAtual, espelho, contratosIniciais, vendaBalcao, contratoDoEventoCelcoin, novoContratoCelcoin, aplicarNoContrato, canceladosNoMes } = require("./contratos");
const { parsePagamento, atualizacaoAssinante } = require("./assinatura");

const T = "2026-11-05T12:00:00.000Z";
// Leonardo hoje: Celcoin cancelado em 24/10
const leonardo = { telefone: "5521964813263", nome: "Leonardo Peixoto crispim", origem: "celcoin", status_assinatura: "cancelada", data_cancelamento: "2026-10-24", data_recusa: "2026-10-23", inicio_contrato: "2026-04-14", vencimento: "2026-11-14", plano: "Cabelo e Barba", valor: 140, codigo_cliente: "207" };

// Aplica um evento da Celcoin como o webhook faz (sem a parte de data/hora, que é do decidirEvento)
function evento(contratos, corpo) {
    const lista = contratos.map((c) => ({ ...c }));
    const p = parsePagamento({ telefone: "5521964813263", valor: "140", ...corpo });
    const alvo = contratoDoEventoCelcoin(lista, { assinaturaId: p.assinaturaId, classe: p.classe, dataStr: p.dataStr });
    let k = alvo.indice;
    if (alvo.criar) { lista.push(novoContratoCelcoin({ contratos: lista, assinaturaId: p.assinaturaId, dataStr: p.dataStr, agoraISO: T })); k = lista.length - 1; }
    if (alvo.gravarNumero) lista[k].celcoin_assinatura = p.assinaturaId;
    if (k >= 0) lista[k] = aplicarNoContrato(lista[k], atualizacaoAssinante(p, {}, lista[k].status_assinatura, lista[k].plano));
    return { lista, k };
}

test("migração: o cadastro de hoje vira um contrato, e o espelho dá o mesmo status", () => {
    const c = contratosIniciais(leonardo, T);
    assert.equal(c.length, 1);
    assert.deepEqual([c[0].forma, c[0].origem, c[0].inicio, c[0].status_assinatura, c[0].fim], ["celcoin", "celcoin", "2026-04-14", "cancelada", "2026-10-24"]);
    const e = espelho(c);
    assert.equal(e.status_assinatura, "cancelada");
    assert.equal(e.data_cancelamento, "2026-10-24");
    assert.equal(e.inicio_contrato, "2026-04-14");
    // Já migrado: não mexe
    assert.equal(contratosIniciais({ ...leonardo, contratos: c }, T), c);
});

test("Leonardo: venda no balcão depois do cancelamento cria contrato novo e ativo; o cancelado fica no histórico", () => {
    const r = vendaBalcao({ contratos: contratosIniciais(leonardo, T), admin: false, plano: "Cabelo e Barba", valor: 140, hoje: "2026-10-29", agoraISO: T });
    assert.equal(r.resultado, "novo_contrato");
    assert.equal(r.contratos.length, 2);
    assert.equal(r.contratos[0].status_assinatura, "cancelada"); // não reaproveita nem apaga
    const e = espelho(r.contratos);
    assert.deepEqual([e.status_assinatura, e.forma_cobranca, e.origem, e.ciclo_desde, e.vencimento, e.data_cancelamento, e.inicio_contrato],
        ["ativa", "balcao", "balcao", "2026-10-29", "2026-11-29", null, "2026-04-14"]);
    assert.equal(canceladosNoMes([{ contratos: r.contratos }], "2026-10"), 1); // continua contando como cancelado em outubro
});

test("cancelamento da Celcoin (sem número) encerra só o contrato Celcoin, nunca o de balcão", () => {
    const balcao = vendaBalcao({ contratos: contratosIniciais({ ...leonardo, status_assinatura: "pagamento_recusado", data_cancelamento: null }, T), admin: false, plano: "Cabelo e Barba", valor: 140, hoje: "2026-10-29", agoraISO: T }).contratos;
    const { lista, k } = evento(balcao, { status: "Cancelado ao cancelar contrato", evento: "cancelada", data: "2026-10-30 10:00:00" });
    assert.equal(lista[k].forma, "celcoin");
    assert.equal(lista[k].status_assinatura, "cancelada");
    assert.equal(espelho(lista).status_assinatura, "ativa"); // o balcão (mais recente) é o que vale
});

test("número de assinatura: cancelamento do número antigo não encerra o contrato Celcoin mais novo; número novo = contrato novo", () => {
    let c = contratosIniciais(leonardo, T);
    // Assinou de novo na Celcoin (número 900): contrato novo
    ({ lista: c } = evento(c, { transacao_id: "2000", status: "Capturada na Operadora", assinatura_id: "900", data: "2026-11-02 06:40:00" }));
    assert.equal(c.length, 2);
    assert.deepEqual([c[1].celcoin_assinatura, c[1].inicio, c[1].status_assinatura], ["900", "2026-11-02", "ativa"]);
    // Chega um cancelamento atrasado do contrato antigo (número 700, migrado sem número já encerrado): não cria nem mexe no 900
    const r = evento(c, { status: "Cancelado ao cancelar contrato", evento: "cancelada", assinatura_id: "700", data: "2026-11-03 10:00:00" });
    assert.equal(r.k, -1);
    assert.equal(espelho(r.lista).status_assinatura, "ativa");
    // Cancelamento do 900: encerra o 900
    const r2 = evento(c, { status: "Cancelado ao cancelar contrato", evento: "cancelada", assinatura_id: "900", data: "2026-12-01 10:00:00" });
    assert.equal(espelho(r2.lista).status_assinatura, "cancelada");
    assert.equal(r2.lista[0].fim, "2026-10-24");
});

test("sem número: pagamento aprovado depois de um contrato Celcoin cancelado é assinatura nova", () => {
    const { lista } = evento(contratosIniciais(leonardo, T), { transacao_id: "2001", status: "Capturada na Operadora", data: "2026-11-10 06:40:00" });
    assert.equal(lista.length, 2);
    assert.equal(espelho(lista).status_assinatura, "ativa");
    assert.equal(espelho(lista).ciclo_desde, "2026-11-10");
    // Recusa de um contrato ativo continua no mesmo contrato
    const ativo = contratosIniciais({ ...leonardo, status_assinatura: "ativa", data_cancelamento: null }, T);
    const r = evento(ativo, { transacao_id: "2002", status: "Negada na Operadora", data: "2026-11-14 06:40:00" });
    assert.equal(r.lista.length, 1);
    assert.equal(r.lista[0].status_assinatura, "pagamento_recusado");
});

test("renovação no balcão: contrato novo; o anterior fica 'encerrado' (renovado) e não conta como cancelamento", () => {
    const andresa = { origem: "balcao", status_assinatura: "ativa", inicio_contrato: "2026-10-15", ciclo_desde: "2026-11-03", vencimento: "2026-12-03", plano: "2 × Corte de Cria", valor: 160 };
    const r = vendaBalcao({ contratos: contratosIniciais(andresa, T), admin: false, plano: "2 × Corte de Cria", valor: 160, hoje: "2026-12-03", agoraISO: T });
    assert.deepEqual(r.contratos.map((c) => c.status_assinatura), ["encerrado", "ativa"]);
    assert.equal(r.contratos[0].motivo_fim, "renovado");
    assert.equal(canceladosNoMes([{ contratos: r.contratos }], "2026-12"), 0);
    assert.equal(contratoAtual(r.contratos).inicio, "2026-12-03");
});

test("Celcoin ativo + venda no balcão: contrato novo vale, com aviso; Abacatepay só admin", () => {
    const ativo = contratosIniciais({ ...leonardo, status_assinatura: "ativa", data_cancelamento: null }, T);
    const r = vendaBalcao({ contratos: ativo, admin: false, plano: "Cabelo e Barba", valor: 140, hoje: "2026-11-05", agoraISO: T });
    assert.equal(r.aviso, "celcoin_ativo");
    assert.equal(espelho(r.contratos).forma_cobranca, "balcao");
    const abacate = contratosIniciais({ origem: "abacatepay", status_assinatura: "ativa", inicio_contrato: "2026-07-10" }, T);
    assert.equal(vendaBalcao({ contratos: abacate, admin: false, plano: "Corte de Cria", valor: 80, hoje: "2026-11-10", agoraISO: T }).resultado, "bloqueado");
    assert.equal(espelho(vendaBalcao({ contratos: abacate, admin: true, plano: "Corte de Cria", valor: 80, hoje: "2026-11-10", agoraISO: T }).contratos).origem, "abacatepay");
});

test("assinante novo: o primeiro evento da Celcoin abre o contrato; cancelamento sem contrato não abre nada", () => {
    assert.equal(evento([], { transacao_id: "1", status: "Capturada na Operadora", data: "2026-11-05 06:40:00" }).lista.length, 1);
    assert.equal(evento([], { status: "Cancelado ao cancelar contrato", evento: "cancelada", data: "2026-11-05 06:40:00" }).lista.length, 0);
});
