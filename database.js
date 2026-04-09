const fs = require('fs');
const path = require('path');
const os = require('os');

// Détection de l'environnement Vercel
const isVercel = process.env.VERCEL || process.env.NOW_REGION;
const dbPath = isVercel 
    ? path.join(os.tmpdir(), 'database.json')
    : path.resolve(__dirname, 'database.json');

// Structure initiale de la base de données
const initialData = {
    users: [{ id: 1, username: 'Admin', password: 'admin' }],
    projects: [],
    tasks: [],
    task_notes: []
};

// HELPER: Charger les données
function loadData() {
    try {
        if (!fs.existsSync(dbPath)) {
            saveData(initialData);
            return initialData;
        }
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
        return initialData;
    }
}

// HELPER: Sauvegarder les données
function saveData(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

/**
 * MOCK SQLITE INTERFACE
 * Pour permettre au reste de l'app de fonctionner sans changement.
 */
const db = {
    run: function(sql, params, callback) {
        const data = loadData();
        
        // Simuler INSERT INTO
        if (sql.includes('INSERT INTO projects')) {
            const [user_id, name, description, color] = params;
            const newProj = { id: Date.now(), user_id, name, description, color, created_at: new Date() };
            data.projects.push(newProj);
            this.lastID = newProj.id;
        } 
        else if (sql.includes('INSERT INTO tasks')) {
            const [project_id, title, status, priority, description, due_date] = params;
            const newTask = { id: Date.now(), project_id, title, status, priority, description, due_date, created_at: new Date() };
            data.tasks.push(newTask);
            this.lastID = newTask.id;
        }
        else if (sql.includes('INSERT INTO task_notes')) {
            const [task_id, content] = params;
            const newNote = { id: Date.now(), task_id, content, created_at: new Date() };
            data.task_notes.push(newNote);
            this.lastID = newNote.id;
        }
        else if (sql.includes('INSERT OR IGNORE INTO users')) {
             // Admin est déjà présent
        }
        else if (sql.includes('INSERT INTO users')) {
            const [username, password] = params;
            const newUser = { id: Date.now(), username, password };
            data.users.push(newUser);
            this.lastID = newUser.id;
        }
        // Simuler UPDATE tasks
        else if (sql.includes('UPDATE tasks')) {
            const [title, status, priority, description, due_date, id, userId] = params;
            const task = data.tasks.find(t => t.id == id);
            if (task) {
                if (title !== undefined) task.title = title;
                if (status !== undefined) task.status = status;
                if (priority !== undefined) task.priority = priority;
                if (description !== undefined) task.description = description;
                if (due_date !== undefined) task.due_date = due_date;
            }
        }
        // Simuler DELETE
        else if (sql.includes('DELETE FROM projects')) {
            const [id, userId] = params;
            data.projects = data.projects.filter(p => !(p.id == id && p.user_id == userId));
            data.tasks = data.tasks.filter(t => t.project_id != id);
        }
        else if (sql.includes('DELETE FROM tasks')) {
            const [id, userId] = params;
            data.tasks = data.tasks.filter(t => t.id != id);
        }

        saveData(data);
        if (callback) callback.call(this, null);
        return this;
    },

    get: function(sql, params, callback) {
        const data = loadData();
        let result = null;

        if (sql.includes('SELECT id, username FROM users')) {
            const [username, password] = params;
            result = data.users.find(u => u.username === username && u.password === password);
        }
        else if (sql.includes('SELECT id FROM projects')) {
            const [id, userId] = params;
            result = data.projects.find(p => p.id == id && p.user_id == userId);
        }

        if (callback) callback(null, result);
    },

    all: function(sql, params, callback) {
        const data = loadData();
        let results = [];

        if (sql.includes('FROM projects')) {
            const [userId] = params;
            results = data.projects.filter(p => p.user_id == userId).map(p => {
                const pTasks = data.tasks.filter(t => t.project_id == p.id);
                return {
                    ...p,
                    total_tasks: pTasks.length,
                    done_tasks: pTasks.filter(t => t.status === 'Terminé').length
                };
            });
        }
        else if (sql.includes('FROM tasks WHERE project_id = ?')) {
            results = data.tasks.filter(t => t.project_id == params[0]);
        }
        else if (sql.includes('FROM task_notes')) {
            results = data.task_notes.filter(n => n.task_id == params[0]);
        }
        else if (sql.includes('user/stats')) {
            const [uId] = params;
            const userProjs = data.projects.filter(p => p.user_id == uId);
            const userProjIds = userProjs.map(p => p.id);
            const userTasks = data.tasks.filter(t => userProjIds.includes(t.project_id));
            
            results = [{
                total_projects: userProjs.length,
                total_tasks: userTasks.length,
                todo: userTasks.filter(t => t.status === 'A faire').length,
                doing: userTasks.filter(t => t.status === 'En cours').length,
                done: userTasks.filter(t => t.status === 'Terminé').length,
                highPriority: userTasks.filter(t => t.priority === 'Haute').length
            }];
        }
        else if (sql.includes('SELECT t.*, p.name as project_name')) {
            const [uId] = params;
            const userProjs = data.projects.filter(p => p.user_id == uId);
            const userProjIds = userProjs.map(p => p.id);
            results = data.tasks
                .filter(t => userProjIds.includes(t.project_id))
                .map(t => ({...t, project_name: userProjs.find(p => p.id == t.project_id)?.name }))
                .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 5);
        }

        if (callback) callback(null, results);
    },

    serialize: function(fn) {
        fn();
    }
};

module.exports = db;
