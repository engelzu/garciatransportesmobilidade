// @ts-nocheck

const SUPABASE_URL = 'https://emhxlsmukcwgukcsxhrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaHhsc211a2N3Z3VrY3N4aHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjU4NDAsImV4cCI6MjA3NDYwMTg0MH0.iqUWK2wJHuofA76u3wjbT1DBN_m3dqz60vPZ-dF9wYM';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = { 
    user: null, 
    profile: null, 
    currentRide: null, 
    rideSubscription: null,
    ridePollInterval: null,
    isInitializing: false,
    originPlace: null,
    destinationPlace: null,
    currentEstimate: null,
    walletBalance: 0
};

// CONFIGURAÇÕES DE PREÇOS
const PRICING_CONFIG = {
    baseFare: 5.50,          // Tarifa base em R$
    pricePerKm: 2.20,        // Preço por quilômetro
    pricePerMinute: 0.35,    // Preço por minuto
    minimumFare: 8.00,       // Tarifa mínima
    surgePricing: 1.0,       // Multiplicador (1.0 = preço normal)
};

let loadingTimeout = null;

// =============================================================================
// ERROR RECOVERY & GLOBAL HANDLERS
// =============================================================================
function setupLoadingTimeout() {
    loadingTimeout = setTimeout(() => {
        document.getElementById('loading-error')?.classList.remove('hidden');
    }, 15000);
}

function clearLoadingTimeout() {
    if (loadingTimeout) clearTimeout(loadingTimeout);
    loadingTimeout = null;
}

function forceReload() {
    window.location.reload();
}

window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Promise rejection não tratada:', event.reason);
    if (event.reason?.message?.includes('Auth')) {
        handleAuthError();
    }
});

function handleAuthError() {
    console.log('🔧 Recuperando de erro de autenticação...');
    state.user = state.profile = state.currentRide = null;
    if (state.rideSubscription) {
        try {
            supabaseClient.removeChannel(state.rideSubscription);
            state.rideSubscription = null;
        } catch (e) { console.warn('Erro ao remover subscription:', e); }
    }
    stopRidePolling();
    showScreen('login-screen');
}

// =============================================================================
// TOAST NOTIFICATION SYSTEM
// =============================================================================
class ToastManager {
    constructor() {
        this.container = document.getElementById('toast-container');
    }
    show(message, type = 'info', duration = 4000) {
        if (!this.container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const titles = { success: 'Sucesso', error: 'Erro', warning: 'Atenção', info: 'Informação' };
        toast.innerHTML = `<div class="flex justify-between items-start"><div class="flex-1"><p class="font-medium">${icons[type]} ${titles[type]}</p><p class="text-sm opacity-90 mt-1">${message}</p></div><button onclick="this.parentElement.parentElement.remove()" class="ml-3 text-white/60 hover:text-white">✕</button></div>`;
        this.container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
}
const toast = new ToastManager();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
    clearLoadingTimeout();
}

function showLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    if(btn) {
        btn.classList.add('btn-loading');
        btn.disabled = true;
    }
}

function hideLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    if(btn) {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

function formatDateTime(dateString) {
    try {
        return new Date(dateString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
        return 'N/A';
    }
}

// =============================================================================
// RIDE STATUS UI MANAGEMENT
// =============================================================================
const statusOrder = ['requested', 'assigned', 'accepted', 'in_progress', 'completed'];

function renderTimeline(currentStatus) {
    const timelineContainer = document.getElementById('status-timeline');
    if (!timelineContainer) return;

    const timelineConfig = {
        'requested': { icon: '⏳', text: 'Procurando motorista' },
        'assigned': { icon: '🎯', text: 'Motorista encontrado' },
        'accepted': { icon: '🚗', text: 'Motorista a caminho' },
        'in_progress': { icon: '📍', text: 'Viagem em andamento' },
        'completed': { icon: '🏁', text: 'Viagem concluída' },
    };

    timelineContainer.innerHTML = '';
    const currentIndex = statusOrder.indexOf(currentStatus);

    statusOrder.forEach((status, index) => {
        if (timelineConfig[status]) {
            const item = document.createElement('div');
            let itemClass = 'timeline-item';
            if (index < currentIndex) itemClass += ' completed';
            if (index === currentIndex) itemClass += ' active';

            item.className = itemClass;
            item.innerHTML = `<div class="timeline-icon">${timelineConfig[status].icon}</div><p class="timeline-text">${timelineConfig[status].text}</p>`;
            timelineContainer.appendChild(item);
        }
    });
}

function updateDriverPanel(driver, details) {
    const driverPanel = document.getElementById('driver-details-panel');
    if (!driverPanel) return;
    
    const isActive = !!driver;
    
    driverPanel.style.opacity = isActive ? '1' : '0';
    driverPanel.style.transform = isActive ? 'translateY(0)' : 'translateY(-1rem)';

    document.getElementById('driver-name').textContent = driver?.full_name || 'Procurando motorista...';
    const carInfo = `${details?.car_model || ''} ${details?.car_color || ''}`.trim();
    document.getElementById('driver-car').textContent = carInfo || (isActive ? 'Veículo' : 'Aguarde um momento');
    document.getElementById('driver-plate').textContent = details?.license_plate || '';

    const callBtn = document.getElementById('call-driver-btn');
    const msgBtn = document.getElementById('message-driver-btn');
    callBtn.disabled = !driver?.phone_number;
    msgBtn.disabled = !driver?.phone_number;
}


function handleRideStateUpdate(ride) {
    if (!ride || !ride.status) return;
    
    const status = ride.status;
    renderTimeline(status);
    
    const destination = (ride.destinations && ride.destinations[0]) || 'N/A';
    updateTripDetails(ride.origin_address, destination);

    const cancelBtn = document.getElementById('cancel-ride-btn');
    if (['in_progress', 'completed', 'canceled'].includes(status)) {
        cancelBtn.classList.add('hidden');
    } else {
        cancelBtn.classList.remove('hidden');
    }

    if (ride.driver_id) {
        loadDriverInfo(ride.driver_id);
    } else {
        updateDriverPanel(null, null);
    }
}

// =============================================================================
// AUTHENTICATION FUNCTIONS
// =============================================================================
async function handleSignUp(fullName, email, phone, password) {
    showLoading('signup-btn');
    try {
        const { error } = await supabaseClient.auth.signUp({ 
            email, password, options: { data: { full_name: fullName, phone_number: phone, user_type: 'passenger' } } 
        });
        if (error) throw error;
        toast.show('Cadastro realizado! Verifique seu e-mail para ativar sua conta.', 'success');
        showScreen('login-screen');
    } catch (error) { toast.show('Erro no cadastro: ' + error.message, 'error');
    } finally { hideLoading('signup-btn'); }
}

async function handleSignIn(email, password) {
    showLoading('login-btn');
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.show('Login realizado com sucesso!', 'success');
    } catch (error) { toast.show('Erro no login: ' + error.message, 'error');
    } finally { hideLoading('login-btn'); }
}

async function handleSignOut() {
    try {
        if (state.rideSubscription) {
            supabaseClient.removeChannel(state.rideSubscription);
            state.rideSubscription = null;
        }
        stopRidePolling();
        await supabaseClient.auth.signOut();
        toast.show('Logout realizado com sucesso', 'success');
    } catch (error) {
        toast.show('Erro ao fazer logout: ' + error.message, 'error');
        handleAuthError();
    }
}

async function loadUserProfile(userId) {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
        if (error) throw error;
        if (!data) {
            console.error('Perfil não encontrado para o usuário:', userId);
            toast.show('Não foi possível carregar seu perfil. Por favor, tente novamente.', 'error');
            return handleSignOut();
        }
        state.profile = data;
        document.getElementById('welcome-message').textContent = `Olá, ${state.profile.full_name.split(' ')[0]}!`;
        await loadWalletBalance();
        await checkPaymentStatus();
        await checkPendingRide();
        showScreen('user-screen');
    } catch (error) { 
        console.error('❌ Erro ao carregar perfil:', error.message); 
        handleAuthError();
    }
}

