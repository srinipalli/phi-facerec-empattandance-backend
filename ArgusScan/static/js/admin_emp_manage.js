let employeesTable;

// Toast notification function
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
  
  if (type === 'error') {
    header.classList.remove('bg-success', 'bg-primary');
    header.classList.add('bg-danger', 'text-white');
  } else if (type === 'success') {
    header.classList.remove('bg-danger', 'bg-primary');
    header.classList.add('bg-success', 'text-white');
  } else {
    header.classList.remove('bg-danger', 'bg-success');
    header.classList.add('bg-primary', 'text-white');
  }
  
  toast.show();
}

$(document).ready(function() {
  // Initialize DataTable
  employeesTable = $('#employeesTable').DataTable({
    "ajax": {
      "url": "/admin/api/employees",
      "dataSrc": "",
      "data": function(d) {
        d.search = $('#searchQuery').val();
        d.department = $('#departmentFilter').val();
      }
    },
    "columns": [
      {
        "data": null,
        "render": function(data, type, row) {
          return `
            <div class="d-flex align-items-center">
              <img src="${row.image_path || 'https://via.placeholder.com/40'}" alt="Employee" class="employee-avatar me-3">
              <div>
                <div class="fw-semibold">${row.full_name}</div>
                <small class="text-muted">${row.email}</small>
              </div>
            </div>
          `;
        }
      },
      { "data": "emp_id" },
      { "data": "personal_email" },
      { "data": "department" },
      { "data": "position" },
      {
        "data": null,
        "orderable": false,
        "render": function(data, type, row) {
          return `
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-primary me-1 edit-employee-btn" title="Edit" 
                      data-emp-id="${row.emp_id}" data-bs-toggle="modal" data-bs-target="#editEmployeeModal">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger delete-employee-btn" title="Delete" 
                      data-emp-id="${row.emp_id}" data-full-name="${row.full_name}" data-bs-toggle="modal" data-bs-target="#deleteEmployeeModal">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          `;
        }
      }
    ],
    "responsive": true
  });

  // Export functionality
  document.getElementById('exportEmployeesExcel').addEventListener('click', function(e) {
    e.preventDefault();
    exportEmployees('xlsx');
  });

  document.getElementById('exportEmployeesCSV').addEventListener('click', function(e) {
    e.preventDefault();
    exportEmployees('csv');
  });

  function exportEmployees(format) {
    const params = new URLSearchParams(window.location.search);
    params.set('format', format);
    window.location.href = '/admin/export_employees?' + params.toString();
  }

  // Rest of the existing code remains the same...
  // Photo preview for Add Employee modal
  $('#employeePhoto').change(function() {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        $('#photoPreview').attr('src', e.target.result).show();
      }
      reader.readAsDataURL(file);
    }
  });

  // Custom search input for DataTables
  $('#searchQuery').on('keyup', function() {
    employeesTable.ajax.reload();
  });

  // Filter change handlers
  $('#departmentFilter').on('change', function() {
    employeesTable.ajax.reload();
  });

  // Reset Filters button
  $('#resetFilters').on('click', function() {
    $('#searchQuery').val('');
    $('#departmentFilter').val('');
    employeesTable.ajax.reload();
  });

  // Generate random password
  function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  $('#generatePassword').on('click', function() {
    $('#password').val(generatePassword());
  });

  $('#editGeneratePassword').on('click', function() {
    $('#editPassword').val(generatePassword());
  });

  // Function to send email notification
  function sendEmployeeEmail(empId, fullName, email, personalEmail, password, action, changes = {}) {
    let subject = '';
    let message = '';
    
    if (action === 'create') {
      subject = `Your Employee Account Has Been Created`;
      message = `
        <p>Dear ${fullName},</p>
        <p>Your employee account has been created with the following details:</p>
        <ul>
          <li><strong>Employee ID:</strong> ${empId}</li>
          <li><strong>Temporary Password:</strong> ${password}</li>
          <li><strong>Login Email:</strong> ${email}</li>
        </ul>
        <p>Please login to the employee portal and change your password immediately.</p>
        <p>Best regards,<br>HR Department</p>
      `;
    } else if (action === 'update') {
      subject = `Your Employee Account Has Been Updated`;
      message = `
        <p>Dear ${fullName},</p>
        <p>Your employee account has been updated with the following changes:</p>
        <ul>
          ${changes.fullName ? `<li><strong>Name:</strong> ${changes.fullName}</li>` : ''}
          ${changes.department ? `<li><strong>Department:</strong> ${changes.department}</li>` : ''}
          ${changes.position ? `<li><strong>Position:</strong> ${changes.position}</li>` : ''}
          ${changes.password ? `<li><strong>New Password:</strong> ${changes.password}</li>` : ''}
        </ul>
        <p>If you didn't request these changes, please contact HR immediately.</p>
        <p>Best regards,<br>HR Department</p>
      `;
    } else if (action === 'delete') {
      subject = `Your Employee Account Has Been Deleted`;
      message = `
        <p>Dear ${fullName},</p>
        <p>Your employee account has been deleted from our system.</p>
        <p>If you believe this was done in error, please contact HR immediately.</p>
        <p>Best regards,<br>HR Department</p>
      `;
    }

    $.ajax({
      url: '/admin/send_employee_email',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        to: personalEmail,
        subject: subject,
        message: message
      }),
      success: function(response) {
        showToast('Email Sent', `Notification email sent to ${personalEmail}`, 'success');
      },
      error: function(xhr) {
        console.error('Error sending email:', xhr.responseText);
        showToast('Email Error', `Failed to send email to ${personalEmail}`, 'error');
      }
    });
  }

  $('#saveEmployee').on('click', function() {
    const fullName = $('#fullName').val();
    const employeeId = $('#employeeId').val();
    const emailPrefix = $('#emailPrefix').val();
    const personalEmail = $('#personalEmail').val();
    const department = $('#department').val();
    const position = $('#position').val();
    const password = $('#password').val();
    const photoFile = $('#employeePhoto')[0].files[0];

    if (!fullName || !employeeId || !emailPrefix || !department || !position || !password || !photoFile) {
        showToast('Error', 'Please fill in all required fields including photo', 'error');
        return;
    }

    const email = `${emailPrefix}@innovasolutions.com`;

    const reader = new FileReader();
    reader.onload = function(e) {
        const photoData = e.target.result.split(',')[1];

        $.ajax({
            url: '/admin/api/employees',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                fullName: fullName,
                employeeId: employeeId,
                email: email,
                personalEmail: personalEmail,
                department: department,
                position: position,
                password: password,
                photoData: photoData
            }),
            success: function(response) {
                sendEmployeeEmail(employeeId, fullName, email, personalEmail, password, 'create');
                showToast('Success', 'Employee added successfully', 'success');
                $('#addEmployeeModal').modal('hide');
                $('#addEmployeeForm')[0].reset();
                $('#photoPreview').hide();
                employeesTable.ajax.reload();
            },
            error: function(xhr) {
                const error = xhr.responseJSON ? xhr.responseJSON.error : 'An error occurred';
                showToast('Error', 'Error: ' + error, 'error');
            }
        });
    };
    reader.readAsDataURL(photoFile);
});

  // Handle Edit Employee Modal opening and data loading
  $('#employeesTable').on('click', '.edit-employee-btn', function() {
    const empId = $(this).data('emp-id');
    $('#editEmpIdOriginal').val(empId);

    $.ajax({
      url: `/admin/api/employees/${empId}`,
      method: 'GET',
      success: function(data) {
        $('#editFullName').val(data.full_name);
        $('#editEmployeeId').val(data.emp_id);
        $('#editEmail').val(data.email);
        $('#editPersonalEmail').val(data.personal_email);
        $('#editDepartment').val(data.department);
        $('#editPosition').val(data.position);
        $('#editPassword').val('');
      },
      error: function(xhr) {
        const error = xhr.responseJSON ? xhr.responseJSON.error : 'An error occurred';
        showToast('Error', 'Error: ' + error, 'error');
        $('#editEmployeeModal').modal('hide');
      }
    });
  });

  // Handle Edit Employee Form Submission
  $('#updateEmployee').on('click', function() {
    const empId = $('#editEmpIdOriginal').val();
    const fullName = $('#editFullName').val();
    const personalEmail = $('#editPersonalEmail').val();
    const department = $('#editDepartment').val();
    const position = $('#editPosition').val();
    const password = $('#editPassword').val();

    if (!fullName || !department || !position) {
      showToast('Error', 'Please fill in all required fields', 'error');
      return;
    }

    const updateData = {
      fullName: fullName,
      personalEmail: personalEmail,
      department: department,
      position: position
    };

    if (password) {
      updateData.password = password;
    }

    $.ajax({
      url: `/admin/api/employees/${empId}`,
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify(updateData),
      success: function(response) {
        // Get the original values before updating
        const originalFullName = $('#editFullName').val();
        const originalDepartment = $('#editDepartment').val();
        const originalPosition = $('#editPosition').val();
        
        // Determine what changed for the email notification
        const changes = {};
        if (fullName !== originalFullName) changes.fullName = fullName;
        if (department !== originalDepartment) changes.department = department;
        if (position !== originalPosition) changes.position = position;
        if (password) changes.password = password;
        
        // Get email and personal email from the form
        const email = $('#editEmail').val();
        const personalEmail = $('#editPersonalEmail').val();
        
        // Send email notification
        if (Object.keys(changes).length > 0 && personalEmail) {
          sendEmployeeEmail(empId, fullName, email, personalEmail, password, 'update', changes);
        }
        
        showToast('Success', 'Employee updated successfully', 'success');
        $('#editEmployeeModal').modal('hide');
        employeesTable.ajax.reload();
      },
      error: function(xhr) {
        const error = xhr.responseJSON ? xhr.responseJSON.error : 'An error occurred';
        showToast('Error', 'Error: ' + error, 'error');
      }
    });
  });

  // Handle Delete Employee Modal opening
  $('#employeesTable').on('click', '.delete-employee-btn', function() {
    const empId = $(this).data('emp-id');
    const fullName = $(this).data('full-name');
    $('#deleteEmpId').val(empId);
    $('#employeeToDelete').text(`${fullName} (${empId})`);
  });

  // Handle Delete Confirmation
  $('#confirmDelete').on('click', function() {
    const empId = $('#deleteEmpId').val();
    const fullName = $('#employeeToDelete').text();
    
    // Get employee details for email notification
    $.ajax({
      url: `/admin/api/employees/${empId}`,
      method: 'GET',
      success: function(data) {
        // Send email notification before deleting
        if (data.personal_email) {
          sendEmployeeEmail(empId, data.full_name, data.email, data.personal_email, '', 'delete');
        }
        
        // Now proceed with deletion
        $.ajax({
          url: `/admin/api/employees/${empId}`,
          method: 'DELETE',
          success: function(response) {
            showToast('Success', 'Employee deleted successfully', 'success');
            $('#deleteEmployeeModal').modal('hide');
            employeesTable.ajax.reload();
          },
          error: function(xhr) {
            const error = xhr.responseJSON ? xhr.responseJSON.error : 'An error occurred';
            showToast('Error', 'Error: ' + error, 'error');
          }
        });
      },
      error: function(xhr) {
        const error = xhr.responseJSON ? xhr.responseJSON.error : 'An error occurred';
        showToast('Error', 'Error fetching employee details: ' + error, 'error');
      }
    });
  });
});