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

// Form validation and submission
document.getElementById('employeeLoginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const empId = document.getElementById('empId');
  const password = document.getElementById('password');
  let isValid = true;
  
  // Reset validation
  empId.classList.remove('is-invalid');
  password.classList.remove('is-invalid');
  
  // Validate fields
  if (!empId.value.trim()) {
    empId.classList.add('is-invalid');
    isValid = false;
  }
  
  if (!password.value.trim()) {
    password.classList.add('is-invalid');
    isValid = false;
  }
  
  if (!isValid) return;
  
  const loginButton = document.getElementById('loginButton');
  loginButton.disabled = true;
  loginButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Logging in...';
  
  try {
    const response = await fetch('/employee_login_auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId.value.trim(),
        password: password.value
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Handle "Remember me" functionality
      if (document.getElementById('rememberMe').checked) {
        localStorage.setItem('rememberedEmpId', empId.value.trim());
      } else {
        localStorage.removeItem('rememberedEmpId');
      }
      
      window.location.href = '/employee'; // Redirect to employee dashboard
    } else {
      showToast('error', result.message || 'Login failed. Please try again.');
    }
  } catch (error) {
    showToast('error', 'Login failed. Please try again.');
    console.error('Error:', error);
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Login';
  }
});

// Password toggle functionality
document.getElementById('togglePassword').addEventListener('click', function() {
  const passwordInput = document.getElementById('password');
  const icon = this.querySelector('i');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill');
  } else {
    passwordInput.type = 'password';
    icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill');
  }
});

// Forgot password link click handler
document.getElementById('forgotPasswordLink').addEventListener('click', function(e) {
  e.preventDefault();
  const modal = new bootstrap.Modal(document.getElementById('forgotPasswordModal'));
  modal.show();
  
  // Reset modal state when shown
  document.getElementById('step1').style.display = 'block';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step3').style.display = 'none';
  document.getElementById('forgotPasswordForm').reset();
  document.getElementById('verifyCodeForm').reset();
  document.getElementById('resetPasswordForm').reset();
  
  // Pre-fill employee ID if available
  const empId = document.getElementById('empId').value;
  if (empId) {
    document.getElementById('forgotEmpId').value = empId;
  }
});

// Forgot password form submission
document.getElementById('forgotPasswordForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const empId = document.getElementById('forgotEmpId').value.trim();
  const personalEmail = document.getElementById('personalEmail').value.trim();
  
  if (!empId || !personalEmail) {
    showToast('error', 'Please fill in all fields');
    return;
  }
  
  try {
    const response = await fetch('/forgot_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        personalEmail: personalEmail
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Move to step 2 (verification code)
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
      showToast('success', 'Verification code sent to your email');
    } else {
      showToast('error', result.message || 'Failed to initiate password reset');
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  }
});

// Verification code submission
document.getElementById('verifyCodeForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const empId = document.getElementById('forgotEmpId').value.trim();
  const code = document.getElementById('verificationCode').value.trim();
  
  if (!code) {
    showToast('error', 'Please enter the verification code');
    return;
  }
  
  try {
    const response = await fetch('/verify_reset_code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        code: code
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Move to step 3 (new password)
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step3').style.display = 'block';
    } else {
      showToast('error', result.message || 'Invalid verification code');
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  }
});

// Resend code handler
document.getElementById('resendCode').addEventListener('click', async function(e) {
  e.preventDefault();
  
  const empId = document.getElementById('forgotEmpId').value.trim();
  const personalEmail = document.getElementById('personalEmail').value.trim();
  
  try {
    const response = await fetch('/forgot_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        personalEmail: personalEmail
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('success', 'New verification code sent');
    } else {
      showToast('error', result.message || 'Failed to resend code');
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  }
});

// Password reset handler
document.getElementById('resetPasswordForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const empId = document.getElementById('forgotEmpId').value.trim();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (!newPassword || !confirmPassword) {
    showToast('error', 'Please fill in all fields');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showToast('error', 'Passwords do not match');
    return;
  }
  
  try {
    const response = await fetch('/reset_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        newPassword: newPassword
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('success', 'Password reset successfully');
      // Close the modal after 2 seconds
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('forgotPasswordModal'));
        modal.hide();
        // Reset the modal state
        document.getElementById('step1').style.display = 'block';
        document.getElementById('step2').style.display = 'none';
        document.getElementById('step3').style.display = 'none';
        document.getElementById('forgotPasswordForm').reset();
        document.getElementById('verifyCodeForm').reset();
        document.getElementById('resetPasswordForm').reset();
      }, 2000);
    } else {
      showToast('error', result.message || 'Failed to reset password');
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  }
});

// Check for remembered employee ID
document.addEventListener('DOMContentLoaded', function() {
  const rememberedEmpId = localStorage.getItem('rememberedEmpId');
  if (rememberedEmpId) {
    document.getElementById('empId').value = rememberedEmpId;
    document.getElementById('rememberMe').checked = true;
  }
});