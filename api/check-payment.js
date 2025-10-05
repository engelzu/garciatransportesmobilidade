const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { amount, userId, userEmail } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valor inválido' });
        }

        if (!userId) {
            return res.status(400).json({ error: 'ID do usuário não fornecido' });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: 'Créditos Garcia Mobilidade',
                            description: `Adicionar R$ ${amount.toFixed(2)} à carteira`,
                        },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${req.headers.origin}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}?payment=cancel`,
            client_reference_id: userId,
            customer_email: userEmail,
            metadata: {
                userId: userId,
                amount: amount.toString(),
                type: 'wallet_credit'
            }
        });

        res.json({ 
            sessionId: session.id,
            url: session.url 
        });

    } catch (error) {
        console.error('Erro Stripe:', error);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento',
            message: error.message
        });
    }
}
