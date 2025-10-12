// @ts-nocheck

const SUPABASE_URL = 'https://emhxlsmukcwgukcsxhrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaHhsc211a2N3Z3VrY3N4aHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjU4NDAsImV4cCI6MjA3NDYwMTg0MH0.iqUWK2wJHuofA76u3wjbT1DBN_m3dqz60vPZ-dF9wYM';

// CORREÇÃO: Acessa a função createClient diretamente do objeto global 'supabase'
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    user: null,
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
    if (typeof value !== 'number') return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showContentLoading() { document.getElementById('loading-indicator').classList.remove('hidden'); }
function hideContentLoading() { document.getElementById('loading-indicator').classList.add('hidden'); }


// --- AUTHENTICATION ---

async function handleLogin(email, password) {
    showLoading('login-btn');
    try {
        const { data: { user }, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!user) throw new Error('Usuário não encontrado.');

        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('user_type')
            .eq('id', user.id)
            .single();

        if (profileError || profile?.user_type !== 'admin') {
            await supabaseClient.auth.signOut();
            throw new Error('Acesso negado. Apenas administradores.');
        }

        state.user = user;
        toast.show('Login bem-sucedido!', 'success');
        initializeApp();

    } catch (error) {
        console.error('Login error:', error);
        toast.show(error.message, 'error');
    } finally {
        hideLoading('login-btn');
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    state.user = null;
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    toast.show('Você saiu da sua conta.', 'info');
}

// --- VIEW MANAGEMENT ---

const views = {
    'dashboard-view': { title: 'Dashboard', loader: loadDashboardData },
    'drivers-view': { title: 'Motoristas', loader: loadDriversData },
    'rides-view': { title: 'Corridas', loader: loadRidesData },
    'settings-view': { title: 'Configurações', loader: loadSettingsData },
};

async function showView(viewId) {
    if (!views[viewId]) return;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('bg-gray-800', 'text-white'));
    
    showContentLoading();
    
    const viewElement = document.getElementById(viewId);
    const linkElement = document.querySelector(`.nav-link[data-view="${viewId}"]`);
    
    if (linkElement) {
        linkElement.classList.add('bg-gray-800', 'text-white');
    }
    document.getElementById('view-title').textContent = views[viewId].title;

    await views[viewId].loader();
    
    hideContentLoading();
    viewElement.classList.add('active');
}

// --- DATA LOADERS & RENDERERS ---

// Dashboard
async function loadDashboardData() {
    const { data: ridesData, error: ridesError } = await supabaseClient
        .from('rides')
        .select('price, platform_fee, driver_earnings')
        .eq('status', 'completed');

    const { count: driverCount, error: driverError } = await supabaseClient
        .from('driver_details')
        .select('*', { count: 'exact' })
        .eq('approval_status', 'approved');
        
    const { count: pendingDriverCount, error: pendingDriverError } = await supabaseClient
        .from('driver_details')
        .select('*', { count: 'exact' })
        .eq('approval_status', 'pending');

    if (ridesError || driverError || pendingDriverError) {
        toast.show('Erro ao carregar dados do dashboard.', 'error');
        return;
    }

    const totalRevenue = ridesData.reduce((sum, ride) => sum + (ride.price || 0), 0);
    const platformEarnings = ridesData.reduce((sum, ride) => sum + (ride.platform_fee || 0), 0);
    const driverPayouts = ridesData.reduce((sum, ride) => sum + (ride.driver_earnings || 0), 0);
    
    const stats = [
        { label: 'Receita Total', value: formatCurrency(totalRevenue), icon: '💰' },
        { label: 'Ganhos da Plataforma', value: formatCurrency(platformEarnings), icon: '🏢' },
        { label: 'Repasse a Motoristas', value: formatCurrency(driverPayouts), icon: '🚗' },
        { label: 'Corridas Concluídas', value: ridesData.length, icon: '🏁' },
        { label: 'Motoristas Ativos', value: driverCount, icon: '👥' },
        { label: 'Aprovações Pendentes', value: pendingDriverCount, icon: '⏳' },
    ];
    
    renderDashboard(stats);
}

function renderDashboard(stats) {
    const container = document.getElementById('dashboard-stats');
    container.innerHTML = stats.map(stat => `
        <div class="bg-gray-800 p-6 rounded-xl">
            <div class="flex items-center gap-4">
                <div class="text-3xl">${stat.icon}</div>
                <div>
                    <p class="text-gray-400 text-sm">${stat.label}</p>
                    <p class="text-2xl font-bold text-white">${stat.value}</p>
                </div>
            </div>
        </div>
    `).join('');
}


// Drivers
async function loadDriversData() {
    const { data, error } = await supabaseClient
        .from('driver_details')
        .select(`
            profile_id,
            license_plate,
            car_model,
            car_color,
            approval_status,
            profile:profiles(full_name, email, phone_number)
        `);
    
    if (error) {
        toast.show('Erro ao carregar motoristas.', 'error');
        return;
    }
    
    renderDrivers(data);
}

