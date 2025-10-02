// =========================================================================
// 1. HTML Elements and Variable Declarations (No change needed)
// =========================================================================

const startCameraBtn = document.getElementById('startCameraBtn');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const videoFeed = document.getElementById('videoFeed');
const photoCanvas = document.getElementById('photoCanvas');
const studentNameInput = document.getElementById('studentNameInput');
const studentList = document.getElementById('studentList');
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');

// NEW LOGIN/CLASS VARIABLES
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const classNameInput = document.getElementById('classNameInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginMessage = document.getElementById('loginMessage');

let CURRENT_CLASS_ID = null; 
let stream = null; 
let labeledFaceDescriptors = []; 
const DISTANCE_THRESHOLD = 0.7; 

// New State: To track if an image is staged for saving from file
let stagedImageForEnrollment = null; 
let originalTakePhotoBtnText = 'Capture from Camera';


// Hardcoded Class Credentials (No change needed)
const CLASS_CREDENTIALS = {
    "BCA_1": "bca1pass",
    "BCA_2": "bca2pass",
    "MCA_1": "mca1pass"
};


// Attendance button and result display elements (No change needed)
const markAttendanceBtn = document.createElement('button');
markAttendanceBtn.textContent = 'Mark Attendance (from Camera/File)'; 
markAttendanceBtn.id = 'markAttendanceBtn';
markAttendanceBtn.style.display = 'none'; 
const controlsDiv = document.querySelector('.controls');
if (controlsDiv) {
    controlsDiv.appendChild(markAttendanceBtn);
}

const attendanceResult = document.createElement('p');
attendanceResult.id = 'attendanceResult';
const containerDiv = document.querySelector('.container');
if (containerDiv) {
    containerDiv.appendChild(attendanceResult);
}


// =========================================================================
// 2. Models Load And Setup (No change needed)
// =========================================================================

async function loadModels() {
    if (attendanceResult) {
        attendanceResult.textContent = "Models loading... please wait.";
    }
    
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri('./models'); 
        await faceapi.nets.faceLandmark68Net.loadFromUri('./models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('./models');
        
        if (attendanceResult) {
            attendanceResult.textContent = "Models loaded successfully! ✅";
        }
    } catch (error) {
        console.error("Error loading face-api models. Check ./models folder and file integrity:", error);
        if (attendanceResult) {
            attendanceResult.textContent = "ERROR: Models failed to load. Check console and files. (Live Server required)";
        }
    }
}

// =========================================================================
// 3. Functions (Login/Data/Core Logic)
// =========================================================================

// Utility to clear video stream and staged image preview (No change needed)
function clearCameraAndPreview() {
    // Stops the camera stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    videoFeed.srcObject = null;
    
    // Reset video styling
    videoFeed.style.transform = 'scale(1.0)'; 
    videoFeed.style.objectFit = 'contain';

    // Hides elements
    videoFeed.style.display = 'none';
    takePhotoBtn.style.display = 'none';
    imagePreview.style.display = 'none';
    imagePreview.src = '';
    
    // Resets state variables
    stagedImageForEnrollment = null;
    takePhotoBtn.textContent = originalTakePhotoBtnText;
}

function displayStudent(name, photo) {
    if (!studentList) return; 
    const card = document.createElement('div');
    card.classList.add('student-card');
    const img = document.createElement('img');
    img.src = photo;
    img.alt = name;
    const nameText = document.createElement('span');
    nameText.classList.add('name');
    nameText.textContent = name;
    card.appendChild(img);
    card.appendChild(nameText);
    studentList.appendChild(card);
}

// Loads data based on CURRENT_CLASS_ID (No change needed)
async function loadStudents() {
    labeledFaceDescriptors = []; 
    
    if (!CURRENT_CLASS_ID) {
        if (studentList) studentList.innerHTML = '<h2>Please Login to see students</h2>';
        return;
    }
    
    let students = JSON.parse(localStorage.getItem(CURRENT_CLASS_ID)) || [];
    
    if (studentList) { 
        studentList.innerHTML = `<h2>Captured Students - ${CURRENT_CLASS_ID}</h2>`;
    }

    students.forEach(student => {
        displayStudent(student.name, student.photo);
        
        if (student.descriptor) {
            try {
                const descriptor = new Float32Array(student.descriptor);
                const labeledDescriptor = new faceapi.LabeledFaceDescriptors(
                    student.name, 
                    [descriptor]
                );
                labeledFaceDescriptors.push(labeledDescriptor);
            } catch (e) {
                console.error("Error converting descriptor for student:", student.name, e);
            }
        }
    });
}

// Saves data using CURRENT_CLASS_ID (No change needed)
function saveStudent(name, photo, descriptor) {
    if (!CURRENT_CLASS_ID) {
        alert("Error: Please login to a class first!");
        return;
    }
    let classData = JSON.parse(localStorage.getItem(CURRENT_CLASS_ID)) || [];
    
    const descriptorArray = Array.from(descriptor); 
    
    classData.push({ name: name, photo: photo, descriptor: descriptorArray });
    localStorage.setItem(CURRENT_CLASS_ID, JSON.stringify(classData));
    
    loadStudents(); 
}


// Core Face Detection/Descriptor Extraction logic (Optimized for Canvas/Image loading)
async function processAndSaveFace(mediaElement, studentName) {
    return new Promise(async (resolve) => {
        
        // Show processing image visually
        videoFeed.style.display = 'none';
        imagePreview.style.display = 'block';
        
        // Create temporary canvas for robust drawing and tensor creation
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Wait for image/media to be fully loaded before drawing to avoid blank canvas/lag
        await new Promise(r => {
            if (mediaElement.complete || mediaElement.readyState >= 2 || mediaElement.tagName !== 'IMG') {
                r();
            } else {
                mediaElement.onload = r;
            }
        });
        
        tempCanvas.width = mediaElement.naturalWidth || mediaElement.videoWidth || mediaElement.width || 600;
        tempCanvas.height = mediaElement.naturalHeight || mediaElement.videoHeight || mediaElement.height || 400;
        tempCtx.drawImage(mediaElement, 0, 0, tempCanvas.width, tempCanvas.height);
        imagePreview.src = tempCanvas.toDataURL('image/png'); // Update source for visibility

        const img = faceapi.tf.browser.fromPixels(tempCanvas); 
        
        const faceDetection = await faceapi.detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();
    
        if (!faceDetection) {
            alert(`No face detected in the image for ${studentName}. Please try again with a clearer photo.`);
            img.dispose();
            clearCameraAndPreview();
            resolve();
            return;
        }
    
        const imageDataUrl = tempCanvas.toDataURL('image/png'); 
        saveStudent(studentName, imageDataUrl, faceDetection.descriptor);
        
        alert(`Student ${studentName} successfully enrolled!`);
        clearCameraAndPreview(); // Reset UI after success
        
        img.dispose();
        resolve();
    });
}

// =========================================================================
// 4. Event Listeners (All Features)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initial setup: Loads models, sets up login/main app view
    loadModels();
    if (loginScreen) {
        loginScreen.style.display = 'block';
        mainApp.style.display = 'none';
    } else {
        loadStudents(); 
    }
});


