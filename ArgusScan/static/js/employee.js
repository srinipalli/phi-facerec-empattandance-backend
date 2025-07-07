document.addEventListener('DOMContentLoaded', function() {
    try {
        initRefreshButton();
        initAttendanceTracking();
        initPasswordChange();
        initPasswordVisibilityToggle();
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Failed to initialize page features', 'danger');
    }
});

function initPasswordVisibilityToggle() {
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('bi-eye');
                icon.classList.add('bi-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('bi-eye-slash');
                icon.classList.add('bi-eye');
            }
        });
    });
}

function initRefreshButton() {
    const refreshBtn = document.getElementById('refreshActivity');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', function() {
        window.location.reload();
    });
}

function initAttendanceTracking() {
    // Attendance tracking functionality remains the same
}

function initPasswordChange() {
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (!changePasswordForm) return;

    changePasswordForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            showToast('New password and confirm password do not match', 'warning');
            return;
        }

        if (newPassword.length < 8) {
            showToast('Password must be at least 8 characters', 'warning');
            return;
        }

        try {
            showLoadingSpinner();
            const response = await fetch('/update_password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                    confirm_password: confirmPassword
                })
            });

            const result = await response.json();
            hideLoadingSpinner();

            if (result.success) {
                showToast('Password changed successfully', 'success');
                changePasswordForm.reset();
                
                const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
                if (modal) modal.hide();
            } else {
                showToast(result.message || 'Failed to change password', 'danger');
            }
        } catch (error) {
            hideLoadingSpinner();
            console.error('Password change error:', error);
            showToast('Error changing password. Please try again.', 'danger');
        }
    });
}

function showLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'flex';
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'none';
}

function showToast(message, type = 'success') {
    if (typeof bootstrap === 'undefined' || !bootstrap.Toast) {
        console.error('Bootstrap Toast not available');
        alert(message);
        return;
    }

    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastId);
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