let isSubmitting = false;

function displayError(fieldId, message) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.toggle('hidden', !message);
  }
}

function checkFormValidity() {
  const form = document.getElementById('login-form');
  const saveButton = document.querySelector('.save-btn');
  if (form && saveButton) {
    saveButton.disabled = !form.checkValidity();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  const loading = document.getElementById('loading');
  loading.classList.remove('hidden');
  document.querySelectorAll('.error-message').forEach(el => el.classList.add('hidden'));

  const username = DOMPurify.sanitize(document.getElementById('username').value);
  const password = DOMPurify.sanitize(document.getElementById('password').value);

  console.log('Sending login request:', { username, password });

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }

    const data = await response.json();
    localStorage.setItem('authToken', data.token);
    window.location.href = '/manage-movies.html';
  } catch (error) {
    console.error('Login error:', error);
    displayError('general', error.message);
  } finally {
    loading.classList.add('hidden');
    isSubmitting = false;
  }
}

function init() {
  const form = document.getElementById('login-form');
  if (!form) {
    console.error('Login form not found');
    return;
  }
  form.addEventListener('input', checkFormValidity);
  form.addEventListener('submit', handleLogin);
  checkFormValidity();
}

document.addEventListener('DOMContentLoaded', init);