// Show toast notification
function showToast(type, message) {
  const toastContainer = document.querySelector('.toast-container');
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type} show`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');
  
  toastEl.innerHTML = `
    <div class="toast-header">
      <strong class="me-auto">${type === 'success' ? 'Success' : 'Error'}</strong>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">${message}</div>
  `;
  
  toastContainer.appendChild(toastEl);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    toastEl.remove();
  }, 5000);
}

class AdminAuth {
  constructor() {
    this.initElements();
    this.initEvents();
    this.initPasswordVisibilityToggle();
  }

  initElements() {
    this.form = document.getElementById('adminLoginForm');
    this.adminIdInput = document.getElementById('adminid');
    this.passwordInput = document.getElementById('adminpass');
    this.submitButton = this.form.querySelector('button[type="submit"]');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.togglePasswordBtn = document.getElementById('togglePassword');
  }

  initEvents() {
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
    this.togglePasswordBtn.addEventListener('click', this.togglePasswordVisibility.bind(this));
    
    // Input validation on blur
    this.adminIdInput.addEventListener('blur', this.validateAdminId.bind(this));
    this.passwordInput.addEventListener('blur', this.validatePassword.bind(this));
  }

  togglePasswordVisibility() {
    const icon = this.togglePasswordBtn.querySelector('i');
    if (this.passwordInput.type === 'password') {
      this.passwordInput.type = 'text';
      icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill');
    } else {
      this.passwordInput.type = 'password';
      icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill');
    }
  }

  validateAdminId() {
    const value = this.adminIdInput.value.trim();
    const isValid = value.length >= 3;
    this.adminIdInput.classList.toggle('is-invalid', !isValid);
    return isValid;
  }

  validatePassword() {
    const value = this.passwordInput.value.trim();
    const isValid = value.length >= 6;
    this.passwordInput.classList.toggle('is-invalid', !isValid);
    return isValid;
  }

 async handleSubmit(e) {
    e.preventDefault();
    
    // Validate form
    if (!this.validateAdminId() || !this.validatePassword()) {
        this.shakeForm();
        showToast('error', 'Please fill in all fields correctly');
        return;
    }
    
    this.showLoading();
    
    try {
        // Submit the form normally (not via fetch)
        this.form.submit();
    } catch (error) {
        showToast('error', 'An error occurred during login');
        this.hideLoading();
        console.error('Error:', error);
    }
}

  showLoading() {
    this.loadingOverlay.style.display = 'flex';
    this.submitButton.disabled = true;
    this.submitButton.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      Authenticating...
    `;
  }

  hideLoading() {
    this.loadingOverlay.style.display = 'none';
    this.submitButton.disabled = false;
    this.submitButton.innerHTML = `
      <i class="bi bi-box-arrow-in-right me-2"></i>Login
    `;
  }

  shakeForm() {
    const form = this.form;
    form.classList.remove('animate__animated', 'animate__shakeX');
    // Trigger reflow to restart animation
    void form.offsetWidth;
    form.classList.add('animate__animated', 'animate__shakeX');
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('adminLoginForm')) {
    new AdminAuth();
  }
  
  // Add service worker if supported
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(err => {
          console.log('ServiceWorker registration failed: ', err);
        });
    });
  }
});