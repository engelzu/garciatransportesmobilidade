const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// A Netlify espera que a função seja exportada como 'handler'
exports.handler = async (event, context) => {
    const sig = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    try {
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            const userId = session.client_reference_id;
            const amount = parseFloat(session.metadata.amount);

            if (!userId || !amount) {
                throw new Error('Missing required data in session metadata');
            }

            const { error } = await supabase
                .from('wallet_transactions')
                .insert({
                    profile_id: userId,
                    amount: amount,
                    transaction_type: 'credit',
                    description: `Crédito de R$ ${amount.toFixed(2)} via Stripe`,
                
                });

            if (error) {
                throw error;
            }
            console.log(`✅ SUCESSO! Transação de R$ ${amount.toFixed(2)} para o usuário ${userId} registrada.`);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };

    } catch (error) {
        console.error('❌ Erro ao processar webhook e inserir no Supabase:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
