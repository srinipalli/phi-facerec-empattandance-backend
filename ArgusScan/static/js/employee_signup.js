const video = document.getElementById('signupFacecam');
const canvas = document.getElementById('signupCanvas');
const captureBtn = document.getElementById('captureBtn');
const photoStatus = document.getElementById('photoStatus');
const capturedImage = document.getElementById('capturedImage');
const faceError = document.getElementById('faceError');
const empIdError = document.getElementById('empIdError');
const emailError = document.getElementById('emailError');
const signupForm = document.getElementById('employeeSignupForm');
const signupMessage = document.getElementById('signupMessage');
const passwordInput = document.getElementById('password');
const passwordStrength = document.getElementById('passwordStrength');
const passwordHints = {
  length: document.getElementById('lengthHint'),
  uppercase: document.getElementById('uppercaseHint'),
  number: document.getElementById('numberHint'),
  special: document.getElementById('specialHint')
};

// Toast notification function
function showToast(message, isError = true) {
  const toastEl = document.getElementById('liveToast');
  const toastBody = toastEl.querySelector('.toast-body');
  const toast = new bootstrap.Toast(toastEl);
  
  toastBody.textContent = message;
  toastEl.classList.remove('bg-success', 'bg-danger');
  toastEl.classList.add(isError ? 'bg-danger' : 'bg-success');
  
  toast.show();
}

// Initialize camera
function initCamera() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        video.srcObject = stream;
      })
      .catch(error => {
        console.error('Camera error:', error);
        showToast('Could not access camera. Please ensure you have granted permissions.');
        faceError.textContent = 'Could not access camera. Please ensure you have granted permissions.';
        captureBtn.disabled = true;
      });
  } else {
    showToast('Camera API not supported in this browser');
    faceError.textContent = 'Camera API not supported in this browser';
    captureBtn.disabled = true;
  }
}

// Password strength checker
function checkPasswordStrength(password) {
  let strength = 0;
  
  // Length check
  if (password.length >= 8) {
    strength += 25;
    passwordHints.length.classList.replace('invalid', 'valid');
  } else {
    passwordHints.length.classList.replace('valid', 'invalid');
  }
  
  // Uppercase check
  if (/[A-Z]/.test(password)) {
    strength += 25;
    passwordHints.uppercase.classList.replace('invalid', 'valid');
  } else {
    passwordHints.uppercase.classList.replace('valid', 'invalid');
  }
  
  // Number check
  if (/\d/.test(password)) {
    strength += 25;
    passwordHints.number.classList.replace('invalid', 'valid');
  } else {
    passwordHints.number.classList.replace('valid', 'invalid');
  }
  
  // Special char check
  if (/[^A-Za-z0-9]/.test(password)) {
    strength += 25;
    passwordHints.special.classList.replace('invalid', 'valid');
  } else {
    passwordHints.special.classList.replace('valid', 'invalid');
  }
  
  // Update strength bar
  passwordStrength.style.width = `${strength}%`;
  passwordStrength.className = 'password-strength-bar';
  
  if (strength < 50) {
    passwordStrength.classList.add('password-strength-weak');
  } else if (strength < 75) {
    passwordStrength.classList.add('password-strength-medium');
  } else if (strength < 100) {
    passwordStrength.classList.add('password-strength-strong');
  } else {
    passwordStrength.classList.add('password-strength-very-strong');
  }
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
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = canvas.toDataURL('image/jpeg');
  capturedImage.value = imageData;
  photoStatus.style.display = 'block';
  faceError.textContent = '';
  showToast('Photo captured successfully!', false);
}

