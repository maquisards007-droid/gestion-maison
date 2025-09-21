// Configuration et données globales
let appData = {
    adminPassword: 'admin123',
    weeklyAmount: 100,
    siteTitle: 'Gestion Cotisation Étudiante',
    users: ['Ahmed', 'Fatima', 'Youssef', 'Aicha'],
    currentWeek: getCurrentWeekKey(),
    payments: {},
    debts: {},
    history: {},
    groups: [],
    groupRotation: {
        startWeek: getCurrentWeekNumber(),
        rotationOrder: ['marche', 'poulet', 'repos']
    },
    monthlyBills: {
        // Structure: "YYYY-MM": { loyer: 4500, electricite: 0, eau: 0, gaz: 0, imprevus: 0, autres: [] }
        // autres: [{ nom: "Description", montant: 0 }]
    },
    monthlyPayments: {
        // Structure: "YYYY-MM": { "userName": { paid: 0, remaining: 0, payments: [{ amount: 0, date: "YYYY-MM-DD", note: "" }] } }
    },
    monthlySettings: {
        loyerDefaut: 4500
    }
};

// Variables WebSocket
let socket = null;
let isConnected = false;

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    loadData(); // Charger les données sauvegardées avant l'initialisation
    initializeWebSocket();
    initializeApp();
    
    // Restaurer l'état de navigation après l'initialisation
    setTimeout(() => {
        const restored = restoreNavigationState();
        if (!restored) {
            // Si aucun état n'a été restauré, afficher la page de connexion par défaut
            showPage('loginPage');
        }
    }, 100);
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

    socket.on('debtAdded', (data) => {
        const { debt, userName } = data;
        
        // Initialiser les dettes pour la semaine si nécessaire
        if (!appData.debts[debt.week]) {
            appData.debts[debt.week] = {};
        }
        
        // Initialiser les dettes pour l'utilisateur si nécessaire
        if (!appData.debts[debt.week][userName]) {
            appData.debts[debt.week][userName] = [];
        }
        
        // Vérifier si la dette n'existe pas déjà
        const existingDebt = appData.debts[debt.week][userName].find(d => d.id === debt.id);
        if (!existingDebt) {
            appData.debts[debt.week][userName].push(debt);
            updateAllDisplays();
            showAlert(`Dette de ${userName} enregistrée: ${debt.amount}€`, 'success');
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
    populateDebtUserSelect();
    
    // Event listeners
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
    document.getElementById('groupForm').addEventListener('submit', saveGroup);
    document.getElementById('paymentForm').addEventListener('submit', handlePayment);
    document.getElementById('debtForm').addEventListener('submit', handleDebt);
}

// Gestion de l'affichage des pages
function showPage(pageId) {
    // Vérifier que l'élément existe avant de l'utiliser
    const targetPage = document.getElementById(pageId);
    if (!targetPage) {
        console.warn(`Page avec l'ID "${pageId}" non trouvée. Redirection vers la page de connexion.`);
        pageId = 'loginPage'; // Fallback vers la page de connexion
    }
    
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const pageToShow = document.getElementById(pageId);
    if (pageToShow) {
        pageToShow.classList.add('active');
        // Sauvegarder l'état de navigation
        saveNavigationState(pageId);
    }
}

// Sauvegarde de l'état de navigation
function saveNavigationState(pageId, sectionId = null) {
    const navigationState = {
        currentPage: pageId,
        currentSection: sectionId,
        timestamp: Date.now()
    };
    localStorage.setItem('gestionMaison_navigationState', JSON.stringify(navigationState));
}

// Restauration de l'état de navigation
function restoreNavigationState() {
    try {
        const savedState = localStorage.getItem('gestionMaison_navigationState');
        if (savedState) {
            const state = JSON.parse(savedState);
            
            // Vérifier que l'état n'est pas trop ancien (24h max)
            const maxAge = 24 * 60 * 60 * 1000; // 24 heures
            if (Date.now() - state.timestamp < maxAge) {
                // Restaurer la page
                if (state.currentPage && document.getElementById(state.currentPage)) {
                    showPage(state.currentPage);
                    
                    // Si c'est la page admin et qu'il y a une section sauvegardée
                    if (state.currentPage === 'adminPage' && state.currentSection) {
                        // Petite temporisation pour s'assurer que la page est chargée
                        setTimeout(() => {
                            showAdminSection(state.currentSection);
                        }, 100);
                    }
                    
                    return true; // État restauré avec succès
                }
            }
        }
    } catch (error) {
        console.log('Erreur lors de la restauration de l\'état de navigation:', error);
    }
    
    return false; // Aucun état restauré
}

function showAdminLogin() {
    document.getElementById('adminLoginModal').style.display = 'block';
}

function closeAdminLogin() {
    document.getElementById('adminLoginModal').style.display = 'none';
    document.getElementById('adminPassword').value = '';
}

function showPublicSpace() {
    // S'assurer que le scroll est toujours activé dans la partie utilisateur
    document.body.style.overflow = '';
    closeMobileMenu(); // Fermer le menu mobile s'il est ouvert
    showPage('publicPage');
    updatePublicSpace();
}

function backToHome() {
    // Restaurer le scroll quand on revient à l'accueil
    document.body.style.overflow = '';
    closeMobileMenu(); // Fermer le menu mobile s'il est ouvert
    showPage('loginPage');
}

function logout() {
    // Effacer l'état de navigation sauvegardé lors de la déconnexion
    localStorage.removeItem('gestionMaison_navigationState');
    showPage('loginPage');
}

// Fonctions pour le menu mobile
function toggleMobileMenu() {
    const nav = document.getElementById('adminNav');
    const overlay = document.querySelector('.nav-overlay');
    
    if (nav && overlay) {
        const isOpen = nav.classList.contains('open');
        
        if (isOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }
}

function openMobileMenu() {
    const nav = document.getElementById('adminNav');
    const overlay = document.querySelector('.nav-overlay');
    
    if (nav && overlay) {
        nav.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Empêche le scroll du body
    }
}

function closeMobileMenu() {
    const nav = document.getElementById('adminNav');
    const overlay = document.querySelector('.nav-overlay');
    
    if (nav && overlay) {
        nav.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = ''; // Restaure le scroll du body
    }
}

// Fermer le menu mobile lors du redimensionnement de la fenêtre
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        closeMobileMenu();
    }
});

