document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded and parsed");

    // Initialize Kiosk mode if on the correct page
    if (document.getElementById('facecamVideo') && document.getElementById('facecamVideoOut')) {
        initKioskMode();
    }

    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Initialize offcanvas for mobile
    const homeSidebarOffcanvasEl = document.getElementById('homeSidebarOffcanvas');
    if (homeSidebarOffcanvasEl) {
        new bootstrap.Offcanvas(homeSidebarOffcanvasEl);
    }

    // --- PWA Installation Logic ---
    let deferredPrompt;
    const installBanner = document.getElementById('install-banner');
    const confirmInstallBtn = document.getElementById('confirm-install-btn');
    const closeInstallBannerBtn = document.getElementById('close-install-banner');
    const installAnimation = document.getElementById('install-success-animation');
    const downloadAppLink = document.getElementById('downloadAppLink');

    // Function to handle the installation process
    const handleInstallPrompt = async () => {
        if (!deferredPrompt) {
            console.log('Install prompt cannot be shown, deferredPrompt is null.');
            // Optionally, inform the user the app can't be installed, maybe already installed
            showToast('warning', "The app cannot be installed right now. It might be already installed or your browser doesn't support it.");
            return;
        }

        // Hide the banner if it is visible
        if (installBanner) installBanner.classList.remove('show');

        // Show the browser's install prompt
        deferredPrompt.prompt();
        console.log('Browser install prompt triggered.');
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
            if (installAnimation) {
                installAnimation.style.display = 'flex';
                installAnimation.classList.add('show');
                setTimeout(() => {
                    installAnimation.style.display = 'none';
                    installAnimation.classList.remove('show');
                }, 4000);
            }
        } else {
            console.log('User dismissed the install prompt');
        }

        // The prompt can only be used once.
        deferredPrompt = null;
        // Disable the install button/link after the prompt has been used
        if(downloadAppLink) downloadAppLink.style.display = 'none';
        if(installBanner) installBanner.style.display = 'none';
    };

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('`beforeinstallprompt` event fired.');
        e.preventDefault();
        deferredPrompt = e;
        if (installBanner) {
            installBanner.classList.add('show');
            console.log('Install banner shown.');
        }
        if(downloadAppLink) {
            downloadAppLink.style.display = 'flex'; // Ensure the link is visible
        }
    });

    if (confirmInstallBtn) {
        confirmInstallBtn.addEventListener('click', handleInstallPrompt);
    }
    
    if (downloadAppLink) {
        downloadAppLink.addEventListener('click', (e) => {
            e.preventDefault();
            handleInstallPrompt();
        });
    }

    if (closeInstallBannerBtn) {
        closeInstallBannerBtn.addEventListener('click', () => {
            installBanner.classList.remove('show');
            console.log('Install banner closed by user.');
        });
    }
    
    window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
        // Hide the install promotion
        if(installBanner) installBanner.style.display = 'none';
        if(downloadAppLink) downloadAppLink.style.display = 'none';
        deferredPrompt = null;
    });


    function initKioskMode() {
        const videoIn = document.getElementById('facecamVideo');
        const videoOut = document.getElementById('facecamVideoOut');
        const canvasIn = document.getElementById('facecamCanvas');
        const canvasOut = document.getElementById('facecamCanvasOut');
        const recognitionStatusIn = document.getElementById('recognitionStatus');
        const recognitionStatusOut = document.getElementById('recognitionStatusOut');
        const recognitionCountdownIn = document.getElementById('recognitionCountdown'); // New element
        const recognitionCountdownOut = document.getElementById('recognitionCountdownOut'); // New element
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
                showToast('danger', 'Camera error: ' + error.message);
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
                    return videoElement.play(); // Return the promise from play()
                });
        }

        function startLocationTracking() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    updatePosition,
                    handleLocationError,
                    { enableHighAccuracy: true, timeout: 10000 }
                );
                watchId = navigator.geolocation.watchPosition(
                    updatePosition,
                    handleLocationError,
                    { enableHighAccuracy: true, maximumAge: 10000 }
                );
            } else {
                locationStatus.innerHTML = '<i class="bi bi-geo-alt-slash text-danger"></i> Location: Not supported';
                showToast('warning', 'Geolocation is not supported by your browser.');
            }
        }

        function updatePosition(position) {
            currentLocation.latitude = position.coords.latitude;
            currentLocation.longitude = position.coords.longitude;
            const locationText = document.getElementById('locationText');
            if(locationText) {
                locationText.textContent = `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`;
            }
        }

        function handleLocationError(error) {
            let message = 'Location: ';
            switch(error.code) {
                case error.PERMISSION_DENIED: message += 'Permission denied'; break;
                case error.POSITION_UNAVAILABLE: message += 'Position unavailable'; break;
                case error.TIMEOUT: message += 'Request timed out'; break;
                default: message += 'Unknown error';
            }
            const locationText = document.getElementById('locationText');
            if(locationText) {
               locationText.innerHTML = `<span class="text-warning">${message}</span>`;
            }
            showToast('warning', `Location error: ${message}.`);
        }

        function startRecognition() {
            clearInterval(recognitionInterval);
            // FIX: Increased the interval from 1500ms to 5000ms (5 seconds) to reduce frequent processing.
            // Further optimization could involve motion detection to trigger scans only when a face is present.
            recognitionInterval = setInterval(() => {
                if (isProcessing) return;

                const activeTab = document.querySelector('#authTabsContent .tab-pane.active');
                if (!activeTab) return;

                const isPunchIn = activeTab.id === 'punchin';
                const video = isPunchIn ? videoIn : videoOut;
                const canvas = isPunchIn ? canvasIn : canvasOut;
                const recognitionStatus = isPunchIn ? recognitionStatusIn : recognitionStatusOut;
                const userInfoSection = isPunchIn ? userInfoSectionIn : userInfoSectionOut;
                const initialMessage = isPunchIn ? initialMessageIn : initialMessageOut;
                const countdownEl = isPunchIn ? recognitionCountdownIn : recognitionCountdownOut;

                if (userInfoSection.style.display === 'block') return; // User info is displayed, don't scan

                // Implement brief countdown visual cue
                countdownEl.style.display = 'block';
                countdownEl.textContent = 'Scanning...'; // Or "Scanning in 1..." if a specific number is preferred
                setTimeout(() => {
                    countdownEl.style.display = 'none';
                    countdownEl.textContent = '';
                }, 500); // Show for half a second before actual processing starts


                isProcessing = true;
                recognitionStatus.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div> Recognizing...';

                try {
                    if (video.readyState < 2) throw new Error('Camera not ready');
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
                            action: isPunchIn ? 'punchin' : 'punchout'
                        })
                    })
                    .then(response => response.json().then(data => ({ ok: response.ok, data })))
                    .then(({ ok, data }) => {
                        if (ok && data.success) {
                            handleRecognitionSuccess(data, isPunchIn);
                        } else {
                            handleRecognitionError(data, recognitionStatus); // Pass fewer args, use showToast
                        }
                    })
                    .catch(error => {
                       console.error('Fetch Error:', error);
                       handleRecognitionError({ message: 'Network error or server is down.' }, recognitionStatus);
                    })
                    .finally(() => { isProcessing = false; });
                } catch (error) {
                    handleRecognitionError({ message: error.message }, recognitionStatus);
                    isProcessing = false;
                }
            }, 5000); // Changed from 1500 to 5000 for reduced frequency
        }

        function handleRecognitionSuccess(data, isPunchIn) {
            const [recStatus, userInfo, initMsg] = isPunchIn
                ? [recognitionStatusIn, userInfoSectionIn, initialMessageIn]
                : [recognitionStatusOut, userInfoSectionOut, initialMessageOut];
            
            recStatus.innerHTML = `<span class="text-success">✓ Recognized (${(data.confidence * 100).toFixed(0)}% confidence)</span>`;
            showToast('success', data.status);
            showUserInfo(data, isPunchIn);
            setTimeout(() => {
                userInfo.style.display = 'none';
                initMsg.style.display = 'block';
                recStatus.innerHTML = isPunchIn ? 'Ready for Punch In' : 'Ready for Punch Out';
            }, 5000);
        }

        function handleRecognitionError(data, recognitionStatus) {
            let errorMessage = data.message || 'Recognition failed';
            if (data.confidence) errorMessage += ` (Confidence: ${(data.confidence * 100).toFixed(0)}%)`;
            recognitionStatus.innerHTML = `<span class="text-warning">✗ ${errorMessage}</span>`;
            showToast('danger', errorMessage);
        }

        function showUserInfo(data, isPunchIn) {
            const [userNameEl, userEmpIdEl, userImageEl, userStatusEl, userInfoSection, initialMessage] = isPunchIn
                ? [document.getElementById('userName'), document.getElementById('userEmpId'), document.getElementById('userImage'), document.getElementById('userStatus'), userInfoSectionIn, initialMessageIn]
                : [document.getElementById('userNameOut'), document.getElementById('userEmpIdOut'), document.getElementById('userImageOut'), document.getElementById('userStatusOut'), userInfoSectionOut, initialMessageOut];

            userNameEl.textContent = data.full_name;
            userEmpIdEl.textContent = data.emp_id;
            userImageEl.src = data.image_path;
            userStatusEl.textContent = data.status;
            userStatusEl.className = `status-badge ${isPunchIn ? 'status-in' : 'status-out'}`;
            
            const now = new Date();
            const dateTimeElement = document.createElement('div');
            dateTimeElement.className = 'date-time-info';
            dateTimeElement.innerHTML = `<p class="text-muted mb-1">${now.toLocaleDateString()} ${now.toLocaleTimeString()}</p><p class="text-muted">Location: ${data.location || 'Not recorded'}</p>`;
            
            const existingDateTime = userInfoSection.querySelector('.date-time-info');
            if (existingDateTime) existingDateTime.replaceWith(dateTimeElement);
            else userInfoSection.appendChild(dateTimeElement);

            initialMessage.style.display = 'none';
            userInfoSection.style.display = 'block';
        }

        window.addEventListener('beforeunload', () => {
            clearInterval(recognitionInterval);
            if (watchId) navigator.geolocation.clearWatch(watchId);
            [videoIn, videoOut].forEach(video => {
                if (video && video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
            });
        });
    }

    // Unified showToast function for all pages
    function showToast(type, message) {
        const toastContainer = document.querySelector('.toast-container') || createToastContainer();
        const toastId = 'toast-' + Date.now();
        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body"></div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        const toastElement = document.getElementById(toastId);
        const toastBody = toastElement.querySelector('.toast-body');
        toastBody.textContent = message;

        // Adjust text color based on toast type for better contrast
        if (type === 'warning' || type === 'info') {
            toastBody.classList.remove('text-white');
            toastBody.classList.add('text-dark');
        } else {
            toastBody.classList.remove('text-dark');
            toastBody.classList.add('text-white');
        }

        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 5000
        });
        toast.show();

        toastElement.addEventListener('hidden.bs.toast', function() {
            toastElement.remove();
        });
    }

    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
        return container;
    }

    function updateLiveDateTime() {
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
        
        const formattedDate = now.toLocaleDateString('en-US', dateOptions);
        const formattedTime = now.toLocaleTimeString('en-US', timeOptions);

        const dateTimeElement = document.getElementById('home-live-datetime'); // Target the element in the main header
        if (dateTimeElement) {
            // Apply subtle animation class before updating content
            dateTimeElement.classList.add('fade-in-out');
            dateTimeElement.innerHTML = `
                <span class="d-block text-muted small">${formattedDate}</span>
                <span class="display-5 fw-bold" style="color: #6a8cc8;">${formattedTime}</span> `;
            // Remove the class after a short delay to allow re-triggering
            setTimeout(() => {
                dateTimeElement.classList.remove('fade-in-out');
            }, 900); // Matches CSS animation duration
        }
    }

    // Call immediately and then every second
    updateLiveDateTime();
    setInterval(updateLiveDateTime, 1000);
});