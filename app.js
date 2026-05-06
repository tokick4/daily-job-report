// DOM Elements
const views = {
    dashboard: document.getElementById('view-dashboard'),
    form: document.getElementById('view-form')
};
const btns = {
    back: document.getElementById('btn-back'),
    newReport: document.getElementById('btn-new-report'),
    getLocation: document.getElementById('btn-get-location'),
    generatePdf: document.getElementById('btn-generate-pdf'),
    saveDraft: document.getElementById('btn-save-draft'),
    save: document.getElementById('btn-save')
};
const headerTitle = document.getElementById('header-title');
const overlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Form Elements
const form = document.getElementById('report-form');
const photoInput = document.getElementById('photo-input');
const photoList = document.getElementById('photo-list');
const photoCountLabel = document.getElementById('photo-count');
const photoTemplate = document.getElementById('photo-item-template');

// State
let photos = [];
const MAX_PHOTOS = 24;
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz-A8GxA_QzsUptm-HfcgJHrLAPP0oSOVG3NrgAmvaOYszw__06oMRzhMDJG9ZCPprSrg/exec'; // User needs to set this
let currentReportId = null;

// Database (IndexedDB) wrapper
const DB_NAME = 'DailyJobReportsDB';
const DB_VERSION = 1;
const STORE_NAME = 'reports';
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject("IndexedDB error: " + e.target.error);
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

function saveReportToDB(report) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(report);
        request.onsuccess = () => resolve(report);
        request.onerror = (e) => reject(e.target.error);
    });
}

function getAllReportsFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function deleteReportFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// Initialization
async function init() {
    await initDB();

    // Navigation
    btns.newReport.addEventListener('click', () => {
        currentReportId = Date.now().toString();
        form.reset();
        photos = [];
        renderPhotos();
        document.getElementById('date').valueAsDate = new Date();
        navigateTo('form');
    });
    btns.back.addEventListener('click', async () => {
        await renderDashboard();
        navigateTo('dashboard');
    });

    // Form interactions
    btns.getLocation.addEventListener('click', fetchLocation);
    photoInput.addEventListener('change', handlePhotoUpload);
    btns.generatePdf.addEventListener('click', generatePDF);
    btns.saveDraft.addEventListener('click', saveDraft);
    form.addEventListener('submit', handleFormSubmit);

    // Initial load
    await renderDashboard();
}

async function renderDashboard() {
    const reportsList = document.getElementById('reports-list');
    const emptyState = document.querySelector('.empty-state');
    reportsList.innerHTML = '';
    
    try {
        const reports = await getAllReportsFromDB();
        
        if (reports.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            
            reports.sort((a, b) => b.id - a.id).forEach(report => {
                const card = document.createElement('div');
                card.className = 'card report-card';
                card.innerHTML = `
                    <div class="report-card-header">
                        <h4>${report.project || 'Untitled Project'}</h4>
                        <span class="badge ${report.status === 'submitted' ? 'badge-success' : 'badge-warning'}">${report.status === 'submitted' ? 'Submitted' : 'Draft'}</span>
                    </div>
                    <div class="report-card-body">
                        <p><strong>Date:</strong> ${report.date || 'N/A'}</p>
                        <p><strong>Client:</strong> ${report.client || 'N/A'}</p>
                    </div>
                    <div class="report-card-actions">
                        <button class="btn-outline btn-sm edit-report-btn">Edit</button>
                        <button class="btn-outline btn-sm delete-report-btn" style="color: var(--danger); border-color: var(--danger);">Delete</button>
                    </div>
                `;
                
                card.querySelector('.edit-report-btn').addEventListener('click', () => loadReportIntoForm(report));
                card.querySelector('.delete-report-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm("Are you sure you want to delete this report locally?")) {
                        await deleteReportFromDB(report.id);
                        await renderDashboard();
                    }
                });
                
                reportsList.appendChild(card);
            });
        }
    } catch (e) {
        console.error("Failed to load reports", e);
    }
}

function loadReportIntoForm(report) {
    currentReportId = report.id;
    
    document.getElementById('project-name').value = report.project || '';
    document.getElementById('client-name').value = report.client || '';
    document.getElementById('date').value = report.date || '';
    document.getElementById('address').value = report.address || '';
    document.getElementById('gps-coords').value = report.gps || '';
    document.getElementById('issues').value = report.issues || '';
    document.getElementById('notes').value = report.notes || '';
    
    photos = report.photos || [];
    renderPhotos();
    
    navigateTo('form');
}

// Navigation
function navigateTo(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');

    if (viewName === 'form') {
        headerTitle.textContent = 'New Report';
        btns.back.classList.remove('hidden');
    } else {
        headerTitle.textContent = 'Job Reports';
        btns.back.classList.add('hidden');
    }
    window.scrollTo(0, 0);
}

function showLoading(text = 'Processing...') {
    loadingText.textContent = text;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    overlay.classList.add('hidden');
}

