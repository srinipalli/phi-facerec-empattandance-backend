function showToast(title, message, type = 'success') {
  const toastEl = document.getElementById('liveToast');
  const toastTitle = document.getElementById('toastTitle');
  const toastMessage = document.getElementById('toastMessage');

  // Set title and message
  toastTitle.textContent = title;

  // Set color based on type
  const toast = new bootstrap.Toast(toastEl);
  const header = toastEl.querySelector('.toast-header');

  // Reset classes first
  header.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
  toastEl.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
  toastMessage.classList.remove('text-white', 'text-dark'); // Clear text color from body

  const typeMap = {
    error: ['bg-danger', 'text-white', 'bi-x-circle-fill'],
    success: ['bg-success', 'text-white', 'bi-check-circle-fill'],
    warning: ['bg-warning', 'text-dark', 'bi-exclamation-triangle-fill'],
    info: ['bg-info', 'text-white', 'bi-info-circle-fill'],
    default: ['bg-primary', 'text-white', 'bi-info-circle-fill']
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


let allEmployees = []; // To store all employees fetched from the server

document.addEventListener('DOMContentLoaded', function() {
  // Initialize tooltips
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl)
  });

  // Initialize Flatpickr for date inputs in email report modal
  flatpickr("#reportStartDate", {
      dateFormat: "Y-m-d",
  });
  flatpickr("#reportEndDate", {
      dateFormat: "Y-m-d",
  });


  // Sidebar toggle functionality
  document.getElementById('sidebarToggle')?.addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('show');
    document.body.classList.toggle('sidebar-open');
  });

  // Fetch and display employees on page load
  fetchEmployees();

  // MODIFIED: Bulk Import with server-side processing
  document.getElementById('bulkImportForm')?.addEventListener('submit', async function(e) {
      e.preventDefault();

      const form = e.target;
      const dataFileInput = document.getElementById('importFile');
      const imageFilesInput = document.getElementById('importImages');

      const progressBar = document.querySelector('#import-progress .progress-bar');
      const importStatus = document.getElementById('import-status');
      const startImportBtn = document.getElementById('startImport');

      document.getElementById('import-progress').style.display = 'block';
      progressBar.style.width = '0%';
      progressBar.textContent = '0%';
      importStatus.textContent = ''; // Clear previous status

      startImportBtn.disabled = true;
      startImportBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

      let localFilesProvided = dataFileInput.files.length > 0 || imageFilesInput.files.length > 0;
      let overallSuccess = true;
      let overallMessages = [];

      // Extracted shared folder processing into a separate function
      const processSharedFolderImport = async () => {
          importStatus.textContent = 'Processing shared folder...';
          if (!localFilesProvided) { // If only processing shared folder, start from 0%
             progressBar.style.width = '0%';
             progressBar.textContent = '0%';
          }
          // Give a slight visual pause if local files were just processed
          if (localFilesProvided && overallSuccess) {
              await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          try {
              const sharedFolderResponse = await fetch('/admin/trigger_loader_job', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
              });

              const sharedFolderResult = await sharedFolderResponse.json();

              if (sharedFolderResponse.ok) {
                  progressBar.style.width = '100%';
                  progressBar.textContent = '100%';
                  overallMessages.push(`Shared folder: Successful: ${sharedFolderResult.successful}, Failed: ${sharedFolderResult.failed}.`);
                  if (sharedFolderResult.errors && sharedFolderResult.errors.length > 0) {
                      overallMessages.push(`Shared Folder Errors: ${sharedFolderResult.errors.join(', ')}`);
                  }
                  showToast('Shared Folder Processed', overallMessages.join(' '), 'success');
              } else {
                  overallSuccess = false; // Mark overall as failed if shared folder processing fails
                  overallMessages.push(`Shared folder: Failed to process: ${sharedFolderResult.error || 'Unknown error.'}`);
                  showToast('Shared Folder Error', overallMessages.join(' '), 'error');
              }
          } catch (error) {
              overallSuccess = false;
              overallMessages.push(`Shared folder: An error occurred: ${error.message}`);
              showToast('Shared Folder Error', overallMessages.join(' '), 'error');
              console.error('Shared folder import error:', error);
          }
      };


      // --- Process Local Files if provided ---
      if (localFilesProvided) {
          if (!dataFileInput.files.length) {
              showToast('Error', 'Please select a data file (Excel or CSV) for local import.', 'error');
              overallSuccess = false; // Indicate failure for local part
          }
          if (overallSuccess && !imageFilesInput.files.length) {
              showToast('Error', 'Please select the corresponding employee photos for local import.', 'error');
              overallSuccess = false; // Indicate failure for local part
          }

          if (overallSuccess) { // Only proceed if validation passed
              importStatus.textContent = 'Uploading and processing local files...';
              const formData = new FormData(form);

              try {
                  const response = await fetch('/admin/bulk_upload_process', {
                      method: 'POST',
                      body: formData,
                  });

                  const result = await response.json();

                  if (response.ok) {
                      progressBar.style.width = '50%';
                      progressBar.textContent = '50%';
                      overallMessages.push(`Local files: Successful: ${result.successful}, Failed: ${result.failed}.`);
                      if(result.errors && result.errors.length > 0) {
                          overallMessages.push(`Local Errors: ${result.errors.join('; ')}`);
                      }
                      showToast('Local Import Success', 'Local files processed. Proceeding to shared folder...', 'success');
                      await processSharedFolderImport(); // Only call shared folder import if local was successful
                  } else {
                      overallSuccess = false; // Mark overall as failed if local upload fails
                      overallMessages.push(`Local files: Failed to upload or process: ${result.error || 'Unknown error.'}`);
                      showToast('Local Import Error', overallMessages.join(' '), 'error');
                  }

              } catch (error) {
                  overallSuccess = false;
                  overallMessages.push(`Local files: An error occurred: ${error.message}`);
                  showToast('Local Import Error', overallMessages.join(' '), 'error');
                  console.error('Local file import error:', error);
              }
          }
      } else {
          // If no local files were provided, directly start shared folder processing
          await processSharedFolderImport();
      }

      importStatus.innerHTML = overallMessages.join('<br>'); // Display all messages

      if (overallSuccess) {
          showToast('Import Complete', 'All selected import processes finished successfully!', 'success');
      } else {
          showToast('Import Failed', 'Some import processes encountered errors. Check status for details.', 'error');
      }

      fetchEmployees(); // Refresh the list regardless of full success
      const bulkImportModal = bootstrap.Modal.getInstance(document.getElementById('bulkImportModal'));
      if(bulkImportModal) bulkImportModal.hide();

      startImportBtn.disabled = false;
      startImportBtn.innerHTML = '<i class="bi bi-cloud-upload me-1"></i> Start Import';
      // Hide progress bar and status after a delay
      setTimeout(() => {
          document.getElementById('import-progress').style.display = 'none';
          importStatus.textContent = '';
      }, 5000);
  });


  // Remove the old listener for processSharedFolderBtn if it exists
  const processSharedFolderBtn = document.getElementById('processSharedFolderBtn');
  if (processSharedFolderBtn) {
      processSharedFolderBtn.parentNode.removeChild(processSharedFolderBtn);
  }


  // --- All other existing JavaScript functions remain the same ---
  // (e.g., fetchEmployees, filterAndDisplayEmployees, delete handlers, edit handlers, etc.)

  // Function to fetch and display employees
  async function fetchEmployees() {
    try {
      const response = await fetch('/admin/api/employees');
      allEmployees = await response.json();
      filterAndDisplayEmployees(); // Display all initially
      populateEmployeeEmailDropdown(allEmployees); // Populate dropdown for email reports
    } catch (error) {
      console.error('Error fetching employees:', error);
      showToast('Error', 'Failed to load employee data.', 'error');
    }
  }

  // Filter and Search
  document.getElementById('searchQuery')?.addEventListener('keyup', filterAndDisplayEmployees);
  document.getElementById('departmentFilter')?.addEventListener('change', filterAndDisplayEmployees);
  document.getElementById('resetFilters')?.addEventListener('click', function() {
    document.getElementById('searchQuery').value = '';
    document.getElementById('departmentFilter').value = '';
    filterAndDisplayEmployees();
  });


  // Function to filter and display employees based on current filters
  function filterAndDisplayEmployees() {
    const searchQuery = document.getElementById('searchQuery').value.toLowerCase();
    const departmentFilter = document.getElementById('departmentFilter').value;
    const employeesTableBody = document.getElementById('employeesTableBody');
    employeesTableBody.innerHTML = ''; // Clear existing rows

    const filteredEmployees = allEmployees.filter(employee => {
      const matchesSearch =
        employee.full_name.toLowerCase().includes(searchQuery) ||
        employee.emp_id.toLowerCase().includes(searchQuery) ||
        employee.email.toLowerCase().includes(searchQuery) ||
        (employee.personal_email && employee.personal_email.toLowerCase().includes(searchQuery));

      const matchesDepartment = departmentFilter === '' || employee.department === departmentFilter;

      return matchesSearch && matchesDepartment;
    });

    if (filteredEmployees.length === 0) {
      employeesTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-3 text-muted">No employees found.</td></tr>`; // Updated colspan
      return;
    }

    filteredEmployees.forEach(employee => {
        const isActive = employee.is_active; // Get the new is_active status
        const statusText = isActive ? 'Active' : 'Deactivated';
        const statusBadgeClass = isActive ? 'bg-success' : 'bg-danger';
        const actionButton = isActive 
            ? `<button class="btn btn-sm btn-outline-danger deactivate-employee-btn" title="Deactivate"
                      data-emp-id="${employee.emp_id}" data-full-name="${employee.full_name}">
                 <i class="bi bi-person-x"></i>
               </button>`
            : `<button class="btn btn-sm btn-outline-success activate-employee-btn" title="Activate"
                      data-emp-id="${employee.emp_id}" data-full-name="${employee.full_name}">
                 <i class="bi bi-person-check"></i>
               </button>`;


      const row = `
        <tr>
          <td>
            <div class="d-flex align-items-center">
              <div>
                <div class="fw-semibold">${employee.full_name}</div>
                <small class="text-muted">${employee.email}</small>
              </div>
            </div>
          </td>
          <td>${employee.emp_id}</td>
          <td>${employee.personal_email || '-'}</td>
          <td>${employee.department || '-'}</td>
          <td>${employee.position || '-'}</td>
          <td><span class="badge ${statusBadgeClass}">${statusText}</span></td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-primary me-1 edit-employee-btn" title="Edit"
                      data-emp-id="${employee.emp_id}">
                <i class="bi bi-pencil"></i>
              </button>
              ${actionButton}
              <button class="btn btn-sm btn-outline-dark permanent-delete-btn ms-1" title="Permanent Delete"
                      data-emp-id="${employee.emp_id}" data-full-name="${employee.full_name}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
        <tr id="edit-row-${employee.emp_id}" class="inline-edit-row" style="display: none;" data-original-emp-id="${employee.emp_id}">
          <td colspan="7">
            <div class="p-3 bg-light rounded shadow-sm mb-3">
              <h6 class="mb-3"><i class="bi bi-pencil-square me-2"></i>Edit Employee Details</h6>
              <form class="row g-3">
                <input type="hidden" class="edit-emp-id-original" value="${employee.emp_id}">
                <div class="col-md-6">
                  <div class="form-floating">
                    <input type="text" class="form-control edit-full-name" id="editFullName-${employee.emp_id}" placeholder="Full Name" value="${employee.full_name}" required>
                    <label for="editFullName-${employee.emp_id}">Full Name</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-floating">
                    <input type="text" class="form-control edit-employee-id" id="editEmployeeId-${employee.emp_id}" placeholder="Employee ID" value="${employee.emp_id}" readonly>
                    <label for="editEmployeeId-${employee.emp_id}">Employee ID</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-floating">
                    <input type="email" class="form-control edit-email" id="editEmail-${employee.emp_id}" placeholder="Company Email" value="${employee.email}" readonly>
                    <label for="editEmail-${employee.emp_id}">Company Email</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-floating">
                    <input type="email" class="form-control edit-personal-email" id="editPersonalEmail-${employee.emp_id}" placeholder="Personal Email" value="${employee.personal_email || ''}" pattern="[^\\s@]+@[^\\s@]+\\.[^@]+" title="Please enter a valid email address">
                    <label for="editPersonalEmail-${employee.emp_id}">Personal Email</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-floating">
                    <select class="form-select edit-department" id="editDepartment-${employee.emp_id}" aria-label="Department" required>
                      <option value="">Select Department</option>
                      <option value="Engineering" ${employee.department === 'Engineering' ? 'selected' : ''}>Engineering</option>
                      <option value="Data Science" ${employee.department === 'Data Science' ? 'selected' : ''}>Data Science</option>
                      <option value="Marketing" ${employee.department === 'Marketing' ? 'selected' : ''}>Marketing</option>
                      <option value="HR" ${employee.department === 'HR' ? 'selected' : ''}>Human Resources</option>
                      <option value="Finance" ${employee.department === 'Finance' ? 'selected' : ''}>Finance</option>
                      <option value="Operations" ${employee.department === 'Operations' ? 'selected' : ''}>Operations</option>
                      <option value="Not assigned" ${employee.department === 'Not assigned' ? 'selected' : ''}>Not assigned</option>
                    </select>
                    <label for="editDepartment-${employee.emp_id}">Department</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-floating">
                    <input type="text" class="form-control edit-position" id="editPosition-${employee.emp_id}" placeholder="Position" value="${employee.position}" required>
                    <label for="editPosition-${employee.emp_id}">Position</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-floating input-group">
                    <input type="password" class="form-control edit-password" id="editPassword-${employee.emp_id}" placeholder="New Password" pattern="(?=.*\\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}" title="Password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character">
                    <label for="editPassword-${employee.emp_id}">New Password</label>
                    <button class="btn btn-outline-secondary password-generate-inline" type="button" data-bs-toggle="tooltip" data-bs-placement="top" title="Generate random password">
                      <i class="bi bi-arrow-repeat"></i>
                    </button>
                  </div>
                  <small class="text-muted">Leave blank to keep current password</small>
                </div>
                 <div class="col-12 mt-3">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sendEmailOnUpdate-${employee.emp_id}" checked>
                    <label class="form-check-label" for="sendEmailOnUpdate-${employee.emp_id}">
                      Send email notification
                    </label>
                  </div>
                </div>
                <div class="col-12 text-end">
                  <button type="button" class="btn btn-primary update-employee-inline">Update Employee</button>
                </div>
              </form>
            </div>
          </td>
        </tr>
      `;
      employeesTableBody.insertAdjacentHTML('beforeend', row);
      // Attach input event listeners for dynamic validation on newly added row
      const newRowElement = employeesTableBody.lastElementChild;
      newRowElement.querySelectorAll('input, select').forEach(element => {
          element.addEventListener('input', () => {
              if (element.checkValidity()) {
                  element.classList.remove('is-invalid');
                  element.classList.add('is-valid');
              } else {
                  element.classList.remove('is-valid');
                  element.classList.add('is-invalid');
              }
          });
      });
    });
  }

  // Handle Edit Employee Inline Form opening and data loading
  document.getElementById('employeesTableBody')?.addEventListener('click', async function(event) {
    const editButton = event.target.closest('.edit-employee-btn');
    if (editButton) {
      const empId = editButton.dataset.empId;
      const inlineEditRow = document.getElementById(`edit-row-${empId}`);

      if (inlineEditRow && inlineEditRow.style.display === 'table-row') {
          // If already open, close it
          inlineEditRow.style.display = 'none';
          editButton.querySelector('i').classList.replace('bi-x-lg', 'bi-pencil'); // Change icon back to pencil
      } else {
          // Close any other open inline edit forms first
          document.querySelectorAll('.inline-edit-row').forEach(row => {
              if (row.style.display === 'table-row') {
                  row.style.display = 'none';
                  const otherEditButton = document.querySelector(`.edit-employee-btn[data-emp-id="${row.dataset.originalEmpId || row.querySelector('.edit-emp-id-original')?.value}"] i`);
                  if (otherEditButton) otherEditButton.classList.replace('bi-x-lg', 'bi-pencil');
              }
          });

          // Open this one
          if (inlineEditRow) {
            inlineEditRow.style.display = 'table-row';
            editButton.querySelector('i').classList.replace('bi-pencil', 'bi-x-lg'); // Change icon to X
          }

          try {
            const response = await fetch(`/admin/api/employees/${empId}`);
            const data = await response.json();

            if (response.ok) {
              // Populate the inline form fields
              if (inlineEditRow) {
                inlineEditRow.querySelector('.edit-full-name').value = data.full_name;
                inlineEditRow.querySelector('.edit-employee-id').value = data.emp_id;
                inlineEditRow.querySelector('.edit-email').value = data.email;
                inlineEditRow.querySelector('.edit-personal-email').value = data.personal_email;
                inlineEditRow.querySelector('.edit-department').value = data.department;
                inlineEditRow.querySelector('.edit-position').value = data.position;
                inlineEditRow.querySelector('.edit-password').value = ''; // Clear password field
                inlineEditRow.dataset.originalEmpId = empId; // Store original empId on the row for update
              }

            } else {
              showToast('Error', 'Error fetching employee data: ' + (data.error || 'Unknown error'), 'error');
              if (inlineEditRow) inlineEditRow.style.display = 'none'; // Hide if data fetch fails
              editButton.querySelector('i').classList.replace('bi-x-lg', 'bi-pencil');
            }
          } catch (error) {
            console.error('Error fetching employee data:', error);
            showToast('Error', 'An error occurred while fetching employee data', 'error');
            if (inlineEditRow) inlineEditRow.style.display = 'none'; // Hide if network error
            editButton.querySelector('i').classList.replace('bi-x-lg', 'bi-pencil');
          }
      }
    }
  });

  // Handle Edit Employee Inline Form Submission
  document.getElementById('employeesTableBody')?.addEventListener('click', async function(event) {
    const updateButton = event.target.closest('.update-employee-inline');
    if (updateButton) {
        const inlineEditRow = updateButton.closest('.inline-edit-row');
        const empId = inlineEditRow.dataset.originalEmpId; // Get original empId from the row

        const fullName = inlineEditRow.querySelector('.edit-full-name').value.trim();
        const personalEmail = inlineEditRow.querySelector('.edit-personal-email').value.trim();
        const department = inlineEditRow.querySelector('.edit-department').value.trim();
        const position = inlineEditRow.querySelector('.edit-position').value.trim();
        const password = inlineEditRow.querySelector('.edit-password').value; // Don't trim password
        const sendEmailOnUpdate = inlineEditRow.querySelector(`#sendEmailOnUpdate-${empId}`).checked; // Get checkbox state

        // Frontend validation
        if (!fullName || !department || !position) {
          showToast('Error', 'Full Name, Department, and Position are required fields.', 'error');
          return;
        }

        if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(personalEmail)) {
          showToast('Error', 'Please enter a valid personal email address.', 'error');
          return;
        }

        if (password) {
            const passwordRegex = /^(?=.*\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
            if (!passwordRegex.test(password)) {
                showToast('Error', 'New password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character.', 'error');
                return;
            }
        }

        const updateData = {
          fullName: fullName,
          personalEmail: personalEmail,
          department: department,
          position: position,
          send_email_notification: sendEmailOnUpdate // Include the flag
        };

        if (password) { // Only add password if it's not empty
          updateData.password = password;
        }

        const updateBtn = this;
        const originalBtnText = updateBtn.innerHTML;
        updateBtn.disabled = true;
        updateBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Updating...';

        try {
          const response = await fetch(`/admin/api/employees/${empId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          });

          const result = await response.json();

          if (response.ok) {
            showToast('Success', result.message || 'Employee updated successfully!', 'success');
            
            // Backend now handles sending the notification email conditionally.
            
            inlineEditRow.style.display = 'none'; // Hide the inline form
            const editButtonIcon = document.querySelector(`.edit-employee-btn[data-emp-id="${empId}"] i`);
            if (editButtonIcon) editButtonIcon.classList.replace('bi-x-lg', 'bi-pencil'); // Change icon back
            fetchEmployees(); // Refresh employee list
          } else {
            showToast('Error', 'Update failed: ' + (result.error || 'Unknown error'), 'error');
          }
        } catch (error) {
          console.error('Error updating employee:', error);
          showToast('Error', 'An error occurred while updating employee', 'error');
        } finally {
          updateBtn.disabled = false;
          updateBtn.innerHTML = originalBtnText;
        }
    }
  });

  // Handle Deactivate Employee Modal opening
  document.getElementById('employeesTableBody')?.addEventListener('click', function(event) {
    if (event.target.closest('.deactivate-employee-btn')) {
      const button = event.target.closest('.deactivate-employee-btn');
      const empId = button.dataset.empId;
      const fullName = button.dataset.fullName;

      document.getElementById('deactivateEmpId').value = empId;
      document.getElementById('employeeToDeactivate').textContent = `${fullName} (${empId})`;

      const deactivateModal = new bootstrap.Modal(document.getElementById('deactivateEmployeeModal'));
      deactivateModal.show();
    }
  });

  // Handle Deactivate Confirmation
  document.getElementById('confirmDeactivate')?.addEventListener('click', async function() {
    const empId = document.getElementById('deactivateEmpId').value;
    const sendEmailOnDeactivate = document.getElementById('sendEmailOnDeactivate').checked;

    const confirmBtn = this;
    const originalBtnText = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Deactivating...';

    try {
      const response = await fetch(`/admin/api/employees/${empId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deactivate', send_email_notification: sendEmailOnDeactivate })
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Success', result.message || 'Employee deactivated successfully!', 'success');
        const deactivateModal = bootstrap.Modal.getInstance(document.getElementById('deactivateEmployeeModal'));
        if (deactivateModal) deactivateModal.hide();
        fetchEmployees(); // Refresh employee list
      } else {
        showToast('Error', 'Deactivation failed: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error deactivating employee:', error);
      showToast('Error', 'An error occurred while deactivating employee', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalBtnText;
    }
  });

  // Handle Activate Employee Modal opening
  document.getElementById('employeesTableBody')?.addEventListener('click', function(event) {
    if (event.target.closest('.activate-employee-btn')) {
      const button = event.target.closest('.activate-employee-btn');
      const empId = button.dataset.empId;
      const fullName = button.dataset.fullName;

      document.getElementById('activateEmpId').value = empId;
      document.getElementById('employeeToActivate').textContent = `${fullName} (${empId})`;

      const activateModal = new bootstrap.Modal(document.getElementById('activateEmployeeModal'));
      activateModal.show();
    }
  });

  // Handle Activate Confirmation
  document.getElementById('confirmActivate')?.addEventListener('click', async function() {
    const empId = document.getElementById('activateEmpId').value;
    const sendEmailOnActivate = document.getElementById('sendEmailOnActivate').checked;

    const confirmBtn = this;
    const originalBtnText = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Activating...';

    try {
      const response = await fetch(`/admin/api/employees/${empId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'activate', send_email_notification: sendEmailOnActivate })
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Success', result.message || 'Employee activated successfully!', 'success');
        const activateModal = bootstrap.Modal.getInstance(document.getElementById('activateEmployeeModal'));
        if (activateModal) activateModal.hide();
        fetchEmployees(); // Refresh employee list
      } else {
        showToast('Error', 'Activation failed: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error activating employee:', error);
      showToast('Error', 'An error occurred while activating employee', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalBtnText;
    }
  });

  // Handle Permanent Delete Modal opening
  document.getElementById('employeesTableBody')?.addEventListener('click', function(event) {
    if (event.target.closest('.permanent-delete-btn')) {
      const button = event.target.closest('.permanent-delete-btn');
      const empId = button.dataset.empId;
      const fullName = button.dataset.fullName;

      document.getElementById('permanentDeleteEmpId').value = empId;
      document.getElementById('employeeToPermanentDelete').textContent = `${fullName} (${empId})`;

      const permanentDeleteModal = new bootstrap.Modal(document.getElementById('permanentDeleteEmployeeModal'));
      permanentDeleteModal.show();
    }
  });

  // Handle Permanent Delete Confirmation
  document.getElementById('confirmPermanentDelete')?.addEventListener('click', async function() {
    const empId = document.getElementById('permanentDeleteEmpId').value;
    const sendEmailOnPermanentDelete = document.getElementById('sendEmailOnPermanentDelete').checked;

    const confirmBtn = this;
    const originalBtnText = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Deleting Permanently...';

    try {
      const response = await fetch(`/admin/api/employees/${empId}/permanent_delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_email_notification: sendEmailOnPermanentDelete })
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Success', result.message || 'Employee permanently deleted successfully!', 'success');
        const permanentDeleteModal = bootstrap.Modal.getInstance(document.getElementById('permanentDeleteEmployeeModal'));
        if (permanentDeleteModal) permanentDeleteModal.hide();
        fetchEmployees(); // Refresh employee list
      } else {
        showToast('Error', 'Permanent deletion failed: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error permanent deleting employee:', error);
      showToast('Error', 'An error occurred while permanently deleting employee', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalBtnText;
    }
  });


  // --- Email Report Feature Logic ---

  // Populate employee email dropdown in the modal
  function populateEmployeeEmailDropdown(employees) {
    const selectElement = document.getElementById('reportRecipientEmployee');
    selectElement.innerHTML = '<option value="">Select an employee...</option>'; // Clear existing
    employees.forEach(employee => {
      if (employee.personal_email && employee.personal_email !== '-') { // Only add if personal email exists
        const option = document.createElement('option');
        option.value = employee.personal_email;
        option.setAttribute('data-emp-id', employee.emp_id); // Store emp_id
        option.textContent = `${employee.full_name} (${employee.personal_email})`;
        selectElement.appendChild(option);
      }
    });
  }

  // Handle report type change to update subject
  document.querySelectorAll('input[name="reportType"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const subjectInput = document.getElementById('reportEmailSubject');
      if (this.value === 'attendance') {
        subjectInput.value = 'Your ArgusScan Attendance Report';
      } else if (this.value === 'regularization') {
        subjectInput.value = 'Your ArgusScan Regularization Records';
      }
    });
  });


document.getElementById('sendEmployeeReportBtn')?.addEventListener('click', async function() {
    const selectedEmployeeOption = document.getElementById('reportRecipientEmployee').selectedOptions[0];
    const recipientEmail = selectedEmployeeOption?.value;
    const empId = selectedEmployeeOption?.dataset.empId; // Get emp_id of selected user
    const subject = document.getElementById('reportEmailSubject').value.trim();
    const messageBodyElement = document.getElementById('reportEmailMessageBody');
    const reportType = document.querySelector('input[name="reportType"]:checked').value;
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;


    if (!recipientEmail || !empId || !subject) {
      showToast('Error', 'Please select an employee and fill in the subject.', 'error');
      return;
    }

    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Generating...';

    let reportData = [];
    let reportHeaders = [];
    let generatedReportHtml = '';
    let reportFilename = '';

    try {
      if (reportType === 'attendance') {
        const response = await fetch(`/admin/api/attendance_records_for_employee?emp_id=${empId}&start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json(); // This data is now a list of lists
        if (response.ok) {
          reportData = data;
          // IMPORTANT: These headers MUST now exactly match the order of elements in the lists returned by the API endpoint
          reportHeaders = ["Employee Name", "Employee ID", "Date", "Punch In", "Punch Out", "Punch In Location", "Punch Out Location", "Status"];
          generatedReportHtml = generateAttendanceReportHtml(reportData, selectedEmployeeOption.textContent, startDate, endDate);
          reportFilename = `Attendance_Report_${empId}.xlsx`;
        } else {
          throw new Error(data.message || 'Failed to fetch attendance records.');
        }
      } else if (reportType === 'regularization') {
        const response = await fetch(`/admin/api/regularization_records_for_employee?emp_id=${empId}&start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json(); // This data is now a list of lists
        if (response.ok) {
          reportData = data;
          reportHeaders = ["Date", "Original In", "Original Out", "Modified In", "Modified Out", "Reason", "Comments"];
          generatedReportHtml = generateRegularizationReportHtml(reportData, selectedEmployeeOption.textContent, startDate, endDate);
          reportFilename = `Regularization_Report_${empId}.xlsx`;
        } else {
          throw new Error(data.message || 'Failed to fetch regularization records.');
        }
      }

      messageBodyElement.value = generatedReportHtml;

      await sendReportEmail(recipientEmail, subject, messageBodyElement.value, reportData, reportHeaders, reportFilename);

      showToast('Success', 'Report sent successfully!', 'success');
      const emailReportModal = bootstrap.Modal.getInstance(document.getElementById('emailReportModal'));
      if (emailReportModal) emailReportModal.hide();

      // Reset form fields after successful send
      document.getElementById('reportRecipientEmployee').value = '';
      document.getElementById('attendanceReport').checked = true; // Default to attendance
      document.getElementById('reportEmailSubject').value = 'Your ArgusScan Attendance Report';
      document.getElementById('reportEmailMessageBody').value = '';
      document.getElementById('reportStartDate').value = '';
      document.getElementById('reportEndDate').value = '';

    } catch (error) {
      console.error('Error generating or sending report:', error);
      showToast('Error', `Failed to send report: ${error.message}`, 'error'); // Display detailed error
    } finally {
      this.disabled = false;
      this.innerHTML = '<i class="bi bi-check-lg me-1"></i> Send Report';
    }
});

// The `sendReportEmail` function already seems robust for handling attachments.
// No direct changes needed here, but the updated `get_regularization_records_for_employee`
// will ensure the `reportData` and `reportHeaders` passed to it are consistent.
async function sendReportEmail(toEmail, subject, messageBody, reportData, reportHeaders, reportFilename) {
    const response = await fetch('/admin/api/send_report_email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toEmail,
        subject: subject,
        message: messageBody,
        report_data: reportData,      // Pass report data
        report_headers: reportHeaders, // Pass report headers
        report_filename: reportFilename // Pass desired filename
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Server error sending email.');
    }
    return response.json();
}

  function generateProfessionalEmailHTML(title, employeeName, introText, tableHtml) {
    const currentYear = new Date().getFullYear();
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 800px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background-color: #4a6da7; color: #ffffff; padding: 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; color: #333333; line-height: 1.6; }
            .content p { margin-bottom: 15px; }
            .content table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            .content th, .content td { padding: 12px; border: 1px solid #dee2e6; text-align: left; }
            .content th { background-color: #f8f9fa; font-weight: bold; }
            .footer { background-color: #f8f9fa; color: #6c757d; text-align: center; padding: 20px; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${title}</h1>
            </div>
            <div class="content">
                <p>Dear ${employeeName.split('(')[0].trim()},</p>
                <p>${introText}</p>
                ${tableHtml}
                <p style="margin-top: 25px;">If you have any questions, please contact your administrator.</p>
                <p>Best regards,<br>The ArgusScan Team</p>
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} InnovaSolutions. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>`;
  }

  function generateAttendanceReportHtml(records, employeeName, startDate, endDate) {
    let dateRangeText = (startDate && endDate) ? `from ${startDate} to ${endDate}` : 'for all recorded dates';
    const introText = `Please find your requested attendance report below, covering the period ${dateRangeText}.`;

    let tableRows = '';
    if (records.length > 0) {
        records.forEach(record => {
            // 'record' is now an array, so access by index
            tableRows += `
              <tr>
                <td>${record[2]}</td> <td>${record[3] || '-'}</td> <td>${record[4] || '-'}</td> <td>${record[7]}</td> <td>${record[5] || '-'}</td> </tr>
            `;
        });
    } else {
        tableRows = `<tr><td colspan="5" style="text-align: center; color: #777;">No attendance records found for the selected period.</td></tr>`;
    }

    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Punch In</th>
            <th>Punch Out</th>
            <th>Status</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>`;

    return generateProfessionalEmailHTML('Attendance Report', employeeName, introText, tableHtml);
  }

  function generateRegularizationReportHtml(records, employeeName, startDate, endDate) {
    let dateRangeText = (startDate && endDate) ? `from ${startDate} to ${endDate}` : 'for all recorded dates';
    const introText = `Please find your requested regularization report below, covering the period ${dateRangeText}.`;

    let tableRows = '';
    if (records.length > 0) {
      records.forEach(record => {
        // 'record' is now an array, so access by index
        tableRows += `
          <tr>
            <td>${record[0]}</td> <td>${record[1] || '-'}</td> <td>${record[2] || '-'}</td> <td>${record[3] || '-'}</td> <td>${record[4] || '-'}</td> <td>${record[5] || '-'}</td> <td>${record[6] || '-'}</td> </tr>
        `;
      });
    } else {
        tableRows = `<tr><td colspan="7" style="text-align: center; color: #777;">No regularization records found for the selected period.</td></tr>`;
    }

    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Original In</th>
            <th>Original Out</th>
            <th>Modified In</th>
            <th>Modified Out</th>
            <th>Reason</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>`;

    return generateProfessionalEmailHTML('Regularization Report', employeeName, introText, tableHtml);
}

  // --- Export Download Functionality (Reverted from Modal Display) ---
  document.querySelectorAll('.export-download-btn').forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      const format = this.dataset.format; // 'xlsx' or 'csv'
      const currentPageUrl = new URL(window.location.href);
      const searchQuery = document.getElementById('searchQuery').value.trim();
      const departmentFilter = document.getElementById('departmentFilter').value;

      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (departmentFilter) params.append('department', departmentFilter);
      params.append('format', format);

      // Construct the download URL
      window.location.href = `/admin/export_employees?${params.toString()}`;
    });
  });

  // --- Copy Headers to Clipboard for Bulk Import Quick Guide ---
  document.getElementById('copyHeadersBtn')?.addEventListener('click', async function() {
    const headersTable = document.getElementById('bulkImportHeadersTable');
    if (headersTable) {
      const headerCells = headersTable.querySelectorAll('thead th');
      let headersToCopy = [];
      headerCells.forEach(cell => {
        headersToCopy.push(cell.textContent.trim());
      });
      const headersText = headersToCopy.join(','); // Join with comma

      try {
        await navigator.clipboard.writeText(headersText);
        showToast('Success', 'Headers copied to clipboard!', 'success');
      } catch (err) {
        console.error('Failed to copy text:', err);
        showToast('Error', 'Failed to copy headers. Please copy manually.', 'error');
      }
    }
  });


  // NEW: Generate Random Password functionality
  document.getElementById('employeesTableBody')?.addEventListener('click', function(event) {
      const generatePasswordBtn = event.target.closest('.password-generate-inline');
      if (generatePasswordBtn) {
          const passwordInput = generatePasswordBtn.closest('.input-group').querySelector('.edit-password');
          if (passwordInput) {
              const newPassword = generateRandomPassword();
              passwordInput.value = newPassword;
              showToast('Success', 'New password generated and filled!', 'success');
              // Manually trigger input event to apply validation classes
              const inputEvent = new Event('input', { bubbles: true });
              passwordInput.dispatchEvent(inputEvent);
          }
      }
  });

  function generateRandomPassword() {
      const length = 12; // Desired password length
      const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
      let password = "";
      // Ensure at least one uppercase, one number, one special character
      password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(Math.random() * 26)); // Uppercase
      password += "0123456789".charAt(Math.floor(Math.random() * 10)); // Number
      password += "!@#$%^&*()_+~`|}{[]:;?><,./-=".charAt(Math.floor(Math.random() * ("!@#$%^&*()_+~`|}{[]:;?><,./-=".length))); // Special character

      for (let i = password.length; i < length; i++) {
          password += charset.charAt(Math.floor(Math.random() * charset.length));
      }

      // Shuffle the password to randomize character positions
      return password.split('').sort(() => 0.5 - Math.random()).join('');
  }

});