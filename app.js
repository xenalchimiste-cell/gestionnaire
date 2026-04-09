const API_URL = '/api';

// State
let currentProjectId = null;
let currentTaskId = null;
let pomodoroInterval = null;
let pomodoroTime = 5;
let isPomodoroRunning = false;
let myChart = null;

// DOM Elements
const projectsGrid = document.getElementById('projects-grid');
const projectSection = document.getElementById('project-section');
const taskSection = document.getElementById('task-section');
const projectModal = document.getElementById('project-modal');
const taskModal = document.getElementById('task-modal');
const taskDashboard = document.getElementById('task-dashboard');
const projectForm = document.getElementById('project-form');
const taskForm = document.getElementById('task-form');
const noteForm = document.getElementById('note-form');
const currentProjectTitle = document.getElementById('current-project-title');
const userNameDisplay = document.getElementById('user-name-display');

// Intercepter Fetch pour ajouter x-user-id
const originalFetch = window.fetch;
window.fetch = async function(resource, config) {
    if (typeof resource === 'string' && resource.startsWith(API_URL) && !resource.startsWith(API_URL + '/auth') && !resource.startsWith(API_URL + '/admin')) {
        config = config || {};
        config.headers = config.headers || {};
        const uid = localStorage.getItem('userId');
        if (uid) {
            config.headers['x-user-id'] = uid;
        } else {
            // S'il n'y a pas d'ID mais c'est une route protégée, on bloque
            return new Response(JSON.stringify({error: 'No user'}), { status: 401 });
        }
    }
    return await originalFetch(resource, config);
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    setupAuth();
    setupEventListeners();
    setupPomodoro();
    
    if (localStorage.getItem('userId')) {
        initApp();
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-wrapper').classList.add('hidden');
    }
});

function initApp() {
    const name = localStorage.getItem('userName');
    
    if (name === 'Admin') {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-wrapper').classList.add('hidden');
        loadAdminData();
    } else {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-wrapper').classList.remove('hidden');
        const display = name || 'Développeur';
        userNameDisplay.innerText = display;
        const avatarEl = document.getElementById('user-avatar-initials');
        if (avatarEl) avatarEl.innerText = display.charAt(0).toUpperCase();
        fetchProjects();
    }
}

async function loadAdminData() {
    const res = await originalFetch(API_URL + '/admin/stats', {
        headers: { 'x-user-id': localStorage.getItem('userId') }
    });
    if (res.ok) {
        const data = await res.json();
        openAdminPanel(data);
    } else {
        // Fallback en cas d'erreur admin
        localStorage.clear();
        location.reload();
    }
}

function setupAuth() {
    const authForm = document.getElementById('auth-form');
    const authError = document.getElementById('auth-error');

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        const route = window.authMode === 'register' ? '/auth/register' : '/auth/login';

        const res = await originalFetch(API_URL + route, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
            const err = await res.json();
            authError.innerText = err.error || 'Erreur d\'authentification';
            authError.classList.remove('hidden');
            return;
        }

        const user = await res.json();
        localStorage.setItem('userId', user.id);
        localStorage.setItem('userName', user.username);
        authError.classList.add('hidden');
        authForm.reset();
        initApp();
    };
}

