const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class Database {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.useFileSystem = false;
    this.dataFile = path.join(__dirname, 'data.json');
  }

  async connect() {
    try {
      // Essayer MongoDB Atlas avec une URI valide
      const uri = process.env.MONGODB_URI || 'mongodb+srv://gestionmaison:gestion123@cluster0.4qzjq.mongodb.net/gestion-maison?retryWrites=true&w=majority';
      
      this.client = new MongoClient(uri);

      // Test de connexion avec timeout
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      
      this.db = this.client.db('gestion-maison');
      this.isConnected = true;
      
      console.log('✅ Connexion à MongoDB réussie');
      return true;
    } catch (error) {
      console.error('❌ Erreur de connexion à MongoDB:', error.message);
      console.log('🔄 Basculement vers le système de fichiers local');
      this.isConnected = false;
      this.useFileSystem = true;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 Déconnexion de MongoDB');
    }
  }

  // Sauvegarder les données de l'application
  async saveAppData(data) {
    if (this.useFileSystem) {
      return this.saveToFile(data);
    }

    try {
      if (!this.isConnected) {
        const connected = await this.connect();
        if (!connected) {
          return this.saveToFile(data);
        }
      }

      const collection = this.db.collection('appData');
      
      // Utiliser upsert pour remplacer ou créer le document
      const result = await collection.replaceOne(
        { _id: 'main' },
        { 
          _id: 'main',
          ...data,
          lastUpdated: new Date()
        },
        { upsert: true }
      );

      console.log('💾 Données sauvegardées dans MongoDB');
      return result;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde MongoDB:', error.message);
      console.log('🔄 Basculement vers fichier local');
      return this.saveToFile(data);
    }
  }

  // Charger les données de l'application
  async loadAppData() {
    if (this.useFileSystem) {
      return this.loadFromFile();
    }

    try {
      if (!this.isConnected) {
        const connected = await this.connect();
        if (!connected) {
          return this.loadFromFile();
        }
      }

      const collection = this.db.collection('appData');
      const data = await collection.findOne({ _id: 'main' });
      
      if (data) {
        // Supprimer les champs MongoDB spécifiques
        delete data._id;
        delete data.lastUpdated;
        console.log('📥 Données chargées depuis MongoDB');
        return data;
      } else {
        console.log('📄 Aucune donnée trouvée dans MongoDB');
        return null;
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement MongoDB:', error.message);
      console.log('🔄 Basculement vers fichier local');
      return this.loadFromFile();
    }
  }

  // Méthodes de fallback pour le système de fichiers
  async saveToFile(data) {
    try {
      await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
      console.log('💾 Données sauvegardées dans fichier local');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde fichier:', error.message);
      return false;
    }
  }

  async loadFromFile() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      console.log('📥 Données chargées depuis fichier local');
      return JSON.parse(data);
    } catch (error) {
      console.log('📄 Fichier local non trouvé');
      return null;
    }
  }

  // Créer une sauvegarde avec timestamp
  async createBackup(data) {
    if (this.useFileSystem) {
      // Pour le système de fichiers, on sauvegarde juste les données principales
      return this.saveToFile(data);
    }

    try {
      if (!this.isConnected) {
        const connected = await this.connect();
        if (!connected) {
          return this.saveToFile(data);
        }
      }

      const collection = this.db.collection('backups');
      const backup = {
        data: data,
        timestamp: new Date(),
        type: 'auto'
      };

      await collection.insertOne(backup);
      console.log('🔄 Sauvegarde automatique créée dans MongoDB');
      
      // Garder seulement les 10 dernières sauvegardes
      const backups = await collection.find().sort({ timestamp: -1 }).toArray();
      if (backups.length > 10) {
        const toDelete = backups.slice(10);
        for (const backup of toDelete) {
          await collection.deleteOne({ _id: backup._id });
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la création de sauvegarde MongoDB:', error.message);
      return this.saveToFile(data);
    }
  }

  // Récupérer la liste des sauvegardes
  async getBackups() {
    if (this.useFileSystem) {
      return [];
    }

    try {
      if (!this.isConnected) {
        const connected = await this.connect();
        if (!connected) {
          return [];
        }
      }

      const collection = this.db.collection('backups');
      const backups = await collection.find()
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray();
      
      return backups;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des sauvegardes:', error.message);
      return [];
    }
  }
}

module.exports = new Database();