// Geolocation
function fetchLocation() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
    }
    showLoading("Getting location...");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            document.getElementById('gps-coords').value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            hideLoading();
        },
        (error) => {
            console.error(error);
            alert("Unable to retrieve location. Please check permissions.");
            hideLoading();
        },
        { enableHighAccuracy: true }
    );
}

// Photo Handling
function handlePhotoUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    if (photos.length + files.length > MAX_PHOTOS) {
        alert(`You can only upload a maximum of ${MAX_PHOTOS} photos.`);
        return;
    }

    showLoading("Processing photos...");

    // Process each file (resize and convert to base64)
    Promise.all(files.map(processImage)).then(processedImages => {
        processedImages.forEach(imgData => {
            photos.push({ id: Date.now() + Math.random(), base64: imgData, details: '', grading: 'Good' });
        });
        renderPhotos();
        hideLoading();
        // Reset input so the same files can be selected again if needed
        photoInput.value = '';
    });
}

function processImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Resize image to max 1200px width/height to save space
                const MAX_SIZE = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height && width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Compress JPEG to 0.7 quality
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function applyTextOverlay(photoObj, globalDate) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            // Draw original image
            ctx.drawImage(img, 0, 0);
            
            // Text to draw
            const dateStr = `Date: ${globalDate || 'N/A'}`;
            const gradeStr = `Grade: ${photoObj.grading || 'Good'}`;
            const noteStr = photoObj.details || '';
            
            // Text formatting setup
            const fontSize = Math.max(16, Math.floor(canvas.width * 0.035));
            const padding = Math.floor(fontSize * 0.8);
            ctx.font = `${fontSize}px Arial, sans-serif`;
            ctx.textBaseline = 'top';
            
            const maxWidth = canvas.width - (padding * 2);
            
            // Word wrap function for note
            const wrapText = (text, maxWidth) => {
                if (!text) return [];
                const words = text.split(' ');
                const lines = [];
                let currentLine = words[0];

                for (let i = 1; i < words.length; i++) {
                    const word = words[i];
                    const width = ctx.measureText(currentLine + " " + word).width;
                    if (width < maxWidth) {
                        currentLine += " " + word;
                    } else {
                        lines.push(currentLine);
                        currentLine = word;
                    }
                }
                if (currentLine) lines.push(currentLine);
                return lines;
            };
            
            const noteLines = wrapText(noteStr, maxWidth);
            
            // Calculate height of the overlay box
            const lineHeight = fontSize * 1.3;
            const totalLines = 1 + noteLines.length; // Date & Grade on one line, then Note
            const boxHeight = (totalLines * lineHeight) + (padding * 2);
            const boxY = canvas.height - boxHeight;
            
            // Draw white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, boxY, canvas.width, boxHeight);
            
            // Draw Text
            ctx.fillStyle = '#000000';
            let currentY = boxY + padding;
            
            // Draw Date & Grade on same line
            ctx.fillText(`${dateStr}   |   ${gradeStr}`, padding, currentY);
            currentY += lineHeight;
            
            noteLines.forEach(line => {
                ctx.fillText(line, padding, currentY);
                currentY += lineHeight;
            });
            
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = photoObj.base64;
    });
}

function renderPhotos() {
    photoList.innerHTML = '';
    photoCountLabel.textContent = photos.length;

    photos.forEach((photo, index) => {
        const clone = photoTemplate.content.cloneNode(true);
        const item = clone.querySelector('.photo-item');
        const img = clone.querySelector('img');
        const textarea = clone.querySelector('textarea');
        const gradingSelect = clone.querySelector('.photo-grading');
        const removeBtn = clone.querySelector('.btn-remove-photo');

        img.src = photo.base64;
        textarea.value = photo.details || '';
        
        if (gradingSelect) {
            gradingSelect.value = photo.grading || 'Good';
            gradingSelect.addEventListener('change', (e) => {
                photos[index].grading = e.target.value;
            });
        }

        textarea.addEventListener('input', (e) => {
            photos[index].details = e.target.value;
        });

        removeBtn.addEventListener('click', () => {
            photos.splice(index, 1);
            renderPhotos();
        });

        photoList.appendChild(item);
    });
}

// Data Collection
function getFormData() {
    return {
        id: currentReportId || Date.now().toString(),
        project: document.getElementById('project-name').value,
        client: document.getElementById('client-name').value,
        date: document.getElementById('date').value,
        address: document.getElementById('address').value,
        gps: document.getElementById('gps-coords').value,
        issues: document.getElementById('issues').value,
        notes: document.getElementById('notes').value,
        photos: photos // Array of {base64, details}
    };
}

