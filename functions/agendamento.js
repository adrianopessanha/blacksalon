const MESES = {
    janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const BARBEIRO_UNIDADE = {
    leandro: "01", veloso: "01",
    wellington: "02", jonatas: "02", adriano: "02",
};

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const pad = (n) => String(n).padStart(2, "0");

function extrairNome(assunto) {
    const i = String(assunto || "").indexOf(":");
    if (i <= 0) return null;
    return assunto.slice(0, i).trim() || null;
}

// Horário do e-mail já é de São Paulo; só monta as strings.
function extrairDataHora(assunto) {
    const txt = semAcento(assunto).toLowerCase();
    const i = txt.indexOf("nova reserva");
    if (i < 0) return null;
    const m = txt.slice(i).match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\D+?(\d{1,2})[:h](\d{2})/);
    if (!m) return null;
    const [, dia, mesNome, ano, hh, mm] = m;
    const mes = MESES[mesNome];
    if (!mes || +dia < 1 || +dia > 31 || +hh > 23 || +mm > 59) return null;
    return { data: `${ano}-${pad(mes)}-${pad(dia)}`, hora: `${pad(hh)}:${mm}` };
}

// Primeira palavra depois de " com "; se houver várias ocorrências,
// prefere a que for um barbeiro conhecido ("com sucesso ... com Veloso").
function extrairBarbeiro(confirmacao) {
    const re = /\scom\s+([A-Za-zÀ-ÿ]+)/gi;
    const achados = [...String(confirmacao || "").matchAll(re)].map((m) => m[1]);
    if (!achados.length) return null;
    const conhecido = achados.find((w) => BARBEIRO_UNIDADE[semAcento(w).toLowerCase()]);
    const nome = conhecido || achados[0];
    return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
}

function unidadeDoTexto(txt) {
    const m = semAcento(txt).match(/unidade\s*0?([12])\b/i);
    return m ? "0" + m[1] : null;
}

function extrairUnidade(lojaEmail, confirmacao, barbeiro) {
    return unidadeDoTexto(lojaEmail)
        || unidadeDoTexto(confirmacao)
        || BARBEIRO_UNIDADE[semAcento(barbeiro).toLowerCase()]
        || null;
}

function parseAgendamento(body) {
    const b = body || {};
    const telefone = String(b.telefone || "").replace(/\D/g, "");
    const erros = [];
    if (!/^55\d{10,11}$/.test(telefone)) erros.push("telefone ausente ou fora do formato 55+DDD+número");
    const dh = extrairDataHora(b.assunto);
    if (!dh) erros.push('data/hora não encontradas depois de "nova reserva" no assunto');
    if (erros.length) return { ok: false, erros };

    const barbeiro = extrairBarbeiro(b.confirmacao);
    return {
        ok: true,
        // ID final: {código do cliente}_{sufixo}
        sufixo: `${dh.data.replace(/-/g, "")}_${dh.hora.replace(":", "")}`,
        telefone,
        nome: extrairNome(b.assunto),
        data: dh.data,
        hora: dh.hora,
        barbeiro,
        unidade: extrairUnidade(b.loja_email, b.confirmacao, barbeiro),
        // Brasil sem horário de verão desde 2019: offset fixo -03:00
        inicio: new Date(`${dh.data}T${dh.hora}:00-03:00`),
    };
}

module.exports = { parseAgendamento };
