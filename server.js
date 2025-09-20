const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');

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
const DATA_FILE = path.join(__dirname, 'data.json');

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
  users: [],
  payments: [],
  debts: {},
  groups: [],
  groupRotation: {
    startWeek: null,
    rotationOrder: ['marche', 'poulet', 'repos']
  },
  settings: {
    adminPassword: 'admin123'
  }
};

// Charger les données depuis le fichier JSON
async function loadData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Fichier de données non trouvé, création avec données par défaut');
    await saveData(defaultData);
    return defaultData;
  }
}

// Sauvegarder les données dans le fichier JSON
async function saveData(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
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
loadData().then(data => {
  appData = data;
  console.log('Données chargées avec succès');
  
  // Configurer le cron job pour l'archivage automatique
  // Chaque samedi à 23h59 (59 23 * * 6)
  cron.schedule('59 23 * * 6', () => {
    console.log('🕐 Déclenchement de l\'archivage automatique hebdomadaire...');
    archiveWeeklyData();
  }, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  console.log('⏰ Planificateur d\'archivage automatique configuré (chaque samedi à 23h59)');
});

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
    appData.payments.push(payment);
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