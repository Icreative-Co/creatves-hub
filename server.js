const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const host = '0.0.0.0';
const moviesFile = path.join(__dirname, 'assets/data/movies.json');
const config = {
  moviesDir: path.join(__dirname, 'hub/movies'),
  seriesDir: path.join(__dirname, 'hub/series'),
  musicDir: path.join(__dirname, 'hub/music'),
  postersDir: path.join(__dirname, 'hub/posters'),
  backupDir: path.join(__dirname, 'assets/backups')
};
const SECRET_KEY = process.env.SECRET_KEY || '2O/M7YDE9DqaogRkwakLTqOA4W4SptoXFcAnfUTSq18='; // Use .env in production

// In-memory user store (replace with database in production)
const users = [
  {
    id: 1,
    username: 'admin',
    password: '$2b$10$RMrNSr7sCNL8MzlguQyQO.3WFaYg9bWUgklwvxzk9tSqTqlADW.uy' // Hashed "password123"
  }
];

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'http://creatives.net' : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Content Security Policy
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src-attr 'unsafe-inline'; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self' https://cdnjs.cloudflare.com https://unpkg.com; img-src 'self' data:; connect-src 'self';"
  );
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Parse form fields
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// JWT verification middleware
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    if (req.path === '/manage-movies.html') {
      // Redirect to login.html for unauthenticated access to manage-movies.html
      return res.redirect('/login.html');
    }
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (req.path === '/manage-movies.html') {
      // Redirect to login.html for invalid token
      return res.redirect('/login.html');
    }
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

// Multer configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    let uploadDir;
    const category = req.body.category;
    if (!category || !['movie', 'tv-series', 'music'].includes(category)) {
      return cb(new Error('Invalid category: must be movie, tv-series, or music'));
    }
    if (file.fieldname === 'movie_file') {
      uploadDir = category === 'movie' ? config.moviesDir : category === 'tv-series' ? config.seriesDir : config.musicDir;
    } else if (file.fieldname === 'poster_file') {
      uploadDir = config.postersDir;
    } else {
      return cb(new Error('Invalid file field'));
    }
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024,
    fieldSize: 10 * 1024 * 1024,
    fields: 20,
    files: 2,
    parts: 22
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'movie_file' && !file.mimetype.startsWith('video/') && !file.mimetype.startsWith('audio/')) {
      return cb(new Error('Movie file must be video or audio'));
    }
    if (file.fieldname === 'poster_file' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Poster file must be an image'));
    }
    cb(null, true);
  }
}).fields([{ name: 'movie_file', maxCount: 1 }, { name: 'poster_file', maxCount: 1 }]);

// Static file serving
app.use('/hub/movies', express.static(config.moviesDir, { maxAge: '1d' }));
app.use('/hub/series', express.static(config.seriesDir, { maxAge: '1d' }));
app.use('/hub/music', express.static(config.musicDir, { maxAge: '1d' }));
app.use('/hub/posters', express.static(config.postersDir, { maxAge: '1d' }));
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.svg': 'image/svg+xml',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.ico': 'image/x-icon'
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  }
}));
app.use('/', express.static(path.join(__dirname), { maxAge: '1d', index: 'index.html' })); // Default to index.html

// Ensure movies.json exists
async function ensureMoviesFile() {
  try {
    await fs.access(moviesFile);
    const content = await fs.readFile(moviesFile, 'utf8');
    JSON.parse(content);
  } catch (error) {
    console.log('Creating or resetting movies.json');
    await fs.writeFile(moviesFile, JSON.stringify([], null, 2));
  }
}