// PDF Generation
async function generatePDF() {
    const data = getFormData();
    if (!data.project || !data.client || !data.date) {
        alert("Please fill out the Project Name, Client Name, and Date before generating the report.");
        return;
    }

    showLoading("Generating PDF...");

    try {
        // Process photos for overlay
        const processedPhotos = await Promise.all(data.photos.map(async (photo) => {
            const overlaidBase64 = await applyTextOverlay(photo, data.date);
            return { ...photo, base64: overlaidBase64 };
        }));

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });

        // --- Cover Page ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.text("Daily Job Report", 4.25, 1.5, { align: "center" });

        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");

        let startY = 2.5;
        const lineSpacing = 0.4;

        const addRow = (label, value) => {
            doc.setFont("helvetica", "bold");
            doc.text(`${label}:`, 1, startY);
            doc.setFont("helvetica", "normal");
            const lines = doc.splitTextToSize(value || 'N/A', 5);
            doc.text(lines, 2.5, startY);
            startY += lineSpacing * lines.length;
        };

        addRow("Project", data.project);
        addRow("Client", data.client);
        addRow("Date", data.date);
        addRow("Address", data.address);
        addRow("GPS", data.gps);

        startY += 0.2;
        doc.setFont("helvetica", "bold");
        doc.text("Issues / Roadblocks:", 1, startY);
        startY += lineSpacing;
        doc.setFont("helvetica", "normal");
        const issueLines = doc.splitTextToSize(data.issues || 'None', 6.5);
        doc.text(issueLines, 1, startY);
        startY += lineSpacing * issueLines.length + 0.2;

        doc.setFont("helvetica", "bold");
        doc.text("Notes:", 1, startY);
        startY += lineSpacing;
        doc.setFont("helvetica", "normal");
        const noteLines = doc.splitTextToSize(data.notes || 'None', 6.5);
        doc.text(noteLines, 1, startY);

        // --- Photo Pages ---
        if (processedPhotos.length > 0) {
            const photosPerPage = 6;
            const columns = 2;
            const margin = 0.5;
            const pageW = 8.5;
            const colW = (pageW - (margin * 2) - 0.5) / 2; // 3.5in
            const rowH = 3.0;
            const imgH = 2.8; // we have more room now because text is inside the image

            for (let i = 0; i < processedPhotos.length; i++) {
                if (i % photosPerPage === 0) {
                    doc.addPage();
                }

                const idxOnPage = i % photosPerPage;
                const col = idxOnPage % columns;
                const row = Math.floor(idxOnPage / columns);

                const x = margin + (col * (colW + 0.5));
                const y = margin + (row * (rowH + 0.2));

                const photo = processedPhotos[i];

                try {
                    const props = doc.getImageProperties(photo.base64);
                    const ratio = props.width / props.height;
                    let renderW = colW;
                    let renderH = colW / ratio;
                    
                    if (renderH > imgH) {
                        renderH = imgH;
                        renderW = imgH * ratio;
                    }
                    
                    const offsetX = (colW - renderW) / 2;
                    doc.addImage(photo.base64, 'JPEG', x + offsetX, y, renderW, renderH, undefined, 'FAST');
                } catch (e) {
                    console.error("Error adding image to PDF", e);
                }
            }
        }

        doc.save(`JobReport_${data.project.replace(/\s+/g, '_')}_${data.date}.pdf`);
    } catch (error) {
        console.error(error);
        alert("Error generating PDF. Please try again.");
    } finally {
        hideLoading();
    }
}

// Local Saving
async function saveDraft() {
    const project = document.getElementById('project-name').value;
    if (!project) {
        alert("Please enter a Project Name before saving a draft.");
        return;
    }

    const data = getFormData();
    data.status = 'draft';
    showLoading("Saving draft...");
    
    try {
        await saveReportToDB(data);
        alert("Draft saved!");
        await renderDashboard();
        navigateTo('dashboard');
    } catch (error) {
        console.error(error);
        alert("Failed to save draft.");
    } finally {
        hideLoading();
    }
}

// Submission
async function handleFormSubmit(e) {
    e.preventDefault();
    if (GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
        alert("The Google Apps Script URL has not been set. The app cannot save to the database yet. You can still generate a PDF.");
        return;
    }

    const data = getFormData();
    data.status = 'submitted'; // Mark as submitted

    showLoading("Saving to cloud...");

    try {
        // Process photos for overlay
        const processedPhotos = await Promise.all(data.photos.map(async (photo) => {
            const overlaidBase64 = await applyTextOverlay(photo, data.date);
            return { ...photo, base64: overlaidBase64 };
        }));
        
        const payloadData = { ...data, photos: processedPhotos };

        let fetchError = null;
        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(payloadData),
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                }
            });
        } catch (e) {
            console.warn("Fetch threw an error (often happens on iOS due to redirect blocking):", e);
            fetchError = e;
        }

        // Even if fetch threw an error (common on iOS Safari due to Intelligent Tracking Prevention blocking the Google Apps Script redirect),
        // the initial POST data almost always reaches the server successfully before the redirect is blocked.
        await saveReportToDB(data);
        
        if (fetchError) {
            alert("Report submitted, but couldn't verify server response (Safari tracking prevention blocked the redirect). It was saved locally and likely reached the server.");
        } else {
            alert("Report saved successfully!");
        }
        
        await renderDashboard();
        navigateTo('dashboard');
    } catch (error) {
        console.error(error);
        alert("Failed to save report locally. Error: " + error.message);
    } finally {
        hideLoading();
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