// =============================================================================
// GOOGLE MAPS INTEGRATION
// =============================================================================
function initializeAutocomplete() {
    try {
        if (typeof google !== 'undefined' && google.maps && google.maps.places) {
            const options = { types: ['address'], componentRestrictions: { 'country': 'br' } };
            const originInput = document.getElementById('origin');
            const destinationInput = document.getElementById('destination');

            const originAutocomplete = new google.maps.places.Autocomplete(originInput, options);
            originAutocomplete.addListener('place_changed', () => {
                state.originPlace = originAutocomplete.getPlace();
                resetPriceEstimate();
            });

            const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, options);
            destinationAutocomplete.addListener('place_changed', () => {
                state.destinationPlace = destinationAutocomplete.getPlace();
                resetPriceEstimate();
            });
            
            originInput.addEventListener('input', resetPriceEstimate);
            destinationInput.addEventListener('input', resetPriceEstimate);
        } else {
            console.warn('Google Maps API not ready, retrying...');
            setTimeout(initializeAutocomplete, 1000);
        }
    } catch (error) { console.error('❌ Erro ao inicializar autocomplete:', error); }
}

function useCurrentLocation() {
    if (!navigator.geolocation) return toast.show('Geolocalização não suportada.', 'error');
    const originInput = document.getElementById('origin');
    originInput.value = 'Obtendo localização...';
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude: lat, longitude: lng } = position.coords;
            if (typeof google !== 'undefined') {
                const latLng = new google.maps.LatLng(lat, lng);
                new google.maps.Geocoder().geocode({ 'location': latLng }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        originInput.value = results[0].formatted_address;
                        state.originPlace = { geometry: { location: latLng } };
                        resetPriceEstimate();
                    } else {
                        toast.show('Não foi possível encontrar um endereço para sua localização.', 'warning');
                        originInput.value = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
                    }
                });
            }
        },
        () => {
            toast.show('Não foi possível obter sua localização.', 'error');
            originInput.value = '';
        }
    );
}

// =============================================================================
// PRICE CALCULATION FUNCTIONS
// =============================================================================
async function calculatePriceEstimate() {
    if (!state.originPlace || !state.destinationPlace) {
        return toast.show('Preencha origem e destino usando as sugestões.', 'warning');
    }
    
    showLoading('estimate-btn');
    
    try {
        const origin = state.originPlace.geometry.location;
        const destination = state.destinationPlace.geometry.location;

        const service = new google.maps.DistanceMatrixService();
        const { rows, status } = await service.getDistanceMatrix({
            origins: [origin],
            destinations: [destination],
            travelMode: 'DRIVING',
        });

        if (status !== 'OK' || !rows[0].elements[0].distance) {
            throw new Error('Não foi possível calcular a rota. Verifique os endereços.');
        }

        const distanceKm = rows[0].elements[0].distance.value / 1000;
        const timeMinutes = Math.round(rows[0].elements[0].duration.value / 60);

        const price = Math.max(
            PRICING_CONFIG.minimumFare,
            (PRICING_CONFIG.baseFare + (distanceKm * PRICING_CONFIG.pricePerKm) + (timeMinutes * PRICING_CONFIG.pricePerMinute)) * PRICING_CONFIG.surgePricing
        );

        state.currentEstimate = { total: price, distance: distanceKm, time: timeMinutes };
        displayPriceEstimate(state.currentEstimate);
        
    } catch (error) {
        console.error('Erro ao calcular estimativa:', error);
        toast.show(error.message, 'error');
    } finally {
        hideLoading('estimate-btn');
    }
}

function displayPriceEstimate(estimate) {
    const container = document.getElementById('price-estimate-container');
    container.classList.remove('hidden');
    
    document.getElementById('estimated-price').textContent = `R$ ${estimate.total.toFixed(2).replace('.', ',')}`;
    document.getElementById('estimated-time').textContent = `${estimate.time} min`;
    document.getElementById('estimated-distance').textContent = `${estimate.distance.toFixed(1).replace('.', ',')} km`;
    
    const requestBtn = document.getElementById('request-btn');
    requestBtn.disabled = false;
    requestBtn.textContent = `🚗 SOLICITAR (R$ ${estimate.total.toFixed(2).replace('.', ',')})`;
}

