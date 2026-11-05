const { test } = require("node:test");
const assert = require("node:assert/strict");
const { vencimentoDe } = require("./balcao");

test("vencimento: mesmo dia do mês seguinte", () => {
    assert.equal(vencimentoDe("2026-10-23"), "2026-11-23");
    assert.equal(vencimentoDe("2026-12-10"), "2027-01-10");
    assert.equal(vencimentoDe("2027-01-31"), "2027-03-03");
});

