// IMPORT
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// FIREBASE
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 
const tasksCollection = collection(db, "tasks");

// STATE
let tasks = []; 
let currentView = 'list';
let searchQuery = '';
let currentUser = null; 
let activeCategoryFilter = null;

document.addEventListener("DOMContentLoaded", () => {
    
    const appContainer = document.getElementById('appContainer');
    const authScreen = document.getElementById('authScreen');
    
    // Auth Elementleri
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const btnAuthSubmit = document.getElementById('btnAuthSubmit');
    const authError = document.getElementById('authError');
    
    // Profil Elementleri
    const userProfileBtn = document.getElementById('userProfileBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    const dropdownUserName = document.getElementById('dropdownUserName');
    const avatarImage = document.getElementById('avatarImage');
    const btnLogoutBtn = document.getElementById('btnLogoutBtn');
    const btnDeleteAccount = document.getElementById('btnDeleteAccount');

    const categoryListContainer = document.getElementById('categoryListContainer');

    const taskContainer = document.getElementById('taskListContainer');
    const listViewPanel = document.getElementById('listView');
    const kanbanViewPanel = document.getElementById('kanbanView');
    const btnListView = document.getElementById('btnListView');
    const btnKanbanView = document.getElementById('btnKanbanView');
    const pageHeaderTitle = document.querySelector('.page-header h2');
    const searchInput = document.getElementById('searchInput');

    const modal = document.getElementById('taskModal');
    const btnOpenModal = document.getElementById('btnOpenModal');
    const btnCloseModal = document.getElementById('closeModalBtn');
    const btnCancelModal = document.getElementById('cancelModalBtn');
    const btnSaveTask = document.getElementById('saveTaskBtn');
    const btnThemeToggle = document.querySelector('.btn-theme-toggle');

    btnThemeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        document.body.classList.toggle('light-theme');
    });

    // PROFİL MENÜSÜ İŞLEMLERİ
    userProfileBtn.addEventListener('click', (e) => {
        profileDropdown.classList.toggle('active');
        e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
        if (!userProfileBtn.contains(e.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    btnLogoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        profileDropdown.classList.remove('active');
    });

    btnDeleteAccount.addEventListener('click', async () => {
        const confirmDelete = confirm("DİKKAT: Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Verileriniz geri alınamaz!");
        
        if (confirmDelete) {
            try {
                await deleteUser(currentUser);
                alert("Hesabınız başarıyla silindi. Hoşça kalın!");
            } catch (error) {
                console.error("Hesap silme hatası:", error);
                if (error.code === 'auth/requires-recent-login') {
                    alert("Güvenlik nedeniyle hesabınızı silmek için lütfen çıkış yapıp, tekrar giriş yapın ve bu işlemi tekrarlayın.");
                } else {
                    alert("Hesap silinirken bir hata oluştu.");
                }
            }
        }
        profileDropdown.classList.remove('active');
    });


    //  AUTH İŞLEMLERİ

    let isLoginMode = true; 
    tabLogin.addEventListener('click', () => {
        isLoginMode = true; tabLogin.classList.add('active'); tabRegister.classList.remove('active');
        btnAuthSubmit.textContent = "Giriş Yap"; authError.textContent = "";
    });
    tabRegister.addEventListener('click', () => {
        isLoginMode = false; tabRegister.classList.add('active'); tabLogin.classList.remove('active');
        btnAuthSubmit.textContent = "Kayıt Ol"; authError.textContent = "";
    });

    btnAuthSubmit.addEventListener('click', async () => {
        const email = authEmail.value.trim(); const password = authPassword.value.trim();
        if (!email || !password) { authError.textContent = "Lütfen e-posta ve şifre girin."; return; }
        btnAuthSubmit.disabled = true; btnAuthSubmit.textContent = "Bekleyin..."; authError.textContent = "";

        try {
            if (isLoginMode) await signInWithEmailAndPassword(auth, email, password);
            else await createUserWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Auth Hatası:", error);
            if (error.code === 'auth/email-already-in-use') authError.textContent = "Bu e-posta zaten kullanımda.";
            else if (error.code === 'auth/invalid-credential') authError.textContent = "E-posta veya şifre hatalı.";
            else if (error.code === 'auth/weak-password') authError.textContent = "Şifreniz en az 6 haneli olmalıdır.";
            else authError.textContent = "Bir hata oluştu. Lütfen tekrar deneyin.";
            btnAuthSubmit.disabled = false; btnAuthSubmit.textContent = isLoginMode ? "Giriş Yap" : "Kayıt Ol";
        }
    });

    // Auth State Observer
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            authScreen.classList.remove('active'); 
            appContainer.style.display = 'flex'; 
            
            avatarImage.src = `https://ui-avatars.com/api/?name=${user.email}&background=6366f1&color=fff`;
            dropdownUserName.textContent = user.email;
            
            loadTasksFromFirebase();
        } else {
            currentUser = null; 
            tasks = []; 
            renderTasks();
            appContainer.style.display = 'none'; 
            
            authScreen.classList.add('active'); 
            
            authEmail.value = ''; authPassword.value = '';
            btnAuthSubmit.disabled = false; btnAuthSubmit.textContent = isLoginMode ? "Giriş Yap" : "Kayıt Ol";
        }
    });


    // FIREBASE CRUD

    async function loadTasksFromFirebase() {
        if (!currentUser) return; 
        taskContainer.innerHTML = '<div class="task-list-placeholder">Veriler yükleniyor...</div>';
        try {
            const q = query(tasksCollection, where("userId", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            tasks = []; 
            snapshot.forEach((doc) => { tasks.push({ id: doc.id, ...doc.data() }); });
            renderTasks(); 
        } catch (error) {
            console.error("Veri çekilirken hata:", error);
            taskContainer.innerHTML = '<div class="task-list-placeholder">Veriler alınamadı.</div>';
        }
    }

    btnSaveTask.addEventListener('click', async () => {
        const titleInput = document.getElementById('newTaskTitle');
        const categoryInput = document.getElementById('newTaskCategory');
        const priorityInput = document.getElementById('newTaskPriority').value;
        const dateInput = document.getElementById('newTaskDate').value;
        
        if (titleInput.value.trim() === '') return alert('Lütfen görev başlığı girin!');
        if (!currentUser) return; 
        
        btnSaveTask.disabled = true; btnSaveTask.textContent = "Kaydediliyor...";

        const newTaskData = {
            title: titleInput.value.trim(),
            category: categoryInput.value.trim() || "Genel",
            status: "todo",
            priority: priorityInput,
            dueDate: dateInput || "Tarih Yok",
            userId: currentUser.uid, 
            createdAt: new Date() 
        };

        try {
            const docRef = await addDoc(tasksCollection, newTaskData);
            tasks.push({ id: docRef.id, ...newTaskData });
            modal.classList.remove('active');
            titleInput.value = ''; categoryInput.value = 'Genel';
            renderTasks();
        } catch (error) {
            console.error("Görev eklenirken hata: ", error); alert("Görev kaydedilemedi.");
        } finally {
            btnSaveTask.disabled = false; btnSaveTask.textContent = "Kaydet";
        }
    });

    taskContainer.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.btn-delete');
        if (deleteBtn) {
            const taskId = deleteBtn.getAttribute('data-id');
            tasks = tasks.filter(t => t.id !== taskId);
            renderTasks();
            try { await deleteDoc(doc(db, "tasks", taskId)); } catch (err) { console.error(err); }
        }
        
        const checkboxDiv = e.target.closest('.task-checkbox');
        if (checkboxDiv) {
            const taskId = checkboxDiv.getAttribute('data-id');
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                const newStatus = task.status === "completed" ? "todo" : "completed";
                task.status = newStatus; renderTasks();
                try { await updateDoc(doc(db, "tasks", taskId), { status: newStatus }); } catch (err) { console.error(err); }
            }
        }
    });


    // ARAYÜZ VE GÖRÜNÜM

    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase().trim(); renderTasks(); });
    document.addEventListener('keydown', (e) => {
        if (!currentUser) return; 
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'F' || e.key === 'f') { e.preventDefault(); searchInput.focus(); }
        if (e.key === 'N' || e.key === 'n') { e.preventDefault(); modal.classList.add('active'); setTimeout(() => document.getElementById('newTaskTitle').focus(), 50); }
    });

    function switchView(viewName) {
        currentView = viewName;
        if (viewName === 'list') {
            listViewPanel.classList.add('active'); kanbanViewPanel.classList.remove('active');
            btnListView.classList.add('active'); btnKanbanView.classList.remove('active');
            pageHeaderTitle.textContent = "Tüm Görevler";
        } else {
            listViewPanel.classList.remove('active'); kanbanViewPanel.classList.add('active');
            btnListView.classList.remove('active'); btnKanbanView.classList.add('active');
            pageHeaderTitle.textContent = "Pano Görünümü";
        }
        renderTasks();
    }
    btnListView.addEventListener('click', () => switchView('list'));
    btnKanbanView.addEventListener('click', () => switchView('kanban'));

    function renderTasks() {
        const filteredTasks = tasks.filter(task => {
            const matchesSearch = task.title.toLowerCase().includes(searchQuery);
            const matchesCategory = activeCategoryFilter ? (task.category || "Genel") === activeCategoryFilter : true;
            return matchesSearch && matchesCategory;
        });

        renderSidebarCategories();

        if (currentView === 'list') renderList(filteredTasks); else renderKanban(filteredTasks);
    }

    function renderSidebarCategories() {
        const categories = [...new Set(tasks.map(t => t.category || "Genel"))];
        
        categoryListContainer.innerHTML = '';

        if (activeCategoryFilter !== null) {
            const clearFilterBtn = document.createElement('a');
            clearFilterBtn.href = "#";
            clearFilterBtn.className = "nav-item";
            clearFilterBtn.innerHTML = `<i class="ph ph-x-circle" style="color: var(--danger);"></i> Filtreyi Temizle`;
            clearFilterBtn.addEventListener('click', (e) => {
                e.preventDefault();
                activeCategoryFilter = null;
                renderTasks();
            });
            categoryListContainer.appendChild(clearFilterBtn);
        }

        categories.forEach(cat => {
            const catItem = document.createElement('a');
            catItem.href = "#";
            catItem.className = `nav-item ${activeCategoryFilter === cat ? 'active' : ''}`;
            
            const dotColor = activeCategoryFilter === cat ? 'var(--primary)' : 'var(--text-muted)';
            catItem.innerHTML = `<span class="color-dot" style="background: ${dotColor};"></span> ${cat}`;
            
            catItem.addEventListener('click', (e) => {
                e.preventDefault();
                activeCategoryFilter = activeCategoryFilter === cat ? null : cat;
                renderTasks();
            });
            
            categoryListContainer.appendChild(catItem);
        });
    }
    
    function renderList(filteredTasks) {
        taskContainer.innerHTML = '';
        if(filteredTasks.length === 0) {
            taskContainer.innerHTML = `<div class="task-list-placeholder">Görev bulunamadı.</div>`; return;
        }

        const groupedTasks = {};
        filteredTasks.forEach(task => {
            const cat = task.category || "Genel"; 
            if (!groupedTasks[cat]) groupedTasks[cat] = []; 
            groupedTasks[cat].push(task); 
        });

        for (const [category, tasksInCategory] of Object.entries(groupedTasks)) {
            const categoryGroup = document.createElement('div');
            categoryGroup.className = 'category-group';
            const categoryHeader = document.createElement('h3');
            categoryHeader.className = 'category-header';
            categoryHeader.innerHTML = `<i class="ph ph-folder"></i> ${category}`;
            categoryGroup.appendChild(categoryHeader);
            const taskList = document.createElement('div');
            taskList.className = 'task-list';

            tasksInCategory.forEach(task => {
                const isCompleted = task.status === "completed";
                const iconClass = isCompleted ? "ph-check-circle-fill" : "ph-circle";
                const taskElement = document.createElement('div');
                taskElement.className = `task-item ${isCompleted ? 'completed' : ''}`;
                taskElement.innerHTML = `
                    <div class="task-checkbox" data-id="${task.id}"><i class="ph ${iconClass}"></i></div>
                    <div class="task-content">
                        <h3 class="task-title">${task.title}</h3>
                        <div class="task-meta">
                            <span class="meta-item priority-${task.priority}"><i class="ph ph-flag"></i> Öncelik</span>
                            <span class="meta-item"><i class="ph ph-calendar"></i> ${task.dueDate}</span>
                        </div>
                    </div>
                    <div class="task-actions"><button class="btn-icon btn-delete" data-id="${task.id}"><i class="ph ph-trash"></i></button></div>
                `;
                taskList.appendChild(taskElement);
            });
            categoryGroup.appendChild(taskList); 
            taskContainer.appendChild(categoryGroup); 
        }
    }

    function renderKanban(filteredTasks) {
        const columns = ['todo', 'in-progress', 'completed'];
        columns.forEach(status => {
            const columnElement = document.querySelector(`.kanban-column[data-status="${status}"]`);
            const dropzone = columnElement.querySelector('.kanban-dropzone');
            const countElement = columnElement.querySelector('.kanban-count');
            
            const columnTasks = filteredTasks.filter(t => t.status === status);
            countElement.textContent = columnTasks.length;
            dropzone.innerHTML = '';

            columnTasks.forEach(task => {
                const card = document.createElement('div');
                card.className = 'kanban-card';
                card.setAttribute('draggable', 'true');
                card.innerHTML = `
                    <h3 class="task-title">${task.title}</h3>
                    <div class="task-meta">
                        <span class="category-badge"><i class="ph ph-folder"></i> ${task.category || 'Genel'}</span>
                        <span class="meta-item priority-${task.priority}"><i class="ph ph-flag"></i></span>
                        <span class="meta-item"><i class="ph ph-calendar"></i> ${task.dueDate}</span>
                    </div>
                `;
                card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', task.id); setTimeout(() => card.style.opacity = '0.5', 0); });
                card.addEventListener('dragend', () => card.style.opacity = '1');
                dropzone.appendChild(card);
            });

            dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
            dropzone.addEventListener('drop', async (e) => {
                e.preventDefault(); dropzone.classList.remove('drag-over');
                const draggedTaskId = e.dataTransfer.getData('text/plain'); 
                const taskIndex = tasks.findIndex(t => t.id === draggedTaskId);
                if (taskIndex > -1 && tasks[taskIndex].status !== status) {
                    tasks[taskIndex].status = status; renderTasks(); 
                    try { await updateDoc(doc(db, "tasks", draggedTaskId), { status: status }); } catch (err) { }
                }
            });
        });
    }

    btnOpenModal.addEventListener('click', () => modal.classList.add('active'));
    btnCloseModal.addEventListener('click', () => modal.classList.remove('active'));
    btnCancelModal.addEventListener('click', () => modal.classList.remove('active'));

});
