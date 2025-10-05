const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Inicializar cliente Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
    // Apenas POST permitido
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('❌ STRIPE_WEBHOOK_SECRET não configurado');
        return res.status(500).json({ error: 'Webhook secret não configurado' });
    }

    let event;

    try {
        // Verificar assinatura do webhook
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        console.log('✅ Webhook signature verified:', event.type);
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    try {
        // Processar diferentes tipos de eventos
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            
            case 'payment_intent.succeeded':
                await handlePaymentIntentSucceeded(event.data.object);
                break;
            
            case 'payment_intent.payment_failed':
                await handlePaymentIntentFailed(event.data.object);
                break;
            
            default:
                console.log(`🔔 Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

async function handleCheckoutSessionCompleted(session) {
    console.log('💰 Processing checkout session completed:', session.id);
    
    try {
        const userId = session.client_reference_id;
        const amount = parseFloat(session.metadata.amount);
        const sessionId = session.id;
        const paymentIntentId = session.payment_intent;

        if (!userId || !amount) {
            console.error('❌ Missing required data in session metadata');
            return;
        }

        // 1. Registrar transação na tabela transactions
        const { data: transaction, error: transactionError } = await supabase
            .from('transactions')
            .insert({
                user_id: userId,
                amount: amount,
                type: 'credit',
                status: 'completed',
                stripe_session_id: sessionId,
                stripe_payment_intent_id: paymentIntentId,
                description: `Crédito adicionado via Stripe - R$ ${amount.toFixed(2)}`,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (transactionError) {
            console.error('❌ Error creating transaction:', transactionError);
            throw transactionError;
        }

        console.log('✅ Transaction created:', transaction.id);

        // 2. Atualizar saldo do usuário
        const { data: currentUser, error: getUserError } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', userId)
            .single();

        if (getUserError) {
            console.error('❌ Error getting user:', getUserError);
            throw getUserError;
        }

        const currentBalance = currentUser.wallet_balance || 0;
        const newBalance = currentBalance + amount;

        const { error: updateBalanceError } = await supabase
            .from('users')
            .update({ 
                wallet_balance: newBalance,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (updateBalanceError) {
            console.error('❌ Error updating wallet balance:', updateBalanceError);
            throw updateBalanceError;
        }

        console.log(`✅ Wallet updated: ${currentBalance} + ${amount} = ${newBalance}`);

        // 3. Criar notificação para o usuário
        const { error: notificationError } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                title: 'Crédito Adicionado',
                message: `R$ ${amount.toFixed(2)} foram adicionados à sua carteira`,
                type: 'payment_success',
                read: false,
                created_at: new Date().toISOString()
            });

        if (notificationError) {
            console.error('❌ Error creating notification:', notificationError);
            // Não falhar por causa da notificação
        } else {
            console.log('✅ Notification created');
        }

    } catch (error) {
        console.error('❌ Error in handleCheckoutSessionCompleted:', error);
        throw error;
    }
}

async function handlePaymentIntentSucceeded(paymentIntent) {
    console.log('💳 Payment intent succeeded:', paymentIntent.id);
    
    // Atualizar status da transação se necessário
    try {
        const { error } = await supabase
            .from('transactions')
            .update({ 
                status: 'completed',
                stripe_payment_intent_id: paymentIntent.id,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_payment_intent_id', paymentIntent.id);

        if (error) {
            console.error('❌ Error updating transaction status:', error);
        } else {
            console.log('✅ Transaction status updated to completed');
        }
    } catch (error) {
        console.error('❌ Error in handlePaymentIntentSucceeded:', error);
    }
}

async function handlePaymentIntentFailed(paymentIntent) {
    console.log('❌ Payment intent failed:', paymentIntent.id);
    
    // Atualizar status da transação para falha
    try {
        const { error } = await supabase
            .from('transactions')
            .update({ 
                status: 'failed',
                stripe_payment_intent_id: paymentIntent.id,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_payment_intent_id', paymentIntent.id);

        if (error) {
            console.error('❌ Error updating failed transaction:', error);
        } else {
            console.log('✅ Transaction status updated to failed');
        }
    } catch (error) {
        console.error('❌ Error in handlePaymentIntentFailed:', error);
    }
}
