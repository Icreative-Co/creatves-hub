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
const host = process.env.HOST || '0.0.0.0';
const rootDir = path.join(__dirname, '..');
const moviesFile = path.join(rootDir, process.env.MOVIES_FILE_PATH || 'assets/data/movies.json');
const usersFile = path.join(rootDir, process.env.USERS_FILE_PATH || 'assets/data/users.json');
const config = {
  moviesDir: path.join(rootDir, process.env.MOVIES_DIR || 'hub/MOVIES'),
  seriesDir: path.join(rootDir, process.env.SERIES_DIR || 'hub/SERIES'),
  musicDir: path.join(rootDir, process.env.MUSIC_DIR || 'hub/MUSIC'),
  animationsDir: path.join(rootDir, process.env.ANIMATIONS_DIR || 'hub/ANIMATION'),
  postersDir: path.join(rootDir, process.env.POSTERS_DIR || 'hub/POSTERS'),
  backupDir: path.join(rootDir, process.env.BACKUP_DIR || 'assets/backups')
};

// Validate required environment variables
const requiredEnv = ['SECRET_KEY', 'CORS_ORIGIN', 'API_BASE_URL'];
requiredEnv.forEach(key => {
  if (!process.env[key]) {
    throw new Error(`Missing required env variable: ${key}`);
  }
});
const SECRET_KEY = process.env.SECRET_KEY;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const STATIC_MAX_AGE = parseInt(process.env.STATIC_MAX_AGE) || 86400000;

