const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const database = require('./supabase');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://gestion-maison.onrender.com"] 
      : "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// Structure de données par défaut
const defaultData = {
  adminPassword: 'admin123',
  weeklyAmount: 100,
  siteTitle: 'Gestion Cotisation Étudiante',
  users: ['Ahmed', 'Fatima', 'Youssef', 'Aicha'],
  currentWeek: getCurrentWeekKey(),
  payments: {}, // Objet organisé par semaine au lieu d'un tableau
  debts: {},
  history: {},
  groups: [],
  groupRotation: {
    startWeek: null,
    rotationOrder: ['marche', 'poulet', 'repos']
  },
  monthlyBills: {},
  monthlyPayments: {},
  monthlySettings: {
    loyerDefaut: 4500
  },
  settings: {
    adminPassword: 'admin123'
  }
};

// Fonction pour obtenir la clé de la semaine actuelle
function getCurrentWeekKey() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Lundi
  return startOfWeek.toISOString().split('T')[0];
}

// Charger les données depuis Supabase
async function loadData() {
  try {
    const data = await database.loadAppData();
    if (data) {
      console.log('✅ Données chargées depuis Supabase');
      
      // Migration automatique de l'ancienne structure vers la nouvelle
      const migratedData = migrateDataStructure(data);
      
      // Si les données ont été migrées, les sauvegarder
      if (migratedData !== data) {
        console.log('🔄 Migration de la structure des données détectée');
        await saveData(migratedData);
      }
      
      return migratedData;
    } else {
      console.log('📄 Aucune donnée trouvée, création avec données par défaut');
      await saveData(defaultData);
      return defaultData;
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement depuis Supabase:', error);
    console.log('🔄 Utilisation des données par défaut');
    return defaultData;
  }
}

// Fonction de migration des données
function migrateDataStructure(data) {
  let migrated = { ...data };
  let needsMigration = false;
  
  // Migration des paiements : tableau vers objet par semaine
  if (Array.isArray(migrated.payments)) {
    console.log('🔄 Migration des paiements: tableau → objet par semaine');
    const newPayments = {};
    
    migrated.payments.forEach(payment => {
      if (payment.week) {
        if (!newPayments[payment.week]) {
          newPayments[payment.week] = {};
        }
        newPayments[payment.week][payment.id] = payment;
      }
    });
    
    migrated.payments = newPayments;
    needsMigration = true;
  }
  
  // Migration des utilisateurs : tableau de strings vers objets
  if (migrated.users && migrated.users.length > 0 && typeof migrated.users[0] === 'string') {
    console.log('🔄 Migration des utilisateurs: strings → objets');
    migrated.users = migrated.users.map((userName, index) => ({
      id: `migrated_${Date.now()}_${index}`,
      name: userName,
      createdAt: new Date().toISOString()
    }));
    needsMigration = true;
  }
  
  // Assurer la présence de toutes les propriétés nécessaires
  const requiredProps = {
    adminPassword: 'admin123',
    weeklyAmount: 100,
    siteTitle: 'Gestion Cotisation Étudiante',
    currentWeek: getCurrentWeekKey(),
    payments: {},
    debts: {},
    history: {},
    groups: [],
    groupRotation: {
      startWeek: null,
      rotationOrder: ['marche', 'poulet', 'repos']
    },
    monthlyBills: {},
    monthlyPayments: {},
    monthlySettings: {
      loyerDefaut: 4500
    }
  };
  
  for (const [key, defaultValue] of Object.entries(requiredProps)) {
    if (!(key in migrated)) {
      migrated[key] = defaultValue;
      needsMigration = true;
    }
  }
  
  if (needsMigration) {
    console.log('✅ Migration des données terminée');
  }
  
  return migrated;
}

// Sauvegarder les données dans Supabase
async function saveData(data) {
  try {
    await database.saveAppData(data);
    console.log('💾 Données sauvegardées dans Supabase');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde dans Supabase:', error);
    return false;
  }
}

// Variable globale pour stocker les données
let appData = {};

// Fonctions d'archivage automatique
function getCurrentWeekKey() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Lundi
  return startOfWeek.toISOString().split('T')[0];
}

