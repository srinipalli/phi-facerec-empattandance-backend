// Filename: ArgusScan Final Project/static/js/employee_signup.js

const video = document.getElementById('signupFacecam');
const canvas = document.getElementById('signupCanvas');
const captureBtn = document.getElementById('captureBtn');
const photoStatus = document.getElementById('photoStatus');
const capturedImage = document.getElementById('capturedImage');
const faceError = document.getElementById('faceError'); // Error for face capture
const cameraStatusOverlay = document.getElementById('cameraStatus'); // New element

const fullNameInput = document.getElementById('fullName');
const empIdInput = document.getElementById('empId');
const emailInput = document.getElementById('email');
const personalEmailInput = document.getElementById('personalEmail');

const signupForm = document.getElementById('employeeSignupForm');
const signupMessage = document.getElementById('signupMessage'); // General success/error message

// Password related elements
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const passwordStrength = document.getElementById('passwordStrength');
const passwordFeedbackContainer = document.getElementById('password-feedback-container');
const passwordValidationIcon = document.getElementById('password-validation-icon').querySelector('i');

const passwordHints = {
  length: document.getElementById('lengthHint'),
  uppercase: document.getElementById('uppercaseHint'),
  number: document.getElementById('numberHint'),
  special: document.getElementById('specialHint')
};
const confirmPasswordError = document.getElementById('confirmPasswordError');

// Toast notification function
function showToast(message, type = 'success') {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    const container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1100';
    document.body.appendChild(container);
  }

  const toastEl = document.createElement('div');
  let bgClass;
  let textClass = 'text-white';

  if (type === 'success') bgClass = 'bg-success';
  else if (type === 'danger') bgClass = 'bg-danger';
  else if (type === 'warning') {
    bgClass = 'bg-warning';
    textClass = 'text-dark';
  } else bgClass = 'bg-info';

  toastEl.className = `toast show align-items-center ${bgClass} ${textClass} border-0`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  document.querySelector('.toast-container').appendChild(toastEl);
  new bootstrap.Toast(toastEl, { delay: 5000 }).show();
}


// Initialize camera
function initCamera() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // Attempt to get camera stream
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => {
        video.srcObject = stream;
        video.play();
        cameraStatusOverlay.style.display = 'none'; // Hide overlay on success
        captureBtn.disabled = false; // Enable capture button
      })
      .catch(error => {
        console.error('Camera error:', error);
        cameraStatusOverlay.style.display = 'flex'; // Show overlay on error
        captureBtn.disabled = true; // Disable capture button
        faceError.textContent = 'Camera access failed.'; // Update on-page error

        let errorMessage = 'Could not access camera.';
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage += ' Please grant camera permissions in your browser settings.';
          cameraStatusOverlay.querySelector('p').innerHTML = '<i class="bi bi-camera-video-off me-2"></i>Permission Denied. Please enable camera in browser settings.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage += ' No camera found.';
          cameraStatusOverlay.querySelector('p').innerHTML = '<i class="bi bi-camera-video-off me-2"></i>No camera found.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage += ' Camera is in use or inaccessible.';
          cameraStatusOverlay.querySelector('p').innerHTML = '<i class="bi bi-camera-video-off me-2"></i>Camera in use or inaccessible. Try closing other apps.';
        } else {
          errorMessage += ` Error: ${error.message}`;
          cameraStatusOverlay.querySelector('p').innerHTML = `<i class="bi bi-camera-video-off me-2"></i>Camera error: ${error.message}`;
        }
        showToast(errorMessage, 'danger');
      });
  } else {
    // Browser does not support MediaDevices API
    cameraStatusOverlay.style.display = 'flex'; // Show overlay
    captureBtn.disabled = true; // Disable capture
    faceError.textContent = 'Your browser does not support camera access.';
    cameraStatusOverlay.querySelector('p').innerHTML = '<i class="bi bi-camera-video-off me-2"></i>Camera API not supported by your browser.';
    showToast('Camera API not supported by your browser.', 'danger');
  }
}

