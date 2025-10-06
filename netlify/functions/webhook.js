const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Inicializar cliente Supabase com as variáveis de ambiente
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('❌ ERRO CRÍTICO: STRIPE_WEBHOOK_SECRET não configurado.');
        return res.status(500).json({ error: 'Webhook secret não configurado.' });
    }

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        console.log(`✅ Assinatura verificada. Evento: ${event.type}`);
    } catch (err) {
        console.error(`❌ Falha na assinatura do webhook: ${err.message}`);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('💰 Processando sessão:', session.id);

        if (session.payment_status === 'paid') {
            try {
                const userId = session.client_reference_id;
                const amount = parseFloat(session.metadata.amount);
                const stripeChargeId = session.payment_intent;

                if (!userId || !amount || amount <= 0) {
                    console.error('❌ Dados ausentes ou inválidos na sessão Stripe:', { userId, amount });
                    return res.status(400).json({ error: 'Metadados da sessão inválidos.' });
                }

                // **AÇÃO PRINCIPAL: Inserir na tabela com o nome da coluna CORRETO**
                const { data, error } = await supabase
                    .from('wallet_transactions')
                    .insert({
                        profile_id: userId,
                        amount: amount,
                        transaction_type: 'credit', // <-- CORREÇÃO FINAL APLICADA AQUI
                        description: `Crédito de R$ ${amount.toFixed(2)} via Stripe`,
                        stripe_charge_id: stripeChargeId
                    });

                if (error) {
                    // Se houver um erro aqui, ele será logado na Vercel
                    console.error('❌ ERRO DO SUPABASE AO INSERIR:', error);
                    throw new Error(`Erro no Supabase: ${error.message}`);
                }

                console.log(`✅ SUCESSO! Crédito de R$ ${amount.toFixed(2)} adicionado para o usuário ${userId}.`);

            } catch (error) {
                console.error('❌ Erro ao processar o webhook:', error.message);
                return res.status(500).json({ error: 'Erro interno ao processar o webhook.' });
            }
        } else {
            console.log(`🔔 Sessão ${session.id} não paga (${session.payment_status}). Ignorando.`);
        }
    } else {
        console.log(`🔔 Evento não tratado: ${event.type}`);
    }

    res.json({ received: true });
};
