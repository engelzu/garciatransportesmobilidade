const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Inicializar cliente Supabase com as variáveis de ambiente
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY // A chave ANON é suficiente e segura para esta operação de backend
);

module.exports = async (req, res) => {
    // Permitir apenas o método POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('❌ ERRO CRÍTICO: A variável de ambiente STRIPE_WEBHOOK_SECRET não está configurada.');
        return res.status(500).json({ error: 'Webhook secret não configurado no servidor.' });
    }

    let event;

    try {
        // A Vercel já faz o parse do body, então usamos req.body
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        console.log(`✅ Assinatura do Webhook verificada. Evento: ${event.type}`);
    } catch (err) {
        console.error(`❌ Falha na verificação da assinatura do webhook: ${err.message}`);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Processar o evento que confirma o pagamento
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('💰 Processando evento checkout.session.completed para a sessão:', session.id);

        // Garantir que o pagamento foi concluído com sucesso
        if (session.payment_status === 'paid') {
            try {
                // Extrair metadados importantes da sessão do Stripe
                const userId = session.client_reference_id; // ID do usuário (profile_id)
                const amount = parseFloat(session.metadata.amount); // Valor do crédito
                const stripeChargeId = session.payment_intent; // ID da transação no Stripe

                // Validação dos dados recebidos
                if (!userId || !amount || amount <= 0) {
                    console.error('❌ Dados ausentes ou inválidos na sessão do Stripe:', { userId, amount });
                    return res.status(400).json({ error: 'Metadados da sessão do Stripe ausentes ou inválidos.' });
                }

                // **AÇÃO PRINCIPAL: Inserir o crédito na tabela `wallet_transactions` com as colunas corretas**
                const { data, error } = await supabase
                    .from('wallet_transactions')
                    .insert({
                        profile_id: userId,
                        amount: amount,
                        transaction_ty: 'credit', // <-- CORREÇÃO APLICADA AQUI
                        description: `Crédito de R$ ${amount.toFixed(2)} via Stripe`,
                        stripe_charge_id: stripeChargeId // <-- Coluna adicional para referência
                    });

                if (error) {
                    console.error('❌ Erro ao inserir a transação no Supabase:', error);
                    // Lança o erro para que a resposta seja 500 e o Stripe possa tentar reenviar o webhook.
                    throw new Error(`Erro no Supabase: ${error.message}`);
                }

                console.log(`✅ SUCESSO! Crédito de R$ ${amount.toFixed(2)} adicionado para o usuário ${userId}.`);

            } catch (error) {
                console.error('❌ Erro ao processar o webhook:', error);
                // Retorna um erro 500 para que o Stripe tente reenviar o webhook mais tarde.
                return res.status(500).json({ error: 'Erro interno ao processar o webhook.' });
            }
        } else {
            console.log(`🔔 Sessão ${session.id} não foi paga (${session.payment_status}). Ignorando.`);
        }
    } else {
        console.log(`🔔 Evento não tratado recebido: ${event.type}`);
    }

    // Responda ao Stripe para confirmar o recebimento do evento
    res.json({ received: true });
};