// Password strength checker
function checkPasswordStrength(password) {
  let strength = 0;
  const validations = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };

  Object.keys(validations).forEach(key => {
    if (validations[key]) {
      strength += 25;
      passwordHints[key].classList.add('valid');
    } else {
      passwordHints[key].classList.remove('valid');
    }
  });

  passwordStrength.style.width = `${strength}%`;
  passwordStrength.className = 'password-strength-bar';
  if (strength < 50) passwordStrength.classList.add('password-strength-weak');
  else if (strength < 100) passwordStrength.classList.add('password-strength-medium');
  else passwordStrength.classList.add('password-strength-strong');

  return validations.length && validations.uppercase && validations.number && validations.special;
}

// Toggle password visibility
function setupPasswordToggle(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);

  toggle.addEventListener('click', function() {
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    this.querySelector('i').classList.toggle('bi-eye-slash-fill');
  });
}

// Capture photo
function capturePhoto() {
  if (video.readyState < 2) {
    showToast('Camera not ready. Please wait.', 'warning');
    return;
  }
  // Check if the video stream is actually active
  if (!video.srcObject || video.srcObject.getTracks().length === 0 || video.srcObject.getTracks()[0].readyState !== 'live') {
    showToast('Camera stream is not active. Please ensure camera is working.', 'danger');
    return;
  }


  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedImage.value = canvas.toDataURL('image/jpeg', 0.9);
  photoStatus.style.display = 'block';
  faceError.textContent = '';
  showToast('Photo captured!', 'success');
}

// General input validation feedback
function validateInput(inputElement) {
    if (inputElement.checkValidity()) {
        inputElement.classList.remove('is-invalid');
        inputElement.classList.add('is-valid');
    } else {
        inputElement.classList.remove('is-valid');
        inputElement.classList.add('is-invalid');
    }
}

// Email specific validation for company email
function validateCompanyEmail() {
    const email = emailInput.value.trim();
    // Regular expression for a general email format.
    const generalEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isInnovasolutionsDomain = email.endsWith('@innovasolutions.com');

    // Check if the email is empty
    if (email.length === 0) {
        emailInput.classList.remove('is-valid');
        emailInput.classList.add('is-invalid');
        emailInput.setCustomValidity('Please provide your company email address.');
    } 
    // Check for general email format
    else if (!generalEmailRegex.test(email)) {
        emailInput.classList.remove('is-valid');
        emailInput.classList.add('is-invalid');
        emailInput.setCustomValidity('Please provide a valid email address.');
    }
    // Check for @innovasolutions.com domain
    else if (!isInnovasolutionsDomain) {
        emailInput.classList.remove('is-valid');
        emailInput.classList.add('is-invalid');
        emailInput.setCustomValidity('Please provide a valid @innovasolutions.com email address.');
    }
    // If all checks pass
    else {
        emailInput.classList.remove('is-invalid');
        emailInput.classList.add('is-valid');
        emailInput.setCustomValidity(''); // Crucial: Clear custom validity to show "Looks good!" or no message
    }
}


// Main validation function for passwords
function validatePasswords() {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // --- Live Validation for Create Password ---
    if (password.length > 0) {
        passwordFeedbackContainer.style.display = 'block';
        passwordValidationIcon.parentElement.style.display = 'flex'; // Use flex to center icon

        const isStrong = checkPasswordStrength(password);
        passwordValidationIcon.className = isStrong ? 'bi bi-check-circle-fill text-success' : 'bi bi-exclamation-circle-fill text-danger';
        passwordInput.classList.toggle('is-valid', isStrong);
        passwordInput.classList.toggle('is-invalid', !isStrong);
        document.getElementById('password-main-error').textContent = isStrong ? 'Password looks strong!' : 'Password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character.';

    } else {
        passwordFeedbackContainer.style.display = 'none';
        passwordValidationIcon.parentElement.style.display = 'none';
        passwordInput.classList.remove('is-valid', 'is-invalid');
        document.getElementById('password-main-error').textContent = 'Password must be at least 8 characters.'; // Reset message
    }

    // --- Validation for Confirm Password ---
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
    confirmPasswordInput.classList.toggle('is-valid', passwordsMatch);
    confirmPasswordInput.classList.toggle('is-invalid', !passwordsMatch && confirmPassword.length > 0);
    confirmPasswordInput.setCustomValidity(passwordsMatch || confirmPassword.length === 0 ? '' : 'Passwords must match.');
    
    return checkPasswordStrength(password) && passwordsMatch;
}

