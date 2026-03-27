/**
 * Gerador de Relatório Mensal RAW JSON - Black Salon
 * 
 * Este script gera um relatório mensal contendo TODOS os dados brutos,
 * sem análises, sem totais financeiros, sem DRE e sem interpretações.
 * 
 * Uso: node generate_monthly_report.cjs [YYYY-MM]
 * Exemplo: node generate_monthly_report.cjs 2026-01
 * 
 * Se nenhum mês for especificado, usa o mês atual.
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, Timestamp } = require('firebase/firestore');
const { writeFileSync } = require('fs');

// Firebase Config (mesmo do projeto)
const firebaseConfig = {
    apiKey: "AIzaSyBtINyPi1K6Fo3r1XrgdzK4j7wpiJ77i1c",
    authDomain: "novo-gestao-comissao.firebaseapp.com",
    projectId: "novo-gestao-comissao",
    storageBucket: "novo-gestao-comissao.firebasestorage.app",
    messagingSenderId: "709910243784",
    appId: "1:709910243784:web:8cf5ea27419391e85cb8fd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Mapeamento de formas de pagamento para valores permitidos
const PAYMENT_METHOD_MAP = {
    'Dinheiro': 'dinheiro',
    'dinheiro': 'dinheiro',
    'Pix': 'pix',
    'pix': 'pix',
    'PIX': 'pix',
    'Crédito': 'credito',
    'Credito': 'credito',
    'crédito': 'credito',
    'credito': 'credito',
    'Débito': 'debito',
    'Debito': 'debito',
    'débito': 'debito',
    'debito': 'debito',
    'Assinante': 'assinante',
    'assinante': 'assinante',
    'Vale Presente': 'vale_presente',
    'vale presente': 'vale_presente',
    'vale_presente': 'vale_presente'
};

// Mapeamento de tipos de evento
const EVENT_TYPE_MAP = {
    'servico': 'servico',
    'Servico': 'servico',
    'serviço': 'servico',
    'produto': 'produto',
    'Produto': 'produto',
    'venda_assinatura': 'venda_assinatura',
    'uso_assinatura': 'uso_assinatura',
    'venda_vale': 'venda_vale',
    'uso_vale': 'uso_vale',
    'adiantamento': 'adiantamento',
    'fechamento_comissao': 'fechamento_comissao',
    'fechamento': 'fechamento_comissao'
};

// Mapeamento de lojas
const STORE_MAP = {
    'loja-01': 'loja01',
    'loja01': 'loja01',
    'loja-02': 'loja02',
    'loja02': 'loja02'
};

// Barbeiros (para fallback de loja)
const BARBERS = {
    'adriano': { name: 'Adriano Pessanha', store: 'loja02' },
    'wellington': { name: 'Wellington da Silva', store: 'loja02' },
    'jonatas': { name: 'Jonatas Ribeiro', store: 'loja02' },
    'rodrigo': { name: 'Rodrigo Azevedo', store: 'loja01' },
    'veloso': { name: 'Veloso Martins', store: 'loja01' },
    'estevao': { name: 'Estevao Silva', store: 'loja01' }
};

/**
 * Normaliza o payment_method para os valores permitidos
 */
