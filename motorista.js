// @ts-nocheck

const SUPABASE_URL = 'https://emhxlsmukcwgukcsxhrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaHhsc211a2N3Z3VrY3N4aHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjU4NDAsImV4cCI6MjA3NDYwMTg0MH0.iqUWK2wJHuofA76u3wjbT1DBN_m3dqz60vPZ-dF9wYM';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = { 
    user: null, 
    profile: null, 
    driverDetails: null, 
    rides: [], 
    rideSubscription: null, 
    locationWatcher: null 
};

// --- UTILITIES ---

class ToastManager {
    constructor() { this.container = document.getElementById('toast-container'); }
    show(message, type = 'info', duration = 4000) {
        if (!this.container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
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
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.show('Login realizado com sucesso!', 'success');
    } catch (error) {
        toast.show(error.message, 'error');
    } finally {
        hideLoading('login-btn');
    }
}

async function handleSignOut() {
    if (state.driverDetails) {
        await supabaseClient.from('driver_details').update({ work_status: 'offline' }).eq('profile_id', state.user.id);
    }
    await supabaseClient.auth.signOut();
    toast.show('Você saiu da sua conta.', 'info');
}

async function uploadDriverSelfie(userId, file) {
    if (!file) throw new Error("Nenhum arquivo de imagem selecionado.");

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `public/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('driver_documents')
        .upload(filePath, file);

    if (uploadError) {
        throw uploadError;
    }

    const { data: publicUrlData } = supabaseClient.storage
        .from('driver_documents')
        .getPublicUrl(filePath);
        
    if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error("Não foi possível obter a URL pública da imagem.");
    }

    return publicUrlData.publicUrl;
}

async function handleSignUp(formData) {
    // Basic validation
    for (const key in formData) {
        if (!formData[key]) {
            return toast.show(`O campo "${key}" é obrigatório.`, 'warning');
        }
    }
    if (formData.password.length < 6) {
        return toast.show('A senha deve ter pelo menos 6 caracteres.', 'warning');
    }
    if (!formData.selfieFile.type.startsWith('image/')) {
        return toast.show('O arquivo de foto deve ser uma imagem.', 'warning');
    }
    
    showLoading('signup-btn');

    let createdUser = null;

    try {
        // Step 1: Create user in Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: formData.email,
            password: formData.password,
            options: {
                data: {
                    full_name: formData.fullName,
                    phone_number: formData.phone,
                    user_type: 'driver'
                }
            }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Criação do usuário falhou.");
        createdUser = authData.user;

        // Step 2: Upload selfie to Storage
        const selfieUrl = await uploadDriverSelfie(createdUser.id, formData.selfieFile);

        // Step 3: Insert driver details into the table
        const { error: detailsError } = await supabaseClient.from('driver_details').insert({
            profile_id: createdUser.id,
            license_plate: formData.plate,
            car_model: formData.model,
            car_color: formData.color,
            pix_key: formData.pixKey,
            selfie_with_id_url: selfieUrl,
            approval_status: 'pending' // Always starts as pending
        });

        if (detailsError) throw detailsError;

        toast.show('Cadastro enviado com sucesso! Sua conta está em análise.', 'success');
        await supabaseClient.auth.signOut(); // Log out user after signup
        showScreen('login-screen');

    } catch (error) {
        console.error("Signup Error:", error);
        toast.show(`Erro no cadastro: ${error.message}`, 'error');

        // Cleanup: if user was created but details failed, delete the user
        if (createdUser) {
            // This requires admin privileges, so we can't do it from the client.
            // This is a case for manual cleanup or a server-side function.
            console.warn("User created in Auth but details insertion failed. Manual cleanup may be required for user ID:", createdUser.id);
        }
    } finally {
        hideLoading('signup-btn');
    }
}

async function loadDriverData(user) {
    state.user = user;
    const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (profile) state.profile = profile;

    const { data: details, error: detailsError } = await supabaseClient.from('driver_details').select('*').eq('profile_id', user.id).single();
    if (details) state.driverDetails = details;
    
    if (profile?.user_type !== 'driver') {
        toast.show('Este é o app para motoristas.', 'error');
        return handleSignOut();
    }

    if (!details) {
        // This case shouldn't happen with the new flow, but as a fallback
        showScreen('pending-approval-screen');
        return;
    }

    if (details.approval_status === 'approved') {
        document.getElementById('driver-welcome-message').textContent = `Olá, ${profile.full_name}!`;
        document.getElementById('work-status-toggle').checked = details.work_status === 'online';
        if(details.work_status === 'online') startLocationTracking();
        showScreen('driver-screen');
        // loadDriverJobs(); // Add this back when ride logic is complete
    } else {
        showScreen('pending-approval-screen');
    }
}

// --- RIDE & LOCATION ---

async function toggleWorkStatus() {
    const isChecked = document.getElementById('work-status-toggle').checked;
    const newStatus = isChecked ? 'online' : 'offline';
    const { error } = await supabaseClient.from('driver_details').update({ work_status: newStatus }).eq('profile_id', state.user.id);
    if (error) {
        toast.show('Erro ao atualizar status.', 'error');
    } else {
        toast.show(`Você está ${newStatus}!`, 'success');
        if (newStatus === 'online') startLocationTracking();
        else stopLocationTracking();
    }
}

function startLocationTracking() {
    if (!navigator.geolocation) return toast.show('Geolocalização não suportada.', 'warning');
    if (state.locationWatcher) return;
    state.locationWatcher = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const location = `POINT(${longitude} ${latitude})`;
            supabaseClient.from('driver_details').update({ current_location: location }).eq('profile_id', state.user.id).then();
        },
        (error) => toast.show('Erro de localização. Verifique as permissões.', 'error'),
        { enableHighAccuracy: true }
    );
}

function stopLocationTracking() {
    if (state.locationWatcher) {
        navigator.geolocation.clearWatch(state.locationWatcher);
        state.locationWatcher = null;
    }
}

// --- INITIALIZATION & EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    // Auth Listener
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            loadDriverData(session.user);
        } else if (event === 'SIGNED_OUT') {
            state.user = null;
            state.profile = null;
            state.driverDetails = null;
            stopLocationTracking();
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
        const formData = {
            fullName: e.target.elements['signup-fullname'].value,
            email: e.target.elements['signup-email'].value,
            phone: e.target.elements['signup-phone'].value,
            password: e.target.elements['signup-password'].value,
            plate: e.target.elements['signup-plate'].value,
            model: e.target.elements['signup-model'].value,
            color: e.target.elements['signup-color'].value,
            pixKey: e.target.elements['signup-pix-key'].value,
            selfieFile: e.target.elements['signup-selfie'].files[0]
        };
        handleSignUp(formData);
    });

    // Check initial session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            loadDriverData(session.user);
        } else {
            showScreen('login-screen');
        }
    });
});

// Make functions available in global scope for HTML onclick
window.showScreen = showScreen;
window.handleSignOut = handleSignOut;
window.toggleWorkStatus = toggleWorkStatus;
