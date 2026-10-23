const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cidDe, normalizarTelefone } = require("./clienteId");

test("código: estável, não contém o telefone e muda com o segredo", () => {
    const a = cidDe("5521986207196", "segredo1");
    assert.equal(a, cidDe("5521986207196", "segredo1"));
    assert.match(a, /^c_[0-9a-f]{20}$/);
    assert.ok(!a.includes("986207196"));
    assert.notEqual(a, cidDe("5521986207196", "segredo2"));
    assert.notEqual(a, cidDe("5521986207197", "segredo1"));
    assert.throws(() => cidDe("21986207196", "s"));
});

test("normalização: aceita máscara, sem 55 e sem DDD (assume 21)", () => {
    assert.equal(normalizarTelefone("(21) 98620-7196"), "5521986207196");
    assert.equal(normalizarTelefone("5521986207196"), "5521986207196");
    assert.equal(normalizarTelefone("986207196"), "5521986207196");
    assert.equal(normalizarTelefone("123"), null);
});
