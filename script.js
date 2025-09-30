// =========================================================================
// 1. HTML Elements and Variable Declarations
// =========================================================================

const startCameraBtn = document.getElementById('startCameraBtn');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const videoFeed = document.getElementById('videoFeed');
const photoCanvas = document.getElementById('photoCanvas');
const studentNameInput = document.getElementById('studentName');
const studentList = document.getElementById('studentList');

// NEW: File Upload Reference
const imageUpload = document.getElementById('imageUpload');

// Attendance button and result display elements are created dynamically
const markAttendanceBtn = document.createElement('button');
markAttendanceBtn.textContent = 'Mark Attendance (from Camera/File)'; // Translated
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

let stream = null; 
let labeledFaceDescriptors = []; 
const DISTANCE_THRESHOLD = 0.7; 


// =========================================================================
// 2. Models Load And Setup
// =========================================================================

async function loadModels() {
    if (attendanceResult) {
        attendanceResult.textContent = "Models loading... please wait."; // Translated
    }
    
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri('./models'); 
        await faceapi.nets.faceLandmark68Net.loadFromUri('./models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('./models');
        
        if (attendanceResult) {
            attendanceResult.textContent = "Models loaded successfully! ✅"; // Translated
        }
        if (markAttendanceBtn) {
            markAttendanceBtn.style.display = 'inline-block'; 
        }
    } catch (error) {
        console.error("Error loading face-api models. Check ./models folder and file integrity:", error);
        if (attendanceResult) {
            attendanceResult.textContent = "ERROR: Models failed to load. Check console and files. (Live Server required)"; // Translated
        }
    }
}


// =========================================================================
// 3. Functions (unchanged logic)
// =========================================================================

function displayStudent(name, photo) {
    // ... (unchanged display logic)
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

async function loadStudents() {
    // ... (unchanged loadStudents logic)
    labeledFaceDescriptors = []; 
    let students = JSON.parse(localStorage.getItem('students')) || [];
    
    if (studentList) { 
        studentList.innerHTML = '<h2>Captured Students</h2>'; 
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


function saveStudent(name, photo, descriptor) {
    // ... (unchanged saveStudent logic)
    let students = JSON.parse(localStorage.getItem('students')) || [];
    const descriptorArray = Array.from(descriptor); 
    
    students.push({ name: name, photo: photo, descriptor: descriptorArray });
    localStorage.setItem('students', JSON.stringify(students));
    displayStudent(name, photo); 

    loadStudents(); 
}

// =========================================================================
// 4. Event Listeners (Modified for File Upload)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadModels();
    loadStudents();
});

// Camera on event (same logic)
startCameraBtn.addEventListener('click', () => {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(videoStream => {
            stream = videoStream;
            videoFeed.srcObject = stream;
            videoFeed.play();
            takePhotoBtn.style.display = 'inline-block'; 
            takePhotoBtn.textContent = 'Capture from Camera'; // Re-confirm button text
        })
        .catch(err => {
            console.error("Camera access error: ", err); // Translated
            alert("Camera access denied. Please check permissions."); // Translated
        });
});


// ENROLLMENT LOGIC (Now handles both Camera and File Upload)
takePhotoBtn.addEventListener('click', async () => {
    const studentName = studentNameInput.value.trim();
    if (!studentName) {
        alert("Please enter the student's name first!"); // Translated
        return;
    }

    // --- LOGIC FOR CAMERA CAPTURE ---
    const context = photoCanvas.getContext('2d');
    photoCanvas.width = videoFeed.videoWidth;
    photoCanvas.height = videoFeed.videoHeight;
    context.drawImage(videoFeed, 0, 0, photoCanvas.width, photoCanvas.height);

    const capturedImage = photoCanvas; 
    await processAndSaveFace(capturedImage, studentName);
});


// NEW: FILE UPLOAD Enrollment/Attendance Trigger (on change event)
imageUpload.addEventListener('change', async (event) => {
    const files = event.target.files;

    if (!files.length) {
        return;
    }
    
    // Check if the studentName is entered for enrollment (using the first file)
    const studentName = studentNameInput.value.trim();
    const isEnrollment = studentName && files.length === 1;

    if (isEnrollment) {
        // --- LOGIC FOR FILE ENROLLMENT ---
        const file = files[0];
        const img = await faceapi.bufferToImage(file); // Load the file into an image element
        
        await processAndSaveFace(img, studentName);
        
        // Clear inputs after successful enrollment
        studentNameInput.value = '';
        imageUpload.value = null; 

    } else if (files.length > 0) {
        // Attendance mode: Files are selected, now prompt user to click the attendance button
        alert(`Selected ${files.length} file(s). Now click 'Mark Attendance' button.`);
    }
});


// Reusable function to process image/canvas and save face
async function processAndSaveFace(mediaElement, studentName) {
    let img;
    // faceapi.nets.loadFromUri accepts HTML elements directly, but for canvas/image element, 
    // we should create a tensor first for consistent descriptor extraction
    
    // We create a temporary canvas to draw the media element for consistent tensor conversion
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = mediaElement.naturalWidth || mediaElement.videoWidth || mediaElement.width;
    tempCanvas.height = mediaElement.naturalHeight || mediaElement.videoHeight || mediaElement.height;
    tempCtx.drawImage(mediaElement, 0, 0, tempCanvas.width, tempCanvas.height);

    img = faceapi.tf.browser.fromPixels(tempCanvas);
    
    const faceDetection = await faceapi.detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!faceDetection) {
        alert("No face detected in the image/camera feed. Please try again."); // Translated
        img.dispose();
        return;
    }

    const imageDataUrl = tempCanvas.toDataURL('image/png'); 
    saveStudent(studentName, imageDataUrl, faceDetection.descriptor);
    img.dispose();
}


// ATTENDANCE LOGIC (Now handles files if selected)
if (markAttendanceBtn) {
    markAttendanceBtn.addEventListener('click', async () => {
        if (labeledFaceDescriptors.length === 0) {
            alert("Please capture student photos and descriptors first!"); // Translated
            return;
        }

        let attendanceSource = videoFeed; // Default to video feed

        const files = imageUpload.files;
        if (files.length > 0) {
            // --- LOGIC FOR FILE ATTENDANCE ---
            const file = files[0];
            attendanceSource = await faceapi.bufferToImage(file); // Load file into Image element
        }

        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, DISTANCE_THRESHOLD);

        // Detect faces from the loaded image or videoFeed
        const results = await faceapi.detectAllFaces(attendanceSource)
            .withFaceLandmarks()
            .withFaceDescriptors();

        // If attendanceSource was a file image, we dispose of it's memory after detection
        if (files.length > 0) {
             // In browser environments, dispose is typically only needed for Tensors, 
             // but to be safe, we release resources if possible.
             // We'll rely on face-api's internal memory management for the image tensor.
        }

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
                attendanceResult.innerHTML = `**Present Students (${presentStudents.size}):** ${names} ✅`; // Translated
            } else {
                attendanceResult.innerHTML = "No recognized face found. 😞"; // Translated
            }
        }
        
        // Clear files selection after attendance
        imageUpload.value = null;
    });
}

// ... (loadStudents and saveStudent remain the same)