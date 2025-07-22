document.addEventListener('DOMContentLoaded', function() {
    const attendanceApp = {
        selectedRecords: [],
        init: function() {
            this.setupCheckboxEvents();
            this.setupSelectAll();
            this.setupClearSelection();
            this.setupModal(); // Regularize modal is still used
            this.setupSubmitHandler();
            this.setupFiltering();
            this.setupFilterAccordionToggle(); // New: For the filter accordion
            this.setupSidebarToggle(); // Initialize sidebar toggle
            
            // Initialize tooltips
            var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
            var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl)
            });
        },

        setupSidebarToggle: function() {
            const sidebarToggle = document.getElementById('sidebarToggle');
            const sidebar = document.querySelector('.sidebar');
            if (sidebarToggle && sidebar) {
                sidebarToggle.addEventListener('click', function() {
                    sidebar.classList.toggle('show');
                    document.body.classList.toggle('sidebar-open');
                });

                document.addEventListener('click', function(event) {
                    if (sidebar.classList.contains('show') && !sidebar.contains(event.target) && !sidebarToggle.contains(event.target)) {
                        sidebar.classList.remove('show');
                        document.body.classList.remove('sidebar-open');
                    }
                });
            }
        },

        setupFilterAccordionToggle: function() {
            const filterCollapseElement = document.getElementById('filterCollapse');
            if (filterCollapseElement) {
                filterCollapseElement.addEventListener('shown.bs.collapse', () => {
                    // Optional: You could update the filter badge here to reflect active filters
                    // or change the filter button icon if it had one to indicate open state
                });
                filterCollapseElement.addEventListener('hidden.bs.collapse', () => {
                    // Optional: Reset button icon if needed
                });
            }
        },

        setupFiltering: function() {
            const applyFiltersBtn = document.getElementById('applyFilters');
            const resetFiltersBtn = document.getElementById('resetFilters');
            const filterBadge = document.getElementById('filterBadge');
            const filterCollapseElement = document.getElementById('filterCollapse'); // Get the collapse element

            const applyFilters = () => {
                const monthSelect = document.getElementById('monthSelect');
                const statusSelect = document.getElementById('statusSelect');

                let visibleRows = 0;

                document.querySelectorAll('tbody tr:not(.d-none)').forEach(row => { // Filter out d-none rows from previous filters
                    const dateCell = row.cells[1].textContent.trim();
                    // Get status from data-status attribute if available, fall back to cell text
                    const statusCell = row.querySelector('td .badge')?.textContent.trim() || row.cells[7].textContent.trim();

                    let monthMatch = true;
                    let statusMatch = true;

                    if (monthSelect.value) {
                        // Date format is "DD Mon YYYY", e.g., "17 Jul 2025"
                        // Extract month abbreviation (e.g., "Jul")
                        const rowDateParts = dateCell.split(' ');
                        const rowMonth = rowDateParts[1];
                        monthMatch = (rowMonth.toLowerCase() === monthSelect.value.toLowerCase());
                    }

                    if (statusSelect.value) {
                        statusMatch = (statusCell.toLowerCase() === statusSelect.value.toLowerCase());
                    }

                    if (monthMatch && statusMatch) {
                        row.classList.remove('d-none'); // Use d-none to hide/show
                        visibleRows++;
                    } else {
                        row.classList.add('d-none');
                    }
                });

                // Update filter badge based on actual visible rows after filtering
                if (filterBadge) {
                    if (monthSelect.value || statusSelect.value) {
                        filterBadge.textContent = visibleRows; // Show count of visible items
                        filterBadge.style.display = 'block';
                    } else {
                        filterBadge.style.display = 'none';
                    }
                }

                // Hide the filter accordion after applying filters
                const filterCollapse = new bootstrap.Collapse(filterCollapseElement, { toggle: false });
                filterCollapse.hide();

                this.selectedRecords = []; // Clear selection after filtering
                document.getElementById('selectAllCheckbox').checked = false;
                this.updateRegularizeButton();
            };

            if (applyFiltersBtn) {
                applyFiltersBtn.addEventListener('click', applyFilters);
            }

            if (resetFiltersBtn) {
                resetFiltersBtn.addEventListener('click', () => {
                    document.getElementById('monthSelect').value = '';
                    document.getElementById('statusSelect').value = '';
                    
                    document.querySelectorAll('tbody tr').forEach(row => {
                        row.classList.remove('d-none'); // Show all rows
                    });
                    
                    if (filterBadge) {
                        filterBadge.style.display = 'none';
                    }
                    
                    // Hide the filter accordion after resetting
                    const filterCollapse = new bootstrap.Collapse(filterCollapseElement, { toggle: false });
                    filterCollapse.hide();
                    
                    this.selectedRecords = [];
                    document.getElementById('selectAllCheckbox').checked = false;
                    this.updateRegularizeButton();
                });
            }
        },

        setupSelectAll: function() {
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            const selectAllBtn = document.getElementById('selectAllBtn');

            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', (event) => {
                    const isChecked = event.target.checked;
                    this.selectedRecords = [];
                    
                    // Only iterate visible rows
                    document.querySelectorAll('tbody tr:not(.d-none) .attendance-checkbox').forEach(checkbox => {
                        checkbox.checked = isChecked;
                        if (isChecked) {
                            const date = checkbox.dataset.date;
                            const status = checkbox.dataset.status;
                            if (date && !this.selectedRecords.some(r => r.date === date)) {
                                this.selectedRecords.push({ date, status });
                            }
                        }
                    });
                    
                    this.updateRegularizeButton();
                });
            }

            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => {
                    this.selectedRecords = [];
                    const visibleCheckboxes = document.querySelectorAll('tbody tr:not(.d-none) .attendance-checkbox');
                    
                    // Toggle select all state: if all are selected, deselect; otherwise, select all.
                    const allCurrentlySelected = visibleCheckboxes.length > 0 && Array.from(visibleCheckboxes).every(cb => cb.checked);

                    document.getElementById('selectAllCheckbox').checked = !allCurrentlySelected; // Invert state
                    
                    visibleCheckboxes.forEach(checkbox => {
                        checkbox.checked = !allCurrentlySelected; // Set to inverse of current state
                        if (!allCurrentlySelected) { // If selecting all
                            const date = checkbox.dataset.date;
                            const status = checkbox.dataset.status;
                            if (date && !this.selectedRecords.some(r => r.date === date)) {
                                this.selectedRecords.push({ date, status });
                            }
                        }
                    });
                    
                    this.updateRegularizeButton();
                    showToast('All visible records deselected', 'info');
                });
            }
        },

        setupClearSelection: function() {
            const clearSelectionBtn = document.getElementById('clearSelectionBtn');

            if (clearSelectionBtn) {
                clearSelectionBtn.addEventListener('click', () => {
                    this.selectedRecords = [];
                    document.getElementById('selectAllCheckbox').checked = false;
                    document.getElementById('selectAllCheckbox').indeterminate = false; // Clear indeterminate state
                    
                    document.querySelectorAll('.attendance-checkbox').forEach(checkbox => {
                        checkbox.checked = false;
                    });
                    
                    this.updateRegularizeButton();
                    showToast('Selection cleared', 'info');
                });
            }
        },

        setupCheckboxEvents: function() {
            document.querySelectorAll('.attendance-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (event) => {
                    const date = event.target.dataset.date;
                    const status = event.target.dataset.status;
                    
                    if (event.target.checked) {
                        if (date && !this.selectedRecords.some(r => r.date === date)) {
                            this.selectedRecords.push({ date, status });
                        }
                    } else {
                        this.selectedRecords = this.selectedRecords.filter(r => r.date !== date);
                        // No need to set selectAllCheckbox.checked = false here directly, updateRegularizeButton handles it
                    }
                    
                    this.updateRegularizeButton();
                });
            });
        },

        updateRegularizeButton: function() {
            const regularizeBtn = document.getElementById('regularizeBtn');
            if (regularizeBtn) {
                regularizeBtn.disabled = this.selectedRecords.length === 0;
            }
            
            const visibleCheckboxes = document.querySelectorAll('tbody tr:not(.d-none) .attendance-checkbox'); // Only count visible
            const checkedCheckboxes = document.querySelectorAll('tbody tr:not(.d-none) .attendance-checkbox:checked'); // Only count visible checked
            
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (selectAllCheckbox) {
                if (visibleCheckboxes.length === 0) {
                    selectAllCheckbox.checked = false;
                    selectAllCheckbox.indeterminate = false;
                } else {
                    selectAllCheckbox.checked = checkedCheckboxes.length === visibleCheckboxes.length;
                    selectAllCheckbox.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < visibleCheckboxes.length;
                }
            }
        },

       setupModal: function() {
            const regularizeBtn = document.getElementById('regularizeBtn');
            const regularizeModalElement = document.getElementById('regularizeModal');
            const regularizeModal = new bootstrap.Modal(regularizeModalElement);
            const regularizeTableBody = document.getElementById('regularizeTableBody');

            if (regularizeBtn) {
                regularizeBtn.addEventListener('click', () => {
                    regularizeTableBody.innerHTML = ''; // Clear previous entries
                    
                    if (this.selectedRecords.length === 0) {
                        showToast('Please select at least one record to regularize.', 'warning');
                        return;
                    }

                    // Define the new reason options
                    const newReasonOptions = [
                        { value: "", text: "Select Reason" },
                        { value: "Forgot to Punch-in/Punch-out", text: "Forgot to Punch-in/Punch-out" },
                        { value: "Shift Change", text: "Shift Change" },
                        { value: "System Malfunction", text: "System Malfunction" },
                        { value: "Official Business Travel", text: "Official Business Travel" },
                        { value: "Other", text: "Other" }
                    ];

                    this.selectedRecords.forEach(record => {
                        // Find the original row in the main table to get all displayed data
                        const row = document.querySelector(`tr[data-date="${record.date}"]`);
                        if (row) {
                            const date = row.cells[1].textContent.trim();
                            const shiftIn = row.cells[2].textContent.trim();
                            const shiftOut = row.cells[3].textContent.trim();
                            const actualIn = row.cells[4].textContent.trim();
                            const actualOut = row.cells[5].textContent.trim();
                            const status = record.status; // Use status from selectedRecords

                            // Use actual times if available and not '-', otherwise use shift times
                            const displayIn = (actualIn && actualIn !== '-') ? actualIn : shiftIn;
                            const displayOut = (actualOut && actualOut !== '-') ? actualOut : shiftOut;

                            let reasonOptionsHtml = '';
                            newReasonOptions.forEach(option => {
                                reasonOptionsHtml += `<option value="${option.value}">${option.text}</option>`;
                            });


                            const newRow = `
                                <tr data-date="${date}">
                                    <td>${date}</td>
                                    <td>${status}</td>
                                    <td>${shiftIn}</td>
                                    <td>${shiftOut}</td>
                                    <td>
                                        <div class="form-floating">
                                            <input type="time" class="form-control form-control-sm modify-in" id="modifyIn-${date}" placeholder="Modify In" value="${displayIn}">
                                            <label for="modifyIn-${date}">Modify In</label>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="form-floating">
                                            <input type="time" class="form-control form-control-sm modify-out" id="modifyOut-${date}" placeholder="Modify Out" value="${displayOut}">
                                            <label for="modifyOut-${date}">Modify Out</label>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="form-floating">
                                            <select class="form-select form-select-sm reason-select" id="reasonSelect-${date}" required aria-label="Select reason">
                                                ${reasonOptionsHtml}
                                            </select>
                                            <label for="reasonSelect-${date}">Reason</label>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="form-floating">
                                            <textarea class="form-control form-control-sm comments-text" id="commentsText-${date}" rows="1" placeholder="Optional comments"></textarea>
                                            <label for="commentsText-${date}">Comments</label>
                                        </div>
                                    </td>
                                </tr>
                            `;
                            regularizeTableBody.insertAdjacentHTML('beforeend', newRow);
                        }
                    });
                    
                    regularizeModal.show();
                });
            }
        },

       setupSubmitHandler: function() {
            const submitRegularizeBtn = document.getElementById('submitRegularize');
            const regularizeModalElement = document.getElementById('regularizeModal');
            
            if (submitRegularizeBtn) {
                submitRegularizeBtn.addEventListener('click', async () => {
                    const recordsToRegularize = [];
                    let validationFailed = false;

                    document.querySelectorAll('#regularizeTableBody tr').forEach(row => {
                        const date = row.dataset.date;
                        const modifyInInput = row.querySelector('.modify-in');
                        const modifyOutInput = row.querySelector('.modify-out');
                        const reasonSelect = row.querySelector('.reason-select');
                        const comments = row.querySelector('.comments-text').value;

                        const modifyIn = modifyInInput.value;
                        const modifyOut = modifyOutInput.value;
                        const reason = reasonSelect.value;
                        
                        // Reset validation classes
                        modifyInInput.classList.remove('is-invalid');
                        modifyOutInput.classList.remove('is-invalid');
                        reasonSelect.classList.remove('is-invalid');

                        // Client-side validation for reason
                        if (!reason) {
                            reasonSelect.classList.add('is-invalid');
                            validationFailed = true;
                        }

                        // Validate time format (empty is allowed if not modified, but if filled, must be valid)
                        const timeRegex = /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/;

                        if (modifyIn && !timeRegex.test(modifyIn)) {
                            modifyInInput.classList.add('is-invalid');
                            validationFailed = true; // Fix: Added this line
                            showToast('Error', `Invalid "Modify In" time format for ${date}. Please use HH:MM.`, 'danger');
                        }
                        if (modifyOut && !timeRegex.test(modifyOut)) {
                            modifyOutInput.classList.add('is-invalid');
                            validationFailed = true; // Fix: Added this line
                            showToast('Error', `Invalid "Modify Out" time format for ${date}. Please use HH:MM.`, 'danger');
                        }

                        // Validate logical consistency (Modify In before Modify Out) if both are provided and valid
                        if (modifyIn && modifyOut && timeRegex.test(modifyIn) && timeRegex.test(modifyOut)) {
                            const inTime = new Date(`2000-01-01T${modifyIn}`);
                            const outTime = new Date(`2000-01-01T${modifyOut}`);
                            if (inTime >= outTime) {
                                modifyInInput.classList.add('is-invalid');
                                modifyOutInput.classList.add('is-invalid');
                                validationFailed = true;
                                showToast('Error', `"Modify In" time must be before "Modify Out" time for ${date}.`, 'danger');
                            }
                        }

                        if (!validationFailed) { // Only add record if no client-side validation errors so far
                            // Only add record if at least one modification or reason is provided
                            if (modifyIn || modifyOut || reason || comments) {
                                recordsToRegularize.push({
                                    date: date,
                                    modified_in: modifyIn,
                                    modified_out: modifyOut,
                                    reason: reason,
                                    comments: comments
                                });
                            }
                        }
                    });
                    
                    if (validationFailed) {
                        showToast('Please correct the highlighted errors before submitting.', 'danger');
                        return;
                    }

                    if (recordsToRegularize.length === 0) {
                        showToast('No changes to regularize. Please make modifications or provide a reason.', 'warning');
                        return;
                    }

                    // Disable button and show spinner
                    const originalBtnText = submitRegularizeBtn.innerHTML;
                    submitRegularizeBtn.disabled = true;
                    submitRegularizeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Submitting...';
                    
                    try {
                        const response = await fetch('/regularize_attendance', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ records: recordsToRegularize })
                        });
                        
                        const result = await response.json();
                        
                        if (response.ok) { // Check for 2xx status codes
                            showToast(result.message || 'Attendance regularized successfully!', 'success');
                            const modal = bootstrap.Modal.getInstance(regularizeModalElement);
                            if (modal) {
                                modal.hide();
                            }
                            
                            // Re-fetch attendance data to reflect all changes accurately
                            // This is more reliable than trying to update individual cells
                            setTimeout(() => {
                                window.location.reload(); 
                            }, 500); // Small delay to allow toast to be seen
                        } else {
                            showToast(result.message || 'Failed to regularize attendance.', 'danger');
                            // Highlight specific errors if backend provides them
                            if (result.errors) {
                                result.errors.forEach(err => {
                                    console.error(`Regularization Error for ${err.date}: ${err.message}`);
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Network Error during regularization:', error);
                        showToast('An error occurred while regularizing attendance. Please check your network.', 'danger');
                    } finally {
                        submitRegularizeBtn.disabled = false;
                        submitRegularizeBtn.innerHTML = originalBtnText;
                    }
                });
            }
        }
    };

    attendanceApp.init();

    // Unified showToast function for employee pages
    function showToast(message, type = 'success') {
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