function normalizePaymentMethod(raw) {
    if (!raw) return null;
    const normalized = PAYMENT_METHOD_MAP[raw] || PAYMENT_METHOD_MAP[raw.toLowerCase()];
    return normalized || raw.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Normaliza o event_type para os valores permitidos
 */
function normalizeEventType(raw) {
    if (!raw) return 'servico'; // Default
    const normalized = EVENT_TYPE_MAP[raw] || EVENT_TYPE_MAP[raw.toLowerCase()];
    return normalized || raw.toLowerCase();
}

/**
 * Normaliza store_id para loja01 ou loja02
 */
function normalizeStoreId(raw, barberId) {
    if (raw) {
        const normalized = STORE_MAP[raw] || STORE_MAP[raw.toLowerCase()];
        if (normalized) return normalized;
    }
    // Fallback: buscar pela lookup do barbeiro
    if (barberId && BARBERS[barberId]) {
        return BARBERS[barberId].store;
    }
    return 'unknown';
}

/**
 * Converte Firestore Timestamp para data ISO string (YYYY-MM-DD)
 */
function timestampToDateString(ts) {
    if (!ts) return null;
    if (ts.seconds) {
        return new Date(ts.seconds * 1000).toISOString().split('T')[0];
    }
    if (ts.toDate) {
        return ts.toDate().toISOString().split('T')[0];
    }
    return null;
}

/**
 * Determina cash_date e is_cash_received baseado na forma de pagamento
 * - Dinheiro, Pix, Débito: recebido na hora (cash_date = event_date)
 * - Crédito: geralmente D+30, mas simplificamos para null
 * - Assinante, Vale Presente: não tem cash_date (uso de crédito)
 */
function getCashInfo(eventDate, paymentMethod) {
    const instantPayments = ['dinheiro', 'pix', 'debito'];
    const noValuePayments = ['assinante', 'vale_presente'];

    if (instantPayments.includes(paymentMethod)) {
        return { cash_date: eventDate, is_cash_received: true };
    }
    if (paymentMethod === 'credito') {
        // Crédito: marcamos como não recebido ainda (D+30)
        return { cash_date: null, is_cash_received: false };
    }
    if (noValuePayments.includes(paymentMethod)) {
        return { cash_date: null, is_cash_received: false };
    }
    // Default
    return { cash_date: eventDate, is_cash_received: true };
}

/**
 * Calcula os valores financeiros a partir dos dados brutos
 */
function calculateFinancials(valorBruto, paymentMethod, eventType, comissaoBarbeiro) {
    const gross = parseFloat(valorBruto) || 0;
    const commission = parseFloat(comissaoBarbeiro) || 0;

    // Taxa de cartão
    let feeRate = 0;
    if (paymentMethod === 'credito') feeRate = 0.05;
    if (paymentMethod === 'debito') feeRate = 0.02;

    const fee = gross * feeRate;
    const netCompany = gross - commission - fee;

    return {
        gross_value: gross,
        commission_value: commission,
        fee_value: parseFloat(fee.toFixed(2)),
        net_company_value: parseFloat(netCompany.toFixed(2))
    };
}

/**
 * Extrai campos condicionais de assinatura
 */
function getSubscriptionFields(doc, eventType, paymentMethod) {
    // Se for pagamento como assinante = uso de assinatura
    if (paymentMethod === 'assinante') {
        return {
            subscription_id: doc.subscription_id || doc.assinatura_id || null,
            subscription_type: doc.subscription_type || doc.tipo_assinatura || null,
            subscription_event: 'usage',
            subscription_reference_month: doc.subscription_reference_month || doc.mes_referencia || null
        };
    }

    // Se for venda de assinatura
    if (eventType === 'venda_assinatura') {
        return {
            subscription_id: doc.subscription_id || doc.assinatura_id || null,
            subscription_type: doc.subscription_type || doc.tipo_assinatura || null,
            subscription_event: 'sale',
            subscription_reference_month: doc.subscription_reference_month || doc.mes_referencia || null
        };
    }

    return null;
}

/**
 * Extrai campos condicionais de vale/pacote
 */
function getVoucherFields(doc, eventType, paymentMethod) {
    // Se for pagamento com vale presente = uso de vale
    if (paymentMethod === 'vale_presente') {
        return {
            voucher_id: doc.voucher_id || doc.vale_id || null,
            voucher_event: 'usage'
        };
    }

    // Se for venda de vale
    if (eventType === 'venda_vale') {
        return {
            voucher_id: doc.voucher_id || doc.vale_id || null,
            voucher_event: 'sale'
        };
    }

    return null;
}

/**
 * Transforma um documento Firestore no formato do relatório
 */
function transformDocument(docId, doc) {
    const eventType = normalizeEventType(doc.tipo);
    const paymentMethod = normalizePaymentMethod(doc.forma_pagamento);
    const eventDate = timestampToDateString(doc.data);
    const storeId = normalizeStoreId(doc.loja_id, doc.barbeiro_id);

    const cashInfo = getCashInfo(eventDate, paymentMethod);
    const financials = calculateFinancials(
        doc.valor_bruto,
        paymentMethod,
        eventType,
        doc.comissao_barbeiro
    );

    // Base event object
    const event = {
        event_id: docId,
        event_date: eventDate,
        cash_date: cashInfo.cash_date,
        is_cash_received: cashInfo.is_cash_received,
        store_id: storeId,
        barber_id: doc.barbeiro_id || null,
        barber_name: doc.barbeiro_nome || null,
        event_type: eventType,
        service_name: doc.servico_descricao || doc.cliente_nome || null,
        payment_method: paymentMethod,
        gross_value: financials.gross_value,
        commission_value: financials.commission_value,
        fee_value: financials.fee_value,
        net_company_value: financials.net_company_value
    };

    // Campos condicionais de assinatura
    const subscriptionFields = getSubscriptionFields(doc, eventType, paymentMethod);
    if (subscriptionFields) {
        Object.assign(event, subscriptionFields);
    }

    // Campos condicionais de vale/pacote
    const voucherFields = getVoucherFields(doc, eventType, paymentMethod);
    if (voucherFields) {
        Object.assign(event, voucherFields);
    }

    return event;
}

/**
 * Obtém o período do mês especificado
 */
function getMonthPeriod(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59); // Último dia do mês

    return {
        start: startDate,
        end: endDate,
        startStr: startDate.toISOString().split('T')[0],
        endStr: endDate.toISOString().split('T')[0]
    };
}

