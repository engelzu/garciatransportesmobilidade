// @ts-nocheck

const SUPABASE_URL = 'https://emhxlsmukcwgukcsxhrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaHhsc211a2N3Z3VrY3N4aHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjU4NDAsImV4cCI6MjA3NDYwMTg0MH0.iqUWK2wJHuofA76u3wjbT1DBN_m3dqz60vPZ-dF9wYM';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const STRIPE_PUBLIC_KEY = 'pk_test_51SEJCBFyO4P04Uv0YubWfXu6UD8rmVBuA1AGNlygxvLTTivCfdnmaAewkyT7H1mfgMBuOJhpvPPbraIC2iIMO8OG00KHO8HO7v';
const stripe = Stripe(STRIPE_PUBLIC_KEY);


const state = { 
    user: null, 
    profile: null, 
    currentRide: null, 
    rideSubscription: null,
    driverLocationSubscription: null,
    isInitializing: false,
    originPlace: null,
    destinationPlace: null,
    currentEstimate: null,
    walletBalance: 0,
    // Map state
    mapInstance: null,
    passengerMarker: null,
    driverMarker: null,
};

// --- CONFIGURAÇÕES ---
const PRICING_CONFIG = {
    baseFare: 5.50, pricePerKm: 2.20, pricePerMinute: 0.35, minimumFare: 8.00, surgePricing: 1.0,
};
const MAP_STYLES = [ // Dark map style
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] }, { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] }, { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] }, { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] }, { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] }, { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] }, { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] }, { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] }, { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] }, { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] }, { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] }, { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] }, { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] }, { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }, { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] }, { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
];
const CAR_ICON_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" fill="white"/><circle cx="12" cy="12" r="10" fill="black" fill-opacity="0.2"/></svg>';


// =============================================================================
// TOAST & UTILITIES
// =============================================================================
class ToastManager {
    constructor() { this.container = document.getElementById('toast-container'); }
    show(message, type = 'info', duration = 4000) {
        if (!this.container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
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
    document.getElementById(screenId)?.classList.add('active');
}

function showLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    if(btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
}

function hideLoading(buttonId) {
    const btn = document.getElementById(buttonId);
    if(btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
}

// =============================================================================
// AUTHENTICATION
// =============================================================================
async function handleSignIn(email, password) {
    showLoading('login-btn');
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
    } catch (error) { toast.show('Erro no login: ' + error.message, 'error');
    } finally { hideLoading('login-btn'); }
}

async function handleSignInWithProvider(provider) {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({ provider });
        if (error) throw error;
    } catch (error) { toast.show(`Erro no login com ${provider}: ` + error.message, 'error'); }
}

async function handleSignUp(fullName, email, phone, password) {
    showLoading('signup-btn');
    try {
        const { error } = await supabaseClient.auth.signUp({ 
            email, password, options: { data: { full_name: fullName, phone_number: phone, user_type: 'passenger' } } 
        });
        if (error) throw error;
        toast.show('Cadastro realizado! Verifique seu e-mail.', 'success');
        showScreen('login-screen');
    } catch (error) { toast.show('Erro no cadastro: ' + error.message, 'error');
    } finally { hideLoading('signup-btn'); }
}

async function handleSignOut() {
    await supabaseClient.auth.signOut();
}

async function loadUserProfile(userId) {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
        if (error || !data) throw error || new Error('Perfil não encontrado.');
        state.profile = data;
        document.getElementById('welcome-message').textContent = `Olá, ${state.profile.full_name.split(' ')[0]}!`;
        await loadWalletBalance();
        await checkPaymentStatus();
        await checkPendingRide();
    } catch (error) { 
        console.error('❌ Erro ao carregar perfil:', error.message); 
        handleSignOut();
    }
}

// =============================================================================
// MAP & LOCATION
// =============================================================================
function initializeMap(originCoords) {
    const mapContainer = document.getElementById('map-container');
    if (state.mapInstance || !mapContainer) return;

    mapContainer.classList.remove('hidden');

    try {
        state.mapInstance = new google.maps.Map(mapContainer, {
            center: originCoords,
            zoom: 15,
            disableDefaultUI: true,
            styles: MAP_STYLES,
        });

        state.passengerMarker = new google.maps.Marker({
            position: originCoords,
            map: state.mapInstance,
            title: 'Você está aqui',
        });
        
        // This is the key to fix the gray box issue on dynamic elements
        setTimeout(() => {
             google.maps.event.trigger(state.mapInstance, 'resize');
             state.mapInstance.setCenter(originCoords);
        }, 100);

    } catch(e) {
        console.error("Map initialization failed:", e);
        toast.show("Não foi possível carregar o mapa.", "error");
    }
}

