const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Middleware pour vérifier x-user-id
function requireAuth(req, res, next) {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' });
    req.userId = userId;
    next();
}

// ─────────────────────────────────────────────
// AUTH ROUTER
// ─────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function(err) {
        if (err) return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
        res.json({ id: this.lastID, username });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT id, username FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
        res.json(user);
    });
});


// ─────────────────────────────────────────────
// PROJETS (Authentifiés)
// ─────────────────────────────────────────────

app.get('/api/projects', requireAuth, (req, res) => {
    db.all(`
        SELECT p.*, 
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'Terminé') as done_tasks
        FROM projects p 
        WHERE p.user_id = ? 
        ORDER BY p.created_at DESC
    `, [req.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/projects', requireAuth, (req, res) => {
    const { name, description, color } = req.body;
    const finalColor = color || '#3b82f6';
    db.run('INSERT INTO projects (user_id, name, description, color) VALUES (?, ?, ?, ?)', [req.userId, name, description, finalColor], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, user_id: req.userId, name, description, color: finalColor });
    });
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
    const { name, description, color } = req.body;
    db.run('UPDATE projects SET name = ?, description = ?, color = ? WHERE id = ? AND user_id = ?', 
        [name, description, color, req.params.id, req.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Project updated' });
    });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Project deleted' });
    });
});

// ─────────────────────────────────────────────
// TACHES & NOTES (Authentifiés)
// ─────────────────────────────────────────────

app.get('/api/projects/:projectId/tasks', requireAuth, (req, res) => {
    // Vérifier que le projet appartient au user
    db.get('SELECT id FROM projects WHERE id = ? AND user_id = ?', [req.params.projectId, req.userId], (err, proj) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!proj) return res.status(403).json({ error: 'Access denied' });
        
        db.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC', [req.params.projectId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

app.post('/api/tasks', requireAuth, (req, res) => {
    const { project_id, title, status, priority, description, due_date } = req.body;
    db.run('INSERT INTO tasks (project_id, title, status, priority, description, due_date) VALUES (?, ?, ?, ?, ?, ?)', 
        [project_id, title, status || 'A faire', priority || 'Moyenne', description, due_date], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, project_id, title, status, priority, description, due_date });
    });
});

app.put('/api/tasks/:id', requireAuth, (req, res) => {
    const { title, status, priority, description, due_date } = req.body;
    db.run(`UPDATE tasks SET 
        title = COALESCE(?, title), 
        status = COALESCE(?, status), 
        priority = COALESCE(?, priority), 
        description = COALESCE(?, description),
        due_date = COALESCE(?, due_date)
        WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)`, 
        [title, status, priority, description, due_date, req.params.id, req.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Task updated' });
    });
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM tasks WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)', 
        [req.params.id, req.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Task deleted' });
    });
});

app.get('/api/tasks/:taskId/notes', requireAuth, (req, res) => {
    db.all('SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at DESC', [req.params.taskId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tasks/:taskId/notes', requireAuth, (req, res) => {
    const { content } = req.body;
    db.run('INSERT INTO task_notes (task_id, content) VALUES (?, ?)', [req.params.taskId, content], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, task_id: req.params.taskId, content });
    });
});


// Récupérer les statistiques du Dashboard Personnel
app.get('/api/user/stats', requireAuth, (req, res) => {
    db.all(`
        SELECT 
            COUNT(p.id) as total_projects,
            (SELECT COUNT(*) FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)) as total_tasks,
            (SELECT COUNT(*) FROM tasks WHERE status = 'A faire' AND project_id IN (SELECT id FROM projects WHERE user_id = ?)) as todo,
            (SELECT COUNT(*) FROM tasks WHERE status = 'En cours' AND project_id IN (SELECT id FROM projects WHERE user_id = ?)) as doing,
            (SELECT COUNT(*) FROM tasks WHERE status = 'Terminé' AND project_id IN (SELECT id FROM projects WHERE user_id = ?)) as done,
            (SELECT COUNT(*) FROM tasks WHERE priority = 'Haute' AND project_id IN (SELECT id FROM projects WHERE user_id = ?)) as highPriority
        FROM projects p
        WHERE p.user_id = ?
    `, [req.userId, req.userId, req.userId, req.userId, req.userId, req.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const stats = rows[0] || { total_projects: 0, total_tasks: 0, todo: 0, doing: 0, done: 0, highPriority: 0 };
        
        db.all(`
            SELECT t.*, p.name as project_name
            FROM tasks t 
            JOIN projects p ON t.project_id = p.id
            WHERE p.user_id = ?
            ORDER BY t.created_at DESC
            LIMIT 5
        `, [req.userId], (err2, recentTasks) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ stats, recentTasks });
        });
    });
});

// ─────────────────────────────────────────────
// ADMIN ROUTE
// ─────────────────────────────────────────────

app.get('/api/admin/stats', requireAuth, (req, res) => {
    if (req.userId != 1) return res.status(403).json({ error: 'Forbidden: Admins only' });

    db.all(`
        SELECT 
            p.id, p.name, p.description, p.created_at,
            u.username as creator_name,
            COUNT(t.id) as total_tasks,
            SUM(CASE WHEN t.status='A faire' THEN 1 ELSE 0 END) as todo,
            SUM(CASE WHEN t.status='En cours' THEN 1 ELSE 0 END) as doing,
            SUM(CASE WHEN t.status='Terminé' THEN 1 ELSE 0 END) as done
        FROM projects p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
    `, [], (err, projects) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all(`
            SELECT t.*, u.username as creator_name 
            FROM tasks t 
            JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
            ORDER BY t.created_at DESC
        `, [], (err2, tasks) => {
            if (err2) return res.status(500).json({ error: err2.message });
            
            res.json({
                projects,
                tasks,
                stats: {
                    totalProjects: projects.length,
                    totalTasks: tasks.length,
                    todo: tasks.filter(t => t.status === 'A faire').length,
                    doing: tasks.filter(t => t.status === 'En cours').length,
                    done: tasks.filter(t => t.status === 'Terminé').length,
                    highPriority: tasks.filter(t => t.priority === 'Haute').length
                }
            });
        });
    });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
