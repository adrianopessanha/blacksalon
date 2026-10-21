const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseAgendamento } = require("./agendamento");

test("Márcia Dionízio — setembro, Unidade 1 pelo loja_email", () => {
    const r = parseAgendamento({
        telefone: "5521986207196",
        assunto: "Márcia Dionízio: nova reserva quinta-feira, 10 de setembro de 2026 18:30",
        confirmacao: "Olá Márcia! Seu horário está confirmado com Veloso na Black Salon Unidade 01.",
        loja_email: "Black Salon Barbearia - Unidade 1",
    });
    assert.equal(r.ok, true);
    assert.equal(r.id, "5521986207196_20260910_1830");
    assert.equal(r.nome, "Márcia Dionízio");
    assert.equal(r.data, "2026-09-10");
    assert.equal(r.hora, "18:30");
    assert.equal(r.barbeiro, "Veloso");
    assert.equal(r.unidade, "01");
    assert.equal(r.inicio.toISOString(), "2026-09-10T21:30:00.000Z");
});

test("Carlos Eduardo — outubro, unidade pela confirmação, ignora 'com sucesso'", () => {
    const r = parseAgendamento({
        telefone: "5521975551234",
        assunto: "Carlos Eduardo: nova reserva terça-feira, 21 de outubro de 2026 14:30",
        confirmacao: "Reserva feita com sucesso! Você será atendido com Jonatas na Unidade 02.",
        loja_email: "",
    });
    assert.equal(r.ok, true);
    assert.equal(r.data, "2026-10-21");
    assert.equal(r.hora, "14:30");
    assert.equal(r.barbeiro, "Jonatas");
    assert.equal(r.unidade, "02");
});

test("João Conceição — março com cedilha, dia/hora de 1 dígito, unidade pelo barbeiro", () => {
    const r = parseAgendamento({
        telefone: "552122334455",
        assunto: "João Conceição: nova reserva sábado, 7 de março de 2026 9:00",
        confirmacao: "Te esperamos com Wellington!",
    });
    assert.equal(r.ok, true);
    assert.equal(r.id, "552122334455_20260307_0900");
    assert.equal(r.data, "2026-03-07");
    assert.equal(r.hora, "09:00");
    assert.equal(r.barbeiro, "Wellington");
    assert.equal(r.unidade, "02");
});

test("sem barbeiro nem unidade: campos ficam null, mas grava", () => {
    const r = parseAgendamento({
        telefone: "5521986207196",
        assunto: "Ana: nova reserva sexta-feira, 2 de janeiro de 2026 10:15",
        confirmacao: "",
    });
    assert.equal(r.ok, true);
    assert.equal(r.barbeiro, null);
    assert.equal(r.unidade, null);
});

test("422: assunto sem 'nova reserva' (ex: mensagem do chatbot)", () => {
    const r = parseAgendamento({ telefone: "5521986207196", assunto: "Oi, quero marcar um horário" });
    assert.equal(r.ok, false);
    assert.match(r.erros.join(), /data\/hora/);
});

test("422: telefone fora do formato 55+DDD+número", () => {
    const r = parseAgendamento({
        telefone: "21986207196",
        assunto: "Márcia: nova reserva quinta-feira, 10 de setembro de 2026 18:30",
    });
    assert.equal(r.ok, false);
    assert.match(r.erros.join(), /telefone/);
});
