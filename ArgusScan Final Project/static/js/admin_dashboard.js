// admin_dashboard.js
document.addEventListener('DOMContentLoaded', function() {
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

  // Initialize tooltips for info icons
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
  });

  // Initialize Flatpickr for date inputs
  flatpickr("#start_date", {
    dateFormat: "Y-m-d",
  });
  flatpickr("#end_date", {
    dateFormat: "Y-m-d",
  });


  // --- DataTables Initialization (Minimal for styling/pagination integration with Flask) ---
  // DataTables is initialized but its client-side filtering, searching, and sorting are disabled.
  // These operations are handled by the Flask backend.
  if (typeof $ !== 'undefined' && $.fn.DataTable) { // Ensure jQuery and DataTables are loaded
    $('#attendanceTable').DataTable({
      "paging": false,       // Disable DataTables client-side pagination (Flask handles this)
      "lengthChange": false, // Disable show entries dropdown
      "searching": false,    // Disable client-side search box
      "ordering": false,     // Disable client-side column ordering
      "info": false,         // Disable showing "Showing X to Y of Z entries" info
      "autoWidth": false,
      "responsive": true,
      "columnDefs": [
        // Ensure no ordering is applied by DataTables, if ordering is managed by Flask
        { "orderable": false, "targets": '_all' }
      ]
      // No custom 'dom' or 'language' needed unless for specific visual elements.
      // Flask's pagination links below the table handle navigation.
    });
  }


  // --- Filter Form Handling ---
  // The filter form now submits naturally to the Flask backend.
  // The 'submit' event listener and 'applyFiltersToDataTable' function are removed from JS,
  // as the form's default action will trigger the server-side filtering.
  // The "Apply Filters" button will submit the form.
  // The "Clear" button is an <a> tag linking to the base URL, which reloads without filters.


  // --- Export functionality (Kept, as it builds URL parameters for Flask export route) ---
  const exportExcelBtn = document.getElementById('exportExcel');
  const exportCSVBtn = document.getElementById('exportCSV');

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', function(e) {
      e.preventDefault(); // Prevent default link behavior
      exportData('xlsx');
    });
  }

  if (exportCSVBtn) {
    exportCSVBtn.addEventListener('click', function(e) {
      e.preventDefault(); // Prevent default link behavior
      exportData('csv');
    });
  }

  function exportData(format) {
    // Get all current filter values from the form
    // The form is handled by Flask for display, so get values from current URL or form inputs
    const startDate = document.getElementById('start_date')?.value || '';
    const endDate = document.getElementById('end_date')?.value || '';
    const empId = document.getElementById('emp_id')?.value || '';
    const status = document.getElementById('status')?.value || '';
    const sort = document.getElementById('sort')?.value || '';

    // Construct query parameters
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (empId) params.append('emp_id', empId);
    if (status) params.append('status', status);
    if (sort) params.append('sort', sort);
    params.append('format', format);

    // Redirect to the Flask export endpoint with filter parameters
    window.location.href = `/admin/export_attendance?${params.toString()}`;
  }

  // Unified showToast function for admin pages
  function showToast(title, message, type = 'success') {
    const toastEl = document.getElementById('liveToast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    // Set title and message
    toastTitle.textContent = title;
    toastMessage.textContent = message;

    // Set color based on type
    const toast = new bootstrap.Toast(toastEl);
    const header = toastEl.querySelector('.toast-header');

    // Reset classes first
    header.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
    toastMessage.classList.remove('text-white', 'text-dark'); // Clear text color from body

    const typeMap = {
      error: ['bg-danger', 'text-white', 'fas fa-times-circle'],
      success: ['bg-success', 'text-white', 'fas fa-check-circle'],
      warning: ['bg-warning', 'text-dark', 'fas fa-exclamation-triangle'],
      info: ['bg-info', 'text-white', 'fas fa-info-circle'],
      default: ['bg-primary', 'text-white', 'fas fa-info-circle']
    };

    const [bgClass, textClass, iconClass] = typeMap[type] || typeMap.default;
    header.classList.add(bgClass, textClass);
    toastEl.classList.add(bgClass);
    toastMessage.classList.add(textClass);

    // Add icon and message to toast body
    toastMessage.innerHTML = `<i class="${iconClass} me-2"></i><span>${message}</span>`;
    toastMessage.classList.add('d-flex', 'align-items-center'); // Ensure flex alignment for icon and text

    toast.show();
  }
});