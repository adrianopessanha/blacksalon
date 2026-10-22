const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const RESERVA_MS = 15 * 60 * 1000;

const TELEFONE_RE = /^55\d{10,11}$/;
// Só atendimento conta: venda/renovação de assinatura, vale, produto e movimentos financeiros não
const TIPOS_SEM_ATENDIMENTO = ["venda_assinatura", "renovacao_celcoin", "venda_vale", "produto", "adiantamento", "fechamento_comissao"];

const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v instanceof Date ? v.getTime() : null);

// Retorna o motivo para NÃO agendar, ou null se pode agendar
function motivoParaNaoEnviar(lanc, agoraMs) {
    if (!lanc) return "sem dados";
    if (!TELEFONE_RE.test(String(lanc.cliente_telefone || ""))) return "telefone inválido";
    if (lanc.tipo && (TIPOS_SEM_ATENDIMENTO.includes(lanc.tipo) || lanc.tipo !== "servico")) return `tipo ${lanc.tipo}`;
    const dataMs = ms(lanc.data);
    // Lançamento retroativo (mais de 1 dia atrás) não dispara pesquisa
    if (dataMs != null && agoraMs - dataMs > UM_DIA_MS) return "lançamento retroativo";
    return null;
}

function pesquisaRecente(cliente, agoraMs) {
    const ultima = ms(cliente?.ultimaPesquisaEm);
    return ultima != null && agoraMs - ultima < TRINTA_DIAS_MS;
}

// Outra task do mesmo cliente está enviando agora (ex.: lançamento dividido em 2)
function reservadaPorOutro(cliente, lancamentoId, agoraMs) {
    const r = ms(cliente?.pesquisaReservadaEm);
    return r != null && agoraMs - r < RESERVA_MS && cliente.pesquisaReservadaPor !== lancamentoId;
}

function dataHoraSP(date) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function unidadeTexto(lojaId) {
    if (lojaId === "loja-01") return "loja 1";
    if (lojaId === "loja-02") return "loja 2";
    return null;
}

function montarPayload(lancamentoId, lanc) {
    const data = lanc.data?.toDate ? lanc.data.toDate() : new Date(ms(lanc.data) || Date.now());
    return {
        lancamentoId,
        telefone: lanc.cliente_telefone,
        nome: lanc.cliente_nome && lanc.cliente_nome !== "Não Informado" ? lanc.cliente_nome : null,
        barbeiro: String(lanc.barbeiro_nome || "").split(" ")[0] || null,
        servico: lanc.servico_descricao || null,
        unidade: unidadeTexto(lanc.loja_id),
        dataAtendimento: dataHoraSP(data),
    };
}

// Uma task por cliente por dia: evita 2 pesquisas quando o atendimento vira 2 lançamentos
function idTarefa(telefone, date) {
    return `pesquisa-${telefone}-${dataHoraSP(date).slice(0, 10).replace(/-/g, "")}`;
}

module.exports = { motivoParaNaoEnviar, pesquisaRecente, reservadaPorOutro, montarPayload, dataHoraSP, idTarefa, TELEFONE_RE };