function formatDate(date) {
  return date.toLocaleDateString('fr-FR', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function archiveWeeklyData() {
  try {
    const currentWeek = getCurrentWeekKey();
    const now = new Date();
    
    console.log(`🗄️ [${formatDate(now)}] Début de l'archivage automatique hebdomadaire`);
    
    // Vérifier s'il y a des données à archiver pour la semaine actuelle
    if (!appData.payments || !appData.payments[currentWeek]) {
      console.log(`📝 [${formatDate(now)}] Aucune donnée de paiement à archiver pour la semaine ${currentWeek}`);
      return;
    }
    
    // Initialiser l'historique s'il n'existe pas
    if (!appData.history) {
      appData.history = {};
    }
    
    // Archiver les données de la semaine actuelle
    const weekData = {
      week: currentWeek,
      payments: appData.payments[currentWeek] || {},
      debts: appData.debts[currentWeek] || {},
      weeklyAmount: appData.weeklyAmount || 100,
      users: [...appData.users], // Copie des utilisateurs à ce moment
      archivedAt: now.toISOString(),
      archivedBy: 'system_auto'
    };
    
    // Sauvegarder dans l'historique
    appData.history[currentWeek] = weekData;
    
    // Nettoyer les données de la semaine actuelle (optionnel)
    // Vous pouvez commenter ces lignes si vous voulez garder les données actuelles
    // delete appData.payments[currentWeek];
    // delete appData.debts[currentWeek];
    
    // Sauvegarder les données mises à jour
    const saved = await saveData(appData);
    
    if (saved) {
      console.log(`✅ [${formatDate(now)}] Archivage automatique réussi pour la semaine ${currentWeek}`);
      console.log(`📊 [${formatDate(now)}] Données archivées: ${Object.keys(weekData.payments).length} paiements, ${Object.keys(weekData.debts).length} dettes`);
      
      // Notifier tous les clients connectés de l'archivage
      io.emit('weeklyArchived', {
        week: currentWeek,
        archivedAt: now.toISOString(),
        message: `Archivage automatique effectué pour la semaine du ${currentWeek}`
      });
    } else {
      console.error(`❌ [${formatDate(now)}] Erreur lors de la sauvegarde de l'archivage automatique`);
    }
    
  } catch (error) {
    console.error(`💥 [${formatDate(new Date())}] Erreur lors de l'archivage automatique:`, error);
  }
}

// Initialiser les données au démarrage
async function initializeApp() {
  try {
    // Connecter à Supabase
    await database.connect();
    
    // Charger les données
    const data = await loadData();
    appData = data;
    console.log('✅ Application initialisée avec succès');
    
    // Configurer le cron job pour l'archivage automatique
    // Chaque samedi à 23h59 (59 23 * * 6)
    cron.schedule('10 23 * * 5', () => {
      console.log('🕐 Déclenchement de l\'archivage automatique hebdomadaire...');
      archiveWeeklyData();
    }, {
      scheduled: true,
      timezone: "Europe/Paris"
    });
    
    // Sauvegarde automatique toutes les 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await database.createBackup(appData);
      } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde automatique:', error);
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    process.exit(1);
  }
}

initializeApp();

// Routes API
app.get('/api/data', async (req, res) => {
  res.json(appData);
});

app.post('/api/data', async (req, res) => {
  try {
    appData = req.body;
    await saveData(appData);
    io.emit('dataUpdate', appData);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour tester l'archivage manuel (pour les tests)
app.post('/api/test-archive', async (req, res) => {
  try {
    console.log('🧪 Test d\'archivage manuel déclenché via API');
    await archiveWeeklyData();
    res.json({ 
      success: true, 
      message: 'Archivage de test exécuté avec succès',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erreur lors du test d\'archivage:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du test d\'archivage',
      details: error.message 
    });
  }
});

// Route catch-all pour servir index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
  console.log('Nouvel utilisateur connecté:', socket.id);

  // Envoyer les données actuelles au nouveau client
  socket.emit('initialData', appData);

  // Gestionnaire pour demande explicite de données
  socket.on('requestData', () => {
    console.log('Données demandées par le client:', socket.id);
    socket.emit('initialData', appData);
  });

  // Écouter les mises à jour de données
  socket.on('updateData', async (newData) => {
    appData = newData;
    const saved = await saveData(appData);
    
    if (saved) {
      // Notifier tous les autres clients (sauf l'expéditeur)
      socket.broadcast.emit('dataUpdated', appData);
      socket.emit('updateConfirmed', { success: true });
    } else {
      socket.emit('updateConfirmed', { success: false, error: 'Erreur de sauvegarde' });
    }
  });

  // Écouter les mises à jour spécifiques
  socket.on('userAdded', async (user) => {
    appData.users.push(user);
    await saveData(appData);
    io.emit('userAdded', user);
  });

  socket.on('userUpdated', async (updatedUser) => {
    const index = appData.users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
      appData.users[index] = updatedUser;
      await saveData(appData);
      io.emit('userUpdated', updatedUser);
    }
  });

  socket.on('userDeleted', async (userId) => {
    appData.users = appData.users.filter(u => u.id !== userId);
    await saveData(appData);
    io.emit('userDeleted', userId);
  });

  socket.on('paymentAdded', async (payment) => {
    // Initialiser la structure des paiements si nécessaire
    if (!appData.payments) {
      appData.payments = {};
    }
    
    // Initialiser la semaine si nécessaire
    if (!appData.payments[payment.week]) {
      appData.payments[payment.week] = {};
    }
    
    // Ajouter le paiement avec l'ID comme clé
    appData.payments[payment.week][payment.id] = payment;
    
    console.log(`💰 Paiement ajouté: ${payment.userName} - ${payment.amount}€ (semaine ${payment.week})`);
    
    await saveData(appData);
    io.emit('paymentAdded', payment);
  });

  socket.on('debt', async (data) => {
    const { data: debt, userName } = data;
    
    // Initialiser les dettes pour la semaine si nécessaire
    if (!appData.debts[debt.week]) {
      appData.debts[debt.week] = {};
    }
    
    // Initialiser les dettes pour l'utilisateur si nécessaire
    if (!appData.debts[debt.week][userName]) {
      appData.debts[debt.week][userName] = [];
    }
    
    // Ajouter la dette
    appData.debts[debt.week][userName].push(debt);
    
    await saveData(appData);
    io.emit('debtAdded', { debt, userName });
  });



  socket.on('groupAdded', async (group) => {
    appData.groups.push(group);
    await saveData(appData);
    io.emit('groupAdded', group);
  });

  socket.on('groupUpdated', async (updatedGroup) => {
    const index = appData.groups.findIndex(g => g.id === updatedGroup.id);
    if (index !== -1) {
      appData.groups[index] = updatedGroup;
      await saveData(appData);
      io.emit('groupUpdated', updatedGroup);
    }
  });

  socket.on('groupDeleted', async (groupId) => {
    appData.groups = appData.groups.filter(g => g.id !== groupId);
    await saveData(appData);
    io.emit('groupDeleted', groupId);
  });

  socket.on('rotationReset', async (newRotation) => {
    appData.groupRotation = newRotation;
    await saveData(appData);
    io.emit('rotationReset', newRotation);
  });

  socket.on('disconnect', () => {
    console.log('Utilisateur déconnecté:', socket.id);
  });
});

// Démarrer le serveur
server.listen(PORT, HOST, () => {
  console.log(`🚀 Serveur démarré sur http://${HOST}:${PORT}`);
  console.log('📡 WebSocket prêt pour la synchronisation temps réel');
});

// Gestion propre de la fermeture de l'application
process.on('SIGINT', async () => {
  console.log('\n🔄 Arrêt du serveur en cours...');
  
  try {
    // Sauvegarder les données une dernière fois
    await saveData(appData);
    console.log('💾 Données sauvegardées avant fermeture');
    
    // Déconnecter de Supabase
    await database.disconnect();
    
    // Fermer le serveur
    server.close(() => {
      console.log('✅ Serveur fermé proprement');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Erreur lors de la fermeture:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Signal SIGTERM reçu, arrêt du serveur...');
  
  try {
    await saveData(appData);
    await database.disconnect();
    server.close(() => {
      console.log('✅ Serveur fermé proprement');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Erreur lors de la fermeture:', error);
    process.exit(1);
  }
});