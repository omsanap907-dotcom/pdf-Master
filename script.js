/* STREAMING_CHUNK:Initializing application state and DOM references... */document.addEventListener('DOMContentLoaded', () => {// Application State Managementconst appState = {theme: localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),activeTool: 'Merge PDF',uploadedFiles: [],maxFileSizeMB: 100,preview: {zoom: 100,rotation: 0,currentPage: 1,totalPages: 4}};// Global DOM Elements
const elements = {
    html: document.documentElement,
    themeToggle: document.getElementById('themeToggle'),
    uploadModal: document.getElementById('uploadModal'),
    loadingModal: document.getElementById('loadingModal'),
    successModal: document.getElementById('successModal'),
    fileInput: document.getElementById('fileInput'),
    toolsGrid: document.getElementById('tools-grid'),
    searchInput: document.querySelector('header input[type="text"]'),
    categoryBtns: document.querySelectorAll('#tools-grid button')
};
/* STREAMING_CHUNK:Configuring dark mode theme toggle and local storage... */// Theme Management Functionsfunction applyTheme(theme) {appState.theme = theme;if (theme === 'dark') {elements.html.classList.add('dark');} else {elements.html.classList.remove('dark');}localStorage.setItem('theme', theme);}// Initialize Theme
applyTheme(appState.theme);

if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', () => {
        const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        showToast(`Switched to ${newTheme} mode`, 'info');
    });
}
/* STREAMING_CHUNK:Creating toast notification manager... */// Toast Notification Systemfunction createToastContainer() {let container = document.querySelector('.toast-container');if (!container) {container = document.createElement('div');container.className = 'toast-container';document.body.appendChild(container);}return container;}function showToast(message, type = 'info', duration = 3500) {
    const container = createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap = {
        success: 'check_circle',
        error: 'error',
        info: 'info'
    };

    const iconName = iconMap[type] || 'info';

    toast.innerHTML = `
        <span class="material-symbols-outlined text-xl ${type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-rose-500' : 'text-blue-500'}">${iconName}</span>
        <span class="text-xs font-semibold text-slate-800 dark:text-slate-100 flex-1">${message}</span>
        <button class="toast-close text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <span class="material-symbols-outlined text-sm">close</span>
        </button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => dismissToast(toast));

    container.appendChild(toast);

    const timer = setTimeout(() => {
        dismissToast(toast);
    }, duration);

    toast.dataset.timer = timer;
}

function dismissToast(toast) {
    if (toast.dataset.timer) clearTimeout(toast.dataset.timer);
    toast.classList.add('toast-hiding');
    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}
/* STREAMING_CHUNK:Managing modal dialogs and backdrop behaviors... */// Generic Modal Management Helperfunction openModal(modal) {if (!modal) return;modal.classList.remove('opacity-0', 'pointer-events-none');modal.classList.add('opacity-100', 'pointer-events-auto');const content = modal.firstElementChild;if (content) {content.classList.remove('scale-95');content.classList.add('scale-100');}}function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');
    const content = modal.firstElementChild;
    if (content) {
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
    }
}

// Modal Close Button Listeners
[elements.uploadModal, elements.loadingModal, elements.successModal].forEach(modal => {
    if (!modal) return;
    
    // Close on close button click
    const closeBtns = modal.querySelectorAll('button');
    closeBtns.forEach(btn => {
        if (btn.innerText.includes('Cancel') || btn.querySelector('span')?.innerText === 'close') {
            btn.addEventListener('click', () => closeModal(modal));
        }
    });

    // Close on clicking backdrop outside content
    modal.addEventListener('click', (e) => {
        if (e.target === modal && modal !== elements.loadingModal) {
            closeModal(modal);
        }
    });
});
/* STREAMING_CHUNK:Handling file upload drag-and-drop zone interactions... */// Drag & Drop Setupconst dropZone = elements.uploadModal ? elements.uploadModal.querySelector('.border-dashed') : null;if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('bg-blue-100/50', 'dark:bg-blue-900/40', 'border-blue-500'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('bg-blue-100/50', 'dark:bg-blue-900/40', 'border-blue-500'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => {
        if (elements.fileInput) elements.fileInput.click();
    });
}

if (elements.fileInput) {
    elements.fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(file => {
        if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
            showToast(`"${file.name}" is not a valid PDF file`, 'error');
            return false;
        }
        if (file.size > appState.maxFileSizeMB * 1024 * 1024) {
            showToast(`"${file.name}" exceeds maximum size of ${appState.maxFileSizeMB}MB`, 'error');
            return false;
        }
        return true;
    });

    if (validFiles.length > 0) {
        appState.uploadedFiles = validFiles;
        updateUploadModalUI(validFiles[0]);
        showToast(`Loaded ${validFiles.length} file(s) for ${appState.activeTool}`, 'success');
    }
}

function updateUploadModalUI(file) {
    if (!elements.uploadModal) return;
    const fileInfoBox = elements.uploadModal.querySelector('.mt-4.p-3');
    if (fileInfoBox && file) {
        const fileNameElem = fileInfoBox.querySelector('p.font-semibold');
        const fileSizeElem = fileInfoBox.querySelector('p.text-slate-400');
        
        if (fileNameElem) fileNameElem.textContent = file.name;
        if (fileSizeElem) fileSizeElem.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB • Ready`;
    }
}
/* STREAMING_CHUNK:Setting up tool card click actions and dynamic tool selection... */// Tool Card Click Eventsconst toolCards = document.querySelectorAll('#tools-grid .group');toolCards.forEach(card => {card.addEventListener('click', (e) => {e.preventDefault();const toolTitle = card.querySelector('h3')?.textContent || 'PDF Tool';appState.activeTool = toolTitle;        // Update modal title according to selected tool
        if (elements.uploadModal) {
            const titleElem = elements.uploadModal.querySelector('h3');
            if (titleElem) titleElem.textContent = `${toolTitle}`;
        }

        openModal(elements.uploadModal);
    });
});

