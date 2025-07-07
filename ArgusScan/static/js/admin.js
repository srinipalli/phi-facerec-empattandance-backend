class AdminAuth {
  constructor() {
    this.initElements();
    this.initEvents();
    this.checkRememberedCredentials();
    this.initPasswordVisibilityToggle();
  }

  initElements() {
    this.form = document.getElementById('adminLoginForm');
    this.adminIdInput = document.getElementById('adminid');
    this.passwordInput = document.getElementById('adminpass');
    this.rememberMeCheckbox = document.getElementById('rememberMe');
    this.submitButton = this.form.querySelector('button[type="submit"]');
    this.loadingOverlay = document.getElementById('loadingOverlay');
  }

  initEvents() {
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
    
    // Input validation on blur for better UX
    this.adminIdInput.addEventListener('blur', this.validateAdminId.bind(this));
    this.passwordInput.addEventListener('blur', this.validatePassword.bind(this));
  }

  initPasswordVisibilityToggle() {
    const passwordToggle = document.createElement('span');
    passwordToggle.className = 'password-toggle';
    passwordToggle.innerHTML = '<i class="bi bi-eye-fill"></i>';
    passwordToggle.style.position = 'absolute';
    passwordToggle.style.right = '10px';
    passwordToggle.style.top = '50%';
    passwordToggle.style.transform = 'translateY(-50%)';
    passwordToggle.style.cursor = 'pointer';
    passwordToggle.style.zIndex = '5';
    
    const passwordGroup = this.passwordInput.parentElement;
    passwordGroup.style.position = 'relative';
    passwordGroup.appendChild(passwordToggle);
    
    passwordToggle.addEventListener('click', () => {
      if (this.passwordInput.type === 'password') {
        this.passwordInput.type = 'text';
        passwordToggle.innerHTML = '<i class="bi bi-eye-slash-fill"></i>';
      } else {
        this.passwordInput.type = 'password';
        passwordToggle.innerHTML = '<i class="bi bi-eye-fill"></i>';
      }
    });
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

  checkRememberedCredentials() {
    const rememberedId = localStorage.getItem('rememberedAdminId');
    if (rememberedId) {
      this.adminIdInput.value = rememberedId;
      this.rememberMeCheckbox.checked = true;
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    // Validate form
    if (!this.validateAdminId() || !this.validatePassword()) {
      this.shakeForm();
      return;
    }
    
    this.showLoading();
    
    // Save credentials if "Remember me" is checked
    if (this.rememberMeCheckbox.checked) {
      localStorage.setItem('rememberedAdminId', this.adminIdInput.value.trim());
    } else {
      localStorage.removeItem('rememberedAdminId');
    }
    
    // Submit the form
    this.form.submit();
  }

  showLoading() {
    this.loadingOverlay.style.display = 'flex';
    this.submitButton.disabled = true;
    this.submitButton.innerHTML = `
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      Authenticating...
    `;
  }

  shakeForm() {
    gsap.to(this.form, {
      duration: 0.5,
      x: [-5, 5, -5, 5, 0],
      ease: 'power1.out'
    });
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