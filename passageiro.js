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
// RIDE STATUS UI MANAGEMENT (NEW UBER-LIKE STYLE)
// =============================================================================
const timelineConfig = {
    'requested': { icon: '⏳', text: 'Procurando motorista' },
    'assigned': { icon: '🎯', text: 'Motorista encontrado' },
    'accepted': { icon: '📍', text: 'Motorista no local' },
    'arrived_pickup': { icon: '🚗', text: 'Viagem em andamento' },
    'in_progress': { icon: '🏁', text: 'Viagem concluída' },
    'completed': { icon: '🏁', text: 'Viagem concluída' },
};
const statusOrder = ['requested', 'assigned', 'accepted', 'arrived_pickup', 'in_progress', 'completed'];

function renderTimeline(currentStatus) {
    const timelineContainer = document.getElementById('status-timeline');
    if (!timelineContainer) return;

    timelineContainer.innerHTML = '';
    const currentIndex = statusOrder.indexOf(currentStatus);

    // Special handling for the missing "Motorista a caminho" step
    const rideAccepted = currentIndex >= statusOrder.indexOf('accepted');

    // 1. Procurando motorista
    if(statusOrder.indexOf('requested') < statusOrder.length){
         const item = document.createElement('div');
        item.className = `timeline-item ${currentIndex >= 0 ? 'completed' : ''} ${currentStatus === 'requested' ? 'active' : ''}`;
        item.innerHTML = `<div class="timeline-icon">⏳</div><p class="timeline-text">Procurando motorista</p>`;
        timelineContainer.appendChild(item);
    }

    // 2. Motorista encontrado
     if(statusOrder.indexOf('assigned') < statusOrder.length){
        const item = document.createElement('div');
        item.className = `timeline-item ${currentIndex >= 1 ? 'completed' : ''} ${currentStatus === 'assigned' ? 'active' : ''}`;
        item.innerHTML = `<div class="timeline-icon">🎯</div><p class="timeline-text">Motorista encontrado</p>`;
        timelineContainer.appendChild(item);
     }
   
    // 3. Motorista a caminho (Virtual Step)
    if (currentIndex >= 1) { // Show if driver is assigned or further
        const item = document.createElement('div');
        item.className = `timeline-item ${rideAccepted ? 'completed' : 'active'}`;
        item.innerHTML = `<div class="timeline-icon">✅</div><p class="timeline-text">Motorista a caminho</p>`;
        timelineContainer.appendChild(item);
    }

    // 4. Motorista no local
    if (currentIndex >= 1) {
        const config = timelineConfig['accepted'];
        const item = document.createElement('div');
        item.className = `timeline-item ${currentIndex >= 3 ? 'completed' : ''} ${currentStatus === 'accepted' ? 'active' : ''}`;
        item.innerHTML = `<div class="timeline-icon">${config.icon}</div><p class="timeline-text">${config.text}</p>`;
        timelineContainer.appendChild(item);
    }

    // 5. Viagem em andamento
    if (currentIndex >= 2) {
        const config = timelineConfig['arrived_pickup'];
        const item = document.createElement('div');
        item.className = `timeline-item ${currentIndex >= 4 ? 'completed' : ''} ${currentStatus === 'arrived_pickup' ? 'active' : ''}`;
        item.innerHTML = `<div class="timeline-icon">${config.icon}</div><p class="timeline-text">${config.text}</p>`;
        timelineContainer.appendChild(item);
    }

    // 6. Viagem concluída
     if (currentIndex >= 3) {
        const config = timelineConfig['in_progress'];
        const item = document.createElement('div');
        item.className = `timeline-item ${currentIndex >= 5 ? 'completed' : ''} ${currentStatus === 'in_progress' || currentStatus === 'completed' ? 'active' : ''}`;
        item.innerHTML = `<div class="timeline-icon">${config.icon}</div><p class="timeline-text">${config.text}</p>`;
        timelineContainer.appendChild(item);
     }
}

