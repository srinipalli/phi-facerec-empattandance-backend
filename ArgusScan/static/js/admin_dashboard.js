document.addEventListener('DOMContentLoaded', function() {
  let map = null;
  let marker = null;

  // Initialize map when modal is shown
  document.getElementById('locationModal').addEventListener('show.bs.modal', function(event) {
    const button = event.relatedTarget;
    const lat = parseFloat(button.dataset.lat);
    const lng = parseFloat(button.dataset.lng);
    const locationType = button.dataset.locationType;
    const address = button.textContent.trim().replace(/ \u{1F4CD}.*/, '');

    document.getElementById('locationType').textContent = locationType;
    document.getElementById('modalAddress').textContent = address;
    document.getElementById('modalCoords').textContent = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;

    if (map === null) {
      map = L.map('map').setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
    } else {
      map.setView([lat, lng], 15);
    }

    // Update marker
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng]).addTo(map);
    }
  });

  // Invalidate map size when modal is fully shown
  document.getElementById('locationModal').addEventListener('shown.bs.modal', function() {
    if (map) {
      map.invalidateSize();
    }
  });

  // Sidebar toggle functionality
  document.getElementById('sidebarToggle').addEventListener('click', function() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
    document.body.classList.toggle('sidebar-open');
  });

  // Close sidebar when clicking outside
  document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebar.classList.contains('show') && !sidebar.contains(event.target) && !sidebarToggle.contains(event.target)) {
      sidebar.classList.remove('show');
      document.body.classList.remove('sidebar-open');
    }
  });

  // Export functionality - updated with proper event listeners
  document.getElementById('exportExcel')?.addEventListener('click', function(e) {
    e.preventDefault();
    exportData('xlsx');
  });

  document.getElementById('exportCSV')?.addEventListener('click', function(e) {
    e.preventDefault();
    exportData('csv');
  });

  // admin_dashboard.js - Update the exportData function
function exportData(format) {
    // Get all current filter values
    const startDate = document.getElementById('start_date').value;
    const endDate = document.getElementById('end_date').value;
    const empId = document.getElementById('emp_id').value;
    const status = document.getElementById('status').value;
    const sort = document.getElementById('sort').value;

    // Construct query parameters
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (empId) params.append('emp_id', empId);
    if (status) params.append('status', status);
    if (sort) params.append('sort', sort);
    params.append('format', format === 'xlsx' ? 'excel' : format); // Fix format parameter

    // Submit the export request
    window.location.href = `/admin/export_attendance?${params.toString()}`;
}
});