// Form submission
async function submitForm(e) {
  e.preventDefault();
  
  // Trigger validation for all inputs on submit
  validateInput(fullNameInput);
  validateInput(empIdInput); // minlength handled by HTML
  validateCompanyEmail(); // Specific email validation
  validateInput(personalEmailInput); // pattern handled by HTML
  const passwordsValid = validatePasswords(); // Password validation


  // Check all form validity after running individual validations
  // Crucially, check form.checkValidity() AFTER all custom validations are run
  // because custom validity messages influence it.
  const isFormValid = signupForm.checkValidity() && passwordsValid;

  if (!capturedImage.value) {
    faceError.textContent = 'Please capture your photo before submitting.';
    showToast('Please capture your photo before submitting.', 'danger');
    return; // Stop here if no photo
  } else {
    faceError.textContent = ''; // Clear photo error if image is captured
  }

  if (!isFormValid) {
    showToast('Please correct the errors before submitting.', 'danger');
    // Ensure Bootstrap's native validation feedback is shown.
    // 'was-validated' adds the styling for invalid/valid feedback messages.
    signupForm.classList.add('was-validated'); 
    return;
  }
  
  const submitBtn = document.getElementById('registerButton');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Registering...';

  try {
    const formData = new FormData(signupForm);
    const data = Object.fromEntries(formData.entries());
    data.capturedImage = capturedImage.value; // Add captured image data

    const response = await fetch('/employee_signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.ok) {
      showToast('Registration successful! Redirecting to login...', 'success');
      signupForm.reset();
      // Clear validation states
      fullNameInput.classList.remove('is-valid', 'is-invalid');
      empIdInput.classList.remove('is-valid', 'is-invalid');
      emailInput.classList.remove('is-valid', 'is-invalid');
      personalEmailInput.classList.remove('is-valid', 'is-invalid');
      passwordInput.classList.remove('is-valid', 'is-invalid');
      confirmPasswordInput.classList.remove('is-valid', 'is-invalid');
      passwordFeedbackContainer.style.display = 'none';
      passwordValidationIcon.parentElement.style.display = 'none';

      photoStatus.style.display = 'none';
      signupForm.classList.remove('was-validated'); // Reset form validation state

      // Stop camera stream after successful registration
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }

      setTimeout(() => window.location.href = '/employee_login', 2000);
    } else {
      // If server returns an error, set custom validity on the email field
      // if the error message is specifically about the email
      if (result.message && result.message.includes('email')) {
          emailInput.setCustomValidity(result.message);
          emailInput.classList.add('is-invalid');
      }
      showToast(result.message || 'Registration failed.', 'danger');
      signupMessage.textContent = result.message;
      signupMessage.className = 'alert alert-danger mt-3 text-center';
      signupMessage.style.display = 'block';
      signupForm.classList.add('was-validated'); // Re-apply to show server-side errors
    }
  } catch (error) {
    showToast('An error occurred. Please try again.', 'danger');
    console.error('Registration error:', error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-check-lg me-2"></i> Register';
  }
}

// Initialize the application
function init() {
  initCamera();
  
  // Real-time validation for input fields
  fullNameInput.addEventListener('input', () => validateInput(fullNameInput));
  empIdInput.addEventListener('input', () => validateInput(empIdInput));
  emailInput.addEventListener('input', validateCompanyEmail);
  personalEmailInput.addEventListener('input', () => validateInput(personalEmailInput));

  passwordInput.addEventListener('input', validatePasswords);
  confirmPasswordInput.addEventListener('input', validatePasswords);

  setupPasswordToggle('password', 'togglePassword');
  setupPasswordToggle('confirmPassword', 'toggleConfirmPassword');
  captureBtn.addEventListener('click', capturePhoto);
  signupForm.addEventListener('submit', submitForm);

  // Stop camera stream when navigating away or closing page
  window.addEventListener('beforeunload', () => {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
  });
}

document.addEventListener('DOMContentLoaded', init);