function updateDriverPanel(driver, details) {
    const driverPanel = document.getElementById('driver-details-panel');
    if (!driverPanel) return;

    document.getElementById('driver-name').textContent = driver?.full_name || 'Motorista';
    const carInfo = `${details?.car_model || ''} ${details?.car_color || ''}`.trim();
    document.getElementById('driver-car').textContent = carInfo || 'Veículo';
    document.getElementById('driver-plate').textContent = details?.license_plate || '';

    const callBtn = document.getElementById('call-driver-btn');
    const msgBtn = document.getElementById('message-driver-btn');
    callBtn.disabled = !driver?.phone_number;
    msgBtn.disabled = !driver?.phone_number;

    driverPanel.classList.add('active');
}

function resetRideStatusUI() {
    const driverPanel = document.getElementById('driver-details-panel');
    if (driverPanel) {
        driverPanel.classList.remove('active');
        driverPanel.style.opacity = '0';
        driverPanel.style.transform = 'translateY(-1rem)';
        document.getElementById('driver-name').textContent = 'Procurando motorista...';
        document.getElementById('driver-car').textContent = 'Aguarde um momento';
        document.getElementById('driver-plate').textContent = '';
        document.getElementById('call-driver-btn').disabled = true;
        document.getElementById('message-driver-btn').disabled = true;
    }
    document.getElementById('status-timeline').innerHTML = '';
}

function handleRideStateUpdate(ride) {
    if (!ride || !ride.status) return;
    
    const status = ride.status;
    renderTimeline(status);
    
    // Update trip details card
    const destination = (ride.destinations && ride.destinations[0]) || 'N/A';
    updateTripDetails(ride.origin_address, destination, ride.created_at);

    // Manage cancel button visibility
    const cancelBtn = document.getElementById('cancel-ride-btn');
    if (['in_progress', 'completed', 'canceled'].includes(status)) {
        cancelBtn.classList.add('hidden');
    } else {
        cancelBtn.classList.remove('hidden');
    }

    // If driver is assigned, load info. Otherwise, show searching state.
    if (ride.driver_id) {
        loadDriverInfo(ride.driver_id);
    } else {
        updateDriverPanel(null, null); // Resets to "searching"
        document.getElementById('driver-details-panel').classList.add('active');
    }
}

// =============================================================================
// AUTHENTICATION FUNCTIONS
// =============================================================================
async function handleSignUp(fullName, email, phone, password) {
    showLoading('signup-btn');
    try {
        const { error } = await supabaseClient.auth.signUp({ 
            email, phone, password, options: { data: { full_name: fullName, user_type: 'passenger' } } 
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

async function handleSignInWithProvider(provider) {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({ provider });
        if (error) throw error;
    } catch (error) { toast.show(`Erro ao tentar login com ${provider}: ` + error.message, 'error'); }
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
            return handleSignOut(); // Sign out if profile is missing
        }
        state.profile = data;
        showScreen('user-screen'); // Show screen first
        document.getElementById('welcome-message').textContent = `Olá, ${state.profile.full_name}!`;
        await loadWalletBalance(); // Carregar saldo da carteira
        checkPaymentStatus(); // Verificar se voltou de um pagamento
        await checkPendingRide();
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
                const place = originAutocomplete.getPlace();
                if (place.geometry) {
                    state.originPlace = place;
                    resetPriceEstimate();
                } else {
                    state.originPlace = null;
                }
            });

            const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, options);
            destinationAutocomplete.addListener('place_changed', () => {
                const place = destinationAutocomplete.getPlace();
                if (place.geometry) {
                    state.destinationPlace = place;
                    resetPriceEstimate();
                } else {
                    state.destinationPlace = null;
                }
            });
            
            originInput.addEventListener('input', () => { 
                state.originPlace = null;
                resetPriceEstimate();
            });
            destinationInput.addEventListener('input', () => { 
                state.destinationPlace = null; 
                resetPriceEstimate();
            });
        } else {
            setTimeout(initializeAutocomplete, 1000);
        }
    } catch (error) { console.error('❌ Erro ao inicializar autocomplete:', error); }
}

