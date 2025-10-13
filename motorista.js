// @ts-nocheck

const SUPABASE_URL = 'https://emhxlsmukcwgukcsxhrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaHhsc211a2N3Z3VrY3N4aHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjU4NDAsImV4cCI6MjA3NDYwMTg0MH0.iqUWK2wJHuofA76u3wjbT1DBN_m3dqz60vPZ-dF9wYM';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_AVATAR_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjOTRBNEI1Ij48cGF0aCBkPSJNMCAwaDI0djI0SDB6IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTEyIDJjLTIuMiAwLTQgMS44LTQgNHMxLjggNCA0IDQgNCAxLjggNC00LTEuOC00LTQtNHptMCAxOGMtMi42NyAwLTggMS4zNC04IDR2MmgxNnYtMmMwLTIuNjYtNS4zMy00LTgtNHoiLz48L3N2Zz4=';

const state = { 
    user: null, 
    profile: null, 
    driverDetails: null, 
    rides: [], 
    rideSubscription: null, 
    locationWatcher: null,
    commissionRate: 0.25 // Default commission rate (25%)
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

function formatCurrency(value) {
    if (typeof value !== 'number') return 'R$ --,--';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    const fileName = `selfie-${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`; // Use user-specific folder

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
    if (!formData.selfieFile || !formData.selfieFile.type.startsWith('image/')) {
        return toast.show('O arquivo de foto deve ser uma imagem válida.', 'warning');
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

        if (createdUser) {
            console.warn("Usuário criado no Auth mas a inserção de detalhes falhou. Limpeza manual pode ser necessária para o usuário ID:", createdUser.id);
        }
    } finally {
        hideLoading('signup-btn');
    }
}

async function loadDriverData(user) {
    state.user = user;
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (profile) state.profile = profile;

    const { data: details } = await supabaseClient.from('driver_details').select('*').eq('profile_id', user.id).single();
    if (details) state.driverDetails = details;
    
    if (profile?.user_type !== 'driver') {
        toast.show('Este é o app para motoristas.', 'error');
        return handleSignOut();
    }

    if (!details) {
        showScreen('pending-approval-screen');
        return;
    }

    if (details.approval_status === 'approved') {
        document.getElementById('driver-avatar').src = details.selfie_with_id_url || DEFAULT_AVATAR_URL;
        document.getElementById('driver-welcome-message').textContent = `Olá, ${profile.full_name}!`;
        document.getElementById('work-status-toggle').checked = details.work_status === 'online';
        if(details.work_status === 'online') startLocationTracking();
        showScreen('driver-screen');
        loadDriverJobs();
    } else {
        showScreen('pending-approval-screen');
    }
}

function showProfileScreen() {
    if (!state.user || !state.profile || !state.driverDetails) {
        toast.show('Dados do motorista não carregados.', 'error');
        return;
    }
    // Populate form
    document.getElementById('profile-avatar-preview').src = state.driverDetails.selfie_with_id_url || DEFAULT_AVATAR_URL;
    document.getElementById('profile-fullname').value = state.profile.full_name || '';
    document.getElementById('profile-email').value = state.user.email || '';
    document.getElementById('profile-phone').value = state.profile.phone_number || '';
    document.getElementById('profile-pix-key').value = state.driverDetails.pix_key || '';
    document.getElementById('profile-model').value = state.driverDetails.car_model || '';
    document.getElementById('profile-color').value = state.driverDetails.car_color || '';
    document.getElementById('profile-plate').value = state.driverDetails.license_plate || '';

    showScreen('profile-screen');
}

async function uploadAvatar(userId, file) {
    if (!file) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `avatar-${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`; // Use user-specific folder

    const { error: uploadError } = await supabaseClient.storage
        .from('driver_documents')
        .upload(filePath, file);

    if (uploadError) {
        console.error("Supabase Storage Upload Error:", uploadError);
        throw uploadError;
    }

    const { data } = supabaseClient.storage.from('driver_documents').getPublicUrl(filePath);
    return data.publicUrl;
}

async function handleProfileUpdate() {
    showLoading('profile-save-btn');
    try {
        const avatarFile = document.getElementById('profile-avatar-upload').files[0];
        let newAvatarUrl = state.driverDetails.selfie_with_id_url;

        if (avatarFile) {
            newAvatarUrl = await uploadAvatar(state.user.id, avatarFile);
        }

        const updates = {
            profile: {
                phone_number: document.getElementById('profile-phone').value,
            },
            driverDetails: {
                pix_key: document.getElementById('profile-pix-key').value,
                car_model: document.getElementById('profile-model').value,
                car_color: document.getElementById('profile-color').value,
                selfie_with_id_url: newAvatarUrl, // Update the correct field
            }
        };

        const { error: profileError } = await supabaseClient
            .from('profiles')
            .update(updates.profile)
            .eq('id', state.user.id);
        if (profileError) throw profileError;
        
        const { error: detailsError } = await supabaseClient
            .from('driver_details')
            .update(updates.driverDetails)
            .eq('profile_id', state.user.id);
        if (detailsError) throw detailsError;
        
        // Refresh local state
        state.profile.phone_number = updates.profile.phone_number;
        state.driverDetails.pix_key = updates.driverDetails.pix_key;
        state.driverDetails.car_model = updates.driverDetails.car_model;
        state.driverDetails.car_color = updates.driverDetails.car_color;
        state.driverDetails.selfie_with_id_url = updates.driverDetails.selfie_with_id_url;

        // Update main screen avatar
        document.getElementById('driver-avatar').src = state.driverDetails.selfie_with_id_url || DEFAULT_AVATAR_URL;

        toast.show('Perfil atualizado com sucesso!', 'success');
        showScreen('driver-screen');

    } catch (error) {
        toast.show(`Erro ao atualizar perfil: ${error.message}`, 'error');
    } finally {
        hideLoading('profile-save-btn');
    }
}

// --- RIDE MANAGEMENT ---
function createRideElement(ride) {
    const passenger = ride.passenger || {};
    let actionButtons = '';

    const destinationAddress = (ride.destinations && Array.isArray(ride.destinations) && ride.destinations.length > 0)
        ? ride.destinations[0]
        : 'N/A';
    
    let ridePriceHtml;
    if (typeof ride.price === 'number' && ride.price > 0) {
        ridePriceHtml = `
            <div class="text-right">
                <p class="text-sm text-gray-400">Seu ganho</p>
                <p class="text-2xl font-bold text-green-400">${formatCurrency(ride.driver_earning_preview)}</p>
            </div>
        `;
    } else {
         ridePriceHtml = `
            <div class="text-right p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                 <p class="text-yellow-300 font-semibold">Valor não informado</p>
                 <p class="text-xs text-yellow-400/80">O valor aparecerá após aceitar.</p>
            </div>
         `;
    }

    switch(ride.status) {
        case 'requested':
            actionButtons = `
                <button onclick="acceptRide('${ride.id}')" class="w-full py-3 font-semibold rounded-lg bg-green-600 hover:bg-green-700 transition-colors new-ride-alert">
                    🚗 ACEITAR NOVA CORRIDA
                </button>
            `;
            break;
        case 'assigned':
            actionButtons = `
                <button onclick="updateRideStatus('${ride.id}', 'accepted')" class="w-full py-3 font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors">
                    📍 CHEGUEI AO LOCAL DE PARTIDA
                </button>
                <button onclick="openMap('${ride.origin_address}', '${destinationAddress}')" class="mt-2 w-full py-2 font-semibold rounded-lg bg-gray-600 hover:bg-gray-700 transition-colors">
                    🗺️ VER NO MAPA
                </button>
                 <button onclick="updateRideStatus('${ride.id}', 'canceled')" class="mt-2 w-full py-2 text-sm rounded-lg bg-red-800 hover:bg-red-700 transition-colors">
                    ❌ Cancelar
                </button>
            `;
            break;
        case 'accepted':
             actionButtons = `
                <button onclick="updateRideStatus('${ride.id}', 'in_progress')" class="w-full py-3 font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors">
                    ▶️ INICIAR VIAGEM
                </button>
                 <button onclick="openMap('${ride.origin_address}', '${destinationAddress}')" class="mt-2 w-full py-2 font-semibold rounded-lg bg-gray-600 hover:bg-gray-700 transition-colors">
                    🗺️ VER ROTA PARA O DESTINO
                </button>
            `;
            break;
        case 'in_progress':
            actionButtons = `
                <button onclick="updateRideStatus('${ride.id}', 'completed')" class="w-full py-3 font-semibold rounded-lg bg-green-600 hover:bg-green-700 transition-colors">
                    🏁 FINALIZAR VIAGEM
                </button>
            `;
            break;
        case 'completed':
            actionButtons = `<p class="text-center text-green-400 font-bold text-lg p-3 bg-green-900/50 rounded-lg">✅ CORRIDA FINALIZADA</p>`;
            break;
        case 'canceled':
            actionButtons = `<p class="text-center text-red-400 font-bold text-lg p-3 bg-red-900/50 rounded-lg">❌ CORRIDA CANCELADA</p>`;
            break;
    }

    return `
        <div class="p-4 rounded-lg bg-gray-800 space-y-4" data-ride-id="${ride.id}">
            <div class="flex justify-between items-start">
                <div>
                    <p class="flex items-center gap-2">
                        <span>👤</span>
                        <strong>Passageiro:</strong> ${passenger.full_name || 'N/A'}
                    </p>
                    <p class="flex items-center gap-2 text-sm text-gray-300">
                        <span>📞</span>
                        <strong>Telefone:</strong> ${passenger.phone_number || 'N/A'}
                    </p>
                </div>
                <div class="flex flex-col gap-2 items-end">
                   ${ridePriceHtml}
                </div>
            </div>
            
            <div>
                <p class="flex items-start gap-2 text-sm text-gray-300">
                    <span>🏠</span>
                    <div>
                        <strong>Origem:</strong><br>
                        ${ride.origin_address || 'N/A'}
                    </div>
                </p>
            </div>

            <div class="destination-box">
                <p>
                    <strong>📍 DESTINO</strong><br>
                    <span class="font-semibold text-lg">${destinationAddress}</span>
                </p>
            </div>
            
            <div class="space-y-2">
                ${actionButtons}
            </div>
        </div>
    `;
}


async function loadDriverJobs() {
    if (!state.user) return;

    const listContainer = document.getElementById('driver-jobs-list');
    listContainer.innerHTML = `<div class="loader mx-auto"></div>`;

    try {
        const { data: configData, error: configError } = await supabaseClient
            .from('app_config')
            .select('value')
            .eq('key', 'COMMISSION_RATE')
            .single();

        if (configError) {
            console.warn('Não foi possível buscar a taxa de comissão, usando o valor padrão.');
        } else {
            state.commissionRate = parseFloat(configData.value);
        }
        
        // Prioridade 1: Corridas já atribuídas ao motorista
        const { data: assignedRides, error: assignedError } = await supabaseClient
            .from('rides')
            .select('*')
            .eq('driver_id', state.user.id)
            .in('status', ['assigned', 'accepted', 'in_progress']);
        if (assignedError) throw assignedError;

        // Prioridade 2: Novas corridas disponíveis para todos
        const { data: requestedRides, error: requestedError } = await supabaseClient
            .from('rides')
            .select('*')
            .eq('status', 'requested')
            .is('driver_id', null);
        if (requestedError) throw requestedError;

        // Combina as listas, com as corridas já aceitas no topo
        const allRides = [...(assignedRides || []), ...(requestedRides || [])];
        
        if (allRides.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-gray-400">Nenhuma corrida no momento.</p>';
            stopRinging();
            return;
        }

        const passengerIds = [...new Set(allRides.map(ride => ride.passenger_id).filter(id => id))];
        
        let passengersMap = new Map();
        if (passengerIds.length > 0) {
            const { data: passengers, error: passengersError } = await supabaseClient
                .from('profiles')
                .select('id, full_name, phone_number')
                .in('id', passengerIds);
            if (passengersError) throw passengersError;
            passengersMap = new Map(passengers.map(p => [p.id, p]));
        }

        const ridesWithData = allRides.map(ride => {
            const driverEarningPreview = (typeof ride.price === 'number') ? ride.price * (1 - state.commissionRate) : 0;
            return {
                ...ride,
                passenger: passengersMap.get(ride.passenger_id) || { full_name: 'Passageiro', phone_number: 'N/A' },
                driver_earning_preview: driverEarningPreview
            };
        });

        state.rides = ridesWithData;
        listContainer.innerHTML = ridesWithData.map(createRideElement).join('');
        
        // Toca o alarme apenas se houver corridas NOVAS (requested)
        if (requestedRides.length > 0) {
            startRinging();
        } else {
            stopRinging();
        }

    } catch (error) {
        console.error("Erro ao carregar corridas:", error);
        toast.show('Erro ao carregar corridas.', 'error');
        listContainer.innerHTML = '<p class="text-center text-red-400">Erro ao buscar corridas.</p>';
    }
}

async function acceptRide(rideId) {
    const { error } = await supabaseClient
        .from('rides')
        .update({ driver_id: state.user.id, status: 'assigned' })
        .eq('id', rideId);
    if (error) {
        toast.show('Erro ao aceitar a corrida. Tente novamente.', 'error');
    } else {
        toast.show('Corrida aceita!', 'success');
        // Não precisa recarregar, o listener de real-time fará isso.
    }
}

async function updateRideStatus(rideId, newStatus) {
    let rideUpdate = { status: newStatus };

    // Se a corrida está sendo completada, calcula os ganhos
    if (newStatus === 'completed') {
        const ride = state.rides.find(r => r.id === rideId);
        if (!ride || typeof ride.price !== 'number' || ride.price <= 0) {
            toast.show('Erro: Preço da corrida inválido para finalizar.', 'error');
            return;
        }
        
        const platform_fee = ride.price * state.commissionRate;
        const driver_earnings = ride.price - platform_fee;

        rideUpdate = {
            ...rideUpdate,
            platform_fee: platform_fee,
            driver_earnings: driver_earnings
        };
    }
    
    const { error } = await supabaseClient
        .from('rides')
        .update(rideUpdate)
        .eq('id', rideId);
        
    if (error) {
        toast.show('Erro ao atualizar o status da corrida.', 'error');
    } else {
        toast.show('Status da corrida atualizado.', 'success');
    }
}


function openMap(origin, destination) {
    if (!origin || !destination) {
        return toast.show('Origem ou destino não informados.', 'warning');
    }
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    window.open(url, '_blank');
}

function startRinging() {
    const ringtone = document.getElementById('ringtone');
    const silenceBtn = document.getElementById('silence-btn');
    if (ringtone.paused) {
        ringtone.play().catch(e => console.error("Erro ao tocar áudio:", e));
    }
    silenceBtn.classList.remove('hidden');
}

function stopRinging() {
    const ringtone = document.getElementById('ringtone');
    const silenceBtn = document.getElementById('silence-btn');
    if (!ringtone.paused) {
        ringtone.pause();
        ringtone.currentTime = 0;
    }
    silenceBtn.classList.add('hidden');
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

    // Profile Form
    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleProfileUpdate();
    });

    // Avatar Preview
    document.getElementById('profile-avatar-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('profile-avatar-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // Ride Subscription
    supabaseClient
        .channel('public:rides')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, payload => {
            console.log('Change received!', payload);
            if (document.getElementById('driver-screen').classList.contains('active')) {
                loadDriverJobs();
            }
        })
        .subscribe();

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
window.showProfileScreen = showProfileScreen;
window.acceptRide = acceptRide;
window.updateRideStatus = updateRideStatus;
window.openMap = openMap;
window.stopRinging = stopRinging;