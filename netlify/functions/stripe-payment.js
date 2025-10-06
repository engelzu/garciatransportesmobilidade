const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// A Netlify espera que a função seja exportada como 'handler'
exports.handler = async (event, context) => {
    // A Netlify passa os dados do POST no 'body', que é uma string.
    // Precisamos converter essa string para um objeto JSON.
    const { amount, userId, userEmail } = JSON.parse(event.body);

    // Validações
    if (!amount || amount <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Valor inválido' }) };
    }
    if (!userId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'ID do usuário não fornecido' }) };
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: {
                        name: 'Créditos Garcia Mobilidade',
                        description: `Adicionar R$ ${amount.toFixed(2)} à carteira`,
                    },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            // O 'origin' vem dos headers do evento da Netlify
            success_url: `${event.headers.origin}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${event.headers.origin}?payment=cancel`,
            client_reference_id: userId,
            customer_email: userEmail,
            metadata: {
                userId: userId,
                amount: amount.toString(),
                type: 'wallet_credit'
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ sessionId: session.id, url: session.url })
        };

    } catch (error) {
        console.error('❌ Stripe Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Erro ao processar pagamento', message: error.message })
        };
    }
};