function updateDriverOnMap(driverLocation) {
    if (!state.mapInstance) return;

    const driverCoords = { lat: driverLocation.lat, lng: driverLocation.lng };

    if (!state.driverMarker) {
        state.driverMarker = new google.maps.Marker({
            position: driverCoords,
            map: state.mapInstance,
            title: "Motorista",
            icon: {
                url: CAR_ICON_SVG,
                anchor: new google.maps.Point(16, 16),
            },
        });
    } else {
        state.driverMarker.setPosition(driverCoords);
    }

    // Adjust map view to show both markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(state.passengerMarker.getPosition());
    bounds.extend(state.driverMarker.getPosition());
    state.mapInstance.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
}

function cleanupMap() {
    const mapContainer = document.getElementById('map-container');
    if(mapContainer) {
        mapContainer.classList.add('hidden');
        mapContainer.innerHTML = '';
    }
    state.mapInstance = null;
    state.passengerMarker = null;
    state.driverMarker = null;
}

// =============================================================================
// RIDE MANAGEMENT
// =============================================================================
async function checkPendingRide() {
    if (!state.user) return;
    try {
        const { data, error } = await supabaseClient.from('rides')
            .select('*').eq('passenger_id', state.user.id)
            .in('status', ['requested', 'assigned', 'accepted', 'in_progress'])
            .maybeSingle();
        if (error) throw error;

        if (data) {
            state.currentRide = data;
            showRideStatus();
            handleRideStateUpdate(state.currentRide);
            subscribeToRideUpdates(state.currentRide.id);
        } else {
            showRideRequestForm();
            showScreen('user-screen'); // <-- THIS WAS THE MISSING LINE
        }
    } catch (error) {
        console.error('❌ Erro em checkPendingRide:', error);
        showRideRequestForm();
    }
}

function handleRideStateUpdate(ride) {
    if (!ride || !ride.status) return;
    
    const statusMessages = {
        'requested': 'Procurando motorista...',
        'assigned': 'Motorista a caminho!',
        'accepted': 'Motorista chegou!',
        'in_progress': 'Viagem em andamento...',
        'completed': 'Viagem Concluída!',
        'canceled': 'Viagem Cancelada.',
    };
    document.getElementById('ride-status-message').textContent = statusMessages[ride.status] || 'Aguardando...';

    const cancelBtn = document.getElementById('cancel-ride-btn');
    if (['in_progress', 'completed', 'canceled'].includes(ride.status)) {
        cancelBtn.classList.add('hidden');
    } else {
        cancelBtn.classList.remove('hidden');
    }
    
    if (ride.driver_id) {
        loadDriverInfo(ride.driver_id);
        subscribeToDriverLocationUpdates(ride.driver_id);
    }

    if (ride.status === 'assigned' && !state.mapInstance) {
        const [lng, lat] = ride.origin_location.match(/-?\d+\.?\d+/g).map(parseFloat);
        initializeMap({ lat, lng });
    }
}

async function loadDriverInfo(driverId) {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('full_name').eq('id', driverId).single();
        if (error) throw error;
        const { data: details, error: detailsError } = await supabaseClient.from('driver_details').select('car_model, license_plate, car_color, selfie_with_id_url').eq('profile_id', driverId).single();
        if (detailsError) throw detailsError;
        
        document.getElementById('driver-name').textContent = data.full_name;
        document.getElementById('driver-car').textContent = `${details.car_model} (${details.car_color})`;
        document.getElementById('driver-plate').textContent = details.license_plate;
        const avatar = document.getElementById('driver-avatar');
        avatar.src = details.selfie_with_id_url || '';
        avatar.classList.remove('hidden');

    } catch (error) {
        console.error('❌ Erro ao carregar dados do motorista:', error.message);
    }
}

