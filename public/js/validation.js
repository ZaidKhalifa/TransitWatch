(function () {
    // Validation Functions

    const validateString = (str, strName = 'Field') => {
        if (str === undefined || str === null) {
            throw `${strName} is required`;
        }
        if (typeof str !== 'string') {
            throw `${strName} must be a string`;
        }
        str = str.trim();
        if (str.length === 0) {
            throw `${strName} cannot be empty`;
        }
        return str;
    };

    const validateName = (name, strName = 'Name') => {
        name = validateString(name, strName);
        if (!/^[a-zA-Z]+$/.test(name)) {
            throw `${strName} must contain only letters with no spaces or numbers`;
        }
        if (name.length < 2 || name.length > 20) {
            throw `${strName} must be between 2 and 20 characters long`;
        }
        return name;
    };

    const validateEmail = (email) => {
        email = validateString(email, 'Email');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw 'Please enter a valid email address';
        }
        return email;
    };

    const validateUserId = (userId) => {
        userId = validateString(userId, 'Username');
        if (!/^[a-zA-Z0-9]+$/.test(userId)) {
            throw 'Username must contain only letters and numbers';
        }
        if (userId.length < 4 || userId.length > 10) {
            throw 'Username must be between 4 and 10 characters long';
        }
        return userId;
    };

    const validatePassword = (pass, strName = 'Password') => {
        if (pass === undefined || pass === null) {
            throw `${strName} is required`;
        }
        if (typeof pass !== 'string') {
            throw `${strName} must be a string`;
        }
        if (/\s/.test(pass)) {
            throw `${strName} cannot contain spaces`;
        }
        if (pass.length < 8) {
            throw `${strName} must be at least 8 characters long`;
        }
        return pass;
    };

    const validateDob = (dob) => {
        dob = validateString(dob, 'Date of birth');
        
        // Check format YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            throw 'Date must be in YYYY-MM-DD format';
        }

        const dobDate = new Date(dob);
        const today = new Date();
        
        if (isNaN(dobDate.getTime())) {
            throw 'Invalid date';
        }

        if (dobDate > today) {
            throw 'Date of birth cannot be in the future';
        }

        // Check minimum date (1920)
        const minDate = new Date('1920-01-01');
        if (dobDate < minDate) {
            throw 'Date of birth must be after 1920';
        }

        let age = today.getFullYear() - dobDate.getFullYear();
        const monthDiff = today.getMonth() - dobDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
            age--;
        }

        if (age < 13) {
            throw 'You must be at least 13 years old to register';
        }

        return dob;
    };

    // Error Display Functions

    const showFieldError = (fieldId, message) => {
        const field = document.getElementById(fieldId);
        const errorSpan = document.getElementById(`${fieldId}-error`);

        if (field) {
            field.classList.add('input-error');
        }
        if (errorSpan) {
            errorSpan.textContent = message;
            errorSpan.classList.remove('hidden');
        }
    };

    const clearFieldError = (fieldId) => {
        const field = document.getElementById(fieldId);
        const errorSpan = document.getElementById(`${fieldId}-error`);

        if (field) {
            field.classList.remove('input-error');
        }
        if (errorSpan) {
            errorSpan.textContent = '';
            errorSpan.classList.add('hidden');
        }
    };

    const clearAllErrors = (fieldIds) => {
        fieldIds.forEach(fieldId => clearFieldError(fieldId));
    };

    // Input Event Listeners

    const addInputListener = (fieldId) => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => {
                clearFieldError(fieldId);
            });
            field.addEventListener('change', () => {
                clearFieldError(fieldId);
            });
        }
    };

    // Login Form Validation

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const loginFields = ['userId', 'password'];
        loginFields.forEach(fieldId => addInputListener(fieldId));

        loginForm.addEventListener('submit', function (event) {
            clearAllErrors(loginFields);
            let hasErrors = false;

            const userId = document.getElementById('userId').value;
            const password = document.getElementById('password').value;

            try {
                validateUserId(userId);
            } catch (e) {
                showFieldError('userId', e);
                hasErrors = true;
            }

            try {
                validatePassword(password);
            } catch (e) {
                showFieldError('password', e);
                hasErrors = true;
            }

            if (hasErrors) {
                event.preventDefault();
                // Focus on first error
                const firstError = document.querySelector('.input-error');
                if (firstError) {
                    firstError.focus();
                }
                return false;
            }
        });
    }

    // Register Form Validation

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        const registerFields = [
            'firstName',
            'lastName',
            'email',
            'userId',
            'dob',
            'password',
            'confirmPassword'
        ];

        registerFields.forEach(fieldId => addInputListener(fieldId));

        registerForm.addEventListener('submit', function (event) {
            clearAllErrors(registerFields);
            let hasErrors = false;

            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            const email = document.getElementById('email').value;
            const userId = document.getElementById('userId').value;
            const dob = document.getElementById('dob').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            try {
                validateName(firstName, 'First name');
            } catch (e) {
                showFieldError('firstName', e);
                hasErrors = true;
            }

            try {
                validateName(lastName, 'Last name');
            } catch (e) {
                showFieldError('lastName', e);
                hasErrors = true;
            }

            try {
                validateEmail(email);
            } catch (e) {
                showFieldError('email', e);
                hasErrors = true;
            }

            try {
                validateUserId(userId);
            } catch (e) {
                showFieldError('userId', e);
                hasErrors = true;
            }

            try {
                validateDob(dob);
            } catch (e) {
                showFieldError('dob', e);
                hasErrors = true;
            }

            try {
                validatePassword(password, 'Password');
            } catch (e) {
                showFieldError('password', e);
                hasErrors = true;
            }

            try {
                validatePassword(confirmPassword, 'Confirm password');
            } catch (e) {
                showFieldError('confirmPassword', e);
                hasErrors = true;
            }

            if (!document.getElementById('password').classList.contains('input-error') &&
                !document.getElementById('confirmPassword').classList.contains('input-error')) {
                if (password !== confirmPassword) {
                    showFieldError('confirmPassword', 'Passwords do not match');
                    hasErrors = true;
                }
            }

            if (hasErrors) {
                event.preventDefault();
                const firstError = document.querySelector('.input-error');
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstError.focus();
                }
                return false;
            }
        });
    }

    const passwordField = document.getElementById('password');
    const confirmPasswordField = document.getElementById('confirmPassword');

    if (passwordField && confirmPasswordField) {
        const checkPasswordMatch = () => {
            const password = passwordField.value;
            const confirmPassword = confirmPasswordField.value;

            if (confirmPassword.length > 0) {
                if (password !== confirmPassword) {
                    showFieldError('confirmPassword', 'Passwords do not match');
                } else {
                    clearFieldError('confirmPassword');
                }
            }
        };

        passwordField.addEventListener('input', checkPasswordMatch);
        confirmPasswordField.addEventListener('input', checkPasswordMatch);
    }

    // Accessibility: Enter key navigation

    document.querySelectorAll('.form-input').forEach((input, index, inputs) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.type !== 'submit') {
                e.preventDefault();
                const nextInput = inputs[index + 1];
                if (nextInput) {
                    nextInput.focus();
                } else {
                    // If last input, submit the form
                    const form = input.closest('form');
                    if (form) {
                        form.querySelector('[type="submit"]')?.click();
                    }
                }
            }
        });
    });

    //Report Form Validation
    document.addEventListener('DOMContentLoaded', () => {
        const reportForm = document.getElementById('reportForm');
        if(!reportForm) return;

        reportForm.addEventListener('submit', (e) => {
            const stationId = reportForm.stationId.value.trim();
            const stationName = reportForm.stationName.value.trim();
            const issueType = reportForm.issueType.value;
            const description = reportForm.description.value.trim();
            let valid = true;
            if(!stationId){
                alert('Please enter a station ID.');
                valid = false;
            }
            else if(!/^([A-Z_0-9]+)$/.test(stationId)){
                alert('Station ID must be uppercase letters, underscores, or digits.');
                valid = false;
            }

            if(!stationName){
                alert('Please enter the station name.');
                valid = false;
            }
            if(!issueType){
                alert('Please select an issue type.');
                valid = false;
            }

            if(!description || description.length < 5){
                alert('Description must be at least 5 characters long.');
                valid = false;
            }

            if(!valid) e.preventDefault();
        });
    });

    document.addEventListener('DOMContentLoaded', () => {
        const reportForm = document.getElementById('reportForm');
        if(!reportForm) return;
        const stopSearch = document.getElementById('stopSearch');
        const stopSelect = document.getElementById('stopSelect');
        const addStopBtn = document.getElementById('addStopBtn');
        const selectedStopsContainer = document.getElementById('selectedStops');
        const severityInput = document.getElementById('severity');
        const severityValue = document.getElementById('severityValue');
        if(severityInput && severityValue) {
            const updateSeverityLabel = () => {
                severityValue.textContent = `(${severityInput.value})`;
            };
            updateSeverityLabel();
            severityInput.addEventListener('input', updateSeverityLabel);
        }
        if(stopSearch && stopSelect) {
            stopSearch.addEventListener('input', () => {
                const term = stopSearch.value.toLowerCase();
                Array.from(stopSelect.options).forEach((opt) => {
                    const text = opt.textContent.toLowerCase();
                    opt.hidden = term && !text.includes(term);
                });
            });
        }
        const isStopAlreadySelected = (value) => {
            const existing = selectedStopsContainer.querySelector( `.selected-stop-chip input[value="${value.replace(/"/g, '\\"')}"]`);
            return !!existing;
        };
        if(addStopBtn && stopSelect && selectedStopsContainer) {
            addStopBtn.addEventListener('click', () => {
                const selectedOptions = Array.from(stopSelect.selectedOptions);
                selectedOptions.forEach((opt) => {
                    const value = opt.value;
                    const label = opt.textContent;
                    if (isStopAlreadySelected(value))
                        return;
                    const chip = document.createElement('div');
                    chip.className = 'selected-stop-chip';
                    chip.dataset.value = value;
                    chip.innerHTML = ` <span>${label}</span> <button type="button" class="remove-stop-btn">×</button> <input type="hidden" name="stops" value="${value}"> `;
                    selectedStopsContainer.appendChild(chip);
                });
            });
            selectedStopsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.remove-stop-btn');
                if(!btn)
                    return;
                const chip = btn.closest('.selected-stop-chip');
                if(chip)
                    chip.remove();
            });
        }
        reportForm.addEventListener('submit', (e) => {
            const chips = selectedStopsContainer.querySelectorAll('.selected-stop-chip');
            if(!chips.length){
                e.preventDefault();
                alert('Please select at least one stop.');
                return;
            }
            const description = reportForm.description.value.trim();
            if(description.length < 5){
                e.preventDefault();
                alert('Description must be at least 5 characters.');
            }
        });
    });

})();