function renderDrivers(drivers) {
    const tbody = document.getElementById('drivers-table-body');
    if (drivers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Nenhum motorista encontrado.</td></tr>';
        return;
    }
    
    const statusMap = {
        approved: '<span class="px-2 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-300">Aprovado</span>',
        pending: '<span class="px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-300">Pendente</span>',
        rejected: '<span class="px-2 py-1 text-xs font-medium rounded-full bg-red-500/20 text-red-300">Rejeitado</span>',
    };

    tbody.innerHTML = drivers.map(driver => `
        <tr class="border-b border-gray-700 hover:bg-gray-700/50">
            <td class="p-4 font-medium">${driver.profile.full_name}</td>
            <td class="p-4 text-gray-300">${driver.profile.email}<br>${driver.profile.phone_number || ''}</td>
            <td class="p-4 text-gray-300">${driver.car_model} (${driver.car_color})<br><span class="font-mono">${driver.license_plate}</span></td>
            <td class="p-4">${statusMap[driver.approval_status] || driver.approval_status}</td>
            <td class="p-4">
                ${driver.approval_status === 'pending' ? `
                <div class="flex gap-2">
                    <button data-action="approve-driver" data-id="${driver.profile_id}" class="px-3 py-1 text-sm font-semibold rounded-md bg-green-600 hover:bg-green-700">Aprovar</button>
                    <button data-action="reject-driver" data-id="${driver.profile_id}" class="px-3 py-1 text-sm font-semibold rounded-md bg-red-600 hover:bg-red-700">Rejeitar</button>
                </div>
                ` : 'N/A'}
            </td>
        </tr>
    `).join('');
}


// Rides
async function loadRidesData() {
    const { data, error } = await supabaseClient
        .from('rides')
        .select(`
            created_at,
            price,
            status,
            platform_fee,
            driver_earnings,
            passenger:profiles!rides_passenger_id_fkey(full_name),
            driver:profiles!rides_driver_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        toast.show('Erro ao carregar corridas.', 'error');
        return;
    }
    
    renderRides(data);
}

function renderRides(rides) {
    const tbody = document.getElementById('rides-table-body');
    if (rides.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Nenhuma corrida encontrada.</td></tr>';
        return;
    }
    tbody.innerHTML = rides.map(ride => `
        <tr class="border-b border-gray-700 hover:bg-gray-700/50">
            <td class="p-3 text-gray-300">${new Date(ride.created_at).toLocaleString('pt-BR')}</td>
            <td class="p-3 font-medium">${ride.passenger?.full_name || 'N/A'}</td>
            <td class="p-3 text-gray-300">${ride.driver?.full_name || 'N/A'}</td>
            <td class="p-3 font-semibold text-white">${formatCurrency(ride.price)}</td>
            <td class="p-3 text-red-400">${formatCurrency(ride.platform_fee)}</td>
            <td class="p-3 text-green-400">${formatCurrency(ride.driver_earnings)}</td>
            <td class="p-3"><span class="capitalize">${ride.status}</span></td>
        </tr>
    `).join('');
}


// Settings
async function loadSettingsData() {
    const { data, error } = await supabaseClient
        .from('app_config')
        .select('value')
        .eq('key', 'COMMISSION_RATE')
        .single();
    
    if (error) {
        toast.show('Erro ao carregar configurações.', 'error');
        return;
    }
    
    const ratePercentage = parseFloat(data.value) * 100;
    document.getElementById('commission-rate').value = ratePercentage.toFixed(2);
}

async function updateCommissionRate(newRate) {
    showLoading('save-settings-btn');
    try {
        if (isNaN(newRate) || newRate < 0 || newRate > 100) {
            throw new Error('Taxa inválida. Use um valor entre 0 e 100.');
        }
        const rateDecimal = newRate / 100;
        const { error } = await supabaseClient
            .from('app_config')
            .update({ value: rateDecimal.toString() })
            .eq('key', 'COMMISSION_RATE');
        
        if (error) throw error;
        toast.show('Taxa de comissão atualizada com sucesso!', 'success');
    } catch (error) {
        toast.show(error.message, 'error');
    } finally {
        hideLoading('save-settings-btn');
    }
}


// --- ACTIONS ---

async function updateDriverStatus(driverId, newStatus) {
    const { error } = await supabaseClient
        .from('driver_details')
        .update({ approval_status: newStatus })
        .eq('profile_id', driverId);

    if (error) {
        toast.show(`Erro ao ${newStatus === 'approved' ? 'aprovar' : 'rejeitar'} motorista.`, 'error');
    } else {
        toast.show(`Motorista ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso!`, 'success');
        loadDriversData();
    }
}


// --- INITIALIZATION & EVENT LISTENERS ---

async function initializeApp() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        // Double check if user is admin
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('user_type')
            .eq('id', session.user.id)
            .single();

        if (profile?.user_type === 'admin') {
            state.user = session.user;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('admin-panel').classList.remove('hidden');
            showView('dashboard-view');
        } else {
            // Logged in but not admin, log them out from admin panel
            await handleLogout();
        }
    } else {
        document.getElementById('admin-panel').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Login
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = e.target.elements['login-email'].value;
        const password = e.target.elements['login-password'].value;
        handleLogin(email, password);
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Navigation
    document.getElementById('sidebar-nav').addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault();
            const viewId = link.dataset.view;
            showView(viewId);
        }
    });

    // Settings
    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const newRate = parseFloat(document.getElementById('commission-rate').value);
        updateCommissionRate(newRate);
    });

    // Dynamic Actions (Approve/Reject Driver)
    document.getElementById('drivers-table-body').addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;
        
        if (action === 'approve-driver') {
            if (confirm(`Tem certeza que deseja APROVAR este motorista?`)) {
                updateDriverStatus(id, 'approved');
            }
        } else if (action === 'reject-driver') {
            if (confirm(`Tem certeza que deseja REJEITAR este motorista?`)) {
                 updateDriverStatus(id, 'rejected');
            }
        }
    });
    
    initializeApp();
});