// Backup movies.json
async function backupMoviesFile() {
  try {
    await fs.mkdir(config.backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(config.backupDir, `movies-backup-${timestamp}.json`);
    await fs.copyFile(moviesFile, backupFile);
    console.log(`Backup created: ${backupFile}`);
  } catch (error) {
    console.error('Failed to create backup:', error);
  }
}

// Validate movie data
async function validateMovie(movie) {
  if (!movie.title) throw new Error('Title is required');
  if (!['movie', 'tv-series', 'music'].includes(movie.category)) throw new Error('Invalid category');
  if (movie.year && !/^\d{4}$/.test(movie.year)) throw new Error('Year must be a 4-digit number');
  if (movie.rating && (isNaN(movie.rating) || movie.rating < 0 || movie.rating > 10)) {
    throw new Error('Rating must be between 0 and 10');
  }
  if (movie.description && movie.description.length > 1000) {
    throw new Error('Description must be 1000 characters or less');
  }
  if (movie.genres) {
    movie.genres = movie.genres.split(',').map(g => g.trim()).filter(g => g);
    if (movie.genres.some(g => g.length > 50)) {
      throw new Error('Each genre must be 50 characters or less');
    }
  } else {
    movie.genres = [];
  }
}

// Login endpoint
app.post('/auth/login', express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign({ userId: user.id }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('POST /auth/login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Protected routes
app.get('/assets/data/movies.json', verifyToken, async (req, res) => {
  try {
    await ensureMoviesFile();
    const movies = JSON.parse(await fs.readFile(moviesFile, 'utf8'));
    res.json(movies);
  } catch (error) {
    console.error('GET /assets/data/movies.json error:', error);
    res.status(500).json({ error: 'Failed to load movies' });
  }
});

app.post('/movies/add', verifyToken, upload, async (req, res) => {
  try {
    if (!req.files || !req.files.movie_file) {
      return res.status(400).json({ error: 'Movie file is required' });
    }
    const movie = {
      title: req.body.title,
      file_path: `/${req.body.category === 'movie' ? 'hub/movies' : req.body.category === 'tv-series' ? 'hub/series' : 'hub/music'}/${req.files.movie_file[0].filename}`,
      poster: req.files.poster_file ? `/hub/posters/${req.files.poster_file[0].filename}` : req.body.poster || '',
      duration: req.body.duration || '',
      year: req.body.year || '',
      rating: req.body.rating || '',
      resolution: req.body.resolution || '',
      category: req.body.category,
      genres: req.body.genres,
      description: req.body.description || ''
    };

    await validateMovie(movie);
    await ensureMoviesFile();
    await backupMoviesFile();
    const movies = JSON.parse(await fs.readFile(moviesFile, 'utf8'));
    movie.id = movies.length ? Math.max(...movies.map(m => m.id)) + 1 : 1;
    movies.push(movie);
    await fs.writeFile(moviesFile, JSON.stringify(movies, null, 2));
    res.json(movie);
  } catch (error) {
    console.error('POST /movies/add error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/movies/edit/:id', verifyToken, upload, async (req, res) => {
  try {
    await ensureMoviesFile();
    const movies = JSON.parse(await fs.readFile(moviesFile, 'utf8'));
    const id = parseInt(req.params.id);
    const index = movies.findIndex(m => m.id === id);
    if (index === -1) return res.status(404).json({ error: 'Movie not found' });

    const oldMovie = movies[index];
    const movie = {
      title: req.body.title,
      file_path: req.files.movie_file
        ? `/${req.body.category === 'movie' ? 'hub/movies' : req.body.category === 'tv-series' ? 'hub/series' : 'hub/music'}/${req.files.movie_file[0].filename}`
        : req.body.file_path || oldMovie.file_path,
      poster: req.files.poster_file ? `/hub/posters/${req.files.poster_file[0].filename}` : req.body.poster || oldMovie.poster,
      duration: req.body.duration || '',
      year: req.body.year || '',
      rating: req.body.rating || '',
      resolution: req.body.resolution || '',
      category: req.body.category,
      genres: req.body.genres,
      description: req.body.description || ''
    };

    await validateMovie(movie);
    await backupMoviesFile();
    movies[index] = { ...movie, id };

    if (req.files.movie_file && oldMovie.file_path) {
      try {
        await fs.unlink(path.join(__dirname, oldMovie.file_path));
      } catch (error) {
        console.warn('Failed to delete old movie file:', error);
      }
    }
    if (req.files.poster_file && oldMovie.poster) {
      try {
        await fs.unlink(path.join(__dirname, oldMovie.poster));
      } catch (error) {
        console.warn('Failed to delete old poster file:', error);
      }
    }

    await fs.writeFile(moviesFile, JSON.stringify(movies, null, 2));
    res.json(movies[index]);
  } catch (error) {
    console.error('POST /movies/edit/:id error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/movies/delete/:id', verifyToken, async (req, res) => {
  try {
    await ensureMoviesFile();
    const movies = JSON.parse(await fs.readFile(moviesFile, 'utf8'));
    const id = parseInt(req.params.id);
    const index = movies.findIndex(m => m.id === id);
    if (index === -1) return res.status(404).json({ error: 'Movie not found' });

    const movie = movies[index];
    if (movie.file_path) {
      try {
        await fs.unlink(path.join(__dirname, movie.file_path));
      } catch (error) {
        console.warn('Failed to delete movie file:', error);
      }
    }
    if (movie.poster) {
      try {
        await fs.unlink(path.join(__dirname, movie.poster));
      } catch (error) {
        console.warn('Failed to delete poster file:', error);
      }
    }

    await backupMoviesFile();
    movies.splice(index, 1);
    await fs.writeFile(moviesFile, JSON.stringify(movies, null, 2));
    res.json({ message: 'Movie deleted' });
  } catch (error) {
    console.error('DELETE /movies/delete/:id error:', error);
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});

// Serve HTML
app.get(['/', '/index.html'], (req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  fs.access(filePath)
    .then(() => res.sendFile(filePath))
    .catch(() => res.status(404).send('index.html not found'));
});

app.get('/login.html', (req, res) => {
  const filePath = path.join(__dirname, 'login.html');
  fs.access(filePath)
    .then(() => res.sendFile(filePath))
    .catch(() => res.status(404).send('login.html not found'));
});

app.get('/manage-movies.html', verifyToken, (req, res) => {
  const filePath = path.join(__dirname, 'manage-movies.html');
  fs.access(filePath)
    .then(() => res.sendFile(filePath))
    .catch(() => res.status(404).send('manage-movies.html not found'));
});

// Favicon
app.get('/favicon.ico', (req, res) => {
  const filePath = path.join(__dirname, 'assets/images/favicon.ico');
  fs.access(filePath)
    .then(() => res.sendFile(filePath))
    .catch(() => res.status(204).end());
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }
  res.status(500).json({ error: 'Server error' });
});

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});