// Constants
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;

// State
let editingMovieId = null;
let isSubmitting = false;
let sortColumn = null;
let sortDirection = 1;

// DOM Elements
const form = document.getElementById('movie-form');
const saveButton = document.querySelector('.save-btn');
const categorySelect = document.getElementById('category');
const loading = document.getElementById('loading');
const movieTableBody = document.getElementById('movie-table-body');
const progressBarContainer = document.getElementById('progress-bar-container');
const progressBar = document.getElementById('upload-progress');
const progressText = document.getElementById('progress-text');

// Check for missing DOM elements
if (!form) console.error('Form element not found');
if (!saveButton) console.error('Save button not found');
if (!categorySelect) console.error('Category select not found');
if (!loading) console.error('Loading element not found');
if (!movieTableBody) console.error('Movie table body not found');
if (!progressBarContainer) console.error('Progress bar container not found');
if (!progressBar) console.error('Progress bar not found');
if (!progressText) console.error('Progress text not found');

// Display error messages
function displayError(fieldId, message) {
  const errorElement = document.getElementById(fieldId === 'general' ? 'general-error' : `${fieldId}-error`);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.toggle('hidden', !message);
  }
}

// Sanitize form data
function sanitizeFormData(formData) {
  const fields = ['title', 'description', 'genres', 'duration', 'year', 'rating', 'resolution'];
  fields.forEach(field => formData.set(field, DOMPurify.sanitize(formData.get(field) || '')));
}

// Validate movie form
function validateMovieForm(movie) {
  if (!movie.title) return { field: 'title', message: 'Title is required.' };
  if (!editingMovieId && !movie.movie_file) return { field: 'movie_file', message: 'Movie file is required.' };
  if (movie.movie_file && movie.movie_file.size > 500 * 1024 * 1024) {
    return { field: 'movie_file', message: 'Movie file must be under 500MB.' };
  }
  if (movie.movie_file && !movie.movie_file.type.startsWith('video/') && !movie.movie_file.type.startsWith('audio/')) {
    return { field: 'movie_file', message: 'Movie file must be a video or audio file.' };
  }
  if (movie.poster_file && movie.poster_file.size > 10 * 1024 * 1024) {
    return { field: 'poster_file', message: 'Poster file must be under 10MB.' };
  }
  if (movie.poster_file && !movie.poster_file.type.startsWith('image/')) {
    return { field: 'poster_file', message: 'Poster file must be an image.' };
  }
  if (movie.year && isNaN(movie.year)) return { field: 'year', message: 'Year must be a number.' };
  if (movie.rating && (isNaN(movie.rating) || movie.rating < 0 || movie.rating > 10)) {
    return { field: 'rating', message: 'Rating must be a number between 0 and 10.' };
  }
  if (movie.description && movie.description.length > 1000) {
    return { field: 'description', message: 'Description must be 1000 characters or less.' };
  }
  if (!movie.category || !['movie', 'tv-series', 'music'].includes(movie.category)) {
    return { field: 'category', message: 'Please select a valid category.' };
  }
  return null;
}

// Sort movies
function sortMovies(movies) {
  if (!sortColumn) return movies;
  return movies.sort((a, b) => {
    let valA = a[sortColumn] || '';
    let valB = b[sortColumn] || '';
    if (sortColumn === 'genres') {
      valA = (valA || []).join(', ');
      valB = (valB || []).join(', ');
    }
    if (sortColumn === 'id' || sortColumn === 'year' || sortColumn === 'rating') {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
    }
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    return valA < valB ? -sortDirection : valA > valB ? sortDirection : 0;
  });
}

// Check form validity
function checkFormValidity() {
  const isValid = form.checkValidity() && ['movie', 'tv-series', 'music'].includes(categorySelect.value);
  saveButton.disabled = !isValid;
}