// Quick Upload Hero Button
const quickUploadBtn = document.querySelector('button:has(.material-symbols-outlined)');
const heroUploadBtn = document.querySelector('section button');

[quickUploadBtn, heroUploadBtn].forEach(btn => {
    if (btn) {
        btn.addEventListener('click', () => {
            appState.activeTool = 'PDF Processing';
            openModal(elements.uploadModal);
        });
    }
});
/* STREAMING_CHUNK:Simulating PDF processing workflow with progress updates... */// Modal Process Action Triggerif (elements.uploadModal) {const processBtn = elements.uploadModal.querySelector('button.bg-blue-600');if (processBtn) {processBtn.addEventListener('click', () => {closeModal(elements.uploadModal);startProcessingPipeline();});}}function startProcessingPipeline() {
    openModal(elements.loadingModal);

    let progress = 0;
    const progressBar = elements.loadingModal ? elements.loadingModal.querySelector('.bg-blue-600.h-2') : null;
    const progressText = elements.loadingModal ? elements.loadingModal.querySelector('span.text-xs.font-semibold') : null;

    const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress > 100) progress = 100;

        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${progress}% Completed`;

        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                closeModal(elements.loadingModal);
                openModal(elements.successModal);
                showToast(`${appState.activeTool} operation completed!`, 'success');
            }, 400);
        }
    }, 200);
}
/* STREAMING_CHUNK:Implementing interactive PDF previewer controls... */// Interactive PDF Previewer Controlsconst previewSection = document.querySelector('section:has(.pdf-preview-canvas), section:has(.material-symbols-outlined)');if (previewSection) {const zoomOutBtn = previewSection.querySelector('button[title="Zoom Out"]');const zoomInBtn = previewSection.querySelector('button[title="Zoom In"]');const rotateLeftBtn = previewSection.querySelector('button[title="Rotate Left"]');const rotateRightBtn = previewSection.querySelector('button[title="Rotate Right"]');const fullScreenBtn = previewSection.querySelector('button[title="Full Screen"]');    const zoomLabel = previewSection.querySelector('.font-medium.text-slate-600');
    const previewCanvas = previewSection.querySelector('.max-w-lg');

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (appState.preview.zoom > 50) {
                appState.preview.zoom -= 10;
                updatePreviewTransform();
            }
        });
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (appState.preview.zoom < 150) {
                appState.preview.zoom += 10;
                updatePreviewTransform();
            }
        });
    }

    if (rotateLeftBtn) {
        rotateLeftBtn.addEventListener('click', () => {
            appState.preview.rotation = (appState.preview.rotation - 90) % 360;
            updatePreviewTransform();
        });
    }

    if (rotateRightBtn) {
        rotateRightBtn.addEventListener('click', () => {
            appState.preview.rotation = (appState.preview.rotation + 90) % 360;
            updatePreviewTransform();
        });
    }

    if (fullScreenBtn && previewCanvas) {
        fullScreenBtn.addEventListener('click', () => {
            try {
                if (!document.fullscreenElement) {
                    previewCanvas.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            } catch (err) {
                showToast('Fullscreen mode not supported on this device', 'error');
            }
        });
    }

    function updatePreviewTransform() {
        if (zoomLabel) zoomLabel.textContent = `${appState.preview.zoom}%`;
        if (previewCanvas) {
            previewCanvas.style.transform = `scale(${appState.preview.zoom / 100}) rotate(${appState.preview.rotation}deg)`;
            previewCanvas.style.transition = 'transform 300ms cubic-bezier(0.2, 0, 0, 1)';
        }
    }

    // Preview Thumbnails Selector
    const thumbnails = previewSection.querySelectorAll('.aspect-\\[3\\/4\\]');
    thumbnails.forEach((thumb, index) => {
        thumb.parentElement.addEventListener('click', () => {
            thumbnails.forEach(t => t.parentElement.className = 'p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent cursor-pointer');
            thumb.parentElement.className = 'p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-500 cursor-pointer';
            
            const pageLabel = previewSection.querySelector('span:has(text)');
            appState.preview.currentPage = index + 1;
            showToast(`Viewing Page ${index + 1}`, 'info');
        });
    });
}
/* STREAMING_CHUNK:Adding tool category filtering and live search function... */// Live Search Filter for Tools Gridif (elements.searchInput) {elements.searchInput.addEventListener('input', (e) => {const query = e.target.value.toLowerCase().trim();toolCards.forEach(card => {const title = card.querySelector('h3')?.textContent.toLowerCase() || '';const desc = card.querySelector('p')?.textContent.toLowerCase() || '';            if (title.includes(query) || desc.includes(query)) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    });
}

// Filter Tabs Interaction
const filterTabs = document.querySelectorAll('#tools-grid div.flex button');
filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        filterTabs.forEach(t => {
            t.className = 'px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors';
        });
        tab.className = 'px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg shadow-sm font-semibold';

        const category = tab.textContent.trim();
        showToast(`Filtering by category: ${category}`, 'info');
    });
});
/* STREAMING_CHUNK:Configuring mobile navigation and keyboard shortcuts... */// Keyboard Command Shortcut (⌘K / Ctrl+K)document.addEventListener('keydown', (e) => {if ((e.metaKey || e.ctrlKey) && e.key === 'k') {e.preventDefault();if (elements.searchInput) {elements.searchInput.focus();showToast('Search active', 'info');}}if (e.key === 'Escape') {closeModal(elements.uploadModal);closeModal(elements.loadingModal);closeModal(elements.successModal);}});/* STREAMING_CHUNK:Implementing material ripple click effects and share/download actions... */// Download and Share Action Handlers on Success Modalif (elements.successModal) {const downloadBtn = elements.successModal.querySelector('button.bg-emerald-600');const shareBtn = elements.successModal.querySelector('button:has(.material-symbols-outlined)');    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            // Simulate download
            const dummyBlob = new Blob(['PDF Master Processed Document Sample'], { type: 'application/pdf' });
            const dummyUrl = URL.createObjectURL(dummyBlob);
            const a = document.createElement('a');
            a.href = dummyUrl;
            a.download = `PDF_Master_${appState.activeTool.replace(/\s+/g, '_')}_Output.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(dummyUrl);

            showToast('File download started!', 'success');
            closeModal(elements.successModal);
        });
    }

    // Share Action Handler
    const shareButtons = elements.successModal.querySelectorAll('button');
    shareButtons.forEach(btn => {
        if (btn.innerText.includes('Share')) {
            btn.addEventListener('click', async () => {
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: 'PDF Master Document',
                            text: 'Check out my processed PDF file using PDF Master!',
                            url: window.location.href,
                        });
                        showToast('Shared successfully!', 'success');
                    } catch (err) {
                        // User cancelled or share failed
                    }
                } else {
                    // Fallback clipboard copy
                    navigator.clipboard.writeText(window.location.href);
                    showToast('Link copied to clipboard!', 'info');
                }
            });
        }
    });
}

// Material Ripple Click Effect Helper
document.addEventListener('click', (e) => {
    const target = e.target.closest('.btn-m3, button, .group');
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.className = 'ripple-effect';

    target.classList.add('ripple-container');
    target.appendChild(ripple);

    setTimeout(() => {
        ripple.remove();
    }, 600);
});

// Final Initialization Toast
showToast('PDF Master ready. Select a tool to begin.', 'info');
});