function useCurrentLocation() {
    if (!navigator.geolocation) return toast.show('Geolocalização não suportada.', 'error');
    const originInput = document.getElementById('origin');
    originInput.value = 'Obtendo localização...';
    state.originPlace = null;
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude: lat, longitude: lng } = position.coords;
            if (typeof google !== 'undefined') {
                const latLng = new google.maps.LatLng(lat, lng);
                new google.maps.Geocoder().geocode({ 'location': latLng }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        originInput.value = results[0].formatted_address;
                        state.originPlace = {
                            formatted_address: results[0].formatted_address,
                            geometry: { location: latLng },
                            place_id: results[0].place_id
                        };
                        resetPriceEstimate();
                    } else {
                        const val = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
                        originInput.value = val;
                        state.originPlace = { 
                            formatted_address: val, 
                            geometry: { location: latLng } 
                        };
                        resetPriceEstimate();
                    }
                });
            } else {
                const val = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
                originInput.value = val;
                state.originPlace = { 
                    formatted_address: val, 
                    geometry: { location: { lat: () => lat, lng: () => lng } }
                };
                resetPriceEstimate();
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
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
             Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
             Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

function estimateTravelTime(distanceKm) {
    // Estimativa baseada em velocidade média urbana de 25 km/h
    const avgSpeedKmh = 25;
    const timeHours = distanceKm / avgSpeedKmh;
    return Math.round(timeHours * 60); // Convert to minutes
}

function calculateRidePrice(distanceKm, timeMinutes) {
    const baseFare = PRICING_CONFIG.baseFare;
    const distanceFare = distanceKm * PRICING_CONFIG.pricePerKm;
    const timeFare = timeMinutes * PRICING_CONFIG.pricePerMinute;
    const subtotal = (baseFare + distanceFare + timeFare) * PRICING_CONFIG.surgePricing;
    
    // Apply minimum fare
    const total = Math.max(subtotal, PRICING_CONFIG.minimumFare);
    
    return {
        baseFare: baseFare,
        distanceFare: distanceFare,
        timeFare: timeFare,
        total: total,
        distance: distanceKm,
        time: timeMinutes
    };
}

async function calculatePriceEstimate() {
    const originAddress = document.getElementById('origin').value.trim();
    const destinationAddress = document.getElementById('destination').value.trim();
    
    if (!originAddress || !destinationAddress) {
        return toast.show('Preencha origem e destino para calcular o preço.', 'warning');
    }
    
    showLoading('estimate-btn');
    
    try {
        // Verificar se temos os locais selecionados via Google Places
        if (!state.originPlace || !state.destinationPlace) {
            throw new Error('Selecione origem e destino usando as sugestões do mapa');
        }
        
        if (!state.originPlace.geometry || !state.destinationPlace.geometry) {
            throw new Error('Locais selecionados são inválidos. Tente novamente.');
        }
        
        // Extrair coordenadas dos locais selecionados
        let originCoords, destinationCoords;
        
        const originLoc = state.originPlace.geometry.location;
        originCoords = { 
            lat: typeof originLoc.lat === 'function' ? originLoc.lat() : originLoc.lat, 
            lng: typeof originLoc.lng === 'function' ? originLoc.lng() : originLoc.lng 
        };
        
        const destLoc = state.destinationPlace.geometry.location;
        destinationCoords = { 
            lat: typeof destLoc.lat === 'function' ? destLoc.lat() : destLoc.lat, 
            lng: typeof destLoc.lng === 'function' ? destLoc.lng() : destLoc.lng 
        };
        
        console.log('📏 Calculando distância entre:', {
            origem: state.originPlace.formatted_address,
            destino: state.destinationPlace.formatted_address,
            coords: { originCoords, destinationCoords }
        });
        
        const distance = calculateDistance(
            originCoords.lat, originCoords.lng,
            destinationCoords.lat, destinationCoords.lng
        );
        
        const estimatedTime = estimateTravelTime(distance);
        const priceEstimate = calculateRidePrice(distance, estimatedTime);
        
        // Salvar estimativa no estado
        state.currentEstimate = priceEstimate;
        
        // Exibir estimativa na interface
        displayPriceEstimate(priceEstimate);
        
        toast.show('Estimativa calculada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao calcular estimativa:', error);
        toast.show('Erro ao calcular estimativa de preço.', 'error');
    } finally {
        hideLoading('estimate-btn');
    }
}

function displayPriceEstimate(estimate) {
    const container = document.getElementById('price-estimate-container');
    const requestBtn = document.getElementById('request-btn');
    
    // Mostrar container de estimativa
    container.classList.remove('hidden');
    
    // Preencher valores
    document.getElementById('estimated-price').textContent = `R$ ${estimate.total.toFixed(2).replace('.', ',')}`;
    document.getElementById('estimated-time').textContent = `${estimate.time} min`;
    document.getElementById('estimated-distance').textContent = `${estimate.distance.toFixed(1).replace('.', ',')} km`;
    
    // Breakdown de preços
    document.getElementById('base-fare').textContent = `R$ ${estimate.baseFare.toFixed(2).replace('.', ',')}`;
    document.getElementById('distance-fare').textContent = `R$ ${estimate.distanceFare.toFixed(2).replace('.', ',')}`;
    document.getElementById('time-fare').textContent = `R$ ${estimate.timeFare.toFixed(2).replace('.', ',')}`;
    document.getElementById('total-estimate').textContent = `R$ ${estimate.total.toFixed(2).replace('.', ',')}`;
    
    // Habilitar botão de solicitar
    requestBtn.disabled = false;
    requestBtn.textContent = `🚗 SOLICITAR (R$ ${estimate.total.toFixed(2).replace('.', ',')})`;
}

function resetPriceEstimate() {
    const container = document.getElementById('price-estimate-container');
    const requestBtn = document.getElementById('request-btn');
    
    container.classList.add('hidden');
    requestBtn.disabled = true;
    requestBtn.textContent = '🚗 SOLICITAR';
    state.currentEstimate = null;
}

function calculateNewEstimate() {
    calculatePriceEstimate();
}

// =============================================================================
// RIDE MANAGEMENT & DATA FLOW
// =============================================================================
async function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        if (typeof google === 'undefined') return reject(new Error('Google Maps não carregado'));
        new google.maps.Geocoder().geocode({ address: address, componentRestrictions: { 'country': 'br' } }, (results, status) => {
            if (status === 'OK' && results[0]) {
                resolve(results[0]);
            } else {
                reject(new Error('Endereço não encontrado: ' + address));
            }
        });
    });
}