function setupEventListeners() {
    // Logout
    document.getElementById('btn-logout').onclick = (e) => {
        e.preventDefault();
        localStorage.removeItem('userId');
        localStorage.removeItem('userName');
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-wrapper').classList.add('hidden');
        projectsGrid.innerHTML = '';
        currentProjectId = null;
        taskSection.classList.add('hidden');
        document.getElementById('user-dashboard-section').classList.add('hidden');
        projectSection.classList.remove('hidden');
    };

    // User Dashboard
    document.getElementById('btn-my-dashboard').onclick = async () => {
        projectSection.classList.add('hidden');
        taskSection.classList.add('hidden');
        document.getElementById('user-dashboard-section').classList.remove('hidden');
        await loadUserDashboard();
    };

    document.getElementById('btn-back-to-projects').onclick = () => {
        document.getElementById('user-dashboard-section').classList.add('hidden');
        taskSection.classList.add('hidden');
        projectSection.classList.remove('hidden');
    };

    // Project View
    document.getElementById('btn-add-project').onclick = () => {
        document.getElementById('modal-project-title').innerText = 'Nouveau Projet';
        document.getElementById('project-id').value = '';
        projectForm.reset();
        projectModal.classList.remove('hidden');
    };

    // Task View
    document.getElementById('btn-back').onclick = () => {
        taskSection.classList.add('hidden');
        projectSection.classList.remove('hidden');
        currentProjectId = null;
    };

    document.getElementById('btn-add-task').onclick = () => {
        document.getElementById('modal-task-title').innerText = 'Nouvelle Tâche';
        document.getElementById('btn-task-submit').innerText = 'Ajouter';
        document.getElementById('task-id').value = '';
        document.getElementById('task-project-id').value = currentProjectId;
        taskForm.reset();
        taskModal.classList.remove('hidden');
    };

    // Modals Close
    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.onclick = () => {
            projectModal.classList.add('hidden');
            taskModal.classList.add('hidden');
        };
    });
    
    document.querySelector('.btn-close-dash').onclick = () => {
        taskDashboard.classList.add('hidden');
    };

    // Forms
    projectForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('project-id').value;
        const data = {
            name: document.getElementById('p-name').value,
            description: document.getElementById('p-desc').value,
            color: document.getElementById('p-color').value
        };

        if (id) {
            await fetch(`${API_URL}/projects/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            await fetch(`${API_URL}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        projectModal.classList.add('hidden');
        fetchProjects();
    };

    taskForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('task-id').value;
        const data = {
            project_id: currentProjectId,
            title: document.getElementById('t-title').value,
            status: document.getElementById('t-status').value,
            priority: document.getElementById('t-priority').value,
            description: document.getElementById('t-desc').value,
            due_date: document.getElementById('t-due-date').value
        };

        if (id) {
            await fetch(`${API_URL}/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        taskModal.classList.add('hidden');
        showProjectTasks(currentProjectId, currentProjectTitle.innerText);
    };
    
    noteForm.onsubmit = async (e) => {
        e.preventDefault();
        const content = document.getElementById('note-input').value;
        await fetch(`${API_URL}/tasks/${currentTaskId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        document.getElementById('note-input').value = '';
        fetchNotes(currentTaskId);
    };
    
    document.getElementById('btn-delete-from-dash').onclick = async () => {
        if(confirm('Supprimer cette tâche ?')) {
            await fetch(`${API_URL}/tasks/${currentTaskId}`, { method: 'DELETE' });
            taskDashboard.classList.add('hidden');
            showProjectTasks(currentProjectId, currentProjectTitle.innerText);
        }
    };
    
    document.getElementById('btn-edit-from-dash').onclick = async () => {
        const res = await fetch(`${API_URL}/projects/${currentProjectId}/tasks`);
        const tasks = await res.json();
        const task = tasks.find(t => t.id === currentTaskId);
        taskDashboard.classList.add('hidden');
        editTask(task.id, task.title, task.status, task.priority, task.description, task.due_date);
    };
}

// Projects
async function fetchProjects() {
    const res = await fetch(`${API_URL}/projects`);
    const projects = await res.json();
    projectsGrid.innerHTML = '';
    
    projects.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        const customColor = p.color || '#3b82f6';
        card.style.borderTop = `4px solid ${customColor}`;
        card.innerHTML = `
            <div class="card-body">
                <h3>${p.name}</h3>
                <p>${p.description || 'Aucune description'}</p>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary btn-sm" data-action="edit">Modifier</button>
                <button class="btn btn-danger btn-sm" data-action="delete">Suppr.</button>
            </div>
        `;

        // Clic sur le corps de la carte → ouvrir les tâches
        card.querySelector('.card-body').addEventListener('click', () => {
            showProjectTasks(p.id, p.name);
        });

        // Bouton Modifier
        card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('modal-project-title').innerText = 'Modifier le Projet';
            document.getElementById('project-id').value = p.id;
            document.getElementById('p-name').value = p.name;
            document.getElementById('p-desc').value = p.description || '';
            document.getElementById('p-color').value = p.color || '#3b82f6';
            projectModal.classList.remove('hidden');
        });

        // Bouton Supprimer
        card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Supprimer ce projet et toutes ses tâches ?')) {
                await fetch(`${API_URL}/projects/${p.id}`, { method: 'DELETE' });
                fetchProjects();
            }
        });

        projectsGrid.appendChild(card);
    });
}

