// Código opaco do cliente: substitui o telefone nos dados que os barbeiros leem.
// HMAC com segredo (CLIENTE_ID_SECRET): não dá para voltar do código para o telefone.
const { createHmac } = require("crypto");

const TELEFONE_RE = /^55\d{10,11}$/;
const CID_RE = /^c_[0-9a-f]{20}$/;

function normalizarTelefone(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if ((d.length === 13 || d.length === 12) && d.startsWith("55")) d = d.slice(2);
    if ((d.length === 12 || d.length === 11) && d.startsWith("0")) d = d.slice(1);
    if (d.length === 9 || d.length === 8) d = "21" + d;
    return d.length === 10 || d.length === 11 ? "55" + d : null;
}

function cidDe(tel55, segredo) {
    if (!TELEFONE_RE.test(String(tel55 || ""))) throw new Error("telefone inválido para gerar código");
    if (!segredo) throw new Error("segredo ausente");
    return "c_" + createHmac("sha256", segredo).update(String(tel55)).digest("hex").slice(0, 20);
}

module.exports = { cidDe, normalizarTelefone, TELEFONE_RE, CID_RE };