async function requestRide() {
    const originAddress = document.getElementById('origin').value;
    const destinationAddress = document.getElementById('destination').value;

    if (!state.user || !originAddress.trim() || !destinationAddress.trim()) {
        return toast.show('Preencha origem e destino.', 'warning');
    }

    if (!state.currentEstimate) {
        return toast.show('Calcule o preço da viagem primeiro.', 'warning');
    }
    
    // VERIFICAR SALDO MÍNIMO
    const estimatedPrice = state.currentEstimate.total;
    if (state.walletBalance < estimatedPrice) {
        toast.show(`Saldo insuficiente! Você precisa de pelo menos R$ ${estimatedPrice.toFixed(2).replace('.', ',')} para esta viagem.`, 'error');
        return;
    }

    showLoading('request-btn');

    try {
        let originResult = state.originPlace;
        if (!originResult || originResult.formatted_address !== originAddress) {
            originResult = await geocodeAddress(originAddress);
            state.originPlace = originResult;
        }

        let destinationResult = state.destinationPlace;
        if (!destinationResult || destinationResult.formatted_address !== destinationAddress) {
            destinationResult = await geocodeAddress(destinationAddress);
            state.destinationPlace = destinationResult;
        }

        const originCoords = originResult.geometry.location;
        const destinationCoords = destinationResult.geometry.location;

        const rideData = {
            passenger_id: state.user.id,
            origin_address: originResult.formatted_address,
            origin_location: `POINT(${originCoords.lng()} ${originCoords.lat()})`,
            destinations: [destinationResult.formatted_address],
            status: 'requested',
            price: state.currentEstimate.total, // <-- THE FIX IS HERE
        };
        
        const { data, error } = await supabaseClient
            .from('rides')
            .insert(rideData)
            .select()
            .single();

        if (error) throw error;

        state.currentRide = data;
        showRideStatus();
        handleRideStateUpdate(data);
        subscribeToRideUpdates(data.id);
        toast.show('Corrida solicitada! Procurando motorista...', 'success');
    } catch (error) {
        console.error('Ride Request Error:', error);
        toast.show('Erro ao solicitar corrida: ' + (error.message || 'Verifique os endereços.'), 'error');
    } finally {
        hideLoading('request-btn');
    }
}

