/**
 * Vercel Serverless Function - Webhook do Stripe
 * 
 * Endpoint: https://seu-projeto.vercel.app/api/webhook
 * Configure este endpoint no Dashboard do Stripe
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    // Apenas POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Verificar assinatura do webhook
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Erro na verificação do webhook:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Processar evento
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('✅ Pagamento confirmado:', session.id);
            
            // Dados do pagamento
            const userId = session.client_reference_id;
            const amount = parseFloat(session.metadata.amount);
            
            console.log(`Adicionar R$ ${amount} ao usuário ${userId}`);
            
            // IMPORTANTE: Aqui você deve integrar com o Supabase
            // para adicionar os créditos automaticamente
            // Exemplo:
            /*
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY
            );
            
            await supabase
                .from('wallet_transactions')
                .insert({
                    profile_id: userId,
                    amount: amount,
                    transaction_type: 'credit',
                    description: 'Créditos adicionados via Stripe',
                    stripe_session_id: session.id
                });
            */
            
            break;

        case 'payment_intent.payment_failed':
            console.error('❌ Pagamento falhou:', event.data.object.id);
            break;

        default:
            console.log(`Evento não tratado: ${event.type}`);
    }

    res.json({ received: true });
};
