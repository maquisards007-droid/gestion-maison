# 🏠 Gestion Maison - Application de Cotisations Étudiantes

Application web temps réel pour gérer les cotisations, groupes et rotations de tâches dans une maison étudiante.

## ✨ Fonctionnalités

- 👥 **Gestion des utilisateurs** - Ajout/suppression en temps réel
- 💰 **Suivi des paiements** - Enregistrement et historique des cotisations
- 🔄 **Rotation des tâches** - Gestion automatique des groupes (marché, poulet, repos)
- 📊 **Tableau de bord** - Vue d'ensemble des statuts et statistiques
- 🔐 **Interface admin** - Gestion sécurisée des paramètres
- ⚡ **Synchronisation temps réel** - Mises à jour instantanées via WebSocket

## 🚀 Déploiement

### Prérequis
- Node.js 18+ 
- npm ou yarn

### Installation locale
```bash
npm install
npm start
```

### Variables d'environnement
- `PORT` - Port du serveur (défaut: 3000)
- `HOST` - Adresse d'écoute (défaut: 0.0.0.0)

## 🛠️ Technologies utilisées

- **Backend**: Node.js, Express.js, Socket.io
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Stockage**: JSON file-based
- **Temps réel**: WebSocket avec Socket.io

## 📱 Utilisation

1. Accédez à l'application via le lien fourni
2. **Espace public** : Consultez les statuts et effectuez des paiements
3. **Espace admin** : Gérez les utilisateurs, groupes et paramètres (mot de passe requis)

### Fonctionnalités principales :
- **Paiements** : Enregistrement des cotisations hebdomadaires
- **Groupes** : Création et gestion des équipes
- **Rotations** : Suivi automatique des tâches par semaine
- **Historique** : Consultation des paiements passés

## 🔧 Configuration

L'application utilise un fichier `data.json` pour la persistance des données. Les paramètres par défaut incluent :
- Montant hebdomadaire : 100€
- Mot de passe admin : admin123 (à changer)
- Rotation des tâches : marché → poulet → repos

## 📞 Support

Pour toute question ou problème, contactez l'administrateur de la maison.

---
*Application développée pour simplifier la gestion quotidienne d'une maison étudiante* 🎓