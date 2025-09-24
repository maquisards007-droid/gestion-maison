# Guide de Déploiement - Gestion Maison

## Problème Résolu ✅

Le problème de perte de données après 24h sur Render a été résolu en implémentant une base de données persistante MongoDB Atlas avec un système de fallback vers fichier local.

## Configuration MongoDB Atlas (Gratuit)

### 1. Créer un compte MongoDB Atlas

1. Allez sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Créez un compte gratuit
3. Créez un nouveau cluster (choisir le plan gratuit M0)
4. Attendez que le cluster soit créé (2-3 minutes)

### 2. Configurer l'accès

1. Dans "Database Access", créez un utilisateur :
   - Username: `gestion-maison`
   - Password: `gestion123` (ou générez un mot de passe sécurisé)
   - Rôle: `readWrite` sur la base `gestion-maison`

2. Dans "Network Access", ajoutez l'IP :
   - Cliquez sur "Add IP Address"
   - Choisissez "Allow access from anywhere" (0.0.0.0/0)
   - Ou ajoutez les IPs de Render si vous les connaissez

### 3. Obtenir l'URI de connexion

1. Dans "Clusters", cliquez sur "Connect"
2. Choisissez "Connect your application"
3. Sélectionnez "Node.js" et version "4.1 or later"
4. Copiez l'URI qui ressemble à :
   ```
   mongodb+srv://gestion-maison:<password>@cluster0.xxxxx.mongodb.net/gestion-maison?retryWrites=true&w=majority
   ```
5. Remplacez `<password>` par le mot de passe de votre utilisateur

## Déploiement sur Render

### 1. Configuration des variables d'environnement

Dans le dashboard Render, ajoutez ces variables d'environnement :

```
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
MONGODB_URI=mongodb+srv://gestion-maison:gestion123@cluster0.xxxxx.mongodb.net/gestion-maison?retryWrites=true&w=majority
```

⚠️ **Important** : Remplacez l'URI MongoDB par la vôtre !

### 2. Déploiement automatique

1. Connectez votre repository GitHub à Render
2. Le fichier `render.yaml` configurera automatiquement le service
3. Render détectera les changements et redéploiera automatiquement

## Fonctionnalités de Persistance

### ✅ Ce qui est maintenant persistant :

- **Utilisateurs** : Toutes les inscriptions sont sauvegardées
- **Paiements** : Historique complet des paiements
- **Dettes** : Calculs et répartitions
- **Groupes** : Configuration des groupes de tâches
- **Rotation** : État de la rotation des tâches
- **Paramètres** : Configuration de l'application

### 🔄 Système de Sauvegarde

- **Sauvegarde automatique** : Toutes les 5 minutes
- **Sauvegarde en temps réel** : À chaque modification
- **Archivage hebdomadaire** : Chaque samedi à 23h59
- **Fallback local** : Si MongoDB n'est pas disponible

### 🛡️ Sécurité

- Variables d'environnement pour les secrets
- Connexion sécurisée à MongoDB
- Gestion d'erreurs robuste
- Déconnexion propre de la base de données

## Test Local

Pour tester localement avec MongoDB :

1. Créez un fichier `.env` :
   ```
   MONGODB_URI=mongodb+srv://votre-uri-mongodb
   NODE_ENV=development
   PORT=3000
   HOST=0.0.0.0
   ```

2. Lancez le serveur :
   ```bash
   npm install
   node server.js
   ```

3. L'application basculera automatiquement vers le fichier local si MongoDB n'est pas accessible.

## Résolution du Problème Original

### Avant ❌
- Données stockées dans un fichier local sur Render
- Fichier perdu à chaque redémarrage du serveur (24h)
- Retour à l'état initial après inactivité

### Après ✅
- Données stockées dans MongoDB Atlas (cloud)
- Persistance garantie même après redémarrage
- Synchronisation en temps réel
- Sauvegardes automatiques
- Système de fallback robuste

## Support

Si vous rencontrez des problèmes :

1. Vérifiez les logs du serveur
2. Assurez-vous que l'URI MongoDB est correcte
3. Vérifiez que l'IP est autorisée dans MongoDB Atlas
4. Le système basculera automatiquement vers le fichier local en cas de problème