function subscribeToRideUpdates(rideId) {
    if (state.rideSubscription) supabaseClient.removeChannel(state.rideSubscription);
    
    state.rideSubscription = supabaseClient
        .channel(`ride-${rideId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, 
        payload => {
            const updatedRide = payload.new;
            state.currentRide = updatedRide;
            handleRideStateUpdate(updatedRide);
            
            if (['completed', 'canceled'].includes(updatedRide.status)) {
                if (updatedRide.status === 'completed' && updatedRide.price) {
                    toast.show(`Corrida concluída!`, 'success');
                }
                setTimeout(() => showRideRequestForm(), 3000);
            }
        })
        .subscribe();
}

function subscribeToDriverLocationUpdates(driverId) {
    if(state.driverLocationSubscription) return;

    state.driverLocationSubscription = supabaseClient
        .channel(`driver-location-${driverId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'driver_details', filter: `profile_id=eq.${driverId}`},
        payload => {
            const locationString = payload.new.current_location;
            if (locationString) {
                 const [lng, lat] = locationString.match(/-?\d+\.?\d+/g).map(parseFloat);
                 updateDriverOnMap({lat, lng});
            }
        })
        .subscribe();
}

function cleanupRideSubscriptions() {
    if (state.rideSubscription) {
        supabaseClient.removeChannel(state.rideSubscription);
        state.rideSubscription = null;
    }
     if (state.driverLocationSubscription) {
        supabaseClient.removeChannel(state.driverLocationSubscription);
        state.driverLocationSubscription = null;
    }
    state.currentRide = null;
}

// =============================================================================
// PRICE & REQUEST
// =============================================================================
function calculatePriceEstimate() {
    if (!state.originPlace || !state.destinationPlace) {
        return toast.show('Preencha origem e destino usando as sugestões.', 'warning');
    }
    showLoading('estimate-btn');
    
    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix({
        origins: [state.originPlace.geometry.location],
        destinations: [state.destinationPlace.geometry.location],
        travelMode: 'DRIVING',
    }, (response, status) => {
        hideLoading('estimate-btn');
        if (status !== 'OK') {
            if (status === 'REQUEST_DENIED') {
                return toast.show('Cálculo bloqueado. Ative a "Distance Matrix API" no painel do Google Cloud.', 'error');
            }
            return toast.show(`Erro ao buscar rota: ${status}`, 'error');
        }

        const element = response.rows[0].elements[0];
        if (element.status !== 'OK') {
             return toast.show('Não foi possível encontrar uma rota entre os locais selecionados.', 'error');
        }

        const distanceKm = element.distance.value / 1000;
        const timeMinutes = Math.round(element.duration.value / 60);
        const price = Math.max( PRICING_CONFIG.minimumFare, (PRICING_CONFIG.baseFare + (distanceKm * PRICING_CONFIG.pricePerKm) + (timeMinutes * PRICING_CONFIG.pricePerMinute)) * PRICING_CONFIG.surgePricing );
        
        state.currentEstimate = { total: price, distance: distanceKm, time: timeMinutes };
        
        const container = document.getElementById('price-estimate-container');
        container.classList.remove('hidden');
        document.getElementById('estimated-price').textContent = `R$ ${price.toFixed(2).replace('.', ',')}`;
        document.getElementById('estimated-time').textContent = `${timeMinutes} min`;
        document.getElementById('estimated-distance').textContent = `${distanceKm.toFixed(1)} km`;
        document.getElementById('request-btn').disabled = false;
    });
}

async function requestRide() {
    if (!state.currentEstimate) return toast.show('Calcule o preço primeiro.', 'warning');
    if (state.walletBalance < state.currentEstimate.total) return toast.show(`Saldo insuficiente!`, 'error');

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
        const { data: newRide, error } = await supabaseClient.from('rides').insert(rideData).select().single();
        if (error) throw error;
        
        // Update state and UI immediately
        state.currentRide = newRide;
        showRideStatus();
        handleRideStateUpdate(newRide);
        subscribeToRideUpdates(newRide.id);
        toast.show('Corrida solicitada! Procurando motorista...', 'info');

    } catch (error) { 
        toast.show('Erro ao solicitar corrida.', 'error');
        showRideRequestForm(); // Go back to form on failure
    } finally { 
        hideLoading('request-btn'); 
    }
}

async function cancelRide() {
    if (!state.currentRide || !confirm('Deseja cancelar esta viagem?')) return;
    try {
        await supabaseClient.from('rides').update({ status: 'canceled' }).eq('id', state.currentRide.id);
        toast.show('Viagem cancelada.', 'success');
        showRideRequestForm(); // Immediately reset UI
    } catch (error) { toast.show('Erro ao cancelar.', 'error'); }
}