async function checkPendingRide() {
    if (!state.user) return;
    try {
        const { data, error } = await supabaseClient.from('rides')
            .select('*').eq('passenger_id', state.user.id)
            .in('status', ['requested', 'assigned', 'accepted', 'arrived_pickup', 'in_progress'])
            .order('created_at', { ascending: false }).limit(1);
        if (error && error.code !== 'PGRST116') throw error;

        if (data && data.length > 0) {
            state.currentRide = data[0];
            console.log('🚗 Corrida pendente encontrada:', state.currentRide.id, state.currentRide.status);
            showRideStatus();
            handleRideStateUpdate(state.currentRide);
            subscribeToRideUpdates(state.currentRide.id);
        } else {
            showRideRequestForm();
        }
    } catch (error) {
        console.error('❌ Erro CRÍTICO em checkPendingRide:', error);
        showRideRequestForm();
    }
}

async function pollRideStatus() {
    if (!state.currentRide) return stopRidePolling();
    const { data } = await supabaseClient.from('rides')
        .select('status, driver_id').eq('id', state.currentRide.id).single();
    if (data && (data.status !== state.currentRide.status || data.driver_id !== state.currentRide.driver_id)) {
        console.log(`🔄 Polling detectou mudança! [Status: ${state.currentRide.status} -> ${data.status}]`);
        await checkPendingRide();
    }
     if (!data || ['completed', 'canceled'].includes(data.status)) {
        await checkPendingRide();
    }
}

function startRidePolling() {
    stopRidePolling();
    state.ridePollInterval = setInterval(pollRideStatus, 15000);
}
function stopRidePolling() {
    if (state.ridePollInterval) clearInterval(state.ridePollInterval);
    state.ridePollInterval = null;
}

function subscribeToRideUpdates(rideId) {
    if (state.rideSubscription) {
        supabaseClient.removeChannel(state.rideSubscription);
    }
    try {
        state.rideSubscription = supabaseClient
            .channel(`ride-${rideId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, 
            payload => {
                console.log('🔄 Real-time update:', payload.new);
                const updatedRide = payload.new;
                state.currentRide = { ...state.currentRide, ...updatedRide };
                handleRideStateUpdate(state.currentRide);
                
                if (['completed', 'canceled'].includes(updatedRide.status)) {
                    stopRidePolling();
                    if(state.rideSubscription) supabaseClient.removeChannel(state.rideSubscription);
                    state.rideSubscription = null;
                    
                    // DEBITAR VALOR DA CORRIDA SE COMPLETADA
                    if (updatedRide.status === 'completed' && updatedRide.price) {
                        const ridePrice = parseFloat(updatedRide.price);
                        debitWallet(ridePrice, `Corrida #${updatedRide.id} - ${updatedRide.origin_address} → ${updatedRide.destinations[0]}`);
                        toast.show(`Corrida concluída! R$ ${ridePrice.toFixed(2)} debitado da sua carteira.`, 'success');
                    }
                    
                    setTimeout(() => {
                        state.currentRide = null;
                        showRideRequestForm();
                    }, 5000);
                }
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') console.log(`✅ Conectado ao canal da corrida ${rideId}!`);
                if (status === 'CHANNEL_ERROR') setTimeout(() => subscribeToRideUpdates(rideId), 3000);
            });
    } catch (error) { console.error('❌ Erro ao criar subscription:', error); }
}

async function loadDriverInfo(driverId) {
    if (!driverId) return;
    try {
        const { data, error } = await supabaseClient.from('profiles')
            .select('full_name, phone_number').eq('id', driverId).single();
        if (error) throw error;
        const { data: details, error: detailsError } = await supabaseClient.from('driver_details')
            .select('car_model, license_plate, car_color').eq('profile_id', driverId).single();
        if (detailsError) throw detailsError;
        
        state.currentRide.driver = data;
        state.currentRide.driver_details = details;
        updateDriverPanel(data, details);
    } catch (error) {
        console.error('❌ Erro ao carregar dados do motorista:', error.message);
        updateDriverPanel({ full_name: 'Erro ao carregar' }, {});
    }
}

