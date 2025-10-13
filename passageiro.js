// @ts-nocheck

const SUPABASE_URL = 'https://emhxlsmukcwgukcsxhrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaHhsc211a2N3Z3VrY3N4aHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjU4NDAsImV4cCI6MjA3NDYwMTg0MH0.iqUWK2wJHuofA76u3wjbT1DBN_m3dqz60vPZ-dF9wYM';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = { 
    user: null, 
    profile: null,
};

// --- UTILITIES ---

class ToastManager {
    constructor() { this.container = document.getElementById('toast-container'); }
    show(message, type = 'info', duration = 4000) {
        if (!this.container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        toast.innerHTML = `<p class="font-medium">${icons[type]} ${message}</p>`;
        this.container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }
}
const toast = new ToastManager();

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.classList.add('btn-loading');
        btn.disabled = true;
    }
}

function hideLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

// --- AUTHENTICATION & PROFILE ---

async function handleSignIn(email, password) {
    showLoading('login-btn');
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.show('Login bem-sucedido!', 'success');
    } catch (error) {
        toast.show(error.message, 'error');
    } finally {
        hideLoading('login-btn');
    }
}

window.handleSignOut = async function() {
    await supabaseClient.auth.signOut();
    toast.show('Você saiu da sua conta.', 'info');
}

async function handleSignUp(fullName, email, phone, password) {
    showLoading('signup-btn');
    try {
        if (password.length < 6) throw new Error('A senha deve ter no mínimo 6 caracteres.');
        
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    phone_number: phone,
                    user_type: 'passenger'
                }
            }
        });
        if (error) throw error;
        toast.show('Conta criada! Faça o login para continuar.', 'success');
        showScreen('login-screen');
    } catch (error) {
        toast.show(`Erro no cadastro: ${error.message}`, 'error');
    } finally {
        hideLoading('signup-btn');
    }
}

async function loadPassengerData(user) {
    state.user = user;
    const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (error) {
        toast.show('Erro ao carregar seu perfil.', 'error');
        return handleSignOut();
    }
    state.profile = profile;
    
    if (profile.user_type !== 'passenger') {
        toast.show('Esta área é apenas para passageiros.', 'error');
        return handleSignOut();
    }
    
    document.getElementById('welcome-message').textContent = `Olá, ${profile.full_name.split(' ')[0]}!`;
    showScreen('passenger-screen');
}

// --- APP LOGIC ---

async function handleRequestRide() {
    const destination = document.getElementById('destination').value;
    if (!destination) {
        return toast.show('Por favor, informe seu destino.', 'error');
    }

    showLoading('request-ride-btn');
    document.getElementById('ride-status').classList.remove('hidden');

    try {
        // Here you could add logic to get current location
        const origin = 'Av. Gomes Jardim, 516 - Alegria, Guaíba - RS, 92500-000, Brasil'; // Hardcoded for demo
        const estimatedPrice = 46.24; // Static price for demo as per user request context

        const { error } = await supabaseClient.from('rides').insert({
            passenger_id: state.user.id,
            origin_address: origin,
            destinations: [destination], // Correctly save destination in the array field
            status: 'requested',
            price: estimatedPrice, // Save the correct price
        });

        if (error) throw error;

        toast.show('Corrida solicitada! Procurando motorista...', 'success');
        document.getElementById('ride-request-form').classList.add('hidden');

    } catch (error) {
        toast.show(`Erro ao solicitar corrida: ${error.message}`, 'error');
        document.getElementById('ride-status').classList.add('hidden');
    } finally {
        // Keep loading state until a driver is found or it times out.
        // For this example, we don't remove the loading state automatically.
    }
}

function handleAddCredits() {
    // This is where you would integrate with a payment gateway like Stripe.
    // For now, we simulate the action.
    toast.show('Redirecionando para o portal de pagamento...', 'info');
    // For example: window.location.href = '/payment-link';
}

// --- INITIALIZATION & EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    // Auth Listener
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            loadPassengerData(session.user);
        } else if (event === 'SIGNED_OUT') {
            state.user = null;
            state.profile = null;
            showScreen('login-screen');
        }
    });

    // Login Form
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleSignIn(e.target.elements['login-email'].value, e.target.elements['login-password'].value);
    });

    // Signup Form
    document.getElementById('signup-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const fullName = e.target.elements['signup-fullname'].value;
        const email = e.target.elements['signup-email'].value;
        const phone = e.target.elements['signup-phone'].value;
        const password = e.target.elements['signup-password'].value;
        handleSignUp(fullName, email, phone, password);
    });

    // Ride Request Form
    document.getElementById('ride-request-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleRequestRide();
    });

    // Add Credits Button
    document.getElementById('add-credits-btn').addEventListener('click', handleAddCredits);

    // Check initial session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            loadPassengerData(session.user);
        } else {
            showScreen('login-screen');
        }
    }).finally(() => {
        document.getElementById('loading-screen').classList.remove('active');
    });
});

// Make functions available in global scope for HTML onclick
window.showScreen = showScreen;