// *** LOGIN BUTTON LOGIC *** (No change needed)
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        const classId = classNameInput.value.trim().toUpperCase(); 
        const password = passwordInput.value.trim();
        
        if (CLASS_CREDENTIALS[classId] === password) {
            CURRENT_CLASS_ID = classId;
            loginMessage.textContent = `Success! Logged in as ${classId}.`;
            loginMessage.style.color = 'green';
            
            loginScreen.style.display = 'none'; 
            mainApp.style.display = 'block'; 

            if (markAttendanceBtn) {
                 markAttendanceBtn.style.display = 'inline-block';
            }
            
            loadStudents(); 

        } else {
            loginMessage.textContent = 'Login failed. Check Class Name and Password.';
            loginMessage.style.color = 'red';
        }
    });
}


// *** UPDATED: Back Camera/Environment Facing & Flexibility/Zoom *** (No change needed)
startCameraBtn.addEventListener('click', () => {
    if (!CURRENT_CLASS_ID) {
        alert("Please login to a class first!");
        return;
    }
    clearCameraAndPreview(); 
    
    videoFeed.style.display = 'block';

    navigator.mediaDevices.getUserMedia({ 
        video: {
            facingMode: 'environment', 
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            resizeMode: 'crop-and-scale' 
        }
    })
        .then(videoStream => {
            stream = videoStream;
            videoFeed.srcObject = stream;
            videoFeed.play();
            takePhotoBtn.style.display = 'inline-block'; 
            takePhotoBtn.textContent = originalTakePhotoBtnText;
            
            videoFeed.style.transform = 'scale(1.1)'; 
            videoFeed.style.objectFit = 'cover';
        })
        .catch(err => {
            console.error("Camera access error: ", err);
            alert("Camera access denied or device not found."); 
        });
});