// =============================================================================
// UI TRIGGERS
// =============================================================================
function showRideRequestForm() {
    cleanupRideSubscriptions();
    cleanupMap();

    const requestContainer = document.getElementById('ride-request-container');
    const statusContainer = document.getElementById('ride-status-container');
    requestContainer.classList.remove('hidden');
    statusContainer.classList.add('hidden');
    
    document.getElementById('origin').value = '';
    document.getElementById('destination').value = '';
    document.getElementById('price-estimate-container').classList.add('hidden');
    document.getElementById('request-btn').disabled = true;
    
    state.originPlace = null;
    state.destinationPlace = null;
    state.currentEstimate = null;
}

function showRideStatus() {
    document.getElementById('ride-request-container').classList.add('hidden');
    document.getElementById('ride-status-container').classList.remove('hidden');
    showScreen('user-screen');
}


// =============================================================================
// WALLET - RESTORED TO ORIGINAL WORKING LOGIC
// =============================================================================
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
        
        state.walletBalance = balance;
        document.getElementById('wallet-balance').textContent = `R$ ${balance.toFixed(2).replace('.', ',')}`;

    } catch (error) {
        console.error('Erro ao carregar saldo:', error);
        toast.show('Não foi possível carregar o saldo da carteira.', 'error');
    }
}


async function addCredits() {
    const amount = prompt('Quanto você deseja adicionar? (ex: 50)');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        return toast.show('Valor inválido', 'error');
    }

    showLoading('add-credits-btn');
    toast.show('Redirecionando para pagamento...', 'info');

    try {
        const response = await fetch('/.netlify/functions/stripe-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(amount),
                userId: state.user.id,
                userEmail: state.user.email,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro do servidor: ${errorText}`);
        }

        const { sessionId, url } = await response.json();
        
        if (url) {
            window.location.href = url;
        } else if (sessionId) {
            const { error } = await stripe.redirectToCheckout({ sessionId });
            if (error) throw error;
        } else {
            throw new Error('Resposta do servidor inválida.');
        }

    } catch (error) {
        console.error('Erro ao processar pagamento:', error);
        toast.show(`Erro no pagamento: ${error.message}`, 'error');
        hideLoading('add-credits-btn');
    }
}

async function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
        toast.show('Pagamento bem-sucedido! Atualizando saldo...', 'success');
        setTimeout(() => {
            loadWalletBalance();
        }, 2000); // Wait 2s for webhook to potentially complete
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'cancel') {
        toast.show('Pagamento cancelado.', 'warning');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}


// =============================================================================
// INITIALIZATION
// =============================================================================
function initializeApp() {
    if (state.isInitializing) return;
    state.isInitializing = true;
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
            state.user = session.user;
            loadUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
            state.user = state.profile = null;
            cleanupRideSubscriptions();
            showScreen('login-screen');
        }
    });

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (!session) showScreen('login-screen');
    });
}

function initializeAutocomplete() {
    try {
        const options = { types: ['address'], componentRestrictions: { 'country': 'br' } };
        const originInput = document.getElementById('origin');
        const destinationInput = document.getElementById('destination');

        const originAutocomplete = new google.maps.places.Autocomplete(originInput, options);
        originAutocomplete.addListener('place_changed', () => { state.originPlace = originAutocomplete.getPlace(); });

        const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, options);
        destinationAutocomplete.addListener('place_changed', () => { state.destinationPlace = destinationAutocomplete.getPlace(); });
        
    } catch (error) { console.error('❌ Erro ao inicializar autocomplete:', error); }
}

function useCurrentLocation() {
    if (!navigator.geolocation) return toast.show('Geolocalização não suportada.', 'error');
    
    document.getElementById('origin').value = 'Obtendo localização...';
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude: lat, longitude: lng } = position.coords;
            const latLng = new google.maps.LatLng(lat, lng);
            
            new google.maps.Geocoder().geocode({ 'location': latLng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    document.getElementById('origin').value = results[0].formatted_address;
                    state.originPlace = {
                        formatted_address: results[0].formatted_address,
                        geometry: { location: latLng },
                    };
                }
            });
        },
        () => {
            toast.show('Não foi possível obter sua localização.', 'error');
            document.getElementById('origin').value = '';
        }
    );
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
    initializeAutocomplete();
});

// Expose functions to global scope
window.showScreen = showScreen;
window.handleSignOut = handleSignOut;
window.addCredits = addCredits;
window.useCurrentLocation = useCurrentLocation;
window.calculatePriceEstimate = calculatePriceEstimate;
window.requestRide = requestRide;
window.cancelRide = cancelRide;
window.handleSignInWithProvider = handleSignInWithProvider; // Make sure this is exposed