// Load movies from server
async function loadMovies() {
  try {
    loading.classList.remove('hidden');
    const response = await fetch('/assets/data/movies.json', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });
    if (!response.ok) throw new Error(`Failed to load movies: ${response.statusText}`);
    const movies = await response.json();
    const sortedMovies = sortMovies(movies);
    movieTableBody.innerHTML = sortedMovies.map(movie => `
      <tr>
        <td>${movie.id}</td>
        <td>${DOMPurify.sanitize(movie.title)}</td>
        <td><img src="${DOMPurify.sanitize(movie.poster || '/assets/images/placeholder.jpg')}" alt="${DOMPurify.sanitize(movie.title)}" onerror="this.src='/assets/images/placeholder.jpg'"></td>
        <td>${DOMPurify.sanitize(movie.year || 'N/A')}</td>
        <td>${DOMPurify.sanitize(movie.duration || 'N/A')}</td>
        <td>${DOMPurify.sanitize(movie.rating || 'N/A')}</td>
        <td>${DOMPurify.sanitize(movie.resolution || 'N/A')}</td>
        <td>${DOMPurify.sanitize(movie.category)}</td>
        <td>${(movie.genres || []).map(g => DOMPurify.sanitize(g)).join(', ')}</td>
        <td>${DOMPurify.sanitize(movie.description || 'N/A')}</td>
        <td class="actions">
          <button class="edit-btn" data-id="${movie.id}">Edit</button>
          <button class="delete-btn" data-id="${movie.id}">Delete</button>
        </td>
      </tr>
    `).join('');
    attachTableButtonListeners();
  } catch (error) {
    console.error('Error loading movies:', error);
    movieTableBody.innerHTML = `<tr><td colspan="11">${error.message}</td></tr>`;
  } finally {
    loading.classList.add('hidden');
  }
}

// Attach event listeners to table buttons
function attachTableButtonListeners() {
  const editButtons = document.querySelectorAll('.edit-btn');
  const deleteButtons = document.querySelectorAll('.delete-btn');
  editButtons.forEach(button => {
    button.addEventListener('click', () => editMovie(parseInt(button.dataset.id, 10)));
  });
  deleteButtons.forEach(button => {
    button.addEventListener('click', () => deleteMovie(parseInt(button.dataset.id, 10)));
  });
}

// Add or update movie
async function addMovie(event) {
  event.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  loading.classList.remove('hidden');
  document.querySelectorAll('.error-message').forEach(el => el.classList.add('hidden'));
  document.getElementById('general-error').classList.add('hidden');

  const formData = new FormData(form);
  const movie = {
    title: formData.get('title'),
    movie_file: formData.get('movie_file'),
    poster_file: formData.get('poster_file'),
    duration: formData.get('duration'),
    year: formData.get('year'),
    rating: formData.get('rating'),
    resolution: formData.get('resolution'),
    category: formData.get('category'),
    genres: formData.get('genres') ? formData.get('genres').split(',').map(g => g.trim()).filter(g => g) : [],
    description: formData.get('description')
  };

  const validationError = validateMovieForm(movie);
  if (validationError) {
    displayError(validationError.field, validationError.message);
    loading.classList.add('hidden');
    isSubmitting = false;
    return;
  }

  sanitizeFormData(formData);

  try {
    progressBarContainer.classList.remove('hidden');
    progressBar.value = 0;
    progressText.textContent = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', editingMovieId ? `/movies/edit/${editingMovieId}` : '/movies/add', true);
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('authToken')}`); // Add token

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        progressBar.value = percent;
        progressText.textContent = `${percent}%`;
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        await loadMovies();
        resetForm();
        alert(editingMovieId ? 'Movie updated successfully!' : 'Movie added successfully!');
      } else {
        const response = JSON.parse(xhr.responseText);
        displayError('general', response.error || 'Failed to save movie');
      }
    };

    xhr.onerror = () => {
      displayError('general', 'Network error occurred');
    };

    xhr.send(formData);
  } catch (error) {
    console.error('Error saving movie:', error);
    displayError('general', error.message);
  } finally {
    loading.classList.add('hidden');
    isSubmitting = false;
  }
}

// Edit movie
async function editMovie(id) {
  try {
    loading.classList.remove('hidden');
    const response = await fetch('/assets/data/movies.json', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });
    if (!response.ok) throw new Error(`Failed to load movies: ${response.statusText}`);
    const movies = await response.json();
    const movie = movies.find(m => m.id === id);
    if (!movie) {
      alert('Movie not found.');
      await loadMovies();
      return;
    }
    editingMovieId = movie.id;
    document.getElementById('title').value = movie.title;
    document.getElementById('movie_file').value = '';
    document.getElementById('movie_file').setAttribute('data-existing-path', movie.file_path || '');
    document.getElementById('movie_file').removeAttribute('required');
    document.getElementById('poster_file').value = '';
    document.getElementById('poster_file').setAttribute('data-existing-path', movie.poster || '');
    document.getElementById('duration').value = movie.duration || '';
    document.getElementById('year').value = movie.year || '';
    document.getElementById('rating').value = movie.rating || '';
    document.getElementById('resolution').value = movie.resolution || '';
    document.getElementById('category').value = movie.category || '';
    document.getElementById('genres').value = (movie.genres || []).join(', ');
    document.getElementById('description').value = movie.description || '';
    document.getElementById('form-title').textContent = 'Edit Movie';
    checkFormValidity();
  } catch (error) {
    console.error('Error loading movie:', error);
    displayError('general', error.message);
  } finally {
    loading.classList.add('hidden');
  }
}

// Delete movie
async function deleteMovie(id) {
  if (!confirm('Are you sure you want to delete this movie?')) return;
  try {
    loading.classList.remove('hidden');
    const response = await fetch(`/movies/delete/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete movie');
    }
    await loadMovies();
    alert('Movie deleted successfully!');
  } catch (error) {
    console.error('Error deleting movie:', error);
    displayError('general', error.message);
  } finally {
    loading.classList.add('hidden');
  }
}

