// ArgusScan Final Project/static/js/admin_leave_management.js

document.addEventListener('DOMContentLoaded', function() {
    // Filter form submission
    document.getElementById('leaveFilterForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const params = new URLSearchParams(formData);
        window.location.href = window.location.pathname + '?' + params.toString();
    });

    // Reset filters
    document.getElementById('resetFilters')?.addEventListener('click', function() {
        window.location.href = window.location.pathname;
    });

    // Sidebar toggle functionality
    document.getElementById('sidebarToggle')?.addEventListener('click', function() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('show');
        document.body.classList.toggle('sidebar-open');
    });

    // Close sidebar when clicking outside
    document.addEventListener('click', function(event) {
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebar?.classList.contains('show') && !sidebar.contains(event.target) && !sidebarToggle?.contains(event.target)) {
            sidebar.classList.remove('show');
            document.body.classList.remove('sidebar-open');
        }
    });

    // Initialize Flatpickr for date inputs
    flatpickr("#startDateFilter", {
        dateFormat: "Y-m-d",
    });
    flatpickr("#endDateFilter", {
        dateFormat: "Y-m-d",
    });

    // Export functionality
    document.getElementById('exportExcel')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportLeaves('xlsx');
    });

    document.getElementById('exportCSV')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportLeaves('csv');
    });

    // --- Leave Request Review Modal Logic ---
    const reviewLeaveModal = new bootstrap.Modal(document.getElementById('reviewLeaveModal'));
    const leaveRequestsTable = document.getElementById('leaveRequestsTable');

    if (leaveRequestsTable) {
        leaveRequestsTable.addEventListener('click', function(event) {
            const approveBtn = event.target.closest('.approve-btn');
            const rejectBtn = event.target.closest('.reject-btn');

            let button = null;
            let actionType = '';

            if (approveBtn) {
                button = approveBtn;
                actionType = 'Approved';
            } else if (rejectBtn) {
                button = rejectBtn;
                actionType = 'Rejected';
            }

            if (button) {
                const requestId = button.dataset.id;
                const row = button.closest('tr');

                // Populate modal with request details
                document.getElementById('modalEmployeeName').textContent = row.cells[0].textContent;
                document.getElementById('modalEmployeeId').textContent = row.cells[1].textContent;
                document.getElementById('modalLeaveType').textContent = row.cells[2].textContent;
                document.getElementById('modalLeavePeriod').textContent = `${row.cells[4].textContent} to ${row.cells[5].textContent}`;
                document.getElementById('modalReason').textContent = row.cells[6].querySelector('span')?.title || row.cells[6].textContent;
                document.getElementById('modalComments').textContent = row.cells[7].querySelector('span')?.title || row.cells[7].textContent === '-' ? 'N/A' : row.cells[7].textContent;
                
                document.getElementById('modalRequestId').value = requestId;
                document.getElementById('modalActionType').value = actionType;
                document.getElementById('adminComment').value = ''; // Clear previous comment

                const confirmReviewBtn = document.getElementById('confirmReviewBtn');
                confirmReviewBtn.classList.remove('btn-success', 'btn-danger'); // Reset classes
                if (actionType === 'Approved') {
                    confirmReviewBtn.classList.add('btn-success');
                    confirmReviewBtn.textContent = 'Approve Request';
                } else {
                    confirmReviewBtn.classList.add('btn-danger');
                    confirmReviewBtn.textContent = 'Reject Request';
                }

                reviewLeaveModal.show();
            }
        });
    }

    document.getElementById('confirmReviewBtn')?.addEventListener('click', async function() {
        const requestId = document.getElementById('modalRequestId').value;
        const actionType = document.getElementById('modalActionType').value;
        const adminComment = document.getElementById('adminComment').value.trim();

        // Disable button and show spinner
        const originalBtnText = this.innerHTML;
        this.disabled = true;
        this.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...';

        try {
            const response = await fetch(`/admin/api/leave_requests/${requestId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: actionType, adminComment: adminComment })
            });

            const result = await response.json();

            if (response.ok) {
                showToast('Success', result.message || `Leave request ${actionType.toLowerCase()} successfully.`, 'success');
                reviewLeaveModal.hide();
                // Refresh the page to reflect the updated status and disable buttons
                setTimeout(() => window.location.reload(), 500); 
            } else {
                showToast('Error', result.message || `Failed to ${actionType.toLowerCase()} leave request.`, 'danger');
            }
        } catch (error) {
            console.error('Error updating leave request:', error);
            showToast('Error', 'An error occurred while processing the request.', 'danger');
        } finally {
            this.disabled = false;
            this.innerHTML = originalBtnText; // Restore original button text
        }
    });

    // Initialize tooltips (if not already done globally)
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

});

function exportLeaves(format) {
    // Get all current filter values
    const employeeFilter = document.getElementById('employeeFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const startDateFilter = document.getElementById('startDateFilter')?.value || '';
    const endDateFilter = document.getElementById('endDateFilter')?.value || '';

    // Construct query parameters
    const params = new URLSearchParams();
    if (employeeFilter) params.append('employee', employeeFilter);
    if (statusFilter) params.append('status', statusFilter);
    if (startDateFilter) params.append('start_date', startDateFilter);
    if (endDateFilter) params.append('end_date', endDateFilter);
    params.append('format', format); // Use format directly

    // Submit the export request
    window.location.href = `/admin/export_leaves?${params.toString()}`;
}

// Unified showToast function for admin pages (copied from admin_emp_manage.js for consistency)
function showToast(title, message, type = 'success') {
    const toastEl = document.getElementById('liveToast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    toastTitle.textContent = title;
    toastMessage.textContent = message;

    const toast = new bootstrap.Toast(toastEl);
    const header = toastEl.querySelector('.toast-header');

    // Reset classes first
    header.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
    toastMessage.classList.remove('text-white', 'text-dark'); // Clear text color from body

    if (type === 'error') {
      header.classList.add('bg-danger', 'text-white');
      toastEl.classList.add('bg-danger');
      toastMessage.classList.add('text-white');
    } else if (type === 'success') {
      header.classList.add('bg-success', 'text-white');
      toastEl.classList.add('bg-success');
      toastMessage.classList.add('text-white');
    } else if (type === 'warning') {
      header.classList.add('bg-warning', 'text-dark');
      toastEl.classList.add('bg-warning');
      toastMessage.classList.add('text-dark');
    } else if (type === 'info') {
      header.classList.add('bg-info', 'text-white');
      toastEl.classList.add('bg-info');
      toastMessage.classList.add('text-white');
    }
    else {
      header.classList.add('bg-primary', 'text-white');
      toastEl.classList.add('bg-primary');
      toastMessage.classList.add('text-white');
    }

    toast.show();
}