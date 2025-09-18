// Configuration et données globales
let appData = {
    adminPassword: 'admin123',
    weeklyAmount: 100,
    siteTitle: 'Gestion Cotisation Étudiante',
    users: ['Ahmed', 'Fatima', 'Youssef', 'Aicha'],
    currentWeek: getCurrentWeekKey(),
    payments: {},
    history: {},
    groups: [],
    groupRotation: {
        startWeek: getCurrentWeekNumber(),
        rotationOrder: ['marche', 'poulet', 'repos']
    }
};

// Variables WebSocket
let socket = null;
let isConnected = false;

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeWebSocket();
    initializeApp();
});

// Fonctions utilitaires pour les dates
function getCurrentWeekKey() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Lundi
    return startOfWeek.toISOString().split('T')[0];
}

function getCurrentWeekNumber() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now - startOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
}

function getWeekStartDate(weekNumber, year = new Date().getFullYear()) {
    const startOfYear = new Date(year, 0, 1);
    const daysToAdd = (weekNumber - 1) * 7 - startOfYear.getDay() + 1;
    const weekStart = new Date(startOfYear.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return weekStart;
}

function getCurrentTaskRotation() {
    const currentWeek = getCurrentWeekNumber();
    const weeksSinceStart = currentWeek - appData.groupRotation.startWeek;
    const rotationIndex = weeksSinceStart % 3;
    
    return {
        marche: appData.groupRotation.rotationOrder[rotationIndex],
        poulet: appData.groupRotation.rotationOrder[(rotationIndex + 1) % 3],
        repos: appData.groupRotation.rotationOrder[(rotationIndex + 2) % 3]
    };
}

function getWeekDateRange(weekKey) {
    const startDate = new Date(weekKey);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return `${startDate.toLocaleDateString('fr-FR', options)} - ${endDate.toLocaleDateString('fr-FR', options)}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
}

// Fonctions WebSocket
function initializeWebSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Connecté au serveur WebSocket');
        isConnected = true;
        showAlert('Connexion établie - Synchronisation temps réel active', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Déconnecté du serveur WebSocket');
        isConnected = false;
        showAlert('Connexion perdue - Tentative de reconnexion...', 'warning');
    });
    
    socket.on('initialData', (data) => {
        console.log('📥 Données initiales reçues');
        appData = { ...appData, ...data };
        appData.currentWeek = getCurrentWeekKey();
        updateAllDisplays();
    });
    
    socket.on('dataUpdated', (data) => {
        console.log('🔄 Données mises à jour reçues');
        appData = { ...appData, ...data };
        updateAllDisplays();
        showAlert('Données synchronisées', 'info');
    });
    
    socket.on('userAdded', (user) => {
        if (!appData.users.find(u => u.id === user.id)) {
            appData.users.push(user);
            updateAllDisplays();
            showAlert(`Utilisateur ${user.name} ajouté`, 'success');
        }
    });
    
    socket.on('userUpdated', (updatedUser) => {
        const index = appData.users.findIndex(u => u.id === updatedUser.id);
        if (index !== -1) {
            appData.users[index] = updatedUser;
            updateAllDisplays();
            showAlert(`Utilisateur ${updatedUser.name} modifié`, 'info');
        }
    });
    
    socket.on('userDeleted', (userId) => {
        appData.users = appData.users.filter(u => u.id !== userId);
        updateAllDisplays();
        showAlert('Utilisateur supprimé', 'info');
    });
    
    socket.on('paymentAdded', (payment) => {
        if (!appData.payments.find(p => p.id === payment.id)) {
            appData.payments.push(payment);
            updateAllDisplays();
            showAlert(`Paiement de ${payment.userName} enregistré`, 'success');
        }
    });
    
    socket.on('groupAdded', (group) => {
        if (!appData.groups.find(g => g.id === group.id)) {
            appData.groups.push(group);
            updateAllDisplays();
            showAlert(`Groupe ${group.name} créé`, 'success');
        }
    });
    
    socket.on('groupUpdated', (updatedGroup) => {
        const index = appData.groups.findIndex(g => g.id === updatedGroup.id);
        if (index !== -1) {
            appData.groups[index] = updatedGroup;
            updateAllDisplays();
            showAlert(`Groupe ${updatedGroup.name} modifié`, 'info');
        }
    });
    
    socket.on('groupDeleted', (groupId) => {
        appData.groups = appData.groups.filter(g => g.id !== groupId);
        updateAllDisplays();
        showAlert('Groupe supprimé', 'info');
    });
    
    socket.on('rotationReset', (newRotation) => {
        appData.groupRotation = newRotation;
        updateAllDisplays();
        showAlert('Rotation des groupes réinitialisée', 'info');
    });
}

function saveData() {
    if (socket && isConnected) {
        socket.emit('updateData', appData);
    } else {
        console.warn('⚠️ Pas de connexion WebSocket - données non sauvegardées');
        showAlert('Erreur de connexion - données non sauvegardées', 'error');
    }
}

function updateAllDisplays() {
    // Mettre à jour tous les affichages
    if (document.getElementById('adminPage').classList.contains('active')) {
        updateAdminDashboard();
        updateUsersList();
        displayGroups();
        displayCurrentWeekRotation();
    }
    
    if (document.getElementById('publicPage').classList.contains('active')) {
        updatePublicSpace();
        displayGroupTasks();
    }
}

function loadData() {
    const saved = localStorage.getItem('cotisationApp');
    if (saved) {
        const savedData = JSON.parse(saved);
        appData = { ...appData, ...savedData };
        appData.currentWeek = getCurrentWeekKey(); // Toujours utiliser la semaine actuelle
    }
    
    // Initialiser les paiements pour la semaine actuelle si nécessaire
    if (!appData.payments[appData.currentWeek]) {
        appData.payments[appData.currentWeek] = {};
    }
}

// Configuration de la sauvegarde automatique
function setupAutoSave() {
    // Sauvegarde automatique toutes les minutes
    setInterval(saveData, 60000);
    
    // Sauvegarde automatique de l'historique chaque samedi à 23h59
    setInterval(checkWeeklyArchive, 60000); // Vérifier chaque minute
}

function checkWeeklyArchive() {
    const now = new Date();
    const day = now.getDay(); // 0 = dimanche, 6 = samedi
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    // Si c'est samedi (6) à 23h59
    if (day === 6 && hour === 23 && minute === 59) {
        archiveCurrentWeek();
    }
}

function archiveCurrentWeek() {
    const weekKey = appData.currentWeek;
    if (appData.payments[weekKey]) {
        appData.history[weekKey] = {
            payments: { ...appData.payments[weekKey] },
            weeklyAmount: appData.weeklyAmount,
            users: [...appData.users],
            archived: new Date().toISOString()
        };
        console.log(`Semaine ${weekKey} archivée automatiquement`);
    }
}

// Initialisation de l'application
function initializeApp() {
    updateCurrentWeekDisplay();
    updatePublicSiteTitle();
    updatePublicWeeklyAmount();
    populateUserSelect();
    
    // Event listeners
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
    document.getElementById('groupForm').addEventListener('submit', saveGroup);
    document.getElementById('paymentForm').addEventListener('submit', handlePayment);
}

// Gestion de l'affichage des pages
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

function showAdminLogin() {
    document.getElementById('adminLoginModal').style.display = 'block';
}

function closeAdminLogin() {
    document.getElementById('adminLoginModal').style.display = 'none';
    document.getElementById('adminPassword').value = '';
}

function showPublicSpace() {
    showPage('publicPage');
    updatePublicSpace();
}

function backToHome() {
    showPage('loginPage');
}

function logout() {
    showPage('loginPage');
}

// Authentification administrateur
function handleAdminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    
    if (password === appData.adminPassword) {
        closeAdminLogin();
        showPage('adminPage');
        showAdminSection('dashboard');
        updateAdminDashboard();
    } else {
        showAlert('Mot de passe incorrect', 'error');
    }
}

// Navigation dans l'espace administrateur
function showAdminSection(sectionId) {
    // Mettre à jour les boutons de navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Afficher la section correspondante
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    // Charger le contenu spécifique
    switch(sectionId) {
        case 'dashboard':
            updateAdminDashboard();
            break;
        case 'users':
            updateUsersList();
            break;
        case 'groups':
            displayGroups();
            displayCurrentWeekRotation();
            break;
        case 'settings':
            updateSettingsForm();
            break;
        case 'history':
            updateFullHistory();
            break;
    }
}

// Tableau de bord administrateur
function updateAdminDashboard() {
    // Statistiques
    document.getElementById('totalUsers').textContent = appData.users.length;
    document.getElementById('weeklyAmount').textContent = `${appData.weeklyAmount} DH`;
    
    const currentWeekPayments = appData.payments[appData.currentWeek] || {};
    const paidCount = Object.keys(currentWeekPayments).length;
    const unpaidCount = appData.users.length - paidCount;
    
    document.getElementById('paidCount').textContent = paidCount;
    document.getElementById('unpaidCount').textContent = unpaidCount;
    
    // Tableau des statuts
    updateWeeklyStatusTable();
}

function updateWeeklyStatusTable() {
    const container = document.getElementById('weeklyStatusTable');
    const currentWeekPayments = appData.payments[appData.currentWeek] || {};
    
    let html = '<table class="table"><thead><tr><th>Colocataire</th><th>Statut</th><th>Montant</th><th>Surplus/Déficit</th></tr></thead><tbody>';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const payment = currentWeekPayments[userName];
        let status, amount, surplus;
        
        if (payment) {
            amount = `${payment.amount} DH`;
            const diff = payment.amount - appData.weeklyAmount;
            
            if (diff > 0) {
                status = '<span class="status-surplus">Payé (Surplus)</span>';
                surplus = `+${diff} DH`;
            } else if (diff === 0) {
                status = '<span class="status-paid">Payé</span>';
                surplus = '0 DH';
            } else {
                status = '<span class="status-unpaid">Insuffisant</span>';
                surplus = `${diff} DH`;
            }
        } else {
            status = '<span class="status-unpaid">Non payé</span>';
            amount = '0 DH';
            surplus = `-${appData.weeklyAmount} DH`;
        }
        
        html += `<tr><td>${userName}</td><td>${status}</td><td>${amount}</td><td>${surplus}</td></tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Gestion des utilisateurs
function updateUsersList() {
    const container = document.getElementById('usersList');
    let html = '';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        html += `
            <div class="user-item">
                <div class="user-info">
                    <i class="fas fa-user"></i>
                    <span>${userName}</span>
                </div>
                <div class="user-actions">
                    <button class="btn btn-danger" onclick="removeUser('${userName}')">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function showAddUserModal() {
    document.getElementById('addUserModal').style.display = 'block';
}

function closeAddUserModal() {
    document.getElementById('addUserModal').style.display = 'none';
    document.getElementById('newUserName').value = '';
}

function handleAddUser(e) {
    e.preventDefault();
    const userName = document.getElementById('newUserName').value.trim();
    
    if (userName && !appData.users.includes(userName)) {
        const newUser = {
            id: Date.now().toString(),
            name: userName,
            createdAt: new Date().toISOString()
        };
        
        if (socket && isConnected) {
            socket.emit('userAdded', newUser);
        } else {
            appData.users.push(newUser);
            updateAllDisplays();
        }
        
        closeAddUserModal();
        showAlert(`${userName} a été ajouté avec succès`, 'success');
    } else {
        showAlert('Nom invalide ou déjà existant', 'error');
    }
}

function removeUser(userName) {
    if (confirm(`Êtes-vous sûr de vouloir supprimer ${userName} ?`)) {
        const user = appData.users.find(u => u.name === userName || u === userName);
        const userId = user ? (user.id || user) : userName;
        
        if (socket && isConnected) {
            socket.emit('userDeleted', userId);
        } else {
            appData.users = appData.users.filter(user => (user.name || user) !== userName);
            
            // Supprimer les paiements de cet utilisateur
            Object.keys(appData.payments).forEach(week => {
                delete appData.payments[week][userName];
            });
            
            if (socket && isConnected) {
                socket.emit('updateData', appData);
            }
            updateAllDisplays();
        }
        updateUsersList();
        populateUserSelect();
        updateAdminDashboard();
        showAlert(`${userName} a été supprimé`, 'success');
    }
}

// Paramètres
function updateSettingsForm() {
    document.getElementById('weeklyAmountInput').value = appData.weeklyAmount;
    document.getElementById('siteTitle').value = appData.siteTitle;
}

function updateWeeklyAmount() {
    const newAmount = parseInt(document.getElementById('weeklyAmountInput').value);
    if (newAmount > 0) {
        appData.weeklyAmount = newAmount;
        if (socket && isConnected) {
            socket.emit('updateData', appData);
        }
        updateAdminDashboard();
        updatePublicWeeklyAmount();
        showAlert('Montant de cotisation mis à jour', 'success');
    } else {
        showAlert('Montant invalide', 'error');
    }
}

function updateSiteTitle() {
    const newTitle = document.getElementById('siteTitle').value.trim();
    if (newTitle) {
        appData.siteTitle = newTitle;
        if (socket && isConnected) {
            socket.emit('updateData', appData);
        }
        updatePublicSiteTitle();
        showAlert('Titre du site mis à jour', 'success');
    } else {
        showAlert('Titre invalide', 'error');
    }
}

function updateAdminPassword() {
    const newPassword = document.getElementById('newAdminPassword').value.trim();
    if (newPassword.length >= 6) {
        appData.adminPassword = newPassword;
        if (socket && isConnected) {
            socket.emit('updateData', appData);
        }
        document.getElementById('newAdminPassword').value = '';
        showAlert('Mot de passe administrateur mis à jour', 'success');
    } else {
        showAlert('Le mot de passe doit contenir au moins 6 caractères', 'error');
    }
}

// Historique complet
function updateFullHistory() {
    const container = document.getElementById('fullHistory');
    let html = '';
    
    const sortedWeeks = Object.keys(appData.history).sort().reverse();
    
    if (sortedWeeks.length === 0) {
        html = '<p>Aucun historique disponible.</p>';
    } else {
        sortedWeeks.forEach(weekKey => {
            const weekData = appData.history[weekKey];
            html += `
                <div class="history-week">
                    <h4>Semaine du ${getWeekDateRange(weekKey)}</h4>
                    <p><strong>Cotisation :</strong> ${weekData.weeklyAmount} DH</p>
                    <table class="table">
                        <thead>
                            <tr><th>Colocataire</th><th>Montant payé</th><th>Statut</th></tr>
                        </thead>
                        <tbody>
            `;
            
            weekData.users.forEach(user => {
                const userName = user.name || user;
                const payment = weekData.payments[userName];
                let amount, status;
                
                if (payment) {
                    amount = `${payment.amount} DH`;
                    const diff = payment.amount - weekData.weeklyAmount;
                    if (diff > 0) {
                        status = '<span class="status-surplus">Surplus</span>';
                    } else if (diff === 0) {
                        status = '<span class="status-paid">Payé</span>';
                    } else {
                        status = '<span class="status-unpaid">Insuffisant</span>';
                    }
                } else {
                    amount = '0 DH';
                    status = '<span class="status-unpaid">Non payé</span>';
                }
                
                html += `<tr><td>${userName}</td><td>${amount}</td><td>${status}</td></tr>`;
            });
            
            html += '</tbody></table></div>';
        });
    }
    
    container.innerHTML = html;
}

// Espace public
function updatePublicSpace() {
    updateCurrentWeekDisplay();
    updatePublicStatusTable();
    updatePublicHistory();
    populateUserSelect();
    displayGroupTasks();
}

function updateCurrentWeekDisplay() {
    const weekRange = getWeekDateRange(appData.currentWeek);
    document.getElementById('currentWeekDate').textContent = weekRange;
}

function updatePublicSiteTitle() {
    document.getElementById('publicSiteTitle').textContent = appData.siteTitle;
}

function updatePublicWeeklyAmount() {
    document.getElementById('publicWeeklyAmount').textContent = appData.weeklyAmount;
}

function populateUserSelect() {
    const select = document.getElementById('userName');
    select.innerHTML = '<option value="">Sélectionnez votre nom</option>';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const option = document.createElement('option');
        option.value = userName;
        option.textContent = userName;
        select.appendChild(option);
    });
}

function updatePublicStatusTable() {
    const container = document.getElementById('publicStatusTable');
    const currentWeekPayments = appData.payments[appData.currentWeek] || {};
    
    let html = '<table class="table"><thead><tr><th>Colocataire</th><th>Statut</th></tr></thead><tbody>';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const payment = currentWeekPayments[userName];
        let status;
        
        if (payment) {
            const diff = payment.amount - appData.weeklyAmount;
            if (diff > 0) {
                status = '<span class="status-surplus">✓ Payé (Surplus)</span>';
            } else if (diff === 0) {
                status = '<span class="status-paid">✓ Payé</span>';
            } else {
                status = '<span class="status-unpaid">⚠ Insuffisant</span>';
            }
        } else {
            status = '<span class="status-unpaid">✗ Non payé</span>';
        }
        
        html += `<tr><td>${userName}</td><td>${status}</td></tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function updatePublicHistory() {
    const container = document.getElementById('publicHistory');
    let html = '';
    
    // Obtenir les 5 dernières semaines (incluant la semaine actuelle)
    const allWeeks = [...Object.keys(appData.history), appData.currentWeek];
    const sortedWeeks = [...new Set(allWeeks)].sort().reverse().slice(0, 5);
    
    if (sortedWeeks.length === 0) {
        html = '<p>Aucun historique disponible.</p>';
    } else {
        sortedWeeks.forEach(weekKey => {
            const isCurrentWeek = weekKey === appData.currentWeek;
            const weekData = isCurrentWeek ? 
                { payments: appData.payments[weekKey] || {}, weeklyAmount: appData.weeklyAmount, users: appData.users } :
                appData.history[weekKey];
            
            if (weekData) {
                html += `
                    <div class="history-week">
                        <h4>Semaine du ${getWeekDateRange(weekKey)} ${isCurrentWeek ? '(Actuelle)' : ''}</h4>
                        <table class="table">
                            <thead>
                                <tr><th>Colocataire</th><th>Statut</th></tr>
                            </thead>
                            <tbody>
                `;
                
                weekData.users.forEach(user => {
                    const userName = user.name || user;
                    const payment = weekData.payments[userName];
                    let status;
                    
                    if (payment) {
                        const diff = payment.amount - weekData.weeklyAmount;
                        if (diff > 0) {
                            status = '<span class="status-surplus">✓ Payé (Surplus)</span>';
                        } else if (diff === 0) {
                            status = '<span class="status-paid">✓ Payé</span>';
                        } else {
                            status = '<span class="status-unpaid">⚠ Insuffisant</span>';
                        }
                    } else {
                        status = '<span class="status-unpaid">✗ Non payé</span>';
                    }
                    
                    html += `<tr><td>${userName}</td><td>${status}</td></tr>`;
                });
                
                html += '</tbody></table></div>';
            }
        });
    }
    
    container.innerHTML = html;
}

// Gestion des paiements
function handlePayment(e) {
    e.preventDefault();
    
    const userName = document.getElementById('userName').value;
    const paidAmount = parseFloat(document.getElementById('paidAmount').value);
    
    if (!userName) {
        showAlert('Veuillez sélectionner votre nom', 'error');
        return;
    }
    
    if (isNaN(paidAmount) || paidAmount < 0) {
        showAlert('Montant invalide', 'error');
        return;
    }
    
    // Créer l'objet paiement
    const payment = {
        id: Date.now().toString(),
        userName: userName,
        amount: paidAmount,
        date: new Date().toISOString(),
        week: appData.currentWeek
    };
    
    if (socket && isConnected) {
        socket.emit('paymentAdded', payment);
    } else {
        // Enregistrer le paiement
        if (!appData.payments[appData.currentWeek]) {
            appData.payments[appData.currentWeek] = {};
        }
        
        appData.payments[appData.currentWeek][userName] = {
            amount: paidAmount,
            date: new Date().toISOString(),
            week: appData.currentWeek
        };
        
        updateAllDisplays();
    }
    
    
    // Réinitialiser le formulaire
    document.getElementById('paymentForm').reset();
    
    // Mettre à jour l'affichage
    updatePublicStatusTable();
    updatePublicHistory();
    
    // Message de confirmation
    const diff = paidAmount - appData.weeklyAmount;
    let message = `Paiement enregistré pour ${userName}: ${paidAmount} DH`;
    
    if (diff > 0) {
        message += ` (Surplus de ${diff} DH)`;
    } else if (diff < 0) {
        message += ` (Manque ${Math.abs(diff)} DH)`;
    }
    
    showAlert(message, 'success');
}

// Système d'alertes
function showAlert(message, type = 'info') {
    // Supprimer les alertes existantes
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Créer la nouvelle alerte
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // Insérer l'alerte en haut de la page active
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        activePage.insertBefore(alert, activePage.firstChild);
        
        // Supprimer l'alerte après 5 secondes
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }
}

// Gestion des clics en dehors des modals
window.onclick = function(event) {
    const adminModal = document.getElementById('adminLoginModal');
    const addUserModal = document.getElementById('addUserModal');
    
    if (event.target === adminModal) {
        closeAdminLogin();
    }
    if (event.target === addUserModal) {
        closeAddUserModal();
    }
}

// Sauvegarde avant fermeture de la page
window.addEventListener('beforeunload', function() {
    // La sauvegarde est maintenant gérée par WebSocket
});

// Fonctions de gestion des groupes
function openGroupModal(groupId = null) {
    const modal = document.getElementById('groupModal');
    const title = document.getElementById('groupModalTitle');
    const form = document.getElementById('groupForm');
    
    if (groupId) {
        title.textContent = 'Modifier le Groupe';
        const group = appData.groups.find(g => g.id === groupId);
        if (group) {
            document.getElementById('groupId').value = group.id;
            document.getElementById('groupName').value = group.name;
            document.getElementById('groupTask').value = group.task;
        }
    } else {
        title.textContent = 'Créer un Groupe';
        form.reset();
        document.getElementById('groupId').value = '';
    }
    
    displayGroupMembers();
    modal.style.display = 'block';
}

function displayGroupMembers() {
    const container = document.getElementById('groupMembers');
    const groupId = document.getElementById('groupId').value;
    const currentGroup = groupId ? appData.groups.find(g => g.id == groupId) : null;
    
    container.innerHTML = '';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const isSelected = currentGroup ? currentGroup.members.includes(userName) : false;
        
        const memberDiv = document.createElement('div');
        memberDiv.className = 'member-checkbox';
        memberDiv.innerHTML = `
            <label>
                <input type="checkbox" value="${userName}" ${isSelected ? 'checked' : ''}>
                <span>${userName}</span>
            </label>
        `;
        container.appendChild(memberDiv);
    });
}