function updateTripDetails(origin, destination, createdAt) {
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
    resetRideStatusUI();
    document.getElementById('ride-request-container')?.classList.remove('hidden');
    document.getElementById('ride-status-container')?.classList.add('hidden');
}

function showRideStatus() {
    startRidePolling();
    document.getElementById('ride-request-container')?.classList.add('hidden');
    document.getElementById('ride-status-container')?.classList.remove('hidden');
}

function callDriver() {
    if (state.currentRide?.driver?.phone_number) {
        window.open(`tel:+55${state.currentRide.driver.phone_number.replace(/\D/g, '')}`, '_self');
    } else { toast.show('Número do motorista não disponível', 'warning'); }
}

function messageDriver() {
    if (state.currentRide?.driver?.phone_number) {
        const phone = state.currentRide.driver.phone_number.replace(/\D/g, '');
        const text = encodeURIComponent('Olá! Sobre a nossa viagem.');
        window.open(`https://wa.me/55${phone}?text=${text}`, '_blank');
    } else { toast.show('Número do motorista não disponível', 'warning'); }
}

function getHelp() {
    window.open('https://wa.me/5511999999999?text=Preciso de ajuda com minha corrida', '_blank');
}

// =============================================================================
// STRIPE & WALLET FUNCTIONS - ÚNICA ALTERAÇÃO: USAR STRIPE REAL
// =============================================================================
const STRIPE_PUBLIC_KEY = 'pk_test_51SEJCBFyO4P04Uv0YubWfXu6UD8rmVBuA1AGNlygxvLTTivCfdnmaAewkyT7H1mfgMBuOJhpvPPbraIC2iIMO8OG00KHO8HO7v';
const stripe = Stripe(STRIPE_PUBLIC_KEY);

// Carregar saldo da carteira
async function loadWalletBalance() {
    if (!state.user) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('wallet_transactions')
            .select('amount, transaction_type')
            .eq('profile_id', state.user.id);
        
        if (error) throw error;
        
        let balance = 0;
        if (data) {
            data.forEach(transaction => {
                if (transaction.transaction_type === 'credit') {
                    balance += parseFloat(transaction.amount);
                } else if (transaction.transaction_type === 'debit') {
                    balance -= parseFloat(transaction.amount);
                }
            });
        }
        
        document.getElementById('wallet-balance').textContent = 
            `R$ ${balance.toFixed(2).replace('.', ',')}`;
        state.walletBalance = balance;
        
    } catch (error) {
        console.error('Erro ao carregar saldo:', error);
        toast.show('Erro ao carregar saldo da carteira', 'error');
    }
}

// ========================================
// ÚNICA ALTERAÇÃO: USAR STRIPE REAL AQUI
// ========================================
async function addCredits() {
    const amount = prompt('Quanto você deseja adicionar? (ex: 50)');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        toast.show('Valor inválido', 'error');
        return;
    }

    try {
        toast.show('Redirecionando para pagamento...', 'info');
        
        const requestData = {
            amount: parseFloat(amount),
            userId: state.user.id,
            userEmail: state.user.email || state.profile?.email || 'usuario@exemplo.com'
        };
        
        console.log('📤 Enviando dados para Netlify Function:', requestData);
        
        // USANDO SUA NETLIFY FUNCTION REAL
        const response = await fetch('/.netlify/functions/stripe-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        console.log('📥 Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Response error:', errorText);
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }

        const responseData = await response.json();
        console.log('✅ Response data:', responseData);

        const { sessionId, url } = responseData;
        
        if (!sessionId && !url) {
            throw new Error('Session ID ou URL não recebidos do servidor');
        }
        
        // Redirecionar para o Stripe Checkout usando a URL direta ou sessionId
        if (url) {
            window.location.href = url;
        } else {
            const result = await stripe.redirectToCheckout({ sessionId });
            if (result.error) {
                throw new Error(result.error.message);
            }
        }

    } catch (error) {
        console.error('❌ Erro ao processar pagamento:', error);
        toast.show(`Erro: ${error.message}. Função real do Stripe não está disponível.`, 'error');
    }
}
// ========================================
// FIM DA ÚNICA ALTERAÇÃO
// ========================================

