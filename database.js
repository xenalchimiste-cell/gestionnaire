const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

// En environnement Vercel, MySQL/PostgreSQL est recommandé. 
// Pour SQLite, on utilise /tmp qui est le seul dossier inscriptible.
// Détection plus large de l'environnement Vercel
const isVercel = process.env.VERCEL || process.env.NOW_REGION;
const dbPath = isVercel 
    ? path.join(os.tmpdir(), 'database.sqlite')
    : path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeTables();
    }
});

function initializeTables() {
    db.serialize(() => {
        // Table des utilisateurs
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (!err) {
                // Créer un admin/défaut s'il n'y a pas d'erreur
                db.run(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'Admin', 'admin')`);
            }
        });

        // Table des projets
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT DEFAULT '#3b82f6',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Migration logic for existing projects
        db.all("PRAGMA table_info(projects)", (err, rows) => {
            if (err) return;
            const columns = rows.map(r => r.name);
            if (!columns.includes('user_id')) {
                db.run("ALTER TABLE projects ADD COLUMN user_id INTEGER DEFAULT 1");
            }
            if (!columns.includes('color')) {
                db.run("ALTER TABLE projects ADD COLUMN color TEXT DEFAULT '#3b82f6'");
            }
        });

        // Table des tâches
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            title TEXT NOT NULL,
            status TEXT CHECK(status IN ('A faire', 'En cours', 'Terminé')) DEFAULT 'A faire',
            priority TEXT CHECK(priority IN ('Basse', 'Moyenne', 'Haute')) DEFAULT 'Moyenne',
            due_date DATE,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`);

        // Migration logic for existing tasks
        db.all("PRAGMA table_info(tasks)", (err, rows) => {
            const columns = rows.map(r => r.name);
            if (!columns.includes('priority')) {
                db.run("ALTER TABLE tasks ADD COLUMN priority TEXT CHECK(priority IN ('Basse', 'Moyenne', 'Haute')) DEFAULT 'Moyenne'");
            }
            if (!columns.includes('description')) {
                db.run("ALTER TABLE tasks ADD COLUMN description TEXT");
            }
            if (!columns.includes('due_date')) {
                db.run("ALTER TABLE tasks ADD COLUMN due_date DATE");
            }
        });

        // Table des notes de tâches
        db.run(`CREATE TABLE IF NOT EXISTS task_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )`);
        
    });
}


module.exports = db;