// Add COOP and COEP headers for SharedArrayBuffer support
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Load and hash users from users.json
async function loadUsers() {
  try {
    const data = await fs.readFile(usersFile, 'utf8');
    let users = JSON.parse(data);
    // Hash passwords if not already hashed
    users = await Promise.all(users.map(async (user, index) => {
      if (!user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        return { ...user, id: user.id || index + 1, password: hashedPassword };
      }
      return { ...user, id: user.id || index + 1 };
    }));
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    return users;
  } catch (error) {
    console.log('Creating or resetting users.json');
    const defaultUsers = [
      {
        id: 1,
        username: 'admin',
        email: 'admin@creatives.com',
        password: await bcrypt.hash('admin123', 10)
      },
      {
        id: 2,
        username: 'user1',
        email: 'user1@creatives.com',
        password: await bcrypt.hash('user123', 10)
      }
    ];
    await fs.writeFile(usersFile, JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
}
let users = [];

const corsOrigin = process.env.NODE_ENV === 'production'
  ? process.env.CORS_ORIGIN
  : '*';
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.log(`No token provided for ${req.path}`);
    if (req.path === '/manage-movies.html') {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error) {
    console.log(`Invalid token for ${req.path}: ${error.message}`);
    if (req.path === '/manage-movies.html') {
      return res.redirect('/login.html');
    }
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    let uploadDir;
    const category = req.body.category;
    if (!category || !['movie', 'tv-series', 'music', 'animation'].includes(category)) {
      return cb(new Error('Invalid category: must be movie, tv-series, music, or animation'));
    }
    if (file.fieldname === 'movie_file') {
      uploadDir = category === 'movie' ? config.moviesDir :
                  category === 'tv-series' ? config.seriesDir :
                  category === 'music' ? config.musicDir :
                  config.animationsDir;
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
    fileSize: parseInt(process.env.MULTER_FILE_SIZE_LIMIT) || 500 * 1024 * 1024,
    fieldSize: parseInt(process.env.MULTER_FIELD_SIZE_LIMIT) || 10 * 1024 * 1024,
    fields: parseInt(process.env.MULTER_FIELDS_LIMIT) || 20,
    files: parseInt(process.env.MULTER_FILES_LIMIT) || 2,
    parts: parseInt(process.env.MULTER_PARTS_LIMIT) || 22
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

async function backupMoviesFile() {
  try {
    await fs.mkdir(config.backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(config.backupDir, `movies-backup-${timestamp}.json`);
    await fs.copyFile(moviesFile, backupFile);
    console.log(`Backup created: ${backupFile}`);
    await cleanupOldBackups();
  } catch (error) {
    console.error('Failed to create backup:', error);
  }
}

async function cleanupOldBackups(maxBackups = 10) {
  try {
    const backups = (await fs.readdir(config.backupDir)).sort().reverse();
    if (backups.length > maxBackups) {
      for (const file of backups.slice(maxBackups)) {
        await fs.unlink(path.join(config.backupDir, file));
      }
    }
  } catch (error) {
    console.error('Failed to clean up old backups:', error);
  }
}

async function validateMovie(movie) {
  if (!movie.title || movie.title.trim() === '') throw new Error('Title is required');
  if (!['movie', 'tv-series', 'music', 'animation'].includes(movie.category)) throw new Error('Invalid category');
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

const sendError = (res, status, message) => {
  res.status(status).json({ error: message });
};

const configRouter = express.Router({ strict: true });
configRouter.get('/config', (req, res) => {
  console.log('Serving /config endpoint');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`
    window.env = {
      CACHE_DURATION: "${process.env.CACHE_DURATION || '3600000'}",
      API_BASE_URL: "${process.env.API_BASE_URL || 'http://localhost:3000'}",
      FALLBACK_VIDEO_PATH: "${process.env.FALLBACK_VIDEO_PATH || '/assets/video/fallback.mp4'}"
    };
  `);
});
configRouter.get('/config/', (req, res) => {
  res.status(404).json({ error: 'Not found: Use /config instead of /config/' });
});
app.use('/', configRouter);

// Login endpoint supporting username or email
app.post('/auth/login', express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      console.log('Login attempt with missing fields:', { username: !!username, password: !!password });
      return sendError(res, 400, 'Username or email and password are required');
    }
    const user = users.find(u => u.username === username || u.email === username);
    if (!user) {
      console.log(`Login failed: No user found for username/email: ${username}`);
      return sendError(res, 401, 'Invalid username or email');
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log(`Login failed: Invalid password for user: ${user.username}`);
      return sendError(res, 401, 'Invalid password');
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, SECRET_KEY, { expiresIn: JWT_EXPIRES_IN });
    console.log(`Login successful for user: ${user.username}, token issued`);
    res.json({ token, username: user.username });
  } catch (error) {
    console.error('POST /auth/login error:', error);
    sendError(res, 500, 'Server error');
  }
});

app.get('/assets/data/movies.json', async (req, res) => {
  try {
    await ensureMoviesFile();
    const movies = JSON.parse(await fs.readFile(moviesFile, 'utf8'));
    res.json(movies);
  } catch (error) {
    console.error('GET /assets/data/movies.json error:', error);
    sendError(res, 500, 'Failed to load movies');
  }
});

// Restrict access to users.json
app.get('/assets/data/users.json', (req, res) => {
  console.log('Attempted access to restricted /assets/data/users.json');
  sendError(res, 403, 'Access to user data is restricted');
});

app.use('/hub/movies', express.static(config.moviesDir, { maxAge: STATIC_MAX_AGE }));
app.use('/hub/series', express.static(config.seriesDir, { maxAge: STATIC_MAX_AGE }));
app.use('/hub/music', express.static(config.musicDir, { maxAge: STATIC_MAX_AGE }));
app.use('/hub/animations', express.static(config.animationsDir, { maxAge: STATIC_MAX_AGE }));
app.use('/hub/posters', express.static(config.postersDir, { maxAge: STATIC_MAX_AGE }));
app.use('/assets', express.static(path.join(rootDir, 'assets'), {
  maxAge: STATIC_MAX_AGE,
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
    if (ext === '.js') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.use('/', express.static(rootDir, { maxAge: STATIC_MAX_AGE, index: 'index.html' }));

// Explicit route for index.html to ensure no auth check
app.get('/index.html', (req, res) => {
  const filePath = path.join(rootDir, 'index.html');
  fs.access(filePath)
    .then(() => res.sendFile(filePath))
    .catch(() => {
      console.log(`index.html not found at: ${filePath}`);
      res.status(404).send('index.html not found');
    });
});

app.post('/movies/add', verifyToken, upload, async (req, res) => {
  try {
    if (!req.files || !req.files.movie_file) {
      return sendError(res, 400, 'Movie file is required');
    }
    const movie = {
      title: req.body.title,
      file_path: `/${req.body.category === 'movie' ? 'hub/movies' : req.body.category === 'tv-series' ? 'hub/series' : req.body.category === 'music' ? 'hub/music' : 'hub/animations'}/${req.files.movie_file[0].filename}`,
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
    sendError(res, 400, error.message);
  }
});

app.post('/movies/edit/:id', verifyToken, upload, async (req, res) => {
  try {
    await ensureMoviesFile();
    const movies = JSON.parse(await fs.readFile(moviesFile, 'utf8'));
    const id = parseInt(req.params.id);
    const index = movies.findIndex(m => m.id === id);
    if (index === -1) return sendError(res, 404, 'Movie not found');

    const oldMovie = movies[index];
    const movie = {
      title: req.body.title,
      file_path: req.files.movie_file
        ? `/${req.body.category === 'movie' ? 'hub/movies' : req.body.category === 'tv-series' ? 'hub/series' : req.body.category === 'music' ? 'hub/music' : 'hub/animations'}/${req.files.movie_file[0].filename}`
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
        await fs.unlink(path.join(rootDir, oldMovie.file_path.slice(1)));
      } catch (error) {
        console.warn('Failed to delete old movie file:', error);
      }
    }
    if (req.files.poster_file && oldMovie.poster) {
      try {
        await fs.unlink(path.join(rootDir, oldMovie.poster.slice(1)));
      } catch (error) {
        console.warn('Failed to delete old poster file:', error);
      }
    }

    await fs.writeFile(moviesFile, JSON.stringify(movies, null, 2));
    res.json(movies[index]);
  } catch (error) {
    console.error('POST /movies/edit/:id error:', error);
    sendError(res, 400, error.message);
  }
});

app.delete('/movies/delete/:id', verifyToken, async (req, res) => {
  try {
    await ensureMoviesFile();
    const movies = JSON.parse(await fs.readFile(moviesFile, 'utf8'));
    const id = parseInt(req.params.id);
    const index = movies.findIndex(m => m.id === id);
    if (index === -1) return sendError(res, 404, 'Movie not found');

    const movie = movies[index];
    if (movie.file_path) {
      try {
        await fs.unlink(path.join(rootDir, movie.file_path.slice(1)));
      } catch (error) {
        console.warn('Failed to delete movie file:', error);
      }
    }
    if (movie.poster) {
      try {
        await fs.unlink(path.join(rootDir, movie.poster.slice(1)));
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
    sendError(res, 500, 'Failed to delete movie');
  }
});

app.get('/login.html', (req, res) => {
  const filePath = path.join(rootDir, 'login.html');
  fs.access(filePath)
    .then(() => res.sendFile(filePath))
    .catch(() => {
      console.log(`login.html not found at: ${filePath}`);
      res.status(404).send('login.html not found');
    });
});

app.get('/manage-movies.html', verifyToken, (req, res) => {
  const filePath = path.join(rootDir, 'admin/manage-movies.html');
  fs.access(filePath)
    .then(() => res.sendFile(filePath))
    .catch(() => {
      console.log(`manage-movies.html not found at: ${filePath}`);
      res.status(404).send('manage-movies.html not found');
    });
});

app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(rootDir, 'assets/images/favicon.ico');
  fs.access(faviconPath)
    .then(() => res.sendFile(faviconPath))
    .catch(() => {
      console.log('Favicon not found at:', faviconPath);
      res.status(404).send('Favicon not found');
    });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err instanceof multer.MulterError) {
    return sendError(res, 400, `File upload error: ${err.message}`);
  }
  sendError(res, 500, 'Server error');
});

// Initialize movies.json and users.json
Promise.all([ensureMoviesFile(), loadUsers().then(data => { users = data; })]).then(() => {
  app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
  });
}).catch(error => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
});