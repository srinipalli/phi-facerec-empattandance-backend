// ArgusScan Final Project/static/js/leave_request_and_history.js

document.addEventListener('DOMContentLoaded', function() {
    const leaveRequestForm = document.getElementById('leaveRequestForm');
    const submitLeaveBtn = document.getElementById('submitLeaveBtn');

    // Modals
    const editLeaveModal = new bootstrap.Modal(document.getElementById('editLeaveModal'));
    const deleteLeaveModal = new bootstrap.Modal(document.getElementById('deleteLeaveModal'));
    const leaveHistoryTableBody = document.querySelector('#leaveHistoryTable tbody');


    // Initialize Flatpickr for date inputs (for new request form)
    flatpickr("#startDate", {
        dateFormat: "Y-m-d",
        minDate: "today" // Prevents selecting past dates
    });
    flatpickr("#endDate", {
        dateFormat: "Y-m-d",
        minDate: "today" // Prevents selecting past dates
    });

    // Initialize Flatpickr for date inputs (for edit modal)
    flatpickr("#editStartDate", {
        dateFormat: "Y-m-d",
    });
    flatpickr("#editEndDate", {
        dateFormat: "Y-m-d",
    });

    // Sidebar toggle functionality
    initSidebarToggle();

    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Handle New Leave Request Submission
    if (leaveRequestForm) {
        leaveRequestForm.addEventListener('submit', async function(event) {
            event.preventDefault(); // Prevent default form submission

            // Reset validation feedback
            leaveRequestForm.classList.remove('was-validated');
            Array.from(leaveRequestForm.elements).forEach(element => {
                element.classList.remove('is-invalid');
                element.classList.remove('is-valid');
            });

            const leaveType = document.getElementById('leaveType').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const reason = document.getElementById('reason').value;
            const comments = document.getElementById('comments').value;

            let isValid = true;

            // Client-side validation
            if (!leaveType) {
                document.getElementById('leaveType').classList.add('is-invalid');
                isValid = false;
            } else {
                document.getElementById('leaveType').classList.add('is-valid');
            }

            if (!startDate) {
                document.getElementById('startDate').classList.add('is-invalid');
                isValid = false;
            } else {
                document.getElementById('startDate').classList.add('is-valid');
            }

            if (!endDate) {
                document.getElementById('endDate').classList.add('is-invalid');
                isValid = false;
            } else {
                document.getElementById('endDate').classList.add('is-valid');
            }

            if (!reason.trim()) {
                document.getElementById('reason').classList.add('is-invalid');
                isValid = false;
            } else {
                document.getElementById('reason').classList.add('is-valid');
            }

            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                if (start > end) {
                    document.getElementById('startDate').classList.add('is-invalid');
                    document.getElementById('endDate').classList.add('is-invalid');
                    showToast('Start date cannot be after end date.', 'danger');
                    isValid = false;
                }
            }

            if (!isValid) {
                leaveRequestForm.classList.add('was-validated');
                showToast('Please fill in all required fields and correct any errors.', 'danger');
                return;
            }

            submitLeaveBtn.disabled = true;
            submitLeaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Submitting...';

            try {
                const response = await fetch('/employee/request_leave', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        leaveType: leaveType,
                        startDate: startDate,
                        endDate: endDate,
                        reason: reason.trim(),
                        comments: comments.trim()
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    showToast(result.message || 'Leave request submitted successfully!', 'success');
                    leaveRequestForm.reset(); // Clear the form
                    // Remove validation classes after successful submission
                    Array.from(leaveRequestForm.elements).forEach(element => {
                        element.classList.remove('is-invalid');
                        element.classList.remove('is-valid');
                    });
                    leaveRequestForm.classList.remove('was-validated');
                    
                    // Reload the page to reflect the updated history
                    setTimeout(() => window.location.reload(), 500); 
                } else {
                    showToast(result.message || 'Failed to submit leave request.', 'danger');
                }
            } catch (error) {
                console.error('Error submitting leave request:', error);
                showToast('An error occurred. Please try again.', 'danger');
            } finally {
                submitLeaveBtn.disabled = false;
                submitLeaveBtn.innerHTML = '<i class="bi bi-send me-1"></i> Submit Request';
            }
        });
    }

    // Event listener for Edit button clicks
    leaveHistoryTableBody?.addEventListener('click', async function(event) {
        const editBtn = event.target.closest('.edit-leave-btn');
        if (editBtn) {
            const requestId = editBtn.dataset.id;
            try {
                const response = await fetch(`/employee/api/leave_requests/${requestId}`);
                const data = await response.json();

                if (response.ok) {
                    // Populate the edit modal
                    document.getElementById('editRequestId').value = data.id;
                    document.getElementById('editLeaveType').value = data.leave_type;
                    document.getElementById('editStartDate').value = data.start_date_formatted; // Assuming backend sends formatted date
                    document.getElementById('editEndDate').value = data.end_date_formatted; // Assuming backend sends formatted date
                    document.getElementById('editReason').value = data.reason;
                    document.getElementById('editComments').value = data.comments;

                    editLeaveModal.show();
                } else {
                    showToast(data.message || 'Failed to fetch leave request details.', 'danger');
                }
            } catch (error) {
                console.error('Error fetching leave request for edit:', error);
                showToast('An error occurred while fetching leave request details.', 'danger');
            }
        }
    });

    // Event listener for Save Changes in Edit Modal
    document.getElementById('saveLeaveChanges')?.addEventListener('click', async function() {
        const requestId = document.getElementById('editRequestId').value;
        const leaveType = document.getElementById('editLeaveType').value;
        const startDate = document.getElementById('editStartDate').value;
        const endDate = document.getElementById('editEndDate').value;
        const reason = document.getElementById('editReason').value;
        const comments = document.getElementById('editComments').value;

        // Basic client-side validation
        if (!leaveType || !startDate || !endDate || !reason.trim()) {
            showToast('Please fill all required fields.', 'danger');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            showToast('Start date cannot be after end date.', 'danger');
            return;
        }

        const saveBtn = this;
        const originalBtnText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...';

        try {
            const response = await fetch(`/employee/api/leave_requests/${requestId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    leaveType: leaveType,
                    startDate: startDate,
                    endDate: endDate,
                    reason: reason.trim(),
                    comments: comments.trim()
                })
            });

            const result = await response.json();

            if (response.ok) {
                showToast(result.message || 'Leave request updated successfully!', 'success');
                editLeaveModal.hide();
                // Reload the page to reflect changes
                setTimeout(() => window.location.reload(), 500);
            } else {
                showToast(result.message || 'Failed to update leave request.', 'danger');
            }
        } catch (error) {
            console.error('Error updating leave request:', error);
            showToast('An error occurred while updating the leave request.', 'danger');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnText;
        }
    });

    // Event listener for Delete button clicks
    leaveHistoryTableBody?.addEventListener('click', function(event) {
        const deleteBtn = event.target.closest('.delete-leave-btn');
        if (deleteBtn) {
            const requestId = deleteBtn.dataset.id;
            document.getElementById('deleteLeaveRequestId').value = requestId;
            document.getElementById('leaveRequestToDeleteId').textContent = requestId; // Display ID in modal
            deleteLeaveModal.show();
        }
    });

    // Event listener for Confirm Delete in Delete Modal
    document.getElementById('confirmDeleteLeave')?.addEventListener('click', async function() {
        const requestId = document.getElementById('deleteLeaveRequestId').value;

        const confirmBtn = this;
        const originalBtnText = confirmBtn.innerHTML;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Deleting...';

        try {
            const response = await fetch(`/employee/api/leave_requests/${requestId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const result = await response.json();

            if (response.ok) {
                showToast(result.message || 'Leave request deleted successfully!', 'success');
                deleteLeaveModal.hide();
                // Reload the page to reflect changes
                setTimeout(() => window.location.reload(), 500);
            } else {
                showToast(result.message || 'Failed to delete leave request.', 'danger');
            }
        } catch (error) {
            console.error('Error deleting leave request:', error);
            showToast('An error occurred while deleting the leave request.', 'danger');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalBtnText;
        }
    });


    // Sidebar toggle functionality (copied from employee.js and attendance.js)
    function initSidebarToggle() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', function() {
                sidebar.classList.toggle('show');
                document.body.toggle('sidebar-open');
            });

            document.addEventListener('click', function(event) {
                // Ensure the click is outside the sidebar and the toggle button
                if (sidebar.classList.contains('show') && !sidebar.contains(event.target) && (!sidebarToggle || !sidebarToggle.contains(event.target))) {
                    sidebar.classList.remove('show');
                    document.body.classList.remove('sidebar-open');
                }
            });
        }
    }

    // Unified showToast function for employee pages (copied for consistency)
    function showToast(message, type = 'success') {
        if (typeof bootstrap === 'undefined' || !bootstrap.Toast) {
            console.error('Bootstrap Toast not available');
            alert(message); // Fallback to alert if Bootstrap is not loaded
            return;
        }

        const toastContainer = document.getElementById('toastContainer') || createToastContainer();
        const toastId = 'toast-' + Date.now();

        let iconClass = '';
        if (type === 'success') {
            iconClass = 'bi bi-check-circle-fill';
        } else if (type === 'danger') {
            iconClass = 'bi bi-x-circle-fill';
        } else if (type === 'warning') {
            iconClass = 'bi bi-exclamation-triangle-fill';
        } else if (type === 'info') {
            iconClass = 'bi bi-info-circle-fill';
        }

        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body d-flex align-items-center">
                        <i class="${iconClass} me-2"></i>
                        <span>${message}</span>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        const toastElement = document.getElementById(toastId);
        const toastBody = toastElement.querySelector('.toast-body');

        // Adjust text color based on toast type
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
});