function saveGroup(event) {
    event.preventDefault();
    
    const groupId = document.getElementById('groupId').value;
    const name = document.getElementById('groupName').value;
    const task = document.getElementById('groupTask').value;
    const memberCheckboxes = document.querySelectorAll('#groupMembers input[type="checkbox"]:checked');
    const members = Array.from(memberCheckboxes).map(cb => cb.value);
    
    if (!name || !task || members.length === 0) {
        showAlert('Veuillez remplir tous les champs et sélectionner au moins un membre', 'error');
        return;
    }
    
    const group = {
        id: groupId ? parseInt(groupId) : Date.now(),
        name,
        task,
        members
    };
    
    if (socket && isConnected) {
        if (groupId) {
            socket.emit('groupUpdated', group);
        } else {
            socket.emit('groupAdded', group);
        }
    } else {
        if (groupId) {
            // Modifier un groupe existant
            const groupIndex = appData.groups.findIndex(g => g.id == groupId);
            if (groupIndex !== -1) {
                appData.groups[groupIndex] = group;
            }
        } else {
            // Créer un nouveau groupe
            appData.groups.push(group);
        }
        updateAllDisplays();
    }
    
    displayGroups();
    displayCurrentWeekRotation();
    displayGroupTasks();
    closeModal('groupModal');
    showAlert('Groupe sauvegardé avec succès', 'success');
}