// Fermer le menu mobile avec la touche Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeMobileMenu();
    }
});

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
    // Sauvegarder l'état de navigation avec la section
    saveNavigationState('adminPage', sectionId);
    
    // Mettre à jour les boutons de navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event?.target.classList.add('active');
    
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
        case 'monthly':
            initializeMonthlySection();
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
    const currentWeekDebts = appData.debts[appData.currentWeek] || {};
    
    let html = '<div class="table-wrapper"><table class="table"><thead><tr><th>Colocataire</th><th>Statut</th><th>Montant</th><th>Surplus/Déficit</th><th>Crédit Final</th></tr></thead><tbody>';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const payment = currentWeekPayments[userName];
        const userDebts = currentWeekDebts[userName] || [];
        const totalDebts = userDebts.reduce((sum, debt) => sum + debt.amount, 0);
        
        let status, amount, surplus;
        let finalCredit = '';
        
        if (payment) {
            amount = `${payment.amount} DH`;
            const surplusAmount = payment.amount - appData.weeklyAmount;
            
            if (surplusAmount > 0) {
                status = '<span class="status-surplus">Payé (Surplus)</span>';
                surplus = `+${surplusAmount} DH`;
                
                // Calculer le crédit final (surplus + dettes supplémentaires)
                const finalCreditAmount = surplusAmount + totalDebts;
                if (finalCreditAmount > 0) {
                    finalCredit = `<span class="credit-amount">On lui doit ${finalCreditAmount} DH</span>`;
                } else if (finalCreditAmount < 0) {
                    finalCredit = `<span class="debt-amount">Il nous doit ${Math.abs(finalCreditAmount)} DH</span>`;
                } else {
                    finalCredit = '<span class="no-debt">Équilibré</span>';
                }
            } else if (surplusAmount === 0) {
                status = '<span class="status-paid">Payé</span>';
                surplus = '0 DH';
                
                if (totalDebts > 0) {
                    finalCredit = `<span class="credit-amount">On lui doit ${totalDebts} DH</span>`;
                } else if (totalDebts < 0) {
                    finalCredit = `<span class="credit-amount">On lui doit ${Math.abs(totalDebts)} DH</span>`;
                } else {
                    finalCredit = '<span class="no-debt">Équilibré</span>';
                }
            } else {
                status = '<span class="status-unpaid">Insuffisant</span>';
                surplus = `${surplusAmount} DH`;
                // Calculer le solde final : déficit de cotisation - achats imprévus
                const finalBalance = surplusAmount - totalDebts;
                if (finalBalance > 0) {
                    finalCredit = `<span class="credit-amount">On lui doit ${finalBalance} DH</span>`;
                } else if (finalBalance < 0) {
                    finalCredit = `<span class="debt-amount">Il nous doit ${Math.abs(finalBalance)} DH</span>`;
                } else {
                    finalCredit = '<span class="no-debt">Équilibré</span>';
                }
            }
        } else {
            status = '<span class="status-unpaid">Non payé</span>';
            amount = '0 DH';
            surplus = `-${appData.weeklyAmount} DH`;
            // Calculer le solde final : déficit de cotisation - achats imprévus
            const finalBalance = -appData.weeklyAmount - totalDebts;
            if (finalBalance > 0) {
                finalCredit = `<span class="credit-amount">On lui doit ${finalBalance} DH</span>`;
            } else if (finalBalance < 0) {
                finalCredit = `<span class="debt-amount">Il nous doit ${Math.abs(finalBalance)} DH</span>`;
            } else {
                finalCredit = '<span class="no-debt">Équilibré</span>';
            }
        }
        
        html += `<tr><td>${userName}</td><td>${status}</td><td>${amount}</td><td>${surplus}</td><td>${finalCredit}</td></tr>`;
    });
    
    html += '</tbody></table></div>';
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

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // Réinitialiser le formulaire si c'est le modal de groupe
    if (modalId === 'groupModal') {
        document.getElementById('groupForm').reset();
        document.getElementById('groupId').value = '';
    }
    // Réinitialiser le formulaire si c'est le modal de paiement mensuel
    if (modalId === 'monthlyPaymentModal') {
        const form = document.getElementById('monthlyPaymentForm');
        if (form) {
            form.reset();
        }
        currentPaymentUser = '';
        currentPaymentMonth = '';
    }
}

function handleAddUser(e) {
    e.preventDefault();
    const userName = document.getElementById('newUserName').value.trim();
    
    // Vérifier si l'utilisateur existe déjà (compatible avec les objets et les chaînes)
    const userExists = appData.users.some(user => {
        const existingName = user.name || user;
        return existingName === userName;
    });
    
    if (userName && !userExists) {
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
        const user = appData.users.find(u => (u.name || u) === userName);
        const userId = user ? (user.id || userName) : userName;
        
        if (socket && isConnected) {
            socket.emit('userDeleted', userId);
        } else {
            // Supprimer l'utilisateur de la liste
            appData.users = appData.users.filter(user => (user.name || user) !== userName);
            
            // Supprimer les paiements de cet utilisateur
            Object.keys(appData.payments).forEach(week => {
                delete appData.payments[week][userName];
            });
            
            // Supprimer l'utilisateur de l'historique
            Object.keys(appData.history).forEach(week => {
                if (appData.history[week].payments) {
                    delete appData.history[week].payments[userName];
                }
                if (appData.history[week].users) {
                    appData.history[week].users = appData.history[week].users.filter(u => (u.name || u) !== userName);
                }
            });
            
            updateAllDisplays();
        }
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
                    <div class="table-wrapper">
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
            
            html += '</tbody></table></div></div>';
        });
    }
    
    container.innerHTML = html;
}