// (deleteProject/editProject sont maintenant gérés via addEventListener dans fetchProjects)

// Tasks
window.showProjectTasks = async (id, name) => {
    currentProjectId = id;
    currentProjectTitle.innerText = name;
    projectSection.classList.add('hidden');
    taskSection.classList.remove('hidden');

    const res = await fetch(`${API_URL}/projects/${id}/tasks`);
    const tasks = await res.json();
    
    const columns = {
        'A faire': document.getElementById('todo-list'),
        'En cours': document.getElementById('doing-list'),
        'Terminé': document.getElementById('done-list')
    };

    Object.values(columns).forEach(el => {
        el.innerHTML = '';
        // Drop zone events
        el.addEventListener('dragover', e => {
            e.preventDefault();
            el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => {
            el.classList.remove('drag-over');
        });
        el.addEventListener('drop', async e => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const taskId = e.dataTransfer.getData('text/plain');
            const draggedEl = document.getElementById('task-card-' + taskId);
            if (!draggedEl) return;
            
            el.appendChild(draggedEl);
            
            let newStatus = 'A faire';
            if (el.id === 'doing-list') newStatus = 'En cours';
            if (el.id === 'done-list') newStatus = 'Terminé';
            
            // Backend update
            await fetch(`${API_URL}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: currentProjectId,
                    status: newStatus
                })
            });
            
            // Update counts
            document.getElementById('count-todo').innerText  = document.getElementById('todo-list').children.length;
            document.getElementById('count-doing').innerText = document.getElementById('doing-list').children.length;
            document.getElementById('count-done').innerText  = document.getElementById('done-list').children.length;
        });
    });

    tasks.forEach(t => {
        const item = document.createElement('div');
        item.className = 'task-item';
        item.id = 'task-card-' + t.id;
        item.draggable = true;
        
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', t.id);
            setTimeout(() => item.classList.add('dragging'), 0);
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
        
        item.onclick = (e) => {
            if (!item.classList.contains('dragging')) {
                openTaskDashboard(t);
            }
        };
        
        let lateBadge = '';
        if (t.due_date && t.status !== 'Terminé') {
            const today = new Date().toISOString().split('T')[0];
            if (t.due_date < today) {
                lateBadge = '<span class="status-late">RETARD</span>';
            }
        }

        item.innerHTML = `
            <span class="task-title">${t.title}${lateBadge}</span>
            <div class="task-meta">
                <span class="badge priority-${t.priority || 'Moyenne'}">${t.priority || 'Moyenne'}</span>
                ${t.due_date ? `<span class="task-due-date">📅 ${new Date(t.due_date).toLocaleDateString()}</span>` : ''}
            </div>
        `;
        columns[t.status]?.appendChild(item);
    });

    // Mise à jour initiale des compteurs de colonnes
    document.getElementById('count-todo').innerText  = document.getElementById('todo-list').children.length;
    document.getElementById('count-doing').innerText = document.getElementById('doing-list').children.length;
    document.getElementById('count-done').innerText  = document.getElementById('done-list').children.length;
};

async function openTaskDashboard(task) {
    currentTaskId = task.id;
    document.getElementById('dash-task-title').innerText = task.title;
    document.getElementById('dash-task-desc').innerText = task.description || 'Aucune description fournie.';
    document.getElementById('dash-task-status').innerText = task.status;
    document.getElementById('dash-task-priority').innerText = task.priority;
    document.getElementById('dash-task-priority').className = `badge priority-${task.priority}`;
    document.getElementById('dash-task-date').innerText = new Date(task.created_at).toLocaleDateString();
    
    const dueDateEl = document.getElementById('dash-task-due-date');
    if (dueDateEl) dueDateEl.innerText = task.due_date ? new Date(task.due_date).toLocaleDateString() : '—';

    taskDashboard.classList.remove('hidden');
    fetchNotes(task.id);
}

async function fetchNotes(taskId) {
    const res = await fetch(`${API_URL}/tasks/${taskId}/notes`);
    const notes = await res.json();
    const list = document.getElementById('notes-list');
    list.innerHTML = notes.length ? '' : '<p class="text-muted">Aucune note pour le moment.</p>';
    
    notes.forEach(n => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.innerHTML = `
            <p>${n.content}</p>
            <span class="note-date">${new Date(n.created_at).toLocaleString()}</span>
        `;
        list.appendChild(div);
    });
}

window.editTask = (id, title, status, priority, desc, due_date) => {
    document.getElementById('modal-task-title').innerText = 'Modifier la Tâche';
    document.getElementById('btn-task-submit').innerText = 'Enregistrer';
    document.getElementById('task-id').value = id;
    document.getElementById('t-title').value = title;
    document.getElementById('t-status').value = status;
    document.getElementById('t-priority').value = priority;
    document.getElementById('t-desc').value = desc === 'null' ? '' : desc;
    document.getElementById('t-due-date').value = due_date || '';
    taskModal.classList.remove('hidden');
};

// ─────────────────────────────────────────────
// USER DASHBOARD
// ─────────────────────────────────────────────

async function loadUserDashboard() {
    const res = await originalFetch(API_URL + '/user/stats', {
        headers: { 'x-user-id': localStorage.getItem('userId') }
    });
    
    if (res.ok) {
        const { stats, recentTasks } = await res.json();
        
        document.getElementById('user-stat-projects').innerText = stats.total_projects;
        document.getElementById('user-stat-tasks').innerText = stats.total_tasks;
        document.getElementById('user-stat-doing').innerText = stats.doing;
        document.getElementById('user-stat-done').innerText = stats.done;
        document.getElementById('user-stat-high').innerText = stats.highPriority;
        
        const pct = stats.total_tasks > 0 ? Math.round((stats.done / stats.total_tasks) * 100) : 0;
        document.getElementById('user-stat-completion').innerText = pct + '%';
        
        renderCharts(stats);

        const recentList = document.getElementById('user-recent-list');
        recentList.innerHTML = '';
        if (recentTasks.length === 0) {
            recentList.innerHTML = '<p class="text-muted">Aucune activité récente.</p>';
        } else {
            recentTasks.forEach(t => {
                const div = document.createElement('div');
                div.className = 'recent-item';
                const statusColors = { 'A faire': '#94a3b8', 'En cours': '#fbbf24', 'Terminé': '#34d399' };
                div.innerHTML = `
                    <div class="recent-dot" style="background:${statusColors[t.status] || '#94a3b8'}"></div>
                    <div>
                        <p class="recent-title">${t.title} <span class="text-muted" style="font-size:0.75rem;font-weight:normal">(${t.project_name})</span></p>
                        <p class="recent-date">${new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                `;
                recentList.appendChild(div);
            });
        }
    }
}

// ─────────────────────────────────────────────
//  ADMIN PANEL
// ─────────────────────────────────────────────

const adminPanel        = document.getElementById('admin-panel');

// Quitter le panel admin (Déconnexion admin)
document.getElementById('btn-close-admin').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

// Construire et afficher le panel admin
function openAdminPanel(data) {
    const { stats, projects, tasks, user } = data;

    // --- Stats ---
    document.getElementById('stat-projects').innerText = stats.totalProjects;
    document.getElementById('stat-tasks').innerText    = stats.totalTasks;
    document.getElementById('stat-todo').innerText     = stats.todo;
    document.getElementById('stat-doing').innerText    = stats.doing;
    document.getElementById('stat-done').innerText     = stats.done;
    document.getElementById('stat-high').innerText     = stats.highPriority;
    document.getElementById('stat-user').innerText     = user?.name || '—';
    const pct = stats.totalTasks > 0 ? Math.round((stats.done / stats.totalTasks) * 100) : 0;
    document.getElementById('stat-completion').innerText = pct + '%';

    // --- Table Projets avec barres de progression ---
    const projBody = document.getElementById('admin-projects-body');
    projBody.innerHTML = '';
    if (projects.length === 0) {
        projBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">Aucun projet</td></tr>';
    } else {
        projects.forEach(p => {
            const total = p.total_tasks || 0;
            const done  = p.done || 0;
            const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="td-name">${p.name}</td>
                <td><span style="font-size:0.85rem;color:var(--text-2)">${p.creator_name || 'Inconnu'}</span></td>
                <td style="min-width:120px">
                    <div class="progress-bar-wrap">
                        <div class="progress-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <span style="font-size:0.7rem;color:var(--text-3)">${pct}% (${done}/${total})</span>
                </td>
                <td class="td-center">${total}</td>
                <td class="td-center" style="color:var(--green);font-weight:600">${done}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="adminDeleteProject(${p.id}, this)">Suppr.</button>
                </td>
            `;
            projBody.appendChild(tr);
        });
    }

    // --- Table Tâches ---
    const allTasks = tasks;
    renderTasksTable(allTasks);

    // Filter live
    const filterInput = document.getElementById('admin-filter');
    filterInput.value = '';
    filterInput.oninput = function() {
        const q = this.value.toLowerCase();
        renderTasksTable(allTasks.filter(t =>
            t.title.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q)
        ));
    };

    // --- Activité récente (10 dernières tâches) ---
    const recentList = document.getElementById('admin-recent-list');
    recentList.innerHTML = '';
    const recent = [...tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
    if (recent.length === 0) {
        recentList.innerHTML = '<p class="text-muted">Aucune activité.</p>';
    } else {
        recent.forEach(t => {
            const div = document.createElement('div');
            div.className = 'recent-item';
            const statusColors = { 'A faire': '#94a3b8', 'En cours': '#fbbf24', 'Terminé': '#34d399' };
            div.innerHTML = `
                <div class="recent-dot" style="background:${statusColors[t.status] || '#94a3b8'}"></div>
                <div>
                    <p class="recent-title">${t.title}</p>
                    <p class="recent-date">${new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
            `;
            recentList.appendChild(div);
        });
    }

    // --- Export CSV ---
    document.getElementById('btn-export-csv').onclick = () => exportCSV(projects, tasks, user);

    adminPanel.classList.remove('hidden');
}

function renderTasksTable(tasks) {
    const tbody = document.getElementById('admin-tasks-body');
    tbody.innerHTML = '';
    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">Aucune tâche trouvée</td></tr>';
        return;
    }
    const statusColors = { 'A faire': '#94a3b8', 'En cours': '#fbbf24', 'Terminé': '#34d399' };
    tasks.forEach(t => {
        const pClass = `priority-${t.priority || 'Moyenne'}`;
        const sColor = statusColors[t.status] || '#94a3b8';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="td-name">${t.title}</td>
            <td><span style="font-size:0.85rem;color:var(--text-2)">${t.creator_name || 'Inconnu'}</span></td>
            <td><span style="color:${sColor};font-weight:600;font-size:0.8rem">${t.status}</span></td>
            <td><span class="badge ${pClass}">${t.priority || 'Moyenne'}</span></td>
            <td>${new Date(t.created_at).toLocaleDateString('fr-FR')}</td>
            <td><button class="btn btn-danger btn-sm" onclick="adminDeleteTask(${t.id}, this)">✕</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// Suppression rapide depuis l'admin
window.adminDeleteProject = async (id, btn) => {
    if (!confirm('Supprimer ce projet et toutes ses tâches ?')) return;
    await fetch(`${API_URL}/projects/${id}`, { method: 'DELETE' });
    btn.closest('tr').remove();
};

window.adminDeleteTask = async (id, btn) => {
    if (!confirm('Supprimer cette tâche ?')) return;
    await fetch(`${API_URL}/tasks/${id}`, { method: 'DELETE' });
    btn.closest('tr').remove();
};

// Export CSV
function exportCSV(projects, tasks, user) {
    let csv = 'DEVPROJECT MANAGER - Export\n\n';
    csv += `Utilisateur,${user?.name || ''}\n`;
    csv += `Exporté le,${new Date().toLocaleString('fr-FR')}\n\n`;

    csv += 'PROJETS\n';
    csv += 'ID,Nom,Description,Total tâches,Terminées,Créé le\n';
    projects.forEach(p => {
        csv += `${p.id},"${p.name}","${p.description || ''}",${p.total_tasks},${p.done || 0},${new Date(p.created_at).toLocaleDateString('fr-FR')}\n`;
    });

    csv += '\nTÂCHES\n';
    csv += 'ID,Titre,Statut,Priorité,Créé le\n';
    tasks.forEach(t => {
        csv += `${t.id},"${t.title}","${t.status}","${t.priority || ''}",${new Date(t.created_at).toLocaleDateString('fr-FR')}\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `devproject_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// NEW FEATURES LOGIC
// ─────────────────────────────────────────────

function setupPomodoro() {
    const minEl = document.getElementById('pomo-minutes');
    const secEl = document.getElementById('pomo-seconds');
    const statusEl = document.getElementById('pomo-status-text');
    const startBtn = document.getElementById('pomo-start');
    const pauseBtn = document.getElementById('pomo-pause');
    const resetBtn = document.getElementById('pomo-reset');
    const modal = document.getElementById('pomodoro-modal');
    
    document.getElementById('btn-pomodoro').onclick = () => modal.classList.remove('hidden');
    document.getElementById('pomo-close').onclick = () => modal.classList.add('hidden');

    function updateDisplay() {
        const m = Math.floor(pomodoroTime / 60);
        const s = pomodoroTime % 60;
        minEl.innerText = m.toString().padStart(2, '0');
        secEl.innerText = s.toString().padStart(2, '0');
    }

    startBtn.onclick = () => {
        if (isPomodoroRunning) return;
        isPomodoroRunning = true;
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        
        pomodoroInterval = setInterval(() => {
            pomodoroTime--;
            updateDisplay();
            if (pomodoroTime <= 0) {
                clearInterval(pomodoroInterval);
                isPomodoroRunning = false;
                alert("Mode Focus terminé ! C'est l'heure d'une pause.");
                resetPomodoro();
            }
        }, 1000);
    };

    pauseBtn.onclick = () => {
        clearInterval(pomodoroInterval);
        isPomodoroRunning = false;
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
    };

    resetBtn.onclick = resetPomodoro;

    function resetPomodoro() {
        clearInterval(pomodoroInterval);
        isPomodoroRunning = false;
        pomodoroTime = 5;
        updateDisplay();
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
    }
}

function renderCharts(stats) {
    const ctx = document.getElementById('user-status-chart').getContext('2d');
    
    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['À faire', 'En cours', 'Terminé'],
            datasets: [{
                data: [stats.todo, stats.doing, stats.done],
                backgroundColor: ['#94a3b8', '#fbbf24', '#34d399'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: getComputedStyle(document.body).getPropertyValue('--text-2') }
                }
            }
        }
    });
}


