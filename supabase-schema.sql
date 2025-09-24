-- Schéma de base de données pour l'application Gestion Maison
-- À exécuter dans l'éditeur SQL de Supabase

-- Table pour stocker les données principales de l'application
CREATE TABLE IF NOT EXISTS app_data (
    id TEXT PRIMARY KEY DEFAULT 'main',
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour stocker les sauvegardes
CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

-- Fonction pour créer automatiquement les tables (utilisée par l'application)
CREATE OR REPLACE FUNCTION create_app_data_table()
RETURNS VOID AS $$
BEGIN
    -- Cette fonction est appelée par l'application pour s'assurer que les tables existent
    -- Les tables sont déjà créées ci-dessus, donc cette fonction ne fait rien
    -- mais elle évite les erreurs si l'application essaie de créer les tables
    NULL;
END;
$$ LANGUAGE plpgsql;

-- Politique de sécurité RLS (Row Level Security) - optionnel
-- Décommentez si vous voulez activer la sécurité au niveau des lignes

-- ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre toutes les opérations (à adapter selon vos besoins)
-- CREATE POLICY "Allow all operations on app_data" ON app_data FOR ALL USING (true);
-- CREATE POLICY "Allow all operations on backups" ON backups FOR ALL USING (true);

-- Insertion d'une ligne par défaut si aucune donnée n'existe
INSERT INTO app_data (id, data) 
VALUES ('main', '{"users": [], "payments": [], "debts": []}')
ON CONFLICT (id) DO NOTHING;

-- Commentaires pour documentation
COMMENT ON TABLE app_data IS 'Table principale contenant les données de l''application (utilisateurs, paiements, dettes)';
COMMENT ON TABLE backups IS 'Table des sauvegardes horodatées des données';
COMMENT ON COLUMN app_data.data IS 'Données JSON de l''application';
COMMENT ON COLUMN backups.data IS 'Sauvegarde JSON des données à un moment donné';