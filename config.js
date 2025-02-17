const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const session = require('express-session');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = 5000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'static')));
app.use(express.static(path.join(__dirname, '/images')));
app.use(express.static(path.join(__dirname, '/styles')));
app.use(express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Require Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    next();
};

app.get('/home', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/about-us', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'about_us.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/profile', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.send('<script>alert("Error logging out"); window.location.href="/home"</script>');
        }
        res.redirect('/');
    });
});

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysql',
    database: 'kosmikos',
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('MySQL connected');

    const CreateTableQuery = "CREATE TABLE IF NOT EXISTS users(id INT AUTO_INCREMENT PRIMARY KEY, f_name VARCHAR(255) NOT NULL, username VARCHAR(255) UNIQUE NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL)";
    
    db.query(CreateTableQuery, (err) => {
        if (err) {
            console.error('Error creating user table:', err);
            return;
        }
        console.log('User table created');
    });

    const CreatePostTableQuery = "CREATE TABLE IF NOT EXISTS posts(id INT AUTO_INCREMENT PRIMARY KEY, type VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    
    db.query(CreatePostTableQuery, (err) => {
        if (err) {
            console.error('Error creating posts table:', err);
            return;
        }
        console.log('Posts table created');
    });
});

// Signup route with validation
app.post('/signup', [
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('confirm_password').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
    body('email').custom((value) => /\.edu$/.test(value)).withMessage('Please use a college email ID')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { f_name, username, email, password } = req.body;

    // Check if username already exists
    const checkUsernameQuery = "SELECT * FROM users WHERE username = ?";
    db.query(checkUsernameQuery, [username], (err, results) => {
        if (err) {
            console.error('Error checking username:', err);
            return res.send('<script>alert("Error Checking Username"); window.location.href="/"</script>');
        }

        if (results.length > 0) {
            return res.send('<script>alert("Username already taken"); window.location.href="/"</script>');
        }

        // Hash password before saving
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) return res.status(500).send('Error hashing password');
            
            // Insert new user into the database
            const query = "INSERT INTO users (f_name, username, email, password) VALUES (?, ?, ?, ?)";
            db.query(query, [f_name, username, email, hashedPassword], (err) => {
                if (err) {
                    console.error('Error signing up:', err);
                    return res.send('<script>alert("Error Signing Up"); window.location.href="/"</script>');
                }

                // Send verification email logic (not modified as per your request)

                res.redirect('/home');
            });
        });
    });
});

// Login route with password hashing
app.post('/', (req, res) => {
    const { email, password } = req.body;

    const query = 'SELECT * FROM users WHERE email = ?';
    db.query(query, [email], (err, results) => {
        if (err) {
            console.error('Error logging in:', err);
            return res.send('<script>alert("Error Logging In"); window.location.href="/"</script>');
        }

        if (results.length > 0) {
            // Compare hashed password
            bcrypt.compare(password, results[0].password, (err, isMatch) => {
                if (err) return res.status(500).send('Error comparing password');
                
                if (isMatch) {
                    req.session.user = results[0];
                    res.redirect('/home');
                } else {
                    res.send('<script>alert("Invalid Email ID or Password"); window.location.href="/"</script>');
                }
            });
        } else {
            res.send('<script>alert("Invalid Email ID or Password"); window.location.href="/"</script>');
        }
    });
});

// Post routes for different types of posts (text, image, video, audio, link)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|mp4|mp3/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        }
        cb('Error: File type not supported');
    },
    limits: { fileSize: 10 * 1024 * 1024 } // Limit to 10MB
});

app.post('/post/text', (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Text content is required' });

    const sql = 'INSERT INTO posts (type, content) VALUES (?, ?)';
    db.query(sql, ['text', content], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.status(201).json({ message: 'Text post added successfully', id: result.insertId });
    });
});

app.post('/post/image', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });

    const imageUrl = `/uploads/${req.file.filename}`;
    const sql = 'INSERT INTO posts (type, content) VALUES (?, ?)';
    db.query(sql, ['image', imageUrl], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.status(201).json({ message: 'Image post added successfully', id: result.insertId, url: imageUrl });
    });
});

app.post('/post/video', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Video file is required' });

    const videoUrl = `/uploads/${req.file.filename}`;
    const sql = 'INSERT INTO posts (type, content) VALUES (?, ?)';
    db.query(sql, ['video', videoUrl], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.status(201).json({ message: 'Video post added successfully', id: result.insertId, url: videoUrl });
    });
});

app.post('/post/audio', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Audio file is required' });

    const audioUrl = `/uploads/${req.file.filename}`;
    const sql = 'INSERT INTO posts (type, content) VALUES (?, ?)';
    db.query(sql, ['audio', audioUrl], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.status(201).json({ message: 'Audio post added successfully', id: result.insertId, url: audioUrl });
    });
});

app.post('/post/link', (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Link is required' });

    const sql = 'INSERT INTO posts (type, content) VALUES (?, ?)';
    db.query(sql, ['link', content], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.status(201).json({ message: 'Link post added successfully', id: result.insertId });
    });
});

// Fetch posts
app.get('/posts', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY created_at DESC';
    db.query(query, (err, posts) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching posts' });
        }
        const postsWithUsernames = posts.map(post => ({
            ...post,
            username: 'User' // Replace with actual logic to fetch the username
        }));
        res.status(200).json(postsWithUsernames);
    });
});

// Fetch user profile data
app.get('/profile-data', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    const query = 'SELECT f_name, username, bio, profile_picture FROM users WHERE id = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching profile data:', err);
            return res.status(500).json({ error: 'Failed to fetch profile data' });
        }
        if (results.length > 0) {
            res.json(results[0]);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    });
});

// Profile Update Route
app.post('/update-profile', upload.single('profile_pic'), (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'User not logged in' });
    }

    const userId = req.session.user.id;
    const { user_name, bio } = req.body;
    const profilePicUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const query = 'UPDATE users SET username = ?, bio = ?, profile_picture = ? WHERE id = ?';
    db.query(query, [user_name, bio, profilePicUrl, userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to update profile' });
        }

        res.status(200).json({ message: 'Profile updated successfully' });
    });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