function resetPriceEstimate() {
    document.getElementById('price-estimate-container').classList.add('hidden');
    const requestBtn = document.getElementById('request-btn');
    requestBtn.disabled = true;
    requestBtn.textContent = '🚗 SOLICITAR';
    state.currentEstimate = null;
}

// =============================================================================
// RIDE MANAGEMENT & DATA FLOW
// =============================================================================
async function requestRide() {
    if (!state.currentEstimate) return toast.show('Calcule o preço primeiro.', 'warning');
    if (state.walletBalance < state.currentEstimate.total) return toast.show(`Saldo insuficiente! Adicione pelo menos R$ ${state.currentEstimate.total.toFixed(2).replace('.', ',')}.`, 'error');

    showLoading('request-btn');

    try {
        const rideData = {
            passenger_id: state.user.id,
            origin_address: document.getElementById('origin').value,
            origin_location: `POINT(${state.originPlace.geometry.location.lng()} ${state.originPlace.geometry.location.lat()})`,
            destinations: [document.getElementById('destination').value],
            status: 'requested',
            price: state.currentEstimate.total,
        };
        
        const { data, error } = await supabaseClient.from('rides').insert(rideData).select().single();
        if (error) throw error;

        state.currentRide = data;
        showRideStatus();
        handleRideStateUpdate(data);
        subscribeToRideUpdates(data.id);
        toast.show('Corrida solicitada! Procurando motorista...', 'success');
    } catch (error) {
        console.error('Ride Request Error:', error);
        toast.show('Erro ao solicitar corrida.', 'error');
    } finally {
        hideLoading('request-btn');
    }
}

async function checkPendingRide() {
    if (!state.user) return;
    try {
        const { data, error } = await supabaseClient.from('rides')
            .select('*').eq('passenger_id', state.user.id)
            .in('status', ['requested', 'assigned', 'accepted', 'in_progress'])
            .order('created_at', { ascending: false }).limit(1);
        if (error && error.code !== 'PGRST116') throw error;

        if (data && data.length > 0) {
            state.currentRide = data[0];
            showRideStatus();
            handleRideStateUpdate(state.currentRide);
            subscribeToRideUpdates(state.currentRide.id);
        } else {
            showRideRequestForm();
        }
    } catch (error) {
        console.error('❌ Erro em checkPendingRide:', error);
        showRideRequestForm();
    }
}

function startRidePolling() {
    stopRidePolling();
    state.ridePollInterval = setInterval(async () => {
        if (!state.currentRide) return stopRidePolling();
        const { data } = await supabaseClient.from('rides').select('*').eq('id', state.currentRide.id).single();
        if (data && JSON.stringify(data) !== JSON.stringify(state.currentRide)) {
            state.currentRide = data;
            handleRideStateUpdate(data);
        }
        if (!data || ['completed', 'canceled'].includes(data?.status)) {
            checkPendingRide();
        }
    }, 15000);
}

function stopRidePolling() {
    if (state.ridePollInterval) clearInterval(state.ridePollInterval);
    state.ridePollInterval = null;
}

function subscribeToRideUpdates(rideId) {
    if (state.rideSubscription) supabaseClient.removeChannel(state.rideSubscription);
    
    state.rideSubscription = supabaseClient
        .channel(`ride-${rideId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, 
        payload => {
            const updatedRide = payload.new;
            state.currentRide = updatedRide;
            handleRideStateUpdate(updatedRide);
            
            if (['completed', 'canceled'].includes(updatedRide.status)) {
                if (updatedRide.status === 'completed' && updatedRide.price) {
                    debitWallet(parseFloat(updatedRide.price), `Corrida #${updatedRide.id}`);
                    toast.show(`Corrida concluída!`, 'success');
                }
                setTimeout(() => {
                    state.currentRide = null;
                    showRideRequestForm();
                }, 5000);
            }
        })
        .subscribe();
}

async function loadDriverInfo(driverId) {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('full_name, phone_number').eq('id', driverId).single();
        if (error) throw error;
        const { data: details, error: detailsError } = await supabaseClient.from('driver_details').select('car_model, license_plate, car_color').eq('profile_id', driverId).single();
        if (detailsError) throw detailsError;
        
        updateDriverPanel(data, details);
    } catch (error) {
        console.error('❌ Erro ao carregar dados do motorista:', error.message);
    }
}

