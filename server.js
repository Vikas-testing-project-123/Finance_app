const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aura_finance_super_secret_key_123';
const DB_FILE = path.join(__dirname, 'finance.db');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Ensure large JSON payloads can be saved
app.use(express.static(__dirname)); // Serve static files from the project root

// Initialize SQLite database
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    createTables();
  }
});

function createTables() {
  db.serialize(() => {
    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        openingBalance REAL DEFAULT 0,
        createdAt TEXT NOT NULL
      )
    `);

    // Create user_data table for Option A storage
    db.run(`
      CREATE TABLE IF NOT EXISTS user_data (
        userId TEXT PRIMARY KEY,
        tablesJson TEXT NOT NULL,
        lastUpdated TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  });
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing session token' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid session credentials' });
    }
    req.user = user;
    next();
  });
}

// Helper: Format Date
function formatDate() {
  const d = new Date();
  const month = '' + (d.getMonth() + 1);
  const day = '' + d.getDate();
  const year = d.getFullYear();
  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

// Endpoints

// 1. User Registration
app.post('/api/auth/register', (req, res) => {
  const { username, password, openingBalance } = req.body;

  if (!username || username.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Username must be at least 2 characters.' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
  }

  const normalizedUsername = username.trim().toLowerCase();

  // Check if username is taken
  db.get('SELECT id FROM users WHERE LOWER(username) = ?', [normalizedUsername], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error occurred.' });
    }
    if (row) {
      return res.status(400).json({ success: false, error: 'Username is already taken.' });
    }

    // Hash password and insert user
    const userId = 'usr_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
    const passwordHash = bcrypt.hashSync(password, 10);
    const createdAt = formatDate();
    const balance = parseFloat(openingBalance || 0);

    db.run(
      'INSERT INTO users (id, username, passwordHash, openingBalance, createdAt) VALUES (?, ?, ?, ?, ?)',
      [userId, username.trim(), passwordHash, balance, createdAt],
      function (err) {
        if (err) {
          return res.status(500).json({ success: false, error: 'Failed to create user account.' });
        }

        // Return token
        const token = jwt.sign({ id: userId, username: username.trim() }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
          success: true,
          data: { token, username: username.trim(), userId }
        });
      }
    );
  });
});

// 2. User Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const normalizedUsername = username.trim().toLowerCase();

  db.get('SELECT * FROM users WHERE LOWER(username) = ?', [normalizedUsername], (err, user) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error occurred.' });
    }
    if (!user) {
      return res.status(400).json({ success: false, error: 'User not found.' });
    }

    // Verify password (bypass password check for demo user if configured, but secure otherwise)
    const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, error: 'Invalid username or password.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true,
      data: { token, username: user.username }
    });
  });
});

// 3. Get User Financial Database JSON
app.get('/api/database', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.get('SELECT tablesJson FROM user_data WHERE userId = ?', [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to retrieve database storage.' });
    }
    if (!row) {
      // User data does not exist yet (first login)
      return res.json({ success: true, data: null });
    }
    try {
      const parsedData = JSON.parse(row.tablesJson);
      res.json({ success: true, data: parsedData });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Stored database file corrupted.' });
    }
  });
});

// 4. Save User Financial Database JSON
app.post('/api/database', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { tables } = req.body;

  if (!tables) {
    return res.status(400).json({ success: false, error: 'Missing database tables payload.' });
  }

  const tablesJson = JSON.stringify(tables);
  const lastUpdated = new Date().toISOString();

  db.run(
    'INSERT INTO user_data (userId, tablesJson, lastUpdated) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET tablesJson = excluded.tablesJson, lastUpdated = excluded.lastUpdated',
    [userId, tablesJson, lastUpdated],
    function (err) {
      if (err) {
        console.error('Save database error:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to write data to database.' });
      }
      res.json({ success: true });
    }
  );
});

// Serve frontend routing fallback (for Single Page Application routes if needed, although app is hash-routed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`AuraFinance Backend Server running at http://localhost:${PORT}`);
});
