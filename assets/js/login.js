let isSubmitting = false;

// Reuse fetchWithRetry (updated to handle POST)
const fetchWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
  const cacheKey = `data_${url}`; // Cache only for GET; no cache for POST
  const cacheTimestampKey = `${cacheKey}_timestamp`;
  const cacheDuration = parseInt(window.env?.CACHE_DURATION) || 60 * 60 * 1000; // 1 hour

  if (options.method !== 'POST') {
    const cached = localStorage.getItem(cacheKey);
    const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
    const now = Date.now();
    if (cached && cachedTimestamp && now - parseInt(cachedTimestamp) < cacheDuration) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        console.warn("Invalid cached data, fetching fresh:", error);
      }
    }
  }

  const headers = { 'Content-Type': 'application/json', ...options.headers };
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      const data = await response.json();
      if (options.method !== 'POST') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          localStorage.setItem(cacheTimestampKey, now.toString());
        } catch (error) {
          console.warn("Failed to cache data:", error);
        }
      }
      return data;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

function displayError(fieldId, message) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.toggle('hidden', !message);
    errorElement.setAttribute('role', 'alert');
    if (message && fieldId !== 'general') {
      document.getElementById(fieldId).focus();
    }
  }
}

function checkFormValidity() {
  const form = document.getElementById('login-form');
  const saveButton = document.querySelector('.save-btn');
  if (form && saveButton) {
    const username = form.querySelector('#username').value.trim();
    const password = form.querySelector('#password').value.trim();
    const isValidUsername = username.length > 0 && (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) || username.length >= 3);
    const isValidPassword = password.length >= 6;
    saveButton.disabled = !(isValidUsername && isValidPassword);
    // Only show errors on submit, not during typing
    if (form.classList.contains('submitted')) {
      displayError('username', isValidUsername ? '' : 'Enter a valid username or email (min 3 chars)');
      displayError('password', isValidPassword ? '' : 'Password must be at least 6 characters');
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  const form = document.getElementById('login-form');
  form.classList.add('submitted'); // Mark form as submitted to trigger validation
  checkFormValidity(); // Validate on submit
  const saveButton = document.querySelector('.save-btn');
  if (saveButton.disabled) {
    isSubmitting = false;
    return; // Prevent submission if form is invalid
  }

  const loading = document.getElementById('loading');
  loading.classList.remove('hidden');
  document.querySelectorAll('.error-message').forEach(el => el.classList.add('hidden'));
  saveButton.disabled = true;

  const username = DOMPurify.sanitize(document.getElementById('username').value.trim());
  const password = DOMPurify.sanitize(document.getElementById('password').value.trim());
  const baseUrl = window.env?.API_BASE_URL || window.location.origin;

  try {
    const response = await fetchWithRetry(`${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem('jwt_token', response.token);
    const redirectUrl = response.username === 'admin' ? '/admin/manage-movies.html' : '/index.html';
    console.log(`Redirecting to ${redirectUrl} for user: ${response.username}`);
    window.location.href = redirectUrl;
  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = error.message.includes('401') ? 'Invalid username or password' :
                         error.message.includes('500') ? 'Server error—try again later' :
                         'Network error—check your connection';
    displayError('general', errorMessage);
  } finally {
    loading.classList.add('hidden');
    isSubmitting = false;
    saveButton.disabled = false;
    form.classList.remove('submitted');
  }
}

function init() {
  //if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    //console.warn('This page should be served over HTTPS for security.');
    //displayError('general', 'Please use a secure connection (HTTPS).');
    //return;
  //}

  const form = document.getElementById('login-form');
  if (!form) {
    console.error('Login form not found');
    displayError('general', 'Page setup incomplete');
    return;
  }

  // Validate on blur or submit, not input
  form.querySelector('#username').addEventListener('blur', checkFormValidity);
  form.querySelector('#password').addEventListener('blur', checkFormValidity);
  form.addEventListener('submit', handleLogin);
  checkFormValidity();
}

document.addEventListener('DOMContentLoaded', init);