function updateTripDetails(origin, destination) {
    document.getElementById('trip-origin').textContent = origin;
    document.getElementById('trip-destination').textContent = destination;
}

async function cancelRide() {
    if (!state.currentRide || !confirm('Deseja cancelar esta viagem?')) return;
    try {
        const { error } = await supabaseClient.from('rides').update({ status: 'canceled' }).eq('id', state.currentRide.id);
        if (error) throw error;
        toast.show('Viagem cancelada.', 'success');
    } catch (error) { toast.show('Erro ao cancelar: ' + error.message, 'error'); }
}

// =============================================================================
// UI & ACTION TRIGGERS
// =============================================================================
function showRideRequestForm() {
    stopRidePolling();
    document.getElementById('ride-request-container')?.classList.remove('hidden');
    document.getElementById('ride-status-container')?.classList.add('hidden');
    resetPriceEstimate();
    document.getElementById('origin').value = '';
    document.getElementById('destination').value = '';
}

function showRideStatus() {
    startRidePolling();
    document.getElementById('ride-request-container')?.classList.add('hidden');
    document.getElementById('ride-status-container')?.classList.remove('hidden');
}

function callDriver() {
    // Implementar a chamada
}
function messageDriver() {
    // Implementar mensagem
}
function getHelp() {
    // Implementar ajuda
}

// =============================================================================
// WALLET FUNCTIONS
// =============================================================================
async function loadWalletBalance() {
    if (!state.user) return;
    try {
        const { data, error } = await supabaseClient.rpc('get_wallet_balance', { p_user_id: state.user.id });
        if (error) throw error;
        state.walletBalance = data || 0;
        document.getElementById('wallet-balance').textContent = `R$ ${state.walletBalance.toFixed(2).replace('.', ',')}`;
    } catch (error) {
        console.error('Erro ao carregar saldo:', error);
    }
}

async function addCredits() {
    toast.show('Funcionalidade de adicionar créditos em desenvolvimento.', 'info');
}

async function debitWallet(amount, description) {
    try {
        const { error } = await supabaseClient.from('wallet_transactions').insert({ profile_id: state.user.id, amount, transaction_type: 'debit', description });
        if (error) throw error;
        await loadWalletBalance();
    } catch (error) { console.error('Erro ao debitar carteira:', error); }
}

async function showTransactionHistory() {
    toast.show('Histórico em desenvolvimento.', 'info');
}

async function checkPaymentStatus() {
    // Implementar verificação de retorno de pagamento
}

// =============================================================================
// INITIALIZATION & EVENT LISTENERS
// =============================================================================
function initializeApp() {
    if (state.isInitializing) return;
    state.isInitializing = true;
    setupLoadingTimeout();
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
            state.user = session.user;
            loadUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
            state.user = state.profile = state.currentRide = null;
            stopRidePolling();
            if(state.rideSubscription) supabaseClient.removeChannel(state.rideSubscription);
            showScreen('login-screen');
        }
    });

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
            showScreen('login-screen');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleSignIn(e.target.elements['login-email'].value, e.target.elements['login-password'].value);
    });
    document.getElementById('signup-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleSignUp( e.target.elements['signup-fullname'].value, e.target.elements['signup-email'].value, e.target.elements['signup-phone'].value, e.target.elements['signup-password'].value );
    });

    initializeApp();
});

// Expose functions to global scope for HTML onclick attributes and callbacks
window.initializeAutocomplete = initializeAutocomplete;
window.forceReload = forceReload;
window.showScreen = showScreen;
window.handleSignOut = handleSignOut;
window.addCredits = addCredits;
window.showTransactionHistory = showTransactionHistory;
window.useCurrentLocation = useCurrentLocation;
window.calculatePriceEstimate = calculatePriceEstimate;
window.requestRide = requestRide;
window.cancelRide = cancelRide;
window.getHelp = getHelp;
window.callDriver = callDriver;
window.messageDriver = messageDriver;
