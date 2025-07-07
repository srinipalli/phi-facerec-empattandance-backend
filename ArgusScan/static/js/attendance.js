// attendance.js
document.addEventListener('DOMContentLoaded', function() {
    const attendanceApp = {
        selectedRecords: [],
        init: function() {
            this.setupCheckboxEvents();
            this.setupSelectAll();
            this.setupClearSelection();
            this.setupModal();
            this.setupSubmitHandler();
            this.setupFiltering();
        },

        setupFiltering: function() {
            const applyFiltersBtn = document.getElementById('applyFilters');
            const resetFiltersBtn = document.getElementById('resetFilters');
            const filterBadge = document.getElementById('filterBadge');

            const applyFilters = () => {
                const monthSelect = document.getElementById('monthSelect');
                const statusSelect = document.getElementById('statusSelect');

                let activeFiltersCount = 0;
                let visibleRows = 0;

                document.querySelectorAll('tbody tr').forEach(row => {
                    const dateCell = row.cells[1].textContent.trim();
                    const statusCell = row.querySelector('td[data-status]')?.dataset.status || 
                                     row.cells[7].textContent.trim();

                    let monthMatch = true;
                    let statusMatch = true;

                    if (monthSelect.value) {
                        const rowDateParts = dateCell.split(' ');
                        if (rowDateParts.length >= 3) {
                            const rowMonth = rowDateParts[1];
                            monthMatch = (rowMonth.toLowerCase() === monthSelect.value.toLowerCase());
                        } else {
                            monthMatch = false;
                        }
                    }

                    if (statusSelect.value) {
                        statusMatch = (statusCell.toLowerCase() === statusSelect.value.toLowerCase());
                    }

                    if (monthMatch && statusMatch) {
                        row.style.display = '';
                        visibleRows++;
                        if (monthSelect.value || statusSelect.value) {
                            activeFiltersCount++;
                        }
                    } else {
                        row.style.display = 'none';
                    }
                });

                if (filterBadge) {
                    if (monthSelect.value || statusSelect.value) {
                        filterBadge.textContent = visibleRows;
                        filterBadge.style.display = 'block';
                    } else {
                        filterBadge.style.display = 'none';
                    }
                }

                const modal = bootstrap.Modal.getInstance(document.getElementById('filterModal'));
                if (modal) {
                    modal.hide();
                }

                this.selectedRecords = [];
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
                        row.style.display = '';
                    });
                    
                    if (filterBadge) {
                        filterBadge.style.display = 'none';
                    }
                    
                    const modal = bootstrap.Modal.getInstance(document.getElementById('filterModal'));
                    if (modal) {
                        modal.hide();
                    }
                    
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
                    
                    document.querySelectorAll('tbody tr:not([style*="display: none"]) .attendance-checkbox').forEach(checkbox => {
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
                    document.getElementById('selectAllCheckbox').checked = true;
                    
                    document.querySelectorAll('tbody tr:not([style*="display: none"])').forEach(row => {
                        const checkbox = row.querySelector('.attendance-checkbox');
                        if (checkbox) {
                            checkbox.checked = true;
                            const date = checkbox.dataset.date;
                            const status = checkbox.dataset.status;
                            if (date && !this.selectedRecords.some(r => r.date === date)) {
                                this.selectedRecords.push({ date, status });
                            }
                        }
                    });
                    
                    this.updateRegularizeButton();
                    showToast('All visible records selected', 'info');
                });
            }
        },

        setupClearSelection: function() {
            const clearSelectionBtn = document.getElementById('clearSelectionBtn');

            if (clearSelectionBtn) {
                clearSelectionBtn.addEventListener('click', () => {
                    this.selectedRecords = [];
                    document.getElementById('selectAllCheckbox').checked = false;
                    
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
                        document.getElementById('selectAllCheckbox').checked = false;
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
            
            const visibleCheckboxes = document.querySelectorAll('tbody tr:not([style*="display: none"]) .attendance-checkbox');
            const checkedCheckboxes = document.querySelectorAll('tbody tr:not([style*="display: none"]) .attendance-checkbox:checked');
            
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = visibleCheckboxes.length > 0 && checkedCheckboxes.length === visibleCheckboxes.length;
                selectAllCheckbox.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < visibleCheckboxes.length;
            }
        },

       setupModal: function() {
    const regularizeBtn = document.getElementById('regularizeBtn');
    const regularizeModal = new bootstrap.Modal(document.getElementById('regularizeModal'));
    const regularizeTableBody = document.getElementById('regularizeTableBody');

    if (regularizeBtn) {
        regularizeBtn.addEventListener('click', () => {
            regularizeTableBody.innerHTML = '';
            
            this.selectedRecords.forEach(record => {
                const row = document.querySelector(`tr[data-date="${record.date}"]`);
                if (row) {
                    const date = row.cells[1].textContent.trim();
                    const shiftIn = row.cells[2].textContent.trim();
                    const shiftOut = row.cells[3].textContent.trim();
                    const actualIn = row.cells[4].textContent.trim();
                    const actualOut = row.cells[5].textContent.trim();
                    const status = record.status;

                    // Use actual times if available, otherwise use shift times
                    const displayIn = actualIn !== '-' ? actualIn : shiftIn;
                    const displayOut = actualOut !== '-' ? actualOut : shiftOut;

                    const newRow = `
                        <tr data-date="${date}">
                            <td>${date}</td>
                            <td>${status}</td>
                            <td>${shiftIn}</td>
                            <td>${shiftOut}</td>
                            <td><input type="time" class="form-control form-control-sm modify-in" value="${displayIn}"></td>
                            <td><input type="time" class="form-control form-control-sm modify-out" value="${displayOut}"></td>
                            <td>
                                <select class="form-select form-select-sm reason-select">
                                    <option value="">Select Reason</option>
                                    <option value="Forgot to punch in">Forgot to punch in</option>
                                    <option value="Forgot to punch out">Forgot to punch out</option>
                                    <option value="System error">System error</option>
                                    <option value="Official visit">Official visit</option>
                                    <option value="Other">Other</option>
                                </select>
                            </td>
                            <td><textarea class="form-control form-control-sm comments-text" rows="1" placeholder="Optional comments"></textarea></td>
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
    
    if (submitRegularizeBtn) {
        submitRegularizeBtn.addEventListener('click', async () => {
            const recordsToRegularize = [];
            
            document.querySelectorAll('#regularizeTableBody tr').forEach(row => {
                const date = row.dataset.date;
                const modifyIn = row.querySelector('.modify-in').value;
                const modifyOut = row.querySelector('.modify-out').value;
                const reason = row.querySelector('.reason-select').value;
                const comments = row.querySelector('.comments-text').value;
                
                if (modifyIn || modifyOut || reason || comments) {
                    recordsToRegularize.push({
                        date: date,
                        modified_in: modifyIn,
                        modified_out: modifyOut,
                        reason: reason,
                        comments: comments
                    });
                }
            });
            
            if (recordsToRegularize.length === 0) {
                showToast('No changes to regularize. Please make modifications or provide a reason.', 'warning');
                return;
            }
            
            try {
                const response = await fetch('/regularize_attendance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ records: recordsToRegularize })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showToast('Attendance regularized successfully!', 'success');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('regularizeModal'));
                    if (modal) {
                        modal.hide();
                    }
                    
                    // Update the UI with the modified records
                    result.updated_records.forEach(updatedRecord => {
                        const row = document.querySelector(`tr[data-date="${updatedRecord.date}"]`);
                        if (row) {
                            // Update the actual in/out times in the table
                            const actualInCell = row.cells[4];
                            const actualOutCell = row.cells[5];
                            const statusCell = row.cells[7];
                            
                            if (actualInCell) {
                                actualInCell.textContent = updatedRecord.modified_in || updatedRecord.actual_in;
                            }
                            if (actualOutCell) {
                                actualOutCell.textContent = updatedRecord.modified_out || updatedRecord.actual_out;
                            }
                            if (statusCell) {
                                statusCell.innerHTML = `
                                    <span class="badge bg-primary">
                                        <i class="bi bi-pencil-square me-1"></i>
                                        Regularized
                                    </span>
                                `;
                            }
                        }
                    });
                    
                    // Clear selection
                    this.selectedRecords = [];
                    document.getElementById('selectAllCheckbox').checked = false;
                    document.querySelectorAll('.attendance-checkbox').forEach(checkbox => {
                        checkbox.checked = false;
                    });
                    this.updateRegularizeButton();
                } else {
                    showToast(result.message || 'Failed to regularize attendance', 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('An error occurred while regularizing attendance', 'danger');
            }
        });
    }
}
    };

    attendanceApp.init();

    function showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
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
        const toast = new bootstrap.Toast(document.getElementById(toastId), {
            autohide: true,
            delay: 5000
        });
        toast.show();
        
        document.getElementById(toastId).addEventListener('hidden.bs.toast', function() {
            this.remove();
        });
    }
});