/**
 * Função principal - gera o relatório
 */
async function generateReport(yearMonth) {
    console.log(`\n🔄 Gerando relatório para: ${yearMonth}\n`);

    const period = getMonthPeriod(yearMonth);
    console.log(`📅 Período: ${period.startStr} até ${period.endStr}`);

    try {
        // Query Firestore
        const q = query(
            collection(db, 'lancamentos'),
            where('data', '>=', Timestamp.fromDate(period.start)),
            where('data', '<=', Timestamp.fromDate(period.end))
        );

        console.log('🔍 Buscando dados no Firestore...');
        const snapshot = await getDocs(q);
        console.log(`📊 ${snapshot.size} documentos encontrados`);

        // Transformar documentos
        const data = [];
        snapshot.docs.forEach(docSnap => {
            const event = transformDocument(docSnap.id, docSnap.data());
            data.push(event);
        });

        // Ordenar por data do evento
        data.sort((a, b) => {
            if (!a.event_date) return 1;
            if (!b.event_date) return -1;
            return a.event_date.localeCompare(b.event_date);
        });

        // Montar relatório final
        const report = {
            metadata: {
                generated_at: new Date().toISOString(),
                period_start: period.startStr,
                period_end: period.endStr
            },
            data: data
        };

        // Salvar arquivo
        const filename = `relatorio_mensal_${yearMonth}.json`;
        writeFileSync(filename, JSON.stringify(report, null, 2), 'utf8');

        console.log(`\n✅ Relatório gerado com sucesso!`);
        console.log(`📁 Arquivo: ${filename}`);
        console.log(`📈 Total de eventos: ${data.length}`);

        // Resumo por tipo de evento (apenas contagem, sem valores)
        const eventTypeCounts = {};
        data.forEach(e => {
            eventTypeCounts[e.event_type] = (eventTypeCounts[e.event_type] || 0) + 1;
        });
        console.log('\n📊 Contagem por tipo de evento:');
        Object.entries(eventTypeCounts).forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });

        return report;

    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        throw error;
    }
}

// Executar
const args = process.argv.slice(2);
let targetMonth;

if (args[0]) {
    // Validar formato YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(args[0])) {
        console.error('❌ Formato inválido. Use: YYYY-MM (ex: 2026-01)');
        process.exit(1);
    }
    targetMonth = args[0];
} else {
    // Usar mês atual
    const now = new Date();
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

generateReport(targetMonth)
    .then(() => {
        console.log('\n🎉 Processo concluído!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro fatal:', err);
        process.exit(1);
    });