// Reset form
function resetForm() {
  form.reset();
  editingMovieId = null;
  document.getElementById('form-title').textContent = 'Add New Movie';
  document.getElementById('movie_file').setAttribute('data-existing-path', '');
  document.getElementById('movie_file').setAttribute('required', 'true');
  document.getElementById('poster_file').setAttribute('data-existing-path', '');
  progressBarContainer.classList.add('hidden');
  document.querySelectorAll('.error-message').forEach(el => el.classList.add('hidden'));
  document.getElementById('general-error').classList.add('hidden');
  document.getElementById('category').value = '';
  checkFormValidity();
}

// Initialize
function init() {
  // Check authentication
  if (!localStorage.getItem('authToken')) {
    window.location.href = '/login.html';
    return;
  }

  if (!form || !saveButton || !categorySelect || !loading || !movieTableBody) {
    console.error('Required DOM elements are missing');
    return;
  }

  // Add logout button
  const logoutBtn = document.createElement('button');
  logoutBtn.textContent = 'Logout';
  logoutBtn.className = 'btn logout';
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
  });
  document.querySelector('.navbar').appendChild(logoutBtn);

  form.addEventListener('input', checkFormValidity);
  categorySelect.addEventListener('change', checkFormValidity);

  const yearInput = document.getElementById('year');
  const ratingInput = document.getElementById('rating');
  if (yearInput) {
    yearInput.addEventListener('input', (e) => {
      const value = e.target.value;
      displayError('year', value && isNaN(value) ? 'Year must be a number.' : '');
    });
  }
  if (ratingInput) {
    ratingInput.addEventListener('input', (e) => {
      const value = e.target.value;
      displayError('rating', value && (isNaN(value) || value < 0 || value > 10) ? 'Rating must be between 0 and 10.' : '');
    });
  }

  form.addEventListener('submit', addMovie);

  const cancelBtn = document.querySelector('.cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', resetForm);
  } else {
    console.error('Cancel button not found');
  }

  document.querySelectorAll('.movie-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      if (sortColumn === column) {
        sortDirection = -sortDirection;
      } else {
        sortColumn = column;
        sortDirection = 1;
      }
      document.querySelectorAll('.sort-icon').forEach(icon => icon.className = 'sort-icon fa-solid fa-sort');
      th.querySelector('.sort-icon').className = `sort-icon fa-solid fa-sort-${sortDirection > 0 ? 'down' : 'up'}`;
      loadMovies();
    });
  });

  loadMovies();
}

document.addEventListener('DOMContentLoaded', init);