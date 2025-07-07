document.addEventListener('DOMContentLoaded', function() {
    // Check if this is the kiosk page
    if (document.getElementById('facecamVideo') && document.getElementById('facecamVideoOut')) {
        initKioskMode();
    }

    function initKioskMode() {
        const videoIn = document.getElementById('facecamVideo');
        const videoOut = document.getElementById('facecamVideoOut');
        const canvasIn = document.getElementById('facecamCanvas');
        const canvasOut = document.getElementById('facecamCanvasOut');
        const recognitionStatusIn = document.getElementById('recognitionStatus');
        const recognitionStatusOut = document.getElementById('recognitionStatusOut');
        const locationStatus = document.getElementById('locationStatus');
        const userInfoSectionIn = document.getElementById('userInfoSection');
        const userInfoSectionOut = document.getElementById('userInfoSectionOut');
        const initialMessageIn = document.getElementById('initialMessage');
        const initialMessageOut = document.getElementById('initialMessageOut');
        const loginMessageIn = document.getElementById('loginMessage');
        const loginMessageOut = document.getElementById('loginMessageOut');

        let recognitionInterval;
        let isProcessing = false;
        let currentLocation = { latitude: null, longitude: null, address: null };
        let watchId = null;

        // Initialize cameras
        initCamera(videoIn)
            .then(() => initCamera(videoOut))
            .then(() => {
                startLocationTracking();
                startRecognition();
            })
            .catch(error => {
                console.error('Camera initialization failed:', error);
                showMessage(loginMessageIn, 'Camera error: ' + error.message, 'danger');
            });

        function initCamera(videoElement) {
            return navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user' 
                } 
            })
                .then(stream => {
                    videoElement.srcObject = stream;
                    return true;
                });
        }

        function startLocationTracking() {
            if (navigator.geolocation) {
                // First get immediate position
                navigator.geolocation.getCurrentPosition(
                    updatePosition,
                    handleLocationError,
                    { enableHighAccuracy: true, timeout: 10000 }
                );
                
                // Then watch for position updates
                watchId = navigator.geolocation.watchPosition(
                    updatePosition,
                    handleLocationError,
                    { enableHighAccuracy: true, maximumAge: 10000 }
                );
            } else {
                locationStatus.innerHTML = '<i class="bi bi-geo-alt-slash text-danger"></i> Location: Not supported';
            }
        }

        function updatePosition(position) {
            currentLocation.latitude = position.coords.latitude;
            currentLocation.longitude = position.coords.longitude;
            
            // Get address from coordinates
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}&zoom=18&addressdetails=1`, {
                headers: {
                    'User-Agent': 'FaceRecognitionAttendanceSystem/1.0'
                }
            })
            .then(response => response.json())
            .then(data => {
                const address = data.display_name || `Location at ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`;
                currentLocation.address = address;
                locationStatus.innerHTML = `<i class="bi bi-geo-alt-fill text-primary"></i> Location: ${address}`;
            })
            .catch(() => {
                const coords = `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`;
                currentLocation.address = `Location at ${coords}`;
                locationStatus.innerHTML = `<i class="bi bi-geo-alt-fill text-primary"></i> Location: ${coords}`;
            });
        }

        function handleLocationError(error) {
            let message = 'Location: ';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    message += 'Permission denied';
                    break;
                case error.POSITION_UNAVAILABLE:
                    message += 'Position unavailable';
                    break;
                case error.TIMEOUT:
                    message += 'Request timed out';
                    break;
                default:
                    message += 'Unknown error';
            }
            locationStatus.innerHTML = `<i class="bi bi-geo-alt-slash text-warning"></i> ${message}`;
        }

        function startRecognition() {
    clearInterval(recognitionInterval);
    
    recognitionInterval = setInterval(() => {
        if (isProcessing) return;
        
        const activeTab = document.querySelector('#authTabsContent .tab-pane.active').id;
        const isPunchIn = activeTab === 'punchin';
        
        const video = isPunchIn ? videoIn : videoOut;
        const canvas = isPunchIn ? canvasIn : canvasOut;
        const recognitionStatus = isPunchIn ? recognitionStatusIn : recognitionStatusOut;
        const userInfoSection = isPunchIn ? userInfoSectionIn : userInfoSectionOut;
        const initialMessage = isPunchIn ? initialMessageIn : initialMessageOut;
        const loginMessage = isPunchIn ? loginMessageIn : loginMessageOut;
        
        if (userInfoSection.style.display === 'block') return;
        
        isProcessing = true;
        recognitionStatus.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div> Recognizing...';
        
        try {
            // Check if video is ready
            if (video.readyState < 2) {
                throw new Error('Camera not ready');
            }
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            const imageData = canvas.toDataURL('image/jpeg');
            
            fetch('/auto_signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    capturedPhoto: imageData.split(',')[1],
                    latitude: currentLocation.latitude,
                    longitude: currentLocation.longitude,
                    address: currentLocation.address,
                    action: isPunchIn ? 'punchin' : 'punchout'
                })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(JSON.stringify(err));
                    });
                }
                return response.json();
            })
            .then(data => handleRecognitionSuccess(data, isPunchIn, recognitionStatus, userInfoSection, initialMessage))
            .catch(error => {
                handleRecognitionError(error, recognitionStatus, loginMessage);
            })
            .finally(() => {
                isProcessing = false;
            });
        } catch (error) {
            handleRecognitionError(error, recognitionStatus, loginMessage);
            isProcessing = false;
        }
    }, 3000);
}

        function handleResponse(response) {
            if (!response.ok) throw new Error('Recognition failed');
            return response.json();
        }

        function handleRecognitionSuccess(data, isPunchIn, recognitionStatus, userInfoSection, initialMessage) {
    if (data.success) {
        recognitionStatus.innerHTML = `<span class="text-success">✓ Recognized (${(data.confidence * 100).toFixed(0)}%)</span>`;
        
        currentUser = {
            full_name: data.full_name,
            emp_id: data.emp_id,
            image_path: data.image_path
        };
        currentStatus = data.status;
        
        showUserInfo(data, isPunchIn);
        
        setTimeout(() => {
            userInfoSection.style.display = 'none';
            initialMessage.style.display = 'block';
            recognitionStatus.innerHTML = isPunchIn ? 'Ready for Punch In' : 'Ready for Punch Out';
        }, 5000);
    } else {
        recognitionStatus.innerHTML = `<span class="text-warning">✗ ${data.message}</span>`;
        showMessage(loginMessage, data.message || 'Recognition failed', 'danger');
        
        // If it's a punch in error, show the error for longer
        if (isPunchIn && data.message.includes('already punched in')) {
            setTimeout(() => {
                recognitionStatus.innerHTML = 'Ready for Punch In';
            }, 10000);
        }
    }
}

        function handleRecognitionError(error, recognitionStatus, loginMessage) {
    console.error('Recognition error:', error);
    
    let errorMessage = 'Recognition error';
    if (error.message) {
        // Handle JSON error responses
        try {
            const errorData = JSON.parse(error.message);
            if (errorData.message) {
                errorMessage = errorData.message;
            }
        } catch (e) {
            // If not JSON, use the raw message
            errorMessage = error.message;
        }
    }
    
    recognitionStatus.innerHTML = `<span class="text-danger">✗ ${errorMessage}</span>`;
    showMessage(loginMessage, errorMessage, 'danger');
}


        function showUserInfo(data, isPunchIn) {
    const userInfoSection = isPunchIn ? userInfoSectionIn : userInfoSectionOut;
    const initialMessage = isPunchIn ? initialMessageIn : initialMessageOut;
    
    document.getElementById(isPunchIn ? 'userName' : 'userNameOut').textContent = data.full_name;
    document.getElementById(isPunchIn ? 'userEmpId' : 'userEmpIdOut').textContent = data.emp_id;
    document.getElementById(isPunchIn ? 'userImage' : 'userImageOut').src = data.image_path;
    
    const statusElement = document.getElementById(isPunchIn ? 'userStatus' : 'userStatusOut');
    statusElement.textContent = data.status;
    statusElement.className = `status-badge ${isPunchIn ? 'status-in' : 'status-out'}`;
    
    // Add date/time and location info
    const now = new Date();
    const dateTimeElement = document.createElement('div');
    dateTimeElement.className = 'date-time-info';
    dateTimeElement.innerHTML = `
        <p class="text-muted mb-1">${now.toLocaleDateString()} ${now.toLocaleTimeString()}</p>
        <p class="text-muted">Location: ${data.location || 'Not recorded'}</p>
    `;
    
    const existingDateTime = userInfoSection.querySelector('.date-time-info');
    if (existingDateTime) {
        existingDateTime.replaceWith(dateTimeElement);
    } else {
        userInfoSection.appendChild(dateTimeElement);
    }
    
    initialMessage.style.display = 'none';
    userInfoSection.style.display = 'block';
}

        function showMessage(element, text, type) {
            element.textContent = text;
            element.className = `alert alert-${type}`;
            element.style.display = 'block';
            setTimeout(() => {
                element.style.display = 'none';
            }, 5000);
        }

        // Clean up
        window.addEventListener('beforeunload', () => {
            clearInterval(recognitionInterval);
            if (watchId) {
                navigator.geolocation.clearWatch(watchId);
            }
            [videoIn, videoOut].forEach(video => {
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
            });
        });
    }
});