// Debitar valor da carteira
async function debitWallet(amount, description) {
    try {
        const { error } = await supabaseClient
            .from('wallet_transactions')
            .insert({
                profile_id: state.user.id,
                amount: amount,
                transaction_type: 'debit',
                description: description,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        loadWalletBalance();
        return true;

    } catch (error) {
        console.error('Erro ao debitar carteira:', error);
        return false;
    }
}

// Verificar se tem saldo suficiente
function hasEnoughBalance(amount) {
    return state.walletBalance >= amount;
}

// Mostrar histórico de transações
async function showTransactionHistory() {
    try {
        const { data, error } = await supabaseClient
            .from('wallet_transactions')
            .select('*')
            .eq('profile_id', state.user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        let html = '<div class="space-y-2">';
        if (data && data.length > 0) {
            data.forEach(transaction => {
                const date = new Date(transaction.created_at).toLocaleString('pt-BR');
                const amount = parseFloat(transaction.amount).toFixed(2).replace('.', ',');
                const type = transaction.transaction_type === 'credit' ? '+' : '-';
                const color = transaction.transaction_type === 'credit' ? 'text-green-400' : 'text-red-400';
                
                html += `
                            <div class="bg-gray-800 p-3 rounded-lg">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="font-semibold">${transaction.description}</p>
                                        <p class="text-xs text-gray-400">${date}</p>
                                    </div>
                                    <p class="${color} font-bold">${type} R$ ${amount}</p>
                                </div>
                            </div>
                        `;
            });
        } else {
            html += '<p class="text-center text-gray-400">Nenhuma transação encontrada</p>';
        }
        html += '</div>';

        // Criar modal simples
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;';
        modal.innerHTML = `
                    <div style="background: #1f2937; padding: 24px; border-radius: 16px; max-width: 500px; width: 100%; max-height: 80vh; overflow-y: auto;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 style="font-size: 20px; font-weight: bold; color: white;">Histórico de Transações</h3>
                            <button onclick="this.closest('div').parentElement.remove()" style="color: white; font-size: 24px; background: none; border: none; cursor: pointer;">&times;</button>
                        </div>
                        ${html}
                    </div>
                `;
        document.body.appendChild(modal);

    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        toast.show('Erro ao carregar histórico', 'error');
    }
}

// Verificar pagamento bem-sucedido na URL
async function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success' && sessionId) {
        toast.show('Pagamento realizado com sucesso! Aguarde a confirmação...', 'success');
        
        // Recarregar saldo após alguns segundos (o webhook deve ter processado)
        setTimeout(() => {
            loadWalletBalance();
        }, 3000);
        
        // Limpar URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'cancel') {
        toast.show('Pagamento cancelado', 'warning');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// =============================================================================
// INITIALIZATION & EVENT LISTENERS
// =============================================================================
function initializeApp() {
    if (state.isInitializing) return;
    state.isInitializing = true;
    setupLoadingTimeout();
    
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            state.user = session.user;
            loadUserProfile(session.user.id);
        } else {
            showScreen('login-screen');
        }
    }).catch(error => {
        console.error("❌ Erro ao verificar sessão:", error);
        handleAuthError();
    }).finally(() => { state.isInitializing = false; });
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
    document.getElementById('ride-request-form').addEventListener('submit', (e) => {
        e.preventDefault();
        requestRide();
    });

    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('🔐 AUTH STATE CHANGE:', event);
        if (event === 'SIGNED_IN' && session) {
            state.user = session.user;
            loadUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
            state.user = state.profile = state.currentRide = null;
            stopRidePolling();
            if(state.rideSubscription) {
                supabaseClient.removeChannel(state.rideSubscription);
                state.rideSubscription = null;
            }
            showScreen('login-screen');
        }
    });

    initializeApp();
    setTimeout(initializeAutocomplete, 1500);
});