// Espace public
function updatePublicSpace() {
    updateCurrentWeekDisplay();
    updatePublicSiteTitle();
    updatePublicWeeklyAmount();
    populateUserSelect();
    populateDebtUserSelect();
    updatePublicStatusTable();
    updatePublicHistory();
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

function populateDebtUserSelect() {
    const debtUserSelect = document.getElementById('debtUserName');
    if (!debtUserSelect) return;
    
    debtUserSelect.innerHTML = '<option value="">Sélectionnez votre nom</option>';
    
    appData.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name || user;
        option.textContent = user.name || user;
        debtUserSelect.appendChild(option);
    });
}

function updatePublicStatusTable() {
    const container = document.getElementById('publicStatusTable');
    const currentWeekPayments = appData.payments[appData.currentWeek] || {};
    const currentWeekDebts = appData.debts[appData.currentWeek] || {};
    
    let html = '<div class="table-wrapper"><table class="table"><thead><tr><th>Colocataire</th><th>Statut</th><th>Crédit/Dette</th></tr></thead><tbody>';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const payment = currentWeekPayments[userName];
        const userDebts = currentWeekDebts[userName] || [];
        
        // Calculer le total des dettes supplémentaires (achats imprévus)
        const totalDebts = userDebts.reduce((sum, debt) => sum + debt.amount, 0);
        
        let status;
        let creditDebtDisplay = '';
        
        if (payment) {
            const surplus = payment.amount - appData.weeklyAmount;
            
            if (surplus > 0) {
                // Surplus de paiement - crédit automatique
                status = '<span class="status-surplus">✓ Payé</span>';
                const totalCredit = surplus + totalDebts; // Surplus PLUS les dépenses imprévues = crédit total
                
                if (totalCredit > 0) {
                    creditDebtDisplay = `<span class="credit-amount">On vous doit ${totalCredit} DH</span>`;
                } else if (totalCredit < 0) {
                    creditDebtDisplay = `<span class="debt-amount">Vous nous devez ${Math.abs(totalCredit)} DH</span>`;
                } else {
                    creditDebtDisplay = '<span class="no-debt">-</span>';
                }
            } else if (surplus === 0) {
                // Paiement exact
                status = '<span class="status-paid">✓ Payé</span>';
                
                if (totalDebts > 0) {
                    creditDebtDisplay = `<span class="credit-amount">On vous doit ${totalDebts} DH</span>`;
                    if (userDebts.length > 1) {
                        creditDebtDisplay += ` <small>(${userDebts.length} achats)</small>`;
                    }
                } else if (totalDebts < 0) {
                    creditDebtDisplay = `<span class="credit-amount">On vous doit ${Math.abs(totalDebts)} DH</span>`;
                } else {
                    creditDebtDisplay = '<span class="no-debt">-</span>';
                }
            } else {
                // Paiement insuffisant
                status = '<span class="status-unpaid">⚠ Insuffisant</span>';
                // surplus est négatif, donc on calcule : déficit - achats imprévus
                const finalBalance = surplus - totalDebts; // surplus négatif - dettes = balance finale
                if (finalBalance < 0) {
                    creditDebtDisplay = `<span class="debt-amount">Vous nous devez ${Math.abs(finalBalance)} DH</span>`;
                } else {
                    creditDebtDisplay = `<span class="credit-amount">On vous doit ${finalBalance} DH</span>`;
                }
            }
        } else {
            // Pas de paiement
            status = '<span class="status-unpaid">✗ Non payé</span>';
            // Déficit de cotisation - achats imprévus = balance finale
            const finalBalance = -appData.weeklyAmount - totalDebts;
            if (finalBalance < 0) {
                creditDebtDisplay = `<span class="debt-amount">Vous nous devez ${Math.abs(finalBalance)} DH</span>`;
            } else {
                creditDebtDisplay = `<span class="credit-amount">On vous doit ${finalBalance} DH</span>`;
            }
        }
        
        html += `<tr><td>${userName}</td><td>${status}</td><td>${creditDebtDisplay}</td></tr>`;
    });
    
    html += '</tbody></table></div>';
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
                        <div class="table-wrapper">
                            <table class="table">
                                <thead>
                                    <tr><th>Colocataire</th><th>Statut</th><th>Crédit/Dette</th></tr>
                                </thead>
                                <tbody>
                `;
                
                weekData.users.forEach(user => {
                    const userName = user.name || user;
                    const payment = weekData.payments[userName];
                    const weekDebts = isCurrentWeek ? (appData.debts[weekKey] || {})[userName] || [] : (weekData.debts || {})[userName] || [];
                    const totalDebts = weekDebts.reduce((sum, debt) => sum + debt.amount, 0);
                    
                    let status;
                    let creditDebtDisplay = '';
                    
                    if (payment) {
                        const surplus = payment.amount - weekData.weeklyAmount;
                        if (surplus > 0) {
                            status = '<span class="status-surplus">✓ Payé (Surplus)</span>';
                            const totalCredit = surplus + totalDebts;
                            creditDebtDisplay = `<span class="credit-amount">On vous doit ${totalCredit} DH</span>`;
                            if (weekDebts.length > 0) {
                                creditDebtDisplay += ` <small>(${weekDebts.length} achat${weekDebts.length > 1 ? 's' : ''})</small>`;
                            }
                        } else if (surplus === 0) {
                            status = '<span class="status-paid">✓ Payé</span>';
                            if (totalDebts > 0) {
                                creditDebtDisplay = `<span class="credit-amount">On vous doit ${totalDebts} DH</span>`;
                                creditDebtDisplay += ` <small>(${weekDebts.length} achat${weekDebts.length > 1 ? 's' : ''})</small>`;
                            } else {
                                creditDebtDisplay = '<span class="no-debt">-</span>';
                            }
                        } else {
                             status = '<span class="status-unpaid">⚠ Insuffisant</span>';
                             // Calculer le solde final : déficit de cotisation - achats imprévus
                             const finalBalance = surplus - totalDebts;
                             if (finalBalance > 0) {
                                 creditDebtDisplay = `<span class="credit-amount">On vous doit ${finalBalance} DH</span>`;
                             } else if (finalBalance < 0) {
                                 creditDebtDisplay = `<span class="debt-amount">Vous nous devez ${Math.abs(finalBalance)} DH</span>`;
                             } else {
                                 creditDebtDisplay = '<span class="no-debt">Équilibré</span>';
                             }
                         }
                     } else {
                         status = '<span class="status-unpaid">✗ Non payé</span>';
                         // Calculer le solde final : déficit de cotisation - achats imprévus
                         const finalBalance = -weekData.weeklyAmount - totalDebts;
                         if (finalBalance > 0) {
                             creditDebtDisplay = `<span class="credit-amount">On vous doit ${finalBalance} DH</span>`;
                         } else if (finalBalance < 0) {
                             creditDebtDisplay = `<span class="debt-amount">Vous nous devez ${Math.abs(finalBalance)} DH</span>`;
                         } else {
                             creditDebtDisplay = '<span class="no-debt">Équilibré</span>';
                         }
                     }
                    
                    html += `<tr><td>${userName}</td><td>${status}</td><td>${creditDebtDisplay}</td></tr>`;
                });
                
                html += '</tbody></table></div></div>';
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
    
    // Enregistrer le paiement localement dans tous les cas
    if (!appData.payments[appData.currentWeek]) {
        appData.payments[appData.currentWeek] = {};
    }
    
    appData.payments[appData.currentWeek][userName] = {
        amount: paidAmount,
        date: new Date().toISOString(),
        week: appData.currentWeek
    };
    
    // Créer l'objet paiement pour le serveur
    const payment = {
        id: Date.now().toString(),
        userName: userName,
        amount: paidAmount,
        date: new Date().toISOString(),
        week: appData.currentWeek
    };
    
    // Envoyer au serveur si connecté
    if (socket && isConnected) {
        socket.emit('paymentAdded', payment);
    }
    
    // Mettre à jour tous les affichages
    updateAllDisplays();
    updatePublicStatusTable();
    updatePublicHistory();
    
    // Réinitialiser le formulaire
    document.getElementById('paymentForm').reset();
    
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

// Gestion de l'ajout de dettes
function handleDebt(e) {
    e.preventDefault();
    
    const userName = document.getElementById('debtUserName').value;
    const debtAmount = parseFloat(document.getElementById('debtAmount').value);
    const debtDescription = document.getElementById('debtDescription').value.trim();
    
    if (!userName || !debtAmount || debtAmount <= 0) {
        showAlert('Veuillez remplir tous les champs obligatoires avec des valeurs valides.', 'error');
        return;
    }
    
    // Initialiser les dettes pour la semaine courante si nécessaire
    if (!appData.debts[appData.currentWeek]) {
        appData.debts[appData.currentWeek] = {};
    }
    
    // Initialiser les dettes pour l'utilisateur si nécessaire
    if (!appData.debts[appData.currentWeek][userName]) {
        appData.debts[appData.currentWeek][userName] = [];
    }
    
    // Créer l'objet dette
    const debt = {
        id: Date.now().toString(),
        amount: debtAmount,
        description: debtDescription || 'Achat imprévu',
        date: new Date().toISOString(),
        week: appData.currentWeek
    };
    
    // Ajouter la dette
    appData.debts[appData.currentWeek][userName].push(debt);
    
    // Envoyer au serveur si connecté
    if (socket && isConnected) {
        socket.emit('debt', {
            data: debt,
            userName: userName
        });
    }
    
    // Sauvegarder et mettre à jour l'affichage
    saveData();
    updateAllDisplays();
    updatePublicStatusTable();
    
    // Réinitialiser le formulaire
    document.getElementById('debtForm').reset();
    
    showAlert(`Dette de ${debtAmount} DH ajoutée avec succès pour ${userName} !`, 'success');
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
    
    // Ajouter un compteur de membres sélectionnés
    const counterDiv = document.createElement('div');
    counterDiv.className = 'members-counter';
    counterDiv.innerHTML = '<small>Membres sélectionnés: <span id="selectedCount">0</span></small>';
    container.appendChild(counterDiv);
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const isSelected = currentGroup ? currentGroup.members.includes(userName) : false;
        
        const memberDiv = document.createElement('div');
        memberDiv.className = 'member-checkbox';
        memberDiv.innerHTML = `
            <label>
                <input type="checkbox" value="${userName}" ${isSelected ? 'checked' : ''} onchange="updateMemberCount()">
                <span>${userName}</span>
            </label>
        `;
        container.appendChild(memberDiv);
    });
    
    // Mettre à jour le compteur initial
    updateMemberCount();
}

function updateMemberCount() {
    const checkedBoxes = document.querySelectorAll('#groupMembers input[type="checkbox"]:checked');
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = checkedBoxes.length;
    }
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
    
    if (appData.groups.length === 0) {
        container.innerHTML = '<p class="no-data">Aucun groupe configuré pour la rotation</p>';
        return;
    }
    
    const taskNames = {
        'marche': 'Faire le marché',
        'poulet': 'Acheter le poulet',
        'repos': 'Se reposer'
    };
    
    // Calculer la rotation actuelle
    const currentWeek = getCurrentWeekNumber();
    const weeksSinceStart = currentWeek - appData.groupRotation.startWeek;
    const rotationIndex = weeksSinceStart % 3;
    
    // Assigner les tâches rotatives aux groupes
    const availableTasks = ['marche', 'poulet', 'repos'];
    
    container.innerHTML = `
        <div class="rotation-header">
            <h3>Rotation Semaine ${currentWeek}</h3>
            <p>Semaines depuis le début: ${weeksSinceStart}</p>
        </div>
        <div class="rotation-grid">
            ${appData.groups.map((group, index) => {
                // Calculer quelle tâche ce groupe doit faire cette semaine
                const taskIndex = (index + rotationIndex) % availableTasks.length;
                const currentTask = availableTasks[taskIndex];
                
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
    
    // Calculer la rotation actuelle
    const currentWeek = getCurrentWeekNumber();
    const weeksSinceStart = currentWeek - appData.groupRotation.startWeek;
    const rotationIndex = weeksSinceStart % 3;
    
    // Assigner les tâches rotatives aux groupes
    const availableTasks = ['marche', 'poulet', 'repos'];
    
    container.innerHTML = appData.groups.map((group, index) => {
        // Calculer quelle tâche ce groupe doit faire cette semaine
        const taskIndex = (index + rotationIndex) % availableTasks.length;
        const currentTask = availableTasks[taskIndex];
        
        const memberNames = group.members.join(', ');
        
        return `
            <div class="group-task-card">
                <div class="task-icon">
                    <i class="${taskIcons[currentTask]}"></i>
                </div>
                <div class="task-info">
                    <h3>${taskNames[currentTask]}</h3>
                    <h4>${group.name}</h4>
                    <p class="group-members">${memberNames}</p>
                    <small class="task-rotation">Rotation semaine ${currentWeek}</small>
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

// ===== GESTION MENSUELLE =====

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function initializeMonthlySection() {
    const monthInput = document.getElementById('selectedMonth');
    if (monthInput) {
        monthInput.value = getCurrentMonthKey();
        loadMonthlyData();
    }
}

function loadMonthlyData() {
    const selectedMonth = document.getElementById('selectedMonth').value;
    if (!selectedMonth) return;

    const monthData = appData.monthlyBills[selectedMonth];
    
    if (monthData) {
        // Charger les données existantes
        document.getElementById('loyer').value = monthData.loyer || appData.monthlySettings.loyerDefaut;
        document.getElementById('electricite').value = monthData.electricite || 0;
        document.getElementById('eau').value = monthData.eau || 0;
        document.getElementById('gaz').value = monthData.gaz || 0;
        document.getElementById('imprevus').value = monthData.imprevus || 0;
        
        loadAutresFactures(monthData.autres || []);
        displayMonthlySummary(selectedMonth, monthData);
        displayMonthlyDistribution(selectedMonth, monthData);
        displayPaymentStatus(selectedMonth, monthData);
        
        document.getElementById('monthlyForm').style.display = 'block';
    } else {
        // Nouveau mois
        resetMonthlyForm();
        document.getElementById('monthlySummary').innerHTML = '<p style="text-align: center; color: #cccccc;">Aucune donnée pour ce mois.</p>';
        document.getElementById('monthlyDistribution').innerHTML = '';
        document.getElementById('monthlyForm').style.display = 'none';
    }
}

function createNewMonthlyBill() {
    const selectedMonth = document.getElementById('selectedMonth').value;
    if (!selectedMonth) {
        showAlert('Veuillez sélectionner un mois.', 'warning');
        return;
    }

    resetMonthlyForm();
    document.getElementById('monthlyForm').style.display = 'block';
    document.getElementById('monthlySummary').innerHTML = '';
    document.getElementById('monthlyDistribution').innerHTML = '';
}

function resetMonthlyForm() {
    document.getElementById('loyer').value = appData.monthlySettings.loyerDefaut;
    document.getElementById('electricite').value = 0;
    document.getElementById('eau').value = 0;
    document.getElementById('gaz').value = 0;
    document.getElementById('imprevus').value = 0;
    document.getElementById('autresFacturesList').innerHTML = '';
}

function addAutreFacture() {
    const container = document.getElementById('autresFacturesList');
    const index = container.children.length;
    
    const factureDiv = document.createElement('div');
    factureDiv.className = 'autre-facture-item';
    factureDiv.innerHTML = `
        <div class="form-group">
            <label>Description :</label>
            <input type="text" name="autreNom_${index}" placeholder="Ex: Internet, Assurance..." required>
        </div>
        <div class="form-group">
            <label>Montant (DH) :</label>
            <input type="number" name="autreMontant_${index}" min="0" step="0.01" required>
        </div>
        <button type="button" class="remove-facture-btn" onclick="removeAutreFacture(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(factureDiv);
}

function removeAutreFacture(button) {
    button.parentElement.remove();
}

function loadAutresFactures(autres) {
    const container = document.getElementById('autresFacturesList');
    container.innerHTML = '';
    
    autres.forEach((facture, index) => {
        const factureDiv = document.createElement('div');
        factureDiv.className = 'autre-facture-item';
        factureDiv.innerHTML = `
            <div class="form-group">
                <label>Description :</label>
                <input type="text" name="autreNom_${index}" value="${facture.nom}" required>
            </div>
            <div class="form-group">
                <label>Montant (DH) :</label>
                <input type="number" name="autreMontant_${index}" value="${facture.montant}" min="0" step="0.01" required>
            </div>
            <button type="button" class="remove-facture-btn" onclick="removeAutreFacture(this)">
                <i class="fas fa-trash"></i>
            </button>
        `;
        container.appendChild(factureDiv);
    });
}

function saveMonthlyBill(event) {
    event.preventDefault();
    
    const selectedMonth = document.getElementById('selectedMonth').value;
    if (!selectedMonth) {
        showAlert('Veuillez sélectionner un mois.', 'warning');
        return;
    }

    // Collecter les données du formulaire
    const billData = {
        loyer: parseFloat(document.getElementById('loyer').value) || 0,
        electricite: parseFloat(document.getElementById('electricite').value) || 0,
        eau: parseFloat(document.getElementById('eau').value) || 0,
        gaz: parseFloat(document.getElementById('gaz').value) || 0,
        imprevus: parseFloat(document.getElementById('imprevus').value) || 0,
        autres: []
    };

    // Collecter les autres factures
    const container = document.getElementById('autresFacturesList');
    for (let i = 0; i < container.children.length; i++) {
        const nomInput = container.querySelector(`input[name="autreNom_${i}"]`);
        const montantInput = container.querySelector(`input[name="autreMontant_${i}"]`);
        
        if (nomInput && montantInput && nomInput.value.trim()) {
            billData.autres.push({
                nom: nomInput.value.trim(),
                montant: parseFloat(montantInput.value) || 0
            });
        }
    }

    // Sauvegarder
    appData.monthlyBills[selectedMonth] = billData;
    saveData();
    
    // Afficher le résumé
    displayMonthlySummary(selectedMonth, billData);
    displayMonthlyDistribution(selectedMonth, billData);
    
    showAlert('Factures mensuelles enregistrées avec succès !', 'success');
}

function calculateMonthlyTotal(billData) {
    let total = billData.loyer + billData.electricite + billData.eau + billData.gaz + billData.imprevus;
    billData.autres.forEach(facture => {
        total += facture.montant;
    });
    return total;
}

function displayMonthlySummary(month, billData) {
    const container = document.getElementById('monthlySummary');
    const total = calculateMonthlyTotal(billData);
    const nbPersonnes = appData.users.length;
    const parPersonne = total / nbPersonnes;

    let html = `
        <h3><i class="fas fa-chart-pie"></i> Récapitulatif - ${month}</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="label">Loyer</div>
                <div class="amount">${billData.loyer.toFixed(2)} DH</div>
            </div>
            <div class="summary-item">
                <div class="label">Électricité</div>
                <div class="amount">${billData.electricite.toFixed(2)} DH</div>
            </div>
            <div class="summary-item">
                <div class="label">Eau</div>
                <div class="amount">${billData.eau.toFixed(2)} DH</div>
            </div>
            <div class="summary-item">
                <div class="label">Gaz</div>
                <div class="amount">${billData.gaz.toFixed(2)} DH</div>
            </div>
            <div class="summary-item">
                <div class="label">Imprévus</div>
                <div class="amount">${billData.imprevus.toFixed(2)} DH</div>
            </div>
    `;

    billData.autres.forEach(facture => {
        html += `
            <div class="summary-item">
                <div class="label">${facture.nom}</div>
                <div class="amount">${facture.montant.toFixed(2)} DH</div>
            </div>
        `;
    });

    html += `
        </div>
        <div class="total-summary">
            <div class="total-amount">${total.toFixed(2)} DH</div>
            <div class="per-person">${parPersonne.toFixed(2)} DH par personne (${nbPersonnes} personnes)</div>
        </div>
    `;

    container.innerHTML = html;
}

function displayMonthlyDistribution(month, billData) {
    const container = document.getElementById('monthlyDistribution');
    const total = calculateMonthlyTotal(billData);
    const nbPersonnes = appData.users.length;
    const parPersonne = total / nbPersonnes;

    // Initialiser les paiements pour ce mois si nécessaire
    if (!appData.monthlyPayments[month]) {
        appData.monthlyPayments[month] = {};
    }

    let html = `
        <h3><i class="fas fa-users"></i> Répartition par Colocataire</h3>
        <div class="table-wrapper">
            <table class="distribution-table">
                <thead>
                    <tr>
                        <th>Colocataire</th>
                        <th>Part à payer</th>
                        <th>Statut</th>
                        <th class="payment-column">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    appData.users.forEach(user => {
        const userName = user.name || user;
        const userPayments = appData.monthlyPayments[month][userName] || { paid: 0, remaining: parPersonne, payments: [] };
        
        // Calculer le statut
        let statusClass = 'status-unpaid';
        let statusText = 'En attente';
        let statusDetails = '';
        
        if (userPayments.paid >= parPersonne) {
            statusClass = 'status-paid';
            statusText = 'Payé';
            if (userPayments.paid > parPersonne) {
                statusDetails = `<div class="payment-details">Surplus: ${(userPayments.paid - parPersonne).toFixed(2)} DH</div>`;
            }
        } else if (userPayments.paid > 0) {
            statusClass = 'status-partial';
            statusText = 'Partiel';
            statusDetails = `<div class="payment-details">Payé: ${userPayments.paid.toFixed(2)} DH<br>Reste: ${(parPersonne - userPayments.paid).toFixed(2)} DH</div>`;
        }

        html += `
            <tr>
                <td>${userName}</td>
                <td>${parPersonne.toFixed(2)} DH</td>
                <td>
                    <span class="${statusClass}">${statusText}</span>
                    ${statusDetails}
                </td>
                <td class="payment-actions">
                    <button class="payment-btn" onclick="openPaymentModal('${userName}', '${month}')">
                        <i class="fas fa-plus"></i> Paiement
                    </button>
                    ${userPayments.payments.length > 0 ? `
                        <button class="payment-btn partial" onclick="showPaymentHistory('${userName}', '${month}')">
                            <i class="fas fa-history"></i> Historique
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
        </div>
        <div style="margin-top: 20px; text-align: center;">
            <button class="btn btn-primary" onclick="exportMonthlyBill('${month}')">
                <i class="fas fa-download"></i> Exporter la liste
            </button>
        </div>
    `;

    container.innerHTML = html;
}

function exportMonthlyBill(month) {
    const billData = appData.monthlyBills[month];
    if (!billData) {
        showAlert('Aucune donnée à exporter pour ce mois.', 'warning');
        return;
    }

    const total = calculateMonthlyTotal(billData);
    const nbPersonnes = appData.users.length;
    const parPersonne = total / nbPersonnes;

    let content = `FACTURES MENSUELLES - ${month}\n`;
    content += `${'='.repeat(50)}\n\n`;
    
    content += `DÉTAIL DES CHARGES :\n`;
    content += `- Loyer : ${billData.loyer.toFixed(2)} DH\n`;
    content += `- Électricité : ${billData.electricite.toFixed(2)} DH\n`;
    content += `- Eau : ${billData.eau.toFixed(2)} DH\n`;
    content += `- Gaz : ${billData.gaz.toFixed(2)} DH\n`;
    content += `- Imprévus : ${billData.imprevus.toFixed(2)} DH\n`;
    
    billData.autres.forEach(facture => {
        content += `- ${facture.nom} : ${facture.montant.toFixed(2)} DH\n`;
    });
    
    content += `\nTOTAL : ${total.toFixed(2)} DH\n`;
    content += `NOMBRE DE PERSONNES : ${nbPersonnes}\n`;
    content += `PART PAR PERSONNE : ${parPersonne.toFixed(2)} DH\n\n`;
    
    content += `RÉPARTITION :\n`;
    content += `${'='.repeat(30)}\n`;
    appData.users.forEach(user => {
        const userName = user.name || user;
        content += `${userName} : ${parPersonne.toFixed(2)} DH\n`;
    });

    // Créer et télécharger le fichier
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factures_${month}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showAlert('Liste exportée avec succès !', 'success');
}

function cancelMonthlyForm() {
    document.getElementById('monthlyForm').style.display = 'none';
    loadMonthlyData();
}

// ===== GESTION PAIEMENTS MENSUELS =====

let currentPaymentUser = '';
let currentPaymentMonth = '';

function openPaymentModal(userName, month) {
    currentPaymentUser = userName;
    currentPaymentMonth = month;
    
    const billData = appData.monthlyBills[month];
    if (!billData) {
        showAlert('Aucune facture trouvée pour ce mois.', 'warning');
        return;
    }
    
    const total = calculateMonthlyTotal(billData);
    const parPersonne = total / appData.users.length;
    
    // Initialiser les données de paiement si nécessaire
    if (!appData.monthlyPayments[month]) {
        appData.monthlyPayments[month] = {};
    }
    
    if (!appData.monthlyPayments[month][userName]) {
        appData.monthlyPayments[month][userName] = {
            paid: 0,
            remaining: parPersonne,
            payments: []
        };
    }
    
    const userPayments = appData.monthlyPayments[month][userName];
    
    // Remplir les informations utilisateur
    document.getElementById('paymentUserInfo').innerHTML = `
        <h4>${userName}</h4>
        <p><strong>Mois :</strong> ${month}</p>
        <p><strong>Derniers paiements :</strong> ${userPayments.payments.length} paiement(s)</p>
    `;
    
    // Remplir le résumé
    document.getElementById('totalToPay').textContent = `${parPersonne.toFixed(2)} DH`;
    document.getElementById('alreadyPaid').textContent = `${userPayments.paid.toFixed(2)} DH`;
    document.getElementById('remainingToPay').textContent = `${Math.max(0, parPersonne - userPayments.paid).toFixed(2)} DH`;
    
    // Réinitialiser le formulaire
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentNote').value = '';
    
    // Afficher le modal
    document.getElementById('monthlyPaymentModal').style.display = 'block';
}

function saveMonthlyPayment(event) {
    event.preventDefault();
    
    console.log('saveMonthlyPayment appelée');
    console.log('currentPaymentUser:', currentPaymentUser);
    console.log('currentPaymentMonth:', currentPaymentMonth);
    
    const amountInput = document.getElementById('paymentAmount');
    const amount = parseFloat(amountInput.value);
    const note = document.getElementById('paymentNote').value.trim();
    
    console.log('Montant saisi:', amountInput.value, 'Montant parsé:', amount);
    
    if (!amountInput.value || isNaN(amount) || amount <= 0) {
        showAlert('Veuillez saisir un montant valide.', 'warning');
        return;
    }
    
    if (!currentPaymentUser || !currentPaymentMonth) {
        showAlert('Erreur : informations de paiement manquantes.', 'error');
        return;
    }
    
    // Initialiser les données de paiement si nécessaire
    if (!appData.monthlyPayments[currentPaymentMonth]) {
        appData.monthlyPayments[currentPaymentMonth] = {};
    }
    
    if (!appData.monthlyPayments[currentPaymentMonth][currentPaymentUser]) {
        const billData = appData.monthlyBills[currentPaymentMonth];
        const total = calculateMonthlyTotal(billData);
        const parPersonne = total / appData.users.length;
        
        appData.monthlyPayments[currentPaymentMonth][currentPaymentUser] = {
            paid: 0,
            remaining: parPersonne,
            payments: []
        };
    }
    
    const userPayments = appData.monthlyPayments[currentPaymentMonth][currentPaymentUser];
    
    // Ajouter le nouveau paiement
    const payment = {
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        note: note || ''
    };
    
    userPayments.payments.push(payment);
    userPayments.paid += amount;
    
    const billData = appData.monthlyBills[currentPaymentMonth];
    const total = calculateMonthlyTotal(billData);
    const parPersonne = total / appData.users.length;
    userPayments.remaining = Math.max(0, parPersonne - userPayments.paid);
    
    // Sauvegarder
    saveData();
    
    // Fermer le modal
    closeModal('monthlyPaymentModal');
    
    // Rafraîchir l'affichage
    displayMonthlyDistribution(currentPaymentMonth, billData);
    displayPaymentStatus(currentPaymentMonth, billData);
    
    showAlert(`Paiement de ${amount.toFixed(2)} DH enregistré pour ${currentPaymentUser}`, 'success');
}

function showPaymentHistory(userName, month) {
    const userPayments = appData.monthlyPayments[month][userName];
    if (!userPayments || userPayments.payments.length === 0) {
        showAlert('Aucun historique de paiement trouvé.', 'info');
        return;
    }
    
    let historyHtml = `
        <div style="background: #2a2a2a; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #d4af37; margin-bottom: 15px;">
                <i class="fas fa-history"></i> Historique des paiements - ${userName}
            </h3>
            <p style="color: #cccccc; margin-bottom: 15px;">
                <strong>Mois :</strong> ${month} | 
                <strong>Total payé :</strong> ${userPayments.paid.toFixed(2)} DH
            </p>
            <div class="payment-history">
    `;
    
    userPayments.payments.forEach((payment, index) => {
        historyHtml += `
            <div class="payment-item">
                <div class="payment-amount">${payment.amount.toFixed(2)} DH</div>
                <div class="payment-date">${formatDate(payment.date)}</div>
                ${payment.note ? `<div class="payment-note">"${payment.note}"</div>` : ''}
                <button onclick="removePayment('${userName}', '${month}', ${index})" 
                        style="float: right; background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    });
    
    historyHtml += `
            </div>
            <div style="text-align: center; margin-top: 15px;">
                <button onclick="this.parentElement.parentElement.remove()" 
                        class="btn btn-secondary">Fermer</button>
            </div>
        </div>
    `;
    
    // Ajouter l'historique à la page
    const container = document.getElementById('monthlyDistribution');
    container.insertAdjacentHTML('afterend', historyHtml);
}

function removePayment(userName, month, paymentIndex) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce paiement ?')) {
        return;
    }
    
    const userPayments = appData.monthlyPayments[month][userName];
    const removedPayment = userPayments.payments[paymentIndex];
    
    // Retirer le montant du total payé
    userPayments.paid -= removedPayment.amount;
    
    // Supprimer le paiement de la liste
    userPayments.payments.splice(paymentIndex, 1);
    
    // Recalculer le reste à payer
    const billData = appData.monthlyBills[month];
    const total = calculateMonthlyTotal(billData);
    const parPersonne = total / appData.users.length;
    userPayments.remaining = Math.max(0, parPersonne - userPayments.paid);
    
    // Sauvegarder
    saveData();
    
    // Rafraîchir l'affichage
    displayMonthlyDistribution(month, billData);
    displayPaymentStatus(month, billData);
    
    // Fermer l'historique
    const historyElement = document.querySelector('.payment-history');
    if (historyElement) {
        historyElement.closest('div').remove();
    }
    
    showAlert('Paiement supprimé avec succès.', 'success');
}

function displayPaymentStatus(month, billData) {
    const total = calculateMonthlyTotal(billData);
    const parPersonne = total / appData.users.length;
    
    // Initialiser les paiements pour ce mois si nécessaire
    if (!appData.monthlyPayments[month]) {
        appData.monthlyPayments[month] = {};
        appData.users.forEach(user => {
            const userName = user.name || user;
            appData.monthlyPayments[month][userName] = {
                paid: 0,
                remaining: parPersonne,
                payments: []
            };
        });
    }
    
    let totalCollected = 0;
    let totalRemaining = 0;
    let paidUsers = 0;
    let partialUsers = 0;
    let pendingUsers = 0;
    
    // Calculer les statistiques
    appData.users.forEach(user => {
        const userName = user.name || user;
        const userPayments = appData.monthlyPayments[month][userName] || { paid: 0, remaining: parPersonne, payments: [] };
        totalCollected += userPayments.paid;
        totalRemaining += Math.max(0, parPersonne - userPayments.paid);
        
        if (userPayments.paid >= parPersonne) {
            paidUsers++;
        } else if (userPayments.paid > 0) {
            partialUsers++;
        } else {
            pendingUsers++;
        }
    });
    
    // Afficher la vue d'ensemble
    const overviewHtml = `
        <div class="payment-stats">
            <div class="stat-card total">
                <div class="stat-value">${total.toFixed(2)} DH</div>
                <div class="stat-label">Total à collecter</div>
            </div>
            <div class="stat-card collected">
                <div class="stat-value">${totalCollected.toFixed(2)} DH</div>
                <div class="stat-label">Collecté</div>
            </div>
            <div class="stat-card remaining">
                <div class="stat-value">${totalRemaining.toFixed(2)} DH</div>
                <div class="stat-label">Restant</div>
            </div>
            <div class="stat-card progress">
                <div class="stat-value">${((totalCollected / total) * 100).toFixed(1)}%</div>
                <div class="stat-label">Progression</div>
            </div>
        </div>
        
        <div class="payment-summary">
            <div class="summary-item paid">
                <i class="fas fa-check-circle"></i>
                <span>${paidUsers} payé(s) complet</span>
            </div>
            <div class="summary-item partial">
                <i class="fas fa-clock"></i>
                <span>${partialUsers} paiement(s) partiel(s)</span>
            </div>
            <div class="summary-item pending">
                <i class="fas fa-exclamation-circle"></i>
                <span>${pendingUsers} en attente</span>
            </div>
        </div>
    `;
    
    // Afficher les détails par utilisateur
    let detailsHtml = '<div class="payment-users-grid">';
    
    appData.users.forEach(user => {
        const userName = user.name || user;
        const userPayments = appData.monthlyPayments[month][userName] || { paid: 0, remaining: parPersonne, payments: [] };
        const percentage = (userPayments.paid / parPersonne) * 100;
        
        let statusClass = 'pending';
        let statusIcon = 'fas fa-exclamation-circle';
        let statusText = 'En attente';
        
        if (userPayments.paid >= parPersonne) {
            statusClass = 'paid';
            statusIcon = 'fas fa-check-circle';
            statusText = 'Payé';
        } else if (userPayments.paid > 0) {
            statusClass = 'partial';
            statusIcon = 'fas fa-clock';
            statusText = 'Partiel';
        }
        
        detailsHtml += `
            <div class="payment-user-card ${statusClass}">
                <div class="user-header">
                    <h4>${userName}</h4>
                    <span class="status-badge ${statusClass}">
                        <i class="${statusIcon}"></i> ${statusText}
                    </span>
                </div>
                <div class="payment-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(100, percentage)}%"></div>
                    </div>
                    <div class="progress-text">${percentage.toFixed(1)}%</div>
                </div>
                <div class="payment-amounts">
                    <div class="amount-item">
                        <span class="label">Payé :</span>
                        <span class="value">${userPayments.paid.toFixed(2)} DH</span>
                    </div>
                    <div class="amount-item">
                        <span class="label">Restant :</span>
                        <span class="value">${Math.max(0, parPersonne - userPayments.paid).toFixed(2)} DH</span>
                    </div>
                    <div class="amount-item">
                        <span class="label">Paiements :</span>
                        <span class="value">${userPayments.payments.length}</span>
                    </div>
                </div>
                <div class="user-actions">
                    <button onclick="openPaymentModal('${userName}', '${month}')" class="btn btn-sm btn-primary">
                        <i class="fas fa-plus"></i> Paiement
                    </button>
                    ${userPayments.payments.length > 0 ? `
                        <button onclick="showPaymentHistory('${userName}', '${month}')" class="btn btn-sm btn-secondary">
                            <i class="fas fa-history"></i> Historique
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    detailsHtml += '</div>';
    
    // Mettre à jour l'affichage
    document.getElementById('paymentOverview').innerHTML = overviewHtml;
    document.getElementById('paymentDetails').innerHTML = detailsHtml;
    document.getElementById('paymentStatusSection').style.display = 'block';
}