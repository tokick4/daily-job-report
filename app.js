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

// Initialization
function init() {
    // Navigation
    btns.newReport.addEventListener('click', () => navigateTo('form'));
    btns.back.addEventListener('click', () => navigateTo('dashboard'));

    // Form interactions
    btns.getLocation.addEventListener('click', fetchLocation);
    photoInput.addEventListener('change', handlePhotoUpload);
    btns.generatePdf.addEventListener('click', generatePDF);
    form.addEventListener('submit', handleFormSubmit);

    // Set today's date by default
    document.getElementById('date').valueAsDate = new Date();
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
            photos.push({ id: Date.now() + Math.random(), base64: imgData, details: '' });
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

function renderPhotos() {
    photoList.innerHTML = '';
    photoCountLabel.textContent = photos.length;

    photos.forEach((photo, index) => {
        const clone = photoTemplate.content.cloneNode(true);
        const item = clone.querySelector('.photo-item');
        const img = clone.querySelector('img');
        const textarea = clone.querySelector('textarea');
        const removeBtn = clone.querySelector('.btn-remove-photo');

        img.src = photo.base64;
        textarea.value = photo.details;

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
        project: document.getElementById('project-name').value,
        client: document.getElementById('client-name').value,
        date: document.getElementById('date').value,
        address: document.getElementById('address').value,
        gps: document.getElementById('gps-coords').value,
        issues: document.getElementById('issues').value,
        grading: document.getElementById('grading').value,
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

    // Defer to allow UI to update
    setTimeout(() => {
        try {
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
                // split text if too long
                const lines = doc.splitTextToSize(value || 'N/A', 5);
                doc.text(lines, 2.5, startY);
                startY += lineSpacing * lines.length;
            };

            addRow("Project", data.project);
            addRow("Client", data.client);
            addRow("Date", data.date);
            addRow("Address", data.address);
            addRow("GPS", data.gps);
            addRow("Grading", data.grading);

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
            if (photos.length > 0) {
                const photosPerPage = 6;
                const columns = 2;
                const margin = 0.5;
                const pageW = 8.5;
                const pageH = 11;

                // Available width for 2 columns with a 0.5in gap
                const colW = (pageW - (margin * 2) - 0.5) / 2; // 3.5in
                const rowH = 3.0; // 2in image + 1in text
                const imgH = 2.0;

                for (let i = 0; i < photos.length; i++) {
                    // New page every 6 photos
                    if (i % photosPerPage === 0) {
                        doc.addPage();
                    }

                    const idxOnPage = i % photosPerPage;
                    const col = idxOnPage % columns; // 0 or 1
                    const row = Math.floor(idxOnPage / columns); // 0, 1, or 2

                    const x = margin + (col * (colW + 0.5));
                    const y = margin + (row * (rowH + 0.2));

                    const photo = photos[i];

                    // Add Image
                    try {
                        doc.addImage(photo.base64, 'JPEG', x, y, colW, imgH, undefined, 'FAST');
                    } catch (e) {
                        console.error("Error adding image to PDF", e);
                    }

                    // Add Details
                    doc.setFontSize(10);
                    const detailsLines = doc.splitTextToSize(photo.details || 'No details provided.', colW);
                    // clip lines to max 4 to fit in the 1 inch space
                    doc.text(detailsLines.slice(0, 4), x, y + imgH + 0.15);
                }
            }

            doc.save(`JobReport_${data.project.replace(/\s+/g, '_')}_${data.date}.pdf`);
            hideLoading();
        } catch (error) {
            console.error(error);
            alert("Error generating PDF. Please try again.");
            hideLoading();
        }
    }, 100);
}

// Submission
async function handleFormSubmit(e) {
    e.preventDefault();
    if (GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
        alert("The Google Apps Script URL has not been set. The app cannot save to the database yet. You can still generate a PDF.");
        return;
    }

    const data = getFormData();
    showLoading("Saving to cloud...");

    try {
        // Use no-cors to prevent Safari/iOS from blocking the cross-domain redirect
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            }
        });

        // With no-cors, we receive an opaque response (status 0). We cannot read JSON.
        // If no network error was thrown, we assume the dispatch was successful.
        alert("Report saved successfully!");
        // Reset form
        form.reset();
        photos = [];
        renderPhotos();
        document.getElementById('date').valueAsDate = new Date();
        navigateTo('dashboard');
    } catch (error) {
        console.error(error);
        alert("Failed to save report. Error: " + error.message);
    } finally {
        hideLoading();
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
