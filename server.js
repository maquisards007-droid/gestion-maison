const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Structure de données par défaut
const defaultData = {
  users: [],
  payments: [],
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

// Initialiser les données au démarrage
loadData().then(data => {
  appData = data;
  console.log('Données chargées avec succès');
});

// Routes API
app.get('/api/data', async (req, res) => {
  res.json(appData);
});

app.post('/api/data', async (req, res) => {
  appData = req.body;
  const saved = await saveData(appData);
  if (saved) {
    // Notifier tous les clients connectés
    io.emit('dataUpdated', appData);
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Erreur de sauvegarde' });
  }
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