function deleteGroup(groupId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) {
        if (socket && isConnected) {
            socket.emit('groupDeleted', groupId);
        } else {
            appData.groups = appData.groups.filter(g => g.id !== groupId);
            updateAllDisplays();
        }
        showAlert('Groupe supprimé avec succès', 'success');
    }
}

function displayGroups() {
    const container = document.getElementById('groupsList');
    
    if (appData.groups.length === 0) {
        container.innerHTML = '<p class="no-data">Aucun groupe configuré</p>';
        return;
    }
    
    container.innerHTML = appData.groups.map(group => {
        const memberNames = group.members.join(', ');
        
        const taskNames = {
            'marche': 'Faire le marché',
            'poulet': 'Acheter le poulet',
            'repos': 'Se reposer'
        };
        
        return `
            <div class="group-item">
                <div class="group-info">
                    <h4>${group.name}</h4>
                    <p><strong>Tâche :</strong> ${taskNames[group.task]}</p>
                    <p><strong>Membres :</strong> ${memberNames}</p>
                </div>
                <div class="group-actions">
                    <button class="btn btn-secondary" onclick="openGroupModal(${group.id})">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    <button class="btn btn-danger" onclick="deleteGroup(${group.id})">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function resetGroupRotation() {
    if (confirm('Êtes-vous sûr de vouloir réinitialiser la rotation ? Cela redémarrera le cycle à partir de cette semaine.')) {
        const newRotation = {
            startWeek: getCurrentWeekNumber(),
            rotationOrder: ['marche', 'poulet', 'repos']
        };
        
        if (socket && isConnected) {
            socket.emit('rotationReset', newRotation);
        } else {
            appData.groupRotation = newRotation;
            updateAllDisplays();
        }
        showAlert('Rotation réinitialisée avec succès', 'success');
    }
}

function displayCurrentWeekRotation() {
    const container = document.getElementById('currentWeekRotation');
    const rotation = getCurrentTaskRotation();
    
    const taskNames = {
        'marche': 'Faire le marché',
        'poulet': 'Acheter le poulet',
        'repos': 'Se reposer'
    };
    
    container.innerHTML = `
        <div class="rotation-grid">
            ${Object.entries(rotation).map(([originalTask, currentTask]) => {
                const group = appData.groups.find(g => g.task === originalTask);
                if (!group) return '';
                
                const memberNames = group.members.join(', ');
                
                return `
                    <div class="rotation-item">
                        <h4>${group.name}</h4>
                        <p class="current-task">${taskNames[currentTask]}</p>
                        <p class="members">${memberNames}</p>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function displayGroupTasks() {
    const container = document.getElementById('groupTasksGrid');
    const rotation = getCurrentTaskRotation();
    
    if (appData.groups.length === 0) {
        container.innerHTML = '<p class="no-data">Aucun groupe configuré</p>';
        return;
    }
    
    const taskNames = {
        'marche': 'Faire le marché',
        'poulet': 'Acheter le poulet',
        'repos': 'Se reposer'
    };
    
    const taskIcons = {
        'marche': 'fas fa-shopping-cart',
        'poulet': 'fas fa-drumstick-bite',
        'repos': 'fas fa-bed'
    };
    
    container.innerHTML = Object.entries(rotation).map(([originalTask, currentTask]) => {
        const group = appData.groups.find(g => g.task === originalTask);
        if (!group) return '';
        
        const memberNames = group.members.join(', ');
        
        return `
            <div class="group-task-card">
                <div class="task-icon">
                    <i class="${taskIcons[currentTask]}"></i>
                </div>
                <div class="task-info">
                    <h3>${taskNames[currentTask]}</h3>
                    <h4>${group.name}</h4>
                    <p>${memberNames}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Export des données (fonction utilitaire pour le développement)
function exportData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cotisation-data.json';
    link.click();
}

// Import des données (fonction utilitaire pour le développement)
function importData(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                appData = { ...appData, ...importedData };
                if (socket && isConnected) {
                    socket.emit('updateData', appData);
                }
                location.reload();
            } catch (error) {
                showAlert('Erreur lors de l\'import des données', 'error');
            }
        };
        reader.readAsText(file);
    }
}