// Form submission
async function submitForm(e) {
  e.preventDefault();
  
  // Reset error messages
  faceError.textContent = '';
  empIdError.textContent = '';
  emailError.textContent = '';
  signupMessage.style.display = 'none';
  
  // Validate form
  if (!signupForm.checkValidity()) {
    e.stopPropagation();
    signupForm.classList.add('was-validated');
    showToast('Please fill all required fields correctly.');
    return;
  }
  
  // Validate email domain
  const email = document.getElementById('email').value;
  if (!email.endsWith('@innovasolutions.com')) {
    document.getElementById('email').classList.add('is-invalid');
    emailError.textContent = 'Please use your @innovasolutions.com email address';
    showToast('Please use your @innovasolutions.com email address');
    return;
  }
  
  // Validate personal email if provided
  const personalEmail = document.getElementById('personalEmail').value;
  if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
    document.getElementById('personalEmail').classList.add('is-invalid');
    showToast('Please provide a valid personal email address');
    return;
  }
  
  // Validate photo capture
  if (!capturedImage.value) {
    faceError.textContent = 'Please capture your photo before submitting';
    showToast('Please capture your photo before submitting');
    return;
  }
  
  // Validate password match
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  if (password !== confirmPassword) {
    document.getElementById('confirmPassword').classList.add('is-invalid');
    showToast('Passwords do not match');
    return;
  }
  
  // Show loading state
  const submitBtn = document.getElementById('registerButton');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Registering...';
  
  try {
    const formData = {
      fullName: document.getElementById('fullName').value,
      empId: document.getElementById('empId').value,
      email: email,
      personalEmail: personalEmail,
      password: password,
      capturedImage: capturedImage.value
    };
    
    const response = await fetch('/employee_signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });
    
    if (response.ok) {
      showToast('Registration successful! Redirecting to login...', false);
      setTimeout(() => {
        window.location.href = '/employee_login';
      }, 2000);
    } else {
      const result = await response.text();
      if (result.includes('Employee ID already exists')) {
        empIdError.textContent = result;
        document.getElementById('empId').classList.add('is-invalid');
        showToast('Employee ID already exists. Please use a different ID.');
      } else if (result.includes('Email already exists')) {
        document.getElementById('email').classList.add('is-invalid');
        emailError.textContent = result;
        showToast('Email already exists. Please use a different email.');
      } else if (result.includes('face is already registered')) {
        faceError.textContent = result;
        showToast('This face is already registered with another employee ID.');
      } else if (result.includes('No face detected')) {
        faceError.textContent = result;
        showToast('No face detected in the photo. Please try again.');
      } else {
        showToast(result || 'Registration failed. Please try again.');
        signupMessage.textContent = result || 'Registration failed. Please try again.';
        signupMessage.className = 'alert alert-danger mt-3 text-center';
        signupMessage.style.display = 'block';
      }
    }
  } catch (error) {
    showToast('An error occurred during registration. Please try again.');
    signupMessage.textContent = 'An error occurred during registration. Please try again.';
    signupMessage.className = 'alert alert-danger mt-3 text-center';
    signupMessage.style.display = 'block';
    console.error('Registration error:', error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

// Clear validation errors on input
function clearValidation(inputId, errorElement) {
  const input = document.getElementById(inputId);
  input.addEventListener('input', () => {
    input.classList.remove('is-invalid');
    if (errorElement) {
      errorElement.textContent = '';
    }
  });
}

// Initialize the application
function init() {
  initCamera();
  
  // Password strength
  passwordInput.addEventListener('input', function() {
    checkPasswordStrength(this.value);
    
    // Password match validation
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (this.value.length < 8) {
      this.setCustomValidity('Password must be at least 8 characters long');
    } else {
      this.setCustomValidity('');
    }
    if (confirmPassword && this.value !== confirmPassword) {
      document.getElementById('confirmPassword').setCustomValidity('Passwords must match');
    } else {
      document.getElementById('confirmPassword').setCustomValidity('');
    }
  });

  // Password toggles
  setupPasswordToggle('password', 'togglePassword');
  setupPasswordToggle('confirmPassword', 'toggleConfirmPassword');

  // Capture button
  captureBtn.addEventListener('click', capturePhoto);

  // Form submission
  signupForm.addEventListener('submit', submitForm);

  // Clear validation
  clearValidation('empId', empIdError);
  clearValidation('email', emailError);
  
  document.getElementById('confirmPassword').addEventListener('input', function() {
    const password = document.getElementById('password').value;
    if (this.value !== password) {
      this.setCustomValidity('Passwords must match');
    } else {
      this.setCustomValidity('');
    }
  });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);