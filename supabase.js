const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class SupabaseDatabase {
  constructor() {
    this.supabase = null;
    this.isConnected = false;
    this.useFileSystem = false;
    this.dataFile = path.join(__dirname, 'data.json');
  }

  async connect() {
    try {
      // Configuration Supabase
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Variables d\'environnement Supabase manquantes');
      }

      this.supabase = createClient(supabaseUrl, supabaseKey);
      
      // Test de connexion en essayant de lire une table
      const { error } = await this.supabase
        .from('app_data')
        .select('id')
        .limit(1);

      if (error && !error.message.includes('relation "app_data" does not exist')) {
        throw error;
      }

      this.isConnected = true;
      console.log('✅ Connexion à Supabase réussie');
      
      // Créer les tables si elles n'existent pas
      await this.initializeTables();
      
      return true;
    } catch (error) {
      console.error('❌ Erreur de connexion à Supabase:', error.message);
      console.log('🔄 Basculement vers le système de fichiers local');
      this.isConnected = false;
      this.useFileSystem = true;
      return false;
    }
  }

  async initializeTables() {
    try {
      // Créer la table app_data si elle n'existe pas
      const { error: createError } = await this.supabase.rpc('create_app_data_table');
      
      if (createError && !createError.message.includes('already exists')) {
        console.log('ℹ️ Tables Supabase initialisées');
      }
    } catch (error) {
      console.log('ℹ️ Tables probablement déjà créées');
    }
  }

  async disconnect() {
    if (this.supabase) {
      this.isConnected = false;
      console.log('🔌 Déconnexion de Supabase');
    }
  }

  // Sauvegarder les données de l'application
  async saveAppData(data) {
    if (this.useFileSystem) {
      return await this.saveToFile(data);
    }

    try {
      if (!this.isConnected) {
        throw new Error('Pas de connexion à Supabase');
      }

      // Upsert des données (insert ou update)
      const { error } = await this.supabase
        .from('app_data')
        .upsert({
          id: 'main',
          data: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      console.log('💾 Données sauvegardées dans Supabase');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde Supabase:', error.message);
      console.log('🔄 Basculement vers le fichier local');
      this.useFileSystem = true;
      return await this.saveToFile(data);
    }
  }

  // Charger les données de l'application
  async loadAppData() {
    if (this.useFileSystem) {
      return await this.loadFromFile();
    }

    try {
      if (!this.isConnected) {
        throw new Error('Pas de connexion à Supabase');
      }

      const { data, error } = await this.supabase
        .from('app_data')
        .select('data')
        .eq('id', 'main')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Aucune donnée trouvée, retourner null pour que server.js utilise defaultData
          console.log('ℹ️ Aucune donnée trouvée dans Supabase');
          return null;
        }
        throw error;
      }

      console.log('📖 Données chargées depuis Supabase');
      return data.data || null;
    } catch (error) {
      console.error('❌ Erreur lors du chargement Supabase:', error.message);
      console.log('🔄 Basculement vers le fichier local');
      this.useFileSystem = true;
      return await this.loadFromFile();
    }
  }

  // Méthodes de fallback vers le système de fichiers
  async saveToFile(data) {
    try {
      await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
      console.log('💾 Données sauvegardées dans le fichier local');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde fichier:', error.message);
      return false;
    }
  }

  async loadFromFile() {
    try {
      const fileExists = await fs.access(this.dataFile).then(() => true).catch(() => false);
      if (!fileExists) {
        console.log('ℹ️ Fichier de données non trouvé, initialisation...');
        return { users: [], payments: [], debts: [] };
      }

      const fileContent = await fs.readFile(this.dataFile, 'utf8');
      const data = JSON.parse(fileContent);
      console.log('📖 Données chargées depuis le fichier local');
      return data;
    } catch (error) {
      console.error('❌ Erreur lors du chargement fichier:', error.message);
      return { users: [], payments: [], debts: [] };
    }
  }

  // Créer une sauvegarde horodatée
  async createBackup(data) {
    if (this.useFileSystem) {
      return await this.createFileBackup(data);
    }

    try {
      if (!this.isConnected) {
        throw new Error('Pas de connexion à Supabase');
      }

      const timestamp = new Date().toISOString();
      const backupId = `backup_${Date.now()}`;

      const { error } = await this.supabase
        .from('backups')
        .insert({
          id: backupId,
          data: data,
          created_at: timestamp
        });

      if (error) throw error;

      console.log(`📦 Sauvegarde créée: ${backupId}`);

      // Nettoyer les anciennes sauvegardes (garder les 10 dernières)
      await this.cleanOldBackups();

      return backupId;
    } catch (error) {
      console.error('❌ Erreur lors de la création de sauvegarde Supabase:', error.message);
      console.log('🔄 Basculement vers le fichier local');
      this.useFileSystem = true;
      return await this.createFileBackup(data);
    }
  }

  async cleanOldBackups() {
    try {
      const { data: backups, error } = await this.supabase
        .from('backups')
        .select('id, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (backups.length > 10) {
        const toDelete = backups.slice(10);
        const idsToDelete = toDelete.map(b => b.id);

        const { error: deleteError } = await this.supabase
          .from('backups')
          .delete()
          .in('id', idsToDelete);

        if (deleteError) throw deleteError;

        console.log(`🧹 ${toDelete.length} anciennes sauvegardes supprimées`);
      }
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des sauvegardes:', error.message);
    }
  }

  async createFileBackup(data) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(__dirname, 'backups');
      const backupFile = path.join(backupDir, `backup_${timestamp}.json`);

      // Créer le dossier de sauvegarde s'il n'existe pas
      await fs.mkdir(backupDir, { recursive: true });

      await fs.writeFile(backupFile, JSON.stringify(data, null, 2));
      console.log(`📦 Sauvegarde fichier créée: backup_${timestamp}.json`);

      // Nettoyer les anciennes sauvegardes fichiers
      await this.cleanOldFileBackups(backupDir);

      return `backup_${timestamp}`;
    } catch (error) {
      console.error('❌ Erreur lors de la création de sauvegarde fichier:', error.message);
      return null;
    }
  }

  async cleanOldFileBackups(backupDir) {
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('backup_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file),
          time: fs.stat(path.join(backupDir, file)).then(stats => stats.mtime)
        }));

      const filesWithStats = await Promise.all(
        backupFiles.map(async file => ({
          ...file,
          time: await file.time
        }))
      );

      filesWithStats.sort((a, b) => b.time - a.time);

      if (filesWithStats.length > 10) {
        const toDelete = filesWithStats.slice(10);
        for (const file of toDelete) {
          await fs.unlink(file.path);
        }
        console.log(`🧹 ${toDelete.length} anciennes sauvegardes fichiers supprimées`);
      }
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des sauvegardes fichiers:', error.message);
    }
  }

  // Récupérer la liste des sauvegardes
  async getBackups() {
    if (this.useFileSystem) {
      return await this.getFileBackups();
    }

    try {
      if (!this.isConnected) {
        throw new Error('Pas de connexion à Supabase');
      }

      const { data, error } = await this.supabase
        .from('backups')
        .select('id, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(backup => ({
        id: backup.id,
        date: new Date(backup.created_at).toLocaleString('fr-FR')
      }));
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des sauvegardes Supabase:', error.message);
      console.log('🔄 Basculement vers le fichier local');
      this.useFileSystem = true;
      return await this.getFileBackups();
    }
  }

  async getFileBackups() {
    try {
      const backupDir = path.join(__dirname, 'backups');
      const files = await fs.readdir(backupDir).catch(() => []);
      
      const backupFiles = files
        .filter(file => file.startsWith('backup_') && file.endsWith('.json'))
        .map(file => {
          const timestamp = file.replace('backup_', '').replace('.json', '');
          return {
            id: file.replace('.json', ''),
            date: new Date(timestamp.replace(/-/g, ':')).toLocaleString('fr-FR')
          };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      return backupFiles;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des sauvegardes fichiers:', error.message);
      return [];
    }
  }
}

module.exports = new SupabaseDatabase();