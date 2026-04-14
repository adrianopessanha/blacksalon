const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// ==========================================
// WEBHOOK SECRET — deve bater com o enviado pelo site de vale presente
// ==========================================
const WEBHOOK_SECRET = "753951";

// ==========================================
// BARBEIRO PADRÃO para vendas do site (Adriano - admin)
// ==========================================
const DEFAULT_BARBER = {
    id: "adriano",
    name: "Adriano Pessanha",
    store: "loja-02",
};

// ==========================================
// WEBHOOK: Receber vendas de Vale Presente do site
// POST /webhookValePresente
// ==========================================
exports.webhookValePresente = onRequest(
    {
        cors: true,
        region: "southamerica-east1",
        maxInstances: 10,
        invoker: "public",
    },
    async (req, res) => {
        // Apenas POST
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            const payload = req.body;

            // 1. Validar webhook secret
            if (payload.webhookSecret !== WEBHOOK_SECRET) {
                console.error("Webhook secret inválido:", payload.webhookSecret);
                return res.status(401).json({ error: "Unauthorized - invalid webhook secret" });
            }

            // 2. Verificar se é evento billing.paid
            if (payload.event !== "billing.paid") {
                console.log("Evento ignorado:", payload.event);
                return res.status(200).json({ message: "Evento ignorado", event: payload.event });
            }

            // 3. Extrair dados do payload
            const billing = payload.data?.billing || payload.billing || {};
            const customer = payload.data?.billing?.customer || billing.customer || {};
            const metadata = customer.metadata || {};
            const payment = payload.data?.payment || payload.payment || {};
            const products = payload.data?.billing?.products || billing.products || [];

            const amountCents = billing.amount || payment.amount || 0;
            const amountBRL = amountCents / 100;

            const clientName = metadata.name || customer.name || "Cliente Site";
            const clientPhone = metadata.cellphone || metadata.phone || customer.cellphone || "";
            const clientEmail = metadata.email || customer.email || "";
            const clientTaxId = metadata.taxId || "";

            const paymentMethod = payment.method || "PIX";
            const formaPagamento = paymentMethod === "CARD" ? "Crédito" : "Pix";

            const productExternalId = products.length > 0 ? products[0].externalId : null;
            const billingId = billing.id || payload.id || "";

            const isDevMode = payload.devMode === true || payload.devMode === "true";

            console.log("=== Webhook Vale Presente Recebido ===");
            console.log("Cliente:", clientName);
            console.log("Telefone:", clientPhone);
            console.log("Valor (centavos):", amountCents);
            console.log("Valor (R$):", amountBRL);
            console.log("Pagamento:", formaPagamento);
            console.log("DevMode:", isDevMode);
            console.log("Billing ID:", billingId);

            // 4. Idempotência
            if (billingId) {
                const existingQuery = await db
                    .collection("lancamentos")
                    .where("webhook_billing_id", "==", billingId)
                    .limit(1)
                    .get();

                if (!existingQuery.empty) {
                    console.log("Billing já processado:", billingId);
                    return res.status(200).json({
                        message: "Billing já processado anteriormente",
                        billingId,
                    });
                }
            }

            // 5. Calcular valor por uso (4 créditos por pacote)
            const valorPorUso = parseFloat((amountBRL / 4).toFixed(2));

            // 6. Registrar/atualizar cliente em clientes_vale
            const clientKey = clientName.toLowerCase().trim();
            const clientRef = db.collection("clientes_vale").doc(clientKey);

            await clientRef.set(
                {
                    nome: clientName.trim(),
                    telefone: clientPhone.trim(),
                    email: clientEmail.trim(),
                    cpf: clientTaxId,
                    valor_por_uso: valorPorUso,
                    valor_total: amountBRL,
                    origem: "site_vale_presente",
                    updated_at: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            // 7. Registrar lançamento de venda de vale
            const now = new Date();
            const lancamento = {
                data: Timestamp.fromDate(now),
                barbeiro_id: DEFAULT_BARBER.id,
                barbeiro_nome: DEFAULT_BARBER.name,
                loja_id: DEFAULT_BARBER.store,
                cliente_nome: clientName.trim(),
                cliente_telefone: clientPhone.trim(),
                servico_descricao: "Compra de pacote",
                valor_bruto: amountBRL,
                forma_pagamento: formaPagamento,
                comissao_barbeiro: 0,
                tipo: "venda_vale",
                subscriber_code: null,
                created_at: FieldValue.serverTimestamp(),
                webhook_billing_id: billingId,
                webhook_origem: "site_vale_presente",
                webhook_dev_mode: isDevMode,
                webhook_product_id: productExternalId,
                webhook_payment_method: paymentMethod,
                webhook_email: clientEmail,
            };

            const docRef = await db.collection("lancamentos").add(lancamento);
            console.log("Lançamento criado com ID:", docRef.id);

            // 8. Notificar webhook Make.com
            try {
                const webhookData = {
                    evento: "compra_vale",
                    cliente_nome: clientName.trim(),
                    cliente_telefone: clientPhone.trim(),
                    valor: amountBRL,
                    barbeiro: DEFAULT_BARBER.name,
                    loja: DEFAULT_BARBER.store,
                    data: now.toLocaleDateString("pt-BR"),
                    hora: now.toLocaleTimeString("pt-BR"),
                    data_hora_iso: now.toISOString(),
                    valor_pacote: amountBRL,
                    valor_por_visita: valorPorUso,
                    creditos: 4,
                    origem: "site_vale_presente",
                    forma_pagamento: formaPagamento,
                };

                await fetch(
                    "https://hook.us1.make.com/foskacjnw4sc883k1r7m82dsc4nmuhk3",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(webhookData),
                    }
                );
                console.log("Webhook Make.com notificado com sucesso");
            } catch (makeErr) {
                console.error("Erro ao notificar Make.com:", makeErr);
            }

            // 9. Responder com sucesso
            return res.status(200).json({
                success: true,
                message: "Venda de vale presente registrada com sucesso",
                lancamento_id: docRef.id,
                cliente: clientName.trim(),
                valor: amountBRL,
                creditos: 4,
                valor_por_uso: valorPorUso,
                dev_mode: isDevMode,
            });
        } catch (error) {
            console.error("Erro no webhook:", error);
            return res.status(500).json({
                error: "Internal server error",
                message: error.message,
            });
        }
    }
);