// *** ENROLLMENT/SAVE LOGIC (Handles Camera Capture OR Staged File) ***
takePhotoBtn.addEventListener('click', async () => {
    const studentName = studentNameInput.value.trim();
    if (!studentName) {
        alert("Please enter the student's name first!"); 
        return;
    }
    if (!CURRENT_CLASS_ID) {
        alert("Please login to a class first!");
        return;
    }

    if (stagedImageForEnrollment) {
        // --- LOGIC FOR SAVING STAGED FILE (Use staged image) ---
        await processAndSaveFace(stagedImageForEnrollment, studentName);
        studentNameInput.value = '';
        imageUpload.value = null; // Clear file input
        
    } else {
        // --- LOGIC FOR CAMERA CAPTURE (Capture current video frame) ---
        
        if (videoFeed.srcObject === null || videoFeed.style.display === 'none') {
            alert("Camera stream is not running. Please click 'Start Camera' first.");
            return;
        }
        
        // Step 1: Capture frame onto canvas
        const context = photoCanvas.getContext('2d');
        photoCanvas.width = videoFeed.videoWidth;
        photoCanvas.height = videoFeed.videoHeight;
        context.drawImage(videoFeed, 0, 0, photoCanvas.width, photoCanvas.height);

        // Step 2: Process canvas image
        const capturedImage = photoCanvas;
        await processAndSaveFace(capturedImage, studentName);
    }
});


// *** FILE UPLOAD Preview and Staging ***
imageUpload.addEventListener('change', async (event) => {
    
    clearCameraAndPreview();
    
    const files = event.target.files;
    if (!files.length) return;
    
    const file = files[0];
    
    // Read file data for preview and staging (Using a Promise to ensure the image loads)
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        // Create an Image object to load the data URL
        const img = new Image();
        img.onload = () => {
            // Display preview
            imagePreview.style.display = 'block';
            imagePreview.src = img.src;

            // Stage the image object for processing upon clicking the SAVE button
            stagedImageForEnrollment = img;
            
            // Update UI if in Enrollment Mode (Name is entered)
            if (studentNameInput.value.trim()) {
                takePhotoBtn.style.display = 'inline-block';
                takePhotoBtn.textContent = 'Save Selected Image'; 
            } else if (files.length > 0) {
                // Attendance mode: Files are selected, prompt user to click the attendance button
                alert(`Selected ${files.length} file(s). Now click 'Mark Attendance' button.`);
            }
        };
        img.src = e.target.result; // Start loading the image data

    };
    reader.readAsDataURL(file); // Reads the file data as a URL
});


// ATTENDANCE LOGIC (Handles File/Camera)
if (markAttendanceBtn) {
    markAttendanceBtn.addEventListener('click', async () => {
        if (!CURRENT_CLASS_ID) {
            alert("Please login to a class first!");
            return;
        }

        if (labeledFaceDescriptors.length === 0) {
            alert(`No student data found for ${CURRENT_CLASS_ID}! Please enroll students first.`);
            return;
        }
        
        // Determine source: Staged image preview OR live video feed
        let attendanceSource;
        if (imagePreview.style.display === 'block' && imagePreview.src) {
            // Use the displayed image for attendance (from file upload)
            attendanceSource = imagePreview;
        } else {
            // Use the live video feed (if running)
            if (videoFeed.srcObject === null || videoFeed.style.display === 'none') {
                alert("Please start the camera or select an image file to mark attendance.");
                return;
            }
            // Capture video frame onto canvas for detection
            const context = photoCanvas.getContext('2d');
            photoCanvas.width = videoFeed.videoWidth;
            photoCanvas.height = videoFeed.videoHeight;
            context.drawImage(videoFeed, 0, 0, photoCanvas.width, photoCanvas.height);
            attendanceSource = photoCanvas;
        }
        
        
        // ... (rest of the matching and recognition logic is fine)
        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, DISTANCE_THRESHOLD);

        const results = await faceapi.detectAllFaces(attendanceSource)
            .withFaceLandmarks()
            .withFaceDescriptors();

        let presentStudents = new Set();
        
        results.forEach(detection => {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            
            if (bestMatch.label !== 'unknown') {
                presentStudents.add(bestMatch.label);
            }
        });

        if (attendanceResult) {
            if (presentStudents.size > 0) {
                const names = Array.from(presentStudents).join(', ');
                attendanceResult.innerHTML = `**Present Students (${presentStudents.size}):** ${names} ✅`;
            } else {
                attendanceResult.innerHTML = "No recognized face found. 😞";
            }
        }
        
        clearCameraAndPreview(); // Clear preview and stop camera after attendance
    });
}
