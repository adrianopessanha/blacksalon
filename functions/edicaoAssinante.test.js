const { test } = require("node:test");
const assert = require("node:assert/strict");
const { edicaoAssinante, entradasHistorico, proximoIdDependente, novoDependente, idPagamentoMovido } = require("./edicaoAssinante");
const { cidDe, cidDeAssinante, DEP_RE, ID_ASSINANTE_RE } = require("./clienteId");

const andreia = { nome: "Andreia de Jesus", plano: "Corte de Cria", origem: "balcao", status_assinatura: "ativa", valor: 80, inicio_contrato: "2026-10-15", ciclo_desde: "2026-11-03", vencimento: "2026-12-03" };

test("edição: só o que mudou vira histórico (campo, antes, depois)", () => {
    const r = edicaoAssinante(andreia, { nome: " Andresa de Jesus ", plano: "2 × Corte de Cria", valor: "160", status_assinatura: "ativa", forma_cobranca: "balcao" }, "5521964598462");
    assert.deepEqual(r.erros, []);
    assert.deepEqual(r.upd, { nome: "Andresa de Jesus", plano: "2 × Corte de Cria", valor: 160 });
    assert.deepEqual(r.mudancas.map((m) => [m.campo, m.antes, m.depois]), [
        ["nome", "Andreia de Jesus", "Andresa de Jesus"],
        ["plano", "Corte de Cria", "2 × Corte de Cria"],
        ["valor", 80, 160],
    ]);
    const h = entradasHistorico(r.mudancas, "admin@x.com", "2026-11-03T20:00:00.000Z");
    assert.deepEqual(h[0], { em: "2026-11-03T20:00:00.000Z", por: "admin@x.com", campo: "nome", antes: "Andreia de Jesus", depois: "Andresa de Jesus" });
});

test("edição: valida campos; balcão recalcula o vencimento quando muda o início do ciclo", () => {
    const r = edicaoAssinante(andreia, { nome: "  ", valor: "abc", forma_cobranca: "boleto", ciclo_desde: "03/11/2026", telefone: "21999990000" }, "5521964598462");
    assert.equal(r.erros.length, 5);
    const c = edicaoAssinante(andreia, { ciclo_desde: "2026-11-05" }, "5521964598462");
    assert.deepEqual(c.upd, { ciclo_desde: "2026-11-05", vencimento: "2026-12-05" });
    // Celcoin não tem vencimento de balcão
    assert.deepEqual(edicaoAssinante({ ...andreia, origem: "celcoin" }, { ciclo_desde: "2026-11-05" }, "5521964598462").upd, { ciclo_desde: "2026-11-05" });
    assert.deepEqual(edicaoAssinante(andreia, { observacao: "Paga o filho também", pagador: "" }, "5521964598462").upd, { observacao: "Paga o filho também" });
});

test("pagador: não pode ser ele mesmo; dependente sem telefone tem pagador fixo", () => {
    assert.match(edicaoAssinante(andreia, { pagador: "5521964598462" }, "5521964598462").erros[0], /dele mesmo/);
    const dep = { nome: "Filho", pagador: "5521964598462" };
    assert.match(edicaoAssinante(dep, { pagador: "5521985844773" }, "5521964598462-dep1").erros[0], /fixo/);
    assert.match(edicaoAssinante(dep, { pagador: "" }, "5521964598462-dep1").erros[0], /fixo/);
    assert.deepEqual(edicaoAssinante(dep, { nome: "Filho Novo" }, "5521964598462-dep1").erros, []);
});

test("dependente: ID {pagador}-depN, código próprio (não é o do pagador), segue o pagador", () => {
    assert.equal(proximoIdDependente("5521964598462", []), "5521964598462-dep1");
    assert.equal(proximoIdDependente("5521964598462", ["5521964598462-dep1", "5521964598462-dep3", "5521985844773-dep7", "5521984120099"]), "5521964598462-dep4");
    assert.ok(DEP_RE.test("5521964598462-dep1") && ID_ASSINANTE_RE.test("5521964598462") && !ID_ASSINANTE_RE.test("abc-dep1"));
    const s = "segredo-teste";
    assert.equal(cidDeAssinante("5521964598462", s), cidDe("5521964598462", s)); // pagador: mesmo código de sempre
    assert.notEqual(cidDeAssinante("5521964598462-dep1", s), cidDe("5521964598462", s));
    assert.match(cidDeAssinante("5521964598462-dep1", s), /^c_[0-9a-f]{20}$/);
    const d = novoDependente({ pagador: "5521964598462", pagadorDados: andreia, nome: "Filho", plano: "Corte de Cria", hoje: "2026-11-03" });
    assert.deepEqual(d, { nome: "Filho", plano: "Corte de Cria", pagador: "5521964598462", telefone_contato: "5521964598462", dependente_sem_telefone: true, origem: "balcao", forma_cobranca: "balcao", inicio_contrato: "2026-11-03", valor: null, status_assinatura: null });
    assert.equal(d.telefone, undefined); // sem telefone próprio
});

test("troca de telefone: pagamento muda de ID só quando o ID começa pelo código antigo", () => {
    assert.equal(idPagamentoMovido("c_aaa_52", "c_aaa", "c_bbb"), "c_bbb_52");
    assert.equal(idPagamentoMovido("c_aaa_recusado_20261031", "c_aaa", "c_bbb"), "c_bbb_recusado_20261031");
    assert.equal(idPagamentoMovido("c_aaab_52", "c_aaa", "c_bbb"), null);
});
