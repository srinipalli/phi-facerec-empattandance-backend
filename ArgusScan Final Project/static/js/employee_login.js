document.addEventListener('DOMContentLoaded', function() {
    // --- MODAL INSTANCE CREATION ---
    // Create the modal instance once and reuse it. This is the key fix.
    const forgotPasswordModalEl = document.getElementById('forgotPasswordModal');
    const forgotPasswordModal = forgotPasswordModalEl ? new bootstrap.Modal(forgotPasswordModalEl) : null;


    // --- EVENT LISTENERS ---

    // Login form submission
    document.getElementById('employeeLoginForm')?.addEventListener('submit', handleLoginSubmit);

    // Password visibility toggle for the login form
    document.getElementById('togglePassword')?.addEventListener('click', togglePasswordVisibility);

    // "Forgot Password" link handler
    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (forgotPasswordModal) {
            // Pre-fill employee ID if available from login form
            const empIdFromLogin = document.getElementById('empId').value.trim();
            if (empIdFromLogin && forgotPasswordModalEl.querySelector('#forgotEmpId')) {
              forgotPasswordModalEl.querySelector('#forgotEmpId').value = empIdFromLogin;
            }
            forgotPasswordModal.show();
        }
    });

    // Modal cleanup on hide event
    if (forgotPasswordModalEl) {
        forgotPasswordModalEl.addEventListener('hidden.bs.modal', resetForgotPasswordModal);
    }
    
    // Handlers for forms inside the modal
    document.getElementById('forgotPasswordForm')?.addEventListener('submit', handleForgotPasswordStep1);
    document.getElementById('verifyCodeForm')?.addEventListener('submit', handleVerifyCodeStep2);
    document.getElementById('resendCode')?.addEventListener('click', handleResendCode);
    document.getElementById('resetPasswordForm')?.addEventListener('submit', handleResetPasswordStep3);

    // Remember Me feature
    const rememberedEmpId = localStorage.getItem('rememberedEmpId');
    if (rememberedEmpId) {
        document.getElementById('empId').value = rememberedEmpId;
        document.getElementById('rememberMe').checked = true;
    }

});


// --- FUNCTIONS ---

function showToast(type, message) {
    const container = document.querySelector('.toast-container') || document.createElement('div');
    if (!container.classList.contains('toast-container')) {
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
    }

    const toastEl = document.createElement('div');
    const bgClass = { success: 'bg-success', error: 'bg-danger', warning: 'bg-warning' }[type] || 'bg-primary';
    const textClass = type === 'warning' ? 'text-dark' : 'text-white';

    toastEl.className = `toast show align-items-center ${bgClass} border-0`;
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body ${textClass}">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>`;
    
    container.appendChild(toastEl);
    new bootstrap.Toast(toastEl, { delay: 5000 }).show();
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const empIdInput = form.querySelector('#empId');
    const passwordInput = form.querySelector('#password');
    const loginButton = form.querySelector('#loginButton');

    let isValid = true;
    [empIdInput, passwordInput].forEach(input => input.classList.remove('is-invalid'));
    if (!empIdInput.value.trim() || empIdInput.value.trim().length < 3) {
        empIdInput.classList.add('is-invalid');
        isValid = false;
    }
    if (!passwordInput.value.trim()) {
        passwordInput.classList.add('is-invalid');
        isValid = false;
    }
    if (!isValid) return;

    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Logging in...';

    try {
        const response = await fetch('/employee_login_auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId: empIdInput.value.trim(), password: passwordInput.value })
        });
        const result = await response.json();
        if (response.ok) {
            if (form.querySelector('#rememberMe').checked) {
                localStorage.setItem('rememberedEmpId', empIdInput.value.trim());
            } else {
                localStorage.removeItem('rememberedEmpId');
            }
            showToast('success', result.message || 'Login successful!');
            setTimeout(() => window.location.href = '/employee', 500);
        } else {
            showToast('error', result.message || 'Login failed.');
        }
    } catch (error) {
        showToast('error', 'Login failed due to a network error.');
    } finally {
        loginButton.disabled = false;
        loginButton.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Login';
    }
}

function togglePasswordVisibility(event) {
    // This function can be used for any password input with a sibling .toggle-password button
    const button = event.currentTarget;
    const input = button.previousElementSibling; // The input field is the previous sibling
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill');
    } else {
        input.type = 'password';
        icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill');
    }
}

function resetForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    if (!modal) return;

    // Reset steps display
    modal.querySelector('#step1').style.display = 'block';
    modal.querySelector('#step2').style.display = 'none';
    modal.querySelector('#step3').style.display = 'none';

    // Reset all forms and validation classes
    modal.querySelectorAll('form').forEach(form => form.reset());
    modal.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

    // Reset buttons
    modal.querySelectorAll('button[type="submit"]').forEach(button => {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || button.textContent;
    });
    const resendLink = modal.querySelector('#resendCode');
    if (resendLink) {
        resendLink.innerHTML = 'Resend Code';
        resendLink.style.pointerEvents = 'auto';
    }
}

async function handleForgotPasswordStep1(e) {
    e.preventDefault();
    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.dataset.originalText = submitButton.innerHTML;
    const empId = this.querySelector('#forgotEmpId').value.trim();
    const personalEmail = this.querySelector('#personalEmail').value.trim();

    if (!empId || empId.length < 3 || !personalEmail || !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(personalEmail)) {
        showToast('error', 'Please enter a valid Employee ID and Personal Email.');
        return;
    }
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';
    
    try {
        const response = await fetch('/forgot_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId, personalEmail })
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            showToast('success', result.message);
        } else {
            showToast('error', result.message);
        }
    } catch (err) {
        showToast('error', 'A network error occurred.');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = submitButton.dataset.originalText;
    }
}

async function handleVerifyCodeStep2(e) {
    e.preventDefault();
    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.dataset.originalText = submitButton.innerHTML;
    const empId = document.getElementById('forgotEmpId').value.trim();
    const code = this.querySelector('#verificationCode').value.trim();

    if (!code) {
        showToast('error', 'Please enter the verification code.');
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Verifying...';

    try {
        const response = await fetch('/verify_reset_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId, code })
        });
        const result = await response.json();
        if (response.ok) {
            document.getElementById('step2').style.display = 'none';
            document.getElementById('step3').style.display = 'block';
            // Initialize password visibility toggles for the new password fields
            document.querySelectorAll('#step3 .toggle-password').forEach(button => {
                button.addEventListener('click', togglePasswordVisibility);
            });
            showToast('success', result.message);
        } else {
            showToast('error', result.message);
        }
    } catch (err) {
        showToast('error', 'A network error occurred.');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = submitButton.dataset.originalText;
    }
}

async function handleResendCode(e) {
    e.preventDefault();
    this.dataset.originalText = this.innerHTML;
    const empId = document.getElementById('forgotEmpId').value.trim();
    const personalEmail = document.getElementById('personalEmail').value.trim();

    if (!empId || !personalEmail) {
        showToast('error', 'Data missing to resend code.');
        return;
    }

    this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sending...';
    this.style.pointerEvents = 'none';
    
    try {
        const response = await fetch('/forgot_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId, personalEmail })
        });
        const result = await response.json();
        showToast(response.ok ? 'success' : 'error', result.message);
    } catch (err) {
        showToast('error', 'A network error occurred.');
    } finally {
        this.innerHTML = this.dataset.originalText;
        this.style.pointerEvents = 'auto';
    }
}

async function handleResetPasswordStep3(e) {
    e.preventDefault();
    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.dataset.originalText = submitButton.innerHTML;
    const empId = document.getElementById('forgotEmpId').value.trim();
    const newPassword = this.querySelector('#newPassword').value;
    const confirmPassword = this.querySelector('#confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showToast('error', 'New passwords do not match.');
        return;
    }
    // Basic password complexity check (you might have a more robust one in your signup JS)
    if (!/^(?=.*\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
        showToast('warning', 'Password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character.');
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Resetting...';

    try {
        const response = await fetch('/reset_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId, newPassword })
        });
        const result = await response.json();
        if (response.ok) {
            showToast('success', result.message);
            // The 'hidden.bs.modal' event will handle the rest of the cleanup
            bootstrap.Modal.getInstance(document.getElementById('forgotPasswordModal')).hide();
        } else {
            showToast('error', result.message);
        }
    } catch (err) {
        showToast('error', 'A network error occurred.');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = submitButton.dataset.originalText;
    }
}