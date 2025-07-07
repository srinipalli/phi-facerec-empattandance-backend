// admin_regularization.js
document.addEventListener('DOMContentLoaded', function() {
    // Filter form submission
    document.getElementById('regularizationFilterForm')?.addEventListener('submit', function(e) {
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

    // Export functionality
    document.querySelectorAll('[data-format]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const format = this.getAttribute('data-format');
            exportRegularization(format);
        });
    });
});

function exportRegularization(format) {
    // Get all current filter values
    const employeeFilter = document.getElementById('employeeFilter')?.value || '';
    const startDateFilter = document.getElementById('startDateFilter')?.value || '';
    const endDateFilter = document.getElementById('endDateFilter')?.value || '';
    
    // Construct query parameters
    const params = new URLSearchParams();
    if (employeeFilter) params.append('employee', employeeFilter);
    if (startDateFilter) params.append('start_date', startDateFilter);
    if (endDateFilter) params.append('end_date', endDateFilter);
    params.append('format', format);

    // Submit the export request
    window.location.href = `/admin/export_regularization?${params.toString()}`;
}